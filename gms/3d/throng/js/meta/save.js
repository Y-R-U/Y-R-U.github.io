// One versioned key. `savedAt` is the stamp a cloud layer compares; never compare saves by JSON text.
export const SAVE_KEY = 'throng.save';
export const SAVE_VERSION = 1;

export function defaults() {
  return {
    v: SAVE_VERSION, savedAt: 0, createdAt: 0,
    name: '',
    coins: 0, xp: 0, level: 1,
    rating: 0, league: 0, peakRating: 0,
    stats: { matches: 0, wins: 0, top3: 0, bestCrowd: 0, recruited: 0, absorbed: 0, streak: 0, bestStreak: 0, coinsEarned: 0, crownSecs: 0 },
    owned: { color: [], plate: [], badge: [], emote: [], toast: [], hat: [], leader: [], flag: [], trail: [], ring: [] },
    equip: { color: 'blue', plate: 'classic', badge: 'classic', emote: 'gg', toast: 'classic', hat: 'none', leader: 'none', flag: 'none', trail: 'none', ring: 'solid' },
    daily: { loginStep: 0, lastClaim: '', chKey: '', chProgress: 0, chDone: false, firstWinKey: '' },
    settings: { music: true, sfx: true, quality: 'auto', lefty: false, keepMoving: true, haptics: true, mouse: 'follow' },
    mode: 'classic',
    season: { n: 0, peakLeague: 0, matchesAtStart: 0 },
    cup: { key: '', results: [], claimed: [] },
    trophies: [],
    modeStats: {},
    tutorialDone: false,
    last: null,
  };
}

const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
function fill(base, raw) {
  if (!isObj(raw)) return base;
  for (const k of Object.keys(base)) {
    if (!(k in raw)) continue;
    const b = base[k], r = raw[k];
    if (isObj(b) && !Object.keys(b).length) base[k] = isObj(r) ? JSON.parse(JSON.stringify(r)) : b;
    else if (isObj(b)) base[k] = fill(b, r);
    else if (Array.isArray(b)) base[k] = Array.isArray(r) ? r.slice() : b;
    else if (b === null || typeof r === typeof b) base[k] = r;
  }
  return base;
}

// raw: the parsed save or null. legacy: { name, muted } from the wave-1 keys.
export function migrate(raw, legacy = {}) {
  const s = defaults();
  if (!isObj(raw) || !(raw.v >= 1)) {
    if (legacy.name) s.name = String(legacy.name).slice(0, 14);
    if (legacy.muted) { s.settings.music = false; s.settings.sfx = false; }
    return s;
  }
  fill(s, raw);
  s.v = SAVE_VERSION;
  if (!(s.coins >= 0)) s.coins = 0;
  if (!(s.rating >= 0)) s.rating = 0;
  if (!(s.level >= 1)) s.level = 1;
  return s;
}

export function load(storage) {
  let raw = null, legacy = {};
  try {
    const txt = storage.getItem(SAVE_KEY);
    if (txt) raw = JSON.parse(txt);
  } catch { raw = null; }
  if (!raw) {
    try { legacy = { name: storage.getItem('throng.name') || '', muted: storage.getItem('throng.muted') === '1' }; } catch {}
  }
  const s = migrate(raw, legacy);
  if (!s.createdAt) s.createdAt = Date.now();
  return s;
}

export function write(storage, save, now = Date.now()) {
  save.savedAt = Math.max(now, (save.savedAt || 0) + 1);
  try { storage.setItem(SAVE_KEY, JSON.stringify(save)); return true; } catch { return false; }
}

export function memoryStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}
