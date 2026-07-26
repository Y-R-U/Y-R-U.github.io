// Persistent commander profile. One localStorage blob, deep-merged over the
// defaults on load so adding fields never breaks an existing save.

import { SAVE_KEY, WIPE_ARG, NAME_POOL, FIRECON } from './config.js';
import { pickRandom, clamp } from './utils.js';
import { levelFromXp, rankFromBP, CHASSIS, WEAPONS, UTILITIES, CAMOS } from './arsenal.js';

function defaults() {
  return {
    v: 1,
    name: pickRandom(NAME_POOL),
    scrap: 0,
    xp: 0,
    bp: 0,
    bestRank: rankFromBP(0),
    chassis: 'mainline',
    weapon: 'ap76',
    utility: 'repair',
    camo: 'olive',
    upgrades: { hull: 0, engine: 0, turret: 0, loader: 0, optics: 0, gunnery: 0, workshop: 0, uplink: 0 },
    weaponLevels: { ap76: 0 },
    owned: {
      chassis: ['mainline'],
      weapons: ['ap76'],
      utilities: ['repair'],
      camos: ['olive'],
      modules: [],
    },
    campaign: {},              // missionId -> { stars, bestScore, done }
    act: 1,                    // furthest act reached
    stats: {
      battles: 0, wins: 0, losses: 0, kills: 0, deaths: 0,
      shots: 0, hits: 0, props: 0, bestKills: 0, streak: 0, bestStreak: 0,
      bpEarned: 0, scrapEarned: 0, longestKill: 0, dronesLost: 0,
    },
    settings: {
      muted: false, lite: false, sens: 1, invertY: false, haptics: true,
      camAuto: true,            // let the camera ride the occasional long shot
      autoAim: true,            // use the fire-control computer when it is fitted
      cutscenes: true,          // play the story films
      aimSide: 'right',         // which half of the screen the aim thumb owns
      padSide: 'right',         // which side FIRE and the action buttons sit on
    },
    daily: { day: '', claimed: false },
    seen: { intro: false, garage: false, drone: false },
    seenCine: {},              // cutscene id -> true, so a replay is not a rerun
  };
}

function deepMerge(base, over) {
  if (!over || typeof over !== 'object') return base;
  for (const k of Object.keys(base)) {
    const b = base[k], o = over[k];
    if (Array.isArray(b)) {
      if (Array.isArray(o)) base[k] = o.slice();
    } else if (b && typeof b === 'object') {
      deepMerge(b, o);
    } else if (o !== undefined && o !== null) {
      base[k] = o;
    }
  }
  // preserve unknown keys the current build does not know about
  for (const k of Object.keys(over)) if (!(k in base)) base[k] = over[k];
  return base;
}

export const profile = defaults();

let dirty = false;

export function loadProfile() {
  if (WIPE_ARG) {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  }
  let raw = null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { /* private mode */ }
  if (raw) {
    try { deepMerge(profile, JSON.parse(raw)); } catch (e) { /* corrupt — keep defaults */ }
  }
  // guard against a save that references content this build removed
  if (!CHASSIS[profile.chassis]) profile.chassis = 'mainline';
  if (!WEAPONS[profile.weapon]) profile.weapon = 'ap76';
  if (!UTILITIES[profile.utility]) profile.utility = 'repair';
  if (!CAMOS[profile.camo]) profile.camo = 'olive';
  for (const k of Object.keys(profile.upgrades)) {
    profile.upgrades[k] = clamp(profile.upgrades[k] | 0, 0, 5);
  }
  // saves written before modules existed have no bucket at all
  if (!Array.isArray(profile.owned.modules)) profile.owned.modules = [];
  const st = profile.settings;
  if (st.aimSide !== 'left') st.aimSide = 'right';
  if (st.padSide !== 'left') st.padSide = 'right';
  return profile;
}

export function saveProfile() {
  dirty = false;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(profile)); } catch (e) { /* full */ }
}

// Batches writes so a battle full of stat bumps costs one serialise.
export function markDirty() {
  if (dirty) return;
  dirty = true;
  setTimeout(() => { if (dirty) saveProfile(); }, 400);
}

