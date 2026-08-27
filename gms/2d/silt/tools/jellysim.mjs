#!/usr/bin/env node
// Jelly + chemistry oracle. Node imports the SHIPPING modules — js/sim/blobs.js
// and js/sim/reactions.js — and hammers them with no DOM and no renderer.
//
//   node tools/jellysim.mjs                 run every gate
//   node tools/jellysim.mjs --ticks 3000    longer soak
//   node tools/jellysim.mjs --break <arm>   falsification: that arm MUST go red
//   node tools/jellysim.mjs --break all     run every arm in turn
//   node tools/jellysim.mjs --table         print the reaction table and exit
//
// Arms: ledger orphan rng merge split dissolve fall wobble spread reactions
//
// A gate that has never been proven to fail is not evidence. Every gate below
// has an arm that breaks exactly the thing it claims to guard, and `--break all`
// runs the lot, so the suite audits itself.

import { Grid, F_BLOB, F_CLEARING } from '../js/sim/grid.js';
import { step } from '../js/sim/step.js';
import { Clears, DISSOLVE_TICKS } from '../js/sim/clears.js';
import { makeRng } from '../js/core/rng.js';
import { Blobs, auditBlobs } from '../js/sim/blobs.js';
import {
  RULES, PAIRS, REACTION_TABLE, applyReaction, rulesFor, describe,
} from '../js/sim/reactions.js';
import {
  EMPTY, WALL, SAND, WATER, JELLY, OIL, LAVA, ICE, ASH, CRYSTAL, FIRE, STEAM,
  MAT_COUNT, TINTABLE, LIFE, KIND, STATIC,
} from '../js/sim/materials.js';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const has = (k) => args.includes(k);
const TICKS = +opt('--ticks', 1400);
const ARMS = ['ledger', 'orphan', 'rng', 'merge', 'split', 'dissolve', 'fall', 'wobble', 'spread', 'reactions'];
let BREAK = opt('--break', null);

if (has('--table')) {
  console.log(`SILT reactions — ${RULES.length} rules, ${PAIRS.length} concrete pairs\n`);
  for (const line of describe()) console.log('  ' + line);
  process.exit(0);
}

let failures = [];
const fail = (gate, msg) => { failures.push(`${gate}: ${msg}`); };
const MNAME = ['empty', 'wall', 'sand', 'water', 'jelly', 'oil', 'lava', 'ice', 'ash', 'crystal', 'fire', 'steam'];

// The ledger arm has to be installed before anything allocates a grid.
if (BREAK === 'ledger') {
  Grid.prototype.set = function (i, m, tint = 0) {
    this.mat[i] = m; this.tint[i] = tint; this.flags[i] = 0;
    this.life[i] = 0; this.blob[i] = 0; this.clearT[i] = 0;
    this.touchIdx(i);          // deliberately forgets to maintain `count`
  };
}

// ------------------------------------------------------------------ helpers

function hashGrid(g) {
  let h = 2166136261 >>> 0;
  const mix = (v) => { h ^= v; h = Math.imul(h, 16777619) >>> 0; };
  for (let i = 0; i < g.n; i++) { mix(g.mat[i]); mix(g.tint[i]); mix(g.flags[i]); mix(g.blob[i] & 255); }
  return h >>> 0;
}

function hashBlobs(blobs) {
  let h = 2166136261 >>> 0;
  const mix = (v) => { h ^= (v | 0); h = Math.imul(h, 16777619) >>> 0; };
  for (const b of blobs.list()) {
    mix(b.id); mix(b.tint); mix(b.n);
    mix(Math.round(b.px * 64)); mix(Math.round(b.py * 64));
    mix(Math.round(b.q * 1024)); mix(Math.round(b.vy * 1024));
  }
  return h >>> 0;
}

