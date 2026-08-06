import { ORDNANCE, BOARD } from './tables.js';
import { hash, mix32 } from './rng.js';
import { UNKNOWN, MISS, HIT, SUNK, PHASES, RulesError } from './consts.js';
import { cellsOf, fleetLegal, randomPlacement, validatePlacements, coverageMap } from './placement.js';
import { placementPrior, shotPrior, memoryProblem } from './memory.js';

export { UNKNOWN, MISS, HIT, SUNK, PHASES, RulesError };

export function nextFloat(game) {
  game.rng = (game.rng + 0x6d2b79f5) | 0;
  return mix32(game.rng) / 4294967296;
}

export function gameRng(game) {
  return {
    float: () => nextFloat(game),
    int: n => Math.floor(nextFloat(game) * n),
    pick: arr => arr[Math.floor(nextFloat(game) * arr.length)],
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(nextFloat(game) * (i + 1));
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    },
  };
}

// Ordnance is symmetric. The 1.5x grant tier 4 used to get was an AI-tuning knob that had leaked
// into the ruleset, and on ladder rung 8 it pointed one way only — the AI's — on the one rung that
// completes the campaign. Both sides always start from the same table.
function startCharges(fleetCells, override, w, h) {
  const out = {};
  for (const k of Object.keys(ORDNANCE)) out[k] = ORDNANCE[k].charges ? ORDNANCE[k].charges(fleetCells) : 0;
  if (override === false || override === 0) { for (const k of Object.keys(out)) out[k] = 0; return out; }
  if (override != null) {
    if (typeof override !== 'object') throw new RulesError('ordnance must be false or an object of charge counts');
    for (const [k, val] of Object.entries(override)) {
      if (!(k in out)) throw new RulesError(`unknown ordnance '${k}'`);
      if (val === false) { out[k] = 0; continue; }
      if (!Number.isInteger(val) || val < 0 || val > w * h) throw new RulesError(`${k} charges must be a whole number in [0, ${w * h}]`);
      out[k] = val;
    }
  }
  return out;
}

const TIERS = [null, 0, 1, 2, 3, 4];

// `prior` (where to aim) and `hide` (where not to park) are DERIVED, never supplied. Both are
// recomputed from the memory in deserialize, so a hand-edited save cannot inject either.
function derivedMaps(w, h, fleet, tier, memory) {
  if (tier !== 4) return { prior: null, hide: null };
  return { prior: placementPrior(memory, w, h, fleet), hide: shotPrior(memory, w, h) };
}

const NEW_GAME_KEYS = ['w', 'h', 'fleet', 'seed', 'layoutSeed', 'tiers', 'first', 'localSide', 'ordnance', 'memories'];

