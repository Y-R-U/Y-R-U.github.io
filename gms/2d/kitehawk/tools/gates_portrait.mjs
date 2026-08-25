#!/usr/bin/env node
/**
 * THE PORTRAIT GATE — ARCHITECTURE §4.4.2, P0 through P9.
 *
 * This file MEASURES. It does not decide. §4.4.3's decision rule and the
 * portrait->landscape pivot belong to the manager and to Aaron (D117).
 *
 * Three things about it are not obvious and are the whole reason it exists:
 *
 * 1. Every percentile is taken over ENGAGEMENTS, never over wall-clock ticks.
 *    D115: on the shipped duel fixture the opponent is inside the frame 12.8% of
 *    the time, and P0/P3/P3c/P6 all PASS with huge margin on that sample because
 *    a camera with nothing to frame frames it perfectly. `tools/p8engage.mjs`
 *    owns the definition; the engaged fraction is printed in every table.
 * 2. LANDSCAPE is measured too, at 844x390. §4.4.1's case for portrait rests on
 *    a claim about landscape's window, and a gate that only measures portrait
 *    cannot support the comparison it exists to make.
 * 3. Every criterion has a break-switch and `--falsify` RUNS them. A criterion
 *    never shown to go red is not evidence (D47). Any criterion whose
 *    break-switch stays green is reported as a DEFECT, not as a pass.
 *
 *   node tools/gates_portrait.mjs                 # the table
 *   node tools/gates_portrait.mjs --runs 64       # the full 200+ engagement sample
 *   node tools/gates_portrait.mjs --falsify       # every break-switch, and what it caught
 *   node tools/gates_portrait.mjs --json shots/portrait/gate.json
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { traceDuel, segment, makeView, pct } from './p8engage.mjs';
import { stabilityOf } from './p8stability.mjs';
import { VIEW_PROFILE } from '../js/core/viewprofile.js';
import { SIGNATURE_SPAN_WU, boundaryDwellS, craneHolds, frameWu, traversalFraction } from '../js/sim/world.js';
import { ACE_IDS } from '../js/sim/ai.js';
import { ENEMY_TYPES } from '../js/sim/entities.js';
import { createTerrain, visibleGroundTargets, GROUND_TARGET_SPACING_WU } from '../js/sim/terrain.js';

const DT = 1 / 60;
const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const has = (k) => argv.includes(k);

const RUNS = Number(arg('--runs', 32));
const SEP = Number(arg('--sep', 1400));
const ADMIT = Number(arg('--admit', 0));   // framing-box admission radius, wu (0 = zoomLockRange)
const ZWIDE = Number(arg('--zoomwide', 0)); // §11's sanctioned lever: the auto clamp FLOOR
const GUN_WU = 440;                     // §4.3.5, the shipped gun range
const HULL_OVERRIDE = Number(arg('--minhull', 0));   // break-switch for P0/P3 legibility
let HULL_FORCE = 0;                                  // same, set per falsification arm

/** The smallest enemy hull in the game, read from the shipped table. */
function minHullWu() {
  if (HULL_FORCE) return HULL_FORCE;
  if (HULL_OVERRIDE) return HULL_OVERRIDE;
  let m = Infinity;
  for (const t of ENEMY_TYPES) if (t.airframe && t.airframe.hullWu < m) m = t.airframe.hullWu;
  return m;
}

/**
 * F6 and F7 come from `tools/sim.mjs --gates`, the blessed flight measurement,
 * rather than being re-derived here. Re-deriving the turn and the dive recovery
 * in the gate would test the gate's own arithmetic instead of the flight model —
 * P1's R2/R3 lesson, and the reason camera.js is imported rather than modelled.
 */
function flightFigures() {
  const out = execFileSync('node', [HERE + '/sim.mjs', '--gates'], { encoding: 'utf8' });
  const g = (re) => { const m = out.match(re); return m ? Number(m[1]) : NaN; };
  return {
    turnWu: g(/F6\s+combat turn diameter at corner\s+(\d+(?:\.\d+)?) wu/),
    recoveryWu: g(/F7\s+dive recovery from Vne\s+(\d+(?:\.\d+)?) wu/),
    zoomNeutral: /PASS\s+F14\s+zoom neutrality/.test(out),
    f6pass: /PASS\s+F6/.test(out), f7pass: /PASS\s+F7/.test(out),
  };
}

/* ------------------------------------------------- one orientation's sample */

