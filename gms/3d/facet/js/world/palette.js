// The scene palettes. A palette owns the light as well as the colours, because in this style
// they are the same decision — you do not light a dusk village with a midday sun and recolour it.
//
// Rules that hold across every palette below:
//   • shadows shift cool, lights shift warm; nothing is neutral grey
//   • one accent hue only, used on under 3% of the frame
//   • adjacent forms separate by value, not by hue
//   • no primary is ever used at full saturation
//   • `lit.intensity` is whether lanterns are burning; `lit.night` is how dark it is —
//     a low winter sun has lamps lit at midday, and those are not the same fact
//   • fog.color IS sky.haze — any mismatch puts a seam where the far edge fades out

export const PALETTE_IDS = ['meadow', 'autumn', 'dusk', 'frost'];

const P = {
  meadow: {
    id: 'meadow', label: 'Meadow',
    sky: { top: '#5fb6e4', horizon: '#d3ecf3', haze: '#bfe0ea' },
    sun: { color: '#fff4d6', intensity: 3.5, azimuth: 95, elevation: 42 },
    fill: { sky: '#5f8fd6', ground: '#8a9663', intensity: 0.86 },
    bounce: { color: '#9fc6f0', intensity: 1.05 },
    fog: { color: '#bfe0ea', density: 0.0042 },
    shadow: '#4a6a86',
    ground: {
      grass: ['#79a94e', '#9ac763', '#557f3a'],
      grassDry: ['#a8b45c', '#c3ca77', '#7d8a41'],
      dirt: ['#a07a52', '#bb9469', '#7a5b3c'],
      rock: ['#8c8e93', '#a8aaae', '#63666c'],
      sand: ['#dcc79a', '#eddcb4', '#b8a377'],
      path: ['#c2a87c', '#d8c096', '#9a835c'],
    },
    flora: {
      trunk: ['#6d5039', '#84654a', '#4e3927'],
      canopy: ['#6aa844', '#8ec455', '#41722f'],
      canopyAlt: ['#5f9d5a', '#82bd74', '#3a6b3c'],
      needle: ['#3f7a4e', '#579361', '#265037'],
      bush: ['#639b45', '#85b85e', '#41682f'],
      reed: ['#8fae54', '#adc46f', '#63813c'],
      bloom: ['#f0d75e', '#e88bb0', '#ffffff', '#c9a2e8'],
    },
    build: {
      wall: ['#ece1c9', '#f6efdd', '#cfc0a1'],
      wallAlt: ['#d8c3a0', '#e6d5b6', '#b39f7e'],
      stone: ['#a9a49a', '#c0bbb0', '#827d74'],
      wood: ['#8b6243', '#a67c58', '#654530'],
      woodDark: ['#5d4130', '#75563f', '#402c20'],
      roof: ['#c1654a', '#dd8163', '#93472f'],
      roofAlt: ['#7d8f8c', '#9aaaa6', '#5b6a68'],
      thatch: ['#d0a45c', '#e6bf7c', '#a67d3f'],
      trim: ['#5e4433', '#7a5a44', '#412e22'],
      metal: ['#6f747a', '#909699', '#4b5055'],
    },
    water: { shallow: '#78c9c4', deep: '#2c7f96', foam: '#eaf7f8', spec: '#cfeef2' },
    lit: { warm: '#ffcf7d', cool: '#9fd8ff', intensity: 0.0, night: 0 },
    accent: '#e2564a',
  },

  autumn: {
    id: 'autumn', label: 'Autumn',
    sky: { top: '#8db8cf', horizon: '#f0dcbb', haze: '#e2cfae' },
    sun: { color: '#ffd9a0', intensity: 3.75, azimuth: 108, elevation: 24 },
    fill: { sky: '#6d86c4', ground: '#9a7c48', intensity: 0.80 },
    bounce: { color: '#8fb6d6', intensity: 1.15 },
    fog: { color: '#e2cfae', density: 0.0068 },
    shadow: '#5a5578',
    ground: {
      grass: ['#8d9a48', '#aab562', '#67733a'],
      grassDry: ['#bfa96a', '#d6c489', '#8f7c4a'],
      dirt: ['#96704a', '#b28a5f', '#6d5034'],
      rock: ['#8b8479', '#a49d90', '#615c54'],
      sand: ['#d6bb8a', '#e8d2a6', '#ad956b'],
      path: ['#b4926a', '#cbaa83', '#8a6e4e'],
    },
    flora: {
      trunk: ['#6a4b34', '#82603f', '#472f20'],
      canopy: ['#d98b34', '#f0b054', '#a35d1f'],
      canopyAlt: ['#c05a34', '#dd7c4e', '#8c3a1e'],
      needle: ['#4c6b45', '#66855a', '#2d4530'],
      bush: ['#a8813a', '#c39d51', '#7a5c26'],
      reed: ['#bda65c', '#d4bf7a', '#8e7a3f'],
      bloom: ['#f2c14e', '#e07a4a', '#f6e6c8', '#b8646f'],
    },
    build: {
      wall: ['#e4d3b3', '#f2e4c9', '#c2ad8b'],
      wallAlt: ['#cbae86', '#dcc39d', '#a48a67'],
      stone: ['#a09789', '#b8afa0', '#787166'],
      wood: ['#8a5c3c', '#a5754f', '#5f3e28'],
      woodDark: ['#553726', '#6d4b35', '#3a2418'],
      roof: ['#a8503a', '#c46a4d', '#7c3625'],
      roofAlt: ['#6f7d76', '#8b9890', '#4f5a55'],
      thatch: ['#c99a52', '#e0b672', '#9c7236'],
      trim: ['#563a28', '#704e37', '#3a2618'],
      metal: ['#6a6a6e', '#8b8b8e', '#47474b'],
    },
    water: { shallow: '#7fb8a8', deep: '#33707a', foam: '#ecf5ee', spec: '#dcecdf' },
    lit: { warm: '#ffbf6a', cool: '#a8c4e0', intensity: 0.35, night: 0 },
    accent: '#4a7fb5',
  },

  dusk: {
    id: 'dusk', label: 'Dusk',
    sky: { top: '#26305e', horizon: '#f09a63', haze: '#8a6a86' },
    sun: { color: '#ff9d5c', intensity: 3.0, azimuth: 262, elevation: 9 },
    fill: { sky: '#4358b0', ground: '#4e4268', intensity: 0.98 },
    bounce: { color: '#7d9bff', intensity: 1.25 },
    fog: { color: '#8a6a86', density: 0.0095 },
    shadow: '#2c2f52',
    ground: {
      grass: ['#4d6446', '#647a55', '#354a34'],
      grassDry: ['#6b6a46', '#847f58', '#4b4c33'],
      dirt: ['#6a5340', '#83694f', '#4b3a2c'],
      rock: ['#5e5f68', '#767782', '#42434c'],
      sand: ['#9a8a6e', '#b3a184', '#736753'],
      path: ['#7d6a52', '#968265', '#5b4c3a'],
    },
    flora: {
      trunk: ['#463526', '#5b452f', '#2e2119'],
      canopy: ['#3f6340', '#587c52', '#26402a'],
      canopyAlt: ['#4a5c62', '#63757a', '#2c3a40'],
      needle: ['#2c4a38', '#3f6049', '#182b20'],
      bush: ['#3e5a38', '#557047', '#253725'],
      reed: ['#5e6b42', '#788254', '#3f4a2e'],
      bloom: ['#e8c060', '#d0708a', '#e6e0ee', '#9a86d0'],
    },
    build: {
      wall: ['#b0a189', '#c8b89c', '#877965'],
      wallAlt: ['#98846a', '#ae9a7e', '#6f5f4a'],
      stone: ['#6f6b66', '#87837c', '#4e4b47'],
      wood: ['#61432e', '#7a5940', '#412c1e'],
      woodDark: ['#3d2a1d', '#523a29', '#261a11'],
      roof: ['#7e4234', '#9a5844', '#582a20'],
      roofAlt: ['#4d565a', '#646e70', '#343c40'],
      thatch: ['#96703f', '#b08a55', '#6d5029'],
      trim: ['#3c2a1e', '#523c2c', '#281a12'],
      metal: ['#4e5257', '#6a6e73', '#33363a'],
    },
    water: { shallow: '#4a7f8e', deep: '#1e4356', foam: '#c2d8de', spec: '#ffb277' },
    lit: { warm: '#ffb257', cool: '#8fb4ff', intensity: 1.0, night: 1 },
    accent: '#ffd06a',
  },

  frost: {
    id: 'frost', label: 'Frost',
    sky: { top: '#8fb4cf', horizon: '#e8eef2', haze: '#d5e2ea' },
    sun: { color: '#fff0dc', intensity: 3.3, azimuth: 155, elevation: 19 },
    fill: { sky: '#6d8ec8', ground: '#8a94a0', intensity: 0.62 },
    bounce: { color: '#ffd9a8', intensity: 0.95 },
    fog: { color: '#d5e2ea', density: 0.011 },
    shadow: '#5b7796',
    ground: {
      grass: ['#6f8a86', '#8ea6a0', '#4c625f'],
      grassDry: ['#8b8f7e', '#a6aa96', '#666a5c'],
      dirt: ['#77706a', '#8f8880', '#4f4842'],
      rock: ['#78828c', '#98a2ac', '#4e5760'],
      sand: ['#c0c4c4', '#d8dcdc', '#94989a'],
      path: ['#9ca09e', '#b4b8b6', '#787c7a'],
    },
    flora: {
      trunk: ['#5e5148', '#75665b', '#3f342d'],
      canopy: ['#4f7a68', '#6b9682', '#33564a'],
      canopyAlt: ['#7d8f92', '#98a8aa', '#5a696c'],
      needle: ['#3a5f52', '#537a6a', '#213b33'],
      bush: ['#5c7a6c', '#7a9686', '#3d5449'],
      reed: ['#9aa286', '#b4b9a0', '#737a62'],
      bloom: ['#ffffff', '#cfe0ee', '#e6d0e0', '#f2e8c8'],
    },
    build: {
      wall: ['#e6e6e2', '#f4f4f2', '#c4c4c0'],
      wallAlt: ['#c8c8c4', '#dcdcd8', '#a2a29e'],
      stone: ['#93969a', '#adb0b4', '#6b6e72'],
      wood: ['#7a6350', '#957c66', '#544436'],
      woodDark: ['#4e3f33', '#665445', '#332920'],
      roof: ['#7e8a92', '#98a4ab', '#5b656c'],
      roofAlt: ['#8f6f66', '#a8877c', '#6a5049'],
      thatch: ['#b8a884', '#d0c2a0', '#8d8062'],
      trim: ['#4e4238', '#665a4e', '#342c24'],
      metal: ['#787d82', '#969b9f', '#535a5f'],
    },
    water: { shallow: '#8fb8c4', deep: '#3f6b80', foam: '#f2fafc', spec: '#e6f4fa' },
    lit: { warm: '#ffd08a', cool: '#a8cbe8', intensity: 0.5, night: 0.12 },
    accent: '#d4574f',
  },
};

