#!/usr/bin/env node
/**
 * The room modes for real: 3-4 headless Chromes join one room through the ARENA panel, the
 * server picks the master by measured ping, and scripted bots (?arenabot=1, the same input path
 * a thumb uses) play it out over WebRTC to an agreed result.
 *
 *   node tools/arenamulti.mjs                     lms x4, bandana x4, hill x3, then the migration test
 *   node tools/arenamulti.mjs --only=bandana      one suite (lms | bandana | hill | migrate)
 *   node tools/arenamulti.mjs --falsify           each suite against a build broken in the way it checks
 *
 * migrate: three players, Last Man Standing; the master's Chrome is KILLED mid-fight. The
 * fight must carry on under a new master and finish with a result both survivors agree on.
 *
 * The game is served from a temp copy (js, css, index.html; assets linked), so the falsifier
 * can break a copy and never the tree. Ports: arena 18100-18149, pages 9400-9449.
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
const SHOTS = process.env.SHOTS || join(ROOT, 'shots');
const SUITES = { lms: { mode: 'lms', n: 4 }, bandana: { mode: 'bandana', n: 4 }, hill: { mode: 'hill', n: 3 }, migrate: { mode: 'lms', n: 3, kill: true } };

if (args.falsify) {
  // Each suite against a copy broken in exactly the way that suite claims to catch.
  const MUTANTS = [
    ['lms', 'js/net/modes.js', 'if (alive.length === 1) { winner = alive[0].slot; ko = true; }', 'if (alive.length === 1 && v.timeUp) { winner = alive[0].slot; ko = true; }', 'nobody can win before time'],
    ['bandana', 'js/net/modes.js', '    m.scores[b.holder] += dt;', '', 'holding the bandana scores nothing'],
    ['bandana', 'js/net/wire.js', 'F.score = v.getUint16(o) / 10; o += 2;', 'F.score = v.getUint16(o) * 0; o += 2;', 'guests never see the scores'],
    ['hill', 'js/net/modes.js', 'if (z.holder >= 0) m.scores[z.holder] += dt;', '', 'the hill scores nothing'],
    ['migrate', 'js/net/fight.js', '    if (this.isMaster && !was) this.takeOver();', '    if (false) this.takeOver();', 'nobody takes over'],
    ['migrate', 'ENV', 'ARENA_MIGRATE_MS', '600000', 'the server never hands over'],
  ];
  let bad = 0;
  for (const [suite, file, from, to, why] of MUTANTS) {
    const env = { ...process.env, MUTATE: JSON.stringify([file, from, to]), QUICK: '1' };
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), `--only=${suite}`], { env, encoding: 'utf8', timeout: 420000 });
    const red = r.status !== 0;
    if (!red) bad++;
    log(`${red ? 'red ' : 'SURVIVED'}  [${suite}] ${why}${red ? '  ' + ((r.stderr || '').match(/^FAIL .*/m)?.[0] || `exit ${r.status}`).slice(0, 110) : ''}`);
  }
  log(bad ? `\n${bad} mutant(s) survived` : `\nall ${MUTANTS.length} mutants turned their suite red`);
  process.exit(bad ? 1 : 0);
}

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? pass++ : fail++; log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };

// ── a copy of the game to serve (and, for the falsifier, to break) ──────
const tmp = mkdtempSync(join(tmpdir(), 'arenamulti-'));
const game = join(tmp, 'game');
for (const d of ['js', 'css']) cpSync(join(ROOT, d), join(game, d), { recursive: true });
for (const f of ['index.html', 'privacy.html', 'terms.html']) if (existsSync(join(ROOT, f))) cpSync(join(ROOT, f), join(game, f));
symlinkSync(join(ROOT, 'assets'), join(game, 'assets'));
if (process.env.PANEL_PATCH) execFileSync('python3', [process.env.PANEL_PATCH, join(game, 'js/net/panel.js')], { stdio: 'ignore' });
const mut = process.env.MUTATE ? JSON.parse(process.env.MUTATE) : null;
const serverEnv = {};
if (mut && mut[0] === 'ENV') serverEnv[mut[1]] = mut[2];
else if (mut) {
  const p = join(game, mut[0]);
  const src = readFileSync(p, 'utf8');
  if (!src.includes(mut[1])) { log(`STALE mutant: ${mut[1].slice(0, 60)}`); process.exit(3); }
  writeFileSync(p, src.replace(mut[1], mut[2]));
}

const bin = process.env.ARENA_BIN || join(tmp, 'arena');
if (!process.env.ARENA_BIN) execFileSync('go', ['build', '-o', bin, '.'], { cwd: join(ROOT, 'server'), stdio: 'inherit' });
const PORT = +process.env.ARENA_TEST_PORT || 18100 + ((process.pid % 20) * 2);
const server = spawn(bin, [], {
  env: { ...process.env, ARENA_ADDR: `127.0.0.1:${PORT}`, ARENA_DB: join(tmp, 'a.db'), ARENA_ICE_URL: 'off', ARENA_ALLOWANCE_URL: 'off',
    ARENA_DEV_AUTH: '1', ARENA_ROOM_MS: '2500', ...serverEnv },
  stdio: ['ignore', 'ignore', 'pipe'],
});
let serverLog = '';
server.stderr.on('data', (d) => { serverLog += d; });
const arenaBase = `http://127.0.0.1:${PORT}/gms/2d/ragdojo/arena`;
for (let i = 0; i < 50; i++) { try { if ((await fetch(arenaBase + '/health')).ok) break; } catch {} await sleep(100); }
const web = await serve(game, process.env.ARENA_TEST_PORT ? PORT + 1 : 9400 + (process.pid % 20) * 2);
const flags = ['--disable-features=WebRtcHideLocalIpsWithMdns', '--force-webrtc-ip-handling-policy=default'];
const all = [];
const cleanup = () => { for (const t of all) t.close(); web.close(); server.kill('SIGKILL'); rmSync(tmp, { recursive: true, force: true }); };
process.on('exit', cleanup);
process.on('SIGINT', () => process.exit(130));

