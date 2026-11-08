// Star Station theme — procedural canvas textures (no downloaded assets).
// UV conventions (engine builder): floor u = world x m, v = world z m; walls u = along m, v = height m
// (0 at the floor, 0.12 at the top, -0.1 at the outer foot); wallTop u = along m, v 0..1 across;
// trim u = along m, v 0 (top of the 2.5 cm band) → 1 (bottom); boost u = lateral m from the pad centre.
import { makeCanvas, paintPixels, toTexture, fbm3, noise3, rng } from './util.js';

const clamp255 = v => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
// distance (0..0.5) to the nearest grid line of `n` cells per tile
const gridD = (u, n) => { const f = (u * n) % 1; return Math.min(f, 1 - f) / n; };

/** Scatter round specks over a canvas (wraps so it tiles). */
function specks(g, w, h, n, r0, r1, cols, seed, alpha = 1) {
  const r = rng(seed);
  g.save();
  g.globalAlpha = alpha;
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h, rad = r0 + r() * (r1 - r0);
    g.fillStyle = cols[(r() * cols.length) | 0];
    for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
      if (x + ox < -rad || x + ox > w + rad || y + oy < -rad || y + oy > h + rad) continue;
      g.beginPath(); g.arc(x + ox, y + oy, rad, 0, Math.PI * 2); g.fill();
    }
  }
  g.restore();
}

/**
 * Putting surface: 2 m tile (material repeat 0.5). A dense teal-green deck turf (green enough to read as
 * a green, mid-dark so the white ball pops), soft mowing stripes every 0.5 m, a faint hex weave.
 */
export function grassTexture(size = 512) {
  const c = makeCanvas(size);
  const L = [58, 142, 104], D = [46, 122, 90];
  const g = paintPixels(c, (u, v, x, y) => {
    const band = smooth(-0.3, 0.3, Math.sin(v * Math.PI * 4));
    const n = noise3(x * 0.9, y * 0.9, 1, size * 0.9) * 0.5 + noise3(x * 0.25, y * 0.25, 7, size * 0.25) * 0.5;
    const patch = fbm3(u * 4, v * 4, 3, 3, 4);
    const h1 = gridD(u, 32), h2 = gridD((u + v) % 1, 32), h3 = gridD((u - v + 1) % 1, 32);   // tileable triangle weave
    const hex = 1 - smooth(0.0, 0.0022, Math.min(h1, h2, h3));
    const k = 0.88 + n * 0.12 + (patch - 0.5) * 0.1 - hex * 0.05;
    return mix3(L, D, band).map(q => clamp255(q * k));
  });
  specks(g, size, size, Math.round(size * 0.05), size * 0.002, size * 0.004, ['#2c6a52', '#24604a'], 12, 0.5);
  return toTexture(c);
}

/** Fringe: dark grey anti-slip deck plate with a diamond tread and a thin teal line (1 m tile). */
export function fringeTexture(size = 256) {
  const c = makeCanvas(size);
  paintPixels(c, (u, v, x, y) => {
    const n = noise3(x * 0.6, y * 0.6, 2, size * 0.6);
    const a = gridD((u + v) % 1, 24), b = gridD((u - v + 1) % 1, 24);
    const tread = smooth(0.0, 0.006, Math.min(a, b));
    const seam = smooth(0.0, 0.006, Math.min(gridD(u, 2), gridD(v, 2)));
    const k = (0.8 + n * 0.2) * (0.86 + tread * 0.14) * (0.6 + seam * 0.4);
    return [clamp255(92 * k), clamp255(100 * k), clamp255(112 * k)];
  });
  return toTexture(c);
}

/**
 * Walls (0.25 m tile, material repeat 4): clean white hull panels with dark seams, rivets and a teal
 * accent stripe. Emissive = a few tiny indicator lights (teal / amber).
 */
