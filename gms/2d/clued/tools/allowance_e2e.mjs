#!/usr/bin/env node
// Online-game allowance, host side: the host screen's line / Pass / none-left / signed-out states, "Got a Pass
// code?" → Settings › br8t Pass, and a real local clued server refusing a lobby start (payments 429) then allowing it.
// The br8t account (/lib/auth/auth.js) and the payments API (/api/br8t/*) are faked through CDP Fetch; the clued
// server checks a locally signed token (CLUED_TEST_CERTS) and spends against a mock payments server.
//   ~/.claude/bin/cdp start --port 9403 -- --use-angle=metal; CDP_PORT=9403 node tools/allowance_e2e.mjs [SHOTS_DIR]
import { open } from './a_cdp.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { createSign } from 'node:crypto';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] || join(tmpdir(), 'clued-allowance-shots');
mkdirSync(OUT, { recursive: true });
const SITE = 'http://localhost:8888/gms/2d/clued/';
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// --- a token the local server accepts
const tmp = mkdtempSync(join(tmpdir(), 'clued-allow-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(tmp, 'k.pem'), '-out', join(tmp, 'c.pem'), '-days', '1', '-subj', '/CN=t'], { stdio: 'ignore' });
writeFileSync(join(tmp, 'certs.json'), JSON.stringify({ testkid: readFileSync(join(tmp, 'c.pem'), 'utf8') }));
const b64u = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const unsigned = b64u({ alg: 'RS256', kid: 'testkid', typ: 'JWT' }) + '.' + b64u({ aud: 'br8t-games', iss: 'https://securetoken.google.com/br8t-games',
  sub: 'uid-e2e-host', exp: now + 3600, iat: now - 10, name: 'Host E2E', firebase: { sign_in_provider: 'google.com' } });
const TOKEN = unsigned + '.' + createSign('RSA-SHA256').update(unsigned).sign(readFileSync(join(tmp, 'k.pem'))).toString('base64url');

// --- the payments service: one state for the page (via CDP) and the clued server (via HTTP)
const P = { tier: 'free', used: 3, spend: 200, spends: [] };
function allowance() {
  if (P.tier === 'pass') return { game: 'clued', tier: 'pass', perDay: -1, usedToday: 0, remaining: -1, unlimited: true, resetsAt: now + 3600, pass: true, freePerDay: 3, promoPerDay: 2, promoUntil: '2026-12-31' };
  return { game: 'clued', tier: 'free', perDay: 5, usedToday: P.used, remaining: Math.max(0, 5 - P.used), unlimited: false, resetsAt: now + 3600, pass: false, freePerDay: 3, promoPerDay: 2, promoUntil: '2026-12-31' };
}
function payments(method, path, body, auth) {
  if (path.endsWith('/health')) return [200, { ok: true }];
  if (!auth) return [401, { error: 'sign in to your account' }];
  if (method === 'GET') return [200, allowance()];
  P.spends.push({ ...body, auth });
  if (P.spend === 429) return [429, { ok: false, error: 'no games left today', allowance: { ...allowance(), remaining: 0, usedToday: 5 } }];
  P.used++;
  return [200, { ok: true, allowance: allowance() }];
}
const pay = createServer((req, res) => {
  let raw = '';
  req.on('data', c => (raw += c));
  req.on('end', () => {
    const [code, out] = payments(req.method, req.url, raw ? JSON.parse(raw) : null, req.headers.authorization);
    res.writeHead(code, { 'Content-Type': 'application/json' }).end(JSON.stringify(out));
  });
});
await new Promise(r => pay.listen(0, '127.0.0.1', r));

// --- a local clued server with the gate on
const bin = join(tmp, 'clued');
execFileSync('go', ['build', '-o', bin, '.'], { cwd: join(HERE, '..', 'server'), stdio: 'inherit' });
const port = 18000 + Math.floor(Math.random() * 2000);
const srv = spawn(bin, [], { env: { ...process.env, CLUED_ADDR: `127.0.0.1:${port}`, CLUED_DATA: join(tmp, 'data'), CLUED_TEST_CERTS: join(tmp, 'certs.json'),
  CLUED_ORIGINS: 'http://localhost:8888', CLUED_ALLOWANCE_URL: `http://127.0.0.1:${pay.address().port}/api/br8t/`, CLUED_NO_RATE: '1' }, stdio: 'ignore' });
const API = `http://127.0.0.1:${port}/gms/2d/clued/api`;
for (let i = 0; i < 50; i++) { try { if ((await fetch(API + '/health')).ok) break; } catch (e) {} await sleep(200); }
const cleanup = () => { try { srv.kill(); } catch (e) {} pay.close(); rmSync(tmp, { recursive: true, force: true }); };

const FAKE_AUTH = `
const signedIn = () => { try { return localStorage.getItem('e2e.signedOut') !== '1'; } catch (e) { return true; } };
const user = () => (signedIn() ? { uid: 'uid-e2e-host', name: 'Host E2E', anon: false } : null);
export class AccountConflict extends Error {}
export { AccountConflict as Conflict };
export async function signInGoogle() { localStorage.removeItem('e2e.signedOut'); }
export async function sendEmailLink() {}
export async function completeEmailLink() {}
export async function signOut() { localStorage.setItem('e2e.signedOut', '1'); }
export const auth = { async ready() { return user(); }, get user() { return user(); }, get signedIn() { return signedIn(); }, onChange(fn) { fn(user()); return () => {}; },
  async getIdToken() { return signedIn() ? ${JSON.stringify(TOKEN)} : null; }, signInGoogle, sendEmailLink, completeEmailLink, signOut,
  get shouldHint() { return false; }, markHinted() {}, takeConflict() { return null; } };`;

const b = await open({ width: 384, height: 854, mobile: true });
await b.send('Fetch.enable', { patterns: [{ urlPattern: '*/lib/auth/auth.js*' }, { urlPattern: '*/api/br8t/*' }] });
b.on('Fetch.requestPaused', async ({ requestId, request }) => {
  let code = 200, type = 'application/json', body;
  if (/\/lib\/auth\/auth\.js/.test(request.url)) { type = 'text/javascript'; body = FAKE_AUTH; } else {
    const h = Object.fromEntries(Object.entries(request.headers).map(([k, v]) => [k.toLowerCase(), v]));
    const [c, out] = payments(request.method, new URL(request.url).pathname, request.postData ? JSON.parse(request.postData) : null, h.authorization);
    code = c; body = JSON.stringify(out);
  }
  await b.send('Fetch.fulfillRequest', { requestId, responseCode: code, responseHeaders: [{ name: 'Content-Type', value: type }, { name: 'Cache-Control', value: 'no-store' }],
    body: Buffer.from(body).toString('base64') }).catch(() => {});
});

const V = /main\.js\?v=(\d+)/.exec(await (await fetch(SITE)).text())?.[1];
const go = (name, params = {}) => b.eval(`import('./js/net/index.js?v=${V}').then(() => import('./js/ui/app.js?v=${V}')).then(m => { m.go(${JSON.stringify(name)}, ${JSON.stringify(params)}); return true; })`);
// earlier screens can stay in the DOM: always read the newest match
const text = sel => b.eval(`[...document.querySelectorAll(${JSON.stringify(sel)})].pop()?.textContent || ''`);
const typeName = () => b.eval(`(() => { const i = [...document.querySelectorAll('.host-wrap input')].pop(); i.value = 'Hosty'; i.dispatchEvent(new Event('input')); return true; })()`);
async function boot(signedOut = false) {
  await b.goto(`${SITE}?test&api=${encodeURIComponent(API)}`);
  await b.eval(`(${signedOut} ? localStorage.setItem('e2e.signedOut', '1') : localStorage.removeItem('e2e.signedOut'), true)`);
  await b.goto(`${SITE}?test&api=${encodeURIComponent(API)}`);
  await b.waitFor('window.__cluedReady');
  await sleep(300);
}
async function hostScreen(params = {}) {
  await go('host', params);
  await b.waitFor(`document.querySelector('[data-act=create]')`);
}

try {
  await boot();
  // 2 of 5 left
  P.tier = 'free'; P.used = 3;
  await hostScreen();
  await b.waitFor(`document.querySelector('[data-box=allowance] [data-allowance]')`);
  const line = await text('[data-box=allowance]');
  ok(/Online games today: 2 of 5 left/.test(line) && !/bonus/.test(line), `host line: ${line}`);
  await b.eval(`document.querySelector('[data-box=allowance]').scrollIntoView({ block: 'center' }), true`);
  await b.shot(`${OUT}/host-left.png`);

  // Pass
  P.tier = 'pass';
  await hostScreen({ seeded: true });
  await b.waitFor(`document.querySelector('[data-allowance=pass]')`);
  ok(/Unlimited online games with your br8t Pass/.test(await text('[data-box=allowance]')), 'host line with a Pass');
  await b.eval(`document.querySelector('[data-box=allowance]').scrollIntoView({ block: 'center' }), true`);
  await b.shot(`${OUT}/host-pass.png`);

  // none left: inline panel, Create stays on the host screen
  P.tier = 'free'; P.used = 5;
  await hostScreen({ seeded: true });
  await b.waitFor(`document.querySelector('[data-box=allowance] [data-panel=no-games]')`);
  const panel = await text('[data-panel=no-games]');
  ok(/No online games left today/.test(panel) && /More at .+ your time/.test(panel) && /monthly or yearly/.test(panel), `none-left panel: ${panel}`);
  await b.eval(`document.querySelector('[data-panel=no-games]').scrollIntoView({ block: 'center' }), true`);
  await b.shot(`${OUT}/host-none.png`);
  await b.click('[data-act=create]');
  await sleep(1200);
  ok(await b.eval(`!!document.querySelector('[data-act=create]') && !window.__cluedRoom`), 'no room created with none left');
  ok(await b.eval(`!document.querySelector('.popup, dialog[open]')`), 'no modal');
  await b.click('[data-act=pass-code]');
  await b.waitFor(`document.querySelector('[data-set=pass] input.field')`);
  await sleep(400);
  ok(await b.eval(`(() => { const r = document.querySelector('[data-set=pass]').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })()`), 'Got a Pass code? opens Settings › br8t Pass in view');
  await b.shot(`${OUT}/settings-pass.png`);

  // signed out: a sign-in note; Create asks for sign-in inline
  await boot(true);
  P.used = 3;
  await hostScreen();
  await b.waitFor(`document.querySelector('[data-allowance=signin]')`);
  ok(/needs a free br8t sign-in/.test(await text('[data-box=allowance]')), 'signed-out note');
  await typeName();
  await b.click('[data-act=create]');
  await b.waitFor(`document.querySelector('.net-signin [data-act=signin]')`);
  ok(true, 'Create asks for sign-in inline');
  await b.eval(`document.querySelector('.net-signin').scrollIntoView({ block: 'center' }), true`);
  await b.shot(`${OUT}/host-signedout.png`);

  // lobby: the server spends at start; 429 → inline panel, still in the lobby; then a granted start
  await boot();
  P.tier = 'free'; P.used = 3; P.spend = 429; P.spends = [];
  await hostScreen();
  await b.waitFor(`document.querySelector('[data-box=allowance] [data-allowance]')`);
  await typeName();
  await b.click('[data-act=create]');
  await b.waitFor(`window.__cluedRoom?.st?.phase === 'lobby'`, 60000);
  ok(P.spends.length === 0, 'creating a room spends nothing');
  await b.click('[data-act=start]');
  await b.waitFor(`document.querySelector('[data-box=limit] [data-panel=no-games]')`);
  ok(P.spends.length === 1 && P.spends[0].game === 'clued' && P.spends[0].auth === `Bearer ${TOKEN}`, `server spent the host's game: ${JSON.stringify(P.spends.map(s => s.game))}`);
  ok(await b.eval(`window.__cluedRoom.st.phase === 'lobby'`), 'refused start stays in the lobby');
  await sleep(1500);
  ok(await b.eval(`!!document.querySelector('[data-box=limit] [data-panel=no-games]')`), 'panel survives state pushes');
  await b.eval(`document.querySelector('[data-box=limit]').scrollIntoView({ block: 'center' }), true`);
  await b.shot(`${OUT}/lobby-none.png`);
  P.spend = 200;
  await b.click('[data-act=start]');
  await b.waitFor(`window.__cluedRoom?.st?.phase === 'question'`, 15000);
  ok(P.spends.length === 2 && P.spends[1].id === P.spends[0].id, 'retry of the same game reuses its id, then starts');

  // device (P2P) room: no server in the loop, the hosting page spends before the start
  await boot();
  P.used = 3; P.spend = 429; P.spends = [];
  await hostScreen({ via: 'p2p' });
  await b.waitFor(`[...document.querySelectorAll('[data-box=allowance] [data-allowance]')].length`);
  ok(/2 of 5 left/.test(await text('[data-box=allowance]')), 'device host screen shows the allowance');
  await typeName();
  await b.click('[data-act=create]');
  await b.waitFor(`window.__cluedRoom?.st?.phase === 'lobby'`, 60000);
  await b.click('[data-act=start]');
  await b.waitFor(`document.querySelector('[data-box=limit] [data-panel=no-games]')`);
  ok(P.spends.length === 1 && P.spends[0].auth === `Bearer ${TOKEN}` && /^[0-9a-f-]{36}$/.test(P.spends[0].id), 'device room spent from the page');
  ok(await b.eval(`window.__cluedRoom.st.phase === 'lobby'`), 'device room refused start stays in the lobby');
  await b.eval(`document.querySelector('[data-box=limit]').scrollIntoView({ block: 'center' }), true`);
  await b.shot(`${OUT}/p2p-lobby-none.png`);
  P.spend = 200;
  await b.click('[data-act=start]');
  await b.waitFor(`window.__cluedRoom?.st?.phase === 'question'`, 15000);
  ok(P.spends.length === 2 && P.spends[1].id === P.spends[0].id, 'device room retry reuses its id, then starts');
} catch (e) {
  fails++;
  console.log('FAIL', e.message);
  await b.shot(`${OUT}/error.png`).catch(() => {});
  console.log(b.logs.slice(-15).join('\n'));
}
cleanup();
console.log(`shots in ${OUT}`);
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
