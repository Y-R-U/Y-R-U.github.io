'use strict';
/* ── config.js ── Global constants, level defs, upgrade defs ── */

const MAP_HALF = 93; // playable boundary (±)

const B_RAD = { player: 0.9, follower: 0.65, collectible: 0.45 };

const COLORS = {
  player:      0x29b6f6,
  follower:    0x4dd0e1,
  rookie:      0x66BB6A,
  fighter:     0xFFA726,
  champion:    0xEF5350,
  boss:        0xAB47BC,
  collectible: 0xFFD54F,
  special:     0xFF4081,
};

const ENEMY_PROPS = {
  rookie:   { color: COLORS.rookie,    startCrowd: [3, 8],   speed: 5.0, senseRange: 15, huntRange:  0 },
  fighter:  { color: COLORS.fighter,   startCrowd: [6, 12],  speed: 6.0, senseRange: 22, huntRange:  0 },
  champion: { color: COLORS.champion,  startCrowd: [12, 20], speed: 7.0, senseRange: 35, huntRange: 30 },
  boss:     { color: COLORS.boss,      startCrowd: [22, 35], speed: 6.5, senseRange: 50, huntRange: 50 },
};

const LEVELS = [
  { name: 'Rookie Run',    enemies: [{ type: 'rookie',   count: 3 }],                                   targetCrowd: 15, time: 90  },
  { name: 'Street Brawl', enemies: [{ type: 'rookie',   count: 2 }, { type: 'fighter',  count: 2 }],   targetCrowd: 25, time: 120 },
  { name: 'City Chaos',   enemies: [{ type: 'fighter',  count: 2 }, { type: 'champion', count: 2 }],   targetCrowd: 35, time: 120 },
  { name: 'Boss Hunt',    enemies: [{ type: 'champion', count: 2 }, { type: 'boss',     count: 1 }],   targetCrowd: 45, time: 150 },
  { name: 'Final Rush',   enemies: [{ type: 'champion', count: 3 }, { type: 'boss',     count: 2 }],   targetCrowd: 60, time: 180 },
];

const UPGRADE_DEFS = [
  { id: 'speed',     icon: '🏃', name: 'Speed',          desc: '+10% movement speed per level',      maxLevel: 5, costs: [10, 25, 50, 100, 200] },
  { id: 'magnet',    icon: '🧲', name: 'Magnet',          desc: '+20% collect radius per level',      maxLevel: 5, costs: [10, 25, 50, 100, 200] },
  { id: 'squad',     icon: '👥', name: 'Starting Squad',  desc: '+2 followers at game start per level', maxLevel: 5, costs: [15, 30, 60, 120, 240] },
  { id: 'coinBonus', icon: '🪙', name: 'Coin Boost',      desc: '+15% coins earned per level',        maxLevel: 5, costs: [10, 25, 50, 100, 200] },
];

// ── Game modes ──────────────────────────────────────────────────────────────
const GAME_MODES = { LEVELS: 'levels', LMS: 'lms' };

// Enemies for Last Man Standing mode
const LMS_ENEMIES = [
  { type: 'rookie',   count: 2 },
  { type: 'fighter',  count: 2 },
  { type: 'champion', count: 2 },
  { type: 'boss',     count: 2 },
];

// LMS: player starts with a few followers so they have a chance
const LMS_PLAYER_START_CROWD = 5;

const IG_UPGRADES = [
  { id: 'speedSurge', icon: '⚡', name: 'Speed Surge',  desc: '+30% speed for this run'             },
  { id: 'massMagnet', icon: '🧲', name: 'Mass Magnet',  desc: '+60% magnet range this run'          },
  { id: 'shield',     icon: '🛡', name: 'Shield',       desc: '3 s immunity next time you are hit'  },
  { id: 'doubleCrew', icon: '✌️', name: 'Double Crew', desc: 'Each pickup = 2 followers for 20 s'  },
  { id: 'crowdBurst', icon: '💨', name: 'Crowd Burst',  desc: 'Followers move 2× faster for 10 s'  },
  { id: 'luckyStar',  icon: '⭐', name: 'Lucky Star',   desc: 'Coin drops ×2 for 30 s'             },
];