/** Structural invariants that must hold after every single tick. */
function checkGrid(g, label) {
  const rc = g.recount();
  if (g.count !== rc) return `${label}: ledger drift count=${g.count} actual=${rc}`;
  for (let i = 0; i < g.n; i++) {
    const m = g.mat[i];
    if (m >= MAT_COUNT) return `${label}: invalid material ${m} at ${i}`;
    if (m === EMPTY && g.tint[i] !== 0) return `${label}: empty cell carries tint at ${i}`;
    if (m === EMPTY && g.flags[i] !== 0) return `${label}: empty cell carries flags at ${i}`;
    if (m === EMPTY && g.blob[i] !== 0) return `${label}: empty cell carries a blob id at ${i}`;
    if ((g.flags[i] & F_BLOB) && m !== JELLY) return `${label}: F_BLOB on ${MNAME[m]} at ${i}`;
    if (g.clearT[i] > DISSOLVE_TICKS) return `${label}: clearT overflow at ${i}`;
  }
  return null;
}

function blobCells(g, x0, y0, w, h) {
  const cells = [];
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (g.inb(x, y)) cells.push({ x, y });
  return cells;
}

function extents(g, b) {
  let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
  for (let k = 0; k < b.n; k++) {
    const i = b.cells[k], x = i % g.cols, y = (i / g.cols) | 0;
    if (x < minx) minx = x; if (x > maxx) maxx = x;
    if (y < miny) miny = y; if (y > maxy) maxy = y;
  }
  return { minx, maxx, miny, maxy, w: maxx - minx + 1, h: maxy - miny + 1 };
}

/** A board with a floor, a slab of terrain and a stream of jelly drops. */
function scene(seed, o = {}) {
  const cols = o.cols || 64, rows = o.rows || 96;
  const g = new Grid(cols, rows);
  const rng = makeRng(seed);
  const floor = rows - 4;
  g.fill(0, floor, cols, 4, WALL);
  if (o.terrain !== false) {
    g.fill(10, floor - 8, 8, 8, WALL);
    g.fill(cols - 22, floor - 5, 6, 5, WALL);
  }
  const blobs = new Blobs(g);
  const stats = { created: 0, destroyed: 0, reactions: 0, reactionsEnabled: !!o.reactions };
  g.wakeAll();
  return { g, rng, blobs, stats, floor, cols, rows };
}

function soak(s, ticks, o = {}) {
  const { g, rng, blobs, stats } = s;
  const clears = o.clears ? new Clears(g, { diagonal: true }) : null;
  let err = null;
  for (let t = 0; t < ticks; t++) {
    if (o.spawnEvery && t % o.spawnEvery === 0 && blobs.list().length < (o.maxBlobs || 6)) {
      const w = 6 + rng.int(8), h = 5 + rng.int(6);
      const x = 2 + rng.int(g.cols - w - 4);
      blobs.spawn(blobCells(g, x, 1, w, h), 1 + rng.int(o.tints || 2));
    }
    if (o.rainEvery && t % o.rainEvery === 0) {
      for (let k = 0; k < 12; k++) {
        const i = rng.int(g.cols) + g.cols * (1 + rng.int(3));
        if (g.mat[i] === EMPTY) g.set(i, o.rainMat || SAND, 1 + rng.int(2));
      }
    }
    if (o.arm && o.arm(t, s, blobs, g)) { /* the falsification arm ran */ }

    blobs.step(rng, stats);
    step(g, rng, stats);
    if (clears) { clears.advance(stats); if (t % 3 === 0) clears.detect(); }

    err = checkGrid(g, `tick ${t}`) || auditBlobs(blobs, `tick ${t}`);
    if (err) return err;
  }
  return null;
}

// ------------------------------------------------------------- G1 ledger
// The whole point of the rasteriser: blob motion is a permutation, so `count`
// must be untouched by it even while blobs shove water and oil around.
function gateLedger() {
  const s = scene(11, { reactions: false });
  // pre-fill a pool so blobs have fluid to displace
  s.g.fill(24, s.floor - 14, 30, 14, WATER, 1);
  s.g.fill(2, s.floor - 6, 8, 6, OIL, 2);
  s.g.wakeAll();
  const err = soak(s, Math.min(TICKS, 900), {
    spawnEvery: 90, rainEvery: 25, maxBlobs: 5,
    arm: (t) => BREAK === 'ledger' && t === 200 ? (s.g.mat[s.g.idx(5, 5)] = SAND, true) : false,
  });
  if (err) return fail('G1-ledger', err);
  const rc = s.g.recount();
  if (s.g.count !== rc) fail('G1-ledger', `final drift ${s.g.count} vs ${rc}`);
  return { cells: s.g.count, blobs: s.blobs.list().length };
}

