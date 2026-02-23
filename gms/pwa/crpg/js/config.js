// ===== CRPG Configuration — All Game Constants =====
export const TILE_SIZE = 16;
export const WORLD_W   = 80;
export const WORLD_H   = 80;
export const COMBAT_TICK_MS = 600;
export const ENEMY_RESPAWN_S = 30;
export const TOWN_SAFE_RADIUS = 14;
export const MAX_PARTICLES = 200;
export const AGGRO_RADIUS = 4;
export const SKILL_LEVEL_CAP = 99;
export const BACKPACK_SLOTS = 28;
export const DUNGEON_BOSS_RESPAWN_S = 1800;
export const DUNGEON_ENEMY_RESPAWN_S = 600;

// ===== XP FORMULA =====
export function xpForLevel(n) {
  return Math.floor(300 * Math.pow(1.12, n));
}
export function totalXpForLevel(n) {
  let total = 0;
  for (let i = 1; i < n; i++) total += xpForLevel(i);
  return total;
}

// ===== SKILLS =====
export const SKILLS = {
  attack:      { id: 'attack',      name: 'Attack',      glyph: 'A', color: '#e94560' },
  defence:     { id: 'defence',     name: 'Defence',     glyph: 'D', color: '#4ecca3' },
  hitpoints:   { id: 'hitpoints',   name: 'Hitpoints',   glyph: 'H', color: '#e94560' },
  magic:       { id: 'magic',       name: 'Magic',       glyph: 'M', color: '#4fc3f7' },
  ranged:      { id: 'ranged',      name: 'Ranged',      glyph: 'R', color: '#a5d6a7' },
  mining:      { id: 'mining',      name: 'Mining',      glyph: 'N', color: '#c0c0c0' },
  smithing:    { id: 'smithing',    name: 'Smithing',    glyph: 'S', color: '#f5a623' },
  fishing:     { id: 'fishing',     name: 'Fishing',     glyph: 'F', color: '#4fc3f7' },
  woodcutting: { id: 'woodcutting', name: 'Woodcutting', glyph: 'W', color: '#a5d6a7' },
  crafting:    { id: 'crafting',    name: 'Crafting',    glyph: 'C', color: '#ce93d8' },
  cooking:     { id: 'cooking',     name: 'Cooking',     glyph: 'K', color: '#ffab91' },
  stealth:     { id: 'stealth',     name: 'Stealth',     glyph: 'T', color: '#888' },
};

