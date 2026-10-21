#!/usr/bin/env node
// Node harness for js/atc: point-mass aircraft that obey ATC commands, plus scripted "player" crimes.
// node tools/atc-sim.mjs [--only=name] [--quiet]
// node tools/atc-sim.mjs --falsify   breaks each detector in a temp copy of js/atc and checks its scenario fails
import { STANDS } from '../js/world/layout.js';
import { pathToFileURL, fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (args.falsify) { falsify(); process.exit(0); }
const { createATC, geometry: Gm } = await import(args.atc ? pathToFileURL(path.join(args.atc, 'js/atc/index.js')).href : '../js/atc/index.js');
const DT = 0.1;
const TAXI = 8, AIR = 44, FINAL_SPD = 34, ROT = 28;

// ---------- kinematic AI pilot (reference consumer of the command vocabulary) ----------
class SimPlane {
  constructor(o) {
    Object.assign(this, { isPlayer: false, intent: 'park', runwayIntent: null, alt: 0, gs: 0, vy: 0, heading: 180, onGround: true, mode: 'parked', ext: 0, laps: 0, landings: 0, tgs: 0, selfGA: 0, path: null, s: 0, seen: {}, script: null }, o);
    this.p = o.p.slice();
  }
  state() {
    const r = this.heading * Math.PI / 180;
    return { id: this.id, callsign: this.callsign || this.id, isPlayer: this.isPlayer, pos: [this.p[0], this.alt, this.p[1]], vel: [Math.sin(r) * this.gs, this.vy, -Math.cos(r) * this.gs], heading: this.heading, onGround: this.onGround, agl: this.alt, intent: this.intent, runwayIntent: this.runwayIntent, apOverridden: !!this.script && !this.dummy, stand: this.stand };
  }
  cmds(atc) { const m = {}; for (const c of atc.instructionsFor(this.id)) m[c.type] = c; return m; }
  fresh(c) { if (!c || this.seen[c.type] === c.seq) return false; this.seen[c.type] = c.seq; return true; }

  setRoute(points, speed, holds = []) {
    const L = [0];
    for (let i = 1; i < points.length; i++) L.push(L[i - 1] + Gm.dist2(points[i], points[i - 1]));
    const hs = holds.map((h) => ({ ...h, u: project(points, L, h.at) }));
    this.route = { points, L, u: 0, speed, holds: hs };
  }
  followRoute(dt, c, blocked) {
    const R = this.route;
    let barrier = R.L[R.L.length - 1];
    for (const h of R.holds) {
      if (h.u < R.u - 0.5) continue;
      const ok = h.departure ? c.lineUpWait || c.clearedTakeoff : c.crossRunway && c.crossRunway.runway === h.runway;
      if (!ok) { barrier = Math.min(barrier, h.u); break; }
    }
    const target = blocked ? 0 : R.speed;
    this.gs = target;
    const nu = Math.min(R.u + target * dt, barrier);
    if (nu > R.u + 1e-6) { const [p, hd] = along(R.points, R.L, nu); this.p = p; this.heading = hd; }
    else this.gs = 0;
    R.u = nu;
    return R.u >= R.L[R.L.length - 1] - 0.01;
  }

  buildCircuit(end, startP) {
    const c = Gm.circuitFor(end, { extend: this.ext });
    const pts = c.points.map((x) => x.p);
    if (startP) pts[0] = startP;
    const legs = ['upwind', 'crosswind', 'downwind', 'base', 'final'];
    this.path = { end, pts, legs, alt: c.alt, info: c.info };
    this.pathL();
  }
  pathL() { const P = this.path; P.L = [0]; for (let i = 1; i < P.pts.length; i++) P.L.push(P.L[i - 1] + Gm.dist2(P.pts[i], P.pts[i - 1])); }
  seg() { const L = this.path.L; let i = 0; while (i < L.length - 2 && this.s > L[i + 1]) i++; return i; }

  step(dt, atc, all) {
    if (this.script) return this.script(this, dt, atc);
    const c = this.cmds(atc);
    if (c.taxi && (this.mode === 'parked' || this.mode === 'taxi' || this.mode === 'vacated' || this.mode === 'hold') && this.fresh(c.taxi)) {
      this.setRoute(c.taxi.route, TAXI, c.taxi.holdShort || []); this.mode = 'taxi'; this.dest = c.taxi.dest;
    }
    const blocked = () => groundBlocked(this, all);
    switch (this.mode) {
      case 'parked': this.gs = 0; break;
      case 'taxi': {
        if (this.followRoute(dt, c, blocked())) { this.mode = this.dest === 'runway' ? 'hold' : 'parked'; this.gs = 0; if (this.mode === 'parked') this.heading = 180; }
        break;
      }
      case 'hold': {
        this.gs = 0;
        const go = c.clearedTakeoff || c.lineUpWait;
        if (go) { this.mode = 'lineup'; this.setRoute([this.p.slice(), go.at], 6); this.luEnd = go.runwayEnd; }
        break;
      }
      case 'lineup': {
        if (this.followRoute(dt, c, blocked())) { this.heading = Gm.endInfo(this.luEnd).heading; this.gs = 0; this.mode = 'lined'; }
        break;
      }
      case 'lined': if (c.clearedTakeoff && !c.cancelTakeoff) { this.mode = 'roll'; this.rollEnd = c.clearedTakeoff.runwayEnd; this.rollFrom = this.p.slice(); } break;
      case 'roll': {
        const inf = Gm.endInfo(this.rollEnd);
        if (c.cancelTakeoff && !c.clearedTakeoff) { this.gs = Math.max(0, this.gs - 4 * dt); if (!this.gs) this.mode = 'lined'; }
        else this.gs = Math.min(ROT + 2, this.gs + 3 * dt);
        this.heading = inf.heading;
        this.p = [this.p[0] + inf.u[0] * this.gs * dt, this.p[1] + inf.u[1] * this.gs * dt];
        if (this.gs >= ROT) { this.liftoff(inf.end); }
        break;
      }
      case 'air': this.fly(dt, c); break;
      case 'flare': {
        const inf = Gm.endInfo(this.flEnd);
        if (c.goAround && this.fresh(c.goAround)) { this.ga(c.goAround); break; }
        this.gs = Math.max(26, this.gs - 1 * dt);
        this.p = [this.p[0] + inf.u[0] * this.gs * dt, this.p[1] + inf.u[1] * this.gs * dt];
        this.heading = inf.heading;
        const rate = this.alt < 8 ? 0.9 : 4;
        const na = Math.max(0, this.alt - rate * dt);
        this.vy = (na - this.alt) / dt; this.alt = na;
        if (this.alt <= 0.001) {
          this.onGround = true; this.vy = 0; this.landings++;
          this.mode = this.flType === 'tg' ? 'tg' : 'rollout';
          this.tgFrom = Gm.toEnd(inf, this.p).a;
        }
        break;
      }
      case 'tg': {
        const inf = Gm.endInfo(this.flEnd);
        this.gs = Math.min(ROT + 2, this.gs + 1 * dt);
        this.p = [this.p[0] + inf.u[0] * this.gs * dt, this.p[1] + inf.u[1] * this.gs * dt];
        if (Gm.toEnd(inf, this.p).a - this.tgFrom > 150) { this.tgs++; this.liftoff(inf.end); }
        break;
      }
      case 'rollout': {
        const inf = Gm.endInfo(this.flEnd);
        const v = c.vacate;
        if (v && Gm.toEnd(inf, this.p).a >= Gm.toEnd(inf, v.at).a - 3) {
          this.mode = 'vacating'; this.setRoute([this.p.slice(), ...v.route.slice(1)], 10); break;
        }
        this.gs = Math.max(12, this.gs - 2 * dt);
        this.p = [this.p[0] + inf.u[0] * this.gs * dt, this.p[1] + inf.u[1] * this.gs * dt];
        break;
      }
      case 'vacating': if (this.followRoute(dt, c, false)) { this.mode = 'vacated'; this.gs = 0; } break;
      case 'vacated': this.gs = 0; break;
    }
  }

  liftoff(end) {
    this.onGround = false; this.mode = 'air'; this.ext = 0;
    this.vy = 3;
    const inf = Gm.endInfo(end);
    this.buildCircuit(end);
    this.s = Math.max(0, Gm.toEnd(inf, this.p).a);
  }

  ga(cmd) {
    this.mode = 'air'; this.ext = 0;
    this.buildCircuit(this.path?.end || cmd.runwayEnd, this.p.slice());
    this.path.legs = ['upwind', 'crosswind', 'downwind', 'base', 'final'];
    this.s = 0; this.gaUntil = 1;
  }

  fly(dt, c) {
    let P = this.path;
    if (c.goAround && this.fresh(c.goAround)) return this.ga(c.goAround);
    if (c.joinCircuit && this.fresh(c.joinCircuit) && c.joinCircuit.runwayEnd !== P.end && !P.straight) {
      this.ext = 0; this.buildCircuit(c.joinCircuit.runwayEnd, this.p.slice()); this.s = 0; P = this.path;
    }
    if (c.extendDownwind && this.fresh(c.extendDownwind) && this.seg() < 3 && P.straight !== true) {
      this.ext = c.extendDownwind.metres;
      const cc = Gm.circuitFor(P.end, { extend: this.ext });
      P.pts[3] = cc.points[3].p; P.pts[4] = cc.points[4].p; this.pathL();
    }
    const i = this.seg();
    const leg = P.straight ? 'final' : P.legs[i];
    const spd = leg === 'final' ? FINAL_SPD : AIR;
    this.gs += Math.sign(spd - this.gs) * Math.min(Math.abs(spd - this.gs), 2 * dt);
    this.s += this.gs * dt;
    const end = P.L[P.L.length - 1];
    if (this.s >= end) {
      const cl = c.clearedLand || c.clearedTouchAndGo;
      if (cl) { this.mode = 'flare'; this.flEnd = cl.runwayEnd; this.flType = c.clearedTouchAndGo ? 'tg' : 'full'; }
      else { this.selfGA++; this.ga({ runwayEnd: P.end }); }
      return;
    }
    const [p, hd] = along(P.pts, P.L, this.s);
    this.p = p; this.heading = hd;
    let target;
    const toEnd = end - this.s;
    if (leg === 'final') target = Math.min(this.alt, (toEnd + 150) * 0.1);
    else if (leg === 'base') target = Gm.G.BASE_ALT + (P.alt - Gm.G.BASE_ALT) * ((P.L[i + 1] - this.s) / (P.L[i + 1] - P.L[i]));
    else target = P.alt;
    const rate = target > this.alt ? 4 : 5;
    const na = this.alt + Math.sign(target - this.alt) * Math.min(Math.abs(target - this.alt), rate * dt);
    this.vy = (na - this.alt) / dt; this.alt = Math.max(0.5, na);
  }
}

function project(points, L, q) {
  let best = { d: 1e9, u: 0 };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const vx = b[0] - a[0], vz = b[1] - a[1], l2 = vx * vx + vz * vz || 1;
    const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * vx + (q[1] - a[1]) * vz) / l2));
    const d = Math.hypot(q[0] - a[0] - vx * t, q[1] - a[1] - vz * t);
    if (d < best.d) best = { d, u: L[i - 1] + t * Math.sqrt(l2) };
  }
  return best.u;
}
function along(points, L, u) {
  let i = 1;
  while (i < points.length - 1 && u > L[i]) i++;
  const a = points[i - 1], b = points[i];
  const seg = L[i] - L[i - 1] || 1;
  const t = Math.max(0, Math.min(1, (u - L[i - 1]) / seg));
  const hd = (Math.atan2(b[0] - a[0], -(b[1] - a[1])) * 180 / Math.PI + 360) % 360;
  return [[a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], hd];
}
function groundBlocked(me, all) {
  const r = me.heading * Math.PI / 180, f = [Math.sin(r), -Math.cos(r)];
  for (const o of all) {
    if (o === me || !o.onGround) continue;
    const dx = o.p[0] - me.p[0], dz = o.p[1] - me.p[1], d = Math.hypot(dx, dz);
    if (d > 60 || d < 0.01) continue;
    if (d < 45 && (dx * f[0] + dz * f[1]) / d > Math.cos(35 * Math.PI / 180)) return true;
    // converging paths: the one further from the meeting point waits
    const r2 = o.heading * Math.PI / 180, g = [Math.sin(r2) * o.gs, -Math.cos(r2) * o.gs];
    const vx = g[0] - f[0] * TAXI, vz = g[1] - f[1] * TAXI, v2 = vx * vx + vz * vz;
    if (v2 < 0.01) continue;
    const tca = -(dx * vx + dz * vz) / v2;
    if (tca < 0 || tca > 8) continue;
    const dmin = Math.hypot(dx + vx * tca, dz + vz * tca);
    if (dmin > 20) continue;
    const meet = [me.p[0] + f[0] * TAXI * tca, me.p[1] + f[1] * TAXI * tca];
    const mine = Gm.dist2(me.p, meet), theirs = Gm.dist2(o.p, meet);
    if (mine > theirs + 1 || (Math.abs(mine - theirs) <= 1 && me.id > o.id)) return true;
  }
  return false;
}

