import { EMPTY, SAND, WATER } from '../sim/materials.js';
import { Grid, F_CLEARING } from '../sim/grid.js';
import { BRINE_FIRST, BRINE_COUNT } from '../data/biomes.js';
import { Clears } from '../sim/clears.js';
import { safeApi } from './api.js';
import { makeScorer } from './score.js';

// TIDE — the floor floods.
//
// The whole mode rests on one rule that already lives in clears.js: a chain is
// connected by TINT, not by material. So a band of blue water will finish a
// chain of blue sand. The rising water is therefore a resource and a threat at
// the same time, and the two are the same number — flood higher and the bridges
// get easier, but the ceiling comes to meet you.
//
// The tide is stored as a waterline height, not as individual sources. Water
// cannot pass through a powder (sand is denser and POWDER never yields), so a
// bottom-injecting source silts up and stops within seconds. Levelling the
// whole submerged region to a height every rise step is both correct and
// self-healing: it refills the holes a chain punched, without special-casing.
//
// THE RISING TIDE IS INERT. It has to be: water is TINTABLE and a chain is any
// one tint spanning wall to wall, so a full-width band of tide is a chain by
// definition and clears itself the instant it appears.
//
// "Inert" means tint 0 IF the engine actually treats tint 0 as no-colour — and
// today it does not. clears.detect() reads `t = tint[start]` with no zero
// guard, so a wall-to-wall band of tint-0 water spans and clears exactly like a
// coloured one. Measured, not assumed: tintZeroIsInert() builds a 24x6 grid, fills
// two full-width rows with tint-0 water, and asks the shipping Clears whether
// that is a chain. The mode uses tint 0 the moment that answer flips, and until
// then uses BRINE tints — colour indices above the piece tint range, which no
// piece can ever match. Either way the tide cannot complete its own chain.
//
// D4 survives because the resource is delivered as WATER PIECES instead: every
// third piece is tinted water, and water spreads, so dropping blue water into
// the tide lets that colour run sideways and finish a run of blue sand.

const S = new WeakMap();

export const TIDE_CFG = {
  topMargin: 28,        // drown when the waterline gets this close to the ceiling
  riseBase: 1.1,        // rows per second at t=0
  riseAccel: 0.008,     // rows per second, per second
  riseMax: 3.2,
  segW: 2,              // width of a tide colour cluster, in cells
  bandH: 2,             // height of a tide colour cluster, in rows
  drainPerRow: 0.2,     // rows of tide bought by clearing one row's worth of water
  buoyEvery: 3,         // ticks between buoyancy passes
  buoySamples: 30,      // cells sampled per pass — O(1), not a scan
  buoyChance: 0.34,
  brineTints: BRINE_COUNT,  // water-only colours ABOVE the piece tint range. No
                        // piece can match them, so the tide is filler that
                        // blocks paths instead of making them. FIVE of them,
                        // not one or two: a single brine colour is p=1 and
                        // spans on sight, two is p=0.5 and still sits above the
                        // 0.407 percolation threshold (measured — the bare tide
                        // self-cleared). Five puts each at p=0.2, comfortably
                        // below it. Every biome paints 4..8 as near-identical
                        // shades of its water, so the player sees one body.
  seq: [SAND, SAND, WATER],   // every third piece is the tinted resource
  waterWeight: 0.45,    // water cells score less than sand cells
};
const CFG = TIDE_CFG;

function h2(a, b, seed) {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h ^= Math.imul(a + 0x85ebca6b, 0xcc9e2d51); h = (h << 13) | (h >>> 19);
  h ^= Math.imul(b + 0xc2b2ae35, 0x1b873593); h = (h << 17) | (h >>> 15);
  h = Math.imul(h ^ (h >>> 16), 0x2545f491);
  return (h ^ (h >>> 15)) >>> 0;
}

/**
 * Colour of the tide at (x,y).
 *
 * i.i.d. per small cluster, NOT in coherent bands. This is the load-bearing
 * choice in the mode. Site percolation on the 8-connected lattice turns over at
 * p ~= 0.407; three tints put each colour at 0.333, safely below it, so a water
 * body on its own almost never spans and the tide cannot pay for itself. Wide
 * coloured bands were the first version and they measured at 100 chains a game
 * — the tide drained itself faster than it rose and no run ever ended.
 */
export function tideTint(x, y, tints, seed, inert) {
  if (inert) return 0;
  const sx = (x / CFG.segW) | 0, by = (y / CFG.bandH) | 0;
  void tints;
  return BRINE_FIRST + (h2(sx, by, seed) % CFG.brineTints);
}

/**
 * Does the shipping clear detector treat tint 0 as no-colour? Probed against
 * the real Clears on a throwaway grid, so the answer is whatever the engine
 * actually does today rather than what anyone remembers it doing.
 */
export function tintZeroIsInert() {
  const g = new Grid(24, 6);
  g.fill(0, 4, 24, 2, WATER, 0);
  return new Clears(g, { diagonal: true }).detect() === 0;
}

/**
 * Level the submerged region to `line` rows above the floor, filling only the
 * empty cells. Exported because the tide gates flood a bare grid with it — the
 * gate must exercise the shipping fill, not a copy of it.
 */
