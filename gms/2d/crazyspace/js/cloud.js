// Crazy Space ↔ br8t account glue.
//
// The game keeps saving to localStorage exactly as it does offline (js/save.js);
// syncLocalKeys mirrors the two durable keys to users/{uid}/games/crazyspace and
// mounts the account avatar.
//
// Nothing here is load-bearing: main.js imports it dynamically and swallows any
// failure, so offline / blocked / file:// simply plays on with a local save and
// the only thing missing is the avatar.

import { syncLocalKeys } from '/lib/auth/localsync.js';

import { CAREER_KEY, SETTINGS_KEY, fmtDuration, kdRatio } from './save.js';
import { MODES, SHIPS } from './config.js';

const GAME_ID = 'crazyspace';

// Durable state only. There is deliberately no match-resume slot in this game
// at all — a half-played arena match is not career progress, and the reload
// that adopting a cloud save triggers would land mid-dogfight.
const KEYS = [CAREER_KEY, SETTINGS_KEY];

/**
 * Two or three lines of plain English for the two-saves chooser, when two
 * devices have genuinely different progress and the player has to pick one.
 * Keep it to what actually hurts to lose.
 *
 * Receives { "<key>": <parsed value> } — parsing here is safe because this is
 * for human eyes and is never used to decide freshness.
 */
export function describe(s) {
  const c = s[CAREER_KEY] || {};
  const t = c.total || {};
  const out = [];

  const matches = t.matches || 0;
  const wins = t.wins || 0;
  out.push(`${matches} match${matches === 1 ? '' : 'es'} · ${wins} won · ${fmtDuration(t.playSec || 0)} flown`);
  out.push(`${t.kills || 0} kills / ${t.deaths || 0} deaths (${kdRatio(t)} K/D) · best streak ${t.bestStreak || 0}`);

  // Third line: whichever mode they actually play, and the ship they fly.
  const modes = c.modes || {};
  let topMode = null;
  for (const k of Object.keys(modes)) {
    if (!modes[k] || !modes[k].matches) continue;
    if (!topMode || modes[k].matches > modes[topMode].matches) topMode = k;
  }
  const ships = c.ships || {};
  let topShip = null;
  for (const k of Object.keys(ships)) {
    if (!ships[k] || !ships[k].games) continue;
    if (!topShip || ships[k].games > ships[topShip].games) topShip = k;
  }
  if (topMode || topShip) {
    const bits = [];
    if (topMode) bits.push(`${(MODES[topMode] && MODES[topMode].name) || topMode} ×${modes[topMode].matches}`);
    if (topShip) bits.push(`flying the ${(SHIPS[topShip] && SHIPS[topShip].name) || topShip}`);
    out.push(bits.join(' · '));
  } else {
    out.push('No matches recorded yet');
  }

  return out;
}

// The layer's veto on the sign-in nudge, checked at the moment of showing.
// `app.scene` is 'menu' between matches; in a match, the pause card and the
// results board are both moments the player is reading rather than flying.
function canPester() {
  const cs = window.__crazyspace;
  if (!cs || !cs.app) return false;
  const app = cs.app;
  return app.scene !== 'game' || app.paused || app.resultsShown;
}

export const cloud = syncLocalKeys({
  gameId: GAME_ID, keys: KEYS, describe,
  nudge: 'callout',
  canPester,
});

/** Called from the results screen — once per finished match, never mid-match. */
export function matchFinished() {
  try { cloud.matchCompleted(); } catch (e) { /* never block the results screen */ }
}
