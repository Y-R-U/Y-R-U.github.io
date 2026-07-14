// GRUDGE BUGS — every balance number, colour and knob. Tweak here only.

export const PHYS = {
  gravity: -13.5,            // chunky worms-y arcs
  windMax: 3.2,              // horizontal accel at full wind
  dt: 1 / 120,               // fixed sim step
  maxFlight: 12,             // s — projectile watchdog
  killY: -6,                 // below this = splash
  ledgeHalfW: 0.55,          // walkable half-width of a ledge
  ledgeThick: 0.42,
  bugRadius: 0.34,           // body sphere for hits
  bugHeight: 0.55,
  ragDrag: 0.15,             // knocked-bug air drag
  ragBounce: 0.25,           // restitution when slamming a ledge top
  landDmgV: 5.5,             // vertical speed above which landing hurts
  landDmgMul: 4.5,           // dmg per m/s over threshold
};

export const RULES = {
  bugHP: 100,
  turnTime: 45,              // s, player only
  moveBudget: 9,             // walk distance per turn (world units)
  walkSpeed: 2.1,
  suddenDeathRound: 9,       // rounds (full team cycles) until THE JAM RISES
  jamRisePerTurn: 0.55,      // killY climbs this much per turn once risen
  retreatTime: 2.2,          // s of free walking after firing
  fallSplashDmg: 999,
};

export const ECON = {
  battleBase: 20, perKill: 10, winBonus: 30, storyFirstClear: 100,
  daily: [15, 20, 25, 30, 40, 50, 80],   // 7-day streak chest
};

// ---------------- weapons ----------------
// kind: arc (ballistic), bounce (grenade), roll (along ledge), direct (fast flat),
//       melee, strike (called from the sky)
export const WEAPONS = [
  { id: 'bazooka', name: 'Acorn RPG', icon: '🚀', kind: 'arc', ammo: -1,
    dmg: 45, radius: 1.7, impulse: 9.5, wind: 1, speed: 14, gravityMul: 1,
    desc: 'Trusty acorn on a stick. Rides the wind.' },
  { id: 'grenade', name: 'Berry Bomb', icon: '🍒', kind: 'bounce', ammo: -1,
    dmg: 48, radius: 1.9, impulse: 10, wind: 0, speed: 11, gravityMul: 1,
    fuse: 3, rest: 0.45, desc: '3-second fuse. Bounces. Judge the wobble.' },
  { id: 'cluster', name: 'Rotten Berry', icon: '🫐', kind: 'bounce', ammo: 2,
    dmg: 22, radius: 1.1, impulse: 6, wind: 0, speed: 11, gravityMul: 1,
    fuse: 2.2, rest: 0.4, shards: 4, shardDmg: 18, shardRadius: 1.0,
    desc: 'Pops into four angry little berries.' },
  { id: 'dungball', name: 'Dung Ball', icon: '💩', kind: 'roll', ammo: 2,
    dmg: 40, radius: 1.6, impulse: 9, wind: 0, speed: 4.2, fuse: 4,
    desc: 'Rolls along the ledge. A gift from Dung & Sons.' },
  { id: 'loogie', name: 'The Loogie', icon: '💦', kind: 'direct', ammo: -1,
    dmg: 18, radius: 0.7, impulse: 12, wind: 0.25, speed: 24, gravityMul: 0.35,
    desc: 'Fast, flat, rude. Massive shove — mind the drop.' },
  { id: 'slap', name: 'The Slap', icon: '🖐️', kind: 'melee', ammo: -1,
    dmg: 12, radius: 1.1, impulse: 13.5, range: 1.25,
    desc: 'Diplomacy is dead. Push them off.' },
  { id: 'shoe', name: 'THE SHOE', icon: '🩴', kind: 'strike', ammo: 1,
    dmg: 75, radius: 2.4, impulse: 11, aim: 'point',
    desc: 'Call down the Human’s flip-flop. Once per grudge.' },
  { id: 'bee52', name: 'Bee-52', icon: '🐝', kind: 'strike', ammo: 1, aim: 'line',
    dmg: 26, radius: 1.2, impulse: 7, bombs: 5, span: 7,
    desc: 'Freelance wasps carpet-bomb a line. Once per grudge.' },
];

