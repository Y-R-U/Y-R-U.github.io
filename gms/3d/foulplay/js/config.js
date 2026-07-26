// FOUL PLAY — central tuning. Anything that changes how the game *feels* lives
// here (or in arsenal.js / tracks.js), so balance passes never touch systems.

const Q = new URLSearchParams(location.search);

// ---------------------------------------------------------------------------
// URL test hooks
// ---------------------------------------------------------------------------
export const LITE_MODE  = Q.has('lite');              // fewer lights, no shadows
export const AUTO_MODE  = Q.has('auto');              // AI drives the player car
export const SHOT_MODE  = Q.has('shot');              // staged thumbnail frame
export const DEV_MODE   = Q.has('dev');               // debug overlay + cheats
export const WIPE_ARG   = Q.has('wipe');              // clear save on boot
export const START_ARG  = Q.get('start') || '';       // race | garage | story | quick
export const TRACK_ARG  = Q.get('track') || '';       // force a track id
export const LEVEL_ARG  = Q.get('level') || '';       // story level number
export const LAPS_ARG   = parseInt(Q.get('laps') || '0', 10) || 0;
export const CARS_ARG   = parseInt(Q.get('cars') || '0', 10) || 0;
export const SPEED_ARG  = parseFloat(Q.get('speed') || '0') || 0;   // time scale
export const MODE_ARG   = Q.get('mode') || '';        // quick | knockout | event

export const IS_TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
export const IS_SMALL = Math.min(window.innerWidth, window.innerHeight) < 520;

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------
export const SAVE_KEY = 'foulplay_save_v1';

// ---------------------------------------------------------------------------
// World scale
// ---------------------------------------------------------------------------
// Everything is metres and seconds. Display speed is km/h (x3.6).
export const GRAVITY = 22;            // arcade gravity — heavier than real, reads better
export const ROAD_HALF = 11;          // default half-width of the racing surface
export const RAIL_HEIGHT = 1.15;      // guardrail crest; clear it and you leave the track

// ---------------------------------------------------------------------------
// Driving model
// ---------------------------------------------------------------------------
// The car lives in track space: (s along the centreline, t across it) with a
// heading psi measured against the tangent. Grip is modelled as side-velocity
// decay, so a low grip number is a drifty car, not a slow one.
export const DRIVE = {
  topSpeed: 74,             // m/s ≈ 266 km/h before upgrades
  accel: 15.5,              // m/s² at a standstill; falls off toward top speed
  accelFalloff: 0.72,       // exponent on (1 - v/vmax)
  brake: 26,
  reverse: 12,
  drag: 0.00037,            // v² drag: ~2 m/s² at top speed, so it shapes the
                            // top end without dominating the whole speed range
  rollResist: 1.1,

  steerRate: 2.35,          // rad/s of heading change at full lock, low speed
  steerHighSpeed: 0.42,     // multiplier on steering authority at top speed
  steerReturn: 5.2,         // how fast the wheel self-centres

  grip: 6.4,                // side-velocity decay rate (1/s). Higher = stickier
  driftGrip: 2.4,           // grip while the handbrake/drift is on
  slipDrift: 6.0,           // side speed (m/s) that counts as "drifting"
  slipScrub: 0.55,          // fraction of side speed bled off the forward speed

  // Recovery — the promise that you can always take over again.
  autoSteer: 2.6,           // rad/s pull of the heading back toward the tangent
  autoSteerIdle: 1.9,       // extra pull while the player is not steering
  recoverTime: 1.15,        // seconds of strong assist after a big knock
  recoverPull: 3.4,         // heading + lateral assist strength during recovery

  boostMul: 1.42,           // top speed multiplier while boosting
  boostAccel: 26,           // extra m/s² while boosting
  boostTime: 2.6,           // seconds per collected boost
  padBoostTime: 1.5,        // seconds from a track boost pad
  boostMax: 3,              // stored boosts you can carry

  offTrackDrag: 9.5,        // extra deceleration on grass/dirt beyond the road
  offTrackGrip: 0.45,       // grip multiplier off the racing surface
};

