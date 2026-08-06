// localStorage: ladder progress, settings, the opponent model. Phase 1 is local only (D3) — the
// br8t account layer is dormant, so everything lives under one namespaced key that a later
// adapter can lift wholesale.
//
// This is the ONLY file that knows where progress lives. Nothing else may touch localStorage.
//
// The stored shape is { v, <section>: … }. `v` is the schema version and it is the whole of the
// migration story: read() runs every step from the stored v up to VERSION, in order, and a save it
// cannot migrate is replaced with defaults rather than half-migrated.

import { SAVE_KEY } from './config.js';

const VERSION = 2;

const DEFAULTS = () => ({
  settings: { cine: 'auto', place: 'auto', sound: true },
  ladder: null,      // sim LadderState — { rung, best, wins, losses, complete }
  memory: null,      // sim Memory — what the ladder's top tier has learned about this player
  stats: { games: 0, wins: 0, losses: 0, shots: 0, hits: 0, sunk: 0 },
  custom: null,      // last custom-game config, so the builder reopens where it was left
  // The match in progress. `game` is sim.serialize() — the sim is pure and round-trips through
  // it, so this is the whole of a resume. It holds the private layoutSeed, which is exactly why
  // it may never leave this device: D8's oracle is closed by the seed never being shareable, not
  // by it never being written down.
  match: null,       // { v, game, cfg, drama, at }
});

// v → the function that turns a v-shaped save into a (v+1)-shaped one. Append only: editing a step
// that has shipped means a save written by the old code migrates differently than it used to.
const MIGRATIONS = {
  0: d => ({ ...d, ladder: d.ladder && Number.isFinite(d.ladder.rung) ? d.ladder : null }),
  1: d => ({ ...d, match: null }),
};

function migrate(raw) {
  let d = raw;
  let v = Number.isInteger(raw.v) ? raw.v : 0;
  while (v < VERSION && MIGRATIONS[v]) { d = MIGRATIONS[v](d); v++; }
  return sane({ ...DEFAULTS(), ...d, v: VERSION });
}

// Everything here has been through localStorage, which anyone can edit, and a section of the wrong
// shape reaches the sim (a Memory) or the ladder screen (a rung). A bad section is dropped to its
// default rather than trusted — measured: `{ladder:'nonsense', stats:42}` used to survive intact.
const obj = x => x && typeof x === 'object' && !Array.isArray(x);
function sane(d) {
  const def = DEFAULTS();
  if (!obj(d.settings)) d.settings = def.settings;
  if (!obj(d.stats)) d.stats = def.stats;
  if (!obj(d.ladder) || !Number.isFinite(d.ladder.rung)) d.ladder = null;
  if (!obj(d.memory) || d.memory.v !== 1 || !obj(d.memory.boards)) d.memory = null;
  if (!obj(d.custom) || !Array.isArray(d.custom.fleet)) d.custom = null;
  // Only the envelope is checked here. The game string itself is the sim's to validate — it has a
  // structural deserialize() that rejects a truncated or hand-edited board, and duplicating any of
  // that here would be a second set of rules to keep in step with the first.
  if (!obj(d.match) || typeof d.match.game !== 'string' || !obj(d.match.cfg)) d.match = null;
  return d;
}

function usable() {
  try {
    localStorage.setItem(SAVE_KEY + ':probe', '1');
    localStorage.removeItem(SAVE_KEY + ':probe');
    return true;
  } catch { return false; }
}

function read() {
  const blank = { ...DEFAULTS(), v: VERSION };
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return blank;
    // A save written by a NEWER build cannot be migrated backwards and must not be half-read.
    if (Number.isInteger(raw.v) && raw.v > VERSION) return blank;
    return migrate(raw);
  } catch { return blank; }
}

export function createSave() {
  const available = usable();
  let data = read();

  const flush = () => {
    // private mode and a full quota both throw here; losing a save is not worth a crash
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch {}
  };

  return {
    available,
    version: VERSION,
    get(key, fallback = null) { return key in data && data[key] != null ? data[key] : fallback; },
    set(key, value) { data[key] = value; flush(); return value; },
    // Merge into a section without reading it back first — the common case for settings.
    patch(key, part) {
      data[key] = { ...(data[key] && typeof data[key] === 'object' ? data[key] : {}), ...part };
      flush();
      return data[key];
    },
    bump(key, field, by = 1) {
      const sec = { ...(data[key] || {}) };
      sec[field] = (sec[field] || 0) + by;
      data[key] = sec;
      flush();
      return sec;
    },
    remove(key) { delete data[key]; flush(); },
    all() { return JSON.parse(JSON.stringify(data)); },
    clear() { data = { ...DEFAULTS(), v: VERSION }; flush(); },
  };
}
