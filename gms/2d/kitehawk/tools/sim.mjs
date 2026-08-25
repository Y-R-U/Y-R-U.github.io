#!/usr/bin/env node
/**
 * The headless game. ARCHITECTURE §8.1's contract: node imports js/sim/** and
 * js/data/** directly and flies the SHIPPING model, not a re-implementation of
 * it. Every number the balance plan rests on comes out of here.
 *
 * Everything below MEASURES the integrated model. Where a figure could have been
 * computed in closed form it deliberately is not, because a closed form tests
 * your own arithmetic and this project has been bitten by that twice (D43, D47).
 * The one exception is `--envelope --analytic`, which prints both so a divergence
 * between them is visible.
 *
 *   node tools/sim.mjs --envelope                 the DESIGN §10.1 report, all airframes
 *   node tools/sim.mjs --gates                    every P4 gate criterion, measured
 *   node tools/sim.mjs --fixtures                 the regression fixtures + state hashes
 *   node tools/sim.mjs --fixtures --bless         rewrite tools/BLESSED.json
 *   node tools/sim.mjs --fixtures --break <what>  break one constant, expect red
 *   node tools/sim.mjs --determinism --runs 1000  same seed -> same hash
 *   node tools/sim.mjs --level a1-04 --seed 7 --pilot ace --secs 300
 *   node tools/sim.mjs --level a1-04 --seed 7 --zoom 0.78   summary MUST NOT change
 *   node tools/sim.mjs --airframes-json           regenerate data/tables/airframes.json
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { M_PER_WU } from '../js/core/math.js';
import { createRNG } from '../js/core/rng.js';
import { bandIdAt, BANDS as BAND_TABLE, BEST_CLIMB_WU_S, CRUISE_MS, CRUISE_WU_S } from '../js/core/bands.js';
import { AIRFRAMES, AIRFRAME_BY_ID, REFERENCE, makeAirframe, N_REF, G_SI, PITCH, AGILITY,
         pitchCeiling, checkBands, unitIdentity, BANDS } from '../js/data/tables.js';
import { createFlight } from '../js/sim/flight.js';
import { createPilot } from '../js/sim/pilot.js';
import { specificEnergy, wrapPi, checkInvariants } from '../js/sim/physics.js';
import { stallAlpha as STALL_ALPHA } from '../js/sim/aero.js';
const stallAlphaOf = () => STALL_ALPHA;
import { stallSpeed, density, thrustFactor, cd0Eff, nAvailable, forces, alphaForCL } from '../js/sim/aero.js';
import { LIFT } from '../js/data/tables.js';

import { createWorld, ENEMY_TYPES, ENEMY_BY_ID, playerType, framingContributions, FRAMING, setTierForce } from '../js/sim/entities.js';
import { GUNS, GUN_TIERS, GUN_BY_ID, PRIORITY, updateGun, updateBullets, offNose, leadPoint, makeGun } from '../js/sim/weapons.js';
import { HP_REF, SPILL, COLLIDERS_PROFILE, COLLIDERS_SPAN, setColliderSet, SUBRECTS, COMPONENTS,
         traceHit, updateDamage, makeHP, FIRE, P5_BREAKS, HULL_M } from '../js/sim/damage.js';
import { createAI, ACES, ACE_IDS, MORALE, ENERGY, FORMATION, createFormation, cornerGuess } from '../js/sim/ai.js';
import { createDuel, DUEL, INTENDED } from '../js/modes/duel.js';
import { createCrateField, CRATE, CONTENTS, CONTENT_BY_KIND, CRATE_EV, LADDER, SMALL_ARMS,
         smallArmsP, terminalAt as crateTerminal, tau, swingPeriod, crateIdentity, windAt,
         reachCone, soonestCatch, soonestCut, ACT_MULT } from '../js/sim/crates.js';
import { CEILING_WU } from '../js/core/bands.js';
import { createLevel } from '../js/data/level.js';
import { validateLevel, formatErrors, evalCondition } from '../js/data/validate.js';
import { containInLevel } from '../js/modes/story.js';
import { createSpawner, SPAWN_LEAD_WU } from '../js/sim/spawner.js';

/** P6's break switch, kept separate from P4's `BROKEN` and P5's `P5BUG`. */
let P6BUG = '';
let P9BUG = '';

/**
 * P9's break-switches, and they are REGISTERED rather than read straight off the
 * command line. The first version read `--break` with `opt()` inside the level
 * runner, so `--break no-beats` fell through `main()`'s dispatcher, printed
 * "must be one of ..." and **exited before running anything** — and the three
 * controls came back with byte-identical hashes, which reads exactly like three
 * controls that do not bite. D136's `noreanchor` was the same defect: a
 * break-switch that is not plumbed is indistinguishable from a fix that works.
 */
const P9_BREAKS = {
  'no-corridor': 'the level stops being a corridor — the player may fly off either end',
  'no-beats': 'the level\'s own beats are stripped; only the corridor remains',
  'camera-current': 'the spawner is fed the camera\'s CURRENT x, not the furthest it has reached',
  'no-lid': 'the corridor loses its LID — the act ceiling (D150) stops being enforced',
};
const P6_BREAKS = Object.freeze({
  'pin-swing':    'crates.js: the pendulum is pinned to zero — the hitbox stops moving',
  'flat-wind':    'crates.js: the wind is sampled at 750 m for every altitude — no shear',
  'burst-free':   'crates.js: T20 deleted — a cut crate never bursts, at any altitude',
  'no-ladder':    'crates.js: §4.5 reduced to a counter — a banked crate buys the enemy nothing',
  'preload-live': 'crates.js: the ladder\'s damage rung is applied over world.live — empty before tick 0',
  'rein-stacked': 'sim.mjs: every flushed reinforcement spawns on ONE point — they collide on arrival',
  'point-bullets': 'crates.js: rounds are tested as POINTS at tick resolution, not segments',
  'crate-zoom':   'crates.js: the 9 m collect radius scales with the camera zoom (K10 tripwire)',
});

const LIFT_CL0 = LIFT.CL0, LIFT_CLA = LIFT.CLa;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DT = 1 / 60;
const DEG = 180 / Math.PI;

/**
 * Rig altitude for every turn, stall, climb and top-speed measurement. It is not
 * zero because a max-rate loop is 38 m across and a sustained loop wanders, and
 * an aircraft cannot fly through the ground. rho(120 m)/rho0 = 0.953, so every
 * figure below reads about 2% pessimistic against a true sea-level number. Said
 * here once rather than fudged in each measurement.
 */
const RIG_ALT = 120;

/* ------------------------------------------------------------------ args -- */
const argv = process.argv.slice(2);
const flag = (n) => argv.includes('--' + n);
const opt = (n, d = null) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const num = (n, d) => { const v = opt(n); return v === null ? d : Number(v); };

/* ------------------------------------------------------- little machinery -- */

function makeCtx(seed = 1) { return { rng: createRNG(seed) }; }

/**
 * `--break <name>` swaps the reference airframe for one carrying a falsification
 * switch (js/data/tables.js `bug`). Everything downstream — gates, fixtures, the
 * run summary — then flies the broken aeroplane, and the point is to WATCH THE
 * ASSERTS GO RED. tools/BLESSED.md records what each one broke.
 */
let BROKEN = '';
let P5BUG = '';
function refAirframe() {
  if (!BROKEN) return REFERENCE;
  return makeAirframe({ ...REFERENCE, bug: BROKEN });
}

/** A plane, trimmed at a speed and altitude, with a pilot if you want one. */
function plane({ airframe = refAirframe(), speed = 40, altM = 500, theta = 0, seed = 1, roll = 1, tier = null, fuel = 1e9 } = {}) {
  const ctx = makeCtx(seed);
  const ac = createFlight(ctx, { airframe, speed, yM: -altM, theta, roll, fuel });
  const pilot = tier ? createPilot(ctx, { tier }) : null;
  return { ctx, ac, pilot };
}

/**
 * Fly. `control(ac, t, i)` returns a stick value (-1..1, + is pull) or null to
 * let the pilot decide. Returns a trace summary; `onTick` sees every tick.
 */
function fly(p, secs, control, onTick = null) {
  const n = Math.round(secs / DT);
  for (let i = 0; i < n; i++) {
    const t = i * DT;
    if (control) {
      const s = control(p.ac, t, i);
      if (s !== null && s !== undefined) p.ac.setInput(-s, 0);
      else if (p.pilot) p.pilot.update(DT, p.ac);
    } else if (p.pilot) p.pilot.update(DT, p.ac);
    p.ac.update(DT);
    if (onTick && onTick(p.ac, t, i) === false) return { stoppedAt: t, ticks: i };
  }
  return { stoppedAt: secs, ticks: n };
}

/** Let transients die before measuring anything. */
function settle(p, secs = 2, control = null) { fly(p, secs, control); return p; }

/* ------------------------------------------------- measured envelope bits -- */

/**
 * Level 1 g stall, MEASURED: hold altitude with the engine cut so the speed decays,
 * and record the speed at the break. It returns NaN rather than the closed-form
 * value if the break never happens — a measurement that silently falls back to
 * arithmetic is the believable-wrong-metric trap (D43) and would read as a pass.
 */
function measureStall(a, altM = RIG_ALT) {
  // The load factor available at a speed, read out of the shipped force resolve
  // with the wing already AT the limiter's cap. Flying up to the cap instead
  // reads 18% high, because building alpha against the low-speed authority term
  // takes a third of a second and the aircraft sheds speed doing it — a real
  // effect, but not the quantity "stall speed" names.
  const nAt = (v) => {
    const alphaCap = alphaForCL(a.CLmax * PITCH.alphaMargin, a);
    const f = forces(a, 0, -altM, v, 0, -alphaCap, 0, altM, 1, {});
    return Math.abs(f.n);
  };
  let lo = 5, hi = 60;
  if (nAt(hi) < 1) return NaN;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; (nAt(m) < 1) ? lo = m : hi = m; }
  return (lo + hi) / 2;
}

/**
 * Corner speed as ARCHITECTURE §3.5 derives it: the lowest speed at which the
 * wing can supply the maximum commandable pitch rate. Both sides come from the
 * shipped modules (`nAvailable`, `pitchCeiling`), so this is the model's own
 * number, not a second copy of the arithmetic — but it is a STATIC solve, and
 * `measureCorner` below is the flown one. They differ by about 5 m/s and the
 * difference is the energy the aircraft spends establishing the turn.
 */
function cornerStatic(a, altM = RIG_ALT) {
  // argmax of min(what the wing gives, what the stick may command). NOT the first
  // crossing: below the authority knee the ceiling is small enough that the wing
  // beats it, so there are two crossings and only the upper one is the corner.
  const omAt = (v) => {
    const n = nAvailable(a, v, altM, PITCH.alphaMargin);
    const aero = n > 1 ? G_SI * Math.sqrt(n * n - 1) / v : 0;
    return Math.min(aero, pitchCeiling(v, a));
  };
  let best = 0, bv = 0;
  for (let v = 8; v < 110; v += 0.05) { const o = omAt(v); if (o > best + 1e-9) { best = o; bv = v; } }
  return { v: bv, om: best, n: nCeilOf(a, bv), diaWu: 2 * bv / best / M_PER_WU };
}
const nCeilOf = (a, v) => { const k = pitchCeiling(v, a) * v / G_SI; return Math.sqrt(1 + k * k); };

/** Level top speed, measured: full throttle, hold altitude, wait for convergence. */
function measureVmax(a, altM = RIG_ALT) {
  const p = plane({ airframe: a, speed: 45, altM, tier: 'ace' });
  p.pilot.setIntent('hold', altM);
  let last = 0, best = 0;
  fly(p, 200, null, (ac) => { best = Math.max(best, ac.speedSI); last = ac.speedSI; return true; });
  return last > best - 0.4 ? last : best;
}

/** Best rate of climb, measured: a steady climb held at each trial speed. */
function measureRoC(a, altM = RIG_ALT) {
  let best = -1e9, bestV = 0;
  const band = [];
  for (let v = 20; v <= 60; v += 1) {
    const p = plane({ airframe: a, speed: v, altM, tier: 'ace' });
    p.pilot.setIntent('speed', v);
    settle(p, 6);
    const h0 = p.ac.altM, t0 = 0;
    let sum = 0, k = 0;
    fly(p, 6, null, (ac) => { sum += -ac.svy; k++; return true; });
    const roc = sum / k;
    band.push([v, roc]);
    if (roc > best) { best = roc; bestV = v; }
  }
  const flat = band.filter(([, r]) => r > best - 0.5).map(([v]) => v);
  return { roc: best, v: bestV, flatLo: Math.min(...flat), flatHi: Math.max(...flat), band };
}

/**
 * Vertical terminal, MEASURED. The rig holds the aircraft at the attitude that
 * makes zero lift (alpha = -CL0/CLa), which is what "vertical dive" means; it
 * does not touch the velocity. Set `throttle` false for the unpowered quantity —
 * R-08's point is that those are two different numbers and both belong in the
 * table with their defining conditions.
 */
function measureTerminal(a, altM = 0, throttle = true) {
  const alphaZero = -LIFT_CL0 / LIFT_CLA;      // the attitude at which the wing makes no lift
  const theta = Math.PI / 2 - alphaZero;
  // dv/dt along the path, read out of the shipped force resolve. A vertical dive
  // cannot be flown to equilibrium in a finite column of air (terminal rises as
  // the aircraft descends into thinner... no: as it descends into THICKER air the
  // local terminal falls faster than the aircraft can shed speed), so the honest
  // measurement is the local equilibrium, bisected.
  const accel = (v) => {
    const f = forces(a, 0, -altM, 0, v, theta, throttle ? 1 : 0, altM, 1, {});
    return f.ay;                                // vertical is the path here
  };
  let lo = 20, hi = 300;
  for (let i = 0; i < 90; i++) { const m = (lo + hi) / 2; (accel(m) > 0) ? lo = m : hi = m; }
  return (lo + hi) / 2;
}

/**
 * Instantaneous turn rate at a speed, MEASURED, and gravity-free by construction:
 * the pull is entered from a vertical climb and from a vertical dive and the two
 * are averaged. At gamma = +-90 deg the gravity term in gamma_dot is exactly
 * zero, and the two entries also cancel the speed change over the window. Read
 * from the flight path, not from the commanded pitch rate, because the commanded
 * rate is what I would be testing my own arithmetic on.
 */
function measureInstOmega(a, v, altM = RIG_ALT) {
  const r = instPoint(a, v, altM);
  return r.om;
}

/**
 * One max-rate entry, returning the PEAK flight-path rate and the speed AT that
 * instant. Attributing the peak to the entry speed is wrong and it moved the
 * apparent corner speed by 13 m/s: it takes about a third of a second to build
 * alpha against the pitch ceiling and the aircraft sheds 6-10% of its speed
 * doing it, so the rate belongs to the speed it was flying when it got there.
 *
 * Gravity-free by construction: the pull is entered from a vertical climb and a
 * vertical dive and the two are averaged. At gamma = +-90 deg the gravity term
 * in gamma_dot is exactly zero, and the two entries cancel the speed drift.
 */
function instPoint(a, v, altM = RIG_ALT) {
  const one = (sign) => {
    const p = plane({ airframe: a, speed: v, altM, theta: sign * Math.PI / 2 });
    p.ac.svx = 0; p.ac.svy = sign * v;
    let prev = null, om = 0, at = v, n = 0;
    fly(p, 1.2, () => 1, (ac) => {
      if (prev !== null) {
        const w = Math.abs(wrapPi(ac.gamma - prev)) / DT;
        if (w > om) { om = w; at = ac.speedSI; n = Math.abs(ac.n); }
      }
      prev = ac.gamma;
      return true;
    });
    return { om, at, n };
  };
  const a1 = one(1), a2 = one(-1);
  return { om: (a1.om + a2.om) / 2, v: (a1.at + a2.at) / 2, n: (a1.n + a2.n) / 2 };
}

/**
 * Sustained turn rate at a speed: the largest steady stick whose specific energy
 * is unchanged over a whole loop. Measured by bisection on the shipped model.
 */
function measureSusOmega(a, v, altM = RIG_ALT) {
  const rate = (stick) => {
    const p = plane({ airframe: a, speed: v, altM });
    settle(p, 0.3, () => stick);
    const e0 = specificEnergy(p.ac.speedSI, p.ac.altM);
    let turned = 0, prev = p.ac.gamma, t = 0;
    fly(p, 25, () => stick, (ac, tt) => {
      turned += Math.abs(wrapPi(ac.gamma - prev)); prev = ac.gamma; t = tt;
      return turned < Math.PI * 2;
    });
    const e1 = specificEnergy(p.ac.speedSI, p.ac.altM);
    return { dPs: (e1 - e0) / G_SI, om: turned / Math.max(1e-6, t), full: turned >= Math.PI * 2 };
  };
  let lo = 0, hi = 1;
  for (let i = 0; i < 18; i++) {
    const m = (lo + hi) / 2;
    const r = rate(m);
    if (!r.full || r.dPs < 0) hi = m; else lo = m;
  }
  const r = rate(lo);
  return r.full ? r.om : 0;
}

/** Best sustained rate over the speed range, and the speed it happens at. */
function measureSusMax(a, altM = RIG_ALT) {
  let best = 0, bv = 0;
  for (let v = 20; v <= 60; v += 2) { const o = measureSusOmega(a, v, altM); if (o > best) { best = o; bv = v; } }
  for (let v = Math.max(18, bv - 2); v <= bv + 2; v += 0.5) { const o = measureSusOmega(a, v, altM); if (o > best) { best = o; bv = v; } }
  return { om: best, v: bv };
}

/**
 * Specific-energy rate in a max-rate turn: DESIGN §1.5's "about 8 metres of
 * altitude per second". Measured over the first 90 deg from the two vertical
 * entries, same trick as the turn rate — gravity does no work on specific energy
 * anyway, but entering vertical keeps the load factor at the value the speed
 * implies instead of the value the loop position implies.
 */
function measureBleed(a, v, altM = RIG_ALT) {
  const one = (sign) => {
    const p = plane({ airframe: a, speed: v, altM, theta: sign * Math.PI / 2 });
    p.ac.svx = 0; p.ac.svy = sign * v;
    // At the instant the turn is actually established — the tick of peak load
    // factor. Averaging from the entry instead folds in the third of a second
    // the aircraft spends building alpha, when it is barely turning and barely
    // paying: that reads -2 m/s for a turn that costs -9.
    let best = 0, ps = 0;
    fly(p, 1.5, () => 1, (ac) => {
      if (Math.abs(ac.n) > best) {
        best = Math.abs(ac.n);
        ps = ac.speedSI * (ac.aero.thrust - ac.aero.drag) / a.W;
      }
      return true;
    });
    return ps;
  };
  return (one(1) + one(-1)) / 2;
}

/** The turn circle a max-rate turn actually draws, in wu. Measured from the path. */
/**
 * Two different quantities, and P8 must say which one gate P1 means:
 *   `diaWu`  the KINEMATIC diameter 2v/omega at the corner point. This is
 *            ARCHITECTURE §3.5's 273 wu and what F6 cites as the derived figure.
 *   `boxWu`  the bounding box of the path a real max-rate 360 actually draws.
 *            Bigger, because in a vertical-plane model the turn is a LOOP: the
 *            aircraft climbs and slows, so the figure is a teardrop, not a circle.
 * The frame has to hold the box; the gate quotes the diameter.
 */
function measureTurnCircle(a, v, altM = RIG_ALT) {
  const pt = instPoint(a, v, altM);
  const kinematic = pt.om > 1e-3 ? 2 * pt.v / pt.om / M_PER_WU : Infinity;
  const p = plane({ airframe: a, speed: v, altM });
  settle(p, 0.2, () => 1);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let turned = 0, prev = p.ac.gamma;
  fly(p, 12, () => 1, (ac) => {
    minX = Math.min(minX, ac.sx); maxX = Math.max(maxX, ac.sx);
    minY = Math.min(minY, ac.sy); maxY = Math.max(maxY, ac.sy);
    turned += Math.abs(wrapPi(ac.gamma - prev)); prev = ac.gamma;
    return turned < Math.PI * 2;
  });
  const w = (maxX - minX) / M_PER_WU, h = (maxY - minY) / M_PER_WU;
  return { wWu: w, hWu: h, boxWu: Math.max(w, h), diaWu: kinematic, closed: turned >= Math.PI * 2 };
}

/** Corner speed: the LOWEST speed at which the maximum instantaneous rate is available. */
function measureCorner(a) {
  const rows = [];
  for (let v = 18; v <= 80; v += 0.5) { const r = instPoint(a, v); if (r.om > 1e-3) rows.push(r); }
  const best = Math.max(...rows.map(r => r.om));
  const at = rows.filter(r => r.om > best * 0.995).map(r => r.v);
  const bestRow = rows.find(r => r.om === best);
  return { om: best, lo: Math.min(...at), hi: Math.max(...at), n: bestRow.n, rows };
}

/** Dive recovery from Vne: vertical extent of a full pull-out, in wu. */
function measureDiveRecovery(a, altM = 1400) {
  const p = plane({ airframe: a, speed: a.vne, altM, theta: Math.PI / 2 });
  p.ac.svx = 0; p.ac.svy = a.vne;
  const y0 = p.ac.sy;
  let yMax = y0, done = false;
  fly(p, 20, () => 1, (ac) => {
    yMax = Math.max(yMax, ac.sy);
    if (ac.svy <= 0) { done = true; return false; }
    return true;
  });
  return { extentWu: (yMax - y0) / M_PER_WU, done };
}

/** Zoom climb: trade Vne for altitude, vertically, measured to the stall. */
function measureZoomClimb(a, altM = 200) {
  const p = plane({ airframe: a, speed: a.vne, altM, theta: -Math.PI / 2 });
  p.ac.svx = 0; p.ac.svy = -a.vne;
  const h0 = p.ac.altM;
  let t = 0;
  fly(p, 30, () => 0, (ac, tt) => {
    ac.theta = -Math.PI / 2;
    t = tt;
    return ac.speedSI > stallSpeed(a, ac.altM) && ac.svy < 0;
  });
  return { gainM: p.ac.altM - h0, secs: t };
}

/** Glide, engine out: L/D and range from a height. */
function measureGlide(a, fromM = 500) {
  const p = plane({ airframe: a, speed: 32, altM: fromM, tier: 'ace' });
  p.ac.engineOut = true;
  p.pilot.setIntent('glide');
  const x0 = p.ac.sx;
  fly(p, 240, null, (ac) => ac.altM > 2);
  const dist = p.ac.sx - x0;
  return { rangeM: dist, ld: dist / fromM };
}

/** Service ceiling: where best climb rate falls under 0.5 m/s. */
function measureCeiling(a) {
  let lo = 0, hi = 6000;
  for (let i = 0; i < 12; i++) {
    const m = (lo + hi) / 2;
    const r = measureRoC(a, m).roc;
    if (r > 0.5) lo = m; else hi = m;
  }
  return Math.round(lo);
}

/* ------------------------------------------------------------- envelope --- */

function envelope(a, altitudes = [0, 500, 1350]) {
  const rows = [];
  for (const altM of altitudes) {
    const corner = altM === 0 ? measureCorner(a) : null;
    const roc = measureRoC(a, altM);
    const susSpeeds = [22, 26, 30, 34, 40, 46, 52, 58];
    const inst = susSpeeds.map(v => measureInstOmega(a, v, Math.max(400, altM)) * DEG);
    const sus = susSpeeds.map(v => measureSusOmega(a, v, Math.max(600, altM)) * DEG);
    rows.push({
      altM,
      vs: measureStall(a, altM),
      vmax: measureVmax(a, altM),
      roc: roc.roc, rocV: roc.v, rocFlat: [roc.flatLo, roc.flatHi],
      corner,
      inst, sus, susSpeeds,
      susMax: Math.max(...sus), instMax: Math.max(...inst),
    });
  }
  return rows;
}

