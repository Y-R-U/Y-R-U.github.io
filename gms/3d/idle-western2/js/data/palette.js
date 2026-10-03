// Look A "Clay Caricature" (docs/ART_DIRECTION.md §3): sun-baked barn paint on a dusty diorama, violet shadows.
// Builder slot colours (sRGB hex or { c, r, m, g }), ownership skins (W3) and the time-of-day light palettes.
export const PALETTE = {
  sky: '#f4b88a', fog: '#fcd9a6',
  ground: '#dcae80', grass: '#e6b07e', grass2: '#ecbc8c', grassDark: '#d49868', dirt: '#d49a6a', sand: '#e8b888',
  road: '#ecb98a', roadLine: '#e8b888', rut: '#b97b52', kerb: '#8e5c3c', pave: '#a8714a', pave2: '#8e5c3c', pad: '#d9a676', grout: '#6e452d',
  plank: '#a8714a', plank2: '#8e5c3c', plank3: '#6e452d',
  wall: '#c9a27a', wall2: '#b5835a', trim: '#ead9b8', white: '#f3e7cf', roof: '#8a8f93', roof2: '#7c6a5c', tin: '#8a8f93', rust: '#a86b4a',
  wood: '#b88b60', wood2: '#9a6c48', woodDark: '#7a5236', raw: '#c99a6c', dark: '#3e2f28', iron: '#4a4246', stone: '#c8a888', stone2: '#b08d6c',
  brick: '#b5674a', brick2: '#9c573e', rock: '#c5653f', rock2: '#b8705a', rock3: '#d9a08a', rockDark: '#9a4a32',
  glass: { c: '#5b5470', r: 0.12 }, window: { c: '#ffb45a', r: 0.25, g: -1 }, winDay: { c: '#ffb45a', r: 0.3, g: 0.12 }, curtain: '#b5483a', door: '#6e452d',
  leaf: '#8a9a5a', leaf2: '#a3a86a', leafDark: '#6f7a48', trunk: '#7a5638', cactus: '#6e9b57', cactusDark: '#4e7a45', scrub: '#b8a564', hay: '#e2bf6a',
  water: '#7fb0b8', waterDeep: '#4f8e98', foam: '#f4fbfb',
  skin: '#e8b48a', metal: '#8a8f93', chrome: '#c9ced4', lamp: { c: '#ffc978', r: 0.3, g: -1 }, bulb: { c: '#ffe2a8', r: 0.3, g: 1.2 },
  gold: { c: '#e8c25a', r: 0.3, m: 0.85 }, brass: { c: '#c9a24a', r: 0.32, m: 0.8 }, badge: { c: '#ffd27a', r: 0.25, m: 0.9, g: 0.2 },
  accent: '#b5483a', sign: '#ead9b8', stock: '#d9a441', bone: '#efe6d2', cloth: '#efe2c8',
  // barn paint (same value band; roofs/awnings carry the contrast)
  red: '#b5483a', teal: '#5e8f8c', mustard: '#d9a441', sage: '#8fa27a', rose: '#c98b7e', cream: '#ead9b8', slate: '#7d8fa3', ochre: '#c98a4a', plum: '#8a5a6e',
  yellow: '#e8b84a', blue: '#5f86b0', green: '#6f9a5a', pink: '#d98aa8', orange: '#d9853a', lilac: '#9a83b8', pot: '#b86a44',
  // ownership camps (W3)
  you: '#3f8f8a', you2: '#2f6f6c', youTrim: '#c9a24a', youCream: '#f1e3c2',
  pom: '#6b3f86', pom2: '#4f2c66', pomTrim: { c: '#e2b33c', r: 0.3, m: 0.7 }, pomCream: '#efe0f0',
  dust: '#f3e2c4', star: { c: '#ffe45c', r: 0.4, g: 1 }, potion: { c: '#7dff6a', r: 0.2, g: 1.2 },
  flowers: ['#e8b84a', '#b5483a', '#f3e7cf', '#d9853a', '#9a83b8'],
  cobbles: ['#e2ae80', '#dca878', '#e6b486'],
  walls: ['#b5483a', '#5e8f8c', '#d9a441', '#8fa27a', '#c98b7e', '#ead9b8', '#7d8fa3', '#c98a4a', '#a8714a'],
  roofs: ['#8a8f93', '#7c6a5c', '#a86b4a', '#6e5a4e', '#9a8a7a'],
  awnings: ['#b5483a', '#5e8f8c', '#d9a441', '#8fa27a', '#7d8fa3'],
};

