// Versioned save in localStorage (one key, D18) with an in-memory fallback for node / private mode.
export const SAVE_KEY = 'vectorprotocol.save.v1';
export const SAVE_VERSION = 2;

const mem = new Map();
function store() {
  try {
    if (typeof localStorage !== 'undefined') {
      const k = '__vp_probe';
      localStorage.setItem(k, '1'); localStorage.removeItem(k);
      return localStorage;
    }
  } catch { /* fall through */ }
  return { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
}

// migrations[n] upgrades a save from version n to n+1.
export const migrations = {
  // v2 (sim-2): per-level star goals + map chests. Old stars (win / ≤1 lost / no losses) map to goals 1–3.
  1: (s) => {
    s.story ||= { levels: {} };
    for (const rec of Object.values(s.story.levels || {})) rec.goals ||= [rec.stars >= 1, rec.stars >= 2, rec.stars >= 3];
    s.story.chests ||= {};
    s.v = 2;
    return s;
  },
};

export function migrate(s) {
  if (!s || typeof s !== 'object') return null;
  s.v = s.v || 1;
  while (s.v < SAVE_VERSION) {
    const m = migrations[s.v];
    if (!m) throw new Error(`save: no migration from v${s.v}`);
    s = m(s);
  }
  return s;
}

export function readSave(key = SAVE_KEY) {
  try {
    const raw = store().getItem(key);
    if (!raw) return null;
    return migrate(JSON.parse(raw));
  } catch (e) {
    console.warn('[save] unreadable save, ignoring', e);
    return null;
  }
}
export function writeSave(s, key = SAVE_KEY) {
  try { store().setItem(key, JSON.stringify(s)); return true; } catch (e) { console.warn('[save] write failed', e); return false; }
}
export function clearSave(key = SAVE_KEY) { try { store().removeItem(key); } catch { /* */ } }
export function exportSave(s) { return JSON.stringify(s); }
export function importSave(json) { return migrate(JSON.parse(json)); }
