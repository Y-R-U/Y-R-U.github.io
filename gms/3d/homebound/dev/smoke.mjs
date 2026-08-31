#!/usr/bin/env node
// Plays levels headlessly with NO help and asserts the core loop actually ran.
//
// This exists because `gate:pass` was never wired to `applyEffect` for the
// first eight commits: gates resolved, panels burst, sounds played, signs flew
// off — and the squad never changed. Every screenshot review missed it, because
// every review URL passed `?troops=N` and handed the run an army the gates
// never had to provide. So this harness passes NOTHING: fresh save, one man,
// and the only question it asks is "did the squad grow".
//
//   NODE_PATH=<puppeteer-core> node dev/smoke.mjs [--levels 1,2,6,12] [--steps 2600]

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let puppeteer;
try {
  puppeteer = require(process.env.HB_PUPPETEER || 'puppeteer-core');
} catch {
  // Cost a whole 4-level run once. puppeteer-core is deliberately not vendored
  // into this repo (no npm here), so it only resolves via NODE_PATH.
  console.error('smoke: cannot resolve puppeteer-core. See dev/README.md — set\n'
    + '  NODE_PATH=<...>/scratchpad/pup/node_modules');
  process.exit(2);
}

const CHROME = process.env.HB_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.HB_BASE || 'http://localhost:8899/gms/3d/homebound/index.html';
const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : args[i + 1]; };
// `12:108` means "level 12, played by someone with 108 power" — `?pow` grants
// the upgrade spread a player of that power would actually own. A bare number
// means a FRESH SAVE: one man, nothing bought. That is the real test of the
// core loop, and it is only a fair test on the opening levels — c1l12 has a
// required power of 108 and is supposed to beat a player who shows up cold.
// Only the first two levels stay cold. Combat itself is NOT seeded — bullet
// spread and enemy fire are live randomness — so a level sitting on the
// win/lose knife edge flips between runs and the harness reads as flaky when
// it is really reporting a fair fight. Cold levels must be ones a fresh save
// wins comfortably, not ones it wins sometimes.
// The required power for a level is the `req` column of the balance harness.
const LEVELS = String(flag('levels', '1,2,6:54,12:108,20:180')).split(',').map((t) => {
  const [lv, pow] = t.split(':');
  return { lv: Number(lv), pow: Number(pow) || 0 };
});
const STEPS = Number(flag('steps', 2600));

// A browser PER LEVEL. Sharing one across a run died on the fourth page with
// `Target.createTarget: Target closed` — swiftshader accumulates and the whole
// browser goes, not just the tab. Launching costs a couple of seconds; losing
// the back half of every run costs the run.
const launch = () => puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  // Frames are stepped in CHUNKS (see below), so no single evaluate is long.
  // This is only headroom for a slow chunk on a busy level.
  protocolTimeout: 300000,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});

