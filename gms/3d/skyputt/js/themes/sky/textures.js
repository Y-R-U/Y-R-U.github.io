// Sky Isles theme — procedural canvas textures (no downloaded assets).
// Floor/wall textures assume UVs in metres (see docs/notes/sky.md "UV conventions").
import { makeCanvas, paintPixels, toTexture, fbm3, noise3, rng } from './util.js';

const clamp255 = v => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/** Putting green: 1 m tile, two mowing stripes along v (0.5 m each), fine blade noise. */
export function grassTexture(size = 512) {
  const c = makeCanvas(size);
  const L = [96, 176, 58], D = [62, 138, 40];
  paintPixels(c, (u, v, x, y) => {
    const band = smooth(-0.25, 0.25, Math.sin(v * Math.PI * 2));
    const n = noise3(x * 0.9, y * 0.35, 1, size * 0.9) * 0.6 + noise3(x * 0.25, y * 0.25, 7, size * 0.25) * 0.4;
    const blot = fbm3(u * 6, v * 6, 3, 3, 6);
    const k = 0.78 + n * 0.32 + (blot - 0.5) * 0.18;
    return [clamp255(mix(L[0], D[0], band) * k), clamp255(mix(L[1], D[1], band) * k), clamp255(mix(L[2], D[2], band) * k * 0.95)];
  });
  return toTexture(c);
}

/** Fringe / rough: coarser, darker, no stripes. */
export function fringeTexture(size = 256) {
  const c = makeCanvas(size);
  paintPixels(c, (u, v, x, y) => {
    const n = noise3(x * 1.1, y * 1.1, 2, size * 1.1);
    const b = fbm3(u * 8, v * 8, 5, 3, 8);
    const k = 0.6 + n * 0.45 + (b - 0.5) * 0.3;
    return [clamp255(52 * k), clamp255(112 * k), clamp255(34 * k)];
  });
  return toTexture(c);
}

/** Stone blocks: texture spans 1 m (u) × 0.5 m (v); rows 0.125 m, blocks 0.25–0.45 m. */
export function stoneBlockTexture(w = 512, h = 256, seed = 11) {
  const c = makeCanvas(w, h);
  const r = rng(seed);
  const rows = 4, blocks = [];
  for (let j = 0; j < rows; j++) {
    let x = j % 2 ? -0.18 : 0;
    const row = [];
    while (x < 1) { const bw = 0.24 + r() * 0.2; row.push({ x0: x, x1: Math.min(1, x + bw), t: r() }); x += bw; }
    row[row.length - 1].x1 = 1 + (j % 2 ? 0.18 : 0); // wrap seam
    blocks.push(row);
  }
  paintPixels(c, (u, v, x, y) => {
    const j = Math.min(rows - 1, Math.floor(v * rows));
    const fv = v * rows - j;
    let blk = blocks[j][0], fu = 0;
    for (const b of blocks[j]) {
      const uu = u < b.x0 ? u + 1 : u;
      if (uu >= b.x0 && uu < b.x1) { blk = b; fu = Math.min(uu - b.x0, b.x1 - uu); break; }
    }
    const edge = Math.min(fu * 9, fv, 1 - fv) ;
    const mortar = smooth(0.0, 0.07, edge);
    const n = fbm3(u * 14, v * 7, seed, 4, 14);
    const tone = 0.82 + blk.t * 0.22 + (n - 0.5) * 0.35;
    const bevel = 1 - (1 - smooth(0.0, 0.16, edge)) * 0.25;
    const base = [168, 152, 132];
    const m = [92, 84, 76];
    return [0, 1, 2].map(i => clamp255(mix(m[i], base[i] * tone * bevel, mortar)));
  });
  return toTexture(c);
}

/** Polished stone cap: light warm marble with veins. */
export function marbleTexture(size = 256) {
  const c = makeCanvas(size);
  paintPixels(c, (u, v) => {
    const n = fbm3(u * 6, v * 6, 21, 4, 6);
    const vein = Math.abs(Math.sin((u * 6 + n * 5) * Math.PI));
    const vv = Math.pow(1 - vein, 14) * 0.35;
    const k = 0.9 + (n - 0.5) * 0.2 - vv;
    return [clamp255(222 * k), clamp255(212 * k), clamp255(196 * k)];
  });
  return toTexture(c);
}