// ---------- world runner ----------
function makeWorld(atcOpts = {}) {
  const atc = createATC(atcOpts);
  const planes = [];
  const events = [];
  const instr = [];
  const radio = [];
  atc.on('event', (e) => events.push(e));
  atc.on('radio', (e) => radio.push(e));
  let dbgN = 0;
  atc.on('instruction', (e) => { instr.push(e); if (args.dbg && (args.dbg === true || args.dbg.split(',').includes(e.cmd.type)) && dbgN++ < 60) console.log(`  t=${e.t} ${e.to} ${JSON.stringify(e.cmd).slice(0, 160)}`); });
  if (args.dbgev) atc.on('event', (e) => { if (dbgN++ < 60) console.log(`  EV t=${e.t} ${e.type} ${e.actor}>${e.victim} ${JSON.stringify(e.data)}`); });
  const W = {
    atc, planes, events, instr, radio, t: 0, minSep: 1e9, xConflicts: 0, hooks: [],
    add(o) { const p = new SimPlane(o); planes.push(p); return p; },
    run(seconds, each) {
      const n = Math.round(seconds / DT);
      for (let k = 0; k < n; k++) {
        W.t += DT;
        for (const p of planes) p.step(DT, atc, planes);
        atc.update(DT, planes.map((p) => p.state()));
        measure(W);
        if (each) each(W);
        if (args.peek && Math.abs(W.t - +args.peek) < DT / 2) for (const p of planes) console.log('  PEEK', p.id, p.mode, p.intent, p.p.map(Math.round), Math.round(p.alt), p.gs.toFixed(1), JSON.stringify(atc.strip(p.id)), atc.instructionsFor(p.id).map((c) => c.type).join(','));
      }
    },
    ev: (type, actor) => events.filter((e) => e.type === type && (actor == null || e.actor === actor)),
  };
  return W;
}

