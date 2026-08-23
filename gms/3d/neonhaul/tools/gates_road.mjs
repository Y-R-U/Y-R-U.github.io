#!/usr/bin/env node
// The street population's gates — road transports do not drive through each other.
//
//   node tools/gates_road.mjs [--headed]
//
// R1  no two transports interpenetrate, over 1,500 s of sim from five camera tiles
// R2  the crossing constant |F ∓ G| stays clear of zero — the arithmetic R1 rests on, measured
// R3  vehicles that share a travel line share a speed, and sit a whole CORR apart
// R4  the population is still a pure function of (seed, index, time, camera)
// R5  the give-way holds and releases without ever reversing or jumping a vehicle
// R6  only the yielding axis holds, and the vehicles are still on the streets
// R7  the two preconditions the proof needs actually hold on this seed
//
// Why this suite exists. Aaron, on the shipped build: *"trains go through each other, one needs to
// wait for the other. perhaps have one direction always give way to another to keep it simple?"*
// Measured before any change, over 100 s at the canyon_dive camera: 1,570 overlapping pairs SAME
// LANE SAME DIRECTION and 77 at a crossing. So the thing on screen was mostly NOT the thing the
// report described — the dominant case was a 16.5 m/s tram driving through a 10.6 m/s bus from
// behind, because `roadPosOf` is a pure function of time and there is no following behaviour in it
// at all. js/lanes.js's header has the fix and the arithmetic.
//
// ── the part that matters ────────────────────────────────────────────────
//
// A zero from a sweep that cannot find an overlap is worth nothing, and this repo has shipped that
// mistake eighteen times. So R1 is run three times: once as it ships, once with the per-vehicle
// speed spread put back (`setRoadVariety`), which must resurrect the REAR-END case, and once with
// the give-way hold scaled past the margin the proof allows (`setRoadHold`), which must resurrect
// the CROSSING case. Both arms have to go red on the same code path R1 passes on, or R1's zero is
// not evidence.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, parseArgs, waitFor, settle, evalJSON, quiesce, hook, cleanup } from './shot.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs();
const OUT = resolve(ROOT, 'shots/road');
mkdirSync(OUT, { recursive: true });
const FILE = resolve(OUT, '_gates.json');

const LOT = 51.2, CORR = LOT * 4, W_TILE = 2048, R_LANE = 3.3, R_SLOTS = W_TILE / CORR;
const R_HOLD = 12;
// The worst pair the box test can produce: two hauliers, (L + W)/2 each.
const WORST_PAIR = (32 + 3) / 2 * 2;

