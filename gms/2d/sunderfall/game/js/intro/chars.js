/* Rook and Elderman Vayne, drawn from scratch every frame.
 *
 * They are painted as silhouette + coverage into one canvas and light into a second (additive) one,
 * both mapped to a world rect that tightens around whoever is on screen, so a close-up stays sharp.
 * Cloth is a real verlet chain — Vayne's robe drags when he moves and settles when he doesn't.
 */

import { makeRng, clamp, sat, mix, smoothstep, fbm2 } from './util.js';

const TAU = Math.PI * 2;

/* ── verlet cloth strip ───────────────────────────────────────────────────── */

class Cloth {
  constructor(n, seg, gravity = 900, damp = 0.90) {
    this.n = n; this.seg = seg; this.g = gravity; this.damp = damp;
    this.x = new Float32Array(n); this.y = new Float32Array(n);
    this.px = new Float32Array(n); this.py = new Float32Array(n);
    this.init = false;
  }
  anchor(x, y) {
    if (!this.init) {
      for (let i = 0; i < this.n; i++) { this.x[i] = x; this.y[i] = y + i * this.seg; this.px[i] = this.x[i]; this.py[i] = this.y[i]; }
      this.init = true;
    }
    this.x[0] = x; this.y[0] = y; this.px[0] = x; this.py[0] = y;
  }
  step(dt, windX, windY) {
    const { x, y, px, py, n } = this;
    for (let i = 1; i < n; i++) {
      const vx = (x[i] - px[i]) * this.damp, vy = (y[i] - py[i]) * this.damp;
      px[i] = x[i]; py[i] = y[i];
      x[i] += vx + (windX * (i / n)) * dt * dt * 60;
      y[i] += vy + (this.g + windY) * dt * dt;
    }
    for (let k = 0; k < 3; k++) {
      for (let i = 0; i < n - 1; i++) {
        let dx = x[i + 1] - x[i], dy = y[i + 1] - y[i];
        const d = Math.hypot(dx, dy) || 1e-4;
        const f = (d - this.seg) / d * (i === 0 ? 1 : 0.5);
        dx *= f; dy *= f;
        if (i > 0) { x[i] += dx * 0.5; y[i] += dy * 0.5; x[i + 1] -= dx * 0.5; y[i + 1] -= dy * 0.5; }
        else { x[i + 1] -= dx; y[i + 1] -= dy; }
      }
    }
  }
}

/* ── drawing helpers (canvas units) ───────────────────────────────────────── */

const grey = (v, a = 1) => `rgba(${(v * 255) | 0},${(v * 255) | 0},${(v * 255) | 0},${a})`;

function taper(g, x0, y0, x1, y1, w0, w1) {
  const a = Math.atan2(y1 - y0, x1 - x0) + Math.PI / 2;
  const cx = Math.cos(a), sy = Math.sin(a);
  g.beginPath();
  g.moveTo(x0 + cx * w0 / 2, y0 + sy * w0 / 2);
  g.lineTo(x1 + cx * w1 / 2, y1 + sy * w1 / 2);
  g.lineTo(x1 - cx * w1 / 2, y1 - sy * w1 / 2);
  g.lineTo(x0 - cx * w0 / 2, y0 - sy * w0 / 2);
  g.closePath();
  g.fill();
  // round the joint
  g.beginPath(); g.arc(x1, y1, w1 / 2, 0, TAU); g.fill();
  g.beginPath(); g.arc(x0, y0, w0 / 2, 0, TAU); g.fill();
}

function limbTo(x, y, a, l) { return [x + Math.cos(a) * l, y + Math.sin(a) * l]; }

/* A dark ellipse painted into the character sheet, under the feet. The sheet composites with
 * straight alpha over the ground, so a value-0 shape at partial alpha reads as a cast shadow —
 * without it the figures hover, which was the loudest note on both of them. */
function contactShadow(g, x, y, w, strength = 1) {
  const grd = g.createRadialGradient(x, y, 0, x, y, w);
  grd.addColorStop(0, `rgba(0,0,0,${0.62 * strength})`);
  grd.addColorStop(0.45, `rgba(0,0,0,${0.34 * strength})`);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.save();
  g.translate(x, y); g.scale(1, 0.30); g.translate(-x, -y);
  g.fillStyle = grd;
  g.beginPath(); g.arc(x, y, w, 0, TAU); g.fill();
  g.restore();
}

