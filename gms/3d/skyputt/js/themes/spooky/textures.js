// Spooky Hollow theme — procedural canvas textures (no downloaded assets).
// Same UV conventions as Sky Isles: floor u = lateral m, v = along m; walls u = along m, v = up m;
// trim u = along m, v 0..1 across the band.
import { makeCanvas, paintPixels, toTexture, fbm3, noise3, rng } from './util.js';

const clamp255 = v => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

/** Putting green at night: mossy green with a faint purple cast, 1 m tile, two mowing stripes along v. */
export function grassTexture(size = 512) {
  const c = makeCanvas(size);
  const L = [92, 156, 78], D = [62, 118, 64], P = [96, 84, 118];
  paintPixels(c, (u, v, x, y) => {
    const band = smooth(-0.25, 0.25, Math.sin(v * Math.PI * 2));
    const n = noise3(x * 0.9, y * 0.35, 1, size * 0.9) * 0.6 + noise3(x * 0.25, y * 0.25, 7, size * 0.25) * 0.4;
    const blot = fbm3(u * 6, v * 6, 3, 3, 6);
    const moss = smooth(0.52, 0.7, fbm3(u * 4, v * 4, 9, 3, 4));
    const k = 0.8 + n * 0.3 + (blot - 0.5) * 0.16;
    let col = mix3(L, D, band);
    col = mix3(col, P, 0.14 + moss * 0.16);
    return [clamp255(col[0] * k), clamp255(col[1] * k), clamp255(col[2] * k)];
  });
  return toTexture(c);
}

/** Fringe: darker moss with fallen leaves. */
export function fringeTexture(size = 256) {
  const c = makeCanvas(size);
  const r = rng(12);
  const g = paintPixels(c, (u, v, x, y) => {
    const n = noise3(x * 1.1, y * 1.1, 2, size * 1.1);
    const b = fbm3(u * 8, v * 8, 5, 3, 8);
    const k = 0.6 + n * 0.45 + (b - 0.5) * 0.3;
    return [clamp255(52 * k), clamp255(86 * k), clamp255(52 * k)];
  });
  for (let i = 0; i < 70; i++) {
    const x = r() * size, y = r() * size, s = size * (0.012 + r() * 0.014);
    const hue = r();
    g.fillStyle = hue < 0.5 ? `rgba(${150 + r() * 60 | 0},${60 + r() * 40 | 0},20,0.85)` : `rgba(${110 + r() * 40 | 0},${40 + r() * 20 | 0},${30 + r() * 20 | 0},0.8)`;
    g.save(); g.translate(x, y); g.rotate(r() * 6.28); g.beginPath(); g.ellipse(0, 0, s, s * 0.5, 0, 0, Math.PI * 2); g.fill(); g.restore();
  }
  return toTexture(c);
}

/** Old stone blocks, purple-grey with moss in the mortar: spans 1 m (u) × 0.5 m (v). */
export function stoneBlockTexture(w = 512, h = 256, seed = 11) {
  const c = makeCanvas(w, h);
  const r = rng(seed);
  const rows = 4, blocks = [];
  for (let j = 0; j < rows; j++) {
    let x = j % 2 ? -0.16 : 0;
    const row = [];
    while (x < 1) { const bw = 0.2 + r() * 0.22; row.push({ x0: x, x1: Math.min(1, x + bw), t: r(), m: r() }); x += bw; }
    row[row.length - 1].x1 = 1 + (j % 2 ? 0.16 : 0);
    blocks.push(row);
  }
  paintPixels(c, (u, v) => {
    const j = Math.min(rows - 1, Math.floor(v * rows));
    const fv = v * rows - j;
    let blk = blocks[j][0], fu = 0;
    for (const b of blocks[j]) {
      const uu = u < b.x0 ? u + 1 : u;
      if (uu >= b.x0 && uu < b.x1) { blk = b; fu = Math.min(uu - b.x0, b.x1 - uu); break; }
    }
    const edge = Math.min(fu * 9, fv, 1 - fv);
    const mortar = smooth(0.0, 0.08, edge);
    const n = fbm3(u * 14, v * 7, seed, 4, 14);
    const tone = 0.8 + blk.t * 0.26 + (n - 0.5) * 0.4;
    const bevel = 1 - (1 - smooth(0.0, 0.18, edge)) * 0.3;
    const base = mix3([118, 106, 128], [104, 104, 112], blk.m);
    const mossy = smooth(0.55, 0.8, fbm3(u * 5, v * 3, seed + 3, 3, 5)) * (1 - mortar * 0.6);
    let col = base.map(x => x * tone * bevel);
    col = mix3(col, [58, 84, 52], mossy * 0.55);
    const m = [34, 40, 34];
    return [0, 1, 2].map(i => clamp255(mix(m[i], col[i], mortar)));
  });
  return toTexture(c);
}

