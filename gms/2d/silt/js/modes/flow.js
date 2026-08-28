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
//
// That sweep measured the BOT, which plays to score and tops itself out in two
// minutes. It says nothing about a player trying to survive — and a player who
// hugs one wall and never blocks the spawn column lasted 646 seconds, because
// the ramp was driven by chains alone: clearing well was punished with speed
// and stalling was rewarded with a game that stayed slow for ever. The time
// term in world.js (`fallTime`, 0.08 grains/sec per second) is what makes a run
// finite either way. Measured over 20 bot games it costs a normal run nothing
// — 7.5 chains against 7.7, median 107s against 101s — while halving the
// survivor's ceiling to 311s. Gate G8 in tools/sim.mjs holds that line.

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