/* Punch a slot of negative space out of the silhouette. One gap between the near arm and the
 * torso is the difference between "a person" and "a lump" at 25% size. */
function negativeGap(g, x0, y0, x1, y1, w) {
  g.save();
  g.globalCompositeOperation = 'destination-out';
  g.strokeStyle = 'rgba(0,0,0,1)';
  g.lineWidth = w;
  g.lineCap = 'round';
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  g.restore();
}

/* ── Rook ─────────────────────────────────────────────────────────────────── */

export class Rook {
  constructor() {
    this.x = 0; this.y = 0;            // world, feet on the ground
    this.h = 196;                       // world px, head to heel
    this.face = 1;                      // +1 looking right
    this.phase = 0;
    this.speed = 0;                     // world px/s, drives the walk cycle
    this.slouch = 1;                    // 0 straight, 1 maximum teenager
    this.armPose = 'sulk';              // sulk | walk | shield | reach | reel
    this.glow = 0;                      // chest lifestone 0..1
    this.veins = 0;                     // 0..1 reveal along the vein tree
    this.lift = 0;                      // lifted off the ground during the meld
    this.headTurn = 0;
    this.cloak = new Cloth(6, 1, 600, 0.86);
    this.veinTree = null;
    this._t = 0;
  }

  update(dt) {
    this._t += dt;
    this.phase += dt * (this.speed / (this.h * 0.36)) * 2.2;
    const s = this.h / 196;
    this.cloak.seg = 12 * s;
    this.cloak.anchor(this.x - this.face * 6 * s, this.y - this.h * 0.70);
    this.cloak.step(dt, -this.face * this.speed * 0.9 + Math.sin(this._t * 1.7) * 40, 0);
  }

  bounds() { const p = this.h * 0.75; return [this.x - p, this.y - this.h - p * 0.5, this.x + p, this.y + p * 0.25]; }

