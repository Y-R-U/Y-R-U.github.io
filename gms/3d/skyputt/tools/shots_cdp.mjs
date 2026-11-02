#!/usr/bin/env node
// Headless Chrome driver (raw CDP, no puppeteer). Start Chrome first:
//   ~/.claude/bin/cdp start --port 9512
//   node tools/shots_cdp.mjs shots [--out=DIR] [--theme=greybox] [--holes=4,5] [--sizes=p,l]
//        title, map, settings + each hole (flyover/tee/aim/rolling/rest), portrait 412x915 and landscape 1440x900
//   node tools/shots_cdp.mjs story [--out=DIR]   career: name, intro, map, lesson 1, result, rival hole card
//   node tools/shots_cdp.mjs play  [--out=DIR] [--from=N] [--minutes=20]   plays the front nine (or from hole N) through the real UI to the scorecard
//   node tools/shots_cdp.mjs meta  [--out=DIR] [--sizes=p,l]   M5: ladder, shop, chest, helper tray, cosmetics, week rollover
//   node tools/shots_cdp.mjs overview [--out=DIR] [--holes=10,11] [--themes=sky,spooky,frost]   story2: per theme + hole, the
//        portrait tee view and a high landscape overview of the whole hole (rock under gaps, voids, backdrop)
//        --course=festival (events2) loads ?course=festival&hole=N
//   node tools/shots_cdp.mjs events2 [--out=DIR] [--only=lunar,candy,egg,sky-games,fallback,map] [--quick]   events2: the 2027
//        events via ?eventdate= (Egg Hunt played to the end), candy theme fallback, Festival Isles map tab
//   node tools/shots_cdp.mjs events3 [--out=DIR] [--days=YYYY-MM-DD,…] [--sizes=p,d,l] [--quick|--no-play]   events3: rolling
//        calendar (tile / list / page per date and size) and a weekend round played to the end
//   node tools/shots_cdp.mjs nines [--out=DIR]   story2: map nine tabs, back nine lock, Play back nine, scorecard
//   node tools/shots_cdp.mjs career [--out=DIR] [--chapter=2]   story2: chapter 2-6 screens (tour map, intro, a lesson, rival + tournament setup)
// Reports console errors / exceptions and exits 1 if there are any.
import { writeFileSync, mkdirSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(3).map(a => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.join('=') || true]; }));
const MODE = process.argv[2] || 'shots';
const PORT = +(args.port || 9512);
const BASE = args.base || 'http://192.168.0.236:8888/gms/3d/skyputt/';
const OUT = args.out || '/tmp/skyputt-shots';
const THEME = args.theme ? `theme=${args.theme}&` : '';
mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = []; }
  static async open() {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    let page = args.own ? null : list.find(t => t.type === 'page');   // --own: always a fresh target (shared Chrome)
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
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'warning')
      console.log('  warn:', m.params.args.map(a => a.value ?? a.description).join(' ').slice(0, 300));
    if (m.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push('log: ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
  });
}
let mobile = true;
async function size(c, w, h, mob) {
  mobile = mob;
  await c.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mob ? 2 : 1, mobile: mob });
  await c.send('Emulation.setTouchEmulationEnabled', { enabled: mob });
}
async function go(c, qs = '') {
  await c.send('Page.navigate', { url: `${BASE}?${THEME}${qs}&t=${Date.now()}` });
  await sleep(500);
  await waitFor(c, 'window.__booted === true', 30000);
  await sleep(1200);
}
async function waitFor(c, expr, ms = 5000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { if (await c.eval(expr)) return true; } catch { /* navigating */ } await sleep(100); }
  throw new Error('timeout waiting for ' + expr);
}
async function shot(c, name) {
  const r = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, 'base64'));
  console.log('  shot', `${OUT}/${name}.png`);
}
// Drag with touch (mobile) or mouse (desktop) from (x0,y0) to (x1,y1); release unless hold.
async function drag(c, x0, y0, x1, y1, { steps = 8, hold = false } = {}) {
  if (mobile) {
    const tp = (x, y) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
    await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(x0, y0) });
    for (let i = 1; i <= steps; i++) { await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps) }); await sleep(16); }
    if (!hold) await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= steps; i++) { await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0 + (x1 - x0) * i / steps, y: y0 + (y1 - y0) * i / steps, button: 'left', buttons: 1 }); await sleep(16); }
    if (!hold) await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x1, y: y1, button: 'left', buttons: 0, clickCount: 1 });
  }
}
async function release(c, x, y) {
  if (mobile) await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  else await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
}
const state = c => c.eval('(() => { const r = __skyputt.round; return r ? { state: r.state, hole: r.index + 1, strokes: r.strokes, fps: Math.round(__skyputt.fps), theme: __skyputt.themeId, calls: __skyputt.app.renderer.info.render.calls, tris: __skyputt.app.renderer.info.render.triangles, coins: __skyputt.store.data.coins, helpers: __skyputt.store.data.helpers } : null })()');

// story2: course map front / back nine tabs, the back nine lock, Play back nine → hole 10/18, scorecard title.
async function ninesMode(c) {
  await size(c, 412, 915, true);
  await go(c, 'fresh&noflyover');
  await c.eval(`document.querySelector('#t-map').click()`); await sleep(500);
  await shot(c, 'nines-map-front');
  await c.eval(`document.querySelector('#map [data-nine=back]').click()`); await sleep(400);
  await shot(c, 'nines-map-back-locked');
  console.log('   locked back nine:', await c.eval(`({ disabled: document.querySelector('#map [data-a=front]').disabled, note: document.querySelector('#map .card-note')?.innerText })`));
  await c.eval(`(() => { for (let i = 1; i <= 9; i++) __skyputt.store.markFinished('sky' + i); document.querySelector('#map [data-a=back]').click(); document.querySelector('#t-map').click(); })()`); await sleep(500);
  await shot(c, 'nines-map-back-open');
  await c.eval(`document.querySelector('#map [data-a=front]').click()`); await sleep(1500);
  await waitFor(c, '__skyputt.round && __skyputt.round.state === "ready"', 40000);
  const r = await c.eval(`({ index: __skyputt.round.index, end: __skyputt.round.end, hud: document.querySelector('#hud').innerText.split('\\n').slice(0, 4).join(' ') })`);
  console.log('   back nine round:', JSON.stringify(r));
  if (r.index !== 9 || r.end !== 18) errors.push('back nine round did not start at hole 10 / end at 18');
  await shot(c, 'nines-hole10');
  // jump to the last hole of the nine and finish it with a debug putt sequence → scorecard
  await c.eval(`(() => { const R = __skyputt.round; R.scores = []; R.loadHole(17); R.endFlyover(); })()`); await sleep(800);
  await c.eval(`(() => { const R = __skyputt.round; R.strokes = 5; R.finishHole(false); })()`); await sleep(1200);
  console.log('   last card:', await c.eval(`document.querySelector('#h-card .card')?.innerText.replace(/\\n+/g, ' | ')`));
  await c.eval(`document.querySelector('#h-card [data-a=next]').click()`); await sleep(1000);
  await shot(c, 'nines-scorecard');
  console.log('   scorecard:', await c.eval(`document.querySelector('#h-card .card-kicker')?.innerText`));
}

