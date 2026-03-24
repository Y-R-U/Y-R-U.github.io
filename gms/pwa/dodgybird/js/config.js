// ── Flappy Strike: Evasive Run & Gun ── Configuration ──
const CONFIG = {
    // Virtual design resolution (game logic coordinates)
    DESIGN_WIDTH: 800,
    DESIGN_HEIGHT: 500,

    // Player
    PLAYER_X_RATIO: 0.15,
    PLAYER_W: 36,
    PLAYER_H: 24,
    PLAYER_MAX_HEALTH: 3,
    PLAYER_SPEED: 380,
    PLAYER_GRAVITY: 200,
    PLAYER_DRAG: 0.90,
    PLAYER_EDGE_PAD: 20,

    // Shooting
    BULLET_SPEED: 650,
    BULLET_W: 12,
    BULLET_H: 4,
    BASE_FIRE_RATE: 0.28,
    SHOOT_LOCK_TIME: 0.07,

    // Obstacles
    OBS_BASE_SPEED: 160,
    OBS_GAP: 160,
    OBS_WIDTH: 55,
    OBS_SPAWN_INTERVAL: 2.2,
    OBS_MIN_GAP_Y: 0.18,
    OBS_MAX_GAP_Y: 0.72,
    DESTRUCTIBLE_CHANCE: 0.45,
    WALL_HP_MIN: 1,
    WALL_HP_MAX: 3,

    // Enemies
    DRONE_SPEED: 90,
    DRONE_SIZE: 22,
    DRONE_HP: 2,
    DRONE_FIRE_RATE: 2.2,
    DRONE_BULLET_SPEED: 280,
    DRONE_SPAWN_CHANCE: 0.28,
    DRONE_WARNING_TIME: 0.7,
    DRONE_BULLET_SIZE: 5,

    // Boss
    BOSS_SCORE_INTERVAL: 50,
    BOSS_W: 70,
    BOSS_H: 50,
    BOSS_HP: 15,
    BOSS_SPEED: 55,
    BOSS_FIRE_RATE: 0.8,
    BOSS_BULLET_SPEED: 250,
    BOSS_BULLET_SIZE: 7,

    // Power-ups
    POWERUP_DROP_CHANCE: 0.35,
    POWERUP_SIZE: 18,
    POWERUP_DURATION: 8,
    POWERUP_SPEED: 80,
    POWERUP_TYPES: ['shield', 'rapidfire', 'multiplier', 'health'],

    // Currency
    COIN_VALUE: 1,
    ENEMY_COIN_DROP: 3,
    BOSS_COIN_DROP: 25,
    WALL_DESTROY_COIN: 1,

    // Difficulty
    SPEED_SCALE_RATE: 0.004,
    MAX_SPEED_MULT: 2.2,
    DRONE_RATE_SCALE: 0.003,

    // Scoring
    PASS_SCORE: 1,
    DRONE_KILL_SCORE: 5,
    BOSS_KILL_SCORE: 25,
    WALL_DESTROY_SCORE: 2,

    // Visuals
    DAY_NIGHT_DURATION: 90,
    PARALLAX_SPEEDS: [0.15, 0.35, 0.65],

    // Upgrades (shop) - max levels
    MAX_FIRE_RATE_LVL: 5,
    MAX_HEALTH_LVL: 3,
    MAX_MAGNET_LVL: 3,
    MAX_SHIELD_LVL: 3,

    // Continue / Revive
    REVIVE_COST_BASE: 10,
    MAX_REVIVES_PER_RUN: 2,

    // Music
    MAX_MUSIC_TRACKS: 9,
};
