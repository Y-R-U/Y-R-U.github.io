// controls.js — one drag anywhere on screen steers the rig. Mouse, touch and
// keyboard all feed the same normalised (dx, dz) vector in camera space.

import { CAM } from './config.js';
import { clamp } from './utils.js';

export class Controls {
  constructor(el, stickEl) {
    this.el = el;
    this.stick = stickEl || null;
    this.active = false;
    this.originX = 0; this.originY = 0;
    this.curX = 0; this.curY = 0;
    this.dx = 0; this.dz = 0;       // camera-space input, length <= 1
    this.keys = new Set();
    this.enabled = true;
    this.pointerId = null;
    this.MAX = 74;                   // px of drag for full tilt
    this._bind();
  }

  _bind() {
    const el = this.el;
    const down = (e) => {
      if (!this.enabled) return;
      if (e.target.closest && e.target.closest('.no-drag')) return;
      this.pointerId = e.pointerId;
      this.active = true;
      this.originX = this.curX = e.clientX;
      this.originY = this.curY = e.clientY;
      this._showStick(true);
      el.setPointerCapture && el.setPointerCapture(e.pointerId);
    };
    const move = (e) => {
      if (!this.active || e.pointerId !== this.pointerId) return;
      this.curX = e.clientX; this.curY = e.clientY;
      this._compute();
      e.preventDefault();
    };
    const up = (e) => {
      if (e.pointerId !== this.pointerId) return;
      this.active = false;
      this.dx = this.dz = 0;
      this._showStick(false);
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.key.toLowerCase());
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => { this.keys.clear(); this.active = false; this.dx = this.dz = 0; this._showStick(false); });
  }

  _compute() {
    let vx = this.curX - this.originX;
    let vy = this.curY - this.originY;
    const len = Math.hypot(vx, vy);
    if (len > this.MAX) {
      // drag beyond the ring: pull the origin along so it never feels stuck
      const k = (len - this.MAX) / len;
      this.originX += vx * k; this.originY += vy * k;
      vx *= this.MAX / len; vy *= this.MAX / len;
    }
    this.dx = vx / this.MAX;
    this.dz = vy / this.MAX;
    this._drawStick(vx, vy);
  }

  _showStick(on) {
    if (!this.stick) return;
    this.stick.style.display = on ? 'block' : 'none';
    if (on) {
      this.stick.style.left = this.originX + 'px';
      this.stick.style.top = this.originY + 'px';
      this._drawStick(0, 0);
    }
  }

  _drawStick(vx, vy) {
    if (!this.stick || this.stick.style.display === 'none') return;
    this.stick.style.left = this.originX + 'px';
    this.stick.style.top = this.originY + 'px';
    const nub = this.stick.firstElementChild;
    if (nub) nub.style.transform = `translate(-50%,-50%) translate(${vx}px,${vy}px)`;
  }

  /** world-space direction, honouring the fixed camera yaw */
  read() {
    let x = this.dx, z = this.dz;
    if (this.keys.size) {
      let kx = 0, kz = 0;
      if (this.keys.has('a') || this.keys.has('arrowleft')) kx -= 1;
      if (this.keys.has('d') || this.keys.has('arrowright')) kx += 1;
      if (this.keys.has('w') || this.keys.has('arrowup')) kz -= 1;
      if (this.keys.has('s') || this.keys.has('arrowdown')) kz += 1;
      if (kx || kz) {
        const l = Math.hypot(kx, kz);
        x = kx / l; z = kz / l;
      }
    }
    const l = Math.hypot(x, z);
    if (l < 0.06) return { x: 0, z: 0, mag: 0 };
    const yaw = CAM.YAW;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    // screen-right / screen-down mapped onto the ground plane
    const wx = x * cos - z * sin;
    const wz = x * sin + z * cos;
    const mag = clamp(l, 0, 1);
    const wl = Math.hypot(wx, wz) || 1;
    return { x: (wx / wl) * mag, z: (wz / wl) * mag, mag };
  }

  reset() { this.active = false; this.dx = this.dz = 0; this.keys.clear(); this._showStick(false); }
}
