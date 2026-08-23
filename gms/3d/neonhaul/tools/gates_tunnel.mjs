#!/usr/bin/env node
// §S2-N's gates — a street that runs through a building comes out the other side.
//
//   node tools/gates_tunnel.mjs [--headed] [--lite]
//
// T0  the camera the behaviour gates stand at is SELECTED and the selection is asserted
// T1  the tunnel layer and the traffic population share ONE corridor lattice
// T1b the road lattice is where the shipped build put it — pinned to literals, because T1 compares
//     the live lattice against the same function the live lattice came from
// T2  every bore has a mouth at BOTH ends, on the real ground-floor face, with wall beside it, big
//     enough to pass the largest road transport — re-derived in node from blocks.js' own unit boxes
// T3  a transport driving a corridor that crosses a building is not visible inside it
// T4  ...and neither is its streak
// T5  the doors are OPEN when a vehicle is at the mouth and SHUT when nothing is near
// T6  the doors are fully open BEFORE the nose arrives, at every speed in the fleet
// T7  hide implies portal — nothing is ever hidden where there is no bore to hide it in
// T8  the layer is one draw call, and it demonstrably reaches the frame
// T9  hiding a vehicle does not move the traffic hash
//
// ── why each of these is falsified, and what the falsification is for ──────
//
// This project's dominant failure mode is a measurement that silently measures nothing, and every
// check below has a specific way of being vacuous:
//
//   T1  the lattice is a hash of a SALTED seed. Feed it the world seed instead of the traffic seed
//       and you get a perfectly plausible set of corridors that is nowhere near the streets, and
//       "the numbers agree" would be a comparison of two wrong numbers. The falsification arm
//       recomputes with the world seed and shows the check going red.
//   T2  a re-derivation that looks in the wrong place finds nothing and reports no mismatches.
//       The arm shifts the corridor line half a lot sideways and shows the comparison collapse.
//   T3  "the vehicle is not visible" is trivially true of a vehicle that was never there. Every
//       arm asserts the POSITIVE control first — the same vehicle IS drawn one step earlier.
//   T5  a door that is stuck open reads as "open when the vehicle arrives". The arm asserts the
//       same doors go shut with the population switched off, and that forcing them proves the
//       instance attribute reaches the shader at all.
//   T7  a sweep in which nothing was ever hidden satisfies "nothing was hidden wrongly". The check
//       fails unless it observed hidden vehicles — as separate EPISODES, so a finer sampling step
//       cannot buy its way past the guard with four more reads of the same bus.
//   T8b a door the model believes is open, painted from another portal's instance, is pixel-for-
//       pixel a shut door. The arm forces the uniform both ways AND asks the field whether it
//       agrees the leaf owns the instance being written to.
//
// ── and the failure mode that is not vacuity: a fixture that lands somewhere else ──
//
// `roadPosOf` wraps every road vehicle inside a 2048 m along tile snapped to the CAMERA. A scan
// for "the moment this bus is at x" returns its closest approach whether or not it ever gets
// there, so a target outside that tile yields a confident-looking time for a hull 80 m away. Every
// aimed instant below therefore carries `hit`, every enclosure instant is FOUND by its predicate
// rather than aimed at, and the site and the bore are selected by measurement.
//
// ── the clock ─────────────────────────────────────────────────────────────
//
// `vehT` starts at zero and accumulates real frame time, so WHICH transport is where depends on
// how long the page took to boot. Every measurement here runs under `freezeTime(true)` and drives
// the population with `__game.stepVehicles(t, dt)`, so the suite picks the same bore and the same
// transport on every run instead of whatever the machine happened to be doing.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, parseArgs, waitFor, evalJSON, settle, quiesce, hook, logs } from './shot.mjs';
import { CORR, LOT, R_LANE, roadPhase, roadLines, trafficSeed } from '../js/lanes.js';
import { WORLD_SEED } from '../js/config.js';
import { hash2i } from '../js/utils.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs();
const OUT = resolve(ROOT, 'shots/tunnel');
mkdirSync(OUT, { recursive: true });
const FILE = resolve(OUT, '_gates.json');

async function evalP(expr) {
  const r = await S('Runtime.evaluate', { expression: `(${expr}).then(v => JSON.stringify(v))`, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  const v = JSON.parse(r.result.value);
  if (v && v.error) throw new Error('probe failed: ' + v.error);
  return v;
}
// gates_s2h's instrument, verbatim: the game's own framebuffer read-back, binned to a grid.
const grid = async (nx = 32, ny = 20) =>
  (await evalP(`window.__game.probe({ grid: [${nx}, ${ny}] })`)).grid.cells.map(c => c.lum);
function diff(a, b) {
  if (!a.length || a.length !== b.length) throw new Error(`diff over ${a.length} vs ${b.length} cells — a zero from this would mean nothing`);
  let sum = 0, worst = 0;
  for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); sum += d; if (d > worst) worst = d; }
  return { mean: +(sum / a.length).toFixed(6), worst: +worst.toFixed(5) };
}

