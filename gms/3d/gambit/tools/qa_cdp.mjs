#!/usr/bin/env node
// qa agent: a persistent CDP driver so a playthrough can be driven step by step with REAL input
// (touch taps on phones, mouse clicks on desktop) while console errors are collected the whole time.
//
//   ~/.claude/bin/cdp start --port 9528 -- --use-angle=metal --use-gl=angle --ignore-gpu-blocklist
//   ~/.claude/bin/cdp start --port 9529 -- --use-angle=metal --use-gl=angle --ignore-gpu-blocklist   # 2nd browser (online)
//   node tools/qa_cdp.mjs serve --ports=9528,9529 --http=9628 --out=DIR &      # daemon (tabs A, B)
//   node tools/qa_cdp.mjs do A size 360 740 m , nav '#/home' , tap '.menu-item.primary' , shot bots
//
// Commands (comma-separated; first word may be a tab name A/B to switch):
//   size W H [m]            viewport (m = mobile: dpr 2 + touch emulation; taps become touches)
//   nav HASH|URL            Network.clearBrowserCache, then navigate (BASE + '?nocloud' + HASH unless a full URL)
//   reload                  Page.reload (cache cleared first)
//   tap SEL [i]             real tap/click at the centre of the i-th match
//   tapxy X Y               real tap/click at page coords
//   tapt TEXT               tap the first button/a/[data-act] whose text includes TEXT
//   sq SQ                   tap a board square (via board.squareToScreen)
//   mv FROM TO              tap-tap a move on the board
//   drag FROM TO            drag a piece (touch or mouse)
//   key KEY                 keyboard press (e.g. v, ArrowLeft)
//   eval EXPR               Runtime.evaluate (awaits promises), prints JSON
//   until EXPR [MS]         poll until truthy
//   wait MS
//   shot NAME               screenshot to OUT/NAME.png
//   errs                    print + clear console errors seen since the last errs
//   throttle N              CPU throttling rate (1 = off)
import { writeFileSync, mkdirSync } from 'node:fs';
import http from 'node:http';

const argv = process.argv.slice(2);
const MODE = argv[0];
const opt = Object.fromEntries(argv.filter(a => a.startsWith('--')).map(a => { const [k, ...v] = a.slice(2).split('='); return [k, v.join('=') || true]; }));
const HTTP = +(opt.http || 9628);
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (MODE === 'do') {
  const rest = argv.slice(1).filter(a => !a.startsWith('--'));
  const body = JSON.stringify(rest);
  const req = http.request({ host: '127.0.0.1', port: HTTP, method: 'POST', path: '/' }, res => {
    let d = ''; res.on('data', c => d += c); res.on('end', () => { process.stdout.write(d); process.exit(res.statusCode === 200 ? 0 : 1); });
  });
  req.on('error', e => { console.error('daemon not running?', e.message); process.exit(2); });
  req.end(body);
} else if (MODE === 'serve') {
  serve();
}