const ok = [], fail = [], detail = {};
function check(name, pass, det) {
  (pass ? ok : fail).push(name);
  detail[name] = det;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n      ${String(det).replace(/\n/g, '\n      ')}`);
  try {
    writeFileSync(FILE, JSON.stringify({ at: new Date().toISOString(),
      total: ok.length + fail.length, passed: ok.length, failed: fail.length, ok, fail, detail }, null, 1));
  } catch { /* a full disk must not swallow the console above */ }
}

// ── the sweep ─────────────────────────────────────────────────────────────
//
// It runs INSIDE the page and returns a summary: 6,000 moments over a CDP round trip each would be
// twenty minutes of JSON. Boxes are axis-aligned, L along the vehicle's own axis and W across, from
// craft.js's real numbers — a sweep that models a vehicle as a point measures nothing.
const sweep = (t0, n, dt) => `(() => {
  const g = window.__game, WD = { bus_road: 2.60, tram_road: 2.60, haul_road: 3.00 };
  const o = { samples: 0, pairs: 0, cross: 0, same: 0, sameLane: 0, sameDir: 0, worst: 0, n: 0,
    minSepCross: 1e9, minSepSame: 1e9, minInv: 1e9, ex: [] };
  const seen = new Set();
  for (let k = 0; k < ${n}; k++) {
    const t = ${t0} + k * ${dt};
    const L = g.roadList(0, t);
    o.n = L.length; o.samples++;
    const b = L.map(v => { const hw = (WD[v.type] || 3) / 2, hl = v.L / 2;
      return v.axis === 0 ? { x0: v.x - hl, x1: v.x + hl, z0: v.z - hw, z1: v.z + hw }
                          : { x0: v.x - hw, x1: v.x + hw, z0: v.z - hl, z1: v.z + hl }; });
    let inF = 0;
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      o.pairs++;
      const A = b[i], B = b[j];
      const sep = Math.max(Math.max(B.x0 - A.x1, A.x0 - B.x1), Math.max(B.z0 - A.z1, A.z0 - B.z1));
      const cross = L[i].axis !== L[j].axis;
      if (cross) {
        if (sep < o.minSepCross) o.minSepCross = sep;
        const p = L[i].axis === 0 ? L[i] : L[j], q = L[i].axis === 0 ? L[j] : L[i];
        const F = p.x - q.x, G = q.z - p.z;
        let inv = (p.dir === q.dir ? F - G : F + G) % ${W_TILE};
        inv = ((inv + ${W_TILE * 1.5}) % ${W_TILE}) - ${W_TILE / 2};
        if (Math.abs(inv) < o.minInv) o.minInv = Math.abs(inv);
      } else if (sep < o.minSepSame) o.minSepSame = sep;
      if (sep >= 0) continue;
      inF++;
      if (cross) o.cross++;
      else { o.same++; if (L[i].lane === L[j].lane) o.sameLane++; if (L[i].dir === L[j].dir) o.sameDir++; }
      const key = L[i].i + '-' + L[j].i;
      if (!seen.has(key)) { seen.add(key);
        if (o.ex.length < 6) o.ex.push((cross ? 'CROSSING  ' : 'same-axis ')
          + L[i].type + '(a' + L[i].axis + ' lane' + L[i].lane + ' v' + L[i].speed + ') x '
          + L[j].type + '(a' + L[j].axis + ' lane' + L[j].lane + ' v' + L[j].speed + ') at ('
          + L[i].x.toFixed(0) + ', ' + L[i].z.toFixed(0) + ') t=' + t.toFixed(2)); }
    }
    if (inF > o.worst) o.worst = inF;
  }
  o.distinct = seen.size;
  for (const k of ['minSepCross', 'minSepSame', 'minInv']) o[k] = +o[k].toFixed(3);
  return o;
})()`;

// Five camera tiles, because `roadPosOf` snaps BOTH its along tile and its cross tile to the eye:
// a sweep from one camera measures one set of live corridors and one tile phase. Three of these
// are more than a whole W_TILE apart, so they are genuinely different snaps and not the same tile
// under a different name.
const CAMS = [[1305.6, 150, 260], [0, 150, 0], [-1700, 150, 2200], [900, 150, 410], [2560, 150, -1220]];
const SWEEP_N = 1200, SWEEP_DT = 0.25;

const ctx = await open({ w: 900, h: 600, dpr: 1, headed: !!args.headed });
const { S, base, close } = ctx;
await S('Page.navigate', { url: `${base}/index.html?nohud&nosave&shot=canyon_dive` });
await waitFor(S, 'window.__ready', 60000);
await settle(S, 20);
await quiesce(S, { timeout: 90000 });

async function sweepAll(label) {
  const rows = [];
  for (const c of CAMS) {
    await evalJSON(S, `(window.__game.teleport(${c[0]}, ${c[1]}, ${c[2]}), 1)`);
    await settle(S, 3);
    rows.push({ cam: c, r: await evalJSON(S, sweep(0, SWEEP_N, SWEEP_DT)) });
  }
  const tot = rows.reduce((a, x) => ({
    samples: a.samples + x.r.samples, pairs: a.pairs + x.r.pairs, cross: a.cross + x.r.cross,
    same: a.same + x.r.same, sameLane: a.sameLane + x.r.sameLane, sameDir: a.sameDir + x.r.sameDir,
    worst: Math.max(a.worst, x.r.worst), distinct: a.distinct + x.r.distinct, n: x.r.n,
    minSepCross: Math.min(a.minSepCross, x.r.minSepCross),
    minSepSame: Math.min(a.minSepSame, x.r.minSepSame),
    minInv: Math.min(a.minInv, x.r.minInv),
    ex: a.ex.concat(x.r.ex).slice(0, 6),
  }), { samples: 0, pairs: 0, cross: 0, same: 0, sameLane: 0, sameDir: 0, worst: 0, distinct: 0,
        n: 0, minSepCross: 1e9, minSepSame: 1e9, minInv: 1e9, ex: [] });
  tot.label = label; tot.rows = rows;
  return tot;
}

const shipped = await sweepAll('shipped');
const covered = `${shipped.samples} moments ${SWEEP_DT} s apart from ${CAMS.length} camera tiles `
  + `(${(shipped.samples * SWEEP_DT).toFixed(0)} s of sim), ${shipped.n} transports live, `
  + `${shipped.pairs.toLocaleString()} pair-samples`;

// ── R1 ────────────────────────────────────────────────────────────────────
check('R1 no two street transports interpenetrate',
  shipped.n >= 60 && shipped.samples === SWEEP_N * CAMS.length
  && shipped.cross === 0 && shipped.same === 0,
  `${covered}\n`
  + `  overlapping pairs: ${shipped.cross} at a CROSSING, ${shipped.same} same-axis `
  + `(${shipped.sameLane} of those same LANE, ${shipped.sameDir} same direction)\n`
  + `  worst single moment ${shipped.worst} pairs; distinct pairs that ever touched ${shipped.distinct}\n`
  + `  closest approach: ${shipped.minSepCross} m between crossing hulls, `
  + `${shipped.minSepSame} m between same-axis hulls\n`
  + `  before this change the same probe over 100 s from one camera read 1570 same-lane and 77 crossing`
  + (shipped.ex.length ? '\n  ' + shipped.ex.join('\n  ') : ''));

// FALSIFY (a) — the rear-end case. Put the 8-17 m/s per-vehicle spread back and the sweep must
// find exactly what Aaron saw: same lane, same direction, one hull passing through another.
await evalJSON(S, '(window.__game.setRoadVariety(true), 1)');
const fVar = await sweepAll('variety');
await evalJSON(S, '(window.__game.setRoadVariety(false), 1)');
check('R1-falsify(a) with per-vehicle speeds back the sweep finds the REAR-END overlaps again',
  fVar.same > 0 && fVar.sameLane > 0 && fVar.sameDir === fVar.same,
  `setRoadVariety(true) — the only change is rSpeed going back to 8 + u*9 m/s\n`
  + `  ${fVar.same} same-axis overlapping pairs, ${fVar.sameLane} of them on the SAME lane, `
  + `${fVar.sameDir} in the SAME direction; ${fVar.cross} at a crossing\n`
  + `  worst single moment ${fVar.worst} pairs, closest same-axis approach ${fVar.minSepSame} m\n  `
  + fVar.ex.slice(0, 3).join('\n  '));

// FALSIFY (b) — the crossing case Aaron actually described. The give-way hold is bounded by
// R_HOLD because the crossing constant is only worth LOT metres; spend 3x that and the pairs the
// proof was keeping apart must start meeting.
await evalJSON(S, '(window.__game.setRoadHold(3), 1)');
const fHold = await sweepAll('hold3');
await evalJSON(S, '(window.__game.setRoadHold(1), 1)');
check('R1-falsify(b) with the give-way hold past its margin the sweep finds CROSSING overlaps',
  fHold.cross > 0,
  `setRoadHold(3) — the hold now spends up to ${R_HOLD * 3} m of a ${LOT} m crossing constant\n`
  + `  ${fHold.cross} crossing overlaps, ${fHold.same} same-axis; closest crossing approach `
  + `${fHold.minSepCross} m (shipped: ${shipped.minSepCross} m)\n`
  + `  the crossing constant fell to ${fHold.minInv} m, against ${WORST_PAIR} m needed for two hauliers\n  `
  + fHold.ex.slice(0, 3).join('\n  '));

// ── R2 — the arithmetic, measured rather than asserted ────────────────────
check('R2 the crossing constant stays clear of the worst pair the box test can build',
  shipped.minInv > WORST_PAIR && shipped.minInv >= LOT - R_HOLD - 0.5,
  `for every crossing pair, |F - G| (same direction sign) or |F + G| (opposite) is invariant in\n`
  + `time; reduced into (-1024, 1024] its smallest value over the whole sweep is `
  + `${shipped.minInv} m\n`
  + `  an overlap needs |F| < h1 AND |G| < h0, i.e. |F ∓ G| < h0 + h1, which is at most `
  + `${WORST_PAIR} m (two 32 m hauliers)\n`
  + `  the lattice pays LOT = ${LOT} m and the give-way spends at most ${R_HOLD} of it → `
  + `${(LOT - R_HOLD).toFixed(1)} m predicted, ${shipped.minInv} m measured\n`
  + `  with speeds varied (R1-falsify a) the same quantity is not invariant at all and falls to `
  + `${fVar.minInv} m`);

// ── R3 — one travel line, one speed, and a whole CORR of spacing ──────────
const lines = await evalJSON(S, `(() => {
  const g = window.__game, L = g.roadList(0, 0), lanes = g.roadLanes();
  const by = new Map();
  for (const v of L) {
    const l = lanes[v.lane];
    const key = v.axis + '|' + v.dir + '|' + l.phase.toFixed(2) + '|' + ((v.axis === 0 ? v.z : v.x)).toFixed(2);
    if (!by.has(key)) by.set(key, []);
    by.get(key).push(v);
  }
  let speeds = 0, worstGap = 1e9, at = '', maxPerLine = 0, distinctSpeeds = new Set();
  for (const [k, vs] of by) {
    if (new Set(vs.map(v => v.speed)).size > 1) speeds++;
    for (const v of vs) distinctSpeeds.add(v.speed);
    maxPerLine = Math.max(maxPerLine, vs.length);
    const a = vs.map(v => (v.axis === 0 ? v.x : v.z)).sort((p, q) => p - q);
    for (let i = 0; i < a.length; i++) {
      const gap = i ? a[i] - a[i - 1] : a[0] + ${W_TILE} - a[a.length - 1];
      if (gap < worstGap) { worstGap = gap; at = k + ' n=' + a.length; }
    }
  }
  return { lines: by.size, mixed: speeds, worstGap: +worstGap.toFixed(2), at, maxPerLine,
    speeds: [...distinctSpeeds] };
})()`);
check('R3 vehicles that share a travel line share a speed and sit a whole CORR apart',
  lines.mixed === 0 && lines.worstGap >= CORR - 2 * R_HOLD - 0.5 && lines.lines >= 8,
  `${lines.lines} distinct travel lines carry the population; ${lines.mixed} of them mix speeds\n`
  + `  closest two hulls on ANY one line: ${lines.worstGap} m centre to centre `
  + `(CORR ${CORR} m minus at most 2 x ${R_HOLD} m of give-way), against a 32 m haulier\n`
  + `  the population runs at ${JSON.stringify(lines.speeds)} m/s; before the change it was a `
  + `2x spread from 8 to 17 and the closest same-line pair was 0 m`);

// ── R4 — still a pure function of (seed, index, time, camera) ─────────────
//
// Evaluated out of order, and again after the camera has been driven 8 km away and put back. The
// camera is placed through `setCamera`, which PARKS the flight rig: teleport alone leaves the rig
// easing the eye for several frames afterwards, and then the second reading differs because the
// camera differs — which is a measurement of the rig, not of the traffic.
const pure = await evalJSON(S, `(() => {
  const g = window.__game;
  const key = t => JSON.stringify(g.roadList(0, t).map(v => [v.i, v.x, v.z, v.lag]));
  const a = key(137.5);
  key(901.25); key(12.5);
  return { same: a === key(137.5), len: a.length };
})()`);
await hook(S, 'setCamera', { pos: CAMS[0], yaw: 20, pitch: -8, fov: 58 });
await settle(S, 4);
const pos0 = await evalJSON(S, '(() => JSON.stringify(window.__game.roadList(0, 137.5).map(v => [v.i, v.x, v.z])))()');
await hook(S, 'setCamera', { pos: [-6000, 400, 6000], yaw: 0, pitch: 0, fov: 58 });
await settle(S, 8);
const posAway = await evalJSON(S, '(() => JSON.stringify(window.__game.roadList(0, 137.5).map(v => [v.i, v.x, v.z])))()');
await hook(S, 'setCamera', { pos: CAMS[0], yaw: 20, pitch: -8, fov: 58 });
await settle(S, 8);
const pos1 = await evalJSON(S, '(() => JSON.stringify(window.__game.roadList(0, 137.5).map(v => [v.i, v.x, v.z])))()');
check('R4 a road position is still a pure function of (seed, index, time, camera)',
  pure.same && pos0 === pos1 && posAway !== pos0 && pos0.length > 500,
  `the same t=137.5 evaluated before and after t=901.25 and t=12.5: `
  + `${pure.same ? 'byte-identical' : 'CHANGED'}\n`
  + `  and after driving the camera 8 km away and back to the same point: `
  + `${pos0 === pos1 ? 'byte-identical' : 'CHANGED'} over ${pos0.length} characters of positions\n`
  + `  the reading is not a constant: from the far camera the same t gives `
  + `${posAway === pos0 ? 'THE SAME ROWS (the comparison is blind)' : 'different rows, as the tile snap should'}\n`
  + `  (the give-way hold is a function of the vehicle's own progress, so it cannot make a position `
  + `depend on how long the page has been open)`);