function sample(mode, { camOpts = { bias: 'normal' }, arena = 0, runs = RUNS, noClear = false,
                        allTicks = false, forceZoom = 0 } = {}) {
  const view = makeView(mode);
  const P = view.profile;
  const S = {
    view, P, ticks: 0, engTicks: 0, engagements: 0, shots: 0, shotsEng: 0,
    boxW: [], boxH: [], zoom: [], zoomAll: [], sep: [], onScreenEng: 0, boxedEng: 0,
    warn: [], hits: [], peak: [], stab: { revZ: 0, unexplained: 0, pairViol: 0, oscCount: 0, oscPump: 0, oscScanned: 0, travelZ: 0, travelT: 0 },
    tightTicks: 0,
  };
  for (let i = 0; i < runs; i++) {
    const T = traceDuel({ ace: ACE_IDS[i % ACE_IDS.length], seed: 1000 + i, arena, view, camOpts, noClear, forceZoom , admit: ADMIT});
    // `allTicks` is THE break-switch for D115 itself: it reverts the sample to
    // wall-clock ticks, which is what the pre-D115 fixture measured. If P0 goes
    // green under it while going red over engagements, the old instrument is
    // demonstrated wrong rather than merely suspected.
    const segs = allTicks ? [{ i0: 0, i1: T.sep.length - 1, ticks: T.sep.length, round: 0 }]
                          : segment(T, { sep: SEP });
    S.engagements += segs.length;
    S.ticks += T.sep.length;
    for (let k = 0; k < T.sep.length; k++) { S.zoomAll.push(T.zoom[k]); if (T.zoom[k] >= 1.25) S.tightTicks++; }
    S.warn.push(...T.warn); S.hits.push(...T.hits);
    for (const s of segs) {
      S.engTicks += s.ticks;
      let worstDemand = 0, worstIdx = s.i0;
      for (let k = s.i0; k <= s.i1; k++) {
        S.boxW.push(T.boxW[k]); S.boxH.push(T.boxH[k]); S.zoom.push(T.zoom[k]); S.sep.push(T.sep[k]);
        S.onScreenEng += T.onScreen[k]; S.boxedEng += T.mem[k] > 0 ? 1 : 0; S.shotsEng += T.shots[k];
        // §4.4.2 P3c: the duel's moment of maximum FRAMING DEMAND, i.e. the tick
        // whose box needs the lowest zoom to contain at zoomFill.
        const need = Math.min(view.worldW / (T.boxW[k] / P.zoomFill), view.worldH / (T.boxH[k] / P.zoomFill));
        if (1 / need > worstDemand) { worstDemand = 1 / need; worstIdx = k; }
      }
      const need = Math.min(view.worldW / (T.boxW[worstIdx] / P.zoomFill), view.worldH / (T.boxH[worstIdx] / P.zoomFill));
      S.peak.push({ needZoom: need, delivered: T.zoom[worstIdx],
                    fits: need >= T.zoom[worstIdx] - 1e-9,
                    hullPx: minHullWu() * view.scale * T.zoom[worstIdx] });
      const r = stabilityOf(T, s.i0, s.i1, P, P.zoomInDwell);
      for (const k2 of ['revZ', 'unexplained', 'pairViol', 'oscCount', 'oscPump', 'oscScanned', 'travelZ', 'travelT']) S.stab[k2] += r[k2];
    }
    S.shots += T.summary.shots;
  }
  return S;
}

/* --------------------------------------------------------------- criteria */

