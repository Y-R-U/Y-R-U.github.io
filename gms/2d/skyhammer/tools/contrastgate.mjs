#!/usr/bin/env node
/**
 * THE READABILITY GATE (ART.md §2, D9).
 *
 * Measures RMS luminance contrast of an actor's screen-space bounding box against a dilated ring
 * around it, for the player AND for every other visible actor.
 *
 * WHAT IS ASSERTED, and why it is not the naive thing:
 *   1. the player's RMS contrast clears an absolute floor set ABOVE the measured sabotage score.
 *   2. the player out-scores every ENEMY AIRCRAFT — the objects competing for the same sky.
 *
 * Michelson (box mean vs ring mean) is REPORTED but not asserted. Even a tight fuselage box is
 * ~55% background, so as the plane's value crosses the sky's the signed difference passes through
 * zero and the number collapses while the plane is at its most readable. Asserting on it would
 * have failed a good build for the wrong reason. RMS does not have that failure mode: it is
 * dominated by the plane's own deviation from the surround, whichever side of it the plane sits.
 *
 * Ranking the player against GROUND props is reported but NOT asserted, and that is deliberate.
 * A dark building whose box straddles the horizon contains both near-black earth and bright sky,
 * so its within-box variance is enormous no matter how the plane is drawn: it is a property of
 * the box, not of the building's salience. Asserting on it would be a believable-but-wrong metric
 * of exactly the kind that let KITEHAWK pass a plane-visibility gate ten times.
 *
 * Pixels are read inside the page — the WebGL canvas is copied into a 2D canvas and sampled there
 * — so no PNG decoding is needed and the numbers come from the frame that was really drawn.
 *
 *   node tools/contrastgate.mjs [--sabotage] [--size 844x390] [--url ...] [--json]
 *
 * --sabotage paints the player in the sky colour sampled from behind it. THE GATE MUST FAIL.
 * Run it that way once before believing any pass (CONTRACTS §13).
 */

import { harness } from './cdp.mjs';
import { setTimeout as sleep } from 'node:timers/promises';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const has = (k) => argv.includes(k);

const SABOTAGE = has('--sabotage');
const SIZES = (arg('--size', '844x390,932x430')).split(',');
const CASES = (arg('--cases', 'farmland/dawn/clear,city/dusk/clear,sea/day/clear,alpine/day/overcast')).split(',');
// Both floors are set from the measured SABOTAGE baseline (see docs/GFX_NOTES.md) with headroom.
// Measured 2026-08-26: SABOTAGE scores 0.090 / 0.211 / 0.119 / 0.096; live build scores
// 0.339 / 0.627 / 0.374 / 0.365. 0.28 sits between with headroom on both sides.
const FLOOR = Number(arg('--floor', '0.28'));
const MARGIN = Number(arg('--margin', '1.05'));   // player must beat the best enemy aircraft by this

const MEASURE = `
(() => {
  const gl = document.getElementById('gl');
  const c = document.createElement('canvas');
  c.width = gl.width; c.height = gl.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(gl, 0, 0);
  const W = c.width, H = c.height;
  const img = g.getImageData(0, 0, W, H).data;
  const sx = W / window.__lab.R.camApi.W, sy = H / window.__lab.R.camApi.H;
  const lum = (i) => (0.2126 * img[i] + 0.7152 * img[i+1] + 0.0722 * img[i+2]) / 255;

  function stats(x0, y0, x1, y1, skip) {
    x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
    x1 = Math.min(W, Math.ceil(x1));  y1 = Math.min(H, Math.ceil(y1));
    let n = 0, s = 0, s2 = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (skip && x >= skip[0] && x < skip[2] && y >= skip[1] && y < skip[3]) continue;
      const L = lum((y * W + x) * 4);
      s += L; s2 += L * L; n++;
    }
    return n ? { n, mean: s / n, sd: Math.sqrt(Math.max(0, s2 / n - (s / n) * (s / n))) } : { n: 0, mean: 0, sd: 0 };
  }

  const out = [];
  for (const t of window.__lab.targets()) {
    const bx0 = t.x * sx, by0 = t.y * sy, bx1 = (t.x + t.w) * sx, by1 = (t.y + t.h) * sy;
    const bw = bx1 - bx0, bh = by1 - by0;
    if (bw < 4 || bh < 3) continue;
    const box = stats(bx0, by0, bx1, by1);
    // a 3x dilated ring, the box itself excluded
    const ring = stats(bx0 - bw, by0 - bh, bx1 + bw, by1 + bh, [bx0, by0, bx1, by1]);
    if (!box.n || !ring.n) continue;
    // RMS contrast of the object against its surround, normalised by the surround's level
    let s2 = 0, n = 0;
    for (let y = Math.max(0, Math.floor(by0)); y < Math.min(H, Math.ceil(by1)); y++)
      for (let x = Math.max(0, Math.floor(bx0)); x < Math.min(W, Math.ceil(bx1)); x++) {
        const d = lum((y * W + x) * 4) - ring.mean; s2 += d * d; n++;
      }
    const rms = n ? Math.sqrt(s2 / n) / Math.max(0.06, ring.mean) : 0;
    const mich = Math.abs(box.mean - ring.mean) / Math.max(0.02, box.mean + ring.mean);
    out.push({ id: t.id, kind: t.kind, shape: t.shape, px: Math.round(bw * bh),
               rms: +rms.toFixed(4), michelson: +mich.toFixed(4),
               boxMean: +box.mean.toFixed(4), ringMean: +ring.mean.toFixed(4) });
  }
  out.sort((a, b) => b.rms - a.rms);
  return { targets: out, state: window.__state };
})()
`;

