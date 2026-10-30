// GAMBIT ↔ br8t account glue (games/CLAUDE.md "Wiring a new game").
// store.js keeps writing localStorage as normal; syncLocalKeys mirrors the
// synced keys to users/{uid}/games/gambit.
//
// Every `gambit.` key is mirrored (settings, ladder, stats, puzzles, and any key
// another module adds — listed in KNOWN_SYNCED or already present at boot), EXCEPT
// local-only keys (see isLocalOnly in store.js).
// `gambit.resume` (an unfinished bot game) is deliberately NOT synced: adopting
// a half-played game on another device would drop the player mid-match with no
// context. The device benchmark (owned by core) is device-specific and also
// stays local. There is no daily yet; if one is added, follow the dailies rule
// (UTC date, `last >= today`).
//
// main.js imports this dynamically and swallows failure, so an unreachable
// account layer just means a local-only save.
import { syncLocalKeys } from '/lib/auth/localsync.js';
import { syncedKeys } from './store.js';

function describe(k) {
  const lad = k['gambit.ladder'] || {};
  const st = k['gambit.stats'] || {};
  const out = [];
  out.push(`${(lad.points || 0).toLocaleString('en-US')} ladder points`);
  out.push(st.games ? `${st.games} bot games (${st.w || 0}W ${st.d || 0}D ${st.l || 0}L)` : 'No bot games yet');
  if (st.bestWin) out.push(`Best win: ${st.bestWin.name} (${st.bestWin.elo})`);
  const pz = k['gambit.puzzles'];
  if (pz && pz.s && Object.keys(pz.s).length) out.push(`${Object.keys(pz.s).length} puzzles solved · rating ${pz.r || 800}`);
  return out;
}

export function initCloud(canPester) {
  const sync = syncLocalKeys({ gameId: 'gambit', keys: syncedKeys(), describe, nudge: 'callout', canPester });
  return {
    // once per completed game, on the results sheet — never mid-match
    matchFinished() { try { sync.matchCompleted(); } catch { /* never block results */ } },
    checkpoint() { try { sync.checkpoint(); } catch { /* ignore */ } },
  };
}
