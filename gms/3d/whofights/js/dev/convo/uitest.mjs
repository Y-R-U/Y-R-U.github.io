// Drives the Conversations tab in headless Chrome: makes a node, writes lines, branches it, makes
// a simple NPC, promotes it, saves, and reads the bytes back off disk.
//
//   node js/dev/convo/uitest.mjs [outdir]        KEEP_COPY=1 leaves the working copy behind
//
// It runs against a **copy** of the project served on its own port, never the working tree: the
// tab saves real files, five agents share this directory, and data/conversations.json has been
// clobbered by a UI test once already.

import { launch, attach, sleep } from '../cdp.mjs';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rawFile, clipFile } from '../chars/vo.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const COPY = path.resolve(ROOT, '../.wf-convotest');
const OUT = process.argv[2] || '/tmp/wf-convoshots';
const PORT = 8797;
const NODE = 'academy.uitest.hello';
const CLIP = 'academy_uitest_hello_01';

let fails = 0;
const check = (cond, what) => { console.log(`${cond ? ' ok ' : 'FAIL'}  ${what}`); if (!cond) fails++; };
const onDisk = rel => JSON.parse(fs.readFileSync(path.join(COPY, rel), 'utf8'));

fs.mkdirSync(OUT, { recursive: true });
fs.rmSync(COPY, { recursive: true, force: true });
// Same depth under gms/3d/, so index.html's ../../lib/three importmap still resolves.
spawnSync('rsync', ['-a', '--exclude', 'shots', '--exclude', 'audio/music', '--exclude', '.git', `${ROOT}/`, `${COPY}/`]);
check(fs.existsSync(path.join(COPY, 'data/conversations.json')), 'working copy made under gms/3d/.wf-convotest');

const before = fs.readFileSync(path.join(COPY, 'data/conversations.json'), 'utf8');
const server = spawn(process.execPath, [path.join(COPY, 'tools/devserver.mjs'), '--port', String(PORT)],
  { cwd: COPY, stdio: 'ignore' });
let status = {};
for (let i = 0; i < 60; i++) {
  try { status = await (await fetch(`http://127.0.0.1:${PORT}/api/status`)).json(); if (status.devserver) break; } catch { /* booting */ }
  await sleep(200);
}
check(!!status.devserver, `dev server for the copy is up on ${PORT}`);

const { proc, port } = await launch({ port: 9334, profile: '/tmp/wf-cdp-convo' });
// index.html boots the engine, which another agent is mid-edit on (interior.js throws today), so
// this drives the hub over the self-test page the way js/dev/uitest.mjs does.
const p = await attach(port, `http://localhost:${PORT}/js/dev/selftest.html`);
const pack = () => p.eval('JSON.parse(JSON.stringify(window.__wfConvo.doc.nodes))');
const cast = () => p.eval('JSON.parse(JSON.stringify(window.__wfConvo.cast))');
const transcript = () => p.eval(`document.querySelector('#wf-dev .convo-transcript').textContent`);

check(await p.waitFor('!!document.getElementById("wf-dev-btn")'), 'DEV button is there');
await p.click('#wf-dev-btn');
await sleep(900);
await p.clickText('#wf-dev nav button', 'Conversations');
await sleep(1400);
check(await p.eval('document.querySelectorAll("#wf-dev .convo-node").length > 0'), 'the seeded pack is listed');
check(await p.eval(`document.querySelector('#wf-dev .convo-links').textContent.includes('hotspot')`),
  'the opening node shows the hotspot that triggers it');
await p.shot(`${OUT}/1-list.png`);

await p.clickText('#wf-dev .convo-list button', '＋ node');
await sleep(400);
await p.eval(`(()=>{const i=document.querySelector('#wf-dev .convo-ask'); i.value=${JSON.stringify(NODE)};})()`);
await p.clickText('#wf-dev .convo-new button', 'Create');
await sleep(700);
check(await p.eval(`window.__wfConvo.nodeId === ${JSON.stringify(NODE)}`), 'the new node is selected');

await p.clickText('#wf-dev button', '＋ line');
await sleep(500);
await pick('#wf-dev .convo-card.line select', 0, 'greeter');
await typeLine(0, 'Iron first. Everyone starts on iron.');
await p.clickText('#wf-dev button', '＋ line');
await sleep(500);
await typeLine(1, 'And the second thing I always say.');
check((await pack())[NODE].lines.length === 2, 'two lines');
check(/no text/.test(await p.eval(`document.querySelector('#wf-dev [data-role=convo-problems]').textContent`)) === false,
  'the problem list keeps up with what is being typed');

