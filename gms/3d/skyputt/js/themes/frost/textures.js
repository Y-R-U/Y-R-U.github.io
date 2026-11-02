// Frost Fair theme — procedural canvas textures (no downloaded assets).
// UV conventions (as Sky Isles / Spooky): floor u = lateral m, v = along m; walls u = along m, v = up m;
// trim u = along m, v 0..1 across the band; boost u = lateral m from the pad centre (tip at u = 0).
import { makeCanvas, paintPixels, toTexture, fbm3, noise3, rng } from './util.js';

const clamp255 = v => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

/** Six-armed snowflake centred at (0,0) with arm length s, stroked with the current style. */
export function drawSnowflake(g, s, lw = Math.max(1, s * 0.09)) {
  g.save();
  g.lineWidth = lw; g.lineCap = 'round';
  for (let k = 0; k < 6; k++) {
    g.save(); g.rotate(k * Math.PI / 3);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -s); g.stroke();
    for (const [at, len] of [[0.42, 0.3], [0.68, 0.22]]) {
      g.beginPath();
      g.moveTo(-s * len, -s * (at + len * 0.75)); g.lineTo(0, -s * at); g.lineTo(s * len, -s * (at + len * 0.75));
      g.stroke();
    }
    g.restore();
  }
  g.beginPath(); g.arc(0, 0, s * 0.12, 0, Math.PI * 2); g.stroke();
  g.restore();
}

/**
 * Putting green with a light frost: a 2 m tile (material repeat 0.5), mowing stripes every 0.5 m along v,
 * frost speckle that gathers in patches, and three faint snowflake decals at different sizes.
 */
export function grassTexture(size = 512) {
  const c = makeCanvas(size);
  const L = [96, 184, 70], D = [70, 150, 60], F = [196, 226, 222];
  const g = paintPixels(c, (u, v, x, y) => {
    const band = smooth(-0.3, 0.3, Math.sin(v * Math.PI * 4));
    const n = noise3(x * 0.9, y * 0.35, 1, size * 0.9) * 0.6 + noise3(x * 0.25, y * 0.25, 7, size * 0.25) * 0.4;
    const blot = fbm3(u * 6, v * 6, 3, 3, 6);
    const frostPatch = smooth(0.48, 0.72, fbm3(u * 3, v * 3, 9, 3, 3));
    const speck = smooth(0.62, 0.8, noise3(x * 1.3, y * 1.3, 17, size * 1.3));
    const k = 0.82 + n * 0.26 + (blot - 0.5) * 0.14;
    let col = mix3(L, D, band).map(q => q * k);
    col = mix3(col, F, speck * (0.18 + frostPatch * 0.45) + frostPatch * 0.07);
    return [clamp255(col[0]), clamp255(col[1]), clamp255(col[2])];
  });
  // snowflake decals (faint, so the green stays readable)
  g.strokeStyle = 'rgba(236,248,255,0.34)';
  for (const [x, y, s, a] of [[0.27, 0.22, 0.085, 0.2], [0.74, 0.58, 0.06, 0.5], [0.3, 0.83, 0.045, 0.1]]) {
    g.save(); g.translate(x * size, y * size); g.rotate(a); drawSnowflake(g, s * size); g.restore();
  }
  return toTexture(c);
}

/** Fringe: frosty, snow-dusted grass beside the walls (1 m tile). */
export function fringeTexture(size = 256) {
  const c = makeCanvas(size);
  paintPixels(c, (u, v, x, y) => {
    const n = noise3(x * 1.1, y * 1.1, 2, size * 1.1);
    const b = fbm3(u * 8, v * 8, 5, 3, 8);
    const snow = smooth(0.42, 0.62, fbm3(u * 5, v * 5, 13, 3, 5));
    const k = 0.7 + n * 0.4 + (b - 0.5) * 0.3;
    const col = mix3([66 * k, 128 * k, 66 * k], [214 + n * 30, 230 + n * 20, 244], snow * 0.8);
    return [clamp255(col[0]), clamp255(col[1]), clamp255(col[2])];
  });
  return toTexture(c);
}

/** Candy-cane stripes: diagonal red / white with a thin red pinstripe, seamless in u and v (1 tile). */
export function candyTexture(size = 256) {
  const c = makeCanvas(size);
  paintPixels(c, (u, v) => {
    const s = ((u + v) * 2) % 1;
    const red = smooth(0.0, 0.02, s) * smooth(0.46, 0.44, s);
    const pin = smooth(0.6, 0.615, s) * smooth(0.665, 0.65, s);
    const r = Math.max(red, pin * 0.85);
    const sheen = 0.94 + 0.06 * Math.sin(v * Math.PI * 2);
    const col = mix3([248, 244, 240], [214, 22, 38], r).map(q => q * sheen);
    return [clamp255(col[0]), clamp255(col[1]), clamp255(col[2])];
  });
  return toTexture(c);
}

