// Headless Chrome over a raw CDP WebSocket — node only, never imported by the browser. Used by
// js/dev/uitest.mjs and available to any tab agent that wants to drive its own tab.
//
// Real Input.dispatchMouseEvent clicks, not element.click(): a screenshot of a screen nobody
// clicked proves nothing about whether the click works.
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

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
  for (let i = 0; i < 100; i++) {
    try { await fetch(`http://127.0.0.1:${port}/json/version`); break; } catch { await sleep(150); }
  }
  return { proc, port };
}

export async function attach(port, url) {
  const t = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0;
  const waiters = new Map();
  const events = [];
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); }
    else if (m.method) {
      events.push(m);
      // beforeunload puts up a dialog that blocks navigation until someone answers it.
      if (m.method === 'Page.javascriptDialogOpening') {
        ws.send(JSON.stringify({ id: ++id, method: 'Page.handleJavaScriptDialog', params: { accept: true } }));
      }
    }
  });
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id;
    waiters.set(i, m => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
    ws.send(JSON.stringify({ id: i, method, params }));
  });
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
        try { if (await this.eval(expr)) return true; } catch { /* context still loading */ }
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
    close() { ws.close(); },
  };
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));