// Loops. The physics needs no special case — the normal force formula in
// car.js already produces "too slow and you fall off" — but a real loop needs
// a suicidal entry speed, so arcade gravity gets turned down inside one and
// the car gets extra downforce. These two numbers set the entry speed you have
// to carry, which track.loopAhead() reports and the HUD shouts about.
export const LOOP = {
  gravity: 0.55,            // multiplier on along-track gravity inside a loop
  downforce: 13,            // m/s² of extra stick while on loop surface
  warnMargin: 1.06,         // HUD warns below minSpeed × this
};

// ---------------------------------------------------------------------------
// Collisions and carnage
// ---------------------------------------------------------------------------
export const CRASH = {
  carLen: 4.3,
  carWide: 2.05,
  carHigh: 1.35,

  // Barriers exist to keep you racing. Driving badly should cost you time and
  // paint, never the race — the damage in this game is supposed to come from
  // attacks and from other cars, so that driving is the part you can relax
  // into while you think about who to hit next.
  railRestitution: 0.5,     // how much of the sideways speed comes back
  railSpin: 0.34,           // heading kick per m/s of impact
  railScrub: 0.18,          // forward speed lost, scaled by impact
  // Going over a barrier is gated on having just been shunted (see car.js), so
  // this number does not need to be high to be safe — it only needs to be low
  // enough that a well-aimed slam beside a barrier actually finishes somebody.
  railVault: 34,            // lateral m/s over the barrier, once shunted
  railDamage: 0.3,          // hp per m/s of impact above railScuff
  railScuff: 9,             // impact below this is a scrape: noise, no damage

  carPush: 0.95,            // lateral impulse share in a car-to-car shunt
  carDamage: 2.5,           // hp per m/s of closing speed — this is where it hurts
  slamSpeed: 12,            // closing m/s that counts as a deliberate slam
  slamImpulse: 30,          // lateral m/s an attack SLAM adds
  slamDamage: 34,
  slamWindow: 0.9,          // seconds a shunt leaves you liable to go over a barrier

  landHard: 18,             // vertical m/s where a landing hurts
  landDamage: 1.6,
  landSpinOut: 1.25,        // heading (rad) at which a heavy landing flips you

  // World-space wreck simulation (once you actually leave the track)
  wreckGravity: 26,
  wreckBounce: 0.36,
  wreckFriction: 0.86,
  wreckSpin: 2.4,
  wreckShedChance: 0.55,    // per impact, chance a part rips off
  wreckMinTime: 2.2,        // seconds of tumbling before the recovery truck comes
  wreckMaxTime: 5.0,
  respawnTime: 1.35,        // seconds of blackout before you rejoin
  respawnBack: 14,          // metres behind the crash point you rejoin
};

// Total structural HP of a car body. Parts have their own pools on top; the
// chassis number is deliberately huge because the brief is "takes a lot of
// punishment on track, but sheds pieces the whole way".
export const CHASSIS_HP = 520;

// ---------------------------------------------------------------------------
// The steward system — the actual game
// ---------------------------------------------------------------------------
export const STEWARD = {
  max: 100,                 // suspicion at which they open an investigation
  decay: 2.6,               // suspicion bled per second
  decayIdle: 4.2,           // faster once you have been clean for a while
  calmAfter: 3.5,           // seconds clean before the faster decay kicks in

  // Distance bands. Touching paint reads as a racing incident; a hit from
  // across the track reads as exactly what it is.
  contactRange: 5.2,        // "we were side by side, stewards"
  contactMul: 0.16,
  closeRange: 12,
  farMul: 1.75,             // multiplier at maximum range

  camMul: 2.05,             // multiplier while inside a broadcast camera cone
  camWarnDist: 60,          // how far ahead the HUD warns about a camera

  hypeShield: 0.62,         // fraction of a fine the crowd can wave away at max hype
  investigateHold: 3.2,     // seconds of "STEWARDS REVIEWING" before the verdict
  clearedReset: 34,         // suspicion left after being let off
  finedReset: 18,

  fineBase: 900,            // $ per investigation, scaled by the level's purse
  fineRamp: 1.35,           // each fine in a race costs more
};