/** Rock: warm grey strata with crag noise; tiles in both axes. */
export function rockTexture(size = 256) {
  const c = makeCanvas(size);
  paintPixels(c, (u, v) => {
    const n = fbm3(u * 8, v * 8, 31, 5, 8);
    const big = fbm3(u * 3, v * 3, 33, 3, 3);
    const strata = 0.5 + 0.5 * Math.sin((v * 7 + big * 1.5) * Math.PI * 2);
    const ridge = 1 - Math.abs(fbm3(u * 10, v * 10, 37, 3, 10) * 2 - 1);
    const crev = smooth(0.86, 0.98, ridge) * 0.6;
    const k = (0.72 + n * 0.42 + strata * 0.08 + (big - 0.5) * 0.3) * (1 - crev * 0.35);
    return [clamp255(178 * k), clamp255(166 * k), clamp255(156 * k)];
  });
  return toTexture(c);
}

/** Sand: warm beige, grain noise and soft rake lines. */
export function sandTexture(size = 256) {
  const c = makeCanvas(size);
  paintPixels(c, (u, v, x, y) => {
    const g = noise3(x * 1.7, y * 1.7, 41, size * 1.7);
    const rake = 0.5 + 0.5 * Math.sin((v * 12 + fbm3(u * 3, v * 3, 43, 2, 3) * 1.5) * Math.PI * 2);
    const k = 0.85 + g * 0.2 + rake * 0.06;
    return [clamp255(232 * k), clamp255(204 * k), clamp255(150 * k)];
  });
  return toTexture(c);
}

/** Wooden planks across u (each plank 0.125 m along v), 1 m tile. */
export function woodTexture(size = 256) {
  const c = makeCanvas(size);
  paintPixels(c, (u, v) => {
    const j = Math.floor(v * 8), fv = v * 8 - j;
    const grain = fbm3(u * 3 + j * 7.3, v * 60, 51, 3, 0);
    const ring = 0.5 + 0.5 * Math.sin((grain * 9 + u * 2) * Math.PI);
    const gap = smooth(0.0, 0.06, Math.min(fv, 1 - fv));
    const t = (Math.sin(j * 12.9898) * 43758.5453) % 1;
    const k = (0.75 + Math.abs(t) * 0.25 + ring * 0.12) * (0.35 + gap * 0.65);
    return [clamp255(150 * k), clamp255(98 * k), clamp255(56 * k)];
  });
  return toTexture(c);
}

/** Tileable greyscale noise for water / ice normal-ish detail and the cloud sea (R channel). */
export function noiseTexture(size = 256, scale = 8, seed = 61, oct = 5) {
  const c = makeCanvas(size);
  paintPixels(c, (u, v) => {
    const n = fbm3(u * scale, v * scale, seed, oct, scale);
    const k = clamp255(n * 255);
    return [k, k, k];
  });
  return toTexture(c, { srgb: false });
}

/** Ice: pale cyan with white cracks. */
export function iceTexture(size = 256) {
  const c = makeCanvas(size);
  paintPixels(c, (u, v) => {
    const n = fbm3(u * 6, v * 6, 71, 4, 6);
    const cr = 1 - smooth(0.0, 0.025, Math.abs(fbm3(u * 4, v * 4, 73, 3, 4) - 0.5));
    const k = 0.85 + n * 0.2;
    return [clamp255(190 * k + cr * 70), clamp255(232 * k + cr * 30), clamp255(250 * k + cr * 10)];
  });
  return toTexture(c);
}

/** Boost pad emissive: glowing cyan chevrons pointing +v, one chevron per 0.5 of v. */
export function chevronTexture(w = 128, h = 256) {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  for (let k = 0; k < 2; k++) {
    const y0 = k * h / 2;
    for (const [blur, width, col] of [[18, 16, 'rgba(40,200,255,0.55)'], [6, 10, 'rgba(120,235,255,0.95)'], [0, 4, '#eaffff']]) {
      g.save();
      g.shadowColor = '#3cf'; g.shadowBlur = blur;
      g.strokeStyle = col; g.lineWidth = width; g.lineJoin = 'miter'; g.lineCap = 'butt';
      g.beginPath();
      // canvas y grows downward; texture v grows upward (flipY) — chevron tip toward canvas top = +v
      g.moveTo(w * 0.12, y0 + h * 0.36);
      g.lineTo(w * 0.5, y0 + h * 0.14);
      g.lineTo(w * 0.88, y0 + h * 0.36);
      g.stroke();
      g.restore();
    }
  }
  return toTexture(c);
}

