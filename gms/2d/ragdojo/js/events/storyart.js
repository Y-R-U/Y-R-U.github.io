// STORY pictures, drawn in code with the game's own ink and ragdoll fighters: one scene per
// chapter (18 in all), 1024×640, cached. No images ship or are fetched. Scenes are written in a
// 640×400 page with the ground at y 330.

import { stroke, line, circle, arc, rect, splat, scribble, hatch, speedLines, INK } from '../ink.js';
import { Ragdoll } from '../ragdoll.js';
import { POSE, fk } from '../poses.js';
import { drawFighter, drawShadow } from '../draw.js';
import { RANKS } from '../config.js';

const FONT = '"Patrick Hand", cursive';
const GROUND = 330;
const RED = '#c8463f', BLUE = '#2d5fb5', GREEN = '#3d6b3a', BROWN = '#6b4a2b', PINK = '#d77b8f', COFFEE = '#8a5a33', GOLD = '#d0a21e', PURPLE = '#8c50c6', ORANGE = '#e0802b';

// ── figures ────────────────────────────────────────────────────────────────────────────
/** A stick fighter whose feet stand on `gy`. `rank` indexes RANKS (0 white … 8 black). */
function fig(g, pose, x, gy, { face = 1, s = 1.3, rank = 0, you = false, seed = 1, rot = 0, lift = 0, shadow = true } = {}) {
  const f = { rag: new Ragdoll(s), scale: s, facing: face, rank: RANKS[rank], seed, armed: false, hp: 100, maxHp: 100, hitFlash: 0,
    isPlayer: you, dead: false, tailPhase: 1 };
  const p = POSE[pose] || POSE.guard;
  f.rag.place(x, gy - 58 * s - lift, fk(rot ? { ...p, rot } : p, face, s));
  if (shadow) drawShadow(g, f, gy);
  drawFighter(g, f, 0);
  return f;
}
const text = (g, s, x, y, size = 18, col = INK, align = 'center', rot = 0) => {
  g.save(); g.translate(x, y); g.rotate(rot); g.font = `${size}px ${FONT}`; g.fillStyle = col; g.textAlign = align; g.fillText(s, 0, 0); g.restore();
};
const fill = (g, pts, col, a = 1) => {
  g.save(); g.globalAlpha = a; g.fillStyle = col; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); g.restore();
};
const poly = (g, pts, o = {}) => stroke(g, [...pts, pts[0]], { w: 2.4, ...o });

