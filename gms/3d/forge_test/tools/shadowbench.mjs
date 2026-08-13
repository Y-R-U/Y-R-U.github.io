#!/usr/bin/env node
// Isolates the shadow pass cost. Headed only — headless is software-rendered.
//
//   node tools/shadowbench.mjs --preset=medium --w=844 --h=390 --dpr=1
//   node tools/shadowbench.mjs --shot=town_night --set=shadowRate=10hz
//
// Three numbers per scenario:
//   frameOn    whole-frame GPU p95 with the shadow map re-rendered every frame
//   frameOff   same, with renderer.shadowMap.autoUpdate = false (main pass untouched, so the
//              delta is purely the shadow pass)
//   passMs     direct EXT_disjoint_timer_query around shadowMap.render itself

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, createReadStream, statSync } from 'node:fs';
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
const W = +(args.w || 844), H = +(args.h || 390);
const PRESET = args.preset || 'medium';
const DPR = args.dpr || 1;
const SHOTS = args.shot ? String(args.shot).split(',') : ['wall_day', 'street_dusk', 'gate_night', 'town_night', 'creek_day'];

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

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function chrome() {
  const proc = spawn(CHROME, [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=/tmp/forge-bench-${process.pid}`,
    `--window-size=${W},${H}`, '--window-position=2400,80',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--ignore-gpu-blocklist', '--enable-gpu-rasterization',
  ], { stdio: 'ignore' });
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
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
}

const BENCH = `
window.__bench = null;
(async () => {
  const F = window.__forge, app = F.app, r = app.renderer, st = app.stats, gl = r.getContext();
  const wait = n => new Promise(res => { const s = F.frames();
    const t = () => (F.frames() - s > n ? res() : requestAnimationFrame(t)); requestAnimationFrame(t); });
  const grab = async (n) => { st.reset(); await wait(n); const s = F.stats();
    return { gpuP95: s.gpuP95, gpuMs: s.gpuMs, cpuP95: s.cpuP95, fps: s.fps,
             calls: s.calls, mainCalls: s.mainCalls, tris: s.tris, mainTris: s.mainTris }; };
  const N = __N__, R = __R__, RATES = __RATES__;
  const out = { rounds: [] };
  await wait(60);
  const med = a => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };

  if (RATES) {
    const per = {};
    for (const v of RATES) per[v] = [];
    for (let i = 0; i < R; i++) {
      for (const v of RATES) {
        const L = app.systems.find(s => s.stepShadow);
        L.stepShadow = v === 'frozen' ? () => {} : L.constructor.prototype.stepShadow;
        if (v === 'frozen') r.shadowMap.autoUpdate = false; else app.quality.set('shadowRate', v);
        per[v].push(await grab(N));
      }
    }
    out.rates = {};
    for (const v of RATES) out.rates[v] = { gpuMs: med(per[v].map(x => x.gpuMs)), gpuP95: med(per[v].map(x => x.gpuP95)),
      cpuP95: med(per[v].map(x => x.cpuP95)), all: per[v].map(x => +x.gpuMs.toFixed(2)) };
    window.__bench = out;
    return;
  }

  const wasAuto = r.shadowMap.autoUpdate;
  for (let i = 0; i < R; i++) {
    r.shadowMap.autoUpdate = true; r.shadowMap.needsUpdate = true;
    const on = await grab(N);
    r.shadowMap.autoUpdate = false;
    const off = await grab(N);
    out.rounds.push({ on, off });
  }
  r.shadowMap.autoUpdate = wasAuto; r.shadowMap.needsUpdate = true;
  out.on = { gpuP95: med(out.rounds.map(x => x.on.gpuP95)), gpuMs: med(out.rounds.map(x => x.on.gpuMs)),
             calls: out.rounds[0].on.calls, tris: out.rounds[0].on.tris,
             mainCalls: out.rounds[0].on.mainCalls, mainTris: out.rounds[0].on.mainTris,
             cpuP95: med(out.rounds.map(x => x.on.cpuP95)), fps: med(out.rounds.map(x => x.on.fps)) };
  out.off = { gpuP95: med(out.rounds.map(x => x.off.gpuP95)), gpuMs: med(out.rounds.map(x => x.off.gpuMs)),
              cpuP95: med(out.rounds.map(x => x.off.cpuP95)), fps: med(out.rounds.map(x => x.off.fps)) };
  out.deltaAvg = med(out.rounds.map(x => x.on.gpuMs - x.off.gpuMs));
  out.deltaP95 = med(out.rounds.map(x => x.on.gpuP95 - x.off.gpuP95));

  const ext = st.ext;
  if (ext) {
    st.ext = null;
    const sm = r.shadowMap, orig = sm.render;
    const samples = [], q = [];
    sm.render = function (...a) {
      let h = null;
      if (q.length < 3) { h = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, h); }
      orig.apply(this, a);
      if (h) { gl.endQuery(ext.TIME_ELAPSED_EXT); q.push(h); }
      while (q.length) {
        const p = q[0];
        if (!gl.getQueryParameter(p, gl.QUERY_RESULT_AVAILABLE)) break;
        q.shift();
        if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) samples.push(gl.getQueryParameter(p, gl.QUERY_RESULT) / 1e6);
        gl.deleteQuery(p);
      }
    };
    await wait(N);
    sm.render = orig; st.ext = ext;
    samples.sort((a, b) => a - b);
    const at = f => samples.length ? samples[Math.min(samples.length - 1, Math.floor(samples.length * f))] : 0;
    out.pass = { n: samples.length, med: at(0.5), p95: at(0.95),
                 avg: samples.reduce((a, b) => a + b, 0) / (samples.length || 1) };
  }
  window.__bench = out;
})();
`;

// Drives the frame loop by hand at a fixed dt while yawing the camera, so two runs at different
// shadow rates land on identical frames. Reports the slack between the view frustum's bounding
// sphere and the fitted shadow volume — negative means shadows are being clipped.
const SWING = `
window.__swing = (() => {
  const F = window.__forge, app = F.app, T = F.three;
  cancelAnimationFrame(app.raf); app.raf = 0;
  const cam = app.camera, d = new T.Vector3(), c = new T.Vector3();
  const L = app.systems.find(s => s.fitShadow);
  const probe = () => {
    L.shadowCentre(app, c);
    const r = L.fitRadius, sc = L.key.shadow.camera;
    return sc.right - (L.key.target.position.distanceTo(c) + r);
  };
  return (dt, yaw) => {
    cam.getWorldDirection(d);
    const ca = Math.cos(yaw), sa = Math.sin(yaw);
    const nx = d.x * ca + d.z * sa, nz = -d.x * sa + d.z * ca;
    cam.lookAt(cam.position.x + nx, cam.position.y + d.y, cam.position.z + nz);
    app.stats.beginFrame();
    app.renderer.info.reset();
    for (const s of app.systems) if (s.update) s.update(dt, app);
    if (app.renderPath) app.renderPath(); else app.renderer.render(app.scene, app.camera);
    app.stats.endFrame(dt);
    app.frames = (app.frames || 0) + 1;
    return probe();
  };
})();
`;

async function swing() {
  const server = await serve();
  const { proc, ws } = await chrome();
  const cdp = new CDP(ws);
  await cdp.connect();
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => cdp.send(m, p, sessionId);
  await S('Page.enable'); await S('Runtime.enable');
  await S('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: +DPR, mobile: false });

  const OUT = resolve(ROOT, args.outdir || 'shots/swing');
  mkdirSync(OUT, { recursive: true });
  const deg = +(args.deg || 90), steps = +(args.steps || 24), at = String(args.at || '5,11,17,23').split(',').map(Number);
  const tag = args.tag || 'swing';

  for (const shot of SHOTS) {
    await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html?shot=${shot}&preset=${PRESET}&dpr=${DPR}${args.set ? '&' + args.set : ''}` });
    await waitFor(S, `window.__forge && window.__forge.ready`, 20000);
    await sleep(1500);
    await S('Runtime.evaluate', { expression: SWING });
    let worst = Infinity;
    for (let i = 0; i < steps; i++) {
      const slack = await evalJSON(S, `window.__swing(1/60, ${(deg * Math.PI / 180 / 60).toFixed(8)})`);
      worst = Math.min(worst, slack);
      if (at.includes(i)) {
        const { data } = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        writeFileSync(resolve(OUT, `${shot}_${tag}_${String(i).padStart(2, '0')}.png`), Buffer.from(data, 'base64'));
      }
    }
    console.log(`${shot.padEnd(12)} ${deg}deg/s, ${steps} frames -> worst frustum slack ${worst.toFixed(2)} m ${worst < 0 ? '  ** CLIPPING **' : ''}`);
  }

  await S('Browser.close').catch(() => {});
  proc.kill();
  server.close();
}

