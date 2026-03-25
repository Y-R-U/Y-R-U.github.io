/**
 * Snake-eee Game Configuration
 */
const CONFIG = {
    // World
    WORLD_RADIUS: 4000,
    GRID_SIZE: 80,
    BOUNDARY_WARNING: 300,

    // Snake defaults
    SNAKE_START_LENGTH: 10,
    SNAKE_SEGMENT_SPACING: 12,
    SNAKE_BASE_SPEED: 3,
    SNAKE_BOOST_SPEED: 6,
    SNAKE_BOOST_COST: 0.3,       // segments lost per second while boosting
    SNAKE_BOOST_TRAIL_INTERVAL: 80, // ms between trail pellet drops
    SNAKE_MAX_TURN_RATE: 7.2,     // radians per second (0.12 * 60)
    SNAKE_HEAD_RADIUS: 10,
    SNAKE_BODY_RADIUS: 8,
    SNAKE_MIN_LENGTH: 3,

    // Food
    FOOD_COUNT: 600,
    FOOD_RADIUS: 4,
    FOOD_VALUE: 1,
    FOOD_GLOW_RADIUS: 8,
    DEATH_PELLET_RADIUS: 6,
    DEATH_PELLET_VALUE: 2,
    POWERUP_SPAWN_INTERVAL: 15000,  // ms
    POWERUP_MAX_COUNT: 5,
    POWERUP_RADIUS: 14,

    // AI
    BOT_COUNT: 15,
    BOT_RESPAWN_DELAY: 3000,
    BOT_DETECTION_RADIUS: 300,
    BOT_FOOD_DETECTION: 350,
    BOT_DECISION_INTERVAL: 500,

    // Camera
    CAMERA_LERP: 0.08,
    CAMERA_ZOOM_MIN: 0.3,
    CAMERA_ZOOM_MAX: 1.2,
    CAMERA_ZOOM_LERP: 0.02,

    // Rendering
    BG_COLOR: '#0a0e1a',
    GRID_COLOR: 'rgba(255,255,255,0.04)',
    BOUNDARY_COLOR: 'rgba(255,50,50,0.4)',
    MINIMAP_SIZE: 120,
    MINIMAP_MARGIN: 12,

    // Power-up types
    POWERUP_TYPES: {
        MAGNET:    { id: 'magnet',    duration: 20000, color: '#ff44ff', icon: '🧲', name: 'Magnet',    desc: 'Attract nearby food' },
        SHIELD:    { id: 'shield',    duration: 8000,  color: '#44aaff', icon: '🛡️', name: 'Shield',    desc: 'Survive one collision' },
        SPEED:     { id: 'speed',     duration: 15000, color: '#ffff44', icon: '⚡', name: 'Speed',     desc: 'Move faster, no mass cost' },
        DOUBLE:    { id: 'double',    duration: 20000, color: '#44ff44', icon: '✕2', name: '2x Growth', desc: 'Double food value' }
    },

    // Scoring
    COINS_PER_MASS_DIVISOR: 50,   // 1 coin per 50 mass
    COINS_PER_KILL: 5,
    COINS_MIN_PER_GAME: 1,        // minimum coins earned per game

    // Skins
    SKINS: [
        { id: 'default',    name: 'Classic',     colors: ['#4CAF50', '#388E3C'],          cost: 0,   unlocked: true },
        { id: 'fire',       name: 'Fire',        colors: ['#FF5722', '#FF9800', '#FFC107'], cost: 0,   unlocked: true },
        { id: 'ocean',      name: 'Ocean',       colors: ['#0288D1', '#00BCD4', '#26C6DA'], cost: 0,   unlocked: true },
        { id: 'neon_pink',  name: 'Neon Pink',   colors: ['#E91E63', '#FF4081'],           cost: 50,  unlocked: false },
        { id: 'purple',     name: 'Royal',       colors: ['#9C27B0', '#CE93D8'],           cost: 50,  unlocked: false },
        { id: 'gold',       name: 'Gold',        colors: ['#FFD700', '#FFA000', '#FF8F00'], cost: 100, unlocked: false },
        { id: 'ice',        name: 'Ice',         colors: ['#B3E5FC', '#E1F5FE', '#FFFFFF'], cost: 100, unlocked: false },
        { id: 'toxic',      name: 'Toxic',       colors: ['#76FF03', '#C6FF00', '#AEEA00'], cost: 100, unlocked: false },
        { id: 'candy',      name: 'Candy',       colors: ['#F48FB1', '#FFFFFF', '#F48FB1'], cost: 150, unlocked: false },
        { id: 'stealth',    name: 'Stealth',     colors: ['#37474F', '#455A64', '#546E7A'], cost: 150, unlocked: false },
        { id: 'rainbow',    name: 'Rainbow',     colors: ['#F44336', '#FF9800', '#FFEB3B', '#4CAF50', '#2196F3', '#9C27B0'], cost: 300, unlocked: false },
        { id: 'galaxy',     name: 'Galaxy',      colors: ['#1A237E', '#7C4DFF', '#E040FB', '#1A237E'], cost: 500, unlocked: false }
    ],

    // Meta upgrades
    META_UPGRADES: {
        startSize:    { name: 'Starting Size',     maxLevel: 10, baseCost: 20,  costScale: 1.5, perLevel: 3,    unit: 'segments' },
        baseSpeed:    { name: 'Base Speed',         maxLevel: 5,  baseCost: 50,  costScale: 1.8, perLevel: 0.15, unit: 'speed' },
        magnetRange:  { name: 'Magnet Range',       maxLevel: 5,  baseCost: 40,  costScale: 1.6, perLevel: 20,   unit: 'px' },
        boostEff:     { name: 'Boost Efficiency',   maxLevel: 5,  baseCost: 60,  costScale: 1.7, perLevel: 0.04, unit: 'reduction' },
        coinBonus:    { name: 'Coin Bonus',         maxLevel: 5,  baseCost: 80,  costScale: 2.0, perLevel: 0.1,  unit: 'multiplier' }
    },

    // Bot names
    BOT_NAMES: [
        'Slinky', 'Viper', 'Cobra', 'Mamba', 'Python', 'Asp', 'Boa', 'Noodle',
        'Slick', 'Zigzag', 'Fang', 'Scales', 'Wiggles', 'Serpent', 'Striker',
        'Shadow', 'Ghost', 'Blaze', 'Frost', 'Storm', 'Razor', 'Titan', 'Jinx',
        'Pixel', 'Glitch', 'Byte', 'Nova', 'Drift', 'Spike', 'Turbo', 'Zen',
        'Dash', 'Flash', 'Bolt', 'Rogue', 'Echo', 'Orbit', 'Nexus', 'Prism'
    ]
};
