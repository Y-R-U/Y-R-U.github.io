#!/usr/bin/env node
// ui-4 browser checks: raw CDP to `~/.claude/bin/cdp start --port 9530`.
//
//   node tools/ui4_cdp.mjs sizes   [--out=DIR]   # puzzle + lesson board size at phone portrait (DPR 3), screenshots
//   node tools/ui4_cdp.mjs info    [--out=DIR]   # puzzle info overlay: shows, slides away, tab brings it back
//   node tools/ui4_cdp.mjs views   [--out=DIR]   # puzzle/learn View button cycles Top → Tilt → 3D → Free
//   node tools/ui4_cdp.mjs settings [--out=DIR]  # settings sheet in puzzle/learn/game, live apply, back button
//   node tools/ui4_cdp.mjs all
//
// Exits 1 on any failure or console error.
import { writeFileSync, mkdirSync } from 'node:fs';

const argv = process.argv.slice(2);
const MODE = argv.find(a => !a.startsWith('--')) || 'all';
const args = Object.fromEntries(argv.filter(a => a.startsWith('--')).map(a => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.join('=') || true]; }));
const PORT = +(args.port || 9530);
const ROOT = args.base || 'http://192.168.0.236:8888/gms/3d/gambit/';
const OUT = args.out || '/tmp/gambit-ui4';
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
let passes = 0;
const fail = msg => { errors.push(msg); console.log('  FAIL', msg); };
const ok0 = 0;
const ok = (cond, msg) => { if (cond) { passes++; console.log('  ok  ', msg, errors.length ? `[errors: ${errors.length}]` : ''); } else fail(msg); };
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
async function size(c, w, h, mobile = true) {
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
async function hashGo(c, hash) { await c.eval(`location.hash = ${JSON.stringify(hash)}`); await sleep(300); }
async function shot(c, name) {
  const r = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, 'base64'));
  console.log('  shot', `${OUT}/${name}.png`);
}
const PZ_READY = '(()=>{const t=window.__puzzleTest&&window.__puzzleTest(); return !!(t && t.ready)})()';
const LN_READY = '(()=>{const t=window.__learnTest&&window.__learnTest(); return !!(t && t.ready)})()';
const rect = sel => `(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return null; const r=e.getBoundingClientRect(); return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}})()`;
async function tap(c, sel) {
  const r = await c.eval(rect(sel));
  if (!r) throw new Error('no element ' + sel);
  const x = r.x + r.w / 2, y = r.y + r.h / 2;
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await sleep(40);
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(150);
}
async function swipe(c, x, y0, y1) {
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
  const n = 8;
  for (let i = 1; i <= n; i++) { await sleep(16); await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + (y1 - y0) * i / n }] }); }
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(200);
}

const PUZZLES = ['c-fool', 'YipRQ', 'c-scholar', 'glZ7X', 'c-opera', 'c-saavedra'];
const LESSONS = ['pawn', 'knight', 'check', 'castle'];

