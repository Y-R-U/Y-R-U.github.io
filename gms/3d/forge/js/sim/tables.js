// Every authored number that is data rather than formula. No logic lives here.
// SYSTEMS.md §3.2, §5.1, §6.1–6.6, §7.3.

export const ENEMIES = {
  grain_rat:   { level: 1,  hp: 10,   armour: 0,  damage: 5.1,  geo: 'rat',     xp: { cull: 40,  kindle: 12 },              drops: [['rat_tail', 1]], mk: 2 },
  mire_rat:    { level: 3,  hp: 52,   armour: 6,  damage: 10.3, geo: 'rat',     xp: { cull: 95,  kindle: 26 },              drops: [['rat_tail', 1]], mk: 4 },
  rat_knot:    { level: 4,  hp: 80,   armour: 0,  damage: 12.9, geo: 'rat',     xp: { cull: 60,  kindle: 18 },              drops: [['rat_tail', 1]], mk: 3, pack: 4 },
  sour_crow:   { level: 5,  hp: 112,  armour: 4,  damage: 15.5, geo: 'chicken', xp: { cull: 180, kindle: 60 },              drops: [['crow_quill', 1]], mk: 8 },
  creek_crab:  { level: 4,  hp: 80,   armour: 18, damage: 12.9, geo: 'rat',     xp: { cull: 130, kindle: 40, ward: 20 },    drops: [['crab_shell', 1]], mk: 7 },
  blight_boar: { level: 8,  hp: 226,  armour: 20, damage: 23.3, geo: 'rat',     xp: { cull: 340, kindle: 120, ward: 60 },   drops: [['boar_tusk', 1]], mk: 18 },
  hollow:      { level: 10, hp: 316,  armour: 22, damage: 28.5, geo: 'people',  xp: { kindle: 420, ward: 140 },             drops: [['hollow_ash', 1]], mk: 24, immune: ['cull'] },
  watchman:    { level: 12, hp: 416,  armour: 26, damage: 33.7, geo: 'people',  xp: { kindle: 700, ward: 280, glamour: 60 }, drops: [['watch_seal', 1]], mk: 34 },
  brood_mother:{ level: 6,  hp: 900,  armour: 12, damage: 26.0, geo: 'rat',     xp: { cull: 900, kindle: 300, ward: 120 },  drops: [['brood_sac', 1]], mk: 60, boss: true },
  champion_1:  { level: 14, hp: 2000, armour: 32, damage: 52,   geo: 'people',  xp: { kindle: 2400, ward: 900, cull: 600 }, drops: [['champion_token', 1]], mk: 250, boss: true },
  champion_2:  { level: 17, hp: 2900, armour: 36, damage: 68,   geo: 'people',  xp: { kindle: 3600, ward: 1400, cull: 900 }, drops: [['champion_token', 1]], mk: 400, boss: true },
  champion_3:  { level: 20, hp: 3600, armour: 40, damage: 84,   geo: 'people',  xp: { kindle: 5000, ward: 2000, cull: 1200 }, drops: [['champion_token', 1]], mk: 600, boss: true },
};

// Cull's share when a kill was dealt entirely by Kindle, and vice versa (SYSTEMS §3.2).
export const OFF_SCHOOL_SHARE = 0.5;
export const FIRST_OF_KIND_XP = 100;

export const CATCH = {
  whitewall: [
    { id: 'silverling',   req: 1,  weight: 46, value: 12,  xp: 70 },
    { id: 'chalk_trout',  req: 4,  weight: 30, value: 34,  xp: 140 },
    { id: 'snowbarb',     req: 9,  weight: 14, value: 96,  xp: 340 },
    { id: 'riverlight',   req: 15, weight: 3,  value: 420, xp: 980, rare: true },
    { id: 'weed',         req: 1,  weight: 7,  value: 1,   xp: 18,  junk: true },
  ],
  longacre: [
    { id: 'mudbream',     req: 1,  weight: 52, value: 9,   xp: 55 },
    { id: 'carp',         req: 3,  weight: 26, value: 22,  xp: 105 },
    { id: 'ford_eel',     req: 7,  weight: 13, value: 68,  xp: 250 },
    { id: 'goldenscale',  req: 13, weight: 3,  value: 300, xp: 720, rare: true },
    { id: 'reed_tangle',  req: 1,  weight: 6,  value: 1,   xp: 14,  junk: true },
  ],
  blackstone: [
    { id: 'silt_carp',    req: 2,  weight: 24, value: 26,  xp: 120 },
    { id: 'blackeel',     req: 5,  weight: 34, value: 76,  xp: 300 },
    { id: 'gravebarb',    req: 11, weight: 10, value: 240, xp: 780, rare: true },
    { id: 'sunken_relic', req: 1,  weight: 18, value: 55,  xp: 40,  junk: true },
    { id: 'drowned_coin', req: 1,  weight: 9,  value: 30,  xp: 20,  junk: true },
    { id: 'foul_water',   req: 1,  weight: 5,  value: 0,   xp: 10,  junk: true },
  ],
};

export const FORAGE = {
  whitewall: [
    { id: 'whitepetal',  tier: 1, weight: 60, value: 6,   xp: 45 },
    { id: 'chalk_sage',  tier: 2, weight: 28, value: 26,  xp: 130 },
    { id: 'dawnroot',    tier: 3, weight: 12, value: 130, xp: 410 },
  ],
  longacre: [
    { id: 'tuber',       tier: 1, weight: 30, value: 5,   xp: 45 },
    { id: 'wheatglass',  tier: 1, weight: 30, value: 8,   xp: 45 },
    { id: 'field_honey', tier: 2, weight: 28, value: 30,  xp: 130 },
    { id: 'ninefold',    tier: 3, weight: 12, value: 145, xp: 410 },
  ],
  blackstone: [
    { id: 'bitterroot',  tier: 1, weight: 60, value: 9,   xp: 45 },
    { id: 'gravecap',    tier: 2, weight: 28, value: 38,  xp: 130 },
    { id: 'nightbloom',  tier: 3, weight: 12, value: 210, xp: 410 },
  ],
};

