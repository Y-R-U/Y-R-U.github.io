// The only localStorage touchpoint. `?nosave` keeps it entirely in memory (test tooling).

const KEY = 'skyhammer.save.v1';

const FRESH = () => ({
  money: 0,
  planeId: 'kestrel',
  planes: ['kestrel'],
  loadout: ['bomb_std', 'rocket', null, null],
  upgrades: {},
  levelsDone: {},
  settings: {},
  version: 1,
});

let memoryOnly = false;
try {
  memoryOnly = typeof location !== 'undefined' && /(?:\?|&)nosave\b/.test(location.search);
} catch { /* not a browser */ }

export const save = {
  data: FRESH(),

  load() {
    if (memoryOnly) return save.data;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) save.data = { ...FRESH(), ...JSON.parse(raw) };
    } catch { save.data = FRESH(); }
    return save.data;
  },

  flush() {
    if (memoryOnly) return;
    try { localStorage.setItem(KEY, JSON.stringify(save.data)); } catch { /* private mode */ }
  },

  reset() { save.data = FRESH(); save.flush(); },

  get money() { return save.data.money; },
  set money(v) { save.data.money = Math.max(0, Math.round(v)); },
  get loadout() { return save.data.loadout; },
  set loadout(v) { save.data.loadout = v; },
  get upgrades() { return save.data.upgrades; },
  get planeId() { return save.data.planeId; },
  set planeId(v) { save.data.planeId = v; },
  get levelsDone() { return save.data.levelsDone; },

  /** Fold a finished level's results in. Returns the money added. */
  record(results) {
    if (!results) return 0;
    const d = save.data;
    const prev = d.levelsDone[results.levelId] || { stars: 0, best: Infinity };
    if (results.outcome === 'win') {
      d.levelsDone[results.levelId] = {
        stars: Math.max(prev.stars, results.stars),
        best: Math.min(prev.best, results.time),
      };
    }
    d.money += results.money | 0;
    save.flush();
    return results.money | 0;
  },
};
