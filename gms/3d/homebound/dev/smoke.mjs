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
const puppeteer = require(process.env.HB_PUPPETEER || 'puppeteer-core');

const CHROME = process.env.HB_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.HB_BASE || 'http://localhost:8899/gms/3d/homebound/index.html';
const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : args[i + 1]; };
const LEVELS = String(flag('levels', '1,2,6,12,20')).split(',').map(Number);
const STEPS = Number(flag('steps', 2600));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  // 2600 software-GL frames is minutes, not seconds. The default 180s protocol
  // timeout kills the evaluate mid-level and reports it as a crash.
  protocolTimeout: 900000,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});

let failures = 0;
for (const lv of LEVELS) {
  const page = await browser.newPage();
  await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

  // `wipe` makes every run a first run, the way a player in a private window
  // sees it. No `troops`, no `tier`, no `pow`.
  await page.goto(`${BASE}?dev&wipe&start=run&level=${lv}`, { waitUntil: 'load', timeout: 45000 });
  await page.waitForFunction('window.__hb && window.__hb.ready', { timeout: 40000, polling: 250 });

  const r = await page.evaluate(async (steps) => {
    const seen = { pass: 0, apply: 0, count: 0, grow: 0, kills: 0 };
    window.__hb.bus.on('gate:pass', () => seen.pass++);
    window.__hb.bus.on('effect:apply', () => seen.apply++);
    window.__hb.bus.on('gate:grow', () => seen.grow++);
    window.__hb.bus.on('army:count', (e) => { if (e.delta) seen.count++; });
    const start = window.__hb.state.troops;
    for (let i = 0; i < steps; i++) window.__hb.step(1 / 60);
    const st = window.__hb.state;
    return { start, end: st.troops, peak: st.peakTroops, z: Math.round(st.z),
             len: st.level?.length || 0, result: st.result, seen, cash: st.cash,
             calls: window.__hb.drawCalls() };
  }, STEPS);
  await page.close();

  // The assertions that would have caught the bug.
  const bad = [];
  if (r.seen.pass === 0) bad.push('no gate was ever taken');
  if (r.seen.apply < r.seen.pass) bad.push(`${r.seen.pass} gates taken but only ${r.seen.apply} applied`);
  if (r.peak <= r.start) bad.push(`squad never grew (${r.start} -> peak ${r.peak})`);
  if (r.seen.grow === 0) bad.push('no gate ever grew under fire');
  if (r.result == null) bad.push(`run never ended (z ${r.z}/${r.len})`);
  if (errs.length) bad.push(`console: ${errs[0]}`);

  const tag = bad.length ? 'FAIL' : ' ok ';
  console.log(`[${tag}] c1l${String(lv).padEnd(3)} ${r.start} -> ${r.end} (peak ${r.peak})  ` +
              `gates ${r.seen.pass}/${r.seen.apply} grown ${r.seen.grow}  ` +
              `cash ${r.cash}  ${r.result || '—'}  ${r.calls} calls`);
  for (const m of bad) console.log(`        ${m}`);
  if (bad.length) failures++;
}

await browser.close();
console.log(failures ? `\n${failures}/${LEVELS.length} FAILED` : `\nall ${LEVELS.length} passed`);
process.exit(failures ? 1 : 0);
