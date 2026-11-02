#!/usr/bin/env node
// Screenshots tools/ai_demo.html in headless Chrome (raw CDP). Start Chrome first:
//   ~/.claude/bin/cdp start --port 9513
//   node tools/ai_demo_cdp.mjs [--port=9513] [--out=DIR] [--hole=sky9] [--golfers=pro:0.9,bertha:0.6,banks:0.6] [--theme=sky] [--at=2,6,12]
// Waits for the plan, then grabs frames at the given playback seconds (speed 1). Exits 1 on page errors.
import { writeFileSync, mkdirSync } from 'node:fs';
const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.join('=') || true]; }));
const PORT = +(args.port || 9513);
const OUT = args.out || '/tmp/skyputt-ai';
const qs = new URLSearchParams({ hole: args.hole || 'sky9', theme: args.theme || 'sky', golfers: args.golfers || 'pro:0.9,bertha:0.6,banks:0.6', seed: args.seed || '3', speed: args.speed || '1' });
const URL_ = `${args.base || 'http://192.168.0.236:8888/gms/3d/skyputt/tools/ai_demo.html'}?${qs}&t=${Date.now()}`;
const AT = String(args.at || '2,5,9,14').split(',').map(Number);
mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
let page = list.find(t => t.type === 'page') || await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
  else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description).join(' '));
};
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result.value;
await send('Runtime.enable'); await send('Page.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: +(args.w || 412), height: +(args.h || 915), deviceScaleFactor: 2, mobile: true });
await send('Page.navigate', { url: URL_ });
const t0 = Date.now();
while (!(await ev('window.__demo && window.__demo.ready').catch(() => false))) { if (Date.now() - t0 > 120000) { console.log('timeout waiting for the plan'); break; } await sleep(250); }
const info = await ev('JSON.stringify(window.__demo)');
console.log('demo:', info);
const tStart = Date.now();
for (const [k, s] of AT.entries()) {
  await sleep(Math.max(0, tStart + s * 1000 - Date.now()));
  const r = await send('Page.captureScreenshot', { format: 'png' });
  const f = `${OUT}/ai_demo_${String(k).padStart(2, '0')}_${s}s.png`;
  writeFileSync(f, Buffer.from(r.data, 'base64')); console.log('shot', f);
}
if (errors.length) { console.log('PAGE ERRORS:\n' + errors.join('\n')); process.exit(1); }
process.exit(0);