function measure(W) {
  const P = W.planes;
  const X = Gm.INTERSECTIONS[0].at;
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
    const a = P[i], b = P[j];
    if (a.script || b.script) continue;
    if (!a.onGround && !b.onGround) {
      const d = Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1], a.alt - b.alt);
      W.minSep = Math.min(W.minSep, d);
    }
    // crossing-runway conflict: both near the intersection, low, on different runways
    const near = (p) => Gm.dist2(p.p, X) < 150 && p.alt < 60 && (p.gs > 5);
    if (near(a) && near(b)) {
      const ra = runwayFor(a), rb = runwayFor(b);
      if (ra && rb && ra !== rb) W.xConflicts++;
    }
  }
}
function runwayFor(p) {
  for (const rw of Gm.RUNWAYS) for (const e of rw.ends) if (Math.abs(Gm.angDiff(p.heading, Gm.endInfo(e).heading)) < 25 && Gm.onRunway(rw, p.p, 150)) return rw.id;
  return null;
}

function circuitPlane(W, id, s, intent = 'circuits', end = '27') {
  const p = W.add({ id, p: [0, 0], intent, onGround: false, mode: 'air', gs: AIR });
  p.buildCircuit(end);
  p.s = s;
  const [pt, hd] = along(p.path.pts, p.path.L, s);
  p.p = pt; p.heading = hd; p.alt = s < 1000 ? 100 : p.path.alt;
  if (s > p.path.L[4]) p.alt = Math.max(5, (p.path.L[5] - s + 150) * 0.1);
  return p;
}

// ---------- scenarios ----------
const results = [];
function check(name, cond, detail = '') { results.push({ name, ok: !!cond, detail }); return !!cond; }
const AI_BAD = ['cut_in_final', 'forced_goaround', 'runway_steal', 'queue_jump', 'unauth_takeoff', 'unauth_landing', 'runway_incursion', 'taxiway_landing', 'grass_landing', 'apron_landing', 'wrong_way', 'closed_runway', 'tower_buzz', 'terminal_buzz', 'low_pass', 'formation', 'near_miss', 'collision', 'separation_loss', 'double_occupancy', 'intersection_dash', 'hard_landing', 'ignored_instruction', 'stand_steal', 'taxi_speeding'];

function aiCircuits() {
  const W = makeWorld({ wind: { from: 270, kt: 10 } });
  circuitPlane(W, 'AI1', 2600);
  circuitPlane(W, 'AI2', 5000);
  circuitPlane(W, 'AI3', 7500);
  const ground = ['AI4', 'AI5', 'AI6'].map((id, i) => W.add({ id, p: [STANDS[1 + i * 2].position[0], STANDS[1 + i * 2].position[2]], stand: STANDS[1 + i * 2].id, heading: 180 }));
  const sched = new Map(ground.map((p, i) => [p.id, { wake: 5 + i * 50 }]));
  for (const p of W.planes) if (!sched.has(p.id)) sched.set(p.id, { laps: 4 + W.planes.indexOf(p) });
  const lastMove = new Map();
  let stuck = 0;
  W.run(30 * 60, (W) => {
    for (const p of W.planes) {
      const sc = sched.get(p.id);
      if (sc.wake != null && W.t >= sc.wake) { p.intent = 'circuits'; sc.laps = 3; sc.wake = null; sc.base = p.tgs; }
      if (p.intent === 'circuits' && sc.laps != null && p.tgs - (sc.base || 0) >= sc.laps) { p.intent = 'fullStop'; }
      if (p.intent === 'fullStop' && p.mode === 'parked' && W.atc.strip(p.id)?.state === 'parked' && p.landings > 0) { p.intent = 'park'; sc.wake = W.t + 60; sc.laps = null; }
      if (!lastMove.has(p.id)) lastMove.set(p.id, { t: W.t, p: p.p.slice() });
      const lm = lastMove.get(p.id);
      if (Gm.dist2(lm.p, p.p) > 5 || p.intent === 'park') lastMove.set(p.id, { t: W.t, p: p.p.slice() });
      else if (W.t - lm.t > 300) { stuck++; if (args.stuck) console.log('  STUCK', p.id, W.t.toFixed(0), p.mode, p.p.map(Math.round), JSON.stringify(W.atc.strip(p.id)), W.atc.instructionsFor(p.id).map((c) => c.type)); lastMove.set(p.id, { t: W.t, p: p.p.slice() }); }
    }
  });
  const bad = W.events.filter((e) => AI_BAD.includes(e.type));
  const landings = W.planes.map((p) => `${p.id}:${p.landings}`).join(' ');
  const total = W.planes.reduce((a, p) => a + p.landings, 0);
  const selfGA = W.planes.reduce((a, p) => a + p.selfGA, 0);
  const counts = W.atc.counts;
  check('circuits: 0 AI conflicts/infractions in 30 min', bad.length === 0, bad.slice(0, 5).map((e) => `${e.type}:${e.actor}>${e.victim}@${e.t}`).join(', ') || `events=${W.events.length}`);
  check('circuits: min airborne separation >= 150 m', W.minSep >= 150, `min ${W.minSep.toFixed(0)} m`);
  check('circuits: every plane flew and landed', W.planes.every((p) => p.landings >= 2) && total >= 25, `${landings} (total ${total})`);
  check('circuits: nobody reached the threshold uncleared', selfGA === 0, `selfGA=${selfGA}, ATC go-arounds=${counts.goArounds || 0}`);
  check('circuits: nobody stuck > 5 min', stuck === 0, `stuck=${stuck}`);
  check('circuits: go-arounds rare (<= 3)', (counts.goArounds || 0) <= 3, `goArounds=${counts.goArounds || 0}`);
  return W;
}

