// Hexpire ↔ br8t account glue. save.js keeps writing localStorage exactly as
// before; syncLocalKeys mirrors those keys to the player's account.
//
// `hexpire.resume` is deliberately NOT synced: it is a half-played match, and
// adopting one on another device (which reloads the page) would drop the player
// into a board they have no context for — possibly mid-turn.
//
// Nothing here is load-bearing — main.js imports it dynamically and swallows
// any failure, so an unreachable account layer just means a local-only save.
import { syncLocalKeys } from "/lib/auth/localsync.js";

const GAME_ID = "hexpire";
const STORY_CHAPTERS = 8;

function describe(k) {
  const progress = k["hexpire.progress"] || {};
  const settings = k["hexpire.settings"] || {};
  const customs = k["hexpire.customs"] || [];
  const done = (progress.completed || []).length;

  const out = [];
  out.push(settings.empireName ? `Empire: ${settings.empireName}` : "No empire named yet");
  out.push(done >= STORY_CHAPTERS ? "Story complete" : `${done} of ${STORY_CHAPTERS} story chapters won`);
  if (customs.length) out.push(`${customs.length} custom map${customs.length === 1 ? "" : "s"}`);
  else out.push("No custom maps");
  return out;
}

// The layer's veto on the sign-in nudge, checked at the moment of showing. The
// HUD is up for exactly as long as a board is in play — including the result
// modal, which is fine to wait through, because the count is already banked and
// the pill goes up the moment they are back at the menu.
function canPester() {
  const hud = document.getElementById("hud");
  return !hud || hud.classList.contains("hidden");
}

const sync = syncLocalKeys({
  gameId: GAME_ID,
  keys: ["hexpire.settings", "hexpire.progress", "hexpire.customs"],
  describe,
  nudge: "callout",
  canPester,
});

// Counts finished matches towards the sign-in nudge. Never call mid-match.
export function matchFinished() {
  try { sync.matchCompleted(); } catch (e) { /* never block the result modal */ }
}