const ok = [], fail = [], detail = {};
function check(name, pass, det) {
  (pass ? ok : fail).push(name);
  detail[name] = det;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n      ${String(det).replace(/\n/g, '\n      ')}`);
  try {
    writeFileSync(FILE, JSON.stringify({ at: new Date().toISOString(), lite: !!args.lite,
      total: ok.length + fail.length, passed: ok.length, failed: fail.length, ok, fail, detail }, null, 1));
  } catch { /* a full disk must not swallow the console above */ }
}

// ── the vacuity guards, and why they are preset-scaled ────────────────────
//
// Several checks below assert "and the sample was not empty" — a sweep that never hid a transport
// satisfies "nothing was hidden wrongly" for free. Those minima are a function of how much city is
// streamed, and the LOW preset holds a 3x3 near ring against HIGH's 5x5: 9 chunks against 25, so
// it sees about 0.36 of the crossings and about 0.36 of the observations. The minima are scaled by
// that ratio and by nothing else. Every SUBSTANTIVE assertion — zero mismatches, zero hidden in
// open air, zero suppressed while straddling, and every falsification — is identical on both
// presets and is not scaled at all.
const RING = args.lite ? 9 / 25 : 1;
const min = n => Math.max(2, Math.round(n * RING));

// The moment the whole suite is pinned to. Any value works; a fixed one is the point.
const T0 = 411.0;

// ── where the suite stands, and why it is no longer a literal ─────────────
//
// It was `SITE = [-1400, -1400]`, chosen once because it had a crossing on it. Restoring the road
// lattice moved every corridor, and that camera came out holding SIX dressed bores of which TWO
// carried any traffic at all — so T4 picked a bore no vehicle can reach, T7 audited two enclosed
// observations against a guard of one, and T7b found four straddles against a guard of thirty.
// None of that is a defect in the layer; all of it is a fixture driving to a fixed place and
// hoping. Neighbouring blocks hold 13 to 24 bores with five or six vehicles on each corridor.
//
// So the camera is SELECTED. These candidates are arbitrary — what is not arbitrary is that the
// suite measures each one and asserts the winner clears a stated bar, and says so loudly if none
// does. `withTraffic` is the number that matters: a dressed mouth on a corridor the population
// never drives is scenery, not a test.
const SITES = [[0, 0], [-1400, -1400], [900, -400], [-2600, 1800], [1500, 2200], [2400, -1900],
  [3200, 900], [-900, 2600], [-3400, -800], [1900, -3200]];

const ctx = await open({ w: 1280, h: 720, dpr: 1, headed: !!args.headed });
const { S, base, close } = ctx;
await S('Page.navigate', { url: `${base}/index.html?nosave&nohud&debug&var=deepnight&time=1.5${args.lite ? '&lite=1' : ''}` });
await waitFor(S, 'window.__ready', 45000);
await settle(S, 30);
await evalJSON(S, `(window.__game.teleport(${SITES[0][0]}, 40, ${SITES[0][1]}), 1)`);
await quiesce(S, { timeout: 120000 });
await hook(S, 'freezeTime', true);
const stepTo = (t, dt = 0) => evalJSON(S, `window.__game.stepVehicles(${t}, ${dt})`);
// Integrate the doors up to T0 rather than jumping: they are a rate limiter, and a door dropped
// into place would make T6 (the LEAD) unmeasurable.
const settleDoors = async (t, secs = 5) => {
  await evalJSON(S, `(() => { const g = window.__game;
    for (let k = 0; k < ${Math.round(secs * 30)}; k++) g.stepVehicles(${t} - ${secs} + k / 30, 1/30);
    g.stepVehicles(${t}, 0); return 1; })()`);
};
// ── finding a moment, and knowing whether you found it ────────────────────
//
// Both scan the page's own analytic position for vehicle `i` on axis `ax`; neither re-derives
// `roadPosOf` here. `hit` is the whole point of the first one: the scan reports its closest
// approach whatever happens, and a caller that reads that as an arrival is asserting about a hull
// that may be nowhere near the geometry it names. T4 spent this pass reading a hull 80 m short of
// its bore as "wholly inside", because the target was outside the vehicle's along tile and the
// scan dutifully returned the best of a bad set.
const TOL = 0.5;
const timeAtOf = (i, ax) => target => evalJSON(S, `(() => {
  const g = window.__game;
  let best = null;
  for (let t = 0; t < 340; t += 0.05) {
    const v = g.roadList(0, t).find(r => r.i === ${i});
    if (!v) continue;
    const a = ${ax} === 0 ? v.x : v.z, d = Math.abs(a - (${target}));
    if (!best || d < best.d) best = { t: +t.toFixed(2), d: +d.toFixed(3), a };
    if (d < 0.20) break;
  }
  return best && Object.assign(best, { hit: best.d <= ${TOL} });
})()`);
// The moment the WHOLE HULL is between the two portal planes — searched on the predicate itself
// rather than on a coordinate the scan is hoped to reach, so "is it enclosed" is answered by the
// thing that finds it and not by the assertion that follows.
const timeInsideOf = (i, ax) => (a0, a1, half) => evalJSON(S, `(() => {
  const g = window.__game;
  let best = null;
  const mid = (${a0} + ${a1}) / 2;
  for (let t = 0; t < 340; t += 0.05) {
    const v = g.roadList(0, t).find(r => r.i === ${i});
    if (!v) continue;
    const a = ${ax} === 0 ? v.x : v.z;
    if (!(a - ${half} > ${a0} + 0.15 && a + ${half} < ${a1} - 0.15)) continue;
    const d = Math.abs(a - mid);
    if (!best || d < best.d) best = { t: +t.toFixed(2), d: +d.toFixed(3), a };
    if (d < 0.5) break;
  }
  return best;
})()`);

const goTo = async ([x, z], y = 40) => {
  await evalJSON(S, `(window.__game.teleport(${x}, ${y}, ${z}), 1)`);
  await quiesce(S, { timeout: 120000 });
  await settleDoors(T0);
};
// What one camera is worth to this suite, scored on EXACTLY what the gates below go looking for
// and not on a proxy. `usable` is T3/T5/T6/T8's predicate verbatim — an ordinary (non-landmark)
// bore 18-90 m long with a transport short enough to fit it on its corridor. `far` is T4's — a
// bore in the 260-620 m band, past the mesh-promotion radius, with the same. Scoring on "bores
// that have any traffic" instead picked a downtown camera whose seven bores were all 170 m
// landmarks, and the behaviour half of the suite could not run at all on the LOW ring.
const siteScore = () => evalJSON(S, `(() => {
  const g = window.__game, bores = g.tunnelList(), road = g.roadList(), cam = g.camera.position;
  const fits = b => road.some(v => v.axis === b.axis
    && Math.abs((b.axis === 0 ? v.z : v.x) - b.line) < ${R_LANE * 0.5} && v.L + 6 < b.len);
  let usable = 0, far = 0;
  for (const b of bores) {
    if (!b.lm && b.len >= 18 && b.len <= 90 && fits(b)) usable++;
    const mx = b.axis === 0 ? (b.a0 + b.a1) / 2 : b.line, mz = b.axis === 0 ? b.line : (b.a0 + b.a1) / 2;
    const d = Math.hypot(mx - cam.x, mz - cam.z);
    if (d >= 260 && d <= 620 && fits(b)) far++;
  }
  return { bores: bores.length, usable, far };
})()`);

const scored = [];
for (const s of SITES) {
  await goTo(s);
  scored.push({ s, ...await siteScore() });
}
// A site with no `far` bore cannot run T4 at all, so that comes first; `usable` breaks the tie.
scored.sort((p, q) => (q.far > 0) - (p.far > 0) || q.usable - p.usable || q.far - p.far);
const SITE = scored[0].s;
await goTo(SITE);
await settleDoors(T0);
check('T0 the suite found a camera with the crossings the behaviour gates need',
  scored[0].usable >= 1 && scored[0].far >= 1,
  `${scored.length} candidate cameras measured — bores / ordinary 18-90 m bores with a transport that fits / `
  + `the same in T4's 260-620 m band:\n`
  + scored.map(r => `  (${r.s[0]}, ${r.s[1]})  ${r.bores} / ${r.usable} / ${r.far}`).join('\n')
  + `\nchosen (${SITE[0]}, ${SITE[1]}); both of the last two columns have to be non-zero or half this suite cannot run.\n`
  + `Every behaviour gate below stands here. A fixture that drives to a literal and hopes is how T4, `
  + `T7 and T7b all came to be measuring nothing at once when the lattice moved.`);

const TSEED = await evalJSON(S, 'window.__game.trafficSeed()');
const bores = await evalJSON(S, 'window.__game.tunnelList()');
const tstate = await evalJSON(S, 'window.__game.tunnelState()');
const lanes = await evalJSON(S, 'window.__game.roadLanes()');

// ── T1 ─────────────────────────────────────────────────────────────────────
// One lattice. The population's own lane phases, the tunnel layer's line table, and a node-side
// recomputation from js/lanes.js all have to be the same numbers.
{
  const want = lanes.map(l => +roadPhase(l.i >> 1, TSEED).toFixed(6));
  const got = lanes.map(l => +l.phase.toFixed(6));
  const phaseOk = want.every((v, i) => v === got[i]);
  const lines = roadLines(TSEED);
  const layer = tstate.lines.map(l => `${l.axis}:${l.off.toFixed(2)}`).sort();
  const mine = lines.map(l => `${l.axis}:${l.off.toFixed(2)}`).sort();
  const lineOk = layer.length === mine.length && layer.every((v, i) => v === mine[i]);
  // and every live bore sits on one of those lines, modulo the corridor pitch
  const off = bores.map(b => {
    const cand = lines.filter(l => l.axis === b.axis)
      .map(l => Math.abs(((b.line - l.off) / CORR) - Math.round((b.line - l.off) / CORR)) * CORR);
    return Math.min(...cand);
  });
  const worst = off.length ? Math.max(...off) : -1;
  check('T1 one corridor lattice — population, tunnels and lanes.js agree',
    phaseOk && lineOk && bores.length > 0 && worst < 0.005,
    `traffic seed ${TSEED} = trafficSeed(city.seed ${TSEED ^ 0x7a11})\n`
    + `lane phases  live [${got.join(' ')}]  vs js/lanes.js [${want.join(' ')}]  ${phaseOk ? 'identical' : 'DIFFER'}\n`
    + `travel lines live ${layer.join(' ')}\n`
    + `             node ${mine.join(' ')}  ${lineOk ? 'identical' : 'DIFFER'}\n`
    + `${bores.length} live bores, worst distance from a lattice line ${worst.toFixed(5)} m`);

  // FALSIFY: the world seed is the plausible wrong answer, and it is the one that would put every
  // doorway in a wall the buses never touch.
  const bad = lanes.map(l => +roadPhase(l.i >> 1, WORLD_SEED).toFixed(6));
  const badLines = [...new Set(roadLines(WORLD_SEED).map(l => `${l.axis}:${l.off.toFixed(2)}`))].sort();
  const badPhase = bad.some((v, i) => v !== got[i]);
  const badLineSet = !(badLines.length === mine.length && badLines.every((v, i) => v === mine[i]));
  const badOff = bores.map(b => {
    const cand = roadLines(WORLD_SEED).filter(l => l.axis === b.axis)
      .map(l => Math.abs(((b.line - l.off) / CORR) - Math.round((b.line - l.off) / CORR)) * CORR);
    return Math.min(...cand);
  });
  const badWorst = badOff.length ? Math.max(...badOff) : -1;
  check('T1-falsify the UNSALTED seed gives a different lattice, and T1 catches it',
    badPhase && badLineSet,
    `roadPhase(a, WORLD_SEED ${WORLD_SEED}) = [${bad.join(' ')}]  vs live [${got.join(' ')}] — DIFFER\n`
    + `its travel lines ${badLines.join(' ')}\n`
    + `             vs  ${mine.join(' ')} — DIFFER (${badLines.length} lines against ${mine.length})\n`
    + `so T1's phase and line comparisons both go red on the wrong seed.\n`
    + `WORTH SAYING OUT LOUD: T1's third sub-test — "every bore sits on a lattice line" — does NOT\n`
    + `catch it on this seed pair. The world-seed lattice is a strict SUPERSET of the traffic-seed\n`
    + `one here, so every live bore is still 0.00 m from one of its lines (worst ${badWorst.toFixed(2)} m).\n`
    + `That sub-test alone would have been vacuous; the two comparisons above are what carry T1.`);
}

