#!/usr/bin/env node
// Boot + soak gate. Does the page actually come up, does the sim actually
// advance, and does it survive a few thousand frames on a phone-sized viewport?
//
//   node tools/boot.mjs                 headless boot + soak + capture
//   node tools/boot.mjs --gpu           real GPU (ANGLE Metal); the only honest timings
//   node tools/boot.mjs --falsify       break the page on purpose; every check MUST go red
//   node tools/boot.mjs --falsify vent  leave an exhausted attract board running
//   node tools/boot.mjs --falsify context   lose the GPU context, do not rebuild
//   node tools/boot.mjs --falsify ledger    poke g.count behind the ledger's back
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
// The renderer must be the REAL one. main.js falls back to the Canvas2D
// placeholder whenever js/gfx/renderer.js fails to load, which means a syntax
// error in the renderer produced a fully green boot gate — eight checks ok,
// exit 0 — with the game drawing the exact pixel look this project exists to
// avoid. Documenting "check the flag" was not enough; assert it.
const ALLOW_PLACEHOLDER = args.includes('--allow-placeholder');
const SOAK = args.includes('--soak') ? 3600 : 700;   // frames; --soak for the long run
const FALSIFY = fi >= 0 ? (args[fi + 1] && !args[fi + 1].startsWith('--') ? args[fi + 1] : 'boot') : null;

/**
 * How much of the canvas is actually LIT, sampled through a 64x64 downscale.
 * ?preserve=1 is what makes the drawing buffer readable at all; without it the
 * canvas is legitimately blank by the time anything can look at it.
 */
const PIXELS = `(() => {
  const c = document.getElementById('game');
  const t = document.createElement('canvas'); t.width = 64; t.height = 64;
  const x = t.getContext('2d');
  x.drawImage(c, 0, 0, 64, 64);
  const d = x.getImageData(0, 0, 64, 64).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 24) n++;
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
  if (FALSIFY === 'placeholder') {
    await cdp.send('Network.setBlockedURLs', { urls: ['*/silt/js/gfx/renderer.js'] });
    await cdp.goto(url);
    await cdp.waitFor('window.__state && window.__state.state === "play"', 12000);
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
  // A REAL LEDGER CHECK. This was `cells >= 0 && cells <= 112*224` — a bounds
  // test wearing a ledger's name. Setting g.count to 7 on a live 512-cell board
  // left it green, and the hardcoded 112x224 is not even the board any more:
  // JELLY is 88x192 and ALCHEMY runs 80x160 to 104x208. Ask the grid to count
  // itself, which is what tools/sim.mjs has always done.
  if (FALSIFY === 'ledger') await cdp.eval('window.__game.world.g.count = 7');
  const ledger = await cdp.eval(`(() => { const g = window.__game.world.g;
    return JSON.stringify({ count: g.count, real: g.recount(), cols: g.cols, rows: g.rows }); })()`);
  const L = JSON.parse(ledger);
  check('mass ledger honest', L.count === L.real && L.count <= L.cols * L.rows,
    `${L.count} vs ${L.real} counted, board ${L.cols}x${L.rows}`);

  check('real renderer, not the placeholder',
    ALLOW_PLACEHOLDER || !(s2 && s2.placeholder),
    s2 && s2.placeholder ? 'js/gfx/renderer.js failed to load — game is drawing cells' : `tier ${s2 && s2.gfx && s2.gfx.tier}`);

  // ------------------------------------------------------------- GPU context
  // THE FPS COUNTER IS NOT A PIXEL. `renders frames` reads main.js's rAF
  // counter, which keeps ticking happily on a canvas that has drawn nothing
  // since the GPU context went away — and a lost context IS permanent unless
  // something rebuilds: the renderer stops on webglcontextlost and there was
  // nothing to clear the flag. Every check in this gate stayed green on a
  // completely black screen. So count the pixels, then take the context away
  // and count them again.
  {
    const bug = FALSIFY === 'context' ? '&ctxbug=1' : '';
    await cdp.goto(`${base}/gms/2d/silt/index.html?preserve=1&dpr=1&auto&mode=flow&seed=99${bug}`);
    await cdp.waitFor('window.__state && window.__state.state === "play"', 12000);
    await cdp.frames(90);
    const lit = await cdp.eval(PIXELS);
    check('the canvas is actually drawing', lit > 200, `${lit} of 4096 sampled pixels lit`);

    // Keep the extension INSTANCE. restoreContext() on a freshly fetched handle
    // is silently a no-op in Chrome — the event never fires and the recovery
    // looks broken when it is the test that is. It also needs real wall-clock
    // time either side, not frames.
    await cdp.eval(`(() => { const gl = document.getElementById('game').getContext('webgl2');
      window.__lose = gl && gl.getExtension('WEBGL_lose_context');
      if (window.__lose) window.__lose.loseContext(); return !!window.__lose; })()`);
    await new Promise((r) => setTimeout(r, 300));
    const black = await cdp.eval(PIXELS);
    await cdp.eval('window.__lose && window.__lose.restoreContext()');
    await new Promise((r) => setTimeout(r, 1500));
    await cdp.frames(60);
    const after = await cdp.eval(PIXELS);
    const st = await cdp.state();
    check('a lost GPU context is rebuilt, not left black',
      after > 200 && !!(st && st.restores >= 1),
      `${black} lit while lost, ${after} of 4096 lit after, ${st ? st.restores : '?'} rebuild(s)`);
  }

  // ---------------------------------------------------------------- attract
  // The title screen must never show the sim in trouble. ZEN has no fail state
  // — its ceiling vents, erasing the top 26 rows and playing on — so a full
  // board on the attract loop used to read as a band of sand being sliced flat
  // over and over while the run never ended. Pin the attract screen to ZEN,
  // fill the board, and the run must START AGAIN.
  {
    const bug = FALSIFY === 'vent' ? '&attractbug=vent' : '';
    await cdp.goto(`${base}/gms/2d/silt/index.html?preserve=1&dpr=1&soak&attract=zen&seed=7${bug}`);
    const up = await cdp.waitFor('window.__state && window.__state.state === "attract"', 12000);
    await cdp.frames(40);
    const a0 = await cdp.state();
    check('the title screen can be pinned to one mode', up && a0 && a0.mode === 'zen',
      a0 ? String(a0.mode) : 'no state');

    // Column-striped tints on purpose. A wall-to-wall band of ONE tint IS a
    // chain and dissolves on the first tick, which would empty the board this
    // check needs full; tints two columns apart can never connect, diagonals
    // included.
    const filled = await cdp.eval(`(() => {
      const w = window.__game.world, g = w.g;
      for (let y = 8; y < g.rows; y++)
        for (let x = 0; x < g.cols; x++) g.set(y * g.cols + x, 2, 4 + (x % 2));
      g.wakeAll(); w.piece = null; return g.count; })()`);
    await cdp.frames(150);
    const a1 = await cdp.state();
    // Count the RESTARTS, not the ticks. A restarted world's tick counter climbs
    // from zero, so 150 frames after a restart it reads higher than it did
    // before — the tick number cannot tell a fresh run from an unbroken one.
    check('a topped-out attract run restarts rather than venting',
      !!(a0 && a1 && a1.runs > a0.runs), a1 ? `run ${a0.runs} -> ${a1.runs}, filled ${filled}` : 'dead');
    check('the restarted run is playing, not stuck', !!(a1 && a1.state === 'attract' && a1.cells > 0),
      a1 ? `${a1.state}, ${a1.cells} cells` : 'dead');
  }

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
