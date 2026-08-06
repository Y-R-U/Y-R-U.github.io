// Fleet legality is a constructive proof, not a heuristic (BUILD_PLAN §3.1): a fleet fits iff
// packRows() can lay it out, and the packing *is* a legal placement, so success proves a random
// legal placement exists.

import { BOARD } from './tables.js';

// Not in config.BOARD because that file is another component's to edit and this is a rules floor,
// not a tuning knob. Every LADDER config clears it with room: classic is 17%, rung 8 is 19%.
const MIN_OCCUPANCY = 0.08;

export const cellsOf = p => {
  const out = [];
  for (let i = 0; i < p.len; i++) out.push(p.dir === 'h' ? { r: p.r, c: p.c + i } : { r: p.r + i, c: p.c });
  return out;
};

// First-fit-decreasing of lengths into h bins of capacity w, all horizontal, allowed to touch
// end to end. Returns placements in the ORIGINAL length order, or null.
export function packRows(lengths, w, h) {
  const order = lengths.map((len, i) => ({ len, i })).sort((a, b) => b.len - a.len || a.i - b.i);
  const used = new Array(h).fill(0);
  const out = new Array(lengths.length);
  for (const { len, i } of order) {
    if (len > w) return null;
    let row = -1;
    for (let r = 0; r < h; r++) if (used[r] + len <= w) { row = r; break; }
    if (row < 0) return null;
    out[i] = { len, r: row, c: used[row], dir: 'h' };
    used[row] += len;
  }
  return out;
}

// null when the fleet is legal for the grid, a reason string when it is not (same shape as
// legal()). D7: the custom-fleet builder calls this BEFORE the player commits.
export function fleetLegal(w, h, lengths) {
  if (!Number.isInteger(w) || !Number.isInteger(h)) return 'grid size must be whole numbers';
  if (w < BOARD.min || h < BOARD.min) return `grid must be at least ${BOARD.min}×${BOARD.min}`;
  if (w > BOARD.max || h > BOARD.max) return `grid must be at most ${BOARD.max}×${BOARD.max}`;
  const aspect = Math.max(w / h, h / w);
  if (aspect > BOARD.maxAspect) return `grid is too long and thin (max ${BOARD.maxAspect}:1)`;
  if (!Array.isArray(lengths)) return 'fleet must be a list of ship lengths';
  if (lengths.length === 0) return 'fleet is empty';
  if (lengths.length > BOARD.maxShips) return `at most ${BOARD.maxShips} ships`;
  const lim = Math.min(w, h);
  for (const len of lengths) {
    if (!Number.isInteger(len) || len < 1) return 'ship lengths must be whole numbers of 1 or more';
    if (len > lim) return `a ship of ${len} does not fit on a ${w}×${h} grid`;
  }
  const cells = lengths.reduce((a, b) => a + b, 0);
  if (cells > w * h * BOARD.occupancy) {
    return `fleet fills ${Math.round(cells / (w * h) * 100)}% of the grid (max ${Math.round(BOARD.occupancy * 100)}%)`;
  }
  // A floor as well as a cap. One ship on 16x16 is legal geometry and a coin-flipping simulator:
  // no information exists to act on until a shot lands, so every tier plays identically and the
  // match is 78 shots of noise. D7's custom-fleet builder must not offer it.
  if (cells < w * h * MIN_OCCUPANCY) {
    return `fleet is too small for a ${w}×${h} grid (needs at least ${Math.ceil(w * h * MIN_OCCUPANCY)} ship cells)`;
  }
  if (!packRows(lengths, w, h)) return 'fleet does not fit on this grid';
  return null;
}

function fits(occ, w, h, len, r, c, dir) {
  if (dir === 'h') {
    if (c + len > w || r >= h) return false;
    for (let i = 0; i < len; i++) if (occ[r * w + c + i]) return false;
  } else {
    if (r + len > h || c >= w) return false;
    for (let i = 0; i < len; i++) if (occ[(r + i) * w + c]) return false;
  }
  return true;
}

const stamp = (occ, w, p) => { for (const { r, c } of cellsOf(p)) occ[r * w + c] = 1; };

// How many legal placements pass through each cell on an empty board, normalised to mean 1. This
// is exactly the prior every placement-counting AI reasons from, which is why it is also the map
// of where NOT to put your own ships: a corner cell is covered by a fraction of the placements an
// interior one is, so it is searched last. Tier 4 hides along it.
export function coverageMap(w, h, lengths) {
  const d = new Float64Array(w * h);
  for (const len of lengths) {
    for (let r = 0; r < h; r++) for (let c = 0; c + len <= w; c++) for (let i = 0; i < len; i++) d[r * w + c + i]++;
    if (len > 1) for (let r = 0; r + len <= h; r++) for (let c = 0; c < w; c++) for (let i = 0; i < len; i++) d[(r + i) * w + c]++;
  }
  let total = 0;
  for (const x of d) total += x;
  const mean = total / d.length;
  return Array.from(d, x => (mean > 0 ? x / mean : 1));
}

