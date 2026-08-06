// Where an opponent has actually put ships, remembered across a tournament.
//
// Every tier below 4 reasons from a uniform-over-placements prior, which is correct only if the
// enemy places uniformly. Under D7 the player places their own fleet, so they do not: a layout
// flush to the edges costs a uniform-prior AI ~28% more shots, every game, forever. Tier 4 is the
// tier that notices. Nothing here knows what a Game is.

import { coverageMap } from './placement.js';

const key = (w, h) => `${w}x${h}`;

// How much flat prior to blend in. Higher = slower to trust a habit, more resistant to the noise
// of a genuinely random opponent. At K=6 a cell needs to be several games above chance to move.
const K = 6;

// Only the opening of a game says anything about habit: by shot 30 everyone is following hits.
const OPENING_FRACTION = 0.4;

export const newMemory = () => ({ v: 1, boards: {} });

const bucket = (mem, w, h) => {
  const k = key(w, h);
  const b = mem.boards[k] ?? (mem.boards[k] = { n: 0, counts: new Array(w * h).fill(0), shots: 0, shotCounts: new Array(w * h).fill(0) });
  if (!b.shotCounts) { b.shots = 0; b.shotCounts = new Array(w * h).fill(0); }
  return b;
};

export function observeLayout(mem, w, h, ships) {
  if (!mem || !mem.boards || !Array.isArray(ships)) return mem;
  const b = bucket(mem, w, h);
  if (b.counts.length !== w * h) return mem;
  for (const s of ships) for (const c of (s.cells ?? [])) {
    if (c.r >= 0 && c.c >= 0 && c.r < h && c.c < w) b.counts[c.r * w + c.c]++;
  }
  b.n++;
  return mem;
}

// Where this opponent opens. `cells` is every cell they fired at, in order, across one game.
export function observeShots(mem, w, h, cells) {
  if (!mem || !mem.boards || !Array.isArray(cells)) return mem;
  const b = bucket(mem, w, h);
  if (b.shotCounts.length !== w * h) return mem;
  const take = Math.max(1, Math.round(cells.length * OPENING_FRACTION));
  for (const c of cells.slice(0, take)) {
    if (c.r >= 0 && c.c >= 0 && c.r < h && c.c < w) { b.shotCounts[c.r * w + c.c]++; b.shots++; }
  }
  return mem;
}

// Where not to put your own ships against this opponent, mean 1, or null with nothing to go on.
export function shotPrior(mem, w, h) {
  const b = mem?.boards?.[key(w, h)];
  if (!b || !b.shots || b.shotCounts?.length !== w * h) return null;
  const base = b.shots / (w * h);
  return b.shotCounts.map(c => (c + K * base) / ((1 + K) * base));
}

// Before a single game has been seen, the best guess about a human is still not "uniform over
// placements". That model systematically under-rates the edges — a corner cell sits in a fraction
// of the placements an interior one does — and people know it, which is why "flush to the edges"
// was the folk strategy that cost every tier 25% more shots, every game, forever.
//
// coverage^-1 is exactly uniform-over-CELLS, and it is a correction rather than a tuned constant.
// Measured at 0.5 / 0.8 / 1.0 / 1.3: only 1.0 brings both the edge and the corner layout inside
// 10% of a random one while leaving play against random layouts untouched. Past it the prior
// over-corrects and starts discarding real information — 26.4 shots at 1.3 against 25.6.
const ANTI_EDGE = 1.0;

const normalise = arr => {
  const mean = arr.reduce((a, x) => a + x, 0) / arr.length;
  return mean > 0 ? arr.map(x => x / mean) : arr.map(() => 1);
};

export function staticPrior(w, h, lengths) {
  return normalise(coverageMap(w, h, lengths).map(x => (x > 0 ? Math.pow(x, -ANTI_EDGE) : 1)));
}

