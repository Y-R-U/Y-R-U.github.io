// Eight rungs, a ladder not a bracket: a win climbs one, a loss drops one but never below 1, and
// a win on rung 8 completes the campaign. Opponents are named ships, not faces.
//
// The table is HERE and not in config.LADDER, which the sim no longer reads. Two reasons. It needs
// a per-rung ordnance budget, which config.LADDER's shape has no room for; and it is now a
// *measured* curve rather than a list of tier indices — `node sim.mjs --rungs` reprints it, and
// editing a row without re-running that is how a step function comes back. See HANDOFF R8.
//
// `ordnance` is applied to BOTH sides. Difficulty is never a resource handed to one player: the
// old tier-4 1.5x grant made ladder rung 8 lopsided by construction on the one rung that sets
// complete:true.

import { RulesError } from './consts.js';
import { newGame, placeFleet } from './state.js';

const TABLE = [
  { tier: 0, w: 8, h: 8, fleet: [4, 3, 3, 2], ordnance: false, name: 'Tern' },
  { tier: 1, w: 8, h: 8, fleet: [4, 3, 3, 2], ordnance: false, name: 'Harrier' },
  { tier: 1, w: 10, h: 10, fleet: [5, 4, 3, 3, 2], ordnance: false, name: 'Vigilant' },
  { tier: 2, w: 10, h: 10, fleet: [5, 4, 3, 3, 2], ordnance: false, name: 'Kestrel' },
  // Ordnance arrives here, and the board shrinks to keep it survivable: on 8x8 a heavy is a
  // sixteenth of the grid rather than a twenty-fifth, so the turn it buys is worth less.
  { tier: 3, w: 8, h: 8, fleet: [4, 3, 3, 2], ordnance: { heavy: 1, salvo: 0 }, name: 'Resolute' },
  { tier: 3, w: 10, h: 10, fleet: [5, 4, 4, 3, 3, 2], ordnance: { heavy: 1, salvo: 0 }, name: 'Indomitable' },
  { tier: 3, w: 12, h: 12, fleet: [6, 5, 4, 3, 3, 2], ordnance: { heavy: 2, salvo: 1 }, name: 'Wrath of Kanto' },
  { tier: 4, w: 12, h: 12, fleet: [6, 5, 4, 4, 3, 3, 2], ordnance: { heavy: 2, salvo: 1 }, name: 'Ghost of Leyte' },
];

export const TOP = TABLE.length;

const freeze = r => Object.freeze({ ...r, fleet: Object.freeze([...r.fleet]), ordnance: r.ordnance && Object.freeze({ ...r.ordnance }) });

// Frozen, because the export used to be the live module array: one `.fleet.push()` from any
// component poisoned every later ladderGame().
export const rungs = Object.freeze(TABLE.map((r, i) => freeze({ rung: i + 1, ...r })));

export const RUNGS = rungs;

export const newLadder = () => ({ rung: 1, best: 1, wins: 0, losses: 0, complete: false });

export function rungConfig(rung) {
  const i = Math.max(1, Math.min(TOP, rung | 0)) - 1;
  const r = TABLE[i];
  return { rung: i + 1, ...r, fleet: [...r.fleet], ordnance: r.ordnance && { ...r.ordnance } };
}

// Pure: returns a new state, never mutates. save.js decides where it lives (DECISIONS D3).
export function applyResult(state, won) {
  const s = state ?? newLadder();
  const rung = won ? Math.min(TOP, s.rung + 1) : Math.max(1, s.rung - 1);
  return {
    rung,
    best: Math.max(s.best ?? 1, rung),
    wins: (s.wins ?? 0) + (won ? 1 : 0),
    losses: (s.losses ?? 0) + (won ? 0 : 1),
    complete: (s.complete ?? false) || (won && s.rung === TOP),
  };
}

// A ready-to-play Game for a rung. Side 0 is always the human (BUILD_PLAN §2.1).
// `opts.aiMemory` is what makes Ghost worth its name: the layouts this player has already shown.
export function ladderGame(rung, seed, opts = {}) {
  const cfg = rungConfig(rung);
  // Passed straight through, and newGame throws without it (D8). Named here rather than defaulted
  // so the requirement is visible at the one call site C7 will actually write.
  if (!Number.isInteger(opts.layoutSeed)) throw new RulesError('ladderGame needs opts.layoutSeed — see D8');
  if (opts.playerTier !== undefined && opts.playerTier !== null && !(opts.playerTier >= 0 && opts.playerTier <= 4)) {
    throw new RulesError('playerTier must be null or 0..4');
  }
  const g = newGame({
    w: cfg.w, h: cfg.h, fleet: cfg.fleet, seed,
    layoutSeed: opts.layoutSeed,
    tiers: [opts.playerTier ?? null, cfg.tier],
    first: opts.first ?? 0,
    ordnance: cfg.ordnance,
    memories: [null, opts.aiMemory ?? null],
  });
  if (opts.autoPlace !== false) { placeFleet(g, 0, opts.placements ?? null); placeFleet(g, 1, null); }
  return g;
}
