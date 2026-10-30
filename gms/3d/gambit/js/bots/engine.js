// GAMBIT search engine. Pure module: runs in the bot Web Worker and in node (tools/core_*.mjs).
// Iterative deepening PVS alpha-beta, quiescence, TT, killers/history, null move, LMR,
// futility, tapered PST eval with pawn structure / mobility / king safety terms.
import { Position, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, WHITE, BLACK,
  F_CAP, F_EP, F_PROMO, F_CASTLE } from '../chess/chess.js';

export const MATE = 32000;
export const MATE_BOUND = MATE - 1000;
const INF = 32767;
const MAX_PLY = 96;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// ---- evaluation tables --------------------------------------------------------
const MG_VAL = [0, 82, 337, 365, 477, 1025, 0];
const EG_VAL = [0, 94, 281, 297, 512, 936, 0];
export const SEE_VAL = [0, 100, 320, 330, 500, 950, 20000];
const PHASE_W = [0, 0, 1, 1, 2, 4, 0];

// visual order: rank 8 first (white's point of view)
const P_MG = [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0];
const P_EG = [0,0,0,0,0,0,0,0, 80,80,80,80,80,80,80,80, 50,50,50,50,50,50,50,50, 30,30,30,30,30,30,30,30, 15,15,15,15,15,15,15,15, 5,5,5,5,5,5,5,5, 0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0];
const N_T = [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50];
const B_T = [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20];
const R_T = [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0];
const Q_T = [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20];
const K_MG = [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20];
const K_EG = [-50,-40,-30,-20,-20,-30,-40,-50, -30,-20,-10,0,0,-10,-20,-30, -30,-10,20,30,30,20,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,20,30,30,20,-10,-30, -30,-30,0,0,0,0,-30,-30, -50,-30,-30,-30,-30,-30,-30,-50];
const TAB_MG = [null, P_MG, N_T, B_T, R_T, Q_T, K_MG];
const TAB_EG = [null, P_EG, N_T, B_T, R_T, Q_T, K_EG];

// signed (white +) material+PST per piece code and 0x88 square, for a given pst weight
function buildPst(pstW) {
  const mg = new Int16Array(16 * 128), eg = new Int16Array(16 * 128);
  for (let t = 1; t <= 6; t++) for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const s = r * 16 + f;
    const wi = (7 - r) * 8 + f, bi = r * 8 + f;
    mg[t * 128 + s] = MG_VAL[t] + Math.round(TAB_MG[t][wi] * pstW);
    eg[t * 128 + s] = EG_VAL[t] + Math.round(TAB_EG[t][wi] * pstW);
    mg[(t | 8) * 128 + s] = -(MG_VAL[t] + Math.round(TAB_MG[t][bi] * pstW));
    eg[(t | 8) * 128 + s] = -(EG_VAL[t] + Math.round(TAB_EG[t][bi] * pstW));
  }
  return { mg, eg };
}

const PASSED_MG = [0, 5, 10, 15, 30, 50, 80, 0];
const PASSED_EG = [0, 10, 20, 40, 70, 120, 180, 0];
const N_OFF = [33, 31, 18, 14, -33, -31, -18, -14];
const B_OFF = [15, 17, -15, -17];
const R_OFF = [16, -16, 1, -1];
const Q_OFF = [15, 16, 17, 1, -1, -15, -16, -17];

export const DEFAULT_EVAL = {
  pst: 1, mobility: 1, pawns: 1, passed: 1, kingSafety: 1, rookFiles: 1, bishopPair: 1, tempo: 1,
  materialScale: 1,     // >1 = greedier (values material more vs position)
  aggression: 1,        // scales attacks on the enemy king (our attack bonus)
};