// What learning is allowed to do to a cell. Unbounded, it inverts: twelve sacrificial games on a
// corner layout pushed a cell to ~3.9x and starved the rest of the board, so a player who taught
// Ghost the WRONG map won rung 8 22.8% of the time against 10.0% for just auto-placing — a better
// payoff than the exploit the prior was built to close, on the rung that sets complete:true.
//
// Bounding the downweight alone did NOT remove the payoff — measured 15.6% against a 7.2%
// auto-place baseline, still 2.2x, and tightening the bound to [0.9,1.5] left 14.5%. Magnitude was
// never the lever: what carries the exploit is the learned term's authority over SEARCH ORDER, and
// four sacrificial games are enough to seize it. Blending the deviation is the lever — at w=0.3
// poisoning falls below the honest baseline (so it stops being worth doing) while a player who
// really does repeat one layout is still held to 2.5%. Decay is not the fix either: a decaying
// memory is poisoned just as easily by poisoning immediately before the match.
// The static geometric correction below is not learning and is not poisonable, so it is applied
// after this and keeps its full range.
// w is set from the examiner's measured curve (poison% / honest-repeat%): 0.5 → 15.3 (open),
// 0.3 → 7.5 / 2.5, 0.15 → 7.2 / 3.8. An independent run at 0.3 measured 10.4 against a 7.2
// baseline, so the curve carries a few points of noise; 0.15 is chosen to sit clear of it rather
// than on the edge. Honest learning still beats no memory (3.8 vs 5.5) and gaming it gains nothing.
const LEARN_MIN = 1.0, LEARN_MAX = 1.8, LEARN_W = 0.15;

// A per-cell multiplier with mean 1. The density model multiplies each placement's weight by the
// mean of this over its cells, so a flat prior is a no-op. Falls back to the static one until
// this opponent has actually shown a layout.
export function placementPrior(mem, w, h, lengths) {
  const base = lengths ? staticPrior(w, h, lengths) : null;
  const b = mem?.boards?.[key(w, h)];
  if (!b || !b.n || b.counts.length !== w * h) return base;
  const total = b.counts.reduce((a, x) => a + x, 0);
  if (total <= 0) return base;
  const per = total / (w * h);
  const learned = b.counts.map(c => {
    const x = (c + K * per) / ((1 + K) * per);
    const m = 1 + LEARN_W * (x - 1);
    return m < LEARN_MIN ? LEARN_MIN : m > LEARN_MAX ? LEARN_MAX : m;
  });
  return base ? normalise(learned.map((x, i) => x * base[i])) : normalise(learned);
}

// null when `mem` is a Memory this sim will accept, a reason string when it is not. newGame runs
// it on anything handed in, because a Memory is now the ONLY way a caller can influence what the
// AI believes and it arrives from localStorage.
export function memoryProblem(mem) {
  if (!mem || typeof mem !== 'object' || Array.isArray(mem)) return 'memory must be an object';
  if (mem.v !== 1) return 'unknown memory version';
  const keys = Object.keys(mem);
  if (keys.length !== 2 || !keys.includes('v') || !keys.includes('boards')) return 'memory has unexpected fields';
  if (!mem.boards || typeof mem.boards !== 'object' || Array.isArray(mem.boards)) return 'memory.boards must be an object';
  for (const [k, b] of Object.entries(mem.boards)) {
    const m = /^(\d+)x(\d+)$/.exec(k);
    if (!m) return `memory has a bad board key '${k}'`;
    const n = +m[1] * +m[2];
    if (!b || typeof b !== 'object') return 'memory board must be an object';
    const bk = Object.keys(b).sort().join(',');
    if (bk !== 'counts,n,shotCounts,shots') return 'memory board has unexpected fields';
    for (const [arr, tally] of [['counts', 'n'], ['shotCounts', 'shots']]) {
      if (!Array.isArray(b[arr]) || b[arr].length !== n) return `memory.${arr} does not match its board`;
      if (b[arr].some(x => !Number.isInteger(x) || x < 0)) return `memory.${arr} must be whole counts`;
      if (!Number.isInteger(b[tally]) || b[tally] < 0) return `memory.${tally} must be a whole count`;
    }
  }
  return null;
}

export function memoryGames(mem, w, h) {
  return mem?.boards?.[key(w, h)]?.n ?? 0;
}
