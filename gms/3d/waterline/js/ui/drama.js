// The arrangement of the enemy fleet you can see — D43.
//
// The sim will not tell the renderer where the enemy's ships are and must not (D8), so the fleet on
// the sea is invented. What D43 adds is that it may not be invented FREELY: it has to agree with
// everything the player has already been shown. A revealed hit has a hull on it, a revealed miss has
// open water, and a sunk ship's revealed cells carry a hull of exactly that length.
//
// This file imports nothing from js/sim and is never handed a Game, a View or an owner map. Its
// whole input is two boolean masks over the board and the cells of the ships that have already gone
// down — all of which the player is looking at on the chart. That is the leak proof: there is no
// channel here for the unrevealed board to arrive through.

const rngOf = seed => {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
};

// A run of cells back to its placement. Length 1 is horizontal by convention, as everywhere else.
export function fromCells(cells) {
  if (!cells || !cells.length) return null;
  let r = cells[0].r, c = cells[0].c;
  for (const cell of cells) { r = Math.min(r, cell.r); c = Math.min(c, cell.c); }
  const dir = cells.length > 1 && cells.every(x => x.r === cells[0].r) ? 'h'
    : cells.length > 1 ? 'v' : 'h';
  return { r, c, dir, len: cells.length };
}

const SEARCH_CAP = 60000;
const TRIES = 4;

// `blocked` and `struck` are w×h masks: 1 where the player has been shown open water, and 1 where
// they have been shown a hit that has not yet sunk anything. `sunk` is [{ id, cells }].
// `current` is the arrangement on screen, used only to prefer leaving hulls where they are.
// Returns one placement per fleet slot, or null if no arrangement fits (which cannot happen for a
// board a real game produced — the true layout is itself a solution — so null means a bug).
export function dramatise({ w, h, fleet, blocked, struck, sunk = [], seed = 1, current = null }) {
  for (let attempt = 0; attempt < TRIES; attempt++) {
    const out = solve({ w, h, fleet, blocked, struck, sunk, seed: seed + attempt * 7919, current });
    if (out) return out;
  }
  return null;
}

