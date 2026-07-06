// LASTWALL — level descriptors: seed + flags per (mode, n).
// Story levels are fixed-seed (same maze every run); endless levels vary per run.
import { CFG } from './config.js';
import { BEATS } from './story.js';

export function levelDef(mode, n, runSalt = 0) {
  const story = mode === 'story';
  const seed = story ? 0xA11CE + n * 7919 : ((0xE17D + n * 104729 + runSalt) >>> 0);
  return {
    mode, n, seed,
    boss: n % 10 === 0,
    beat: story ? BEATS[n] : null,
    name: story ? `SECTION ${n}` : `DEPTH ${n}`,
  };
}

export const isDraftLevel = n => CFG.draftLevels(n);

// entering level n grants all unclaimed drafts for draft-levels ≤ n
// (start at gate 30 → 5,10,15,20,30 = five picks, per the design contract)
export function draftsOwed(n, claimed) {
  const owed = [];
  for (let k = 5; k <= n; k += k < 20 ? 5 : 10) {
    if (isDraftLevel(k) && !claimed.has(k)) owed.push(k);
  }
  return owed;
}
