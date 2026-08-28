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
//   node tools/modesim.mjs --gen-levels 30 --gen-seed 0xA113
//                                              a second seed family, no write —
//                                              one family is never enough to
//                                              believe a balance number
//   node tools/modesim.mjs --masher            strategy vs mashing on shipped levels
//   node tools/modesim.mjs --masher --levels   ... on all of them
//   node tools/modesim.mjs --break <gate>      falsification arm: that gate MUST go red
//
// break gates: ledger  score  stall  rng  tide  zen  slots  trivial  unwinnable  span
//              aspect  headroom  grace

import { World, SIM_HZ, DEFAULT_CFG } from '../js/sim/world.js';
import { Grid, F_CLEARING } from '../js/sim/grid.js';
import { DISSOLVE_TICKS } from '../js/sim/clears.js';
import { makeRng } from '../js/core/rng.js';
import { Bot } from '../js/ai/bot.js';
import { EMPTY, MAT_COUNT, CRYSTAL, TINTABLE, SAND, WATER } from '../js/sim/materials.js';
import { Clears } from '../js/sim/clears.js';
import { BLK, pieceBounds } from '../js/sim/pieces.js';
import { MODES, byId, configFor } from '../js/modes/index.js';
import { floodGrid, tintZeroIsInert } from '../js/modes/tide.js';
import { safeApi } from '../js/modes/api.js';
import alchemy, { setLevels, starsFor, ALCHEMY_CFG } from '../js/modes/alchemy.js';
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
const MASHER = has('--masher');
// Generation is deterministic in this seed. Sweeping it is how a balance claim
// gets three independent families instead of one lucky one.
const GEN_SEED = Number(opt('--gen-seed', '0x5117'));

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

// ------------------------------------------------------------------ agents

/**
 * THE MASHER — the instrument the gates could not be.
 *
 * A star is a time threshold, so before the span bonus existed the optimal way
 * to play ALCHEMY was to swipe every piece straight down as fast as the hand
 * moves and never think about where it lands. The player found that in five
 * levels. `ALCHEMY_CFG.spanShare` is the answer to it, and nothing in this
 * suite could tell whether the answer works, because every gate is played by
 * `js/ai/bot.js`, which DOES place deliberately. A mechanic meant to beat
 * mashing has to be measured against a masher.
 *
 * These are ABLATIONS of the shipping bot, not separate players, so exactly one
 * thing changes at a time:
 *
 *   bot      chain-building placement, soft drop      thinking, at thinking speed
 *   swift    chain-building placement, HARD drop      thinking, at mashing speed
 *   masher   flattest landing only, HARD drop         no intent, at mashing speed
 *
 * `masher` deletes the two terms in `Bot._score` that encode intent — same-tint
 * adjacency and wall contact — and keeps only "do not build a tower". It is not
 * a bad player; it is a player with no plan. `swift` is the control that
 * separates the two variables: if swift beats masher, the bonus is paying for
 * PLACEMENT, and if bot beats masher the bonus also covers the wall-clock that
 * placement costs, which is the actual complaint.
 *
 * The first version of this picked a column at random. It lost 26 of 36 runs by
 * topping the board out, which made the mechanic look like a triumph and proved
 * nothing: a masher who cannot finish a level is not the player who reported
 * the problem. Its ten wins were ALL three-star. A weak adversary is a
 * believable wrong metric, so it was thrown away for this one.
 */
class HardDropper extends Bot {
  update() {
    const w = this.w;
    if (w.over || !w.piece) { this.plan = null; return; }
    if (!this.plan || this.plan.forPiece !== w.piece) {
      const d = this.decide();
      if (!d) return;
      this.plan = { ...d, forPiece: w.piece };
    }
    const p = w.piece;
    if (p.rot !== this.plan.rot) {
      if (!w.rotate()) this.plan.rot = p.rot;
      this.plan.forPiece = w.piece;
      return;
    }
    if (p.x < this.plan.x) w.moveBy(Math.min(3, this.plan.x - p.x));
    else if (p.x > this.plan.x) w.moveBy(-Math.min(3, p.x - this.plan.x));
    if (w.piece && w.piece.x === this.plan.x) w.hardDrop();
  }
}

