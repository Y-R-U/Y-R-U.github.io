// Camera framing table: ring size on screen and visible ground extent per crowd count and layout.
// node tools/render_camtest.mjs --port 9272 --base http://127.0.0.1:8752/gms/3d/throng
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1]]] : a), []));
const port = +(args.port || 9272);
const base = args.base || 'http://127.0.0.1:8752/gms/3d/throng';
const counts = (args.counts || '10,100,350,1000').split(',').map(Number);
const layouts = [['portrait', 390, 844, 2], ['landscape', 844, 390, 2], ['desktop', 1440, 900, 1]];

const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const target = list.find((t) => t.type === 'page');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } });
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });

const MEASURE = `(() => {
  const h = window.__harness, r = h.renderer, c = h.sim.state.crowds[0];
  const W = innerWidth, H = innerHeight, o = {};
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (let k = 0; k < 64; k++) { const a = k / 64 * Math.PI * 2; r.project(c.x + Math.cos(a) * c.radius, 0, c.z + Math.sin(a) * c.radius, o); x0 = Math.min(x0, o.x); x1 = Math.max(x1, o.x); y0 = Math.min(y0, o.y); y1 = Math.max(y1, o.y); }
  const g = (sx, sy) => { const p = r.groundPoint(sx, sy, {}); return p ? [p.x, p.z] : null; };
  const d = (a, b) => (a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : NaN);
  const cy = (y0 + y1) / 2, cx = (x0 + x1) / 2;
  const cam = r.three.camera.position;
  return { R: +c.radius.toFixed(1), ringW: +((x1 - x0) / W).toFixed(2), ringH: +((y1 - y0) / H).toFixed(2),
    groundW: +d(g(0, cy), g(W, cy)).toFixed(0), groundTop: +d(g(cx, 0), [c.x, c.z]).toFixed(0), groundBot: +d(g(cx, H), [c.x, c.z]).toFixed(0),
    camH: +cam.y.toFixed(0), pitch: +(Math.atan2(cam.y - 0.8, Math.hypot(cam.x - c.x, cam.z - c.z)) * 57.3).toFixed(0) };
})()`;

const rows = [];
for (const [name, w, h, dsf] of layouts) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dsf, mobile: w < 1000 });
  for (const n of counts) {
    await send('Page.navigate', { url: `${base}/tools/render_harness.html?scene=late&player=${n}&rivals=&pause=1&hud=0&q=lite&adaptive=0` });
    const t0 = Date.now();
    while (Date.now() - t0 < 20000) { if (await evalJs('!!(window.__harness && window.__harness.ready && window.__harness.frames > 5)')) break; await new Promise((r) => setTimeout(r, 200)); }
    await new Promise((r) => setTimeout(r, 6000));
    rows.push({ layout: name, count: n, ...(await evalJs(MEASURE)) });
  }
}
console.log('layout     count  R(m)  ring%W ring%H  groundW(m)  ahead/top(m) behind/bottom(m)  camH  pitch');
for (const r of rows) console.log(`${r.layout.padEnd(10)} ${String(r.count).padStart(5)} ${String(r.R).padStart(5)}  ${String(Math.round(r.ringW * 100)).padStart(5)}  ${String(Math.round(r.ringH * 100)).padStart(5)}  ${String(r.groundW).padStart(9)}  ${String(r.groundTop).padStart(11)}  ${String(r.groundBot).padStart(14)}  ${String(r.camH).padStart(5)}  ${String(r.pitch).padStart(4)}`);
ws.close();
process.exit(0);