// story2: tee view + a high overview of each hole in each theme (looks for rock under gaps, voids, props on the track)
async function overview(c) {
  const HOLES = (args.holes ? String(args.holes) : '10,11,12,13,14,15,16,17,18').split(',').map(Number);
  const THEMES = (args.themes ? String(args.themes) : 'sky,spooky,frost').split(',');
  for (const th of THEMES) for (const i of HOLES) {
    await size(c, 412, 915, true);
    await c.send('Page.navigate', { url: `${BASE}?theme=${th}&hole=${i}${args.course ? '&course=' + args.course : ''}&noflyover&t=${Date.now()}` });
    await sleep(500);
    await waitFor(c, 'window.__booted === true && !!__skyputt.round && __skyputt.round.state === "ready"', 40000);
    await sleep(1500);
    const tag = args.course ? args.course + i : 'hole' + i;   // events2: --course=festival
    await shot(c, `${th}-${tag}-tee`);
    await size(c, 1280, 800, false);
    await sleep(400);
    await c.eval(`(() => { const r = __skyputt.round, { THREE } = __skyputt, cam = __skyputt.app.camera;
      r.update = () => {};   // freeze the round; the frame loop keeps rendering
      const b = r.view.info.bounds, ctr = b.getCenter(new THREE.Vector3()), sz = b.getSize(new THREE.Vector3());
      const L = Math.max(sz.x, sz.z), vd = r.view.info.viewDir;
      cam.position.set(ctr.x - vd.x * L * 0.55 + 0.3 * L, ctr.y + L * 0.75, ctr.z - vd.z * L * 0.55);
      cam.lookAt(ctr); cam.updateMatrixWorld(); })()`);
    await sleep(1200);
    await shot(c, `${th}-${tag}-over`);
    console.log('  ', th, 'hole', i, JSON.stringify(await state(c)));
  }
}

async function shots(c) {
  const HOLES = (args.holes ? String(args.holes) : '1,2,3,4,5,6,7,8,9').split(',').map(Number);
  const SIZES = (args.sizes ? String(args.sizes) : 'p,l').split(',');
  for (const [tag, w, h, mob] of [['p', 412, 915, true], ['l', 1440, 900, false]]) {
    if (!SIZES.includes(tag)) continue;
    await size(c, w, h, mob);
    await go(c, 'fresh');
    await sleep(800);
    await shot(c, `${tag}-title`);
    await c.eval(`document.querySelector('#t-map').click()`); await sleep(500);
    await shot(c, `${tag}-map`);
    await c.eval(`document.querySelector('#map [data-a=back]').click(); document.querySelector('#t-settings').click()`); await sleep(400);
    await shot(c, `${tag}-settings`);
    await c.eval(`document.querySelector('#sheet [data-a=close]').click()`);
    for (const i of HOLES) {
      await go(c, `hole=${i}`);
      await sleep(300);
      await shot(c, `${tag}-hole${i}-flyover`);
      await waitFor(c, '__skyputt.round.state === "ready"', 40000);
      await sleep(900);
      await shot(c, `${tag}-hole${i}-tee`);
      // aim: drag straight down from the middle (shoot forward) and hold
      const cx = w / 2, cy = h * 0.45;
      await drag(c, cx, cy, cx - w * 0.02, cy + Math.min(w, h) * 0.3, { hold: true });
      await sleep(300);
      await shot(c, `${tag}-hole${i}-aim`);
      await release(c, cx - w * 0.02, cy + Math.min(w, h) * 0.3);
      await sleep(1200);
      await shot(c, `${tag}-hole${i}-rolling`);
      await waitFor(c, '["ready","done","sinking"].includes(__skyputt.round.state)', 30000).catch(() => {});
      await sleep(900);
      await shot(c, `${tag}-hole${i}-rest`);
      console.log('  ', tag, 'hole', i, JSON.stringify(await state(c)));
    }
  }
}