// ---- engine -----------------------------------------------------------------------
export class Engine {
  constructor({ ttBits = 20 } = {}) {
    this.pos = new Position();
    const size = 1 << ttBits;
    this.ttMask = size - 1;
    this.ttHi = new Int32Array(size);
    this.ttLo = new Int32Array(size);
    this.ttMove = new Int32Array(size);
    this.ttScore = new Int16Array(size);
    this.ttDepth = new Int8Array(size);
    this.ttFlag = new Uint8Array(size);   // 0 empty, 1 exact, 2 lower, 3 upper
    this.ttAge = new Uint8Array(size);
    this.age = 0;
    this.hist = new Int32Array(16 * 128);
    this.killers = new Int32Array(MAX_PLY * 2);
    this.mlist = []; this.mscore = [];
    for (let i = 0; i < MAX_PLY + 1; i++) { this.mlist.push(new Int32Array(256)); this.mscore.push(new Int32Array(256)); }
    this.setEval({});
    this.nodes = 0;
    this.evalNoise = 0; this.noiseSeed = 0;
    this.excludeRoot = null;
  }

  setEval(w) {
    this.w = { ...DEFAULT_EVAL, ...(w || {}) };
    this.pstT = buildPst(this.w.pst);
    if (this.w.materialScale !== 1) {
      const k = this.w.materialScale;
      for (let i = 0; i < this.pstT.mg.length; i++) { this.pstT.mg[i] = Math.round(this.pstT.mg[i] * k); this.pstT.eg[i] = Math.round(this.pstT.eg[i] * k); }
    }
  }

  setPosition(fen, moves = []) {
    if (fen instanceof Position) { this.pos = fen; return; }
    this.pos.load(fen);
    for (const lan of moves) { const m = this.pos.lanToMove(lan); if (!m) break; this.pos.make(m); }
  }

  clearTT() { this.ttFlag.fill(0); this.hist.fill(0); }