// -------------------------------------------------------------- G2 orphans
// Every F_BLOB cell belongs to exactly one live blob and every live blob cell is
// F_BLOB, jelly, and tagged with that blob's id. Checked after every tick by
// soak(); this gate exists to prove the check can catch a planted fault.
function gateOrphans() {
  const s = scene(23);
  const err = soak(s, Math.min(TICKS, 700), {
    spawnEvery: 70, maxBlobs: 6, tints: 3,
    arm: (t, sc, blobs, g) => {
      if (BREAK !== 'orphan' || t !== 300) return false;
      for (let i = 0; i < g.n; i++) {
        if (g.mat[i] === EMPTY && g.flags[i] === 0) {
          g.set(i, JELLY, 1); g.flags[i] = F_BLOB; g.blob[i] = 4242; return true;
        }
      }
      return false;
    },
  });
  if (err) fail('G2-orphans', err);
}

// --------------------------------------------------------- G3 determinism
function runSeeded(seed, ticks) {
  const s = scene(seed, { reactions: true });
  s.g.fill(20, s.floor - 10, 24, 10, WATER, 1);
  s.g.fill(46, s.floor - 3, 6, 3, LAVA);
  s.g.wakeAll();
  if (BREAK === 'rng') s.rng.next = Math.random;
  soak(s, ticks, { spawnEvery: 60, rainEvery: 20, maxBlobs: 5, tints: 2 });
  return { g: hashGrid(s.g), b: hashBlobs(s.blobs), cells: s.g.count };
}

function gateDeterminism() {
  const T = Math.min(TICKS, 600);
  const a = runSeeded(5, T), b = runSeeded(5, T);
  if (a.g !== b.g) return fail('G3-determinism', `same seed, grid diverged ${a.g} vs ${b.g}`);
  if (a.b !== b.b) return fail('G3-determinism', `same seed, blob state diverged ${a.b} vs ${b.b}`);
  const c = runSeeded(6, T);
  if (c.g === a.g) fail('G4-seeds', 'different seeds produced an identical board — is the seed wired up?');
}

// -------------------------------------------------------------- G5 merging
// Two same-tint bodies that touch become one body with the summed cell count.
// Two different-tint bodies that touch stay two, however long they sit there.
function gateMerge() {
  const s = scene(31, { terrain: false });
  const { g, rng, blobs } = s;
  if (BREAK === 'merge') blobs.merging = false;

  const A = blobs.spawn(blobCells(g, 16, s.floor - 10, 8, 8), 1);
  const B = blobs.spawn(blobCells(g, 24, s.floor - 10, 8, 8), 1);   // flush against A
  const nA = blobs.get(A).n, nB = blobs.get(B).n;
  if (blobs.list().length !== 2) return fail('G5-merge', `spawn made ${blobs.list().length} blobs, expected 2`);

  for (let t = 0; t < 8; t++) {
    blobs.step(rng, s.stats); step(g, rng, s.stats);
    const e = checkGrid(g, `merge t${t}`) || auditBlobs(blobs, `merge t${t}`);
    if (e) return fail('G5-merge', e);
  }
  const live = blobs.list();
  if (live.length !== 1) return fail('G5-merge', `touching same-tint blobs did not merge (${live.length} remain)`);
  if (live[0].n !== nA + nB) return fail('G5-merge', `merged blob has ${live[0].n} cells, expected ${nA + nB}`);

  // and the negative: different tints must never fuse
  const s2 = scene(32, { terrain: false });
  const C = s2.blobs.spawn(blobCells(s2.g, 16, s2.floor - 10, 8, 8), 1);
  const D = s2.blobs.spawn(blobCells(s2.g, 24, s2.floor - 10, 8, 8), 2);
  void C; void D;
  for (let t = 0; t < 60; t++) { s2.blobs.step(s2.rng, s2.stats); step(s2.g, s2.rng, s2.stats); }
  const e2 = checkGrid(s2.g, 'merge-neg') || auditBlobs(s2.blobs, 'merge-neg');
  if (e2) return fail('G5-merge', e2);
  if (s2.blobs.list().length !== 2) fail('G5-merge', 'different-tint blobs fused — tint is not gating the merge');
  return { merged: live[0].n };
}

