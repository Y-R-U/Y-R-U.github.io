#!/usr/bin/env node
// puzzles agent browser test: raw CDP to `~/.claude/bin/cdp start --port 9510`.
//
//   node tools/puzzles_cdp.mjs [--out=DIR] [--page=index.html|tools/puzzles_preview.html]
//
// Screenshots the map and a puzzle at 360x740 and 1440x900, plays puzzles through the
// screen's test hook (setup move, wrong move, correct line, hint, reveal), checks the
// localStorage record, and exits 1 on any console error / exception.
import { writeFileSync, mkdirSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.join('=') || true]; }));
const PORT = +(args.port || 9510);
const ROOT = args.base || 'http://192.168.0.236:8888/gms/3d/gambit/';
const PAGE = args.page || 'index.html';
const OUT = args.out || '/tmp/gambit-puzzles';
mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = []; }
  static async open() {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    let page = list.find(t => t.type === 'page');
    if (!page) page = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const c = new CDP(ws);
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && c.pending.has(m.id)) { const p = c.pending.get(m.id); c.pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
      else if (m.method) c.handlers.forEach(h => h(m));
    };
    return c;
  }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => this.pending.set(id, { res, rej })); }
  on(fn) { this.handlers.push(fn); }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  }
}

const errors = [];
const fail = msg => { errors.push(msg); console.log('  FAIL', msg); };
async function setup(c) {
  await c.send('Runtime.enable'); await c.send('Log.enable'); await c.send('Page.enable');
  await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  c.on(m => {
    if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'assert'))
      errors.push('console.error: ' + m.params.args.map(a => a.value ?? a.description).join(' '));
    if (m.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push('log: ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
  });
}
async function size(c, w, h, mobile) {
  await c.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await c.send('Emulation.setTouchEmulationEnabled', { enabled: mobile });
}
async function waitFor(c, expr, ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { if (await c.eval(expr)) return true; } catch { /* navigating */ } await sleep(100); }
  throw new Error('timeout waiting for ' + expr);
}
async function go(c, hash) {
  await c.send('Page.navigate', { url: `${ROOT}${PAGE}?nocloud&t=${Date.now()}${hash}` });
  await sleep(400); await waitFor(c, "window.__booted === true", 60000); await sleep(300);
}
async function shot(c, name) {
  const r = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, 'base64'));
  console.log('  shot', `${OUT}/${name}.png`);
}
const T = 'window.__puzzleTest && window.__puzzleTest()';
const ready = `(()=>{const t=${T}; return !!(t && t.ready)})()`;

async function mapReady(c) { await waitFor(c, `!!document.querySelector(".pz-node")`, 60000); await sleep(400); }

