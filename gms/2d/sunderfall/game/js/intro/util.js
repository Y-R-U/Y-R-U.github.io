// Small maths kit for the intro. Deterministic — the same seed paints the same forest every time.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const r = mulberry32(seed);
  r.range = (a, b) => a + (b - a) * r();
  r.int = (a, b) => Math.floor(a + (b - a + 1) * r());
  r.pick = (arr) => arr[Math.floor(r() * arr.length) % arr.length];
  r.sign = () => (r() < 0.5 ? -1 : 1);
  // bell-ish, cheap
  r.gauss = () => (r() + r() + r() - 1.5) * 1.1547;
  return r;
}

const P = new Uint8Array(512);
{
  const rr = mulberry32(0x5eed1);
  const perm = new Uint8Array(256);
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(rr() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  for (let i = 0; i < 512; i++) P[i] = perm[i & 255];
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;
const grad2 = (h, x, y) => {
  switch (h & 7) {
    case 0: return x + y; case 1: return -x + y; case 2: return x - y; case 3: return -x - y;
    case 4: return x; case 5: return -x; case 6: return y; default: return -y;
  }
};

export function noise2(x, y) {
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
  x -= Math.floor(x); y -= Math.floor(y);
  const u = fade(x), v = fade(y);
  const A = P[X] + Y, B = P[X + 1] + Y;
  return lerp(
    lerp(grad2(P[A], x, y), grad2(P[B], x - 1, y), u),
    lerp(grad2(P[A + 1], x, y - 1), grad2(P[B + 1], x - 1, y - 1), u), v);
}

export function fbm2(x, y, oct = 5, lac = 2.03, gain = 0.5) {
  let a = 0.5, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise2(x * f, y * f); n += a; a *= gain; f *= lac; }
  return s / n;
}

export function ridged(x, y, oct = 4) {
  let a = 0.5, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * (1 - Math.abs(noise2(x * f, y * f))); n += a; a *= 0.5; f *= 2.07; }
  return s / n;
}

// curl of a 2D noise potential — divergence-free flow, the reason smoke looks like smoke
export function curl(x, y, e = 0.35) {
  const n1 = fbm2(x, y + e, 3), n2 = fbm2(x, y - e, 3);
  const n3 = fbm2(x + e, y, 3), n4 = fbm2(x - e, y, 3);
  return [(n1 - n2) / (2 * e), -(n3 - n4) / (2 * e)];
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const mix = lerp;
export const smoothstep = (a, b, x) => { const t = sat((x - a) / (b - a || 1e-6)); return t * t * (3 - 2 * t); };
export const smootherstep = (a, b, x) => { const t = sat((x - a) / (b - a || 1e-6)); return t * t * t * (t * (t * 6 - 15) + 10); };

export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuint: (t) => 1 - Math.pow(1 - t, 5),
  inExpo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  outBack: (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
  outElastic: (t) => (t === 0 || t === 1 ? t : Math.pow(2, -9 * t) * Math.sin((t * 10 - 0.75) * 2.0944) + 1),
  // a strike: instant rise, long decay. `k` = how fast it settles.
  hit: (t, k = 6) => Math.exp(-k * t),
};

// 0 at t<=a, 1 at t>=b
export function span(t, a, b) { return sat((t - a) / (b - a || 1e-6)); }
// triangular window: 0 → 1 → 0 across [a,b]
export function pulse(t, a, b) { const x = span(t, a, b); return 1 - Math.abs(x * 2 - 1); }

export function hsl2rgb(h, s, l) {
  h = ((h % 1) + 1) % 1;
  const f = (n) => {
    const k = (n + h * 12) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return [f(0), f(8), f(4)];
}

export const rgba = (r, g, b, a = 1) =>
  `rgba(${Math.round(sat(r) * 255)},${Math.round(sat(g) * 255)},${Math.round(sat(b) * 255)},${a})`;