// ── props ──────────────────────────────────────────────────────────────────────────────
function ground(g, seed = 6, y = GROUND) { stroke(g, [[14, y], [626, y]], { w: 3, seed }); }
function sun(g, x, y, r = 30, seed = 5) {
  circle(g, x, y, r, { w: 3, seed, col: ORANGE });
  speedLines(g, x, y, r * 1.35, r * 1.9, 10, seed, { w: 2, col: ORANGE, a: 0.7 });
}
function moon(g, x, y, r = 26) {
  arc(g, x, y, r, 0.9, 5.4, { w: 3, seed: 21, col: GOLD });
  arc(g, x + r * 0.45, y - r * 0.1, r * 0.8, 1.5, 4.8, { w: 2.4, seed: 22, col: GOLD });
}
function stars(g, n, seed, box = [20, 20, 600, 140]) {
  for (let i = 0; i < n; i++) {
    const x = box[0] + ((seed * 97 + i * 131) % box[2]), y = box[1] + ((seed * 61 + i * 89) % box[3]);
    line(g, x - 5, y, x + 5, y, { w: 1.6, passes: 1, seed: seed + i, col: GOLD });
    line(g, x, y - 5, x, y + 5, { w: 1.6, passes: 1, seed: seed + i + 50, col: GOLD });
  }
}
function cloud(g, x, y, s = 1, seed = 30, col = INK) {
  for (const [dx, dy, r] of [[-24, 4, 16], [-6, -8, 20], [16, -2, 17], [32, 6, 12]]) arc(g, x + dx * s, y + dy * s, r * s, Math.PI * 0.95, Math.PI * 2.05, { w: 2, seed: seed + dx, col, a: 0.8 });
  line(g, x - 40 * s, y + 10 * s, x + 44 * s, y + 10 * s, { w: 2, seed: seed + 9, col, a: 0.8 });
}
function dojo(g, x, y, s = 1, seed = 40) {
  const w = 150 * s, h = 90 * s;
  rect(g, x - w / 2, y - h, w, h, { w: 2.8, seed });
  stroke(g, [[x - w * 0.72, y - h + 4], [x - w * 0.5, y - h - 30 * s], [x + w * 0.5, y - h - 30 * s], [x + w * 0.72, y - h + 4]], { w: 3, seed: seed + 1, col: RED });
  stroke(g, [[x - w * 0.45, y - h - 30 * s], [x - w * 0.25, y - h - 58 * s], [x + w * 0.25, y - h - 58 * s], [x + w * 0.45, y - h - 30 * s]], { w: 3, seed: seed + 2, col: RED });
  rect(g, x - 18 * s, y - 52 * s, 36 * s, 52 * s, { w: 2.2, seed: seed + 3 });
  rect(g, x - 26 * s, y - h - 22 * s, 52 * s, 16 * s, { w: 1.8, seed: seed + 4 });
  text(g, 'DOJO', x, y - h - 10 * s, 13 * s);
}
function pencil(g, x0, y0, x1, y1, seed = 50, w = 14) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), nx = -dy / L * w / 2, ny = dx / L * w / 2, tx = dx / L, ty = dy / L;
  const bx = x1 - tx * w * 1.6, by = y1 - ty * w * 1.6;
  fill(g, [[x0 + nx, y0 + ny], [bx + nx, by + ny], [bx - nx, by - ny], [x0 - nx, y0 - ny]], GOLD, 0.55);
  poly(g, [[x0 + nx, y0 + ny], [bx + nx, by + ny], [x1, y1], [bx - nx, by - ny], [x0 - nx, y0 - ny]], { seed, w: 2.2 });
  fill(g, [[x0 + nx, y0 + ny], [x0 - nx, y0 - ny], [x0 - nx - tx * 10, y0 - ny - ty * 10], [x0 + nx - tx * 10, y0 + ny - ty * 10]], PINK, 0.8);
}
function eraser(g, x, y, w, h, { seed = 60, face = false, ang = 0 } = {}) {
  g.save(); g.translate(x, y); g.rotate(ang);
  fill(g, [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]], PINK, 0.55);
  rect(g, -w / 2, -h / 2, w, h, { w: 2.6, seed });
  line(g, -w / 2 + w * 0.32, -h / 2, -w / 2 + w * 0.32, h / 2, { w: 1.6, seed: seed + 1, a: 0.6 });
  if (face) {
    g.fillStyle = INK;
    for (const ex of [0.1, 0.32]) { g.beginPath(); g.arc(w * ex, -h * 0.12, 3.2, 0, 6.283); g.fill(); }
    stroke(g, [[w * 0.05, h * 0.18], [w * 0.21, h * 0.1], [w * 0.37, h * 0.18]], { w: 2, seed: seed + 2 });
    line(g, w * 0.02, -h * 0.3, w * 0.16, -h * 0.22, { w: 2, seed: seed + 3 });
    line(g, w * 0.42, -h * 0.3, w * 0.28, -h * 0.22, { w: 2, seed: seed + 4 });
  }
  g.restore();
}
function shavings(g, x, y, n, seed = 70, spread = 40) {
  for (let i = 0; i < n; i++) {
    const cx = x + ((i * 53 + seed) % spread) - spread / 2, cy = y - ((i * 29 + seed) % 12);
    arc(g, cx, cy, 5 + (i % 3), 0, 4.2, { w: 1.6, passes: 1, seed: seed + i, col: BROWN });
  }
}
function trail(g, pts, seed = 80) { pts.forEach(([x, y], i) => shavings(g, x, y, 2, seed + i * 7, 14)); }
function margin(g, x, y0 = 0, y1 = 400) {
  line(g, x, y0, x, y1, { w: 3, seed: 90, col: RED, a: 0.85 });
  line(g, x + 6, y0, x + 6, y1, { w: 1.6, seed: 91, col: RED, a: 0.5 });
}
function rope(g, x0, y0, x1, y1, seed = 95) {
  const pts = Array.from({ length: 12 }, (_, i) => { const t = i / 11; return [x0 + (x1 - x0) * t + Math.sin(t * 9) * 3, y0 + (y1 - y0) * t]; });
  stroke(g, pts, { w: 2.4, seed, col: BROWN });
}
function crane(g, x, y, s = 1, seed = 100) {
  const P = (dx, dy) => [x + dx * s, y + dy * s];
  fill(g, [P(-60, 0), P(0, -18), P(60, 0), P(0, 22)], '#fdfaf0', 1);
  poly(g, [P(-60, 0), P(0, -18), P(60, 0), P(0, 22)], { seed, w: 2.6 });
  poly(g, [P(-10, -10), P(-30, -80), P(10, -14)], { seed: seed + 1, w: 2.4 });
  poly(g, [P(10, -10), P(70, -66), P(30, -6)], { seed: seed + 2, w: 2.4 });
  stroke(g, [P(50, -2), P(92, -58), P(108, -54)], { w: 2.6, seed: seed + 3 });
  stroke(g, [P(-50, -2), P(-84, -40)], { w: 2.6, seed: seed + 4 });
  g.fillStyle = INK; g.beginPath(); g.arc(...P(96, -56), 2.5 * s, 0, 6.283); g.fill();
  line(g, ...P(0, -18), ...P(0, 22), { w: 1.4, seed: seed + 5, a: 0.5 });
}
function nest(g, x, y, w = 140, seed = 110) {
  const r = w / 2;
  for (let i = 0; i < 9; i++) arc(g, x, y - r * 0.9, r - i * 2, 0.35 + i * 0.02, Math.PI - 0.35, { w: 2, passes: 1, seed: seed + i, col: i % 3 === 0 ? RED : i % 3 === 1 ? BROWN : BLUE, a: 0.8 });
}
function bandana(g, x, y, s = 1, seed = 120, col = '#23262d') {
  fill(g, [[x - 22 * s, y - 5 * s], [x + 22 * s, y - 8 * s], [x + 20 * s, y + 4 * s], [x - 20 * s, y + 6 * s]], col, 0.9);
  stroke(g, [[x + 20 * s, y - 2 * s], [x + 38 * s, y + 10 * s]], { w: 3 * s, seed, col });
  stroke(g, [[x + 20 * s, y], [x + 32 * s, y + 18 * s]], { w: 3 * s, seed: seed + 1, col });
}
function peg(g, x, y, empty = true) {
  rect(g, x - 40, y - 14, 80, 10, { w: 2, seed: 130, col: BROWN });
  for (const dx of [-24, 0, 24]) line(g, x + dx, y - 4, x + dx, y + 8, { w: 3, seed: 131 + dx, col: BROWN });
  if (empty) { text(g, '?', x, y + 34, 26, RED); circle(g, x, y + 24, 16, { w: 2, seed: 133, col: RED, a: 0.7 }); }
}
function podium(g, x, y = GROUND) {
  for (const [dx, h, n] of [[-60, 40, '2'], [0, 66, '1'], [60, 26, '3']]) { rect(g, x + dx - 30, y - h, 60, h, { w: 2.4, seed: 140 + h }); text(g, n, x + dx, y - h / 2 + 8, 22); }
}
function mug(g, x, y, s = 1, tilt = 0.5, seed = 150) {
  g.save(); g.translate(x, y); g.rotate(tilt);
  const w = 90 * s, h = 110 * s;
  fill(g, [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2 - 6, h / 2], [-w / 2 + 6, h / 2]], '#fdfaf0', 1);
  poly(g, [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2 - 6, h / 2], [-w / 2 + 6, h / 2]], { seed, w: 3 });
  arc(g, w / 2 + 12 * s, 0, 24 * s, -1.3, 1.3, { w: 3, seed: seed + 1 });
  stroke(g, [[-w / 2 + 8, -h / 4], [w / 2 - 8, -h / 4]], { w: 2, seed: seed + 2, col: COFFEE, a: 0.7 });
  text(g, '#1 DESK', 0, 10 * s, 14 * s, RED);
  g.restore();
}
function pour(g, x0, y0, x1, y1, seed = 160) {
  const pts = Array.from({ length: 10 }, (_, i) => { const t = i / 9; return [x0 + (x1 - x0) * t * t, y0 + (y1 - y0) * t]; });
  stroke(g, pts, { w: 12, seed, col: COFFEE, a: 0.55, passes: 1 });
  stroke(g, pts, { w: 3, seed: seed + 1, col: COFFEE });
}
function flood(g, y, seed = 170, x0 = 0, x1 = 640) {
  const pts = [];
  for (let x = x0; x <= x1; x += 16) pts.push([x, y + Math.sin(x * 0.07 + seed) * 5]);
  fill(g, [...pts, [x1, 400], [x0, 400]], COFFEE, 0.28);
  stroke(g, pts, { w: 2.6, seed, col: COFFEE });
  for (let i = 0; i < 6; i++) arc(g, x0 + 40 + i * ((x1 - x0) / 6), y + 24 + (i % 2) * 18, 10, 3.6, 5.8, { w: 1.6, passes: 1, seed: seed + i, col: COFFEE, a: 0.7 });
}
function boat(g, x, y, s = 1, seed = 180) {
  const P = (dx, dy) => [x + dx * s, y + dy * s];
  fill(g, [P(-90, -20), P(90, -20), P(60, 14), P(-60, 14)], '#fdfaf0', 1);
  poly(g, [P(-90, -20), P(90, -20), P(60, 14), P(-60, 14)], { seed, w: 2.8 });
  poly(g, [P(-30, -20), P(0, -90), P(30, -20)], { seed: seed + 1, w: 2.6 });
  for (let i = 0; i < 4; i++) line(g, ...P(-70 + i * 12, -14), ...P(-40 + i * 22, -14), { w: 1.2, passes: 1, seed: seed + 5 + i, a: 0.35 });
  text(g, 'HOMEWORK', x - 2 * s, y - 2 * s, 12 * s, BLUE);
}
function whirl(g, x, y, r = 80, seed = 190) {
  const pts = [];
  for (let a = 0; a < Math.PI * 7; a += 0.2) { const rr = r * (1 - a / (Math.PI * 7.4)); pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.4]); }
  stroke(g, pts, { w: 2.4, seed, col: COFFEE });
}
function sharpener(g, x, y, s = 1) {
  rect(g, x - 30 * s, y - 34 * s, 60 * s, 34 * s, { w: 2.6, seed: 200 });
  circle(g, x, y - 17 * s, 9 * s, { w: 2, seed: 201 });
  line(g, x - 22 * s, y - 30 * s, x + 22 * s, y - 30 * s, { w: 1.6, seed: 202, a: 0.6 });
}
function ruler(g, x0, y0, x1, y1, seed = 210) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), nx = -dy / L * 7, ny = dx / L * 7;
  poly(g, [[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]], { seed, w: 2, col: BROWN });
  for (let i = 1; i < 12; i++) { const t = i / 12; line(g, x0 + dx * t + nx, y0 + dy * t + ny, x0 + dx * t + nx * 0.2, y0 + dy * t + ny * 0.2, { w: 1.2, passes: 1, seed: seed + i, col: BROWN }); }
}
function bridge(g, x0, x1, y, seed = 220) {
  const pts = Array.from({ length: 16 }, (_, i) => { const t = i / 15; return [x0 + (x1 - x0) * t, y - Math.sin(t * Math.PI) * 50]; });
  stroke(g, pts, { w: 4, seed, col: BLUE });
  stroke(g, pts.map(([x, yy]) => [x, yy - 26]), { w: 2.4, seed: seed + 1, col: BLUE });
  for (let i = 1; i < 15; i += 2) line(g, pts[i][0], pts[i][1], pts[i][0], pts[i][1] - 26, { w: 1.8, passes: 1, seed: seed + i, col: BLUE });
}
function cube(g, x, y, s = 30, seed = 230) {
  rect(g, x, y - s, s, s, { w: 2, seed });
  stroke(g, [[x, y - s], [x + s * 0.3, y - s * 1.3], [x + s * 1.3, y - s * 1.3], [x + s, y - s]], { w: 1.8, seed: seed + 1 });
  line(g, x + s * 1.3, y - s * 1.3, x + s * 1.3, y - s * 0.3, { w: 1.8, seed: seed + 2 });
  for (let i = 0; i < 3; i++) g.fillRect(x + 6 + i * 8, y - s + 8 + (i % 2) * 9, 2, 2);
}
function snail(g, x, y, s = 1, seed = 240) {
  const pts = [];
  for (let a = 0; a < Math.PI * 4; a += 0.3) { const r = 14 * s * (1 - a / (Math.PI * 4.4)); pts.push([x + Math.cos(a) * r, y - 14 * s + Math.sin(a) * r]); }
  stroke(g, pts, { w: 2, seed, col: BROWN });
  stroke(g, [[x - 16 * s, y], [x + 26 * s, y], [x + 30 * s, y - 10 * s]], { w: 2, seed: seed + 1 });
  line(g, x + 28 * s, y - 8 * s, x + 32 * s, y - 20 * s, { w: 1.4, seed: seed + 2 });
  line(g, x + 30 * s, y - 8 * s, x + 38 * s, y - 18 * s, { w: 1.4, seed: seed + 3 });
}
function medal(g, x, y, seed = 250) {
  line(g, x - 6, y - 26, x, y - 8, { w: 2, seed, col: RED }); line(g, x + 6, y - 26, x, y - 8, { w: 2, seed: seed + 1, col: BLUE });
  fill(g, Array.from({ length: 12 }, (_, i) => [x + Math.cos(i / 12 * 6.28) * 8, y + Math.sin(i / 12 * 6.28) * 8]), GOLD, 0.8);
  circle(g, x, y, 8, { w: 1.8, seed: seed + 2 });
}
function dragon(g, x, y, s = 1, { face = 1, col = GREEN, seed = 260, wings = 'up', bandanas = false, pale = false } = {}) {
  g.save(); g.translate(x, y); g.scale(face * s, s);
  const c = pale ? '#7fa07b' : col;
  const body = Array.from({ length: 20 }, (_, i) => { const a = (i / 20) * 6.283; return [Math.cos(a) * 60, -40 + Math.sin(a) * 34]; });
  fill(g, body, c, 0.35);
  stroke(g, [...body, body[0]], { w: 3, seed, col: c });
  stroke(g, [[44, -60], [70, -96], [84, -118]], { w: 9, seed: seed + 1, col: c, a: 0.5, passes: 1 });
  stroke(g, [[44, -60], [70, -96], [84, -118]], { w: 3, seed: seed + 2, col: c });
  circle(g, 96, -124, 18, { w: 3, seed: seed + 3, col: c });
  stroke(g, [[110, -120], [126, -116], [112, -110]], { w: 2.4, seed: seed + 4, col: c });
  g.fillStyle = INK; g.beginPath(); g.arc(100, -130, 3, 0, 6.283); g.fill();
  line(g, 88, -140, 82, -154, { w: 2.4, seed: seed + 5, col: c }); line(g, 96, -141, 96, -157, { w: 2.4, seed: seed + 6, col: c });
  stroke(g, [[-58, -36], [-96, -20], [-124, -40], [-136, -64], [-120, -58]], { w: 3, seed: seed + 7, col: c });
  for (let i = 0; i < 6; i++) { const a = Math.PI * (1.15 + i * 0.13); const px = Math.cos(a) * 60, py = -40 + Math.sin(a) * 34; stroke(g, [[px, py], [px + 4, py - 14], [px + 12, py - 2]], { w: 2, seed: seed + 10 + i, col: c }); }
  const wy = wings === 'up' ? -1 : 0.4;
  stroke(g, [[-10, -64], [-40, -64 + 90 * wy], [10, -64 + 70 * wy], [30, -64 + 95 * wy], [40, -64]], { w: 3, seed: seed + 20, col: c });
  for (const lx of [-34, 30]) stroke(g, [[lx, -10], [lx - 4, 4], [lx + 8, 6]], { w: 3, seed: seed + 30 + lx, col: c });
  if (bandanas) for (let i = 0; i < 4; i++) fill(g, [[50 + i * 8, -70 - i * 13], [70 + i * 8, -78 - i * 13], [72 + i * 8, -68 - i * 13], [52 + i * 8, -60 - i * 13]], [RED, GOLD, BLUE, '#23262d'][i], 0.85);
  g.restore();
}
function crayons(g, x, y, n = 5) { for (let i = 0; i < n; i++) pencil(g, x + i * 16, y, x + i * 16 + 10, y - 50, 300 + i, 10); }
function crayonsCol(g, x, y) {
  const cols = [RED, ORANGE, GOLD, GREEN, BLUE, PURPLE];
  cols.forEach((c, i) => { const px = x + i * 14; fill(g, [[px, y], [px + 9, y], [px + 9, y - 40], [px + 4.5, y - 50], [px, y - 40]], c, 0.75); poly(g, [[px, y], [px + 9, y], [px + 9, y - 40], [px + 4.5, y - 50], [px, y - 40]], { w: 1.6, seed: 310 + i }); });
}
function bucket(g, x, y) {
  poly(g, [[x - 20, y - 34], [x + 20, y - 34], [x + 15, y], [x - 15, y]], { seed: 320, w: 2.4 });
  arc(g, x, y - 34, 20, Math.PI, Math.PI * 2, { w: 2, seed: 321 });
  stroke(g, [[x - 18, y - 30], [x + 18, y - 30]], { w: 2, seed: 322, col: BLUE });
}
function smokeRings(g, x, y, n = 3) { for (let i = 0; i < n; i++) circle(g, x + i * 26, y - i * 30, 12 + i * 6, { w: 2, seed: 330 + i, a: 0.5 }); }
function spark(g, x, y, seed = 340) { speedLines(g, x, y, 4, 18, 8, seed, { w: 2, col: ORANGE }); }
function bell(g, x, y) {
  stroke(g, [[x - 26, y + 26], [x - 22, y - 10], [x, y - 26], [x + 22, y - 10], [x + 26, y + 26], [x - 26, y + 26]], { w: 2.6, seed: 350, col: GOLD });
  circle(g, x, y + 30, 5, { w: 2, seed: 351, col: GOLD });
  speedLines(g, x, y, 34, 46, 6, 352, { w: 1.6, col: GOLD, a: 0.6 });
}
function banner(g, x, y, w, s, seed = 360) {
  stroke(g, [[x - w / 2, y], [x - w / 2, y - 60]], { w: 2.4, seed });
  stroke(g, [[x + w / 2, y], [x + w / 2, y - 60]], { w: 2.4, seed: seed + 1 });
  rect(g, x - w / 2, y - 60, w, 26, { w: 2, seed: seed + 2, col: RED });
  text(g, s, x, y - 41, 16, RED);
}
function window_(g, x, y, w, h) { rect(g, x, y, w, h, { w: 2.2, seed: 370 }); line(g, x + w / 2, y, x + w / 2, y + h, { w: 1.6, seed: 371 }); line(g, x, y + h / 2, x + w, y + h / 2, { w: 1.6, seed: 372 }); }
function confetti(g, n, seed) { const cols = [RED, BLUE, GOLD, GREEN, PURPLE]; for (let i = 0; i < n; i++) { const x = 30 + ((i * 137 + seed) % 580), y = 20 + ((i * 71 + seed * 3) % 200); fill(g, [[x, y], [x + 7, y + 2], [x + 5, y + 8], [x - 2, y + 6]], cols[i % 5], 0.7); } }
function motion(g, x0, y, x1, n = 3, seed = 380) { for (let i = 0; i < n; i++) line(g, x0, y + i * 12, x1, y + i * 12, { w: 1.8, passes: 1, seed: seed + i, a: 0.6 }); }