// ── R5 — the give-way holds without reversing or jumping ─────────────────
//
// The vehicle and the moment are SEARCHED FOR on the predicate itself — a full yield fires on
// about 1.4 % of junction passes, because the lattice has already made real conflicts rare, so a
// trace of the first give-way vehicle over the first minute finds only the base ease and would
// pass a check about a stop it never made.
const peak = await evalJSON(S, `(() => {
  const g = window.__game;
  let best = { lag: -1 };
  for (let k = 0; k < 1400; k++) {
    const t = k * 0.5;
    for (const v of g.roadList(0, t)) if (v.lag > best.lag) best = { lag: v.lag, i: v.i, t, type: v.type };
  }
  return best;
})()`);
const traceOf = () => evalJSON(S, `(() => {
  const g = window.__game;
  let prev = null, back = 0, vmin = 1e9, vmax = 0, jump = 0, lagMax = 0;
  for (let k = 0; k < 2400; k++) {
    const t = ${peak.t} - 20 + k / 60;
    const v = g.roadList(0, t).find(r => r.i === ${peak.i});
    const a = v.axis === 0 ? v.x : v.z;
    lagMax = Math.max(lagMax, v.lag);
    if (prev !== null) {
      let d = (a - prev) * v.dir;
      if (Math.abs(d) > 1000) d += ${W_TILE};                 // the along-tile wrap, not a jump
      if (d < back) back = d;
      vmin = Math.min(vmin, d * 60); vmax = Math.max(vmax, d * 60);
      jump = Math.max(jump, Math.abs(d));
    }
    prev = a;
  }
  return { back: +back.toFixed(4), vmin: +vmin.toFixed(3), vmax: +vmax.toFixed(3),
    jump: +jump.toFixed(3), lagMax: +lagMax.toFixed(2) };
})()`);
const tr = await traceOf();
check('R5 the give-way slows to a near stop and pulls away, and never reverses or jumps',
  peak.lag > R_HOLD * 0.95 && tr.back === 0 && tr.vmin < 1.0 && tr.vmax < 18
  && tr.jump < 0.5 && tr.lagMax > R_HOLD * 0.95,
  `the deepest hold in 700 s of sim is ${peak.lag} m, on ${peak.type} #${peak.i} at t=${peak.t}; `
  + `traced at 1/60 s across the 40 s around it\n`
  + `  speed ${tr.vmin} .. ${tr.vmax} m/s (nominal 12), lag peaked at ${tr.lagMax} m\n`
  + `  largest backward step ${tr.back} m, largest single step ${tr.jump} m — it stops and pulls `
  + `away, it does not snap\n`
  + `  ${R_HOLD} m of lag is all the crossing constant can pay for, so the deceleration window is `
  + `set from the slope that would otherwise run it backwards`);

