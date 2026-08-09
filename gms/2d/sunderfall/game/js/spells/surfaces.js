/**
 * Custom fluid/surface kinds the spell module owns.
 *
 * The sim ships fire / acid / slime / frost / oil. These three are ours, and
 * they are the reason Voidlash, Blightbloom and every burnt thing leave marks
 * that are still there minutes later.
 */

import { LAYER } from '../gfx/renderer.js';
import { MATERIAL } from '../sim/materials.js';

let defined = false;

export function defineSurfaces(world) {
  if (defined && world.__spellSurfaces) return;
  world.__spellSurfaces = true;
  defined = true;
  const S = world.surfaces;

  /* Void residue: does not spread, does not flow, eats slowly and rots the
   * light out of the ground. What a Voidlash implosion leaves behind. */
  S.define({
    id: 'void',
    color: [0.52, 0.30, 0.88], color2: [0.06, 0.02, 0.12],
    add: false, light: 0.18, layer: LAYER.TERRAIN_FRONT,
    decay: 0.018, spread: 0, flow: 0,
    needsFuel: false, consumes: 0.6,
    damage: 9, damageType: 'void',
    status: 'slow', statusTime: 0.6,
  });

  /* Rot: spreads slowly, loves FOLIAGE, eats it, and is what makes a
   * Blightbloom keep travelling after the fight it was cast in. */
  S.define({
    id: 'rot',
    color: [0.44, 0.62, 0.24], color2: [0.14, 0.20, 0.08],
    add: false, light: 0.05, layer: LAYER.TERRAIN_FRONT,
    decay: 0.035, spread: 0.09, flow: 0.05,
    needsFuel: false, consumes: 1.4,
    damage: 7, damageType: 'decay',
    status: 'slow', statusTime: 0.5,
  });

  /* Ash: inert. No damage, no spread, almost no decay. Pure memory — the grey
   * that says a fire was here. Cheap because dead cells never tick anything. */
  S.define({
    id: 'ash',
    color: [0.34, 0.32, 0.31], color2: [0.14, 0.13, 0.13],
    add: false, light: 0, layer: LAYER.TERRAIN,
    decay: 0.0016, spread: 0, flow: 0.3,   // flow only so stray cells fall to the floor
    needsFuel: false, consumes: 0,
    damage: 0, damageType: 'impact',
  });
}

/**
 * Fire dies, ash stays. Laid along the actual ground line rather than poured as
 * a disc — a ball of ash hanging in the air is the giveaway that a fluid layer
 * was used lazily.
 */
export function leaveAsh(world, x, y, radius, amount) {
  const a = amount === undefined ? 0.5 : amount;
  const step = 26;
  for (let dx = -radius; dx <= radius; dx += step) {
    const px = x + dx;
    const gy = world.groundY(px, y - 300, 900);
    if (Number.isNaN(gy)) continue;
    const fall = 1 - Math.abs(dx) / (radius + 1);
    world.surfaces.add('ash', px, gy - 10, a * (0.4 + fall * 0.6));
  }
}

export const ACID_EATS = [MATERIAL.MASONRY, MATERIAL.TIMBER, MATERIAL.METAL, MATERIAL.BONE];
