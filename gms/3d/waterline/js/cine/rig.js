// Camera verbs — C6 owns this file.
//
// Every verb records a `{ apply(u) }` tween rather than mutating the camera directly. That is what
// makes a sequence a compilable timeline (see director.js): the same recorded beats are evaluated
// from a clock by play(), from an argument by seek(). apply(u) must therefore be **idempotent and
// side-effect-free** — evaluating u=0.4 twice must land the same pose, and must not spawn anything.
//
// Tweens write to the rig's OWN pose fields, never to the camera. `commit()` is the only thing that
// touches the camera, and it composes pose + jolt + sway + free-look in that order. Without that
// split, free-look and the timeline fight over camera.quaternion and whichever ran last wins.
//
// Anything that IS a side effect (a muzzle flash, a sound) goes through rig.on(fn), which is
// edge-triggered and suppressed entirely under seek.

import * as THREE from 'three';
import { LOOK } from '../config.js';

const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export const EASE = {
  linear: t => t,
  inOut: easeInOut,
  in: t => t * t,
  out: t => 1 - (1 - t) ** 2,
  outCubic: t => 1 - (1 - t) ** 3,
  inCubic: t => t * t * t,
  // Overshoot-free "settle": fast start, long tail. What a crane arm actually does.
  settle: t => 1 - (1 - t) ** 4,
};

const UP = new THREE.Vector3(0, 1, 0);

// The look target that puts `subject` at a chosen NDC. Composition by arithmetic rather than by
// nudging numbers until it looks right — and it re-solves itself when the subject moves, which is
// what a chase camera needs.
export function aimFor(pos, subject, ndc, fovDeg, aspect) {
  const f = subject.clone().sub(pos);
  const dist = f.length() || 1;
  const tanY = Math.tan((fovDeg * Math.PI) / 360);
  let d = f.clone().normalize();
  for (let i = 0; i < 2; i++) {
    const right = new THREE.Vector3().crossVectors(d, UP).normalize();
    const up = new THREE.Vector3().crossVectors(right, d).normalize();
    d = f.clone().normalize()
      .addScaledVector(right, -ndc[0] * tanY * aspect)
      .addScaledVector(up, -ndc[1] * tanY)
      .normalize();
  }
  return pos.clone().addScaledVector(d, dist);
}
const _v = new THREE.Vector3();
const _t = new THREE.Vector3();

export class Rig {
  constructor(app) {
    this.app = app;
    this.camera = app.camera;
    this.pos = new THREE.Vector3().copy(app.camera.position);
    this.target = new THREE.Vector3();
    this.fovDeg = app.camera.fov;
    this.rollRad = 0;
    this.tweens = [];
    this.fx = [];

    // absolute ms into the current timeline; the director writes it before every evaluate, so
    // anything time-driven here is a pure function of the playhead and survives seek()
    this.now = 0;

    this.jolt = { amp: 0, hz: 26, u: 1 };
    this.sway = { pos: 0, aim: 0, hz: 0.21 };

    this.lk = { on: false, yaw: 0, pitch: 0, idle: 0, from: null, ease: 0 };

    // False until a timeline has applied a beat (or adopt() is called). While false the rig does
    // not touch the camera at all — see commit().
    this.posed = false;

    this.shakeAmp = 0;
    this.shakeLeft = 0;
  }

  // Immediate-looking verbs are recorded too, as zero-length tweens. If they applied straight away
  // the compile pass would run every one of them and the camera would end up at the LAST pose in
  // the sequence no matter what t you asked for.
  at(v3) { const p = v3.clone(); return this.tween(0, () => this.pos.copy(p)); }

  look(v3) { const p = v3.clone(); return this.tween(0, () => this.target.copy(p)); }

  cut(pos, at) { return this.at(pos).look(at); }

  fov(deg, ms = 0) {
    const from = this.fovDeg;
    return this.tween(ms, u => { this.fovDeg = ms ? from + (deg - from) * u : deg; });
  }

  roll(deg, ms = 0, ease = easeInOut) {
    const from = this.rollRad, to = THREE.MathUtils.degToRad(deg);
    return this.tween(ms, u => { this.rollRad = ms ? from + (to - from) * ease(u) : to; });
  }

  dolly(fromPos, toPos, ms, ease = easeInOut) {
    const a = fromPos.clone(), b = toPos.clone();
    return this.tween(ms, u => this.pos.lerpVectors(a, b, ease(u)));
  }

  // A dolly and an aim change at once — the pair that makes up most beats.
  move(fromPos, toPos, fromLook, toLook, ms, ease = easeInOut) {
    const a = fromPos.clone(), b = toPos.clone(), c = fromLook.clone(), d = toLook.clone();
    return this.tween(ms, u => {
      const e = ease(u);
      this.pos.lerpVectors(a, b, e);
      this.target.lerpVectors(c, d, e);
    });
  }

