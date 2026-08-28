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
// them rather than editing blobs.js. qMin stops a body flattening into a puddle
// and loadSquash stops the stack above forcing it to, so jelly stays lumpy and
// a span has to be BUILT.
//
// BOARD SIZE. This shipped at 64 x 224, an aspect of 0.286 that letterboxed to
// a 241px column on a 390px phone — the only mode not filling its screen, which
// reads as broken rather than deliberate. It was 64 wide because a 256-grain
// body is only ~29 cells across at qMin 0.62, so a wider board needs more
// bodies per span and the clear rate collapses: widening to 96 or 112 at the
// old feel drops the mode to 2-3 chains a game with a third of runs never
// clearing anything at all. Measured, not assumed.
//
// The fix is TWO changes that pull in the same direction, because the player
// sees the ASPECT, not the column count:
//   - 192 rows instead of 224. The span stays 88 cells, but 88/192 = 0.458
//     fills essentially the whole width of a 390x844 screen where 88/224 would
//     still letterbox to 85%.
//   - qMin 0.38 / loadSquash 0.42 instead of 0.62 / 0.25, which is the same
//     lumpiness RELATIVE TO THE BOARD: a body is ~48 of 88 cells wide here
//     against ~29 of 64 before, so it still takes the same handful of bodies to
//     reach across and a span is still built rather than given.
//
// Over 60 games across five independent seed families that is 104s and 12.5
// chains a game at 78% fill, against 84s / 12.5 / 80% for the 64-wide board it
// replaces — and 5 of 60 runs under four chains against the old board's 9 of
// 60. The fall speed is untouched: the tempo is the one thing that did not need
// to move. Three seed families is the minimum here; a 112-wide tuning passed
// two families at 12 chains a game and collapsed to 6.5 on the third.

const S = new WeakMap();

// Soft-body feel, pressed onto the solver instance. Never edit blobs.js.
export const JELLY_FEEL = { qMin: 0.38, loadSquash: 0.42 };

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
    cols: 88,
    rows: 192,
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
