// Headless screenshots + fps for the engine lane.
//   ~/.claude/bin/cdp start --port 9312 -- --use-angle=metal
//   node tools/engine_shot.mjs out.png "?shot=1&noshell=1&t=0.3&cam=..." [w h waitMs] [js-to-eval-before-shot]
const [,, out = 'shot.png', query = '?shot=1', W = '1280', H = '720', WAIT = '2500', EVAL = ''] = process.argv;
const PORT = process.env.CDP_PORT || 9312;
const BASE = process.env.BASE || 'http://localhost:8861/gms/3d/synthwild/';
import { writeFileSync } from 'node:fs';

const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map();
const logs = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.consoleAPICalled') logs.push(`[${m.params.type}] ` + m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  if (m.method === 'Runtime.exceptionThrown') logs.push('[exception] ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
});
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;

await send('Runtime.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: +W, height: +H, deviceScaleFactor: 1, mobile: false });
if (process.env.THROTTLE) await send('Emulation.setCPUThrottlingRate', { rate: +process.env.THROTTLE });
await send('Page.enable');
await send('Page.navigate', { url: BASE + query });
const t0 = Date.now();
while (Date.now() - t0 < 30000) {
  await new Promise((r) => setTimeout(r, 250));
  if (await evalJs('!!window.__shotReady')) break;
}
const evOut = EVAL ? await evalJs(EVAL) : undefined;
await new Promise((r) => setTimeout(r, +WAIT));
const stats = await evalJs(`(() => { const g = window.__game; if (!g) return { err: 'no __game', boot: window.__bootErrors };
  const r = g.ctx.render.stats; return { fps: +g.stats.fps.toFixed(1), ms: +g.stats.ms.toFixed(2), cpu: +g.stats.cpu.toFixed(2), calls: g.stats.calls, tris: g.stats.tris,
  secs: r.sections, quads: r.quads, pending: r.pending, boot: window.__bootErrors || [] }; })()`);
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
console.log(JSON.stringify(stats)); if (evOut !== undefined) console.log("eval:", JSON.stringify(evOut));
for (const l of logs.slice(0, 30)) console.log(l);
await send('Target.closeTarget', { targetId: tab.id }).catch(() => {});
ws.close();
process.exit(0);
