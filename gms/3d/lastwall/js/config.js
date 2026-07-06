// LASTWALL — all tuning + URL modes. One import everywhere: import { CFG, MODES } from './config.js'

const q = new URLSearchParams(location.search);
export const MODES = {
  lvl:     q.has('lvl') ? Math.max(1, parseInt(q.get('lvl')) || 1) : 0, // jump straight into level N
  endless: q.has('endless'),
  nosave:  q.has('nosave'),
  lite:    q.has('lite'),
  shot:    q.has('shot'),
  auto:    q.has('auto'),
  nointro: q.has('nointro'),
};

export const CFG = {
  // world
  wallH: 16,           // wall top height above the ground
  wallW: 12,           // walkable span width
  towerW: 20,          // junction plaza width
  merlonGap: 2.4,      // parapet crenellation spacing
  fogColor: 0x3d2016,
  fogNear: 65, fogFar: 235,

  // camera (chase)
  cam: { dist: 15.5, height: 10.5, lookAhead: 6.0, lerp: 4.2, fov: 55, orbitDecay: 1.6 },

  // player
  player: {
    hp: 100, speed: 6.6, sprint: 9.4, accel: 26, radius: 0.55,
    aimRange: 24, aimCone: 0.85,        // radians half-angle for target acquisition
    meleeEngage: 5.0,
    ragdollThresh: 46,                  // impulse needed to ragdoll the PLAYER
    getupTime: 1.6,
    iframes: 0.8,
  },

  // hit pipeline
  ragdollThresh: 26,    // impulse (dmg*kb) beyond which a live enemy full-ragdolls
  slamSpeed: 9,         // ragdoll hitting a parapet above this speed → crunch damage
  slamDmg: 18,
  edgeKillY: 4,         // fell below wallTop-… → gone (then falls to ground)

  // economy
  serumPerKill: [2, 5],       // min,max base
  serumLevelBonus: 25,        // completing a level
  draftLevels: n => (n <= 20 ? n % 5 === 0 : n % 10 === 0), // powerup pick cadence
  rerollsBase: 3,

  // enemy director
  director: {
    basePacks: 4,             // packs per level at n=1
    packGrow: 0.55,           // extra packs per level
    hpGrow: 0.085,            // +8.5% hp per level (compounds via multiplier)
    dmgGrow: 0.05,
    speedGrow: 0.012, speedCap: 1.8,
    ambushChance: 0.35,       // per-span climber ambush
  },

  // level shape
  gen: {
    spanLen: [26, 44],        // straight span length range
    spansMain: n => 4 + Math.min(6, Math.floor(n / 8)),   // main-path spans per level
    spurChance: 0.45, forkChance: 0.4, crackChance: 0.5,  // crack given fork
  },

  // fx budgets
  maxRagdolls: 14, maxDebris: 90, maxBlood: 220,
};

// quality: lite = no bloom/shadows, fewer instances (auto for small screens unless forced)
export const LITE = MODES.lite || (Math.min(screen.width, screen.height) < 480 && !q.has('full'));
export const SAVE_KEY = 'lastwall_v1';
