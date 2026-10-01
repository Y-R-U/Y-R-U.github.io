// Lane 7: raw-CDP driver for headless Chrome (node 24, no deps).
//   import { launch, open, stopBrowser, decodePNG, imageStats } from './qa_cdp.mjs';
//   const port = await launch(9317);            // ~/.claude/bin/cdp start --port 9317 -- --use-angle=metal
//   const pg = await open(port);                // new tab, Runtime/Log/Page/Network on, cache disabled, workers attached
//   await pg.viewport({ width: 915, height: 412, mobile: true });
//   await pg.goto(url); await pg.eval('1+1'); await pg.tap(100, 100); await pg.shot('out.png');
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CDP_BIN = path.join(os.homedir(), '.claude/bin/cdp');

// Origins the game may legitimately reach besides its own.
export const ALLOWED_FOREIGN = [
  /^https:\/\/fonts\.googleapis\.com\//,
  /^https:\/\/fonts\.gstatic\.com\//,
  /^https:\/\/www\.gstatic\.com\/firebasejs\//,
];

export async function launch(port = 9317, flags = ['--use-angle=metal']) {
  execFileSync(CDP_BIN, ['start', '--port', String(port), '--idle', '240', '--max', '1800', '--', ...flags], { stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) return port; } catch {}
    await sleep(250);
  }
  throw new Error('chrome did not come up on ' + port);
}

export function stopBrowser(port) {
  try { execFileSync(CDP_BIN, ['stop', String(port)], { stdio: 'ignore' }); } catch {}
}

