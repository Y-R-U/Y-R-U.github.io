// Years offered as answer options: how far apart they sit by level (Aaron 2026-10-16). Hard may use neighbouring
// years, medium (and "any") 2–3 apart, easy 4–6, kids 10+. The right year lands anywhere in the row, which is in order.
import { shuffle } from './registry.js?v=202610170710';

export const YEAR_STEPS = { 1: [4, 6], 2: [2, 3], 3: [1, 2], kids: [10, 12] };
export const MAX_YEAR = 2026;
export const stepsFor = (level, kids = false) => (kids ? YEAR_STEPS.kids : YEAR_STEPS[level] || YEAR_STEPS[2]);
// The smallest gap allowed at a level (tests and validators).
export const minGap = (level, kids = false) => stepsFor(level, kids)[0];

// n exact years around y: { years (ascending), answer (index) } or null when they won't fit between lo and hi.
export function yearOptions(rng, y, n = 4, { level = 2, kids = false, lo = -3000, hi = MAX_YEAR } = {}) {
  const [a, b] = stepsFor(level, kids);
  const step = () => a + Math.floor(rng() * (b - a + 1));
  for (const k of shuffle(rng, [...Array(n).keys()])) {
    const all = [y];
    for (let i = 0; i < k; i++) all.unshift(all[0] - step());
    while (all.length < n) all.push(all[all.length - 1] + step());
    if (all[0] >= lo && all[n - 1] <= hi) return { years: all, answer: k };
  }
  return null;
}

// A plain year answer ("1975"), so a question's wrong years can be re-spaced by level.
export const plainYear = v => (/^\d{3,4}$/.test(String(v ?? '').trim()) ? Number(String(v).trim()) : null);
