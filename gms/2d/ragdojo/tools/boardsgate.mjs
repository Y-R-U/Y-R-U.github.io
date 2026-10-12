#!/usr/bin/env node
/**
 * The arena panel's GHOSTS and BOARDS tabs in a real Chrome, driven by REAL touch events at a
 * landscape phone (844x390) and again in portrait (390x844, the app rotated):
 *   - ghosts are listed with a GHOST tag, a ghost fight runs offline and sends NOTHING
 *     (no WebSocket frame, no POST), is labelled GHOST in the fight, and changes no stats;
 *   - the boards show the server's ordering (today, wins, per arena type) and your own card;
 *   - X in the corner, backdrop dismiss, internal scroll, zero console errors;
 *   - with no arena server the ARENA button stays hidden.
 *
 *   node tools/boardsgate.mjs        (ARENA_TEST_PORT moves its ports; default 9460-9461)
 */
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { CDP, ROOT, serve } from './cdp.mjs';

const SHOTS = process.env.SHOTS || join(ROOT, 'shots');
const log = (m) => process.stderr.write(m + '\n');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? pass++ : fail++; log(`${c ? 'PASS' : 'FAIL'}  ${n}${x && !c ? '  ' + x : ''}`); };

const tmp = mkdtempSync(join(tmpdir(), 'boardsgate-'));
const bin = process.env.ARENA_BIN || join(tmp, 'arena'), db = join(tmp, 'a.db');
if (!process.env.ARENA_BIN) execFileSync('go', ['build', '-o', bin, '.'], { cwd: join(ROOT, 'server'), stdio: 'inherit' });
const P0 = +(process.env.ARENA_TEST_PORT || 9460);
const server = spawn(bin, [], { env: { ...process.env, ARENA_ADDR: `127.0.0.1:${P0}`, ARENA_DB: db, ARENA_ICE_URL: 'off', ARENA_ALLOWANCE_URL: 'off', ARENA_DEV_AUTH: '1' }, stdio: 'ignore' });
const base = `http://127.0.0.1:${P0}/gms/2d/ragdojo/arena`;
for (let i = 0; i < 60; i++) { try { if ((await fetch(base + '/health')).ok) break; } catch {} await sleep(100); }
const web = await serve(ROOT, P0 + 1);
const tabs = [];
const cleanup = () => { for (const t of tabs) t.close(); web.close(); server.kill('SIGKILL'); rmSync(tmp, { recursive: true, force: true }); };
process.on('exit', cleanup);

// ── seed: ranked records straight into the DB, ghosts through the real upload endpoint ──
const day = new Date().toISOString().slice(0, 10), now = Math.floor(Date.now() / 1000);
const P = [['zed', 'Zed', 6, 4, 2, 2, 3, 9], ['ann', 'Ann', 10, 8, 2, 0, 5, 20], ['bob', 'Bob', 12, 3, 9, 1, 1, 4], ['cat', 'Cat', 2, 2, 0, 2, 2, 3]];
for (let i = 0; i < 26; i++) P.push([`x${i}`, `Extra ${String(i).padStart(2, '0')}`, 1, 0, 1, 0, 0, 0]);
const sql = [
  ...P.map(([u, n, b, w, l, s, bs, k]) => `INSERT INTO players(uid,name,battles,wins,losses,streak,best_streak,kos,updated) VALUES('${u}','${n}',${b},${w},${l},${s},${bs},${k},${now});`),
  ...P.map(([u, , b, w, l]) => `INSERT INTO by_type(uid,type,battles,wins,losses) VALUES('${u}','duel',${b},${w},${l});`),
  `INSERT INTO by_type(uid,type,battles,wins,losses) VALUES('ann','lms',3,1,2),('bob','lms',5,2,3);`,
  `INSERT INTO daily(uid,day,battles,wins) VALUES('bob','${day}',5,1),('zed','${day}',2,1),('ann','${day}',1,1);`,
].join('\n');
execFileSync('sqlite3', [db], { input: sql });
const snapOf = (lv) => ({ v: 1, t: 'light', cd: 0, p: { hp: lv, atk: lv }, m: { power: [Math.min(7, lv), 0], toss: [1, 1] } });
for (const [u, n, lv] of [['ann', 'Ann', 6], ['bob', 'Bob', 1], ['cat', 'Cat', 3], ['zed', 'Zed', 2]]) {
  const r = await fetch(base + '/ghost', { method: 'POST', headers: { Authorization: `Bearer dev:${u}` }, body: JSON.stringify({ name: n, snap: snapOf(lv) }) });
  if (!r.ok) log(`seed ghost ${u}: ${r.status}`);
}
const statsOf = async (u) => (await (await fetch(base + '/me', { headers: { Authorization: `Bearer dev:${u}` } })).json());
const before = { zed: await statsOf('zed'), wins: await (await fetch(base + '/leaderboard?board=wins&n=50')).json() };

