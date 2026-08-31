// Draws a fighter from its live ragdoll points. Nothing here reads the pose — a limp
// body and an animated one go through exactly the same code.

import { P, BONE } from './ragdoll.js';
import { stroke, circle, line, splat, rnd, INK } from './ink.js';

const ENEMY_INK = '#2c2f38';
const FAR = 0.52;          // far-side limbs are lighter, which reads as depth

function limb(ctx, r, a, b, c, o) {
  stroke(ctx, [[r.x[a], r.y[a]], [r.x[b], r.y[b]], [r.x[c], r.y[c]]], o);
}

/** Smear trail behind a fast-moving hand or foot. */
function smear(ctx, r, i, col, seed) {
  const vx = r.x[i] - r.px[i], vy = r.y[i] - r.py[i];
  const sp = Math.hypot(vx, vy);
  if (sp < 7) return;
  const n = Math.min(4, Math.floor(sp / 6));
  for (let k = 1; k <= n; k++) {
    const t = k / (n + 1);
    stroke(ctx, [[r.x[i] - vx * t * 2.4, r.y[i] - vy * t * 2.4],
                 [r.x[i] - vx * (t + 0.28) * 2.4, r.y[i] - vy * (t + 0.28) * 2.4]],
      { w: 2.4 * (1 - t), passes: 1, wob: 0.6, seed: seed + k * 31, col, a: 0.30 * (1 - t) });
  }
}

function bandana(ctx, r, f, seed, sc) {
  const hx = r.x[P.HEAD], hy = r.y[P.HEAD];
  const rad = BONE.headR * sc;
  let ux = hx - r.x[P.NECK], uy = hy - r.y[P.NECK];
  const ul = Math.hypot(ux, uy) || 1;
  ux /= ul; uy /= ul;
  const theta = Math.atan2(uy, ux);
  const d = 0.16;
  const phi = Math.acos(d);

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.beginPath();
  ctx.arc(hx, hy, rad * 1.02, theta - phi, theta + phi);
  ctx.closePath();
  ctx.fillStyle = f.rank.col;
  ctx.fill();
  ctx.restore();

  // The outline is what makes a white bandana legible on cream paper.
  const cx0 = hx + Math.cos(theta - phi) * rad, cy0 = hy + Math.sin(theta - phi) * rad;
  const cx1 = hx + Math.cos(theta + phi) * rad, cy1 = hy + Math.sin(theta + phi) * rad;
  stroke(ctx, [[cx0, cy0], [cx1, cy1]], { w: 2.6 * sc, passes: 1, wob: 0.7, seed: seed + 5, col: f.rank.edge, a: 0.95 });
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const a = theta - phi + (phi * 2) * (i / 10);
    pts.push([hx + Math.cos(a) * rad, hy + Math.sin(a) * rad]);
  }
  stroke(ctx, pts, { w: 2.4 * sc, passes: 1, wob: 0.6, seed: seed + 6, col: f.rank.edge, a: 0.9, step: 6 });

  // Knot and tails on the trailing side.
  const back = -f.facing;
  const kx = cx0 * (back > 0 ? 0 : 1) + cx1 * (back > 0 ? 1 : 0);
  const ky = cy0 * (back > 0 ? 0 : 1) + cy1 * (back > 0 ? 1 : 0);
  const wave = f.tailPhase || 0;
  for (let k = 0; k < 2; k++) {
    const sgn = k ? 1 : -1;
    const t1 = [kx + back * 9 * sc, ky + sgn * 3 * sc + Math.sin(wave + k) * 3];
    const t2 = [kx + back * 20 * sc, ky + sgn * 8 * sc + Math.sin(wave * 1.4 + k * 2) * 6];
    stroke(ctx, [[kx, ky], t1, t2], { w: 2.2 * sc, passes: 1, wob: 0.9, seed: seed + 9 + k, col: f.rank.edge, a: 0.85, step: 6 });
    stroke(ctx, [[kx, ky], t1, t2], { w: 1.4 * sc, passes: 1, wob: 0.9, seed: seed + 9 + k, col: f.rank.col, a: 0.9, step: 6 });
  }
}

