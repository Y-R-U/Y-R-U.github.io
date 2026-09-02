import { TOTAL_LEVELS } from './config.js';

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
  // `completed` is about THIS run and resets with a new game; `everWon` never does, and is
  // what keeps the music roster and the record book after you start again.
  completed: false, everWon: false, bully: false, bullyLevel: 0, newGamePlus: 0,
  records: { bestScore: 0, bestFight: 0, longestLaunch: 0, mostKos: 0, wins: 0, championships: 0, bullyRuns: 0 },
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
    s.records = { ...DEFAULT().records, ...(s.records || {}) };
    // A save from before the split has already won if it says it is completed.
    if (s.completed) s.everWon = true;
    s.moves = { power: { owned: true, power: 0, cd: 0 }, ...(s.moves || {}) };
    // Heal a save parked one past the end of the campaign. Finishing a bully run used to
    // store level 45 of 45, and LEVELS[45] does not exist: the hub clamped it for display
    // but FIGHT passed the raw value, so the button threw and did nothing, for ever, across
    // refreshes. Clamping on load fixes an already-broken save without wiping it.
    const cap = (v) => Math.max(0, Math.min(TOTAL_LEVELS - 1, Math.round(+v || 0)));
    s.level = cap(s.level);
    s.bullyLevel = cap(s.bullyLevel);
    return s;
  } catch { return DEFAULT(); }
}

export function save(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ }
}

export function wipe() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
