// Persistent profile: one object in localStorage behind a debounced flush, so a
// run can bump counters every frame without thrashing storage.

import { SAVE_KEY, WIPE_ARG, ECON, UPGRADE_BY_ID, upgradeCost, powerOf } from './config.js';
import { emit } from './bus.js';
import { clamp } from './utils.js';

const DEFAULTS = () => ({
  v: 1,
  created: Date.now(),
  seen: Date.now(),
  cash: 0,

  upgrades: {},                     // upgradeId → level
  chapter: 1,                       // highest chapter unlocked
  level: 1,                         // next unplayed level in that chapter
  cleared: {},                      // "c1l7" → { stars, best }
  unlocked: { story: true, store: false, events: false, home: false },

  story: { seen: [], introDone: false },

  home: {
    owned: false,
    debt: ECON.debtTotal,
    plots: 1,
    buildings: {},                  // buildingId → level
    lastCollect: 0,
  },

  events: { cleared: {}, lastSeed: 0 },
  missions: { runs: 0, best: 0 },

  stats: {
    runs: 0, wins: 0, losses: 0,
    troopsGained: 0, troopsLost: 0, kills: 0,
    gatesGrown: 0, bestGate: 0, bestSquad: 0, cashEarned: 0,
    distance: 0, bossesKilled: 0,
  },

  settings: { sfx: true, music: true, haptics: true, quality: 'auto' },
});

let profile = null;
let flushT = 0;

export function loadProfile() {
  if (WIPE_ARG) { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* private mode */ } }
  let raw = null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { raw = null; }
  const base = DEFAULTS();
  if (raw) {
    try {
      const got = JSON.parse(raw);
      profile = migrate(deepMerge(base, got));
    } catch (e) { console.warn('[save] corrupt, starting fresh', e); profile = base; }
  } else {
    profile = base;
  }
  return profile;
}

export const P = () => profile || loadProfile();

// Every write goes through here so nothing forgets to persist. `now` forces an
// immediate flush for the handful of moments worth losing a frame over: a
// purchase, a level clear, leaving the page.
export function save(now = false) {
  if (!profile) return;
  profile.seen = Date.now();
  if (now) { flush(); return; }
  if (flushT) return;
  flushT = setTimeout(flush, 900);
}
function flush() {
  clearTimeout(flushT); flushT = 0;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(profile)); }
  catch (e) { console.warn('[save] write failed', e); }
}
window.addEventListener('pagehide', () => save(true));
window.addEventListener('visibilitychange', () => { if (document.hidden) save(true); });

function deepMerge(base, got) {
  for (const k of Object.keys(got || {})) {
    const b = base[k], g = got[k];
    if (b && g && typeof b === 'object' && typeof g === 'object' && !Array.isArray(b)) deepMerge(b, g);
    else base[k] = g;
  }
  return base;
}
function migrate(p) { p.v = 1; return p; }

// --------------------------------------------------------------------------
// Money
// --------------------------------------------------------------------------
export function addCash(n, reason = '') {
  const p = P();
  n = Math.round(n);
  p.cash = Math.max(0, p.cash + n);
  if (n > 0) p.stats.cashEarned += n;
  save();
  emit('cash:change', { cash: p.cash, delta: n, reason });
  return p.cash;
}
export function canAfford(n) { return P().cash >= n; }
export function spend(n) {
  const p = P();
  if (p.cash < n) return false;
  p.cash -= n; save(true);
  emit('cash:change', { cash: p.cash, delta: -n, reason: 'spend' });
  return true;
}

// --------------------------------------------------------------------------
// Base upgrades
// --------------------------------------------------------------------------
export const upLevel = (id) => P().upgrades[id] || 0;
export function upCost(id) {
  const u = UPGRADE_BY_ID[id];
  return u ? upgradeCost(u, upLevel(id)) : Infinity;
}
export function upMaxed(id) {
  const u = UPGRADE_BY_ID[id];
  return !u || upLevel(id) >= u.max;
}
export function buyUpgrade(id) {
  const u = UPGRADE_BY_ID[id];
  if (!u || upMaxed(id)) return false;
  const cost = upCost(id);
  if (!spend(cost)) return false;
  const p = P();
  p.upgrades[id] = upLevel(id) + 1;
  save(true);
  emit('upgrade:bought', { id, level: p.upgrades[id], cost });
  return true;
}
export const playerPower = () => powerOf(P().upgrades);

// --------------------------------------------------------------------------
// Progress
// --------------------------------------------------------------------------
export const levelKey = (chapter, level) => `c${chapter}l${level}`;
export const isCleared = (chapter, level) => !!P().cleared[levelKey(chapter, level)];

export function clearLevel(chapter, level, stats) {
  const p = P();
  const k = levelKey(chapter, level);
  const prev = p.cleared[k];
  const rec = {
    stars: Math.max(prev?.stars || 0, stats?.stars || 1),
    best: Math.max(prev?.best || 0, stats?.peakTroops || 0),
    n: (prev?.n || 0) + 1,
  };
  p.cleared[k] = rec;
  if (chapter === p.chapter && level >= p.level) p.level = level + 1;
  save(true);
  emit('level:cleared', { chapter, level, rec, first: !prev });
  return rec;
}

export function unlock(what) {
  const p = P();
  if (p.unlocked[what]) return false;
  p.unlocked[what] = true;
  save(true);
  emit('unlock', { what });
  return true;
}
export const isUnlocked = (what) => !!P().unlocked[what];

export function markStory(id) {
  const p = P();
  if (p.story.seen.includes(id)) return false;
  p.story.seen.push(id); save();
  return true;
}
export const storySeen = (id) => P().story.seen.includes(id);

export function bumpStats(patch) {
  const s = P().stats;
  for (const k of Object.keys(patch)) {
    if (k.startsWith('best')) s[k] = Math.max(s[k] || 0, patch[k]);
    else s[k] = (s[k] || 0) + patch[k];
  }
  save();
}

// --------------------------------------------------------------------------
// The house. Debt first, then it starts paying you back.
// --------------------------------------------------------------------------
export function payDebt(n) {
  const p = P();
  n = Math.min(n, p.home.debt);
  if (n <= 0 || !spend(n)) return 0;
  p.home.debt -= n; save(true);
  emit('debt:paid', { paid: n, left: p.home.debt });
  return n;
}

// Offline income accrues while the game is closed, capped so leaving it a week
// is not a windfall. Collected explicitly, because a number you tap is worth
// more than a number that was already there.
export function pendingIncome(ratePerHour) {
  const p = P();
  if (!p.home.owned || !ratePerHour) return 0;
  const last = p.home.lastCollect || Date.now();
  const hrs = clamp((Date.now() - last) / 3.6e6, 0, ECON.offlineCapHours);
  return Math.floor(hrs * ratePerHour);
}
export function collectIncome(ratePerHour) {
  const got = pendingIncome(ratePerHour);
  const p = P();
  p.home.lastCollect = Date.now();
  if (got > 0) addCash(got, 'offline');
  save(true);
  return got;
}

export function wipe() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  profile = DEFAULTS();
  save(true);
}
