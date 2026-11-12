// node tools/render_shot.mjs --port 9231 --url <url> --out shot.png --w 390 --h 844 --dsf 2 --wait 4 [--eval "expr"]
// Needs a Chrome started with `~/.claude/bin/cdp start --port N -- --use-angle=metal`.
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1]]] : a), []));
const port = +(args.port || 9231);
const W = +(args.w || 390), Hh = +(args.h || 844), DSF = +(args.dsf || 2);
const wait = +(args.wait || 4);

const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
let target = list.find((t) => t.type === 'page');
if (!target) target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map();
const logs = [];
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  if (msg.method === 'Runtime.consoleAPICalled' && (msg.params.type === 'error' || msg.params.type === 'warning')) logs.push(msg.params.type + ': ' + msg.params.args.map((a) => a.value ?? a.description).join(' '));
  if (msg.method === 'Runtime.exceptionThrown') logs.push('exception: ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
  if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') logs.push('log: ' + msg.params.entry.text);
});
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;

await send('Page.navigate', { url: 'about:blank' });
await new Promise((r) => setTimeout(r, 300));
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Runtime.enable');
await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: Hh, deviceScaleFactor: DSF, mobile: DSF > 1 && W < 1000 });
await new Promise((r) => setTimeout(r, 400));
await send('Runtime.discardConsoleEntries');
await send('Page.enable');
logs.length = 0;
if (args.cpu) await send('Emulation.setCPUThrottlingRate', { rate: +args.cpu });
await send('Page.navigate', { url: args.url });
const t0 = Date.now();
while (Date.now() - t0 < 30000) {
  const ok = await evalJs('!!(window.__harness && window.__harness.ready && window.__harness.frames > 5) || !!(window.__game && window.__game.ready)');
  if (ok) break;
  await new Promise((r) => setTimeout(r, 200));
}
if (args.eval) await evalJs(args.eval);
await new Promise((r) => setTimeout(r, wait * 1000));
const stats = await evalJs(`(() => { const h = window.__harness || {}; const g = window.__game || {}; const r = h.renderer || g.renderer; return { stats: r && r.stats(), frames: h.frames, cpuMs: h.cpuMs && +h.cpuMs.toFixed(2), errors: (h.errors || []).concat(g.errors || []) }; })()`);
const burst = +(args.burst || 0);
for (let k = 0; k < burst; k++) {
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  (await import('node:fs')).writeFileSync(args.out.replace('.png', `_${k}.png`), Buffer.from(shot.result.data, 'base64'));
  await new Promise((r) => setTimeout(r, +(args.gap || 250)));
}
if (args.out) {
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const fs = await import('node:fs');
  fs.writeFileSync(args.out, Buffer.from(shot.result.data, 'base64'));
}
console.log(JSON.stringify({ ...stats, logs }, null, 0));
ws.close();
process.exit(0);
