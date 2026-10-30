#!/usr/bin/env node
// ui-2 checks: shared board (WebGL context count), portrait layout, move review, online home /
// coming-soon state, home "online game in progress" card. Raw CDP, no puppeteer.
//
//   tools/server_run.sh --bg
//   ~/.claude/bin/cdp start --port 9518 -- --use-angle=metal --use-gl=angle --ignore-gpu-blocklist
//   node tools/ui2_cdp.mjs shots [--out=DIR]    # 360x740, 390x844, 412x915, 1440x900
//   node tools/ui2_cdp.mjs ctx   [--out=DIR]    # bot game -> puzzle -> online game -> back: 1 WebGL context
//   node tools/ui2_cdp.mjs soon  [--out=DIR]    # no server for this host: "coming soon", zero network
// Exits 1 on any failed check or console error.
import { writeFileSync, mkdirSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(3).map(a => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.join('=') || true]; }));
const MODE = process.argv[2] || 'shots';
const PORT = +(args.port || 9518);
const BASE = args.base || 'http://192.168.0.236:8888/gms/3d/gambit/';
const OUT = args.out || '/tmp/gambit-ui2';
mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TS = Date.now().toString(36).slice(-5);
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) fails++; };

const GLCOUNT = `(() => { const orig = HTMLCanvasElement.prototype.getContext; window.__gl = new Set();
  HTMLCanvasElement.prototype.getContext = function (t, ...a) { const c = orig.call(this, t, ...a); if (c && /webgl/i.test(t)) window.__gl.add(this); return c; }; })()`;

class Page {
  constructor(name, target) { this.name = name; this.target = target; this.id = 0; this.pending = new Map(); this.errors = []; this.allow = null; }
  static async create(name, fresh = false) {
    let t;
    if (fresh) t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
    else { const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); t = list.find(x => x.type === 'page') || await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json(); }
    const p = new Page(name, t);
    p.ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((res, rej) => { p.ws.onopen = res; p.ws.onerror = rej; });
    p.ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && p.pending.has(m.id)) { const q = p.pending.get(m.id); p.pending.delete(m.id); m.error ? q.rej(new Error(m.error.message)) : q.res(m.result); return; }
      const P = m.params || {};
      if (m.method === 'Runtime.consoleAPICalled' && (P.type === 'error' || P.type === 'assert')) p.err('console.error: ' + P.args.map(a => a.value ?? a.description).join(' '));
      if (m.method === 'Runtime.consoleAPICalled' && P.type === 'warning' && /^\[gambit\]/.test(String(P.args[0]?.value || '')) && !/account layer/.test(P.args[0].value)) p.err('warning: ' + P.args.map(a => a.value).join(' '));
      if (m.method === 'Runtime.exceptionThrown') p.err('exception: ' + (P.exceptionDetails.exception?.description || P.exceptionDetails.text));
      if (m.method === 'Log.entryAdded' && P.entry.level === 'error' && !(p.allow && p.allow.test(P.entry.text || ''))) p.err('log: ' + P.entry.text + ' ' + (P.entry.url || ''));
      if (m.method === 'Network.requestWillBeSent' && p.netLog) p.netLog.push(P.request.url);
    };
    await p.send('Page.navigate', { url: 'about:blank' }); await sleep(200);
    for (const d of ['Runtime', 'Log', 'Page', 'Network']) await p.send(`${d}.enable`);
    await p.send('Network.clearBrowserCache');
    await p.send('Network.setCacheDisabled', { cacheDisabled: true });
    await p.send('Page.addScriptToEvaluateOnNewDocument', { source: GLCOUNT });
    return p;
  }
  err(s) { this.errors.push(s); console.log(`  [${this.name}] ${s}`); }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => this.pending.set(id, { res, rej })); }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`${this.name} eval: ` + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) + `\n  in: ${expr.slice(0, 140)}`);
    return r.result.value;
  }
  async size(w, h) { const m = w < 700; await this.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: m ? 2 : 1, mobile: m }); await this.send('Emulation.setTouchEmulationEnabled', { enabled: m }); }
  async go(url) { await this.send('Page.navigate', { url }); await this.waitFor('window.__booted === true', 20000, 'boot'); await sleep(300); }
  async hash(h) { await this.eval(`location.hash = ${JSON.stringify(h)}`); await sleep(500); }
  async waitFor(expr, ms = 15000, what = expr) {
    const t = Date.now();
    while (Date.now() - t < ms) { try { if (await this.eval(`!!(${expr})`)) return true; } catch { /* navigating */ } await sleep(120); }
    throw new Error(`${this.name}: timed out waiting for ${what}`);
  }
  click(sel) { return this.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) throw new Error('no element ${sel.replace(/'/g, '')}'); e.click(); return true; })()`); }
  async shot(file) {
    await sleep(350);
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${OUT}/${file}.png`, Buffer.from(r.data, 'base64'));
    console.log(`  shot ${OUT}/${file}.png`);
  }
  gl() { return this.eval(`({ made: window.__gl ? window.__gl.size : -1, inDom: [...(window.__gl || [])].filter(c => c.isConnected).length })`); }
  close() { try { this.ws.close(); } catch { /* ignore */ } return fetch(`http://127.0.0.1:${PORT}/json/close/${this.target.id}`).catch(() => {}); }
}

