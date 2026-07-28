// upgrades.js — two economies.
//   PERM  : bought on the home screen with SUBS, kept forever.
//   BOONS : drafted mid-run when the audience crosses a viewer milestone,
//           gone the moment the broadcast ends.

import { S } from './save.js';

// ── permanent ───────────────────────────────────────────────────────────────

export const PERM = [
  {
    id: 'rig', name: 'Rig Capacity', icon: '⬛', max: 5, base: 120,
    desc: 'The Guild issues you a wider aperture. Start each broadcast bigger.',
    detail: (l) => `+${[0, 6, 16, 34, 70, 130][l]} starting mass`,
  },
  {
    id: 'retention', name: 'Retention Algorithm', icon: '📈', max: 5, base: 180,
    desc: 'Viewers stick around longer between highlights.',
    detail: (l) => `−${l * 9}% hype decay`,
  },
  {
    id: 'tidal', name: 'Tidal Lensing', icon: '🌀', max: 5, base: 150,
    desc: 'Widens the gravity well so loose matter drifts in on its own.',
    detail: (l) => `+${l * 8}% pull range`,
  },
  {
    id: 'sponsor', name: 'Sponsor Cut', icon: '💠', max: 5, base: 200,
    desc: 'Negotiate a better share of the ad revenue.',
    detail: (l) => `+${l * 13}% SUBS earned`,
  },
  {
    id: 'thruster', name: 'Thruster Tuning', icon: '🚀', max: 5, base: 140,
    desc: 'The satellite slews faster across the surface.',
    detail: (l) => `+${l * 5}% move speed`,
  },
  {
    id: 'warm', name: 'Warm Open', icon: '🔥', max: 4, base: 220,
    desc: 'Open the show with an audience already hyped.',
    detail: (l) => `+${(l * 0.3).toFixed(1)} starting hype`,
  },
  {
    id: 'casing', name: 'Hardened Casing', icon: '🛡', max: 4, base: 240,
    desc: 'Planetary defences knock less of your audience loose.',
    detail: (l) => `−${l * 18}% hazard damage`,
  },
  {
    id: 'trending', name: 'Trending Tab', icon: '🔮', max: 3, base: 340,
    desc: 'Better sponsor offers, and at level 3 a fourth one to pick from.',
    detail: (l) => (l >= 3 ? 'Rare offers ×2.2, +1 choice' : `Rare offers ×${(1 + l * 0.4).toFixed(1)}`),
  },
  {
    id: 'airtime', name: 'Extra Airtime', icon: '⏱', max: 5, base: 190,
    desc: 'The Guild books you a longer slot on every contract.',
    detail: (l) => `+${l * 8}s on timed jobs`,
  },
  {
    id: 'backup', name: 'Backup Feed', icon: '📡', max: 2, base: 500,
    desc: 'If the signal drops, a mirror feed brings you straight back.',
    detail: (l) => `${l} signal restore${l === 1 ? '' : 's'} per run`,
  },
];

export const PERM_BY_ID = Object.fromEntries(PERM.map((p) => [p.id, p]));

export function permLevel(id) { return (S().perm[id] | 0) || 0; }
export function permCost(def, level) {
  return Math.round(def.base * Math.pow(2.05, level));
}
export function canBuy(def) {
  const l = permLevel(def.id);
  return l < def.max && S().subs >= permCost(def, l);
}
export function buy(def) {
  const l = permLevel(def.id);
  if (l >= def.max) return false;
  const c = permCost(def, l);
  const s = S();
  if (s.subs < c) return false;
  s.subs -= c;
  s.perm[def.id] = l + 1;
  return true;
}

/** Collapse the permanent tree into the numbers the run actually reads. */
export function permMods() {
  const L = (id) => permLevel(id);
  return {
    startMass: [0, 6, 16, 34, 70, 130][L('rig')] || 0,
    hypeDecayMul: 1 - L('retention') * 0.09,
    pullMul: 1 + L('tidal') * 0.08,
    subsMul: 1 + L('sponsor') * 0.13,
    speedMul: 1 + L('thruster') * 0.05,
    startHype: L('warm') * 0.3,
    hazardMul: 1 - L('casing') * 0.18,
    rareMul: L('trending') >= 3 ? 2.2 : 1 + L('trending') * 0.4,
    boonChoices: L('trending') >= 3 ? 4 : 3,
    extraTime: L('airtime') * 8,
    revives: L('backup'),
  };
}

// ── in-run boons ────────────────────────────────────────────────────────────
// rarity: 0 common, 1 uncommon, 2 rare
// mods are multiplied/added into run.mods; hooks fire from the run loop.

