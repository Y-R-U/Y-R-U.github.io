// Central tuning. Everything gameplay-affecting lives here so modes and
// balance can change without touching systems code.

export const ARENA_R = 58;          // hard arena boundary
export const DEFAULT_TANK_COUNT = 10;

export const TANK = {
  hp: 100,
  maxSpeed: 13,
  accel: 50,
  damp: 4.2,
  radius: 1.7,                      // collision circle
  fireCd: 0.72,
  boltSpeed: 60,
  boltDmg: 8,
  boltLife: 2.0,
  spread: 0.022,                    // base firing inaccuracy (radians)
};

// The storm: a shrinking magenta wall. Outside it you burn.
export const ZONE = {
  startR: ARENA_R,
  graceTime: 16,                    // seconds before it starts shrinking
  shrinkRate: 0.75,                 // units/sec
  minR: 13,
  dps: 8,
};

export const PICKUP = {
  heal: 35,
  max: 3,
  interval: 8,                      // seconds between spawn attempts
  lifetime: 30,
  radius: 1.4,
};

// Player is always cyan (index 0); AI tanks draw from the rest.
export const ACCENTS = [
  0x4df3ff, 0xff2d8f, 0xffb347, 0x86ff4d, 0xb84dff,
  0xff4d4d, 0x4dffc8, 0xfff84d, 0xff8ad9, 0x7a9bff,
  0xff7a3c, 0x4dff7a, 0xd9ff4d, 0xff4dc4, 0x4dc4ff, 0xc8b4ff,
];

// AI personalities. courage = hp fraction below which the tank flees.
// accuracy = aim wobble in radians (lower is deadlier).
export const PERSONALITIES = {
  berserker:   { label: 'berserker',   aggression: 0.95, courage: 0.12, range: 11,
                 accuracy: 0.075, strafe: 0.45, pickupLove: 0.2, target: 'nearest' },
  hunter:      { label: 'hunter',      aggression: 0.75, courage: 0.30, range: 18,
                 accuracy: 0.045, strafe: 0.65, pickupLove: 0.5, target: 'weakest' },
  sniper:      { label: 'sniper',      aggression: 0.55, courage: 0.45, range: 30,
                 accuracy: 0.022, strafe: 0.30, pickupLove: 0.4, target: 'nearest' },
  survivor:    { label: 'survivor',    aggression: 0.18, courage: 0.60, range: 22,
                 accuracy: 0.055, strafe: 0.75, pickupLove: 0.95, target: 'attacker' },
  opportunist: { label: 'opportunist', aggression: 0.60, courage: 0.35, range: 16,
                 accuracy: 0.050, strafe: 0.55, pickupLove: 0.6, target: 'weakest' },
  drifter:     { label: 'drifter',     aggression: 0.50, courage: 0.28, range: 15,
                 accuracy: 0.062, strafe: 0.50, pickupLove: 0.5, target: 'nearby' },
};

export const NAME_POOL = [
  'VEKTOR', 'NYX', 'RAZOR', 'HALCYON', 'QUASAR', 'VOLTA', 'MIRAGE', 'CIPHER',
  'NOVA', 'DUSK', 'REAPER', 'ECHO', 'BLITZ', 'ONYX', 'PULSE', 'VANTA',
  'KOBRA', 'JOLT', 'SABLE', 'HEXX', 'ZENITH', 'RIFT', 'GHOST', 'TALON',
  'AXIOM', 'ORBIT', 'FLUX', 'WRAITH', 'PYRE', 'STATIC',
];

export const HI_KEY = 'f5tb_best_place';
export const NAME_KEY = 'f5tb_name';
export const MUTE_KEY = 'f5tb_mute';
export const MODE_KEY = 'f5tb_mode';

export const SHOT_MODE = new URLSearchParams(location.search).has('shot');
// lite: skip bloom + shadows (testing / low-end devices)
export const LITE_MODE = new URLSearchParams(location.search).has('lite');
// auto: AI drives the player tank too (end-to-end match testing)
export const AUTO_MODE = new URLSearchParams(location.search).has('auto');
export const IS_TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
