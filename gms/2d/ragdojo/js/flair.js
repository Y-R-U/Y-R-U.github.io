// World flair: the later worlds' specials are louder. Purely visual — nothing here touches
// damage, reach or timing, so sim.mjs balance is unaffected.
//
// Colours are chosen BEFORE the page filter: on a night page (CYBORG, DEMON) a dark stroke
// under `multiply` comes out as light, which is what makes the arcs glow.

import { SHEET_W, GROUND_Y } from './config.js';

const PAL = {
  cyborg: { core: '#05070c', glow: '10,80,104', spark: '#0a3a4c', flash: '#000' },
  god:    { core: '#1d1250', glow: '74,58,224', spark: '#3a2a9a', flash: '#fff' },
  demon:  { core: '#05070c', glow: '0,96,170',  spark: '#003a70', flash: '#000' },
};

/** Eye-laser colours, as [glow rgb, core] chosen before CYBORG's inverting page filter. */
const LASER = [
  ['0,170,190', '#003a44'],    // reads red on the page
  ['170,0,150', '#3a0034'],    // green
  ['0,40,200', '#00103a'],     // amber
  ['200,170,0', '#3a3000'],    // blue
];

/** A jagged path a -> b by midpoint displacement; `amp` is the wildness as a fraction of length. */
function jag(ax, ay, bx, by, amp, depth = 5) {
  let pts = [[ax, ay], [bx, by]];
  let a = Math.hypot(bx - ax, by - ay) * amp;
  for (let d = 0; d < depth; d++) {
    const next = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
      const o = (Math.random() * 2 - 1) * a;
      next.push([(x0 + x1) / 2 - dy / len * o, (y0 + y1) / 2 + dx / len * o], pts[i]);
    }
    pts = next;
    a *= 0.55;
  }
  return pts;
}

export class Flair {
  /** @param theme save.theme  @param demon GOD's replay run */
  constructor(theme, demon = false) {
    this.level = theme === 'god' ? 2 : theme === 'cyborg' ? 1 : 0;
    this.pal = PAL[demon ? 'demon' : theme] || PAL.cyborg;
    this.demon = demon;
    /** How much louder a special's ordinary hit feedback (shake, burst, hitstop) gets. */
    this.mul = [1, 1.6, 2.3][this.level];
    this.bolts = [];
    this.sparks = [];
    this.rings = [];
    this.flash = 0;
    this.lasers = null;
  }

  /**
   * CYBORG's victory, earned by finishing on a special: the winner's eyes fire lasers into
   * everyone they beat, cycling colour, and the bodies jolt with every pulse.
   */
  eyeLasers(winner, losers, secs = 1.9) {
    if (this.level !== 1) return;
    this.lasers = { winner, losers, t: secs, k: 0 };
  }

  updateLasers(dt) {
    const L = this.lasers;
    if (!L) return;
    L.t -= dt;
    if (L.t <= 0) { this.lasers = null; return; }
    L.k += dt;
    const w = L.winner.rag;
    const hx = w.x[2], hy = w.y[2];                 // P.HEAD
    const face = L.winner.facing;
    L.losers.forEach((f, i) => {
      const r = f.rag;
      const j = [0, 1, 2, 3, 7][(Math.floor(L.k * 9) + i) % 5];   // sweep the beam over the body
      const tx = r.x[j], ty = r.y[j];
      for (let e = 0; e < 2; e++) {
        const C = LASER[(Math.floor(L.k * 7) + e + i) % LASER.length];
        this.bolt(hx + face * (3 + e * 6), hy - 3, tx, ty + (e - 0.5) * 6,
          { life: 0.05, w: 2.6, amp: 0.012, branches: 0, glow: C[0], core: C[1] });
      }
      if (Math.random() < dt * 30) {
        this.spark(tx, ty, 3, 380, 0.3);
        r.impulse(j, (Math.random() * 2 - 1) * 3, -2 - Math.random() * 3);
      }
    });
    if (Math.random() < dt * 10) this.flash = Math.max(this.flash, 0.1);
  }

  get on() { return this.level > 0; }

  bolt(ax, ay, bx, by, o = {}) {
    this.bolts.push({
      ax, ay, bx, by, age: 0, life: o.life ?? 0.32, w: o.w ?? 3, amp: o.amp ?? 0.16,
      branches: o.branches ?? 2, regen: 0, paths: null, glow: o.glow, core: o.core,
    });
  }

