// What the floor is made of at a point. The proving room is half flagstone and half bare earth,
// and the earth elemental mends itself off the earth — so "is it standing on dirt?" is the whole
// rule of the fight and it is asked of the level document, not of the renderer.
//
// Plots are authored as `plot` objects in the level (js/editor/scene.js). They are rectangles,
// possibly rotated, and they are tested in document order with the LAST match winning, so a patch
// laid over another patches it exactly the way it looks like it does.

// Every surface a level may lay. `dirt`, `water` and `ash` are the three a monster can mend from
// — see js/game/bestiary.js — which is why an arena is designed around which of them it has.
export const SURFACES = ['dirt', 'stone', 'grass', 'sand', 'water', 'ash'];

export const DEFAULT_SURFACE = 'grass';

// Local coordinates inside a plot, or null if the point is outside it.
export function plotLocal(p, x, z) {
  const dx = x - p.x, dz = z - p.z;
  const c = Math.cos(-(p.ry || 0)), s = Math.sin(-(p.ry || 0));
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  const hw = p.p.w / 2, hd = p.p.d / 2;
  return Math.abs(lx) <= hw && Math.abs(lz) <= hd ? { x: lx, z: lz } : null;
}

export function surfaceAt(plots, x, z, fallback = DEFAULT_SURFACE) {
  let out = fallback;
  for (const p of plots) if (plotLocal(p, x, z)) out = p.p.surface || fallback;
  return out;
}

export const isDirt = (plots, x, z) => surfaceAt(plots, x, z) === 'dirt';

// The general form. A monster names the surface it mends from and this answers whether it is
// standing on one; a monster that names nothing never mends, wherever it is stood.
export const isHealing = (plots, x, z, surface) => !!surface && surfaceAt(plots, x, z) === surface;

// Every plot in a level document, in document order. `plot` objects have no `inside`: a floor
// patch is the ground, and the ground belongs to the world.
export const plotsOf = doc => (doc?.objects || []).filter(o => o.type === 'plot');

// How much of a walk between two points crosses dirt, sampled. The elemental's regeneration is a
// rate rather than a step, so it wants a fraction rather than a yes.
export function dirtRun(plots, a, b, steps = 8) {
  let hits = 0;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (isDirt(plots, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) hits++;
  }
  return hits / (steps + 1);
}