// ===== ENEMIES =====
export const ENEMIES = {
  rat: {
    id:'rat', glyph:'r', color:'#8B4513', name:'Giant Rat',
    hp:8, atk:2, def:0, xp:5, gold:[1,3],
    zone:'ashvale', speed:1.2, aggroRng:3,
    loot: [{id:'rat_pelt',chance:0.2}]
  },
  goblin: {
    id:'goblin', glyph:'g', color:'#4CAF50', name:'Goblin',
    hp:18, atk:5, def:2, xp:12, gold:[3,8],
    zone:'goblin_plains', speed:1.0, aggroRng:4,
    loot: [{id:'bronze_sword',chance:0.05},{id:'leather_cap',chance:0.04}]
  },
  goblin_archer: {
    id:'goblin_archer', glyph:'g', color:'#FFEB3B', name:'Goblin Archer',
    hp:15, atk:6, def:1, xp:15, gold:[4,10],
    zone:'goblin_plains', speed:1.0, aggroRng:5, ranged:true,
    loot: [{id:'arrows',chance:0.3}]
  },
  wolf: {
    id:'wolf', glyph:'w', color:'#9E9E9E', name:'Wolf',
    hp:22, atk:7, def:3, xp:18, gold:[0,2],
    zone:'dark_forest', speed:1.4, aggroRng:5,
    loot: [{id:'wolf_pelt',chance:0.4}]
  },
  bandit: {
    id:'bandit', glyph:'b', color:'#e94560', name:'Bandit',
    hp:30, atk:9, def:5, xp:25, gold:[10,20],
    zone:'dark_forest', speed:1.0, aggroRng:4,
    loot: [{id:'iron_sword',chance:0.06},{id:'health_potion',chance:0.1}]
  },
  skeleton: {
    id:'skeleton', glyph:'s', color:'#ECEFF1', name:'Skeleton',
    hp:25, atk:8, def:6, xp:28, gold:[2,5],
    zone:'haunted_moor', speed:0.9, aggroRng:4,
    loot: [{id:'bones',chance:0.6},{id:'iron_sword',chance:0.05}]
  },
  ghost: {
    id:'ghost', glyph:'G', color:'#80DEEA', name:'Ghost',
    hp:20, atk:12, def:10, xp:35, gold:[0,0],
    zone:'haunted_moor', speed:0.8, aggroRng:5,
    loot: [{id:'ecto_token',chance:0.5}]
  },
  troll: {
    id:'troll', glyph:'T', color:'#5D4037', name:'Hill Troll',
    hp:55, atk:14, def:8, xp:50, gold:[15,30],
    zone:'mountain_pass', speed:0.7, aggroRng:3,
    loot: [{id:'troll_hide',chance:0.3},{id:'steel_sword',chance:0.04}]
  },
  ice_wraith: {
    id:'ice_wraith', glyph:'I', color:'#E3F2FD', name:'Ice Wraith',
    hp:40, atk:18, def:12, xp:60, gold:[5,10],
    zone:'ice_wastes', speed:0.9, aggroRng:5,
    loot: [{id:'ice_shard',chance:0.4}]
  },
  dark_knight: {
    id:'dark_knight', glyph:'K', color:'#9C27B0', name:'Dark Knight',
    hp:80, atk:22, def:18, xp:90, gold:[30,60],
    zone:'skull_crypt', speed:0.9, aggroRng:4,
    loot: [{id:'mithril_sword',chance:0.05},{id:'plate_chest',chance:0.04}]
  },
  // Dungeon enemies
  cave_bat: {
    id:'cave_bat', glyph:'^', color:'#424242', name:'Cave Bat',
    hp:10, atk:4, def:1, xp:6, gold:[0,1],
    zone:'dungeon', speed:1.6, aggroRng:5,
    loot: []
  },
  goblin_shaman: {
    id:'goblin_shaman', glyph:'G', color:'#4CAF50', name:'Goblin Shaman',
    hp:28, atk:10, def:3, xp:22, gold:[5,12],
    zone:'dungeon', speed:0.9, aggroRng:5, magic:true,
    loot: [{id:'rune_shard',chance:0.2}]
  },
  zombie: {
    id:'zombie', glyph:'z', color:'#388E3C', name:'Zombie',
    hp:35, atk:11, def:4, xp:30, gold:[2,6],
    zone:'dungeon', speed:0.7, aggroRng:3,
    loot: [{id:'bones',chance:0.4}]
  },
  wraith_lord: {
    id:'wraith_lord', glyph:'W', color:'#5C6BC0', name:'Wraith Lord',
    hp:60, atk:16, def:9, xp:65, gold:[10,25],
    zone:'dungeon', speed:0.8, aggroRng:5, drains:true,
    loot: [{id:'dark_robe',chance:0.1}]
  },
  frost_elemental: {
    id:'frost_elemental', glyph:'E', color:'#80DEEA', name:'Frost Elemental',
    hp:70, atk:20, def:14, xp:80, gold:[8,18],
    zone:'dungeon', speed:0.85, aggroRng:5, aoe:true,
    loot: [{id:'frost_essence',chance:0.3}]
  },
  dragonling: {
    id:'dragonling', glyph:'d', color:'#FF8F00', name:'Dragonling',
    hp:90, atk:24, def:16, xp:100, gold:[20,40],
    zone:'dungeon', speed:1.1, aggroRng:5, fire:true,
    loot: [{id:'dragon_scale',chance:0.15}]
  },
  // Bosses
  warchief_grax: {
    id:'warchief_grax', glyph:'G', color:'#e94560', name:'Warchief Grax',
    hp:150, atk:18, def:12, xp:500, gold:[50,100],
    boss:true, summons:['goblin','goblin'],
    loot: [{id:'warchief_helm',chance:1},{id:'gold_chunk',chance:1}]
  },
  lich_malgrath: {
    id:'lich_malgrath', glyph:'L', color:'#9C27B0', name:'Lich Malgrath',
    hp:220, atk:28, def:18, xp:800, gold:[80,150],
    boss:true, summons:['skeleton','skeleton'],
    loot: [{id:'lich_staff',chance:1}]
  },
  glacius: {
    id:'glacius', glyph:'F', color:'#E3F2FD', name:'Glacius the Frozen',
    hp:300, atk:35, def:22, xp:1200, gold:[120,200],
    boss:true, aoe:true,
    loot: [{id:'frost_crown',chance:1}]
  },
  ignaroth: {
    id:'ignaroth', glyph:'D', color:'#FF8F00', name:'Ignaroth the Ancient',
    hp:500, atk:50, def:30, xp:2000, gold:[300,500],
    boss:true, fire:true, enrageHp:0.25,
    loot: [{id:'dragon_scale_set',chance:1}]
  },
};

