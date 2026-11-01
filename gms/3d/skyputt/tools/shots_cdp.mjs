#!/usr/bin/env node
// Headless Chrome driver (raw CDP, no puppeteer). Start Chrome first:
//   ~/.claude/bin/cdp start --port 9512
//   node tools/shots_cdp.mjs shots [--out=DIR] [--theme=greybox]   title + every hole, portrait 412x915 and landscape 1440x900
//   node tools/shots_cdp.mjs play  [--out=DIR]                     plays hole 1-3 through the real UI (drag aim) to the scorecard
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
const state = c => c.eval('(() => { const r = __skyputt.round; return r ? { state: r.state, hole: r.index + 1, strokes: r.strokes, fps: __skyputt.fps, theme: __skyputt.themeId } : null })()');

async function shots(c) {
  for (const [tag, w, h, mob] of [['p', 412, 915, true], ['l', 1440, 900, false]]) {
    await size(c, w, h, mob);
    await go(c);
    await sleep(800);
    await shot(c, `${tag}-title`);
    for (let i = 1; i <= 3; i++) {
      await go(c, `hole=${i}`);
      await sleep(1500);
      await shot(c, `${tag}-hole${i}-tee`);
      // aim: drag straight down from the middle (shoot forward) and hold
      const cx = w / 2, cy = h * 0.45;
      await drag(c, cx, cy, cx - w * 0.02, cy + Math.min(w, h) * 0.3, { hold: true });
      await sleep(300);
      await shot(c, `${tag}-hole${i}-aim`);
      await release(c, cx - w * 0.02, cy + Math.min(w, h) * 0.3);
      await sleep(900);
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
  await go(c, 'hole=1');
  const tEnd = Date.now() + 8 * 60e3;
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

const c = await CDP.open();
await setup(c);
try {
  if (MODE === 'shots') await shots(c);
  else if (MODE === 'play') await play(c);
} catch (e) { errors.push('driver: ' + e.message); }
if (errors.length) { console.log('ERRORS:\n  ' + [...new Set(errors)].join('\n  ')); process.exit(1); }
console.log('no console errors');
process.exit(0);
