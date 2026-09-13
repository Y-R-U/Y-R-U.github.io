#!/usr/bin/env node
// Boot + soak gate for NINE STRINGS.
//
//   node tools/boot.mjs                  headless boot + soak + capture
//   node tools/boot.mjs --gpu            real GPU (ANGLE Metal); the only honest timings
//   node tools/boot.mjs --soak           long run (3600 frames)
//   node tools/boot.mjs --allow-placeholder   tolerate the Canvas2D stand-in
//   node tools/boot.mjs --falsify [arm]  break something on purpose; checks MUST go red
//
// Falsify arms (a check never proven capable of failing is not evidence):
//   boot      block main.js entirely
//   module    block a mid-graph module, so `missing` should be non-empty
//   frozen    stop the sim advancing
//   blank     clear the canvas every frame
//
// Always ?preserve=1&dpr=1 headless: captureScreenshot hangs on an animating
// WebGL canvas, and DPR 2 under SwiftShader takes minutes a frame.

import { harness } from './cdp.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, '../../../..');            // repo root, so /lib/** resolves
const args = process.argv.slice(2);
const GPU = args.includes('--gpu');
const ALLOW_PLACEHOLDER = args.includes('--allow-placeholder');
const SOAK = args.includes('--soak') ? 3600 : 600;
const fi = args.indexOf('--falsify');
const FALSIFY = fi >= 0 ? (args[fi + 1] && !args[fi + 1].startsWith('--') ? args[fi + 1] : 'boot') : null;

const LIT = `(() => {
  const c = document.getElementById('game');
  const t = document.createElement('canvas'); t.width = 64; t.height = 64;
  const x = t.getContext('2d');
  x.drawImage(c, 0, 0, 64, 64);
  const d = x.getImageData(0, 0, 64, 64).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] + d[i+1] + d[i+2] > 24) n++;
  return n;
})()`;

const fails = [];
const check = (name, ok, detail = '') => {
  if (!ok) fails.push(`${name}${detail ? ': ' + detail : ''}`);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};

const { cdp, base, close } = await harness({ root: SITE, gpu: GPU });
mkdirSync(join(HERE, '../shots'), { recursive: true });

try {
  await cdp.viewport(390, 844, 1, true);      // a real iPhone 14, not Chrome's 500px lie

  if (FALSIFY === 'boot')   await cdp.send('Network.setBlockedURLs', { urls: ['*/ninestrings/js/main.js'] });
  if (FALSIFY === 'module') await cdp.send('Network.setBlockedURLs', { urls: ['*/ninestrings/js/gfx/renderer.js'] });

  const url = `${base}/gms/2d/ninestrings/index.html?preserve=1&dpr=1&auto&seed=12345`;
  console.log(`\nNINE STRINGS boot gate${FALSIFY ? `  [falsify: ${FALSIFY}]` : ''}${GPU ? '  [gpu]' : ''}`);
  console.log(`  ${url}\n`);
  await cdp.goto(url);

  const booted = await cdp.waitFor('!!window.__ns && window.__ns.ready', 12000).catch(() => false);
  check('page boots (window.__ns.ready)', !!booted);

  if (booted) {
    if (FALSIFY === 'frozen') await cdp.eval('window.__ns.paused = true');
    if (FALSIFY === 'blank')  await cdp.eval('window.__ns.renderer.end = () => { const c=document.getElementById("game"); const g=c.getContext("webgl2")||c.getContext("2d"); if(g.clearColor){g.clearColor(0,0,0,1);g.clear(g.COLOR_BUFFER_BIT);} else {g.clearRect(0,0,c.width,c.height);} }');

    const missing = await cdp.eval('window.__ns.missing.slice()');
    check('every module loaded', Array.isArray(missing) && missing.length === 0,
          missing && missing.length ? missing.join(' | ') : '');

    const real = await cdp.eval('!!window.__ns.real');
    check('real renderer (not the placeholder)', real || ALLOW_PLACEHOLDER,
          real ? '' : 'running the Canvas2D stand-in');

    await cdp.frames(30);
    const t0 = await cdp.eval('window.__ns.world ? window.__ns.world.tick : -1');
    check('a run exists', t0 >= 0, `tick=${t0}`);

    await cdp.frames(60);
    const t1 = await cdp.eval('window.__ns.world ? window.__ns.world.tick : -1');
    check('sim advances', t1 > t0, `${t0} -> ${t1}`);

    const t2 = Date.now();
    await cdp.frames(SOAK);
    const secs = (Date.now() - t2) / 1000;
    const t3 = await cdp.eval('window.__ns.world ? window.__ns.world.tick : -1');
    check(`soak ${SOAK} frames`, t3 > t1, `${secs.toFixed(1)}s, tick ${t3}`);

    const errs = cdp.errors.filter((e) => !/favicon/i.test(e));
    check('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));

    const lit = await cdp.eval(LIT);
    check('canvas is lit', lit > 40, `${lit}/4096 sample pixels`);

    const fps = await cdp.eval('window.__ns.loop ? Math.round(window.__ns.loop.fps) : 0');
    console.log(`  info  fps ${fps}${GPU ? '' : ' (swiftshader - not a real number)'}`);

    await cdp.capture(join(HERE, '../shots/boot.png'));
    console.log('  info  shots/boot.png');
  }
} finally {
  close();
}

if (FALSIFY) {
  // Inverted: with something deliberately broken, at least one check MUST fail.
  const ok = fails.length > 0;
  console.log(`\n${ok ? 'FALSIFY OK' : 'FALSIFY FAILED'} - ${fails.length} check(s) went red${ok ? '' : ' (the gate cannot detect this break)'}`);
  process.exit(ok ? 0 : 1);
}
console.log(`\n${fails.length ? `${fails.length} FAILED` : 'all checks passed'}`);
process.exit(fails.length ? 1 : 0);
