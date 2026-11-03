#!/usr/bin/env node
// History screen checks: list (online from the home server + bot games), Home totals include online,
// online replay (step / start / flip), bot replay from a seeded gambit.stats.
//
//   ~/.claude/bin/cdp start --port 9541 -- --use-angle=metal --use-gl=angle --ignore-gpu-blocklist
//   node tools/history_cdp.mjs [--pid=<public id with games on :8094>] [--sizes=390x844,1440x900]
import { writeFileSync, mkdirSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.join('=') || true]; }));
const PORT = +(args.port || 9541);
const ROOT = args.base || 'http://192.168.0.236:8888/gms/3d/gambit/';
const OUT = args.out || '/tmp/gambit-history';
const PID = args.pid || '5d283eb3cfe4';
const SIZES = String(args.sizes || '390x844,1440x900').split(',').map(s => s.split('x').map(Number));
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
    if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) + '\n  in: ' + expr.slice(0, 140));
    return r.result.value;
  }
}

const errors = [];
let passes = 0;
const ok = (cond, msg) => { if (cond) { passes++; console.log('  ok  ', msg); } else { errors.push(msg); console.log('  FAIL', msg); } };
async function waitFor(c, expr, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { if (await c.eval(expr)) return true; } catch { /* navigating */ } await sleep(100); }
  throw new Error('timeout waiting for ' + expr);
}
async function shot(c, name) {
  const r = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, 'base64'));
  console.log('  shot', `${OUT}/${name}.png`);
}
const go = (c, hash) => c.eval(`location.hash = ${JSON.stringify(hash)}; 1`);

// a short real game: 1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6 4.Qxf7#
const MATE = ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7'];
const BOTGAME = { botId: 'x', name: 'Test Bot', elo: 900, result: 'win', reason: 'checkmate', pts: 55, tc: '10+0', color: 'w', moves: 7, uci: MATE, assisted: false, at: 1790000000000 };

const c = await CDP.open();
await c.send('Runtime.enable'); await c.send('Log.enable'); await c.send('Page.enable');
await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
c.on(m => {
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error: ' + m.params.args.map(a => a.value ?? a.description).join(' '));
  if (m.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
});

for (const [w, h] of SIZES) {
  const mobile = w < 900, tag = `${w}x${h}`;
  console.log(`== ${tag}`);
  await c.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 3 : 1, mobile });
  await c.send('Page.navigate', { url: `${ROOT}index.html?nocloud&t=${Date.now()}#/home` });
  await sleep(400); await waitFor(c, 'window.__booted === true', 60000);
  await c.eval(`localStorage.clear(); localStorage.setItem('gambit.stats', ${JSON.stringify(JSON.stringify({ games: 1, w: 1, d: 0, l: 0, perBot: { x: { w: 1, d: 0, l: 0 } }, recent: [BOTGAME, { ...BOTGAME, uci: undefined, at: 1780000000000, result: 'loss' }] }))}); 1`);
  // be the real player on the home server: same module instance as the app, connect() just sets me
  await c.eval(`import('${ROOT}js/app/net.js').then(m => { m.net.connect = async () => { m.net.me = { pid: ${JSON.stringify(PID)} }; }; return 1; })`);

  await go(c, '#/history');
  await waitFor(c, `document.querySelectorAll('.hist-list li').length > 2 && !document.querySelector('.hist-status')`);
  const n = await c.eval(`document.querySelectorAll('.hist-list a[href^="#/history/online/"]').length`);
  ok(n > 0, `online games listed (${n})`);
  const loss = await c.eval(`[...document.querySelectorAll('.hist-list a[href^="#/history/online/"] .r')].some(r => r.classList.contains('loss'))`);
  ok(loss, 'an online loss is listed');
  ok(await c.eval(`document.querySelectorAll('.hist-list a[href="#/history/bot/1790000000000"]').length === 1`), 'bot game with moves is tappable');
  ok(await c.eval(`document.querySelectorAll('.hist-list div.hist-row').length === 1`), 'old bot game without moves is not tappable');
  ok(await c.eval(`document.documentElement.scrollWidth <= innerWidth`), 'no horizontal scroll');
  await shot(c, `list-${tag}`);

  await go(c, '#/history/online');
  await waitFor(c, `document.querySelector('.tabs a.on')?.textContent === 'Online' && !document.querySelector('.hist-status')`);
  ok(await c.eval(`!document.querySelector('.hist-list a[href^="#/history/bot/"]')`), 'Online tab hides bot games');

  await go(c, '#/home');
  await waitFor(c, `!!document.querySelector('.home-stats')`);
  const losses = await c.eval(`+document.querySelector('.home-stats .hs-wide .bad').textContent`);
  ok(losses >= 3, `Home shows online losses (${losses})`);
  ok(await c.eval(`!!document.querySelector('a.menu-item[href="#/history"]')`), 'Home has History entry');

  const first = await c.eval(`JSON.parse(localStorage.getItem('gambit.local.onlineHistory')).recent[0].id`);
  await go(c, `#/history/online/${first}`);
  await waitFor(c, `!document.querySelector('.hist-game .board-loading') && document.querySelectorAll('.hist-game .moves .m').length > 0`, 30000);
  const plies = await c.eval(`document.querySelectorAll('.hist-game .moves .m').length`);
  ok(plies > 10, `online replay move list (${plies} plies)`);
  await c.eval(`document.querySelector('[data-act="start"]').click(); 1`); await sleep(200);
  ok(await c.eval(`document.querySelector('.hist-game').classList.contains('reviewing') && !document.querySelector('[data-rev="next"]').disabled`), 'Start jumps to move 0');
  await c.eval(`document.querySelector('[data-rev="next"]').click(); document.querySelector('[data-rev="next"]').click(); 1`); await sleep(200);
  ok(await c.eval(`document.querySelector('.hist-game .moves .m.sel')?.dataset.ply === '1'`), 'stepping forward selects move 2');
  await shot(c, `online-replay-${tag}`);
  const bars = await c.eval(`document.querySelector('.bar-bottom').textContent`);
  await c.eval(`document.querySelector('[data-act="flip"]').click(); 1`); await sleep(150);
  ok(bars !== await c.eval(`document.querySelector('.bar-bottom').textContent`), 'Flip swaps the player bars');

  await go(c, '#/history/bot/1790000000000');
  await waitFor(c, `!document.querySelector('.hist-game .board-loading') && document.querySelectorAll('.hist-game .moves .m').length === 7`, 30000);
  ok(true, 'bot replay shows 7 plies');
  ok(await c.eval(`/Qxf7#/.test(document.querySelector('.hist-game .moves').textContent)`), 'bot replay ends in Qxf7#');
  await shot(c, `bot-replay-${tag}`);
}

console.log(`\n${passes} passed, ${errors.length} failed`);
errors.forEach(e => console.log('  !', e));
c.ws.close();
process.exit(errors.length ? 1 : 0);
