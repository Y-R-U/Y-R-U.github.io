// §6.1 and §6.4 — the two-thumb touch layout and the desktop fallback. Produces the one input
// struct flight.js consumes (`emptyInput()`) and nothing else.
//
// ── the requirement, verbatim ──────────────────────────────────────────────
//
//   "left finger down to fly/move, right finger down to look around (settings option to flip)"
//
// which is a MULTI-TOUCH requirement, not two single-touch handlers. Both halves must be live at
// the same time and neither may steal the other's finger. That is why this listens to raw
// `touchstart/move/end` with `Touch.identifier` rather than to pointer events: a touch identifier
// is the thing that survives a second finger landing, and `Input.dispatchTouchEvent` in the CDP
// harness drives exactly this path, so what the gate tests is what a thumb does.
//
// ── the rules that keep it from feeling stuck ──────────────────────────────
//
//   · One finger per half. A second finger in the same half is ignored, not swapped to — pinching
//     the movement half must not teleport the stick.
//   · The stick is FLOATING: its origin is wherever the finger landed, so there is no on-screen
//     furniture to find and nothing to miss.
//   · ORIGIN DRAG past the ring (voidcast's `_compute()`): drag 200 px and the origin follows, so
//     the stick never saturates in a direction you then have to drag all the way back out of.
//   · The look half is DELTA based and has no origin at all — every move event is consumed and the
//     origin resets, so look can never "run out of travel".
//   · A lost touch (`touchcancel`, a call arriving, the browser stealing the gesture) releases the
//     half rather than leaving it held. Held-forever thrust is the worst possible failure here.
//
// Buttons (▲ ▼ boost ⚙) are real DOM elements with `pointer-events: auto`, and a touch that lands
// on one is skipped by the half router — otherwise the altitude pair, which §6.1 puts in the LOOK
// half's outer corner so the look thumb can reach them, would also start a look drag.

import { FLIGHT as F } from './config.js';
import { clamp } from './utils.js';
import { emptyInput } from './flight.js';

const KEYS_FWD = ['w', 'arrowup'], KEYS_BACK = ['s', 'arrowdown'];
const KEYS_LEFT = ['a', 'arrowleft'], KEYS_RIGHT = ['d', 'arrowright'];

export class Controls {
  constructor(root, opts = {}) {
    this.root = root;
    this.flip = !!opts.flip;             // §6.5 movement side
    this.enabled = true;
    this.onSettings = opts.onSettings || null;
    this.onKey = opts.onKey || null;     // F / Tab / M / Esc — later phases

    this.inp = emptyInput();
    this.move = null;                    // { id, ox, oy, cx, cy }
    this.look = null;                    // { id, lx, ly }
    this.lookDX = 0; this.lookDY = 0;
    this.keys = new Set();
    this.btn = { up: false, down: false, boost: false };
    this.locked = false;
    this.mouse = null;
    this.touchSeen = 0;                  // proof the touch path ran at all

    this.stick = root.querySelector('#stick');
    this.nub = root.querySelector('#stick .nub');
    this.pad = root.querySelector('#altpad');
    this.setButtonSize(opts.btnSize || 56);
    this.applyFlip();
    this._bind();
  }

  // The half router. `flip` swaps which side is which; everything downstream is side-agnostic.
  half(x) {
    const left = x < innerWidth / 2;
    return (left !== this.flip) ? 'move' : 'look';
  }

  applyFlip() {
    this.root.classList.toggle('flipped', this.flip);
    return this.flip;
  }

  setFlip(v) { this.flip = !!v; this.release(); return this.applyFlip(); }
  setButtonSize(px) { this.btnPx = px; this.root.style.setProperty('--btn', px + 'px'); return px; }

