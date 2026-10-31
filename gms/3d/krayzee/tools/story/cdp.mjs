// Minimal raw-CDP driver for the STORY tests (node 22 global WebSocket).
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export async function connect(port) {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  let page = list.find((t) => t.type === 'page');
  if (!page) page = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let seq = 0;
  const pending = new Map(), listeners = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const { r, j } = pending.get(d.id); pending.delete(d.id); d.error ? j(new Error(d.error.message)) : r(d.result); }
    else if (d.method) for (const l of listeners) l(d);
  };
  const send = (method, params = {}) => new Promise((r, j) => { const id = ++seq; pending.set(id, { r, j }); ws.send(JSON.stringify({ id, method, params })); });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const C = { ws, send, sleep, listeners, mobile: false, errors: [] };
  C.ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  C.shot = async (dir, name) => {
    mkdirSync(dir, { recursive: true });
    const r = await send('Page.captureScreenshot', { format: 'png' });
    const p = join(dir, name + '.png');
    writeFileSync(p, Buffer.from(r.data, 'base64'));
    return p;
  };
  C.viewport = async (w, h, mobile) => {
    C.mobile = mobile;
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile, screenOrientation: { type: w > h ? 'landscapePrimary' : 'portraitPrimary', angle: w > h ? 90 : 0 } });
    await send('Emulation.setTouchEmulationEnabled', mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
  };
  C.tap = async (x, y) => {
    if (C.mobile) {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      await sleep(60);
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await sleep(40);
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    }
  };
  // Tap the centre of the first visible element matching sel. Returns the rect or null.
  C.tapSel = async (sel) => {
    const r = await C.ev(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => x.offsetParent || x.getClientRects().length); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height }; })()`);
    if (r) await C.tap(r.x, r.y);
    return r;
  };
  // Drag with a real touch (or mouse) from (x,y) by (dx,dy), holding for ms.
  C.drag = async (x, y, dx, dy, ms = 1500) => {
    const steps = 8;
    if (C.mobile) {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 7 }] });
      for (let i = 1; i <= steps; i++) { await sleep(30); await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * i / steps, y: y + dy * i / steps, id: 7 }] }); }
      const t0 = Date.now();
      while (Date.now() - t0 < ms) { await sleep(100); await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx + (Date.now() % 2), y: y + dy, id: 7 }] }); }
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      for (let i = 1; i <= steps; i++) { await sleep(30); await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + dx * i / steps, y: y + dy * i / steps, button: 'left', buttons: 1 }); }
      await sleep(ms);
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x + dx, y: y + dy, button: 'left', clickCount: 1 });
    }
  };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  listeners.push((d) => {
    if (d.method === 'Runtime.exceptionThrown') C.errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') C.errors.push(d.params.args.map((a) => a.value ?? a.description).join(' '));
  });
  C.load = async (url) => {
    await send('Page.navigate', { url });
    const t0 = Date.now();
    while (Date.now() - t0 < 120000) {   // a loaded machine boots slowly
      await sleep(300);
      try { if (await C.ev('!!window.__krayzeeReady')) return true; } catch (e) { /* navigating */ }
    }
    return false;
  };
  return C;
}
