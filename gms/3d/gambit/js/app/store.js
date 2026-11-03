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
export const KNOWN_SYNCED = [...SYNCED_KEYS, 'gambit.puzzles', 'gambit.learn', 'gambit.rush'];
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

// clientfix: these keys are cloud-synced and may be legacy/corrupt — normalise on read (types +
// defaults per field) without rewriting storage; the next real save writes the cleaned shape.
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v, d) => {
  const n = typeof v === 'string' && v.trim() !== '' ? +v : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : d;
};
const cnt = (v, d = 0) => Math.max(0, Math.round(num(v, d)));
const str = (v, d) => typeof v === 'string' ? v : d;

// ---------- settings ----------
export const DEFAULT_SETTINGS = {
  theme: 'classic',
  battleSpeed: 1,          // 'off' | 1 | 2 | 5
  sound: true,
  volume: 0.8, music: false, musicVolume: 0.5,   // audio agent: effects volume, ambient music (off by default)
  moveConfirm: false,
  coords: true,
  checkAlerts: true,       // checkalert: big CHECK card + edge badge (red king square / links always show)
  ambientAnim: true,       // idle flicker / environment life on the board (board-2 reads it via setOptions)
  view: 'top',             // 'top' | 'tilt' | 'angle' | 'free' (legacy 'default' = 'tilt'); board agent 2026-10-31
  lastTc: '10+0',
  lastColor: 'random',
};
let settingsCache = null;
export function getSettings() {
  if (!settingsCache) {
    const raw = read(KEYS.settings, {});
    const c = settingsCache = { ...DEFAULT_SETTINGS, ...(isObj(raw) ? raw : {}) };
    if (c.view === 'default') c.view = 'tilt';   // old saves
    if (!['top', 'tilt', 'angle', 'free'].includes(c.view)) c.view = 'top';
    // clientfix: right types per field (synced key — a bad value must not break a screen)
    const D = DEFAULT_SETTINGS;
    for (const k of ['sound', 'music', 'moveConfirm', 'coords', 'checkAlerts', 'ambientAnim']) if (typeof c[k] !== 'boolean') c[k] = D[k];
    for (const k of ['volume', 'musicVolume']) c[k] = Math.min(1, Math.max(0, num(c[k], D[k])));
    if (c.battleSpeed !== 'off') { const b = num(c.battleSpeed, NaN); c.battleSpeed = [1, 2, 5].includes(b) ? b : D.battleSpeed; }
    if (typeof c.theme !== 'string' || !c.theme) c.theme = D.theme;
    if (typeof c.lastTc !== 'string' || !(c.lastTc === 'unlimited' || /^\d+\+\d+$/.test(c.lastTc))) c.lastTc = D.lastTc;
    if (!['w', 'b', 'random'].includes(c.lastColor)) c.lastColor = D.lastColor;
  }
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
  const v = read(KEYS.ladder, {});
  const o = isObj(v) ? v : {};
  return { ...o, points: cnt(o.points), elo: num(o.elo, 800), games: cnt(o.games), seed: num(o.seed, 0), createdAt: num(o.createdAt, 0) };
}
export function setLadder(v) { const { savedAt, ...rest } = v; write(KEYS.ladder, rest); }

const RESULTS = ['win', 'draw', 'loss'];
export function getStats() {
  const v = read(KEYS.stats, {});
  const o = isObj(v) ? v : {};
  const perBot = {};
  if (isObj(o.perBot)) for (const [id, r] of Object.entries(o.perBot)) if (isObj(r)) perBot[id] = { ...r, w: cnt(r.w), d: cnt(r.d), l: cnt(r.l) };
  const bw = o.bestWin;
  const bestWin = isObj(bw) && Number.isFinite(num(bw.elo, NaN)) ? { ...bw, name: str(bw.name, str(bw.botId, '?')), elo: num(bw.elo, 0) } : null;
  const recent = (Array.isArray(o.recent) ? o.recent : []).filter(g => isObj(g) && RESULTS.includes(g.result))
    .map(g => ({ ...g, name: str(g.name, str(g.botId, '?')), elo: num(g.elo, 0), pts: num(g.pts, 0), tc: str(g.tc, 'unlimited'), at: num(g.at, 0) }));
  return { ...o, games: cnt(o.games), w: cnt(o.w), d: cnt(o.d), l: cnt(o.l), perBot, bestWin, recent };
}
export function setStats(v) { const { savedAt, ...rest } = v; write(KEYS.stats, rest); }

// ---------- resume (local only) ----------
export function getResume() {
  const r = read(KEYS.resume, null);
  if (!isObj(r) || typeof r.botId !== 'string') return null;
  // clientfix: shape check (local key, but a stale/foreign value must not throw on resume)
  return { ...r, moves: Array.isArray(r.moves) ? r.moves.filter(m => typeof m === 'string') : [],
    tc: typeof r.tc === 'string' && (r.tc === 'unlimited' || /^\d+\+\d+$/.test(r.tc)) ? r.tc : 'unlimited',
    color: r.color === 'b' ? 'b' : 'w',
    clocks: isObj(r.clocks) && Number.isFinite(r.clocks.w) && Number.isFinite(r.clocks.b) ? r.clocks : null };
}
export function setResume(v) { const { savedAt, ...rest } = v; write(KEYS.resume, rest); }
export function clearResume() { remove(KEYS.resume); }
