// Jungle Temple theme — procedural canvas textures (no downloaded assets).
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
const fr = x => x - Math.floor(x);

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

/** Running-bond stone blocks: returns { seam (0 on a joint .. 1), id (per-block hash) } for tile coords. */
function blocks(u, v, nu, nv, seed) {
  const row = Math.floor(v * nv);
  const uu = u * nu + (row % 2) * 0.5;
  const col = Math.floor(uu);
  const du = Math.min(fr(uu), 1 - fr(uu)) / nu, dv = Math.min(fr(v * nv), 1 - fr(v * nv)) / nv;
  return { seam: Math.min(du, dv), id: noise3(col * 3.7 + seed, row * 5.3, seed * 0.7) };
}

/**
 * Putting surface: 2 m tile (material repeat 0.5). Dense mossy turf: a mid moss green (dark enough for
 * the white ball to pop), soft mowing stripes every 0.5 m, cushion-moss clumps and a few fallen petals.
 */
export function grassTexture(size = 512) {
  const c = makeCanvas(size);
  const L = [84, 146, 60], D = [68, 126, 50];
  const g = paintPixels(c, (u, v, x, y) => {
    const band = smooth(-0.3, 0.3, Math.sin(v * Math.PI * 4));
    const n = noise3(x * 0.9, y * 0.9, 1, size * 0.9) * 0.5 + noise3(x * 0.25, y * 0.25, 7, size * 0.25) * 0.5;
    const clump = smooth(0.55, 0.75, fbm3(u * 10, v * 10, 3, 3, 10));
    const patch = fbm3(u * 4, v * 4, 5, 3, 4);
    const k = 0.86 + n * 0.14 + (patch - 0.5) * 0.12;
    const base = mix3(L, D, band);
    return mix3(base, [96, 150, 54], clump * 0.35).map(q => clamp255(q * k));
  });
  specks(g, size, size, Math.round(size * 0.06), size * 0.002, size * 0.004, ['#3e6e2c', '#4a7a30'], 12, 0.5);
  specks(g, size, size, 6, size * 0.004, size * 0.006, ['#e8b84a', '#d86a4a'], 13, 0.55);
  return toTexture(c);
}

/** Fringe: worn flagstones with moss in the joints (1 m tile). */
export function fringeTexture(size = 256) {
  const c = makeCanvas(size);
  paintPixels(c, (u, v, x, y) => {
    const n = noise3(x * 0.6, y * 0.6, 2, size * 0.6);
    const b = blocks(u, v, 3, 3, 11);
    const joint = smooth(0.0, 0.012, b.seam);
    const moss = smooth(0.45, 0.7, fbm3(u * 6, v * 6, 4, 3, 6));
    const stone = [128 + b.id * 26, 128 + b.id * 22, 112 + b.id * 18].map(q => q * (0.82 + n * 0.18));
    const m = Math.max(1 - joint, moss * 0.7);
    return mix3(stone, [70, 110, 46], m).map(clamp255);
  });
  return toTexture(c);
}

/**
 * Walls (0.25 m tile, material repeat 4): carved temple stone in running bond, a carved spiral glyph on
 * some blocks, moss along the top and creeping vine tendrils. No emissive.
 */