export function newGame(opts = {}) {
  if (!opts || typeof opts !== 'object') throw new RulesError('newGame takes an options object');
  // Strict about the key set so a removed option fails loudly. `priors`/`hide` used to be accepted
  // here as raw per-cell arrays, which was a channel straight past every blindness guard; anyone
  // porting code that still passes them should hear about it rather than silently get a flat AI.
  for (const k of Object.keys(opts)) if (!NEW_GAME_KEYS.includes(k)) throw new RulesError(`newGame does not take '${k}'`);
  const w = opts.w ?? 10, h = opts.h ?? 10;
  const fleet = opts.fleet ?? [5, 4, 3, 3, 2];
  const why = fleetLegal(w, h, fleet);
  if (why) throw new RulesError(why);

  if (opts.seed !== undefined && !Number.isInteger(opts.seed)) throw new RulesError('seed must be a whole number');
  const seed = opts.seed ?? 1;
  if (opts.first !== undefined && opts.first !== 0 && opts.first !== 1) throw new RulesError('first must be 0 or 1');
  const firstMove = opts.first ?? 0;
  // Who is watching. fire() redacts its delta for this side, so a presenter cannot leak by
  // forgetting an argument. 0 is the human in single player (BUILD_PLAN §2.1); a multiplayer
  // client on the far end sets 1 once, at newGame, and never thinks about it again.
  if (opts.localSide !== undefined && opts.localSide !== 0 && opts.localSide !== 1) throw new RulesError('localSide must be 0 or 1');
  const localSide = opts.localSide ?? 0;
  const tiers = opts.tiers ?? [null, 2];
  if (!Array.isArray(tiers) || tiers.length !== 2) throw new RulesError('tiers must be [side0, side1]');
  for (const t of tiers) if (!TIERS.includes(t ?? null)) throw new RulesError('tier must be null or 0..4');

  // REQUIRED, never defaulted (DECISIONS D8). `?seed=` is public — it ships in the URL — so any
  // layout derived from it is readable by whoever holds the link; when this defaulted to
  // hash(seed, …) the enemy fleet was reproducible on 300/300 games, and so was tier 4's hidden
  // one. The sim has no clock and no Math.random, so it genuinely cannot draw its own entropy,
  // which is exactly why the caller must be forced to rather than trusted to. layoutSeed is
  // never stored: only its evolved state is.
  if (!Number.isInteger(opts.layoutSeed)) {
    throw new RulesError('layoutSeed is required and must be a whole number — the fleet layout must not be derivable from the public seed (D8)');
  }
  const layoutSeed = opts.layoutSeed;
  const cells = fleet.reduce((a, b) => a + b, 0);
  // A Memory, not a raw array. `newGame({ priors: [...] })` used to accept an arbitrary per-cell
  // multiplier, which is a channel straight past every blindness guard: a prior that one-hots the
  // enemy layout took tier 4 from 45.9 shots to 17.5 with ai.js byte-identical. What a caller may
  // hand over now is a count of things it has already been shown, and the influence of those
  // counts is bounded inside placementPrior().
  const memories = opts.memories ?? [null, null];
  if (!Array.isArray(memories) || memories.length !== 2) throw new RulesError('memories must be [side0, side1]');
  for (const m of memories) {
    const bad = m == null ? null : memoryProblem(m);
    if (bad) throw new RulesError(bad);
  }

  return {
    v: 1, w, h,
    fleet: [...fleet],
    seed,
    aiSeed: hash(seed, 0x0a1c0de),
    rng: hash(layoutSeed, w * 31 + h, cells),
    tiers: [tiers[0] ?? null, tiers[1] ?? null],
    firstMove,
    localSide,
    sideToMove: firstMove,
    turns: 0,
    phase: 'SETUP',
    winner: null,
    log: [],
    players: [0, 1].map(side => ({
      side,
      tier: tiers[side] ?? null,
      ships: [],
      board: new Array(w * h).fill(UNKNOWN),
      owner: new Array(w * h).fill(-1),
      charges: startCharges(cells, opts.ordnance, w, h),
      ordnanceStart: startCharges(cells, opts.ordnance, w, h),
      memory: memories[side] ?? null,
      ...derivedMaps(w, h, fleet, tiers[side] ?? null, memories[side] ?? null),
      shots: 0,
    })),
  };
}

function installShips(game, side, placements) {
  const p = game.players[side];
  p.ships = placements.map((pl, id) => {
    const len = pl.len ?? game.fleet[id];
    const ship = { id, len, r: pl.r, c: pl.c, dir: pl.dir, cells: cellsOf({ ...pl, len }), hits: 0, sunk: false };
    for (const { r, c } of ship.cells) p.owner[r * game.w + c] = id;
    return ship;
  });
}

// Only tier 4 hides. Half of the map is static — where a placement-counting opponent looks first,
// which is every tier from 2 up and most humans — and half is `shotPrior`, where THIS opponent has
// actually been shooting, which arrives from the tournament's memory via newGame({ hide }).
function avoidMap(game, side) {
  if (game.players[side].tier !== 4) return null;
  const base = coverageMap(game.w, game.h, game.fleet);
  const hide = game.players[side].hide;
  if (!hide) return base;
  return base.map((x, i) => x + 2 * hide[i]);
}

const placeEvent = (game, side) => ({
  t: 'place', side, by: side,
  ships: game.players[side].ships.map(s => ({ id: s.id, len: s.len, r: s.r, c: s.c, dir: s.dir })),
});

export function placeFleet(game, side, placements) {
  if (side !== 0 && side !== 1) throw new RulesError('side must be 0 or 1');
  if (game.phase !== 'SETUP' && game.phase !== 'PLACING') throw new RulesError('fleets are already placed');
  const p = game.players[side];
  if (p.ships.length) throw new RulesError('that side has already placed');

  const list = placements ?? randomPlacement(gameRng(game), game.w, game.h, game.fleet, avoidMap(game, side));
  const why = validatePlacements(game.w, game.h, game.fleet, list);
  if (why) throw new RulesError(why);

  installShips(game, side, list);
  game.phase = game.players.every(q => q.ships.length) ? 'AIM' : 'PLACING';
  const ev = placeEvent(game, side);
  game.log.push(ev);
  return [ev];
}

