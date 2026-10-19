// Seeded RNG (mulberry32). Pure, serialisable: rng.state can be saved and restored.
export function hashSeed(s) {
  if (typeof s === 'number') return s >>> 0;
  let h = 2166136261 >>> 0;
  for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

export function createRng(seed = 1) {
  const rng = {
    state: hashSeed(seed) || 0x9e3779b9,
    next() {
      let t = (rng.state = (rng.state + 0x6d2b79f5) >>> 0);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    range(a, b) { return a + (b - a) * rng.next(); },
    int(a, b) { return a + Math.floor(rng.next() * (b - a + 1)); },
    chance(p) { return rng.next() < p; },
    pick(arr) { return arr[Math.floor(rng.next() * arr.length)]; },
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      return a;
    },
    weighted(obj) { // {key: weight}
      const keys = Object.keys(obj); let tot = 0;
      for (const k of keys) tot += obj[k];
      let r = rng.next() * tot;
      for (const k of keys) { r -= obj[k]; if (r < 0) return k; }
      return keys[keys.length - 1];
    },
    fork(tag) { return createRng((rng.state ^ hashSeed(tag)) >>> 0); },
  };
  return rng;
}
