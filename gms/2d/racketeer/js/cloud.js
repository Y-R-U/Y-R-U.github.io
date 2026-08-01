// Racketeer ↔ br8t account glue. The game keeps saving to localStorage exactly
// as before; this mirrors that save to the player's account when they have one.
//
// Nothing here is load-bearing: if the auth layer fails to load (offline, script
// blocked, file:// ) the import throws, main.js swallows it, and the game plays
// on with a purely local save.

import { SAVE_KEY } from "./const.js";
import * as career from "./career.js";
import { mountAccount, matchCompleted, auth, cloud } from "/lib/auth/ui.js";
import { pickSave } from "/lib/auth/cloud.js";

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

// Has anyone actually played this save, or is it the blank one every fresh
// device builds on its way to the menu? An unplayed save is never allowed to win
// a comparison, in either direction — a first visit on the desktop once pushed
// story 1 / 0 wins over a level 19 career on the phone, because the blank save
// was, quite truthfully, the more recent of the two.
function played(s) {
  if (!s) return false;
  return (s.wins || 0) > 0 || (s.losses || 0) > 0 || (s.story || 1) > 1 ||
         (s.money || 0) > 0 || !!s.storyDone || (s.tier || 0) > 0;
}

export function initCloud(app) {
  App = app;

  mountAccount({
    gameId: GAME_ID,
    getLocal: () => App.save,
    applyRemote: adopt,
    describe,
    nudge: "callout",
    // A live match is the one thing we never interrupt. App.match is cleared in
    // onMatchOver before the results screen goes up, so results count as a menu.
    canPester: () => !App || !App.match,
  });

  // Every career.persist() also goes to the cloud (debounced inside cloud.js) —
  // but not one byte leaves this device until the boot reconcile below has
  // decided who wins. The game persists on its way to the menu, and an unheld
  // push races the reconcile's own read: the blank save lands in the account
  // before we have looked at what was in it. Anything saved while we wait goes
  // up once the local save is confirmed the winner, or is dropped because we are
  // adopting and about to reload anyway.
  let reconciled = false, held = false;
  career.setSyncHook(save => { if (reconciled) slot.save(save); else held = true; });

  // On boot: an unplayed save never wins, then whichever was written last does.
  // Never compare the objects themselves: career.load() merges newSave()
  // defaults into whatever it read, so a save that round-tripped through the
  // cloud comes back with different key order and possibly extra keys, and byte
  // equality reports a difference that isn't there.
  auth.ready().then(async () => {
    if (!auth.user || auth.user.anon) { reconciled = true; held = false; return; }
    const remote = await slot.load();
    if (!remote || !remote.data) { reconciled = true; held = false; slot.save(App.save); return; }
    const verdict = pickSave({
      // career.loadedStamp(), NOT App.save.savedAt: persist() has very likely
      // moved the latter to "just now" while we were loading.
      ourStamp: career.loadedStamp(),
      theirStamp: remote.data.savedAt || 0,
      oursPlayed: played(App.save),
      theirsPlayed: played(remote.data),
    });
    reconciled = true;
    if (verdict === "adopt") { held = false; cloud.markSynced(GAME_ID); adopt(remote.data); return; }
    if (verdict === "push" || held) slot.save(App.save);
    else cloud.markSynced(GAME_ID);      // already identical: the account has this
    held = false;
    // "keep" with nothing held means it's the same save. Do nothing at all.
  });
}

// Called from the results screen — counts matches towards the sign-in nudge.
export function matchFinished() {
  try { matchCompleted(GAME_ID); } catch (e) { /* never block the results screen */ }
}
