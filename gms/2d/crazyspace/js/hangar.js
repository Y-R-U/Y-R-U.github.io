// hangar.js — permanent player-only upgrades bought with credits.
//
//   crazyspace.hangar.v1   { v, credits, lifetimeCredits, levels: { hull: 0..8, … } }
//
// Same rules as save.js: load-with-defaults merging unknown keys forward, every
// value sanitised on load (a synced save is never trusted), and credits are only
// ever granted from the results screen of a FINISHED match.

import {
  UPGRADES, HANGAR_MAX, UPGRADE_COST, UPGRADE_COST_MULT, HEADSTART, AIM_ASSIST, CREDITS,
} from './config.js';

export const HANGAR_KEY = 'crazyspace.hangar.v1';
const KEYS = UPGRADES.map(u => u.key);

export function hangarDefaults() {
  const levels = {};
  for (const k of KEYS) levels[k] = 0;
  return { v: 1, credits: 0, lifetimeCredits: 0, levels };
}

const isPlain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);
const clampLevel = v => Math.max(0, Math.min(HANGAR_MAX, Math.floor(num(v))));

function sanitise(stored) {
  const h = hangarDefaults();
  if (!isPlain(stored)) return h;
  for (const k of Object.keys(stored)) if (!(k in h)) h[k] = stored[k];   // carry unknown keys forward
  h.credits = Math.max(0, Math.floor(num(stored.credits)));
  h.lifetimeCredits = Math.max(h.credits, Math.floor(num(stored.lifetimeCredits)));
  const lv = isPlain(stored.levels) ? stored.levels : {};
  for (const k of Object.keys(lv)) if (!(k in h.levels)) h.levels[k] = lv[k];
  for (const k of KEYS) h.levels[k] = clampLevel(lv[k]);
  return h;
}

let hangar = null;

export function loadHangar() {
  if (!hangar) {
    let stored = null;
    try { const raw = localStorage.getItem(HANGAR_KEY); stored = raw ? JSON.parse(raw) : null; } catch (e) { stored = null; }
    hangar = sanitise(stored);
  }
  return hangar;
}

export function saveHangar() {
  try { localStorage.setItem(HANGAR_KEY, JSON.stringify(loadHangar())); } catch (e) { /* private mode */ }
  return hangar;
}

export function upgradeCost(key, level) {
  if (level < 1 || level > HANGAR_MAX) return Infinity;
  return Math.round(UPGRADE_COST[level] * (UPGRADE_COST_MULT[key] || 1) / 5) * 5;
}

export function totalCostToMax() {
  let t = 0;
  for (const k of KEYS) for (let L = 1; L <= HANGAR_MAX; L++) t += upgradeCost(k, L);
  return t;
}

/** Buy the next level of `key`. Returns true on success. */
export function buyUpgrade(key) {
  const h = loadHangar();
  if (!KEYS.includes(key)) return false;
  const next = h.levels[key] + 1;
  const cost = upgradeCost(key, next);
  if (next > HANGAR_MAX || h.credits < cost) return false;
  h.credits -= cost;
  h.levels[key] = next;
  saveHangar();
  return true;
}

export function diffKeyFor(skill) {
  return skill < 0.5 ? 'rookie' : skill < 0.75 ? 'veteran' : 'ace';
}

/** Credits for one FINISHED match summary (see Game.matchSummary). */
export function creditsFor(summary, diffKey = 'veteran') {
  const C = CREDITS;
  const n = v => Math.max(0, num(v));
  const minutes = Math.min(n(summary.playSec), 1800) / 60;
  let c = C.floor + minutes * C.perMinute + n(summary.kills) * C.perKill
    + n(summary.caps) * C.perCap + n(summary.returns) * C.perReturn
    + n(summary.holdSec) * C.perHoldSec;
  if (summary.won) c += C.win;
  c *= C.diffMult[diffKey] || 1;
  return Math.max(0, Math.round(c));
}

/** Called once from the results screen of a finished match. */
export function awardCredits(amount) {
  const h = loadHangar();
  const a = Math.max(0, Math.floor(num(amount)));
  h.credits += a;
  h.lifetimeCredits += a;
  saveHangar();
  return a;
}

/** Test / dev hook: overwrite levels (clamped) and credits. */
export function setHangar(patch = {}) {
  const h = loadHangar();
  if (isPlain(patch.levels)) for (const k of KEYS) if (k in patch.levels) h.levels[k] = clampLevel(patch.levels[k]);
  if ('credits' in patch) h.credits = Math.max(0, Math.floor(num(patch.credits)));
  saveHangar();
  return h;
}

export function upgradeCount(h = loadHangar()) {
  let n = 0;
  for (const k of KEYS) n += h.levels[k] || 0;
  return n;
}

/**
 * Turn hangar levels into the concrete multipliers a player Ship reads.
 * `levels` may be null → no upgrades at all.
 */
export function hangarEffects(levels) {
  const L = k => clampLevel(levels && levels[k]);
  const eff = k => UPGRADES.find(u => u.key === k).eff[L(k)];
  return {
    hull: eff('hull'),
    reactor: eff('reactor'),
    engines: eff('engines'),
    guns: eff('guns'),
    bombs: eff('bombs'),
    headstart: HEADSTART[L('headstart')],
    shield: eff('shield'),
    aim: AIM_ASSIST[L('aim')],
  };
}