// ── T1b ────────────────────────────────────────────────────────────────────
// T1 cannot see a change to the DERIVATION. It compares the live lattice against a node-side call
// to the same `roadPhase`, so if that function changes, both sides move together and T1 stays
// green while every bus in the city moves to a different street.
//
// That is not hypothetical. S2-N shipped `roadPhase` with a second `^ 0x2ab7` in it, from a
// mistaken belief that it would be called with the world seed; it is called with the traffic seed
// at both sites. The tunnel layer was perfectly self-consistent — the portals sat exactly on the
// lanes, because both read the one function — and all four road families had silently moved off
// the streets the shipped build drove. Every gate in this repo compares the build against itself,
// so not one of them could see it.
//
// So this check does the one thing none of the others do: it pins the answer to a LITERAL for a
// known seed. It is deliberately brittle. If it goes red, either the derivation changed or the
// world seed did, and both of those are things a person should have to confirm on purpose.
{
  const SHIPPED = [102.4, 0, 0, 153.6];        // families 0..3 at trafficSeed(WORLD_SEED)
  const got = [0, 1, 2, 3].map(a => roadPhase(a, trafficSeed(WORLD_SEED)));
  const ok = got.every((v, i) => Math.abs(v - SHIPPED[i]) < 1e-6);
  check('T1b the road lattice is where the shipped build put it',
    ok,
    `roadPhase(0..3, trafficSeed(${WORLD_SEED})) = [${got.map(v => v.toFixed(1)).join(' ')}]\n`
    + `shipped                                    = [${SHIPPED.map(v => v.toFixed(1)).join(' ')}]\n`
    + `${ok ? 'identical — the streets have not moved' : 'MOVED — every bus and tram is on a different street'}`);

  // FALSIFY: the exact salt that shipped in S2-N, run through the same comparison.
  const withSalt = [0, 1, 2, 3].map(a => (hash2i(a, 23, (trafficSeed(WORLD_SEED) ^ 0x2ab7) ^ 0x5b21) % 4) * LOT);
  const caught = withSalt.some((v, i) => Math.abs(v - SHIPPED[i]) >= 1e-6);
  check('T1b-falsify the stray salt this check exists for is caught',
    caught,
    `with S2-N's stray ^ 0x2ab7 restored: [${withSalt.map(v => v.toFixed(1)).join(' ')}] `
    + `vs shipped [${SHIPPED.map(v => v.toFixed(1)).join(' ')}] — ${caught ? 'DIFFER, so T1b goes red' : 'IDENTICAL, so T1b is blind'}`);
}

// ── the live ring's buildings, for T2's independent re-derivation ──────────
const CITY = await evalJSON(S, `(() => {
  const out = [];
  for (const rec of window.__game.cityRecs()) {
    if (!rec.near || !rec.desc) continue;
    for (const b of rec.desc.buildings) out.push({ x: b.x, z: b.z, w: b.w, d: b.d, h: b.h, proto: b.proto, lm: b.landmark });
  }
  return out;
})()`);
const PB = await evalJSON(S, 'window.__game.protoBoxes()');

// The envelope the openings have to clear, taken from the page's own report of CRAFT_DEFS rather
// than from a number typed here — the whole point of §3.10 #4 is that these are physical sizes.
const ENV = tstate.envelope;

// A node-side re-derivation of one bore's along-extent, from blocks.js' unit-space boxes. It knows
// nothing about js/tunnels.js beyond the geometry both are describing.
function groundRun(b, axis, line, half) {
  const boxes = (PB[b.proto] || []).filter(bx => bx.y0 < 0.005);
  const cScale = axis === 0 ? b.d : b.w, aScale = axis === 0 ? b.w : b.d;
  const cC = axis === 0 ? b.z : b.x, aC = axis === 0 ? b.x : b.z;
  const iv = [];
  for (const bx of boxes) {
    if (bx.round) {                                  // the 10-gon, intersected the same way
      const r = (bx.x1 - bx.x0) * 0.5, uc = (line - cC) / cScale;
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < 10; i++) {
        const a0 = (i / 10) * Math.PI * 2, a1 = ((i + 1) / 10) * Math.PI * 2;
        const q0 = [Math.cos(a0) * r, Math.sin(a0) * r], q1 = [Math.cos(a1) * r, Math.sin(a1) * r];
        const c0 = axis === 0 ? q0[1] : q0[0], c1 = axis === 0 ? q1[1] : q1[0];
        const p0 = axis === 0 ? q0[0] : q0[1], p1 = axis === 0 ? q1[0] : q1[1];
        if ((c0 - uc) * (c1 - uc) > 0) continue;
        const t = c1 === c0 ? 0 : (uc - c0) / (c1 - c0);
        const a = p0 + (p1 - p0) * t;
        lo = Math.min(lo, a); hi = Math.max(hi, a);
      }
      if (isFinite(lo) && hi - lo > 1e-4) iv.push({ a0: aC + lo * aScale, a1: aC + hi * aScale, top: bx.y1 * b.h });
      continue;
    }
    const c0 = cC + (axis === 0 ? bx.z0 : bx.x0) * cScale;
    const c1 = cC + (axis === 0 ? bx.z1 : bx.x1) * cScale;
    if (line - half < c0 || line + half > c1) continue;
    iv.push({ a0: aC + (axis === 0 ? bx.x0 : bx.z0) * aScale, a1: aC + (axis === 0 ? bx.x1 : bx.z1) * aScale,
      top: bx.y1 * b.h, c0, c1 });
  }
  if (!iv.length) return null;
  iv.sort((p, q) => p.a0 - q.a0);
  const runs = [];
  let cur = { ...iv[0] };
  for (let i = 1; i <= iv.length; i++) {
    if (i < iv.length && iv[i].a0 <= cur.a1 + 0.05) {
      cur.a1 = Math.max(cur.a1, iv[i].a1);
      cur.c0 = Math.max(cur.c0 ?? -1e9, iv[i].c0 ?? -1e9);
      cur.c1 = Math.min(cur.c1 ?? 1e9, iv[i].c1 ?? 1e9);
      cur.top = Math.min(cur.top, iv[i].top);
      continue;
    }
    runs.push(cur);
    if (i < iv.length) cur = { ...iv[i] };
  }
  return runs;
}

