// GAMBIT puzzles — pure logic (no DOM). Used by the puzzle screen, the build tool
// (tools/puzzles_build.mjs) and the validator (tools/puzzles_test.mjs).
//
// Shipped puzzle record (assets/puzzles/<region>.json):
//   { id, fen, m, r, th, g?, n?, st?, pf? }
//   fen  position BEFORE the first move in `m`
//   m    space-separated LAN moves. Lichess convention: m[0] is the opponent's setup move,
//        then player / opponent alternate and the line ends on a player move.
//        With pf:1 (classic problems) there is no setup move: m[0] is already the player's.
//   r    puzzle rating, th themes (space separated, Lichess names), g Lichess game path,
//        n name + st story (classics only).
import { Chess } from '../chess/chess.js';

export const lanOf = m => m.from + m.to + (m.promotion || '');

export function mateIn(p) {
  const t = ' ' + (p.th || '') + ' ';
  const m = t.match(/ mateIn(\d) /);
  if (m) return +m[1];
  return / mate /.test(t) ? playerMoveCount(p) : 0;
}
export function playerMoveCount(p) {
  const n = p.m.trim().split(/\s+/).length - (p.pf ? 0 : 1);
  return Math.ceil(n / 2);
}
export function goalText(p) {
  const n = mateIn(p);
  if (n === 1) return 'Mate in 1';
  if (n) return `Mate in ${n}`;
  const t = p.th || '';
  if (/\bequality\b/.test(t)) return 'Find the saving line';
  if (/\bendgame\b/.test(t) && playerMoveCount(p) > 2) return 'Win the endgame';
  return playerMoveCount(p) === 1 ? 'Find the best move' : `Win material · ${playerMoveCount(p)} moves`;
}

/**
 * A running puzzle: start(), then for each player move call tryMove().
 * Correct = the line's move, or ANY move that gives checkmate (chess.com / Lichess behaviour).
 */
export class PuzzleRun {
  constructor(p) {
    this.p = p;
    this.line = p.m.trim().split(/\s+/);
    this.chess = new Chess(p.fen);
    this.setup = null;           // verbose setup move (opponent), null for pf puzzles
    this.i = 0;                  // index into line of the move expected next
    this.done = false;
    this.player = null;
  }
  /** Applies the opponent's setup move (if any). Returns it (verbose) or null. */
  start() {
    if (!this.p.pf) {
      this.setup = this.chess.move(this.line[0]);
      if (!this.setup) throw new Error(`puzzle ${this.p.id}: bad setup move ${this.line[0]}`);
      this.i = 1;
    }
    this.player = this.chess.turn();
    return this.setup;
  }
  get startFen() { return this.p.fen; }
  expected() { return this.done ? null : this.line[this.i]; }
  /** -> {ok:false} | {ok:true, move, reply?:verbose, done:boolean, alt:boolean} */
  tryMove({ from, to, promotion }) {
    if (this.done) return { ok: false };
    const exp = this.line[this.i];
    const legal = this.chess.moves({ square: from, verbose: true }).filter(m => m.to === to);
    if (!legal.length) return { ok: false, illegal: true };
    const pick = legal.find(m => (m.promotion || '') === (promotion || '')) ||
      legal.find(m => m.promotion === (exp && exp[4])) || legal[0];
    const lan = lanOf(pick);
    const mv = this.chess.move(lan);
    const mates = this.chess.isCheckmate();
    if (lan !== exp && !mates) { this.chess.undo(); return { ok: false, move: pick }; }
    this.i++;
    if (mates || this.i >= this.line.length) { this.done = true; return { ok: true, move: mv, done: true, alt: lan !== exp, mate: mates }; }
    const reply = this.chess.move(this.line[this.i]);
    if (!reply) throw new Error(`puzzle ${this.p.id}: bad reply ${this.line[this.i]}`);
    this.i++;
    return { ok: true, move: mv, reply, done: false, alt: false };
  }
  /** Plays the expected move (solution reveal). Same shape as tryMove. */
  playExpected() {
    const e = this.expected(); if (!e) return { ok: false };
    return this.tryMove({ from: e.slice(0, 2), to: e.slice(2, 4), promotion: e[4] });
  }
}

/**
 * Full validation of one shipped puzzle with the core rules.
 * opts.solveMate: optional (fen, n) -> {solutions, shortest, unique, complete}; when given,
 * mate-in-N puzzles (N <= opts.maxSolve, default 3) must be forced, and the first
 * player move must be a solution. Returns {ok, errors[], info}.
 */
export function validatePuzzle(p, opts = {}) {
  const errors = [], info = {};
  const need = (c, msg) => { if (!c) errors.push(msg); };
  need(typeof p.id === 'string' && p.id.length, 'missing id');
  need(typeof p.fen === 'string', 'missing fen');
  need(typeof p.m === 'string' && p.m.trim(), 'missing moves');
  need(Number.isFinite(p.r), 'missing rating');
  if (errors.length) return { ok: false, errors, info };
  let c;
  try { c = new Chess(p.fen); } catch (e) { return { ok: false, errors: ['bad fen: ' + e.message], info }; }
  if (c.fen().split(' ').slice(0, 4).join(' ') !== p.fen.split(' ').slice(0, 4).join(' ')) errors.push('fen does not round-trip');
  const line = p.m.trim().split(/\s+/);
  const firstPlayer = p.pf ? 0 : 1;
  need(line.length > firstPlayer, 'no player move');
  need((line.length - firstPlayer) % 2 === 1, 'line must end on a player move');
  let startFen = null, player = null;
  for (let i = 0; i < line.length; i++) {
    if (i === firstPlayer) { startFen = c.fen(); player = c.turn(); }
    const mv = c.move(line[i]);
    if (!mv) { errors.push(`illegal move ${i}: ${line[i]} in ${c.fen()}`); break; }
    if (i >= firstPlayer && i < line.length - 1 && c.isGameOver()) { errors.push(`game over before the line ends (move ${i})`); break; }
  }
  info.player = player; info.startFen = startFen; info.finalMate = c.isCheckmate();
  const n = mateIn(p);
  info.mateIn = n;
  if (n && !errors.length) {
    need(c.isCheckmate(), 'mate puzzle does not end in checkmate');
    need(playerMoveCount(p) === n, `mateIn${n} but ${playerMoveCount(p)} player moves`);
    if (opts.solveMate && n <= (opts.maxSolve ?? 3)) {
      const r = opts.solveMate(startFen, n);
      info.solve = { solutions: r.solutions, shortest: r.shortest, unique: r.unique, complete: r.complete };
      need(r.complete, 'solver incomplete');
      need(r.solutions.includes(line[firstPlayer]), `key ${line[firstPlayer]} not a forced mate in ${n} (solver: ${r.solutions.join(',') || 'none'})`);
      need(r.shortest === n, `shortest mate is ${r.shortest}, not ${n}`);
      if (n >= 2 && !opts.allowDuals) need(r.unique, `not unique: ${r.solutions.join(',')}`);
    }
  }
  return { ok: !errors.length, errors, info };
}

// ---------- rating (simple Elo vs the puzzle's rating) ----------
export const RATING_START = 800;
export function eloUpdate(rating, n, puzzleRating, score) {
  const k = n < 10 ? 40 : n < 30 ? 32 : 20;
  const exp = 1 / (1 + Math.pow(10, (puzzleRating - rating) / 400));
  return Math.max(100, Math.round(rating + k * (score - exp)));
}
