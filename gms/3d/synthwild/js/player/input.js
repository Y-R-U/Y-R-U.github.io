// One action map fed by touch, mouse+keyboard and gamepad.
// Held actions: jump crouch primary secondary sprint. Axes: move{x,y} (y = forward), look{dx,dy} radians this frame.
// Events (input.on): hotbar{slot} wheel inventory pause toggleView scale(+1|-1) mode(+1|-1) confirm cancel device(name)
//   build tools: undo redo copy paste rotate mirror pick
import { createTouch } from './touch.js';

const HELD = ['jump', 'crouch', 'primary', 'secondary', 'sprint'];
const DEAD = 0.15;

const KEYMAP = {
  Space: 'jump', ShiftLeft: 'crouch', ShiftRight: 'crouch', ControlLeft: 'sprint',
};
const MOVEKEYS = { KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };

export const input = {
  move: { x: 0, y: 0 },
  look: { dx: 0, dy: 0 },
  held: Object.fromEntries(HELD.map(k => [k, false])),
  device: 'mouse',
  frame: 0,
  enabled: true,
  modal: false,        // brush volume confirm pending: gamepad A/B become confirm/cancel
  locked: false,
  volumeDrag: false,   // touch two-finger volume gesture in progress
  auto: null,          // auto driver, see auto.js

  _ctx: null, _sources: {}, _prev: {}, _edges: new Set(), _rel: new Set(), _ev: new Map(),
  _keys: new Set(), _mouseLook: [0, 0], _acc: [0, 0], _latch: new Set(), _gp: {}, _silentUnlock: false, _lastW: 0,

  init(ctx) {
    this._ctx = ctx;
    for (const k of HELD) this._sources[k] = new Set();
    const canvas = ctx.canvas || document.querySelector('canvas');
    this._bindKeys();
    this._bindMouse(canvas);
    this.touch = createTouch(this, ctx);
    const coarse = matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.setDevice(coarse ? 'touch' : 'mouse');
    window.addEventListener('gamepadconnected', () => this.setDevice('gamepad'));
  },

  on(type, fn) {
    let s = this._ev.get(type);
    if (!s) this._ev.set(type, (s = new Set()));
    s.add(fn);
    return () => s.delete(fn);
  },
  emit(type, data) {
    if (type === 'pause') { const t = performance.now(); if (t - (this._lastPause || 0) < 300) return; this._lastPause = t; }
    for (const fn of [...(this._ev.get(type) || [])]) { try { fn(data); } catch (e) { console.error('[input]', type, e); } }
    this._ctx?.bus?.emit?.('input:' + type, data);
  },

  pressed(a) { return this._edges.has(a); },
  released(a) { return this._rel.has(a); },

  // Sources ("key:Space", "touch:jump", "gp:0") hold an action; it is held while any source holds it.
  setHeld(action, src, on) {
    const s = this._sources[action];
    if (!s) return;
    if (on) { if (!s.size) this._latch.add(action); s.add(src); } else s.delete(src);
  },
  releaseAll() {
    for (const k of HELD) this._sources[k].clear();
    this._latch.clear();
    this._keys.clear();
    this.touch?.reset();
  },

  setDevice(d) {
    if (this.device === d) return;
    this.device = d;
    this.touch?.show(d === 'touch');
    this.emit('device', d);
  },

  setting(k, def) {
    const v = this._ctx?.settings?.get?.(k);
    return v === undefined || v === null ? def : v;
  },
  // A lane 4 station panel (fabricator/oven/cache) being open blocks game input too.
  get active() { return this.enabled && !this._ctx?.session?.paused && !this._ctx?.game?.stations?.isOpen; },

  addLook(dx, dy) {
    const inv = this.setting('invertY', false) ? -1 : 1;
    this._acc[0] += dx; this._acc[1] += dy * inv;
  },

  // Panels can call this so opening the inventory doesn't read as "pause".
  releasePointer() {
    if (document.pointerLockElement) { this._silentUnlock = true; document.exitPointerLock(); }
  },
  requestPointer() {
    const c = this._ctx?.canvas;
    if (c && !document.pointerLockElement && this.device === 'mouse') {
      this._reqT = performance.now();
      try { const p = c.requestPointerLock?.(); p?.catch?.(() => {}); } catch {}
    }
  },

  _bindKeys() {
    addEventListener('keydown', e => {
      if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA') return;
      this.setDevice('mouse');
      const c = e.code;
      if (c === 'Tab' || c === 'Space' || c.startsWith('Arrow')) e.preventDefault();
      if (e.repeat) return;
      this._keys.add(c);
      if (KEYMAP[c]) this.setHeld(KEYMAP[c], 'key:' + c, true);
      if (c === 'KeyW') { const t = performance.now(); if (t - this._lastW < 280) this.setHeld('sprint', 'key:ww', true); this._lastW = t; }
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (c === 'KeyZ' || c === 'KeyY' || c === 'KeyC' || c === 'KeyV')) {
        e.preventDefault();
        this.emit(c === 'KeyC' ? 'copy' : c === 'KeyV' ? 'paste' : c === 'KeyY' || e.shiftKey ? 'redo' : 'undo');
        return;
      }
      if (/^Digit[1-9]$/.test(c)) this._hotbar(+c.slice(5) - 1);
      else if (c === 'KeyR') this.emit('rotate');
      else if (c === 'KeyM') this.emit('mirror');
      else if (c === 'KeyG') this.emit('pick');
      else if (c === 'KeyE') this.emit('inventory');
      else if (c === 'KeyQ') this.emit('wheel');
      else if (c === 'KeyV' || c === 'F5') { e.preventDefault(); this.emit('toggleView'); }
      else if (c === 'BracketRight' || c === 'Equal') this.emit('scale', +1);
      else if (c === 'BracketLeft' || c === 'Minus') this.emit('scale', -1);
      else if (c === 'KeyB') this.emit('mode', +1);
      else if (c === 'Enter') this.emit('confirm');
      else if (c === 'Backspace') this.emit('cancel');
      else if (c === 'Escape' || c === 'KeyP') { if (this.modal) this.emit('cancel'); else if (!document.pointerLockElement) this.emit('pause'); }
    });
    addEventListener('keyup', e => {
      const c = e.code;
      this._keys.delete(c);
      if (KEYMAP[c]) this.setHeld(KEYMAP[c], 'key:' + c, false);
      if (c === 'KeyW') this.setHeld('sprint', 'key:ww', false);
    });
    addEventListener('blur', () => this.releaseAll());
  },

  _bindMouse(canvas) {
    if (!canvas) return;
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('mousedown', e => {
      if (e.sourceCapabilities?.firesTouchEvents) return;
      this.setDevice('mouse');
      if (!document.pointerLockElement) { if (this.active) this.requestPointer(); return; }
      if (e.button === 0) this.setHeld('primary', 'mouse', true);
      if (e.button === 2) this.setHeld('secondary', 'mouse', true);
      if (e.button === 1) { e.preventDefault(); this.emit('pick'); }
    });
    addEventListener('mouseup', e => {
      if (e.button === 0) this.setHeld('primary', 'mouse', false);
      if (e.button === 2) this.setHeld('secondary', 'mouse', false);
    });
    addEventListener('mousemove', e => {
      if (document.pointerLockElement) { this._mouseLook[0] += e.movementX; this._mouseLook[1] += e.movementY; }
    });
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const t = performance.now();
      if (t - (this._lastWheel || 0) < 110) return;
      this._lastWheel = t;
      this.emit('scale', e.deltaY < 0 ? +1 : -1);
    }, { passive: false });
    // Only a lock the player actually had and then let go of (Esc) pauses. A refused lock, a change with no lock
    // held, a lock lost within a second of asking for it, or a mini-game countdown never do.
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = !!document.pointerLockElement;
      if (!this.locked) {
        this.setHeld('primary', 'mouse', false); this.setHeld('secondary', 'mouse', false);
        const s = this._ctx?.session;
        const fresh = performance.now() - (this._reqT || 0) < 1000;
        if (was && !fresh && !this._silentUnlock && this.device === 'mouse' && !s?.paused && !s?.mgCountdown) this.emit('pause');
        this._silentUnlock = false;
      }
    });
    document.addEventListener('pointerlockerror', () => { this.locked = false; this._silentUnlock = false; });
  },

  _hotbar(slot) {
    const inv = this._ctx?.game?.inv;
    if (inv?.select) inv.select(slot);
    this.emit('hotbar', { slot: inv?.sel ?? slot });
  },
  _hotbarStep(dir) {
    const inv = this._ctx?.game?.inv;
    const cur = inv?.sel ?? 0;
    this._hotbar(((cur + dir) % 9 + 9) % 9);
  },

  _pollGamepad(dt) {
    const pads = navigator.getGamepads?.() || [];
    const gp = [...pads].find(p => p && p.connected);
    if (!gp) return [0, 0];
    const ax = i => { const v = gp.axes[i] || 0; return Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD); };
    const bt = i => { const b = gp.buttons[i]; return !!b && (b.pressed || b.value > 0.4); };
    const any = gp.buttons.some(b => b.pressed) || gp.axes.some(a => Math.abs(a) > 0.3);
    if (any) this.setDevice('gamepad');
    const prev = this._gp;
    const now = {};
    for (let i = 0; i < 16; i++) now[i] = bt(i);
    const down = i => now[i] && !prev[i];
    if (this.modal) {
      if (down(0)) this.emit('confirm');
      if (down(1)) this.emit('cancel');
      if (down(2)) this.emit('rotate');
      if (down(3)) this.emit('mirror');
      this.setHeld('jump', 'gp', false); this.setHeld('crouch', 'gp', false);
    } else {
      this.setHeld('jump', 'gp', now[0]);
      this.setHeld('crouch', 'gp', now[1]);
      if (down(2)) this.emit('wheel');
      if (down(3)) this.emit('inventory');
    }
    this.setHeld('primary', 'gp', now[7]);
    this.setHeld('secondary', 'gp', now[6]);
    if (down(10)) this._gpSprint = true;
    if (down(4)) this._hotbarStep(-1);
    if (down(5)) this._hotbarStep(+1);
    if (down(8)) this.emit(now[4] ? 'redo' : 'undo');   // Back = undo, LB+Back = redo
    if (down(11)) this.emit('pick');                     // R3 = eyedropper (view toggle is on the wheel)
    if (down(9)) this.emit('pause');
    if (down(12)) this.emit('scale', +1);
    if (down(13)) this.emit('scale', -1);
    if (down(14)) this.emit('mode', -1);
    if (down(15)) this.emit('mode', +1);
    this._gp = now;
    const mx = ax(0), my = -ax(1);
    if (Math.hypot(mx, my) < 0.5) this._gpSprint = false;
    this.setHeld('sprint', 'gp', !!this._gpSprint);
    const rate = 3.2 * this.setting('sensitivity', 1) * dt;
    const lx = ax(2), ly = ax(3);
    this.addLook(lx * Math.abs(lx) * rate, ly * Math.abs(ly) * rate);
    return [mx, my];
  },

  update(dt) {
    this.frame++;
    this.look.dx = 0; this.look.dy = 0;
    const sens = this.setting('sensitivity', 1);
    if (this._mouseLook[0] || this._mouseLook[1]) {
      this.addLook(this._mouseLook[0] * 0.0024 * sens, this._mouseLook[1] * 0.0024 * sens);
      this._mouseLook[0] = this._mouseLook[1] = 0;
    }
    let kx = 0, ky = 0;
    for (const k of this._keys) { const m = MOVEKEYS[k]; if (m) { kx += m[0]; ky += m[1]; } }
    const [gx, gy] = this._pollGamepad(dt);
    const t = this.touch?.update(dt) || [0, 0];
    let mx = kx + gx + t[0], my = ky + gy + t[1];
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    this.move.x = mx; this.move.y = my;

    if (this.auto) this.auto.drive(this, dt);
    this.look.dx = this._acc[0]; this.look.dy = this._acc[1];
    this._acc[0] = this._acc[1] = 0;

    this._edges.clear(); this._rel.clear();
    for (const k of HELD) {
      // A tap shorter than a frame still registers as one held frame.
      let h = this._sources[k].size > 0 || this._latch.has(k);
      if (!this.active) h = false;
      if (h && !this._prev[k]) this._edges.add(k);
      if (!h && this._prev[k]) this._rel.add(k);
      this.held[k] = h; this._prev[k] = h;
    }
    this._latch.clear();
    if (!this.active) { this.move.x = this.move.y = 0; this.look.dx = this.look.dy = 0; }
  },
};

export default input;