  // ---------------------------------------------------------------- eval
  // Static eval from the side to move's point of view.
  evaluate() {
    const pos = this.pos, b = pos.b, w = this.w;
    const PM = this.pstT.mg, PE = this.pstT.eg;
    let mg = 0, eg = 0, phase = 0;
    // pawn files: counts and extreme ranks
    const wCnt = this._wCnt || (this._wCnt = new Int8Array(10)), bCnt = this._bCnt || (this._bCnt = new Int8Array(10));
    const wMin = this._wMin || (this._wMin = new Int8Array(10)), bMax = this._bMax || (this._bMax = new Int8Array(10));
    const wMax = this._wMax || (this._wMax = new Int8Array(10)), bMin = this._bMin || (this._bMin = new Int8Array(10));
    wCnt.fill(0); bCnt.fill(0); wMin.fill(8); bMin.fill(8); wMax.fill(-1); bMax.fill(-1);
    let wB = 0, bB = 0, wNP = 0, bNP = 0, wP = 0, bP = 0;
    const pieces = this._pcs || (this._pcs = new Int32Array(40));
    let np = 0;
    for (let s = 0; s < 120; s++) {
      if (s & 0x88) { s += 7; continue; }
      const p = b[s];
      if (!p) continue;
      mg += PM[p * 128 + s]; eg += PE[p * 128 + s];
      const t = p & 7;
      phase += PHASE_W[t];
      if (t === PAWN) {
        const f = (s & 7) + 1, r = s >> 4;
        if (p === 1) { wP++; wCnt[f]++; if (r < wMin[f]) wMin[f] = r; if (r > wMax[f]) wMax[f] = r; }
        else { bP++; bCnt[f]++; if (r > bMax[f]) bMax[f] = r; if (r < bMin[f]) bMin[f] = r; }
      } else if (t !== KING) {
        if (p & 8) { bNP += SEE_VAL[t]; if (t === BISHOP) bB++; } else { wNP += SEE_VAL[t]; if (t === BISHOP) wB++; }
        if (np < 40) pieces[np++] = s;
      }
    }
    // dead-drawn material: no pawns, at most one minor each
    if (!wP && !bP && wNP <= 330 && bNP <= 330) return 0;

    // bishop pair
    if (w.bishopPair) {
      if (wB >= 2) { mg += 30 * w.bishopPair; eg += 50 * w.bishopPair; }
      if (bB >= 2) { mg -= 30 * w.bishopPair; eg -= 50 * w.bishopPair; }
    }

    // pawn structure
    if (w.pawns || w.passed) {
      for (let s = 0; s < 120; s++) {
        if (s & 0x88) { s += 7; continue; }
        const p = b[s];
        if ((p & 7) !== PAWN) continue;
        const f = (s & 7) + 1, r = s >> 4;
        if (p === 1) {
          if (w.pawns) {
            if (!wCnt[f - 1] && !wCnt[f + 1]) { mg -= 10 * w.pawns; eg -= 15 * w.pawns; }
            if (wCnt[f] > 1 && r !== wMax[f]) { mg -= 10 * w.pawns; eg -= 20 * w.pawns; }
          }
          if (w.passed && bMax[f - 1] <= r && bMax[f] <= r && bMax[f + 1] <= r && r === wMax[f]) {
            mg += PASSED_MG[r] * w.passed; eg += PASSED_EG[r] * w.passed;
            if (b[s + 16]) eg -= (PASSED_EG[r] >> 2) * w.passed; // blocked
          }
        } else {
          const rr = 7 - r;
          if (w.pawns) {
            if (!bCnt[f - 1] && !bCnt[f + 1]) { mg += 10 * w.pawns; eg += 15 * w.pawns; }
            if (bCnt[f] > 1 && r !== bMin[f]) { mg += 10 * w.pawns; eg += 20 * w.pawns; }
          }
          if (w.passed && wMin[f - 1] >= r && wMin[f] >= r && wMin[f + 1] >= r && r === bMin[f]) {
            mg -= PASSED_MG[rr] * w.passed; eg -= PASSED_EG[rr] * w.passed;
            if (b[s - 16]) eg += (PASSED_EG[rr] >> 2) * w.passed;
          }
        }
      }
    }

    // mobility, rook files, king attack
    const wk = pos.king[0], bk = pos.king[1];
    const wkf = wk & 7, wkr = wk >> 4, bkf = bk & 7, bkr = bk >> 4;
    let wAtt = 0, bAtt = 0, wAttN = 0, bAttN = 0;  // units attacking the *enemy* king zone
    if (w.mobility || w.kingSafety || w.rookFiles) {
      for (let i = 0; i < np; i++) {
        const s = pieces[i], p = b[s], t = p & 7, white = !(p & 8);
        const ekf = white ? bkf : wkf, ekr = white ? bkr : wkr;
        let mob = 0, zone = 0;
        if (t === KNIGHT) {
          for (let k = 0; k < 8; k++) {
            const to = s + N_OFF[k];
            if (to & 0x88) continue;
            const q = b[to];
            if (q && !((q & 8) ^ (p & 8))) continue;
            // squares attacked by enemy pawns don't count
            if (white ? (!((to + 15) & 0x88) && b[to + 15] === 9 || !((to + 17) & 0x88) && b[to + 17] === 9)
              : (!((to - 15) & 0x88) && b[to - 15] === 1 || !((to - 17) & 0x88) && b[to - 17] === 1)) continue;
            mob++;
            const df = (to & 7) - ekf, dr = (to >> 4) - ekr;
            if (df <= 1 && df >= -1 && dr <= 1 && dr >= -1) zone++;
          }
          mg += (white ? 1 : -1) * (mob - 4) * 4 * w.mobility; eg += (white ? 1 : -1) * (mob - 4) * 4 * w.mobility;
          if (zone) { if (white) { wAtt += 2 * zone; wAttN++; } else { bAtt += 2 * zone; bAttN++; } }
        } else {
          const offs = t === BISHOP ? B_OFF : t === ROOK ? R_OFF : Q_OFF;
          const nd = t === QUEEN ? 8 : 4;
          for (let k = 0; k < nd; k++) {
            const d = offs[k]; let to = s + d;
            while (!(to & 0x88)) {
              const q = b[to];
              const df = (to & 7) - ekf, dr = (to >> 4) - ekr;
              if (df <= 1 && df >= -1 && dr <= 1 && dr >= -1) zone++;
              if (q) { if ((q & 8) ^ (p & 8)) mob++; break; }
              mob++;
              to += d;
            }
          }
          const sg = white ? 1 : -1;
          if (t === BISHOP) { mg += sg * (mob - 7) * 5 * w.mobility; eg += sg * (mob - 7) * 5 * w.mobility; }
          else if (t === ROOK) {
            mg += sg * (mob - 7) * 2 * w.mobility; eg += sg * (mob - 7) * 4 * w.mobility;
            if (w.rookFiles) {
              const f = (s & 7) + 1;
              if (!wCnt[f] && !bCnt[f]) { mg += sg * 25 * w.rookFiles; eg += sg * 10 * w.rookFiles; }
              else if (white ? !wCnt[f] : !bCnt[f]) { mg += sg * 12 * w.rookFiles; eg += sg * 6 * w.rookFiles; }
            }
          } else { mg += sg * (mob - 14) * 1 * w.mobility; eg += sg * (mob - 14) * 2 * w.mobility; }
          if (zone) {
            const u = (t === QUEEN ? 5 : t === ROOK ? 3 : 2) * zone;
            if (white) { wAtt += u; wAttN++; } else { bAtt += u; bAttN++; }
          }
        }
      }
    }

    if (w.kingSafety) {
      // attack on the enemy king (only counts with 2+ attackers, and only while queens are on-ish)
      const ks = w.kingSafety;
      if (wAttN >= 2) mg += Math.min(500, (wAtt * wAtt) >> 2) * ks * w.aggression;
      if (bAttN >= 2) mg -= Math.min(500, (bAtt * bAtt) >> 2) * ks * w.aggression;
      // pawn shield
      mg += this._shield(wk, 0, wCnt, wMin, bCnt) * ks;
      mg -= this._shield(bk, 1, bCnt, null, wCnt, bMax) * ks;
    }

    if (w.tempo) { if (pos.side === WHITE) mg += 10; else mg -= 10; }

    if (phase > 24) phase = 24;
    let score = ((mg * phase + eg * (24 - phase)) / 24) | 0;

    // endgame helpers
    if (phase <= 6) {
      // lone king: drive it to the edge and bring our king closer (mop-up)
      if (!bP && !bNP && (wNP >= 500 || wP)) score += this._mopUp(bk, wk);
      else if (!wP && !wNP && (bNP >= 500 || bP)) score -= this._mopUp(wk, bk);
      // no pawns and only a minor's worth up: very drawish
      if (score > 0 && !wP && wNP - bNP <= 350) score >>= 2;
      else if (score < 0 && !bP && bNP - wNP <= 350) score = -((-score) >> 2);
    }
    if (this.evalNoise) { // deterministic per position + game seed, so the TT stays consistent
      const h = Math.imul(pos.hashLo ^ this.noiseSeed, 0x9E3779B1) ^ pos.hashHi;
      score += (((h >>> 8) & 0xffff) / 32768 - 1) * this.evalNoise;
      score |= 0;
    }
    return pos.side === WHITE ? score : -score;
  }