// Grey is what you get when nobody chose a colour, and it is the untextured-prototype look. A
// blind critic measured a third of the close-up frame's midtones below 12% saturation, all of it
// in the built palette — the terrain already floors its own. Applied once at module load.
const MIN_SAT = 0.22;

function lift(hex) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx === mn) return hex;
  const l = (mx + mn) / 2;
  const sat = l > 0.5 ? (mx - mn) / (2 - mx - mn) : (mx - mn) / (mx + mn);
  if (sat >= MIN_SAT) return hex;
  const k = MIN_SAT / Math.max(sat, 1e-4), m = (r + g + b) / 3;
  const ch = v => Math.round(Math.min(1, Math.max(0, m + (v - m) * k)) * 255);
  return '#' + ((ch(r) << 16) | (ch(g) << 8) | ch(b)).toString(16).padStart(6, '0');
}

for (const pal of Object.values(P)) {
  for (const group of ['build', 'ground', 'flora']) {
    for (const [k, v] of Object.entries(pal[group] || {})) {
      if (Array.isArray(v)) pal[group][k] = v.map(c => (typeof c === 'string' && c[0] === '#' ? lift(c) : c));
    }
  }
}

export function palette(id) { return P[id] || P.meadow; }
export const PALETTES = P;

// Convenience for art code: `p.pick(p.ground.grass, 1)` reads better than remembering the
// [mid, light, dark] order, which every triple in this file uses.
export const MID = 0, LIGHT = 1, DARK = 2;