// Plays every hole through the UI: aim at the planned heading by converting it to a screen drag.
async function play(c) {
  await size(c, 412, 915, true);
  await go(c, 'fresh');
  if (args.from) await c.eval(`__skyputt.startRound(${+args.from - 1}, 'round')`);
  else await c.eval(`document.querySelector('#t-play').click()`);
  await sleep(1500);
  const tEnd = Date.now() + (+(args.minutes || 20)) * 60e3;
  while (Date.now() < tEnd) {
    const s = await state(c);
    if (!s) break;
    if (s.state === 'done') {
      const card = await c.eval(`document.querySelector('#h-card .card')?.innerText.replace(/\\n+/g,' | ')`);
      console.log('   card:', card);
      await shot(c, `play-hole${s.hole}-card`);
      const last = await c.eval(`!!document.querySelector('#h-card [data-a=again]')`);
      if (last) { await shot(c, 'play-scorecard'); break; }
      await c.eval(`document.querySelector('#h-card [data-a=next]').click()`);
      await sleep(1500);
      const s2 = await state(c);
      if (s2.state === 'done') { await shot(c, 'play-scorecard'); break; }
      continue;
    }
    if (s.state !== 'ready') { await sleep(300); continue; }
    // let the camera settle (the drag is relative to the camera heading at touch-down)
    await waitFor(c, 'Math.abs(((__skyputt.app.rig.goalYaw - __skyputt.app.rig.yaw + 9*Math.PI) % (2*Math.PI)) - Math.PI) < 0.003', 8000).catch(() => {});
    // ask the page for a good shot (headless planner in-page) and convert to a drag
    const plan = await c.eval(`(${planInPage.toString()})()`);
    const W = 412, H = 915, maxDrag = Math.min(W, H) * 0.5, CANCEL = 24;
    const len = CANCEL + plan.power ** (1) * (maxDrag - CANCEL);
    // drag vector: aim = F*dy - R*dx with camera yaw; rel angle a from camera forward: dir = (sin a) R + (cos a) F
    // → dy = cos a * len, dx = -sin a * len
    const dx = -Math.sin(plan.rel) * len, dy = Math.cos(plan.rel) * len;
    const x0 = W / 2, y0 = 300;
    await drag(c, x0, y0, x0 + dx, y0 + dy, { steps: 10 });
    console.log(`   hole ${s.hole} stroke ${s.strokes + 1}: rel ${(plan.rel * 180 / Math.PI).toFixed(1)}° power ${(plan.power * 100).toFixed(0)}% (expect ${plan.expect})`);
    await sleep(600);
  }
}
// Career: name entry, intro dialogue, the tour map, lesson 1 played by drags, result + dialogue,
// then the rival event's first hole card (rival scores) and the theme picker.
async function playHoles(c, W = 412, H = 915) {
  const tEnd = Date.now() + 10 * 60e3;
  while (Date.now() < tEnd) {
    const s = await c.eval('__skyputt.round ? __skyputt.round.state : null');
    if (!s) return;
    if (s === 'done') return 'card';
    if (s !== 'ready') { await sleep(300); continue; }
    await waitFor(c, 'Math.abs(((__skyputt.app.rig.goalYaw - __skyputt.app.rig.yaw + 9*Math.PI) % (2*Math.PI)) - Math.PI) < 0.003', 8000).catch(() => {});
    const plan = await c.eval(`(${planInPage.toString()})()`);
    const maxDrag = Math.min(W, H) * 0.5, len = 24 + plan.power * (maxDrag - 24);
    await drag(c, W / 2, 300, W / 2 - Math.sin(plan.rel) * len, 300 + Math.cos(plan.rel) * len, { steps: 10 });
    await sleep(600);
  }
}
async function tapDialogue(c, name) {
  for (let i = 0; i < 12; i++) {
    const open = await c.eval(`!document.querySelector('#dialogue').hidden`);
    if (!open) return;
    if (i === 0 && name) await shot(c, name);
    await c.eval(`document.querySelector('#dialogue').click()`); await sleep(250);
  }
}
async function story(c) {
  await size(c, 412, 915, true);
  await go(c, 'fresh&noflyover');
  await c.eval(`document.querySelector('#t-career').click()`); await sleep(400);
  await shot(c, 'story-name');
  await c.eval(`(() => { const i = document.querySelector('#c-name'); i.value = 'Robin'; document.querySelector('#career [data-a=ok]').click(); })()`);
  await sleep(400);
  await tapDialogue(c, 'story-intro');
  await sleep(300);
  await shot(c, 'story-career');
  await c.eval(`document.querySelector('#career [data-ev="muni-l1"]').click()`); await sleep(400);
  await tapDialogue(c, 'story-lesson1-before');
  await waitFor(c, '__skyputt.round && __skyputt.round.state === "ready"', 30000);
  await sleep(500);
  await shot(c, 'story-lesson1-hole');
  await playHoles(c);
  await shot(c, 'story-lesson1-card');
  await c.eval(`document.querySelector('#h-card [data-a=next]').click()`); await sleep(800);
  await shot(c, 'story-lesson1-result');
  console.log('   result:', await c.eval(`document.querySelector('#career .card')?.innerText.replace(/\\n+/g, ' | ')`));
  await c.eval(`document.querySelector('#career [data-a=ok]').click()`); await sleep(300);
  await tapDialogue(c);
  // jump ahead: mark lessons + rounds passed, open the rival
  await c.eval(`(() => { const st = __skyputt.store.story(); for (const id of ['muni-l1','muni-l2','muni-l3','muni-r1','muni-r2']) st.events[id] = { passed: true, best: 9 }; __skyputt.store.saveStory(); __skyputt.career.render(); })()`);
  await sleep(300);
  await shot(c, 'story-career-later');
  await c.eval(`document.querySelector('#career [data-ev="muni-rival"]').click()`); await sleep(400);
  await tapDialogue(c, 'story-rival-before');
  await waitFor(c, '__skyputt.round && __skyputt.round.state === "ready"', 30000);
  await playHoles(c);
  await shot(c, 'story-rival-card');
  console.log('   rival card:', await c.eval(`document.querySelector('#h-card .card')?.innerText.replace(/\\n+/g, ' | ')`));
  console.log('   state:', JSON.stringify(await c.eval(`({ coins: __skyputt.store.data.coins, helpers: __skyputt.store.data.helpers, story: __skyputt.store.story() })`)));
}

// The whole of chapter 1 through the UI: every event in order, helpers used where a lesson asks,
// every dialogue tapped through, until the chapter-complete rank card.
async function muni(c) {
  await size(c, 412, 915, true);
  await go(c, 'fresh&noflyover');
  await c.eval(`document.querySelector('#t-career').click()`); await sleep(400);
  await c.eval(`(() => { document.querySelector('#c-name').value = 'Robin'; document.querySelector('#career [data-a=ok]').click(); })()`);
  await sleep(400); await tapDialogue(c);
  if (args.skip) {   // --skip=N: mark the first N Muni events passed (e.g. 5 = straight to the rival)
    await c.eval(`(() => { const st = __skyputt.store.story(); ['muni-l1','muni-l2','muni-l3','muni-r1','muni-r2','muni-rival'].slice(0, ${+args.skip}).forEach(id => st.events[id] = { passed: true, best: 9 }); __skyputt.store.saveStory(); __skyputt.career.render(); })()`);
    await sleep(300);
  }
  const tries = {};
  for (let guard = 0; guard < 14; guard++) {
    const next = await c.eval(`(() => { const b = [...document.querySelectorAll('#career .ev.open')][0]; return b ? b.dataset.ev : null })()`);
    if (!next) break;
    tries[next] = (tries[next] || 0) + 1;
    if (tries[next] > 3) { console.log('   giving up on', next); break; }
    const t0 = Date.now();
    await c.eval(`document.querySelector('#career [data-ev="${next}"]').click()`); await sleep(400);
    await tapDialogue(c, `muni-${next}-before`);
    if (next === 'muni-rival' || next === 'muni-open') {
      const warm = await c.eval(`document.querySelector('#career .card-title')?.innerText || ''`);
      if (/warming/i.test(warm)) { await shot(c, `muni-${next}-warming`); console.log('   ' + warm); }
    }
    await waitFor(c, '__skyputt.round && __skyputt.round.state === "ready"', 90000);
    const log = [];
    let ghostShot = false, waitedGhost = 0;
    for (;;) {
      const s = await c.eval('__skyputt.round ? { st: __skyputt.round.state, n: __skyputt.round.strokes, used: __skyputt.round.used, hole: __skyputt.round.index } : null');
      if (!s) break;
      if (s.st === 'done') {
        log.push(await c.eval(`document.querySelector('#h-card .card-title')?.innerText`));
        if (s.hole === 0 && next === 'muni-rival') await shot(c, 'muni-rival-card1');
        await c.eval(`document.querySelector('#h-card [data-a=next]').click()`); await sleep(900); continue;
      }
      if (next === 'muni-rival' && !ghostShot && await c.eval('!!(__skyputt.round.ghost && __skyputt.round.ghost.ball.playing)')) {
        ghostShot = true; await shot(c, 'muni-rival-ghost'); console.log('   ghost replaying:', await c.eval('__skyputt.round.ghost.name'));
      }
      if (s.st !== 'ready') { await sleep(300); continue; }
      if (next === 'muni-rival' && s.n === 0 && !ghostShot && (waitedGhost = (waitedGhost || 0) + 1) < 12) { await sleep(2500); continue; }   // let the ghost tee off first
      if (next === 'muni-l2' && !s.used.longSight) { await c.eval(`document.querySelector('#h-sight').click()`); await sleep(200); }
      if (next === 'muni-l3' && !s.used.mulligan && s.n === 0) {
        await drag(c, 206, 300, 206, 300 + 24 + 0.12 * 182, { steps: 6 });   // a deliberate dud
        await waitFor(c, '__skyputt.round.state === "ready"', 30000); await sleep(300);
        await c.eval(`document.querySelector('#h-mull').click()`); await sleep(400);
        continue;
      }
      await waitFor(c, 'Math.abs(((__skyputt.app.rig.goalYaw - __skyputt.app.rig.yaw + 9*Math.PI) % (2*Math.PI)) - Math.PI) < 0.003', 8000).catch(() => {});
      const plan = await c.eval(`(${planInPage.toString()})()`);
      const len = 24 + plan.power * 182;
      await drag(c, 206, 300, 206 - Math.sin(plan.rel) * len, 300 + Math.cos(plan.rel) * len, { steps: 10 });
      await sleep(600);
    }
    await sleep(600);
    await shot(c, `muni-${next}-result`);
    const card = await c.eval(`document.querySelector('#career .card')?.innerText.replace(/\\n+/g, ' | ')`);
    console.log(`   ${next} (${((Date.now() - t0) / 1000) | 0}s) holes: ${log.join(', ')}\n      ${card}`);
    await c.eval(`document.querySelector('#career [data-a=ok]').click()`); await sleep(300);
    await tapDialogue(c, `muni-${next}-after`);
    const rank = await c.eval(`(() => { const t = document.querySelector('#career .card-title'); return t && /New rank/.test(t.innerText) ? t.innerText : null })()`);
    if (rank) { await shot(c, 'muni-rank'); console.log('   ' + rank); await c.eval(`document.querySelector('#career [data-a=ok]').click()`); await sleep(400); }
  }
  await shot(c, 'muni-career-end');
  console.log('   final:', JSON.stringify(await c.eval(`({ coins: __skyputt.store.data.coins, helpers: __skyputt.store.data.helpers, chapters: __skyputt.store.story().chapters, events: __skyputt.store.story().events })`)));
}

