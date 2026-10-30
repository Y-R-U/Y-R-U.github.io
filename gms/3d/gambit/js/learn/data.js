// Learn: the course. Units -> lessons -> steps. Every position and move here is checked by
// tools/learn_test.mjs (legal FENs, legal moves, mates mate, star fields solvable within `max`,
// K+P claims against the bitbase, practice games won by the engine inside the move limit).
//
// Step types (default 'info'):
//   info   {say, fen?, arrows?, zones?, tags?, dots?, label?, demo?}   Next button; demo = LAN moves animated
//   tap    {say, fen, find:[sq] | 'reach:<sq>' | coords:N}            tap all squares in `find`, or N named squares
//   stars  {say, fen, piece, stars:[sq], max}                          lone white piece collects stars + captures black pieces
//   move   {say, fen, pre?, moves:[{ok, reply?, say?}], miss?}         ok: 'e2e4|d2d4' or a test: mate check promo ep castle safe:<sq>
//   quiz   {say, fen?, q, options:[], answer, explain}
//   play   {say, fen, goal:'mate'|'promote', max, kpk?}               practice vs the engine from a set position
//   cta    {say, links:[{label, href, icon, sub}]}
// Board fields shared by every step: fen (kept from the previous step if absent), arrows [[from,to,tone]],
// zones [{sq:[...], tone}], tags {sq: text}, dots (square whose moves to show), label (name tag square).
// Tones: gold good bad blue.

/** FEN from piece lists: F('Ke1 Qd1 Pe2', 'Ke8 Pe7', 'w', 'KQkq', '-'). */
export function F(white = '', black = '', turn = 'w', castle = '-', ep = '-') {
  const g = Array.from({ length: 8 }, () => Array(8).fill(''));
  const put = (list, up) => list.split(/[\s,]+/).filter(Boolean).forEach(t => {
    const m = t.match(/^([KQRBNP])([a-h])([1-8])$/i);
    if (!m) throw new Error('bad piece ' + t);
    const ch = up ? m[1].toUpperCase() : m[1].toLowerCase();
    g[8 - +m[3]][m[2].charCodeAt(0) - 97] = ch;
  });
  put(white, true); put(black, false);
  const place = g.map(row => { let s = '', n = 0; for (const c of row) { if (!c) n++; else { if (n) s += n; n = 0; s += c; } } return s + (n || ''); }).join('/');
  return `${place} ${turn} ${castle} ${ep} 0 1`;
}
export const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
export const EMPTY = '8/8/8/8/8/8/8/8 w - - 0 1';
const file = c => [1, 2, 3, 4, 5, 6, 7, 8].map(n => c + n);
const rank = n => 'abcdefgh'.split('').map(c => c + n);
const box = (f0, f1, r0, r1) => { const o = []; for (let f = f0; f <= f1; f++) for (let r = r0; r <= r1; r++) o.push('abcdefgh'[f] + r); return o; };

export const UNITS = [
  { id: 'basics', name: 'The Basics', blurb: 'The board, the pieces and the rules', glyph: 'p' },
  { id: 'fundamentals', name: 'Fundamentals', blurb: 'Values, openings, tactics and endgames', glyph: 'n' },
  { id: 'next', name: 'Next Steps', blurb: 'How to think, ratings, where to go next', glyph: 'k' },
];

const CASTLE_W = 'Ke1 Ra1 Rh1 Pa2 Pb2 Pc2 Pf2 Pg2 Ph2', CASTLE_B = 'Ke8 Ra8 Rh8 Pa7 Pb7 Pc7 Pf7 Pg7 Ph7';

