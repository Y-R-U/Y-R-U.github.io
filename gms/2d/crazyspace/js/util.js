// util.js — math, vectors, rng, small helpers (no dependencies)

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sign = (v) => (v < 0 ? -1 : v > 0 ? 1 : 0);

export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const chance = (p) => Math.random() < p;
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];

export function weighted(items) {
  // items: [{w, ...}] -> returns one item by weight
  let total = 0;
  for (const it of items) total += it.w;
  let r = Math.random() * total;
  for (const it of items) {
    r -= it.w;
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

export const dist2 = (ax, ay, bx, by) => {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
};
export const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));

// shortest signed difference a->b in radians, range (-PI, PI]
export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d < -Math.PI) d += TAU;
  if (d > Math.PI) d -= TAU;
  return d;
}
export function normAngle(a) {
  a %= TAU;
  if (a < 0) a += TAU;
  return a;
}
// rotate angle a toward b by at most maxStep radians
export function rotateToward(a, b, maxStep) {
  const d = angleDiff(a, b);
  if (Math.abs(d) <= maxStep) return b;
  return a + sign(d) * maxStep;
}
export const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);

export function approach(v, target, rate) {
  if (v < target) return Math.min(target, v + rate);
  if (v > target) return Math.max(target, v - rate);
  return v;
}

export const fmtTime = (sec) => {
  sec = Math.max(0, Math.ceil(sec));
  const m = (sec / 60) | 0;
  const s = sec % 60;
  return m + ':' + (s < 10 ? '0' + s : s);
};

let _id = 1;
export const uid = () => _id++;

// ship/bot names for flavour
export const NAMES = [
  'Vortex', 'Nova', 'Reaper', 'Specter', 'Comet', 'Razor', 'Hex', 'Drift',
  'Pulse', 'Blaze', 'Cyclo', 'Ion', 'Ghost', 'Vega', 'Talon', 'Zephyr',
  'Quasar', 'Rogue', 'Surge', 'Mako', 'Onyx', 'Frost', 'Volt', 'Nyx',
  'Echo', 'Saber', 'Wraith', 'Cobra', 'Flux', 'Striker', 'Banshee', 'Halo',
];
