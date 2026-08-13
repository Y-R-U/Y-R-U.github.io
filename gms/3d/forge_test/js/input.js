// Keyboard + mouse on desktop, floating stick + attack half on touch.
// Screen halves: one moves, one looks and attacks. `flip` swaps them for left-handers.

const STICK_R = 62;
const TAP_MS = 400, TAP_PX = 16;

export class Input {
  constructor() {
    this.move = { x: 0, y: 0 };
    this.look = { x: 0, y: 0 };
    this.attack = false;
    this.attackEdge = false;
    this.sprint = false;
    this.flip = false;

    this.keys = new Set();
    this.pointers = new Map();
    this.stickId = null;
    this.lookId = null;

    this.el = {
      touch: document.getElementById('touch'),
      knob: document.querySelector('#stick i'),
      fire: document.getElementById('fire'),
    };

    if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');

    const typing = e => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable;
    addEventListener('keydown', e => {
      if (e.repeat || typing(e)) return;
      this.keys.add(e.code);
      if (e.code === 'Space') { this.attackEdge = true; e.preventDefault(); }
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.stickId = this.lookId = null; this.hideStick(); });

    const down = e => this.onDown(e);
    for (const id of ['stage', 'touch']) document.getElementById(id)?.addEventListener('pointerdown', down);
    addEventListener('pointermove', e => this.onMove(e), { passive: false });
    addEventListener('pointerup', e => this.onUp(e));
    addEventListener('pointercancel', e => this.onUp(e));
    addEventListener('contextmenu', e => { if (e.target.closest('#touch, #stage')) e.preventDefault(); });
  }

  moveSide(clientX) {
    const left = clientX < innerWidth / 2;
    return this.flip ? !left : left;
  }

  onDown(e) {
    if (e.target.closest('#panel, #hud')) return;
    if (e.pointerType === 'touch') document.body.classList.add('touch');
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: performance.now(), moved: 0 });

    if (e.pointerType !== 'touch') {
      this.lookId = e.pointerId;
      return;
    }
    if (this.moveSide(e.clientX) && this.stickId === null) {
      this.stickId = e.pointerId;
      this.showStick(e.clientX, e.clientY, 0, 0);
    } else if (this.lookId === null) {
      this.lookId = e.pointerId;
    }
  }

  onMove(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    p.moved += Math.abs(dx) + Math.abs(dy);

    if (e.pointerId === this.stickId) {
      const vx = e.clientX - p.x0, vy = e.clientY - p.y0;
      const len = Math.hypot(vx, vy) || 1;
      const k = Math.min(1, len / STICK_R);
      this.move.x = (vx / len) * k;
      this.move.y = -(vy / len) * k;
      this.showStick(p.x0, p.y0, (vx / len) * k * STICK_R, (vy / len) * k * STICK_R);
      e.preventDefault();
    } else if (e.pointerId === this.lookId) {
      // clamped because nothing drains this while the orbit camera owns the view
      this.look.x = Math.max(-2000, Math.min(2000, this.look.x + dx));
      this.look.y = Math.max(-2000, Math.min(2000, this.look.y + dy));
    }
  }

  onUp(e) {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (e.pointerId === this.stickId) {
      this.stickId = null;
      this.move.x = this.move.y = 0;
      this.hideStick();
    }
    if (e.pointerId === this.lookId) {
      this.lookId = null;
      if (p && performance.now() - p.t < TAP_MS && p.moved < TAP_PX) this.attackEdge = true;
    }
  }

  showStick(cx, cy, dx, dy) {
    const k = this.el.knob;
    if (!k) return;
    k.style.display = 'block';
    k.style.left = `${cx}px`;
    k.style.top = `${cy}px`;
    k.style.setProperty('--dx', `${dx}px`);
    k.style.setProperty('--dy', `${dy}px`);
  }

  hideStick() {
    if (this.el.knob) this.el.knob.style.display = 'none';
  }

  // Called once per frame by the player; keyboard folds into the same vector the stick fills.
  read() {
    const k = this.keys;
    if (this.stickId === null) {
      const x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
      const y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
      const l = Math.hypot(x, y) || 1;
      this.move.x = x / l * Math.min(1, Math.hypot(x, y));
      this.move.y = y / l * Math.min(1, Math.hypot(x, y));
    }
    this.sprint = k.has('ShiftLeft') || k.has('ShiftRight');
    const out = { mx: this.move.x, my: this.move.y, lx: this.look.x, ly: this.look.y, attack: this.attackEdge, sprint: this.sprint };
    this.look.x = this.look.y = 0;
    this.attackEdge = false;
    return out;
  }
}
