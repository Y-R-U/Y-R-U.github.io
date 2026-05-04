// ============================================================
//  CONSTANTS & CONFIGURATION
// ============================================================

export const W = 900;
export const H = 600;

export const GRAVITY = 0.35;
export const BASE_TONGUE_LENGTH = 180;
export const BASE_TONGUE_SPEED = 14;
export const BASE_TIMER = 45;
export const BASE_SWING_POWER = 1.0;
export const BASE_MAGNET_RADIUS = 30;

export const FROG_W = 32;
export const FROG_H = 28;

// Pendulum: cap on tangential speed (per-frame) to prevent runaway pumping.
// Reel-in conserves angular momentum, so ω·r grows toward this cap.
export const MAX_TANGENTIAL_SPEED = 24;
// Additive upward boost (per-frame) added to vy on tongue release. Gives a
// satisfying hop on slow swings without dominating fast ones.
export const RELEASE_KICK = 4;
// Small hop when player taps with no anchor target while grounded.
export const GROUND_HOP_VY = 8;
// Frog spawns this many pixels above ground, on a tree branch, so the very
// first swing has potential energy to convert.
export const START_HEIGHT = 220;

export const UPGRADE_MAX = 10;

export const UPGRADE_COSTS = {
  tongueLength: i => 3 + i * 2,
  timerBoost: i => 4 + i * 3,
  swingPower: i => 3 + i * 2,
  tongueSpeed: i => 2 + i * 2,
  magnetRadius: i => 2 + i * 1,
};

export const UPGRADE_NAMES = {
  tongueLength: 'Tongue Length',
  timerBoost: 'Timer Boost',
  swingPower: 'Swing Power',
  tongueSpeed: 'Tongue Speed',
  magnetRadius: 'Bug Magnet',
};

export const UPGRADE_DESCS = {
  tongueLength: '+20 range',
  timerBoost: '+5 seconds',
  swingPower: '+10% launch',
  tongueSpeed: '+1.5 speed',
  magnetRadius: '+15 radius',
};
