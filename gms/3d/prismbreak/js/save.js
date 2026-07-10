// localStorage persistence. One JSON blob, defensive load.
const KEY = 'prismbreak.save.v1';

const DEFAULTS = () => ({
  shards: 300, // starter pack
  boosters: { hammer: 1, swap: 1, moves: 0, shuffle: 1, rainbow: 0 },
  levels: {},            // { "1": {stars, score} }
  unlockedLevel: 1,
  daily: { lastClaim: null, streak: 0, claimed: [] },   // claimed: ['2026-07-11', ...] (last 60 kept)
  weekly: { week: null, best: 0, claimed: [], runs: 0 },
  events: {},            // { "<eventId>": {best, claimed:[bool,...]} }
  ads: { day: null, freebies: 0 },
  theme: 'aurora',
  themesOwned: ['aurora'],
  monthlyAwarded: [],    // ['2026-07']
  settings: { sfx: true, music: true, quality: 'high', hints: true },
  best: { blitz: 0, zen: 0 },
  stats: { matches: 0, crushes: 0, specials: 0, cascadesBest: 0, gamesPlayed: 0, shardsEarned: 0 },
});

export const save = { data: DEFAULTS() };

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const d = DEFAULTS();
      // shallow-merge known top-level keys so new fields get defaults
      for (const k of Object.keys(d)) {
        if (parsed[k] !== undefined) {
          d[k] = (typeof d[k] === 'object' && !Array.isArray(d[k]) && d[k] !== null)
            ? { ...d[k], ...parsed[k] } : parsed[k];
        }
      }
      save.data = d;
    }
  } catch (e) { save.data = DEFAULTS(); }
  return save.data;
}

export function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(save.data)); } catch (e) { /* private mode */ }
}

export function addShards(n, track = true) {
  save.data.shards = Math.max(0, save.data.shards + n);
  if (n > 0 && track) save.data.stats.shardsEarned += n;
  persist();
}

export function spendShards(n) {
  if (save.data.shards < n) return false;
  save.data.shards -= n;
  persist();
  return true;
}

export function addBooster(kind, n = 1) {
  save.data.boosters[kind] = (save.data.boosters[kind] || 0) + n;
  persist();
}

export function useBooster(kind) {
  if ((save.data.boosters[kind] || 0) <= 0) return false;
  save.data.boosters[kind]--;
  persist();
  return true;
}

export function recordLevel(n, stars, score) {
  const prev = save.data.levels[n] || { stars: 0, score: 0 };
  save.data.levels[n] = { stars: Math.max(prev.stars, stars), score: Math.max(prev.score, score) };
  if (stars > 0) save.data.unlockedLevel = Math.max(save.data.unlockedLevel, n + 1);
  persist();
}

export function wipe() {
  localStorage.removeItem(KEY);
  save.data = DEFAULTS();
}
