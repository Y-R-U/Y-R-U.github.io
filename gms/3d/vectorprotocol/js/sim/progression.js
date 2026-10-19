// Unit levels, ranks, ability levels, HQ skills, company level. Pure functions over save objects.
import { addMods } from './stats.js';

export const DEFAULT_ECONOMY = {
  currencies: ['credits', 'scrap', 'chips', 'arena_tokens', 'event_marks'],
  start: { credits: 500, scrap: 0, chips: 50, units: [], slots: 2 },
  xpCurve: { base: 100, growth: 1.18 },
  scrapXp: 1,
  levelCost: { creditsPerXp: 0.5 },
  levelCapByRank: [10, 20, 30, 40, 50, 60],
  startRank: { common: 0, rare: 1, epic: 2, legendary: 3 },
  maxRank: { common: 3, rare: 4, epic: 5, legendary: 5 },
  rankUp: { shards: [10, 20, 40, 80, 160], credits: [500, 2000, 6000, 15000, 40000] },
  dupeShards: { common: 10, rare: 10, epic: 10, legendary: 10 },
  abilityLevel: { max: 5, cost: { credits: [300, 1200, 4000, 10000], chips: [0, 5, 15, 40] }, capByRank: [1, 2, 3, 4, 5, 5] },
  slotUnlocks: {},
  battleXp: { perLevel: 1.0 },
  replay: { rewardMult: 0.6 },
  companyXp: { perBattle: 10, base: 200, growth: 1.25 },
  shardExchange: { to: 'chips', rate: { common: 1, rare: 1.5, epic: 2, legendary: 3 } },
};

export function econ(data) {
  if (data._econ) return data._econ;
  const e = { ...DEFAULT_ECONOMY, ...(data.economy || {}) };
  for (const k of ['start', 'xpCurve', 'levelCost', 'startRank', 'maxRank', 'rankUp', 'dupeShards', 'abilityLevel', 'battleXp', 'replay', 'companyXp']) {
    e[k] = { ...DEFAULT_ECONOMY[k], ...((data.economy || {})[k] || {}) };
  }
  Object.defineProperty(data, '_econ', { value: e, enumerable: false, configurable: true });
  return e;
}

const at = (arr, i) => (Array.isArray(arr) ? arr[Math.min(i, arr.length - 1)] : arr);

export function xpToNext(E, level) { return Math.round(E.xpCurve.base * Math.pow(E.xpCurve.growth, level - 1)); }
export function levelCap(E, rank) { return at(E.levelCapByRank, rank); }
export function maxRank(E, rarity) { return E.maxRank[rarity] ?? 5; }

// Adds xp; levels up to the rank cap. Returns levels gained. XP beyond the cap is lost.
export function addUnitXp(E, u, xp) {
  const cap = levelCap(E, u.rank);
  let gained = 0;
  if (u.level >= cap) { u.xp = 0; return 0; }
  u.xp = (u.xp || 0) + Math.max(0, Math.round(xp));
  while (u.level < cap && u.xp >= xpToNext(E, u.level)) { u.xp -= xpToNext(E, u.level); u.level++; gained++; }
  if (u.level >= cap) u.xp = 0;
  return gained;
}

// XP needed to reach the cap from where the unit is.
export function xpToCap(E, u) {
  const cap = levelCap(E, u.rank);
  let need = -(u.xp || 0);
  for (let l = u.level; l < cap; l++) need += xpToNext(E, l);
  return Math.max(0, need);
}

export function scrapCost(E, xp) { return { scrap: Math.ceil(xp / E.scrapXp), credits: Math.ceil(xp * E.levelCost.creditsPerXp) }; }

export function rankUpCost(E, u) {
  return { shards: at(E.rankUp.shards, u.rank), credits: at(E.rankUp.credits, u.rank) };
}

export function abilityCap(E, u) { return Math.min(E.abilityLevel.max, at(E.abilityLevel.capByRank, u.rank)); }
export function abilityCost(E, curLevel) {
  const i = curLevel - 1;
  return { credits: at(E.abilityLevel.cost.credits, i) || 0, chips: at(E.abilityLevel.cost.chips, i) || 0 };
}

// ---- HQ
export function hqCost(def, curLevel) {
  const c = def.cost || {};
  const out = {};
  for (const k in c) out[k] = at(c[k], curLevel) || 0;
  return out;
}
export function hqRequirementMet(data, save, def) {
  const r = def.requires;
  if (!r) return true;
  if (r.hq && (save.hq[r.hq] || 0) < (r.level || 1)) return false;
  if (r.companyLevel && save.company.level < r.companyLevel) return false;
  if (r.story && !save.story.levels[r.story]?.stars) return false;
  return true;
}
export function hqMods(data, save) {
  const m = {};
  for (const [id, lvl] of Object.entries(save.hq || {})) {
    const d = data.hq?.[id];
    if (d && lvl > 0) addMods(m, d.mods, lvl);
  }
  return m;
}
export function hqEffect(data, save, key) {
  let v = 0;
  for (const [id, lvl] of Object.entries(save.hq || {})) v += (data.hq?.[id]?.effect?.[key] || 0) * lvl;
  return v;
}

// ---- company level (cosmetic growth of the compound + some gates)
export function companyXpToNext(E, level) { return Math.round(E.companyXp.base * Math.pow(E.companyXp.growth, level - 1)); }
export function addCompanyXp(E, company, xp) {
  company.xp += xp;
  let g = 0;
  while (company.xp >= companyXpToNext(E, company.level)) { company.xp -= companyXpToNext(E, company.level); company.level++; g++; }
  return g;
}
