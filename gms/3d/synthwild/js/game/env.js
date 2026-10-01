// World queries the gameplay lane needs, tolerant of a world that is still loading.
import { WET } from '../data/blocks.js';

const SKY_ONLY = { sky: 15, block: 0 };

export function lightAt(world, x, y, z) {
  if (!world?.lightAt) return SKY_ONLY;
  const v = world.lightAt(x, y, z);
  return { sky: v >> 4, block: v & 15 };
}

export function matAt(world, x, y, z) {
  if (!world) return 0;
  return world.getSub(Math.floor(x * 4), Math.floor(y * 4), Math.floor(z * 4)) | 0;
}

// src: a world, or a function returning the current world (ctx.world is replaced on every world start).
export function solidFn(src) {
  const get = typeof src === 'function' ? src : () => src;
  return (sx, sy, sz) => { const w = get(); return w ? !!w.isSolidSub(sx, sy, sz) : false; };
}

export const isLiquid = (mat) => WET[mat] === 1;
export const liquidAt = (world, x, y, z) => isLiquid(matAt(world, x, y, z));
