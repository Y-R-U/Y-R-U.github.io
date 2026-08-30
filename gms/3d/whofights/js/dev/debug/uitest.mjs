// Drives the Debug tab in headless Chrome: opens every panel, shoots it, warps the player into
// the Academy's doorway hotspot with the loop running and checks the tracer recorded the fire.
//
//   node tools/devserver.mjs &
//   node js/dev/debug/uitest.mjs [outdir] [baseurl]
//
// Read-only against the repo: it saves no document and writes nothing but PNGs.

import { launch, attach, sleep } from '../cdp.mjs';
import fs from 'node:fs';

const OUT = process.argv[2] || '/tmp/wf-debugshots';
const BASE = process.argv[3] || 'http://localhost:8796';

fs.mkdirSync(OUT, { recursive: true });
let fails = 0;
const check = (cond, what) => { console.log(`${cond ? ' ok ' : 'FAIL'}  ${what}`); if (!cond) fails++; };

const { proc, port } = await launch({ w: 1500, h: 950 });
const p = await attach(port, `${BASE}/index.html`);

check(await p.waitFor('!!document.getElementById("wf-dev-btn")', 40000), 'the game boots and the DEV button appears');
check(await p.waitFor('!!window.__wf?.game', 20000), 'the play session is up');

await p.click('#wf-dev-btn');
await sleep(1500);
await p.clickText('#wf-dev nav button', 'Debug');
await sleep(1500);
check(await p.eval('!!document.querySelector("#wf-dev .dbg-subs")'), 'the Debug tab mounts with sub-tabs');
check(await p.eval('!!window.__wf.debug'), 'window.__wf.debug is exposed for other tabs');

const subs = await p.eval('[...document.querySelectorAll("#wf-dev .dbg-subs button")].map(b=>b.textContent.replace(/[0-9]+$/,"").trim())');
console.log(`      sub-tabs: ${subs.join(', ')}`);
check(subs.length >= 9, `every panel is registered (${subs.length})`);

for (const [i, name] of subs.entries()) {
  await p.clickText('#wf-dev .dbg-subs button', name);
  await sleep(name === 'Overlays' || name === 'Capture' ? 1400 : 900);
  const empty = await p.eval(`(()=>{const m=document.querySelector('#wf-dev main');
    return {crash:/crashed/.test(m.textContent), chars:m.textContent.trim().length};})()`);
  check(!empty.crash && empty.chars > 200, `${name} renders (${empty.chars} chars)`);
  await p.shot(`${OUT}/${String(i + 1).padStart(2, '0')}-${name.toLowerCase().replace(/[^a-z]+/g, '-')}.png`);
}

// Warp: pick the doorway hotspot out of the exposed list, jump there and let the loop run.
await p.clickText('#wf-dev .dbg-subs button', 'Warp');
await sleep(700);
const before = await p.eval('window.__wf.debug.warp.where()');
await p.eval(`window.__wf.debug.trace.clear()`);
await p.clickText('#wf-dev .dbg-tree .dbg-row', 'Hall doorway');
await sleep(600);
const after = await p.eval('window.__wf.debug.warp.where()');
check(Math.abs(after.z - before.z) > 5 || Math.abs(after.x - before.x) > 5,
  `clicking a waypoint moves the player (${before.x},${before.z} → ${after.x},${after.z})`);
await p.shot(`${OUT}/20-warped.png`);

// The hotspot only fires from inside the game loop, which the hub has stopped — so leave.
await p.key('Escape', 'Escape');
await sleep(2500);
const fired = await p.eval(`window.__wf.debug.trace.list().filter(e=>e.id==='hs.doorway.hall')`);
console.log(`      trace rows for the doorway: ${fired.map(e => `${e.kind}:${e.text}`).join(' | ') || 'none'}`);
check(fired.some(e => e.kind === 'enter'), 'the tracer logged entering the doorway hotspot');
check(fired.some(e => e.kind === 'fire'), 'the tracer logged the doorway hotspot firing');
const acts = await p.eval(`window.__wf.debug.trace.list().filter(e=>e.kind==='action').map(e=>e.id)`);
check(acts.includes('flag') && acts.includes('event'), `its actions were traced (${acts.join(', ')})`);
const flagged = await p.eval(`!!window.__wf.game.doc.flags['academy.doorway.seen']`);
check(flagged, 'the flag the hotspot sets really landed in the save');

