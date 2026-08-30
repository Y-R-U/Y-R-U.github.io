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
// Before Chrome starts: /api/ls is a GET and the browser will happily serve the first listing
// out of its own cache for the rest of the session.
for (const f of fs.readdirSync(path.dirname(SCRATCH))) {
  if (f.startsWith('__scratch')) fs.rmSync(path.join(path.dirname(SCRATCH), f));
}

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

// Where a world point lands on screen, using the running camera — no three import needed, the
// Vector3 class comes off a vector the engine already made.
function screenOf(p, x, z) {
  return p.eval(`(() => {
    const app = window.__wf.app, c = app.camera;
    const y = (window.__wf.world?.terrain?.surfaceY?.(${x}, ${z}) ?? 0) + 0.53;
    const v = new (c.position.constructor)(${x}, y, ${z}).project(c);
    const r = app.renderer.domElement.getBoundingClientRect();
    return JSON.stringify({ x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height });
  })()`);
}

async function tap(p, x, y) {
  for (const type of ['mousePressed', 'mouseReleased']) {
    await p.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1,
      buttons: type === 'mousePressed' ? 1 : 0 });
  }
  await sleep(180);
}

const PROFILE = `/tmp/wf-level-cdp-${process.pid}`;
const chrome = await launch({ port: 9345, profile: PROFILE, w: 1500, h: 950 });
let page;

// A navigation inside the page loses the CDP execution context often enough to hang a run
// outright, so every "go to this url" is a fresh tab instead.
async function open(url) {
  try { page?.close(); } catch { /* already gone */ }
  page = await attach(9345, url);
  if (!await page.waitFor('!!window.__wf && window.__wf.ready === true', 45000)) {
    throw new Error(`the game never booted at ${url}`);
  }
  return page;
}

function restoreIndex() {
  try {
    const now = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
    const cleaned = now.filter(e => !String(e?.id || '').startsWith('__scratch'));
    // Nobody else touched it: put the original bytes back rather than this run's formatting.
    if (JSON.stringify(cleaned) === JSON.stringify(JSON.parse(indexBefore))) fs.writeFileSync(INDEX, indexBefore);
    else fs.writeFileSync(INDEX, `${JSON.stringify(cleaned, null, 2)}\n`);
  } catch { fs.writeFileSync(INDEX, indexBefore); }
}

// A hung CDP call must not leave the shared level index carrying a __scratch row for ever.
const deadline = setTimeout(() => {
  console.error('FAIL  timed out after 5 minutes');
  restoreIndex();
  try { chrome.proc.kill(); } catch { /* already dead */ }
  process.exit(1);
}, 300000);

