#!/usr/bin/env node
/**
 * The online client fixes that need real Chromes and a real arena server (fixer F2, 2026-10-13):
 *
 *   return    after a 1v1, the result card's X hangs up (no socket, no peer link) and the arena
 *             panel never pops over the campaign fight that follows, whatever the other side does (M2)
 *   hidden    a 1v1 master whose tab goes to the background hangs up at once: the guest hears
 *             `away` within ~2 s instead of waiting out the pings, and wins if it never comes back (H1)
 *   roomhide  a room master sent to the background is handed over within ~3 s (H1)
 *   stall     a master that freezes WITHOUT a visibility change (rAF stopped): the guest tells the server (H1)
 *   pause     PAUSE pauses practice vs bots (it is offline); an online round never pauses
 *
 *   node tools/arenafix.mjs [--only=return,hidden,...]
 *   node tools/arenafix.mjs --falsify       each suite against a copy with its fix undone
 *
 * Served from a temp copy (the falsifier breaks the copy, never the tree). Ports: arena
 * ARENA_TEST_PORT (default 18580), pages +1. ARENA_BIN = a prebuilt server.
 */
import { spawn, execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, cpSync, symlinkSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { CDP, ROOT, serve } from './cdp.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const log = (m) => process.stderr.write(m + '\n');
const ALL = ['return', 'hidden', 'roomhide', 'stall', 'pause'];
const only = args.only ? String(args.only).split(',') : ALL;

if (args.falsify) {
  const MUTANTS = [
    ['roomhide', 'js/net/panel.js', 'function msg(text) { const had = !!fight || shown(); stopFight(); offer = null; view = \'msg\'; note = esc(text); if (had) open(); else closeIdle(); paint(); }',
      'function msg(text) { stopFight(); offer = null; view = \'msg\'; note = esc(text); open(); paint(); }', 'a late message pops the panel'],
    ['return', 'js/net/panel.js', "setTimeout(() => { const had = !!fight || shown(); stopFight(); view = 'result'; if (had) open(); else closeIdle();",
      "setTimeout(() => { const had = true; stopFight(); view = 'result'; if (had) open(); else closeIdle();", 'a result after QUIT pops the panel'],
    ['return', 'js/net/panel.js', '    if (client && !fight) { client.unwait(); client.leave(); client.lobby(false); closeIdle(); view = \'home\'; }',
      '    if (client && !fight && view !== \'result\') { client.unwait(); client.leave(); client.lobby(false); view = \'home\'; }', 'the X keeps the line open'],
    ['hidden', 'js/net/panel.js', "if (document.hidden) { if (fight?.isMaster) client.hide(); }", 'if (false) {}', 'a hidden master stays on the line'],
    ['roomhide', 'js/net/client.js', '    this.ws.close(4001);', '', 'hide() does not hang up'],
    ['stall', 'js/net/fight.js', '    if (!this.isMaster) this.watchMaster(now);\n', '', 'guests never report a quiet master'],
    ['pause', 'js/main.js', 'if (match.net.client || !paused) match.net.step', 'match.net.step', 'practice runs on under PAUSE'],
  ];
  let bad = 0;
  for (const [suite, file, from, to, why] of MUTANTS) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), `--only=${suite}`], { env: { ...process.env, MUTATE: JSON.stringify([file, from, to]) }, encoding: 'utf8', timeout: 300000 });
    const red = r.status !== 0;
    if (!red) bad++;
    log(`${red ? 'red ' : 'SURVIVED'}  [${suite}] ${why}${red ? '  ' + ((r.stderr || '').match(/^(FAIL|STALE) .*/m)?.[0] || `exit ${r.status}`).slice(0, 120) : ''}`);
  }
  log(bad ? `\n${bad} mutant(s) survived` : `\nall ${MUTANTS.length} mutants turned their suite red`);
  process.exit(bad ? 1 : 0);
}

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? pass++ : fail++; log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };

const tmp = mkdtempSync(join(tmpdir(), 'arenafix-'));
const game = join(tmp, 'game');
for (const d of ['js', 'css']) cpSync(join(ROOT, d), join(game, d), { recursive: true });
for (const f of ['index.html', 'privacy.html', 'terms.html']) if (existsSync(join(ROOT, f))) cpSync(join(ROOT, f), join(game, f));
symlinkSync(join(ROOT, 'assets'), join(game, 'assets'));
const mut = process.env.MUTATE ? JSON.parse(process.env.MUTATE) : null;
if (mut) {
  const p = join(game, mut[0]);
  const src = readFileSync(p, 'utf8');
  if (!src.includes(mut[1])) { log(`STALE mutant: ${mut[1].slice(0, 70)}`); process.exit(3); }
  writeFileSync(p, src.replace(mut[1], mut[2]));
}
const bin = process.env.ARENA_BIN || join(tmp, 'arena');
if (!process.env.ARENA_BIN) execFileSync('go', ['build', '-o', bin, '.'], { cwd: join(ROOT, 'server'), stdio: 'inherit' });
const PORT = +process.env.ARENA_TEST_PORT || 18580;
const server = spawn(bin, [], {
  env: { ...process.env, ARENA_ADDR: `127.0.0.1:${PORT}`, ARENA_DB: join(tmp, 'a.db'), ARENA_ICE_URL: 'off', ARENA_ALLOWANCE_URL: 'off',
    ARENA_DEV_AUTH: '1', ARENA_ROOM_MS: '2500', ARENA_EARLY_FF_MS: '0' },
  stdio: ['ignore', 'ignore', 'pipe'],
});
let serverLog = '';
server.stderr.on('data', (d) => { serverLog += d; });
const arenaBase = `http://127.0.0.1:${PORT}/gms/2d/ragdojo/arena`;
for (let i = 0; i < 50; i++) { try { if ((await fetch(arenaBase + '/health')).ok) break; } catch {} await sleep(100); }
const web = await serve(game, PORT + 1);
const flags = ['--disable-features=WebRtcHideLocalIpsWithMdns', '--force-webrtc-ip-handling-policy=default'];
const tabs = [];
const cleanup = () => { for (const t of tabs) t.close(); web.close(); server.kill('SIGKILL'); rmSync(tmp, { recursive: true, force: true }); };
process.on('exit', cleanup);
process.on('SIGINT', () => process.exit(130));

// Page-side spies: live RTCPeerConnections, and every frame a WebSocket sends.
const SPY = `(()=>{ const O = window.RTCPeerConnection; window.__pcs = []; window.RTCPeerConnection = function(...a){ const pc = new O(...a); window.__pcs.push(pc); return pc; }; window.RTCPeerConnection.prototype = O.prototype;
  const send = WebSocket.prototype.send; window.__wsSent = []; window.__wss = []; WebSocket.prototype.send = function(d){ if (!window.__wss.includes(this)) window.__wss.push(this); if (typeof d === 'string') window.__wsSent.push(d); return send.call(this, d); }; })()`;
