// Seeded xorshift32. Nothing in sim/ may call Math.random.

export function makeRng(seed) {
  let s = (seed | 0) || 0x9e3779b9;
  return function rng() {
    s ^= s << 13; s |= 0;
    s ^= s >>> 17;
    s ^= s << 5; s |= 0;
    return (s >>> 0) / 4294967296;
  };
}

export function salt(seed, key) {
  let h = (seed | 0) ^ 0x811c9dc5;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  return h | 0;
}

export const streamFor = (seed, key) => makeRng(salt(seed, key));

export function roll(rng, weights) {
  let total = 0;
  for (const w of weights) total += w > 0 ? w : 0;
  if (total <= 0) return -1;
  let x = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i] > 0 ? weights[i] : 0;
    if ((x -= w) < 0) return i;
  }
  return weights.length - 1;
}

export const chance = (rng, p) => rng() < p;
export const between = (rng, lo, hi) => lo + (hi - lo) * rng();
export const intBetween = (rng, lo, hi) => lo + Math.floor((hi - lo + 1) * rng());
