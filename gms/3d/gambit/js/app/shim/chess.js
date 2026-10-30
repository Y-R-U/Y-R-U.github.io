// UI-side SHIM of the core `Chess` interface (TEAM_BRIEF). Only used until
// js/chess/chess.js lands — deps.js picks the real module when it exists.
// Legal-move generation is complete (castling, ep, promotion, check filter) but
// it is not perft-certified; do not use it for anything except UI testing.

const FILES = 'abcdefgh';
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const sqName = i => FILES[i & 7] + (8 - (i >> 3));
const sqIdx = s => (8 - +s[1]) * 8 + FILES.indexOf(s[0]);
const N = [-17, -15, -10, -6, 6, 10, 15, 17], K = [-9, -8, -7, -1, 1, 7, 8, 9];
const fileOf = i => i & 7;

export class Chess {
  constructor(fen = START) { this.load(fen); }
  reset() { this.load(START); }
  load(fen) {
    const [pos, turn, cas, ep, half, full] = fen.trim().split(/\s+/);
    this.b = new Array(64).fill(null);
    let i = 0;
    for (const ch of pos) {
      if (ch === '/') continue;
      if (/\d/.test(ch)) { i += +ch; continue; }
      const lower = ch.toLowerCase();
      this.b[i++] = { type: lower, color: ch === lower ? 'b' : 'w' };
    }
    this.t = turn || 'w';
    this.c = cas && cas !== '-' ? cas : '';
    this.ep = ep && ep !== '-' ? sqIdx(ep) : -1;
    this.half = +half || 0; this.full = +full || 1;
    this.hist = []; this.reps = new Map(); this.bump();
    this.startFen = fen;
    return true;
  }
  key() { return this.fen().split(' ').slice(0, 4).join(' '); }
  bump(d = 1) { const k = this.key(); this.reps.set(k, (this.reps.get(k) || 0) + d); }
  fen() {
    let s = '';
    for (let r = 0; r < 8; r++) {
      let e = 0;
      for (let f = 0; f < 8; f++) {
        const p = this.b[r * 8 + f];
        if (!p) { e++; continue; }
        if (e) { s += e; e = 0; }
        s += p.color === 'w' ? p.type.toUpperCase() : p.type;
      }
      if (e) s += e;
      if (r < 7) s += '/';
    }
    return `${s} ${this.t} ${this.c || '-'} ${this.ep >= 0 ? sqName(this.ep) : '-'} ${this.half} ${this.full}`;
  }
  turn() { return this.t; }
  get(s) { const p = this.b[sqIdx(s)]; return p ? { ...p } : null; }
  board() {
    const out = [];
    for (let r = 0; r < 8; r++) out.push(this.b.slice(r * 8, r * 8 + 8).map((p, f) => p ? { ...p, square: sqName(r * 8 + f) } : null));
    return out;
  }

  attacked(i, by) {
    const b = this.b;
    // pawns
    const pd = by === 'w' ? 8 : -8;
    for (const df of [-1, 1]) {
      const j = i + pd + df;
      if (j >= 0 && j < 64 && Math.abs(fileOf(j) - fileOf(i)) === 1) { const p = b[j]; if (p && p.color === by && p.type === 'p') return true; }
    }
    for (const d of N) { const j = i + d; if (j >= 0 && j < 64 && Math.abs(fileOf(j) - fileOf(i)) <= 2) { const p = b[j]; if (p && p.color === by && p.type === 'n') return true; } }
    for (const d of K) { const j = i + d; if (j >= 0 && j < 64 && Math.abs(fileOf(j) - fileOf(i)) <= 1) { const p = b[j]; if (p && p.color === by && p.type === 'k') return true; } }
    const ray = (dirs, types) => {
      for (const d of dirs) {
        let j = i;
        for (;;) {
          const pf = fileOf(j); j += d;
          if (j < 0 || j >= 64 || Math.abs(fileOf(j) - pf) > 1) break;
          const p = b[j];
          if (p) { if (p.color === by && types.includes(p.type)) return true; break; }
        }
      }
      return false;
    };
    return ray([-8, 8, -1, 1], 'rq') || ray([-9, -7, 7, 9], 'bq');
  }
  kingSq(c) { return this.b.findIndex(p => p && p.type === 'k' && p.color === c); }
  inCheck() { return this.attacked(this.kingSq(this.t), this.t === 'w' ? 'b' : 'w'); }

