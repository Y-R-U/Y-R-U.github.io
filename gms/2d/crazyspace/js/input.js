// input.js — unified touch + keyboard controls.
// Left thumb = floating steering joystick (aim angle + thrust magnitude).
// Right thumb = Fire / Bomb / Special buttons. Keyboard mirrors all of it.

import { clamp, TAU } from './util.js';

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.touch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

    // gameplay intent consumed each frame by the player ship
    this.aimAngle = null;   // radians, when joystick/aim active
    this.aimMag = 0;        // 0..1 thrust amount from joystick
    this.turn = 0;          // -1..1 keyboard rotation
    this.thrust = 0;        // -1..1 keyboard thrust
    this.fireGun = false;
    this.fireBomb = false;
    this.fireSpecial = false;

    // edges / toggles
    this._pressed = new Set(); // one-shot actions ('special','pause','mute','scores')
    this.showScores = false;
    this.enabled = true;

    this.keys = {};
    this.pointers = new Map();   // pointerId -> {role, x, y, startX, startY, btn}
    this.joyId = null;
    this.joy = { active: false, baseX: 0, baseY: 0, x: 0, y: 0, r: 78 };
    this.buttons = [];           // laid out in layout()
    this.insets = { top: 0, right: 0, bottom: 0, left: 0 };

    this._bind();
  }

  setInsets(i) { this.insets = i; }

  layout(W, H) {
    this.W = W; this.H = H;
    const bottom = this.insets.bottom + 18;
    const right = this.insets.right + 14;
    const fx = W - right - 70, fy = H - bottom - 78;
    this.buttons = [
      { id: 'gun',     label: '🔫', sub: 'FIRE',  x: fx,        y: fy,        r: 62, held: false, color: '#ff5d8f' },
      { id: 'bomb',    label: '💣', sub: 'BOMB',  x: fx - 104,  y: fy - 30,   r: 46, held: false, color: '#ff7b3d' },
      { id: 'special', label: '✦',  sub: 'SP',    x: fx - 22,   y: fy - 132,  r: 44, held: false, color: '#35e3ff' },
    ];
  }

  _bind() {
    const c = this.canvas;
    const opt = { passive: false };
    c.addEventListener('pointerdown', (e) => this._down(e), opt);
    c.addEventListener('pointermove', (e) => this._move(e), opt);
    c.addEventListener('pointerup', (e) => this._up(e), opt);
    c.addEventListener('pointercancel', (e) => this._up(e), opt);
    c.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => this._key(e, true));
    window.addEventListener('keyup', (e) => this._key(e, false));
  }

  _pos(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left), y: (e.clientY - r.top) };
  }

  _hitButton(x, y) {
    for (const b of this.buttons) {
      const dx = x - b.x, dy = y - b.y;
      if (dx * dx + dy * dy <= (b.r + 12) * (b.r + 12)) return b;
    }
    return null;
  }

  _down(e) {
    if (!this.enabled || !this.touch) { if (this.touch) e.preventDefault(); return; }
    e.preventDefault();
    const p = this._pos(e);
    const btn = this._hitButton(p.x, p.y);
    if (btn) {
      btn.held = true;
      if (btn.id === 'special') this._pressed.add('special');
      this.pointers.set(e.pointerId, { role: 'btn', btn });
      this._syncButtons();
      return;
    }
    // left ~60% becomes joystick zone if not already engaged
    if (this.joyId === null && p.x < this.W * 0.62) {
      this.joyId = e.pointerId;
      this.joy.active = true;
      this.joy.baseX = p.x; this.joy.baseY = p.y;
      this.joy.x = p.x; this.joy.y = p.y;
      this.pointers.set(e.pointerId, { role: 'joy' });
      this._syncJoy();
    }
  }

  _move(e) {
    if (!this.enabled) return;
    const rec = this.pointers.get(e.pointerId);
    if (!rec) return;
    const p = this._pos(e);
    if (rec.role === 'joy') {
      this.joy.x = p.x; this.joy.y = p.y;
      this._syncJoy();
    }
  }

  _up(e) {
    const rec = this.pointers.get(e.pointerId);
    if (rec) {
      if (rec.role === 'joy') {
        this.joy.active = false; this.joyId = null;
        this.aimAngle = null; this.aimMag = 0;
      } else if (rec.role === 'btn') {
        rec.btn.held = false;
        this._syncButtons();
      }
      this.pointers.delete(e.pointerId);
    }
  }

  _syncJoy() {
    let dx = this.joy.x - this.joy.baseX;
    let dy = this.joy.y - this.joy.baseY;
    const len = Math.hypot(dx, dy);
    if (len > this.joy.r) { dx *= this.joy.r / len; dy *= this.joy.r / len; }
    this.joy.x = this.joy.baseX + dx;
    this.joy.y = this.joy.baseY + dy;
    const mag = Math.min(1, len / this.joy.r);
    if (mag > 0.16) {
      this.aimAngle = Math.atan2(dy, dx);
      this.aimMag = (mag - 0.16) / 0.84;
    } else {
      this.aimAngle = null; this.aimMag = 0;
    }
  }

  _syncButtons() {
    this.fireGun = false; this.fireBomb = false;
    for (const b of this.buttons) {
      if (b.held && b.id === 'gun') this.fireGun = true;
      if (b.held && b.id === 'bomb') this.fireBomb = true;
    }
  }

  _key(e, down) {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Tab'].includes(e.key)) e.preventDefault();
    if (this.keys[k] === down) return;
    this.keys[k] = down;
    if (down) {
      if (k === 'p' || k === 'Escape') this._pressed.add('pause');
      if (k === 'm') this._pressed.add('mute');
      if (k === 'l' || k === 'e') this._pressed.add('special');
    }
    this._syncKeys();
  }

  _syncKeys() {
    const K = this.keys;
    this.turn = (K['ArrowLeft'] || K['a'] ? -1 : 0) + (K['ArrowRight'] || K['d'] ? 1 : 0);
    this.thrust = (K['ArrowUp'] || K['w'] ? 1 : 0) + (K['ArrowDown'] || K['s'] ? -1 : 0);
    this.kGun = !!(K[' '] || K['j']);
    this.kBomb = !!(K['k'] || K['Shift'] || K['Control']);
    this.kSpecial = !!(K['l'] || K['e']);
    this.showScores = !!K['Tab'];
  }

  // called by player ship each frame; merges keyboard with touch
  intent() {
    return {
      aimAngle: this.aimAngle,
      aimMag: this.aimMag,
      turn: this.turn,
      thrust: this.thrust,
      fireGun: this.fireGun || this.kGun,
      fireBomb: this.fireBomb || this.kBomb,
      fireSpecial: this.kSpecial,
    };
  }

  consumePressed(action) {
    if (this._pressed.has(action)) { this._pressed.delete(action); return true; }
    return false;
  }

  reset() {
    this.keys = {}; this.pointers.clear(); this.joyId = null;
    this.joy.active = false; this.aimAngle = null; this.aimMag = 0;
    this.turn = this.thrust = 0; this.fireGun = this.fireBomb = false;
    this.kGun = this.kBomb = this.kSpecial = false;
    for (const b of this.buttons) b.held = false;
  }

  // draw the on-screen controls (only meaningful on touch devices)
  renderControls(ctx) {
    if (!this.touch) return;
    ctx.save();
    // joystick
    if (this.joy.active) {
      this._ring(ctx, this.joy.baseX, this.joy.baseY, this.joy.r, 'rgba(120,150,255,0.18)', 2);
      const g = ctx.createRadialGradient(this.joy.x, this.joy.y, 0, this.joy.x, this.joy.y, 34);
      g.addColorStop(0, 'rgba(180,200,255,0.9)');
      g.addColorStop(1, 'rgba(90,120,255,0.25)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(this.joy.x, this.joy.y, 30, 0, TAU); ctx.fill();
    } else {
      // hint puck bottom-left
      const hx = this.insets.left + 86, hy = this.H - this.insets.bottom - 96;
      this._ring(ctx, hx, hy, this.joy.r, 'rgba(120,150,255,0.10)', 2);
      ctx.fillStyle = 'rgba(160,185,255,0.16)';
      ctx.beginPath(); ctx.arc(hx, hy, 26, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(200,215,255,0.5)';
      ctx.font = '11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('MOVE', hx, hy + 1);
    }
    // buttons
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const b of this.buttons) {
      ctx.globalAlpha = b.held ? 0.95 : 0.55;
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      g.addColorStop(0, b.held ? '#ffffff' : 'rgba(255,255,255,0.10)');
      g.addColorStop(0.6, b.color + (b.held ? '' : '55'));
      g.addColorStop(1, 'rgba(0,0,0,0.05)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
      ctx.globalAlpha = b.held ? 1 : 0.8;
      ctx.lineWidth = 2; ctx.strokeStyle = b.color;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff';
      ctx.font = `${Math.round(b.r * 0.62)}px system-ui`;
      ctx.fillText(b.label, b.x, b.y - 4);
      ctx.font = '10px system-ui'; ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(b.sub, b.x, b.y + b.r * 0.5);
    }
    ctx.restore();
  }

  _ring(ctx, x, y, r, color, w) {
    ctx.lineWidth = w; ctx.strokeStyle = color;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
  }
}
