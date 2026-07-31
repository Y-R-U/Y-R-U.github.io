// br8t games — mirror a game's localStorage to the player's account.
//
// Most games here already persist to localStorage under a handful of keys. This
// wraps that up without touching the game's own save code: name the keys, and
// they are kept in sync with users/{uid}/games/{gameId}.
//
//   import { syncLocalKeys } from "/lib/auth/localsync.js";
//   syncLocalKeys({
//     gameId: "sundayleague",
//     keys:   ["sundayleague.career.v1", "sundayleague.settings.v1"],
//     describe: s => ["Season 3", "12 wins"],   // optional, for the two-saves chooser
//     nudge: "callout",                         // optional, non-blocking sign-in pester
//     canPester: () => !playing,                // required if nudge is set
//   });
//
// `canPester` is the whole job: the layer watches for a moment when it returns
// true and puts the pill up then, if one is due. Make it false whenever a match
// is in progress. The returned `checkpoint()` is optional — call it as a menu
// appears to skip the wait.
//
// IMPORTANT: list only keys that are safe to move between devices — career
// progress, unlocks, settings, competitions. Never list an in-progress-match
// resume slot: restoring one on a different device hands the player a half
// played game with no context, and the reload it triggers would land mid-match.
//
// Values are mirrored as the RAW STRINGS localStorage holds. Do not be tempted
// to parse and re-serialise them: a save that round-trips through JSON.parse
// comes back with different key order, and any equality check then reports a
// difference that isn't there. That mistake cost Racketeer an infinite reload
// loop. Freshness is decided by an explicit timestamp, never by comparison.

import { mountAccount, matchCompleted, offerSignIn } from "./ui.js";
import { auth } from "./auth.js";
import { cloud } from "./cloud.js";

const STAMP = id => `br8t_savedAt_${id}`;
const ADOPTED = id => `br8t_adopted_${id}`;
const PUSH_DEBOUNCE = 2000;

function ls(fn, fallback = null) { try { return fn(); } catch (e) { return fallback; } }

export function syncLocalKeys(options) {
  const { gameId, keys, describe, onAdopt, nudge, canPester } = options;
  if (!gameId || !keys || !keys.length) throw new Error("syncLocalKeys needs a gameId and keys");

  const slot = cloud.game(gameId);
  const watched = new Set(keys);

  const stamp = () => Number(ls(() => localStorage.getItem(STAMP(gameId))) || 0);
  const setStamp = t => ls(() => localStorage.setItem(STAMP(gameId), String(t)));

  // A snapshot is the raw string for every watched key that currently exists.
  function snapshot() {
    const out = {};
    for (const k of watched) {
      const v = ls(() => localStorage.getItem(k));
      if (v !== null && v !== undefined) out[k] = v;
    }
    return { savedAt: stamp(), keys: out };
  }

  function restore(payload) {
    if (!payload || !payload.keys) return;
    for (const k of watched) {
      if (k in payload.keys) ls(() => localStorage.setItem(k, payload.keys[k]));
      else ls(() => localStorage.removeItem(k));   // absent upstream means deleted
    }
    setStamp(payload.savedAt || Date.now());
  }

  // Writing the cloud copy and restarting is the only safe way to hand a running
  // game a different save — modules cache their state at import time. The
  // once-guard means a mistake upstream degrades to a stale save rather than a
  // game that reloads forever.
  function adopt(payload) {
    if (!payload) return;
    const key = String(payload.savedAt || 0);
    if (ls(() => sessionStorage.getItem(ADOPTED(gameId))) === key) {
      console.warn(`[${gameId}] cloud save already adopted this session — not reloading again`);
      return;
    }
    ls(() => sessionStorage.setItem(ADOPTED(gameId), key));
    restore(payload);
    if (onAdopt) { try { onAdopt(payload); return; } catch (e) { /* fall through to reload */ } }
    location.reload();
  }

  let timer = null;
  function schedulePush() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; slot.save(snapshot()); }, PUSH_DEBOUNCE);
  }

  // Catch the game's own saves without editing a line of its save code. Only
  // watched keys trigger anything; every other write passes straight through.
  const origSet = localStorage.setItem.bind(localStorage);
  const origRemove = localStorage.removeItem.bind(localStorage);
  localStorage.setItem = function (k, v) {
    origSet(k, v);
    if (watched.has(k)) { setStamp(Date.now()); schedulePush(); }
  };
  localStorage.removeItem = function (k) {
    origRemove(k);
    if (watched.has(k)) { setStamp(Date.now()); schedulePush(); }
  };

  // `describe` is for human eyes, not for comparison, so parsing here is safe —
  // it receives { "<key>": <parsed value> } and returns lines of plain English.
  function readKeys(payload) {
    const out = {};
    for (const [k, v] of Object.entries((payload && payload.keys) || {})) out[k] = ls(() => JSON.parse(v), v);
    return out;
  }

  mountAccount({
    gameId,
    getLocal: () => snapshot(),
    applyRemote: adopt,
    describe: describe ? (payload => describe(readKeys(payload))) : undefined,
    nudge,
    canPester,
  });

  // Boot reconcile: newest wins, ties do nothing at all.
  auth.ready().then(async () => {
    if (!auth.user || auth.user.anon) return;
    const remote = await slot.load();
    if (!remote || !remote.data) { slot.save(snapshot()); return; }
    const theirs = remote.data.savedAt || 0;
    const ours = stamp();
    if (theirs > ours) adopt(remote.data);
    else if (ours > theirs) slot.save(snapshot());
  });

  return {
    snapshot,
    push: () => slot.flush(),
    matchCompleted: () => matchCompleted(gameId),
    checkpoint: () => offerSignIn(),      // "a nudge would be safe here, if one is due"
  };
}

export { matchCompleted, offerSignIn, auth, cloud };
