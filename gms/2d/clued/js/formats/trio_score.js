// Hat-trick scoring, shared by the format, P2P hosts and tests (server/scoring.go trioScore/trioPoints mirror it).
// answer = the right option index per row, given = the picked index per row. Each right row = 1/rows of the points.
export function trioScore(given, answer) {
  const a = Array.isArray(answer) ? answer : [];
  const g = Array.isArray(given) ? given : [];
  if (!a.length || !a.every(Number.isInteger) || g.length > a.length) return { hits: 0, of: a.length, frac: 0, correct: false };
  const hits = a.filter((x, i) => Number.isInteger(g[i]) && g[i] === x).length;
  return { hits, of: a.length, frac: hits / a.length, correct: hits === a.length && g.length === a.length };
}
// The most a Hat-trick answer may score (before streaks), whatever the client claims.
export const trioCap = (answer, given, maxBase = 500) => Math.round(maxBase * trioScore(given, answer).frac);
