#!/usr/bin/env node
/**
 * P8b — the HUD SLOTS, portrait against landscape, resolved through the shipped
 * `resolveLayout` rather than re-derived from the profile table.
 *
 * The question is not "is the landscape layout legal" — H2/H4/H5 already ask
 * that. It is **which of these numbers was sized against portrait's frame and
 * carried into a frame with different proportions**, which needs the same
 * quantity printed in both columns and the arithmetic shown.
 *
 * Two things are printed that no existing gate prints:
 *  - every slot as a fraction of ITS OWN frame's width and height, and in mm at
 *    a nominal 160 css-px/inch phone, so a shared absolute px metric shows up as
 *    a different physical object in the two orientations;
 *  - the playfield the CAMERA gets, beside the slots that define it.
 *
 *   node tools/p8bslots.mjs
 */
import { resolveLayout, METRICS, rangesFor, insideSafe, overlaps } from '../js/ui/layout.js';
import { VIEW_PROFILE, stickRadius, STICK_R_FRAC } from '../js/core/viewprofile.js';
import { makeView } from './p8engage.mjs';

const PX_PER_MM = 160 / 25.4;               // nominal css px per mm
const f2 = (x) => Number(x).toFixed(2);
const mm = (px) => (px / PX_PER_MM).toFixed(1);

const V = { portrait: makeView('portrait'), landscape: makeView('landscape') };
const L = { portrait: resolveLayout(V.portrait), landscape: resolveLayout(V.landscape) };

const col = (name, fn) =>
  console.log(`  ${name.padEnd(30)} ${String(fn('portrait')).padEnd(32)} ${fn('landscape')}`);

console.log('\n=== HUD SLOTS — resolveLayout(), 390x844 vs 844x390, no safe insets ===\n');
console.log(`  ${'quantity'.padEnd(30)} ${'PORTRAIT'.padEnd(32)} LANDSCAPE`);
col('frame px', (m) => `${V[m].w} x ${V[m].h}`);

/** A slot's rect, plus what fraction of its own frame it takes and its size in mm. */
function slotRows(id, get) {
  console.log(`  --- ${id}`);
  col('  rect x,y,w,h px', (m) => { const r = get(m); return r ? `${f2(r.x)}, ${f2(r.y)}, ${f2(r.w)}, ${f2(r.h)}` : '(none)'; });
  col('  w,h as frac of frame', (m) => {
    const r = get(m); if (!r) return '(none)';
    return `${f2(r.w / V[m].w)} W x ${f2(r.h / V[m].h)} H`;
  });
  col('  area as frac of frame', (m) => {
    const r = get(m); if (!r) return '(none)';
    return f2(r.w * r.h / (V[m].w * V[m].h));
  });
  col('  w x h in mm', (m) => { const r = get(m); return r ? `${mm(r.w)} x ${mm(r.h)}` : '(none)'; });
}

for (const [id, key] of [['stickZone', 'stickZone'], ['special (profile slot)', 'special'],
                         ['radioCard', 'card'], ['tape', 'tape'], ['coaming', 'coaming'],
                         ['coaming2', 'coaming2'], ['banner', 'banner'], ['wind', 'wind']])
  slotRows(id, (m) => L[m][key]);

console.log('\n=== THE PROFILE FIELDS BEHIND THEM ===\n');
console.log(`  ${'field'.padEnd(30)} ${'PORTRAIT'.padEnd(32)} LANDSCAPE`);
for (const k of ['stickZone', 'specialSlot', 'radioCard'])
  col(k, (m) => JSON.stringify(VIEW_PROFILE[m][k]));
col('altTape', (m) => JSON.stringify(VIEW_PROFILE[m].altTape));
col('altTape w as frac of frame W', (m) => f2(VIEW_PROFILE[m].altTape.w / V[m].w));

console.log('\n=== THE STICK — the one widget with its own radius law ===\n');
console.log(`  ${'quantity'.padEnd(30)} ${'PORTRAIT'.padEnd(32)} LANDSCAPE`);
col('STICK_R_FRAC x viewW (pre-P8c)', (m) => `${f2(V[m].w * STICK_R_FRAC)} px`);
col('stickRadius(viewW) px', (m) => `${f2(stickRadius(V[m]))} px = ${mm(stickRadius(V[m]))} mm`);
col('  as frac of frame H', (m) => f2(stickRadius(V[m]) / V[m].h));
col('  as frac of stickZone H', (m) => f2(stickRadius(V[m]) / L[m].stickZone.h));
col('  diameter vs stickZone W', (m) => `${f2(2 * stickRadius(V[m]))} / ${f2(L[m].stickZone.w)} = ${f2(2 * stickRadius(V[m]) / L[m].stickZone.w)}`);
col('THUMB_DISC (H11) px', () => `${METRICS.THUMB_DISC} = ${mm(METRICS.THUMB_DISC)} mm`);
col('  as frac of frame H', (m) => f2(METRICS.THUMB_DISC / V[m].h));
col('  as frac of frame W', (m) => f2(METRICS.THUMB_DISC / V[m].w));

