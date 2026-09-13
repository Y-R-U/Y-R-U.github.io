// Deterministic RNG. Same seed + same inputs = same run, to the tick. That is
// what makes the node balance harness, replays and daily seeds possible, so
// nothing under js/sim/ may ever call Math.random().

export function makeRng(seed = 1) {
  let s = (seed >>> 0) || 1;

  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const rng = {
    next,
    int: (n) => (next() * n) | 0,
    range: (a, b) => a + next() * (b - a),
    pick: (arr) => arr[(next() * arr.length) | 0],
    chance: (p) => next() < p,
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = (next() * (i + 1)) | 0;
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    },
    // A fork draws once from the parent, so forking is itself deterministic.
    fork: () => makeRng((next() * 4294967296) >>> 0),
    state: () => s,
    restore: (v) => { s = v >>> 0; },
  };
  return rng;
}
