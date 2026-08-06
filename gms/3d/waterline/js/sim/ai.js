// The five tiers.
//
// This file imports config.js, rng.js and consts.js and NOTHING ELSE. It has no import of
// state.js, it never sees a Game, and there is no code path from here to a ship's true position.
// sim.mjs reads this file and fails the build if that stops being true — the claim is checkable
// rather than promised. The Game→View adapter lives in index.js.

import { ORDNANCE, AI } from './tables.js';
import { makeRng } from './rng.js';
import { UNKNOWN, MISS, HIT, SUNK } from './consts.js';

export const TIER_NAMES = AI;

// How much better than the best single cell an area shot must look before a charge is spent,
// measured in expected distinct ships touched. Tier 4 only.
const GAIN = { heavy: 1.5, salvo: 2.0 };

// Tiebreak band: every cell within this fraction of the best score is a candidate. Without it the
// argmax is a 4-way tie in the middle of the board. That alone was not enough — on a fresh board
// the density peak is sharp, so the opening was still four shots in the centre 2x2 every game.
// For the first two shots the pool is instead the best OPEN_POOL cells outright, which makes the
// opening unpredictable at a cost of a few percent of density on two shots out of ~25.
const TIE = 0.03;
const OPEN_POOL = 14;
const OPEN_SHOTS = 2;

function unresolved(v) {
  const out = [];
  for (let i = 0; i < v.grid.length; i++) if (v.grid[i] === UNKNOWN) out.push(i);
  return out;
}

function openHitCells(v) {
  const out = [];
  for (let i = 0; i < v.grid.length; i++) if (v.grid[i] === HIT) out.push(i);
  return out;
}

const survivors = v => v.enemyShips.filter(s => !s.sunk).map(s => s.len);

// Placement density for one ship length. A placement is valid if it covers no miss and no sunk
// cell and — since the ship is by definition unsunk — is not entirely covered by open hits. In
// target mode only placements touching an open hit count. `prior` reweights each placement by how
// likely this opponent is to put a ship there; a flat prior leaves the result unchanged.
function densityFor(v, len, targeting, prior) {
  const { w, h, grid } = v;
  const d = new Float64Array(w * h);
  let total = 0;
  const scan = (r0, c0, dr, dc) => {
    let hits = 0, pw = 0;
    for (let i = 0; i < len; i++) {
      const idx = (r0 + dr * i) * w + c0 + dc * i;
      const g = grid[idx];
      if (g === MISS || g === SUNK) return;
      if (g === HIT) hits++;
      if (prior) pw += prior[idx];
    }
    if (hits >= len) return;
    if (targeting && hits === 0) return;
    const wgt = (1 + 8 * hits) * (prior ? pw / len : 1);
    total += wgt;
    for (let i = 0; i < len; i++) {
      const idx = (r0 + dr * i) * w + c0 + dc * i;
      if (grid[idx] === UNKNOWN) d[idx] += wgt;
    }
  };
  for (let r = 0; r < h; r++) for (let c = 0; c + len <= w; c++) scan(r, c, 0, 1);
  if (len > 1) for (let r = 0; r + len <= h; r++) for (let c = 0; c < w; c++) scan(r, c, 1, 0);
  return { d, total };
}

function densityModel(v, targeting, prior) {
  const lens = survivors(v);
  const byLen = new Map();
  for (const len of lens) if (!byLen.has(len)) byLen.set(len, densityFor(v, len, targeting, prior));
  const sum = new Float64Array(v.w * v.h);
  const instances = [];
  for (const len of lens) {
    const m = byLen.get(len);
    if (m.total <= 0) continue;
    instances.push(m);
    for (let i = 0; i < sum.length; i++) sum[i] += m.d[i];
  }
  return { sum, instances };
}

// Expected number of DISTINCT surviving ships a set of cells touches. Summed density
// triple-counts a footprint that covers one long ship three times; the per-instance min(1, …) is
// what stops that, and dividing by each length's own placement mass removes the bias towards
// whichever length happens to have the most legal positions left. Tier 4 uses this for shells as
// well as ordnance — that is its edge over tier 3, and it is a policy difference, not ammunition.
function expectedShips(model, cells) {
  let e = 0;
  for (const m of model.instances) {
    let s = 0;
    for (const i of cells) s += m.d[i];
    e += Math.min(1, s / m.total);
  }
  return e;
}

function expectedField(v, model) {
  const out = new Float64Array(v.w * v.h);
  for (const m of model.instances) {
    for (let i = 0; i < out.length; i++) if (v.grid[i] === UNKNOWN) out[i] += Math.min(1, m.d[i] / m.total);
  }
  return out;
}

