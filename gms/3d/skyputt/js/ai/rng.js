// Seeded RNG for the ghost AIs (mulberry32). Deterministic across browsers and node.
export function makeRng(seed = 1) {
  let s = (typeof seed === 'string' ? hashStr(seed) : seed) >>> 0;
  const next = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = () => next();
  rng.gauss = () => { const u = next() || 1e-12, v = next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  rng.pick = arr => arr[Math.floor(next() * arr.length)];
  rng.int = (a, b) => a + Math.floor(next() * (b - a + 1));
  rng.state = () => s;
  rng.setState = v => { s = v >>> 0; };
  return rng;
}

export function hashStr(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
