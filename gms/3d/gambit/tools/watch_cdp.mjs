#!/usr/bin/env node
// Spectating end-to-end: two players start an Unlimited quick match, a third browser watches it from
// Online → Watch: live moves, watcher badge for the players, the end, unwatch on leave.
//
//   (home server on :8094) ~/.claude/bin/cdp start --port 9541|9542|9543 -- --use-angle=metal --use-gl=angle --ignore-gpu-blocklist
//   node tools/watch_cdp.mjs [--out=DIR]
import { writeFileSync, mkdirSync } from 'node:fs';
const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.join('=') || true]; }));
const BASE = args.base || 'http://192.168.0.236:8888/gms/3d/gambit/';
const OUT = args.out || '/tmp/gambit-watch';
const SHOTS = true;
mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TS = Date.now().toString(36).slice(-5);
class Page {
  constructor(name, port) { this.name = name; this.port = port; this.id = 0; this.pending = new Map(); this.errors = []; }
  async open() {
    const list = await (await fetch(`http://127.0.0.1:${this.port}/json/list`)).json();
    let page = list.find(t => t.type === 'page');
    if (!page) page = await (await fetch(`http://127.0.0.1:${this.port}/json/new?about:blank`, { method: 'PUT' })).json();
    this.target = page.id;
    this.ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) { const p = this.pending.get(m.id); this.pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); return; }
      const P = m.params || {};
      if (m.method === 'Runtime.consoleAPICalled' && (P.type === 'error' || P.type === 'assert')) this.err('console.error: ' + P.args.map(a => a.value ?? a.description).join(' '));
      if (m.method === 'Runtime.consoleAPICalled' && P.type === 'warning' && /^\[gambit\]/.test(String(P.args[0]?.value || '')) && !/account layer/.test(P.args[0].value)) this.err('warning: ' + P.args.map(a => a.value).join(' '));
      if (m.method === 'Runtime.exceptionThrown') this.err('exception: ' + (P.exceptionDetails.exception?.description || P.exceptionDetails.text));
      if (m.method === 'Log.entryAdded' && P.entry.level === 'error' && !this.allowNet(P.entry)) this.err('log: ' + P.entry.text + ' ' + (P.entry.url || ''));
    };
    await this.send('Page.navigate', { url: 'about:blank' }); await sleep(300);   // drop the last run's page + its console backlog
    for (const d of ['Runtime', 'Log', 'Page', 'Network']) await this.send(`${d}.enable`);
    await this.send('Network.setCacheDisabled', { cacheDisabled: true });
  }
  // a real disconnect: close the tab (navigating away can park the page, socket and all, in the bfcache)
  async closeTab() {
    const old = this.target;
    await fetch(`http://127.0.0.1:${this.port}/json/new?about:blank`, { method: 'PUT' });
    try { this.ws.close(); } catch { /* ignore */ }
    await fetch(`http://127.0.0.1:${this.port}/json/close/${old}`);
    await sleep(300);
    this.pending.clear();
    await this.open();
  }
  allowNet(e) { return this.quietNet && /ERR_|WebSocket/.test(e.text || ''); }
  err(s) { this.errors.push(s); console.log(`  [${this.name}] ${s}`); }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => this.pending.set(id, { res, rej })); }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`${this.name} eval: ` + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) + `\n  in: ${expr.slice(0, 120)}`);
    return r.result.value;
  }
  async size(w, h) { await this.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: w < 500 ? 2 : 1, mobile: w < 500 }); await this.send('Emulation.setTouchEmulationEnabled', { enabled: w < 500 }); }
  async go(url) { await this.send('Page.navigate', { url }); await this.waitFor('window.__booted === true', 20000); }
  async hash(hh) {
    await this.eval(`location.hash = ${JSON.stringify(hh)}`); await sleep(150);
    if (hh === '#/online') {   // the home remembers its tab: go back to Play
      await this.waitFor('document.querySelector(".ol-tabs")', 15000, 'online home');
      await this.eval(`document.querySelector('.ol-tabs a[data-tab=play]').click()`);
    }
  }
  async waitFor(expr, ms = 15000, what = expr) {
    const t = Date.now();
    while (Date.now() - t < ms) { try { if (await this.eval(`!!(${expr})`)) return true; } catch { /* page loading */ } await sleep(120); }
    throw new Error(`${this.name}: timed out waiting for ${what}`);
  }
  click(sel) { return this.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) throw new Error('no element ${sel.replace(/'/g, '')}'); e.click(); return true; })()`); }
  async shot(file) {
    if (!SHOTS) return;
    await sleep(350);
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${OUT}/${file}.png`, Buffer.from(r.data, 'base64'));
    console.log(`  shot ${OUT}/${file}.png`);
  }
  T() { return this.eval('window.__gambitOnlineTest && (() => { const t = window.__gambitOnlineTest(); return t && {ready:t.ready,id:t.id,you:t.you,myTurn:t.myTurn,over:t.over,plies:t.plies,srvPlies:t.srvPlies,result:t.result,drawOffer:t.drawOffer,opponentGone:t.opponentGone,fen:t.fen}; })()'); }
}

let fails = 0;
function check(ok, msg) { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) fails++; }
const url = (uid, name) => `${BASE}?nocloud&devuid=${uid}&devname=${encodeURIComponent(name)}`;
const OT = 'window.__gambitOnlineTest && window.__gambitOnlineTest()';

const A = new Page('A', 9541), B = new Page('B', 9542), S = new Page('S', 9543);
for (const p of [A, B, S]) { await p.open(); }
await A.size(1280, 800); await B.size(390, 844); await S.size(390, 844);
A.tag = 'desk'; B.tag = 'phone'; S.tag = 'phone';
try {
  await A.go(url(`wa${TS}`, 'Ann') + '#/online'); await B.go(url(`wb${TS}`, 'Ben') + '#/online');
  await A.waitFor('document.querySelector(".ol-tc")'); await B.waitFor('document.querySelector(".ol-tc")');
  await A.click('.ol-tc[data-tc="unlimited"]');
  await B.waitFor(`document.querySelector('.ol-tc[data-tc="unlimited"] .ol-seekn')`, 8000, 'B sees the seek');
  await B.click('.ol-tc[data-tc="unlimited"]');
  await A.waitFor(`${OT} && ${OT}.ready`, 20000, 'A in game'); await B.waitFor(`${OT} && ${OT}.ready`, 20000, 'B in game');
  const W = (await A.eval(`${OT}.you`)) === 'w' ? A : B, Bk = W === A ? B : A;
  const gid = await A.eval(`${OT}.id`);
  const mv = async (P, Q, u, n) => { await P.waitFor(`${OT}.myTurn`); await P.eval(`${OT}.play(${JSON.stringify(u)})`); await Q.waitFor(`${OT}.plies >= ${n}`); };
  await mv(W, Bk, 'f2f3', 1);

  await S.go(url(`ws${TS}`, 'Sam') + '#/online/watch');
  await S.waitFor(`document.querySelector('.ol-tabs a.on')?.dataset.tab === 'watch' && document.querySelector('.ol-watchlist')`, 15000, 'watch list');
  check(await S.eval(`!!document.querySelector('.ol-watchlist a[href="#/online/watch/${gid}"]')`), 'game shows in the Watch tab');
  await S.shot('watchlist');
  await S.click(`.ol-watchlist a[href="#/online/watch/${gid}"]`);
  await S.waitFor(`document.querySelector('.ol-watch .moves .m') && !document.querySelector('.ol-watch .board-loading')`, 20000, 'spectator board');
  check(await S.eval(`document.querySelectorAll('.ol-watch .moves .m').length === 1`), 'spectator sees the move already played');
  await W.waitFor(`!document.querySelector('.ol-watchbadge').hidden && /1 watching/.test(document.querySelector('.ol-watchbadge').textContent)`, 8000, 'player badge');
  check(true, 'players see "1 watching"');
  await mv(Bk, W, 'e7e5', 2);
  await S.waitFor(`document.querySelectorAll('.ol-watch .moves .m').length === 2`, 8000, 'spectator gets move 2');
  check(true, 'spectator gets live moves');
  await mv(W, Bk, 'g2g4', 3);
  await mv(Bk, W, 'd8h4', 4);
  await S.waitFor(`/0-1/.test(document.querySelector('.ol-watch .moves').textContent)`, 8000, 'spectator sees the end');
  check(true, 'spectator sees the mate / result');
  await sleep(1500);
  await S.shot('spectator_end');
  await W.shot('player_badge');
  await S.eval(`location.hash = '#/online'`);
  await W.waitFor(`document.querySelector('.ol-watchbadge') && document.querySelector('.ol-watchbadge').hidden`, 8000, 'badge clears');
  check(true, 'leaving unwatches (badge clears)');
} catch (e) { check(false, e.message); }
for (const p of [A, B, S]) for (const e of p.errors) check(false, `${p.name} ${e}`);
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
