// Procedural texture atlas painted at boot from the tile hints in js/data/blocks.js.
// Two DataArrayTextures (one layer per tile, so no mip bleeding):
//   albedo: sRGB rgb + alpha (cutout)
//   mat:    r = emissive mask, g = gloss, b = glint mask, a = glow mode (0 none, 1 night, 2 pulse, 3 always)/3
import { hashString, mulberry32 } from '../core/rng.js';
import { STYLE, stylePixel, paintLip } from './atlas_styles.js';

export const TS = 32;
const GLOW = { none: 0, night: 1, pulse: 2, always: 3 };

const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function makeNoise(rand, period) {
  const g = new Float32Array(period * period);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const at = (i, j) => g[(((i % period) + period) % period) + (((j % period) + period) % period) * period];
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

// Tileable worley: returns [f1, f2, id]
function makeWorley(rand, n) {
  const pts = [];
  for (let i = 0; i < n; i++) pts.push([rand() * TS, rand() * TS, rand()]);
  return (x, y) => {
    let f1 = 1e9, f2 = 1e9, id = 0;
    for (const p of pts) for (let ox = -TS; ox <= TS; ox += TS) for (let oy = -TS; oy <= TS; oy += TS) {
      const dx = x - p[0] - ox, dy = y - p[1] - oy, d = Math.sqrt(dx * dx + dy * dy);
      if (d < f1) { f2 = f1; f1 = d; id = p[2]; } else if (d < f2) f2 = d;
    }
    return [f1, f2, id];
  };
}

function paintTile(t) {
  const alb = new Uint8ClampedArray(TS * TS * 4), mat = new Uint8ClampedArray(TS * TS * 4);
  const rand = mulberry32(hashString(t.name));
  const base = hex(t.base), acc = hex(t.accent);
  const sc = t.scale || 1;
  const n1 = makeNoise(rand, 8), n2 = makeNoise(rand, 16), n3 = makeNoise(rand, 4);
  const fbm = (x, y) => n3(x / 8, y / 8) * 0.5 + n1(x / 4, y / 4) * 0.3 + n2(x / 2, y / 2) * 0.2;
  const cut = t.alpha === 'cutout';
  const glowMode = GLOW[t.glow] ?? 0;
  const E = t.emissive || 0;
  // per-pixel outputs
  const px = (x, y, rgb, a = 255, em = 0, gloss = 0.15, glint = 0) => {
    const i = (x + y * TS) * 4;
    alb[i] = rgb[0]; alb[i + 1] = rgb[1]; alb[i + 2] = rgb[2]; alb[i + 3] = a;
    mat[i] = clamp01(em) * 255; mat[i + 1] = clamp01(gloss) * 255; mat[i + 2] = clamp01(glint) * 255; mat[i + 3] = (glowMode / 3) * 255;
  };
  const shade = (rgb, k) => scale(rgb, k);
  const KNOWN = ['noise', 'grain', 'film', 'lattice', 'veins', 'circuit', 'mirror', 'rings', 'water', 'panel', 'ore', 'brick',
    'device', 'plant', 'bulb', 'fibre', 'crystal', 'rail', 'hexfilm', 'weave', 'sand', 'grooves', 'furrows'];
  const P = KNOWN.includes(t.pattern) ? t.pattern : (t.fallback || 'noise');
  const name = t.name;

  const seed = hashString(t.name);
  const sh = { base, acc, n1, n2, n3, rand, circuit: circuitMask(t, rand),
    alt: t.alt ? hex(t.alt) : null, speck: t.speck ? hex(t.speck) : null,
    cellHash: (k) => (Math.imul((k + 1) ^ seed, 2654435761) >>> 0) / 4294967296 };
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const st = stylePixel(P, t, x, y, sh);
    if (st) { px(x, y, st.c, st.a, st.em * Math.min(1, (E || 0.5) * 1.6), st.gl, st.gt); continue; }
    const nv = fbm(x, y);
    let c = shade(base, 0.85 + nv * 0.3), a = 255, em = 0, emAbs = 0, gl = 0.12, gt = 0;
    if (P === 'noise') {
      // faceted shards
      const w = makeWorleyCached(t, rand, 9 * sc)(x, y);
      const edge = w[1] - w[0];
      c = shade(mix(base, acc, w[2] * 0.6), 0.75 + w[2] * 0.35 + (edge < 1.2 ? 0.25 : 0));
      gl = 0.35; gt = edge < 1 ? 0.6 : 0;
    } else if (P === 'grain') {
      const g = n2(x * 1.5, y * 1.5);
      c = shade(base, 0.78 + g * 0.35 + nv * 0.1);
      // faint hex mesh
      const hx = ((x + (Math.floor(y / 4) % 2) * 2) % 8), hy = y % 4;
      if (hy === 0 && hx < 5) c = mix(c, acc, 0.35);
      if (rand() < 0.04) c = mix(c, acc, 0.6);
    } else if (P === 'film') {
      if (cut) {
        // solar-film leaves: overlapping lobes shaded centre→edge, a few gaps, some lobes are gold solar cells
        const w = makeWorleyCached(t, rand, 11)(x, y);
        const edge = w[1] - w[0];
        const cell = w[2] > 0.78;
        c = shade(mix(base, scale(base, 1.35), w[2]), 1.12 - w[0] * 0.07 + nv * 0.15);
        if (cell) {
          c = mix(c, acc, 0.45);
          if ((x + y) % 4 === 0) { c = mix(c, acc, 0.5); em = 1; }
          gl = 0.7;
        } else gl = 0.35;
        if (edge < 0.9) c = shade(c, 0.55);
        if (w[0] > 6.6) a = 0;
      } else {
        // photomoss: soft moss grain over a faint solar-cell grid
        const g = n2(x * 1.7, y * 1.7), g2 = n1(x * 0.9 + 3, y * 0.9);
        c = shade(mix(base, [40, 150, 120], g2 * 0.35), 0.72 + nv * 0.18 + g * 0.22);
        const line = x % 16 === 0 || y % 16 === 0;
        if (line) { c = mix(c, acc, 0.16); em = 0.6; }
        if (rand() < 0.06) c = mix(c, acc, 0.35);
        if (rand() < 0.08) c = shade(c, 0.75);
        gl = 0.25;
      }
    } else if (P === 'lattice') {
      const s = 8 * sc;
      const u = (x + y) % s, v = (x - y + 64) % s;
      const l = Math.min(u, s - u, v, s - v);
      if (name.includes('planks')) {
        const row = Math.floor(y / 8);
        const off = (row * 11) % 32;
        const seam = y % 8 === 0 || (x + off) % 32 === 0;
        c = shade(base, 0.82 + n2(x / 4, row * 3) * 0.3 + (y % 8 === 1 ? 0.12 : 0));
        if (seam) c = shade(base, 0.55);
        else if (l < 0.8) c = mix(c, acc, 0.35);
        gl = 0.25;
      } else if (name.includes('log_side')) {
        // carbon-lattice bark: offset vertical plates joined by thin glowing seams
        const col = Math.floor(x / 8), lx = x % 8, ly = (y + (col % 2) * 6) % 12;
        if (lx === 0 || (ly === 0 && lx > 1 && lx < 7)) {
          c = mix(shade(base, 0.8), [74, 215, 200], 0.8); emAbs = 0.55; gl = 0.6;
        } else {
          const ridge = n2(x * 2.5, y / 5);
          c = shade(mix(base, acc, 0.45), 0.85 + ridge * 0.6 + (lx === 1 ? 0.2 : 0) - (lx === 7 ? 0.25 : 0) - (ly === 11 ? 0.2 : 0));
          gl = 0.3;
        }
      } else {
        c = shade(base, 0.8 + nv * 0.35);
        if (l < 0.9) { c = mix(c, acc, 0.7); gl = 0.4; }
        else if (l < 1.8) c = shade(c, 0.85);
      }
    } else if (P === 'veins') {
      const w = makeWorleyCached(t, rand, 7)(x, y);
      c = shade(base, 0.8 + nv * 0.3);
      if (w[1] - w[0] < 1.1) { c = mix(c, acc, 0.85); em = 0.15; gl = 0.5; }
    } else if (P === 'circuit') {
      c = shade(base, 0.9 + nv * 0.25);
      const tr = circuitMask(t, rand)[x + y * TS];
      if (tr === 1) { c = mix(c, acc, 0.85); em = 1; gl = 0.6; }
      if (tr === 2) { c = mix(acc, [255, 255, 255], 0.4); em = 1; gl = 0.8; }
    } else if (P === 'mirror') {
      if (name.includes('shingle')) {
        const r = 8;
        const row = Math.floor(y / (r / 1.3));
        const ox = (row % 2) * (r / 2);
        const lx = ((x + ox) % r) - r / 2, ly = (y % (r / 1.3)) - r / 2.6;
        const d = Math.sqrt(lx * lx + ly * ly * 1.6);
        c = mix(base, acc, clamp01(0.3 + (ly < 0 ? 0.5 : 0) - d / 10 + nv * 0.3));
        if (d > r / 2 - 0.6) c = shade(base, 0.6);
        gl = 0.85; gt = d < 1.5 ? 0.6 : 0.05;
      } else {
        const g = n2(x * 2, y * 2);
        c = mix(shade(base, 0.82), acc, clamp01(g * 0.35 - 0.1 + nv * 0.15));
        c = shade(c, 0.78 + g * 0.2);
        gl = 0.7;
        if (rand() < 0.07) { c = [255, 255, 255]; gt = 1; em = 0.3; }
        else gt = 0.12;
      }
    } else if (P === 'rings') {
      const dx = x - 15.5, dy = y - 15.5, d = Math.sqrt(dx * dx + dy * dy);
      const ring = Math.abs(((d + nv * 2) % 4) - 2);
      c = shade(base, 0.75 + ring * 0.15 + nv * 0.2);
      if (d > 14) c = shade(base, 0.6);
      if (Math.abs(d - 5) < 0.9 || d < 1.6) { c = mix(c, acc, 0.9); em = 1; gl = 0.6; }
    } else if (P === 'water') {
      const g = n1(x / 2 + n3(x / 8, y / 8) * 2, y / 2);
      c = mix(base, acc, clamp01(g * g * 1.2));
      gl = 0.9;
    } else if (P === 'panel') {
      const e = Math.min(x, y, TS - 1 - x, TS - 1 - y);
      if (name === 'clearglass') {
        if (e <= 1) { c = mix(base, acc, e === 0 ? 0.2 : 0.8); gl = 0.9; }
        else if ((x - y === 6 || x - y === 8 || x - y === 20) && e > 3) { c = [255, 255, 255]; a = 200; gl = 1; }
        else a = 0;
      } else {
        c = shade(base, e === 0 ? 0.6 : e === 1 ? 1.15 : 0.92 + nv * 0.12);
        if (e === 4) { c = mix(c, acc, 0.85); em = 1; }
        else if (e > 4) { c = mix(c, acc, E > 0.5 ? 0.35 : 0.08); em = E >= 0.9 ? 1 : E > 0.5 ? 0.45 : 0; }
        gl = 0.55;
      }
    } else if (P === 'ore') {
      // stone with glowing veins branching through it and a few bright nodes
      const w = makeWorleyCached(t, rand, 6)(x, y);
      c = shade([61, 74, 96], 0.8 + nv * 0.3);
      const crystal = makeWorleyCached({ name: t.name + 'o' }, rand, 4)(x, y);
      const vein = w[1] - w[0];
      if (crystal[0] < 2.2) { c = mix(acc, [255, 255, 255], 0.45); emAbs = 1; gl = 0.9; gt = 0.6; }
      else if (vein < 1.1 && crystal[0] < 9) { c = mix(shade(acc, 0.8), acc, 1 - vein); emAbs = 0.8; gl = 0.7; }
      else if (vein < 1.6) c = shade(c, 0.65);
    } else if (P === 'brick') {
      const row = Math.floor(y / 8), off = (row % 2) * 8;
      const mortar = y % 8 === 0 || (x + off) % 16 === 0;
      c = mortar ? acc : shade(base, 0.88 + nv * 0.2 + (y % 8 === 1 ? 0.1 : 0));
      gl = mortar ? 0.1 : 0.4;
    } else if (P === 'device') {
      const e = Math.min(x, y, TS - 1 - x, TS - 1 - y);
      c = shade(base, e === 0 ? 0.55 : e === 1 ? 1.15 : 0.95 + nv * 0.1);
      if (x > 7 && x < 24 && y > 6 && y < 20) {
        c = [24, 26, 34];
        if (y % 3 === 0 || (x > 10 && x < 21 && y > 9 && y < 17 && (x + y) % 4 === 0)) { c = mix(acc, [255, 255, 255], 0.2); em = 1; }
      }
      if (y > 23 && y < 27 && x > 5 && x < 27 && x % 3 !== 0) { c = shade(base, 0.6); }
      gl = 0.5;
    } else if (P === 'fibre') {
      // spun fibre: long diagonal strands with bright filaments
      const f = Math.sin((x * 0.9 + y * 0.35) + n1(x / 3, y / 3) * 4.0);
      c = shade(mix(base, acc, clamp01(f * 0.5 + 0.2)), 0.8 + nv * 0.25);
      if (f > 0.93) { c = mix(c, [255, 255, 255], 0.35); gl = 0.6; }
      else gl = 0.3;
    } else if (P === 'crystal') {
      const w = makeWorleyCached(t, rand, 8)(x, y);
      const facet = 0.75 + w[2] * 0.45 + (x - y) * 0.004;
      c = shade(mix(base, acc, w[2] * 0.4), facet);
      if (w[1] - w[0] < 1.0) { c = mix(c, acc, 0.85); em = 1; gl = 0.9; }
      else gl = 0.85;
      gt = w[0] < 1.5 ? 0.7 : 0.1;
    } else if (P === 'rail') {
      const rail = x === 4 || x === 5 || x === 26 || x === 27;
      const rung = y % 8 === 3 || y % 8 === 4;
      if (rail || (rung && x > 4 && x < 27)) {
        c = shade(base, rail ? 1.1 : 0.95);
        if (rung && !rail && x % 4 === 0) { c = acc; em = 1; }
        if (rail && y % 8 === 0) { c = acc; em = 1; }
        gl = 0.6;
      } else a = 0;
    } else if (P === 'plant' || P === 'bulb') {
      a = 0;
    }
    px(x, y, c, a, emAbs || em * Math.min(1, E * 1.6), gl, gt);
  }

  if (P === 'plant') paintPlant(t, alb, mat, rand, base, acc, glowMode, E);
  if (P === 'bulb') paintBulb(alb, mat, base, acc, glowMode, t.name.includes('kelp'));

  if (t.lip && t.lip.glow) paintLip(alb, mat, t.lip, hex, rand, glowMode);
  else if (t.lip) {
    const lc = hex(t.lip.color);
    for (let x = 0; x < TS; x++) {
      const depth = t.lip.px * (TS / 16) + (t.lip.ragged ? Math.floor(rand() * 3) : 0);
      for (let y = 0; y < depth; y++) {
        const i = (x + y * TS) * 4;
        const k = 0.85 + rand() * 0.3 - (y === depth - 1 ? 0.2 : 0);
        alb[i] = lc[0] * k; alb[i + 1] = lc[1] * k; alb[i + 2] = lc[2] * k;
        if (y % 8 === 0) { alb[i] = Math.min(255, lc[0] * 1.4); alb[i + 1] = Math.min(255, lc[1] * 1.3); alb[i + 2] = Math.min(255, lc[2] * 1.4); }
        mat[i + 1] = 100;
      }
    }
  }
  return { alb, mat };
}