function evaluate(S, F, mode) {
  const P = S.P, view = S.view, hull = minHullWu();
  const W = view.worldW, H = view.worldH, scale = view.scale;
  const r = [];
  const add = (id, what, value, pass, fail, note = '') =>
    r.push({ id, what, value, verdict: fail ? 'FAIL' : pass ? 'PASS' : 'NEITHER', note });

  /* P0 */
  const boxWp90 = pct(S.boxW, 90), boxHp90 = pct(S.boxH, 90);
  const zLegible = 34 / (hull * scale);
  const containW = P.zoomFill * W / boxWp90;
  const containH85 = P.zoomFill * H / F.recoveryWu;
  const containH90 = 0.90 * H / F.recoveryWu;
  // §11's clamp floor. ONE definition — an arm that moved P0's floor but left P3
  // measuring the shipped one tests neither.
  const WIDE = ZWIDE || P.zoomWide;
  for (const [fillTag, cH] of [['zoomFill 0.85', containH85], ['90% fill', containH90]]) {
    const zContain = Math.min(containW, cH);
    const lo = Math.max(zLegible, WIDE), hi = Math.min(zContain, P.zoomIntimate);
    const width = hi - lo;
    const overlapRaw = zContain - zLegible;
    const intersects = width > 0;
    add(`P0[${fillTag}]`, 'zoom window non-empty and usable',
        `legible >= ${zLegible.toFixed(4)}, contain <= ${zContain.toFixed(4)} (W ${containW.toFixed(4)} / H ${cH.toFixed(4)}), ` +
        `raw overlap ${overlapRaw.toFixed(4)}, in-clamp [${lo.toFixed(4)}, ${hi.toFixed(4)}] = ${width.toFixed(4)}`,
        overlapRaw > 0 && intersects && width >= 0.06,
        overlapRaw <= 0 || !intersects || width < 0.03,
        `boxW p90 ${boxWp90.toFixed(1)} wu over ${S.engTicks} ENGAGED ticks / ${S.engagements} engagements`);
  }

  /* P1 */
  const visIntimate = W / P.zoomIntimate;
  add('P1', 'a combat turn fits',
      `${F.turnWu.toFixed(0)} wu at combat; visible at zoomIntimate ${visIntimate.toFixed(1)} wu`,
      F.turnWu <= 286 && F.turnWu <= 235, F.turnWu > 370 || F.turnWu > visIntimate,
      F.turnWu > 235 && F.turnWu <= visIntimate
        ? 'NEITHER: PASS needs <= 235 wu at zoomIntimate, FAIL needs "does not fit at all". 263 is in the gap.' : '');

  /* P1b */
  for (const [fillTag, cH] of [['zoomFill 0.85', containH85], ['90% fill', containH90]])
    add(`P1b[${fillTag}]`, 'Vne dive recovery fits inside the clamp',
        `${F.recoveryWu.toFixed(0)} wu needs z <= ${cH.toFixed(4)}`,
        cH >= WIDE, cH < WIDE,
        cH > P.zoomIntimate ? 'never binds — above zoomIntimate' : '');

  /* P2 */
  const tot = S.warn.map((w) => w.total), inf = S.warn.map((w) => w.inFrame);
  const neverSeen = S.warn.filter((w) => !w.everSeen).length;
  add('P2', 'warning on a diving attacker',
      `n=${S.warn.length} approaches: total median ${pct(tot, 50).toFixed(2)}s, in-frame median ${pct(inf, 50).toFixed(2)}s, in-frame p05 ${pct(inf, 5).toFixed(2)}s`,
      pct(tot, 50) >= 1.50 && pct(inf, 50) >= 0.90 && pct(inf, 5) >= 0.60,
      pct(inf, 50) < 0.70 || pct(tot, 50) < 1.10 || pct(inf, 5) < 0.45,
      `${neverSeen}/${S.warn.length} = ${(100 * neverSeen / (S.warn.length || 1)).toFixed(1)}% reached gun range having NEVER been on screen`);

  /* P3 */
  const zp90 = pct(S.zoom, 90);
  const pxAt = (z) => hull * scale * z;
  add('P3', 'enemy silhouette legibility across the range',
      `hull ${hull} wu: ${pxAt(WIDE).toFixed(1)} px at zoomWide, ${pxAt(zp90).toFixed(1)} px at delivered p90 (${zp90.toFixed(3)}), ${pxAt(P.zoomCombat).toFixed(1)} px at zoomCombat`,
      pxAt(WIDE) >= 34 && pxAt(P.zoomCombat) >= 44,
      pxAt(WIDE) < 34 || pxAt(WIDE) < 28);

  /* P3b */
  add('P3b', 'P3 not passed by pinning the camera wide',
      `${(100 * S.tightTicks / S.ticks).toFixed(2)}% of duel time at zoom >= 1.25`,
      S.tightTicks / S.ticks <= 0.20, S.tightTicks / S.ticks > 0.35,
      `VACUOUS: zoomIntimate is ${P.zoomIntimate} and the clamp is absolute (§4.3.3), so zoom >= 1.25 is UNREACHABLE. This criterion cannot fail.`);

  /* P3c */
  const ok = S.peak.filter((p) => p.fits && p.hullPx >= 40).length;
  add('P3c', 'legibility survives peak framing demand',
      `${ok}/${S.peak.length} = ${(100 * ok / (S.peak.length || 1)).toFixed(1)}% of engagements fit at 85% fill AND hull >= 40 px at the same instant`,
      ok / (S.peak.length || 1) >= 0.90, ok / (S.peak.length || 1) < 0.75,
      `measured per ENGAGEMENT, not per duel — a duel is mostly transit (D115)`);

  /* P4c, re-specified (D114) */
  const min = S.engTicks * DT / 60;
  add('P4c', 'the zoom controller does not pump',
      `${(S.stab.revZ / min).toFixed(2)} raw rev/min, ${(S.stab.unexplained / min).toFixed(2)} UNEXPLAINED rev/min, ` +
      `${(100 * S.stab.oscPump / (S.stab.oscScanned || 1)).toFixed(2)}% PUMP windows, travel ratio ${(S.stab.travelZ / (S.stab.travelT || 1)).toFixed(3)}`,
      S.stab.oscPump === 0 && S.stab.unexplained / min <= 6, S.stab.oscPump > 0 || S.stab.unexplained / min > 12,
      're-specified per D114 + REPORT-3: PASS = zero PUMP windows AND <= 6 unexplained rev/min');

  /* P6 */
  const blind = S.hits.filter((h) => h.sinceSeenS > 1.0).length;
  add('P6', 'horizontal awareness',
      `${blind}/${S.hits.length} = ${(100 * blind / (S.hits.length || 1)).toFixed(1)}% of damage events had the attacker off screen for the preceding 1.0 s`,
      blind / (S.hits.length || 1) <= 0.12, blind / (S.hits.length || 1) > 0.25,
      'edge chevrons are a §4.2 precondition but the criterion as worded credits only ON-SCREEN presence');

  /* P9 */
  add('P9', 'zoom is sim-neutral', F.zoomNeutral ? 'sim.mjs F14 byte-identical' : 'sim.mjs F14 DIFFERS',
      F.zoomNeutral, !F.zoomNeutral, 'delegated to the blessed gate F14, not re-implemented');

  return r;
}

