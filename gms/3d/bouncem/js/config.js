// ─── Config: constants, colors, upgrade definitions, save/load ───

export const BALL_COLORS = {
  2:    0xff4444, // red
  4:    0xff8800, // orange
  8:    0xffcc00, // yellow
  16:   0x00cccc, // cyan
  32:   0x3366ff, // blue
  64:   0x9933ff, // purple
  128:  0xff7766, // coral
  256:  0x22cc44, // green
  512:  0x3399ff, // dodgerblue
  1024: 0xff66aa, // pink
  2048: 0xffd700, // gold
};

export function getBallColor(value) {
  if (BALL_COLORS[value]) return BALL_COLORS[value];
  // Cycle hues for values above 2048
  const hue = ((Math.log2(value) * 47) % 360) / 360;
  const r = Math.round(255 * hueToChannel(hue, 0));
  const g = Math.round(255 * hueToChannel(hue, 1 / 3));
  const b = Math.round(255 * hueToChannel(hue, 2 / 3));
  return (r << 16) | (g << 8) | b;
}

function hueToChannel(h, offset) {
  const k = ((h + offset) * 6) % 6;
  return Math.max(0, Math.min(1, Math.min(k, 4 - k)));
}

// ─── Play area dimensions (Three.js units) ───
export const ARENA = {
  width: 10,
  depth: 6,
  height: 14,
  floorAngle: 0.12,          // radians — steeper slope right for faster ball return
  pipeY: 6.0,                // pipe vertical position
  dangerY: 5.5,              // game-over line
  suctionX: 5.2,             // right edge suction tube
  spawnY: -5.5,              // bottom row block spawn Y
  blockRowSpacing: 1.8,
  ballRadius: 0.35,
  blockMinSize: 0.6,
  blockMaxSize: 1.0,
};

// ─── Number formatting (compact: ###.#K/M/B/T) ───
export function formatNumber(n) {
  n = Math.abs(n);
  if (n < 1000) return String(Math.floor(n));
  const suffixes = ['', 'K', 'M', 'B', 'T'];
  let tier = 0;
  let val = n;
  while (val >= 1000 && tier < suffixes.length - 1) {
    val /= 1000;
    tier++;
  }
  if (val >= 100) return `${Math.floor(val)}${suffixes[tier]}`;
  return `${(Math.floor(val * 10) / 10).toFixed(1)}${suffixes[tier]}`;
}

// ─── Upgrade definitions ───
// Costs start cheap but scale ~3x per level
export const UPGRADES = [
  {
    id: 'ballPower',
    name: 'Ball Power',
    desc: 'Starting ball value',
    maxLevel: 10,
    costs:  [0, 10, 40, 150, 500, 2000, 8000, 32000, 130000, 520000],
    values: [2,  4,  8,  16,  32,   64,  128,   256,    512,   1024],
    effectLabel: v => `${v}`,
  },
  {
    id: 'ballCount',
    name: 'Ball Count',
    desc: 'Start with more balls',
    maxLevel: 10,
    costs:  [0, 15, 60, 250, 1000, 4000, 16000, 65000, 260000, 1000000],
    values: [5,  7,  9,  12,   15,   18,    22,    26,     31,      37],
    effectLabel: v => `${v} balls`,
  },
  {
    id: 'velocity',
    name: 'Velocity',
    desc: 'Balls move faster',
    maxLevel: 10,
    costs:  [0, 10, 40, 150, 600, 2400,  9600, 38000, 155000, 620000],
    values: [0, 12, 25,  40,  60,   80,   105,   135,    170,    210],
    effectLabel: v => `+${v}%`,
  },
  {
    id: 'criticalHit',
    name: 'Critical Hit',
    desc: 'Chance for 2x block damage',
    maxLevel: 10,
    costs:  [0, 12, 50, 200, 800, 3200, 13000, 52000, 210000, 840000],
    values: [0,  8, 16,  25,  35,   46,    57,    68,     78,     90],
    effectLabel: v => `${v}%`,
  },
  {
    id: 'mergeLuck',
    name: 'Merge Luck',
    desc: 'Chance to merge one tier higher',
    maxLevel: 10,
    costs:  [0, 15, 60, 300, 1200, 4800, 19000, 77000, 310000, 1250000],
    values: [0, 10, 20,  32,   44,   55,    65,    74,     82,      90],
    effectLabel: v => `${v}%`,
  },
  {
    id: 'magnet',
    name: 'Magnet',
    desc: 'Same-value balls attract each other',
    maxLevel: 10,
    costs:  [0, 15, 60, 280, 1200, 4800, 19000, 77000, 310000, 1250000],
    values: [0,  1,  2,   3,    4,    5,     6,     7,      8,       9],
    effectLabel: v => ['Off','Weak','Med','Strong','Epic','Master','Legend','Mythic','Ancient','Cosmic'][v],
  },
  {
    id: 'scoreBonus',
    name: 'Score Bonus',
    desc: 'Earn more score/crystals',
    maxLevel: 10,
    costs:  [0, 10, 40, 160, 650, 2600, 10400, 42000, 168000, 670000],
    values: [1.0, 1.2, 1.5, 1.8, 2.2, 2.8, 3.5, 4.5, 6.0, 8.0],
    effectLabel: v => `x${v}`,
  },
  {
    id: 'sturdyBlocks',
    name: 'Sturdy Blocks',
    desc: 'Blocks start with less HP',
    maxLevel: 10,
    costs:  [0, 12, 50, 220, 900, 3600, 14400, 57000, 230000, 920000],
    values: [0, 10, 20,  30,  38,   46,    54,    61,     67,     73],
    effectLabel: v => `${v}% less HP`,
  },
];

// ─── Save / Load ───
const SAVE_KEY = 'bouncemerge3d_save';

const defaultSave = () => ({
  crystals: 0,
  upgradeLevels: {},  // id -> level (0-based)
  bestScore: 0,
  bestWave: 0,
  musicOn: true,
  sfxOn: true,
});

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      return { ...defaultSave(), ...data };
    }
  } catch (e) { /* ignore */ }
  return defaultSave();
}

export function writeSave(data) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) { /* ignore */ }
}

export function getUpgradeLevel(save, id) {
  return save.upgradeLevels[id] || 0;
}

export function getUpgradeValue(save, id) {
  const def = UPGRADES.find(u => u.id === id);
  if (!def) return 0;
  const lvl = getUpgradeLevel(save, id);
  return def.values[lvl];
}