// ===== DUNGEONS =====
export const DUNGEONS = {
  goblin_warren: {
    id:'goblin_warren', name:'Goblin Warren',
    stars:2, recLevel:10, lootTier:'Common',
    w:20, h:15,
    enemies:['cave_bat','goblin','goblin_shaman'],
    enemyCount:[4,6],
    boss:'warchief_grax',
    entrance:{wx:18, wy:55},
  },
  skull_crypt: {
    id:'skull_crypt', name:'Skull Crypt',
    stars:3, recLevel:25, lootTier:'Uncommon',
    w:20, h:15,
    enemies:['skeleton','zombie','wraith_lord'],
    enemyCount:[6,9],
    boss:'lich_malgrath',
    entrance:{wx:52, wy:42},
  },
  frostdeep: {
    id:'frostdeep', name:'Frostdeep',
    stars:4, recLevel:40, lootTier:'Rare',
    w:20, h:15,
    enemies:['ice_wraith','frost_elemental'],
    enemyCount:[8,11],
    boss:'glacius',
    entrance:{wx:65, wy:28},
  },
  dragon_lair: {
    id:'dragon_lair', name:'Dragon Lair',
    stars:5, recLevel:60, lootTier:'Legendary',
    w:20, h:15,
    enemies:['dark_knight','dragonling'],
    enemyCount:[10,14],
    boss:'ignaroth',
    entrance:{wx:72, wy:55},
  },
};

// ===== TOWNS =====
export const TOWNS = {
  ashvale: {
    id:'ashvale', name:'Ashvale', cx:20, cy:40, radius:14,
    npcs:['aldric','mara','finn','brynn'],
  },
  cresthold: {
    id:'cresthold', name:'Cresthold', cx:55, cy:25, radius:14,
    npcs:['theron','yaleth','dax','voss'],
  },
  ironport: {
    id:'ironport', name:'Ironport', cx:20, cy:65, radius:14,
    npcs:['ceel','lenne','zephyr','shade'],
  },
};