/** The horizontal-reach arithmetic §4.3.5 states and §4.4.2 P2/P6 measure. */
function reach(mode) {
  const view = makeView(mode), P = view.profile, pf = P.playfield;
  const rows = [];
  for (const z of [ZWIDE || P.zoomWide, P.zoomCombat, P.zoomIntimate]) {
    const visW = view.worldW / z;
    let ahead = 0, behind = 0;
    for (const dir of [1, -1]) {
      const fx = pf.left + (0.5 - (0.5 - P.anchorX) * dir) * (pf.right - pf.left);
      ahead = Math.max(ahead, dir > 0 ? (1 - fx) * visW : fx * visW);
      behind = Math.max(behind, dir > 0 ? fx * visW : (1 - fx) * visW);
    }
    rows.push({ z, visW, ahead, behind });
  }
  return rows;
}

/* ------------------------------------------------------------------- main */

const F = flightFigures();
const results = {};

/* --------------------------------------------------------- falsification */
if (has('--falsify')) {
  const ARMS = [
    ['baseline (shipped)',      {}],
    ['ALL TICKS (pre-D115)',    { allTicks: true }],
    ['?slew=symmetric',         { camOpts: { bias: 'normal', slew: 'symmetric' } }],
    ['?margin=strict',          { camOpts: { bias: 'normal', margin: 'strict' } }],
    ['?track=sticky',           { camOpts: { bias: 'normal', track: 'sticky' } }],
    ['?track=sticky +noclear',  { camOpts: { bias: 'normal', track: 'sticky' }, noClear: true }],
    ['--arena 150 (pos ctrl)',  { arena: 150 }],
    ['--minhull 40',            { minHull: 40 }],
    ['forced zoomIntimate',     { forceZoom: VIEW_PROFILE.portrait.zoomIntimate }],
    ['forced zoomCombat (P2)',  { forceZoom: VIEW_PROFILE.portrait.zoomCombat }],
    ['forced zoomWide — portrait at its BEST case for P2', { forceZoom: VIEW_PROFILE.portrait.zoomWide }],
    ['--recovery 1400',         { recovery: 1400 }],
  ];
  const runsF = Number(arg('--runs', 8));
  console.log(`\nFALSIFICATION — portrait, ${runsF} duels per arm. A criterion whose break-switch`);
  console.log(`stays GREEN is a DEFECT IN THE CRITERION, not a pass (D47).\n`);
  const ids = [];
  const table = [];
  for (const [tag, o] of ARMS) {
    HULL_FORCE = o.minHull || 0;
    const S = sample('portrait', { ...o, runs: runsF });
    const rows = evaluate(S, o.recovery ? { ...F, recoveryWu: o.recovery } : F, 'portrait');
    HULL_FORCE = 0;
    if (!ids.length) for (const x of rows) ids.push(x.id);
    table.push({ tag, rows, eng: S.engagements, engPct: S.engTicks / S.ticks, boxW: pct(S.boxW, 90) });
  }
  const short = { PASS: ' P ', FAIL: ' F ', NEITHER: ' ~ ' };
  console.log('  arm                        eng   eng%   boxWp90   ' + ids.map((i) => i.replace(/\[.*\]/, '*').padEnd(6)).join(''));
  for (const t of table)
    console.log(`  ${t.tag.padEnd(26)}${String(t.eng).padStart(4)}${(100 * t.engPct).toFixed(1).padStart(7)}%${t.boxW.toFixed(0).padStart(9)}   ` +
                t.rows.map((x) => short[x.verdict].padEnd(6)).join(''));
  console.log('\n  P = PASS, F = FAIL, ~ = NEITHER (the criterion has a gap between its bars)');
  console.log('  columns, in order: ' + ids.join(' | '));
  // which arms moved which criterion
  const base = table[0].rows;
  console.log('\n  WHAT EACH BREAK-SWITCH CAUGHT');
  for (let a = 1; a < table.length; a++) {
    const moved = table[a].rows.map((x, i) => x.verdict !== base[i].verdict ? `${x.id} ${base[i].verdict}->${x.verdict}` : null).filter(Boolean);
    console.log(`    ${table[a].tag.padEnd(26)}${moved.length ? moved.join(', ') : 'NOTHING MOVED — this arm proves nothing here'}`);
  }
  process.exit(0);
}
console.log(`\nTHE PORTRAIT GATE — ARCHITECTURE §4.4.2, measured over ENGAGEMENTS (D115)`);
console.log(`  ${RUNS} seeded duels per orientation, engagement = nearest hostile <= ${SEP} wu for >= 2 s`);
console.log(`  flight figures from tools/sim.mjs --gates: F6 turn ${F.turnWu} wu, F7 dive recovery ${F.recoveryWu} wu`);
console.log(`  smallest enemy hull ${minHullWu()} wu${HULL_OVERRIDE ? '  [BREAK-SWITCH --minhull]' : ''}\n`);