async function serve() {
  const PORTS = String(opt.ports || '9528').split(',').map(Number);
  const BASE = opt.base || 'http://192.168.0.236:8888/gms/3d/gambit/';
  const QS = opt.qs ?? '?nocloud';
  globalThis.BASEJS = BASE.replace(/^https?:\/\/[^/]+/, '') + 'js/app/boardhost.js';
  let OUT = opt.out || '/tmp/gambit-qa';
  mkdirSync(OUT, { recursive: true });

  class Tab {
    constructor(name, port) { this.name = name; this.port = port; this.id = 0; this.pending = new Map(); this.errors = []; this.mobile = false; this.navs = 0; }
    async open() {
      const list = await (await fetch(`http://127.0.0.1:${this.port}/json/list`)).json();
      let page = list.find(t => t.type === 'page');
      if (!page) page = await (await fetch(`http://127.0.0.1:${this.port}/json/new?about:blank`, { method: 'PUT' })).json();
      this.ws = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
      this.ws.onmessage = ev => {
        const m = JSON.parse(ev.data);
        if (m.id && this.pending.has(m.id)) { const p = this.pending.get(m.id); this.pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); return; }
        const P = m.params;
        if (m.method === 'Runtime.consoleAPICalled' && ['error', 'assert'].includes(P.type)) this.err('console.error: ' + P.args.map(a => a.value ?? a.description).join(' '));
        if (m.method === 'Runtime.consoleAPICalled' && P.type === 'warning') { const s = P.args.map(a => a.value ?? a.description).join(' '); if (/\[gambit\]/.test(s) && !/account layer/.test(s)) this.err('warn: ' + s); }
        if (m.method === 'Runtime.exceptionThrown') this.err('exception: ' + (P.exceptionDetails.exception?.description || P.exceptionDetails.text));
        if (m.method === 'Log.entryAdded' && P.entry.level === 'error') this.err('log: ' + P.entry.text + ' ' + (P.entry.url || ''));
        if (m.method === 'Page.frameNavigated' && !P.frame.parentId) this.navs++;
      };
      for (const d of ['Runtime', 'Log', 'Page', 'Network']) await this.send(d + '.enable');
    }
    err(s) { this.errors.push(new Date().toISOString().slice(11, 19) + ' ' + s.slice(0, 600)); }
    send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => { this.pending.set(id, { res, rej }); setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); rej(new Error('cdp timeout ' + method)); } }, 60000); }); }
    async eval(expr) {
      const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result.value;
    }
    async tapAt(x, y) {
      if (this.mobile) {
        await this.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        await sleep(60);
        await this.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
        await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
        await sleep(40);
        await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
      }
    }
    async dragXY(x0, y0, x1, y1, steps = 10) {
      if (this.mobile) {
        await this.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
        for (let i = 1; i <= steps; i++) { await sleep(16); await this.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * i / steps, y: y0 + (y1 - y0) * i / steps }] }); }
        await sleep(30); await this.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y: y0 });
        await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'left', clickCount: 1 });
        for (let i = 1; i <= steps; i++) { await sleep(16); await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0 + (x1 - x0) * i / steps, y: y0 + (y1 - y0) * i / steps, button: 'left', buttons: 1 }); }
        await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x1, y: y1, button: 'left', clickCount: 1 });
      }
    }
    async sqXY(sq) {
      const p = await this.eval(`(async()=>{const h=document.querySelector('.board-host'); const b=(await import('${globalThis.BASEJS}')).sharedBoard(); if(!h||!b) return null; const r=h.getBoundingClientRect(); const s=b.squareToScreen(${JSON.stringify(sq)}); return s&&{x:r.left+s.x,y:r.top+s.y}})()`);
      if (!p) throw new Error('no board / square ' + sq);
      return p;
    }
  }

  const tabs = {};
  const names = ['A', 'B', 'C'];
  for (let i = 0; i < PORTS.length; i++) { const t = new Tab(names[i], PORTS[i]); await t.open(); tabs[t.name] = t; }
  // expose the shared board to the page for square lookups
  const BOARD_HOOK = '0';

  async function run(cmds) {
    let tab = tabs.A, out = [];
    const log = s => out.push(s);
    for (const raw of cmds) {
      let words = raw.slice();
      if (tabs[words[0]]) { tab = tabs[words.shift()]; if (!words.length) continue; }
      const [c, ...a] = words;
      const t = tab;
      switch (c) {
        case 'out': OUT = a[0]; mkdirSync(OUT, { recursive: true }); break;
        case 'size': {
          const [w, h, m] = a; t.mobile = m === 'm'; t.w = +w; t.h = +h;
          await t.send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: t.mobile ? 2 : 1, mobile: t.mobile });
          await t.send('Emulation.setTouchEmulationEnabled', t.mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
          break;
        }
        case 'nav': case 'reload': {
          await t.send('Network.clearBrowserCache');
          if (c === 'reload') await t.send('Page.reload', { ignoreCache: true });
          else { let u = /^https?:/.test(a[0]) ? a[0] : BASE + (a[1] ?? QS) + (a[0] || '#/home'); u = u.replace(/(#|$)/, (u.split('#')[0].includes('?') ? '&' : '?') + 't=' + Date.now() + '$1'); await t.send('Page.navigate', { url: u }); }
          await sleep(500);
          const t0 = Date.now(); while (Date.now() - t0 < 20000) { try { if (await t.eval('window.__booted === true')) break; } catch { } await sleep(150); }
          await t.eval(BOARD_HOOK).catch(() => {});
          await sleep(300); break;
        }
        case 'tap': {
          const i = +(a[1] || 0);
          const p = await t.eval(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(a[0])})].filter(x=>x.getClientRects().length)[${i}]; if(!e) return null; e.scrollIntoView({block:'nearest'}); const r=e.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
          if (!p) throw new Error('no element ' + a[0]);
          await sleep(80); await t.tapAt(p.x, p.y); await sleep(250); break;
        }
        case 'tapt': {
          const txt = a.join(' ');
          const p = await t.eval(`(()=>{const e=[...document.querySelectorAll('button,a,[data-act],.chip,.seg button,label')].filter(x=>x.getClientRects().length&&x.textContent.includes(${JSON.stringify(txt)})).pop(); if(!e) return null; e.scrollIntoView({block:'nearest'}); const r=e.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
          if (!p) throw new Error('no element with text ' + txt);
          await sleep(80); await t.tapAt(p.x, p.y); await sleep(250); break;
        }
        case 'tapxy': await t.tapAt(+a[0], +a[1]); await sleep(200); break;
        case 'sq': { const p = await t.sqXY(a[0]); await t.tapAt(p.x, p.y); await sleep(150); break; }
        case 'mv': { const p = await t.sqXY(a[0]); await t.tapAt(p.x, p.y); await sleep(180); const q = await t.sqXY(a[1]); await t.tapAt(q.x, q.y); await sleep(200); break; }
        case 'drag': { const p = await t.sqXY(a[0]), q = await t.sqXY(a[1]); await t.dragXY(p.x, p.y, q.x, q.y); await sleep(200); break; }
        case 'dragxy': await t.dragXY(+a[0], +a[1], +a[2], +a[3]); break;
        case 'key': {
          const k = a[0]; const code = k.length === 1 ? 'Key' + k.toUpperCase() : k;
          await t.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, text: k.length === 1 ? k : undefined });
          await t.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code }); await sleep(150); break;
        }
        case 'eval': log(JSON.stringify(await t.eval(a.join(' ')))); break;
        case 'until': {
          const ms = +(a.length > 1 && /^\d+$/.test(a[a.length - 1]) ? a.pop() : 15000); const ex = a.join(' ');
          const t0 = Date.now(); let ok = false;
          while (Date.now() - t0 < ms) { try { if (await t.eval(ex)) { ok = true; break; } } catch { } await sleep(120); }
          if (!ok) throw new Error('timeout: ' + ex);
          log(`ok after ${Date.now() - t0} ms`); break;
        }
        case 'wait': await sleep(+a[0]); break;
        case 'shot': { const sc = +(a[1] || (t.mobile ? 0.5 : 0.6)); const r = await t.send('Page.captureScreenshot', { format: 'png', ...(t.w ? { clip: { x: 0, y: 0, width: t.w, height: t.h, scale: sc * (t.mobile ? 1 : 1) } } : {}) }); const f = `${OUT}/${a[0]}.png`; writeFileSync(f, Buffer.from(r.data, 'base64')); log('shot ' + f); break; }
        case 'errs': log(`[${t.name}] errors: ${t.errors.length}` + (t.errors.length ? '\n  ' + t.errors.join('\n  ') : '')); t.errors = []; break;
        case 'navs': log(`[${t.name}] navs ${t.navs}`); if (a[0] === 'reset') t.navs = 0; break;
        case 'throttle': await t.send('Emulation.setCPUThrottlingRate', { rate: +a[0] }); break;
        case 'cdp': log(JSON.stringify(await t.send(a[0], a[1] ? JSON.parse(a.slice(1).join(' ')) : {}))); break;
        case 'front': await t.send('Page.bringToFront'); break;
        default: throw new Error('unknown command ' + c);
      }
    }
    return out.join('\n');
  }

  http.createServer((req, res) => {
    let d = ''; req.on('data', c => d += c); req.on('end', async () => {
      const words = JSON.parse(d); const cmds = [[]];
      for (const w of words) { if (w === ',') cmds.push([]); else cmds[cmds.length - 1].push(w); }
      try { const r = await run(cmds.filter(x => x.length)); res.writeHead(200); res.end(r + '\n'); }
      catch (e) { res.writeHead(500); res.end('ERROR ' + e.message + '\n'); }
    });
  }).listen(HTTP, '127.0.0.1', () => console.log('qa daemon on', HTTP, 'tabs', Object.keys(tabs).join(',')));
}
