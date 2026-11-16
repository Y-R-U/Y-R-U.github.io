// node tools/quality_test.mjs --port 9281 --base http://127.0.0.1:8761/gms/3d/throng/ [--rate 60] [--break up|down]
// Adaptive quality, both directions, on an emulated phone (384x692, dpr 2.81, touch => Auto = medium):
//   1. CPU throttled: it must step down to lite.  2. Un-throttled: it must climb back to medium @2x.
//   3. Throttled again right after a climb: the climb counts as failed and the next climb to that level waits longer.
//   4. Held un-throttled: no level changes (no oscillation).
// --break up: step-up disabled (stage 2 must fail). --break down: adaptive off (stage 1 must fail).
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1']] : a), []));
const port = +(args.port || 9281);
const base = args.base || 'http://127.0.0.1:8761/gms/3d/throng/';
const RATE = +(args.rate || 60);
const BREAK = args.break || '';

const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
let target = list.find((t) => t.type === 'page');
if (!target) target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } });
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 384, height: 692, deviceScaleFactor: 2.81, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Emulation.setCPUThrottlingRate', { rate: 1 });
await send('Page.navigate', { url: `${base}?seed=7&nocloud=1` });
for (let k = 0; k < 150 && !(await ev('!!(window.__game && window.__game.ready)')); k++) await sleep(200);
await ev(`(() => { const G = __game; G.app.save.settings.quality = 'auto'; G.app.applySettings(); G.start({ kind: 'practice' }); G.setAuto(true); })()`);
if (BREAK === 'up') await ev('__game.renderer._dbg.adapt.noUp = true');
if (BREAK === 'down') await ev('__game.renderer.setAdaptive(false)');

const st = () => ev(`(() => { const s = __game.renderer.stats(); return { fps: s.fps, q: s.quality, dpr: s.dpr, ...s.adapt, t: +(__game.state.duration - __game.state.timeLeft).toFixed(0), phase: __game.state.phase }; })()`);
const log = [];
const fails = [];
// Keep a match running for the whole test (a practice match ends after 2 minutes).
const keepAlive = async () => { const p = await ev('__game.state && __game.state.phase'); if (p === 'over' || p == null) await ev(`(() => { const G = __game; G.start({ kind: 'practice' }); G.setAuto(true); })()`); };
async function until(label, pred, secs) {
  const t0 = Date.now();
  let s;
  while (Date.now() - t0 < secs * 1000) {
    await keepAlive();
    s = await st();
    log.push(`${((Date.now() - T0) / 1000).toFixed(0).padStart(4)}s ${label.padEnd(10)} fps ${String(s.fps).padStart(5)} ${s.q}@${s.dpr.toFixed(2)} lvl ${s.level}/${s.max} ups ${s.ups} downs ${s.downs} fails ${s.fails.join(',')}`);
    if (pred(s)) return { ok: true, s, secs: (Date.now() - t0) / 1000 };
    await sleep(1000);
  }
  return { ok: false, s, secs };
}
const T0 = Date.now();
const s0 = await st();
if (s0.max !== 2 || s0.level !== 1) fails.push(`start: expected medium (level 1, max 2) on touch, got level ${s0.level} max ${s0.max}`);

await send('Emulation.setCPUThrottlingRate', { rate: RATE });
const a = await until('throttled', (s) => s.level === 0, 40);
if (!a.ok) fails.push(`stage 1: did not step down to lite under ${RATE}x CPU throttle (at level ${a.s.level}, ${a.s.fps} fps)`);

await send('Emulation.setCPUThrottlingRate', { rate: 1 });
const b = await until('free', (s) => s.level === 2 && s.probe !== true, 60);
if (!b.ok) fails.push(`stage 2: did not climb back to medium @2x (at level ${b.s.level}, ${b.s.fps} fps)`);
else if (Math.abs(b.s.dpr - 2) > 0.01) fails.push(`stage 2: top level renders at dpr ${b.s.dpr}, want 2`);

let c = { ok: true };
if (b.ok) {
  // Let the probation run out first, then knock it down and measure one failed climb.
  await sleep(8000);
  const f0 = (await st()).fails.slice();
  await send('Emulation.setCPUThrottlingRate', { rate: RATE });
  const d1 = await until('rethrottle', (s) => s.level <= 1, 30);
  await send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const up1 = await until('reclimb', (s) => s.level === 2, 40);
  // throttle inside the probation window: must count as a failed climb
  await send('Emulation.setCPUThrottlingRate', { rate: RATE });
  const back = await until('probation', (s) => s.level <= 1, 20);
  const f1 = (await st()).fails.slice();
  await send('Emulation.setCPUThrottlingRate', { rate: 1 });
  if (!d1.ok || !up1.ok || !back.ok) fails.push(`stage 3: step sequence incomplete (down ${d1.ok}, up ${up1.ok}, back ${back.ok})`);
  else if (!(f1[2] > f0[2])) fails.push(`stage 3: a climb that failed in probation was not recorded (fails ${f0} -> ${f1})`);
  c = await until('reclimb2', (s) => s.level === 2, 70);
  if (!c.ok) fails.push('stage 3: never climbed back after a failed climb');
  else if (up1.ok && c.secs < up1.secs + 5) fails.push(`stage 3: climb after a failure took ${c.secs.toFixed(0)} s, no longer than the first (${up1.secs.toFixed(0)} s): no back-off`);
  else log.push(`back-off: first climb ${up1.secs.toFixed(0)} s, after a failed climb ${c.secs.toFixed(0)} s`);

  const h0 = await st();
  await until('hold', () => false, 20);
  const h1 = await st();
  if (h1.ups !== h0.ups || h1.downs !== h0.downs) fails.push(`stage 4: level changed ${h1.ups - h0.ups} up / ${h1.downs - h0.downs} down in 20 s held at 60 fps`);
}
const errs = await ev('__game.errors.slice(0, 5)');
if (errs.length) fails.push('page errors: ' + errs.join(' | '));
console.log(log.join('\n'));
console.log(fails.length ? 'FAIL\n  ' + fails.join('\n  ') : 'PASS');
await send('Emulation.setCPUThrottlingRate', { rate: 1 });
ws.close();
process.exit(fails.length ? 1 : 0);
