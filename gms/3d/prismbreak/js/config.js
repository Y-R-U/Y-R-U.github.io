// Prism Break — central tuning + content tables. No three.js imports (node-safe).

export const GRID = { cols: 8, rows: 8 };

// gem colors: index order is fixed (save-safe). hex = glass tint, metal = metal tint.
export const GEM_COLORS = [
  { name: 'ruby',     hex: 0xf0102e, metal: 0xc02038, glow: 0xff5566 },
  { name: 'amber',    hex: 0xffa018, metal: 0xd98c1f, glow: 0xffc860 },
  { name: 'emerald',  hex: 0x2eea6a, metal: 0x2bb95a, glow: 0x7cffab },
  { name: 'sapphire', hex: 0x2e7bff, metal: 0x3567cf, glow: 0x74a9ff },
  { name: 'amethyst', hex: 0xb44dff, metal: 0x9445cf, glow: 0xd393ff },
  { name: 'ice',      hex: 0x35e0e8, metal: 0x39b6bc, glow: 0x9df3f7 },
];

export const SPECIALS = {
  lineH:  { label: 'ROW BLASTER' },
  lineV:  { label: 'COLUMN BLASTER' },
  burst:  { label: 'STARBURST' },
  nova:   { label: 'SUPERNOVA' },
  prism:  { label: 'PRISM ORB' },
};

export const SCORE = {
  gem: 10, metal: 20, crush: 60,
  special: 40, novaGem: 15,
  cascadeMult: (k) => Math.min(1 + (k - 1) * 0.5, 6), // x1, x1.5, x2 ... cap x6
  blitzSeconds: 90,
  blitzCascadeBonus: 1.5,   // seconds added per cascade level >= 3
  zenMilestone: 5000,       // shards drip every N points in zen
};

export const FORGE = { metal: 8, crush: 34, special: 6 }; // % fill per event

export const PRAISE = [
  null, null,
  'NICE!', 'GREAT!', 'SPECTACULAR!', 'PRISMATIC!', 'UNREAL!', 'GODLIKE!!',
];

export const CALLOUTS = {
  line:  ['BLASTER!', 'ZAP LINE!'],
  burst: ['STARBURST!', 'BOOM!'],
  nova:  ['SUPERNOVA!!'],
  prism: ['PRISM ORB!'],
  crush: ['SHATTERED!', 'CRUSHED!', 'GLASS DOWN!'],
  comboLL: ['CROSSFIRE!'],
  comboLB: ['MEGA CROSS!'],
  comboBB: ['DOUBLE BOOM!'],
  comboPC: ['COLOR WIPE!'],
  comboPL: ['LASER STORM!!'],
  comboPB: ['CHAIN REACTION!!'],
  comboPP: ['TOTAL SHATTER!!!'],
};

// ── themes (shop cosmetics) ───────────────────────────────────────────────
export const THEMES = {
  aurora: { name: 'Aurora',  price: 0,    bgTop: 0x120f2e, bgBot: 0x1c0b33, fog: 0x140f30, frame: 0x8fa3ff, boardTint: 0x0d0b22, crystal: 0x6a5dff, star: 0xbfd0ff },
  molten: { name: 'Molten',  price: 1500, bgTop: 0x230a08, bgBot: 0x3a1204, fog: 0x2a0d06, frame: 0xffb347, boardTint: 0x1a0906, crystal: 0xff5a1f, star: 0xffd9a0 },
  abyss:  { name: 'Abyss',   price: 1500, bgTop: 0x03121f, bgBot: 0x051f30, fog: 0x04141f, frame: 0x3fd8c2, boardTint: 0x03101a, crystal: 0x1f89ff, star: 0x9fe8ff },
  neon:   { name: 'Neon',    price: 2500, bgTop: 0x14041f, bgBot: 0x2b0736, fog: 0x180527, frame: 0xff3ff0, boardTint: 0x10031a, crystal: 0xff2ea8, star: 0x64f9ff },
  royal:  { name: 'Royal Gold', price: -1, bgTop: 0x1a1204, bgBot: 0x2e2006, fog: 0x1d1505, frame: 0xffd700, boardTint: 0x171003, crystal: 0xffc21f, star: 0xfff3b0 }, // monthly milestone exclusive
};