export const BOONS = [
  { id: 'devour', name: 'Devourer', icon: '🍽', rarity: 0, stack: 4,
    desc: 'Everything you swallow is worth +22% mass.',
    mods: (m) => { m.massMul *= 1.22; } },
  { id: 'widen', name: 'Void Widening', icon: '⭕', rarity: 0, stack: 4,
    desc: 'The event horizon runs 7% wider.',
    mods: (m) => { m.radiusMul *= 1.07; } },
  { id: 'thrust', name: 'Overclock', icon: '⚡', rarity: 0, stack: 4,
    desc: '+16% slew speed.',
    mods: (m) => { m.speedMul *= 1.16; } },
  { id: 'reach', name: 'Long Reach', icon: '🧲', rarity: 0, stack: 3,
    desc: 'Pull range +18%.',
    mods: (m) => { m.pullMul *= 1.18; } },
  { id: 'cascade', name: 'Cascade Editing', icon: '✂️', rarity: 0, stack: 3,
    desc: 'Combo window +55%.',
    mods: (m) => { m.comboWindow *= 1.55; } },
  { id: 'sticky', name: 'Sticky Audience', icon: '🍯', rarity: 0, stack: 3,
    desc: 'Hype drains 30% slower.',
    mods: (m) => { m.hypeDecayMul *= 0.7; } },
  { id: 'loud', name: 'Loud Reactions', icon: '📢', rarity: 0, stack: 3,
    desc: 'Every swallow gives +40% hype.',
    mods: (m) => { m.hypeGainMul *= 1.4; } },

  { id: 'chain', name: 'Chain Reaction', icon: '💥', rarity: 1, stack: 2,
    desc: 'Swallowing something tier 3+ yanks everything nearby toward you.',
    hook: 'chain' },
  { id: 'collector', name: 'Auto-Collector', icon: '🧹', rarity: 1, stack: 2,
    desc: 'Debris two tiers below you gets hoovered from 2× the distance.',
    mods: (m) => { m.collector += 1; } },
  { id: 'adbreak', name: 'Ad Break', icon: '📺', rarity: 1, stack: 3,
    desc: 'Every 16s, a sponsor spot dumps a burst of hype into the feed.',
    hook: 'adbreak' },
  { id: 'frenzy', name: 'Feeding Frenzy', icon: '🩸', rarity: 1, stack: 2,
    desc: 'Each swallow adds +3% speed for 4s, stacking up to +45%.',
    hook: 'frenzy' },
  { id: 'starpower', name: 'Star Power', icon: '⭐', rarity: 1, stack: 2,
    desc: 'Landmarks and megaliths pay double mass and double hype.',
    mods: (m) => { m.bigMul *= 2; } },
  { id: 'shielding', name: 'Signal Shielding', icon: '🛰', rarity: 1, stack: 2,
    desc: 'Defence hits cost you half as much, and stun you half as long.',
    mods: (m) => { m.hazardMul *= 0.5; } },
  { id: 'scavenger', name: 'Scavenger Feed', icon: '♻️', rarity: 1, stack: 3,
    desc: 'Anything a rival eats also pays you 30% of its mass.',
    mods: (m) => { m.scavenge += 0.3; } },
  { id: 'panic', name: 'Panic Broadcast', icon: '😱', rarity: 1, stack: 2,
    desc: 'Fleeing traffic and critters are worth triple hype — chase them.',
    mods: (m) => { m.moverHypeMul *= 3; } },

  { id: 'tierskip', name: 'Overdraft', icon: '⏫', rarity: 2, stack: 1,
    desc: 'You can swallow one tier above your size. The Guild will bill you later.',
    mods: (m) => { m.tierSkip += 1; } },
  { id: 'nova', name: 'Collapse Pulse', icon: '🌟', rarity: 2, stack: 2,
    desc: 'Every 12s a shockwave flattens and drags in everything within 3× your radius.',
    hook: 'nova' },
  { id: 'viral', name: 'Gone Viral', icon: '🔥', rarity: 2, stack: 1,
    desc: 'Hype ceiling raised to 4.0 — a truly enormous audience is now possible.',
    mods: (m) => { m.hypeMax = 4.0; } },
  { id: 'parasite', name: 'Parasite Feed', icon: '🦠', rarity: 2, stack: 1,
    desc: 'Touching a rival smaller than you drains a third of their mass into yours.',
    mods: (m) => { m.parasite = 1; } },
  { id: 'eternal', name: 'Evergreen Content', icon: '🌲', rarity: 2, stack: 1,
    desc: 'Hype never falls below 1.0 once you have earned it.',
    mods: (m) => { m.hypeFloor = 1.0; } },
];

export const BOON_BY_ID = Object.fromEntries(BOONS.map((b) => [b.id, b]));

export function defaultMods(pm) {
  return {
    massMul: 1, radiusMul: 1, speedMul: pm.speedMul, pullMul: pm.pullMul,
    comboWindow: 1, hypeDecayMul: pm.hypeDecayMul, hypeGainMul: 1,
    bigMul: 1, hazardMul: pm.hazardMul, moverHypeMul: 1,
    collector: 0, tierSkip: 0, scavenge: 0, parasite: 0,
    hypeMax: null, hypeFloor: 0,
  };
}

/** Draw `n` offers, respecting stack caps and the Trending Tab rare boost. */
export function drawBoons(rng, taken, n, rareMul) {
  const pool = [];
  for (const b of BOONS) {
    const have = taken[b.id] || 0;
    if (have >= b.stack) continue;
    let w = b.rarity === 0 ? 10 : b.rarity === 1 ? 4.5 : 1.4 * (rareMul || 1);
    if (have > 0) w *= 0.55;
    pool.push([b, w]);
  }
  const out = [];
  for (let i = 0; i < n && pool.length; i++) {
    const pick = rng.weighted(pool);
    out.push(pick);
    const idx = pool.findIndex((p) => p[0] === pick);
    pool.splice(idx, 1);
  }
  return out;
}