export function wallTextures(size = 256) {
  const cm = makeCanvas(size), ce = makeCanvas(size);
  const g = paintPixels(cm, (u, v, x, y) => {
    const n = fbm3(u * 4, v * 4, 43, 3, 4);
    const seamU = smooth(0.0, 0.008, gridD(u, 2)), seamV = smooth(0.0, 0.008, gridD(v + 0.1, 2));
    const stripe = smooth(0.0, 0.01, Math.abs(((v + 0.4) % 0.5) - 0.25) - 0.04);
    const base = mix3([60, 170, 176], [226, 232, 238], stripe);
    const k = (0.9 + n * 0.1) * (0.55 + 0.45 * seamU * seamV);
    return base.map(q => clamp255(q * k));
  });
  // rivets along the seams
  g.fillStyle = 'rgba(120,130,140,0.9)';
  for (let i = 0; i < 2; i++) for (let j = 0; j < 8; j++) {
    const x = i * size / 2 + size * 0.03, y = (j + 0.5) * size / 8;
    g.beginPath(); g.arc(x, y, size * 0.007, 0, Math.PI * 2); g.fill();
  }
  const e = ce.getContext('2d');
  e.fillStyle = '#000'; e.fillRect(0, 0, size, size);
  specks(e, size, size, 6, size * 0.006, size * 0.009, ['#40f0e8', '#60fff0', '#ffb040'], 42, 1);
  return { map: toTexture(cm), emissive: toTexture(ce) };
}

/** Wall cap (512×128 = 0.5 m along): brushed grey-blue metal with panel joints and bevelled edges. */
export function capTexture(w = 512, h = 128) {
  const c = makeCanvas(w, h);
  paintPixels(c, (u, v, x, y) => {
    const n = noise3(x * 0.4, y * 3, 21, 0) * 0.5 + noise3(x * 0.05, y * 0.6, 22, 0) * 0.5;
    const joint = smooth(0.0, 0.01, gridD(u, 2));
    const edge = Math.min(v, 1 - v);
    const bevel = edge < 0.12 ? 1.15 : 1;
    const groove = 1 - (1 - smooth(0.0, 0.03, Math.abs(v - 0.5) - 0.06)) * 0.25;
    const k = (0.82 + n * 0.16) * (0.6 + joint * 0.4) * bevel * groove;
    return [clamp255(150 * k), clamp255(162 * k), clamp255(176 * k)];
  });
  return toTexture(c);
}

/**
 * Trim strip (2.5 cm tall, repeat 4 → 0.25 m tile): dark metal lips top and bottom with a glowing teal
 * edge strip in the middle (emissive: dashes that scroll along u, a pulse of light running the wall).
 */
export function trimTextures(w = 256, h = 32) {
  const cm = makeCanvas(w, h), ce = makeCanvas(w, h);
  paintPixels(cm, (u, v) => {
    const n = noise3(u * 40, v * 4, 31, 0);
    if (v < 0.2 || v > 0.84) { const s = 0.85 + n * 0.2; return [clamp255(70 * s), clamp255(78 * s), clamp255(90 * s)]; }
    return [clamp255(120 + n * 10), clamp255(230), clamp255(228)];
  });
  paintPixels(ce, (u, v) => {
    if (v < 0.2 || v > 0.84) return [0, 0, 0];
    const mid = 1 - Math.abs((v - 0.52) / 0.32);
    const dash = 0.55 + 0.45 * smooth(0.3, 0.5, 0.5 + 0.5 * Math.cos(u * Math.PI * 2));
    const k = smooth(0.0, 0.5, mid) * dash;
    return [clamp255(70 * k), clamp255(240 * k), clamp255(230 * k)];
  });
  return { map: toTexture(cm), emissive: toTexture(ce) };
}

/**
 * Island data map (linear, not sRGB): R = hull side panels (seams, a tone per panel), G = deck plates
 * (the top round the course), B = asteroid rock grain (pits, cracks).
 */
