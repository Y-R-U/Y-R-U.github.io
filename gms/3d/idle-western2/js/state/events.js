export function pickEvent(defs, rng, ok = () => true) {
  const pool = defs.filter((d) => d.weight && ok(d));
  const total = pool.reduce((s, d) => s + d.weight, 0);
  if (!total) return null;
  let r = rng() * total;
  for (const d of pool) if ((r -= d.weight) <= 0) return d;
  return pool[pool.length - 1];
}

export function nextGap(gap, rng) {
  return gap[0] + rng() * (gap[1] - gap[0]);
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