const { cdp, base, close } = await harness({});
const rows = [];
let fails = 0;

try {
  for (const size of SIZES) {
    const [w, h] = size.split('x').map(Number);
    await cdp.viewport(w, h, 1, true);
    for (const cs of CASES) {
      const [biome, tod, weather] = cs.split('/');
      const url = `${base}/tools/lab/gfx.html?biome=${biome}&tod=${tod}&weather=${weather}&preserve=1&dpr=1&t=5&photo=1&bloom=1&gate=1`;
      await cdp.goto(url);
      const ok = await cdp.waitFor('window.__state && window.__state.ready', 12000);
      if (!ok) { console.log(`[GATE] ${size} ${cs}: page never became ready`); fails++; continue; }
      await sleep(500);
      let camoHex = null;
      if (SABOTAGE) {
        camoHex = await cdp.eval('window.__lab.camouflage(true)');
        await cdp.frames(4);
        await sleep(250);
      }
      await cdp.frames(3);
      const r = await cdp.eval(MEASURE);
      const resolved = r.state?.palette;
      const player = r.targets.find((t) => t.kind === 'player');
      const air = r.targets.filter((t) => t.kind === 'fighter');
      const bestAir = air[0];
      const groundRank = r.targets.findIndex((t) => t.kind === 'player') + 1;

      if (!player) { console.log(`[GATE] ${size} ${cs}: NO PLAYER TARGET`); fails++; continue; }
      const passFloor = player.rms >= FLOOR;
      const passAir = !bestAir || player.rms >= bestAir.rms * MARGIN;
      const pass = passFloor && passAir;
      if (!pass) fails++;

      rows.push({ size, requested: cs, resolved, camoHex, groundRank, of: r.targets.length,
        rms: player.rms, michelson: player.michelson,
        bestEnemyAir: bestAir ? bestAir.rms : null, bestEnemyShape: bestAir ? bestAir.shape : null,
        passFloor, passAir, pass });

      console.log(
        `${pass ? 'PASS' : 'FAIL'}  ${size}  requested=${cs}  RESOLVED=${resolved}` +
        (camoHex ? `  camo=${camoHex}` : '') +
        `\n      rms ${player.rms.toFixed(3)}${passFloor ? '' : ' <FLOOR ' + FLOOR}` +
        `   michelson ${player.michelson.toFixed(3)} (reported only)` +
        `   box ${player.boxMean.toFixed(3)} vs ring ${player.ringMean.toFixed(3)}` +
        `\n      best enemy aircraft ${bestAir ? bestAir.shape + ' ' + bestAir.rms.toFixed(3) : 'none'}` +
        `${passAir ? '' : '  <-- OUT-READS THE PLAYER'}   (rank vs all actors incl. ground: ${groundRank}/${r.targets.length}, informational)`);
    }
  }
} finally {
  close();
}

const verdict = fails === 0;
console.log(`\n${verdict ? 'GATE PASS' : 'GATE FAIL'}  ${rows.length - fails}/${rows.length} cases` +
  (SABOTAGE ? '   [SABOTAGE RUN — a PASS here means the gate is worthless]' : ''));
if (has('--json')) console.log(JSON.stringify(rows, null, 1));
process.exit(verdict ? 0 : 1);