// story2: a later chapter through the real UI. Earlier tours are marked done (or just their rival
// beaten with --open), the chapter's events are played in order by planner drags, lesson helpers
// are armed from the event data, every dialogue is tapped through, and the theme of each event is
// checked. --chapter=2..6 · --only=id,id (mark the others passed, play just these) · --holes1 (quit
// each event after its first hole card, for a quick look) · --open (gate check: beat only the
// previous rival, leave its tournament open).
async function careerMode(c) {
  const K = +(args.chapter || 2) - 1;
  await size(c, 412, 915, true);
  await go(c, 'fresh&noflyover');
  await c.eval(`document.querySelector('#t-career').click()`); await sleep(400);
  await c.eval(`(() => { document.querySelector('#c-name').value = 'Robin'; document.querySelector('#career [data-a=ok]').click(); })()`);
  await sleep(400); await tapDialogue(c);
  const data = await c.eval(`import('./js/story/data/chapters.js').then(m => m.CHAPTERS.map(ch => ({ id: ch.id, theme: ch.data.theme || null, events: ch.data.events.map(e => ({ id: e.id, kind: e.kind, use: e.goal.use || null, theme: e.theme || null })) })))`);
  const ch = data[K];
  const only = args.only ? String(args.only).split(',') : null;
  await c.eval(`(() => { const st = __skyputt.store.story(), D = ${JSON.stringify(data)};
    for (let k = 0; k < ${K}; k++) { for (const e of D[k].events) if (!${!!args.open} || e.kind === 'rival' || k < ${K - 1}) st.events[e.id] = { passed: true, best: 9 }; if (!${!!args.open} || k < ${K - 1}) st.chapters[D[k].id] = { done: true }; }
    ${only ? `for (const e of D[${K}].events) if (!${JSON.stringify(only)}.includes(e.id)) st.events[e.id] = { passed: true, best: 9 };` : ''}
    __skyputt.store.saveStory(); __skyputt.career.render(); })()`);
  await sleep(500);
  await shot(c, `career${K + 1}-map`);
  console.log('   tours:', await c.eval(`[...document.querySelectorAll('#career .tour')].map(t => (t.classList.contains('open') ? 'open ' : 'locked ') + t.querySelector('.tour-name').innerText.replace(/\\n/g, ' ') + ' — ' + t.querySelector('.tour-sub').innerText).join(' | ')`));
  const tries = {};
  for (let guard = 0; guard < 16; guard++) {
    const next = await c.eval(`(() => { const b = [...document.querySelectorAll('#career .ev.open')].find(b => b.dataset.ch === '${ch.id}'); return b ? b.dataset.ev : null })()`);
    if (!next) break;
    tries[next] = (tries[next] || 0) + 1;
    if (tries[next] > (+args.tries || 2)) { console.log('   giving up on', next); break; }
    const ev = ch.events.find(e => e.id === next), t0 = Date.now();
    await c.eval(`document.querySelector('#career [data-ev="${next}"]').click()`); await sleep(400);
    await tapDialogue(c, tries[next] === 1 ? `career${K + 1}-${next}-before` : null);
    if (ev.kind === 'rival' || ev.kind === 'tournament') {
      const warm = await c.eval(`document.querySelector('#career .card-title')?.innerText || ''`);
      if (/warming/i.test(warm)) console.log('   ' + warm);
    }
    await waitFor(c, '__skyputt.round && __skyputt.round.state === "ready"', 120000);
    const want = ev.theme || ch.theme;
    const theme = await c.eval('__skyputt.themeId');
    if (want && theme !== want) errors.push(`${next}: theme ${theme}, wanted ${want}`);
    if (tries[next] === 1) await shot(c, `career${K + 1}-${next}-hole`);
    const log = [];
    let armed = false, quit = false;
    for (;;) {
      const s = await c.eval('__skyputt.round ? { st: __skyputt.round.state, n: __skyputt.round.strokes, used: __skyputt.round.used, hole: __skyputt.round.index } : null');
      if (!s) break;
      if (s.st === 'done') {
        log.push(await c.eval(`document.querySelector('#h-card .card-title')?.innerText`));
        if (s.hole === 0 && tries[next] === 1) await shot(c, `career${K + 1}-${next}-card1`);
        if (args.holes1) { quit = true; await c.eval('__skyputt.round.exit ? __skyputt.round.exit() : __skyputt.round.onExit()'); await sleep(1500); break; }
        await c.eval(`document.querySelector('#h-card [data-a=next]').click()`); await sleep(900); continue;
      }
      if (s.st !== 'ready') { await sleep(300); continue; }
      if (ev.use === 'mulligan' && !s.used.mulligan && s.n === 0) {
        await drag(c, 206, 300, 206, 300 + 24 + 0.12 * 182, { steps: 6 });
        await waitFor(c, '__skyputt.round.state === "ready"', 30000); await sleep(300);
        await c.eval(`document.querySelector('#h-mull').click()`); await sleep(400);
        continue;
      }
      if (ev.use && ev.use !== 'mulligan' && !armed) {
        armed = true;
        const sel = ev.use === 'longSight' ? '#h-sight' : '#h-' + ev.use;
        await c.eval(`document.querySelector('${sel}').click()`); await sleep(300);
      }
      await waitFor(c, 'Math.abs(((__skyputt.app.rig.goalYaw - __skyputt.app.rig.yaw + 9*Math.PI) % (2*Math.PI)) - Math.PI) < 0.003', 8000).catch(() => {});
      const plan = await c.eval(`(${planInPage.toString()})()`);
      const len = 24 + plan.power * 182;
      await drag(c, 206, 300, 206 - Math.sin(plan.rel) * len, 300 + Math.cos(plan.rel) * len, { steps: 10 });
      await sleep(600);
    }
    if (quit) {   // quick look: count it as passed so the next event opens
      console.log(`   ${next}: first hole ${log.join(', ')} (quit, theme ${theme})`);
      await waitFor(c, '!document.querySelector("#career").hidden', 20000).catch(() => {}); await sleep(400);
      await c.eval(`(() => { __skyputt.store.story().events['${next}'] = { passed: true, best: 9 }; __skyputt.store.saveStory(); __skyputt.career.render(); })()`); await sleep(300);
      continue;
    }
    await sleep(600);
    await shot(c, `career${K + 1}-${next}-result`);
    const card = await c.eval(`document.querySelector('#career .card')?.innerText.replace(/\\n+/g, ' | ')`);
    console.log(`   ${next} (${((Date.now() - t0) / 1000) | 0}s) holes: ${log.join(', ')}\n      ${card}`);
    await c.eval(`document.querySelector('#career [data-a=ok]').click()`); await sleep(300);
    await tapDialogue(c, `career${K + 1}-${next}-after`);
    const rank = await c.eval(`(() => { const t = document.querySelector('#career .card-title'); return t && /New rank|Trophy/.test(t.innerText) ? t.innerText : null })()`);
    if (rank) { await shot(c, `career${K + 1}-rank`); console.log('   ' + rank); await c.eval(`document.querySelector('#career [data-a=ok]').click()`); await sleep(400); }
    if (only && only.every(id => tries[id])) break;
  }
  await shot(c, `career${K + 1}-end`);
  console.log('   final:', JSON.stringify(await c.eval(`({ rank: document.querySelector('#career .map-sub')?.innerText, coins: __skyputt.store.data.coins, owned: __skyputt.store.data.cosmetics.owned, chapters: __skyputt.store.story().chapters, theme: __skyputt.themeId })`)));
}

