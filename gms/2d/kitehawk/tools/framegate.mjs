#!/usr/bin/env node
/**
 * The frame-level blind-critic gate (D64).
 *
 *   node tools/framegate.mjs --stage <round> [--gpu]     render + stage blind pairs
 *   node tools/framegate.mjs --score <round> <scores.json>
 *   node tools/framegate.mjs --reveal <round>
 *
 * Every other gate in this phase measures a PROPERTY of an asset — a seam, a hue angle, a
 * percentile, a count. All ten passed while the composed sky was bad, which is the fourth
 * time on this project that a green suite missed the thing it existed to protect (D47, D60,
 * D61, D64). Properties are cheap to satisfy and none of them is the question. The question
 * is whether the frame looks like the target, and the only instrument for that is a critic
 * who does not know which image is ours (D10).
 *
 * Two things make this different from `blind.mjs`, and both come out of round 0's mistakes:
 *
 * 1. **Each frame is paired with a reference of its OWN KIND.** Round 0 scored every frame
 *    against `p08`, a hero plate with an aeroplane in it, and all three critics' first
 *    complaint was "no subject". That measured the absence of P4 and P5, not the quality of
 *    the sky. A cloud-deck frame is compared with a cloud-deck plate.
 * 2. **The critic is told that BOTH images may be background plates with no vehicles**, so
 *    the missing aeroplane cannot decide the round either way. It is not told which is which
 *    and there is nothing in the staged folder that would say.
 *
 * The reference plates are ours (`docs/refs/probes/`) because `docs/refs/study/` is still
 * empty. So the gap is against our own best painted output, not against a shipped
 * professional frame, and its absolute value should be read with that in mind. What it is
 * good for is a BEFORE and an AFTER on the same staging.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
const has = f => argv.includes(f);
const arg = f => { const i = argv.indexOf(f); return i < 0 ? null : argv[i + 1]; };

/**
 * The frame set. Each row is [act, skyState, cameraY, cameraX, name, referencePlate,
 * how the reference is cropped]. The references are chosen so that the SUBJECT matches:
 * a cloud deck against a cloud deck, a dusk sky against a dusk sky, a trench floor against
 * a trench plate.
 */
const FRAMES = [
  ['act2_day_deck', 2, 'd', -3600, 2600, 'p03_cloud_deck', 'centre'],
  ['act2_overcast', 2, 'o', -2600, 5200, 'p01_sky_dawn', 'centre'],
  ['act3_massif', 3, 'd', -3200, 3300, 'p03_cloud_deck', 'right'],
  ['act5_dusk', 5, 'k', -4200, 4700, 'p02_sky_dusk', 'centre'],
  ['act4_night', 4, 'n', -2400, 4000, 'p02_sky_dusk', 'left'],
  ['act1_mud', 1, 'd', -500, 1900, 'p05_ground_trench', 'centre'],
];

const W = 390, H = 844;
const ROOT = new URL('..', import.meta.url).pathname;

