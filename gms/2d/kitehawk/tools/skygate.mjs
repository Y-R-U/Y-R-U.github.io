#!/usr/bin/env node
/**
 * P3's browser-side gates: A4 (nothing repeats on screen), A5 (the ramp does the work),
 * A6 (near layers go near-black), A7 (band crossfade timing). A1/A2/A3 are on disk and
 * belong to `art/tools/verify.js`.
 *
 *   node tools/skygate.mjs [--gpu] [--shots] [--falsify]
 *
 * `--falsify` is the point of the file. Every criterion here is run a second time against a
 * deliberately broken configuration and is REQUIRED to go red. Both prior phases found a
 * criterion that could not catch the bug it existed for (D47) and a broken implementation
 * that scored the best numbers in the table (D61); a gate that has never been shown to fail
 * is not evidence.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { harness } from './cdp.mjs';

const argv = process.argv.slice(2);
const has = f => argv.includes(f);
const OUT = 'shots/p3';
mkdirSync(OUT, { recursive: true });

const { cdp, base, close } = await harness({ gpu: has('--gpu') });
await cdp.viewport(390, 844, 1, false);
await cdp.goto(`${base}/tools/pages/sky.html?w=390&h=844&nohud=1`);
await cdp.waitFor('!!window.__sky', 20000);
await cdp.frames(3);

const results = [];
const rec = (id, pass, line, extra) => { results.push({ id, pass, line, ...extra }); console.log(`${id} ${pass ? 'PASS' : 'FAIL'}  ${line}`); };

/* ---- A7 — band crossfade timing --------------------------------------------- */
// Pure geometry off bandBlend(), so it does not depend on the frame rate of whatever
// machine runs it. Best climb rate is 90 wu/s (13.5 m/s at 0.15 m/wu, R-01).
const xf = await cdp.eval('JSON.stringify(window.__sky.crossfades())').then(JSON.parse);
const secs = xf.map(x => x.secs);
rec('A7', secs.every(s => s >= 1.0 && s <= 3.0),
  `crossfades ${xf.map(x => `${x.edge} ${x.secs.toFixed(2)}s`).join('  ')}`, { xf });

/* ---- A6 — moved to art/tools/verify.js, and here is why ---------------------- */
// A6 is a property of the shipped ART, and measuring it in the framebuffer measured the
// post-process noise floor instead: thresholding at L > 0.002 to find "everything drawn"
// admitted the grain and vignette across the whole frame, so 21% of all pixels entered the
// population and its 90th percentile never moved -- not when the layer's mul was zeroed,
// not when its shade was zeroed, not when the crush pass was undone. It is measured exactly
// on the atlas in verify.js, where the population is the opaque pixels of the actual frames.
const a6 = null;

/* ---- A4 — nothing repeats inside one screen ---------------------------------- */
// A human names repeats over a full level scroll at three speeds; this is the machine half
// of that, run over the same scroll so the human is looking at a sampled worst case rather
// than a lucky frame.
await cdp.eval("window.__sky.setAct(2,'d')");
let worst = { worst: 0 }, frames = 0, withRepeat = 0;
for (const speed of [400, 1400, 3600]) {
  for (let i = 0; i < 60; i++) {
    await cdp.eval(`window.__sky.set({x:${i * speed}, y:${-2200 - (i % 12) * 380}})`);
    const r = await cdp.eval('JSON.stringify(window.__sky.repeats())').then(JSON.parse);
    frames++;
    if (r.worst > 1) withRepeat++;
    if (r.worst > worst.worst) worst = { ...r, speed, i };
  }
}
rec('A4', worst.worst < 3,
  `worst cutout multiplicity on one screen ${worst.worst} (FAIL at 3+), ${withRepeat}/${frames} frames contain any repeat at all, ` +
  `on the worst frame ${worst.total} cutouts drawn from ${worst.distinct} distinct ids`, { worst, frames, withRepeat });

/* ---- A5 — the ramp actually does the work ------------------------------------ */
// Measured in ramp.js against the real baked plate; re-read here so one command prints the
// whole gate table. See P3_NOTES §4 for why act 2's key moved.
const { execSync } = await import('node:child_process');
let a5line = '', a5pass = false;
try {
  const o = execSync('node art/tools/ramp.js --measure art/work/clouds/cL01.png', { encoding: 'utf8' });
  a5line = o.trim().split('\n').pop();
  a5pass = a5line.includes('PASS');
} catch (e) { a5line = (e.stdout || '').trim().split('\n').pop() || 'ramp.js --measure failed'; }
rec('A5', a5pass, a5line);