async function main() {
  if (args.swing) return swing();
  const server = await serve();
  const { proc, ws } = await chrome();
  const cdp = new CDP(ws);
  await cdp.connect();
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => cdp.send(m, p, sessionId);
  await S('Page.enable'); await S('Runtime.enable');
  await S('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: +DPR, mobile: false });

  const results = {};
  for (const shot of SHOTS) {
    const url = `http://127.0.0.1:${PORT}/index.html?shot=${shot}&preset=${PRESET}&dpr=${DPR}${args.set ? '&' + args.set : ''}`;
    await S('Page.navigate', { url });
    await waitFor(S, `window.__forge && window.__forge.ready`, 20000);
    if (args.js) {
      const r = await S('Runtime.evaluate', { expression: args.js, returnByValue: true });
      if (r.exceptionDetails) throw new Error('--js: ' + JSON.stringify(r.exceptionDetails));
      console.log('  js:', JSON.stringify(r.result.value));
    }
    await S('Runtime.evaluate', { expression: BENCH.replace('__N__', String(+(args.frames || 150)))
      .replace('__R__', String(+(args.rounds || 4)))
      .replace('__RATES__', args.rates ? JSON.stringify(String(args.rates).split(',')) : 'null') });
    await waitFor(S, `window.__bench`, 300000);
    const r = await evalJSON(S, `window.__bench`);
    results[shot] = r;
    if (r.rates) {
      console.log(shot.padEnd(12) + Object.entries(r.rates)
        .map(([k, v]) => `${k} ${f(v.gpuMs)}/${f(v.gpuP95)}`).join('   '));
      continue;
    }
    console.log(`${shot.padEnd(12)} gpu avg ${f(r.on.gpuMs)} -> ${f(r.off.gpuMs)}  (delta ${f(r.deltaAvg)})   p95 ${f(r.on.gpuP95)} -> ${f(r.off.gpuP95)}  (delta ${f(r.deltaP95)})` +
      (r.pass ? `   direct med ${f(r.pass.med)} avg ${f(r.pass.avg)}` : '') +
      `   [${r.on.tris} tris ${r.on.calls} calls / main ${r.on.mainTris} ${r.on.mainCalls}]`);
    console.log('   rounds: ' + r.rounds.map(x => `${f(x.on.gpuMs)}/${f(x.off.gpuMs)}`).join('  '));
  }

  mkdirSync(resolve(ROOT, 'shots'), { recursive: true });
  const outFile = resolve(ROOT, args.out || 'shots/_shadowbench.json');
  writeFileSync(outFile, JSON.stringify({ preset: PRESET, w: W, h: H, dpr: +DPR, set: args.set || null, results }, null, 2));
  console.log('->', outFile);

  await S('Browser.close').catch(() => {});
  proc.kill();
  server.close();
}

const f = n => (n == null ? '—' : n.toFixed(2));

async function waitFor(S, expr, timeout) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const r = await S('Runtime.evaluate', { expression: `!!(${expr})`, returnByValue: true });
    if (r.result.value) return;
    await sleep(150);
  }
  throw new Error(`timed out waiting for ${expr}`);
}

async function evalJSON(S, expr) {
  const r = await S('Runtime.evaluate', { expression: `JSON.stringify(${expr})`, returnByValue: true });
  return JSON.parse(r.result.value);
}

main().catch(e => { console.error(e); process.exit(1); });
