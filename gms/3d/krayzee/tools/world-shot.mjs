// WORLD lane: still frames of the world test bed (tools/airport.html) from any camera, for look reviews.
//   node tools/world-shot.mjs --port=9705 --out=docs/shots/world/x.jpg --pos=x,y,z --look=x,y,z [--fov=55] [--q=high] [--w=1280 --h=720] [--airport=royal]
import { writeFileSync } from 'node:fs';
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] ?? d;
const PORT = +arg('port', 9705), W = +arg('w', 1280), H = +arg('h', 720);
const url = `http://127.0.0.1:8888/gms/3d/krayzee/tools/airport.html?shot&q=${arg('q', 'high')}&pos=${arg('pos')}&look=${arg('look')}&fov=${arg('fov', 55)}${arg('airport') ? '&airport=' + arg('airport') : ''}`;
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && !t.url.startsWith('chrome://')) || await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let seq = 0; const pend = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method === 'Runtime.exceptionThrown') console.log('ERR', d.params.exceptionDetails.exception?.description); };
const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
await send('Runtime.enable'); await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
for (let i = 0; i < 120; i++) { await new Promise((r) => setTimeout(r, 500)); const r = await send('Runtime.evaluate', { expression: '!!window.__ready', returnByValue: true }); if (r.result?.result?.value) break; }
await new Promise((r) => setTimeout(r, 2500));
const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
writeFileSync(arg('out', 'shot.jpg'), Buffer.from(r.result.data, 'base64'));
ws.close();
