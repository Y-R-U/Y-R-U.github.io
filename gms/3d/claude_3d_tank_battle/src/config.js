// Gameplay constants for Tank Battle Royale.

export const CFG = {
  match: {
    totalTanks: 10,        // 1 player + 9 AI by default
    spawnRing: 60,         // radius around centre that AI spawn on
    spawnJitter: 12,       // random offset on spawn ring
  },
  tank: {
    moveSpeed: 12,
    reverseSpeed: 7,
    rotSpeed: 2.4,         // rad/s body turn
    turretSpeed: 5,        // rad/s turret yaw lerp
    barrelSpeed: 6,        // rad/s barrel pitch lerp
    fireCooldown: 0.55,    // seconds between shots (player baseline)
    maxHealth: 5,
    bodyRadius: 1.8,       // collision radius
    aimMaxPitch: 0.6,      // up
    aimMinPitch: -0.05,    // can't aim below horizontal much
  },
  bullet: {
    speed: 90,
    lifetime: 2.0,
    color: 0xfff2a0,
    radius: 0.12,
    damage: 1,
    hitRadius: 1.6,        // tank-vs-bullet
  },
  world: {
    size: 320,
    segs: 120,
    fogColor: 0x9bbfd6,
    fogNear: 60,
    fogFar: 220,
    skyColor: 0x9bbfd6,
    arenaRadius: 105,      // tanks bounce back inside this
  },
  camera: {
    height: 14,
    distance: 18,
    lookAhead: 4,
    lerp: 4,
  },
  ai: {
    fireRange: 50,
    sightRange: 80,
    losePursuitDist: 95,
    targetReevalSec: 1.6,
    aimNoise: 0.05,        // base aim noise (rad). personalities scale this.
    minDistanceFromTarget: 16,
    avoidRadius: 6,        // tank-vs-tank avoidance
  },
};

export const UP = { x: 0, y: 1, z: 0 };
