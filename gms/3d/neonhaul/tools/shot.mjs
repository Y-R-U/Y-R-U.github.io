#!/usr/bin/env node
// Renders a named scenario to PNG and captures the perf snapshot alongside it.
// No puppeteer — raw CDP over the WebSocket that ships with node.
//
//   node tools/shot.mjs --shot=fog_city --w=1600 --h=900 --dpr=2
//   node tools/shot.mjs --all
//   node tools/shot.mjs --shot=fog_city --mobile
//   node tools/shot.mjs --shot=fog_city --headed --perf     ← real GPU, for the budget gate
//
// Writes shots/<id>.png and shots/<id>.stats.json. shots/<id>.json is the COMMITTED scenario
// definition and is never overwritten — it is checked against the page instead.

import { spawn, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, createReadStream, statSync } from 'node:fs';
import { dirname, resolve, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export function parseArgs(argv = process.argv.slice(2)) {
  return Object.fromEntries(argv.map(a => {
    const s = a.replace(/^--/, '');
    const i = s.indexOf('=');            // first = only; --eval= contains more
    return i < 0 ? [s, true] : [s.slice(0, i), s.slice(i + 1)];
  }));
}

const args = parseArgs();

const PORT = 8931 + (process.pid % 200);
const CDP_PORT = 9631 + (process.pid % 200);
// compare.mjs needs at least 900×506 in (§12.4.1 fix 6); 1600×900 is the documented minimum.
const W = +(args.w || 1600), H = +(args.h || 900);
// dpr 1 by default. Headless ANGLE/metal stalls on this machine somewhere above ~5 Mpx of
// HalfFloat + 2x MSAA render target: 1600x900 @ dpr 2 (3200x1800) and 900x1600 @ dpr 2 never
// return a screenshot, while 780x1400 @ dpr 2 does. Use --headed if you need a dpr-2 capture.
const DPR = +(args.dpr || 1);
const HEADED = !!args.headed;
const OUTDIR = resolve(ROOT, args.outdir || 'shots');

if (!HEADED && W * H * DPR * DPR > 5.0e6) {
  console.warn(`⚠ ${W}x${H} @ dpr ${DPR} is ${(W * H * DPR * DPR / 1e6).toFixed(1)} Mpx of render target — `
    + `headless ANGLE stalls above ~5 Mpx here. Drop --dpr, or add --headed.`);
}

// Audio types are here because P8 found them missing: without `.mp3` this server answers
// `application/octet-stream`, and an <audio> element fed that will play in some Chrome builds and
// refuse in others — so a gate driving audio through it tests a coin flip, not the game.
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.mp4': 'video/mp4', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };

const sleep = ms => new Promise(r => setTimeout(r, ms));
export const logs = [];

// Walks up from `port` until one is free. Several agents run these at once and a fixed port dies
// with EADDRINUSE.
function serve(port) {
  return new Promise((res, rej) => {
    const s = http.createServer((req, rp) => {
      let p = join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!existsSync(p) || statSync(p).isDirectory()) p = join(p, 'index.html');
      if (!existsSync(p)) { rp.writeHead(404); return rp.end('404'); }
      const type = MIME[extname(p)] || 'application/octet-stream';
      const size = statSync(p).size;
      // RANGE SUPPORT, added by P7b and for the same reason P8 added the audio MIME types: without
      // it this server is not a fair stand-in for the one the game ships on. A `<video>` element
      // issues `Range: bytes=0-` and a server that answers 200 with a chunked body and no
      // content-length leaves Chrome unable to report duration or seek — so a P7b media gate would
      // be measuring this server's limitations rather than the panel's behaviour.
      const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
      if (m && size) {
        const start = m[1] ? +m[1] : 0;
        const end = m[2] ? Math.min(+m[2], size - 1) : size - 1;
        if (start >= size || end < start) {
          rp.writeHead(416, { 'content-range': `bytes */${size}` });
          return rp.end();
        }
        rp.writeHead(206, {
          'content-type': type, 'accept-ranges': 'bytes',
          'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1,
        });
        return createReadStream(p, { start, end }).pipe(rp);
      }
      rp.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': size });
      createReadStream(p).pipe(rp);
    });
    let tries = 0;
    s.on('error', e => (e.code === 'EADDRINUSE' && ++tries < 60 ? s.listen(port + tries) : rej(e)));
    s.on('listening', () => res(s));
    s.listen(port);
  });
}

