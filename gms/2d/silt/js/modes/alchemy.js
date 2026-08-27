import { SAND, CRYSTAL } from '../sim/materials.js';
import { applyScene, makeTracker, OBJECTIVE_LABEL } from '../data/levelgen.js';
import { LEVELS } from '../data/levels.js';
import { safeApi } from './api.js';
import { makeScorer } from './score.js';

// ALCHEMY — seeded objective levels built on the reaction table.
//
// The level decides the board, the piece-material rotation and the objective;
// the mode is only the harness. Piece material is switched by writing
// world.cfg.mat, which makePiece reads when it builds the NEXT piece, so the
// rotation lands one piece later than it is set — deliberate and deterministic,
// and the preview stays truthful.
//
// Crystal is permanent and unclearable. That is what makes the quench levels a
// real decision rather than a chore: every point of progress is also a wall you
// chose to build, and lava you brought yourself is the only thing on the board
// that can brick a level outright.

const S = new WeakMap();

export const ALCHEMY_CFG = { hardFailAtLimit: true };

// The working level set. tools/genlevels.mjs swaps in candidate levels and then
// plays them through THIS module, so the validator measures the shipping code
// path rather than a copy of it.
let ACTIVE = LEVELS;
export function setLevels(list) { ACTIVE = (list && list.length) ? list : LEVELS; }
export function activeLevels() { return ACTIVE; }

export function levelById(id) {
  return ACTIVE.find((l) => l.id === id) || ACTIVE[0];
}

/**
 * World config for one level. `worldCfg` below is level 1; the host should call
 * this when starting a specific level (an additive helper — the contract's
 * plain `worldCfg` object is still there and still valid).
 */
export function worldCfgFor(opts = {}) {
  const lv = levelById(opts.level || 1);
  return {
    levelId: lv.id,
    mat: lv.seq[0],
    tints: lv.tints,
    tintMode: lv.tintMode,
    diagonal: lv.diagonal,
    reactions: true,
    cols: lv.cols,
    rows: lv.rows,
    fallRate: lv.fallRate,
    fallAccel: lv.fallAccel,
    fallMax: lv.fallMax,
  };
}

export default {
  id: 'alchemy',
  name: 'ALCHEMY',
  blurb: 'Water quenches lava into crystal — and crystal is forever. Ninety graded problems.',
  biome: 'kiln',
  hud: ['score', 'objective', 'clock', 'next'],
  get levels() { return ACTIVE; },
  levelById,
  worldCfgFor,
  label: (lv) => (OBJECTIVE_LABEL[lv.objective.type] || (() => ''))(lv.objective),

  worldCfg: worldCfgFor({ level: 1 }),

  onStart(world, api) {
    api = safeApi(api);
    const lv = levelById(world.cfg.levelId || 1);
    applyScene(world, lv);
    const st = {
      lv,
      scorer: makeScorer({ per: 14, curve: 4200 }),
      tracker: makeTracker(world, lv),
      k: 0,
      lastNext: world.nextPiece,
      won: false,
      stars: 0,
    };
    st.scorer.sync(world);
    S.set(world, st);
    api.biome(this.biome);
    world.alchemy = {
      id: lv.id, name: lv.name, act: lv.act, arch: lv.arch,
      label: this.label(lv), value: 0, target: st.tracker.target,
      frac: 0, left: lv.limitS, stars: 0, won: false,
    };
  },

  onTick(world, api) {
    const st = S.get(world);
    if (!st) return;
    api = safeApi(api);
    const lv = st.lv;

    if (world.nextPiece !== st.lastNext) {
      st.lastNext = world.nextPiece;
      st.k++;
      world.cfg.mat = lv.seq[st.k % lv.seq.length];
    }

    const done = st.tracker.update(world);
    const left = lv.limitS - world.t;

    if (done && !st.won) {
      st.won = true;
      st.stars = starsFor(lv, world.t);
      world.won = true;
      world.over = true;
      api.banner(['', 'COMPLETE', 'COMPLETE', 'PERFECT'][st.stars] || 'COMPLETE');
      api.shake(0.6);
    } else if (!st.won && ALCHEMY_CFG.hardFailAtLimit && left <= 0) {
      world.over = true;
      world.won = false;
    }

    world.alchemy = {
      id: lv.id, name: lv.name, act: lv.act, arch: lv.arch,
      label: this.label(lv),
      value: st.tracker.value, target: st.tracker.target,
      frac: st.tracker.frac(), left: Math.max(0, left),
      stars: st.stars, won: st.won,
    };
    st.scorer.tick(world);
  },

  onChain(world, api, cells) {
    const st = S.get(world);
    if (!st) return;
    api = safeApi(api);
    const n = cells ? cells.length : world.lastChainSize;
    const pts = st.scorer.award(world, n);
    api.shake(Math.min(1, n / 3000));
    return pts;
  },
};

/** stars[] is [oneStar, twoStar, threeStar] in seconds, fastest last. */
export function starsFor(lv, seconds) {
  const s = lv.stars;
  if (seconds <= s[2]) return 3;
  if (seconds <= s[1]) return 2;
  if (seconds <= s[0]) return 1;
  return 1;   // completing at all is worth a star
}