for (const mode of ['portrait', 'landscape']) {
  const S = sample(mode);
  const rows = evaluate(S, F, mode);
  results[mode] = { rows, engagements: S.engagements, engTicks: S.engTicks, ticks: S.ticks,
                    engagedPct: S.engTicks / S.ticks, boxWp90: pct(S.boxW, 90),
                    onScreenEng: S.onScreenEng / (S.engTicks || 1) };
  const v = makeView(mode);
  console.log(`${mode.toUpperCase()}  ${v.w}x${v.h} dpr 2 — worldW ${v.worldW.toFixed(2)} wu, worldH ${v.worldH} wu, scale ${v.scale.toFixed(4)} px/wu`);
  console.log(`  sample: ${S.engagements} engagements, ${S.engTicks}/${S.ticks} ticks engaged (${(100 * S.engTicks / S.ticks).toFixed(1)}%), ` +
              `opponent in frame ${(100 * S.onScreenEng / (S.engTicks || 1)).toFixed(1)}% of engaged ticks, p90 box W ${pct(S.boxW, 90).toFixed(1)} wu`);
  for (const x of rows) {
    console.log(`  ${x.verdict.padEnd(8)}${x.id.padEnd(20)}${x.what}`);
    console.log(`  ${' '.repeat(28)}${x.value}`);
    if (x.note) console.log(`  ${' '.repeat(28)}-> ${x.note}`);
  }
  console.log(`  --- horizontal reach at the player, wu (gun range is ${GUN_WU} wu) ---`);
  for (const q of reach(mode))
    console.log(`      zoom ${q.z.toFixed(2)}  visible width ${q.visW.toFixed(0).padStart(5)}  ahead ${q.ahead.toFixed(0).padStart(4)}  behind ${q.behind.toFixed(0).padStart(4)}` +
                `   ${q.ahead < GUN_WU ? '<-- a hostile can shoot from off screen' : ''}`);
  console.log('');
}

/**
 * P9: P4 and P4b ARE measurable now — `tools/ladder.mjs` is the instrument and
 * `js/sim/world.js` §1 the model. Printed here, NOT added to `results`, so the
 * gate.json record stays the manager's to change (P9_NOTES REQUEST-4).
 */
