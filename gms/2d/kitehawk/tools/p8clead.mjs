#!/usr/bin/env node
/**
 * P8c — the LEAD, DERIVED PER AXIS.
 *
 * D108 fitted `leadSeconds` as a fraction of frame WIDTH, and P8b showed the
 * derivation is circular (portrait was matched to landscape's 0.70, which had
 * never been measured) and single-axis (`camera.js:393` applies the same scalar
 * to `leadY`). This file replaces the fitting with a constraint that has a
 * measurable failure mode:
 *
 *   the clamp DISCARDS the lead whenever  |v_axis| * leadSeconds > headroom_axis
 *   so any lead time above  headroom_axis / |v_axis|  buys NOTHING on that axis
 *   and merely pins the aeroplane against the playfield bound (D106, D110).
 *
 *   leadSeconds <= min over axes of ( headroom_axis / v_axis,p90 )
 *
 * The headrooms are the closed form of `camera.js:420-433`; the speeds are
 * MEASURED per axis over engaged ticks (D115), not the 280 wu/s "cruise" D108
 * assumed. Neither half is chosen — the sweep at the bottom is a report, not the
 * source of the number.
 *
 *   node tools/p8clead.mjs                # the derivation + the sweep
 *   node tools/p8clead.mjs --geometry     # closed form only, instant
 *   node tools/p8clead.mjs --runs 16
 */
import { traceDuel, segment, makeView, pct } from './p8engage.mjs';
import { VIEW_PROFILE } from '../js/core/viewprofile.js';
import { M_PER_WU } from '../js/core/math.js';
import { HULL_M } from '../js/sim/damage.js';
import { ACE_IDS } from '../js/sim/ai.js';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const has = (k) => argv.includes(k);
const RUNS = Number(arg('--runs', 16));
const HULL_WU = HULL_M / M_PER_WU;
const f2 = (x) => Number(x).toFixed(2);

/** The closed form of camera.js:420-433. Same arithmetic P8b §4.1 validated. */
function headrooms(mode) {
  const v = makeView(mode), P = v.profile, pf = P.playfield;
  const pfW = pf.right - pf.left, pfH = pf.bottom - pf.top;
  const mx = HULL_WU * 0.5 / v.worldW, my = HULL_WU * 0.25 / v.worldH;
  return {
    v, P,
    x: (P.anchorX * pfW - mx) * v.worldW,
    // +Y is down: a CLIMB pushes the aeroplane towards playfield.bottom from
    // anchorYClimb, a DIVE towards playfield.top from anchorYDive.
    climb: (pf.bottom - (pf.top + P.anchorYClimb * pfH) - my) * v.worldH,
    dive: ((pf.top + P.anchorYDive * pfH) - pf.top - my) * v.worldH,
  };
}

/* ---------------------------------------------- measured per-axis speeds */
function speeds(runs = RUNS) {
  const view = makeView('landscape');           // the sim is orientation-blind
  const VX = [], UP = [], DN = [];
  for (let i = 0; i < runs; i++) {
    const T = traceDuel({ ace: ACE_IDS[i % ACE_IDS.length], seed: 1000 + i, view });
    for (const s of segment(T, { sep: 1400 }))
      for (let k = s.i0; k <= s.i1; k++) {
        VX.push(Math.abs(T.vx[k]));
        if (T.vy[k] < 0) UP.push(-T.vy[k]); else DN.push(T.vy[k]);
      }
  }
  return { x: VX, climb: UP, dive: DN };
}

/** Clip accounting at a forced `leadSeconds`, on a CLONED profile. */
function clipAt(mode, leadSeconds, runs = RUNS) {
  const base = VIEW_PROFILE[mode];
  const view = makeView(mode);
  view.profile = leadSeconds === undefined ? base : { ...base, leadSeconds };
  let eng = 0, cx = 0, cy = 0, cap = 0, sx = 0, sy = 0;
  for (let i = 0; i < runs; i++) {
    const T = traceDuel({ ace: ACE_IDS[i % ACE_IDS.length], seed: 1000 + i, view });
    for (const s of segment(T, { sep: 1400 }))
      for (let k = s.i0; k <= s.i1; k++) {
        eng++; cap += T.cap[k];
        if (T.clipX[k] > 0) cx++;
        if (T.clipY[k] > 0) cy++;
        sx += T.clipX[k] * view.w; sy += T.clipY[k] * view.h;
      }
  }
  return { eng, cx, cy, cap, sx, sy };
}

