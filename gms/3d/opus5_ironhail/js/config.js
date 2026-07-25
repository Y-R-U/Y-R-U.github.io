// IRONHAIL — central tuning. Everything gameplay-affecting lives here or in
// arsenal.js so balance can change without touching systems code.

const Q = new URLSearchParams(location.search);

// ---------------------------------------------------------------------------
// URL test hooks
// ---------------------------------------------------------------------------
export const LITE_MODE  = Q.has('lite');            // skip bloom + shadows
export const AUTO_MODE  = Q.has('auto');            // AI drives the player
export const SHOT_MODE  = Q.has('shot');            // staged thumbnail frame
export const DEV_MODE   = Q.has('dev');             // debug overlay + cheats
export const START_ARG  = Q.get('start') || '';     // 'battle' | 'garage' | 'ladder' | 'campaign'
export const MISSION_ARG = Q.get('mission') || '';  // mission id to jump into
export const ENV_ARG    = Q.get('env') || '';       // force an environment preset
export const SEED_ARG   = Q.get('seed') || '';      // force a battlefield seed
export const WIPE_ARG   = Q.has('wipe');            // clear the save on boot

export const IS_TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

// ---------------------------------------------------------------------------
// Battlefield
// ---------------------------------------------------------------------------
export const FIELD_R = 104;          // playable radius (soft wall past this)
export const TERRAIN_SIZE = 380;     // ground plane extent
export const TERRAIN_SEG = 176;      // grid resolution (cells ≈ 2.16 units)

// Gravity used by every ballistic shell. Tuned so a 90 m/s gun at 45° flies
// roughly the width of the arena — big enough arcs to read on screen.
export const GRAVITY = 26;

// ---------------------------------------------------------------------------
// Shared physics / feel
// ---------------------------------------------------------------------------
export const PHYS = {
  damp: 3.6,                 // velocity damping (1/s)
  slopeStop: 0.62,           // dot(normal, up) below this is impassable
  slopeDrag: 1.35,           // how much uphill slope saps speed
  tankRadius: 2.2,
  turretRest: 0.9,
  suspension: 9,             // lean/pitch smoothing rate
};

export const COMBAT = {
  // armour facing multipliers (impact direction vs hull forward)
  frontMul: 0.72,
  sideMul: 1.0,
  rearMul: 1.55,
  ricochetAngle: 0.28,       // |cos| below this can bounce off AP rounds
  trackHitChance: 0.22,      // chance a hit cripples tracks
  trackSlowTime: 4.2,
  trackSlowMul: 0.42,
  turretHitChance: 0.14,
  turretSlowTime: 3.4,
  regenDelay: 6,             // seconds out of combat before repair kicks in
};

export const DRONE = {
  baseAlt: 17,
  baseSpotR: 62,
  baseHp: 40,
  orbitR: 11,
  orbitSpeed: 0.42,
  flySpeed: 26,
  spotHold: 5.0,             // seconds a contact stays marked after losing it
  downTime: 16,              // seconds to rebuild a downed drone
  pingInterval: 3.0,
};

export const CAM = {
  chaseDist: 21,
  chaseHeight: 10.5,
  chaseLook: 5.2,
  scopeFov: 20,
  baseFov: 62,
  zoomMin: 0.65,             // multiplier on chase distance
  zoomMax: 1.85,
  shakeDecay: 0.0015,
};

// Persistent storage keys
export const SAVE_KEY = 'ironhail_save_v1';
export const NAME_KEY = 'ironhail_name';

export const NAME_POOL = [
  'IRONHAIL', 'VULCAN', 'RAMROD', 'HALLOW', 'KESTREL', 'BASILISK', 'MAULER',
  'WARDEN', 'CINDER', 'RAMPART', 'TALON', 'GRIST', 'BULWARK', 'HAVOC',
  'SABRE', 'DREDGE', 'GARRISON', 'THUNDERHEAD', 'ONYX', 'FURROW', 'LANCE',
];

// Enemy callsign pool — used for AI tanks and the simulated world ladder.
export const ENEMY_NAMES = [
  'RUST', 'HOWL', 'GRAVE', 'SPITE', 'THRESH', 'MARROW', 'BRIAR', 'SLAG',
  'CARRION', 'DIRGE', 'GRUDGE', 'HUSK', 'IRONJAW', 'KILN', 'LOAM', 'MIRE',
  'NOOSE', 'OCHRE', 'PYRE', 'QUARRY', 'REND', 'SCOUR', 'TAR', 'UMBER',
  'VESPER', 'WRACK', 'YOKE', 'ZEALOT', 'ANVIL', 'BLIGHT', 'CULL', 'DROSS',
  'EMBERWAKE', 'FLENSE', 'GALLOWS', 'HOARFROST', 'INGOT', 'JACKAL', 'KNELL',
];

export const LADDER_TAGS = [
  'DUSTHOUND', 'REDLINE', 'STEELCAT', 'NOMAD', 'SALTPAN', 'DEADEYE', 'BOLTFACE',
  'GRIMWHEEL', 'ASHKIN', 'LONGSHOT', 'HAMMERFALL', 'BLACKROOT', 'COLDIRON',
  'SANDVIPER', 'NIGHTLATCH', 'WIDOWMAKER', 'CRANKSHAFT', 'PALEHORSE', 'SUNKEN',
  'TINDER', 'VANTAGE', 'WOLFRAM', 'ZEPHYR', 'BADLANDS', 'CATACOMB', 'DRIFTER',
];