// ── T2 ─────────────────────────────────────────────────────────────────────
//
// The panel geometry is PINNED here rather than read off `tunnelState()`. The layer is the thing
// under test, and a containment test parameterised by the number it is checking moves with that
// number: drop the reveal to zero in js/tunnels.js and a gate that read `tstate.edge` would keep
// passing on flush mouths, which is precisely the shape T1b exists to catch. If these go red the
// constants changed, and that is something a person should have to confirm on purpose.
const SPEC = { quadW: 5.5, quadH: 5.8, edge: 0.35, nudge: 0.60 };
{
  const half = ENV.W * 0.5 + 0.3;
  const rows = [];
  for (const b of bores) {
    const host = CITY.find(c => Math.abs(c.x - b.b.x) < 1e-6 && Math.abs(c.z - b.b.z) < 1e-6
      && Math.abs(c.w - b.b.w) < 1e-6 && Math.abs(c.d - b.b.d) < 1e-6);
    if (!host) { rows.push({ b, why: 'host descriptor not found in the live ring' }); continue; }
    const runs = groundRun(host, b.axis, b.line, half);
    if (!runs) { rows.push({ b, why: 'no ground mass covers the vehicle band at this line' }); continue; }
    const m = runs.find(r => Math.abs(r.a0 - b.a0) < 0.05 && Math.abs(r.a1 - b.a1) < 0.05);
    if (!m) { rows.push({ b, why: `no run matches [${b.a0}, ${b.a1}] — node found ${runs.map(r => `[${r.a0.toFixed(1)},${r.a1.toFixed(1)}]`).join(' ')}` }); continue; }
    // both mouths, on the two faces, standing off by the same amount
    const loA = b.axis === 0 ? b.lo.x : b.lo.z, hiA = b.axis === 0 ? b.hi.x : b.hi.z;
    const crossLo = b.axis === 0 ? b.lo.z : b.lo.x, crossHi = b.axis === 0 ? b.hi.z : b.hi.x;
    const proud0 = b.a0 - loA, proud1 = hiA - b.a1;
    if (!(proud0 > 0.05 && proud0 < 0.45 && Math.abs(proud0 - proud1) < 1e-6)) {
      rows.push({ b, why: `mouth stand-off ${proud0.toFixed(3)}/${proud1.toFixed(3)} m` }); continue;
    }
    if (b.lo.nrm !== -1 || b.hi.nrm !== 1) { rows.push({ b, why: 'mouth normals do not face out of the bore' }); continue; }
    if (Math.abs(crossLo - crossHi) > 1e-6) { rows.push({ b, why: 'the two mouths are not on the same line' }); continue; }
    // `b.cross` and NOT `crossLo`: the x/z pair above is rounded to the centimetre for reading, and
    // this is a containment to the millimetre. Asserting on the rounded pair reported one mouth
    // 5 mm off a face it was exactly flush with and passed the other flush mouth in the same ring,
    // purely on which way toFixed went — a check that cannot separate "flush" from "over the edge"
    // is not measuring the thing it names.
    const hw = SPEC.quadW / 2, edge = SPEC.edge;
    if (m.c0 !== undefined && !(b.cross - hw - edge >= m.c0 - 1e-6 && b.cross + hw + edge <= m.c1 + 1e-6)) {
      rows.push({ b, why: `the panel leaves ${(b.cross - hw - m.c0).toFixed(3)} / ${(m.c1 - b.cross - hw).toFixed(3)} m `
        + `of wall beside it on a face [${m.c0.toFixed(1)}, ${m.c1.toFixed(1)}] — the reveal needs ${edge} m each side` });
      continue;
    }
    if (Math.abs(b.cross - b.line) > SPEC.nudge + 1e-6) {
      rows.push({ b, why: `the mouth is nudged ${Math.abs(b.cross - b.line).toFixed(2)} m off the line` }); continue;
    }
    if (m.top < tstate.quadH + 0.2) { rows.push({ b, why: `the ground mass is only ${m.top.toFixed(1)} m tall` }); continue; }
  }
  const bad = rows.filter(r => r.why);
  const clears = tstate.openW >= ENV.W + 1.2 && tstate.openH >= ENV.H + 1.2;
  const spec = Math.abs(tstate.quadW - SPEC.quadW) < 1e-9 && Math.abs(tstate.quadH - SPEC.quadH) < 1e-9
    && Math.abs(tstate.edge - SPEC.edge) < 1e-9 && Math.abs(tstate.nudge - SPEC.nudge) < 1e-9;
  check('T2 every bore has BOTH mouths, on the real ground-floor face, clearing the largest transport',
    bores.length >= min(4) && bad.length === 0 && clears && spec,
    `${bores.length} bores (the sample guard is ${min(4)}) re-derived in node from blocks.js' unit boxes: ${bad.length} mismatch\n`
    + `opening ${tstate.openW} x ${tstate.openH} m against the largest road def `
    + `(${ENV.L} x ${ENV.W} x ${ENV.H} m) — ${(tstate.openW - ENV.W).toFixed(2)} m of width and `
    + `${(tstate.openH - ENV.H).toFixed(2)} m of headroom\n`
    + `every ${SPEC.quadW} m panel on a face with at least ${SPEC.edge} m of wall beside each edge, nudged at most `
    + `${SPEC.nudge} m off the corridor to get there — pinned here, and the layer reports `
    + `${tstate.quadW} / ${tstate.edge} / ${tstate.nudge.toFixed(2)} (${spec ? 'agree' : 'DIFFER'})\n`
    + `skips reported by the layer: ${JSON.stringify(tstate.stats)}\n`
    + (bad.length ? bad.slice(0, 4).map(r => `  ${r.why}`).join('\n') : '  (no mismatches)'));

  // FALSIFY: shift the line half a lot sideways. The ground boxes are still there, the arithmetic
  // still runs — and it must stop agreeing, or T2 is comparing something to itself.
  //
  // With one qualification, and it is the whole reason this arm has a denominator. A 25.6 m shift
  // across a 100 m downtown slab lands on the SAME ground box, and the along run there really is
  // unchanged — a correct derivation must return the same answer, so counting those as "still
  // agreed" measures the width of the buildings and calls it a failure of the instrument. The arm
  // therefore separates the bores where the shift left the mass from the ones where it did not,
  // asserts it bit at all, and requires it to bite EVERY time it could.
  let stuck = 0, bit = 0, sameMass = 0, alias = 0;
  for (const b of bores) {
    const host = CITY.find(c => Math.abs(c.x - b.b.x) < 1e-6 && Math.abs(c.z - b.b.z) < 1e-6);
    if (!host) continue;
    const m0 = (groundRun(host, b.axis, b.line, half) || [])
      .find(r => Math.abs(r.a0 - b.a0) < 0.05 && Math.abs(r.a1 - b.a1) < 0.05);
    const off = b.line + LOT / 2;
    if (m0 && m0.c0 !== undefined && off - half >= m0.c0 && off + half <= m0.c1) { sameMass++; continue; }
    bit++;
    const hit = (groundRun(host, b.axis, off, half) || [])
      .find(r => Math.abs(r.a0 - b.a0) < 0.05 && Math.abs(r.a1 - b.a1) < 0.05);
    if (!hit) continue;
    // A match from a DIFFERENT ground mass is real geometry — a `split` pair's two halves share an
    // along extent — and it is not the instrument failing to notice the line moved. A match from
    // the SAME mass the shift just left is exactly that, and there may be none of those.
    if (m0 && m0.c0 !== undefined && hit.c0 !== undefined
      && Math.abs(hit.c0 - m0.c0) < 1e-6 && Math.abs(hit.c1 - m0.c1) < 1e-6) stuck++;
    else alias++;
  }
  check('T2-falsify the same re-derivation half a lot off the line stops agreeing',
    bit >= min(4) && stuck === 0,
    `line + ${LOT / 2} m: for ${bit} of ${bores.length} bores (guard ${min(4)}) the shifted vehicle band leaves the ground `
    + `mass it was derived from. ${stuck} of those still match FROM THAT SAME MASS — it has to be none of them,\n`
    + `and ${alias} match from a different mass at the new line, which is a second box with the same along extent and `
    + `not the instrument ignoring where you pointed it.\n`
    + `the remaining ${sameMass} sit on masses wider than the shift, where the along run is genuinely unchanged and a `
    + `correct derivation MUST still agree; scoring those as agreement measures the buildings, not the instrument.`);
}