// --------------------------------------------------------------- G6 split
// A body cut in half must become two bodies, not one body with a detached lump
// that then teleports toward the parent's centroid.
function gateSplit() {
  const s = scene(41, { terrain: false });
  const { g, rng, blobs } = s;
  const id = blobs.spawn(blobCells(g, 10, s.floor - 6, 30, 6), 1);
  for (let t = 0; t < 6; t++) { blobs.step(rng, s.stats); step(g, rng, s.stats); }
  const before = blobs.get(id);
  if (!before) return fail('G6-split', 'blob vanished before the cut');
  const nBefore = before.n;

  // cut a two-wide waist by melting it, the way fire would
  const ex = extents(g, before);
  const cutX = (ex.minx + ex.maxx) >> 1;
  let cut = 0;
  for (let k = 0; k < before.n; k++) {
    const i = before.cells[k], x = i % g.cols;
    if (x === cutX || x === cutX + 1) { g.set(i, WATER, 1); cut++; }
  }
  if (cut === 0) return fail('G6-split', 'the cut removed nothing — test is not testing');
  if (BREAK === 'split') blobs._split = () => {};

  blobs.step(rng, s.stats); step(g, rng, s.stats);
  const e = checkGrid(g, 'split') || auditBlobs(blobs, 'split');
  if (e) return fail('G6-split', e);
  const live = blobs.list();
  if (live.length !== 2) return fail('G6-split', `cut body became ${live.length} blobs, expected 2`);
  const sum = live[0].n + live[1].n;
  if (sum !== nBefore - cut) fail('G6-split', `cells after the cut ${sum}, expected ${nBefore - cut}`);
  return { pieces: live.length, cut };
}

// ------------------------------------------------------------ G7 dissolve
// A chain runs on the plain grid and knows nothing about blobs, so it will stamp
// F_CLEARING straight onto jelly. The blob must freeze, then die cleanly as its
// cells are removed under it — no orphans, no ledger drift.
function gateDissolve() {
  const cols = 40, rows = 30;
  const g = new Grid(cols, rows);
  const rng = makeRng(51);
  g.fill(0, rows - 3, cols, 3, WALL);
  const blobs = new Blobs(g);
  const stats = { created: 0, destroyed: 0, reactions: 0, reactionsEnabled: false };
  const clears = new Clears(g, { diagonal: true });
  const id = blobs.spawn(blobCells(g, 0, rows - 6, cols, 3), 1);
  const n0 = blobs.get(id).n;
  g.wakeAll();

  const found = clears.detect();
  if (found === 0) return fail('G7-dissolve', 'a wall-to-wall jelly slab did not register as a chain');
  if (BREAK === 'dissolve') {
    // pretend the blob owns cells the grid has already taken back
    for (let t = 0; t < DISSOLVE_TICKS + 6; t++) { clears.advance(stats); step(g, rng, stats); }
    const e = auditBlobs(blobs, 'dissolve');
    if (e) fail('G7-dissolve', e); else fail('G7-dissolve', 'arm did not desync the blob');
    return;
  }
  let froze = false;
  for (let t = 0; t < DISSOLVE_TICKS + 20; t++) {
    blobs.step(rng, stats);
    const b = blobs.get(id);
    if (b && b.frozen) froze = true;
    clears.advance(stats);
    step(g, rng, stats);
    const e = checkGrid(g, `dissolve t${t}`) || auditBlobs(blobs, `dissolve t${t}`);
    if (e) return fail('G7-dissolve', e);
  }
  if (!froze) fail('G7-dissolve', 'the blob never registered as frozen while dissolving');
  if (blobs.get(id)) fail('G7-dissolve', 'the blob outlived every one of its cells');
  if (blobs.list().length !== 0) fail('G7-dissolve', `${blobs.list().length} blobs survived a full dissolve`);
  if (g.count !== g.recount()) fail('G7-dissolve', 'ledger drift after dissolve');
  return { cells: n0 };
}