async function sizes(c) {
  await load(c, '#/home');
  const ids = await c.eval(`fetch('assets/puzzles/index.json').then(r=>r.json()).then(i=>i.regions.flatMap(r=>r.nodes.map(n=>n[0])))`);
  const pz = PUZZLES.filter(p => ids.includes(p));
  // add a couple of long-story classics if present
  for (const id of ids.filter(x => x.startsWith('c-')).slice(-2)) if (!pz.includes(id)) pz.push(id);
  for (const [w, h] of [[390, 844], [360, 740]]) {
    await size(c, w, h);
    console.log(`puzzles @ ${w}x${h}`);
    await load(c, '#/puzzles');
    const seen = [];
    for (const id of pz) {
      await hashGo(c, `#/puzzles/p/${id}`);
      await waitFor(c, PZ_READY, 30000); await sleep(500);
      const b = await c.eval(rect('.pz-board'));
      seen.push(b.w);
      console.log(`  ${id.padEnd(14)} board ${b.w}x${b.h} @y${b.y}`);
      await shot(c, `pz-${w}-${id}`);
    }
    ok(Math.max(...seen) - Math.min(...seen) <= 1, `every puzzle board the same size at ${w}x${h} (${[...new Set(seen)].join(', ')})`);
    ok(Math.min(...seen) >= w - 1, `puzzle board fills the width at ${w}x${h} (min ${Math.min(...seen)})`);
    console.log(`lessons @ ${w}x${h}`);
    const ls = [];
    const lids = await c.eval(`import('./js/learn/data.js').then(m=>m.LESSONS.map(l=>l.id))`);
    for (const id of lids.filter((x, i) => i % 6 === 0 || LESSONS.includes(x)).slice(0, 6)) {
      await hashGo(c, `#/learn/${id}`);
      await waitFor(c, LN_READY, 30000); await sleep(500);
      const sizesHere = [];
      for (let step = 0; step < 3; step++) {
        const b = await c.eval(rect('.ln-board'));
        sizesHere.push(b.w);
        if (step === 0) await shot(c, `ln-${w}-${id}`);
        const t = await c.eval('window.__learnTest().expected()');
        if (!t || t.kind !== 'next') break;
        const n = await c.eval(`!!document.querySelector('[data-act="next"]')`);
        if (!n) break;
        await c.eval(`document.querySelector('[data-act="next"]').click()`); await sleep(700);
      }
      ls.push(...sizesHere);
      console.log(`  ${id.padEnd(14)} board ${sizesHere.join(' / ')}`);
    }
    ok(Math.max(...ls) - Math.min(...ls) <= 1, `every lesson step board the same size at ${w}x${h} (${[...new Set(ls)].join(', ')})`);
  }
}

async function info(c) {
  await size(c, 390, 844);
  console.log('puzzle info overlay');
  await load(c, '#/puzzles/p/c-fool');
  await waitFor(c, PZ_READY, 30000);
  await sleep(300);
  ok(await c.eval(`!!document.querySelector('.pz-info.open')`), 'info overlay open at start');
  await shot(c, 'info-open');
  await sleep(4600);
  ok(await c.eval(`!document.querySelector('.pz-info.open')`), 'info overlay slid away after ~4 s');
  await shot(c, 'info-closed');
  await tap(c, '.pz-info-tab');
  await sleep(450);
  ok(await c.eval(`!!document.querySelector('.pz-info.open')`), 'tapping the tab brings it back');
  await shot(c, 'info-reopened');
  await sleep(4800);
  ok(await c.eval(`!!document.querySelector('.pz-info.open')`), 'reopened by the player: stays until dismissed');
  await tap(c, '.pz-info-tab');
  await sleep(450);
  ok(await c.eval(`!document.querySelector('.pz-info.open')`), 'tab closes it again');
  // swipe down on the tab opens it
  const r = await c.eval(rect('.pz-info-tab'));
  await swipe(c, r.x + r.w / 2, r.y + r.h / 2, r.y + r.h / 2 + 80);
  await sleep(400);
  ok(await c.eval(`!!document.querySelector('.pz-info.open')`), 'swipe down on the tab opens it');
  const r2 = await c.eval(rect('.pz-info-card'));
  await swipe(c, r2.x + r2.w / 2, r2.y + r2.h - 10, r2.y - 60);
  await sleep(400);
  ok(await c.eval(`!document.querySelector('.pz-info.open')`), 'swipe up on the card closes it');
  // board still answers moves while the info is up (overlay covers only the top)
  await tap(c, '.pz-info-tab'); await sleep(300);
  const done = await c.eval(`(async()=>{window.__puzzleTest().playExpected(); for(let i=0;i<80;i++){await new Promise(r=>setTimeout(r,100)); if(window.__puzzleTest().finished) return true;} return false})()`);
  ok(done, 'puzzle solvable with the info up');
}

