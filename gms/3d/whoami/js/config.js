// Central tuning + URL modes for "Who Am I" — a mini Diablo/RuneScape RPG.
// ?shot stages a thumbnail · ?lite drops shadows/density · ?auto soak-drives.

const q = new URLSearchParams(location.search);
export const SHOT = q.has('shot');
export const LITE = q.has('lite');
export const AUTO = q.has('auto');
export const NOSAVE = q.has('nosave');   // ignore localStorage (fresh start)

// One in-game "day" is 2 real hours, so survival bars move very slowly — you
// can play for ages without eating/drinking, exactly like real life.
export const DAY = 2 * 60 * 60;          // seconds

export const CFG = {
  worldRadius: 64,         // walkable disc radius
  playerSpeed: 4.4,
  runSpeed: 7.2,           // holding shift / double-speed
  playerRadius: 0.38,
  pickupRange: 1.5,
  interactRange: 2.6,      // how close to use trees / water / fire / store

  // survival (fractions per second of a 0..100 bar)
  foodDecay: 100 / (7 * DAY),     // full -> empty in ~7 days; warnings well before
  waterDecay: 100 / (3 * DAY),    // a full waterskin lasts ~3 days
  starveDps: 0.20,                // HP/sec lost at 0 food  (death in ~days => "weeks" total)
  dehydrateDps: 0.45,             // HP/sec lost at 0 water (faster than hunger)
  regenDps: 0.35,                 // HP regen/sec when fed, watered & out of combat

  // camera (over-the-shoulder isometric-ish follow)
  camDist: 12, camDistMin: 5, camDistMax: 22,
  camPitch: 0.62, camPitchMin: 0.30, camPitchMax: 1.30,
  camYaw: -0.9,

  sunDir: [40, 60, 24],
};

// Named world anchors (flat building pads + points of interest).
export const SITES = {
  spawn:    { x: 0,    z: 6 },
  store:    { x: -11,  z: -4 },
  well:     { x: 6,    z: -3 },
  campfire: { x: 3,    z: 7 },
  anvil:    { x: -6,   z: 9 },
  guide:    { x: 2,    z: 2 },     // tutorial NPC near spawn
  dungeon:  { x: 30,   z: -34 },   // dungeon entrance (far corner)
  fishSpot: { x: -28,  z: 18 },    // riverbank fishing
  orchard:  { x: -22,  z: -22 },   // fruit-tree grove
  meadow:   { x: 22,   z: 14 },    // chickens + rats roam here
};

// River runs roughly along this poly-line (carved lower; water fills it).
export const RIVER = [
  { x: -60, z: 30 }, { x: -30, z: 20 }, { x: -8, z: 16 },
  { x: 14, z: 24 }, { x: 40, z: 40 },
];
