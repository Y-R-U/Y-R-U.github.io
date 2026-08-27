import { SAND } from '../sim/materials.js';
import { safeApi } from './api.js';
import { makeScorer } from './score.js';

// FLOW — the baseline. Sand only, three tints, one lever: it gets faster.
//
// Three tints is not a difficulty setting, it is the only value that works.
// Spanning a same-tint component wall to wall is site percolation on an
// 8-connected lattice; at four tints the measured chain rate over a full
// parameter sweep is under one per game at every board size, so the mode would
// simply never clear. Difficulty therefore comes from fall speed, and from
// board width in the harder presets — never from colour count.
//
// fallRate 34 / accel 0.9 / max 120 was picked by sweep: median run 101s,
// 13/16 seeds inside the 70-170s band, ~9 chains. The old 22/0.55 default put
// the bot at 189s and 1.2M points.

const S = new WeakMap();

const SPEED_TIERS = [
  { at: 55,  text: 'QUICKENING' },
  { at: 80,  text: 'TORRENT' },
  { at: 105, text: 'CATARACT' },
];

export default {
  id: 'flow',
  name: 'FLOW',
  blurb: 'Endless sand. Span the board with one colour before the stack reaches the top.',
  biome: 'dune',
  hud: ['score', 'chains', 'combo', 'next'],

  worldCfg: {
    mat: SAND,
    tints: 3,
    tintMode: 'mono',
    diagonal: true,
    reactions: false,
    fallRate: 34,
    fallAccel: 0.9,
    fallMax: 120,
  },

  onStart(world, api) {
    api = safeApi(api);
    const st = { scorer: makeScorer({ per: 20, curve: 8000 }), tier: -1 };
    st.scorer.sync(world);
    S.set(world, st);
    api.biome(this.biome);
  },

  onTick(world, api) {
    const st = S.get(world);
    if (!st) return;
    api = safeApi(api);
    for (let i = st.tier + 1; i < SPEED_TIERS.length; i++) {
      if (world.fallRate >= SPEED_TIERS[i].at) { st.tier = i; api.banner(SPEED_TIERS[i].text); }
      else break;
    }
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