export const HYPE = {
  max: 100,
  decay: 3.4,               // crowds forget fast
  perWreck: 26,             // you put a rival into the wall
  perFlip: 14,
  perAir: 0.9,              // per metre of air time height
  perDrift: 5.5,            // per second of a long drift
  perNearMiss: 7,
  perOvertake: 6,
  perPartOff: 4,            // per part you knock off someone
  perSpin: 9,
};

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------
export const CAM = {
  dist: 13.6,
  height: 5.5,
  look: 8.2,
  fov: 68,
  fovBoost: 82,
  lag: 7.5,                 // position smoothing rate
  aimLag: 9.5,
  bankLean: 0.28,           // how much the camera rolls with the road
  shakeDecay: 2.6,
  wreckDist: 15,
  wreckHeight: 7,
};

// ---------------------------------------------------------------------------
// Race defaults
// ---------------------------------------------------------------------------
export const RACE = {
  gridCars: 8,
  laps: 3,
  countdown: 3.6,
  gridSpacing: 8.5,
  gridStagger: 4.6,
  finishHold: 2.4,          // seconds the camera lingers after you cross
  aiFinishTime: 26,         // seconds after the winner before stragglers are called in
  knockoutInterval: 22,     // seconds between eliminations in knockout events
};

// Prize money by finishing position (index 0 = winner), scaled by purse.
export const PRIZE_SHARE = [1, 0.62, 0.42, 0.3, 0.22, 0.16, 0.11, 0.07, 0.05, 0.04];

// ---------------------------------------------------------------------------
// World ranking — you start as a nobody in a very big series.
// ---------------------------------------------------------------------------
export const LADDER = {
  startRank: 250000,
  population: 3140000,
  climbWin: 0.34,           // fraction of the gap to the next tier a win closes
  climbBase: 0.06,
  dropLast: 0.09,
};

export const NAME_POOL = [
  'ROADKILL', 'VENDETTA', 'HAVOC', 'SNAKEBITE', 'BLACKOUT', 'MAYHEM', 'RIPTIDE',
  'JACKKNIFE', 'GRAVEL', 'TORQUE', 'DIESEL', 'BANSHEE', 'CROWBAR', 'HOTWIRE',
  'PILEUP', 'SIDEWINDER', 'BRUISER', 'NITRO', 'ROADRAGE', 'WRECKER',
];

export const RIVAL_NAMES = [
  'AXLE HUNT', 'MARA VOSS', 'DUKE SALT', 'KIT REYES', 'BRAM OKO', 'NIKA FANG',
  'CASS IRON', 'TOMO KREEL', 'RED VANCE', 'ODA STRIKE', 'PIP GALLOWS', 'VEX RAY',
  'JUDE CRANK', 'SIL MORROW', 'BOONE ASH', 'ZARA PIKE', 'HOLT DRAGO', 'EMBER LUX',
  'RIGGS MALO', 'TALA WREN', 'GUS PENNY', 'IVO SLATE', 'MAYA KURO', 'DEZ HALO',
  'FLYNN ROOK', 'OSCAR DUNE', 'NIA BLAZE', 'RUFUS TAP', 'LENA COIL', 'MAX GRIST',
];

export const TEAM_NAMES = [
  'Rustline', 'Vega Auto', 'Deadbolt', 'Kingfisher', 'Iron Pact', 'Sunk Cost',
  'Redcap', 'Bad Habit', 'Cutshaw', 'Halloway', 'Moth & Sons', 'Nightshift',
];

// Colours used for liveries and HUD chips.
export const LIVERY = [
  { body: 0xe23c3c, trim: 0xffd166, name: 'Scarlet' },
  { body: 0x2f8fe0, trim: 0xf2f7ff, name: 'Cobalt' },
  { body: 0x37c26a, trim: 0x14332a, name: 'Venom' },
  { body: 0xf0a12b, trim: 0x2b1d0e, name: 'Amber' },
  { body: 0x9a56d6, trim: 0xffe9b0, name: 'Violet' },
  { body: 0xe8e8ee, trim: 0xd23c3c, name: 'Bone' },
  { body: 0x21252c, trim: 0xf5b942, name: 'Tar' },
  { body: 0x18b6c4, trim: 0x08303a, name: 'Lagoon' },
  { body: 0xff6fae, trim: 0x3a0f22, name: 'Bubblegum' },
  { body: 0x8d6a3f, trim: 0xe4d5b7, name: 'Dust' },
  { body: 0x5d6b7a, trim: 0xffffff, name: 'Gunmetal' },
  { body: 0xc9f24a, trim: 0x1b2405, name: 'Acid' },
];