// Events: title tile, list, Spooky page, one full event round by drags, claims, then the Frost
// Fair (upcoming, then live via ?eventdate) and the ended Spooky page with its rank claim.
async function eventsMode(c) {
  await size(c, 412, 915, true);
  await go(c, 'fresh&noflyover&eventdate=2026-11-02');
  await shot(c, 'ev-title');
  await c.eval(`document.querySelector('#t-events').click()`); await sleep(400);
  await shot(c, 'ev-list');
  await c.eval(`document.querySelector('#events [data-id^="spooky"]').click()`); await sleep(400);
  await shot(c, 'ev-spooky');
  await c.eval(`document.querySelector('#events [data-a=play]').click()`);
  await waitFor(c, '__skyputt.round && __skyputt.round.state === "ready"', 40000);
  await sleep(600);
  await shot(c, 'ev-round-hole1');
  console.log('   theme in round:', await c.eval('__skyputt.app.themeId'));
  for (;;) {
    const s = await c.eval('__skyputt.round ? __skyputt.round.state : null');
    if (!s) break;
    if (s === 'done') {
      const card = await c.eval(`document.querySelector('#h-card .card')?.innerText.replace(/\\n+/g, ' | ')`);
      console.log('   ' + card.slice(0, 150));
      await c.eval(`document.querySelector('#h-card [data-a=next]').click()`); await sleep(900); continue;
    }
    if (s !== 'ready') { await sleep(300); continue; }
    await waitFor(c, 'Math.abs(((__skyputt.app.rig.goalYaw - __skyputt.app.rig.yaw + 9*Math.PI) % (2*Math.PI)) - Math.PI) < 0.003', 8000).catch(() => {});
    const plan = await c.eval(`(${planInPage.toString()})()`);
    const len = 24 + plan.power * 182;
    await drag(c, 206, 300, 206 - Math.sin(plan.rel) * len, 300 + Math.cos(plan.rel) * len, { steps: 10 });
    await sleep(600);
  }
  await waitFor(c, '!document.querySelector("#events").hidden', 30000);
  await sleep(500);
  console.log('   theme after:', await c.eval('__skyputt.app.themeId'));
  console.log('   page:', await c.eval(`document.querySelector('#events .card-note')?.innerText`));
  await shot(c, 'ev-after-round');
  // claim every claimable goal
  for (let i = 0; i < 6; i++) { const any = await c.eval(`(() => { const b = document.querySelector('#events [data-claim]'); if (b) b.click(); return !!b })()`); if (!any) break; await sleep(300); }
  await shot(c, 'ev-claimed');
  console.log('   progress:', JSON.stringify(await c.eval(`({ coins: __skyputt.store.data.coins, ev: __skyputt.store.data.events })`)).slice(0, 400));
  // play the same round's pickups again → no new currency (ledger)
  await go(c, 'noflyover&eventdate=2026-11-20');
  await c.eval(`document.querySelector('#t-events').click()`); await sleep(400);
  await shot(c, 'ev-list-nov20');
  await c.eval(`document.querySelector('#events [data-id^="spooky"]').click()`); await sleep(400);
  await shot(c, 'ev-spooky-ended');
  const claim = await c.eval(`(() => { const b = document.querySelector('#events [data-a=rank]'); if (b) b.click(); return !!b })()`);
  await sleep(300);
  console.log('   rank claim button:', claim, '→', await c.eval(`document.querySelector('#events .card-note')?.innerText`));
  await go(c, 'noflyover&eventdate=2026-12-03');
  await c.eval(`document.querySelector('#t-events').click()`); await sleep(300);
  await c.eval(`document.querySelector('#events [data-id^="frost"]').click()`); await sleep(400);
  await shot(c, 'ev-frost-live');
}