  _shield(k, color, own, ownMin, opp, ownMaxB) {
    const f = k & 7, r = k >> 4;
    // only when castled-ish on a wing and on the back two ranks
    const back = color === 0 ? r <= 1 : r >= 6;
    if (!back) return f >= 2 && f <= 5 ? -15 : 0;
    if (f >= 3 && f <= 4) return -10;  // uncastled king in the centre
    const b = this.pos.b, pawn = color === 0 ? 1 : 9, fwd = color === 0 ? 16 : -16;
    let v = 0;
    for (let ff = Math.max(0, f - 1); ff <= Math.min(7, f + 1); ff++) {
      const s1 = (r * 16 + ff) + fwd, s2 = s1 + fwd;
      if (!(s1 & 0x88) && b[s1] === pawn) v += 12;
      else if (!(s2 & 0x88) && b[s2] === pawn) v += 6;
      else { v -= 15; if (!opp[ff + 1]) v -= 10; }
    }
    return v;
  }

  _mopUp(loserK, winnerK) {
    const lf = loserK & 7, lr = loserK >> 4, wf = winnerK & 7, wr = winnerK >> 4;
    const centre = Math.max(3 - lf, lf - 4) + Math.max(3 - lr, lr - 4); // 0..6
    const dist = Math.abs(lf - wf) + Math.abs(lr - wr);
    return 10 * centre + 4 * (14 - dist) + 50;
  }