// Player waypoints at fixed speed; touches down when alt reaches 0 on the last leg.
function scripted(wps, speed, opts = {}) {
  let i = 0;
  return (p, dt) => {
    const w = wps[Math.min(i, wps.length - 1)];
    const dx = w[0] - p.p[0], dz = w[1] - p.p[1], d = Math.hypot(dx, dz);
    const spd = typeof speed === 'function' ? speed(p, i) : speed;
    const last = i >= wps.length - 1;
    if (d < spd * dt + 0.5 && !last) i++;
    if (d > 0.01) { p.heading = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360; const k = Math.min(d, spd * dt) / d; p.p = [p.p[0] + dx * k, p.p[1] + dz * k]; }
    p.gs = last && opts.stopAtEnd && d < spd * dt + 0.5 ? 0 : spd;
    const ta = w[2] ?? p.alt;
    const rate = w[3] ?? opts.rate ?? 4;
    const na = p.alt + Math.sign(ta - p.alt) * Math.min(Math.abs(ta - p.alt), rate * dt);
    p.vy = (na - p.alt) / dt; p.alt = Math.max(0, na);
    p.onGround = p.alt <= 0.001;
    if (opts.ground) { p.onGround = true; p.alt = 0; p.vy = 0; }
  };
}

function cutIn() {
  const W = makeWorld({ wind: { from: 270, kt: 10 } });
  const victim = W.add({ id: 'AI1', p: [0, 0], intent: 'fullStop', onGround: false, mode: 'air', gs: FINAL_SPD });
  victim.buildCircuit('27'); victim.s = victim.path.L[5] - 2000;
  const [pt, hd] = along(victim.path.pts, victim.path.L, victim.s); victim.p = pt; victim.heading = hd; victim.alt = 210;
  const pl = W.add({ id: 'PLAYER', isPlayer: true, p: [1500, 1150], intent: 'fullStop', onGround: false, alt: 300, gs: 44, heading: 90 });
  pl.script = scripted([[1600, 1150, 300], [1150, 0, 100, 12], [700, 0, 8, 7], [300, 0, 0, 1.5]], (p, i) => (i < 2 ? 60 : 35));
  W.run(120);
  const cut = W.ev('cut_in_final', 'PLAYER');
  const forced = W.ev('forced_goaround', 'PLAYER');
  const vga = W.instr.find((e) => e.to === 'AI1' && e.cmd.type === 'goAround');
  check('cut-in: detected (player cuts ahead of number 1)', cut.length === 1 && cut[0].victim === 'AI1', cut.map((e) => `gap=${e.data.gap} sev=${e.severity}`).join() || 'none');
  check('cut-in: victim told to go around, attributed to player', !!vga && forced.length === 1 && forced[0].victim === 'AI1', vga ? `GA reason=${vga.cmd.reason}` : 'no GA');
  check('cut-in: player landing without clearance flagged', W.ev('unauth_landing', 'PLAYER').length === 1);
  check('cut-in: victim did not reach the threshold uncleared', victim.selfGA === 0 && W.minSep >= 0);
  const rc = W.radio.find((e) => e.type === 'infraction' && e.id === 'cut_in_final' && e.actor === 'PLAYER' && e.victim === 'AI1');
  const rg = W.radio.find((e) => e.type === 'goAround' && e.actor === 'AI1' && e.cause === 'PLAYER');
  check('cut-in: RADIO-shaped events emitted (infraction + goAround cause)', rc && rg && rc.outrage > 0, rc ? `outrage=${rc.outrage}` : 'missing');
  check('cut-in: tower composure rose', W.atc.composure().outrage > 0, JSON.stringify(W.atc.composure()));
  return W;
}

function cutInCorner() {
  const W = makeWorld({ wind: { from: 270, kt: 10 } });
  const victim = W.add({ id: 'AI1', p: [0, 0], intent: 'fullStop', onGround: false, mode: 'air', gs: FINAL_SPD });
  victim.buildCircuit('27'); victim.s = victim.path.L[5] - 2200;
  const [pt, hd] = along(victim.path.pts, victim.path.L, victim.s); victim.p = pt; victim.heading = hd; victim.alt = 220;
  const C3 = victim.path.pts[3];
  const pl = W.add({ id: 'PLAYER', isPlayer: true, p: C3.slice(), intent: 'fullStop', onGround: false, alt: 250, gs: 55, heading: 225 });
  let go = false;
  pl.script = (p, dt, atc) => { if (!go) { p.p = [p.p[0], p.p[1]]; return; } p.__s(p, dt, atc); };
  pl.__s = scripted([[1300, 0, 60], [700, 0, 0], [300, 0, 0]], (p, i) => (i < 1 ? 55 : i < 2 ? 40 : 15), { rate: 6 });
  W.run(1);
  const before = W.atc.sequence('27');
  go = true;
  W.run(90);
  const cut = W.ev('cut_in_final', 'PLAYER');
  check('cut-in (corner): player sequenced behind first', before.join() === 'AI1,PLAYER', `seq=${before}`);
  check('cut-in (corner): detected after re-sequencing', cut.length === 1 && cut[0].victim === 'AI1', cut.map((e) => `gap=${e.data.gap}`).join() || 'none');
  check('cut-in (corner): victim told to go around', W.instr.some((e) => e.to === 'AI1' && e.cmd.type === 'goAround' && e.cmd.cause === 'PLAYER'));
  return W;
}

function blockedRunway() {
  const W = makeWorld({ wind: { from: 270, kt: 10 } });
  const stuck = W.add({ id: 'AI9', p: [300, 0], intent: 'park', heading: 0, dummy: true });
  stuck.script = (p) => { p.gs = 0; };
  circuitPlane(W, 'AI1', 8800 + 600 - 3000, 'circuits');
  W.run(120);
  const cl = W.instr.find((e) => e.to === 'AI1' && (e.cmd.type === 'clearedLand' || e.cmd.type === 'clearedTouchAndGo'));
  const ga = W.instr.find((e) => e.to === 'AI1' && e.cmd.type === 'goAround');
  check('blocked runway: no landing clearance while a plane sits on it', !cl, cl ? `cleared at ${cl.t}` : '');
  check('blocked runway: arrival sent around (runwayOccupied)', ga?.cmd.reason === 'runwayOccupied', ga ? ga.cmd.reason : 'no GA');
  return W;
}