/** Slate cap: cool grey with fine cracks. */
export function slateTexture(size = 256) {
  const c = makeCanvas(size);
  paintPixels(c, (u, v) => {
    const n = fbm3(u * 6, v * 6, 21, 4, 6);
    const cr = 1 - smooth(0.0, 0.02, Math.abs(fbm3(u * 5, v * 5, 23, 3, 5) - 0.5));
    const k = 0.85 + (n - 0.5) * 0.3 - cr * 0.35;
    return [clamp255(150 * k), clamp255(144 * k), clamp255(160 * k)];
  });
  return toTexture(c);
}

/**
 * Ember trim: dark iron band (map) and glowing ember segments (emissive), u along metres, v across.
 * Four segments per metre, each with a hot core and cooler ends.
 */
export function emberTrimTextures(w = 256, h = 32) {
  const cm = makeCanvas(w, h), ce = makeCanvas(w, h);
  paintPixels(cm, (u, v) => {
    const n = fbm3(u * 16, v * 2, 5, 3, 16);
    const k = 0.7 + n * 0.5;
    return [clamp255(58 * k), clamp255(40 * k), clamp255(36 * k)];
  });
  paintPixels(ce, (u, v) => {
    const seg = (u * 4) % 1;
    const along = smooth(0.05, 0.2, seg) * smooth(0.95, 0.8, seg);
    const across = smooth(0.08, 0.35, v) * smooth(0.92, 0.65, v);
    const flick = 0.75 + 0.25 * noise3(u * 40, 0, 3, 40);
    const k = along * across * flick;
    return [clamp255(255 * Math.min(1, k * 1.2)), clamp255(170 * k * k + 40 * k), clamp255(40 * k * k * k)];
  });
  return { map: toTexture(cm), emissive: toTexture(ce) };
}

/** Basalt: dark purple-grey crags. */
export function rockTexture(size = 256) {
  const c = makeCanvas(size);
  paintPixels(c, (u, v) => {
    const n = fbm3(u * 8, v * 8, 31, 5, 8);
    const big = fbm3(u * 3, v * 3, 33, 3, 3);
    const strata = 0.5 + 0.5 * Math.sin((v * 7 + big * 1.5) * Math.PI * 2);
    const ridge = 1 - Math.abs(fbm3(u * 10, v * 10, 37, 3, 10) * 2 - 1);
    const crev = smooth(0.86, 0.98, ridge) * 0.6;
    const k = (0.7 + n * 0.45 + strata * 0.08 + (big - 0.5) * 0.3) * (1 - crev * 0.4);
    return [clamp255(122 * k), clamp255(110 * k), clamp255(132 * k)];
  });
  return toTexture(c);
}

/** Lava cracks: thin glowing lines (R) and a large-scale mask of where they glow (G); tiles in both axes. */
export function crackTexture(size = 256) {
  const c = makeCanvas(size);
  paintPixels(c, (u, v) => {
    const a = Math.abs(fbm3(u * 5, v * 5, 41, 4, 5) - 0.5);
    const b = Math.abs(fbm3(u * 9, v * 9, 47, 3, 9) - 0.5);
    const line = 1 - smooth(0.0, 0.03, a);
    const fine = (1 - smooth(0.0, 0.018, b)) * 0.55;
    const k = clamp255(Math.max(line, fine) * 255);
    const mask = clamp255(smooth(0.42, 0.66, fbm3(u * 2, v * 2, 49, 3, 2)) * 255);
    return [k, mask, 0];
  });
  return toTexture(c, { srgb: false });
}

/** Grave dirt (sand traps): dark loam with pebbles. */
export function dirtTexture(size = 256) {
  const c = makeCanvas(size);
  paintPixels(c, (u, v, x, y) => {
    const g = noise3(x * 1.7, y * 1.7, 41, size * 1.7);
    const peb = smooth(0.72, 0.78, noise3(x * 0.4, y * 0.4, 44, size * 0.4));
    const k = 0.8 + g * 0.25;
    return [clamp255((112 + peb * 50) * k), clamp255((92 + peb * 46) * k), clamp255((84 + peb * 52) * k)];
  });
  return toTexture(c);
}

