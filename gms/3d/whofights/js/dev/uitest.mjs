// Opens the hub in headless Chrome, clicks through both real tabs, edits a scratch level document,
// saves it and checks the bytes on disk changed.
//
//   node tools/devserver.mjs &
//   node js/dev/uitest.mjs [outdir] [baseurl]
//
// It writes and then deletes data/levels/__uitest.json. Never point it at a real document: the
// Data tab saves what it is given, and this file's first version overwrote a seeded one.

import { launch, attach, sleep } from './cdp.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = process.argv[2] || '/tmp/wf-devshots';
const BASE = process.argv[3] || 'http://localhost:8796';
const PAGE = fs.existsSync(path.join(ROOT, 'index.html')) ? '/index.html' : '/js/dev/selftest.html';
const SCRATCH = path.join(ROOT, 'data/levels/__uitest.json');

fs.mkdirSync(OUT, { recursive: true });
let fails = 0;
const check = (cond, what) => { console.log(`${cond ? ' ok ' : 'FAIL'}  ${what}`); if (!cond) fails++; };

const { proc, port } = await launch({});
const p = await attach(port, BASE + PAGE);
// The real index.html boots an engine first; the button appears when main.js reaches bootDev.
check(await p.waitFor('!!document.getElementById("wf-dev-btn")'), 'DEV button exists on a local origin');
await p.shot(`${OUT}/1-game.png`);

const before = await p.eval('window.__wf?.app?.frames ?? null');
await p.click('#wf-dev-btn');
await sleep(1500);
check(await p.eval('!!document.querySelector("#wf-dev:not(.hidden)")'), 'hub opens');
const tabs = await p.eval('[...document.querySelectorAll("#wf-dev nav button")].map(b=>b.textContent.trim())');
check(tabs.length >= 7, `all seven tab slots present (${tabs.join(', ')})`);
if (before !== null) {
  await sleep(700);
  const a = await p.eval('window.__wf.app.frames');
  await sleep(700);
  check(a === await p.eval('window.__wf.app.frames'), 'the game loop is paused while the hub is open');
}
await p.shot(`${OUT}/2-status.png`);

await p.clickText('#wf-dev nav button', 'Data');
await sleep(1200);
await p.eval(`(()=>{const i=document.querySelector('#wf-dev [data-role=newlevel]');i.value='__uitest';})()`);
await p.clickText('#wf-dev .side .row button', '+');
await sleep(800);
const doc = { version: 3, id: '__uitest', name: `written ${new Date().toISOString()}`, objects: [],
  hotspots: [{ id: 'hs.probe', shape: { k: 'circle', x: 0, z: 0, r: 3 }, trigger: 'enter', actions: [{ k: 'flag', name: 'probe', value: true }] }] };
await p.eval(`(()=>{const t=document.querySelector('#wf-dev textarea');
  t.value=${JSON.stringify(JSON.stringify(doc, null, 2))};t.dispatchEvent(new Event('input',{bubbles:true}));})()`);
await sleep(300);
check(/^valid levels document/.test(await p.eval('document.querySelector("#wf-dev [data-role=problems]").textContent.trim()')), 'the document validates');
await p.clickText('#wf-dev .main button', 'Save');
await sleep(1500);
check(fs.existsSync(SCRATCH) && JSON.parse(fs.readFileSync(SCRATCH, 'utf8')).name === doc.name, 'the bytes on disk changed');
await p.shot(`${OUT}/3-saved.png`);

await p.eval(`(()=>{const t=document.querySelector('#wf-dev textarea');t.value='{ nope ';t.dispatchEvent(new Event('input',{bubbles:true}));})()`);
await sleep(300);
await p.clickText('#wf-dev .main button', 'Save');
await sleep(600);
check(/will not save invalid JSON/.test(await p.eval('[...document.querySelectorAll("#wf-dev .toast")].map(t=>t.textContent).join(" ")')), 'invalid JSON is refused');
await p.clickText('#wf-dev .main button', 'Revert');
await sleep(600);

await p.clickText('#wf-dev nav button', 'Level editor');
await sleep(600);
check(/not built yet/.test(await p.eval('document.querySelector("#wf-dev main").textContent')), 'an unbuilt tab shows its placeholder');
await p.shot(`${OUT}/4-placeholder.png`);

await p.clickText('#wf-dev nav button', 'Status');
await sleep(1500);
await p.shot(`${OUT}/5-status.png`);

await p.key('Escape', 'Escape');
await sleep(800);
check(await p.eval('!!document.querySelector("#wf-dev.hidden")'), 'Escape closes the hub');
if (before !== null) {
  const r1 = await p.eval('window.__wf.app.frames');
  await sleep(700);
  check(await p.eval('window.__wf.app.frames') > r1, 'the game loop resumes');
}
await p.key('`', 'Backquote');
await sleep(800);
check(await p.eval('!!document.querySelector("#wf-dev:not(.hidden)")'), 'the backquote shortcut reopens it');

const noise = /favicon|js\/dev\/tabs\//;
const logs = p.logs().filter(l => /error|exception/i.test(l.level) && !noise.test(l.text));
for (const l of logs) console.log(`      [${l.level}] ${l.text.slice(0, 160)}`);
check(!logs.length, 'no unexpected console errors');

fs.rmSync(SCRATCH, { force: true });
console.log(`\nshots in ${OUT} — look at them.  ${fails ? `${fails} FAILED` : 'all checks passed'}`);
p.close();
proc.kill();
process.exit(fails ? 1 : 0);