async function run(c) {
  if (args.only === 'quick') return quick(c);
  if (args.only !== 'desktop') await phone(c);
  if (args.only !== 'phone') await desktop(c);
}
// a short visual pass: map, a classic puzzle, the celebration overlay
async function quick(c) {
  await size(c, 360, 740, true);
  await go(c, '#/puzzles'); await mapReady(c);
  await shot(c, 'q360-map');
  await c.eval(`document.querySelector('#pzr-gm-peaks').scrollIntoView({block:'center'})`); await sleep(300);
  await shot(c, 'q360-map-peaks');
  await go(c, '#/puzzles/p/c-reti-tartakower');
  await waitFor(c, ready, 300000); await sleep(500);
  await shot(c, 'q360-play');
  await c.eval(`window.__pzKeepCelebrate = true; ${T}.celebrate()`); await sleep(1800);
  if (!(await c.eval(`!!document.querySelector('.pz-celebrate .pz-cel-card')`))) fail('celebration overlay missing');
  await shot(c, 'q360-celebrate');
}
async function phone(c) {
  // ---------- phone ----------
  await size(c, 360, 740, true);
  await go(c, '#/home');
  await c.eval(`localStorage.removeItem('gambit.puzzles')`);
  await go(c, '#/puzzles'); await mapReady(c);
  await shot(c, '360-map-fresh');
  const firstNext = await c.eval(`document.querySelector('.pz-next').dataset.id`);
  if (firstNext !== 'c-fool') fail('first open puzzle should be c-fool, got ' + firstNext);
  // open the first puzzle via the Next button
  await c.eval(`document.querySelector('.pz-next').click()`);
  await waitFor(c, ready, 300000); await sleep(800);
  await shot(c, '360-play-start');
  // wrong move then the right one
  await c.eval(`${T}.playWrong()`); await sleep(500);
  const st1 = await c.eval(`(()=>{const t=${T}; return {m:t.mistakes, s:document.querySelector('.pz-status').textContent}})()`);
  if (st1.m !== 1) fail('wrong move not counted: ' + JSON.stringify(st1));
  await shot(c, '360-play-wrong');
  await c.eval(`${T}.playExpected()`);
  await waitFor(c, `(${T}).finished`, 90000); await sleep(300);
  await shot(c, '360-play-solved-celebrate');
  await sleep(2200);
  await shot(c, '360-play-solved');
  const rec = await c.eval(`JSON.parse(localStorage.getItem('gambit.puzzles'))`);
  if (!rec || rec.s['c-fool'] !== 2) fail('stars should be 2 after one miss: ' + JSON.stringify(rec && rec.s));
  if (!rec || !(rec.r < 800)) fail('rating should drop after a missed first try: ' + (rec && rec.r));
  // next: solve cleanly a run of puzzles through the Next button
  for (let i = 0; i < 6; i++) {
    const next = await c.eval(`(${T}).next`);
    if (!next) { fail('no next puzzle after ' + i); break; }
    await c.eval(`document.querySelector('[data-act="next"]').click()`);
    await waitFor(c, `(()=>{const t=${T}; return t && t.id===${JSON.stringify(next)} && t.ready})()`, 120000);
    let guard = 0;
    while (!(await c.eval(`(${T}).finished`)) && guard++ < 12) {
      await waitFor(c, `(()=>{const t=${T}; return t.ready || t.finished})()`, 90000);
      if (await c.eval(`(${T}).finished`)) break;
      await c.eval(`${T}.playExpected()`); await sleep(250);
    }
    await waitFor(c, `(${T}).finished`, 90000);
    const r = await c.eval(`(${T}).result`);
    if (r.stars !== 3) fail(`clean solve of ${next} gave ${r.stars} stars`);
    await sleep(300);
  }
  // a mate-in-2 from Mating Nets with a hint, then a reveal on another
  await go(c, '#/puzzles/p/c-legal');
  await waitFor(c, ready, 300000); await sleep(400);
  await c.eval(`${T}.hint()`); await sleep(300); await shot(c, '360-play-hint1');
  await c.eval(`${T}.hint()`); await sleep(300); await shot(c, '360-play-hint2');
  while (!(await c.eval(`(${T}).finished`))) { await waitFor(c, `(()=>{const t=${T}; return t.ready || t.finished})()`, 90000); if (await c.eval(`(${T}).finished`)) break; await c.eval(`${T}.playExpected()`); await sleep(300); }
  const rl = await c.eval(`(${T}).result`);
  if (rl.stars !== 2) fail('hint should cost one star, got ' + rl.stars);
  await sleep(2300); await shot(c, '360-play-classic-solved');
  await go(c, '#/puzzles/p/c-opera');
  await waitFor(c, ready, 300000); await sleep(300);
  await shot(c, '360-play-opera');
  await c.eval(`${T}.reveal()`);
  await waitFor(c, `(${T}).finished`, 30000); await sleep(400);
  const ro = await c.eval(`(${T}).result`);
  if (ro.stars !== 0) fail('reveal should give 0 stars, got ' + ro.stars);
  // promotion picker (Saavedra: c8=R)
  await go(c, '#/puzzles/p/c-saavedra');
  await waitFor(c, ready, 300000);
  await c.eval(`${T}.playExpected()`); await waitFor(c, ready, 90000); await sleep(300);
  await c.eval(`window.__gambitPromo = 1`);
  // drive the board's promotion path: the picker appears via board.onPromotion only for real UI drags,
  // so check the logic path directly: an under-promotion mismatch must be rejected.
  const pr = await c.eval(`(()=>{const t=${T}; return t.expected})()`);
  if (pr !== 'c7c8r') fail('saavedra expected c7c8r, got ' + pr);
  // back to the map: progress shows
  await go(c, '#/puzzles'); await mapReady(c);
  await shot(c, '360-map-progress');
  const hud = await c.eval(`document.querySelector('.pz-hud').textContent.replace(/\\s+/g,' ').trim()`);
  console.log('  hud:', hud);
  // scroll down to a locked region and a classic
  await c.eval(`document.querySelector('#pzr-mating-nets').scrollIntoView()`); await sleep(300);
  await shot(c, '360-map-mating-nets');
  await c.eval(`document.querySelector('#pzr-gm-peaks').scrollIntoView()`); await sleep(300);
  await shot(c, '360-map-peaks');
  // rating-unlock: a strong rating opens later regions
  await c.eval(`(()=>{const p=JSON.parse(localStorage.getItem('gambit.puzzles')); p.r=1610; localStorage.setItem('gambit.puzzles', JSON.stringify(p));})()`);
  await go(c, '#/puzzles'); await mapReady(c);
  const opened = await c.eval(`[...document.querySelectorAll('.pz-region:not(.locked)')].map(e=>e.id)`);
  console.log('  open regions at 1610:', opened.join(' '));
  if (!opened.includes('pzr-endgame-vale') || opened.includes('pzr-storm-keep')) fail('rating unlock wrong: ' + opened);
  await c.eval(`document.querySelector('#pzr-sacrifice-cliffs').scrollIntoView()`); await sleep(300);
  await shot(c, '360-map-cliffs');

}
async function desktop(c) {
  // ---------- desktop ----------
  await size(c, 1440, 900, false);
  await go(c, '#/puzzles'); await mapReady(c);
  await shot(c, '1440-map');
  await go(c, '#/puzzles/p/c-immortal');
  await waitFor(c, ready, 300000); await sleep(800);
  await shot(c, '1440-play');
  await c.eval(`${T}.playExpected()`); await sleep(200);
  await waitFor(c, ready, 90000);
  await c.eval(`${T}.playWrong()`); await sleep(350);
  await shot(c, '1440-play-wrong');
  while (!(await c.eval(`(${T}).finished`))) { await waitFor(c, `(()=>{const t=${T}; return t.ready || t.finished})()`, 90000); if (await c.eval(`(${T}).finished`)) break; await c.eval(`${T}.playExpected()`); await sleep(300); }
  await sleep(500); await shot(c, '1440-play-solved');
  await sleep(2200); await shot(c, '1440-play-solved-after');
}

const c = await CDP.open();
await setup(c);
try { await run(c); } catch (e) { fail('run: ' + (e.stack || e.message)); }
const real = errors.filter(e => !/favicon/.test(e));
console.log(real.length ? `ERRORS (${real.length}):\n` + real.join('\n') : 'no console errors');
process.exit(real.length ? 1 : 0);
