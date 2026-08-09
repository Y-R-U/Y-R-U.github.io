#!/usr/bin/env node
// Headless-Chrome screenshotter over raw CDP. No puppeteer, no npm.
//
//   node tools/shot.mjs --url <url> --out <dir> [options]
//
//   --size 1440x900        repeatable; sets an exact viewport
//   --at 0,3,8.5           repeatable list of seconds to capture at
//   --eval "<js>"          run before capturing (awaited if it returns a promise)
//   --wait 1500            ms to settle after load, before the first capture
//   --console              print page console + errors
//   --name prefix          filename prefix (default "shot")
//   --canvas [selector]    grab the canvas via toDataURL instead of Page.captureScreenshot
//
// Emulation.setDeviceMetricsOverride is used rather than --window-size, because the
// headless CLI clamps the window to a 500px minimum width and silently lies about
// narrow viewports. This gives a true 390px portrait.
//
// --canvas exists because Page.captureScreenshot HANGS FOREVER on an animating WebGL
// canvas under --headless=new + SwiftShader. It never returns and never errors. The
// canvas path reads the drawing buffer directly instead, which needs the page to have
// been created with preserveDrawingBuffer — for this project that means adding
// ?preserve=1 to the URL. Also pass ?dpr=1: at dpr 2 the software rasteriser takes
// minutes per frame.

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function parseArgs(argv) {
  const a = { sizes: [], at: [], out: '.', wait: 1200, name: 'shot', evals: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === '--url') { a.url = v; i++; }
    else if (k === '--out') { a.out = v; i++; }
    else if (k === '--size') { a.sizes.push(v); i++; }
    else if (k === '--at') { a.at.push(...v.split(',').map(Number)); i++; }
    else if (k === '--eval') { a.evals.push(v); i++; }
    else if (k === '--wait') { a.wait = Number(v); i++; }
    else if (k === '--name') { a.name = v; i++; }
    else if (k === '--console') a.console = true;
    else if (k === '--canvas') {
      a.canvas = v && !v.startsWith('--') ? v : 'canvas';
      if (a.canvas !== 'canvas') i++;
    }
    else if (k === '--seek') { a.seek = v; i++; }
  }
  if (!a.url) { console.error('need --url'); process.exit(1); }
  if (!a.sizes.length) a.sizes.push('1440x900');
  if (!a.at.length) a.at.push(0);
  return a;
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = new Map(); }

  static async attach(port) {
    // The browser can take a moment to open its debugging socket.
    let list;
    for (let i = 0; i < 60; i++) {
      try { list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch { list = null; }
      if (list?.some(t => t.type === 'page')) break;
      await sleep(200);
    }
    const page = list?.find(t => t.type === 'page');
    if (!page) throw new Error('no page target — is Chrome up?');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const c = new CDP(ws);
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && c.pending.has(m.id)) {
        const { res, rej } = c.pending.get(m.id);
        c.pending.delete(m.id);
        m.error ? rej(new Error(m.error.message)) : res(m.result);
      } else if (m.method) {
        (c.handlers.get(m.method) || []).forEach(fn => fn(m.params));
      }
    };
    return c;
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(fn);
  }
}

const args = parseArgs(process.argv.slice(2));
mkdirSync(args.out, { recursive: true });

const port = 9200 + Math.floor(Math.random() * 600);
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  '--hide-scrollbars',
  '--mute-audio',
  '--no-first-run',
  '--disable-gpu-vsync',
  '--enable-unsafe-swiftshader',
  '--use-gl=angle',
  '--user-data-dir=' + `/tmp/sf-shot-${port}`,
  'about:blank',
], { stdio: 'ignore' });

const written = [];
try {
  const cdp = await CDP.attach(port);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  // --canvas reads the WebGL drawing buffer, which is empty after compositing unless the
  // context was created with preserveDrawingBuffer. Most pages don't, so force it on at
  // getContext time — before any page script runs. Lets us screenshot a WebGL canvas we
  // don't own without editing it.
  if (args.canvas) {
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `(() => {
        const orig = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, attrs) {
          if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
            attrs = Object.assign({}, attrs, { preserveDrawingBuffer: true });
          }
          return orig.call(this, type, attrs);
        };
      })()`,
    });
  }

  const logs = [];
  cdp.on('Runtime.consoleAPICalled', p =>
    logs.push(`[${p.type}] ` + p.args.map(a => a.value ?? a.description ?? a.type).join(' ')));
  cdp.on('Runtime.exceptionThrown', p =>
    logs.push('[EXCEPTION] ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text)));

  for (const size of args.sizes) {
    const [w, h] = size.split('x').map(Number);
    const mobile = w < 700;
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: w, height: h, deviceScaleFactor: 2, mobile,
      screenWidth: w, screenHeight: h,
    });
    if (mobile) await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

    await cdp.send('Page.navigate', { url: args.url });
    await new Promise(res => {
      const t = globalThis.setTimeout(res, 15000);
      cdp.on('Page.loadEventFired', () => { clearTimeout(t); res(); });
    });
    await sleep(args.wait);

    for (const js of args.evals) {
      const r = await cdp.send('Runtime.evaluate', { expression: js, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) logs.push('[EVAL ERROR] ' + r.exceptionDetails.text);
    }

    let prev = 0;
    for (const t of args.at) {
      if (args.seek) {
        // Scrub a timeline instead of waiting in real time — one page load, many frames.
        const r = await cdp.send('Runtime.evaluate', {
          awaitPromise: true, returnByValue: true,
          expression: `(${args.seek})(${t})`,
        });
        if (r.exceptionDetails) logs.push('[SEEK ERROR] ' + r.exceptionDetails.text);
        await sleep(400);
      } else if (t > prev) {
        await sleep((t - prev) * 1000);
      }
      prev = t;
      let data;
      if (args.canvas) {
        // Two rAFs so we read a completed frame, not one mid-draw.
        const r = await cdp.send('Runtime.evaluate', {
          awaitPromise: true, returnByValue: true,
          expression: `new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => {
            const c = document.querySelector(${JSON.stringify(args.canvas)});
            res(c ? c.toDataURL('image/png') : null);
          })))`,
        });
        const url = r.result?.value;
        if (!url) { logs.push(`[SHOT] no canvas matching ${args.canvas}`); continue; }
        data = url.slice(url.indexOf(',') + 1);
      } else {
        ({ data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }));
      }
      const file = `${args.out}/${args.name}_${w}x${h}_t${String(t).replace('.', 'p')}.png`;
      writeFileSync(file, Buffer.from(data, 'base64'));
      written.push(file);
    }
  }

  if (args.console && logs.length) {
    console.log('--- page console ---');
    for (const l of logs.slice(0, 80)) console.log(l);
  }
  const errs = logs.filter(l => l.startsWith('[EXCEPTION]') || l.startsWith('[error]'));
  if (errs.length && !args.console) {
    console.log(`--- ${errs.length} page error(s) ---`);
    for (const l of errs.slice(0, 20)) console.log(l);
  }
} finally {
  chrome.kill('SIGKILL');
}

console.log(written.join('\n'));