const H = { portrait: headrooms('portrait'), landscape: headrooms('landscape') };

console.log('\n=== HEADROOM PER AXIS, wu — the closed form of camera.js:420-433 ===\n');
console.log(`  ${'axis'.padEnd(12)} ${'PORTRAIT'.padEnd(14)} LANDSCAPE`);
for (const a of ['x', 'climb', 'dive'])
  console.log(`  ${a.padEnd(12)} ${f2(H.portrait[a]).padEnd(14)} ${f2(H.landscape[a])}`);

if (has('--geometry')) process.exit(0);

const S = speeds();
console.log(`\n=== MEASURED SPEED PER AXIS, wu/s — ${RUNS} duels, ENGAGED ticks (D115) ===`);
console.log(`    the sim is orientation-blind, so this column is BOTH orientations\n`);
console.log(`  ${'axis'.padEnd(12)} ${'n'.padEnd(8)} p50    p75    p90    p95    p99`);
for (const a of ['x', 'climb', 'dive'])
  console.log(`  ${a.padEnd(12)} ${String(S[a].length).padEnd(8)}` +
              [50, 75, 90, 95, 99].map((p) => pct(S[a], p).toFixed(0).padStart(5) + '  ').join(''));

console.log(`\n=== THE DERIVATION — headroom / v_p90, per axis, per orientation ===\n`);
console.log(`  ${'axis'.padEnd(12)} ${'PORTRAIT'.padEnd(34)} LANDSCAPE`);
const budget = {};
for (const m of ['portrait', 'landscape']) budget[m] = {};
for (const a of ['x', 'climb', 'dive']) {
  const cell = (m) => {
    const t = H[m][a] / pct(S[a], 90);
    budget[m][a] = t;
    return `${f2(H[m][a]).padStart(7)} / ${pct(S[a], 90).toFixed(0)} = ${t.toFixed(3)} s`;
  };
  console.log(`  ${a.padEnd(12)} ${cell('portrait').padEnd(34)} ${cell('landscape')}`);
}
console.log('');
for (const m of ['portrait', 'landscape']) {
  const bind = ['x', 'climb', 'dive'].reduce((b, a) => budget[m][a] < budget[m][b] ? a : b, 'x');
  const derived = Math.floor(budget[m][bind] * 100) / 100;
  console.log(`  ${m.toUpperCase().padEnd(10)} binding axis ${bind.toUpperCase().padEnd(6)} ` +
              `budget ${budget[m][bind].toFixed(3)} s -> ${derived.toFixed(2)} s (rounded DOWN: it is an upper bound)` +
              `   SHIPPED ${VIEW_PROFILE[m].leadSeconds}`);
}
const rP = budget.portrait.x / budget.portrait.dive, rL = budget.landscape.x / budget.landscape.dive;
console.log(`\n  x/dive budget ratio: portrait ${rP.toFixed(3)}, landscape ${rL.toFixed(3)} — it INVERTS, by ${(rL / rP).toFixed(1)}x.`);
console.log(`  The binding axis is therefore the OPPOSITE ONE in the two orientations. No single`);
console.log(`  scalar can be right on both axes of both profiles, and in landscape it cannot be`);
console.log(`  right on both axes at all: the two budgets are ${budget.landscape.dive.toFixed(2)} s and ${budget.landscape.x.toFixed(2)} s.`);

console.log(`\n=== THE SWEEP — a REPORT, not the source of the number ===`);
console.log(`    clipX% / clipY% of engaged ticks, ${RUNS} duels, cloned profile\n`);
console.log(`  ${'leadSeconds'.padEnd(14)} ${'PORTRAIT'.padEnd(22)} LANDSCAPE`);
for (const L of [0, 0.20, 0.27, 0.39, 0.50, 0.63, 0.70, 1.0]) {
  const row = (m) => {
    const r = clipAt(m, L);
    return `${(100 * r.cx / r.eng).toFixed(1)}% / ${(100 * r.cy / r.eng).toFixed(1)}%` +
           `  cap ${(100 * r.cap / r.eng).toFixed(1)}%`;
  };
  const tag = L === VIEW_PROFILE.portrait.leadSeconds ? `${L} (P)`
            : L === VIEW_PROFILE.landscape.leadSeconds ? `${L} (L)` : String(L);
  console.log(`  ${tag.padEnd(14)} ${row('portrait').padEnd(22)} ${row('landscape')}`);
}
console.log('');