/* ---- shots ------------------------------------------------------------------- */
if (has('--shots')) {
  for (const [act, sk, y, name] of [
    [2, 'd', -3600, 'act2_day_deck'], [4, 'n', -2400, 'act4_night'], [1, 'd', -500, 'act1_mud'],
    [3, 'd', -3200, 'act3_massif'], [5, 'k', -4200, 'act5_dusk'], [4, 's', -3000, 'act4_storm'],
  ]) {
    await cdp.eval(`window.__sky.setAct(${act},'${sk}'); window.__sky.set({x:${1200 + act * 700}, y:${y}, zoom:1})`);
    await cdp.frames(4);
    await cdp.capture(`${OUT}/${name}.png`);
    console.log(`  shot ${name}.png`);
  }
}

/* ---- falsification ------------------------------------------------------------ */
// Each control is a query flag on the page, the same shape as P1's ?impl=screen and P2's
// ?slew=symmetric. No shipped build ever sets one. A criterion that has never been shown
// to go red is not evidence -- D47 found a criterion that could not catch its own bug, and
// D61 found a broken controller winning three of six criteria.
if (has('--falsify')) {
  console.log('\n--- falsification: each control must go RED ---');
  const f = [];

  // A4 control: collapse the cloud atlas to one cutout.
  await cdp.goto(`${base}/tools/pages/sky.html?w=390&h=844&nohud=1&bug=oneCutout`);
  await cdp.waitFor('!!window.__sky', 20000);
  await cdp.frames(2);
  let w4 = 0;
  for (let i = 0; i < 40; i++) {
    await cdp.eval(`window.__sky.set({x:${i * 1400}, y:${-2600 - (i % 9) * 420}})`);
    const r = await cdp.eval('JSON.stringify(window.__sky.repeats())').then(JSON.parse);
    if (r.worst > w4) w4 = r.worst;
  }
  f.push({ id: 'A4', red: w4 >= 3, line: `one-cutout atlas: worst multiplicity ${w4} against the shipped ${worst.worst} (red needs >= 3)` });

  // A7 control: make every band change at a line.
  await cdp.goto(`${base}/tools/pages/sky.html?w=390&h=844&nohud=1&bug=hardBands`);
  await cdp.waitFor('!!window.__sky', 20000);
  const bad7 = await cdp.eval('JSON.stringify(window.__sky.crossfades())').then(JSON.parse);
  const s7 = bad7.map(x => x.secs);
  f.push({ id: 'A7', red: s7.some(v => v < 0.4), line: `hard bands: crossfades ${s7.map(v => v.toFixed(3)).join(', ')} s against the shipped ${secs.map(v => v.toFixed(2)).join(', ')} (red needs < 0.4)` });

  // A5 control: give every act the SAME tone LUT and require the separation to collapse.
  // `--measure --sameLut` does exactly that in ramp.js, against the same baked plate, so
  // the control differs from the real run by one substitution and nothing else.
  let a5c = '';
  try { a5c = execSync('node art/tools/ramp.js --measure art/work/clouds/cL01.png --sameLut', { encoding: 'utf8' }); }
  catch (e) { a5c = e.stdout || ''; }
  // matches the re-specified A5's output (§15), not the superseded degrees form
  const m = /A5 worst pair \S+ = ([\d.]+)\s+(PASS|FAIL)/.exec(a5c);
  const w5 = m ? Number(m[1]) : null;
  f.push({ id: 'A5', red: w5 !== null && w5 < 0.25, line: `one LUT shared by all five acts: worst pair ${w5 === null ? '?' : w5.toFixed(2)} against the shipped 0.26 (red needs < 0.25)` });

  for (const x of f)
    console.log(`  control ${x.id}: ${x.red === null ? 'INCONCLUSIVE' : x.red ? 'went RED, as required' : 'STAYED GREEN -- the criterion does not catch its own bug'} -- ${x.line}`);
  writeFileSync(`${OUT}/falsify.json`, JSON.stringify(f, null, 1));
  if (f.some(x => !x.red)) console.log('  ONE OR MORE CRITERIA DO NOT CATCH THEIR OWN BUG');
}

writeFileSync(`${OUT}/gates.json`, JSON.stringify(results, null, 1));
console.log(`\n${results.filter(r => r.pass).length}/${results.length} browser-side gates pass`);
close();
process.exit(results.every(r => r.pass) ? 0 : 1);