async function views(c) {
  await size(c, 390, 844);
  await load(c, '#/home');
  await c.eval(`localStorage.setItem('gambit.settings', JSON.stringify({...JSON.parse(localStorage.getItem('gambit.settings')||'{}'), view:'top'}))`);
  console.log('puzzle view cycling');
  await load(c, '#/puzzles/p/YipRQ');
  await waitFor(c, PZ_READY, 30000);
  const seq = [];
  for (let i = 0; i < 4; i++) {
    await tap(c, '.pz-acts [data-act="camera"]'); await sleep(900);
    seq.push(await c.eval(`({cam: window.__puzzleBoard().camera.view, lbl: document.querySelector('.pz-acts [data-act="camera"] .lbl')?.textContent, set: JSON.parse(localStorage.getItem('gambit.settings')).view})`));
    if (i === 2) await shot(c, 'pz-view-free');
  }
  console.log('  ', JSON.stringify(seq));
  ok(seq.map(s => s.cam).join() === 'tilt,angle,free,top', 'puzzle View cycles Top → Tilt → 3D → Free → Top');
  ok(seq.every(s => s.set === s.cam), 'view saved to settings each step');
  ok(seq[2].lbl === 'Free', 'View button label follows');
  await tap(c, '.pz-acts [data-act="camera"]'); await sleep(200);   // top -> tilt
  await tap(c, '.pz-acts [data-act="camera"]'); await sleep(200);   // -> angle
  await tap(c, '.pz-acts [data-act="camera"]'); await sleep(900);   // -> free
  const z0 = await c.eval('window.__puzzleBoard().camera.state?.zoom ?? window.__puzzleBoard().camera.rig?.cur.zoom');
  const br = await c.eval(rect('.pz-board'));
  await c.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: br.x + br.w / 2, y: br.y + br.h / 2, deltaX: 0, deltaY: -400 });
  await sleep(900);
  const z1 = await c.eval('window.__puzzleBoard().camera.state?.zoom ?? window.__puzzleBoard().camera.rig?.cur.zoom');
  console.log('   zoom', z0, '->', z1);
  ok(z0 != null && z1 < z0, 'Free view zooms in a puzzle');
  await shot(c, 'pz-view-free-zoom');
  console.log('learn view cycling');
  await c.eval(`localStorage.setItem('gambit.settings', JSON.stringify({...JSON.parse(localStorage.getItem('gambit.settings')||'{}'), view:'top'}))`);
  await load(c, '#/learn/pawn');
  await waitFor(c, LN_READY, 30000);
  const has = await c.eval(`!!document.querySelector('[data-act="camera"]')`);
  ok(has, 'lesson has a View button');
  if (has) {
    await tap(c, '[data-act="camera"]'); await sleep(900);
    ok(await c.eval(`window.__learnBoard().camera.view`) === 'tilt', 'lesson View cycles to Tilt');
  }
}