  // ---------------------------------------------------------------- TT
  _ttProbe() {
    const i = this.pos.hashLo & this.ttMask;
    if (this.ttFlag[i] && this.ttHi[i] === this.pos.hashHi && this.ttLo[i] === this.pos.hashLo) return i;
    return -1;
  }
  _ttStore(depth, flag, score, move, ply) {
    const i = this.pos.hashLo & this.ttMask;
    const same = this.ttHi[i] === this.pos.hashHi && this.ttLo[i] === this.pos.hashLo;
    if (this.ttFlag[i] && this.ttAge[i] === this.age && !same && this.ttDepth[i] > depth) return;
    if (score > MATE_BOUND) score += ply; else if (score < -MATE_BOUND) score -= ply;
    if (!move && same) move = this.ttMove[i];
    this.ttHi[i] = this.pos.hashHi; this.ttLo[i] = this.pos.hashLo;
    this.ttMove[i] = move; this.ttScore[i] = score; this.ttDepth[i] = depth;
    this.ttFlag[i] = flag; this.ttAge[i] = this.age;
  }

  // ---------------------------------------------------------------- move ordering
  _score(list, scores, n, ttMove, ply) {
    const b = this.pos.b, k1 = this.killers[ply * 2], k2 = this.killers[ply * 2 + 1];
    for (let i = 0; i < n; i++) {
      const m = list[i];
      if (m === ttMove) { scores[i] = 1 << 30; continue; }
      const fl = m >>> 17, from = m & 127, to = (m >> 7) & 127;
      if (fl & (F_CAP | F_PROMO)) {
        const victim = fl & F_EP ? PAWN : b[to] & 7;
        const att = b[from] & 7;
        let s = 1 << 24;
        s += SEE_VAL[victim] * 16 - att;
        if (fl & F_PROMO) s += ((m >> 14) & 7) === QUEEN ? 8000 : -(1 << 23);
        // losing-looking captures go after killers
        if (victim && SEE_VAL[att] > SEE_VAL[victim] + 50 && this.pos.attacked(to, this.pos.side ^ 1)) s -= 1 << 23;
        scores[i] = s;
      } else if (m === k1) scores[i] = (1 << 23) + 2;
      else if (m === k2) scores[i] = (1 << 23) + 1;
      else scores[i] = this.hist[b[from] * 128 + to];
    }
  }
  static _pick(list, scores, i, n) {
    let best = i, bs = scores[i];
    for (let j = i + 1; j < n; j++) if (scores[j] > bs) { bs = scores[j]; best = j; }
    if (best !== i) {
      const m = list[i]; list[i] = list[best]; list[best] = m;
      const s = scores[i]; scores[i] = scores[best]; scores[best] = s;
    }
    return list[i];
  }

  _checkLimits() {
    if (this.nodes >= this.maxNodes || now() >= this.hardDeadline) this.aborted = true;
  }

  // ---------------------------------------------------------------- quiescence
  _qs(alpha, beta, ply, qd) {
    this.nodes++;
    if ((this.nodes & 1023) === 0) this._checkLimits();
    if (this.aborted) return 0;
    if (ply > this.selDepth) this.selDepth = ply;
    const pos = this.pos;
    const check = qd > -6 && pos.inCheck();
    let stand = -INF;
    if (!check) {
      stand = this.evaluate();
      if (stand >= beta) return stand;
      if (ply >= MAX_PLY || qd <= -this.qMax) return stand;
      if (stand > alpha) alpha = stand;
    } else if (ply >= MAX_PLY) return this.evaluate();
    const list = this.mlist[ply], scores = this.mscore[ply];
    const n = pos.gen(list, 0, !check);
    this._score(list, scores, n, 0, ply);
    const b = pos.b;
    let legal = 0, best = stand;
    for (let i = 0; i < n; i++) {
      const m = Engine._pick(list, scores, i, n);
      if (!check) {
        const fl = m >>> 17, to = (m >> 7) & 127;
        const victim = fl & F_EP ? PAWN : b[to] & 7;
        // delta pruning
        if (!(fl & F_PROMO) && stand + SEE_VAL[victim] + 200 < alpha) continue;
        // skip clearly losing captures
        if (scores[i] < (1 << 24) - (1 << 22)) continue;
      }
      if (!pos.makeLegal(m)) continue;
      legal++;
      const sc = -this._qs(-beta, -alpha, ply + 1, qd - 1);
      pos.unmake(m);
      if (this.aborted) return 0;
      if (sc > best) {
        best = sc;
        if (sc > alpha) { alpha = sc; if (sc >= beta) return sc; }
      }
    }
    if (check && !legal) return -MATE + ply;
    return best;
  }