/** Tee pad top: dark polished stone rings, gold inlay, compass star toward +v. */
export function teePadTexture(size = 512) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const R = size / 2;
  g.translate(R, R);
  // stone base with tile segments
  const grd = g.createRadialGradient(0, 0, 0, 0, 0, R);
  grd.addColorStop(0, '#3b4150'); grd.addColorStop(0.7, '#2c303b'); grd.addColorStop(1, '#22252d');
  g.fillStyle = grd; g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
  const r = rng(5);
  for (let ring = 0; ring < 3; ring++) {
    const r0 = R * (0.42 + ring * 0.19), r1 = r0 + R * 0.19, n = 10 + ring * 6;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const l = 40 + r() * 22;
      g.fillStyle = `rgb(${l},${l + 4},${l + 14})`;
      g.beginPath(); g.arc(0, 0, r1 - 3, a0 + 0.01, a1 - 0.01); g.arc(0, 0, r0 + 3, a1 - 0.01, a0 + 0.01, true); g.closePath(); g.fill();
    }
  }
  // gold rings + radial inlays
  const gold = (wd, blur = 6) => { g.strokeStyle = '#f3c55b'; g.lineWidth = wd; g.shadowColor = '#ffcf6a'; g.shadowBlur = blur; };
  gold(5); g.beginPath(); g.arc(0, 0, R * 0.42, 0, Math.PI * 2); g.stroke();
  gold(3); g.beginPath(); g.arc(0, 0, R * 0.80, 0, Math.PI * 2); g.stroke();
  gold(7); g.beginPath(); g.arc(0, 0, R * 0.97, 0, Math.PI * 2); g.stroke();
  gold(3);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + Math.PI / 8;
    g.beginPath(); g.moveTo(Math.cos(a) * R * 0.44, Math.sin(a) * R * 0.44); g.lineTo(Math.cos(a) * R * 0.95, Math.sin(a) * R * 0.95); g.stroke();
  }
  // compass star at the front (canvas -y = texture +v)
  g.shadowBlur = 8; g.fillStyle = '#f6d27a';
  g.save(); g.translate(0, -R * 0.885);
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2, rr = i % 2 ? R * 0.025 : R * 0.075;
    g.lineTo(Math.cos(a - Math.PI / 2) * rr, Math.sin(a - Math.PI / 2) * rr);
  }
  g.closePath(); g.fill(); g.restore();
  // inner disc (under the glowing ring) slightly lighter, blue tint
  const ig = g.createRadialGradient(0, 0, 0, 0, 0, R * 0.4);
  ig.addColorStop(0, '#2a3d63'); ig.addColorStop(1, '#1b2338');
  g.shadowBlur = 0; g.fillStyle = ig; g.beginPath(); g.arc(0, 0, R * 0.40, 0, Math.PI * 2); g.fill();
  return toTexture(c, { repeat: false });
}

/** Soft radial glow (white, alpha falloff). */
export function glowTexture(size = 64) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  return toTexture(c, { repeat: false, srgb: false });
}

/**
 * Cloud atlas 2×2: four puffy clouds, lit warm from upper-left, lavender shade below.
 * Returns the texture; atlas cells are (0..0.5, 0..0.5) etc.
 */