export const LESSONS = [
  // ============================================================ basics
  { id: 'board', unit: 'basics', title: 'The Board', blurb: 'Squares, files, ranks and names', glyph: 'board', steps: [
    { say: 'Welcome! A chessboard has 64 squares, light and dark. It always sits with a <b>light square</b> in your bottom-right corner.', fen: EMPTY, zones: [{ sq: ['h1'], tone: 'gold' }] },
    { say: 'The up-and-down columns are called <b>files</b>, lettered a to h. This one is the e-file.', zones: [{ sq: file('e'), tone: 'blue' }] },
    { say: 'The side-to-side rows are <b>ranks</b>, numbered 1 to 8 from White’s side. This is the 4th rank.', zones: [{ sq: rank(4), tone: 'blue' }] },
    { say: 'Put them together, file first: this square is <b>e4</b>. Every square has a name like that.', zones: [{ sq: file('e'), tone: 'blue' }, { sq: rank(4), tone: 'blue' }, { sq: ['e4'], tone: 'gold' }], tags: { e4: 'e4' } },
    { type: 'tap', say: 'Your turn! Tap each square I name.', fen: EMPTY, coords: 6 },
    { say: 'This is how every game begins. <b>White moves first</b>, then the players take turns.', fen: START },
  ] },
  { id: 'rook', unit: 'basics', title: 'The Rook', blurb: 'Straight lines, as far as you like', glyph: 'r', steps: [
    { say: 'This is the <b>rook</b>. It moves in straight lines — up, down or sideways — as far as it likes.', fen: F('Rd4'), dots: 'd4', label: 'd4' },
    { type: 'stars', say: 'Collect all the stars in <b>{max} moves</b>. Tap the rook, then tap where it should go.', fen: F('Ra1'), piece: 'a1', stars: ['a6', 'f6', 'f2'], max: 3 },
    { say: 'Pieces get in the way. The rook can’t jump over your own pawn, but it <b>captures</b> an enemy piece by landing on it.', fen: F('Rd4 Pd6', 'Ng4'), dots: 'd4' },
    { type: 'stars', say: 'Capture both black pieces and grab the star in <b>{max} moves</b>. Mind your own pawns!', fen: F('Rb2 Pb5 Pe2', 'Nh2 Pe6'), piece: 'b2', stars: ['b4'], max: 5 },
  ] },
  { id: 'bishop', unit: 'basics', title: 'The Bishop', blurb: 'Diagonals only', glyph: 'b', steps: [
    { say: 'The <b>bishop</b> moves diagonally, as far as it likes.', fen: F('Bd4'), dots: 'd4', label: 'd4' },
    { say: 'Because it only moves diagonally, a bishop stays on <b>one colour</b> all game. This one lives on the dark squares.', fen: F('Bd4'), dots: 'd4' },
    { type: 'stars', say: 'Collect the stars in <b>{max} moves</b>.', fen: F('Bc1'), piece: 'c1', stars: ['g5', 'd8', 'a5'], max: 3 },
    { type: 'stars', say: 'Capture the black pawns and grab the star in <b>{max} moves</b>. Plan your route!', fen: F('Bc1 Pd2', 'Pa3 Pg5'), piece: 'c1', stars: ['e7'], max: 3 },
  ] },
  { id: 'queen', unit: 'basics', title: 'The Queen', blurb: 'The most powerful piece', glyph: 'q', steps: [
    { say: 'The <b>queen</b> is the strongest piece: she moves like a rook and a bishop combined.', fen: F('Qd4'), dots: 'd4', label: 'd4' },
    { type: 'stars', say: 'Collect all four stars in <b>{max} moves</b>.', fen: F('Qd1'), piece: 'd1', stars: ['d7', 'h3', 'a4', 'g7'], max: 5 },
    { type: 'stars', say: 'Capture every black piece in <b>{max} moves</b>. Your pawns block some paths!', fen: F('Qa1 Pc3 Pb4', 'Pf6 Rh8 Ne1'), piece: 'a1', stars: [], max: 4 },
  ] },
  { id: 'knight', unit: 'basics', title: 'The Knight', blurb: 'The tricky L-shaped jumper', glyph: 'n', steps: [
    { say: 'The <b>knight</b> jumps in an L: two squares one way, then one to the side.', fen: F('Nd4'), dots: 'd4', label: 'd4' },
    { say: 'It is the only piece that can <b>jump over</b> others — nothing blocks a knight!', fen: F('Nb1 Pa2 Pb2 Pc2 Pd2'), dots: 'b1' },
    { type: 'tap', say: 'Tap <b>every square</b> the knight on e4 can jump to.', fen: F('Ne4'), find: 'reach:e4' },
    { type: 'stars', say: 'Hop to all three stars in <b>{max} moves</b>.', fen: F('Ng1'), piece: 'g1', stars: ['f3', 'e5', 'd7'], max: 3 },
    { type: 'stars', say: 'Trickier: collect both stars in <b>{max} moves</b>.', fen: F('Nb1'), piece: 'b1', stars: ['b3', 'c5'], max: 3 },
  ] },
  { id: 'king', unit: 'basics', title: 'The King', blurb: 'One step at a time', glyph: 'k', steps: [
    { say: 'The <b>king</b> moves one square in any direction. Slow, but he is the piece you must protect!', fen: F('Ke4'), dots: 'e4', label: 'e4' },
    { type: 'stars', say: 'Walk the king to all three stars in <b>{max} moves</b>.', fen: F('Ke1'), piece: 'e1', stars: ['e3', 'g4', 'c4'], max: 7 },
    { say: 'The king may <b>never move into check</b>. The black rook guards the d-file, so those squares are off limits.', fen: F('Ke4', 'Ka8 Rd8'), dots: 'e4', zones: [{ sq: file('d'), tone: 'bad' }] },
  ] },
  { id: 'pawn', unit: 'basics', title: 'The Pawn', blurb: 'Small but mighty', glyph: 'p', steps: [
    { say: '<b>Pawns</b> move straight forward one square. On its very first move, a pawn may jump two.', fen: F('Pe2'), dots: 'e2', label: 'e2' },
    { say: 'Pawns <b>capture diagonally</b>, one square forward. They can’t capture straight ahead — the e5 pawn blocks it.', fen: F('Pe4', 'Pd5 Pe5'), dots: 'e4', demo: ['e4d5'] },
    { type: 'stars', say: 'Capture both black pawns in <b>{max} moves</b>. Remember the two-square first step!', fen: F('Pb2', 'Pc5 Pd7'), piece: 'b2', stars: [], max: 4 },
  ] },
  { id: 'promotion', unit: 'basics', title: 'Promotion', blurb: 'Pawns that become queens', glyph: 'q', steps: [
    { say: 'When a pawn reaches the far side it <b>promotes</b>: it becomes a queen, rook, bishop or knight. Nearly always a queen!', fen: F('Pe7'), demo: ['e7e8q'] },
    { type: 'stars', say: 'Promote the pawn, then use your new queen to grab the stars. <b>{max} moves</b>.', fen: F('Pg6'), piece: 'g6', stars: ['a2', 'h2'], max: 4 },
    { type: 'move', say: 'Now for real: push the pawn to the last rank and choose a <b>queen</b>.', fen: F('Kc1 Pb7', 'Kh7'), moves: [{ ok: 'b7b8q' }], miss: 'Push the b-pawn one more square.' },
  ] },
  { id: 'check', unit: 'basics', title: 'Check', blurb: 'Attacking the king', glyph: 'k', steps: [
    { say: 'When a piece attacks the enemy king, that’s <b>check</b>. The king must get out of it at once.', fen: F('Kg1 Re1', 'Ke8', 'b'), arrows: [['e1', 'e8', 'bad']] },
    { type: 'move', say: 'Give check! Any rook move that attacks the black king will do.', fen: F('Kg1 Ra1', 'Ke5'), moves: [{ ok: 'check' }], miss: 'That doesn’t attack the king. Find a file or rank the king is on.' },
    { say: 'There are three ways out of check: <b>move</b> the king, <b>block</b> the attack, or <b>capture</b> the attacker.', fen: F('Kg1 Nf3 Pf2 Pg2 Ph2', 'Kh8 Re1') , arrows: [['e1', 'g1', 'bad']] },
    { type: 'move', say: 'The black rook checks your king. <b>Capture</b> it!', fen: F('Kg1 Nf3 Pf2 Pg2 Ph2', 'Kh8 Re1'), moves: [{ ok: 'f3e1' }], miss: 'Your knight can reach e1.' },
    { type: 'move', say: 'Now the bishop checks you. <b>Block</b> the line with your rook.', fen: F('Kg1 Rd2 Pg2 Ph2', 'Kh8 Bc5'), moves: [{ ok: 'd2f2|d2d4' }], miss: 'Put the rook on the bishop’s diagonal, between it and your king.' },
    { type: 'move', say: 'No captures or blocks this time. <b>Move</b> your king to safety.', fen: F('Kg1 Pf2 Pg2 Ph3', 'Kg8 Ra1'), moves: [{ ok: 'g1h2' }], miss: 'Only one square is safe. Look at the h-file.' },
  ] },
  { id: 'checkmate', unit: 'basics', title: 'Checkmate', blurb: 'How games are won', glyph: 'k', steps: [
    { say: '<b>Checkmate</b> is check with no way out: the king can’t move, block or capture. That wins the game!', fen: F('Kg1 Ra8 Pf2 Pg2 Ph2', 'Kg8 Pf7 Pg7 Ph7', 'b'), arrows: [['a8', 'g8', 'bad']] },
    { type: 'move', say: 'Your turn: <b>checkmate in one</b>. The black king is trapped behind its own pawns.', fen: F('Kg1 Ra1 Pf2 Pg2 Ph2', 'Kg8 Pf7 Pg7 Ph7'), moves: [{ ok: 'mate' }], miss: 'The back rank is the weak spot.' },
    { type: 'move', say: 'Mate in one with the queen. Your king can help!', fen: F('Kg6 Qa7', 'Kg8'), moves: [{ ok: 'mate' }], miss: 'Bring the queen next to the king, where your own king protects her — or check along the edge.' },
    { type: 'move', say: 'A knight can mate too. The black king is smothered by its own pieces!', fen: F('Kg1 Ng5 Pg2 Ph2', 'Kh8 Rg8 Pg7 Ph7'), moves: [{ ok: 'mate' }], miss: 'Which square does the knight attack h8 from?' },
  ] },
  { id: 'stalemate', unit: 'basics', title: 'Stalemate', blurb: 'The draw to avoid', glyph: 'k', steps: [
    { say: 'If the player to move has <b>no legal move</b> but is <b>not</b> in check, it’s <b>stalemate</b>: the game is a draw.', fen: F('Kh1 Qb6', 'Ka8', 'b'), zones: [{ sq: ['a7', 'b7', 'b8'], tone: 'bad' }] },
    { type: 'quiz', say: 'White just played Qg6. What happened?', fen: F('Kf7 Qg6', 'Kh8', 'b'), q: 'What is this position?', options: ['Checkmate — White wins', 'Stalemate — a draw', 'Nothing special'], answer: 1, explain: 'Black is not in check but has no legal move, so it’s a draw. Ouch!' },
    { type: 'move', say: 'Mate in one — but careful! One natural-looking queen move is stalemate.', fen: F('Kb6 Qe7', 'Ka8'), moves: [{ ok: 'mate' }], trap: 'stalemate', miss: 'Give check — don’t just take squares away.' },
  ] },
  { id: 'castling', unit: 'basics', title: 'Castling', blurb: 'King safety in one move', glyph: 'r', steps: [
    { say: '<b>Castling</b> tucks your king away: it slides two squares toward a rook, and the rook hops over to its other side.', fen: F(CASTLE_W, CASTLE_B, 'w', 'KQkq'), demo: ['e1g1'] },
    { type: 'move', say: 'Castle <b>kingside</b>: move your king two squares toward the h1 rook.', fen: F(CASTLE_W, CASTLE_B, 'w', 'KQkq'), moves: [{ ok: 'e1g1' }], miss: 'Drag the king from e1 to g1.' },
    { say: 'You can’t castle out of check, through an attacked square, or if the king or that rook has already moved.', fen: F(CASTLE_W, 'Ke8 Bc4 Pa7 Pb7 Pg7 Ph7', 'w', 'KQ'), arrows: [['c4', 'f1', 'bad']] },
    { type: 'quiz', say: 'The black bishop is eyeing f1.', fen: F(CASTLE_W, 'Ke8 Bc4 Pa7 Pb7 Pg7 Ph7', 'w', 'KQ'), q: 'Can White castle kingside here?', options: ['Yes', 'No — the king would pass through f1, which the bishop attacks'], answer: 1, explain: 'Right: the king may not cross an attacked square.' },
    { type: 'move', say: 'But queenside is fine! Castle <b>queenside</b>: king two squares toward the a1 rook.', fen: F(CASTLE_W, 'Ke8 Bc4 Pa7 Pb7 Pg7 Ph7', 'w', 'KQ'), moves: [{ ok: 'e1c1' }], miss: 'Move the king from e1 to c1.' },
  ] },
  { id: 'enpassant', unit: 'basics', title: 'En Passant', blurb: 'The special pawn capture', glyph: 'p', steps: [
    { say: '<b>En passant</b>: if an enemy pawn jumps two squares and lands right beside your pawn, you may capture it as if it had moved one.', fen: F('Kg1 Pe5', 'Kg8 Pd7', 'b'), demo: ['d7d5', 'e5d6'] },
    { type: 'move', say: 'Watch Black’s pawn jump past yours — then capture it <b>en passant</b>!', fen: F('Kg1 Pe5 Pg2 Ph2', 'Kg8 Pd7 Pg7 Ph7', 'b'), pre: 'd7d5', moves: [{ ok: 'ep' }], miss: 'Move your e5 pawn diagonally behind the black pawn, to d6.' },
    { say: 'It only works <b>straight away</b>. If you wait a move, the chance is gone.' },
  ] },
  { id: 'draws', unit: 'basics', title: 'Draws', blurb: 'When nobody wins', glyph: 'k', steps: [
    { say: 'A game can also end in a <b>draw</b>. Stalemate is one way; here are the others.', fen: F('Kd4 Bc1', 'Ke6') },
    { type: 'quiz', say: 'White has a king and a bishop. Black has only a king.', q: 'Who wins?', options: ['White wins', 'Nobody — it’s a draw', 'Black wins'], answer: 1, explain: 'A lone bishop or knight can’t checkmate. Not enough material is an automatic draw.' },
    { type: 'quiz', say: 'Sometimes both sides keep repeating moves.', q: 'The same position appears for the third time. What happens?', options: ['It’s a draw (threefold repetition)', 'The player who repeated loses', 'Nothing'], answer: 0, explain: 'Threefold repetition is a draw.' },
    { type: 'quiz', say: 'And sometimes nothing happens for ages.', q: '50 moves each pass with no capture and no pawn move. Then…', options: ['Either player can claim a draw', 'White wins', 'Black must resign'], answer: 0, explain: 'That’s the 50-move rule.' },
    { say: 'And of course, the players can simply <b>agree</b> to a draw.' },
  ] },

  // ============================================================ fundamentals
  { id: 'values', short: 'Piece Values', unit: 'fundamentals', title: 'Piece Values', blurb: 'Good trades and bad trades', glyph: 'q', steps: [
    { say: 'Pieces have rough <b>points</b>: pawn 1, knight 3, bishop 3, rook 5, queen 9. The king can never be traded.', fen: F('Pb4 Nc4 Bd4 Re4 Qf4 Kg4'), tags: { b4: '1', c4: '3', d4: '3', e4: '5', f4: '9', g4: '∞' } },
    { type: 'quiz', say: 'Use the points to judge a trade.', q: 'You can give your knight for their rook. Good deal?', options: ['Yes — you gain 2 points', 'No — you lose points', 'It’s an even trade'], answer: 0, explain: 'A rook (5) for a knight (3) is a win of about 2 points.' },
    { type: 'quiz', say: 'Combinations add up too.', q: 'Which is worth about the same as a rook?', options: ['A knight', 'A bishop and two pawns', 'A queen'], answer: 1, explain: '3 + 1 + 1 = 5.' },
    { type: 'move', say: 'Black left a piece undefended. Take the <b>free piece</b>!', fen: F('Kg1 Re1 Bb2 Pf2 Pg2 Ph2', 'Kg8 Ne4 Pf7 Pg7 Ph7'), moves: [{ ok: 'e1e4', tactic: 1 }], miss: 'Look for a black piece nobody protects. The g7 pawn is guarded by the king.' },
  ] },
  { id: 'opening', short: 'Openings', unit: 'fundamentals', title: 'Opening Principles', blurb: 'Centre, develop, castle', glyph: 'n', steps: [
    { say: 'Three big ideas for the opening: <b>control the centre</b>, <b>develop</b> your pieces, and <b>castle</b> early.', fen: START },
    { type: 'tap', say: 'The four <b>centre squares</b> matter most. Tap all four!', fen: START, find: ['d4', 'e4', 'd5', 'e5'] },
    { type: 'move', say: 'Let’s play a model opening.', fen: START, moves: [
      { ok: 'e2e4', say: 'Grab the centre: push your <b>e-pawn two squares</b>, to e4.', reply: 'e7e5' },
      { ok: 'g1f3', say: 'Develop a <b>knight</b> toward the centre — and it attacks Black’s pawn!', reply: 'b8c6' },
      { ok: 'f1c4', say: 'Bring out a <b>bishop</b>. On c4 it aims at f7, Black’s weak spot.', reply: 'f8c5' },
      { ok: 'e1g1', say: 'Now <b>castle</b> kingside to keep your king safe.' },
    ], miss: 'A fine idea, but let’s follow the plan for now.' },
    { type: 'quiz', say: 'Great start: centre, two pieces out, king safe.', q: 'Which is usually a <b>bad</b> idea in the opening?', options: ['Moving the same piece again and again', 'Developing knights and bishops', 'Castling early'], answer: 0, explain: 'Every move spent shuffling one piece is a move your other pieces sit at home.' },
  ] },
  { id: 'forks', unit: 'fundamentals', title: 'Forks', blurb: 'Attack two things at once', glyph: 'n', steps: [
    { say: 'A <b>fork</b> is one piece attacking two at once. Your opponent can only save one!', fen: F('Kg1 Nc7', 'Ke8 Ra8', 'b'), arrows: [['c7', 'e8', 'bad'], ['c7', 'a8', 'bad']] },
    { type: 'move', say: 'Find the knight jump that attacks the king <b>and</b> the rook.', fen: F('Kg1 Nb5 Pf2 Pg2 Ph2', 'Ke8 Ra8 Pf7 Pg7 Ph7'), moves: [{ ok: 'b5c7', reply: 'e8e7', tactic: 1 }, { ok: 'c7a8', say: 'The king had to move. Now take the rook!' }], miss: 'Look for a square where the knight hits both e8 and a8.' },
    { type: 'move', say: 'Pawns fork too! Push a pawn to attack both black pieces.', fen: F('Kg1 Rc1 Nb1 Pa2 Pd4 Pf2 Pg2 Ph2', 'Kg8 Nc6 Re6 Pa7 Pf7 Pg7 Ph7'), moves: [{ ok: 'd4d5', reply: 'e6e2', tactic: 1 }, { ok: 'd5c6', say: 'The rook ran away. Capture the knight!' }], miss: 'Which pawn can step forward next to both the knight and the rook?' },
    { type: 'move', say: 'The queen is a great forker. Check the king and hit the loose rook!', fen: F('Kg1 Qe2 Pf2 Pg2 Ph2', 'Kh8 Rb8 Pa6 Pf7 Ph7'), moves: [{ ok: 'e2e5', reply: 'h8g8', tactic: 1 }, { ok: 'e5b8', say: 'The king stepped away. Now collect the rook!' }], miss: 'Find a queen check on the long diagonal that also hits the rook on b8.' },
  ] },
  { id: 'pins', unit: 'fundamentals', title: 'Pins', blurb: 'Pieces that can’t move', glyph: 'b', steps: [
    { say: 'A <b>pin</b>: the knight can’t move, because that would expose its king behind it.', fen: F('Kg1 Bb5', 'Ke8 Nc6', 'b'), arrows: [['b5', 'e8', 'bad']] },
    { type: 'move', say: 'The black knight is pinned. Attack it with a <b>pawn</b> and win it!', fen: F('Kg1 Bb5 Pd4 Pf2 Pg2 Ph2', 'Ke8 Nc6 Pb7 Pf7 Pg7 Ph7'), moves: [{ ok: 'd4d5', reply: 'h7h6', tactic: 1 }, { ok: 'd5c6', say: 'The knight still can’t move. Take it!' }], miss: 'A pawn attack on the pinned knight can’t be escaped.' },
    { type: 'move', say: 'Use your rook to <b>pin the black queen</b> to her king.', fen: F('Kf2 Ra1 Pg2 Ph2', 'Ke8 Qe5 Pa7 Pg7 Ph7'), moves: [{ ok: 'a1e1', reply: 'e5e1', tactic: 1 }, { ok: 'f2e1', say: 'The queen took the rook in despair. Recapture!' }], miss: 'Put the rook on the same file as the queen and the king.' },
  ] },
  { id: 'skewers', unit: 'fundamentals', title: 'Skewers', blurb: 'A pin in reverse', glyph: 'r', steps: [
    { say: 'A <b>skewer</b> is a pin in reverse: attack the valuable piece, and when it moves, take the one behind.', fen: F('Kg1 Re1', 'Ke5 Qe8', 'b'), arrows: [['e1', 'e8', 'bad']] },
    { type: 'move', say: 'Check the king with your rook so the queen behind it falls.', fen: F('Kg1 Ra1 Pf2 Pg2 Ph2', 'Ke5 Qe8 Pa7'), moves: [{ ok: 'a1e1', reply: 'e5d4', tactic: 1 }, { ok: 'e1e8', say: 'The king stepped aside. Take the queen!' }], miss: 'The king and queen share a file.' },
    { type: 'move', say: 'Now with a bishop: check the king, win the rook.', fen: F('Ka3 Bc8 Pa2', 'Kd5 Rh1 Ph7'), moves: [{ ok: 'c8b7', reply: 'd5e5', tactic: 1 }, { ok: 'b7h1', say: 'And the rook in the corner is yours.' }], miss: 'The king and rook share the long diagonal.' },
  ] },
  { id: 'discovered', short: 'Discoveries', unit: 'fundamentals', title: 'Discovered Attacks', blurb: 'Unleash the piece behind', glyph: 'b', steps: [
    { say: 'A <b>discovered attack</b>: move one piece out of the way, and the piece behind it attacks.', fen: F('Kg1 Re1 Be5 Pf2 Pg2 Ph2', 'Ke8 Qb2 Pa7 Pf7 Ph7'), arrows: [['e1', 'e8', 'bad'], ['e5', 'b2', 'good']] },
    { type: 'move', say: 'Move the bishop to uncover a check from your rook — and win something big!', fen: F('Kg1 Re1 Be5 Pf2 Pg2 Ph2', 'Ke8 Qb2 Pa7 Pf7 Ph7'), moves: [{ ok: 'e5b2|e5f6|e5d4|e5c3', tactic: 1 }], miss: 'While the rook gives check, the bishop can take anything it likes.' },
    { type: 'move', say: 'Jump the knight away with <b>check</b>, and your rook hits the queen.', fen: F('Kg1 Rd1 Nd4 Pf2 Pg2 Ph2', 'Kg7 Qd8 Pa7 Ph7'), moves: [{ ok: 'd4e6|d4f5', reply: 'g7g8', tactic: 1 }, { ok: 'd1d8|e6d8', say: 'Black had to deal with the check. The queen is yours!' }], miss: 'The knight must give check so Black has no time to save the queen.' },
  ] },
  { id: 'kqk', short: 'Queen Mate', unit: 'fundamentals', title: 'Mate with the Queen', blurb: 'King and queen vs king', glyph: 'q', steps: [
    { say: 'With king and queen against a lone king you can always force <b>checkmate</b>. First, the queen shrinks the king’s box.', fen: F('Kd1 Qd4', 'Kf6'), zones: [{ sq: box(4, 7, 4, 7), tone: 'blue' }] },
    { say: 'Then march your king up to help. The finish is on the edge, with your king guarding the escape squares.', fen: F('Kc6 Qb7', 'Ka8', 'b'), arrows: [['b7', 'a8', 'bad']] },
    { say: 'Golden rule: never leave the black king with <b>no move</b> unless it’s check — that’s stalemate!', fen: F('Kc6 Qb6', 'Ka8', 'b'), zones: [{ sq: ['a7', 'b7', 'b8'], tone: 'bad' }] },
    { type: 'play', say: 'Your turn: checkmate the black king within <b>{max} moves</b>. Black defends as well as it can.', fen: F('Kd1 Qh1', 'Ke5'), goal: 'mate', max: 15 },
  ] },
  { id: 'krk', short: 'Rook Mate', unit: 'fundamentals', title: 'Mate with the Rook', blurb: 'King and rook vs king', glyph: 'r', steps: [
    { say: 'A rook can mate too. It <b>cuts the king off</b> along a rank or file, like a wall.', fen: F('Kd2 Rh5', 'Kd7'), zones: [{ sq: rank(5), tone: 'blue' }] },
    { say: 'Bring your king up opposite the black king, then check along the edge. Mate!', fen: F('Kg6 Ra8', 'Kg8', 'b'), arrows: [['a8', 'g8', 'bad']] },
    { type: 'play', say: 'Your turn: checkmate within <b>{max} moves</b>. Be patient: walk your king up and keep the wall.', fen: F('Kd1 Ra1', 'Ke5'), goal: 'mate', max: 30 },
  ] },
  { id: 'square', short: 'Square Rule', unit: 'fundamentals', title: 'The Square Rule', blurb: 'Can the king catch the pawn?', glyph: 'p', steps: [
    { say: '<b>The rule of the square</b>: draw a box from the pawn to its promotion rank. If the enemy king can step inside, it catches the pawn.', fen: F('Kh1 Pb4', 'Kg6', 'b'), zones: [{ sq: box(1, 5, 4, 8), tone: 'blue' }] },
    { type: 'quiz', say: 'Black to move. Count it out!', fen: F('Kh1 Pb4', 'Kg6', 'b'), zones: [{ sq: box(1, 5, 4, 8), tone: 'blue' }], q: 'Can the black king catch the pawn?', options: ['Yes — it can step into the square', 'No — the pawn runs home'], answer: 0, explain: 'One step to f5 puts the king inside the square, and it catches the pawn in time.', kpk: 'draw' },
    { type: 'play', say: 'White to move: the black king is <b>outside</b> the square. Push the pawn and win the race!', fen: F('Kh1 Pb4', 'Kh6'), zones: [{ sq: box(1, 4, 5, 8), tone: 'blue' }], goal: 'promote', max: 4, kpk: true },
  ] },
  { id: 'opposition', short: 'Opposition', unit: 'fundamentals', title: 'The Opposition', blurb: 'King and pawn endgames', glyph: 'k', steps: [
    { say: 'Kings can never stand side by side. When they face each other with one square between, the side <b>not</b> to move has the <b>opposition</b>.', fen: F('Ke4', 'Ke6', 'w'), zones: [{ sq: ['e5'], tone: 'bad' }] },
    { say: 'Here White must move, so Black has the opposition: the white king has to give way.', fen: F('Ke4', 'Ke6', 'w'), dots: 'e4' },
    { type: 'play', say: 'Win this! Take the <b>opposition</b>, and promote your pawn. One slip and it’s a draw.', fen: '8/8/4k3/8/3K4/4P3/8/8 w - - 0 1', goal: 'promote', max: 12, kpk: true },
  ] },

  // ============================================================ next steps
  { id: 'routine', short: 'How to Think', unit: 'next', title: 'Checks, Captures, Threats', blurb: 'A thinking routine for every move', glyph: 'n', steps: [
    { say: 'Before every move, ask: do I have a <b>check</b>? A <b>capture</b>? And what does my opponent <b>threaten</b>?', fen: START },
    { type: 'move', say: '<b>Checks</b> first. One queen check here wins the rook.', fen: F('Kg1 Qd1 Pf2 Pg2 Ph2', 'Kg8 Ra8 Pa6 Pg7 Ph7'), moves: [{ ok: 'd1d5', reply: 'g8h8', tactic: 1 }, { ok: 'd5a8', say: 'And it’s even checkmate!' }], miss: 'Look for a check on the diagonal that also points at a8.' },
    { type: 'move', say: 'Now <b>captures</b>: Black’s queen is hanging. Grab it!', fen: F('Kg1 Bb2 Rd1 Pf2 Pg2 Ph2', 'Kg8 Qf6 Re8 Pa7 Pf7 Ph7'), moves: [{ ok: 'b2f6', tactic: 1 }], miss: 'Which of your pieces can reach f6?' },
    { type: 'move', say: '<b>Threats</b>: the black knight attacks your queen! Move her to a safe square.', fen: F('Kg1 Qd4 Pf2 Pg2 Ph2', 'Kg8 Nc6 Pb7 Pf7 Pg7 Ph7'), moves: [{ ok: 'safe:d4' }], miss: 'Move the queen somewhere no black piece can capture her.' },
  ] },
  { id: 'ratings', short: 'Ratings', unit: 'next', title: 'Ratings & the Ladder', blurb: 'What the numbers mean', glyph: 'k', steps: [
    { say: 'Your <b>rating</b> is a number that shows how strong you play. Win and it goes up; lose and it goes down.', fen: START },
    { say: 'Beating someone rated <b>higher</b> earns more than beating someone lower. Draws count a little too.' },
    { say: 'GAMBIT’s bots run from <b>Pip</b> (125) all the way to <b>The Machine</b> (3300+). Pick one near your level for a fair fight.' },
    { say: 'Every bot game earns <b>ladder points</b>. Wins against stronger bots are worth far more, so climb when you’re ready.' },
    { type: 'quiz', say: 'Quick check.', q: 'You’re rated 800. Which win earns the most ladder points?', options: ['Beating Pip (125)', 'Beating a 1200 bot', 'They’re all the same'], answer: 1, explain: 'The stronger the bot compared with you, the bigger the reward.' },
    { say: 'Puzzles have their own <b>puzzle rating</b> too, so you can watch your tactics improve.' },
  ] },
  { id: 'next', short: 'What Next', unit: 'next', title: 'Where to Go Next', blurb: 'Keep learning by playing', glyph: 'k', steps: [
    { say: 'You know the rules and your first tactics. The best way to improve: <b>play</b> games and <b>solve</b> a few puzzles every day.', fen: START },
    { type: 'cta', say: 'Where to next?', links: [
      { label: 'Solve puzzles', sub: 'Start with mate-in-one', href: '#/puzzles', icon: 'puzzle' },
      { label: 'Play Pip', sub: 'The friendliest bot (125)', href: '#/play/bot/pip', icon: 'robot' },
      { label: 'All bots', sub: 'Climb the ladder', href: '#/play/bot', icon: 'trophy' },
    ] },
  ] },
];

export const lessonById = id => LESSONS.find(l => l.id === id) || null;
export const unitById = id => UNITS.find(u => u.id === id) || null;