export function rockDataTexture(size = 256) {
  const c = makeCanvas(size);
  paintPixels(c, (u, v, x, y) => {
    const n = fbm3(u * 8, v * 8, 51, 4, 8);
    const pu = Math.floor(u * 4), pv = Math.floor(v * 2);
    const tone = 0.86 + noise3(pu * 3.1, pv * 5.7, 52, 0) * 0.16;
    const R = tone * (0.55 + 0.45 * smooth(0.0, 0.006, Math.min(gridD(u, 4), gridD(v, 2))));
    const G = (0.86 + (n - 0.5) * 0.12) * (0.62 + 0.38 * smooth(0.0, 0.005, Math.min(gridD(u, 3), gridD(v, 3))));
    const pit = smooth(0.62, 0.72, noise3(u * 20, v * 20, 55, 20));
    const B = (0.62 + (n - 0.5) * 0.6) * (1 - pit * 0.45);
    return [clamp255(R * 255), clamp255(G * 255), clamp255(B * 255)];
  });
  return toTexture(c, { srgb: false });
}

/** Regolith dust (sand): grey-tan lunar dust with tiny craterlets and pebbles (1 m tile). */
export function regolithTexture(size = 256) {
  const c = makeCanvas(size);
  const g = paintPixels(c, (u, v, x, y) => {
    const n = fbm3(u * 6, v * 6, 61, 4, 6);
    const grain = noise3(x * 1.6, y * 1.6, 62, size * 1.6);
    const k = 0.8 + n * 0.2 + grain * 0.1;
    return [clamp255(176 * k), clamp255(166 * k), clamp255(150 * k)];
  });
  const r = rng(63);
  for (let i = 0; i < 14; i++) {   // craterlets: dark rim below, light rim above
    const x = r() * size, y = r() * size, rad = size * (0.01 + r() * 0.025);
    g.strokeStyle = 'rgba(90,84,74,0.45)'; g.lineWidth = rad * 0.35;
    g.beginPath(); g.arc(x, y, rad, 0.2, Math.PI - 0.2); g.stroke();
    g.strokeStyle = 'rgba(230,222,206,0.45)';
    g.beginPath(); g.arc(x, y, rad, Math.PI + 0.2, Math.PI * 2 - 0.2); g.stroke();
  }
  specks(g, size, size, Math.round(size * 0.3), size * 0.003, size * 0.007, ['#8a8274', '#6e685e', '#d8d0c0'], 65, 0.6);
  return toTexture(c);
}

/** Magnetic deck plates (sticky): dark plates with round coil pads and amber hazard rims (0.5 m pads). */
export function magnetTextures(size = 256) {
  const cm = makeCanvas(size), ce = makeCanvas(size);
  paintPixels(cm, (u, v) => {
    const fu = (u * 2) % 1 - 0.5, fv = (v * 2) % 1 - 0.5, rr = Math.hypot(fu, fv);
    const n = noise3(u * 30, v * 30, 66, 30);
    const seam = smooth(0.0, 0.01, Math.min(gridD(u, 2), gridD(v, 2)));
    const coil = rr < 0.36 ? 0.75 + 0.25 * Math.sin(rr * 120) : 1;
    const rim = rr > 0.37 && rr < 0.41;
    if (rim) return [210, 150, 40];
    const k = (0.8 + n * 0.2) * coil * (0.5 + seam * 0.5);
    return [clamp255(58 * k), clamp255(60 * k), clamp255(72 * k)];
  });
  paintPixels(ce, (u, v) => {
    const fu = (u * 2) % 1 - 0.5, fv = (v * 2) % 1 - 0.5, rr = Math.hypot(fu, fv);
    const k = 1 - smooth(0.0, 0.08, rr);
    return [clamp255(255 * k), clamp255(150 * k), clamp255(40 * k)];
  });
  return { map: toTexture(cm), emissive: toTexture(ce) };
}

/** Polished glass deck (ice): deep blue-teal glass with diagonal streak highlights and a faint grid. */
export function glassDeckTexture(size = 256) {
  const c = makeCanvas(size);
  paintPixels(c, (u, v) => {
    const n = fbm3(u * 3, v * 3, 71, 3, 3);
    const streak = smooth(0.9, 0.99, 0.5 + 0.5 * Math.sin((u + v) * Math.PI * 6 + n * 2));
    const grid = 1 - smooth(0.0, 0.004, Math.min(gridD(u, 2), gridD(v, 2)));
    const k = 0.85 + n * 0.2;
    return [clamp255(26 * k + streak * 70 + grid * 60), clamp255(70 * k + streak * 90 + grid * 90), clamp255(104 * k + streak * 100 + grid * 90)];
  });
  return toTexture(c);
}

