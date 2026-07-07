// ---- math & misc helpers ----
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2 = (ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; };
export const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
export const len = (x, y) => Math.sqrt(x * x + y * y);

export function norm(x, y, out) {
  const l = Math.sqrt(x * x + y * y);
  if (l < 1e-6) { out.x = 0; out.y = 0; return out; }
  out.x = x / l; out.y = y / l; return out;
}

// shortest-path angle lerp
export function angLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// exponential smoothing factor that is framerate independent
export const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

export const rand = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
export const irand = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const chance = (p) => Math.random() < p;

// seeded rng
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function strSeed(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function poisson(lambda, rng = Math.random) {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rng(); } while (p > L && k < 12);
  return k - 1;
}

// direction vector -> 8-way index (0=N going clockwise: N,NE,E,SE,S,SW,W,NW)
export function dir8(x, y) {
  if (x === 0 && y === 0) return 4;
  let a = Math.atan2(x, -y); // 0 = up/north
  if (a < 0) a += Math.PI * 2;
  return Math.round(a / (Math.PI / 4)) % 8;
}
export const DIR8_VEC = [
  [0, -1], [0.707, -0.707], [1, 0], [0.707, 0.707],
  [0, 1], [-0.707, 0.707], [-1, 0], [-0.707, -0.707],
];

export function fmtClock(min) {
  const m = Math.floor(min);
  return (m < 10 ? '0' : '') + m + "'";
}

export function shuffle(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function vibrate(ms) {
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* no-op */ }
}
