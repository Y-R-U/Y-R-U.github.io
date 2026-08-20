// Prices, freshness, the glut ledger and the mark sinks. SYSTEMS.md §7.

import { BARTER_TIER_XP, BARTER_TIER_VALUE, BARTER_GARNISH, FERRY, STALL_RENT, CHARMS } from './tables.js';

export const sellPrice = (V, barter, freshness = 1, glut = 1) =>
  Math.max(1, Math.round(V * (0.55 + 0.006 * barter) * freshness * glut));

export const buyPrice = (V, barter) =>
  Math.max(1, Math.round(V * Math.max(1.4, 2.0 - 0.008 * barter)));

export const sellRate = barter => 0.55 + 0.006 * barter;
export const buyRate = barter => Math.max(1.4, 2.0 - 0.008 * barter);

export const freshness = heldMinutes => Math.max(0.5, 1 - 0.025 * heldMinutes);

export const GLUT_FLOOR = 0.35;
export const GLUT_FLOOR_HIGH = 0.55;
export const GLUT_FLOOR_BARTER = 17;
export const glutFloor = barter => barter >= GLUT_FLOOR_BARTER ? GLUT_FLOOR_HIGH : GLUT_FLOOR;

export const glut = (soldToday, barter = 1) => Math.max(glutFloor(barter), 1 - 0.02 * soldToday);

export const newLedger = (day = 0) => ({ day, sold: {} });

export function rollDay(ledger, day) {
  if (day <= ledger.day) return ledger;
  return { day, sold: {} };
}

// soldToday is read before the unit is counted, so unit n sells at 1 - 0.02(n-1).
export function sellStack(ledger, { item, value, n = 1, barter = 1, freshness: f = 1, district = 'light' }) {
  const key = `${district}:${item}`;
  const sold = { ...ledger.sold };
  let marks = 0;
  const units = [];
  for (let i = 0; i < n; i++) {
    const g = glut(sold[key] || 0, barter);
    const price = sellPrice(value, barter, f, g);
    units.push({ glut: g, price });
    marks += price;
    sold[key] = (sold[key] || 0) + 1;
  }
  return { marks, units, ledger: { ...ledger, sold } };
}

export function itemTier(value) {
  let t = 0;
  while (t < BARTER_TIER_VALUE.length && value >= BARTER_TIER_VALUE[t]) t++;
  return t + 1;
}

export const transactionXp = (tier, marksMoved) =>
  Math.round(BARTER_TIER_XP[Math.min(tier, BARTER_TIER_XP.length) - 1] + BARTER_GARNISH * marksMoved);

export const HAGGLE = { bonus: 0.12, perVendorPerDay: 1, barterLevel: 7 };

export function ferryToll(legs, band) {
  const base = legs >= 2 ? FERRY.endToEnd : FERRY.adjacent;
  if (band === 'sworn') return 0;
  if (band === 'trusted') return Math.round(base * FERRY.trustedMul);
  return base;
}

export const bindingCost = tier => CHARMS.find(c => c.tier === tier)?.cost ?? 0;
export const stallRent = () => STALL_RENT;
export const gutterLoss = (carried, whiteCord = false) =>
  Math.floor(carried * (whiteCord ? 0.05 : 0.08));

export const THREADS_PER_HOUR = 4;
export const CASTS_PER_HOUR = 2000;
export const INTEGRITY_PER_HOUR = 100;

export const LEGACY_CACHE_CAP = 15000;
export const carryMarks = marks => ({
  purse: Math.min(marks, LEGACY_CACHE_CAP),
  cache: Math.max(0, marks - LEGACY_CACHE_CAP),
});
export const REAGENT_CARRY_RATE = 0.40;
