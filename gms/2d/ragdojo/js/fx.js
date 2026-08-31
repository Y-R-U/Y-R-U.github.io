// Particles, screen shake, hitstop, floating text, and the ink that stays on the page.

import { stroke, splat, speedLines, rnd, INK } from './ink.js';

export class FX {
  constructor(w, h) {
    this.parts = [];
    this.texts = [];
    this.bursts = [];
    this.shake = 0;
    this.shakeX = 0; this.shakeY = 0;
    this.hitstop = 0;
    this.flash = 0;
    // Splats and scuffs bake here so the page gets visibly messier as the fight goes on.
    this.marks = document.createElement('canvas');
    this.marks.width = w; this.marks.height = h;
    this.mctx = this.marks.getContext('2d');
    this.markCount = 0;
  }

  clearMarks() {
    this.mctx.clearRect(0, 0, this.marks.width, this.marks.height);
    this.markCount = 0;
  }

  /** Permanent ink on the page. Capped so a long fight cannot bury the arena. */
  mark(x, y, r, seed, col = INK, alpha = 0.5) {
    if (this.markCount > 220) return;
    this.markCount++;
    splat(this.mctx, x, y, r, seed, col, alpha);
  }

  scuff(x, y, len, seed) {
    if (this.markCount > 220) return;
    this.markCount++;
    stroke(this.mctx, [[x - len / 2, y], [x + len / 2, y + rnd(seed) * 4 - 2]],
      { w: 3, passes: 1, wob: 1.5, seed, col: '#4a4436', a: 0.28, step: 6 });
  }

  shakeBy(v) { this.shake = Math.min(34, this.shake + v); }
  stop(v) { this.hitstop = Math.max(this.hitstop, v); }

  /** kind: scrap | ink | dust | crumb | star */
  spawn(x, y, vx, vy, kind, n = 1, opts = {}) {
    for (let i = 0; i < n; i++) {
      this.parts.push({
        x, y,
        vx: vx + (Math.random() * 2 - 1) * (opts.spread ?? 90),
        vy: vy + (Math.random() * 2 - 1) * (opts.spread ?? 90),
        life: opts.life ?? (0.5 + Math.random() * 0.7),
        age: 0, kind,
        rot: Math.random() * 6.28, spin: (Math.random() * 2 - 1) * 9,
        size: (opts.size ?? 5) * (0.6 + Math.random() * 0.8),
        col: opts.col || INK,
        seed: (Math.random() * 1e6) | 0,
      });
    }
  }

  burst(x, y, power, col = INK) {
    this.bursts.push({ x, y, age: 0, life: 0.28, power, col, seed: (Math.random() * 1e6) | 0 });
  }

  text(x, y, str, opts = {}) {
    this.texts.push({
      x, y, str, age: 0, life: opts.life ?? 0.9,
      col: opts.col || '#20242c', size: opts.size ?? 30,
      vy: opts.vy ?? -70, vx: opts.vx ?? (Math.random() * 2 - 1) * 22,
      rot: (Math.random() * 2 - 1) * 0.16,
    });
  }

  update(dt, groundY) {
    if (this.hitstop > 0) this.hitstop -= dt;
    this.shake *= Math.pow(0.001, dt);
    if (this.shake < 0.3) this.shake = 0;
    const a = Math.random() * 6.283;
    this.shakeX = Math.cos(a) * this.shake;
    this.shakeY = Math.sin(a) * this.shake * 0.7;
    this.flash = Math.max(0, this.flash - dt * 4);

    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.age += dt;
      if (p.age >= p.life) { this.parts.splice(i, 1); continue; }
      const drag = p.kind === 'scrap' ? 1.6 : p.kind === 'dust' ? 3.2 : 0.7;
      p.vx -= p.vx * drag * dt;
      p.vy -= p.vy * drag * dt;
      p.vy += (p.kind === 'scrap' ? 320 : p.kind === 'dust' ? -40 : 900) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      if (p.kind === 'ink' && p.y > groundY) {
        this.mark(p.x, groundY, p.size * 0.7, p.seed, p.col, 0.4);
        this.parts.splice(i, 1);
      }
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.age += dt;
      if (t.age >= t.life) { this.texts.splice(i, 1); continue; }
      t.x += t.vx * dt;
      t.y += t.vy * dt;
      t.vy += 120 * dt;
    }
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      this.bursts[i].age += dt;
      if (this.bursts[i].age >= this.bursts[i].life) this.bursts.splice(i, 1);
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    for (const b of this.bursts) {
      const u = b.age / b.life;
      ctx.globalAlpha = 1 - u;
      speedLines(ctx, b.x, b.y, 10 + u * b.power * 0.5, 26 + u * b.power * 1.5,
        6 + ((b.power / 8) | 0), b.seed, { col: b.col, w: 3 * (1 - u) + 1, a: 1 });
    }
    ctx.globalAlpha = 1;

    for (const p of this.parts) {
      const u = p.age / p.life;
      ctx.globalAlpha = Math.min(1, (1 - u) * 1.8);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      if (p.kind === 'scrap') {
        ctx.fillStyle = '#fbf7ec';
        ctx.strokeStyle = 'rgba(60,60,50,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-p.size, -p.size * 0.7);
        ctx.lineTo(p.size, -p.size * 0.4);
        ctx.lineTo(p.size * 0.7, p.size * 0.8);
        ctx.lineTo(-p.size * 0.8, p.size * 0.5);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
      } else if (p.kind === 'dust' || p.kind === 'crumb') {
        ctx.fillStyle = p.kind === 'dust' ? 'rgba(150,140,118,0.7)' : '#d8cfae';
        ctx.beginPath();
        ctx.arc(0, 0, p.size * (1 - u * 0.4), 0, 6.283);
        ctx.fill();
      } else if (p.kind === 'star') {
        ctx.strokeStyle = p.col; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
        for (let k = 0; k < 3; k++) {
          const a = p.rot + k * 1.05;
          ctx.beginPath();
          ctx.moveTo(-Math.cos(a) * p.size, -Math.sin(a) * p.size);
          ctx.lineTo(Math.cos(a) * p.size, Math.sin(a) * p.size);
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = p.col;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size, p.size * 0.75, 0, 0, 6.283);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    for (const t of this.texts) {
      const u = t.age / t.life;
      ctx.save();
      ctx.globalAlpha = Math.min(1, (1 - u) * 2.2);
      ctx.translate(t.x, t.y);
      ctx.rotate(t.rot);
      const pop = u < 0.16 ? 0.6 + u / 0.16 * 0.5 : 1.1 - u * 0.1;
      ctx.scale(pop, pop);
      ctx.font = `700 ${t.size}px "Patrick Hand", "Bradley Hand", "Segoe Print", cursive`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(250,247,238,0.9)';
      ctx.strokeText(t.str, 0, 0);
      ctx.fillStyle = t.col;
      ctx.fillText(t.str, 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }
}