// ── pick the crossing the behaviour gates use ─────────────────────────────
//
// THE CAMERA GOES FIRST. `roadPosOf` snaps its along tile AND its cross tile to the camera, so
// moving the eye after choosing a transport changes which corridors are populated and which slot
// index is where — and a mesh only exists inside R_NEAR_MAX, so a gate that measures "is it drawn"
// from 390 m away measures the promotion radius and calls it a tunnel. The camera is parked on the
// corridor, outside the entry mouth, and does not move again until T8 aims it.
//
// And a transport is only a candidate if it DEMONSTRABLY drives through this bore. `roadPosOf`
// wraps a vehicle inside a 2048 m along tile snapped to the camera, so a bore outside that tile is
// a place its own corridor's traffic can never reach — the vehicle is on the right line, at the
// right speed, going the right way, and it simply is not going there. T4 spent this whole pass
// asserting about a hull 80 m short of the bore it had picked, on exactly that.
const cands = await evalJSON(S, `window.__game.tunnelList().filter(b => !b.lm && b.len >= 18 && b.len <= 90)`);
let pickBore = null, CAMPOS = null;
const tried = [];
for (const cand of cands.sort((p, q) => q.b.h - p.b.h)) {
  for (const dir of [1, -1]) {
    const lo = cand.axis === 0 ? cand.lo.x : cand.lo.z, hi = cand.axis === 0 ? cand.hi.x : cand.hi.z;
    const ent = dir > 0 ? lo : hi;
    const camA = ent - dir * 17;
    const pos = cand.axis === 1 ? [cand.line, 4.4, camA] : [camA, 4.4, cand.line];
    await evalJSON(S, `(window.__game.teleport(${pos[0]}, ${pos[1]}, ${pos[2]}), 1)`);
    await quiesce(S, { timeout: 120000 });
    await settleDoors(T0);
    const got = await evalJSON(S, `(() => {
      const g = window.__game;
      const b = g.tunnelList().find(x => x.axis === ${cand.axis} && Math.abs(x.line - ${cand.line}) < 0.05
        && Math.abs(x.a0 - ${cand.a0}) < 0.05);
      if (!b) return { why: 'the bore is not in the ring from this camera' };
      const rows = g.roadList().filter(v => v.axis === b.axis && v.dir === ${dir}
        && Math.abs((b.axis === 0 ? v.z : v.x) - b.line) < ${R_LANE * 0.5} && v.L + 6 < b.len)
        .sort((p, q) => q.L - p.L);
      if (!rows.length) return { why: 'no transport short enough on this corridor' };
      for (const v of rows.slice(0, 2)) {
        const half = v.L / 2;
        for (let t = 0; t < 340; t += 0.1) {
          const r = g.roadList(0, t).find(q => q.i === v.i);
          if (!r) break;
          const a = b.axis === 0 ? r.x : r.z;
          if (a - half > b.a0 + 0.3 && a + half < b.a1 - 0.3) return { b, v, inside: +t.toFixed(2) };
        }
      }
      return { why: 'no transport on this corridor ever reaches the bore — it is outside their along tile' };
    })()`);
    tried.push(`(${cand.axis === 0 ? 'X' : 'Z'} ${cand.line}, [${cand.a0}, ${cand.a1}]) dir ${dir}: ${got.why || 'ok'}`);
    if (!got.why) { pickBore = got; CAMPOS = pos; break; }
  }
  if (pickBore) break;
}
if (!pickBore) {
  check('T3..T8 a crossing a transport actually drives through exists at the test site', false,
    `no ordinary bore near (${SITE}) had a transport that both fits it and reaches it with the camera `
    + `parked at its mouth — the behaviour gates cannot run, and a suite that skips them is not a pass\n`
    + tried.slice(0, 8).map(s => '  ' + s).join('\n'));
} else {
  const B = pickBore.b, V = pickBore.v;
  const loA = B.axis === 0 ? B.lo.x : B.lo.z, hiA = B.axis === 0 ? B.hi.x : B.hi.z;
  const sgn = V.dir;
  const entry = sgn > 0 ? loA : hiA, exitA = sgn > 0 ? hiA : loA;

  const timeAt = timeAtOf(V.i, B.axis);
  const timeInside = timeInsideOf(V.i, B.axis);
  const readV = () => evalJSON(S, `(() => {
    const g = window.__game;
    const v = g.roadList().find(r => r.i === ${V.i});
    const s = g.tunnelList().find(x => x.axis === ${B.axis} && Math.abs(x.line - ${B.line}) < 0.05 && Math.abs(x.a0 - ${B.a0}) < 0.05);
    return { v, lo: s && s.lo, hi: s && s.hi };
  })()`);

  const site = `${V.type} L ${V.L} m, dir ${sgn}, ${V.speed} m/s on the ${B.axis === 0 ? 'X' : 'Z'} corridor at `
    + `${B.line}; a ${B.len.toFixed(1)} m bore through a ${B.b.h.toFixed(0)} m ${B.proto} at `
    + `(${B.b.x.toFixed(1)}, ${B.b.z.toFixed(1)})`;

  // ── T3 / T4 ──────────────────────────────────────────────────────────────
  {
    const half = V.L / 2;
    const straddle = await timeAt(entry + sgn * (half * 0.6));      // nose in, tail on the street
    await settleDoors(straddle.t);
    const inStraddle = await readV();
    const mid = await timeInside(B.a0, B.a1, half);                 // found by the predicate, not aimed at
    if (!mid) throw new Error('T3: the picked transport has no wholly-inside moment, and the pick asserted one');
    await settleDoors(mid.t);
    const inside = await readV();
    const out = await timeAt(exitA + sgn * (half + 14));
    await settleDoors(out.t);
    const clear = await readV();
    const landed = straddle.hit && out.hit;

    // The POSITIVE control comes first: the same transport, one step earlier, IS drawn.
    // `streak` is 0 at all three of these instants and that is correct, not a defect — §5.5's
    // crossfade ramps a road streak out below R_NEAR - 30 m and the camera is 17 m away, so the
    // mesh is the whole representation here. T4 measures the streak where a streak is what there
    // is, which is a different bore.
    const sawIt = inStraddle.v.drawn === true && inStraddle.v.hidden === false;
    const gone = inside.v.hidden === true && inside.v.drawn === false;
    const back = clear.v.hidden === false && clear.v.drawn === true;
    check('T3 a transport inside a crossed building is not drawn — and IS drawn either side of it',
      landed && sawIt && gone && back,
      `${site}\n`
      + `  straddling the mouth (nose ${(straddle.a + sgn * half).toFixed(1)}, tail ${(straddle.a - sgn * half).toFixed(1)}, `
      + `mouth ${entry.toFixed(1)}): hidden ${inStraddle.v.hidden}  mesh ${inStraddle.v.drawn}  streak ${inStraddle.v.streak}\n`
      + `  wholly inside      (nose ${(mid.a + sgn * half).toFixed(1)}, tail ${(mid.a - sgn * half).toFixed(1)}, `
      + `bore [${B.a0.toFixed(1)}, ${B.a1.toFixed(1)}]): hidden ${inside.v.hidden}  mesh ${inside.v.drawn}  streak ${inside.v.streak}\n`
      + `  clear of the far mouth: hidden ${clear.v.hidden}  mesh ${clear.v.drawn}  streak ${clear.v.streak}\n`
      + `  the two aimed instants landed ${straddle.d} m / ${out.d} m from where they were asked for (tolerance ${TOL} m), `
      + `and the middle one was FOUND by the enclosure predicate rather than aimed at — a scan that returns its\n`
      + `  closest approach whatever happens will hand you a hull 80 m short of the bore and let you assert about it\n`
      + `  the first line is the control: without it "not drawn inside" is also true of a transport that was never there`);

    // FALSIFY: unhook the tunnel layer. traffic.js falls back to the centre-point solidAt rule it
    // shipped with, and the STRADDLE instant — the one this whole phase exists to fix — must flip.
    await hook(S, 'setTunnels', false);
    await settleDoors(straddle.t);
    const noTun = await readV();
    await settleDoors(mid.t);
    const noTunMid = await readV();
    await hook(S, 'setTunnels', true);
    await settleDoors(straddle.t);
    const reTun = await readV();
    check('T3-falsify with the tunnel layer unhooked the SAME instant reads the old way',
      noTun.v.hidden === true && noTun.v.drawn === false && noTunMid.v.hidden === true
      && reTun.v.hidden === false && reTun.v.drawn === true,
      `at the straddle instant, tunnels OFF: hidden ${noTun.v.hidden} mesh ${noTun.v.drawn} `
      + `(the shipped centre-point solidAt rule cut a ${V.L} m transport in half at the wall and popped the rest)\n`
      + `                     tunnels ON : hidden ${reTun.v.hidden} mesh ${reTun.v.drawn}\n`
      + `wholly inside with tunnels OFF is still hidden (${noTunMid.v.hidden}) — the two rules agree there, `
      + `which is why the straddle instant is the one that proves the change`);
  }

  // ── T5 / T6 — the doors ──────────────────────────────────────────────────
  {
    const half = V.L / 2;
    const atMouth = await timeAt(entry);
    await settleDoors(atMouth.t);
    const m = await readV();
    const entryLeaf = () => (sgn > 0 ? m.lo : m.hi);
    // The quiet instant is SEARCHED FOR, not aimed at: a moment when no transport on this corridor
    // is within LEAD + TRAIL + 40 m of either mouth. Driving the chosen vehicle to a coordinate
    // 240 m from the entry instead asks it to go somewhere that may be outside the 2048 m along
    // tile the population wraps in — on the LOW ring the scan came up 129 m short of that target
    // and the leaves were shut for their own reasons, which is a passing check of nothing.
    const clearOf = tstate.lead + tstate.trail + 40;
    const quiet = await evalJSON(S, `(() => {
      const g = window.__game;
      for (let t = 0; t < 340; t += 0.25) {
        let worst = Infinity;
        for (const v of g.roadList(0, t)) {
          if (v.axis !== ${B.axis} || Math.abs((${B.axis} === 0 ? v.z : v.x) - ${B.line}) >= ${R_LANE * 0.5}) continue;
          const a = ${B.axis} === 0 ? v.x : v.z, h = v.L / 2;
          worst = Math.min(worst, Math.max(${B.a0} - (a + h), (a - h) - ${B.a1}));
        }
        if (worst > ${clearOf}) return { t: +t.toFixed(2), gap: +worst.toFixed(1) };
      }
      return null;
    })()`);
    if (quiet) await settleDoors(quiet.t, 8);
    const q = quiet ? await readV() : null;

    check('T5 the doors are OPEN at the mouth and SHUT when nothing is near',
      atMouth.hit && !!quiet && entryLeaf().open === 1 && q.lo.open === 0 && q.hi.open === 0,
      `${site}\n`
      + `  vehicle centred on the mouth: entry leaf ${entryLeaf().open}, want ${entryLeaf().want} `
      + `(the instant landed ${atMouth.d} m from where it was asked for, tolerance ${TOL} m)\n`
      + `  ${quiet ? `at t=${quiet.t} the nearest transport on this corridor is ${quiet.gap} m clear of the bore `
        + `(the door model reaches ${clearOf - 40} m): lo ${q.lo.open}  hi ${q.hi.open}  (want ${q.lo.want}/${q.hi.want})`
        : 'no moment in 340 s leaves this corridor clear of the bore, so "shut when nothing is near" cannot be measured'}`);

    // T6 — the door is fully open BEFORE the nose reaches it. Walk the approach and find the first
    // instant the leaf reads 1, then ask where the nose was.
    const lead = tstate.lead;
    const t0 = await timeAt(entry - sgn * (half + lead + 24));
    const opened = await evalJSON(S, `(() => {
      const g = window.__game;
      let first = null;
      for (let k = 0; k < 460; k++) {
        const t = ${t0.t} + k / 30;
        g.stepVehicles(t, 1/30);
        const s = g.tunnelList().find(x => x.axis === ${B.axis} && Math.abs(x.line - ${B.line}) < 0.05 && Math.abs(x.a0 - ${B.a0}) < 0.05);
        const leaf = ${sgn > 0 ? 's.lo' : 's.hi'};
        const v = g.roadList().find(r => r.i === ${V.i});
        const a = ${B.axis === 0 ? 'v.x' : 'v.z'};
        if (leaf.open >= 1 && !first) { first = { t: +t.toFixed(2), nose: +(a + ${sgn} * ${half}).toFixed(2) }; break; }
      }
      return first;
    })()`);
    const gap = opened ? (entry - opened.nose) * sgn : -1;
    check('T6 the leaf is fully open BEFORE the nose arrives, and by a real margin',
      t0.hit && !!opened && gap > 2,
      `walking the approach at 1/30 s: the entry leaf first reads 1.0 with the nose still `
      + `${gap.toFixed(2)} m short of the mouth (${opened ? opened.nose.toFixed(1) : 'never'} vs ${entry.toFixed(1)})\n`
      + `the door model is LEAD ${tstate.lead} m ahead / TRAIL ${tstate.trail} m behind over ${tstate.doorT} s of travel, `
      + `and this transport does ${V.speed} m/s. That used to read "the slowest in the fleet still
`
      + `clears it", which is now vacuous: S2-O gave the whole street population ONE speed, so there
`
      + `is no slowest. The check is unaffected — the door model is DISTANCE-driven, not timed.`);

    // FALSIFY (a): with the population switched off every leaf must close. A door stuck open
    // satisfies T5's first half for free.
    await hook(S, 'setTraffic', false);
    await evalJSON(S, `(() => { const g = window.__game; for (let k = 0; k < 90; k++) g.stepVehicles(${atMouth.t}, 1/30); return 1; })()`);
    const dead = await evalJSON(S, 'window.__game.tunnelList().map(s => [s.lo.open, s.hi.open])');
    await hook(S, 'setTraffic', true);
    await settleDoors(atMouth.t);
    const alive = await readV();
    check('T5-falsify with the road population off every leaf closes, and comes back',
      dead.length > 0 && dead.every(d => d[0] === 0 && d[1] === 0) && (sgn > 0 ? alive.lo : alive.hi).open === 1,
      `${dead.length} bores with traffic disabled: ${dead.every(d => d[0] === 0 && d[1] === 0) ? 'all leaves 0' : 'SOME STILL OPEN ' + JSON.stringify(dead.filter(d => d[0] || d[1]))}\n`
      + `and with it back on at the same instant the entry leaf reads ${(sgn > 0 ? alive.lo : alive.hi).open}`);
  }

  // ── T8 — the draw, and that iDoor actually reaches the shader ────────────
  {
    // Park the camera looking square into the entry mouth from the street.
    const atMouth = await timeAt(entry + sgn * (V.L * 0.30));
    await settleDoors(atMouth.t);
    const yaw = B.axis === 1 ? (sgn > 0 ? 180 : 0) : (sgn > 0 ? -90 : 90);
    // The SAME position the population was picked at. Aiming is free; moving is not.
    await hook(S, 'setCamera', { pos: CAMPOS, yaw, pitch: 2, fov: 58 });
    await settleDoors(atMouth.t);
    await settle(S, 8);

    const sample = async () => { await settle(S, 4); return await grid(); };

    const A0 = await sample(), A1 = await sample();
    const noise = diff(A0, A1);
    const dOn = await evalJSON(S, '({ d: window.__game.renderer.info.render.calls, t: window.__game.renderer.info.render.triangles, n: window.__game.tunnelState().n })');
    await hook(S, 'setTunnelVisible', false);
    const off = await sample();
    const dOff = await evalJSON(S, '({ d: window.__game.renderer.info.render.calls, t: window.__game.renderer.info.render.triangles })');
    await hook(S, 'setTunnelVisible', true);
    const back = await sample();
    const vis = diff(A1, off);
    check('T8 the whole layer is ONE draw call and two triangles an instance, and it reaches the frame',
      dOn.d - dOff.d === 1 && dOn.t - dOff.t === dOn.n * 2 && vis.mean > noise.mean * 20,
      `${dOn.n} portals in the ring: ${dOff.d} → ${dOn.d} draws (+${dOn.d - dOff.d}), `
      + `${dOff.t} → ${dOn.t} tris (+${dOn.t - dOff.t} = ${dOn.n} x 2)\n`
      + `against the budget gate's 90 draws\n`
      + `layer ON vs OFF at a camera 17 m off a mouth: mean |Δ| ${vis.mean.toFixed(5)}, worst cell ${vis.worst.toFixed(4)}\n`
      + `probe repeat noise ${noise.mean.toFixed(6)} — until this separation is real, every "the doors changed" below is vacuous`);
    void back;

    // The doors themselves, in PIXELS. iDoor is written every frame from JS; if it never reached
    // the shader — or reached the WRONG INSTANCE — the leaves would be painted at whatever the
    // attribute was left at, and every JS-side door number above would still be perfect.
    //
    // That is not hypothetical and it is what this check earned its keep on. `Field.free`
    // swap-removes: it moves the last live instance into the freed slot and repairs the array it
    // was allocated with, `rec.tnQ`. js/tunnels.js also cached the slot on its own portal record,
    // and that copy went stale the first time a neighbouring chunk was released — so after any
    // streaming churn the per-frame openness was written onto some other portal's instance. The
    // model said the door in front of the camera was fully open; the pixels were of a shut door;
    // and forcing the uniform proved the leaves themselves worked. `live → shut 0.00000`.
    await hook(S, 'setDoorForce', 0);
    const shut = await sample();
    await hook(S, 'setDoorForce', 1);
    const openPix = await sample();
    await hook(S, 'setDoorForce', -1);
    const live = await sample();
    const dShutOpen = diff(shut, openPix);
    const liveVsOpen = diff(live, openPix), liveVsShut = diff(live, shut);
    // The model's view of the same leaf, and the value actually sitting in the instance buffer for
    // it. `slotsBad` is the field's OWN ownership map disagreeing with the layer's bookkeeping —
    // the one statement a private copy of a slot cannot satisfy.
    const leaf = await evalJSON(S, `(() => {
      const g = window.__game;
      const s = g.tunnelList().find(x => x.axis === ${B.axis} && Math.abs(x.line - ${B.line}) < 0.05 && Math.abs(x.a0 - ${B.a0}) < 0.05);
      const p = ${sgn > 0 ? 's.lo' : 's.hi'};
      return { open: p.open, buf: p.buf, slot: p.slot, bad: g.tunnelState().slotsBad, n: g.tunnelState().portals };
    })()`);
    check('T8b the leaves are real pixels — SHUT and OPEN differ, and the live door reads OPEN here',
      dShutOpen.mean > noise.mean * 20 && liveVsOpen.mean < liveVsShut.mean * 0.5
      && leaf.open === 1 && leaf.buf === leaf.open && leaf.bad === 0,
      `at a camera looking into a mouth with the transport half through it:\n`
      + `  forced SHUT vs forced OPEN: mean |Δ| ${dShutOpen.mean.toFixed(5)}, worst ${dShutOpen.worst.toFixed(4)} (noise ${noise.mean.toFixed(6)})\n`
      + `  live → open ${liveVsOpen.mean.toFixed(5)}   live → shut ${liveVsShut.mean.toFixed(5)}   `
      + `the live door reads OPEN by ${(liveVsShut.mean / Math.max(liveVsOpen.mean, 1e-9)).toFixed(1)}x\n`
      + `  the model says this leaf is ${leaf.open} and instance ${leaf.slot}'s iDoor holds ${leaf.buf}; `
      + `${leaf.bad} of ${leaf.n} mouths disagree with the field's own ownership map\n`
      + `  those last two numbers are what separates "the door is shut" from "the door is open and `
      + `something else is being painted" — this check read the second as the first for a whole pass`);
  }
}

