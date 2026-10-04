export const BASE = 100;
export const TIMED_BONUS = 400;
export const MAX_POINTS = 500;

export function basePoints({ timed = false, remaining = 0, limit = 0 } = {}) {
  if (!timed || !limit) return BASE;
  const frac = Math.max(0, Math.min(1, remaining / limit));
  return Math.min(MAX_POINTS, BASE + Math.round(TIMED_BONUS * frac));
}

// streak counts this answer: 1st correct = +0%, 2nd in a row = +10% … capped at +50%
export const streakMultiplier = streak => 1 + Math.min(0.5, Math.max(0, streak - 1) * 0.1);

export const withStreak = (points, streak) => Math.round(points * streakMultiplier(streak));

export function clueLadderPoints(cluesShown, totalClues) {
  if (totalClues <= 1) return MAX_POINTS;
  const left = Math.max(0, totalClues - cluesShown);
  return Math.round(BASE + TIMED_BONUS * left / (totalClues - 1));
}

export const pinDropPoints = (km, kmPerPoint = 10) => Math.max(0, Math.round(MAX_POINTS - km / kmPerPoint));

export const LADDER_RUNGS = [100, 200, 300, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 125000, 250000, 500000, 1000000];
export const LADDER_SAFE = [4, 9];   // rung indices you keep if you fall

export function ladderBanked(rungsCleared) {
  let banked = 0;
  for (const i of LADDER_SAFE) if (rungsCleared > i) banked = LADDER_RUNGS[i];
  return banked;
}