  _bind() {
    const el = this.root;

    // ── touch ────────────────────────────────────────────────────────────
    const isBtn = t => {
      const e = (t.target && t.target.closest) ? t.target : document.elementFromPoint(t.clientX, t.clientY);
      return !!(e && e.closest && e.closest('.ctl-btn'));
    };

    el.addEventListener('touchstart', e => {
      if (!this.enabled) return;
      this.touchSeen++;
      for (const t of e.changedTouches) {
        if (isBtn(t)) continue;                       // the ▲/▼/boost/⚙ pad owns that finger
        const role = this.half(t.clientX);
        if (role === 'move') {
          if (this.move) continue;                    // one finger per half
          // vx/vy exist from the first frame so `moveActive` is true the moment the thumb lands.
          // Without them a finger resting at centre reads as RELEASED and the craft auto-stops
          // under a thumb that is still on the glass — §6.2's DAMP_RELEASE is for letting go.
          this.move = { id: t.identifier, ox: t.clientX, oy: t.clientY, cx: t.clientX, cy: t.clientY, vx: 0, vy: 0 };
          this._stick(true);
        } else {
          if (this.look) continue;
          this.look = { id: t.identifier, lx: t.clientX, ly: t.clientY };
        }
      }
      e.preventDefault();
    }, { passive: false });

    el.addEventListener('touchmove', e => {
      for (const t of e.changedTouches) {
        if (this.move && t.identifier === this.move.id) {
          this.move.cx = t.clientX; this.move.cy = t.clientY;
          this._compute();
        } else if (this.look && t.identifier === this.look.id) {
          this.lookDX += t.clientX - this.look.lx;
          this.lookDY += t.clientY - this.look.ly;
          this.look.lx = t.clientX; this.look.ly = t.clientY;
        }
      }
      e.preventDefault();
    }, { passive: false });

    const end = e => {
      for (const t of e.changedTouches) {
        if (this.move && t.identifier === this.move.id) { this.move = null; this._stick(false); }
        else if (this.look && t.identifier === this.look.id) this.look = null;
      }
    };
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);

    // ── mouse (§6.4) ─────────────────────────────────────────────────────
    // Drag anywhere to look; a click that did not drag takes pointer lock, and while locked every
    // mousemove looks. Esc leaves the lock (browser default) and that is the only exit.
    el.addEventListener('mousedown', e => {
      if (!this.enabled || e.button !== 0) return;
      if (e.target.closest && e.target.closest('.ctl-btn')) return;
      this.mouse = { x: e.clientX, y: e.clientY, moved: 0 };
    });
    addEventListener('mousemove', e => {
      if (this.locked) { this.lookDX += e.movementX; this.lookDY += e.movementY; return; }
      if (!this.mouse) return;
      const dx = e.clientX - this.mouse.x, dy = e.clientY - this.mouse.y;
      this.lookDX += dx; this.lookDY += dy;
      this.mouse.moved += Math.abs(dx) + Math.abs(dy);
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
    });
    addEventListener('mouseup', () => {
      if (this.mouse && this.mouse.moved < 4 && !this.locked) {
        this.root.requestPointerLock?.();
      }
      this.mouse = null;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.root;
    });