// ── T4 — the streak, measured where a streak is the representation ────────
//
// Its OWN camera, and it moves before it picks. Inside R_NEAR - 30 m §5.5's crossfade has already
// ramped a road streak to zero and the mesh is carrying the vehicle, so a zero read from the T3
// camera is the same number a streak field that was never written would give. This one stands far
// enough back that the transport has no mesh at any instant.
{
  await evalJSON(S, `(window.__game.teleport(${SITE[0]}, 40, ${SITE[1]}), 1)`);
  await quiesce(S, { timeout: 120000 });
  await settleDoors(T0);
  // ── T4 ─────────────────────────────────────────────────────────────────
  // The streak, measured where the vehicle IS a streak. Inside R_NEAR - 30 m §5.5's crossfade
  // has already ramped it to zero and the mesh is carrying the craft, so a zero read there
  // proves nothing at all — it is the same number a working streak would give.
  //
  // SELECTED, not aimed at. A bore on a populated corridor is not the same thing as a bore the
  // population reaches: `roadPosOf` wraps every vehicle inside a 2048 m along tile snapped to the
  // camera, and a bore outside that tile is a place its own corridor's traffic never goes. The
  // fixture used to take the nearest bore with any vehicle on its line and then aim a scan at the
  // bore's midpoint; the scan returned its closest approach — 80 m short — the middle sample was
  // outside the building, all three reads were the same 0.95, and the check correctly refused to
  // pass a measurement of nothing. Here the candidate is only accepted once a moment has been
  // FOUND at which the whole hull is between the two portal planes.
  const far = await evalJSON(S, `(() => {
    const g = window.__game;
    const cam = g.camera.position;
    const out = [];
    for (const b of g.tunnelList()) {
      const mid = { x: b.axis === 0 ? (b.a0 + b.a1) / 2 : b.line, z: b.axis === 0 ? b.line : (b.a0 + b.a1) / 2 };
      const d = Math.hypot(mid.x - cam.x, mid.z - cam.z);
      if (d < 260 || d > 620) continue;
      const rows = g.roadList().filter(v => v.axis === b.axis
        && Math.abs((b.axis === 0 ? v.z : v.x) - b.line) < ${R_LANE * 0.5} && v.L + 6 < b.len);
      if (rows.length) out.push({ b, v: rows.sort((p, q) => q.L - p.L)[0], d: +d.toFixed(0) });
    }
    let reached = 0;
    for (const c of out.sort((p, q) => p.d - q.d)) {
      const half = c.v.L / 2;
      for (let t = 0; t < 340; t += 0.1) {
        const r = g.roadList(0, t).find(q => q.i === c.v.i);
        if (!r) break;
        const a = c.b.axis === 0 ? r.x : r.z;
        if (a - half > c.b.a0 + 0.3 && a + half < c.b.a1 - 0.3) return Object.assign(c, { cand: out.length, reached: reached + 1 });
      }
      reached++;
    }
    return out.length ? { none: true, cand: out.length } : null;
  })()`);
  if (!far || far.none) {
    check('T4 the streak is zeroed too — you do not see a headlight through a wall', false,
      `${far ? far.cand + ' bores' : 'no bore'} in the 260-620 m band had traffic on their corridor, and `
      + `${far ? 'none of them is inside the along tile that traffic can reach' : 'none at all'} — so the streak `
      + `could not be measured where a streak is the representation. A skipped arm is not a pass.`);
  } else {
    const fb = far.b, fv = far.v, fsgn = fv.dir;
    const fLo = fb.axis === 0 ? fb.lo.x : fb.lo.z, fHi = fb.axis === 0 ? fb.hi.x : fb.hi.z;
    const fEntry = fsgn > 0 ? fLo : fHi, fExit = fsgn > 0 ? fHi : fLo;
    const fHalf = fv.L / 2;
    const timeAtF = timeAtOf(fv.i, fb.axis);
    const readF = () => evalJSON(S, `window.__game.roadList().find(r => r.i === ${fv.i})`);
    const tA = await timeAtF(fEntry - fsgn * (fHalf + 20)); await stepTo(tA.t);
    const before = await readF();
    const tB = await timeInsideOf(fv.i, fb.axis)(fb.a0, fb.a1, fHalf); await stepTo(tB.t);
    const within = await readF();
    const tC = await timeAtF(fExit + fsgn * (fHalf + 20)); await stepTo(tC.t);
    const after = await readF();
    check('T4 the streak is zeroed too — you do not see a headlight through a wall',
      tA.hit && tC.hit && before.streak > 0 && before.drawn === false
      && within.streak === 0 && within.hidden === true
      && after.streak > 0 && after.drawn === false,
      `a ${fv.L} m ${fv.type} through a ${fb.len.toFixed(1)} m bore ${far.d} m from the camera — past the `
      + `240 m promotion radius, so it has no mesh at any of these instants and the streak is all there is\n`
      + `  candidate ${far.reached} of ${far.cand} in the 260-620 m band: the ones before it are on populated `
      + `corridors their own traffic never reaches\n`
      + `  bore [${fb.a0}, ${fb.a1}] line ${fb.line}; at t=${tB.t} the hull spans ${(tB.a - fHalf).toFixed(1)}..${(tB.a + fHalf).toFixed(1)} `
      + `— found by the enclosure predicate, so the middle read is of a hull that IS inside\n`
      + `  the two aimed instants landed ${tA.d} m / ${tC.d} m from where they were asked for (tolerance ${TOL} m)\n`
      + `  iInt off the instanced buffer at slot N+i: 20 m short ${before.streak} (mesh ${before.drawn}), `
      + `wholly inside ${within.streak} (hidden ${within.hidden}), 20 m clear ${after.streak}\n`
      + `  the two non-zero reads are the control: a streak field that was never written would give the `
      + `same zero in the middle`);
  }
}