// The mini-HUD is the answer to the paused loop, so it has to survive the hub closing.
await p.eval('window.__wf.debug.hud.show(true)');
await sleep(1200);
check(await p.eval('!!document.getElementById("wf-dbg-hud") && !document.querySelector("#wf-dev:not(.hidden)")'),
  'the mini-HUD is up over the running game with the hub closed');
await p.shot(`${OUT}/21-hud-over-game.png`);
const laneText = await p.eval('document.querySelector("#wf-dbg-hud .wfdbg-body").textContent');
check(/fps/.test(laneText) && laneText.length > 40, `the HUD lanes have live numbers (${laneText.slice(0, 60).replace(/\n/g, ' ')})`);

// Overlays have to keep drawing after the hub closes — that is the whole point of them.
await p.eval(`window.__wf.debug.overlays.show('hotspots', true)`);
await p.eval(`window.__wf.debug.overlays.show('colliders', true)`);
await p.eval(`window.__wf.debug.overlays.show('probe', true)`);
await sleep(1200);
const drawn = await p.eval(`(()=>{const g=window.__wf.app.scene.getObjectByName('wf-debug-overlays');
  return g ? g.children.filter(c=>c.visible).map(c=>[c.name,c.children.length]) : null;})()`);
console.log(`      overlay groups: ${JSON.stringify(drawn)}`);
check(drawn && drawn.some(([, n]) => n > 0), 'overlay geometry is in the live scene');
await p.shot(`${OUT}/22-overlays.png`);

// Keep-running: with it on, the hub must not stop the loop.
await p.click('#wf-dev-btn');
check(await p.waitFor('!!document.querySelector("#wf-dev:not(.hidden)")', 8000), 'the hub reopens');
if (!await p.eval('!!document.querySelector("#wf-dev .dbg-subs")')) await p.clickText('#wf-dev nav button', 'Debug');
check(await p.waitFor('!!document.querySelector("#wf-dev .dbg-subs")', 8000), 'back on the Debug tab');
check(await p.eval('!window.__wf.app.raf'), 'the hub really did stop the loop on the way in');
await p.eval('window.__wf.debug.keepRunning(true)');
const f1 = await p.eval('window.__wf.app.frames');
await sleep(900);
const f2 = await p.eval('window.__wf.app.frames');
check(f2 > f1, `keep-running leaves the loop going behind the hub (${f1} → ${f2})`);
await p.eval('window.__wf.debug.keepRunning(false)');
const f3 = await p.eval('window.__wf.app.frames');
await sleep(900);
check(await p.eval('window.__wf.app.frames') === f3, 'turning it off stops the loop again, as the hub expects');
await p.shot(`${OUT}/23-keeprunning.png`);

// The input tester is only worth anything if it shows a key that is actually down, which needs
// the loop running — so it is tested with keep-running on.
await p.eval('window.__wf.debug.keepRunning(true)');
await p.clickText('#wf-dev .dbg-subs button', 'Input');
await sleep(600);
await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87 });
await sleep(900);
const held = await p.eval('window.__wf.debug.state.lastInput?.keys || []');
check(held.includes('KeyW'), `the input tester sees a key that is held (${held.join(',')})`);
check(/KeyW/.test(await p.eval('document.querySelector("#wf-dev main").textContent')), 'and paints it');
await p.shot(`${OUT}/26-input-live.png`);
await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87 });
await p.eval('window.__wf.debug.keepRunning(false)');
await sleep(400);

