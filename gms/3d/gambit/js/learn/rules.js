// Learn: move-goal tests shared by the lesson player and tools/learn_test.mjs.
//   ok = 'e2e4|d2d4'  (any of these LANs)
//      | 'mate' | 'check' | 'promo' | 'ep' | 'castle'
//      | 'safe:<sq>'  (move the piece on <sq> to a square no enemy piece can capture on)
// goalTest(ok, chess, verboseMove) is called BEFORE the move is made on `chess`.

export const hasKings = fen => { const p = fen.split(' ')[0]; return p.includes('K') && p.includes('k'); };

/** The LAN list of an `ok`, or null if it is a named test. */
export function parseOk(ok) {
  return /^[a-h][1-8][a-h][1-8][qrbn]?(\|[a-h][1-8][a-h][1-8][qrbn]?)*$/.test(ok) ? ok.split('|') : null;
}

export function goalTest(ok, chess, m) {
  const lans = parseOk(ok);
  if (lans) return lans.includes(m.lan) || (m.promotion === 'q' && lans.includes(m.lan.slice(0, 4)));
  if (ok === 'mate') return !!m.mate;
  if (ok === 'check') return !!m.check;
  if (ok === 'promo') return !!m.promotion;
  if (ok === 'ep') return m.flags.includes('e');
  if (ok === 'castle') return /[kq]/.test(m.flags);
  if (ok.startsWith('safe:')) {
    if (m.from !== ok.slice(5)) return false;
    chess.move(m.lan);
    const hit = chess.moves({ verbose: true }).some(r => r.to === m.to);
    chess.undo();
    return !hit;
  }
  return false;
}
