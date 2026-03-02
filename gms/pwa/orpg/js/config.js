// ============================================================
// config.js - All game constants, data tables, item/monster definitions
// ============================================================

export const TILE_SIZE = 32;
export const ROOM_W = 22;
export const ROOM_H = 16;
export const CANVAS_W = ROOM_W * TILE_SIZE;  // 704
export const CANVAS_H = ROOM_H * TILE_SIZE;  // 512
export const INVENTORY_SIZE = 28;
export const TICK_RATE = 600; // ms per game tick (RuneScape style)

// Tile types
export const TILE = {
  FLOOR: 0,
  WALL: 1,
  WATER: 2,
  CAMPFIRE: 3,
  FISHING_SPOT: 4,
  DOOR_NORTH: 5,
  DOOR_SOUTH: 6,
  DOOR_EAST: 7,
  DOOR_WEST: 8,
  PILLAR: 9,
  RUBBLE: 10,
};

// Skills
export const SKILL = {
  ATTACK: 'attack',
  STRENGTH: 'strength',
  DEFENSE: 'defense',
  HITPOINTS: 'hitpoints',
  FISHING: 'fishing',
  COOKING: 'cooking',
};

export const SKILL_LIST = [
  SKILL.ATTACK, SKILL.STRENGTH, SKILL.DEFENSE,
  SKILL.HITPOINTS, SKILL.FISHING, SKILL.COOKING,
];

export const SKILL_COLORS = {
  [SKILL.ATTACK]: '#c03030',
  [SKILL.STRENGTH]: '#30c030',
  [SKILL.DEFENSE]: '#3070c0',
  [SKILL.HITPOINTS]: '#c0c030',
  [SKILL.FISHING]: '#30a0c0',
  [SKILL.COOKING]: '#c07030',
};

export const SKILL_ICONS = {
  [SKILL.ATTACK]: 'ATK',
  [SKILL.STRENGTH]: 'STR',
  [SKILL.DEFENSE]: 'DEF',
  [SKILL.HITPOINTS]: 'HP',
  [SKILL.FISHING]: 'FISH',
  [SKILL.COOKING]: 'COOK',
};

// RuneScape XP table - precomputed
export function xpForLevel(level) {
  if (level <= 1) return 0;
  let total = 0;
  for (let i = 1; i < level; i++) {
    total += Math.floor(i + 300 * Math.pow(2, i / 7));
  }
  return Math.floor(total / 4);
}

// Precompute XP table
export const XP_TABLE = [];
for (let i = 0; i <= 99; i++) {
  XP_TABLE[i] = xpForLevel(i);
}

export function levelForXp(xp) {
  for (let i = 98; i >= 1; i--) {
    if (xp >= XP_TABLE[i]) return i;
  }
  return 1;
}

// Equipment slots
export const EQUIP_SLOT = {
  WEAPON: 'weapon',
  SHIELD: 'shield',
  HELMET: 'helmet',
  BODY: 'body',
  LEGS: 'legs',
};

// Item types
export const ITEM_TYPE = {
  WEAPON: 'weapon',
  SHIELD: 'shield',
  HELMET: 'helmet',
  BODY: 'body',
  LEGS: 'legs',
  FISH_RAW: 'fish_raw',
  FISH_COOKED: 'fish_cooked',
  FISH_BURNT: 'fish_burnt',
  FISHING_ROD: 'fishing_rod',
  MISC: 'misc',
};

// Metal tiers
export const METAL_TIERS = ['bronze', 'iron', 'steel', 'mithril', 'adamant', 'rune', 'dragon'];
export const METAL_COLORS = {
  bronze: { primary: '#CD7F32', secondary: '#8B5A2B', highlight: '#DDA15E' },
  iron: { primary: '#A0A0A0', secondary: '#707070', highlight: '#C0C0C0' },
  steel: { primary: '#B0B8C0', secondary: '#808890', highlight: '#D0D8E0' },
  mithril: { primary: '#4040A0', secondary: '#2A2A70', highlight: '#6060C0' },
  adamant: { primary: '#308030', secondary: '#206020', highlight: '#40B040' },
  rune: { primary: '#30A0C0', secondary: '#207080', highlight: '#50C0E0' },
  dragon: { primary: '#C02020', secondary: '#801010', highlight: '#E04040' },
};