let failures = 0;
for (const { lv, pow } of LEVELS) {
  const browser = await launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  // A renderer that dies takes the whole harness with it otherwise, and the
  // remaining levels never get played.
  page.on('error', (e) => errs.push(`renderer died: ${e.message}`));

  // `wipe` makes every run a first run, the way a player in a private window
  // sees it. No `troops`, no `tier`, no `pow`.
  // `auto` hands the squad to the same AI thumb the main screen's attract mode
  // uses. Without it the harness holds the stick dead straight and eats
  // whatever happens to be in the centre lane — at c1l12 that meant taking
  // three gates, banking 336 in cash and never gaining a single man. A player
  // steers. The AI steering badly is itself the finding: if it cannot find a
  // line through a level, the level has no line in it.
  await page.goto(`${BASE}?dev&auto&wipe&start=run&level=${lv}${pow ? `&pow=${pow}` : ''}`, { waitUntil: 'load', timeout: 45000 });
  await page.waitForFunction('window.__hb && window.__hb.ready', { timeout: 40000, polling: 250 });

  let r = null, crash = null;
  try {
    // Step in CHUNKS. One evaluate holding 2600 software-GL frames blew the
    // protocol timeout on the busier levels and puppeteer reported it as
    // `Target closed` — a harness stall wearing a crash's clothes. Nothing is
    // slower about many short calls, and a stuck level now fails as a stuck
    // level.
    await page.evaluate(() => {
      // Simulate, don't draw. See render.js:setDrawing.
      window.__hb.setDrawing?.(false);
      const seen = { pass: 0, apply: 0, count: 0, grow: 0, kills: 0, beats: 0, blocked: 0 };
      window.__smoke = { seen, start: window.__hb.state.troops };
      window.__hb.bus.on('gate:pass', () => seen.pass++);
      window.__hb.bus.on('effect:apply', () => seen.apply++);
      window.__hb.bus.on('gate:grow', () => seen.grow++);
      window.__hb.bus.on('army:count', (e) => { if (e.delta) seen.count++; });
    });

    const CHUNK = 200;
    for (let done = 0; done < STEPS; done += CHUNK) {
      const over = await page.evaluate((n) => {
        for (let i = 0; i < n; i++) {
          // Story beats HOLD the run until the player taps. A headless player
          // never taps, so the squad stands at z=1 for the whole run and every
          // assertion below fails for a reason that has nothing to do with the
          // core loop. Tap the card the way a thumb does, through the real
          // listener.
        const layer = document.querySelector('#bubble-layer');
        if (layer && layer.classList.contains('on')) {
          // Tap through REAL hit-testing: elementFromPoint respects
          // pointer-events, which dispatchEvent on the layer does not. The card
          // spent a release un-dismissable because `#hud > *` is
          // pointer-events:none — and the harness passed the whole time,
          // because firing the event at the node skips the hit test a thumb
          // cannot skip.
          const cx = innerWidth / 2, cy = innerHeight / 2;
          const hit = document.elementFromPoint(cx, cy);
          if (hit && hit.closest('#bubble-layer')) {
            hit.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
            window.__smoke.seen.beats++;
          } else {
            window.__smoke.seen.blocked++;
          }
        }
          window.__hb.step(1 / 60);
        }
        return window.__hb.state.result != null;
      }, CHUNK);
      if (over) break;                 // the run ended; stop burning frames
    }

    r = await page.evaluate(() => {
      // One real frame at the end, so the draw-call budget is still measured.
      window.__hb.setDrawing?.(true);
      window.__hb.step(1 / 60);
      const st = window.__hb.state;
      return { start: window.__smoke.start, end: st.troops, peak: st.peakTroops,
               z: Math.round(st.z), len: st.level?.length || 0, result: st.result,
               seen: window.__smoke.seen, cash: st.cash,
               calls: window.__hb.drawCalls() };
    });
    await page.close();
  } catch (e) {
    crash = e.message.split('\n')[0];
    try { await page.close(); } catch {}
  }
  if (!r) { r = { start: 1, end: 0, peak: 0, z: 0, len: 0, result: null,
                  seen: { pass: 0, apply: 0, grow: 0, beats: 0 }, cash: 0, calls: 0 };
            errs.unshift(crash || 'no result'); }

  // The assertions that would have caught the bug.
  const bad = [];
  if (r.seen.pass === 0) bad.push('no gate was ever taken');
  if (r.seen.apply < r.seen.pass) bad.push(`${r.seen.pass} gates taken but only ${r.seen.apply} applied`);
  if (r.peak <= r.start) bad.push(`squad never grew (${r.start} -> peak ${r.peak})`);
  if (r.seen.grow === 0) bad.push('no gate ever grew under fire');
  if (r.result == null) bad.push(`run never ended (z ${r.z}/${r.len})`);
  // A beat card that is on screen but NOT the element under the middle of the
  // screen cannot be tapped by a thumb. This is the assertion that would have
  // caught the un-dismissable story panel.
  if (r.seen.blocked) bad.push(`story card unreachable by a real tap on ${r.seen.blocked} frames`);
  if (errs.length) bad.push(`console: ${errs[0]}`);

  const tag = bad.length ? 'FAIL' : ' ok ';
  console.log(`[${tag}] c1l${String(lv).padEnd(3)} ${(pow ? `pow ${pow}` : 'cold').padEnd(8)} ${r.start} -> ${r.end} (peak ${r.peak})  ` +
              `gates ${r.seen.pass}/${r.seen.apply} grown ${r.seen.grow}  ` +
              `cash ${r.cash}  beats ${r.seen.beats}  ${r.result || '—'}  ${r.calls} calls`);
  for (const m of bad) console.log(`        ${m}`);
  if (bad.length) failures++;
  try { await browser.close(); } catch {}
}

console.log(failures ? `\n${failures}/${LEVELS.length} FAILED` : `\nall ${LEVELS.length} passed`);
process.exit(failures ? 1 : 0);