// Candidate layouts drawn before hiding, and how many of the quietest are then picked between at
// random. A strict argmin was fully deterministic given the fleet and the grid, so the hidden
// layout carried no entropy of its own and an attacker could reproduce it in thirty lines; and
// the counter-strategy was simply "sweep in ascending coverage order", which is the AI's own
// opening run backwards. Drawing more and keeping the quietest four restores the strength the
// randomisation cost (ordnance-off T4-vs-T3 52.8% at 24/8, 56.6% at 48/4) and still leaves the
// choice unpredictable. The real secrecy is layoutSeed; this is about the counter-strategy.
const HIDE_CANDIDATES = 48;
const HIDE_KEEP = 4;

// Never fails for a fleet that fleetLegal() accepts. Rejection sampling longest-first, then the
// packRows solution randomised as the guaranteed fallback. With an `avoid` map it draws several
// layouts and keeps the one sitting lowest on it.
export function randomPlacement(rng, w, h, lengths, avoid) {
  if (!avoid) return onePlacement(rng, w, h, lengths);
  const drawn = [];
  for (let k = 0; k < HIDE_CANDIDATES; k++) {
    const p = onePlacement(rng, w, h, lengths);
    let cost = 0;
    for (const s of p) for (const { r, c } of cellsOf(s)) cost += avoid[r * w + c];
    drawn.push({ p, cost });
  }
  drawn.sort((a, b) => a.cost - b.cost);
  return drawn[rng.int(Math.min(HIDE_KEEP, drawn.length))].p;
}

function onePlacement(rng, w, h, lengths) {
  const occ = new Uint8Array(w * h);
  const out = new Array(lengths.length);
  const order = lengths.map((len, i) => ({ len, i })).sort((a, b) => b.len - a.len || a.i - b.i);
  for (const { len, i } of order) {
    let placed = null;
    for (let t = 0; t < BOARD.placeTries; t++) {
      const dir = len === 1 ? 'h' : (rng.float() < 0.5 ? 'h' : 'v');
      const r = rng.int(dir === 'h' ? h : h - len + 1);
      const c = rng.int(dir === 'h' ? w - len + 1 : w);
      if (fits(occ, w, h, len, r, c, dir)) { placed = { len, r, c, dir }; break; }
    }
    if (!placed) return packedPlacement(rng, w, h, lengths);
    out[i] = placed;
    stamp(occ, w, placed);
  }
  return out;
}

// The guaranteed-legal fallback, exported so it can be tested directly. Rejection sampling
// almost never reaches it, which makes it the path most likely to rot unnoticed.
export function packedPlacement(rng, w, h, lengths) {
  const base = packRows(lengths, w, h);
  if (!base) throw new Error('randomPlacement: fleet does not fit — call fleetLegal() first');
  const rows = rng.shuffle([...Array(h).keys()]);
  let out = base.map(p => ({ ...p, r: rows[p.r] }));
  if (rng.float() < 0.5) out = out.map(p => ({ ...p, c: w - p.len - p.c }));           // mirror in x
  if (rng.float() < 0.5) out = out.map(p => ({ ...p, r: h - 1 - p.r }));               // mirror in y
  // (r,c) → (c, h-1-r). Only sound because packRows emits horizontal ships exclusively, and only
  // shape-preserving on a square grid.
  if (w === h && rng.float() < 0.5) out = out.map(p => ({ len: p.len, r: p.c, c: h - 1 - p.r, dir: 'v' }));
  return out;
}

// null when the explicit layout is legal, a reason string when it is not.
export function validatePlacements(w, h, lengths, placements) {
  if (!Array.isArray(placements)) return 'placements must be a list';
  if (placements.length !== lengths.length) return `expected ${lengths.length} ships, got ${placements.length}`;
  const occ = new Uint8Array(w * h);
  for (let i = 0; i < placements.length; i++) {
    const p = placements[i];
    if (!p || (p.dir !== 'h' && p.dir !== 'v')) return `ship ${i}: dir must be 'h' or 'v'`;
    const len = p.len ?? lengths[i];
    if (len !== lengths[i]) return `ship ${i}: length ${len} does not match the fleet's ${lengths[i]}`;
    if (!Number.isInteger(p.r) || !Number.isInteger(p.c)) return `ship ${i}: r and c must be whole numbers`;
    if (p.r < 0 || p.c < 0) return `ship ${i}: off the board`;
    if (!fits(occ, w, h, len, p.r, p.c, p.dir)) return `ship ${i}: off the board or overlapping`;
    stamp(occ, w, { ...p, len });
  }
  return null;
}