// Item definitions
export const ITEMS = {
  // Fishing rod
  fishing_rod: {
    id: 'fishing_rod', name: 'Fishing Rod', type: ITEM_TYPE.FISHING_ROD,
    description: 'Used to catch fish.',
    stackable: false,
  },

  // Weapons - by metal tier
  ...Object.fromEntries(METAL_TIERS.map((metal, i) => [
    `${metal}_sword`,
    {
      id: `${metal}_sword`,
      name: `${metal.charAt(0).toUpperCase() + metal.slice(1)} Sword`,
      type: ITEM_TYPE.WEAPON,
      slot: EQUIP_SLOT.WEAPON,
      attackBonus: 4 + i * 6,
      strengthBonus: 3 + i * 5,
      metalTier: metal,
      requiredAttack: [1, 1, 5, 20, 30, 40, 60][i],
      description: `A ${metal} sword.`,
    }
  ])),

  // Shields
  ...Object.fromEntries(METAL_TIERS.map((metal, i) => [
    `${metal}_shield`,
    {
      id: `${metal}_shield`,
      name: `${metal.charAt(0).toUpperCase() + metal.slice(1)} Shield`,
      type: ITEM_TYPE.SHIELD,
      slot: EQUIP_SLOT.SHIELD,
      defenseBonus: 3 + i * 5,
      metalTier: metal,
      requiredDefense: [1, 1, 5, 20, 30, 40, 60][i],
      description: `A ${metal} shield.`,
    }
  ])),

  // Helmets
  ...Object.fromEntries(METAL_TIERS.map((metal, i) => [
    `${metal}_helmet`,
    {
      id: `${metal}_helmet`,
      name: `${metal.charAt(0).toUpperCase() + metal.slice(1)} Helmet`,
      type: ITEM_TYPE.HELMET,
      slot: EQUIP_SLOT.HELMET,
      defenseBonus: 2 + i * 3,
      metalTier: metal,
      requiredDefense: [1, 1, 5, 20, 30, 40, 60][i],
      description: `A ${metal} helmet.`,
    }
  ])),

  // Body armor
  ...Object.fromEntries(METAL_TIERS.map((metal, i) => [
    `${metal}_platebody`,
    {
      id: `${metal}_platebody`,
      name: `${metal.charAt(0).toUpperCase() + metal.slice(1)} Platebody`,
      type: ITEM_TYPE.BODY,
      slot: EQUIP_SLOT.BODY,
      defenseBonus: 5 + i * 7,
      metalTier: metal,
      requiredDefense: [1, 1, 5, 20, 30, 40, 60][i],
      description: `A ${metal} platebody.`,
    }
  ])),

  // Legs
  ...Object.fromEntries(METAL_TIERS.map((metal, i) => [
    `${metal}_platelegs`,
    {
      id: `${metal}_platelegs`,
      name: `${metal.charAt(0).toUpperCase() + metal.slice(1)} Platelegs`,
      type: ITEM_TYPE.LEGS,
      slot: EQUIP_SLOT.LEGS,
      defenseBonus: 4 + i * 5,
      metalTier: metal,
      requiredDefense: [1, 1, 5, 20, 30, 40, 60][i],
      description: `A ${metal} platelegs.`,
    }
  ])),
};

