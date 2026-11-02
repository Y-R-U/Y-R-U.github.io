// Ghost AI shot planner. Given a built hole and the ball's rest spot, pick an aim (heading, radians,
// 0 = -Z, vx = sin, vz = -cos, same as Round.debugShoot) and a power 0..1 (→ shotSpeed) by simulating
// candidate shots with the real 240 Hz physics:
//   1. coarse grid of headings x powers around the route ahead (and straight at the cup when near),
//   2. pattern-search refinement around the best few,
//   3. robustness: re-run the finalists under small aim / power / timing noise and aggregate the
//      costs with the golfer's risk weights (worst / mean / best).
// Cost ≈ expected strokes still to play after this one (0 = holed), from the along-track distance
// field, plus personality terms (OOB penalty, bank-shot bonus, power bonus, hole-out bonus).
// The budget is in physics steps, so a plan is deterministic on every device; `budgetMs` adds an
// optional wall-clock cap (non-deterministic, for the game on slow phones). Node-safe, no THREE.
import { DT, shotSpeed, SHOT_CURVE } from '../engine/constants.js';
import { Ball } from '../engine/physics.js';
import { makeWorld } from '../course/builder.js';
import { buildPathField } from './pathfield.js';

const D2R = Math.PI / 180;
const MAX_SIM_STEPS = 240 * 15;        // a shot still rolling after 15 s is scored where it is
const now = () => (globalThis.performance ? performance.now() : Date.now());

// Expected strokes to hole out from along-track distance d (m). Tuned against tools/ai_test.mjs.
export function strokesFrom(d) {
  if (d <= 0.12) return 1;
  return 1 + Math.min(1, (d - 0.12) / 1.3) * 0.5 + Math.max(0, d - 1.42) / 3.2;
}

export const DEFAULT_STYLE = {
  budget: 60000,          // physics steps per plan (≈ 2.4 µs each on an M-series Mac in node)
  budgetMs: 0,            // optional wall-clock cap (0 = off)
  wOob: 1.0,              // extra cost of going out of bounds on top of the stroke penalty
  wBank: 0,               // bonus per wall bounce (max 3) on a shot that stays in
  wPower: 0,              // bonus for power (Bertha)
  wHole: 0,               // extra bonus for holing out (aggressive golfers "go for it")
  layup: 0,               // > 0: from further than this (m) a make is valued only as a tap-in leave (Carl)
  risk: { worst: 0.25, mean: 0.75, best: 0 },   // how robustness samples are aggregated
  sense: { aim: 1.2 * D2R, power: 0.04, time: 0.05 },   // perturbation used for robustness
  span: 75,               // degrees either side of the route heading in the coarse grid
  pMin: 0.04, pMax: 1.0,  // power range searched
  waits: [0, 0.35, 0.7, 1.05],  // extra wait times tried on holes with moving parts
};

export class Planner {
  constructor(hole, { world } = {}) {
    this.hole = hole;
    this.world = world || makeWorld(hole);
    this.field = buildPathField(hole);
    this.kinematic = hole.kinematics.length > 0;
    this.oobY = hole.bounds.min[1] - 0.25;   // nothing playable is this low: early out-of-bounds
    this._cacheKey = null; this._cache = new Map();
  }

  // Run one shot from `ball` (Ball or {x,y,z}). Returns { state, x, y, z, walls, steps, ball }.
  simulate(ball, aim, power, t0 = 0, { trace = 0 } = {}) {
    const w = this.world;
    const b = ball instanceof Ball ? ball.clone() : new Ball(ball.x, ball.y, ball.z);
    b.events = [];
    const sp = shotSpeed(power);
    w.shoot(b, Math.sin(aim) * sp, -Math.cos(aim) * sp);
    const path = trace ? [b.px, b.py, b.pz] : null;
    let t = t0, n = 0, walls = 0;
    const events = trace ? [] : null;
    while (b.state === 'moving' && n < MAX_SIM_STEPS) {
      w.stepBall(b, t); t += DT; n++;
      if (b.events.length) {
        for (const e of b.events) {
          if (e.type === 'wall' || e.type === 'obstacle') walls++;
          if (events && e.type !== 'rest') events.push({ step: n, type: e.type, speed: e.speed ?? 0 });
        }
        b.events.length = 0;
      }
      if (b.state === 'moving' && b.py < this.oobY) b.state = 'oob';
      if (trace && n % trace === 0) path.push(b.px, b.py, b.pz);
    }
    if (trace && n % trace !== 0) path.push(b.px, b.py, b.pz);
    if (b.state === 'moving') { b.vx = b.vy = b.vz = 0; b.state = 'rest'; }
    return { state: b.state, x: b.px, y: b.py, z: b.pz, walls, steps: n, ball: b, path, events, t1: t };
  }

