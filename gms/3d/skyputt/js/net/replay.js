// Ghost replays of relayed shots: re-run another player's shot input with the same deterministic
// physics (D5) from the exact ball state they shot from, and turn it into a GhostBall record
// (30 Hz path). The reported result still wins: the ghost snaps to it when it arrives.
// Node-safe (tools/online_test.mjs checks replay == the shooter's own sim).
import { makeWorld } from '../course/builder.js';
import { simulateShot } from '../engine/sim.js';
import { ballFrom, TRACE_EVERY, TRACE_HZ } from '../ai/round.js';
import { STEADY_CLOCK } from '../meta/helpers.js';

// The ball mods a shot's helpers put on the ball (same shape as Round.applyMods).
export function modsFor(m = {}) {
  const any = m.magnet || m.sticky || m.guard || m.ghost;
  return any ? { magnet: !!m.magnet, sticky: !!m.sticky, guard: !!m.guard, ghost: m.ghost ? 1 : 0, ghostId: -1 } : null;
}

export class Replayer {
  constructor(hole) { this.hole = hole; this.world = makeWorld(hole); }
  // m: { vx, vz, t0, mods, ball: {x,y,z,sup,n,surf} } → { path, hz, state, from, to, time }
  shot(m) {
    const b = ballFrom(m.ball);
    b.mods = modsFor(m.mods);
    const w = this.world;
    w.clock = m.mods?.steady ? STEADY_CLOCK : 1;
    const from = [b.px, b.py, b.pz];
    const r = simulateShot(w, b, m.vx, m.vz, { t0: m.t0, trace: TRACE_EVERY });
    w.clock = 1;
    const pts = [...from];
    for (const p of r.path) pts.push(p[0], p[1], p[2]);
    if (r.state !== 'oob') pts.push(r.x, r.y, r.z);
    const state = r.state === 'cup' || r.state === 'oob' ? r.state : 'rest';
    return { path: Float32Array.from(pts), hz: TRACE_HZ, state, from, to: state === 'oob' ? from : [r.x, r.y, r.z], time: r.time };
  }
}