// Pick: arm it, click the game, and the hub must come back with that node selected.
await p.clickText('#wf-dev .dbg-subs button', 'World');
await sleep(600);
await p.clickText('#wf-dev section button', 'Pick in the world');
await sleep(800);
check(await p.eval('!!document.querySelector("#wf-dev.hidden")'), 'arming the picker closes the hub');
await p.click('#stage');
await sleep(2000);
const picked = await p.eval('window.__wf.debug.state.selected?.type || null');
check(!!picked, `the picker selected something (${picked})`);
check(await p.eval('!!document.querySelector("#wf-dev:not(.hidden)")'), 'and the hub came back');
await p.shot(`${OUT}/27-picked.png`);

// Capture: a real frame at a phone size, taken and restored inside one task.
await p.clickText('#wf-dev .dbg-subs button', 'Capture');
await sleep(900);
await p.clickText('#wf-dev section button', 'Capture');
await sleep(1600);
const shot = await p.eval(`(()=>{const i=document.querySelector('#wf-dev .dbg-shot');
  return i ? {len:i.src.length, w:i.naturalWidth, h:i.naturalHeight} : null;})()`);
console.log(`      capture: ${JSON.stringify(shot)}`);
check(shot && shot.len > 5000 && shot.w > 0, 'the screenshot tool produced a real image');
check(await p.eval('document.getElementById("stage").style.width === ""'), 'the stage size was restored');
await p.shot(`${OUT}/24-capture.png`);

// Phone preview reframes the live game, not just the canvas.
await p.clickText('#wf-dev section:last-of-type .row button', 'Phone portrait');
await sleep(900);
await p.key('Escape', 'Escape');
await sleep(1200);
const framed = await p.eval(`(()=>{const s=document.getElementById('stage').getBoundingClientRect();
  return {w:Math.round(s.width), h:Math.round(s.height)};})()`);
console.log(`      framed stage: ${JSON.stringify(framed)}`);
check(framed.w === 390 && framed.h === 844, 'the game is reframed to a portrait phone');
await p.shot(`${OUT}/25-phone-portrait.png`);
await p.eval(`document.documentElement.classList.remove('wfdbg-framed'); window.__wf.app.resize();`);
await sleep(400);

// The console capture has to be shown catching something, or its empty state proves nothing.
await p.click('#wf-dev-btn');
await p.waitFor('!!document.querySelector("#wf-dev .dbg-subs")', 8000);
await p.clickText('#wf-dev .dbg-subs button', 'Console');
await sleep(600);
await p.eval(`console.warn('uitest: a warning'); console.log('uitest: a log line');`);
await p.clickText('#wf-dev section button', 'Log a test line');
await sleep(800);
// The uncaught-error path is worth proving too, but from here rather than from a button: an
// uncaught throw raises js/game/failure.js's bar over the player's screen.
await p.eval(`setTimeout(() => { throw new Error('uitest: uncaught'); }, 0)`);
await sleep(900);
check((await p.eval('window.__wf.debug.log.list().map(e=>e.text).join("|")')).includes('uitest: uncaught'),
  'an uncaught error lands in the console capture');
const caught = await p.eval('window.__wf.debug.log.list().map(e=>e.level)');
check(caught.includes('warn') && caught.includes('log') && caught.includes('error'),
  `the console capture caught every level (${caught.join(',')})`);
check(/debug: a warning/.test(await p.eval('document.querySelector("#wf-dev main").textContent')),
  'and the panel paints them');
await p.shot(`${OUT}/28-console.png`);

const noise = /favicon|Third-party cookie|WebGL|Deprecation|uitest:|^debug: /i;
const logs = p.logs().filter(l => /error|exception/i.test(l.level) && !noise.test(l.text));
for (const l of logs) console.log(`      [${l.level}] ${l.text.slice(0, 200)}`);
check(!logs.length, 'no unexpected console errors');

console.log(`\nshots in ${OUT} — open them.  ${fails ? `${fails} FAILED` : 'all checks passed'}`);
p.close();
proc.kill();
process.exit(fails ? 1 : 0);
