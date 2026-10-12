#!/usr/bin/env node
/**
 * Two headless Chromes play a real 1v1 best of 3 over WebRTC through a real arena server:
 * lobby -> challenge -> measured ping -> accept -> rounds (master swaps) -> agreed result ->
 * stats. Both players are scripted bots (?arenabot=1) driving the SAME input path a thumb does.
 * Also measures what the guest actually sees: snapshot rate, interpolation delay, underruns,
 * and snapshot-made -> snapshot-shown latency across the two tabs.
 *
 *   node tools/arenagate.mjs          localhost, dev tokens
 *   node tools/arenagate.mjs --lan    the page on this Mac's 192.168.* address, served by the
 *                                     arena binary itself in ARENA_LAN mode (what lan.sh runs)
 */
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir, networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { CDP, ROOT, serve } from './cdp.mjs';

const LAN = process.argv.includes('--lan');
const SHOTS = process.env.SHOTS || join(ROOT, 'shots');
const log = (m) => process.stderr.write(m + '\n');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? pass++ : fail++; log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };

const SITE = join(ROOT, '..', '..', '..');
const tmp = mkdtempSync(join(tmpdir(), 'arenagate-'));
const bin = process.env.ARENA_BIN || join(tmp, 'arena');
if (!process.env.ARENA_BIN) execFileSync('go', ['build', '-o', bin, '.'], { cwd: join(ROOT, 'server'), stdio: 'inherit' });

const lanIP = Object.values(networkInterfaces()).flat().find((a) => a && a.family === 'IPv4' && /^192\.168\./.test(a.address))?.address;
if (LAN && !lanIP) { log('no 192.168.* address on this machine'); process.exit(2); }
const P0 = +(process.env.ARENA_TEST_PORT || 9310);
const PORT = LAN ? P0 + 1 : P0;
const host = LAN ? lanIP : '127.0.0.1';
const env = { ...process.env, ARENA_ADDR: `127.0.0.1:${PORT}`, ARENA_DB: join(tmp, 'a.db'),
  ARENA_ICE_URL: 'off', ARENA_ALLOWANCE_URL: 'off' };
if (!LAN) Object.assign(env, { ARENA_DEV_AUTH: '1' });
// --lan runs the real server/lan.sh (Aaron's kids' launcher): it binds this Mac's 192.* address only.
const server = LAN
  ? spawn(join(ROOT, 'server', 'lan.sh'), [], { env: { ...process.env, PORT: String(PORT), DB: join(tmp, 'a.db'), ARENA_BIN: bin, LAN_IP: lanIP, ANSWERS: join(tmp, 'answers.json') }, stdio: ['ignore', 'ignore', 'pipe'] })
  : spawn(bin, [], { env, stdio: ['ignore', 'ignore', 'pipe'] });
let serverLog = '';
server.stderr.on('data', (d) => { serverLog += d; });
const arenaBase = `http://${host}:${PORT}/gms/2d/ragdojo/arena`;
for (let i = 0; i < 50; i++) { try { if ((await fetch(arenaBase + '/health')).ok) break; } catch {} await sleep(100); }
if (LAN) {
  const st = async (u) => { try { return (await fetch(u)).status; } catch { return 'refused'; } };
  const base = `http://${lanIP}:${PORT}`;
  ok('lan.sh: the game is served', await st(`${base}/gms/2d/ragdojo/index.html`) === 200);
  ok('lan.sh: so is /lib/auth/ (the page imports it)', await st(`${base}/lib/auth/auth.js`) === 200);
  const hidden = await Promise.all(['/index.html', '/gms/2d/ragdojo/server/hub.go', '/.git/config', '/gms/2d/ragdojo/js/', '/gms/3d/'].map((p) => st(base + p)));
  ok('lan.sh: nothing else of the site checkout, no listings', hidden.every((x) => x === 404), hidden.join(','));
  ok('lan.sh: bound to the 192.* address only (not 127.0.0.1)', await st(`http://127.0.0.1:${PORT}/gms/2d/ragdojo/arena/health`) === 'refused');
}

const web = LAN ? null : await serve(ROOT, P0 + 2);
const pageBase = LAN ? `http://${lanIP}:${PORT}/gms/2d/ragdojo/index.html` : `${web.base}/index.html`;
const LAGMS = +(process.env.LAG || 0);
const common = `auto=1&dpr=1&arenabot=1&arenahp=0.4&arenasecs=45${LAGMS ? `&arenalag=${LAGMS}` : ''}${LAN ? '' : `&arena=${encodeURIComponent(arenaBase)}`}`;
const flags = ['--disable-features=WebRtcHideLocalIpsWithMdns', '--force-webrtc-ip-handling-policy=default'];
const tabs = [];
const cleanup = () => { for (const t of tabs) t.close(); web?.close(); server.kill('SIGKILL'); rmSync(tmp, { recursive: true, force: true }); };
process.on('exit', cleanup);