export async function open(port, { allowForeign = ALLOWED_FOREIGN } = {}) {
  const tab = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });

  let id = 0;
  const pend = new Map();
  const listeners = new Map();
  const log = { console: [], exceptions: [], bad: [], failed: [], foreign: [], requests: 0 };
  let pageOrigin = null;
  const reqUrl = new Map();

  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) {
      const p = pend.get(m.id); pend.delete(m.id);
      clearTimeout(p.t);
      m.error ? p.rej(new Error(`${p.method}: ${m.error.message}`)) : p.res(m.result);
      return;
    }
    if (!m.method) return;
    onEvent(m.method, m.params || {}, m.sessionId);
    for (const fn of listeners.get(m.method) || []) fn(m.params, m.sessionId);
  });

  function send(method, params = {}, sessionId, timeout = 30000) {
    return new Promise((res, rej) => {
      const i = ++id;
      const t = setTimeout(() => { pend.delete(i); rej(new Error(`${method}: CDP timeout ${timeout}ms`)); }, timeout);
      pend.set(i, { res, rej, t, method });
      ws.send(JSON.stringify(sessionId ? { id: i, method, params, sessionId } : { id: i, method, params }));
    });
  }

  function onEvent(method, p, sid) {
    const where = sid ? 'worker' : 'page';
    if (method === 'Runtime.consoleAPICalled') {
      const text = p.args.map((a) => a.value ?? a.description ?? a.type).join(' ');
      log.console.push({ type: p.type, text, where });
    } else if (method === 'Runtime.exceptionThrown') {
      const d = p.exceptionDetails;
      log.exceptions.push({ where, text: (d.exception?.description || d.text || '').split('\n').slice(0, 4).join(' | '), url: d.url, line: d.lineNumber });
    } else if (method === 'Log.entryAdded') {
      if (p.entry.level === 'error') log.console.push({ type: 'log-error', text: p.entry.text, url: p.entry.url, where });
    } else if (method === 'Network.requestWillBeSent') {
      const u = p.request.url;
      reqUrl.set(p.requestId, u);
      log.requests++;
      if (/^(data|blob|about|chrome|devtools):/.test(u)) return;
      try {
        const o = new URL(u).origin;
        if (pageOrigin && o !== pageOrigin && !allowForeign.some((re) => re.test(u))) log.foreign.push({ url: u, where });
      } catch {}
    } else if (method === 'Network.responseReceived') {
      if (p.response.status >= 400) log.bad.push({ status: p.response.status, url: p.response.url, where });
    } else if (method === 'Network.loadingFailed') {
      if (!p.canceled && !/ERR_ABORTED/.test(p.errorText)) log.failed.push({ error: p.errorText, url: reqUrl.get(p.requestId) || '?', where });
    } else if (method === 'Target.attachedToTarget') {
      const s = p.sessionId;
      const t = p.targetInfo.type;
      if (t === 'worker' || t === 'service_worker' || t === 'shared_worker') {
        Promise.all([send('Runtime.enable', {}, s), send('Network.enable', {}, s).then(() => send('Network.setCacheDisabled', { cacheDisabled: true }, s)).catch(() => {}),
          send('Runtime.runIfWaitingForDebugger', {}, s)]).catch(() => {});
      } else send('Runtime.runIfWaitingForDebugger', {}, s).catch(() => {});
    }
  }

  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });

  let mobile = false, vp = { width: 1280, height: 720 };

  const pg = {
    ws, send, log, tabId: tab.id,
    on(method, fn) { if (!listeners.has(method)) listeners.set(method, new Set()); listeners.get(method).add(fn); return () => listeners.get(method).delete(fn); },
    get mobile() { return mobile; },
    get size() { return vp; },
    resetLog() { log.console.length = log.exceptions.length = log.bad.length = log.failed.length = log.foreign.length = 0; log.requests = 0; },

    async viewport({ width, height, mobile: mob = false, dpr }) {
      mobile = mob; vp = { width, height };
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr ?? (mob ? 2 : 1), mobile: mob,
        screenOrientation: mob ? { type: 'landscapePrimary', angle: 90 } : { type: 'landscapePrimary', angle: 0 } });
      await send('Emulation.setTouchEmulationEnabled', { enabled: mob, maxTouchPoints: mob ? 5 : 1 });
      await send('Emulation.setEmitTouchEventsForMouse', { enabled: false });
      if (mob) await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' });
    },

    async clearOrigin(url) {
      const origin = new URL(url).origin;
      await send('Storage.clearDataForOrigin', { origin, storageTypes: 'all' });
    },

    // Navigate and wait for the load event (or timeout). Returns the main document's HTTP status if seen.
    async goto(url, { timeout = 30000 } = {}) {
      pageOrigin = new URL(url).origin;
      let status = null;
      const off = pg.on('Network.responseReceived', (p) => { if (p.type === 'Document' && status === null) status = p.response.status; });
      const loaded = new Promise((r) => { const o = pg.on('Page.loadEventFired', () => { o(); r(true); }); setTimeout(() => r(false), timeout); });
      const nav = await send('Page.navigate', { url });
      if (nav.errorText) { off(); return { status: 0, error: nav.errorText }; }
      const ok = await loaded;
      off();
      return { status, loaded: ok };
    },
    async reload({ timeout = 30000 } = {}) {
      const loaded = new Promise((r) => { const o = pg.on('Page.loadEventFired', () => { o(); r(true); }); setTimeout(() => r(false), timeout); });
      await send('Page.reload', { ignoreCache: true });
      return loaded;
    },

    // Evaluate an expression (awaits promises). Throws on a page exception.
    async eval(expr, { timeout = 30000 } = {}) {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true }, undefined, timeout);
      if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).split('\n')[0]);
      return r.result.value;
    },
    async evalSafe(expr, fallback = null) { try { return await pg.eval(expr); } catch { return fallback; } },
    // Run fn-body with `G = window.__game` and `C = G.ctx` in scope.
    game(body) { return pg.eval(`(async()=>{const G=window.__game;const C=G&&G.ctx;${body}})()`); },

    async waitFor(expr, { timeout = 15000, every = 200 } = {}) {
      const t0 = Date.now();
      while (Date.now() - t0 < timeout) {
        const v = await pg.evalSafe(expr);
        if (v) return v;
        await sleep(every);
      }
      return null;
    },

    async shot(file, { format = 'png' } = {}) {
      const r = await send('Page.captureScreenshot', { format, captureBeyondViewport: false });
      const buf = Buffer.from(r.data, 'base64');
      if (file) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, buf); }
      return buf;
    },

    // Centre of the first visible element matching a selector (optionally whose text includes `text`).
    rect(sel, text) {
      return pg.evalSafe(`(()=>{const T=${JSON.stringify(text || '')};for(const e of document.querySelectorAll(${JSON.stringify(sel)})){
        if(T&&!(e.textContent||'').includes(T))continue;const r=e.getBoundingClientRect();const cs=getComputedStyle(e);
        if(r.width<2||r.height<2||cs.visibility==='hidden'||cs.display==='none')continue;
        const x=r.x+r.width/2,y=r.y+r.height/2,t=document.elementFromPoint(x,y);
        return {x,y,w:r.width,h:r.height,covered:t&&!e.contains(t)?(t.tagName.toLowerCase()+(t.id?'#'+t.id:'')+(typeof t.className==='string'&&t.className.trim()?'.'+t.className.trim().split(' ').filter(Boolean).join('.'):'')):null};}return null})()`);
    },

    async touch(type, pts) {
      await send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, i = 1]) => ({ x, y, id: i, radiusX: 6, radiusY: 6, force: 1 })) });
    },
    async mouse(type, x, y, { button = 'left', buttons, clickCount = 1 } = {}) {
      const b = buttons ?? (type === 'mouseReleased' ? 0 : button === 'right' ? 2 : button === 'left' ? 1 : 0);
      await send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : button, buttons: b, clickCount, pointerType: 'mouse' });
    },
    async click(x, y, { button = 'left', hold = 40 } = {}) {
      await pg.mouse('mouseMoved', x, y);
      await pg.mouse('mousePressed', x, y, { button });
      await sleep(hold);
      await pg.mouse('mouseReleased', x, y, { button });
    },
    // A tap is a touch on mobile and a mouse click on desktop.
    async tap(x, y, { hold = 60, id = 11 } = {}) {
      if (!mobile) return pg.click(x, y, { hold });
      await pg.touch('touchStart', [[x, y, id]]);
      await sleep(hold);
      await pg.touch('touchEnd', []);
    },
    async tapSel(sel, text, opts) {
      const r = await pg.rect(sel, text);
      if (!r) return null;
      await pg.tap(r.x, r.y, opts);
      return r;
    },
    async key(code, key = code, { hold = 40 } = {}) {
      const vk = { Escape: 27, KeyE: 69, KeyQ: 81, Space: 32 }[code] || 0;
      await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code, key, windowsVirtualKeyCode: vk });
      await sleep(hold);
      await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key, windowsVirtualKeyCode: vk });
    },

    async close() {
      try { await fetch(`http://127.0.0.1:${port}/json/close/${tab.id}`); } catch {}
      try { ws.close(); } catch {}
    },
  };
  return pg;
}