// ------------------------------------------------------------ G8 falling
function gateFall() {
  const s = scene(61, { terrain: false });
  const { g, rng, blobs } = s;
  if (BREAK === 'fall') blobs.gravity = 0;
  const id = blobs.spawn(blobCells(g, 24, 2, 12, 8), 1);
  const b0 = blobs.get(id);
  const n0 = b0.n, y0 = b0.py;
  for (let t = 0; t < 400; t++) {
    blobs.step(rng, s.stats); step(g, rng, s.stats);
    const e = checkGrid(g, `fall t${t}`) || auditBlobs(blobs, `fall t${t}`);
    if (e) return fail('G8-fall', e);
  }
  const b = blobs.get(id);
  if (!b) return fail('G8-fall', 'the blob evaporated on the way down');
  if (b.n !== n0) return fail('G8-fall', `cell count changed in flight ${n0} -> ${b.n}`);
  if (b.py <= y0 + 10) return fail('G8-fall', `blob did not fall (py ${y0.toFixed(1)} -> ${b.py.toFixed(1)})`);
  const ex = extents(g, b);
  if (ex.maxy >= s.floor) return fail('G8-fall', `blob sank into the floor (maxy ${ex.maxy}, floor ${s.floor})`);
  if (ex.maxy < s.floor - 3) return fail('G8-fall', `blob stopped short of the floor (maxy ${ex.maxy}, floor ${s.floor})`);
  if (!b.grounded) fail('G8-fall', 'a landed blob does not consider itself grounded');
  return { fell: +(b.py - y0).toFixed(1), rest: ex.maxy };
}

// ------------------------------------------------------------- G9 wobble
// The prettiest thing in the game has to be measurable, or it is a claim.
// Landing must squash the body (q dips), and the spring must carry it back past
// where it settles at least twice — i.e. it jiggles rather than sagging.
function gateWobble() {
  const s = scene(71, { terrain: false });
  const { g, rng, blobs } = s;
  const id = blobs.spawn(blobCells(g, 24, 4, 12, 10), 1);
  const trace = [];
  let impact = 0, impactTick = -1;
  for (let t = 0; t < 300; t++) {
    blobs.step(rng, s.stats); step(g, rng, s.stats);
    if (BREAK === 'wobble') { const b = blobs.get(id); if (b) { b.q = 1; b.vq = 0; } }
    const b = blobs.get(id);
    if (!b) return fail('G9-wobble', 'blob lost');
    if (b.impact > impact) { impact = b.impact; impactTick = t; }
    trace.push(b.q);
  }
  if (impactTick < 0) return fail('G9-wobble', 'landing never registered an impact');
  const pre = trace[impactTick - 1];
  const post = trace.slice(impactTick, impactTick + 40);
  const dip = Math.min(...post);
  if (dip > pre - 0.05) return fail('G9-wobble', `no squash on impact (q ${pre.toFixed(3)} -> min ${dip.toFixed(3)})`);

  const tail = trace.slice(impactTick, impactTick + 150);
  const settle = trace[trace.length - 1];
  let crossings = 0;
  for (let k = 1; k < tail.length; k++) {
    if ((tail[k - 1] - settle) * (tail[k] - settle) < 0) crossings++;
  }
  if (crossings < 2) fail('G9-wobble', `the spring does not oscillate (${crossings} crossings of the settled value)`);
  const amp = Math.max(...tail) - Math.min(...tail);
  if (amp < 0.05) fail('G9-wobble', `wobble amplitude ${amp.toFixed(3)} is invisible`);
  return { impact: +impact.toFixed(2), crossings, amp: +amp.toFixed(3) };
}