/* ------------------------------------------------------------ run summary -- */
/**
 * ARCHITECTURE §8.1's field names, exactly. They are the `stat` vocabulary star
 * conditions use. Combat, crates and levels are P5/P6/P9 — until those land, a
 * "level" is a synthetic patrol so the SHAPE is real and testable now.
 */
function runLevel({ level = 'synthetic', seed = 7, tier = 'competent', secs = 120, airframe = REFERENCE, zoom = 1 }) {
  const p = plane({ airframe, speed: 42, altM: 420, seed, tier, fuel: 100 });
  const timeInBand = Object.fromEntries(BANDS.map(b => [b.id, 0]));
  let stalls = 0, blackouts = 0, peakStress = 0, blackPrev = 0, abort = null;
  const plan = [
    ['hold', 300, 12], ['climb', 0, 14], ['hold', 900, 10], ['speed', 60, 8],
    ['turnUp', 0, 6], ['hold', 700, 10], ['dive', 1, 5], ['hold', 400, 12],
  ];
  let pi = 0, pt = 0;
  fly(p, secs, null, (ac, t) => {
    pt += DT;
    if (pt > plan[pi][2]) { pt = 0; pi = (pi + 1) % plan.length; p.pilot.setIntent(plan[pi][0], plan[pi][1]); }
    timeInBand[bandIdAt(ac.y)] += DT;
    peakStress = Math.max(peakStress, ac.stress);
    if (ac.stalled && !ac.wasStalled) stalls++;
    ac.wasStalled = ac.stalled;
    if (ac.blackout && !blackPrev) blackouts++;
    blackPrev = ac.blackout;
    const bad = tickInvariant(ac);
    if (bad) { abort = `tick ${Math.round(t / DT)}: ${bad}`; return false; }
    return true;
  });
  p.pilot.setIntent(plan[0][0], plan[0][1]);
  return {
    level, seed, pilot: tier, completed: !abort,
    time: +secs.toFixed(1), damageTaken: +p.ac.damageHP.toFixed(1), deaths: 0, kills: 0,
    cratesCaught: 0, cratesMissed: 0, shotsFired: 0, hits: 0, accuracy: 0,
    ammoLeft: 0, fuelLeft: +(p.ac.fuel / 100).toFixed(3),
    peakG: +peakStress.toFixed(2), stalls, blackouts,
    timeInBand: Object.fromEntries(Object.entries(timeInBand).map(([k, v]) => [k, +v.toFixed(1)])),
    difficulty: 0, abort,
  };
}

/**
 * ARCHITECTURE §8.1's per-tick invariants. The check itself lives in
 * js/sim/physics.js so the harness runs the SHIPPED assertion rather than a second
 * copy of it — P2 made the same call for the camera and it is the only reason the
 * result means anything. All this supplies is the altitude-dependent speed bound;
 * see docs/P4_NOTES.md §7 for why the literal `Vne * 1.05` cannot be used.
 */
const tickInvariant = (ac) => checkInvariants(ac.airframe, ac, terminalAt);

/** Local equilibrium of a vertical full-power dive. A bound, never a reported result. */
function terminalAt(a, altM) {
  const W = a.W, T = a.T0 * thrustFactor(altM, a), rho = density(altM, a);
  let lo = 10, hi = 400;
  for (let i = 0; i < 80; i++) {
    const m = (lo + hi) / 2;
    const D = 0.5 * rho * m * m * a.S * cd0Eff(m, a);
    (D < T + W) ? lo = m : hi = m;
  }
  return lo;
}

/* ------------------------------------------------------------- fixtures --- */

function hashState(vals) {
  let h = 2166136261 >>> 0;
  for (const v of vals) {
    const s = (Math.round(v * 1e6) | 0).toString(36);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function traceHash(p, secs, control) {
  const vals = [];
  fly(p, secs, control, (ac, t, i) => {
    if (i % 6 === 0) vals.push(ac.sx, ac.sy, ac.svx, ac.svy, ac.theta, ac.roll);
    return true;
  });
  return { hash: hashState(vals), ac: p.ac };
}

/**
 * DESIGN §10.8's fixtures, minus the ones that need combat or crates (P5/P6).
 * Each records its own state hash over its own trace — an earlier version hashed
 * one shared trace for all seven, so every fixture reported the same digest and
 * the hash check could not have caught anything.
 */
function trace(p, secs, control, extra = null) {
  const vals = [];
  let i = 0;
  fly(p, secs, control, (ac, t) => {
    if (i++ % 6 === 0) vals.push(ac.sx, ac.sy, ac.svx, ac.svy, ac.theta, ac.roll);
    return extra ? extra(ac, t) : true;
  });
  return hashState(vals);
}

const FIXTURES = {
  /** a 360 loop from 40 m/s */
  loop: () => {
    const p = plane({ speed: 40, altM: 700, seed: 11 });
    let turned = 0, prev = p.ac.gamma, secs = 0, alphaMax = 0;
    const hash = trace(p, 20, () => 1, (ac, t) => {
      turned += Math.abs(wrapPi(ac.gamma - prev)); prev = ac.gamma; secs = t;
      alphaMax = Math.max(alphaMax, Math.abs(ac.alphaW));
      return turned < Math.PI * 2;
    });
    return { hash, secs: +secs.toFixed(3), alphaMaxDeg: +(alphaMax * DEG).toFixed(2),
             assert: secs >= 4.0 && secs <= 6.2 && alphaMax * DEG <= 16.5 };
  },
  /** a deliberate stall turn — the limiter's escape hatch, not a scripted move */
  stallTurn: () => {
    const p = plane({ speed: 30, altM: 900, theta: -Math.PI / 2, seed: 3 });
    p.ac.svx = 0; p.ac.svy = -30;
    const th0 = p.ac.theta;
    let secs = 0, minV = 99, released = false;
    const hash = trace(p, 8, () => 1, (ac, t) => {
      secs = t; minV = Math.min(minV, ac.speedSI);
      released = released || ac.limiterReleased;
      return Math.abs(wrapPi(ac.theta - th0)) < Math.PI * 0.85;
    });
    return { hash, secs: +secs.toFixed(3), minV: +minV.toFixed(2), released,
             assert: minV < 24 && Math.abs(wrapPi(p.ac.theta - th0)) >= Math.PI * 0.85 && secs < 6 };
  },
  /** an Immelmann: half loop, then the auto-upright assist rolls you level */
  immelmann: () => {
    const p = plane({ speed: 62, altM: 400, seed: 5 });
    const h0 = p.ac.altM;
    let secs = 0;
    // pull until level again, heading the other way and on your back
    const hash = trace(p, 12, () => 1, (ac, t) => { secs = t; return !(Math.cos(ac.theta) < -0.9 && Math.abs(ac.svy) < 4); });
    const gain = p.ac.altM - h0;
    // then hands off: |gamma| under 25 deg and a neutral stick for 0.6 s and the
    // auto-upright assist half-rolls you level. Nothing else can change `roll`.
    fly(p, 3.5, () => 0);
    return { hash, gainM: +gain.toFixed(1), secs: +secs.toFixed(2), roll: +p.ac.roll.toFixed(2),
             assert: gain > 40 && secs < 3 && p.ac.roll < 0 };
  },
  /** a split-S: push through, lose height, end up going the other way */
  splitS: () => {
    const p = plane({ speed: 34, altM: 900, roll: -1, seed: 5 });
    const h0 = p.ac.altM;
    const hash = trace(p, 12, () => 1, (ac) => Math.cos(ac.theta) > -0.98);
    return { hash, lossM: +(h0 - p.ac.altM).toFixed(1), assert: h0 - p.ac.altM > 30 };
  },
  /** a 500 m glide, engine out */
  glide: () => {
    const p = plane({ speed: 32, altM: 500, tier: 'ace', seed: 9 });
    p.ac.engineOut = true;
    p.pilot.setIntent('glide');
    const x0 = p.ac.sx;
    const hash = trace(p, 240, null, (ac) => ac.altM > 2);
    const ld = (p.ac.sx - x0) / 500;
    return { hash, rangeM: +(p.ac.sx - x0).toFixed(0), ld: +ld.toFixed(2), assert: ld > 4 && ld < 12 };
  },
  /** a full-speed dive to Vne and the recovery */
  diveRecover: () => {
    const a = refAirframe();
    const p = plane({ speed: a.vne, altM: 1400, theta: Math.PI / 2, seed: 2 });
    p.ac.svx = 0; p.ac.svy = a.vne;
    const y0 = p.ac.sy;
    let yMax = y0, peakStress = 0;
    const hash = trace(p, 20, () => 1, (ac) => {
      yMax = Math.max(yMax, ac.sy); peakStress = Math.max(peakStress, ac.stress);
      return ac.svy > 0;
    });
    const extent = (yMax - y0) / M_PER_WU;
    return { hash, extentWu: +extent.toFixed(0), peakStress: +peakStress.toFixed(3),
             hullHP: +p.ac.damageHP.toFixed(1), assert: extent <= 1111 && p.ac.svy <= 0 };
  },
  /**
   * The stall's own recovery. This fixture exists because `--break no-stall-bias`
   * passed every other assert in the suite: the wing drop alone reverses the
   * aircraft, so the stall-turn fixture could not tell the pitch-down bias from
   * nothing at all. It asserts the thing the bias is FOR — that the nose falls
   * and the wing bites again while the stick is still held back.
   */
  stallRecover: () => {
    // A slow LEVEL entry, not a vertical one: entered vertically the aircraft
    // simply loops over the top at 18 m/s and never reaches the break.
    const p = plane({ speed: 18, altM: 900, seed: 17, noAssist: true });
    let broke = -1, back = -1, aMax = 0;
    const hash = trace(p, 9, () => 1, (ac, t) => {
      if (ac.stalled && broke < 0) broke = t;
      aMax = Math.max(aMax, Math.abs(ac.alphaW));
      if (broke >= 0 && back < 0 && Math.abs(ac.alphaW) < stallAlphaOf() * 0.7) back = t;
      return back < 0;
    });
    return { hash, brokeAt: +broke.toFixed(2), recoveredIn: back < 0 ? null : +(back - broke).toFixed(2),
             alphaMaxDeg: +(aMax * DEG).toFixed(1),
             assert: broke >= 0 && back > 0 && back - broke < 2.5 };
  },

  /**
   * The wing drop is seeded and picks a side. `--break fixed-drop` changed nothing
   * anywhere else in the suite, because every other fixture runs one seed and that
   * seed happened to draw the same side the broken build hardcodes.
   */
  stallSides: () => {
    let left = 0, right = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const p = plane({ speed: 18, altM: 900, seed, noAssist: true });
      const th0 = p.ac.theta;
      let d = 0, seen = false;
      fly(p, 6, () => 1, (ac) => {
        if (ac.stalled && !seen) { seen = true; return true; }        // the tick of the break
        if (seen && d === 0) d = ac.q;                                // the drop's own direction
        return d === 0;
      });
      if (d > 0) right++; else if (d < 0) left++;
    }
    return { hash: `${left}L/${right}R`, left, right, assert: left >= 3 && right >= 3 };
  },

  /** a landing at the §7.4 gate: engine out, held off, touching down slow */
  landing: () => {
    const p = plane({ speed: 30, altM: 120, tier: 'ace', seed: 9 });
    p.ac.engineOut = true;
    p.pilot.setIntent('speed', 24);
    let touched = null;
    const hash = trace(p, 60, null, (ac) => {
      if (ac.altM < 4) { touched = ac.speedSI; return false; }
      if (ac.altM < 40) p.pilot.setIntent('hold', 2);
      return true;
    });
    return { hash, touchdown: touched === null ? null : +touched.toFixed(1),
             assert: touched !== null && touched < 34 };
  },
};

/**
 * The anti-mock switches. Each one reverts exactly the thing a fixture or a gate
 * exists to protect, so `--break <name>` must go RED. DESIGN §10.8: a test that
 * still passes after you revert the fix was never testing the fix.
 */
const BREAKS = {
  'lift-body-axis': 'aero.js: resolve lift along the body normal instead of the wind axis',
  'no-limiter': 'flight.js: PITCH.alphaMargin 0.94 -> 1.6, the alpha limiter off',
  'no-margin': 'tables.js: AGILITY_MARGIN -> 1.0, the arcade margin removed',
  'flat-atmosphere': 'tables.js: H_SCALE -> 1e9, altitude stops costing anything',
  'no-flutter': 'airframe cFlutter -> 0, the high-speed drag rise removed',
  'no-stall-bias': 'flight.js: STALL_BIAS -> 0, the nose no longer falls',
  'fixed-drop': 'flight.js: the seeded wing drop replaced by a fixed side',
};

function runFixtures() {
  const out = {};
  for (const [name, fn] of Object.entries(FIXTURES)) out[name] = fn();
  return out;
}

/* ---------------------------------------------------------------- gates --- */

function gates() {
  const a = refAirframe();
  const rows = [];
  const add = (id, what, val, ok, note = '') => rows.push({ id, what, val, ok, note });

  const bandFails = checkBands();
  add('F13', 'band edges, §3.3 constraints', bandFails.length ? bandFails.join('; ') : 'all four hold', bandFails.length === 0);

  const vs = measureStall(a, 0);
  add('F2', 'stall, sea level', `${vs.toFixed(2)} m/s`, Math.abs(vs - 16.5) <= 1.0);

  const roc = measureRoC(a, 0);
  add('F3', 'best climb rate', `${roc.roc.toFixed(2)} m/s at ${roc.v} m/s (flat ${roc.flatLo}-${roc.flatHi})`,
      Math.abs(roc.roc - 13.5) <= 1.0);

  const vmax = measureVmax(a, 0);
  add('F4', 'level top speed', `${vmax.toFixed(2)} m/s`, Math.abs(vmax - 60) <= 2.0);

  const term = measureTerminal(a);
  const ratio = term / a.vne;
  add('F5', 'terminal > Vne', `${term.toFixed(2)} m/s = Vne x ${ratio.toFixed(3)} (Vne ${a.vne})`,
      ratio >= 1.02 && ratio <= 1.05);

  const cs = cornerStatic(a);
  const c = measureCorner(a);
  const circ = measureTurnCircle(a, cs.v);
  add('F6', 'combat turn diameter at corner', `${cs.diaWu.toFixed(0)} wu at corner ${cs.v.toFixed(1)} m/s, ${(cs.om * DEG).toFixed(1)} deg/s, ${cs.n.toFixed(2)} g`,
      cs.diaWu <= 286, `flown: peak ${(c.om * DEG).toFixed(1)} deg/s from ${c.lo.toFixed(1)} m/s, and the 360 it draws boxes ${circ.boxWu.toFixed(0)} wu`);

  const rec = measureDiveRecovery(a);
  add('F7', 'dive recovery from Vne', `${rec.extentWu.toFixed(0)} wu`, rec.done && rec.extentWu <= 1111);

  const instMax = cs.om;
  const sm = measureSusMax(a);
  const susMax = sm.om, susAt = sm.v;
  const gap = instMax / susMax;
  add('F8', 'instantaneous vs sustained', `${(instMax * DEG).toFixed(1)} / ${(susMax * DEG).toFixed(1)} deg/s at ${susAt} m/s = ${gap.toFixed(3)}`,
      gap >= 1.15 && gap <= 1.30);

  const bleedLo = measureBleed(a, cs.v);
  const bleedHi = measureBleed(a, c.hi);
  add('F9', 'energy bleed, max-rate turn', `${bleedLo.toFixed(2)} m/s at corner ${cs.v.toFixed(1)}; ${bleedHi.toFixed(2)} m/s at ${c.hi.toFixed(1)}`,
      bleedLo <= -7 && bleedLo >= -9, 'speed-dependent — see P4_NOTES §5');

  const s0 = measureSusMax(a, RIG_ALT).om, s13 = measureSusMax(a, 1350).om;
  const thin = s13 / s0;
  add('F10', 'thin air, sustained turn 1350 m / SL', `${(s13 * DEG).toFixed(1)} / ${(s0 * DEG).toFixed(1)} = ${thin.toFixed(3)}`,
      thin >= 0.62 && thin <= 0.72);

  const z = measureZoomClimb(a);
  add('F11', 'zoom climb from Vne', `${z.gainM.toFixed(0)} m in ${z.secs.toFixed(1)} s`,
      z.gainM >= 400 && z.gainM <= 460 && z.secs >= 8 && z.secs <= 11,
      `ideal drag-free is ${((a.vne * a.vne - vs * vs) / (2 * G_SI)).toFixed(0)} m — see P4_NOTES §6`);

  const h1 = traceHash(plane({ speed: 40, altM: 800, seed: 42 }), 8, (ac, t) => Math.sin(t * 1.7) * 0.8).hash;
  let same = true;
  const runs = num('runs', 200);
  for (let i = 0; i < runs; i++) {
    const h = traceHash(plane({ speed: 40, altM: 800, seed: 42 }), 8, (ac, t) => Math.sin(t * 1.7) * 0.8).hash;
    if (h !== h1) { same = false; break; }
  }
  add('F12', `determinism, ${runs} runs`, same ? `all ${h1}` : 'DIVERGED', same);

  const r078 = JSON.stringify(runLevel({ seed: 7, secs: 45, zoom: 0.78 }));
  const r122 = JSON.stringify(runLevel({ seed: 7, secs: 45, zoom: 1.22 }));
  add('F14', 'zoom neutrality', r078 === r122 ? 'byte-identical' : 'DIFFERENT', r078 === r122);

  const blessed = existsSync(join(ROOT, 'tools/BLESSED.md'));
  add('F15', 'anti-mock record', blessed ? 'tools/BLESSED.md present' : 'missing', blessed);

  return rows;
}

/* ======================= P5 — combat, AI and the Duel ===================== */

/**
 * C1. `tools/gates_purity.mjs` is the manager's and does not exist yet, so the
 * check lives here and walks the REAL module graph: it follows every relative
 * import out of `js/sim/**` and `js/modes/**`, strips comments and strings, and
 * asserts the forbidden identifiers appear nowhere. Grepping a hand-written file
 * list would pass the day somebody adds a file.
 */
const PURITY_FORBIDDEN = [
  'document', 'window', 'navigator', 'localStorage', 'sessionStorage', 'fetch',
  'performance', 'requestAnimationFrame', 'WebGL', 'canvas', 'Math.random', 'Date.now', 'new Date',
];
const PURITY_ROOTS = ['js/sim/crates.js',
                     'js/sim/entities.js', 'js/sim/weapons.js', 'js/sim/damage.js', 'js/sim/ai.js',
                      'js/sim/flight.js', 'js/sim/aero.js', 'js/sim/physics.js', 'js/sim/pilot.js',
                      'js/modes/duel.js'];

function stripCode(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

function purity() {
  const seen = new Set(), bad = [], graph = [];
  const visit = (rel) => {
    if (seen.has(rel)) return;
    seen.add(rel);
    const abs = join(ROOT, rel);
    if (!existsSync(abs)) { bad.push(`${rel}: missing`); return; }
    const raw = readFileSync(abs, 'utf8');
    const code = stripCode(raw);
    graph.push(rel);
    for (const tok of PURITY_FORBIDDEN) {
      const re = new RegExp('(^|[^\\w.$])' + tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w$])');
      if (re.test(code)) bad.push(`${rel}: ${tok}`);
    }
    if (/camera\.js/.test(code)) bad.push(`${rel}: imports core/camera.js`);
    const dir = dirname(rel);
    const im = code.matchAll(/from\s+'([^']+)'/g);
    for (const m of im) {
      const spec = m[1];
      if (!spec.startsWith('.')) { bad.push(`${rel}: bare import ${spec}`); continue; }
      visit(join(dir, spec).replace(/\\/g, '/'));
    }
  };
  for (const r of PURITY_ROOTS) visit(r);
  return { bad, files: graph.length };
}

/* ------------------------------------------------------- the gunnery rig -- */
/**
 * DPS on target, measured through the shipping guns, the shipping projectiles
 * and the shipping colliders. The geometry is HELD (both aircraft on the same
 * velocity, the nose exactly on the lead solution) because C2 asks for "on
 * target" — how long a burst that all arrives takes to kill. Dispersion, drop,
 * travel time, convergence and geometric allocation are all live; only the
 * flying is taken out, and it is taken out of BOTH sides equally.
 */
function gunRig({ gunId = 't2', shooterType = null, targetTypeId = 'kestrel', targetIsPlayer = false,
                  rangeM = 50, bearDeg = 180, speed = 45, maxSecs = 30, ctxBug = P5BUG, zoom = 1,
                  aimOffDeg = 0 } = {}) {
  const ctx = { rng: createRNG(99), bug: ctxBug, zoom };
  const world = createWorld(ctx, {});
  const sType = shooterType || playerType('kite_b1', gunId);
  const tType = targetIsPlayer ? playerType('kite_b1', 't1') : ENEMY_BY_ID[targetTypeId];
  const shooter = world.spawn(sType, { id: 'S', side: 0, xM: 0, yM: -500, speed, theta: 0 });
  const target = world.spawn(tType, { id: 'T', side: 1, xM: rangeM, yM: -500, speed, theta: 0 });
  if (shooter.gun) shooter.gun.fireCone = GUNS.coneHalf;
  target.wantsFire = false;
  if (target.turrets) target.turrets = null;
  const before = { ...target.hp };
  const b = bearDeg * Math.PI / 180;
  const LEAD = { x: 0, y: 0, t: 0, range: 0 };
  let t = 0, ticks = 0;
  const dt = DT;
  world.live.length = 0; world.live.push(shooter, target);
  while (t < maxSecs && !target.dead) {
    // hold the geometry: both aircraft on the same velocity vector
    const tf = target.flight, sf = shooter.flight;
    tf.sx += speed * dt; tf.svx = speed; tf.svy = 0; tf.theta = 0; tf.speedSI = speed;
    sf.sx = tf.sx + rangeM * Math.cos(b); sf.sy = tf.sy + rangeM * Math.sin(b);
    sf.svx = speed; sf.svy = 0; sf.speedSI = speed;
    leadPoint(sf, target, LEAD);
    sf.theta = Math.atan2(LEAD.y - sf.sy, LEAD.x - sf.sx) + aimOffDeg * Math.PI / 180;
    updateGun(world, shooter, world.live, dt);
    updateBullets(world, dt);
    updateDamage(target, dt, ctx);
    t += dt; ticks++;
  }
  const lost = {};
  for (const k of ['structure', ...COMPONENTS]) lost[k] = +(before[k] - target.hp[k]).toFixed(1);
  return { secs: +t.toFixed(3), killed: target.dead, fired: shooter.gun.fired, hits: shooter.gun.hits,
           acc: shooter.gun.fired ? +(shooter.gun.hits / shooter.gun.fired).toFixed(3) : 0,
           lost, dps: +((before.structure) / t).toFixed(1) };
}

/* --------------------------------------------------------- duel batches --- */