function overtake() {
  const W = makeWorld({ wind: { from: 270, kt: 10 } });
  const victim = W.add({ id: 'AI1', p: [700 + 2500, 0], intent: 'circuits', onGround: false, mode: 'air', gs: FINAL_SPD, alt: 255, heading: 270 });
  victim.path = { end: '27', pts: [victim.p.slice(), Gm.endInfo('27').T], legs: ['final'], straight: true, alt: 300 }; victim.pathL(); victim.s = 0;
  const pl = W.add({ id: 'PLAYER', isPlayer: true, p: [700 + 4200, 40], intent: 'circuits', onGround: false, alt: 245, gs: 72, heading: 270 });
  pl.script = scripted([[700 + 700, 40, 80, 4], [700, 0, 5, 6], [200, 0, 0, 1]], (p, i) => (i < 1 ? 72 : 40));
  W.run(1);
  const before = W.atc.sequence('27');
  W.run(60);
  const cut = W.ev('cut_in_final', 'PLAYER');
  check('overtake on final: sequenced behind, then re-sequenced ahead', before.join() === 'AI1,PLAYER' && cut.length === 1, `before=${before} cut=${cut.map((e) => e.data.gap)}`);
  check('overtake on final: victim told to go around (cause player)', W.instr.some((e) => e.to === 'AI1' && e.cmd.type === 'goAround' && e.cmd.cause === 'PLAYER'));
  return W;
}

function outOfTurn() {
  const W = makeWorld({ wind: { from: 270, kt: 10 } });
  const arr = circuitPlane(W, 'AI0', 8800 - 2900, 'circuits');
  const a = W.add({ id: 'AI1', p: [700, -50], intent: 'circuits', heading: 180 });
  a.mode = 'hold';
  const b = W.add({ id: 'AI2', p: [560, -110], intent: 'circuits', heading: 90 });
  const pl = W.add({ id: 'PLAYER', isPlayer: true, p: [560, -75], intent: 'circuits', heading: 200 });
  let go = false;
  pl.script = (p, dt, atc) => { if (!go) { p.gs = 0; return; } p.__s(p, dt, atc); };
  pl.__s = scripted([[540, -20, 0], [520, 0, 0], [-200, 0, 0]], (p, i) => (i < 2 ? 8 : Math.min(32, p.gs + 3 * 0.1)), { ground: true });
  W.run(8);
  const qBefore = W.atc.departureQueue();
  go = true;
  W.run(40);
  const qj = W.ev('queue_jump', 'PLAYER');
  const ut = W.ev('unauth_takeoff', 'PLAYER');
  check('out of turn: AI queue formed first', qBefore[0] === 'AI1', `queue=${qBefore}`);
  check('out of turn: queue_jump detected with victim AI1', qj.length === 1 && qj[0].victim === 'AI1', qj.map((e) => `jumped=${e.data.jumped}`).join() || 'none');
  check('out of turn: unauthorised takeoff roll detected (outOfTurn)', ut.length === 1 && ut[0].data.outOfTurn, ut.map((e) => JSON.stringify(e.data)).join() || 'none');
  check('out of turn: AI1 never cleared while player on runway', !W.instr.some((e) => e.to === 'AI1' && e.cmd.type === 'clearedTakeoff' && e.t > 8 && e.t < 8 + 30));
  return W;
}

function towerBuzz() {
  const W = makeWorld({ wind: { from: 270, kt: 10 } });
  const pl = W.add({ id: 'PLAYER', isPlayer: true, p: [-200, -260], intent: 'circuits', onGround: false, alt: 70, heading: 90, gs: 40 });
  pl.script = scripted([[150, -255, 45], [600, -250, 120]], 40);
  W.run(20);
  const bz = W.ev('tower_buzz', 'PLAYER');
  check('tower buzz: detected once (cooldown holds)', bz.length === 1, bz.map((e) => `dist=${e.data.dist} close=${e.data.close}`).join() || 'none');
  return W;
}

function crossing() {
  // 04/22 opened; a straight-in AI on 22 plus 27 circuit + departures. The intersection must never be shared.
  const W = makeWorld({ wind: { from: 270, kt: 10 }, open: { '04/22': true } });
  circuitPlane(W, 'AI1', 3000);
  circuitPlane(W, 'AI2', 6500);
  const dep = W.add({ id: 'AI3', p: [700, -50], intent: 'circuits', heading: 180 }); dep.mode = 'hold';
  const inf = Gm.endInfo('22');
  const s22 = W.add({ id: 'AI22', p: [inf.T[0] - inf.u[0] * 2400, inf.T[1] - inf.u[1] * 2400], intent: 'fullStop', runwayIntent: '22', onGround: false, alt: 250, heading: inf.heading, gs: FINAL_SPD, mode: 'air' });
  s22.path = { end: '22', pts: [s22.p.slice(), inf.T], legs: ['final'], straight: true, alt: 300 }; s22.pathL(); s22.s = 0;
  let mutexSeen = false, both = 0;
  const X = Gm.INTERSECTIONS[0].at;
  const opBefore = (W, p) => {
    const c = {}; for (const k of W.atc.instructionsFor(p.id)) c[k.type] = k;
    const op = c.clearedTakeoff || c.clearedLand || c.clearedTouchAndGo;
    if (!op) return null;
    const inf = Gm.endInfo(op.runwayEnd);
    if (Gm.toEnd(inf, p.p).a > Gm.toEnd(inf, X).a + 60 || (p.alt > 150 && Gm.toEnd(inf, p.p).a > 0)) return null;
    return inf.rw.id;
  };
  W.run(10 * 60, (W) => {
    const ops = W.planes.map((p) => opBefore(W, p)).filter(Boolean);
    if (new Set(ops).size > 1) both++;
    const m = W.atc.mutex.X0;
    if (m === 'AI22') mutexSeen = true;
    if (s22.landings && s22.runwayIntent) s22.runwayIntent = null;
  });
  const bad = W.events.filter((e) => AI_BAD.includes(e.type));
  check('crossing: no simultaneous use of the 09/27 x 04/22 intersection', W.xConflicts === 0 && !W.ev('intersection_dash').length, `xConflicts=${W.xConflicts}`);
  check('crossing: never two live clearances across the intersection', both === 0, `ticks=${both}`);
  check('crossing: 22 arrival held the intersection and landed', mutexSeen && s22.landings >= 1, `landings=${s22.landings} mode=${s22.mode} ga=${W.instr.filter((e) => e.to === 'AI22' && e.cmd.type === 'goAround').length}`);
  check('crossing: no AI conflicts/infractions', bad.length === 0, bad.slice(0, 4).map((e) => `${e.type}:${e.actor}>${e.victim}@${e.t}`).join(', '));
  const t22 = W.instr.find((e) => e.to === 'AI22' && e.cmd.type === 'taxi');
  check('crossing: 22 lander vacated onto A and was sent to the 27 hold', s22.landings > 0 && t22?.cmd.dest === 'runway', `landings=${s22.landings} first taxi dest=${t22?.cmd.dest}`);

  // Player dashes across the intersection on the ground while AI is rolling for 27.
  const W2 = makeWorld({ wind: { from: 270, kt: 10 } });
  const ai = W2.add({ id: 'AI1', p: [700, -50], intent: 'circuits', heading: 180 }); ai.mode = 'hold';
  const pl = W2.add({ id: 'PLAYER', isPlayer: true, p: [226, -70], intent: 'park', heading: 180 });
  let started = false;
  pl.script = (p, dt, atc) => {
    if (!started && atc.command('AI1', 'clearedTakeoff')) started = true;
    if (!started) { p.gs = 0; return; }
    p.__s(p, dt, atc);
  };
  pl.__s = scripted([[226, 80, 0]], 8, { ground: true });
  W2.run(60);
  const dash = W2.ev('intersection_dash', 'PLAYER');
  const cancel = W2.instr.find((e) => e.to === 'AI1' && e.cmd.type === 'cancelTakeoff');
  check('crossing: player intersection dash detected', dash.length === 1, dash.map((e) => `victim=${e.victim}`).join() || 'none');
  check('crossing: AI takeoff cancelled for the intruder', !!cancel && W2.ev('collision').length === 0, cancel ? `reason=${cancel.cmd.reason}` : 'no cancel');
  return W;
}

