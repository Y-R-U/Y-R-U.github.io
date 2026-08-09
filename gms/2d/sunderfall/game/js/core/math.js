export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const mix = lerp;

export function smoothstep(a, b, v) {
  const t = clamp01(invLerp(a, b, v));
  return t * t * (3 - 2 * t);
}
export function smootherstep(a, b, v) {
  const t = clamp01(invLerp(a, b, v));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Frame-rate independent exponential approach. `rate` = fraction remaining after 1s. */
export function damp(a, b, rate, dt) {
  return b + (a - b) * Math.pow(rate, dt);
}

/** Move `a` toward `b` by at most `step`. */
export function approach(a, b, step) {
  if (a < b) return Math.min(a + step, b);
  if (a > b) return Math.max(a - step, b);
  return b;
}

export const len = (x, y) => Math.hypot(x, y);
export const len2 = (x, y) => x * x + y * y;
export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
export const dist2 = (ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay;
  return dx * dx + dy * dy;
};

/** Shortest signed angular difference b-a, in (-PI, PI]. */
export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}
export function lerpAngle(a, b, t) {
  return a + angleDiff(a, b) * t;
}

export function aabbOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah;
}

/* ---- deterministic 1D value noise ------------------------------------ *
 * Used for camera trauma and flicker. Smooth, cheap, no allocation, and
 * repeatable for a given (t, seed) so replays stay identical.            */

function hash1(n) {
  // integer hash -> [0,1)
  n = (n << 13) ^ n;
  n = (n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff;
  return n / 0x7fffffff;
}

export function noise1(t, seed = 0) {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f);
  const a = hash1(i + seed * 7919) * 2 - 1;
  const b = hash1(i + 1 + seed * 7919) * 2 - 1;
  return a + (b - a) * u;
}

/** Two octaves — enough to stop shake reading as a sine wave. */
export function fbm1(t, seed = 0) {
  return noise1(t, seed) * 0.65 + noise1(t * 2.17 + 11.3, seed + 31) * 0.35;
}

export function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}
