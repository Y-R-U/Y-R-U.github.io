// LONGSHOT — input: drag-look, pinch/wheel/slider zoom, hold-to-breathe,
// fire/mark/scope buttons, keyboard. All game reactions come in as hooks.

import { $ } from './utils.js';

export class Controls {
  constructor(hooks) {
    this.h = hooks;         // { look, fire, scopeToggle, breath(on), mark, pause, zoomNudge, zoomFrac }
    this.enabled = false;
    this.pointers = new Map();
    this.pinchD = 0;
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

    // keys
    this._keys = (e) => {
      if (!this.enabled) return;
      if (e.repeat) return;
      switch (e.code) {
        case 'Space': e.preventDefault(); this.h.fire(); break;
        case 'ShiftLeft': case 'ShiftRight': case 'KeyB': this.h.breath(true); break;
        case 'KeyS': case 'KeyC': this.h.scopeToggle(); break;
        case 'KeyQ': this.h.zoomNudge(-0.12); break;
        case 'KeyE': this.h.zoomNudge(0.12); break;
        case 'KeyM': case 'Tab': e.preventDefault(); this.h.mark(); break;
        case 'Escape': this.h.pause(); break;
      }
    };
    this._keysUp = (e) => {
      if (!this.enabled) return;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyB') this.h.breath(false);
    };
    addEventListener('keydown', this._keys);
    addEventListener('keyup', this._keysUp);

    // right-click scope toggle on desktop
    app.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.enabled) this.h.scopeToggle();
    });
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.pointers.clear();
  }
}
