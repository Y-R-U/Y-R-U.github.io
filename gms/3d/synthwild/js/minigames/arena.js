// Arena = a patch of sky above a throwaway world (seed 'mg-<id>', mode 'minigame', never saved).
import { BLOCK } from '../data/blocks.js';
import { mulberry32 } from '../core/rng.js';

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

// Deterministic RNG for course layouts. This string hash must never change: Parkour/Treasure layouts, and so saved
// ghosts and bests, depend on the exact sequence.
export function rng(seed) {
  let a = 0;
  for (const c of String(seed)) a = (Math.imul(a ^ c.charCodeAt(0), 2654435761) + 1) | 0;
  return mulberry32(a);
}

// ---------- building helpers. Inclusive cell boxes relative to the arena origin ----------
export const mat = (key) => (key === 'air' || key === 0 ? 0 : BLOCK[key.toUpperCase()]);

// Inclusive cell box relative to the arena origin. mode: fill | hollow | shell | replace.
export function fill(A, x0, y0, z0, x1, y1, z1, key, mode = 'fill') {
  const o = A.origin;
  const lo = [Math.min(x0, x1) + o.x, Math.min(y0, y1) + o.y, Math.min(z0, z1) + o.z];
  const hi = [Math.max(x0, x1) + o.x + 1, Math.max(y0, y1) + o.y + 1, Math.max(z0, z1) + o.z + 1];
  return A.world.setBox(lo.map((v) => v * 4), hi.map((v) => v * 4), mat(key), mode, { flow: false, support: false });
}
export const put = (A, x, y, z, key) => fill(A, x, y, z, x, y, z, key);
export const W = (A, x, y, z) => ({ x: A.origin.x + x + 0.5, y: A.origin.y + y, z: A.origin.z + z + 0.5 });
export const cellOf = (A, p) => [Math.floor(p.x) - A.origin.x, Math.floor(p.y) - A.origin.y, Math.floor(p.z) - A.origin.z];

// Clear the sky volume and lay a floor at y = -1 (relative), plus unbreakable walls of `wallH`.
export function pad(A, hx, hz, { floor = 'mirror_tile', under = 'coreplate', wall = 'coreplate', wallH = 3, clear = 24, glassTop = true } = {}) {
  fill(A, -hx - 2, -4, -hz - 2, hx + 2, clear, hz + 2, 'air');
  fill(A, -hx - 1, -3, -hz - 1, hx + 1, -2, hz + 1, under);
  fill(A, -hx, -1, -hz, hx, -1, hz, floor);
  if (wall) {
    ring(A, hx, hz, -1, wallH - 1, wall);
    if (glassTop) ring(A, hx, hz, wallH, wallH, 'clearglass');
  }
}

// Four wall slabs just outside the [-hx..hx] x [-hz..hz] floor.
export function ring(A, hx, hz, y0, y1, key) {
  fill(A, -hx - 1, y0, -hz - 1, hx + 1, y1, -hz - 1, key);
  fill(A, -hx - 1, y0, hz + 1, hx + 1, y1, hz + 1, key);
  fill(A, -hx - 1, y0, -hz - 1, -hx - 1, y1, hz + 1, key);
  fill(A, hx + 1, y0, -hz - 1, hx + 1, y1, hz + 1, key);
}
