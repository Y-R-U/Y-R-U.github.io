import { EMPTY, SAND } from '../sim/materials.js';
import { F_CLEARING } from '../sim/grid.js';
import { pieceBounds, BLK } from '../sim/pieces.js';
import { safeApi, hasGravity, gravitySetter } from './api.js';
import { makeScorer } from './score.js';

// HOURGLASS — the board turns over.
//
// Two implementations. The sim DOES now have a gravity vector, and flipping it
// is one line — but measured, that version is unplayable and it is not this
// lane's to fix: World.spawn always enters a piece at the top and World.tick
// always moves it down, so under GRAV_UP the pile pours onto the ceiling and
// the very next piece lands in it and tops out. A true vector hourglass needs
// piece spawn and piece fall to follow world.grav in world.js/pieces.js.
// HOURGLASS_CFG.useGravityVector flips to it the day that lands.
//
// Until then: rotate the CONTENTS 180 degrees. Under a fixed downward gravity
// that is observationally the same thing, needs nothing from the sim beyond
// set/swap, and rotates rather than mirrors — so the left and right walls swap
// and a wall-to-wall chain is still a wall-to-wall chain.
//
// The rotation has one hazard that is not obvious and that cost a rebuild: a
// pile filling the bottom half lands against the CEILING after the flip, the
// next piece cannot spawn, and the game ends instantly on every flip. So a flip
// opens a settle window during which the piece is parked above the ceiling and
// no new piece spawns; it closes when the crown of the board is clear again.

const S = new WeakMap();

export const HOURGLASS_CFG = {
  useGravityVector: false,   // see the note above; measured unplayable today
  flipEvery: 30,        // seconds
  warnAt: 3,            // seconds of warning before a flip
  settleMax: 420,       // ticks; hard ceiling on the pour window
  crownRows: 30,        // pour is done when these top rows are empty
  firstFlipAt: 30,
};

/** Force-finish anything mid-dissolve: its indices are about to become wrong. */
function flushDissolving(world) {
  const g = world.g, list = world.clears.dissolving;
  for (let k = 0; k < list.length; k++) {
    const i = list[k];
    if (g.flags[i] & F_CLEARING) { g.clear(i); world.stats.destroyed++; }
  }
  list.length = 0;
  world.clears.visited.fill(0);
  world.clears.stamp = 0;
}

/** Rotate the whole grid 180 degrees. A permutation, so the ledger is untouched. */
function rotate180(world, st) {
  const g = world.g, n = g.n;
  flushDissolving(world);
  // Soft bodies hold their own centroids and would be left pointing at the wrong
  // cells. HOURGLASS is a sand mode, so dropping them is free insurance.
  if (world.blobs && world.blobs.clearAll) world.blobs.clearAll();
  st.mat.set(g.mat); st.tint.set(g.tint); st.life.set(g.life); st.heat.set(g.heat);
  for (let i = 0; i < n; i++) {
    const src = n - 1 - i;
    g.set(i, st.mat[src], st.tint[src]);
    g.life[i] = st.life[src];
    g.heat[i] = st.heat[src];
  }
  g.wakeAll();
}

function crownClear(world) {
  const g = world.g, cols = g.cols;
  const end = Math.min(g.n, HOURGLASS_CFG.crownRows * cols);
  for (let i = 0; i < end; i++) if (g.mat[i] !== EMPTY) return false;
  return true;
}

/** Park the falling piece above the ceiling so World.tick neither lands it nor
 *  spawns a replacement into the pile that is currently mid-pour. */
function parkPiece(world) {
  const p = world.piece;
  if (!p) return;
  const b = pieceBounds(p);
  p.y = -(b.maxY + 1) * BLK;
  world.fallAccum = 0;
  world.softDrop = false;
}

export default {
  id: 'hourglass',
  name: 'HOURGLASS',
  blurb: 'Every thirty seconds the world turns over and your pile becomes weather.',
  biome: 'quartz',
  hud: ['score', 'chains', 'flip', 'next'],

  worldCfg: {
    mat: SAND,
    tints: 3,
    tintMode: 'mono',
    diagonal: true,
    reactions: false,
    fallRate: 30,
    fallAccel: 0.8,
    fallMax: 100,
  },

  onStart(world, api) {
    api = safeApi(api);
    const n = world.g.n;
    const st = {
      scorer: makeScorer({ per: 20, curve: 8000 }),
      nextFlip: HOURGLASS_CFG.firstFlipAt,
      flips: 0,
      settle: 0,
      warned: false,
      dir: 1,
      vector: HOURGLASS_CFG.useGravityVector && hasGravity(api, world),
      grav: gravitySetter(api, world),
      mat: new Uint8Array(n), tint: new Uint8Array(n),
      life: new Uint8Array(n), heat: new Uint8Array(n),
    };
    st.scorer.sync(world);
    S.set(world, st);
    api.biome(this.biome);
    world.hourglass = { until: st.nextFlip, flips: 0, dir: 1, settling: false };
  },

  onTick(world, api) {
    const st = S.get(world);
    if (!st) return;
    api = safeApi(api);

    if (st.settle > 0) {
      // The piece can be null at the moment of a flip, and then World.tick
      // spawns straight into the airborne pile and calls the game over before
      // a single grain has fallen. Parking only helps when there is something
      // to park, so the settle window also absolves a failed spawn.
      if (world.over) { world.over = false; world.piece = null; }
      parkPiece(world);
      st.settle--;
      if (crownClear(world) && world.clears.dissolving.length === 0) st.settle = 0;
      world.hourglass = { until: st.nextFlip - world.t, flips: st.flips, dir: st.dir, settling: true };
      st.scorer.tick(world);
      return;
    }

    const left = st.nextFlip - world.t;
    if (!st.warned && left <= HOURGLASS_CFG.warnAt) { st.warned = true; api.banner('TURNING'); }

    if (left <= 0) {
      st.dir = -st.dir;
      st.flips++;
      st.warned = false;
      st.nextFlip = world.t + HOURGLASS_CFG.flipEvery;
      if (st.vector && st.grav) {
        st.grav(0, st.dir);
      } else {
        rotate180(world, st);
        st.settle = HOURGLASS_CFG.settleMax;
        parkPiece(world);
      }
      api.shake(1);
    }

    world.hourglass = { until: Math.max(0, st.nextFlip - world.t), flips: st.flips, dir: st.dir, settling: false };
    st.scorer.tick(world);
  },

  onChain(world, api, cells) {
    const st = S.get(world);
    if (!st) return;
    api = safeApi(api);
    const n = cells ? cells.length : world.lastChainSize;
    const pts = st.scorer.award(world, n);
    api.shake(Math.min(1, n / 5000));
    return pts;
  },
};