function duelBatch({ ace = 'A10', airframe = 'kite_b1', gun = 't2', runs = 200, counter = null,
                     k = 0.70, seed0 = 1000, coolHand = false, ctxBug = P5BUG, zoom = 1,
                     swapAlternate = true } = {}) {
  let won = 0, lost = 0, drawn = 0, shots = 0, hits = 0, time = 0;
  const ttk = [], causes = [];
  for (let i = 0; i < runs; i++) {
    const d = createDuel({ bug: ctxBug, zoom }, { ace, airframe, gun, seed: seed0 + i, counter, k, coolHand,
                                                  swap: swapAlternate && (i & 1) === 1 });
    d.world.ctx.bug = ctxBug; d.world.ctx.zoom = zoom;
    const r = d.run();
    if (r.winner === 'player') won++; else if (r.winner === 'ace') lost++; else drawn++;
    shots += r.shots; hits += r.hits; time += r.time;
    for (const x of r.ttk) ttk.push(x);
    causes.push(r.cause);
  }
  ttk.sort((a, b) => a - b);
  // Win rate is over DECISIVE duels. A best-of-three that ends level is not
  // half a loss, and counting draws in the denominator makes a stalemating ace
  // (S2 exists to stalemate) read as a beating.
  const decisive = Math.max(1, won + lost);
  return {
    ace, airframe, gun, runs, won, lost, drawn,
    draw: +(drawn / runs).toFixed(3),
    win: +(won / decisive).toFixed(4),
    meanTTK: ttk.length ? +(ttk.reduce((a, b) => a + b, 0) / ttk.length).toFixed(1) : 0,
    p90TTK: ttk.length ? +ttk[Math.min(ttk.length - 1, Math.floor(ttk.length * 0.9))].toFixed(1) : 0,
    rounds: shots, acc: shots ? +(hits / shots).toFixed(3) : 0,
    meanTime: +(time / runs).toFixed(1),
    modalLoss: modeOf(causes),
  };
}

function modeOf(a) {
  const c = Object.create(null); let best = '', bn = 0;
  for (const x of a) { const n = (c[x] = (c[x] || 0) + 1); if (n > bn) { bn = n; best = x; } }
  return best;
}

/** Which airframes exist by an ace's act, and what the act's intended gun is. */
const airframesByAct = (act) => AIRFRAMES.filter(a => a.act <= act).map(a => a.id);

/* ------------------------------------------------------- the duel matrix -- */

function duelMatrix(runs = 200) {
  const rows = [];
  for (const id of ACE_IDS) {
    const p = ACES[id];
    const intended = INTENDED[p.act];
    for (const af of airframesByAct(p.act)) {
      rows.push(duelBatch({ ace: id, airframe: af, gun: intended.gun, runs }));
    }
  }
  return rows;
}

/**
 * C6, and the only part of this phase that can lie to itself. The counter bot
 * and the baseline bot are THE SAME BOT with the same `k`, the same airframe and
 * the same guns; the single difference is a scripted tactic. `--placebo` runs
 * two deliberately irrelevant scripts through the identical machinery: if a
 * figure-of-eight is also "worth 18 points", the harness is measuring bot
 * quality and every counter number in the table is worthless.
 */
function counterplay(runs = 200, placebo = false) {
  const rows = [];
  for (const id of ACE_IDS) {
    const p = ACES[id];
    const intended = INTENDED[p.act];
    const opts = { ace: id, airframe: intended.airframe, gun: intended.gun, runs };
    const base = duelBatch({ ...opts, counter: null, seed0: 5000, swapAlternate: true });
    const scripts = placebo ? ['placeboA', 'placeboB'] : [p.counter];
    for (const sc of scripts) {
      if (!sc) { rows.push({ ace: id, counter: null, base: base.win, with: base.win, delta: 0,
                             exempt: p.counterIsSkill ? 'no tactic — the ace IS the skill check'
                                   : p.counterIsBuild ? "your own build's weakness, by design"
                                   : 'unstated' }); continue; }
      const withC = duelBatch({ ...opts, counter: sc, seed0: 5000, swapAlternate: true });
      rows.push({ ace: id, counter: sc, base: base.win, with: withC.win,
                  delta: +((withC.win - base.win) * 100).toFixed(1),
                  needsCrates: !!p.needsCrates });
    }
  }
  return rows;
}

/* ------------------------------------------------------------ flee rate --- */
/**
 * C8 / register T24. A duel is the wrong place to measure it — an ace has 0.85+
 * morale and a 1v1 has no wingman to lose. This is a squadron patrol: six
 * ordinary hostiles against a player bot, which is the situation §5.2's morale
 * table was written for.
 */
function fleeRate({ runs = 60, secs = 120, n = 6, seed0 = 700 } = {}) {
  let spawned = 0, fled = 0, killed = 0, alive = 0, minMorale = 9, bugT = 0;
  for (let r = 0; r < runs; r++) {
    const ctx = { rng: createRNG(seed0 + r), bug: P5BUG };
    const world = createWorld(ctx, {});
    world.arena.halfW = 1400;
    const p = world.spawn(playerType('kite_b1', 't2'), { id: 'player', side: 0, xM: 0, yM: -450, speed: 45, theta: 0, morale: 1, k: 0.72 });
    p.ai = createAI(p, { k: 0.72, aggro: 1.4 });
    const types = ['kestrel', 'kestrel', 'wasp', 'kestrel', 'shrike', 'wasp'];
    const es = [];
    for (let i = 0; i < n; i++) {
      const e = world.spawn(ENEMY_BY_ID[types[i % types.length]], {
        id: 'e' + i, side: 1, xM: 300 + i * 55, yM: -430 - (i % 3) * 40, speed: 45, theta: Math.PI,
        morale: 0.50 + (i % 4) * 0.13, k: 0.45 + (i % 3) * 0.1, aggro: 0.8 + (i % 3) * 0.5,
      });
      e.ai = createAI(e, { k: e.k, aggro: e.aggro });
      es.push(e);
      spawned++;
    }
    const nT = Math.round(secs / DT);
    for (let i = 0; i < nT; i++) {
      world.update(DT);
      for (const e of es) {
        if (!e.alive) continue;
        const f = e.flight;
        if (Math.abs(f.sx) > world.arena.halfW) {
          if (e.ai.state === 'BUG_OUT') { e.fled = true; fled++; world.despawn(e); }
          else { f.sx = Math.sign(f.sx) * (world.arena.halfW - 1); f.svx = -f.svx * 0.6; f.theta = Math.atan2(f.svy, f.svx); }
        }
      }
      if (!p.alive || p.dead) break;
    }
    for (const e of es) {
      if (!e.alive && !e.fled) killed++; else if (e.alive && !e.fled) alive++;
      if (e.alive) minMorale = Math.min(minMorale, e.morale);
      bugT += e.ai && e.ai.stats.states.BUG_OUT ? e.ai.stats.states.BUG_OUT : 0;
    }
  }
  return { spawned, fled, killed, alive, rate: +(fled / spawned).toFixed(4),
           minMorale: +minMorale.toFixed(3), bugOutDecisions: bugT };
}

/* ------------------------------------------------------------- fixtures --- */

const P5_FIXTURES = {
  /** Where a bullet lands, from four aspects. Nobody is ever told this. */
  hitAspect: () => {
    const astern = gunRig({ bearDeg: 180, rangeM: 45 });
    const asternLow = gunRig({ bearDeg: 160, rangeM: 45 });
    const above = gunRig({ bearDeg: 250, rangeM: 45 });
    const front = gunRig({ bearDeg: 0, rangeM: 45 });
    // The criterion is the PATTERN §3.1's "hit from" column describes, not a
    // magnitude ordering: an ordering assert failed because dead astern also
    // reaches the tank once the tail is gone, which is correct behaviour.
    const ok = asternLow.lost.fuel > 0 && asternLow.lost.pilot === 0
            && above.lost.wingU > 0 && above.lost.fuel === 0 && above.lost.tail === 0
            && front.lost.engine > 0 && front.lost.tail === 0
            && astern.lost.tail > 0 && front.lost.tail === 0;
    return { assert: ok, astern: astern.lost, asternLow: asternLow.lost, above: above.lost, front: front.lost };
  },

  /** C2's number, and the whole of "concentrate your fire". */
  timeToKill: () => {
    const r = gunRig({ gunId: 't2', targetTypeId: 'kestrel', rangeM: 50, bearDeg: 180 });
    return { assert: r.killed && r.secs >= 0.4 && r.secs <= 0.8, secs: r.secs, fired: r.fired, hits: r.hits, acc: r.acc };
  },

  /** §2.6's straddle: two guns crossing at 40 m spread the volley when you ram. */
  straddle: () => {
    const far = gunRig({ gunId: 't2', rangeM: 55, bearDeg: 180 });
    const near = gunRig({ gunId: 't2', rangeM: 8, bearDeg: 180 });
    return { assert: near.secs > far.secs, farSecs: far.secs, nearSecs: near.secs,
             ratio: +(near.secs / far.secs).toFixed(2) };
  },

  /** §3.2: a fire is put out by diving above 70 m/s for 3 s — and only then. */
  fireOut: () => {
    const ctx = { rng: createRNG(31), bug: P6BUG };
    const world = createWorld(ctx, {});
    const e = world.spawn(playerType('kite_b1', 't2'), { id: 'p', side: 0, xM: 0, yM: -1100, speed: 45, theta: 0 });
    e.burning = true; e.fireT = 0; e.blowT = 0;
    const hp0 = e.hp.structure;
    let outAt = -1, peakV = 0;
    for (let i = 0; i < 60 * 14; i++) {
      e.pilot.setIntent('dive', 1);
      e.pilot.update(DT, e.flight);
      e.flight.update(DT);
      updateDamage(e, DT, ctx);
      peakV = Math.max(peakV, e.flight.speedSI);
      if (!e.burning && outAt < 0) { outAt = i * DT; break; }
      if (e.dead) break;
    }
    const glide = createWorld({ rng: createRNG(31) }, {});
    const g = glide.spawn(playerType('kite_b1', 't2'), { id: 'p', side: 0, xM: 0, yM: -900, speed: 40, theta: 0 });
    g.burning = true;
    let died = false;
    for (let i = 0; i < 60 * 14; i++) {
      g.pilot.setIntent('level'); g.pilot.update(DT, g.flight); g.flight.update(DT);
      updateDamage(g, DT, { rng: glide.rng });
      if (g.dead) { died = true; break; }
    }
    return { assert: outAt > 0 && outAt < 9 && died, outAt: +outAt.toFixed(2), peakV: +peakV.toFixed(1),
             structLost: +(hp0 - e.hp.structure).toFixed(1), levelFlightKills: died };
  },

  /** §5.2's element: wingmen hold station until the leader engages, then split. */
  elementSplit: () => {
    const ctx = { rng: createRNG(17) };
    const world = createWorld(ctx, {});
    world.arena.halfW = 1400;
    const p = world.spawn(playerType('kite_b1', 't2'), { id: 'player', side: 0, xM: -1200, yM: -450, speed: 45, theta: 0, morale: 1, k: 0.72 });
    p.ai = createAI(p, { k: 0.72, aggro: 1.4 });
    const lead = world.spawn(ENEMY_BY_ID.shrike, { id: 'lead', side: 1, xM: 1200, yM: -450, speed: 45, theta: Math.PI, morale: 0.9, k: 0.8 });
    lead.ai = createAI(lead, { profile: ACES.A11, k: 0.82, aggro: 1.2 });
    const w1 = world.spawn(ENEMY_BY_ID.kestrel, { id: 'w1', side: 1, xM: 1240, yM: -468, speed: 45, theta: Math.PI, morale: 0.8, k: 0.6 });
    w1.ai = createAI(w1, { k: 0.6, aggro: 1.2 });
    const form = createFormation(lead, [w1], 'finger4');
    let heldWhileCruising = 0, splitAfterEngage = 0, promoteQuiet = -1;
    for (let i = 0; i < 60 * 60; i++) {
      world.update(DT); form.update(DT, world);
      const leaderEngaged = lead.alive && !lead.dead && (lead.ai.state === 'ENGAGE' || lead.ai.state === 'ATTACK_RUN');
      if (!leaderEngaged && w1.ai && w1.ai.holding) heldWhileCruising++;
      if (leaderEngaged && w1.ai && !w1.ai.holding) splitAfterEngage++;
      if ((!lead.alive || lead.dead) && promoteQuiet < 0 && w1.alive) {
        let quiet = 0;
        for (let j = 0; j < 60 * 3; j++) {
          world.update(DT); form.update(DT, world);
          if (w1.ai.promoteT > 0) quiet += DT;
        }
        promoteQuiet = quiet;
        break;
      }
    }
    return { assert: heldWhileCruising > 60 && splitAfterEngage > 60,
             heldTicks: heldWhileCruising, splitTicks: splitAfterEngage,
             promoteQuiet: promoteQuiet < 0 ? null : +promoteQuiet.toFixed(2) };
  },

  /**
   * The cone is what makes auto-fire an assist rather than an aimbot: nose 20 deg
   * off the solution and the guns stay silent, however much you would like them
   * not to. `--break no-cone` opens it to 90 deg and this goes red.
   */
  coneStrict: () => {
    const on = gunRig({ gunId: 't2', rangeM: 50, bearDeg: 180, aimOffDeg: 0, maxSecs: 4 });
    const off = gunRig({ gunId: 't2', rangeM: 50, bearDeg: 180, aimOffDeg: 20, maxSecs: 4 });
    return { assert: on.fired > 0 && off.fired === 0, onNose: on.fired, off20deg: off.fired };
  },

  /**
   * `k` must be monotone: a worse pilot must lose more duels. It was NOT, twice —
   * once because P4's `ace` pilot tier flies worse than `competent`, and once
   * because the aim error was resampled every tick and averaged to nothing over
   * a burst. `--break aim-noise-per-tick` restores the second failure.
   */
  kMonotone: () => {
    // Measured on the MIRROR, where the win rate sits mid-band and has room to
    // move. A10's cell reads 86% at every k, and a ceiling cannot show a gradient.
    const at = (k) => {
      const save = ACES.A12.k; ACES.A12.k = k;
      const r = duelBatch({ ace: 'A12', airframe: 'kitehawk', gun: 't5', runs: 70, seed0: 77000 });
      ACES.A12.k = save; return r.win;
    };
    const lo = at(0.25), hi = at(0.95);
    return { assert: lo - hi >= 0.10, winVsK025: +lo.toFixed(3), winVsK095: +hi.toFixed(3),
             gapPts: +((lo - hi) * 100).toFixed(1) };
  },

  /**
   * The lock must not strobe. Register T13 wants fewer than 4 changes per 10 s.
   *
   * The scenario is KINEMATIC — the shooter and three targets are placed on
   * prescribed paths that carry each target across the +-11 deg cone edge — and
   * the assert is DIFFERENTIAL, run once with `no-hysteresis` live. Both were
   * forced. An emergent dogfight put every candidate permanently inside the cone,
   * so the hysteresis branch never executed and the fixture read the same number
   * with the feature and without it; and it read the same number again after the
   * AI's aim changed, because the flight paths moved. A criterion that depends on
   * what the AI happens to do cannot guard a rule about what the LOCK does.
   */
  lockStability: () => {
    const run = (bug) => {
      const ctx = { rng: createRNG(23), bug };
      const world = createWorld(ctx, {});
      const shooter = world.spawn(playerType('kite_b1', 't2'), { id: 'player', side: 0, xM: 0, yM: -450, speed: 45, theta: 0 });
      shooter.gun.fireCone = GUNS.coneHalf;
      const tgts = [];
      for (let i = 0; i < 3; i++) {
        tgts.push(world.spawn(ENEMY_BY_ID.kestrel, { id: 'e' + i, side: 1, xM: 40, yM: -450, speed: 45, theta: 0 }));
      }
      const live = [shooter, ...tgts];
      world.live.length = 0; for (const e of live) world.live.push(e);
      const n = Math.round(10 / DT);
      for (let i = 0; i < n; i++) {
        const t = i * DT;
        const sf = shooter.flight;
        sf.sx += 45 * DT; sf.svx = 45; sf.svy = 0; sf.theta = 0; sf.speedSI = 45;
        // three targets weaving ACROSS the cone edge at different periods: the
        // cone half-angle is 11 deg, so +-9 m of cross-track at 45 m puts each
        // of them in and out of it several times in ten seconds
        for (let j = 0; j < 3; j++) {
          const f = tgts[j].flight;
          f.sx = sf.sx + 42 + j * 3;
          f.sy = sf.sy + 9.0 * Math.sin(t * (1.7 + j * 0.6) + j * 2.1);
          f.svx = 45; f.svy = 0; f.speedSI = 45; f.theta = 0;
        }
        updateGun(world, shooter, world.live, DT);
        // What the 0.40 s hold actually DOES is refuse to re-lock, and therefore
        // refuse to fire, while a lost target might come back. Counting lock
        // CHANGES cannot see it — the change still happens, 0.4 s later — which
        // is why this fixture read the same number with the feature and without
        // it twice over. Count the suppression instead.
        let inCone = false;
        for (let j = 0; j < 3; j++) {
          const f = tgts[j].flight;
          const d = Math.hypot(f.sx - sf.sx, f.sy - sf.sy);
          if (d <= shooter.gun.tier.range && Math.abs(offNose(sf, f.sx, f.sy)) <= GUNS.coneHalf) inCone = true;
        }
        if (inCone && !shooter.target) hold++;
      }
      return { changes: shooter.gun.lockChanges, holdTicks: hold };
    };
    let hold = 0;
    const a = run(''); const h1 = hold; hold = 0;
    const b = run('no-hysteresis'); const h2 = hold;
    return { assert: h1 > h2 && b.changes >= a.changes,
             changesPer10s: a.changes, withoutHysteresis: b.changes,
             holdTicks: h1, holdTicksWithout: h2,
             note: `T13 target < 4; the 0.40 s hold suppresses ${(h1 / 60).toFixed(2)} s of firing per 10 s, ${(h2 / 60).toFixed(2)} s without it` };
  },

  /**
   * The recycle contract. `flight.js` has no reset and forks its RNG once, so a
   * pooled slot could carry state between duels. Same duel, run alone and run
   * after fifty others: the summaries must be identical.
   */
  recycle: () => {
    const alone = JSON.stringify(createDuel({}, { ace: 'A2', seed: 4242 }).run());
    for (let i = 0; i < 50; i++) createDuel({}, { ace: 'A5', seed: i }).run();
    const after = JSON.stringify(createDuel({}, { ace: 'A2', seed: 4242 }).run());
    return { assert: alone === after, identical: alone === after };
  },

  /**
   * C10. One world, 60 duels through it, counting every pooled object ever
   * constructed. A per-duel world would allocate its pools 60 times and prove
   * nothing at all — the gate runs the same measurement over 200.
   */
  noAllocation: () => {
    const g = allocGrowth(60);
    return { assert: g.growth === 0, warmUpObjects: g.warm, afterTwentyDuels: g.base,
             growthOverRemaining: g.growth };
  },
};

function runP5Fixtures() {
  const out = {};
  for (const [k, fn] of Object.entries(P5_FIXTURES)) out[k] = fn();
  return out;
}

/* ---------------------------------------------------------------- gates --- */

function p5Gates(runs = num('runs', 200)) {
  const rows = [];
  const add = (id, what, val, ok, note = '') => rows.push({ id, what, val, ok, note });

  const pur = purity();
  add('C1', 'purity across the sim graph', pur.bad.length ? pur.bad.join('; ') : `${pur.files} files clean`, pur.bad.length === 0);

  const ttk = gunRig({ gunId: 't2', targetTypeId: 'kestrel', rangeM: 50, bearDeg: 180 });
  const onPlayer = gunRig({ gunId: 't1', shooterType: ENEMY_BY_ID.kestrel, targetIsPlayer: true, rangeM: 50, bearDeg: 180, maxSecs: 60 });
  add('C2', 'time-to-kill, on target', `scout ${ttk.secs.toFixed(2)} s (${ttk.hits}/${ttk.fired}); player ${onPlayer.secs.toFixed(2)} s`,
      ttk.killed && ttk.secs >= 0.4 && ttk.secs <= 0.8 && onPlayer.secs > 6);
  const ratio = onPlayer.secs / ttk.secs;
  add('C3', 'player lethality ratio', `${ratio.toFixed(1)}x`, ratio >= 10 && ratio <= 18);

  const mat = duelMatrix(runs);
  const intendedRows = mat.filter(r => r.airframe === INTENDED[ACES[r.ace].act].airframe);
  const c4bad = intendedRows.filter(r => r.win < 0.55 || r.win > 0.70);
  add('C4', 'intended tier wins 55-70%', c4bad.length ? c4bad.map(r => `${r.ace}:${(r.win * 100).toFixed(0)}%`).join(' ') : `${intendedRows.length}/${intendedRows.length} in band`,
      c4bad.length === 0);

  const side = mat.filter(r => !(ACES[r.ace].counterIsBuild));
  const outByAce = new Map();
  for (const r of side) {
    if (r.win < 0.45 || r.win > 0.65) outByAce.set(r.ace, (outByAce.get(r.ace) || 0) + 1);
  }
  add('C5', 'sidegrades 45-65% on every act-appropriate ace',
      outByAce.size ? [...outByAce.keys()].map(a => `${a}(${outByAce.get(a)})`).join(' ') : 'all inside',
      outByAce.size <= 2, `${side.length} airframe x ace cells`);

  const cp = counterplay(runs, false);
  const measured = cp.filter(r => r.counter && !r.needsCrates);
  const weak = measured.filter(r => r.delta < 18);
  add('C6', 'counter-play >= 18 points', weak.length ? weak.map(r => `${r.ace}:${r.delta}`).join(' ') : `${measured.length}/${measured.length} >= 18`,
      weak.length === 0, `${cp.filter(r => r.needsCrates).length} need crates (P6); ${cp.filter(r => !r.counter).length} exempt`);

  /**
   * A12 mirrors "the player's loadout", and the player's loadout is whichever
   * airframe they are flying — so the row is measured across ALL FIVE and pooled.
   * Measuring one airframe at n=120 is an airframe lottery: the same kitehawk
   * cell reads 39.3%, 48.1% and 52.4% on three seed sets, all of them within
   * their own +-4.2. Pooled, the five rows have five times the n and no lottery.
   */
  let mw = 0, ml = 0; const mrows = [];
  for (const af of AIRFRAMES) {
    const r = duelBatch({ ace: 'A12', airframe: af.id, gun: 't5', runs, seed0: 9000 });
    mw += r.won; ml += r.lost;
    mrows.push(`${af.id} ${(r.win * 100).toFixed(0)}%`);
  }
  const mirror = { win: mw / Math.max(1, mw + ml), rows: mrows };
  const se = 100 * Math.sqrt(0.25 / Math.max(1, mw + ml));
  add('C7', 'the mirror ace at k 0.90, all five airframes',
      `${(mirror.win * 100).toFixed(1)}% of ${mw + ml} decisive (+-${se.toFixed(1)})`,
      mirror.win >= 0.48 && mirror.win <= 0.52, mrows.join('  '));

  const fl = fleeRate({ runs: Math.max(12, Math.round(runs / 8)) });
  add('C8', 'flee rate 12-22%', `${(fl.rate * 100).toFixed(1)}% (${fl.fled}/${fl.spawned})`, fl.rate >= 0.12 && fl.rate <= 0.22);

  const z078 = JSON.stringify(duelBatch({ ace: 'A10', runs: 12, seed0: 300, zoom: 0.78 }));
  const z122 = JSON.stringify(duelBatch({ ace: 'A10', runs: 12, seed0: 300, zoom: 1.22 }));
  add('C9', 'zoom neutrality of duel summaries', z078 === z122 ? 'byte-identical' : 'DIFFERENT', z078 === z122);

  const w = createDuel({}, { ace: 'A10', seed: 1 }).world;
  for (let i = 0; i < 20; i++) { const d = createDuel({}, { ace: ACE_IDS[i % ACE_IDS.length], seed: i }); d.world = w; }
  const alloc = allocGrowth(200);
  add('C10', 'no entity allocation after warm-up', `warm ${alloc.warm}, then +${alloc.growth} over ${alloc.duels} duels`, alloc.growth === 0);

  return { rows, matrix: mat, counter: cp, flee: fl, mirror };
}