// events2: the 2027 events. For each, ?eventdate= on a live day → title tile, list, event page, start the
// round (theme + first hole), quit (player theme restored). The Egg Hunt round is played to the end by drags
// (Festival Isles holes in the browser). Candy Carnival is also run with its theme forced missing → fallback.
// Then the course map's Festival Isles tab and a festival hole from it.
async function events2Mode(c) {
  await size(c, 412, 915, true);
  const EVS = [['lunar', '2027-02-06'], ['candy', '2027-03-01'], ['egg', '2027-03-28'], ['sky-games', '2027-07-01']];
  const only = args.only ? String(args.only).split(',') : null;
  let fresh = 'fresh&';
  for (const [key, day] of EVS) {
    if (only && !only.includes(key)) continue;
    await go(c, `${fresh}noflyover&eventdate=${day}`); fresh = '';
    console.log(`   ${key} @ ${day}: tile =`, await c.eval(`document.querySelector('#t-events').innerText.replace(/\\n+/g, ' | ')`));
    await shot(c, `e2-${key}-title`);
    await c.eval(`document.querySelector('#t-events').click()`); await sleep(400);
    await shot(c, `e2-${key}-list`);
    await c.eval(`document.querySelector('#events [data-id^="${key}"]').click()`); await sleep(400);
    await shot(c, `e2-${key}-page`);
    console.log('     page:', await c.eval(`document.querySelector('#events [data-a=play]')?.innerText.replace(/\\n+/g, ' ')`));
    await c.eval(`document.querySelector('#events [data-a=play]').click()`);
    await waitFor(c, '__skyputt.round && __skyputt.round.state === "ready"', 60000);
    await sleep(1500);
    await shot(c, `e2-${key}-hole1`);
    console.log('     round theme:', await c.eval('__skyputt.app.themeId'), '· hole 1:', await c.eval('__skyputt.round.def.id + " " + __skyputt.round.def.name'), '· holes:', await c.eval('__skyputt.round.course.holes.map(h => h.id).join(",")'));
    if (key === 'egg' && !args.quick) {   // play the whole round
      for (let n = 0; n < 60; n++) {
        const st = await c.eval('__skyputt.round ? __skyputt.round.state : null');
        if (!st) break;
        if (st === 'done') {
          const card = await c.eval(`document.querySelector('#h-card .card')?.innerText.replace(/\\n+/g, ' | ')`);
          console.log('     ' + (card || '').slice(0, 120));
          await c.eval(`document.querySelector('#h-card [data-a=next]')?.click()`); await sleep(1200); n--; continue;
        }
        if (st !== 'ready') { await sleep(400); n--; continue; }
        await waitFor(c, 'Math.abs(((__skyputt.app.rig.goalYaw - __skyputt.app.rig.yaw + 9*Math.PI) % (2*Math.PI)) - Math.PI) < 0.003', 8000).catch(() => {});
        const plan = await c.eval(`(${planInPage.toString()})()`);
        const len = 24 + plan.power * 182;
        await drag(c, 206, 300, 206 - Math.sin(plan.rel) * len, 300 + Math.cos(plan.rel) * len, { steps: 10 });
        await sleep(700);
      }
      await waitFor(c, '!document.querySelector("#events").hidden', 60000);
      await sleep(600);
      console.log('     after round:', await c.eval(`document.querySelector('#events .card-note')?.innerText`), '· theme', await c.eval('__skyputt.app.themeId'));
      for (let i = 0; i < 8; i++) { const any = await c.eval(`(() => { const b = document.querySelector('#events [data-claim]'); if (b) b.click(); return !!b })()`); if (!any) break; await sleep(300); }
      await shot(c, `e2-${key}-after`);
    } else {
      await c.eval('__skyputt.round.exit ? __skyputt.round.exit() : __skyputt.round.onExit()');
      await waitFor(c, '!document.querySelector("#events").hidden', 30000);
      await sleep(600);
      console.log('     quit → theme', await c.eval('__skyputt.app.themeId'));
    }
  }
  if (!only || only.includes('fallback')) {   // Candy Carnival with its theme missing → themeFallback (sky), not greybox
    await go(c, 'noflyover&eventdate=2027-03-01');
    await c.eval(`import('./js/events/data/candy_carnival.js').then(m => { m.default.theme = 'no-such-theme'; })`);
    await c.eval(`document.querySelector('#t-events').click()`); await sleep(400);
    await c.eval(`document.querySelector('#events [data-id^="candy"]').click()`); await sleep(400);
    await c.eval(`document.querySelector('#events [data-a=play]').click()`);
    await waitFor(c, '__skyputt.round && __skyputt.round.state === "ready"', 60000);
    await sleep(1200);
    console.log('   candy with a missing theme → round theme:', await c.eval('__skyputt.app.themeId'));
    await shot(c, 'e2-candy-fallback');
    await c.eval('__skyputt.round.exit ? __skyputt.round.exit() : __skyputt.round.onExit()');
    await sleep(1500);
  }
  if (!only || only.includes('map')) {   // the course map's Festival Isles tab
    await go(c, 'noflyover');
    await c.eval(`document.querySelector('#t-map').click()`); await sleep(400);
    await c.eval(`document.querySelector('#map [data-course="festival"]').click()`); await sleep(400);
    await shot(c, 'e2-map-festival');
    console.log('   map:', await c.eval(`document.querySelector('#map .map-title').innerText + ' · ' + [...document.querySelectorAll('#map .tile')].map(t => t.querySelector('.nm').innerText + (t.disabled ? ' (locked)' : '')).join(', ')`));
    await c.eval(`document.querySelector('#map .tile[data-i="0"]').click()`);
    await waitFor(c, '__skyputt.round && __skyputt.round.state === "ready"', 60000);
    await sleep(1000);
    console.log('   map → hole:', await c.eval('__skyputt.round.def.id + " · HUD " + document.querySelector("#hud")?.innerText.split("\\n").slice(0, 2).join(" ")'));
    await shot(c, 'e2-map-fest1');
    await c.eval('__skyputt.round.exit ? __skyputt.round.exit() : __skyputt.round.onExit()');
    await sleep(1500);
    console.log('   back on map:', await c.eval(`!document.querySelector('#map').hidden && document.querySelector('#map .map-title').innerText`));
    await c.eval(`document.querySelector('#map [data-nine="front"], #map [data-course="sky"]')?.click()`); await sleep(400);
    console.log('   tab back to sky:', await c.eval(`document.querySelector('#map .map-title').innerText + ' · ' + document.querySelector('#map .map-sub').innerText`));
  }
}

