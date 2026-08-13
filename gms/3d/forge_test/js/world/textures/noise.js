// Seamless value-noise fields, baked once and bilinearly resampled by every generator.
// Generating noise per-pixel per-texture was too slow in JS; sampling a cached field is not.

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(x, y, s) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

const fade = t => t * t * t * (t * (t * 6 - 15) + 10);

// One octave of value noise that wraps exactly at `period` lattice cells.
function octave(out, size, period, amp, seed) {
  const step = period / size;
  for (let y = 0; y < size; y++) {
    const fy = y * step, iy = Math.floor(fy), ty = fade(fy - iy);
    const y0 = ((iy % period) + period) % period, y1 = (y0 + 1) % period;
    for (let x = 0; x < size; x++) {
      const fx = x * step, ix = Math.floor(fx), tx = fade(fx - ix);
      const x0 = ((ix % period) + period) % period, x1 = (x0 + 1) % period;
      const a = hash(x0, y0, seed), b = hash(x1, y0, seed);
      const c = hash(x0, y1, seed), d = hash(x1, y1, seed);
      const top = a + (b - a) * tx, bot = c + (d - c) * tx;
      out[y * size + x] += (top + (bot - top) * ty) * amp;
    }
  }
}

export class Field {
  constructor({ size = 256, period = 4, octaves = 4, gain = 0.5, seed = 1 } = {}) {
    this.size = size;
    this.data = new Float32Array(size * size);
    let amp = 1, sum = 0, p = period;
    for (let o = 0; o < octaves; o++) {
      octave(this.data, size, p, amp, seed + o * 977);
      sum += amp; amp *= gain; p *= 2;
    }
    const inv = 1 / sum;
    for (let i = 0; i < this.data.length; i++) this.data[i] *= inv;
  }

  // u,v in tile units — 1.0 is one full wrap of the field.
  at(u, v) {
    const S = this.size;
    let x = u * S, y = v * S;
    let ix = Math.floor(x), iy = Math.floor(y);
    const tx = x - ix, ty = y - iy;
    ix = ((ix % S) + S) % S; iy = ((iy % S) + S) % S;
    const ix1 = (ix + 1) % S, iy1 = (iy + 1) % S;
    const d = this.data;
    const a = d[iy * S + ix], b = d[iy * S + ix1];
    const c = d[iy1 * S + ix], e = d[iy1 * S + ix1];
    const top = a + (b - a) * tx, bot = c + (e - c) * tx;
    return top + (bot - top) * ty;
  }
}

let shared = null;
export function fields() {
  if (!shared) {
    shared = {
      grain: new Field({ size: 256, period: 32, octaves: 3, gain: 0.55, seed: 11 }),
      fine: new Field({ size: 256, period: 12, octaves: 4, gain: 0.5, seed: 23 }),
      coarse: new Field({ size: 128, period: 3, octaves: 3, gain: 0.6, seed: 37 }),
      warp: new Field({ size: 128, period: 5, octaves: 2, gain: 0.5, seed: 53 }),
    };
  }
  return shared;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

export function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
}

export function hexRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mixRgb(a, b, t, out) {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
}

// Voronoi over a jittered grid that wraps at `cells`. Returns [f1, f2, cellRandom].
export function voronoi(u, v, cells, seed, jitter = 0.85) {
  const px = u * cells, py = v * cells;
  const gx = Math.floor(px), gy = Math.floor(py);
  let f1 = 1e9, f2 = 1e9, id = 0;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const cx = gx + ox, cy = gy + oy;
      const wx = ((cx % cells) + cells) % cells, wy = ((cy % cells) + cells) % cells;
      const jx = cx + 0.5 + (hash(wx, wy, seed) - 0.5) * jitter;
      const jy = cy + 0.5 + (hash(wx, wy, seed + 91) - 0.5) * jitter;
      const dx = jx - px, dy = jy - py;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < f1) { f2 = f1; f1 = d; id = hash(wx, wy, seed + 313); }
      else if (d < f2) f2 = d;
    }
  }
  return [f1, f2, id];
}
