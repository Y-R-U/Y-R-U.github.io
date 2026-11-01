#!/usr/bin/env node
// results-banner checks: game end shows a translucent banner on the board edge (not a sheet over the board),
// banner ⇄ details sheet ⇄ pill, review / flip / view work with it up; lesson-complete docks; puzzle solved.
//
//   ~/.claude/bin/cdp start --port 9540 -- --use-angle=metal --use-gl=angle --ignore-gpu-blocklist
//   node tools/results_cdp.mjs [all|bot|puzzle|lesson] [--out=DIR] [--sizes=390x844,360x740,1440x900]
//
// Bot games are set up through the local resume slot (gambit.resume), so no engine play is needed.
// Exits 1 on any failure or console error.
import { writeFileSync, mkdirSync } from 'node:fs';

const argv = process.argv.slice(2);
const MODE = argv.find(a => !a.startsWith('--')) || 'all';
const args = Object.fromEntries(argv.filter(a => a.startsWith('--')).map(a => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.join('=') || true]; }));
const PORT = +(args.port || 9540);
const ROOT = args.base || 'http://192.168.0.236:8888/gms/3d/gambit/';
const OUT = args.out || '/tmp/gambit-results';
const SIZES = String(args.sizes || '390x844,360x740,1440x900').split(',').map(s => s.split('x').map(Number));
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
let mobile = true;
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
async function size(c, w, h) {
  mobile = w < 900;
  await c.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 3 : 1, mobile });
  await c.send('Emulation.setTouchEmulationEnabled', { enabled: mobile });
}
async function waitFor(c, expr, ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { if (await c.eval(expr)) return true; } catch { /* navigating */ } await sleep(100); }
  throw new Error('timeout waiting for ' + expr);
}
async function load(c, hash) {
  await c.send('Page.navigate', { url: `${ROOT}index.html?nocloud&t=${Date.now()}${hash}` });
  await sleep(400); await waitFor(c, 'window.__booted === true', 60000); await sleep(300);
}
async function shot(c, name) {
  const r = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, 'base64'));
  console.log('  shot', `${OUT}/${name}.png`);
}
const click = (c, sel) => c.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) throw new Error('no ${sel.replace(/'/g, '')}'); e.click(); return true; })()`);
// a real tap / click at the centre of an element (goes through pointer events like a finger)
async function tapAt(c, x, y) {
  if (mobile) {
    await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }
}
async function tapEl(c, sel) {
  const r = await c.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; })()`);
  if (!r) throw new Error('no ' + sel);
  await tapAt(c, r.x, r.y); return r;
}

const GAME_READY = '(()=>{const g=window.__gambitTest&&window.__gambitTest(); return !!(g && g.ready)})()';
const T = c => c.eval('(() => { const g = window.__gambitTest(); return g && { over: g.over, result: g.result, banner: g.banner, sheet: g.sheet, reviewing: g.reviewing, myTurn: g.myTurn } })()');
// banner geometry vs the 8×8 area
const GEOM = `(() => {
  const sq = document.querySelector('.screen.game .board-square'), card = document.querySelector('.rb-card'), pill = document.querySelector('.rb-pill');
  const s = sq.getBoundingClientRect(), r = card.getBoundingClientRect(), p = pill.getBoundingClientRect();
  const btns = [...document.querySelectorAll('.rb-card .rb-btn')].map(b => { const q = b.getBoundingClientRect(); return Math.min(q.width, q.height); });
  return { boardH: s.height, boardW: s.width, cardH: r.height, cardW: r.width, inside: r.left >= s.left - 1 && r.right <= s.right + 1 && r.top >= s.top - 1 && r.bottom <= s.bottom + 1,
    minBtn: Math.min(...btns), pillH: p.height, pillW: p.width, cardOpacity: +getComputedStyle(card).opacity, pillOpacity: +getComputedStyle(pill).opacity,
    bg: getComputedStyle(card).backgroundImage, scrim: !!document.querySelector('.scrim') };
})()`;

async function resumeGame(c, r) {
  await c.eval(`localStorage.setItem('gambit.resume', ${JSON.stringify(JSON.stringify({ startedAt: Date.now(), assisted: false, ...r }))}); location.hash = '#/home'; 1`);
  await sleep(300);
  await c.eval(`location.hash = '#/game'`);
  await waitFor(c, GAME_READY, 40000); await sleep(600);
}

async function botScenarios(c, tag) {
  console.log(`bot games @ ${tag}`);
  await load(c, '#/home');
  await c.eval(`localStorage.removeItem('gambit.settings'); 1`);
  await load(c, '#/home');

  // 1. win by mate (player Black, Fool's mate)
  await resumeGame(c, { botId: 'pip', tc: 'unlimited', color: 'b', moves: ['f2f3', 'e7e5', 'g2g4'] });
  await waitFor(c, 'window.__gambitTest().myTurn', 10000);
  await c.eval(`window.__gambitTest().play('d8h4')`);
  await waitFor(c, 'window.__gambitTest().banner', 6000);
  await sleep(450);
  let t = await T(c);
  ok(t.over && t.result.reason === 'checkmate' && t.result.outcome === 'win', `${tag} win by mate: ${JSON.stringify(t.result)}`);
  ok(t.banner && t.banner.celebrating, `${tag} win: banner celebrates over the centre first`);
  await shot(c, `${tag}_win_mate_pop`);
  await sleep(1700);
  t = await T(c);
  let g = await c.eval(GEOM);
  ok(!t.banner.celebrating && t.banner.state === 'banner' && !t.sheet && !g.scrim, `${tag} win: docked banner, no sheet or scrim (edge ${t.banner.edge})`);
  ok(g.inside && g.cardH <= g.boardH * 0.2, `${tag} win: banner inside the board area and slim (${g.cardH.toFixed(0)} / ${g.boardH.toFixed(0)} px)`);
  ok(g.minBtn >= 44, `${tag} win: banner buttons ≥ 44 px (min ${g.minBtn.toFixed(0)})`);
  ok(t.banner.edge === 'bottom', `${tag} win: banner docks away from the mated white king (edge ${t.banner.edge})`);
  ok(await c.eval(`!!document.querySelector('.screen.game .board-square .board-host')`), `${tag} win: board stays mounted`);
  await shot(c, `${tag}_win_mate_banner`);
  // hide -> pill
  await tapEl(c, '.rb-card [data-rb="pill"]'); await sleep(600);
  t = await T(c); g = await c.eval(GEOM);
  ok(t.banner.state === 'pill' && g.cardOpacity < 0.05 && g.pillOpacity > 0.95 && g.pillH >= 44, `${tag} Hide → pill (${g.pillW.toFixed(0)}×${g.pillH.toFixed(0)})`);
  await shot(c, `${tag}_win_pill`);
  // pill -> banner
  await tapEl(c, '.rb-pill'); await sleep(600);
  t = await T(c);
  ok(t.banner.state === 'banner', `${tag} pill → banner`);
  // details -> sheet
  await tapEl(c, '.rb-card [data-act="results"]'); await sleep(600);
  t = await T(c);
  const sheetTxt = await c.eval(`document.querySelector('.sheet .results')?.textContent || ''`);
  ok(t.sheet && t.banner.state === 'expanded' && /Ladder points/.test(sheetTxt) && /Rematch/.test(sheetTxt) && /New bot/.test(sheetTxt), `${tag} Details → full results sheet (points, rematch, new bot)`);
  const hb = await c.eval(`(() => { const r = document.querySelector('.sheet .res-hide').getBoundingClientRect(); return { h: r.height, w: r.width, link: !!document.querySelector('.sheet .res-links [data-close]') }; })()`);
  ok(hb.h >= 44 && hb.w >= 200 && !hb.link, `${tag} sheet: big "Show board" button (${hb.w.toFixed(0)}×${hb.h.toFixed(0)}), small View-board link gone`);
  await shot(c, `${tag}_win_expanded`);
  await tapEl(c, '.sheet .res-hide'); await sleep(600);
  t = await T(c);
  ok(!t.sheet && t.banner.state === 'banner' && !(await c.eval('!!document.querySelector(".scrim")')), `${tag} Show board → back to the banner`);
  // actions-bar Results toggles the sheet too
  await click(c, '.actions [data-act="results"]'); await sleep(500);
  ok((await T(c)).sheet, `${tag} actions-bar Results opens the sheet`);
  await click(c, '.scrim'); await sleep(100);
  await c.eval(`(() => { const s = document.querySelector('.scrim'); s && s.dispatchEvent(new MouseEvent('click', { bubbles: true })); })()`); await sleep(500);
  t = await T(c);
  ok(!t.sheet && t.banner.state === 'banner', `${tag} scrim tap closes the sheet back to the banner`);
  // review with the banner up
  await click(c, '[data-rev="prev"]'); await sleep(300); await click(c, '[data-rev="prev"]'); await sleep(500);
  t = await T(c);
  ok(t.reviewing && t.banner.state === 'banner', `${tag} review ◀ works with the banner up`);
  await shot(c, `${tag}_win_review`);
  await click(c, '[data-rev="live"]'); await sleep(500);
  ok(!(await T(c)).reviewing, `${tag} back to live`);
  // view cycling + flip after the game
  const v0 = await c.eval(`document.querySelector('.actions [data-act="camera"] .lbl')?.textContent`);
  await click(c, '.actions [data-act="camera"]'); await sleep(900);
  const v1 = await c.eval(`document.querySelector('.actions [data-act="camera"] .lbl')?.textContent`);
  ok(v0 && v1 && v0 !== v1, `${tag} View button after the game: ${v0} → ${v1}`);
  await shot(c, `${tag}_win_view_${v1}`);
  await click(c, '.actions [data-act="flip"]'); await sleep(700);
  t = await T(c);
  ok(t.banner.state === 'banner', `${tag} flip keeps the banner (edge ${t.banner.edge})`);
  await shot(c, `${tag}_win_flipped`);
  await c.eval(`localStorage.removeItem('gambit.settings'); 1`);

  // 2. loss by mate (resumed into a finished game: banner straight away)
  await load(c, '#/home');
  await resumeGame(c, { botId: 'pip', tc: 'unlimited', color: 'w', moves: ['f2f3', 'e7e5', 'g2g4', 'd8h4'] });
  await waitFor(c, 'window.__gambitTest().banner', 6000); await sleep(900);
  t = await T(c);
  ok(t.result.outcome === 'loss' && t.result.reason === 'checkmate' && !t.banner.celebrating && t.banner.state === 'banner', `${tag} loss by mate: banner, no celebration`);
  ok(/Checkmate · Pip wins/.test(await c.eval(`document.querySelector('.rb-card b').textContent`)), `${tag} loss: "Checkmate · Pip wins"`);
  await shot(c, `${tag}_loss_mate`);

  // 3. draw (by repetition, via the finish hook)
  await load(c, '#/home');
  await resumeGame(c, { botId: 'pip', tc: 'unlimited', color: 'w', moves: ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8'] });
  await c.eval(`window.__gambitTest().finish('1/2-1/2', 'repetition')`);
  await waitFor(c, 'window.__gambitTest().banner', 6000); await sleep(900);
  ok(/Draw by repetition/.test(await c.eval(`document.querySelector('.rb-card b').textContent`)), `${tag} draw: "Draw by repetition"`);
  await shot(c, `${tag}_draw`);

  // 4. resign through the button
  await load(c, '#/home');
  await resumeGame(c, { botId: 'pip', tc: 'unlimited', color: 'w', moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6'] });
  await click(c, '.actions [data-act="resign"]'); await sleep(300); await click(c, '.dialog [data-v="1"]');
  await waitFor(c, 'window.__gambitTest().banner', 6000); await sleep(900);
  t = await T(c);
  ok(t.result.reason === 'resign' && /You resigned/.test(await c.eval(`document.querySelector('.rb-card b').textContent`)), `${tag} resign: "You resigned"`);
  await shot(c, `${tag}_resign`);
  // rematch from the banner starts a new game
  await click(c, '.rb-card [data-act="rematch"]');
  await waitFor(c, '(()=>{const g=window.__gambitTest&&window.__gambitTest(); return g && g.ready && !g.over})()', 20000);
  ok(!(await c.eval('!!document.querySelector(".rb")')), `${tag} Rematch from the banner: new game, banner gone`);

  // 5. timeout (player White, 1+0 with 1.2 s left)
  await load(c, '#/home');
  await resumeGame(c, { botId: 'pip', tc: '1+0', color: 'w', moves: ['e2e4', 'e7e5'], clocks: { w: 1200, b: 60000 } });
  await waitFor(c, 'window.__gambitTest().banner', 8000); await sleep(900);
  t = await T(c);
  ok(t.result.reason === 'timeout' && /You lost on time/.test(await c.eval(`document.querySelector('.rb-card b').textContent`)), `${tag} timeout: "You lost on time"`);
  await shot(c, `${tag}_timeout`);

  // 6. abort
  await load(c, '#/home');
  await resumeGame(c, { botId: 'pip', tc: 'unlimited', color: 'w', moves: [] });
  await click(c, '.actions [data-act="resign"]'); await sleep(300); await click(c, '.dialog [data-v="1"]');
  await waitFor(c, 'window.__gambitTest().banner', 6000); await sleep(600);
  ok(/Game aborted/.test(await c.eval(`document.querySelector('.rb-card b').textContent`)) && !!(await c.eval('document.querySelector(".rb-card [data-act=newbot]")')), `${tag} abort: "Game aborted" + New bot`);
  await shot(c, `${tag}_abort`);
  await c.eval(`localStorage.removeItem('gambit.resume'); localStorage.removeItem('gambit.settings'); 1`);
}

async function puzzle(c, tag) {
  console.log(`puzzle @ ${tag}`);
  await load(c, '#/puzzles/p/c-fool');
  await waitFor(c, '(()=>{const t=window.__puzzleTest&&window.__puzzleTest(); return !!(t && t.ready)})()', 30000); await sleep(600);
  for (let i = 0; i < 6; i++) {
    const t = await c.eval('window.__puzzleTest()'); if (t.finished) break;
    await waitFor(c, 'window.__puzzleTest().ready || window.__puzzleTest().finished', 10000);
    await c.eval('window.__puzzleTest().playExpected()'); await sleep(1200);
  }
  await sleep(300);
  ok(await c.eval('window.__puzzleTest().finished'), `${tag} puzzle solved`);
  await shot(c, `${tag}_puzzle_solved_moment`);
  await sleep(2400);
  ok(!(await c.eval('!!document.querySelector(".pz-celebrate")')) && !!(await c.eval('document.querySelector("[data-act=next], .pz-nextbtn")')), `${tag} puzzle: celebration gone, board clear, Next button in the panel`);
  await shot(c, `${tag}_puzzle_solved`);
}

async function lesson(c, tag) {
  console.log(`lesson @ ${tag}`);
  await load(c, '#/learn/rook');
  await waitFor(c, '(()=>{const t=window.__learnTest&&window.__learnTest(); return !!(t && t.ready)})()', 30000); await sleep(600);
  const sqPt = sq => c.eval(`(() => { const b = window.__learnBoard(), host = document.querySelector('.ln-board .board-host') || document.querySelector('.ln-board'); const r = host.getBoundingClientRect(); const p = b.squareToScreen('${sq}'); return { x: r.left + p.x, y: r.top + p.y }; })()`);
  for (let guard = 0; guard < 160; guard++) {
    const t0 = Date.now();
    while (Date.now() - t0 < 15000) { const s = await c.eval('(()=>{const t=window.__learnTest(); return t && (!t.busy && (t.ready || t.kind==="quiz" || t.kind==="cta"))})()'); if (s) break; await sleep(150); }
    const t = await c.eval('(() => { const t = window.__learnTest(); return { step: t.step, kind: t.kind, finished: t.finished, failed: t.failed, e: t.expected() } })()');
    if (t.finished) break;
    if (t.failed) { await click(c, '[data-act=retry]'); await sleep(300); continue; }
    let e = t.e;
    if (e.kind === 'play') e = await c.eval('window.__learnTest().suggest()');
    if (e.kind === 'next') { await click(c, '[data-act=next]'); await sleep(300); }
    else if (e.kind === 'tap') { const p = await sqPt(e.sq); await tapAt(c, p.x, p.y); await sleep(200); }
    else if (e.kind === 'quiz') { await c.eval(`document.querySelectorAll('.ln-opt')[${e.index}].click()`); await sleep(300); }
    else if (e.kind === 'move') {
      const a = await sqPt(e.from); await tapAt(c, a.x, a.y); await sleep(150);
      const b = await sqPt(e.to); await tapAt(c, b.x, b.y); await sleep(500);
      if (await c.eval("!!document.querySelector('.promo')")) { await c.eval(`document.querySelector('.promo [data-p=q]').dispatchEvent(new PointerEvent('pointerdown', {bubbles:true})); document.querySelector('.promo [data-p=q]').click()`); await sleep(300); }
    } else break;
  }
  const fin = await c.eval('window.__learnTest().finished');
  ok(fin && fin.stars >= 1, `${tag} lesson finished (${fin && fin.stars}★)`);
  await sleep(500);
  await shot(c, `${tag}_lesson_done_moment`);
  await sleep(2000);
  const d = await c.eval(`(() => { const o = document.querySelector('.ln-done'), card = o.querySelector('.ln-done-card'), st = document.querySelector('.ln-board').getBoundingClientRect(), r = card.getBoundingClientRect();
    const btns = [...card.querySelectorAll('.btn')].map(b => b.getBoundingClientRect().height);
    return { docked: o.classList.contains('docked'), h: r.height, boardH: st.height, bottom: st.bottom - r.bottom, minBtn: Math.min(...btns), bg: getComputedStyle(o).backgroundColor }; })()`);
  ok(d.docked && d.h <= d.boardH * 0.22 && d.bottom < 20 && d.minBtn >= 44 && /rgba\(0, 0, 0, 0\)|transparent/.test(d.bg), `${tag} lesson: card docked to a slim strip at the board bottom (${d.h.toFixed(0)}/${d.boardH.toFixed(0)} px, btn ${d.minBtn.toFixed(0)})`);
  await shot(c, `${tag}_lesson_done`);
  ok(!!(await c.eval('document.querySelector(".ln-done [data-act=nextlesson]")')), `${tag} lesson: Next lesson button still there`);
}

const c = await CDP.open();
await setup(c);
try {
  for (const [w, h] of SIZES) {
    const tag = `${w}x${h}`;
    await size(c, w, h);
    if (MODE === 'all' || MODE === 'bot') await botScenarios(c, tag);
    if (MODE === 'all' || MODE === 'puzzle') await puzzle(c, tag);
    if (MODE === 'all' || MODE === 'lesson') await lesson(c, tag);
  }
} catch (e) { errors.push('crash: ' + e.message); console.log(e); }
await c.eval(`localStorage.removeItem('gambit.settings'); localStorage.removeItem('gambit.resume'); 1`).catch(() => {});
console.log(`\n${passes} ok, ${errors.length} problems`);
errors.forEach(e => console.log('  -', e));
process.exit(errors.length ? 1 : 0);
