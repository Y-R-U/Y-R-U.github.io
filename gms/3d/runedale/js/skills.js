// Skills, the authentic RuneScape XP curve, and combat maths.
//
// Ten skills: attack (melee accuracy), strength (melee power), defence
// (damage reduction), hitpoints (HP pool = the level, starts at 10),
// woodcutting, firemaking, fishing, cooking, mining, smithing.

export const SKILLS = ['attack', 'strength', 'defence', 'hitpoints',
  'woodcutting', 'firemaking', 'fishing', 'cooking', 'mining', 'smithing'];

export const SKILL_META = {
  attack:      { name: 'Attack',      icon: '⚔️' },
  strength:    { name: 'Strength',    icon: '💪' },
  defence:     { name: 'Defence',     icon: '🛡️' },
  hitpoints:   { name: 'Hitpoints',   icon: '❤️' },
  woodcutting: { name: 'Woodcutting', icon: '🪓' },
  firemaking:  { name: 'Firemaking',  icon: '🔥' },
  fishing:     { name: 'Fishing',     icon: '🎣' },
  cooking:     { name: 'Cooking',     icon: '🍳' },
  mining:      { name: 'Mining',      icon: '⛏️' },
  smithing:    { name: 'Smithing',    icon: '🔨' },
};

// The real RS table: xp needed to REACH level L (1..99).
// delta(l) = floor((l + 300 * 2^(l/7)) / 4), cumulative, quartered at the end.
const THRESH = [0];
{
  let acc = 0;
  for (let l = 1; l < 99; l++) {
    acc += Math.floor(l + 300 * Math.pow(2, l / 7));
    THRESH[l] = Math.floor(acc / 4);            // xp to reach level l+1
  }
}
export const MAX_LEVEL = 99;

export function levelForXp(xp) {
  let L = 1;
  while (L < MAX_LEVEL && xp >= THRESH[L]) L++;
  return L;
}
export const xpToReach = (L) => THRESH[Math.min(Math.max(L, 1), MAX_LEVEL) - 1] ?? 0;
export function xpProgress(xp) {
  const L = levelForXp(xp);
  if (L >= MAX_LEVEL) return { level: L, into: 1, cur: 0, span: 1 };
  const base = xpToReach(L), next = xpToReach(L + 1);
  return { level: L, into: (xp - base) / (next - base), cur: xp - base, span: next - base };
}

// Hitpoints starts at level 10, like RS (1154 xp banked).
export const HITPOINTS_START_XP = xpToReach(10);

// max HP IS the hitpoints level
export const maxHpFor = (hpLevel) => hpLevel;

// RS combat level (melee only, no prayer): 0.25*(def+hp) + 0.325*(atk+str)
export function combatLevel(lv) {
  return Math.max(1, Math.floor(0.25 * (lv.defence + lv.hitpoints) + 0.325 * (lv.attack + lv.strength)));
}

// Max hit from strength + weapon strength bonus. Tuned brisker than real RS
// (mobs are few and sessions short) but with the same shape: bronze at str 1
// maxes 2, iron at str 20 maxes ~7.
export function maxHit(lv, weaponStr = 0) {
  return Math.max(1, Math.floor(1.5 + (lv.strength + 3) * (10 + weaponStr) / 60));
}

// chance an attack lands vs an enemy "level"
export function hitChance(lv, weaponAtk, enemyLevel) {
  return Math.max(0.35, Math.min(0.95, 0.6 + (lv.attack + weaponAtk - enemyLevel) * 0.02));
}

// XP for dealing `dmg` melee damage: 4xp split across the melee trio + 1.33 HP
export function combatXp(dmg) {
  const base = dmg * 4;
  return { attack: base * 0.4, strength: base * 0.4, defence: base * 0.2, hitpoints: dmg * 1.33 };
}

// ── gathering / processing XP + level gates (RS-flavoured rates) ────────────
export const XP = {
  chop:   { logs: 25, oak_logs: 38 },
  mine:   { copper_ore: 18, tin_ore: 18, iron_ore: 35 },
  fish:   { raw_shrimp: 10, raw_trout: 50 },
  cook:   { raw_shrimp: 30, raw_trout: 70, raw_beef: 30 },
  burn:   { logs: 40, oak_logs: 60 },     // firemaking
  smelt:  { bronze_bar: 12, iron_bar: 25 },
  smith:  25,                             // per bar used
};

export const LEVEL_REQ = {
  oak_tree: 15,       // woodcutting
  iron_rock: 15,      // mining
  trout_spot: 20,     // fishing
  cook_trout: 15,     // cooking
  iron_bar: 15,       // smithing (smelt)
};