// A speaker made from inside the conversation, per Aaron's brief.
await pick('#wf-dev .convo-card.line select', 1, '__new_npc');
await p.eval(`(()=>{const i=document.querySelector('#wf-dev .convo-new input[type=text]');
  i.value='Stable hand'; i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
await p.shot(`${OUT}/2-new-npc.png`);
await p.clickText('#wf-dev .convo-new button', 'Create');
await sleep(700);
const madeVoice = (await cast()).stable_hand?.voice;
check((await cast()).stable_hand?.body === 'none', 'the simple NPC is an ordinary character with no body');
check(!(await cast()).stable_hand?.place, 'and nowhere to stand yet');
check((await pack())[NODE].lines[1].who === 'stable_hand', 'the line now speaks as them');

await p.eval(`[...document.querySelectorAll('#wf-dev .convo-card.line button')].find(b=>b.textContent==='▼').click()`);
await sleep(500);
check((await pack())[NODE].lines[0].who === 'stable_hand', 'a line moves down');
await p.eval(`[...document.querySelectorAll('#wf-dev .convo-card.line button')].filter(b=>b.textContent==='▲')[1].click()`);
await sleep(500);
check((await pack())[NODE].lines[0].who === 'greeter', 'and back up');

await p.clickText('#wf-dev button', '＋ choice');
await sleep(500);
await p.eval(`(()=>{const i=[...document.querySelectorAll('#wf-dev input[type=text]')].find(x=>x.placeholder==='what the player says');
  i.value='Who pins the contracts up?'; i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
await sleep(300);
await pick('#wf-dev .convo-choice select', 0, 'academy.greeter.who');
check((await pack())[NODE].choices[0].goto === 'academy.greeter.who', 'the choice branches to a real node');

await pick('#wf-dev .convo-choice .convo-pred select', 0, 'flag');
await p.eval(`(()=>{const i=document.querySelector('#wf-dev .convo-pred input[type=text]');
  i.value='academy.met.vail'; i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
await sleep(400);
check(JSON.stringify((await pack())[NODE].choices[0].if) === '["flag","academy.met.vail",true]',
  'the if predicate is one predicate.js knows');
await p.shot(`${OUT}/3-node.png`);

await p.clickText('#wf-dev .convo-card.line button', 'Turn into a full character');
await sleep(500);
await p.shot(`${OUT}/4-promote.png`);
await p.clickText('#wf-dev .convo-new button', 'Turn into a full character');
await sleep(700);
const promoted = (await cast()).stable_hand;
check(promoted?.body === 'robed', 'promotion sets body: robed');
check(promoted?.place?.level === 'academy' && Number.isFinite(promoted?.place?.z), 'and gives it a place');
check(promoted?.voice === madeVoice && promoted?.name === 'Stable hand', 'and changes nothing else');

await p.eval(`document.querySelector('#wf-dev .convo-editor').scrollTop = 99999`);
await p.clickText('#wf-dev button', '▶ Play it');
await sleep(500);
check(/Iron first/.test(await transcript()), 'the preview walks the first line');
await p.clickText('#wf-dev button', 'Next ▸');
await sleep(400);
await p.clickText('#wf-dev button', 'Next ▸');
await sleep(500);
check(/— end —/.test(await transcript()) && !(await p.eval(`!!document.querySelector('#wf-dev .convo-choicebtn')`)),
  'with the flag off the gated choice never appears and the node just ends');
await p.eval(`(()=>{const c=[...document.querySelectorAll('#wf-dev .convo-flags label')].find(l=>l.textContent.includes('academy.met.vail')).querySelector('input');
  c.checked=true; c.dispatchEvent(new Event('change',{bubbles:true}));})()`);
await p.clickText('#wf-dev button', '▶ Play it');
await sleep(400);
await p.clickText('#wf-dev button', 'Next ▸');
await sleep(300);
await p.clickText('#wf-dev button', 'Next ▸');
await sleep(500);
check(await p.eval(`!!document.querySelector('#wf-dev .convo-choicebtn')`), 'with the flag set the choice appears');
await p.clickText('#wf-dev .convo-choicebtn', '▸');
await sleep(500);
check(/academy.greeter.who/.test(await transcript()), 'taking it walks on into the node it goes to');
await p.shot(`${OUT}/5-play.png`);
await p.clickText('#wf-dev button', 'Transcript');
await sleep(500);
check(/run\(\) · \d+ nodes · \d+ lines/.test(await transcript()),
  'Transcript re-walks the picks through dialogue.run()');

await p.clickText('#wf-dev button', 'Save conversations');
await sleep(1400);
await p.clickText('#wf-dev button', 'Save characters');
await sleep(1400);
check(fs.readFileSync(path.join(COPY, 'data/conversations.json'), 'utf8') !== before, 'the bytes on disk changed');
check(!!onDisk('data/conversations.json').nodes[NODE], 'the node is in the file');
check(onDisk('data/characters.json').characters.stable_hand.body === 'robed', 'the promoted character is in the file');
check(/data\//.test(await p.eval(`document.querySelector('#wf-dev .convo-editor .convo-vo').textContent`)),
  'the tab says where the last save landed');

if (status.kokoro) {
  await p.eval(`document.querySelector('#wf-dev .convo-editor').scrollTop = 0`);
  await p.clickText('#wf-dev .convo-card.line button', 'Generate');
  // Two files, in this order: kokoro's raw take under audio/vo/raw/, then the shipped clip the
  // game actually fetches. Asserting only on a wav in audio/vo/ was how the tab spent a month
  // writing uncompressed takes to a path nothing plays.
  const raw = path.join(COPY, rawFile(CLIP));
  const clip = path.join(COPY, clipFile(CLIP));
  for (let i = 0; i < 90 && !fs.existsSync(clip); i++) await sleep(1000);
  await sleep(1500);
  const rawSize = fs.existsSync(raw) ? fs.statSync(raw).size : 0;
  const size = fs.existsSync(clip) ? fs.statSync(clip).size : 0;
  check(rawSize > 2000, `kokoro wrote ${rawFile(CLIP)} (${rawSize} bytes)`);
  check(size > 1000 && size < rawSize, `and it was encoded to ${clipFile(CLIP)} (${size} bytes)`);
  check((await pack())[NODE].lines[0].vo === CLIP, 'the clip name is written back onto the line');
  check(/clip up to date/.test(await p.eval(`document.querySelector('#wf-dev .convo-card.line').textContent`)),
    'and the line reports the clip as current');
  await p.shot(`${OUT}/6-vo.png`);
} else {
  console.log(' --   kokoro is not on this machine — VO generation not exercised');
}

await p.clickText('#wf-dev nav button', 'Status');
await sleep(600);
await p.eval(`window.__wfConvo.open('academy.greeter.contracts')`);
await p.clickText('#wf-dev nav button', 'Conversations');
await sleep(1200);
check(await p.eval(`window.__wfConvo.nodeId === 'academy.greeter.contracts'`),
  'a node id handed over before the tab opens lands on that node');
await p.eval(`window.__wfConvo.open('academy.nosuch.node')`);
await sleep(600);
check(/does not exist yet/.test(await p.eval(`document.querySelector('#wf-dev .banner')?.textContent || ''`)),
  'an unknown node id offers to create it');
await p.shot(`${OUT}/7-handoff.png`);

const t = spawnSync(process.execPath, [path.join(COPY, 'tools/test.mjs'), 'conversations'], { cwd: COPY, encoding: 'utf8' });
check(t.status === 0, `the game still reads the file the tool wrote — ${(t.stdout || '').trim().split('\n').pop()}`);

const noise = /favicon|audio\/vo\/index\.json/;
const logs = p.logs().filter(l => /error|exception/i.test(l.level) && !noise.test(l.text));
for (const l of logs) console.log(`      [${l.level}] ${l.text.slice(0, 220)}`);
check(!logs.length, 'no unexpected console errors');

p.close();
proc.kill();
server.kill();
if (!process.env.KEEP_COPY) fs.rmSync(COPY, { recursive: true, force: true });
console.log(`\nshots in ${OUT} — look at them.  ${fails ? `${fails} FAILED` : 'all checks passed'}`);
process.exit(fails ? 1 : 0);

async function pick(sel, nth, value) {
  await p.eval(`(()=>{const s=[...document.querySelectorAll(${JSON.stringify(sel)})][${nth}];
    s.value=${JSON.stringify(value)}; s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await sleep(500);
}
async function typeLine(i, text) {
  await p.eval(`(()=>{const t=[...document.querySelectorAll('#wf-dev .convo-card.line textarea')][${i}];
    t.value=${JSON.stringify(text)}; t.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await sleep(350);
}