function solve({ w, h, fleet, blocked, struck, sunk, seed, current }) {
  const n = fleet.length;
  const out = new Array(n).fill(null);
  const occ = new Int16Array(w * h).fill(-1);
  const rand = rngOf(seed);
  let nodes = 0;

  for (const s of sunk) {
    const p = fromCells(s.cells);
    if (!p || s.id == null || s.id >= n || p.len !== fleet[s.id]) return null;
    out[s.id] = { id: s.id, len: p.len, r: p.r, c: p.c, dir: p.dir };
    for (const cell of s.cells) occ[cell.r * w + cell.c] = s.id;
  }

  const required = [];
  for (let i = 0; i < w * h; i++) if (struck[i] && occ[i] < 0) required.push(i);

  const legal = (len, r, c, dir) => {
    if (dir === 'h') { if (r < 0 || c < 0 || r >= h || c + len > w) return false; }
    else if (r < 0 || c < 0 || c >= w || r + len > h) return false;
    for (let k = 0; k < len; k++) {
      const i = (dir === 'h' ? r * w + c + k : (r + k) * w + c);
      if (occ[i] >= 0 || blocked[i]) return false;
    }
    return true;
  };

  const stamp = (p, v) => {
    for (let k = 0; k < p.len; k++) occ[p.dir === 'h' ? p.r * w + p.c + k : (p.r + k) * w + p.c] = v;
  };

  const covers = p => {
    let n = 0;
    for (let k = 0; k < p.len; k++) if (struck[p.dir === 'h' ? p.r * w + p.c + k : (p.r + k) * w + p.c]) n++;
    return n;
  };

  // Two ships fewer than there are clusters of hits means some hull has to take two of them, and
  // finding that pairing by luck is what blew the search up on a late 12×12. So a candidate that
  // covers more struck cells is tried first; among equals, the placement a hull already holds and
  // then the nearest to it — what the player watches is ships steaming, and the arrangement that
  // moves least reads as station-keeping rather than as the fleet being re-rolled every turn.
  const cost = p => {
    const was = current?.[p.si];
    const near = !was ? 40 + rand() * 8
      : was.r === p.r && was.c === p.c && was.dir === p.dir ? 0
        : 1 + Math.abs(was.r - p.r) + Math.abs(was.c - p.c) + (was.dir === p.dir ? 0 : 0.5) + rand();
    return -100 * covers(p) + near;
  };
  const order = cands => { for (const p of cands) p.k = cost(p); cands.sort((a, b) => a.k - b.k); };

  // A lower bound on the hulls still needed: walk the uncovered struck cells and drop every one
  // that could share a hull with an earlier pick. Two cells can only share one if they are in the
  // same row or column and closer together than the longest ship left.
  const needAtLeast = remaining => {
    let span = 0;
    for (const si of remaining) span = Math.max(span, fleet[si]);
    const seen = [];
    let n = 0;
    for (const i of required) {
      if (occ[i] >= 0) continue;
      const r = (i / w) | 0, c = i % w;
      if (seen.some(q => (q.r === r && Math.abs(q.c - c) < span) || (q.c === c && Math.abs(q.r - r) < span))) continue;
      seen.push({ r, c });
      n++;
    }
    return n;
  };

  const free = [];
  for (let i = 0; i < n; i++) if (!out[i]) free.push(i);
  free.sort((a, b) => fleet[b] - fleet[a] || a - b);

  // Every hull that could cover one struck cell, and every station one hull could take. Randomised
  // ordering on a constraint this tight blows the search up without them: both branches below pick
  // the most constrained option first and abandon a branch the moment anything has none left.
  const overCell = (i, remaining) => {
    const r0 = (i / w) | 0, c0 = i % w;
    const cands = [];
    for (const si of remaining) {
      const len = fleet[si];
      for (let k = 0; k < len; k++) {
        if (legal(len, r0, c0 - k, 'h')) cands.push({ si, len, r: r0, c: c0 - k, dir: 'h' });
        if (len > 1 && legal(len, r0 - k, c0, 'v')) cands.push({ si, len, r: r0 - k, c: c0, dir: 'v' });
      }
    }
    return cands;
  };

  const forShip = si => {
    const len = fleet[si];
    const cands = [];
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        if (legal(len, r, c, 'h')) cands.push({ si, len, r, c, dir: 'h' });
        if (len > 1 && legal(len, r, c, 'v')) cands.push({ si, len, r, c, dir: 'v' });
      }
    }
    return cands;
  };

  function search(remaining) {
    if (++nodes > SEARCH_CAP) return false;
    if (needAtLeast(remaining) > remaining.length) return false;

    let cands = null;
    for (const i of required) {
      if (occ[i] >= 0) continue;
      const c = overCell(i, remaining);
      if (!c.length) return false;
      if (!cands || c.length < cands.length) cands = c;
      if (cands.length === 1) break;
    }

    if (!cands) {
      if (!remaining.length) return true;
      for (const si of remaining) {
        const c = forShip(si);
        if (!c.length) return false;
        if (!cands || c.length < cands.length) cands = c;
      }
    }

    order(cands);
    for (const p of cands) {
      stamp(p, p.si);
      out[p.si] = { id: p.si, len: p.len, r: p.r, c: p.c, dir: p.dir };
      if (search(remaining.filter(x => x !== p.si))) return true;
      stamp(p, -1);
      out[p.si] = null;
    }
    return false;
  }

  return search(free) ? out : null;
}

// What the arrangement claims, read back off it: the cells every hull covers. The checker the tests
// use, and the same function the caller can use to assert its own output.
export function coverage(list, w, h) {
  const g = new Int16Array(w * h).fill(-1);
  for (const s of list || []) {
    for (let k = 0; k < s.len; k++) g[s.dir === 'h' ? s.r * w + s.c + k : (s.r + k) * w + s.c] = s.id;
  }
  return g;
}