  // ---------------------------------------------------------------- main search
  _search(depth, alpha, beta, ply, nullOk) {
    const pos = this.pos;
    const pv = beta - alpha > 1;
    if (ply > 0) {
      if (pos.half >= 100 || pos.isRepeat()) return 0;
      // mate distance pruning
      const ma = -MATE + ply, mb = MATE - ply - 1;
      if (alpha < ma) alpha = ma;
      if (beta > mb) beta = mb;
      if (alpha >= beta) return alpha;
    }
    const check = pos.inCheck();
    if (check) depth++;
    if (depth <= 0) return this._qs(alpha, beta, ply, 0);
    this.nodes++;
    if ((this.nodes & 1023) === 0) this._checkLimits();
    if (this.aborted) return 0;
    if (ply >= MAX_PLY) return this.evaluate();

    // TT
    let ttMove = 0;
    const ti = this._ttProbe();
    if (ti >= 0) {
      ttMove = this.ttMove[ti];
      if (!pv && this.ttDepth[ti] >= depth && ply > 0) {
        let s = this.ttScore[ti];
        if (s > MATE_BOUND) s -= ply; else if (s < -MATE_BOUND) s += ply;
        const f = this.ttFlag[ti];
        if (f === 1 || (f === 2 && s >= beta) || (f === 3 && s <= alpha)) return s;
      }
    }

    const staticEval = check ? -INF : this.evaluate();
    if (!pv && !check && ply > 0) {
      // reverse futility
      if (depth <= 4 && staticEval - 90 * depth >= beta && Math.abs(beta) < MATE_BOUND) return staticEval;
      // null move
      if (nullOk && depth >= 3 && staticEval >= beta && this._hasPieces(pos.side)) {
        const R = 2 + (depth >= 7 ? 1 : 0);
        pos.makeNull();
        const s = -this._search(depth - 1 - R, -beta, -beta + 1, ply + 1, false);
        pos.unmakeNull();
        if (this.aborted) return 0;
        if (s >= beta) return Math.abs(s) > MATE_BOUND ? beta : s;
      }
    }
    // internal iterative reduction: no TT move on a deep PV node -> search shallower
    if (!ttMove && depth >= 5 && pv) depth--;

    const list = this.mlist[ply], scores = this.mscore[ply];
    const n = pos.gen(list, 0, false);
    this._score(list, scores, n, ttMove, ply);
    const b = pos.b;
    let legal = 0, best = -INF, bestMove = 0, flag = 3;
    const futile = !pv && !check && depth <= 2 && staticEval + 120 * depth <= alpha;
    for (let i = 0; i < n; i++) {
      const m = Engine._pick(list, scores, i, n);
      const fl = m >>> 17;
      const quiet = !(fl & (F_CAP | F_PROMO));
      const piece = b[m & 127];
      if (ply === 0 && this.excludeRoot && this.excludeRoot.has(m)) continue;
      if (!pos.makeLegal(m)) continue;
      legal++;
      const givesCheck = pos.inCheck();
      // futility / late-move pruning for quiet moves
      if (legal > 1 && quiet && !givesCheck && !check && !pv) {
        if (futile || (depth <= 3 && legal > 4 + 3 * depth * depth)) { pos.unmake(m); continue; }
      }
      let sc;
      if (legal === 1) sc = -this._search(depth - 1, -beta, -alpha, ply + 1, true);
      else {
        let r = 0;
        if (depth >= 3 && legal > 3 && quiet && !check && !givesCheck && scores[i] < (1 << 23)) {
          r = 1 + (legal > 8 ? 1 : 0) + (depth >= 8 && legal > 16 ? 1 : 0);
          if (pv) r--;
          if (r > depth - 2) r = depth - 2;
        }
        sc = -this._search(depth - 1 - r, -alpha - 1, -alpha, ply + 1, true);
        if (r > 0 && sc > alpha) sc = -this._search(depth - 1, -alpha - 1, -alpha, ply + 1, true);
        if (sc > alpha && sc < beta) sc = -this._search(depth - 1, -beta, -alpha, ply + 1, true);
      }
      pos.unmake(m);
      if (this.aborted) return 0;
      if (ply === 0 && this.rootScores) this.rootScores.set(m, sc);
      if (sc > best) {
        best = sc; bestMove = m;
        if (ply === 0) { this.rootBest = m; this.rootBestScore = sc; }
        if (sc > alpha) {
          alpha = sc; flag = 1;
          if (sc >= beta) {
            flag = 2;
            if (quiet) {
              if (this.killers[ply * 2] !== m) { this.killers[ply * 2 + 1] = this.killers[ply * 2]; this.killers[ply * 2] = m; }
              const hi = piece * 128 + ((m >> 7) & 127);
              this.hist[hi] += depth * depth;
              if (this.hist[hi] > 1 << 20) for (let k = 0; k < this.hist.length; k++) this.hist[k] >>= 1;
            }
            break;
          }
        }
      }
    }
    if (!legal) return check ? -MATE + ply : 0;
    this._ttStore(depth, flag, best, bestMove, ply);
    return best;
  }