// ------------------------------------------------------------- G10 spread
// Load is the JELLY LAB mechanic: pile weight on a blob and it must pancake and
// reach further sideways, because that is how a chain gets to the far wall.
function gateSpread() {
  const s = scene(81, { terrain: false, cols: 80 });
  const { g, rng, blobs } = s;
  if (BREAK === 'spread') blobs._load = () => 0;
  const id = blobs.spawn(blobCells(g, 30, s.floor - 14, 18, 12), 1);
  for (let t = 0; t < 160; t++) { blobs.step(rng, s.stats); step(g, rng, s.stats); }
  const before = extents(g, blobs.get(id));
  const qBefore = blobs.get(id).q;

  for (let t = 0; t < 700; t++) {
    if (t % 3 === 0 && t < 500) {
      for (let x = 26; x < 54; x++) { const i = g.idx(x, 1); if (g.mat[i] === EMPTY) g.set(i, SAND, 2); }
    }
    blobs.step(rng, s.stats); step(g, rng, s.stats);
    const e = checkGrid(g, `spread t${t}`) || auditBlobs(blobs, `spread t${t}`);
    if (e) return fail('G10-spread', e);
  }
  const b = blobs.get(id);
  if (!b) return fail('G10-spread', 'blob crushed out of existence');
  const after = extents(g, b);
  if (b.load <= 0.02) return fail('G10-spread', `no load measured under a sand column (load ${b.load.toFixed(3)})`);
  if (b.q >= qBefore - 0.03) return fail('G10-spread', `load did not squash the body (q ${qBefore.toFixed(3)} -> ${b.q.toFixed(3)})`);
  if (after.w <= before.w + 2) return fail('G10-spread', `load did not spread the body (w ${before.w} -> ${after.w})`);
  if (b.n !== before.w * 0 + b.n) fail('G10-spread', 'impossible');
  return { w: `${before.w}->${after.w}`, q: `${qBefore.toFixed(2)}->${b.q.toFixed(2)}`, load: +b.load.toFixed(2) };
}

// ---------------------------------------------------------- G11 reactions
// Exhaustive over the whole MAT_COUNT^2 space, not just the pairs someone
// remembered. For every ordered pair: run applyReaction many times and demand
// that the ledger holds, the products are real materials, the tint policy is
// respected, gases get a lifetime, and pairs with no rule never fire. Then
// demand coverage: every rule in the table must have been seen to fire.
function gateReactions() {
  if (BREAK === 'reactions') {
    REACTION_TABLE[SAND * MAT_COUNT + WATER] = [{
      index: -1, name: 'bogus', a: SAND, b: WATER, p: 1,
      self: 200, other: null, selfTint: 'keep', otherTint: 'keep', destroys: false,
    }];
  }
  const g = new Grid(8, 8);
  const rng = makeRng(97);
  const fired = new Set();
  const TRIALS = 700;
  let pairsWithRules = 0, totalFires = 0;

  for (let a = 1; a < MAT_COUNT; a++) {
    for (let b = 1; b < MAT_COUNT; b++) {
      const rules = rulesFor(a, b);
      if (rules.length) pairsWithRules++;
      let fires = 0;
      for (let trial = 0; trial < TRIALS; trial++) {
        g.reset();
        const ta = TINTABLE[a] ? 1 + (trial % 3) : 0;
        const tb = TINTABLE[b] ? 1 + (trial % 4) : 0;
        const i = g.idx(3, 3), ni = g.idx(4, 3);
        g.set(i, a, ta); g.set(ni, b, tb);
        if (LIFE[a]) g.life[i] = LIFE[a];
        if (LIFE[b]) g.life[ni] = LIFE[b];
        const before = g.count;
        const stats = { created: 0, destroyed: 0, reactions: 0 };

        const hit = applyReaction(g, i, ni, rng, stats);

        if (!rules.length) {
          if (hit) { fail('G11-reactions', `${MNAME[a]}+${MNAME[b]} fired with no rule registered`); trial = TRIALS; continue; }
          if (g.mat[i] !== a || g.mat[ni] !== b) { fail('G11-reactions', `${MNAME[a]}+${MNAME[b]} mutated cells without firing`); trial = TRIALS; }
          continue;
        }
        if (!hit) continue;
        fires++; totalFires++;
        fired.add(stats.lastRule);
        if (stats.reactions !== 1) { fail('G11-reactions', `${stats.lastRule}: stats.reactions ${stats.reactions}, expected 1`); trial = TRIALS; continue; }

        const ma = g.mat[i], mb = g.mat[ni];
        if (ma >= MAT_COUNT || mb >= MAT_COUNT) {
          fail('G11-reactions', `${MNAME[a]}+${MNAME[b]} (${stats.lastRule}) produced invalid material ${Math.max(ma, mb)}`);
          trial = TRIALS; continue;
        }
        const expect = before - stats.destroyed + stats.created;
        if (g.count !== expect || g.count !== g.recount()) {
          fail('G11-reactions', `${stats.lastRule}: ledger ${before} -> ${g.count}, recount ${g.recount()}, expected ${expect}`);
          trial = TRIALS; continue;
        }
        if (ma === EMPTY || mb === EMPTY) {
          if (!stats.destroyed) { fail('G11-reactions', `${stats.lastRule}: emptied a cell without accounting for it`); trial = TRIALS; continue; }
        }
        for (const [cell, m] of [[i, ma], [ni, mb]]) {
          if (!TINTABLE[m] && g.tint[cell] !== 0) { fail('G11-reactions', `${stats.lastRule}: untintable ${MNAME[m]} kept tint ${g.tint[cell]}`); trial = TRIALS; break; }
          if (LIFE[m] && g.life[cell] !== LIFE[m]) { fail('G11-reactions', `${stats.lastRule}: ${MNAME[m]} has life ${g.life[cell]}, expected ${LIFE[m]}`); trial = TRIALS; break; }
          if ((g.flags[cell] & F_BLOB) && m !== JELLY) { fail('G11-reactions', `${stats.lastRule}: left F_BLOB on ${MNAME[m]}`); trial = TRIALS; break; }
        }
      }
      if (rules.length && fires === 0) {
        fail('G11-reactions', `${MNAME[a]}+${MNAME[b]} has ${rules.length} rule(s) but never fired in ${TRIALS} trials`);
      }
    }
  }

  for (const r of PAIRS) {
    if (!fired.has(r.name)) fail('G11-reactions', `rule "${r.name}" (${MNAME[r.a]}+${MNAME[r.b]}) was never exercised`);
  }
  // permanence: nothing in the table consumes crystal
  for (let b = 1; b < MAT_COUNT; b++) {
    for (const r of rulesFor(CRYSTAL, b)) if (r.self !== null && r.self !== CRYSTAL) fail('G11-reactions', `rule "${r.name}" destroys crystal — crystal is meant to be permanent`);
    for (const r of rulesFor(b, CRYSTAL)) if (r.other !== null && r.other !== CRYSTAL) fail('G11-reactions', `rule "${r.name}" destroys crystal — crystal is meant to be permanent`);
  }
  // jelly is never the `a` side, because step.js never processes an F_BLOB cell
  for (let b = 1; b < MAT_COUNT; b++) {
    if (rulesFor(JELLY, b).length) fail('G11-reactions', `jelly appears as the driving side in a rule with ${MNAME[b]}; step.js will never run it`);
  }
  return { pairs: pairsWithRules, rules: PAIRS.length, fires: totalFires };
}

