#!/usr/bin/env node
/**
 * P9 gate W5 — ONE wind evaluator, and the proof that the move to
 * `js/sim/world.js` changed nothing.
 *
 * The brief's reason for W5 is worth restating because it shapes every check
 * here: *"the same evaluator serves the crate solver and the AI's wind
 * estimator, because two implementations will diverge and the divergence will
 * look like an AI bug."* So "the same" has to mean **the same function object**,
 * not the same arithmetic written twice — an equality of values is exactly what
 * two implementations have until the day they do not.
 *
 *   node tools/worldgate.mjs            the table
 *   node tools/worldgate.mjs --falsify  break each thing, require RED
 *
 * Every run prints its own seed, sample size and the profiles it sampled. A
 * harness that reports what it actually did is worth more than one that is
 * merely correct — see P9_NOTES §0c for what that rule cost to learn.
 */

import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createRNG } from '../js/core/rng.js';
import { CEILING_M, WIND_MAX_MS, createConditions, windAt, windAtNearest, windProfileErrors,
         signatureAltitudes, SIGNATURE_SPAN_WU } from '../js/sim/world.js';
import { windAt as crateWindAt, createCrateField } from '../js/sim/crates.js';
import { createWorld } from '../js/sim/entities.js';
import { RUN_STATS, validateLevel } from '../js/data/validate.js';
import { createLevel, serializeLevel, levelBytes, sizeReport, windTableFrom,
         LEVEL_V, LEVEL_MAX_BYTES, ENEMY_CODE, CODES_WITHOUT_TYPE, typeForCode, codeForType,
         LEVEL_DEFAULTS } from '../js/data/level.js';
import { createSpawner, SPAWN_LEAD_WU, FRAME_REACH_WU } from '../js/sim/spawner.js';
import { createTerrain, terrainProfileErrors, slopeBound, minWavelength,
         TERRAIN_PROFILES, MAX_SLOPE, MAX_TERRAIN_WU, visibleGroundTargets,
         GROUND_TARGET_SPACING_WU } from '../js/sim/terrain.js';
import { GUN_WU } from '../js/sim/weapons.js';
import { createAct, validateAct, parseLevelId, levelId, levelOrdinal,
         LEVELS_PER_ACT, LEVELS_TOTAL, ACTS } from '../js/data/act.js';
import { CARD_MAX_CHARS } from '../js/core/content.js';
import { AIRFRAMES } from '../js/data/tables.js';
import { ENEMY_BY_ID as ROSTER } from '../js/sim/entities.js';
import { check as genCheck, levels as genLevels, acts as genActs } from './genlevels.mjs';
import { BANDS as BANDS_FOR_TEST, CRUISE_WU_S } from '../js/core/bands.js';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const has = (k) => argv.includes(k);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };

const SEED = Number(arg('--seed', 11));
const N = Number(arg('--n', 10000));
const BUG = arg('--bug', '');

/**
 * `windAt` EXACTLY as it stood in `js/sim/crates.js` before P9 moved it.
 *
 * This is a frozen reference copy and it is deliberately a second
 * implementation — that is the whole point. It exists to prove the MOVE was a
 * no-op over the whole sampled domain, which is a migration question, not an
 * ongoing definition. Nothing in `js/` imports it and nothing should; W1's
 * structural check below is what keeps the shipped side down to one.
 */
function windAtPreMove(profile, altM) {
  const p = profile;
  if (!p || p.length === 0) return 0;
  if (altM <= p[0][0]) return p[0][1];
  for (let i = 1; i < p.length; i++) {
    if (altM <= p[i][0]) {
      const a = p[i - 1], b = p[i];
      const t = (altM - a[0]) / Math.max(1e-6, b[0] - a[0]);
      return a[1] + (b[1] - a[1]) * t;
    }
  }
  return p[p.length - 1][1];
}

/* --- the sampled domain, printed so a later run can reproduce it ----------- */
function profiles(rng) {
  const out = [
    { name: 'calm', p: [[0, 0], [CEILING_M, 0]] },
    { name: 'steady', p: [[0, 4], [CEILING_M, 4]] },
    { name: 'shear (DESIGN §4.6.1)', p: [[0, -6], [400, 0], [900, 9], [CEILING_M, 12]] },
    { name: 'knot-dense', p: [[0, 1], [50, -3], [120, 7], [800, -2], [1499, 5], [CEILING_M, 0]] },
  ];
  for (let i = 0; i < 4; i++) {
    const n = 2 + Math.floor(rng.next() * 5);
    const p = [];
    let alt = 0;
    for (let k = 0; k < n; k++) {
      p.push([alt, (rng.next() * 2 - 1) * WIND_MAX_MS]);
      alt += (CEILING_M - alt) * (0.15 + rng.next() * 0.5);
    }
    p.push([CEILING_M, (rng.next() * 2 - 1) * WIND_MAX_MS]);
    out.push({ name: `seeded#${i}`, p });
  }
  return out;
}

const rows = [];
const add = (id, what, pass, value, note) => { rows.push({ id, what, pass, value, note }); };

const rng = createRNG(SEED);
const PROF = profiles(rng);

/* --- W5a: the shipped side has ONE definition, by identity ---------------- */
add('W5a', 'crates.js and world.js are the SAME function object',
  crateWindAt === windAt,
  crateWindAt === windAt
    ? 'crates.js re-exports world.js — `crates.windAt === world.windAt`'
    : 'they are two different functions; equal values today prove nothing about tomorrow');

/* --- W5b: no second definition anywhere in js/ ---------------------------- */
const SCAN = ['js/sim/crates.js', 'js/sim/ai.js', 'js/sim/world.js', 'js/sim/entities.js'];
const defs = [];
for (const f of SCAN) {
  const src = readFileSync(join(ROOT, f), 'utf8');
  // a definition, not a call: `function windAt` / `const windAt =` / `windAt(profile` inside a new fn
  const m = src.match(/(?:export\s+)?function\s+windAt\b|(?:const|let)\s+windAt\s*=/g) || [];
  if (m.length) defs.push(`${f} x${m.length}`);
}
add('W5b', 'exactly one definition of windAt in js/sim/',
  defs.length === 1 && defs[0].startsWith('js/sim/world.js'),
  defs.length ? defs.join(', ') : 'none found — the scan is looking in the wrong place',
  `scanned ${SCAN.join(', ')}`);

/* --- W5c: the move changed nothing, over N sampled (profile, alt) pairs ---- */
let worst = 0, worstAt = '';
let n = 0;
for (const { name, p } of PROF) {
  for (let i = 0; i < Math.ceil(N / PROF.length); i++) {
    // sample ON the knots as well as between them: a nearest-vs-linear defect
    // agrees exactly at every knot, so a sampler that only hits knots is blind
    const altM = i % 7 === 0 ? p[i % p.length][0] : rng.next() * CEILING_M * 1.05 - CEILING_M * 0.02;
    const a = windAt(p, altM), b = windAtPreMove(p, altM);
    const d = Math.abs(a - b);
    n++;
    if (d > worst) { worst = d; worstAt = `${name} @ ${altM.toFixed(2)} m: ${a} vs ${b}`; }
  }
}
add('W5c', 'the move is a no-op against the pre-move implementation',
  worst === 0,
  `${n} sampled (profile, alt) pairs over ${PROF.length} profiles, worst |delta| ${worst}`,
  worst ? worstAt : `seed ${SEED}; profiles ${PROF.map((x) => x.name).join(', ')}`);

/* --- W5d: the SOLVER really reads the evaluator ---------------------------- */
/**
 * The structural checks above cannot see a solver that ignores the profile
 * altogether. This drives the shipped `field.predict` — which is the crate
 * solver AND, through `field.rendezvous`, the AI's estimator — on a strong
 * shear and requires the predicted impact point to MOVE when the evaluator does.
 * `?bug=second-wind` swaps in `windAtNearest` for the solver only.
 */
