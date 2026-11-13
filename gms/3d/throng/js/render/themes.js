// City themes: the same map layout dressed differently. Everything here is renderer-only.
// Colours are sRGB hex unless noted; light colours are linear multipliers fed straight to the shaders.

export const THEME_IDS = ['evening', 'night-neon', 'snow', 'sunny-day', 'festival'];
export const WEATHER_IDS = ['clear', 'rain', 'fog', 'wind', 'snow'];

const EVENING = {
  id: 'evening',
  sun: [-0.62, 0.52, 0.58], sunCol: [1.0, 0.66, 0.38, 1.65], sky: [0.26, 0.30, 0.52], ground: [0.22, 0.15, 0.14],
  rim: [1.0, 0.62, 0.32, 0.55], rimDark: 0.12, lamp: [1.0, 0.62, 0.28, 1.5], fog: 0x6e5562, reflSky: 0x6e5562, skyRefl: [0.55, 0.42, 0.45], outer: 0x3a3638,
  exposure: 1.0, fogNear: 1.15, fogFar: 2.8,
  halo: [1.0, 0.48, 0.16, 0.6], winK: 1, litK: 1, lit: null, glass: 0x1a2236,
  wet: 1, snow: 0, reflect: true, lampsOn: true,
  // ground paint
  g: { base: '#343238', outerSt: '#6a645e', asphalt: '#44464f', lane: 'rgba(232,190,90,0.75)', edge: 'rgba(230,226,215,0.35)', zebra: 'rgba(236,232,222,0.85)',
    central: '#8d8273', centralLine: '#8f816c', ringA: '#9b8f7c', ringB: '#7a6f60', spoke: 'rgba(120,106,88,0.7)', star: 'rgba(163,150,127,0.45)',
    walk: '#736c66', lawn: '#4c6a30', path: '#a3967f', plaza: '#887d6d', plazaLine: '#8a7d68', pRingA: '#988c79', pRingB: '#776c5d', dot: '#9d9080', yard: '#2b2826' },
  facades: null, roofs: null, awnings: null, signs: null,
  neutrals: null, decor: {},
  weather: 'clear',
};

function theme(over) {
  const t = { ...EVENING, ...over };
  t.g = { ...EVENING.g, ...(over.g || {}) };
  return t;
}

