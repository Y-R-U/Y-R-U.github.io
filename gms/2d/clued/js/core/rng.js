export function hashString(s) {
  let h = 2166136261 >>> 0;
  s = String(s);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  h ^= h >>> 15; h = Math.imul(h, 2246822507) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 3266489909) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export function mulberry32(seed) {
  let a = (typeof seed === 'number' ? seed : hashString(seed)) >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rngFrom = s => mulberry32(hashString(s));
export const int = (rng, n) => Math.floor(rng() * n);
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

export function shuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const sample = (rng, arr, n) => shuffle(rng, arr).slice(0, Math.max(0, n));

export function weightedPick(rng, arr, weightFn) {
  const w = arr.map(weightFn);
  const total = w.reduce((s, x) => s + x, 0);
  let r = rng() * total;
  for (let i = 0; i < arr.length; i++) { r -= w[i]; if (r < 0) return arr[i]; }
  return arr[arr.length - 1];
}

export const randomSeed = () => Math.random().toString(36).slice(2, 10);
