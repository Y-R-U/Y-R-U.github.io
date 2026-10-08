// node cdp_eval.mjs <port> <url> <jsExpr that resolves to JSON-able> [waitMs]
const [port, url, expr, waitMs = '15000'] = process.argv.slice(2);
const tabs = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tabs.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Runtime.enable');
await send('Page.navigate', { url });
const t0 = Date.now();
let out = null;
while (Date.now() - t0 < +waitMs) {
  await new Promise((r) => setTimeout(r, 500));
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  out = r.result?.result?.value;
  if (out != null) break;
}
console.log(JSON.stringify(out));
ws.close(); process.exit(0);