// Ownership skins applied per frontage (kit `western.skin(owner)`): trim, awning, sign board, door, banner, letters.
export const SKINS = {
  you: { key: 'you', trim: 'youTrim', board: 'you', board2: 'you2', awning: 'you', awningAlt: 'youCream', door: 'you2', letter: '#f3d68a', boardHex: '#2f6f6c', edgeHex: '#c9a24a', crest: false },
  pomfrey: { key: 'pomfrey', trim: 'pomTrim', board: 'pom', board2: 'pom2', awning: 'pom', awningAlt: 'pomTrim', door: 'pom2', letter: '#f2c64a', boardHex: '#4f2c66', edgeHex: '#e2b33c', crest: true },
  civic: { key: 'civic', trim: 'trim', board: 'cream', board2: 'wood2', awning: 'red', awningAlt: 'cream', door: 'door', letter: '#5a3a26', boardHex: '#ead9b8', edgeHex: '#7a5236', crest: false },
  none: { key: 'none', trim: 'trim', board: 'sign', board2: 'wood2', awning: 'tin', awningAlt: 'rust', door: 'door', letter: '#5a3a26', boardHex: '#d9c49a', edgeHex: '#7a5236', crest: false },
};

export const DISTRICT_PALETTES = {
  lower: {},
  saloonrow: {},
  bankblock: {},
  main: {},
};

// sun.azimuth: degrees from +x toward +z. The street runs along +x; the hero looks down it, so a sun at az ≈ 40
// sits ahead-right of the camera, lights the north (business) facades obliquely and throws long shadows toward the lens.
export const LIGHTS = {
  dawn: {
    sky: { top: '#a9a8dc', mid: '#f3c2b0', horizon: '#fcd8b8' },
    sun: { color: '#ffc7a0', intensity: 4.6, azimuth: 150, elevation: 20 },
    fill: { sky: '#b9b6e0', ground: '#d9a47a', intensity: 0.7 },
    rim: { color: '#ffc884', intensity: 1.0 },
    bounce: '#ffb47e', bounceK: 0.14,
    env: { ground: '#d8a886' }, night: 0, exposure: 1.18, sheen: '#ffc8a8', envK: 0.13, disc: { az: -12, el: 6 },
  },
  day: {
    sky: { top: '#7fa8d4', mid: '#e6d4bc', horizon: '#fad8b0' },
    sun: { color: '#ffe0b4', intensity: 5.2, azimuth: 46, elevation: 30 },
    fill: { sky: '#8aa8d8', ground: '#c89870', intensity: 0.5 },
    rim: { color: '#ffd8a0', intensity: 0.8 },
    bounce: '#ffa868', bounceK: 0.1,
    env: { ground: '#c8a07c' }, night: 0, exposure: 1.12, sheen: '#ffd0a0', envK: 0.12, disc: { az: -4, el: 9 },
  },
  golden: {
    sky: { top: '#6f80c8', mid: '#eea888', horizon: '#f8c48e' },
    sun: { color: '#ffbf78', intensity: 6.6, azimuth: 36, elevation: 23 },
    fill: { sky: '#8494e0', ground: '#b88262', intensity: 0.46 },
    rim: { color: '#ffb05a', intensity: 1.5 },
    bounce: '#ff9a48', bounceK: 0.08,
    env: { ground: '#b88058' }, night: 0, exposure: 1.2, sheen: '#ffb070', envK: 0.14, disc: { az: -8, el: 4.5 },
  },
  dusk: {
    sky: { top: '#5b4a96', mid: '#e88a78', horizon: '#ffb070' },
    sun: { color: '#ff8a40', intensity: 5.2, azimuth: 34, elevation: 9 },
    fill: { sky: '#6c64c0', ground: '#c8785e', intensity: 0.56 },
    rim: { color: '#ffa050', intensity: 1.4 },
    bounce: '#ff7a38', bounceK: 0.22,
    env: { ground: '#a0706a' }, night: 0.45, lamps: 0.55, exposure: 1.1, sheen: '#ff9858', envK: 0.14, disc: { az: -10, el: 2.5 },
  },
  // W18 night: deep blue sky with a warm dusty glow on the horizon, warm lantern pools; never a lilac wash.
  night: {
    sky: { top: '#0a1230', mid: '#1c2a58', horizon: '#4a4a68' },
    sun: { color: '#9fb6f0', intensity: 0.75, azimuth: 60, elevation: 38 },
    fill: { sky: '#3c5290', ground: '#2c2430', intensity: 0.24 },
    rim: { color: '#8fb0f0', intensity: 0.55 },
    bounce: '#ff9a50', bounceK: 0.05,
    env: { ground: '#241e2c' }, night: 1, lamps: 1.6, exposure: 1.34, sheen: '#7f98d8', envK: 0.08, disc: { az: -14, el: 4.2 },
  },
};

// Virtual hour (data/clock.js maps game time onto it) → palette keys. Golden hour owns the long afternoon (the money shot); night is violet, never black.
export const DAY_KEYS = [[0, 'night'], [5, 'night'], [6.5, 'dawn'], [8.5, 'dawn'], [10.5, 'day'], [13.5, 'day'], [15.5, 'golden'], [19, 'golden'], [20.2, 'dusk'], [21.2, 'night'], [24, 'night']];
