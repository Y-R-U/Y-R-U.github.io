#!/usr/bin/env node
// ui agent test driver: raw CDP to a headless Chrome started by
// `~/.claude/bin/cdp start --port 9503`. No puppeteer.
//
//   node tools/ui_cdp.mjs shots  [--out=DIR] [--base=URL]   screenshots of every screen at 3 sizes
//   node tools/ui_cdp.mjs play   [--out=DIR]                plays a full game vs the weakest bot via the UI
//   node tools/ui_cdp.mjs reload                            reload-loop check (frameNavigated count over 12s)
//
// Every mode reports console errors / exceptions and exits 1 if there are any.
import { writeFileSync, mkdirSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(3).map(a => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.join('=') || true]; }));
const MODE = process.argv[2] || 'shots';
const PORT = +(args.port || 9503);
const BASE = args.base || 'http://192.168.0.236:8888/gms/3d/gambit/';
const OUT = args.out || '/tmp/gambit-ui';
const QS = args.qs ?? '?nocloud';
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
async function setup(c) {
  await c.send('Runtime.enable'); await c.send('Log.enable'); await c.send('Page.enable');
  await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  c.on(m => {
    if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'assert'))
      errors.push('console.error: ' + m.params.args.map(a => a.value ?? a.description).join(' '));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'warning' && String(m.params.args[0]?.value || '').startsWith('[gambit]')
        && !/account layer/.test(m.params.args[0].value))
      errors.push('gambit warning: ' + m.params.args.map(a => a.value ?? a.description).join(' '));
    if (m.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push('log: ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
  });
}
async function size(c, w, h, mobile) {
  await c.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await c.send('Emulation.setTouchEmulationEnabled', { enabled: mobile });
}
async function go(c, url) {
  if (!go.logged) { go.logged = true; setTimeout(async () => { try { console.log('  modules real:', JSON.stringify(await c.eval('window.__gambit && window.__gambit.usingReal'))); } catch {} }, 3000); } url = url.replace('#', (url.includes('?') ? '&' : '?') + 't=' + Date.now() + '#'); await c.send('Page.navigate', { url }); await sleep(400); await waitFor(c, 'window.__booted === true', 10000); await sleep(300); }