async function tap(c, sel) {
  const r = await c.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return null; e.scrollIntoView({block:'nearest'}); const b=e.getBoundingClientRect(); return {x:b.left+b.width/2,y:b.top+b.height/2,w:b.width,h:b.height}})()`);
  if (!r || !r.w) return false;
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.y }] });
  await sleep(30);
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await c.frames(3);
  return true;
}
const vis = (sel) => `(()=>{const e=document.querySelector(${JSON.stringify(sel)}); return !!e && e.offsetParent !== null && getComputedStyle(e).visibility !== 'hidden'})()`;
const texts = (c, sel) => c.eval(`[...document.querySelectorAll(${JSON.stringify(sel)})].map(e=>e.textContent.trim())`);

async function open(w, h, label) {
  const c = await CDP.launch();
  tabs.push(c);
  await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  await c.viewport(w, h, 1, true);
  let wsSent = 0;
  c.on('Network.webSocketFrameSent', () => { wsSent++; });
  c.posts = [];
  // A ghost fight is a campaign-class battle for the special events (js/events), so /events/sync may
  // carry it; nothing may reach the arena's stats.
  c.on('Network.requestWillBeSent', (p) => { if (p.request.method !== 'GET' && p.request.method !== 'OPTIONS' && !p.request.url.includes('/arena/events/')) c.posts.push(p.request.method + ' ' + p.request.url); });
  c.wsSent = () => wsSent;
  await c.goto(`${web.base}/index.html?auto=1&dpr=1&arena=${encodeURIComponent(base)}&arenauid=zed`);
  ok(`${label}: boots to the hub`, await c.waitFor('window.__state && window.__state.mode === "hub"', 20000));
  ok(`${label}: ARENA button shows once the server answers`, await c.waitFor(`!document.getElementById('btnArena').classList.contains('hidden')`, 8000));
  return c;
}

try {
  // ── landscape phone ──────────────────────────────────────────────────
  const c = await open(844, 390, 'landscape');
  await tap(c, '#btnArena');
  ok('the panel opens on PLAY with three tabs', await c.waitFor(`document.getElementById('arena').classList.contains('show') && document.querySelectorAll('#arena .arenatabs .tab').length === 3 && document.querySelector('#arena .arenatabs .tab.on').dataset.tab === 'play'`, 3000));
  ok('PLAY lists the ghost row, not as "coming soon"', await c.eval(`!!document.querySelector('#arenaBody [data-a=ghosts]') && !document.querySelector('#arenaBody .mode.soon [data-a=ghosts]')`));
  const box = await c.eval(`(()=>{const s=document.querySelector('#arena .sheet').getBoundingClientRect(), x=document.getElementById('btnArenaClose').getBoundingClientRect(); return {top:x.top-s.top, right:s.right-x.right, fits: s.top>=0 && s.bottom<=innerHeight+1}})()`);
  ok('the X sits in the top-right corner and the sheet fits', box.top < 16 && box.right < 16 && box.fits, JSON.stringify(box));

  await tap(c, '#arena .arenatabs [data-tab=ghosts]');
  ok('GHOSTS lists other players\' ghosts', await c.waitFor(`document.querySelectorAll('#arenaBody .ghosts .lrow').length === 3`, 5000), JSON.stringify(await texts(c, '#arenaBody .lrow')));
  const gl = await texts(c, '#arenaBody .ghosts .lrow');
  ok('every one is tagged GHOST', gl.every((t) => t.startsWith('GHOST')), JSON.stringify(gl));
  ok('your own ghost is not offered to you', !gl.some((t) => t.includes('Zed')), JSON.stringify(gl));
  ok('the list shows a stronger one', gl.some((t) => /stronger/.test(t)), JSON.stringify(gl));
  await c.shot(join(SHOTS, 'arena_ghosts_landscape.png'));

  // ── a ghost fight: offline, labelled, never reported ──
  const ws0 = c.wsSent(), posts0 = c.posts.length;
  await c.eval(`window.__battles = []; addEventListener('ragdojo:battle', (e) => __battles.push(e.detail))`);
  const which = await c.eval(`[...document.querySelectorAll('#arenaBody .ghosts .lrow')].findIndex(r => r.textContent.includes('Bob'))`);
  await tap(c, `#arenaBody [data-a=ghost][data-i="${which}"]`);
  ok('FIGHT starts a ghost fight', await c.waitFor(`window.__state.mode === 'fight' && window.__ragdojo.match && window.__ragdojo.match.ghost`, 4000));
  const fi = await c.eval(`(()=>{const m=window.__ragdojo.match, e=m.enemies[0]; return {name:e.name, n:m.enemies.length, ghost:e.ghost, brainSave:!!m.brains[0].save, byKind:m.brains[0].byKind, net:!!m.net}})()`);
  ok('the opponent is labelled GHOST in the fight', fi.name === 'GHOST · BOB' && fi.n === 1 && fi.ghost, JSON.stringify(fi));
  ok('it fights with the uploaded save', fi.brainSave && fi.byKind && !fi.net, JSON.stringify(fi));
  await c.frames(40);
  await c.capture(join(SHOTS, 'arena_ghost_fight.png'));
  const hudName = await c.eval(`(()=>{const cv=document.getElementById('game'); return cv.width>0})()`);
  ok('the fight draws', hudName);
  await c.eval(`(()=>{const m=window.__ragdojo.match; const e=m.enemies[0]; e.hurt(1e6, {from:[e.x-30, e.y-80], kb: 300, stagger: 1})})()`);
  ok('winning shows the ghost result in the arena panel', await c.waitFor(`document.getElementById('arena').classList.contains('show') && /YOU WIN/.test(document.getElementById('arenaBody').textContent) && /GHOST/.test(document.getElementById('arenaBody').textContent)`, 8000),
    await c.eval(`document.getElementById('arenaBody').textContent.slice(0,200)`));
  ok('the result says it is not ranked', await c.eval(`/Not ranked/.test(document.getElementById('arenaBody').textContent)`));
  const bt = await c.eval('window.__battles');
  ok('the result is exposed for events, unranked', bt.length === 1 && bt[0].kind === 'ghost' && bt[0].src === 'campaign' && bt[0].ranked === false && bt[0].won === true, JSON.stringify(bt));
  ok('a ghost fight sends NOTHING: no WebSocket frame, no POST', c.wsSent() === ws0 && c.posts.length === posts0, `ws ${c.wsSent() - ws0}, posts ${JSON.stringify(c.posts.slice(posts0))}`);
  const after = { zed: await statsOf('zed'), wins: await (await fetch(base + '/leaderboard?board=wins&n=50')).json() };
  ok('a ghost fight changes no stats and no board', JSON.stringify(after) === JSON.stringify(before));
  await c.shot(join(SHOTS, 'arena_ghost_result.png'));
  await tap(c, '#arenaBody [data-a=ghostList]');
  ok('OTHER GHOSTS goes back to the list', await c.waitFor(`document.querySelectorAll('#arenaBody .ghosts .lrow').length === 3`, 4000));

  // ── boards ──
  await tap(c, '#arena .arenatabs [data-tab=boards]');
  ok('BOARDS: today, most battles first', await c.waitFor(`document.querySelectorAll('#arenaBody ol.board li').length === 3`, 5000));
  const today = await texts(c, '#arenaBody ol.board li');
  ok('today\'s order matches the server', /Bob.*5/.test(today[0]) && /Zed/.test(today[1]) && /Ann/.test(today[2]), JSON.stringify(today));
  ok('your row is marked', await c.eval(`document.querySelector('#arenaBody ol.board li.you')?.textContent.includes('Zed')`));
  const card = await c.eval(`document.querySelector('#arenaBody .statcard')?.textContent.replace(/\\s+/g,' ')`);
  ok('your stats card: name, rank, wins, losses, best streak, KOs, today', /Zed/.test(card) && /#2 for wins/.test(card) && /6\s*battles/.test(card) && /4\s*wins/.test(card) && /2\s*losses/.test(card) && /3\s*best streak/.test(card) && /9\s*KOs/.test(card) && /2\s*today/.test(card), card);
  await c.shot(join(SHOTS, 'arena_boards_landscape.png'));
  await tap(c, '#arenaBody .seg [data-b=wins]');
  ok('WINS board', await c.waitFor(`document.querySelector('#arenaBody .seg [data-b=wins]').classList.contains('on') && document.querySelectorAll('#arenaBody ol.board li').length === 25`, 5000));
  const wins = await texts(c, '#arenaBody ol.board li');
  ok('wins order matches the server', /Ann.*8$/.test(wins[0]) && /Zed.*4$/.test(wins[1]) && /Bob.*3$/.test(wins[2]) && /Cat.*2$/.test(wins[3]), JSON.stringify(wins.slice(0, 5)));
  const sc = await c.eval(`(()=>{const b=document.getElementById('arenaBody'); return {sh:b.scrollHeight, ch:b.clientHeight, top:b.scrollTop}})()`);
  ok('a long board scrolls inside the panel', sc.sh > sc.ch + 40, JSON.stringify(sc));
  const bb = await c.eval(`(()=>{const r=document.getElementById('arenaBody').getBoundingClientRect(); return {x:r.left+r.width/2, y:r.top+r.height*0.8, y2:r.top+8}})()`);
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bb.x, y: bb.y }] });
  for (let i = 1; i <= 8; i++) { await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: bb.x, y: bb.y - (bb.y - bb.y2) * i / 8 }] }); await sleep(16); }
  await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: bb.x, y: 2 }] });
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(300);
  const sc2 = await c.eval(`document.getElementById('arenaBody').scrollTop`);
  ok('a real touch drag scrolls the board', sc2 > sc.top + 30, `${sc.top} -> ${sc2}`);
  ok('a drag that ends off the sheet does not close it', await c.eval(`document.getElementById('arena').classList.contains('show')`));

  // Per arena type: flip LMS live the way agent C will (one line in MODES).
  await c.eval(`import(performance.getEntriesByType('resource').find((e) => e.name.includes('/net/panel.js')).name).then(m => { m.MODES.find(x => x.id === 'lms').live = true; })`);
  await tap(c, '#arenaBody .seg [data-b=battles]');
  ok('a typed board offers the arena types', await c.waitFor(`document.querySelectorAll('#arenaBody .seg.sub button').length === 5`, 4000), JSON.stringify(await texts(c, '#arenaBody .seg.sub button')));
  await tap(c, '#arenaBody .seg.sub [data-bt=lms]');
  ok('per-type board: LMS battles', await c.waitFor(`document.querySelectorAll('#arenaBody ol.board li').length === 2`, 4000));
  const lms = await texts(c, '#arenaBody ol.board li');
  ok('per-type order matches the server', /Bob.*5$/.test(lms[0]) && /Ann.*3$/.test(lms[1]), JSON.stringify(lms));
  await c.eval(`import(performance.getEntriesByType('resource').find((e) => e.name.includes('/net/panel.js')).name).then(m => { m.MODES.find(x => x.id === 'lms').live = false; })`);

  // Backdrop dismiss: press and release on the darkened area.
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 4, y: 4 }] });
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  ok('a tap on the backdrop closes the panel', await c.waitFor(`!document.getElementById('arena').classList.contains('show')`, 2000));
  await tap(c, '#btnArena');
  ok('reopening keeps the tab you were on', await c.waitFor(`document.querySelector('#arena .arenatabs .tab.on')?.dataset.tab === 'boards'`, 2000));
  await tap(c, '#btnArenaClose');
  ok('the X closes it', await c.waitFor(`!document.getElementById('arena').classList.contains('show')`, 2000));
  ok('landscape: zero console errors', c.errors.length === 0, c.errors.slice(0, 3).join(' | '));

  // ── portrait: the app is rotated ─────────────────────────────────────
  const p = await open(390, 844, 'portrait');
  await tap(p, '#btnArena');
  ok('portrait: the panel opens', await p.waitFor(`document.getElementById('arena').classList.contains('show')`, 3000));
  const fitsP = await p.eval(`(()=>{const s=document.querySelector('#arena .sheet').getBoundingClientRect(); return {l:s.left,t:s.top,r:s.right,b:s.bottom,w:innerWidth,h:innerHeight}})()`);
  ok('portrait: the rotated sheet fits the screen', fitsP.l >= -1 && fitsP.t >= -1 && fitsP.r <= fitsP.w + 1 && fitsP.b <= fitsP.h + 1, JSON.stringify(fitsP));
  await tap(p, '#arena .arenatabs [data-tab=ghosts]');
  ok('portrait: a real tap reaches the GHOSTS tab', await p.waitFor(`document.querySelectorAll('#arenaBody .ghosts .lrow').length === 3`, 5000));
  await p.shot(join(SHOTS, 'arena_ghosts_portrait.png'));
  await tap(p, '#arena .arenatabs [data-tab=boards]');
  ok('portrait: BOARDS', await p.waitFor(`document.querySelectorAll('#arenaBody ol.board li').length === 3`, 5000));
  await tap(p, '#arenaBody .seg [data-b=kos]');
  ok('portrait: a real tap switches board', await p.waitFor(`document.querySelector('#arenaBody .seg [data-b=kos]').classList.contains('on') && /Ann/.test(document.querySelector('#arenaBody ol.board li')?.textContent || '')`, 5000));
  await p.shot(join(SHOTS, 'arena_boards_portrait.png'));
  const xP = await p.eval(`(()=>{const x=document.getElementById('btnArenaClose').getBoundingClientRect(); return {w:x.width,h:x.height}})()`);
  await tap(p, '#btnArenaClose');
  ok('portrait: the X closes it', await p.waitFor(`!document.getElementById('arena').classList.contains('show')`, 2000), JSON.stringify(xP));
  ok('portrait: zero console errors', p.errors.length === 0, p.errors.slice(0, 3).join(' | '));

  // ── no server: nothing shows ─────────────────────────────────────────
  const d = await CDP.launch();
  tabs.push(d);
  await d.viewport(844, 390, 1, true);
  await d.goto(`${web.base}/index.html?auto=1&dpr=1&arena=${encodeURIComponent(`http://127.0.0.1:${P0 + 9}/gms/2d/ragdojo/arena`)}`);
  await d.waitFor('window.__state && window.__state.mode === "hub"', 20000);
  await sleep(1500);
  ok('no arena server: the ARENA button stays hidden', await d.eval(`document.getElementById('btnArena').classList.contains('hidden')`));
} catch (e) {
  ok('gate ran', false, e.stack);
}
log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