/** Gantry grating (bridge): open metal grating, dark gaps between grey bars, cross bars (1 m tile). */
export function gratingTexture(size = 256) {
  const c = makeCanvas(size);
  paintPixels(c, (u, v, x, y) => {
    const n = noise3(x * 0.5, y * 0.5, 81, size * 0.5);
    const bar = gridD(u, 16) < 0.012 ? 1 : 0;
    const cross = gridD(v, 4) < 0.01 ? 1 : 0;
    const frame = gridD(v, 1) < 0.02 ? 1 : 0;
    if (frame) return [clamp255(200 * (0.9 + n * 0.1)), clamp255(170 * (0.9 + n * 0.1)), 40];
    if (bar || cross) { const k = 0.8 + n * 0.25; return [clamp255(150 * k), clamp255(158 * k), clamp255(168 * k)]; }
    return [clamp255(26 + n * 10), clamp255(30 + n * 10), clamp255(40 + n * 12)];
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

/** Boost pad emissive: glowing cyan-violet gravity chevrons pointing +v, two per tile, tip at u = 0. */
export function chevronTexture(w = 128, h = 256) {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  // side rails
  g.fillStyle = 'rgba(120,90,255,0.5)';
  g.fillRect(w * 0.46, 0, w * 0.04, h);
  for (let k = 0; k < 2; k++) {
    const y0 = k * h / 2;
    for (const [blur, width, col] of [[18, 20, 'rgba(110,80,255,0.6)'], [6, 12, 'rgba(90,220,255,0.95)'], [0, 4, '#f0ffff']]) {
      g.save();
      g.shadowColor = '#7a60ff'; g.shadowBlur = blur;
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

/** Loop band (u along m, v 0..1 across): white hull panels, dark edges, a row of teal running lights. */
export function bandTextures(w = 128, h = 64) {
  const cm = makeCanvas(w, h), ce = makeCanvas(w, h);
  paintPixels(cm, (u, v) => {
    const n = fbm3(u * 6, v * 3, 95, 3, 6);
    if (v < 0.1 || v > 0.9) return [clamp255(60 + n * 20), clamp255(68 + n * 20), clamp255(80 + n * 20)];
    const seam = smooth(0.0, 0.01, gridD(u, 4));
    const k = (0.88 + n * 0.12) * (0.6 + 0.4 * seam);
    return [clamp255(220 * k), clamp255(228 * k), clamp255(236 * k)];
  });
  paintPixels(ce, (u, v) => {
    const d = Math.abs(v - 0.5);
    const lamp = 1 - smooth(0.04, 0.09, Math.hypot(((u * 4) % 1 - 0.5) * 0.25, d));
    return [clamp255(60 * lamp), clamp255(240 * lamp), clamp255(230 * lamp)];
  });
  return { map: toTexture(cm), emissive: toTexture(ce) };
}

/**
 * Tee pad: a hexagonal launch pad: white plate, a dark hex inlay, a teal launch ring and an arrow sigil
 * (map), the ring, hex edges and arrow glowing (emissive). The arrow points to texture -v.
 */
export function teePadTextures(size = 512) {
  const cm = makeCanvas(size), ce = makeCanvas(size);
  const R = size / 2;
  const g = cm.getContext('2d');
  paintPixels(cm, (u, v, x, y) => {
    const n = noise3(x * 0.05, y * 0.05, 101) * 0.5 + noise3(x * 0.2, y * 0.2, 102) * 0.5;
    const k = 0.84 + n * 0.14;
    return [clamp255(214 * k), clamp255(222 * k), clamp255(230 * k)];
  });
  g.translate(R, R);
  const hex = (ctx, rr) => { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + Math.PI / 6; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); };
  g.fillStyle = '#2a3440'; hex(g, R * 0.7); g.fill();
  g.fillStyle = '#34424e'; hex(g, R * 0.56); g.fill();
  // hazard ticks round the rim
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * Math.PI * 2;
    g.save(); g.rotate(a); g.fillStyle = i % 2 ? '#e0a830' : '#2a2e34'; g.fillRect(-R * 0.06, -R * 0.95, R * 0.12, R * 0.08); g.restore();
  }
  const arrow = (ctx) => {
    ctx.beginPath();
    ctx.moveTo(0, -R * 0.4); ctx.lineTo(R * 0.22, -R * 0.1); ctx.lineTo(R * 0.08, -R * 0.1); ctx.lineTo(R * 0.08, R * 0.3);
    ctx.lineTo(-R * 0.08, R * 0.3); ctx.lineTo(-R * 0.08, -R * 0.1); ctx.lineTo(-R * 0.22, -R * 0.1); ctx.closePath();
  };
  g.fillStyle = '#7ae8e0'; arrow(g); g.fill();
  const e = ce.getContext('2d');
  e.fillStyle = '#000'; e.fillRect(0, 0, size, size);
  e.translate(R, R);
  e.shadowColor = '#30f0e0'; e.shadowBlur = size * 0.03;
  e.fillStyle = 'rgba(80,240,230,0.9)'; arrow(e); e.fill();
  e.strokeStyle = 'rgba(80,230,240,0.85)'; e.lineWidth = R * 0.025;
  hex(e, R * 0.7); e.stroke();
  e.beginPath(); e.arc(0, 0, R * 0.82, 0, Math.PI * 2); e.stroke();
  return { map: toTexture(cm, { repeat: false }), emissive: toTexture(ce, { repeat: false }) };
}

/** Flag cloth: a teal station pennant with a white border and a ringed-planet emblem. u = 0 at the pole. */
export function flagTexture(w = 128, h = 96) {
  const c = makeCanvas(w, h);
  const g = paintPixels(c, (u, v) => {
    const n = fbm3(u * 6, v * 5, 93, 3, 0);
    const k = 0.88 + n * 0.14;
    // swallow-tail fly end
    if (u > 0.82 + Math.abs(v - 0.5) * 0.36) return [0, 0, 0, 0];
    if (v < 0.08 || v > 0.92 || u < 0.05) return [clamp255(236 * k), clamp255(240 * k), clamp255(246 * k), 255];
    return [clamp255(24 * k), clamp255(150 * k), clamp255(156 * k), 255];
  });
  g.save(); g.translate(w * 0.4, h * 0.5);
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(0, 0, h * 0.16, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#ffe080'; g.lineWidth = 3;
  g.beginPath(); g.ellipse(0, 0, h * 0.3, h * 0.09, -0.35, 0, Math.PI * 2); g.stroke();
  g.restore();
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

/** Beacon flare: a bright core with a four-point star (white, alpha). */
export function flareTexture(size = 64) {
  const c = makeCanvas(size);
  const h = size / 2;
  paintPixels(c, (u, v) => {
    const x = (u - 0.5) * 2, y = (v - 0.5) * 2, r = Math.hypot(x, y);
    const core = Math.exp(-r * r * 14);
    const spike = Math.exp(-Math.abs(x) * 26) * Math.max(0, 1 - Math.abs(y)) + Math.exp(-Math.abs(y) * 26) * Math.max(0, 1 - Math.abs(x));
    const halo = Math.exp(-r * r * 3) * 0.35;
    const a = clamp255(Math.min(1, core + spike * 0.7 + halo) * 255 * (r < 1 ? 1 : 0));
    return [255, 255, 255, a];
  });
  void h;
  return toTexture(c, { repeat: false, srgb: false });
}

/** Vertical fade (alpha 1 at v=1 → 0 at v=0). */
export function fadeTexture(size = 64) {
  const c = makeCanvas(4, size);
  paintPixels(c, (u, v) => { const k = clamp255(Math.pow(1 - v, 1.4) * 255); return [k, k, k]; });
  return toTexture(c, { repeat: false, srgb: false });
}
