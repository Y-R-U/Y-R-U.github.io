// GAMBIT local storage. Every key is `gambit.`-prefixed (that prefix is what
// cloud sync mirrors — see cloud.js for which keys actually travel).
//
//   gambit.settings   synced    user preferences
//   gambit.ladder     synced    bot ladder: points, ladder Elo, generated-field seed
//   gambit.stats      synced    W/D/L per bot, best win, recent games
//   gambit.resume     LOCAL     an unfinished bot game — never synced (games/CLAUDE.md)
//
// Each synced value carries `savedAt` so freshness is never decided by comparing
// serialised blobs.

export const KEYS = {
  settings: 'gambit.settings',
  ladder: 'gambit.ladder',
  stats: 'gambit.stats',
  resume: 'gambit.resume',
};
export const SYNCED_KEYS = [KEYS.settings, KEYS.ladder, KEYS.stats];

// Cloud sync mirrors EVERY `gambit.` key except these local-only ones. Convention for
// other agents: a key that must never leave this device ends in `.resume` (an in-progress
// game, games/CLAUDE.md) or `.bench` (device speed), or starts with `gambit.local.`.
export const KNOWN_SYNCED = [...SYNCED_KEYS, 'gambit.puzzles'];
export function isLocalOnly(k) { return /\.(resume|bench)$/.test(k) || k.startsWith('gambit.local.'); }
export function syncedKeys() {
  const out = new Set(KNOWN_SYNCED);
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('gambit.')) out.add(k);
    }
  } catch { /* storage blocked */ }
  return [...out].filter(k => !isLocalOnly(k));
}

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : fallback;
  } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify({ ...value, savedAt: Date.now() })); } catch { /* private mode */ }
}
function remove(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } }

// ---------- settings ----------
export const DEFAULT_SETTINGS = {
  theme: 'classic',
  battleSpeed: 1,          // 'off' | 1 | 2 | 5
  sound: true,
  moveConfirm: false,
  coords: true,
  view: 'default',         // 'top' | 'default' | 'angle'
  lastTc: '10+0',
  lastColor: 'random',
};
let settingsCache = null;
export function getSettings() {
  if (!settingsCache) settingsCache = { ...DEFAULT_SETTINGS, ...read(KEYS.settings, {}) };
  return settingsCache;
}
export function setSettings(patch) {
  settingsCache = { ...getSettings(), ...patch };
  const { savedAt, ...rest } = settingsCache;
  write(KEYS.settings, rest);
  for (const fn of settingsListeners) { try { fn(settingsCache, patch); } catch (e) { console.warn(e); } }
  return settingsCache;
}
const settingsListeners = new Set();
export function onSettings(fn) { settingsListeners.add(fn); return () => settingsListeners.delete(fn); }

// ---------- ladder / stats ----------
export function getLadder() {
  return { points: 0, elo: 800, games: 0, seed: 0, createdAt: 0, ...read(KEYS.ladder, {}) };
}
export function setLadder(v) { const { savedAt, ...rest } = v; write(KEYS.ladder, rest); }

export function getStats() {
  return { games: 0, w: 0, d: 0, l: 0, perBot: {}, bestWin: null, recent: [], ...read(KEYS.stats, {}) };
}
export function setStats(v) { const { savedAt, ...rest } = v; write(KEYS.stats, rest); }

// ---------- resume (local only) ----------
export function getResume() { return read(KEYS.resume, null); }
export function setResume(v) { const { savedAt, ...rest } = v; write(KEYS.resume, rest); }
export function clearResume() { remove(KEYS.resume); }