const LIVEPC = `window.__pcs.filter(p=>p.connectionState!=='closed' && p.signalingState!=='closed').length`;
const OPENWS = `window.__wss.filter(w=>w.readyState<2).length`;
const click = (c, sel) => c.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return false; e.click(); return true})()`);
let uid = 0;
async function tab(q) {
  const c = await CDP.launch({ args: flags });
  tabs.push(c);
  await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: SPY });
  await c.viewport(860, 400, 1, true);
  await c.goto(`${web.base}/index.html?auto=1&dpr=1&arena=${encodeURIComponent(arenaBase)}&arenauid=fix${process.pid}x${uid++}&${q}`);
  await c.waitFor(`document.getElementById('hub').classList.contains('show')`, 30000);
  await c.waitFor(`!document.getElementById('btnArena').classList.contains('hidden')`, 15000);
  return c;
}
async function find(c, name, mode) {
  await click(c, '#btnArena');
  await c.waitFor(`document.querySelector('[data-a=find][data-mode=${mode}]')`, 5000);
  await c.eval(`(()=>{const i=document.getElementById('arenaName'); i.value=${JSON.stringify(name)}; i.dispatchEvent(new Event('change'))})()`);
  await click(c, `[data-a=find][data-mode=${mode}]`);
  await c.waitFor(`window.__ragdojo && window.__ragdojo.arena.client`, 15000);
  await c.eval(`(()=>{const cl=window.__ragdojo.arena.client; window.__heard=[]; for (const t of ['result','void','out','master','cancel','left','away','back','closed']) cl.on(t, (m)=>window.__heard.push({...(m||{}), t, at: Date.now()}));})()`);
}
async function duel(q) {
  const A = await tab(q), B = await tab(q);
  await find(A, 'Kid A', 'duel');
  await find(B, 'Kid B', 'duel');
  await B.waitFor(`document.querySelector('[data-a=challenge]')`, 8000);
  await click(B, '[data-a=challenge]');
  for (const c of [A, B]) await c.waitFor(`document.querySelector('[data-a=accept]')`, 8000);
  for (const c of [A, B]) await click(c, '[data-a=accept]');
  for (const c of [A, B]) await c.waitFor(`window.__net && window.__net.match.phase === 2`, 20000);
  const roles = await Promise.all([A, B].map((c) => c.eval('window.__net.isMaster')));
  return roles[0] ? [A, B] : [B, A];
}
/** The tab goes to the background: hidden + visibilitychange, and rAF stops as it would. */
const HIDE = `(()=>{ Object.defineProperty(document,'hidden',{configurable:true,get:()=>true}); Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'hidden'});
  window.__raf = window.requestAnimationFrame; window.requestAnimationFrame = (cb) => { window.__held = cb; return 0; }; document.dispatchEvent(new Event('visibilitychange')); })()`;
const FREEZE = `(()=>{ window.__raf = window.requestAnimationFrame; window.requestAnimationFrame = (cb) => { window.__held = cb; return 0; }; })()`;
const heardAt = (c, t) => c.eval(`(window.__heard||[]).filter(h=>h.t===${JSON.stringify(t)}).map(h=>h.at)[0] || 0`);

async function close() { while (tabs.length) tabs.pop().close(); }

// ── return: no pop over the campaign, nothing left open ─────────────────
if (only.includes('return')) {
  log('\n── return: after a 1v1, back to the campaign');
  const [M, G] = await duel('arenabot=1&arenahp=0.08&arenasecs=30');
  const done = await Promise.all([M, G].map((c) => c.waitFor(`!!document.querySelector('#arenaBody h3')`, 120000)));
  ok('return: the 1v1 finished on both', done.every(Boolean));
  await click(M, '#btnArenaClose');
  await sleep(600);
  const st = await M.eval(`({pcs: ${LIVEPC}, ws: ${OPENWS}, client: !!window.__ragdojo.arena.client})`);
  ok('return: closing the result card leaves no live peer link and no open socket', st.pcs === 0 && st.ws === 0 && !st.client, JSON.stringify(st));
  await click(M, '#btnFight');
  await M.waitFor(`window.__state && window.__state.mode==='fight' && window.__ragdojo.match && !window.__ragdojo.match.net`, 8000);
  const t1 = await M.eval('window.__ragdojo.match.time');
  await click(G, '[data-a=leave]');   // the other side presses DONE: the server tells M "left"
  const popped = await M.waitFor(`document.getElementById('arena').classList.contains('show')`, 4000, 200);
  const t2 = await M.eval('window.__ragdojo.match ? window.__ragdojo.match.time : -1');
  ok('return: the arena panel does not pop over the campaign fight', !popped, await M.eval(`document.getElementById('arenaBody').textContent.slice(0,80)`));
  ok('return: and the campaign fight keeps running', t2 - t1 > 2, `${t1.toFixed(2)} -> ${t2.toFixed(2)}`);
  ok('return: zero console errors', ![M, G].some((c) => c.errors.length), [M, G].flatMap((c) => c.errors).slice(0, 2).join(' / '));
  await close();
  // QUIT mid-fight, straight into the campaign: whatever the server says next must not pop the panel.
  const [Q, O] = await duel('arenabot=1&arenahp=6&arenasecs=90');
  await sleep(1500);
  await click(Q, '#btnPause'); await click(Q, '#btnQuit');
  await click(Q, '#btnFight');
  await Q.waitFor(`window.__state && window.__state.mode==='fight' && window.__ragdojo.match && !window.__ragdojo.match.net`, 8000);
  const heard = await Q.waitFor(`(window.__heard||[]).some(h=>h.t==='result'||h.t==='out'||h.t==='left')`, 8000, 200);
  await sleep(1200);
  const pop2 = await Q.eval(`document.getElementById('arena').classList.contains('show')`);
  ok('return: after a QUIT, the server\'s answer does not pop the panel over the next fight', heard && !pop2, await Q.eval(`(window.__heard||[]).map(h=>h.t).join(',')`));
  await close();
}

// ── hidden: a 1v1 master goes to the background ─────────────────────────
if (only.includes('hidden')) {
  log('\n── hidden: the 1v1 master\'s tab goes to the background');
  const [M, G] = await duel('arenabot=1&arenahp=6&arenasecs=90');
  await sleep(1500);
  const t0 = Date.now();
  await M.eval(HIDE);
  const away = await G.waitFor(`(window.__heard||[]).some(h=>h.t==='away')`, 6000, 100);
  const awayMs = away ? (await heardAt(G, 'away')) - t0 : -1;
  ok('hidden: the guest hears the master is away within 2.5 s (not after the ping timeout)', away && awayMs < 2500, `${awayMs} ms`);
  const res = await G.waitFor(`(window.__heard||[]).some(h=>h.t==='result')`, 25000, 250);
  const r = await G.eval(`(window.__heard||[]).find(h=>h.t==='result') || null`);
  ok('hidden: not back within the grace = the master forfeits; the guest wins', res && r.winner === r.you && r.forfeit, JSON.stringify(r && { winner: r.winner, you: r.you, forfeit: r.forfeit, by: r.by, why: r.why }));
  await G.waitFor(`/YOU (WIN|LOSE)/.test(document.querySelector('#arenaBody h3')?.textContent || '')`, 5000);
  const card = await G.eval(`document.getElementById('arenaBody').textContent`);
  ok('hidden: the guest\'s card says it was their forfeit, not yours', /YOU WIN/.test(card) && !/You left/.test(card), card.slice(0, 120));
  await close();
}

// ── roomhide: a room master goes to the background ──────────────────────
if (only.includes('roomhide')) {
  log('\n── roomhide: a hill room\'s master goes to the background');
  const n = 3, ts = [];
  for (let i = 0; i < n; i++) ts.push(await tab('arenabot=1&arenahp=3&arenasecs=60'));
  for (const [i, c] of ts.entries()) await find(c, `Kid ${i}`, 'hill');
  const started = await Promise.all(ts.map((c) => c.waitFor(`window.__net && window.__net.match.phase === 2`, 40000)));
  ok('roomhide: the room started', started.every(Boolean));
  const roles = await Promise.all(ts.map((c) => c.eval('window.__net.isMaster')));
  const M = ts[roles.indexOf(true)], guests = ts.filter((c) => c !== M);
  await sleep(2000);
  const t0 = Date.now();
  await M.eval(HIDE);
  const got = await Promise.all(guests.map((c) => c.waitFor(`(window.__heard||[]).some(h=>h.t==='master')`, 8000, 100)));
  const at = await Promise.all(guests.map((c) => heardAt(c, 'master')));
  ok('roomhide: both guests are handed a new master within 2 s', got.every(Boolean) && at.every((a) => a - t0 < 2000), at.map((a) => a ? a - t0 : -1).join(', ') + ' ms');
  const flowing = await Promise.all(guests.map(async (c) => {
    if (await c.eval('window.__net.isMaster')) return true;
    const a = await c.eval('window.__net.m.snaps'); await sleep(1500); return (await c.eval('window.__net.m.snaps')) - a > 20;
  }));
  ok('roomhide: and the fight flows again from the new master', flowing.every(Boolean));
  // A room QUIT, straight into the campaign: the server's "you are out" must not pop the panel.
  const Q = guests[0];
  await click(Q, '#btnPause'); await click(Q, '#btnQuit');
  const heard = await Q.waitFor(`(window.__heard||[]).some(h=>h.t==='out' && h.you)`, 8000, 200);
  await click(Q, '#btnFight');
  await Q.waitFor(`window.__state && window.__state.mode==='fight' && window.__ragdojo.match && !window.__ragdojo.match.net`, 8000);
  // Anything the server might still say to an idle client (a stale cancel, a "left")…
  await Q.eval(`(()=>{const c=window.__ragdojo.arena.client; if (c) c._onServer({t:'left'});})()`);
  await sleep(1000);
  const pop = await Q.eval(`document.getElementById('arena').classList.contains('show')`);
  ok('roomhide: a room QUIT\'s "you are out" does not pop the panel over the next fight', heard && !pop, await Q.eval(`(window.__heard||[]).map(h=>h.t).join(',')`));
  await close();
}

// ── stall: frozen, no visibility event ──────────────────────────────────
if (only.includes('stall')) {
  log('\n── stall: the master freezes without going hidden');
  const [M, G] = await duel('arenabot=1&arenahp=6&arenasecs=90');
  await sleep(1500);
  const t0 = Date.now();
  await M.eval(FREEZE);
  const sent = await G.waitFor(`window.__wsSent.some(s=>/"t":"stall"/.test(s) && JSON.parse(s).ms >= 3000)`, 7000, 100);
  ok('stall: the guest reports the quiet master to the server within ~4 s', sent, `${Date.now() - t0} ms`);
  const note = await G.eval('window.__net && window.__net.masterQuiet > 0');
  ok('stall: and tells its player what is going on', note);
  await M.eval(`(()=>{ window.requestAnimationFrame = window.__raf; const cb = window.__held; window.__held = null; if (cb) requestAnimationFrame(cb); })()`);
  const cleared = await G.waitFor(`window.__wsSent.some(s=>/"t":"stall"/.test(s) && JSON.parse(s).ms === 0)`, 6000, 100);
  ok('stall: ms 0 when the master is back', cleared);
  // Frozen for good: after 10 s of reports a QUIT is the master's forfeit, and the HUD says so.
  await M.eval(FREEZE);
  const told = await G.waitFor(`/QUIT now counts as their forfeit/.test(window.__net && window.__net.masterQuiet >= 13000 ? 'QUIT now counts as their forfeit' : '')`, 20000, 250);
  ok('stall: after 13 s quiet the guest is told quitting is not its loss', told);
  const gslot = await G.eval('window.__net.you');
  await click(G, '#btnPause'); await click(G, '#btnQuit');
  const res = await G.waitFor(`(window.__heard||[]).some(h=>h.t==='result')`, 8000, 200);
  const r = await G.eval(`(window.__heard||[]).find(h=>h.t==='result') || null`);
  ok('stall: and the server records it as the frozen master\'s forfeit', res && r.winner === gslot && r.forfeit && r.why === 'stall' && r.by !== gslot, JSON.stringify(r && { winner: r.winner, by: r.by, why: r.why }));
  ok('stall: zero console errors on the guest', !G.errors.length, G.errors.slice(0, 2).join(' / '));
  await close();
}

// ── pause: practice pauses, online does not ─────────────────────────────
if (only.includes('pause')) {
  log('\n── pause: practice vs bots');
  const c = await tab('');
  await c.eval(`window.__ragdojo.arena.practise('lms', 2)`);
  await c.waitFor(`window.__ragdojo.match && window.__ragdojo.match.net && window.__ragdojo.match.phase === 2`, 15000);
  await click(c, '#btnPause');
  await sleep(300);
  const a = await c.eval('window.__ragdojo.match.time');
  await sleep(1500);
  const b = await c.eval('window.__ragdojo.match.time');
  ok('pause: PAUSE stops practice vs bots', Math.abs(b - a) < 0.01, `${a.toFixed(2)} -> ${b.toFixed(2)}`);
  await click(c, '#btnSetClose');
  await sleep(1000);
  const d = await c.eval('window.__ragdojo.match.time');
  ok('pause: and closing it carries on', d - b > 0.5, `${b.toFixed(2)} -> ${d.toFixed(2)}`);
  await close();
}

log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
