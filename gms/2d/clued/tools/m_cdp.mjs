// Tiny raw-CDP driver for lane M tests. Usage: import { open } from './m_cdp.mjs'; const p = await open(port);
export async function open(port = 9403) {
  const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  let page = list.find(t => t.type === 'page');
  if (!page) page = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(); const logs = [];
  const waiters = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
    else if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.type + ': ' + m.params.args.map(a => a.value ?? a.description).join(' '));
    else if (m.method === 'Runtime.exceptionThrown') logs.push('EXC: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    for (const w of waiters.splice(0)) w(m);
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const p = {
    send, logs, sleep,
    async viewport(width, height, dpr = 2, mobile = true) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile });
      await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 5 });
    },
    async goto(url, wait = 1500) { await send('Page.navigate', { url }); await sleep(wait); },
    async eval(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    async waitFor(expr, ms = 8000) {
      const t = Date.now();
      while (Date.now() - t < ms) { try { if (await p.eval(expr)) return true; } catch (e) {} await sleep(100); }
      throw new Error('timeout waiting for ' + expr);
    },
    async shot(file) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      (await import('node:fs')).writeFileSync(file, Buffer.from(r.data, 'base64'));
    },
    async tap(x, y) {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      await sleep(40);
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(80);
    },
    async click(x, y) {
      for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
      await sleep(80);
    },
    async pinch(cx, cy, from, to, steps = 8) {
      const pts = d => [{ x: cx - d / 2, y: cy, id: 1 }, { x: cx + d / 2, y: cy, id: 2 }];
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(from) });
      for (let i = 1; i <= steps; i++) { await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(from + (to - from) * i / steps) }); await sleep(16); }
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(120);
    },
    async drag(x0, y0, x1, y1, steps = 8) {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1 }] });
      for (let i = 1; i <= steps; i++) { await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * i / steps, y: y0 + (y1 - y0) * i / steps, id: 1 }] }); await sleep(16); }
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(120);
    },
    close() { ws.close(); },
  };
  return p;
}