// ===== NPCs =====
export const NPCS = {
  aldric: {
    id:'aldric', name:'Aldric the Smith', glyph:'A', color:'#f5a623',
    tx:19, ty:39,
    dialogue:"Greetings, adventurer! I sell the finest weapons in Ashvale. Need iron or bronze gear? I'm your man.",
    shop: ['bronze_sword','iron_sword','iron_shield','bronze_armour'],
  },
  mara: {
    id:'mara', name:'Mara the Merchant', glyph:'M', color:'#c0c0c0',
    tx:21, ty:40,
    dialogue:"Welcome to Mara's General Store! Food, tools, and supplies for the discerning adventurer.",
    shop: ['shrimp','trout','health_potion','fishing_rod'],
  },
  finn: {
    id:'finn', name:'Old Finn', glyph:'F', color:'#4fc3f7',
    tx:19, ty:41,
    dialogue:"The coastal waters are teeming with fish, if ye know where to look. Buy a rod and try yer luck!",
    shop: ['fishing_rod','shrimp'],
    trainer: 'fishing',
  },
  brynn: {
    id:'brynn', name:'Guard Captain Brynn', glyph:'B', color:'#e94560',
    tx:22, ty:39,
    dialogue:"Stay within town walls if you value your life. The Goblin Warren to the east is dangerous — but worth the risk for seasoned fighters.",
  },
  theron: {
    id:'theron', name:'Theron Ironhand', glyph:'T', color:'#f5a623',
    tx:54, ty:24,
    dialogue:"Mithril is the finest metal in the land. Train your Smithing and I'll teach you to forge it.",
    shop: ['steel_sword','mithril_sword','plate_chest','plate_legs'],
    trainer: 'smithing',
  },
  yaleth: {
    id:'yaleth', name:'Sister Yaleth', glyph:'Y', color:'#4ecca3',
    tx:56, ty:25,
    dialogue:"May the light guide you. I sell potions to help the wounded. Stay safe out there.",
    shop: ['health_potion','strength_potion','defence_potion'],
  },
  dax: {
    id:'dax', name:'Ranger Dax', glyph:'D', color:'#a5d6a7',
    tx:54, ty:26,
    dialogue:"A ranged fighter never has to get their hands dirty. Shortbow, longbow — I have them all.",
    shop: ['shortbow','longbow','arrows'],
    trainer: 'ranged',
  },
  voss: {
    id:'voss', name:'Guildmaster Voss', glyph:'V', color:'#ce93d8',
    tx:56, ty:24,
    dialogue:"The Adventurers' Guild tracks all skill achievements. Keep training and your name will echo through the ages.",
  },
  ceel: {
    id:'ceel', name:'Harbormaster Ceel', glyph:'C', color:'#4fc3f7',
    tx:19, ty:64,
    dialogue:"Ironport is the gateway to the deep sea. With the right fishing level, the oceans will give up their secrets.",
    trainer: 'fishing',
  },
  lenne: {
    id:'lenne', name:'Crafter Lenne', glyph:'L', color:'#ce93d8',
    tx:21, ty:65,
    dialogue:"Dragonhide armour is the finest leather work. If you can get the scales, I can teach you to craft it.",
    shop: ['leather_armour','hard_leather_body','crafting_kit'],
    trainer: 'crafting',
  },
  zephyr: {
    id:'zephyr', name:'Zephyr the Mage', glyph:'Z', color:'#4fc3f7',
    tx:20, ty:66,
    dialogue:"Magic is the great equalizer. Buy runes from me and learn to harness the elements.",
    shop: ['fire_staff','rune_shard','mana_potion'],
    trainer: 'magic',
  },
  shade: {
    id:'shade', name:'Shade', glyph:'S', color:'#555',
    tx:22, ty:65,
    dialogue:"...You weren't supposed to see me. But since you're here — I can teach you the ways of shadow.",
    trainer: 'stealth',
  },
};