const gameReady = 'window.__gambitTest && window.__gambitTest() && window.__gambitTest().ready';
async function startBot(P, bot = 'pip', tc = '5+3') {
  await P.hash(`#/play/bot/${bot}`);
  await P.click(`[data-tc="${tc}"]`); await sleep(150);
  await P.eval(`document.querySelector('[data-value="w"]') && document.querySelector('[data-value="w"]').click()`);
  await P.click('[data-act="play"]');
  await P.waitFor(gameReady, 40000, 'bot game ready');
  await sleep(800);
}
async function playMine(P, n) {
  for (let i = 0; i < n; i++) {
    await P.waitFor('window.__gambitTest().myTurn', 25000, 'my turn');
    await P.eval('window.__gambitTest().playAny()');
    await sleep(500);
  }
  await P.waitFor('window.__gambitTest().myTurn', 25000, 'my turn');
}
const boardFen = P => P.eval(`(() => { const c = document.querySelector('.board-host canvas'); const b = c && c.__board; if (!b) return null; const out = []; for (let r = 8; r >= 1; r--) { let row = ''; for (const f of 'abcdefgh') { const p = b.pieceAt(f + r); row += p ? (p.color === 'w' ? p.type.toUpperCase() : p.type) : '.'; } out.push(row); } return out.join('/'); })()`);