  draw(g, em, t) {
    const s = this.h / 196;
    const f = this.face;
    const walk = clamp(this.speed / 220, 0, 1);
    const ph = this.phase;
    const bob = Math.sin(ph * 2) * 3.2 * s * walk;
    const y0 = this.y - this.lift;
    const hipY = y0 - this.h * 0.50 + bob;
    const hipX = this.x + Math.sin(ph) * 1.5 * s * walk;
    const lean = (this.slouch * 0.13 + walk * 0.10) * f;

    const chestY = hipY - this.h * 0.235;
    const chestX = hipX + lean * this.h * 0.16;
    const neckY = chestY - this.h * 0.085;
    const neckX = chestX + lean * this.h * 0.07;
    const headR = this.h * 0.072;
    const headY = neckY - headR * 1.05 + this.slouch * this.h * 0.012;
    const headX = neckX + lean * this.h * 0.05 + this.headTurn * headR * 0.35;

    // Value spread across the parts, not one flat fill: far limbs sink, the head sits highest.
    // The shader multiplies this, so a single value makes an orange cut-out however good the rim.
    const V = 0.22;
    g.fillStyle = grey(V, 1);

    // ── contact shadow first, so everything else sits on top of it
    contactShadow(g, this.x, this.y + 2 * s, this.h * 0.30, 1 - clamp(this.lift / (this.h * 0.3), 0, 0.9));

    // ── legs
    const legL = this.h * 0.25;
    let frontFoot = null;
    for (const side of [-1, 1]) {
      const sw = Math.sin(ph + (side > 0 ? 0 : Math.PI)) * walk;
      const kneeA = Math.PI / 2 - sw * 0.55 * f;
      const [kx, ky] = limbTo(hipX + side * 6 * s, hipY, kneeA, legL);
      const shin = Math.PI / 2 - Math.min(0, sw) * 0.75 * f + Math.abs(sw) * 0.18;
      const [ax, ay] = limbTo(kx, ky, shin, legL);
      const dark = side < 0 ? V * 0.42 : V * 0.92;
      g.fillStyle = grey(dark, 1);
      taper(g, hipX + side * 6 * s, hipY, kx, ky, 15 * s, 11 * s);
      taper(g, kx, ky, ax, ay, 11 * s, 8 * s);
      // boot with a defined heel and toe rather than a lozenge
      g.beginPath();
      g.moveTo(ax - 6 * f * s, ay - 5 * s);
      g.lineTo(ax + f * 15 * s, ay - 1 * s);
      g.quadraticCurveTo(ax + f * 18 * s, ay + 5 * s, ax + f * 12 * s, ay + 6 * s);
      g.lineTo(ax - f * 8 * s, ay + 6 * s);
      g.quadraticCurveTo(ax - f * 10 * s, ay + 1 * s, ax - 6 * f * s, ay - 5 * s);
      g.closePath(); g.fill();
      if (side > 0) frontFoot = [ax, ay];
    }

    // ── cloak / travelling wrap behind the torso
    g.fillStyle = grey(V * 0.50, 1);
    const cl = this.cloak;
    g.beginPath();
    g.moveTo(chestX - f * 13 * s, chestY - this.h * 0.03);
    for (let i = 0; i < cl.n; i++) g.lineTo(cl.x[i] - f * (14 - i) * s, cl.y[i]);
    for (let i = cl.n - 1; i >= 0; i--) g.lineTo(cl.x[i] + f * (5 + i * 1.4) * s, cl.y[i] + 3 * s);
    g.lineTo(chestX + f * 8 * s, chestY - this.h * 0.02);
    g.closePath(); g.fill();

    // ── torso: narrow, hunched, a tunic that flares
    g.fillStyle = grey(V, 1);
    g.beginPath();
    g.moveTo(neckX - 15 * s, neckY + 2 * s);
    g.quadraticCurveTo(chestX - 22 * s, chestY + this.h * 0.02, hipX - 17 * s, hipY + 8 * s);
    g.quadraticCurveTo(hipX, hipY + 15 * s, hipX + 17 * s, hipY + 8 * s);
    g.quadraticCurveTo(chestX + 22 * s, chestY + this.h * 0.02, neckX + 15 * s, neckY + 2 * s);
    g.quadraticCurveTo(neckX, neckY - 5 * s, neckX - 15 * s, neckY + 2 * s);
    g.closePath(); g.fill();
    // belt
    g.fillStyle = grey(V * 0.6, 1);
    g.fillRect(hipX - 18 * s, hipY - 4 * s, 36 * s, 7 * s);

    // ── arms
    const shY = neckY + 6 * s, shX = neckX;
    const upper = this.h * 0.145, fore = this.h * 0.145;
    const armAngles = () => {
      switch (this.armPose) {
        case 'walk': return [
          [Math.PI / 2 + Math.sin(ph) * 0.7 * f * walk + f * 0.15, Math.PI / 2 + 0.5 + Math.sin(ph) * 0.3],
          [Math.PI / 2 - Math.sin(ph) * 0.7 * f * walk + f * 0.15, Math.PI / 2 + 0.5 - Math.sin(ph) * 0.3]];
        case 'shield': return [[Math.PI / 2 - f * 1.15, -f * 0.15], [Math.PI / 2 - f * 0.95, -f * 0.35]];
        case 'reach': return [[Math.PI / 2 - f * 0.85, Math.PI / 2 - f * 1.25], [Math.PI / 2 + f * 0.25, Math.PI / 2 + f * 0.1]];
        case 'reel': return [[Math.PI / 2 - f * 1.55, -Math.PI / 2 - f * 0.4], [Math.PI / 2 + f * 1.5, -Math.PI / 2 + f * 0.5]];
        default: return [[Math.PI / 2 + f * 0.30, Math.PI / 2 - f * 0.62], [Math.PI / 2 + f * 0.22, Math.PI / 2 - f * 0.70]];
      }
    };
    const [back, front] = armAngles();
    const breathe = Math.sin(t * 1.6) * 0.03;
    const arm = (a0, a1, dark, dx) => {
      const [ex, ey] = limbTo(shX + dx, shY, a0 + breathe, upper);
      const [hx, hy] = limbTo(ex, ey, a1 + breathe, fore);
      g.fillStyle = grey(dark, 1);
      taper(g, shX + dx, shY, ex, ey, 13 * s, 9.5 * s);
      taper(g, ex, ey, hx, hy, 9.5 * s, 7 * s);
      // a hand with a mass and a thumb, not a dot
      g.save();
      g.translate(hx, hy); g.rotate(a1 + breathe);
      g.beginPath();
      g.moveTo(-2 * s, -4.5 * s);
      g.quadraticCurveTo(9 * s, -5.5 * s, 9.5 * s, 0);
      g.quadraticCurveTo(9 * s, 5 * s, -2 * s, 4.5 * s);
      g.closePath(); g.fill();
      g.beginPath(); g.ellipse(2 * s, -5.2 * s, 4 * s, 2.2 * s, -0.5, 0, TAU); g.fill();
      g.restore();
      return [hx, hy, ex, ey];
    };
    arm(back[0], back[1], V * 0.40, -f * 5 * s);
    const [handX, handY, elbX, elbY] = arm(front[0], front[1], V * 1.05, f * 5 * s);
    // the one gap that makes him read: daylight between the near arm and the torso
    negativeGap(g, shX + f * 5 * s + (elbX - shX) * 0.30, shY + (elbY - shY) * 0.30,
      elbX - (elbX - shX) * 0.12, elbY - (elbY - shY) * 0.12, 3.2 * s);

    // ── head: one solid mass — jaw, nose, and hair read as a shape, not a spray of spikes
    g.fillStyle = grey(V * 1.15, 1);
    g.beginPath();
    g.ellipse(headX, headY, headR * 0.92, headR * 1.06, lean * 0.5, 0, TAU);
    g.fill();
    g.beginPath();  // jaw / chin
    g.moveTo(headX - f * headR * 0.1, headY + headR * 0.35);
    g.quadraticCurveTo(headX + f * headR * 1.05, headY + headR * 0.55, headX + f * headR * 0.15, headY + headR * 1.02);
    g.quadraticCurveTo(headX - f * headR * 0.55, headY + headR * 0.9, headX - f * headR * 0.1, headY + headR * 0.35);
    g.closePath(); g.fill();
    g.beginPath();  // nose
    g.moveTo(headX + f * headR * 0.75, headY + headR * 0.05);
    g.lineTo(headX + f * headR * 1.18, headY + headR * 0.32);
    g.lineTo(headX + f * headR * 0.7, headY + headR * 0.40);
    g.closePath(); g.fill();
    // hair: a single capping mass with six chunky locks, drawn from one path so it cannot
    // dissolve into a particle cloud at silhouette size
    g.fillStyle = grey(V * 0.85, 1);
    const hr = makeRng(4242);
    g.beginPath();
    g.moveTo(headX - f * headR * 1.02, headY + headR * 0.25);
    g.quadraticCurveTo(headX - f * headR * 1.15, headY - headR * 1.15, headX + f * headR * 0.25, headY - headR * 1.22);
    g.quadraticCurveTo(headX + f * headR * 1.18, headY - headR * 1.0, headX + f * headR * 1.02, headY - headR * 0.12);
    g.lineTo(headX + f * headR * 0.55, headY - headR * 0.30);
    g.quadraticCurveTo(headX, headY - headR * 0.85, headX - f * headR * 0.75, headY - headR * 0.20);
    g.closePath(); g.fill();
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI * (0.16 + 0.72 * (i / 5)) + (hr() - 0.5) * 0.14;
      const l = headR * (0.75 + hr() * 0.85);
      const bx = headX + Math.cos(a) * headR * 0.80;
      const by = headY + Math.sin(a) * headR * 0.86;
      const wdt = headR * (0.20 + hr() * 0.16);
      g.beginPath();
      g.moveTo(bx - Math.sin(a) * wdt, by + Math.cos(a) * wdt);
      g.lineTo(bx + Math.cos(a - 0.42 * f) * l - f * l * 0.28, by + Math.sin(a) * l * 0.95);
      g.lineTo(bx + Math.sin(a) * wdt, by - Math.cos(a) * wdt);
      g.closePath(); g.fill();
    }

