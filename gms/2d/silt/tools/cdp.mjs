#!/usr/bin/env node
/**
 * The shared headless-Chrome client. Raw CDP over a WebSocket — no puppeteer,
 * no npm, nothing installed. `shot.mjs` captures through it, `touch.mjs` drives
 * real touches through it, and every gate should build on it rather than
 * respawning Chrome its own way.
 *
 * TWO GOTCHAS, CARRIED VERBATIM (ARCHITECTURE §8.2). Rediscovering either costs
 * an hour:
 *
 * 1. Headless Chrome clamps the window to a 500 px minimum width and LIES about
 *    narrow viewports. Use Emulation.setDeviceMetricsOverride, never
 *    --window-size. That is the only way to get a true 390x844.
 * 2. Page.captureScreenshot HANGS FOREVER, with no error and no timeout, on an
 *    animating WebGL canvas under --headless=new + SwiftShader. Capture via
 *    canvas.toDataURL instead, which needs the context to have been created with
 *    preserveDrawingBuffer — hence ?preserve=1. Also pass ?dpr=1: at dpr 2 the
 *    software rasteriser takes minutes per frame.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';

export const CHROME = process.env.CHROME ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * A devtools port we have actually proved is free. The old code picked a random
 * port in a 600-wide range and hoped; across a few dozen launches by parallel
 * agents a collision is close to certain, and a collision is silent — the second
 * Chrome simply fails to bind and /json/list serves the first one's targets.
 */
async function freePort() {
  for (let i = 0; i < 40; i++) {
    const port = 9200 + Math.floor(Math.random() * 600);
    const ok = await new Promise((res) => {
      const s = createServer();
      s.once('error', () => res(false));
      s.listen(port, '127.0.0.1', () => s.close(() => res(true)));
    });
    if (ok) return port;
  }
  throw new Error('no free devtools port in 9200-9799 after 40 tries');
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
};

/** A static server rooted at the game folder. Same-origin by construction (gate B2). */
export async function serve(root = ROOT, port = 0) {
  const srv = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const f = join(root, p);
      if (!f.startsWith(root)) { res.writeHead(403).end(); return; }
      const st = await stat(f).catch(() => null);
      if (!st || !st.isFile()) { res.writeHead(404).end('not found'); return; }
      const ext = f.slice(f.lastIndexOf('.'));
      res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(await readFile(f));
    } catch (e) { res.writeHead(500).end(String(e)); }
  });
  await new Promise((r) => srv.listen(port, '127.0.0.1', r));
  const addr = srv.address();
  return { server: srv, port: addr.port, base: `http://127.0.0.1:${addr.port}`, close: () => srv.close() };
}

export class CDP {
  constructor(ws, chrome, profile) {
    this.ws = ws; this.chrome = chrome; this.profile = profile;
    this.id = 0; this.pending = new Map(); this.pendingMethod = new Map(); this.handlers = new Map();
    this.logs = []; this.errors = []; this.requests = [];
  }

