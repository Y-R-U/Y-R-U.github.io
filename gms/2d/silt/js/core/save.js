// localStorage only. Values stay raw strings so the cloud layer can mirror them
// byte-for-byte — parse-and-reserialise has caused a reload loop in this repo
// before, so never round-trip a save through JSON just to compare it.
const K_BEST = 'silt.best';
const K_SET = 'silt.settings';
const K_STATS = 'silt.stats';
const K_LASTMODE = 'silt.lastmode';   // written by js/ui — the mode PLAY resumes
const K_LEVELS = 'silt.levels';       // ALCHEMY per-level stars: { [levelId]: stars }

const read = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

export const SAVE_KEYS = [K_BEST, K_SET, K_STATS, K_LASTMODE, K_LEVELS];

export function createSave() {
  let best = read(K_BEST, {});
  // biome 'auto' means follow the mode's own declared biome; anything else is
// an explicit player override.
let settings = read(K_SET, { music: 0.6, sfx: 0.8, biome: 'auto', quality: 'auto', haptics: true });
  let stats = read(K_STATS, { games: 0, chains: 0, cells: 0 });
  let levels = read(K_LEVELS, {});
  return {
    get settings() { return settings; },
    get stats() { return stats; },
    bestFor(mode) { return best[mode] || 0; },
    recordGame(mode, score, chains, cells) {
      stats.games++; stats.chains += chains; stats.cells += cells;
      write(K_STATS, stats);
      if (score > (best[mode] || 0)) { best[mode] = score; write(K_BEST, best); return true; }
      return false;
    },
    setSetting(k, v) { settings[k] = v; write(K_SET, settings); },

    // ALCHEMY progress. Stars only ever go up, so replaying a level cannot
    // cost you the rating you already earned.
    get levels() { return levels; },
    starsFor(id) { return levels[id] || 0; },
    recordLevel(id, stars) {
      if (!id) return false;
      const was = levels[id] || 0;
      if (stars <= was) return false;
      levels[id] = stars; write(K_LEVELS, levels); return true;
    },
    /** Highest level unlocked: one past the best completed, capped by what exists. */
    unlockedUpTo(total) {
      let n = 1;
      for (let i = 1; i <= total; i++) if ((levels[i] || 0) > 0) n = i + 1;
      return Math.min(n, total);
    },
    // UTC day, and compared with >= not === — a daily that uses local time or an
    // equality test breaks across timezones and after a missed day.
    today() { return new Date().toISOString().slice(0, 10); },
  };
}
