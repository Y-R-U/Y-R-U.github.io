// ranking.js — the Guild's all-audience ladder.
//
// There is no server. The ladder is a deterministic curve: every clearance
// worker in the galaxy is imaginary, but the position you climb to is honest —
// the same score always maps to the same rank, and the neighbours around you
// are generated from your rank so the board looks alive.

import { alienName, fmtFull, makeRng } from './utils.js';

export const START_RANK = 10_000_000_000;

export function rankForScore(score) {
  if (!score || score <= 0) return START_RANK;
  const r = Math.ceil(START_RANK / (1 + Math.pow(score / 220, 1.25)));
  return Math.max(1, Math.min(START_RANK, r));
}

export function scoreForRank(rank) {
  if (rank >= START_RANK) return 0;
  return 220 * Math.pow(START_RANK / rank - 1, 1 / 1.25);
}

const TITLES = [
  [1, 'GUILD LEGEND'],
  [10, 'GALACTIC ICON'],
  [100, 'HOUSEHOLD NAME'],
  [1_000, 'CELEBRITY CLEARER'],
  [10_000, 'TRENDING'],
  [100_000, 'WATCHED'],
  [1_000_000, 'RISING FEED'],
  [10_000_000, 'NICHE APPEAL'],
  [100_000_000, 'BACKGROUND NOISE'],
  [1_000_000_000, 'BARELY REGISTERED'],
  [Infinity, 'UNSEEN'],
];

export function rankTitle(rank) {
  for (const [max, name] of TITLES) if (rank <= max) return name;
  return 'UNSEEN';
}

/** Percentile of the whole (imaginary) workforce you are ahead of. */
export function rankPercent(rank) {
  return Math.max(0, (1 - rank / START_RANK)) * 100;
}

/**
 * Board rows around the player. Returns [{rank,name,score,you}] ordered best
 * first — 4 above, you, 4 below.
 */
export function neighbours(rank, playerName) {
  const rows = [];
  const spread = Math.max(1, Math.round(rank * 0.00035));
  for (let i = -4; i <= 4; i++) {
    if (i === 0) { rows.push({ rank, name: playerName || 'YOU', score: scoreForRank(rank), you: true }); continue; }
    let r = rank + i * (spread + Math.abs(i));
    r = Math.max(1, Math.round(r));
    if (r === rank) r = rank + i;
    rows.push({ rank: r, name: alienName(r * 2654435761 % 4294967296), score: scoreForRank(r), you: false });
  }
  rows.sort((a, b) => a.rank - b.rank);
  return rows;
}

/** Milestones the ladder screen shows as "next targets". */
export function nextMilestone(rank) {
  const marks = [1_000_000_000, 100_000_000, 10_000_000, 1_000_000, 100_000, 10_000, 1_000, 100, 10, 1];
  for (const m of marks) if (rank > m) return m;
  return 1;
}

export function fmtRank(r) { return '#' + fmtFull(r); }