async function topSettings(c) { await tap(c, '#settings-btn'); await sleep(450); }
async function settings(c) {
  await size(c, 390, 844);
  await load(c, '#/home');
  await c.eval(`localStorage.setItem('gambit.settings', JSON.stringify({...JSON.parse(localStorage.getItem('gambit.settings')||'{}'), view:'top', theme:'classic', battleSpeed:1}))`);
  console.log('settings from a puzzle');
  await load(c, '#/home');
  await hashGo(c, '#/puzzles'); await sleep(500);
  await hashGo(c, '#/puzzles/p/YipRQ');
  await waitFor(c, PZ_READY, 30000);
  await c.eval('window.__puzzleTest().playWrong()'); await sleep(600);   // a miss: progress worth keeping
  await topSettings(c);
  ok(await c.eval(`!!document.querySelector('.sheet .settings')`), 'puzzle: settings opens as a sheet');
  ok(await c.eval(`location.hash`) === '#/puzzles/p/YipRQ', 'puzzle: still on the puzzle route');
  await shot(c, 'set-puzzle-sheet');
  await c.eval(`document.querySelector('.sheet .theme-card[data-theme="fantasy"]').click()`); await sleep(2500);
  await c.eval(`document.querySelector('.sheet [data-seg="view"] [data-v="angle"], .sheet .seg[data-name="view"] [data-value="angle"]')?.click()`); await sleep(800);
  const st = await c.eval(`({theme: window.__puzzleBoard().theme?.id ?? window.__puzzleBoard().themeId, view: window.__puzzleBoard().camera.view})`);
  console.log('   board after sheet changes', JSON.stringify(st));
  ok(st.view === 'angle', 'puzzle: view change applies live');
  await shot(c, 'set-puzzle-live');
  // hardware back closes the sheet, keeps the puzzle
  await c.eval('history.back()'); await sleep(600);
  ok(await c.eval(`!document.querySelector('.sheet')`), 'puzzle: back closes the sheet');
  ok(await c.eval(`location.hash`) === '#/puzzles/p/YipRQ', 'puzzle: back with the sheet open stays on the puzzle');
  ok(await c.eval('window.__puzzleTest().mistakes') === 1, 'puzzle: progress kept (1 miss)');
  // back again: previous screen (the map), not home
  await c.eval('history.back()'); await sleep(600);
  console.log('   after second back', await c.eval('location.hash'));
  ok(await c.eval('location.hash') === '#/puzzles', 'puzzle: next back goes to the map');
  // sheet closed by X: history stays consistent (no extra back needed)
  await hashGo(c, '#/puzzles/p/YipRQ'); await waitFor(c, PZ_READY, 30000);
  await topSettings(c);
  await c.eval(`document.querySelector('.sheet [data-close]').click()`); await sleep(500);
  ok(await c.eval('location.hash') === '#/puzzles/p/YipRQ', 'puzzle: closing with X keeps the route');
  await c.eval('history.back()'); await sleep(600);
  ok(await c.eval('location.hash') === '#/puzzles', 'puzzle: after X-close, one back goes to the map');

  console.log('settings from a lesson');
  await hashGo(c, '#/learn'); await sleep(500);
  await hashGo(c, '#/learn/pawn'); await waitFor(c, LN_READY, 30000);
  await c.eval(`document.querySelector('[data-act="next"]')?.click()`); await sleep(600);
  const stepBefore = await c.eval('window.__learnTest().step');
  await topSettings(c);
  ok(await c.eval(`!!document.querySelector('.sheet .settings')`), 'lesson: settings opens as a sheet');
  await c.eval(`document.querySelector('.sheet .theme-card[data-theme="halloween"]').click()`); await sleep(2500);
  await shot(c, 'set-lesson-live');
  await c.eval('history.back()'); await sleep(600);
  ok(await c.eval(`!document.querySelector('.sheet')`) && (await c.eval('location.hash')) === '#/learn/pawn', 'lesson: back closes the sheet, stays');
  ok(await c.eval('window.__learnTest().step') === stepBefore, 'lesson: step kept');

  console.log('settings page from a non-board screen');
  await hashGo(c, '#/ladder'); await sleep(400);
  await topSettings(c);
  ok(await c.eval('location.hash') === '#/settings', 'ladder: settings opens the full page');
  const back = await c.eval(`document.querySelector('#topbar .tb-left a.tb-btn')?.getAttribute('href')`);
  console.log('   settings back href', back);
  await tap(c, '#topbar .tb-left a.tb-btn'); await sleep(500);
  ok(await c.eval('location.hash') === '#/ladder', 'settings page back returns to the ladder');
  // a fresh tab straight onto #/settings: back goes home
  await c.eval('sessionStorage.clear()');
  await load(c, '#/settings');
  await tap(c, '#topbar .tb-left a.tb-btn'); await sleep(500);
  ok(await c.eval('location.hash') === '#/home', 'deep-linked settings page back goes home');

  console.log('settings from a bot game');
  await load(c, '#/home');
  await c.eval(`localStorage.removeItem('gambit.resume')`);
  await hashGo(c, '#/play/bot'); await sleep(600);
  const botHref = await c.eval(`document.querySelector('a[href^="#/play/bot/"]')?.getAttribute('href')`);
  await hashGo(c, botHref); await sleep(600);
  await c.eval(`document.querySelector('[data-act="play"]')?.click()`);
  await waitFor(c, '(()=>{const t=window.__gambitTest&&window.__gambitTest(); return !!(t&&t.ready)})()', 30000);
  await topSettings(c);
  ok(await c.eval(`!!document.querySelector('.sheet .settings')`), 'game: settings sheet');
  await c.eval('history.back()'); await sleep(600);
  ok(await c.eval(`!document.querySelector('.sheet')`) && (await c.eval('location.hash')) === '#/game', 'game: back closes the sheet, stays in the game');
}