  /**
   * Launch Chrome and attach. `gpu: true` asks for the real GPU (ANGLE Metal on
   * a Mac) — P1 measured on one and the difference is not cosmetic: SwiftShader
   * makes every draw-call number meaningless and every capture take minutes.
   */
  static async launch(opts = {}) {
    const port = await freePort();
    const profile = mkdtempSync(join(tmpdir(), 'kh-cdp-'));
    const args = [
      '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
      '--hide-scrollbars', '--mute-audio', '--no-first-run', '--disable-gpu-vsync',
      '--autoplay-policy=no-user-gesture-required', '--no-default-browser-check',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    ];
    if (opts.gpu) args.push('--use-angle=metal', '--enable-gpu');
    else args.push('--enable-unsafe-swiftshader', '--use-gl=angle');
    if (opts.args) args.push(...opts.args);
    args.push('about:blank');

    const chrome = spawn(CHROME, args, { stdio: 'ignore' });

    let list = null;
    for (let i = 0; i < 80; i++) {
      try { list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch { list = null; }
      if (list?.some((t) => t.type === 'page')) break;
      await sleep(150);
    }
    const pages = (list || []).filter((t) => t.type === 'page');
    if (!pages.length) { chrome.kill('SIGKILL'); throw new Error('no devtools page target — is Chrome at ' + CHROME + '?'); }
    // GOTCHA 3. A fresh Chrome we just launched has exactly one page target, at about:blank.
    // Anything else means we bound to SOMEONE ELSE'S Chrome — which happened for real: the port
    // used to be a blind random pick, a parallel agent already held it, /json/list answered with
    // their targets, and we captured their page and reported it as ours. Fail loudly instead.
    if (pages.length > 1 || (pages[0].url && pages[0].url !== 'about:blank')) {
      chrome.kill('SIGKILL');
      throw new Error(
        `devtools port ${port} is not ours — ${pages.length} page target(s), first url ` +
        `${JSON.stringify(pages[0].url)}. Another Chrome (likely a parallel agent) holds it. ` +
        `Re-run; do NOT trust a capture taken through it.`);
    }
    const page = pages[0];

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const c = new CDP(ws, chrome, profile);
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && c.pending.has(m.id)) {
        const { res, rej } = c.pending.get(m.id);
        c.pending.delete(m.id);
        m.error ? rej(new Error(`${c.pendingMethod.get(m.id) || '?'}: ${m.error.message}`)) : res(m.result);
        c.pendingMethod.delete(m.id);
      } else if (m.method) {
        const h = c.handlers.get(m.method);
        if (h) for (const fn of h) fn(m.params);
      }
    };
    await c.send('Page.enable');
    await c.send('Runtime.enable');
    await c.send('Network.enable');
    c.on('Runtime.consoleAPICalled', (p) => {
      const line = `[${p.type}] ` + p.args.map((a) => a.value ?? a.description ?? a.type).join(' ');
      c.logs.push(line);
      if (p.type === 'error') c.errors.push(line);
    });
    c.on('Runtime.exceptionThrown', (p) => {
      const line = '[EXCEPTION] ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text);
      c.logs.push(line); c.errors.push(line);
    });
    c.on('Network.requestWillBeSent', (p) => c.requests.push(p.request.url));
    return c;
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.pendingMethod.set(id, method);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(fn);
  }

  /** A TRUE narrow viewport. Never --window-size (gotcha 1). */
  async viewport(w, h, dpr = 1, touch = true) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width: w, height: h, deviceScaleFactor: dpr, mobile: touch,
      screenWidth: w, screenHeight: h,
    });
    await this.send('Emulation.setTouchEmulationEnabled', { enabled: touch, maxTouchPoints: 5 });
  }

  async goto(url, waitMs = 15000) {
    const done = new Promise((res) => {
      const t = globalThis.setTimeout(res, waitMs);
      this.on('Page.loadEventFired', () => { clearTimeout(t); res(); });
    });
    await this.send('Page.navigate', { url });
    await done;
  }

  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text || 'eval threw');
    return r.result.value;
  }

  /** Poll an expression until it is truthy. Returns false on timeout, never throws. */
  async waitFor(expr, ms = 15000, step = 100) {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      const v = await this.eval(`(()=>{try{return !!(${expr})}catch(e){return false}})()`).catch(() => false);
      if (v) return true;
      await sleep(step);
    }
    return false;
  }

  /** Advance real frames. rAF-driven, so it is the page's own clock, not ours. */
  async frames(n = 1) {
    await this.eval(`new Promise(res => { let i = ${n}; const f = () => (--i <= 0 ? res(1) : requestAnimationFrame(f)); requestAnimationFrame(f); })`);
  }

  async state() { return this.eval('JSON.parse(JSON.stringify(window.__state || null))'); }

  /**
   * Gotcha 2: canvas.toDataURL, never Page.captureScreenshot on a live canvas.
   *
   * GOTCHA 4. The game draws to TWO stacked canvases — #gl (WebGL) underneath and #hud (2D)
   * on top — because a WebGL and a 2D context cannot share one. Capturing `querySelector
   * ('canvas')` therefore returns the WebGL layer alone and **silently drops the entire HUD**.
   * That reads as "the HUD is broken" when it is drawing perfectly. Composite every canvas in
   * document order onto one surface instead, which is also what the player actually sees.
   */
  async capture(file, selector = null) {
    const url = await this.eval(
      `new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => {
        const sel = ${JSON.stringify(selector)};
        const list = sel ? [...document.querySelectorAll(sel)]
                         : [...document.querySelectorAll('canvas')].filter(c => {
                             const st = getComputedStyle(c);
                             return c.width && c.height && st.display !== 'none' && st.visibility !== 'hidden';
                           });
        if (!list.length) return res(null);
        if (list.length === 1) return res(list[0].toDataURL('image/png'));
        const w = Math.max(...list.map(c => c.width)), h = Math.max(...list.map(c => c.height));
        const out = document.createElement('canvas');
        out.width = w; out.height = h;
        const g = out.getContext('2d');
        for (const c of list) g.drawImage(c, 0, 0, w, h);
        res(out.toDataURL('image/png'));
      })))`);
    if (!url) return null;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
    return file;
  }

  offOrigin(base) {
    return this.requests.filter((u) => !u.startsWith(base) && !u.startsWith('data:') && !u.startsWith('blob:'));
  }

  close() {
    try { this.ws.close(); } catch { /* already gone */ }
    try { this.chrome.kill('SIGKILL'); } catch { /* already gone */ }
    try { rmSync(this.profile, { recursive: true, force: true, maxRetries: 3 }); } catch { /* chrome still holds it */ }
  }
}

/** Launch a server + Chrome and hand both back, closed together. */
export async function harness(opts = {}) {
  const srv = await serve(opts.root || ROOT);
  const cdp = await CDP.launch(opts);
  const close = () => { cdp.close(); srv.close(); };
  process.on('exit', close);
  return { srv, cdp, base: srv.base, close };
}
