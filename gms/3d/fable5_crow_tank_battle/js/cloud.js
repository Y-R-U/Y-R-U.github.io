// MURDER ROYALE ↔ br8t account glue. The game keeps saving to localStorage
// exactly as before (see js/career.js); syncLocalKeys mirrors those two keys to
// the player's account so a career follows them between devices.
//
// Nothing here is load-bearing: main.js imports this dynamically and swallows
// any failure, so offline / blocked / file:// just plays on with a local save
// and the only thing missing is the account avatar.

import { syncLocalKeys } from "/lib/auth/localsync.js";
import { CAREER_KEY, SETTINGS_KEY, MODES, nemesis } from "./career.js";
import { state } from "./state.js";

const GAME_ID = "murderroyale";

// Career progress and preferences only. There is deliberately no in-progress
// match slot in this game — a live battle lives in memory in state.js and is
// discarded when the next one starts — so there is nothing here that could
// hand another device half a match.
const KEYS = [CAREER_KEY, SETTINGS_KEY];

function fmtTime(s) {
  const total = Math.max(0, Math.floor(s || 0));
  const m = Math.floor(total / 60);
  return `${m}:${String(total % 60).padStart(2, "0")}`;
}

// Shown when two devices have genuinely different progress and the player has
// to pick one. Keep it to what actually hurts to lose.
export function describe(parsed) {
  const c = parsed[CAREER_KEY];
  const s = parsed[SETTINGS_KEY] || {};
  if (!c || !c.totals || !c.totals.played) {
    return [s.name ? `Callsign ${s.name}` : "Nothing saved yet", "No matches fought"];
  }
  const t = c.totals;
  const out = [];
  out.push(`${s.name || "—"} · ${t.played} match${t.played === 1 ? "" : "es"}, ${t.wins} won`);
  out.push(`${t.kills} kills · best streak ${t.bestStreak} · ${fmtTime(t.playTime)} in the field`);

  const best = MODES
    .map(m => [m, (c.modes || {})[m.id] || {}])
    .filter(([, st]) => st.played)
    .sort((a, b) => (b[1].bestScore || 0) - (a[1].bestScore || 0))[0];
  if (best) out.push(`Best ${best[0].label}: ${best[1].bestScore || 0} pts, #${best[1].bestPlace || "—"}`);

  const n = nemesis(c);
  if (n) out.push(`Nemesis: the ${n.name} (${n.n} kill${n.n === 1 ? "" : "s"} on you)`);
  return out;
}

// The layer's veto on the sign-in nudge, checked at the moment of showing.
// 'title' is the menu and 'over' is the results board; the rest is the match,
// spectating included — the player is still watching their own killer.
function canPester() {
  return state.phase === "title" || state.phase === "over";
}

export const cloud = syncLocalKeys({
  gameId: GAME_ID, keys: KEYS, describe,
  nudge: "callout",
  canPester,
});

/**
 * Called once from the results screen — never mid-match. Counts matches towards
 * the sign-in nudge.
 */
export function matchFinished() {
  try { cloud.matchCompleted(); } catch (e) { /* never block the results screen */ }
}

export { GAME_ID, KEYS };
