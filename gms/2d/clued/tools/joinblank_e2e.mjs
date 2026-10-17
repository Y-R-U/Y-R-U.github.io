// JOINUX: a ?join= link must always reach the name prompt, or a visible panel with a way out. Never a blank page.
//   fontstall  fonts.googleapis.com never answers: the page used to stay blank (no frame, no boot guard)
//   reload     the page reloads on the join screen (the account layer adopting a newer cloud save does this): back on the name prompt, not home
//   bootreload a module stalls during boot, the boot guard's Reload is tapped: the join survives the reload
//   netstall   js/net/ stalls after boot: the "Still joining" panel appears; Try again reaches the name prompt
//   peekstall  the room lookup stalls: the panel appears; Try again (request answered now) reaches the name prompt
//   backout    the room lookup stalls and the player taps Back: home stays clean (no "Still joining" panel later)
//   node tools/joinblank_e2e.mjs [scenarios,comma,separated] [--shots DIR] [--port 9551]
// CLUED_URL=http://localhost:PORT/ runs it against another copy of the files (the falsify run).
// Needs the :8888 site server and ~/.claude/bin/cdp. Uses a local clued server; production is blocked.
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { startLocalServer, blockProd, PROD_API } from './lib/localserver.mjs';

const argv = process.argv.slice(2);
const argOf = k => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : null);
const ALL = ['fontstall', 'reload', 'bootreload', 'netstall', 'peekstall', 'backout'];
const RUN = argv[0] && !argv[0].startsWith('--') ? argv[0].split(',') : ALL;
const SITE = process.env.CLUED_URL || 'http://localhost:8888/gms/2d/clued/';
const ORIGIN = new URL(SITE).origin;
const CDP = join(homedir(), '.claude/bin/cdp');
const SHOTS = argOf('--shots') || join(tmpdir(), 'clued-joinblank-shots');
const PORT = Number(argOf('--port') || 9551);
mkdirSync(SHOTS, { recursive: true });
setTimeout(() => { console.log('FATAL: run exceeded 4 min'); process.exit(1); }, 4 * 60 * 1000).unref();

const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, msg, extra = '') => { if (c) { pass++; console.log(`  ok   ${msg}`); } else { fail++; console.log(`  FAIL ${msg} ${extra}`); } };

class Page {
  constructor(port) { this.port = port; this.id = 0; this.cbs = new Map(); this.paused = []; this.hold = null; }
  async open() {
    const t = (await (await fetch(`http://127.0.0.1:${this.port}/json`)).json()).find(x => x.type === 'page');
    this.ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((r, j) => { this.ws.onopen = r; this.ws.onerror = j; });
    this.ws.onmessage = m => {
      const d = JSON.parse(m.data);
      if (d.id && this.cbs.has(d.id)) { const { res, rej } = this.cbs.get(d.id); this.cbs.delete(d.id); d.error ? rej(new Error(d.error.message)) : res(d.result); }
      else if (d.method === 'Fetch.requestPaused') {
        const { requestId, request } = d.params;
        if (this.hold && this.hold.test(request.url)) this.paused.push(requestId);
        else this.send('Fetch.continueRequest', { requestId }).catch(() => {});
      }
    };
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await blockProd((m, p) => this.send(m, p));
    await this.send('Network.setCacheDisabled', { cacheDisabled: true });
    await this.send('Emulation.setDeviceMetricsOverride', { width: 384, height: 854, deviceScaleFactor: 2, mobile: true });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => {
      const t = setTimeout(() => { this.cbs.delete(id); rej(new Error(`CDP ${method} timed out`)); }, 15000);
      this.cbs.set(id, { res: v => { clearTimeout(t); res(v); }, rej: e => { clearTimeout(t); rej(e); } });
    });
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
  async waitFor(expr, ms) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { try { const v = await this.eval(expr); if (v) return v; } catch (e) {} await sleep(200); }
    return null;
  }
  // Hold matching requests (never answered) until release().
  async stall(re, extra = []) {
    this.hold = re;
    await this.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  }
  async release() {
    this.hold = null;
    const ids = this.paused.splice(0);
    for (const requestId of ids) await this.send('Fetch.continueRequest', { requestId }).catch(() => {});
    await this.send('Fetch.disable').catch(() => {});
  }
  async shot(file) {
    try {
      const r = await Promise.race([this.send('Page.captureScreenshot', { format: 'png' }), sleep(5000).then(() => null)]);
      if (r) writeFileSync(join(SHOTS, file), Buffer.from(r.data, 'base64'));
      return !!r;
    } catch (e) { return false; }
  }
}

const NAME = `!!document.querySelector('.screen:not(.leaving)[data-screen=join] [data-field=name]')`;
const STATE = `JSON.stringify({ screen: document.body?.dataset.screen || null, url: location.search, rescue: !!document.querySelector('.join-rescue'), boot: document.getElementById('boot')?.className ?? 'gone' })`;
const state = p => p.eval(STATE).catch(e => 'eval: ' + e.message);

