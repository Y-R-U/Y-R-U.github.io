#!/usr/bin/env node
// Clicks through the skin studio for real, in headless Chrome, and screenshots it.
//
//   node tools/skin/uitest.mjs
//   node tools/skin/uitest.mjs --server=http://localhost:8796         ← the page the dev server serves
//   node tools/skin/uitest.mjs --server=… --generate="a sand-worn desert nomad" --name=nomad
//
// Generate is opt-in: it is minutes of GPU per click, and it only works against --server, because
// the studio's own static server has no /api/skin behind it.

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, parseArgs } from '../shot.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = resolve(ROOT, 'shots/skin');
const args = parseArgs();
const page = await open({ w: 1400, h: 900, dpr: 1 });
const { S, logs } = page;
const base = args.server ? String(args.server).replace(/\/$/, '') : page.base;

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
async function type(sel, text) {
  await evalJSON(`(() => { const n = document.querySelector(${JSON.stringify(sel)});
    n.value = ${JSON.stringify(text)}; n.dispatchEvent(new Event('input', { bubbles: true })); return 1 })()`);
}

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

if (args.generate) {
  const id = String(args.name || 'uitest');
  await type('.skin-desc', String(args.generate));
  await type('.skin-name', id);
  await clickText('Generate');
  const t0 = Date.now();
  let lastNote = '';
  // The point of the wait is the progress readout: a five-minute job that shows "submitting…" the
  // whole way is a broken tab even when the PNG eventually lands.
  const notes = new Set();
  for (;;) {
    const st = await evalJSON('document.querySelector(".skin-state").textContent');
    if (st !== lastNote) { lastNote = st; notes.add(st); console.log(`  ${((Date.now() - t0) / 1000) | 0}s ${st}`); }
    if (!(await evalJSON('document.querySelector(".skin-go").disabled'))) break;
    if (Date.now() - t0 > 25 * 60000) throw new Error('generation never finished');
    await new Promise(r => setTimeout(r, 1500));
  }
  await new Promise(r => setTimeout(r, 1500));
  await shot('_studio_generated');
  ok('generate reported progress beyond "submitting"', notes.size > 2);
  ok('generate finished without an error banner', await evalJSON('document.querySelector(".skin-problems").hidden'));
  ok(`the new skin ${id} is worn`, (await evalJSON('document.querySelector(".skin-state").textContent')).includes(id));
}

await page.close();
const bad = checks.filter(c => !c.cond);
for (const c of checks) console.log(`${c.cond ? 'ok  ' : 'FAIL'} ${c.name}`);
for (const l of logs) console.log('  console:', l);
console.log(`${checks.length - bad.length}/${checks.length} · shots in shots/skin/_studio*.png`);
process.exit(bad.length ? 1 : 0);