export function wallTextures(size = 256) {
  const cm = makeCanvas(size);
  const g = paintPixels(cm, (u, v, x, y) => {
    const n = fbm3(u * 4, v * 4, 43, 3, 4);
    const b = blocks(u, v, 2, 2, 41);
    const joint = smooth(0.0, 0.01, b.seam);
    // carved glyph on some blocks: concentric square spiral
    const cu = fr(u * 2 + (Math.floor(v * 2) % 2) * 0.5) - 0.5, cv = fr(v * 2) - 0.5;
    const sq = Math.max(Math.abs(cu), Math.abs(cv));
    const glyph = b.id > 0.62 ? (1 - smooth(0.0, 0.03, Math.abs(fr(sq * 6) - 0.5) - 0.32)) * (sq < 0.36 ? 1 : 0) : 0;
    const tone = 0.82 + b.id * 0.2;
    let col = [124 * tone, 128 * tone, 120 * tone].map(q => q * (0.85 + n * 0.2) * (0.5 + 0.5 * joint) * (1 - glyph * 0.32));
    // moss creeping down from the top (v small = top of the tile) and in patches
    const moss = smooth(0.52, 0.72, fbm3(u * 5, v * 5, 44, 3, 5) + (1 - v) * 0.18);
    col = mix3(col, [66, 104, 44], moss * 0.85);
    return col.map(clamp255);
  });
  // vine tendrils
  const r = rng(45);
  g.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    let x = r() * size, y = 0;
    g.strokeStyle = 'rgba(56,96,34,0.9)'; g.lineWidth = size * 0.008;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 10; k++) { x += (r() - 0.5) * size * 0.08; y += size * 0.07; g.lineTo(x, y); }
    g.stroke();
    for (let k = 0; k < 6; k++) {
      g.fillStyle = r() < 0.5 ? '#4f8a2e' : '#3e7426';
      g.beginPath(); g.ellipse(x - (r() - 0.5) * size * 0.3, r() * size * 0.7, size * 0.018, size * 0.01, r() * 3, 0, Math.PI * 2); g.fill();
    }
  }
  return { map: toTexture(cm) };
}

/** Wall cap (512×128 = 0.5 m along): pale capstone with a gold-inlaid meander down the middle (+ emissive glint). */
export function capTextures(w = 512, h = 128) {
  const cm = makeCanvas(w, h), ce = makeCanvas(w, h);
  const inlay = (u, v) => {
    // a stepped meander: a zig-zag key pattern (period 0.125 m)
    const p = fr(u * 4);
    const zig = p < 0.5 ? 0.38 + p * 0.48 : 0.62 - (p - 0.5) * 0.48;
    const line = Math.abs(v - zig) < 0.045;
    const rails = Math.abs(v - 0.3) < 0.02 || Math.abs(v - 0.7) < 0.02;
    return line || rails;
  };
  paintPixels(cm, (u, v, x, y) => {
    const n = noise3(x * 0.2, y * 0.6, 21, 0) * 0.5 + noise3(x * 0.05, y * 0.4, 22, 0) * 0.5;
    const joint = smooth(0.0, 0.01, gridD(u, 2));
    const edge = Math.min(v, 1 - v);
    const bevel = edge < 0.12 ? 0.85 : 1;
    if (inlay(u, v)) { const s = 0.85 + n * 0.25; return [clamp255(226 * s), clamp255(176 * s), clamp255(64 * s)]; }
    const moss = smooth(0.6, 0.78, fbm3(u * 8, v * 2, 23, 3, 0)) * (edge < 0.2 ? 1 : 0.3);
    const k = (0.82 + n * 0.16) * (0.6 + joint * 0.4) * bevel;
    return mix3([168 * k, 164 * k, 146 * k], [80, 112, 52], moss).map(clamp255);
  });
  paintPixels(ce, (u, v) => (inlay(u, v) ? [120, 86, 24] : [0, 0, 0]));
  return { map: toTexture(cm), emissive: toTexture(ce) };
}

/** Trim strip (2.5 cm, repeat 4 → 0.25 m tile): a gold band with carved notches, dark stone lips top and bottom. */
export function trimTextures(w = 256, h = 32) {
  const cm = makeCanvas(w, h), ce = makeCanvas(w, h);
  paintPixels(cm, (u, v) => {
    const n = noise3(u * 40, v * 4, 31, 0);
    if (v < 0.18 || v > 0.86) { const s = 0.8 + n * 0.2; return [clamp255(92 * s), clamp255(90 * s), clamp255(78 * s)]; }
    const notch = Math.abs(fr(u * 8) - 0.5) < 0.06 ? 0.55 : 1;
    const dot = Math.hypot((fr(u * 8) - 0.0) * 0.5, v - 0.52) < 0.09 ? 1.15 : 1;
    const s = (0.9 + n * 0.15) * notch * dot;
    return [clamp255(222 * s), clamp255(170 * s), clamp255(60 * s)];
  });
  paintPixels(ce, (u, v) => {
    if (v < 0.18 || v > 0.86) return [0, 0, 0];
    const k = 0.5 + 0.5 * Math.cos(u * Math.PI * 2);
    return [clamp255(90 * k), clamp255(62 * k), clamp255(16 * k)];
  });
  return { map: toTexture(cm), emissive: toTexture(ce) };
}