// ── T7 — nothing is ever hidden in open air ───────────────────────────────
//
// The invariant is NOT "hidden implies bore". Where a corridor only clips a corner, or runs under
// a landmark plinth too narrow to dress, `traffic.js` deliberately keeps the centre-point
// `solidAt` suppression it shipped with — so a hidden transport is legitimately either enclosed by
// a bore or standing inside a building the layer did not dress. What must never happen is a bus
// disappearing in the street, and that is what this measures.
//
// `solidAt` returns null both for open air and for an ungenerated chunk, so every probe asserts
// `cityChunkLive` first. That ambiguity produced the exact opposite conclusion once already on
// this project, across 242 pads.
//
// ── the sampling interval is part of the measurement ──────────────────────
//
// This swept 90 moments 1.7 s apart and T7b 120 moments 0.9 s apart, and both of those are LONGER
// than the event they are sampling. A 12 m bus at 15.5 m/s is wholly inside a 21 m bore for 0.6 s
// and straddles a mouth for 0.8 s, so at a 0.9-1.7 s step most transits fell between two samples
// and the sweep reported a handful of observations of a thing that happens constantly. That reads
// exactly like "the layer stopped working". The step is now 0.2 s — under the shortest event in
// the fleet — and the totals below are the same span, sampled properly.
//
// Correlated samples are not evidence, though: four reads of one bus inside one bore are one
// transit, not four. So the vacuity guards count EPISODES — a (vehicle, bore) pair that was not
// present in the previous sample — and the raw observation count is reported beside them.
const STEP = 0.2, SPAN = 153;
{
  const audit = ox => `(() => {
    const g = window.__game, OFFX = ${ox[0]}, OFFZ = ${ox[1]};
    let hidden = 0, bore = 0, solid = 0, air = 0, dead = 0, samples = 0, seen = 0;
    let hidEp = 0, boreEp = 0, probeAir = 0;
    let prevHid = new Set(), prevBore = new Set();
    const worst = [];
    for (let k = 0; k * ${STEP} < ${SPAN}; k++) {
      g.stepVehicles(${T0} + k * ${STEP}, 1/30);
      const bores = g.tunnelList();
      seen = Math.max(seen, bores.length);
      const nowHid = new Set(), nowBore = new Set();
      for (const v of g.roadList()) {
        samples++;
        if (!v.hidden) continue;
        hidden++;
        if (!prevHid.has(v.i)) hidEp++;
        nowHid.add(v.i);
        const half = v.L / 2, a = v.axis === 0 ? v.x : v.z, c = v.axis === 0 ? v.z : v.x;
        const b = bores.find(x => x.axis === v.axis && Math.abs(x.line - c) < ${R_LANE * 0.5}
          && a - half > x.a0 && a + half < x.a1);
        // The mass probe runs for EVERY hidden transport, bore or no bore. Short-circuiting on the
        // bore branch made the falsification arm below vacuous the moment a camera came up where
        // everything hidden happened to be inside a dressed bore: it probed nothing, reported zero
        // open air, and that zero is indistinguishable from the one T7 wants.
        const px = v.x + OFFX, pz = v.z + OFFZ;
        const live = g.cityChunkLive(px, pz);
        const cls = !live ? 'dead' : g.solidAt(px, v.y, pz, 1.5) ? 'solid' : 'air';
        if (cls === 'air') probeAir++;
        if (b) {
          bore++;
          const key = v.i + '@' + b.axis + ':' + b.line + ':' + b.a0;
          if (!prevBore.has(key)) boreEp++;
          nowBore.add(key);
          continue;
        }
        if (cls === 'dead') { dead++; continue; }
        if (cls === 'solid') solid++;
        else { air++; if (worst.length < 4) worst.push({ i: v.i, type: v.type, x: v.x, z: v.z }); }
      }
      prevHid = nowHid; prevBore = nowBore;
    }
    return { hidden, bore, solid, air, dead, samples, seen, worst, hidEp, boreEp, probeAir };
  })()`;
  const a = await evalJSON(S, audit([0, 0]));
  check('T7 nothing is ever hidden in open air — every hidden transport is in a bore or in a mass',
    a.hidEp >= min(20) && a.boreEp > 0 && a.air === 0 && a.dead === 0,
    `${Math.round(SPAN / STEP)} sim moments ${STEP} s apart, ${a.samples} road-vehicle observations over ${a.seen} live bores\n`
    + `  ${a.hidden} hidden: ${a.bore} enclosed by a bore, ${a.solid} inside an undressed mass `
    + `(the shipped centre-point rule), ${a.air} in open air, ${a.dead} on an unstreamed chunk\n`
    + `  as EPISODES rather than samples: ${a.hidEp} separate suppressions (guard ${min(20)}), of which `
    + `${a.boreEp} were transits of a bore (guard 1)\n`
    + `  those two are the vacuity guards, and they count episodes because four consecutive reads of one bus `
    + `in one bore are one transit — a sweep that hid nothing, or that never took the tunnel path, would\n`
    + `  satisfy "nothing was hidden wrongly" for free, and a finer sampling step must not be able to buy its way past that`);

  // FALSIFY the solidAt half: ask the same question 60 m off the corridor. The buildings are still
  // there, cityChunkLive is still true — but the point is in the street, so the audit has to start
  // reporting "hidden in open air". A probe that answered "solid" wherever you pointed it would
  // make the zero above worth nothing.
  const b = await evalJSON(S, audit([60, 60]));
  check('T7-falsify the same audit probed 60 m off the corridor does report open air',
    b.probeAir > 0 && b.dead === 0 && a.probeAir === 0,
    `probing (x+60, z+60): ${b.hidden} hidden, ${b.bore} in a bore, ${b.solid} reading solid outside one, `
    + `${b.air} reading OPEN AIR outside one, ${b.dead} unstreamed\n`
    + `  over ALL ${b.hidden} hidden transports and not only the ones outside a bore, the shifted probe calls `
    + `${b.probeAir} of them open air; the unshifted probe calls ${a.probeAir} of them open air\n`
    + `  that pair is the control. Probing only the non-bore residue made this arm read zero at a camera where `
    + `every hidden transport was inside a bore — the same zero T7 wants, from a probe that ran on nothing`);
}

