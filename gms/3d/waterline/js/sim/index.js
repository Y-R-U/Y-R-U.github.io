// The public sim API. Nothing else under js/sim/ is imported from outside this file.
//
// PURE. Zero Three.js, no window, no document, no performance, no Math.random, no Date.now —
// enforced by tools/purity.mjs, which the soak harness runs first. Randomness is the integer
// `rng` field on the game object.
//
// Departures from BUILD_PLAN §2.1, each with a reason:
//   whyIllegal()  replaces legal()   — null when legal was a footgun under the old name (B7)
//   fire()        returns a REDACTED delta; fireRaw() is the harness's (REVIEW_SIM BLOCK-3)
//   aiMove()      is a Game→View adapter living here; ai.js never sees a Game (BLOCK-4)
//   events()      is gone. unredactedEventsForDebugging() is the god view (FIX-6)

import { ORDNANCE } from './tables.js';
import {
  RulesError, UNKNOWN, MISS, HIT, SUNK, PHASES,
  newGame as _newGame, placeFleet as _placeFleet, setBoard as _setBoard,
  view as _viewAs, serialize as _serialize, deserialize as _deserialize,
  fleetLegal as _fleetLegal, cellsOf,
} from './state.js';
import {
  footprint as _footprint, snapTarget as _snapTarget, whyIllegal as _whyIllegal,
  fire as _fire, fireRaw as _fireRaw, anchorDomain, rechargeStep, KINDS,
} from './rules.js';
import { chooseShot as _chooseShot, TIER_NAMES } from './ai.js';
import { hash, makeRng } from './rng.js';
import { clone, redact, redactEvents as _redactEvents } from './events.js';
import { packRows, packedPlacement } from './placement.js';
import * as ladder from './ladder.js';
import * as memory from './memory.js';

export const implemented = true;
export { makeRng };

export { RulesError, UNKNOWN, MISS, HIT, SUNK, PHASES, KINDS, TIER_NAMES, anchorDomain, packRows, packedPlacement, cellsOf };
export const newGame = _newGame;
export const placeFleet = _placeFleet;
export const setBoard = _setBoard;
export const footprint = _footprint;
export const snapTarget = _snapTarget;
export const whyIllegal = _whyIllegal;
export const fire = _fire;
export const fireRaw = _fireRaw;
export const chooseShot = _chooseShot;
// The session viewer, enforced. `view(game, side)` used to take a side and trust it, so
// `view(game, 1)` from a localSide:0 session handed back the AI's exact ship cells — the same
// class of defect D6 called "a contract the presenter can forget", and main.js does hold the Game.
// `viewAs` / `eventsAs` are the named escape hatches, the way `fireRaw` is `fire`'s: a spectator,
// a replay of the other seat, or an AI-vs-AI harness.
export const viewAs = _viewAs;
export function view(game, side) {
  if (side !== game.localSide) {
    throw new RulesError(`view(game, ${side}) from a localSide:${game.localSide} session — use viewAs() if you really mean another side's board`);
  }
  return _viewAs(game, side);
}
export const serialize = _serialize;
export const deserialize = _deserialize;
export const redactEvents = _redactEvents;
// D7 names this export by this name, so it keeps it. whyFleetUnfit is the same function under the
// name that reads correctly at a call site.
export const fleetLegal = _fleetLegal;
export const whyFleetUnfit = _fleetLegal;
export const newLadder = ladder.newLadder;
export const rungConfig = ladder.rungConfig;
export const applyLadderResult = ladder.applyResult;
export const ladderGame = ladder.ladderGame;
export const ladderRungs = ladder.rungs;      // a frozen copy; rungConfig() hands out mutable ones
export const newMemory = memory.newMemory;
export const observeLayout = memory.observeLayout;
export const observeShots = memory.observeShots;
export const placementPrior = memory.placementPrior;
export const shotPrior = memory.shotPrior;
export const memoryGames = memory.memoryGames;
// HANDOFF_SIM §3 listed this as public and it never was, so C7 shipped a drop-and-retry around it.
export const memoryProblem = memory.memoryProblem;

const startEvent = (game, viewer) => ({
  t: 'start',
  viewer: viewer ?? null,
  side: viewer ?? null,
  w: game.w, h: game.h,
  fleet: [...game.fleet],
  first: game.firstMove,
  ordnance: viewer == null ? null : { ...game.players[viewer].ordnanceStart },
});

// The god view. Named at length because the name is the guard rail: this returns both fleets'
// exact placements and every enemy shipId, and nothing but the harness may consume it.
export function unredactedEventsForDebugging(game) {
  return [startEvent(game, null), ...game.log.map(clone)];
}

// The renderer's channel. Redaction rule, in full — the same three lines fire() applies:
//   place  — the other side's becomes { side, by, ships: null }: you learn they placed, no more
//   result — a result on the ENEMY's board loses its shipId; you never learn which ship you hit
//   sunk   — kept whole for both sides. Sinking a ship is when its cells become known
//   shot / turn / over / start — public
export function eventsAs(game, side) {
  if (side !== 0 && side !== 1) throw new RulesError('side must be 0 or 1');
  return [startEvent(game, side), ...game.log.map(e => redact(e, side))];
}

export function eventsFor(game, side) {
  if (side !== game.localSide) {
    throw new RulesError(`eventsFor(game, ${side}) from a localSide:${game.localSide} session — use eventsAs() if you really mean another side's stream`);
  }
  return eventsAs(game, side);
}