// Force an exact layout, for framing a shot on the same board every round. Only legal before the
// match starts: rewriting the `place` event once anyone is aiming would retroactively falsify a
// stream a renderer may already be holding.
export function setBoard(game, side, ships) {
  if (side !== 0 && side !== 1) throw new RulesError('side must be 0 or 1');
  if (game.phase !== 'SETUP' && game.phase !== 'PLACING') throw new RulesError('setBoard after the match has started');
  const p = game.players[side];
  if (p.board.some(v => v !== UNKNOWN)) throw new RulesError('setBoard after that side has been fired on');
  const why = validatePlacements(game.w, game.h, game.fleet, ships);
  if (why) throw new RulesError(why);

  p.owner.fill(-1);
  installShips(game, side, ships);
  const ev = placeEvent(game, side);
  const at = game.log.findIndex(e => e.t === 'place' && e.side === side);
  if (at >= 0) game.log[at] = ev; else game.log.push(ev);
  game.phase = game.players.every(q => q.ships.length) ? 'AIM' : 'PLACING';
  return [ev];
}

const shipView = s => ({ id: s.id, len: s.len, hits: s.hits, sunk: s.sunk, cells: s.cells.map(c => ({ ...c })) });

// The fog-of-war rule, stated once (DECISIONS D6): an enemy ShipView carries no cells and no hit
// count until it sinks. `board` is public by construction — it only ever holds resolved cells.
const enemyShipView = s => (s.sunk
  ? { id: s.id, len: s.len, hits: s.len, sunk: true, cells: s.cells.map(c => ({ ...c })) }
  : { id: s.id, len: s.len, hits: 0, sunk: false, cells: null });

export function view(game, side) {
  if (side !== 0 && side !== 1) throw new RulesError('side must be 0 or 1');
  const me = game.players[side], them = game.players[1 - side];
  const v = {
    w: game.w, h: game.h, side,
    grid: Uint8Array.from(them.board),
    ownGrid: Uint8Array.from(me.board),
    ships: me.ships.map(shipView),
    enemyShips: them.ships.map(enemyShipView),
    fleet: [...game.fleet],
    ordnance: { ...me.charges },
    ordnanceStart: { ...me.ordnanceStart },
    shots: me.shots,
    sideToMove: game.sideToMove,
    turns: game.turns,
    phase: game.phase,
    winner: game.winner,
  };
  return v;
}

export function serialize(game) {
  return JSON.stringify(game);
}

const isIntIn = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;