async function waitFor(c, expr, ms = 5000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { if (await c.eval(expr)) return true; } catch { /* page navigating */ } await sleep(100); }
  throw new Error('timeout waiting for ' + expr);
}
async function shot(c, name) {
  const r = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, 'base64'));
  console.log('  shot', `${OUT}/${name}.png`);
}
async function hash(c, h) { await c.eval(`location.hash='${h}'`); await sleep(450); }
async function click(c, sel) { const ok = await c.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return false; e.click(); return true})()`); if (!ok) throw new Error('no element ' + sel); await sleep(250); }

// Seed some ladder/stats so the screens show real content.
const SEED = `(()=>{localStorage.clear();})()`;

async function shots(c) {
  const sizes = [[360, 740, true], [412, 915, true], [1440, 900, false]];
  for (const [w, h, mobile] of sizes) {
    const tag = `${w}x${h}`;
    await size(c, w, h, mobile);
    await go(c, BASE + QS + '#/home');
    await c.eval(SEED);
    await go(c, BASE + QS + '#/home');
    await shot(c, `${tag}-home`);
    await hash(c, '#/play/bot'); await sleep(300); await shot(c, `${tag}-bots`);
    await hash(c, '#/play/bot/mabel'); await shot(c, `${tag}-timecontrol`);
    await click(c, '[data-tc="5+3"]'); await click(c, '[data-act="play"]');
    await waitFor(c, '!!(window.__gambitTest && window.__gambitTest() && window.__gambitTest().ready)', 40000); await sleep(1500);
    await shot(c, `${tag}-game-start`);
    // play a few moves through the real game API (board-agnostic)
    for (let i = 0; i < 4; i++) {
      await waitFor(c, `(()=>{const g=window.__gambitTest&&window.__gambitTest(); return g && g.myTurn})()`, 20000);
      await c.eval(`window.__gambitTest().playAny()`);
      await sleep(600);
    }
    await waitFor(c, `window.__gambitTest().myTurn`, 20000);
    await shot(c, `${tag}-game-mid`);
    await click(c, '[data-act="resign"]'); await sleep(300); await shot(c, `${tag}-resign-dialog`);
    await click(c, '.dialog [data-v="1"]'); await sleep(1200); await shot(c, `${tag}-results`);
    await click(c, '.sheet [data-close]'); await sleep(400); await shot(c, `${tag}-game-over`);
    await hash(c, '#/ladder'); await sleep(300); await shot(c, `${tag}-ladder`);
    await hash(c, '#/ladder/stats'); await shot(c, `${tag}-stats`);
    await hash(c, '#/settings'); await shot(c, `${tag}-settings`);
    await hash(c, '#/online'); await shot(c, `${tag}-online`);
    await hash(c, '#/puzzles'); await shot(c, `${tag}-puzzles`);
    // resume flow: start a game, make a move, go home
    await hash(c, '#/play/bot/pip'); await click(c, '[data-act="play"]');
    await waitFor(c, `window.__gambitTest && window.__gambitTest() && window.__gambitTest().ready`, 40000);
    await sleep(600);
    if (await c.eval('window.__gambitTest().myTurn')) await c.eval(`window.__gambitTest().playAny()`);
    await sleep(1500);
    await hash(c, '#/home'); await shot(c, `${tag}-home-resume`);
    // promotion picker
    await c.eval(`window.__gambitTest && 0`);
  }
}

async function playFull(c) {
  await size(c, 412, 915, true);
  await go(c, BASE + QS + '#/home'); await c.eval(SEED); await go(c, BASE + QS + '#/play/bot/pip');
  await click(c, '[data-tc="unlimited"]');
  await c.eval(`document.querySelector('[data-value="w"]').click()`);
  await click(c, '[data-act="play"]');
  await waitFor(c, `window.__gambitTest && window.__gambitTest() && window.__gambitTest().ready`, 40000);
  let plies = 0;
  const tEnd = Date.now() + 240000; let lastProgress = Date.now();
  while (Date.now() < tEnd) {
    const st = await c.eval(`(()=>{const g=window.__gambitTest(); return g ? {over:g.over, my:g.myTurn, plies:g.plies} : null})()`);
    if (!st || st.over) break;
    if (st.my) { await c.eval(`window.__gambitTest().playBest()`); }
    if (st.plies !== plies) { plies = st.plies; lastProgress = Date.now(); }
    else if (Date.now() - lastProgress > 20000) {
      errors.push('stalled at ply ' + plies + ': ' + JSON.stringify(await c.eval('window.__gambitTest().state')));
      break;
    }
    await sleep(120);
  }
  await sleep(1500);
  const res = await c.eval(`(()=>{const g=window.__gambitTest(); return g && g.result})()`);
  console.log('  game over after', plies, 'plies:', JSON.stringify(res));
  await shot(c, 'play-results');
  const lad = await c.eval(`JSON.parse(localStorage.getItem('gambit.ladder'))`);
  const st = await c.eval(`JSON.parse(localStorage.getItem('gambit.stats'))`);
  console.log('  ladder', JSON.stringify(lad));
  console.log('  stats', st.games, st.w, st.d, st.l, 'resume:', await c.eval(`localStorage.getItem('gambit.resume')`));
}

async function reloadLoop(c) {
  await size(c, 412, 915, true);
  let navs = 0;
  c.on(m => { if (m.method === 'Page.frameNavigated' && !m.params.frame.parentId) navs++; });
  await c.send('Page.navigate', { url: BASE + '#/home' });   // WITH the account layer
  await sleep(12000);
  const booted = await c.eval('window.__booted === true');
  const acct = await c.eval(`getComputedStyle(document.documentElement).getPropertyValue('--br8t-account-space')`);
  console.log(`  top-level navigations in 12s: ${navs} (must be 1); booted=${booted}; --br8t-account-space='${acct}'`);
  await shot(c, 'reload-check');
  if (navs !== 1) errors.push('reload loop: ' + navs + ' navigations');
}

const c = await CDP.open();
await setup(c);
try {
  if (MODE === 'shots') await shots(c);
  else if (MODE === 'play') await playFull(c);
  else if (MODE === 'reload') await reloadLoop(c);
} catch (e) { errors.push('driver: ' + e.message); }
console.log(errors.length ? `\n${errors.length} ERROR(S):\n` + errors.join('\n') : '\nno console errors');
process.exit(errors.length ? 1 : 0);