// Chrome given a busy --remote-debugging-port does not fail loudly: /json/version answers from
// whoever already owns it, and this run would attach to another agent's browser.
function freePort(start) {
  return new Promise((res, rej) => {
    const s = http.createServer();
    let tries = 0;
    s.on('error', e => (e.code === 'EADDRINUSE' && ++tries < 60 ? s.listen(start + tries) : rej(e)));
    s.on('listening', () => { const { port } = s.address(); s.close(() => res(port)); });
    s.listen(start);
  });
}

async function chrome(w, h, headed, cdpPort, sw) {
  const flags = [
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=/tmp/neonhaul-cdp-${process.pid}`,
    `--window-size=${w},${h}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--mute-audio', '--ignore-gpu-blocklist', '--enable-gpu-rasterization',
  ];
  if (headed) flags.push('--window-position=2400,80');
  else if (sw) flags.push('--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-gl=angle');
  else flags.push('--headless=new', '--use-angle=metal', '--use-gl=angle');

  const proc = spawn(CHROME, flags, { stdio: 'ignore', detached: false });
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
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
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
}

// One served page under one CDP session. Exported so budget.mjs and soak.mjs re-implement none
// of this.
export async function open({ w = 1600, h = 900, dpr = 2, mobile = false, headed = false, sw = false } = {}) {
  const server = await serve(PORT);
  const port = server.address().port;
  const { proc, ws } = await chrome(w, h, headed, await freePort(CDP_PORT), sw);
  PROC = proc;
  const cdp = new CDP(ws);
  await cdp.connect();

  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => cdp.send(m, p, sessionId);

  await S('Page.enable');
  await S('Runtime.enable');
  await S('Log.enable').catch(() => {});

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

  // The app picks its layout off (pointer: coarse) and its preset off cores, so a desktop window
  // is not a test of what a phone does.
  await S('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: +dpr, mobile: !!mobile });
  if (mobile) {
    await S('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await S('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });
    await S('Network.setUserAgentOverride', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 '
        + '(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    });
  }

  return {
    S, logs, cdp, sessionId, base: `http://127.0.0.1:${port}`,
    async setMetrics(nw, nh, ndpr = dpr, nmobile = mobile) {
      await S('Emulation.setDeviceMetricsOverride', { width: nw, height: nh, deviceScaleFactor: +ndpr, mobile: !!nmobile });
    },
    async close() {
      await S('Browser.close').catch(() => {});
      cleanup(proc);
      server.close();
    },
  };
}

export async function waitFor(S, expr, timeout = 20000) {
  const t0 = Date.now();
  let lastErr = '';
  while (Date.now() - t0 < timeout) {
    const r = await S('Runtime.evaluate', { expression: `!!(${expr})`, returnByValue: true });
    if (r.result?.value) return;
    lastErr = r.exceptionDetails?.text || '';
    await sleep(120);
  }
  throw new Error(`timed out waiting for ${expr} ${lastErr}`);
}

// --virtual-time-budget does NOT advance a WebGL sim. Everything here waits on real frames and
// real elapsed time; nothing waits on virtual time.
export async function settle(S, frames = 45, timeout = 25000) {
  const start = await evalJSON(S, `window.__game.frames()`);
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const n = await evalJSON(S, `window.__game.frames()`);
    if (n - start >= frames) return n - start;
    await sleep(80);
  }
  return -1;
}

