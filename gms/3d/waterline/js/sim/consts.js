// Board vocabulary with no knowledge of a Game. ai.js imports this and rng.js and nothing else —
// that is the whole point of the file, and sim.mjs asserts it.

export const UNKNOWN = 0, MISS = 1, HIT = 2, SUNK = 3;

export const PHASES = ['SETUP', 'PLACING', 'AIM', 'OVER'];

export class RulesError extends Error {
  constructor(reason) { super(reason); this.name = 'RulesError'; this.reason = reason; }
}
