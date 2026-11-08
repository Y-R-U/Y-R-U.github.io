// GhostSim: a recorded ghost (story rival, any replayed AI ball on the hole) as a ball the physics can
// hit (notes/ballhit.md). Node-safe, no THREE.
//
//  * replay: while undisturbed the ghost is a *kinematic* ball posed from its recorded shots on the
//    obstacle clock (pose(t) is a pure function of the record and world.time), so it replays exactly as
//    recorded. It takes part in ball-vs-ball collisions (collideBalls) but is not stepped.
//  * live: the first impact (it hits a ball or is hit) knocks it off its line — from then on it is a
//    normal Ball stepped by stepBalls with the others, and when it comes to rest it plays on like a
//    real golfer: the AI planner (js/ai) at the ghost's own level picks each next shot.
//  * rules: out of bounds = +1 and back to its last resting spot (D9) — also when another ball knocked it
//    out (back to where it was hit; the shooter pays nothing); knocked into the cup = holed at its
//    current strokes; picked up at par + 4 (D10).
//
//   const g = new GhostSim({ shots, maxStrokes, golfer, tee, plan });   // plan(ballState, tReady) → { aim, power, t0 } (or a Promise of it)
//   each physics step: g.pose(t) before stepBalls([... , g.ball]), g.after(t) after it
//   g.mode 'replay' | 'live' · g.done · g.strokes (so far) · g.result() → { strokes, picked, diverged }
import { Ball } from '../engine/physics.js';
import { BALL_R, shotSpeed } from '../engine/constants.js';

const THINK = 1.2;   // s between a live ghost's ball stopping and its next putt

export class GhostSim {
  constructor({ shots, maxStrokes, golfer = null, tee = null, plan = null, hz = 30 }) {
    this.shots = shots || [];
    this.max = maxStrokes;
    this.golfer = golfer;
    this.plan = plan;
    this.hz = hz;
    const s0 = this.shots[0];
    const p = s0 ? s0.from : tee ? [tee.x, tee.y, tee.z] : [0, 0, 0];
    this.tee = [p[0], p[1], p[2]];
    this.ball = new Ball(p[0], p[1], p[2]);
    this.ball.kinematic = true;
    this.ball.supported = true;
    this.mode = 'replay';
    this.done = false; this.holed = false; this.picked = false;
    this.strokes = 0;
    this.k = -1;            // replay: index of the shot in play / last started
    this.pending = null;    // live: { t0, aim, power } | 'wait' (a Promise in flight)
    this.motion = null;     // live: 'shot' (its own putt) | 'knock' (woken by an impact)
    this.events = [];       // for the caller: { type: 'diverge' | 'shot' | 'rest' | 'cup' | 'oob' | 'knocked' }
  }

  // Replay strokes after shot k has started: shots 0..k count 1 each + the penalties of the finished ones.
  _strokesAt(k, finished) {
    let s = 0;
    for (let i = 0; i <= k; i++) s += 1 + (i < k || finished ? (this.shots[i].penalty | 0) : 0);
    return s;
  }

  // Before a physics step at obstacle time t.
  pose(t) {
    const b = this.ball;
    if (this.done) return;
    if (this.mode === 'live') {
      const P = this.pending;
      if (b.state === 'rest' && P && P !== 'wait' && t >= P.t0) {
        const v = shotSpeed(P.power);
        b.rest = { x: b.px, y: b.py, z: b.pz };
        b.vx = Math.sin(P.aim) * v; b.vy = 0; b.vz = -Math.cos(P.aim) * v;
        b.state = 'moving'; b.restT = 0; b.moveT = 0;
        this.pending = null; this.motion = 'shot'; this.strokes++;
        this.events.push({ type: 'shot' });
      }
      return;
    }
    // replay: find the shot in play at t
    const S = this.shots;
    let k = -1;
    for (let i = 0; i < S.length; i++) if (Number.isFinite(S[i].t0) && t >= S[i].t0) k = i;
    if (k < 0) { this._place(this.tee, 'rest'); this.strokes = 0; return; }
    const s = S[k], p = s.path, n = p ? p.length / 3 : 0, hz = s.hz || this.hz;
    const f = (t - s.t0) * hz;
    if (k !== this.k) { this.k = k; this.events.push({ type: 'shot' }); }
    if (n >= 2 && f < n - 1) {
      const i = Math.floor(f), u = f - i, a = i * 3, c = a + 3;
      b.px = p[a] + (p[c] - p[a]) * u; b.py = p[a + 1] + (p[c + 1] - p[a + 1]) * u; b.pz = p[a + 2] + (p[c + 2] - p[a + 2]) * u;
      b.vx = (p[c] - p[a]) * hz; b.vy = (p[c + 1] - p[a + 1]) * hz; b.vz = (p[c + 2] - p[a + 2]) * hz;
      b.state = 'moving'; b.supported = Math.abs(b.vy) < 0.5;
      this.strokes = this._strokesAt(k, false);
      // still on the tee at the start of its first shot: never collides (it would overlap my teed ball)
      b.noHit = k === 0 && Math.hypot(b.px - this.tee[0], b.pz - this.tee[2]) < 2 * BALL_R + 0.002;
      return;
    }
    // shot k has finished
    this.strokes = this._strokesAt(k, true);
    b.noHit = false;
    if (s.state === 'cup') { this._finish(true); return; }
    const last = k === S.length - 1;
    if (last && this.strokes >= this.max) { this._finish(false); return; }
    const at = S[k + 1]?.from || s.to || (n ? [p[(n - 1) * 3], p[(n - 1) * 3 + 1], p[(n - 1) * 3 + 2]] : this.tee);
    this._place(at, 'rest');
  }
  _place(p, state) {
    const b = this.ball;
    b.px = p[0]; b.py = p[1]; b.pz = p[2]; b.vx = b.vy = b.vz = 0; b.state = state; b.supported = true;
    b.noHit = state === 'rest' && this.k < 0;   // waiting on the tee
  }
  _finish(holed) {
    this.done = true; this.holed = holed; this.picked = !holed;
    if (!holed) this.strokes = this.max;
    this.ball.state = 'cup'; this.ball.vx = this.ball.vy = this.ball.vz = 0;
  }

