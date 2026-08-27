import { EMPTY, SAND, WATER } from '../sim/materials.js';
import { F_CLEARING } from '../sim/grid.js';
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
// Water is laid in coarse coloured blocks, never a uniform row — a single-tint
// row spans left to right by definition and would clear itself the instant it
// appeared, which is exactly the failure that killed the first version.

const S = new WeakMap();

const CFG = {
  topMargin: 10,        // drown when the waterline gets this close to the ceiling
  riseBase: 1.15,       // rows per second at t=0
  riseAccel: 0.006,     // rows per second, per second
  riseMax: 2.6,
  segW: 19,             // width of a colour block, in cells
  bandH: 13,            // height of a colour block, in rows
  drainPerRow: 1.35,    // rows of tide bought by clearing one row's worth of water
  buoyEvery: 3,         // ticks between buoyancy passes
  buoySamples: 30,      // cells sampled per pass — O(1), not a scan
  buoyChance: 0.34,
  waterWeight: 0.45,    // water cells score less than sand cells
};

function h2(a, b, seed) {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h ^= Math.imul(a + 0x85ebca6b, 0xcc9e2d51); h = (h << 13) | (h >>> 19);
  h ^= Math.imul(b + 0xc2b2ae35, 0x1b873593); h = (h << 17) | (h >>> 15);
  h = Math.imul(h ^ (h >>> 16), 0x2545f491);
  return (h ^ (h >>> 15)) >>> 0;
}

/** Colour of the tide at (x,y). Adjacent blocks differ by construction. */
function tideTint(x, y, tints, seed) {
  const sx = (x / CFG.segW) | 0, by = (y / CFG.bandH) | 0;
  const base = sx + (h2(0, by, seed) % tints);
  const jitter = (h2(sx, by, seed) % 11) === 0 ? 1 : 0;   // rare, deliberate
  return 1 + ((base + jitter) % tints);
}

function floodTo(world, st) {
  const g = world.g, cols = g.cols, rows = g.rows;
  const top = Math.max(0, rows - st.line);
  const tints = world.cfg.tints;
  let made = 0;
  for (let y = rows - 1; y >= top; y--) {
    const row = y * cols;
    for (let x = 0; x < cols; x++) {
      const i = row + x;
      if (g.mat[i] !== EMPTY) continue;
      g.set(i, WATER, tideTint(x, y, tints, st.seed));
      made++;
    }
  }
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
      line: 6,
      accum: 0,
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
