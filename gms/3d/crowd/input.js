'use strict';
/* ── input.js ── Keyboard + virtual touch joystick ── */

class InputController {
  constructor() {
    this.dx = 0;
    this.dz = 0;

    this._keys = {};
    this._joyActive  = false;
    this._joyTouchId = null;
    this._joyOriginX = 0;
    this._joyOriginY = 0;
    this._JOY_R      = 55; // max joystick drag radius in px

    this._base = document.getElementById('joystick-base');
    this._knob = document.getElementById('joystick-knob');
    this._zone = document.getElementById('joystick-zone');

    // Bound handlers (stored so they can be removed later)
    this._onKeyDown    = e => { this._keys[e.code] = true; };
    this._onKeyUp      = e => { this._keys[e.code] = false; };
    this._onTouchStart = e => this._touchStart(e);
    this._onTouchMove  = e => this._touchMove(e);
    this._onTouchEnd   = e => this._touchEnd(e);
  }

  // ── Lifecycle ────────────────────────────────────────────────────────
  attach() {
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup',   this._onKeyUp);
    this._zone.addEventListener('touchstart',  this._onTouchStart, { passive: false });
    this._zone.addEventListener('touchmove',   this._onTouchMove,  { passive: false });
    this._zone.addEventListener('touchend',    this._onTouchEnd,   { passive: false });
    this._zone.addEventListener('touchcancel', this._onTouchEnd,   { passive: false });
  }

  detach() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup',   this._onKeyUp);
    this._zone.removeEventListener('touchstart',  this._onTouchStart);
    this._zone.removeEventListener('touchmove',   this._onTouchMove);
    this._zone.removeEventListener('touchend',    this._onTouchEnd);
    this._zone.removeEventListener('touchcancel', this._onTouchEnd);
    this._resetJoy();
    this._keys = {};
  }

  // ── Called every frame ───────────────────────────────────────────────
  update() {
    if (!this._joyActive) {
      let kx = 0, kz = 0;
      if (this._keys['ArrowLeft']  || this._keys['KeyA']) kx -= 1;
      if (this._keys['ArrowRight'] || this._keys['KeyD']) kx += 1;
      if (this._keys['ArrowUp']    || this._keys['KeyW']) kz -= 1;
      if (this._keys['ArrowDown']  || this._keys['KeyS']) kz += 1;
      this.dx = kx;
      this.dz = kz;
    }
  }

  // ── Touch handlers ───────────────────────────────────────────────────
  _touchStart(e) {
    e.preventDefault();
    if (this._joyTouchId !== null) return;
    const t = e.changedTouches[0];
    this._joyTouchId  = t.identifier;
    this._joyOriginX  = t.clientX;
    this._joyOriginY  = t.clientY;
    this._joyActive   = true;

    // Position joystick base at touch origin
    this._base.style.left    = (t.clientX - 60) + 'px';
    this._base.style.top     = (t.clientY - 60) + 'px';
    this._base.style.display = 'flex';
    this._knob.style.transform = 'translate(0px, 0px)';
  }

  _touchMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier !== this._joyTouchId) continue;
      const ox   = t.clientX - this._joyOriginX;
      const oz   = t.clientY - this._joyOriginY;
      const dist = Math.hypot(ox, oz);
      const clmp = Math.min(dist, this._JOY_R);
      const ang  = Math.atan2(oz, ox);
      const cx   = Math.cos(ang) * clmp;
      const cz   = Math.sin(ang) * clmp;
      this._knob.style.transform = `translate(${cx}px, ${cz}px)`;
      const norm = clmp / this._JOY_R;
      this.dx = Math.cos(ang) * norm;
      this.dz = Math.sin(ang) * norm;
    }
  }

  _touchEnd(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === this._joyTouchId) { this._resetJoy(); break; }
    }
  }

  _resetJoy() {
    this._joyActive  = false;
    this._joyTouchId = null;
    this.dx = 0;
    this.dz = 0;
    if (this._base) this._base.style.display = 'none';
    if (this._knob) this._knob.style.transform = 'translate(0px, 0px)';
  }
}