  // After a physics step at obstacle time t (the ball's events are read and cleared here).
  after(t) {
    const b = this.ball;
    const evs = b.events;
    if (this.mode === 'replay') {
      if (evs.some(e => e.type === 'ball' || e.type === 'knocked')) this._diverge(evs.some(e => e.type === 'knocked'));
      evs.length = 0;
      if (this.mode === 'replay') return;
    }
    for (const e of evs) {
      if (e.type === 'knocked') { this.motion = 'knock'; this.pending = null; this.events.push({ type: 'knocked' }); }
      else if (e.type === 'cup') { this.done = true; this.holed = true; this.events.push({ type: 'cup' }); }
      else if (e.type === 'oob') {
        this.strokes++;   // +1 whether it putted itself out or was knocked out (Aaron's rule)
        const r = b.rest;
        b.place(r.x, r.y, r.z); b.supported = true;
        this.events.push({ type: 'oob', knocked: this.motion === 'knock' });
        this._rested(t);
      } else if (e.type === 'rest') { this.events.push({ type: 'rest' }); this._rested(t); }
    }
    evs.length = 0;
  }
  _diverge(woken) {
    const b = this.ball;
    this.mode = 'live';
    b.kinematic = false; b.noHit = false;
    // mid-shot when hit: it's still its own putt (an OOB from here is its own +1); at rest: knocked
    this.motion = woken ? 'knock' : 'shot';
    if (b.state === 'moving') { b.restT = 0; if (!woken) b.moveT = 0; }
    this.events.push({ type: 'diverge' });
  }
  _rested(t) {
    if (this.done) return;
    if (this.strokes >= this.max) { this.done = true; this.picked = true; this.strokes = this.max; this.ball.state = 'cup'; return; }
    if (!this.plan) return;
    const tReady = t + THINK;
    this.pending = 'wait';
    const state = { x: this.ball.px, y: this.ball.py, z: this.ball.pz, sup: this.ball.supported, n: [this.ball.nx, this.ball.ny, this.ball.nz], surf: this.ball.surf };
    const done = r => { if (this.pending === 'wait' && this.ball.state === 'rest' && !this.done) this.pending = { t0: Math.max(tReady, r.t0 ?? tReady), aim: r.aim, power: r.power }; };
    try {
      const r = this.plan(state, tReady);
      if (r && typeof r.then === 'function') r.then(done, () => { this.pending = null; });
      else if (r) done(r);
    } catch { this.pending = null; }
  }

  // Score for the hole. A live ghost still out there when the hole ends finishes headlessly with
  // finishSync (a synchronous plan); an undisturbed one keeps its recorded score.
  result() { return { strokes: Math.min(this.strokes, this.max), picked: this.picked, holed: this.holed, diverged: this.mode === 'live' }; }
}

// Play a live ghost out on its own (nothing else moving): plan(state, t) must answer synchronously.
// world: the hole's World. Used when the hole ends with the ghost still on the course.
export function finishSync(g, world, plan, t = 0) {
  if (g.mode !== 'live' || g.done) return g.result();
  const DT = 1 / 240;
  const save = g.plan;
  g.plan = plan;
  const b = g.ball;
  if (b.state === 'rest' && (!g.pending || g.pending === 'wait')) { g.pending = null; g._rested(t); }
  let steps = 0;
  while (!g.done && steps < 240 * 60 * 6) {
    g.pose(t);
    if (b.state === 'moving') world.stepBall(b, t);
    g.after(t);
    if (b.state === 'rest' && !g.pending && !g.done) g._rested(t);
    if (b.state === 'rest' && g.pending && g.pending !== 'wait' && t < g.pending.t0) t = g.pending.t0;   // skip the thinking
    else t += DT;
    steps++;
  }
  if (!g.done) { g.done = true; g.picked = true; g.strokes = g.max; }
  g.plan = save;
  return g.result();
}
