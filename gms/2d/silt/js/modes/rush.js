import { SAND } from '../sim/materials.js';
import { SIM_HZ } from '../sim/world.js';
import { safeApi } from './api.js';
import { makeScorer } from './score.js';

// RUSH — score attack against a fixed clock.
//
// The tension is speed against settling. A piece dropped well ahead of gravity
// raises HEAT, and heat multiplies every chain and pays a small bonus on the
// drop itself, so hurrying is always worth something. But a quick drop lands
// on sand that is still flowing, the board fills faster than chains can drain
// it, and a top-out ends the run with clock still on it. Surviving to the bell
// banks a finish bonus on top, so throwing the run away has a real price.
//
// Measured over 16 seeds per agent (delay = seconds before acting on a piece):
// careful hard drops at 1.2s reach the bell 14/16 but score least (mean 3.9k);
// 0.8s drops 10/16, mean 7.0k; 0.3s drops 3/16, mean 9.6k with a 34k ceiling.
// No pace dominates on the median (6.0k-7.0k); rushing buys the ceiling with
// the bell. Gate R1 in tools/modesim.mjs holds the clock and top-out rules.

const S = new WeakMap();

export const RUSH_CFG = {
  duration: 120,            // seconds on the clock
  heatStep: 0.2,            // per quick drop
  heatMax: 3,
  heatHold: 2.5 * SIM_HZ,   // ticks after a quick drop before heat starts to bleed
  heatDecay: 0.6 / SIM_HZ,  // per tick while bleeding
  fastFrac: 0.5,            // "quick" = landed in under half its gravity time
  minDrop: 24,              // rows; a piece that barely fell proves nothing
  dropPts: 3,               // per quick drop, times heat
  bellBonus: 1,             // reaching the bell doubles the run
};

export default {
  id: 'rush',
  name: 'RUSH',
  blurb: 'Two minutes. Drop fast for heat; survive to the bell to double it.',
  biome: 'kiln',
  hud: ['score', 'chains', 'combo', 'clock', 'next'],

  worldCfg: {
    mat: SAND,
    tints: 3,
    tintMode: 'mono',
    diagonal: true,
    reactions: false,
    fallRate: 40,
    fallAccel: 0.5,
    fallTime: 0.03,
    fallMax: 90,
  },

  onStart(world, api) {
    api = safeApi(api);
    const st = {
      scorer: makeScorer({ per: 20, curve: 8000 }),
      heat: 1, peak: 1, lastBeat: -1e9, bonus: 0, quick: 0,
      p: null, y0: 0, t0: 0, landed: world.landed, warned: false, bell: false,
    };
    st.scorer.sync(world);
    S.set(world, st);
    world.rush = { left: RUSH_CFG.duration, duration: RUSH_CFG.duration, heat: 1, peak: 1,
      timeUp: false, bonus: 0, bell: 0 };
    api.biome(this.biome);
  },

  onTick(world, api) {
    const st = S.get(world);
    if (!st) return;
    api = safeApi(api);
    const C = RUSH_CFG;
    if (world.landed > st.landed) {
      if (st.p) {
        const dist = st.p.y - st.y0, life = (world.ticks - st.t0) / SIM_HZ;
        if (dist >= C.minDrop && life < C.fastFrac * dist / Math.max(1, world.fallRate)) {
          st.heat = Math.min(C.heatMax, st.heat + C.heatStep);
          st.lastBeat = world.ticks;
          st.quick++;
          const pts = Math.round(C.dropPts * st.heat);
          world.score += pts;
          st.bonus += pts;
          if (st.heat > st.peak) st.peak = st.heat;
        }
      }
      st.landed = world.landed;
      st.p = null;
    }
    if (world.piece) {
      if (!st.p) { st.y0 = world.piece.y; st.t0 = world.ticks; }
      st.p = world.piece;
    }
    if (st.heat > 1 && world.ticks - st.lastBeat > C.heatHold) st.heat = Math.max(1, st.heat - C.heatDecay);

    const left = C.duration - world.t;
    if (!st.warned && left <= 10) { st.warned = true; api.banner('10 SECONDS'); }
    let bell = 0;
    if (left <= 0 && !world.over && !st.bell) {
      st.bell = true;
      bell = Math.round(world.score * C.bellBonus);
      world.score += bell;
      st.bonus += bell;
      world.over = true;
      world.piece = null;
      api.banner('TIME');
    }
    world.rush = {
      left: Math.max(0, left), duration: C.duration, heat: st.heat, peak: st.peak,
      timeUp: st.bell, bonus: st.bonus, bell: bell || (world.rush && world.rush.bell) || 0, quick: st.quick,
    };
    st.scorer.tick(world);
  },

  onChain(world, api, cells) {
    const st = S.get(world);
    if (!st) return;
    api = safeApi(api);
    const n = cells ? cells.length : world.lastChainSize;
    const pts = st.scorer.award(world, n, st.heat);
    api.shake(Math.min(1, n / 5000));
    return pts;
  },
};
