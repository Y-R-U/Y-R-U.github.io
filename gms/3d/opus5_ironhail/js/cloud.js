// IRONHAIL ↔ br8t account glue. The game keeps writing its one localStorage
// blob exactly as before; this mirrors that blob to the player's account.
//
// Nothing here is load-bearing: if the auth layer fails to load (offline,
// blocked, file://) the dynamic import in main.js swallows it and the game
// plays on with a purely local save.
//
// Both keys are safe to carry between devices — the profile holds progression,
// unlocks, stats and settings only. A battle in progress lives entirely in
// state.js and is never serialised, so there is no resume slot to strip.

import { SAVE_KEY, NAME_KEY } from './config.js';
import { MISSIONS } from './missions.js';
import { rankFromBP } from './arsenal.js';
import { syncLocalKeys } from '/lib/auth/localsync.js';

const GAME_ID = 'ironhail';

// Shown when the player has to choose between two saves, so it lists the things
// that actually hurt to lose.
function describe(keys) {
  const p = keys[SAVE_KEY];
  if (!p || typeof p !== 'object') return ['Nothing saved yet'];
  const out = [];
  const campaign = p.campaign || {};
  const done = Object.values(campaign).filter((m) => m && m.done).length;
  const stars = Object.values(campaign).reduce((a, m) => a + ((m && m.stars) || 0), 0);
  const stats = p.stats || {};

  out.push(`${p.name || 'Commander'} — act ${p.act || 1}`);
  out.push(`${done} of ${MISSIONS.length} missions · ${stars}★`);
  out.push('World rank #' + rankFromBP(p.bp || 0).toLocaleString());
  out.push(`${stats.kills || 0} kills · ${stats.battles || 0} battles`);
  out.push('⬢ ' + (p.scrap || 0).toLocaleString() + ' scrap');
  return out;
}

const sync = syncLocalKeys({ gameId: GAME_ID, keys: [SAVE_KEY, NAME_KEY], describe });

// Called from the results panel — counts finished missions and shows the
// one-time "sign in to keep this" prompt on the third.
export function missionFinished() {
  try { sync.matchCompleted(); } catch (e) { /* never block the results screen */ }
}
