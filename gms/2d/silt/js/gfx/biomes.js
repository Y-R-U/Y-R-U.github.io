// A biome is a palette + a light rig + a grade. Nothing else. Swapping one at
// runtime must never touch a shader, a target or a program — only these numbers.

import { MAT_COUNT } from '../sim/materials.js';

export const TINT_SLOTS = 8;   // index 0 unused (0 == untinted), 1..7 usable

// Base material look. (colour is linear-ish and may exceed 1 for emissives.)
// props = [fluid, emissive, translucent, tintMix]
const BASE = {
  empty:   { col: [0, 0, 0],                 props: [0, 0, 0, 0] },
  wall:    { col: [0.085, 0.082, 0.098],     props: [0, 0, 0, 0] },
  sand:    { col: [0.78, 0.55, 0.28],        props: [0, 0, 0.06, 1.00] },
  water:   { col: [0.06, 0.30, 0.54],        props: [1, 0, 0.55, 0.55] },
  jelly:   { col: [0.48, 0.20, 0.62],        props: [0, 0, 1.00, 0.90] },
  oil:     { col: [0.042, 0.036, 0.060],     props: [1, 0, 0.10, 0.30] },
  lava:    { col: [2.60, 0.62, 0.10],        props: [0.85, 1, 0.20, 0] },
  ice:     { col: [0.52, 0.76, 0.92],        props: [0.35, 0, 0.90, 0.45] },
  ash:     { col: [0.175, 0.165, 0.160],     props: [0, 0, 0, 0] },
  crystal: { col: [0.62, 0.70, 1.00],        props: [0.30, 0, 0.85, 0.35] },
  fire:    { col: [3.40, 1.35, 0.30],        props: [0.90, 1, 0, 0] },
  steam:   { col: [0.70, 0.76, 0.82],        props: [0.60, 0, 0.90, 0] },
};
const ORDER = ['empty', 'wall', 'sand', 'water', 'jelly', 'oil', 'lava', 'ice', 'ash', 'crystal', 'fire', 'steam'];

export const BIOMES = {
  /* ---------------------------------------------------------------- dune */
  dune: {
    name: 'dune',
    tints: [
      [0, 0, 0],
      [0.94, 0.64, 0.23],   // amber
      [0.64, 0.23, 0.13],   // rust
      [0.90, 0.85, 0.71],   // bone
      [0.11, 0.46, 0.49],   // deep teal
      [0.48, 0.21, 0.43],   // plum
      [0.54, 0.58, 0.30],   // olive
      [0.86, 0.79, 0.52],
    ],
    sky: { top: [0.098, 0.074, 0.086], bot: [0.030, 0.024, 0.034] },
    glow: { col: [0.90, 0.54, 0.24], pos: [0.16, 0.95], amt: 0.60, band: 0.10 },
    mote: { col: [1.00, 0.83, 0.52], amt: 0.24 },
    key:  { dir: [-0.50, 0.866], col: [1.38, 1.03, 0.66] },
    fill: { dir: [0.56, 0.50], col: [0.26, 0.38, 0.62] },
    amb:  [0.155, 0.130, 0.125],
    rim:  [1.00, 0.80, 0.55],
    emis: [1.70, 1.18, 0.55],
    surf: { rim: 0.55, spec: 0.90, sss: 0.90, grain: 0.55, refr: 0.038, ao: 0.85, shadow: 0.58, relief: 0.55 },
    grade: {
      exposure: 1.06, sat: 1.11, contrast: 1.05, vignette: 0.56, grain: 0.026,
      bloom: 0.78, threshold: 0.74, knee: 0.42,
      shadowTint: [0.86, 0.94, 1.11], highTint: [1.11, 1.02, 0.87],
    },
  },

  /* --------------------------------------------------------------- abyss */
  abyss: {
    name: 'abyss',
    tints: [
      [0, 0, 0],
      [0.14, 0.78, 0.88],   // cyan
      [0.50, 0.29, 0.94],   // violet
      [0.95, 0.26, 0.60],   // magenta
      [0.22, 0.88, 0.53],   // jade
      [0.13, 0.32, 0.80],   // deep blue
      [0.98, 0.63, 0.22],   // coral
      [0.72, 0.92, 1.00],
    ],
    mats: { sand: [0.30, 0.40, 0.46], ash: [0.11, 0.14, 0.17], wall: [0.035, 0.055, 0.075] },
    sky: { top: [0.013, 0.042, 0.068], bot: [0.004, 0.012, 0.026] },
    glow: { col: [0.10, 0.56, 0.78], pos: [0.50, 1.03], amt: 0.72, band: 0.18 },
    mote: { col: [0.50, 1.00, 1.00], amt: 0.48 },
    key:  { dir: [0.30, 0.954], col: [0.52, 0.94, 1.16] },
    fill: { dir: [-0.40, -0.917], col: [0.58, 0.18, 0.62] },
    amb:  [0.045, 0.085, 0.115],
    rim:  [0.45, 0.96, 1.12],
    emis: [0.55, 1.55, 1.65],
    surf: { rim: 0.85, spec: 1.05, sss: 1.35, grain: 0.42, refr: 0.052, ao: 0.90, shadow: 0.50, relief: 0.50 },
    grade: {
      exposure: 1.12, sat: 1.18, contrast: 1.06, vignette: 0.68, grain: 0.024,
      bloom: 1.05, threshold: 0.60, knee: 0.40,
      shadowTint: [0.80, 0.98, 1.22], highTint: [0.92, 1.05, 1.12],
    },
  },

  /* ---------------------------------------------------------------- kiln */
  kiln: {
    name: 'kiln',
    tints: [
      [0, 0, 0],
      [0.98, 0.47, 0.11],   // ember
      [0.84, 0.67, 0.24],   // brass
      [0.24, 0.21, 0.22],   // char
      [0.74, 0.13, 0.13],   // blood
      [0.87, 0.83, 0.77],   // ash white
      [0.83, 0.86, 0.26],   // sulphur
      [0.46, 0.30, 0.56],
    ],
    mats: { sand: [0.42, 0.28, 0.18], wall: [0.10, 0.070, 0.062] },
    sky: { top: [0.055, 0.042, 0.048], bot: [0.150, 0.052, 0.026] },
    glow: { col: [1.00, 0.36, 0.10], pos: [0.50, -0.02], amt: 0.88, band: 0.22 },
    mote: { col: [1.00, 0.55, 0.18], amt: 0.55 },
    key:  { dir: [0.45, 0.893], col: [1.46, 1.06, 0.72] },
    fill: { dir: [0.0, -1.0], col: [1.12, 0.34, 0.08] },
    amb:  [0.135, 0.072, 0.048],
    rim:  [1.22, 0.56, 0.18],
    emis: [2.05, 0.92, 0.28],
    surf: { rim: 0.62, spec: 0.85, sss: 1.00, grain: 0.60, refr: 0.040, ao: 0.82, shadow: 0.62, relief: 0.58 },
    grade: {
      exposure: 1.02, sat: 1.12, contrast: 1.08, vignette: 0.62, grain: 0.030,
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
