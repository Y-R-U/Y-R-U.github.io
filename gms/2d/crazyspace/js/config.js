// config.js — all balance data: ships, weapons, prizes, modes, palette.
// Tuning lives here so the rest of the code stays generic.

export const TILE = 28; // world px per tile

// --- Team palette (index 0 = player's default team color set) ---
export const TEAMS = [
  { name: 'Gold',   color: '#ffd23f', glow: '#ffec8b', dark: '#7a5d00' },
  { name: 'Cyan',   color: '#35e3ff', glow: '#aef6ff', dark: '#06606e' },
  { name: 'Rose',   color: '#ff5d8f', glow: '#ffb3c9', dark: '#7a1330' },
  { name: 'Lime',   color: '#8bff5a', glow: '#d6ffb8', dark: '#2f6a10' },
];

export const PALETTE = {
  bg0: '#05060f',
  bg1: '#0a0d24',
  star: '#9fb4ff',
  wall: '#27306b',
  wallEdge: '#5b6cff',
  wallGlow: '#3344aa',
  bullet: '#fff1a8',
  bomb: '#ff7b3d',
  prize: '#54ff8e',
  energyHi: '#54ff8e',
  energyMid: '#ffd23f',
  energyLo: '#ff4d4d',
  hud: '#bcd0ff',
};

// --- Ships ---
// energy doubles as health & ammo. recharge in energy/sec.
// thrust in px/s^2, top in px/s, turn in rad/s, radius in px.
export const SHIPS = {
  warbird: {
    name: 'Warbird', key: 'warbird', desc: 'Balanced fighter. Hard-hitting gun.',
    maxEnergy: 1500, recharge: 520, thrust: 1150, top: 360, turn: 4.4, radius: 13, mass: 1,
    gunCost: 220, bombCost: 520, gunDmg: 360, bombDmg: 760,
    guns: 1, bombs: 1, maxGuns: 3, maxBombs: 3, fireRate: 5.2, bombRate: 1.4,
    special: 'burst', shape: 'arrow',
  },
  javelin: {
    name: 'Javelin', key: 'javelin', desc: 'Multifire menace. Spreads bullets wide.',
    maxEnergy: 1350, recharge: 500, thrust: 1080, top: 345, turn: 4.7, radius: 12, mass: 0.9,
    gunCost: 175, bombCost: 600, gunDmg: 250, bombDmg: 820,
    guns: 1, bombs: 1, maxGuns: 3, maxBombs: 2, fireRate: 6.5, bombRate: 1.2,
    multifire: true, special: 'burst', shape: 'dart',
  },
  spider: {
    name: 'Spider', key: 'spider', desc: 'Fast & nimble glass cannon.',
    maxEnergy: 1100, recharge: 560, thrust: 1380, top: 430, turn: 5.4, radius: 11, mass: 0.75,
    gunCost: 165, bombCost: 560, gunDmg: 240, bombDmg: 640,
    guns: 1, bombs: 1, maxGuns: 3, maxBombs: 2, fireRate: 6.8, bombRate: 1.3,
    special: 'repel', shape: 'spider',
  },
  leviathan: {
    name: 'Leviathan', key: 'leviathan', desc: 'Heavy tank. Devastating bombs.',
    maxEnergy: 2100, recharge: 420, thrust: 820, top: 285, turn: 3.4, radius: 16, mass: 1.6,
    gunCost: 240, bombCost: 480, gunDmg: 300, bombDmg: 1050,
    guns: 1, bombs: 1, maxGuns: 2, maxBombs: 4, fireRate: 4.2, bombRate: 1.7,
    special: 'repel', shape: 'heavy',
  },
  terrier: {
    name: 'Terrier', key: 'terrier', desc: 'Speedy skirmisher. Recharges fast.',
    maxEnergy: 1250, recharge: 680, thrust: 1250, top: 400, turn: 5.0, radius: 12, mass: 0.85,
    gunCost: 170, bombCost: 540, gunDmg: 230, bombDmg: 600,
    guns: 1, bombs: 1, maxGuns: 3, maxBombs: 2, fireRate: 6.0, bombRate: 1.4,
    special: 'burst', shape: 'wedge',
  },
};
export const SHIP_LIST = Object.keys(SHIPS);

// --- Projectiles ---
export const BULLET = {
  speed: 720, life: 1.15, radius: 4,
  // damage multiplier per gun level
  levelDmg: [0, 1.0, 1.7, 2.5],
  levelRadius: [0, 4, 5, 6.5],
};
export const BOMB = {
  speed: 430, life: 3.0, radius: 9,
  levelDmg: [0, 1.0, 1.45, 1.95, 2.5],
  blast: [0, 140, 175, 210, 245],
};
export const MINE = { life: 22, radius: 10, blast: 175, dmg: 900 };
export const BURST = { count: 18, speed: 640, life: 0.9, dmg: 300, radius: 4 };
export const REPEL = { radius: 320, force: 1500, life: 0.35 };

// --- Prizes (greens) ---
// type strings handled in Ship.applyPrize
export const PRIZES = [
  { w: 16, type: 'gun',      label: 'Gun Upgrade' },
  { w: 12, type: 'bomb',     label: 'Bomb Upgrade' },
  { w: 14, type: 'energy',   label: 'Max Energy +' },
  { w: 12, type: 'recharge', label: 'Recharge +' },
  { w: 11, type: 'thrust',   label: 'Thrust +' },
  { w: 10, type: 'speed',    label: 'Top Speed +' },
  { w: 9,  type: 'rotation', label: 'Rotation +' },
  { w: 8,  type: 'multifire',label: 'Multifire' },
  { w: 8,  type: 'bounce',   label: 'Bouncing Bullets' },
  { w: 7,  type: 'burst',    label: 'Burst +' },
  { w: 7,  type: 'repel',    label: 'Repel +' },
  { w: 6,  type: 'rocket',   label: 'Rocket' },
  { w: 5,  type: 'fullcharge', label: 'Full Charge' },
  { w: 4,  type: 'shield',   label: 'Shields' },
  { w: 2,  type: 'dud',      label: '...nothing' },
];

export const PRIZE_CAPS = {
  energyBonus: 1200,   // +max energy cap
  rechargeBonus: 360,
  thrustBonus: 700,
  speedBonus: 170,
  rotationBonus: 2.2,
  burst: 6,
  repel: 6,
  rocket: 4,
};

// --- Game modes metadata (logic in modes.js) ---
export const MODES = {
  deathmatch: {
    name: 'Deathmatch', key: 'deathmatch', icon: '💀',
    blurb: 'Free-for-all. Most kills wins.',
    teams: 1, ffa: true, bots: 9, scoreLimit: 30, time: 300,
  },
  team: {
    name: 'Team Battle', key: 'team', icon: '⚔️',
    blurb: 'Two squads clash. First to the frag limit takes it.',
    teams: 2, bots: 9, scoreLimit: 50, time: 360,
  },
  ctf: {
    name: 'Capture the Flag', key: 'ctf', icon: '🚩',
    blurb: 'Steal the enemy flag, bring it home. 3 captures wins.',
    teams: 2, bots: 9, scoreLimit: 3, time: 420,
  },
  koth: {
    name: 'King of the Hill', key: 'koth', icon: '👑',
    blurb: 'Hold the central zone alone to bank points.',
    teams: 2, bots: 9, scoreLimit: 100, time: 360,
  },
};
export const MODE_LIST = Object.keys(MODES);

export const RESPAWN_DELAY = 2.2;
export const PRIZE_MAX = 26;     // greens alive at once
export const PRIZE_SPAWN = 1.1;  // seconds between green spawns
