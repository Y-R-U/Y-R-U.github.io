// Central tuning. Everything gameplay-affecting lives here so modes and
// balance can change without touching systems code.

export const FIELD_R = 50;          // fence line — hard arena boundary
export const DEFAULT_TANK_COUNT = 10;

export const TANK = {
  hp: 100,
  maxSpeed: 13,
  accel: 50,
  damp: 4.2,
  radius: 1.8,                      // collision circle
  fireCd: 0.72,
  boltSpeed: 60,
  boltDmg: 8,
  boltLife: 2.0,
  spread: 0.022,                    // base firing inaccuracy (radians)
};

// The murder: a closing ring of crows. Outside it you get pecked apart.
// graceTime / shrinkRate are the defaults; MURDER_PACE overrides them per mode.
export const MURDER = {
  startR: FIELD_R,
  graceTime: 16,                    // seconds before it starts closing
  shrinkRate: 0.65,                 // units/sec
  minR: 12,
  dps: 8,
  peckEvery: 0.5,                   // pecks land in ticks, same total dps
};

// Per-mode pacing so the crows, not the opening scramble, decide the endgame.
// Close time = grace + (startR - minR) / shrink.
export const MURDER_PACE = {
  duel:     { graceTime: 15, shrinkRate: 0.50 },
  skirmish: { graceTime: 20, shrinkRate: 0.20 },
  royale:   { graceTime: 24, shrinkRate: 0.16 },
  frenzy:   { graceTime: 18, shrinkRate: 0.30 },
};

// AI awareness is shortened for the opening seconds so spawns can't
// immediately converge into one brawl.
export const OPENING = { time: 20, awareness: 0.35 };

export const PICKUP = {
  heal: 35,
  max: 4,
  interval: 8,                      // seconds between spawn attempts
  lifetime: 30,
  radius: 1.4,
};

// Pickup kinds. weight = spawn odds; dur = buff seconds.
export const PICKUP_KINDS = {
  heal:   { label: 'REPAIR',     glyph: '✚', color: 0xffa030, weight: 50 },
  rapid:  { label: 'RAPID FIRE', color: 0xfff84d, weight: 18, dur: 8 },
  shield: { label: 'SHIELD',     glyph: '◈', color: 0x4dc4ff, weight: 16, dur: 7, absorb: 0.75 },
  ward:   { label: 'CROW-WARD',  glyph: '❦', color: 0xc8a0ff, weight: 16, dur: 12 },
};

// Player is always harvest-amber (index 0); AI tanks draw from the rest.
export const ACCENTS = [
  0xffc24d, 0xff2d8f, 0x86ff4d, 0x4df3ff, 0xb84dff,
  0xff4d4d, 0x4dffc8, 0xfff84d, 0xff8ad9, 0x7a9bff,
  0xff6a3c, 0x4dff7a, 0xd9ff4d, 0xff4dc4, 0x4dc4ff, 0xc8b4ff,
];

// AI personalities. courage = hp fraction below which the tank flees.
// accuracy = aim wobble in radians (lower is deadlier).
export const PERSONALITIES = {
  berserker:   { label: 'berserker',   glyph: '✸', verb: 'is charging you',   aggression: 0.95, courage: 0.12, range: 11,
                 accuracy: 0.075, strafe: 0.45, pickupLove: 0.2, target: 'nearest' },
  hunter:      { label: 'hunter',      glyph: '◎', verb: 'is stalking you',      aggression: 0.75, courage: 0.30, range: 18,
                 accuracy: 0.045, strafe: 0.65, pickupLove: 0.5, target: 'weakest' },
  sniper:      { label: 'sniper',      glyph: '⊕', verb: 'has you in their sights',      aggression: 0.55, courage: 0.45, range: 30,
                 accuracy: 0.022, strafe: 0.30, pickupLove: 0.4, target: 'nearest' },
  survivor:    { label: 'survivor',    glyph: '◐', verb: 'is coming for payback',    aggression: 0.18, courage: 0.60, range: 22,
                 accuracy: 0.055, strafe: 0.75, pickupLove: 0.95, target: 'attacker' },
  opportunist: { label: 'opportunist', glyph: '◆', verb: 'smells blood', aggression: 0.60, courage: 0.35, range: 16,
                 accuracy: 0.050, strafe: 0.55, pickupLove: 0.6, target: 'weakest' },
  drifter:     { label: 'drifter',     glyph: '∿', verb: 'drifted onto you',     aggression: 0.50, courage: 0.28, range: 15,
                 accuracy: 0.062, strafe: 0.50, pickupLove: 0.5, target: 'nearby' },
};

// Dusk-farm callsigns.
export const NAME_POOL = [
  'SCARECROW', 'HARROW', 'SICKLE', 'THRESHER', 'RUST', 'EMBER', 'GLOAM',
  'FALLOW', 'BRIAR', 'GRIM', 'HOLLOW', 'RAVEN', 'TALON', 'SOOT', 'ASH',
  'FLINT', 'CROWBANE', 'MIDNIGHT', 'PITCHFORK', 'WICKER', 'REAPER', 'MOTH',
  'VESPER', 'HUSK', 'THORN', 'MAGPIE', 'STARLING', 'SHRIKE', 'DUSKY', 'OWL',
];

// Legacy single-value keys. Nothing writes these any more — `js/career.js`
// reads them exactly once to fold an existing player's callsign / mute / mode
// into the namespaced `f5mr.settings.v1` blob, then leaves them be.
export const NAME_KEY = 'f5mr_name';
export const MUTE_KEY = 'f5mr_mute';
export const MODE_KEY = 'f5mr_mode';

const Q = new URLSearchParams(location.search);

export const SHOT_MODE = Q.has('shot');
// lite: skip bloom + shadows (testing / low-end devices)
export const LITE_MODE = Q.has('lite');
// auto: AI drives the player tank too (end-to-end match testing)
export const AUTO_MODE = Q.has('auto');
// test: keep automated runs hermetic — no account layer, no cloud save
export const TEST_MODE = Q.has('test');
// The br8t account layer is skipped under any staged/automated mode.
export const NO_CLOUD = TEST_MODE || SHOT_MODE || AUTO_MODE;
// speed=N runs N sim steps per rendered frame (test hook for long AI soaks)
export const SIM_SPEED = Math.max(1, Math.min(16, parseInt(Q.get('speed'), 10) || 1));
export const IS_TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