// M5: title, ladder (this week + a settled week via ?eventdate), shop tabs, a chest opening,
// helper tray + tooltip, armed helpers in play (guard rails, ghost), a skinned ball with a trail,
// in portrait 412x915 and landscape 1440x900.
async function metaMode(c) {
  const SIZES = (args.sizes ? String(args.sizes) : 'p,l').split(',');
  for (const [tag, w, h, mob] of [['p', 412, 915, true], ['l', 1440, 900, false]]) {
    if (!SIZES.includes(tag)) continue;
    await size(c, w, h, mob);
    await go(c, 'fresh&noflyover&eventdate=2026-11-04');
    await c.eval(`(() => { const s = __skyputt.store; s.data.coins = 3000; s.data.chests.queue.push('gold', 'silver', 'wood'); s.save(); })()`);
    // a few ladder points so you sit mid-table
    await c.eval(`(() => { const m = __skyputt.meta; for (const id of ['sky1','sky2','sky3','sky4','sky5','sky6','sky7','sky8','sky9']) m.onHole({ id, par: 3, strokes: 3, picked: false, stars: 2 }); })()`);
    await go(c, 'noflyover&eventdate=2026-11-04');
    await shot(c, `${tag}-m-title`);
    await c.eval(`document.querySelector('#t-ladder').click()`); await sleep(400);
    await shot(c, `${tag}-m-ladder`);
    console.log('   ladder:', (await c.eval(`document.querySelector('#ladder .lad-hero')?.innerText.replace(/\\n+/g,' | ')`)));
    await c.eval(`document.querySelector('#ladder').scrollTop = 9999`); await sleep(200);
    await shot(c, `${tag}-m-ladder-bottom`);
    await c.eval(`document.querySelector('#ladder [data-a=back]').click()`); await sleep(200);
    await c.eval(`document.querySelector('#t-shop').click()`); await sleep(400);
    await shot(c, `${tag}-m-shop-chests`);
    await c.eval(`document.querySelector('#shop [data-open]').click()`); await sleep(500);
    await shot(c, `${tag}-m-chest-closed`);
    await c.eval(`document.querySelector('#chest').click()`); await sleep(2300);
    await shot(c, `${tag}-m-chest-open`);
    console.log('   chest:', await c.eval(`document.querySelector('#chest .prizes')?.innerText.replace(/\\n+/g,' ')`));
    await c.eval(`document.querySelector('#chest .chest-ok').click()`); await sleep(300);
    for (const t of ['helpers', 'balls', 'trails']) {
      await c.eval(`document.querySelector('#shop [data-tab=${t}]').click()`); await sleep(300);
      await shot(c, `${tag}-m-shop-${t}`);
    }
    // buy + equip the glow ball and the rainbow trail (two taps each)
    await c.eval(`document.querySelector('#shop [data-tab=balls]').click()`); await sleep(200);
    for (let i = 0; i < 2; i++) { await c.eval(`document.querySelector('#shop [data-item="ball:glow"]').click()`); await sleep(200); }
    await c.eval(`document.querySelector('#shop [data-tab=trails]').click()`); await sleep(200);
    for (let i = 0; i < 2; i++) { await c.eval(`document.querySelector('#shop [data-item="trail:${tag === 'p' ? 'rainbow' : 'sparkle'}"]').click()`); await sleep(200); }
    console.log('   cosmetics:', JSON.stringify(await c.eval('__skyputt.store.data.cosmetics')), 'coins', await c.eval('__skyputt.store.data.coins'));
    await c.eval(`document.querySelector('#shop [data-a=back]').click()`); await sleep(200);
    // play hole 7: tray + tooltip, Bumper Guard + Ghost armed, then a roll with the trail
    await c.eval(`__skyputt.startRound(6, 'single')`);
    await waitFor(c, '__skyputt.round && __skyputt.round.state === "ready"', 30000); await sleep(900);
    await c.eval(`(() => { const b = document.querySelector('#h-guard'); b.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' })); })()`);
    await c.eval(`document.querySelector('#h-guard').click()`); await sleep(150);
    await c.eval(`document.querySelector('#h-ghost').click()`); await sleep(400);
    await shot(c, `${tag}-m-hole7-armed`);
    console.log('   armed:', JSON.stringify(await c.eval('__skyputt.round.armed')), 'mods', JSON.stringify(await c.eval('__skyputt.round.ball.mods')), 'tip:', await c.eval(`document.querySelector('#h-tip').innerText.replace(/\\n/g,' ')`));
    const cx = w / 2, cy = h * 0.45;
    await drag(c, cx, cy, cx, cy + Math.min(w, h) * 0.32, { hold: true }); await sleep(300);
    await shot(c, `${tag}-m-hole7-aim`);
    await release(c, cx, cy + Math.min(w, h) * 0.32);
    await sleep(700);
    await shot(c, `${tag}-m-hole7-trail`);
    await waitFor(c, '["ready","done","sinking"].includes(__skyputt.round.state)', 30000).catch(() => {});
    console.log('   after shot armed:', JSON.stringify(await c.eval('__skyputt.round.armed')), 'helpers', JSON.stringify(await c.eval('__skyputt.store.data.helpers')));
    await sleep(500);
    await shot(c, `${tag}-m-hole7-rest`);
  }
  // week rollover: play some holes on Nov 4, then open on Nov 10 → result + claim
  await size(c, 412, 915, true);
  await go(c, 'fresh&noflyover&eventdate=2026-11-04');
  await c.eval(`(() => { const m = __skyputt.meta; for (let i = 0; i < 3; i++) for (const id of ['sky1','sky2','sky3','sky4','sky5','sky6','sky7','sky8','sky9']) m.onHole({ id, par: 3, strokes: 2, picked: false, stars: 3 }); })()`);
  await go(c, 'noflyover&eventdate=2026-11-10');
  await shot(c, 'p-m-title-rollover');
  await c.eval(`document.querySelector('#t-ladder').click()`); await sleep(400);
  await shot(c, 'p-m-ladder-result');
  console.log('   result:', await c.eval(`document.querySelector('#ladder .lad-result')?.innerText.replace(/\\n+/g,' | ')`));
  await c.eval(`document.querySelector('#ladder [data-claim]').click()`); await sleep(300);
  await shot(c, 'p-m-ladder-claimed');
  console.log('   claimed:', await c.eval(`document.querySelector('#ladder .card-note')?.innerText`), JSON.stringify(await c.eval('({ tier: __skyputt.meta.ladder().tier, chests: __skyputt.store.data.chests.queue, coins: __skyputt.store.data.coins })')));
}

