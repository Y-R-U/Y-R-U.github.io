// Central tuning + URL modes for "Deadtown" — a mobile-first zombie shooter.
// ?shot stages a thumbnail · ?lite drops shadows/density · ?auto soak-drives ·
// ?nosave ignores localStorage · ?town skips the bedroom intro (debug).

const q = new URLSearchParams(location.search);
export const SHOT = q.has('shot');
export const LITE = q.has('lite');
export const AUTO = q.has('auto');
export const NOSAVE = q.has('nosave');
export const SKIP_INTRO = q.has('town');   // boot straight into the street
export const WPOSE = q.has('wpose');       // weapon-pose debug tuner (js/wpose.js)

export const CFG = {
  // town is a rectangle centred on origin (half-extents)
  townHalf: 58,
  playerSpeed: 4.6,
  runSpeed: 7.0,
  playerRadius: 0.4,
  pickupRange: 1.7,
  interactRange: 2.8,        // how close to use a door / loot

  maxHp: 100,
  regenDelay: 7,             // s out of combat before HP ticks back
  regenDps: 3.5,

  // ── auto-aim ──
  aimRange: 16,              // laser/lock reaches this far
  aimCone: 0.62,             // rad half-angle: a zombie inside this cone locks
  aimTurn: 14,               // how fast the player snaps to face a locked target

  // ── camera presets (over-the-shoulder, Diablo/RuneScape tilt) ──
  // town: pulled out + steep; interior: closer + steeper so the roofless room
  // reads from above. yaw is fixed RS-style (two-finger drag rotates it).
  cam: {
    town:     { dist: 15, pitch: 0.72, yaw: -0.78, fov: 52 },
    interior: { dist: 8.5, pitch: 0.95, yaw: -0.78, fov: 50 },
    distMin: 6, distMax: 26,
    pitchMin: 0.45, pitchMax: 1.30,
  },

  sunDir: [44, 70, 28],
};

// Named anchors in the town (building pads, spawn, etc.). Authoring data so a
// future session can grow the map by editing this + TOWN_BUILDINGS in townobj.
export const SITES = {
  home:    { x: 0,   z: 30 },    // the house you wake up in (south edge)
  square:  { x: 0,   z: 0 },     // central plaza
  store:   { x: -22, z: -6 },
  police:  { x: 26,  z: -18 },
  cafe:    { x: -26, z: 16 },
  gas:     { x: 30,  z: 22 },
};
