// Learn: an exact king + pawn vs king bitbase (win / draw for the side with the pawn), built by
// retrograde iteration the first time it is needed (~0.2 s). Lets the K+P lessons accept ANY
// winning move and say "that lets Black draw" the moment the player slips.
//
//   kpkProbe(fen) -> 'win' | 'draw' | null (null = not a K+P v K position)
// Pure module (node + browser).

const UNKNOWN = 0, WIN = 1, DRAW = 2, INVALID = 3;
let table = null;

const fl = s => s & 7, rk = s => s >> 3;
const dist = (a, b) => Math.max(Math.abs(fl(a) - fl(b)), Math.abs(rk(a) - rk(b)));
const idx = (stm, wk, bk, p) => ((stm * 64 + wk) * 64 + bk) * 48 + (p - 8);
const KSTEPS = [];
for (let s = 0; s < 64; s++) {
  const out = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    if (!dx && !dy) continue;
    const x = fl(s) + dx, y = rk(s) + dy;
    if (x >= 0 && x < 8 && y >= 0 && y < 8) out.push(y * 8 + x);
  }
  KSTEPS.push(out);
}
const pawnHits = (p, s) => rk(s) === rk(p) + 1 && Math.abs(fl(s) - fl(p)) === 1;

function build() {
  const t = new Uint8Array(2 * 64 * 64 * 48);
  // initial classification
  for (let stm = 0; stm < 2; stm++) for (let wk = 0; wk < 64; wk++) for (let bk = 0; bk < 64; bk++) for (let p = 8; p < 56; p++) {
    const i = idx(stm, wk, bk, p);
    if (wk === bk || wk === p || bk === p || dist(wk, bk) <= 1 || (stm === 0 && pawnHits(p, bk))) { t[i] = INVALID; continue; }
    if (stm === 0) {
      const push = p + 8;
      if (rk(p) === 6 && push !== wk && push !== bk && (dist(bk, push) > 1 || dist(wk, push) === 1)) t[i] = WIN;
    } else {
      if (dist(bk, p) === 1 && dist(wk, p) > 1) { t[i] = DRAW; continue; }
      let any = false;
      for (const s of KSTEPS[bk]) if (dist(s, wk) > 1 && !pawnHits(p, s)) { any = true; break; }
      if (!any) t[i] = pawnHits(p, bk) ? WIN : DRAW;   // mate by the pawn, or stalemate
    }
  }
  // iterate to a fixed point
  for (let changed = true; changed;) {
    changed = false;
    for (let stm = 0; stm < 2; stm++) for (let wk = 0; wk < 64; wk++) for (let bk = 0; bk < 64; bk++) for (let p = 8; p < 56; p++) {
      const i = idx(stm, wk, bk, p);
      if (t[i] !== UNKNOWN) continue;
      let win = false, unknown = false, draw = false;
      const see = v => { if (v === WIN) win = true; else if (v === DRAW) draw = true; else if (v === UNKNOWN) unknown = true; };
      if (stm === 0) {
        for (const s of KSTEPS[wk]) if (s !== p && dist(s, bk) > 1) see(t[idx(1, s, bk, p)]);
        const push = p + 8;
        if (push !== wk && push !== bk) {
          if (rk(push) === 7) see(DRAW);   // promotes but is taken (the winning case was classified above)
          else {
            see(t[idx(1, wk, bk, push)]);
            if (rk(p) === 1 && push + 8 !== wk && push + 8 !== bk) see(t[idx(1, wk, bk, push + 8)]);
          }
        }
        if (win) t[i] = WIN; else if (!unknown) t[i] = DRAW; else continue;
      } else {
        for (const s of KSTEPS[bk]) {
          if (dist(s, wk) <= 1 || pawnHits(p, s)) continue;
          if (s === p) { see(DRAW); continue; }
          see(t[idx(0, wk, s, p)]);
        }
        if (draw) t[i] = DRAW; else if (!unknown) t[i] = WIN; else continue;
      }
      changed = true;
    }
  }
  return t;
}

function parse(fen) {
  const [place, turn] = fen.split(' ');
  const pcs = [];
  place.split('/').forEach((row, i) => {
    let x = 0;
    for (const ch of row) { if (/\d/.test(ch)) { x += +ch; continue; } pcs.push({ ch, s: (7 - i) * 8 + x }); x++; }
  });
  return { pcs, turn };
}

export function kpkProbe(fen) {
  const { pcs, turn } = parse(fen);
  if (pcs.length !== 3) return null;
  const get = c => pcs.find(p => p.ch === c);
  let wk = get('K'), bk = get('k'), wp = get('P'), bp = get('p');
  if (!wk || !bk || (!wp === !bp)) return null;
  let stm = turn === 'w' ? 0 : 1, a = wk.s, b = bk.s, p = (wp || bp).s;
  if (bp) { const m = s => (7 - rk(s)) * 8 + fl(s); [a, b] = [m(b), m(a)]; p = m(p); stm ^= 1; }   // mirror: the pawn side becomes White
  if (p < 8 || p > 55) return null;
  table ||= build();
  const v = table[idx(stm, a, b, p)];
  return v === WIN ? 'win' : v === INVALID ? null : 'draw';
}
