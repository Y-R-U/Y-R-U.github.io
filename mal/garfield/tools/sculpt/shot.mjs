// node tools/sculpt/shot.mjs <outdir> "<query>" ["<query>" ...]
// Screenshots tools/garfield.html via headless Chrome on CDP port 9402 (start it with:
//   ~/.claude/bin/cdp start --port 9402 -- --use-angle=metal)
import { writeFileSync, mkdirSync } from 'node:fs';
const PORT = +(process.env.CDP_PORT || 9402);
const BASE = process.env.BASE || 'http://localhost:8888/mal/garfield/tools/garfield.html';
const [outdir, ...queries] = process.argv.slice(2);
mkdirSync(outdir, { recursive: true });
const W = +(process.env.W || 900), H = +(process.env.H || 700);

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
let page = list.find((t) => t.type === 'page');
if (!page) page = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pend = new Map();
const logs = [];
ws.addEventListener('message', (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
  if (d.method === 'Runtime.exceptionThrown') logs.push('EXC ' + JSON.stringify(d.params.exceptionDetails).slice(0, 600));
  if (d.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(d.params.type)) logs.push(d.params.type + ' ' + d.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 400));
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable'); await send('Page.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
let n = 0;
for (const q of queries) {
  const name = (q.match(/name=([^&]+)/) || [])[1] || String(n++);
  await send('Page.navigate', { url: BASE + (process.env.BASE ? '?' : '?hideui&') + q });
  let ok = false;
  for (let i = 0; i < 100; i++) {
    await new Promise((r) => setTimeout(r, 150));
    const r = await send('Runtime.evaluate', { expression: process.env.READY || 'window.__ready === true', returnByValue: true });
    if (r.result?.result?.value) { ok = true; break; }
  }
  await new Promise((r) => setTimeout(r, 250));
  const s = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${outdir}/${name}.png`, Buffer.from(s.result.data, 'base64'));
  console.log(name, ok ? 'ok' : 'TIMEOUT');
}
if (logs.length) console.log(logs.join('\n'));
ws.close();