function serialization() {
  const W = makeWorld({ wind: { from: 270, kt: 10 } });
  circuitPlane(W, 'AI1', 2600); circuitPlane(W, 'AI2', 6000);
  W.run(60);
  const snap = W.atc.serialize();
  const json = JSON.stringify(snap);
  const B = createATC({ wind: { from: 270, kt: 10 } });
  B.restore(JSON.parse(json));
  const states = W.planes.map((p) => p.state());
  const A1 = W.atc.step(0.1, snap.t + 0.1, states).length;
  const B1 = B.step(0.1, snap.t + 0.1, states).length;
  const same = JSON.stringify(W.atc.serialize()) === JSON.stringify(B.serialize());
  check('online: serialize/restore round-trips and steps identically', same && A1 === B1, `${(json.length / 1024).toFixed(1)} KB`);
  // Follower replica: restored from the host, non-authoritative, detects only its own (local) plane.
  const F = createATC({ authority: false, detectRemote: false });
  F.restore(W.atc.serialize());
  const fev = [];
  F.on('event', (e) => fev.push(e));
  const me = { id: 'PLAYER', isPlayer: true, pos: [100, 50, -260], vel: [40, 0, 0], heading: 90, onGround: false, agl: 50, intent: 'circuits' };
  let tt = W.atc.time;
  for (let k = 0; k < 40; k++) {
    tt += 0.1; me.pos = [me.pos[0] + 4, 50, -260];
    const st = W.planes.map((p) => ({ ...p.state(), remote: true }));
    F.step(0.1, tt, [...st, me]);
    if (k === 0) F.setLocal('PLAYER', true);
  }
  const cmdsBefore = JSON.stringify(W.atc.serialize().strips.AI1.cmds);
  check('online: follower replica detects its own plane only, issues nothing', fev.length === 1 && fev[0].type === 'tower_buzz' && fev[0].actor === 'PLAYER' && JSON.stringify(F.serialize().strips.AI1.cmds) === cmdsBefore, fev.map((e) => e.type).join() || 'none');
  const src = [import.meta.url].length && true;
  return src;
}