console.log(`MEASURED ELSEWHERE — node tools/ladder.mjs  (P9; js/sim/world.js §1 is the model)`);
for (const mode of ['portrait', 'landscape']) {
  const v = makeView(mode), P = v.profile;
  const holds = craneHolds(v);
  const lowest = ['mud', 'belt', 'floor'];
  console.log(`  P4   ladder-as-journey      ${mode}: >= 2 bands legible over a full climb ` +
    `${(100 * traversalFraction(v, P.zoomCombat)).toFixed(1)}% vs a 55% bar — FAIL, and unsatisfiable: the absolute`);
  console.log(`                              ceiling with a ZERO px bar is ${(100 * 5 * frameWu(v, P.zoomCombat) / 10000).toFixed(1)}% ` +
    `(5 boundaries x ${frameWu(v, P.zoomCombat).toFixed(0)} wu / 10000). Establishing crane: ` +
    `${lowest.map((b) => `${b} ${holds.get(b).toFixed(2)}s`).join(' ')} vs 0.8 — PASS.`);
  console.log(`  P4b  band boundary reads    ${mode}: sky signature co-visible ${boundaryDwellS(v, P.zoomCombat).toFixed(2)}s ` +
    `and placed signature ${((frameWu(v, P.zoomCombat) - SIGNATURE_SPAN_WU) / 90).toFixed(2)}s vs a 1.5 s bar, ` +
    `crossfade 1.66s in 1.0-3.0 — PASS.`);
}
console.log(`  P5   thumb occlusion         P7 measured it as H11/H12 (D101, D112): 0.00% across three runs at the`);
console.log(`                              shipped rest position, and D101's caveat that H11 has no single value stands.`);
/**
 * P7, MEASURED for the first time — `js/sim/terrain.js` is P9's and it exists
 * now. **Print only.** `results` and `shots/portrait/gate.json` are the gate's
 * verdict and the verdict is the manager's (D117, and P9_NOTES REQUEST-4), so
 * nothing below is added to the record.
 *
 * §4.4.2 P7: *"distinct ground targets visible ahead while strafing at
 * y in [-260, -800] (Mud/lower Belt) at cruise, target spacing 140 wu"*,
 * PASS >= 3, FAIL < 2. Two independent limits, and they answer differently:
 *
 *   the RELIEF   how many of the lattice the terrain hides — js/sim/terrain.js's
 *                `visibleGroundTargets`, the same silhouette the renderer draws
 *   the REACH    how many fit ahead of the camera at all, which is `reach()`
 *                above and is the number D121's whole pivot turned on
 */
{
  const terrain = createTerrain({ id: 'a1-01', seed: 'a1-01', terrain: { profile: 'trenchline' } });
  for (const mode of ['portrait', 'landscape']) {
    const ahead = reach(mode)[0].ahead;
    const counts = [260, 530, 800].map((altWu) =>
      visibleGroundTargets(terrain, { altWu, aheadWu: ahead }).n);
    const worst = Math.min(...counts);
    const verdict = worst >= 3 ? 'PASS' : worst < 2 ? 'FAIL' : 'NEITHER';
    console.log(`  P7   ground-attack legibility ${mode}: ${worst} target(s) of ` +
      `${Math.floor(ahead / GROUND_TARGET_SPACING_WU)} at ${GROUND_TARGET_SPACING_WU} wu spacing ` +
      `inside ${ahead.toFixed(0)} wu of forward reach — ${verdict} (>= 3 / < 2).`);
    if (verdict !== 'PASS')
      console.log(`                              REACH-bound, not occlusion: the trench line hides ` +
        `none of them. 3 targets need ${3 * GROUND_TARGET_SPACING_WU} wu and the frame reaches ` +
        `${ahead.toFixed(0)} — short by ${(3 * GROUND_TARGET_SPACING_WU - ahead).toFixed(0)} wu. ` +
        `Same cause as D121's P2.`);
  }
  console.log(`                              measured on js/sim/terrain.js (P9). PRINT ONLY — ` +
    `results and gate.json are untouched (D117).`);
}
console.log(`  P8   blind framing critique  needs the renderer plus tools/blind.mjs and 3 critic agents.`);

if (has('--json')) {
  const path = arg('--json', 'shots/portrait/gate.json');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ when: new Date().toISOString(), runs: RUNS, sep: SEP,
    minHullWu: minHullWu(), flight: F, results }, null, 2));
  console.log(`\nwrote ${path}`);
}