await evalJSON(S, '(window.__game.setRoadHold(1.3), 1)');
const trBad = await traceOf();
await evalJSON(S, '(window.__game.setRoadHold(1), 1)');
check('R5-falsify a hold past the slope limit drives the vehicle BACKWARDS, and the trace sees it',
  trBad.back < -0.001 && trBad.vmin < -0.5,
  `setRoadHold(1.3): the same trace now reads speed ${trBad.vmin} .. ${trBad.vmax} m/s and a `
  + `backward step of ${trBad.back} m\n`
  + `  shipped it is exactly ${tr.back} — the check is not reading a tolerance, it is reading a sign`);

// ── R6 — only the yielding axis holds, and everything is still on a street ─
const axes = await evalJSON(S, `(() => {
  const g = window.__game;
  let prioLag = 0, yieldLag = 0, offMax = 0, offCount = 0, shifted = 0;
  for (let k = 0; k < 400; k++) {
    for (const v of g.roadList(0, k * 0.7)) {
      if (v.axis === 1) yieldLag = Math.max(yieldLag, v.lag); else prioLag = Math.max(prioLag, v.lag);
      offMax = Math.max(offMax, Math.abs(v.offRoad - ${R_LANE}));
      offCount++;
      // the same predicate on a coordinate shifted 7 m off the line, so its zero above is shown
      // to be a reading and not a constant
      const c = (v.axis === 0 ? v.z : v.x) + 7;
      const off = Math.abs(((c / ${LOT}) - Math.round(c / ${LOT})) * ${LOT});
      if (Math.abs(off - ${R_LANE}) > 0.05) shifted++;
    }
  }
  return { prioLag: +prioLag.toFixed(4), yieldLag: +yieldLag.toFixed(2), offMax: +offMax.toFixed(4),
    offCount, shifted };
})()`);
check('R6 only the yielding axis holds, and every transport is still on its carriageway',
  axes.prioLag === 0 && axes.yieldLag > R_HOLD * 0.75 && axes.offMax < 0.05
  && axes.shifted === axes.offCount,
  `over ${axes.offCount} rows: max lag on the PRIORITY axis ${axes.prioLag} m, on the yielding `
  + `axis ${axes.yieldLag} m — the give-way is one-directional by construction\n`
  + `  every row sits ${R_LANE} m off the nearest ${LOT} m centreline to within ${axes.offMax} m\n`
  + `  and the same predicate applied to a coordinate nudged 7 m off the line flags `
  + `${axes.shifted}/${axes.offCount} rows, so its zero above is a measurement`);

