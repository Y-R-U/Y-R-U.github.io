// Central tuning. Everything gameplay-affecting lives here so balance can
// change without touching systems code.

export const FIELD_R = 50;            // fence line — tank stays inside

export const TANK = {
  armor: 100,
  maxSpeed: 14,
  accel: 60,
  damp: 5,
  radius: 1.9,                        // collision circle vs obstacles
  turnRate: 9,                        // hull yaw chase speed
  fireCd: 0.13,
  shellSpeed: 105,
  shellLife: 1.4,
  hitR: 0.5,                          // extra forgiveness added to crow radius
  regenDelay: 3.5,                    // seconds without damage before regen
  regenRate: 16,                      // armor per second
  aimAssistCos: Math.cos(0.10),       // mouse aim snap cone (~6 degrees)
};

// Base crow. Brutes and the boss are scaled variants (see VARIANTS).
export const CROW = {
  speed: 9.5,                         // orbit cruise speed
  diveSpeed: 32,
  climbSpeed: 13,
  steer: 2.6,                         // velocity chase rate (damp)
  diveSteer: 5.2,
  aimTime: 0.85,                      // eye-flare warning before the dive
  diveCdMin: 3.5,
  diveCdMax: 9,
  orbitRMin: 13,
  orbitRMax: 32,
  altMin: 10,
  altMax: 24,
};

export const VARIANTS = {
  crow:  { hp: 1,  scale: 1.0, hitR: 1.5, dmg: 12, score: 100,  pitch: 1.0 },
  brute: { hp: 4,  scale: 1.7, hitR: 2.3, dmg: 20, score: 250,  pitch: 0.72 },
  boss:  { hp: 40, scale: 3.2, hitR: 4.2, dmg: 30, score: 1500, pitch: 0.45 },
};

export function waveSpec(n) {
  const boss = n % 5 === 0;
  const crows = Math.max(4, Math.min(5 + n * 2, 22) - (boss ? 6 : 0));
  const brutes = Math.min(Math.max(0, n - 2), 6) + (boss ? 1 : 0);
  return { crows, brutes, boss };
}

// How many crows may flare/dive at once, and how much faster they get.
export const diveCap = (n) => Math.min(1 + Math.floor(n / 2), 6);
export const waveSpeedScale = (n) => 1 + Math.min((n - 1) * 0.045, 0.55);

export const HI_KEY = 'f5ct_best';
export const MUTE_KEY = 'f5ct_mute';

export const SHOT_MODE = new URLSearchParams(location.search).has('shot');
// lite: skip bloom + shadows (testing / low-end devices)
export const LITE_MODE = new URLSearchParams(location.search).has('lite');
// auto: AI drives the tank (end-to-end soak testing)
export const AUTO_MODE = new URLSearchParams(location.search).has('auto');
export const IS_TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
