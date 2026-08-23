/**
 * Seedable RNG. Deterministic across machines — do not swap in Math.random.
 * Pure: no DOM, no wall-clock. `js/sim/**` imports this and node imports it directly.
 *
 * The run's ROOT stream is forked, never reseeded (ARCHITECTURE §6.9). `reseed`
 * exists for the boot path that decides what the root seed is; calling it on a
 * live stream desynchronises every fork taken off it and there is no way to tell
 * from the numbers that it happened.
 */

function mulberry32(a) {
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createRNG(seed = 1) {
  if (typeof seed === 'string') seed = hashSeed(seed);
  let s = seed >>> 0 || 1;
  let next = mulberry32(s);
  let spare = null;

  const rng = {
    get seed() { return s; },

    reseed(v) {
      if (typeof v === 'string') v = hashSeed(v);
      s = v >>> 0 || 1;
      next = mulberry32(s);
      spare = null;
      return rng;
    },

    /** [0,1) */
    next() { return next(); },
    float() { return next(); },

    /** [a,b) — or [0,a) with one argument. */
    range(a, b) {
      if (b === undefined) { b = a; a = 0; }
      return a + next() * (b - a);
    },

    /** integer in [a,b] inclusive — or [0,a-1] with one argument. */
    int(a, b) {
      if (b === undefined) { b = a - 1; a = 0; }
      return a + Math.floor(next() * (b - a + 1));
    },

    bool(p = 0.5) { return next() < p; },
    sign() { return next() < 0.5 ? -1 : 1; },

    /** symmetric [-a, a] */
    spread(a) { return (next() * 2 - 1) * a; },

    pick(arr) { return arr[Math.floor(next() * arr.length)]; },

    /** weights parallel to items */
    weighted(items, weights) {
      let total = 0;
      for (let i = 0; i < weights.length; i++) total += weights[i];
      let r = next() * total;
      for (let i = 0; i < items.length; i++) {
        r -= weights[i];
        if (r <= 0) return items[i];
      }
      return items[items.length - 1];
    },

    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    },

    /** Box-Muller, cached spare so it costs half as much on average. */
    gauss(mean = 0, sd = 1) {
      if (spare !== null) { const v = spare; spare = null; return mean + v * sd; }
      let u, v, sq;
      do {
        u = next() * 2 - 1;
        v = next() * 2 - 1;
        sq = u * u + v * v;
      } while (sq >= 1 || sq === 0);
      const m = Math.sqrt((-2 * Math.log(sq)) / sq);
      spare = v * m;
      return mean + u * m * sd;
    },

    angle() { return next() * Math.PI * 2; },

    /** Independent stream, so one system consuming numbers can't desync another. */
    fork(tag = '') {
      return createRNG((hashSeed(String(tag)) ^ Math.floor(next() * 0xffffffff)) >>> 0);
    },
  };

  return rng;
}