// ── boosters ──────────────────────────────────────────────────────────────
export const BOOSTERS = {
  hammer:  { icon: '🔨', name: 'Forge Hammer', desc: 'Smash any single gem (sets off specials).', price: 200 },
  swap:    { icon: '🔁', name: 'Free Swap',    desc: 'Swap any two adjacent gems — no match needed, no move spent.', price: 250 },
  moves:   { icon: '➕', name: '+5 Moves',      desc: 'Add five extra moves, mid-level or when out of moves.', price: 300 },
  shuffle: { icon: '🎲', name: 'Reshuffle',    desc: 'Reshuffle the whole board.', price: 150 },
  rainbow: { icon: '🌈', name: 'Rainbow Start', desc: 'Begin the level with a Prism Orb on the board.', price: 400 },
};

// ── daily rewards: 7-day streak cycle ─────────────────────────────────────
export const DAILY = [
  { shards: 100 },
  { shards: 150 },
  { booster: 'hammer', n: 1 },
  { shards: 250 },
  { booster: 'swap', n: 1, shards: 100 },
  { shards: 400 },
  { shards: 750, booster: 'rainbow', n: 1, mega: true },
];
export const MONTHLY_GOAL = 20;           // claims in a calendar month
export const MONTHLY_REWARD = { theme: 'royal', shards: 1000 };

export const AD = {
  dailyDouble: true,           // double today's daily claim
  freeShards: 250,             // shop freebie value
  freeShardsPerDay: 3,         // times per day
  resultsBonus: 0.5,           // +50% of earned shards after a level
  rescueMoves: 5,              // continue with +5 moves on fail
};

// ── weekly challenge reward tiers (blitz score thresholds) ────────────────
export const WEEKLY_TIERS = [
  { score: 8000,  shards: 200 },
  { score: 20000, shards: 400 },
  { score: 45000, shards: 900, booster: 'rainbow', n: 1 },
];

// ── events: deterministic schedule from the date ──────────────────────────
// weekend event Fri–Sun rotates by ISO week; midweek event every Wednesday.
export const EVENTS = {
  goldrush: {
    name: 'GOLD RUSH', icon: '🪙', mode: 'blitz',
    desc: 'Metal gems everywhere and worth triple. Crush sandwiches pay out huge.',
    mods: { metalChance: 0.28, metalScoreMult: 3 },
    tiers: [ { score: 10000, shards: 250 }, { score: 25000, shards: 500 }, { score: 50000, shards: 1200 } ],
  },
  shatterstorm: {
    name: 'SHATTERSTORM', icon: '🥂', mode: 'blitz',
    desc: 'Glass is fragile tonight — crushes score 4× and set off shockwaves.',
    mods: { metalChance: 0.2, crushScoreMult: 4, crushShockwave: true },
    tiers: [ { score: 9000, shards: 250 }, { score: 22000, shards: 500 }, { score: 45000, shards: 1200 } ],
  },
  prismfrenzy: {
    name: 'PRISM FRENZY', icon: '🌈', mode: 'blitz',
    desc: 'A free Prism Orb drops onto the board every 15 seconds. Go wild.',
    mods: { prismEvery: 15 },
    tiers: [ { score: 12000, shards: 250 }, { score: 30000, shards: 500 }, { score: 60000, shards: 1200 } ],
  },
  twilightzen: {
    name: 'TWILIGHT ZEN', icon: '🌒', mode: 'zen',
    desc: 'Midweek wind-down: every zen milestone pays double shards.',
    mods: { zenShardMult: 2 },
    tiers: [ { score: 15000, shards: 300 }, { score: 40000, shards: 700 } ],
  },
};
export const WEEKEND_ROTATION = ['goldrush', 'shatterstorm', 'prismfrenzy'];

// shards economy
export const ECON = {
  levelWin: (score, stars) => Math.round(score / 100) + stars * 25,
  blitz: (score) => Math.round(score / 150),
  weeklyFirstRun: 50,
};
