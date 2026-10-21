import * as THREE from 'three';

// 4×4 sprite atlas drawn once at boot. R = internal shading/detail (multiplied into the particle colour), A = coverage.
export const F = {
  PUFF: 0, PUFF2: 1, GLOW: 2, STREAK: 3, STAR: 4, RING: 5, CONFETTI: 6, SPARKLE: 7,
  FIRE: 8, DROP: 9, DUST: 10, WISP: 11, FLECK: 12, SPRAY: 13, SOOT: 14, POW: 15,
};

function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, s, oct = 4) {
  let t = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { t += vnoise(x * f, y * f, s + i * 17) * amp; f *= 2.03; amp *= 0.5; }
  return t;
}
const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (a, b, v) => { const t = sat((v - a) / (b - a)); return t * t * (3 - 2 * t); };

// signed distance to a true star polygon (negative inside)
const STAR_PTS = [];
for (let i = 0; i < 10; i++) {
  const r = i % 2 ? 0.4 : 0.95, a = Math.PI / 2 + (i * Math.PI) / 5;
  STAR_PTS.push([Math.cos(a) * r, Math.sin(a) * r - 0.06]);
}
function star(x, y) {
  let d = 1e9, inside = false;
  for (let i = 0, j = 9; i < 10; j = i++) {
    const [ax, ay] = STAR_PTS[j], [bx, by] = STAR_PTS[i];
    const ex = bx - ax, ey = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey)));
    d = Math.min(d, Math.hypot(x - ax - ex * t, y - ay - ey * t));
    if ((ay > y) !== (by > y) && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
  }
  return inside ? -d : d;
}

