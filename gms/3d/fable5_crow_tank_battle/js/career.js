// Career + settings persistence.
//
// Two namespaced localStorage keys, and nothing else:
//
//   f5mr.career.v1    lifetime stats — per mode and overall, nemesis/prey
//                     tallies, callsigns used and felled
//   f5mr.settings.v1  callsign, mute, last mode picked
//
// Both are safe to move between devices, which is why `js/cloud.js` mirrors
// exactly these two. **In-progress match state is never written here.** The
// live match lives in `state.js` and in the `live` tracker below, in memory
// only, and is thrown away when the next match starts. Adopting a cloud save
// reloads the page, so a persisted match would hand a player a half-fought
// battle on another device with no context.
//
// Loading is always load-with-defaults + merge-unknown-keys-forward, so a save
// written by an older build gains new fields, and a save written by a *newer*
// build keeps the fields this build doesn't know about instead of losing them.

import { NAME_KEY, MUTE_KEY, MODE_KEY, DEFAULT_TANK_COUNT, NAME_POOL } from './config.js';

export const CAREER_KEY = 'f5mr.career.v1';
export const SETTINGS_KEY = 'f5mr.settings.v1';

// Tank count -> mode identity. The four title-screen pills.
export const MODES = [
  { id: 'duel', label: 'DUEL', count: 2 },
  { id: 'skirmish', label: 'SKIRMISH', count: 5 },
  { id: 'royale', label: 'ROYALE', count: 10 },
  { id: 'frenzy', label: 'FRENZY', count: 16 },
];

/** Nearest mode bucket, so an odd tank count still lands somewhere sane. */
export function modeFor(count) {
  const n = Number(count) || DEFAULT_TANK_COUNT;
  let best = MODES[2];
  let bestD = Infinity;
  for (const m of MODES) {
    const d = Math.abs(m.count - n);
    if (d < bestD) { bestD = d; best = m; }
  }
  return best;
}

// A kill counts toward the current streak if it lands within this many seconds
// of the previous one.
const STREAK_WINDOW = 10;

// ---------------------------------------------------------------------------
// Defaults + merge
// ---------------------------------------------------------------------------

function defaultModeStats() {
  return {
    played: 0,
    wins: 0,
    bestPlace: 0,        // 0 = never placed; 1 is the best possible
    kills: 0,
    deaths: 0,
    bestKills: 0,        // most kills in a single match of this mode
    bestTime: 0,         // longest survival, seconds
    bestScore: 0,
  };
}

function defaultCareer() {
  const modes = {};
  for (const m of MODES) modes[m.id] = defaultModeStats();
  return {
    v: 1,
    modes,
    totals: {
      played: 0,
      wins: 0,
      kills: 0,
      deaths: 0,
      bestStreak: 0,     // most kills in one streak, ever
      bestScore: 0,
      playTime: 0,       // seconds actually fought, summed
    },
    killedBy: {},        // personality label (or 'the murder') -> times it killed you
    killed: {},          // personality label -> times you killed it
    callsigns: {
      used: [],          // callsigns you have deployed under
      felled: [],        // enemy callsigns you have personally destroyed
    },
    firstPlayed: null,   // ms epoch
    lastPlayed: null,
  };
}

function defaultSettings() {
  return { v: 1, name: '', muted: false, mode: DEFAULT_TANK_COUNT };
}

// Saved values win; missing keys are filled from defaults; keys the defaults
// don't mention are carried through untouched. Never used for comparison —
// see the warning in /lib/auth/localsync.js about JSON round-trips.
function mergeForward(saved, defs) {
  if (Array.isArray(defs)) return Array.isArray(saved) ? saved.slice() : defs.slice();
  if (defs && typeof defs === 'object') {
    const out = (saved && typeof saved === 'object' && !Array.isArray(saved))
      ? { ...saved } : {};
    for (const k of Object.keys(defs)) out[k] = mergeForward(out[k], defs[k]);
    return out;
  }
  return saved === undefined || saved === null ? defs : saved;
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// A corrupt or hand-edited save must not be able to poison the sim with NaN.
function sanitise(c) {
  for (const k of Object.keys(c.totals)) c.totals[k] = num(c.totals[k]);
  for (const m of MODES) {
    const s = c.modes[m.id];
    for (const k of Object.keys(defaultModeStats())) s[k] = num(s[k]);
  }
  for (const bag of [c.killedBy, c.killed]) {
    for (const k of Object.keys(bag)) {
      const n = num(bag[k]);
      if (n > 0) bag[k] = n; else delete bag[k];
    }
  }
  c.callsigns.used = (c.callsigns.used || []).filter((x) => typeof x === 'string');
  c.callsigns.felled = (c.callsigns.felled || []).filter((x) => typeof x === 'string');
  return c;
}

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ }
}

