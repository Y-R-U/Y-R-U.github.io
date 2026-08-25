#!/usr/bin/env node
/**
 * P4 and P4b — the altitude ladder — measured for the first time.
 *
 * Both criteria have carried "NOT MEASURABLE IN THIS HARNESS" since P8 built
 * `gates_portrait.mjs`, because they need the band crossfade and that is P9's.
 * This is the instrument. It is pure node: `bandBlend` and the band table are
 * importable without a GL context, and `js/sim/world.js` holds the reading
 * model, so the game and the gate read the SAME functions rather than two
 * implementations of the same arithmetic (W5's rule, one system early).
 *
 *   node tools/ladder.mjs                    both orientations, the full table
 *   node tools/ladder.mjs --mode landscape
 *   node tools/ladder.mjs --falsify          break each thing, require RED
 *
 * `--falsify` is the half that makes the other half mean something. Every
 * constant P9 introduces has a switch here, and each is required to move the
 * criterion it is supposed to control. Three metrics on this project have read
 * clean while the thing they measured was broken (D99, D105, D109), and D115
 * decided the orientation of the whole game.
 */

import { BANDS, CEILING_WU, GROUND_WU, BEST_CLIMB_WU_S } from '../js/core/bands.js';
import { BAND_FEATHER_WU, BEST_CLIMB_WU_S as SKY_CLIMB, bandBlend, setBandFeather, getBandFeather }
  from '../js/gfx/sky.js';
import { makeView } from './p8engage.mjs';
import {
  BAND_LEGIBLE_PX, CRANE_HOLD_BAR_S, CRANE_RATE_WU_S, CRANE_SECONDS,
  SIGNATURE_SPAN_WU, bandExtentsPx, boundaryDwellS, craneHolds, frameWu,
  legibleCount, legibleFrac, legibleWu, signatureAltitudes, traversalFraction,
} from '../js/sim/world.js';

const argv = process.argv.slice(2);
const has = (k) => argv.includes(k);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? Number(argv[i + 1]) : d; };
const argS = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };

/* --- the bars, restated from ARCHITECTURE §4.4.2 and not chosen here -------- */
const P4_TRAVERSAL_FRAC = 0.55;   // >= 2 bands legible for >= 55% of a full climb
const P4_ESTABLISH_BANDS = 3;     // >= 3 bands seen within the establishing shot
const P4B_COVIS_S = 1.5;          // both bands' signatures on screen together
const XF_MIN_S = 1.0, XF_MAX_S = 3.0, XF_SNAP_S = 0.4, XF_CRAWL_S = 4.0;

/* --- break-switches -------------------------------------------------------- */
const FEATHER = arg('--feather', 0);
const CRANE_RATE = arg('--crane-rate', CRANE_RATE_WU_S);
const CRANE_T = arg('--crane-seconds', CRANE_SECONDS);
const SPAN = arg('--span', SIGNATURE_SPAN_WU);
const ZOOM = arg('--zoom', 0);          // force a zoom for the traversal arm
if (FEATHER) setBandFeather(FEATHER);

const COLUMN_WU = GROUND_WU - CEILING_WU;

/**
 * The traversal, SAMPLED rather than solved. `world.traversalFraction` has a
 * closed form; sampling it at 1 wu over the whole column is the independent
 * check that the closed form is describing the same thing, and the two are
 * printed side by side so a divergence cannot hide.
 */
function traversalMeasured(view, zoom, minBands = 2) {
  let hit = 0, n = 0;
  for (let y = 0; y >= CEILING_WU; y -= 1) { n++; if (legibleCount(y, view, zoom) >= minBands) hit++; }
  return hit / n;
}

/** The crossfade extent, read off the same bandBlend the shader is fed (A7's method). */
function crossfades() {
  const out = [];
  for (let i = 0; i < BANDS.length - 1; i++) {
    const edge = BANDS[i].y1;
    const frac = (y) => {
      const b = bandBlend(y);
      if (b.band === BANDS[i].id) return b.mix === BANDS[i + 1].id ? b.t : 0;
      if (b.band === BANDS[i + 1].id) return b.mix === BANDS[i].id ? 1 - b.t : 1;
      return 1;
    };
    let lo = null, hi = null;
    const f = getBandFeather();
    for (let d = f * 2; d >= -f * 2; d -= 0.25) {
      const v = frac(edge + d);
      if (lo === null && v >= 0.02) lo = edge + d;
      if (v >= 0.98) { hi = edge + d; break; }
    }
    const wu = lo !== null && hi !== null ? Math.abs(lo - hi) : 0;
    out.push({ edge: `${BANDS[i].id}->${BANDS[i + 1].id}`, wu, secs: wu / BEST_CLIMB_WU_S });
  }
  return out;
}

