// All tuning: towers, enemies, themes, economy, camera. Arrays of 3 = per
// upgrade level. Damage applied = max(1, dmg - enemy.armor).

export const CELL = 2;                 // world units per grid cell

export const ECON = {
  sellRefund: 0.7,                     // fraction of invested gold returned
  earlyBonusPerSec: 2,                 // gold per second left on the clock
  waveGap: 18,                         // seconds between waves (auto-start)
  waveBonus: (i) => 12 + i * 3,        // gold for clearing wave i (0-based)
};

export const TOWERS = {
  ballista: {
    name: 'Ballista', icon: '🏹', desc: 'Fast single-target bolts. Cheap, reliable.',
    cost: [70, 60, 80], range: [6.5, 7.5, 8.5], period: [0.55, 0.48, 0.4],
    dmg: [9, 14, 22], proj: 'bolt', base: 'tower_wood', head: 'ballista',
  },
  cannon: {
    name: 'Cannon', icon: '💣', desc: 'Lobbed cannonballs burst in an area.',
    cost: [120, 90, 130], range: [6, 7, 8], period: [1.5, 1.35, 1.2],
    dmg: [18, 28, 44], splash: [2.2, 2.4, 2.7], proj: 'cannonball',
    base: 'tower_stone', head: 'cannon',
  },
  catapult: {
    name: 'Catapult', icon: '🪨', desc: 'Huge range, huge boulder, huge splash — but slow, and blind up close.',
    cost: [170, 130, 180], range: [12, 13.5, 15], minRange: 4, period: [3.2, 2.9, 2.6],
    dmg: [34, 55, 85], splash: [2.8, 3.1, 3.5], proj: 'boulder',
    base: null, head: 'catapult',
  },
  frost: {
    name: 'Frost Spire', icon: '❄️', desc: 'Pulses cold — chills every enemy near it.',
    cost: [90, 80, 110], range: [4.5, 5, 5.8], period: [1.1, 1.0, 0.9],
    dmg: [4, 6, 9], slow: [0.55, 0.5, 0.42], slowDur: 1.6, proj: 'pulse',
    base: 'tower_stone', head: 'crystals', tint: 0x9fd8ff,
  },
  arcane: {
    name: 'Arcane Obelisk', icon: '⚡', desc: 'Lightning that leaps between enemies.',
    cost: [140, 110, 150], range: [6, 6.8, 7.6], period: [1.0, 0.92, 0.82],
    dmg: [16, 24, 36], chain: [3, 4, 5], falloff: 0.7, proj: 'zap',
    base: null, head: 'gems_green', tint: 0xd0ffb0,
  },
};

// pose: shamble | march | sneak | float   (js/enemies.js drives the rig)
export const ENEMIES = {
  shambler: { name: 'Shambler', icon: '🧟', rig: 'zombie_m', hp: 26, speed: 1.5, bounty: 6, armor: 0, lives: 1, scale: 0.97, pose: 'shamble' },
  rotter:   { name: 'Rotter', icon: '🧟‍♀️', rig: 'zombie_w', hp: 22, speed: 1.9, bounty: 6, armor: 0, lives: 1, scale: 0.95, pose: 'shamble' },
  bones:    { name: 'Bones', icon: '💀', rig: 'skeleton', hp: 34, speed: 2.2, bounty: 8, armor: 0, lives: 1, scale: 0.97, pose: 'march' },
  raider:   { name: 'Raider', icon: '🪓', rig: 'viking', hp: 62, speed: 1.8, bounty: 11, armor: 1, lives: 1, scale: 1.0, pose: 'march' },
  maiden:   { name: 'Shieldmaiden', icon: '🛡️', rig: 'viking_w', hp: 95, speed: 1.6, bounty: 14, armor: 3, lives: 1, scale: 1.0, pose: 'march' },
  knight:   { name: 'Dread Knight', icon: '⚔️', rig: 'knight', hp: 230, speed: 1.15, bounty: 26, armor: 6, lives: 2, scale: 1.06, pose: 'march' },
  shade:    { name: 'Shade', icon: '🥷', rig: 'ninja', hp: 40, speed: 3.4, bounty: 12, armor: 0, lives: 1, scale: 0.95, pose: 'sneak' },
  mummy:    { name: 'Risen Mummy', icon: '🩹', rig: 'mummy', hp: 130, speed: 1.1, bounty: 18, armor: 0, lives: 1, scale: 1.0, pose: 'shamble', regen: 4 },
  warlock:  { name: 'Warlock', icon: '🔮', rig: 'wizard', hp: 150, speed: 1.35, bounty: 30, armor: 2, lives: 2, scale: 1.0, pose: 'float', heal: { amount: 14, radius: 4, period: 3 } },

  // bosses — crowned, scaled, tinted; reaching the gate costs a fistful of hearts
  boneking:   { name: 'The Bone King', icon: '👑', rig: 'skeleton', hp: 950, speed: 1.0, bounty: 120, armor: 4, lives: 5, scale: 1.85, pose: 'march', boss: true, tint: 0xd8c8ff },
  frostjarl:  { name: 'The Frost Jarl', icon: '🧊', rig: 'viking', hp: 1700, speed: 0.95, bounty: 160, armor: 8, lives: 5, scale: 1.9, pose: 'march', boss: true, tint: 0xa8d8ff },
  gravelord:  { name: 'The Gravelord', icon: '⚰️', rig: 'mummy', hp: 2700, speed: 0.9, bounty: 200, armor: 6, lives: 6, scale: 2.0, pose: 'shamble', boss: true, regen: 18, tint: 0xc8ffc0 },
  hollowking: { name: 'The Hollow King', icon: '🫅', rig: 'wizard', hp: 4400, speed: 0.85, bounty: 320, armor: 10, lives: 20, scale: 2.1, pose: 'float', boss: true, tint: 0x9080b8, heal: { amount: 30, radius: 5, period: 2.5 } },
};

