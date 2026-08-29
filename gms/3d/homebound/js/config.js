// HOMEBOUND — central tuning. Anything that changes how the game *feels* lives
// here, so a balance pass never touches a system file. Data that several
// systems must agree on (tier ladder, gate effects, palette) also lives here:
// it is the shared vocabulary, and duplicating it is how the crowd ends up a
// different colour from its own outline.

const Q = new URLSearchParams(location.search);

// --------------------------------------------------------------------------
// URL test hooks
// --------------------------------------------------------------------------
export const DEV_MODE  = Q.has('dev');
export const LITE_MODE = Q.has('lite');
export const AUTO_MODE = Q.has('auto');            // AI thumb drives the squad
export const WIPE_ARG  = Q.has('wipe');
export const SHOT_ARG  = Q.get('shot') || '';      // staged frame id for the harness
export const START_ARG = Q.get('start') || '';     // run | main | home | store
export const LEVEL_ARG = parseInt(Q.get('level') || '0', 10) || 0;
export const CHAP_ARG  = parseInt(Q.get('chapter') || '0', 10) || 0;
export const SEED_ARG  = parseInt(Q.get('seed') || '0', 10) || 0;
export const SPEED_ARG = parseFloat(Q.get('speed') || '0') || 1;
export const TIER_ARG  = Q.get('tier') || '';
export const TROOPS_ARG = parseInt(Q.get('troops') || '0', 10) || 0;

export const SAVE_KEY = 'homebound.v1';

export const IS_TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
export const IS_SMALL = Math.min(window.innerWidth, window.innerHeight) < 520;

// --------------------------------------------------------------------------
// Palette. Olive/steel/sand ground, hot orange for anything that is firing.
// Signage deliberately breaks the palette — it is UI painted onto the world and
// has to win every readability fight it is in.
// --------------------------------------------------------------------------
export const PAL = {
  road:      0x9aa0a6,
  roadEdge:  0x6f747a,
  roadLine:  0xc7ccd1,
  bank:      0x6b7355,
  bankRock:  0x585f52,
  water:     0x1d3a4d,
  waterDeep: 0x0e2230,
  sky:       0x8fb4cc,
  fog:       0x9fc0d4,

  friend:    0x3d7ecc,       // your squad reads BLUE, always
  friendDark:0x24518a,
  friendTrim:0x8fd0ff,
  enemy:     0xd4322f,       // the wall of red in the reference
  enemyDark: 0x8d1f1d,
  boss:      0x6a3f8f,

  muzzle:    0xffd24a,
  tracer:    0xffc63a,
  fire:      0xff8a20,
  spark:     0xffe9a8,
  smoke:     0x4a4a4a,

  wood:      0xa9743f,
  woodDark:  0x744c26,
  steel:     0x8f989f,
  glass:     0x9fe4f5,

  signBlue:  0x2f7ee0,
  signYellow:0xf5c518,
  signGreen: 0x35b34a,
  signRed:   0xd8352f,
  signPurple:0x8a4fd0,
  signInk:   0xffffff,
  signStroke:0x14202c,
};

// --------------------------------------------------------------------------
// The road corridor
// --------------------------------------------------------------------------
export const ROAD = {
  halfW: 5.5,                // playable half-width, so 11 m across
  segLen: 40,                // one road tile
  // A ceiling, not a target: world.js derives the live count from scene.fog.far,
  // because tiles past the fog paint fog-coloured pixels over the backdrop and
  // cost the same as tiles you can see.
  segAhead: 6,
  segBehind: 3,
  bankW: 9,                  // rock shoulder before the water starts
  waterY: -2.6,
  wallEvery: 5,              // metres per parapet bay
};

// --------------------------------------------------------------------------
// Camera. Pulls back and lifts as the squad grows so 400 men still fit the
// frame — this is the single most important thing for the reference look.
// --------------------------------------------------------------------------
export const CAM = {
  fov: 46,
  // The blob's spring settles about 7 m behind the leader, so `back` is
  // measured to the TAIL of the squad, not to the man in front. At 13 the
  // hindmost rank was off the bottom of the phone and the player could not see
  // his own casualties.
  back: 21.0,
  height: 17.0,
  look: 26,                  // metres ahead of the squad the camera aims at
  perUnit: 0.0175,           // extra back/height per unit in the squad
  maxExtra: 9,
  lag: 0.92,                 // approach() rate
  shakeDecay: 0.86,
  tiltMax: 0.05,             // slight roll when steering, sells the drag
};

