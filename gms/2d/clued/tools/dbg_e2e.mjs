#!/usr/bin/env node
// Remote debug log e2e: a solo 4-question listen round in headless Chrome against a LOCAL server with the flag on,
// then reads the rows back and checks they tell each question's story. Also: flag off → client stops, no rows.
//   go build -o /tmp/clued ./server && CLUED_DATA=/tmp/dbgdata /tmp/clued debuglog on
//   CLUED_ADDR=127.0.0.1:8098 CLUED_DATA=/tmp/dbgdata /tmp/clued &
//   ~/.claude/bin/cdp start --port 9510 -- --autoplay-policy=no-user-gesture-required
//   node tools/dbg_e2e.mjs [--port 9510] [--api http://127.0.0.1:8098/gms/2d/clued/api] [--site http://localhost:8888/gms/2d/clued/] [--cli /tmp/clued --data /tmp/dbgdata]
import { connect } from './au_cdp.mjs';
import { execFileSync } from 'node:child_process';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PORT = +arg('--port', 9510), API = arg('--api', 'http://127.0.0.1:8098/gms/2d/clued/api'), SITE = arg('--site', 'http://localhost:8888/gms/2d/clued/');
const CLI = arg('--cli', ''), DATA = arg('--data', '');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'} ${m}`); };
const cli = (...a) => execFileSync(CLI, ['debuglog', ...a], { env: { ...process.env, CLUED_DATA: DATA } }).toString();
const rows = async (q = '') => { const out = cli('dump', '--since', '1h', '--json', ...q.split(' ').filter(Boolean)); return out.trim() ? out.trim().split('\n').map(l => JSON.parse(l)) : []; };

if (!CLI || !DATA) { console.error('need --cli and --data (the local server binary + its CLUED_DATA)'); process.exit(2); }
cli('clear'); cli('on');
await sleep(5500);   // server flag cache

const c = await connect(PORT);
await c.goto(`${SITE}?noauth=1&api=${encodeURIComponent(API)}`, 'window.__cluedReady === true', 30000);
let on = false;
for (let i = 0; i < 20 && !on; i++) { await sleep(250); on = await c.evaluate('!!window.__cluedDbg?.on'); }
ok(on, 'client switched itself on from /status');
const device = await c.evaluate('localStorage.getItem("clued.dbg.dev")'), session = await c.evaluate('window.__cluedDbg.session');

await c.evaluate(`window.__clued.start({ structure: 'quick', format: 'listen', packs: ['hits-1980s', 'hits-1990s'], count: 4, timer: false, opts: { clip: 3, art: 'off' } }); true`);
const qs = [];
for (let n = 0; n < 4; n++) {
  let rendered = false;
  for (let t = 0; t < 120 && !rendered; t++) { await sleep(250); rendered = await c.evaluate(`window.__clued.state().run?.i === ${n} && !!document.querySelector('.au-listen')`); }
  // let the clip play (3 s) then answer like a player
  let status = '';
  for (let t = 0; t < 40; t++) { await sleep(250); status = await c.evaluate(`document.querySelector('.au-status')?.textContent || ''`); if (/Pick your answer/.test(status)) break; }
  qs.push({ n, rendered, status });
  await c.evaluate(`window.__clued.answer('correct'); true`);
  await sleep(700);
  await c.evaluate(`document.querySelector('.reveal .next')?.click(); true`);
}
for (const q of qs) ok(q.rendered && /Pick your answer/.test(q.status), `Q${q.n + 1}: rendered, clip played to the end (status "${q.status}")`);
await sleep(4500);   // one more batch

