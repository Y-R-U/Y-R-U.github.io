// node tools/core_perft.mjs [--quick]
// Perft + rules regression tests for js/chess/chess.js.
import { Position, Chess, Clock } from '../js/chess/chess.js';

const quick = process.argv.includes('--quick');
const CASES = [
  ['start', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', [20, 400, 8902, 197281, 4865609, 119060324]],
  ['kiwipete (2)', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862, 4085603, 193690690]],
  ['pos3', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238, 674624, 11030083]],
  ['pos4', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467, 422333, 15833292]],
  ['pos4 mirrored', 'r2q1rk1/pP1p2pp/Q4n2/bbp1p3/Np6/1B3NBn/pPPP1PPP/R3K2R b KQ - 0 1', [6, 264, 9467, 422333, 15833292]],
  ['pos5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379, 2103487, 89941194]],
  ['pos6', 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10', [46, 2079, 89890, 3894594, 164075551]],
];
// default depths: start 5, kiwipete 4, pos3 5, pos4 4, pos5 4, pos6 4  (--full adds one more ply)
const DEPTH = { start: 5, 'kiwipete (2)': 4, pos3: 5, pos4: 4, 'pos4 mirrored': 4, pos5: 4, pos6: 4 };
const full = process.argv.includes('--full');

let fail = 0;
const ok = (c, msg) => { if (!c) { fail++; console.log('FAIL', msg); } };

let totalNodes = 0, totalMs = 0;
for (const [name, fen, counts] of CASES) {
  const pos = new Position(fen);
  let d = (quick ? Math.min(3, DEPTH[name]) : DEPTH[name]) + (full ? 1 : 0);
  d = Math.min(d, counts.length);
  const t0 = performance.now();
  const n = pos.perft(d);
  const ms = performance.now() - t0;
  totalNodes += n; totalMs += ms;
  const pass = n === counts[d - 1];
  if (!pass) fail++;
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name.padEnd(14)} d${d} ${String(n).padStart(11)} (want ${counts[d - 1]})  ${(ms / 1000).toFixed(2)}s  ${(n / ms / 1000).toFixed(2)} Mnps`);
  ok(pos.fen().split(' ').slice(0, 4).join(' ') === new Position(fen).fen().split(' ').slice(0, 4).join(' '), name + ' position restored after perft');
}
console.log(`perft total ${totalNodes} nodes in ${(totalMs / 1000).toFixed(2)}s = ${(totalNodes / totalMs / 1000).toFixed(2)} M leaf/s`);

// ---- rules / API tests ----
const c = new Chess();
ok(c.moves().length === 20, '20 moves at start');
ok(c.move('e4').san === 'e4', 'SAN e4');
ok(c.move('e7e5').lan === 'e7e5', 'LAN e7e5');
ok(c.move({ from: 'g1', to: 'f3' }).san === 'Nf3', 'object move');
ok(c.fen() === 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2', 'fen after 3 plies: ' + c.fen());
ok(c.move('Qd5') === null, 'illegal SAN rejected');
c.undo(); c.undo(); c.undo();
ok(c.fen() === new Chess().fen(), 'undo restores');

// fool's mate
const fm = new Chess();
['f3', 'e5', 'g4', 'Qh4#'].forEach((m) => fm.move(m));
ok(fm.isCheckmate() && fm.outcome().result === '0-1' && fm.outcome().reason === 'checkmate', 'fools mate');
ok(fm.history().join(' ') === 'f3 e5 g4 Qh4#', 'history SAN with #');

// castling verbose
const cs = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
const oo = cs.move('O-O');
ok(oo && oo.rookFrom === 'h1' && oo.rookTo === 'f1' && oo.flags === 'k', 'O-O verbose rookFrom/rookTo');
const ooo = cs.move('0-0-0');
ok(ooo && ooo.rookFrom === 'a8' && ooo.rookTo === 'd8' && ooo.flags === 'q', 'O-O-O (0-0-0 accepted)');
ok(cs.fen().startsWith('2kr3r/8/8/8/8/8/8/R4RK1 w - -'), 'castled fen ' + cs.fen());
// castling through check is illegal
const ct = new Chess('r3k2r/8/8/8/8/8/5r2/R3K2R w KQkq - 0 1');
ok(!ct.moves().includes('O-O'), 'no castling through attacked f1');

// en passant
const ep = new Chess('rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3');
const epm = ep.move('exf6');
ok(epm && epm.flags === 'e' && epm.captureSquare === 'f5' && epm.captured === 'p', 'en passant verbose');
ok(ep.get('f5') === null && ep.get('f6').type === 'p', 'ep pawn removed');

// promotion
const pr = new Chess('8/P7/8/8/8/8/8/k6K w - - 0 1');
ok(pr.moves().filter((m) => m.startsWith('a8')).length === 4, '4 promotions');
const pm = pr.move('a8=N');
ok(pm && pm.promotion === 'n' && pm.flags === 'p', 'underpromotion');
pr.undo();
ok(pr.move('a7a8').promotion === 'q', 'LAN without piece promotes to queen');
pr.undo();
ok(pr.move({ from: 'a7', to: 'a8', promotion: 'r' }).san === 'Ra8+' || pr.history().slice(-1)[0] === 'a8=R+', 'object promotion');
ok(pr.history().slice(-1)[0] === 'a8=R+', 'promotion SAN with check: ' + pr.history().slice(-1)[0]);

// disambiguation
const da = new Chess('4k3/8/8/8/8/8/8/N3K2N w - - 0 1');
ok(da.moves({ square: 'a1' }).length === 2, 'moves({square})');
const dr = new Chess('3k4/8/8/R6R/8/8/8/4K3 w - - 0 1');
ok(dr.moves().includes('Rad5+') && dr.moves().includes('Rhd5+'), 'file disambiguation');
const dr2 = new Chess('3k4/R7/8/8/8/8/R7/4K3 w - - 0 1');
ok(dr2.moves().includes('R7a5') && dr2.moves().includes('R2a5'), 'rank disambiguation');
const dq = new Chess('k7/8/8/8/Q1Q5/8/Q7/7K w - - 0 1');
ok(['Qa4b3#','Q2b3#','Qcb3#'].every((x) => dq.moves().includes(x)), 'square disambiguation: ' + dq.moves().filter((m) => m.includes('b3')));
ok(dr.move('Rad5') && dr.undo() && dr.move('Ra5d5'), 'over-disambiguated SAN accepted');

// stalemate, insufficient material, fifty, threefold
const st = new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
ok(st.isStalemate() && st.outcome().reason === 'stalemate', 'stalemate');
ok(new Chess('8/8/8/4k3/8/8/2B5/4K3 w - - 0 1').outcome().reason === 'material', 'KB v K');
ok(new Chess('8/8/8/4k3/8/8/2N5/4K3 w - - 0 1').outcome().reason === 'material', 'KN v K');
ok(new Chess('8/8/8/1b2k3/8/8/2B5/4K3 w - - 0 1').outcome().reason === 'material', 'KB v KB same colour');
ok(new Chess('8/8/8/2b1k3/8/8/2B5/4K3 w - - 0 1').outcome().result === '*', 'KB v KB opposite colour playable');
ok(new Chess('8/8/8/4k3/8/8/2NN4/4K3 w - - 0 1').outcome().result === '*', 'KNN v K not auto-draw');
ok(new Chess('8/8/8/4k3/8/8/8/R3K3 w - - 100 80').outcome().reason === 'fifty', 'fifty move');
const tf = new Chess();
['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8'].forEach((m) => tf.move(m));
ok(tf.isThreefoldRepetition() && tf.outcome().reason === 'repetition', 'threefold');
ok(tf.move('e4') === null, 'no moves after game over');
// polish-3: a set-up position that is already a dead draw stays playable (moves() and move() agree);
// a capture that CREATES insufficient material still ends the game, and move() then refuses.
{
  const dead = new Chess('4k3/8/8/8/8/8/3n4/4K3 w - - 0 1');          // K v K+N, king takes the knight
  ok(dead.outcome().reason === 'material' && dead.moves().includes('Kxd2'), 'dead set-up: outcome material, Kxd2 listed');
  const v = dead.move('Kxd2');
  ok(v && v.captured === 'n' && dead.outcome().reason === 'material', 'dead set-up: Kxd2 accepted, still material');
  ok(dead.move('Ke7') && dead.move({ from: 'd2', to: 'e3' }), 'dead set-up: play continues (sandbox)');
  const live = new Chess('4k3/8/8/8/8/8/3p4/4K1N1 w - - 0 1');         // K+N v K+P: not dead yet
  ok(!live.isGameOver() && live.move('Kxd2') && live.outcome().reason === 'material', 'K+N v K+P: Kxd2 ends by material');
  ok(live.move('Ke7') === null, 'K+N v K+P: no move after the material draw');
  for (const f of ['4k3/8/8/8/8/8/3b4/4K1N1 w - - 0 1', '4k3/8/8/8/8/8/3q4/4K1N1 w - - 0 1', '4k3/8/8/8/8/8/3n4/4KN2 w - - 0 1']) {
    const c = new Chess(f); ok(c.move('Kxd2') && c.isGameOver() && c.move('Ke7') === null, 'king capture -> material draw: ' + f);
  }
  const r = new Chess('8/8/8/4k3/8/8/2N5/4K3 w - - 0 1'); r.resign('w');
  ok(r.move('Ke2') === null, 'dead set-up: resign still ends it');
  const m = new Chess('4k3/8/8/8/8/8/3n4/4K3 w - - 0 1'); m.load('4k3/8/8/8/8/8/3p4/4K1N1 w - - 0 1');
  ok(m.move('Kxd2') && m.move('Ke7') === null, 'load() resets the dead-start flag');
}
tf.undo();
ok(!tf.isThreefoldRepetition(), 'undo leaves repetition');

// timeout / resign
const to = new Chess('8/8/8/4k3/8/8/2N5/4K3 w - - 0 1');
ok(new Chess().timeout('w').result === '0-1', 'timeout loss');
const tm = new Chess('8/8/8/4k3/8/8/8/4K2Q w - - 0 1');
ok(tm.timeout('w').result === '1/2-1/2', 'timeout vs lone king = draw');

// board()
const bd = new Chess().board();
ok(bd[0][0].type === 'r' && bd[0][0].color === 'b' && bd[7][4].type === 'k' && bd[7][4].color === 'w', 'board() orientation');

// PGN round trip
const g = new Chess();
['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5', 'Bb3', 'd6', 'c3', 'O-O'].forEach((m) => g.move(m));
const pgn = g.pgn({ White: 'Alice', Black: 'Bob "the bot"' });
const g2 = new Chess();
ok(g2.loadPgn(pgn) && g2.fen() === g.fen(), 'PGN round trip');
ok(g2.header().White === 'Alice' && g2.header().Black === 'Bob "the bot"', 'PGN headers escaped');
const messy = `[Event "x"]\n[Result "1-0"]\n\n1. e4 {best by test} e5 2. Nf3 (2. f4 exf4 (2... d5)) 2... Nc6 $1 3. Bb5!? a6 1-0`;
const g3 = new Chess();
ok(g3.loadPgn(messy) && g3.history().length === 6 && g3.outcome().result === '1-0', 'messy PGN with comments/variations/NAGs');
ok(!g3.loadPgn('1. e4 e5 2. Ke3 Ke6') && g3.history().length === 6, 'bad PGN rejected, game kept');
const fp = new Chess('8/P7/8/8/8/8/8/k6K b - - 0 50');
fp.move('Kb2'); fp.move('a8=Q');
const fpg = fp.pgn();
ok(/\[FEN "/.test(fpg) && /50\.\.\. Kb2 51\. a8=Q/.test(fpg), 'PGN from FEN, black to move');
const fp2 = new Chess(); ok(fp2.loadPgn(fpg) && fp2.fen() === fp.fen(), 'PGN from FEN round trip');

// FEN validation
ok(!Chess.validateFen('8/8/8/8/8/8/8/8 w - - 0 1').ok, 'no kings rejected');
let threw = false; try { new Chess('garbage'); } catch { threw = true; }
ok(threw, 'bad FEN throws');

// Clock
const ck = new Clock({ baseMs: 300, incMs: 100 });
let flagged = null;
ck.onFlag((col) => { flagged = col; });
ck.start('w');
await new Promise((r) => setTimeout(r, 50));
ck.press();
ok(Math.abs(ck.remainingMs('w') - 350) < 25, 'increment added: ' + ck.remainingMs('w'));
ck.pause();
await new Promise((r) => setTimeout(r, 400));
ok(flagged === null, 'pause stops flag');
ck.resume();
await new Promise((r) => setTimeout(r, 450));
ok(flagged === 'b', 'black flagged: ' + flagged);
const un = new Clock({ baseMs: Infinity });
un.start('w'); ok(un.remainingMs('w') === Infinity, 'untimed');
un.dispose(); ck.dispose();

console.log(fail ? `\n${fail} FAILURE(S)` : '\nall tests passed');
process.exit(fail ? 1 : 0);
