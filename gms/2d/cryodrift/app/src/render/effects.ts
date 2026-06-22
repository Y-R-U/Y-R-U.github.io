import { Graphics } from 'pixi.js';
import { settings } from '../core/settings';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: number;
  drag: number;
  glow: boolean;
  alive: boolean;
}

/**
 * Pooled, immediate-mode particle system (build plan §7 — allocate nothing hot).
 * All live particles are drawn into a single Graphics each frame; the struct pool
 * is reused. Counts are scaled by the active quality tier.
 */
export class Particles {
  readonly g = new Graphics();
  private pool: Particle[] = [];
  private next = 0;
  /** scaled by quality tier (set by Quality) */
  density = 1;

  constructor(cap = 900) {
    for (let i = 0; i < cap; i++) {
      this.pool.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, color: 0xffffff, drag: 1, glow: false, alive: false });
    }
  }

  private take(): Particle {
    // ring buffer: oldest gets recycled if we wrap
    for (let n = 0; n < this.pool.length; n++) {
      const p = this.pool[this.next];
      this.next = (this.next + 1) % this.pool.length;
      if (!p.alive) return p;
    }
    return this.pool[this.next];
  }

  emit(x: number, y: number, count: number, opts: { color: number; speed: number; life: number; size: number; spread?: number; drag?: number; glow?: boolean; dirX?: number; dirY?: number; cone?: number }): void {
    count = Math.max(1, Math.round(count * this.density));
    for (let i = 0; i < count; i++) {
      const p = this.take();
      let a: number;
      if (opts.dirX !== undefined && opts.cone) {
        const base = Math.atan2(opts.dirY ?? 0, opts.dirX);
        a = base + (Math.random() - 0.5) * opts.cone;
      } else {
        a = Math.random() * Math.PI * 2;
      }
      const sp = opts.speed * (0.4 + Math.random() * 0.6);
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.max = p.life = opts.life * (0.7 + Math.random() * 0.6);
      p.size = opts.size * (0.7 + Math.random() * 0.6);
      p.color = opts.color;
      p.drag = opts.drag ?? 0.9;
      p.glow = opts.glow ?? false;
      p.alive = true;
    }
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        continue;
      }
      const d = Math.pow(p.drag, dt);
      p.vx *= d;
      p.vy *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  draw(): void {
    const g = this.g;
    g.clear();
    for (const p of this.pool) {
      if (!p.alive) continue;
      const t = p.life / p.max;
      const a = t * t;
      if (p.glow) g.circle(p.x, p.y, p.size * (1 + (1 - t) * 1.5)).fill({ color: p.color, alpha: a * 0.18 });
      g.circle(p.x, p.y, p.size * (0.4 + t * 0.6)).fill({ color: p.color, alpha: a });
    }
  }
}

/** Screen shake + full-screen hit flash. */
export class Juice {
  shakeMag = 0;
  shakeX = 0;
  shakeY = 0;
  flashAlpha = 0;
  flashColor = 0xffffff;
  /** 0..1 timescale for kill micro-pauses (1 = normal). */
  private slowT = 0;

  addShake(mag: number): void {
    if (settings.reduceMotion) return;
    this.shakeMag = Math.min(28, this.shakeMag + mag);
  }
  addFlash(color: number, alpha: number): void {
    this.flashColor = color;
    this.flashAlpha = Math.max(this.flashAlpha, alpha);
  }
  microPause(amount = 0.12): void {
    if (settings.reduceMotion) return;
    this.slowT = Math.max(this.slowT, amount);
  }

  /** call with real dt; returns the sim timescale to apply this frame. */
  update(dt: number): number {
    this.shakeMag *= Math.pow(0.0009, dt);
    if (this.shakeMag < 0.2) this.shakeMag = 0;
    this.shakeX = (Math.random() - 0.5) * 2 * this.shakeMag;
    this.shakeY = (Math.random() - 0.5) * 2 * this.shakeMag;
    this.flashAlpha *= Math.pow(0.0006, dt);
    if (this.flashAlpha < 0.01) this.flashAlpha = 0;

    let scale = 1;
    if (this.slowT > 0) {
      this.slowT = Math.max(0, this.slowT - dt);
      scale = 0.25;
    }
    return scale;
  }
}