export function floodGrid(g, line, tints, seed, inert) {
  const cols = g.cols, rows = g.rows;
  const top = Math.max(0, rows - line);
  let made = 0;
  for (let y = rows - 1; y >= top; y--) {
    const row = y * cols;
    for (let x = 0; x < cols; x++) {
      const i = row + x;
      if (g.mat[i] !== EMPTY) continue;
      g.set(i, WATER, tideTint(x, y, tints, seed, inert));
      made++;
    }
  }
  return made;
}

function floodTo(world, st) {
  const made = floodGrid(world.g, st.line, world.cfg.tints, st.seed, st.inert);
  st.made += made;
  return made;
}

/**
 * Submerged sand is buoyant and unsettled: a grain with water above it will
 * occasionally float up a cell. Sampled, not scanned, so it costs the same on a
 * full board as an empty one. Uses swap only, so the mass ledger is untouched.
 */
function buoyancy(world, st, rng) {
  const g = world.g, cols = g.cols, rows = g.rows;
  const top = Math.max(1, rows - st.line);
  const span = rows - top;
  if (span < 4) return 0;
  let moved = 0;
  for (let k = 0; k < CFG.buoySamples; k++) {
    const y = top + 1 + rng.int(span - 1);
    const x = rng.int(cols);
    const i = y * cols + x;
    if (g.mat[i] !== SAND) continue;
    if (g.flags[i] & F_CLEARING) continue;
    const up = i - cols;
    if (g.mat[up] !== WATER) continue;
    if (g.flags[up] & F_CLEARING) continue;
    if (!rng.chance(CFG.buoyChance)) continue;
    g.swap(i, up);
    moved++;
  }
  return moved;
}

export default {
  id: 'tide',
  name: 'TIDE',
  blurb: 'The floor floods. Coloured water finishes coloured chains — drown or drink.',
  biome: 'abyss',
  hud: ['score', 'chains', 'tide', 'next'],

  worldCfg: {
    mat: SAND,
    tints: 3,
    tintMode: 'mono',
    diagonal: true,
    reactions: false,
    fallRate: 26,        // slower than FLOW: the tide is the clock, not the drop
    fallAccel: 0.5,
    fallMax: 80,
  },

  onStart(world, api) {
    api = safeApi(api);
    const st = {
      scorer: makeScorer({ per: 24, curve: 9000 }),
      seed: (world.cfg.seed ^ 0x71de5a1e) >>> 0,
      inert: tintZeroIsInert(),
      line: 6,
      accum: 0,
      k: 0,
      lastNext: world.nextPiece,
      made: 0,
      drained: 0,
      warned: false,
    };
    st.scorer.sync(world);
    S.set(world, st);
    world.tide = { line: st.line, frac: 0, rise: CFG.riseBase };
    api.biome(this.biome);
    floodTo(world, st);
  },

  onTick(world, api) {
    const st = S.get(world);
    if (!st) return;
    api = safeApi(api);
    const rows = world.g.rows;
    const limit = rows - CFG.topMargin;

    if (world.nextPiece !== st.lastNext) {
      st.lastNext = world.nextPiece;
      st.k++;
      world.cfg.mat = CFG.seq[st.k % CFG.seq.length];
    }

    const rise = Math.min(CFG.riseMax, CFG.riseBase + CFG.riseAccel * world.t);
    st.accum += rise / 60;
    if (st.accum >= 1) {
      const add = Math.floor(st.accum);
      st.accum -= add;
      st.line = Math.min(limit + 1, st.line + add);
      floodTo(world, st);
    }

    if (world.ticks % CFG.buoyEvery === 0) buoyancy(world, st, api.rng);

    const frac = st.line / limit;
    world.tide = { line: st.line, frac: Math.min(1, frac), rise };
    if (!st.warned && frac > 0.82) { st.warned = true; api.banner('HIGH WATER'); }
    if (st.warned && frac < 0.66) st.warned = false;

    if (st.line > limit) { world.over = true; world.drowned = true; }

    st.scorer.tick(world);
  },

  onChain(world, api, cells) {
    const st = S.get(world);
    if (!st) return;
    api = safeApi(api);
    const g = world.g;
    let water = 0;
    const n = cells ? cells.length : 0;
    for (let k = 0; k < n; k++) if (g.mat[cells[k]] === WATER) water++;
    const sand = n - water;

    // A chain made mostly of water is worth less — otherwise the tide pays for
    // itself and the mode turns into a treadmill.
    const weight = n ? (sand + water * CFG.waterWeight) / n : 1;
    const pts = st.scorer.award(world, n, weight);

    // ...but it does buy time. Draining is what makes flooding a choice.
    const rowsBought = Math.floor((water / g.cols) * CFG.drainPerRow);
    if (rowsBought > 0) {
      st.line = Math.max(4, st.line - rowsBought);
      st.drained += rowsBought;
      api.banner(rowsBought >= 6 ? 'EBB' : '');
    }
    api.shake(Math.min(1, n / 5000));
    return pts;
  },
};