/**
 * Island data map (linear, not sRGB): R = cut temple blocks (terrace sides), G = mossy paving (the top
 * round the course), B = raw rock / earth grain with roots.
 */
export function rockDataTexture(size = 256) {
  const c = makeCanvas(size);
  paintPixels(c, (u, v, x, y) => {
    const n = fbm3(u * 8, v * 8, 51, 4, 8);
    const b = blocks(u, v, 4, 4, 52);
    const R = (0.8 + b.id * 0.25) * (0.5 + 0.5 * smooth(0.0, 0.008, b.seam)) * (0.9 + n * 0.2);
    const p = blocks(u, v, 3, 3, 53);
    const G = (0.84 + p.id * 0.2 + (n - 0.5) * 0.1) * (0.62 + 0.38 * smooth(0.0, 0.006, p.seam));
    const pit = smooth(0.62, 0.72, noise3(u * 20, v * 20, 55, 20));
    const root = 1 - smooth(0.0, 0.02, Math.abs(fr(u * 3 + fbm3(u * 2, v * 6, 56, 3, 2) * 0.8) - 0.5));
    const B = (0.62 + (n - 0.5) * 0.6) * (1 - pit * 0.45) * (1 - root * 0.35);
    return [clamp255(R * 255), clamp255(G * 255), clamp255(B * 255)];
  });
  return toTexture(c, { srgb: false });
}

/** Temple dust (sand): pale ochre dust with pebbles and a few broken tile shards (1 m tile). */
export function dustTexture(size = 256) {
  const c = makeCanvas(size);
  const g = paintPixels(c, (u, v, x, y) => {
    const n = fbm3(u * 6, v * 6, 61, 4, 6);
    const grain = noise3(x * 1.6, y * 1.6, 62, size * 1.6);
    const ripple = 0.5 + 0.5 * Math.sin((v * 14 + n * 3) * Math.PI);
    const k = 0.82 + n * 0.18 + grain * 0.08 + ripple * 0.04;
    return [clamp255(206 * k), clamp255(176 * k), clamp255(124 * k)];
  });
  specks(g, size, size, Math.round(size * 0.25), size * 0.003, size * 0.007, ['#a88a5a', '#8a7048', '#e8d4a8'], 65, 0.6);
  const r = rng(66);
  for (let i = 0; i < 5; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(170,96,60,0.7)' : 'rgba(140,140,120,0.7)';
    const x = r() * size, y = r() * size, s = size * (0.02 + r() * 0.02);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + s, y + s * 0.3); g.lineTo(x + s * 0.6, y + s); g.closePath(); g.fill();
  }
  return toTexture(c);
}

/** Mud (sticky): dark wet brown with glossy puddles and churned ridges (0.5 m features, 1 m tile). */
export function mudTexture(size = 256) {
  const c = makeCanvas(size);
  paintPixels(c, (u, v) => {
    const n = fbm3(u * 5, v * 5, 67, 4, 5);
    const n2 = fbm3(u * 14, v * 14, 68, 3, 14);
    const pud = smooth(0.56, 0.62, n);
    const ridge = smooth(0.55, 0.7, n2);
    const k = 0.75 + n2 * 0.3;
    const base = mix3([92, 64, 40], [118, 84, 52], ridge);
    return mix3(base.map(q => q * k), [58, 44, 32], pud * 0.8).map(clamp255);
  });
  return toTexture(c);
}

/** Wet polished jade (ice): deep green jade with cloudy veins and pale streak highlights. */
export function jadeTexture(size = 256) {
  const c = makeCanvas(size);
  paintPixels(c, (u, v) => {
    const n = fbm3(u * 3, v * 3, 71, 4, 3);
    const vein = 1 - smooth(0.0, 0.04, Math.abs(fbm3(u * 4 + n, v * 4, 72, 3, 4) - 0.5));
    const cloud = smooth(0.45, 0.75, fbm3(u * 6, v * 6, 73, 3, 6));
    const tile = 1 - smooth(0.0, 0.004, Math.min(gridD(u, 2), gridD(v, 2)));
    const base = mix3([30, 110, 84], [70, 160, 120], cloud);
    return mix3(base, [190, 236, 200], vein * 0.45).map((q, i) => clamp255(q * (0.85 + n * 0.25) - tile * [20, 40, 30][i]));
  });
  return toTexture(c);
}