// --------------------------------------------------------------------------
// The run
// --------------------------------------------------------------------------
export const RUN = {
  speed: 12.5,               // metres/sec forward, constant
  speedBoss: 0,              // squad holds station at the boss
  steerRate: 26,             // metres/sec the leader can slide sideways
  dragScale: 0.055,          // screen px → metres
  formSpacing: 0.62,         // metres between NEIGHBOURS, not the spiral's r
                             // constant — a golden-angle disc needs r = s/sqrt(pi)
  formPull: 7.5,             // how hard a man chases his formation slot
  formJitter: 0.13,
  startTroops: 1,
  maxTroops: 900,            // hard cap; lite halves it
  laneCount: 3,              // gates are laid out on a 3-lane grid
};

// --------------------------------------------------------------------------
// Gunplay. Fire rate is per-unit but the crowd is thinned to `fireCap` shooters
// so 400 men do not mean 400 bullets — damage is scaled up instead. This is
// the only way the reference look and 60 fps coexist.
// --------------------------------------------------------------------------
export const GUN = {
  fireCap: 26,               // most units that actually spawn tracers
  bulletSpeed: 78,
  bulletLife: 1.6,
  spread: 0.055,
  range: 62,
  poolSize: 420,
};

// --------------------------------------------------------------------------
// Gate behaviour. `growPerHit` is a fraction of the CURRENT value, so a gate
// snowballs the longer you hold it — which is what makes leaving the enemy
// alone for three seconds feel like a real gamble.
// --------------------------------------------------------------------------
export const GATE = {
  width: 3.2,
  height: 3.0,
  growPerHit: 0.055,
  growFlat: 0.35,
  // Growth answers to FIREPOWER. Without this term the damage upgrade is inert
  // for the whole opening chapter: there is nothing to shoot but gates, and
  // gate growth counted hits, not damage. A gun that hits harder must make the
  // number climb faster, because the number IS what the gun is for.
  growDmgScale: 0.85,        // 0 = hits only, 1 = fully proportional to dmgMul
  growMax: 24,               // multiple of the gate's base value
  glassHp: 30,
  approachFade: 26,          // metres over which a gate FINISHES fading in;
                             // gates.js spawns them well before this so a row is
                             // readable with time to steer, not 2s before impact
  signTexSize: 256,
};

export const BARRIER = {
  hpPerWidth: 42,
  crumbleTime: 0.5,
  killOnTouch: 0.22,         // fraction of squad lost if you body a live wall
};

// --------------------------------------------------------------------------
// The unit ladder. `power` is what a single unit is worth in a fight; `merge`
// is how many of the previous tier one of these costs on promotion, which is
// what stops a `▲` gate being a free win.
// --------------------------------------------------------------------------
export const TIERS = [
  { id: 'rifleman', name: 'RIFLEMAN', kind: 'foot', scale: 1.00, hp: 1,  dps: 1.0,  rate: 0.42, merge: 1, color: 0x3d7ecc, icon: '🪖' },
  { id: 'ranger',   name: 'RANGER',   kind: 'foot', scale: 1.04, hp: 2,  dps: 1.9,  rate: 0.34, merge: 2, color: 0x2f6fbf, icon: '🎖' },
  { id: 'heavy',    name: 'HEAVY',    kind: 'foot', scale: 1.12, hp: 4,  dps: 3.6,  rate: 0.30, merge: 2, color: 0x2a5fa8, icon: '🛡' },
  { id: 'jeep',     name: 'JEEP',     kind: 'vehicle', scale: 1.18, hp: 9,  dps: 7.5,  rate: 0.26, merge: 3, color: 0x4e7a4a, icon: '🚙' },
  { id: 'humvee',   name: 'HUMVEE',   kind: 'vehicle', scale: 1.22, hp: 18, dps: 14,   rate: 0.22, merge: 3, color: 0x44693f, icon: '🚐' },
  { id: 'apc',      name: 'APC',      kind: 'vehicle', scale: 1.26, hp: 34, dps: 26,   rate: 0.20, merge: 3, color: 0x3d5f3a, icon: '🚛' },
  { id: 'tank',     name: 'TANK',     kind: 'vehicle', scale: 1.30, hp: 70, dps: 52,   rate: 0.30, merge: 4, color: 0x4a5240, icon: '⚙' },
  { id: 'gunship',  name: 'GUNSHIP',  kind: 'air',     scale: 1.30, hp: 120, dps: 96,  rate: 0.16, merge: 4, color: 0x3a4450, icon: '🚁' },
];
export const TIER_BY_ID = Object.fromEntries(TIERS.map((t, i) => [t.id, { ...t, index: i }]));
export const tierAt = (i) => TIERS[Math.max(0, Math.min(TIERS.length - 1, i | 0))];

