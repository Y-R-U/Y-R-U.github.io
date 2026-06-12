// Central tuning + URL modes. ?shot=1 stages the thumbnail frame,
// ?lite=1 disables shadows/heavy extras, ?auto=1 drives the player for soak tests.

const q = new URLSearchParams(location.search);
export const SHOT = q.has('shot');
export const LITE = q.has('lite');
export const AUTO = q.has('auto');
export const HERO = q.get('hero'); // 'maeve'/'2', 'garrick'/'3', 'wren'/'4' spawn as that hero

export const CFG = {
  playRadius: 26,      // walkable circle radius
  terrainRadius: 28,   // grass disc extends a little past the play boundary
  playerSpeed: 4.0,
  playerRadius: 0.35,  // collision circle
  pickupRange: 0.85,

  // combat
  chickenHp: 40,
  dmgMax: 10,          // each attack rolls 1..dmgMax
  attackRange: 1.25,   // melee (sword)
  crossbowRange: 7,
  staffRange: 6,
  attackPeriod: 0.9,   // seconds between attacks
  chickenRespawnMin: 30,  // dead chickens come back after rand(min, max) seconds
  chickenRespawnMax: 60,

  camDist: 13, camDistMin: 7, camDistMax: 20,
  camPitch: 0.68, camPitchMin: 0.35, camPitchMax: 1.25,
  camYaw: -1.45,

  sunDir: [24, 32, 14], // also feeds the sky shader glow
};

// Layout sites — flattened terrain spots + prop anchors.
export const SITES = {
  house:    { x: 9.5, z: -7,   r: 6.5, h: 0.25 },
  spawn:    { x: 0,   z: 0,    r: 4.0, h: 0.0  },
  pen:      { x: -9,  z: -6,   r: 5.0, h: 0.10 },
  well:     { x: -4,  z: 4.5 },
  campfire: { x: 3,   z: 4   },
};
