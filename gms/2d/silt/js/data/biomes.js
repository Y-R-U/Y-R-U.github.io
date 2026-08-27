// Biome = palette + light rig. Plain data, no imports, no behaviour — the
// renderer (lane A) consumes this through setBiome() and nothing else here may
// assume anything about how it is drawn.
//
// Every biome must define a colour for every material id in materials.js and
// tint colours for 1..MAX_TINTS. Tint 0 means "untinted": tintable material
// that carries no colour, which is what scenery and tide fill use.

export const MAX_TINTS = 7;

// Tint indices 1..3 are the piece colours. 4..8 are BRINE: the shades TIDE
// floods with. They must be five distinct INDICES so no one of themoccupies enough of
// the board to percolate — but they should read to the eye as one body of
// water, so each biome sets them to near-identical shades of its own water
// colour. Mechanically five colours, visually one.
export const BRINE_FIRST = 4;
export const BRINE_COUNT = 4;   // indices 4..7. The renderer's own palette
                                // (js/gfx/biomes.js) has TINT_SLOTS = 8, so 8
                                // is off the end of it — four brine colours is
                                // the ceiling, and p = 0.25 per colour is still
                                // clear of the 0.407 percolation threshold.

// #rrggbb strings. The renderer is free to convert once at upload time.
const COMMON_UNLIT = { empty: '#00000000' };

function biome(id, name, o) { return { id, name, ...COMMON_UNLIT, ...o }; }

