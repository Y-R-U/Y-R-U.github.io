// Damage, health, Focus and the survival maths. SYSTEMS.md §4.1–4.2, §5.

import { ENEMIES } from './tables.js';

export const power = L => 7.5 + 6 * (L - 1);
export const critChance = L => Math.min(0.30, 0.05 + 0.01 * L);
export const CRIT_MUL = 1.75;

export const enemyHp = lvl => Math.round(10 * Math.pow(lvl, 1.5));
export const enemyDamage = lvl => 2.5 + 2.6 * lvl;
export const mitigation = armour => 100 / (100 + armour);

export function resolveHit({ power, coef = 1, charge = 1, armour = 0, critChance = 0, factionMul = 1, rng }) {
  const base = coef * power * charge * factionMul;
  const mit = 100 / (100 + armour);
  const crit = rng ? rng() < critChance : false;
  return { damage: Math.max(1, Math.round(base * mit * (crit ? CRIT_MUL : 1))), crit };
}

export const expectedHit = ({ power, coef = 1, charge = 1, armour = 0, critChance = 0, factionMul = 1 }) =>
  coef * power * charge * factionMul * mitigation(armour) * (1 + critChance * (CRIT_MUL - 1));

export function tapsToKill(schoolLevel, enemy, { coef = 1, factionMul = 1 } = {}) {
  const e = typeof enemy === 'string' ? ENEMIES[enemy] : enemy;
  const per = Math.max(1, Math.round(coef * power(schoolLevel) * factionMul * mitigation(e.armour)));
  return Math.ceil(e.hp / per);
}

export const focusMax = ward => 60 + 10 * ward;
export const focusRegen = (ward, rested = false) => (6 + 0.6 * ward) * (rested ? 2 : 1);
export const RESTED_AFTER = 2.5;

export const hpMax = (ward, hearth) => 34 + 14 * ward + 4 * hearth;
export const damageTaken = (rawDamage, ward) => rawDamage * 100 / (100 + 10 * ward);
export const bitesToGutter = (ward, hearth, enemy) => {
  const e = typeof enemy === 'string' ? ENEMIES[enemy] : enemy;
  return Math.ceil(hpMax(ward, hearth) / damageTaken(e.damage, ward));
};

export const GCD = 0.40;
export const SWING_DECAY = 2.6;
export const SWING_FIRE_AT = 0.5;
export const swingSeconds = () => 1 / SWING_DECAY;
export const CHANNEL = { min: 0.35, max: 1.20 };
export const chargeMul = held => held < CHANNEL.min ? 1 : 1 + 0.8 * Math.min(1, (held - CHANNEL.min) / 0.85);

export const OVERDRAW = { guttered: 2.0, costMul: 1.6 };
export const GUTTER = { marks: 0.08, marksWithWhiteCord: 0.05, perishables: 0.5, ashSeconds: 90 };

export const packSize = grasp => 1 + Math.min(3, Math.floor(grasp / 30));
export const eliteChance = (grasp, bandLevel) =>
  Math.max(0, Math.min(0.35, 0.04 * (grasp / 10 - bandLevel)));
export const ELITE = { hp: 2.2, damage: 1.35, xp: 3, loot: 4 };

export function bolts({ ward, cost }) {
  return Math.floor(focusMax(ward) / cost);
}

// Sustained damage per second against `targets`, Focus-limited, from the §4.5 faction rules.
// Returns a relative number: only ratios between kits mean anything.
export function sustainedDps({ level, faction, targets = 1, gcd = GCD, damageMul = 1, coef = 1, armour = 0 }) {
  const f = FACTION_KIT[faction];
  const hit = coef * power(level) * mitigation(armour) * (1 + critChance(level) * (CRIT_MUL - 1)) * damageMul;
  const cps = 1 / gcd;
  const focusCps = focusRegen(level) / (8 * f.costMul);
  const rate = Math.min(cps, Math.max(cps * 0.35, focusCps));
  const struck = f.splash.slice(0, Math.max(1, Math.min(targets, f.splash.length)))
    .reduce((a, b) => a + b, 0);
  return rate * hit * struck * (1 + f.dotFraction);
}

