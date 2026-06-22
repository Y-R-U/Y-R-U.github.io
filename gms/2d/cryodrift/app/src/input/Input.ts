import { FEEL } from '../config/feel';
import { settings } from '../core/settings';
import { emptyInput, type InputState } from './InputState';

interface StickVisual {
  ox: number;
  oy: number;
  kx: number;
  ky: number;
  side: 'thrust' | 'aim';
}

/**
 * Twin-stick touch input (build plan §3). The screen splits into two halves;
 * a press in the "thrust" half spawns a floating throttle stick, a press in the
 * "aim" half spawns a floating aim stick that auto-fires while held. Boost and a
 * context-special button live in the lower corners. Keyboard + mouse mirror it
 * for desktop testing only. Which half is which respects settings.swapSticks.
 */
export class Input {
  private readonly state: InputState = emptyInput();

  // active floating sticks, keyed by pointerId
  private thrust: { id: number; ox: number; oy: number; cx: number; cy: number } | null = null;
  private aim: { id: number; ox: number; oy: number; cx: number; cy: number } | null = null;

  sticks: StickVisual[] = [];

  private boostHeld = false;
  private specialHeld = false;
  private keys = new Set<string>();
  private mouse = { x: 0, y: 0, down: false };

  onFirstInput?: () => void;
  private gotFirst = false;

  constructor(canvas: HTMLCanvasElement, boostBtn: HTMLElement, specialBtn: HTMLElement) {
    canvas.addEventListener('pointerdown', this.onDown, { passive: false });
    canvas.addEventListener('pointermove', this.onMove, { passive: false });
    canvas.addEventListener('pointerup', this.onUp, { passive: false });
    canvas.addEventListener('pointercancel', this.onUp, { passive: false });

    this.bindButton(boostBtn, (v) => (this.boostHeld = v));
    this.bindButton(specialBtn, (v) => (this.specialHeld = v));

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.key.toLowerCase());
      this.first();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });
    window.addEventListener('mousedown', () => (this.mouse.down = true));
    window.addEventListener('mouseup', () => (this.mouse.down = false));
  }

  private bindButton(btn: HTMLElement, set: (v: boolean) => void): void {
    const on = (e: Event) => {
      e.preventDefault();
      set(true);
      btn.classList.add('active');
      this.first();
    };
    const off = () => {
      set(false);
      btn.classList.remove('active');
    };
    btn.addEventListener('pointerdown', on, { passive: false });
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointercancel', off);
    btn.addEventListener('pointerleave', off);
  }

  private first(): void {
    if (this.gotFirst) return;
    this.gotFirst = true;
    this.onFirstInput?.();
  }

  /** which half does this x belong to? returns the role. */
  private roleAt(x: number): 'thrust' | 'aim' {
    const leftIsThrust = !settings.swapSticks;
    const onLeft = x < window.innerWidth * 0.5;
    if (onLeft) return leftIsThrust ? 'thrust' : 'aim';
    return leftIsThrust ? 'aim' : 'thrust';
  }

  private onDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse') return; // desktop uses mouse for aim/fire, not sticks
    e.preventDefault();
    this.first();
    const role = this.roleAt(e.clientX);
    if (role === 'thrust' && !this.thrust) {
      this.thrust = { id: e.pointerId, ox: e.clientX, oy: e.clientY, cx: e.clientX, cy: e.clientY };
    } else if (role === 'aim' && !this.aim) {
      this.aim = { id: e.pointerId, ox: e.clientX, oy: e.clientY, cx: e.clientX, cy: e.clientY };
    }
  };

  private onMove = (e: PointerEvent): void => {
    if (this.thrust && e.pointerId === this.thrust.id) {
      this.thrust.cx = e.clientX;
      this.thrust.cy = e.clientY;
    } else if (this.aim && e.pointerId === this.aim.id) {
      this.aim.cx = e.clientX;
      this.aim.cy = e.clientY;
    }
  };

  private onUp = (e: PointerEvent): void => {
    if (this.thrust && e.pointerId === this.thrust.id) this.thrust = null;
    if (this.aim && e.pointerId === this.aim.id) this.aim = null;
  };

  sample(): InputState {
    const s = this.state;
    this.sticks.length = 0;

    // thrust
    let tx = 0;
    let ty = 0;
    let throttle = 0;
    if (this.thrust) {
      const dx = this.thrust.cx - this.thrust.ox;
      const dy = this.thrust.cy - this.thrust.oy;
      const d = Math.hypot(dx, dy);
      const max = FEEL.stickMaxRadius;
      const clamped = Math.min(d, max);
      const norm = clamped / max;
      if (norm > FEEL.stickDeadzone && d > 1e-3) {
        tx = dx / d;
        ty = dy / d;
        throttle = ((norm - FEEL.stickDeadzone) / (1 - FEEL.stickDeadzone)) * settings.sensitivity;
        throttle = Math.min(1, throttle);
      }
      const kx = this.thrust.ox + (d > 0 ? (dx / d) * clamped : 0);
      const ky = this.thrust.oy + (d > 0 ? (dy / d) * clamped : 0);
      this.sticks.push({ ox: this.thrust.ox, oy: this.thrust.oy, kx, ky, side: 'thrust' });
    } else {
      let kx = 0;
      let ky = 0;
      if (this.keys.has('a') || this.keys.has('arrowleft')) kx -= 1;
      if (this.keys.has('d') || this.keys.has('arrowright')) kx += 1;
      if (this.keys.has('w') || this.keys.has('arrowup')) ky -= 1;
      if (this.keys.has('s') || this.keys.has('arrowdown')) ky += 1;
      const l = Math.hypot(kx, ky);
      if (l > 0) {
        tx = kx / l;
        ty = ky / l;
        throttle = 1;
      }
    }

    // aim + fire
    let ax = s.aimX;
    let ay = s.aimY;
    let firing = false;
    if (this.aim) {
      const dx = this.aim.cx - this.aim.ox;
      const dy = this.aim.cy - this.aim.oy;
      const d = Math.hypot(dx, dy);
      if (d > 6) {
        ax = dx / d;
        ay = dy / d;
      }
      firing = true;
      const max = FEEL.stickMaxRadius;
      const clamped = Math.min(d, max);
      const kx = this.aim.ox + (d > 0 ? (dx / d) * clamped : 0);
      const ky = this.aim.oy + (d > 0 ? (dy / d) * clamped : 0);
      this.sticks.push({ ox: this.aim.ox, oy: this.aim.oy, kx, ky, side: 'aim' });
    } else if (this.mouse.down || this.keys.has('f')) {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const dx = this.mouse.x - cx;
      const dy = this.mouse.y - cy;
      const d = Math.hypot(dx, dy) || 1;
      ax = dx / d;
      ay = dy / d;
      firing = true;
    }

    s.thrustX = tx;
    s.thrustY = ty;
    s.throttle = throttle;
    s.aimX = ax;
    s.aimY = ay;
    s.firing = firing;
    s.boost = this.boostHeld || this.keys.has('shift');
    s.special = this.specialHeld || this.keys.has(' ') || this.keys.has('e');
    return s;
  }
}
