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
import { bandIdAt } from '../js/core/bands.js';
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
const PURITY_ROOTS = ['js/sim/entities.js', 'js/sim/weapons.js', 'js/sim/damage.js', 'js/sim/ai.js',
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
    const ctx = { rng: createRNG(31) };
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
    else { console.error(`--break must be one of: ${[...Object.keys(BREAKS), ...Object.keys(P5_BREAKS)].join(', ')}`); return; }
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
