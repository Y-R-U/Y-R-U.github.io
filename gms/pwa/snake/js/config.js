/**
 * Snake-eee Game Configuration
 */
const CONFIG = {
    // World
    WORLD_RADIUS: 4000,
    GRID_SIZE: 80,
    BOUNDARY_WARNING: 300,

    // The run ends in victory at this mass. It is also the ceiling the whole
    // game is balanced around: body length, camera zoom and the cost of growth
    // are all tuned so that 10,000 is a long but reachable session, and so the
    // frame budget still holds when you get there.
    WIN_MASS: 10000,
    WIN_COIN_BONUS: 400,

    // Snake defaults
    SNAKE_START_LENGTH: 10,          // starting mass
    SNAKE_BASE_SPEED: 3,
    SNAKE_BOOST_SPEED: 6,
    SNAKE_MAX_TURN_RATE: 7.2,        // radians per second at minimum size
    SNAKE_HEAD_RADIUS: 10,
    SNAKE_HEAD_RADIUS_BONUS: 1.15,   // head is a little fatter than the body
    SNAKE_BODY_RADIUS: 8,
    SNAKE_MIN_LENGTH: 3,             // legacy floor, kept for save compatibility
    SNAKE_MIN_MASS: 6,

    // Size curve. `mass` is the score; how long and how thick that makes you is
    // deliberately sub-linear. Mass 1:1 with segments meant a 10,000 snake was
    // 120,000px long — fifteen world diameters, unreadable on screen and far too
    // much geometry for a phone. Instead you grow mostly *thicker*:
    //   radiusFactor = 1 + sqrt(mass)/25, capped
    //   segments     = 6 + 2 * sqrt(mass)
    // At mass 10 that is 12 segments of ~10px spacing (the same 120px body the
    // game always started with); at mass 10,000 it is 206 segments of ~37px —
    // a ~7,800px monster that is still cheap to simulate and draw.
    SNAKE_RADIUS_MASS_DIV: 25,
    SNAKE_RADIUS_MAX_FACTOR: 4.0,
    SEGMENT_SPACING_RATIO: 1.15,     // spacing as a multiple of body radius
    BODY_LENGTH_BASE: 6,
    BODY_LENGTH_SCALE: 2.0,
    BODY_LENGTH_MAX: 420,            // hard safety cap on drawn/collidable segments
    PATH_SAMPLE_DIST: 4,             // how finely the travelled path is recorded

    // Turning gets wider as you get fatter, so a small snake can still outmanoeuvre
    // a big one. Without this the leader is simply unkillable.
    TURN_SIZE_PENALTY: 0.12,         // per unit of radiusFactor above 1
    TURN_RATE_MIN_MULT: 0.6,

    // Boost costs a fraction of your mass per second rather than a flat number of
    // segments, so it stings at every scale. The dropped mass is emitted as
    // pellets on a fixed timer, with the accumulated mass as their value.
    SNAKE_BOOST_COST_FRAC: 0.012,    // mass per second, as a fraction of mass
    SNAKE_BOOST_COST_MIN: 4,         // mass per second floor
    SNAKE_BOOST_TRAIL_INTERVAL: 110, // ms between trail pellet drops

    // Boosting must always be a net loss, or it becomes an infinite mass pump:
    // drop a trail, turn around, eat it back. Three things stop that —
    //   1. the pellet only carries part of the mass burnt; the rest is gone
    //   2. 2x Growth does not apply to your own trail
    //   3. your own pellets are inert for a moment, so you cannot orbit tightly
    //      and hoover them straight back up
    // Careful with these two together: a per-pellet minimum value MUST NOT be
    // applied by clamping, or a small snake burning 0.5 mass per tick drops a
    // 1-mass pellet and boosting literally mints mass. Pending mass accrues
    // until it is worth a pellet instead.
    BOOST_PELLET_RECOVERY: 0.5,
    BOOST_PELLET_MIN_VALUE: 1,
    OWN_PELLET_ARM_MS: 700,

    // Food
    FOOD_COUNT: 600,                 // ambient pellets kept in the world
    FOOD_MAX: 2400,                  // hard cap including death/boost pellets
    FOOD_RADIUS: 4,
    FOOD_VALUE: 1,
    FOOD_GLOW_RADIUS: 8,
    DEATH_PELLET_RADIUS: 6,
    DEATH_PELLET_MAX: 90,            // a 10k snake must not shatter into 5,000 pellets
    DEATH_MASS_RECOVERY: 0.55,       // fraction of the victim's mass left on the field
    DEATH_PELLET_MIN_VALUE: 2,
    POWERUP_SPAWN_INTERVAL: 15000,   // ms
    POWERUP_MAX_COUNT: 5,
    POWERUP_RADIUS: 14,

    // AI
    BOT_COUNT: 15,
    BOT_RESPAWN_DELAY: 3000,
    BOT_DETECTION_RADIUS: 300,
    BOT_FOOD_DETECTION: 350,
    BOT_DECISION_INTERVAL: 500,      // fallback; real value comes from the skill tier

    // Bots spawn scaled against whoever is leading, so there is always a credible
    // rival worth hunting — and something big enough to be worth eating. Fixed
    // 8-25 mass bots made the late game an empty grind.
    BOT_SPAWN_BASE_MIN: 8,
    BOT_SPAWN_BASE_MAX: 25,
    BOT_RIVAL_FRACTION_MIN: 0.05,
    BOT_RIVAL_FRACTION_MAX: 0.40,
    BOT_RIVAL_CAP: 0.60,             // never spawn above this fraction of the leader

    // AI skill tiers. Bots start uniformly stupid and the mix improves as the
    // player does. Tier 0 keeps the flaws on purpose: it will happily circle
    // forever and walk into a wall of snake. Higher tiers look ahead, notice they
    // are going in circles, and lead their shots properly.
    AI_TIERS: [
        { name: 'dumb',    decision: 620, lookAhead: 0,   fanRays: 0, antiCircle: false,
          threatMult: 0.70, lead: 0.55, boostSmart: false, clusterFood: false, reaction: 260 },
        { name: 'average', decision: 430, lookAhead: 130, fanRays: 3, antiCircle: true,
          threatMult: 1.00, lead: 0.85, boostSmart: false, clusterFood: false, reaction: 140 },
        { name: 'smart',   decision: 270, lookAhead: 230, fanRays: 5, antiCircle: true,
          threatMult: 1.25, lead: 1.00, boostSmart: true,  clusterFood: true,  reaction: 60 },
        { name: 'expert',  decision: 170, lookAhead: 330, fanRays: 7, antiCircle: true,
          threatMult: 1.50, lead: 1.00, boostSmart: true,  clusterFood: true,  reaction: 0 }
    ],

    // Weighted tier mix by "skill pressure" (0 = new player, 1 = veteran).
    // Interpolated between the rows below.
    AI_MIX: [
        { p: 0.00, w: [100,  0,  0,  0] },
        { p: 0.20, w: [ 72, 28,  0,  0] },
        { p: 0.45, w: [ 44, 42, 14,  0] },
        { p: 0.70, w: [ 22, 44, 29,  5] },
        { p: 1.00, w: [ 10, 34, 41, 15] }
    ],
    AI_PRESSURE_GAMES: 40,           // games played for the ramp to reach full
    AI_RINGER_CHANCE: 0.28,          // chance (× pressure) that one bot is a ringer
    AI_CIRCLE_TURNS: 2.2,            // net rotations before an anti-circle bot breaks out
    AI_CIRCLE_WINDOW: 6000,          // ms window for the above
    AI_CIRCLE_ESCAPE_MS: 1600,       // how long it runs straight to escape
    AI_AVOID_MARGIN: 24,             // extra clearance a bot wants around obstacles

    // Camera. Zoom tracks body radius rather than raw mass — the old formula
    // bottomed out at mass ~310 and then never changed again, so from there on
    // you could not see your own snake.
    CAMERA_LERP: 0.08,
    CAMERA_ZOOM_MIN: 0.20,
    CAMERA_ZOOM_MAX: 1.2,
    CAMERA_ZOOM_LERP: 0.03,
    CAMERA_ZOOM_RADIUS_REF: 10,      // zoom = REF / bodyRadius, clamped

    // Rendering
    BG_COLOR: '#0a0e1a',
    GRID_COLOR: 'rgba(255,255,255,0.04)',
    BOUNDARY_COLOR: 'rgba(255,50,50,0.4)',
    MINIMAP_SIZE: 120,
    MINIMAP_MARGIN: 12,
    RENDER_OUTLINE_MIN_RADIUS: 3.5,  // below this on-screen radius, skip the outline pass
    NAME_TAG_MIN_ZOOM: 0.28,

    // Power-up types
    POWERUP_TYPES: {
        MAGNET:    { id: 'magnet',    duration: 20000, color: '#ff44ff', icon: '🧲', name: 'Magnet',    desc: 'Attract nearby food' },
        SHIELD:    { id: 'shield',    duration: 8000,  color: '#44aaff', icon: '🛡️', name: 'Shield',    desc: 'Survive one collision' },
        SPEED:     { id: 'speed',     duration: 15000, color: '#ffff44', icon: '⚡', name: 'Speed',     desc: 'Move faster, no mass cost' },
        DOUBLE:    { id: 'double',    duration: 20000, color: '#44ff44', icon: '✕2', name: '2x Growth', desc: 'Double food value' }
    },
    SHIELD_GRACE_MS: 700,            // brief invulnerability after a shield absorbs a hit

    // Scoring
    COINS_PER_MASS_DIVISOR: 20,   // 1 coin per 20 mass
    COINS_PER_KILL: 15,
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

    // Meta upgrades. Deep ladders with a steep curve: the first level of anything
    // is one game's earnings, the last level of anything is twenty winning games
    // saved up, and maxing the whole board is a few hundred runs.
    META_UPGRADES: {
        startSize:    { name: 'Starting Size',     maxLevel: 20, baseCost: 20,  costScale: 1.45, perLevel: 3,    unit: 'mass',       fmt: 'plus' },
        baseSpeed:    { name: 'Base Speed',        maxLevel: 12, baseCost: 60,  costScale: 1.72, perLevel: 0.05, unit: 'speed',      fmt: 'plus2' },
        magnetRange:  { name: 'Magnet Range',      maxLevel: 20, baseCost: 40,  costScale: 1.38, perLevel: 15,   unit: 'px',         fmt: 'plus' },
        boostEff:     { name: 'Boost Efficiency',  maxLevel: 15, baseCost: 70,  costScale: 1.46, perLevel: 0.03, unit: 'cheaper',    fmt: 'pct' },
        coinBonus:    { name: 'Coin Bonus',        maxLevel: 15, baseCost: 100, costScale: 1.50, perLevel: 0.06, unit: 'more coins', fmt: 'pct' }
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
