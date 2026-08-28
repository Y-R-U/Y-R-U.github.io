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
      // Three piece tints that separate by HUE, not by lightness: gold, fired
      // red, verdigris. A warm-grey third colour (the old "bone") is the same
      // hue as the key light, so under a warm rig it is the piece you cannot
      // name — and naming it is the whole game.
      [0.400, 0.238, 0.072],   // ochre gold
      [0.415, 0.108, 0.052],   // fired terracotta
      [0.115, 0.300, 0.238],   // verdigris — the cool one
      [0.075, 0.185, 0.245],   // brine 4..7: mechanically distinct indices,
      [0.070, 0.175, 0.240],   // visually one body of water
      [0.082, 0.196, 0.238],
      [0.068, 0.170, 0.232],
    ],
    // Dune is the DEFAULT biome and the first thing anyone ever sees, so the air
    // inside the vessel has to be warm and lit, not dead space above a pile.
    // The vessel structure stays — dark walls, pooled floor, lit lip — it is
    // just no longer sitting in the dark.
    sky: { top: [0.018, 0.0122, 0.0062], bot: [0.026, 0.0176, 0.0086] },
    // The sun spills in over the top-left lip. Tight enough to actually fall off
    // down the frame — a wide one just floods the whole vessel flat.
    glow: { col: [0.480, 0.330, 0.158], pos: [0.16, 1.04], amt: 0.80, band: 0.20, tight: [5.0, 7.0] },
    // Negative roof term: dune's light comes from ABOVE, so the ceiling band is
    // the bright end of the vessel, not the dark one.
    well:  [0.70, 1.05, 0.46, -0.20],
    well2: [0.14, 3.60, 0.34, 0.50],
    mote: { col: [1.00, 0.78, 0.44], amt: 0.40 },
    key:  { dir: [-0.50, 0.866], col: [1.38, 1.03, 0.66] },
    fill: { dir: [0.56, 0.50], col: [0.26, 0.38, 0.62] },
    amb:  [0.140, 0.114, 0.108],
    rim:  [1.00, 0.80, 0.55],
    emis: [1.70, 1.18, 0.55],
    surf: { rim: 0.36, spec: 0.70, sss: 0.75, grain: 0.70, refr: 0.038, ao: 0.85, shadow: 0.58, relief: 0.55 },
    piece: [0.62, 0.26, 0.085],   // chroma push, luma pull, own-hue rim
    grade: {
      exposure: 1.16, sat: 1.26, contrast: 1.06, vignette: 0.50, grain: 0.026,
      bloom: 0.94, threshold: 0.70, knee: 0.42,
      shadowTint: [0.94, 0.95, 1.04], highTint: [1.12, 1.02, 0.86],
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
      // brine 4..7. Every other biome already followed the rule in
      // data/biomes.js — four distinct INDICES so no one colour percolates,
      // near-identical SHADES so the player sees one body of water. Abyss did
      // not: it carried jade / deep blue / CORAL / pale grey here, and since
      // TIDE floods in 2x2 clusters that painted the tide as a mosaic of
      // lozenges. It is the only mode that uses this biome.
      [0.050, 0.215, 0.330],
      [0.045, 0.202, 0.322],
      [0.058, 0.228, 0.340],
      [0.042, 0.195, 0.315],
    ],
    mats: { sand: [0.18, 0.24, 0.28], ash: [0.07, 0.09, 0.11], wall: [0.020, 0.032, 0.045] },
    sky: { top: [0.0040, 0.0140, 0.0250], bot: [0.0010, 0.0040, 0.0105] },
    glow: { col: [0.030, 0.165, 0.245], pos: [0.50, 1.03], amt: 0.78, band: 0.16, tight: [4.5, 4.5] },
    well:  [0.46, 0.80, 0.54, 0.38],
    well2: [0.17, 3.40, 0.30, 0.30],
    mote: { col: [0.50, 1.00, 1.00], amt: 0.42 },
    key:  { dir: [0.30, 0.954], col: [0.52, 0.94, 1.16] },
    fill: { dir: [-0.40, -0.917], col: [0.58, 0.18, 0.62] },
    amb:  [0.042, 0.078, 0.104],
    rim:  [0.45, 0.96, 1.12],
    emis: [0.55, 1.55, 1.65],
    surf: { rim: 0.60, spec: 1.05, sss: 1.35, grain: 0.70, refr: 0.052, ao: 0.90, shadow: 0.50, relief: 0.50 },
    piece: [0.42, 0.16, 0.065],
    grade: {
      exposure: 1.18, sat: 1.06, contrast: 1.10, vignette: 0.70, grain: 0.024,
      bloom: 0.92, threshold: 0.70, knee: 0.40,
      shadowTint: [0.80, 0.98, 1.22], highTint: [0.92, 1.05, 1.12],
    },
  },

  /* ---------------------------------------------------------------- kiln */
  kiln: {
    name: 'kiln',
    tints: [
      [0, 0, 0],
      // Same rule as dune: the three piece tints separate by HUE. The old set
      // (ember / ash white / char) was one hot colour, one that goes cream
      // under a hot rig, and one that vanishes into a dark frame entirely.
      [0.560, 0.205, 0.045],   // ember
      [0.075, 0.235, 0.415],   // quench blue
      [0.330, 0.372, 0.072],   // sulphur
      [0.062, 0.170, 0.238],   // brine 4..7
      [0.058, 0.162, 0.232],
      [0.068, 0.180, 0.242],
      [0.055, 0.156, 0.228],
    ],
    mats: { sand: [0.22, 0.145, 0.095], wall: [0.055, 0.038, 0.034] },
    sky: { top: [0.0130, 0.0095, 0.0110], bot: [0.0400, 0.0130, 0.0058] },
    glow: { col: [0.340, 0.105, 0.030], pos: [0.50, -0.04], amt: 0.58, band: 0.16, tight: [4.5, 4.5] },
    well:  [0.46, 0.80, 0.54, 0.38],
    well2: [0.17, 3.40, 0.30, 0.30],
    mote: { col: [1.00, 0.55, 0.18], amt: 0.50 },
    key:  { dir: [0.45, 0.893], col: [1.46, 1.06, 0.72] },
    fill: { dir: [0.0, -1.0], col: [0.52, 0.19, 0.055] },
    amb:  [0.120, 0.066, 0.046],
    rim:  [1.22, 0.56, 0.18],
    emis: [2.05, 0.92, 0.28],
    surf: { rim: 0.42, spec: 0.85, sss: 1.00, grain: 0.90, refr: 0.040, ao: 0.82, shadow: 0.62, relief: 0.58 },
    piece: [0.56, 0.22, 0.080],
    grade: {
      exposure: 1.12, sat: 1.02, contrast: 1.14, vignette: 0.66, grain: 0.030,
      bloom: 0.46, threshold: 1.00, knee: 0.45,
      shadowTint: [0.95, 0.90, 1.02], highTint: [1.16, 0.98, 0.79],
    },
  },

  /* --------------------------------------------------------------- lumen */
  // JELLY LAB. Clinical and bright: high ambient, low rim, subsurface doing most
  // of the work so a soft body reads as translucent gel rather than a painted
  // blob. The data lane asks for a WHITE lab backdrop; taken literally that
  // kills both of this renderer's load-bearing effects — the dissolve is
  // ADDITIVE and disappears on white, and the airborne piece has nothing to
  // separate from. So the sky sits at a pale lab grey, ~4x dune and by far the
  // brightest biome, and the vessel keeps its frame.
  lumen: {
    name: 'lumen',
    tints: [
      [0, 0, 0],
      // Hue triad again, not a lightness ramp: raspberry, lime, cobalt. All
      // three are high-chroma because a bright neutral backdrop eats pastels.
      [0.470, 0.075, 0.185],   // raspberry
      [0.095, 0.400, 0.165],   // lime
      [0.070, 0.185, 0.500],   // cobalt — the deep one
      [0.135, 0.290, 0.355],   // brine 4..7: pale aqua, one body of water and
      [0.128, 0.280, 0.348],   // nowhere near cobalt's deep blue
      [0.142, 0.300, 0.362],
      [0.124, 0.272, 0.342],
    ],
    mats: {
      wall: [0.100, 0.110, 0.126], sand: [0.300, 0.272, 0.220],
      water: [0.070, 0.210, 0.285], ash: [0.140, 0.145, 0.150],
      crystal: [0.430, 0.470, 0.545], ice: [0.320, 0.415, 0.480],
      oil: [0.070, 0.062, 0.052],
    },
    // The one LIGHT biome in the set, and the number that makes it one. Kept
    // just under the bloom threshold so the backdrop never blooms into the
    // piece, and the vessel outside stays dark so the board reads as a lightbox.
    sky: { top: [0.1900, 0.1955, 0.2030], bot: [0.2460, 0.2520, 0.2600] },
    // Overhead softbox, not a sun. Wide and weak: a lab is lit from a ceiling
    // panel and has no direction to speak of.
    glow: { col: [0.150, 0.158, 0.172], pos: [0.50, 1.04], amt: 0.70, band: 0.06, tight: [1.0, 3.4] },
    well:  [0.96, 0.20, 0.26, -0.10],
    well2: [0.13, 3.10, 0.06, 0.30],
    mote: { col: [0.86, 0.94, 1.00], amt: 0.18 },
    key:  { dir: [-0.28, 0.960], col: [1.06, 1.09, 1.14] },
    fill: { dir: [0.52, -0.30], col: [0.30, 0.34, 0.41] },
    amb:  [0.176, 0.186, 0.200],
    rim:  [0.66, 0.80, 0.94],
    emis: [1.70, 1.80, 1.62],
    // "Flat and bright" is the mood, but SILT's whole read is the sculpted heap,
    // so AO and the cast shadow stay strong even though the key is weak — on a
    // pale backdrop contact darkening is what gives the pile any form at all.
    surf: { rim: 0.26, spec: 0.86, sss: 1.55, grain: 0.52, refr: 0.044, ao: 0.86, shadow: 0.54, relief: 0.52 },
    // Worst case for the ACES shoulder in the whole game: a bright backdrop and
    // the highest ambient, so an unoccluded piece is pinned at the top of the
    // curve. The push and the pull are both the strongest here.
    piece: [0.74, 0.34, 0.100],
    grade: {
      exposure: 1.00, sat: 1.24, contrast: 1.13, vignette: 0.36, grain: 0.016,
      bloom: 0.52, threshold: 0.88, knee: 0.40,
      shadowTint: [0.97, 1.00, 1.06], highTint: [1.02, 1.00, 0.97],
    },
  },

  /* -------------------------------------------------------------- quartz */
  // HOURGLASS. Cool mineral glass and brass. The board rotates 180 degrees every
  // ~30 s, so the backdrop is deliberately SYMMETRIC top to bottom — the key
  // glow is a horizontal band at the waist and the floor pool is matched by a
  // negative roof term, so a flip does not swing the light across the frame.
  quartz: {
    name: 'quartz',
    tints: [
      [0, 0, 0],
      [0.445, 0.298, 0.055],   // brass
      [0.055, 0.262, 0.440],   // glass blue
      // Rose quartz pushed toward magenta rather than salmon: B well above G, so
      // it can never collapse into brass on the shoulder the way a warm pink
      // would. Same failure mode as dune's old "bone", one hue round.
      [0.450, 0.090, 0.238],   // rose
      [0.088, 0.198, 0.272],   // brine 4..7
      [0.082, 0.190, 0.266],
      [0.094, 0.208, 0.278],
      [0.078, 0.184, 0.260],
    ],
    mats: {
      wall: [0.030, 0.034, 0.050], sand: [0.288, 0.244, 0.180],
      water: [0.032, 0.140, 0.230], crystal: [0.380, 0.440, 0.600],
      ice: [0.300, 0.420, 0.520], ash: [0.075, 0.080, 0.092],
    },
    // Top and bottom are within 5% of each other on purpose. HOURGLASS turns the
    // board over, so the pile spends half its life against the ceiling — an
    // asymmetric gradient would put it in the dark every other flip.
    sky: { top: [0.0180, 0.0200, 0.0288], bot: [0.0173, 0.0193, 0.0281] },
    // The waist of the hourglass. Anisotropic the other way round from every
    // other biome: nearly flat across, tight vertically, so it is a band and not
    // a sun. Symmetric under a flip by construction.
    glow: { col: [0.240, 0.272, 0.380], pos: [0.50, 0.50], amt: 0.90, band: 0.13, tight: [1.9, 15.0] },
    well:  [0.80, 0.26, 0.40, -0.24],
    well2: [0.16, 4.20, 0.16, 0.72],
    mote: { col: [0.84, 0.90, 1.00], amt: 0.34 },
    key:  { dir: [0.26, 0.966], col: [1.02, 1.10, 1.30] },
    fill: { dir: [-0.44, -0.60], col: [0.36, 0.27, 0.14] },
    amb:  [0.104, 0.118, 0.152],
    rim:  [1.00, 0.84, 0.48],   // brass fittings on cool glass
    emis: [1.55, 1.50, 1.32],
    surf: { rim: 0.44, spec: 1.00, sss: 0.90, grain: 0.60, refr: 0.048, ao: 0.86, shadow: 0.54, relief: 0.52 },
    piece: [0.66, 0.28, 0.092],
    grade: {
      exposure: 1.06, sat: 1.20, contrast: 1.08, vignette: 0.42, grain: 0.022,
      bloom: 0.72, threshold: 0.80, knee: 0.42,
      shadowTint: [0.92, 0.96, 1.11], highTint: [1.09, 1.03, 0.90],
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
