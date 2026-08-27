// Every random draw in the sim goes through here. Determinism is what makes
// daily seeds, replays and the node oracle possible, so nothing may call
// Math.random() below js/sim/.

export function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  const r = {
    seed: s,
    next() {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(n) { return (r.next() * n) | 0; },
    chance(p) { return r.next() < p; },
    pick(arr) { return arr[(r.next() * arr.length) | 0]; },
    state() { return s >>> 0; },
    restore(v) { s = v | 0; },
  };
  return r;
}

// Stable 32-bit hash of a string — turns "2026-08-28" into a daily seed.
export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
