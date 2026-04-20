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
