#!/usr/bin/env node
// The mode oracle. Node imports the SHIPPING mode modules — js/modes/**,
// js/data/** — and plays them with the shipping bot. Same house rules as
// tools/sim.mjs: structural invariants after every action, and a --break arm
// that proves each gate can actually go red.
//
//   node tools/modesim.mjs                     every mode, every gate
//   node tools/modesim.mjs --mode tide         one mode
//   node tools/modesim.mjs --games 8           more runs per mode
//   node tools/modesim.mjs --levels            validate every shipped level
//   node tools/modesim.mjs --gen-levels 120    regenerate + validate + write levels.js
//   node tools/modesim.mjs --break <gate>      falsification arm: that gate MUST go red
//
// break gates: ledger  score  stall  rng  tide  zen  slots  trivial  unwinnable  span

import { World, SIM_HZ, DEFAULT_CFG } from '../js/sim/world.js';
import { Grid, F_CLEARING } from '../js/sim/grid.js';
import { DISSOLVE_TICKS } from '../js/sim/clears.js';
import { makeRng } from '../js/core/rng.js';
import { Bot } from '../js/ai/bot.js';
import { EMPTY, MAT_COUNT, CRYSTAL, TINTABLE, SAND, WATER } from '../js/sim/materials.js';
import { Clears } from '../js/sim/clears.js';
import { MODES, byId, configFor } from '../js/modes/index.js';
import tide, { floodGrid, tideTint, tintZeroIsInert, TIDE_CFG } from '../js/modes/tide.js';
import { safeApi } from '../js/modes/api.js';
import alchemy, { setLevels, starsFor } from '../js/modes/alchemy.js';
import jelly from '../js/modes/jelly.js';
import zen from '../js/modes/zen.js';
import { genLevels, sceneSpans, applyScene, makeTracker } from '../js/data/levelgen.js';
import { LEVELS as SHIPPED } from '../js/data/levels.js';
import { BIOMES, MAX_TINTS, BRINE_FIRST, BRINE_COUNT } from '../js/data/biomes.js';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const has = (k) => args.includes(k);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const GAMES = +opt('--games', 5);
const BREAK = opt('--break', null);
const ONLY = opt('--mode', null);
const GEN = has('--gen-levels') ? +(opt('--gen-levels', 120) || 120) : 0;
const ALL_LEVELS = has('--levels');

const failures = [];
const fail = (gate, msg) => { failures.push(`${gate}: ${msg}`); };
const notes = [];

// Length bands each endless mode is expected to sit inside, in seconds. These
// are the balance targets, asserted rather than eyeballed.
const BANDS = {
  flow: [85, 165], tide: [80, 150], jelly: [45, 130], hourglass: [90, 210],
};

// --------------------------------------------------------------- invariants

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

