// Drive tools/core_test.html in headless Chrome over raw CDP.
//   ~/.claude/bin/cdp start --port 9501
//   node tools/core_cdp.mjs [query]   e.g. "auto&games=juno:bea,ada:sf2300&fresh"
const PORT = +(process.env.CDP_PORT || 9501);
const BASE = process.env.GAMBIT_URL || 'http://192.168.0.236:8888/gms/3d/gambit/';
const query = process.argv[2] || 'auto&games=juno:bea';
const timeoutMs = +(process.argv[3] || 600000);

const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
let tab = tabs.find((t) => t.type === 'page');
if (!tab) tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const waiting = new Map();
const consoleErrors = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled') {
    const text = m.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
    if (m.params.type === 'error' || m.params.type === 'warning') consoleErrors.push(`[${m.params.type}] ${text}`);
    else if (process.env.VERBOSE) console.log('[console]', text);
  }
  if (m.method === 'Runtime.exceptionThrown') consoleErrors.push('[exception] ' + JSON.stringify(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') consoleErrors.push('[log] ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; waiting.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Page.navigate', { url: `${BASE}tools/core_test.html?${query}` });
const t0 = Date.now();
let state;
for (;;) {
  await new Promise((r) => setTimeout(r, 1000));
  const r = await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__core || null)', returnByValue: true });
  state = JSON.parse(r.result?.result?.value || 'null');
  if (state && state.done) break;
  if (Date.now() - t0 > timeoutMs) { console.log('TIMEOUT'); break; }
}
if (state && state.games) for (const g of state.games) delete g.pgn;
console.log(JSON.stringify(state, null, 1));
console.log('console errors:', consoleErrors.length ? consoleErrors : 'none');
ws.close();
process.exit(0);