// ===== ITEMS =====
export const ITEMS = {
  // Consumables
  shrimp:        { id:'shrimp',        name:'Shrimp',          glyph:'~', color:'#FFB74D', type:'food',    heal:5,   stackable:true,  value:5   },
  trout:         { id:'trout',         name:'Trout',           glyph:'~', color:'#64B5F6', type:'food',    heal:15,  stackable:true,  value:15  },
  lobster:       { id:'lobster',       name:'Lobster',         glyph:'~', color:'#e94560', type:'food',    heal:30,  stackable:true,  value:30  },
  shark:         { id:'shark',         name:'Shark',           glyph:'~', color:'#546E7A', type:'food',    heal:50,  stackable:true,  value:60  },
  health_potion: { id:'health_potion', name:'Health Potion',   glyph:'!', color:'#e94560', type:'potion',  heal:40,  stackable:true,  value:50  },
  strength_potion:{ id:'strength_potion', name:'Str Potion',  glyph:'!', color:'#FF8F00', type:'potion',  buffAtk:5, buffDur:60, stackable:true, value:80 },
  defence_potion:{ id:'defence_potion', name:'Def Potion',    glyph:'!', color:'#4ecca3', type:'potion',  buffDef:5, buffDur:60, stackable:true, value:80 },
  mana_potion:   { id:'mana_potion',   name:'Mana Potion',    glyph:'!', color:'#4fc3f7', type:'potion',  mana:30,  stackable:true,  value:60  },

  // Weapons
  bronze_sword:  { id:'bronze_sword',  name:'Bronze Sword',   glyph:'/', color:'#8D6E63', type:'weapon', slot:'weapon', atkBonus:3,  reqAtk:1,  value:40  },
  iron_sword:    { id:'iron_sword',    name:'Iron Sword',     glyph:'/', color:'#9E9E9E', type:'weapon', slot:'weapon', atkBonus:7,  reqAtk:5,  value:120 },
  steel_sword:   { id:'steel_sword',   name:'Steel Sword',    glyph:'/', color:'#78909C', type:'weapon', slot:'weapon', atkBonus:13, reqAtk:20, value:300 },
  mithril_sword: { id:'mithril_sword', name:'Mithril Sword',  glyph:'/', color:'#4ecca3', type:'weapon', slot:'weapon', atkBonus:22, reqAtk:40, value:800 },
  dragon_sword:  { id:'dragon_sword',  name:'Dragon Sword',   glyph:'/', color:'#FF8F00', type:'weapon', slot:'weapon', atkBonus:35, reqAtk:60, value:5000},
  shortbow:      { id:'shortbow',      name:'Shortbow',       glyph:')', color:'#8D6E63', type:'weapon', slot:'weapon', rngBonus:5,  reqRng:10, value:100 },
  longbow:       { id:'longbow',       name:'Longbow',        glyph:')', color:'#6D4C41', type:'weapon', slot:'weapon', rngBonus:15, reqRng:30, value:400 },
  fire_staff:    { id:'fire_staff',    name:'Fire Staff',     glyph:'|', color:'#FF5722', type:'weapon', slot:'weapon', magBonus:18, reqMag:20, value:600 },
  lich_staff:    { id:'lich_staff',    name:'Lich Staff',     glyph:'|', color:'#9C27B0', type:'weapon', slot:'weapon', magBonus:30, reqMag:40, value:3000},

  // Armour — head
  leather_cap:   { id:'leather_cap',   name:'Leather Cap',    glyph:'[', color:'#8D6E63', type:'armour', slot:'head', defBonus:1, reqDef:1,  value:30  },
  iron_helm:     { id:'iron_helm',     name:'Iron Helm',      glyph:'[', color:'#9E9E9E', type:'armour', slot:'head', defBonus:3, reqDef:5,  value:80  },
  plate_helm:    { id:'plate_helm',    name:'Plate Helm',     glyph:'[', color:'#607D8B', type:'armour', slot:'head', defBonus:8, reqDef:40, value:500 },
  warchief_helm: { id:'warchief_helm', name:'Warchief Helm',  glyph:'[', color:'#e94560', type:'armour', slot:'head', defBonus:8, special:'intimidate', value:1500 },
  frost_crown:   { id:'frost_crown',   name:'Frost Crown',    glyph:'[', color:'#80DEEA', type:'armour', slot:'head', defBonus:12, special:'freeze', value:4000 },

  // Armour — chest
  bronze_armour: { id:'bronze_armour', name:'Bronze Armour',  glyph:']', color:'#8D6E63', type:'armour', slot:'chest', defBonus:2,  reqDef:1,  value:60  },
  leather_armour:{ id:'leather_armour',name:'Leather Armour', glyph:']', color:'#8D6E63', type:'armour', slot:'chest', defBonus:2,  reqDef:1,  value:50  },
  hard_leather_body:{ id:'hard_leather_body', name:'Hard Leather Body', glyph:']', color:'#6D4C41', type:'armour', slot:'chest', defBonus:4, reqDef:10, value:150 },
  iron_platebody:{ id:'iron_platebody',name:'Iron Platebody', glyph:']', color:'#9E9E9E', type:'armour', slot:'chest', defBonus:5,  reqDef:5,  value:200 },
  plate_chest:   { id:'plate_chest',   name:'Plate Chest',    glyph:']', color:'#607D8B', type:'armour', slot:'chest', defBonus:11, reqDef:40, value:1200},

  // Shields
  iron_shield:   { id:'iron_shield',   name:'Iron Shield',    glyph:')', color:'#9E9E9E', type:'shield', slot:'offhand', defBonus:4, reqDef:5,  value:100 },
  steel_shield:  { id:'steel_shield',  name:'Steel Shield',   glyph:')', color:'#78909C', type:'shield', slot:'offhand', defBonus:7, reqDef:20, value:250 },

  // Special drops
  rat_pelt:    { id:'rat_pelt',    name:'Rat Pelt',    glyph:'%', color:'#8D6E63', type:'material', stackable:true, value:3   },
  wolf_pelt:   { id:'wolf_pelt',   name:'Wolf Pelt',   glyph:'%', color:'#9E9E9E', type:'material', stackable:true, value:15  },
  bones:       { id:'bones',       name:'Bones',       glyph:'%', color:'#ECEFF1', type:'material', stackable:true, value:2   },
  ecto_token:  { id:'ecto_token',  name:'Ecto Token',  glyph:'o', color:'#80DEEA', type:'material', stackable:true, value:20  },
  troll_hide:  { id:'troll_hide',  name:'Troll Hide',  glyph:'%', color:'#5D4037', type:'material', stackable:true, value:30  },
  ice_shard:   { id:'ice_shard',   name:'Ice Shard',   glyph:'*', color:'#80DEEA', type:'material', stackable:true, value:25  },
  rune_shard:  { id:'rune_shard',  name:'Rune Shard',  glyph:'*', color:'#4ecca3', type:'material', stackable:true, value:40  },
  dark_robe:   { id:'dark_robe',   name:'Dark Robe',   glyph:']', color:'#9C27B0', type:'armour', slot:'chest', defBonus:5, magBonus:8, reqMag:20, value:800 },
  frost_essence:{ id:'frost_essence', name:'Frost Essence', glyph:'*', color:'#80DEEA', type:'material', stackable:true, value:50  },
  dragon_scale: { id:'dragon_scale',  name:'Dragon Scale',  glyph:'%', color:'#FF8F00', type:'material', stackable:true, value:200 },
  dragon_scale_set:{ id:'dragon_scale_set', name:'Dragon Scale Set', glyph:'@', color:'#FF8F00', type:'armour', slot:'chest', defBonus:20, special:'dragon_power', value:15000 },
  gold_chunk:  { id:'gold_chunk',  name:'Gold Chunk',  glyph:'$', color:'#f5a623', type:'material', stackable:true, value:100 },
  arrows:      { id:'arrows',      name:'Arrows',      glyph:'|', color:'#8D6E63', type:'ammo',    stackable:true, value:1   },
  fishing_rod: { id:'fishing_rod', name:'Fishing Rod', glyph:'/', color:'#8D6E63', type:'tool',    value:20  },
  crafting_kit:{ id:'crafting_kit',name:'Crafting Kit',glyph:'+', color:'#ce93d8', type:'tool',    value:50  },
};