function predictedImpact(bug, prof) {
  const ctx = { rng: createRNG(3), bug };
  const world = createWorld(ctx, {});
  const field = createCrateField(world, { wind: prof, groundFire: false, gustPhase: 0, gustSeed: 5 });
  const c = field.drop({ xM: 0, yM: -1450 });
  const out = { x: 0, y: 0, t: 0 };
  field.predict(c, 120, 0, out);
  return out.x;
}
/**
 * Swept over every profile, not just one, and the WORST is the verdict. A
 * nearest-vs-linear defect agrees at every knot and its errors partly cancel
 * over a 90 s fall, so on a gentle profile it can move the impact point by less
 * than a metre — which is exactly the quiet divergence W5 exists to forbid and
 * exactly what a single-profile control would miss.
 */
const deltas = PROF.map(({ name, p }) => ({
  name, shipped: predictedImpact('', p), bugged: predictedImpact('second-wind', p),
})).map((d) => ({ ...d, delta: Math.abs(d.shipped - d.bugged) }));
const wD = deltas.reduce((a, b) => (b.delta > a.delta ? b : a));
const shipped = wD.shipped, bugged = wD.bugged;
add('W5d', 'the solver reads the evaluator (a second one moves it)',
  wD.delta > 1,
  `worst over ${deltas.length} profiles: '${wD.name}' predicted impact x ${shipped.toFixed(2)} m shipped vs ${bugged.toFixed(2)} m ` +
  `under ?bug=second-wind, delta ${wD.delta.toFixed(2)} m`,
  `per profile: ${deltas.map((d) => `${d.name} ${d.delta.toFixed(2)}m`).join(', ')} ` +
  `— the smallest is the point: a second evaluator is QUIET, not loud`);

