// Persistent profile. One object in localStorage, written through a debounced
// flush so a race can bump counters every frame without thrashing storage.

import { SAVE_KEY, WIPE_ARG, LADDER, NAME_POOL, LIVERY as LIVERY_LIST } from './config.js';
import {
  STARTER_PARTS, STARTER_SKILLS, statsFor, powerRating, partById, skillById,
  MAX_LEVEL, upgradeCost, PRIZE_ITEMS,
} from './arsenal.js';
import { CARS, CAR_BY_ID, carById, STARTER_CAR, carStats, bodyStyleOf } from './cars.js';
import { pick, clamp } from './utils.js';

const DEFAULTS = () => ({
  v: 2,
  name: '',
  money: 3200,
  rank: LADDER.startRank,
  bestRank: LADDER.startRank,
  livery: -1,                  // -1 = however the car left the factory

  fame: 0,                     // lifetime hype, unlocks flavour on the ladder
  car: STARTER_CAR,
  cars: [STARTER_CAR],
  team: { level: 1 },
  tracks: [],                  // circuit licences bought outright
  wins: {},                    // trackId / 'ev:id' → times won
  garage: {
    equipped: { ...STARTER_PARTS },
    parts: Object.values(STARTER_PARTS),
    skills: [...STARTER_SKILLS],
    loadout: [...STARTER_SKILLS],
    levels: {},                // itemId → mark 1..5
  },
  story: { level: 1, cleared: {}, seenCine: [], intro: false },
  quick: { races: 0, wins: 0, podiums: 0, best: 99, streak: 0, bestStreak: 0 },
  events: { cleared: {}, seen: [] },
  titles: {},                  // bracket state per title series
  memories: [],                // replays the player chose to keep
  grudges: {},                 // drivers you have wrecked, and how often
  bet: null,                   // an open side bet on your next result
  dryCrates: 0,                // crates in a row that produced nothing good
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
    attract: true,             // a race running behind the menus
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
  out.garage.levels = out.garage.levels || {};
  for (const slot of Object.keys(STARTER_PARTS)) {
    if (!out.garage.equipped[slot] || !out.garage.parts.includes(out.garage.equipped[slot])) {
      out.garage.equipped[slot] = STARTER_PARTS[slot];
      if (!out.garage.parts.includes(STARTER_PARTS[slot])) out.garage.parts.push(STARTER_PARTS[slot]);
    }
  }
  // A save from before the showroom existed still has to have a car in it.
  if (!out.cars || !out.cars.length) out.cars = [STARTER_CAR];
  if (!CAR_BY_ID[out.car] || !out.cars.includes(out.car)) out.car = out.cars[0] || STARTER_CAR;
  if (!out.team || !out.team.level) out.team = { level: 1 };
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

// ---------------------------------------------------------------------------
// Buying, upgrading and owning
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Grudges. Wreck somebody and they remember it after the chequered flag — the
// series is small and the drivers all know each other. A driver you have put
// out twice will be on your grid again, angrier, and looking for you.
// ---------------------------------------------------------------------------
export function addGrudge(name, team, livery) {
  if (!name) return;
  const g = profile.grudges[name] || (profile.grudges[name] = { team, livery, wrecks: 0, since: Date.now() });
  g.wrecks++;
  g.team = team || g.team;
  if (livery) g.livery = livery;
  // Somebody has to be forgotten eventually, or the grid never changes again.
  const names = Object.keys(profile.grudges);
  if (names.length > 12) {
    names.sort((a, b) => profile.grudges[a].wrecks - profile.grudges[b].wrecks);
    delete profile.grudges[names[0]];
  }
  saveProfile();
}

export function pickGrudge() {
  const names = Object.keys(profile.grudges);
  if (!names.length) return null;
  // The one you have wronged most is the one most likely to turn up.
  names.sort((a, b) => profile.grudges[b].wrecks - profile.grudges[a].wrecks);
  const pool = names.slice(0, 4);
  const name = pool[Math.floor(Math.random() * pool.length)];
  return { name, ...profile.grudges[name] };
}

export const owns = (id) =>
  profile.garage.parts.includes(id) || profile.garage.skills.includes(id);

export const itemById = (id) => partById(id) || skillById(id);

// One entry point for "can I have this", so the shop, the crate opener and the
// prize checker can never disagree about what counts as owned.
export function buyItem(id) {
  const item = itemById(id);
  if (!item || item.src !== 'shop' || owns(id)) return false;
  if (profile.money < item.price) return false;
  profile.money -= item.price;
  if (partById(id)) ownPart(id); else ownSkill(id);
  saveProfile(true);
  return true;
}

export const levelOf = (id) => clamp(profile.garage.levels[id] || 1, 1, MAX_LEVEL);

export function nextUpgradeCost(id) {
  const item = itemById(id);
  const lvl = levelOf(id);
  if (!item || lvl >= MAX_LEVEL) return 0;
  return upgradeCost(item, lvl);
}

// A mark handed over rather than bought — what a duplicate out of a crate is
// worth. Returns how many marks actually landed, which is 0 once the thing is
// at MAX_LEVEL and the crate has to pay in cash instead.
export function markUp(id, n = 1) {
  if (!owns(id)) return 0;
  const from = levelOf(id);
  const to = clamp(from + n, 1, MAX_LEVEL);
  if (to === from) return 0;
  profile.garage.levels[id] = to;
  saveProfile();
  return to - from;
}

export function upgradeItem(id) {
  const cost = nextUpgradeCost(id);
  if (!cost || !owns(id) || profile.money < cost) return false;
  profile.money -= cost;
  profile.garage.levels[id] = levelOf(id) + 1;
  saveProfile(true);
  return true;
}

export const ownedCars = () => CARS.filter((c) => (profile.cars || []).includes(c.id));
export const ownsCar = (id) => (profile.cars || []).includes(id);
export const activeCar = () => carById(ownsCar(profile.car) ? profile.car : STARTER_CAR);

export function buyCar(id) {
  const c = CAR_BY_ID[id];
  if (!c || c.src !== 'shop' || ownsCar(id) || profile.money < c.price) return false;
  profile.money -= c.price;
  profile.cars.push(id);
  profile.car = id;
  saveProfile(true);
  return true;
}

export function grantCar(id) {
  if (!CAR_BY_ID[id] || ownsCar(id)) return false;
  profile.cars.push(id);
  saveProfile();
  return true;
}

export function selectCar(id) {
  if (!ownsCar(id)) return false;
  profile.car = id;
  saveProfile();
  return true;
}

// ---------------------------------------------------------------------------
// Prizes. Anything gated on "win this" is handed over the moment the condition
// becomes true, wherever that happens — so a prize can never be missed by
// finishing a race from an odd screen or quitting before a results card.
// ---------------------------------------------------------------------------
export function checkPrizes(conditionMet) {
  const won = [];
  for (const p of PRIZE_ITEMS) {
    if (owns(p.id) || !conditionMet(p.cond)) continue;
    if (p.kind === 'part') ownPart(p.id); else ownSkill(p.id);
    won.push({ kind: p.kind, id: p.id, name: p.name });
  }
  for (const c of CARS) {
    if (c.src !== 'prize' || ownsCar(c.id) || !c.unlock || !conditionMet(c.unlock)) continue;
    profile.cars.push(c.id);
    won.push({ kind: 'car', id: c.id, name: c.name });
  }
  if (won.length) saveProfile(true);
  return won;
}

export const playerStats = () =>
  statsFor(profile.garage.equipped, profile.garage.levels, carStats(activeCar().id));
export const playerPower = () => powerRating(profile.garage.equipped, profile.garage.levels);
export const playerStyle = () => bodyStyleOf(activeCar().id);

// livery -1 means "however it left the factory", which is how a car you just
// bought should look until you decide otherwise. The white starter saloon is
// the whole reason this exists.
export function playerLivery() {
  const car = activeCar();
  if (profile.livery == null || profile.livery < 0) {
    return { body: car.body, trim: car.trim, name: 'Factory' };
  }
  return LIVERY_LIST[profile.livery % LIVERY_LIST.length];
}

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
