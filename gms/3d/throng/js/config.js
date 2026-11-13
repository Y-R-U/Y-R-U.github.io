export const CONFIG = {
  MATCH: {
    duration: 120,
    crowds: 8,
    countdown: 3,
  },

  SIM: {
    startCount: 4,
    radiusK: 0.55,           // radius = radiusK * sqrt(count)
    radiusMin: 1.2,
    leaderRadius: 0.8,       // collision radius against obstacles
    speedBase: 8.6,          // m/s at count 1
    speedFall: 0.40,         // fraction of speed lost by speedRef people
    speedRef: 1500,
    accel: 9,                // 1/s, velocity approach rate
    turnBoost: 1.6,          // extra accel when reversing, keeps steering snappy

    reachPad: 3.2,           // neutrals within radius + pad get pulled in
    reachGrow: 0.12,         // extra reach per metre of radius
    pullSpeed: 7.5,
    neutralCap: 650,
    neutralStart: 560,
    neutralRespawn: 26,      // per second, while below cap
    neutralSpawnClear: 22,   // metres from any crowd edge
    neutralSpeedMin: 1.0,
    neutralSpeedMax: 1.9,
    plazaBias: 0.62,         // chance a wandering pedestrian heads for a plaza

    stealBase: 6,            // people/s at full overlap, large ratio
    stealPer: 0.5,           // + this * smaller.count per second
    stealDeadzone: 0.06,     // ratio below 1 + this trades nothing
    stealRatioFull: 0.8,     // ratio - 1 at which steal rate saturates
    stealOverlapPow: 1.0,
    stealBoost: 1.2,         // rate *= 1 + min(ratio - 1, cap) * boost: tiny crowds melt on contact
    stealBoostCap: 4,
    eatDrag: 0.85,           // speed while absorbing another crowd: gives the victim a way out
    panicBoost: 1.1,         // speed while being absorbed
    eatHold: 0.35,           // seconds those last after contact ends

    respawnDelay: 3,
    respawnCount: 5,
    respawnShare: 0.12,      // respawn with this share of the other crowds' mean size (comeback)
    underdogBelow: 0.25,     // crowds under this fraction of the leader get extra reach
    underdogReach: 2.5,
    protect: 2.2,

    pickupCount: 5,
    pickupRespawn: 11,
    pickupRadius: 2.2,
    pickupKinds: ['speed', 'magnet', 'double'],
    fx: {
      speed: { dur: 6, mult: 1.45 },
      magnet: { dur: 8, pad: 9, mult: 1.35 },
      double: { dur: 8 },
    },
  },

  TEAMS: [
    { name: 'Blue Empire', color: 0x2f7bff },
    { name: 'Red Legion', color: 0xff3a3a },
    { name: 'Gold Squad', color: 0xffbf1a },
    { name: 'Purple Power', color: 0x9b4dff },
    { name: 'Green Force', color: 0x2fd14a },
    { name: 'Orange Crush', color: 0xff8320 },
    { name: 'Pink Panthers', color: 0xff58c0 },
    { name: 'Cyan Tide', color: 0x19d3e6 },
  ],

  BOTS: [
    { persona: 'collector', skill: 0.75 },
    { persona: 'hunter', skill: 0.85 },
    { persona: 'coward', skill: 0.6 },
    { persona: 'opportunist', skill: 0.8 },
    { persona: 'wanderer', skill: 0.55 },
    { persona: 'bully', skill: 0.65 },
    { persona: 'sprinter', skill: 0.55 },
  ],
  AUTO_PLAYER: { persona: 'opportunist', skill: 0.8 },

  PERSONAS: {
    //            greed  hunt  pickup fear  courage wander chase
    collector:   { greed: 1.6, hunt: 0.5, pickup: 0.8, fear: 1.0, courage: 1.0, wander: 0.0, chase: 40 },
    hunter:      { greed: 0.7, hunt: 1.8, pickup: 0.6, fear: 0.8, courage: 1.4, wander: 0.0, chase: 85 },
    coward:      { greed: 1.2, hunt: 0.3, pickup: 0.7, fear: 1.8, courage: 0.6, wander: 0.0, chase: 25 },
    opportunist: { greed: 1.0, hunt: 1.1, pickup: 1.4, fear: 1.1, courage: 1.0, wander: 0.0, chase: 55 },
    wanderer:    { greed: 1.1, hunt: 0.6, pickup: 0.9, fear: 1.3, courage: 0.9, wander: 0.35, chase: 35 },
    bully:       { greed: 0.9, hunt: 1.4, pickup: 0.5, fear: 0.7, courage: 1.6, wander: 0.0, chase: 60 },
    sprinter:    { greed: 1.1, hunt: 0.8, pickup: 2.2, fear: 1.0, courage: 1.0, wander: 0.0, chase: 45 },
  },

  INPUT: {
    keepMovingOnRelease: true,
    joyRadius: 56,           // CSS px for full deflection
    deadZone: 0.12,
  },

  UI: {
    leaderboardRows: 5,
    leaderboardRowsPortrait: 3,
    badgeHeight: 2.6,        // metres above ground for the count pill
    badgeBack: 0.8,          // pill sits this fraction of the radius toward the far side of the crowd
    crownClear: 7,           // extra lift for the leader's pill so it clears the 3D crown on small crowds
    floaterWindow: 0.35,     // seconds of recruits merged into one "+N"
    toastTime: 1.9,
  },

  // Real online (M3, docs/NET.md). ONLINE_PUBLIC stays false until the server is deployed: until then the
  // Online entry shows only on localhost or with ?online=1 / ?net=host:port.
  NET: {
    ONLINE_PUBLIC: false,
    url: 'wss://games.br8t.com/gms/3d/throng/api/ws',
    path: '/gms/3d/throng/api',
    port: 8024,
  },

  // Fake-online name pool for later milestones (M2 lobby).
  NAME_POOL: [
    'xXSlayerXx', 'MoonPie', 'kaito_77', 'Lil Boss', 'NoScope', 'Mr Waddles', 'zara.k', 'Pixel Pete',
    'BigCrowdEnergy', 'tommyboi', 'Luna', 'JUMBO', 'Gr8Leader', 'sneakyfox', 'Pato', 'ElTigre',
    'mila_x', 'Captain K', 'Bubbles', 'dr. noodle', 'Ana B', 'r3kt', 'hopper', 'ProCrowd', 'Bao',
    'Sir Lancelot', 'kiki', 'TheMob', 'Yusuf', 'popcorn', 'Mia', 'ghost', 'Vortex', 'Chloe <3',
    'Dimitri', 'beans', 'OGsteve', 'Nova', 'King Kong', 'snek', 'Rafa', 'GG EZ', 'Sakura', 'Bjorn',
  ],
};
