// Sequence player: compile, play, skip, seek — C6 owns this file.
//
// The architecture, decided in W0 because the harness depends on it (REVIEW.md B5):
//
//   A sequence generator runs ONCE, at play/seek time, to COMPILE a timeline of absolute-time
//   beats. play() evaluates that timeline from a clock; seek() evaluates it from an argument.
//   Nothing evaluates the generator a second time.
//
// Two rules follow, and a sequence that breaks either cannot be posed:
//   1. A beat's tweens must be idempotent and side-effect-free. Side effects go through rig.on(),
//      which is edge-triggered under play and suppressed entirely under seek.
//   2. A generator must not read live world state at compile time (camera position, a ship's
//      current heading). Take it from ctx or use an explicit pose — otherwise the same t poses
//      differently on the second call and score movement stops meaning anything.

import { PACE } from '../config.js';

export class Director {
  constructor(rig) {
    this.rig = rig;
    this.sequences = new Map();
    this.pace = 'full';
    this.current = null;
    this.rate = 1;
    this.onBeat = null;      // (id, phase) — C7's hook for HUD state, never for camera work
  }

  registerSequence(id, gen) { this.sequences.set(id, gen); }
  has(id) { return this.sequences.has(id); }
  ids() { return [...this.sequences.keys()]; }

  setPace(mode) { if (PACE[mode]) this.pace = mode; return this.pace; }

  // Hold-anywhere fast-forward. Not a skip: the result still lands, it just lands quickly.
  setRate(x) { this.rate = Math.max(0.05, x || 1); }

  compile(id, ctx = {}) {
    const gen = this.sequences.get(id);
    if (!gen) return null;
    this.rig.reset();
    const it = gen(this.rig, { pace: this.pace, ...ctx });
    const beats = [];
    let t = 0, guard = 0;
    while (guard++ < 500) {
      const step = it.next();
      const ms = step.value?.until ?? 0;
      beats.push({ t0: t, t1: t + ms, tweens: this.rig.tweens.splice(0), fx: this.rig.fx.splice(0), fired: false });
      t += ms;
      if (step.done) break;
    }
    return { id, beats, duration: t };
  }

  // ms is absolute time into the sequence. `fx:false` is what makes seek deterministic.
  // Evaluating a timeline is the director CLAIMING the camera. Until this has run at least once the
  // rig writes nothing, so a scenario that never touches the director keeps the camera its own
  // frameCamera()/seaCamera() set — which is every scored scenario C6 does not own.
  // `duration()` compiles without evaluating and therefore does not claim it.
  evaluate(tl, ms, fx = true) {
    this.rig.posed = true;
    this.rig.now = ms;
    for (const b of tl.beats) {
      if (b.t0 > ms) break;
      const span = b.t1 - b.t0;
      const u = span > 0 ? Math.min(1, (ms - b.t0) / span) : 1;
      for (const tw of b.tweens) tw.apply(u);
      if (fx && !b.fired) { b.fired = true; for (const f of b.fx) f(); }
    }
    this.rig.commit();
  }

  play(id, ctx = {}) {
    const tl = this.compile(id, ctx);
    if (!tl) return Promise.resolve();
    return new Promise(done => {
      this.current = { tl, ms: 0, done };
      this.evaluate(tl, 0);
      this.onBeat?.(id, 'start');
    });
  }

  update(dt) {
    const c = this.current;
    if (c) {
      c.ms += dt * 1000 * this.rate;
      this.evaluate(c.tl, c.ms);
      if (c.ms >= c.tl.duration) { this.current = null; this.onBeat?.(c.tl.id, 'end'); c.done(); }
    }
    // after evaluate: the timeline sets the pose, the rig composes it with shake and free-look
    this.rig.update(dt * this.rate);
  }

  // Jump to the end state, firing every side effect that had not fired yet.
  skip() {
    const c = this.current;
    if (!c) return;
    this.evaluate(c.tl, c.tl.duration);
    this.current = null;
    this.onBeat?.(c.tl.id, 'end');
    c.done();
  }

  playing() { return !!this.current; }

  // Deterministic pose at t ∈ [0,1]. Nothing animating, nothing spawned. shot.mjs --at= uses this.
  seek(id, t, ctx = {}) {
    const tl = this.compile(id, ctx);
    if (!tl) return false;
    this.current = null;
    this.evaluate(tl, tl.duration * Math.max(0, Math.min(1, t)), false);
    return true;
  }

  duration(id, ctx = {}) { return this.compile(id, ctx)?.duration ?? 0; }
}