const worleyCache = new Map();
function makeWorleyCached(t, rand, n) {
  const k = t.name + ':' + n;
  if (!worleyCache.has(k)) worleyCache.set(k, makeWorley(rand, Math.round(n)));
  return worleyCache.get(k);
}

const circuitCache = new Map();
function circuitMask(t, rand) {
  if (circuitCache.has(t.name)) return circuitCache.get(t.name);
  const m = new Uint8Array(TS * TS);
  for (let k = 0; k < 7; k++) {
    let x = Math.floor(rand() * TS), y = Math.floor(rand() * TS);
    let dir = Math.floor(rand() * 4);
    const len = 10 + Math.floor(rand() * 20);
    m[x + y * TS] = 2;
    for (let s = 0; s < len; s++) {
      if (rand() < 0.15) dir = (dir + (rand() < 0.5 ? 1 : 3)) % 4;
      x = (x + [1, 0, -1, 0][dir] + TS) % TS; y = (y + [0, 1, 0, -1][dir] + TS) % TS;
      if (m[x + y * TS] !== 2) m[x + y * TS] = 1;
    }
    m[x + y * TS] = 2;
  }
  circuitCache.set(t.name, m);
  return m;
}

function paintPlant(t, alb, mat, rand, base, acc, glowMode, E) {
  const put = (x, y, c, em = 0) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= TS || y >= TS) return;
    const i = (x + (TS - 1 - y) * TS) * 4; // y up
    alb[i] = c[0]; alb[i + 1] = c[1]; alb[i + 2] = c[2]; alb[i + 3] = 255;
    mat[i] = Math.min(255, em * 255); mat[i + 1] = 90; mat[i + 2] = 0; mat[i + 3] = (glowMode / 3) * 255;
  };
  const dot = (x, y, r, c, em) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + 0.5) put(x + dx, y + dy, c, em); };
  if (t.name.includes('crop')) {
    // sun crop: stage 0 sprouts → stage 3 tall stalks with glowing golden seed heads
    const st = +(t.name.match(/(\d)$/) || [0, 0])[1];
    const top = 7 + st * 7;
    for (let s = 0; s < 4; s++) {
      let x = 5 + s * 7 + rand() * 2;
      const h = top - rand() * 3;
      for (let y = 0; y < h; y++) {
        x += Math.sin(y * 0.3 + s) * 0.15;
        put(x, y, scale(base, 0.8 + (y / h) * 0.4));
        if (y > 2 && y % 4 === s % 2) { put(x - 1, y + 1, scale(base, 1.15)); put(x + 1, y + 1, scale(base, 1.15)); }
      }
      if (st >= 2) {
        const r = st === 3 ? 2 : 1;
        for (let k = 0; k < 3 + st; k++) dot(x + (k % 2 ? 1 : -1) * 0.6, h - k * 1.6, r - (k > 2 ? 1 : 0), mix(acc, [255, 255, 255], st === 3 ? 0.35 : 0), st === 3 ? 1 : 0.4);
      }
    }
    return;
  }
  if (t.name.includes('sapling')) {
    for (let y = 0; y < 16; y++) { put(15, y, base); put(16, y, scale(base, 1.3)); }
    for (const [cx, cy, r] of [[15.5, 18, 5], [11, 14, 3], [20, 15, 3]]) dot(cx, cy, r, mix(acc, [20, 90, 70], 0.5), 0.2);
    for (const [cx, cy] of [[14, 20], [18, 17], [11, 15]]) dot(cx, cy, 1, acc, 1);
    return;
  }
  if (t.name.includes('vine')) {
    // hanging data cables with glowing packets
    for (let s = 0; s < 4; s++) {
      let x = 5 + s * 7 + rand() * 3;
      for (let y = TS - 1; y > 2 + rand() * 8; y--) {
        x += Math.sin(y * 0.4 + s) * 0.35;
        put(x, y, scale(base, 0.8 + rand() * 0.4), 0.15);
        if (y % 6 === s % 3) dot(x, y, 1, acc, 1);
      }
    }
  } else if (t.name.includes('kelp')) {
    for (let s = 0; s < 3; s++) {
      let x = 7 + s * 9 + rand() * 2;
      const top = 26 + rand() * 5;
      for (let y = 0; y < top; y++) {
        x += Math.sin(y * 0.3 + s * 2) * 0.5;
        put(x, y, scale(base, 0.8 + rand() * 0.3)); put(x + 1, y, scale(base, 0.7));
        if (y % 5 === 2) { put(x - 1, y, acc, 1); put(x + 2, y, acc, 1); }
      }
      dot(x, top, 1, mix(acc, [255, 255, 255], 0.4), 1);
    }
  } else {
    // lumen bloom: stems with leaves and a glowing flower head
    for (let s = 0; s < 3; s++) {
      let x = 10 + s * 6 + rand() * 2;
      const top = 14 + rand() * 12;
      for (let y = 0; y < top; y++) {
        x += (s - 1) * 0.12;
        put(x, y, scale(base, 0.85 + rand() * 0.3));
        if (y > 3 && y % 5 === 0) { put(x - 1, y + 1, base); put(x - 2, y + 2, scale(base, 1.2)); put(x + 1, y + 1, base); put(x + 2, y + 2, scale(base, 1.2)); }
      }
      dot(x, top + 2, 3, acc, 1);
      dot(x, top + 2, 1, mix(acc, [255, 255, 255], 0.7), 1);
    }
  }
}

