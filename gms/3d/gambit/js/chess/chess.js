// GAMBIT chess core — rules, FEN, SAN/LAN, PGN, clocks.
// Owner: core. One source of truth for UI, bots and puzzles.
//
// Internals: 0x88 board (Int8Array(128)), integer-encoded moves, make/unmake with an
// undo stack, 64-bit Zobrist hash kept as two int32 halves. `Position` is the fast
// engine-facing class (exported for js/bots and js/chess/solve.js); `Chess` is the
// friendly wrapper with the interface from docs/TEAM_BRIEF.md.

// ---- piece / move encoding -------------------------------------------------
export const WHITE = 0, BLACK = 1;
export const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
// piece code = type | (color << 3); 0 = empty
export const F_CAP = 1, F_EP = 2, F_CASTLE = 4, F_DOUBLE = 8, F_PROMO = 16;
export const mFrom = (m) => m & 127;
export const mTo = (m) => (m >> 7) & 127;
export const mPromo = (m) => (m >> 14) & 7;
export const mFlags = (m) => m >>> 17;
const encode = (from, to, promo, flags) => from | (to << 7) | (promo << 14) | (flags << 17);

const TYPE_CH = ' pnbrqk';
const N_OFF = [33, 31, 18, 14, -33, -31, -18, -14];
const B_OFF = [15, 17, -15, -17];
const R_OFF = [16, -16, 1, -1];
const K_OFF = [15, 16, 17, 1, -1, -15, -16, -17];

export const sqName = (s) => 'abcdefgh'[s & 7] + ((s >> 4) + 1);
export const sqParse = (n) => {
  if (typeof n !== 'string' || n.length !== 2) return -1;
  const f = n.charCodeAt(0) - 97, r = n.charCodeAt(1) - 49;
  return f < 0 || f > 7 || r < 0 || r > 7 ? -1 : r * 16 + f;
};

// castling rights: 1 = white O-O, 2 = white O-O-O, 4 = black O-O, 8 = black O-O-O
const CASTLE_MASK = new Uint8Array(128).fill(15);
CASTLE_MASK[0x00] = 15 & ~2; CASTLE_MASK[0x07] = 15 & ~1; CASTLE_MASK[0x04] = 15 & ~3;
CASTLE_MASK[0x70] = 15 & ~8; CASTLE_MASK[0x77] = 15 & ~4; CASTLE_MASK[0x74] = 15 & ~12;

// ---- Zobrist ---------------------------------------------------------------
let seed = 0x9e3779b9 | 0;
const rnd = () => { // xorshift32, deterministic
  seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0;
};
export const Z_PIECE_LO = new Int32Array(16 * 128), Z_PIECE_HI = new Int32Array(16 * 128);
for (let i = 0; i < 16 * 128; i++) { Z_PIECE_LO[i] = rnd(); Z_PIECE_HI[i] = rnd(); }
const Z_CASTLE_LO = new Int32Array(16), Z_CASTLE_HI = new Int32Array(16);
for (let i = 0; i < 16; i++) { Z_CASTLE_LO[i] = rnd(); Z_CASTLE_HI[i] = rnd(); }
const Z_EP_LO = new Int32Array(8), Z_EP_HI = new Int32Array(8);
for (let i = 0; i < 8; i++) { Z_EP_LO[i] = rnd(); Z_EP_HI[i] = rnd(); }
const Z_SIDE_LO = rnd(), Z_SIDE_HI = rnd();

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// ---- Position: the fast core ------------------------------------------------
export class Position {
  constructor(fen = START_FEN) {
    this.b = new Int8Array(128);
    this.king = new Int32Array(2);
    // undo stack (grows): captured, castling, ep, halfmove, hashLo, hashHi
    this.uCap = []; this.uCastle = []; this.uEp = []; this.uHalf = [];
    // hash history for repetition (index = ply from load)
    this.hLo = []; this.hHi = [];
    this.ply = 0;
    if (!this.load(fen)) throw new Error('Invalid FEN: ' + fen);
  }

  static validateFen(fen) {
    if (typeof fen !== 'string') return 'not a string';
    const parts = fen.trim().split(/\s+/);
    if (parts.length < 4) return 'FEN needs at least 4 fields';
    const rows = parts[0].split('/');
    if (rows.length !== 8) return 'board needs 8 ranks';
    let wk = 0, bk = 0;
    for (let i = 0; i < 8; i++) {
      let n = 0;
      for (const c of rows[i]) {
        if (/[1-8]/.test(c)) n += +c;
        else if (/[pnbrqkPNBRQK]/.test(c)) { n++; if (c === 'K') wk++; if (c === 'k') bk++; if ((c === 'p' || c === 'P') && (i === 0 || i === 7)) return 'pawn on back rank'; }
        else return 'bad board char ' + c;
      }
      if (n !== 8) return 'rank ' + (8 - i) + ' does not have 8 squares';
    }
    if (wk !== 1 || bk !== 1) return 'each side needs exactly one king';
    if (!/^[wb]$/.test(parts[1])) return 'bad side to move';
    if (!/^(-|K?Q?k?q?)$/.test(parts[2]) || parts[2] === '') return 'bad castling field';
    if (!/^(-|[a-h][36])$/.test(parts[3])) return 'bad en-passant field';
    if (parts[4] !== undefined && !/^\d+$/.test(parts[4])) return 'bad halfmove clock';
    if (parts[5] !== undefined && !/^\d+$/.test(parts[5])) return 'bad fullmove number';
    return null;
  }