function argmaxCell(v, score, rng, opening) {
  const live = [];
  let best = -Infinity;
  for (let i = 0; i < score.length; i++) {
    if (v.grid[i] !== UNKNOWN) continue;
    live.push(i);
    if (score[i] > best) best = score[i];
  }
  if (!live.length) return null;
  let pool;
  if (opening) {
    live.sort((a, b) => score[b] - score[a] || a - b);
    pool = live.slice(0, OPEN_POOL);
  } else {
    const floor = best > 0 ? best * (1 - TIE) : best;
    pool = live.filter(i => score[i] >= floor - 1e-12);
  }
  return pool[Math.floor(rng.float() * pool.length)];
}

const asShot = (v, i) => ({ kind: 'shell', r: Math.floor(i / v.w), c: i % v.w });

// A negative result worth recording, because it looks like the obvious next step: sampling whole
// consistent FLEETS (rather than counting each length's placements independently) was built,
// measured over 400 games and abandoned. It cost ~40x the compute and moved shots-to-clear from
// 45.07 to 45.20. Stated honestly, that is "no effect larger than about 1.8 shots" — the SD of
// shots-to-clear is ~9, so 400 whole games cannot resolve less than that, and whole-game means
// dilute an effect that would only show in constrained endgame positions anyway. The theory says
// it should be small here: under BUILD_PLAN §3.1 ships may touch, which removes the "no ship
// adjacent to a sunk hull" inference that makes a joint posterior pay in the no-touching variant.
// Probably at the ceiling, not proven at it. Tier 4's edge came from elsewhere — see chooseShot.

function tier0(v, rng) {
  const u = unresolved(v);
  if (!u.length) return { kind: 'shell', r: 0, c: 0 };
  return asShot(v, u[Math.floor(rng.float() * u.length)]);
}

// Hunt on the parity lattice of the smallest surviving ship; on a hit, work the run.
function tier1(v, rng, k) {
  const { w, h, grid } = v;
  const hits = openHitCells(v);
  if (hits.length) {
    const seen = new Set();
    for (const start of hits) {
      if (seen.has(start)) continue;
      const run = [];
      const stack = [start];
      seen.add(start);
      while (stack.length) {
        const i = stack.pop();
        run.push(i);
        const r = Math.floor(i / w), c = i % w;
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nc < 0 || nr >= h || nc >= w) continue;
          const j = nr * w + nc;
          if (grid[j] === HIT && !seen.has(j)) { seen.add(j); stack.push(j); }
        }
      }
      const rs = run.map(i => Math.floor(i / w)), cs = run.map(i => i % w);
      const sameRow = rs.every(r => r === rs[0]), sameCol = cs.every(c => c === cs[0]);
      let cand = [];
      if (run.length > 1 && sameRow) {
        cand = [[rs[0], Math.min(...cs) - 1], [rs[0], Math.max(...cs) + 1]];
      } else if (run.length > 1 && sameCol) {
        cand = [[Math.min(...rs) - 1, cs[0]], [Math.max(...rs) + 1, cs[0]]];
      } else {
        for (const i of run) {
          const r = Math.floor(i / w), c = i % w;
          cand.push([r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]);
        }
      }
      const ok = cand.filter(([r, c]) => r >= 0 && c >= 0 && r < h && c < w && grid[r * w + c] === UNKNOWN);
      if (ok.length) { const [r, c] = ok[Math.floor(rng.float() * ok.length)]; return { kind: 'shell', r, c }; }
    }
  }
  const lens = survivors(v);
  const L = Math.max(1, Math.min(...(lens.length ? lens : [1])));
  const par = unresolved(v).filter(i => ((Math.floor(i / w) + (i % w)) % L) === (k % L));
  const pool = par.length ? par : unresolved(v);
  if (!pool.length) return { kind: 'shell', r: 0, c: 0 };
  return asShot(v, pool[Math.floor(rng.float() * pool.length)]);
}

function anchorsFor(v, kind) {
  const [lo, hi] = ORDNANCE[kind].anchorInset;
  const out = [];
  for (let r = lo; r <= v.h - 1 - hi; r++) for (let c = lo; c <= v.w - 1 - hi; c++) out.push({ r, c });
  return out;
}

const cellsAt = (v, kind, a) => ORDNANCE[kind].offsets.map(([dr, dc]) => (a.r + dr) * v.w + a.c + dc);

const majorityResolved = (v, cells) => cells.filter(i => v.grid[i] !== UNKNOWN).length * 2 > cells.length;

