// Shared mutable state. Plain data — systems read and write this rather than
// importing each other.

export const state = {
  // ---- shell / routing ----
  screen: 'boot',       // boot | title | story | quick | garage | ladder | race | results
  phase: 'idle',        // idle | countdown | racing | finished | replay
  paused: false,
  booted: false,

  // ---- clocks ----
  time: 0,              // unscaled seconds since boot
  raceTime: 0,          // seconds since lights out
  countdown: 0,
  timeScale: 1,
  dt: 0,

  // ---- race contents ----
  event: null,          // the descriptor the race was started from
  track: null,          // Track instance
  cars: [],
  player: null,
  order: [],            // cars sorted by race position
  finishers: [],
  laps: 3,
  lapRecord: null,

  // ---- the steward game ----
  suspicion: 0,
  suspicionPeak: 0,
  cleanFor: 0,          // seconds since the last foul
  hype: 0,
  investigating: 0,     // >0 while the stewards are reviewing
  investigations: 0,
  finesTotal: 0,
  fouls: 0,
  cleanFouls: 0,        // fouls that read as racing incidents
  inCameraCone: false,
  nearestCamDist: 999,

  // ---- tallies ----
  wrecksCaused: 0,
  partsKnockedOff: 0,
  overtakes: 0,
  airTime: 0,
  bestAir: 0,
  driftTime: 0,
  flips: 0,
  damageDealt: 0,
  damageTaken: 0,
  boostsUsed: 0,
  attacksUsed: 0,
  chestsFound: 0,
  pickupCash: 0,
  topSpeedSeen: 0,

  // ---- camera / presentation ----
  camMode: 'chase',     // chase | wreck | cine | replay | orbit
  lookBack: false,
  attract: false,       // a race running behind the menus, nobody driving
  shake: 0,
  cine: false,
  cineLine: null,
  replay: null,

  // ---- misc ----
  hudDirty: true,
  message: null,
};

export function resetRaceState() {
  state.raceTime = 0;
  state.countdown = 0;
  state.timeScale = 1;
  state.cars = [];
  state.order = [];
  state.finishers = [];
  state.player = null;
  state.suspicion = 0;
  state.suspicionPeak = 0;
  state.cleanFor = 99;
  state.hype = 0;
  state.investigating = 0;
  state.investigations = 0;
  state.finesTotal = 0;
  state.fouls = 0;
  state.cleanFouls = 0;
  state.wrecksCaused = 0;
  state.partsKnockedOff = 0;
  state.overtakes = 0;
  state.airTime = 0;
  state.bestAir = 0;
  state.driftTime = 0;
  state.flips = 0;
  state.damageDealt = 0;
  state.damageTaken = 0;
  state.boostsUsed = 0;
  state.attacksUsed = 0;
  state.chestsFound = 0;
  state.pickupCash = 0;
  state.foundChests = [];
  state.topSpeedSeen = 0;
  state.results = null;
  state.lookBack = false;
  state.shake = 0;
  state.replay = null;
  state.lapRecord = null;
  state.camMode = 'chase';
  state.phase = 'idle';
}

export function addShake(s) {
  state.shake = Math.min(1.4, state.shake + s);
}

export const rivals = () => state.cars.filter((c) => c !== state.player && !c.retired);
