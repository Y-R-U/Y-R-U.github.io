// GRUDGE BUGS — touch & mouse. One-finger drag aims (or orbits in free-cam /
// spectator), two fingers pinch-zoom + orbit, thumb buttons walk, FIRE holds
// to charge. Desktop gets A/D, wheel zoom, space charge.

import { $, clamp } from './utils.js';
import * as audio from './audio.js';

export class Input {
  constructor(dom, cams, getBattle, ui) {
    this.dom = dom; this.cams = cams; this.getBattle = getBattle; this.ui = ui;
    this.freeCam = false;
    this.pointers = new Map();
    this.pinchD = 0;
    this._bind();
  }

  _battlePhase() { const b = this.getBattle(); return b ? b.phase : null; }
  _myTurn() {
    const b = this.getBattle();
    return b && b.phase === 'play' && b.activeTeam() && !b.activeTeam().isAI;
  }

  _bind() {
    const el = this.dom;
    el.addEventListener('pointerdown', (e) => this._down(e));
    el.addEventListener('pointermove', (e) => this._move(e));
    el.addEventListener('pointerup', (e) => this._up(e));
    el.addEventListener('pointercancel', (e) => this._up(e));
    el.addEventListener('wheel', (e) => {
      this.cams.orbitZoom(e.deltaY > 0 ? 1.12 : 0.89);
      e.preventDefault();
    }, { passive: false });

    // battle buttons
    const hold = (id, on, off) => {
      const b = $(id);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); audio.resume(); on(); });
      b.addEventListener('pointerup', (e) => { e.preventDefault(); off(); });
      b.addEventListener('pointerleave', () => off());
      b.addEventListener('pointercancel', () => off());
    };
    hold('btn-walk-l', () => this._walk(-1), () => this._walk(0));
    hold('btn-walk-r', () => this._walk(1), () => this._walk(0));
    hold('btn-fire',
      () => { if (this._myTurn()) { this.getBattle().startCharge(); $('btn-fire').classList.add('charging'); } },
      () => { const b = this.getBattle(); if (b) b.releaseCharge(); $('btn-fire').classList.remove('charging'); });
    $('btn-weapon').addEventListener('click', () => { if (this._myTurn()) this.ui.toggleWheel(); });
    $('btn-target').addEventListener('click', () => {
      if (this._myTurn()) { audio.resume(); this.getBattle().cycleTarget(); }
    });
    $('btn-cam').addEventListener('click', () => {
      this.freeCam = !this.freeCam;
      $('btn-cam').classList.toggle('on', this.freeCam);
      const b = this.getBattle();
      if (b && b.phase === 'play') {
        const bug = b.activeBug();
        if (this.freeCam) this.cams.setMode('orbit', { target: () => b._v3(b.bugPos(bug)) });
        else this.cams.setMode('aim', { target: () => b._v3(b.bugPos(bug)), aim: () => b.aim });
      }
    });

    // keys
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const b = this.getBattle();
      if (e.key === 'a' || e.key === 'ArrowLeft') this._walk(-1);
      if (e.key === 'd' || e.key === 'ArrowRight') this._walk(1);
      if (e.key === ' ') { if (this._myTurn()) { b.startCharge(); $('btn-fire').classList.add('charging'); } e.preventDefault(); }
      if (e.key === 'Tab' || e.key === 'q') { if (this._myTurn()) this.ui.toggleWheel(); e.preventDefault(); }
      if (e.key === 'e') { if (this._myTurn()) b.cycleTarget(); }
      if (e.key === 'Escape') this.ui.togglePause();
    });
    window.addEventListener('keyup', (e) => {
      const b = this.getBattle();
      if (['a', 'd', 'ArrowLeft', 'ArrowRight'].includes(e.key)) this._walk(0);
      if (e.key === ' ') { if (b) b.releaseCharge(); $('btn-fire').classList.remove('charging'); }
    });
  }

  _walk(d) { const b = this.getBattle(); if (b && this._myTurn()) b.setWalk(d); }

  _down(e) {
    audio.resume();
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinchD = Math.hypot(a.x - b.x, a.y - b.y);
    }
    const b = this.getBattle();
    if (b && b.phase === 'replay') b.skipReplay();
  }

  _move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    const b = this.getBattle();

    if (this.pointers.size === 2) {
      const [a, c] = [...this.pointers.values()];
      const d = Math.hypot(a.x - c.x, a.y - c.y);
      if (this.pinchD > 0) this.cams.orbitZoom(clamp(this.pinchD / Math.max(1, d), 0.9, 1.1));
      this.pinchD = d;
      this.cams.orbitDrag(dx * 0.5, dy * 0.5);
      return;
    }

    if (b && this._myTurn() && !this.freeCam) {
      if (b.targeting) {
        // drag the strike reticle in camera-relative ground space
        const yaw = Math.atan2(
          this.cams.cam.position.x - this.cams.smoothLook.x,
          this.cams.cam.position.z - this.cams.smoothLook.z);
        const k = 0.02;
        const rx = Math.cos(yaw) * dx * k - Math.sin(yaw) * dy * k;
        const rz = -Math.sin(yaw) * dx * k - Math.cos(yaw) * dy * k;
        b.moveReticle(rx, rz);
      } else {
        b.addAim(dx * 0.0052, -dy * 0.0042);
      }
    } else {
      this.cams.orbitDrag(dx, dy);
    }
  }

  _up(e) {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinchD = 0;
  }

  resetFreeCam() {
    this.freeCam = false;
    $('btn-cam').classList.remove('on');
  }
}
