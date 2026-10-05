// Minimal raw-CDP driver for lane A tests. import { open } from './a_cdp.mjs'
export async function open({ port: portArg = 9401, url, width = 384, height = 854, dpr = 2, mobile = true } = {}) {
  const port = +process.env.CDP_PORT || portArg;   // CDP_PORT lets the integration lane drive any lane's e2e
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  let page = list.find(t => t.type === 'page');
  if (!page) page = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pending = new Map();
  const logs = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const { r, j } = pending.get(m.id); pending.delete(m.id); m.error ? j(new Error(m.error.message)) : r(m.result); }
    else if (m.method === 'Runtime.consoleAPICalled') logs.push(`[${m.params.type}] ` + m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
    else if (m.method === 'Runtime.exceptionThrown') logs.push('[exception] ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  };
  const send = (method, params = {}) => new Promise((r, j) => { const i = ++id; pending.set(i, { r, j }); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const api = {
    send, logs, sleep,
    async viewport(w, h, d = dpr, mob = mobile) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: d, mobile: mob });
      await send('Emulation.setTouchEmulationEnabled', { enabled: mob });
    },
    async goto(u) { await send('Page.navigate', { url: u }); await sleep(300); },
    async eval(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    async waitFor(expr, ms = 15000) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) { try { if (await api.eval(expr)) return true; } catch (e) {} await sleep(150); }
      throw new Error('timeout waiting for ' + expr);
    },
    async click(sel, { index = 0 } = {}) {
      const box = await api.eval(`(() => { const els = [...document.querySelectorAll(${JSON.stringify(sel)})].filter(e => e.offsetParent || e.getClientRects().length); const e = els[${index}]; if (!e) return null; e.scrollIntoView({block:'center'}); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      if (!box) throw new Error('no element ' + sel);
      await sleep(60);
      for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
      await sleep(120);
    },
    async key(key) {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key, text: key.length === 1 ? key : undefined, windowsVirtualKeyCode: key === 'Enter' ? 13 : key.charCodeAt(0) });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key });
      await sleep(80);
    },
    async shot(path) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      const { writeFileSync } = await import('node:fs');
      writeFileSync(path, Buffer.from(r.data, 'base64'));
      return path;
    },
    close() { ws.close(); },
  };
  await api.viewport(width, height, dpr, mobile);
  if (url) await api.goto(url);
  return api;
}
