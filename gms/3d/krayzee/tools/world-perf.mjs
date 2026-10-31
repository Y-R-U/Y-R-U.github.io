// WORLD lane: per-airport look + perf pass. Phone UA, headless Metal Chrome, real renderer.
//   ~/.claude/bin/cdp start --port 9705 -- --use-angle=metal
//   node tools/world-perf.mjs [--port=9705] [--label=before] [--airports=royal,farm,airbase,palace] [--throttle=4]
//        [--tiers=low,medium] [--secs=4] [--noshots] [--noperf]
// For each airport: boots ?start=free&auto=1&airport=<id>, locks a tier, flies to fixed moments (runway takeoff in chase,
// climb-out in cockpit, circuit height in chase portrait + landscape, plus a scenic town view at C-Tower 1), measures
// fps / frame ms / draw calls / triangles over a window at the CPU throttle, and screenshots each moment (1× CPU) to
// docs/shots/world/<label>_<airport>_<moment>.jpg. Output: docs/shots/world/perf-<label>.json + a markdown table.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'docs', 'shots', 'world');
mkdirSync(OUT, { recursive: true });
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] ?? d;
const PORT = +arg('port', 9705);
const BASE = arg('url', 'http://127.0.0.1:8888/gms/3d/krayzee/');
const LABEL = arg('label', 'run');
const AIRPORTS = arg('airports', 'royal,farm,airbase').split(',');
const THROTTLE = +arg('throttle', 4);
const TIERS = arg('tiers', 'low,medium').split(',');
const SECS = +arg('secs', 4);
const SHOTS = !process.argv.includes('--noshots');
const PERF = !process.argv.includes('--noperf');
const UA = 'Mozilla/5.0 (Linux; Android 14; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

let ws, seq = 0;
const pending = new Map(), errors = [];
async function connect() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  let page = list.find((t) => t.type === 'page' && !t.url.startsWith('chrome://'));
  if (!page) page = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const { r, j } = pending.get(d.id); pending.delete(d.id); d.error ? j(new Error(d.error.message)) : r(d.result); }
    else if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push(d.params.args.map((a) => a.value ?? a.description).join(' '));
  };
}
const send = (method, params = {}) => new Promise((r, j) => { const id = ++seq; pending.set(id, { r, j }); ws.send(JSON.stringify({ id, method, params })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function device(w, h) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 3, mobile: true, screenOrientation: { type: w > h ? 'landscapePrimary' : 'portraitPrimary', angle: w > h ? 90 : 0 } });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Emulation.setUserAgentOverride', { userAgent: UA });
}
async function load(q) {
  errors.length = 0;
  await send('Page.navigate', { url: BASE + q });
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    await sleep(300);
    try { if (await ev('!!(window.__krayzeeReady && window.__game && window.__game.state().mode === "play" && window.__game.S.player)')) return Date.now() - t0; } catch (e) { /* navigating */ }
  }
  throw new Error('boot timed out ' + q + ' ' + errors.slice(0, 3).join(' | '));
}
// tier lock: the governor's own setQuality calls are swallowed
const LOCK = `(() => { const R = __game.renderer; if (R.__lock) return; const set = R.setQuality; R.__lock = { set }; R.setQuality = () => {}; })()`;
const setTier = (t) => ev(`(__game.renderer.__lock.set.call(__game.renderer, ${JSON.stringify(t)}), __game.renderer.quality)`);

// Moments in the loaded airport's frame, from its active runway end.
const MOMENTS = `(async () => {
  const L = await import('${BASE}js/world/layout.js'), def = L.AIRPORT, end = __game.state().activeEnd || L.defaultEnd();
  const rw = def.runways.find((r) => r.ends.includes(end)), h = L.runwayHeadingFor(rw, end), [tx, tz] = L.threshold(rw, end);
  const u = [Math.sin(h * Math.PI / 180), -Math.cos(h * Math.PI / 180)], side = (def.circuits?.[end] || 'L') === 'R' ? 1 : -1, r = [-u[1] * side, u[0] * side];
  const W = (s, l) => [tx + u[0] * s + r[0] * l, tz + u[1] * s + r[1] * l];
  const pa = def.patternAlt || 300, L2 = rw.length;
  const m = {
    takeoff: { pos: W(Math.min(40, L2 * 0.15), 0), alt: 0, heading: h, speedKt: 0, view: 'chase' },
    climb: { pos: W(L2 + 500, 0), alt: 150, heading: h, speedKt: 75, view: 'cockpit' },
    circuit: { pos: W(L2 * 0.5 - 600, 900), alt: pa, heading: (h + 180 + side * 35 + 360) % 360, speedKt: 90, view: 'chase' },
  };
  if (def.id === 'royal') m.town = { pos: [450, -700], alt: 260, heading: 345, speedKt: 90, view: 'chase' };
  if (def.id === 'royal' || def.id === 'palace') m.castle = { pos: [180, -1500], alt: 170, heading: 35, speedKt: 85, view: 'chase' };
  return m;
})()`;
const go = (m) => ev(`(() => { const m = ${JSON.stringify(m)}; __game.setView(m.view); const g = __game; g.teleport({ x: m.pos[0], z: m.pos[1], alt: m.alt || undefined, heading: m.heading, speedKt: m.speedKt, throttle: m.alt ? 0.75 : 0 }); g.S.player.ap.landing = null; return true; })()`);
// hold the moment: re-place every 0.5 s so the measured scene stays put while the AP flies
const hold = (m) => ev(`(() => { clearInterval(window.__hold); const m = ${JSON.stringify(m)}; window.__hold = setInterval(() => __game.teleport({ x: m.pos[0], z: m.pos[1], alt: m.alt || undefined, heading: m.heading, speedKt: m.speedKt, throttle: m.alt ? 0.75 : 0 }), 500); })()`);
const unhold = () => ev('clearInterval(window.__hold)');