    // ── the lifestone, once it is in him
    if (this.glow > 0.001) {
      const gx = chestX + f * 4 * s, gy = chestY + this.h * 0.02;
      const k = this.glow;
      const rad = this.h * (0.05 + 0.16 * k);
      const grd = em.createRadialGradient(gx, gy, 0, gx, gy, rad);
      grd.addColorStop(0, `rgba(255,255,255,${0.95 * k})`);
      grd.addColorStop(0.20, `rgba(255,222,150,${0.85 * k})`);
      grd.addColorStop(0.55, `rgba(255,120,40,${0.35 * k})`);
      grd.addColorStop(1, 'rgba(255,80,20,0)');
      em.fillStyle = grd;
      em.beginPath(); em.arc(gx, gy, rad, 0, TAU); em.fill();
      // and it lights him from inside — punch warm value back into the silhouette
      g.save();
      g.globalCompositeOperation = 'source-atop';
      const ig = g.createRadialGradient(gx, gy, 0, gx, gy, this.h * 0.30);
      ig.addColorStop(0, `rgba(255,255,255,${0.55 * k})`);
      ig.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = ig; g.fillRect(gx - this.h * 0.4, gy - this.h * 0.4, this.h * 0.8, this.h * 0.8);
      g.restore();
    }

    if (this.veins > 0.001) this._drawVeins(em, chestX + f * 4 * s, chestY + this.h * 0.02, s);
    return { chestX: chestX + f * 4 * s, chestY: chestY + this.h * 0.02, headX, headY, handX, handY, s };
  }

  buildVeins(seed = 8) {
    const rng = makeRng(seed);
    const segs = [];
    const grow = (x, y, a, len, w, depth, t0) => {
      if (depth <= 0 || len < 3) return;
      const steps = 4;
      let px = x, py = y, pa = a, tt = t0;
      for (let i = 0; i < steps; i++) {
        pa += (rng() - 0.5) * 0.9;
        const nx = px + Math.cos(pa) * (len / steps), ny = py + Math.sin(pa) * (len / steps);
        segs.push([px, py, nx, ny, w * (1 - i / steps * 0.4), tt]);
        px = nx; py = ny; tt += 1 / steps;
      }
      const n = rng() < 0.65 ? 2 : 3;
      for (let i = 0; i < n; i++) grow(px, py, pa + (i - (n - 1) / 2) * 0.85 + (rng() - 0.5) * 0.4, len * (0.6 + rng() * 0.25), w * 0.62, depth - 1, tt);
    };
    for (let i = 0; i < 7; i++) grow(0, 0, (i / 7) * TAU + rng() * 0.6, 26 + rng() * 14, 3.2, 4, 0);
    let maxT = 0; for (const s of segs) maxT = Math.max(maxT, s[5]);
    this.veinTree = { segs, maxT };
  }

  _drawVeins(em, cx, cy, s) {
    if (!this.veinTree) this.buildVeins();
    const { segs, maxT } = this.veinTree;
    const front = this.veins * (maxT + 1.2);
    em.save();
    em.translate(cx, cy);
    em.scale(s * (this.h / 196) * 1.35, s * (this.h / 196) * 1.35);
    em.lineCap = 'round';
    for (const [x0, y0, x1, y1, w, t0] of segs) {
      const k = sat(front - t0);
      if (k <= 0) continue;
      const a = k * sat(1.35 - (front - t0) * 0.30);
      em.strokeStyle = `rgba(255,${(150 + 90 * a) | 0},${(60 + 90 * a) | 0},${0.9 * a})`;
      em.lineWidth = w * (0.5 + k * 0.8);
      em.beginPath();
      em.moveTo(x0, y0);
      em.lineTo(x0 + (x1 - x0) * Math.min(1, k * 1.6), y0 + (y1 - y0) * Math.min(1, k * 1.6));
      em.stroke();
    }
    em.restore();
  }
}