// ── the scenes ─────────────────────────────────────────────────────────────────────────
const SCENES = [
  [ // THE STOLEN BANDANA
    (g) => { // A Missing Knot
      ground(g); dojo(g, 470, GROUND, 1.25); peg(g, 230, 120);
      fig(g, 'hurt', 140, GROUND, { face: 1, s: 1.35, rank: 8, seed: 3 });
      fig(g, 'bow', 300, GROUND, { face: -1, s: 1.25, rank: 0, you: true, seed: 4 });
      trail(g, [[340, 326], [380, 322], [420, 326], [470, 320]]);
      text(g, '!', 120, 110, 40, RED);
    },
    (g) => { // The Shavings Trail
      ground(g);
      for (let i = 0; i < 4; i++) rect(g, 380 + i * 50, GROUND - 40 - i * 14, 46, 40 + i * 14, { w: 2, seed: 400 + i, col: BROWN, a: 0.7 });
      shavings(g, 470, GROUND - 2, 14, 410, 90); sharpener(g, 560, GROUND, 1.4);
      fig(g, 'kickHit', 200, GROUND, { face: 1, s: 1.3, rank: 0, you: true, seed: 5 });
      fig(g, 'hurt', 330, GROUND, { face: -1, s: 1.2, rank: 0, seed: 6 });
      text(g, '"hummed badly!"', 330, 120, 20, BLUE, 'center', -0.06);
      trail(g, [[40, 326], [80, 322], [120, 326]]);
    },
    (g) => { // Up the Red Margin
      margin(g, 330); ground(g, 7, 380);
      rope(g, 330, 30, 300, 300);
      fig(g, 'jumpUp', 300, 260, { face: 1, s: 1.15, rank: 0, you: true, seed: 7, shadow: false });
      cloud(g, 150, 90, 1.1); cloud(g, 500, 140, 0.9, 33);
      text(g, 'not here', 390, 40, 13, INK, 'left', -0.04);
      for (let i = 0; i < 5; i++) line(g, 60, 70 + i * 20, 140, 60 + i * 20, { w: 1.6, passes: 1, seed: 420 + i, a: 0.4 });
    },
    (g) => { // The Eraser Guards
      ground(g);
      eraser(g, 170, GROUND - 60, 90, 120, { face: true, seed: 61, ang: -0.08 });
      eraser(g, 500, GROUND - 60, 90, 120, { face: true, seed: 62, ang: 0.1 });
      fig(g, 'flipKick', 335, 230, { face: 1, s: 1.3, rank: 0, you: true, seed: 8, shadow: false, rot: -0.5 });
      arc(g, 335, 230, 90, 3.4, 5.9, { w: 2, seed: 430, a: 0.6 });
      scribble(g, 260, GROUND - 6, 60, 10, 431);
      text(g, 'TOP CORNER →', 600, 60, 18, RED, 'right');
    },
    (g) => { // The Top Corner
      ground(g); nest(g, 420, GROUND - 10, 220);
      crane(g, 420, GROUND - 70, 1.3); bandana(g, 360, GROUND - 46, 1);
      fig(g, 'bow', 140, GROUND, { face: 1, s: 1.3, rank: 0, you: true, seed: 9 });
      text(g, 'HISS', 540, 120, 24, RED, 'center', 0.12);
      stroke(g, [[600, 20], [600, 120], [500, 20]], { w: 2, seed: 440, a: 0.6 });
    },
    (g) => { // The Grand Doodle Tournament
      ground(g); podium(g, 320); banner(g, 320, 96, 300, 'GRAND DOODLE TOURNAMENT'); bell(g, 560, 120);
      fig(g, 'victory', 320, GROUND - 66, { face: 1, s: 1.15, rank: 0, you: true, seed: 10 });
      fig(g, 'bow', 140, GROUND, { face: 1, s: 1.3, rank: 8, seed: 11 });
      crane(g, 540, GROUND - 40, 0.6, 105); confetti(g, 28, 7);
    },
  ],
  [ // THE GREAT SPILL
    (g) => { // Rain on the Desk
      mug(g, 150, 110, 1.2, 0.9); pour(g, 220, 150, 320, 300); flood(g, 300, 2, 0, 380);
      ground(g, 6);
      fig(g, 'runA', 460, GROUND, { face: 1, s: 1.2, rank: 1, seed: 12 });
      fig(g, 'runC', 560, GROUND, { face: 1, s: 1.2, rank: 0, you: true, seed: 13 });
      motion(g, 380, 270, 420);
    },
    (g) => { // The Paper Boat
      ground(g); boat(g, 340, GROUND - 30, 1.3);
      fig(g, 'taunt', 160, GROUND, { face: 1, s: 1.25, rank: 0, you: true, seed: 14 });
      fig(g, 'guard', 520, GROUND, { face: -1, s: 1.3, rank: 7, seed: 15 });
      snail(g, 360, GROUND - 60, 1); text(g, 'fold here', 300, 90, 18, BLUE, 'center', -0.05);
      pencil(g, 60, 120, 140, 60, 52, 10);
    },
    (g) => { // Whirlpool Row
      flood(g, 250, 4); whirl(g, 330, 320, 120); sharpener(g, 330, 330, 1.2);
      boat(g, 230, 240, 1);
      fig(g, 'powHit', 200, 230, { face: 1, s: 0.95, rank: 0, you: true, seed: 16, shadow: false });
      ruler(g, 240, 200, 290, 280); snail(g, 280, 222, 0.8);
      text(g, 'AAAAA!', 470, 120, 30, RED, 'center', 0.1);
    },
    (g) => { // The Biro Bridge
      flood(g, 300, 6); bridge(g, 80, 560, 300);
      fig(g, 'walkA', 300, 258, { face: 1, s: 1.15, rank: 0, you: true, seed: 17, shadow: false });
      fig(g, 'hurt', 340, 190, { face: 1, s: 0.7, rank: 1, seed: 18, shadow: false });
      snail(g, 480, 280, 0.9); text(g, 'BIRO HEIGHTS', 540, 60, 18, BLUE);
    },
    (g) => { // Sugar Cube Mountain
      flood(g, 320, 8); for (let r = 0; r < 4; r++) for (let c = 0; c <= 3 - r; c++) cube(g, 250 + c * 44 + r * 22, 330 - r * 44, 40, 450 + r * 10 + c);
      fig(g, 'tossHit', 160, 330, { face: 1, s: 1.15, rank: 0, you: true, seed: 19, shadow: false });
      fig(g, 'jumpUp', 360, 160, { face: -1, s: 0.9, rank: 2, seed: 20, shadow: false });
      cube(g, 230, 230, 20, 470); text(g, 'RELAY!', 520, 90, 26, RED);
    },
    (g) => { // The Blotter
      sun(g, 540, 70); ground(g);
      rect(g, 260, 210, 260, 110, { w: 3, seed: 480, col: PURPLE }); hatch(g, 264, 214, 252, 102, { gap: 12, seed: 481, a: 0.25, col: PURPLE });
      text(g, 'BLOTTER', 390, 270, 22, PURPLE);
      fig(g, 'kickHit', 170, 250, { face: 1, s: 1.25, rank: 0, you: true, seed: 21, shadow: false });
      motion(g, 40, 230, 110); medal(g, 90, 300); snail(g, 60, GROUND, 1.1);
    },
  ],
  [ // THE DRAWING DRAGON
    (g) => { // Doodle in the Margin
      margin(g, 470); ground(g);
      dragon(g, 545, 200, 0.45, { face: -1 }); spark(g, 470, 140);
      fig(g, 'hurt', 220, GROUND, { face: 1, s: 1.3, rank: 0, you: true, seed: 22 });
      for (let i = 0; i < 6; i++) line(g, 40, 60 + i * 26, 400, 60 + i * 26, { w: 1.2, passes: 1, seed: 500 + i, col: BLUE, a: 0.3 });
      text(g, 'wink', 560, 70, 16, GREEN);
    },
    (g) => { // The Hungry Doodle
      ground(g); dragon(g, 400, GROUND, 0.9, { face: -1, col: PURPLE });
      crayonsCol(g, 150, GROUND);
      fig(g, 'block', 110, GROUND, { face: 1, s: 1.15, rank: 0, you: true, seed: 23 });
      text(g, 'CRUNCH', 330, 90, 26, ORANGE, 'center', -0.08);
      rect(g, 520, 200, 80, 130, { w: 2.2, seed: 510, col: BROWN }); text(g, 'ART', 560, 225, 16, BROWN);
    },
    (g) => { // Smoke over the Dojo
      ground(g); dojo(g, 380, GROUND, 1.5); dragon(g, 380, 150, 0.9, { face: 1 });
      smokeRings(g, 520, 80); bucket(g, 150, GROUND - 60);
      fig(g, 'guard', 160, GROUND, { face: 1, s: 1.3, rank: 8, seed: 24 });
      fig(g, 'hurt', 90, GROUND, { face: 1, s: 1.05, rank: 0, you: true, seed: 25 });
    },
    (g) => { // Training a Dragon
      ground(g); dragon(g, 440, GROUND, 1, { face: -1 });
      fig(g, 'powHit', 160, GROUND, { face: 1, s: 1.3, rank: 0, you: true, seed: 26 });
      stroke(g, [[400, 40], [460, 52], [520, 40], [540, 60]], { w: 2.4, seed: 520 }); text(g, 'dent', 470, 80, 16);
      text(g, 'HI-YA!', 220, 110, 24, RED);
    },
    (g) => { // The Eraser Storm
      ground(g); dragon(g, 330, GROUND, 1.3, { face: 1, wings: 'down', pale: true });
      for (let i = 0; i < 6; i++) eraser(g, 80 + i * 96, 50 + (i % 2) * 30, 36, 22, { seed: 530 + i, ang: i * 0.4 });
      fig(g, 'block', 260, GROUND, { face: 1, s: 1, rank: 0, you: true, seed: 27, shadow: false });
      fig(g, 'block', 330, GROUND, { face: -1, s: 0.9, rank: 1, seed: 28, shadow: false });
      for (let i = 0; i < 10; i++) line(g, 60 + i * 56, 100, 50 + i * 56, 130, { w: 1.4, passes: 1, seed: 540 + i, col: PINK, a: 0.6 });
    },
    (g) => { // The Dragon Belt
      ground(g); dragon(g, 330, GROUND, 1.2, { face: 1, bandanas: true });
      fig(g, 'victory', 320, 196, { face: 1, s: 0.85, rank: 0, you: true, seed: 29, shadow: false });
      fig(g, 'bow', 100, GROUND, { face: 1, s: 1.2, rank: 8, seed: 30 });
      fig(g, 'victory', 560, GROUND, { face: -1, s: 1, rank: 2, seed: 31 });
      confetti(g, 30, 13); stars(g, 6, 3, [40, 20, 560, 60]);
    },
  ],
];

