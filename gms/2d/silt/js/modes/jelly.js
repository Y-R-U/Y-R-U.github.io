import { JELLY } from '../sim/materials.js';
import { F_BLOB } from '../sim/grid.js';
import { safeApi } from './api.js';
import { makeScorer } from './score.js';

// JELLY LAB — everything is a soft body.
//
// The soft-body solver is lane D (js/sim/blobs.js) and may not exist yet, so
// this mode probes for it at start and degrades to jelly-as-static when it is
// missing. That fallback is free rather than clever: JELLY's kind is BLOB, the
// CA step has no branch for BLOB, and displaceable() refuses to yield to it, so
// an unclaimed jelly cell is already an immovable block. The mode still plays —
// it just plays as rigid blocks instead of wobbling ones.
//
// Rigid jelly does not shatter and does not settle, which makes wall-to-wall
// spanning much harder than in FLOW: pieces stack as 8x8 slabs and leave hard
// vertical seams. The board is therefore narrower (64 cells = eight slabs
// across) so a span is eight good placements rather than fourteen.

const S = new WeakMap();

export const JELLY_CFG = {
  claimEvery: 6,        // ticks between handing new jelly cells to the solver
  maxClaimPerPass: 4096,
};

async function loadBlobs() {
  try {
    const m = await import('../sim/blobs.js');
    return (m && (m.Blobs || m.default)) || null;
  } catch {
    return null;   // lane D has not landed yet; static jelly it is
  }
}

/**
 * Hand every unclaimed jelly cell to the solver as one blob per connected
 * same-tint region. Only runs when a piece has just shattered, so it is not a
 * per-tick scan.
 */
function claimLooseJelly(world, st) {
  const g = world.g, cols = g.cols, n = g.n;
  const seen = st.seen;
  st.pass++;
  let claimed = 0;
  const stack = st.stack;
  for (let i = 0; i < n; i++) {
    if (g.mat[i] !== JELLY || (g.flags[i] & F_BLOB) || seen[i] === st.pass) continue;
    const t = g.tint[i];
    let sp = 0;
    stack[sp++] = i;
    seen[i] = st.pass;
    const cells = [];
    while (sp > 0) {
      const j = stack[--sp];
      cells.push({ x: j % cols, y: (j / cols) | 0 });
      const x = j % cols;
      const nb = [x > 0 ? j - 1 : -1, x < cols - 1 ? j + 1 : -1, j - cols, j + cols];
      for (const k of nb) {
        if (k < 0 || k >= n) continue;
        if (seen[k] === st.pass) continue;
        if (g.mat[k] !== JELLY || (g.flags[k] & F_BLOB) || g.tint[k] !== t) continue;
        seen[k] = st.pass;
        stack[sp++] = k;
      }
    }
    if (cells.length) { st.blobs.spawn(cells, t); claimed += cells.length; }
    if (claimed > JELLY_CFG.maxClaimPerPass) break;
  }
  return claimed;
}

export default {
  id: 'jelly',
  name: 'JELLY LAB',
  blurb: 'Soft bodies, no shatter. Slabs do not settle for you — place them right.',
  biome: 'lumen',
  hud: ['score', 'chains', 'combo', 'next'],

  worldCfg: {
    mat: JELLY,
    tints: 3,
    tintMode: 'mono',
    diagonal: true,
    reactions: false,
    cols: 64,
    rows: 224,
    fallRate: 15,
    fallAccel: 0.5,
    fallMax: 55,
  },

  onStart(world, api) {
    api = safeApi(api);
    const st = {
      scorer: makeScorer({ per: 6, curve: 2600 }),
      blobs: null,
      soft: false,
      owned: false,          // true when WE step the solver, not World.tick
      created: world.stats.created,
      seen: new Int32Array(world.g.n),
      stack: new Int32Array(world.g.n),
      pass: 0,
    };
    st.scorer.sync(world);
    S.set(world, st);
    api.biome(this.biome);

    // Probe asynchronously; until it resolves the mode simply runs rigid.
    loadBlobs().then((Blobs) => {
      if (!Blobs || !S.get(world) || world.over) return;
      if (world.blobs) { st.blobs = world.blobs; st.owned = false; }
      else { st.blobs = new Blobs(world.g); world.blobs = st.blobs; st.owned = true; }
      st.soft = true;
      api.banner('SOFT BODIES ONLINE');
    });
  },

  onTick(world, api) {
    const st = S.get(world);
    if (!st) return;
    api = safeApi(api);
    if (st.soft) {
      // World.tick does not know about blobs yet. If we created the instance we
      // must drive it; if the host wired one up, it already stepped.
      if (st.owned && st.blobs.step) st.blobs.step(world.rng);
      if (world.stats.created !== st.created) {
        st.created = world.stats.created;
        if (world.ticks % JELLY_CFG.claimEvery === 0) claimLooseJelly(world, st);
      }
    }
    st.scorer.tick(world);
  },

  onChain(world, api, cells) {
    const st = S.get(world);
    if (!st) return;
    api = safeApi(api);
    const n = cells ? cells.length : world.lastChainSize;
    const pts = st.scorer.award(world, n);
    // A cleared blob must release its solver registration or the solver keeps
    // rasterising cells the grid has already thrown away.
    if (st.soft && st.blobs && st.blobs.release) {
      for (let k = 0; k < cells.length; k++) st.blobs.release(world.g.blob[cells[k]]);
    }
    api.shake(Math.min(1, n / 2000));
    return pts;
  },

  /** True when lane D's solver is actually driving. Tools and HUD read this. */
  isSoft(world) { const st = S.get(world); return !!(st && st.soft); },
};
