// node sim.mjs [games] — headless soak test for the match-3 engine.
// Plays random valid moves, checking invariants after every action.
import { Board } from './js/board.js';
import { seededRng } from './js/utils.js';

const games = parseInt(process.argv[2] || '200', 10);
let totalMoves = 0, totalPoints = 0, maxCascade = 0, crushes = 0, specials = {}, combos = {}, shuffles = 0, prismZaps = 0;

function check(board, label) {
  for (let r = 0; r < board.rows; r++)
    for (let c = 0; c < board.cols; c++) {
      const g = board.at(r, c);
      if (!g) throw new Error(`${label}: hole at ${r},${c}`);
      if (g.color === -1 && g.special !== 'prism') throw new Error(`${label}: colorless non-prism`);
      if (g.color < -1 || g.color >= board.numColors) throw new Error(`${label}: bad color ${g.color}`);
    }
  const ids = new Set();
  board.forEach(g => {
    if (ids.has(g.id)) throw new Error(`${label}: duplicate gem id ${g.id}`);
    ids.add(g.id);
  });
  if (board.findRuns().length > 0) throw new Error(`${label}: unresolved runs left on board`);
}

for (let g = 0; g < games; g++) {
  const rng = seededRng(1234 + g);
  const board = new Board({ rng, metalChance: 0.06 + (g % 5) * 0.05 });
  check(board, `game ${g} fill`);
  for (let m = 0; m < 120; m++) {
    let moves = board.findMoves();
    if (!moves.length) { board.shuffleBoard(); shuffles++; moves = board.findMoves(); }
    if (!moves.length) throw new Error(`game ${g}: shuffle produced no moves`);
    const mv = moves[Math.floor(rng() * moves.length)];
    const res = board.trySwap(mv.a, mv.b);
    if (!res.valid) throw new Error(`game ${g} move ${m}: findMoves suggested invalid swap ${JSON.stringify(mv)}`);
    totalMoves++;
    totalPoints += res.points;
    maxCascade = Math.max(maxCascade, res.cascades);
    if (res.combo) combos[res.combo] = (combos[res.combo] || 0) + 1;
    for (const ev of res.events) {
      if (ev.t === 'clear') {
        crushes += ev.crushes.length;
        for (const sp of ev.spawned) specials[sp.gem.special] = (specials[sp.gem.special] || 0) + 1;
        for (const act of ev.activations) if (act.kind === 'prism') prismZaps++;
        for (const cell of ev.cells) if (!cell.gem) throw new Error('clear event cell without gem');
      }
      if (ev.t === 'fall') {
        for (const s of ev.spawns) if (!s.gem) throw new Error('fall spawn without gem');
      }
    }
    check(board, `game ${g} move ${m}`);
    // occasionally exercise boosters
    if (m % 37 === 20) { board.activate(3, 3, 1); check(board, `game ${g} forge ${m}`); }
    if (m % 53 === 40) { board.addPrism(); check(board, `game ${g} prism ${m}`); }
  }
}

console.log(`OK: ${games} games, ${totalMoves} moves, ${totalPoints} pts`);
console.log(`max cascade ${maxCascade}, crushes ${crushes}, shuffles ${shuffles}, prism chain-zaps ${prismZaps}`);
console.log('specials spawned:', specials);
console.log('combos fired:', combos);