function paintBulb(alb, mat, base, acc, glowMode, small) {
  const put = (x, yy, c, em) => {
    if (x < 0 || yy < 0 || x >= TS || yy >= TS) return;
    const i = (x + (TS - 1 - yy) * TS) * 4;
    alb[i] = c[0]; alb[i + 1] = c[1]; alb[i + 2] = c[2]; alb[i + 3] = 255;
    mat[i] = em * 255; mat[i + 1] = 200; mat[i + 2] = 0; mat[i + 3] = (glowMode / 3) * 255;
  };
  if (small) {
    // kelp bulbs: a frond with a few small glowing pods
    for (let y = 0; y < 26; y++) { const x = Math.round(15 + Math.sin(y * 0.35) * 2); put(x, y, scale(base, 0.55), 0); put(x + 1, y, scale(base, 0.45), 0); }
    for (const [cx, cy, r] of [[11, 22, 3], [20, 15, 3], [12, 9, 2.5], [18, 26, 2]]) {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d <= r) put(cx + dx, cy + dy, mix(acc, base, d / (r + 1)), 1);
      }
    }
    return;
  }
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const yy = TS - 1 - y;
    const dx = x - 15.5, dy = yy - 17;
    const d = Math.sqrt(dx * dx + dy * dy * 0.8);
    if (d < 7) put(x, yy, mix(mix(base, [255, 255, 255], 0.5), acc, d / 8), 1);
    else if (yy < 11 && Math.abs(dx) < 3) put(x, yy, yy % 2 ? [140, 150, 170] : [90, 100, 120], 0);
  }
}

