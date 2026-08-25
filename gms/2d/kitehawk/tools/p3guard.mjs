#!/usr/bin/env node
/**
 * THE P3 GUARD — D128's blessed regression fixture.
 *
 * Landscape P3 is `hull x scale x zoomWide >= 34 px` and it passes by 0.01 px.
 * Aaron accepted that knowingly (D128); this file is the thing that stands
 * between it and a silent breakage, so it is asserted on the THREE TERMS
 * SEPARATELY rather than on the product. A product assert would say "P3 broke";
 * these say which constant moved and who owns it.
 *
 * Every term is READ FROM THE SHIPPED MODULE, never restated here. Only the
 * blessed values and §4.4.2 P3's 34 px line are literals — that is what makes
 * this a fixture rather than a second copy of the arithmetic (D72).
 *
 *   node tools/p3guard.mjs                 # the four asserts
 *   node tools/p3guard.mjs --hull 65       # D128's mandated break-switch: expect RED
 *   node tools/p3guard.mjs --zoomwide 0.78 --hull 64    # the pre-D128 shipped pair
 *   node tools/p3guard.mjs --json shots/portrait/p3guard.json
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { VIEW_PROFILE } from '../js/core/viewprofile.js';
import { ENEMY_TYPES, FRAMING } from '../js/sim/entities.js';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const has = (k) => argv.includes(k);

/**
 * The blessed values, D128. `refH` is the reference landscape viewport HEIGHT in
 * css px — 844x390 is what every gate on this project measures at, and `scale`
 * is `refH / worldH`, so the device is in this arithmetic whatever D128 says.
 * See the headroom line below: it is the term nobody has a lever on.
 */
const BLESSED = { hullWu: 66, zoomWide: 0.74, worldH: 560, refH: 390, barPx: 34 };

/* --- the three terms, read live from the shipped modules ------------------ */
const HULL_OVERRIDE = Number(arg('--hull', 0));
const WIDE_OVERRIDE = Number(arg('--zoomwide', 0));
const WORLDH_OVERRIDE = Number(arg('--worldh', 0));

/** ART §3.4's minimum, as the game actually ships it. */
function minEnemyHullWu() {
  let m = Infinity;
  for (const t of ENEMY_TYPES) if (t.airframe && t.airframe.hullWu < m) m = t.airframe.hullWu;
  return m;
}

const P = VIEW_PROFILE.landscape;
const hull = HULL_OVERRIDE || minEnemyHullWu();
const wide = WIDE_OVERRIDE || P.zoomWide;
const worldH = WORLDH_OVERRIDE || P.worldH;
const scale = BLESSED.refH / worldH;
const px = hull * scale * wide;

const rows = [];
const add = (term, owner, value, blessed, ok, why) =>
  rows.push({ term, owner, value, blessed, ok, why });

add('hull', 'ART §3.4 — the minimum enemy hull', hull, BLESSED.hullWu, hull >= BLESSED.hullWu,
    'lowering the art minimum takes the smallest enemy under the 34 px silhouette line');
add('zoomWide', 'VIEW_PROFILE.landscape — the auto clamp FLOOR', wide, BLESSED.zoomWide,
    wide >= BLESSED.zoomWide,
    'a lower floor shows more world and shrinks every silhouette in it');
add('scale', 'VIEW_PROFILE.landscape.worldH (scale = refH / worldH)', scale,
    BLESSED.refH / BLESSED.worldH, Math.abs(scale - BLESSED.refH / BLESSED.worldH) < 1e-9,
    'worldH is the profile premise; raising it fits more sky and costs px per wu');
add('product', '§4.4.2 P3 — the criterion itself', px, BLESSED.barPx, px >= BLESSED.barPx,
    'hull x scale x zoomWide, the whole of P3');

/**
 * `scale` has one input D128 does not name: the viewport. A landscape frame
 * shorter than this fails P3 with every constant at its blessed value.
 */
const critH = BLESSED.barPx * worldH / (hull * wide);

/* --- FRAMING.hullWu is the SECOND copy of the enemy hull ------------------ */
const framingDrift = FRAMING.hullWu !== minEnemyHullWu();

const bad = rows.filter((r) => !r.ok);
console.log(`\nTHE P3 GUARD — D128. landscape 844x${BLESSED.refH}, bar ${BLESSED.barPx} px\n`);
for (const r of rows)
  console.log(`  ${(r.ok ? 'ok  ' : 'RED ')}${r.term.padEnd(9)}${String(typeof r.value === 'number' ? r.value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '') : r.value).padStart(12)}` +
              `   blessed ${String(r.blessed).padStart(10)}   ${r.owner}`);
console.log('');
console.log(`  ${hull} wu x ${scale.toFixed(6)} px/wu x ${wide} = ${px.toFixed(4)} px against ${BLESSED.barPx} px` +
            `  (margin ${(100 * (px / BLESSED.barPx - 1)).toFixed(3)}%)`);
console.log(`  the viewport term: any landscape frame shorter than ${critH.toFixed(2)} css px FAILS P3 at these constants`);
console.log(`                     the reference 390 px clears it by ${(BLESSED.refH - critH).toFixed(2)} px`);
if (framingDrift)
  console.log(`\n  NOTE  FRAMING.hullWu is ${FRAMING.hullWu} and the shipped minimum enemy hull is ${minEnemyHullWu()} —` +
              ` the framing box sizes an enemy it does not agree with (D72's drift shape).`);

if (bad.length) {
  console.log(`\nP3 GUARD RED — ${bad.length} term(s) moved:\n`);
  for (const r of bad)
    console.log(`  ${r.term}: ${typeof r.value === 'number' ? r.value.toFixed(6) : r.value} against a blessed ${r.blessed}` +
                `\n    owner: ${r.owner}\n    why it matters: ${r.why}`);
  console.log(`\n  P3 accepted at a 0.03% margin by AARON'S CALL (D128). It has no slack.` +
              `\n  Do not re-bless without a DECISIONS entry: the two levers move in opposite` +
              `\n  directions and must be solved together (D127).`);
} else {
  console.log(`\nP3 GUARD GREEN — all four asserts hold.`);
}

if (has('--json')) {
  const path = arg('--json', 'shots/portrait/p3guard.json');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ when: new Date().toISOString(), blessed: BLESSED,
    hull, scale, zoomWide: wide, worldH, px, critViewportH: critH, framingHullWu: FRAMING.hullWu,
    rows, green: !bad.length }, null, 2));
  console.log(`wrote ${path}`);
}

process.exit(bad.length ? 1 : 0);