  load(fen) {
    if (Position.validateFen(fen)) return false;
    const parts = fen.trim().split(/\s+/);
    const b = this.b; b.fill(0);
    const rows = parts[0].split('/');
    for (let i = 0; i < 8; i++) {
      let f = 0; const r = 7 - i;
      for (const c of rows[i]) {
        if (c >= '1' && c <= '8') { f += +c; continue; }
        const lower = c.toLowerCase();
        const t = TYPE_CH.indexOf(lower), col = c === lower ? BLACK : WHITE;
        const s = r * 16 + f;
        b[s] = t | (col << 3);
        if (t === KING) this.king[col] = s;
        f++;
      }
    }
    this.side = parts[1] === 'w' ? WHITE : BLACK;
    let cr = 0;
    if (parts[2].includes('K') && b[0x04] === 6 && b[0x07] === 4) cr |= 1;
    if (parts[2].includes('Q') && b[0x04] === 6 && b[0x00] === 4) cr |= 2;
    if (parts[2].includes('k') && b[0x74] === 14 && b[0x77] === 12) cr |= 4;
    if (parts[2].includes('q') && b[0x74] === 14 && b[0x70] === 12) cr |= 8;
    this.castle = cr;
    this.ep = parts[3] === '-' ? -1 : sqParse(parts[3]);
    this.half = parts[4] ? +parts[4] : 0;
    this.full = parts[5] ? Math.max(1, +parts[5]) : 1;
    this.uCap.length = this.uCastle.length = this.uEp.length = this.uHalf.length = 0;
    this.ply = 0;
    this.computeHash();
    this.hLo.length = this.hHi.length = 0;
    this.hLo.push(this.hashLo); this.hHi.push(this.hashHi);
    return true;
  }

  // ep square counts for the hash only if a pawn of the side to move could take there
  epHashable(ep, side) {
    if (ep < 0) return false;
    const b = this.b;
    if (side === WHITE) { const p = 1; return ((ep - 15) & 0x88) === 0 && b[ep - 15] === p || ((ep - 17) & 0x88) === 0 && b[ep - 17] === p; }
    const p = 9; return ((ep + 15) & 0x88) === 0 && b[ep + 15] === p || ((ep + 17) & 0x88) === 0 && b[ep + 17] === p;
  }

