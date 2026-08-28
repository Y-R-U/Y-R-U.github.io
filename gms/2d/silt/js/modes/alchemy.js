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

export const ALCHEMY_CFG = {
  hardFailAtLimit: true, ventRows: 6, corridorPad: 6, corridorDepth: 12,
  // THE WIDEST SPAN BUYS TIME. Paid ONCE, on a SHARE of the board. See below.
  spanShare: (f) => Math.min(8, Math.max(0, f - 0.30) * 17.8),
  spanMinCells: 900,
};

/**
 * WHY A CHAIN GIVES SECONDS BACK — AND WHY IT IS PAID ONCE, ON A SHARE.
 *
 * A star is a time threshold, so the fastest route to three stars was to swipe
 * every piece down as quickly as the hand allows and let the board sort itself
 * out. Thinking costs wall-clock and bought nothing — which made mashing the
 * optimal strategy in a puzzle game, and a player noticed within five levels.
 *
 * The engine cannot hold a chain back: a same-tint component clears the moment
 * it touches both walls. But a player CAN choose to grow one wide before
 * closing it, and that is the strategic act this mode had no way to pay for.
 * So a span is paid in the only currency stars are denominated in: seconds.
 *
 * The FIRST version of this paid `min(8, n^2 / 1.2e6)` for every chain over 900
 * cells, summed. It was quadratic on the theory that one 4,000-grain span
 * should beat four 1,000-grain ones, so engineering the big one would be worth
 * the wall-clock it costs. That theory is wrong in this engine, and
 * `tools/modesim.mjs --masher` measures exactly how wrong. Over 18 runs on the
 * shipped table:
 *
 *              drops/s   chains/run   median chain   bonus/run
 *   bot          2.25        3.9          1199         6.3s
 *   masher      10.42      103.3          1537       260.7s
 *
 * Mashing does not make SMALLER chains. It makes bigger ones, because chain
 * size is a function of how much sand is standing on the board and throughput
 * is what puts it there — and it makes twenty-six times as many. A per-chain
 * bonus multiplied by 26x the chances is a mashing amplifier however
 * superlinear it is in size, and this one paid a masher 41x what it paid a
 * deliberate player. The mechanic added to beat mashing was the strongest
 * reason to mash in the game.
 *
 * Two changes, each aimed at one of those two numbers:
 *
 *   PAID ONCE. The bonus is your WIDEST span, not the sum of all of them — you
 *   are paid the improvement each time you beat your own best. 26x the chances
 *   then buys 26x of nothing, and the count advantage is gone outright.
 *
 *   PAID ON A SHARE. The unit is the fraction of the standing board the span
 *   took, not its raw cell count, so a full board does not pay more than a
 *   clean one for the same act. Measured best-of-run share: bot 0.577, masher
 *   0.648 — a 1.12x gap where raw cells gave 1.84x.
 *
 * Together those take the masher's advantage from 41x to about 1.1x. Below 0.30
 * of the board nothing is paid, 0.75 pays the full 8s, and the 900-cell floor
 * still keeps the incidental chains that fall out of any pile from paying at
 * all on a large board.
 *
 * BE CLEAR ABOUT WHAT THIS DOES AND DOES NOT FIX. It stops the bonus rewarding
 * mashing. It does NOT make thinking beat mashing, and no time bonus can,
 * because every objective in this campaign — clear N chains, dissolve N grains,
 * forge N crystal, reduce sand to N — is itself a volume race, and volume is
 * what throughput buys. Mashing's real price is already in the game and it is
 * the fail rate: 8 losses in 18 runs against the deliberate bot's 1. The lever
 * that would actually settle it is an objective volume cannot buy, or a piece
 * economy that charges for the drop; both are design calls above a
 * regeneration pass.
 */

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
      bonus: 0,           // seconds bought back — always equal to `best`
      best: 0,            // the widest span so far, in seconds
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
    const left = lv.limitS + st.bonus - world.t;

    if (done && !st.won) {
      st.won = true;
      // Stars are judged on the clock the PLAYER faced, which the bonus moved.
      st.stars = starsFor(lv, world.t - st.bonus);
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
      stars: st.stars, won: st.won, bonus: +st.bonus.toFixed(1),
      // The clock the PLAYER faced, which is what a star is judged on. Anything
      // calibrating star thresholds has to read this and not world.t, or every
      // threshold comes out generous by exactly the bonus the run earned.
      elapsed: +Math.max(0, world.t - st.bonus).toFixed(2),
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
    if (n >= ALCHEMY_CFG.spanMinCells) {
      // The share of the STANDING board this span took. g.count still includes
      // the chain here — detect() only flags the cells, it does not remove them
      // until they dissolve — so this is the board as it was when the span
      // closed, which is the board the player was looking at.
      // `spanSummedQuadratic` is never set in shipping code. It exists so that
      // tools/modesim.mjs --break masher can restore the ORIGINAL mechanic
      // verbatim and watch the gate that replaced it go red.
      const q = ALCHEMY_CFG.spanSummedQuadratic;
      if (q) { st.bonus += q(n); return pts; }
      const gain = ALCHEMY_CFG.spanShare(n / Math.max(1, world.g.count));
      const inc = gain - st.best;
      if (inc >= 0.5) {
        st.best = gain;
        st.bonus = gain;      // paid ONCE: the total IS the widest span
        api.banner(`+${inc.toFixed(1)}S WIDEST SPAN`);
      }
    }
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
