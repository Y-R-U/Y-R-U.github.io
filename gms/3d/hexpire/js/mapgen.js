// Random map generator: classic shapes, jagged blobs, connected islands,
// mazes — plus evenly-spaced base placement via farthest-point sampling.
import { key, unkey, neighbors, hexDist, disc, components, bfs } from './hex.js';
import { mulberry32, hashStr, pick, shuffle } from './utils.js';

export const SIZES = {
  small:  { radius: 7,  target: 140, sep: 8  },
  medium: { radius: 9,  target: 230, sep: 10 },
  large:  { radius: 12, target: 380, sep: 12 },
};

export const STYLES = ['classic', 'jagged', 'islands', 'maze'];

// opts: { style, size, players, seed }
// returns { name, land: [[q,r]...], bases: [[q,r]...], style }
export function generateMap(opts) {
  const seed = typeof opts.seed === 'number' ? opts.seed : hashStr(String(opts.seed ?? Math.random()));
  const rng = mulberry32(seed);
  const size = SIZES[opts.size || 'medium'];
  let style = opts.style || 'random';
  if (style === 'random') style = pick(rng, STYLES);

  let land;
  if (style === 'classic') land = genClassic(rng, size);
  else if (style === 'jagged') land = genJagged(rng, size);
  else if (style === 'islands') land = genIslands(rng, size, opts.players);
  else land = genMaze(rng, size);

  land = largestComponent(land);
  const bases = placeBases(rng, land, opts.players, size.sep);
  return {
    name: opts.name || (style[0].toUpperCase() + style.slice(1) + ' ' + (seed % 1000)),
    style, seed,
    land: [...land].map(unkey),
    bases,
  };
}

// ---- shapes ----

function genClassic(rng, size) {
  const shape = pick(rng, ['hexagon', 'rhombus', 'triangle', 'ring']);
  const R = size.radius;
  const land = new Set();
  if (shape === 'hexagon') {
    for (const [q, r] of disc(0, 0, R)) land.add(key(q, r));
  } else if (shape === 'rhombus') {
    const w = Math.round(R * 1.15);
    for (let q = -w; q <= w; q++)
      for (let r = -Math.round(w * 0.8); r <= Math.round(w * 0.8); r++)
        land.add(key(q - Math.round(r / 2), r));
  } else if (shape === 'triangle') {
    const S = Math.round(R * 1.7);
    for (let r = 0; r <= S; r++)
      for (let q = 0; q <= S - r; q++)
        land.add(key(q - (S >> 1), r - (S >> 1)));
  } else { // ring — fat doughnut
    for (const [q, r] of disc(0, 0, R + 1)) {
      const d = hexDist(0, 0, q, r);
      if (d >= Math.max(2, Math.round(R * 0.35))) land.add(key(q, r));
    }
  }
  return land;
}

function genJagged(rng, size) {
  // organic blob: random-weighted BFS growth from centre to target count
  const land = new Set([key(0, 0)]);
  let frontier = [[0, 0]];
  while (land.size < size.target && frontier.length) {
    const i = Math.floor(rng() * frontier.length);
    const [q, r] = frontier[i];
    const opts = neighbors(q, r).filter(([nq, nr]) =>
      !land.has(key(nq, nr)) && hexDist(0, 0, nq, nr) <= size.radius + 3);
    if (!opts.length) { frontier.splice(i, 1); continue; }
    const [nq, nr] = pick(rng, opts);
    land.add(key(nq, nr));
    frontier.push([nq, nr]);
    // occasionally retire old frontier cells to keep edges craggy
    if (rng() < 0.12) frontier.splice(Math.floor(rng() * frontier.length), 1);
  }
  // fill single-tile holes (lakes of 1 read as noise)
  for (const [q, r] of disc(0, 0, size.radius + 3)) {
    const k = key(q, r);
    if (!land.has(k) && neighbors(q, r).every(([a, b]) => land.has(key(a, b)))) land.add(k);
  }
  return land;
}

function genIslands(rng, size, players) {
  const n = Math.max(2, Math.min(4, players + (rng() < 0.5 ? 0 : 1)));
  const land = new Set();
  const centers = [];
  const spread = size.radius + 2;
  // spaced island centres
  let guard = 0;
  while (centers.length < n && guard++ < 400) {
    const a = rng() * Math.PI * 2, d = spread * (0.45 + rng() * 0.55);
    const q = Math.round(Math.cos(a) * d - Math.sin(a) * d / 2);
    const r = Math.round(Math.sin(a) * d);
    if (centers.every(([cq, cr]) => hexDist(cq, cr, q, r) >= spread * 0.9)) centers.push([q, r]);
  }
  if (centers.length < 2) centers.push([spread, 0], [-spread, 0]);
  const iR = Math.max(3, Math.round(size.radius * 0.52));
  for (const [cq, cr] of centers) {
    for (const [q, r] of disc(cq, cr, iR)) {
      const d = hexDist(cq, cr, q, r);
      if (d <= iR - 1 || rng() < 0.55) land.add(key(q, r)); // ragged coast
    }
  }
  // connect: bridge consecutive centres with a 1–2 wide causeway
  const connectAll = rng() < 0.8; // sometimes leave islands separate-ish… no: bases must reach each other. Always connect.
  for (let i = 0; i < centers.length; i++) {
    const [aq, ar] = centers[i], [bq, br] = centers[(i + 1) % centers.length];
    if (!connectAll && i === centers.length - 1) break;
    const steps = hexDist(aq, ar, bq, br);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      // cube lerp + round
      const q = aq + (bq - aq) * t, r = ar + (br - ar) * t;
      const [rq, rr] = roundAx(q, r);
      land.add(key(rq, rr));
      if (rng() < 0.6) { const nb = pick(rng, neighbors(rq, rr)); land.add(key(nb[0], nb[1])); }
    }
  }
  return land;
}