/** Co-visibility of the two PLACED signature elements either side of a boundary. */
function signatureCovis(view, zoom, span) {
  const f = frameWu(view, zoom);
  return Math.max(0, f - span) / BEST_CLIMB_WU_S;
}

function report(mode, { quiet = false } = {}) {
  const view = makeView(mode);
  const P = view.profile;
  const zCombat = ZOOM || P.zoomCombat;
  const rows = [];
  const add = (id, what, pass, value, note) => { rows.push({ id, what, pass, value, note }); };

  if (!quiet) {
    console.log(`${mode.toUpperCase()}  ${view.w}x${view.h} css px — worldH ${P.worldH} wu, scale ${view.scale.toFixed(4)} px/wu`);
    console.log(`  frame at zoomCombat ${frameWu(view, P.zoomCombat).toFixed(0)} wu   at zoomWide ${frameWu(view, P.zoomWide).toFixed(0)} wu   at zoomEstablish ${frameWu(view, P.zoomEstablish).toFixed(0)} wu`);
    console.log(`  the ${BAND_LEGIBLE_PX} px legibility bar is ${(100 * legibleFrac(view)).toFixed(2)}% of the frame AT EVERY ZOOM (see world.js legibleFrac)`);
  }

  /* --- P4a: >= 2 bands legible for >= 55% of a full-column climb ----------- */
  const measured = traversalMeasured(view, zCombat, 2);
  const closed = traversalFraction(view, zCombat);
  const best = traversalFraction(view, P.zoomWide);      // the widest LEGAL framing
  /**
   * The ABSOLUTE ceiling, and it is the number that settles the criterion: set
   * the legibility bar to ZERO and two bands are still only co-visible while the
   * frame straddles a boundary at all. There are 5 interior boundaries and the
   * frame is `frameWu` tall, so nothing any renderer can do exceeds
   * `5 x frameWu / 10000`. It needs no assumption about the 90 px bar.
   */
  const ceilingFrac = (BANDS.length - 1) * frameWu(view, P.zoomCombat) / COLUMN_WU;
  add('P4a', '>= 2 bands legible over the climb', measured >= P4_TRAVERSAL_FRAC,
    `${(100 * measured).toFixed(1)}% of a ${COLUMN_WU} wu climb at zoom ${zCombat.toFixed(2)} (closed form ${(100 * closed).toFixed(1)}%), bar ${(100 * P4_TRAVERSAL_FRAC).toFixed(0)}%`,
    `at the clamp floor zoom ${P.zoomWide}: ${(100 * best).toFixed(1)}%. ABSOLUTE CEILING at combat framing with a ZERO px bar: ` +
    `${(100 * ceilingFrac).toFixed(1)}% = ${BANDS.length - 1} boundaries x ${frameWu(view, P.zoomCombat).toFixed(0)} wu / ${COLUMN_WU} wu. ` +
    `The ${(100 * P4_TRAVERSAL_FRAC).toFixed(0)}% bar is unsatisfiable by any renderer`);

  /**
   * P4e: the establishing crane.
   *
   * "≥ 3 bands seen within the establishing shot, each held ≥ 0.8 s" has two
   * readings and this takes the STRICTER one — the three LOWEST bands, by name.
   * The looser reading (any three) is satisfiable by craning faster and further:
   * at 900 wu/s over 4 s the shot sweeps 3,600 wu, drops Mud to 0.44 s, and
   * still counts Belt, Floor and Deck. A criterion a faster camera can always
   * satisfy is inert, which is the workaround-inside-a-gate shape D27 struck the
   * six-band version for. §3.3 constraint 2 names the three lowest bands
   * explicitly — "the three lowest must sum to ≤ 3,000 wu, so the establishing
   * crane crosses three bands in ≤ 4 s" — so they are what the shot establishes.
   */
  const ESTABLISH_BANDS = ['mud', 'belt', 'floor'];
  const holds = craneHolds(view, { rate: CRANE_RATE, seconds: CRANE_T });
  const held = ESTABLISH_BANDS.filter((id) => (holds.get(id) || 0) >= CRANE_HOLD_BAR_S);
  add('P4e', `the ${P4_ESTABLISH_BANDS} lowest bands each held >= ${CRANE_HOLD_BAR_S}s in the establishing shot`,
    held.length >= P4_ESTABLISH_BANDS,
    `${held.length}/${ESTABLISH_BANDS.length} at zoomEstablish ${P.zoomEstablish}, crane ${CRANE_RATE} wu/s for ${CRANE_T}s (${(CRANE_RATE * CRANE_T).toFixed(0)} wu): ` +
    [...holds.entries()].filter(([, s]) => s > 0).map(([k, s]) => `${k} ${s.toFixed(2)}s`).join('  '));

  /* --- P4b: a boundary reads as a transition ------------------------------ */
  const dwell = boundaryDwellS(view, zCombat);
  add('P4b1', `both bands' SKY signature co-visible >= ${P4B_COVIS_S}s`, dwell >= P4B_COVIS_S,
    `${dwell.toFixed(2)}s at zoom ${zCombat.toFixed(2)} — frame ${frameWu(view, zCombat).toFixed(0)} wu less 2 x ${legibleWu(view, zCombat).toFixed(1)} wu, at ${BEST_CLIMB_WU_S} wu/s`);

  const covis = signatureCovis(view, zCombat, SPAN);
  add('P4b2', `both bands' PLACED signature co-visible >= ${P4B_COVIS_S}s`, covis >= P4B_COVIS_S,
    `${covis.toFixed(2)}s at a ${SPAN} wu span — bound is frameWu - ${P4B_COVIS_S * BEST_CLIMB_WU_S} = ${(frameWu(view, zCombat) - P4B_COVIS_S * BEST_CLIMB_WU_S).toFixed(0)} wu`);

  const xf = crossfades();
  const secs = xf.map((x) => x.secs);
  add('P4b3', `the crossfade completes in ${XF_MIN_S}-${XF_MAX_S}s`,
    secs.every((s) => s >= XF_MIN_S && s <= XF_MAX_S),
    `${xf.map((x) => `${x.edge} ${x.secs.toFixed(2)}s`).join('  ')} (feather ${getBandFeather()} wu; snaps under ${XF_SNAP_S}s, crawls over ${XF_CRAWL_S}s)`);

  /* --- the placement rule, as data ---------------------------------------- */
  const sig = signatureAltitudes();
  const worstInside = Math.min(...sig.map((s) => {
    const b = BANDS.find((x) => x.id === s.band);
    return Math.min(Math.abs(s.y - b.y0), Math.abs(s.y - b.y1));
  }));
  add('P4b4', 'every placed signature sits inside its own band', worstInside > 0,
    `${sig.length} placements, tightest clearance to its own band edge ${worstInside.toFixed(0)} wu`);

  if (!quiet) {
    for (const r of rows) {
      console.log(`  ${(r.pass ? 'PASS' : 'FAIL').padEnd(6)}${r.id.padEnd(7)}${r.what}`);
      console.log(`        ${' '.repeat(7)}${r.value}`);
      if (r.note) console.log(`        ${' '.repeat(7)}-> ${r.note}`);
    }
    console.log('');
  }
  return rows;
}