// ---------------------------------------------------------------------------
// Legacy migration — f5mr_name / f5mr_mute / f5mr_mode, read exactly once
// ---------------------------------------------------------------------------

function migrateLegacy(defs) {
  const s = { ...defs };
  try {
    const name = localStorage.getItem(NAME_KEY);
    if (name) s.name = name;
    const mute = localStorage.getItem(MUTE_KEY);
    if (mute !== null) s.muted = mute === '1';
    const mode = parseInt(localStorage.getItem(MODE_KEY), 10);
    if (Number.isFinite(mode)) s.mode = mode;
  } catch (e) { /* nothing to migrate */ }
  return s;
}

// ---------------------------------------------------------------------------
// Load / save
// ---------------------------------------------------------------------------

let career = null;
let settings = null;

export function loadCareer() {
  if (!career) career = sanitise(mergeForward(read(CAREER_KEY), defaultCareer()));
  return career;
}

export function loadSettings() {
  if (!settings) {
    const saved = read(SETTINGS_KEY);
    // No namespaced settings yet: fold the old f5mr_* keys forward so an
    // existing player keeps their callsign and mute preference. The legacy
    // keys are left alone — they're tiny, and nothing writes them any more.
    const fresh = !saved;
    settings = saved
      ? mergeForward(saved, defaultSettings())
      : migrateLegacy(defaultSettings());
    settings.muted = !!settings.muted;
    settings.mode = num(settings.mode) || DEFAULT_TANK_COUNT;
    settings.name = typeof settings.name === 'string' ? settings.name : '';
    // Persist the migrated blob, so there is something for the account layer
    // to mirror even if the player never opens a menu.
    //
    // Ordering matters and is deliberate: main.js calls this during module
    // evaluation, *before* its dynamic import of cloud.js resolves, so this
    // one write happens before localsync.js patches localStorage.setItem. It
    // therefore does not bump the sync stamp, and a device opening the game
    // for the first time cannot push a blank save over a real one.
    if (fresh) write(SETTINGS_KEY, settings);
  }
  return settings;
}

export function saveSettings(patch) {
  const s = loadSettings();
  Object.assign(s, patch || {});
  write(SETTINGS_KEY, s);
  return s;
}

export function saveCareer() {
  write(CAREER_KEY, loadCareer());
}

/** Test/debug hook — wipes career but keeps settings. */
export function resetCareer() {
  career = defaultCareer();
  write(CAREER_KEY, career);
  return career;
}

// ---------------------------------------------------------------------------
// Live match tracking (memory only — never persisted)
// ---------------------------------------------------------------------------

let live = null;

export function beginMatch(tankCount) {
  live = {
    mode: modeFor(tankCount),
    tankCount,
    streak: 0,
    bestStreak: 0,
    lastKillT: -999,
    felled: [],          // enemy callsigns destroyed this match
    killedLabels: [],    // personalities destroyed this match
    recorded: false,
  };
  return live;
}