/* ── Elderman Vayne ───────────────────────────────────────────────────────── */

export class Vayne {
  constructor() {
    this.x = 0; this.y = 0;
    this.h = 210;
    this.face = -1;
    this.slump = 0.75;      // 0 = upright, 1 = on the ground
    this.armPose = 'rest';  // rest | beckon | press | fall
    this.armT = 0;
    this.breath = 1;        // amplitude of the breathing; goes to 0 when he dies
    this.stone = 0;         // lifestone brightness in his hand
    this.staffGlow = 0.5;
    this.robe = new Cloth(7, 1, 480, 0.90);
    this.beard = new Cloth(5, 1, 380, 0.84);
    this._t = 0;
  }

  update(dt) {
    this._t += dt;
    const s = this.h / 210;
    this.robe.seg = 13 * s; this.beard.seg = 7 * s;
    const p = this._joints();
    this.robe.anchor(p.hipX, p.hipY);
    this.beard.anchor(p.headX + this.face * p.headR * 0.35, p.headY + p.headR * 0.75);
    const w = Math.sin(this._t * 0.7) * 26 + Math.sin(this._t * 1.9) * 12;
    this.robe.step(dt, w, 0);
    this.beard.step(dt, w * 0.5, 0);
  }

  bounds() { const p = this.h * 0.8; return [this.x - p, this.y - this.h * 0.9 - p * 0.3, this.x + p, this.y + p * 0.2]; }

