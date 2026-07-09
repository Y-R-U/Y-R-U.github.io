// ============================================================
// HEXPIRE — all balance numbers + colours live here.
// Tweak freely; nothing else in the codebase hardcodes these.
// ============================================================

export const CFG = {

  // ---- economy ----
  startCoins: 20,
  // each fully-controlled (uncontested) land hex earns HEX_INCOME coin.
  // Aaron's spec said 1/hex, but a starting L3 base claims ~45 hexes which
  // would print 45+/turn — 1 coin per 4 hexes keeps expansion rewarding
  // without trivialising every price.
  hexIncomePer: 4,          // 1 coin per N fully-controlled hexes

  // ---- home base, levels 1..5 ----
  // radius = claim/arrow/aura reach in hex distance
  base: [
    null,
    { def: 1, radius: 2, arrows: 0, income: 3, hp: 12 },   // L1
    { def: 1, radius: 3, arrows: 1, income: 4, hp: 14 },   // L2
    { def: 1, radius: 4, arrows: 2, income: 5, hp: 16 },   // L3 (start)
    { def: 1, radius: 5, arrows: 3, income: 6, hp: 18 },   // L4
    { def: 2, radius: 5, arrows: 3, income: 7, hp: 22 },   // L5
  ],
  // spec was 10 flat per upgrade — too cheap once income scales;
  // cost to upgrade FROM level i is baseUpgrade[i]
  baseUpgrade: [0, 10, 20, 30, 40],
  startBaseLevel: 3,
  autoBaseLevel: 1,          // free base spawned on split-off land
  autoBaseMinTiles: 4,       // components smaller than this don't get one

  // ---- towers ----
  towers: {
    wood:   { name: 'Wooden Tower', def: 1, arrows: 1, radius: 1, cost: 10, hp: 6 },
    stone:  { name: 'Stone Tower',  def: 1, arrows: 2, radius: 2, cost: 20, hp: 9 },
    mortar: { name: 'Mortar Tower', def: 2, arrows: 3, radius: 3, cost: 30, hp: 13 },
  },
  towerOrder: ['wood', 'stone', 'mortar'],   // upgrade path; cost = price difference

  // ---- villages ----
  villageIncome: 5,
  villageHp: 4,
  // spec was 5/10/15 — a 5-coin village paying +5/turn is a 1-turn payback,
  // so every empire would only ever build villages. 10/15/20 keeps them
  // strong but contestable.
  villageCost: (owned) => owned < 3 ? 10 : owned < 10 ? 15 : 20,

  // ---- armies, levels 1..10 ----
  armyMoves: 5,               // move points per turn; attacking costs 1
  musterRadius: 2,            // recruits appear within this range of a base
  armyCost: (lvl) => lvl * 10,
  armyAtk:  (lvl) => lvl + 2,
  armyDef:  (lvl) => lvl,
  armyHp:   (lvl) => lvl + 2,
  armyMax: 10,

  auraCap: 3,                 // stacked defence auras cap at +3
  glancingMargin: 2,          // atk within this of def still lands 1 dmg
  arrowDamage: 1,
  repelDamage: 1,             // attacker damage when an attack is repelled
  sellRefund: 0.5,            // of total invested
  // AI army count budget — few big hosts beat many small jams
  armyCap: (income) => Math.min(3 + Math.floor(income / 15), 12),

  // ---- empires ----
  maxEmpires: 6,
  colors: [
    { name: 'Azure',   hex: 0x3d7dff, css: '#3d7dff' },
    { name: 'Crimson', hex: 0xe8453c, css: '#e8453c' },
    { name: 'Violet',  hex: 0x9b59e8, css: '#9b59e8' },
    { name: 'Amber',   hex: 0xf0a020, css: '#f0a020' },
    { name: 'Teal',    hex: 0x1fb89a, css: '#1fb89a' },
    { name: 'Rose',    hex: 0xe862ad, css: '#e862ad' },
  ],
  aiNames: ['Ashfall', 'Duskwood', 'Stormhold', 'Braemar', 'Vael', 'Ironmoor',
            'Karst', 'Wrenfell', 'Oldmere', 'Thornby'],

  // ---- board look ----
  neutralTop: 0x6fae4e,       // land starts green
  neutralTopVar: 0.05,        // per-tile colour jitter
  contestedTop: 0x9a9a92,     // shared claims go grey
  sideColor: 0x7a6647,        // earthy prism sides
  waterColor: 0x2a5d8f,
  waterDeep: 0x1c3f66,
  hexSize: 1,                 // world units, corner radius
  tileH: 0.42,                // prism height
  ownTint: 0.62,              // how strongly owner colour tints claimed land

  personalities: {
    balanced:     { label: 'Balanced',     village: 1.0, tower: 1.0, army: 1.0, upgrade: 1.0, aggro: 1.0 },
    expansionist: { label: 'Expansionist', village: 0.7, tower: 1.7, army: 0.6, upgrade: 1.5, aggro: 0.7 },
    warlord:      { label: 'Warlord',      village: 0.5, tower: 0.6, army: 2.0, upgrade: 0.7, aggro: 1.8 },
    economist:    { label: 'Economist',    village: 2.0, tower: 0.8, army: 0.5, upgrade: 1.2, aggro: 0.5 },
    turtle:       { label: 'Turtle',       village: 1.1, tower: 1.6, army: 0.8, upgrade: 1.0, aggro: 0.3 },
  },
};
