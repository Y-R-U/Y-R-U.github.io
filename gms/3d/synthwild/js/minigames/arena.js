// Arena = a patch of sky above a throwaway world (seed 'mg-<id>', mode 'minigame', never saved).
// Building helpers live in bots/arena.js (lane 4) and are re-exported here.
export { fill, put, W, pad, ring, mat, cellOf } from './bots/arena.js';

export function createArena(ctx, def, variant) {
  const w = ctx.world;
  const sp = w.spawn || [0, 40, 0];
  const origin = { x: Math.floor(sp[0]), y: def.arenaY || 80, z: Math.floor(sp[2]) };
  const r = def.arenaRadius || 3;
  try { w.ensureArea?.(origin.x, origin.z, r); } catch (e) { console.warn('[arena] ensureArea', e); }
  return { ctx, world: w, origin, variant };
}

// Arena-relative cell → world coords of the cell's top centre.
export const top = (A, x, y, z) => ({ x: A.origin.x + x + 0.5, y: A.origin.y + y + 1, z: A.origin.z + z + 0.5 });

// Deterministic RNG for course layouts (mulberry32).
export function rng(seed) {
  let a = 0;
  for (const c of String(seed)) a = (Math.imul(a ^ c.charCodeAt(0), 2654435761) + 1) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
