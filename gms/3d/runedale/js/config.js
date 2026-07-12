// Central tuning + URL modes for "Runedale" — a pocket RuneScape-style world.
// ?shot stages a thumbnail · ?lite drops shadows/density · ?auto soak-drives ·
// ?nosave fresh start · ?skiptut completes the tutorial instantly.

const q = new URLSearchParams(location.search);
export const SHOT = q.has('shot');
export const LITE = q.has('lite');
export const AUTO = q.has('auto');
export const NOSAVE = q.has('nosave');
export const SKIPTUT = q.has('skiptut');

export const CFG = {
  worldRadius: 108,        // walkable disc radius
  playerSpeed: 4.4,
  runSpeed: 7.2,
  runDrain: 6,             // run energy per second while running
  runRegen: 8,             // run energy per second while walking / idle
  playerRadius: 0.38,
  interactRange: 2.8,
  regenDelay: 6,           // seconds out of combat before HP regen starts
  regenDps: 0.22,          // slow RS-ish trickle

  // camera (over-the-shoulder isometric-ish follow)
  camDist: 13, camDistMin: 5, camDistMax: 26,
  camPitch: 0.66, camPitchMin: 0.30, camPitchMax: 1.30,
  camYaw: -0.9,

  sunDir: [40, 60, 24],
};

// ── Named world anchors ─────────────────────────────────────────────────────
// Three settlements + wilderness sites. Bramblewick is the tutorial hamlet in
// the south; the road crosses the river at a shallow ford and forks at
// Ashford (the main town) toward Milbrook (fishing village), the mine and the
// goblin camp.
export const TOWNS = {
  bramblewick: { x: 0,   z: 64,  r: 17, h: 0.35, name: 'Bramblewick' },
  ashford:     { x: 0,   z: -26, r: 21, h: 0.55, name: 'Ashford' },
  milbrook:    { x: 60,  z: 30,  r: 15, h: 0.10, name: 'Milbrook' },
  mine:        { x: 38,  z: -62, r: 13, h: 1.10, name: 'Stonefell Mine' },
  goblincamp:  { x: -48, z: -60, r: 13, h: 0.90, name: 'Goblin Camp' },
};

export const SITES = {
  spawn:      { x: -2,  z: 68 },
  elder:      { x: 1,   z: 63 },     // tutorial guide
  tutTrees:   { x: -8,  z: 71 },     // starter trees
  tutFire:    { x: 3,   z: 67 },     // hamlet campfire
  tutRocks:   { x: 8,   z: 70 },     // starter copper + tin
  tutSmithy:  { x: 7,   z: 60 },     // hamlet furnace + anvil
  tutBank:    { x: -5,  z: 60 },     // hamlet bank chest
  tutFish:    { x: -4,  z: 42 },     // riverbank fishing spot
  ratPen:     { x: -11, z: 63 },

  bank:       { x: -9,  z: -30 },    // Ashford bank building
  store:      { x: 7,   z: -22 },    // Ashford market stall
  smithy:     { x: 10,  z: -33 },    // Ashford furnace + anvil
  well:       { x: 0,   z: -24 },
  pasture:    { x: 22,  z: -14 },    // fenced cows
  windmill:   { x: -26, z: -40 },

  dock:       { x: 66,  z: 24 },     // Milbrook dock on the river
  mbBank:     { x: 54,  z: 33 },     // Milbrook bank chest
  mbFire:     { x: 58,  z: 28 },     // Milbrook cooking fire

  forest:     { x: -52, z: 12 },     // Oakwood (normal + oak trees)
};

// River flows west → east across the middle, past Milbrook.
export const RIVER = [
  { x: -118, z: 44 }, { x: -70, z: 30 }, { x: -26, z: 38 }, { x: 4, z: 36 },
  { x: 34, z: 24 }, { x: 62, z: 18 }, { x: 90, z: 2 }, { x: 120, z: -12 },
];

// Shallow walkable ford where the main road crosses the river.
export const FORD = { x: 0, z: 36, r: 5.5 };

// Dirt roads (polylines) — rendered as worn paths in the terrain colours.
export const ROADS = [
  // Bramblewick → ford → Ashford
  [{ x: -1, z: 66 }, { x: 0, z: 48 }, { x: 0, z: 36 }, { x: 0, z: 14 }, { x: 0, z: -20 }],
  // Ashford → Milbrook
  [{ x: 4, z: -20 }, { x: 26, z: -2 }, { x: 44, z: 16 }, { x: 58, z: 27 }],
  // Ashford → Stonefell Mine
  [{ x: 2, z: -32 }, { x: 18, z: -48 }, { x: 36, z: -59 }],
  // Ashford → Goblin Camp (fainter track)
  [{ x: -4, z: -32 }, { x: -26, z: -46 }, { x: -45, z: -57 }],
  // Bramblewick → Oakwood forest
  [{ x: -4, z: 65 }, { x: -26, z: 46 }, { x: -44, z: 22 }],
];