// ── T7b — the straddle, which is the whole point of the phase ─────────────
{
  const straddleCount = `(() => {
    const g = window.__game;
    let n = 0, obs = 0, ep = 0;
    let prev = new Set();
    for (let k = 0; k * ${STEP} < ${SPAN}; k++) {
      g.stepVehicles(${T0} + k * ${STEP}, 1/30);
      const bores = g.tunnelList();
      const now = new Set();
      for (const v of g.roadList()) {
        const half = v.L / 2, a = v.axis === 0 ? v.x : v.z, c = v.axis === 0 ? v.z : v.x;
        const b = bores.find(x => x.axis === v.axis && Math.abs(x.line - c) < ${R_LANE * 0.5}
          && a + half > x.a0 && a - half < x.a1);
        if (!b) continue;
        const whole = a - half > b.a0 && a + half < b.a1;
        if (whole) continue;
        obs++;                       // straddling a dressed mouth
        const key = v.i + '@' + b.axis + ':' + b.line + ':' + b.a0 + ':' + (a < (b.a0 + b.a1) / 2 ? 'lo' : 'hi');
        if (!prev.has(key)) ep++;
        now.add(key);
        if (v.hidden) n++;
      }
      prev = now;
    }
    return { obs, ep, hiddenWhileStraddling: n };
  })()`;
  await hook(S, 'setTunnels', true);
  const on = await evalJSON(S, straddleCount);
  await hook(S, 'setTunnels', false);
  const off = await evalJSON(S, straddleCount);
  await hook(S, 'setTunnels', true);
  check('T7b a transport straddling a dressed mouth is never cut in half — and the old rule cut it',
    on.ep >= min(30) && on.hiddenWhileStraddling === 0 && off.hiddenWhileStraddling > 0,
    `${Math.round(SPAN / STEP)} sim moments ${STEP} s apart. Transports part-way through a dressed mouth: `
    + `${on.ep} separate passes through a mouth (guard ${min(30)}), ${on.obs} raw observations.\n`
    + `  tunnels ON : ${on.hiddenWhileStraddling} of them suppressed\n`
    + `  tunnels OFF: ${off.hiddenWhileStraddling} of ${off.obs} suppressed over ${off.ep} passes — the shipped rule\n`
    + `               dropped the mesh the moment the middle crossed the wall, which is the pop Aaron was looking at\n`
    + `  the guard is on PASSES, not samples: at 0.9 s this sweep was sampling slower than the 0.8 s a bus takes to\n`
    + `  clear a mouth, found four straddles in the whole city and read that as the layer having stopped working`);
}

// ── T9 — the traffic hash ─────────────────────────────────────────────────
{
  await hook(S, 'setTunnels', true);
  await stepTo(T0);
  const withT = await evalJSON(S, `window.__game.trafficHash(${T0})`);
  await hook(S, 'setTunnels', false);
  await stepTo(T0);
  const without = await evalJSON(S, `window.__game.trafficHash(${T0})`);
  await hook(S, 'setTunnels', true);
  await stepTo(T0);
  const again = await evalJSON(S, `window.__game.trafficHash(${T0})`);
  const other = await evalJSON(S, `window.__game.trafficHash(${T0 + 3})`);
  check('T9 hiding a transport does not move the traffic hash — and the hash can still move',
    withT.hash === without.hash && withT.hash === again.hash && other.hash !== withT.hash
    && withT.road === without.road,
    `t=${T0}: tunnels ON ${withT.hash} (${withT.road} road) · OFF ${without.hash} · ON again ${again.hash}\n`
    + `t=${T0 + 3}: ${other.hash} — the instrument moves when the world moves, so the three matches above are a result.\n`
    + `hash() reads roadPosOf and the per-vehicle constants; visibility is not one of them, and gates_p5's `
    + `determinism check is measuring the same thing it always was`);
}

const errs = await evalJSON(S, 'window.__state.errors');
check('T10 the page reported no errors and no shader patch missed',
  Array.isArray(errs) && errs.length === 0 && !logs.some(l => /patch MISSED/.test(l)),
  `__state.errors ${JSON.stringify(errs)}\n`
  + `console: ${logs.length ? logs.slice(0, 3).join(' | ') : '(clean)'}`);

console.log(`\n${ok.length}/${ok.length + fail.length} gates pass  →  ${FILE}`);
await close();
process.exit(fail.length ? 1 : 0);