// Structural, because save.js loads this straight out of localStorage (D3). A truncated write or
// a hand-edited save must fail as a catchable RulesError, not as a TypeError three frames later
// inside a renderer — and `w` edited to 99 on a 100-cell board must not quietly keep playing.
export function deserialize(str) {
  let g;
  if (typeof str === 'string') {
    try { g = JSON.parse(str); } catch { throw new RulesError('corrupt save: not JSON'); }
  } else if (str && typeof str === 'object') {
    g = JSON.parse(JSON.stringify(str));           // a copy — never an alias to the caller's object
  } else throw new RulesError('corrupt save: not an object');

  const bad = why => { throw new RulesError(`corrupt save: ${why}`); };
  if (g === null || typeof g !== 'object' || Array.isArray(g)) bad('not an object');
  if (g.v !== 1) bad('unknown save version');
  // Strict about the key set, not just the values: a stray property is a save written by
  // something that is not this sim, and playing on with it is how a rename gets silently ignored.
  const GAME_KEYS = ['v', 'w', 'h', 'fleet', 'seed', 'aiSeed', 'rng', 'tiers', 'firstMove', 'localSide',
    'sideToMove', 'turns', 'phase', 'winner', 'log', 'players'];
  const PLAYER_KEYS = ['side', 'tier', 'ships', 'board', 'owner', 'charges', 'ordnanceStart', 'memory', 'prior', 'hide', 'shots'];
  for (const k of Object.keys(g)) if (!GAME_KEYS.includes(k)) bad(`unexpected field '${k}'`);
  for (const k of GAME_KEYS) if (!(k in g)) bad(`missing field '${k}'`);
  if (g.localSide !== 0 && g.localSide !== 1) bad('localSide must be 0 or 1');
  if (!isIntIn(g.w, BOARD.min, BOARD.max) || !isIntIn(g.h, BOARD.min, BOARD.max)) bad('grid size out of range');
  const n = g.w * g.h;
  if (!Array.isArray(g.fleet) || !g.fleet.length || g.fleet.some(l => !isIntIn(l, 1, Math.min(g.w, g.h)))) bad('bad fleet');
  if (!Number.isInteger(g.seed) || !Number.isInteger(g.aiSeed) || !Number.isInteger(g.rng)) bad('bad rng state');
  if (!PHASES.includes(g.phase)) bad('unknown phase');
  if (g.sideToMove !== 0 && g.sideToMove !== 1) bad('sideToMove must be 0 or 1');
  if (g.firstMove !== 0 && g.firstMove !== 1) bad('firstMove must be 0 or 1');
  if (!Number.isInteger(g.turns) || g.turns < 0) bad('bad turn count');
  if (g.winner !== null && g.winner !== 0 && g.winner !== 1) bad('bad winner');
  if ((g.phase === 'OVER') !== (g.winner !== null)) bad('winner and phase disagree');
  const EVENTS = ['place', 'shot', 'result', 'sunk', 'turn', 'over'];
  if (!Array.isArray(g.log)) bad('bad event log');
  for (const e of g.log) if (!e || typeof e !== 'object' || !EVENTS.includes(e.t)) bad('unknown event in the log');
  if (!Array.isArray(g.tiers) || g.tiers.length !== 2 || g.tiers.some(t => !TIERS.includes(t ?? null))) bad('bad tiers');
  if (!Array.isArray(g.players) || g.players.length !== 2) bad('bad players');

  g.players.forEach((p, side) => {
    if (!p || typeof p !== 'object') bad('bad player');
    for (const k of Object.keys(p)) if (!PLAYER_KEYS.includes(k)) bad(`unexpected player field '${k}'`);
    for (const k of PLAYER_KEYS) if (!(k in p)) bad(`missing player field '${k}'`);
    if (p.side !== side) bad('a player is filed under the wrong side');
    if (!TIERS.includes(p.tier ?? null) || (p.tier ?? null) !== (g.tiers[side] ?? null)) bad('bad player tier');
    if (p.memory != null) { const why = memoryProblem(p.memory); if (why) bad(why); }
    // prior and hide are DERIVED, so a save does not get to state them. Recomputing rather than
    // validating is what closes the channel: a hand-edited one-hot prior takes tier 4 from 45.9
    // shots to 17.5, and no amount of range-checking an arbitrary array would catch that.
    Object.assign(p, derivedMaps(g.w, g.h, g.fleet, p.tier ?? null, p.memory ?? null));
    if (!Array.isArray(p.board) || p.board.length !== n) bad('board size does not match the grid');
    if (!Array.isArray(p.owner) || p.owner.length !== n) bad('owner map does not match the grid');
    if (p.board.some(x => !isIntIn(x, UNKNOWN, SUNK))) bad('bad board value');
    if (!Number.isInteger(p.shots) || p.shots < 0) bad('bad shot count');
    if (!p.charges || !p.ordnanceStart) bad('missing ordnance ledger');
    for (const k of Object.keys(ORDNANCE)) {
      if (!isIntIn(p.ordnanceStart[k], 0, n)) bad('bad starting ordnance');
      if (!isIntIn(p.charges[k], 0, p.ordnanceStart[k])) bad('ordnance charges out of range');
    }
    if (!Array.isArray(p.ships)) bad('bad ship list');
    if (p.ships.length && p.ships.length !== g.fleet.length) bad('ship count does not match the fleet');
    const seen = new Uint8Array(n);
    p.ships.forEach((s, i) => {
      if (s.id !== i || s.len !== g.fleet[i]) bad('ship does not match its fleet slot');
      if (!Array.isArray(s.cells) || s.cells.length !== s.len) bad('ship cell list is the wrong length');
      const cells = cellsOf({ r: s.r, c: s.c, len: s.len, dir: s.dir });
      cells.forEach((c, j) => {
        if (c.r < 0 || c.c < 0 || c.r >= g.h || c.c >= g.w) bad('ship is off the board');
        if (s.cells[j].r !== c.r || s.cells[j].c !== c.c) bad('ship cells disagree with its position');
        if (seen[c.r * g.w + c.c]) bad('ships overlap');
        seen[c.r * g.w + c.c] = 1;
        if (p.owner[c.r * g.w + c.c] !== s.id) bad('owner map disagrees with the ships');
      });
      const struck = cells.filter(c => p.board[c.r * g.w + c.c] === HIT || p.board[c.r * g.w + c.c] === SUNK).length;
      if (s.hits !== struck) bad('ship hit count disagrees with the board');
      if (s.sunk !== (s.hits === s.len)) bad('sunk flag disagrees with the hit count');
    });
    if (p.ships.length) for (let i = 0; i < n; i++) {
      if (p.owner[i] >= 0 && !seen[i]) bad('owner map claims a cell no ship occupies');
      if ((p.board[i] === HIT || p.board[i] === SUNK) && p.owner[i] < 0) bad('a hit landed where there is no ship');
      if (p.board[i] === MISS && p.owner[i] >= 0) bad('a miss landed on a ship');
    }
  });
  if (g.phase === 'OVER' && !g.players[1 - g.winner].ships.every(s => s.sunk)) bad('the match is over with the loser still afloat');
  if (g.phase === 'AIM' && !g.players.every(p => p.ships.length)) bad('aiming before both fleets are placed');
  return g;
}

export { fleetLegal, cellsOf };
