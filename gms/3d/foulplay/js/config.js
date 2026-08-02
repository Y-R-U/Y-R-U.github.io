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

// Carnage counters. `?dev=1` publishes them as window.__dmg so a headless run
// can COUNT panels off, danglers and debris strikes rather than eyeball them.
// A field-wide total of 80 parts is eight cars losing ten each, and the player
// can still be one of the ones that lost none. `player` is the number that
// actually decides whether this feature exists, so it is counted on its own.
export const DMG = DEV_MODE ? (window.__dmg = {
  hits: 0, dealt: 0, sev: [], amt: [],
  breaks: 0, dangles: 0, instant: 0, partsOff: 0, wheelsOff: 0,
  debrisHits: 0, debrisDealt: 0, maxWheelsLost: 0, stripped: 0, wrecks: {},
  player: {
    hits: 0, dealt: 0, parts: 0, dangles: 0, instant: 0, wheels: 0,
    maxDang: 0, dangSecs: 0, multiSecs: 0, lost: [], src: {},
  },
}) : null;

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
// Metres beyond the road edge that the rail's inner face stands at. trackmesh
// builds the barrier ribbon here and car.js stops the bodywork against it, so
// the two must agree or the cars sink into the steel.
export const RAIL_FACE = 0.35;

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
  railRestitution: 0.5,     // how much of the sideways speed comes back, at a graze
  // …rising to this on a real thump. A car that arrives at the steel hard is
  // supposed to be thrown back off it, not to lean on it and slide.
  railRestitutionHard: 0.86,
  railSpin: 0.34,           // heading kick per m/s of impact
  railScrub: 0.18,          // forward speed lost, scaled by impact
  // Going over a barrier is gated on having just been shunted (see car.js), so
  // this number does not need to be high to be safe — it only needs to be low
  // enough that a well-aimed slam beside a barrier actually finishes somebody.
  railVault: 34,            // lateral m/s over the barrier, once shunted
  railDamage: 1.15,         // hp per m/s of impact above railScuff
  railScuff: 5,             // impact below this is a scrape: noise, no damage
  // Grinding wear, in hp/second, spent ONLY on bodywork — no chassis damage, no
  // hit flash. A player who never lays a glove on anybody still spends a race
  // scraping barriers and running wide, and that has to be enough on its own to
  // strip the trim off the car. It was worth nothing at all before, which is
  // why an ordinary lap left the car looking factory fresh.
  railGrindWear: 8,        // per second of leaning on the steel, at full speed
  offTrackWear: 6,         // per second of being off the racing surface

  // Fraction of an overlap that gets pushed out per step. Under half and two
  // cars leaning on each other stay visibly inside one another for as long as
  // the lean lasts, which reads as clipping rather than as contact.
  separate: 0.72,

  carPush: 0.95,            // lateral impulse share in a car-to-car shunt
  carDamage: 3.9,           // hp per m/s of closing speed — this is where it hurts
  slamSpeed: 12,            // closing m/s that counts as a deliberate slam
  slamImpulse: 30,          // lateral m/s an attack SLAM adds
  slamDamage: 54,
  slamWindow: 0.9,          // seconds a shunt leaves you liable to go over a barrier

  // --- how hard a hit reads -------------------------------------------------
  // Every hit is scored 0..1 for severity from the hp it dealt, and that one
  // number decides the whole outcome: which panel gets picked, how much of the
  // hit goes into bodywork, whether it flaps or leaves, and how long it flaps.
  sevMin: 4,                // dealt hp below this is a scuff — severity 0
  sevFull: 44,              // dealt hp at which it is a full-blooded slam
  panelWear: 1.45,          // multiplier from car hp onto the panel pool
  shearWear: 1.7,           // extra for a shearing hit (attacks pass shear:true)
  panelAbsorb: 0.42,        // pool left over after a panel actually comes off
  writeOffHit: 48,          // dealt hp that can still write off a stripped car

  // --- the flapping stage ---------------------------------------------------
  // The whole point of the damage model. A panel that fails does NOT leave: it
  // tears at one corner, hangs there banging on the car and dragging on the
  // road, and only then goes. It used to last about four seconds for a bonnet,
  // which is not long enough to notice, let alone enjoy — and far too short for
  // two of them ever to overlap. A bonnet now hangs on for eight to fourteen
  // seconds, which at three laps means the next panel to fail almost always
  // joins one that is already flapping.
  tearOff: 0.02,            // chance a failed panel skips the flapping stage…
  tearOffSev: 0.16,         // …plus this much at maximum severity
  dangleBase: 6.4,          // seconds a torn panel hangs on…
  dangleMass: 6.6,          // …plus this per unit of panel mass
  sympathy: 0.30,           // chance a panel going pulls a dented neighbour with it
  dragSparkRate: 17,        // spark bursts/sec off a panel that is on the tarmac
  // …and off one that is merely hanging there. A panel tearing at its hinge is
  // metal on metal whatever it is bolted to, so a bonnet, a roof or a mirror
  // throws sparks too — none of them have a `drag` corner, so before this they
  // threw none at all, and neither did anything on a car that was mid-wreck.
  hingeSparkRate: 7,

  // --- a car that is close to finished --------------------------------------
  // Fractions of the chassis pool. Under the first one the car is just battered;
  // past it the engine starts throwing soot out of the back, and past the second
  // there is a fire under what is left of the bonnet. Both are cosmetic — they
  // are the tell that says "this one is nearly out" from three cars back.
  smokeAt: 0.5,
  fireAt: 0.78,

  // --- car-to-car contact ---------------------------------------------------
  // Contact used to have NO visual event at all — the damage model ran, the
  // paint stayed perfect, and a hard shunt read as two boxes touching. These
  // three numbers are the fake: sparks at the point of impact, a scar in the
  // paint, and a torn flap of bodywork lifting off that scar. See car.js:addScuff.
  contactSparkSev: 0.10,    // severity at which a hit starts throwing sparks
  scuffSev: 0.24,           // …at which it leaves a permanent mark
  scuffFlapSev: 0.38,       // …at which a flap of metal peels off the mark
  scuffCool: 0.9,           // seconds before the same car can be scuffed again

  // --- loose panels ---------------------------------------------------------
  maxDebris: 88,
  debrisLife: 10,           // seconds a small piece survives…
  debrisLifeMass: 8,        // …plus this per unit of mass, so a roof stays about
  debrisDamage: 0.5,        // hp per m/s of closing speed against a car
  debrisDamageMax: 26,
  debrisMinSpeed: 7,        // relative m/s below which it is only a clatter
  debrisPush: 0.34,         // lateral m/s per m/s of closing speed
  debrisPushMax: 9,
  debrisCool: 0.6,          // seconds before the same piece can hit again
  // A torn panel is a flat plate tumbling at speed, not a bullet. With no drag
  // at all it left the car at the car's exact velocity and held it in a dead
  // straight line until it faded — "it keeps pace with me and then vanishes".
  // Exponential, divided by mass: a mirror washes off almost at once, a roof
  // carries. At 0.85 a bonnet at 60 m/s is down to ~15 m/s after two seconds.
  debrisDrag: 0.85,         // 1/s of horizontal air drag, per unit of mass
  debrisSpinDrag: 0.55,     // 1/s — tumbling settles as it slows
  debrisSlide: 2.6,         // 1/s of friction once it is ON the road
  debrisSparkRate: 20,      // spark bursts/sec off a panel skidding on tarmac

  // --- driving on the rims --------------------------------------------------
  grindRate: 11,            // spark bursts/second from ONE grinding corner
  grindStack: 0.6,          // extra rate per additional missing wheel
  // Additive sparks are the most expensive thing on a phone GPU, and four cars
  // grinding side by side is the case that multiplies out of control. The FIELD
  // shares one ceiling rather than every car getting its own. Set generously:
  // one car on its floorpan wants ~45/s, so this only bites on a pile-up.
  // (the field-wide spark ceiling now lives in particles.js:SPARK_BUDGET, so
  // that loose debris can draw on the same bucket without importing car.js)
  // --- losing wheels --------------------------------------------------------
  // Indexed by how many are already gone. The first one is cheap and funny; by
  // the third the car is a liability; the fourth is the end of the drive. A
  // flat 5% a wheel meant a car on four rims did 85% of the speed of a whole
  // one, and — measured over a race — SOMETHING in the field was down to zero
  // wheels in 85% of sampled frames, so "all four gone" was the normal state of
  // a race rather than a disaster anybody ever saw happen.
  wheelSpeed: [1, 0.9, 0.74, 0.5, 0],
  // …and how much harder each successive wheel is to knock off. The pool a hit
  // spends is unchanged — the wheel just soaks a fraction of it — so a car does
  // not become invincible, it becomes a car whose last wheel is welded on.
  // Measured over 3-lap races at hometown, as the share of sampled car-frames
  // running on 0/1/2/3/4 missing wheels:
  //
  //   flat 5%, as it was    ~1%  10%   4%   0%  85%   losing the lot was NORMAL
  //   [1, 2, 3.4, 5.5]      50%  29%  10%  8.3% 3.2%  three cars a race beached
  //   [1, 2.6, 5.2, 10]     <- here
  //
  // The far end of that is the one to be careful with. Every wheel is easier to
  // knock off than it looks, because the collision hull is now the size of the
  // car, so the field trades a lot more paint than it used to and the fourth
  // wheel has to be defended against a much bigger stream of hits than these
  // numbers were first fitted against.
  wheelResist: [1, 2.6, 5.2, 10],
  wheelPickBias: 0.55,      // multiplier on a wheel's odds of being picked, per wheel already lost
  wheelSag: 0.115,          // metres the body drops per missing wheel
  wheelDrag: 0.85,          // extra rolling resistance per missing wheel
  // With nothing left to roll on the car is a sledge: it scrubs off speed on
  // its floorpan and, once it is barely moving, the truck comes for it.
  beachedDrag: 11,          // m/s² of floorpan friction with no wheels at all
  beachedStop: 4,           // m/s below which a wheelless car gives up

  landHard: 15,             // vertical m/s where a landing hurts
  landDamage: 2.2,
  landSpinOut: 1.25,        // heading (rad) at which a heavy landing flips you

  // World-space wreck simulation (once you actually leave the track)
  wreckGravity: 26,
  wreckBounce: 0.36,
  wreckFriction: 0.86,
  wreckSpin: 2.4,
  wreckShedChance: 0.55,    // per impact, chance a part rips off
  // Leaving the circuit is an instant loss, so it is also the moment the car is
  // allowed to disintegrate — and the pieces have to come off ACROSS the crash
  // rather than all on the frame it landed on. Panels are queued to let go at
  // their own moment over this many seconds.
  breakUpSpread: 1.8,

  // --- how long you are out of the race -------------------------------------
  // Two profiles, because leaving the circuit and being written off ON it are
  // not the same event. This game is meant to be a mostly-continuous drive, so
  // an on-track wreck is a stumble the frame welds itself back together from,
  // and only actually leaving the track costs you real time.
  wreckMinTime: 2.0,        // OFF the circuit: tumbling before the truck comes
  wreckMaxTime: 4.0,
  homeMinTime: 1.0,         // ON it: written off, or out of wheels
  homeMaxTime: 2.4,
  respawnTime: 0.8,         // seconds of blackout before you rejoin
  respawnBack: 14,          // metres behind the crash point you rejoin

  // --- being hit while you are already down ---------------------------------
  // A wreck used to be intangible: the field drove straight through it. It is a
  // two-tonne obstacle lying on the racing line and it should behave like one,
  // for both parties — you get punted further down the road and whoever ran
  // into you takes it in the bodywork.
  wreckHitCool: 0.22,       // seconds before the same wreck can be hit again
  // Everything below is driven by the closing speed CLAMPED to this. A wreck
  // lying still and a boosting car arriving at 345 km/h close at over 90 m/s,
  // and at the unclamped rates that punted the wreck nine metres into the air
  // and took a quarter of the runner's chassis in one touch. The spark count
  // still scales with the real number — the spectacle is allowed to be as big
  // as the hit was, the physics is not.
  wreckHitMax: 30,
  wreckHitPush: 0.85,       // world m/s given to the wreck per m/s of closing
  wreckHitLift: 0.3,        // …and this much of it straight up, so it hops
  wreckHitSpin: 0.16,       // rad/s of tumble per m/s of closing
  wreckHitBack: 0.55,       // fraction of the closing speed the runner loses
  wreckHitDamage: 2.1,      // hp per m/s to the car that hit it
  wreckHitTakes: 1.3,       // hp per m/s to the wreck — more panels, no penalty
  wreckHitShed: 0.55,       // chance a hit rips another piece off the wreck
  wreckHitDelay: 0.28,      // seconds added to the recovery per hit…
  wreckHitDelayMax: 1.3,    // …and the most it can ever add in total
};

// Total structural HP of a car body. Parts have their own pools on top, so the
// chassis number is high enough to take a lot of punishment while shedding
// pieces the whole way — but not so high that "stripped to the tub" is a state
// nobody ever sees. Measured over headless batches at hometown, 3 laps, 8 cars:
//
//   520 → 0.17 stripped cars/race (1 race in 6)    too rare to be a feature
//   360 → 0.38                    (3 races in 8)
//   320 → 0.69                    (6 races in 13)  <- here
//   300 → 1.00                    (6 races in 9)   reads as "every race"
//
// Every other race, roughly — enough that a stripped car is a thing you have
// seen, not enough that it stops being an event.
//
// Nobody retired at any of those settings; hitting zero forces a wreck plus a
// 35% rebuild, not an elimination.
export const CHASSIS_HP = 320;

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
  // Seconds you keep driving after taking the flag, before the results come up.
  // The race does not stop when you cross the line — the rest of the field is
  // still coming in and you are still on the circuit with them, which is both
  // the honest thing and the last chance to put somebody in the wall.
  finishHold: 5,
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