// --------------------------------------------------------------------------
// Gate effects. `sign` decides the panel colour, `label` is what is painted on
// it. `apply` lives in game.js — this table is data only, so levels.js can
// compose gates without importing the run.
// --------------------------------------------------------------------------
export const EFFECTS = {
  troops:  { sign: 'blue',   fmt: (v) => '+' + v,            good: true,  grow: true  },
  mult:    { sign: 'yellow', fmt: (v) => '×' + v,       good: true,  grow: true  },
  tier:    { sign: 'green',  fmt: () => '▲ PROMOTE',    good: true,  grow: false },
  weapon:  { sign: 'green',  fmt: (v) => '⌖ GUN +' + v, good: true,  grow: true  },
  cash:    { sign: 'yellow', fmt: (v) => '$' + v,            good: true,  grow: true  },
  shield:  { sign: 'purple', fmt: (v) => '♥ ' + v,      good: true,  grow: true  },
  power:   { sign: 'purple', fmt: (v) => '⚡ ' + v + 's',good: true,  grow: false },
  loss:    { sign: 'red',    fmt: (v) => '-' + v,            good: false, grow: false },
  divide:  { sign: 'red',    fmt: (v) => '÷' + v,       good: false, grow: false },
  gamble:  { sign: 'purple', fmt: () => '?',            good: true,  grow: false },
};

// The `?` gate. Mostly good, occasionally ruinous — a gate you take because you
// are behind, and regret about one time in seven. It is the only gate whose
// sign does not tell you what it does, which is why it must be unmistakable:
// one purple panel with a question mark and nothing else.
//
// Weights sum to 110. `divide` at 14 is a 12.7% chance of losing half the
// squad, which is enough to make the choice cost something without making the
// gate a trap nobody takes.
export const GAMBLE = [
  { w: 22, type: 'mult',   value: 2,          label: '×2 SQUAD' },
  { w: 10, type: 'mult',   value: 3,          label: '×3 SQUAD' },
  { w: 20, type: 'troops', scale: 0.35, min: 8, label: 'REINFORCEMENTS' },
  { w: 14, type: 'cash',   value: 120, byLevel: 18, label: 'PAYDAY' },
  { w: 12, type: 'power',  value: 8, id: 'rapid', label: 'RAPID FIRE' },
  { w: 10, type: 'weapon', value: 4,          label: 'GUN UPGRADE' },
  { w:  8, type: 'shield',  value: 15,        label: 'BODY ARMOUR' },
  { w: 14, type: 'divide', value: 2,          label: 'AMBUSH · HALF LOST' },
];

// --------------------------------------------------------------------------
// Economy. The house is the money sink; the runs are the tap. Chapter 2 exists
// entirely to make the player feel the gap between the two.
// --------------------------------------------------------------------------
export const ECON = {
  baseReward: 120,
  perTroop: 1.4,

  // A cash gate is competing against a troop gate, and troops are not worth
  // their face value — they compound. Take 40 men early and they ride every
  // multiplier and every grown gate for the rest of the level, then cash out at
  // `perTroop` on top of everything they killed on the way. A cash gate priced
  // at its own face value is therefore never the right pick, and a row offering
  // one is a fake choice.
  //
  // So cash is priced off what the troops it displaces would have been worth at
  // the finish line, times this. Above 1.0 on purpose: money has to be actively
  // tempting, and the thing that stops it being a free lunch is that taking it
  // leaves you weaker for the rest of the run, not that it pays badly.
  cashTempt: 1.5,
  perLevel: 18,
  bossBonus: 2.0,
  replayFactor: 0.45,        // repeating a cleared story level pays less
  debtTotal: 12000,
  offlineCapHours: 8,
};

