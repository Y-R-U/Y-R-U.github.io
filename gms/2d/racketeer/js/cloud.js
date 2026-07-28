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
//
// The reload makes this the most dangerous function in the game: adopt on every
// boot and you have an infinite refresh loop. Two things prevent that — we only
// adopt a save that is strictly NEWER than the local one, and this session-
// scoped guard means we can never reload twice for the same cloud save even if
// that comparison is somehow wrong again.
const ADOPTED = "racketeer_adopted_at";

function adopt(data) {
  if (!data) return;
  const stamp = String(data.savedAt || 0);
  try {
    if (sessionStorage.getItem(ADOPTED) === stamp) {
      console.warn("[racketeer] already adopted this cloud save — not reloading again");
      return;
    }
    sessionStorage.setItem(ADOPTED, stamp);
  } catch (e) { /* private mode: fall through, the newer-than check still holds */ }
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

  // On boot, whichever save was written last wins. Never compare the objects
  // themselves: career.load() merges newSave() defaults into whatever it read,
  // so a save that round-tripped through the cloud comes back with different
  // key order and possibly extra keys, and byte equality reports a difference
  // that isn't there.
  auth.ready().then(async () => {
    if (!auth.user || auth.user.anon) return;
    const remote = await slot.load();
    if (!remote || !remote.data) { slot.save(App.save); return; }
    const theirs = remote.data.savedAt || 0;
    const ours = App.save.savedAt || 0;
    if (theirs > ours) adopt(remote.data);
    else if (ours > theirs) slot.save(App.save);
    // Equal stamps mean it's the same save. Do nothing at all.
  });
}

// Called from the results screen — counts matches and shows the one-time
// "sign in to keep this" prompt on the third.
export function matchFinished() {
  try { matchCompleted(GAME_ID); } catch (e) { /* never block the results screen */ }
}