async function sample(secs) {
  return ev(`new Promise((done) => {
    const r = __game.renderer.renderer, info = r.info, f = [], calls = [], tris = [], cpu = [];
    let last = performance.now(); const t0 = last;
    (function tick() { requestAnimationFrame((t) => { const n = performance.now(); f.push(n - last); last = n; cpu.push(window.__cpu.ms); window.__cpu.ms = 0; calls.push(info.render.calls); tris.push(info.render.triangles);
      if (n - t0 < ${secs * 1000}) tick(); else {
        const s = [...f].sort((a, b) => a - b), med = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
        done({ cpu: Math.round(med(cpu) * 10) / 10, fps: Math.round(1000 * f.length / (n - t0) * 10) / 10, p50: Math.round(med(f) * 10) / 10, p95: Math.round(s[Math.floor(s.length * 0.95)] * 10) / 10, calls: med(calls), tris: med(tris), tier: __game.renderer.quality });
      } }); })();
  })`);
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 78 });
  writeFileSync(join(OUT, `${LABEL}_${name}.jpg`), Buffer.from(r.data, 'base64'));
}

await connect();
await send('Runtime.enable');
await send('Page.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
// main-thread ms per frame: every rAF callback timed (the game loop is one of them)
await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const raf = window.requestAnimationFrame.bind(window), P = window.__cpu = { ms: 0 };
  window.requestAnimationFrame = (cb) => raf((t) => { const s = performance.now(); try { cb(t); } finally { P.ms += performance.now() - s; } }); })()` });
const rows = [];
for (const ap of AIRPORTS) {
  for (const [orient, w, h] of [['portrait', 390, 844], ['landscape', 844, 390]].slice(0, SHOTS ? 2 : 1)) {
    await device(w, h);
    await send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const bootMs = await load(`?start=free&auto=1&noaccount=1&plane=${ap === 'palace' ? 'tiger' : 'c172'}&airport=${ap}`);
    const at = await ev('import("' + BASE + 'js/world/layout.js").then((L) => L.AIRPORT.id)');
    if (at !== ap) { console.log(`! ${ap}: booted at ${at}`); }
    for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: 195, y: 300, button: 'left', clickCount: 1 });
    await ev(LOCK);
    await sleep(1500);
    const moments = await ev(MOMENTS);
    const names = orient === 'portrait' ? Object.keys(moments) : ['takeoff', 'circuit'];
    for (const name of names) {
      const m = moments[name];
      if (SHOTS) {
        await send('Emulation.setCPUThrottlingRate', { rate: 1 });
        await setTier('high');
        await go(m); await hold(m); await sleep(2200);
        await shot(`${at}_${name}_${orient}`);
      }
      if (PERF && orient === 'portrait') {
        await go(m); await hold(m);
        for (const t of TIERS) {
          await send('Emulation.setCPUThrottlingRate', { rate: 1 });
          await setTier(t); await sleep(800);
          await send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
          await sleep(1200);
          const s = await sample(SECS);
          rows.push({ airport: at, moment: name, tier: t, ...s });
          console.log(`${at.padEnd(8)} ${name.padEnd(8)} ${t.padEnd(6)} fps ${String(s.fps).padStart(5)}  cpu ${s.cpu}  p50 ${s.p50}  p95 ${s.p95}  calls ${s.calls}  tris ${(s.tris / 1000).toFixed(0)}k`);
        }
        await send('Emulation.setCPUThrottlingRate', { rate: 1 });
      }
      await unhold();
    }
    if (errors.length) console.log(`  errors (${ap}):`, errors.slice(0, 4));
    rows.push({ airport: at, boot: bootMs, orient, errors: errors.slice(0, 4) });
  }
}
await send('Emulation.setCPUThrottlingRate', { rate: 1 });
writeFileSync(join(OUT, `perf-${LABEL}.json`), JSON.stringify({ when: new Date().toISOString(), throttle: THROTTLE, rows }, null, 1));
console.log(`\n| airport | moment | tier | fps @${THROTTLE}× | cpu ms/frame | p95 ms | calls | tris |\n|---|---|---|---|---|---|---|---|`);
for (const r of rows.filter((x) => x.fps)) console.log(`| ${r.airport} | ${r.moment} | ${r.tier} | ${r.fps} | ${r.cpu} | ${r.p95} | ${r.calls} | ${Math.round(r.tris / 1000)}k |`);
ws.close();