export const FACTION_KIT = {
  light:   { costMul: 1.00, splash: [1], dotFraction: 0, boltSpeed: 28, cone: 45 * Math.PI / 180, killRefund: 0.25 },
  dark:    { costMul: 1.15, splash: [1, 0.5, 0.5], dotFraction: 0.18 / (1 / GCD), boltSpeed: 18, cone: 25 * Math.PI / 180, feed: 0.12, rotSeconds: 4 },
  neutral: { costMul: 1.00, splash: [1], dotFraction: 0, boltSpeed: 28, cone: 45 * Math.PI / 180, fieldsOnly: true },
};

export const FIELDS = {
  quicken: { radius: 3, seconds: 6, gcd: 0.30, moveMul: 1.35 },
  glut:    { radius: 3, seconds: 6, damageMul: 1.20 },
  still:   { radius: 3, seconds: 6, focusMul: 3, incomingMul: 0.60 },
};

export const ECHOES = {
  white_cord: { focusRegen: 0.12, gutterMarks: 0.05 },
  short_rope: { lowHpDamage: 0.08, rotSeconds: 5 },
  long_furrow:{ respawn: -0.20, charmSlots: 1 },
};

// SYSTEMS §8.4's levers, as multipliers over an equal-level mono-faction character.
export const NEUTRAL_LEVERS = {
  twoFields: { both: (GCD / FIELDS.quicken.gcd) * FIELDS.glut.damageMul, duty: 0.70 },
  weaponSwap: 1.15,
  echoes: 1.08,
};

export function neutralAdvantage({ weaponSwap = true, duty = NEUTRAL_LEVERS.twoFields.duty } = {}) {
  const fields = 1 + duty * (NEUTRAL_LEVERS.twoFields.both - 1);
  return fields * (weaponSwap ? NEUTRAL_LEVERS.weaponSwap : 1) * NEUTRAL_LEVERS.echoes;
}

// The gate on Neutral content. One number cannot answer it: the weapon swap is worth nothing in
// a fight where both sides are locked to the same faction, and everything in a mixed one. Each
// row is a different fight, and all three have to be far ahead for the ladder to be justified.
export const NEUTRAL_SCENARIOS = [
  { id: 'single',  targets: 1, worn: 'light', swap: false, note: 'one enemy, Grafted as Light' },
  { id: 'group',   targets: 4, worn: 'dark',  swap: false, note: 'four enemies, Grafted as Dark' },
  { id: 'mixed',   targets: 4, worn: 'dark',  swap: true,  note: 'a fight that starts single and becomes a group' },
];

export function neutralGate({ level = 17 } = {}) {
  return NEUTRAL_SCENARIOS.map(s => {
    const mono = sustainedDps({ level, faction: s.worn, targets: s.targets });
    const grafted = sustainedDps({ level, faction: s.worn, targets: s.targets })
      * neutralAdvantage({ weaponSwap: s.swap });
    return { ...s, ratio: grafted / mono };
  });
}

export function acquire(targets, camYaw, from, spell) {
  let best = null, bestCost = Infinity;
  for (const t of targets) {
    const ang = Math.abs(wrapPi(Math.atan2(t.x - from.x, t.z - from.z) - camYaw));
    const d = Math.hypot(t.x - from.x, t.z - from.z);
    if (ang > spell.cone || d > spell.range) continue;
    const cost = ang + d * 0.06;
    if (cost < bestCost) { bestCost = cost; best = t; }
  }
  return best;
}

export function wrapPi(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// Seconds to clear a group, used by the soak to turn a quest's kill list into elapsed time.
export function secondsToClear({ level, faction = 'light', enemy, count = 1, approach = 2 }) {
  const e = typeof enemy === 'string' ? ENEMIES[enemy] : enemy;
  const dps = sustainedDps({ level, faction, targets: Math.min(count, 3), armour: e.armour });
  return count * e.hp / Math.max(1, dps) + approach * count;
}
