// Rank, stars and experience — what an adventurer is, on paper.
//
// The Society's ladder has four rungs and each rung has four stars. A star is not a level: it is
// the Society noticing you have done enough of a rank's work to be trusted with more of it, and
// the fourth star is what makes you eligible for the rung above. That is why the numbers below
// climb steeply between ranks and gently inside one — an iron adventurer should reach two stars
// in an afternoon and the fourth only by finishing iron work properly.
//
// Pure: the save holds two numbers (`society.rank`, `society.xp`) and everything on the player
// sheet is derived from them here. Nothing else in the game may compute a star.

import { RANKS, RANK_LABEL, rankIndex, rankOf } from './contracts.js';

export const STARS = 4;

// Experience to each star, as a lifetime total rather than a per-rank pool. One number in the
// save, one number on the sheet, and no explaining to a player why the six hundred they earned at
// iron went away when they were promoted.
//
// That means each rank's ladder begins exactly where the one below it ended: bronze's first star
// costs more than the whole of iron, which is right — it is a bronze star. The first version had
// bronze starting at 260 against an iron top of 380, so being promoted handed you a free star.
export const LADDER = {
  iron:   [0, 40, 110, 220, 380],
  bronze: [380, 640, 1080, 1720, 2600],
  silver: [2600, 4200, 6600, 10200, 15400],
  gold:   [15400, 24000, 38000, 60000, 95000],
};

export const XP_FLAG = 'society.xp';
export const RANK_FLAG = 'society.rank';

export const stepsOf = rank => LADDER[rank] || LADDER.iron;

// The rank above, or null at the top. Gold is the top of this Society's ladder — what is above it
// is diamond, and nobody in this province has ever seen one.
export function nextRank(rank) {
  const i = rankIndex(rank);
  return i > 0 && i < RANKS.length - 1 ? RANKS[i + 1] : (i === 0 ? 'iron' : null);
}

export const xpOf = (flags = {}) => Math.max(0, Math.round(+flags[XP_FLAG] || 0));

// How many stars `xp` buys at `rank`, and what the next one costs. `at` is the total for the
// current star, `next` the total for the one after — the bar between them is what the sheet draws.
export function starsFor(rank, xp) {
  const steps = stepsOf(rank);
  const x = Math.max(0, xp);
  let stars = 0;
  for (let i = 1; i < steps.length; i++) if (x >= steps[i]) stars = i;
  const capped = Math.min(STARS, stars);
  const at = steps[capped];
  const next = capped >= STARS ? null : steps[capped + 1];
  return {
    stars: capped,
    at,
    next,
    into: x - at,
    need: next == null ? 0 : next - at,
    // 1 at the top of a rank rather than 0: a full bar is what says "you are ready for the next
    // rung", and an empty one there would read as having lost everything.
    fraction: next == null ? 1 : Math.min(1, Math.max(0, (x - at) / Math.max(1, next - at))),
    toNext: next == null ? 0 : Math.max(0, next - x),
  };
}

// Everything the player sheet shows. One call, so the sheet and the mission panel cannot disagree
// about what rank the player is.
export function sheet(flags = {}) {
  const rank = rankOf(flags);
  const xp = xpOf(flags);
  // Unranked has no ladder of its own — it has a proving. It is shown against iron's first star so
  // the bar is not a blank rectangle before registration.
  const ladderRank = rank === 'none' ? 'iron' : rank;
  const s = starsFor(ladderRank, rank === 'none' ? 0 : xp);
  const up = nextRank(rank);
  return {
    rank,
    rankLabel: RANK_LABEL[rank],
    registered: rank !== 'none',
    xp,
    ...s,
    max: STARS,
    nextRank: up,
    nextRankLabel: up ? RANK_LABEL[up] : null,
    // What it would take to be promoted, said as one line. Null once there is nothing above.
    promotion: rank === 'none'
      ? 'Pass the proving and sign the register.'
      : (s.stars >= STARS
        ? (up ? `Four stars. ${RANK_LABEL[up]} rank is open to you.` : 'Four stars at gold. There is nothing above this here.')
        : `${s.toNext} more to the ${ordinal(s.stars + 1)} star.`),
  };
}

const ORDINALS = ['zeroth', 'first', 'second', 'third', 'fourth'];
export const ordinal = n => ORDINALS[n] || `${n}th`;

// Earning it. Returns the flags to write and what changed, so the caller can say "a star" out loud
// without working out for itself whether one was crossed.
export function award(flags = {}, amount) {
  const gain = Math.max(0, Math.round(amount || 0));
  const rank = rankOf(flags);
  const before = sheet(flags);
  const after = sheet({ ...flags, [XP_FLAG]: xpOf(flags) + gain });
  return {
    xp: xpOf(flags) + gain,
    gain,
    rank,
    stars: after.stars,
    starGained: after.stars > before.stars,
    rankReady: after.stars >= STARS && before.stars < STARS && !!after.nextRank,
    before,
    after,
  };
}

// Going down costs you a star. Aaron's son asked for exactly that, and the honest reading of it
// is "back to where the star you just earned began" rather than a flat subtraction — a fixed
// number of experience means the same death costs a bronze adventurer a tenth of what it costs an
// iron one, and past a rank's fourth star it would cost nothing at all.
//
// You are never demoted and you never fall below the rank's own floor. Losing a rank to one bad
// contract would mean losing the FLOOR of the building you are allowed to walk on, and a player
// standing on a stair they can no longer climb is a punishment nobody asked for.
export function loseStar(flags = {}) {
  const rank = rankOf(flags);
  if (rank === 'none') return null;
  const steps = stepsOf(rank);
  const before = sheet(flags);
  // The bottom of the star below the one you are on. At no stars there is nothing left to take.
  const to = Math.max(steps[0], steps[Math.max(0, before.stars - 1)]);
  const xp = Math.min(xpOf(flags), to);
  const after = sheet({ ...flags, [XP_FLAG]: xp });
  return {
    xp,
    lost: xpOf(flags) - xp,
    starLost: after.stars < before.stars,
    rank,
    before,
    after,
  };
}

// The Society promoting you, which is a separate act from earning the stars: you are eligible at
// four stars and ranked when somebody at a desk says so. Experience carries across — the next
// rung's ladder simply starts a long way up.
export function promote(flags = {}) {
  const rank = rankOf(flags);
  const s = sheet(flags);
  if (!s.nextRank || s.stars < STARS) return null;
  return { [RANK_FLAG]: s.nextRank, from: rank, to: s.nextRank };
}
