#!/usr/bin/env node
/**
 * QUICK FIGHT in real Chromes, driven by REAL touch events:
 *   solo     landscape 844x390: QUICK FIGHT on every mode (no PRACTICE), the waiting view
 *            (mode, countdown, you first, CANCEL, the * footnote), CANCEL really leaves, ghosts
 *            join the list one by one, the fight runs on this device with "*" names and no
 *            arena traffic, the result card (placings, not ranked, AGAIN re-queues, DONE), and
 *            the campaign-class event (`src: 'campaign', kind: 'quick'`)
 *   portrait 390x844 rotated: the same taps land; a ghost 1v1 is a best of 3
 *   duo      two Chromes press QUICK FIGHT on one mode: they see each other, two ghosts fill the
 *            room, the master runs them over WebRTC, both reach the same never-ranked result
 *   duel2    two Chromes press 1v1 QUICK FIGHT: the full window links them, both fight the same
 *            best of 3 (snapshots reach the guest) and reach the same result; a typed "✱" is dropped
 *   offline  the arena goes away: QUICK FIGHT is disabled and says why
 *
 *   node tools/quickbrowser.mjs [--only=solo|portrait|duo|duel2|offline]
 *   node tools/quickbrowser.mjs --falsify     each suite against a copy broken the way it checks
 *
 * Ports 9600-9649 (ARENA_TEST_PORT moves them). The game is served from a temp copy.
 */
import { spawn, execFileSync, execSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, cpSync, symlinkSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { CDP, ROOT, serve } from './cdp.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const log = (m) => process.stderr.write(m + '\n');
const SHOTS = process.env.SHOTS || join(ROOT, 'shots');
const P0 = +(process.env.ARENA_TEST_PORT || 9600);
const WINDOW_MS = 4500;

if (args.falsify) {
  const MUTANTS = [
    ['solo', 'js/net/panel.js', "const QUICK_NOTE = '*unfilled slots are filled by ghost players';", "const QUICK_NOTE = '';", 'no footnote'],
    ['solo', 'js/net/panel.js', "c.on('quickgo', (q) => { clearInterval(quickT); quickRoom = null; startQuickLocal(q); });", "c.on('quickgo', (q) => { clearInterval(quickT); quickRoom = null; });", 'a ghost-only quick fight never starts'],
    ['solo', 'js/net/panel.js', "src: 'campaign', kind: 'quick', ranked: false", "src: 'arena', kind: 'quick', ranked: false", 'the ghost-only fight claims to be an arena battle'],
    ['solo', 'js/net/panel.js', "else if (a === 'stop') { client?.unwait(); client?.leave(); client?.lobby(false); closeIdle();", "else if (a === 'stop') { client?.unwait();", 'CANCEL does not leave the window'],
    ['solo', 'js/net/quick.js', "name: String(g.name || 'Fighter*')", "name: String(g.name || 'Fighter*').replace(/\\*$/, '')", 'ghost names lose their *'],
    ['portrait', 'js/net/fight.js', "    if (w >= 0 || this.draws >= 3) {", "    if (true) {", 'a ghost 1v1 ends after one round'],
    ['duo', 'js/net/fight.js', '          if (this.brains[i]) { this.brains[i].update(STEP, mp); return; }\n', '', 'nobody runs the ghosts online'],
    ['duo', 'js/net/panel.js', "html += `<p class=\"fine\">Quick fight — not ranked.", "html += `<p class=\"fine\">Ranked.", 'the card does not say not ranked'],
    ['duel2', 'server/quick.go', '\th.quickPlan(m, false)\n\th.quickOffer(m)', '\tif len(m.seats) >= quickCap(m.typ) {\n\t\th.quickStart(m)\n\t\treturn\n\t}\n\th.quickPlan(m, false)\n\th.quickOffer(m)', 'a full 1v1 window starts with no offer (nobody links)'],
    ['duel2', 'js/net/panel.js', "name = nm.value.replace(STARS, '')", "name = nm.value", 'a typed star look-alike stays in the name'],
    ['offline', 'js/net/panel.js', 'const canQuick = canLobby && !arenaDown;', 'const canQuick = canLobby;', 'QUICK FIGHT stays on with the arena gone'],
  ];
  let bad = 0;
  for (const [suite, file, from, to, why] of MUTANTS) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), `--only=${suite}`], { env: { ...process.env, MUTATE: JSON.stringify([file, from, to]) }, encoding: 'utf8', timeout: 400000 });
    const red = r.status !== 0;
    if (!red) bad++;
    log(`${red ? 'red ' : 'SURVIVED'}  [${suite}] ${why}${red ? '  ' + ((r.stderr || '').match(/^FAIL .*/m)?.[0] || `exit ${r.status}`).slice(0, 120) : ''}`);
  }
  log(bad ? `\n${bad} mutant(s) survived` : `\nall ${MUTANTS.length} mutants turned their suite red`);
  process.exit(bad ? 1 : 0);
}

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? pass++ : fail++; log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };

// ── a copy of the game (the falsifier breaks the copy, never the tree) ──
const tmp = mkdtempSync(join(tmpdir(), 'quickbrowser-'));
const game = join(tmp, 'game');
for (const d of ['js', 'css']) cpSync(join(ROOT, d), join(game, d), { recursive: true });
for (const f of ['index.html', 'privacy.html', 'terms.html']) if (existsSync(join(ROOT, f))) cpSync(join(ROOT, f), join(game, f));
symlinkSync(join(ROOT, 'assets'), join(game, 'assets'));
const mut = process.env.MUTATE ? JSON.parse(process.env.MUTATE) : null;
function mutate(dir, file) {
  const p = join(dir, file);
  const src = readFileSync(p, 'utf8');
  if (!src.includes(mut[1])) { log(`STALE mutant: ${mut[1].slice(0, 70)}`); process.exit(3); }
  writeFileSync(p, src.replace(mut[1], mut[2]));
}
if (mut && !mut[0].startsWith('server/')) mutate(game, mut[0]);

// The arena binary: from server/ as it stands, or (another lane mid-edit) with HEAD's events files.
let bin = mut?.[0].startsWith('server/') ? '' : process.env.ARENA_BIN;
if (!bin) {
  const src = join(tmp, 'server');
  cpSync(join(ROOT, 'server'), src, { recursive: true });
  if (spawnSync('go', ['vet', '.'], { cwd: src }).status !== 0) {
    for (const f of ['main.go', 'events.go', 'eventart.go']) { try { writeFileSync(join(src, f), execSync(`git show HEAD:gms/2d/ragdojo/server/${f}`, { cwd: ROOT })); } catch {} }
  }
  if (mut?.[0].startsWith('server/')) mutate(src, mut[0].slice(7));
  bin = join(tmp, 'arena');
  execFileSync('go', ['build', '-o', bin, '.'], { cwd: src, stdio: 'inherit' });
}
let server = null, serverLog = '';
const arenaBase = `http://127.0.0.1:${P0}/gms/2d/ragdojo/arena`;
async function startServer() {
  server = spawn(bin, [], {
    env: { ...process.env, ARENA_ADDR: `127.0.0.1:${P0}`, ARENA_DB: join(tmp, 'a.db'), ARENA_ICE_URL: 'off', ARENA_ALLOWANCE_URL: 'off',
      ARENA_DEV_AUTH: '1', ARENA_QUICK_MS: String(WINDOW_MS), ARENA_EARLY_FF_MS: '0' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  server.stderr.on('data', (d) => { serverLog += d; });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(arenaBase + '/health')).ok) return; } catch {} await sleep(100); }
}
await startServer();
const web = await serve(game, P0 + 1);
const flags = ['--disable-features=WebRtcHideLocalIpsWithMdns', '--force-webrtc-ip-handling-policy=default'];
const all = [];
const cleanup = () => { for (const t of all) t.close(); web.close(); server?.kill('SIGKILL'); rmSync(tmp, { recursive: true, force: true }); };
process.on('exit', cleanup);
process.on('SIGINT', () => process.exit(130));

