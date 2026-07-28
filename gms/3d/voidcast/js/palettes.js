// palettes.js — one visual identity per act (plus a few event-only skins).

/**
 * ground/road    surface colours
 * mats           the prop palette: builders pick from these by index band
 *                [0..2] = structure body, [3..4] = trim, [5] = glass/energy, [6] = dark
 * sky            top/bottom of the backdrop gradient
 */
export const THEMES = {
  scrap: {
    name: 'Scrapyard Moons',
    ground: 0x7a6249, groundAlt: 0x66513d, road: 0x473a2f,
    sky: [0x1b2530, 0x6d4a33], fog: 0x3b3128, star: 0.55,
    sun: 0xffd9a0, sunDir: [0.5, 0.85, 0.25], amb: 0x4a5560, ambI: 0.65,
    accent: 0xffa23a,
    mats: [0x8d7358, 0xa08163, 0x6d5843, 0xc4763a, 0xd9a441, 0x64d6e0, 0x2a231c],
    flora: [0x6f7a4a, 0x87904f],
  },
  colony: {
    name: 'The Colony Belt',
    ground: 0x69814f, groundAlt: 0x7a8f59, road: 0x9a9585,
    sky: [0x2c3b63, 0xc09ad0], fog: 0x8a89a8, star: 0.25,
    sun: 0xfff1d2, sunDir: [-0.35, 0.9, 0.3], amb: 0x8fa0c8, ambI: 0.85,
    accent: 0x7ce0b0,
    mats: [0xe8e3d6, 0xd7cfbe, 0xbdb4a2, 0x6fa8d8, 0xe08a6a, 0x9df0d8, 0x3a3a44],
    flora: [0x4f8a45, 0x63a054],
  },
  hive: {
    name: 'Hive Cities',
    ground: 0x2f3550, groundAlt: 0x3a4162, road: 0x1d2136,
    sky: [0x070a18, 0x243268], fog: 0x1c2340, star: 0.95,
    sun: 0xbcd2ff, sunDir: [0.3, 0.8, -0.4], amb: 0x4c68b0, ambI: 0.95,
    accent: 0x39e6ff,
    mats: [0x515a80, 0x3d4470, 0x626c96, 0x00d5ff, 0xff3ea5, 0x7ef7ff, 0x1b1f33],
    flora: [0x2e6b62, 0x357a58],
  },
  sanctum: {
    name: 'The Sanctum',
    ground: 0x3f6f5a, groundAlt: 0x4c7f63, road: 0xb9a7d6,
    sky: [0x123c4e, 0xf0a6c8], fog: 0x6ba8a4, star: 0.15,
    sun: 0xfff0f6, sunDir: [-0.4, 0.85, -0.25], amb: 0xa8d8d0, ambI: 0.95,
    accent: 0xff86d4,
    mats: [0xdff0e6, 0xb8e0d2, 0x8fd0c0, 0xd66fc0, 0xffd166, 0xc9a6ff, 0x2d4a44],
    flora: [0x2f8f6a, 0x46ad7c],
  },
  verge: {
    name: 'The Core Verge',
    ground: 0x24242e, groundAlt: 0x2d2d39, road: 0x131319,
    sky: [0x000004, 0x2a1f38], fog: 0x0f0f16, star: 1.0,
    sun: 0xffd98a, sunDir: [0.15, 0.95, 0.2], amb: 0x6f5a86, ambI: 0.8,
    accent: 0xffc94d,
    mats: [0x3f3f50, 0x4e4e63, 0x2c2c39, 0xffc94d, 0xff7a3d, 0xfff0b0, 0x101016],
    flora: [0x4a4258, 0x574d66],
  },
  // ── event-only skins ──
  frost: {
    name: 'Glacier Moon',
    ground: 0xcfe4f2, groundAlt: 0xbdd6e8, road: 0x9ab6cc,
    sky: [0x0c2438, 0x9fd6f0], fog: 0xbcd8ea, star: 0.4,
    sun: 0xeaf7ff, sunDir: [0.4, 0.8, 0.35], amb: 0xbcd8f0, ambI: 1.0,
    accent: 0x6fe8ff,
    mats: [0xe8f4ff, 0xc6dcee, 0xa4c2d8, 0x59b8e8, 0xffffff, 0x9ff0ff, 0x2a3d4d],
    flora: [0x63a0a8, 0x76b6b0],
  },
  ember: {
    name: 'Cinder World',
    ground: 0x3a2320, groundAlt: 0x4a2b25, road: 0x241614,
    sky: [0x1a0505, 0x8c2a12], fog: 0x40170f, star: 0.3,
    sun: 0xff9a4a, sunDir: [-0.3, 0.7, 0.4], amb: 0x8c3a20, ambI: 0.7,
    accent: 0xff6a2a,
    mats: [0x54332c, 0x6b4038, 0x3d2620, 0xff6a2a, 0xffb03a, 0xffe08a, 0x140a08],
    flora: [0x6b4a22, 0x7d5a28],
  },
  neon: {
    name: 'The Loud Quarter',
    ground: 0x120a26, groundAlt: 0x190e33, road: 0x080415,
    sky: [0x05000f, 0x3d0a5c], fog: 0x100722, star: 0.8,
    sun: 0xd0a0ff, sunDir: [0.2, 0.9, -0.3], amb: 0x6a2a9c, ambI: 0.7,
    accent: 0xff2fd0,
    mats: [0x2a1350, 0x3a1a6a, 0x1d0d38, 0xff2fd0, 0x2fffd0, 0xfff45a, 0x0a0418],
    flora: [0x7a2fa0, 0x9a3fc0],
  },
};

export const ACT_THEME = ['scrap', 'colony', 'hive', 'sanctum', 'verge'];

export function theme(key) { return THEMES[key] || THEMES.scrap; }

/** Accretion-disc colour schemes for the hole itself — unlockable cosmetics. */
export const SKINS = [
  { id: 'default', name: 'Standard Issue', a: 0xff7a2a, b: 0xffe08a, cost: 0 },
  { id: 'ion', name: 'Ion Blue', a: 0x2fa8ff, b: 0xc8f0ff, cost: 400 },
  { id: 'bloom', name: 'Bloomcast Pink', a: 0xff2fa8, b: 0xffd0ee, cost: 800 },
  { id: 'venom', name: 'Venom Green', a: 0x4aff8a, b: 0xe0ffd0, cost: 800 },
  { id: 'violet', name: 'Ultraviolet', a: 0x8a4aff, b: 0xe0d0ff, cost: 1400 },
  { id: 'gold', name: 'Guild Gold', a: 0xffc94d, b: 0xfff6d0, cost: 2400, note: 'Finish the story' },
  { id: 'void', name: 'True Void', a: 0x2a2a3a, b: 0x8090b0, cost: 3200, note: 'Rank under 1,000,000' },
  { id: 'frost', name: 'Glacier', a: 0x6fe8ff, b: 0xffffff, cost: 0, note: 'Glacier Rush event' },
  { id: 'ember', name: 'Cinder', a: 0xff5a1a, b: 0xffd08a, cost: 0, note: 'Cinder Run event' },
];

export function skin(id) { return SKINS.find((s) => s.id === id) || SKINS[0]; }
