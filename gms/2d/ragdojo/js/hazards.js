// Page-level events. Each one telegraphs before it hurts, and exposes threatens(x)
// so the AI dodges it too.

import { stroke, line, circle, rect, splat, scribble, rnd, INK } from './ink.js';
import { GROUND_Y, SHEET_W, SHEET_H } from './config.js';

class Hazard {
  constructor(a) { this.arena = a; this.dead = false; this.t = 0; }
  threatens() { return false; }
  update(dt) { this.t += dt; }
  drawBack() {}
  drawFront() {}
}

/** A giant pencil stabs the page where a fighter was standing. */
export class PencilStrike extends Hazard {
  constructor(a, x) {
    super(a);
    this.x = x;
    this.phase = 'aim';
    this.aimT = 1.05;
    this.y = -520;
    this.vy = 0;
    this.hit = false;
  }
  threatens(x) { return this.phase === 'aim' && Math.abs(x - this.x) < 80; }
  update(dt, fighters, fx) {
    this.t += dt;
    if (this.phase === 'aim') {
      this.aimT -= dt;
      if (this.aimT <= 0) { this.phase = 'drop'; this.vy = 300; }
    } else if (this.phase === 'drop') {
      this.vy += 5200 * dt;
      this.y += this.vy * dt;
      if (this.y >= GROUND_Y - 40) {
        this.y = GROUND_Y - 40;
        this.phase = 'stuck';
        this.stuckT = 0.9;
        if (!this.hit) {
          this.hit = true;
          fx.shakeBy(24);
          fx.stop(0.06);
          fx.mark(this.x, GROUND_Y, 26, (Math.random() * 1e6) | 0, INK, 0.6);
          fx.spawn(this.x, GROUND_Y, 0, -260, 'scrap', 14, { spread: 260, size: 6 });
          fx.spawn(this.x, GROUND_Y, 0, -120, 'dust', 12, { spread: 200, size: 7 });
          for (const f of fighters) {
            const d = Math.abs(f.x - this.x);
            if (d < 130 && !f.dead) {
              f.hurt(24, { from: [this.x, GROUND_Y - 200], kb: 900, stagger: 1, launch: false });
            }
          }
        }
      }
    } else {
      this.stuckT -= dt;
      this.y -= dt * 260;
      if (this.stuckT <= 0) { this.y -= dt * 900; if (this.y < -600) this.dead = true; }
    }
  }
  drawFront(ctx) {
    if (this.phase === 'aim') {
      const pulse = 0.4 + Math.abs(Math.sin(this.t * 9)) * 0.6;
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = pulse;
      circle(ctx, this.x, GROUND_Y - 4, 42, { w: 3.5, passes: 1, wob: 1.6, seed: 91, col: '#c0392b' });
      line(ctx, this.x - 26, GROUND_Y - 26, this.x + 26, GROUND_Y + 18, { w: 3, passes: 1, col: '#c0392b' });
      line(ctx, this.x + 26, GROUND_Y - 26, this.x - 26, GROUND_Y + 18, { w: 3, passes: 1, col: '#c0392b' });
      ctx.restore();
    }
    if (this.phase === 'aim') return;
    const y = this.y;
    ctx.save();
    ctx.translate(this.x, y);
    const W = 46;
    ctx.fillStyle = '#e8b93a';
    ctx.strokeStyle = '#5a4a12';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.rect(-W / 2, -560, W, 520); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f2d27a';
    ctx.fillRect(-W / 2 + 6, -560, 9, 520);
    ctx.beginPath();
    ctx.moveTo(-W / 2, -40); ctx.lineTo(0, 6); ctx.lineTo(W / 2, -40); ctx.closePath();
    ctx.fillStyle = '#e2c9a0'; ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-11, -12); ctx.lineTo(0, 6); ctx.lineTo(11, -12); ctx.closePath();
    ctx.fillStyle = '#2b2b2b'; ctx.fill();
    ctx.restore();
  }
}

