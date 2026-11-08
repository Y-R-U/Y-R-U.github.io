// Ghost replays of relayed shots: re-run another player's shot input with the same deterministic
// physics (D5) from the exact ball state they shot from, and turn it into a GhostBall record
// (30 Hz path). The reported result still wins: the ghost snaps to it when it arrives.
// Ball hits (notes/ballhit.md): a shot may carry `balls` = the resting balls the shooter simulated
// against ([{ seat, n, x, y, z }]); the replay uses exactly those, so knocks replay bit-exactly.
// Node-safe (tools/online_test.mjs, tools/ballhit_test.mjs check replay == the shooter's own sim).
import { makeWorld } from '../course/builder.js';
import { simulateShot, simulateShotWith } from '../engine/sim.js';
import { restingBall } from '../engine/physics.js';
import { ballFrom, TRACE_EVERY, TRACE_HZ } from '../ai/round.js';
import { STEADY_CLOCK } from '../meta/helpers.js';

// The ball mods a shot's helpers put on the ball (same shape as Round.applyMods).
export function modsFor(m = {}) {
  const any = m.magnet || m.sticky || m.guard || m.ghost;
  return any ? { magnet: !!m.magnet, sticky: !!m.sticky, guard: !!m.guard, ghost: m.ghost ? 1 : 0, ghostId: -1 } : null;
}

// Relayed `balls` → [{ seat, n, ball }] (seat order kept: the step order is part of determinism).
export function targetBalls(list = []) {
  return (list || []).map(o => ({ seat: o.seat, n: o.n, ball: restingBall(o.x, o.y, o.z) }));
}

// A path (array of [x,y,z] samples) → the Float32Array a GhostBall plays, starting at `from`.
function flat(from, path, end) {
  const pts = [...from];
  for (const p of path) pts.push(p[0], p[1], p[2]);
  if (end) pts.push(end[0], end[1], end[2]);
  return Float32Array.from(pts);
}

export class Replayer {
  constructor(hole) { this.hole = hole; this.world = makeWorld(hole); }
  // m: { vx, vz, t0, mods, ball: {x,y,z,sup,n,surf}, balls? } →
  //   { path, hz, state, from, to, time, knocks: [{ seat, n, state, from, to, path, hz }] }
  shot(m) {
    const b = ballFrom(m.ball);
    b.mods = modsFor(m.mods);
    const w = this.world;
    w.clock = m.mods?.steady ? STEADY_CLOCK : 1;
    const from = [b.px, b.py, b.pz];
    const tg = targetBalls(m.balls);
    const r = tg.length
      ? simulateShotWith(w, b, m.vx, m.vz, tg.map(t => t.ball), { t0: m.t0, trace: TRACE_EVERY })
      : simulateShot(w, b, m.vx, m.vz, { t0: m.t0, trace: TRACE_EVERY });
    w.clock = 1;
    const state = r.state === 'cup' || r.state === 'oob' ? r.state : 'rest';
    const knocks = [];
    (r.others || []).forEach((o, k) => {
      if (!o.moved) return;
      const st = o.state === 'cup' || o.state === 'oob' ? o.state : 'rest';
      knocks.push({ seat: tg[k].seat, n: tg[k].n, state: st, from: o.from, to: st === 'oob' ? o.from : [o.x, o.y, o.z],
        path: flat(o.from, o.path, st === 'oob' ? null : [o.x, o.y, o.z]), hz: TRACE_HZ });
    });
    return { path: flat(from, r.path, r.state !== 'oob' ? [r.x, r.y, r.z] : null), hz: TRACE_HZ, state, from,
      to: state === 'oob' ? from : [r.x, r.y, r.z], time: r.time, knocks };
  }
}
