// Headless Chrome over a raw CDP WebSocket — node only, never imported by the browser. Used by
// js/dev/uitest.mjs and available to any tab agent that wants to drive its own tab.
//
// Real Input.dispatchMouseEvent clicks, not element.click(): a screenshot of a screen nobody
// clicked proves nothing about whether the click works.
//
// The websocket is `tools/shot.mjs`'s, not node's. Node's global `WebSocket` offers
// `permessage-deflate` on every connection and undici hard-caps a *decompressed* message at 4 MiB
// (`kDefaultMaxDecompressedSize`): over that it aborts the message and destroys the socket with a
// 1006 / wasClean=false close and no close frame, so a request that only settles on its reply
// waits for ever. Measured here on 31 Aug: a 3.687 MiB `Page.captureScreenshot` reply came back in
// 171 ms, a 4.031 MiB one from the same page never came back at all. `shot()` at 1440×900 dpr 1
// was under the cap by luck; raising the window or the DPR wedged every consumer of this file.
// Do not swap this back for `new WebSocket`.
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import { CDP, CDP_TIMEOUT } from '../../tools/shot.mjs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// node:http, not `fetch`: js/game/fakedom.js replaces the global `fetch` with a file reader at
// module scope, and tools/test.mjs imports every test into one process — so a global here is
// whatever the last test file to load decided it was.
function devtoolsJSON(port, path, method, ms) {
  return new Promise((res, rej) => {
    const req = http.request({ host: '127.0.0.1', port, path, method, timeout: ms }, r => {
      let body = '';
      r.setEncoding('utf8');
      r.on('data', d => { body += d; });
      r.on('end', () => (r.statusCode === 200
        ? res(JSON.parse(body))
        : rej(new Error(`the devtools endpoint answered ${r.statusCode} for ${method} ${path}`))));
    });
    req.on('timeout', () => req.destroy(new Error(`the devtools endpoint did not answer ${path} in ${ms}ms`)));
    req.on('error', rej);
    req.end();
  });
}

// `args` are extra Chrome flags. The one that has earned its place is
// `--host-resolver-rules=MAP anything.example 127.0.0.1`, which is how a local server is reached
// under a hostname js/dev/gate.js calls public — the only honest way to test the gate.
export async function launch({ port = 9333, profile = '/tmp/wf-cdp-profile', w = 1440, h = 900, args = [] } = {}) {
  fs.rmSync(profile, { recursive: true, force: true });
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`, `--window-size=${w},${h}`, '--no-first-run', '--no-default-browser-check',
    // Same pair tools/shot.mjs uses: without them a WebGL context cannot be created headless and
    // the whole game boot fails before bootDev is ever reached.
    '--use-angle=metal', '--use-gl=angle', '--hide-scrollbars', ...args, 'about:blank'], { stdio: 'ignore' });
  let up = false;
  for (let i = 0; i < 100; i++) {
    try { await devtoolsJSON(port, '/json/version', 'GET', 3000); up = true; break; }
    catch { await sleep(150); }
  }
  // It used to return anyway and let `attach` fail on a stranger error further down the page.
  if (!up) { kill(proc, profile); throw new Error(`chrome did not answer on the devtools port ${port} in 15s`); }
  return { proc, port, profile, kill: () => kill(proc, profile) };
}

// `proc.kill()` alone leaves chrome's renderer and GPU children alive and still writing the profile
// dir — that is where the stale headless browsers on this machine came from.
function kill(proc, profile) {
  try { proc?.kill(); } catch { /* already gone */ }
  try { execSync(`pkill -f '${profile}' 2>/dev/null; sleep 0.4`, { stdio: 'ignore', shell: '/bin/sh' }); } catch { /* none left */ }
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* not ours to remove */ }
}

export async function attach(port, url, { timeout = CDP_TIMEOUT } = {}) {
  const t = await devtoolsJSON(port, `/json/new?${encodeURIComponent(url)}`, 'PUT', 15000);
  const cdp = new CDP(t.webSocketDebuggerUrl, { timeout });
  await cdp.connect();
  const events = [];
  cdp.on(m => {
    events.push(m);
    // beforeunload puts up a dialog that blocks navigation until someone answers it.
    if (m.method === 'Page.javascriptDialogOpening') {
      cdp.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => { /* socket already gone */ });
    }
  });
  const send = (method, params = {}) => cdp.send(method, params);
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Log.enable');
  return { send, events, targetId: t.id,
    async eval(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval threw');
      return r.result.value;
    },
    async waitFor(expr, ms = 15000) {
      const until = Date.now() + ms;
      for (;;) {
        // A dead socket would otherwise be swallowed here and reported as a plain timeout.
        try { if (await this.eval(expr)) return true; } catch (e) { if (cdp.dead) throw e; }
        if (Date.now() > until) return false;
        await sleep(200);
      }
    },
    async click(sel, nth = 0) {
      const box = await this.eval(`(() => { const e = document.querySelectorAll(${JSON.stringify(sel)})[${nth}];
        if (!e) return null; e.scrollIntoView({block:'center'}); const r = e.getBoundingClientRect();
        return { x: r.x + r.width/2, y: r.y + r.height/2 }; })()`);
      if (!box) throw new Error(`no element for ${sel}[${nth}]`);
      for (const type of ['mousePressed', 'mouseReleased']) {
        await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
      }
      await sleep(120);
    },
    async clickText(sel, text) {
      const n = await this.eval(`[...document.querySelectorAll(${JSON.stringify(sel)})].findIndex(e => e.textContent.trim().startsWith(${JSON.stringify(text)}))`);
      if (n < 0) throw new Error(`no ${sel} containing ${text}`);
      return this.click(sel, n);
    },
    async key(key, code, mods = 0) {
      for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key, code, modifiers: mods, windowsVirtualKeyCode: key === 'Escape' ? 27 : 0 });
      await sleep(120);
    },
    async type(text) { await send('Input.insertText', { text }); await sleep(80); },
    async shot(path) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path, Buffer.from(r.data, 'base64'));
      return path;
    },
    logs() {
      return events.filter(e => e.method === 'Runtime.consoleAPICalled' || e.method === 'Log.entryAdded' || e.method === 'Runtime.exceptionThrown')
        .map(e => {
          if (e.method === 'Runtime.exceptionThrown') return { level: 'exception', text: e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text };
          if (e.method === 'Log.entryAdded') return { level: e.params.entry.level, text: `${e.params.entry.text} ${e.params.entry.url || ''}` };
          return { level: e.params.type, text: e.params.args.map(a => a.value ?? a.description ?? a.type).join(' ') };
        });
    },
    close() { cdp.close(); },
  };
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));
