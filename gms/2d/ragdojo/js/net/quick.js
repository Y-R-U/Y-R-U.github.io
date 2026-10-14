// QUICK FIGHT ghosts: AI players the arena server seats when not enough people press QUICK FIGHT
// (server/quick.go picks each one's personality, name, seed, skill and loadout, so every browser
// runs the same ghosts). They fight through the ordinary Brain (ai.js) with a style, wrapped in
// the ObjectiveBrain that plays each mode's objective. A ghost's name ends in "*".

import { MOVE_SETS } from '../config.js';
import { GESTURES } from './wire.js';
import { ObjectiveBrain } from './objective.js';

const LIGHT = MOVE_SETS.light;

/** The personalities, as styles for Brain (see PLAIN_STYLE in ai.js). */
export const STYLES = {
  brick: { react: 1.4, block: 2.4, counter: true, aggro: 0.8, retreat: 0.5, think: 1.1 },              // blocks, then hits back
  zippy: { keep: 1.8, runAfter: 0.45, react: 1.2, block: 0.4, aggro: 1.6, think: 0.8 },               // in, hit, out
  rumble: { react: 0.7, block: 0.4, aggro: 1.1, retreat: 0.1, chain: true, think: 1, special: 1 }, // never stops coming
  inkslinger: { keep: 3.3, ranged: true, special: 1.8, block: 0.7, aggro: 0.8 },                       // throws from range
  sneak: { lurk: true, react: 1.1, block: 1.2, aggro: 0.9 },                              // waits, then picks off
};
export const NAMED = Object.keys(STYLES);

/** mulberry32: the same numbers for the same seed in every browser. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * RANDOM changes style every 12-25 s. The schedule is a pure function of its seed and the match
 * clock, so a new master after a hand-over picks up the very same style.
 */
export function styleAt(seed, t) {
  const r = rng(seed);
  let at = 0, cur = NAMED[Math.floor(r() * NAMED.length)];
  for (let i = 0; i < 200; i++) {
    at += 12 + r() * 13;
    if (t < at) return cur;
    let next = NAMED[Math.floor(r() * (NAMED.length - 1))];
    if (next === cur) next = NAMED[NAMED.length - 1];
    cur = next;
  }
  return cur;
}

/** The move ids a ghost's loadout (gesture slots) gives it. */
export const movesOf = (lo) => LIGHT.filter((m) => (lo || [0]).includes(GESTURES.indexOf(m.gesture))).map((m) => m.id);

/** A ghost's brain: its personality's style (or RANDOM's current one) on an ObjectiveBrain. */
export class GhostBrain {
  constructor(f, ghost, save) {
    this.f = f;
    this.g = ghost;
    const skill = Math.max(0.3, Math.min(0.9, +ghost.skill || 0.55));
    this.style = ghost.pers === 'random' ? styleAt(ghost.seed | 0, 0) : STYLES[ghost.pers] ? ghost.pers : 'rumble';
    this.ob = new ObjectiveBrain(f, skill, movesOf(ghost.lo), save, { style: STYLES[this.style] });
  }

  update(dt, m) {
    if (this.g.pers === 'random') {
      const s = styleAt(this.g.seed | 0, m.time);
      if (s !== this.style) { this.style = s; this.ob.setStyle(STYLES[s]); }
    }
    this.ob.update(dt, m);
  }
}

/** Ghost seats after the people's: what NetFight and LocalFight put in the match. */
export const ghostSeats = (ghosts) => (ghosts || []).map((g, i) => ({ id: `ghost:${i}`, name: String(g.name || 'Fighter*'), ghost: g }));
