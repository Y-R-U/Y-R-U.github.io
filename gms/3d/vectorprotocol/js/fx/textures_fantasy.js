import * as THREE from 'three';
import { rng, normalFromHeight, memoTex } from './textures.js';

// Procedural canvas textures for the fantasy ruins arena (D21, refs/ref_fantasy_01.jpg). Deterministic per seed.
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, { srgb = true, repeat = false, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}
const h2 = (i, j, s) => { let h = (i * 374761393 + j * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function noise2(x, y, s) {
  const i = Math.floor(x), j = Math.floor(y); let fx = x - i, fy = y - j;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = h2(i, j, s), b = h2(i + 1, j, s), c = h2(i, j + 1, s), d = h2(i + 1, j + 1, s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
const fbm = (x, y, s, o = 3) => { let v = 0, a = 0.5, f = 1; for (let k = 0; k < o; k++) { v += noise2(x * f, y * f, s + k * 17) * a; f *= 2.03; a *= 0.5; } return v / (1 - Math.pow(0.5, o)); };
const sst = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Ground (battle-7): large flat flagstone slabs (voronoi on a low-jitter 2 m lattice -> big 4-6 sided slabs), narrow soil joints with moss and
// grass spilling over, worn / chipped slab edges, and a network of fine cracks inside each slab (sub-voronoi edges, about half of them drawn)
// so the slabs read as big cracked stones rather than crazy paving. A worn lighter pool in the middle, darker wild margins.
// rect = world { x0, x1, zFar, zNear }; board = the playable rect (kept cleaner); returns { map, normal }.
export function flagstoneTextures(o) { const g = flagstoneGen(o); let r; while (!(r = g.next()).done); return r.value; }
// battle-10: the same work in frame-budgeted slices (~200-500 ms in one go was the fantasy battle's load hitch). Resolves { map, normal }.
export function flagstoneTexturesAsync(o, { budget = 8, idle = false } = {}) {
  const g = flagstoneGen(o);
  const wait = (f) => (idle && window.requestIdleCallback ? requestIdleCallback(f, { timeout: 500 }) : !document.hidden && window.requestAnimationFrame ? requestAnimationFrame(() => f()) : setTimeout(f, 16));
  return new Promise((resolve, reject) => {
    const step = () => {
      try {
        const t0 = performance.now();
        for (;;) { const r = g.next(); if (r.done) { resolve(r.value); return; } if (performance.now() - t0 > budget) break; }
      } catch (e) { reject(e); return; }
      wait(step);
    };
    step();
  });
}
function* flagstoneGen({ rect, board, px = 40, seed = 7, cell = 2.05 }) {
  const Wm = rect.x1 - rect.x0, Lm = rect.zNear - rect.zFar;
  const w = Math.round(Wm * px), h = Math.round(Lm * px);
  const [cm, m] = canvas(w, h), [ch, hh] = canvas(w, h);
  const img = m.createImageData(w, h), hgt = hh.createImageData(w, h);
  const D = img.data, H = hgt.data;
  const S = seed * 13 + 1;
  // a jittered lattice of cell points (cached), slab lattice + crack lattice
  function lattice(c, jit, salt) {
    const i0 = Math.floor(rect.x0 / c) - 2, j0 = Math.floor(rect.zFar / c) - 2, cw = Math.ceil(Wm / c) + 5, chh = Math.ceil(Lm / c) + 5;
    const X = new Float32Array(cw * chh), Z = new Float32Array(cw * chh);
    for (let j = 0; j < chh; j++) for (let i = 0; i < cw; i++) {
      const k = j * cw + i, gi = i + i0, gj = j + j0;
      X[k] = (gi + 0.5 + (h2(gi, gj, S + salt) - 0.5) * jit) * c; Z[k] = (gj + 0.5 + (h2(gi, gj, S + salt + 1) - 0.5) * jit + (gi % 2) * 0.35) * c;
    }
    return { c, i0, j0, cw, X, Z };
  }
  const L1 = lattice(cell, 0.62, 0), L2 = lattice(cell * 0.42, 0.9, 40);
  const out = { d1: 0, d2: 0, k1: 0, k2: 0 };
  function vor(L, x, z) {
    const gi = Math.floor(x / L.c) - L.i0, gj = Math.floor(z / L.c) - L.j0;
    let d1 = 1e9, d2 = 1e9, k1 = 0, k2 = 0;
    for (let dj = -2; dj <= 2; dj++) for (let di = -1; di <= 1; di++) {
      const k = (gj + dj) * L.cw + gi + di;
      const dx = L.X[k] - x, dz = L.Z[k] - z, d = dx * dx + dz * dz;
      if (d < d1) { d2 = d1; k2 = k1; d1 = d; k1 = k; } else if (d < d2) { d2 = d; k2 = k; }
    }
    // exact distance to the bisector between the two nearest points (true edge distance, so joints keep an even width)
    const ax = L.X[k1], az = L.Z[k1], bx = L.X[k2], bz = L.Z[k2];
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, nx = bx - ax, nz = bz - az, nl = Math.hypot(nx, nz) || 1;
    out.d1 = ((x - mx) * -nx + (z - mz) * -nz) / nl; out.k1 = k1; out.k2 = k2;
    return out;
  }
  const bx = board.W / 2;
  for (let y = 0; y < h; y++) {
    const z = rect.zFar + (y + 0.5) / px;
    for (let x = 0; x < w; x++) {
      const X = rect.x0 + (x + 0.5) / px;
      // warp so slab edges wander like split stone, not ruler-straight voronoi lines
      const wx = X + (noise2(X * 1.3, z * 1.3, S + 9) - 0.5) * 0.22 + (noise2(X * 6, z * 6, S + 19) - 0.5) * 0.05;
      const wz = z + (noise2(X * 1.3 + 5, z * 1.3, S + 9) - 0.5) * 0.22 + (noise2(X * 6 + 3, z * 6, S + 19) - 0.5) * 0.05;
      vor(L1, wx, wz);
      const edge = out.d1, k1 = out.k1;
      const tone = h2(k1, 3, S + 2), mossy = h2(k1, 5, S + 3);
      const n1 = fbm(X * 1.4, z * 1.4, S + 4, 3), n2 = noise2(X * 11, z * 11, S + 5), n3 = fbm(X * 4.5, z * 4.5, S + 8, 2);
      const outB = Math.max(0, Math.max(Math.abs(X) - bx, z - board.zNear, board.zFar - z));
      const wild = sst(0, 2.5, outB);
      const cx = X / (bx * 1.3), cz = (z - (board.zNear + board.zFar) / 2) / ((board.zNear - board.zFar) * 0.62);
      const pool = Math.max(0, 1 - (cx * cx + cz * cz));
      const mossField = fbm(X * 0.35, z * 0.35, S + 6, 3);
      // joint width: narrow, but worn / chipped open in patches (corners and where the moss field is high)
      const chip = sst(0.6, 0.9, n3) * 0.05 + sst(0.6, 0.9, mossField) * 0.04;
      const gap = 0.022 + n2 * 0.014 + chip + wild * 0.04;
      let r, g, b, ht;
      const i4 = (y * w + x) * 4;
      if (edge < gap) {
        // joint: dark soil, moss cushions and grass blades
        const gr = sst(0.55, 0.85, noise2(X * 16, z * 16, S + 7)) * (0.3 + wild * 0.7);
        const ms = sst(0.38, 0.62, mossField + n2 * 0.3) * (0.7 + wild * 0.3);
        r = 16 + ms * 30 + gr * 26; g = 14 + ms * 44 + gr * 40; b = 11 + ms * 8 + gr * 7;
        ht = 30 + gr * 50 + ms * 40;
      } else {
        // flat slab: per-slab tone, broad mottling, darker stains, fine grit; only a thin worn bevel at the very edge
        const grain = noise2(X * 34, z * 34, S + 23) - 0.5, grit = h2(Math.floor(X * px * 0.5), Math.floor(z * px * 0.5), S + 29) - 0.5;
        let base = 84 + (tone - 0.5) * 30 + (n1 - 0.5) * 26 + (n2 - 0.5) * 14 + grain * 22 + grit * 12;
        base *= 1 - sst(0.62, 0.85, fbm(X * 0.9 + 7, z * 0.9, S + 12, 3)) * 0.22; // water stains
        r = base * 1.0; g = base * 0.97; b = base * 0.92;
        if (tone > 0.85) { r *= 1.05; b *= 0.9; } else if (tone < 0.12) { r *= 0.92; g *= 0.96; }
        const bev = sst(gap, gap + 0.035, edge);
        // moss creeping in from the joints on some slabs, lots in the wild margin; lichen specks
        const mk = sst(0.6 - wild * 0.4 - mossy * 0.1, 0.8 - wild * 0.4, mossField + sst(gap + 0.25, gap, edge) * 0.3 + (n3 - 0.5) * 0.3) * (0.5 + wild * 0.45);
        r += (44 - r) * mk; g += (56 - g) * mk; b += (26 - b) * mk;
        const lich = sst(0.78, 0.84, noise2(X * 23, z * 23, S + 13)) * 0.35;
        r += (120 - r) * lich * 0.5; g += (118 - g) * lich * 0.5; b += (80 - b) * lich * 0.5;
        // fine cracks inside the slab: sub-voronoi edges, about half of them, fading near the slab edge
        vor(L2, wx * 1.0 + (noise2(X * 9, z * 9, S + 21) - 0.5) * 0.06, wz);
        const pair = h2(Math.min(out.k1, out.k2), Math.max(out.k1, out.k2), S + 31);
        const crk = pair < 0.68 ? sst(0.02, 0.005, Math.abs(out.d1)) * sst(gap + 0.02, gap + 0.12, edge) : 0;
        const shade = (0.62 + 0.38 * bev) * (1 - crk * 0.8);
        r *= shade; g *= shade; b *= shade;
        ht = 150 + bev * 70 + (n1 - 0.5) * 24 - mk * 16 - crk * 110;
      }
      const lum = 0.7 + pool * 0.36 - wild * 0.3;
      D[i4] = Math.min(255, r * lum); D[i4 + 1] = Math.min(255, g * lum); D[i4 + 2] = Math.min(255, b * lum); D[i4 + 3] = 255;
      H[i4] = H[i4 + 1] = H[i4 + 2] = Math.max(0, Math.min(255, ht)); H[i4 + 3] = 255;
    }
    if ((y & 7) === 7) yield;
  }
  m.putImageData(img, 0, 0); hh.putImageData(hgt, 0, 0);
  yield;
  // a few long jagged cracks that run across slabs (dark line + faint lit lip + groove)
  const r = rng(seed * 7 + 3);
  const X = (wx) => (wx - rect.x0) * px, Z = (wz) => (wz - rect.zFar) * px;
  m.lineCap = hh.lineCap = 'round'; m.lineJoin = hh.lineJoin = 'round';
  const nCr = Math.round(Wm * Lm * 0.12);
  for (let i = 0; i < nCr; i++) {
    let x = rect.x0 + r() * Wm, z = rect.zFar + r() * Lm, a = r() * Math.PI * 2;
    const pts = [[X(x), Z(z)]], n = 5 + (r() * 8 | 0), len = 0.15 + r() * 0.25;
    for (let s = 0; s < n; s++) { a += (r() - 0.5) * 1.1; x += Math.cos(a) * len; z += Math.sin(a) * len; pts.push([X(x), Z(z)]); }
    const lw = px * (0.01 + r() * 0.012);
    const path = (c) => { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (const p of pts) c.lineTo(p[0], p[1]); c.stroke(); };
    m.strokeStyle = 'rgba(150,145,130,0.14)'; m.lineWidth = lw * 2.2; m.save(); m.translate(0, -lw * 0.7); path(m); m.restore();
    m.strokeStyle = 'rgba(16,14,10,0.7)'; m.lineWidth = lw; path(m);
    hh.strokeStyle = 'rgba(30,30,30,0.9)'; hh.lineWidth = lw * 1.4; path(hh);
  }
  // fallen leaves / small debris specks, denser toward the margins
  for (let i = 0; i < Wm * Lm * 2.5; i++) {
    const x = r() * w, y = r() * h, s = 1 + r() * px * 0.05;
    m.fillStyle = r() < 0.5 ? `rgba(${110 + r() * 60 | 0},${80 + r() * 40 | 0},30,0.5)` : 'rgba(20,18,12,0.3)';
    m.fillRect(x, y, s, s * (0.5 + r()));
  }
  yield;
  const nm = normalFromHeight(ch, 3.0);
  yield;
  return { map: tex(cm, { aniso: 8 }), normal: tex(nm, { srgb: false, aniso: 8 }) };
}

// One dressed stone block (box faces map 0..1 each): mottled grey, chipped dark edges, a few cracks. Plus its normal map.
function stoneBlockTexturesRaw(seed = 3, size = 256) {
  const [c, x] = canvas(size, size), [ch, hx] = canvas(size, size);
  const img = x.createImageData(size, size), hi = hx.createImageData(size, size);
  const S = seed * 31 + 7;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const u = i / size, v = j / size;
    const n = fbm(u * 6, v * 6, S, 4), n2 = noise2(u * 40, v * 40, S + 3);
    const e = Math.min(u, v, 1 - u, 1 - v) + (noise2(u * 18, v * 18, S + 5) - 0.5) * 0.05;
    const bev = sst(0.0, 0.07, e);
    let k = (100 + (n - 0.5) * 60 + (n2 - 0.5) * 20) * (0.55 + 0.45 * bev);
    const p = (j * size + i) * 4;
    img.data[p] = k * 1.0; img.data[p + 1] = k * 0.97; img.data[p + 2] = k * 0.88; img.data[p + 3] = 255;
    const hv = 70 + bev * 150 + (n - 0.5) * 40;
    hi.data[p] = hi.data[p + 1] = hi.data[p + 2] = hv; hi.data[p + 3] = 255;
  }
  x.putImageData(img, 0, 0); hx.putImageData(hi, 0, 0);
  const r = rng(seed);
  for (let i = 0; i < 5; i++) {
    let px = r() * size, py = r() * size, a = r() * 6.28;
    x.beginPath(); hx.beginPath(); x.moveTo(px, py); hx.moveTo(px, py);
    for (let s = 0; s < 6; s++) { a += (r() - 0.5) * 1.2; px += Math.cos(a) * size * 0.06; py += Math.sin(a) * size * 0.06; x.lineTo(px, py); hx.lineTo(px, py); }
    x.strokeStyle = 'rgba(20,18,14,0.7)'; x.lineWidth = 1.5; x.stroke();
    hx.strokeStyle = 'rgba(20,20,20,0.9)'; hx.lineWidth = 2.5; hx.stroke();
  }
  return { map: tex(c), normal: tex(normalFromHeight(ch, 2.4), { srgb: false }) };
}

// Pedestal top + sides: carved octagon slab. u,v planar on the top (0..1 across), the sides use v near 0.
// Grey with a chiselled inner border and a cracked tile pattern; the battle tints it per faction (instance colour).
function pedestalTexturesRaw(seed = 5, size = 256) {
  const [c, x] = canvas(size, size), [ch, hx] = canvas(size, size);
  const img = x.createImageData(size, size), hi = hx.createImageData(size, size);
  const S = seed * 17 + 3;
  const oct = (u, v) => { const a = Math.abs(u), b = Math.abs(v); return Math.max(a, b, (a + b) * 0.7071); };
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const u = i / size * 2 - 1, v = j / size * 2 - 1;
    const o = oct(u, v);
    const n = fbm(u * 4, v * 4, S, 4), n2 = noise2(u * 30, v * 30, S + 1);
    // inner carved border groove at o ~ 0.78, tile seams inside (cross + diagonal)
    const groove = sst(0.035, 0.0, Math.abs(o - 0.8));
    const seam = (o < 0.76) ? Math.max(sst(0.025, 0.0, Math.abs(u)), sst(0.025, 0.0, Math.abs(v)), sst(0.02, 0.0, Math.abs(Math.abs(u) - Math.abs(v)) * 0.7071) * 0.7) : 0;
    let k = 170 + (n - 0.5) * 70 + (n2 - 0.5) * 24;
    k *= 1 - groove * 0.55 - seam * 0.5;
    k *= 0.8 + 0.2 * sst(1.0, 0.85, o); // worn darker rim
    const p = (j * size + i) * 4;
    img.data[p] = img.data[p + 1] = img.data[p + 2] = Math.max(0, Math.min(255, k)); img.data[p + 3] = 255;
    const hv = 160 - groove * 110 - seam * 90 + (n - 0.5) * 40;
    hi.data[p] = hi.data[p + 1] = hi.data[p + 2] = hv; hi.data[p + 3] = 255;
  }
  x.putImageData(img, 0, 0); hx.putImageData(hi, 0, 0);
  const r = rng(seed);
  for (let i = 0; i < 7; i++) {
    let px = size * (0.2 + r() * 0.6), py = size * (0.2 + r() * 0.6), a = r() * 6.28;
    x.beginPath(); hx.beginPath(); x.moveTo(px, py); hx.moveTo(px, py);
    for (let s = 0; s < 5; s++) { a += (r() - 0.5) * 1.4; px += Math.cos(a) * size * 0.05; py += Math.sin(a) * size * 0.05; x.lineTo(px, py); hx.lineTo(px, py); }
    x.strokeStyle = 'rgba(30,30,30,0.6)'; x.lineWidth = 1.2; x.stroke();
    hx.strokeStyle = 'rgba(40,40,40,0.9)'; hx.lineWidth = 2; hx.stroke();
  }
  return { map: tex(c), normal: tex(normalFromHeight(ch, 2.6), { srgb: false }) };
}

// Foliage atlas (alpha): [0] ivy/leaf cluster, [1] grass tuft, [2] fern; 3 columns of 128 x 128.
function foliageTextureRaw(seed = 9) {
  const [c, x] = canvas(384, 128);
  const r = rng(seed);
  const leaf = (cx, cy, s, a, col) => {
    x.save(); x.translate(cx, cy); x.rotate(a); x.fillStyle = col;
    x.beginPath(); x.moveTo(0, -s); x.quadraticCurveTo(s * 0.7, -s * 0.2, 0, s * 0.6); x.quadraticCurveTo(-s * 0.7, -s * 0.2, 0, -s); x.fill(); x.restore();
  };
  const green = (k) => `rgb(${42 + k * 48 | 0},${58 + k * 56 | 0},${22 + k * 16 | 0})`;
  // ivy cluster
  for (let i = 0; i < 70; i++) {
    const a = r() * 6.28, d = Math.sqrt(r()) * 50;
    leaf(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 8 + r() * 8, r() * 6.28, green(r() * 0.9 + (d < 25 ? 0.1 : 0)));
  }
  // grass tuft (blades from the bottom)
  for (let i = 0; i < 46; i++) {
    const bx = 128 + 24 + r() * 80, top = 8 + r() * 60, lean = (r() - 0.5) * 50;
    x.strokeStyle = green(0.3 + r() * 0.8); x.lineWidth = 2 + r() * 3; x.lineCap = 'round';
    x.beginPath(); x.moveTo(bx, 128); x.quadraticCurveTo(bx + lean * 0.3, (128 + top) / 2, bx + lean, top); x.stroke();
  }
  // fern fronds
  for (let f = 0; f < 6; f++) {
    const a0 = -Math.PI / 2 + (f - 2.5) * 0.42, len = 50 + r() * 10;
    for (let s = 0; s < 12; s++) {
      const t = s / 12, px = 256 + 64 + Math.cos(a0) * len * t, py = 124 + Math.sin(a0) * len * t;
      leaf(px, py, 7 * (1 - t * 0.6), a0 + 1.4, green(0.35 + t * 0.5)); leaf(px, py, 7 * (1 - t * 0.6), a0 - 1.4 + Math.PI, green(0.3 + t * 0.5));
    }
  }
  return dilatedTexture(c);
}

// Alpha cards: transparent texels carry black after the canvas un-premultiplies, so mips + alphaTest give dark fringes.
// Copy each transparent texel's colour from its nearest opaque neighbour (a few passes), flip rows, upload as data.
function dilatedTexture(c) {
  const w = c.width, h = c.height;
  const src = c.getContext('2d').getImageData(0, 0, w, h).data;
  const d = new Uint8Array(src);
  for (let pass = 0; pass < 6; pass++) {
    const prev = new Uint8Array(d);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (prev[i + 3] > 8 || (prev[i] | prev[i + 1] | prev[i + 2])) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = (yy * w + xx) * 4;
        if (prev[j] | prev[j + 1] | prev[j + 2]) { d[i] = prev[j]; d[i + 1] = prev[j + 1]; d[i + 2] = prev[j + 2]; break; }
      }
    }
  }
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) out.set(d.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  const t = new THREE.DataTexture(out, w, h, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

// Distant tree-line silhouettes for the backdrop: rows of canopies + trunks, alpha. Tiles horizontally.
function treelineTextureRaw(seed = 4, w = 1024, h = 256) {
  const [c, x] = canvas(w, h);
  const r = rng(seed);
  x.fillStyle = '#fff';
  for (let i = 0; i < 40; i++) {
    const cx = r() * w, top = h * (0.05 + r() * 0.4), tw = 6 + r() * 14;
    x.fillRect(cx - tw / 2, top + 20, tw, h - top);
    for (let k = 0; k < 9; k++) {
      const rr = 20 + r() * 46, ox = (r() - 0.5) * 70, oy = r() * 70;
      for (const dx of [-w, 0, w]) { x.beginPath(); x.arc(cx + dx + ox, top + oy, rr, 0, 7); x.fill(); }
    }
  }
  x.fillRect(0, h * 0.75, w, h * 0.25);
  return tex(c, { repeat: true });
}

// battle-10: cached per module (see memoTex in textures.js)
export const stoneBlockTextures = memoTex('stone', stoneBlockTexturesRaw);
export const pedestalTextures = memoTex('pedestal', pedestalTexturesRaw);
export const foliageTexture = memoTex('foliage', foliageTextureRaw);
export const treelineTexture = memoTex('treeline', treelineTextureRaw);