  _hasPieces(side) {
    const b = this.pos.b, c = side << 3;
    for (let s = 0; s < 120; s++) {
      if (s & 0x88) { s += 7; continue; }
      const p = b[s];
      if (p && (p & 8) === c && (p & 7) !== PAWN && (p & 7) !== KING) return true;
    }
    return false;
  }

  _pv(first, maxLen = 16) {
    const pos = this.pos, out = [], made = [];
    let m = first;
    while (m && out.length < maxLen) {
      const legal = pos.legalMoves();
      if (!legal.includes(m)) break;
      out.push(pos.moveToLan(m));
      pos.make(m); made.push(m);
      if (pos.repetitions() >= 2) break;
      const ti = this._ttProbe();
      m = ti >= 0 ? this.ttMove[ti] : 0;
    }
    for (let i = made.length - 1; i >= 0; i--) pos.unmake(made[i]);
    return out;
  }

  // Search the current position.
  // opts: {maxDepth, nodes, softMs, hardMs, qMax, rootScores:bool, onInfo, minDepth}
  // returns {move:int, lan, score, depth, nodes, ms, pv, mate, rootScores?:Map<int,int>}
  search(opts = {}) {
    const pos = this.pos;
    const t0 = now();
    this.nodes = 0; this.selDepth = 0; this.aborted = false;
    this.maxNodes = opts.nodes || Infinity;
    const softMs = opts.softMs ?? Infinity, hardMs = opts.hardMs ?? Infinity;
    this.hardDeadline = t0 + hardMs;
    this.qMax = opts.qMax ?? 99;
    this.age = (this.age + 1) & 255;
    this.killers.fill(0);
    const maxDepth = Math.min(opts.maxDepth || 64, MAX_PLY - 10);
    const legal = pos.legalMoves().filter((m) => !(this.excludeRoot && this.excludeRoot.has(m)));
    const res = { move: 0, lan: null, score: 0, depth: 0, nodes: 0, ms: 0, pv: [], mate: 0 };
    if (!legal.length) { res.score = this.excludeRoot ? -INF : pos.inCheck() ? -MATE : 0; return res; }
    res.move = legal[0];
    if (legal.length === 1 && !opts.rootScores && !opts.analyse) { res.lan = pos.moveToLan(legal[0]); res.depth = 1; return res; }
    let rootScores = null;
    let prev = 0;
    for (let d = 1; d <= maxDepth; d++) {
      this.rootBest = 0; this.rootBestScore = -INF;
      this.rootScores = opts.rootScores ? new Map() : null;
      let sc;
      if (d >= 5 && !opts.rootScores && Math.abs(prev) < MATE_BOUND) {
        let delta = 35, a = prev - delta, bb = prev + delta;
        for (;;) {
          sc = this._search(d, a, bb, 0, false);
          if (this.aborted) break;
          if (sc <= a) { a = Math.max(-INF, a - delta * 3); delta *= 3; }
          else if (sc >= bb) { bb = Math.min(INF, bb + delta * 3); delta *= 3; }
          else break;
          if (delta > 1000) { a = -INF; bb = INF; }
        }
      } else sc = this._search(d, -INF, INF, 0, false);
      if (this.aborted) {
        // keep a partial iteration's move only if it already beat the previous best
        if (this.rootBest && this.rootBestScore > prev && d > 1 && !opts.rootScores) { res.move = this.rootBest; res.score = this.rootBestScore; }
        break;
      }
      prev = sc;
      res.move = this.rootBest || res.move; res.score = sc; res.depth = d;
      if (this.rootScores) rootScores = this.rootScores;
      const el = now() - t0;
      if (opts.onInfo) opts.onInfo({ depth: d, score: sc, nodes: this.nodes, ms: el, pv: this._pv(res.move, 8) });
      if (Math.abs(sc) > MATE_BOUND && d >= (opts.minDepth || 1) && MATE - Math.abs(sc) <= d) break; // found a forced mate fully
      if (el > softMs * 0.55 && d >= (opts.minDepth || 1)) break;
      if (this.nodes >= this.maxNodes) break;
    }
    res.nodes = this.nodes; res.ms = now() - t0;
    res.lan = pos.moveToLan(res.move);
    res.pv = this._pv(res.move);
    if (Math.abs(res.score) > MATE_BOUND) res.mate = res.score > 0 ? Math.ceil((MATE - res.score) / 2) : -Math.ceil((MATE + res.score) / 2);
    if (rootScores) res.rootScores = rootScores;
    return res;
  }

