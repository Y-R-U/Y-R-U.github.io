// config.js — every tuning number lives here.

export const VERSION = '1.0.0';
export const SAVE_KEY = 'voidcast.save.v1';

// ── the hole ────────────────────────────────────────────────────────────────
export const HOLE = {
  R0: 1.0,                 // radius at zero mass
  M0: 6,                   // mass scale of the growth curve
  // A low exponent is doing real work here: each tier needs ~5.4× the mass of
  // the last while objects are only worth ~3.7× more, so the number of objects
  // per tier-up climbs (10 → 15 → 25 → 36 → 53 → 75). That offsets how much
  // faster a big aperture hoovers, and keeps the whole run evenly paced.
  P: 0.26,                 // growth exponent  r = R0 * (1 + m/M0)^P
  CAPTURE: 0.92,           // fraction of radius an object's centre must reach
  PULL_RANGE: 2.6,         // multiples of radius that objects feel a tug from
  PULL_FORCE: 7.0,
  BASE_SPEED: 10.5,
  SPEED_EXP: 0.34,         // speed = BASE * r^SPEED_EXP
  SINK_TIME: 0.55,         // seconds an object takes to spiral in and vanish
  EDGE_PAD: 1.5,
};

// radius required to swallow each tier (index === tier)
export const TIER_R = [0, 1.0, 1.55, 2.40, 3.70, 5.60, 8.20, 11.4, 15.0];
export const TIER_NAMES = ['—', 'DEBRIS', 'CLUTTER', 'VEHICLE', 'STRUCTURE', 'BUILDING', 'TOWER', 'MEGALITH', 'LANDMARK'];
// Mass awarded, by tier.
//
// These are NOT simply volume. Because higher tiers are rarer, a purely
// volumetric curve leaves the sector holding too little total mass in its big
// objects to ever push you past tier 6 — the run dead-ends. Each value is
// instead derived from the mass gap it has to help close, targeting roughly
// 10/14/20/26/24/15/8 objects of your own tier per tier-up: a slow opening, a
// long middle, and a short rampage once you can take towers.
export const TIER_VALUE = [0, 2.6, 10, 37, 140, 800, 6600, 60000, 250000];

// ── viewership ──────────────────────────────────────────────────────────────
export const VIEW = {
  PER_MASS: 600,           // viewers per point of effective mass
  HYPE_MASS: 0.9,          // effMass = mass * (1 + hype * HYPE_MASS)
  HYPE_MAX: 2.5,
  // decay is proportional, not flat: a small audience barely leaks, a huge one
  // haemorrhages the moment you slow down. Keeps early runs from being hopeless.
  HYPE_DECAY: 0.085,       // constant part, per second
  HYPE_DECAY_PROP: 0.16,   // extra per second per point of current hype
  IDLE_AFTER: 4.0,         // seconds without a swallow before the crowd drifts
  IDLE_DECAY: 0.26,        // extra decay per second while idle
  GAIN_SWALLOW: 0.050,     // base hype per swallow, scaled by tier
  GAIN_TIER: 0.035,        // extra per tier of the thing swallowed
  GAIN_TIERUP: 0.45,
  GAIN_LANDMARK: 0.85,
  GAIN_NEARMISS: 0.030,
  GAIN_MOVER: 0.055,       // catching something that was running away
  COMBO_WINDOW: 2.2,
  COMBO_HYPE: 0.012,       // extra hype per combo step
  COMBO_MAX: 99,
};

// ── camera ──────────────────────────────────────────────────────────────────
export const CAM = {
  PITCH: 0.92,             // radians above the horizon
  DIST_BASE: 33,
  DIST_PER_R: 5.2,
  DIST_MAX: 210,
  FOLLOW: 4.2,
  YAW: -Math.PI * 0.25,
  FOV: 52,
  PORTRAIT_PUSH: 0.62,     // extra distance on tall screens, where width is scarce
};

// ── run economy ─────────────────────────────────────────────────────────────
export const ECON = {
  SUBS_PER_VIEWER: 1 / 300000, // subs (meta currency) earned from peak viewers
  CLEAR_BONUS: 260,            // subs at 100% clear
  STAR_BONUS: 90,              // per star
  SCORE_VIEWERS: 0.02,
  SCORE_CLEAR: 30000,          // score for a full clear
  SCORE_COMBO: 400,            // per point of best combo
  SCORE_TIME: 120,             // per second left on the clock
};

// ── rivals ──────────────────────────────────────────────────────────────────
export const RIVAL = {
  THINK: 0.45,             // seconds between target re-evaluations
  SPEED_MUL: 0.94,
  EAT_PLAYER_RATIO: 1.22,  // how much bigger a rival must be to eat you
  STEAL_FRACTION: 0.22,    // fraction of your mass a rival takes when it eats you
  RESPAWN: 4.0,
};

// ── hazards ─────────────────────────────────────────────────────────────────
export const HAZARD = {
  TURRET_RANGE: 34,
  TURRET_CD: 2.6,
  TURRET_MIN_R: 1.7,       // defences ignore an aperture too small to matter
  BOLT_SPEED: 34,
  STUN_TIME: 1.15,
  HYPE_LOSS: 0.40,
  MASS_LOSS: 0.05,         // fraction of mass shaken loose by a direct hit
  PYLON_RADIUS: 22,
  DRONE_SPEED: 11,
};

// ── boons (in-run levelling) ────────────────────────────────────────────────
// viewer thresholds that trigger a sponsor offer
export const BOON_STEPS = [26e3, 90e3, 260e3, 700e3, 1.8e6, 4.2e6, 9e6, 20e6, 44e6, 95e6, 200e6, 420e6];

export const RENDER = {
  FOG_NEAR: 60,
  FOG_FAR: 340,
  SHADOWS: true,
  BLOOM: true,
  MAX_PIXEL_RATIO: 2,
};

// Sector fill is budgeted by FOOTPRINT AREA, not object count. A tier-7 tower
// covers 130× the ground a pebble does, so counting objects lets a mix ask for
// more buildings than physically fit — they then fail placement and vanish,
// leaving the run with nothing to grow on. COVERAGE is the fraction of the
// sector floor taken up by props; the radius is capped so MAX_PROPS can fill it.
export const WORLD = {
  COVERAGE: 0.34,
  MAX_PROPS: 1300,
  ROAD_W: 7,
  DOME: 900,               // planet radius used for the ground curvature
};

// Default tier distribution: lots of litter, a handful of towers.
export const DEFAULT_MIX = [0, 0.42, 0.24, 0.15, 0.09, 0.055, 0.03, 0.015];
