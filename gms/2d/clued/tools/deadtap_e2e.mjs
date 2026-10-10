#!/usr/bin/env node
// Dead-tap regression (docs/notes/DEADTAP.md): taps that silently did nothing until a refresh.
// Serves a temp copy of the game on :8932 so it can "deploy" (bump BUILD) under a page that is already open,
// and make single modules 503 on demand. Real CDP touch events at 384x854.
// Needs ~/.claude/bin/cdp start --port 9500 (CDP_PORT overrides).
// Usage: node tools/deadtap_e2e.mjs [stale,netfail,vcheck,stress] [stressRounds=30]
//   CLUED_SRC=<dir> runs it against another copy of the game (e.g. the pre-fix files, to prove the checks fail).
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { cpSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, extname, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const GAME = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(GAME, '../../..');
const SRC = process.env.CLUED_SRC || GAME;
const ONLY = (process.argv[2] || 'stale,netfail,vcheck,stress').split(',');
const ROUNDS = +(process.argv[3] || 30);
const PORT = 8932, CDP = +(process.env.CDP_PORT || 9500);
const BASE = `http://localhost:${PORT}/gms/2d/clued/`;

const COPY = mkdtempSync(join(tmpdir(), 'clued-deadtap-'));
const refresh = () => {
  for (const f of ['js', 'css', 'index.html', 'admin.html']) { rmSync(join(COPY, f), { recursive: true, force: true }); cpSync(join(SRC, f), join(COPY, f), { recursive: true }); }
};
refresh();
for (const d of ['data', 'media', 'audio']) symlinkSync(join(GAME, d), join(COPY, d));
cpSync(join(GAME, 'tools/a_bump.mjs'), join(COPY, 'tools/a_bump.mjs'));
const deploy = (prefix = '2099') => {
  const v = prefix + String(Date.now()).slice(-8);
  execFileSync('node', [join(COPY, 'tools/a_bump.mjs'), v]);
  return v;
};

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg' };
let failing = [];
const server = http.createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (failing.some(f => path.includes(f))) { res.writeHead(503); res.end(); return; }
  let file = path.startsWith('/gms/2d/clued/') ? join(COPY, path.slice(14)) : join(SITE, path);
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(await readFile(file));
  } catch (e) { res.writeHead(404); res.end(); }
}).listen(PORT);

// ---- raw CDP ----
const list = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json();
for (const t of list.filter(t => t.type === 'page').slice(1)) await fetch(`http://127.0.0.1:${CDP}/json/close/${t.id}`);
const target = await (await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0;
const pending = new Map(), logs = [];
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const { r, j } = pending.get(m.id); pending.delete(m.id); m.error ? j(new Error(m.error.message)) : r(m.result); }
  else if (m.method === 'Runtime.exceptionThrown') logs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
};
const send = (method, params = {}) => new Promise((r, j) => { const i = ++seq; pending.set(i, { r, j }); ws.send(JSON.stringify({ id: i, method, params })); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const evaluate = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const waitFor = async (expr, ms = 5000) => {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(100)) { try { if (await evaluate(expr)) return true; } catch (e) {} }
  return false;
};
await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 384, height: 854, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
const screen = () => evaluate('document.body.dataset.screen');
async function tap(sel) {
  const b = await evaluate(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].find(e => e.getClientRects().length && !e.closest('.leaving')); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (!b) return false;
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x, y: b.y }] });
  await sleep(30);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  return true;
}
async function load({ cache = true, query = '?test' } = {}) {
  failing = [];
  await send('Network.setCacheDisabled', { cacheDisabled: !cache });
  await send('Network.clearBrowserCache');
  await send('Page.navigate', { url: BASE + query });
  await sleep(300);
  if (!(await waitFor('window.__cluedReady', 20000))) throw new Error('game did not boot');
  await evaluate(`localStorage.setItem('clued.settings', JSON.stringify({ timerSec: 0, bgm: false, sound: false })); true`);
}