export const THEMES = {
  evening: EVENING,
  'night-neon': theme({
    id: 'night-neon',
    sun: [0.35, 0.78, -0.52], sunCol: [0.45, 0.55, 1.0, 0.5], sky: [0.07, 0.09, 0.24], ground: [0.05, 0.035, 0.09],
    rim: [0.45, 0.75, 1.0, 0.75], lamp: [0.35, 0.7, 1.0, 0.95], fog: 0x0b1030, reflSky: 0x101640, skyRefl: [0.12, 0.14, 0.38], outer: 0x0c0e1a,
    exposure: 1.08, fogNear: 1.2, fogFar: 3.0,
    halo: [0.55, 0.75, 1.0, 0.55], winK: 1.25, litK: 1.35,
    lit: [0xffc77a, 0xffb05a, 0x9fe8ff, 0xff8ad8, 0xfff0d0, 0x8ab4ff], glass: 0x0e1426,
    wet: 1.6, snow: 0,
    g: { base: '#0b0d18', outerSt: '#1c1e34', asphalt: '#141828', lane: 'rgba(120,220,255,0.55)', edge: 'rgba(170,180,230,0.25)', zebra: 'rgba(200,210,240,0.6)',
      central: '#3a3a4a', centralLine: '#4a4a5e', ringA: '#4a4a60', ringB: '#2e2e3e', spoke: 'rgba(110,110,150,0.6)', star: 'rgba(150,120,220,0.35)',
      walk: '#2d3040', lawn: '#1f3326', path: '#454a5e', plaza: '#363848', plazaLine: '#46485c', pRingA: '#45475c', pRingB: '#2c2e3c', dot: '#55587a', yard: '#14151e' },
    facades: [0x8a86a8, 0x726e90, 0x8a6280, 0x887a72, 0x56648e, 0x5e7476, 0x846a88, 0x9094b4],
    roofs: { mansard: [0x1e2436, 0x262c42, 0x2a2630, 0x1c2640, 0x2a2a34], dome: [0x2a3f7a, 0x2a6a68, 0x4a3a8a], pitched: [0x4a2a36, 0x3e2632, 0x52303a, 0x40283a, 0x4c2c3a], flat: [0x2c2a34, 0x302c38] },
    signs: [0xff2fb0, 0x19e6ff, 0xb44dff, 0x2bff8a, 0xff7a1a, 0xff3a5a],
    neutrals: [0xe8ecf4, 0xc9d0dc, 0xaab3c2, 0xdfe3ea, 0x9aa3b2, 0xffffff, 0xc2c8d6, 0x8a93a6],
    decor: { neon: true },
  }),
  snow: theme({
    id: 'snow',
    sun: [0.55, 0.36, 0.75], sunCol: [1.0, 0.74, 0.62, 1.15], sky: [0.40, 0.46, 0.66], ground: [0.30, 0.28, 0.33],
    rim: [0.85, 0.8, 1.0, 0.3], rimDark: 0.25, lamp: [1.0, 0.66, 0.36, 1.35], fog: 0x8d93ad, reflSky: 0x9aa0bb, skyRefl: [0.55, 0.58, 0.72], outer: 0x8c8e9c,
    exposure: 0.95, fogNear: 1.1, fogFar: 2.7,
    halo: [1.0, 0.6, 0.28, 0.55], winK: 1.1, litK: 1.3, wet: 0.45, snow: 1, bloomT: 2.4, bloomS: 0.45,
    g: { base: '#9a9cab', outerSt: '#c4c6d2', asphalt: '#6e6d73', lane: 'rgba(240,210,120,0.25)', edge: 'rgba(240,240,245,0.18)', zebra: 'rgba(235,235,240,0.35)',
      central: '#dfe2ea', centralLine: '#c9ccd8', ringA: '#e8ebf2', ringB: '#c7cad6', spoke: 'rgba(170,175,195,0.5)', star: 'rgba(250,250,255,0.35)',
      walk: '#d6d9e2', lawn: '#e9ecf3', path: '#c2c5d1', plaza: '#dadde6', plazaLine: '#c5c8d4', pRingA: '#e6e9f0', pRingB: '#c3c6d2', dot: '#f2f4f8', yard: '#b8bbc8' },
    facades: [0xe6dccb, 0xd2b893, 0xb8735a, 0xd4a464, 0x8b9cb0, 0x9aaa8c, 0xc99a8c, 0xddd0b4],
    neutrals: [0x3a3f4c, 0x5a4636, 0x2c3140, 0x6a3a3a, 0x4a5060, 0x2a2a30, 0x5c5248, 0x404858],
    decor: { lights: true },
    weather: 'snow',
  }),
  'sunny-day': theme({
    id: 'sunny-day',
    sun: [-0.58, 0.6, 0.55], sunCol: [1.0, 0.92, 0.78, 2.45], sky: [0.2, 0.32, 0.58], ground: [0.2, 0.15, 0.1],
    rim: [1.0, 0.95, 0.85, 0.12], rimDark: 0.5, lamp: [1.0, 0.8, 0.5, 0.0], fog: 0xa9c6e2, reflSky: 0x9cbfe2, skyRefl: [0.5, 0.62, 0.8], outer: 0x8f8a82,
    exposure: 1.0, fogNear: 1.3, fogFar: 3.4,
    halo: [1.0, 0.8, 0.5, 0.0], winK: 0.0, litK: 0.0, glass: 0x2a3e5a,
    wet: 0, snow: 0, reflect: false, lampsOn: false, bloomT: 3.2, bloomS: 0.35,
    g: { base: '#7a7468', outerSt: '#a59a88', asphalt: '#6e665c', lane: 'rgba(250,250,245,0.7)', edge: 'rgba(250,250,245,0.45)', zebra: 'rgba(250,250,248,0.9)',
      central: '#c4ad8a', centralLine: '#b39a76', ringA: '#d2bd9a', ringB: '#a88f6c', spoke: 'rgba(150,120,90,0.6)', star: 'rgba(230,214,186,0.55)',
      walk: '#b5a68c', lawn: '#6d8f3a', path: '#d6c3a0', plaza: '#c1aa86', plazaLine: '#b09672', pRingA: '#cdb894', pRingB: '#a68e6a', dot: '#e0cfae', yard: '#8a7c66' },
    facades: [0xf4efe4, 0xefdcb8, 0xd98a5e, 0xe8b868, 0x9cc0d8, 0xb9c99a, 0xeab8a6, 0xf6ead0],
    roofs: { mansard: [0x5e6d84, 0x6a7890, 0x6e6462, 0x58688a, 0x7a706a], dome: [0x2f66b8, 0x3f9a8a, 0xf0ece0], pitched: [0xc8603c, 0xb45232, 0xd8784a, 0xae5e3e, 0xcc6a44], flat: [0xc8b8a0, 0xd0bc9c] },
    awnings: [0xd23c32, 0x2f8a5a, 0x2a5cb0, 0xf0b830, 0x2a9ab8, 0xe8642a],
    neutrals: [0xf6f5f0, 0x9aa3ae, 0xc8ccd2, 0x7f8790, 0xb0b6be, 0xffffff, 0x6e7680, 0xd8dade],
    decor: { flowers: true, market: true },
  }),
  festival: theme({
    id: 'festival',
    sun: [-0.62, 0.48, 0.58], sunCol: [1.0, 0.6, 0.36, 1.5], sky: [0.24, 0.24, 0.5], ground: [0.24, 0.14, 0.16],
    rim: [1.0, 0.55, 0.5, 0.65], lamp: [1.0, 0.55, 0.32, 1.7], fog: 0x6a3a6a, reflSky: 0x6a3a70, skyRefl: [0.55, 0.3, 0.5], outer: 0x3a2638,
    facades: [0xf2dcc0, 0xf0c27a, 0xe0745a, 0xf2a85a, 0x8fb4e0, 0x9cd08a, 0xf09ab4, 0xf6e2b0],
    roofs: { mansard: [0x4a5a8a, 0x5a4a8a, 0x6a4a5a, 0x3a6a8a, 0x6a5a7a], dome: [0xd04a5a, 0x3aa08a, 0xe0a030], pitched: [0xc8442c, 0xb83a30, 0xd8603a, 0xa84a3a, 0xd05a3a], flat: [0xa08a7a, 0xa8907a] },
    g: { central: '#9a7f78', ringA: '#a8908a', ringB: '#7e6660', star: 'rgba(255,190,140,0.5)', plaza: '#8e7872' },
    halo: [1.0, 0.5, 0.2, 0.65], litK: 1.25, wet: 0.8,
    decor: { lights: true, bunting: true, lanterns: true },
    weather: 'clear', fireworks: true, confetti: true,
  }),
};

export function getTheme(id) { return THEMES[id] || EVENING; }
