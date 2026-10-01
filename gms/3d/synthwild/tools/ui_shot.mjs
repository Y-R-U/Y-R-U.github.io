// node tools/ui_shot.mjs <url> <out.png> [WxH] [waitMs] [js-to-eval-before-shot]
// Needs `~/.claude/bin/cdp start --port 9315 -- --use-angle=metal` running. Mobile-like touch emulation for widths < 1000.
const [url, out, size = '1280x720', wait = '2500', pre = ''] = process.argv.slice(2);
const PORT = process.env.CDP_PORT || 9315;
const [W, H] = size.split('x').map(Number);
const fs = await import('node:fs');
const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
let page = tabs.find((t) => t.type === 'page');
if (!page) page = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); const logs = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  if (d.method === 'Runtime.consoleAPICalled' && /error|warn/.test(d.params.type)) logs.push(d.params.type + ': ' + d.params.args.map((a) => a.value ?? a.description).join(' '));
  if (d.method === 'Runtime.exceptionThrown') logs.push('EXC: ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
const mobile = W < 1000;
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: +(process.env.DPR || (mobile ? 2 : 1)), mobile });
await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 0 });
await send('Page.navigate', { url });
await new Promise((r) => setTimeout(r, +wait));
if (pre) {
  const r = await send('Runtime.evaluate', { expression: pre, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) logs.push('PRE EXC: ' + r.result.exceptionDetails.exception?.description);
  else if (r.result?.result?.value !== undefined) console.log('pre ->', JSON.stringify(r.result.result.value).slice(0, 400));
  await new Promise((r) => setTimeout(r, +(process.env.POST_WAIT || 900)));
}
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
console.log('saved', out, logs.length ? '\n' + logs.join('\n') : '(no errors)');
ws.close();