/** Packed snow: white with blue hollows and glinting crystals (1 m tile). */
export function snowTexture(size = 256, seed = 21) {
  const c = makeCanvas(size);
  paintPixels(c, (u, v, x, y) => {
    const n = fbm3(u * 6, v * 6, seed, 4, 6);
    const ripple = 0.5 + 0.5 * Math.sin((v * 5 + fbm3(u * 3, v * 3, seed + 2, 3, 3) * 2.2) * Math.PI * 2);
    const glint = noise3(x * 1.7, y * 1.7, seed + 5, size * 1.7) > 0.86 ? 1 : 0;
    const k = 0.86 + (n - 0.5) * 0.24 + ripple * 0.05;
    return [clamp255(222 * k + glint * 30), clamp255(232 * k + glint * 22), clamp255(250 * k + glint * 8)];
  });
  return toTexture(c);
}

/** Snow trap: a drift with deeper blue-grey shadows, so a white ball still reads on it. */
export function driftTexture(size = 256) {
  const c = makeCanvas(size);
  paintPixels(c, (u, v, x, y) => {
    const n = fbm3(u * 5, v * 5, 41, 4, 5);
    const ripple = 0.5 + 0.5 * Math.sin((u * 4 + v * 3 + fbm3(u * 2, v * 2, 43, 3, 2) * 3) * Math.PI * 2);
    const grain = noise3(x * 1.5, y * 1.5, 44, size * 1.5);
    const k = 0.78 + n * 0.18 + ripple * 0.08 + grain * 0.05;
    return [clamp255(176 * k), clamp255(192 * k), clamp255(224 * k)];
  });
  return toTexture(c);
}

/**
 * Fairy-light garland trim: dark pine garland (map) and coloured bulbs (emissive), u along metres
 * (8 bulbs per metre), v across the band. The material twinkles each bulb by its u index.
 */
export function lightsTrimTextures(w = 256, h = 32) {
  const cm = makeCanvas(w, h), ce = makeCanvas(w, h);
  paintPixels(cm, (u, v) => {
    const n = fbm3(u * 24, v * 3, 5, 3, 24);
    const needle = 0.5 + 0.5 * Math.sin((u * 96 + v * 3) * Math.PI * 2);
    const k = 0.55 + n * 0.5 + needle * 0.15;
    return [clamp255(30 * k), clamp255(88 * k), clamp255(54 * k)];
  });
  const COLS = [[255, 70, 60], [255, 196, 70], [90, 255, 130], [110, 170, 255]];
  paintPixels(ce, (u, v) => {
    const i = Math.floor(u * 8), f = u * 8 - i;
    const d = Math.hypot((f - 0.5) * 2.2, (v - 0.5) * 1.6);
    const core = smooth(0.62, 0.25, d), halo = smooth(1.0, 0.3, d) * 0.35;
    const cc = COLS[i % 4];
    const k = Math.min(1, core + halo);
    return [clamp255(cc[0] * k + 140 * core), clamp255(cc[1] * k + 120 * core), clamp255(cc[2] * k + 90 * core)];
  });
  // garland map also gets a pale bulb body so the bulbs read when not lit
  const g = cm.getContext('2d');
  for (let i = 0; i < 8; i++) {
    const cc = COLS[i % 4];
    g.fillStyle = `rgb(${cc[0]},${cc[1]},${cc[2]})`;
    g.beginPath(); g.ellipse((i + 0.5) / 8 * w, h / 2, w / 8 * 0.24, h * 0.3, 0, 0, Math.PI * 2); g.fill();
  }
  return { map: toTexture(cm), emissive: toTexture(ce) };
}

/** Island rock: cold blue-grey slate. */
export function rockTexture(size = 256) {
  const c = makeCanvas(size);
  paintPixels(c, (u, v) => {
    const n = fbm3(u * 8, v * 8, 31, 5, 8);
    const big = fbm3(u * 3, v * 3, 33, 3, 3);
    const strata = 0.5 + 0.5 * Math.sin((v * 6 + big * 1.6) * Math.PI * 2);
    const ridge = 1 - Math.abs(fbm3(u * 10, v * 10, 37, 3, 10) * 2 - 1);
    const crev = smooth(0.86, 0.98, ridge) * 0.6;
    const k = (0.72 + n * 0.42 + strata * 0.1 + (big - 0.5) * 0.3) * (1 - crev * 0.4);
    return [clamp255(128 * k), clamp255(136 * k), clamp255(160 * k)];
  });
  return toTexture(c);
}

