// Global tuning constants (ECONOMY §1, DESIGN §4-6).

export const BALANCE = {
  levelBase: 1.09,
  maxLevel: 60,
  combat: {
    armorK: 50,               // DR = armor / (armor + armorK * L(attackerLvl))
    maxDR: 0.85,
    weaponK: 10,              // damage *= 1 + weaponDamage / (weaponK * L(riderLvl))
    levelGapPerLevel: 0.03,   // enemy vs player level gap: +-3% dmg per level, capped
    levelGapCap: 0.3,
    shieldRegenDelay: 4,      // s without damage
    shieldRegenPct: 0.08,     // of max per s
    backstabMult: 3,          // Ghost vs unalerted / from behind
    elements: {
      kinetic: { vsShield: 1, vsHull: 1 },
      thermal: { vsShield: 1, vsHull: 1, burnPct: 0.3, burnT: 3 },
      shock: { vsShield: 1, vsHull: 1, chain: 1, chainPct: 0.5, stunBuild: 0.15 },
      ion: { vsShield: 1.5, vsHull: 0.8 },
    },
  },
  // sim: grunt TTK with average gear was ~1.0 s (ECONOMY §9 wants 1.5-4 s). Ramps in over levels 1-5 so the rental's first fights stay snappy.
  enemyHp: { start: 1.15, full: 1.5, rampTo: 5 },
  caps: {
    critChance: 0.6, critMult: 4, cdr: 0.4, movePct: 0.5, dodgeCdFloor: 0.8,
    detectFloor: 0.3, lifeSteal: 0.08, evasion: 0.5, attackSpeedPct: 1,
  },
  // sums of lootLuck / credits affixes pass through eff = x / (1 + x/150) (x in %)
  softSum: x => x / (1 + x / 150),
};

export function L(level) {
  return BALANCE.levelBase ** (Math.max(1, level) - 1);
}
export const levelScale = L;

export function enemyHpMult(level) {
  const e = BALANCE.enemyHp;
  const t = Math.min(1, Math.max(0, (level - 1) / (e.rampTo - 1)));
  return e.start + (e.full - e.start) * t;
}
