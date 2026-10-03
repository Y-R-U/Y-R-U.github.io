import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { homedir } from 'node:os';

export const ORIGIN = process.env.ORIGIN || 'http://localhost:8888';
export const GAME = ORIGIN + '/gms/3d/idle-western2/';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CDP = homedir() + '/.claude/bin/cdp';

export const VIEWPORTS = {
  s22: { width: 412, height: 915, deviceScaleFactor: 3, mobile: true },
  portrait: { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false },
};

export function launch({ port = +(process.env.CDP_PORT || 9311), metal = true } = {}) {
  const extra = metal ? ['--', '--use-angle=metal'] : [];
  execFileSync(CDP, ['start', '--port', String(port), '--idle', '120', '--max', '900', ...extra], { stdio: ['ignore', 'ignore', 'inherit'] });
  return port;
}

export function stop(port) {
  try { execFileSync(CDP, ['stop', String(port)], { stdio: 'ignore' }); } catch {}
}

export async function openPage(port) {
  const host = `http://127.0.0.1:${port}`;
  const target = await (await fetch(host + '/json/new?about:blank', { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map(), listeners = new Map();
  const consoleLog = [], exceptions = [], requests = [], failures = [];
  const send = (method, params = {}, timeout = 20000) => new Promise((resolve, reject) => {
    const key = ++id;
    const timer = setTimeout(() => { pending.delete(key); reject(new Error('CDP timeout: ' + method)); }, timeout);
    pending.set(key, { resolve, reject, timer });
    ws.send(JSON.stringify({ id: key, method, params }));
  });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id) {
      const p = pending.get(m.id);
      if (!p) return;
      clearTimeout(p.timer);
      pending.delete(m.id);
      m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
      return;
    }
    const p = m.params;
    for (const fn of listeners.get(m.method) || []) fn(p);
    if (m.method === 'Runtime.consoleAPICalled') {
      consoleLog.push({ type: p.type, text: p.args.map((a) => a.value ?? a.description ?? '').join(' '), url: p.stackTrace?.callFrames?.[0]?.url || '' });
    } else if (m.method === 'Runtime.exceptionThrown') {
      exceptions.push(p.exceptionDetails.exception?.description || p.exceptionDetails.text);
    } else if (m.method === 'Log.entryAdded') {
      if (p.entry.level === 'error' || p.entry.level === 'warning') consoleLog.push({ type: p.entry.level, text: p.entry.text, url: p.entry.url || '', source: p.entry.source });
    } else if (m.method === 'Network.requestWillBeSent') {
      requests.push(p.request.url);
    } else if (m.method === 'Network.loadingFailed') {
      if (!p.canceled) failures.push(p.errorText + ' ' + p.requestId);
    } else if (m.method === 'Network.responseReceived' && p.response.status >= 400) {
      failures.push(p.response.status + ' ' + p.response.url);
    }
  };
  const page = {
    send, consoleLog, exceptions, requests, failures,
    on(method, fn) { (listeners.get(method) || listeners.set(method, []).get(method)).push(fn); },
    async eval(expression, timeout) {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, timeout);
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    async goto(url, metrics = VIEWPORTS.portrait) {
      await send('Page.enable');
      await send('Runtime.enable');
      await send('Log.enable');
      await send('Network.enable');
      await send('Network.setCacheDisabled', { cacheDisabled: true });
      await send('Emulation.setDeviceMetricsOverride', metrics);
      if (metrics.mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await send('Page.navigate', { url });
    },
    async wait(expression, ms = 20000) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        try { const v = await page.eval(expression); if (v) return v; } catch {}
        await sleep(100);
      }
      throw new Error('Timeout waiting for ' + expression);
    },
    async shot(path, opts = {}) {
      await page.eval('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
      const r = await send('Page.captureScreenshot', { format: path.endsWith('.jpg') ? 'jpeg' : 'png', ...opts });
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, Buffer.from(r.data, 'base64'));
      return path;
    },
    async close() {
      try { await fetch(host + '/json/close/' + target.id); } catch {}
      ws.close();
      for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('CDP closed')); }
      pending.clear();
    },
  };
  return page;
}
