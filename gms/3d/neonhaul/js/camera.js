// §6.5's two camera rigs, driven entirely off the flight model's state. This file reads `flight`
// and writes `camera`; nothing flows the other way, which is why parking the rig (a shot, a gate's
// setCamera) leaves the flight model untouched and vice versa.
//
// `bank` and `vpitch` arrive here as pure decoration (§6.3 item 1). They are applied to the
// camera's ROLL and to a small pitch offset, and to nothing else — gates_p4 forces `bank` to its
// extreme and asserts the camera moves while the velocity does not, which is the only way to show
// the decoration is both real and inert.
//
// The chase boom is collision-shortened against the SAME AABB list the hull already queried, so
// it costs one loop and no extra spatial query: a boom that clips through a facade is the classic
// way a chase camera turns a soft collision into a "the wall ate my view" moment.

import { FLIGHT as F } from './config.js';
import { clamp } from './utils.js';

const BOOM_STEPS = [1.0, 0.78, 0.56, 0.34, 0.14, 0.0];

export class CameraRig {
  constructor(camera, flight, opts = {}) {
    this.camera = camera;
    this.flight = flight;
    this.mode = opts.mode === 'chase' ? 'chase' : 'cockpit';
    this.fov = opts.fov || camera.fov;
    this.shakeAmp = 0.55;                  // metres at full shake
    this.boom = F.CHASE.dist;
    this._d = [0, 0, 0];
    this._buf = [];
    this._seed = 1;
    camera.rotation.order = 'YXZ';
  }

  setMode(m) { this.mode = m === 'chase' ? 'chase' : 'cockpit'; return this.mode; }
  setFov(v) {
    this.fov = clamp(v, F.FOV[0], F.FOV[1]);
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
    return this.fov;
  }

  update(dt, world) {
    const f = this.flight, c = this.camera;
    const rig = this.mode === 'chase' ? F.CHASE : F.COCKPIT;

    if (this.mode === 'chase') {
      const d = f.lookDir(this._d);
      let want = F.CHASE.dist;
      if (world) want *= this._clearBoom(world, d);
      // The boom shortens instantly (a wall arriving is not something to ease into) and extends
      // on a lag, so leaving a gap does not snap the view backwards.
      this.boom = want < this.boom ? want : this.boom + (want - this.boom) * (1 - Math.exp(-F.CHASE.lag * dt));
      c.position.set(
        f.px - d[0] * this.boom,
        f.py - d[1] * this.boom + F.CHASE.height,
        f.pz - d[2] * this.boom);
    } else {
      c.position.set(f.px, f.py + F.COCKPIT.height, f.pz);
    }

    if (f.shake > 0) {
      const a = this.shakeAmp * (f.shake / F.SHAKE);
      c.position.x += (this._noise() - 0.5) * a;
      c.position.y += (this._noise() - 0.5) * a;
      c.position.z += (this._noise() - 0.5) * a;
    }

    // §6.1: "Yaw and pitch, no roll ever" governs the LOOK. The roll here is §6.3 item 1's
    // cosmetic bank at a fraction of its value — enough to read as a craft leaning into a turn,
    // far short of the horizon-tilt that makes a phone unpleasant.
    c.rotation.set(f.pitch + f.vpitch * 0.35, f.yaw, f.bank * rig.rollMul);
    if (Math.abs(c.fov - this.fov) > 1e-4) { c.fov = this.fov; c.updateProjectionMatrix(); }
  }

  // Fraction of the boom that is clear of geometry. Steps rather than a sweep: six point tests
  // against ~6 candidate AABBs is nothing, and the failure mode of a coarse step (the camera sits
  // 1 m nearer than it had to) is invisible.
  _clearBoom(world, d) {
    const f = this.flight;
    const list = world.aabbsNear(f.px, f.pz, F.CHASE.dist + 4, this._buf);
    if (!list.length) return 1;
    for (const s of BOOM_STEPS) {
      const x = f.px - d[0] * F.CHASE.dist * s;
      const y = f.py - d[1] * F.CHASE.dist * s + F.CHASE.height;
      const z = f.pz - d[2] * F.CHASE.dist * s;
      let hit = false;
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        if (x > a.x0 - 1.2 && x < a.x1 + 1.2 && z > a.z0 - 1.2 && z < a.z1 + 1.2 && y < a.top + 1.2) { hit = true; break; }
      }
      if (!hit) return s;
    }
    return 0;
  }

  // Deterministic — a shake driven by Math.random() makes every soak frame a different frame and
  // any differencing gate downstream measures the shake.
  _noise() {
    this._seed = (Math.imul(this._seed, 1664525) + 1013904223) >>> 0;
    return this._seed / 4294967296;
  }

  state() {
    return { mode: this.mode, fov: +this.fov.toFixed(1), boom: +this.boom.toFixed(2),
      roll: +this.camera.rotation.z.toFixed(4) };
  }
}