try {
  // A left-over browser is a different test: data.levelIds() counts unsaved drafts in
  // localStorage as ids in use — correctly — and the world editor's own wf.scene copy shadows
  // the file on disk. Start from nothing.
  await open(`${BASE}/`);
  await page.eval('localStorage.clear(); sessionStorage.clear()');
  await open(`${BASE}/`);
  ok('the game booted', await page.eval('!!window.__wf?.ready'));
  await page.waitFor('!!document.getElementById("wf-dev-btn")');

  // ── open the hub on the level tab ─────────────────────────────────────────────────────────
  await page.eval('window.__wfDev.open()');
  await page.waitFor('!!document.getElementById("wf-dev")');
  await page.waitFor('!!document.querySelector("#wf-dev nav button")');
  await page.clickText('#wf-dev nav button', 'Level');
  await page.waitFor('!!document.querySelector("#wf-dev .lv-now")');
  ok('the level tab mounted', await page.eval('!!document.querySelector("#wf-dev .lv-now h2")'));
  ok('it says which level is being edited',
    /\S/.test(await page.eval('document.querySelector("#wf-dev .lv-now h2").textContent')));

  // ── new level ─────────────────────────────────────────────────────────────────────────────
  await page.clickText('#wf-dev .lv-now button', 'Switch level');
  await page.clickText('#wf-dev .lv-warn button', 'New level');
  await page.waitFor('!!document.querySelector("#wf-dev .lv-warn input")');
  await page.eval(`(() => { const i = document.querySelector('#wf-dev .lv-warn input');
    i.value = ''; i.focus(); })()`);
  await page.type('__scratch');
  const typed = await page.eval(`document.querySelector('#wf-dev .lv-warn input').value`);
  eq('the name field holds what was typed', typed, '__scratch');
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
  await open(`${BASE}/?level=__scratch`);
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
  await drag(page, [740, 640], [980, 700]);
  await page.waitFor('!document.querySelector(".lv-worldbar")', 6000);
  const drawn = await page.eval('JSON.stringify(window.__wf.hotspots.list())');
  const list = JSON.parse(drawn);
  eq('one hotspot exists', list.length, 1);
  ok(`it is a circle with a real radius (${JSON.stringify(list[0]?.shape)})`,
    list[0]?.shape?.k === 'circle' && list[0].shape.r > 0.5);
  ok('the overlay is showing it', await page.eval('window.__wf.hotspots.visible'));

  // ── resize it by its handle, out in the world ─────────────────────────────────────────────
  await page.clickText('#wf-dev .lv-card button', 'Move & resize');
  await page.waitFor('!!document.querySelector(".lv-worldbar")', 6000);
  await shot(page, '02b-handles');
  const before0 = JSON.parse(await page.eval('JSON.stringify(window.__wf.hotspots.list()[0].shape)'));
  const grip = JSON.parse(await screenOf(page, before0.x + before0.r, before0.z));
  const out = JSON.parse(await screenOf(page, before0.x + before0.r * 3, before0.z));
  await drag(page, [grip.x, grip.y], [out.x, out.y]);
  await page.clickText('.lv-worldbar button', 'Done');
  await page.waitFor('!document.querySelector(".lv-worldbar")', 6000);
  const after0 = JSON.parse(await page.eval('JSON.stringify(window.__wf.hotspots.list()[0].shape)'));
  ok(`dragging the size handle grew the circle (${before0.r} → ${after0.r})`, after0.r > before0.r * 1.5);
  ok('and left the centre where it was', after0.x === before0.x && after0.z === before0.z);

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
  await tap(page, 700, 660);
  await sleep(300);
  await tap(page, 1000, 480);
  await page.waitFor('!document.querySelector(".lv-worldbar")', 6000);
  const start = JSON.parse(await page.eval('JSON.stringify(window.__wf.level.start)'));
  ok(`the start moved off 0,0 (${start.x}, ${start.z}, yaw ${start.yaw})`,
    start.x !== 0 || start.z !== 0);
  ok(`the second click gave it a facing (${start.yaw})`, start.yaw !== 0);
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

  // ── the overlay, in the world, over a level that has real hotspots ────────────────────────
  await open(`${BASE}/?level=academy`);
  await page.eval('window.__wfDev.open()');
  await page.waitFor('!!document.querySelector("#wf-dev nav button")');
  await page.clickText('#wf-dev nav button', 'Level');
  // It reopens on the level it was last editing, and says loudly that the game is showing
  // another one — that banner is the way back.
  await page.waitFor('!!document.querySelector("#wf-dev .lv-warn button")', 8000);
  await page.clickText('#wf-dev .lv-warn button', 'Open academy');
  await page.waitFor('window.__wf.hotspots.level() === "academy"', 8000);
  await page.waitFor('!!document.querySelector("#wf-dev .lv-hs")', 8000);
  ok('the academy\u2019s own hotspots are listed',
    (await page.eval('document.querySelectorAll("#wf-dev .lv-hs").length')) >= 2);
  ok('no false drift banner on a file the world was built from',
    !(await page.eval('document.querySelector("#wf-dev .lv-warn")?.textContent || ""')).includes('objects this file'));
  await page.click('#wf-dev .lv-hs', 0);
  await shot(page, '08-academy-hotspots');

  // ── attach a hotspot to a character ───────────────────────────────────────────────────────
  await page.clickText('#wf-dev .lv-row button', '＋ On a character');
  await page.waitFor('!!document.querySelector("#wf-dev .lv-warn select")', 6000);
  await page.clickText('#wf-dev .lv-warn button', 'Add');
  await sleep(300);
  const attached = JSON.parse(await page.eval('JSON.stringify(window.__wf.hotspots.list().at(-1))'));
  ok(`a character hotspot was added (${attached?.attach}, r ${attached?.r})`,
    !!attached?.attach && attached.trigger === 'interact');

  // ── the handoff to the conversation tab ───────────────────────────────────────────────────
  await page.eval(`(() => {
    const rows = [...document.querySelectorAll('#wf-dev .lv-hs')];
    rows.find(r => r.textContent.includes('Vail')).click(); })()`);
  await sleep(250);
  const sayNode = await page.eval(
    `window.__wf.hotspots.list().find(h => h.actions?.[0]?.k === 'say')?.actions[0].node`);
  await page.eval(`(() => {
    const rows = [...document.querySelectorAll('#wf-dev .lv-hs')];
    const r = rows.find(x => x.textContent.includes('say')); if (r) r.click(); })()`);
  await sleep(250);
  const jumped = await page.eval(`(() => {
    const b = [...document.querySelectorAll('#wf-dev .lv-act button')]
      .find(x => x.textContent.startsWith('Edit this conversation'));
    if (!b) return 'no button';
    b.click();
    return JSON.stringify({ opened: window.__wfConvo?.nodeId ?? null,
      jump: window.__wfDev.jump, tab: localStorage.getItem('wf.dev.tab') }); })()`);
  ok(`the conversation handoff fired (${jumped})`,
    jumped.includes('"tab":"convo"') && jumped.includes(sayNode));
  await sleep(400);
  ok(`the conversation tab landed on the node the hotspot names (${sayNode})`,
    (await page.eval('window.__wfConvo?.nodeId ?? null')) === sayNode);
  await sleep(400);
  await shot(page, '08b-after-handoff');

  // ── tone and lettering ────────────────────────────────────────────────────────────────────
  await page.clickText('#wf-dev nav button', 'Level');
  await page.waitFor('!!document.querySelector("#wf-dev .lv-sub")', 6000);
  await page.clickText('#wf-dev .lv-sub button', 'Objects');
  await page.waitFor('!!document.querySelector("#wf-dev .lv-hs")', 6000);
  await page.click('#wf-dev .lv-hs', 1);
  await page.clickText('#wf-dev .lv-row button', 'Dark');
  await sleep(400);
  const retoned = await page.eval(`(() => {
    const ed = window.__wf.editor;
    const sel = ed.selected?.id;
    return JSON.stringify({ sel, zone: ed.doc.objects.find(o => o.id === sel)?.zone }); })()`);
  ok(`the second object was retoned dark (${retoned})`, retoned.includes('"zone":"dark"'));
  ok('the retone reached the level file through the mirror',
    await page.eval(`(async () => { const d = (await import('/js/dev/data.js')).default;
      return d.get('levels', 'academy').objects.some(o => o.zone === 'dark'); })()`));
  const board = await page.eval(`(() => {
    const i = [...document.querySelectorAll('#wf-dev .lv-insp input')][0];
    if (!i) return 'no field';
    i.focus(); i.value = 'Scratch Board';
    i.dispatchEvent(new Event('input', { bubbles: true }));
    i.dispatchEvent(new Event('change', { bubbles: true }));
    return window.__wf.editor.doc.objects.find(o => o.p && 'text' in o.p)?.p.text; })()`);
  ok(`the sign text can be retyped from the tab (${board})`, board === 'Scratch Board');
  await shot(page, '08c-tone-and-text');
  ok('the level file is dirty and says so, rather than saving academy behind our back',
    (await page.eval('document.querySelector("#wf-dev .lv-now .lv-chip").textContent')).includes('unsaved'));
  await page.clickText('#wf-dev .lv-sub button', 'Hotspots');
  await sleep(200);
  await page.eval('window.__wfDev.close(); window.__wf.hotspots.show(true); window.__wf.setScenario("road")');
  await sleep(1200);
  await shot(page, '09-overlay-in-world');
  ok('the overlay is still on with the hub shut', await page.eval('window.__wf.hotspots.visible'));
  await page.eval('window.__wf.setScenario("doorway")');
  await sleep(1200);
  await shot(page, '10-overlay-doorway');

  const logs = page.logs().filter(l => /error|exception/i.test(l.level) && !/favicon/i.test(l.text));
  ok(`no console errors (${logs.map(l => l.text).join(' | ').slice(0, 300)})`, logs.length === 0);
} catch (e) {
  fails.push(`threw — ${e.message}`);
  try { await shot(page, 'zz-crash'); } catch { /* the page may be gone */ }
} finally {
  // Take the scratch row back out rather than writing the old bytes over the top: another agent
  // may have added a level to the same shared file while this was running.
  clearTimeout(deadline);
  restoreIndex();
  try { page?.close(); } catch { /* already gone */ }
  chrome.proc.kill();
  setTimeout(() => fs.rmSync(PROFILE, { recursive: true, force: true }), 400).unref?.();
}

console.log(`\n${pass} passed, ${fails.length} failed`);
for (const f of fails) console.error(`FAIL  ${f}`);
console.log(`shots: ${shots.join('\n       ')}`);
process.exit(fails.length ? 1 : 0);