  spark(x, y, n, speed = 520, life = 0.4) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, s = speed * (0.3 + Math.random() * 0.9);
      this.sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - speed * 0.2,
        age: 0, life: life * (0.5 + Math.random()), ember: false });
    }
  }

  embers(x, y, n, spread = 120) {
    for (let i = 0; i < n; i++) {
      this.sparks.push({ x: x + (Math.random() * 2 - 1) * spread, y: y - Math.random() * 60,
        vx: (Math.random() * 2 - 1) * 60, vy: -120 - Math.random() * 220,
        age: 0, life: 0.7 + Math.random() * 0.9, ember: true });
    }
  }

  ring(x, y, r, life = 0.35, w = 5) { this.rings.push({ x, y, r, age: 0, life, w }); }

  // ── events ───────────────────────────────────────────────────────────────
  /** A special begins. `hx,hy` is the striking hand. */
  cast(f, hx, hy) {
    if (!this.on) return;
    if (this.level === 1) {
      this.spark(hx, hy, 14, 420);
      this.ring(hx, hy, 110, 0.28, 4);
      for (let i = 0; i < 2; i++) {
        const a = Math.random() * 6.283;
        this.bolt(hx, hy, hx + Math.cos(a) * 120, hy + Math.sin(a) * 90, { life: 0.18, w: 2, branches: 0 });
      }
      return;
    }
    // GOD: lightning from the hands, all the way to the edge of the page.
    const edge = f.facing > 0 ? SHEET_W + 40 : -40;
    for (let i = 0; i < 2; i++) {
      this.bolt(hx, hy, edge, hy - 160 + Math.random() * 260, { life: 0.42, w: 4, amp: 0.1, branches: 4 });
    }
    this.bolt(hx, hy, hx + f.facing * 40, -200, { life: 0.3, w: 3, amp: 0.14, branches: 2 });
    this.spark(hx, hy, 24, 640);
    this.ring(f.x, f.y - 70, 220, 0.4, 7);
    this.flash = Math.max(this.flash, 0.38);
    if (this.demon) this.embers(f.x, GROUND_Y, 16);
  }

  /** A special connects at (x, y). */
  impact(x, y) {
    if (!this.on) return;
    if (this.level === 1) {
      this.spark(x, y, 18, 520);
      this.ring(x, y, 150, 0.3, 5);
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * 6.283;
        this.bolt(x, y, x + Math.cos(a) * 170, y + Math.sin(a) * 120, { life: 0.22, w: 2.2, branches: 1 });
      }
      this.flash = Math.max(this.flash, 0.12);
      return;
    }
    // GOD: struck from above.
    this.bolt(x + (Math.random() * 2 - 1) * 90, -260, x, y, { life: 0.5, w: 6, amp: 0.12, branches: 5 });
    for (let i = 0; i < 2; i++) {
      this.bolt(x, y, x + (Math.random() * 2 - 1) * 600, y + (Math.random() * 2 - 1) * 200, { life: 0.3, w: 3, branches: 2 });
    }
    this.spark(x, y, 30, 760);
    this.ring(x, y, 280, 0.45, 8);
    this.flash = Math.max(this.flash, 0.55);
    if (this.demon) this.embers(x, y, 20, 80);
  }

  /** A slam's shockwave goes off at x. */
  slam(x) {
    if (!this.on) return;
    const y = GROUND_Y - 6;
    if (this.level === 1) {
      for (const dir of [-1, 1]) this.bolt(x, y, x + dir * 520, y - 10, { life: 0.35, w: 3, amp: 0.05, branches: 3 });
      this.spark(x, y, 26, 600);
      this.ring(x, y, 260, 0.4, 6);
      this.flash = Math.max(this.flash, 0.2);
      return;
    }
    for (const dir of [-1, 1]) {
      this.bolt(x, y, dir > 0 ? SHEET_W + 40 : -40, y - 20, { life: 0.55, w: 5, amp: 0.04, branches: 6 });
    }
    for (const dx of [-260, 0, 260]) this.bolt(x + dx + (Math.random() * 2 - 1) * 60, -260, x + dx, y, { life: 0.5, w: 5, branches: 4 });
    this.spark(x, y, 40, 820);
    this.ring(x, y, 420, 0.55, 10);
    this.flash = Math.max(this.flash, 0.7);
    if (this.demon) this.embers(x, y, 40, 300);
  }

  /** Every frame a projectile is in flight. */
  trail(p, dt) {
    if (!this.on) return;
    if (p.flairX === undefined) { p.flairX = p.x; p.flairY = p.y; }
    const beam = p.type === 'slug' || p.type === 'knife';
    if (beam) {
      // Lasers, railgun, bolts and wrath draw as a crackling line behind the shot; the big
      // one stays tied to where it was fired from, so it reads as a beam across the page.
      const tail = p.type === 'slug' ? 9999 : this.level === 2 ? 220 : 120;
      const dx = p.x - p.flairX, dy = p.y - p.flairY, len = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, tail / len);
      this.bolt(p.x - dx * k, p.y - dy * k, p.x, p.y, {
        life: 0.07, w: p.type === 'slug' ? (this.level === 2 ? 7 : 4) : 2.4,
        amp: this.level === 2 ? 0.06 : 0.02, branches: this.level === 2 ? 2 : 0,
      });
    }
    if (Math.random() < dt * (this.level === 2 ? 50 : 26)) this.spark(p.x, p.y, 1, 160, 0.3);
    if (this.demon && Math.random() < dt * 30) this.embers(p.x, p.y, 1, 6);
  }

  /** A projectile hits something or runs out. */
  pop(p) {
    if (!this.on) return;
    this.spark(p.x, p.y, this.level === 2 ? 18 : 10, 480);
    this.ring(p.x, p.y, this.level === 2 ? 160 : 90, 0.28, 4);
    if (this.level === 2) this.bolt(p.x + (Math.random() * 2 - 1) * 60, -240, p.x, p.y, { life: 0.3, w: 4, branches: 3 });
  }

  // ── loop ─────────────────────────────────────────────────────────────────
  update(dt) {
    if (!this.on) return;
    this.updateLasers(dt);
    this.flash = Math.max(0, this.flash - dt * 3.2);
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.age += dt;
      if (b.age >= b.life) { this.bolts.splice(i, 1); continue; }
      // Re-roll the path ~30 times a second: that is the crackle.
      b.regen -= dt;
      if (b.regen <= 0 || !b.paths) { b.paths = null; b.regen = 0.033; }
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.age += dt;
      if (s.age >= s.life) { this.sparks.splice(i, 1); continue; }
      if (!s.ember) { s.vy += 900 * dt; s.vx *= Math.pow(0.2, dt); }
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (!s.ember && s.y > GROUND_Y) { s.y = GROUND_Y; s.vy *= -0.4; }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      this.rings[i].age += dt;
      if (this.rings[i].age >= this.rings[i].life) this.rings.splice(i, 1);
    }
  }

  pathsOf(b) {
    if (b.paths) return b.paths;
    const main = jag(b.ax, b.ay, b.bx, b.by, b.amp);
    const out = [main];
    for (let i = 0; i < b.branches; i++) {
      const [sx, sy] = main[1 + ((Math.random() * (main.length - 2)) | 0)];
      const dx = b.bx - b.ax, dy = b.by - b.ay;
      const len = Math.hypot(dx, dy) * (0.12 + Math.random() * 0.22);
      const a = Math.atan2(dy, dx) + (Math.random() * 2 - 1) * 1.1;
      out.push(jag(sx, sy, sx + Math.cos(a) * len, sy + Math.sin(a) * len, 0.22, 3));
    }
    return (b.paths = out);
  }

  draw(ctx) {
    if (!this.on) return;
    const P = this.pal;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const r of this.rings) {
      const u = r.age / r.life;
      ctx.strokeStyle = `rgba(${P.glow},${0.75 * (1 - u)})`;
      ctx.lineWidth = r.w * (1 - u) + 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, 12 + r.r * Math.sqrt(u), 0, 6.283);
      ctx.stroke();
    }
    for (const b of this.bolts) {
      const fade = 1 - b.age / b.life;
      const paths = this.pathsOf(b);
      paths.forEach((pts, k) => {
        const w = b.w * (k ? 0.55 : 1);
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        const glow = b.glow || P.glow;
        ctx.strokeStyle = `rgba(${glow},${0.32 * fade})`;
        ctx.lineWidth = w * 5;
        ctx.stroke();
        ctx.strokeStyle = `rgba(${glow},${0.6 * fade})`;
        ctx.lineWidth = w * 2.2;
        ctx.stroke();
        ctx.globalAlpha = fade;
        ctx.strokeStyle = b.core || P.core;
        ctx.lineWidth = w * 0.7;
        ctx.stroke();
        ctx.globalAlpha = 1;
      });
    }
    for (const s of this.sparks) {
      const u = s.age / s.life;
      ctx.globalAlpha = 1 - u;
      if (s.ember) {
        ctx.fillStyle = `rgba(${P.glow},0.9)`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 3.2 * (1 - u) + 1, 0, 6.283);
        ctx.fill();
      } else {
        ctx.strokeStyle = P.spark;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.vx * 0.03, s.y - s.vy * 0.03);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** Full-screen flash, drawn in screen space after the world. */
  drawScreen(ctx, w, h) {
    if (!this.on || this.flash <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = Math.min(0.45, this.flash);
    ctx.fillStyle = this.pal.flash;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}
