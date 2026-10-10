// Shared mutable match state. Plain data only — systems read and write this
// instead of importing each other, which keeps the module graph acyclic.

import { MURDER, DEFAULT_TANK_COUNT } from './config.js';

export const state = {
  phase: 'title',          // title | countdown | playing | spectate | over
  time: 0,                 // global clock (seconds)
  matchTime: 0,            // time since FIGHT!
  countdown: 0,

  tanks: [],               // all Tank objects in the current match
  alive: [],               // live subset of tanks, kept by Tank.reset/die
  player: null,            // the player's Tank (null in attract/shot mode)
  playerName: '',

  tankCount: DEFAULT_TANK_COUNT,
  placeCounter: DEFAULT_TANK_COUNT,  // next placement to hand out on death

  zoneR: MURDER.startR,    // current murder-ring radius
  zoneShrinking: false,
  zoneTimer: MURDER.graceTime,
  pace: { graceTime: MURDER.graceTime, shrinkRate: MURDER.shrinkRate },
  daily: null,             // date key while playing the daily seeded field

  pickups: [],

  spectating: null,        // Tank being watched after player death
  winner: null,

  shake: 0,                // camera shake amplitude, decayed by main loop

  // Match-lifecycle hooks, filled in by main.js. Systems fire them without
  // needing to know that a career layer exists — keeps the graph acyclic.
  hooks: {
    onKill: null,          // (attacker, victim) => void
    onStalk: null,         // (aiTank) => void — an AI just started hunting the player
  },
};

export function addShake(s) {
  state.shake = Math.min(0.9, state.shake + s);
}

// The live list itself, not a copy: callers must not mutate or sort it.
export function aliveTanks() {
  return state.alive;
}
