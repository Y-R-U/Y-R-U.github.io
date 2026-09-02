import { TOTAL_LEVELS } from './config.js';

const KEY = 'ragdojo.save.v2';

/**
 * Per-run, per-theme state. The ACTIVE theme's run sits at the TOP LEVEL of the save, so
 * every consumer reads `save.level` / `save.bully` / `save.records` exactly as before; the
 * other theme's copy waits in `stash`, and toggling theme swaps them. Ink, skills, settings
 * and the music roster are deliberately not in here — you carry your money and your training
 * into the dark. Only the campaign and its records are separate.
 */
export const RUN_KEYS = [
  'level', 'wins', 'losses', 'kos', 'score', 'best', 'totalInk', 'biggestLaunch',
  'completed', 'bully', 'bullyLevel', 'newGamePlus', 'records',
];
export const RECORDS = () => ({
  bestScore: 0, bestFight: 0, longestLaunch: 0, mostKos: 0, wins: 0, championships: 0, bullyRuns: 0,
});
export const RUN = () => ({
  level: 0, wins: 0, losses: 0, kos: 0, score: 0, best: 0, totalInk: 0, biggestLaunch: 0,
  // `completed` is about THIS run and resets with a new game; `everWon` never does, and is
  // what keeps the music roster and the record book after you start again.
  completed: false, bully: false, bullyLevel: 0, newGamePlus: 0, records: RECORDS(),
});

export const DEFAULT = () => ({
  ...RUN(),
  theme: 'light',
  stash: {},                 // the other theme's run, swapped in when you toggle
  everWon: false,            // finished the LIGHT campaign at least once
  darkUnlocked: false,       // won a LIGHT bully run — this is what opens DARK
  thugWon: false,            // won a DARK bully (THUG) run
  carryDark: false,          // said yes to "stay a THUG": dark moves in the light world
  ink: 0,
  perks: {},
  moves: { power: { owned: true, power: 0, cd: 0 }, d_shank: { owned: true, power: 0, cd: 0 } },
  settings: { music: true, sfx: true, shake: true, haptics: true, hand: 'right' },
  seen: {},
  musicRecent: [],
  musicOff: {},              // fight tracks the player has switched off
});

/** Clamp a level index into range. A save parked at 45 of 45 used to kill the FIGHT button. */
const cap = (v) => Math.max(0, Math.min(TOTAL_LEVELS - 1, Math.round(+v || 0)));

function healRun(r) {
  const out = { ...RUN(), ...(r || {}) };
  out.records = { ...RECORDS(), ...(out.records || {}) };
  out.level = cap(out.level);
  out.bullyLevel = cap(out.bullyLevel);
  return out;
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT();
    const s = { ...DEFAULT(), ...JSON.parse(raw) };
    s.settings = { ...DEFAULT().settings, ...(s.settings || {}) };
    s.moves = { ...DEFAULT().moves, ...(s.moves || {}) };
    // A save from before the light/dark split has already won if it says it is completed.
    if (s.completed) s.everWon = true;
    if (s.theme !== 'dark') s.theme = 'light';
    Object.assign(s, healRun(s));
    s.stash = s.stash && typeof s.stash === 'object' ? s.stash : {};
    for (const t of ['light', 'dark']) {
      if (t !== s.theme && s.stash[t]) s.stash[t] = healRun(s.stash[t]);
    }
    return s;
  } catch { return DEFAULT(); }
}

export function save(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ }
}

export function wipe() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