  computeHash() {
    let lo = 0, hi = 0;
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      const p = this.b[s];
      if (p) { lo ^= Z_PIECE_LO[p * 128 + s]; hi ^= Z_PIECE_HI[p * 128 + s]; }
    }
    lo ^= Z_CASTLE_LO[this.castle]; hi ^= Z_CASTLE_HI[this.castle];
    if (this.epHashable(this.ep, this.side)) { lo ^= Z_EP_LO[this.ep & 7]; hi ^= Z_EP_HI[this.ep & 7]; }
    if (this.side === BLACK) { lo ^= Z_SIDE_LO; hi ^= Z_SIDE_HI; }
    this.hashLo = lo; this.hashHi = hi;
  }

  fen() {
    const b = this.b; let out = '';
    for (let r = 7; r >= 0; r--) {
      let e = 0;
      for (let f = 0; f < 8; f++) {
        const p = b[r * 16 + f];
        if (!p) { e++; continue; }
        if (e) { out += e; e = 0; }
        const ch = TYPE_CH[p & 7];
        out += p & 8 ? ch : ch.toUpperCase();
      }
      if (e) out += e;
      if (r) out += '/';
    }
    let cr = '';
    if (this.castle & 1) cr += 'K'; if (this.castle & 2) cr += 'Q';
    if (this.castle & 4) cr += 'k'; if (this.castle & 8) cr += 'q';
    // like most GUIs, only print the ep square when a capture there is pseudo-legal
    const ep = this.epHashable(this.ep, this.side) ? sqName(this.ep) : '-';
    return `${out} ${this.side ? 'b' : 'w'} ${cr || '-'} ${ep} ${this.half} ${this.full}`;
  }

  // Is square s attacked by color `by`?
  attacked(s, by) {
    const b = this.b, c8 = by << 3;
    // pawns
    if (by === WHITE) {
      let t = s - 15; if (!(t & 0x88) && b[t] === 1) return true;
      t = s - 17; if (!(t & 0x88) && b[t] === 1) return true;
    } else {
      let t = s + 15; if (!(t & 0x88) && b[t] === 9) return true;
      t = s + 17; if (!(t & 0x88) && b[t] === 9) return true;
    }
    const kn = KNIGHT | c8, kg = KING | c8, bi = BISHOP | c8, ro = ROOK | c8, qu = QUEEN | c8;
    for (let i = 0; i < 8; i++) { const t = s + N_OFF[i]; if (!(t & 0x88) && b[t] === kn) return true; }
    for (let i = 0; i < 8; i++) { const t = s + K_OFF[i]; if (!(t & 0x88) && b[t] === kg) return true; }
    for (let i = 0; i < 4; i++) {
      const d = B_OFF[i]; let t = s + d;
      while (!(t & 0x88)) { const p = b[t]; if (p) { if (p === bi || p === qu) return true; break; } t += d; }
    }
    for (let i = 0; i < 4; i++) {
      const d = R_OFF[i]; let t = s + d;
      while (!(t & 0x88)) { const p = b[t]; if (p) { if (p === ro || p === qu) return true; break; } t += d; }
    }
    return false;
  }

  inCheck(side = this.side) { return this.attacked(this.king[side], side ^ 1); }

  // Pseudo-legal moves into `list` from index n; returns new length.
  // capsOnly: captures + queen promotions (for quiescence).
  gen(list, n = 0, capsOnly = false) {
    const b = this.b, us = this.side, them = us ^ 1;
    for (let s = 0; s < 120; s++) {
      if (s & 0x88) { s += 7; continue; }
      const p = b[s];
      if (!p || (p >> 3) !== us) continue;
      const t = p & 7;
      if (t === PAWN) {
        const fwd = us === WHITE ? 16 : -16;
        const r = s >> 4;
        const promoRank = us === WHITE ? 6 : 1, startRank = us === WHITE ? 1 : 6;
        const to = s + fwd;
        if (!b[to]) {
          if (r === promoRank) {
            list[n++] = encode(s, to, QUEEN, F_PROMO);
            if (!capsOnly) { list[n++] = encode(s, to, KNIGHT, F_PROMO); list[n++] = encode(s, to, ROOK, F_PROMO); list[n++] = encode(s, to, BISHOP, F_PROMO); }
          } else if (!capsOnly) {
            list[n++] = encode(s, to, 0, 0);
            if (r === startRank && !b[to + fwd]) list[n++] = encode(s, to + fwd, 0, F_DOUBLE);
          }
        }
        for (let k = -1; k <= 1; k += 2) {
          const c = to + k;
          if (c & 0x88) continue;
          const q = b[c];
          if (q && (q >> 3) === them) {
            if (r === promoRank) {
              list[n++] = encode(s, c, QUEEN, F_PROMO | F_CAP);
              if (!capsOnly) { list[n++] = encode(s, c, KNIGHT, F_PROMO | F_CAP); list[n++] = encode(s, c, ROOK, F_PROMO | F_CAP); list[n++] = encode(s, c, BISHOP, F_PROMO | F_CAP); }
            } else list[n++] = encode(s, c, 0, F_CAP);
          } else if (c === this.ep) list[n++] = encode(s, c, 0, F_CAP | F_EP);
        }
      } else if (t === KNIGHT || t === KING) {
        const offs = t === KNIGHT ? N_OFF : K_OFF;
        for (let i = 0; i < 8; i++) {
          const to = s + offs[i];
          if (to & 0x88) continue;
          const q = b[to];
          if (!q) { if (!capsOnly) list[n++] = encode(s, to, 0, 0); }
          else if ((q >> 3) === them) list[n++] = encode(s, to, 0, F_CAP);
        }
        if (t === KING && !capsOnly && this.castle) {
          if (us === WHITE) {
            if ((this.castle & 1) && !b[5] && !b[6] && !this.attacked(4, BLACK) && !this.attacked(5, BLACK) && !this.attacked(6, BLACK)) list[n++] = encode(4, 6, 0, F_CASTLE);
            if ((this.castle & 2) && !b[3] && !b[2] && !b[1] && !this.attacked(4, BLACK) && !this.attacked(3, BLACK) && !this.attacked(2, BLACK)) list[n++] = encode(4, 2, 0, F_CASTLE);
          } else {
            if ((this.castle & 4) && !b[0x75] && !b[0x76] && !this.attacked(0x74, WHITE) && !this.attacked(0x75, WHITE) && !this.attacked(0x76, WHITE)) list[n++] = encode(0x74, 0x76, 0, F_CASTLE);
            if ((this.castle & 8) && !b[0x73] && !b[0x72] && !b[0x71] && !this.attacked(0x74, WHITE) && !this.attacked(0x73, WHITE) && !this.attacked(0x72, WHITE)) list[n++] = encode(0x74, 0x72, 0, F_CASTLE);
          }
        }
      } else {
        const offs = t === BISHOP ? B_OFF : t === ROOK ? R_OFF : K_OFF;
        const nd = t === QUEEN ? 8 : 4;
        for (let i = 0; i < nd; i++) {
          const d = offs[i]; let to = s + d;
          while (!(to & 0x88)) {
            const q = b[to];
            if (!q) { if (!capsOnly) list[n++] = encode(s, to, 0, 0); }
            else { if ((q >> 3) === them) list[n++] = encode(s, to, 0, F_CAP); break; }
            to += d;
          }
        }
      }
    }
    return n;
  }

  make(m) {
    const b = this.b, from = m & 127, to = (m >> 7) & 127, fl = m >>> 17;
    const us = this.side, p = b[from];
    let lo = this.hashLo, hi = this.hashHi;
    // undo info
    let cap = 0;
    const ply = this.ply;
    this.uCastle[ply] = this.castle; this.uEp[ply] = this.ep; this.uHalf[ply] = this.half;
    // clear old ep / castle from hash
    if (this.epHashable(this.ep, us)) { lo ^= Z_EP_LO[this.ep & 7]; hi ^= Z_EP_HI[this.ep & 7]; }
    lo ^= Z_CASTLE_LO[this.castle]; hi ^= Z_CASTLE_HI[this.castle];

    if (fl & F_EP) {
      const cs = us === WHITE ? to - 16 : to + 16;
      cap = b[cs]; b[cs] = 0;
      lo ^= Z_PIECE_LO[cap * 128 + cs]; hi ^= Z_PIECE_HI[cap * 128 + cs];
    } else if (fl & F_CAP) {
      cap = b[to];
      lo ^= Z_PIECE_LO[cap * 128 + to]; hi ^= Z_PIECE_HI[cap * 128 + to];
    }
    this.uCap[ply] = cap;
    // move piece
    b[from] = 0;
    lo ^= Z_PIECE_LO[p * 128 + from]; hi ^= Z_PIECE_HI[p * 128 + from];
    let np = p;
    if (fl & F_PROMO) np = ((m >> 14) & 7) | (us << 3);
    b[to] = np;
    lo ^= Z_PIECE_LO[np * 128 + to]; hi ^= Z_PIECE_HI[np * 128 + to];
    if ((p & 7) === KING) {
      this.king[us] = to;
      if (fl & F_CASTLE) {
        let rf, rt;
        if (to === from + 2) { rf = from + 3; rt = from + 1; } else { rf = from - 4; rt = from - 1; }
        const rk = b[rf]; b[rf] = 0; b[rt] = rk;
        lo ^= Z_PIECE_LO[rk * 128 + rf] ^ Z_PIECE_LO[rk * 128 + rt];
        hi ^= Z_PIECE_HI[rk * 128 + rf] ^ Z_PIECE_HI[rk * 128 + rt];
      }
    }
    this.castle &= CASTLE_MASK[from] & CASTLE_MASK[to];
    lo ^= Z_CASTLE_LO[this.castle]; hi ^= Z_CASTLE_HI[this.castle];
    this.ep = fl & F_DOUBLE ? (from + to) >> 1 : -1;
    this.half = (p & 7) === PAWN || cap ? 0 : this.half + 1;
    if (us === BLACK) this.full++;
    this.side = us ^ 1;
    lo ^= Z_SIDE_LO; hi ^= Z_SIDE_HI;
    if (this.ep >= 0 && this.epHashable(this.ep, this.side)) { lo ^= Z_EP_LO[this.ep & 7]; hi ^= Z_EP_HI[this.ep & 7]; }
    this.hashLo = lo; this.hashHi = hi;
    this.ply = ply + 1;
    this.hLo[this.ply] = lo; this.hHi[this.ply] = hi;
  }

  unmake(m) {
    const b = this.b, from = m & 127, to = (m >> 7) & 127, fl = m >>> 17;
    const ply = --this.ply;
    this.side ^= 1;
    const us = this.side;
    if (us === BLACK) this.full--;
    let p = b[to];
    if (fl & F_PROMO) p = PAWN | (us << 3);
    b[from] = p;
    const cap = this.uCap[ply];
    if (fl & F_EP) { b[to] = 0; b[us === WHITE ? to - 16 : to + 16] = cap; }
    else b[to] = cap;
    if ((p & 7) === KING) {
      this.king[us] = from;
      if (fl & F_CASTLE) {
        let rf, rt;
        if (to === from + 2) { rf = from + 3; rt = from + 1; } else { rf = from - 4; rt = from - 1; }
        b[rf] = b[rt]; b[rt] = 0;
      }
    }
    this.castle = this.uCastle[ply]; this.ep = this.uEp[ply]; this.half = this.uHalf[ply];
    this.hashLo = this.hLo[ply]; this.hashHi = this.hHi[ply];
  }

  // make, and undo again if it leaves our king in check. Returns legality.
  makeLegal(m) {
    const us = this.side;
    this.make(m);
    if (this.attacked(this.king[us], us ^ 1)) { this.unmake(m); return false; }
    return true;
  }

  makeNull() {
    const ply = this.ply;
    this.uCastle[ply] = this.castle; this.uEp[ply] = this.ep; this.uHalf[ply] = this.half; this.uCap[ply] = 0;
    let lo = this.hashLo, hi = this.hashHi;
    if (this.epHashable(this.ep, this.side)) { lo ^= Z_EP_LO[this.ep & 7]; hi ^= Z_EP_HI[this.ep & 7]; }
    this.ep = -1; this.half++;
    this.side ^= 1; lo ^= Z_SIDE_LO; hi ^= Z_SIDE_HI;
    this.hashLo = lo; this.hashHi = hi;
    this.ply = ply + 1; this.hLo[this.ply] = lo; this.hHi[this.ply] = hi;
  }
  unmakeNull() {
    const ply = --this.ply;
    this.side ^= 1;
    this.castle = this.uCastle[ply]; this.ep = this.uEp[ply]; this.half = this.uHalf[ply];
    this.hashLo = this.hLo[ply]; this.hashHi = this.hHi[ply];
  }

  legalMoves() {
    const list = [], n = this.gen(list, 0, false), out = [];
    for (let i = 0; i < n; i++) if (this.makeLegal(list[i])) { this.unmake(list[i]); out.push(list[i]); }
    return out;
  }
  hasLegalMove() {
    const list = [], n = this.gen(list, 0, false);
    for (let i = 0; i < n; i++) if (this.makeLegal(list[i])) { this.unmake(list[i]); return true; }
    return false;
  }

  // times the current position occurred since the last irreversible move (incl. now)
  repetitions() {
    const lo = this.hashLo, hi = this.hashHi;
    let c = 1;
    const stop = Math.max(0, this.ply - this.half);
    for (let i = this.ply - 2; i >= stop; i -= 2) if (this.hLo[i] === lo && this.hHi[i] === hi) c++;
    return c;
  }
  // engine: any earlier occurrence (twofold) counts as a draw inside the search
  isRepeat() {
    const lo = this.hashLo, hi = this.hashHi;
    const stop = Math.max(0, this.ply - this.half);
    for (let i = this.ply - 4; i >= stop; i -= 2) if (this.hLo[i] === lo && this.hHi[i] === hi) return true;
    return false;
  }

  insufficientMaterial() {
    const b = this.b; let minors = 0, bishopsColor = [0, 0], knights = 0;
    for (let s = 0; s < 120; s++) {
      if (s & 0x88) { s += 7; continue; }
      const t = b[s] & 7;
      if (!t || t === KING) continue;
      if (t === PAWN || t === ROOK || t === QUEEN) return false;
      minors++;
      if (t === KNIGHT) knights++;
      else bishopsColor[((s >> 4) + (s & 7)) & 1]++;
    }
    if (minors <= 1) return true;                       // K v K, K+minor v K
    if (knights === 0 && (bishopsColor[0] === 0 || bishopsColor[1] === 0)) return true; // all bishops same colour
    return false;
  }

  perft(depth) {
    if (depth === 0) return 1;
    const list = [], n = this.gen(list, 0, false);
    let total = 0;
    for (let i = 0; i < n; i++) {
      const m = list[i];
      if (!this.makeLegal(m)) continue;
      total += depth === 1 ? 1 : this.perft(depth - 1);
      this.unmake(m);
    }
    return total;
  }

  moveToLan(m) {
    const pr = m >> 14 & 7;
    return sqName(m & 127) + sqName((m >> 7) & 127) + (m >>> 17 & F_PROMO ? TYPE_CH[pr] : '');
  }
  // find the legal internal move matching a LAN string, or 0
  lanToMove(lan) {
    const ms = this.legalMoves();
    lan = lan.toLowerCase();
    for (const m of ms) if (this.moveToLan(m) === lan) return m;
    // accept e7e8 for promotion -> queen
    for (const m of ms) if (this.moveToLan(m) === lan + 'q') return m;
    return 0;
  }

  // SAN for a legal move in the current position
  san(m, legal = null) {
    const b = this.b, from = m & 127, to = (m >> 7) & 127, fl = m >>> 17;
    const p = b[from], t = p & 7;
    let s;
    if (fl & F_CASTLE) s = to > from ? 'O-O' : 'O-O-O';
    else {
      s = '';
      if (t === PAWN) {
        if (fl & F_CAP) s += sqName(from)[0] + 'x';
        s += sqName(to);
        if (fl & F_PROMO) s += '=' + TYPE_CH[(m >> 14) & 7].toUpperCase();
      } else {
        s += TYPE_CH[t].toUpperCase();
        legal = legal || this.legalMoves();
        let amb = false, sameFile = false, sameRank = false;
        for (const o of legal) {
          const of = o & 127;
          if (o === m || ((o >> 7) & 127) !== to || of === from || (b[of] & 7) !== t) continue;
          amb = true;
          if ((of & 7) === (from & 7)) sameFile = true;
          if ((of >> 4) === (from >> 4)) sameRank = true;
        }
        if (amb) {
          if (!sameFile) s += sqName(from)[0];
          else if (!sameRank) s += sqName(from)[1];
          else s += sqName(from);
        }
        if (fl & F_CAP) s += 'x';
        s += sqName(to);
      }
    }
    this.make(m);
    if (this.inCheck()) s += this.hasLegalMove() ? '+' : '#';
    this.unmake(m);
    return s;
  }
}

