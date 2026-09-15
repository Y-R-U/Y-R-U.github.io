// Minimal CDP driver for LONGSHOT headless testing — no puppeteer needed.
//
//   ~/.claude/bin/cdp start --port 9223      (never launch Chrome by hand)
//   python3 -m http.server 8843              (from the SITE ROOT, not here)
//   CDP_PORT=9223 BASE=http://127.0.0.1:8843/gms/3d/longshot/ node tools/...
import fs from 'node:fs';

const PORT = process.env.CDP_PORT || 9223;
export const BASE = process.env.BASE || 'http://127.0.0.1:8843/gms/3d/longshot/';

export async function connect() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  let t = list.find(x => x.type === 'page');
  if (!t) {
    t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  }
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const waits = new Map();
  const evs = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && waits.has(d.id)) { waits.get(d.id)(d); waits.delete(d.id); }
    else if (d.method) evs.push(d);
  };
  const send = (method, params = {}, ms = 45000) => new Promise((res, rej) => {
    const i = ++id;
    const to = setTimeout(() => { waits.delete(i); rej(new Error(`CDP timeout: ${method}`)); }, ms);
    waits.set(i, (d) => { clearTimeout(to); res(d); });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const api = {
    send, ws, evs,
    close: () => ws.close(),
    async evalRaw(expr, awaitPromise = false) {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise });
      if (r.error) throw new Error(JSON.stringify(r.error));
      if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'js exception');
      return r.result?.result?.value;
    },
    async ev(expr) { return api.evalRaw(`(()=>{${expr}})()`); },
    async evAsync(expr) { return api.evalRaw(`(async()=>{${expr}})()`, true); },
    async shot(path, w) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.mkdirSync(path.replace(/\/[^/]+$/, ''), { recursive: true });
      fs.writeFileSync(path, Buffer.from(r.result.data, 'base64'));
      return path;
    },
    async goto(url, { width = 1280, height = 800 } = {}) {
      await send('Page.enable');
      await send('Runtime.enable');
      await send('Network.enable');
      await send('Network.setCacheDisabled', { cacheDisabled: true });
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await send('Page.navigate', { url });
      await sleep(400);
    },
  };
  return api;
}

export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export async function waitFor(p, fn, ms = 40000, label = 'cond') {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const v = await p.ev(fn); if (v) return v; } catch (e) { /* page mid-nav */ }
    await sleep(250);
  }
  throw new Error('timeout waiting for ' + label);
}

// boot straight into a mission and wait until it is playable
export async function boot(p, q, opts = {}) {
  await p.goto(BASE + '?' + q, opts);
  await waitFor(p, `const s=window.__state; return s && s.mode==='mission' && s.fps>0 && s.eye && s.eye.y>0;`, 60000, 'mission ' + q);
  await sleep(900);
  return p.ev('return window.__state;');
}