  pseudo() {
    const out = [], b = this.b, us = this.t, them = us === 'w' ? 'b' : 'w';
    const add = (from, to, extra = {}) => {
      const piece = b[from].type;
      const promoRank = us === 'w' ? 0 : 7;
      if (piece === 'p' && (to >> 3) === promoRank) for (const pr of 'qrbn') out.push({ from, to, piece, promotion: pr, ...extra });
      else out.push({ from, to, piece, ...extra });
    };
    for (let i = 0; i < 64; i++) {
      const p = b[i];
      if (!p || p.color !== us) continue;
      if (p.type === 'p') {
        const d = us === 'w' ? -8 : 8, startR = us === 'w' ? 6 : 1;
        if (!b[i + d]) {
          add(i, i + d);
          if ((i >> 3) === startR && !b[i + 2 * d]) add(i, i + 2 * d, { double: true });
        }
        for (const df of [-1, 1]) {
          const j = i + d + df;
          if (j < 0 || j >= 64 || Math.abs(fileOf(j) - fileOf(i)) !== 1) continue;
          if (b[j] && b[j].color === them) add(i, j, { captured: b[j].type });
          else if (j === this.ep) add(i, j, { captured: 'p', ep: j - d });
        }
      } else if (p.type === 'n' || p.type === 'k') {
        for (const d of p.type === 'n' ? N : K) {
          const j = i + d;
          if (j < 0 || j >= 64 || Math.abs(fileOf(j) - fileOf(i)) > (p.type === 'n' ? 2 : 1)) continue;
          if (!b[j]) add(i, j); else if (b[j].color === them) add(i, j, { captured: b[j].type });
        }
        if (p.type === 'k') {
          const r = us === 'w' ? 7 : 0, ks = us === 'w' ? 'K' : 'k', qs = us === 'w' ? 'Q' : 'q';
          if (i === r * 8 + 4 && !this.attacked(i, them)) {
            if (this.c.includes(ks) && !b[i + 1] && !b[i + 2] && !this.attacked(i + 1, them) && !this.attacked(i + 2, them))
              add(i, i + 2, { castle: 'k', rookFrom: i + 3, rookTo: i + 1 });
            if (this.c.includes(qs) && !b[i - 1] && !b[i - 2] && !b[i - 3] && !this.attacked(i - 1, them) && !this.attacked(i - 2, them))
              add(i, i - 2, { castle: 'q', rookFrom: i - 4, rookTo: i - 1 });
          }
        }
      } else {
        const dirs = p.type === 'r' ? [-8, 8, -1, 1] : p.type === 'b' ? [-9, -7, 7, 9] : [-8, 8, -1, 1, -9, -7, 7, 9];
        for (const d of dirs) {
          let j = i;
          for (;;) {
            const pf = fileOf(j); j += d;
            if (j < 0 || j >= 64 || Math.abs(fileOf(j) - pf) > 1) break;
            if (!b[j]) { add(i, j); continue; }
            if (b[j].color === them) add(i, j, { captured: b[j].type });
            break;
          }
        }
      }
    }
    return out;
  }

  make(m) {
    const b = this.b, us = this.t;
    const undo = { b: b.slice(), t: this.t, c: this.c, ep: this.ep, half: this.half, full: this.full };
    const piece = b[m.from];
    b[m.to] = m.promotion ? { type: m.promotion, color: us } : piece;
    b[m.from] = null;
    if (m.ep !== undefined) b[m.ep] = null;
    if (m.castle) { b[m.rookTo] = b[m.rookFrom]; b[m.rookFrom] = null; }
    const strip = (sq, chars) => { if (m.from === sq || m.to === sq) this.c = this.c.replace(new RegExp(`[${chars}]`, 'g'), ''); };
    strip(60, 'KQ'); strip(4, 'kq'); strip(63, 'K'); strip(56, 'Q'); strip(7, 'k'); strip(0, 'q');
    this.ep = m.double ? (m.from + m.to) / 2 : -1;
    this.half = piece.type === 'p' || m.captured ? 0 : this.half + 1;
    if (us === 'b') this.full++;
    this.t = us === 'w' ? 'b' : 'w';
    return undo;
  }
  unmake(u) { Object.assign(this, { b: u.b, t: u.t, c: u.c, ep: u.ep, half: u.half, full: u.full }); }

  legal() {
    const us = this.t, them = us === 'w' ? 'b' : 'w';
    return this.pseudo().filter(m => { const u = this.make(m); const ok = !this.attacked(this.kingSq(us), them); this.unmake(u); return ok; });
  }

