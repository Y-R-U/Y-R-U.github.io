// Random tank names, AI personalities, and color palette.

export const TANK_NAMES = [
  'Shadow', 'Reaper', 'Vortex', 'Ironclad', 'Thunder', 'Bandit', 'Cobra',
  'Grizzly', 'Phantom', 'Saber', 'Havoc', 'Mortar', 'Scorch', 'Tempest',
  'Wraith', 'Nomad', 'Boulder', 'Banshee', 'Cyclone', 'Drifter', 'Ember',
  'Falcon', 'Gauntlet', 'Hailstorm', 'Inferno', 'Juggernaut', 'Krait', 'Lance',
  'Maverick', 'Nemesis', 'Orion', 'Pyre', 'Quasar', 'Rampage', 'Smoke',
  'Talon', 'Umbra', 'Valkyrie', 'Warden', 'Xenon', 'Yeti', 'Zephyr',
  'Brawler', 'Colossus', 'Dredge', 'Echo', 'Fang', 'Ghost', 'Hunter',
  'Iron Maiden', 'Jaeger', 'Kingpin', 'Locust', 'Marauder', 'Nightowl',
];

// 12 distinctive tank colors (one per tank, with extras).
export const TANK_COLORS = [
  { hull: 0x4a5a32, tag: '#9eff7d', glow: '#7eff60' }, // olive
  { hull: 0x355a8c, tag: '#7ec8ff', glow: '#5ab2ff' }, // navy
  { hull: 0x8c3535, tag: '#ff8a8a', glow: '#ff6868' }, // crimson
  { hull: 0x6e3580, tag: '#dca0ff', glow: '#c478ff' }, // violet
  { hull: 0x803e1f, tag: '#ffb070', glow: '#ff8845' }, // burnt orange
  { hull: 0x2f6b66, tag: '#7eecdc', glow: '#52d9c5' }, // teal
  { hull: 0x6b6b2f, tag: '#f0e063', glow: '#ddc23f' }, // mustard
  { hull: 0x4a3520, tag: '#cfa57a', glow: '#b48452' }, // sand
  { hull: 0x303048, tag: '#a0a0ff', glow: '#7878ff' }, // slate-blue
  { hull: 0x4a2f4a, tag: '#ff9ed8', glow: '#ff7ac4' }, // dusk magenta
  { hull: 0x2f4a2f, tag: '#a0ffa0', glow: '#7ad97a' }, // forest
  { hull: 0x6e2f43, tag: '#ff8abf', glow: '#e8689f' }, // wine
];

// Personality definitions. Each has a brain key + traits.
// Brain keys are looked up in src/ai.js → BRAINS.
export const PERSONALITIES = [
  { key: 'aggressive', label: 'Aggressive',
    aimNoiseMul: 0.9, fireRateMul: 1.4, retreatHp: 0.0, idealRange: 22, dashChance: 0.55 },
  { key: 'sniper',     label: 'Sniper',
    aimNoiseMul: 0.45, fireRateMul: 0.7, retreatHp: 0.4, idealRange: 50, dashChance: 0.05 },
  { key: 'cautious',   label: 'Cautious',
    aimNoiseMul: 1.1, fireRateMul: 0.85, retreatHp: 0.6, idealRange: 36, dashChance: 0.1 },
  { key: 'coward',     label: 'Coward',
    aimNoiseMul: 1.4, fireRateMul: 0.7, retreatHp: 0.8, idealRange: 45, dashChance: 0.05 },
  { key: 'defender',   label: 'Defender',
    aimNoiseMul: 0.85, fireRateMul: 1.0, retreatHp: 0.3, idealRange: 28, dashChance: 0.1 },
  { key: 'hunter',     label: 'Hunter',
    aimNoiseMul: 0.85, fireRateMul: 1.05, retreatHp: 0.25, idealRange: 26, dashChance: 0.3 },
  { key: 'bully',      label: 'Bully',
    aimNoiseMul: 1.0, fireRateMul: 1.2, retreatHp: 0.1, idealRange: 18, dashChance: 0.4 },
  { key: 'berserker',  label: 'Berserker',
    aimNoiseMul: 1.5, fireRateMul: 1.6, retreatHp: 0.0, idealRange: 12, dashChance: 0.7 },
  { key: 'balanced',   label: 'Balanced',
    aimNoiseMul: 1.0, fireRateMul: 1.0, retreatHp: 0.35, idealRange: 30, dashChance: 0.2 },
  { key: 'chaos',      label: 'Chaos',
    aimNoiseMul: 1.3, fireRateMul: 1.2, retreatHp: 0.15, idealRange: 25, dashChance: 0.5 },
];

export function pickRandomNames(count) {
  const pool = [...TANK_NAMES];
  const out = [];
  for (let i = 0; i < count && pool.length; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

export function pickRandomColors(count) {
  const pool = [...TANK_COLORS];
  const out = [];
  for (let i = 0; i < count; i++) {
    if (!pool.length) pool.push(...TANK_COLORS);
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

// Shuffled personality assignments for AI tanks.
export function pickPersonalities(count) {
  const pool = [...PERSONALITIES];
  // shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  // if more requested than pool, top up with random from full list
  while (pool.length < count) {
    pool.push(PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)]);
  }
  return pool.slice(0, count);
}