export function resetProfile() {
  // A wipe erases progress. Which thumb you aim with is not progress, and
  // having to set the controls up again after every reset would be a punishment
  // nobody asked for.
  const keep = { ...profile.settings };
  const fresh = defaults();
  for (const k of Object.keys(profile)) delete profile[k];
  Object.assign(profile, fresh);
  profile.settings = keep;
  saveProfile();
}

// ---------------------------------------------------------------------------
// Currency / progression helpers
// ---------------------------------------------------------------------------

export function addScrap(n) {
  profile.scrap += n;
  profile.stats.scrapEarned += Math.max(0, n);
  markDirty();
}

export function canAfford(n) { return profile.scrap >= n; }

export function spend(n) {
  if (profile.scrap < n) return false;
  profile.scrap -= n;
  markDirty();
  return true;
}

// Returns { level, gained } so the results screen can celebrate a level-up.
export function addXp(n) {
  const before = levelFromXp(profile.xp).level;
  profile.xp += Math.max(0, n);
  const after = levelFromXp(profile.xp);
  markDirty();
  return { level: after.level, gained: after.level - before, into: after.into, need: after.need };
}

export function commanderLevel() {
  return levelFromXp(profile.xp);
}

export function owns(kind, id) {
  return profile.owned[kind].includes(id);
}

export function hasModule(id) {
  return Array.isArray(profile.owned.modules) && profile.owned.modules.includes(id);
}

// The one rule for "does the gun lay itself", shared by the battle runner, the
// mission brief and the settings screen so they can never disagree. Bought is
// forever; otherwise there is a loaner until you have finished the act it was
// issued for — including in skirmishes taken during that time.
export function fireControlFitted(mission = null) {
  if (hasModule('firecon')) return { owned: true, trial: false, fitted: true };
  const lastTrialAct = Math.max.apply(null, FIRECON.trialActs);
  const trial = mission && mission.act
    ? FIRECON.trialActs.indexOf(mission.act) >= 0
    : (profile.act || 1) <= lastTrialAct;
  return { owned: false, trial, fitted: trial };
}

export function acquire(kind, id) {
  if (!owns(kind, id)) profile.owned[kind].push(id);
  markDirty();
}

export function worldRank() {
  return rankFromBP(profile.bp);
}

// Battle points move the ladder. Applied after every battle, campaign or not.
export function applyBP(delta) {
  const before = worldRank();
  profile.bp = Math.max(0, profile.bp + delta);
  if (delta > 0) profile.stats.bpEarned += delta;
  const after = worldRank();
  profile.bestRank = Math.min(profile.bestRank || after, after);
  markDirty();
  return { before, after, delta, bp: profile.bp };
}

export function recordBattle({ win, kills, shots, hits, props, died, longestKill }) {
  const s = profile.stats;
  s.battles++;
  if (win) { s.wins++; s.streak++; s.bestStreak = Math.max(s.bestStreak, s.streak); }
  else { s.losses++; s.streak = 0; }
  s.kills += kills || 0;
  s.shots += shots || 0;
  s.hits += hits || 0;
  s.props += props || 0;
  s.bestKills = Math.max(s.bestKills, kills || 0);
  if (died) s.deaths++;
  if (longestKill) s.longestKill = Math.max(s.longestKill, Math.round(longestKill));
  markDirty();
}

export function setMissionResult(id, stars, score) {
  const cur = profile.campaign[id] || { stars: 0, bestScore: 0, done: false };
  cur.stars = Math.max(cur.stars, stars);
  cur.bestScore = Math.max(cur.bestScore, Math.round(score));
  cur.done = cur.done || stars > 0;
  profile.campaign[id] = cur;
  markDirty();
  return cur;
}

export function missionRecord(id) {
  return profile.campaign[id] || { stars: 0, bestScore: 0, done: false };
}

export function totalStars() {
  return Object.values(profile.campaign).reduce((a, m) => a + (m.stars || 0), 0);
}

export function todayKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
         String(d.getDate()).padStart(2, '0');
}

export function dailyAvailable() {
  return profile.daily.day !== todayKey() || !profile.daily.claimed;
}

export function markDailyClaimed() {
  profile.daily.day = todayKey();
  profile.daily.claimed = true;
  markDirty();
}
