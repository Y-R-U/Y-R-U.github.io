import { JELLY } from '../sim/materials.js';
import { safeApi } from './api.js';
import { makeScorer } from './score.js';

// JELLY LAB — everything is a soft body.
//
// The solver is lane D's (js/sim/blobs.js) and World now owns it outright: it
// steps blobs before the cellular step and spawns one body per tint group when
// a JELLY piece lands. So this mode adds no physics at all — it is a config
// plus a scoring curve, which is what a mode should be.
//
// If the solver is ever absent the mode still runs, because JELLY's kind is
// BLOB, the CA step has no branch for BLOB and displaceable() refuses to yield
// to it: an unclaimed jelly cell is already an immovable block. isSoft() says
// which of the two is happening so the HUD and the tools never have to guess.
//
// Soft bodies deform and merge, and at lane D's default feel they deform far
// too readily for a game: a landed slab pancakes across the floor, fuses with
// every same-tint neighbour it touches, and spans the board almost for free —
// measured, 28 chains a game and the run never ended at all in 220s.
//
// The feel knobs are per-instance for exactly this reason, so the mode presses
// them rather than editing blobs.js. qMin 0.62 (against a 0.34 default) stops a
// body flattening into a puddle and loadSquash 0.25 (against 0.62) stops the
// stack above forcing it to, so jelly stays lumpy and a span has to be BUILT.
// With the fall speed raised to match, that is 103s and 18 chains a game.

const S = new WeakMap();

// Soft-body feel, pressed onto the solver instance. Never edit blobs.js.
export const JELLY_FEEL = { qMin: 0.62, loadSquash: 0.25 };

export default {
  id: 'jelly',
  name: 'JELLY LAB',
  blurb: 'Soft bodies. They squash, they fuse, they will not settle for you.',
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
    fallRate: 30,
    fallAccel: 1.2,
    fallMax: 90,
  },

  onStart(world, api) {
    api = safeApi(api);
    const st = {
      scorer: makeScorer({ per: 26, curve: 5000 }),
      soft: !!(world.blobs && typeof world.blobs.step === 'function'),
    };
    st.scorer.sync(world);
    S.set(world, st);
    api.biome(this.biome);
    if (st.soft) Object.assign(world.blobs, JELLY_FEEL);
    else api.banner('RIGID');
  },

  onTick(world, api) {
    const st = S.get(world);
    if (!st) return;
    st.scorer.tick(world);
  },

  onChain(world, api, cells) {
    const st = S.get(world);
    if (!st) return;
    api = safeApi(api);
    const n = cells ? cells.length : world.lastChainSize;
    const pts = st.scorer.award(world, n);
    api.shake(Math.min(1, n / 2000));
    return pts;
  },

  /** True when lane D's solver is actually driving. Tools and HUD read this. */
  isSoft(world) { const st = S.get(world); return !!(st && st.soft); },
  whenReady() { return Promise.resolve(true); },
};
