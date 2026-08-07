#!/usr/bin/env node
// Renders a named scenario to PNG and captures the perf snapshot alongside it.
// No puppeteer — raw CDP over the WebSocket that ships with node.
//
//   node tools/shot.mjs --shot=wall_day --preset=high --w=1600 --h=900
//   node tools/shot.mjs --all --preset=medium
//   node tools/shot.mjs --shot=wall_day --perf --headed     ← real GPU, for the budget gate

import { spawn, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const s = a.replace(/^--/, '');
  const i = s.indexOf('=');                 // split on the FIRST = only; --eval= contains more
  return i < 0 ? [s, true] : [s.slice(0, i), s.slice(i + 1)];
}));

const PORT = 8731 + (process.pid % 200);   // 8600 is kept free for the long-lived dev server
const CDP_PORT = 9431 + (process.pid % 200);
const W = +(args.w || 1600), H = +(args.h || 900);
const PRESET = args.preset || 'high';
const DPR = args.dpr || 2;
const HEADED = !!args.headed || !!args.perf;
const OUTDIR = resolve(ROOT, args.outdir || 'shots');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };

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
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=/tmp/facet-cdp-${process.pid}`,
    `--window-size=${W},${H}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization',
  ];
  if (HEADED) flags.push('--window-position=2400,80');
  else flags.push('--headless=new', '--use-angle=metal', '--use-gl=angle');

  const proc = spawn(CHROME, flags, { stdio: 'ignore', detached: false });
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      return { proc, ws: (await r.json()).webSocketDebuggerUrl };
    } catch { await sleep(150); }
  }
  throw new Error('chrome did not come up');
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const logs = [];

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
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
}

async function main() {
  const server = await serve();
  const { proc, ws } = await chrome();
  PROC = proc;
  const cdp = new CDP(ws);
  await cdp.connect();

  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => cdp.send(m, p, sessionId);

  await S('Page.enable');
  await S('Runtime.enable');

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
  // --mobile is the whole point of some bugs: the app picks its preset off the user agent and its
  // controls off (pointer: coarse), so a desktop window is not a test of what a phone does.
  await S('Emulation.setDeviceMetricsOverride', {
    width: W, height: H, deviceScaleFactor: +DPR, mobile: !!args.mobile,
  });
  if (args.mobile) {
    await S('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await S('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });
    await S('Network.setUserAgentOverride', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 '
        + '(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    });
  }

  const shots = args.all ? await listScenarios(S) : [args.shot || 'village_day'];
  mkdirSync(OUTDIR, { recursive: true });
  const results = [];

  for (const shot of shots) {
    const url = `http://127.0.0.1:${PORT}/index.html?shot=${shot}&preset=${PRESET}&dpr=${DPR}${args.hud ? '&hud=1' : ''}${args.set ? '&' + args.set : ''}`;
    await S('Page.navigate', { url });
    await waitFor(S, `window.__facet && window.__facet.ready`, 15000);
    // A reduced shadow rate makes captured frames bimodal — calls and triangles depend on whether
    // the frame you landed on rebuilt the map. Perf runs measure the worst case, not the luck.
    if (args.perf) await evalJSON(S, `(()=>{__facet.app.quality.set('shadowRate','every frame');return 1})()`);
    // let it settle: shadow maps, texture uploads, then a stable perf window
    // --pre runs before the frame is captured; --eval after it, on the frame you are looking at.
    if (args.pre) {
      await settle(S, 8);
      console.log('  pre:', JSON.stringify(await evalJSON(S, args.pre)));
    }
    await settle(S, args.perf ? 180 : 45);

    const stats = await evalJSON(S, `window.__facet.stats()`);
    const meta = await evalJSON(S, `window.__facet.scenarios.find(s=>s.id===${JSON.stringify(shot)}) || null`);
    const { data } = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const png = resolve(OUTDIR, `${shot}.png`);
    writeFileSync(png, Buffer.from(data, 'base64'));
    writeFileSync(png.replace(/\.png$/, '.json'), JSON.stringify({
      shot, ref: meta?.ref, zone: meta?.zone, preset: PRESET, dpr: +DPR, w: W, h: H, headed: HEADED, stats,
    }, null, 2));
    results.push({ shot, png, stats });
    if (args.eval) console.log('  eval:', JSON.stringify(await evalJSON(S, args.eval)));
    for (const l of logs.splice(0)) console.log('  ' + l);
    // calls/tris are the total the GPU drew; the bracket is the main pass alone (total − shadow)
    console.log(`${shot}  ${stats.fps.toFixed(0)}fps  gpu ${fmt(stats.gpuP95)}ms  cpu ${fmt(stats.cpuP95)}ms  ${stats.calls} calls (${stats.mainCalls} main)  ${(stats.tris / 1000).toFixed(0)}k tris (${(stats.mainTris / 1000).toFixed(0)}k main)  → ${png}`);
  }

  await S('Browser.close').catch(() => {});
  cleanup(proc);
  server.close();

  if (args.perf && !HEADED) console.warn('\n⚠ perf numbers from headless are software-rendered — rerun with --headed for the budget gate');
  writeFileSync(resolve(OUTDIR, '_summary.json'), JSON.stringify(results, null, 2));
}

const fmt = n => (n ? n.toFixed(1) : '—');

async function waitFor(S, expr, timeout) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const r = await S('Runtime.evaluate', { expression: `!!(${expr})`, returnByValue: true });
    if (r.result.value) return;
    await sleep(120);
  }
  throw new Error(`timed out waiting for ${expr}`);
}

async function settle(S, frames) {
  const start = await evalJSON(S, `window.__facet.frames()`);
  const t0 = Date.now();
  while (Date.now() - t0 < 20000) {
    const n = await evalJSON(S, `window.__facet.frames()`);
    if (n - start > frames) return;
    await sleep(100);
  }
}

async function evalJSON(S, expr) {
  const r = await S('Runtime.evaluate', { expression: `JSON.stringify(${expr})`, returnByValue: true, awaitPromise: true });
  return JSON.parse(r.result.value);
}

async function listScenarios(S) {
  await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
  await waitFor(S, `window.__facet && window.__facet.ready`, 15000);
  return await evalJSON(S, `window.__facet.scenarios.map(s=>s.id)`);
}

// A run that throws used to leave its browser and its profile dir behind. Enough of those and the
// machine is loaded enough to make every timing on it meaningless — which is exactly what happened.
let PROC = null;
function cleanup(proc) {
  const dir = `/tmp/facet-cdp-${process.pid}`;
  try { (proc || PROC)?.kill(); } catch {}
  // Killing the spawned parent leaves chrome's renderer and GPU children alive, and they keep
  // rewriting the profile dir. Match on the dir so only this run's processes are touched.
  try { execSync(`pkill -f ${dir} 2>/dev/null; sleep 0.4`, { stdio: 'ignore', shell: '/bin/sh' }); } catch {}
  try { rmSync(dir, { recursive: true, force: true }); } catch {}
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });

main().catch(e => {
  console.error(e.message);
  for (const l of logs) console.error('  ' + l);
  cleanup();
  process.exit(1);
});
