// Every number the player reads that carries a unit goes through here. Nothing else in the
// codebase writes a currency symbol or a unit label of its own.
//
// Currency is a SYMBOL ONLY — it is game money, so there is no conversion and no exchange rate.
//
// World scale (the manager's ruling): 1 world unit = 10 ft = 3 m. That makes PHYS.ceiling 2400
// read as a 24,000 ft / 7,200 m service ceiling, which is period-plausible and a round number.
// The scale applies to CAMERA-space quantities — altitude and map length. It deliberately does
// NOT apply to sprite-space sizes (a 120-unit aeroplane is not 1,200 ft long), so blast radius
// and the like stay bare stats rather than asserting a physical size that is not true.

import { prefs, setPref } from './prefs.js';

export const WORLD_FT = 10;
export const WORLD_M = 3;

export const CURRENCIES = [
  { id: 'gbp', label: '£', sym: '£', name: 'Pounds' },
  { id: 'usd', label: '$', sym: '$', name: 'Dollars' },
  { id: 'eur', label: '€', sym: '€', name: 'Euros' },
  { id: 'jpy', label: '¥', sym: '¥', name: 'Yen' },
  { id: 'cr', label: 'CR', sym: '', suffix: ' cr', name: 'Credits' },
];

// `k` scales the raw stat the hangar already shows. mph is 1:1 with it, so switching the
// default unit changes the label and nothing else; the other two convert from that.
export const SPEED_UNITS = [
  { id: 'mph', label: 'mph', name: 'Miles per hour', k: 1 },
  { id: 'kmh', label: 'km/h', name: 'Kilometres per hour', k: 1.609344 },
  { id: 'kn', label: 'kn', name: 'Knots', k: 0.868976 },
];

export const ALT_UNITS = [
  { id: 'ft', label: 'ft', name: 'Feet', k: WORLD_FT, step: 100 },
  { id: 'm', label: 'm', name: 'Metres', k: WORLD_M, step: 50 },
];

const DIST = {
  mph: { label: 'mi', per: WORLD_FT / 5280 },
  kmh: { label: 'km', per: WORLD_M / 1000 },
  kn: { label: 'nmi', per: WORLD_M / 1852 },
};

const byId = (list, id, fallback) => list.find((r) => r.id === id) || list.find((r) => r.id === fallback) || list[0];

export function currency() { return byId(CURRENCIES, prefs.currency, 'gbp'); }
export function speedUnit() { return byId(SPEED_UNITS, prefs.speedUnit, 'mph'); }
export function altUnit() { return byId(ALT_UNITS, prefs.altUnit, 'ft'); }

export function setCurrency(id) { setPref('currency', id); }
export function setSpeedUnit(id) { setPref('speedUnit', id); }
export function setAltUnit(id) { setPref('altUnit', id); }

/* ------------------------------------------------------------------- money */

/** Grouped digits, no symbol. Hand-rolled because the HUD formats every frame. */
export function group(n) {
  const v = Math.round(Math.abs(n || 0));
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function cashSym() { return currency().sym; }

/** cash(4820) -> "£4,820" or "4,820 cr". `plus` prefixes a + inside the symbol. */
export function cash(n, opts) {
  const c = currency();
  const sign = opts && opts.plus ? '+' : '';
  return sign + c.sym + group(n) + (c.suffix || '');
}

/* ------------------------------------------------------------------- speed */

export function speedVal(raw) { return (raw || 0) * speedUnit().k; }
export function speedLabel() { return speedUnit().label; }
export function speedText(raw, dp = 0) { return group(speedVal(raw).toFixed(dp)) + ' ' + speedUnit().label; }

/* ---------------------------------------------------------------- altitude */

/** World y -> the player's chosen altitude unit, rounded to that unit's readable step. */
export function altVal(worldY) {
  const u = altUnit();
  const v = (worldY || 0) * u.k;
  return Math.round(v / u.step) * u.step;
}
export function altLabel() { return altUnit().label; }
export function altText(worldY) { return group(altVal(worldY)) + ' ' + altUnit().label; }

/* ---------------------------------------------------------------- distance */

/** Map length, in the family that matches the chosen speed unit. */
export function distText(worldUnits) {
  const d = DIST[speedUnit().id] || DIST.mph;
  const v = (worldUnits || 0) * d.per;
  return (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10) + ' ' + d.label;
}

/* ------------------------------------------------------------------- misc */

/** m:ss, kept here so screens have one place to ask for a formatted quantity. */
export function secs(t) {
  const s = Math.max(0, Math.round(t || 0));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
