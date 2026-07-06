// All tuning in one place. CLAUDE.md mirrors the headlines; this is the truth.

export const CELL = 2;                 // world units per cell
export const GRID = 96;                // cells per side
export const HALF = GRID * CELL / 2;   // island half-extent (96)
export const SEA = 0;                  // water level (y)

export const CFG = {
  lite: false,
  cam: { r0: 74, minR: 16, maxR: 170, phi0: 0.88, phiMin: 0.30, phiMax: 1.22 },

  // day cycle (fractions of one day; dayLength seconds at 1×)
  day: {
    length: 120,
    sunrise: 0.05, morning: 0.13, sunset: 0.55, dusk: 0.62,
    prayEnd: 0.78,                     // pray dusk→prayEnd, then sleep→sunrise
  },

  villager: {
    speed: 2.5, runSpeed: 3.8, leylineBoost: 1.45,
    hp: 20, dmg: 3, atkCd: 1.1,
    guardHp: 45, guardDmg: 8, guardRange: 14, guardCd: 1.2,
    eatAtDawn: 1,                      // food per villager
    hungryAt: 0.5, starveDps: 0.35,    // hunger 0..1/day; below 0 → hp drain
    growTime: 70,                      // child → adult (s)
    birthEvery: 12, birthFoodSpare: 6, // checks; needs food ≥ pop+spare & housing
    prayFaith: 0.45,                   // faith/s praying at the fire
    templeMul: 2.0,
    leyTrickle: 0.03,                  // faith/s while walking a leyline
  },

  econ: {
    start: { food: 30, wood: 25, stone: 0, faith: 22 },
    treeWood: 4, chopTime: 8,
    bushFood: 5, forageTime: 6, bushRegrow: 55,
    plotFood: 10, sowTime: 5, growTime: 55, harvestTime: 5,
    chipStone: 4, chipTime: 9,
    saplingGrow: 80,
    hqRadius: 9,                       // stockpile drop radius (fire/storehouse)
  },

  sculpt: {
    r0: 5.5, rMin: 3, rMax: 11,        // brush radius (world units)
    rate: 7,                           // metres/sec at brush centre
    cost: 0.05,                        // faith per corner·metre moved (~3/s full brush)
    maxH: 13, minH: -3,
    uprootDelta: 1.4,                  // |Δh| that uproots a tree into logs
  },

  faithCap: [30, 60, 100, 160, 240],   // by age (1-indexed -1)

  wolves: { hp: 25, dmg: 5, atkCd: 0.9, speed: 4.2, chance: 0.45, from: 3 },
  raiders: {
    hp: 35, dmg: 6, atkCd: 1.0, speed: 2.7, steal: 12, from: 4,
    everyDays: [2, 3], torchDps: 5, buildingHp: 60,
  },
  tower: { dmg: 6, range: 16, cd: 1.1 },
};

// ── Ages ────────────────────────────────────────────────────────────────────
export const AGES = [
  { n: 1, name: 'Age of Hearth', icon: '🔥',
    story: 'Your folk are few and the fire is small. Feed them, house them.',
    build: ['hut'], miracles: [], modes: [] },
  { n: 2, name: 'Age of Field', icon: '🌾', need: { pop: 8 },
    story: 'The tribe grows. Teach them to sow the earth and walk your lines.',
    build: ['farm', 'lodge'], miracles: ['rain'], modes: ['leyline'] },
  { n: 3, name: 'Age of Stone', icon: '🪨', need: { pop: 14 },
    story: 'Cut stone from the crags — and keep the fire lit. Wolves smell the flock.',
    build: ['quarry', 'storehouse'], miracles: ['sprout'], modes: [], threats: ['wolves'] },
  { n: 4, name: 'Age of Faith', icon: '⛪', need: { pop: 20, stone: 10 },
    story: 'Raise a temple. Long ships prowl the grey water.',
    build: ['temple', 'watchtower'], miracles: ['smite'], modes: [], threats: ['raiders'] },
  { n: 5, name: 'Age of Wonder', icon: '🌟', need: { pop: 28, temple: 1 },
    story: 'Raise the Monument, stone by stone, and take your place in the sky.',
    build: ['monument'], miracles: ['sunburst'], modes: [] },
];