/** Weathered dark planks across u (0.125 m each), 1 m tile. */
export function woodTexture(size = 256) {
  const c = makeCanvas(size);
  paintPixels(c, (u, v) => {
    const j = Math.floor(v * 8), fv = v * 8 - j;
    const grain = fbm3(u * 3 + j * 7.3, v * 60, 51, 3, 0);
    const ring = 0.5 + 0.5 * Math.sin((grain * 9 + u * 2) * Math.PI);
    const gap = smooth(0.0, 0.07, Math.min(fv, 1 - fv));
    const t = Math.abs((Math.sin(j * 12.9898) * 43758.5453) % 1);
    const k = (0.7 + t * 0.3 + ring * 0.12) * (0.3 + gap * 0.7);
    return [clamp255(118 * k), clamp255(92 * k), clamp255(74 * k)];
  });
  return toTexture(c);
}

/** Tileable greyscale noise (R). */
export function noiseTexture(size = 256, scale = 8, seed = 61, oct = 5) {
  const c = makeCanvas(size);
  paintPixels(c, (u, v) => {
    const n = fbm3(u * scale, v * scale, seed, oct, scale);
    const k = clamp255(n * 255);
    return [k, k, k];
  });
  return toTexture(c, { srgb: false });
}

/** Ghost ice: pale green-cyan with cracks. */
export function iceTexture(size = 256) {
  const c = makeCanvas(size);
  paintPixels(c, (u, v) => {
    const n = fbm3(u * 6, v * 6, 71, 4, 6);
    const cr = 1 - smooth(0.0, 0.025, Math.abs(fbm3(u * 4, v * 4, 73, 3, 4) - 0.5));
    const k = 0.85 + n * 0.2;
    return [clamp255(170 * k + cr * 70), clamp255(236 * k + cr * 19), clamp255(214 * k + cr * 30)];
  });
  return toTexture(c);
}

