// Wallet ops and recruitment rolls.
import { RARITIES } from './constants.js';

export function canAfford(wallet, cost) {
  for (const k in cost || {}) if ((cost[k] || 0) > (wallet[k] || 0)) return false;
  return true;
}
export function spend(wallet, cost) {
  if (!canAfford(wallet, cost)) return false;
  for (const k in cost || {}) wallet[k] = (wallet[k] || 0) - (cost[k] || 0);
  return true;
}
export function grant(wallet, add, mult = 1) {
  for (const k in add || {}) if (typeof add[k] === 'number') wallet[k] = (wallet[k] || 0) + Math.round(add[k] * mult);
}

// Recruit: returns {def, rarity}. pityState {sinceEpic, sinceLegendary} is mutated.
// `available(id)` (optional) filters the pool further (e.g. units gated by a story clear).
// pool 'all' skips `bannerOnly` units; those appear only in banners that list them.
export function rollRecruit(data, banner, rng, pityState = {}, available = null) {
  const pool = (banner.pool === 'all' || !banner.pool ? Object.keys(data.units).filter((id) => !data.units[id].bannerOnly) : banner.pool)
    .filter((id) => data.units[id] && !data.units[id].noRecruit && (!available || available(id)));
  const byR = {};
  for (const id of pool) (byR[data.units[id].rarity] ||= []).push(id);
  const rates = {};
  for (const r of RARITIES) if (byR[r] && banner.rates?.[r]) rates[r] = banner.rates[r];
  pityState.sinceEpic = (pityState.sinceEpic || 0) + 1;
  pityState.sinceLegendary = (pityState.sinceLegendary || 0) + 1;
  let rarity;
  if (banner.pity?.legendary && byR.legendary && pityState.sinceLegendary >= banner.pity.legendary) rarity = 'legendary';
  else if (banner.pity?.epic && byR.epic && pityState.sinceEpic >= banner.pity.epic) rarity = 'epic';
  else rarity = rng.weighted(rates);
  if (rarity === 'legendary') { pityState.sinceLegendary = 0; pityState.sinceEpic = 0; }
  if (rarity === 'epic') pityState.sinceEpic = 0;
  const list = byR[rarity];
  const feat = (banner.featured || []).filter((id) => list.includes(id));
  const def = feat.length && rng.chance(banner.featuredRate ?? 0.5) ? rng.pick(feat) : rng.pick(list);
  return { def, rarity };
}
