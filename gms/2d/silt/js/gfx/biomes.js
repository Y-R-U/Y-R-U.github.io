// A biome is a palette + a light rig + a grade. Nothing else. Swapping one at
// runtime must never touch a shader, a target or a program — only these numbers.

import { MAT_COUNT, KIND, STATIC } from '../sim/materials.js';

export const TINT_SLOTS = 8;   // index 0 unused (0 == untinted), 1..7 usable

// Base material look. (colour is linear-ish and may exceed 1 for emissives.)
// props = [fluid, emissive, translucent, tintMix]
//
// What the four slots actually drive, in LIGHT_FS: `fluid` adds ANIMATED wave
// normals, caustics and refraction; `emissive` opens the lava crust/vein path;
// `translucent` drives subsurface, the fresnel rim and refraction; `tintMix` is
// read in RESOLVE_FS and is how much of the cell's tint replaces the material
// colour. Roughness and micro-grain are NOT slots — they are derived, as
// `grain = 1 - fluid - translucent`, so opacity and roughness are one axis:
// there is no way to say "smoother than sand but still opaque". See the note
// on wall below.
const BASE = {
  empty:   { col: [0, 0, 0],                 props: [0, 0, 0, 0] },
  // Hewn stone, not powder. This used to be 0.048 — near black — and every
  // biome override was darker still, so a WALL pillar came out as a flat black
  // cutout: AO, the cast shadow, the bevel the density gradient puts on its
  // edges and the grain normals were all being applied to an albedo of nothing.
  // The value is the whole fix. Structure has to sit UNDER the material it
  // holds up, so it is a low-chroma warm grey at about half of sand's value —
  // far enough apart in chroma to read as a different substance at the same
  // glance, dark enough not to compete with the play material.
  //
  // props: opaque, and untintable on purpose (scenery must never look like a
  // chain), with a whisper of translucency so a cut edge bleeds the way stone
  // does. That also trims grain from a flat 1.0 to 0.90 — just under sand's
  // 0.94. It cannot go further: a genuinely hewn face wants to be much less
  // powdery than sand and still opaque, and this table cannot express that. So
  // can the grain PATTERN: the noise in LIGHT_FS is stretched 4:1 horizontally
  // to read as sand bedding, and every non-fluid material shares it, so stone
  // is currently bedded sandstone whatever the numbers say. Both want a slot
  // and a branch in the shader, which is not a change to make from here.
  wall:    { col: [0.165, 0.145, 0.120],     props: [0, 0, 0.10, 0] },
  sand:    { col: [0.300, 0.200, 0.115],     props: [0, 0, 0.06, 0.75] },
  water:   { col: [0.030, 0.150, 0.280],        props: [1, 0, 0.55, 0.55] },
  jelly:   { col: [0.260, 0.105, 0.340],        props: [0, 0, 1.00, 0.90] },
  oil:     { col: [0.042, 0.036, 0.060],     props: [1, 0, 0.10, 0.30] },
  lava:    { col: [2.60, 0.62, 0.10],        props: [0.85, 1, 0.20, 0] },
  ice:     { col: [0.155, 0.235, 0.300],        props: [0.28, 0, 0.62, 0.45] },
  ash:     { col: [0.105, 0.098, 0.094],     props: [0, 0, 0, 0] },
  // Quenched mineral glass. The same fault as wall, from the opposite end, and
  // this is the one actually in the level-1 capture: ALCHEMY's 'span' levels
  // build their pillars out of CRYSTAL, not WALL. At 0.345/0.390/0.560 with
  // translucent 0.85 the subsurface term saturated the entire slab, so a pillar
  // rendered as a flat white block with no shading left in it — the "pale grey
  // block with a flat top". Darker glass hands the read back to the fresnel rim
  // and the specular instead of a blown interior.
  //
  // fluid 0.30 -> 0.10 as well: fluid is what puts the ANIMATED wave normals on
  // a surface, and crystal is the one material the game promises is permanent.
  // It was quietly flowing. The trim also lifts grain off exactly 0.0 (it is
  // now 0.28), so a cut face has some micro-relief instead of none.
  crystal: { col: [0.150, 0.205, 0.290],        props: [0.10, 0, 0.62, 0.35] },
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
    mats: { sand: [0.18, 0.24, 0.28], ash: [0.07, 0.09, 0.11], wall: [0.105, 0.118, 0.130] },
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
    // Wall was [0.155, 0.115, 0.092] — a WARM grey, the same hue family as a hot
    // red vessel and the ochre sand in front of it, and kiln puts its scenery
    // right where the key glow makes the backdrop brightest. Measured against a
    // bare board, a 2-cell divider read 16.5 of 255 per channel; the same VALUE
    // rolled neutral reads 23.4. It is dune's old "bone" one more time — the
    // separation that pays is HUE, not lightness — and rolling it costs nothing,
    // because the wall stays exactly as dark as it was and so never starts
    // competing with the sand it holds up.
    mats: { sand: [0.22, 0.145, 0.095], wall: [0.150, 0.132, 0.128] },
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
  // JELLY LAB. A specimen tank standing on a LIGHT TABLE, in a dark room.
  //
  // This started life as "clinical and bright" — a pale neutral lab grey at
  // ~4x dune, high ambient, weak key. Both halves of that were wrong on a
  // phone. Grey is not a light, it is the absence of one: with no chroma in
  // the field there was nothing for sat to work on, the vignette turned the
  // corners into dishwater, and the wordmark's drop shadow read as dirt
  // instead of depth. And a 3:1 key-to-ambient ratio (abyss and dune both run
  // ~10:1) filled every shadow, so the heap had no form and the blobs sat on
  // the board like gouache on card.
  //
  // Kept: it is still by far the LIGHTEST biome — nothing else in the set gets
  // within two stops of the panel's core — the vessel surround is still dark so
  // the board reads as a lit panel, and subsurface still does most of the work
  // on a soft body. Changed: the brightness is now a SOURCE rather than a fill.
  // A broad aqua shaft across the middle of the tank, deepening to almost black
  // at the ceiling and at the floor, so the empty air has a direction, the heap
  // has something to silhouette against, and every additive term this renderer
  // owns — dissolve flash, motes, rim, bloom — has somewhere dark to land.
  lumen: {
    name: 'lumen',
    tints: [
      [0, 0, 0],
      // Hue triad, not a lightness ramp. The field now sits at hue ~185, so
      // the triad is chosen to straddle it: raspberry and cobalt were always
      // clear of it, but the old lime (0.095/0.400/0.165) was a blue-green
      // only ~50 degrees off a teal panel. Rolled toward chartreuse — G still
      // dominant, R lifted well above B — which widens it against BOTH the
      // field and cobalt. All three stay high-chroma: a bright backdrop eats
      // pastels.
      [0.500, 0.080, 0.150],   // raspberry
      [0.240, 0.375, 0.100],   // chartreuse — the warm one
      [0.095, 0.170, 0.480],   // cobalt — the deep one
      [0.115, 0.245, 0.300],   // brine 4..7: one body of water, deeper than the
      [0.109, 0.236, 0.293],   // panel behind it so it still reads as liquid
      [0.121, 0.254, 0.307],
      [0.105, 0.229, 0.288],
    ],
    mats: {
      // Warm stone under a cold lamp, and for the same reason as kiln's: the
      // wall was [0.120, 0.132, 0.148], a blue-grey against a teal panel, which
      // is the one biome where the backdrop is the BRIGHT side of the contrast.
      // Rolling it warm took a 2-cell divider from 22.5 to 30.7 per channel.
      wall: [0.162, 0.140, 0.126], sand: [0.155, 0.200, 0.212],
      water: [0.055, 0.190, 0.245], ash: [0.108, 0.114, 0.120],
      crystal: [0.150, 0.215, 0.262], ice: [0.160, 0.230, 0.278],
      oil: [0.062, 0.056, 0.048],
    },
    // The dark room the tank stands in, not the panel — the panel is the glow
    // below. Near-symmetric top to bottom and deliberately almost black: a
    // uniformly bright field was the original mistake, and a second one at a
    // saturated mid-teal was no better, because it put the material and the
    // backdrop in the same value band and nothing separated. The light has to
    // be a SOURCE with falloff, not a fill.
    sky: { top: [0.010, 0.026, 0.034], bot: [0.014, 0.034, 0.032] },
    // The lamp under the table, diffused up through the acrylic. Broad and
    // strong, and deliberately BELOW the wordmark: the attract title sits in
    // the top fifth, where the panel is at its deepest, so gold letters and
    // their shadow both have something to sit against. It also puts the hot
    // zone behind the falling piece and behind the crest of the heap.
    glow: { col: [0.130, 0.360, 0.335], pos: [0.50, 0.56], amt: 2.35, band: 0.18, tight: [4.0, 12.0] },
    // Sides pulled in hard (0.40) and a positive roof term: the acrylic edges
    // and the top of the tank are where the light runs out, so the panel is
    // framed by its own falloff rather than by the post vignette.
    well:  [0.94, 0.26, 0.40, 0.24],
    well2: [0.11, 3.30, 0.20, 0.55],
    mote: { col: [0.72, 1.00, 0.96], amt: 0.34 },
    key:  { dir: [0.40, 0.916], col: [1.20, 1.34, 1.32] },
    // Fill comes from BELOW and carries the panel's own aqua. It is the one
    // biome where the bounce is motivated by the fiction rather than invented.
    fill: { dir: [0.0, -1.0], col: [0.14, 0.42, 0.44] },
    // A third of what it was. This is the change that gives the heap form back.
    amb:  [0.062, 0.098, 0.104],
    rim:  [0.60, 1.10, 1.05],
    emis: [1.30, 1.95, 1.85],
    // Backlit gel: rim and spec both up, subsurface still the loudest term in
    // the set, AO and cast shadow strong so a heap in front of a lit panel
    // still reads as a heap.
    surf: { rim: 0.42, spec: 0.95, sss: 1.45, grain: 0.76, refr: 0.056, ao: 0.92, shadow: 0.62, relief: 0.56 },
    // Still the hardest piece read in the game — a small blob against the
    // brightest field — but with the ambient down it is no longer pinned to
    // the top of the ACES curve, so the push and the pull can both ease off.
    piece: [0.62, 0.24, 0.095],
    grade: {
      exposure: 1.02, sat: 1.22, contrast: 1.12, vignette: 0.24, grain: 0.018,
      bloom: 0.80, threshold: 0.86, knee: 0.42,
      shadowTint: [0.86, 1.02, 1.08], highTint: [1.12, 1.03, 0.92],
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
      wall: [0.118, 0.126, 0.152], sand: [0.288, 0.244, 0.180],
      water: [0.032, 0.140, 0.230], crystal: [0.140, 0.185, 0.290],
      ice: [0.150, 0.225, 0.290], ash: [0.075, 0.080, 0.092],
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

/**
 * Which materials are the BUILT WORLD rather than poured material. Taken from
 * the sim's own KIND table, never a hand-kept list here: a material that stops
 * being static in materials.js must stop being drawn as masonry in the same
 * commit, and a fourth copy of "which ones are the walls" is how that rots.
 */
const MAT_STATIC = (() => {
  const a = new Float32Array(MAT_COUNT);
  for (let i = 0; i < MAT_COUNT; i++) a[i] = KIND[i] === STATIC ? 1 : 0;
  return a;
})();
export { MAT_STATIC };

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
