// Skills, XP curve and combat maths. RuneScape-flavoured but tuned brisk so
// levels come satisfyingly fast in a short session.
//
// Skills: health (HP pool), attack (melee accuracy), strength (melee power),
// defence (damage reduction + accuracy vs you), dexterity (archery), magic,
// fishing. "Woodcutting"/"firemaking" are deliberately NOT skills — they're
// gated only by owning an axe / tinderbox.

export const SKILLS = ['health', 'attack', 'strength', 'defence', 'dexterity', 'magic', 'fishing'];
export const SKILL_META = {
  health:    { name: 'Health',    icon: '❤️' },
  attack:    { name: 'Attack',    icon: '⚔️' },
  strength:  { name: 'Strength',  icon: '💪' },
  defence:   { name: 'Defence',   icon: '🛡️' },
  dexterity: { name: 'Dexterity', icon: '🏹' },
  magic:     { name: 'Magic',     icon: '🔮' },
  fishing:   { name: 'Fishing',   icon: '🎣' },
};

// cumulative XP needed to *reach* level L (1..99); brisk early curve
const THRESH = [0];
for (let L = 2; L <= 99; L++) THRESH[L - 1] = Math.round(30 * (L - 1) + 7 * Math.pow(L - 1, 2.15));
export const MAX_LEVEL = 99;

export function levelForXp(xp) {
  let L = 1;
  while (L < MAX_LEVEL && xp >= THRESH[L]) L++;
  return L;
}
export const xpToReach = (L) => THRESH[Math.min(L, MAX_LEVEL) - 1] ?? 0;
export function xpProgress(xp) {
  const L = levelForXp(xp);
  if (L >= MAX_LEVEL) return { level: L, into: 1, cur: 0, span: 1 };
  const base = xpToReach(L), next = xpToReach(L + 1);
  return { level: L, into: (xp - base) / (next - base), cur: xp - base, span: next - base };
}

// max HP scales with the Health level
export const maxHpFor = (healthLevel) => 12 + (healthLevel - 1) * 3;

// combat level (rough, for display)
export function combatLevel(lv) {
  const melee = lv.attack + lv.strength;
  const ranged = lv.dexterity * 1.5;
  const mage = lv.magic * 1.5;
  return Math.round(lv.defence * 0.25 + lv.health * 0.25 + Math.max(melee, ranged, mage) * 0.325) + 1;
}

// max hit for a style given the player's skill levels + equipped weapon bonus
export function maxHit(style, lv, weaponAtk = 0) {
  if (style === 'sword') return 2 + Math.floor(lv.strength * 0.6) + Math.floor(lv.attack * 0.2) + weaponAtk;
  if (style === 'crossbow') return 2 + Math.floor(lv.dexterity * 0.75) + weaponAtk;
  return 2 + Math.floor(lv.magic * 0.8) + weaponAtk;  // staff/magic
}

// chance an attack lands (vs an enemy "level"); your bare-handed accuracy is low
export function hitChance(style, lv, enemyLevel) {
  const acc = style === 'sword' ? lv.attack : style === 'crossbow' ? lv.dexterity : lv.magic;
  return Math.max(0.35, Math.min(0.96, 0.62 + (acc - enemyLevel) * 0.035));
}

// XP awarded for dealing `dmg` with `style`; returns {skill: xp, ...}
export function combatXp(style, dmg) {
  const base = dmg * 4;
  if (style === 'sword') return { attack: base * 0.4, strength: base * 0.4, health: base * 0.2 };
  if (style === 'crossbow') return { dexterity: base * 0.75, health: base * 0.25 };
  return { magic: base * 0.75, health: base * 0.25 };
}
