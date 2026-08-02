// FOUL PLAY ↔ br8t account glue. save.js keeps writing its one profile blob to
// localStorage exactly as before; syncLocalKeys mirrors that key to the
// player's account when they have one.
//
// The blob is progress only — money, cars, garage, story/event/title standing,
// the ladder, memories, settings. A race lives entirely in `state` (state.js)
// and is thrown away by resetRaceState, so there is no in-progress-match resume
// slot to keep out of the account.
//
// Nothing here is load-bearing: main.js imports it dynamically and swallows any
// failure, so an unreachable account layer just means a local-only save.

import { syncLocalKeys } from "/lib/auth/localsync.js";
import { SAVE_KEY } from "./config.js";
import { storyLength } from "./story.js";
import { state } from "./state.js";
import { on } from "./bus.js";

const GAME_ID = "foulplay";

const plural = (n, one, many) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

// Shown only when two devices have genuinely different progress. Exported so a
// headless run can check the lines without a real account.
export function describe(parsed) {
  const p = parsed[SAVE_KEY];
  if (!p) return ["Nothing saved yet"];
  const st = p.stats || {};
  const story = p.story || {};
  const garage = p.garage || {};
  const cleared = Object.keys(story.cleared || {}).length;
  const cars = (p.cars || []).length;
  const kit = (garage.parts || []).length + (garage.skills || []).length;

  const out = [];
  out.push(`${p.name || "Unnamed driver"} · rank #${(p.rank || 0).toLocaleString()}`);
  out.push(`$${(p.money || 0).toLocaleString()} · ${plural(cars, "car", "cars")} · ${kit} parts and tricks`);
  out.push(`Season level ${story.level || 1} of ${storyLength()} · ${cleared} cleared`);
  out.push(`${plural(st.races || 0, "race", "races")} · ${st.wins || 0} won · ${st.podiums || 0} on the podium`);
  const crates = (p.chests || []).length;
  if (crates) out.push(plural(crates, "unopened crate", "unopened crates"));
  return out;
}

// The layer's veto on the sign-in nudge, checked at the moment it wants to show
// one. Anything the player is actually watching or driving says no; the menus
// say yes. Attract mode is a race running BEHIND a menu screen, so it does not
// count — state.screen is the menu you are looking at.
const BUSY = new Set(["race", "replay", "cine", "results"]);
function canPester() {
  return !BUSY.has(state.screen);
}

const sync = syncLocalKeys({
  gameId: GAME_ID,
  keys: [SAVE_KEY],
  describe,
  nudge: "callout",
  canPester,
});

// Counts finished races towards the nudge. Listening on the bus rather than
// having flow.js call in keeps this module optional — nothing in the game knows
// it exists. The count is only banked here; canPester decides when the pill can
// actually appear, which is once the results card is behind you.
on("race:done", (results) => {
  if (results && results.event && results.event.attract) return;
  try { sync.matchCompleted(); } catch (e) { /* never disturb the results screen */ }
});
