/* Orbit with one finger, pinch to zoom, and a cinematic follow that swings in
   behind whatever you tapped and stays with it. */

import * as THREE from 'three';
import { clamp, lerp, damp, TAU } from '../util.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

export function lerpAngle(a, b, t) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU;
  return a + d * t;
}

export class Orbit {
  constructor(cam, dom) {
    this.cam = cam; this.dom = dom;
    this.tgt = new THREE.Vector3(0, 1.2, 0);
    this.goal = this.tgt.clone();
    this.yaw = 0.30; this.pitch = 0.10; this.dist = 7;
    this.yawG = this.yaw; this.pitchG = this.pitch; this.distG = this.dist;
    this.minD = 0.7; this.maxD = 30;
    this.dims = [4, 2.4, 2.2];
    this.follow = null; this.followT = 0;
    this.bias = 0; this.frameBias = 0;
    this.dragging = false; this.px = 0; this.py = 0; this.pinch = 0; this.moved = 0;
    this.enabled = true;
    this.bind();
  }
  bind() {
    const d = this.dom;
    const down = e => {
      if (!this.enabled) return;
      this.dragging = true; this.moved = 0;
      const t = e.touches ? e.touches[0] : e;
      this.px = t.clientX; this.py = t.clientY;
      if (e.touches && e.touches.length === 2)
        this.pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    };
    const move = e => {
      if (!this.dragging || !this.enabled) return;
      if (e.touches && e.touches.length === 2) {
        const p = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        if (this.pinch) this.distG = clamp(this.distG * (this.pinch / p), this.minD, this.maxD);
        this.pinch = p; this.moved += 9;
        return;
      }
      const t = e.touches ? e.touches[0] : e;
      const dx = t.clientX - this.px, dy = t.clientY - this.py;
      this.px = t.clientX; this.py = t.clientY;
      this.moved += Math.abs(dx) + Math.abs(dy);
      this.yawG -= dx * 0.0055;
      this.pitchG = clamp(this.pitchG + dy * 0.0045, -0.55, 1.15);
    };
    const up = () => { this.dragging = false; this.pinch = 0; };
    d.addEventListener('mousedown', down);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    d.addEventListener('touchstart', down, { passive: true });
    d.addEventListener('touchmove', move, { passive: true });
    d.addEventListener('touchend', up, { passive: true });
    d.addEventListener('wheel', e => {
      if (!this.enabled) return;
      e.preventDefault();
      this.distG = clamp(this.distG * (1 + Math.sign(e.deltaY) * 0.11), this.minD, this.maxD);
    }, { passive: false });
  }
  fitDistance() {
    const [W, H, D] = this.dims;
    const t = Math.tan((this.cam.fov * Math.PI / 180) / 2);
    const byH = (H * 0.92) / t;
    const byW = (W * 0.74) / (t * Math.max(0.35, this.cam.aspect));
    return clamp(Math.max(byH, byW) + D * 0.55, 1.2, 70);
  }
  frame(dims, instant = false) {
    this.dims = dims.slice();
    const [W, H, D] = dims;
    this.goal.set(0, H * 0.48, 0);
    this.distG = this.fitDistance();
    this.maxD = Math.max(W, D) * 4 + 26;
    if (instant) { this.tgt.copy(this.goal); this.dist = this.distG; }
  }
  /** Only correct a view that has become useless, never fight a deliberate one.
      The player is allowed to pull back far enough to see the room. */
  refit() {
    if (this.follow) return;
    const want = this.fitDistance();
    if (this.distG < want * 0.30) this.distG = want;
    this.maxD = Math.max(this.dims[0], this.dims[2]) * 4 + 26;
  }
  setFollow(f) { this.follow = f; this.followT = 0; }
  update(dt) {
    const k = clamp(dt * 5.5, 0, 1);
    if (this.follow && this.follow.alive && this.follow.pos) {
      this.followT += dt;
      const f = this.follow;
      const back = _a.copy(f.vel).normalize().multiplyScalar(-1);
      if (back.lengthSq() < 1e-5) back.set(-1, 0, 0);
      const want = _b.copy(f.pos).addScaledVector(back, 0.5 + f.len / 14);
      this.goal.copy(f.pos);
      this.distG = lerp(this.distG, Math.max(0.42, f.len / 9 * 2.3), clamp(dt * 1.4, 0, 1));
      const wy = Math.atan2(want.z - f.pos.z, want.x - f.pos.x);
      this.yawG = lerpAngle(this.yawG, -wy + Math.PI / 2, clamp(dt * 0.9, 0, 1));
      this.pitchG = lerp(this.pitchG, 0.07 + Math.sin(this.followT * 0.18) * 0.1, clamp(dt * 0.8, 0, 1));
    }
    this.tgt.lerp(this.goal, k);
    this.yaw = lerpAngle(this.yaw, this.yawG, k);
    this.pitch = lerp(this.pitch, this.pitchG, k);
    this.dist = lerp(this.dist, this.distG, k);
    const cp = Math.cos(this.pitch);
    this.cam.position.set(
      this.tgt.x + Math.sin(this.yaw) * cp * this.dist,
      this.tgt.y + Math.sin(this.pitch) * this.dist,
      this.tgt.z + Math.cos(this.yaw) * cp * this.dist);
    this.bias = damp(this.bias, this.frameBias, 4, dt);
    if (Math.abs(this.bias) > 0.001) {
      const visH = 2 * this.dist * Math.tan((this.cam.fov * Math.PI / 180) / 2);
      this.cam.lookAt(_c.set(this.tgt.x, this.tgt.y - this.bias * visH, this.tgt.z));
    } else this.cam.lookAt(this.tgt);
  }
}