// Realm looks. decor = weighted model set scattered on free cells; ground/path
// feed the painted canvas; sky/fog/light feed world.js.
export const THEMES = {
  meadow: {
    name: 'Meadow', groundA: '#79a94f', groundB: '#8fbc5f', speckle: '#5d9040',
    path: '#b08a5e', pathEdge: '#7f6142',
    sky: '#7ec0ea', horizon: '#d9edf7', fog: '#cfe4ee', fogFar: 150,
    sun: 0xfff2d8, sunI: 2.6, amb: 0x9fc4e8, ambI: 0.75, hemi: 0.5,
    decor: [
      { m: 'tree_beech', w: 3, s: [0.8, 1.2] }, { m: 'tree_birch', w: 2, s: [0.8, 1.2] },
      { m: 'tree_spruce', w: 2, s: [0.8, 1.3] }, { m: 'bush_big', w: 2, s: [0.7, 1.1] },
      { m: 'bush_med', w: 2, s: [0.7, 1.1] }, { m: 'grass_g', w: 5, s: [0.8, 1.4] },
      { m: 'rock_large', w: 1, s: [0.5, 0.9] }, { m: 'mushroom', w: 1, s: [0.8, 1.3] },
    ],
    props: ['windmill', 'house_small', 'well', 'hay'],
  },
  autumn: {
    name: 'Autumn', groundA: '#97914e', groundB: '#ab9a55', speckle: '#7d7a40',
    path: '#8f6a48', pathEdge: '#654a32',
    sky: '#e8b97a', horizon: '#f6e2bc', fog: '#e8d5ae', fogFar: 140,
    sun: 0xffdba8, sunI: 2.4, amb: 0xc8a878, ambI: 0.7, hemi: 0.45,
    decor: [
      { m: 'tree_beech_or', w: 3, s: [0.8, 1.25] }, { m: 'tree_birch_or', w: 2, s: [0.8, 1.2] },
      { m: 'tree_spruce_or', w: 2, s: [0.8, 1.3] }, { m: 'grass_o', w: 5, s: [0.8, 1.4] },
      { m: 'bush_med', w: 1, s: [0.7, 1.0] }, { m: 'rock_large', w: 1, s: [0.5, 0.9] },
      { m: 'hay', w: 1, s: [0.7, 1.0] }, { m: 'mushroom', w: 1, s: [0.9, 1.4] },
    ],
    props: ['windmill', 'house_small', 'hay', 'barrel'],
  },
  winter: {
    name: 'Winter', groundA: '#dfe7ee', groundB: '#cbd7e2', speckle: '#b8c8d6',
    path: '#8a7458', pathEdge: '#5f5040',
    sky: '#b9cfe2', horizon: '#e8f0f7', fog: '#dfe9f2', fogFar: 130,
    sun: 0xeaf2ff, sunI: 2.2, amb: 0x9fb4d0, ambI: 0.8, hemi: 0.55,
    decor: [
      { m: 'tree_spruce_snow', w: 3, s: [0.8, 1.3] }, { m: 'tree_spruce_wh', w: 2, s: [0.8, 1.3] },
      { m: 'tree_beech_wh', w: 2, s: [0.8, 1.2] }, { m: 'grass_w', w: 4, s: [0.8, 1.3] },
      { m: 'rock_large', w: 1, s: [0.5, 0.9] }, { m: 'rock_sharp', w: 1, s: [0.5, 0.9] },
    ],
    props: ['house_small', 'well', 'lantern', 'crate'],
    snow: true,
  },
  ash: {
    name: 'Ashlands', groundA: '#55483f', groundB: '#463c35', speckle: '#39312b',
    path: '#7a6a58', pathEdge: '#4a3f34',
    sky: '#452f40', horizon: '#b05a38', fog: '#4a3840', fogFar: 110,
    sun: 0xff9868, sunI: 1.5, amb: 0x604858, ambI: 0.85, hemi: 0.35,
    decor: [
      { m: 'tree_bare', w: 3, s: [0.8, 1.3] }, { m: 'tree_broken', w: 2, s: [0.8, 1.2] },
      { m: 'rock_sharp', w: 2, s: [0.5, 1.0] }, { m: 'rock_pillar', w: 1, s: [0.4, 0.8] },
      { m: 'gravestone', w: 2, s: [0.8, 1.2] }, { m: 'gravestone_r', w: 1, s: [0.8, 1.2] },
      { m: 'gems_orange', w: 1, s: [0.8, 1.3] },
    ],
    props: ['fire', 'torch', 'skull_cave', 'coffin'],
    embers: true, torches: true,
  },
};

export const REALMS = [
  { name: 'The Meadow Realm', theme: 'meadow', levels: [1, 2, 3, 4, 5] },
  { name: 'The Autumn Realm', theme: 'autumn', levels: [6, 7, 8, 9, 10] },
  { name: 'The Winter Realm', theme: 'winter', levels: [11, 12, 13, 14, 15] },
  { name: 'The Ashlands', theme: 'ash', levels: [16, 17, 18, 19, 20] },
];

export const CFG = {
  lite: false,           // set from ?lite / auto-detect
  cam: { minR: 12, maxR: 58, phiMin: 0.32, phiMax: 1.15, r0: 30, phi0: 0.86 },
};
