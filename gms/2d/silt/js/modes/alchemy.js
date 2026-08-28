import { SAND, CRYSTAL, STEAM, FIRE, EMPTY } from '../sim/materials.js';
import { applyScene, makeTracker, OBJECTIVE_LABEL } from '../data/levelgen.js';
import { pieceBounds, BLK } from '../sim/pieces.js';
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

export const ALCHEMY_CFG = { hardFailAtLimit: true, ventRows: 6, corridorPad: 6, corridorDepth: 12 };

/**
 * Gas must not block the falling piece.
 *
 * Quenching lava makes STEAM in bulk and steam climbs. In the CA, water sinks
 * straight through steam — density 30 against 2 — but the falling piece is not
 * in the grid, and collides() treats every non-empty cell as solid, gas
 * included. So the rising steam front caught each incoming water piece in
 * mid-air, the piece landed near the ceiling, and the next spawn topped the
 * board out: measured, every quench level died at 3.3s with the objective at
 * 15% done.
 *
 * The correct fix is for collides() to ignore GAS, which is world/pieces and
 * not this lane. Until then the mode clears gas out of two places only — the
 * spawn crown, and the corridor immediately below the piece — which reproduces
 * the CA's own answer without touching the sim.
 */
function vent(world) {
  const g = world.g;
  const end = Math.min(g.n, ALCHEMY_CFG.ventRows * g.cols);
  for (let i = 0; i < end; i++) {
    const m = g.mat[i];
    if (m === STEAM || m === FIRE) g.set(i, EMPTY, 0);
  }
  const p = world.piece;
  if (!p) return;
  const b = pieceBounds(p);
  const x0 = Math.max(0, p.x + b.minX * BLK - ALCHEMY_CFG.corridorPad);
  const x1 = Math.min(g.cols - 1, p.x + (b.maxX + 1) * BLK + ALCHEMY_CFG.corridorPad);
  const y0 = Math.max(0, p.y + (b.maxY + 1) * BLK);
  const y1 = Math.min(g.rows - 1, y0 + ALCHEMY_CFG.corridorDepth);
  for (let y = y0; y <= y1; y++) {
    const row = y * g.cols;
    for (let x = x0; x <= x1; x++) {
      const m = g.mat[row + x];
      if (m === STEAM || m === FIRE) g.set(row + x, EMPTY, 0);
    }
  }
}

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
    // NO TIME RAMP. The endless modes need one — without it a player who only
    // tries to survive lasts ten minutes — but a level is already finite: its
    // tension is the objective against `limitS`, and a speed ramp on top would
    // compound the clock it is measured against. Two levels immediately fell to
    // 1-of-3 wins when they inherited the default, which is the campaign saying
    // the same thing: these levels were tuned against their own clock.
    fallTime: 0,
  };
}

export default {
  id: 'alchemy',
  name: 'ALCHEMY',
  blurb: 'Water quenches lava into crystal — and crystal is forever. A graded campaign of measured problems.',
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
      label: this.label(lv), value: 0, target: st.tracker.target, base: st.tracker.baseline,
      frac: 0, left: lv.limitS, stars: 0, won: false,
    };
  },

  onTick(world, api) {
    const st = S.get(world);
    if (!st) return;
    api = safeApi(api);
    const lv = st.lv;
    vent(world);

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
      value: st.tracker.value, target: st.tracker.target, base: st.tracker.baseline,
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