async function stage(round, gpu) {
  const { harness } = await import('./cdp.mjs');
  const { readPNG, writePNG, crop, resize } = await import(`${ROOT}art/tools/img.js`).then(m => m.default || m);
  const out = `shots/p3/frames/${round}`;
  mkdirSync(out, { recursive: true });

  // 1. render ours
  const { cdp, base, close } = await harness({ gpu });
  await cdp.viewport(W, H, 1, false);
  await cdp.goto(`${base}/tools/pages/sky.html?w=${W}&h=${H}&nohud=1`);
  await cdp.waitFor('!!window.__sky', 20000);
  for (const [name, act, sk, y, x] of FRAMES) {
    await cdp.eval(`window.__sky.setAct(${act},'${sk}'); window.__sky.set({x:${x}, y:${y}, zoom:1})`);
    await cdp.frames(5);
    await cdp.capture(`${out}/_ours_${name}.png`);
    console.log(`  rendered ${name}`);
  }
  close();

  // 2. crop each reference to the frame aspect, avoiding its painted paper mount
  for (const [name, , , , , ref, where] of FRAMES) {
    const im = readPNG(`${ROOT}docs/refs/probes/${ref}.png`);
    // the plates carry a cream mount; the same 4% inset the bake uses removes it
    const ix = Math.round(im.w * 0.05), iy = Math.round(im.h * 0.05);
    const inner = crop(im, ix, iy, im.w - 2 * ix, im.h - 2 * iy);
    const cw = Math.min(inner.w, Math.round(inner.h * W / H));
    const ch = Math.round(cw * H / W);
    const x0 = where === 'left' ? 0 : where === 'right' ? inner.w - cw : Math.round((inner.w - cw) / 2);
    const y0 = Math.max(0, Math.round((inner.h - ch) / 2));
    writePNG(`${out}/_ref_${name}.png`, resize(crop(inner, x0, y0, cw, Math.min(ch, inner.h)), W, H), { forceAlpha: false });
  }

  // 3. stage blind, via blind.mjs so the randomisation and the key format are shared
  const pairs = [];
  for (const [name] of FRAMES) {
    const r = execFileSync('node', ['tools/blind.mjs', `${out}/_ours_${name}.png`, `${out}/_ref_${name}.png`, out, name],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const [a, b] = r.trim().split('\n');
    pairs.push({ name, a, b });
    console.log(`  staged ${name}:  ${a}  ${b}`);
  }
  writeFileSync(`${out}/PAIRS.json`, JSON.stringify(pairs, null, 1));
  console.log(`\n${pairs.length} pairs staged in ${out}. Keys are dot-files; do not show a critic the folder listing.`);
}

/** ART.md §9's gate: mean gap >= -2.0, and no banned word in a differences list. */
const BANNED = ['flat', 'uniform', 'the same ambient', 'sticker', 'tiling', 'repeated', 'wallpaper'];

function score(round, file) {
  const s = JSON.parse(readFileSync(file, 'utf8'));
  const rows = [];
  for (const r of s.results) {
    const ours = r.ours.reduce((a, b) => a + b, 0) / r.ours.length;
    const ref = r.reference.reduce((a, b) => a + b, 0) / r.reference.length;
    rows.push({ ...r, oursMean: ours, refMean: ref, gap: ours - ref });
  }
  const gap = rows.reduce((a, b) => a + b.gap, 0) / rows.length;
  const oursMean = rows.reduce((a, b) => a + b.oursMean, 0) / rows.length;
  const refMean = rows.reduce((a, b) => a + b.refMean, 0) / rows.length;
  const hits = {};
  for (const r of rows)
    for (const w of BANNED)
      if ((r.differences || '').toLowerCase().includes(w)) (hits[w] = hits[w] || []).push(r.frame);

  console.log(`round ${round}\n`);
  console.log('frame                 ours   ref    gap   picked ref?');
  for (const r of rows)
    console.log(`${r.frame.padEnd(20)} ${r.oursMean.toFixed(2).padStart(5)}  ${r.refMean.toFixed(2).padStart(5)}  ${r.gap.toFixed(2).padStart(6)}   ${r.pickedReference ? 'yes' : 'NO'}`);
  console.log(`\nmean ours ${oursMean.toFixed(2)}   mean reference ${refMean.toFixed(2)}   MEAN GAP ${gap.toFixed(2)}   ${gap >= -2.0 ? 'PASS' : 'FAIL'} (line -2.0)`);
  console.log(`critics who picked the reference: ${rows.filter(r => r.pickedReference).length}/${rows.length}`);
  const banned = Object.keys(hits);
  console.log(`banned words in the differences lists: ${banned.length ? banned.map(w => `"${w}" (${hits[w].join(', ')})`).join('  ') : 'NONE'}`);
  console.log(`\nART.md §9 gate needs BOTH: mean gap >= -2.0, and two consecutive rounds with no banned word.`);
  writeFileSync(`shots/p3/frames/${round}/SCORES.json`, JSON.stringify({ round, rows, gap, oursMean, refMean, banned: hits }, null, 1));
  return gap >= -2.0 && !banned.length;
}

if (has('--stage')) await stage(arg('--stage'), has('--gpu'));
else if (has('--score')) process.exit(score(arg('--score'), argv[argv.indexOf('--score') + 2]) ? 0 : 1);
else if (has('--reveal')) {
  const d = `shots/p3/frames/${arg('--reveal')}`;
  for (const f of readdirSync(d).filter(f => f.startsWith('.key_')).sort())
    process.stdout.write(readFileSync(`${d}/${f}`, 'utf8'));
} else {
  console.error('usage: framegate.mjs --stage <round> [--gpu] | --score <round> <scores.json> | --reveal <round>');
  process.exit(1);
}