export function buildAtlas(THREE, TILES) {
  const n = Math.max(1, TILES.length);
  const albData = new Uint8Array(TS * TS * 4 * n), matData = new Uint8Array(TS * TS * 4 * n);
  const painted = [];
  TILES.forEach((t0, i) => {
    const t = { ...t0, ...(STYLE[t0.name] || {}) };
    const { alb, mat } = paintTile(t);
    albData.set(alb, i * TS * TS * 4); matData.set(mat, i * TS * TS * 4);
    painted.push(alb);
  });
  const mk = (data, srgb) => {
    const tex = new THREE.DataArrayTexture(data, TS, TS, n);
    tex.format = THREE.RGBAFormat; tex.type = THREE.UnsignedByteType;
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.generateMipmaps = true; tex.anisotropy = 4;
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  };
  const albedo = mk(albData, true), mat = mk(matData, false);

  const iconCache = new Map();
  // Small isometric cube (or sprite) icon for the UI, as a data URL.
  function iconURL(block, size = 64) {
    if (!block) return '';
    const key = block.id + ':' + size;
    if (iconCache.has(key)) return iconCache.get(key);
    const tileCanvas = (ti, k = 1) => {
      const c = document.createElement('canvas'); c.width = c.height = TS;
      const g = c.getContext('2d'); const img = g.createImageData(TS, TS);
      const src = painted[ti] || painted[0];
      for (let i = 0; i < src.length; i += 4) { img.data[i] = src[i] * k; img.data[i + 1] = src[i + 1] * k; img.data[i + 2] = src[i + 2] * k; img.data[i + 3] = src[i + 3]; }
      g.putImageData(img, 0, 0); return c;
    };
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    if (block.plant) {
      g.drawImage(tileCanvas(block.tile.side), 0, 0, size, size);
    } else {
      const h = size * 0.25, w = size * 0.5;
      g.setTransform(w / TS, h / TS, -w / TS, h / TS, size / 2, 0); g.drawImage(tileCanvas(block.tile.top), 0, 0);
      g.setTransform(w / TS, h / TS, 0, (size * 0.5) / TS, 0, h); g.drawImage(tileCanvas(block.tile.side, 0.78), 0, 0);
      g.setTransform(w / TS, -h / TS, 0, (size * 0.5) / TS, w, h * 2); g.drawImage(tileCanvas(block.tile.side, 0.6), 0, 0);
      g.setTransform(1, 0, 0, 1, 0, 0);
    }
    const url = cv.toDataURL();
    iconCache.set(key, url);
    return url;
  }
  return { albedo, mat, count: n, size: TS, iconURL, painted };
}