// ── Buildings ───────────────────────────────────────────────────────────────
// size = footprint in cells (square). flat = max height spread allowed.
export const BUILDINGS = {
  hut: {
    name: 'Hut', icon: '🛖', cost: { wood: 12 }, size: 2, hp: 60,
    houses: 4, model: 'hut', scale: 0.95, age: 1,
    desc: 'Houses 4 folk. Folk multiply when fed and housed.',
  },
  farm: {
    name: 'Farm', icon: '🌾', cost: { wood: 20 }, size: 5, hp: 70,
    model: 'windmill', scale: 0.45, age: 2, job: { type: 'farmer', n: 2 },
    desc: 'Nine plots and a mill. Two farmers sow and harvest food.',
  },
  lodge: {
    name: 'Lodge', icon: '🪓', cost: { wood: 16 }, size: 2, hp: 60,
    model: 'lodge', scale: 1.35, age: 2, job: { type: 'forester', n: 1 },
    desc: 'A forester plants saplings and fells mature trees nearby.',
  },
  quarry: {
    name: 'Quarry', icon: '⛏', cost: { wood: 20 }, size: 3, hp: 70,
    model: 'crane', scale: 0.8, age: 3, job: { type: 'quarrier', n: 2 }, needsRock: true,
    desc: 'Must touch bare rock. Two quarriers cut stone.',
  },
  storehouse: {
    name: 'Storehouse', icon: '🏬', cost: { wood: 24, stone: 6 }, size: 3, hp: 90,
    model: 'storehouse', scale: 0.95, age: 3,
    desc: 'A second drop-off point — shorter hauls, faster village.',
  },
  temple: {
    name: 'Temple', icon: '⛪', cost: { wood: 30, stone: 20 }, size: 4, hp: 110,
    model: 'temple', scale: 1.0, age: 4, job: { type: 'priest', n: 1 },
    desc: 'Prayers here count double. A priest tends the flame.',
  },
  watchtower: {
    name: 'Watchtower', icon: '🏹', cost: { wood: 14, stone: 10 }, size: 2, hp: 90,
    model: 'watchtower', scale: 0.65, age: 4, job: { type: 'guard', n: 1 },
    desc: 'A guard keeps the night watch and looses arrows at threats.',
  },
  monument: {
    name: 'Monument', icon: '🗿', cost: { wood: 25, stone: 35 }, size: 5, hp: 500,
    model: null, scale: 1, age: 5, stages: 3, consecrate: 60,
    desc: 'Three risings, three blessings — then eternity.',
  },
};

// ── Miracles ────────────────────────────────────────────────────────────────
export const MIRACLES = {
  rain: { name: 'Rain', icon: '🌧', cost: 20, cd: 30, r: 13, age: 2, aim: true,
          desc: 'Crops surge, berries regrow, fires die.' },
  sprout: { name: 'Sprout', icon: '🌳', cost: 30, cd: 45, r: 9, age: 3, aim: true,
            desc: 'A young forest springs from bare earth.' },
  smite: { name: 'Smite', icon: '⚡', cost: 15, cd: 8, r: 2.5, age: 4, aim: true,
           desc: 'A bolt from the sky. Wolves and raiders burn.' },
  sunburst: { name: 'Sunburst', icon: '☀️', cost: 60, cd: 150, r: 0, age: 5, aim: false, dur: 30,
              desc: 'Golden light: all folk work half again as fast.' },
};

// job → rig model pools (man/woman variants; children grow into these)
export const JOB_MODELS = {
  villager: ['man_casual', 'woman_casual', 'man_farm', 'woman_farm'],
  farmer: ['man_farm', 'woman_farm'],
  forester: ['man_lumberjack', 'woman_lumberjack'],
  quarrier: ['man_carpenter', 'woman_carpenter'],
  priest: ['man_wizard'],
  guard: ['man_knight'],
  raider: ['man_viking', 'woman_viking'],
  child: ['boy', 'girl'],
};
