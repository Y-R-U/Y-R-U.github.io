// A biome is a palette + a light rig + a grade. Nothing else. Swapping one at
// runtime must never touch a shader, a target or a program — only these numbers.

import { MAT_COUNT } from '../sim/materials.js';

export const TINT_SLOTS = 8;   // index 0 unused (0 == untinted), 1..7 usable

// Base material look. (colour is linear-ish and may exceed 1 for emissives.)
// props = [fluid, emissive, translucent, tintMix]
const BASE = {
  empty:   { col: [0, 0, 0],                 props: [0, 0, 0, 0] },
  wall:    { col: [0.048, 0.046, 0.056],     props: [0, 0, 0, 0] },
  sand:    { col: [0.300, 0.200, 0.115],     props: [0, 0, 0.06, 0.75] },
  water:   { col: [0.030, 0.150, 0.280],        props: [1, 0, 0.55, 0.55] },
  jelly:   { col: [0.260, 0.105, 0.340],        props: [0, 0, 1.00, 0.90] },
  oil:     { col: [0.042, 0.036, 0.060],     props: [1, 0, 0.10, 0.30] },
  lava:    { col: [2.60, 0.62, 0.10],        props: [0.85, 1, 0.20, 0] },
  ice:     { col: [0.290, 0.430, 0.540],        props: [0.35, 0, 0.90, 0.45] },
  ash:     { col: [0.105, 0.098, 0.094],     props: [0, 0, 0, 0] },
  crystal: { col: [0.345, 0.390, 0.560],        props: [0.30, 0, 0.85, 0.35] },
  fire:    { col: [3.40, 1.35, 0.30],        props: [0.90, 1, 0, 0] },
  steam:   { col: [0.400, 0.440, 0.480],        props: [0.60, 0, 0.90, 0] },
};
const ORDER = ['empty', 'wall', 'sand', 'water', 'jelly', 'oil', 'lava', 'ice', 'ash', 'crystal', 'fire', 'steam'];

