#!/usr/bin/env node
// The oracle. Node imports the SHIPPING sim modules — not a re-implementation —
// and hammers them. Everything the browser build does to the grid happens here
// first, with no GPU and no DOM.
//
//   node tools/sim.mjs                 run every gate
//   node tools/sim.mjs --games 40      longer play gate
//   node tools/sim.mjs --break <gate>  falsification arm: that gate MUST go red
//     arms: mass  ledger  rng  clears  identity  ramp
//
// A gate that has never been proven to fail is not evidence, so --break exists
// to show each one actually detecting the fault it claims to guard.

import { World, SIM_HZ } from '../js/sim/world.js';
import { Grid } from '../js/sim/grid.js';
import { Clears, DISSOLVE_TICKS } from '../js/sim/clears.js';
import { step } from '../js/sim/step.js';
import { makeRng } from '../js/core/rng.js';
import { Bot } from '../js/ai/bot.js';
import { SAND, WATER, EMPTY, MAT_COUNT, TINTABLE } from '../js/sim/materials.js';

// Drive the SHIPPING mode, not the bare engine. The engine carries a fallback
// scoring formula that every mode deliberately replaces, so a gate run against
// a raw World reports a score no player will ever see — it read 747473 here
// while the real FLOW mode scored 276 for the same work.
let FLOW = null;
try { FLOW = (await import('../js/modes/index.js')).MODES.find((m) => m.id === 'flow'); } catch { /* modes not built yet */ }
const modeApi = (w) => ({ rng: w.rng, biome() {}, shake() {}, banner() {}, setGravity(x, y) { w.setGravity(x, y); }, sfx() {} });
import { F_CLEARING } from '../js/sim/grid.js';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const GAMES = +opt('--games', 12);
const BREAK = opt('--break', null);

let failures = [];
const fail = (gate, msg) => { failures.push(`${gate}: ${msg}`); };