function crimes() {
  const out = {};
  const solo = (name, setup, seconds, opts) => {
    const W = makeWorld({ wind: { from: 270, kt: 10 }, ...(opts || {}) });
    setup(W);
    W.run(seconds);
    out[name] = W;
    return W;
  };
  const air = (W, p, alt, hd, gs, wps, speed, o) => { const pl = W.add({ id: 'PLAYER', isPlayer: true, p, intent: 'circuits', onGround: alt <= 0, alt, heading: hd, gs }); pl.script = scripted(wps, speed, o); return pl; };
  const dummy = (W, id, p, alt, hd, gs, wps, speed, o) => { const d = W.add({ id, p, intent: 'circuits', onGround: alt <= 0, alt, heading: hd, gs, dummy: true }); d.script = scripted(wps, speed, o); return d; };
  const has = (W, type, pred = () => true) => W.events.filter((e) => e.type === type && e.actor === 'PLAYER' && pred(e));

  let W = solo('taxiway', (W) => air(W, [-100, -110], 6, 90, 30, [[300, -110, 0]], 30, { rate: 0.8 }), 20);
  check('crimes: taxiway landing', has(W, 'taxiway_landing').length === 1);
  W = solo('grass', (W) => air(W, [-100, 400], 6, 90, 30, [[300, 400, 0]], 30, { rate: 0.8 }), 20);
  check('crimes: grass landing', has(W, 'grass_landing').length === 1);
  W = solo('apron', (W) => air(W, [-250, -200], 6, 90, 25, [[100, -200, 0]], 25, { rate: 0.8 }), 20);
  check('crimes: apron landing', has(W, 'apron_landing').length === 1);
  W = solo('wrongway', (W) => air(W, [-900, 0], 8, 90, 30, [[-200, 0, 0], [0, 0, 0]], 30, { rate: 0.8 }), 30);
  check('crimes: wrong-way landing on 09 while 27 active (+ no clearance)', has(W, 'wrong_way').length === 1 && has(W, 'unauth_landing').length === 1);
  W = solo('closed', (W) => {
    const i = Gm.endInfo('22');
    air(W, [i.T[0] - i.u[0] * 100, i.T[1] - i.u[1] * 100], 8, 220, 30, [[i.T[0] + i.u[0] * 300, i.T[1] + i.u[1] * 300, 0]], 30, { rate: 0.8 });
  }, 20);
  check('crimes: landing on closed 04/22', has(W, 'closed_runway').length === 1);
  W = solo('terminal', (W) => air(W, [-400, -320], 30, 90, 40, [[300, -320, 30]], 40), 20);
  check('crimes: terminal buzz', has(W, 'terminal_buzz').length === 1);
  W = solo('lowpass', (W) => air(W, [-650, 0], 3, 90, 40, [[650, 0, 3]], 40), 35);
  check('crimes: low pass along the runway', has(W, 'low_pass').length === 1);
  W = solo('nearmiss', (W) => {
    dummy(W, 'AI1', [-1000, 500], 300, 90, 40, [[2000, 500, 300]], 40);
    air(W, [20, -500], 305, 180, 40, [[20, 1500, 305]], 40);
  }, 40);
  check('crimes: near miss (blamed on the player only)', has(W, 'near_miss').length === 1 && !W.ev('near_miss', 'AI1').length, has(W, 'near_miss').map((e) => `closest=${e.data.closest}`).join());
  W = solo('formation', (W) => {
    dummy(W, 'AI1', [-1000, 500], 300, 90, 40, [[2000, 500, 300]], 40);
    air(W, [-1000, 520], 300, 90, 40, [[-700, 520, 300], [-400, 900, 300]], 40);
  }, 30);
  check('crimes: uninvited formation', has(W, 'formation').length === 1, has(W, 'formation').map((e) => `${e.data.seconds}s`).join());
  W = solo('taxifast', (W) => air(W, [-600, -110], 0, 90, 20, [[200, -110, 0]], 20, { ground: true }), 10);
  check('crimes: taxi speeding', has(W, 'taxi_speeding').length === 1);
  W = solo('hard', (W) => air(W, [-200, 0], 12, 270, 30, [[-600, 0, 0]], 30, { rate: 6 }), 10);
  check('crimes: hard landing', has(W, 'hard_landing').length === 1, has(W, 'hard_landing').map((e) => `${e.data.fpm} fpm`).join());
  W = solo('ignored', (W) => air(W, [-250, -60], 0, 180, 4, [[-250, 60, 0]], 4, { ground: true }), 25);
  check('crimes: runway incursion, then ignores "hold position"', has(W, 'runway_incursion').length === 1 && has(W, 'ignored_instruction', (e) => e.data.instruction === 'holdPosition').length === 1);
  W = solo('shared', (W) => {
    dummy(W, 'AI1', [0, 0], 0, 270, 0, [[0, 0, 0]], 0, { ground: true });
    air(W, [-650, 0], 0, 90, 25, [[-80, 0, 0]], 25, { ground: true, stopAtEnd: true });
  }, 30);
  check('crimes: shared runway (double occupancy)', has(W, 'double_occupancy').length === 1);
  W = solo('stand', (W) => {
    const st = STANDS[2];
    const ai = W.add({ id: 'AI1', p: [st.position[0], st.position[2]], stand: st.id, intent: 'park' });
    ai.script = (p, dt) => { if (W.t > 1) p.p = [600, -400]; };
    ai.dummy = true;
    air(W, [st.position[0], st.position[2] + 80], 0, 0, 6, [[st.position[0], st.position[2]]], 6, { ground: true, stopAtEnd: true });
  }, 25);
  check('crimes: stand steal', has(W, 'stand_steal').length === 1);
  W = solo('collision', (W) => {
    dummy(W, 'AI1', [-400, 600], 200, 90, 40, [[400, 600, 200]], 40);
    air(W, [0, 200], 200, 180, 40, [[0, 1000, 200]], 40);
  }, 25);
  check('crimes: mid-air collision', has(W, 'collision').length === 1 && W.radio.some((e) => e.type === 'collision'));
  W = solo('scandal', (W) => air(W, [0, 3000], 400, 90, 40, [[3000, 3000, 400]], 40), 1);
  W.atc.addOutrage(120, null);
  check('crimes: Royal Scandal at 100 outrage, resets to 60', W.radio.some((e) => e.type === 'scandal') && W.atc.composure().outrage === 60 && W.atc.composure().frozen);
  return out;
}

// Integration smoke against FLIGHT's real Aircraft/Autopilot/Traffic through js/atc/bridge.js. Reports, does not assert.
async function flightLink() {
  const { Aircraft } = await import('../js/flight/aircraft.js');
  const { Autopilot } = await import('../js/flight/autopilot.js');
  const { Traffic } = await import('../js/flight/traffic.js');
  const R = await import('../js/flight/routes.js');
  const { linkTraffic } = await import('../js/atc/bridge.js');
  const env = { groundHeightAt: () => 0, surfaceAt: (x, z) => Gm.surfaceAt([x, z]), colliders: [] };
  const tr = new Traffic(env);
  const route = () => { const c = R.circuitRoute('27'); return { name: c.name, legs: [{ kind: 'hold', end: '27', seconds: 2, untilClear: true, label: 'HOLD SHORT' }, ...c.legs], loop: 1 }; };
  const mk = (place, name) => { const ac = new Aircraft({ dims: { gearHeight: 1.2 } }); ac.place(place, env); const ap = new Autopilot(ac); tr.add({ aircraft: ac, ap, name }); ap.setRoute(route()); };
  mk({ x: 700, z: -60, heading: 180 }, 'A'); mk({ x: 700, z: -110, heading: 0 }, 'B'); mk({ x: 640, z: -110, heading: 90 }, 'C');
  const atc = createATC({ wind: { from: 270, kt: 8 }, detectCollisions: false });
  const link = linkTraffic(atc, tr);
  const evs = [];
  atc.on('event', (e) => { if (e.type !== 'impeccable') evs.push(e); });
  let nd = 0;
  if (args.dbg) atc.on('instruction', (e) => { if ((args.dbg === true || args.dbg.split(',').includes(e.cmd.type)) && nd++ < 40) console.log(`  t=${e.t} ${e.to} ${JSON.stringify(e.cmd).slice(0, 150)} ${JSON.stringify(atc.strip(e.to))}`); });
  const tally = {};
  const mins = +(args.minutes || 15);
  for (let t = 0; t < mins * 60; t += 1 / 60) {
    tr.update(1 / 60); link.update(1 / 60);
    for (const e of tr.list) for (const ev of e.ap.events.splice(0)) if (ev.type === 'landed' || ev.type === 'goaround') tally[`${e.name}.${ev.type}`] = (tally[`${e.name}.${ev.type}`] || 0) + 1;
  }
  console.log(`  FLIGHT link ${mins} min: AP ${JSON.stringify(tally)}; ATC ${JSON.stringify(atc.counts)}`);
  for (const e of evs.slice(0, 10)) console.log(`   ${e.t.toFixed(0)}s ${e.type} ${e.actor}>${e.victim ?? ''} at ${e.at} ${JSON.stringify(e.data)}`);
}

