// Bot move choice: opening book, human-like root selection, time management.
// Pure module (no DOM): used by js/bots/worker.js and by tools/core_tourney.mjs.
import { Chess, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, F_CAP, F_EP, F_CASTLE, F_PROMO, F_DOUBLE } from '../chess/chess.js';
import { MATE_BOUND, SEE_VAL } from './engine.js';

// ---- RNG -----------------------------------------------------------------------
export function makeRng(seed = (Math.random() * 2 ** 32) >>> 0) {
  let s = seed >>> 0 || 1;
  const r = () => { // mulberry32
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.gauss = () => { const u = Math.max(1e-9, r()), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  return r;
}

// ---- opening book ---------------------------------------------------------------
// Mainstream lines; bots follow them for `persona.book` plies. Weighted by how often a
// move appears across lines, so popular moves are picked more.
const BOOK_LINES = `
e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3
e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6 Bxc6 dxc6 dxe5 Nf5
e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O
e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Be7 O-O O-O Re1 d6
e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Na5 Bb5+ c6
e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5 Qe7
e4 e5 Nf3 Nc6 Nc3 Nf6 Bb5 Bb4 O-O O-O d3 d6
e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4 d4 d5 Bd3
e4 e5 Nf3 d6 d4 Nf6 Nc3 Nbd7 Bc4 Be7
e4 e5 Nc3 Nf6 f4 d5 fxe5 Nxe4 Nf3
e4 e5 f4 exf4 Nf3 g5 h4 g4 Ne5
e4 e5 d4 exd4 Qxd4 Nc6 Qe3 Nf6 Nc3
e4 e5 Bc4 Nf6 d3 c6 Nf3 d5 Bb3
e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6
e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3 O-O
e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5 Ndb5 d6
e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6 Nc3 Qc7
e4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7 d3 d6
e4 c5 c3 Nf6 e5 Nd5 d4 cxd4 Nf3 Nc6
e4 e6 d4 d5 Nc3 Nf6 Bg5 Be7 e5 Nfd7
e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6
e4 e6 d4 d5 Nd2 Nf6 e5 Nfd7 Bd3 c5
e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6
e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2
e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 c6
e4 Nf6 e5 Nd5 d4 d6 Nf3 Bg4
e4 d6 d4 Nf6 Nc3 g6 Be3 Bg7 Qd2
e4 g6 d4 Bg7 Nc3 d6 Be3 a6
d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3
d4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5
d4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4 c5 O-O a6
d4 d5 c4 e6 Nf3 Nf6 g3 Be7 Bg2 O-O O-O
d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6
d4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4 Nxc3 bxc3 Bg7
d4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5 Nf3
d4 Nf6 c4 e6 Nf3 b6 g3 Bb7 Bg2 Be7 O-O O-O
d4 Nf6 c4 c5 d5 e6 Nc3 exd5 cxd5 d6
d4 Nf6 Nf3 g6 Bf4 Bg7 e3 O-O Be2 d6
d4 d5 Nf3 Nf6 Bf4 e6 e3 c5 c3 Nc6 Nbd2
d4 d5 Bf4 Nf6 e3 c5 c3 Nc6 Nd2 e6 Ngf3
d4 f5 g3 Nf6 Bg2 g6 Nf3 Bg7 O-O O-O
c4 e5 Nc3 Nf6 Nf3 Nc6 g3 d5 cxd5 Nxd5 Bg2
c4 Nf6 Nc3 e6 Nf3 d5 d4 Be7
c4 c5 Nf3 Nc6 Nc3 g6 g3 Bg7 Bg2
Nf3 d5 g3 Nf6 Bg2 g6 O-O Bg7 d3 O-O
Nf3 Nf6 c4 g6 Nc3 Bg7 e4 d6 d4 O-O
`;

let BOOK = null;
const key4 = (fen) => fen.split(' ').slice(0, 4).join(' ');
function buildBook() {
  BOOK = new Map();
  for (const line of BOOK_LINES.trim().split('\n')) {
    const c = new Chess();
    for (const san of line.trim().split(/\s+/)) {
      const k = key4(c.fen());
      const v = c.move(san);
      if (!v) { console.warn('book: bad move', san, 'in', line); break; }
      let e = BOOK.get(k); if (!e) BOOK.set(k, e = new Map());
      e.set(v.lan, (e.get(v.lan) || 0) + 1);
    }
  }
  return BOOK;
}
// returns a LAN move or null
export function bookMove(fen, rng = Math.random) {
  if (!BOOK) buildBook();
  const e = BOOK.get(key4(fen));
  if (!e) return null;
  let tot = 0; for (const w of e.values()) tot += w;
  let x = rng() * tot;
  for (const [m, w] of e) { x -= w; if (x <= 0) return m; }
  return [...e.keys()][0];
}

// ---- time management -------------------------------------------------------------
// soft = target, hard = never exceed. Untimed -> Infinity (bot limits are node based).
export function timeBudget(timeLeftMs, incMs = 0, plyFromStart = 20) {
  if (!timeLeftMs || !isFinite(timeLeftMs)) return { soft: Infinity, hard: Infinity };
  const movesLeft = Math.max(18, 40 - (plyFromStart >> 2));
  let soft = timeLeftMs / movesLeft + incMs * 0.75;
  let hard = Math.min(timeLeftMs * 0.25, soft * 3);
  if (timeLeftMs < 3000) { soft = Math.min(soft, timeLeftMs / 12); hard = Math.min(hard, timeLeftMs / 6); }
  soft = Math.max(20, Math.min(soft, hard));
  return { soft, hard: Math.max(30, hard) };
}

// ---- human-like "natural move" bonus (centipawns, before persona.natural scaling) ----
function naturalBonus(pos, m, ctx) {
  const b = pos.b, from = m & 127, to = (m >> 7) & 127, fl = m >>> 17;
  const p = b[from], t = p & 7, us = pos.side;
  const fullmove = pos.full;
  let v = 0;
  if (fl & F_CAP) {
    const victim = fl & F_EP ? PAWN : b[to] & 7;
    v += SEE_VAL[victim] * 0.06;                 // likes grabbing material
    if (ctx.lastTo === to) v += 25;              // recaptures automatically
  }
  if (fl & F_CASTLE) v += 30;
  if (fl & F_PROMO) v += 40;
  const backRank = us === 0 ? 0 : 7;
  if (fullmove <= 12) {
    if ((t === KNIGHT || t === BISHOP) && (from >> 4) === backRank) v += 18;     // develop
    if (t === PAWN && ((from & 7) === 3 || (from & 7) === 4) && fullmove <= 6) v += 12;
    if (t === QUEEN && fullmove <= 7) v -= 12;
    if (t === KING && !(fl & F_CASTLE)) v -= 25;
    if (t === ROOK && fullmove <= 8) v -= 6;
    if (t === PAWN && ((from & 7) === 0 || (from & 7) === 7)) v -= 8;            // rim pawn pushes
  }
  // checks are attractive
  pos.make(m);
  if (pos.inCheck()) v += 15;
  pos.unmake(m);
  return v;
}

// ---- choose a move -----------------------------------------------------------------
// engine: an Engine with its position already set.
// persona: see js/bots/personas.js. ctx: {timeLeftMs, incMs, rng, lastTo}
// returns {lan, score, depth, nodes, book?:true, blunder?:true}
export function chooseMove(engine, persona, ctx = {}) {
  const pos = engine.pos;
  const rng = ctx.rng || makeRng();
  const fen = pos.fen();
  const plyFromStart = (pos.full - 1) * 2 + pos.side;
  if (persona.book && plyFromStart < persona.book) {
    const bm = bookMove(fen, rng);
    if (bm) return { lan: bm, score: 0, depth: 0, nodes: 0, book: true };
  }
  const tb = timeBudget(ctx.timeLeftMs, ctx.incMs, plyFromStart);
  engine.setEval(persona.evalW || {});
  engine.evalNoise = persona.evalNoise || 0;
  engine.noiseSeed = (rng() * 2 ** 31) | 0;

  if (persona.mode === 'search') {
    const r = engine.search({ maxDepth: persona.depth || 64, nodes: persona.nodes, softMs: tb.soft, hardMs: tb.hard, minDepth: 1 });
    return { lan: r.lan, score: r.score, depth: r.depth, nodes: r.nodes, pv: r.pv, mate: r.mate };
  }

  // human mode: score all root moves shallowly, then pick like a person would
  const scored = engine.scoreRootMoves({ depth: persona.depth, qMax: persona.qMax ?? 99, nodes: persona.nodes || Infinity, hardMs: tb.hard });
  if (!scored.length) return { lan: null, score: 0, depth: 0, nodes: 0 };
  const blunder = rng() < (persona.blunder || 0);
  const nat = persona.natural ?? 1;
  const noise = persona.noise || 0;
  const cand = scored.map((e) => {
    let base = e.score;
    if (blunder && Math.abs(base) < MATE_BOUND) base = engine.shallowScore(e.move);
    // mates are seen in proportion to skill: clamp so noise can still hide them for weak bots
    if (base > MATE_BOUND) base = 2000 + (base - MATE_BOUND) * 0.01; else if (base < -MATE_BOUND) base = -2000;
    return { ...e, v: base + rng.gauss() * noise + naturalBonus(pos, e.move, ctx) * nat };
  });
  cand.sort((a, b) => b.v - a.v);
  let pick = cand[0];
  const T = persona.temp || 0;
  if (T > 0) {
    const top = cand[0].v;
    let tot = 0;
    const ws = cand.map((c) => { const w = Math.exp((c.v - top) / T); tot += w; return w; });
    let x = rng() * tot;
    for (let i = 0; i < cand.length; i++) { x -= ws[i]; if (x <= 0) { pick = cand[i]; break; } }
  }
  return { lan: pick.lan, score: pick.score, depth: persona.depth, nodes: engine.lastNodes, blunder: blunder || undefined };
}
