#!/usr/bin/env node
/**
 * P9 item 8's check — `tools/pages/level.html`, in a real browser.
 *
 *   node tools/levelpage.mjs             the four worked levels, both orientations
 *   node tools/levelpage.mjs --falsify   the controls, each required to go RED
 *
 * Two claims, and the second is the one worth having:
 *
 *   L1  every shipped level LOADS, validates clean, fires all of its beats
 *       through the shipped spawner, and raises no page error — in landscape
 *       AND in portrait, because portrait stays first-class (D123).
 *   L2  a malformed level **fails LOUDLY**, which is the validator's own
 *       contract: *"in the console and in the debug overlay, never silently"*.
 *       The overlay half has never been checked by anything before this, and a
 *       contract nobody tests is a comment.
 *
 * Every run prints the frame it measured in and asserts it got the one it asked
 * for — P9_NOTES §0c's rule, applied to this page from the first line rather
 * than after the fact.
 */

import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { harness, ROOT } from './cdp.mjs';

const argv = process.argv.slice(2);
const has = (k) => argv.includes(k);

/** Parked past the far end, so every beat has fired by the time we look. */
const PARK = 60000;

const CASES = [
  ['a1-01', 844, 390], ['a1-04', 844, 390], ['a1-12', 844, 390], ['a2-05', 844, 390],
  ['a1-01', 390, 844], ['a1-12', 390, 844],
];

/**
 * The malformed fixture, written to `data/levels/` for the length of the run and
 * removed afterwards. It carries one of each fault the validator names, so the
 * control cannot pass on a single lucky rule.
 */
const BAD_ID = '__levelpage_bad';
const BAD = {
  id: BAD_ID, length: 12000,
  player: { airframe: 'kitehawk-i' },                       // W1g: not an airframe the game builds
  beats: [
    { x: 9000, spawn: 'hunter', band: 'belt' },             // W1f: not in the roster
    { x: 400, crate: { y: -99999 } },                       // out of order AND above the ceiling
  ],
  stars: ['time < 90'],                                     // an expression string
  landmarks: [{ x: 99000, kind: '' }],                      // outside the level, no kind
};

const probe = `(() => { const L = window.__level; if (!L) return null;
  return { id: L.level.id, ok: L.res.ok, errs: L.res.errors.map((e) => e.path),
           mode: L.frame.mode, w: L.frame.w, h: L.frame.h, worldH: L.frame.worldH,
           beats: L.level.beats.length, fired: L.spawner.state.fired, marks: L.marks.length,
           misses: L.spawner.state.poolMisses, unknown: L.spawner.state.unknownTypes,
           landmarks: L.level.landmarks.length, terrainErrs: L.terrain.errors.length,
           overlay: (document.getElementById('errs').textContent || '').length }; })()`;

const { cdp, base, close } = await harness({});

/**
 * `urlW`/`urlH` exist ONLY so the frame assert can be falsified: they let the
 * page be loaded into a frame other than the one being asserted. The first two
 * attempts at that control appended a second `?w=` to the query string, and
 * `qp` reads the first — so both controls came back STILL GREEN while testing
 * nothing at all, which is the same shape as D136's unplumbed switch.
 */
async function load(id, w, h, o = {}) {
  const uw = o.urlW ?? w, uh = o.urlH ?? h;
  const park = o.park ?? PARK;
  cdp.errors.length = 0;
  await cdp.viewport(uw, uh);
  await cdp.goto(`${base}/tools/pages/level.html?level=${id}&w=${uw}&h=${uh}&x=${park}`);
  await new Promise((r) => setTimeout(r, 700));
  const s = await cdp.eval(probe);
  if (!s) throw new Error(`level.html did not come up for ${id} at ${w}x${h}`);
  // §0c's rule: the page must report the frame it actually got.
  if (s.w !== w || s.h !== h)
    throw new Error(`level.html measured ${s.w}x${s.h} but was asked for ${w}x${h}`);
  /**
   * Two different things, kept apart. `[level <id>] path: why` is the
   * VALIDATOR being loud, which is what L2 requires; anything else is the page
   * itself going wrong, which is what L1 forbids. Counting them together is how
   * a broken page reads as a working validator.
   */
  const all = cdp.errors.slice();
  return { ...s, pageErrors: all.filter((e) => !e.includes('[level ')),
           validatorErrors: all.filter((e) => e.includes('[level ')) };
}

const rows = [];
let bad = 0;