/* --- cross-check: one definition of the climb rate -------------------------- */
if (SKY_CLIMB !== BEST_CLIMB_WU_S) {
  console.log(`FAIL  js/gfx/sky.js reports ${SKY_CLIMB} wu/s and js/core/bands.js ${BEST_CLIMB_WU_S}. ` +
    `They must be one definition — sky.js re-exports the band module's. Fix that before reading anything below.`);
  process.exit(1);
}

const MODES = argS('--mode', 'both') === 'both' ? ['landscape', 'portrait'] : [argS('--mode', 'both')];

if (!has('--falsify')) {
  console.log(`\nTHE ALTITUDE LADDER — P4 / P4b, ${BANDS.length} bands, ${COLUMN_WU} wu, best climb ${BEST_CLIMB_WU_S} wu/s, feather ${getBandFeather()} wu\n`);
  /**
   * P4a's FAIL is a REPORTED FINDING, not a build break: the 55% bar is
   * unsatisfiable by any renderer — see the ABSOLUTE CEILING line it prints, and
   * P9_NOTES REQUEST-3. Everything else is a real gate, so exit non-zero the
   * moment anything OTHER than P4a goes red. An instrument that always exits 0
   * is not a gate.
   */
  const other = [];
  let fails = 0;
  for (const m of MODES) for (const r of report(m)) {
    if (r.pass) continue;
    fails++;
    if (r.id !== 'P4a') other.push(`${m}/${r.id}`);
  }
  console.log(fails ? `${fails} criterion(s) FAIL — see docs/P9_NOTES.md §1${other.length ? '' : ' (P4a only: a reported finding, not a build break)'}\n` : 'every criterion PASSES\n');
  process.exit(other.length ? 1 : 0);
}