/** Boost pad emissive: glowing orange chevrons pointing +v, two per tile. */
export function chevronTexture(w = 128, h = 256) {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  for (let k = 0; k < 2; k++) {
    const y0 = k * h / 2;
    for (const [blur, width, col] of [[18, 16, 'rgba(255,110,20,0.55)'], [6, 10, 'rgba(255,170,60,0.95)'], [0, 4, '#fff1c8']]) {
      g.save();
      g.shadowColor = '#f70'; g.shadowBlur = blur;
      g.strokeStyle = col; g.lineWidth = width; g.lineJoin = 'miter'; g.lineCap = 'butt';
      // the engine's boost u is lateral metres from the centre line (0 = middle), so the tip sits at
      // u = 0 and the arms wrap across the tile edge (drawn twice, at x = 0 and x = w)
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

/** Jack-o'-lantern face path in a unit box centred at (0,0), drawn into ctx g (canvas y down; the face's
 *  top is toward canvas -y). s = half-size in px. */
function drawFace(g, s) {
  // eyes
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.moveTo(sx * s * 0.62, -s * 0.12); g.lineTo(sx * s * 0.18, -s * 0.12); g.lineTo(sx * s * 0.42, -s * 0.62); g.closePath(); g.fill();
  }
  // nose
  g.beginPath(); g.moveTo(-s * 0.1, s * 0.12); g.lineTo(s * 0.1, s * 0.12); g.lineTo(0, -s * 0.06); g.closePath(); g.fill();
  // grin with teeth
  g.beginPath();
  g.moveTo(-s * 0.78, s * 0.22);
  g.quadraticCurveTo(0, s * 0.62, s * 0.78, s * 0.22);
  g.quadraticCurveTo(s * 0.5, s * 0.82, 0, s * 0.84);
  g.quadraticCurveTo(-s * 0.5, s * 0.82, -s * 0.78, s * 0.22);
  g.closePath(); g.fill();
  g.save(); g.globalCompositeOperation = 'destination-out';
  for (const tx of [-0.36, 0.2]) { g.fillRect(tx * s, s * 0.38, s * 0.16, s * 0.18); }
  g.fillRect(-0.1 * s, s * 0.66, s * 0.16, s * 0.2);
  g.restore();
}

/**
 * Tee pad: carved stone disc (map) + glowing jack-o'-lantern face inside a ring (emissive).
 * The face's top points to texture +v (canvas -y).
 */
export function teePadTextures(size = 512) {
  const cm = makeCanvas(size), ce = makeCanvas(size);
  const R = size / 2;
  const g = cm.getContext('2d');
  g.translate(R, R);
  const grd = g.createRadialGradient(0, 0, 0, 0, 0, R);
  grd.addColorStop(0, '#4a4452'); grd.addColorStop(0.7, '#3a3542'); grd.addColorStop(1, '#2a2630');
  g.fillStyle = grd; g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
  const r = rng(5);
  // outer carved block ring
  for (let ring = 0; ring < 2; ring++) {
    const r0 = R * (0.66 + ring * 0.16), r1 = r0 + R * 0.16, n = 14 + ring * 6;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const l = 56 + r() * 26;
      g.fillStyle = `rgb(${l + 4},${l},${l + 10})`;
      g.beginPath(); g.arc(0, 0, r1 - 3, a0 + 0.012, a1 - 0.012); g.arc(0, 0, r0 + 3, a1 - 0.012, a0 + 0.012, true); g.closePath(); g.fill();
    }
  }
  // runes / notches between the rings
  g.strokeStyle = 'rgba(20,16,24,0.8)'; g.lineWidth = 3;
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2;
    g.beginPath(); g.moveTo(Math.cos(a) * R * 0.7, Math.sin(a) * R * 0.7); g.lineTo(Math.cos(a) * R * 0.78, Math.sin(a) * R * 0.78); g.stroke();
  }
  // inner disc: dark carved bowl
  const ig = g.createRadialGradient(0, 0, 0, 0, 0, R * 0.62);
  ig.addColorStop(0, '#2b2018'); ig.addColorStop(1, '#1c1418');
  g.fillStyle = ig; g.beginPath(); g.arc(0, 0, R * 0.62, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#5a4a3a'; g.lineWidth = 4;
  g.beginPath(); g.arc(0, 0, R * 0.62, 0, Math.PI * 2); g.stroke();
  // carved face in the map (dark), lit by the emissive copy
  g.fillStyle = '#120806';
  drawFace(g, R * 0.48);

  const e = ce.getContext('2d');
  e.fillStyle = '#000'; e.fillRect(0, 0, size, size);
  e.translate(R, R);
  e.shadowColor = '#ff7a10'; e.shadowBlur = size * 0.03;
  e.fillStyle = '#ffae3a';
  drawFace(e, R * 0.48);
  e.shadowBlur = size * 0.02;
  e.strokeStyle = '#ff8a1c'; e.lineWidth = size * 0.014;
  e.beginPath(); e.arc(0, 0, R * 0.6, 0, Math.PI * 2); e.stroke();
  e.strokeStyle = 'rgba(255,120,30,0.5)'; e.lineWidth = size * 0.006;
  e.beginPath(); e.arc(0, 0, R * 0.965, 0, Math.PI * 2); e.stroke();
  return { map: toTexture(cm, { repeat: false }), emissive: toTexture(ce, { repeat: false }) };
}

/** Pumpkin face decal (white on transparent) for the pickup and big pumpkins. */
export function faceTexture(size = 128) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  g.translate(size / 2, size / 2);
  g.shadowColor = '#fff'; g.shadowBlur = size * 0.04;
  g.fillStyle = '#fff';
  drawFace(g, size * 0.42);
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

/** Fog wisp atlas 2×2: long soft streaks. */
export function wispAtlasTexture(size = 256) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const cell = size / 2;
  const r = rng(78);
  for (let k = 0; k < 4; k++) {
    const ox = (k % 2) * cell, oy = Math.floor(k / 2) * cell;
    g.save(); g.beginPath(); g.rect(ox, oy, cell, cell); g.clip();
    for (let i = 0; i < 16; i++) {
      const t = i / 15;
      const x = ox + cell * (0.12 + t * 0.76), y = oy + cell * (0.5 + Math.sin(t * 5 + k) * 0.08 + (r() - 0.5) * 0.08);
      const rx = cell * (0.1 + Math.sin(t * Math.PI) * 0.12), ry = rx * 0.45;
      const grd = g.createRadialGradient(x, y, 0, x, y, rx);
      grd.addColorStop(0, 'rgba(255,255,255,0.32)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.save(); g.translate(x, y); g.scale(1, ry / rx); g.beginPath(); g.arc(0, 0, rx, 0, Math.PI * 2); g.restore(); g.fill();
    }
    g.restore();
  }
  return toTexture(c, { repeat: false });
}

/** Bat atlas: left half wings up, right half wings down (black silhouettes, alpha). */
export function batTexture(w = 128, h = 64) {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  const half = w / 2;
  for (const [ox, up] of [[0, 1], [half, -1]]) {
    g.save(); g.translate(ox + half / 2, h / 2);
    g.fillStyle = '#0b0710';
    // body + head + ears
    g.beginPath(); g.ellipse(0, 3, 4, 8, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(0, -6, 4, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(-4, -8); g.lineTo(-3, -14); g.lineTo(-1, -9); g.moveTo(4, -8); g.lineTo(3, -14); g.lineTo(1, -9); g.fill();
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(s * 3, -2);
      const tipY = -18 * up, midY = -8 * up;
      g.quadraticCurveTo(s * 14, midY - 4 * up, s * 29, tipY);
      // scalloped trailing edge
      g.quadraticCurveTo(s * 25, tipY + 10, s * 21, midY + 9);
      g.quadraticCurveTo(s * 16, midY + 4, s * 13, midY + 11);
      g.quadraticCurveTo(s * 8, midY + 6, s * 3, 6);
      g.closePath(); g.fill();
    }
    // tiny glowing eyes
    g.fillStyle = '#ff9a3a';
    g.fillRect(-2.6, -7, 1.6, 1.4); g.fillRect(1, -7, 1.6, 1.4);
    g.restore();
  }
  return toTexture(c, { repeat: false });
}

/** Lava fall streaks (tiles in v): orange-yellow with dark crust streaks. */
export function lavaTexture(w = 64, h = 256) {
  const c = makeCanvas(w, h);
  paintPixels(c, (u, v, x, y) => {
    const f = (yy) => noise3(x * 0.35, yy * 0.03, 81, 0) * 0.7 + noise3(x * 0.9, yy * 0.08, 83, 0) * 0.3;
    const t = y / h;
    const n = f(y) * (1 - t) + f(y - h) * t;
    const hot = smooth(0.3, 0.8, n);
    const crust = smooth(0.32, 0.18, n);
    return [clamp255(mix(255, 120, crust)), clamp255(mix(90 + hot * 150, 30, crust)), clamp255(mix(10 + hot * 60, 10, crust)), clamp255(200 + hot * 55)];
  });
  return toTexture(c);
}

/** Vertical fade (alpha 1 at v=1 → 0 at v=0). */
export function fadeTexture(size = 64) {
  const c = makeCanvas(4, size);
  paintPixels(c, (u, v) => { const k = clamp255(Math.pow(1 - v, 1.4) * 255); return [k, k, k]; });
  return toTexture(c, { repeat: false, srgb: false });
}

/** Lightning bolt with branches (white/violet glow on transparent), tall texture. */
export function boltTexture(w = 128, h = 512, seed = 3) {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  const r = rng(seed);
  const strokeBolt = (x, y, len, ang, width, depth) => {
    const pts = [[x, y]];
    let cx = x, cy = y;
    const n = 10;
    for (let i = 0; i < n; i++) {
      cx += Math.sin(ang) * len / n + (r() - 0.5) * w * 0.14;
      cy += Math.cos(ang) * len / n;
      pts.push([cx, cy]);
      if (depth < 2 && r() < 0.18) strokeBolt(cx, cy, len * 0.4, ang + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.5), width * 0.55, depth + 1);
    }
    for (const [blur, lw, col] of [[16, width * 3, 'rgba(170,140,255,0.5)'], [6, width * 1.6, 'rgba(210,200,255,0.9)'], [0, width * 0.7, '#ffffff']]) {
      g.save(); g.shadowColor = '#a9f'; g.shadowBlur = blur; g.strokeStyle = col; g.lineWidth = lw; g.lineJoin = 'round';
      g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke(); g.restore();
    }
  };
  strokeBolt(w * 0.5, 0, h * 0.98, 0, 4, 0);
  return toTexture(c, { repeat: false });
}

/** Tattered flag cloth: red with dark stains (rgb) and ragged edge + holes (alpha). u along the cloth (0 at the pole). */
export function flagTexture(w = 128, h = 96) {
  const c = makeCanvas(w, h);
  paintPixels(c, (u, v, x, y) => {
    const n = fbm3(u * 6, v * 5, 91, 3, 0);
    const stain = smooth(0.55, 0.75, fbm3(u * 3, v * 3, 95, 3, 0));
    const k = 0.75 + n * 0.4;
    // ragged fly end: deeper notches toward u = 1
    const edge = 0.8 + noise3(0, y * 0.18, 97, 0) * 0.22 - smooth(0.25, 0.0, Math.abs(((v * 3) % 1) - 0.5)) * 0.18;
    const hole = smooth(0.74, 0.78, fbm3(u * 7, v * 7, 99, 3, 0)) * smooth(0.2, 0.4, u);
    const top = v > 0.03 && v < 0.97 ? 1 : 0;
    const a = (u < edge ? 1 : 0) * (1 - hole) * top;
    return [clamp255(mix(196, 80, stain) * k), clamp255(mix(30, 14, stain) * k), clamp255(mix(36, 20, stain) * k), a * 255];
  });
  return toTexture(c, { repeat: false });
}