// Fish definitions
export const FISH = {
  shrimp: {
    id: 'shrimp', name: 'Shrimp',
    levelRequired: 1, xp: 10, cookLevel: 1, cookXp: 30,
    healAmount: 3, burnStop: 34,
  },
  sardine: {
    id: 'sardine', name: 'Sardine',
    levelRequired: 5, xp: 20, cookLevel: 1, cookXp: 40,
    healAmount: 4, burnStop: 38,
  },
  herring: {
    id: 'herring', name: 'Herring',
    levelRequired: 10, xp: 30, cookLevel: 5, cookXp: 50,
    healAmount: 5, burnStop: 41,
  },
  trout: {
    id: 'trout', name: 'Trout',
    levelRequired: 20, xp: 50, cookLevel: 15, cookXp: 70,
    healAmount: 7, burnStop: 49,
  },
  salmon: {
    id: 'salmon', name: 'Salmon',
    levelRequired: 30, xp: 70, cookLevel: 25, cookXp: 90,
    healAmount: 9, burnStop: 58,
  },
  lobster: {
    id: 'lobster', name: 'Lobster',
    levelRequired: 40, xp: 90, cookLevel: 40, cookXp: 120,
    healAmount: 12, burnStop: 74,
  },
  swordfish: {
    id: 'swordfish', name: 'Swordfish',
    levelRequired: 50, xp: 100, cookLevel: 45, cookXp: 140,
    healAmount: 14, burnStop: 86,
  },
  shark: {
    id: 'shark', name: 'Shark',
    levelRequired: 76, xp: 110, cookLevel: 80, cookXp: 210,
    healAmount: 20, burnStop: 99,
  },
};

// Register fish as items
for (const [key, fish] of Object.entries(FISH)) {
  ITEMS[`raw_${key}`] = {
    id: `raw_${key}`,
    name: `Raw ${fish.name}`,
    type: ITEM_TYPE.FISH_RAW,
    fishType: key,
    description: `A raw ${fish.name.toLowerCase()}.`,
    stackable: false,
  };
  ITEMS[`cooked_${key}`] = {
    id: `cooked_${key}`,
    name: fish.name,
    type: ITEM_TYPE.FISH_COOKED,
    fishType: key,
    healAmount: fish.healAmount,
    description: `A cooked ${fish.name.toLowerCase()}. Heals ${fish.healAmount} HP.`,
    stackable: false,
  };
  ITEMS[`burnt_${key}`] = {
    id: `burnt_${key}`,
    name: `Burnt ${fish.name}`,
    type: ITEM_TYPE.FISH_BURNT,
    fishType: key,
    description: `A burnt ${fish.name.toLowerCase()}. Useless.`,
    stackable: false,
  };
}