/**
 * C10 measured honestly: one world, 200 duels through it, counting every pooled
 * object ever constructed. A per-duel world would allocate its pools 200 times
 * and prove nothing.
 */
function allocGrowth(duels = 200) {
  const ctx = { rng: createRNG(5) };
  const world = createWorld(ctx, {});
  const warm = world.alloc.aircraft + world.alloc.bullets + world.alloc.chutes;
  const total = () => world.alloc.aircraft + world.alloc.bullets + world.alloc.chutes;
  const pType = playerType('kite_b1', 't2');
  let base = 0;
  for (let d = 0; d < duels; d++) {
    world.reset();
    const p = world.spawn(pType, { id: 'player', side: 0, xM: -400, yM: -400, speed: 40, theta: 0, k: 0.7 });
    p.ai = createAI(p, { k: 0.7, aggro: 1.2 });
    const aid = ACE_IDS[d % ACE_IDS.length];
    const a = world.spawn(ENEMY_BY_ID.shrike, { id: 'ace', side: 1, xM: 400, yM: -400, speed: 40, theta: Math.PI, k: ACES[aid].k, morale: ACES[aid].morale });
    a.ai = createAI(a, { profile: ACES[aid], k: ACES[aid].k });
    for (let i = 0; i < 60 * 20 && !p.dead && !a.dead; i++) world.update(DT);
    if (d === 19) base = total();      // twenty duels of warm-up
  }
  return { warm, duels, growth: total() - base, base, end: total() };
}


/* ========================================================================== */
/* P6 — the parachute crates                                                  */
/* ========================================================================== */
/**
 * Everything below MEASURES the shipping `js/sim/crates.js`. The two things
 * this section refuses to do, both for the same reason DESIGN §10.4 gives:
 *
 *   1. the reachability solver contains no fallback, no clamp and no
 *      "if unreachable, move the drop point" — a gate that passed because of a
 *      workaround inside it once hid a third of a map being unreachable;
 *   2. no constant is re-declared here. `CRATE`, `SMALL_ARMS`, `LADDER` and the
 *      contents table are imported, and the airframe numbers the reach cone
 *      needs are MEASURED off the real model, never typed.
 */

/** The airframe's real capability, measured once. The reach cone's only input. */
const ENV_CACHE = new Map();
function crateEnv(a) {
  if (ENV_CACHE.has(a.id)) return ENV_CACHE.get(a.id);
  const roc = measureRoC(a, 400);
  const env = {
    roc: roc.roc, climbSpeed: roc.v,
    vmax: measureVmax(a, 400),
    vdive: measureTerminal(a, 400, true),
  };
  ENV_CACHE.set(a.id, env);
  return env;
}

/**
 * The gate levels. Crate beats carry `y` where the canopy is ALREADY OPEN
 * (ARCHITECTURE §7.1), i.e. near the top of the playable column, because the
 * drop itself happens at the Concord Line 4,000 m up and out of reach (D28).
 */
const CRATE_LEVELS = {
  /** The reference: a transport lane over no-man's-land, one steady wind. */
  /**
   * The reference. §4.1's "mistimed drop": the crates start on the WRONG side of
   * the line and only the wind can save them, which is what makes doing nothing
   * a real choice with a real price. The friendly side is x < 0; the wind blows
   * -x, so a crate that stays up drifts home and a crate cut early does not.
   */
  'k-drop': {
    id: 'k-drop', lineX: 0, actMult: 1,
    wind: [[0, -4.5], [300, -5], [900, -5.5], [1500, -5.5]],
    spawnX: -500, spawnAltM: 500,
    drops: [[0, 250, 1450], [9, 340, 1455], [18, 430, 1445], [27, 520, 1450],
            [36, 610, 1450], [45, 700, 1455], [54, 790, 1445], [63, 880, 1450]],
    nests: [0, 400, 800, 1200],
    enemies: 3, secs: 200,
  },
  /**
   * DESIGN §4.6.1 "The Shear", act 3 level 48, verbatim: +9 at 500 m, +2 at
   * 300 m, -6 at 150 m. It is the level that only works because a crate falls
   * slowly through a wind that changes with height.
   */
  'k-shear': {
    id: 'k-shear', lineX: 0, actMult: 1.6,
    wind: [[0, -6], [150, -6], [300, 2], [500, 9], [1500, 9]],
    spawnX: -600, spawnAltM: 520,
    drops: [[0, -900, 1450], [8, -820, 1450], [16, -740, 1450], [24, -660, 1450],
            [32, -580, 1450], [40, -500, 1450], [48, -420, 1450], [56, -340, 1450]],
    nests: [200, 620, 1040, 1460],
    enemies: 3, secs: 210,
  },
};

/** Build a world with a crate field, the level's nests, and the hostiles. */
function crateWorld(L, opts = {}) {
  const seed = opts.seed ?? 1;
  const ctx = { rng: createRNG(seed), bus: opts.bus || null, bug: opts.ctxBug || P6BUG || P5BUG, zoom: opts.zoom ?? 1 };
  const world = createWorld(ctx, {});
  world.arena.lineX = L.lineX;
  const af = opts.airframe || REFERENCE;
  const field = createCrateField(world, {
    wind: L.wind, lineX: L.lineX, actMult: L.actMult,
    gustPhase: 0.7, gustSeed: seed * 7919,
    engage: { 1: opts.engage || 'none', '-1': 'none' },
    groundFire: opts.groundFire !== false,
  });

  const player = world.spawn(playerType(af.id, opts.gun || 't2'),
    { id: 'player', side: 1, xM: L.spawnX, yM: -L.spawnAltM, speed: 42, theta: 0,
      k: 0.70, morale: 1, aggro: 1.2 });
  player.noFlee = true;
  player.ai = createAI(player, { k: 0.70, aggro: 1.2 });
  player.cratePolicy = opts.policy || { run: false };
  if (opts.silkBand) player.silkBand = opts.silkBand;

  for (let i = 0; i < (opts.enemies ?? L.enemies); i++) {
    const t = ENEMY_BY_ID[i === 0 ? 'wasp' : 'kestrel'];
    const e = world.spawn(t, { id: 'red' + i, side: -1, xM: L.lineX + 500 + i * 130,
                               yM: -(430 + i * 70), speed: 42, theta: Math.PI, k: 0.60 });
    if (e) { e.ai = createAI(e, { k: 0.60 }); e.cratePolicy = { run: true }; }
  }

  if (opts.groundFire !== false) for (const x of L.nests) field.addNest(x, -1);

  /**
   * §4.5's spawns are real aeroplanes arriving at the map edge, not a counter —
   * and the map edge is where the PLAYER is, not a fixed coordinate. Pinned at
   * `lineX + 900` they spawned into empty sky a kilometre behind an aeroplane
   * that had flown on, and losing three crates then changed the death rate by
   * exactly 0.0 points on every seed. A reinforcement that cannot find you is a
   * counter on a ledger, which is the precise thing §4.5 says it must not be.
   */
  /**
   * STAGGERED, and the id carries the ordinal. `flushPending` fires every
   * pending reinforcement in ONE tick — which is what a level that starts
   * behind must do — so `world.t` is the same for all of them and so was the
   * spawn point. Two aeroplanes then materialised inside each other: the
   * collision radius is 5.2 m and a contact costs 60 HP a tick, so a 60 HP
   * kestrel was dead on the frame it arrived. The gate still read the treatment
   * as DELIVERED, because the carcasses stay in `world.live` for ~20 s and the
   * selector was counting enemy-seconds.
   *
   * The spacing is the level's own: `crateWorld` lines its opening enemies up
   * at 130 m in x and 70 m in y and they have never collided. 130 m against a
   * 5.2 m radius is 25x. The id was `'rein' + world.t.toFixed(1)`, which
   * collided in `byIdMap` for the same reason.
   */
  let reinforced = 0;
  field.onReinforce = (typeId) => {
    const t = ENEMY_BY_ID[typeId];
    if (!t) return;
    const i = P6BUG === 'rein-stacked' ? 0 : reinforced;
    reinforced++;
    const dir = Math.cos(player.flight.theta) >= 0 ? 1 : -1;
    const e = world.spawn(t, { id: 'rein' + i, side: -1,
                               xM: player.flight.sx + dir * (800 + i * 130),
                               yM: player.flight.sy - 60 - i * 70,
                               speed: 44, theta: dir > 0 ? Math.PI : 0, k: 0.62 });
    if (e) { e.ai = createAI(e, { k: 0.62 }); e.cratePolicy = { run: true }; e.dmgMult = field.dmgMult; }
  };

  return { world, field, player, af, L, ctx, reinforcedAt: () => reinforced };
}

/** Run one crate mission. Everything the gates read comes out of here. */
function crateMission(opts = {}) {
  const L = CRATE_LEVELS[opts.level || 'k-drop'];
  const R = crateWorld(L, opts);
  const { world, field, player } = R;
  const secs = opts.secs ?? L.secs;
  const n = Math.round(secs / DT);
  let di = 0, dead = false, deadAt = 0, redSeconds = 0;
  const dropped = [];
  /**
   * "Losing three crates" is a state the level is ALREADY IN, so the aeroplanes
   * those crates bought are on the map from tick zero. Left on §4.5's 8 s spawn
   * delay they arrived after the first engagement had already decided the
   * sortie, and the death rate moved 0.0 points on every seed — the ladder
   * looked like decoration because the instrument delivered it late.
   */
  for (let k = 0; k < (opts.preLost || 0); k++) field.advanceLadder();
  if (opts.preLost) field.flushPending();

  for (let i = 0; i < n; i++) {
    const t = i * DT;
    while (!opts.noDrops && di < L.drops.length && L.drops[di][0] <= t) {
      const d = L.drops[di++];
      const c = field.drop({ xM: d[1], yM: -d[2], kind: opts.forceKind || undefined });
      if (c) dropped.push(c.id);
    }
    world.update(DT);
    /**
     * The arena, as §7.5's duel has one and for the same reason. Without it the
     * player bot cruises east at 42 m/s for the whole mission, everything else
     * is left behind, and §4.5's reinforcements spawn into empty sky a kilometre
     * behind him: losing three crates then moved the death rate by exactly 0.0
     * points, which is a broken instrument reporting "the ladder is decoration".
     * A crate level is a CONTESTED AREA, and the bounds say so.
     */
    for (let k = 0; k < world.live.length; k++) keepInside(world, world.live[k], L);
    // P9/D139: enemy-seconds, so K5 can select on whether the treatment was
    // DELIVERED rather than on whether the outcome had headroom.
    for (let k = 0; k < world.live.length; k++) if (world.live[k].side === -1) redSeconds += DT;
    if (player.dead && !dead) { dead = true; deadAt = t; if (opts.stopOnDeath !== false) break; }
  }

  const s = field.stats;
  return {
    level: L.id, seed: opts.seed ?? 1, policy: opts.policyName || 'ignore',
    dropped: s.dropped, playerBanked: s.playerBanked, enemyBanked: s.enemyBanked,
    denied: s.denied, burst: s.burst, flyThrough: s.flyThrough, cutTaken: s.cutTaken,
    landedFriendly: s.landedFriendly, landedEnemy: s.landedEnemy,
    value: +s.value.toFixed(2), enemyValue: +s.enemyValue.toFixed(2),
    silkRounds: s.silkRounds, ladder: field.ladder,
    gfHits: s.gfHits, gfDamage: s.gfDamage,
    damage: +player.flight.damageHP.toFixed(1),
    hpLost: +Math.min(player.hpMax.structure, player.hpMax.structure - player.hp.structure).toFixed(1),
    dead, deadAt: +deadAt.toFixed(1),
    reinforced: R.reinforcedAt(),
    redsAlive: world.aircraft.filter(a => a.alive && a.side === -1).length,
    redSeconds: +redSeconds.toFixed(1),
  };
}

/** Reflect an aeroplane back into the level's contested area (duel.js §7.5's rule). */
function keepInside(world, e, L) {
  if (!e.alive) return;
  const f = e.flight;
  const lo = L.spawnX - 400, hi = L.lineX + 1600;
  if (f.sx > lo && f.sx < hi) return;
  if (e.ai && e.ai.state === 'BUG_OUT') { e.fled = true; world.stats.fled++; world.despawn(e); return; }
  f.sx = f.sx <= lo ? lo + 1 : hi - 1;
  f.svx = -f.svx * 0.6;
  f.theta = Math.atan2(f.svy, f.svx);
}

/* --------------------------------------------------------- the EV model --- */
/**
 * Gate K3/K4 and register T19/T20 — the riskiest number in the game.
 *
 * The exchange rate between damage and Scrip is NOT invented: §4.4's Parts crate
 * repairs 45 structure and is worth 20 Scrip-equivalent, so the game's own table
 * prices a hit point at 20/45 Scrip. Nothing here declares a value the design
 * document does not already contain.
 */
const HP_SCRIP = CONTENT_BY_KIND.parts.scrip / CONTENT_BY_KIND.parts.repair;

/**
 * The three takes of §4.3, expressed as three policies over the SAME AI. Each is
 * a window on the fall (`cutAltM`) plus whether the pilot closes to the collect
 * radius (`standoff`) — never a private capability, never a different bot.
 */
const POLICIES = {
  flyThrough: { engage: 'none', policy: { run: true }, silkBand: null },
  cutLow:     { engage: 'cut',
                policy: { run: true, skipCut: true, altLo: 0, altHi: CRATE.cutLoM, standoff: 38 },
                silkBand: [0, CRATE.cutLoM] },
  cutHigh:    { engage: 'cut',
                policy: { run: true, skipCut: true, altLo: CRATE.cutHiM, altHi: 1e9, standoff: 38 },
                silkBand: [CRATE.cutHiM, 1e9] },
  deny:       { engage: 'deny', policy: { run: true, standoff: 30 }, silkBand: null },
  ignore:     { engage: 'none', policy: { run: false }, silkBand: null },
};

function evRun(name, { level = 'k-drop', runs = 24, seed0 = 900, forfeit = true } = {}) {
  const P = POLICIES[name];
  let value = 0, crates = 0, deaths = 0, hp = 0, banked = 0, enemy = 0, burst = 0,
      friendly = 0, enemySide = 0, gf = 0, ladder = 0;
  for (let i = 0; i < runs; i++) {
    const r = crateMission({ level, seed: seed0 + i, policyName: name,
                             engage: P.engage, policy: P.policy, silkBand: P.silkBand,
                             stopOnDeath: false });
    crates += r.dropped;
    // A death forfeits the sortie: in story mode the mission is failed and the
    // bank goes with it. Reported both ways so the manager can see which term
    // drives the answer rather than taking one number on trust.
    value += (forfeit && r.dead) ? 0 : r.value;
    hp += r.hpLost;
    banked += r.playerBanked; enemy += r.enemyBanked; burst += r.burst;
    friendly += r.landedFriendly; enemySide += r.landedEnemy;
    gf += r.gfDamage; ladder += r.ladder;
    if (r.dead) deaths++;
  }
  const gross = value / Math.max(1, crates);
  const dmgCost = (hp / Math.max(1, crates)) * HP_SCRIP;
  return {
    policy: name, runs, crates, deaths, deathRate: +(deaths / runs).toFixed(3),
    banked, enemyBanked: enemy, burst, landedFriendly: friendly, landedEnemy: enemySide,
    ladderSteps: ladder,
    grossPerCrate: +gross.toFixed(3),
    damageHPPerCrate: +(hp / Math.max(1, crates)).toFixed(2),
    damageCost: +dmgCost.toFixed(3),
    netPerCrate: +(gross - dmgCost).toFixed(3),
  };
}

function evReport({ level = 'k-drop', runs = num('runs', 24) } = {}) {
  const rows = ['flyThrough', 'cutLow', 'cutHigh', 'deny', 'ignore'].map(n => evRun(n, { level, runs }));
  const base = rows.find(r => r.policy === 'flyThrough');
  for (const r of rows) {
    r.vsFlyThrough = base.netPerCrate > 0 ? +(r.netPerCrate / base.netPerCrate).toFixed(3) : 0;
  }
  return { level, runs, hpScrip: +HP_SCRIP.toFixed(4), rows,
           T19: rows.find(r => r.policy === 'cutLow').vsFlyThrough,
           T20: rows.find(r => r.policy === 'cutHigh').vsFlyThrough };
}


/* ------------------------------------------------------ the decision model - */
/**
 * K3/K4, registers T19 and T20 — and the instrument is a MODEL of the decision,
 * not a bot flying it. That choice is deliberate and it is the honest one:
 *
 * The low cut is a precision manoeuvre — be within 66 m of a canopy that is
 * below 120 m, with the canopy inside an 11 deg cone, and leave before the 9 m
 * collect radius takes it off you at 1.0x. A 0.34 s-reaction utility bot flies
 * it badly (measured: `--ev` below), and if K3 were measured off that bot it
 * would be measuring BOT SKILL and reporting it as T19. That is the
 * believable-wrong-metric shape this project has been bitten by four times.
 *
 * So the model assumes competent EXECUTION and measures everything else off the
 * shipping physics: the fall is `field.predict`, the landing side is where that
 * integration puts it, the burst is `field.burstChance`, the exposure is
 * `smallArmsP` integrated over the real altitude/time profile of each take with
 * the level's real nests, and a hit point is priced at §4.4's own 20/45 Scrip.
 * Nothing here is a number somebody typed.
 *
 * `sigmaJudge` is how badly the PLAYER reads the wind, in m/s. 0 is the
 * `Wind Reader` trait or Cadet difficulty (§4.2 draws the predicted impact point
 * as a dashed line); 1.5-3.0 is judging it off trench smoke and canopy lean.
 */
const TAKE_ALTS = { low: CRATE.cutLoM - 10, high: CRATE.cutHiM + 150 };

function takeOutcome(field, L, c, cutAltM, rngLocal, sigmaJudge) {
  const P = { x: 0, y: 0, t: 0, grounded: false };
  // true landing if cut at cutAltM
  const tCut = timeToAltM(field, c, cutAltM);
  field.predict(c, tCut, 0, P);
  const cutX = P.x, cutY = P.y;
  const save = { sx: c.sx, sy: c.sy, svx: c.svx, svy: c.svy, cut: c.cut };
  c.sx = cutX; c.sy = cutY; c.cut = true;
  field.predict(c, 400, 0, P);
  const landTrue = P.x;
  // what the PLAYER believes will happen, judging the wind
  const err = sigmaJudge > 0 ? rngLocal.gauss(0, sigmaJudge) : 0;
  field.predict(c, 400, err, P);
  const landBelief = P.x;
  c.sx = save.sx; c.sy = save.sy; c.svx = save.svx; c.svy = save.svy; c.cut = save.cut;
  return { tCut, cutAltM: -cutY, cutX, landTrue, landBelief,
           friendly: landTrue < L.lineX, believedFriendly: landBelief < L.lineX };
}

function timeToAltM(field, c, altM) {
  const P = { x: 0, y: 0, t: 0, grounded: false };
  if (-c.sy <= altM) return 0;
  let lo = 0, hi = 400;
  for (let i = 0; i < 26; i++) {
    const m = (lo + hi) * 0.5;
    field.predict(c, m, 0, P);
    if (-P.y <= altM) hi = m; else lo = m;
  }
  return hi;
}

/**
 * HP lost to §3.5's small arms by a take that spends `secs` at `altM` near `xM`,
 * then climbs out to 250 m. Every term is the shipping curve; the only geometry
 * assumed is a 250 m level run-in at cruise and a best-rate climb away.
 */
function exposureHP(L, xM, altM, env, runInM = 250) {
  let hp = 0;
  const v = 42;                                     // cruise, DESIGN §3.4
  const nestsInRange = L.nests.filter(nx => Math.abs(nx - xM) <= SMALL_ARMS.reachM).length;
  if (nestsInRange === 0) return 0;
  const perBurst = (a) => smallArmsP(a, v) * SMALL_ARMS.dmg * nestsInRange / SMALL_ARMS.period;
  hp += perBurst(altM) * (runInM / v);              // the run-in, level, at the crate's height
  const climbS = Math.max(0, (SMALL_ARMS.ceilM - altM)) / env.roc;
  const steps = 12;
  for (let i = 0; i < steps; i++) {
    const a = altM + (SMALL_ARMS.ceilM - altM) * (i + 0.5) / steps;
    hp += perBurst(a) * (climbS / steps);
  }
  return hp;
}

function evModel({ samples = num('samples', 400), sigmaJudge = num('sigma', 1.5),
                   levels = ['k-drop', 'k-shear'], ladderCost = num('laddercost', 0) } = {}) {
  const env = crateEnv(REFERENCE);
  const hpScrip = HP_SCRIP;
  const rows = {};
  for (const name of ['flyThrough', 'cutLow', 'cutHigh', 'ignore']) {
    rows[name] = { policy: name, n: 0, value: 0, exposure: 0, burst: 0, enemySide: 0,
                   taken: 0, declined: 0, commitS: 0,
                   valueTaken: 0, exposureTaken: 0, enemySideTaken: 0 };
  }
  const rngL = createRNG(20260824);

  for (const lid of levels) {
    const L = CRATE_LEVELS[lid];
    const R = crateWorld(L, { seed: 9, enemies: 0, groundFire: false });
    const field = R.field;
    const spanLo = Math.min(...L.drops.map(d => d[1])), spanHi = Math.max(...L.drops.map(d => d[1]));
    for (let s = 0; s < samples; s++) {
      const x = spanLo + (spanHi - spanLo) * (s + 0.5) / samples;
      const c = field.drop({ xM: x, yM: -L.drops[0][2], kind: 'supply' });
      if (!c) continue;

      // --- do nothing: it lands where the wind puts it
      const P = { x: 0, y: 0, t: 0, grounded: false };
      field.predict(c, 400, 0, P);
      const driftLand = P.x, tGround = P.t;
      const ig = rows.ignore; ig.n++;
      if (driftLand < L.lineX) ig.value += CRATE.multFly; else ig.enemySide++;

      // --- fly through: at the highest altitude the aeroplane can reach it
      const start = { x: L.spawnX, y: -L.spawnAltM, dir: 1 };
      const cat = soonestCatch(field, c, start, REFERENCE, env);
      const ft = rows.flyThrough; ft.n++;
      if (cat.ok) {
        ft.taken++;
        ft.value += CRATE.multFly; ft.valueTaken += CRATE.multFly;
        ft.commitS += cat.t;
        const exf = exposureHP(L, cat.x, -cat.y, env);
        ft.exposure += exf; ft.exposureTaken += exf;
      } else {
        // unreachable: the crate does what an ignored crate does
        if (driftLand < L.lineX) ft.value += CRATE.multFly; else ft.enemySide++;
      }

      // --- the two cuts
      for (const [name, altM] of [['cutLow', TAKE_ALTS.low], ['cutHigh', TAKE_ALTS.high]]) {
        const r = rows[name]; r.n++;
        const o = takeOutcome(field, L, c, altM, rngL, sigmaJudge);
        // A player cuts only when he BELIEVES it comes down on his side. That
        // belief is what sigmaJudge corrupts, and it is the whole reason the
        // `Wind Reader` trait exists.
        if (!o.believedFriendly) {
          r.declined++;
          // he falls back on the guaranteed take
          if (cat.ok) { r.value += CRATE.multFly; r.exposure += exposureHP(L, cat.x, -cat.y, env); }
          else if (driftLand < L.lineX) r.value += CRATE.multFly;
          else r.enemySide++;
          continue;
        }
        r.taken++;
        r.commitS += o.tCut;
        const ex = exposureHP(L, o.cutX, o.cutAltM, env);
        r.exposure += ex; r.exposureTaken += ex;
        if (!o.friendly) { r.enemySide++; r.enemySideTaken++; continue; }   // wrong: they get it
        const burst = rngL.next() < field.burstChance(o.cutAltM);
        if (burst) r.burst++;
        r.value += burst ? CRATE.multBurst : CRATE.multCut;
        r.valueTaken += burst ? CRATE.multBurst : CRATE.multCut;
      }
      c.alive = false;
    }
  }

  const out = [];
  for (const k of ['flyThrough', 'cutLow', 'cutHigh', 'ignore']) {
    const r = rows[k];
    const gross = r.value / r.n;
    const cost = (r.exposure / r.n) * hpScrip / CRATE_EV        // HP -> Scrip -> crate-multiples
               + (r.enemySide / r.n) * ladderCost;
    /**
     * TWO readings, and they answer different questions. K3 and K4 ask about the
     * value of A LOW CUT and A HIGH CUT — the ACT — so the number that answers
     * them is conditional on the take being made (`netTaken`). The unconditional
     * column is the whole-mission economy: it includes the crates a player
     * looked at and decided not to cut, which is most of them, and it is the
     * right number for §10.3's income model rather than for T19.
     */
    const nt = Math.max(1, r.taken);
    const grossT = r.valueTaken / nt;
    const costT = (r.exposureTaken / nt) * hpScrip / CRATE_EV
                + (r.enemySideTaken / nt) * ladderCost;
    out.push({ policy: k, n: r.n, taken: r.taken, declined: r.declined,
               grossMult: +gross.toFixed(4),
               exposureHP: +(r.exposure / r.n).toFixed(3),
               exposureMult: +((r.exposure / r.n) * hpScrip / CRATE_EV).toFixed(4),
               enemySidePct: +(100 * r.enemySide / r.n).toFixed(1),
               burstPct: r.taken ? +(100 * r.burst / r.taken).toFixed(1) : 0,
               commitS: r.taken ? +(r.commitS / r.taken).toFixed(1) : 0,
               netMult: +(gross - cost).toFixed(4),
               exposureHPTaken: +(r.exposureTaken / nt).toFixed(3),
               netTaken: +(grossT - costT).toFixed(4) });
  }
  const base = out.find(r => r.policy === 'flyThrough');
  for (const r of out) {
    r.vsFlyThrough = +(r.netMult / base.netMult).toFixed(3);
    r.vsFlyThroughTaken = +(r.netTaken / base.netTaken).toFixed(3);
  }
  return { samples, sigmaJudge, levels, hpScrip: +hpScrip.toFixed(4), ladderCost, rows: out,
           T19: out.find(r => r.policy === 'cutLow').vsFlyThroughTaken,
           T20: out.find(r => r.policy === 'cutHigh').vsFlyThroughTaken,
           T19policy: out.find(r => r.policy === 'cutLow').vsFlyThrough,
           T20policy: out.find(r => r.policy === 'cutHigh').vsFlyThrough };
}