execFileSync(CDP, ['start', '--port', String(PORT), '--idle', '60', '--', '--use-angle=metal'], { stdio: 'ignore' });
const srv = await startLocalServer({ origins: ORIGIN, tag: 'joinblank' });
const mkRoom = async () => {
  const questions = [0, 1, 2].map(i => ({ format: 'mc', id: 'q' + i, prompt: 'Q?', answer: 'Right', options: ['Right', 'Wrong', 'Nope', 'Nah'], timeLimit: 10 }));
  const r = await fetch(srv.api + '/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({ hostName: 'Host', spec: { v: 1, rounds: [{ format: 'mc' }] }, questions, answerSec: 15, gapSec: 5 }) });
  return (await r.json()).code;
};
const p = new Page(PORT);
await p.open();
const joinUrl = code => `${SITE}?join=${code}&noauth=1&${srv.query}`;
const fresh = async () => { await p.release(); await p.send('Page.navigate', { url: 'about:blank' }); await sleep(300); };
console.log(`site ${SITE}`);

for (const sc of RUN) {
  console.log(`\n# ${sc}`);
  await fresh();
  const code = await mkRoom();
  if (sc === 'fontstall') {
    await p.stall(/fonts\.googleapis\.com/);
    p.send('Page.navigate', { url: joinUrl(code) }).catch(() => {});
    const got = await p.waitFor(NAME, 15000);
    ok(got, 'name prompt shows while the font stylesheet never answers', await state(p));
    await sleep(800);
    ok(await p.shot('fontstall.png'), 'the page paints (a screenshot frame exists)');
  }
  if (sc === 'reload') {
    await p.send('Page.navigate', { url: joinUrl(code) });
    ok(await p.waitFor(NAME, 15000), 'name prompt on first load');
    await p.eval(`document.querySelector('[data-field=name]').value = 'Kim'; location.reload(); 1`);
    await sleep(500);
    const got = await p.waitFor(NAME, 15000);
    ok(got, 'after a reload on the join screen: name prompt again (not home)', await state(p));
    await p.shot('reload.png');
    await p.eval(`document.querySelector('.bar .back').click(); 1`).catch(() => {});
    await sleep(800);
    ok(await p.waitFor(`document.body.dataset.screen === 'home' && !/join=/.test(location.search)`, 4000), 'Back to home drops ?join from the address bar', await state(p));
  }
  if (sc === 'bootreload') {
    await p.stall(/\/js\/formats\/index\.js/);
    p.send('Page.navigate', { url: joinUrl(code) }).catch(() => {});
    const guard = await p.waitFor(`document.getElementById('boot')?.classList.contains('err')`, 16000);
    ok(guard, 'boot guard shows "couldn\'t start" while a boot module stalls');
    await p.shot('bootguard.png');
    await p.release();
    await p.eval(`document.querySelector('#boot .b-err button').click(); 1`).catch(() => {});
    await sleep(500);
    const got = await p.waitFor(NAME, 15000);
    ok(got, 'its Reload button lands on the name prompt (the join survives)', await state(p));
  }
  if (sc === 'backout') {
    await p.stall(new RegExp(`/api/rooms/${code}$`));
    p.send('Page.navigate', { url: joinUrl(code) }).catch(() => {});
    ok(await p.waitFor(`document.querySelector('.screen:not(.leaving)[data-screen=join] .net-wait')`, 10000), 'join screen is looking for the room', await state(p));
    await p.eval(`document.querySelector('.screen:not(.leaving)[data-screen=join] .bar .back').click(); 1`).catch(() => {});
    ok(await p.waitFor(`document.body.dataset.screen === 'home'`, 4000), 'Back goes home', await state(p));
    await sleep(8500);
    ok(!(await p.eval(`!!document.querySelector('.join-rescue')`).catch(() => true)), 'no "Still joining" panel on home after backing out', await state(p));
  }
  if (sc === 'netstall' || sc === 'peekstall') {
    await p.stall(sc === 'netstall' ? /\/js\/net\/join\.js/ : new RegExp(`/api/rooms/${code}$`));
    p.send('Page.navigate', { url: joinUrl(code) }).catch(() => {});
    const panel = await p.waitFor(`document.querySelector('.join-rescue [data-act=join-retry]')`, 12000);
    ok(panel, 'a "Still joining" panel with Try again appears', await state(p));
    await p.shot(`${sc}_panel.png`);
    await p.release();
    await p.eval(`document.querySelector('.join-rescue [data-act=join-retry]').click(); 1`).catch(() => {});
    await sleep(500);
    const got = await p.waitFor(NAME, 15000);
    ok(got, 'Try again reaches the name prompt', await state(p));
    ok(!(await p.eval(`!!document.querySelector('.join-rescue')`).catch(() => true)), 'the panel is gone once the prompt shows');
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
srv.stop();
process.exit(fail ? 1 : 0);
