// save.js — durable local persistence: career stats + settings.
//
// Two localStorage keys, both namespaced and versioned:
//
//   crazyspace.career.v1     lifetime stats, overall / per mode / per ship
//   crazyspace.settings.v1   pilot name, audio, handedness, last selection
//
// Rules this module follows, deliberately:
//
//  * Load-with-defaults, merging unknown keys FORWARD. A save written by an
//    older build is deep-merged onto the current defaults, so adding a field
//    later never wipes an existing save, and a field we no longer read is left
//    alone rather than dropped.
//  * Nothing about a match in progress is ever written. `recordMatch()` is
//    called once, from the results screen, with a finished match's totals.
//    A half-played match is not career progress and must not travel between
//    devices (see /games/CLAUDE.md).
//  * No date-stamped state at all, so the dailies rule does not apply here.
//    If a daily is ever added, store `new Date().toISOString().slice(0,10)`
//    and test `last >= today`, never `===`.
//
// The values are stored as plain JSON. /lib/auth/localsync.js mirrors the raw
// strings to the player's account; it must never re-serialise them, and this
// module must never compare two saves byte-for-byte.

import { MODE_LIST, SHIP_LIST } from './config.js';

export const CAREER_KEY = 'crazyspace.career.v1';
export const SETTINGS_KEY = 'crazyspace.settings.v1';

// ------------------------------------------------------------------ defaults

function modeStats() {
  return {
    matches: 0,
    wins: 0,
    kills: 0,
    deaths: 0,
    bestStreak: 0,
    caps: 0,        // CTF flag captures
    returns: 0,     // CTF flag returns
    holdSec: 0,     // KOTH seconds our team held the hill
    bestScore: 0,
    playSec: 0,
  };
}

function shipStats() {
  return { games: 0, kills: 0 };
}

export function careerDefaults() {
  const modes = {};
  for (const k of MODE_LIST) modes[k] = modeStats();
  const ships = {};
  for (const k of SHIP_LIST) ships[k] = shipStats();
  return {
    v: 1,
    total: modeStats(),
    modes,
    ships,
    firstPlayed: 0,   // ms epoch, set on the first recorded match
    lastPlayed: 0,
  };
}

export function settingsDefaults() {
  return {
    v: 1,
    name: 'You',
    volume: 0.5,       // 0..1 master SFX level
    muted: false,
    handed: 'left',    // 'left' = steering thumb on the left (default)
    lastMode: 'deathmatch',
    lastShip: 'warbird',
    lastDiff: 'veteran',
  };
}

// ------------------------------------------------------------------ plumbing

const isPlain = v => v !== null && typeof v === 'object' && !Array.isArray(v);

// Deep-merge a loaded save onto the defaults. Defaults supply anything the
// stored save is missing (new fields), and stored keys the defaults don't know
// about are carried through untouched (forward compatibility both ways).
function mergeForward(defaults, stored) {
  if (!isPlain(stored)) return defaults;
  const out = Array.isArray(defaults) ? defaults.slice() : { ...defaults };
  for (const k of Object.keys(stored)) {
    const d = out[k], s = stored[k];
    out[k] = isPlain(d) && isPlain(s) ? mergeForward(d, s) : s;
  }
  return out;
}

function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (e) { return false; }
}

const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);

// ------------------------------------------------------------------ public API

let career = null;
let settings = null;

export function loadCareer() {
  if (!career) career = mergeForward(careerDefaults(), readJSON(CAREER_KEY));
  return career;
}

export function loadSettings() {
  if (!settings) {
    settings = mergeForward(settingsDefaults(), readJSON(SETTINGS_KEY));
    // light sanitising — a synced save from a future build shouldn't break input
    settings.volume = Math.max(0, Math.min(1, num(settings.volume, 0.5)));
    settings.muted = !!settings.muted;
    if (settings.handed !== 'right') settings.handed = 'left';
    settings.name = String(settings.name || 'You').slice(0, 14) || 'You';
  }
  return settings;
}