/** Rope-and-plank bridge (world-space uv, 1 m tile): planks across z every 0.125 m, rope lashings at x = 0 / 0.5. */
export function plankTexture(size = 256) {
  const c = makeCanvas(size);
  paintPixels(c, (u, v, x, y) => {
    const row = Math.floor(v * 8);
    const id = noise3(row * 4.1, 3, 81);
    const gap = Math.min(fr(v * 8), 1 - fr(v * 8)) < 0.07;
    if (gap) return [34, 26, 18];
    const grain = noise3(x * 0.25, y * 3.5, 82 + row, 0);
    const k = (0.75 + id * 0.35) * (0.82 + grain * 0.22);
    const lash = Math.min(gridD(u, 2), 1) < 0.018;
    if (lash) { const s = 0.85 + grain * 0.2; return [clamp255(196 * s), clamp255(168 * s), clamp255(112 * s)]; }
    const nail = Math.hypot(gridD(u + 0.12, 2) * 18, (fr(v * 8) - 0.5) * 2.2) < 0.18;
    return nail ? [60, 52, 44] : [clamp255(138 * k), clamp255(98 * k), clamp255(62 * k)];
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

/**
 * Boost pad: a dark carved stone slab (map) with ancient glyph-rune chevrons pointing +v, two per tile,
 * tip at u = 0 (emissive: gold-teal glow along the carved lines, little rune dots between them).
 */
export function glyphTextures(w = 128, h = 256) {
  const cm = makeCanvas(w, h), ce = makeCanvas(w, h);
  paintPixels(cm, (u, v, x, y) => {
    const n = noise3(x * 0.3, y * 0.3, 85, 0);
    const k = 0.75 + n * 0.25;
    return [clamp255(66 * k), clamp255(70 * k), clamp255(62 * k)];
  });
  const g = ce.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  for (let k = 0; k < 2; k++) {
    const y0 = k * h / 2;
    for (const [blur, width, col] of [[16, 18, 'rgba(255,170,40,0.55)'], [6, 10, 'rgba(120,255,200,0.9)'], [0, 4, '#fff8d0']]) {
      g.save();
      g.shadowColor = '#ffb030'; g.shadowBlur = blur;
      g.strokeStyle = col; g.lineWidth = width; g.lineJoin = 'miter'; g.lineCap = 'butt';
      for (const cx of [0, w]) {
        g.beginPath();
        g.moveTo(cx - w * 0.4, y0 + h * 0.34);
        g.lineTo(cx - w * 0.2, y0 + h * 0.24);   // stepped like a carved glyph
        g.lineTo(cx - w * 0.2, y0 + h * 0.2);
        g.lineTo(cx, y0 + h * 0.1);
        g.lineTo(cx + w * 0.2, y0 + h * 0.2);
        g.lineTo(cx + w * 0.2, y0 + h * 0.24);
        g.lineTo(cx + w * 0.4, y0 + h * 0.34);
        g.stroke();
      }
      g.restore();
    }
    // rune dots between chevrons
    g.fillStyle = 'rgba(255,200,90,0.8)';
    for (const cx of [0, w]) for (const dy of [0.4, 0.44]) { g.beginPath(); g.arc(cx, y0 + h * dy, w * 0.04, 0, Math.PI * 2); g.fill(); }
  }
  return { map: toTexture(cm), emissive: toTexture(ce) };
}

/** Loop band (u along m, v 0..1 across): a carved feathered serpent — green-gold scales, a pale belly stripe. */
export function bandTextures(w = 128, h = 64) {
  const cm = makeCanvas(w, h), ce = makeCanvas(w, h);
  const scale = (u, v) => {
    const su = u * 8, sv = v * 6 + (Math.floor(u * 8) % 2) * 0.5;
    const du = fr(su) - 0.5, dv = fr(sv) - 0.5;
    return Math.hypot(du * 1.2, dv);
  };
  paintPixels(cm, (u, v) => {
    const n = fbm3(u * 6, v * 3, 95, 3, 6);
    if (v < 0.08 || v > 0.92) return [clamp255(200 + n * 30), clamp255(150 + n * 20), clamp255(50)];
    const belly = 1 - smooth(0.12, 0.2, Math.abs(v - 0.5));
    const s = scale(u, v);
    const rim = smooth(0.36, 0.46, s);
    const base = mix3([60, 132, 72], [196, 180, 96], belly);
    return base.map(q => clamp255(q * (0.85 + n * 0.2) * (1 - rim * 0.22)));
  });
  paintPixels(ce, (u, v) => {
    const d = Math.abs(v - 0.5);
    const dia = Math.abs(fr(u * 4) - 0.5) + d;
    const k = (1 - smooth(0.1, 0.16, Math.abs(dia - 0.3))) * (d < 0.35 ? 1 : 0);
    return [clamp255(150 * k), clamp255(110 * k), clamp255(30 * k)];
  });
  return { map: toTexture(cm), emissive: toTexture(ce) };
}

/** Bark (hollow log): u around (0..1), v along (metres × 1). Furrowed brown bark with moss patches. */
export function barkTexture(w = 128, h = 256) {
  const c = makeCanvas(w, h);
  paintPixels(c, (u, v, x, y) => {
    const furrow = Math.abs(Math.sin((u * 14 + fbm3(u * 3, v * 6, 97, 3, 3) * 2.5) * Math.PI));
    const n = fbm3(u * 8, v * 8, 98, 3, 8);
    const moss = smooth(0.58, 0.72, fbm3(u * 4, v * 4, 99, 3, 4));
    const k = (0.55 + furrow * 0.45) * (0.85 + n * 0.25);
    return mix3([104 * k, 76 * k, 52 * k], [72, 108, 46], moss * 0.8).map(clamp255);
  });
  return toTexture(c);
}

/**
 * Tee pad: a carved sun stone — concentric bands of glyphs, gold rays, an arrow (map), the ray tips and
 * the arrow glowing gold (emissive). The arrow points to texture -v.
 */
export function teePadTextures(size = 512) {
  const cm = makeCanvas(size), ce = makeCanvas(size);
  const R = size / 2;
  const g = cm.getContext('2d');
  paintPixels(cm, (u, v, x, y) => {
    const n = noise3(x * 0.05, y * 0.05, 101) * 0.5 + noise3(x * 0.2, y * 0.2, 102) * 0.5;
    const rr = Math.hypot(u - 0.5, v - 0.5) * 2;
    const ring = Math.abs(fr(rr * 5) - 0.5) < 0.05 ? 0.72 : 1;
    const k = (0.82 + n * 0.16) * ring;
    return [clamp255(178 * k), clamp255(168 * k), clamp255(140 * k)];
  });
  g.translate(R, R);
  // glyph ticks on two bands
  for (const [r0, n] of [[0.86, 32], [0.66, 20]]) for (let i = 0; i < n; i++) {
    g.save(); g.rotate(i / n * Math.PI * 2);
    g.fillStyle = i % 2 ? '#6a6450' : '#8a8268';
    g.fillRect(-R * 0.04, -R * r0, R * 0.08, R * 0.08);
    g.restore();
  }
  // gold sun rays
  g.fillStyle = '#d8a83a';
  for (let i = 0; i < 8; i++) {
    g.save(); g.rotate(i / 8 * Math.PI * 2 + Math.PI / 8);
    g.beginPath(); g.moveTo(-R * 0.07, -R * 0.44); g.lineTo(0, -R * 0.6); g.lineTo(R * 0.07, -R * 0.44); g.closePath(); g.fill();
    g.restore();
  }
  const arrow = (ctx) => {
    ctx.beginPath();
    ctx.moveTo(0, -R * 0.4); ctx.lineTo(R * 0.22, -R * 0.1); ctx.lineTo(R * 0.08, -R * 0.1); ctx.lineTo(R * 0.08, R * 0.3);
    ctx.lineTo(-R * 0.08, R * 0.3); ctx.lineTo(-R * 0.08, -R * 0.1); ctx.lineTo(-R * 0.22, -R * 0.1); ctx.closePath();
  };
  g.fillStyle = '#e8c050'; arrow(g); g.fill();
  const e = ce.getContext('2d');
  e.fillStyle = '#000'; e.fillRect(0, 0, size, size);
  e.translate(R, R);
  e.shadowColor = '#ffb030'; e.shadowBlur = size * 0.03;
  e.fillStyle = 'rgba(255,190,70,0.85)'; arrow(e); e.fill();
  e.strokeStyle = 'rgba(255,190,80,0.6)'; e.lineWidth = R * 0.02;
  e.beginPath(); e.arc(0, 0, R * 0.62, 0, Math.PI * 2); e.stroke();
  return { map: toTexture(cm, { repeat: false }), emissive: toTexture(ce, { repeat: false }) };
}

/** Flag cloth: a woven ochre-red banner with a gold sun glyph and a tasselled fly end. u = 0 at the pole. */
export function flagTexture(w = 128, h = 96) {
  const c = makeCanvas(w, h);
  const g = paintPixels(c, (u, v, x, y) => {
    const n = fbm3(u * 6, v * 5, 93, 3, 0);
    const weave = (x + y) % 4 < 2 ? 0.94 : 1;
    const k = (0.88 + n * 0.14) * weave;
    if (u > 0.88) return Math.floor(v * 16) % 2 ? [0, 0, 0, 0] : [clamp255(230 * k), clamp255(180 * k), 60, 255];   // tassels
    if (v < 0.1 || v > 0.9) return [clamp255(36 * k), clamp255(110 * k), clamp255(70 * k), 255];
    const zig = Math.abs(v - 0.5) > 0.3 && Math.abs(fr(u * 10) - 0.5) < 0.2 ? 1 : 0;
    if (zig) return [clamp255(230 * k), clamp255(190 * k), clamp255(70 * k), 255];
    return [clamp255(178 * k), clamp255(52 * k), clamp255(34 * k), 255];
  });
  g.save(); g.translate(w * 0.44, h * 0.5);
  g.fillStyle = '#f0c040';
  g.beginPath(); g.arc(0, 0, h * 0.13, 0, Math.PI * 2); g.fill();
  for (let i = 0; i < 8; i++) { g.save(); g.rotate(i / 8 * Math.PI * 2); g.fillRect(-1.5, -h * 0.24, 3, h * 0.07); g.restore(); }
  g.fillStyle = '#8a3a1a'; g.beginPath(); g.arc(-h * 0.04, -h * 0.02, h * 0.02, 0, Math.PI * 2); g.arc(h * 0.04, -h * 0.02, h * 0.02, 0, Math.PI * 2); g.fill();
  g.restore();
  return toTexture(c, { repeat: false });
}

/**
 * Foliage atlas (2×2 cells, alpha): 0 broad split leaf (monstera) · 1 fern frond · 2 leaf cluster
 * (canopy / bush) · 3 palm / banana blade. Each cell's stem at the bottom (v high in canvas).
 */
export function leafAtlas(size = 256) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const h = size / 2;
  const cell = (i) => [(i % 2) * h, Math.floor(i / 2) * h];
  const leafPath = (ctx, cx, by, len, wid, ang) => {
    ctx.save(); ctx.translate(cx, by); ctx.rotate(ang);
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.bezierCurveTo(wid, -len * 0.25, wid * 0.8, -len * 0.8, 0, -len);
    ctx.bezierCurveTo(-wid * 0.8, -len * 0.8, -wid, -len * 0.25, 0, 0);
    ctx.fill(); ctx.restore();
  };
  // 0: monstera-ish broad leaf with splits
  {
    const [x0, y0] = cell(0);
    g.save(); g.beginPath(); g.rect(x0, y0, h, h); g.clip();
    g.fillStyle = '#3f8a34'; leafPath(g, x0 + h / 2, y0 + h * 0.98, h * 0.94, h * 0.5, 0);
    g.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < 4; k++) for (const s of [-1, 1]) {
      g.lineWidth = h * 0.025; g.strokeStyle = '#000';
      g.beginPath(); g.moveTo(x0 + h / 2 + s * h * 0.42, y0 + h * (0.25 + k * 0.15)); g.lineTo(x0 + h / 2 + s * h * 0.12, y0 + h * (0.38 + k * 0.15)); g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = '#a8d070'; g.lineWidth = h * 0.015;
    g.beginPath(); g.moveTo(x0 + h / 2, y0 + h * 0.98); g.lineTo(x0 + h / 2, y0 + h * 0.08); g.stroke();
    g.restore();
  }
  // 1: fern frond
  {
    const [x0, y0] = cell(1);
    g.save(); g.beginPath(); g.rect(x0, y0, h, h); g.clip();
    g.strokeStyle = '#5a8a2a'; g.lineWidth = h * 0.02;
    g.beginPath(); g.moveTo(x0 + h / 2, y0 + h); g.quadraticCurveTo(x0 + h * 0.52, y0 + h * 0.5, x0 + h * 0.46, y0 + h * 0.04); g.stroke();
    for (let k = 0; k < 14; k++) {
      const t = k / 14, y = y0 + h * (0.95 - t * 0.88), len = h * 0.36 * (1 - t * 0.75);
      g.fillStyle = k % 2 ? '#4e9236' : '#5aa040';
      for (const s of [-1, 1]) leafPath(g, x0 + h * (0.5 - t * 0.04), y, len, len * 0.22, s * 1.15);
    }
    g.restore();
  }
  // 2: leaf cluster
  {
    const [x0, y0] = cell(2);
    g.save(); g.beginPath(); g.rect(x0, y0, h, h); g.clip();
    const r = rng(7);
    for (let k = 0; k < 26; k++) {
      const a = r() * Math.PI * 2, d = r() * h * 0.28;
      g.fillStyle = ['#2e6a2a', '#3a7c30', '#4a8e38', '#2a5a26'][k % 4];
      leafPath(g, x0 + h / 2 + Math.cos(a) * d, y0 + h / 2 + Math.sin(a) * d + h * 0.1, h * 0.3, h * 0.11, a + Math.PI / 2);
    }
    g.restore();
  }
  // 3: banana / palm blade
  {
    const [x0, y0] = cell(3);
    g.save(); g.beginPath(); g.rect(x0, y0, h, h); g.clip();
    g.fillStyle = '#58982e'; leafPath(g, x0 + h / 2, y0 + h * 0.99, h * 0.98, h * 0.22, 0);
    g.strokeStyle = 'rgba(40,80,20,0.6)'; g.lineWidth = 1;
    for (let k = 0; k < 18; k++) { const y = y0 + h * (0.1 + k * 0.048); g.beginPath(); g.moveTo(x0 + h * 0.4, y - 3); g.lineTo(x0 + h * 0.6, y + 3); g.stroke(); }
    g.strokeStyle = '#c0d880'; g.lineWidth = h * 0.012;
    g.beginPath(); g.moveTo(x0 + h / 2, y0 + h); g.lineTo(x0 + h / 2, y0 + h * 0.04); g.stroke();
    g.restore();
  }
  return toTexture(c, { repeat: false });
}

/** Liana strip (alpha): a twisting vine with small leaves; u across, v along (v = 1 at the top). */
export function lianaTexture(w = 32, h = 256) {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  g.clearRect(0, 0, w, h);
  g.strokeStyle = '#5a4a2a'; g.lineWidth = w * 0.14; g.lineCap = 'round';
  g.beginPath();
  for (let y = 0; y <= h; y += 4) { const x = w / 2 + Math.sin(y * 0.08) * w * 0.12; if (y) g.lineTo(x, y); else g.moveTo(x, y); }
  g.stroke();
  const r = rng(17);
  for (let k = 0; k < 26; k++) {
    const y = r() * h, s = r() < 0.5 ? -1 : 1;
    g.fillStyle = ['#3a7a2a', '#4e9034', '#5aa03c'][k % 3];
    g.save(); g.translate(w / 2, y); g.rotate(s * (0.8 + r() * 0.6));
    g.beginPath(); g.ellipse(0, -w * 0.22, w * 0.12, w * 0.24, 0, 0, Math.PI * 2); g.fill(); g.restore();
  }
  return toTexture(c, { repeat: false });
}

/** Bird atlas for the billboard 'bat' mode: row 0 a scarlet macaw, row 1 a toucan; left = wings up, right = wings down. */
export function birdAtlas(size = 128) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const h = size / 2;
  const bird = (x0, y0, up, kind) => {
    const cx = x0 + h / 2, cy = y0 + h / 2;
    const body = kind ? '#1a1a1e' : '#d8302a', wing = kind ? '#202024' : '#2a5ad0', wing2 = kind ? '#2a2a30' : '#f0c030';
    // wings
    g.fillStyle = wing;
    for (const s of [-1, 1]) {
      g.beginPath(); g.moveTo(cx, cy);
      g.quadraticCurveTo(cx + s * h * 0.22, cy + (up ? -h * 0.34 : h * 0.12), cx + s * h * 0.46, cy + (up ? -h * 0.28 : h * 0.26));
      g.quadraticCurveTo(cx + s * h * 0.2, cy + (up ? -h * 0.08 : h * 0.06), cx, cy + h * 0.04); g.fill();
      g.fillStyle = wing2;
      g.beginPath(); g.moveTo(cx + s * h * 0.04, cy);
      g.quadraticCurveTo(cx + s * h * 0.16, cy + (up ? -h * 0.18 : h * 0.06), cx + s * h * 0.26, cy + (up ? -h * 0.17 : h * 0.12));
      g.lineTo(cx + s * h * 0.06, cy + h * 0.03); g.fill();
      g.fillStyle = wing;
    }
    // body + tail
    g.fillStyle = body;
    g.beginPath(); g.ellipse(cx, cy, h * 0.07, h * 0.16, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(cx - h * 0.04, cy + h * 0.12); g.lineTo(cx, cy + h * (kind ? 0.3 : 0.44)); g.lineTo(cx + h * 0.04, cy + h * 0.12); g.fill();
    // head + beak
    if (kind) { g.fillStyle = '#f4f0d8'; g.beginPath(); g.arc(cx, cy - h * 0.12, h * 0.06, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = kind ? '#ff8a1a' : '#f4f0e0';
    g.beginPath(); g.ellipse(cx, cy - h * (kind ? 0.26 : 0.21), h * (kind ? 0.045 : 0.03), h * (kind ? 0.11 : 0.05), 0, 0, Math.PI * 2); g.fill();
  };
  for (let row = 0; row < 2; row++) for (let f = 0; f < 2; f++) bird(f * h, row * h, f === 0, row);
  return toTexture(c, { repeat: false, srgb: true });
}

/** Waterfall (alpha streaks, scrolls in v): white-teal falling water. */
export function waterfallTexture(w = 128, h = 256) {
  const c = makeCanvas(w, h);
  paintPixels(c, (u, v, x, y) => {
    const s = noise3(x * 0.25, y * 0.02, 120, w * 0.25) * 0.6 + noise3(x * 0.6, y * 0.05, 121, w * 0.6) * 0.4;
    const streak = smooth(0.35, 0.8, s);
    const edge = smooth(0.0, 0.12, u) * smooth(0.0, 0.12, 1 - u);
    const a = (0.35 + streak * 0.65) * edge;
    return [clamp255(200 + streak * 55), clamp255(230 + streak * 25), clamp255(226 + streak * 29), clamp255(a * 255)];
  });
  return toTexture(c, { srgb: true });
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

/** Soft mist puff (white, a lumpy alpha falloff). */
export function mistTexture(size = 64) {
  const c = makeCanvas(size);
  paintPixels(c, (u, v) => {
    const r = Math.hypot(u - 0.5, v - 0.5) * 2;
    const n = fbm3(u * 4, v * 4, 131, 3, 4);
    const a = Math.max(0, 1 - r) ** 1.6 * (0.55 + n * 0.6);
    return [255, 255, 255, clamp255(a * 255)];
  });
  return toTexture(c, { repeat: false, srgb: false });
}

/** Vertical fade (alpha 1 at v=1 → 0 at v=0). */
export function fadeTexture(size = 64) {
  const c = makeCanvas(4, size);
  paintPixels(c, (u, v) => { const k = clamp255(Math.pow(1 - v, 1.4) * 255); return [k, k, k]; });
  return toTexture(c, { repeat: false, srgb: false });
}