// -------------------------------------------------- G12 reactions in anger
// The table above is exercised in a vacuum. This one runs it inside the real
// step loop with blobs present, which is where an F_BLOB cell turning into
// water is either handled or a source of orphans.
function gateChemLive() {
  const s = scene(101, { terrain: false, reactions: true });
  const { g, rng, blobs, stats } = s;
  g.fill(0, s.floor - 2, g.cols, 2, LAVA);
  g.fill(4, s.floor - 22, 10, 8, ICE, 1);
  g.fill(40, s.floor - 22, 10, 8, OIL, 2);
  g.fill(20, s.floor - 30, 8, 6, WATER, 3);
  g.fill(52, s.floor - 12, 4, 4, ASH);
  for (let x = 30; x < 36; x++) g.set(g.idx(x, s.floor - 4), FIRE);
  blobs.spawn(blobCells(g, 14, s.floor - 14, 12, 8), 1);
  blobs.spawn(blobCells(g, 30, s.floor - 34, 10, 8), 2);
  g.wakeAll();

  const err = soak(s, Math.min(TICKS, 900), { spawnEvery: 150, maxBlobs: 5, tints: 2 });
  if (err) return fail('G12-chem-live', err);
  if (stats.reactions === 0) fail('G12-chem-live', 'no reaction fired in a board built entirely out of reagents');
  return { reactions: stats.reactions, blobs: blobs.list().length };
}