async function theme(c) {
  await size(c, 390, 844);
  await load(c, '#/puzzles/p/YipRQ');
  await waitFor(c, PZ_READY, 30000);
  for (const t of ['fantasy', 'scifi', 'halloween', 'classic']) {
    await topSettings(c);
    await c.eval(`document.querySelector('.sheet .theme-card[data-theme="${t}"]').click()`);
    await sleep(6000);
    console.log('  ', t, 'errors so far', errors.length);
    await c.eval('history.back()'); await sleep(500);
  }
  await topSettings(c);
  await c.eval(`document.querySelector('.sheet .theme-card[data-theme="fantasy"]').click()`);
  await sleep(150);
  await c.eval('history.back()'); await sleep(100); await c.eval('history.back()');
  await sleep(6000);
  console.log('   switch-then-leave errors so far', errors.length);
  // theme switch in a lesson, then leave for a non-board screen while it loads
  await load(c, '#/learn/pawn'); await waitFor(c, LN_READY, 30000);
  await topSettings(c);
  await c.eval(`document.querySelector('.sheet .theme-card[data-theme="halloween"]').click()`); await sleep(2500);
  await c.eval('history.back()'); await sleep(600);
  console.log('   lesson switch errors so far', errors.length);
  await hashGo(c, '#/ladder'); await sleep(6000);
  console.log('   lesson switch + leave errors so far', errors.length);
  await load(c, '#/puzzles/p/YipRQ'); await waitFor(c, PZ_READY, 30000);
  await topSettings(c);
  await c.eval(`document.querySelector('.sheet .theme-card[data-theme="scifi"]').click()`); await sleep(2500);
  await c.eval(`document.querySelector('.sheet .seg[data-name="view"] [data-value="angle"]').click()`); await sleep(6000);
  console.log('   theme then view errors so far', errors.length);
  // rapid switching in the sheet, then leave and come back at once
  for (const t of ['fantasy', 'halloween', 'scifi', 'classic', 'fantasy']) { await c.eval(`document.querySelector('.sheet .theme-card[data-theme="${t}"]').click()`); await sleep(250); }
  await c.eval('history.back()'); await sleep(200);
  await hashGo(c, '#/puzzles'); await sleep(200); await hashGo(c, '#/puzzles/p/YipRQ'); await waitFor(c, PZ_READY, 30000);
  await sleep(6000);
  ok(await c.eval(`getComputedStyle(document.documentElement).getPropertyValue('--x')===''`) && errors.length === 0, 'rapid theme switching + remount: no errors');
}

