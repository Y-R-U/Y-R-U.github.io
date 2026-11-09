// Headless AI play: one shot (plan → noise → simulate with a 30 Hz trace) and whole holes / rounds.
// Used inline (node tests, sync fallback) and inside the worker. Node-safe, no THREE.
import { Ball } from '../engine/physics.js';
import { HZ } from '../engine/constants.js';
import { Planner } from './planner.js';
import { AIGolfer } from './golfers.js';

export const TRACE_HZ = 30;
export const TRACE_EVERY = Math.round(HZ / TRACE_HZ);   // physics steps per ghost sample

// Plain-data ball state <-> Ball (the planner and the worker pass these around).
export function ballState(b) { return { x: b.px, y: b.py, z: b.pz, sup: b.supported, n: [b.nx, b.ny, b.nz], surf: b.surf }; }
export function ballFrom(s) {
  const b = new Ball(s.x, s.y, s.z);
  if (s.sup != null) { b.supported = s.sup; [b.nx, b.ny, b.nz] = s.n; b.surf = s.surf; }
  return b;
}
export function asGolfer(g) { return g instanceof AIGolfer ? g : new AIGolfer(g); }

// One AI stroke from `ball` with the obstacle clock at `t0` (the moment the golfer is ready).
// ticket = golfer.ticket() drawn by the caller. Returns { plan, shot, t0, state, from, to, walls, path, events, ball, t1 }.
export function takeShot(planner, golfer, ball, t0, ticket, { trace = true, budgetScale = 1, budgetMs = 0 } = {}) {
  const b = ball instanceof Ball ? ball : ballFrom(ball);
  const plan = planner.plan(b, { t0, ...golfer.style({ budgetScale }), ...(budgetMs ? { budgetMs } : {}) });
  const shot = golfer.execute(plan, ticket);
  const ts = t0 + shot.wait;
  const r = planner.simulate(b, shot.aim, shot.power, ts, { trace: trace ? TRACE_EVERY : 0 });
  return {
    plan: { aim: plan.aim, power: plan.power, wait: plan.wait, cost: plan.cost, sims: plan.sims, steps: plan.steps, ms: plan.ms },
    shot, t0: ts, state: r.state, from: [b.px, b.py, b.pz], to: [r.x, r.y, r.z], walls: r.walls,
    path: r.path ? Float32Array.from(r.path) : null, events: r.events, ball: r.ball, t1: r.t1, steps: r.steps,
  };
}

// Play a whole hole. Returns a ghost record:
// { hole, golfer, par, strokes, pickedUp, oob, ace, shots: [{ n, t0, aim, power, from, to, state, walls, path, hz, penalty }] }
export function playHoleSync({ planner, hole, golfer, t0 = 0, maxStrokes, trace = true, budgetScale = 1, think = [1.0, 1.0], firstThink = null }) {
  golfer = asGolfer(golfer);
  planner = planner || new Planner(hole);
  hole = planner.hole;
  const max = maxStrokes ?? hole.par + 4;   // D10
  let ball = new Ball(hole.tee.x, hole.tee.y, hole.tee.z);
  let t = t0, strokes = 0, oob = 0, holed = false;
  const shots = [];
  while (strokes < max) {
    const ticket = golfer.ticket();
    const th = strokes === 0 && firstThink ? firstThink : think;   // (the rng draw is the same either way)
    const ready = t + th[0] + golfer.rng() * th[1];
    const s = takeShot(planner, golfer, ball, ready, ticket, { trace, budgetScale });
    strokes++;
    const rec = { n: strokes, t0: s.t0, aim: s.shot.aim, power: s.shot.power, plan: s.plan, from: s.from, to: s.to, state: s.state, walls: s.walls, path: s.path, hz: TRACE_HZ, penalty: 0 };
    shots.push(rec);
    t = s.t1;
    if (s.state === 'cup') { holed = true; break; }
    if (s.state === 'oob') {   // D9: +1 and back to the last rest spot
      oob++; strokes++; rec.penalty = 1; rec.to = s.from;
      ball = ballFrom({ x: s.from[0], y: s.from[1], z: s.from[2] });
      t += 1.0;
    } else ball = s.ball;
  }
  const score = holed ? strokes : max;
  return { hole: hole.id, par: hole.par, golfer: golfer.toJSON(), strokes: Math.min(score, max), pickedUp: !holed, oob, ace: holed && strokes === 1, shots, tEnd: t };
}

// Records a shot played in the game (the player's own, or any live ball) in the ghost format.
//   rec.begin({ t0, aim, power, from: [x,y,z] }); per physics step rec.step(ball); rec.end(state, to) → shot
export class GhostRecorder {
  constructor() { this.shots = []; this.cur = null; }
  begin({ t0 = 0, aim = 0, power = 0, from }) { this.cur = { n: this.shots.length + 1, t0, aim, power, from, pts: [...from], k: 0, hz: TRACE_HZ, penalty: 0 }; }
  step(b) {
    const c = this.cur; if (!c) return;
    if (++c.k % TRACE_EVERY === 0) c.pts.push(b.px, b.py, b.pz);
  }
  end(state, to) {
    const c = this.cur; if (!c) return null;
    this.cur = null;
    const shot = { n: c.n, t0: c.t0, aim: c.aim, power: c.power, from: c.from, to, state, path: Float32Array.from(c.pts), hz: c.hz, penalty: state === 'oob' ? 1 : 0 };
    if (to && state !== 'oob') shot.path = Float32Array.from([...c.pts, to[0], to[1], to[2]]);
    this.shots.push(shot);
    return shot;
  }
  record(meta = {}) { return { ...meta, shots: this.shots }; }
}