  // Score every root move at a fixed depth with a full window ("multi-PV lite") for the
  // human-like bots. Returns [{move, lan, score}] sorted best first.
  scoreRootMoves({ depth = 2, qMax = 99, nodes = Infinity, hardMs = Infinity } = {}) {
    const pos = this.pos;
    const t0 = now();
    this.nodes = 0; this.selDepth = 0; this.aborted = false;
    this.maxNodes = nodes; this.hardDeadline = t0 + hardMs; this.qMax = qMax;
    this.age = (this.age + 1) & 255; this.killers.fill(0);
    const legal = pos.legalMoves();
    let out = legal.map((m) => ({ move: m, lan: pos.moveToLan(m), score: 0, depth: 0 }));
    for (let d = 1; d <= depth; d++) {
      const cur = [];
      for (const e of out) {
        pos.make(e.move);
        let s;
        if (pos.half >= 100 || pos.isRepeat()) s = 0;
        else s = d - 1 <= 0 ? -this._qs(-INF, INF, 1, 0) : -this._search(d - 1, -INF, INF, 1, true);
        pos.unmake(e.move);
        if (this.aborted) break;
        cur.push({ ...e, score: s, depth: d });
      }
      if (this.aborted) {
        // merge partial results
        const m = new Map(cur.map((e) => [e.move, e]));
        out = out.map((e) => m.get(e.move) || e);
        break;
      }
      out = cur.sort((a, b) => b.score - a.score);
    }
    out.sort((a, b) => b.score - a.score);
    this.lastNodes = this.nodes; this.lastMs = now() - t0;
    return out;
  }

  // static eval after a move, from the mover's perspective (used for "blunder" choices)
  shallowScore(m) {
    this.pos.make(m);
    const s = -this.evaluate();
    this.pos.unmake(m);
    return s;
  }
}

// ---- benchmark: fixed positions, ~ms budget -----------------------------------------
const BENCH_FENS = [
  'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
  'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
  'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10',
  '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',
];
export function runBenchmark(ms = 1000) {
  const e = new Engine({ ttBits: 18 });
  const t0 = now();
  let nodes = 0, i = 0;
  // warm-up so the JIT has compiled the hot paths before we time
  e.setPosition(BENCH_FENS[0]); e.search({ maxDepth: 4 });
  const t1 = now();
  while (now() - t1 < ms) {
    e.setPosition(BENCH_FENS[i++ % BENCH_FENS.length]);
    e.search({ hardMs: Math.max(50, ms - (now() - t1)), softMs: Infinity, maxDepth: 64 });
    nodes += e.nodes;
  }
  const el = now() - t1;
  const nps = Math.round(nodes / el * 1000);
  return { nps, score: Math.round(nps / 1000), ms: Math.round(now() - t0) };
}