// ── R7 — the two preconditions the proof needs ───────────────────────────
const pre = await evalJSON(S, `(() => {
  const lanes = window.__game.roadLanes();
  const shared = [];
  for (let i = 0; i < lanes.length; i++) for (let j = i + 1; j < lanes.length; j++) {
    if (lanes[i].axis === lanes[j].axis && lanes[i].dir === lanes[j].dir
      && Math.abs(lanes[i].phase - lanes[j].phase) < 0.01) shared.push(lanes[i].i + '/' + lanes[j].i);
  }
  return { maxAlong: Math.max(...lanes.map(l => l.nAlong)), shared,
    bases: lanes.map(l => [l.i, l.axis, +l.phase.toFixed(1), +l.slotBase.toFixed(1)]) };
})()`);
check('R7 the slot map is injective and no two lanes share a travel line on this seed',
  pre.maxAlong <= R_SLOTS && pre.shared.length === 0,
  `the busiest lane wants ${pre.maxAlong} along slots out of ${R_SLOTS} — the seeded step is `
  + `coprime with ${R_SLOTS}, so under that ceiling two vehicles cannot land on one slot\n`
  + `  lanes sharing an axis, a direction AND a phase: ${pre.shared.length ? pre.shared.join(' ') : 'none'} `
  + `— such a pair would drive down the same street from two independent slot maps and CORR of `
  + `spacing would not save them\n`
  + `  (lane, axis, phase, slotBase): ${JSON.stringify(pre.bases)}`);

console.log(`\n${ok.length}/${ok.length + fail.length} passed` + (fail.length ? `   FAILED: ${fail.join(', ')}` : ''));
await close();
cleanup();
process.exit(fail.length ? 1 : 0);