async function plain(c) {
  await size(c, 390, 844);
  await load(c, '#/home');
  await c.eval(`localStorage.setItem('gambit.settings', JSON.stringify({...JSON.parse(localStorage.getItem('gambit.settings')||'{}'), view:'free', theme:'classic'}))`);
  console.log('plain theme: fixed view');
  await load(c, '#/puzzles/p/YipRQ'); await waitFor(c, PZ_READY, 30000);
  const btn = sel => c.eval(`(()=>{const b=document.querySelector(${JSON.stringify(sel)}); return b && {dis: b.disabled, lbl: b.querySelector('.lbl')?.textContent}})()`);
  let b = await btn('.pz-acts [data-act="camera"]');
  ok(!b.dis && b.lbl === 'Free', `puzzle View enabled in classic (${JSON.stringify(b)})`);
  await topSettings(c);
  await c.eval(`document.querySelector('.sheet .theme-card[data-theme="plain"]').click()`); await sleep(3000);
  b = await btn('.pz-acts [data-act="camera"]');
  ok(b.dis && b.lbl === 'Top', `puzzle View disabled + "Top" after switching to Plain (${JSON.stringify(b)})`);
  await c.eval('history.back()'); await sleep(400);
  await c.eval('window.__puzzleTest().hint()'); await sleep(500);
  await shot(c, 'plain-puzzle-hint');
  // promotion picker with plain art
  const imgs = await c.eval(`import('./js/app/ui.js').then(async m => { const st = document.querySelector('.pz-board'); const p = m.promotionPicker(st, {color:'b', board: window.__puzzleBoard()}); await new Promise(r=>setTimeout(r,500)); const n = st.querySelectorAll('.promo-row img').length; return n; })`);
  await shot(c, 'plain-promo');
  await c.eval(`document.querySelector('.promo')?.remove()`);
  ok(imgs === 4, `promotion picker shows Plain piece art (${imgs} imgs)`);
  console.log('plain theme: lesson + game');
  await hashGo(c, '#/learn/pawn'); await waitFor(c, LN_READY, 30000); await sleep(300);
  b = await btn('.ln-view');
  ok(b.dis && b.lbl === 'Top', `lesson View disabled in Plain (${JSON.stringify(b)})`);
  await topSettings(c);
  await c.eval(`document.querySelector('.sheet .theme-card[data-theme="classic"]').click()`); await sleep(3000);
  b = await btn('.ln-view');
  ok(!b.dis && b.lbl === 'Free', `lesson View back to enabled/Free in Classic (${JSON.stringify(b)})`);
  await c.eval(`document.querySelector('.sheet .theme-card[data-theme="plain"]').click()`); await sleep(3000);
  await c.eval('history.back()'); await sleep(400);
  await c.eval(`localStorage.removeItem('gambit.resume')`);
  await hashGo(c, '#/play/bot'); await sleep(600);
  const botHref = await c.eval(`document.querySelector('a[href^="#/play/bot/"]')?.getAttribute('href')`);
  await hashGo(c, botHref); await sleep(600);
  await c.eval(`document.querySelector('[data-act="play"]')?.click()`);
  await waitFor(c, '(()=>{const t=window.__gambitTest&&window.__gambitTest(); return !!(t&&t.ready)})()', 30000); await sleep(500);
  b = await btn('.actions [data-act="camera"]');
  ok(b.dis && b.lbl === 'Top', `game View disabled in Plain (${JSON.stringify(b)})`);
  await topSettings(c);
  await c.eval(`document.querySelector('.sheet .theme-card[data-theme="classic"]').click()`); await sleep(3000);
  b = await btn('.actions [data-act="camera"]');
  ok(!b.dis && b.lbl === 'Free', `game View enabled again in Classic (${JSON.stringify(b)})`);
  await c.eval('history.back()'); await sleep(300);
}

async function desk(c) {
  await size(c, 1440, 900, false);
  await load(c, '#/puzzles/p/c-saavedra'); await waitFor(c, PZ_READY, 30000); await sleep(400);
  await shot(c, 'desk-puzzle-info');
  const b = await c.eval(rect('.pz-board'));
  ok(b.w > 600, `desktop puzzle board is big (${b.w})`);
  await size(c, 360, 640);
  await load(c, '#/puzzles/p/c-scholar'); await waitFor(c, PZ_READY, 30000); await sleep(4600);
  await shot(c, 'pz-360x640');
  await hashGo(c, '#/learn/pawn'); await waitFor(c, LN_READY, 30000); await sleep(400);
  await shot(c, 'ln-360x640');
}

const c = await CDP.open();
await setup(c);
try {
  if (MODE === 'sizes' || MODE === 'all') await sizes(c);
  if (MODE === 'info' || MODE === 'all') await info(c);
  if (MODE === 'views' || MODE === 'all') await views(c);
  if (MODE === 'settings' || MODE === 'all') await settings(c);
  if (MODE === 'theme' || MODE === 'all') await theme(c);
  if (MODE === 'plain' || MODE === 'all') await plain(c);
  if (MODE === 'desk' || MODE === 'all') await desk(c);
} catch (e) { fail('harness: ' + e.message); }
// leave the shared browser profile clean for the other suites (board_game_test expects default settings)
try { await c.eval(`localStorage.removeItem('gambit.settings'); localStorage.removeItem('gambit.resume'); sessionStorage.clear()`); } catch { /* ignore */ }
console.log(`\n${passes} passed, ${errors.length} failed/errors`);
errors.forEach(e => console.log('  ' + e));
process.exit(errors.length ? 1 : 0);