    // ── keyboard (§6.4) ──────────────────────────────────────────────────
    addEventListener('keydown', e => {
      if (!this.enabled) return;
      const k = e.key.toLowerCase();
      if (k === 'tab' || k === ' ') e.preventDefault();     // Tab must not walk the DOM
      if (['f', 'tab', 'm', 'escape'].includes(k)) { if (!e.repeat) this.onKey?.(k); if (k !== 'escape') return; }
      if (e.repeat) return;
      this.keys.add(k);
    });
    addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
    // A blur with W held is thrust that never stops. Same for a hidden tab.
    addEventListener('blur', () => this.release());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.release(); });

    // ── the button pad ───────────────────────────────────────────────────
    this._btn('#btn-up', 'up');
    this._btn('#btn-down', 'down');
    this._btn('#btn-boost', 'boost');
    const gear = this.root.querySelector('#btn-settings');
    if (gear) gear.addEventListener('click', () => this.onSettings?.());
  }

  // Hold-to-act, on touch and mouse alike, with a pointerleave/cancel release so a finger that
  // slides off the button does not leave the craft climbing forever.
  _btn(sel, key) {
    const b = this.root.querySelector(sel);
    if (!b) return;
    const on = e => { this.btn[key] = true; e.preventDefault(); };
    const off = () => { this.btn[key] = false; };
    b.addEventListener('touchstart', on, { passive: false });
    b.addEventListener('touchend', off);
    b.addEventListener('touchcancel', off);
    b.addEventListener('mousedown', on);
    addEventListener('mouseup', off);
    b.addEventListener('mouseleave', off);
  }

  // voidcast's `_compute()`: past the ring the ORIGIN is dragged along, so the stick never feels
  // stuck at full deflection.
  _compute() {
    let vx = this.move.cx - this.move.ox, vy = this.move.cy - this.move.oy;
    const len = Math.hypot(vx, vy);
    const R = F.STICK_PX;
    if (len > R) {
      const k = (len - R) / len;
      this.move.ox += vx * k; this.move.oy += vy * k;
      vx *= R / len; vy *= R / len;
    }
    this.move.vx = vx / R; this.move.vy = vy / R;
    this._stick(true, vx, vy);
  }

  _stick(on, vx = 0, vy = 0) {
    if (!this.stick) return;
    this.stick.classList.toggle('on', !!on && !!this.move);
    if (!on || !this.move) return;
    this.stick.style.left = this.move.ox + 'px';
    this.stick.style.top = this.move.oy + 'px';
    if (this.nub) this.nub.style.transform = `translate(-50%,-50%) translate(${vx}px,${vy}px)`;
  }

  release() {
    this.move = null; this.look = null;
    this.keys.clear();
    this.btn.up = this.btn.down = this.btn.boost = false;
    this.mouse = null;
    this.lookDX = this.lookDY = 0;
    this._stick(false);
  }

  // Called once per frame. Deltas are CONSUMED here — a frame that does not read them would
  // otherwise accumulate a whole gesture and apply it in one jump.
  read() {
    const i = this.inp;
    let mx = 0, my = 0, active = false;

    if (this.move && this.move.vx !== undefined) {
      const len = Math.hypot(this.move.vx, this.move.vy);
      if (len > F.DEADZONE) {
        // Radial deadzone, rescaled so the first millimetre past it is not a step change.
        const k = (len - F.DEADZONE) / (1 - F.DEADZONE) / len;
        mx = this.move.vx * k; my = this.move.vy * k;
      }
      active = true;
    }

    let kx = 0, ky = 0;
    for (const k of this.keys) {
      if (KEYS_FWD.includes(k)) ky -= 1;
      else if (KEYS_BACK.includes(k)) ky += 1;
      else if (KEYS_LEFT.includes(k)) kx -= 1;
      else if (KEYS_RIGHT.includes(k)) kx += 1;
    }
    if (kx || ky) {
      const l = Math.hypot(kx, ky);
      mx = clamp(mx + kx / l, -1, 1); my = clamp(my + ky / l, -1, 1);
      active = true;
    }

    i.moveX = mx; i.moveY = my; i.moveActive = active;
    i.lookDX = this.lookDX; i.lookDY = this.lookDY;
    this.lookDX = 0; this.lookDY = 0;
    i.climb = (this.btn.up || this.keys.has(' ') ? 1 : 0) - (this.btn.down || this.keys.has('c') ? 1 : 0);
    i.boost = this.btn.boost || this.keys.has('shift');
    return i;
  }

  // What the touch gate asserts against: which halves are held right now, and where.
  probe() {
    return {
      flip: this.flip, w: innerWidth, h: innerHeight,
      move: this.move ? { id: this.move.id, ox: Math.round(this.move.ox), oy: Math.round(this.move.oy),
        vx: +(this.move.vx || 0).toFixed(3), vy: +(this.move.vy || 0).toFixed(3) } : null,
      look: this.look ? { id: this.look.id } : null,
      pending: { dx: this.lookDX, dy: this.lookDY },
      btn: { ...this.btn }, keys: [...this.keys], locked: this.locked, touches: this.touchSeen,
      stickOn: this.stick ? this.stick.classList.contains('on') : null,
    };
  }
}
