// Racketeer ↔ br8t account glue. The game keeps saving to localStorage exactly
// as before; this mirrors that save to the player's account when they have one.
//
// Nothing here is load-bearing: if the auth layer fails to load (offline, script
// blocked, file:// ) the import throws, main.js swallows it, and the game plays
// on with a purely local save.

import { SAVE_KEY } from "./const.js";
import * as career from "./career.js";
import { mountAccount, matchCompleted, auth, cloud } from "/lib/auth/ui.js";

const GAME_ID = "racketeer";
const slot = cloud.game(GAME_ID);

let App = null;

// A cloud save arriving mid-session can't be patched into the live App object
// safely (screens hold references), so we write it down and restart clean.
function adopt(data) {
  if (!data) return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { /* private mode */ }
  location.reload();
}

// What the player sees when asked to choose between two saves. Keep it to the
// things that actually hurt to lose.
function describe(save) {
  if (!save) return ["Nothing saved yet"];
  const out = [];
  out.push(save.storyDone ? "Story complete" : `Story level ${save.story || 1} of 100`);
  out.push(`${save.wins || 0} wins · ${save.losses || 0} losses`);
  if (save.rank) out.push(`World rank #${save.rank.toLocaleString()}`);
  const t = save.trophies || {};
  const cups = (t.local || 0) + (t.national || 0) + (t.world || 0);
  if (cups) out.push(`${cups} cup${cups === 1 ? "" : "s"} won`);
  out.push(`$${(save.money || 0).toLocaleString()}`);
  return out;
}

export function initCloud(app) {
  App = app;

  mountAccount({
    gameId: GAME_ID,
    getLocal: () => App.save,
    applyRemote: adopt,
    describe,
  });

  // Every career.persist() also goes to the cloud (debounced inside cloud.js).
  career.setSyncHook(save => slot.save(save));

  // On boot, a signed-in player's account wins over whatever is on this device —
  // they explicitly signed in to get their progress back. The two-saves chooser
  // only appears at link time, where the ambiguity is real.
  auth.ready().then(async () => {
    if (!auth.user || auth.user.anon) return;
    const remote = await slot.load();
    if (!remote || !remote.data) { slot.save(App.save); return; }
    if (JSON.stringify(remote.data) !== JSON.stringify(App.save)) adopt(remote.data);
  });
}

// Called from the results screen — counts matches and shows the one-time
// "sign in to keep this" prompt on the third.
export function matchFinished() {
  try { matchCompleted(GAME_ID); } catch (e) { /* never block the results screen */ }
}