function hashGrid(g) {
  let h = 2166136261 >>> 0;
  const m = g.mat, t = g.tint;
  for (let i = 0; i < m.length; i++) {
    h ^= m[i]; h = Math.imul(h, 16777619) >>> 0;
    h ^= t[i]; h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// ------------------------------------------------------------------ runner

/**
 * One headless run of one mode. This is the reference host loop:
 *   bot -> world.tick() -> onChain (if a chain fired) -> onTick
 */
async function playMode(mode, o = {}) {
  const seed = o.seed ?? 1;
  const capS = o.capS ?? 240;
  const cfg = { ...configFor(mode.id, o.opts || {}), ...(o.cfg || {}), seed };
  const world = new World(cfg);
  // The determinism gate has to see a nondeterministic SIM, not just a
  // nondeterministic mode api — most modes never draw from the api rng, so
  // breaking that alone leaves the gate green and proves nothing.
  if (BREAK === 'rng') world.rng.next = Math.random;
  const rng = o.rng || makeRng((Math.imul(seed, 2654435761) ^ 0x5eed) >>> 0);
  const api = safeApi({
    rng,
    biome: (n) => { r.biomes.add(n); },
    shake: () => {},
    banner: (t) => { if (t) r.banners.push(t); },
  });
  const r = {
    world, seed, ticks: 0, s: 0, chains: 0, score: 0, awarded: 0, awards: [],
    sizes: [], stalled: false, err: null, fill: 0, banners: [], biomes: new Set(),
    over: false, won: false,
  };

  if (mode.onStart) mode.onStart(world, api);
  if (mode.whenReady) await mode.whenReady(world);

  const err0 = check(world, `${mode.id} t0`);
  if (err0) { r.err = err0; return r; }

  const bot = new Bot(world);
  const CAP = SIM_HZ * capS;
  let last = -1, same = 0;
  let t = 0;
  for (; t < CAP && !world.over; t++) {
    if (BREAK === 'stall' && t > 600) { same++; if (same > SIM_HZ * 12) { r.stalled = true; break; } continue; }
    bot.update();
    const before = world.chains;
    world.tick();
    if (world.chains > before && mode.onChain) {
      r.sizes.push(world.lastChainSize);
      const pts = mode.onChain(world, api, world.clears.lastChain);
      if (typeof pts === 'number') { r.awarded += pts; r.awards.push(pts); }
    }
    if (mode.onTick) mode.onTick(world, api);
    if (BREAK === 'score' && t === 900) world.score += 5000;   // a leaked engine award
    if (o.sample && (t % 12) === 0) o.sample(world);
    if ((t & 63) === 0) {
      const e = check(world, `${mode.id} seed ${seed} t${t}`);
      if (e) { r.err = e; break; }
    }
    if (world.g.count === last) same++; else { same = 0; last = world.g.count; }
    if (same > SIM_HZ * 12) { r.stalled = true; break; }
  }
  if (!r.err) r.err = check(world, `${mode.id} seed ${seed} final`);
  r.ticks = t; r.s = t / SIM_HZ;
  r.chains = world.chains; r.score = world.score;
  r.fill = world.g.count / world.g.n;
  r.over = world.over; r.won = !!world.won;
  r.hash = hashGrid(world.g);
  return r;
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const med = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

// ------------------------------------------------------------ M gates: play

async function gateModes() {
  const rows = [];
  for (const mode of MODES) {
    if (ONLY && mode.id !== ONLY) continue;
    const runs = [];
    const capS = mode.id === 'zen' ? 120 : 240;
    for (let i = 0; i < GAMES; i++) {
      const opts = mode.id === 'alchemy' ? { level: 1 + ((i * 17) % SHIPPED.length) } : {};
      runs.push(await playMode(mode, { seed: 400 + i * 137, capS, opts }));
    }
    for (const r of runs) {
      if (r.err) fail('M1-ledger', r.err);
      if (r.stalled) fail('M3-stall', `${mode.id} seed ${r.seed} board unchanged for 12s at t=${r.s.toFixed(0)}s`);
      // S1: every point on the board must have come through the mode scorer.
      // If the engine's own award leaked through, these disagree.
      if (mode.id !== 'zen' && r.awards.length && r.score !== r.awarded) {
        fail('S1-score', `${mode.id} seed ${r.seed} world.score=${r.score} but mode awarded ${r.awarded}`);
      }
      if (mode.id === 'zen' && r.score !== 0) fail('Z1-zen', `zen scored ${r.score}`);
    }
    const chains = runs.reduce((a, r) => a + r.chains, 0);
    if (mode.id !== 'zen' && chains === 0) fail('M4-chains', `${mode.id}: not one chain in ${GAMES} games`);

    const lens = runs.map((r) => r.s);
    const band = BANDS[mode.id];
    if (band) {
      const m = mean(lens);
      if (m < band[0] || m > band[1]) fail('M5-band', `${mode.id} mean run ${m.toFixed(1)}s outside target ${band[0]}-${band[1]}s`);
    }
    rows.push({ mode, runs, lens, chains });
  }
  return rows;
}

// --------------------------------------------------- M2 determinism per mode

async function gateDeterminism() {
  for (const mode of MODES) {
    if (ONLY && mode.id !== ONLY) continue;
    const mk = () => playMode(mode, {
      seed: 77, capS: 45,
      opts: mode.id === 'alchemy' ? { level: 9 } : {},
    });
    const a = await mk(), b = await mk();
    if (a.hash !== b.hash) fail('M2-determinism', `${mode.id} same seed diverged ${a.hash} vs ${b.hash}`);
    if (a.score !== b.score || a.chains !== b.chains) fail('M2-determinism', `${mode.id} score/chains diverged`);
  }
}

// ------------------------------------------------------------- H1 hourglass

async function gateHourglass() {
  const mode = byId('hourglass');
  const world = new World({ ...configFor('hourglass'), seed: 21 });
  const api = safeApi({ rng: makeRng(21) });
  mode.onStart(world, api);
  const bot = new Bot(world);
  let flips = 0, massErr = null;
  let prevFlips = 0, pre = 0, armed = false;
  for (let t = 0; t < SIM_HZ * 150 && !world.over; t++) {
    bot.update();
    const before = world.chains;
    if (world.hourglass && world.hourglass.until <= 1 / SIM_HZ && !armed && world.clears.dissolving.length === 0) {
      pre = world.g.count; armed = true;
    }
    world.tick();
    if (world.chains > before) mode.onChain(world, api, world.clears.lastChain);
    mode.onTick(world, api);
    if (world.hourglass && world.hourglass.flips > prevFlips) {
      prevFlips = world.hourglass.flips; flips++;
      // The rotation is a permutation, so mass may only fall by whatever was
      // mid-dissolve when it fired — never rise.
      if (armed && world.g.count > pre) massErr = `flip ${flips} created mass ${pre} -> ${world.g.count}`;
      armed = false;
    }
  }
  if (flips < 2) fail('H1-hourglass', `only ${flips} flips in 150s (expected >= 4)`);
  if (massErr) fail('H1-hourglass', massErr);
  if (world.over && flips === 0) fail('H1-hourglass', 'died before the first flip');
  return flips;
}

// -------------------------------------------------------------------- ZEN

async function gateZen() {
  const world = new World({ ...configFor('zen'), seed: 12 });
  const api = safeApi({ rng: makeRng(12) });
  zen.onStart(world, api);
  const bot = new Bot(world);
  let everOver = false;
  for (let t = 0; t < SIM_HZ * 120; t++) {
    bot.update();
    const before = world.chains;
    world.tick();
    if (world.chains > before) zen.onChain(world, api, world.clears.lastChain);
    zen.onTick(world, api);
    if (world.over) everOver = true;
    if (world.score !== 0) { fail('Z1-zen', `score became ${world.score}`); break; }
  }
  if (everOver) fail('Z1-zen', 'zen reported game over');

  // Z2: the attract scene must not dissolve itself. seedScene lays a full-width
  // pool, and a full-width band of one tint is a chain by definition.
  const w2 = new World({ ...configFor('zen'), seed: 5 });
  zen.seedScene(w2, makeRng(5));
  if (BREAK === 'zen') w2.g.fill(0, 40, w2.g.cols, 3, 2, 1);   // a spanning tinted band
  const self = w2.clears.detect();
  if (self > 0) fail('Z2-zen-scene', `seedScene self-clears ${self} cells on frame one`);
  // The paint tool must actually paint, and must keep the ledger honest.
  const before = world.g.count;
  const n = zen.paint(world, 20, 20, { mat: CRYSTAL, tint: 0, radius: 6 });
  const e = check(world, 'zen paint');
  if (e) fail('Z1-zen', e);
  if (n <= 0) fail('Z1-zen', 'paint painted nothing');
  void before;
  return { vented: world.zen ? world.zen.vented : 0 };
}

// ------------------------------------------------------------------- TIDE
//
// Two halves of one rule, and both have to hold:
//   T1  the tide rising on its own never completes a chain
//   T2  a tinted water run still finishes a chain of matching sand (D4)

function gateTide() {
  const seed = 0x71de5a1e;

  // T1: flood a bare grid to the ceiling with nothing else on it, exactly as
  // the mode floods, and ask the shipping detector whether that is a chain.
  const g = new Grid(112, 96);
  floodGrid(g, 96, seed, BREAK === 'tide');
  const c = new Clears(g, { diagonal: true });
  let chains = 0, guard = 0;
  while (guard++ < 40) { const n = c.detect(); if (!n) break; chains++; for (const i of c.lastChain) g.clear(i); c.dissolving.length = 0; }
  if (chains > 0) fail('T1-tide-inert', `the bare tide self-cleared ${chains} time(s) — it is not inert`);

  // T2: a run of tint-1 sand that stops short of the right wall, bridged the
  // rest of the way by tint-1 water. This must clear.
  const g2 = new Grid(112, 96);
  g2.fill(0, 60, 90, 3, SAND, 1);
  g2.fill(90, 60, 22, 3, WATER, 1);
  const c2 = new Clears(g2, { diagonal: true });
  const n2 = c2.detect();
  if (n2 === 0) fail('T2-tide-bridge', 'tinted water no longer completes a chain of matching sand (D4 is broken)');

  // T2b: control — the same board with the water in a colour the sand does not
  // share must NOT clear. Without this, T2 would pass on a detector that clears
  // everything.
  const g3 = new Grid(112, 96);
  g3.fill(0, 60, 90, 3, SAND, 1);
  g3.fill(90, 60, 22, 3, WATER, 2);
  if (new Clears(g3, { diagonal: true }).detect() !== 0) fail('T2-tide-bridge', 'control board cleared: the detector is not colour-sensitive');

  return { inertZero: tintZeroIsInert(), bridged: n2 };
}

// ------------------------------------------------------------ biome data

/**
 * The renderer keeps its own palette (js/gfx/biomes.js, lane A) and it is the
 * one that has to have a colour for every tint index the sim can produce. TIDE
 * floods with brine indices above the piece range, and the first version ran to
 * index 8 against a renderer with 8 slots (0..7) — an off-the-end tint that no
 * mode gate would ever have noticed. Cross-lane, so it is checked here.
 */
async function gateTintSlots() {
  let gfx = null;
  try { gfx = await import('../js/gfx/biomes.js'); } catch { notes.push('js/gfx/biomes.js absent — tint slot check skipped'); return null; }
  const slots = BREAK === 'slots' ? 4 : (gfx.TINT_SLOTS || 0);
  if (!slots) { notes.push('renderer palette exports no TINT_SLOTS — cannot check'); return null; }
  const highest = BRINE_FIRST + BRINE_COUNT - 1;
  if (highest >= slots) fail('B2-tint-slots', `TIDE can emit tint ${highest} but the renderer has ${slots} slots (0..${slots - 1})`);
  if (MAX_TINTS >= slots) fail('B2-tint-slots', `MAX_TINTS ${MAX_TINTS} does not fit ${slots} renderer slots`);
  for (const [id, b] of Object.entries(gfx.BIOMES || {}))
    if ((b.tints || []).length < slots) fail('B2-tint-slots', `renderer biome ${id} defines ${b.tints.length} of ${slots} tints`);
  return slots;
}

function gateBiomes() {
  const need = ['dune', 'abyss', 'kiln'];
  for (const id of need) if (!BIOMES[id]) fail('B1-biomes', `missing required biome ${id}`);
  for (const [id, b] of Object.entries(BIOMES)) {
    if (!b.tints || b.tints.length < 4) fail('B1-biomes', `${id}: needs tint colours for 0..3`);
    if (!b.light || !b.bg || !b.mats) fail('B1-biomes', `${id}: missing bg/light/mats`);
    for (const k of ['wall', 'sand', 'water', 'jelly', 'oil', 'lava', 'ice', 'ash', 'crystal', 'fire', 'steam'])
      if (!b.mats[k]) fail('B1-biomes', `${id}: no colour for ${k}`);
  }
  for (const m of MODES) if (m.biome && !BIOMES[m.biome]) fail('B1-biomes', `mode ${m.id} wants missing biome ${m.biome}`);
}

// ---------------------------------------------------------- ALCHEMY levels

/** Run one level through the real ALCHEMY module. */
async function playLevel(lv, seed, capS) {
  const r = await playMode(alchemy, { seed, capS: capS ?? lv.limitS + 5, opts: { level: lv.id } });
  const a = r.world.alchemy || {};
  return { ...r, won: !!a.won, at: r.s, value: a.value, target: a.target };
}

/**
 * A level is only shippable if the bot finishes it, and only interesting if it
 * cannot finish it immediately. Both halves matter: gate A1 catches levels
 * nobody can beat, gate A2 catches levels that beat themselves.
 */
async function validateLevel(lv, tries = 3) {
  const out = { lv, wins: 0, times: [], trivial: false, selfClearing: false };

  if (sceneSpans(lv)) { out.selfClearing = true; return out; }

  // frame-one check: the scene must not already be a chain, and the objective
  // must not already be satisfied.
  const probe = new World({ ...configFor('alchemy', { level: lv.id }), seed: 1 });
  applyScene(probe, lv);
  if (probe.clears.detect() > 0) { out.selfClearing = true; return out; }
  const tr = makeTracker(probe, lv);
  if (tr.update(probe)) { out.trivial = true; return out; }

  for (let k = 0; k < tries; k++) {
    const r = await playLevel(lv, 900 + k * 313);
    if (r.err) { out.err = r.err; break; }
    if (r.won) { out.wins++; out.times.push(r.at); }
  }
  if (out.times.length && Math.min(...out.times) < 6) out.trivial = true;
  return out;
}

// Objective floors. Below these a level is not worth shipping whatever the bot
// managed — "clear one chain" is not a puzzle.
const FLOOR = { chains: 2, dissolve: 900, crystal: 32, purge: 260 };

/**
 * Calibrate the objective against what the bot can actually reach.
 *
 * Hand-picked targets were wrong in both directions at once — quench levels
 * asked for 444 crystal when a sealed lava pool tops out at 65, and span levels
 * asked for 2 chains on a 56-wide board and were over in 3 seconds. So the
 * generator no longer guesses: it runs the level once with an unreachable
 * target, watches how far the bot gets, and sets the objective to a fraction of
 * that. Targets are therefore measured, and the star times below are measured
 * against the measured target.
 */
async function calibrate(lv, frac) {
  const saved = lv.objective.target;
  lv.objective.target = lv.objective.type === 'purge' ? -1 : 1e9;
  let best = 0, low = Infinity, base = 0;
  const r = await playMode(alchemy, {
    seed: 777, capS: lv.limitS + 2, opts: { level: lv.id },
    sample: (w) => {
      const a = w.alchemy; if (!a) return;
      base = a.base;
      if (lv.objective.type === 'purge') low = Math.min(low, a.value);
      else best = Math.max(best, a.value);
    },
  });
  lv.objective.target = saved;
  if (r.err) return { err: r.err };
  if (lv.objective.type === 'purge') {
    if (!isFinite(low)) return { reach: 0 };
    const progress = Math.max(0, base - low);
    return { reach: progress, target: Math.round(base - progress * frac), base };
  }
  return { reach: best, target: Math.round(best * frac) };
}

function starsFrom(times, limitS) {
  const s = [...times].sort((a, b) => a - b);
  const fast = s[0], mid = s[(s.length / 2) | 0];
  const two = Math.min(limitS, +(mid * 1.15).toFixed(1));
  const three = Math.min(two - 0.5, +(fast * 1.05).toFixed(1));
  return [limitS, two, Math.max(1, three)];
}

async function generateLevels(count) {
  const cands = genLevels(count, 0x5117);
  if (BREAK === 'trivial') cands[3].objective = { type: 'chains', target: 0 };
  if (BREAK === 'unwinnable') cands[4].objective = { type: 'chains', target: 100000 };
  if (BREAK === 'span') {
    const c = cands[7];
    c.scene.push({ x: 0, y: c.rows - 12, w: c.cols, h: 4, mat: 2, tint: 1 });
  }
  setLevels(cands);

  const kept = [], rejected = [];
  for (const lv of cands) {
    if (!sceneSpans(lv)) {
      const cal = await calibrate(lv, 0.6);
      if (cal.err) { rejected.push([lv.id, lv.arch, 'invariant: ' + cal.err]); continue; }
      if (BREAK !== 'trivial' && BREAK !== 'unwinnable') {
        if (cal.reach < FLOOR[lv.objective.type]) {
          rejected.push([lv.id, lv.arch, `unreachable: bot only reached ${Math.round(cal.reach)} of a ${FLOOR[lv.objective.type]} floor`]);
          continue;
        }
        lv.objective.target = cal.target;
        lv.reach = Math.round(cal.reach);
      }
    }
    const v = await validateLevel(lv, 3);
    if (v.selfClearing) { rejected.push([lv.id, lv.arch, 'self-clearing scene']); continue; }
    if (v.trivial) { rejected.push([lv.id, lv.arch, 'trivially complete']); continue; }
    if (v.err) { rejected.push([lv.id, lv.arch, 'invariant: ' + v.err]); continue; }
    if (v.wins < 2) { rejected.push([lv.id, lv.arch, `only ${v.wins}/3 wins`]); continue; }
    lv.stars = starsFrom(v.times, lv.limitS);
    lv.measured = { wins: v.wins, med: +med(v.times).toFixed(1), fast: +Math.min(...v.times).toFixed(1) };
    kept.push(lv);
  }
  return { kept, rejected, cands };
}

function writeLevels(kept) {
  const renum = kept.map((lv, i) => ({ ...lv, id: i + 1 }));
  const body = renum.map((lv) => '  ' + JSON.stringify(lv)).join(',\n');
  const out = `// GENERATED by tools/modesim.mjs --gen-levels. Do not hand-edit.
//
// Every level here was played to completion by js/ai/bot.js at least twice out
// of three seeds, was proved not to complete itself on frame one, and had its
// star times measured rather than guessed. \`measured\` records what the bot did:
// wins out of three, median and fastest completion in seconds.
export const LEVELS = [
${body}
];
export default LEVELS;
`;
  writeFileSync(join(HERE, '../js/data/levels.js'), out);
  return renum.length;
}

// ------------------------------------------------------------------- report

function fmtRuns(rows) {
  for (const { mode, runs, lens, chains } of rows) {
    const scores = runs.map((r) => r.score);
    const sizes = runs.flatMap((r) => r.sizes);
    const won = runs.filter((r) => r.won).length;
    console.log(
      `  ${mode.id.padEnd(10)}` +
      ` len ${mean(lens).toFixed(0)}s (${Math.min(...lens).toFixed(0)}-${Math.max(...lens).toFixed(0)})` +
      `  chains ${(chains / runs.length).toFixed(1)}/game` +
      `  score ${Math.round(mean(scores))} (${Math.min(...scores)}-${Math.max(...scores)}, med ${med(scores)})` +
      `  fill ${(mean(runs.map((r) => r.fill)) * 100).toFixed(0)}%` +
      `  chainSize ${sizes.length ? Math.round(mean(sizes)) : 0}` +
      `  stalls ${runs.filter((r) => r.stalled).length}` +
      (mode.id === 'alchemy' ? `  won ${won}/${runs.length}` : ''),
    );
  }
}

// ---------------------------------------------------------------------- run

if (BREAK === 'ledger') {
  Grid.prototype.set = function (i, m, tint = 0) {
    this.mat[i] = m; this.tint[i] = tint; this.flags[i] = 0;
    this.life[i] = 0; this.blob[i] = 0; this.clearT[i] = 0;
    this.touchIdx(i);     // deliberately forgets `count`
  };
}

console.log(BREAK ? `SILT mode gates  [FALSIFY: ${BREAK}]` : 'SILT mode gates');

if (GEN) {
  const t0 = Date.now();
  const { kept, rejected } = await generateLevels(GEN);
  console.log(`\nALCHEMY generation: ${GEN} candidates -> ${kept.length} kept, ${rejected.length} rejected  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  const why = {};
  for (const [, , r] of rejected) why[r.split(':')[0]] = (why[r.split(':')[0]] || 0) + 1;
  for (const [k, v] of Object.entries(why)) console.log(`    rejected ${v}  ${k}`);
  const byArch = {};
  for (const lv of kept) (byArch[lv.arch] = byArch[lv.arch] || []).push(lv);
  for (const [a, ls] of Object.entries(byArch)) {
    console.log(`    ${a.padEnd(9)} ${String(ls.length).padStart(3)} levels  median win ${med(ls.map((l) => l.measured.med)).toFixed(1)}s  3-star ${med(ls.map((l) => l.stars[2])).toFixed(1)}s`);
  }
  if (GEN >= 60 && kept.length < 60) fail('A1-levels', `only ${kept.length} levels survived validation, need 60`);
  // Falsification arms. Each injects one deliberately bad level; the arm is
  // confirmed only when validation throws that exact level out. Reporting the
  // catch through fail() keeps the same convention as tools/sim.mjs: under
  // --break the run is SUPPOSED to go red, and a green run means the gate is
  // blind to the fault it claims to guard.
  const caught = (id) => rejected.some(([r]) => r === id);
  if (BREAK === 'trivial') {
    if (caught(4)) fail('A2-trivial', 'injected zero-target level 4 was rejected as trivially complete — arm confirmed');
    else notes.push('!! level 4 was injected with target 0 and validation kept it');
  }
  if (BREAK === 'unwinnable') {
    if (caught(5)) fail('A1-levels', 'injected impossible level 5 was rejected as unbeatable — arm confirmed');
    else notes.push('!! level 5 was injected with target 100000 and validation kept it');
  }
  if (BREAK === 'span') {
    if (caught(8)) fail('A2-trivial', 'injected wall-to-wall tinted band in level 8 was rejected as a self-clearing scene — arm confirmed');
    else notes.push('!! level 8 was injected with a spanning tinted band and validation kept it');
  }
  if (!BREAK && kept.length >= 60) console.log(`    wrote js/data/levels.js with ${writeLevels(kept)} levels`);
} else {
  gateBiomes();
  const slots = await gateTintSlots();
  const tideProbe = gateTide();
  const rows = await gateModes();
  await gateDeterminism();
  const flips = await gateHourglass();
  const z = await gateZen();

  // Shipped levels: a sample by default, all of them under --levels.
  const pick = ALL_LEVELS ? SHIPPED : SHIPPED.filter((_, i) => i % Math.ceil(SHIPPED.length / 10) === 0);
  let lvWins = 0, lvChecked = 0, lvBad = [];
  for (const lv of pick) {
    const v = await validateLevel(lv, ALL_LEVELS ? 2 : 1);
    lvChecked++;
    if (v.selfClearing || v.trivial) { fail('A2-trivial', `level ${lv.id} (${lv.arch}) completes itself`); lvBad.push(lv.id); }
    else if (v.wins < 1) { fail('A1-levels', `level ${lv.id} (${lv.arch}) unbeatable by the bot`); lvBad.push(lv.id); }
    else lvWins++;
  }

  console.log('');
  fmtRuns(rows);
  console.log(`\n  tide: bare tide self-clears 0x; tinted water bridges a sand run (${tideProbe.bridged} cells). engine treats tint 0 as inert: ${tideProbe.inertZero}. highest tint emitted ${BRINE_FIRST + BRINE_COUNT - 1} of ${slots} renderer slots`);
  console.log(`  hourglass flips in 150s: ${flips}`);
  console.log(`  zen: no fail state over 120s, vented ${z.vented}x`);
  console.log(`  levels: ${lvWins}/${lvChecked} sampled levels beaten by the bot${lvBad.length ? ' (bad: ' + lvBad.join(',') + ')' : ''}  [${SHIPPED.length} shipped]`);
  console.log(`  jelly soft-body solver: ${jelly.isSoft ? 'probed' : '?'} — blobs.js ${await import('../js/sim/blobs.js').then(() => 'present').catch(() => 'ABSENT, running rigid fallback')}`);
}

for (const n of notes) console.log('  . ' + n);

if (failures.length) {
  console.log('\nFAIL');
  for (const f of failures) console.log('  x ' + f);
  process.exit(BREAK ? 0 : 1);
} else {
  console.log('\nPASS  all mode gates green');
  if (BREAK) { console.log(`  !! falsify arm "${BREAK}" did NOT trip a gate — the gate is not testing what it claims`); process.exit(1); }
}
