// The only file in the project that touches localStorage. Everything else asks
// for a Save object. Migrations live here and nowhere else.

export const SAVE_VERSION = 1;
const KEY = 'ninestrings.save.v1';

function fresh() {
  return {
    v: SAVE_VERSION,
    souls: 0,
    unlocks: [],                 // unlock ids already granted
    chars: ['wick'],             // characters available
    stagesCleared: {},           // stageId -> best time / curse cleared
    curse: {},                   // stageId -> highest curse tier beaten
    sanctum: {},                 // nodeId -> level
    codex: { enemies: {}, lore: [] },
    challenges: {},
    settings: { sfx: 0.8, music: 0.55, haptics: true, quality: 2, stickSide: 'auto' },
    stats: { runs: 0, kills: 0, cuts: 0, bestTime: 0, conductorsKilled: 0, choirmasters: 0 },
    story: { seen: [], act: 1 },
    lastPlayed: 0,
  };
}

// Shallow-merge a loaded save over a fresh one so a save written by an older
// build never arrives missing a key that today's code reads.
function reconcile(loaded) {
  const base = fresh();
  if (!loaded || typeof loaded !== 'object') return base;
  for (const k of Object.keys(base)) {
    const v = loaded[k];
    if (v === undefined || v === null) continue;
    if (typeof base[k] === 'object' && !Array.isArray(base[k])) {
      base[k] = { ...base[k], ...v };
    } else {
      base[k] = v;
    }
  }
  base.v = SAVE_VERSION;
  return base;
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    return reconcile(JSON.parse(raw));
  } catch (e) {
    // A corrupt or blocked store must never stop the game booting.
    return fresh();
  }
}

export function writeSave(save) {
  try {
    save.lastPlayed = Date.now();
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch (e) { /* private mode, quota, blocked - play on regardless */ }
}

export function resetSave() {
  try { localStorage.removeItem(KEY); } catch (e) {}
  return fresh();
}

export function freshSave() { return fresh(); }