const click = (c, sel) => c.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return false; e.click(); return true})()`);

async function suite(name, { mode, n, kill }) {
  log(`\n── ${name}: ${mode} x${n}${kill ? ', the master is killed mid-fight' : ''}`);
  const tabs = [];
  const secs = mode === 'lms' ? 90 : 50;
  for (let i = 0; i < n; i++) {
    const c = await CDP.launch({ args: flags });
    tabs.push(c); all.push(c);
    await c.send('Network.setCacheDisabled', { cacheDisabled: true });
    await c.viewport(860, 400, 1, true);
    await c.goto(`${web.base}/index.html?auto=1&dpr=1&arenabot=1&arenahp=${kill ? 1.5 : 0.5}&arenasecs=${secs}&arena=${encodeURIComponent(arenaBase)}&arenauid=${name}${i}`);
  }
  for (const c of tabs) {
    await c.waitFor(`document.getElementById('hub').classList.contains('show')`, 30000);
    await c.waitFor(`!document.getElementById('btnArena').classList.contains('hidden')`, 15000);
  }
  for (const [i, c] of tabs.entries()) {
    await click(c, '#btnArena');
    await c.waitFor(`document.querySelector('[data-a=find][data-mode=${mode}]')`, 5000);
    await c.eval(`(()=>{const i=document.getElementById('arenaName'); if(!i) return; i.value='Kid ${i}'; i.dispatchEvent(new Event('change'))})()`);
    await click(c, `[data-a=find][data-mode=${mode}]`);
    // Every result, void and elimination this tab hears, for the checks below.
    await c.waitFor(`window.__ragdojo && window.__ragdojo.arena.client`, 15000);
    await c.eval(`(()=>{const cl=window.__ragdojo.arena.client; window.__heard=[]; for (const t of ['result','void','out','master','cancel']) cl.on(t, (m)=>window.__heard.push(m));})()`);
  }
  ok(`${name}: everyone lands in one room and sees the others`, (await Promise.all(tabs.map((c) => c.waitFor(`/${n} of 8/.test(document.getElementById('roomState')?.textContent||'')`, 10000)))).every(Boolean));
  await tabs[0].shot(join(SHOTS, `multi_${name}_room.png`));
  const started = await Promise.all(tabs.map((c) => c.waitFor(`window.__net && window.__net.match.phase >= 1`, 20000)));
  ok(`${name}: the countdown ends and the fight starts on every screen`, started.every(Boolean));
  const roles = await Promise.all(tabs.map((c) => c.eval(`window.__net ? window.__net.isMaster : null`)));
  ok(`${name}: exactly one master`, roles.filter((r) => r === true).length === 1, roles.join(','));
  const pl = serverLog.split('\n').filter((l) => / by ping /.test(l)).pop() || '';
  const [, meas, pairs] = pl.match(/(\d+)\/(\d+) measured/) || [];
  ok(`${name}: the master was picked from measured pings`, meas && meas === pairs && +pairs === n - 1, pl.replace(/^.*by ping /, ''));

  let aliveAtKill = 0;
  let master = tabs[roles.indexOf(true)], killedSlot = -1, killedName = '';
  const guestStats = [];
  let topScore = 0;
  const kos = [];
  let camN = 0, camIn = 0;
  let shot = false, deadline = Date.now() + 220000, killAt = Date.now() + 4000;
  const alive = () => tabs.filter((c) => !c.dead);
  while (Date.now() < deadline) {
    const done = await Promise.all(alive().map((c) => c.eval(`(window.__heard||[]).some(m=>m.t==='result'||m.t==='void')`).catch(() => false)));
    if (done.every(Boolean)) break;
    for (const c of alive()) {
      const s = await c.eval(`(()=>{const n=window.__net; if(!n||!n.stats) return null; const m=n.match; const half=(m.camH||700)*innerWidth/innerHeight/2;
        return {st:n.stats(), master:n.isMaster, slot:n.you, cam: m.all.filter(f=>!f.dead).every(f=>Math.abs(f.rag.centre()[0]-m.camX)<half && Number.isFinite(f.rag.y[0])),
          scores:m.scores.slice(), phase:m.phase}})()`).catch(() => null);
      if (!s) continue;
      if (!s.master) { guestStats.push({ ...s.st, slot: s.slot }); topScore = Math.max(topScore, ...s.scores); }
      if (s.phase === 2) { camN++; camIn += s.cam ? 1 : 0; }
      if (!shot && !s.master && s.phase === 2) {
        shot = true;
        await sleep(2500);
        await c.shot(join(SHOTS, `multi_${name}_guest.png`));
      }
    }
    if (kill && killedSlot < 0 && Date.now() > killAt) {
      const ph = await master.eval(`window.__net && window.__net.match.phase`).catch(() => 0);
      if (ph === 2 && await master.eval(`window.__net.match.all.filter(f=>!f.dead).length === ${n}`)) {
        killedSlot = await master.eval(`window.__net.you`);
        killedName = `Kid ${tabs.indexOf(master)}`;
        aliveAtKill = await master.eval(`window.__net.match.all.filter(f=>!f.dead).length`);
        log(`  killing the master (slot ${killedSlot}, ${killedName}) at ${await master.eval('Math.round(window.__net.match.clock)')} s left`);
        master.dead = true;
        master.close();
      }
    }
    await sleep(500);
  }
  const heard = await Promise.all(alive().map((c) => c.eval(`window.__heard`)));
  const results = heard.map((h) => h.find((m) => m.t === 'result'));
  ok(`${name}: every player still in reaches an agreed result (no void)`, results.every(Boolean) && !heard.some((h) => h.some((m) => m.t === 'void')),
    heard.map((h) => h.map((m) => m.t + (m.why ? ':' + m.why : '')).join('/')).join(' | '));
  if (results.every(Boolean)) {
    const winners = results.map((r) => (r.winner >= 0 ? r.names[r.winner] : 'draw'));
    ok(`${name}: they all name the same winner`, new Set(winners).size === 1, winners.join(','));
    ok(`${name}: and the same placings`, new Set(results.map((r) => JSON.stringify(r.place))).size === 1 && results[0].place.slice().sort().join() === Array.from({ length: n }, (_, i) => i + 1).join(),
      JSON.stringify(results[0].place));
    if (kill) {
      // Out at the moment it left: below everyone still standing then, above anyone already down.
      ok(`${name}: the killed master did not win, and placed as the next one out`, winners[0] !== killedName && results[0].place[killedSlot] === aliveAtKill,
        `winner ${winners[0]}, place ${JSON.stringify(results[0].place)}, ${aliveAtKill} were standing when it left`);
      ok(`${name}: not a forfeit — the fight itself finished`, results.every((r) => !r.forfeit));
    }
  }
  if (kill) {
    ok(`${name}: the server handed the fight to a new master`, /takes over/.test(serverLog));
    const mig = await Promise.all(alive().map((c) => c.eval(`window.__heard.filter(m=>m.t==='master').length`)));
    ok(`${name}: both survivors heard the hand-over`, mig.every((x) => x === 1), mig.join(','));
  }
  for (const c of alive()) { const v = await c.eval(`window.__lastVerdict || null`).catch(() => null); if (v) kos.push(!!v.ko && v.clock > 0.5); }
  if (mode === 'lms') ok(`${name}: it ended by knockout, not on the clock`, kos.length > 0 && kos.every(Boolean), kos.join(','));
  if (mode !== 'lms') ok(`${name}: somebody scored (as the guests saw it)`, topScore >= 3, `top ${topScore.toFixed(1)} s`);
  // A respawn lands across the page and the camera eases over to it, so allow the odd sample.
  ok(`${name}: everyone's camera keeps every live fighter in view`, camN > 10 && camIn / camN >= 0.9, `${camIn}/${camN} samples`);
  // The latest sample per guest; in the kill suite, only what came after the hand-over
  // (the gap itself is reported above, not averaged in).
  const last = new Map();
  for (const s of guestStats.filter((s) => s.snaps > 30 && (!kill || s.migrations > 0))) last.set(`${s.slot}/${s.migrations}`, s);
  const fin = [...last.values()];
  ok(`${name}: guests get ~30 snapshots/s`, fin.length > 0 && fin.every((s) => s.snapRate >= 24), fin.map((s) => s.snapRate).join(','));
  if (kill) {
    const ho = await Promise.all(alive().map((c) => c.eval(`window.__net ? window.__net.m.handoverMs || 0 : 0`).catch(() => 0)));
    log(`  hand-over gap as the surviving guest saw it: ${ho.filter(Boolean).join(', ')} ms`);
    // A dead socket hands over after 5 s (a shorter blip is not a hand-over), or sooner when
    // the guests report the master's snapshots stopped ({t:'stall'}).
    ok(`${name}: the hand-over is quick (under 6.5 s, not the 10 s reconnect grace)`, ho.some(Boolean) && ho.filter(Boolean).every((g) => g < 6500), ho.join(','));
  }
  ok(`${name}: guest interpolation rarely runs dry (<5%)`, fin.every((s) => s.underrunPct < 5), fin.map((s) => s.underrunPct).join(','));
  await alive()[0].shot(join(SHOTS, `multi_${name}_result.png`));
  const errs = tabs.flatMap((c) => c.errors);
  ok(`${name}: zero console errors`, errs.length === 0, errs.slice(0, 3).join(' / '));
  for (const c of tabs) { if (!c.dead) c.close(); c.dead = true; }
}

try {
  const names = args.only ? [args.only] : Object.keys(SUITES);
  for (const nm of names) await suite(nm, SUITES[nm]);
  const lb = await (await fetch(arenaBase + '/leaderboard?board=battles')).json();
  ok('agreed room results reached the leaderboard', (lb.rows || []).length > 0, `${(lb.rows || []).length} players`);
} catch (e) {
  ok('gate ran', false, e.stack);
}
if (fail) log(serverLog.split('\n').filter((l) => /match|master|VOID/.test(l)).slice(-12).join('\n'));
log(`\n${pass} passed, ${fail} failed`);
cleanup();
process.exit(fail ? 1 : 0);