export async function evalJSON(S, expr) {
  const r = await S('Runtime.evaluate', { expression: `JSON.stringify(${expr})`, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value === undefined ? undefined : JSON.parse(r.result.value);
}

// Obligation T10. An isolation call written `X && X(...)` evaluates to `undefined` when the hook
// is absent: the scene is NEVER isolated, and the gate goes on to report a perfectly clean number
// measured on contaminated data. That is the project's dominant failure mode, so isolation is not
// allowed to be optional — a missing hook must abort the gate, never soften it.
export async function hook(S, name, ...args) {
  const argList = args.map(a => JSON.stringify(a)).join(', ');
  const expr = `JSON.stringify((() => {
    const g = window.__game, f = g && g[${JSON.stringify(name)}];
    if (typeof f !== 'function') return { missing: true, saw: typeof f };
    const v = f(${argList});
    return { missing: false, v: v === undefined ? null : v };
  })())`;
  const r = await S('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) {
    throw new Error(`T10: isolation hook __game.${name}(${argList}) threw — ` +
      (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  }
  const out = JSON.parse(r.result.value);
  if (out.missing) {
    throw new Error(`T10: isolation hook __game.${name} is MISSING (typeof ${out.saw}). ` +
      `The scene is not isolated, so any number this gate produces is measured on contaminated ` +
      `data. Aborting rather than reporting a clean-looking result.`);
  }
  return out.v;
}

// ── quiescing the city before a differencing measurement ───────────────────
// `settle(S, n)` waits n FRAMES. That is not the same thing as a stable world, and the difference
// has now cost this project two gates. §3.2.3's chunk pump does ~one work unit per frame under a
// 6 ms frame guard, and a 5x5 ring is 125 units — so after `settle(S, 40)` at a freshly-placed
// camera there can still be **126 chunks queued**, and over the next dozen samples 1,096 building
// instances arrive. Any gate that differences consecutive frames then attributes those arrivals to
// whatever it thought it was measuring.
//
// `cityStreamSig()` is the world's own identity: queue depth plus every instance count. `quiesce()`
// waits for the queue to reach zero AND the signature to stop moving for `stable` consecutive
// polls, and **throws** if that never happens — a precondition that cannot be met must abort the
// measurement, never be assumed (obligation T10's rule, applied to state rather than to a hook).
export const cityStreamSig = S => evalJSON(S, `(() => {
  const c = window.__state.city;
  return [c.queued, c.chunks, c.near, c.lod0, c.lod1, c.lod2, c.farChunks, c.aabbs].join('|');
})()`);

export async function quiesce(S, { timeout = 60000, stable = 3, label = 'city' } = {}) {
  const t0 = Date.now();
  let last = null, runs = 0, polls = 0;
  while (Date.now() - t0 < timeout) {
    const sig = await cityStreamSig(S);
    polls++;
    if (+sig.split('|')[0] === 0 && sig === last) {
      if (++runs >= stable) return { sig, ms: Date.now() - t0, polls };
    } else runs = 0;
    last = sig;
    await settle(S, 4);
  }
  throw new Error(`QUIESCE: the ${label} never went quiet within ${timeout} ms — last signature `
    + `[queued|chunks|near|lod0|lod1|lod2|far|aabbs] = ${last} after ${polls} polls. A differencing `
    + `measurement taken while chunks are still arriving measures the arrivals, not the effect `
    + `under test. Aborting rather than reporting a number from a moving world.`);
}

export async function listScenarios(S, base) {
  await S('Page.navigate', { url: `${base}/index.html` });
  await waitFor(S, `window.__ready`, 25000);
  return await evalJSON(S, `window.__game.scenarios.map(s=>s.id)`);
}

const near = (a, b) => typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-9 : JSON.stringify(a) === JSON.stringify(b);

// The committed shots/<id>.json IS the frozen camera. If the page and the file disagree, every
// score collected against that shot is measuring two different pictures.
function checkFrozen(id, live) {
  const f = resolve(ROOT, `shots/${id}.json`);
  if (!existsSync(f)) throw new Error(`shots/${id}.json is missing — the scenario definition is committed, not generated`);
  const disk = JSON.parse(readFileSync(f, 'utf8'));
  const drift = [];
  for (const k of ['seed', 'variant', 'clock', 'yaw', 'pitch', 'fov', 'craft', 'hud', 'ref', 'aspect']) {
    if (!near(disk[k], live[k])) drift.push(`${k}: file=${JSON.stringify(disk[k])} page=${JSON.stringify(live[k])}`);
  }
  if (!Array.isArray(disk.pos) || disk.pos.some((v, i) => !near(v, live.pos[i]))) {
    drift.push(`pos: file=${JSON.stringify(disk.pos)} page=${JSON.stringify(live.pos)}`);
  }
  if (drift.length) throw new Error(`scenario "${id}" drifted from shots/${id}.json:\n    ` + drift.join('\n    '));
}

async function main() {
  const ctx = await open({ w: W, h: H, dpr: DPR, mobile: !!args.mobile, headed: HEADED, sw: !!args.sw });
  const { S, base, close } = ctx;

  const shots = args.all ? await listScenarios(S, base) : [args.shot || 'fog_city'];
  mkdirSync(OUTDIR, { recursive: true });
  const results = [];

  for (const [i, shot] of shots.entries()) {
    const t0 = Date.now();
    if (shots.length > 1) process.stdout.write(`[${i + 1}/${shots.length}] ${shot} … `);
    logs.length = 0;

    const url = `${base}/index.html?shot=${encodeURIComponent(shot)}&dpr=${DPR}`
      + `${args.lite ? '&lite=1' : ''}${args.perf ? '&perf=1' : ''}${args.debug ? '&debug=1' : ''}`
      + `${args.hud ? '' : '&nohud'}&nosave${args.set ? '&' + args.set : ''}`;
    await S('Page.navigate', { url });
    await waitFor(S, `window.__ready`, 30000);

    // A typo used to render the default camera at a wall and write the PNG anyway. Every check
    // made that way is worthless and says so nowhere.
    const live = await evalJSON(S, `window.__game.scenarios.find(s=>s.id===${JSON.stringify(shot)}) || null`);
    if (!live) {
      const ids = await evalJSON(S, `window.__game.scenarios.map(s=>s.id)`);
      throw new Error(`unknown scenario "${shot}" — this page registered ${ids.join(', ')}`);
    }
    checkFrozen(shot, live);

    // §12.1 authors two shots at the aspect their PLATE CROP demands, not at 16:9 (obligation
    // T4), and compare.mjs hard-fails on a mismatch. The scenario carries that aspect, so unless
    // an explicit --h says otherwise the viewport is fitted to it here rather than left for
    // whoever types the command to remember.
    let w = W, h = H;
    if (!args.h && live.aspect) {
      h = Math.round(W / live.aspect);
      if (h !== H) {
        await ctx.setMetrics(w, h, DPR, !!args.mobile);
        await evalJSON(S, '(window.__game.resize(), 1)');
        await settle(S, 12);
      }
    }

    await settle(S, args.perf ? 180 : 45);

    const state = await evalJSON(S, `window.__state`);
    const { data } = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const png = resolve(OUTDIR, `${shot}.png`);
    writeFileSync(png, Buffer.from(data, 'base64'));

    const stats = {
      shot, ref: live.ref, aspect: live.aspect, variant: state.variant, clock: state.clock,
      quality: state.quality, dpr: +DPR, w, h, headed: HEADED, mobile: !!args.mobile,
      fps: state.fps, draws: state.draws, tris: state.tris, ms: state.ms,
      errors: state.errors, console: logs.slice(),
      at: new Date().toISOString(),
    };
    writeFileSync(resolve(OUTDIR, `${shot}.stats.json`), JSON.stringify(stats, null, 2));
    results.push({ shot, png, stats });

    for (const l of logs) console.log('  ' + l);
    console.log(`${shot}  ${state.fps.toFixed(0)}fps  frame ${state.ms.frame.toFixed(2)}ms (worst ${state.ms.worst.toFixed(2)})  `
      + `${state.draws} draws  ${(state.tris / 1000).toFixed(1)}k tris  ${state.errors.length} err  `
      + `${((Date.now() - t0) / 1000).toFixed(0)}s  → ${png}`);
  }

  await close();
  if (args.perf && !HEADED) console.warn('\n⚠ headless perf numbers are software/ANGLE — rerun with --headed for the budget gate');
  writeFileSync(resolve(OUTDIR, '_summary.json'), JSON.stringify(results, null, 2));
}

// A run that throws used to leave its browser and its profile dir behind. Enough of those and
// every timing on the machine is meaningless.
let PROC = null;
export function cleanup(proc) {
  const dir = `/tmp/neonhaul-cdp-${process.pid}`;
  try { (proc || PROC)?.kill(); } catch {}
  // Killing the spawned parent leaves chrome's renderer and GPU children alive, and they keep
  // rewriting the profile dir. Match on the dir so only this run's processes are touched.
  try { execSync(`pkill -f ${dir} 2>/dev/null; sleep 0.4`, { stdio: 'ignore', shell: '/bin/sh' }); } catch {}
  try { rmSync(dir, { recursive: true, force: true }); } catch {}
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => {
    console.error(e.message);
    for (const l of logs) console.error('  ' + l);
    cleanup();
    process.exit(1);
  });
}