// Minimal PNG decoder (8-bit RGB/RGBA, non-interlaced: what CDP produces).
export function decodePNG(buf) {
  let p = 8, width = 0, height = 0, ct = 0, bd = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8);
    const d = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { width = d.readUInt32BE(0); height = d.readUInt32BE(4); bd = d[8]; ct = d[9]; if (d[12]) throw new Error('interlaced png'); }
    else if (type === 'IDAT') idat.push(d);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (bd !== 8 || (ct !== 6 && ct !== 2)) throw new Error(`png: unsupported bitdepth ${bd} colortype ${ct}`);
  const bpp = ct === 6 ? 4 : 3, stride = width * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride), cur = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = src[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = v & 255;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      out[o] = cur[x * bpp]; out[o + 1] = cur[x * bpp + 1]; out[o + 2] = cur[x * bpp + 2]; out[o + 3] = bpp === 4 ? cur[x * bpp + 3] : 255;
    }
    [prev, cur] = [cur, prev];
  }
  return { width, height, data: out };
}

// Luma std-dev, distinct 4-bit colours, and edge density over a sampled grid (optionally a sub-rect in 0..1).
export function imageStats(png, { region = [0, 0, 1, 1], step = 4 } = {}) {
  const { width: W, height: H, data } = png;
  const x0 = Math.floor(region[0] * W), y0 = Math.floor(region[1] * H), x1 = Math.floor(region[2] * W), y1 = Math.floor(region[3] * H);
  let n = 0, sum = 0, sum2 = 0, edges = 0, black = 0;
  const colours = new Set();
  const luma = (o) => 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
  for (let y = y0; y < y1 - step; y += step) for (let x = x0; x < x1 - step; x += step) {
    const o = (y * W + x) * 4;
    const l = luma(o);
    n++; sum += l; sum2 += l * l; if (l < 10) black++;
    colours.add((data[o] >> 4) << 8 | (data[o + 1] >> 4) << 4 | (data[o + 2] >> 4));
    const dx = Math.abs(l - luma(o + step * 4)), dy = Math.abs(l - luma(o + step * W * 4));
    if (dx + dy > 24) edges++;
  }
  const mean = sum / n;
  return { mean: +mean.toFixed(1), std: +Math.sqrt(Math.max(0, sum2 / n - mean * mean)).toFixed(1), colours: colours.size, edgeFrac: +(edges / n).toFixed(3), blackFrac: +(black / n).toFixed(3) };
}