// ---- Chess: the public wrapper ----------------------------------------------
const stripSan = (s) => s.replace(/[+#!?]+$/g, '').replace(/^0-0-0/, 'O-O-O').replace(/^0-0/, 'O-O');
const looseSan = (s) => stripSan(s).replace(/x/g, '').replace(/=/g, '').replace(/^([a-h][1-8])([QRBN])$/i, '$1$2').toLowerCase();

export class Chess {
  constructor(fen = START_FEN) {
    this._pos = new Position(START_FEN);
    this._headers = {};
    this.load(fen);
  }

  load(fen) {
    const err = Position.validateFen(fen);
    if (err) throw new Error('Invalid FEN (' + err + '): ' + fen);
    this._pos.load(fen);
    this._startFen = this._pos.fen();
    this._hist = [];          // [{move:int, verbose}]
    this._outcome = null;     // manual outcome (timeout/resign/agreement)
    // A set-up position that is ALREADY a dead draw (K v K, K+minor v K, same-colour bishops: gallery, battle
    // tests, learn drills) stays playable: moves() lists moves, so move() must accept them (polish-3). Without
    // a pawn/rook/queen the material can only shrink, so it stays dead; nothing else changes.
    this._deadStart = this._pos.insufficientMaterial();
    if (fen.trim().split(/\s+/).slice(0, 4).join(' ') !== START_FEN.split(' ').slice(0, 4).join(' ')) {
      this._headers.SetUp = '1'; this._headers.FEN = this._startFen;
    } else { delete this._headers.SetUp; delete this._headers.FEN; }
    return true;
  }
  reset() { this._headers = {}; this.load(START_FEN); }
  fen() { return this._pos.fen(); }
  turn() { return this._pos.side === WHITE ? 'w' : 'b'; }
  get position() { return this._pos; }   // engine-facing internal position (read-only use)
  static validateFen(fen) { const e = Position.validateFen(fen); return { ok: !e, error: e }; }

  get(square) {
    const s = sqParse(square); if (s < 0) return null;
    const p = this._pos.b[s];
    return p ? { type: TYPE_CH[p & 7], color: p & 8 ? 'b' : 'w' } : null;
  }
  board() {
    const out = [];
    for (let r = 7; r >= 0; r--) {
      const row = [];
      for (let f = 0; f < 8; f++) {
        const s = r * 16 + f, p = this._pos.b[s];
        row.push(p ? { square: sqName(s), type: TYPE_CH[p & 7], color: p & 8 ? 'b' : 'w' } : null);
      }
      out.push(row);
    }
    return out;
  }

  _verbose(m, legal) {
    const pos = this._pos, b = pos.b, from = m & 127, to = (m >> 7) & 127, fl = m >>> 17;
    const p = b[from];
    const v = {
      color: p & 8 ? 'b' : 'w', from: sqName(from), to: sqName(to), piece: TYPE_CH[p & 7],
      flags: '', san: pos.san(m, legal), lan: pos.moveToLan(m),
    };
    if (fl & F_CAP) {
      if (fl & F_EP) { v.captured = 'p'; v.captureSquare = sqName(pos.side === WHITE ? to - 16 : to + 16); }
      else { v.captured = TYPE_CH[b[to] & 7]; v.captureSquare = v.to; }
    }
    if (fl & F_PROMO) v.promotion = TYPE_CH[(m >> 14) & 7];
    if (fl & F_CASTLE) {
      const ks = to > from;
      v.rookFrom = sqName(ks ? from + 3 : from - 4); v.rookTo = sqName(ks ? from + 1 : from - 1);
    }
    let f = '';
    if (fl & F_EP) f += 'e'; else if (fl & F_CAP) f += 'c';
    if (fl & F_DOUBLE) f += 'b';
    if (fl & F_CASTLE) f += to > from ? 'k' : 'q';
    if (fl & F_PROMO) f += 'p';
    v.flags = f || 'n';
    v.check = /[+#]$/.test(v.san); v.mate = v.san.endsWith('#');
    return v;
  }

  moves({ square, verbose = false } = {}) {
    const legal = this._pos.legalMoves();
    const sq = square ? sqParse(square) : -1;
    const sel = sq >= 0 ? legal.filter((m) => (m & 127) === sq) : (square ? [] : legal);
    if (verbose) { const before = this.fen(); return sel.map((m) => Object.assign(this._verbose(m, legal), { before })); }
    return sel.map((m) => this._pos.san(m, legal));
  }

  _findMove(m) {
    const pos = this._pos, legal = pos.legalMoves();
    if (m && typeof m === 'object') {
      const from = sqParse(m.from), to = sqParse(m.to);
      const pr = m.promotion ? TYPE_CH.indexOf(String(m.promotion).toLowerCase()) : 0;
      let found = 0;
      for (const x of legal) {
        if ((x & 127) !== from || ((x >> 7) & 127) !== to) continue;
        const xp = (x >>> 17) & F_PROMO ? (x >> 14) & 7 : 0;
        if (xp === pr || (!pr && xp === QUEEN)) { found = x; if (xp === pr) break; }
      }
      return [found, legal];
    }
    if (typeof m !== 'string') return [0, legal];
    const s = m.trim();
    if (/^[a-h][1-8][a-h][1-8][qrbnQRBN]?$/.test(s)) {
      const lan = s.toLowerCase();
      for (const x of legal) if (pos.moveToLan(x) === lan) return [x, legal];
      for (const x of legal) if (pos.moveToLan(x) === lan + 'q') return [x, legal];
    }
    const want = stripSan(s), wantLoose = looseSan(s);
    let loose = 0;
    for (const x of legal) {
      const san = stripSan(pos.san(x, legal));
      if (san === want) return [x, legal];
      if (!loose && looseSan(san) === wantLoose) loose = x;
    }
    if (!loose) { // over-disambiguated SAN like "Ngf3" or "Ng1f3"
      const mm = /^([NBRQK])([a-h])?([1-8])?x?([a-h][1-8])$/.exec(want);
      if (mm) {
        const t = TYPE_CH.indexOf(mm[1].toLowerCase()), to = sqParse(mm[4]);
        const c = legal.filter((x) => (pos.b[x & 127] & 7) === t && ((x >> 7) & 127) === to &&
          (!mm[2] || sqName(x & 127)[0] === mm[2]) && (!mm[3] || sqName(x & 127)[1] === mm[3]));
        if (c.length === 1) loose = c[0];
      }
    }
    return [loose, legal];
  }

  move(m) {
    if (this._ended()) return null;
    const [x, legal] = this._findMove(m);
    if (!x) return null;
    const before = this.fen();
    const v = this._verbose(x, legal);
    v.before = before;
    this._pos.make(x);
    v.after = this.fen();
    this._hist.push({ move: x, verbose: v });
    return v;
  }
  // like move() but ignores game-over (used for analysis / replays)
  undo() {
    const h = this._hist.pop();
    if (!h) return null;
    this._pos.unmake(h.move);
    this._outcome = null;
    return h.verbose;
  }

  history({ verbose = false } = {}) { return this._hist.map((h) => verbose ? h.verbose : h.verbose.san); }

  inCheck() { return this._pos.inCheck(); }
  isCheckmate() { return this._pos.inCheck() && !this._pos.hasLegalMove(); }
  isStalemate() { return !this._pos.inCheck() && !this._pos.hasLegalMove(); }
  isThreefoldRepetition() { return this._pos.repetitions() >= 3; }
  isFiftyMoves() { return this._pos.half >= 100; }
  isInsufficientMaterial() { return this._pos.insufficientMaterial(); }
  isDraw() {
    return this.isStalemate() || this.isFiftyMoves() || this.isThreefoldRepetition() || this.isInsufficientMaterial() ||
      !!(this._outcome && this._outcome.result === '1/2-1/2');
  }
  isGameOver() { return this.outcome().result !== '*'; }
  // move() refuses once the game is over, except for the insufficient-material "end" of a position that was
  // loaded dead (see load()). Mate / stalemate have no legal moves anyway.
  _ended() {
    const o = this.outcome();
    return o.result !== '*' && !(o.reason === 'material' && this._deadStart && !this._outcome);
  }

  // UI/server set results that the board can't know: timeout, resign, agreement.
  // For timeout pass the side that flagged; insufficient mating material for the winner => draw.
  setOutcome(result, reason) { this._outcome = { result, reason }; }
  timeout(color) {
    const winner = color === 'w' ? BLACK : WHITE;
    // FIDE: flag = loss unless the opponent cannot possibly mate
    this._outcome = this._cannotMate(winner) ? { result: '1/2-1/2', reason: 'timeout' }
      : { result: winner === WHITE ? '1-0' : '0-1', reason: 'timeout' };
    return this._outcome;
  }
  resign(color) { this._outcome = { result: color === 'w' ? '0-1' : '1-0', reason: 'resign' }; return this._outcome; }
  _cannotMate(side) {
    const b = this._pos.b; let minors = 0;
    for (let s = 0; s < 120; s++) {
      if (s & 0x88) { s += 7; continue; }
      const p = b[s]; if (!p || (p >> 3) !== side) continue;
      const t = p & 7;
      if (t === PAWN || t === ROOK || t === QUEEN) return false;
      if (t !== KING) minors++;
    }
    return minors <= 1; // lone king, or king + one minor (chess.com/lichess convention)
  }

  outcome() {
    if (this._outcome) return { ...this._outcome };
    const pos = this._pos, check = pos.inCheck(), any = pos.hasLegalMove();
    if (!any) return check ? { result: pos.side === WHITE ? '0-1' : '1-0', reason: 'checkmate' } : { result: '1/2-1/2', reason: 'stalemate' };
    if (pos.insufficientMaterial()) return { result: '1/2-1/2', reason: 'material' };
    if (pos.half >= 100) return { result: '1/2-1/2', reason: 'fifty' };
    if (pos.repetitions() >= 3) return { result: '1/2-1/2', reason: 'repetition' };
    return { result: '*', reason: null };
  }

  header(key, value) {
    if (key === undefined) return { ...this._headers };
    if (value === undefined) return this._headers[key];
    this._headers[key] = String(value);
  }

  pgn(headers = {}, { maxWidth = 80 } = {}) {
    const res = this.outcome().result;
    const h = { Event: '?', Site: '?', Date: '????.??.??', Round: '?', White: '?', Black: '?', ...this._headers, ...headers, Result: res };
    if (this._startFen !== START_FEN) { h.SetUp = '1'; h.FEN = this._startFen; }
    const order = ['Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result'];
    const keys = [...order, ...Object.keys(h).filter((k) => !order.includes(k))];
    let out = keys.map((k) => `[${k} "${String(h[k]).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`).join('\n') + '\n\n';
    const parts = this._startFen.split(' ');
    let moveNo = +parts[5] || 1, side = parts[1];
    const toks = [];
    this._hist.forEach((x, i) => {
      if (side === 'w') toks.push(moveNo + '. ' + x.verbose.san);
      else toks.push((i === 0 ? moveNo + '... ' : '') + x.verbose.san);
      if (side === 'b') moveNo++;
      side = side === 'w' ? 'b' : 'w';
    });
    toks.push(res);
    let line = '';
    const lines = [];
    for (const t of toks) {
      if (maxWidth && line && (line + ' ' + t).length > maxWidth) { lines.push(line); line = t; }
      else line = line ? line + ' ' + t : t;
    }
    if (line) lines.push(line);
    return out + lines.join('\n');
  }

  // Returns true on success; on failure the game is left as it was and false is returned.
  loadPgn(str) {
    const saved = { fen: this._startFen, moves: this._hist.map((h) => h.verbose.lan), headers: { ...this._headers }, outcome: this._outcome };
    try {
      const headers = {};
      const hre = /\[\s*(\w+)\s+"((?:[^"\\]|\\.)*)"\s*\]/g;
      let mm;
      while ((mm = hre.exec(str))) headers[mm[1]] = mm[2].replace(/\\(.)/g, '$1');
      let body = str.replace(hre, ' ');
      body = body.replace(/\{[^}]*\}/g, ' ').replace(/;[^\n]*/g, ' ');
      // strip (nested) variations
      let prev;
      do { prev = body; body = body.replace(/\([^()]*\)/g, ' '); } while (body !== prev);
      body = body.replace(/\$\d+/g, ' ');
      this._headers = {};
      this.load(headers.FEN && headers.SetUp !== '0' ? headers.FEN : START_FEN);
      Object.assign(this._headers, headers);
      let result = null;
      for (let tok of body.split(/\s+/)) {
        if (!tok) continue;
        if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(tok)) { result = tok; continue; }
        tok = tok.replace(/^\d+\.+/, '');
        if (!tok || /^\.+$/.test(tok) || /^\d+$/.test(tok)) continue;
        tok = tok.replace(/[!?]+$/, '');
        if (tok === '--') throw new Error('null move');
        if (!this._moveIgnoringOutcome(tok)) throw new Error('illegal move ' + tok);
      }
      if (result && result !== '*' && this.outcome().result === '*') {
        const reason = /time/i.test(headers.Termination || '') ? 'timeout' : (result === '1/2-1/2' ? 'agreement' : 'resign');
        this._outcome = { result, reason };
      }
      return true;
    } catch (e) {
      this._headers = saved.headers; this.load(saved.fen); Object.assign(this._headers, saved.headers);
      for (const l of saved.moves) this._moveIgnoringOutcome(l);
      this._outcome = saved.outcome;
      return false;
    }
  }
  _moveIgnoringOutcome(m) {
    const [x, legal] = this._findMove(m);
    if (!x) return null;
    const before = this.fen();
    const v = this._verbose(x, legal); v.before = before;
    this._pos.make(x); v.after = this.fen();
    this._hist.push({ move: x, verbose: v });
    return v;
  }
}

