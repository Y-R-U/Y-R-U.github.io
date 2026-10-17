#!/usr/bin/env node
// Free top-ups when the host runs out of online games: the sheet (Yes / No / Pass pitch / end-of-day note) on the host
// screen, the lobby start (server room and device room) and challenge creation, against the REAL payments handlers
// (~/cc/ionos/ragdojo-payments, test binary TestE2EServe on a throwaway DB) and a local Clued server. Nothing here can
// reach production: blockProd() fails any games.br8t.com API request, and the page's /api/br8t/* is proxied locally.
//   ~/.claude/bin/cdp start --port 9405 -- --use-angle=metal; CDP_PORT=9405 node tools/topup_e2e.mjs [SHOTS_DIR]
import { open } from './a_cdp.mjs';
import { startLocalServer, blockProd } from './lib/localserver.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { createSign, randomUUID } from 'node:crypto';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';

const OUT = process.argv[2] || join(tmpdir(), 'clued-topup-shots');
mkdirSync(OUT, { recursive: true });
const SITE = 'http://localhost:8888/gms/2d/clued/';
const PAYDIR = process.env.BR8T_PAYMENTS_DIR || join(homedir(), 'cc/ionos/ragdojo-payments');
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// --- tokens the local Clued server accepts (CLUED_TEST_CERTS); the payments harness reads their payload
const tmp = mkdtempSync(join(tmpdir(), 'clued-topup-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(tmp, 'k.pem'), '-out', join(tmp, 'c.pem'), '-days', '1', '-subj', '/CN=t'], { stdio: 'ignore' });
writeFileSync(join(tmp, 'certs.json'), JSON.stringify({ testkid: readFileSync(join(tmp, 'c.pem'), 'utf8') }));
const b64u = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
function token(uid) {
  const unsigned = b64u({ alg: 'RS256', kid: 'testkid', typ: 'JWT' }) + '.' + b64u({ aud: 'br8t-games', iss: 'https://securetoken.google.com/br8t-games',
    sub: uid, exp: now + 3600, iat: now - 10, name: 'Host E2E', firebase: { sign_in_provider: 'google.com' } });
  return unsigned + '.' + createSign('RSA-SHA256').update(unsigned).sign(readFileSync(join(tmp, 'k.pem'))).toString('base64url');
}

// --- the real payments handlers (test binary, so the production executable never trusts unsigned tokens)
const payBin = join(tmp, 'payments.test');
execFileSync('go', ['test', '-c', '-o', payBin, '.'], { cwd: PAYDIR, stdio: 'inherit' });
const pay = spawn(payBin, ['-test.run', '^TestE2EServe$', '-test.v'], { cwd: PAYDIR, env: { ...process.env, BR8T_E2E_SERVE: '127.0.0.1:0' }, stdio: ['ignore', 'pipe', 'inherit'] });
const PAY = await new Promise((res, rej) => {
  let buf = '';
  pay.stdout.on('data', c => { buf += c; const m = /listening (\S+)/.exec(buf); if (m) res(`http://${m[1]}`); });
  pay.on('exit', code => rej(new Error(`payments harness exited ${code}`)));
  setTimeout(() => rej(new Error('payments harness did not start')), 30000);
});
const P_API = `${PAY}/api/br8t/`;

const srv = await startLocalServer({ tag: 'clued-topup', env: { CLUED_TEST_CERTS: join(tmp, 'certs.json'), CLUED_ALLOWANCE_URL: P_API, CLUED_NO_RATE: '1' } });
const cleanup = () => { try { pay.kill(); } catch (e) {} srv.stop(); rmSync(tmp, { recursive: true, force: true }); };

// node-side account helpers, straight to the payments service
const authed = uid => ({ Authorization: `Bearer ${token(uid)}`, 'Content-Type': 'application/json' });
async function spend(uid, n) {
  for (let i = 0; i < n; i++) {
    const r = await fetch(P_API + 'allowance', { method: 'POST', headers: authed(uid), body: JSON.stringify({ game: 'clued', id: randomUUID() }) });
    if (r.status !== 200) throw new Error(`spend ${r.status}`);
  }
}
const claim = async uid => (await fetch(P_API + 'allowance/topup', { method: 'POST', headers: authed(uid), body: JSON.stringify({ game: 'clued', id: randomUUID() }) })).status;
const state = async uid => (await fetch(P_API + 'allowance?game=clued', { headers: authed(uid) })).json();

const FAKE_AUTH = `
const tok = () => { try { return localStorage.getItem('e2e.token'); } catch (e) { return null; } };
const user = () => (tok() ? { uid: 'e2e', name: 'Host E2E', anon: false } : null);
export class AccountConflict extends Error {}
export { AccountConflict as Conflict };
export async function signInGoogle() {}
export async function sendEmailLink() {}
export async function completeEmailLink() {}
export async function signOut() { localStorage.removeItem('e2e.token'); }
export const auth = { async ready() { return user(); }, get user() { return user(); }, get signedIn() { return !!tok(); }, onChange(fn) { fn(user()); return () => {}; },
  async getIdToken() { return tok(); }, signInGoogle, sendEmailLink, completeEmailLink, signOut,
  get shouldHint() { return false; }, markHinted() {}, takeConflict() { return null; } };`;

const b = await open({ width: 390, height: 844, mobile: true });
await blockProd(b.send);
let failTopUp = false, checkoutCalls = 0;
await b.send('Fetch.enable', { patterns: [{ urlPattern: '*/lib/auth/auth.js*' }, { urlPattern: 'http://localhost:8888/api/br8t/*' }] });
b.on('Fetch.requestPaused', async ({ requestId, request }) => {
  const done = (code, body, type = 'application/json') => b.send('Fetch.fulfillRequest', { requestId, responseCode: code,
    responseHeaders: [{ name: 'Content-Type', value: type }, { name: 'Cache-Control', value: 'no-store' }], body: Buffer.from(body).toString('base64') }).catch(() => {});
  if (/\/lib\/auth\/auth\.js/.test(request.url)) return done(200, FAKE_AUTH, 'text/javascript');
  const path = new URL(request.url).pathname.replace('/api/br8t/', '');
  if (failTopUp && path === 'allowance/topup') return b.send('Fetch.failRequest', { requestId, errorReason: 'ConnectionRefused' }).catch(() => {});
  if (path === 'checkout') { checkoutCalls++; return done(503, JSON.stringify({ error: 'checkout is not part of this test' })); }
  const h = Object.fromEntries(Object.entries(request.headers).map(([k, v]) => [k.toLowerCase(), v]));
  try {
    const r = await fetch(P_API + path + new URL(request.url).search, { method: request.method,
      headers: { ...(h.authorization ? { Authorization: h.authorization } : {}), 'Content-Type': 'application/json' }, body: request.postData });
    done(r.status, await r.text());
  } catch (e) { b.send('Fetch.failRequest', { requestId, errorReason: 'ConnectionRefused' }).catch(() => {}); }
});

const V = /main\.js\?v=(\d+)/.exec(await (await fetch(SITE)).text())?.[1];
const go = (name, params = {}) => b.eval(`import('./js/net/index.js?v=${V}').then(() => import('./js/ui/app.js?v=${V}')).then(m => { m.go(${JSON.stringify(name)}, ${JSON.stringify(params)}); return true; })`);
const text = sel => b.eval(`[...document.querySelectorAll(${JSON.stringify(sel)})].pop()?.textContent || ''`);
const has = sel => b.eval(`!!document.querySelector(${JSON.stringify(sel)})`);
const typeName = () => b.eval(`(() => { const i = [...document.querySelectorAll('.host-wrap input')].pop(); i.value = 'Hosty'; i.dispatchEvent(new Event('input')); return true; })()`);
const sheetGone = () => b.waitFor(`!document.querySelector('[data-sheet=topup]')`, 5000);
async function boot(uid) {
  await b.goto(`${SITE}?test&${srv.query}`);
  await b.eval(`localStorage.setItem('e2e.token', ${JSON.stringify(token(uid))}), true`);
  await b.goto(`${SITE}?test&${srv.query}`);
  await b.waitFor('window.__cluedReady');
  await sleep(300);
}
async function hostScreen(params = {}) {
  await go('host', params);
  await b.waitFor(`document.querySelector('[data-act=create]')`);
  await b.waitFor(`document.querySelector('[data-box=allowance] [data-allowance], [data-box=allowance] [data-panel]')`);
}
async function shots(name) {
  for (const [w, h, tag] of [[390, 844, 'portrait'], [844, 390, 'landscape']]) {
    await b.viewport(w, h);
    await sleep(500);
    const fits = await b.eval(`(() => { const c = document.querySelector('[data-sheet=topup]'); if (!c) return false; const r = c.getBoundingClientRect();
      const btns = [...c.querySelectorAll('.pop-actions .btn')].map(x => x.getBoundingClientRect());
      return r.left >= 0 && r.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth && btns.every(x => x.bottom <= innerHeight || c.scrollHeight > c.clientHeight); })()`);
    ok(fits, `${name} sheet fits ${w}x${h}`);
    await b.shot(`${OUT}/${name}-${tag}.png`);
  }
  await b.viewport(390, 844);
  await sleep(200);
}

try {
  // 1. host screen: none left → inline panel; Create → sheet; No closes; Yes → room → game starts
  let uid = 'uid-topup-host';
  await spend(uid, 5);
  await boot(uid);
  await hostScreen();
  await b.waitFor(`document.querySelector('[data-box=allowance] [data-act=topup-open]')`);
  ok(/Get 5 more free games/.test(await text('[data-act=topup-open]')), 'inline panel offers 5 more');
  await typeName();
  await b.click('[data-act=create]');
  await b.waitFor(`document.querySelector('[data-sheet=topup][data-state=offer]')`);
  const offer = await text('[data-sheet=topup]');
  ok(/Would you like another 5 free games\?/.test(offer), `sheet title: ${offer.slice(0, 60)}`);
  ok(/br8t Pass/.test(offer) && await has('[data-sheet=topup] [data-act=pass-monthly]') && await has('[data-sheet=topup] [data-act=pass-yearly]'), 'sheet pitches the Pass (monthly + yearly)');
  ok(await has('[data-sheet=topup] [data-act=topup-yes]') && await has('[data-sheet=topup] [data-act=topup-no]'), 'Yes and No');
  ok(await b.eval(`!document.querySelector('dialog[open]')`), 'in-page sheet, not a browser dialog');
  await shots('topup-offer');
  await b.click('[data-act=topup-no]');
  await sheetGone();
  ok(await has('[data-act=create]') && !(await b.eval('!!window.__cluedRoom')), 'No closes the sheet and stays on the host screen');
  ok((await state(uid)).topUps === 0, 'No claims nothing');
  // Escape and backdrop also dismiss
  await b.click('[data-act=topup-open]');
  await b.waitFor(`document.querySelector('[data-sheet=topup]')`);
  await b.key('Escape');
  await sheetGone();
  ok(true, 'Escape dismisses');
  // the phone's back button (any screen change) takes the sheet with it: no overlay left over the next screen
  await b.click('[data-act=topup-open]');
  await b.waitFor(`document.querySelector('[data-sheet=topup]')`);
  await b.eval('history.back(); true');
  await b.waitFor(`document.body.dataset.screen !== 'host'`, 5000);
  ok(await b.waitFor(`!document.querySelector('[data-sheet=topup]')`, 3000).catch(() => false), 'back button closes the sheet with the screen');
  await hostScreen();
  await typeName();
  await b.click('[data-act=create]');
  await b.waitFor(`document.querySelector('[data-sheet=topup][data-state=offer]')`);
  await b.click('[data-act=topup-yes]');
  await b.waitFor(`window.__cluedRoom?.st?.phase === 'lobby'`, 60000);
  let st = await state(uid);
  ok(st.topUps === 1 && st.perDay === 10 && st.usedToday === 5, `Yes granted 5 and carried on to the room: ${st.usedToday}/${st.perDay}, topUps ${st.topUps}`);
  await b.click('[data-act=start]');
  await b.waitFor(`window.__cluedRoom?.st?.phase === 'question'`, 20000);
  st = await state(uid);
  ok(st.usedToday === 6 && st.remaining === 4, `game started and spent one: ${st.usedToday} used, ${st.remaining} left`);

  // 2. server lobby: runs out after the room exists → Start → sheet → Yes → the same start goes through
  uid = 'uid-topup-lobby';
  await boot(uid);
  await hostScreen();
  await typeName();
  await b.click('[data-act=create]');
  await b.waitFor(`window.__cluedRoom?.st?.phase === 'lobby'`, 60000);
  await spend(uid, 5);
  await b.click('[data-act=start]');
  await b.waitFor(`document.querySelector('[data-sheet=topup][data-state=offer]')`);
  ok(await b.eval(`window.__cluedRoom.st.phase === 'lobby'`), 'refused start waits in the lobby behind the sheet');
  await b.click('[data-act=topup-yes]');
  await b.waitFor(`window.__cluedRoom?.st?.phase === 'question'`, 20000);
  st = await state(uid);
  ok(st.topUps === 1 && st.usedToday === 6, `lobby Yes → started: ${st.usedToday} used, topUps ${st.topUps}`);

  // 3. device (P2P) room: the page spends; same sheet, same retry
  uid = 'uid-topup-p2p';
  await boot(uid);
  await hostScreen({ via: 'p2p' });
  await typeName();
  await b.click('[data-act=create]');
  await b.waitFor(`window.__cluedRoom?.st?.phase === 'lobby'`, 60000);
  await spend(uid, 5);
  await b.click('[data-act=start]');
  await b.waitFor(`document.querySelector('[data-sheet=topup][data-state=offer]')`);
  await b.click('[data-act=topup-yes]');
  await b.waitFor(`window.__cluedRoom?.st?.phase === 'question'`, 20000);
  st = await state(uid);
  ok(st.topUps === 1 && st.usedToday === 6, `device room Yes → started: ${st.usedToday} used, topUps ${st.topUps}`);

  // 4. network failure on Yes: calm note, Pass still offered, Try again (same claim id) works
  uid = 'uid-topup-net';
  await spend(uid, 5);
  await boot(uid);
  await hostScreen();
  await b.click('[data-act=topup-open]');
  await b.waitFor(`document.querySelector('[data-sheet=topup][data-state=offer]')`);
  failTopUp = true;
  await b.click('[data-act=topup-yes]');
  await b.waitFor(`document.querySelector('[data-sheet=topup][data-state=error]')`);
  ok(/couldn’t add games just now/i.test(await text('.topup-note')) && await has('[data-sheet=topup] [data-act=pass-monthly]'), 'network error: calm note, Pass still offered');
  ok(/Try again/.test(await text('[data-act=topup-yes]')), 'Try again offered');
  await shots('topup-error');
  failTopUp = false;
  await b.click('[data-act=topup-yes]');
  await sheetGone();
  st = await state(uid);
  ok(st.topUps === 1 && st.remaining === 5, `retry granted once: topUps ${st.topUps}, ${st.remaining} left`);

  // 5. cap reached while the sheet was open: Yes → end-of-day note, no Yes
  uid = 'uid-topup-race';
  for (let i = 0; i < 2; i++) { await spend(uid, 5); await claim(uid); }
  await spend(uid, 5);
  await boot(uid);
  await hostScreen();
  await b.click('[data-act=topup-open]');
  await b.waitFor(`document.querySelector('[data-sheet=topup][data-state=offer]')`);
  ok(await claim(uid) === 200, 'last top-up claimed elsewhere');
  await spend(uid, 5);
  await b.click('[data-act=topup-yes]');
  await b.waitFor(`document.querySelector('[data-sheet=topup][data-state=done]')`);
  ok(!(await has('[data-sheet=topup] [data-act=topup-yes]')), 'cap hit on Yes → end-of-day note without Yes');
  await b.click('[data-act=topup-close]');
  await sheetGone();

  // 6. at the cap from the start (20 used): end-of-day sheet, Pass link, no Yes; nothing created
  uid = 'uid-topup-cap';
  for (let i = 0; i < 3; i++) { await spend(uid, 5); ok(await claim(uid) === 200, `top-up ${i + 1} of 3`); }
  await spend(uid, 5);
  ok(await claim(uid) === 429, 'fourth top-up refused by the server');
  await boot(uid);
  await hostScreen();
  ok(/That’s 20 games today/.test(await text('[data-panel=no-games]')) && !(await has('[data-act=topup-open]')), `inline panel at the cap: ${await text('[data-panel=no-games] b')}`);
  await typeName();
  await b.click('[data-act=create]');
  await b.waitFor(`document.querySelector('[data-sheet=topup][data-state=done]')`);
  const done = await text('[data-sheet=topup]');
  ok(/That’s 20 games today\. Nice!/.test(done) && /until tomorrow \(more at .+ your time\)/.test(done) && /br8t Pass for unlimited hosting/.test(done) && /joining is always free/.test(done), `end-of-day copy: ${done.slice(0, 160)}`);
  ok(!(await has('[data-sheet=topup] [data-act=topup-yes]')) && await has('[data-sheet=topup] [data-act=pass-monthly]'), 'no Yes; Pass link present');
  await shots('topup-done');
  await b.click('[data-sheet=topup] [data-act=pass-yearly]');
  await b.waitFor(`/unavailable|not part of this test/.test(document.querySelector('.topup-status')?.textContent || '')`, 5000);
  ok(checkoutCalls >= 1, 'Pass button opens checkout (stubbed here)');
  await b.click('[data-act=topup-close]');
  await sheetGone();
  ok(!(await b.eval('!!window.__cluedRoom')) && await has('[data-act=create]'), 'no room created at the cap');

  // 7. leaderboard challenge: none left → sheet (with a link-challenge way out) → Yes → challenge created
  uid = 'uid-topup-chal';
  await spend(uid, 5);
  await boot(uid);
  await b.eval(`window.__chal = undefined; import('./js/net/challenge.js?v=${V}').then(m => m.createChallenge({ title: 'Topup test', spec: { v: 1, mode: 'quick', rounds: [] },
    result: { score: 0, correct: 0, total: 2, answers: [], questions: [{ format: 'mc', prompt: 'One?', answer: 'a', choices: ['a', 'b'] }, { format: 'mc', prompt: 'Two?', answer: 'b', choices: ['a', 'b'] }] } }))
    .then(v => { window.__chal = v || 'none'; }, e => { window.__chal = 'error: ' + e.message; }); true`);
  await b.waitFor(`document.querySelector('.pop input.field')`);
  await b.eval(`(() => { const i = document.querySelector('.pop input.field'); i.value = 'Chally'; i.dispatchEvent(new Event('input')); return true; })()`);
  await b.click('.pop-actions .btn.primary');
  await b.waitFor(`document.querySelector('[data-sheet=topup][data-state=offer]')`);
  ok(await has('[data-sheet=topup] [data-act=extra-link]'), 'challenge sheet offers a link challenge instead');
  await b.click('[data-act=topup-yes]');
  await b.waitFor(`window.__chal !== undefined`, 15000);
  const chal = await b.eval('window.__chal');
  st = await state(uid);
  ok(chal?.id && st.topUps === 1 && st.usedToday === 6, `challenge created after Yes: ${JSON.stringify(chal)?.slice(0, 60)}, ${st.usedToday} used`);

  // 8. a Pass account or a fresh one never sees the sheet: plain allowance line
  uid = 'uid-topup-fresh';
  await boot(uid);
  await hostScreen();
  ok(/Online games today: 5 of 5 left/.test(await text('[data-box=allowance]')) && !(await has('[data-sheet=topup]')), `fresh account line: ${await text('[data-box=allowance]')}`);
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