  _joints() {
    const s = this.h / 210, f = this.face;
    const sl = this.slump;
    const br = Math.sin(this._t * 1.15) * this.breath;
    const hipY = this.y - this.h * (0.30 - sl * 0.16);
    const hipX = this.x - f * this.h * 0.02 * sl;
    const chestY = hipY - this.h * (0.235 - sl * 0.08) + br * 1.5 * s;
    const chestX = hipX + f * this.h * (0.05 + sl * 0.16);
    const neckY = chestY - this.h * 0.085;
    const neckX = chestX + f * this.h * (0.03 + sl * 0.05);
    const headR = this.h * 0.070;
    const headY = neckY - headR * 0.95 + sl * this.h * 0.03;
    const headX = neckX + f * this.h * (0.02 + sl * 0.045);
    return { s, f, hipX, hipY, chestX, chestY, neckX, neckY, headX, headY, headR, br };
  }

  draw(g, em, t) {
    const p = this._joints();
    const { s, f } = p;
    const V = 0.24;

    contactShadow(g, this.x, this.y + 2 * s, this.h * 0.34);

    // The propping arm is solved before anything is drawn, so the staff can be planted through his
    // hand instead of floating behind him with nothing holding it.
    const shX0 = p.neckX, shY0 = p.neckY + 7 * s;
    const upper0 = this.h * 0.14, fore0 = this.h * 0.14;
    const [px2, py2] = limbTo(shX0 - f * 6 * s, shY0, Math.PI / 2 - f * 0.55, upper0);
    const [px3, py3] = limbTo(px2, py2, Math.PI / 2 - f * 0.1, fore0);

    // ── staff, driven into the ground and running through that hand
    const stB = this.y + this.h * 0.02;
    const stX = px3 + f * this.h * 0.10;
    const stT = stB - this.h * 0.86;
    g.fillStyle = grey(V * 0.75, 1);
    taper(g, stX, stB, stX - f * this.h * 0.05, stT, 5.5 * s, 4.5 * s);
    if (this.staffGlow > 0) {
      const cx = stX - f * this.h * 0.05, cy = stT;
      const k = this.staffGlow * (0.75 + 0.25 * Math.sin(t * 3.1) * Math.sin(t * 1.3));
      // a shard, not a lollipop
      em.save();
      em.translate(cx, cy);
      em.rotate(Math.sin(t * 0.7) * 0.12);
      const grd = em.createRadialGradient(0, 0, 0, 0, 0, this.h * 0.10 * (0.6 + k));
      grd.addColorStop(0, `rgba(255,244,214,${0.85 * k})`);
      grd.addColorStop(0.28, `rgba(255,170,72,${0.42 * k})`);
      grd.addColorStop(1, 'rgba(255,110,30,0)');
      em.fillStyle = grd;
      em.beginPath(); em.arc(0, 0, this.h * 0.11, 0, TAU); em.fill();
      em.fillStyle = `rgba(255,250,235,${Math.min(1, 0.95 * k)})`;
      em.beginPath();
      em.moveTo(0, -this.h * 0.042);
      em.lineTo(this.h * 0.013, 0);
      em.lineTo(0, this.h * 0.030);
      em.lineTo(-this.h * 0.013, 0);
      em.closePath(); em.fill();
      em.restore();
      g.fillStyle = grey(V * 0.9, 1);
      g.beginPath();
      g.moveTo(cx, cy - this.h * 0.048);
      g.lineTo(cx + this.h * 0.020, cy);
      g.lineTo(cx, cy + this.h * 0.036);
      g.lineTo(cx - this.h * 0.020, cy);
      g.closePath(); g.fill();
    }

    // ── robe: a heavy skirt from the hip, cloth-driven
    const rb = this.robe;
    g.fillStyle = grey(V * 0.60, 1);
    g.beginPath();
    g.moveTo(p.chestX - this.h * 0.075, p.chestY);
    for (let i = 0; i < rb.n; i++) g.lineTo(rb.x[i] - this.h * (0.075 + 0.030 * i / rb.n) * (1 + i * 0.55), rb.y[i]);
    for (let i = rb.n - 1; i >= 0; i--) g.lineTo(rb.x[i] + this.h * (0.075 + 0.030 * i / rb.n) * (1 + i * 0.42), rb.y[i] + 2 * s);
    g.lineTo(p.chestX + this.h * 0.075, p.chestY);
    g.closePath(); g.fill();
    // fold shadows
    g.save(); g.globalCompositeOperation = 'source-atop';
    g.strokeStyle = grey(0, 0.35); g.lineWidth = 3 * s;
    for (let k = -2; k <= 2; k++) {
      g.beginPath();
      for (let i = 0; i < rb.n; i++) {
        const x = rb.x[i] + k * this.h * 0.035 * (1 + i * 0.35), y = rb.y[i];
        i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke();
    }
    g.restore();

    // ── torso
    g.fillStyle = grey(V, 1);
    g.beginPath();
    g.moveTo(p.neckX - 17 * s, p.neckY);
    g.quadraticCurveTo(p.chestX - 26 * s, p.chestY + this.h * 0.03, p.hipX - 22 * s, p.hipY);
    g.lineTo(p.hipX + 22 * s, p.hipY);
    g.quadraticCurveTo(p.chestX + 26 * s, p.chestY + this.h * 0.03, p.neckX + 17 * s, p.neckY);
    g.closePath(); g.fill();

    // ── arms
    const shX = shX0, shY = shY0;
    const upper = upper0, fore = fore0;
    let a0, a1;
    const wob = Math.sin(this._t * 5.3) * 0.05 + Math.sin(this._t * 2.1) * 0.04;   // the tremble of a dying man
    switch (this.armPose) {
      case 'beckon': a0 = Math.PI / 2 + f * 1.35; a1 = Math.PI / 2 + f * (1.9 + Math.sin(this._t * 3.4) * 0.35); break;
      case 'press':  a0 = Math.PI / 2 + f * 1.55; a1 = Math.PI / 2 + f * 1.55; break;
      case 'fall':   a0 = Math.PI / 2 + f * 0.15; a1 = Math.PI / 2 + f * 0.05; break;
      default:       a0 = Math.PI / 2 + f * 0.55; a1 = Math.PI / 2 + f * 0.95; break;
    }
    a0 += wob; a1 += wob * 1.6;
    // the far arm props him up (solved above, so the staff could be planted through its hand)
    g.fillStyle = grey(V * 0.42, 1);
    taper(g, shX - f * 6 * s, shY, px2, py2, 15 * s, 11 * s);
    taper(g, px2, py2, px3, py3, 11 * s, 8 * s);
    // the grip: a knuckle mass closed round the shaft
    g.beginPath(); g.ellipse(px3, py3, 8 * s, 6 * s, 0.3, 0, TAU); g.fill();
    g.fillStyle = grey(V * 0.62, 1);
    g.beginPath(); g.ellipse(px3 + f * 4 * s, py3 - 2 * s, 5 * s, 3.4 * s, -0.35, 0, TAU); g.fill();

    const [ex, ey] = limbTo(shX + f * 6 * s, shY, a0, upper);
    const [hx, hy] = limbTo(ex, ey, a1, fore);
    g.fillStyle = grey(V * 1.05, 1);
    taper(g, shX + f * 6 * s, shY, ex, ey, 15 * s, 11 * s);
    taper(g, ex, ey, hx, hy, 11 * s, 7.5 * s);
    // hand: a palm mass, then long fingers off it
    g.beginPath(); g.ellipse(hx, hy, 7.5 * s, 5.5 * s, a1, 0, TAU); g.fill();
    for (let i = 0; i < 4; i++) {
      const fa = a1 + (i - 1.5) * 0.34;
      const [fx2, fy2] = limbTo(hx, hy, fa, this.h * 0.036);
      taper(g, hx, hy, fx2, fy2, 4.2 * s, 2.2 * s);
    }
    // negative space between the raised arm and the chest
    negativeGap(g, shX + f * 6 * s + (ex - shX) * 0.34, shY + (ey - shY) * 0.34,
      ex - (ex - shX) * 0.14, ey - (ey - shY) * 0.14, 3.4 * s);

    // ── head, hood and beard
    g.fillStyle = grey(V * 1.15, 1);
    g.beginPath(); g.ellipse(p.headX, p.headY, p.headR * 0.95, p.headR * 1.05, 0, 0, TAU); g.fill();
    // nose / brow
    g.beginPath();
    g.moveTo(p.headX + f * p.headR * 0.6, p.headY - p.headR * 0.1);
    g.lineTo(p.headX + f * p.headR * 1.25, p.headY + p.headR * 0.3);
    g.lineTo(p.headX + f * p.headR * 0.55, p.headY + p.headR * 0.45);
    g.closePath(); g.fill();
    // hood, collapsed back off the head
    g.fillStyle = grey(V * 0.68, 1);
    g.beginPath();
    g.moveTo(p.headX - f * p.headR * 1.0, p.headY - p.headR * 0.5);
    g.quadraticCurveTo(p.headX - f * p.headR * 2.6, p.headY - p.headR * 1.3, p.headX - f * p.headR * 2.9, p.headY + p.headR * 1.4);
    g.quadraticCurveTo(p.headX - f * p.headR * 1.4, p.headY + p.headR * 1.7, p.headX - f * p.headR * 0.2, p.headY + p.headR * 1.0);
    g.closePath(); g.fill();
    // beard, cloth-driven
    const bd = this.beard;
    g.fillStyle = grey(V * 1.75, 1);
    g.beginPath();
    g.moveTo(p.headX - p.headR * 0.55, p.headY + p.headR * 0.35);
    for (let i = 0; i < bd.n; i++) g.lineTo(bd.x[i] - p.headR * (0.55 - i * 0.09), bd.y[i]);
    for (let i = bd.n - 1; i >= 0; i--) g.lineTo(bd.x[i] + p.headR * (0.55 - i * 0.07), bd.y[i]);
    g.lineTo(p.headX + p.headR * 0.55, p.headY + p.headR * 0.35);
    g.closePath(); g.fill();
    // hair
    g.fillStyle = grey(V * 1.55, 1);
    const hr = makeRng(77);
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI * (0.15 + 0.7 * (i / 8)) + (hr() - 0.5) * 0.2;
      const l = p.headR * (0.7 + hr() * 0.9);
      const bx = p.headX + Math.cos(a) * p.headR * 0.85;
      const by = p.headY + Math.sin(a) * p.headR * 0.9;
      g.beginPath();
      g.moveTo(bx, by);
      g.lineTo(bx + Math.cos(a) * l - f * l * 0.6, by + Math.sin(a) * l * 0.5 + l * 0.5);
      g.lineTo(bx + Math.cos(a) * p.headR * 0.3, by + Math.sin(a) * p.headR * 0.3);
      g.closePath(); g.fill();
    }

    // ── the lifestone in his hand
    if (this.stone > 0.001) {
      const k = this.stone;
      const rad = this.h * (0.03 + 0.10 * k);
      const grd = em.createRadialGradient(hx, hy, 0, hx, hy, rad * 2.4);
      grd.addColorStop(0, `rgba(255,255,255,${0.98 * k})`);
      grd.addColorStop(0.16, `rgba(255,235,180,${0.9 * k})`);
      grd.addColorStop(0.45, `rgba(255,140,50,${0.4 * k})`);
      grd.addColorStop(1, 'rgba(255,90,20,0)');
      em.fillStyle = grd;
      em.beginPath(); em.arc(hx, hy, rad * 2.4, 0, TAU); em.fill();
    }

    return { headX: p.headX, headY: p.headY, handX: hx, handY: hy, chestX: p.chestX, chestY: p.chestY, staffX: stX - f * this.h * 0.05, staffY: stT, s };
  }
}
