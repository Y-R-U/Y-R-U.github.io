// Board agent test harness: headless Chrome over raw CDP (start it with
//   ~/.claude/bin/cdp start --port 9502).
// Usage: node tools/board_cdp.mjs <outDir> <shot spec JSON>
//   spec: [{name, url, w, h, mobile?, wait?, eval?: "js run after load (awaited)", evalWait?}]
// Prints console errors + any eval results. Exit code 1 if console errors.
import { writeFileSync, mkdirSync } from 'fs';

const PORT = +(process.env.CDP_PORT || 9502);
const [, , outDir = '.', specArg = '[]'] = process.argv;
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
await send('Network.enable'); await send('Network.clearBrowserCache'); await send('Network.setCacheDisabled', { cacheDisabled: true });

for (const s of spec) {
  await send('Emulation.setDeviceMetricsOverride', { width: s.w, height: s.h, deviceScaleFactor: s.dpr || (s.mobile ? 2 : 1), mobile: !!s.mobile });
  await send('Emulation.setTouchEmulationEnabled', { enabled: !!s.mobile, maxTouchPoints: s.mobile ? 5 : 0 });
  if (s.url) { await send('Page.navigate', { url: s.url }); await sleep(s.wait ?? 4000); }
  if (s.eval) { const v = await ev(s.eval); if (v !== undefined) console.log(s.name, '=>', typeof v === 'string' ? v : JSON.stringify(v)); }
  if (s.evalWait) await sleep(s.evalWait);
  if (s.shot !== false) {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${outDir}/${s.name}.png`, Buffer.from(r.result.data, 'base64'));
    console.log('shot', `${outDir}/${s.name}.png`);
  }
}
console.log(errors.length ? 'CONSOLE:\n' + errors.join('\n') : 'console clean');
ws.close();
process.exit(errors.some(e => !e.startsWith('[warning]')) ? 1 : 0);
