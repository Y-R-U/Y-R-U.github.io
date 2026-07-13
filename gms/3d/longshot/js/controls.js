// LONGSHOT — input: drag-look, the walk stick, pinch/wheel/slider zoom,
// hold-to-breathe, fire/mark/scope buttons, keyboard. All game reactions come in
// as hooks; movement is polled (`controls.move`) so it's frame-rate independent.

import { $ } from './utils.js';

export class Controls {
  constructor(hooks) {
    this.h = hooks;         // { look, fire, scopeToggle, breath(on), mark, pause, zoomNudge, zoomFrac }
    this.enabled = false;
    this.pointers = new Map();
    this.pinchD = 0;
    this.move = { x: 0, y: 0 };     // walk vector, read every frame by the loop
    this._keyMove = { x: 0, y: 0 };
    this._stickId = null;
    this._bind();
  }

  _bind() {
    const app = document.getElementById('app');

    app.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinchD = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });
    app.addEventListener('pointermove', (e) => {
      if (!this.enabled) return;
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      if (this.pointers.size === 1) {
        this.h.look(e.clientX - p.x, e.clientY - p.y);
      }
      p.x = e.clientX; p.y = e.clientY;
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinchD > 0) this.h.zoomNudge((d - this.pinchD) * 0.0022);
        this.pinchD = d;
      }
    });
    const up = (e) => { this.pointers.delete(e.pointerId); this.pinchD = 0; };
    app.addEventListener('pointerup', up);
    app.addEventListener('pointercancel', up);

    addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      this.h.zoomNudge(e.deltaY < 0 ? 0.08 : -0.08);
    }, { passive: true });

    // ── the walk stick ──
    // Fixed, left thumb, footprints in the middle. It lives in the HUD layer, so
    // its pointer never reaches #app and never fights the drag-look.
    const stick = $('stick'), knob = $('stick-knob');
    const R = 42;                                     // px of throw
    const stickTo = (e) => {
      const r = stick.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx = dx / d * R; dy = dy / d * R; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.move.x = dx / R;
      this.move.y = -dy / R;                          // screen-up = forward
    };
    const stickEnd = () => {
      this._stickId = null;
      knob.style.transform = '';
      this.move.x = this._keyMove.x; this.move.y = this._keyMove.y;
      stick.classList.remove('held');
    };
    stick.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (!this.enabled) return;
      this._stickId = e.pointerId;
      stick.setPointerCapture(e.pointerId);
      stick.classList.add('held');
      stickTo(e);
    });
    stick.addEventListener('pointermove', (e) => {
      if (this._stickId !== e.pointerId || !this.enabled) return;
      e.stopPropagation();
      stickTo(e);
    });
    stick.addEventListener('pointerup', stickEnd);
    stick.addEventListener('pointercancel', stickEnd);

    // buttons
    const press = (id, down, upFn) => {
      const b = $(id);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (this.enabled) down(); b.classList.add('held'); });
      const done = (e) => { e && e.stopPropagation(); b.classList.remove('held'); if (this.enabled && upFn) upFn(); };
      b.addEventListener('pointerup', done);
      b.addEventListener('pointercancel', done);
      b.addEventListener('pointerleave', done);
    };
    press('btn-fire', () => this.h.fire());
    press('btn-scope', () => this.h.scopeToggle());
    press('btn-mark', () => this.h.mark());
    press('btn-breath', () => this.h.breath(true), () => this.h.breath(false));
    $('btn-pause').addEventListener('click', () => this.enabled && this.h.pause());
    $('zoom-slider').addEventListener('input', (e) => this.enabled && this.h.zoomFrac(e.target.value / 100));

    // keys — WASD walks, so scope moved off S onto C / right-click
    const KEYS = { KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1],
      KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
    this._held = new Set();
    const applyKeys = () => {
      let x = 0, y = 0;
      for (const c of this._held) { x += KEYS[c][0]; y += KEYS[c][1]; }
      const m = Math.hypot(x, y) || 1;
      this._keyMove = { x: x / m, y: y / m };
      if (this._stickId === null) { this.move.x = this._keyMove.x; this.move.y = this._keyMove.y; }
    };
    this._keys = (e) => {
      if (!this.enabled) return;
      if (KEYS[e.code]) { e.preventDefault(); this._held.add(e.code); applyKeys(); return; }
      if (e.repeat) return;
      switch (e.code) {
        case 'Space': e.preventDefault(); this.h.fire(); break;
        case 'ShiftLeft': case 'ShiftRight': case 'KeyB': this.h.breath(true); break;
        case 'KeyC': this.h.scopeToggle(); break;
        case 'KeyQ': this.h.zoomNudge(-0.12); break;
        case 'KeyE': this.h.zoomNudge(0.12); break;
        case 'KeyM': case 'Tab': e.preventDefault(); this.h.mark(); break;
        case 'Escape': this.h.pause(); break;
      }
    };
    this._keysUp = (e) => {
      if (KEYS[e.code]) { this._held.delete(e.code); applyKeys(); return; }
      if (!this.enabled) return;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyB') this.h.breath(false);
    };
    addEventListener('keydown', this._keys);
    addEventListener('keyup', this._keysUp);
    addEventListener('blur', () => { this._held.clear(); applyKeys(); });

    // right-click scope toggle on desktop
    app.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.enabled) this.h.scopeToggle();
    });
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) {
      this.pointers.clear();
      this._held.clear();
      this._stickId = null;
      this._keyMove = { x: 0, y: 0 };
      this.move.x = 0; this.move.y = 0;
      $('stick-knob').style.transform = '';
      $('stick').classList.remove('held');
    }
  }
}