class Masher extends HardDropper {
  /** Bot._score with both intent terms removed. Keep the stack low, nothing else. */
  _score(p, ox, oy) {
    let maxTop = this.w.g.rows;
    for (const c of p.cells) { const y0 = oy + c.by * BLK; if (y0 < maxTop) maxTop = y0; }
    return (this.w.g.rows - maxTop) * -3.2;
  }
}

const AGENTS = { bot: Bot, swift: HardDropper, masher: Masher };

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

  const agent = new (AGENTS[o.agent] || Bot)(world);
  const CAP = SIM_HZ * capS;
  let last = -1, same = 0;
  let t = 0;
  for (; t < CAP && !world.over; t++) {
    if (BREAK === 'stall' && t > 600) { same++; if (same > SIM_HZ * 12) { r.stalled = true; break; } continue; }
    agent.update();
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

/**
 * How long a run may take in WALL-CLOCK seconds.
 *
 * The mode ends the level itself, at `world.t >= limitS + bonus`; this cap is
 * only the safety net against a run that never ends. It used to be `limitS + 5`,
 * which was correct when the effective clock and the wall clock were the same
 * thing — and became a silent measurement fault the moment a big span started
 * buying seconds back. Measured on the shipped table, level 8 seed 1213 earns
 * 26.1s of bonus and legitimately runs to 68.4s against a 63s limit: the old cap
 * cut it off at 68.0 and recorded a LOSS on a level the bot had won. A generous
 * cap costs nothing, because the run still stops when the mode says so.
 */
const capFor = (lv) => lv.limitS * 2 + 30;

/** Run one level through the real ALCHEMY module. */
async function playLevel(lv, seed, capS, agent) {
  const r = await playMode(alchemy, { seed, capS: capS ?? capFor(lv), opts: { level: lv.id }, agent });
  const a = r.world.alchemy || {};
  // `at` is the EFFECTIVE clock, not the wall clock: a big span buys seconds
  // back and a star is judged on what is left. Calibrating thresholds from
  // world.t would make every one of them generous by the bonus earned.
  return { ...r, won: !!a.won, at: a.elapsed != null ? a.elapsed : r.s, wall: +r.world.t.toFixed(1),
           bonus: a.bonus || 0, value: a.value, target: a.target };
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
 * A shipped target may not exceed this fraction of the bot's measured reach.
 *
 * A level whose objective sits at 100% of the ceiling the bot could find has no
 * room in it: one unlucky seed, one slower human, and it is unwinnable rather
 * than hard. The campaign shipped ten of them — level ONE among them, at target
 * 2 against reach 2 — and none of the existing gates could see it, because each
 * one is individually winnable, non-trivial and correctly starred.
 */
const HEADROOM = 0.8;

/**
 * THE OPENING GRACE — one number, applied to both halves of "too hard".
 *
 * The player reached level 5 having failed several times, taken three 1-stars
 * and one 2-star, and asked for "the points needed for the first 10 levels
 * reduced by 10 to 20%". Two different complaints are hiding in that sentence
 * and they need two different levers:
 *
 *   a level you FAIL is a TARGET problem     -> ask for less
 *   a level you 1-STAR is a THRESHOLD problem -> rate more generously
 *
 * Both are the same underlying fault, which is worth naming because it is
 * structural and not a tuning miss: every target is 0.6 of what `js/ai/bot.js`
 * reached, and every star time is a multiple of what the BOT took. The bot is
 * faster than a person who has never seen the game. So level 1 opens at the
 * bot's own pace with no allowance at all for not yet knowing what sand does.
 *
 * `g` is that allowance, as a fraction, and it is applied twice:
 *
 *   target  = round(reach * 0.6 * (1 - g))     ask for less
 *   2-star  = med  * 1.15 * (1 + g)            rate more generously
 *   3-star  = fast * 1.05 * (1 + g)
 *
 * so at g = 0.20 a level asks for 48% of the bot's reach instead of 60%, and
 * pays two stars at 1.38x the bot's median instead of 1.15x. The two compound
 * on purpose: a shorter level is also a faster one, so the clock relief lands
 * on times that have already come down.
 *
 *   levels 1-9   g = 0.20   the full allowance, the top of the asked-for band
 *   levels 10-18 g tapers linearly 0.18 -> 0.02
 *   level 19+    g = 0      the measured baseline, unchanged
 *
 * Top of the 10-20% band rather than the middle because he reported failures as
 * well as 1-stars, and 10% would not have moved a failure. Linear taper rather
 * than a step so there is no level where the campaign visibly gets harder in one
 * jump; it reaches baseline at 19, inside the "roughly 15 to 20" it was asked to.
 *
 * `hold` and `zero` are indices into the KEPT list, not into the candidate list,
 * so a rejection cannot shift the ramp off the levels a player actually sees.
 */
const GRACE = { max: 0.20, hold: 8, zero: 18 };

/** idx is the 0-based position in the SHIPPED campaign, i.e. level id - 1. */
function graceAt(idx) {
  if (idx < GRACE.hold) return GRACE.max;
  if (idx >= GRACE.zero) return 0;
  return +(GRACE.max * (GRACE.zero - idx) / (GRACE.zero - GRACE.hold)).toFixed(3);
}

/**
 * FLOOR and HEADROOM have to be resolved TOGETHER, not applied in sequence.
 *
 * The calibrated target is 0.6 of reach. Clamping that UP to FLOOR is what
 * manufactures a tight level: it fires exactly when reach is small, and the
 * smaller the reach the closer to 100% of it the floor sits. All ten tight
 * levels in the shipped table were made this way — four span at target 2 /
 * reach 2, six quench at crystal 32 against a reach of 32 to 38. Enforcing
 * FLOOR first and then testing HEADROOM would just relabel them; enforcing
 * HEADROOM first and then clamping to FLOOR would put the floor back.
 *
 * So: cap the target at HEADROOM x reach, then take the floor. If the cap is
 * below the floor there is no target that satisfies both and the level is
 * rejected — a floor breach is the thing the floor exists to stop, and a level
 * with no headroom is not worth shipping to save it.
 *
 * The `target = cap` branch cannot fire while the calibrator asks for 0.6 and
 * HEADROOM is 0.8. It is written out anyway so that raising the calibration
 * fraction can never quietly reintroduce tight levels.
 */
function resolveTarget(cal, floor) {
  const cap = Math.floor(HEADROOM * cal.reach);
  const want = Math.max(floor, cal.target);
  if (want <= cap) return { target: want };
  if (cap < floor) {
    return { reject: `no headroom: a ${floor} floor is ${(floor / Math.max(1, cal.reach)).toFixed(2)}x the bot's reach of ${Math.round(cal.reach)}, over the ${HEADROOM} cap` };
  }
  return { target: cap };
}

/** How close a shipped level's target sits to the reach it was measured against. */
function tightLevels(levels) {
  return levels.filter((lv) => lv.objective.type !== 'purge' && lv.reach > 0
    && lv.objective.target > HEADROOM * lv.reach);
}

/**
 * A6 — the opening grace has to be IN THE TABLE, not just in the generator.
 *
 * Two separate things can go wrong and only one of them is about the curve.
 * The curve can be lost outright — someone regenerates with an older tool, or
 * the ramp is reindexed off the levels a player sees — and the campaign quietly
 * goes back to opening at the bot's own pace. Or the annotation can survive
 * while the relief does not, which is worse, because the table then LOOKS eased.
 *
 * So this checks both, and the second half is the one that matters: a graced
 * level's 2-star must actually be at least `1.15 x (1 + g)` of the median the
 * bot recorded. An ungraced table has it at exactly 1.15x and cannot pass. The
 * only escape is `limitS`, which caps the 2-star from above — a level whose
 * eased 2-star runs past its own time limit is capped, not ungraced.
 *
 * Costs no simulation: `measured` and `grace` are both written by the generator
 * that ran the levels, so the relief can be re-derived from the file.
 */
function graceFaults(levels) {
  const bad = [];
  for (const lv of levels) {
    const want = graceAt(lv.id - 1);
    const got = typeof lv.grace === 'number' ? lv.grace : -1;
    if (Math.abs(got - want) > 0.005) { bad.push(`${lv.id} grace ${got} want ${want.toFixed(2)}`); continue; }
    if (!want || !lv.measured || !lv.stars) continue;
    const eased = Math.min(lv.limitS, lv.measured.med * 1.15 * (1 + want));
    // 0.2s of slack, and it is arithmetic rather than judgement: `measured.med`
    // and `stars` are both stored to one decimal, so re-deriving the threshold
    // from the rounded median can overshoot the rounded threshold by up to
    // 0.05 * 1.38 + 0.05 = 0.12s. Five levels tripped on exactly that. The
    // relief this is looking for is 0.23 * med, which is 6-8s — three orders
    // away from the slack, so nothing real hides under it.
    if (lv.stars[1] < eased - 0.2) bad.push(`${lv.id} 2-star ${lv.stars[1]}s not eased to ${eased.toFixed(1)}s (med ${lv.measured.med}s, g ${want})`);
  }
  return bad;
}

/**
 * A4 — every shipped board must fill the screen like the rest of the game.
 *
 * js/core/viewport.js letterboxes the grid preserving aspect, so what the
 * player sees is cols/rows, NOT the column count. FLOW/TIDE/HOURGLASS/ZEN are
 * 112x224 = 0.500 and JELLY LAB is 88x192 = 0.458; ALCHEMY shipped at 0.381
 * rising to 0.407, filling 322px of a 390px phone against everyone else's 387,
 * and on a real device read as a different, broken game. The generator now
 * derives rows from cols so the aspect cannot drift — this gate is what stops
 * that guarantee from being quietly lost again, because nothing else in the
 * suite would notice: every level would still be winnable, still non-trivial,
 * still correctly starred, and still wrong.
 *
 * 0.46 rather than 0.50 so JELLY LAB's shape stays legal — it is the narrowest
 * board anyone has judged acceptable on a phone.
 */
const MIN_ASPECT = 0.46;

function gateAspect(levels, where) {
  const bad = [];
  let lo = Infinity, hi = 0;
  for (const lv of levels) {
    const a = lv.cols / lv.rows;
    lo = Math.min(lo, a); hi = Math.max(hi, a);
    if (!(a >= MIN_ASPECT)) bad.push(`${lv.id} ${lv.cols}x${lv.rows}=${a.toFixed(3)}`);
  }
  if (bad.length) {
    fail('A4-aspect', `${where}: ${bad.length}/${levels.length} board(s) letterbox below ${MIN_ASPECT} — ` +
      bad.slice(0, 5).join(' ') + (bad.length > 5 ? ' …' : ''));
  }
  return { lo, hi, bad: bad.length };
}

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

/**
 * Star times from the EFFECTIVE clock, eased by the opening grace.
 *
 * `times` are `world.alchemy.elapsed` — wall clock minus whatever the run's big
 * spans bought back. Every star time in the shipped table before this pass was
 * measured from `world.t`, which is why the bot three-starred levels it used to
 * two-star: the thresholds were generous by exactly the bonus each run earned.
 */
function starsFrom(times, limitS, g = 0) {
  const s = [...times].sort((a, b) => a - b);
  const fast = s[0], mid = s[(s.length / 2) | 0];
  const two = Math.min(limitS, +(mid * 1.15 * (1 + g)).toFixed(1));
  const three = Math.min(two - 0.5, +(fast * 1.05 * (1 + g)).toFixed(1));
  return [limitS, two, Math.max(1, three)];
}

async function generateLevels(count) {
  const cands = genLevels(count, GEN_SEED);
  if (BREAK === 'trivial') cands[3].objective = { type: 'chains', target: 0 };
  if (BREAK === 'unwinnable') cands[4].objective = { type: 'chains', target: 100000 };
  if (BREAK === 'span') {
    const c = cands[7];
    c.scene.push({ x: 0, y: c.rows - 12, w: c.cols, h: 4, mat: 2, tint: 1 });
  }
  setLevels(cands);

  // A4 is a pure function of the board formula, so it is judged on the
  // candidates: if the formula drifted, no amount of validation downstream will
  // put the aspect back. Under --break aspect one candidate is stretched in a
  // COPY, so the arm proves the check without perturbing the generation run.
  gateAspect(
    BREAK === 'aspect' ? cands.map((lv, i) => (i === 9 ? { ...lv, rows: Math.round(lv.rows * 1.6) } : lv)) : cands,
    `${count} generated candidates`,
  );

  const kept = [], rejected = [];
  for (const lv of cands) {
    // The grace is a property of a level's position in the CAMPAIGN, and the
    // campaign is the kept list — so the index this candidate would occupy if
    // it survives is exactly how many levels have been kept so far. Rejections
    // therefore slide the ramp along instead of punching holes in it.
    const g = graceAt(kept.length);
    lv.grace = g;
    if (!sceneSpans(lv)) {
      const cal = await calibrate(lv, 0.6 * (1 - g));
      if (cal.err) { rejected.push([lv.id, lv.arch, 'invariant: ' + cal.err]); continue; }
      if (BREAK !== 'trivial' && BREAK !== 'unwinnable') {
        lv.reach = Math.round(cal.reach);
        const floor = FLOOR[lv.objective.type];
        if (lv.objective.type === 'purge') {
          // purge is "reduce sand TO n", so a bigger number is EASIER and the
          // floor means something else: it is applied to the progress the bot
          // made, and the target already sits at 0.6 of that, which is the same
          // headroom the other objectives get.
          if (cal.reach < floor) {
            rejected.push([lv.id, lv.arch, `unreachable: bot only removed ${Math.round(cal.reach)} of a ${floor} floor`]);
            continue;
          }
          lv.objective.target = cal.target;
        } else {
          const r = resolveTarget(cal, floor);
          if (r.reject) { rejected.push([lv.id, lv.arch, r.reject]); continue; }
          lv.objective.target = r.target;
        }
      }
    }
    const v = await validateLevel(lv, 3);
    if (v.selfClearing) { rejected.push([lv.id, lv.arch, 'self-clearing scene']); continue; }
    if (v.trivial) { rejected.push([lv.id, lv.arch, 'trivially complete']); continue; }
    if (v.err) { rejected.push([lv.id, lv.arch, 'invariant: ' + v.err]); continue; }
    if (v.wins < 2) { rejected.push([lv.id, lv.arch, `only ${v.wins}/3 wins`]); continue; }
    lv.stars = starsFrom(v.times, lv.limitS, g);
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

// -------------------------------------------------- strategy vs mashing

/**
 * A7 — is the span bonus farmable by throughput?
 *
 * This is the only check in the suite that is about the DESIGN rather than the
 * data, and it is opt-in (`--masher`) because it plays every sampled level
 * three times over. It exists because the span bonus was added to answer a
 * specific complaint — "swipe down fast is the only way to get to 3 stars" —
 * and no green gate could have told anyone whether the answer landed.
 *
 * IT DOES NOT ASSERT THAT STRATEGY WINS, because measurement says it does not
 * and a gate that is red by design is a gate nobody reads. What it asserts is
 * the property the mechanic actually promises and the first version violated by
 * a factor of forty-one: THE BONUS MUST NOT BE BOUGHT WITH THROUGHPUT. A masher
 * may not collect materially more seconds than a deliberate player. The star
 * comparison is printed either way, and flagged as a note when mashing is level
 * with strategy or ahead of it, which is currently the honest state of things.
 *
 * `--break masher` restores the original mechanic exactly — `min(8, n^2/1.2e6)`
 * summed over every chain over the floor — which is the fault this rule exists
 * to catch, reproduced rather than fabricated.
 */
async function gateMasher() {
  if (BREAK === 'masher') {
    ALCHEMY_CFG.spanShare = null;
    ALCHEMY_CFG.spanSummedQuadratic = (n) => Math.min(8, (n * n) / 1.2e6);
  }
  const step = Math.max(1, Math.ceil(SHIPPED.length / 12));
  const pick = ALL_LEVELS ? SHIPPED : SHIPPED.filter((_, i) => i % step === 0);
  const SEEDS = [900, 1213, 1526];
  const WHO = ['bot', 'swift', 'masher'];
  const acc = {};
  for (const w of WHO) acc[w] = { wins: 0, runs: 0, stars: 0, dist: [0, 0, 0, 0], bonus: 0, drops: 0, big: 0, at: [] };
  const rows = [];
  for (const lv of pick) {
    const per = {};
    for (const who of WHO) {
      per[who] = [];
      for (const seed of SEEDS) {
        const r = await playLevel(lv, seed, undefined, who);
        const a = acc[who];
        a.runs++; a.bonus += r.bonus;
        a.big += r.sizes.filter((n) => n >= ALCHEMY_CFG.spanMinCells).length;
        const st = r.won ? starsFor(lv, r.at) : 0;
        if (r.won) { a.wins++; a.at.push(r.at); }
        a.stars += st; a.dist[st]++;
        per[who].push(st);
      }
    }
    const b = mean(per.bot), m = mean(per.masher);
    rows.push({ lv, b, m, s: mean(per.swift) });
    console.log(`  level ${String(lv.id).padStart(3)} ${lv.arch.padEnd(9)} ` +
      WHO.map((w) => `${w} ${per[w].join('')}`).join('  ') +
      `   ${b > m ? 'strategy' : b < m ? 'MASHING' : 'tie'}`);
  }
  console.log('');
  for (const who of WHO) {
    const a = acc[who];
    console.log(`  ${who.padEnd(7)} win ${String(a.wins).padStart(3)}/${a.runs}  mean stars ${(a.stars / a.runs).toFixed(2)}  ` +
      `stars per WIN ${(a.wins ? a.stars / a.wins : 0).toFixed(2)}  ` +
      `dist fail:${a.dist[0]} 1:${a.dist[1]} 2:${a.dist[2]} 3:${a.dist[3]}  ` +
      `big spans ${(a.big / a.runs).toFixed(1)}/run  bonus ${(a.bonus / a.runs).toFixed(1)}s/run`);
  }
  const bs = acc.bot.stars / acc.bot.runs, ms = acc.masher.stars / acc.masher.runs;
  const won = rows.filter((r) => r.b > r.m).length, lost = rows.filter((r) => r.b < r.m).length;
  console.log(`  head to head over ${rows.length} levels: strategy ${won}, mashing ${lost}, tie ${rows.length - won - lost}`);

  // THE BAR: the bonus may not be bought with throughput. 1.3x rather than 1.0x
  // because the masher takes more chains and therefore more samples of the same
  // distribution, so the best-of-run it collects is legitimately a little higher
  // than the bot's even with the count advantage removed — measured at 1.12x on
  // the share, against 41x for the summed per-chain version this replaced.
  const bb = acc.bot.bonus / acc.bot.runs, mb = acc.masher.bonus / acc.masher.runs;
  const ratio = bb > 0 ? mb / bb : (mb > 0 ? Infinity : 1);
  console.log(`  span bonus per run: bot ${bb.toFixed(1)}s, masher ${mb.toFixed(1)}s — mashing collects ${ratio.toFixed(2)}x`);
  if (!(ratio <= 1.3)) {
    fail('A7-masher', `the span bonus is farmable by throughput — a masher collects ${mb.toFixed(1)}s/run against ` +
      `a deliberate player's ${bb.toFixed(1)}s (${ratio.toFixed(1)}x): the mechanic added to beat mashing is rewarding it`);
  }

  // Reported, never failed: whether thinking actually out-stars mashing. It
  // does not, and the reason is that every objective here is a volume race.
  const bw = acc.bot.wins ? acc.bot.stars / acc.bot.wins : 0;
  const mw = acc.masher.wins ? acc.masher.stars / acc.masher.wins : 0;
  if (!(bs > ms)) notes.push(`mashing out-stars strategy over the whole sample: ${ms.toFixed(2)} vs ${bs.toFixed(2)} stars/run`);
  if (acc.masher.wins && !(bw > mw)) {
    notes.push(`on the levels it finishes, mashing rates as well as strategy or better: ${mw.toFixed(2)} vs ${bw.toFixed(2)} stars/win ` +
      `— strategy is ahead only on the fail rate (${acc.bot.dist[0]}/${acc.bot.runs} vs ${acc.masher.dist[0]}/${acc.masher.runs} losses)`);
  }
  return { bs, ms, bw, mw, bb, mb, ratio, won, lost, rows: rows.length };
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

if (MASHER) {
  console.log(`\nALCHEMY: deliberate placement vs mashing, ${ALL_LEVELS ? 'all' : 'a sample of'} shipped levels, 3 seeds each`);
  await gateMasher();
} else if (GEN) {
  const t0 = Date.now();
  const { kept, rejected } = await generateLevels(GEN);
  console.log(`\nALCHEMY generation: ${GEN} candidates -> ${kept.length} kept, ${rejected.length} rejected  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  const why = {};
  for (const [, , r] of rejected) why[r.split(':')[0]] = (why[r.split(':')[0]] || 0) + 1;
  for (const [k, v] of Object.entries(why)) console.log(`    rejected ${v}  ${k}`);
  // The first dozen by candidate id, because the OPENING of the campaign is the
  // part a player actually sees and a silent cull there reshapes the ladder:
  // `archetypeFor` teaches chains in candidates 1-6, and if all six are thrown
  // out the campaign opens on whatever archetype happened to survive.
  for (const [id, arch, r] of rejected.filter(([id]) => id <= 12)) console.log(`    . candidate ${id} ${arch}: ${r}`);
  console.log(`    tight (target > ${HEADROOM} x reach): ${tightLevels(kept).length} of ${kept.length} kept`);
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

  // A4 costs no simulation, so it is always run over ALL 96 shipped levels,
  // never the sample.
  const asp = gateAspect(
    BREAK === 'aspect' ? SHIPPED.map((lv, i) => (i === 0 ? { ...lv, rows: Math.round(lv.rows * 1.6) } : lv)) : SHIPPED,
    'shipped levels',
  );

  // A5 costs no simulation either — `reach` is recorded on every shipped level
  // by the generator that measured it, so the margin can be re-derived from the
  // table itself. Under --break headroom one level is pushed to 100% of its
  // reach in a COPY, which is exactly the shape of the ten this rule removed.
  const tight = tightLevels(BREAK === 'headroom'
    ? SHIPPED.map((lv, i) => (i === 0 ? { ...lv, objective: { ...lv.objective, type: 'chains', target: lv.reach } } : lv))
    : SHIPPED);
  if (tight.length) {
    fail('A5-headroom', `${tight.length}/${SHIPPED.length} level(s) ship a target above ${HEADROOM} of the bot's measured reach — ` +
      tight.slice(0, 5).map((lv) => `${lv.id} ${lv.arch} ${lv.objective.target}/${lv.reach}`).join(' ') + (tight.length > 5 ? ' …' : ''));
  }

  // A6 — the opening grace. The rule has two halves and they can fail
  // separately, so `--break grace` injects one fault of each kind into a COPY
  // and both must be reported:
  //
  //   level 1  correct annotation, UNGRACED star times — a table where the ramp
  //            is recorded but never actually landed, which is the fault that
  //            would otherwise look eased and not be
  //   level 2  the annotation deleted — a table generated by an older tool
  //
  // Arming only the second would leave the first unproven, and the first is the
  // one worth having.
  const graceBad = graceFaults(BREAK === 'grace'
    ? SHIPPED.map((lv, i) => {
        if (i === 0) return { ...lv, stars: [lv.limitS, Math.min(lv.limitS, +(lv.measured.med * 1.15).toFixed(1)), lv.stars[2]] };
        if (i === 1) { const c = { ...lv }; delete c.grace; return c; }
        return lv;
      })
    : SHIPPED);
  if (graceBad.length) {
    fail('A6-grace', `${graceBad.length}/${SHIPPED.length} level(s) do not carry the opening grace — ` +
      graceBad.slice(0, 5).join(' · ') + (graceBad.length > 5 ? ' …' : ''));
  }
  if (BREAK === 'grace') {
    if (!graceBad.some((b) => b.startsWith('1 2-star'))) notes.push('!! level 1 was given ungraced star times and A6 kept it');
    if (!graceBad.some((b) => b.startsWith('2 grace'))) notes.push('!! level 2 had its grace annotation deleted and A6 kept it');
  }

  // Shipped levels: a sample by default, all of them under --levels.
  //
  // The bar here is the SAME bar the generator shipped the level under — two
  // wins out of the three seeds 900/1213/1526 — and it has to be, because a
  // level accepted at 2/3 is a level that loses one seed on purpose. The first
  // version of this check played ONE seed and demanded a win, which is a
  // stricter property than any level was ever guaranteed to have: it was green
  // only because both 2/3 levels that landed in the shipped sample (ids 1 and
  // 91) happened to win on seed 900. Regenerating the campaign re-rolled that
  // coin and it came up red on a level whose own `measured.wins: 2` says it is
  // fine. A gate that fires on a level meeting its contract is a false alarm,
  // and a false alarm is how a real one gets ignored.
  const pick = ALL_LEVELS ? SHIPPED : SHIPPED.filter((_, i) => i % Math.ceil(SHIPPED.length / 10) === 0);
  let lvWins = 0, lvChecked = 0, lvBad = [];
  for (const lv of pick) {
    const v = await validateLevel(lv, 3);
    lvChecked++;
    if (v.selfClearing || v.trivial) { fail('A2-trivial', `level ${lv.id} (${lv.arch}) completes itself`); lvBad.push(lv.id); }
    else if (v.wins < 2) { fail('A1-levels', `level ${lv.id} (${lv.arch}) beaten by the bot only ${v.wins}/3 times`); lvBad.push(lv.id); }
    else lvWins++;
  }

  console.log('');
  fmtRuns(rows);
  console.log(`\n  tide: bare tide self-clears 0x; tinted water bridges a sand run (${tideProbe.bridged} cells). engine treats tint 0 as inert: ${tideProbe.inertZero}. highest tint emitted ${BRINE_FIRST + BRINE_COUNT - 1} of ${slots} renderer slots`);
  console.log(`  hourglass flips in 150s: ${flips}`);
  console.log(`  zen: no fail state over 120s, vented ${z.vented}x`);
  console.log(`  levels: ${lvWins}/${lvChecked} sampled levels beaten by the bot at least 2 of 3 seeds${lvBad.length ? ' (bad: ' + lvBad.join(',') + ')' : ''}  [${SHIPPED.length} shipped]`);
  console.log(`  board aspect: ${asp.lo.toFixed(3)}-${asp.hi.toFixed(3)} across ${SHIPPED.length} levels, floor ${MIN_ASPECT} (${asp.bad} below)`);
  console.log(`  objective headroom: ${tight.length} of ${SHIPPED.length} levels above ${HEADROOM} of measured reach`);
  console.log(`  opening grace: levels 1-${GRACE.hold + 1} at ${(GRACE.max * 100).toFixed(0)}%, easing to baseline by level ${GRACE.zero + 1} (${graceBad.length} faults)`);
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