function hashGrid(g) {
  let h = 2166136261 >>> 0;
  const m = g.mat, t = g.tint;
  for (let i = 0; i < m.length; i++) {
    h ^= m[i]; h = Math.imul(h, 16777619) >>> 0;
    h ^= t[i]; h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Structural invariants that must hold after every single tick. */
function check(w, label) {
  const g = w.g;
  const rc = g.recount();
  if (g.count !== rc) return `${label}: ledger drift count=${g.count} actual=${rc}`;
  for (let i = 0; i < g.n; i++) {
    const m = g.mat[i];
    if (m >= MAT_COUNT) return `${label}: invalid material ${m} at ${i}`;
    if (m === EMPTY && g.tint[i] !== 0) return `${label}: empty cell carries tint at ${i}`;
    if (m === EMPTY && (g.flags[i] & F_CLEARING)) return `${label}: empty cell flagged clearing at ${i}`;
    if (g.clearT[i] > 0 && !(g.flags[i] & F_CLEARING)) return `${label}: clearT without flag at ${i}`;
    if (g.clearT[i] > DISSOLVE_TICKS) return `${label}: clearT overflow at ${i}`;
  }
  return null;
}

// ---------------------------------------------------------------- G1 mass
// Pure movement must never create or destroy a grain. No pieces, no chains,
// no chemistry — just sand falling through water for 2000 ticks.
function gateMass() {
  const g = new Grid(64, 96);
  const rng = makeRng(7);
  for (let k = 0; k < 900; k++) g.set(rng.int(g.n), SAND, 1 + rng.int(3));
  for (let k = 0; k < 700; k++) {
    const i = rng.int(g.n);
    if (g.mat[i] === EMPTY) g.set(i, WATER, 1);
  }
  g.wakeAll();
  const start = g.count;
  const stats = { created: 0, destroyed: 0, reactions: 0, reactionsEnabled: false };
  for (let t = 0; t < 2000; t++) {
    step(g, rng, stats);
    if (BREAK === 'mass' && t === 500) { const i = g.mat.findIndex((m) => m !== EMPTY); g.mat[i] = EMPTY; }
    if (g.count !== start) return fail('G1-mass', `count moved ${start} -> ${g.count} at tick ${t}`);
  }
  const rc = g.recount();
  if (rc !== start) fail('G1-mass', `recount ${rc} != ${start}`);
  if (stats.created || stats.destroyed) fail('G1-mass', `pure movement reported created=${stats.created} destroyed=${stats.destroyed}`);
}

// ------------------------------------------------------------- G2 ledger
function gateLedger() {
  const w = new World({ seed: 99 });
  const bot = new Bot(w);
  for (let t = 0; t < 2400 && !w.over; t++) {
    bot.update();
    w.tick();
    if (t % 40 === 0) {
      const err = check(w, 'G2');
      if (err) return fail('G2-ledger', err);
    }
  }
  const err = check(w, 'G2-final');
  if (err) fail('G2-ledger', err);
}

// -------------------------------------------------------- G3/G4 determinism
function runSeeded(seed, ticks) {
  const w = new World({ seed });
  const bot = new Bot(w);
  for (let t = 0; t < ticks && !w.over; t++) { bot.update(); w.tick(); }
  if (BREAK === 'rng') w.rng.next = Math.random;
  return { hash: hashGrid(w.g), snap: w.snapshot() };
}

function gateDeterminism() {
  const ticks = 1500;
  if (BREAK === 'rng') {
    // break it INSIDE the run, not after
    const mk = (seed) => {
      const w = new World({ seed });
      w.rng.next = Math.random;
      const bot = new Bot(w);
      for (let t = 0; t < ticks && !w.over; t++) { bot.update(); w.tick(); }
      return hashGrid(w.g);
    };
    if (mk(5) !== mk(5)) return fail('G3-determinism', 'same seed diverged');
    return;
  }
  const a = runSeeded(5, ticks), b = runSeeded(5, ticks);
  if (a.hash !== b.hash) fail('G3-determinism', `same seed diverged ${a.hash} vs ${b.hash}`);
  if (JSON.stringify(a.snap) !== JSON.stringify(b.snap)) fail('G3-determinism', 'snapshots diverged');
  const c = runSeeded(6, ticks);
  if (c.hash === a.hash) fail('G4-seeds', 'different seeds produced an identical board — is the seed wired up?');
}

/**
 * THE IDENTITY, which is a different claim from the ledger.
 *
 * `count === recount()` only says the ledger agrees with the grid. It says
 * nothing about whether every cell that appeared was CREATED and every cell
 * that vanished was DESTROYED — and shatter() overwrote non-empty cells without
 * counting one destruction, which happens every time a piece lands into gas.
 * The count check was green through all of it, because g.set keeps count right
 * on its own no matter who is or is not writing the stats.
 *
 * Measured as a DELTA across a window rather than from zero: a mode may paint a
 * starting scene through g.fill, which moves count without touching stats, and
 * that is not a fault — it is setup.
 */
function baseline(w) { return { n: w.g.count, c: w.stats.created, d: w.stats.destroyed }; }

function identity(w, b, label) {
  const got = w.g.count - b.n;
  const want = (w.stats.created - b.c) - (w.stats.destroyed - b.d);
  if (got !== want) {
    return `${label}: identity broken — the board gained ${got} cells but ` +
      `created-destroyed says ${want} (created ${w.stats.created - b.c}, destroyed ${w.stats.destroyed - b.d})`;
  }
  return null;
}

/**
 * G8 — A RUN HAS TO END, even for a player who is trying not to lose.
 *
 * Every difficulty number in this project came from the shipping bot, and the
 * bot is not trying to survive: it plays to score, tops itself out in about two
 * minutes, and its games ending was read for months as evidence that a game can
 * be lost. It is not. A browser playtest dumped 185 pieces against one wall
 * over eight minutes and never died, because a pile that never reaches the
 * spawn column cannot top out and a wall-to-wall clear rescues the board every
 * time it gets close.
 *
 * So this gate plays the strategy the bot never will: hug alternating walls,
 * never soft-drop, let every piece fall at its own rate — a pace a person can
 * actually keep up, which is the whole point. The first version of this probe
 * soft-dropped and stacked 63 pieces in twenty seconds; it died every time and
 * measured a strategy no human can execute.
 *
 * With `fallTime` at 0, this strategy survives a median of 646 SECONDS. The
 * bound below is what the time ramp buys, and `--break ramp` sets fallTime back
 * to 0 to prove the gate is measuring it.
 */
const SURVIVOR_CAP_S = 480;

function gateFinite() {
  const cfg = FLOW ? FLOW.worldCfg : {};
  const lens = [];
  for (let n = 0; n < 4; n++) {
    const w = new World({ seed: 4000 + n, ...cfg, ...(BREAK === 'ramp' ? { fallTime: 0 } : {}) });
    const api = modeApi(w);
    if (FLOW && FLOW.onStart) FLOW.onStart(w, api);
    const CAP = SIM_HZ * (SURVIVOR_CAP_S + 240);
    let t = 0, side = 0, last = null;
    for (; t < CAP && !w.over; t++) {
      if (w.piece !== last) { last = w.piece; side ^= 1; }
      const p = w.piece;
      // Hug a wall. No soft drop: the sand must be given time to settle, or
      // this measures stacking speed instead of survivability.
      if (p) { const target = side === 0 ? 0 : w.g.cols; if (p.x > target) w.moveBy(-8); else if (p.x < target) w.moveBy(8); }
      const before = w.chains;
      w.tick();
      if (w.chains > before && FLOW && FLOW.onChain) FLOW.onChain(w, api, w.clears.lastChain.slice());
      if (FLOW && FLOW.onTick) FLOW.onTick(w, api);
    }
    lens.push(t / SIM_HZ);
    if (!w.over) { fail('G8-finite', `a wall-hugging run survived the whole ${(CAP / SIM_HZ) | 0}s cap on seed ${4000 + n}`); return lens; }
  }
  const worst = Math.max(...lens);
  if (worst > SURVIVOR_CAP_S) {
    fail('G8-finite', `a player who only tries to survive lasts ${worst.toFixed(0)}s — over the ${SURVIVOR_CAP_S}s bound`);
  }
  return lens;
}

// --------------------------------------------------------------- G5 play
function gatePlay() {
  let totalChains = 0, totalScore = 0, stalls = 0, lengths = [];
  for (let n = 0; n < GAMES; n++) {
    const w = new World({ seed: 1000 + n, ...(FLOW ? FLOW.worldCfg : {}) });
    if (BREAK === 'clears') w.clears.detect = () => 0;
    const api = modeApi(w);
    if (FLOW && FLOW.onStart) FLOW.onStart(w, api);
    // AFTER onStart: the scene a mode paints is setup, not gameplay.
    const base = baseline(w);
    // The arm reproduces the shipped bug exactly — a stats object that cannot
    // count a destruction — rather than fabricating a number.
    if (BREAK === 'identity') Object.defineProperty(w.stats, 'destroyed', { get: () => 0, set() {} });
    const bot = new Bot(w);
    let t = 0;
    const CAP = SIM_HZ * 240;
    let lastCells = -1, sameFor = 0;
    for (; t < CAP && !w.over; t++) {
      const chainsBefore = w.chains;
      if (FLOW && FLOW.onTick) FLOW.onTick(w, api);
      bot.update();
      w.tick();
      if (w.chains > chainsBefore && FLOW && FLOW.onChain) FLOW.onChain(w, api, w.clears.lastChain.slice());
      if (!Number.isFinite(w.score)) { fail('G5-play', `score went non-finite at tick ${t} (game ${n})`); break; }
      if (w.g.count === lastCells) sameFor++; else { sameFor = 0; lastCells = w.g.count; }
      if (sameFor > SIM_HZ * 12) { stalls++; break; }
    }
    const err = check(w, `G5 game ${n}`) || identity(w, base, `G5 game ${n}`);
    if (err) fail('G5-play', err);
    totalChains += w.chains; totalScore += w.score; lengths.push(t);
  }
  if (stalls) fail('G5-play', `${stalls}/${GAMES} games stalled (board unchanged for 12s)`);
  if (totalChains === 0) fail('G6-chains', 'no chain cleared in any game — detection is dead');
  const avg = Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length);
  return { totalChains, totalScore, avg };
}

// --------------------------------------------------------------- G7 perf
function gatePerf() {
  const w = new World({ seed: 3 });
  const bot = new Bot(w);
  for (let t = 0; t < 900; t++) { bot.update(); w.tick(); }   // build a real board
  const t0 = process.hrtime.bigint();
  const N = 600;
  for (let t = 0; t < N; t++) { bot.update(); w.tick(); }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / N;
  if (ms > 4) fail('G7-perf', `${ms.toFixed(3)} ms/tick exceeds the 4 ms budget`);
  return ms;
}

// --------------------------------------------------------------------- run
if (BREAK === 'ledger') {
  const orig = Grid.prototype.set;
  Grid.prototype.set = function (i, m, tint = 0) {
    this.mat[i] = m; this.tint[i] = tint; this.flags[i] = 0;
    this.life[i] = 0; this.blob[i] = 0; this.clearT[i] = 0;
    this.touchIdx(i);     // deliberately forgets to maintain `count`
  };
  void orig;
}

console.log(BREAK ? `SILT sim gates  [FALSIFY: ${BREAK}]` : 'SILT sim gates');
gateMass();
gateLedger();
gateDeterminism();
const play = gatePlay();
const finite = gateFinite();
const perf = gatePerf();

if (play) console.log(`  play      ${GAMES} games, avg ${(play.avg / SIM_HZ).toFixed(1)}s, ${play.totalChains} chains, ${play.totalScore} pts`);
if (finite) {
  console.log(`  finite    a survivor lasts ${Math.min(...finite).toFixed(0)}-${Math.max(...finite).toFixed(0)}s ` +
    `against a ${SURVIVOR_CAP_S}s bound`);
}
if (perf) console.log(`  perf      ${perf.toFixed(3)} ms/tick`);

if (failures.length) {
  console.log('\nFAIL');
  for (const f of failures) console.log('  x ' + f);
  process.exit(BREAK ? 0 : 1);
} else {
  console.log('\nPASS  all gates green');
  if (BREAK) { console.log(`  !! falsify arm "${BREAK}" did NOT trip a gate — the gate is not testing what it claims`); process.exit(1); }
}