  // Plan one shot. style: see DEFAULT_STYLE. Returns { aim, power, wait, cost, expect, sims, steps, ms }.
  plan(ball, { t0 = 0, ...styleIn } = {}) {
    const st = { ...DEFAULT_STYLE, ...styleIn, risk: { ...DEFAULT_STYLE.risk, ...styleIn.risk }, sense: { ...DEFAULT_STYLE.sense, ...styleIn.sense } };
    const start = ball instanceof Ball ? ball : new Ball(ball.x, ball.y, ball.z);
    const F = this.field;
    const t00 = now();
    const budget = st.budget;
    let steps = 0, sims = 0, hits = 0;
    const dStart = F.dist(start.px, start.py, start.pz);
    const eStart = strokesFrom(dStart);

    // per-start-spot sim cache (shared by every golfer that plans from this spot, e.g. the tee)
    const key = `${start.px.toFixed(4)},${start.py.toFixed(4)},${start.pz.toFixed(4)}`;
    if (key !== this._cacheKey) { this._cacheKey = key; this._cache.clear(); }
    const cache = this._cache;
    const q = v => Math.round(v * 1e4);
    const outOfTime = frac => steps >= budget * frac || (st.budgetMs && now() - t00 > st.budgetMs * frac);

    const run = (aim, power, wait) => {
      power = Math.max(st.pMin, Math.min(st.pMax, power));
      const k = this.kinematic ? `${q(aim)}|${q(power)}|${q(t0 + wait)}` : `${q(aim)}|${q(power)}`;
      let r = cache.get(k);
      if (!r) {
        const s = this.simulate(start, aim, power, t0 + wait);
        r = { state: s.state, x: s.x, y: s.y, z: s.z, walls: s.walls, steps: s.steps };
        cache.set(k, r);
        sims++;
      } else hits++;
      // cached sims still count against the budget: the plan must not depend on what was planned before
      steps += r.steps;
      return r;
    };
    const costOf = (r, power) => {
      let c;
      if (r.state === 'cup') c = st.layup && dStart > st.layup ? strokesFrom(0.6) : -st.wHole;
      else if (r.state === 'oob') c = 1 + st.wOob + eStart;
      else {
        const d = F.dist(r.x, r.y, r.z);
        // a lay-up golfer from distance aims to leave it ~0.4 m short, not to hole it
        c = st.layup && dStart > st.layup ? strokesFrom(Math.abs(d - 0.4) + 0.12) : strokesFrom(d);
        if (d > dStart + 0.05) c += 0.3 * (d - dStart);   // went backwards
      }
      if (r.state !== 'oob') c -= st.wBank * Math.min(3, r.walls) * 0.1;
      c -= st.wPower * power * 0.25;
      return c;
    };
    const evalC = (cand) => { cand.power = Math.max(st.pMin, Math.min(st.pMax, cand.power)); const r = run(cand.aim, cand.power, cand.wait); cand.r = r; cand.c = costOf(r, cand.power); return cand; };

    // ---- 1. coarse grid
    const look = Math.min(2.5, dStart);
    const tp = F.aheadPoint(start.px, start.py, start.pz, look);
    let base = Math.atan2(tp[0] - start.px, -(tp[2] - start.pz));
    const cup = this.hole.cup;
    const cupAim = Math.atan2(cup.x - start.px, -(cup.z - start.pz));
    const straight = Math.hypot(cup.x - start.px, cup.z - start.pz);
    const nSims = Math.max(12, Math.floor((budget * 0.5) / 700));
    const nP = Math.max(3, Math.min(9, Math.round(Math.sqrt(nSims / 2.4))));
    const nA = Math.max(5, Math.min(31, Math.floor(nSims / nP) | 1));
    const aStep = (2 * st.span / (nA - 1)) * D2R;
    const powers = [];
    for (let k = 1; k <= nP; k++) {   // spaced evenly in roll distance (∝ v²)
      const v = shotSpeed(st.pMax) * Math.sqrt(k / nP);
      powers.push(powerFor(v));
    }
    // a putt-weight guess for the distance to the cup
    powers.push(powerFor(Math.sqrt(2 * 0.85 * Math.max(0.05, dStart)) + 0.15));
    const angles = [];
    for (let i = 0; i < nA; i++) {   // centre first, then alternating out
      const k = Math.ceil(i / 2) * (i % 2 ? 1 : -1);
      angles.push(base + k * aStep);
    }
    if (straight < 3.5 && Math.abs(wrap(cupAim - base)) > aStep / 2) angles.splice(1, 0, cupAim, cupAim - aStep / 3, cupAim + aStep / 3);
    let pool = [];
    outer: for (const a of angles) for (const p of powers) {
      if (outOfTime(0.5)) break outer;
      pool.push(evalC({ aim: a, power: p, wait: 0 }));
    }
    pool.sort((x, y) => x.c - y.c);
    const pStep = 1 / nP;

    // ---- 1b. timing: try other start times for the best few
    if (this.kinematic && st.waits.length > 1) {
      const top = distinct(pool, 4, aStep, pStep);
      for (const c of top) for (const wt of st.waits) {
        if (!wt || outOfTime(0.6)) continue;
        pool.push(evalC({ aim: c.aim, power: c.power, wait: wt }));
      }
      pool.sort((x, y) => x.c - y.c);
    }

    // ---- 2. refinement: pattern search around the best distinct candidates
    const seeds = distinct(pool, 3, aStep, pStep).map(c => ({ ...c, da: aStep / 2, dp: pStep / 2 }));
    let active = seeds.length;
    let guard = 0;
    while (active && !outOfTime(0.8) && guard++ < 200) {
      active = 0;
      for (const s of seeds) {
        if (s.da < 0.15 * D2R && s.dp < 0.004) continue;
        active++;
        let moved = false;
        for (const [ea, ep] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (outOfTime(0.8)) break;
          const n = evalC({ aim: s.aim + ea * s.da, power: s.power + ep * s.dp, wait: s.wait });
          pool.push(n);
          if (n.c < s.c - 1e-6) { Object.assign(s, { aim: n.aim, power: n.power, c: n.c, r: n.r }); moved = true; }
        }
        if (!moved) { s.da *= 0.5; s.dp *= 0.5; }
      }
    }
    pool.sort((x, y) => x.c - y.c);

    // ---- 3. robustness
    const fin = distinct(pool, 4, st.sense.aim * 1.5, st.sense.power * 1.5);
    const R = st.risk, sa = st.sense.aim, sp = st.sense.power, sw = this.kinematic ? st.sense.time : 0;
    for (const c of fin) {
      const cs = [c.c];
      const offs = [[sa, 0, 0], [-sa, 0, 0], [0, sp, 0], [0, -sp, 0]];
      if (sw) offs.push([0, 0, sw], [0, 0, -sw]);
      for (const [oa, op, ow] of offs) {
        if (outOfTime(1)) break;
        const n = evalC({ aim: c.aim + oa, power: c.power * (1 + op), wait: Math.max(0, c.wait + ow) });
        cs.push(n.c);
      }
      const mean = cs.reduce((a, b) => a + b, 0) / cs.length;
      c.samples = cs.length;
      c.agg = R.worst * Math.max(...cs) + R.mean * mean + R.best * Math.min(...cs);
      // a lone sample is not evidence of robustness: treat it as moderately risky
      if (cs.length === 1) c.agg = c.c + 0.15 * (R.worst - R.best);
    }
    fin.sort((x, y) => x.agg - y.agg);
    const best = fin[0] || pool[0];
    return {
      aim: wrap(best.aim), power: Math.max(st.pMin, Math.min(st.pMax, best.power)), wait: best.wait || 0,
      cost: best.agg ?? best.c, expect: best.r, dStart,
      sims, steps, hits, ms: now() - t00,
    };
  }
}

// power (0..1) that gives launch speed v (inverse of shotSpeed)
export function powerFor(v) {
  const lo = shotSpeed(0), hi = shotSpeed(1);
  if (v <= lo) return 0.02;
  if (v >= hi) return 1;
  return Math.pow((v - lo) / (hi - lo), 1 / SHOT_CURVE);
}
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
function distinct(sorted, k, da, dp) {
  const out = [];
  for (const c of sorted) {
    if (out.length >= k) break;
    if (out.some(o => Math.abs(wrap(o.aim - c.aim)) < da && Math.abs(o.power - c.power) < dp && (o.wait || 0) === (c.wait || 0))) continue;
    out.push(c);
  }
  return out;
}