const CELL = 128;
const painters = [
  // PUFF: billowy smoke ball
  (x, y) => {
    const r = Math.hypot(x, y), n = fbm(x * 2.2 + 3, y * 2.2, 11);
    const a = sat(1 - sstep(0.25, 0.98, r + (n - 0.5) * 0.55)) ;
    return [0.72 + 0.28 * sat(n * 1.3 - 0.1 + y * -0.25), a * 0.95];
  },
  (x, y) => {
    const r = Math.hypot(x * 1.05, y), n = fbm(x * 2.8 - 7, y * 2.8 + 1, 23);
    const a = sat(1 - sstep(0.2, 0.95, r + (n - 0.5) * 0.7));
    return [0.68 + 0.32 * sat(n * 1.4 - 0.2), a * 0.9];
  },
  // GLOW
  (x, y) => { const r = Math.hypot(x, y); return [1, Math.exp(-r * r * 6) * sat(1 - r)]; },
  // STREAK: long along x, thin in y
  (x, y) => { const t = Math.exp(-y * y * 90) * sat(1 - Math.abs(x)) ** 0.7; return [1, t]; },
  // STAR: cartoon star with darker outline band
  (x, y) => {
    const d = star(x, y);
    const a = sat(0.5 - d * 60);
    const inner = sat(0.5 - (d + 0.07) * 60);
    const hl = sat(0.5 - Math.hypot(x + 0.15, y + 0.2) * 3);
    return [0.55 + 0.4 * inner + 0.05 * hl, a];
  },
  // RING
  (x, y) => { const r = Math.hypot(x, y); return [1, Math.exp(-((r - 0.8) ** 2) * 220) * sat((1 - r) * 12)]; },
  // CONFETTI: a small rectangle with a fold shade
  (x, y) => {
    const a = sat((0.62 - Math.abs(x)) * 40) * sat((0.36 - Math.abs(y)) * 40);
    return [x < 0 ? 1 : 0.78, a];
  },
  // SPARKLE: 4-point twinkle
  (x, y) => {
    const r = Math.hypot(x, y);
    const arms = Math.exp(-Math.abs(x) * 26) * sat(1 - Math.abs(y)) + Math.exp(-Math.abs(y) * 26) * sat(1 - Math.abs(x));
    return [1, sat(arms * 0.9 + Math.exp(-r * r * 30))];
  },
  // FIRE: contrasty flame blob, hot core
  (x, y) => {
    const n = fbm(x * 3 + 2, y * 3 - 4, 41), r = Math.hypot(x, y * 0.85 + 0.08);
    const a = sat(1 - sstep(0.15, 0.9, r + (n - 0.5) * 0.8));
    return [0.55 + 0.45 * sat(1 - r * 1.4 + n * 0.3), a];
  },
  // DROP: elongated droplet blob
  (x, y) => { const r = Math.hypot(x * 2.6, y * 1.1); return [0.85 + 0.15 * sat(-y), sat(1 - r) ** 1.5]; },
  // DUST: grainy clump
  (x, y) => {
    const r = Math.hypot(x, y), n = fbm(x * 4 + 9, y * 4, 57, 5), g = hash(Math.floor((x + 1) * 40), Math.floor((y + 1) * 40), 3);
    const a = sat(1 - sstep(0.15, 1.0, r + (n - 0.5) * 0.8)) * (0.75 + 0.25 * g);
    return [0.65 + 0.35 * n, a * 0.9];
  },
  // WISP: stretched soft cloud
  (x, y) => {
    const n = fbm(x * 1.6 + 1, y * 5, 71);
    const a = sat(1 - Math.abs(x) ** 2) * Math.exp(-y * y * 7) * sat(n * 1.6 - 0.25);
    return [0.9 + 0.1 * n, a];
  },
  // FLECK: scattered grass/dirt bits
  (x, y) => {
    let a = 0;
    for (let i = 0; i < 9; i++) {
      const cx = hash(i, 1, 5) * 1.6 - 0.8, cy = hash(i, 2, 5) * 1.6 - 0.8, ang = hash(i, 3, 5) * 3.14;
      const dx = x - cx, dy = y - cy, u = dx * Math.cos(ang) + dy * Math.sin(ang), v = -dx * Math.sin(ang) + dy * Math.cos(ang);
      a = Math.max(a, sat((0.16 - Math.abs(u)) * 30) * sat((0.035 - Math.abs(v)) * 40));
    }
    return [0.8 + 0.2 * hash(Math.floor(x * 30), Math.floor(y * 30), 9), a];
  },
  // SPRAY: cluster of droplets
  (x, y) => {
    let a = 0;
    for (let i = 0; i < 14; i++) {
      const cx = (hash(i, 7, 8) - 0.5) * 1.5, cy = (hash(i, 8, 8) - 0.5) * 1.5, rr = 0.05 + hash(i, 9, 8) * 0.09;
      a = Math.max(a, sat(1 - Math.hypot(x - cx, y - cy) / rr));
    }
    return [1, a + Math.exp(-(x * x + y * y) * 5) * 0.25];
  },
  // SOOT: denser, lumpier puff for black smoke
  (x, y) => {
    const r = Math.hypot(x, y), n = fbm(x * 2 - 5, y * 2 + 5, 91, 5);
    const a = sat(1 - sstep(0.3, 1.0, r + (n - 0.5) * 0.65));
    return [0.6 + 0.4 * sat(n * 1.5 - 0.2 - y * 0.3), a];
  },
  // POW: jagged comic burst
  (x, y) => {
    const ang = Math.atan2(y, x), r = Math.hypot(x, y);
    const jag = 0.62 + 0.3 * (hash(Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 11), 0, 13) * 0.5 + 0.5) * (0.5 + 0.5 * Math.cos(ang * 11));
    const a = sat((jag - r) * 30);
    return [r < jag * 0.6 ? 1 : 0.8, a];
  },
];

export function createAtlas() {
  const size = CELL * 4;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let f = 0; f < 16; f++) {
    const p = painters[f], ox = (f % 4) * CELL, oy = Math.floor(f / 4) * CELL;
    for (let j = 0; j < CELL; j++) {
      for (let i = 0; i < CELL; i++) {
        // cell-local coords -1..1, +y up; leave a 2px gutter so mips don't bleed
        const x = ((i + 0.5) / CELL) * 2.08 - 1.04, y = 1.04 - ((j + 0.5) / CELL) * 2.08;
        let [l, a] = p(x, y);
        if (i < 2 || j < 2 || i > CELL - 3 || j > CELL - 3) a = 0;
        const k = ((oy + j) * size + ox + i) * 4;
        const L = Math.round(sat(l) * 255);
        d[k] = L; d[k + 1] = L; d[k + 2] = L; d[k + 3] = Math.round(sat(a) * 255);
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.premultiplyAlpha = false;
  return { texture: tex, canvas: cv };
}