// ---------------------------------------------------------------- shots
async function shots() {
  const P = await Page.create('A');
  const sizes = [[360, 740], [390, 844], [412, 915], [1440, 900]];
  for (const [w, h] of sizes) {
    const tag = `${w}x${h}`;
    console.log(`\n== ${tag}`);
    await P.size(w, h);
    await P.go(`${BASE}?nocloud&devuid=ui2${TS}${w}&devname=Tester#/home`);
    await P.eval('localStorage.clear()');
    await P.go(`${BASE}?nocloud&devuid=ui2${TS}${w}&devname=Tester#/home`);
    await startBot(P);
    await P.shot(`${tag}-game-start`);
    // layout: board as wide as the screen in portrait, bars hugging it, no dead band
    const L = await P.eval(`(() => { const r = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { t: Math.round(b.top), b: Math.round(b.bottom), h: Math.round(b.height), w: Math.round(b.width) }; };
      return { view: r('#view'), moves: r('.moves-box'), top: r('.bar-top'), board: r('.board-square'), bottom: r('.bar-bottom'), act: r('.actions') }; })()`);
    if (w < 700) {
      const gapA = L.top.t - L.moves.b, gapB = L.board.t - L.top.b, gapC = L.bottom.t - L.board.b, gapD = L.act.t - L.bottom.b;
      check(L.board.w >= w - 1, `${tag}: board full width (${L.board.w}px)`);
      check(Math.max(gapA, gapB, gapC, gapD) <= 1, `${tag}: no empty bands (gaps ${gapA}/${gapB}/${gapC}/${gapD})`);
      check(L.act.b <= h + 1 && L.act.b >= h - 2, `${tag}: toolbar anchored at the bottom (${L.act.b})`);
      console.log(`  layout: moves ${L.moves.h}px, bars ${L.top.h}px, board ${L.board.h}px, toolbar ${L.act.h}px`);
    }
    await playMine(P, 4);
    await P.shot(`${tag}-game-mid`);
    // review: tap the first move, step, back to live
    const live = await boardFen(P);
    await P.click('.moves .m[data-ply="0"]'); await sleep(300);
    const r1 = await boardFen(P);
    check(!!r1 && r1 !== live && (await P.eval(`document.querySelector('.moves .m.sel')?.dataset.ply`)) === '0', `${tag}: tapping move 1 shows that position`);
    check(await P.eval(`!document.querySelector('.rev-live').hidden && document.querySelector('.screen.game').classList.contains('reviewing')`), `${tag}: "Live" chip + review frame shown`);
    check(await P.eval('!window.__gambitTest().myTurn'), `${tag}: board not playable while reviewing`);
    await P.shot(`${tag}-review`);
    await P.click('[data-rev="next"]'); await sleep(200);
    check(await P.eval(`document.querySelector('.moves .m.sel').dataset.ply === '1'`), `${tag}: ▶ steps to move 2`);
    await P.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))`); await sleep(200);
    check(await P.eval(`document.querySelector('.moves .m.sel').dataset.ply === '0'`), `${tag}: ← steps back`);
    await P.click('[data-rev="live"]'); await sleep(300);
    check((await boardFen(P)) === live && await P.eval('window.__gambitTest().myTurn'), `${tag}: back to live, playable again`);
    // online home (server running)
    await P.hash('#/online');
    await P.waitFor('document.querySelector(".ol-tc")', 15000, 'online home');
    await sleep(600);
    await P.shot(`${tag}-online`);
    if (w < 700) {
      const qm = await P.eval(`(() => { const c = [...document.querySelectorAll('.ol-tc')]; const last = c[c.length - 1].getBoundingClientRect(); const warn = document.querySelector('.ol-warn').getBoundingClientRect(); return { last: Math.round(last.bottom), warnTop: Math.round(warn.top), warnBottom: Math.round(warn.bottom) }; })()`);
      check(qm.last <= h, `${tag}: all quick-match chips above the fold (${qm.last} <= ${h})`);
      console.log(`  cheat warning at ${qm.warnTop}-${qm.warnBottom}`);
    }
    await P.hash('#/puzzles'); await sleep(1500);
    await P.shot(`${tag}-puzzles`);
    await P.hash('#/home'); await sleep(300);
    await P.shot(`${tag}-home`);
  }
  return [P];
}

// ---------------------------------------------------------------- one WebGL context
async function ctx() {
  const A = await Page.create('A'), B = await Page.create('B', true);
  await A.size(390, 844); await B.size(390, 844);
  await A.go(`${BASE}?nocloud&devuid=pass${TS}a&devname=Ann&devsigned=1#/home`);
  await A.eval('localStorage.clear()');
  await A.go(`${BASE}?nocloud&devuid=pass${TS}a&devname=Ann&devsigned=1#/home`);
  await B.go(`${BASE}?nocloud&devuid=pass${TS}b&devname=Ben&devsigned=1#/online`);
  await A.send('Page.bringToFront');   // background tabs get no rAF: keep the board page in front
  console.log('\n== bot game');
  await startBot(A);
  await playMine(A, 2);
  check((await A.gl()).made === 1, `bot game: 1 WebGL context (${JSON.stringify(await A.gl())})`);
  console.log('== puzzle');
  await A.hash('#/home'); await A.click('a[href="#/puzzles"]'); await sleep(800);
  await A.waitFor('document.querySelector(".pz-node.next")', 20000, 'puzzle map');
  await A.click('.pz-node.next');
  await A.waitFor('window.__puzzleTest && window.__puzzleTest() && window.__puzzleTest().ready', 40000, 'puzzle ready');
  await A.eval('window.__puzzleTest().playExpected()'); await sleep(1500);
  await A.shot('ctx-puzzle');
  check((await A.gl()).made === 1, `puzzle: still 1 WebGL context (${JSON.stringify(await A.gl())})`);
  console.log('== online game');
  await A.hash('#/online');
  await A.waitFor('document.querySelector(".ol-tc")', 15000, 'A online home');
  await B.waitFor('document.querySelector(".ol-tc")', 15000, 'B online home');
  await A.click('[data-tc="10+0"]'); await sleep(400); await B.click('[data-tc="10+0"]');
  await A.send('Page.bringToFront');
  const inG = 'window.__gambitOnlineTest && window.__gambitOnlineTest() && window.__gambitOnlineTest().ready';
  await A.waitFor(inG, 25000, 'A in online game'); await B.waitFor(inG, 25000, 'B in online game');
  const you = await A.eval('window.__gambitOnlineTest().you');
  const [W, K] = you === 'w' ? [A, B] : [B, A];
  for (const [P, mv] of [[W, 'e2e4'], [K, 'e7e5'], [W, 'g1f3']]) {
    await P.waitFor('window.__gambitOnlineTest().myTurn', 15000, `${P.name} turn`);
    await P.eval(`window.__gambitOnlineTest().play('${mv}')`); await sleep(700);
  }
  await A.waitFor('window.__gambitOnlineTest().plies >= 3', 15000, 'A sees 3 plies');
  await sleep(800);
  await A.shot('ctx-online');
  check((await A.gl()).made === 1, `online game: still 1 WebGL context (${JSON.stringify(await A.gl())})`);
  // online review: tap move 1 while it's the OPPONENT's turn; their move must end the review
  const opp = A === W ? K : W;
  if (A === K) { await A.waitFor('window.__gambitOnlineTest().myTurn', 15000, 'A turn'); await A.eval(`window.__gambitOnlineTest().play('b8c6')`); await B.waitFor('window.__gambitOnlineTest().plies >= 4', 15000, 'B sees 4'); }
  const n0 = await A.eval('window.__gambitOnlineTest().plies');
  await A.click('.moves .m[data-ply="0"]'); await sleep(300);
  check(await A.eval(`document.querySelector('.screen.game').classList.contains('reviewing')`), 'online: tap a move -> review');
  await A.shot('ctx-online-review');
  await opp.waitFor('window.__gambitOnlineTest().myTurn', 15000, 'opp turn');
  await opp.eval(`window.__gambitOnlineTest().play('${A === W ? 'b8c6' : 'f1c4'}')`);
  await A.waitFor(`window.__gambitOnlineTest().plies >= ${n0 + 1}`, 15000, 'A sees the reply');
  await sleep(600);
  check(await A.eval(`!document.querySelector('.screen.game').classList.contains('reviewing')`), 'online: opponent move ends review (back to live)');
  console.log('== back home, then bot game again');
  await A.hash('#/home'); await sleep(600);
  check(await A.eval('!!document.querySelector(".ol-home-card")'), 'home shows the online game in progress (local hint)');
  await A.shot('ctx-home-online-card');
  await A.eval(`document.querySelector('.continue [data-act="resume"]') && document.querySelector('.continue [data-act="resume"]').click()`);
  await A.waitFor(gameReady, 30000, 'bot game resumed');
  await sleep(800);
  check((await A.gl()).made === 1, `bot game again: still 1 WebGL context (${JSON.stringify(await A.gl())})`);
  check(await A.eval(`document.querySelectorAll('.board-host canvas').length === 1`), 'exactly one board canvas in the DOM');
  // the online game card -> back into the online game
  await A.hash('#/home'); await sleep(400);
  await A.click('.ol-home-card a'); await A.waitFor(inG, 25000, 'A back in online game via the home card');
  check(true, 'home card opens the online game');
  check((await A.gl()).made === 1, `still 1 WebGL context at the end (${JSON.stringify(await A.gl())})`);
  // finish: resign so the next run starts clean
  await A.click('[data-act="resign"]').catch(() => {}); await sleep(300);
  await A.eval(`document.querySelector('.dialog [data-v="1"]') && document.querySelector('.dialog [data-v="1"]').click()`); await sleep(1500);
  return [A, B];
}