  san(m, all) {
    let s;
    if (m.castle) s = m.castle === 'k' ? 'O-O' : 'O-O-O';
    else {
      const P = m.piece.toUpperCase();
      if (m.piece === 'p') s = (m.captured ? FILES[fileOf(m.from)] + 'x' : '') + sqName(m.to) + (m.promotion ? '=' + m.promotion.toUpperCase() : '');
      else {
        const amb = all.filter(o => o !== m && o.piece === m.piece && o.to === m.to && o.from !== m.from);
        let dis = '';
        if (amb.length) {
          const sameFile = amb.some(o => fileOf(o.from) === fileOf(m.from)), sameRank = amb.some(o => (o.from >> 3) === (m.from >> 3));
          dis = !sameFile ? FILES[fileOf(m.from)] : !sameRank ? sqName(m.from)[1] : sqName(m.from);
        }
        s = P + dis + (m.captured ? 'x' : '') + sqName(m.to);
      }
    }
    const u = this.make(m);
    if (this.inCheck()) s += this.legal().length ? '+' : '#';
    this.unmake(u);
    return s;
  }
  verbose(m, all) {
    let flags = '';
    if (m.captured) flags += m.ep !== undefined ? 'e' : 'c';
    if (m.castle) flags += m.castle;
    if (m.promotion) flags += 'p';
    if (m.double) flags += 'b';
    if (!flags) flags = 'n';
    const v = {
      color: this.t, from: sqName(m.from), to: sqName(m.to), piece: m.piece, flags,
      san: this.san(m, all), lan: sqName(m.from) + sqName(m.to) + (m.promotion || ''),
    };
    if (m.captured) v.captured = m.captured;
    if (m.promotion) v.promotion = m.promotion;
    if (m.ep !== undefined) v.captureSquare = sqName(m.ep);
    if (m.castle) { v.rookFrom = sqName(m.rookFrom); v.rookTo = sqName(m.rookTo); }
    return v;
  }

  moves({ square, verbose } = {}) {
    let all = this.legal();
    const shown = square ? all.filter(m => sqName(m.from) === square) : all;
    return shown.map(m => verbose ? this.verbose(m, all) : this.san(m, all));
  }

  move(m) {
    const all = this.legal();
    let pick = null;
    if (typeof m === 'string') {
      const lan = m.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/);
      if (lan) pick = all.find(x => sqName(x.from) === lan[1] && sqName(x.to) === lan[2] && (x.promotion || '') === (lan[3] || (x.promotion ? 'q' : '')));
      else { const clean = m.replace(/[+#?!]/g, ''); pick = all.find(x => this.san(x, all).replace(/[+#]/g, '') === clean); }
    } else if (m && m.from) {
      pick = all.find(x => sqName(x.from) === m.from && sqName(x.to) === m.to && (x.promotion || '') === (m.promotion || (x.promotion ? 'q' : '')));
    }
    if (!pick) return null;
    const v = this.verbose(pick, all);
    const u = this.make(pick);
    this.hist.push({ u, v });
    this.bump();
    return v;
  }
  undo() {
    const h = this.hist.pop();
    if (!h) return null;
    this.bump(-1);
    this.unmake(h.u);
    return h.v;
  }
  history({ verbose } = {}) { return this.hist.map(h => verbose ? { ...h.v } : h.v.san); }

  isCheckmate() { return this.inCheck() && this.legal().length === 0; }
  isStalemate() { return !this.inCheck() && this.legal().length === 0; }
  insufficient() {
    const ps = this.b.filter(p => p && p.type !== 'k');
    if (ps.length === 0) return true;
    return ps.length === 1 && (ps[0].type === 'n' || ps[0].type === 'b');
  }
  isRepetition() { return (this.reps.get(this.key()) || 0) >= 3; }
  isDraw() { return this.isStalemate() || this.half >= 100 || this.insufficient() || this.isRepetition(); }
  isGameOver() { return this.isCheckmate() || this.isDraw(); }
  outcome() {
    if (this.isCheckmate()) return { result: this.t === 'w' ? '0-1' : '1-0', reason: 'checkmate' };
    if (this.isStalemate()) return { result: '1/2-1/2', reason: 'stalemate' };
    if (this.insufficient()) return { result: '1/2-1/2', reason: 'material' };
    if (this.isRepetition()) return { result: '1/2-1/2', reason: 'repetition' };
    if (this.half >= 100) return { result: '1/2-1/2', reason: 'fifty' };
    return { result: '*', reason: null };
  }
  pgn(headers = {}) {
    const h = Object.entries(headers).map(([k, v]) => `[${k} "${v}"]`).join('\n');
    const mv = this.hist.map((x, i) => (i % 2 === 0 ? `${i / 2 + 1}. ` : '') + x.v.san).join(' ');
    return (h ? h + '\n\n' : '') + mv;
  }
  loadPgn(str) {
    this.reset();
    const body = str.replace(/\[[^\]]*\]/g, '').replace(/\{[^}]*\}/g, '').replace(/\d+\.(\.\.)?/g, ' ');
    for (const tok of body.split(/\s+/).filter(Boolean)) {
      if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(tok)) break;
      if (!this.move(tok)) return false;
    }
    return true;
  }
}
