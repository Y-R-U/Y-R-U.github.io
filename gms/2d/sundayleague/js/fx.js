// ---- particles, floating text, screen shake, weather ----
import { rand, pick, clamp } from './util.js';

const MAX_P = 260;

export class FX {
  constructor() {
    this.parts = [];
    for (let i = 0; i < MAX_P; i++) {
      this.parts.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, size: 2, color: '#fff', grav: true });
    }
    this.pi = 0;
    this.texts = [];        // world floating texts
    this.cards = [];        // {x, y, kind, t, dur} — ref's card held aloft
    this.banner = null;     // {str, sub, t, dur, color}
    this.shake = 0;
    this.weather = null;    // 'rain' | 'snow'
    this.wParts = [];       // screen-space weather
    for (let i = 0; i < 70; i++) this.wParts.push({ x: Math.random(), y: Math.random(), s: rand(0.5, 1) });
  }

  _spawn(x, y, vx, vy, vz, life, size, color, grav = true) {
    const p = this.parts[this.pi];
    this.pi = (this.pi + 1) % MAX_P;
    p.on = true; p.x = x; p.y = y; p.z = 2;
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.life = life; p.maxLife = life; p.size = size; p.color = color; p.grav = grav;
  }

  grassKick(x, y, color = '#2c6e38') {
    for (let i = 0; i < 5; i++) this._spawn(x, y, rand(-40, 40), rand(-40, 40), rand(60, 160), rand(0.3, 0.6), 2, color);
  }

  splash(x, y) {
    for (let i = 0; i < 7; i++) this._spawn(x, y, rand(-60, 60), rand(-60, 60), rand(40, 140), rand(0.25, 0.5), 2, 'rgba(200,225,255,0.8)');
  }

  confetti(x, y, colors) {
    for (let i = 0; i < 70; i++) {
      this._spawn(x + rand(-70, 70), y + rand(-40, 40), rand(-90, 90), rand(-90, 90), rand(140, 380),
        rand(1.2, 2.4), rand(2, 4), pick(colors));
    }
  }

  puff(x, y, color = 'rgba(255,255,255,0.7)') {
    for (let i = 0; i < 6; i++) this._spawn(x, y, rand(-70, 70), rand(-70, 70), rand(10, 60), rand(0.2, 0.45), 3, color, false);
  }

  text(x, y, str, color = '#fff') {
    this.texts.push({ x, y, str, color, t: 0, dur: 1.1 });
  }

  card(x, y, kind, n = 0) {
    this.cards.push({ x, y, kind, n, t: 0, dur: 1.8 });
  }

  bigText(str, { sub = '', color = '#ffd94a', dur = 1.8 } = {}) {
    this.banner = { str, sub, color, t: 0, dur };
  }

  addShake(m) { this.shake = Math.min(14, this.shake + m); }

  setWeather(w) { this.weather = w; }

  update(dt) {
    for (const p of this.parts) {
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) { p.on = false; continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.grav) {
        p.vz -= 600 * dt; p.z += p.vz * dt;
        if (p.z <= 0) { p.z = 0; p.vz *= -0.4; p.vx *= 0.6; p.vy *= 0.6; }
      }
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.t += dt;
      if (t.t > t.dur) this.texts.splice(i, 1);
    }
    for (let i = this.cards.length - 1; i >= 0; i--) {
      const c = this.cards[i];
      c.t += dt;
      if (c.t > c.dur) this.cards.splice(i, 1);
    }
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t > this.banner.dur) this.banner = null;
    }
    this.shake *= Math.exp(-7 * dt);
    if (this.shake < 0.3) this.shake = 0;
    if (this.weather) {
      const sp = this.weather === 'rain' ? 1.4 : 0.16;
      for (const w of this.wParts) {
        w.y += sp * w.s * dt;
        w.x += (this.weather === 'rain' ? 0.06 : 0.03 * Math.sin(w.y * 9)) * dt;
        if (w.y > 1) { w.y -= 1; w.x = Math.random(); }
        if (w.x > 1) w.x -= 1;
      }
    }
  }

  // world-space (called inside camera transform)
  drawWorld(ctx) {
    for (const p of this.parts) {
      if (!p.on) continue;
      ctx.globalAlpha = clamp(p.life / p.maxLife * 1.6, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.z - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    for (const c of this.cards) {
      const rise = Math.min(1, c.t / 0.22);
      const a = clamp((c.dur - c.t) / 0.4, 0, 1);
      const y = c.y - 24 - rise * 16;
      const tilt = Math.sin(c.t * 7) * 0.09 * (1 - c.t / c.dur);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(c.x, y);
      ctx.rotate(tilt);
      ctx.scale(rise, rise);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(-5, -8, 11, 16);
      ctx.fillStyle = c.kind === 'red' ? '#e03131' : '#ffd43b';
      ctx.fillRect(-5, -8, 10, 15);
      ctx.fillStyle = c.kind === 'red' ? '#ff6b6b' : '#ffe98a';
      ctx.fillRect(-5, -8, 10, 3);
      if (c.n) {                       // which booking this is — 3rd one and he walks
        ctx.fillStyle = '#5c4a00';
        ctx.font = '800 9px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(c.n), 0, 1);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    for (const t of this.texts) {
      const a = clamp(1.4 - t.t / t.dur * 1.4, 0, 1);
      ctx.globalAlpha = a;
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#000a';
      ctx.fillText(t.str, t.x + 1, t.y - 18 - t.t * 22 + 1);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y - 18 - t.t * 22);
    }
    ctx.globalAlpha = 1;
  }

  // screen-space (css px, after camera)
  drawScreen(ctx, w, h) {
    if (this.weather) {
      ctx.strokeStyle = 'rgba(190,215,255,0.4)';
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 1;
      for (const p of this.wParts) {
        const x = p.x * w, y = p.y * h;
        if (this.weather === 'rain') {
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 2, y + 9 * p.s); ctx.stroke();
        } else {
          ctx.fillRect(x, y, 2 + p.s, 2 + p.s);
        }
      }
    }
    if (this.banner) {
      const b = this.banner;
      const inT = Math.min(1, b.t / 0.18);
      const outT = clamp((b.dur - b.t) / 0.25, 0, 1);
      const a = Math.min(inT, outT);
      const scale = 0.8 + 0.2 * inT;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(w / 2, h * 0.32);
      ctx.scale(scale, scale);
      ctx.font = '900 46px "Arial Black", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 8;
      ctx.strokeStyle = '#08120c';
      ctx.strokeText(b.str, 0, 0);
      ctx.fillStyle = b.color;
      ctx.fillText(b.str, 0, 0);
      if (b.sub) {
        ctx.font = '700 17px system-ui, sans-serif';
        ctx.lineWidth = 5;
        ctx.strokeText(b.sub, 0, 30);
        ctx.fillStyle = '#fff';
        ctx.fillText(b.sub, 0, 30);
      }
      ctx.restore();
    }
  }
}
