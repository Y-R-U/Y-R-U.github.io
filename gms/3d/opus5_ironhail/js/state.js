// Shared mutable state. Plain data — systems read and write this instead of
// importing each other.

export const state = {
  // ---- shell / routing ----
  screen: 'boot',        // boot | title | campaign | garage | ladder | battle | results
  phase: 'idle',         // idle | countdown | playing | won | lost
  paused: false,

  // ---- clocks ----
  time: 0,               // global unscaled clock
  battleTime: 0,         // seconds since FIGHT
  countdown: 0,
  timeScale: 1,          // slow-mo (kill cam)

  // ---- battle contents ----
  mission: null,         // active mission / skirmish descriptor
  tanks: [],
  player: null,
  drone: null,
  pickups: [],
  mines: [],
  smokes: [],
  strikes: [],

  // ---- objective ----
  objective: null,       // { kind, label, progress, goal, timeLeft, failed, done }
  waveIndex: 0,
  spawnQueue: [],

  // ---- environment ----
  env: null,             // active environment preset
  seed: 1,
  wind: { x: 1, z: 0, speed: 0, dir: 0 },

  // ---- aiming (written by the player controller, read by camera + HUD) ----
  aimGround: { x: 0, y: 0, z: -20 },
  aimRange: 0,
  aimValid: true,
  lockTarget: null,

  // ---- camera ----
  camMode: 'chase',      // chase | scope | drone
  zoom: 1,
  shake: 0,
  killcam: null,

  // ---- tallies for the results screen ----
  score: 0,
  kills: 0,
  shots: 0,
  hits: 0,
  propsKilled: 0,
  damageDealt: 0,
  damageTaken: 0,
  longestKill: 0,
  bestStreak: 0,
  streak: 0,
  streakTimer: 0,

  // ---- misc ----
  playerName: '',
  hudDirty: true,
};

export function addShake(s) {
  state.shake = Math.min(1.1, state.shake + s);
}

export function aliveTanks() {
  return state.tanks.filter((t) => t.alive);
}

export function enemyTanks() {
  return state.tanks.filter((t) => t.alive && !t.isPlayer);
}

export function resetBattleTallies() {
  state.battleTime = 0;
  state.score = 0;
  state.kills = 0;
  state.shots = 0;
  state.hits = 0;
  state.propsKilled = 0;
  state.damageDealt = 0;
  state.damageTaken = 0;
  state.longestKill = 0;
  state.bestStreak = 0;
  state.streak = 0;
  state.streakTimer = 0;
  state.timeScale = 1;
  state.killcam = null;
  state.shake = 0;
}
