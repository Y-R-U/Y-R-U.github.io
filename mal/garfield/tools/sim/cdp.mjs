// Minimal raw-CDP driver (node 24: fetch + WebSocket built in). Start Chrome with ~/.claude/bin/cdp start --port 9408 -- --use-angle=metal
import { writeFileSync } from 'node:fs';

export async function connect(port = 9408, { width = 1280, height = 720 } = {}) {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  let page = list.find((t) => t.type === 'page');
  if (!page) page = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pend = new Map(); const logs = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pend.has(d.id)) { const { res, rej } = pend.get(d.id); pend.delete(d.id); d.error ? rej(new Error(JSON.stringify(d.error))) : res(d.result); }
    else if (d.method === 'Runtime.consoleAPICalled') logs.push(`[${d.params.type}] ` + d.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    else if (d.method === 'Runtime.exceptionThrown') logs.push('[exception] ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
  };
  ws.onclose = () => { for (const { rej } of pend.values()) rej(new Error('CDP socket closed (browser died?)')); pend.clear(); api.dead = true; };
  const send = (method, params = {}) => new Promise((res, rej) => { if (api?.dead) return rej(new Error('CDP socket closed')); const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  var api = {
    send, logs,
    async nav(url) { await send('Page.navigate', { url }); },
    async eval(expr, awaitPromise = true) {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    async waitFor(expr, timeout = 30000, every = 200) {
      const t0 = Date.now();
      for (;;) {
        let v; try { v = await api.eval(expr); } catch { v = null; }
        if (v) return v;
        if (Date.now() - t0 > timeout) throw new Error('timeout waiting for ' + expr);
        await sleep(every);
      }
    },
    async shot(path) { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(path, Buffer.from(r.data, 'base64')); return path; },
    async key(code, { hold = 60 } = {}) {
      const key = code === 'Space' ? ' ' : code.replace(/^Key/, '').toLowerCase();
      const vk = { Space: 32, KeyJ: 74, KeyE: 69, KeyW: 87, KeyA: 65, KeyS: 83, KeyD: 68, Escape: 27 }[code] || 0;
      await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key, windowsVirtualKeyCode: vk });
      await sleep(hold);
      await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key, windowsVirtualKeyCode: vk });
    },
    async keyDown(code) { const key = code.replace(/^Key/, '').toLowerCase(); await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key }); },
    async keyUp(code) { const key = code.replace(/^Key/, '').toLowerCase(); await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key }); },
    close() { ws.close(); },
  };
  return api;
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
