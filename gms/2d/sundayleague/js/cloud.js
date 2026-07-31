// Sunday League ↔ br8t account glue. The game carries on saving to localStorage
// exactly as before; syncLocalKeys mirrors those keys to the player's account.
//
// Nothing here is load-bearing: if the auth layer can't load (offline, blocked,
// file://) the import throws and main.js swallows it, leaving a local-only save.
//
// Career, settings and an in-progress World Cup bracket are synced. An
// in-progress MATCH is deliberately not: it never touches localStorage at all
// (app.match and app.demo live in memory and die with the tab), so a career
// picked up on another device always resumes between fixtures, never mid-kickoff.

import { SAVE_KEY, SETTINGS_KEY, WORLDCUP_KEY } from './const.js';
import { table, userTeam, userDiv, DIV_NAMES, CC_STAGES } from './league.js';
import { syncLocalKeys } from '/lib/auth/localsync.js';

const GAME_ID = 'sundayleague';

const ORDINAL = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];

// What the player sees when asked to choose between two saves: the things that
// actually hurt to lose — how far the career got, and any live competition.
function describe(keys) {
  const c = keys[SAVE_KEY];
  if (!c || !c.teams) return ['No career saved yet'];
  const out = [];
  try {
    const div = userDiv(c);
    out.push(`Season ${c.season} — ${DIV_NAMES[div]}`);

    const rows = table(c, div);
    const pos = rows.findIndex(r => r.ti === c.userIdx) + 1;
    const row = rows[pos - 1] || {};
    out.push(`${ORDINAL[pos] || pos} of 8 · ${row.p || 0} played, ${row.pts || 0} pts`);
    out.push(`${row.gf || 0} goals scored · ${c.wins || 0} wins from ${c.played || 0}`);

    if (c.cc) out.push(`Champions Cup: ${CC_STAGES[c.cc.stage] || 'in progress'}`);
    const n = (c.trophies || []).length;
    if (n) out.push(`${n} troph${n === 1 ? 'y' : 'ies'} — ${userTeam(c).name}`);
  } catch (e) {
    out.push('Career in progress');
  }
  return out.slice(0, 5);
}

// WORLDCUP_KEY carries an in-progress World Cup bracket — a competition spanning
// several matches, so it travels. A live match never does; none is ever stored.
// The layer's veto on the sign-in nudge, checked at the moment of showing. The
// menu's attract-mode demo (app.demo) is not a match and is fine to nudge over;
// a real one is not, until full time sets `finished`.
function canPester() {
  const app = window.__game;
  return !app || !app.match || !!app.match.finished;
}

const sync = syncLocalKeys({
  gameId: GAME_ID,
  keys: [SAVE_KEY, SETTINGS_KEY, WORLDCUP_KEY],
  describe,
  nudge: 'callout',
  canPester,
});

// Called from the full-time screen — counts matches towards the sign-in nudge.
export function matchFinished() {
  try { sync.matchCompleted(); } catch (e) { /* never block the results screen */ }
}
