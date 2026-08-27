// localStorage only. Values stay raw strings so the cloud layer can mirror them
// byte-for-byte — parse-and-reserialise has caused a reload loop in this repo
// before, so never round-trip a save through JSON just to compare it.
const K_BEST = 'silt.best';
const K_SET = 'silt.settings';
const K_STATS = 'silt.stats';
const K_LASTMODE = 'silt.lastmode';   // written by js/ui — the mode PLAY resumes

const read = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

export const SAVE_KEYS = [K_BEST, K_SET, K_STATS, K_LASTMODE];

export function createSave() {
  let best = read(K_BEST, {});
  let settings = read(K_SET, { music: 0.6, sfx: 0.8, biome: 'dune', quality: 'auto', haptics: true });
  let stats = read(K_STATS, { games: 0, chains: 0, cells: 0 });
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
    // UTC day, and compared with >= not === — a daily that uses local time or an
    // equality test breaks across timezones and after a missed day.
    today() { return new Date().toISOString().slice(0, 10); },
  };
}
