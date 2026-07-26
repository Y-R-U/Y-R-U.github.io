// Persistent profile. One object in localStorage, written through a debounced
// flush so a race can bump counters every frame without thrashing storage.

import { SAVE_KEY, WIPE_ARG, LADDER, NAME_POOL } from './config.js';
import { STARTER_PARTS, STARTER_SKILLS, statsFor, powerRating } from './arsenal.js';
import { pick, clamp } from './utils.js';

const DEFAULTS = () => ({
  v: 1,
  name: '',
  money: 3200,
  rank: LADDER.startRank,
  bestRank: LADDER.startRank,
  livery: 0,
  fame: 0,                     // lifetime hype, unlocks flavour on the ladder
  garage: {
    equipped: { ...STARTER_PARTS },
    parts: Object.values(STARTER_PARTS),
    skills: [...STARTER_SKILLS],
    loadout: [...STARTER_SKILLS],
  },
  story: { level: 1, cleared: {}, seenCine: [], intro: false },
  quick: { races: 0, wins: 0, podiums: 0, best: 99, streak: 0, bestStreak: 0 },
  events: { cleared: {}, seen: [] },
  chests: [],                  // unopened chest tier ids
  stats: {
    races: 0, wins: 0, podiums: 0, dnf: 0, laps: 0,
    wrecksCaused: 0, partsOff: 0, fouls: 0, cleanFouls: 0,
    investigations: 0, finesPaid: 0, moneyEarned: 0,
    flips: 0, bestAir: 0, driftTime: 0, distance: 0, topSpeed: 0,
    chestsOpened: 0, boostsUsed: 0,
  },
  settings: {
    steer: 'drag',             // drag | tilt | buttons
    tiltSens: 1,
    invert: false,
    haptics: true,
    sfx: true,
    music: true,
    quality: 'auto',           // auto | high | low
    camShake: true,
    speedUnit: 'kmh',
    assist: true,              // extra straightening help
    highlights: true,
  },
  tutorial: { steer: false, attack: false, boost: false, steward: false },
});

export let profile = DEFAULTS();

let flushTimer = 0;

export function loadProfile() {
  if (WIPE_ARG) {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* private mode */ }
  }
  let raw = null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { raw = null; }
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      profile = migrate(parsed);
    } catch (e) {
      console.warn('[save] corrupt profile, starting fresh', e);
      profile = DEFAULTS();
    }
  }
  if (!profile.name) profile.name = pick(NAME_POOL);
  return profile;
}

// Deep-merge saved data over a fresh default so new fields always exist.
function migrate(saved) {
  const base = DEFAULTS();
  const merge = (dst, src) => {
    if (!src || typeof src !== 'object') return dst;
    for (const k of Object.keys(src)) {
      const sv = src[k];
      if (Array.isArray(sv)) dst[k] = sv.slice();
      else if (sv && typeof sv === 'object') dst[k] = merge(dst[k] && typeof dst[k] === 'object' ? dst[k] : {}, sv);
      else if (sv !== undefined) dst[k] = sv;
    }
    return dst;
  };
  const out = merge(base, saved);
  // Guard against a save that lost its starting kit.
  if (!out.garage.parts || !out.garage.parts.length) out.garage.parts = Object.values(STARTER_PARTS);
  if (!out.garage.skills || !out.garage.skills.length) out.garage.skills = [...STARTER_SKILLS];
  if (!out.garage.loadout || !out.garage.loadout.length) out.garage.loadout = out.garage.skills.slice(0, 3);
  out.garage.loadout = out.garage.loadout.filter((s) => out.garage.skills.includes(s)).slice(0, 3);
  for (const slot of Object.keys(STARTER_PARTS)) {
    if (!out.garage.equipped[slot] || !out.garage.parts.includes(out.garage.equipped[slot])) {
      out.garage.equipped[slot] = STARTER_PARTS[slot];
      if (!out.garage.parts.includes(STARTER_PARTS[slot])) out.garage.parts.push(STARTER_PARTS[slot]);
    }
  }
  return out;
}

