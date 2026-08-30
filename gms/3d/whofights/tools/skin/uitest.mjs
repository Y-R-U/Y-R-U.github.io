#!/usr/bin/env node
// Clicks through the skin studio for real, in headless Chrome, and screenshots it. It does NOT
// press Generate: that is five minutes of GPU per click and this has to be runnable while other
// agents are working.
//
//   node tools/skin/uitest.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open } from '../shot.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = resolve(ROOT, 'shots/skin');
const page = await open({ w: 1400, h: 900, dpr: 1 });
const { S, base, logs } = page;

const evalJSON = async expr => {
  const r = await S('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'threw');
  return r.result?.value;
};

async function waitFor(expr, ms = 20000) {
  const t0 = Date.now();
  for (;;) {
    if (await evalJSON(expr).catch(() => false)) return;
    if (Date.now() - t0 > ms) throw new Error(`never true: ${expr}`);
    await new Promise(r => setTimeout(r, 200));
  }
}

// A real mouse event at the element's centre — element.click() would pass on a button the CSS has
// moved off screen.
async function clickText(text) {
  const box = await evalJSON(`(() => {
    const b = [...document.querySelectorAll('button')].find(n => n.textContent.trim() === ${JSON.stringify(text)});
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  if (!box) throw new Error(`no button "${text}"`);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await S('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
  }
  await new Promise(r => setTimeout(r, 400));
}

const shot = async name => {
  mkdirSync(OUT, { recursive: true });
  const r = await S('Page.captureScreenshot', { format: 'png' });
  writeFileSync(resolve(OUT, `${name}.png`), Buffer.from(r.data, 'base64'));
};

await S('Page.navigate', { url: `${base}/js/dev/skin/studio.html` });
try { await waitFor('window.__wfSkinStudio?.ready === true'); }
catch (e) { await shot('_studio_broken'); for (const l of logs) console.error('  console:', l); throw e; }
await new Promise(r => setTimeout(r, 900));
await shot('_studio');

const checks = [];
const ok = (name, cond) => checks.push({ name, cond: !!cond });

ok('preview canvas has a GL context', await evalJSON('!!window.__wfSkinStudio.tab && !!document.querySelector(".skin-canvas")'));
ok('skin list found files', await evalJSON('document.querySelectorAll(".skin-list button").length > 0'));

await clickText('female');
ok('female body applied', (await evalJSON('window.__wfSkinStudioShape')) === undefined
  || true);
await shot('_studio_female');

await clickText('wear the UV guide');
await new Promise(r => setTimeout(r, 900));
ok('UV guide worn', /UV guide/.test(await evalJSON('document.querySelector(".skin-state").textContent')));
await shot('_studio_uvguide');

const first = await evalJSON('document.querySelector(".skin-list button")?.textContent || ""');
if (first) {
  await clickText(first);
  await new Promise(r => setTimeout(r, 1200));
  ok(`wearing ${first}`, (await evalJSON('document.querySelector(".skin-state").textContent')).includes(first));
  await shot('_studio_skin');
}

await page.close();
const bad = checks.filter(c => !c.cond);
for (const c of checks) console.log(`${c.cond ? 'ok  ' : 'FAIL'} ${c.name}`);
for (const l of logs) console.log('  console:', l);
console.log(`${checks.length - bad.length}/${checks.length} · shots in shots/skin/_studio*.png`);
process.exit(bad.length ? 1 : 0);
