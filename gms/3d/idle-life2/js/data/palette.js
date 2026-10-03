// Colours (sRGB hex) for every builder slot, per-district overrides, and the time-of-day light palettes.
// Target look = refs/ concept stills: soft warm toy diorama, pastel townhouses, pastel cobbles, sunrise light.
export const PALETTE = {
  sky: '#f6c9b4', fog: '#fbdcc0',
  ground: '#97c674', grass: '#97c674', grass2: '#acd385', grassDark: '#7fb466', dirt: '#c9a27a', sand: '#f0dbb2',
  road: '#9b93a6', roadLine: '#fbf3e4', kerb: '#ebe2d6', pave: '#e9ddd0', pave2: '#ded0c2', pad: '#e8dccb', grout: '#a3929e',
  wall: '#f4e3cf', wall2: '#f6c9b6', trim: '#fbf6ee', white: '#fbf8f2', roof: '#df8b77', roof2: '#7fb5a8',
  wood: '#dba36c', wood2: '#c48a55', woodDark: '#9a6842', dark: '#4b4453', iron: '#4f4a5c', stone: '#d8cbbd', stone2: '#c4b5a6',
  brick: '#d9907a', brick2: '#c97c68',
  glass: '#7d9db5', window: { c: '#ffb45a', r: 0.3, g: -1 }, curtain: '#f2d3a3', door: '#a8694a',
  leaf: '#86bd5e', leaf2: '#a3cf70', leafDark: '#6aa255', pine: '#5f9a6a', trunk: '#8a6248',
  water: '#7fd1c7', waterDeep: '#3e9ea6', foam: '#f4fbfb',
  skin: '#f2c6a0', metal: '#9aa4b0', chrome: '#d6dde4', lamp: { c: '#ffe0a0', r: 0.3, g: -1 }, bulb: { c: '#fff1c4', r: 0.3, g: 1.2 },
  gold: { c: '#e8c25a', r: 0.3, m: 0.85 }, accent: '#e8776a', sign: '#f3d36b', stock: '#f4e04d', red: '#e2655a', yellow: '#f6d35c', blue: '#78a6d8', green: '#7fbf7a',
  pink: '#f2a6bd', orange: '#f2a65a', teal: '#6fbfb2', lilac: '#b59ad8', cream: '#fbf1dc', pot: '#d9825c',
  flowers: ['#f28fa0', '#f6d35c', '#ffffff', '#c39be0', '#f2a65a'],
  cobbles: ['#eadbd0', '#e5d5cf', '#eee2d5', '#e3d6d6', '#e9dccb', '#e4d4cc', '#ecdfd3', '#e8dccf', '#dcd6e0', '#dde0d0'],
  walls: ['#f7c2a6', '#f6da9e', '#bfe0bd', '#bad3ec', '#e5c1e4', '#f8e0c4', '#f2b78e', '#cbe5d0', '#f5bfc4'],
  roofs: ['#e06d5a', '#55a898', '#7a82d6', '#e98f52', '#cc5b8a', '#5b90cf', '#9670c8', '#ec7d6c'],
};

export const DISTRICT_PALETTES = {
  oldtown: { pad: '#eadbcb', wall: '#f4dcc6', roof: '#d9786a' },
  suburbs: {
    pad: '#e6e2d4', wall: '#f7efe2', roof: '#7fa9d6', grass: '#a3c781',
    walls: ['#f8ebd8', '#d3e6f2', '#f7d9c6', '#d9ebcd', '#efd6ea', '#fbe8bf'],
    roofs: ['#6f9fd6', '#e47f68', '#6fb08e', '#b98fd6', '#e8a35a'],
  },
  harbour: {
    pad: '#e3d8c6', wall: '#eef2f2', roof: '#4f8fb5', stone: '#d3cabd',
    walls: ['#eef2f2', '#f6e7cf', '#d9e9ef', '#f3d9cf', '#e4ecdf'],
    roofs: ['#4f8fb5', '#d9786a', '#5aa39a', '#e2b45c'],
  },
  downtown: {
    pad: '#dcd8d8', wall: '#e9e4ea', roof: '#6c6f86', road: '#8f8a9e',
    walls: ['#e9e4ea', '#d6e2ec', '#f1e2d2', '#dfe6e0', '#ecd9de'],
    roofs: ['#6c6f86', '#4f8fb5', '#b98a7a'],
  },
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
    sky: { top: '#9fcbec', mid: '#cfe3ee', horizon: '#f7e4cf' },
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