// ---- Clock --------------------------------------------------------------------
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// new Clock({baseMs, incMs})  — baseMs = Infinity (or null/0) means untimed ("Unlimited").
// start(color) starts `color`'s clock; press() ends the running side's turn (adds increment,
// starts the other side). pause()/resume(). onFlag(cb) -> cb(color) once when a clock hits 0.
export class Clock {
  constructor({ baseMs = 300000, incMs = 0 } = {}) {
    this.untimed = !baseMs || !isFinite(baseMs);
    this.baseMs = this.untimed ? Infinity : baseMs;
    this.incMs = incMs || 0;
    this.ms = { w: this.baseMs, b: this.baseMs };
    this.running = null;       // 'w' | 'b' | null
    this.paused = false;
    this.flagged = null;
    this._since = 0;
    this._cbs = [];
    this._timer = null;
  }
  _sync() {
    if (this.running && !this.paused) {
      const t = now();
      this.ms[this.running] -= t - this._since;
      this._since = t;
    }
  }
  _arm() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    if (this.untimed || !this.running || this.paused || this.flagged) return;
    const left = this.ms[this.running];
    this._timer = setTimeout(() => this._check(), Math.max(0, left) + 5);
  }
  _check() {
    this._sync();
    const c = this.running;
    if (c && this.ms[c] <= 0 && !this.flagged) {
      this.ms[c] = 0; this.flagged = c; this.running = null;
      for (const cb of this._cbs) try { cb(c); } catch (e) { console.error(e); }
    } else this._arm();
  }
  start(color) {
    this._sync();
    this.running = color; this.paused = false; this._since = now();
    this._arm();
  }
  // Ends the running side's move: adds increment, starts the opponent. Returns the side now running.
  press() {
    if (!this.running || this.flagged) return this.running;
    this._sync();
    if (this.ms[this.running] <= 0) { this._check(); return null; }
    const c = this.running;
    if (!this.untimed) this.ms[c] += this.incMs;
    this.running = c === 'w' ? 'b' : 'w';
    this._since = now();
    this._arm();
    return this.running;
  }
  pause() { this._sync(); this.paused = true; this._arm(); }
  resume() { if (!this.paused) return; this.paused = false; this._since = now(); this._arm(); }
  stop() { this._sync(); this.running = null; this._arm(); }
  remainingMs(color) {
    if (this.untimed) return Infinity;
    let v = this.ms[color];
    if (color === this.running && !this.paused) v -= now() - this._since;
    return Math.max(0, v);
  }
  // for server sync / adjournment
  set(color, ms) { this._sync(); this.ms[color] = ms; this._arm(); }
  onFlag(cb) { this._cbs.push(cb); return () => { this._cbs = this._cbs.filter((x) => x !== cb); }; }
  dispose() { if (this._timer) clearTimeout(this._timer); this._cbs = []; }
}

export default Chess;
