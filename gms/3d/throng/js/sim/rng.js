export function hashSeed(s) {
  if (typeof s === 'number' && Number.isFinite(s)) s = String(Math.floor(s));
  s = String(s);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// sfc32: small, fast, and identical in every JS engine (integer-only maths).
export function createRng(seed) {
  let a = hashSeed(seed), b = a ^ 0x9e3779b9, c = a ^ 0x243f6a88, d = 1;
  const nextU32 = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return t >>> 0;
  };
  for (let i = 0; i < 12; i++) nextU32();
  const next = () => nextU32() / 4294967296;
  return {
    u32: nextU32,
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (n) => Math.floor(next() * n),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    fork: (tag) => createRng(nextU32() + ':' + tag),
  };
}
