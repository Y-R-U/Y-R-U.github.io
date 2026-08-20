// One leaded light per zone, drawn once with the 2D canvas API and used twice: as the pane's
// albedo + emissive, and as the colour of the patch it throws on the floor. Albedo only —
// there is no normal map, because at 60 MB of texture budget the second map is not worth it
// on a surface that is read as light rather than as relief.

import * as THREE from 'three';
import { track } from '../../engine/budget.js';
import { releaseCanvas } from './bake.js';
import { zone } from '../zones.js';

const S = 512;
// Cames are lead in every zone. `window.frame` is the stone or timber surround and is near-white
// in the light zone, which drawn as leading turns the whole light into a pastel poster.
const LEAD = '#15151a';
const cache = new Map();

export function stainedTexture(zoneId) {
  if (cache.has(zoneId)) return cache.get(zoneId);
  const z = zone(zoneId);
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  paint(ctx, z);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 4;
  t.onUpdate = releaseCanvas;
  track(t, { w: S, h: S, fmt: 'rgba', mips: true, label: `stained:${zoneId}` });
  cache.set(zoneId, t);
  return t;
}

// The mean of a zone's glass tints — what the shaft and the fill light are coloured with.
export function stainedTint(zoneId) {
  const z = zone(zoneId);
  const tints = (z.interior.glass || z.window.glass).map(h => new THREE.Color(h));
  const out = new THREE.Color(0, 0, 0);
  for (const c of tints) out.add(c);
  return out.multiplyScalar(1 / tints.length);
}

const PATTERN = { rose, quarry, rays };

function paint(ctx, z) {
  const lead = LEAD;
  const tints = z.interior.glass || z.window.glass;
  ctx.fillStyle = lead;
  ctx.fillRect(0, 0, S, S);
  ctx.lineJoin = ctx.lineCap = 'round';
  (PATTERN[z.interior.pattern] || quarry)(ctx, tints, lead);
  // A wide inner border of lead, so the pane never runs colour straight into the stone reveal.
  ctx.strokeStyle = lead;
  ctx.lineWidth = S * 0.05;
  ctx.strokeRect(0, 0, S, S);
}

const px = v => v * S;

function cell(ctx, pts, fill, lead, lw = 0.014) {
  ctx.beginPath();
  ctx.moveTo(px(pts[0][0]), px(pts[0][1]));
  for (let i = 1; i < pts.length; i++) ctx.lineTo(px(pts[i][0]), px(pts[i][1]));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = lead;
  ctx.lineWidth = S * lw;
  ctx.stroke();
}

function wedge(ctx, cx, cy, r0, r1, a0, a1, fill, lead, lw = 0.013) {
  ctx.beginPath();
  ctx.arc(px(cx), px(cy), px(r0), a0, a1);
  ctx.arc(px(cx), px(cy), px(r1), a1, a0, true);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = lead;
  ctx.lineWidth = S * lw;
  ctx.stroke();
}

// Shade a tint without leaving the zone's palette: glass reads as glass when neighbouring
// quarries of one colour sit at slightly different values, not when every cell is a new hue.
function shade(hex, k) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return `#${c.getHexString()}`;
}

function rose(ctx, tints, lead) {
  // a quarry field first, then the medallion on top of it — a rose drawn on bare lead leaves
  // most of the light black
  quarryField(ctx, tints, lead, 8, 0.92);
  const cx = 0.5, cy = 0.42;
  const petals = 12;
  wedge(ctx, cx, cy, 0, 0.335, 0, Math.PI * 2, tints[1 % tints.length], lead);
  for (let i = 0; i < petals; i++) {
    const a0 = (i / petals) * Math.PI * 2, a1 = ((i + 1) / petals) * Math.PI * 2;
    wedge(ctx, cx, cy, 0.135, 0.335, a0 + 0.02, a1 - 0.02, shade(tints[i % tints.length], 0.8 + 0.4 * ((i % 3) / 2)), lead);
  }
  for (let i = 0; i < 6; i++) {
    const a0 = (i / 6) * Math.PI * 2, a1 = ((i + 1) / 6) * Math.PI * 2;
    wedge(ctx, cx, cy, 0.04, 0.135, a0 + 0.03, a1 - 0.03, shade(tints[(i + 2) % tints.length], 1.15), lead);
  }
  wedge(ctx, cx, cy, 0, 0.045, 0, Math.PI * 2, shade(tints[0], 1.6), lead);

  // a band under the rose, so the lower half of the light is not just field
  ctx.fillStyle = shade(tints[tints.length - 1], 1.2);
  ctx.fillRect(0, px(0.84), S, px(0.09));
  ctx.strokeStyle = lead;
  ctx.lineWidth = S * 0.018;
  ctx.strokeRect(0, px(0.84), S, px(0.09));
}

function quarryField(ctx, tints, lead, n, dim) {
  const s = 1 / n;
  for (let j = -1; j < n + 1; j++) {
    for (let i = -1; i < n + 1; i++) {
      const cx = (i + 0.5) * s + (j % 2 ? s / 2 : 0), cy = (j + 0.5) * s;
      const k = ((i * 3 + j * 5) % tints.length + tints.length) % tints.length;
      cell(ctx, [[cx, cy - s * 0.62], [cx + s * 0.56, cy], [cx, cy + s * 0.62], [cx - s * 0.56, cy]],
        shade(tints[k], dim * (0.84 + 0.32 * (((i + j) % 3) / 2))), lead, 0.011);
    }
  }
}

function quarry(ctx, tints, lead) {
  quarryField(ctx, tints, lead, 7, 1);
  // a coloured band across the middle, the one thing that stops a quarry field reading as tiling
  ctx.fillStyle = shade(tints[tints.length - 1], 1.25);
  ctx.fillRect(0, px(0.44), S, px(0.11));
  ctx.strokeStyle = lead;
  ctx.lineWidth = S * 0.018;
  ctx.strokeRect(0, px(0.44), S, px(0.11));
  for (let i = 0; i < 5; i++) {
    wedge(ctx, (i + 0.5) / 5, 0.495, 0, 0.038, 0, Math.PI * 2, shade(tints[i % tints.length], 1.5), lead);
  }
}

function rays(ctx, tints, lead) {
  const cx = 0.5, cy = 0.94;
  const n = 13;
  for (let i = 0; i < n; i++) {
    const a0 = Math.PI + (i / n) * Math.PI, a1 = Math.PI + ((i + 0.94) / n) * Math.PI;
    const r = 1.15;
    cell(ctx, [
      [cx + Math.cos(a0) * 0.06, cy + Math.sin(a0) * 0.06],
      [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r],
      [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r],
      [cx + Math.cos(a1) * 0.06, cy + Math.sin(a1) * 0.06],
    ], shade(tints[i % tints.length], 0.7 + 0.6 * ((i % 4) / 3)), lead, 0.012);
  }
  for (const r of [0.34, 0.62]) {
    ctx.beginPath();
    ctx.arc(px(cx), px(cy), px(r), Math.PI, Math.PI * 2);
    ctx.strokeStyle = lead;
    ctx.lineWidth = S * 0.026;
    ctx.stroke();
  }
  wedge(ctx, cx, cy, 0, 0.075, Math.PI, Math.PI * 2, shade(tints[0], 1.7), lead);
}