export function saveProfile(immediate = false) {
  if (immediate) return flush();
  if (flushTimer) return;
  flushTimer = setTimeout(flush, 700);
}

function flush() {
  clearTimeout(flushTimer);
  flushTimer = 0;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(profile)); } catch (e) { /* quota / private */ }
}

window.addEventListener('pagehide', () => flush());
window.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------
export function addMoney(n) {
  profile.money = Math.max(0, Math.round(profile.money + n));
  if (n > 0) profile.stats.moneyEarned += Math.round(n);
  saveProfile();
  return profile.money;
}

export function ownPart(id) {
  if (!profile.garage.parts.includes(id)) {
    profile.garage.parts.push(id);
    saveProfile();
    return true;
  }
  return false;
}

export function ownSkill(id) {
  if (!profile.garage.skills.includes(id)) {
    profile.garage.skills.push(id);
    // First three unlocked skills auto-fill the loadout so new players never
    // race with an empty attack button.
    if (profile.garage.loadout.length < 3) profile.garage.loadout.push(id);
    saveProfile();
    return true;
  }
  return false;
}

export function equipPart(slot, id) {
  if (!profile.garage.parts.includes(id)) return false;
  profile.garage.equipped[slot] = id;
  saveProfile();
  return true;
}

export function toggleLoadout(id) {
  const lo = profile.garage.loadout;
  const i = lo.indexOf(id);
  if (i >= 0) lo.splice(i, 1);
  else if (lo.length < 3) lo.push(id);
  else return false;
  saveProfile();
  return true;
}

export function grantChest(tier) {
  profile.chests.push(tier);
  saveProfile();
}

export function takeChest() {
  const t = profile.chests.shift();
  saveProfile();
  return t || null;
}

export const playerStats = () => statsFor(profile.garage.equipped);
export const playerPower = () => powerRating(profile.garage.equipped);

// ---------------------------------------------------------------------------
// World ranking. A simulated 3.1M-driver ladder: a win takes a big bite out of
// the gap to the top, a bad race gives a little of it back.
// ---------------------------------------------------------------------------
export function applyLadder(position, fieldSize, purseTier = 1) {
  const rank = profile.rank;
  const share = 1 - (position - 1) / Math.max(1, fieldSize - 1);   // 1 = win
  let next = rank;

  if (position === 1) {
    next = rank - Math.max(1, rank * LADDER.climbWin * (0.6 + 0.4 * purseTier));
  } else if (share > 0.55) {
    next = rank - Math.max(1, rank * LADDER.climbBase * share * 2.4 * purseTier);
  } else if (share < 0.25) {
    next = rank + Math.max(1, rank * LADDER.dropLast * (0.25 - share) * 4);
  } else {
    next = rank - Math.max(0, rank * 0.012 * purseTier);
  }

  profile.rank = clamp(Math.round(next), 1, LADDER.population);
  profile.bestRank = Math.min(profile.bestRank, profile.rank);
  saveProfile();
  return profile.rank;
}

export function rankTier(rank = profile.rank) {
  if (rank <= 1) return { name: 'WORLD CHAMPION', css: '#ffd166' };
  if (rank <= 10) return { name: 'TOP TEN', css: '#ffb020' };
  if (rank <= 100) return { name: 'HEADLINER', css: '#f0932b' };
  if (rank <= 1000) return { name: 'CONTENDER', css: '#b765f0' };
  if (rank <= 10000) return { name: 'PRO CIRCUIT', css: '#4aa3ef' };
  if (rank <= 60000) return { name: 'SEMI-PRO', css: '#37c26a' };
  if (rank <= 150000) return { name: 'CLUB RACER', css: '#9fb0c0' };
  return { name: 'NOBODY', css: '#7a8794' };
}
