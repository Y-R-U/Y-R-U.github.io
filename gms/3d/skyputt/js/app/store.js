// Progress + settings in localStorage. Every access is guarded: private mode, blocked storage or
// a corrupt blob must never break the game (it just starts fresh / doesn't persist).
const KEY = 'skyputt.save.v1';

export const DEFAULT_SETTINGS = {
  sfx: 0.9, music: 0.6, quality: 'high', camSens: 1, lefty: false, theme: 'sky',
};
export const START_HELPERS = { longSight: 3, mulligan: 3 };
export const COINS_PER_CRYSTAL = 5;

// Career progress: profile + per-event results (best, passed) + which one-off lines were seen.
export function freshStory() { return { name: '', events: {}, chapters: {}, seen: {} }; }

function fresh() {
  return { v: 1, holes: {}, coins: 0, helpers: { ...START_HELPERS }, settings: { ...DEFAULT_SETTINGS }, unlocked: {}, story: freshStory() };
}

// stars: 0 = not finished / picked up, 1 = finished, 2 = par or better, 3 = under par
export function starsFor(strokes, par, picked) {
  if (picked) return 0;
  return strokes < par ? 3 : strokes === par ? 2 : 1;
}

export class Store {
  constructor() { this.data = this._load(); }
  _load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return fresh();
      const d = JSON.parse(raw);
      const f = fresh();
      return {
        ...f, ...d,
        holes: typeof d.holes === 'object' && d.holes ? d.holes : {},
        helpers: { ...f.helpers, ...(d.helpers || {}) },
        settings: { ...f.settings, ...(d.settings || {}) },
        unlocked: typeof d.unlocked === 'object' && d.unlocked ? d.unlocked : {},
        coins: Number.isFinite(d.coins) ? d.coins : 0,
        story: { ...freshStory(), ...(d.story && typeof d.story === 'object' ? d.story : {}) },
      };
    } catch { return fresh(); }
  }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* storage unavailable */ } }
  reset() { this.data = fresh(); this.save(); }

  hole(id) { return this.data.holes[id] || null; }
  // Record a finished hole; returns { stars, newBest, prevStars }.
  recordHole(id, strokes, par, picked) {
    const stars = starsFor(strokes, par, picked);
    const prev = this.data.holes[id];
    const newBest = !picked && (!prev || !prev.best || strokes < prev.best);
    this.data.holes[id] = {
      best: newBest ? strokes : prev?.best ?? null,
      stars: Math.max(prev?.stars ?? 0, stars),
      plays: (prev?.plays ?? 0) + 1,
    };
    this.save();
    return { stars, newBest, prevStars: prev?.stars ?? 0 };
  }
  // Holes unlock in order: hole i is open when i === 0 or hole i-1 has been finished once.
  unlockedCount(course) {
    let n = 1;
    for (let i = 0; i < course.holes.length - 1; i++) { if (this.data.unlocked[course.holes[i].id]) n = i + 2; else break; }
    return Math.min(n, course.holes.length);
  }
  markFinished(id) { this.data.unlocked[id] = true; this.save(); }
  addCoins(n) { this.data.coins = Math.max(0, (this.data.coins | 0) + n); this.save(); }
  helpers() { return this.data.helpers; }
  useHelper(name) {
    if ((this.data.helpers[name] | 0) <= 0) return false;
    this.data.helpers[name]--; this.save(); return true;
  }
  giveHelper(name, n = 1) { this.data.helpers[name] = (this.data.helpers[name] | 0) + n; this.save(); }
  story() { return this.data.story; }
  saveStory() { this.save(); }
  settings() { return this.data.settings; }
  setSetting(k, v) { this.data.settings[k] = v; this.save(); }
}
