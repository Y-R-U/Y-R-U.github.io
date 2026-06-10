// Shared mutable match state. Plain data only — systems read and write this
// instead of importing each other, which keeps the module graph acyclic.

import { MURDER, DEFAULT_TANK_COUNT } from './config.js';

export const state = {
  phase: 'title',          // title | countdown | playing | spectate | over
  time: 0,                 // global clock (seconds)
  matchTime: 0,            // time since FIGHT!
  countdown: 0,

  tanks: [],               // all Tank objects in the current match
  player: null,            // the player's Tank (null in attract/shot mode)
  playerName: '',

  tankCount: DEFAULT_TANK_COUNT,
  placeCounter: DEFAULT_TANK_COUNT,  // next placement to hand out on death

  zoneR: MURDER.startR,    // current murder-ring radius
  zoneShrinking: false,
  zoneTimer: MURDER.graceTime,

  pickups: [],

  spectating: null,        // Tank being watched after player death
  winner: null,

  shake: 0,                // camera shake amplitude, decayed by main loop
};

export function addShake(s) {
  state.shake = Math.min(0.9, state.shake + s);
}

export function aliveTanks() {
  return state.tanks.filter((t) => t.alive);
}