/**
 * The arithmetic K3 and K4 have to live inside, printed so nobody has to trust a
 * simulation to see it. With the burst as the ONLY thing separating a low cut
 * from a high one, the two criteria are JOINTLY UNSATISFIABLE for any value of
 * T19 — which is why the side of the line is not decoration.
 */
function evAnalytic() {
  const pLo = CRATE.burstLo, pHi = CRATE.burstHi, B = CRATE.multBurst, M = CRATE.multCut;
  const lowNeeded = (1.35 - pLo * B) / (1 - pLo);        // M that makes K3 exactly 1.35
  const highLimit = (1.0 - pHi * B) / (1 - pHi);         // M below which K4 holds
  return {
    lowCutValueOnly: +((1 - pLo) * M + pLo * B).toFixed(3),
    highCutValueOnly: +((1 - pHi) * M + pHi * B).toFixed(3),
    M_min_for_K3: +lowNeeded.toFixed(3),
    M_max_for_K4: +highLimit.toFixed(3),
    jointlySatisfiableOnBurstAlone: lowNeeded < highLimit,
    burstNeededForK4AtM: +((M - 1.0) / (M - B)).toFixed(3),
    note: 'At DESIGN §4.3\'s AUTHORED T20 of 0.35 these two criteria are jointly unsatisfiable: '
        + 'K3 needs the multiplier >= 1.395 and K4 needs it < 1.269, and no value of T19 is both. '
        + 'T20 is the register entry whose named test is exactly this, and it is refined to 0.60 — '
        + 'the smallest round number above the 0.545 the arithmetic forces. `burstNeededForK4AtM` '
        + 'is that solve. Alternative the manager may prefer: keep 0.35 and make a burst crate '
        + 'worth 0 instead of 0.5, which needs only 0.375.',
  };
}


/* ---------------------------------------------- reachability (DESIGN 10.4) - */

function reachReport({ level = 'k-drop', airframe = REFERENCE, unreachable = -1 } = {}) {
  const L = CRATE_LEVELS[level];
  const R = crateWorld(L, { seed: 5, enemies: 0, groundFire: false });
  const env = crateEnv(airframe);
  const start = { x: L.spawnX, y: -L.spawnAltM, dir: 1 };
  const rows = [];
  for (let i = 0; i < L.drops.length; i++) {
    const d = L.drops[i];
    const dx = i === unreachable ? d[1] + 26000 : d[1];    // K7: shove one out of reach
    const c = R.field.drop({ xM: dx, yM: -d[2], kind: 'supply' });
    // A crate dropped at t = T is not there until T; the player's clock starts at 0.
    const catchR = soonestCatch(R.field, c, start, airframe, env);
    const cutR = soonestCut(R.field, c, start, airframe, env, { belowM: CRATE.cutLoM });
    const tGround = catchR.tGround;
    rows.push({
      id: c.id, i, dropX: dx, dropAltM: d[2], dropT: d[0],
      tGround: +tGround.toFixed(1),
      // Margin is seconds of slack against the crate reaching the GROUND, which
      // is what §10.4 means by it. The beat's own `x`/drop time is extra slack
      // the solver deliberately does not spend: the player has the whole fall
      // plus however long it takes the level to reach that beat.
      catchAt: catchR.ok ? +catchR.t.toFixed(1) : null,
      catchMargin: catchR.ok ? +catchR.margin.toFixed(1) : -Infinity,
      cutAt: cutR.ok ? +cutR.t.toFixed(1) : null,
      cutMargin: cutR.ok ? +cutR.margin.toFixed(1) : -Infinity,
      cutAltM: cutR.ok ? +cutR.cutAltM.toFixed(0) : null,
      cutLandX: cutR.ok ? +cutR.landX.toFixed(0) : null,
      cutFriendly: cutR.ok ? cutR.friendly : false,
      limit: catchR.ok ? '' : catchR.limit,
      shortM: catchR.ok ? 0 : +(catchR.short || 0).toFixed(0),
      reachable: catchR.ok || cutR.ok,
    });
    c.alive = false;
  }
  rows.sort((a, b) => Math.max(a.catchMargin, a.cutMargin) - Math.max(b.catchMargin, b.cutMargin));
  const bad = rows.filter(r => !r.reachable);
  return { level, airframe: airframe.id, env, rows, bad };
}

function printReach(rep) {
  console.log(`  reach — level ${rep.level}, ${rep.airframe}: RoC ${rep.env.roc.toFixed(2)} m/s at ` +
              `${rep.env.climbSpeed} m/s, Vmax ${rep.env.vmax.toFixed(1)}, dive ${rep.env.vdive.toFixed(1)}`);
  console.log('  every crate, margin ascending — the ten tightest are printed even when everything passes\n');
  console.log('    crate     dropX  alt   fall   catch@  margin    cut@  margin  cutAlt  lands   side');
  for (const r of rep.rows) {
    const cm = r.catchMargin === -Infinity ? '  UNREACH' : r.catchMargin.toFixed(1).padStart(8);
    const um = r.cutMargin === -Infinity ? '  UNREACH' : r.cutMargin.toFixed(1).padStart(8);
    console.log(`    ${r.id.padEnd(9)} ${String(r.dropX).padStart(6)} ${String(r.dropAltM).padStart(5)} ` +
                `${r.tGround.toFixed(1).padStart(6)} ${(r.catchAt === null ? '  —' : r.catchAt.toFixed(1)).padStart(7)} ${cm} ` +
                `${(r.cutAt === null ? '  —' : r.cutAt.toFixed(1)).padStart(7)} ${um} ` +
                `${(r.cutAltM === null ? '  —' : String(r.cutAltM)).padStart(6)} ` +
                `${(r.cutLandX === null ? '  —' : String(r.cutLandX)).padStart(6)}  ${r.cutFriendly ? 'ours' : 'theirs'}` +
                `${r.reachable ? '' : '   *** UNREACHABLE by any of the three takes: ' + r.limit + ' short ' + r.shortM + ' m'}`);
  }
  console.log(`\n  ${rep.bad.length === 0 ? 'PASS' : 'FAIL'}  ${rep.rows.length - rep.bad.length}/${rep.rows.length} reachable` +
              (rep.bad.length ? ' — ' + rep.bad.map(b => `${b.id} (${b.limit}, short ${b.shortM} m)`).join(', ') : ''));
}

/* ------------------------------------------------------- the spawner (W8) - */
/**
 * W8's rig. It lives here rather than in `tools/worldgate.mjs` because THIS file
 * owns world construction — a gate that builds its own world is measuring a
 * second implementation of the game, which is the defect W5 exists to name.
 * `worldgate` shells out to it, exactly as W1b already does for the run summary.
 *
 * The camera is driven by the PLAYER, not by a scripted ramp: `camWu` is the
 * furthest world-x the player has reached, in world units. That is what the real
 * camera does, and a ramp would test the ramp.
 */
function spawnerRun({ level, secs = 300, seed = 5, enemies = 0 } = {}) {
  const L = CRATE_LEVELS['k-drop'];
  const R = crateWorld(L, { seed, enemies, groundFire: false });
  const { world, field, player } = R;
  const lvl = createLevel(level);
  const log = [];
  const sp = createSpawner(world, lvl, {
    onSpawn: (e, b) => log.push(`${world.t.toFixed(2)}|${b.x}|${e.type.id}|${e.flight.sx.toFixed(1)}|${e.flight.sy.toFixed(1)}`),
    onBeat: (b) => log.push(`${world.t.toFixed(2)}|${b.x}|${b.event || b.boss || b.line || 'beat'}`),
  });

  const alloc0 = { ...world.alloc };
  const n = Math.round(secs / DT);
  let maxLive = 0, camWu = 0, retreats = 0, lastX = 0;
  for (let i = 0; i < n; i++) {
    world.update(DT);
    for (let k = 0; k < world.live.length; k++) keepInside(world, world.live[k], L);
    const xWu = player.flight.sx / M_PER_WU;
    if (xWu < lastX) retreats++;
    lastX = xWu;
    camWu = Math.max(camWu, xWu);
    sp.update(camWu);
    let live = 0;
    for (let k = 0; k < world.live.length; k++) if (world.live[k].side === -1) live++;
    if (live > maxLive) maxLive = live;
  }
  const alloc1 = { ...world.alloc };
  return {
    level: lvl.id, secs, seed, beats: lvl.beats.length,
    fired: sp.state.fired, remaining: sp.remaining, poolMisses: sp.state.poolMisses,
    unknownTypes: sp.state.unknownTypes,
    camWu: +camWu.toFixed(1), retreatTicks: retreats, maxLiveReds: maxLive,
    allocBefore: alloc0, allocAfter: alloc1,
    allocGrew: Object.keys(alloc0).some((k) => alloc1[k] !== alloc0[k]),
    spawnLeadWu: SPAWN_LEAD_WU,
    logHash: (() => { let h = 2166136261 >>> 0; const t = log.join('\n');
      for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
      return (h >>> 0).toString(16).padStart(8, '0'); })(),
    logLines: log.length,
  };
}

/* ------------------------------------------- a WORKED LEVEL, flown (W3/W4) - */
/**
 * P9 item 7's instrument. `spawnerRun` above measures the SPAWNER, in the crate
 * world, because W8 is a claim about the entity pool. This measures a LEVEL: the
 * world is built from the level's own wind, terrain and player start, the beats
 * are fired by the shipped spawner, and what comes out is ARCHITECTURE §8.1's
 * run summary — the same field names the star conditions are written against, so
 * `evalCondition` scores the level's own stars off it without a second path.
 *
 * It is NOT the story mode. There is no brief, no debrief, no objective
 * evaluation and no save; those are P10's and building half of them here would
 * put a second mode shell in the harness. What it is is the smallest thing that
 * makes W3 (determinism) and W4 (the band slice) measurable on a real level
 * rather than asserted about a JSON document.
 */
/**
 * The level is a CORRIDOR, `0 .. length`, and this is the rule that says so.
 *
 * It is here because of what the first run measured: with the shipped AI and
 * nothing else, the player engaged the level's two Kestrels at 2,100 wu, came
 * out of the turn pointing WEST, and PATROLLED west for 240 s until the fuel ran
 * out — 57,900 wu off the far end of a 14,000 wu level. PATROL holds the heading
 * it inherits; it has no idea where the objective is, because **telling him is
 * the mode shell's job and the mode shell is P10**. The level's own
 * `{ type: 'reach', x: length }` is the whole statement of where he is going.
 *
 * So rather than write a second controller here — which is the defect W5 exists
 * to name, one system over — the harness gives the level the bounds it already
 * declares, exactly as `keepInside` gives the crate level its contested area
 * (§7.5's duel rule). What that measures is a player who cannot leave the level,
 * which is what a side-scroller level IS, and it is declared rather than
 * implied: **`--break no-corridor` removes it, and W4 goes red when it does.**
 */
/**
 * P10: the corridor moved into `js/modes/story.js`, which is the mode shell the
 * comment above says owns it. There is exactly ONE implementation and both the
 * headless level run and the browser's play scene call it — a second copy here
 * is the defect W5 exists to name, one system over. The lid is D150's.
 */
const keepInsideLevel = (world, e, lengthWu, ceilingWu, o) =>
  containInLevel(world, e, lengthWu, ceilingWu, o);

function levelRun({ level, seed = 5, secs = 300, bug = P9BUG } = {}) {
  const lvl = createLevel(level);
  const res = validateLevel(lvl);
  if (!res.ok) throw new Error(formatErrors(lvl.id, res.errors).join('\n'));

  const ctx = { rng: createRNG(seed), bus: null, bug: '', zoom: 1 };
  const world = createWorld(ctx, {});
  world.arena.lineX = 0;
  const field = createCrateField(world, {
    wind: lvl.wind, lineX: 0, actMult: ACT_MULT[lvl.act] ?? 1,
    gustPhase: 0.7, gustSeed: seed * 7919,
    engage: { 1: 'none', '-1': 'take' }, groundFire: false,
  });

  const af = AIRFRAME_BY_ID[lvl.player.airframe] || REFERENCE;
  const player = world.spawn(playerType(af.id, 't2'), {
    id: 'player', side: 1, xM: lvl.player.start.x * M_PER_WU, yM: lvl.player.start.y * M_PER_WU,
    speed: CRUISE_MS, theta: 0, k: 0.70, morale: 1, aggro: 1.2 });
  player.noFlee = true;
  player.ai = createAI(player, { k: 0.70, aggro: 1.2 });
  player.cratePolicy = { run: false };

  const log = [];
  /**
   * `--break no-beats` strips the level's content and leaves the corridor. It is
   * W4's control: if the band slice does not move when the level's own beats are
   * removed, W4 is measuring the harness rather than the level.
   */
  const spLevel = bug === 'no-beats' ? { ...lvl, beats: [] } : lvl;
  const sp = createSpawner(world, spLevel, {
    onSpawn: (e, b) => { e.ai = createAI(e, { k: b.k ?? 0.6 }); e.cratePolicy = { run: true };
      log.push(`${world.t.toFixed(2)}|${b.x}|${e.type.id}|${e.flight.sx.toFixed(1)}|${e.flight.sy.toFixed(1)}`); },
    onBeat: (b) => log.push(`${world.t.toFixed(2)}|${b.x}|${b.event || b.boss || b.line || 'beat'}`),
  });

  const timeInBand = Object.fromEntries(BAND_TABLE.map((b) => [b.id, 0]));
  const alloc0 = { ...world.alloc };
  const n = Math.round(secs / DT);
  /**
   * `--break camera-current` is the control for the monotone camera: it feeds
   * the spawner the player's CURRENT x rather than the furthest he has reached.
   */
  const monotone = bug !== 'camera-current';
  /**
   * D150's lid, read off the level rather than typed. `--break no-lid` removes
   * it and W4 must go red on a1-01 when it does; the arm reports the value it
   * actually used, because a break-switch that only reports what it was ASKED
   * to do is how three of P9's controls came back green (D148).
   */
  const lidWu = bug === 'no-lid' ? 0 : lvl.column.ceiling;
  const CORRIDOR = { noLid: bug === 'no-lid' };
  let camWu = lvl.player.start.x, kills = 0, stalls = 0, blackouts = 0, peakG = 0, lidHits = 0;
  let wasStalled = false, blackPrev = false, reachedAt = 0, t = 0;
  const seen = new Set();

  for (let i = 0; i < n; i++) {
    world.update(DT);
    t = (i + 1) * DT;
    const f = player.flight;
    // The reach test comes BEFORE the corridor, because crossing the far end IS
    // the objective and the corridor would otherwise reflect him one metre short.
    if (!reachedAt && f.sx / M_PER_WU >= lvl.length) reachedAt = t;
    if (bug !== 'no-corridor')
      for (let k = 0; k < world.live.length; k++)
        lidHits += (keepInsideLevel(world, world.live[k], lvl.length, lidWu, CORRIDOR) & 1) ? 1 : 0;
    const xWu = f.sx / M_PER_WU;
    camWu = monotone ? Math.max(camWu, xWu) : xWu;
    sp.update(camWu);
    timeInBand[bandIdAt(f.sy / M_PER_WU)] += DT;
    peakG = Math.max(peakG, f.stress);
    if (f.stalled && !wasStalled) stalls++;
    wasStalled = f.stalled;
    if (f.blackout && !blackPrev) blackouts++;
    blackPrev = f.blackout;
    for (let j = 0; j < world.aircraft.length; j++) {
      const e = world.aircraft[j];
      if (e.side === -1 && !e.alive && !seen.has(e.id)) { seen.add(e.id); kills++; }
    }
    if (player.dead || reachedAt) break;
  }

  const cs = field.stats;
  const summary = {
    level: lvl.id, seed, pilot: 'competent', completed: !!reachedAt && !player.dead,
    time: +t.toFixed(1),
    damageTaken: +player.flight.damageHP.toFixed(1),
    deaths: player.dead ? 1 : 0,
    kills,
    cratesCaught: cs.playerBanked, cratesMissed: cs.dropped - cs.playerBanked,
    shotsFired: player.gun.fired, hits: player.gun.hits,
    accuracy: player.gun.fired ? +(player.gun.hits / player.gun.fired).toFixed(3) : 0,
    ammoLeft: player.gun.ammo, fuelLeft: +(player.flight.fuel / 100).toFixed(3),
    peakG: +peakG.toFixed(2), stalls, blackouts,
    timeInBand: Object.fromEntries(Object.entries(timeInBand).map(([k, v]) => [k, +v.toFixed(1)])),
    difficulty: 0, abort: null,
  };

  /**
   * D31's 2-3 band slice, and "occupied" is DERIVED rather than a share picked
   * to make the answer come out: a band is occupied if the player spent longer
   * in it than crossing it costs at best climb — `thickness / BEST_CLIMB_WU_S`.
   * Anything under that is a transit, which is what a band being a *place*
   * rather than a *step* means (D27).
   */
  const occupancy = BAND_TABLE.map((b) => ({
    id: b.id, s: summary.timeInBand[b.id],
    transitS: +(Math.abs(b.y1 - b.y0) / BEST_CLIMB_WU_S).toFixed(2),
  }));
  const occupied = occupancy.filter((o) => o.s > o.transitS).map((o) => o.id);

  return {
    ...summary,
    reachedAt: +reachedAt.toFixed(1), lengthWu: lvl.length,
    beats: lvl.beats.length, fired: sp.state.fired, poolMisses: sp.state.poolMisses,
    unknownTypes: sp.state.unknownTypes, camWu: +camWu.toFixed(1),
    occupancy, occupied, touched: occupancy.filter((o) => o.s > 0).map((o) => o.id),
    lidWu, lidHits,
    stars: lvl.stars.map((c) => ({ id: c.id, got: evalCondition(c, summary) })),
    allocBefore: alloc0, allocAfter: { ...world.alloc },
    allocGrew: Object.keys(alloc0).some((k) => world.alloc[k] !== alloc0[k]),
    logLines: log.length,
    logHash: (() => { let h = 2166136261 >>> 0; const txt = log.join('\n');
      for (let i = 0; i < txt.length; i++) { h ^= txt.charCodeAt(i); h = Math.imul(h, 16777619); }
      return (h >>> 0).toString(16).padStart(8, '0'); })(),
    hash: null,
  };
}