/** The player destroyed someone. `t` is the match clock in seconds. */
export function noteKill(victimName, personalityLabel, t) {
  if (!live) return;
  const now = num(t);
  live.streak = (now - live.lastKillT <= STREAK_WINDOW) ? live.streak + 1 : 1;
  live.lastKillT = now;
  if (live.streak > live.bestStreak) live.bestStreak = live.streak;
  if (victimName && !live.felled.includes(victimName)) live.felled.push(victimName);
  if (personalityLabel) live.killedLabels.push(personalityLabel);
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

// Kills dominate, placement matters, survival is a tiebreaker, winning is a
// bonus. Deliberately simple and readable on the results screen.
export function matchScore({ kills, place, total, timeAlive, won }) {
  const beaten = Math.max(0, num(total) - num(place));
  return Math.round(
    num(kills) * 100 +
    beaten * 25 +
    num(timeAlive) * 2 +
    (won ? 500 : 0));
}

// ---------------------------------------------------------------------------
// Recording a completed match — called ONCE, from the results screen
// ---------------------------------------------------------------------------

/**
 * @param {object} r  { tankCount, place, kills, timeAlive, won, killerLabel }
 * @returns summary for the results screen, including which records fell.
 */
export function recordMatch(r) {
  const c = loadCareer();
  const mode = modeFor(r.tankCount);
  const m = c.modes[mode.id] || (c.modes[mode.id] = defaultModeStats());

  const kills = Math.max(0, Math.round(num(r.kills)));
  const place = Math.max(1, Math.round(num(r.place)) || 1);
  const total = Math.max(1, Math.round(num(r.tankCount)) || 1);
  const timeAlive = Math.max(0, num(r.timeAlive));
  const won = !!r.won;
  const score = matchScore({ kills, place, total, timeAlive, won });
  const streak = live ? live.bestStreak : 0;

  const firstInMode = m.played === 0;
  const firstWinInMode = won && m.wins === 0;
  const bestScore = score > m.bestScore;
  const bestTime = timeAlive > m.bestTime;
  const bestKills = kills > m.bestKills;
  const bestPlace = m.bestPlace === 0 || place < m.bestPlace;
  const bestStreakEver = streak > c.totals.bestStreak;

  m.played += 1;
  m.kills += kills;
  if (won) m.wins += 1; else m.deaths += 1;
  if (bestKills) m.bestKills = kills;
  if (bestTime) m.bestTime = timeAlive;
  if (bestScore) m.bestScore = score;
  if (bestPlace) m.bestPlace = place;

  const t = c.totals;
  t.played += 1;
  t.kills += kills;
  if (won) t.wins += 1; else t.deaths += 1;
  t.playTime += timeAlive;
  if (score > t.bestScore) t.bestScore = score;
  if (bestStreakEver) t.bestStreak = streak;

  // Nemesis / prey — keyed by AI personality, because callsigns are reshuffled
  // every match but "the sniper always gets me" is a real feeling.
  if (!won) {
    const by = r.killerLabel || 'the murder';
    c.killedBy[by] = num(c.killedBy[by]) + 1;
  }
  if (live) {
    for (const label of live.killedLabels) c.killed[label] = num(c.killed[label]) + 1;
    for (const name of live.felled) {
      if (!c.callsigns.felled.includes(name)) c.callsigns.felled.push(name);
    }
  }
  if (r.name && !c.callsigns.used.includes(r.name)) c.callsigns.used.push(r.name);

  const now = Date.now();
  if (!c.firstPlayed) c.firstPlayed = now;
  c.lastPlayed = now;

  saveCareer();
  if (live) live.recorded = true;

  return {
    score, streak, mode,
    records: {
      bestScore, bestTime, bestKills, bestPlace,
      bestStreak: bestStreakEver, firstWinInMode, firstInMode,
    },
    career: c,
  };
}

/** True once the current match has been banked — guards double-counting. */
export function matchRecorded() { return !!(live && live.recorded); }

// ---------------------------------------------------------------------------
// Derived read-outs (for the career screen and the cloud `describe`)
// ---------------------------------------------------------------------------

function topOf(bag) {
  let name = null, n = 0;
  for (const [k, v] of Object.entries(bag || {})) {
    if (num(v) > n) { n = num(v); name = k; }
  }
  return name ? { name, n } : null;
}

export function nemesis(c = loadCareer()) { return topOf(c.killedBy); }
export function prey(c = loadCareer()) { return topOf(c.killed); }
export function callsignPoolSize() { return NAME_POOL.length; }