export function saveSettings(patch) {
  const s = loadSettings();
  if (patch) Object.assign(s, patch);
  s.volume = Math.max(0, Math.min(1, num(s.volume, 0.5)));
  s.name = String(s.name || 'You').slice(0, 14) || 'You';
  writeJSON(SETTINGS_KEY, s);
  return s;
}

export function saveCareer() {
  writeJSON(CAREER_KEY, loadCareer());
  return career;
}

/**
 * Fold one FINISHED match into the career. Called exactly once, from the
 * results screen — never mid-match.
 *
 * summary: { mode, ship, kills, deaths, bestStreak, caps, returns,
 *            holdSec, score, playSec, won }
 */
export function recordMatch(summary) {
  const c = loadCareer();
  const mode = MODE_LIST.includes(summary.mode) ? summary.mode : MODE_LIST[0];
  const ship = SHIP_LIST.includes(summary.ship) ? summary.ship : SHIP_LIST[0];

  if (!c.modes[mode]) c.modes[mode] = modeStats();
  if (!c.ships[ship]) c.ships[ship] = shipStats();

  const kills = Math.max(0, Math.round(num(summary.kills)));
  const deaths = Math.max(0, Math.round(num(summary.deaths)));
  const streak = Math.max(0, Math.round(num(summary.bestStreak)));
  const caps = Math.max(0, Math.round(num(summary.caps)));
  const returns = Math.max(0, Math.round(num(summary.returns)));
  const score = Math.max(0, Math.round(num(summary.score)));
  const holdSec = Math.max(0, num(summary.holdSec));
  const playSec = Math.max(0, Math.min(num(summary.playSec), 3 * 3600));
  const won = !!summary.won;

  for (const t of [c.total, c.modes[mode]]) {
    t.matches = num(t.matches) + 1;
    if (won) t.wins = num(t.wins) + 1;
    t.kills = num(t.kills) + kills;
    t.deaths = num(t.deaths) + deaths;
    t.caps = num(t.caps) + caps;
    t.returns = num(t.returns) + returns;
    t.holdSec = Math.round((num(t.holdSec) + holdSec) * 10) / 10;
    t.playSec = Math.round(num(t.playSec) + playSec);
    if (streak > num(t.bestStreak)) t.bestStreak = streak;
    if (score > num(t.bestScore)) t.bestScore = score;
  }

  const sh = c.ships[ship];
  sh.games = num(sh.games) + 1;
  sh.kills = num(sh.kills) + kills;

  const now = Date.now();
  if (!num(c.firstPlayed)) c.firstPlayed = now;
  c.lastPlayed = now;

  saveCareer();
  return c;
}

/** Wipe career progress (settings are kept). Used by the Career screen. */
export function resetCareer() {
  career = careerDefaults();
  saveCareer();
  return career;
}

// ------------------------------------------------------------------ formatting

export function fmtDuration(sec) {
  sec = Math.max(0, Math.round(num(sec)));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${sec % 60}s`;
  return `${sec}s`;
}

export function kdRatio(t) {
  const k = num(t && t.kills), d = num(t && t.deaths);
  return d ? Math.round((k / d) * 100) / 100 : k;
}

/** Best mode by wins, then matches. Returns [key, stats] or null. */
export function favouriteMode(c) {
  let best = null;
  for (const k of MODE_LIST) {
    const m = (c.modes && c.modes[k]) || null;
    if (!m || !num(m.matches)) continue;
    if (!best || num(m.matches) > num(best[1].matches)) best = [k, m];
  }
  return best;
}

/** Most-flown ship. Returns [key, stats] or null. */
export function favouriteShip(c) {
  let best = null;
  for (const k of SHIP_LIST) {
    const s = (c.ships && c.ships[k]) || null;
    if (!s || !num(s.games)) continue;
    if (!best || num(s.games) > num(best[1].games)) best = [k, s];
  }
  return best;
}