/** The state hash W3 compares. Every reported field except the seed itself. */
function levelHash(r) {
  const { seed, ...rest } = r;
  const txt = JSON.stringify(rest);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < txt.length; i++) { h ^= txt.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/* ------------------------------------------------------- the ladder (K5) -- */

/**
 * K5 / register T21. The instrument had to be isolated before it measured
 * anything: the first version ran the same crate level twice and compared 0
 * pre-lost crates with 3 — but with the player ignoring crates the ENEMY banked
 * six of the eight in BOTH arms, so both arms had a maxed ladder and the delta
 * read -3.3 points. It was measuring nothing, in the way a control that is
 * secretly the same as the treatment measures nothing.
 *
 * So: no crates in either arm, and the only difference is `preLost` — which is
 * exactly the state "you have lost N crates" means. What is being asked is
 * whether §4.5's ladder is worth anything, not whether crates exist.
 */
const meanVar = (a) => {
  const n = a.length, m = a.reduce((x, y) => x + y, 0) / n;
  const v = n > 1 ? a.reduce((x, y) => x + (y - m) * (y - m), 0) / (n - 1) : 0;
  return { n, mean: m, var: v, se: Math.sqrt(v / n) };
};

function ladderCell({ runs, level, gun, enemies, seed0 = 4000 }) {
  const out = [];
  for (const lost of [0, 3]) {
    let deaths = 0, reinf = 0;
    const hp = [], red = [];
    for (let i = 0; i < runs; i++) {
      const r = crateMission({ level, seed: seed0 + i, preLost: lost, stopOnDeath: false,
                               noDrops: true, policyName: 'ignore', policy: { run: false },
                               engage: 'none', gun, enemies });
      if (r.dead) deaths++;
      reinf += r.reinforced;
      hp.push(r.hpLost);
      red.push(r.redSeconds);
    }
    const h = meanVar(hp), rs = meanVar(red);
    out.push({ lost, runs, deaths, deathRate: deaths / runs, hpPerRun: h.mean, hpSE: h.se,
               redSeconds: rs.mean, reinf: reinf / runs });
  }
  const dHP = out[1].hpPerRun - out[0].hpPerRun;
  const se = Math.sqrt(out[0].hpSE ** 2 + out[1].hpSE ** 2);
  const dRed = out[1].redSeconds - out[0].redSeconds;
  return { gun, enemies, base: out[0], with3: out[1], reinf: out[1].reinf,
           deltaPts: +((out[1].deathRate - out[0].deathRate) * 100).toFixed(1),
           deltaHP: +dHP.toFixed(1), seHP: +se.toFixed(2),
           deltaRedSeconds: +dRed.toFixed(1),
           /**
            * DELIVERED, not "in band". The old selection rule kept the cells
            * whose BASELINE DEATH RATE sat inside 8-30% — an OUTCOME-dependent
            * filter, and therefore exactly the floor effect D139 names: a cell
            * at 3% baseline has no room to improve, so the rule quietly kept
            * only the cells where the answer was already possible. This selects
            * on whether the INTERVENTION reached the map at all, which is a
            * property of the treatment arm and cannot bias the outcome.
            */
           delivered: dRed > 0 };
  /**
   * ENEMY-SECONDS ALONE IS NOT PROOF OF DELIVERY, and that is how two defects
   * hid. Before the fixes below this same selector read `delivered: yes` in all
   * six cells for two reinforcements that were DEAD ON ARRIVAL — the carcasses
   * stay in `world.live` for ~20 s, which is enough to make the delta positive.
   * The two guards that make the claim real are structural rather than
   * statistical, and both have been run red: the `ladderPreload` fixture
   * (`--break preload-live`) and `--break rein-stacked`.
   */
}

/**
 * K5 / T21 — RE-SPECIFIED (D139). The ladder was fine; the instrument was not.
 *
 * T21's own register test is *"if losing 3 crates does not **measurably** raise
 * the death rate, the ladder is decoration"*. The operative word is MEASURABLY,
 * and the death rate could not measure it for two reasons visible in the gate's
 * own output:
 *
 *   FLOOR EFFECT.   The old rule pooled only cells whose BASELINE death rate sat
 *                   inside DESIGN §10.5's 8-30% band. That is an OUTCOME-dependent
 *                   filter: a cell at 3.3% baseline has no room to improve, so
 *                   the rule kept only the cells where an answer was possible and
 *                   the answer it kept was whatever those two cells happened to say.
 *   QUANTISATION.   30 sorties per cell means the death rate can only move in
 *                   steps of 3.33 points. Both surviving cells read 20.0% -> 20.0%
 *                   — a dead heat that is an artefact of the step size, not a result.
 *
 * Meanwhile HP lost per sortie is CONTINUOUS, has no ceiling in the 8-30% sense,
 * and was positive in every cell. So:
 *
 *   PRIMARY   pooled `deltaHP` per sortie, over the cells where the ladder was
 *             DELIVERED (`deltaRedSeconds > 0` — a property of the treatment,
 *             not of the outcome), must be >= 2 x its own standard error. That
 *             is "measurably" said in the only way a continuous measure can say
 *             it, and it is the register's word rather than a magnitude invented
 *             here.
 *   SECONDARY reported and NOT gated: the death-rate delta, its 100/runs quantum,
 *             and deltaHP as a fraction of the HP cost of ONE MORE AEROPLANE —
 *             which this same sweep measures, so the magnitude has a unit a
 *             designer can act on without a threshold being made up for it.
 */
/**
 * Sorties per cell per arm. DERIVED from what the criterion must be able to
 * RESOLVE, which is a property of LADDER, not of the effect that came out.
 *
 *   smallest rung of LADDER        step 2, dmgMult 1.12 — 12% more incoming fire.
 *                                  It is the only rung that is not an aeroplane,
 *                                  so it is the floor on "measurably".
 *   pooled baseline HP per sortie  123.4 HP, measured in this same sweep
 *                                  (`baseHPPooled` below, printed not typed)
 *   the rung is therefore worth    0.12 x 123.4 = 14.8 HP per sortie
 *   to see that at the bar t >= 2  pooled SE <= 14.8 / 2 = 7.4 HP
 *   measured pooled SE at 30       4.69 HP — 1.6x inside
 *
 * 30 STAYS. The sample size was swept to 240 per cell, but to FALSIFY the +7.4
 * that D139 was written on, not to buy significance: at 240 the pre-fix figure
 * converges to -0.78 +- 1.80 and flips sign between seed blocks, so the +7.4 was
 * a 30-sortie artefact of exactly the kind it was replacing. What moved K5 is
 * the two delivery defects below, not the number of runs.
 */
const K5_RUNS = 30;

function ladderReport({ runs = num('runs', 60), level = 'k-drop', seed0 = num('seed0', 4000) } = {}) {
  const cells = [];
  for (const gun of ['t1', 't2']) for (const enemies of [1, 2, 3]) cells.push(ladderCell({ runs, level, gun, enemies, seed0 }));
  const live = cells.filter(c => c.delivered);
  const k = live.length;
  const deltaHP = k ? live.reduce((s, c) => s + c.deltaHP, 0) / k : 0;
  // SE of a mean of k independent per-cell deltas.
  const seHP = k ? Math.sqrt(live.reduce((s, c) => s + c.seHP * c.seHP, 0)) / k : 0;
  /**
   * The same pool over ALL cells, reported and not gated. It exists so the
   * break-switch reads as a NUMBER GOING FLAT rather than as an empty
   * selection: under `--break no-ladder` no cell is delivered, `k` is 0 and the
   * gated figure is 0 by vacuity — which is a red for the wrong reason. Pooled
   * over all six, the same switch reads exactly 0.00, because the two arms then
   * receive bit-identical input.
   */
  const deltaHPAll = cells.reduce((s, c) => s + c.deltaHP, 0) / cells.length;
  const seHPAll = Math.sqrt(cells.reduce((s, c) => s + c.seHP * c.seHP, 0)) / cells.length;
  const deathBase = k ? live.reduce((s, c) => s + c.base.deathRate, 0) / k : 0;
  const deathWith = k ? live.reduce((s, c) => s + c.with3.deathRate, 0) / k : 0;

  /**
   * The unit for the magnitude, measured in this same sweep rather than
   * asserted: how much HP one MORE hostile aeroplane costs, from the baseline
   * arm's own 1e -> 2e -> 3e ladder. Nothing here is a threshold; it is what
   * turns "+7.4 HP" into a sentence.
   */
  const baseHPPooled = cells.reduce((s, c) => s + c.base.hpPerRun, 0) / cells.length;
  const byCfg = Object.fromEntries(cells.map(c => [`${c.gun}${c.enemies}`, c.base.hpPerRun]));
  const perEnemy = [];
  for (const g of ['t1', 't2']) for (const [a, b] of [[1, 2], [2, 3]])
    if (byCfg[`${g}${a}`] !== undefined && byCfg[`${g}${b}`] !== undefined)
      perEnemy.push(byCfg[`${g}${b}`] - byCfg[`${g}${a}`]);
  const hpPerEnemy = perEnemy.length ? perEnemy.reduce((s, v) => s + v, 0) / perEnemy.length : 0;

  return {
    runs, level, seed0,
    cells: cells.map(c => ({ gun: c.gun, enemies: c.enemies,
      base: +c.base.deathRate.toFixed(3), with3: +c.with3.deathRate.toFixed(3),
      deltaPts: c.deltaPts, baseHP: +c.base.hpPerRun.toFixed(1), deltaHP: c.deltaHP,
      seHP: c.seHP, deltaRedSeconds: c.deltaRedSeconds, reinf: +c.reinf.toFixed(2),
      baseRedSeconds: +c.base.redSeconds.toFixed(1), delivered: c.delivered })),
    deliveredCells: k,
    deltaHP: +deltaHP.toFixed(2), seHP: +seHP.toFixed(2),
    tStat: seHP > 0 ? +(deltaHP / seHP).toFixed(2) : 0,
    positiveCells: live.filter(c => c.deltaHP > 0).length,
    deltaHPAll: +deltaHPAll.toFixed(2), seHPAll: +seHPAll.toFixed(2),
    tStatAll: seHPAll > 0 ? +(deltaHPAll / seHPAll).toFixed(2) : 0,
    // secondary, reported not gated
    deathQuantumPts: +(100 / runs).toFixed(2),
    deltaPts: +((deathWith - deathBase) * 100).toFixed(1),
    hpPerEnemy: +hpPerEnemy.toFixed(1),
    baseHPPooled: +baseHPPooled.toFixed(1),
    smallestRungHP: +(0.12 * baseHPPooled).toFixed(1),
    deltaAsEnemies: hpPerEnemy > 0 ? +(deltaHP / hpPerEnemy).toFixed(2) : 0,
  };
}

/* ------------------------------------------------- the pendulum (K6) ----- */
/**
 * A fly-through has to be timed against the swing. Measured by flying a straight
 * interception at the crate's MEAN position — the answer a solver that ignores
 * the pendulum would give — and counting how often the crate is actually inside
 * the collect radius when the aeroplane arrives.
 */
function swingReport({ runs = 600, pinned = false, radius = CRATE.collect } = {}) {
  const L = CRATE_LEVELS['k-drop'];
  let caught = 0, ampSum = 0, ampN = 0, maxOff = 0;
  for (let i = 0; i < runs; i++) {
    const ctx = { rng: createRNG(6000 + i), bug: pinned ? 'pin-swing' : (P6BUG || '') };
    const world = createWorld(ctx, {});
    const field = createCrateField(world, { wind: L.wind, lineX: L.lineX,
                                            gustPhase: (i % 17) / 17 * 6.283, gustSeed: 11 + i,
                                            groundFire: false });
    const alt = 200 + (i % 40) * 25;
    const c = field.drop({ xM: 0, yM: -alt });
    // settle a random slice of the fall so the phase of the swing is uniform
    const pre = 1.0 + (i % 29) * 0.17;
    for (let k = 0; k < Math.round(pre / DT); k++) field.update(DT);
    if (!c.alive) continue;
    // the intercept a swing-blind solver aims at: the canopy's own centre line
    const aimX = c.sx, aimY = c.sy + CRATE.L;
    const dx = field.crateX(c) - aimX, dy = field.crateY(c) - aimY;
    if (Math.hypot(dx, dy) <= radius) caught++;
    ampSum += Math.abs(CRATE.L * Math.sin(c.ph)); ampN++;
    maxOff = Math.max(maxOff, Math.hypot(dx, dy));
  }
  return { runs, caught, radius, rate: +(caught / runs).toFixed(4),
           meanSwingM: +(ampSum / Math.max(1, ampN)).toFixed(3), maxOffsetM: +maxOff.toFixed(2) };
}

/* ------------------------------------------------------------- T15, fire -- */
/**
 * Register T15, assigned to P6 by BUILD_PLAN §5 and measured here rather than
 * left unmeasured. §3.2: a fire is put out by diving above 70 m/s for 3.0 s, and
 * if it is not out in 12 s the aircraft is gone — so the punishment for catching
 * fire is that you must spend ALL of your altitude, immediately. Its test is
 * "what fraction of fires are survivable? Target 55-70%".
 *
 * The bot does the only thing there is to do: full power, straight down, and
 * pull out when it is out. It is measured at each altitude because the answer IS
 * an altitude question, which is the whole reason the mechanic is good.
 */
function fireReport() {
  const rows = [];
  for (const altM of [60, 100, 150, 200, 300, 450, 700, 1000, 1400]) {
    let ok = 0, n = 0, blowT = 0;
    for (let seed = 0; seed < 12; seed++) {
      n++;
      const p = plane({ altM, speed: 34, seed: 300 + seed, tier: 'competent', fuel: 100 });
      const ent = { flight: p.ac, hp: makeHP(HP_REF.structure), hpMax: makeHP(HP_REF.structure),
                    af: p.ac.airframe, burning: true, fireT: 0, blowT: 0, fireOut: false,
                    dead: false, leak: false, rng: createRNG(seed), armour: 1,
                    tookDamage: 0, lastHitT: 99, spin: 0, wingOff: false, bailed: false, state: '' };
      p.pilot.setIntent('dive', 1);
      let t = 0, out = false, ground = false;
      for (let i = 0; i < Math.round(20 / DT); i++) {
        p.pilot.update(DT, p.ac);
        p.ac.update(DT);
        updateDamage(ent, DT, {});
        t += DT;
        if (ent.fireOut && !out) { out = true; blowT += t; p.pilot.setIntent('hold', Math.max(40, -p.ac.sy)); }
        if (p.ac.sy >= 0) { ground = true; break; }
        if (ent.dead) break;
        if (out && t > 14) break;
      }
      if (out && !ground && !ent.dead) ok++;
    }
    rows.push({ altM, survived: ok, n, rate: +(ok / n).toFixed(3), meanBlowS: +(blowT / Math.max(1, ok)).toFixed(2) });
  }
  const all = rows.reduce((s, r) => s + r.survived, 0) / rows.reduce((s, r) => s + r.n, 0);
  return { rows, overall: +all.toFixed(3) };
}

/* --------------------------------------------------------- physics report - */

function cratePhysics() {
  const id = crateIdentity();
  const L = CRATE_LEVELS['k-drop'];
  // K1: a crate released at the top of the reachable column, measured not solved
  const ctx = { rng: createRNG(3), bug: P6BUG || '' };
  const w1 = createWorld(ctx, {});
  const f1 = createCrateField(w1, { wind: [[0, 0], [1500, 0]], groundFire: false });
  const c1 = f1.drop({ xM: 0, yM: CEILING_WU * M_PER_WU });
  let t = 0;
  while (c1.alive && t < 400) { f1.update(DT); t += DT; }
  const fall = t;

  // K2: the same crate through a reversing shear
  const S = CRATE_LEVELS['k-shear'];
  const shear = (profile) => {
    const c2ctx = { rng: createRNG(3), bug: P6BUG || '' };
    const w2 = createWorld(c2ctx, {});
    const f2 = createCrateField(w2, { wind: profile, groundFire: false, gustPhase: 0, gustSeed: 5 });
    const c2 = f2.drop({ xM: 0, yM: -1450 });
    let x = 0, tt = 0, maxX = 0, minX = 0, meanW = 0, k = 0;
    while (c2.alive && tt < 400) {
      x = f2.crateX(c2);
      maxX = Math.max(maxX, x); minX = Math.min(minX, x);
      meanW += windAt(profile, Math.max(0, -c2.sy)); k++;
      f2.update(DT); tt += DT;
    }
    return { driftM: x, driftWu: x / M_PER_WU, secs: tt,
             maxWu: maxX / M_PER_WU, minWu: minX / M_PER_WU,
             reversalWu: (maxX - x) / M_PER_WU, meanWind: meanW / Math.max(1, k) };
  };
  const rev = shear(S.wind);
  /**
   * The honest control: the SAME time-weighted mean wind held flat. "differs
   * from its release X by > 200 wu" is satisfied by any wind at all, so the
   * measurement that actually says the shear is real is the REVERSAL — the
   * crate goes one way above the layer and comes back below it. See K2's note.
   */
  const flat = shear([[0, rev.meanWind], [1500, rev.meanWind]]);

  return {
    identity: id, fallFromCeiling: +fall.toFixed(2),
    ceilingM: -CEILING_WU * M_PER_WU,
    shear: { driftWu: +rev.driftWu.toFixed(1), driftM: +rev.driftM.toFixed(1), secs: +rev.secs.toFixed(1),
             maxWu: +rev.maxWu.toFixed(1), minWu: +rev.minWu.toFixed(1),
             reversalWu: +rev.reversalWu.toFixed(1), meanWind: +rev.meanWind.toFixed(2) },
    flat: { driftWu: +flat.driftWu.toFixed(1), driftM: +flat.driftM.toFixed(1),
            reversalWu: +flat.reversalWu.toFixed(1) },
    tauAt: { m0: +tau(0).toFixed(3), m500: +tau(500).toFixed(3), m1500: +tau(1500).toFixed(3) },
    termAt: { m0: +crateTerminal(0).toFixed(2), m750: +crateTerminal(750).toFixed(2), m1500: +crateTerminal(1500).toFixed(2) },
    cutTerminal: +crateTerminal(0, true).toFixed(2),
  };
}

/* --------------------------------------------------------- the P6 events -- */

/**
 * ARCHITECTURE §6.7's four `crate:*` events, each driven DELIBERATELY rather
 * than hoped for out of a mission. The mission version fired two of four and
 * passed no payload for the other two, which is a test of the mission's luck.
 */
function crateEvents() {
  const seen = Object.create(null);
  const payloads = Object.create(null);
  const bus = { emit: (name, p) => { seen[name] = (seen[name] || 0) + 1;
                                     if (!payloads[name]) payloads[name] = { ...p }; } };
  const ctx = { rng: createRNG(11), bus, bug: P6BUG };
  const world = createWorld(ctx, {});
  const field = createCrateField(world, { wind: [[0, 0], [1500, 0]], lineX: 0, groundFire: false });
  const e = world.spawn(playerType('kite_b1', 't2'), { id: 'player', side: 1, xM: 0, yM: -400, speed: 40 });

  // drop + caught: fly one through
  const a = field.drop({ xM: 1, yM: -400, swing: 0 });
  world.update(DT);

  // canopyHit + cut: six rounds into the silk of one that will land enemy-side
  const b = field.drop({ xM: 300, yM: -200 });
  for (let i = 0; i < CRATE.silkRounds; i++) {
    const r = world.takeBullet();
    r.x = b.sx; r.y = b.sy; r.vx = 0; r.vy = 0; r.alive = true; r.owner = 'player'; r.side = 1; r.dmg = 6;
    field.bulletPass(DT);
  }
  // lost: let it fall onto the far side of the line
  for (let i = 0; i < Math.round(30 / DT) && b.alive; i++) field.update(DT);

  // and a denial, which is the other shape of crate:lost
  const c = field.drop({ xM: 900, yM: -300 });
  for (let i = 0; i < CRATE.boxRounds; i++) {
    const r = world.takeBullet();
    r.x = field.crateX(c); r.y = field.crateY(c); r.vx = 0; r.vy = 0;
    r.alive = true; r.owner = 'player'; r.side = 1; r.dmg = 6;
    field.bulletPass(DT);
  }
  return { seen, payloads };
}

/* ------------------------------------------------------------- fixtures --- */

const P6_FIXTURES = {
  /** The identity. If any of these four drift, a constant moved and the notes lie. */
  identity() {
    const id = crateIdentity();
    return { balance: +id.balance.toFixed(9), columnSecs: +id.columnSecs.toFixed(2),
             columnMean: +id.columnMean.toFixed(2), tauSL: +id.tauSL.toFixed(3),
             swing: +id.swingPeriod.toFixed(3),
             assert: id.balance < 1e-6 && id.columnSecs > 85 && id.columnSecs < 95
                     && Math.abs(id.swingPeriod - 4.9) < 0.05 };
  },
  /** A crate falls the reachable column in D28's ~90 s. Measured by falling. */
  columnFall() {
    const p = cratePhysics();
    return { secs: p.fallFromCeiling, assert: p.fallFromCeiling >= 85 && p.fallFromCeiling <= 95 };
  },
  /**
   * A reversing shear curves the fall; the same MEAN wind held flat does not.
   * The assert is on the REVERSAL, not on the displacement, and that is the
   * whole point: `--break flat-wind` samples the wind at 750 m for every
   * altitude and a displacement test does not notice, because a 9 m/s wind for
   * 87 s moves a crate a very long way whether or not it ever changes direction.
   * Gate K2 as written has the same hole and its detail line says so.
   */
  shearCurve() {
    const p = cratePhysics();
    return { shearWu: p.shear.driftWu, flatWu: p.flat.driftWu,
             reversalWu: p.shear.reversalWu, flatReversalWu: p.flat.reversalWu,
             assert: Math.abs(p.shear.driftWu) > 200 && p.shear.reversalWu > 200
                     && p.flat.reversalWu < 20 };
  },
  /** Six rounds cut, twelve into the box deny, and neither does the other's job. */
  cutAndDeny() {
    const ctx = { rng: createRNG(21), bug: P6BUG };
    const world = createWorld(ctx, {});
    const field = createCrateField(world, { wind: [[0, -4], [1500, -4]], groundFire: false, lineX: 1e9 });
    // REAL rounds: 420 m/s, so a tick carries them 7 m. A stationary round would
    // make the segment trace and a point test identical and the fixture could not
    // catch `--break point-bullets`, which is the defect that loses four hits in
    // five against a 3.9 m crate.
    const V = GUNS.vMuzzle, step = V * DT;
    const shoot = (targetX, targetY, n) => {
      for (let i = 0; i < n; i++) {
        const b = world.takeBullet();
        b.vx = V; b.vy = 0;
        b.x = targetX - step * 0.5; b.y = targetY;    // it crosses the box this tick
        b.alive = true; b.owner = 'player'; b.side = 1; b.dmg = 6;
        b.x += b.vx * DT; b.y += b.vy * DT;
        field.bulletPass(DT);
      }
    };
    const c = field.drop({ xM: 0, yM: -400, kind: 'supply' });
    shoot(c.sx, c.sy, CRATE.silkRounds);
    const cutAlt = c.cutAltM;
    const c2 = field.drop({ xM: 500, yM: -400, kind: 'supply' });
    shoot(field.crateX(c2), field.crateY(c2), CRATE.boxRounds);
    return { cut: c.cut, cutAlt: +cutAlt.toFixed(0), denied: c2.denied, deniedCount: field.stats.denied,
             assert: c.cut && c2.denied && field.stats.denied === 1 };
  },
  /**
   * What a cut ACTUALLY buys, measured rather than assumed. The first version of
   * this fixture asserted that cutting FREEZES the crate's horizontal velocity
   * at the wind it was cut in, which is a nice story and is false: a 90 kg box
   * is still drag-dominated and relaxes onto the lower wind in about 2 s. What a
   * cut really buys is a SHORTER fall, and therefore less drift — and the higher
   * you cut, the less that is worth. It went red and it is the reason the module
   * comment says the right thing.
   */
  cutDrift() {
    const run = (cutAltM) => {
      const ctx = { rng: createRNG(31), bug: P6BUG };
      const world = createWorld(ctx, {});
      const field = createCrateField(world, { wind: [[0, 6], [1500, 6]],
                                              groundFire: false, lineX: 1e9, gustPhase: 0, gustSeed: 1 });
      const c = field.drop({ xM: 0, yM: -800 });
      let cutX = 0, cut = false;
      for (let i = 0; i < Math.round(200 / DT) && c.alive; i++) {
        if (!cut && -c.sy <= cutAltM && cutAltM > 0) { cutX = field.crateX(c); field.cutCanopy(c); cut = true; }
        if (!cut && cutAltM === 0) cutX = field.crateX(c);
        field.update(DT);
      }
      return { land: field.crateX(c), fromCut: field.crateX(c) - cutX };
    };
    const lo = run(120), hi = run(400), none = run(0);
    // What a cut FORFEITS is the friendly drift the crate would still have had.
    const foreLo = (none.land - lo.land), foreHi = (none.land - hi.land);
    return { landUncut: +none.land.toFixed(1), landCutLow: +lo.land.toFixed(1), landCutHigh: +hi.land.toFixed(1),
             driftAfterLowCut: +lo.fromCut.toFixed(1), driftAfterHighCut: +hi.fromCut.toFixed(1),
             forfeitLow: +foreLo.toFixed(1), forfeitHigh: +foreHi.toFixed(1),
             ratio: +(foreHi / Math.max(1e-6, foreLo)).toFixed(2),
             assert: foreHi > foreLo * 3 && foreLo < 40 };
  },
  /** The ladder is aeroplanes, not a counter. Three lost crates put three in the air. */
  ladderSpawns() {
    const L = CRATE_LEVELS['k-drop'];
    const R = crateWorld(L, { seed: 41, enemies: 0, groundFire: false });
    const before = R.world.live.length;
    for (let i = 0; i < 4; i++) R.field.advanceLadder();
    for (let i = 0; i < Math.round(12 / DT); i++) R.world.update(DT);
    let reds = 0;
    for (const e of R.world.aircraft) if (e.alive && e.side === -1) reds++;
    return { spawned: reds, dmgMult: +R.field.dmgMult.toFixed(3),
             moraleFloor: +R.world.crateMoraleFloor.toFixed(2),
             assert: reds === 3 && Math.abs(R.field.dmgMult - 1.12) < 1e-9 && R.world.crateMoraleFloor === 0.15 };
  },
  /**
   * The rung that is NOT an aeroplane. `ladderSpawns` runs at `enemies: 0`, so
   * it could only ever check `field.dmgMult` — the ledger — and the ledger was
   * always right. What was wrong is whether the multiplier reached the aeroplanes
   * ALREADY FLYING when the ladder advances before the first tick, which is the
   * state "the level starts three crates behind" and is exactly how K5 loads its
   * treatment arm. `world.live` is rebuilt inside `world.update`, so it is empty
   * there and the rung reached nobody — silently, because the spawns still
   * arrived and anything counting reinforcements saw a delivered treatment.
   */
  ladderPreload() {
    const L = CRATE_LEVELS['k-drop'];
    const R = crateWorld(L, { seed: 41, enemies: 3, groundFire: false });
    const liveAtLoad = R.world.live.length;          // 0 — this is the whole trap
    for (let i = 0; i < 3; i++) R.field.advanceLadder();
    R.world.update(DT);
    const reds = R.world.live.filter((e) => e.side === -1);
    const carrying = reds.filter((e) => Math.abs(e.dmgMult - 1.12) < 1e-9).length;
    return { liveAtLoad, redsAfterTick: reds.length, carrying,
             fieldDmgMult: +R.field.dmgMult.toFixed(3),
             assert: liveAtLoad === 0 && reds.length >= 3 && carrying === reds.length };
  },
  /** T17: the small-arms curve, at the two altitudes DESIGN §3.5 works out itself. */
  smallArms() {
    const a = smallArmsP(40, 50), b = smallArmsP(150, 50), c = smallArmsP(70, 24), d = smallArmsP(300, 40);
    return { at40: +a.toFixed(4), at150: +b.toFixed(4), at70slow: +c.toFixed(4), at300: d,
             assert: Math.abs(a - 0.094) < 0.002 && Math.abs(b - 0.028) < 0.002
                     && Math.abs(c - 0.098) < 0.002 && d === 0 };
  },
  /** The contents table is §4.4's and its mean is §4.4's own arithmetic. */
  contents() {
    return { mean: +CRATE_EV.toFixed(3), kinds: CONTENTS.length,
             assert: Math.abs(CRATE_EV - 15.57) < 0.005 };
  },
  /** Zoom cannot reach the sim. A crate run at 0.78 and 1.22 must be identical. */
  zoomNeutral() {
    // The FLY-THROUGH policy, deliberately: the collect radius is the world
    // constant a zoom coupling would corrupt, and a policy that never catches
    // anything cannot notice it. `--break crate-zoom` is the tripwire.
    const run = (z) => {
      const P = POLICIES.flyThrough;
      const r = crateMission({ level: 'k-drop', seed: 77, zoom: z, engage: P.engage,
                               policy: P.policy, silkBand: P.silkBand, stopOnDeath: false });
      return JSON.stringify(r);
    };
    /**
     * And one MARGINAL capture, because a mission where every crate is taken
     * comfortably is insensitive to the radius: `--break crate-zoom` scales the
     * 9 m collect radius by the camera zoom, and a bot that passes within 5 m
     * catches it at 7.02 m and at 10.98 m alike. 8.0 m of separation is inside
     * 9 and inside 10.98 and OUTSIDE 7.02, so it is the pass that can tell.
     */
    const marginal = (z) => {
      const c2 = { rng: createRNG(5), bug: P6BUG, zoom: z };
      const w2 = createWorld(c2, {});
      const f2 = createCrateField(w2, { wind: [[0, 0], [1500, 0]], lineX: 1e9, groundFire: false });
      const p2 = w2.spawn(playerType('kite_b1', 't2'), { id: 'p', side: 1, xM: 0, yM: -400, speed: 40 });
      const cc = f2.drop({ xM: 8.0, yM: -406.0, swing: 0 });
      w2.update(DT);
      return cc.alive ? 'missed' : 'caught';
    };
    const a = run(0.78), b = run(1.22);
    const ma = marginal(0.78), mb = marginal(1.22);
    return { same: a === b, marginal: ma + '/' + mb,
             assert: a === b && ma === mb };
  },
  /**
   * The same seed twice, and 200 crate missions through ONE world. A crate field
   * is the first thing in this game with a pool that recycles across missions,
   * and C10 measured +0 allocation over 200 duels without one in it.
   */
  determinism() {
    const run = () => JSON.stringify(crateMission({ level: 'k-drop', seed: 99, engage: 'cut',
      policy: POLICIES.cutLow.policy, silkBand: POLICIES.cutLow.silkBand, stopOnDeath: false }));
    const a = run(), b = run(), c = run();
    return { identical: a === b && b === c, assert: a === b && b === c };
  },

  noAllocation() {
    const L = CRATE_LEVELS['k-drop'];
    const R = crateWorld(L, { seed: 3, enemies: 2 });
    const count = () => { let n = 0; for (const c of R.field.crates) n++; for (const s of R.field.silk) n++; return n; };
    const cycle = () => {
      R.field.reset();
      for (const d of L.drops) R.field.drop({ xM: d[1], yM: -d[2] });
      for (let i = 0; i < 600; i++) R.world.update(DT);
    };
    for (let i = 0; i < 5; i++) cycle();          // warm
    const warm = count();
    for (let i = 0; i < 60; i++) cycle();
    return { warm, after: count(), assert: count() === warm };
  },

  /**
   * §3.3's bail-out canopy, on the SAME code as a crate canopy, and the thing
   * P5 shipped with nothing able to set it: shooting a man under silk sets
   * `world.blooded`, which every AI's flee decision reads. It banks nothing, the
   * auto-fire never offers it, and a pilot who reaches the ground is worth zero.
   */
  bloodedChute() {
    const ctx = { rng: createRNG(61), bug: P6BUG };
    const world = createWorld(ctx, {});
    const field = createCrateField(world, { wind: [[0, -3], [1500, -3]], lineX: 1e9, groundFire: false });
    const e = world.spawn(ENEMY_BY_ID.kestrel, { id: 'red', side: -1, xM: 0, yM: -400, speed: 40, theta: Math.PI });
    const p = world.spawn(playerType('kite_b1', 't2'), { id: 'player', side: 1, xM: -300, yM: -400, speed: 40 });
    e.bailed = true;
    world.update(DT);
    const chute = field.crates.find(c => c.alive && c.pilot);
    const offered = field.targetsFor(p).some(t => t.silk && t.crate && t.crate.pilot);
    const before = world.blooded;
    if (chute) {
      const V = GUNS.vMuzzle;
      const b = world.takeBullet();
      b.vx = V; b.vy = 0; b.x = chute.sx; b.y = chute.sy;
      b.alive = true; b.owner = 'player'; b.side = 1; b.dmg = 6;
      field.bulletPass(DT);
    }
    return { chuteExists: !!chute, offeredToAutoFire: offered, bloodedBefore: before,
             bloodedAfter: world.blooded, silkShot: world.stats.silkShot,
             banked: field.stats.playerBanked,
             assert: !!chute && !offered && !before && world.blooded === true
                     && world.stats.silkShot === 1 && field.stats.playerBanked === 0 };
  },

  /** The shotgun shell cuts a canopy in one shot (§4.8) and nothing else does. */
  shotgun() {
    const ctx = { rng: createRNG(51), bug: P6BUG };
    const world = createWorld(ctx, {});
    const field = createCrateField(world, { wind: [[0, 0], [1500, 0]], groundFire: false, lineX: 1e9 });
    const e = world.spawn(playerType('kite_b1', 't2'), { id: 'p', side: 1, xM: 0, yM: -400, speed: 40 });
    const c = field.drop({ xM: 20, yM: -400 });
    field.loadSpecial(e, 'shotgun');
    const before = c.cut;
    const ok = field.fireSpecial(e);
    return { fired: ok, wasCut: before, isCut: c.cut, ammo: e.specialAmmo,
             assert: ok && !before && c.cut };
  },
};

function runP6Fixtures() {
  const out = {};
  for (const [k, fn] of Object.entries(P6_FIXTURES)) out[k] = fn();
  return out;
}

/* ---------------------------------------------------------------- gates --- */

function p6Gates(runs = num('runs', 24)) {
  const g = [];
  const push = (id, name, value, op, threshold, unit, detail) => {
    const pass = op === '<=' ? value <= threshold : op === '>=' ? value >= threshold
               : op === 'in' ? (value >= threshold[0] && value <= threshold[1])
               : op === '==' ? value === threshold : value < threshold;
    g.push({ id, name, value, op, threshold, unit, pass, detail });
    return pass;
  };

  const phys = cratePhysics();
  push('K1', 'fall time from the top of the reachable column', +phys.fallFromCeiling.toFixed(2),
       'in', [85, 95], 's',
       `released at ${phys.ceilingM} m with the canopy open, measured by falling: ${phys.fallFromCeiling.toFixed(2)} s. ` +
       `terminal 14.40 m/s SL / ${phys.termAt.m1500} m/s at the ceiling, column mean ${phys.identity.columnMean.toFixed(2)} m/s ` +
       `(ARCHITECTURE §3.4 states 17). DESIGN §4.2's CdA 24 would give 193 s.`);

  push('K2', 'a shear curves a crate', Math.abs(phys.shear.driftWu), '>=', 200, 'wu',
       `reversing profile ${JSON.stringify(CRATE_LEVELS['k-shear'].wind)}: impact ${phys.shear.driftWu} wu ` +
       `(${phys.shear.driftM} m) from release in ${phys.shear.secs} s. ` +
       `AND the criterion as written is weak — a 200 wu displacement is produced by ANY wind, ` +
       `so here is the measurement that actually says the shear is real: the crate reaches ` +
       `${phys.shear.maxWu} wu and comes BACK to ${phys.shear.driftWu} wu, a reversal of ` +
       `${phys.shear.reversalWu} wu. The same time-weighted mean wind (${phys.shear.meanWind.toFixed(2)} m/s) ` +
       `held flat drifts ${phys.flat.driftWu} wu with a reversal of ${phys.flat.reversalWu} wu.`);

  const M = evModel({ sigmaJudge: 1.5 });
  const lo = M.rows.find(r => r.policy === 'cutLow');
  const fly = M.rows.find(r => r.policy === 'flyThrough');
  const hi = M.rows.find(r => r.policy === 'cutHigh');
  const ign = M.rows.find(r => r.policy === 'ignore');
  const an = evAnalytic();
  push('K3', 'the canopy-cut multiplier earns its place', M.T19, '>=', 1.35, 'x fly-through',
       `${M.samples} drop points across k-drop and k-shear, wind judged at sigma 1.5 m/s. Conditional ` +
       `on the take being made: cutLow ${lo.netTaken} against flyThrough ${fly.netTaken} = ${M.T19}x. ` +
       `${lo.taken} of ${lo.n} crates were judged worth cutting low; of those ${lo.burstPct}% burst and ` +
       `${lo.enemySidePct}% came down the wrong side. Small-arms exposure ${lo.exposureHPTaken} HP per cut, ` +
       `priced at ${HP_SCRIP.toFixed(4)} Scrip/HP from §4.4's own Parts crate. Whole-mission economy ` +
       `(declines included): cutLow ${lo.netMult} vs flyThrough ${fly.netMult} = ${M.T19policy}x, ` +
       `and doing nothing is ${ign.netMult} because the wind and the enemy take ${ign.enemySidePct}%. ` +
       `NOTE the exposure term is small: T17's ground fire costs 1.7 HP per cut, so what actually ` +
       `makes a low cut dangerous is 80 s committed to the bottom of the column, not bullets.`);

  push('K4', 'a high cut is worse than a fly-through', M.T20, '<', 1.0, 'x fly-through',
       `cutHigh ${hi.netTaken} against flyThrough ${fly.netTaken} = ${M.T20}x, burst ${hi.burstPct}%. ` +
       `THIS CRITERION IS UNPASSABLE AT DESIGN §4.3's AUTHORED T20 OF 0.35: value-only would be ` +
       `1.218x, and K3 and K4 are then jointly unsatisfiable for any multiplier (K3 needs >= ` +
       `${an.M_min_for_K3}, K4 needs < 1.269). T20 is refined to ${CRATE.burstHi} — the arithmetic ` +
       `forces >= ${an.burstNeededForK4AtM} — which is the register test T20 names, not a threshold move. ` +
       `See docs/P6_NOTES.md §5.`);

  const lad = ladderReport({ runs: Math.max(K5_RUNS, runs) });
  push('K5', 'the reinforcement ladder is not decoration', lad.tStat, '>=', 2, 'x SE',
       `RE-SPECIFIED per D139 onto HP per sortie — CONTINUOUS. T21's own test is "does losing 3 ` +
       `crates MEASURABLY raise the cost", and the death rate could not measure it: it was pooled on ` +
       `an OUTCOME-dependent filter (baseline inside 8-30%, so a 3.3% cell had no room to move) and ` +
       `quantised at ${lad.deathQuantumPts} points by ${lad.runs} sorties per cell. ` +
       `Now: +${lad.deltaHP} +-${lad.seHP} HP per sortie, t = ${lad.tStat} (PASS at >= 2), pooled over the ` +
       `${lad.deliveredCells}/${lad.cells.length} cells where the ladder was DELIVERED — selected on ` +
       `deltaRedSeconds > 0, a property of the TREATMENT, which cannot bias the outcome the way the old ` +
       `rule did. Positive in ${lad.positiveCells}/${lad.deliveredCells} of them. ` +
       `THE RE-SPECIFICATION ALONE DID NOT MOVE IT — D139's premise that "the ladder is fine" was ` +
       `itself measured on 30 sorties, and at 240 it converges to -0.78 +-1.80 and flips sign between ` +
       `seed blocks. What moved it is a DELIVERY defect: every flushed reinforcement spawned on ONE ` +
       `point, inside a 5.2 m collision radius that costs 60 HP a tick, so both arrived dead and the ` +
       `+45 enemy-seconds this gate read as DELIVERED were two carcasses lingering in world.live. ` +
       `--break rein-stacked restores it and reproduces the inherited +7.85 +-5.80, t 1.35 exactly. ` +
       `A SECOND delivery defect is fixed but is NOT visible here and the fixture owns it instead: ` +
       `the damage rung was applied over world.live, empty before tick 0, so it reached nobody in the ` +
       `pre-loaded arm. Isolated post-fix (--break preload-live) it is worth 0.05 HP per sortie — once ` +
       `two more aeroplanes are in the air, 12% on the others' bullets is not the binding term. ` +
       `Its guard is the ladderPreload fixture, which goes red at carrying 0/3 while the older ` +
       `ladderSpawns stays green, because ladderSpawns runs at enemies: 0 and could only ever check ` +
       `the ledger. ` +
       `SAMPLE SIZE IS DERIVED, NOT TUNED: a priori LADDER's smallest rung is step 2's dmgMult 1.12, ` +
       `worth ${lad.smallestRungHP} HP against a ${lad.baseHPPooled} HP pooled baseline, and seeing ` +
       `that at t >= 2 needs SE <= ${(lad.smallestRungHP / 2).toFixed(1)} — met at ${lad.runs} runs, ` +
       `SE ${lad.seHP}. That a-priori figure is CONSERVATIVE and the measurement says so: the rung ` +
       `really delivers 0.05 HP, which no sample could resolve, and sizing to it would be sizing to an ` +
       `effect the ladder does not depend on. ` +
       `MAGNITUDE, in a unit this sweep measures rather than one invented here: one MORE hostile ` +
       `aeroplane costs ${lad.hpPerEnemy} HP per sortie, so three lost crates are worth ` +
       `${lad.deltaAsEnemies} of an extra aeroplane. SECONDARY, reported not gated: the death-rate ` +
       `delta is ${lad.deltaPts >= 0 ? '+' : ''}${lad.deltaPts} points. Full sweep: ` +
       lad.cells.map(c => `${c.gun}/${c.enemies}e ${(c.base * 100).toFixed(0)}->${(c.with3 * 100).toFixed(0)}% ` +
                          `(${c.deltaHP >= 0 ? '+' : ''}${c.deltaHP}+-${c.seHP}HP, ` +
                          `${c.deltaRedSeconds >= 0 ? '+' : ''}${c.deltaRedSeconds} enemy-s)` +
                          `${c.delivered ? '*' : ' NOT DELIVERED'}`).join(' | ') + `.`);

  const free = swingReport({ runs: 600, pinned: false });
  const pin = swingReport({ runs: 600, pinned: true });
  const drop = +((pin.rate - free.rate) * 100).toFixed(2);
  const sweep = [9, 7, 5, 4, 3, 2].map(r => {
    const a = swingReport({ runs: 600, pinned: false, radius: r });
    const b = swingReport({ runs: 600, pinned: true, radius: r });
    return `${r} m: ${(100 * (b.rate - a.rate)).toFixed(1)}pts`;
  }).join(' | ');
  push('K6', 'the pendulum matters', drop, 'in', [2, 6], 'points',
       `MIS-SPECIFIED, and it cannot be satisfied by DESIGN's own two numbers. A swing-blind ` +
       `interception at the canopy centre line catches ${(free.rate * 100).toFixed(1)}% with the ` +
       `pendulum live and ${(pin.rate * 100).toFixed(1)}% with it pinned (--break pin-swing), over ` +
       `${free.runs} phases: ${drop} points. The reason is arithmetic: §4.2's swing is +-3 m ` +
       `(measured mean ${free.meanSwingM} m, worst offset ${free.maxOffsetM} m) and §4.3's collect ` +
       `radius is ${CRATE.collect} m, so the crate NEVER leaves the radius and the hitbox moving ` +
       `cannot cost a capture. To reach 2-6 points the swing would have to be ~9 m of amplitude, ` +
       `i.e. 86 deg of arc, which is not a canopy. Collect-radius sweep, same swing: ${sweep}. ` +
       `The constants are not moved; §4.2's own "3% harder to catch" is the claim that is wrong, ` +
       `and the pendulum earns its place as the thing that makes the crate READ as a crate.`);

  const good = reachReport({ level: 'k-drop' });
  const bad = reachReport({ level: 'k-drop', unreachable: 3 });
  push('K7', 'the reachability solver falsifies', bad.bad.length, '==', 1, 'crates named',
       `unmoved: ${good.bad.length} unreachable of ${good.rows.length}. With drop #3 shoved 26,000 wu ` +
       `downrange the solver names ${bad.bad.map(b => `${b.id} (${b.limit}, short ${b.shortM} m, ` +
       `margin ${b.catchMargin === -Infinity ? 'none' : b.catchMargin})`).join(', ')} — a name and a ` +
       `margin, not a count.`);

  const tightest = good.rows.slice(0, 10);
  push('K8', 'detail lines', tightest.length, '>=', Math.min(10, good.rows.length), 'lines',
       `every crate printed with its margin in seconds, sorted ascending, ten tightest always: ` +
       tightest.map(r => `${r.id} ${Math.max(r.catchMargin, r.cutMargin).toFixed(1)}s`).join(' | '));

  const ev2 = crateEvents();
  const need = ['crate:drop', 'crate:caught', 'crate:lost', 'crate:canopyHit'];
  const missing = need.filter(n => !ev2.seen[n]);
  push('K9', 'events', need.length - missing.length, '==', 4, 'events',
       need.map(n => `${n} x${ev2.seen[n] || 0} ${ev2.payloads[n] ? JSON.stringify(ev2.payloads[n]) : 'NO PAYLOAD'}`).join('  '));

  const zn = P6_FIXTURES.zoomNeutral();
  push('K10', 'zoom neutrality', zn.same ? 1 : 0, '==', 1, 'identical',
       `a full k-drop crate mission at forced zoom 0.78 and 1.22 produces a byte-identical summary. ` +
       `The tripwire that proves this can fail is weapons.js's --break zoom-range (C9).`);

  return g;
}

/* ------------------------------------------------------------ reporting --- */

function printMatrix(rows) {
  console.log('  ace  profile                      airframe      gun  win%   ttk  p90   rnds  acc   modal loss');
  for (const r of rows) {
    const p = ACES[r.ace];
    console.log(`  ${r.ace.padEnd(4)} ${p.tag.padEnd(28)} ${r.airframe.padEnd(13)} ${r.gun}  ${(r.win * 100).toFixed(1).padStart(5)}  ${String(r.meanTTK).padStart(4)}  ${String(r.p90TTK).padStart(4)}  ${String(r.rounds).padStart(5)}  ${r.acc.toFixed(3)}  ${r.modalLoss}`);
  }
}

function writeEnemiesJson() {
  const out = {
    _note: 'GENERATED by node tools/sim.mjs --enemies-json. js/sim/entities.js is canonical.',
    guns: GUN_TIERS, hp: HP_REF, spill: SPILL, cone: GUNS,
    colliders: COLLIDERS_PROFILE, collidersSpanReading: COLLIDERS_SPAN, subrects: SUBRECTS,
    enemies: ENEMY_TYPES.map(t => ({
      id: t.id, name: t.name, structure: t.structure, role: t.role, armour: t.armour,
      vmaxDeclared: t.vmaxDeclared, gun: t.gun, turrets: t.turrets,
      airframe: { m: t.airframe.m, S: t.airframe.S, CLmax: t.airframe.CLmax,
                  CD0: +t.airframe.CD0.toFixed(5), kInd: t.airframe.kInd, T0: t.airframe.T0,
                  vne: +t.airframe.vne.toFixed(1), cFlutter: +t.airframe.cFlutter.toFixed(4),
                  stressLimit: t.airframe.stressLimit, omLoDeg: +(t.airframe.omLo * DEG).toFixed(1),
                  vs: +t.airframe.vs.toFixed(2) },
      hp: makeHP(t.structure),
    })),
    aces: ACE_IDS.map(id => ({ ...ACES[id] })),
  };
  writeFileSync(join(ROOT, 'data/tables/enemies.json'), JSON.stringify(out, null, 2) + '\n');
  console.log('wrote data/tables/enemies.json');
}

/* ------------------------------------------------------------------ main -- */

function printEnvelope() {
  const ids = opt('airframe') ? [opt('airframe')] : AIRFRAMES.map(a => a.id);
  const csv = ['airframe,alt_m,Vs,Vmax,V_term,RoC,RoC_at,corner_lo,corner_hi,omega_inst_max,omega_sus_max,zoom_climb_m,glide_LD,ceiling_m'];
  for (const id of ids) {
    const a = AIRFRAME_BY_ID[id];
    if (!a) { console.error(`no airframe ${id}`); continue; }
    const rows = envelope(a);
    const term = measureTerminal(a);
    const z = measureZoomClimb(a);
    const gl = measureGlide(a, 500);
    const ceil = measureCeiling(a);
    console.log(`\n=== ${a.name} (${a.id})  m ${a.m} kg  S ${a.S} m2  CLmax ${a.CLmax}  CD0 ${a.CD0}  kInd ${a.kInd}  T0 ${a.T0} N  Vne ${a.vne} m/s`);
    console.log(`    observables: T/W ${a.t.toFixed(4)}  CD0/CLmax ${a.p0.toFixed(5)}  kInd*CLmax ${a.kappa.toFixed(5)}  Vs ${a.vs.toFixed(2)}  stress limit ${a.stressLimit.toFixed(2)}`);
    for (const r of rows) {
      console.log(`    ${String(r.altM).padStart(5)} m   Vs ${r.vs.toFixed(2)}  Vmax ${r.vmax.toFixed(2)}  RoC ${r.roc.toFixed(2)} at ${r.rocV} (flat ${r.rocFlat[0]}-${r.rocFlat[1]})  inst_max ${r.instMax.toFixed(1)}  sus_max ${r.susMax.toFixed(1)} deg/s`);
      console.log(`             inst ${r.susSpeeds.map((v, i) => `${v}:${r.inst[i].toFixed(0)}`).join(' ')}`);
      console.log(`             sus  ${r.susSpeeds.map((v, i) => `${v}:${r.sus[i].toFixed(0)}`).join(' ')}`);
      if (r.corner) console.log(`             corner ${r.corner.lo}-${r.corner.hi} m/s at ${(r.corner.om * DEG).toFixed(1)} deg/s`);
      csv.push([a.id, r.altM, r.vs.toFixed(2), r.vmax.toFixed(2), r.altM === 0 ? term.toFixed(2) : '', r.roc.toFixed(2), r.rocV,
        r.corner ? r.corner.lo : '', r.corner ? r.corner.hi : '', r.instMax.toFixed(1), r.susMax.toFixed(1),
        r.altM === 0 ? z.gainM.toFixed(0) : '', r.altM === 0 ? gl.ld.toFixed(2) : '', r.altM === 0 ? ceil : ''].join(','));
    }
    console.log(`    terminal (vertical, full power) ${term.toFixed(2)} m/s = Vne x ${(term / a.vne).toFixed(3)}   zoom climb ${z.gainM.toFixed(0)} m in ${z.secs.toFixed(1)} s   glide L/D ${gl.ld.toFixed(2)}   ceiling ${ceil} m`);
  }
  if (opt('csv')) { writeFileSync(opt('csv'), csv.join('\n')); console.log(`\nwrote ${opt('csv')}`); }
}

function writeAirframesJson() {
  const p = join(ROOT, 'data/tables/airframes.json');
  const data = {
    _: 'GENERATED by `node tools/sim.mjs --airframes-json`. js/data/tables.js is the source of truth.',
    scale: { m_per_wu: M_PER_WU, g_si: G_SI, agility: AGILITY, n_ref: N_REF },
    airframes: AIRFRAMES.map(a => ({
      id: a.id, name: a.name, act: a.act,
      si: { m: a.m, S: a.S, CLmax: a.CLmax, CD0: a.CD0, kInd: a.kInd, T0: a.T0, vne: a.vne, cFlutter: a.cFlutter },
      observables: { tw: +a.t.toFixed(5), cd0_clmax: +a.p0.toFixed(6), kind_clmax: +a.kappa.toFixed(6), vs: +a.vs.toFixed(3) },
      stressLimit: a.stressLimit,
      wu: { vs: +a.vsWu.toFixed(1), vne: +a.vneWu.toFixed(1), hull: a.hullWu },
    })),
  };
  writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
  console.log('wrote data/tables/airframes.json');
}

function main() {
  if (flag('break')) {
    const which = opt('break', '');
    if (BREAKS[which]) { BROKEN = which; console.log(`BROKEN: ${which} — ${BREAKS[which]}\n`); }
    else if (P5_BREAKS[which]) { P5BUG = which; console.log(`BROKEN: ${which} — ${P5_BREAKS[which]}\n`); }
    else if (P6_BREAKS[which]) { P6BUG = which; console.log(`BROKEN: ${which} — ${P6_BREAKS[which]}\n`); }
    else if (P9_BREAKS[which]) { P9BUG = which; if (!flag('quiet')) console.error(`BROKEN: ${which} — ${P9_BREAKS[which]}`); }
    else { console.error(`--break must be one of: ${[...Object.keys(BREAKS), ...Object.keys(P5_BREAKS), ...Object.keys(P6_BREAKS), ...Object.keys(P9_BREAKS)].join(', ')}`); return; }
  }
  if (opt('colliders')) console.log(`colliders: ${setColliderSet(opt('colliders'))}\n`);

  if (flag('purity')) {
    const r = purity();
    for (const b of r.bad) console.log('  FAIL  ' + b);
    console.log(`  ${r.bad.length ? 'FAIL' : 'PASS'}  purity — ${r.files} modules in the graph, ${r.bad.length} violations`);
    return;
  }

  if (flag('enemies-json')) return writeEnemiesJson();

  if (flag('combat')) {
    const aspects = [['dead astern', 180], ['astern low', 160], ['astern high', 200], ['abeam', 270], ['head-on', 0], ['above', 250]];
    console.log('  gunnery rig — T2 Vickers on a 60 HP Kestrel at 45 m, everything on target\n');
    console.log('  aspect        secs  fired hits  acc    structure engine wingU wingL tail fuel pilot');
    for (const [name, b] of aspects) {
      const r = gunRig({ gunId: 't2', rangeM: 45, bearDeg: b, ctxBug: P5BUG });
      const L = r.lost;
      console.log(`  ${name.padEnd(12)} ${r.secs.toFixed(2).padStart(5)} ${String(r.fired).padStart(5)} ${String(r.hits).padStart(4)}  ${r.acc.toFixed(3)}  ${String(L.structure).padStart(8)} ${String(L.engine).padStart(6)} ${String(L.wingU).padStart(5)} ${String(L.wingL).padStart(5)} ${String(L.tail).padStart(4)} ${String(L.fuel).padStart(4)} ${String(L.pilot).padStart(5)}`);
    }
    console.log('\n  range sweep, dead astern (register T11 — does the straddle discourage ramming?)');
    for (const R of [5, 8, 12, 20, 30, 40, 55, 66]) {
      const r2 = gunRig({ gunId: 't2', rangeM: R, bearDeg: 180, ctxBug: P5BUG });
      const r1 = gunRig({ gunId: 't1', rangeM: R, bearDeg: 180, ctxBug: P5BUG });
      console.log(`    ${String(R).padStart(3)} m   two guns ${r2.secs.toFixed(2)} s acc ${r2.acc.toFixed(3)}   one gun ${r1.secs.toFixed(2)} s acc ${r1.acc.toFixed(3)}`);
    }
    console.log('\n  gun tiers, dead astern at 50 m');
    for (const g of GUN_TIERS) {
      const r = gunRig({ gunId: g.id, rangeM: 50, bearDeg: 180, ctxBug: P5BUG });
      console.log(`    ${g.id} ${g.name.padEnd(20)} ${r.secs.toFixed(2)} s   acc ${r.acc.toFixed(3)}   dps-on-structure ${r.dps}`);
    }
    const onPlayer = gunRig({ gunId: 't1', shooterType: ENEMY_BY_ID.kestrel, targetIsPlayer: true, rangeM: 50, bearDeg: 180, maxSecs: 60, ctxBug: P5BUG });
    const scout = gunRig({ gunId: 't2', rangeM: 50, bearDeg: 180, ctxBug: P5BUG });
    console.log(`\n  C2/C3: player kills a scout in ${scout.secs.toFixed(2)} s; one Kestrel needs ${onPlayer.secs.toFixed(2)} s on the player`);
    console.log(`         lethality ratio ${(onPlayer.secs / scout.secs).toFixed(1)}x`);
    return;
  }

  if (flag('duel')) {
    const ace = opt('duel', 'A10');
    const r = duelBatch({ ace, airframe: opt('airframe', INTENDED[ACES[ace] ? ACES[ace].act : 1].airframe),
                          gun: opt('gun', INTENDED[ACES[ace] ? ACES[ace].act : 1].gun),
                          runs: num('runs', 200), counter: opt('counter', null), ctxBug: P5BUG, zoom: num('zoom', 1) });
    console.log(JSON.stringify(r, null, 2));
    return;
  }

  if (flag('matrix')) {
    const rows = duelMatrix(num('runs', 200));
    printMatrix(rows);
    if (opt('json')) writeFileSync(opt('json'), JSON.stringify(rows, null, 2));
    return;
  }

  if (flag('counterplay')) {
    const rows = counterplay(num('runs', 200), flag('placebo'));
    console.log(`  ace  counter            base%   with%   delta pts`);
    for (const r of rows) {
      if (!r.counter) { console.log(`  ${r.ace.padEnd(4)} ${'(none)'.padEnd(18)} ${(r.base * 100).toFixed(1).padStart(6)}       —       —   ${r.exempt}`); continue; }
      console.log(`  ${r.ace.padEnd(4)} ${r.counter.padEnd(18)} ${(r.base * 100).toFixed(1).padStart(6)}  ${(r.with * 100).toFixed(1).padStart(6)}  ${String(r.delta).padStart(7)}${r.needsCrates ? '   (needs crates — P6)' : ''}`);
    }
    return;
  }

  if (flag('flee')) { console.log(JSON.stringify(fleeRate({ runs: num('runs', 60) }), null, 2)); return; }

  /* --------------------------------------------------------------- P6 --- */

  if (flag('crates')) { console.log(JSON.stringify(cratePhysics(), null, 2)); return; }

  if (flag('reach')) {
    printReach(reachReport({ level: opt('level', 'k-drop'),
                             airframe: AIRFRAME_BY_ID[opt('airframe', 'kite_b1')] || REFERENCE,
                             unreachable: num('unreachable', -1) }));
    return;
  }

  if (flag('evmodel')) {
    const r = evModel({ sigmaJudge: num('sigma', 1.5) });
    console.log(`  the decision model — ${r.samples} drop points x ${r.levels.length} levels, ` +
                `player wind-judgement sigma ${r.sigmaJudge} m/s`);
    console.log(`  a hit point is worth ${r.hpScrip.toFixed(4)} Scrip (§4.4's Parts crate: 20 / 45); ` +
                `a crate is worth ${CRATE_EV.toFixed(2)}\n`);
    console.log('  policy       taken  declined  enemy%  burst%  commit s   expHP*  net*   x fly*   |  policy net  x fly');
    for (const x of r.rows) {
      console.log(`  ${x.policy.padEnd(11)} ${String(x.taken).padStart(5)} ${String(x.declined).padStart(9)} ` +
                  `${x.enemySidePct.toFixed(1).padStart(6)} ${x.burstPct.toFixed(1).padStart(7)} ` +
                  `${x.commitS.toFixed(1).padStart(9)} ${x.exposureHPTaken.toFixed(2).padStart(8)} ` +
                  `${x.netTaken.toFixed(3).padStart(6)} ${x.vsFlyThroughTaken.toFixed(3).padStart(7)}   |  ` +
                  `${x.netMult.toFixed(3).padStart(8)} ${x.vsFlyThrough.toFixed(3).padStart(6)}`);
    }
    console.log('  * = conditional on the take being made, which is what K3/K4 ask about.');
    console.log(`\n  T19 = ${r.T19}x (policy-level ${r.T19policy}x)    T20 = ${r.T20}x (policy-level ${r.T20policy}x)`);
    console.log('  ' + JSON.stringify(evAnalytic(), null, 2).replace(/\n/g, '\n  '));
    if (opt('json')) writeFileSync(opt('json'), JSON.stringify(r, null, 2));
    return;
  }

  if (flag('ev')) {
    const r = evReport({ level: opt('level', 'k-drop'), runs: num('runs', 24) });
    console.log(`  expected value per crate dropped — ${r.level}, ${r.runs} sorties per policy`);
    console.log(`  a hit point is worth ${r.hpScrip.toFixed(4)} Scrip (§4.4's Parts crate: 20 / 45)\n`);
    console.log('  policy       gross   dmgHP   dmgCost     net    x fly   deaths  banked  lost  burst  ladder');
    for (const x of r.rows) {
      console.log(`  ${x.policy.padEnd(11)} ${x.grossPerCrate.toFixed(3).padStart(6)} ` +
                  `${x.damageHPPerCrate.toFixed(1).padStart(7)} ${x.damageCost.toFixed(3).padStart(9)} ` +
                  `${x.netPerCrate.toFixed(3).padStart(7)} ${x.vsFlyThrough.toFixed(3).padStart(7)} ` +
                  `${x.deathRate.toFixed(3).padStart(8)} ${String(x.banked).padStart(7)} ` +
                  `${String(x.enemyBanked).padStart(5)} ${String(x.burst).padStart(6)} ${String(x.ladderSteps).padStart(7)}`);
    }
    console.log(`\n  T19 (low cut vs fly-through) = ${r.T19}x    T20 (high cut) = ${r.T20}x`);
    console.log(`  analytic, value only: ${JSON.stringify(evAnalytic())}`);
    if (opt('json')) writeFileSync(opt('json'), JSON.stringify(r, null, 2));
    return;
  }

  if (flag('fires')) { console.log(JSON.stringify(fireReport(), null, 2)); return; }

  if (flag('levelrun')) {
    if (!opt('levelfile')) {
      console.error('--levelrun needs --levelfile data/levels/<id>.json');
      process.exitCode = 1; return;
    }
    const files = [opt('levelfile')];
    const runs = num('runs', 1);
    const out = [];
    for (const f of files) {
      const raw = JSON.parse(readFileSync(f, 'utf8'));
      const hashes = new Set();
      let first = null;
      for (let i = 0; i < runs; i++) {
        const r = levelRun({ level: raw, seed: num('seed', 5), secs: num('secs', 300) });
        r.hash = levelHash(r);
        hashes.add(r.hash);
        if (!first) first = r;
      }
      out.push({ ...first, runs, distinctHashes: hashes.size });
    }
    console.log(JSON.stringify(out.length === 1 ? out[0] : out, null, 2));
    return;
  }

  if (flag('spawner')) {
    const raw = JSON.parse(readFileSync(opt('levelfile'), 'utf8'));
    const out = spawnerRun({ level: raw, secs: num('secs', 300), seed: num('seed', 5),
                             enemies: num('enemies', 0) });
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  if (flag('ladder')) {
    if (flag('probe')) {
      for (const lost of [0, 3]) {
        const L = CRATE_LEVELS['k-drop'];
        const R = crateWorld(L, { seed: 4000, engage: 'none' });
        R.player.cratePolicy = { run: false };
        for (let k = 0; k < lost; k++) R.field.advanceLadder();
        const line = [];
        for (let i = 0; i < Math.round(200 / DT); i++) {
          R.world.update(DT);
          for (let k = 0; k < R.world.live.length; k++) keepInside(R.world, R.world.live[k], L);
          if (i % 1800 === 0) line.push(`${(i / 60) | 0}s live=${R.world.live.length} hp=${R.player.hp.structure.toFixed(0)}`);
        }
        console.log(lost, 'reinf=' + R.reinforcedAt(), line.join(' | '));
      }
      return;
    }
    const runs = num('runs', K5_RUNS);
    const lad = ladderReport({ runs, level: opt('level', 'k-drop') });
    if (opt('json')) writeFileSync(opt('json'), JSON.stringify(lad, null, 2));
    console.log(`  K5 / T21 ladder — level ${lad.level}, ${lad.runs} sorties per cell per arm, ` +
                `seeds ${lad.seed0}..${lad.seed0 + lad.runs - 1}, ${lad.cells.length} cells (2 guns x 3 enemy counts)` +
                (P6BUG ? `, BROKEN: ${P6BUG}` : ''));
    console.log('\n  cell    baseHP  deltaHP    +-SE      t   death% -> %   d-en-s/base  reinf  delivered');
    for (const c of lad.cells) {
      const t = c.seHP > 0 ? (c.deltaHP / c.seHP).toFixed(2) : '—';
      console.log(`  ${c.gun}/${c.enemies}e ${c.baseHP.toFixed(1).padStart(8)} ` +
                  `${(c.deltaHP >= 0 ? '+' : '') + c.deltaHP.toFixed(1)}`.padStart(10) +
                  ` ${c.seHP.toFixed(2).padStart(6)} ${String(t).padStart(6)}   ` +
                  `${(c.base * 100).toFixed(1).padStart(5)}->${(c.with3 * 100).toFixed(1).padStart(5)}  ` +
                  `${((c.deltaRedSeconds >= 0 ? '+' : '') + c.deltaRedSeconds.toFixed(1)).padStart(9)}` +
                  `${('/' + c.baseRedSeconds.toFixed(0)).padStart(7)} ${c.reinf.toFixed(2).padStart(6)}  ` +
                  `${c.delivered ? 'yes' : 'NO'}`);
    }
    console.log(`\n  POOLED over the ${lad.deliveredCells}/${lad.cells.length} DELIVERED cells: ` +
                `${lad.deltaHP >= 0 ? '+' : ''}${lad.deltaHP} +-${lad.seHP} HP per sortie, t = ${lad.tStat} ` +
                `(bar >= 2), positive in ${lad.positiveCells}/${lad.deliveredCells}`);
    console.log(`  ALL ${lad.cells.length} cells, ungated: ${lad.deltaHPAll >= 0 ? '+' : ''}${lad.deltaHPAll} ` +
                `+-${lad.seHPAll} HP, t = ${lad.tStatAll}`);
    console.log(`  SECONDARY, not gated: death-rate delta ${lad.deltaPts >= 0 ? '+' : ''}${lad.deltaPts} pts ` +
                `at a quantum of ${lad.deathQuantumPts} pts; one more hostile aeroplane costs ` +
                `${lad.hpPerEnemy} HP, so this is ${lad.deltaAsEnemies} of an extra aeroplane`);
    console.log(`  ${lad.tStat >= 2 ? 'PASS' : 'FAIL'}  K5`);
    return;
  }

  if (flag('swing')) {
    const free = swingReport({ runs: num('runs', 600), pinned: false });
    const pin = swingReport({ runs: num('runs', 600), pinned: true });
    console.log(JSON.stringify({ free, pinned: pin, deltaPts: +((pin.rate - free.rate) * 100).toFixed(2) }, null, 2));
    return;
  }

  if (flag('mission')) {
    const P = POLICIES[opt('policy', 'flyThrough')] || POLICIES.flyThrough;
    console.log(JSON.stringify(crateMission({ level: opt('level', 'k-drop'), seed: num('seed', 1),
      policyName: opt('policy', 'flyThrough'), engage: P.engage, policy: P.policy,
      enemies: opt('enemies') !== null ? num('enemies') : undefined,
      preLost: num('prelost', 0), noDrops: flag('nodrops'), gun: opt('gun') || undefined,
      groundFire: !flag('noground'),
      silkBand: P.silkBand, stopOnDeath: false }), null, 2));
    return;
  }

  if (flag('p6fixtures')) {
    const out = runP6Fixtures();
    let bad = 0;
    for (const [k, v] of Object.entries(out)) {
      if (!v.assert) bad++;
      const { assert, ...rest } = v;
      console.log(`  ${assert ? 'PASS' : 'FAIL'}  ${k.padEnd(14)} ${JSON.stringify(rest)}`);
    }
    console.log(`\n  ${Object.keys(out).length - bad}/${Object.keys(out).length} pass`);
    return;
  }

  if (flag('p6gates')) {
    const g = p6Gates(num('runs', 24));
    for (const c of g) {
      console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.id.padEnd(4)} ${c.name}`);
      console.log(`        value ${JSON.stringify(c.value)} ${c.op} ${JSON.stringify(c.threshold)} ${c.unit}`);
      console.log(`        ${c.detail}`);
    }
    const n = g.filter(c => c.pass).length;
    console.log(`\n  ${n}/${g.length} pass`);
    if (opt('json')) writeFileSync(opt('json'), JSON.stringify({ gate: 'crates', criteria: g }, null, 2));
    return;
  }


  if (flag('p5fixtures')) {
    const out = runP5Fixtures();
    let bad = 0;
    for (const [k, v] of Object.entries(out)) {
      if (!v.assert) bad++;
      const { assert, ...rest } = v;
      console.log(`  ${assert ? 'PASS' : 'FAIL'}  ${k.padEnd(14)} ${JSON.stringify(rest)}`);
    }
    console.log(`\n  ${Object.keys(out).length - bad}/${Object.keys(out).length} pass`);
    return;
  }

  if (flag('p5gates')) {
    const { rows, matrix, counter, flee } = p5Gates(num('runs', 200));
    let bad = 0;
    for (const r of rows) {
      if (!r.ok) bad++;
      console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.id.padEnd(4)} ${r.what.padEnd(44)} ${r.val}${r.note ? `\n            (${r.note})` : ''}`);
    }
    console.log(`\n  ${rows.length - bad}/${rows.length} pass`);
    if (flag('full')) { console.log(''); printMatrix(matrix); }
    if (opt('json')) writeFileSync(opt('json'), JSON.stringify({ rows, matrix, counter, flee }, null, 2));
    return;
  }

  if (flag('airframes-json')) return writeAirframesJson();

  if (flag('units')) {
    const u = unitIdentity();
    console.log(`k = ${u.kSI.toExponential(4)} /m = ${u.kWU.toExponential(4)} /wu`);
    console.log(`v_term = sqrt(g/k) = ${u.vSI.toFixed(2)} m/s = ${u.vWU.toFixed(1)} wu/s   agree: ${u.agrees}`);
    return;
  }

  if (flag('envelope')) return printEnvelope();

  if (flag('gates')) {
    const rows = gates();
    let bad = 0;
    for (const r of rows) {
      if (!r.ok) bad++;
      console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.id.padEnd(4)} ${r.what.padEnd(34)} ${r.val}${r.note ? `\n            (${r.note})` : ''}`);
    }
    console.log(`\n  ${rows.length - bad}/${rows.length} pass`);
    if (opt('json')) writeFileSync(opt('json'), JSON.stringify(rows, null, 2));
    process.exitCode = 0;
    return;
  }

  if (flag('fixtures')) {
    const out = runFixtures();
    let bad = 0;
    for (const [k, v] of Object.entries(out)) {
      if (!v.assert) bad++;
      const { assert, hash, ...rest } = v;
      console.log(`  ${assert ? 'PASS' : 'FAIL'}  ${k.padEnd(14)} ${hash}  ${JSON.stringify(rest)}`);
    }
    if (flag('bless')) {
      writeFileSync(join(ROOT, 'tools/BLESSED.json'), JSON.stringify(out, null, 2) + '\n');
      console.log('  blessed -> tools/BLESSED.json');
    } else if (existsSync(join(ROOT, 'tools/BLESSED.json'))) {
      const b = JSON.parse(readFileSync(join(ROOT, 'tools/BLESSED.json'), 'utf8'));
      for (const k of Object.keys(out)) {
        if (b[k] && b[k].hash !== out[k].hash) { console.log(`  HASH DRIFT ${k}: ${b[k].hash} -> ${out[k].hash}`); bad++; }
      }
    }
    console.log(`\n  ${Object.keys(out).length - bad}/${Object.keys(out).length} pass`);
    return;
  }

  if (flag('determinism')) {
    const runs = num('runs', 1000);
    const mk = () => traceHash(plane({ speed: 40, altM: 800, seed: num('seed', 42) }), 6, (ac, t) => Math.sin(t * 1.7) * 0.8).hash;
    const h0 = mk();
    for (let i = 1; i < runs; i++) if (mk() !== h0) { console.log(`DIVERGED at run ${i}`); process.exitCode = 1; return; }
    console.log(`${runs} runs, all ${h0}`);
    return;
  }

  if (flag('all')) {
    console.log('--all needs data/levels/, which is P9. The run-summary shape is live: try --level synthetic.');
    return;
  }

  // default: one run summary
  const r = runLevel({
    level: opt('level', 'synthetic'), seed: num('seed', 7),
    tier: opt('pilot', 'competent'), secs: num('secs', 120),
    airframe: AIRFRAME_BY_ID[opt('airframe', 'kite_b1')] || REFERENCE,
    zoom: num('zoom', 1),
  });
  console.log(JSON.stringify(r, null, 2));
  if (opt('json')) writeFileSync(opt('json'), JSON.stringify(r, null, 2));
}

export { measureStall, measureVmax, measureRoC, measureTerminal, measureInstOmega,
         measureSusOmega, measureSusMax, measureBleed, measureTurnCircle, measureCorner,
         instPoint, measureDiveRecovery, measureZoomClimb, measureGlide, measureCeiling,
         cornerStatic, envelope, gates, runLevel, plane, fly, RIG_ALT };

const invoked = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invoked) main();
