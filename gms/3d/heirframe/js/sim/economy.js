// XP curve, level-ups, credits and cost formulas (ECONOMY.md).
import { L, BALANCE } from '../data/balance.js';
import { XP, COSTS, FRAME_PRICES, FIRST_FRAME_DISCOUNT, STASH_SIZES, LEGACY_NODES, FEATURE_UNLOCKS, CONSUMABLES, SHIFT_SECONDS, RENTAL_FEE } from '../data/economy.js';
import { MK_TIERS, SYNC_NEXT } from '../data/frames.js';
import { clamp } from './util.js';

export { L, SHIFT_SECONDS, RENTAL_FEE };

export function niceRound(v) {
  if (v < 1000) return Math.round(v / 5) * 5;
  if (v < 10000) return Math.round(v / 10) * 10;
  return Math.round(v / 100) * 100;
}

export const xpNext = n => niceRound((4 + 1.2 * n) * 20 * L(n));
export const LEGACY_XP = xpNext(BALANCE.maxLevel);

export function overLevelPenalty(riderLevel, enemyLevel) {
  return clamp(1 - 0.1 * (riderLevel - enemyLevel - 2), 0.1, 1);
}

export function killXp(enemyLevel, rank, riderLevel = enemyLevel) {
  return Math.max(1, Math.round(XP.killBase * L(enemyLevel) * (XP.rankXP[rank] ?? 1) * overLevelPenalty(riderLevel, enemyLevel)));
}

// Add XP to a {level, xp, legacyXp, legacyPoints} record. Returns {levels:[newLevels...], legacy:n}.
export function addXp(p, amount) {
  const gained = { levels: [], legacy: 0 };
  p.xp += amount;
  while (p.level < BALANCE.maxLevel && p.xp >= xpNext(p.level)) {
    p.xp -= xpNext(p.level);
    p.level++;
    gained.levels.push(p.level);
  }
  if (p.level >= BALANCE.maxLevel) {
    p.legacyXp = (p.legacyXp || 0) + p.xp;
    p.xp = 0;
    while (p.legacyXp >= LEGACY_XP) { p.legacyXp -= LEGACY_XP; p.legacyPoints = (p.legacyPoints || 0) + 1; gained.legacy++; }
  }
  return gained;
}

export function totalXpForLevel(level) {
  let t = 0;
  for (let n = 1; n < level; n++) t += xpNext(n);
  return t;
}

export function featuresAt(level) { return FEATURE_UNLOCKS.filter(f => f.level <= level).map(f => f.id); }
export function newFeatures(fromLevel, toLevel) { return FEATURE_UNLOCKS.filter(f => f.level > fromLevel && f.level <= toLevel); }

// ---- sync --------------------------------------------------------------------------------
export const syncNext = SYNC_NEXT;
export function addSyncXp(frame, amount, maxSync) {
  const ups = [];
  frame.syncXp = (frame.syncXp || 0) + amount;
  while (frame.sync < maxSync && frame.syncXp >= syncNext(frame.sync)) {
    frame.syncXp -= syncNext(frame.sync);
    frame.sync++;
    ups.push(frame.sync);
  }
  if (frame.sync >= maxSync) frame.syncXp = 0;
  return ups;
}

// ---- costs -------------------------------------------------------------------------------
export function framePrice(ownedCount, { discount = false } = {}) {
  const base = FRAME_PRICES[ownedCount];
  if (base == null) return null;
  return Math.round(base * (discount && ownedCount === 0 ? 1 - FIRST_FRAME_DISCOUNT : 1));
}

export function mkUpgrade(frame, riderLevel) {
  const next = MK_TIERS[(frame.tier || 0) + 1];
  if (!next) return null;
  return { ...next, ok: riderLevel >= next.level && (frame.sync || 1) >= next.sync, needLevel: next.level, needSync: next.sync };
}

export function repairCost(missingFrac, level, repairCostPct = 0) {
  return Math.round(missingFrac * COSTS.repairPerHpFrac * L(level) * (1 + repairCostPct));
}
export const wreckCost = level => Math.round(COSTS.wreckRecovery * L(level));
export const rerollCost = level => Math.round(COSTS.reroll * L(level));
export const consumableCost = (id, level) => Math.round(COSTS[CONSUMABLES[id]?.cost ?? id] * L(level));
export const cleanSlateCost = level => Math.round(COSTS.cleanSlate * L(level));

export function nextStash(size) {
  const i = STASH_SIZES.findIndex(s => s.size === size);
  return STASH_SIZES[i + 1] || null;
}

// ---- legacy ------------------------------------------------------------------------------
// diminishing returns: ranks 1-50 full, 51-150 half, 151+ quarter
export function legacyValue(nodeId, ranks) {
  const node = LEGACY_NODES.find(n => n.id === nodeId);
  const eff = Math.min(ranks, 50) + Math.max(0, Math.min(ranks, 150) - 50) * 0.5 + Math.max(0, ranks - 150) * 0.25;
  let v = eff * node.per;
  if (node.cap != null) v = node.per < 0 ? Math.max(node.cap, v) : Math.min(node.cap, v);
  return v;
}

export function legacyStats(board = {}) {
  const out = {};
  for (const [id, ranks] of Object.entries(board)) {
    const node = LEGACY_NODES.find(n => n.id === id);
    if (node && ranks) out[node.stat] = (out[node.stat] || 0) + legacyValue(id, ranks);
  }
  return out;
}

// "next goal" chip (ECONOMY §7): cheapest unmet big want
export function nextGoal(state) {
  const wants = [];
  const owned = state.frames.filter(f => !f.rental).length;
  const price = framePrice(owned, { discount: state.flags?.firstFrameDiscount });
  if (price != null && state.player.level >= 5) wants.push({ id: 'frame', label: `Frame licence (${owned + 1}/3)`, cost: price });
  for (const f of state.frames.filter(x => !x.rental)) {
    const mk = mkUpgrade(f, state.player.level);
    if (mk?.ok) wants.push({ id: 'mk:' + f.uid, label: `${f.name} ${mk.name}`, cost: mk.cost });
  }
  const ns = nextStash(state.stashSize);
  if (ns && state.stash.length > state.stashSize * 0.8) wants.push({ id: 'stash', label: `Stash ${ns.size}`, cost: ns.cost });
  if (!wants.length) return null;
  wants.sort((a, b) => a.cost - b.cost);
  const w = wants[0];
  return { ...w, progress: clamp(state.credits / w.cost, 0, 1) };
}