function roundAx(qf, rf) {
  const sf = -qf - rf;
  let q = Math.round(qf), r = Math.round(rf), s = Math.round(sf);
  const dq = Math.abs(q - qf), dr = Math.abs(r - rf), ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s; else if (dr > ds) r = -q - s;
  return [q, r];
}

function genMaze(rng, size) {
  // cellular automata over a disc: seed noise, smooth, keep walls as void
  const R = size.radius + 1;
  const cells = new Map(); // k -> land bool
  for (const [q, r] of disc(0, 0, R)) cells.set(key(q, r), rng() < 0.52);
  for (let it = 0; it < 3; it++) {
    const next = new Map();
    for (const [k, v] of cells) {
      const [q, r] = unkey(k);
      let n = 0, tot = 0;
      for (const [nq, nr] of neighbors(q, r)) {
        const nk = key(nq, nr);
        if (cells.has(nk)) { tot++; if (cells.get(nk)) n++; }
      }
      // edge of disc counts as void — pulls coastline in
      next.set(k, v ? (n >= 2 + (tot < 6 ? 1 : 0)) : (n >= 4));
    }
    for (const [k, v] of next) cells.set(k, v);
  }
  const land = new Set();
  for (const [k, v] of cells) if (v) land.add(k);
  return land;
}

function largestComponent(land) {
  const comps = components([...land]);
  comps.sort((a, b) => b.length - a.length);
  return new Set(comps[0] || []);
}

// ---- bases: farthest-point sampling among interior tiles ----

export function placeBases(rng, landSet, players, minSep) {
  const land = landSet instanceof Set ? landSet : new Set([...landSet].map(([q, r]) => key(q, r)));
  // interior = tiles whose neighbours are all land (not on the coast)
  let candidates = [...land].filter(k => {
    const [q, r] = unkey(k);
    return neighbors(q, r).filter(([a, b]) => land.has(key(a, b))).length >= 5;
  });
  if (candidates.length < players * 3) candidates = [...land];

  // greedy farthest-point: seed with the candidate farthest from centroid,
  // then repeatedly take the point maximizing min distance to chosen ones
  let cx = 0, cy = 0;
  for (const k of candidates) { const [q, r] = unkey(k); cx += q; cy += r; }
  cx /= candidates.length; cy /= candidates.length;
  candidates = shuffle(rng, candidates);
  let first = candidates[0], fd = -1;
  for (const k of candidates) {
    const [q, r] = unkey(k);
    const d = hexDist(q, r, Math.round(cx), Math.round(cy));
    if (d > fd) { fd = d; first = k; }
  }
  const chosen = [first];
  while (chosen.length < players) {
    let best = null, bd = -1;
    for (const k of candidates) {
      if (chosen.includes(k)) continue;
      const [q, r] = unkey(k);
      let mind = Infinity;
      for (const c of chosen) {
        const [cq, cr] = unkey(c);
        mind = Math.min(mind, hexDist(q, r, cq, cr));
      }
      if (mind > bd) { bd = mind; best = k; }
    }
    if (!best) break;
    chosen.push(best);
  }
  // one relaxation pass: re-place each base at the spot maximizing min dist
  for (let i = 0; i < chosen.length; i++) {
    let best = chosen[i], bd = minDistTo(chosen, i, chosen[i]);
    for (const k of candidates) {
      if (chosen.includes(k)) continue;
      const d = minDistTo(chosen, i, k);
      if (d > bd) { bd = d; best = k; }
    }
    chosen[i] = best;
  }
  return chosen.map(unkey);

  function minDistTo(list, skip, k) {
    const [q, r] = unkey(k);
    let m = Infinity;
    for (let j = 0; j < list.length; j++) {
      if (j === skip) continue;
      const [cq, cr] = unkey(list[j]);
      m = Math.min(m, hexDist(q, r, cq, cr));
    }
    return m;
  }
}

// sanity helper used by tests/editor: are all bases mutually reachable?
export function basesConnected(landArr, bases) {
  const land = new Set(landArr.map(([q, r]) => key(q, r)));
  if (bases.length < 2) return true;
  const start = key(bases[0][0], bases[0][1]);
  const reach = bfs(start, 9999, (k) => land.has(k));
  return bases.every(([q, r]) => reach.has(key(q, r)) || key(q, r) === start);
}