console.log('\n=== SHARED ABSOLUTE METRICS, in each frame ===\n');
console.log('  Every value here is one number used in both orientations. The columns show what');
console.log('  fraction of ITS OWN frame it becomes — a shared px constant is only orientation-');
console.log('  neutral if that fraction is meant to differ.\n');
console.log(`  ${'metric'.padEnd(30)} ${'PORTRAIT'.padEnd(32)} LANDSCAPE`);
const SHARED = [
  ['COAM_FRAC (of frame H)', () => METRICS.COAM_FRAC, (m) => `${f2(METRICS.COAM_FRAC * V[m].h)} px = ${mm(METRICS.COAM_FRAC * V[m].h)} mm`],
  ['ARC_R px', () => METRICS.ARC_R, (m) => `${METRICS.ARC_R} px, ${f2(METRICS.ARC_R * 2 / V[m].w)} of frame W`],
  ['TAPE_TOP_FRAC (of frame H)', () => METRICS.TAPE_TOP_FRAC, (m) => `${f2(METRICS.TAPE_TOP_FRAC * V[m].h)} px`],
  ['tape usable length px', () => 0, (m) => `${f2(L[m].tape.h)} = ${f2(L[m].tape.h / V[m].h)} of frame H`],
  ['BANNER_H px', () => METRICS.BANNER_H, (m) => `${f2(L[m].banner.h)} px actual`],
  ['WIND_W px', () => METRICS.WIND_W, (m) => `${f2(METRICS.WIND_W / V[m].w)} of frame W`],
  ['FONT_MIN px', () => METRICS.FONT_MIN, (m) => `${f2(METRICS.FONT_MIN / V[m].h)} of frame H`],
  ['PREDICT_MAX px', () => METRICS.PREDICT_MAX, (m) => `${f2(METRICS.PREDICT_MAX / V[m].w)} of frame W`],
  ['CHEV_INSET px', () => METRICS.CHEV_INSET, (m) => `${f2(METRICS.CHEV_INSET / V[m].w)} of frame W`],
];
for (const [name, , fn] of SHARED) col(name, fn);

console.log('\n=== RANGES — the HUD\'s world-space radii ===\n');
for (const m of ['portrait', 'landscape'])
  console.log(`  ${m.padEnd(10)} PIP_RANGE_WU  ${rangesFor(VIEW_PROFILE[m]).PIP_RANGE_WU}   CHEV_RANGE_WU ${rangesFor(VIEW_PROFILE[m]).CHEV_RANGE_WU}`);
console.log(`  layout.js's RANGES used to read VIEW_PROFILE.PORTRAIT.zoomLockRange by name in BOTH`);
console.log(`  orientations. FIXED in P8c: it is rangesFor(profile), attached as L.ranges.`);
console.log(`    portrait.zoomLockRange  ${VIEW_PROFILE.portrait.zoomLockRange}`);
console.log(`    landscape.zoomLockRange ${VIEW_PROFILE.landscape.zoomLockRange}`);
console.log(`    -> numerically identical today; a HARD portrait dependency the moment they differ.`);
// The same radius expressed as a fraction of what each frame can actually show.
console.log('');
console.log(`  ${'quantity'.padEnd(30)} ${'PORTRAIT'.padEnd(32)} LANDSCAPE`);
col('PIP_RANGE / half frame W @1.00', (m) => f2(rangesFor(VIEW_PROFILE[m]).PIP_RANGE_WU / (V[m].worldW * 0.5)));
col('PIP_RANGE / half frame H @1.00', (m) => f2(rangesFor(VIEW_PROFILE[m]).PIP_RANGE_WU / (V[m].worldH * 0.5)));

console.log('\n=== LEGALITY — the checks H2/H4/H5 make, run here for both ===\n');
for (const m of ['portrait', 'landscape']) {
  const l = L[m];
  const outside = l.elements.filter((e) => !insideSafe(e, l)).map((e) => e.id);
  const pairs = [];
  for (let i = 0; i < l.elements.length; i++)
    for (let j = i + 1; j < l.elements.length; j++)
      if (overlaps(l.elements[i], l.elements[j])) pairs.push(`${l.elements[i].id}/${l.elements[j].id}`);
  console.log(`  ${m.padEnd(10)} outside safe: ${outside.length ? outside.join(', ') : 'none'}`);
  console.log(`  ${''.padEnd(10)} overlapping pairs: ${pairs.length ? pairs.join(', ') : 'none'}`);
}
console.log('');