// Rebuilds a View from a redacted stream, touching no Game. This is the other half of the
// fog-of-war contract: if replay() and view() ever disagree the table and the sea are showing
// different boards. The soak checks it from newGame, after each placeFleet, after every shot and
// after over.
export function replay(evts) {
  const start = evts.find(e => e.t === 'start');
  if (!start || start.viewer == null) throw new RulesError('replay needs a stream from eventsFor(game, side)');
  const side = start.viewer, w = start.w, h = start.h;
  const grid = new Uint8Array(w * h), ownGrid = new Uint8Array(w * h);
  const ordnance = { ...start.ordnance }, ordnanceStart = { ...start.ordnance };
  // The enemy roster does not exist until they place. Inventing it from start.fleet made the
  // placement screen show five intact enemy ships that had not been positioned (BLOCK-5).
  let ships = [], enemyShips = [];
  let ownPlaced = false, enemyPlaced = false;
  let sideToMove = start.first, turns = 0, shots = 0, winner = null;

  for (const e of evts) {
    if (e.t === 'place') {
      if (e.side === side) {
        ownPlaced = true;
        ships = e.ships.map(s => ({ id: s.id, len: s.len, hits: 0, sunk: false, cells: cellsOf(s) }));
      } else {
        enemyPlaced = true;
        enemyShips = start.fleet.map((len, id) => ({ id, len, hits: 0, sunk: false, cells: null }));
      }
    } else if (e.t === 'shot') {
      turns++;
      if (e.by === side) {
        shots++;
        if (ORDNANCE[e.kind].charges) ordnance[e.kind]--;
        rechargeStep(ordnance, ordnanceStart, shots);
      }
    } else if (e.t === 'result') {
      const i = e.r * w + e.c;
      const g = e.at === side ? ownGrid : grid;
      if (g[i] !== UNKNOWN) continue;
      g[i] = e.hit ? HIT : MISS;
      if (e.at === side && e.hit && e.shipId != null) ships[e.shipId].hits++;
    } else if (e.t === 'sunk') {
      const g = e.at === side ? ownGrid : grid;
      for (const { r, c } of e.cells) g[r * w + c] = SUNK;
      if (e.at === side) { ships[e.shipId].sunk = true; ships[e.shipId].hits = e.len; }
      else enemyShips[e.shipId] = { id: e.shipId, len: e.len, hits: e.len, sunk: true, cells: e.cells.map(c => ({ ...c })) };
    } else if (e.t === 'turn') sideToMove = e.side;
    else if (e.t === 'over') winner = e.winner;
  }

  const phase = winner !== null ? 'OVER'
    : ownPlaced && enemyPlaced ? 'AIM'
      : ownPlaced || enemyPlaced ? 'PLACING' : 'SETUP';

  const v = {
    w, h, side, grid, ownGrid, ships, enemyShips,
    fleet: [...start.fleet],
    ordnance, ordnanceStart, shots, sideToMove, turns, phase, winner,
  };
  return v;
}

// The Game→View adapter. This is the whole of the AI's access to the game: a View, a tier, two
// integers derived from game.aiSeed (which is NOT the layout seed), and a learned prior.
export function aiMove(game, side) {
  if (side !== 0 && side !== 1) throw new RulesError('side must be 0 or 1');
  const tier = game.players[side].tier;
  if (tier == null) throw new RulesError('that side has no AI tier');
  return _chooseShot(_viewAs(game, side), tier, {
    turn: hash(game.aiSeed, game.turns, side, 0x51ed),
    match: hash(game.aiSeed, side, 0xa7c1),
  }, { prior: game.players[side].prior ?? null });   // derived at newGame, never caller-supplied
}

// Headless drive. `game` may be null — main.js's frozen ?seed/?turn hook calls it that way — in
// which case a game is created from opts and returned. Both fleets are auto-placed if needed.
export function autoplay(game, turns = 0, opts = {}) {
  let g = game;
  if (!g) {
    g = _newGame({
      w: opts.w, h: opts.h, fleet: opts.fleet, seed: opts.seed,
      tiers: opts.tiers ?? [2, 2], first: opts.first, ordnance: opts.ordnance,
      layoutSeed: opts.layoutSeed, localSide: opts.localSide, memories: opts.memories,
    });
  }
  if (g.phase === 'SETUP' || g.phase === 'PLACING') {
    if (!g.players[0].ships.length) _placeFleet(g, 0, null);
    if (!g.players[1].ships.length) _placeFleet(g, 1, null);
  }
  for (let i = 0; i < turns && g.phase === 'AIM'; i++) {
    const side = g.sideToMove;
    _fireRaw(g, side, aiMove(g, side));
  }
  return g;
}

// Everything a side is entitled to know about the loser's fleet once a match is over — the input
// to observeLayout(). Returns null while the match is still running, because until then the
// layout is exactly what the fog rule is hiding.
export function revealedLayout(game, side) {
  if (game.phase !== 'OVER') return null;
  return game.players[side].ships.map(s => ({ id: s.id, len: s.len, cells: s.cells.map(c => ({ ...c })) }));
}

// Every cell a side fired at, in order. Public information — it is their own shot history — and
// the input to observeShots().
export function shotHistory(game, side) {
  const out = [];
  for (const e of game.log) if (e.t === 'shot' && e.by === side) for (const c of e.cells) out.push({ r: c.r, c: c.c });
  return out;
}