const SCEN = { circuits: aiCircuits, cutin: cutIn, corner: cutInCorner, blocked: blockedRunway, overtake, outofturn: outOfTurn, buzz: towerBuzz, crossing, crimes, online: serialization };
if (args.only === 'flight') SCEN.flight = flightLink;
for (const [name, fn] of Object.entries(SCEN)) {
  if (args.only && args.only !== name) continue;
  const t0 = Date.now();
  try { await fn(); } catch (err) { check(`${name}: crashed`, false, String(err?.stack || err).split('\n').slice(0, 2).join(' ')); }
  if (!args.quiet) console.log(`# ${name} (${Date.now() - t0} ms)`);
}
let fail = 0;
for (const r of results) { if (!r.ok) fail++; console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  — ' + r.detail : ''}`); }
console.log(`\n${results.length - fail}/${results.length} passed`);
process.exit(fail ? 1 : 0);

function falsify() {
  // [label, file, original, broken, scenario, check-name substring that must FAIL]
  const B = [
    ['cut-in detector', 'js/atc/index.js', "if (detecting(S.strips[actor])) emitEvent('cut_in_final'", "if (false) emitEvent('cut_in_final'", 'cutin', 'cut-in: detected'],
    ['re-sequence on cut-in', 'js/atc/index.js', 'if (b.rem + T.cutMargin < a.rem) {', 'if (false) {', 'overtake', 'overtake on final'],
    ['queue_jump', 'js/atc/index.js', "if (ahead.length && rwOfEnd(S.activeEnd).id === rwId) {", 'if (false) {', 'outofturn', 'queue_jump detected'],
    ['unauth_takeoff', 'js/atc/index.js', 'const ok = (s.cmds.clearedTakeoff && cmdRw(s.cmds.clearedTakeoff) === rw.id) || tg;', 'const ok = true;', 'outofturn', 'unauthorised takeoff roll'],
    ['tower_buzz', 'js/atc/rules.js', 'buzzDist: 80,', 'buzzDist: 0,', 'buzz', 'tower buzz'],
    ['intersection mutex', 'js/atc/index.js', "if (keys.some((k) => S.mutex[k] && S.mutex[k] !== id)) return false;", '', 'crossing', 'never two live clearances'],
    ['intersection_dash', 'js/atc/index.js', "if (other) emitEvent('intersection_dash'", "if (false) emitEvent('intersection_dash'", 'crossing', 'player intersection dash'],
    ['cancel takeoff for intruder', 'js/atc/index.js', 'if (blk.length || intr) {', 'if (false) {', 'crossing', 'AI takeoff cancelled'],
    ['downwind spacing', 'js/atc/index.js', 'if (secs <= 2 || s.ext >= T.maxExtend) return;', 'return;', 'circuits', 'circuits: '],
    ['landing needs a clear runway', 'js/atc/index.js', 'const ok = want && s.penaltyUntil <= S.t && !s.cutPending && !blockers.length', 'const ok = want && s.penaltyUntil <= S.t && !s.cutPending', 'blocked', 'no landing clearance'],
    ['off-runway touchdown', 'js/atc/index.js', "const type = { taxiway: 'taxiway_landing', grass: 'grass_landing', apron: 'apron_landing' }[surf];", 'const type = null;', 'crimes', 'taxiway landing'],
    ['wrong_way', 'js/atc/rules.js', 'wrongWayDeg: 120,', 'wrongWayDeg: 400,', 'crimes', 'wrong-way landing'],
    ['closed_runway', 'js/atc/index.js', "if (!S.open[rw.id]) emitEvent('closed_runway'", "if (false) emitEvent('closed_runway'", 'crimes', 'closed 04/22'],
    ['terminal_buzz', 'js/atc/rules.js', 'terminalAgl: 40,', 'terminalAgl: 0,', 'crimes', 'terminal buzz'],
    ['low_pass', 'js/atc/rules.js', 'lowPassDist: 400,', 'lowPassDist: 4000,', 'crimes', 'low pass'],
    ['near_miss', 'js/atc/rules.js', 'nearMiss: 25,', 'nearMiss: 1,', 'crimes', 'near miss'],
    ['formation', 'js/atc/rules.js', 'formationDist: 40,', 'formationDist: 1,', 'crimes', 'formation'],
    ['taxi_speeding', 'js/atc/rules.js', 'unauthTakeoffKt: 35, doubleOccKt: 40, taxiSpeedKt: 30,', 'unauthTakeoffKt: 35, doubleOccKt: 40, taxiSpeedKt: 300,', 'crimes', 'taxi speeding'],
    ['hard_landing', 'js/atc/rules.js', 'hardLandingFpm: 600,', 'hardLandingFpm: 6000,', 'crimes', 'hard landing'],
    ['ignored_instruction', 'js/atc/rules.js', 'ignoredSecs: 8,', 'ignoredSecs: 800,', 'crimes', 'ignores "hold position"'],
    ['double_occupancy', 'js/atc/index.js', 'if (Math.max(a.gs, b.gs) < T.doubleOccKt * KT) continue;', 'continue;', 'crimes', 'shared runway'],
    ['stand_steal', 'js/atc/rules.js', 'standStopSecs: 3,', 'standStopSecs: 300,', 'crimes', 'stand steal'],
    ['collision', 'js/atc/rules.js', 'nearMiss: 25, contact: 6,', 'nearMiss: 25, contact: 0,', 'crimes', 'mid-air collision'],
    ['unauth_landing', 'js/atc/index.js', "if (!clr || cmdRw(clr) !== rw.id) emitEvent('unauth_landing'", "if (false) emitEvent('unauth_landing'", 'cutin', 'player landing without clearance'],
    ['outrage meter', 'js/atc/outrage.js', 'm.v = Math.max(0, Math.min(C.max, m.v + amount * (amount > 0 ? gain : 1)));', '', 'cutin', 'composure rose'],
    ['serialize', 'js/atc/index.js', 'serialize() { return clone(S); },', 'serialize() { const c = clone(S); delete c.seqs; return c; },', 'online', 'round-trips'],
  ];
  const files = ['js/atc/index.js', 'js/atc/geometry.js', 'js/atc/rules.js', 'js/atc/outrage.js', 'js/world/layout.js', 'data/rules.js'];
  let ok = 0;
  for (const [label, file, orig, broken, scen, expect] of B) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atc-falsify-'));
    for (const f of files) { fs.mkdirSync(path.join(tmp, path.dirname(f)), { recursive: true }); fs.copyFileSync(path.join(ROOT, f), path.join(tmp, f)); }
    const src = fs.readFileSync(path.join(tmp, file), 'utf8');
    const count = src.split(orig).length - 1;
    if (count !== 1) { console.log(`SKIP  ${label}: pattern found ${count}x`); continue; }
    fs.writeFileSync(path.join(tmp, file), src.replace(orig, broken));
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), `--only=${scen}`, `--atc=${tmp}`, '--quiet'], { encoding: 'utf8' });
    fs.rmSync(tmp, { recursive: true, force: true });
    const caught = (r.stdout || '').split('\n').some((l) => l.startsWith('FAIL') && (l.includes(expect) || l.includes(`${scen}: crashed`)));
    if (caught) ok++;
    console.log(`${caught ? 'CAUGHT' : 'MISSED'}  ${label} -> ${scen}${caught ? '' : '\n' + (r.stdout || r.stderr).slice(-600)}`);
  }
  console.log(`\n${ok}/${B.length} broken builds caught`);
}