export const BIOMES = {
  /* ---------------------------------------------------------------- dune */
  dune: {
    name: 'dune',
    tints: [
      [0, 0, 0],
      [0.400, 0.252, 0.098],   // ochre
      [0.420, 0.165, 0.105],   // terracotta
      [0.320, 0.288, 0.232],   // bone
      [0.090, 0.265, 0.280],   // deep teal
      [0.310, 0.130, 0.280],   // aubergine
      [0.230, 0.245, 0.120],   // olive
      [0.330, 0.282, 0.196],
    ],
    sky: { top: [0.0185, 0.0150, 0.0195], bot: [0.0055, 0.0045, 0.0080] },
    glow: { col: [0.300, 0.170, 0.078], pos: [0.14, 1.08], amt: 0.72, band: 0.09 },
    mote: { col: [1.00, 0.83, 0.52], amt: 0.20 },
    key:  { dir: [-0.50, 0.866], col: [1.38, 1.03, 0.66] },
    fill: { dir: [0.56, 0.50], col: [0.26, 0.38, 0.62] },
    amb:  [0.140, 0.114, 0.108],
    rim:  [1.00, 0.80, 0.55],
    emis: [1.70, 1.18, 0.55],
    surf: { rim: 0.36, spec: 0.70, sss: 0.75, grain: 0.70, refr: 0.038, ao: 0.85, shadow: 0.58, relief: 0.55 },
    grade: {
      exposure: 1.14, sat: 1.06, contrast: 1.16, vignette: 0.60, grain: 0.026,
      bloom: 0.78, threshold: 0.74, knee: 0.42,
      shadowTint: [0.86, 0.94, 1.11], highTint: [1.11, 1.02, 0.87],
    },
  },

  /* --------------------------------------------------------------- abyss */
  abyss: {
    name: 'abyss',
    tints: [
      [0, 0, 0],
      [0.055, 0.340, 0.410],   // cyan
      [0.235, 0.140, 0.520],   // violet
      [0.470, 0.095, 0.265],   // magenta
      [0.075, 0.360, 0.205],   // jade
      [0.075, 0.180, 0.520],   // deep blue
      [0.470, 0.250, 0.085],   // coral
      [0.330, 0.420, 0.470],
    ],
    mats: { sand: [0.18, 0.24, 0.28], ash: [0.07, 0.09, 0.11], wall: [0.020, 0.032, 0.045] },
    sky: { top: [0.0040, 0.0140, 0.0250], bot: [0.0010, 0.0040, 0.0105] },
    glow: { col: [0.030, 0.165, 0.245], pos: [0.50, 1.03], amt: 0.78, band: 0.16 },
    mote: { col: [0.50, 1.00, 1.00], amt: 0.42 },
    key:  { dir: [0.30, 0.954], col: [0.52, 0.94, 1.16] },
    fill: { dir: [-0.40, -0.917], col: [0.58, 0.18, 0.62] },
    amb:  [0.042, 0.078, 0.104],
    rim:  [0.45, 0.96, 1.12],
    emis: [0.55, 1.55, 1.65],
    surf: { rim: 0.60, spec: 1.05, sss: 1.35, grain: 0.70, refr: 0.052, ao: 0.90, shadow: 0.50, relief: 0.50 },
    grade: {
      exposure: 1.18, sat: 1.06, contrast: 1.10, vignette: 0.70, grain: 0.024,
      bloom: 1.05, threshold: 0.60, knee: 0.40,
      shadowTint: [0.80, 0.98, 1.22], highTint: [0.92, 1.05, 1.12],
    },
  },

  /* ---------------------------------------------------------------- kiln */
  kiln: {
    name: 'kiln',
    tints: [
      [0, 0, 0],
      [0.520, 0.205, 0.055],   // ember
      [0.420, 0.310, 0.100],   // brass
      [0.150, 0.135, 0.140],   // char
      [0.430, 0.075, 0.065],   // blood
      [0.400, 0.370, 0.335],   // ash white
      [0.380, 0.380, 0.100],   // sulphur
      [0.230, 0.150, 0.270],
    ],
    mats: { sand: [0.22, 0.145, 0.095], wall: [0.055, 0.038, 0.034] },
    sky: { top: [0.0130, 0.0095, 0.0110], bot: [0.0400, 0.0130, 0.0058] },
    glow: { col: [0.340, 0.105, 0.030], pos: [0.50, -0.02], amt: 0.90, band: 0.20 },
    mote: { col: [1.00, 0.55, 0.18], amt: 0.50 },
    key:  { dir: [0.45, 0.893], col: [1.46, 1.06, 0.72] },
    fill: { dir: [0.0, -1.0], col: [1.12, 0.34, 0.08] },
    amb:  [0.120, 0.066, 0.046],
    rim:  [1.22, 0.56, 0.18],
    emis: [2.05, 0.92, 0.28],
    surf: { rim: 0.42, spec: 0.85, sss: 1.00, grain: 0.90, refr: 0.040, ao: 0.82, shadow: 0.62, relief: 0.58 },
    grade: {
      exposure: 1.12, sat: 1.02, contrast: 1.14, vignette: 0.66, grain: 0.030,
      bloom: 0.98, threshold: 0.66, knee: 0.42,
      shadowTint: [0.95, 0.90, 1.02], highTint: [1.16, 0.98, 0.79],
    },
  },
};

export const BIOME_NAMES = Object.keys(BIOMES);

/** Flatten a biome into the typed arrays the resolve shader wants. */
export function bakeBiome(b) {
  const matCol = new Float32Array(MAT_COUNT * 3);
  const matProp = new Float32Array(MAT_COUNT * 4);
  for (let i = 0; i < ORDER.length && i < MAT_COUNT; i++) {
    const name = ORDER[i];
    const base = BASE[name];
    const col = (b.mats && b.mats[name]) || base.col;
    matCol[i * 3] = col[0]; matCol[i * 3 + 1] = col[1]; matCol[i * 3 + 2] = col[2];
    for (let k = 0; k < 4; k++) matProp[i * 4 + k] = base.props[k];
  }
  const tints = new Float32Array(TINT_SLOTS * 3);
  for (let i = 0; i < TINT_SLOTS; i++) {
    const t = b.tints[i] || b.tints[b.tints.length - 1];
    tints[i * 3] = t[0]; tints[i * 3 + 1] = t[1]; tints[i * 3 + 2] = t[2];
  }
  return { matCol, matProp, tints };
}