const cache = new Map();

/** The picture for a story chapter: a 1024×640 canvas. */
export function storyPicture(story, chapter) {
  const key = `${story}:${chapter}`;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = 1024; c.height = 640;
  const g = c.getContext('2d');
  g.fillStyle = '#fbf7ea'; g.fillRect(0, 0, 1024, 640);
  g.scale(1024 / 640, 1024 / 640);
  g.save(); g.globalCompositeOperation = 'multiply';
  (SCENES[story]?.[chapter] || SCENES[0][0])(g);
  g.restore();
  cache.set(key, c);
  return c;
}

/** THE TOWER's prize: the pyramid with you on top, flag up. */
export function towerPicture() {
  if (cache.has('tower')) return cache.get('tower');
  const c = document.createElement('canvas'); c.width = 1024; c.height = 640;
  const g = c.getContext('2d');
  g.fillStyle = '#fbf7ea'; g.fillRect(0, 0, 1024, 640);
  g.scale(1024 / 640, 1024 / 640);
  g.save(); g.globalCompositeOperation = 'multiply';
  ground(g, 6, 380);
  for (let i = 0; i < 12; i++) {
    const w = 520 - i * 38, h = 22, y = 380 - (i + 1) * h;
    rect(g, 320 - w / 2, y, w, h, { w: 2, seed: 600 + i });
    text(g, String(i + 1), 320 - w / 2 + 12, y + 17, 12, INK, 'center');
  }
  sun(g, 560, 60, 26);
  fig(g, 'victory', 320, 116, { face: 1, s: 0.55, rank: 0, you: true, seed: 32, shadow: false });
  stroke(g, [[350, 116], [350, 44]], { w: 2.4, seed: 610 });
  fill(g, [[350, 46], [392, 58], [350, 70]], RED, 0.85);
  text(g, 'TOP OF THE TOWER', 140, 60, 24, RED);
  confetti(g, 20, 21);
  g.restore();
  cache.set('tower', c);
  return c;
}
