// Touch-first control. Left thumb is a floating stick (up = jump, down = block),
// right thumb taps to hit and DRAWS to fire specials. Mouse and keyboard mirror it.

import { classify } from './gestures.js';

const DEAD = 16;
const MAX = 58;

const STRIKE_KEYS = [' ', 'j', 'r', '0'];
/** 1-8, in MOVES order — the same order the on-screen move strip is drawn in. */
export const SPECIAL_KEYS = {
  '1': 'slash', '2': 'archUp', '3': 'up', '4': 'right',
  '5': 'circleCW', '6': 'down', '7': 'circleCCW', '8': 'vee',
};
/** A real keyboard and a pointer: worth showing key hints for, not worth it on a phone. */
export const hasKeyboard = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' &&
  window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/** Matches the portrait rule in style.css. Both must change together. */
export const PORTRAIT_Q = '(orientation: portrait) and (max-width: 860px)';
export const isRotated = () => window.matchMedia(PORTRAIT_Q).matches;

export class Input {
  constructor(el, opts = {}) {
    this.el = el;
    this.moveX = 0;
    this.jump = false;
    this.block = false;
    this.onStrike = opts.onStrike || (() => {});
    this.onGesture = opts.onGesture || (() => {});
    this.onTap = opts.onTap || (() => {});
    this.enabled = false;
    this.hand = opts.hand || 'right';

    this.stick = null;       // {id, x, y} — the finger; the base is fixed, see baseAt()
    this.draw = null;        // {id, pts, t0}
    this.trail = [];
    this.trailFade = 0;
    this.lastGesture = null;
    this.lastGestureT = 0;
    this.keys = {};
    this.jumpLatch = false;

    const p = (e) => this.pointer(e);
    el.addEventListener('pointerdown', p, { passive: false });
    el.addEventListener('pointermove', p, { passive: false });
    el.addEventListener('pointerup', p, { passive: false });
    el.addEventListener('pointercancel', p, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
  }

  /** Which half of the screen a point is in, honouring the handedness setting. */
  isMoveSide(x) {
    const left = x < this.el.clientWidth * 0.5;
    return this.hand === 'right' ? left : !left;
  }

  /**
   * The stick is drawn in a fixed spot so all four directions are always visible, but a
   * touch anywhere on that half grabs it — the knob just tracks the finger relative to
   * this base. Fixed to look at, forgiving to hit.
   */
  baseAt() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    const r = Math.min(84, h * 0.21);
    const x = this.hand === 'right' ? r + 26 : w - r - 26;
    return { x, y: h - r - 20, r };
  }

  pointer(e) {
    if (!this.enabled) return;
    e.preventDefault();
    const p = this.localPoint(e);
    const x = p.x, y = p.y;
    const id = e.pointerId;

    if (e.type === 'pointerdown') {
      if (this.isMoveSide(x)) {
        if (!this.stick) this.stick = { id, x, y };
      } else if (!this.draw) {
        this.draw = { id, pts: [{ x, y }], t0: performance.now() };
        this.trail = [{ x, y }];
      }
    } else if (e.type === 'pointermove') {
      if (this.stick && this.stick.id === id) {
        this.stick.x = x; this.stick.y = y;
      } else if (this.draw && this.draw.id === id) {
        const last = this.draw.pts[this.draw.pts.length - 1];
        if (Math.hypot(x - last.x, y - last.y) > 3) {
          this.draw.pts.push({ x, y });
          this.trail.push({ x, y });
          if (this.trail.length > 90) this.trail.shift();
        }
      }
    } else {
      if (this.stick && this.stick.id === id) {
        this.stick = null;
        this.moveX = 0;
        this.block = false;
      } else if (this.draw && this.draw.id === id) {
        const dur = (performance.now() - this.draw.t0) / 1000;
        const g = classify(this.draw.pts, dur);
        if (g) {
          this.lastGesture = g;
          this.lastGestureT = 0.6;
          this.onGesture(g);
        } else {
          this.onStrike();
        }
        this.draw = null;
        this.trailFade = 0.32;
      }
    }
  }

  /**
   * Client coords -> element-local coords. In portrait the app carries
   * `translateX(100vw) rotate(90deg)` with origin 0 0, which maps local (lx, ly) to screen
   * (innerWidth - ly, lx); this is that inverted. getBoundingClientRect cannot be used for
   * this — on a rotated element it returns the axis-aligned box, and every touch lands
   * somewhere else entirely.
   */
  localPoint(e) {
    if (isRotated()) {
      return { x: e.clientY, y: window.innerWidth - e.clientX };
    }
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  key(e, down) {
    const k = e.key.toLowerCase();
    this.keys[k] = down;
    if (down && k === ' ') e.preventDefault();
    if (!this.enabled) return;
    // Punch on all of these so the hand you are already using has one under a finger:
    // space and J for a mouse hand, R in the middle of the number row for arrow-key players,
    // and 0 for anyone on the num pad with 1-8 on the specials.
    if (down && STRIKE_KEYS.includes(k)) this.onStrike();
    const g = SPECIAL_KEYS[k];
    if (down && g) this.onGesture(g);
  }

  update(dt) {
    if (this.trailFade > 0) {
      this.trailFade -= dt;
      if (this.trailFade <= 0) this.trail = [];
    }
    if (this.lastGestureT > 0) this.lastGestureT -= dt;

    let mx = 0, up = false, dn = false;
    this.knob = null;
    if (this.stick) {
      const b = this.baseAt();
      let dx = this.stick.x - b.x, dy = this.stick.y - b.y;
      const d = Math.hypot(dx, dy);
      const lim = b.r * 0.82;
      if (d > lim) { dx = dx / d * lim; dy = dy / d * lim; }
      this.knob = { x: b.x + dx, y: b.y + dy, base: b };
      if (Math.abs(dx) > DEAD) mx = Math.max(-1, Math.min(1, (dx - Math.sign(dx) * DEAD) / MAX));
      // Vertical wins over horizontal, so a diagonal reads as jump/duck not a slow drift.
      if (dy < -DEAD * 1.5 && -dy > Math.abs(dx) * 0.7) { up = true; mx *= 0.55; }
      if (dy > DEAD * 1.5 && dy > Math.abs(dx) * 0.7) { dn = true; mx *= 0.4; }
    }
    if (this.keys.a || this.keys.arrowleft) mx = -1;
    if (this.keys.d || this.keys.arrowright) mx = 1;
    if (this.keys.w || this.keys.arrowup) up = true;
    if (this.keys.s || this.keys.arrowdown) dn = true;

    this.moveX = mx;
    this.block = dn;
    this.jump = up && !this.jumpLatch;
    this.jumpLatch = up;
  }

  reset() {
    this.stick = null; this.draw = null; this.trail = [];
    this.moveX = 0; this.jump = false; this.block = false; this.jumpLatch = false;
  }
}
