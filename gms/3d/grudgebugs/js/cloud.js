// GRUDGE BUGS ↔ br8t account glue. The game keeps saving to localStorage
// exactly as before; this mirrors that one profile blob to the player's
// account when they have one.
//
// Nothing here is load-bearing: if the auth layer fails to load (offline,
// blocked, file://) the import throws, main.js swallows it, and the game plays
// on with a purely local save.

import { syncLocalKeys } from "/lib/auth/localsync.js";

const GAME_ID = "grudgebugs";
const SAVE_KEY = "grudgebugs_v1";

// The profile blob is progress only — coins, hats, chapter stars, settings,
// lifetime stats. No battle ever lives in it (Battle state is held in memory
// and thrown away on dispose), so the whole key is safe to move between
// devices as-is.
function describe(parsed) {
  const p = parsed[SAVE_KEY];
  if (!p) return ["Nothing saved yet"];
  const story = p.story || {};
  const ids = Object.keys(story).filter(k => story[k] > 0);
  const stars = ids.reduce((a, k) => a + story[k], 0);
  const st = p.stats || {};
  const out = [];
  out.push(`${ids.length} of 10 chapters cleared · ${stars}★`);
  out.push(`${(p.coins || 0).toLocaleString()} coins`);
  out.push(`${st.wins || 0} wins of ${st.battles || 0} battles · ${st.kills || 0} kills`);
  const hats = (p.hatsOwned || []).length;
  if (hats > 1) out.push(`${hats - 1} hat${hats === 2 ? "" : "s"} owned`);
  const streak = p.daily && p.daily.streak;
  if (streak) out.push(`Daily streak: day ${streak}`);
  return out;
}

// The layer's veto on the sign-in nudge, checked at the moment of showing. The
// HUD is up for the whole battle and comes down before the results modal, so
// that plus "not mid-cutscene" leaves only the menu and the results.
function canPester() {
  const hud = document.getElementById("hud");
  if (hud && !hud.classList.contains("hidden")) return false;
  return (window.__game && window.__game.mode) !== "cutscene";
}

const sync = syncLocalKeys({
  gameId: GAME_ID, keys: [SAVE_KEY], describe,
  nudge: "callout",
  canPester,
});

// Called from the results screen — counts battles towards the sign-in nudge.
export function battleFinished() {
  try { sync.matchCompleted(); } catch (e) { /* never block the results screen */ }
}