/** Frozen pond / ice patch: pale cyan with white cracks. */
export function iceTexture(size = 256) {
  const c = makeCanvas(size);
  paintPixels(c, (u, v) => {
    const n = fbm3(u * 6, v * 6, 71, 4, 6);
    const cr = 1 - smooth(0.0, 0.022, Math.abs(fbm3(u * 4, v * 4, 73, 3, 4) - 0.5));
    const cr2 = (1 - smooth(0.0, 0.015, Math.abs(fbm3(u * 9, v * 9, 75, 3, 9) - 0.5))) * 0.5;
    const k = 0.82 + n * 0.22;
    const w = Math.max(cr, cr2);
    return [clamp255(168 * k + w * 80), clamp255(220 * k + w * 35), clamp255(246 * k + w * 9)];
  });
  return toTexture(c);
}

/** Snow-dusted planks across u (0.125 m each), 1 m tile. */
export function plankTexture(size = 256) {
  const c = makeCanvas(size);
  paintPixels(c, (u, v) => {
    const j = Math.floor(v * 8), fv = v * 8 - j;
    const grain = fbm3(u * 3 + j * 7.3, v * 60, 51, 3, 0);
    const ring = 0.5 + 0.5 * Math.sin((grain * 9 + u * 2) * Math.PI);
    const gap = smooth(0.0, 0.07, Math.min(fv, 1 - fv));
    const t = Math.abs((Math.sin(j * 12.9898) * 43758.5453) % 1);
    const k = (0.72 + t * 0.28 + ring * 0.12) * (0.32 + gap * 0.68);
    const snow = smooth(0.55, 0.75, fbm3(u * 6, v * 6, 53, 3, 6)) * gap;
    const col = mix3([150 * k, 100 * k, 66 * k], [226, 234, 248], snow * 0.85);
    return [clamp255(col[0]), clamp255(col[1]), clamp255(col[2])];
  });
  return toTexture(c);
}

/** Tileable greyscale noise (R). */
export function noiseTexture(size = 256, scale = 8, seed = 61, oct = 5) {
  const c = makeCanvas(size);
  paintPixels(c, (u, v) => {
    const k = clamp255(fbm3(u * scale, v * scale, seed, oct, scale) * 255);
    return [k, k, k];
  });
  return toTexture(c, { srgb: false });
}

/** Boost pad emissive: glowing ice-blue chevrons pointing +v, two per tile, tip at u = 0. */
export function chevronTexture(w = 128, h = 256) {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  for (let k = 0; k < 2; k++) {
    const y0 = k * h / 2;
    for (const [blur, width, col] of [[18, 18, 'rgba(40,170,255,0.55)'], [6, 11, 'rgba(110,220,255,0.95)'], [0, 4, '#eaffff']]) {
      g.save();
      g.shadowColor = '#3cf'; g.shadowBlur = blur;
      g.strokeStyle = col; g.lineWidth = width; g.lineJoin = 'miter'; g.lineCap = 'butt';
      for (const cx of [0, w]) {
        g.beginPath();
        g.moveTo(cx - w * 0.4, y0 + h * 0.36);
        g.lineTo(cx, y0 + h * 0.14);
        g.lineTo(cx + w * 0.4, y0 + h * 0.36);
        g.stroke();
      }
      g.restore();
    }
  }
  return toTexture(c);
}

/**
 * Tee pad: red enamel disc with a gold ring, notches and a big white snowflake (map) + glowing
 * snowflake and ring (emissive). One flake arm points to texture +v.
 */
