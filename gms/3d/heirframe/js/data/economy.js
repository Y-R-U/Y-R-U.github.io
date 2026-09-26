// ECONOMY.md tables. Any constant changed by the balance sim is marked `// sim:` with the reason in docs/notes/systems.md.

export const XP = {
  killBase: 2.5,                     // sim: 3 -> 2.5. × L(enemyLvl) × rankXP
  rankXP: { grunt: 1, veteran: 3, elite: 8, champion: 25, boss: 80 },
  firstContractXP: 120,
  legacyXP: null,                    // filled at runtime = xpNext(60)
};

export const RANK_CREDITS = {       // [chance, base × L]
  grunt: [0.4, 3], veteran: [0.6, 6], elite: [1, 15], champion: [1, 40], boss: [1, 120],
};

export const FEATURE_UNLOCKS = [
  { level: 1, id: 'board6', desc: 'Contract board: 6 slots, Street grade' },
  { level: 3, id: 'brightline', desc: 'Brightline Boulevard' },
  { level: 5, id: 'pro', desc: 'Pro contracts, buying frames' },
  { level: 8, id: 'recalibrate', desc: 'Recalibrate at the Fabricator' },
  { level: 10, id: 'board7', desc: 'Board: 7 slots, Hostile threat, stash 90' },
  { level: 15, id: 'elite', desc: 'Elite contracts, Relic drops' },
  { level: 20, id: 'board8', desc: 'Board: 8 slots' },
  { level: 25, id: 'lethal', desc: 'Lethal threat' },
  { level: 40, id: 'nightmare', desc: 'Nightmare threat' },
  { level: 60, id: 'overclock', desc: 'Overclock and Legacy' },
];

export const SHIFT_SECONDS = 24 * 60;
export const RENTAL_FEE = 100;
export const WARRANTY_SURCHARGE = 0.1;
export const FRAME_PRICES = [1500, 12000, 50000];
export const FIRST_FRAME_DISCOUNT = 0.3;   // A1-M4 story nudge

export const COSTS = {
  repairPerHpFrac: 60,        // × missingHPfrac × L
  wreckRecovery: 150,         // × L (owned frames only)
  repairKit: 20, signalJammer: 60, decoyDrone: 30, cleanSlate: 150, reroll: 25,
  market: { base: 60, rarity: { standard: 1, tuned: 2, custom: 4, prototype: 10 }, salsSpecial: 600 },
  tune: { base: 40, growth: 1.4, rarity: { scrap: 0.5, standard: 1, tuned: 1.2, custom: 1.5, prototype: 2, relic: 3, heirloom: 4 } },
  recalibrate: { base: 100, circuitry: 2, fluxFrom: 'prototype' },
  wardDebt: 3140,
};

export const CONSUMABLES = {
  repairKit: { id: 'repairKit', name: 'Repair Kit', healPct: 0.4, carry: 3, carryAt20: 5, cost: 'repairKit' },
  signalJammer: { id: 'signalJammer', name: 'Signal Jammer', heat: -1, cost: 'signalJammer' },
  decoyDrone: { id: 'decoyDrone', name: 'Decoy Drone', t: 6, cost: 'decoyDrone' },
};

// +k: [success, scrapAlloy, circuitry, flux, heirShard]
export const TUNE_TABLE = {
  1: [1, 3, 0, 0, 0], 2: [1, 6, 0, 0, 0], 3: [1, 9, 0, 0, 0],
  4: [0.9, 12, 2, 0, 0], 5: [0.8, 15, 4, 0, 0], 6: [0.7, 18, 6, 0, 0],
  7: [0.6, 21, 8, 1, 0], 8: [0.5, 24, 10, 2, 0], 9: [0.4, 27, 12, 3, 0], 10: [0.3, 30, 14, 4, 1],
};
export const TUNE_MAX = 10;
export const TUNE_BONUS = 0.06;
export const TUNE_PITY = 0.1;

export const STASH_SIZES = [
  { size: 60, cost: 0 }, { size: 90, cost: 5000 }, { size: 120, cost: 20000 },
  { size: 160, cost: 60000 }, { size: 200, cost: 150000 }, { size: 240, cost: 400000 },
];

export const HOMES = {
  pod: { id: 'pod', name: 'Pod 4471', cost: 0 },
  apartment: { id: 'apartment', name: 'Brightline Apartment', cost: 25000, needs: 'a4_m1' },
  estate: { id: 'estate', name: 'Vael Estate', cost: 0, needs: 'finale' },
  penthouse: { id: 'penthouse', name: 'Sky Penthouse', cost: 250000, needs: 'finale' },
};

export const PAINTS = [
  { id: 'rental_orange', name: 'Rental Orange', cost: 0 },
  { id: 'gold', name: 'Gold', cost: 500 },
  { id: 'chrome', name: 'Chrome', cost: 1000 },
  { id: 'gloss_black', name: 'Gloss Black', cost: 2000 },
  { id: 'faction', name: 'Faction Colours', cost: 10000, needs: 'trusted' },
  { id: 'harmony_holo', name: 'Harmony Holo', cost: 100000 },
  { id: 'vael_starfield', name: 'Vael Starfield', cost: 0, needs: 'story' },
];

export const LEGACY_NODES = [
  { id: 'dmg', name: 'Damage', per: 0.01, stat: 'dmgPct' },
  { id: 'hp', name: 'HP', per: 0.01, stat: 'hpPct' },
  { id: 'shield', name: 'Shield', per: 0.01, stat: 'shieldPct' },
  { id: 'crit', name: 'Crit chance', per: 0.002, stat: 'critChance' },
  { id: 'critDmg', name: 'Crit damage', per: 0.02, stat: 'critDmg' },
  { id: 'cdr', name: 'Cooldowns', per: 0.002, stat: 'cdr' },
  { id: 'credits', name: 'Credits', per: 0.01, stat: 'creditsPct' },
  { id: 'luck', name: 'Loot luck', per: 0.01, stat: 'lootLuck' },
  { id: 'xp', name: 'XP', per: 0.01, stat: 'xpPct' },
  { id: 'move', name: 'Move speed', per: 0.002, stat: 'movePct' },
  { id: 'repair', name: 'Repair cost', per: -0.01, stat: 'repairCostPct', cap: -0.5 },
  { id: 'heir', name: 'Heir Protocol', per: 0.02, stat: 'heirPct' },
];

// sim: endless credit sink (not in ECONOMY). Kettle's broker sells materials at price × L(level) per unit;
// each unit bought in the same shift raises that material's price by `step` (resets every shift).
export const MATERIAL_BROKER = {
  unlock: 15,
  price: { scrapAlloy: 8, circuitry: 40, flux: 250, heirShard: 1500 },
  step: 0.08,
};

export const SUCCESSION = { minLegacy: 20, creditCap: 50000, xpPerGen: 0.15, lootPerGen: 0.1, maxGen: 10 };

export const DEBT_FREE_PERK = { creditsPct: 0.05 };
