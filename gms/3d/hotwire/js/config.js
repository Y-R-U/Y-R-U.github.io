// Central tuning + URL flags. Settings that the player can change live in
// save.js (profile.settings); this is the fixed design-side dial board.

export const URLP = new URLSearchParams(location.search);
export const FLAG = {
  nosave: URLP.has('nosave'),
  shot: URLP.has('shot'),
  lite: URLP.has('lite'),
  auto: URLP.has('auto'),
  level: URLP.get('level') || null,        // 'palmbay' | 'docks' | 'custom:<id>'
  mode: URLP.get('mode') || null,          // 'story' | 'free' | 'endless'
  jump: URLP.get('m') || null,             // story node id to jump to
  cash: URLP.get('cash') ? parseInt(URLP.get('cash'), 10) : null,
};

export const CFG = {
  // ── isometric follow camera (fixed yaw, Smashy style) ──
  cam: {
    yaw: Math.PI * 0.25, pitch: 0.82, fov: 42,
    dist: 46, distFast: 62,        // pulls back with speed (higher = more zoomed out)
    zoomMin: 0.55, zoomMax: 2.1,   // user pinch/settings factor
    lookAhead: 0.55,               // seconds of velocity lead
    editor: { pitch: 1.25, dist: 90 },
  },

  // ── on-foot ──
  foot: { speed: 5.4, swim: 2.0, hp: 100, enterRange: 4.2, pickupRange: 2.0 },

  // ── driving feel ──
  drive: {
    turnBase: 2.6,                 // rad/s at low speed, scaled by grip
    reverseTop: 6.5,
    offroadFactor: { g: 0.72, d: 0.8, s: 0.55, w: 0.16, r: 1.0, p: 1.0 },
    waterDps: 26,                  // hp/s while in water
    drag: 1.35, brake: 26,
    smashSpeed: 3.0,               // min speed to smash props
    ramDamage: 0.9,                // hp per (m/s) of relative impact speed
    wallBounce: 0.42,
    nitroBoost: 1.45, nitroTime: 2.2, nitroCd: 7,
    dustSpeed: 4,                  // min speed for offroad dust
  },

  // ── wanted heat ──
  heat: {
    // crime points: 100 pts = 1 star band (stars = ceil(points/100), max 5)
    smashProp: 4, ramCar: 14, ramCop: 45, killPed: 90, killCop: 130,
    gunfire: 2, hitCop: 22, roadblockBreak: 30,
    decayDelay: 7, decayRate: 26,        // pts/s once calm
    starCap: 5,
    // spawn counts per star band
    cops: [0, 1, 3, 5, 6, 7],
    swatAt: 4, heliAt: 5, roadblockAt: 3,
    copHp: 70, swatHp: 130, copTop: [0, 15, 17, 19, 21, 23],
    endlessRamp: 2.2,                    // pts/s auto-climb in endless mode
  },

  ped: { count: 14, speed: 1.6, fleeSpeed: 4.6 },
  traffic: { count: 9, speed: 7.5, spawnR: [46, 90], despawnR: 110 },

  colors: {
    police: 0x4da3ff, gang: 0xff5f7a, civ: 0xb6e88a, mission: 0xffd76a,
    paint: [null, 0xff4b3a, 0x3a7bff, 0x39d474, 0xffd23e, 0xb04bff, 0x151a20, 0xf2f3f5],
  },

  fx: { dustCap: 900, liteDustCap: 250 },
  saveKey: 'hotwire.save', levelsKey: 'hotwire.levels',
};

// dev flags applied late (main.js): FLAG.cash adds cash once.
