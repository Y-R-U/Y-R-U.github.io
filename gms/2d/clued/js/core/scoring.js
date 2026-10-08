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

// Progressive questions (CONTRACT "Progressive stages"): 1 at stage 0 down to 0.4 at the last stage. The server uses the same rule.
export const stageMultiplier = (stage, n) => (n > 1 ? 1 - 0.6 * Math.min(Math.max(0, stage), n - 1) / (n - 1) : 1);
// Progressive timing: initial = answer time × 1.5 (min 10 s); each advance extends to max(deadline, now + max(5 s, answer/2)); cap 90 s.
export const progressiveLimit = answerMs => Math.max(10000, Math.round(answerMs * 1.5));
export const stageExtendMs = answerMs => Math.max(5000, Math.round(answerMs / 2));
export const PROGRESSIVE_CAP = 90000;

// Online rooms: progressive stages auto-advance for everyone (no voting). The window fits the stages at a per-format
// pace and leaves a tail after the last stage; the deadline is fixed when the question opens. Mirrored in server/scoring.go.
export const STAGE_STEP_MS = { ladder: 4500, silhouette: 5000 };
export function autoStages(format, n, answerMs) {
  const tail = Math.min(8000, Math.max(5000, Math.round(answerMs / 2)));
  const limit = Math.min(PROGRESSIVE_CAP, Math.max(progressiveLimit(answerMs), (n - 1) * (STAGE_STEP_MS[format] || 4000) + tail));
  return { limit, step: Math.floor((limit - tail) / (n - 1)), tail };
}
export const dueStage = (elapsedMs, n, stepMs) => (elapsedMs <= 0 ? 0 : Math.min(n - 1, Math.floor(elapsedMs / stepMs)));