export const ROCK = {
  chalk:      { req: 1,  item: 'stone_chip',  yield: 2, value: 4,   xp: 60 },
  iron_glass: { req: 5,  item: 'iron_shard',  yield: 1, value: 30,  xp: 190 },
  obsidian:   { req: 7,  item: 'obsidian_core', yield: 1, value: 145, xp: 520 },
};

export const RESPAWN = { common: 35, uncommon: 90, rare: 240 };
export const NODE_BUDGET = 40;
export const LIVE_RADIUS = 80;
export const ANCHORS_PER_REGION = { forage: 14, rock: 8 };
export const FISH_SPOTS_PER_RIVER_REGION = 4;

export const PERISHABLE = new Set([
  ...Object.values(CATCH).flat().filter(e => !e.junk).map(e => e.id),
  ...Object.values(FORAGE).flat().map(e => e.id),
]);

const raw = {};
for (const list of Object.values(CATCH)) for (const e of list) raw[e.id] = e.value;
for (const list of Object.values(FORAGE)) for (const e of list) raw[e.id] = e.value;
for (const r of Object.values(ROCK)) raw[r.item] = r.value;

export const ITEM_VALUE = {
  ...raw,
  rat_tail: 3, crow_quill: 9, crab_shell: 14, boar_tusk: 40,
  hollow_ash: 60, watch_seal: 110, brood_sac: 180, champion_token: 500,
  thread: 4, hearth_ash: 0,
};

export const COOKED_MUL = 2.4;
export const BURNT_VALUE = 1;
// 1.8 put Hearth at 400 cooks to cap against Kindle's 150 kills, and the critical path only
// ever serves about 17 cooks. 4.0 puts a level-appropriate cook on the §2.3 yardstick of ~350.
export const COOK_XP_MUL = 4.0;
export const BURNT_XP_MUL = 0.80;

// Barter's flat per-transaction XP needs an item tier; SYSTEMS gives the payouts but not the
// value bands that select them. These bands are the tuning surface for that.
export const BARTER_TIER_XP = [45, 120, 300, 700, 1500];
export const BARTER_TIER_VALUE = [25, 80, 250, 700];
export const BARTER_GARNISH = 0.02;
export const APPRAISE_XP = 60;

export const MEND_XP_PER_TIER = 120;
export const MEND_FIRST_DAILY_MUL = 3;
export const WARD_XP_BRACED = 12;
export const WARD_XP_BARE = 3;
export const WARD_XP_ROOT = 20;
export const GLAMOUR_XP_EVADE = 60;
export const GLAMOUR_UNGRAFT = { base: 400, perSecond: 25, cap: 1600, suspicionUnder: 40 };
export const GLAMOUR_XP_COOLED = 200;

export const INTEGRITY = {
  tap: -0.05, charged: -0.20, milestone: -0.60, gutter: -8,
  mendGain: (mendLevel) => 12 + 4.5 * mendLevel,
  weakBelow: 30, weakMul: 0.75, mendFocus: 14,
};

export const CHARMS = [
  { tier: 1, core: ['stone_chip', 3], reagent: 'common',   grasp: 0,   mag: 0.04, cost: 40 },
  { tier: 2, core: ['iron_shard', 1], reagent: 'uncommon', grasp: 48,  mag: 0.09, cost: 180 },
  { tier: 3, core: ['obsidian_core', 1], reagent: 'rare',  grasp: 96,  mag: 0.16, cost: 700 },
  { tier: 4, core: ['obsidian_core', 2], reagent: 'rare',  grasp: 140, mag: 0.24, cost: 2000, second: true },
];

export const SHOP = {
  mending_kit: { price: 20, note: '5 threads' },
  cooked_silverling: { price: 7 },
  coarse_line: { price: 40, charm: 1, school: 'line' },
  whetted_core: { price: 40, charm: 1, school: 'kindle' },
  warm_cord: { price: 55, charm: 1, school: 'ward' },
};

export const FERRY = { adjacent: 12, endToEnd: 30, trustedMul: 0.5, swornMul: 0 };
export const STALL_RENT = 200;
export const STALL_BARTER_LEVEL = 12;

export const BANDS = {
  whitewall_low:      [1, 3],
  river:              [2, 5],
  fields:             [3, 5],
  whitewall_upper:    [5, 8],
  blackstone_approach:[8, 12],
  blackstone_town:    [10, 14],
  finale:             [14, 20],
};

export const REGION_ENEMIES = {
  whitewall_low:      ['grain_rat', 'mire_rat'],
  river:              ['mire_rat', 'rat_knot', 'creek_crab'],
  fields:             ['rat_knot', 'sour_crow'],
  whitewall_upper:    ['sour_crow', 'blight_boar'],
  blackstone_approach:['hollow', 'blight_boar', 'watchman'],
  blackstone_town:    ['watchman', 'hollow'],
  finale:             ['champion_1', 'champion_2', 'champion_3'],
};

export const HOSTILE_CAP = 24;
export const SPAWN_RADIUS = 45;
export const DESPAWN_RADIUS = 70;
