// Drives the level editor tab in headless Chrome with real clicks and real drags, then checks the
// bytes on disk changed and the game's own hotspot runtime fires what was drawn.
//
//   node tools/devserver.mjs &
//   node js/dev/level/uitest.mjs /tmp/wf-level-shots
//
// Everything it writes goes to data/levels/__scratch.json and one extra row in the level index,
// both of which it puts back at the end. It never touches a real level.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, attach, sleep } from '../cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SHOTS = process.argv[2] || '/tmp/wf-level-shots';
const BASE = process.env.WF_BASE || 'http://127.0.0.1:8796';
const SCRATCH = path.join(ROOT, 'data/levels/__scratch.json');
const INDEX = path.join(ROOT, 'data/levels/index.json');

fs.mkdirSync(SHOTS, { recursive: true });
const indexBefore = fs.readFileSync(INDEX, 'utf8');

let pass = 0;
const fails = [];
const ok = (why, cond) => (cond ? (pass++, console.log(`  ok   ${why}`)) : fails.push(why));
const eq = (why, got, want) => ok(`${why} (got ${JSON.stringify(got)})`, JSON.stringify(got) === JSON.stringify(want));

const shots = [];
async function shot(p, name) {
  const f = path.join(SHOTS, `${name}.png`);
  await p.shot(f);
  shots.push(f);
  return f;
}

// A press-move-release on the canvas, in CSS pixels — the only way to prove a drag works.
async function drag(p, from, to, steps = 8) {
  await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from[0], y: from[1], button: 'left', buttons: 1, clickCount: 1 });
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'left', buttons: 1,
      x: from[0] + (to[0] - from[0]) * t, y: from[1] + (to[1] - from[1]) * t });
    await sleep(20);
  }
  await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to[0], y: to[1], button: 'left', buttons: 0, clickCount: 1 });
  await sleep(250);
}