export const BIOMES = {

  // ---------------------------------------------------------------- dune
  // Warm gold. Late afternoon, low sun, dust in the air. The default look and
  // the one the attract screen ships with.
  dune: biome('dune', 'Dune', {
    bg: ['#2a1c10', '#5c3a17', '#8a5a22'],      // top -> horizon -> floor glow
    fog: { color: '#c08a44', density: 0.16, height: 0.55 },
    light: {
      ambient: '#6b4a26', ambientI: 0.42,
      sun: '#ffd79a', sunI: 1.0, sunDir: [-0.55, -0.80],
      rim: '#ff9d4a', rimI: 0.30,
      bloom: 0.22, exposure: 1.06, vignette: 0.30, grain: 0.05,
    },
    tints: [
      '#8a6b45',   // 0 untinted: raw sand
      '#f2b33d',   // 1 amber
      '#d9603b',   // 2 terracotta
      '#8fc7b0',   // 3 verdigris  (the cool one — reads instantly against 1 & 2)
      '#4f7f96',   // 4 brine
      '#568799',   // 5 brine
      '#4a7891',   // 6 brine
      '#5a8ea0',   // 7 brine
    ],
    mats: {
      wall: '#3b2a18', sand: '#c9a25e', water: '#4f8fb0', jelly: '#d98fb4',
      oil: '#2d2419', lava: '#ff6a1e', ice: '#a9d8e6', ash: '#5a5148',
      crystal: '#e6f0ff', fire: '#ffb03a', steam: '#d8d2c4',
    },
  }),

  // ---------------------------------------------------------------- abyss
  // Deep water, bioluminescent. Almost no ambient: material glows carry the
  // image, which is why TIDE lives here — the rising water is the light source.
  abyss: biome('abyss', 'Abyss', {
    bg: ['#02060d', '#04121f', '#062435'],
    fog: { color: '#0a3348', density: 0.34, height: 0.85 },
    light: {
      ambient: '#0d2a3c', ambientI: 0.18,
      sun: '#7fd6ff', sunI: 0.34, sunDir: [0.20, -0.95],
      rim: '#39f0c8', rimI: 0.65,
      bloom: 0.55, exposure: 1.18, vignette: 0.52, grain: 0.07,
      caustics: 0.35,
    },
    tints: [
      '#2c4a5c',
      '#41e8c4',   // 1 aqua glow
      '#7a6cff',   // 2 violet glow
      '#ffd447',   // 3 lantern gold
      '#12587a',   // 4 brine
      '#166486',   // 5 brine
      '#0f4f70',   // 6 brine
      '#1b6f90',   // 7 brine
    ],
    mats: {
      wall: '#0a1a26', sand: '#3d5b6b', water: '#1d6f96', jelly: '#5fe0d0',
      oil: '#0a0d12', lava: '#ff7a2a', ice: '#8fe6ff', ash: '#232c33',
      crystal: '#bff3ff', fire: '#ffc46a', steam: '#9fd8ea',
    },
  }),

  // ----------------------------------------------------------------- kiln
  // Volcanic. High contrast, hard shadow, everything reads hot. ALCHEMY lives
  // here because lava and crystal are the mode's whole vocabulary.
  kiln: biome('kiln', 'Kiln', {
    bg: ['#12060a', '#2c0b0c', '#57160c'],
    fog: { color: '#8a2c12', density: 0.24, height: 0.45 },
    light: {
      ambient: '#3a1410', ambientI: 0.30,
      sun: '#ffdcc0', sunI: 0.55, sunDir: [-0.30, -0.92],
      rim: '#ff3d12', rimI: 0.85,
      bloom: 0.62, exposure: 1.12, vignette: 0.44, grain: 0.08,
      heatHaze: 0.30,
    },
    tints: [
      '#6b4038',
      '#ffb027',   // 1 ember
      '#3fb6ff',   // 2 quench blue
      '#b7f04a',   // 3 sulphur
      '#2f7fa8',   // 4 brine
      '#3689b2',   // 5 brine
      '#2a769e',   // 6 brine
      '#3d93bb',   // 7 brine
    ],
    mats: {
      wall: '#241012', sand: '#a56a44', water: '#3fa2d6', jelly: '#e0709a',
      oil: '#191014', lava: '#ff5a10', ice: '#bfe6f2', ash: '#463c38',
      crystal: '#f2e4ff', fire: '#ffa326', steam: '#c8b6ae',
    },
  }),

  // ---------------------------------------------------------------- lumen
  // Clinical lab, flat and bright, saturated jelly. JELLY LAB needs the
  // silhouettes to read as soft bodies, so ambient is high and rim is low.
  lumen: biome('lumen', 'Lumen', {
    bg: ['#eef2f6', '#dde5ee', '#c6d2e0'],
    fog: { color: '#dfe7f0', density: 0.08, height: 0.30 },
    light: {
      ambient: '#ffffff', ambientI: 0.78,
      sun: '#ffffff', sunI: 0.62, sunDir: [-0.25, -0.96],
      rim: '#9ab0c8', rimI: 0.14,
      bloom: 0.12, exposure: 1.0, vignette: 0.14, grain: 0.02,
      subsurface: 0.55,
    },
    tints: [
      '#9fb0c0',
      '#ff4d7d',   // 1 raspberry
      '#2ecf7a',   // 2 lime
      '#3d7dff',   // 3 cobalt
      '#8fcfe8',   // 4 brine
      '#9ad7ee',   // 5 brine
      '#84c7e2',   // 6 brine
      '#a5dff3',   // 7 brine
    ],
    mats: {
      wall: '#98a6b6', sand: '#cbb994', water: '#7cc3e8', jelly: '#ff6f9c',
      oil: '#4a4438', lava: '#ff6a1e', ice: '#d6f2fb', ash: '#8b8b8b',
      crystal: '#ffffff', fire: '#ffa23a', steam: '#eef4f8',
    },
  }),

  // --------------------------------------------------------------- quartz
  // Cold glass and brass — the inside of an hourglass. Deliberately readable
  // upside down: the gradient is near-symmetric so a flip is not disorienting.
  quartz: biome('quartz', 'Quartz', {
    bg: ['#171a24', '#20242f', '#171a24'],
    fog: { color: '#3a4152', density: 0.14, height: 0.50 },
    light: {
      ambient: '#39415a', ambientI: 0.46,
      sun: '#e8ecff', sunI: 0.78, sunDir: [0.0, -1.0],
      rim: '#c9a227', rimI: 0.42,
      bloom: 0.28, exposure: 1.04, vignette: 0.34, grain: 0.04,
      symmetric: 1,
    },
    tints: [
      '#6e7488',
      '#e4c66a',   // 1 brass
      '#7fd4e8',   // 2 glass blue
      '#e07a8f',   // 3 rose quartz
      '#5f93ad',   // 4 brine
      '#679cb6',   // 5 brine
      '#578aa4',   // 6 brine
      '#70a5bf',   // 7 brine
    ],
    mats: {
      wall: '#2b3040', sand: '#d8c39a', water: '#6fa8c8', jelly: '#d98fb4',
      oil: '#1d1f28', lava: '#ff7a2a', ice: '#cfeaf5', ash: '#4c515e',
      crystal: '#f4f8ff', fire: '#ffb85c', steam: '#dfe4ee',
    },
  }),
};

export const BIOME_IDS = Object.keys(BIOMES);
export const DEFAULT_BIOME = 'dune';
export const getBiome = (id) => BIOMES[id] || BIOMES[DEFAULT_BIOME];
