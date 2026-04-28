export const GAME_MODES = {
  skirmish: {
    id: 'skirmish',
    label: 'Skirmish',
    tankCount: 10,
    aiCount: 9
  }
};

export const PLAYER_NAME_KEY = 'codexTankBattle.playerName';

export const ARENA_RADIUS = 42;
export const TANK_RADIUS = 1.55;
export const SHELL_RADIUS = 0.24;

export const COLORS = {
  player: 0x70ff95,
  ai: [0xff496d, 0xffd15c, 0x4ff8ff, 0xc879ff, 0xff824a, 0x97a7ff, 0xf3ff6b, 0x50d07d, 0xff6ab7],
  ground: 0x315441,
  rock: 0x66706b,
  trunk: 0x5d3c26,
  leaf: 0x26593b
};

export const PERSONALITIES = [
  {
    id: 'aggressive',
    label: 'Aggressive',
    engageRange: 48,
    preferredRange: 12,
    courage: 1,
    fireDiscipline: 0.92,
    strafe: 0.42,
    retreatHealth: 12,
    aimNoise: 0.35
  },
  {
    id: 'cautious',
    label: 'Cautious',
    engageRange: 34,
    preferredRange: 24,
    courage: 0.38,
    fireDiscipline: 0.68,
    strafe: 0.74,
    retreatHealth: 54,
    aimNoise: 0.7
  },
  {
    id: 'hunter',
    label: 'Hunter',
    engageRange: 46,
    preferredRange: 18,
    courage: 0.78,
    fireDiscipline: 0.84,
    strafe: 0.58,
    retreatHealth: 30,
    aimNoise: 0.44
  },
  {
    id: 'sniper',
    label: 'Sniper',
    engageRange: 58,
    preferredRange: 30,
    courage: 0.56,
    fireDiscipline: 0.97,
    strafe: 0.3,
    retreatHealth: 38,
    aimNoise: 0.24
  },
  {
    id: 'opportunist',
    label: 'Opportunist',
    engageRange: 42,
    preferredRange: 20,
    courage: 0.64,
    fireDiscipline: 0.8,
    strafe: 0.64,
    retreatHealth: 34,
    aimNoise: 0.55
  }
];

export const TUNING = {
  maxHp: 100,
  playerSpeed: 15,
  aiSpeed: 10.8,
  acceleration: 16,
  turnRate: 8,
  turretTurnRate: 9,
  shellSpeed: 31,
  shellLife: 2.15,
  shellDamage: 36,
  blastRadius: 2.8,
  fireCooldown: 0.74,
  aiFireCooldownBonus: 0.16,
  cameraHeight: 58,
  cameraDistance: 24
};