// ---------------- factions ----------------
export const FACTIONS = [
  { id: 'ants', name: 'The Picnic Mob', species: 'ant', emoji: '🐜',
    color: 0xc9452c, accent: 0x8c2517, ui: '#ff7a5e',
    persona: 'mobster', outfit: 'fedora',
    voice: { base: 620, spread: 160, rate: 11, wave: 'square' },
    names: ['Don Crumbo', 'Tony Thorax', 'Little Larva', 'Sal Mandible', 'Vinnie Sixlegs', 'Knuckles'] },
  { id: 'beetles', name: 'Dung & Sons Ltd.', species: 'beetle', emoji: '🪲',
    color: 0x4c5a86, accent: 0xf2b13b, ui: '#8fa7ff',
    persona: 'builder', outfit: 'hardhat',
    voice: { base: 200, spread: 55, rate: 6.5, wave: 'sawtooth' },
    names: ['Big Keith', 'Gaffer Dave', 'Two-Loads Terry', 'Apprentice Gary', 'Health & Safety Steve', 'Barry the Ball'] },
  { id: 'spiders', name: 'House Silk', species: 'spider', emoji: '🕷️',
    color: 0x5b3a75, accent: 0xd9c8ea, ui: '#c69aff',
    persona: 'goth', outfit: 'tophat',
    voice: { base: 360, spread: 220, rate: 8, wave: 'triangle' },
    names: ['Baroness Webly', 'Edgar', 'Morticia', 'Lord Spinneret', 'Gossamer', 'The Widow'] },
  { id: 'wasps', name: 'Sting Corp.', species: 'wasp', emoji: '🐝',
    color: 0xd9a514, accent: 0x232323, ui: '#ffd94a',
    persona: 'corporate', outfit: 'tie',
    voice: { base: 500, spread: 90, rate: 13, wave: 'sawtooth' },
    names: ['Brad from Sales', 'Karen (Regional)', 'The Intern', 'Synergy Sue', 'Jeff KPI', 'HR Deborah'] },
  { id: 'mantis', name: 'The Mantis', species: 'mantis', emoji: '🦗',
    color: 0x5f9e3e, accent: 0xdff0c8, ui: '#8be24a',
    persona: 'zen', outfit: 'strawhat', boss: true,
    voice: { base: 280, spread: 40, rate: 4.5, wave: 'sine' },
    names: ['Master Mantis'] },
];

// cosmetic hats (player team only, bought with coins)
export const HATS = [
  { id: 'none', name: 'Bare Head', emoji: '🚫', price: 0, desc: 'Au naturel.' },
  { id: 'cone', name: 'Traffic Cone', emoji: '🚧', price: 100, desc: 'You are now road works.' },
  { id: 'party', name: 'Party Hat', emoji: '🎉', price: 120, desc: 'Every explosion is a party.' },
  { id: 'chef', name: 'Chef Hat', emoji: '👨‍🍳', price: 180, desc: 'You ARE the sandwich now.' },
  { id: 'cowboy', name: 'Cowboy Hat', emoji: '🤠', price: 220, desc: 'This ledge ain’t big enough.' },
  { id: 'viking', name: 'Viking Helm', emoji: '⚔️', price: 300, desc: 'Pillage the picnic.' },
  { id: 'crown', name: 'Tiny Crown', emoji: '👑', price: 450, desc: 'Rule the crumbs.' },
  { id: 'halo', name: 'Halo', emoji: '😇', price: 600, desc: 'Practice for where you’re going.' },
];

// ---------------- arenas ----------------
export const THEMES = [
  { id: 'garden', name: 'Garden Fence', emoji: '🌻', sky: [0x8ec9ef, 0xdff2f7], fog: 0xbfe4ee,
    sun: 0xfff2d0, ground: 'pond', wood: 0x9a7648, wood2: 0x7d5c34 },
  { id: 'kitchen', name: 'Midnight Kitchen', emoji: '🍳', sky: [0x1a2136, 0x3c4668], fog: 0x232c47,
    sun: 0xaac4ff, ground: 'sink', wood: 0xb8b2a4, wood2: 0x8f8878 },
  { id: 'picnic', name: 'Picnic Blanket', emoji: '🧺', sky: [0x86c7ec, 0xfbe9c4], fog: 0xcfe8e0,
    sun: 0xffedc0, ground: 'jam', wood: 0xc46a4f, wood2: 0xa14e36 },
  { id: 'bbq', name: 'BBQ at Dusk', emoji: '🔥', sky: [0x3a2333, 0xd96f3a], fog: 0x59333a,
    sun: 0xffb070, ground: 'coals', wood: 0x5a4a44, wood2: 0x42332f },
];

export const WIND_LABELS = [
  [0.00, 'dead calm'], [0.15, 'a gentle sigh'], [0.35, 'someone’s sneeze'],
  [0.55, 'crisp packet weather'], [0.75, 'angry hairdryer'], [0.92, 'ABSOLUTE HURRICANE'],
];

// ---------------- AI ----------------
export const AI = {
  thinkTime: [0.7, 1.5],     // s pretend-thinking
  diffs: [
    { id: 'mild', name: 'Mild Salsa', err: 0.30, moveSmart: 0.3, weaponSmart: 0.3 },
    { id: 'spicy', name: 'Spicy', err: 0.16, moveSmart: 0.6, weaponSmart: 0.65 },
    { id: 'nuclear', name: 'Nuclear', err: 0.06, moveSmart: 0.9, weaponSmart: 0.9 },
  ],
  samples: 20,               // candidate shots evaluated per turn
};

// ---------------- cameras ----------------
export const CAM = {
  fov: 55,
  orbitDist: [3.2, 26], orbitDist0: 10,
  orbitPitch: [-0.15, 1.25], orbitPitch0: 0.42,
  aimDist: 3.4, aimHeight: 1.1, aimSide: 0.8,
  flyTime: 1.35,
  followBack: 2.1, followUp: 0.5, followFovKick: 12,
  slowNear: 0.35,            // world timescale near impact
  impactHold: 0.9, impactSlow: 0.12, impactDist: 6.5,
  replayChance: 1.0,         // epic events always replay (settings can disable)
  shake: 1.0,
};

export const REPLAY_ANGLES = [
  { id: 'low', label: 'worm’s eye' },
  { id: 'drone', label: 'drone cam' },
  { id: 'victim', label: 'victim cam' },
  { id: 'dolly', label: 'side dolly' },
  { id: 'security', label: 'ledge security cam' },
];

export const QUALITY = { shadow: 1024, pixelCap: 2 };
