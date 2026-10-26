// JETSOUND: offline renders of the jet voices in headless Chrome (js/audio/jettest.js via tools/sounds.html?test=1),
// plus a plain load of tools/sounds.html that must raise no errors.
//   ~/.claude/bin/cdp start --port 9667 -- --use-angle=metal ; python3 -m http.server 8886 (repo root)
//   node tools/test-jetsound.mjs [--port=9667] [--url=http://127.0.0.1:8886/gms/3d/krayzee/] [--falsify=loud|flat|nodoppler] [--json]
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const PORT = +arg('port', 9667), BASE = arg('url', 'http://localhost:8886/gms/3d/krayzee/'), FALSIFY = arg('falsify', '');

let ws, seq = 0;
const pending = new Map(), errors = [];
async function connect() {
  const page = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const { r, j } = pending.get(d.id); pending.delete(d.id); d.error ? j(new Error(d.error.message)) : r(d.result); }
    if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push(d.params.args.map((a) => a.value ?? a.description).join(' '));
    if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') errors.push(`${d.params.entry.text} ${d.params.entry.url || ''}`);
  };
  return page.id;
}
const send = (method, params = {}) => new Promise((r, j) => { const id = ++seq; pending.set(id, { r, j }); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result.value; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const id = await connect();
await send('Runtime.enable'); await send('Log.enable'); await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });

// 1) plain load: no errors
await send('Page.navigate', { url: BASE + 'tools/sounds.html' });
await wait(2500);
const tiles = await ev('document.querySelectorAll(".s").length');
const loadErrors = errors.splice(0).filter((e) => !/favicon\.ico/.test(e));   // the bare http.server has no favicon
console.log(`sounds.html: ${tiles} tiles, ${loadErrors.length} errors${loadErrors.length ? '\n  ' + loadErrors.join('\n  ') : ''}`);

// 2) offline jet checks
await send('Page.navigate', { url: `${BASE}tools/sounds.html?test=1${FALSIFY ? '&falsify=' + FALSIFY : ''}` });
let R = null;
for (let i = 0; i < 240 && !R; i++) { await wait(500); R = await ev('window.__jetTest || null'); }
await fetch(`http://127.0.0.1:${PORT}/json/close/${id}`).catch(() => {});
ws.close();
if (!R || R.error) { console.log('TEST ERROR', R?.error || 'timeout'); process.exit(2); }
if (process.argv.includes('--json')) console.log(JSON.stringify(R, null, 1));
else {
  console.log('scenario'.padEnd(16), 'peakDb rmsDb  LUFS  crest centroid band250-2.5k skew');
  for (const [k, m] of Object.entries(R.scen)) {
    if (m.peak === undefined) { console.log(k.padEnd(16), JSON.stringify(m)); continue; }
    console.log(k.padEnd(16), String(m.peakDb).padStart(6), String(m.rmsDb).padStart(6), String(m.lufs).padStart(6), String(m.crestDb).padStart(5), String(m.centroid).padStart(8), String(m.band).padStart(6), String(m.skew).padStart(6), m.beat != null ? `beat ${m.beat}` : '');
  }
  console.log('nodes', JSON.stringify(R.nodes));
  console.log('perf ', JSON.stringify(R.perf));
}
for (const c of R.checks) console.log(c.ok ? 'PASS' : 'FAIL', c.name, '—', c.detail);
console.log(`${R.pass}/${R.total}${FALSIFY ? ' (falsify=' + FALSIFY + ')' : ''}; sounds.html load errors: ${loadErrors.length}`);
process.exit(R.pass === R.total && !loadErrors.length ? 0 : 1);
