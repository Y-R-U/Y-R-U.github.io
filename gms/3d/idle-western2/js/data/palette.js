// Colours (sRGB hex) for every builder slot, per-district overrides, and the time-of-day light palettes.
// PLACEHOLDER western look (dust, weathered wood, red rock) until the art-direction lane replaces it.
export const PALETTE = {
  sky: '#f3c9a0', fog: '#f2d2a8',
  ground: '#d9b27c', grass: '#c9b06a', grass2: '#d4bd78', grassDark: '#a8925a', dirt: '#c99a66', sand: '#e9cf9e',
  road: '#c79a68', roadLine: '#e2c18e', kerb: '#9a6f48', pave: '#b88a5c', pave2: '#a77b4f', pad: '#d1a774', grout: '#8a6040',
  wall: '#c9a27a', wall2: '#b5835a', trim: '#efe0c4', white: '#f6ecda', roof: '#8a5a3a', roof2: '#6f4a33',
  wood: '#b07a4a', wood2: '#93633c', woodDark: '#6e4a2e', dark: '#3e2f28', iron: '#4a4040', stone: '#c8a888', stone2: '#b08d6c',
  brick: '#b5674a', brick2: '#9c573e', rock: '#c4704a', rock2: '#a85a3c',
  glass: '#7d9db5', window: { c: '#ffb45a', r: 0.3, g: -1 }, curtain: '#c9473a', door: '#7a4a2e',
  leaf: '#8aa05a', leaf2: '#a3b46a', leafDark: '#6f8648', pine: '#6a8a5a', trunk: '#7a5638', cactus: '#6f9a5a',
  water: '#7fb8c0', waterDeep: '#4f8e98', foam: '#f4fbfb',
  skin: '#e8b48a', metal: '#9aa4b0', chrome: '#d6dde4', lamp: { c: '#ffd08a', r: 0.3, g: -1 }, bulb: { c: '#fff1c4', r: 0.3, g: 1.2 },
  gold: { c: '#e8c25a', r: 0.3, m: 0.85 }, accent: '#c9473a', sign: '#f1d9a0', stock: '#d9a441', red: '#c9473a', yellow: '#e8b84a', blue: '#5f86b0', green: '#6f9a5a',
  pink: '#d98a8a', orange: '#d9853a', teal: '#5f9f98', lilac: '#9a83b8', cream: '#f4e6c8', pot: '#b86a44',
  flowers: ['#e8b84a', '#c9473a', '#f6ecda', '#d9853a', '#9a83b8'],
  cobbles: ['#c9a074', '#c29a6e', '#cfa77a', '#bf9469', '#c8a27a'],
  walls: ['#c9a27a', '#b5835a', '#d8b48a', '#a9785a', '#e0c49a', '#9c6b4a', '#c98f6a'],
  roofs: ['#8a5a3a', '#6f4a33', '#9c6b4a', '#7a5040', '#5f4a3a'],
};

export const DISTRICT_PALETTES = {
  main: {},
};

// sun.azimuth: degrees from +x toward +z (east = 0, south = 90). Hero cameras look north from the south.
export const LIGHTS = {
  dawn: {
    sky: { top: '#a9c4ee', mid: '#f3cfc0', horizon: '#fbe2cc' },
    sun: { color: '#ffdcae', intensity: 5.0, azimuth: 36, elevation: 31 },
    fill: { sky: '#8aa6ee', ground: '#f4c69e', intensity: 0.62 },
    rim: { color: '#ffc884', intensity: 1.0 },
    bounce: '#ffb47e', bounceK: 0.12,
    env: { ground: '#d8b496' }, night: 0, exposure: 1.2, sheen: '#ffd0a0', envK: 0.13,
  },
  day: {
    sky: { top: '#8fc0e6', mid: '#d6e2e4', horizon: '#f6d8b0' },
    sun: { color: '#ffe2bc', intensity: 4.6, azimuth: 40, elevation: 38 },
    fill: { sky: '#88a6ee', ground: '#f6d4ae', intensity: 0.62 },
    rim: { color: '#ffd29a', intensity: 0.7 },
    bounce: '#ffad70', bounceK: 0.13,
    env: { ground: '#d9c09c' }, night: 0, exposure: 1.22, sheen: '#ffc890', envK: 0.14,
  },
  dusk: {
    sky: { top: '#7a6cb8', mid: '#f29a88', horizon: '#ffbf80' },
    sun: { color: '#ff8a38', intensity: 6.2, azimuth: 150, elevation: 14 },
    fill: { sky: '#6c64c8', ground: '#e0845e', intensity: 0.46 },
    rim: { color: '#ffb050', intensity: 1.4 },
    bounce: '#ff7a38', bounceK: 0.24,
    env: { ground: '#a8706a' }, night: 0.4, lamps: 0.5, exposure: 1.05, sheen: '#ff9858', envK: 0.14,
  },
  night: {
    sky: { top: '#271f62', mid: '#47378a', horizon: '#7b5ba8' },
    sun: { color: '#9aa4ff', intensity: 0.85, azimuth: 40, elevation: 46 },
    fill: { sky: '#6460c0', ground: '#6e5468', intensity: 0.62 },
    rim: { color: '#9fb4ff', intensity: 0.8 },
    bounce: '#ff9a50', bounceK: 0.05,
    env: { ground: '#36304e' }, night: 1, lamps: 1.35, exposure: 1.24, sheen: '#9c8ee0', envK: 0.12,
  },
};

// Local hour → [palette, palette, t]. Never fully dark; warm dawn holds the morning.
export const DAY_KEYS = [[0, 'night'], [5.5, 'night'], [7, 'dawn'], [9.5, 'dawn'], [12, 'day'], [16.5, 'day'], [18.5, 'dusk'], [20.5, 'night'], [24, 'night']];