try {
  for (const uid of ['alice', 'bob']) {
    const c = await CDP.launch({ args: flags });
    tabs.push(c);
    await c.send('Network.setCacheDisabled', { cacheDisabled: true });
    await c.viewport(900, 420, 1, true);
    await c.goto(`${pageBase}?${common}${LAN ? '' : `&arenauid=${uid}`}`);
  }
  const [A, B] = tabs;
  for (const c of tabs) {
    await c.waitFor(`!document.getElementById('startBtn').classList.contains('hidden')`, 20000);
    await c.eval(`document.getElementById('hub').classList.contains('show') || document.getElementById('startBtn').click()`);
  }
  for (const c of tabs) {
    // On a 192.* page DEV is off, so there is no __state: wait for the hub itself.
    ok('boots to hub', await c.waitFor(`document.getElementById('hub').classList.contains('show')`, 20000));
    ok('ARENA button shows once the server answers', await c.waitFor(`!document.getElementById('btnArena').classList.contains('hidden')`, 8000));
  }
  const click = (c, sel) => c.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return false; e.click(); return true})()`);
  const typeName = async (c, n) => {
    await c.eval(`(()=>{const i=document.getElementById('arenaName'); i.value=${JSON.stringify(n)}; i.dispatchEvent(new Event('change'))})()`);
  };
  await click(A, '#btnArena');
  await A.waitFor(`document.querySelector('[data-a=find]')`, 5000);
  await typeName(A, 'Kid A');
  ok('every mode is playable, none "coming soon"', await A.eval(`document.querySelectorAll('#arenaBody [data-a=find]').length >= 4 && !document.querySelector('#arenaBody .mode.soon')`));
  await click(A, '[data-a=find]');
  await click(B, '#btnArena');
  await B.waitFor(`document.querySelector('[data-a=find]')`, 5000);
  await typeName(B, 'Kid B');
  await click(B, '[data-a=find]');
  ok('B sees A waiting, by name, with signal bars', await B.waitFor(`document.querySelector('#arenaBody .lrow .bars') && /Kid A/.test(document.querySelector('#arenaBody .lrow').textContent)`, 8000));
  if (!await B.eval(`!!document.querySelector('[data-a=challenge]')`)) {
    for (const c of tabs) log('  arena: ' + await c.eval(`document.getElementById('arenaBody').textContent.slice(0,300)`) + ' | errors: ' + c.errors.join(' / ') + ' | ' + c.logs.slice(-5).join(' / '));
  }
  await click(B, '[data-a=challenge]');
  for (const c of tabs) ok('offer screen', await c.waitFor(`document.getElementById('arenaPing')`, 8000));
  const measured = await B.waitFor(`/\\d+ ms/.test(document.getElementById('arenaPing').textContent)`, 12000);
  const pingText = await B.eval(`document.getElementById('arenaPing').textContent`);
  ok('the real ping is measured and shown before accepting', measured, pingText);
  ok('the link is direct (WebRTC), not the relay', !/relay/.test(pingText), pingText);
  await B.shot(join(SHOTS, `arena_offer${LAN ? '_lan' : ''}.png`));
  for (const c of tabs) await click(c, '[data-a=accept]');
  for (const c of tabs) ok('fight starts', await c.waitFor(`document.getElementById('hub').classList.contains('show') === false && !document.getElementById('arena').classList.contains('show')`, 10000));

  // Watch the fight: per-round net stats from whoever is the guest, plus latency joins.
  const made = {}, shown = {}, rounds = [];
  let shot = false, touched = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 240000) {
    const done = await Promise.all(tabs.map((c) => c.eval(`!!document.querySelector('#arenaBody h3')`).catch(() => false)));
    if (done.every(Boolean)) break;
    for (const c of tabs) {
      const s = await c.eval(`(()=>{const n=window.__net; if(!n) return null; const st=n.stats(); return {round:n.round, st, made:n.m.made, shown:n.m.shown, actSeq:n.actSeq}})()`).catch(() => null);
      if (!s) continue;
      if (s.st.role === 'master') Object.assign(made, s.made);
      else {
        Object.assign(shown, s.shown);
        const r = rounds.find((x) => x.round === s.round);
        if (r) Object.assign(r, s.st); else rounds.push({ round: s.round, ...s.st });
        if (!shot && s.st.phase === 2) {
          shot = true;
          await sleep(1500);
          await c.shot(join(SHOTS, `arena_guest${LAN ? '_lan' : ''}.png`));
          for (const t of tabs) {
            const v = await t.eval(`(()=>{const m=window.__net.match; const half=(m.camH||700)*innerWidth/innerHeight/2;
              return {cam:[m.camX,m.camY], onScreen:m.all.every(f=>Math.abs(f.rag.centre()[0]-m.camX)<half && Number.isFinite(f.rag.y[0]))}})()`);
            ok(`${t === c ? 'guest' : 'master'} camera is finite and both fighters are in view`, v.cam.every(Number.isFinite) && v.onScreen, JSON.stringify(v));
          }
          // A REAL touch on the strike half goes through Input -> NetFight -> the reliable lane.
          const before = s.actSeq;
          for (const type of ['touchStart', 'touchEnd']) {
            await c.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: 760, y: 200, id: 7 }] });
          }
          await sleep(150);
          touched = (await c.eval(`window.__net ? window.__net.actSeq : 0`)) > before;
        }
      }
    }
    await sleep(400);
  }
  const res = await Promise.all(tabs.map((c) => c.eval(`(()=>{const h=document.querySelector('#arenaBody h3'); return h ? h.textContent : null})()`)));
  ok('both players reach the result card', res.every(Boolean), res.join(' | '));
  ok('results agree: one WIN, one LOSE', res.filter((t) => /WIN/.test(t || '')).length === 1 && res.filter((t) => /LOSE/.test(t || '')).length === 1);
  ok('a real touch on the guest sends a strike', touched === true);
  const statsShown = await Promise.all(tabs.map((c) => c.eval(`/Arena wins/.test(document.getElementById('arenaBody').textContent)`)));
  ok('both see their arena stats', statsShown.every(Boolean));
  const lb = await (await fetch(arenaBase + '/leaderboard?board=battles')).json();
  ok('the agreed result reached the leaderboard', lb.rows?.length === 2 && lb.rows.every((r) => r.value === 1) && lb.rows.map((r) => r.name).sort().join() === 'Kid A,Kid B', JSON.stringify(lb.rows));
  ok('master swaps between rounds (server log)', /r2 master/.test(serverLog));
  const gh = await (await fetch(arenaBase + '/ghosts')).json();
  ok('playing a match left both players\' ghosts (real loadout snapshot)', gh.ghosts?.length === 2 && gh.ghosts.every((g) => g.snap?.v === 1 && g.snap.t) &&
    gh.ghosts.map((g) => g.name).sort().join() === 'Kid A,Kid B', JSON.stringify(gh.ghosts));
  await tabs[0].shot(join(SHOTS, `arena_result${LAN ? '_lan' : ''}.png`));

  // Guest-side feel numbers.
  const lat = Object.keys(shown).filter((k) => made[k]).map((k) => shown[k] - made[k]).sort((a, b) => a - b);
  const pct = (p) => lat[Math.min(lat.length - 1, Math.floor(lat.length * p))];
  for (const r of rounds) {
    log(`  round ${r.round}: snaps ${r.snapRate}/s, interp ${r.delay} ms, jitter ${r.jitterMs} ms, rtt ${r.rtt} ms, ` +
      `underruns ${r.underrunPct}%, direct ${r.direct}, reseeds ${r.reseeds}, corrections ${r.corrections}, maxErr ${Math.round(r.maxErr)}`);
  }
  log(`  made->shown latency over ${lat.length} snapshots: median ${pct(0.5)} ms, p95 ${pct(0.95)} ms`);
  ok('guest receives ~30 snapshots/s', rounds.length > 0 && rounds.every((r) => r.snapRate >= 25), rounds.map((r) => r.snapRate).join(','));
  ok('guest interpolation rarely runs dry (<3% of frames)', rounds.every((r) => r.underrunPct < 3), rounds.map((r) => r.underrunPct).join(','));
  ok('guest-visible latency of the opponent under 150 ms + half the RTT (median)', lat.length > 50 && pct(0.5) < 150 + LAGMS / 2, `${pct(0.5)} ms`);
  const errs = tabs.flatMap((c) => c.errors);
  ok('zero console errors', errs.length === 0, errs.slice(0, 3).join(' / '));
} catch (e) {
  ok('gate ran', false, e.stack);
}
log(`\n${pass} passed, ${fail} failed`);
cleanup();
process.exit(fail ? 1 : 0);