for (const [id, w, h] of CASES) {
  const s = await load(id, w, h);
  const ok = s.ok && s.fired === s.beats && s.marks > 0 && s.unknown === 0
             && s.misses === 0 && s.terrainErrs === 0 && s.pageErrors.length === 0;
  if (!ok) bad++;
  rows.push({ id, w, h, ok, s });
  console.log(`  ${(ok ? 'PASS' : 'FAIL').padEnd(6)}L1  ${id} in ${w}x${h} ${s.mode}, worldH ${s.worldH} — ` +
    `${s.fired}/${s.beats} beats fired, ${s.marks} placements, ${s.landmarks} landmark(s), ` +
    `validate ${s.ok ? 'clean' : s.errs.join(',')}` +
    `${s.pageErrors.length ? `, PAGE ERRORS: ${s.pageErrors.join(' | ')}` : ''}`);
}

/* --- L2: the loud half ----------------------------------------------------- */
const badPath = join(ROOT, 'data/levels', `${BAD_ID}.json`);
writeFileSync(badPath, JSON.stringify(BAD, null, 2) + '\n');
let l2;
try {
  l2 = await load(BAD_ID, 844, 390);
} finally {
  rmSync(badPath, { force: true });
}
/**
 * Matched by SHAPE, not by index: the loader sorts, so the fault that was
 * authored as `beats[0]` is reported at whatever index it ended up at. Pinning
 * the index here would make the control pass or fail on the sort rather than on
 * the rule.
 */
const named = [/^player\.airframe$/, /^beats\[\d+\]\.spawn$/, /^beats\[\d+\]\.x$/,
               /^stars\[0\]$/, /^landmarks\[0\]\.x$/, /^landmarks\[0\]\.kind$/];
const caught = named.filter((n) => l2.errs.some((e) => n.test(e)));
const l2ok = !l2.ok && caught.length === named.length && l2.overlay > 0 && l2.validatorErrors.length >= named.length;
if (!l2ok) bad++;
console.log(`  ${(l2ok ? 'PASS' : 'FAIL').padEnd(6)}L2  a malformed level is refused LOUDLY — ` +
  `${caught.length}/${named.length} fault classes named (${l2.errs.join(', ')}), ` +
  `${l2.overlay} chars painted in the overlay, ${l2.validatorErrors.length} console error(s), ` +
  `${l2.pageErrors.length} page error(s)`);

if (!has('--falsify')) { close(); process.exit(bad ? 1 : 0); }

/* --- falsification --------------------------------------------------------- */
console.log('\nFALSIFICATION — break each thing, the named criterion must go RED\n');
let badN = 0;
const control = (label, pass, detail) => {
  if (pass) console.log(`  ${label.padEnd(50)}RED as required   ${detail}`);
  else { badN++; console.log(`  ${label.padEnd(50)}STILL GREEN — the criterion does not test it   ${detail}`); }
};

control('L1 would see a level that fired no beats', (() => {
  const parked = rows[0].s;
  return parked.fired === parked.beats && parked.beats > 0;
})(), `a1-01 fires ${rows[0].s.fired} of ${rows[0].s.beats}; a page whose spawner never ran would read 0`);

const near = await load('a1-12', 844, 390, { park: 0 });
control('L1 beat count is not always satisfied', near.fired < near.beats,
  `parked at x=0 the same level fires ${near.fired}/${near.beats}, so "all fired" is a real condition`);

control('L1 frame assert fires on the wrong frame', await (async () => {
  try { await load('a1-01', 844, 390, { urlW: 390, urlH: 844 }); return false; }
  catch (e) { console.log(`        ${e.message}`); return true; }
})(), 'a page loaded into a frame it was not asked for aborts by name');

control('L2 overlay is not always painted', rows[0].s.overlay === 0,
  `a clean level paints ${rows[0].s.overlay} chars of error overlay against the malformed one's ${l2.overlay}`);

control('L2 console half is not always loud', rows[0].s.validatorErrors.length === 0,
  `a clean level raises ${rows[0].s.validatorErrors.length} validator console errors against the malformed one's ${l2.validatorErrors.length}`);

control('L2 sees the fault the LOADER repairs', l2.errs.some((e) => /^beats\[\d+\]\.x$/.test(e)),
  'the out-of-order beat is reported off the loaded level. It was NOT, until this check ran: ' +
  'createLevel sorts, so the fault was gone before the page validated — and every real consumer ' +
  'validates the loaded object. level.js now carries beatOrderFault and validate.js fails on it');

close();
console.log(badN ? `\nFAIL — ${badN} control(s) do not bite\n` : '\nPASS — every criterion is genuinely under test\n');
process.exit(badN || bad ? 1 : 0);