// ---------------------------------------------------------------- no server here
async function soon() {
  const P = await Page.create('A');
  P.netLog = [];
  for (const [w, h] of [[360, 740], [1440, 900]]) {
    await P.size(w, h);
    await P.go(`${BASE}?nocloud&server=none#/home`);
    await P.eval(`localStorage.setItem('gambit.local.online', JSON.stringify({ games: [{ id: 'x1', you: 'w', opp: { name: 'Ghost' }, tc: { id: '5+0', name: 'Blitz', base: 300000 }, plies: 4, at: Date.now() }] }))`);
    await P.go(`${BASE}?nocloud&server=none#/home`);
    check(await P.eval('!document.querySelector(".ol-home-card")'), `${w}: no online card when there is no server`);
    P.netLog = [];
    await P.hash('#/online'); await sleep(1500);
    check(await P.eval(`/coming soon/i.test(document.querySelector('.ol-soon h2')?.textContent || '')`), `${w}: "Online play is coming soon"`);
    const hits = P.netLog.filter(u => /:8094|\/api\/|ws/.test(u));
    check(hits.length === 0, `${w}: no server requests (${hits.join(', ')})`);
    await P.shot(`${w}x${h}-online-soon`);
  }
  // configured but unreachable: friendly card, one failed probe (expected), no reconnect loop
  P.allow = /ERR_CONNECTION_REFUSED|ERR_FAILED/;
  await P.size(360, 740);
  await P.go(`${BASE}?nocloud&server=http://127.0.0.1:8097#/online`); await sleep(2500);
  check(await P.eval(`/can.t reach/i.test(document.querySelector('.ol-soon h2')?.textContent || '')`), 'unreachable: "Can’t reach the online server" + Try again');
  await P.shot('360x740-online-unreachable');
  return [P];
}

let pages = [];
try {
  if (MODE === 'shots') pages = await shots();
  else if (MODE === 'ctx') pages = await ctx();
  else if (MODE === 'soon') pages = await soon();
} catch (e) { console.log('DRIVER: ' + e.message); fails++; }
const errs = pages.flatMap(p => p.errors);
for (const p of pages) if (p.name === 'B') await p.close();
console.log(errs.length ? `\n${errs.length} console error(s)` : '\nno console errors');
console.log(fails || errs.length ? `\nFAILED (${fails} checks)` : '\nALL PASS');
process.exit(fails || errs.length ? 1 : 0);
