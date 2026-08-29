#!/usr/bin/env node
// Headless frame grabber. rAF is throttled in a hidden page, so we do NOT rely
// on the page's own loop: we call window.__hb.step(dt) a fixed number of times
// and screenshot the deterministic result. That makes every shot reproducible
// and lets a review agent compare two builds frame for frame.
//
//   node dev/shot.mjs '?dev&level=3' out.png [--steps 240] [--w 430] [--h 932]
//
// NODE_PATH must reach a puppeteer-core install; see dev/README.md.

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const PUP = process.env.HB_PUPPETEER || 'puppeteer-core';
const puppeteer = require(PUP);

const CHROME = process.env.HB_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.HB_BASE || 'http://localhost:8899/gms/3d/homebound/index.html';

const args = process.argv.slice(2);
const suffix = args[0] || '';
const out = args[1] || 'shot.png';
const flag = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : Number(args[i + 1]); };
const steps = flag('steps', 240);
const W = flag('w', 430), H = flag('h', 932);
const dt = flag('dt', 1 / 60);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--disable-gpu-sandbox', '--hide-scrollbars', '--mute-audio',
         `--window-size=${W},${H}`],
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

const url = BASE + (suffix.startsWith('?') || suffix === '' ? suffix : '?' + suffix);
await page.goto(url, { waitUntil: 'load', timeout: 45000 });

// Wait for the game to publish its debug handle.
try {
  await page.waitForFunction('window.__hb && window.__hb.ready', { timeout: 40000, polling: 250 });
} catch (e) {
  logs.push('[harness] window.__hb.ready never appeared');
}

await page.evaluate(async (n, d) => {
  if (!window.__hb?.step) { await new Promise((r) => setTimeout(r, 2500)); return; }
  for (let i = 0; i < n; i++) window.__hb.step(d);
}, steps, dt);

await new Promise((r) => setTimeout(r, 250));
await page.screenshot({ path: out });
await browser.close();

const bad = logs.filter((l) => /pageerror|\[error\]|Failed to|Uncaught/i.test(l));
console.log(`shot → ${out}  (${steps} steps, ${W}x${H})`);
if (logs.length) console.log('--- console ---\n' + logs.slice(0, 60).join('\n'));
process.exit(bad.length ? 2 : 0);
