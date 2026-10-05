// Lane S public games: the Online list (host, players, countdown) and the public cap → "create private" fallback.

//   node tools/s_public_e2e.mjs [--shots DIR]
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



const PORTS = [9406];
let srv, dataDir, all = [];
async function main() {
  const port = await freePort();
  dataDir = mkdtempSync(join(tmpdir(), 'clued-e2e-'));
  const bin = join(dataDir, 'clued');
  execFileSync('go', ['build', '-o', bin, '.'], { cwd: SERVER, env: { ...process.env, CGO_ENABLED: '0' } });
  srv = spawn(bin, [], { env: { ...process.env, CLUED_ADDR: `127.0.0.1:${port}`, CLUED_DATA: join(dataDir, 'data'), CLUED_MAX_PUBLIC: '1' }, stdio: 'ignore' });
  const API = `http://127.0.0.1:${port}/gms/2d/clued/api`;
  for (let i = 0; i < 50; i++) { try { if ((await fetch(API + '/health')).ok) break; } catch (e) {} await sleep(100); }
  execFileSync(CDP, ['start', '--port', '9406', '--idle', '120'], { stdio: 'ignore' });
  const a = new Page('pub', 9406); all = [a]; await a.open();
  const q = [{ format: 'mc', prompt: 'Q', options: [{ text: 'a' }, { text: 'b' }], answer: 0 }];
  await fetch(API + '/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hostName: 'Pubby', title: 'Snakes & spiders', public: true, startIn: 120, questions: q, spec: { kids: true, rounds: [{ format: 'mc', packs: ['snakes', 'spiders'] }] } }) });
  await a.go(`${SITE}?noauth=1&api=${encodeURIComponent(API)}`);
  await a.waitFor('window.__cluedReady', 20000, 'boot');
  await a.eval(`import('./js/net/index.js?v=' + (window.__clued?.BUILD || window.__cluedCtx?.BUILD || 1)).then(m => m.openOnline())`);
  await a.waitFor(`document.querySelector('.net-pub')`, 10000, 'public card');
  ok(await a.eval(`document.querySelector('.net-pub').textContent.includes('Pubby') && /Starts in 1:5/.test(document.querySelector('.net-pub').textContent)`), 'public card with host and countdown');
  await a.shot('online-hub.png');
  // public cap hit → inline "create private" offer
  await a.click('[data-act=host]');
  await a.click('.tile[data-format=mc]');
  await a.type('[data-field=name]', 'Second');
  await a.click('[data-opt=vis] .chip[data-v="true"]');
  await a.click('[data-act=create]');
  await a.waitFor(`document.querySelector('[data-act=private]')`, 30000, 'private offer');
  ok(true, 'public cap offers a private game inline');
  await a.shot('public-full.png');
  await a.click('[data-act=private]');
  await a.waitFor(`window.__cluedRoom?.st?.public === false`, 15000, 'private room');
  ok(true, 'created as private');
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