// Runs in the page: searches heading x power with the real sim, returns the best relative to the camera.
function planInPage() {
  const r = __skyputt.round, w = r.world, b = r.ball, h = r.hole, rig = __skyputt.app.rig;
  const camYaw = rig.yaw + rig.lookYaw;
  const cupS = h.frames.find(f => f.cupRow).s + 0.2;
  const sOf = (x, y, z) => { let best = Infinity, s = 0; for (const f of h.frames) { const d = (f.p[0] - x) ** 2 + 4 * (f.p[1] - y) ** 2 + (f.p[2] - z) ** 2; if (d < best) { best = d; s = f.s; } } return s; };
  const SPEED = p => 0.25 + (6.4 - 0.25) * Math.pow(p, 1.25);
  let best = null;
  for (let da = -60; da <= 60; da += 1.5) for (let pw = 0.1; pw <= 1.0001; pw += 0.03) {
    const yaw = camYaw + da * Math.PI / 180, sp = SPEED(pw);
    const bb = b.clone();
    w.shoot(bb, Math.sin(yaw) * sp, -Math.cos(yaw) * sp);
    let t = w.time + 0.15, n = 0;
    while (bb.state === 'moving' && n < 240 * 25) { w.stepBall(bb, t); t += 1 / 240; n++; bb.events.length = 0; }
    let score = bb.state === 'cup' ? -1000 + pw : bb.state === 'oob' ? 1000 : (cupS - sOf(bb.px, bb.py, bb.pz)) + Math.hypot(bb.px - h.cup.x, bb.pz - h.cup.z) * 0.5;
    if (!best || score < best.score) best = { score, rel: da * Math.PI / 180, power: pw, expect: bb.state };
  }
  return best;
}

// events3: the rolling calendar. For each date (?eventdate=) and size (portrait phone, desktop, landscape
// phone 844x390): title tile, events list, the featured event's page. Then a weekend round on 2026-11-14:
// started in its theme on holes from several courses, played to the end by drags (unless --quick), goals claimed.
async function events3Mode(c) {
  const DAYS = (args.days ? String(args.days) : '2026-11-03,2026-11-10,2026-11-14,2027-04-24,2028-03-01,2031-10-25').split(',');
  const SIZES = { p: [412, 915, true], d: [1440, 900, false], l: [844, 390, true] };
  const sizes = (args.sizes ? String(args.sizes) : 'p,d,l').split(',');
  let fresh = 'fresh&';
  for (const day of DAYS) for (const sz of sizes) {
    await size(c, ...SIZES[sz]);
    await go(c, `${fresh}noflyover&eventdate=${day}`); fresh = '';
    console.log(`   ${day} ${sz}: tile =`, await c.eval(`document.querySelector('#t-events').innerText.replace(/\\n+/g, ' | ')`));
    await shot(c, `e3-${day}-${sz}-title`);
    await c.eval(`document.querySelector('#t-events').click()`); await sleep(400);
    if (sz === 'p') console.log('     list:', await c.eval(`[...document.querySelectorAll('#events .sec, #events .ev-tile b')].map(e => e.innerText).join(' / ')`));
    await shot(c, `e3-${day}-${sz}-list`);
    await c.eval(`document.querySelector('#events .ev-tile')?.click()`); await sleep(400);
    await shot(c, `e3-${day}-${sz}-page`);
    const over = await c.eval(`(() => { const el = document.querySelector('#events .career-card'); return el ? el.scrollWidth > el.clientWidth + 1 || document.documentElement.scrollWidth > innerWidth + 1 : 'none'; })()`);
    if (over) console.log('     WARNING: horizontal overflow on the page', over);
  }
  if (args['no-play']) return;
  await size(c, 412, 915, true);
  await go(c, 'noflyover&eventdate=2026-11-14');
  await c.eval(`document.querySelector('#t-events').click()`); await sleep(400);
  await c.eval(`document.querySelector('#events [data-id^="weekend"]').click()`); await sleep(400);
  console.log('   weekend page:', await c.eval(`document.querySelector('#events .map-title').innerText + ' · ' + document.querySelector('#events [data-a=play]')?.innerText.replace(/\\n+/g, ' ')`));
  await c.eval(`document.querySelector('#events [data-a=play]').click()`);
  await waitFor(c, '__skyputt.round && __skyputt.round.state === "ready"', 60000);
  await sleep(1500);
  await shot(c, 'e3-weekend-hole1');
  console.log('     round theme:', await c.eval('__skyputt.app.themeId'), '· holes:', await c.eval('__skyputt.round.course.holes.map(h => h.id).join(",")'));
  if (args.quick) {
    await c.eval('__skyputt.round.exit ? __skyputt.round.exit() : __skyputt.round.onExit()');
  } else {
    for (let n = 0; n < 80; n++) {
      const st = await c.eval('__skyputt.round ? __skyputt.round.state : null');
      if (!st) break;
      if (st === 'done') {
        const card = await c.eval(`document.querySelector('#h-card .card')?.innerText.replace(/\\n+/g, ' | ')`);
        console.log('     ' + (card || '').slice(0, 120));
        await c.eval(`document.querySelector('#h-card [data-a=next]')?.click()`); await sleep(1200); n--; continue;
      }
      if (st !== 'ready') { await sleep(400); n--; continue; }
      await waitFor(c, 'Math.abs(((__skyputt.app.rig.goalYaw - __skyputt.app.rig.yaw + 9*Math.PI) % (2*Math.PI)) - Math.PI) < 0.003', 8000).catch(() => {});
      const plan = await c.eval(`(${planInPage.toString()})()`);
      const len = 24 + plan.power * 182;
      await drag(c, 206, 300, 206 - Math.sin(plan.rel) * len, 300 + Math.cos(plan.rel) * len, { steps: 10 });
      await sleep(700);
    }
  }
  await waitFor(c, '!document.querySelector("#events").hidden', 60000);
  await sleep(600);
  console.log('     after round:', await c.eval(`document.querySelector('#events .card-note')?.innerText`), '· theme', await c.eval('__skyputt.app.themeId'));
  for (let i = 0; i < 8; i++) { const any = await c.eval(`(() => { const b = document.querySelector('#events [data-claim]'); if (b) b.click(); return !!b })()`); if (!any) break; await sleep(300); }
  await shot(c, 'e3-weekend-after');
  console.log('     save:', await c.eval(`JSON.stringify(Object.fromEntries(Object.entries(__skyputt.store.data.events).map(([k, v]) => [k, { pts: v.points, r: v.rounds, cur: v.currency, cl: v.claimed }])))`), '· coins', await c.eval('__skyputt.store.data.coins'));
}

const c = await CDP.open();
await setup(c);
try {
  if (MODE === 'shots') await shots(c);
  else if (MODE === 'play') await play(c);
  else if (MODE === 'story') await story(c);
  else if (MODE === 'muni') await muni(c);
  else if (MODE === 'events') await eventsMode(c);
  else if (MODE === 'events2') await events2Mode(c);
  else if (MODE === 'events3') await events3Mode(c);
  else if (MODE === 'meta') await metaMode(c);
  else if (MODE === 'overview') await overview(c);
  else if (MODE === 'nines') await ninesMode(c);
  else if (MODE === 'career') await careerMode(c);
} catch (e) { errors.push('driver: ' + e.message); }
if (errors.length) { console.log('ERRORS:\n  ' + [...new Set(errors)].join('\n  ')); process.exit(1); }
console.log('no console errors');
process.exit(0);
