// Puzzle generation off the main thread — a Hard carve on a mid-range phone is
// long enough to freeze taps.
importScripts('./engine.js');
const engine = new SudokuEngine();
onmessage = e => {
  const { id, level, seed } = e.data;
  postMessage({ id, puzzle: engine.generatePuzzle(level, seed) });
};
