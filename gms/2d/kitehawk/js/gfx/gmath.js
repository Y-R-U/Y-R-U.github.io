/**
 * The handful of maths helpers gfx/ needs. Kept inside gfx/ on purpose: this
 * module is frozen after P2 and must not break if core/math.js is retuned.
 * core/math.js will carry its own copies for everyone else.
 */

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function hash1(n) {
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

/** Deterministic 2D integer hash -> [0,1). Drives the stable part jitter. */
export function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

/** String -> stable 32-bit id, so a part keeps its jitter across sessions. */
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
