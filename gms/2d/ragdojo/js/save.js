const KEY = 'ragdojo.save.v2';

export const DEFAULT = () => ({
  level: 0,
  ink: 0,
  totalInk: 0,
  perks: {},
  moves: { power: { owned: true, power: 0, cd: 0 } },
  settings: { music: true, sfx: true, shake: true, haptics: true, hand: 'right' },
  best: 0,
  score: 0,
  wins: 0, losses: 0, kos: 0, biggestLaunch: 0,
  completed: false, bully: false, bullyLevel: 0, newGamePlus: 0,
  seen: {},
  musicRecent: [],
  musicOff: {},          // fight tracks the player has switched off
});

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT();
    const s = { ...DEFAULT(), ...JSON.parse(raw) };
    s.settings = { ...DEFAULT().settings, ...(s.settings || {}) };
    s.moves = { power: { owned: true, power: 0, cd: 0 }, ...(s.moves || {}) };
    return s;
  } catch { return DEFAULT(); }
}

export function save(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ }
}

export function wipe() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