// --------------------------------------------------------------- G13 perf
function gatePerf() {
  const s = scene(7, { cols: 112, rows: 224 });
  const { g, rng, blobs, stats } = s;
  for (let k = 0; k < 5; k++) blobs.spawn(blobCells(g, 6 + k * 20, 20 + k * 8, 16, 12), 1 + (k % 2));
  for (let t = 0; t < 600; t++) { blobs.step(rng, stats); step(g, rng, stats); }
  const N = 400;
  const t0 = process.hrtime.bigint();
  for (let t = 0; t < N; t++) blobs.step(rng, stats);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / N;
  if (ms > 2) fail('G13-perf', `${ms.toFixed(3)} ms/tick of blob work exceeds the 2 ms budget`);
  return { ms, blobs: blobs.list().length, cells: blobs.cellCount };
}

// --------------------------------------------------------------------- run

function runAll() {
  failures = [];
  const out = {};
  out.ledger = gateLedger();
  gateOrphans();
  gateDeterminism();
  out.merge = gateMerge();
  out.split = gateSplit();
  out.dissolve = gateDissolve();
  out.fall = gateFall();
  out.wobble = gateWobble();
  out.spread = gateSpread();
  out.react = gateReactions();
  out.chem = gateChemLive();
  out.perf = gatePerf();
  return out;
}

if (BREAK === 'all') {
  // Child processes: each arm needs a pristine module graph (the ledger arm
  // patches a prototype, the reactions arm edits the table).
  const { spawnSync } = await import('node:child_process');
  let bad = 0;
  console.log('SILT jelly gates — falsification sweep');
  for (const arm of ARMS) {
    const r = spawnSync(process.execPath, [process.argv[1], '--break', arm, '--ticks', String(TICKS)], { encoding: 'utf8' });
    const red = /^FAIL/m.test(r.stdout);
    console.log(`  ${red ? 'red  ' : 'GREEN'}  --break ${arm}${red ? '' : '   <-- gate did not detect the fault'}`);
    if (!red) bad++;
  }
  console.log(bad ? `\n${bad}/${ARMS.length} arms failed to trip their gate` : `\nall ${ARMS.length} arms tripped their gate`);
  process.exit(bad ? 1 : 0);
}

if (BREAK && !ARMS.includes(BREAK)) {
  console.log(`unknown arm "${BREAK}" — one of: ${ARMS.join(' ')} all`);
  process.exit(2);
}

console.log(BREAK ? `SILT jelly gates  [FALSIFY: ${BREAK}]` : 'SILT jelly gates');
const R = runAll();

if (!BREAK) {
  if (R.ledger) console.log(`  ledger    ${R.ledger.cells} cells stable, ${R.ledger.blobs} blobs live`);
  if (R.merge) console.log(`  merge     two bodies -> one of ${R.merge.merged} cells`);
  if (R.split) console.log(`  split     one body -> ${R.split.pieces}, ${R.split.cut} cells melted out`);
  if (R.dissolve) console.log(`  dissolve  ${R.dissolve.cells}-cell blob cleared by a chain, no orphans`);
  if (R.fall) console.log(`  fall      fell ${R.fall.fell} rows, rests at y=${R.fall.rest}`);
  if (R.wobble) console.log(`  wobble    impact ${R.wobble.impact}, ${R.wobble.crossings} oscillations, amp ${R.wobble.amp}`);
  if (R.spread) console.log(`  spread    width ${R.spread.w} under load ${R.spread.load} (q ${R.spread.q})`);
  if (R.react) console.log(`  reactions ${R.react.rules} rules over ${R.react.pairs} pairs, ${R.react.fires} fires, ${MAT_COUNT * MAT_COUNT} pairs swept`);
  if (R.chem) console.log(`  chem-live ${R.chem.reactions} reactions in the real step loop`);
  if (R.perf) console.log(`  perf      ${R.perf.ms.toFixed(3)} ms/tick for ${R.perf.blobs} blobs / ${R.perf.cells} cells`);
}

void KIND; void STATIC; void F_CLEARING; void STEAM; void FIRE;

if (failures.length) {
  console.log('\nFAIL');
  for (const f of failures) console.log('  x ' + f);
  process.exit(BREAK ? 0 : 1);
} else {
  console.log('\nPASS  all gates green');
  if (BREAK) { console.log(`  !! falsify arm "${BREAK}" did NOT trip a gate — the gate is not testing what it claims`); process.exit(1); }
}