/**
 * Each control breaks ONE thing and the named criterion must go red. The last
 * two are positive controls in the other direction: a metric that only ever
 * reads low is not measuring anything, so the traversal fraction is also
 * required to RISE when the frame is made absurdly wide, by the amount the
 * closed form predicts.
 */
const { execFileSync } = await import('node:child_process');
const HERE = new URL(import.meta.url).pathname;
const runArm = (extra) => {
  // A broken arm exits 1 BY DESIGN, so a throw here is the expected path, not an
  // error — read stdout off the thrown result rather than letting it escape.
  let out;
  try { out = execFileSync(process.execPath, [HERE, ...extra], { encoding: 'utf8' }); }
  catch (e) { out = e.stdout || ''; }
  const bad = [];
  for (const line of out.split('\n')) {
    const m = line.match(/^\s{2}(PASS|FAIL)\s{2,}(P4\w*)\s/);
    if (m && m[1] === 'FAIL') bad.push(m[2]);
  }
  return { out, bad };
};

console.log('\nFALSIFICATION — break each thing, the named criterion must go RED\n');
const base = runArm(['--mode', 'landscape']);
console.log(`  baseline (landscape)            ${base.bad.length ? 'RED: ' + base.bad.join(', ') : 'GREEN'}   [P4a is a reported FAIL, see below]`);

const CONTROLS = [
  ['--feather 2',           'P4b3', 'a hard band edge — the crossfade snaps'],
  ['--feather 400',         'P4b3', 'a 400 wu feather — the crossfade crawls'],
  ['--crane-rate 900',      'P4e',  'a crane too fast to hold the thinnest band'],
  ['--crane-seconds 1.0',   'P4e',  'a crane too short to reach the third band'],
  ['--span 700',            'P4b2', 'signatures too far apart to be co-visible'],
];
let bad = 0;
for (const [flag, expect, why] of CONTROLS) {
  const r = runArm(['--mode', 'landscape', ...flag.split(' ')]);
  const caught = r.bad.includes(expect);
  if (!caught) bad++;
  console.log(`  ${flag.padEnd(24)}${caught ? 'RED as required' : 'STILL GREEN — the criterion does not test it'}  ${expect}  (${why}; failed: ${r.bad.join(', ') || 'nothing'})`);
}

/**
 * The sampled traversal against the closed form, at the zooms the CONTROLLER may
 * choose — which is exactly the domain world.js states for the closed form. Its
 * window must stay under the 700 wu smallest boundary gap or the windows merge;
 * at a cinematic 0.42 they still do, at an absurd 0.20 they do not, and there
 * the sampled figure is the true one. Reporting the divergence as a failure
 * would be the harness disagreeing with a domain it was told about.
 */
const view = makeView('landscape');
for (const z of [1.22, 1.00, 0.74, 0.42]) {
  const m = traversalMeasured(view, z), c = traversalFraction(view, z);
  const agrees = Math.abs(m - c) < 0.002;
  if (!agrees) bad++;
  console.log(`  traversal at zoom ${z.toFixed(2)}         sampled ${(100 * m).toFixed(1)}%  closed form ${(100 * c).toFixed(1)}%  ${agrees ? 'AGREE' : 'DIVERGE — one of them is wrong'}`);
}
{
  const z = 0.20, m = traversalMeasured(view, z), c = traversalFraction(view, z);
  console.log(`  traversal at zoom ${z.toFixed(2)}         sampled ${(100 * m).toFixed(1)}%  closed form ${(100 * c).toFixed(1)}%  OUTSIDE the closed form's domain (window ${(560 / z * (1 - 2 * 90 / 390)).toFixed(0)} wu > the 700 wu smallest gap) — sampled is the true one`);
}
const lo = traversalMeasured(view, 1.00), hi = traversalMeasured(view, 0.20);
const moves = hi > lo * 2;
if (!moves) bad++;
console.log(`  the traversal metric responds   ${(100 * lo).toFixed(1)}% at zoom 1.00 -> ${(100 * hi).toFixed(1)}% at zoom 0.20  ${moves ? 'MOVES' : 'INERT — it cannot discriminate'}`);

console.log(bad ? `\nFAIL — ${bad} problem(s)\n` : '\nPASS — every criterion is genuinely under test\n');
process.exit(bad ? 1 : 0);
