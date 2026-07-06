// LASTWALL — math + seeded RNG helpers
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
export const rand = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const TAU = Math.PI * 2;

export function angLerp(a, b, t) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU;
  return a + d * t;
}

// deterministic RNG for level generation
export function mulberry32(seed) {
  let s = seed >>> 0;
  const r = () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (a, b) => a + r() * (b - a);
  r.int = (a, b) => Math.floor(r.range(a, b + 1));
  r.pick = arr => arr[Math.floor(r() * arr.length)];
  r.chance = p => r() < p;
  return r;
}

export const fmt = n => n >= 1000 ? (n / 1000).toFixed(1) + 'k' : '' + n;

// axis-aligned rect helpers (the walkable wall surface is a union of these)
export const inRect = (r, x, z, pad = 0) =>
  x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad;

export function clampRects(rects, x, z, pad = 0.5) {
  // if inside any rect (shrunk by pad), fine; else clamp to the nearest rect edge
  let best = null, bestD = Infinity;
  for (const r of rects) {
    if (r.dead) continue;
    const cx = clamp(x, r.x0 + pad, r.x1 - pad), cz = clamp(z, r.z0 + pad, r.z1 - pad);
    const d = (cx - x) * (cx - x) + (cz - z) * (cz - z);
    if (d < bestD) { bestD = d; best = { x: cx, z: cz }; if (d === 0) break; }
  }
  return best || { x, z };
}

export const onRects = (rects, x, z, pad = 0) => {
  for (const r of rects) if (!r.dead && inRect(r, x, z, pad)) return true;
  return false;
};
