#!/usr/bin/env node
// Online room → stats: a local clued server, the host in headless Chrome (real room screen, real clicks on the answers),
// a second player joining through the API. Asserts the podium path records one 'online' game with players + placing.
// Needs the :8888 site server, Go, and ~/.claude/bin/cdp start --port 9480 -- --use-angle=metal.
// Usage: node tools/stats_room_e2e.mjs [shotsDir]
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { open } from './a_cdp.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = 'http://localhost:8888/gms/2d/clued/';
const OUT = process.argv[2] || tmpdir();
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log('ok  ', msg); } else { fail++; console.log('FAIL', msg); } };
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

const port = await freePort();
const dataDir = mkdtempSync(join(tmpdir(), 'clued-stats-'));
const bin = join(dataDir, 'clued');
execFileSync('go', ['build', '-o', bin, '.'], { cwd: join(HERE, '..', 'server'), env: { ...process.env, CGO_ENABLED: '0' } });
const srv = spawn(bin, [], { env: { ...process.env, CLUED_ADDR: `127.0.0.1:${port}`, CLUED_DATA: join(dataDir, 'data'), CLUED_ORIGINS: 'http://localhost:8888' }, stdio: 'ignore' });
const API = `http://127.0.0.1:${port}/gms/2d/clued/api`;
for (let i = 0; i < 50; i++) { try { if ((await fetch(API + '/health')).ok) break; } catch (e) {} await sleep(100); }
const post = (path, body) => fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:8888' }, body: JSON.stringify(body) }).then(r => r.json());

const b = await open({ port: 9480, width: 384, height: 854, dpr: 2, mobile: true });
try {
  await b.goto('about:blank');
  await b.goto(`${SITE}?noauth=1&api=${encodeURIComponent(API)}`);
  await b.waitFor('window.__cluedReady', 20000);
  await b.eval(`localStorage.clear(); localStorage.setItem('clued.settings', JSON.stringify({ timerSec: 0, bgm: false })); true`);
  const code = await b.eval(`(async () => {
    const netm = await import('./js/net/index.js?v=' + window.__clued.BUILD);
    const c = window.__cluedCtx;
    const spec = c.makeSpec('quick', [{ format: 'mc', packs: ['capitals'], count: 3, opts: { answers: 4 } }], 'stats-room');
    const { questions } = await c.buildQuestions(spec);
    const T = netm.getTransport('server');
    const res = await T.create({ hostName: 'Me', spec, title: 'Stats room', questions: questions.slice(0, 3), answerSec: 10, gapSec: 3, public: false });
    sessionStorage.setItem('clued.room.' + res.code, JSON.stringify({ key: res.playerKey, id: res.playerId, via: 'server' }));
    c.go('room', { code: res.code, key: res.playerKey, st: res.room, via: 'server' }, { replace: true, skipGuard: true });
    return res.code;
  })()`);
  ok(/^[A-Z2-9]{5}$/.test(code), `room ${code} created`);
  const bot = await post(`/rooms/${code}/join`, { name: 'Bot' });
  ok(!!bot.playerKey, 'second player joined through the API');
  await b.waitFor(`window.__cluedRoom?.st?.players?.length === 2`, 10000);
  await b.click('[data-act=start]');
  let answered = 0;
  for (let guard = 0; guard < 400; guard++) {
    const st = await b.eval(`window.__cluedRoom ? { phase: window.__cluedRoom.st.phase, q: window.__cluedRoom.st.q } : null`);
    if (st?.phase === 'final') break;
    if (st?.phase === 'question' && await b.eval(`!!document.querySelector('.choices:not(.locked) .choice:not(:disabled)')`)) {
      await b.click('.choices:not(.locked) .choice:not(:disabled)', { index: answered % 2 });
      answered++;
      await post(`/rooms/${code}/answer`, { key: bot.playerKey, q: st.q, given: 3, correct: false, ms: 2000 }).catch(() => {});
    }
    await sleep(250);
  }
  await b.waitFor(`window.__cluedRoom?.st?.phase === 'final'`, 30000);
  await sleep(800);
  await b.shot(join(OUT, 'stats-room-final.png'));
  const s = await b.eval(`JSON.parse(localStorage.getItem('clued.stats') || '{}')`);
  const e = s.h?.[0];
  ok(answered === 3, `host answered 3 questions by tapping (${answered})`);
  ok(e?.m === 'online' && e.n === 2 && e.q === 3 && e.pl >= 1 && e.rk && !e.v, `podium recorded an online game: ${JSON.stringify(e)}`);
  ok(s.m?.online?.[0] === 1 && s.games === 1 && s.f?.mc?.[1] >= 1, 'online row + per-format results');
  ok(!JSON.stringify(s).includes(code) && !JSON.stringify(s).includes('Bot'), 'no room code or player names stored');
  // the final state keeps arriving (SSE pings, host actions): still one game
  await sleep(2500);
  ok((await b.eval(`JSON.parse(localStorage.getItem('clued.stats')).h.length`)) === 1, 'still exactly one game after more final states');
  await b.eval(`location.reload(); true`);
  await sleep(2500);
  await b.waitFor('window.__cluedReady', 20000);
  await sleep(2500);
  ok((await b.eval(`JSON.parse(localStorage.getItem('clued.stats')).h.length`)) === 1, 'a refresh back into the final room does not record it twice');
  await b.eval(`window.__cluedCtx.reset('stats'); true`);
  await sleep(600);
  ok(await b.eval(`[...document.querySelectorAll('.st-tile')].some(t => /Online wins/.test(t.textContent) && /1 room/.test(t.textContent))`), 'stats page shows the room under online');
  await b.shot(join(OUT, 'stats-room-page.png'));
} catch (e) {
  fail++; console.log('FAIL (threw)', e.message);
  await b.shot(join(OUT, 'stats-room-error.png')).catch(() => {});
} finally {
  b.close();
  srv.kill();
  rmSync(dataDir, { recursive: true, force: true });
}
console.log(`stats_room_e2e: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
