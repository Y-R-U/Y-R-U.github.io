// Lane S end-to-end: a local clued server + 3 headless Chromes (host + 2 joiners via the share link),
// a full room game with real clicks, a refresh/reconnect mid-game, and screenshots.
//   node tools/s_room_e2e.mjs [--keep] [--shots DIR] [--poll]
// Needs the :8888 site server and ~/.claude/bin/cdp. Ports: 9406 (host), 9436, 9446.
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
    return new Promise((res, rej) => this.cbs.set(id, { res, rej }));
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
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(SHOTS, file), Buffer.from(r.data, 'base64'));
  }
  room() { return this.eval('window.__cluedRoom ? JSON.parse(JSON.stringify(window.__cluedRoom.st)) : null'); }
}

const PORTS = [9406, 9436, 9446];
let srv, dataDir, all = [];
async function main() {
  const port = await freePort();
  dataDir = mkdtempSync(join(tmpdir(), 'clued-e2e-'));
  const bin = join(dataDir, 'clued');
  execFileSync('go', ['build', '-o', bin, '.'], { cwd: SERVER, env: { ...process.env, CGO_ENABLED: '0' } });
  srv = spawn(bin, [], { env: { ...process.env, CLUED_ADDR: `127.0.0.1:${port}`, CLUED_DATA: join(dataDir, 'data') }, stdio: 'ignore' });
  const API = `http://127.0.0.1:${port}/gms/2d/clued/api`;
  for (let i = 0; i < 50; i++) { try { if ((await fetch(API + '/health')).ok) break; } catch (e) {} await sleep(100); }
  console.log(`server ${API}`);

  for (const p of PORTS) execFileSync(CDP, ['start', '--port', String(p), '--idle', '180'], { stdio: 'ignore' });
  const [host, j1, j2] = [new Page('host', PORTS[0]), new Page('ann', PORTS[1]), new Page('bob', PORTS[2])];
  all = [host, j1, j2];
  for (const p of all) await p.open();

  const q = `noauth=1&api=${encodeURIComponent(API)}${POLL ? '&netpoll=1' : ''}`;
  await host.go(`${SITE}?${q}`);
  await host.waitFor('window.__cluedReady', 20000, 'boot');
  await host.eval(`import('./js/net/index.js?v=1').then(() => window.__cluedCtx.go('online'))`);
  await host.click('[data-act=host]');
  await host.click('.tile[data-format=mc]');
  await host.type('[data-field=name]', 'Hosty');
  await host.click('[data-opt=answer] .chip[data-v="15"]');
  await host.click('[data-opt=gap] .chip[data-v="3"]');
  await host.click('[data-act=create]');
  await host.waitFor(`document.querySelector('.net-code')?.textContent`, 30000, 'lobby code');
  const code = await host.eval(`document.querySelector('.net-code').textContent`);
  const link = await host.eval(`document.querySelector('.net-link').textContent`);
  ok(/^[A-Z2-9]{5}$/.test(code), `host created room ${code}`);
  ok(link.includes(`join=${code}`), 'share link carries the code', link);
  ok(await host.eval(`!!document.querySelector('.net-qr svg path')`), 'QR code drawn');
  ok(await host.eval(`document.body.textContent.includes('friends you trust')`), 'trust hint shown');

  // joiners open the share link exactly as a phone would
  const url = 'http://' + link + (POLL ? '&netpoll=1' : '') + '&noauth=1';
  for (const [p, name] of [[j1, 'Ann'], [j2, 'Bob']]) {
    await p.go(url);
    await p.waitFor(`document.querySelector('[data-field=name]')`, 20000, 'join form');
    await p.type('[data-field=name]', name);
    await p.click('[data-act=join]');
    await p.waitFor(`window.__cluedRoom?.st?.phase === 'lobby'`, 15000, 'lobby');
  }
  await host.waitFor(`window.__cluedRoom.st.players.length === 3`, 8000, '3 players');
  ok(true, 'host sees 3 players');
  ok(await j1.eval(`document.querySelector('.net-wait')?.textContent.includes('Hosty')`), 'joiner sees "waiting for Hosty"');
  await host.shot('lobby-host-portrait.png');
  await j1.shot('lobby-joiner-portrait.png');
  await host.size(854, 384, 2, true); await sleep(300); await host.shot('lobby-host-landscape.png');
  await host.size(1280, 800, 1, false); await sleep(300); await host.shot('lobby-host-desktop.png');
  await host.size(384, 854, 2, true);

  await host.click('[data-act=start]');
  const total = (await host.room()).total;
  console.log(`  …playing ${total} questions`);
  const pages = [host, j1, j2];
  let refreshed = false, lastQ = -1, sawCountdown = false, sawGap = false, sawLive = false;
  for (let guard = 0; guard < 600; guard++) {
    const st = await host.room();
    if (!st) { await sleep(200); continue; }
    if (st.phase === 'final') break;
    if (st.phase === 'question' && st.q !== lastQ) {
      lastQ = st.q;
      for (const p of pages) {
        if (p === j2 && st.q === 1 && !refreshed) {
          refreshed = true;
          await p.send('Page.reload', { ignoreCache: true });
          await p.waitFor(`window.__cluedRoom?.st?.q === 1`, 20000, 'rejoin after refresh');
          ok(true, 'bob rejoined after a refresh mid-game');
          const me = await p.room();
          ok(me.you.name === 'Bob', 'same seat after refresh', me.you.name);
        }
        if (p === j1 && st.q === total - 1) continue; // Ann sits out the last question: her timer must run out
        if (!sawCountdown) sawCountdown = await p.eval(`!!document.querySelector('.net-count3')`);
        await p.waitFor(`document.querySelector('.stage .choices .choice:not([disabled])')`, 15000, `q${st.q} choices`);
        if (p === host && st.q === 0) await p.shot('question-portrait.png');
        await p.click(p === j1 ? '.stage .choices .choice:nth-child(2)' : '.stage .choices .choice');
        if (p === host) {
          await sleep(150);
          sawLive = sawLive || await p.eval(`!!document.querySelector('.net-live .net-wait')`);
        }
      }
      await host.waitFor(`window.__cluedRoom.st.phase !== 'question' || window.__cluedRoom.st.q !== ${st.q}`, 25000, 'question end');
      const s2 = await host.room();
      if (st.q === total - 1) {
        ok(s2.phase === 'reveal' && s2.answered === 2, 'last question: revealed at the deadline with one player silent', `${s2.phase} ${s2.answered}`);
        ok(await j1.waitFor(`document.querySelector('.reveal.show')`, 5000, 'timeout reveal'), 'the silent player sees the reveal after time runs out');
      } else ok(s2.phase === 'reveal' && s2.answered === 3, `q${st.q}: all answered → early reveal`, `${s2.phase} ${s2.answered}`);
      await sleep(400);
      if (st.q === 0) { await host.shot('reveal-portrait.png'); await j1.shot('reveal-joiner-portrait.png'); }
      if (!sawGap) sawGap = await host.eval(`!!document.querySelector('.net-gap i') && document.querySelector('.net-auto').textContent.includes('Next question in')`);
    }
    await sleep(200);
  }
  ok(sawCountdown, 'saw the 3-2-1 countdown');
  ok(sawLive, 'saw "waiting for others" after answering');
  ok(sawGap, 'saw the next-question countdown bar');
  ok(refreshed, 'refresh happened');
  for (const p of pages) await p.waitFor(`window.__cluedRoom?.st?.phase === 'final' && document.querySelector('.net-podium')`, 20000, 'podium');
  ok(true, 'all three reach the podium');
  const finals = await Promise.all(pages.map(p => p.room()));
  const sig = s => s.players.map(p => `${p.name}:${p.score}`).join(',');
  ok(finals.every(f => sig(f) === sig(finals[0])), 'every screen shows the same final scores', finals.map(sig).join(' | '));
  ok(finals[0].players.every(p => p.correct <= total), 'correct counts are sane');
  await sleep(2600);
  await host.shot('final-host-portrait.png');
  await j2.shot('final-joiner-portrait.png');

  // host leaves → Ann becomes host
  await host.eval(`window.__cluedCtx.reset('home')`).catch(() => {});
  await fetch(`${API}/rooms/${code}/leave`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: await host.eval(`JSON.parse(sessionStorage.getItem('clued.room.${code}')||'{}').key`) }) });
  await j1.waitFor(`window.__cluedRoom?.st?.you?.host === true`, 8000, 'ann becomes host');
  ok(true, 'host leaving hands the room to the next player');
  ok(await j1.eval(`!!document.querySelector('[data-act=again]')`), 'new host gets "Play again"');

  for (const p of pages) for (const e of p.events) console.log(`  [${p.name}] ${e}`);
  ok(pages.every(p => !p.events.some(e => e.startsWith('EXC'))), 'no uncaught exceptions');
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