// Base upgrades bought between runs. `cost(n)` is the price of level n→n+1.
// Shield points per level of BODY ARMOUR. Three is deliberate: a barrier body-
// check costs BARRIER.killOnTouch (22%) of the squad, so at the 5-15 men the
// first chapter is played at, one level of armour eats a whole wall hit.
export const SHIELD_PER = 3;

export const UPGRADES = [
  // Two men a level, not one. Early gates are additive, so a bigger start is
  // only worth buying if it survives to meet a multiplier — see the guarantee
  // in levels.js that every level carries at least one.
  { id: 'squad',  name: 'STARTING SQUAD',  icon: '👥', max: 40, base: 90,  growth: 1.28, per: 2,    fmt: (v) => `${1 + v * 2} men` },
  { id: 'damage', name: 'FIREPOWER',       icon: '🎯', max: 40, base: 110, growth: 1.30, per: 0.08, fmt: (v) => `+${Math.round(v * 8)}%` },
  { id: 'rate',   name: 'FIRE RATE',       icon: '⚡', max: 30, base: 140, growth: 1.32, per: 0.04, fmt: (v) => `+${Math.round(v * 4)}%` },
  // ARMOUR was a pure percentage, which is invisible at the squad sizes the
  // opening chapter actually plays at: at level 1 it was `floor(1 x 0.95) = 0`,
  // so it silently made every single-man loss free and did nothing else you
  // could ever see. It now buys a SHIELD — a concrete pool of hits absorbed
  // before anyone dies, shown in the HUD and spent in front of you — plus a
  // smaller percentage that only starts to matter once squads are large.
  { id: 'armour', name: 'BODY ARMOUR',    icon: '🛡', max: 30, base: 130, growth: 1.31, per: 0.02, fmt: (v) => `${v * SHIELD_PER} shield · -${Math.round(v * 2)}% losses` },
  { id: 'start',  name: 'DEPLOY TIER',     icon: '▲', max: 5,  base: 900, growth: 2.10, per: 1,    fmt: (v) => TIERS[Math.min(v, TIERS.length - 1)].name },
  { id: 'income', name: 'PAY GRADE',       icon: '💰', max: 30, base: 160, growth: 1.34, per: 0.06, fmt: (v) => `+${Math.round(v * 6)}%` },
];
export const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));
export const upgradeCost = (u, level) => Math.round(u.base * Math.pow(u.growth, level));

// A level's `reqPower` is compared against this. It is deliberately dominated
// by squad size and firepower, the two things the player can see improving.
export function powerOf(up) {
  const g = (id) => up?.[id] || 0;
  return Math.round(
    10 + g('squad') * 6 + g('damage') * 7 + g('rate') * 5 +
    g('armour') * 4 + g('start') * 45 + g('income') * 1
  );
}

// --------------------------------------------------------------------------
// Quality tiers. Chosen at boot from device pixel ratio and `?lite`.
// --------------------------------------------------------------------------
export const QUALITY = {
  high: { shadows: true,  shadowSize: 1024, maxCrowd: 900, particles: 1.0, dpr: 2.0, water: true },
  mid:  { shadows: true,  shadowSize: 512,  maxCrowd: 600, particles: 0.7, dpr: 1.5, water: true },
  low:  { shadows: false, shadowSize: 0,    maxCrowd: 380, particles: 0.4, dpr: 1.0, water: false },
};
export function pickQuality() {
  if (LITE_MODE) return { name: 'low', ...QUALITY.low };
  const dpr = window.devicePixelRatio || 1;
  const small = Math.min(window.innerWidth, window.innerHeight);
  if (dpr >= 2 && small >= 380) return { name: 'mid', ...QUALITY.mid };
  if (small < 360) return { name: 'low', ...QUALITY.low };
  return { name: 'mid', ...QUALITY.mid };
}