/* --- W5e: the AI has no wind arithmetic of its own ------------------------ */
const aiSrc = readFileSync(join(ROOT, 'js/sim/ai.js'), 'utf8');
const aiWind = (aiSrc.match(/\bwindAt\s*\(|\bwind\s*\[/g) || []);
const aiUsesField = /fld\.(rendezvous|predict)\s*\(/.test(aiSrc);
add('W5e', 'the AI estimator is the crate solver, not a copy',
  aiWind.length === 0 && aiUsesField,
  `js/sim/ai.js: ${aiWind.length} direct wind evaluation(s), reaches the solver via fld.rendezvous/predict: ${aiUsesField}`,
  'the AI carries only `windErr`, its own standing misjudgement (DESIGN §4.5) — added to the solver\'s answer, never a second answer');

/* --- W6/W1 groundwork: the wind table validator --------------------------- */
const BAD = [
  ['single point', [[0, 3]]],
  ['unsorted', [[0, 1], [900, 2], [400, 3]]],
  ['below ground', [[-10, 1], [900, 2]]],
  ['above the ceiling', [[0, 1], [CEILING_M + 1, 2]]],
  ['over the speed limit', [[0, 1], [900, WIND_MAX_MS + 0.1]]],
  ['not a pair', [[0, 1], [900]]],
];
const caught = BAD.filter(([, p]) => windProfileErrors(p).length > 0);
add('W5f', 'a malformed wind table fails loudly, by name',
  caught.length === BAD.length && windProfileErrors(PROF[2].p).length === 0,
  `${caught.length}/${BAD.length} rejected: ${BAD.map(([n2, p]) => `${n2} -> ${windProfileErrors(p).length ? 'named' : 'ACCEPTED'}`).join(', ')}`,
  `a legal shear profile passes clean: ${windProfileErrors(PROF[2].p).length} error(s)`);

/* --- the conditions object ------------------------------------------------ */
const okCond = createConditions({ wind: PROF[2].p, visibility: 0.7, timeOfDay: 'dusk' });
const badCond = createConditions({ wind: PROF[2].p, visibility: 0, timeOfDay: 'midnight' });
add('W5g', 'createConditions validates visibility and time of day',
  okCond.errors.length === 0 && badCond.errors.length === 2,
  `legal -> ${okCond.errors.length} error(s); visibility 0 + timeOfDay "midnight" -> ${badCond.errors.length}: ${badCond.errors.join(' | ')}`);

/* ======================================================== W1 — the validator */
/**
 * W1 as the brief words it: *"a level with a beat above `ceiling`, a 45-char
 * radio line, and a 600 wu band each fail the load with a named error."* Plus
 * the two P9 added: an expression-string star, and the signature spacing rule
 * D126 forced (P9_NOTES §1).
 */
const GOOD = {
  id: 'a1-01',
  wind: PROF[2].p,
  beats: [{ at: 0, y: -900, kind: 'spawn' }],
  spawns: [{ y: -1200, type: 'scout' }],
  objectives: [{ y: -400, kind: 'crate' }],
  script: [{ id: 'l1', kind: 'radio', text: 'Belt is thick today. Keep your speed up.' }],
  stars: [{ stat: 'time', op: '<=', value: 120 }, { stat: 'cratesCaught', op: '>=', value: 2 }],
  signatures: signatureAltitudes().map((a) => ({ band: a.band, y: a.y, kind: 'landmark' })),
};
const mutate = (f) => { const l = JSON.parse(JSON.stringify(GOOD)); f(l); return l; };
const W1 = [
  ['a beat above the ceiling (D28)', mutate((l) => { l.beats[0].y = -10001; }), 'beats[0].y'],
  ['a 45-char radio line', mutate((l) => { l.script[0].kind = 'radio'; l.script[0].text = 'x'.repeat(45); }), 'script[l1]'],
  ['a 600 wu band (§3.3 constraint 1)', mutate((l) => {
    l.bands = [{ id: 'mud', y0: 0, y1: -600 }, { id: 'belt', y0: -600, y1: -1700 },
               { id: 'floor', y0: -1700, y1: -3000 }, { id: 'deck', y0: -3000, y1: -5000 },
               { id: 'lane', y0: -5000, y1: -7500 }, { id: 'blue', y0: -7500, y1: -10000, m1: 1500 }];
  }), 'bands'],
  ['a star as an expression string', mutate((l) => { l.stars[0] = 'time < 120'; }), 'stars[0]'],
  ['a star on a stat the sim does not report', mutate((l) => { l.stars[0] = { stat: 'style', op: '>=', value: 1 }; }), 'stars[0].stat'],
  ['one central signature per band, not one per boundary', mutate((l) => {
    l.signatures = BANDS_FOR_TEST.map((b) => ({ band: b.id, y: (b.y0 + b.y1) / 2, kind: 'landmark' }));
  }), 'signatures'],
  ['an unsorted wind table', mutate((l) => { l.wind = [[0, 1], [900, 2], [400, 3]]; }), 'wind'],
  ['a terrain ridge steeper than the aeroplane can climb', mutate((l) => {
    l.terrain = { profile: 'ridge', amp: 420, wavelength: 400, detail: 0.5 };
  }), 'terrain'],
];
const w1res = W1.map(([name, lvl, wantPath]) => {
  const { ok, errors } = validateLevel(lvl);
  const named = errors.some((e) => e.path === wantPath);
  return { name, ok, named, wantPath, got: errors.map((e) => e.path).join(',') };
});
const goodRes = validateLevel(GOOD);
add('W1', 'a malformed level fails the load with a NAMED error',
  w1res.every((r) => !r.ok && r.named) && goodRes.ok,
  `${w1res.filter((r) => !r.ok && r.named).length}/${w1res.length} rejected by name; a legal level passes clean (${goodRes.errors.length} error(s))`,
  w1res.map((r) => `${r.name} -> ${!r.ok && r.named ? `named ${r.wantPath}` : `MISSED (got ${r.got || 'nothing'})`}`).join(' | '));

/* --- W1b: RUN_STATS really is the sim's summary --------------------------- */
/**
 * The star `stat` names must come from the sim's run summary, or a renamed stat
 * turns every star that used it into a silent never-awarded. Diffed against a
 * REAL summary produced by `tools/sim.mjs`, not against a list typed twice.
 */
// No flag: sim.mjs's default path runs a synthetic mission and prints the §8.1
// run summary. Deterministic (seed 7) and ~60 ms, so this is a REAL summary and
// not a list of keys typed a second time.
const summary = JSON.parse(execFileSync(process.execPath, [join(ROOT, 'tools/sim.mjs')], { encoding: 'utf8' }));
const simStats = Object.entries(summary).flatMap(([k, v]) =>
  (v && typeof v === 'object' && !Array.isArray(v)) ? Object.keys(v).map((k2) => `${k}.${k2}`) : [k]);
const missing = RUN_STATS.filter((s) => !simStats.includes(s));
const NOT_STATS = new Set(['level', 'seed', 'pilot', 'abort']);   // identity + failure reason, not scoreable
const extra = simStats.filter((s) => !RUN_STATS.includes(s) && !NOT_STATS.has(s));
add('W1b', 'every star stat exists in the sim run summary',
  missing.length === 0 && extra.length === 0,
  `${RUN_STATS.length} declared, ${simStats.length} in the summary; ${missing.length} missing, ${extra.length} unclaimed`,
  missing.length || extra.length
    ? `missing from the sim: ${missing.join(', ') || 'none'}; in the sim but not scoreable: ${extra.join(', ') || 'none'}`
    : `identity/abort fields deliberately excluded: ${[...NOT_STATS].join(', ')}`);

/* --- W1c: the radio cap has ONE definition -------------------------------- */
/**
 * REQUEST-8, landed. `js/core/content.js` owns the number; `js/ui/layout.js`
 * puts it in `METRICS` and `js/data/validate.js` reads it directly, so the
 * validator refuses exactly the line the renderer refuses to draw. Asserted by
 * value AND by a source scan for a re-introduced literal, because "one
 * definition" is a claim that decays the moment someone types 44 again.
 */
const { METRICS } = await import('../js/ui/layout.js');
const layoutSrc = readFileSync(join(ROOT, 'js/ui/layout.js'), 'utf8');
const literal = /CARD_MAX_CHARS\s*:\s*\d+/.test(layoutSrc);
add('W1c', 'the radio cap has one definition, in js/core/',
  METRICS.CARD_MAX_CHARS === CARD_MAX_CHARS && !literal,
  `js/core/content.js ${CARD_MAX_CHARS}, js/ui/layout.js METRICS ${METRICS.CARD_MAX_CHARS}` +
  `${literal ? ' — but layout.js has re-introduced a LITERAL' : ' (shorthand, no literal)'}`,
  'js/data/validate.js imports js/core/content.js directly — js/data no longer reaches into js/ui');

/* ================================================== W6/W7/WA — the format */
/**
 * The level format, ARCHITECTURE §7.1 and §7.2. `js/data/level.js` was written
 * to satisfy `js/data/validate.js` rather than the other way round, so the first
 * thing asked of it is whether its own output validates — including D126's
 * signature rule, which it must satisfy BY CONSTRUCTION when the author says
 * nothing about signatures at all.
 *
 * The authored document is §7.1's example, verbatim apart from the three places
 * where §7.1 and the shipped constants disagree (see js/data/level.js's header,
 * REQUEST-10). Using the document's own example is the point: a format gate
 * written against a fixture the gate author invented tests the fixture.
 */
const AUTHORED = {
  v: 1, id: 'a1-04', act: 1, index: 4, name: 'Wire and Wind', seed: 'a1-04', length: 42000,
  terrain: { profile: 'trenchline', amp: 90, wavelength: 2600, detail: 0.6 },
  weather: { wind: { x: -40, y: 0 }, gust: 26, visibility: 0.85, timeOfDay: 'dawn' },
  player: { start: { x: 600, y: -1200 }, airframe: 'kitehawk-i', fuel: 1.0, ammo: 500 },
  beats: [
    { x: 2400, spawn: 'scout', n: 2, band: 'belt', from: 'ahead' },
    { x: 6800, spawn: 'aaNest', n: 3, band: 'mud', spacing: 420 },
    { x: 9000, crate: { kind: 'ammo', y: -9600, drift: -30, owner: 'neutral' } },
    { x: 14000, spawn: 'balloon', n: 1, band: 'belt', hp: 3 },
    { x: 21000, event: 'cloudbank', len: 3400 },
    { x: 30000, spawn: 'hunter', n: 3, band: 'deck', from: 'above', wave: true },
    { x: 39000, boss: 'zeppelin-l30', band: 'lane' },
  ],
  objectives: [
    { type: 'reach', x: 42000 },
    { type: 'collect', what: 'crate', n: 4 },
    { type: 'survive', maxDeaths: 0 },
  ],
  stars: [
    { id: 'clean', desc: 'Not a scratch', stat: 'damageTaken', op: '==', value: 0 },
    { id: 'greedy', desc: 'Every crate recovered', stat: 'cratesMissed', op: '==', value: 0 },
    { id: 'quick', desc: 'Under 3:20', stat: 'time', op: '<=', value: 200 },
  ],
  reward: { crates: 3, scrip: 120 },
  music: 'patrol', ambience: 'front-line',
};
/**
 * §7.1's example names FOUR enemies the shipped roster does not have — `scout`,
 * `aaNest`, `balloon`, `hunter` against `js/sim/entities.js`'s kestrel, wasp,
 * shrike, drover, ox, marlin, nightjar, anvil. DESIGN §8.3's codebook is single
 * letters over §5.1's codes, so nothing maps the two vocabularies today and
 * `tools/genlevels.mjs` (item 7) is where that has to happen. W1f below states
 * it as a criterion; W1d measures the loader against a roster-mapped copy, so
 * the two questions do not hide inside one another.
 */
const ROSTER_MAP = { scout: 'kestrel', hunter: 'shrike', balloon: 'ox', aaNest: 'drover' };
/**
 * §7.1's example has a FOURTH defect that D146 did not list, and it is the same
 * shape as the other three: `player.airframe: "kitehawk-i"` is not an id
 * `js/data/tables.js` builds, and `playerType()` falls back to the reference
 * SILENTLY. So the corrected copy fixes the airframe as well as the roster;
 * W1g below states it as its own criterion so the two do not hide inside one
 * another, exactly as W1f and W1d are kept apart.
 */
const mapRoster = (lvl) => ({ ...lvl,
  player: { ...lvl.player, airframe: AIRFRAMES[0].id },
  beats: lvl.beats.map((b) => (b.spawn && ROSTER_MAP[b.spawn] ? { ...b, spawn: ROSTER_MAP[b.spawn] } : b)) });
const LOADED = createLevel(mapRoster(AUTHORED));
const loadedRes = validateLevel(LOADED);
const verbatim = validateLevel(createLevel(AUTHORED));
const verbatimNames = verbatim.errors.filter((e) => /^beats\[\d+\]\.spawn$/.test(e.path));
add('W1f', '§7.1\'s example names enemies the sim does not have, and it is caught',
  !verbatim.ok && verbatimNames.length === 4,
  `§7.1 verbatim -> ${verbatimNames.length} named errors: ` +
  `${verbatimNames.map((e) => e.path).join(', ')} (scout, aaNest, balloon, hunter)`,
  `the shipped roster is kestrel, wasp, shrike, drover, ox, marlin, nightjar, anvil; DESIGN §8.3's ` +
  `codebook is single letters over §5.1's codes, so NOTHING maps the two vocabularies today. ` +
  `tools/genlevels.mjs (item 7) is where it has to happen, and a typo'd enemy id is the ` +
  `never-firing beat again: the beat fires, no type is found, the wave silently does not happen`);

add('W1d', 'the loader\'s own output validates clean',
  loadedRes.ok,
  `§7.1's example level, roster-mapped -> ${loadedRes.errors.length} error(s); ${LOADED.signatures.length} signatures ` +
  `filled by construction from signatureAltitudes(), ${LOADED.beats.length} beats, wind ` +
  `${JSON.stringify(LOADED.wind)} m/s from an authored ${AUTHORED.weather.wind.x} wu/s`,
  loadedRes.errors.map((e) => `${e.path}: ${e.why}`).join(' | ')
  || `authored -40 wu/s x ${(0.15).toFixed(2)} m/wu = ${LOADED.wind[0][1]} m/s, inside the 25 m/s limit; ` +
     `read as SI it would be 40 and REJECTED by this project's own validator, which is what settles the unit`);

/* --- W1e: an out-of-order beat is refused by name -------------------------- */
const MAPPED = mapRoster(AUTHORED);
const outOfOrder = { ...MAPPED, beats: [MAPPED.beats[1], MAPPED.beats[0]] };
const oooRes = validateLevel(outOfOrder);
const oooNamed = oooRes.errors.some((e) => e.path === 'beats[1].x');
const farBeat = validateLevel({ ...MAPPED, beats: [{ x: 99000, spawn: 'kestrel' }] });
add('W1e', 'a beat that would never fire is refused by name',
  !oooRes.ok && oooNamed && !farBeat.ok,
  `out-of-order -> ${oooRes.errors.map((e) => e.path).join(',') || 'nothing'}; ` +
  `a beat at 99000 in a 42000 wu level -> ${farBeat.errors.map((e) => e.path).join(',') || 'nothing'}`,
  'the spawner walks ONE forward cursor (W8), so a beat behind it never fires at all');

/* --- W6a: byte-identical LOADER round trip --------------------------------- */
/**
 * NOT the brief's W6, and named W6a so it cannot be mistaken for it: W6 is
 * "genlevels.mjs regenerates the four worked levels byte-identically FROM THE
 * DESIGN §8 TABLE", which is item 7 and is still open. This is the half W6
 * stands on — that the format itself loses nothing across a load/save — and it
 * has to hold before a generator round trip can mean anything.
 *
 * The serializer emits the AUTHORED form — only what
 * differs from the derived default — so the round trip proves two things at
 * once: that nothing is lost, and that the file is still the small readable
 * thing §7.1 promises rather than a dump of the fully-defaulted object, which
 * would round-trip just as well and mean nothing.
 */
const ser1 = serializeLevel(LOADED);
const ser2 = serializeLevel(createLevel(JSON.parse(ser1)));
const deepSame = JSON.stringify(LOADED) === JSON.stringify(createLevel(JSON.parse(ser1)));
add('W6a', 'a level survives a serialise/load round trip byte-identically',
  ser1 === ser2 && deepSame,
  `${ser1.length} bytes -> load -> ${ser2.length} bytes, identical: ${ser1 === ser2}; ` +
  `the loaded objects are deep-equal: ${deepSame}`,
  `the emitted document omits every field equal to its derived default, so the ` +
  `${LOADED.signatures.length} signatures and the six band defaults cost 0 bytes on disk`);

/* --- W7: the 6 KB cap ------------------------------------------------------ */
/**
 * W7 caps a level file at 6 KB, and the cap is the format's enforcement
 * mechanism, not a storage worry: bands and beats fit in 6 KB and a coordinate
 * dump does not. Measured on §7.1's example AND on a deliberately busy level —
 * a cap only one sparse fixture has ever been measured against is a cap nobody
 * has tested.
 */
const BUSY_SPAWNS = 4, BUSY_CRATES = 12, BUSY_EVENTS = 4, BUSY_LINES = 6;
const busyBeats = [
  ...Array.from({ length: BUSY_SPAWNS }, (_, i) => ({ x: 2000 + i * 3000, spawn: 'shrike', n: 3, band: 'deck', from: 'above' })),
  ...Array.from({ length: BUSY_CRATES }, (_, i) => ({ x: 3000 + i * 3000, crate: { kind: 'ammo', y: -9600, drift: -30, owner: 'neutral' } })),
  ...Array.from({ length: BUSY_EVENTS }, (_, i) => ({ x: 5000 + i * 8000, event: 'cloudbank', len: 3400 })),
  ...Array.from({ length: BUSY_LINES }, (_, i) => ({ x: 1000 + i * 6000, line: `a5-20.l${i}` })),
  { x: 41000, boss: 'zeppelin-l30', band: 'lane' },
].sort((a, b) => a.x - b.x);
const busy = createLevel({ ...MAPPED, id: 'a5-20', beats: busyBeats });
const dump = createLevel({
  ...MAPPED, id: 'a5-20',
  beats: Array.from({ length: 900 }, (_, i) => ({ x: i * 46, spawn: 'kestrel', n: 1, band: 'belt', from: 'ahead' })),
});
const sz = sizeReport(LOADED), szBusy = sizeReport(busy), szDump = sizeReport(dump);
add('W7', 'a level file stays under the 6 KB cap',
  sz.ok && szBusy.ok && !szDump.ok,
  `measured on the FORMAT; the four worked levels are item 7's to re-run. §7.1's example ${sz.bytes} B; the DENSEST level DESIGN actually specifies — ${BUSY_SPAWNS} enemy ` +
  `groups (its own maximum, level 98; mean 1.5, p90 3), ${BUSY_CRATES} crates (its own maximum, ` +
  `level 90; p90 8), ${BUSY_EVENTS} events, ${BUSY_LINES} radio cues and a boss = ${busyBeats.length} ` +
  `beats — is ${szBusy.bytes} B against a ${LEVEL_MAX_BYTES} B cap ` +
  `(${(100 * szBusy.bytes / LEVEL_MAX_BYTES).toFixed(0)}% of it)`,
  `and the cap BITES: a 900-beat coordinate dump is ${szDump.bytes} B, ` +
  `${(szDump.bytes / LEVEL_MAX_BYTES).toFixed(1)}x over — which is what the cap is for (§7.1)`);

/* --- WA: the act format ---------------------------------------------------- */
const act1 = createAct({ id: 'act1', name: 'The Kite Line',
  unlocks: { airframes: ['kitehawk-i'], upgrades: ['engine.1', 'guns.1', 'fuel.1'] },
  gate: { starsRequired: 0 }, palette: 'dawn-ochre', ace: 'von-marbach' });
const actRes = validateAct(act1, { ...Object.fromEntries(act1.levels.map((id) => {
  const p = parseLevelId(id);
  return [id, createLevel({ id, act: p.act, index: p.index })];
})) });
const wrongAct = validateAct(act1, { ...Object.fromEntries(act1.levels.map((id, i) => {
  const p = parseLevelId(id);
  return [id, createLevel({ id, act: i === 3 ? 2 : p.act, index: p.index })];
})) });
const shortAct = validateAct(createAct({ id: 'act2', act: 2, levels: ['a2-01', 'a2-02'] }));
add('WA', 'an act is 20 levels and the level agrees with the act that lists it',
  actRes.ok && !wrongAct.ok && !shortAct.ok && act1.levels.length === LEVELS_PER_ACT,
  `${LEVELS_TOTAL} levels / ${ACTS} acts = ${LEVELS_PER_ACT}, derived; act1 lists ` +
  `${act1.levels[0]}..${act1.levels[act1.levels.length - 1]} and validates clean`,
  `a level whose own act field says 2 -> ${wrongAct.errors.map((e) => e.path).join(',')}; ` +
  `a 2-level act -> ${shortAct.errors.map((e) => e.path).join(',')}; ` +
  `levelOrdinal('a3-05') = ${levelOrdinal('a3-05')} of ${LEVELS_TOTAL}, so P11 has one x-axis`);

/* ============================================= W3a/W8 — the spawner (item 5) */
/**
 * `js/sim/spawner.js` in two halves.
 *
 * The CURSOR half is a unit test against a stub world, because the property —
 * "a beat fires exactly once, and a camera that doubles back fires nothing" —
 * is about the cursor and nothing else, and the aeroplane in the full rig
 * spends a third of its ticks flying backwards, which would make a real
 * regression look like ordinary noise.
 *
 * The POOL half (W8) is measured in the full sim, because W8 is a claim about
 * the entity pool and the pool only exists there. It shells out to
 * `tools/sim.mjs --spawner`, which owns world construction — a gate that builds
 * its own world measures a second implementation of the game.
 */
const stubWorld = () => {
  const seatCount = { n: 0 };
  return {
    ctx: { rng: createRNG(7) },
    alloc: { aircraft: 0 },
    spawn: () => { seatCount.n++; return { hp: { structure: 0 }, hpMax: { structure: 0 }, type: { id: 'x' }, flight: { sx: 0, sy: 0 } }; },
    seatCount,
  };
};
const cursorLevel = createLevel({ id: 'a1-01', length: 42000,
  beats: [{ x: 1000, event: 'a' }, { x: 2000, event: 'b' }, { x: 3000, event: 'c' }] });
const cw = stubWorld();
const seen = [];
const sp = createSpawner(cw, cursorLevel, { onBeat: (b) => seen.push(b.event) });
const walk = [0, 1200, 900, 500, 1200, 2100, 1500, 3500, 2000];
const perStep = walk.map((x) => sp.update(x));
add('W3a', 'a beat fires exactly once, and a camera that doubles back fires nothing',
  seen.join('') === 'abc' && seen.length === 3,
  `camera walk ${walk.join(' -> ')} wu fired [${seen.join(',')}] (${perStep.join('')} per step)`,
  `the cursor advances against the FURTHEST x the camera has reached, not the current one — ` +
  `4 of those 9 steps are retreats and 2 re-cover ground already covered`);

/* --- W8: 300 s of the busiest level, in the full sim ---------------------- */
const busyLevelFile = join(ROOT, 'tools/.w8-busy.json');
const stressLevelFile = join(ROOT, 'tools/.w8-stress.json');
const w8Level = {
  id: 'a5-20', act: 5, index: 20, length: 42000,
  beats: [
    ...Array.from({ length: BUSY_SPAWNS }, (_, i) => ({ x: 2000 + i * 2000, spawn: 'shrike', n: 3, band: 'deck', from: 'above' })),
    ...Array.from({ length: BUSY_CRATES }, (_, i) => ({ x: 1500 + i * 800, crate: { kind: 'ammo', y: -9600 } })),
    { x: 5000, event: 'cloudbank', len: 3400 },
  ].sort((a, b) => a.x - b.x),
};
const w8Stress = {
  id: 'a5-20', act: 5, index: 20, length: 42000,
  beats: Array.from({ length: 8 }, (_, i) => ({ x: 2000 + i * 60, spawn: 'shrike', n: 3, band: 'deck', from: 'ahead' })),
};
writeFileSync(busyLevelFile, JSON.stringify(w8Level));
writeFileSync(stressLevelFile, JSON.stringify(w8Stress));
const runSpawner = (file, secs, seed) => JSON.parse(execFileSync(process.execPath,
  [join(ROOT, 'tools/sim.mjs'), '--spawner', '--levelfile', file, '--secs', String(secs), '--seed', String(seed)],
  { encoding: 'utf8' }));
const w8 = runSpawner(busyLevelFile, 300, 5);
const w8again = runSpawner(busyLevelFile, 300, 5);
const w8other = runSpawner(busyLevelFile, 300, 9);
const w8stress = runSpawner(stressLevelFile, 300, 5);
rmSync(busyLevelFile, { force: true }); rmSync(stressLevelFile, { force: true });
add('W8', '300 s of the busiest level allocates nothing and drops no spawn',
  !w8.allocGrew && w8.poolMisses === 0 && w8.unknownTypes === 0 && w8.fired > 0 && w8.retreatTicks > 0,
  `${w8.fired}/${w8.beats} beats fired over ${w8.secs} s, camera reached ${w8.camWu} wu; ` +
  `pool ${JSON.stringify(w8.allocBefore)} -> ${JSON.stringify(w8.allocAfter)}, grew: ${w8.allocGrew}; ` +
  `${w8.poolMisses} dropped spawns, peak ${w8.maxLiveReds} hostiles alive`,
  `the camera retreated on ${w8.retreatTicks} of ${Math.round(w8.secs * 60)} ticks — the aeroplane ` +
  `really does double back, so the monotone cursor is under load rather than merely present. ` +
  `Spawn lead ${w8.spawnLeadWu} wu = ${FRAME_REACH_WU} (frame reach, D121) + ${GUN_WU.rangeEff} (gun range)`);

add('W3b', 'the same seed gives the same spawn log, a different seed does not',
  w8.logHash === w8again.logHash && w8.logHash !== w8other.logHash && w8.logLines > 0,
  `seed 5 twice -> ${w8.logHash} == ${w8again.logHash} over ${w8.logLines} spawn events; ` +
  `seed 9 -> ${w8other.logHash}`,
  `NOT the brief's W3 — that is "1,000 runs of each WORKED LEVEL", which is item 7's. This is the ` +
  `spawner's half: the band jitter is drawn from world.ctx.rng and from nothing else`);

/* ================================================ WT — terrain (item 6) ---- */
/**
 * `js/sim/terrain.js`. The silhouette the renderer draws, the particles collide
 * with and the editor previews — ONE implementation, for the reason W5 gives one
 * system over.
 *
 * The criterion is the SLOPE BOUND, and it is derived from the flight envelope:
 * best climb 90 wu/s over cruise 280 wu/s = 0.321, i.e. 17.8 deg. A ridge
 * steeper than that rises faster than the aeroplane can climb while flying along
 * it, and in a 2D side-scroller the terrain under you IS your path — so a valley
 * floor steeper than the bound has no exit.
 */
const tProf = Object.entries(TERRAIN_PROFILES).map(([id, v]) => {
  const t = createTerrain({ id: 'a1-04', seed: 'a1-04', terrain: { profile: id } });
  return { id, ...v, errors: t.errors.length, closed: slopeBound(v.amp, v.wavelength, v.detail), measured: t.maxSlope() };
});
add('WT1', 'every named terrain profile is inside its own slope bound',
  tProf.every((t) => t.errors === 0 && t.closed <= MAX_SLOPE && t.measured <= t.closed),
  tProf.map((t) => `${t.id} amp ${t.amp}/wl ${t.wavelength}: closed ${t.closed.toFixed(4)}, ` +
                   `measured ${t.measured.toFixed(4)}`).join(' | ') + ` — bound ${MAX_SLOPE.toFixed(4)}`,
  `the wavelengths are DERIVED: authored, then raised to minWavelength(amp, detail) where the ` +
  `authored value was illegal. TWO of the first four were — ridge at 3,400 (floor 3,450) and ` +
  `pass_narrow at 1,900 (floor 5,950). The closed form is this generator's own, not a sine's: an ` +
  `earlier pi*amp/wl version condemned a profile 19% INSIDE the limit`);

const tSame = createTerrain({ id: 'a1-04', seed: 'a1-04' });
const tAgain = createTerrain({ id: 'a1-04', seed: 'a1-04' });
const tOther = createTerrain({ id: 'a1-04', seed: 'a1-05' });
const sample = (t) => Array.from({ length: 64 }, (_, i) => t.heightAt(i * 137).toFixed(6)).join(',');
add('WT2', 'the silhouette is deterministic from (id, seed) and the particle query agrees',
  sample(tSame) === sample(tAgain) && sample(tSame) !== sample(tOther)
  && Math.abs(tSame.query(1000 * 0.15) + tSame.heightAt(1000) * 0.15) < 1e-9,
  `seed a1-04 twice -> identical over 64 samples; seed a1-05 -> different; ` +
  `query(150 m) = ${tSame.query(150).toFixed(4)} m against heightAt(1000 wu) = ${tSame.heightAt(1000).toFixed(2)} wu`,
  `js/gfx/particles.js's setTerrainQuery socket takes SI metres like the rest of js/sim, so the ` +
  `M_PER_WU conversion happens ONCE, in the adapter, rather than in every caller`);

const tooTall = terrainProfileErrors({ profile: 'trenchline', amp: MAX_TERRAIN_WU + 200 });
const tooSteep = terrainProfileErrors({ profile: 'ridge', wavelength: 400 });
const unknown = terrainProfileErrors({ profile: 'alps' });
add('WT3', 'an unflyable or band-eating terrain is refused by name',
  tooTall.length >= 1 && tooSteep.length === 1 && unknown.length === 1,
  `amp ${MAX_TERRAIN_WU + 200} wu -> ${tooTall.length} error(s); ridge at wavelength 400 -> ` +
  `${tooSteep.length}; profile "alps" -> ${unknown.length}`,
  `Mud is ${MAX_TERRAIN_WU} wu thick and the silhouette may not reach Belt: terrain occupying the ` +
  `band above it is the ladder ceasing to read as six different places (D27)`);

/* --- WT4: §4.4.2 P7's terrain half ---------------------------------------- */
/**
 * P7 — *"distinct ground targets visible ahead while strafing at y in
 * [-260, -800] at cruise, target spacing 140 wu"*, PASS >= 3 — has read NOT
 * MEASURABLE since P8 because *"terrain and ground targets are P9"*. Terrain
 * now exists, so the OCCLUSION half is measurable here. The per-orientation
 * verdict is printed by `tools/gates_portrait.mjs`, which owns the frame
 * geometry and whose `results` stay the manager's (REQUEST-4).
 *
 * What is gated here: **on the terrain an act-1 level actually ships, the relief
 * does not eat the ground-attack band** — measured at the top, middle and bottom
 * of §4.4.2's own strafing window, at the landscape frame's measured forward
 * reach (D121).
 */
const STRAFE_WU = [260, 530, 800];
const p7 = ['plain', 'trenchline'].flatMap((profile) => STRAFE_WU.map((altWu) => {
  const t = createTerrain({ id: 'a1-01', seed: 'a1-01', terrain: { profile } });
  return { profile, altWu, ...visibleGroundTargets(t, { altWu, aheadWu: FRAME_REACH_WU }) };
}));
const p7ridge = STRAFE_WU.map((altWu) => {
  const t = createTerrain({ id: 'a1-01', seed: 'a1-01', terrain: { profile: 'pass_narrow' } });
  return { altWu, ...visibleGroundTargets(t, { altWu, aheadWu: FRAME_REACH_WU }) };
});
add('WT4', 'the relief does not hide the ground-attack band on an act-1 terrain',
  p7.every((r) => r.n >= 3),
  p7.map((r) => `${r.profile}@${r.altWu} wu: ${r.n}/${r.total} targets visible`).join(' | ') +
  ` — ${FRAME_REACH_WU} wu of reach at ${GROUND_TARGET_SPACING_WU} wu spacing, P7's bar is 3`,
  `and it CAN fail: act 3's pass_narrow reads ` +
  `${p7ridge.map((r) => `${r.n}/${r.total} at ${r.altWu} wu`).join(', ')} — at the BOTTOM of §4.4.2's ` +
  `own strafing window the relief hides every target, because MAX_TERRAIN_WU is ${MAX_TERRAIN_WU} wu ` +
  `and the window starts at 260. A legal terrain can put the whole ground-attack band inside the hill`);

/* ================================ item 7 — the codebook and the four levels */
/**
 * D146 unblocked this: **the shipped roster is the authority** and DESIGN §8.3's
 * codebook is re-authored onto it. The table lives in `js/data/level.js`, the
 * level format's own module, so there is exactly one copy (D72).
 */
const codes = Object.entries(ENEMY_CODE);
const dupFree = new Set(codes.map(([c]) => c)).size === codes.length
  && new Set(codes.map(([, v]) => v)).size === codes.length;
const roundTripCodes = Object.keys(ROSTER).every((id) => typeForCode(codeForType(id)) === id);
add('WC', 'one letter per shipped enemy type, unique, and one copy of the table',
  codes.length === Object.keys(ROSTER).length && dupFree && roundTripCodes,
  `${codes.map(([c, v]) => `${c}=${v}`).join(' ')} — ${codes.length} of ${Object.keys(ROSTER).length} ` +
  `shipped types, all initials, round trip id->code->id holds for all ${Object.keys(ROSTER).length}`,
  `DESIGN §8.3's ${Object.keys(CODES_WITHOUT_TYPE).join('/')} map onto no aeroplane: ` +
  `${Object.entries(CODES_WITHOUT_TYPE).map(([c, w]) => `${c} = ${w}`).join('; ')}. ` +
  `The letters are DERIVED (each type's own initial) and js/data/level.js REFUSES TO LOAD if two ` +
  `collide, because a ninth aeroplane silently aliasing an eighth would validate clean and play wrong`);

/* --- W1g: an airframe the game does not build ------------------------------ */
const badPlane = validateLevel(createLevel({ id: 'a1-01', player: { airframe: 'kitehawk-i' } }));
const goodPlane = validateLevel(createLevel({ id: 'a1-01' }));
add('W1g', 'a level naming an airframe the game does not build is refused by name',
  !badPlane.ok && badPlane.errors.some((e) => e.path === 'player.airframe') && goodPlane.ok,
  `§7.1's own "kitehawk-i" -> ${badPlane.errors.filter((e) => e.path === 'player.airframe').length} ` +
  `named error; the default (${LEVEL_DEFAULTS.player.airframe}) passes clean`,
  `playerType() does AIRFRAME_BY_ID[id] || REFERENCE, so before this rule a level naming an unknown ` +
  `aeroplane flew the reference machine SILENTLY — the level's stars and P11's whole curve would ` +
  `have been measured against an airframe the level never asked for. Legal: ` +
  `${AIRFRAMES.map((a) => a.id).join(', ')}`);

/* --- W6: the generator round trip ------------------------------------------ */
/**
 * The brief's W6: *"genlevels.mjs regenerates the four worked levels
 * byte-identically from the table"*. W6a above is the half it stands on — that
 * the FORMAT loses nothing across a load/save — and this is the claim itself.
 */
const gen = genCheck();
const GEN = genLevels();
add('W6', 'genlevels.mjs regenerates every artefact byte-identically from the table',
  gen.ok,
  gen.rows.map((r) => `${r.id} ${r.bytes} B ${r.ok ? '==' : '!='} ${r.onDisk}`).join(' | '),
  `DESIGN §8.4/§8.5 is transcribed cell for cell in tools/genlevels.mjs and every geometric number ` +
  `is derived from it — length = t(s) x ${CRUISE_WU_S} wu/s, first beat at start + ` +
  `${FRAME_REACH_WU} wu, last beat at length - ${SPAWN_LEAD_WU} wu`);

/* --- W7b: the SHIPPED levels against the cap ------------------------------- */
const shippedLevels = GEN.map((g) => ({ id: g.level.id, ...sizeReport(g.level),
  res: validateLevel(g.level), beats: g.level.beats.length }));
add('W7b', 'every shipped level validates clean and fits the 6 KB cap',
  shippedLevels.every((x) => x.ok && x.res.ok),
  shippedLevels.map((x) => `${x.id} ${x.bytes} B (${(100 * x.bytes / LEVEL_MAX_BYTES).toFixed(0)}%), ` +
    `${x.beats} beats, ${x.res.ok ? 'clean' : x.res.errors.map((e) => e.path).join(',')}`).join(' | '),
  `W7 above measures the FORMAT on fixtures; this measures the four files that actually ship. ` +
  `The busiest of them is ${Math.max(...shippedLevels.map((x) => x.bytes))} B, ` +
  `${(100 * Math.max(...shippedLevels.map((x) => x.bytes)) / LEVEL_MAX_BYTES).toFixed(0)}% of the cap`);

/* --- W3 and W4: the levels, flown ------------------------------------------ */
/**
 * `tools/sim.mjs --levelrun` builds the world from the LEVEL — its wind, its
 * player start, its beats through the shipped spawner — and returns
 * ARCHITECTURE §8.1's run summary. It shells out for the same reason W8 does:
 * `sim.mjs` owns world construction, and a gate that builds its own world is
 * measuring a second implementation of the game.
 */
const W3RUNS = Number(arg('--w3runs', 1000));
const runLevel = (file, extra = []) => JSON.parse(execFileSync(process.execPath,
  [join(ROOT, 'tools/sim.mjs'), '--levelrun', '--levelfile', file, ...extra],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));

const LEVEL_FILES = GEN.map((g) => ({ id: g.level.id, file: join(ROOT, 'data/levels', `${g.level.id}.json`) }));
const flown = LEVEL_FILES.map(({ id, file }) => ({
  id,
  a: runLevel(file, ['--runs', String(W3RUNS), '--seed', '5']),
  b: runLevel(file, ['--seed', '9']),
}));

add('W3', `the same seed gives the same state hash over ${W3RUNS} runs of every worked level`,
  flown.every((f) => f.a.distinctHashes === 1 && f.a.hash !== f.b.hash),
  flown.map((f) => `${f.id}: ${f.a.runs} runs at seed 5 -> ${f.a.distinctHashes} distinct hash ` +
    `(${f.a.hash}); seed 9 -> ${f.b.hash}`).join(' | '),
  `the hash covers every reported field except the seed — time, damage, kills, crates, the whole ` +
  `timeInBand vector and the spawn log. ${W3RUNS} x ${flown.length} missions; --w3runs shrinks it`);

/**
 * D31's 2-3 band slice. "Occupied" is derived, not a share chosen to make the
 * answer come out: a band counts if the player spent longer in it than crossing
 * it costs at best climb (`thickness / 90 wu/s`). Less than that is a transit,
 * which is what a band being a *place* rather than a *step* means (D27).
 */
const slices = flown.map((f) => ({ id: f.id, occ: f.a.occupied, n: f.a.occupied.length,
  touched: f.a.touched, t: f.a.time, done: f.a.completed }));
add('W4', 'each worked level is flown in a 2-3 band slice (D31)',
  slices.every((s) => s.n >= 2 && s.n <= 3),
  slices.map((s) => `${s.id}: ${s.n} occupied [${s.occ.join(',')}], touched [${s.touched.join(',')}], ` +
    `${s.t} s, completed ${s.done}`).join(' | '),
  `every one completes the traverse. a1-01 was the exception through the whole of P9 and was NOT ` +
  `tuned: DESIGN §8.2 gave act 1 a 600 m ceiling while saying Mud/Belt/Floor only, and R-02's Floor ` +
  `ends at 450 m. D150 settled it — the ceiling yields, the bands do not — and P10 made it ` +
  `EXECUTABLE: an act's ceiling is derived as the top of its own declared slice (act 1 -3,000 wu, ` +
  `act 2 -7,500), it is carried in the level's own column.ceiling, and js/modes/story.js's corridor ` +
  `enforces it as a lid. a1-01 spends 0.1 s in Deck against 26.7 s before. --break no-lid restores ` +
  `the old reading exactly`);

/* --- report --------------------------------------------------------------- */
if (!has('--quiet')) {
  console.log(`\nWORLD GATE — W5, one wind evaluator.  seed ${SEED}, ${n} samples, ${PROF.length} profiles` +
    `${BUG ? `, bug "${BUG}"` : ''}`);
  console.log(`  ceiling ${CEILING_M} m, wind limit ${WIND_MAX_MS} m/s, signature span ${SIGNATURE_SPAN_WU} wu (${signatureAltitudes().length} placements)\n`);
  for (const r of rows) {
    console.log(`  ${(r.pass ? 'PASS' : 'FAIL').padEnd(6)}${r.id.padEnd(6)}${r.what}`);
    console.log(`        ${' '.repeat(6)}${r.value}`);
    if (r.note) console.log(`        ${' '.repeat(6)}-> ${r.note}`);
  }
  const bad = rows.filter((r) => !r.pass);
  console.log(bad.length ? `\nFAIL — ${bad.map((r) => r.id).join(', ')}\n` : `\n${rows.length}/${rows.length} pass\n`);
}
export const RESULT = rows;

if (!has('--falsify')) process.exit(rows.every((r) => r.pass) ? 0 : 1);

/**
 * Falsification. W5a/W5b/W5e are STRUCTURAL — they are assertions about the
 * shape of the source, so their controls have to change the source, which a
 * flag cannot do. They are falsified by construction instead, and the proof is
 * printed rather than claimed: each one is re-evaluated against a deliberately
 * wrong input and must come out false.
 */
console.log('FALSIFICATION — break each thing, the named criterion must go RED\n');
let badN = 0;
const control = (label, pass, detail) => {
  if (pass) console.log(`  ${label.padEnd(46)}RED as required   ${detail}`);
  else { badN++; console.log(`  ${label.padEnd(46)}STILL GREEN — the criterion does not test it   ${detail}`); }
};

control('W5a vs a genuinely second function', windAtNearest !== windAt,
  'windAtNearest is a different object, so the identity test can distinguish');
control('W5b scan sees a definition it should flag',
  /(?:export\s+)?function\s+windAt\b/.test('export function windAt(profile, altM) {'),
  'the regex matches a real definition line');
control('W5c sampler sees a nearest-vs-linear defect', (() => {
  let w = 0;
  for (const { p } of PROF) for (let i = 0; i < 400; i++) {
    const altM = rng.next() * CEILING_M;
    w = Math.max(w, Math.abs(windAt(p, altM) - windAtNearest(p, altM)));
  }
  return w > 0.5;
})(), 'swapping in windAtNearest moves the sampled comparison well off zero');
control('W5d solver responds to the evaluator', Math.abs(shipped - bugged) > 1,
  `${Math.abs(shipped - bugged).toFixed(2)} m of movement`);
control('W5e scan would see hand-rolled wind in ai.js',
  /\bwindAt\s*\(|\bwind\s*\[/.test('const wx = windAt(field.wind, altM);'),
  'the regex matches a hand-rolled evaluation');
control('W5f rejects every malformed table', caught.length === BAD.length,
  `${caught.length}/${BAD.length}`);
control('W5g rejects bad visibility and time of day', badCond.errors.length === 2,
  badCond.errors.join(' | '));
control('W1 rejects every malformed level by name', w1res.every((r) => !r.ok && r.named),
  `${w1res.filter((r) => !r.ok && r.named).length}/${w1res.length}, including the central-signature layout D126 forbids and a terrain slope the aeroplane cannot climb`);
control('W1 accepts a legal level (it is not just always red)', goodRes.ok,
  `a well-formed level produces ${goodRes.errors.length} errors`);
control('W1c would see a re-introduced literal',
  /CARD_MAX_CHARS\s*:\s*\d+/.test('  CARD_MAX_CHARS: 44,'),
  'the scan regex matches the literal form it forbids');
control('WT1 bound would condemn a real profile', slopeBound(620, 1900, 0.7) > MAX_SLOPE,
  `pass_narrow as first typed — amp 620 over wavelength 1,900 — is ${slopeBound(620, 1900, 0.7).toFixed(3)}, ` +
  `${(slopeBound(620, 1900, 0.7) / MAX_SLOPE).toFixed(1)}x the bound, and it was in the table until the check ran`);
control('WT2 would see an unseeded terrain', sample(tSame) !== sample(tOther),
  'a different level seed gives a different silhouette, so the determinism test can distinguish');
control('WT3 rejects all three faults', tooTall.length && tooSteep.length && unknown.length,
  `${tooTall.length} + ${tooSteep.length} + ${unknown.length} named errors`);
control('W8 pool check would see a dropped spawn', w8stress.poolMisses > 0,
  `8 groups of 3 inside 480 wu -> ${w8stress.poolMisses} dropped of ${w8stress.fired} beats fired, ` +
  `peak ${w8stress.maxLiveReds} alive against a 16-slot pool. Before the spawner counted them, ` +
  `world.spawn returning null was SILENT — which is how §4.5's reinforcements went undelivered for two phases`);
control('W3a cursor test is not always green', (() => {
  const c2 = stubWorld(); const s2 = [];
  const bad = createSpawner(c2, cursorLevel, { onBeat: (b) => s2.push(b.event) });
  for (const x of [1200, 900, 1200]) { bad.state.next = 0; bad.state.maxCamWu = -Infinity; bad.update(x); }
  return s2.length > 1;
})(), 'resetting the cursor between steps re-fires the same beat, so the test can distinguish');
control('W3b would see an unseeded spawner', w8.logHash !== w8other.logHash,
  `${w8.logHash} vs ${w8other.logHash} — a spawner that ignored the seed would give one hash`);
control('W1d would see a level the loader broke',
  !validateLevel(createLevel({ ...AUTHORED, signatures: [{ band: 'mud', y: -350, kind: 'landmark' }] })).ok,
  'replacing the derived signature set with one central instance goes red on `signatures`');
control('W1e ordering check is not always red', validateLevel(MAPPED).ok,
  'the in-order authored level passes, so W1e is testing the ORDER and not the beats');
control('W6a round trip would see a dropped field', (() => {
  const stripped = JSON.parse(serializeLevel(LOADED));
  delete stripped.beats;
  return JSON.stringify(createLevel(stripped)) !== JSON.stringify(LOADED);
})(), 'deleting one emitted field makes the round trip differ, so the comparison has teeth');
control('W7 cap would fail a coordinate dump', !szDump.ok,
  `${szDump.bytes} B against a ${LEVEL_MAX_BYTES} B cap`);
control('W7 cap is not trivially clear', szBusy.bytes > LEVEL_MAX_BYTES * 0.25,
  `the densest level DESIGN specifies is ${(100 * szBusy.bytes / LEVEL_MAX_BYTES).toFixed(0)}% of the ` +
  `cap, so it is measured against something that could plausibly exceed it — and the FIRST fixture ` +
  `here, 60 beats plus 12 INLINE radio lines, did exceed it at 9,071 B. Both halves of that fixture ` +
  `were invented: DESIGN's densest level has 4 enemy groups and 12 crates, and §7.5 puts every line ` +
  `of text in data/script.json, so a beat carries a line ID and never the words`);
control('WA would see a level in the wrong act', !wrongAct.ok,
  wrongAct.errors.map((e) => e.path).join(','));
control('WA would see a short act', !shortAct.ok, shortAct.errors.map((e) => e.path).join(','));
control('WA parseLevelId is strict', parseLevelId('a1-3') === null && parseLevelId('a9-01') === null,
  'a one-digit index and a sixth act are both rejected, so the id really is the coordinate');
control('WT4 would see relief eating the band', p7ridge[0].n === 0,
  `pass_narrow at 260 wu hides ${p7ridge[0].total - p7ridge[0].n} of ${p7ridge[0].total} targets, ` +
  `so the horizon test is capable of reading zero and WT4's 6/6 is a result rather than an absence`);
control('WC would see a colliding initial', (() => {
  const fake = ['kestrel', 'kite'];            // both 'k'
  return new Set(fake.map((id) => id[0])).size !== fake.length;
})(), 'two types sharing an initial collapse the derived table, which is what level.js throws on');
control('W1g would see the airframe §7.1 names', !badPlane.ok,
  `"kitehawk-i" -> ${badPlane.errors.map((e) => e.path).join(',')}`);
control('W6 would see a hand-edited level', (() => {
  const g = GEN[0];
  return g.text !== g.text.replace(/"length": (\d+)/, (m, n) => `"length": ${Number(n) + 1}`);
})(), 'changing one byte of a generated file makes the comparison differ, so it has teeth');
control('W7b cap is not trivially clear on the shipped set',
  Math.max(...shippedLevels.map((x) => x.bytes)) > LEVEL_MAX_BYTES * 0.25,
  `the busiest shipped level is ${(100 * Math.max(...shippedLevels.map((x) => x.bytes)) / LEVEL_MAX_BYTES).toFixed(0)}% of the cap`);
control('W3 hash responds to the spawner\'s cursor rule', (() => {
  const base = runLevel(LEVEL_FILES[0].file, ['--seed', '5']);
  const cur = runLevel(LEVEL_FILES[0].file, ['--seed', '5', '--break', 'camera-current']);
  return base.hash !== cur.hash;
})(), '--break camera-current feeds the spawner the CURRENT camera x, and the state hash moves');
control('W4 responds to the level\'s own beats', (() => {
  const base = runLevel(LEVEL_FILES[0].file, ['--seed', '5']);
  const none = runLevel(LEVEL_FILES[0].file, ['--seed', '5', '--break', 'no-beats']);
  return base.occupied.join() !== none.occupied.join();
})(), 'stripping a1-01\'s beats takes it from 4 occupied bands to 2 — the fight is what widens the slice, not the layout');
control('W4 responds to the corridor\'s LID (D150)', (() => {
  const base = runLevel(LEVEL_FILES[0].file, ['--seed', '5']);
  const nolid = runLevel(LEVEL_FILES[0].file, ['--seed', '5', '--break', 'no-lid']);
  // The arms report the lid they ACTUALLY used, not the one they were asked for
  // — three of P9's break-switches were green because they never ran (D148).
  const ran = base.lidWu === -3000 && base.lidHits > 0 && nolid.lidWu === 0 && nolid.lidHits === 0;
  return ran && base.occupied.length === 3 && nolid.occupied.length === 4;
})(), 'lid -3000 wu / 6 contacts -> 3 occupied bands; --break no-lid reports lid 0 / 0 contacts and goes back to 4, which is the red W4 carried all through P9');
control('W4 responds to the corridor', (() => {
  const none = runLevel(LEVEL_FILES[0].file, ['--seed', '5', '--break', 'no-corridor']);
  return !none.completed;
})(), 'without the level\'s own bounds the player PATROLS west out of the level and never reaches the end — 254.3 s, 57,900 wu off the far side');
control('W1b would see a renamed stat', (() => {
  const fake = RUN_STATS.filter((s) => s !== 'kills');
  return fake.length !== RUN_STATS.length && !fake.includes('kills');
})(), 'dropping a stat from the declared list changes the diff');

console.log(badN ? `\nFAIL — ${badN} control(s) do not bite\n` : '\nPASS — every criterion is genuinely under test\n');
process.exit(badN || rows.some((r) => !r.pass) ? 1 : 0);
