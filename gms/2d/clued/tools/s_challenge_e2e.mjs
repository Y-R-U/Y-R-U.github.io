// Lane S challenges end-to-end: server challenge link (create from the results screen, play ?c=ID,
// leaderboard) and the serverless #lc= link challenge (play, reply chain). 2 headless Chromes.
//   node tools/s_challenge_e2e.mjs [--keep] [--shots DIR]
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = join(HERE, '..', 'server');
const SITE = 'http://localhost:8888/gms/2d/clued/';
const CDP = join(homedir(), '.claude/bin/cdp');
const args = process.argv.slice(2);
const SHOTS = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : join(tmpdir(), 'clued-s-shots');
const POLL = args.includes('--poll');
mkdirSync(SHOTS, { recursive: true });

const HARD_TIMEOUT = setTimeout(() => { console.log('FATAL: whole run exceeded 8 min'); process.exit(1); }, 8 * 60 * 1000);
HARD_TIMEOUT.unref();
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, msg, extra = '') => { if (c) { pass++; console.log(`  ok   ${msg}`); } else { fail++; console.log(`  FAIL ${msg} ${extra}`); } };

function freePort() {
  return new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
}

class Page {
  constructor(name, port) { this.name = name; this.port = port; this.id = 0; this.cbs = new Map(); this.events = []; }
  async open() {
    const list = await (await fetch(`http://127.0.0.1:${this.port}/json`)).json();
    const t = list.find(x => x.type === 'page');
    this.ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((r, j) => { this.ws.onopen = r; this.ws.onerror = j; });
    this.ws.onmessage = m => {
      const d = JSON.parse(m.data);
      if (d.id && this.cbs.has(d.id)) { const { res, rej } = this.cbs.get(d.id); this.cbs.delete(d.id); d.error ? rej(new Error(d.error.message)) : res(d.result); }
      else if (d.method === 'Runtime.exceptionThrown') this.events.push('EXC ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
      else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') this.events.push('ERR ' + d.params.args.map(a => a.value ?? a.description).join(' '));
    };
    await this.send('Network.setCacheDisabled', { cacheDisabled: true });
    await this.send('Runtime.enable');
    await this.send('Page.enable');
    await this.size(384, 854, 2, true);
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => {
      const t = setTimeout(() => { this.cbs.delete(id); rej(new Error(`${this.name}: CDP ${method} timed out`)); }, 20000);
      this.cbs.set(id, { res: v => { clearTimeout(t); res(v); }, rej: e => { clearTimeout(t); rej(e); } });
    });
  }
  size(w, h, dpr = 1, mobile = false) { return this.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile }); }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`${this.name}: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    return r.result.value;
  }
  async go(url) { await this.send('Page.navigate', { url }); }
  async waitFor(expr, ms = 15000, label = expr) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      try { const v = await this.eval(expr); if (v) return v; } catch (e) {}
      await sleep(150);
    }
    throw new Error(`${this.name}: timed out waiting for ${label}`);
  }
  async click(sel) {
    const r = await this.waitFor(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e || e.disabled) return null; e.scrollIntoView({block:'center'}); const b = e.getBoundingClientRect(); return b.width ? {x: b.x + b.width/2, y: b.y + b.height/2} : null; })()`, 15000, sel);
    for (const type of ['mousePressed', 'mouseReleased']) await this.send('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', clickCount: 1 });
  }
  async type(sel, text) {
    await this.click(sel);
    await this.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.value = ''; e.focus(); })()`);
    await this.send('Input.insertText', { text });
  }
  async shot(file) {
    try {
      const r = await this.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(SHOTS, file), Buffer.from(r.data, 'base64'));
    } catch (e) { console.log(`  (screenshot ${file} skipped: ${e.message})`); }
  }
  room() { return this.eval('window.__cluedRoom ? JSON.parse(JSON.stringify(window.__cluedRoom.st)) : null'); }
}


const PORTS = [9406, 9436];
let srv, dataDir, all = [];

async function playThrough(p, label) {
  await p.waitFor(`document.querySelector('.stage')`, 30000, `${label} start`);
  for (let i = 0; i < 40; i++) {
    const s = await p.eval(`(() => {
      if (document.querySelector('.net-board') && !document.querySelector('.stage')) return 'done';
      const c = document.querySelector('.stage .choices .choice:not([disabled])');
      if (c && !document.querySelector('.choices.locked')) return 'choice';
      if (document.querySelector('.reveal.show .next')) return 'next';
      return 'wait';
    })()`);
    if (s === 'done') return true;
    if (s === 'choice') await p.click('.stage .choices .choice');
    else if (s === 'next') await p.click('.reveal.show .next');
    await sleep(250);
  }
  throw new Error(`${label}: never finished`);
}

async function main() {
  const port = await freePort();
  dataDir = mkdtempSync(join(tmpdir(), 'clued-e2e-'));
  const bin = join(dataDir, 'clued');
  execFileSync('go', ['build', '-o', bin, '.'], { cwd: SERVER, env: { ...process.env, CGO_ENABLED: '0' } });
  srv = spawn(bin, [], { env: { ...process.env, CLUED_ADDR: `127.0.0.1:${port}`, CLUED_DATA: join(dataDir, 'data') }, stdio: 'ignore' });
  const API = `http://127.0.0.1:${port}/gms/2d/clued/api`;
  for (let i = 0; i < 50; i++) { try { if ((await fetch(API + '/health')).ok) break; } catch (e) {} await sleep(100); }
  for (const p of PORTS) execFileSync(CDP, ['start', '--port', String(p), '--idle', '180'], { stdio: 'ignore' });
  const [a, b] = [new Page('maker', PORTS[0]), new Page('player', PORTS[1])];
  all = [a, b];
  for (const p of all) await p.open();
  const q = `noauth=1&api=${encodeURIComponent(API)}`;

  // --- server challenge from a real results screen
  await a.go(`${SITE}?${q}`);
  await a.waitFor('window.__cluedReady', 20000, 'boot');
  await a.eval(`window.__clued.start({ count: 4, timer: false })`);
  await a.waitFor(`document.querySelector('.stage .choices')`, 20000, 'solo game');
  for (let i = 0; i < 30 && !(await a.eval(`document.body.dataset.screen === 'results'`)); i++) {
    await a.eval(`window.__clued.answer('correct')`); await sleep(200); await a.eval(`window.__clued.next()`); await sleep(250);
  }
  await a.click('[data-act=challenge]:not([hidden])');
  await a.waitFor(`document.querySelector('.pop-card input.field')`, 8000, 'name popup');
  await a.type('.pop-card input.field', 'Maker');
  await a.click('.pop-card .btn.primary');
  const link = await a.waitFor(`document.querySelector('.net-pop .net-link')?.textContent`, 15000, 'share sheet');
  ok(/\?c=[a-z2-9]{8}/.test(link), 'challenge link from the results screen', link);
  ok(await a.eval(`!!document.querySelector('.net-pop .net-qr svg')`), 'challenge share sheet has a QR');
  await a.shot('challenge-share.png');

  await b.go('http://' + link + '&noauth=1');
  await b.waitFor(`document.querySelector('[data-act=play]')`, 20000, 'challenge intro');
  ok(await b.eval(`document.body.textContent.includes('Maker challenges you')`), 'intro names the challenger');
  await b.shot('challenge-intro.png');
  await b.type('#net-cname', 'Player Two');
  await b.click('[data-act=play]');
  await playThrough(b, 'challenge');
  const rows = await b.eval(`[...document.querySelectorAll('.net-board .net-row:not(.gap)')].map(r => r.textContent)`);
  ok(rows.length === 2 && rows.some(r => r.includes('Player Two (you)')) && rows.some(r => r.includes('Maker')), 'leaderboard has both players', JSON.stringify(rows));
  await b.shot('challenge-board.png');
  ok(await b.eval(`!!document.querySelector('.net-cmp') && document.querySelectorAll('.net-cmp-row').length === 4`), 'server challenge shows the per-question comparison');

  // --- serverless link challenge
  const url = await a.eval(`(async () => {
    const net = await import('./js/net/index.js?v=1');
    const c = window.__cluedCtx;
    const spec = c.makeSpec('quick', [{ format: 'mc', count: 4 }], 'lc-seed');
    const { questions } = await c.buildQuestions(spec);
    return net.createLinkChallenge({ spec, title: 'Link test', result: { questions, score: 777, correct: 2, answers: questions.map((q, i) => ({ i, correct: i < 2, stage: 0, ms: 1500 })) } }, 'Linky');
  })()`);
  ok(url.includes('#lc=z') || url.includes('#lc=j'), 'link challenge URL built', url.slice(0, 80));
  ok(url.length < 1500, `link is short enough to share (${url.length} chars)`);
  await b.go(url.replace('/clued/#', `/clued/?noauth=1#`));
  await b.waitFor('window.__cluedReady', 20000, 'boot');
  await b.eval(`import('./js/net/index.js?v=1').then(m => m.routeFromUrl())`);
  await b.waitFor(`document.querySelector('#net-lname')`, 15000, 'link intro');
  ok(await b.eval(`document.body.textContent.includes('Linky challenges you')`), 'link intro names the sender');
  await b.type('#net-lname', 'Replier');
  await b.click('[data-act=play]');
  await playThrough(b, 'link challenge');
  const chain = await b.eval(`[...document.querySelectorAll('.net-board .net-row')].map(r => r.textContent)`);
  ok(chain.length === 2 && chain.some(r => r.includes('Linky')) && chain.some(r => r.includes('Replier (you)')), 'reply chain has both scores', JSON.stringify(chain));
  ok(await b.eval(`!!document.querySelector('[data-act=reply]')`), 'reply button offered');
  ok(await b.eval(`document.querySelectorAll('.net-cmp .net-cmp-row').length === 4 && document.querySelector('.net-cmp summary').textContent.includes('Linky')`), 'question-by-question comparison shown');
  await b.shot('link-result.png');
  for (const p of all) for (const e of p.events) console.log(`  [${p.name}] ${e}`);
  ok(all.every(p => !p.events.some(e => e.startsWith('EXC'))), 'no uncaught exceptions');
}

main().catch(async e => {
  fail++; console.error('FATAL', e.message);
  for (const p of all) {
    try {
      await p.shot(`fail-${p.name}.png`);
      console.log(`  [${p.name}] screen=${await p.eval('document.body.dataset.screen')} err=${await p.eval(`[...document.querySelectorAll('.net-err,.error-panel,.toast')].map(x=>x.textContent).join(' | ')`)}`);
      p.events.forEach(x => console.log(`  [${p.name}] ${x}`));
    } catch (err) {}
  }
}).finally(() => {
  if (srv) srv.kill();
  if (!args.includes('--keep')) for (const p of PORTS) { try { execFileSync(CDP, ['stop', String(p)], { stdio: 'ignore' }); } catch (e) {} }
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  console.log(`\n${pass} passed, ${fail} failed · screenshots in ${SHOTS}`);
  process.exit(fail ? 1 : 0);
});
