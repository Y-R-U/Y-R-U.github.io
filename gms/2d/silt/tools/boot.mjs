#!/usr/bin/env node
// Boot + soak gate. Does the page actually come up, does the sim actually
// advance, and does it survive a few thousand frames on a phone-sized viewport?
//
//   node tools/boot.mjs                 headless boot + soak + capture
//   node tools/boot.mjs --gpu           real GPU (ANGLE Metal); the only honest timings
//   node tools/boot.mjs --falsify       break the page on purpose; every check MUST go red
//
// Always ?preserve=1&dpr=1 headless: captureScreenshot hangs on an animating
// WebGL canvas, and dpr 2 under SwiftShader takes minutes a frame.

import { harness } from './cdp.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, '../../../..');            // repo root, so /lib/auth resolves
const args = process.argv.slice(2);
const GPU = args.includes('--gpu');
// Each arm breaks ONE real thing, so each check gets proven capable of failing.
// The first attempt at this assigned to window.__state — which is an accessor
// property, so the assignment silently did nothing and every check stayed green.
// That is the exact failure this arm exists to catch, so it is worth the comment.
const fi = args.indexOf('--falsify');
const SOAK = args.includes('--soak') ? 3600 : 700;   // frames; --soak for the long run
const FALSIFY = fi >= 0 ? (args[fi + 1] && !args[fi + 1].startsWith('--') ? args[fi + 1] : 'boot') : null;

const fails = [];
const check = (name, ok, detail = '') => {
  if (!ok) fails.push(`${name}${detail ? ': ' + detail : ''}`);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};

const { cdp, base, close } = await harness({ root: SITE, gpu: GPU });
mkdirSync(join(HERE, '../shots'), { recursive: true });

try {
  await cdp.viewport(390, 844, 1, true);           // a real iPhone 14, not Chrome's 500px lie
  if (FALSIFY === 'boot') {
    // stop the module graph from loading at all
    await cdp.send('Network.setBlockedURLs', { urls: ['*/silt/js/main.js'] });
  }
  const url = `${base}/gms/2d/silt/index.html?preserve=1&dpr=1&auto&mode=flow&seed=12345`;
  await cdp.goto(url);
  if (FALSIFY === 'freeze') {
    await cdp.waitFor('window.__game && window.__game.world', 8000);
    await cdp.eval('window.__game.world.tick = function () {}');
  }
  if (FALSIFY === 'error') {
    await cdp.eval('setTimeout(function () { throw new Error("deliberate falsification error"); }, 0)');
  }

  const booted = await cdp.waitFor('window.__state && window.__state.state === "play"', 12000);
  check('boots into play', booted);

  const s0 = await cdp.state();
  await cdp.frames(180);
  const s1 = await cdp.state();

  check('sim advances', !!(s0 && s1 && s1.ticks > s0.ticks), s0 && s1 ? `${s0.ticks} -> ${s1.ticks}` : 'no state');
  check('renders frames', !!(s1 && s1.fps > 5), s1 ? `${s1.fps} fps` : '');
  check('piece exists or board busy', !!(s1 && (s1.piece || s1.cells > 0)), s1 ? `cells ${s1.cells}` : '');

  // A reload loop is the classic silent failure: the page "works" every time you
  // look at it because it just restarted.
  const docs = cdp.requests.filter((r) => String(r.url || r).includes('/silt/js/main.js')).length;
  check('no reload loop', docs >= 1 && docs <= 2, `${docs} main.js fetches`);

  const errs = cdp.errors.filter((e) => !/favicon/i.test(String(e)));
  check('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));

  await cdp.frames(SOAK);
  const s2 = await cdp.state();
  check(`survives ${SOAK} frames`, !!(s2 && s2.ticks > s1.ticks), s2 ? `ticks ${s2.ticks}` : 'dead');
  check('mass ledger sane', !!(s2 && s2.cells >= 0 && s2.cells <= 112 * 224), s2 ? `cells ${s2.cells}` : '');

  if (s2 && s2.placeholder) console.log('\n  NOTE: still on the PLACEHOLDER Canvas2D renderer (js/gfx/renderer.js absent).');

  await cdp.capture(join(HERE, '../shots/boot.png'), 'canvas');
  console.log(`\n  state: ${JSON.stringify({ ticks: s2?.ticks, score: s2?.score, chains: s2?.chains, cells: s2?.cells, fps: s2?.fps, tier: s2?.gfx?.tier })}`);
} finally {
  close();
}

if (fails.length) {
  console.log('\nFAIL\n' + fails.map((f) => '  x ' + f).join('\n'));
  console.log(FALSIFY ? `  (expected — falsify arm "${FALSIFY}" correctly tripped a check)` : '');
  process.exit(FALSIFY ? 0 : 1);
} else {
  console.log('\nPASS');
  if (FALSIFY) { console.log(`  !! falsify arm "${FALSIFY}" did NOT trip a check — that check is not testing what it claims`); process.exit(1); }
}
