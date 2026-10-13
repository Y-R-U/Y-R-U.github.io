// Pick-all scoring, shared by the format, P2P hosts and tests (server/scoring.go pickallCap mirrors it).
// Score = share of the n right answers found. Players pick at most n, so a wrong pick already costs a right one;
// more than n picks scores 0, so picking everything never pays.
export function pickScore(given, answer) {
  const right = new Set((Array.isArray(answer) ? answer : []).map(Number).filter(Number.isInteger));
  const picked = new Set((Array.isArray(given) ? given : []).map(Number).filter(Number.isInteger));
  const hits = [...picked].filter(i => right.has(i)).length, wrong = picked.size - hits;
  const n = right.size || 1;
  if (picked.size > right.size) return { hits, wrong, missed: right.size - hits, frac: 0, correct: false };
  return { hits, wrong, missed: right.size - hits, frac: Math.min(1, hits / n), correct: right.size > 0 && hits === right.size && wrong === 0 };
}
// The most a pick-all answer may score (before streaks), whatever the client claims.
export const pickallCap = (answer, given, maxBase = 500) => Math.round(maxBase * pickScore(given, answer).frac);