  // Catmull-Rom through the given points. A straight lerp between two poses reads as a slide; a
  // real crane move curves, and the curve is what sells the flyover.
  path(points, ms, { ease = easeInOut, look = null, tension = 0.5 } = {}) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => p.clone()), false, 'catmullrom', tension);
    const lookCurve = look && look.length > 1
      ? new THREE.CatmullRomCurve3(look.map(p => p.clone()), false, 'catmullrom', tension)
      : null;
    const lookOne = look && look.length === 1 ? look[0].clone() : null;
    return this.tween(ms, u => {
      const e = ease(u);
      curve.getPoint(e, this.pos);
      if (lookCurve) lookCurve.getPoint(e, this.target);
      else if (lookOne) this.target.copy(lookOne);
    });
  }

  orbit(centre, radius, fromDeg, toDeg, ms, { y = null, ease = easeInOut } = {}) {
    const c = centre.clone();
    const h = y == null ? this.pos.y : y;
    return this.tween(ms, u => {
      const a = THREE.MathUtils.degToRad(fromDeg + (toDeg - fromDeg) * ease(u));
      this.pos.set(c.x + Math.cos(a) * radius, h, c.z + Math.sin(a) * radius);
      this.target.copy(c);
    });
  }

  // The general beat: fn(u) returns any of { pos, look, fov, roll }. Everything parametric — a
  // chase camera trailing a moving shell, a whip pan — is written with this.
  pose(ms, fn, ease = null) {
    return this.tween(ms, u => {
      const p = fn(ease ? ease(u) : u, u);
      if (!p) return;
      if (p.pos) this.pos.copy(p.pos);
      if (p.look) this.target.copy(p.look);
      if (p.fov !== undefined) this.fovDeg = p.fov;
      if (p.roll !== undefined) this.rollRad = p.roll;
    });
  }

  hold(ms) { return this.tween(ms, () => {}); }

  // Drives renderer.toneMappingExposure. Scripted, never auto-exposed: a luminance readback is a
  // GPU stall on mobile and reads as a bug (BUILD_PLAN §7.1). `lag` delays the ramp against the
  // camera so it reads as an eye adapting rather than as a cross-fade.
  exposure(from, to, ms, lag = 0) {
    const r = this.app.renderer;
    const span = Math.max(1, ms - lag);
    return this.tween(ms, u => {
      const k = THREE.MathUtils.clamp((u * ms - lag) / span, 0, 1);
      const v = from + (to - from) * (k * k * (3 - 2 * k));
      r.toneMappingExposure = v;
      // keep the knob's stored value honest, without emitting: every listener on quality re-runs
      // on emit and this tween is per-frame (D12's lesson, applied in the other direction)
      this.app.quality.settings.exposure = v;
    });
  }

  // Deterministic camera shake: a decaying oscillation of the playhead, so it poses under seek and
  // is identical between runs. `shake()` (random, edge-triggered) is kept for gameplay only.
  kick(amp, ms, hz = 24) {
    return this.tween(ms, u => { this.jolt.amp = amp * (1 - u) ** 2; this.jolt.hz = hz; this.jolt.u = u; });
  }

  // Handheld float. Amplitude in metres (pos) and metres of aim offset at the target.
  drift(pos, aim, hz = 0.21) { return this.tween(0, () => { this.sway.pos = pos; this.sway.aim = aim; this.sway.hz = hz; }); }

  // Random per frame, so it can never be part of a deterministic pose. Edge-triggered.
  shake(amp, ms) { return this.on(() => { this.shakeAmp = amp; this.shakeLeft = ms / 1000; }); }

  // The only way to cause a side effect from a sequence. Fires once, when the playhead reaches the
  // beat, and never under seek.
  on(fn) { this.fx.push(fn); return this; }

  tween(ms, apply) { this.tweens.push({ ms, apply }); return this; }

  // Free look — brief step 2, REVIEW.md B3. NOT part of a sequence: a live offset the player drags,
  // applied after the timeline every frame and eased back to zero after LOOK.idleMs of no input.
  freeLook(enabled) {
    this.lk.on = !!enabled;
    if (!enabled) { this.lk.yaw = this.lk.pitch = 0; this.lk.from = null; }
    return this;
  }

  // dx/dy in CSS pixels.
  nudge(dx, dy) {
    const l = this.lk;
    if (!l.on) return this;
    l.yaw = THREE.MathUtils.clamp(l.yaw - dx * LOOK.sensitivity, -LOOK.maxYaw, LOOK.maxYaw);
    l.pitch = THREE.MathUtils.clamp(l.pitch - dy * LOOK.sensitivity, -LOOK.maxPitch, LOOK.maxPitch);
    l.idle = 0;
    l.from = null;
    return this;
  }

  lookOffset() { return { yaw: this.lk.yaw, pitch: this.lk.pitch }; }

  // Ease back to the board. Ease, not snap — a hard snap on a phone reads as a bug (brief step 2).
  updateLook(dt) {
    const l = this.lk;
    if (!l.on || (!l.yaw && !l.pitch)) return;
    l.idle += dt * 1000;
    if (l.idle < LOOK.idleMs) return;
    if (!l.from) { l.from = { yaw: l.yaw, pitch: l.pitch }; l.ease = 0; }
    l.ease = Math.min(1, l.ease + (dt * 1000) / LOOK.easeMs);
    const k = 1 - easeInOut(l.ease);
    l.yaw = l.from.yaw * k;
    l.pitch = l.from.pitch * k;
    if (l.ease >= 1) { l.yaw = l.pitch = 0; l.from = null; }
  }

  // Composes the camera. The ONLY place the camera is written — and it writes NOTHING until a
  // sequence has actually authored a pose.
  //
  // That guard is load-bearing, not defensive. main.js pumps director.update() every frame from
  // boot, so without it the rig's constructor defaults (App's boot pose, 24/12/34 looking at the
  // origin) were stamped over the camera on the frame after any scenario called frameCamera() or
  // seaCamera(). Every scored scenario that poses its own camera — C1's, C2's, C3's, C4's — was
  // being captured from the boot pose. Measured, not reasoned about: see §11 of HANDOFF_CINE.
  //
  // Same failure family as D12/D15/D17: a value written once at setup and also written by
  // something that runs every frame belongs to the thing that runs every frame. The rig is that
  // thing, so the rig is what has to stay out of the way until it is asked for.
  commit() {
    if (!this.posed) return;
    const c = this.camera;
    const s = this.sway;
    const tt = Math.max(0, this.now) / 1000;

    _v.copy(this.pos);
    _t.copy(this.target);

    if (s.pos || s.aim) {
      // two incommensurate rates so the loop is not countable over a 4 s beat
      const a = Math.sin(tt * s.hz * 6.283), b = Math.sin(tt * s.hz * 4.13 + 1.7), d = Math.sin(tt * s.hz * 2.71 + 3.1);
      _v.x += a * s.pos; _v.y += b * s.pos * 0.7; _v.z += d * s.pos * 0.5;
      _t.x += b * s.aim; _t.y += d * s.aim * 0.8;
    }

    if (this.jolt.amp > 0.0001) {
      const j = this.jolt;
      const p = j.u * j.hz * 6.283;
      _v.y += Math.sin(p) * j.amp;
      _v.x += Math.sin(p * 0.77 + 1.1) * j.amp * 0.8;
      _t.y += Math.sin(p * 1.31) * j.amp * 1.6;
    }

    if (this.shakeLeft > 0) {
      const k = this.shakeAmp * Math.max(0, this.shakeLeft);
      _v.x += (Math.random() - 0.5) * k;
      _v.y += (Math.random() - 0.5) * k;
    }

    c.position.copy(_v);
    c.up.set(0, 1, 0);
    c.lookAt(_t);
    if (this.rollRad) c.rotateZ(this.rollRad);

    const l = this.lk;
    if (l.on && (l.yaw || l.pitch)) {
      c.rotateOnWorldAxis(UP, l.yaw);
      c.rotateX(l.pitch);
    }

    if (c.fov !== this.fovDeg) { c.fov = this.fovDeg; c.updateProjectionMatrix(); }
  }

  // Per-frame decay + free-look ease. Once a sequence has posed, this keeps running after it ends,
  // so the final pose holds and free-look still works with no timeline playing. Before that it
  // does nothing at all and the camera belongs to whoever set it.
  update(dt) {
    if (!this.posed) return;
    if (this.shakeLeft > 0) this.shakeLeft -= dt;
    this.updateLook(dt);
    this.commit();
  }

  // Adopt the camera's current transform as the pose, so a sequence authored to start "wherever we
  // are" (a scenario's frameCamera, a cut from C7) does not snap on the first frame. This is also
  // the explicit way to take the camera when no sequence is going to run.
  adopt() {
    this.pos.copy(this.camera.position);
    this.camera.getWorldDirection(_v);
    this.target.copy(this.camera.position).addScaledVector(_v, 12);
    this.fovDeg = this.camera.fov;
    this.rollRad = 0;
    this.posed = true;
    return this;
  }

  // Hand the camera back to whoever poses it directly. A scenario or a screen that wants to own
  // the camera after a sequence has run calls this; until something poses again, commit() is inert.
  release() { this.posed = false; this.lk.yaw = this.lk.pitch = 0; this.lk.from = null; return this; }

  posedByTimeline() { return this.posed; }

  reset() {
    this.tweens.length = 0;
    this.fx.length = 0;
    this.shakeLeft = 0;
    this.jolt.amp = 0;
    this.sway.pos = this.sway.aim = 0;
    this.rollRad = 0;
  }
}
