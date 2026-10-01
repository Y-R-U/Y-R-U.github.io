import { K_AIR, K_OPAQUE, K_CUTOUT, K_GLASS, K_LIQUID, K_PLANT, K_RAIL, T_WATERLOGGED, T_SWAY, T_GLINT } from './mesher_core.js';

// Flatten the block registry into the typed tables the mesher worker needs.
export function buildBlockTable(BLOCKS, TILES = []) {
  const kind = new Uint8Array(256), flags = new Uint8Array(256), tiles = new Uint8Array(256 * 3);
  let water = 0;
  for (const b of BLOCKS) {
    if (!b) continue;
    const id = b.id;
    let k = K_OPAQUE;
    if (id === 0) k = K_AIR;
    else if (b.liquid) k = K_LIQUID;
    else if (b.shape === 'rail') k = K_RAIL;
    else if (b.plant) k = K_PLANT;
    else if (b.transparent) k = K_GLASS;
    else if (b.cutout) k = K_CUTOUT;
    kind[id] = k;
    if (b.liquid && !water) water = id;
    let f = 0;
    if (b.waterlogged) f |= T_WATERLOGGED;
    if (b.shape !== 'rail' && ((b.plant && !/bulb/.test(b.key)) || (b.cutout && !b.transparent))) f |= T_SWAY;
    const side = TILES[b.tile.side];
    if (side && side.pattern === 'mirror') f |= T_GLINT;
    flags[id] = f;
    tiles[id * 3] = b.tile.top; tiles[id * 3 + 1] = b.tile.side; tiles[id * 3 + 2] = b.tile.bottom;
  }
  return { kind, flags, tiles, water };
}