let fails = 0;
const check = (label, ok, info = '') => { if (!ok) fails++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${info ? '  ' + info : ''}`); };
const BACK = '.screen:not(.leaving) .bar .back';
const state = () => evaluate(`({ s: document.body.dataset.screen, banner: document.querySelector('.upd-banner')?.dataset.kind || '', panel: document.querySelector('.screen:not(.leaving) .error-panel h2, .screen:not(.leaving) .coming h2')?.textContent || '' })`);
async function step(label, sel, want, { error = false, timeout = 5000 } = {}) {
  await sleep(350);
  if (!(await tap(sel))) return check(label, false, `no target ${sel} on ${await screen()}`);
  await waitFor(`document.body.dataset.screen === ${JSON.stringify(want)}`, timeout);
  await sleep(error ? 700 : 150);
  const s = await state();
  check(label, s.s === want && !!s.panel === error, JSON.stringify(s));
}

const scenarios = {
  // A page open across a deploy: lazily loaded modules arrive from the new build next to the old shell.
  async stale() {
    refresh(); deploy('2001');
    await load({ cache: true });
    deploy();
    await step('home → Learn', '.tile[data-mode="learn"]', 'learn');
    await step('Learn → Flashcards', '.l-tile[data-go="l-cards"]', 'l-cards');
    await step('Flashcards ‹', BACK, 'learn');
    await step('Learn → Field guide', '.l-tile[data-go="l-guide"]', 'l-guide');
    await step('Field guide ‹', BACK, 'learn');
    await step('Learn ‹', BACK, 'home');
    await step('home → Online', '.tile[data-mode="online"]', 'online');
    await step('Online ‹', BACK, 'home');
    await step('home → Stats', '[data-act="stats-foot"]', 'stats');
    await step('Stats ‹', BACK, 'home');
    await step('home → Settings', '.home-foot .btn:first-child', 'settings');
    await step('Settings ‹', BACK, 'home');
    check('"Clued has been updated" banner shown', (await state()).banner === 'upd');
    const v = await evaluate(`fetch('js/build.js?t=' + Date.now(), { cache: 'no-store' }).then(r => r.text()).then(t => t.match(/'(\\w+)'/)[1])`);
    await tap('.upd-banner'); await sleep(500); await waitFor('window.__cluedReady', 20000);
    check('banner tap reloads onto the new build', (await evaluate('window.__clued.BUILD')) === v);
    await step('then Learn', '.tile[data-mode="learn"]', 'learn');
    await step('then Flashcards', '.l-tile[data-go="l-cards"]', 'l-cards');
  },
  // A lazy module 503s once (flaky mobile data); the next tap must work without a refresh.
  async netfail() {
    refresh();
    await load({ cache: false });
    await step('home → Learn', '.tile[data-mode="learn"]', 'learn');
    failing = ['learn/cards.js'];
    await step('Flashcards while 503', '.l-tile[data-go="l-cards"]', 'l-cards', { error: true });
    failing = [];
    await step('Retry after recovery', '[data-act="retry"]', 'l-cards');
    await load({ cache: false });
    failing = ['learn/index.js'];
    await step('Learn while 503', '.tile[data-mode="learn"]', 'learn', { error: true });
    failing = [];
    await step('Retry after recovery', '[data-act="retry"]', 'learn');
    await step('then Flashcards', '.l-tile[data-go="l-cards"]', 'l-cards');
    await load({ cache: false });
    failing = ['net/index.js'];
    await step('Online while 503', '.tile[data-mode="online"]', 'online-soon', { error: true });
    failing = [];
    await step('Retry after recovery', '[data-act="retry"]', 'online');
    await load({ cache: false });
    await step('home → Learn', '.tile[data-mode="learn"]', 'learn');
    failing = ['learn/face.js'];
    await step('Flashcards while a dependency 503s', '.l-tile[data-go="l-cards"]', 'l-cards', { error: true });
    failing = [];
    check('refresh banner offered (a failed dependency URL is remembered by Chrome)', (await state()).banner === 'err');
  },
  // The tab comes back to the foreground after a deploy.
  async vcheck() {
    for (const where of ['home', 'play', 'learn']) {
      refresh(); deploy('2001');
      await load({ cache: true, query: '?test&vcheck' });
      const A = await evaluate('window.__clued.BUILD');
      if (where === 'play') { await evaluate(`window.__clued.start({ structure: 'quick', format: 'mc', count: 5 }); true`); await waitFor('!!window.__clued.state().q', 20000); }
      if (where === 'learn') { await tap('.tile[data-mode="learn"]'); await waitFor(`document.body.dataset.screen === 'learn'`); }
      const visible = () => evaluate(`document.dispatchEvent(new Event('visibilitychange')); true`);
      await visible(); await sleep(600);
      let s = await state();
      check(`${where}: same build → nothing happens`, !s.banner && (await evaluate('window.__clued.BUILD')) === A, JSON.stringify(s));
      const B = deploy();
      await visible(); await sleep(1500); await waitFor('window.__cluedReady', 20000);
      s = await state();
      const now = await evaluate('window.__clued.BUILD');
      if (where === 'home') check('home: new build → silent reload', now === B && !s.banner && s.s === 'home', JSON.stringify(s));
      else check(`${where}: new build → banner, never a reload`, now === A && s.banner === 'upd' && s.s === where, JSON.stringify(s));
    }
  },
  // Rapid real taps through the main screens and a quick game, with an elementFromPoint sweep after every tap.
  async stress() {
    refresh();
    await load({ cache: false });
    await send('Page.navigate', { url: BASE + '?test' }); await waitFor('window.__cluedReady', 20000);
    let taps = 0, dead = 0;
    const eaten = new Map(), log = [];
    const sweep = async () => {
      const r = await evaluate('window.__clued.hits ? window.__clued.hits({ cols: 6, rows: 12 }) : { bad: [] }');
      for (const b of r.bad) eaten.set(`${r.screen}: ${b.el}`, (eaten.get(`${r.screen}: ${b.el}`) || 0) + 1);
    };
    const go = async (sel, want, timeout = 5000) => {
      taps++;
      if (!(await tap(sel))) { dead++; log.push(`no target ${sel} on ${await screen()}`); return; }
      await sweep();
      if (!(await waitFor(want.startsWith('!!') ? want : `document.body.dataset.screen === ${JSON.stringify(want)}`, timeout))) { dead++; log.push(`${sel} → ${want}: stayed on ${await screen()}`); }
      await sleep(90);
      await sweep();
    };
    for (let r = 0; r < ROUNDS; r++) {
      await go('.tile[data-mode="learn"]', 'learn');
      await go('.l-tile[data-go="l-cards"]', 'l-cards');
      await go(BACK, 'learn');
      await go(BACK, 'home');
      await go('[data-act="stats-foot"]', 'stats');
      await go(BACK, 'home');
      await go('.home-foot .btn:first-child', 'settings');
      await go(BACK, 'home');
      await go('.tile[data-mode="online"]', 'online', 8000);
      await go(BACK, 'home');
      await go('[data-mode="quick"]', 'formats');
      await go('[data-format="mc"]', 'setup');
      await go('button.chip[data-v="5"]', 'setup');
      await go('[data-act="start"]', '!!document.querySelector(".choices:not(.locked) .choice:not(:disabled)")', 20000);
      await go('.choices:not(.locked) .choice:not(:disabled)', '!!document.querySelector(".reveal.show")');
      await go('.hud .quit', '!!document.querySelector("#popups .pop")');
      await go('#popups .pop .btn.danger', 'setup');
      await go(BACK, 'formats');
      await go(BACK, 'home');
    }
    check(`stress: ${ROUNDS} rounds, ${taps} real taps, every tap navigated`, dead === 0, log.slice(0, 5).join(' | '));
    check('stress: no overlay intercepted a tap point', eaten.size === 0, [...eaten].slice(0, 5).map(([k, n]) => `${k} ×${n}`).join(' | '));
  },
};

try {
  for (const name of ONLY) { console.log(name); await scenarios[name](); }
} catch (e) { fails++; console.log('ERROR', e.message); }
console.log(`deadtap_e2e: ${fails ? fails + ' FAILED' : 'all passed'}${SRC !== GAME ? ' (source ' + SRC + ')' : ''}`);
const errs = logs.filter(l => !/Failed to fetch dynamically imported module/.test(l));
if (errs.length) console.log('page exceptions:\n  ' + errs.slice(0, 5).map(l => l.split('\n')[0]).join('\n  '));
ws.close(); server.close(); rmSync(COPY, { recursive: true, force: true });
process.exit(fails ? 1 : 0);