const all = await rows(`--device ${device} --session ${session}`);
ok(all.length > 30, `${all.length} rows arrived for device ${device}`);
const sessions = new Set(all.map(r => r.session));
ok(sessions.size === 1 && all.every(r => r.build && r.ua && r.cts > 0), 'every row has session, build, ua, client time');
ok(all.some(r => r.tag === 'page' && r.msg === 'boot'), 'ring history included the boot line (logged before the flag was known)');
const tag = (t, m) => all.filter(r => r.tag === t && r.msg === m);
ok(tag('run', 'question').length === 4, 'runner: 4 question starts');
ok(tag('listen', 'render').length === 4, 'listen: 4 renders');
ok(tag('listen', 'autoplay').length === 4, 'listen: 4 autoplay attempts');
ok(tag('clip', 'start').length >= 4 && tag('clip', 'ended').length >= 4, 'clip: ≥4 starts and ≥4 ended');
ok(tag('clip', 'fetch.ok').length >= 4 && tag('clip', 'decode.ok').length >= 4, 'clip: fetch + decode per question');
ok(tag('listen', 'destroy').length >= 3, 'listen: previous question destroyed before each new one');
ok(all.some(r => r.tag === 'busy' && r.msg === 'begin') && all.some(r => r.tag === 'busy' && r.msg === 'end'), 'busy begin/end counters logged');
ok(all.some(r => r.tag === 'nav' && r.msg === 'screen'), 'screen changes logged');
ok(all.some(r => r.tag === 'ctx'), 'AudioContext lines logged');
const mods = all.filter(r => r.tag === 'module');
ok(['ctx', 'clip', 'listen', 'piano', 'apple']   /* bgm loads on the first tap */.every(m => mods.some(r => r.data.mod === m && /\?v=\d+/.test(r.data.url))), 'each audio module logs its instance id + ?v= URL');
ok(!mods.some(r => r.msg === 'loaded.again'), 'no module loaded twice');
const acs = tag('ctx', 'AudioContext.new');
ok(acs.length === 1 && tag('clip', 'start').every(r => r.data.ac === acs[0].data.id && r.data.n === 1), 'one AudioContext, every clip start names it');
ok(tag('page', 'builds').length === 1 && tag('listen', 'builds').length === 4 && tag('listen', 'builds').every(r => !r.data.mixed && r.data.byV), 'build report at boot and per listen question, no mixed builds');
// per-question story: render → prepare.ok → autoplay → start.playing → clip start → clipDone
const story = all.filter(r => r.tag === 'listen' && ['render', 'prepare.ok', 'autoplay', 'start.playing', 'clipDone', 'answer', 'destroy'].includes(r.msg));
const byR = new Map();
for (const r of story) { const k = r.data?.r; if (!byR.has(k)) byR.set(k, []); byR.get(k).push(r.msg); }
let i = 0;
for (const [k, msgs] of byR) { i++; ok(['render', 'prepare.ok', 'autoplay', 'start.playing', 'clipDone', 'answer'].every(m => msgs.includes(m)), `render #${k}: ${msgs.join(' → ')}`); }
ok(i === 4, 'four separate render stories');

// flag off: the client notices (204 on its next batch or the minute check) and stops; nothing more is stored
cli('off');
await sleep(5500);
await c.evaluate(`console.warn('after-off probe'); true`);
let stopped = false;
for (let t = 0; t < 40 && !stopped; t++) { await sleep(250); stopped = !(await c.evaluate('window.__cluedDbg.on')); }
ok(stopped, 'client switched itself off after the server flag went off');
const before = (await rows(`--device ${device}`)).length;
await c.evaluate(`console.warn('second probe'); true`);
await sleep(4000);
ok((await rows(`--device ${device}`)).length === before, 'no new rows while off');
// on again without a reload: starting the next game re-checks /status (throttled to once a minute)
cli('on');
await sleep(61000);
await c.evaluate(`window.__clued.start({ structure: 'quick', format: 'mc', packs: 'all', count: 2, timer: false }); true`);
let back = false;
for (let t = 0; t < 30 && !back; t++) { await sleep(250); back = await c.evaluate('window.__cluedDbg.on'); }
ok(back, 'a new game switched it back on without a reload');
cli('off');

console.log(fail ? `${fail} FAILED, ${pass} passed` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
