#!/usr/bin/env node
// Screenshots the 2D UI at a phone viewport and reports console errors. Same raw-CDP recipe as
// tools/shot.mjs; this one emulates touch and drives the showroom instead of a scenario.
//
//   node tools/uishot.mjs --sr=story_phoebus_cartel --w=390 --h=844
//   node tools/uishot.mjs --panel=tactics --w=844 --h=390
//   node tools/uishot.mjs --all-panels

import { spawn, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, rmSync, createReadStream, statSync } from 'node:fs';
import { dirname, resolve, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const s = a.replace(/^--/, '');
  const i = s.indexOf('=');
  return i < 0 ? [s, true] : [s.slice(0, i), s.slice(i + 1)];
}));

const PORT = 8731 + (process.pid % 200);
const CDP_PORT = 9431 + (process.pid % 200);
const W = +(args.w || 390), H = +(args.h || 844);
const DPR = +(args.dpr || 2);
const OUTDIR = resolve(ROOT, args.outdir || 'shots/ui');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const logs = [];

function serve() {
  return new Promise(res => {
    const s = http.createServer((req, rp) => {
      let p = join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!existsSync(p) || statSync(p).isDirectory()) p = join(p, 'index.html');
      if (!existsSync(p)) { rp.writeHead(404); return rp.end('404'); }
      rp.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
      createReadStream(p).pipe(rp);
    });
    s.listen(PORT, () => res(s));
  });
}

async function chrome() {
  const flags = [
    `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=/tmp/mono-ui-${process.pid}`,
    `--window-size=${W},${H}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--headless=new', '--use-angle=metal', '--use-gl=angle', '--ignore-gpu-blocklist',
  ];
  const proc = spawn(CHROME, flags, { stdio: 'ignore' });
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      return { proc, ws: (await r.json()).webSocketDebuggerUrl };
    } catch { await sleep(150); }
  }
  throw new Error('chrome did not come up');
}

class CDP {
  constructor(url) { this.id = 0; this.pending = new Map(); this.url = url; }
  connect() {
    return new Promise((res, rej) => {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => res();
      this.ws.onerror = rej;
      this.ws.onmessage = e => {
        const m = JSON.parse(e.data);
        if (m.id && this.pending.has(m.id)) {
          const { res: r, rej: j } = this.pending.get(m.id);
          this.pending.delete(m.id);
          m.error ? j(new Error(m.error.message)) : r(m.result);
        }
      };
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((res, rej) => { this.pending.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params, sessionId })); });
  }
}

let PROC = null;
function cleanup(proc) {
  const dir = `/tmp/mono-ui-${process.pid}`;
  try { (proc || PROC)?.kill(); } catch {}
  try { execSync(`pkill -f ${dir} 2>/dev/null; sleep 0.3`, { stdio: 'ignore', shell: '/bin/sh' }); } catch {}
  try { rmSync(dir, { recursive: true, force: true }); } catch {}
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });

async function main() {
  const server = await serve();
  const { proc, ws } = await chrome();
  PROC = proc;
  const cdp = new CDP(ws);
  await cdp.connect();
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => cdp.send(m, p, sessionId);
  await S('Page.enable'); await S('Runtime.enable');

  cdp.ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.consoleAPICalled' && /error|warn/.test(m.params.type)) {
      logs.push(`[${m.params.type}] ` + m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      logs.push('[throw] ' + (d.exception?.description || d.text));
    }
  });

  await S('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: true });
  await S('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

  mkdirSync(OUTDIR, { recursive: true });

  const jobs = [];
  if (args['all-panels']) {
    await load(S, '');
    const ids = await evalJSON(S, `window.__mono.showroom.ids('panel')`);
    for (const id of ids) jobs.push({ name: `panel_${id}`, sr: id });
  } else if (args['all-stories']) {
    await load(S, '');
    const ids = await evalJSON(S, `window.__mono.showroom.ids('story')`);
    for (const id of ids) jobs.push({ name: id, sr: id });
  } else if (args.sr) jobs.push({ name: args.sr, sr: args.sr });
  else if (args.panel) jobs.push({ name: `live_${args.panel}`, panel: args.panel });
  else jobs.push({ name: 'shell' });

  for (const j of jobs) {
    const q = j.sr ? `?sr=${j.sr}` : j.panel ? `?panel=${j.panel}` : '';
    await load(S, q + (args.set ? (q ? '&' : '?') + args.set : ''));
    if (args.eval) await S('Runtime.evaluate', { expression: args.eval, awaitPromise: true });
    await sleep(+(args.wait || 900));
    const overlap = await evalJSON(S, OVERLAP);
    const { data } = await S('Page.captureScreenshot', { format: 'png' });
    const png = resolve(OUTDIR, `${j.name}_${W}x${H}.png`);
    writeFileSync(png, Buffer.from(data, 'base64'));
    if (args.report) console.log('  report:', JSON.stringify(await evalJSON(S, args.report)));
    const bad = overlap.problems.length ? '  ⚠ ' + overlap.problems.join('; ') : '';
    console.log(`${j.name}  ${W}×${H}  sheet ${overlap.sheet}${bad}  → ${png}`);
    for (const l of logs.splice(0)) console.log('    ' + l);
  }

  await S('Browser.close').catch(() => {});
  cleanup(proc); server.close();
}

async function load(S, query) {
  await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html${query}` });
  await waitFor(S, `window.__mono && window.__mono.ready`, 20000);
}

// Every panel must fit between the top bar and the dock, and its primary action must sit inside
// the thumb zone (the bottom third).
const OVERLAP = `(() => {
  const r = s => { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null; };
  const vis = e => e && e.width > 0 && e.height > 0;
  const sheet = r('.sheet'), top = r('#topbar'), cta = r('.sheet-cta .primary');
  const dock = vis(r('#dock')) ? r('#dock') : null;
  const p = [];
  if (sheet && top && sheet.top < top.bottom) p.push('sheet under the top bar');
  if (sheet && dock && sheet.bottom > dock.top + 1) p.push('sheet over the dock');
  if (sheet && sheet.bottom > innerHeight + 1) p.push('sheet off the bottom');
  if (cta && cta.bottom > innerHeight) p.push('primary action off screen');
  if (cta && cta.top < innerHeight * 0.55) p.push('primary action above the thumb zone');
  if (cta && cta.height < 40) p.push('primary action under 40px tall');
  const body = document.querySelector('.sheet-body');
  if (body && body.scrollWidth > body.clientWidth + 2) p.push('sheet body scrolls sideways');
  if (document.documentElement.scrollWidth > innerWidth + 1) p.push('page scrolls sideways');
  return { sheet: sheet ? Math.round(sheet.height) + 'px' : 'none', problems: p };
})()`;

async function waitFor(S, expr, timeout) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const r = await S('Runtime.evaluate', { expression: `!!(${expr})`, returnByValue: true });
    if (r.result.value) return;
    await sleep(120);
  }
  throw new Error(`timed out waiting for ${expr}`);
}

async function evalJSON(S, expr) {
  const r = await S('Runtime.evaluate', { expression: `JSON.stringify(${expr})`, returnByValue: true, awaitPromise: true });
  return JSON.parse(r.result.value);
}

main().catch(e => { console.error(e.message); for (const l of logs) console.error('  ' + l); cleanup(); process.exit(1); });
