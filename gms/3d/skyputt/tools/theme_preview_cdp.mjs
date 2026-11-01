// Screenshot the theme preview in headless Chrome over raw CDP and print renderer.info stats.
// Start Chrome first:  ~/.claude/bin/cdp start --port 9531
// Usage: node tools/theme_preview_cdp.mjs <outDir> '[{"name":"hole","q":"view=hole","w":412,"h":915,"wait":6000}]'
//   each spec: { name, q (query string), w, h, dpr?, wait?, eval? }
import { writeFileSync, mkdirSync } from 'fs';

const PORT = +(process.env.CDP_PORT || 9531);
const BASE = process.env.BASE || 'http://192.168.0.236:8888/gms/3d/skyputt/tools/theme_preview.html';
const [, , outDir = '.', specArg = '[{"name":"hole","q":"view=hole&hud=0","w":412,"h":915}]'] = process.argv;
const spec = JSON.parse(specArg);
mkdirSync(outDir, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
let page = list.find(t => t.type === 'page');
if (!page) page = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0; const pend = new Map(); const errors = [];
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning'))
    errors.push(`[${m.params.type}] ` + m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
  if (m.method === 'Runtime.exceptionThrown') errors.push('[exception] ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push('[log] ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
});
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) return 'EXC: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result?.result?.value;
};
await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');
await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });

for (const s of spec) {
  await send('Emulation.setDeviceMetricsOverride', { width: s.w || 412, height: s.h || 915, deviceScaleFactor: s.dpr || 1, mobile: true });
  await send('Page.navigate', { url: `${BASE}?${s.q || ''}` });
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) { if (await ev('!!window.__ready')) break; await sleep(250); }
  console.log(s.name, 'load ms', Date.now() - t0);
  await sleep(s.wait ?? 3000);
  if (s.eval) { const v = await ev(s.eval); console.log(s.name, 'eval =>', JSON.stringify(v)); await sleep(1500); }
  console.log(s.name, 'stats', JSON.stringify(await ev('window.__stats')));
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${outDir}/${s.name}.png`, Buffer.from(r.result.data, 'base64'));
  console.log('shot', `${outDir}/${s.name}.png`);
}
console.log(errors.length ? 'CONSOLE:\n' + errors.join('\n') : 'console clean');
ws.close();
process.exit(0);