export function cloudAtlasTexture(size = 512) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const cell = size / 2;
  const r = rng(77);
  for (let k = 0; k < 4; k++) {
    const ox = (k % 2) * cell, oy = Math.floor(k / 2) * cell;
    const puffs = [];
    const n = 14 + (r() * 8 | 0);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const x = cell * (0.18 + t * 0.64 + (r() - 0.5) * 0.08);
      const hump = Math.sin(t * Math.PI);
      const y = cell * (0.66 - hump * (0.14 + r() * 0.14));
      const rad = cell * (0.09 + hump * 0.12 + r() * 0.05);
      puffs.push([x, y, rad]);
    }
    const blob = (dx, dy, sc, col) => {
      for (const [x, y, rad] of puffs) {
        const grd = g.createRadialGradient(ox + x + dx, oy + y + dy, 0, ox + x + dx, oy + y + dy, rad * sc);
        grd.addColorStop(0, col); grd.addColorStop(0.45, col.replace(/[\d.]+\)$/, '0.55)')); grd.addColorStop(1, col.replace(/[\d.]+\)$/, '0)'));
        g.fillStyle = grd; g.beginPath(); g.arc(ox + x + dx, oy + y + dy, rad * sc, 0, Math.PI * 2); g.fill();
      }
    };
    g.save(); g.beginPath(); g.rect(ox, oy, cell, cell); g.clip();
    blob(0, cell * 0.03, 1.2, 'rgba(196,186,226,0.7)');    // soft shade
    blob(0, 0, 1.0, 'rgba(240,234,248,0.75)');            // body
    blob(-cell * 0.03, -cell * 0.045, 0.75, 'rgba(255,244,228,0.8)'); // warm highlight
    g.restore();
  }
  return toTexture(c, { repeat: false });
}

/** Waterfall streaks (tiles in v): white vertical streaks with alpha. */
export function waterfallTexture(w = 64, h = 256) {
  const c = makeCanvas(w, h);
  paintPixels(c, (u, v, x, y) => {
    const s = noise3(x * 0.35, y * 0.03, 81, 0) * 0.7 + noise3(x * 0.9, y * 0.08, 83, 0) * 0.3;
    const wrapS = (yy) => noise3(x * 0.35, yy * 0.03, 81, 0) * 0.7 + noise3(x * 0.9, yy * 0.08, 83, 0) * 0.3;
    // crossfade to make it tile in v
    const t = y / h;
    const n = s * (1 - t) + wrapS(y - h) * t;
    const a = smooth(0.35, 0.85, n);
    const k = 200 + a * 55;
    return [clamp255(k * 0.9), clamp255(k * 0.96), 255, clamp255(140 + a * 115)];
  });
  return toTexture(c, { srgb: true });
}

/** Soft vertical gradient (alpha 1 at v=1 → 0 at v=0), used for fades. */
export function fadeTexture(size = 64) {
  const c = makeCanvas(4, size);
  paintPixels(c, (u, v) => { const k = clamp255(Math.pow(1 - v, 1.4) * 255); return [k, k, k]; });
  return toTexture(c, { repeat: false, srgb: false });
}

/** Leaf/fern card: a few drooping fronds on transparent background. */
export function fernTexture(size = 128) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const r = rng(91);
  for (let f = 0; f < 7; f++) {
    const a = -Math.PI / 2 + (f - 3) * 0.38 + (r() - 0.5) * 0.15;
    const len = size * (0.36 + r() * 0.12);
    const cx = size / 2, cy = size * 0.98;
    const tone = 70 + r() * 50;
    g.strokeStyle = `rgb(${tone * 0.5},${tone + 40},${tone * 0.35})`;
    g.fillStyle = `rgb(${tone * 0.55},${tone + 60},${tone * 0.4})`;
    g.lineWidth = 2;
    let px = cx, py = cy;
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const bend = a + t * t * 0.9 * Math.sign(Math.cos(a) || 1);
      const x = cx + Math.cos(bend) * len * t, y = cy + Math.sin(bend) * len * t;
      g.beginPath(); g.moveTo(px, py); g.lineTo(x, y); g.stroke();
      const lw = (1 - t) * size * 0.07 + 2;
      for (const sd of [-1, 1]) {
        g.beginPath(); g.ellipse(x + Math.cos(bend + sd * 1.2) * lw * 0.6, y + Math.sin(bend + sd * 1.2) * lw * 0.6, lw, lw * 0.35, bend + sd * 1.0, 0, Math.PI * 2); g.fill();
      }
      px = x; py = y;
    }
  }
  return toTexture(c, { repeat: false });
}