// ===== TILE TYPES =====
export const TILES = {
  GRASS:   0,
  WATER:   1,
  STONE:   2,
  TREE:    3,
  DOOR:    4,
  DUNGEON: 5,
  SAND:    6,
  MOUNTAIN:7,
  ROAD:    8,
  BUILDING:9,
  FLOOR:  10,
  WALL:   11,
  EXIT:   12,
};

export const TILE_CHARS = {
  [0]: '.',  // grass
  [1]: '~',  // water
  [2]: '#',  // stone
  [3]: 'T',  // tree
  [4]: '+',  // door
  [5]: '>',  // dungeon entrance
  [6]: '.',  // sand
  [7]: '^',  // mountain
  [8]: '.',  // road
  [9]: '=',  // building
  [10]: '.', // floor
  [11]: '#', // wall
  [12]: '<', // exit
};

export const TILE_COLORS = {
  [0]: { bg:'#1a3a1a', fg:'#2d5a2d' },  // grass
  [1]: { bg:'#0d2b4a', fg:'#1a4a7a' },  // water
  [2]: { bg:'#2a2a2a', fg:'#4a4a4a' },  // stone
  [3]: { bg:'#0d2010', fg:'#2a5a20' },  // tree
  [4]: { bg:'#3a2a10', fg:'#8B6914' },  // door
  [5]: { bg:'#1a1a0a', fg:'#8B8B00' },  // dungeon entrance
  [6]: { bg:'#3a3020', fg:'#6a5a3a' },  // sand
  [7]: { bg:'#2a2a2a', fg:'#5a5a5a' },  // mountain
  [8]: { bg:'#2a2010', fg:'#4a4020' },  // road
  [9]: { bg:'#2a1a0a', fg:'#8B6914' },  // building
  [10]:{ bg:'#1a1a1a', fg:'#3a3a3a' },  // dungeon floor
  [11]:{ bg:'#0a0a0a', fg:'#2a2a4a' },  // dungeon wall
  [12]:{ bg:'#0a1a0a', fg:'#00aa00' },  // exit
};

export const TILE_WALKABLE = {
  [0]: true,
  [1]: false,
  [2]: false,
  [3]: false,
  [4]: true,
  [5]: true,
  [6]: true,
  [7]: false,
  [8]: true,
  [9]: false,
  [10]:true,
  [11]:false,
  [12]:true,
};

