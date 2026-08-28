import { SAND, CRYSTAL, STEAM, FIRE, EMPTY } from '../sim/materials.js';
import { applyScene, makeTracker, OBJECTIVE_LABEL } from '../data/levelgen.js';
import { pieceBounds, BLK } from '../sim/pieces.js';
import { LEVELS } from '../data/levels.js';
import { TUTORIAL } from '../data/tutorial.js';
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
  /**
   * A LEVEL IS A HANDFUL OF PIECES, NOT A STOPWATCH.
   *
   * Stars used to be time thresholds, so thinking cost wall-clock and bought
   * nothing: measured, a bot that hard-drops with no placement thought at all
   * three-starred every level it finished (3.00 stars per win against a
   * deliberate bot's 2.40), and a bot with real intent that ALSO hard-dropped
   * scored identically to the mindless one — placement was not the variable,
   * speed was. Every objective here is a volume race and volume is exactly what
   * throughput buys, so no bonus paid in seconds could ever fix it. A time
   * bonus I shipped for precisely that purpose turned out to pay a masher 41x
   * what it paid a thoughtful player.
   *
   * Pieces invert it. Each drop costs one, thinking is free, and the fastest
   * way to spend your budget is to spend it carelessly. `limitS` is gone from
   * this mode: the board filling up is still the other way to lose, and that is
   * pressure enough without a clock that punishes deliberation.
   */
  piecesFail: true,
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

/**
 * The campaign is three hand-authored levels followed by the generated table.
 *
 * The tutorial is kept in its own file and PREPENDED rather than merged into
 * levels.js, because levels.js is regenerated wholesale and anything written
 * into it by hand is destroyed the next time. Ids are renumbered across the
 * join so the campaign still reads 1..N to a player and to the save.
 */
const CAMPAIGN = [...TUTORIAL, ...LEVELS].map((lv, i) => (lv.id === i + 1 ? lv : { ...lv, id: i + 1 }));

// The working level set. tools/modesim.mjs swaps in candidate levels and then
// plays them through THIS module, so the validator measures the shipping code
// path rather than a copy of it. A candidate list replaces the campaign whole —
// the generator must never be validating against the tutorial.
let ACTIVE = CAMPAIGN;
export function setLevels(list) { ACTIVE = (list && list.length) ? list : CAMPAIGN; }
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
  blurb: 'Water quenches lava into crystal — and crystal is forever. One solution each, and a handful of pieces to find it.',
  biome: 'kiln',
  // 'pieces', not 'clock'. The shell keys its panel on 'objective' so the stale
  // name was harmless, but a mode's own contract naming a resource the mode no
  // longer has is how the next reader is misled.
  hud: ['score', 'objective', 'pieces', 'next'],
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
      used: 0,            // pieces spent
    };
    st.scorer.sync(world);
    S.set(world, st);
    api.biome(this.biome);
    world.alchemy = {
      id: lv.id, name: lv.name, act: lv.act, arch: lv.arch,
      label: this.label(lv), value: 0, target: st.tracker.target, base: st.tracker.baseline,
      frac: 0, stars: 0, won: false,
      // `left` is PIECES remaining, not seconds. CONTRACTS.md A.4.
      left: budgetOf(lv), budget: budgetOf(lv), used: 0,
    };
  },

  onTick(world, api) {
    const st = S.get(world);
    if (!st) return;
    api = safeApi(api);
    const lv = st.lv;
    vent(world);

    // A new nextPiece means the one before it has been SPAWNED — the piece
    // transition the material rotation already rides on. Counting spawns rather
    // than landings means the piece in your hand is one you have paid for,
    // which is the only reading that makes the number on screen honest.
    if (world.nextPiece !== st.lastNext) {
      st.lastNext = world.nextPiece;
      st.k++;
      st.used++;
      world.cfg.mat = lv.seq[st.k % lv.seq.length];
    }

    const done = st.tracker.update(world);
    const budget = budgetOf(lv);
    const left = Math.max(0, budget - st.used);

    if (done && !st.won) {
      st.won = true;
      st.stars = starsFor(lv, st.used);
      world.won = true;
      world.over = true;
      api.banner(['', 'COMPLETE', 'COMPLETE', 'PERFECT'][st.stars] || 'COMPLETE');
      api.shake(0.6);
    } else if (!st.won && ALCHEMY_CFG.piecesFail && st.used > budget) {
      // THE SPAWN THAT OVERRAN THE BUDGET NEVER HAPPENED.
      //
      // The first version ended the run when the budget hit zero AND no piece
      // was in the air, meaning to let the last one finish falling. But a
      // hard-dropped piece lands inside world.tick() and the next spawn happens
      // before this hook ever runs, so a player who hard-drops was never once
      // seen with an empty hand — measured, a masher played FORTY pieces of a
      // twenty-piece budget. The one strategy the budget exists to stop was the
      // one strategy exempt from it.
      world.piece = null;
      world.over = true;
      world.won = false;
    }

    world.alchemy = {
      id: lv.id, name: lv.name, act: lv.act, arch: lv.arch,
      label: this.label(lv),
      value: st.tracker.value, target: st.tracker.target, base: st.tracker.baseline,
      frac: st.tracker.frac(),
      stars: st.stars, won: st.won,
      // PIECES, not seconds: `left` is what remains of the budget and `used` is
      // what a star is judged on. Anything calibrating a threshold reads `used`.
      left, budget, used: st.used,
      seconds: +world.t.toFixed(2),
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
    // No span bonus. It paid seconds, and seconds no longer decide anything
    // here — see the note on ALCHEMY_CFG. The budget is what rewards a span
    // now: a wide one clears more of the board per piece spent, which is the
    // same incentive expressed in the currency the mode actually counts.
    return pts;
  },
};

/**
 * How many pieces this level gives you.
 *
 * `pieces` is the shipped field. `limitS` is what the old time-limited table
 * carried, and a level from before the change is read as ONE PIECE PER SECOND
 * of its old limit — deliberately generous, because the fallback exists so an
 * un-regenerated table still boots and plays, not so it plays well. A stricter
 * ratio made every early level unwinnable the moment the clock came out.
 */
export function budgetOf(lv) {
  if (lv && lv.pieces > 0) return lv.pieces | 0;
  if (lv && lv.limitS > 0) return Math.max(8, Math.round(lv.limitS));
  return 30;
}

/** stars[] is [oneStar, twoStar, threeStar] in PIECES USED, fewest last. */
export function starsFor(lv, used) {
  const s = lv.stars;
  if (used <= s[2]) return 3;
  if (used <= s[1]) return 2;
  if (used <= s[0]) return 1;
  return 1;   // completing at all is worth a star
}
