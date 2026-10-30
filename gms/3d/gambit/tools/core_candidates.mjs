// Experimental personas for calibration runs (tools/core_tourney.mjs looks ids up here
// when they are not in js/bots/personas.js). Not shipped.
export const CANDIDATES = {
  s3k: { id: 's3k', elo: 1700, mode: 'search', depth: 64, nodes: 3000, evalNoise: 40, book: 10 },
  s8k: { id: 's8k', elo: 1800, mode: 'search', depth: 64, nodes: 8000, evalNoise: 30, book: 12 },
  s20k: { id: 's20k', elo: 1900, mode: 'search', depth: 64, nodes: 20000, evalNoise: 25, book: 12 },
  h5: { id: 'h5', elo: 1700, mode: 'human', depth: 5, qMax: 99, noise: 10, temp: 6, blunder: 0.02, natural: 0.2, book: 12, nodes: 200000 },
  sfn5k: { id: 'sfn5k', elo: 2600, engine: 'sf', sfElo: 0, sfNodes: 5000, book: 16 },
  sfn20k: { id: 'sfn20k', elo: 2800, engine: 'sf', sfElo: 0, sfNodes: 20000, book: 16 },
  sfn100k: { id: 'sfn100k', elo: 3000, engine: 'sf', sfElo: 0, sfNodes: 100000, book: 16 },
  rand: { id: 'rand', elo: 0, mode: 'human', depth: 1, qMax: 0, noise: 0, temp: 1e9, blunder: 0, natural: 0, book: 0, evalW: { pst: 0 } },
  w1: { id: 'w1', elo: 100, mode: 'human', depth: 1, qMax: 0, noise: 400, temp: 300, blunder: 0.7, natural: 2, book: 0, evalW: { mobility: 0, kingSafety: 0, pawns: 0, passed: 0, rookFiles: 0, bishopPair: 0, pst: 0.5 } },
  w2: { id: 'w2', elo: 200, mode: 'human', depth: 1, qMax: 0, noise: 280, temp: 200, blunder: 0.6, natural: 1.8, book: 0, evalW: { mobility: 0, kingSafety: 0, pawns: 0, passed: 0, rookFiles: 0, bishopPair: 0, pst: 0.5 } },
  w3: { id: 'w3', elo: 300, mode: 'human', depth: 1, qMax: 0, noise: 200, temp: 150, blunder: 0.5, natural: 1.7, book: 0, evalW: { mobility: 0, kingSafety: 0, pawns: 0, passed: 0, rookFiles: 0, bishopPair: 0, pst: 0.5 } },
};