// ===== SPAWN ZONES (tile rect regions) =====
export const SPAWN_ZONES = [
  { id:'ashvale',       rect:[5,30,30,50],  enemies:['rat'],                rate:30 },
  { id:'goblin_plains', rect:[30,45,60,70], enemies:['goblin','goblin_archer'], rate:30 },
  { id:'dark_forest',   rect:[5,10,30,30],  enemies:['wolf','bandit'],        rate:30 },
  { id:'haunted_moor',  rect:[35,10,55,35], enemies:['skeleton','ghost'],      rate:35 },
  { id:'mountain_pass', rect:[55,10,75,30], enemies:['troll'],                rate:40 },
  { id:'ice_wastes',    rect:[60,30,78,55], enemies:['ice_wraith'],           rate:35 },
  { id:'skull_crypt',   rect:[45,35,60,50], enemies:['dark_knight'],          rate:40 },
];

// ===== SKILL TASKS =====
export const SKILL_TASKS = {
  mining: [
    { id:'copper_ore', name:'Copper Ore', reqLvl:1,  xp:18,  node:'copper_rock',  product:'copper_ore' },
    { id:'iron_ore',   name:'Iron Ore',   reqLvl:15, xp:35,  node:'iron_rock',    product:'iron_ore'   },
    { id:'gold_ore',   name:'Gold Ore',   reqLvl:30, xp:65,  node:'gold_rock',    product:'gold_ore'   },
    { id:'mithril_ore',name:'Mithril',    reqLvl:50, xp:120, node:'mithril_rock', product:'mithril_ore'},
    { id:'runite_ore', name:'Runite',     reqLvl:85, xp:250, node:'runite_rock',  product:'runite_ore' },
  ],
  fishing: [
    { id:'shrimp',   name:'Shrimp',   reqLvl:1,  xp:10,  spot:'shrimp_spot',  product:'shrimp'  },
    { id:'trout',    name:'Trout',    reqLvl:20, xp:50,  spot:'trout_spot',   product:'trout'   },
    { id:'lobster',  name:'Lobster',  reqLvl:40, xp:90,  spot:'lobster_spot', product:'lobster' },
    { id:'shark',    name:'Shark',    reqLvl:70, xp:110, spot:'shark_spot',   product:'shark'   },
  ],
  woodcutting: [
    { id:'oak',    name:'Oak Log',    reqLvl:1,  xp:25,  tree:'oak_tree',    product:'oak_log'   },
    { id:'willow', name:'Willow Log', reqLvl:20, xp:68,  tree:'willow_tree', product:'willow_log'},
    { id:'maple',  name:'Maple Log',  reqLvl:40, xp:100, tree:'maple_tree',  product:'maple_log' },
    { id:'yew',    name:'Yew Log',    reqLvl:70, xp:175, tree:'yew_tree',    product:'yew_log'   },
    { id:'magic',  name:'Magic Log',  reqLvl:85, xp:250, tree:'magic_tree',  product:'magic_log' },
  ],
  cooking: [
    { id:'cook_shrimp', name:'Cook Shrimp', reqLvl:1,  xp:30,  input:'shrimp',  output:'shrimp'  },
    { id:'cook_trout',  name:'Cook Trout',  reqLvl:15, xp:70,  input:'trout',   output:'trout'   },
    { id:'cook_lobster',name:'Cook Lobster',reqLvl:30, xp:120, input:'lobster', output:'lobster' },
    { id:'cook_shark',  name:'Cook Shark',  reqLvl:70, xp:210, input:'shark',   output:'shark'   },
  ],
};

// ===== WORLD ZONE NOISE SEED PARAMS =====
export const WORLD_ZONES = {
  // rough center coordinates for zone generation
  ashvale_center:    { x:20, y:40 },
  cresthold_center:  { x:55, y:25 },
  ironport_center:   { x:20, y:65 },
  goblin_plains:     { x:40, y:60 },
  dark_forest:       { x:12, y:20 },
  haunted_moor:      { x:42, y:22 },
  mountain_pass:     { x:65, y:18 },
  ice_wastes:        { x:68, y:42 },
  coastal_waters:    { x:8,  y:65 },
};
