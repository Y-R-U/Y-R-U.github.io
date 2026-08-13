// Nodes, fishing, foraging, rock and cooking. SYSTEMS.md §6.

import { CATCH, FORAGE, ROCK, RESPAWN, COOKED_MUL, BURNT_VALUE, COOK_XP_MUL, BURNT_XP_MUL, ITEM_VALUE } from './tables.js';
import { roll } from './rng.js';

export function catchWeights(table, lineLevel) {
  return table.map(e => e.req > lineLevel ? 0
    : e.weight * (1 + 0.08 * Math.max(0, lineLevel - e.req))
               * (e.junk ? Math.max(0.15, 1 - 0.05 * lineLevel) : 1));
}

export const castTime = lineLevel => Math.max(1.6, 4.2 - 0.13 * lineLevel);
export const biteChance = (lineLevel, spotQuality = 0) =>
  Math.min(0.95, Math.max(0.35, 0.45 + 0.03 * lineLevel + 0.10 * spotQuality));
export const secondsPerCatch = (lineLevel, spotQuality = 0) =>
  castTime(lineLevel) / biteChance(lineLevel, spotQuality);

export const STRIKE_WINDOW = { touch: 0.9, desktop: 0.6 };

export function rollCatch(rng, reach, lineLevel) {
  const table = CATCH[reach];
  const i = roll(rng, catchWeights(table, lineLevel));
  return i < 0 ? null : table[i];
}

export function expectedCatch(reach, lineLevel) {
  const table = CATCH[reach];
  const w = catchWeights(table, lineLevel);
  const total = w.reduce((a, b) => a + b, 0);
  if (total <= 0) return { xp: 0, value: 0 };
  let xp = 0, value = 0;
  table.forEach((e, i) => { xp += e.xp * w[i] / total; value += e.value * w[i] / total; });
  return { xp, value };
}

export const SECOND_LINE_CHANCE = 0.18;

export const forageYield = forageLevel => 1 + Math.floor(forageLevel / 7);
export const rockYield = (kind, settingLevel) => ROCK[kind].yield * (settingLevel >= 3 ? 2 : 1);

export function rollForage(rng, zone, forageLevel) {
  const table = FORAGE[zone].filter(e => e.tier === 1 || forageLevel >= (e.tier - 1) * 5);
  const i = roll(rng, table.map(e => e.weight));
  return i < 0 ? null : table[i];
}

export function expectedForage(zone, forageLevel) {
  const table = FORAGE[zone].filter(e => e.tier === 1 || forageLevel >= (e.tier - 1) * 5);
  const total = table.reduce((a, e) => a + e.weight, 0);
  let xp = 0, value = 0;
  for (const e of table) { xp += e.xp * e.weight / total; value += e.value * e.weight / total; }
  return { xp, value: value * forageYield(forageLevel) };
}

export const NODE_STATES = ['ready', 'working', 'spent', 'cooling'];

export const newNode = (id, kind, opts = {}) =>
  ({ id, kind, x: 0, z: 0, region: null, tier: 1, state: 'ready', t: 0, ...opts });

export function respawnDelay(rarity, rng, forageLevel = 1) {
  const base = RESPAWN[rarity] ?? RESPAWN.common;
  return base * (0.6 + 0.4 * rng()) * (forageLevel >= 12 ? 0.65 : 1);
}

export function beginWork(node, now) {
  if (node.state !== 'ready') return node;
  return { ...node, state: 'working', t: now };
}

export function finishWork(node, now, rng, { rarity = 'common', forageLevel = 1 } = {}) {
  if (node.state !== 'working') return node;
  return { ...node, state: 'cooling', t: now + respawnDelay(rarity, rng, forageLevel) };
}

export function tickNode(node, now) {
  if (node.state === 'cooling' && now >= node.t) return { ...node, state: 'ready', t: now };
  return node;
}

export const burnChance = (hearthLevel, recipeLevel) =>
  Math.max(0.02, 0.40 - 0.055 * (hearthLevel - recipeLevel));

export const cookedValue = itemId => Math.round((ITEM_VALUE[itemId] || 0) * COOKED_MUL);
export const cookXp = (itemId, burnt) => Math.round((ITEM_VALUE[itemId] || 0) * (burnt ? BURNT_XP_MUL : COOK_XP_MUL));
export const cookHeal = hearthLevel => 18 + 6 * hearthLevel;
export const buffSeconds = hearthLevel => hearthLevel >= 12 ? 360 : hearthLevel >= 3 ? 180 : 0;
export const buffSlots = hearthLevel => hearthLevel >= 17 ? 2 : 1;

export function cook(rng, itemId, hearthLevel, recipeLevel) {
  const burnt = rng() < burnChance(hearthLevel, recipeLevel);
  return { burnt, value: burnt ? BURNT_VALUE : cookedValue(itemId), xp: cookXp(itemId, burnt), freshness: 1 };
}