const chrome = await launch({ port: 9345, profile: '/tmp/wf-level-cdp', w: 1500, h: 950 });
let page;
try {
  page = await attach(9345, `${BASE}/`);
  await page.waitFor('!!window.__wf && window.__wf.ready === true', 45000)
    || fails.push('the game never booted');
  ok('the game booted', await page.eval('!!window.__wf?.ready'));
  await page.waitFor('!!document.getElementById("wf-dev-btn")');

  // ── open the hub on the level tab ─────────────────────────────────────────────────────────
  await page.eval('window.__wfDev.open()');
  await page.waitFor('!!document.getElementById("wf-dev")');
  await page.eval(`(async () => {
    const hub = await import('${BASE}/js/dev/hub.js');
    hub.default.registerTab;
  })()`).catch(() => {});
  await page.waitFor('!!document.querySelector("#wf-dev nav button")');
  await page.clickText('#wf-dev nav button', 'Level');
  await page.waitFor('!!document.querySelector("#wf-dev .lv-now")');
  ok('the level tab mounted', await page.eval('!!document.querySelector("#wf-dev .lv-now h2")'));
  ok('it says which level is being edited',
    /\S/.test(await page.eval('document.querySelector("#wf-dev .lv-now h2").textContent')));

  // ── new level ─────────────────────────────────────────────────────────────────────────────
  fs.rmSync(SCRATCH, { force: true });
  await page.clickText('#wf-dev .lv-now button', 'Switch level');
  await page.clickText('#wf-dev .lv-warn button', 'New level');
  await page.waitFor('!!document.querySelector("#wf-dev .lv-warn input")');
  await page.eval(`(() => { const i = document.querySelector('#wf-dev .lv-warn input');
    i.value = ''; i.focus(); })()`);
  await page.type('__scratch');
  await page.clickText('#wf-dev .lv-warn button', 'Create');
  await page.waitFor('window.__wf.hotspots?.level?.() === "__scratch"', 8000);
  eq('the tab is now editing __scratch', await page.eval('window.__wf.hotspots.level()'), '__scratch');
  ok('data/levels/__scratch.json was written', fs.existsSync(SCRATCH));
  const seeded = JSON.parse(fs.readFileSync(SCRATCH, 'utf8'));
  eq('the seeded document is version 1', seeded.version, 1);
  eq('the seeded document has an empty hotspot list', seeded.hotspots, []);
  ok('the index gained __scratch',
    JSON.parse(fs.readFileSync(INDEX, 'utf8')).some(e => e.id === '__scratch'));
  ok('the banner says the game is showing a different level',
    (await page.eval('document.querySelector("#wf-dev .lv-warn")?.textContent || ""')).includes('different level'));
  await shot(page, '01-new-level');

  // The game is still showing `academy`, so the world is the academy's. Load the scratch level in
  // it, which is what every world-picking control needs.
  await page.eval('location.href = new URL(location.href).origin + "/?level=__scratch"');
  await sleep(1200);
  await page.waitFor('!!window.__wf && window.__wf.ready === true', 45000);
  eq('the game reloaded into __scratch', await page.eval('window.__wf.level.id'), '__scratch');
  await page.eval('window.__wfDev.open()');
  await page.waitFor('!!document.querySelector("#wf-dev nav button")');
  await page.clickText('#wf-dev nav button', 'Level');
  await page.waitFor('!!document.querySelector("#wf-dev .lv-now")');
  ok('the tab reopened on the level the game is showing',
    (await page.eval('document.querySelector("#wf-dev .lv-now").textContent')).includes('the level the game has loaded'));

  // ── draw a hotspot on the ground ──────────────────────────────────────────────────────────
  await page.clickText('#wf-dev .lv-row button', '＋ Circle');
  await page.waitFor('!!document.querySelector(".lv-worldbar")', 6000);
  ok('the hub stepped aside for the world', await page.eval('document.getElementById("wf-dev").classList.contains("lv-away")'));
  await shot(page, '02-drawing');
  await drag(page, [750, 620], [880, 660]);
  await page.waitFor('!document.querySelector(".lv-worldbar")', 6000);
  const drawn = await page.eval('JSON.stringify(window.__wf.hotspots.list())');
  const list = JSON.parse(drawn);
  eq('one hotspot exists', list.length, 1);
  ok(`it is a circle with a real radius (${JSON.stringify(list[0]?.shape)})`,
    list[0]?.shape?.k === 'circle' && list[0].shape.r > 0.5);
  ok('the overlay is showing it', await page.eval('window.__wf.hotspots.visible'));

  // ── name it, aim it, give it a say action ─────────────────────────────────────────────────
  await page.eval(`(() => { const i = document.querySelector('#wf-dev [data-role=hsname]');
    i.focus(); i.value = ''; })()`);
  await page.type('Scratch doorway');
  await page.eval(`document.querySelector('#wf-dev [data-role=hsname]')
    .dispatchEvent(new Event('input', { bubbles: true }))`);
  await sleep(150);
  await page.clickText('#wf-dev .lv-card .lv-row button', '＋ say');
  await page.waitFor('!!document.querySelector("#wf-dev .lv-act select")');
  const node = await page.eval(`(() => {
    const s = [...document.querySelectorAll('#wf-dev .lv-act select')].find(x => x.options.length > 2 && x.options[1].value.includes('.'));
    if (!s) return null;
    s.value = s.options[1].value; s.dispatchEvent(new Event('change', { bubbles: true }));
    return s.value; })()`);
  ok(`a conversation node was picked (${node})`, !!node);
  await sleep(250);
  await shot(page, '03-hotspot-inspector');

  const inDoc = JSON.parse(await page.eval('JSON.stringify(window.__wf.hotspots.list())'));
  eq('the action landed on the hotspot', inDoc[0].actions, [{ k: 'say', node }]);
  eq('the name landed too', inDoc[0].name, 'Scratch doorway');

  // ── trigger, and save ─────────────────────────────────────────────────────────────────────
  await page.eval(`(() => {
    const s = [...document.querySelectorAll('#wf-dev .lv-card select')]
      .find(x => [...x.options].some(o => o.value === 'interact'));
    s.value = 'enter'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await sleep(200);
  const before = fs.readFileSync(SCRATCH, 'utf8');
  await page.clickText('#wf-dev .lv-now button', 'Save');
  await sleep(900);
  const after = fs.readFileSync(SCRATCH, 'utf8');
  ok('the bytes on disk changed', after !== before);
  const saved = JSON.parse(after);
  eq('the saved file carries the hotspot', saved.hotspots.length, 1);
  eq('with its say action', saved.hotspots[0].actions[0].k, 'say');
  eq('and its name', saved.hotspots[0].name, 'Scratch doorway');
  ok('the header no longer says unsaved',
    !(await page.eval('document.querySelector("#wf-dev .lv-now .lv-chip").textContent')).includes('unsaved'));
  await shot(page, '04-saved');

  // ── the player start, clicked in the world ────────────────────────────────────────────────
  await page.clickText('#wf-dev .lv-sub button', 'Start');
  await page.clickText('#wf-dev .lv-card button', 'Set it by clicking');
  await page.waitFor('!!document.querySelector(".lv-worldbar")', 6000);
  await page.click('canvas');
  await sleep(300);
  await page.click('canvas');
  await page.waitFor('!document.querySelector(".lv-worldbar")', 6000);
  const start = JSON.parse(await page.eval('JSON.stringify(window.__wf.level.start)'));
  ok(`the start moved off 0,0 (${start.x}, ${start.z}, yaw ${start.yaw})`,
    start.x !== 0 || start.z !== 0);
  await shot(page, '05-start');

  // ── the runtime fires what was drawn ──────────────────────────────────────────────────────
  const fired = await page.eval(`(() => {
    const g = window.__wf.game;
    const h = g.hotspots.list[0];
    const s = h.shape;
    g.hotspots.load(g.hotspots.list);
    const out = [];
    out.push(g.hotspots.update(0.1, { x: s.x + 400, z: s.z }));
    out.push(g.hotspots.update(0.1, { x: s.x, z: s.z }));
    return JSON.stringify({ out, playing: !!g.dialogue.active, node: h.actions[0].node });
  })()`);
  const r = JSON.parse(fired);
  eq('the runtime fired the hotspot on entry', r.out[1], [r.out[1][0]]);
  ok(`it fired the one we drew (${r.out[1]})`, r.out[1][0] === inDoc[0].id);
  ok('and the say action opened the conversation', r.playing);
  await shot(page, '06-runtime-fired');

  // ── tone, and lettering ───────────────────────────────────────────────────────────────────
  await page.eval('window.__wfDev.open()');
  await page.waitFor('!!document.querySelector("#wf-dev .lv-sub")', 6000);
  await page.clickText('#wf-dev .lv-sub button', 'Objects');
  await sleep(200);
  ok('the objects panel opened', !!(await page.eval('!!document.querySelector("#wf-dev .lv-cols")')));
  await shot(page, '07-objects');

  const logs = page.logs().filter(l => /error|exception/i.test(l.level) && !/favicon/i.test(l.text));
  ok(`no console errors (${logs.map(l => l.text).join(' | ').slice(0, 300)})`, logs.length === 0);
} catch (e) {
  fails.push(`threw — ${e.message}`);
  try { await shot(page, 'zz-crash'); } catch { /* the page may be gone */ }
} finally {
  // Put the shared index back exactly as it was; the scratch level itself is left for inspection.
  fs.writeFileSync(INDEX, indexBefore);
  page?.close();
  chrome.proc.kill();
}

console.log(`\n${pass} passed, ${fails.length} failed`);
for (const f of fails) console.error(`FAIL  ${f}`);
console.log(`shots: ${shots.join('\n       ')}`);
process.exit(fails.length ? 1 : 0);
