// ---- touch (floating joystick + kick zone) & keyboard input ----
import { clamp } from './util.js';
import { CHARGE_TIME } from './const.js';

const STICK_R = 54;      // css px joystick radius
const TAP_TIME = 0.19;   // press shorter than this = tap

export class Input {
  constructor(el) {
    this.el = el;
    this.w = 100; this.h = 100;
    this.side = 'right';       // which side the KICK zone is on
    this.joyMode = 'float';    // 'float' | 'fixed'
    this.enabled = false;

    this.stick = { active: false, id: -1, ox: 0, oy: 0, px: 0, py: 0, x: 0, y: 0, mag: 0, justPressed: false };
    this.kick = { id: -1, held: false, heldT: 0, charge: 0, tapped: false, released: false, releasedCharge: 0 };
    this.tapEdge = false;      // any pointerdown this frame
    this.pauseEdge = false;
    this.keys = new Set();
    this._kbKick = false;

    el.addEventListener('pointerdown', (e) => this._down(e), { passive: false });
    el.addEventListener('pointermove', (e) => this._move(e), { passive: false });
    el.addEventListener('pointerup', (e) => this._up(e), { passive: false });
    el.addEventListener('pointercancel', (e) => this._up(e), { passive: false });
    window.addEventListener('keydown', (e) => this._key(e, true));
    window.addEventListener('keyup', (e) => this._key(e, false));
  }

  layout(w, h) {
    this.w = w; this.h = h;
    const kx = this.side === 'right' ? w - 80 : 80;
    this.kickAnchor = { x: kx, y: h - 110, r: 46 };
    const sx = this.side === 'right' ? 86 : w - 86;
    this.stickAnchor = { x: sx, y: h - 116 };
  }

  _inKickZone(x) {
    return this.side === 'right' ? x > this.w * 0.55 : x < this.w * 0.45;
  }

  _down(e) {
    e.preventDefault();
    this.tapEdge = true;
    if (!this.enabled) return;
    const x = e.clientX, y = e.clientY;
    if (this._inKickZone(x)) {
      if (this.kick.id === -1 && !this.kick.held) {
        this.kick.id = e.pointerId;
        this.kick.held = true; this.kick.heldT = 0; this.kick.charge = 0;
      }
    } else if (!this.stick.active) {
      const s = this.stick;
      s.active = true; s.id = e.pointerId; s.justPressed = true;
      if (this.joyMode === 'fixed') { s.ox = this.stickAnchor.x; s.oy = this.stickAnchor.y; }
      else { s.ox = x; s.oy = y; }
      s.px = x; s.py = y;
      this._calcStick();
    }
  }

  _move(e) {
    if (!this.enabled) return;
    if (e.pointerId === this.stick.id) {
      e.preventDefault();
      this.stick.px = e.clientX; this.stick.py = e.clientY;
      this._calcStick();
    }
  }

  _up(e) {
    if (e.pointerId === this.stick.id) {
      this.stick.active = false; this.stick.id = -1;
      this.stick.x = 0; this.stick.y = 0; this.stick.mag = 0;
    }
    if (e.pointerId === this.kick.id) {
      this.kick.id = -1;
      this._releaseKick();
    }
  }

  _releaseKick() {
    if (!this.kick.held) return;
    this.kick.held = false;
    if (this.kick.heldT < TAP_TIME) this.kick.tapped = true;
    else { this.kick.released = true; this.kick.releasedCharge = this.kick.charge; }
    this.kick.heldT = 0; this.kick.charge = 0;
  }

  _calcStick() {
    const s = this.stick;
    let dx = (s.px - s.ox) / STICK_R, dy = (s.py - s.oy) / STICK_R;
    const m = Math.hypot(dx, dy);
    if (m > 1) { dx /= m; dy /= m; }
    // drag the floating origin along when pushed past the rim (feels great)
    if (this.joyMode === 'float' && m > 1.25) {
      s.ox = s.px - dx * STICK_R * 1.25;
      s.oy = s.py - dy * STICK_R * 1.25;
    }
    s.x = dx; s.y = dy;
    s.mag = Math.min(1, m);
  }

  _key(e, down) {
    const k = e.key.toLowerCase();
    if (down && (k === 'p' || k === 'escape')) { this.pauseEdge = true; return; }
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', ' ', 'x'].includes(k)) {
      if (down) this.keys.add(k); else this.keys.delete(k);
      if (e.key === ' ' || k === 'x') {
        if (down && !this._kbKick) { this._kbKick = true; this.kick.held = true; this.kick.heldT = 0; }
        if (!down && this._kbKick) { this._kbKick = false; this._releaseKick(); }
      }
      e.preventDefault();
    }
  }

  update(dt) {
    // keyboard steering overrides idle stick
    const K = this.keys;
    let kx = 0, ky = 0;
    if (K.has('arrowleft') || K.has('a')) kx -= 1;
    if (K.has('arrowright') || K.has('d')) kx += 1;
    if (K.has('arrowup') || K.has('w')) ky -= 1;
    if (K.has('arrowdown') || K.has('s')) ky += 1;
    if (kx || ky) {
      const m = Math.hypot(kx, ky);
      if (!this.stick.active) this.stick.justPressed = true;
      this.stick.active = true; this.stick.id = -99;
      this.stick.x = kx / m; this.stick.y = ky / m; this.stick.mag = 1;
    } else if (this.stick.id === -99) {
      this.stick.active = false; this.stick.id = -1;
      this.stick.x = 0; this.stick.y = 0; this.stick.mag = 0;
    }

    if (this.kick.held) {
      this.kick.heldT += dt;
      this.kick.charge = clamp((this.kick.heldT - TAP_TIME) / CHARGE_TIME, 0, 1);
    }
  }

  // clear one-frame edges (call at end of each game update)
  endFrame() {
    this.stick.justPressed = false;
    this.kick.tapped = false;
    this.kick.released = false;
    this.tapEdge = false;
    this.pauseEdge = false;
  }

  releaseAll() {
    this.stick.active = false; this.stick.id = -1;
    this.stick.x = 0; this.stick.y = 0; this.stick.mag = 0;
    this.kick.held = false; this.kick.id = -1; this.kick.heldT = 0; this.kick.charge = 0;
    this.endFrame();
  }
}