function pickAnchor(v, kind, score, rng, opening) {
  let best = -Infinity;
  const scored = [];
  for (const a of anchorsFor(v, kind)) {
    const cells = cellsAt(v, kind, a);
    if (majorityResolved(v, cells)) continue;
    const s = score(cells, a);
    if (s === null) continue;
    scored.push({ a, s });
    if (s > best) best = s;
  }
  if (!scored.length) return null;
  let pool;
  if (opening) {
    scored.sort((x, y) => y.s - x.s);
    pool = scored.slice(0, OPEN_POOL);
  } else {
    const floor = best > 0 ? best * (1 - TIE) : best;
    pool = scored.filter(x => x.s >= floor - 1e-12);
  }
  return { anchor: pool[Math.floor(rng.float() * pool.length)].a, score: best };
}

// Tier 3's policy, deliberately the naive one (DECISIONS D6): highest summed density, spent as
// soon as it is available, outer ring avoided for the first three turns.
function naiveOrdnance(v, model, rng, opening) {
  for (const kind of ['salvo', 'heavy']) {
    if (!v.ordnance[kind]) continue;
    const got = pickAnchor(v, kind, cells => {
      if (v.shots < 3) {
        for (const i of cells) {
          const r = Math.floor(i / v.w), c = i % v.w;
          if (r === 0 || c === 0 || r === v.h - 1 || c === v.w - 1) return null;
        }
      }
      let s = 0;
      for (const i of cells) s += model.sum[i];
      return s;
    }, rng, opening);
    if (got) return { kind, r: got.anchor.r, c: got.anchor.c };
  }
  return null;
}

// Tier 4's policy: expected distinct hulls touched, measured against the sampled fleets, held
// entirely while a hit run is open, and spent only when it clearly beats the best single cell.
function goodOrdnance(v, model, field, rng, targeting, opening) {
  if (targeting || !model.instances.length) return null;
  let shellBest = 0;
  for (let i = 0; i < field.length; i++) if (field[i] > shellBest) shellBest = field[i];
  let out = null, outScore = 0;
  for (const kind of ['salvo', 'heavy']) {
    if (!v.ordnance[kind]) continue;
    const got = pickAnchor(v, kind, cells => expectedShips(model, cells), rng, opening);
    if (!got || got.score < GAIN[kind] * shellBest) continue;
    const gain = got.score / (GAIN[kind] * Math.max(shellBest, 1e-9));
    if (gain > outScore) { out = { kind, r: got.anchor.r, c: got.anchor.c }; outScore = gain; }
  }
  return out;
}

// The whole AI. `v` is a View, `seeds` is two integers, `opts.prior` is an optional per-cell
// multiplier learned from layouts this opponent has already shown. There is no other input.
export function chooseShot(v, tier, seeds, opts = {}) {
  const rng = makeRng(seeds.turn);
  const mrng = makeRng(seeds.match);
  const t = Math.max(0, Math.min(4, tier | 0));
  if (t === 0) return tier0(v, rng);
  if (t === 1) return tier1(v, rng, mrng.int(16));

  const prior = t === 4 ? (opts.prior ?? null) : null;
  const targeting = openHitCells(v).length > 0;
  const opening = !targeting && v.shots < OPEN_SHOTS;

  let model = densityModel(v, targeting, prior);
  if (!model.instances.length && targeting) model = densityModel(v, false, prior);

  if (t === 4) {
    // The per-instance-normalised field, for shells as well as ordnance. Measured properly, this
    // is worth NOTHING: +0.06 shots on random layouts, +0.42 clustered, -0.91 touching, and with
    // both fleets forced from one family tier 4's aiming loses to tier 3's at 47%. An earlier
    // comment here credited it with six shots; that was the PRIOR's effect (coverage^-1 plus
    // whatever the memory has learned), which is applied in the same branch. Keep the distinction:
    // tier 4's real edges are the prior, the ordnance policy and where it parks its ships.
    // Kept because it is the natural objective for `goodOrdnance` and costs nothing.
    const field = expectedField(v, model);
    const ord = goodOrdnance(v, model, field, rng, targeting, opening);
    if (ord) return ord;
    const i = argmaxCell(v, field, rng, opening);
    return i === null ? { kind: 'shell', r: 0, c: 0 } : asShot(v, i);
  }
  if (t === 3) {
    const ord = naiveOrdnance(v, model, rng, opening);
    if (ord) return ord;
  }
  const i = argmaxCell(v, model.sum, rng, opening);
  return i === null ? { kind: 'shell', r: 0, c: 0 } : asShot(v, i);
}
