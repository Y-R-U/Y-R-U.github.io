// Central tuning + URL modes for F5 Deadtown. The map itself lives in the DB
// (level documents) — this file is only engine tuning and camera feel.
//
// URL modes: ?level=<id> boot straight into a level (editor test-play; skips
// menu + cinematic) · ?cine jump straight to the cinematic · ?shot thumbnail
// stage · ?lite drop shadows/density · ?auto soak-drive · ?nosave ignore the
// save · ?wpose weapon-pose tuner.

const q = new URLSearchParams(location.search);
export const SHOT = q.has('shot');
export const LITE = q.has('lite');
export const AUTO = q.has('auto');
export const NOSAVE = q.has('nosave');
export const WPOSE = q.has('wpose');
export const CINE = q.has('cine');
export const START_LEVEL = q.get('level');   // jump straight into this level

export const CFG = {
  playerSpeed: 4.6,
  runSpeed: 7.0,
  playerRadius: 0.4,
  pickupRange: 1.7,
  interactRange: 2.8,

  maxHp: 100,
  regenDelay: 7,             // s out of combat before HP ticks back
  regenDps: 3.5,

  // ── auto-aim ──
  aimRange: 16,
  aimCone: 0.62,
  aimTurn: 14,

  // ── camera presets (over-the-shoulder, Diablo/RuneScape tilt) ──
  cam: {
    outdoor:  { dist: 15, pitch: 0.72, yaw: -0.78, fov: 52 },
    interior: { dist: 8.5, pitch: 0.95, yaw: -0.78, fov: 50 },
    distMin: 6, distMax: 26,
    pitchMin: 0.45, pitchMax: 1.30,
  },

  sunDir: [44, 70, 28],
};
