// The bot ladder. Pure data + small helpers (shared by bots.js, worker.js and node tools).
//
// Strength levers (see docs/notes/core.md for how the Elo numbers were measured):
//  mode 'human'  - score every root move at `depth` (qMax = quiescence plies, 0 = none),
//                  add gaussian `noise` (cp) + a "natural move" bonus x `natural`,
//                  then softmax-pick with temperature `temp` (cp). With probability
//                  `blunder` the bot judges moves by a static look only (hangs pieces,
//                  walks into forks, takes poisoned pawns).
//  mode 'search' - the full engine with a node budget `nodes` (device independent
//                  strength: a slower device thinks longer, not weaker) and `evalNoise`.
//  engine 'sf'   - vendored Stockfish 19 lite (GPL, js/bots/stockfish/) with
//                  UCI_LimitStrength/UCI_Elo, or full strength with a node budget.
//  book          - plies of opening book to follow.
//  evalW         - eval term weights (style): see DEFAULT_EVAL in engine.js.
//  typNodes      - measured average nodes per move (tools/core_tourney.mjs), used to gate
//                  the bot on slow devices.
//
// `elo` is the calibrated estimate (Stockfish UCI_Elo anchored, see notes).

export const BOTS = [
  {
    id: 'pip', name: 'Pip', elo: 250, avatar: '🐣', color: '#f6c945', style: 'beginner',
    blurb: 'Just learned how the horsey moves. Pushes pawns, leaves pieces lying around, and sometimes forgets to take yours.',
    mode: 'human', depth: 1, qMax: 0, noise: 240, temp: 175, blunder: 0.55, natural: 1.8, book: 0, typNodes: 40,
    evalW: { mobility: 0, kingSafety: 0, pawns: 0, passed: 0, rookFiles: 0, bishopPair: 0, pst: 0.5 },
  },
  {
    id: 'mabel', name: 'Mabel', elo: 400, avatar: '👵', color: '#d98bb5', style: 'beginner',
    blurb: 'Plays with her grandkids on Sundays. Will grab anything you leave hanging, and hang a few herself.',
    mode: 'human', depth: 1, qMax: 1, noise: 130, temp: 80, blunder: 0.36, natural: 1.4, book: 2, typNodes: 60,
    evalW: { mobility: 0, kingSafety: 0, pawns: 0, passed: 0, rookFiles: 0, bishopPair: 0, pst: 0.5 },
  },
  {
    id: 'otto', name: 'Otto', elo: 550, avatar: '🧢', color: '#5aa0e0', style: 'aggressive',
    blurb: 'Brings the queen out early and goes looking for trouble. Counts to one move ahead, on a good day.',
    mode: 'human', depth: 1, qMax: 2, noise: 110, temp: 65, blunder: 0.30, natural: 1.2, book: 2, typNodes: 80,
    evalW: { mobility: 0.3, kingSafety: 0.4, pawns: 0, passed: 0.4, rookFiles: 0, pst: 0.7, aggression: 1.8 },
  },
  {
    id: 'juno', name: 'Juno', elo: 750, avatar: '🛹', color: '#8ad16b', style: 'tricky',
    blurb: 'A skater who learned chess from videos. Knows a few cheap traps, forgets about her own king.',
    mode: 'human', depth: 2, qMax: 1, noise: 95, temp: 55, blunder: 0.24, natural: 1.1, book: 4, typNodes: 900,
    evalW: { mobility: 0.4, kingSafety: 0.3, pawns: 0.3, passed: 0.5, rookFiles: 0.3, pst: 0.8 },
  },
  {
    id: 'ravi', name: 'Ravi', elo: 850, avatar: '📚', color: '#c08a4f', style: 'solid',
    blurb: 'Read half a chess book. Develops nicely, then gets lost in the middlegame.',
    mode: 'human', depth: 2, qMax: 3, noise: 80, temp: 45, blunder: 0.19, natural: 1.0, book: 6, typNodes: 1000,
    evalW: { mobility: 0.5, kingSafety: 0.5, pawns: 0.5, passed: 0.6, rookFiles: 0.5, pst: 0.9 },
  },
  {
    id: 'bea', name: 'Bea', elo: 1000, avatar: '🐝', color: '#f0a020', style: 'aggressive',
    blurb: 'Club newcomer. Attacks first, counts pieces later.',
    mode: 'human', depth: 2, qMax: 99, noise: 55, temp: 30, blunder: 0.12, natural: 0.9, book: 6, typNodes: 1100,
    evalW: { mobility: 0.7, kingSafety: 0.8, pawns: 0.5, passed: 0.7, rookFiles: 0.5, aggression: 1.5 },
  },
  {
    id: 'hugo', name: 'Hugo', elo: 1200, avatar: '🎩', color: '#7a6ad8', style: 'positional',
    blurb: 'A gentleman of the old school. Sound openings, a soft spot for bishops.',
    mode: 'human', depth: 3, qMax: 99, noise: 50, temp: 28, blunder: 0.11, natural: 0.8, book: 8, typNodes: 5000,
    evalW: { mobility: 0.8, kingSafety: 0.8, pawns: 0.8, passed: 0.8, bishopPair: 1.5 },
  },
  {
    id: 'lena', name: 'Lena', elo: 1350, avatar: '🦊', color: '#e46a3c', style: 'tricky',
    blurb: 'Sly and fast. Sets little traps and waits for you to step in one.',
    mode: 'human', depth: 3, qMax: 99, noise: 38, temp: 20, blunder: 0.08, natural: 0.6, book: 8, typNodes: 5000,
    evalW: { mobility: 0.9, kingSafety: 1, aggression: 1.2 },
  },
  {
    id: 'marco', name: 'Marco', elo: 1500, avatar: '☕', color: '#8b5a3c', style: 'solid',
    blurb: 'Café regular. Rarely blunders, rarely sparkles. Will grind you down in the endgame.',
    mode: 'human', depth: 4, qMax: 99, noise: 26, temp: 14, blunder: 0.05, natural: 0.4, book: 10, nodes: 80000, typNodes: 22000,
    evalW: { pawns: 1.2, passed: 1.2 },
  },
  {
    id: 'ines', name: 'Ines', elo: 1600, avatar: '🎻', color: '#b0446a', style: 'positional',
    blurb: 'Plays chess like the violin: patient, precise, and a little sharp when you least expect it.',
    mode: 'human', depth: 4, qMax: 99, noise: 16, temp: 9, blunder: 0.03, natural: 0.3, book: 12, nodes: 120000, typNodes: 25000,
    evalW: {},
  },
  {
    id: 'tariq', name: 'Tariq', elo: 1800, avatar: '⚡', color: '#3fb6c8', style: 'aggressive',
    blurb: 'Blitz addict. Sacrifices first and asks questions never.',
    mode: 'human', depth: 5, qMax: 99, noise: 16, temp: 9, blunder: 0.035, natural: 0.25, book: 12, nodes: 200000, typNodes: 70000,
    evalW: { kingSafety: 1.3, aggression: 1.5 },
  },
  {
    id: 'nadia', name: 'Nadia', elo: 1950, avatar: '🦅', color: '#5c8f4a', style: 'universal',
    blurb: 'Club champion. Spots your loose pieces from across the room.',
    mode: 'human', depth: 5, qMax: 99, noise: 10, temp: 6, blunder: 0.02, natural: 0.2, book: 12, nodes: 200000, typNodes: 70000,
    evalW: {},
  },
  {
    id: 'ada', name: 'Ada', elo: 2050, avatar: '🧮', color: '#4f7fd6', style: 'positional',
    blurb: 'A mathematician who treats every pawn as a theorem. Hard to surprise.',
    mode: 'search', depth: 64, nodes: 3000, evalNoise: 40, book: 12, typNodes: 3000,
    evalW: {},
  },
  {
    id: 'viktor', name: 'Viktor', elo: 2200, avatar: '🐻', color: '#6b4a2e', style: 'solid',
    blurb: 'Former national junior champion. Squeezes small edges until something breaks.',
    mode: 'search', depth: 64, nodes: 8000, evalNoise: 30, book: 14, typNodes: 8000,
    evalW: { pawns: 1.2 },
  },
  {
    id: 'mei', name: 'Mei', elo: 2350, avatar: '🐉', color: '#d6453f', style: 'aggressive',
    blurb: 'Fearless attacking player. If your king looks a bit cold, she will notice.',
    mode: 'search', depth: 64, nodes: 20000, evalNoise: 25, book: 14, typNodes: 20000,
    evalW: { kingSafety: 1.2, aggression: 1.3 },
  },
  {
    id: 'orlov', name: 'Orlov', elo: 2500, avatar: '🦉', color: '#556070', style: 'universal',
    blurb: 'An International Master in spirit. Calm, accurate and very hard to trick.',
    mode: 'search', depth: 64, nodes: 60000, evalNoise: 18, book: 16, typNodes: 60000,
    evalW: {},
  },
  {
    id: 'gideon', name: 'Gideon', elo: 2700, avatar: '🗿', color: '#405060', style: 'universal',
    blurb: 'Grandmaster strength. Sees your plan before you have finished thinking it.',
    mode: 'search', depth: 64, nodes: 200000, evalNoise: 10, book: 16, typNodes: 200000,
    evalW: {},
  },
  {
    id: 'seraphine', name: 'Seraphine', elo: 2900, avatar: '👑', color: '#a080d0', style: 'universal',
    blurb: 'Super-GM. Wins the endgames you thought were drawn.',
    mode: 'search', depth: 64, nodes: 700000, evalNoise: 6, book: 16, typNodes: 700000,
    evalW: {},
  },
  {
    id: 'oracle', name: 'Oracle', elo: 3050, avatar: '🔮', color: '#3a2c66', style: 'universal',
    blurb: 'World-champion level and beyond. A draw is a fine result.',
    mode: 'search', depth: 64, nodes: 2000000, evalNoise: 0, book: 16, typNodes: 2000000,
    evalW: {},
  },
  // ---- Stockfish-powered (GPL-3.0, js/bots/stockfish/Copying.txt) ----
  {
    id: 'machine', name: 'The Machine', elo: 3200, avatar: '🤖', color: '#202830', style: 'engine',
    blurb: 'Stockfish 19 at full strength (lite network). Not a person. Good luck.',
    engine: 'sf', sfElo: 0, sfNodes: 1000000, book: 0, typNodes: 1000000,
  },
];

// Stockfish's own Elo -> skill level formula (search.cpp), used to fix the search depth so
// strength is device independent: the limited-strength pick happens at depth 1 + level.
export function sfSkillLevel(elo) {
  if (!(elo > 1346.6)) return 0;
  return Math.min(19, Math.pow((elo - 1346.6) / 143.4, 1 / 0.806));
}

export const byId = (id) => BOTS.find((b) => b.id === id);
