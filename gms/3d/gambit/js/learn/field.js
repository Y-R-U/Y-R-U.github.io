// Learn: the "practice field" for star-collection tasks. One white piece moves alone on a board
// with stars (empty squares to visit), prey (sleeping black pieces it may capture) and blockers
// (its own pieces, which it can't pass or land on). No check, no turns for Black.
// Pure module: used by the lesson player and by tools/learn_test.mjs (BFS solvability proof).
//
//   field = { type:'r'|'b'|'q'|'n'|'k'|'p', sq, blockers:Set, prey:Set, stars:Set }
//   fieldMoves(field) -> [{to, capture, promo}]
//   solveField(field) -> minimum number of moves to collect every star and capture every prey, or -1
//   fieldFromFen(fen, pieceSq, stars) -> field

export const FILES = 'abcdefgh';
const f = s => s.charCodeAt(0) - 97, r = s => s.charCodeAt(1) - 49;
const sq = (x, y) => FILES[x] + (y + 1);
const on = (x, y) => x >= 0 && x < 8 && y >= 0 && y < 8;

const DIRS = {
  r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
  n: [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]],
};
DIRS.q = [...DIRS.r, ...DIRS.b];
DIRS.k = DIRS.q;

/** Moves for the lone piece. `prey` may be a Set of squares still on the board. */
export function fieldMoves({ type, sq: from, blockers, prey }) {
  const out = [], x0 = f(from), y0 = r(from);
  const blocked = s => blockers.has(s), enemy = s => prey.has(s);
  if (type === 'p') {
    const one = on(x0, y0 + 1) && sq(x0, y0 + 1);
    if (one && !blocked(one) && !enemy(one)) {
      out.push({ to: one, capture: false, promo: y0 + 1 === 7 });
      const two = y0 === 1 && sq(x0, y0 + 2);
      if (two && !blocked(two) && !enemy(two)) out.push({ to: two, capture: false, promo: false });
    }
    for (const dx of [-1, 1]) {
      if (!on(x0 + dx, y0 + 1)) continue;
      const t = sq(x0 + dx, y0 + 1);
      if (enemy(t)) out.push({ to: t, capture: true, promo: y0 + 1 === 7 });
    }
    return out;
  }
  const slide = type === 'r' || type === 'b' || type === 'q';
  for (const [dx, dy] of DIRS[type]) {
    let x = x0 + dx, y = y0 + dy;
    while (on(x, y)) {
      const t = sq(x, y);
      if (blocked(t)) break;
      if (enemy(t)) { out.push({ to: t, capture: true }); break; }
      out.push({ to: t, capture: false });
      if (!slide) break;
      x += dx; y += dy;
    }
  }
  return out;
}

/** BFS over (square, piece type, targets left). Returns the minimum moves, or -1 if impossible. */
export function solveField(field, cap = 30) {
  const targets = [...field.stars, ...field.prey];
  const bit = new Map(targets.map((s, i) => [s, 1 << i]));
  const all = (1 << targets.length) - 1;
  const key = (s, t, m) => `${s}${t}${m}`;
  let frontier = [{ sq: field.sq, type: field.type, got: 0 }];
  const seen = new Set([key(field.sq, field.type, 0)]);
  if (!targets.length) return 0;
  for (let depth = 1; depth <= cap && frontier.length; depth++) {
    const next = [];
    for (const st of frontier) {
      const prey = new Set([...field.prey].filter(s => !(st.got & bit.get(s))));
      for (const mv of fieldMoves({ type: st.type, sq: st.sq, blockers: field.blockers, prey })) {
        const got = st.got | (bit.get(mv.to) || 0);
        const type = mv.promo ? 'q' : st.type;
        if (got === all) return depth;
        const k = key(mv.to, type, got);
        if (seen.has(k)) continue;
        seen.add(k); next.push({ sq: mv.to, type, got });
      }
    }
    frontier = next;
  }
  return -1;
}

/** Build a field from a FEN placement: the white piece on pieceSq moves; other white pieces block; black pieces are prey. */
export function fieldFromFen(fen, pieceSq, stars = []) {
  const rows = fen.split(' ')[0].split('/');
  const blockers = new Set(), prey = new Set();
  let type = null;
  rows.forEach((row, i) => {
    let x = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) { x += +ch; continue; }
      const s = sq(x, 7 - i);
      if (s === pieceSq) type = ch.toLowerCase();
      else if (ch === ch.toUpperCase()) blockers.add(s);
      else prey.add(s);
      x++;
    }
  });
  return { type, sq: pieceSq, blockers, prey, stars: new Set(stars) };
}

/** Squares a piece attacks/reaches from `from` on an otherwise empty board (tap tasks: "tap every square the knight reaches"). */
export function reach(type, from, fen = null) {
  const fld = fen ? fieldFromFen(fen, from) : { type, sq: from, blockers: new Set(), prey: new Set() };
  if (type) fld.type = type;
  return fieldMoves(fld).map(m => m.to);
}

/** First move of a shortest route that collects everything (for hints), or null. */
export function fieldHint(field, cap = 30) {
  const targets = [...field.stars, ...field.prey];
  if (!targets.length) return null;
  const bit = new Map(targets.map((s, i) => [s, 1 << i]));
  const all = (1 << targets.length) - 1;
  let frontier = [{ sq: field.sq, type: field.type, got: 0, first: null }];
  const seen = new Set([`${field.sq}${field.type}0`]);
  for (let depth = 1; depth <= cap && frontier.length; depth++) {
    const next = [];
    for (const st of frontier) {
      const prey = new Set([...field.prey].filter(s => !(st.got & bit.get(s))));
      for (const mv of fieldMoves({ type: st.type, sq: st.sq, blockers: field.blockers, prey })) {
        const got = st.got | (bit.get(mv.to) || 0);
        const first = st.first || { from: field.sq, to: mv.to };
        if (got === all) return { ...first, left: depth };
        const type = mv.promo ? 'q' : st.type, k = `${mv.to}${type}${got}`;
        if (seen.has(k)) continue;
        seen.add(k); next.push({ sq: mv.to, type, got, first });
      }
    }
    frontier = next;
  }
  return null;
}
