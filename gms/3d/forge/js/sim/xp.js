// The level curve, diminishing returns and Grasp. SYSTEMS.md §3.

import { SCHOOLS, affinityXp } from './schools.js';

export const MAX_LEVEL = 20;

export const xpToReach = L => L <= 1 ? 0 : Math.floor(50 * Math.pow(L - 1, 2.5) + 25 * (L - 1));

export function levelFor(xp) {
  let lo = 1, hi = MAX_LEVEL;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (xp >= xpToReach(m)) lo = m; else hi = m - 1; }
  return lo;
}

export const levelCost = L => L <= 1 ? 0 : xpToReach(L) - xpToReach(L - 1);

export function progress(xp) {
  const level = levelFor(xp);
  if (level >= MAX_LEVEL) return { level, into: 0, need: 0, frac: 1 };
  const base = xpToReach(level), next = xpToReach(level + 1);
  return { level, into: xp - base, need: next - base, frac: (xp - base) / (next - base) };
}

export function tierMul(playerLevel, sourceLevel) {
  const gap = playerLevel - sourceLevel;
  return gap <= 4 ? 1 : Math.max(0.05, Math.pow(0.85, gap - 4));
}

export function repMul(streak) {
  return streak < 8 ? 1 : Math.max(0.35, Math.pow(0.93, streak - 8));
}

export const ASH_MUL = 0.85;

export function grantXp({ base, school, playerLevel, sourceLevel, streak = 0, faction, worn = null, ash = false }) {
  const aff = affinityXp(school, faction, worn);
  return Math.max(1, Math.round(
    base * tierMul(playerLevel, sourceLevel) * repMul(streak) * aff * (ash ? ASH_MUL : 1)
  ));
}

export const grasp = schools => SCHOOLS.reduce((n, s) => n + levelFor(schools[s] || 0), 0);
export const levels = schools => Object.fromEntries(SCHOOLS.map(s => [s, levelFor(schools[s] || 0)]));
export const totalXp = schools => SCHOOLS.reduce((n, s) => n + (schools[s] || 0), 0);

// streak counts consecutive uses of one source key; it resets after three uses of a different
// key or 90 s of real time without that key. Session-scoped, never persisted.
export const STREAK_RESET_SECONDS = 90;
export const STREAK_RESET_OTHERS = 3;

export function newStreaks() { return { key: null, count: 0, others: 0, at: 0 }; }

export function bumpStreak(st, key, nowSeconds) {
  if (st.key === key) {
    if (nowSeconds - st.at > STREAK_RESET_SECONDS) st.count = 0;
    st.count++; st.others = 0; st.at = nowSeconds;
  } else {
    if (++st.others >= STREAK_RESET_OTHERS || nowSeconds - st.at > STREAK_RESET_SECONDS) {
      st.key = key; st.count = 1; st.others = 0;
    } else {
      st.key = key; st.count = 1;
    }
    st.at = nowSeconds;
  }
  return st.count - 1;
}
