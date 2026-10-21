import { RANKS } from '../../data/ranks.js';

export { RANKS };

export function titleFor(gender, rank = 0) {
  const r = RANKS[Math.max(0, Math.min(RANKS.length - 1, rank | 0))];
  return gender === 'f' ? r.f : r.m;
}
