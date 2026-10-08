import { syncLocalKeys } from '/lib/auth/localsync.js';
import { SYNCED, getStats } from './store.js?v=202610081215';

let canPesterFn = () => false;
export const setCanPester = fn => { canPesterFn = fn; };

function describe(s) {
  const st = s['clued.stats'] || {};
  const out = [`${st.games || 0} games played`];
  if (st.answered) out.push(`${st.correct || 0}/${st.answered} answers right`);
  if (st.bestStreak) out.push(`Best streak ${st.bestStreak}`);
  return out;
}

export const cloud = syncLocalKeys({
  gameId: 'clued', keys: SYNCED, describe,
  nudge: 'callout',
  canPester: () => canPesterFn(),
});

export function matchCompleted() {
  try { cloud.matchCompleted(); } catch (e) { /* never block results */ }
}
export const statsNow = getStats;