export function teePadTextures(size = 512) {
  const cm = makeCanvas(size), ce = makeCanvas(size);
  const R = size / 2;
  const g = cm.getContext('2d');
  g.translate(R, R);
  const grd = g.createRadialGradient(0, 0, 0, 0, 0, R);
  grd.addColorStop(0, '#c41f2c'); grd.addColorStop(0.6, '#a8141f'); grd.addColorStop(1, '#7a0c14');
  g.fillStyle = grd; g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
  // gold outer band with notches
  g.strokeStyle = '#e8b84a'; g.lineWidth = R * 0.1;
  g.beginPath(); g.arc(0, 0, R * 0.9, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = '#8a5e1a'; g.lineWidth = 3;
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * Math.PI * 2;
    g.beginPath(); g.moveTo(Math.cos(a) * R * 0.85, Math.sin(a) * R * 0.85); g.lineTo(Math.cos(a) * R * 0.95, Math.sin(a) * R * 0.95); g.stroke();
  }
  g.strokeStyle = '#f2d27a'; g.lineWidth = R * 0.025;
  g.beginPath(); g.arc(0, 0, R * 0.74, 0, Math.PI * 2); g.stroke();
  // dotted inner ring
  g.fillStyle = '#ffe9b0';
  for (let i = 0; i < 36; i++) { const a = i / 36 * Math.PI * 2; g.beginPath(); g.arc(Math.cos(a) * R * 0.68, Math.sin(a) * R * 0.68, R * 0.012, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = '#ffffff';
  drawSnowflake(g, R * 0.56, R * 0.06);

  const e = ce.getContext('2d');
  e.fillStyle = '#000'; e.fillRect(0, 0, size, size);
  e.translate(R, R);
  e.shadowColor = '#bfe6ff'; e.shadowBlur = size * 0.03;
  e.strokeStyle = 'rgba(200,236,255,0.9)';
  drawSnowflake(e, R * 0.56, R * 0.05);
  e.shadowColor = '#ffcf6a'; e.shadowBlur = size * 0.02;
  e.strokeStyle = 'rgba(255,200,90,0.75)'; e.lineWidth = size * 0.01;
  e.beginPath(); e.arc(0, 0, R * 0.9, 0, Math.PI * 2); e.stroke();
  return { map: toTexture(cm, { repeat: false }), emissive: toTexture(ce, { repeat: false }) };
}

/** Flag cloth: red with a white snowflake and a gold hem. u along the cloth (0 at the pole). */
export function flagTexture(w = 128, h = 96) {
  const c = makeCanvas(w, h);
  const g = paintPixels(c, (u, v) => {
    const n = fbm3(u * 6, v * 5, 91, 3, 0);
    const k = 0.86 + n * 0.22;
    const hem = (v < 0.06 || v > 0.94 || u > 0.95) ? 1 : 0;
    return hem ? [232, 184, 74] : [clamp255(212 * k), clamp255(26 * k), clamp255(36 * k)];
  });
  g.strokeStyle = '#ffffff';
  g.save(); g.translate(w * 0.52, h * 0.5); drawSnowflake(g, h * 0.34, h * 0.05); g.restore();
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

/** Snowflake particle: a soft dot with a faint six-point glint (white, alpha). */
export function flakeTexture(size = 32) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.8)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  return toTexture(c, { repeat: false, srgb: false });
}

/** Cloud-bank atlas 2×2 for the sea of cloud below the islands (soft white puffs). */
export function cloudAtlasTexture(size = 256) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const cell = size / 2;
  const r = rng(78);
  for (let k = 0; k < 4; k++) {
    const ox = (k % 2) * cell, oy = Math.floor(k / 2) * cell;
    g.save(); g.beginPath(); g.rect(ox, oy, cell, cell); g.clip();
    for (let i = 0; i < 18; i++) {
      const t = i / 17;
      const x = ox + cell * (0.14 + t * 0.72), y = oy + cell * (0.58 - Math.sin(t * Math.PI) * 0.16 + (r() - 0.5) * 0.08);
      const rx = cell * (0.1 + Math.sin(t * Math.PI) * 0.13);
      const grd = g.createRadialGradient(x, y - rx * 0.2, 0, x, y, rx);
      grd.addColorStop(0, 'rgba(255,255,255,0.5)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.beginPath(); g.arc(x, y, rx, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }
  return toTexture(c, { repeat: false });
}

/** Frozen waterfall: vertical ice columns, blue-white with bright streaks (tiles in v). */
export function frozenFallTexture(w = 64, h = 256) {
  const c = makeCanvas(w, h);
  paintPixels(c, (u, v, x, y) => {
    const f = (yy) => noise3(x * 0.4, yy * 0.02, 81, 0) * 0.7 + noise3(x * 1.1, yy * 0.05, 83, 0) * 0.3;
    const t = y / h;
    const n = f(y) * (1 - t) + f(y - h) * t;
    const col = smooth(0.35, 0.75, n);
    const streak = smooth(0.7, 0.85, noise3(x * 0.9, 0, 85, w * 0.9));
    return [clamp255(150 + col * 70 + streak * 30), clamp255(200 + col * 45 + streak * 10), clamp255(238 + col * 17), clamp255(190 + col * 55)];
  });
  return toTexture(c);
}

/** Vertical fade (alpha 1 at v=1 → 0 at v=0). */
export function fadeTexture(size = 64) {
  const c = makeCanvas(4, size);
  paintPixels(c, (u, v) => { const k = clamp255(Math.pow(1 - v, 1.4) * 255); return [k, k, k]; });
  return toTexture(c, { repeat: false, srgb: false });
}
