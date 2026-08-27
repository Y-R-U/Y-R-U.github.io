import { EMPTY, SAND, WATER, OIL, LAVA, ICE, JELLY, WALL, FIRE, CRYSTAL, ASH, LIFE } from '../sim/materials.js';
import { safeApi } from './api.js';
import { BRINE_FIRST, BRINE_COUNT } from '../data/biomes.js';

// ZEN — sandbox. No score, no fail, every material on the palette.
//
// This is also the attract screen and the screenshot mode, so it has to look
// good on its own with nobody touching it: seedScene() lays out something worth
// photographing and the vent keeps it alive forever.

const S = new WeakMap();

export const ZEN_CFG = {
  ventRows: 26,       // how much of the ceiling is cleared when the board tops out
  ventEvery: 30,      // ticks between vent checks
};

export const PALETTE = [
  { mat: SAND,    name: 'Sand',    tinted: true },
  { mat: WATER,   name: 'Water',   tinted: true },
  { mat: OIL,     name: 'Oil',     tinted: true },
  { mat: JELLY,   name: 'Jelly',   tinted: true },
  { mat: ICE,     name: 'Ice',     tinted: true },
  { mat: LAVA,    name: 'Lava',    tinted: false },
  { mat: FIRE,    name: 'Fire',    tinted: false },
  { mat: ASH,     name: 'Ash',     tinted: false },
  { mat: CRYSTAL, name: 'Crystal', tinted: false },
  { mat: WALL,    name: 'Stone',   tinted: false },
  { mat: EMPTY,   name: 'Erase',   tinted: false },
];

/**
 * Paint a filled disc. The one call the UI needs; everything else is data.
 *
 * WATCH THE TINT. A chain is one tint spanning wall to wall, so a single stroke
 * of tinted material drawn all the way across the board IS a chain and will
 * dissolve under the player's finger. That is legal in a sandbox — it is the
 * same rule the scored modes run on — but anything that seeds a board rather
 * than responding to a finger (seedScene below, ALCHEMY scenery, a fixture)
 * must use untinted or brine-tinted material, or stop short of a wall.
 */
export function paint(world, cx, cy, { mat = SAND, tint = 1, radius = 5, density = 1 } = {}, rng = null) {
  const g = world.g;
  const r2 = radius * radius;
  let n = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    const y = (cy + dy) | 0;
    if (y < 0 || y >= g.rows) continue;
    for (let dx = -radius; dx <= radius; dx++) {
      const x = (cx + dx) | 0;
      if (x < 0 || x >= g.cols) continue;
      if (dx * dx + dy * dy > r2) continue;
      if (density < 1 && rng && !rng.chance(density)) continue;
      const i = y * g.cols + x;
      if (mat === EMPTY) { if (g.mat[i] !== EMPTY) { g.clear(i); n++; } continue; }
      g.set(i, mat, tint);
      if (LIFE[mat]) g.life[i] = LIFE[mat];
      n++;
    }
  }
  return n;
}

/** Something worth looking at with nobody playing. Deterministic from the seed. */
export function seedScene(world, rng) {
  const g = world.g, cols = g.cols, rows = g.rows;
  g.fill(0, rows - 6, cols, 6, WALL);
  for (let k = 0; k < 5; k++) {
    const x = 8 + rng.int(cols - 16);
    const w = 4 + rng.int(9);
    const h = 10 + rng.int(28);
    g.fill(x, rows - 6 - h, w, h, WALL);
  }
  // Brine, not tint 0: a wall-to-wall band of ANY single tint is a chain, and
  // tint 0 is a tint as far as clears.detect is concerned. Brine indices match
  // no piece colour, so the pool sits there instead of dissolving on frame one.
  for (let y = rows - 26; y < rows - 6; y++)
    for (let x = 0; x < cols; x++)
      g.set(y * cols + x, WATER, BRINE_FIRST + ((x * 7 + y * 3) % BRINE_COUNT));
  for (let k = 0; k < 3; k++) {
    const x = 6 + rng.int(cols - 12);
    paint(world, x, 24 + rng.int(40), { mat: SAND, tint: 1 + rng.int(3), radius: 7 + rng.int(6) }, rng);
  }
  g.wakeAll();
}

export default {
  id: 'zen',
  name: 'ZEN',
  blurb: 'No score, no ceiling, no end. Every material, one finger.',
  biome: 'dune',
  hud: [],
  sandbox: true,
  attract: true,
  palette: PALETTE,
  paint,
  seedScene,

  worldCfg: {
    mat: SAND,
    tints: 3,
    tintMode: 'mono',
    diagonal: true,
    reactions: true,
    fallRate: 26,
    fallAccel: 0,
    fallMax: 26,
  },

  onStart(world, api) {
    api = safeApi(api);
    S.set(world, { vented: 0 });
    api.biome(this.biome);
    world.zen = { vented: 0 };
    if (world.g.count === 0) seedScene(world, api.rng);
  },

  onTick(world, api) {
    const st = S.get(world);
    if (!st) return;
    world.score = 0;
    world.combo = 0;
    // A sandbox has no fail state, so the ceiling vents instead of ending the
    // run. Clearing the crown is also what stops a wedged spawn dead-locking
    // the attract loop for the rest of the session.
    if (world.over) {
      world.g.fill(0, 0, world.g.cols, ZEN_CFG.ventRows, EMPTY);
      world.over = false;
      world.piece = null;
      st.vented++;
      world.zen = { vented: st.vented };
    }
  },

  onChain(world, api) {
    world.score = 0;
    world.combo = 0;
  },
};