// Monster definitions
export const MONSTERS = {
  rat: {
    id: 'rat', name: 'Giant Rat', level: 1,
    attack: 1, strength: 1, defense: 1, hitpoints: 5,
    aggroRange: 3, attackRange: 1, attackSpeed: 2400,
    xpMultiplier: 1,
    loot: [
      { id: 'raw_shrimp', weight: 30 },
      { id: 'bronze_sword', weight: 5 },
      { id: 'fishing_rod', weight: 10 },
    ],
  },
  goblin: {
    id: 'goblin', name: 'Goblin', level: 3,
    attack: 3, strength: 3, defense: 2, hitpoints: 10,
    aggroRange: 4, attackRange: 1, attackSpeed: 2400,
    xpMultiplier: 1,
    loot: [
      { id: 'raw_shrimp', weight: 20 },
      { id: 'raw_sardine', weight: 10 },
      { id: 'bronze_sword', weight: 8 },
      { id: 'bronze_shield', weight: 5 },
      { id: 'iron_sword', weight: 3 },
      { id: 'fishing_rod', weight: 8 },
    ],
  },
  skeleton: {
    id: 'skeleton', name: 'Skeleton', level: 8,
    attack: 8, strength: 6, defense: 5, hitpoints: 20,
    aggroRange: 5, attackRange: 1, attackSpeed: 2400,
    xpMultiplier: 1.2,
    loot: [
      { id: 'raw_herring', weight: 15 },
      { id: 'iron_sword', weight: 8 },
      { id: 'iron_shield', weight: 5 },
      { id: 'iron_helmet', weight: 5 },
      { id: 'steel_sword', weight: 3 },
    ],
  },
  zombie: {
    id: 'zombie', name: 'Zombie', level: 12,
    attack: 11, strength: 10, defense: 8, hitpoints: 30,
    aggroRange: 5, attackRange: 1, attackSpeed: 3000,
    xpMultiplier: 1.3,
    loot: [
      { id: 'raw_trout', weight: 15 },
      { id: 'iron_platebody', weight: 5 },
      { id: 'steel_sword', weight: 6 },
      { id: 'steel_shield', weight: 4 },
      { id: 'steel_helmet', weight: 4 },
    ],
  },
  dark_wizard: {
    id: 'dark_wizard', name: 'Dark Wizard', level: 18,
    attack: 16, strength: 14, defense: 10, hitpoints: 40,
    aggroRange: 6, attackRange: 4, attackSpeed: 3000,
    xpMultiplier: 1.5,
    loot: [
      { id: 'raw_salmon', weight: 15 },
      { id: 'steel_platebody', weight: 5 },
      { id: 'mithril_sword', weight: 4 },
      { id: 'mithril_shield', weight: 3 },
    ],
  },
  dark_knight: {
    id: 'dark_knight', name: 'Dark Knight', level: 30,
    attack: 28, strength: 26, defense: 25, hitpoints: 65,
    aggroRange: 5, attackRange: 1, attackSpeed: 2400,
    xpMultiplier: 1.8,
    loot: [
      { id: 'raw_lobster', weight: 15 },
      { id: 'mithril_platebody', weight: 5 },
      { id: 'adamant_sword', weight: 4 },
      { id: 'adamant_shield', weight: 3 },
      { id: 'adamant_helmet', weight: 3 },
    ],
  },
  demon: {
    id: 'demon', name: 'Lesser Demon', level: 45,
    attack: 42, strength: 40, defense: 35, hitpoints: 90,
    aggroRange: 6, attackRange: 1, attackSpeed: 2400,
    xpMultiplier: 2.0,
    loot: [
      { id: 'raw_swordfish', weight: 15 },
      { id: 'adamant_platebody', weight: 5 },
      { id: 'rune_sword', weight: 3 },
      { id: 'rune_shield', weight: 2 },
    ],
  },
  greater_demon: {
    id: 'greater_demon', name: 'Greater Demon', level: 65,
    attack: 60, strength: 58, defense: 50, hitpoints: 130,
    aggroRange: 6, attackRange: 1, attackSpeed: 2400,
    xpMultiplier: 2.5,
    loot: [
      { id: 'raw_shark', weight: 10 },
      { id: 'rune_platebody', weight: 3 },
      { id: 'rune_platelegs', weight: 3 },
      { id: 'dragon_sword', weight: 1 },
    ],
  },
};

// Wave definitions - what monsters spawn per wave range
export const WAVE_CONFIG = [
  { minWave: 1, maxWave: 3, monsters: ['rat'], count: [2, 4] },
  { minWave: 2, maxWave: 5, monsters: ['goblin'], count: [2, 3] },
  { minWave: 4, maxWave: 8, monsters: ['goblin', 'skeleton'], count: [3, 5] },
  { minWave: 6, maxWave: 12, monsters: ['skeleton', 'zombie'], count: [3, 5] },
  { minWave: 10, maxWave: 18, monsters: ['zombie', 'dark_wizard'], count: [3, 6] },
  { minWave: 15, maxWave: 25, monsters: ['dark_wizard', 'dark_knight'], count: [3, 5] },
  { minWave: 20, maxWave: 35, monsters: ['dark_knight', 'demon'], count: [3, 5] },
  { minWave: 30, maxWave: 50, monsters: ['demon', 'greater_demon'], count: [3, 5] },
  { minWave: 40, maxWave: 999, monsters: ['greater_demon'], count: [3, 6] },
];

// Check if an item stacks in inventory
export function isStackable(itemId) {
  const item = ITEMS[itemId];
  if (!item) return false;
  // Equipment does not stack
  if ([ITEM_TYPE.WEAPON, ITEM_TYPE.SHIELD, ITEM_TYPE.HELMET, ITEM_TYPE.BODY, ITEM_TYPE.LEGS].includes(item.type)) {
    return false;
  }
  return true;
}

// Available fish at fishing spots by level
export function getAvailableFish(fishingLevel) {
  const available = [];
  for (const [key, fish] of Object.entries(FISH)) {
    if (fishingLevel >= fish.levelRequired) {
      available.push(key);
    }
  }
  return available;
}