/** A giant eraser sweeps the page at shin height. Jump it. */
export class EraserSweep extends Hazard {
  constructor(a, dir = 1) {
    super(a);
    this.dir = dir;
    this.x = dir > 0 ? -160 : SHEET_W + 160;
    this.speed = 470;
    this.hitSet = new Set();
  }
  threatens(x) { return Math.abs(x - this.x) < 230 && Math.sign(x - this.x) === this.dir; }
  update(dt, fighters, fx) {
    this.t += dt;
    this.x += this.speed * this.dir * dt;
    if (this.x < -300 || this.x > SHEET_W + 300) this.dead = true;
    for (const f of fighters) {
      if (f.dead || this.hitSet.has(f.id)) continue;
      const feetY = Math.max(f.rag.y[8], f.rag.y[10]);
      if (Math.abs(f.x - this.x) < 62 && feetY > GROUND_Y - 78) {
        this.hitSet.add(f.id);
        f.hurt(18, { from: [this.x - this.dir * 60, GROUND_Y - 30], kb: 1050, stagger: 1 });
        fx.shakeBy(12);
        fx.spawn(f.x, GROUND_Y - 30, this.dir * 200, -160, 'crumb', 12, { spread: 170, size: 5 });
      }
    }
    if (Math.random() < dt * 26) {
      fx.spawn(this.x - this.dir * 40, GROUND_Y - 6, -this.dir * 60, -60, 'crumb', 1, { spread: 60, size: 4 });
      fx.scuff(this.x, GROUND_Y - 2, 40, (Math.random() * 1e6) | 0);
    }
  }
  drawFront(ctx) {
    ctx.save();
    ctx.translate(this.x, GROUND_Y - 40);
    ctx.rotate(Math.sin(this.t * 8) * 0.05);
    ctx.fillStyle = '#e8b7bd';
    ctx.strokeStyle = '#7a4048';
    ctx.lineWidth = 3.4;
    ctx.beginPath(); ctx.roundRect(-58, -46, 116, 88, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#c9dbe8';
    ctx.beginPath(); ctx.roundRect(-58, -46, 34, 88, 7); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}

/** A coffee ring spreads. Standing in it burns. */
export class CoffeeStain extends Hazard {
  constructor(a, x) {
    super(a);
    this.x = x;
    this.r = 10;
    this.max = 150 + Math.random() * 90;
    this.tick = 0;
    this.seed = (Math.random() * 1e6) | 0;
  }
  update(dt, fighters, fx) {
    this.t += dt;
    this.r = Math.min(this.max, this.r + dt * 52);
    this.tick -= dt;
    if (this.tick <= 0) {
      this.tick = 0.65;
      for (const f of fighters) {
        if (f.dead) continue;
        const feetY = Math.max(f.rag.y[8], f.rag.y[10]);
        if (Math.abs(f.x - this.x) < this.r && feetY > GROUND_Y - 40) {
          f.hurt(4, { from: [f.x, GROUND_Y + 20], kb: 60, stagger: 0.1 });
          fx.spawn(f.x, GROUND_Y - 10, 0, -70, 'ink', 3, { spread: 60, size: 3, col: '#6b4423' });
        }
      }
    }
  }
  drawBack(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.5;
    const g = ctx.createRadialGradient(this.x, GROUND_Y - 2, this.r * 0.2, this.x, GROUND_Y - 2, this.r);
    g.addColorStop(0, 'rgba(150,100,54,0.42)');
    g.addColorStop(0.78, 'rgba(126,82,42,0.32)');
    g.addColorStop(1, 'rgba(106,68,34,0.62)');
    ctx.fillStyle = g;
    ctx.beginPath();
    for (let i = 0; i <= 22; i++) {
      const a = (i / 22) * 6.283;
      const rr = this.r * (0.86 + rnd(this.seed + i) * 0.26);
      const px = this.x + Math.cos(a) * rr, py = GROUND_Y - 2 + Math.sin(a) * rr * 0.28;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

/** The page lifts in a draught — everything slides. */
export class Draught extends Hazard {
  constructor(a) { super(a); this.dur = 9; this.dir = Math.random() < 0.5 ? -1 : 1; }
  update(dt, fighters, fx) {
    this.t += dt;
    this.dur -= dt;
    if (this.dur <= 0) this.dead = true;
    const gust = Math.sin(this.t * 1.5) * 0.5 + 0.6;
    this.force = this.dir * gust * 190;
    for (const f of fighters) {
      if (f.dead) continue;
      if (f.mode === 'down' || f.mode === 'dead') {
        for (let i = 0; i < 11; i++) f.rag.px[i] -= this.force * dt * 0.02;
      } else if (!f.onGround) f.vx += this.force * dt * 1.6;
      else f.vx += this.force * dt * 0.5;
    }
    if (Math.random() < dt * 8) {
      fx.spawn(this.dir > 0 ? -20 : SHEET_W + 20, 150 + Math.random() * 520,
        this.dir * 420, -30, 'scrap', 1, { spread: 60, size: 5, life: 3 });
    }
  }
  drawFront(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.20;
    for (let i = 0; i < 7; i++) {
      const y = 130 + i * 95 + Math.sin(this.t * 2 + i) * 14;
      const x0 = this.dir > 0 ? 40 : SHEET_W - 40;
      stroke(ctx, [[x0, y], [x0 + this.dir * 240, y - 12], [x0 + this.dir * 430, y + 6]],
        { w: 2.6, passes: 1, wob: 1.2, seed: i * 31 + ((this.t * 6) | 0), col: '#5d6a80', a: 1, step: 22 });
    }
    ctx.restore();
  }
}

/** The paper rips open. Fall in and you climb back out the worse for it. */
export class Tear extends Hazard {
  constructor(a, x) {
    super(a);
    this.x = x;
    this.w = 0;
    this.maxW = 150 + Math.random() * 70;
    this.seed = (Math.random() * 1e6) | 0;
    this.caught = new Set();
  }
  get span() { return [this.x - this.w / 2, this.x + this.w / 2]; }
  threatens(x) { return this.w > 40 && Math.abs(x - this.x) < this.w * 0.7; }
  update(dt, fighters, fx) {
    this.t += dt;
    this.w = Math.min(this.maxW, this.w + dt * 130);
    const [a, b] = this.span;
    this.arena.world.pit = [a, b];
    this.arena.world.pitFloor = GROUND_Y + 250;
    for (const f of fighters) {
      if (f.dead) continue;
      const feetY = Math.max(f.rag.y[8], f.rag.y[10]);
      if (f.x > a && f.x < b && feetY > GROUND_Y + 30 && !this.caught.has(f.id)) {
        this.caught.add(f.id);
        f.hurt(16, { from: [f.x, GROUND_Y + 300], kb: 700, stagger: 1, launch: true });
        setTimeout(() => this.caught.delete(f.id), 1400);
        fx.shakeBy(10);
      }
      // Standing over the hole with no ground under you.
      if (f.mode === 'live' && f.x > a && f.x < b && f.onGround) {
        f.onGround = false;
        f.vy = Math.max(f.vy, 60);
      }
    }
  }
  drawBack(ctx) {
    const [a, b] = this.span;
    ctx.save();
    ctx.fillStyle = '#2a2a26';
    ctx.beginPath();
    ctx.moveTo(a, GROUND_Y - 2);
    for (let i = 0; i <= 12; i++) {
      const u = i / 12;
      ctx.lineTo(a + (b - a) * u, GROUND_Y + 16 + rnd(this.seed + i) * 26 + Math.sin(u * 6) * 8);
    }
    ctx.lineTo(b, GROUND_Y - 2);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'multiply';
    stroke(ctx, [[a - 8, GROUND_Y - 3], [a + (b - a) * 0.5, GROUND_Y + 2], [b + 8, GROUND_Y - 3]],
      { w: 3, passes: 2, wob: 2.4, seed: this.seed, col: '#6a6252', a: 0.8, step: 9 });
    ctx.restore();
  }
}

/** Rubber crumbs rain down. */
export class CrumbRain extends Hazard {
  constructor(a) { super(a); this.dur = 10; this.spawnT = 0; this.drops = []; }
  update(dt, fighters, fx) {
    this.t += dt; this.dur -= dt;
    if (this.dur <= 0 && !this.drops.length) this.dead = true;
    this.spawnT -= dt;
    if (this.dur > 0 && this.spawnT <= 0) {
      this.spawnT = 0.20;
      this.drops.push({ x: 90 + Math.random() * (SHEET_W - 180), y: -20, vy: 150 + Math.random() * 120, r: 7 + Math.random() * 6 });
    }
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.vy += 1500 * dt;
      d.y += d.vy * dt;
      if (d.y > GROUND_Y - 4) {
        fx.spawn(d.x, GROUND_Y, 0, -100, 'crumb', 5, { spread: 120, size: 4 });
        for (const f of fighters) {
          if (!f.dead && Math.abs(f.x - d.x) < 44) {
            f.hurt(7, { from: [d.x, GROUND_Y - 200], kb: 320, stagger: 0.5 });
          }
        }
        this.drops.splice(i, 1);
      }
    }
  }
  drawFront(ctx) {
    ctx.save();
    ctx.fillStyle = '#dcc9cd';
    ctx.strokeStyle = '#7a4048';
    ctx.lineWidth = 2;
    for (const d of this.drops) {
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, d.r, d.r * 0.8, 0, 0, 6.283);
      ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }
}

/** The artist loses patience and scribbles across the page. */
export class ScribbleStorm extends Hazard {
  constructor(a) {
    super(a);
    this.dur = 8;
    this.next = 0.6;
    this.strokes = [];
  }
  threatens(x) { return this.strokes.some((s) => s.warn > 0 && Math.abs(x - s.x) < 120); }
  update(dt, fighters, fx) {
    this.t += dt; this.dur -= dt;
    if (this.dur <= 0 && !this.strokes.length) this.dead = true;
    this.next -= dt;
    if (this.dur > 0 && this.next <= 0) {
      this.next = 0.85;
      this.strokes.push({ x: 140 + Math.random() * (SHEET_W - 280), warn: 0.55, life: 0.5, seed: (Math.random() * 1e6) | 0, hit: false });
    }
    for (let i = this.strokes.length - 1; i >= 0; i--) {
      const s = this.strokes[i];
      if (s.warn > 0) {
        s.warn -= dt;
        if (s.warn <= 0 && !s.hit) {
          s.hit = true;
          fx.shakeBy(14);
          fx.mark(s.x, GROUND_Y - 60, 20, s.seed, INK, 0.4);
          for (const f of fighters) {
            if (!f.dead && Math.abs(f.x - s.x) < 110) {
              f.hurt(15, { from: [s.x, GROUND_Y - 120], kb: 620, stagger: 0.9 });
            }
          }
        }
      } else {
        s.life -= dt;
        if (s.life <= 0) this.strokes.splice(i, 1);
      }
    }
  }
  drawFront(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    for (const s of this.strokes) {
      if (s.warn > 0) {
        ctx.globalAlpha = 0.35 + Math.sin(this.t * 22) * 0.2;
        stroke(ctx, [[s.x - 100, GROUND_Y - 150], [s.x + 100, GROUND_Y - 150]],
          { w: 3, passes: 1, wob: 1, seed: s.seed, col: '#c0392b' });
      } else {
        ctx.globalAlpha = Math.min(1, s.life * 2.4);
        for (let k = 0; k < 4; k++) {
          scribble(ctx, s.x, GROUND_Y - 130 + k * 34, 210, 44, s.seed + k * 17, { w: 5, a: 0.7, n: 7 });
        }
      }
    }
    ctx.restore();
  }
}

export const HAZARD_CLASS = {
  pencil: PencilStrike, eraser: EraserSweep, coffee: CoffeeStain,
  wind: Draught, tear: Tear, rain: CrumbRain, scribble: ScribbleStorm,
};