async function tap(c, sel) {
  const r = await c.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return null; e.scrollIntoView({block:'nearest'}); const b=e.getBoundingClientRect(); return {x:b.left+b.width/2,y:b.top+b.height/2,w:b.width,h:b.height,dis:!!e.disabled}})()`);
  if (!r || !r.w) return false;
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.y }] });
  await sleep(40);
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await c.frames(3);
  return true;
}
const body = (c) => c.eval(`document.getElementById('arenaBody').textContent`);
const listNames = (c) => c.eval(`[...document.querySelectorAll('#arenaBody .quicklist .lname')].map(e=>e.childNodes[0].textContent.trim())`);

async function open(w, h, uid, label, extra = '') {
  const c = await CDP.launch({ args: flags });
  all.push(c);
  await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  await c.viewport(w, h, 1, true);
  c.wsSent = 0;
  c.on('Network.webSocketFrameSent', () => { c.wsSent++; });
  await c.goto(`${web.base}/index.html?auto=1&dpr=1&arena=${encodeURIComponent(arenaBase)}&arenauid=${uid}${extra}`);
  const up = await c.waitFor(`window.__state && window.__state.mode === 'hub' && !document.getElementById('btnArena').classList.contains('hidden')`, 30000);
  ok(`${label}: boots to the hub with the ARENA button`, up);
  await c.eval(`window.__battles = []; addEventListener('ragdojo:battle', (e) => __battles.push(e.detail))`);
  return c;
}

// ── solo ─────────────────────────────────────────────────────────────
async function solo() {
  log('\n── solo: one person, landscape');
  const c = await open(844, 390, 'solo', 'solo');
  await tap(c, '#btnArena');
  ok('the arena panel opens', await c.waitFor(`document.getElementById('arena').classList.contains('show') && document.querySelector('[data-a=quick]')`, 5000));
  const btns = await c.eval(`({quick:[...document.querySelectorAll('#arenaBody [data-a=quick]')].map(b=>b.dataset.mode), find:document.querySelectorAll('#arenaBody [data-a=find]').length, friend:document.querySelectorAll('#arenaBody [data-a=friend]').length, practice:document.querySelectorAll('#arenaBody [data-a=practice]').length, text:[...document.querySelectorAll('#arenaBody [data-a=quick]')].map(b=>b.textContent)})`);
  ok('every mode has QUICK FIGHT, 1v1 included', btns.quick.join() === 'duel,bandana,hill,lms' && btns.text.every((t) => t === 'QUICK FIGHT'), JSON.stringify(btns));
  ok('FIND A FIGHT and FRIEND LINK stay; PRACTICE is gone', btns.find === 4 && btns.friend === 4 && btns.practice === 0, JSON.stringify(btns));
  await c.shot(join(SHOTS, 'quick_play_tab.png'));

  // CANCEL really leaves: after the window would have closed, nothing starts.
  await tap(c, '#arenaBody [data-a=quick][data-mode=lms]');
  ok('QUICK FIGHT opens the waiting view inside the sheet (no modal)', await c.waitFor(`document.getElementById('quickClock') && document.getElementById('arena').classList.contains('show') && !document.querySelector('.modal.show')`, 4000));
  ok('it counts down from 10 s (here the test window)', await c.waitFor(`/starts in \\d+ s/.test(document.getElementById('quickClock').textContent)`, 4000), await c.eval(`document.getElementById('quickClock')?.textContent`));
  const v = await c.eval(`({vs: document.querySelector('#arenaBody .vs')?.textContent, first: document.querySelector('#arenaBody .quicklist .lname')?.textContent, cancel: !!document.querySelector('#arenaBody [data-a=stop]') && document.querySelector('#arenaBody [data-a=stop]').textContent, note: document.querySelector('#arenaBody .quicknote')?.textContent})`);
  ok('it names the mode', v.vs === 'LAST MAN STANDING', v.vs);
  ok('you are first in the list', /^YOU/.test(v.first || ''), v.first);
  ok('there is a CANCEL button', v.cancel === 'CANCEL', v.cancel);
  ok('the footnote says it', v.note === '*unfilled slots are filled by ghost players', v.note);
  const foot = await c.eval(`(()=>{const n=document.querySelector('#arenaBody .quicknote'), b=document.querySelector('#arenaBody .vicbtns'); return n && b && n.getBoundingClientRect().top >= b.getBoundingClientRect().bottom - 1 && n.getBoundingClientRect().bottom <= innerHeight + 1})()`);
  ok('the footnote sits at the bottom, under CANCEL, on screen', foot);
  await c.shot(join(SHOTS, 'quick_waiting.png'));
  await tap(c, '#arenaBody [data-a=stop]');
  ok('CANCEL goes back to the modes', await c.waitFor(`document.querySelector('#arenaBody [data-a=quick]') && !document.getElementById('quickClock')`, 3000));
  await sleep(WINDOW_MS + 1500);
  ok('and nothing starts later (the window was left)', await c.eval(`window.__state.mode === 'hub' && !window.__ragdojo.arena.quickFight`), await c.eval(`window.__state.mode`));

  // A real one: the ghosts join one at a time, then the fight runs here.
  await tap(c, '#arenaBody [data-a=quick][data-mode=bandana]');
  const counts = [];
  const until = Date.now() + WINDOW_MS + 4000;
  while (Date.now() < until) {
    const l = await listNames(c).catch(() => null);
    if (!l) break;
    const n = l.filter((s) => /\*$/.test(s)).length;
    if (!counts.length || counts[counts.length - 1] !== n) counts.push(n);
    if (await c.eval(`!!window.__ragdojo.arena.quickFight`)) break;
    await sleep(120);
  }
  ok('ghosts join the list one at a time, like people', counts.length >= 3 && counts[0] === 0 && counts.every((n, i) => !i || n === counts[i - 1] + 1), counts.join(' → '));
  ok('a ghost-only quick fight starts', await c.waitFor(`window.__state.mode === 'fight' && window.__ragdojo.arena.quickFight && window.__ragdojo.match === window.__ragdojo.arena.quickFight.match`, 5000));
  const f = await c.eval(`(()=>{const m=window.__ragdojo.match; return {mode:m.modeId, names:m.all.map(x=>x.netName), hud:m.all.slice(1).map(x=>x.name), brains:window.__ragdojo.arena.quickFight.brains.slice(1).map(b=>b&&b.constructor.name), client:!!window.__ragdojo.arena.client}})()`);
  ok('you and three ghosts, every ghost name ending in *', f.mode === 'bandana' && f.names[0] === 'YOU' && f.names.length === 4 && f.names.slice(1).every((n) => /\*$/.test(n)), JSON.stringify(f.names));
  ok('the HUD names carry the * too', f.hud.every((n) => /\*$/.test(n)), JSON.stringify(f.hud));
  ok('each ghost has a personality brain', f.brains.every((b) => b === 'GhostBrain'), JSON.stringify(f.brains));
  ok('no arena connection is left open', !f.client);
  const ws0 = c.wsSent;
  const x0 = await c.eval(`window.__ragdojo.match.all.slice(1).map(f=>f.x)`);
  await sleep(4500);
  const x1 = await c.eval(`window.__ragdojo.match.all.slice(1).map(f=>f.x)`);
  ok('the ghosts play (they move)', x1.some((x, i) => Math.abs(x - x0[i]) > 30), x0.map((x, i) => Math.round(x1[i] - x)).join(','));
  ok('and nothing goes to the arena while it runs', c.wsSent === ws0, `${c.wsSent - ws0} frames`);
  await c.capture(join(SHOTS, 'quick_local_fight.png'));
  await c.eval(`(()=>{const q=window.__ragdojo.arena.quickFight, m=q.match; m.finishWith({winner:0, ko:false, place:[1,3,2,4]}, true); m.endT = 99;})()`);
  ok('the result card comes up', await c.waitFor(`document.getElementById('arena').classList.contains('show') && /Quick fight — not ranked/.test(document.getElementById('arenaBody').textContent)`, 6000), (await body(c)).slice(0, 160));
  const card = await c.eval(`({h:document.querySelector('#arenaBody h3')?.textContent, rows:[...document.querySelectorAll('#arenaBody .rows .r')].map(r=>r.textContent), again:!!document.querySelector('#arenaBody [data-a=quick]'), done:!!document.querySelector('#arenaBody [data-a=leave]'), text:document.getElementById('arenaBody').textContent})`);
  ok('it lists the placings, ghosts with *', card.h === 'YOU WIN' && card.rows.length === 4 && /^1stYOU/.test(card.rows[0]) && card.rows.slice(1).every((r) => /\*$/.test(r)), JSON.stringify(card.rows));
  ok('AGAIN and DONE', card.again && card.done);
  ok('never called a bot', !/\bbots?\b/i.test(card.text), card.text.slice(0, 120));
  const bt = await c.eval('window.__battles');
  const q = bt.find((b) => b.kind === 'quick');
  ok('the special events hear a campaign-class battle, kind quick', q && q.src === 'campaign' && q.ranked === false && q.won === true && /^quick:/.test(q.id), JSON.stringify(bt));
  await c.shot(join(SHOTS, 'quick_result.png'));
  await tap(c, '#arenaBody [data-a=quick]');
  ok('AGAIN puts you back in a quick window', await c.waitFor(`document.getElementById('quickClock') && /BANDANA/.test(document.querySelector('#arenaBody .vs').textContent)`, 4000));
  await tap(c, '#arenaBody [data-a=stop]');
  const me = await (await fetch(arenaBase + '/me', { headers: { Authorization: 'Bearer dev:solo' } })).json();
  ok('no stats were written for it', !(me.battles > 0), JSON.stringify(me).slice(0, 100));
  ok('zero console errors', c.errors.length === 0, c.errors.slice(0, 3).join(' / '));
  c.close();
}

// ── portrait ─────────────────────────────────────────────────────────
async function portrait() {
  log('\n── portrait: rotated 390x844, a ghost 1v1');
  const c = await open(390, 844, 'tall', 'portrait');
  await tap(c, '#btnArena');
  ok('portrait: the panel opens by touch', await c.waitFor(`document.getElementById('arena').classList.contains('show') && document.querySelector('[data-a=quick]')`, 5000));
  await tap(c, '#arenaBody [data-a=quick][data-mode=duel]');
  ok('portrait: QUICK FIGHT lands (the rotated tap maps)', await c.waitFor(`document.getElementById('quickClock') && document.querySelector('#arenaBody .vs').textContent === '1v1 · BEST OF 3'`, 4000));
  ok('portrait: the footnote is on screen', await c.eval(`(()=>{const n=document.querySelector('#arenaBody .quicknote'); if(!n) return false; const b=n.getBoundingClientRect(); return b.width>0 && b.left>=0 && b.top>=0 && b.right<=innerWidth+1 && b.bottom<=innerHeight+1})()`));
  await c.shot(join(SHOTS, 'quick_waiting_portrait.png'));
  await tap(c, '#arenaBody [data-a=stop]');
  ok('portrait: CANCEL lands', await c.waitFor(`!document.getElementById('quickClock') && document.querySelector('#arenaBody [data-a=quick]')`, 3000));
  await tap(c, '#arenaBody [data-a=quick][data-mode=duel]');
  ok('portrait: alone, a 1v1 quick fight starts against one ghost', await c.waitFor(`window.__ragdojo.arena.quickFight && window.__ragdojo.match === window.__ragdojo.arena.quickFight.match`, WINDOW_MS + 6000));
  const d = await c.eval(`(()=>{const q=window.__ragdojo.arena.quickFight; return {mode:q.mode, n:q.match.all.length, name:q.match.all[1].netName}})()`);
  ok('portrait: it is a 1v1 against a * name', d.mode === 'duel' && d.n === 2 && /\*$/.test(d.name), JSON.stringify(d));
  const endRound = (w) => c.eval(`(()=>{const q=window.__ragdojo.arena.quickFight; if(!q) return 'none'; const m=q.match; m.phase=2; m.finishWith({winner:${w}, ko:true}, false); m.endT=99; return q.round})()`);
  await endRound(0);
  ok('portrait: round 1 done, round 2 starts on a fresh page', await c.waitFor(`window.__ragdojo.arena.quickFight && window.__ragdojo.arena.quickFight.round === 2 && window.__ragdojo.match === window.__ragdojo.arena.quickFight.match && !window.__ragdojo.match.over`, 4000));
  await endRound(0);
  ok('portrait: two round wins end it: the card shows 2 – 0', await c.waitFor(`/YOU WIN 2 – 0/.test(document.querySelector('#arenaBody h3')?.textContent || '')`, 6000), await c.eval(`document.querySelector('#arenaBody h3')?.textContent`));
  await c.shot(join(SHOTS, 'quick_result_portrait.png'));
  await tap(c, '#arenaBody [data-a=leave]');
  ok('portrait: DONE lands', await c.waitFor(`document.querySelector('#arenaBody [data-a=quick]')`, 3000));
  ok('portrait: zero console errors', c.errors.length === 0, c.errors.slice(0, 3).join(' / '));
  c.close();
}

// ── duo ──────────────────────────────────────────────────────────────
async function duo() {
  log('\n── duo: two people + two ghosts, online');
  const extra = '&arenabot=1&arenasecs=25';
  const A = await open(860, 400, 'duoA', 'duo A', extra), B = await open(860, 400, 'duoB', 'duo B', extra);
  for (const [c, n] of [[A, 'Kid A'], [B, 'Kid B']]) {
    await tap(c, '#btnArena');
    await c.waitFor(`document.querySelector('[data-a=quick]')`, 5000);
    await c.eval(`(()=>{const i=document.getElementById('arenaName'); i.value=${JSON.stringify(n)}; i.dispatchEvent(new Event('change'))})()`);
  }
  await tap(A, '#arenaBody [data-a=quick][data-mode=hill]');
  await A.waitFor(`document.getElementById('quickClock')`, 4000);
  await sleep(600);
  await tap(B, '#arenaBody [data-a=quick][data-mode=hill]');
  ok('duo: B sees itself first, then A', await B.waitFor(`(()=>{const l=[...document.querySelectorAll('#arenaBody .quicklist .lname')].map(e=>e.textContent); return /^YOU/.test(l[0]) && l.includes('Kid A')})()`, 4000), JSON.stringify(await listNames(B)));
  ok('duo: A sees B join, live', await A.waitFor(`[...document.querySelectorAll('#arenaBody .quicklist .lname')].some(e=>e.textContent==='Kid B')`, 4000), JSON.stringify(await listNames(A)));
  const started = await Promise.all([A, B].map((c) => c.waitFor(`window.__net && window.__net.match && window.__net.match.phase >= 1`, WINDOW_MS + 15000)));
  ok('duo: the fight starts on both screens, online', started.every(Boolean));
  const roles = await Promise.all([A, B].map((c) => c.eval(`({m:window.__net.isMaster, names:window.__net.match.all.map(f=>f.netName), brains:window.__net.brains.map(b=>!!b)})`)));
  ok('duo: two people and two * ghosts, in that order', roles.every((r) => r.names.length === 4 && r.names.slice(2).every((n) => /\*$/.test(n)) && r.names.slice(0, 2).every((n) => !/\*$/.test(n))), JSON.stringify(roles.map((r) => r.names)));
  ok('duo: exactly one master', roles.filter((r) => r.m).length === 1);
  const guest = roles[0].m ? B : A;
  const g0 = await guest.eval(`window.__net.match.all.slice(2).map(f=>f.x)`);
  await sleep(5000);
  const g1 = await guest.eval(`window.__net.match.all.slice(2).map(f=>f.x)`);
  ok('duo: the guest sees the master\'s ghosts move', g1.some((x, i) => Math.abs(x - g0[i]) > 30), g0.map((x, i) => Math.round(g1[i] - x)).join(','));
  await A.capture(join(SHOTS, 'quick_duo_fight.png'));
  for (const c of [A, B]) await c.eval(`(()=>{const cl=window.__ragdojo.arena.client; window.__heard=[]; for (const t of ['result','void','cancel','out']) cl.on(t, (m)=>window.__heard.push(m));})()`);
  const done = await Promise.all([A, B].map((c) => c.waitFor(`(window.__heard||[]).some(m=>m.t==='result'||m.t==='void')`, 90000, 500)));
  ok('duo: both reach a result', done.every(Boolean));
  const res = await Promise.all([A, B].map((c) => c.eval(`window.__heard.find(m=>m.t==='result')`)));
  ok('duo: the same agreed result, quick, never counted', res.every((r) => r && r.quick && r.counted === false && !r.stats) && JSON.stringify(res[0].place) === JSON.stringify(res[1].place),
    JSON.stringify(res.map((r) => r && { w: r.winner, p: r.place, q: r.quick, c: r.counted })));
  ok('duo: the result names the ghosts with *', res[0] && res[0].names.filter((n) => /\*$/.test(n)).length === 2, JSON.stringify(res[0]?.names));
  ok('duo: the card says so, AGAIN and DONE', await A.waitFor(`/Quick fight — not ranked/.test(document.getElementById('arenaBody').textContent) && document.querySelectorAll('#arenaBody .rows .r').length === 4 && document.querySelector('#arenaBody [data-a=quick]') && document.querySelector('#arenaBody [data-a=leave]')`, 5000),
    (await body(A)).slice(0, 200));
  const ev = await A.eval(`window.__battles.find(b=>b.src==='arena')`);
  ok('duo: the events hear an arena battle (people ranked among themselves)', ev && ev.quick === true && ev.won === (res[0].hwin === res[0].you), JSON.stringify(ev));
  const lb = await (await fetch(arenaBase + '/leaderboard?board=battles')).json();
  ok('duo: nothing reached the boards', !(lb.rows || []).length, JSON.stringify(lb).slice(0, 120));
  await A.shot(join(SHOTS, 'quick_duo_result.png'));
  const errs = [A, B].flatMap((c) => c.errors);
  ok('duo: zero console errors', errs.length === 0, errs.slice(0, 3).join(' / '));
  A.close(); B.close();
}

// ── offline ──────────────────────────────────────────────────────────
async function offline() {
  log('\n── offline: the arena goes away');
  const c = await open(844, 390, 'off', 'offline');
  await tap(c, '#btnArena');
  await c.waitFor(`document.querySelector('[data-a=quick]')`, 5000);
  ok('offline: QUICK FIGHT is on while the arena answers', await c.eval(`[...document.querySelectorAll('#arenaBody [data-a=quick]')].every(b=>!b.disabled)`));
  server.kill('SIGKILL');
  await sleep(300);
  await tap(c, '#arenaBody [data-a=quick][data-mode=lms]');
  await c.waitFor(`/reach the arena|Lost the connection/.test(document.getElementById('arenaBody').textContent)`, 12000);
  await tap(c, '#btnArenaClose');
  await tap(c, '#btnArena');
  ok('offline: QUICK FIGHT is disabled', await c.waitFor(`[...document.querySelectorAll('#arenaBody [data-a=quick]')].length === 4 && [...document.querySelectorAll('#arenaBody [data-a=quick]')].every(b=>b.disabled)`, 4000));
  ok('offline: with a short reason', /arena is offline/i.test(await body(c)), (await body(c)).slice(0, 200));
  await startServer();
  await tap(c, '#btnArenaClose');
  await tap(c, '#btnArena');
  ok('offline: back on when the arena answers again', await c.waitFor(`[...document.querySelectorAll('#arenaBody [data-a=quick]')].every(b=>!b.disabled)`, 6000));
  c.close();
}

// ── duel2 ────────────────────────────────────────────────────────────
async function duel2() {
  log('\n── duel2: two people press 1v1 QUICK FIGHT');
  const extra = '&arenabot=1&arenasecs=20';
  const A = await open(860, 400, 'duelA', 'duel A', extra), B = await open(860, 400, 'duelB', 'duel B', extra);
  for (const [c, n] of [[A, 'Duel A\u2731'], [B, 'Duel B']]) {
    await tap(c, '#btnArena');
    await c.waitFor(`document.querySelector('[data-a=quick]')`, 5000);
    await c.eval(`(()=>{const i=document.getElementById('arenaName'); i.value=${JSON.stringify(n)}; i.dispatchEvent(new Event('change'))})()`);
  }
  ok('duel2: a typed star look-alike is dropped from the name', await A.eval(`document.getElementById('arenaName').value`) === 'Duel A', await A.eval(`document.getElementById('arenaName').value`));
  await tap(A, '#arenaBody [data-a=quick][data-mode=duel]');
  await A.waitFor(`document.getElementById('quickClock')`, 4000);
  await sleep(600);
  await tap(B, '#arenaBody [data-a=quick][data-mode=duel]');
  for (const c of [A, B]) await c.eval(`(()=>{const cl=window.__ragdojo.arena.client; window.__heard=[]; for (const t of ['result','void','cancel','out','quickgo']) cl.on(t, (m)=>window.__heard.push(m));})()`);
  const started = await Promise.all([A, B].map((c) => c.waitFor(`window.__net && window.__net.match && window.__net.match.phase >= 1`, 15000)));
  ok('duel2: the fight starts on both screens, online (not two ghost fights)', started.every(Boolean) && await A.eval(`!window.__ragdojo.arena.quickFight`));
  await sleep(5000);
  const st = await Promise.all([A, B].map((c) => c.eval(`(()=>{const cl=window.__ragdojo.arena.client, n=window.__net; return {master:n.isMaster, links:[...cl.links.keys()], me:cl.me&&cl.me.id, snaps:n.m.snaps, names:n.match.all.map(f=>f.netName)}})()`)));
  ok('duel2: each is linked to the other', st[0].links.length === 1 && st[1].links.length === 1 && st[0].links[0] === st[1].me && st[1].links[0] === st[0].me, JSON.stringify(st.map((s) => [s.me, s.links])));
  ok('duel2: exactly one master', st.filter((s) => s.master).length === 1);
  const g = st.find((s) => !s.master);
  ok('duel2: the guest receives the master\'s snapshots', g && g.snaps > 10, JSON.stringify(g && g.snaps));
  ok('duel2: two people, no ghost, no star', st.every((s) => s.names.length === 2 && s.names.every((n) => !/\*$/.test(n))) && st[1].names.includes('Duel A'), JSON.stringify(st.map((s) => s.names)));
  const done = await Promise.all([A, B].map((c) => c.waitFor(`(window.__heard||[]).some(m=>m.t==='result'||m.t==='void'||m.t==='cancel')`, 150000, 500)));
  ok('duel2: both reach the end', done.every(Boolean));
  const res = await Promise.all([A, B].map((c) => c.eval(`window.__heard.find(m=>m.t==='result'||m.t==='void'||m.t==='cancel')`)));
  ok('duel2: the same agreed best-of-3 result, quick, never counted', res.every((r) => r && r.t === 'result' && r.quick && r.counted === false && !r.stats) && res[0].winner === res[1].winner && JSON.stringify(res[0].score) === JSON.stringify(res[1].score) && Math.max(...res[0].score) === 2,
    JSON.stringify(res.map((r) => r && { t: r.t, w: r.winner, s: r.score, q: r.quick, c: r.counted, why: r.why })));
  const errs = [A, B].flatMap((c) => c.errors);
  ok('duel2: zero console errors', errs.length === 0, errs.slice(0, 3).join(' / '));
  A.close(); B.close();
}

const SUITES = { solo, portrait, duo, duel2, offline };
try {
  for (const [k, fn] of Object.entries(SUITES)) if (!args.only || args.only === k) await fn();
} catch (e) {
  ok('gate ran', false, e.stack);
}
if (fail) log(serverLog.split('\n').filter((l) => /match|quick|VOID/.test(l)).slice(-10).join('\n'));
log(`\n${pass} passed, ${fail} failed`);
cleanup();
process.exit(fail ? 1 : 0);
