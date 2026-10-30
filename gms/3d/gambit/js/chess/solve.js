// Puzzle helpers: exact mate-in-N solver and a "is the best move clearly unique" check.
// Pure module (works in node and in the bot worker).
//
//   solveMate(fen, n)  -> {solutions:[lan], shortest, unique, pv:[lan], duals:[...], nodes, complete}
//       solutions = every first move that forces mate in <= n moves (n = attacker moves).
//       unique    = exactly one such first move.
//       pv        = a main line (attacker moves are the fastest mates, defender the longest resistance).
//       duals     = along every defender reply of the main line, attacker positions where more
//                   than one move keeps a forced mate within the remaining moves (classic "dual").
//                   (Only the final mating move is exempt, as usual for problems.)
//       complete  = false if maxNodes was hit (then results are not trustworthy).
//   isMateIn(fen, n) -> boolean
//   checkUnique(fen, {ms, margin}) -> {best, bestScore, second, secondScore, gap, unique}
//       for tactics puzzles: best move by a deep search, then the best move with it excluded.
import { Position } from './chess.js';
import { Engine, MATE_BOUND } from '../bots/engine.js';

class MateSolver {
  constructor(fen, maxNodes = 5e6) {
    this.pos = new Position(fen);
    this.maxNodes = maxNodes; this.nodes = 0; this.aborted = false;
    this.memo = new Map();
  }
  key(n) { return this.pos.hashLo + ':' + this.pos.hashHi + ':' + n; }

  // moves ordered checks first, then captures
  ordered() {
    const pos = this.pos, ms = pos.legalMoves();
    const sc = ms.map((m) => {
      pos.make(m); const c = pos.inCheck(); pos.unmake(m);
      return (c ? 2 : 0) + ((m >>> 17) & 1 ? 1 : 0);
    });
    return ms.map((m, i) => [m, sc[i]]).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
  }

  // attacker to move: can force mate within n moves?
  win(n) {
    if (n <= 0 || this.aborted) return false;
    if (++this.nodes > this.maxNodes) { this.aborted = true; return false; }
    const k = this.key(n);
    const c = this.memo.get(k);
    if (c !== undefined) return c;
    let res = false;
    for (const m of this.ordered()) {
      if (this.mates(m, n)) { res = true; break; }
      if (this.aborted) break;
    }
    if (!this.aborted) this.memo.set(k, res);
    return res;
  }
  // does attacker move m force mate within n (incl. this move)?
  mates(m, n) {
    const pos = this.pos;
    pos.make(m);
    let ok;
    const replies = pos.legalMoves();
    if (!replies.length) ok = pos.inCheck();           // mate now (stalemate = fail)
    else if (n <= 1) ok = false;
    else if (pos.half >= 100 || pos.repetitions() >= 3) ok = false;
    else {
      ok = true;
      for (const r of replies) {
        pos.make(r);
        const w = this.win(n - 1);
        pos.unmake(r);
        if (!w) { ok = false; break; }
      }
    }
    pos.unmake(m);
    return ok;
  }
  // shortest k <= n with a forced mate, 0 if none
  shortest(n) { for (let k = 1; k <= n; k++) if (this.win(k)) return k; return 0; }
}

export function solveMate(fen, n, { maxNodes = 5e6, checkDuals = true } = {}) {
  const s = new MateSolver(fen, maxNodes);
  const pos = s.pos;
  const solutions = [];
  for (const m of pos.legalMoves()) if (s.mates(m, n)) solutions.push(m);
  const shortest = solutions.length ? s.shortest(n) : 0;
  const lan = (m) => pos.moveToLan(m);
  const out = { solutions: solutions.map(lan), shortest, unique: solutions.length === 1, pv: [], duals: [], nodes: 0, complete: true };
  if (solutions.length) {
    // main line: fastest attacker mate, defender = longest survival
    const made = [];
    let k = shortest;
    while (k >= 1) {
      let best = 0;
      for (const m of pos.legalMoves()) if (s.mates(m, k)) { best = m; break; }
      // prefer a move that mates fastest
      for (let j = 1; j <= k; j++) { const f = pos.legalMoves().find((m) => s.mates(m, j)); if (f) { best = f; break; } }
      if (!best) break;
      out.pv.push(lan(best)); pos.make(best); made.push(best);
      const replies = pos.legalMoves();
      if (!replies.length) break;
      // defender: pick reply that delays mate the longest
      let worst = replies[0], worstLen = -1;
      for (const r of replies) {
        pos.make(r);
        const len = s.shortest(k - 1);
        pos.unmake(r);
        if (len > worstLen) { worstLen = len; worst = r; }
      }
      out.pv.push(lan(worst)); pos.make(worst); made.push(worst);
      k = worstLen;
    }
    for (let i = made.length - 1; i >= 0; i--) pos.unmake(made[i]);
    if (checkDuals && solutions.length === 1 && n >= 2) {
      // walk every defender reply after the key move; attacker positions with >1 winning
      // non-final move within the remaining budget are duals
      const walk = (k, path) => {
        if (k < 2 || s.aborted) return;
        const wins = pos.legalMoves().filter((m) => s.mates(m, k));
        const nonFinal = wins.filter((m) => { pos.make(m); const mateNow = pos.inCheck() && !pos.hasLegalMove(); pos.unmake(m); return !mateNow; });
        const mateNowCount = wins.length - nonFinal.length;
        if (wins.length > 1 && mateNowCount === 0) out.duals.push({ line: path.slice(), moves: wins.map(lan) });
        for (const m of wins.length === 1 ? wins : []) {
          pos.make(m);
          for (const r of pos.legalMoves()) { pos.make(r); walk(k - 1, [...path, lan(m), lan(r)]); pos.unmake(r); }
          pos.unmake(m);
        }
      };
      const key = solutions[0];
      pos.make(key);
      for (const r of pos.legalMoves()) { pos.make(r); walk(n - 1, [lan(key), lan(r)]); pos.unmake(r); }
      pos.unmake(key);
    }
  }
  out.nodes = s.nodes; out.complete = !s.aborted;
  return out;
}

export function isMateIn(fen, n, opts) { return solveMate(fen, n, { ...opts, checkDuals: false }).solutions.length > 0; }

let _eng = null;
export function checkUnique(fen, { ms = 1500, margin = 150, moves = [] } = {}) {
  const e = _eng || (_eng = new Engine({ ttBits: 20 }));
  e.setEval({}); e.evalNoise = 0;
  e.setPosition(fen, moves);
  const a = e.search({ softMs: ms, hardMs: ms * 2 });
  e.excludeRoot = new Set([a.move]);
  const b = e.search({ softMs: ms, hardMs: ms * 2 });
  e.excludeRoot = null;
  const only = e.pos.legalMoves().length === 1;
  const gap = only ? Infinity : a.score - b.score;
  const mateA = Math.abs(a.score) > MATE_BOUND;
  return {
    best: a.lan, bestScore: a.score, bestMate: a.mate, depth: a.depth,
    second: only ? null : b.lan, secondScore: only ? null : b.score,
    gap, unique: only || gap >= margin || (mateA && a.score > 0 && !(b.score > MATE_BOUND)),
  };
}