function face(ctx, r, f, sc, col) {
  const hx = r.x[P.HEAD], hy = r.y[P.HEAD];
  let ux = hx - r.x[P.NECK], uy = hy - r.y[P.NECK];
  const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
  const rx = -uy * f.facing, ry = ux * f.facing;       // "right" in head space
  const ex = hx + rx * 4.4 * sc + ux * 2.5 * sc;
  const ey = hy + ry * 4.4 * sc + uy * 2.5 * sc;
  ctx.save();
  ctx.strokeStyle = col; ctx.fillStyle = col;
  ctx.lineWidth = 1.9 * sc; ctx.lineCap = 'round';
  if (f.dead) {
    for (const s of [-1, 1]) {
      const px = hx + rx * (2.0 + s * 2.6) * sc + ux * 2.0 * sc;
      const py = hy + ry * (2.0 + s * 2.6) * sc + uy * 2.0 * sc;
      const q = 2.3 * sc;
      ctx.beginPath();
      ctx.moveTo(px - q, py - q); ctx.lineTo(px + q, py + q);
      ctx.moveTo(px + q, py - q); ctx.lineTo(px - q, py + q);
      ctx.stroke();
    }
  } else {
    const squint = f.hitFlash > 0 ? 0.35 : 1;
    for (const s of [-1, 1]) {
      const px = hx + rx * (1.4 + s * 3.0) * sc + ux * 1.6 * sc;
      const py = hy + ry * (1.4 + s * 3.0) * sc + uy * 1.6 * sc;
      ctx.beginPath();
      ctx.ellipse(px, py, 1.5 * sc, 1.5 * sc * squint, Math.atan2(ry, rx), 0, 6.283);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function drawFighter(ctx, f, t = 0) {
  const r = f.rag, sc = f.scale;
  const col = f.isPlayer ? INK : ENEMY_INK;
  const seed = f.seed + Math.floor(t * 11) * 977;    // boil: re-jitter ~11 times a second
  const w = 4.6 * sc;
  const hurt = f.hitFlash > 0;

  ctx.save();
  ctx.globalCompositeOperation = 'multiply';

  const farO = { w: w * 0.86, passes: 2, wob: 1.0, seed, col, a: FAR };
  limb(ctx, r, P.NECK, P.ELBOW_L, P.HAND_L, farO);
  limb(ctx, r, P.PELVIS, P.KNEE_L, P.FOOT_L, { ...farO, seed: seed + 111 });

  stroke(ctx, [[r.x[P.PELVIS], r.y[P.PELVIS]], [r.x[P.NECK], r.y[P.NECK]]],
    { w: w * 1.12, passes: 2, wob: 0.9, seed: seed + 222, col, a: 1 });

  limb(ctx, r, P.PELVIS, P.KNEE_R, P.FOOT_R, { w, passes: 2, wob: 1.0, seed: seed + 333, col, a: 1 });
  smear(ctx, r, P.FOOT_R, col, seed + 400);
  limb(ctx, r, P.NECK, P.ELBOW_R, P.HAND_R, { w, passes: 2, wob: 1.0, seed: seed + 444, col, a: 1 });
  smear(ctx, r, P.HAND_R, col, seed + 500);

  circle(ctx, r.x[P.HEAD], r.y[P.HEAD], BONE.headR * sc, { w: w * 0.95, passes: 2, wob: 0.9, seed: seed + 555, col, a: 1 });

  // Damage reads as the drawing being scribbled over.
  const dmg = 1 - f.hp / f.maxHp;
  if (dmg > 0.25) {
    const marks = Math.floor(dmg * 5);
    for (let i = 0; i < marks; i++) {
      const j = [P.PELVIS, P.NECK, P.ELBOW_R, P.KNEE_L, P.HEAD][i % 5];
      stroke(ctx, [
        [r.x[j] - 8 * sc, r.y[j] - 5 * sc], [r.x[j] + 7 * sc, r.y[j] + 4 * sc],
        [r.x[j] - 6 * sc, r.y[j] + 5 * sc], [r.x[j] + 8 * sc, r.y[j] - 3 * sc],
      ], { w: 2 * sc, passes: 1, wob: 1.4, seed: f.seed + i * 71, col, a: 0.34, step: 5 });
    }
  }
  ctx.restore();

  bandana(ctx, r, f, f.seed, sc);
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  face(ctx, r, f, sc, col);
  if (hurt) {
    ctx.globalAlpha = Math.min(1, f.hitFlash * 2);
    splat(ctx, r.x[P.NECK], r.y[P.NECK] - 6 * sc, 5 * sc, f.seed + Math.floor(t * 20), col, 0.5);
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  if (f.isPlayer && !f.dead) {
    const hx = r.x[P.HEAD], hy = r.y[P.HEAD] - BONE.headR * sc - 20;
    const bob = Math.sin(t * 4) * 3;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    stroke(ctx, [[hx - 8, hy - 10 + bob], [hx, hy + bob], [hx + 8, hy - 10 + bob]],
      { w: 3, passes: 2, wob: 0.7, seed: 1234, col: '#2f6ad0', a: 0.9, step: 5 });
    ctx.restore();
  }
}

/** Shadow the figure casts on the page — a soft pencil smudge, not a hard shape. */
export function drawShadow(ctx, f, groundY) {
  const [cx] = f.rag.centre();
  const lowest = Math.max(f.rag.y[P.FOOT_L], f.rag.y[P.FOOT_R], f.rag.y[P.PELVIS]);
  const h = Math.max(0, groundY - lowest);
  const a = Math.max(0, 0.26 - h / 900);
  if (a <= 0.01) return;
  const w = (34 + h * 0.10) * f.scale;
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = a;
  const g = ctx.createRadialGradient(cx, groundY + 3, 0, cx, groundY + 3, w);
  g.addColorStop(0, 'rgba(90,84,66,1)');
  g.addColorStop(1, 'rgba(90,84,66,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, groundY + 3, w, w * 0.24, 0, 0, 6.283);
  ctx.fill();
  ctx.restore();
}
