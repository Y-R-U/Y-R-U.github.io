// PERF lane: headless performance audit of the real game.
//   ~/.claude/bin/cdp start --port 9551 -- --use-angle=metal
//   node tools/perf.mjs [--only=boot,matrix,forced,throttled,profile,governor,uploads,calls,heap] [--quick] [--port=9551]
//   ~/.claude/bin/cdp stop 9551
// Boots ?start=free&auto=1 as an Android phone (390×844 DPR 3 and 844×390), taps once so the AudioContext runs, locks
// each renderer tier and view, teleports the player to five moments and records per-frame renderer.info (main + shadow
// pass), CPU time of the rAF callbacks / render() / shadow pass, GPU time (EXT_disjoint_timer_query_webgl2), GL upload
// bytes, forced-layout reads, style/layout, Web Audio automation calls, heap. Plus: boot timing + bytes + world-build
// breakdown (1× and 4× CPU), settings-forced tiers, 4× CPU throttle (≈ phone), 5 s CPU profiles by file and by inclusive
// game function, the D6 governor over 60 s, which buffers/textures re-upload every frame, draw calls by owner, and
// allocation churn + retained heap after forced GCs. Full run ≈ 25 min.
// Output: docs/shots/perf/perf-<stamp>.json (+ latest.json) and markdown tables on stdout. See docs/PERF.md.
// Headless numbers on an M5 are indicative only; counts, ratios and the 4× column are what transfer.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'docs', 'shots', 'perf');
mkdirSync(OUT, { recursive: true });
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] ?? d;
const PORT = +arg('port', 9551);
const BASE = arg('url', 'http://localhost:8888/gms/3d/krayzee/');
const QUICK = process.argv.includes('--quick');
const ONLY = arg('only', 'boot,matrix,forced,profile,governor,throttled,uploads,heap,calls').split(',');
const UA = 'Mozilla/5.0 (Linux; Android 14; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const TIERS = ['low', 'medium', 'high'];
const VIEWS = ['chase', 'center', 'cockpit'];
const ORIENT = { portrait: [390, 844], landscape: [844, 390] };
// Active runway is 27 (default wind 240). Village ≈ (-80,-1550), castle (780,-2300).
const MOMENTS = {
  runway: { x: 650, z: 0, heading: 270, speedKt: 0 },
  climb: { x: -900, z: 0, alt: 150, heading: 270, speedKt: 75 },
  downwind: { x: -600, z: 600, alt: 300, heading: 20, speedKt: 95 },
  final: { x: 2200, z: 0, alt: 80, heading: 270, speedKt: 68, flaps: 1 },
  apron: { x: -106, z: -212, heading: 180, speedKt: 0 },
};

// ---------------- CDP plumbing ----------------
let ws, seq = 0;
const pending = new Map(), listeners = [];
async function connect() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  let page = list.find((t) => t.type === 'page');
  if (!page) page = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const { r, j } = pending.get(d.id); pending.delete(d.id); d.error ? j(new Error(d.error.message)) : r(d.result); }
    else if (d.method) for (const l of listeners) l(d);
  };
}
const send = (method, params = {}) => new Promise((r, j) => { const id = ++seq; pending.set(id, { r, j }); ws.send(JSON.stringify({ id, method, params })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
const errors = [];
listeners.push((d) => {
  if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
  if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push(d.params.args.map((a) => a.value ?? a.description).join(' '));
});

// Installed before any page script: rAF callback timing, GL upload counters, long tasks, boot milestones.
const INIT = `(() => {
  const P = window.__perf = { cb: [], up: { tex: 0, texBytes: 0, mip: 0, buf: 0, bufBytes: 0 }, lt: [], readyAt: null, firstFrame: null, fcp: null };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => { const s = performance.now(); try { cb(t); } finally { if (P.rec) P.cb.push(t, performance.now() - s); } });
  (function watch() { raf(() => { if (window.__krayzeeReady) { if (P.readyAt == null) P.readyAt = performance.now(); else if (P.firstFrame == null) { P.firstFrame = performance.now(); return; } } watch(); }); })();
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) P.lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') P.fcp = e.startTime; }).observe({ type: 'paint', buffered: true }); } catch (e) {}
  const u = P.up;
  // Web Audio automation and layout-forcing reads, counted with their wall time
  P.au = { n: 0, ms: 0 }; P.lay = { n: 0, ms: 0 };
  const AP = window.AudioParam && AudioParam.prototype;
  if (AP) {
    for (const k of ['setTargetAtTime', 'setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'cancelScheduledValues']) {
      const o = AP[k]; AP[k] = function (...a) { const s = performance.now(); try { return o.apply(this, a); } finally { P.au.n++; P.au.ms += performance.now() - s; } };
    }
    const d = Object.getOwnPropertyDescriptor(AP, 'value');
    if (d && d.set) Object.defineProperty(AP, 'value', { get: d.get, set(v) { const s = performance.now(); try { d.set.call(this, v); } finally { P.au.n++; P.au.ms += performance.now() - s; } }, configurable: true });
  }
  for (const [obj, k] of [[window, 'innerWidth'], [window, 'innerHeight']]) {
    const d = Object.getOwnPropertyDescriptor(obj, k) || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(obj), k);
    if (d && d.get) Object.defineProperty(obj, k, { get() { const s = performance.now(); try { return d.get.call(this); } finally { P.lay.n++; P.lay.ms += performance.now() - s; } }, configurable: true });
  }
  { const o = Element.prototype.getBoundingClientRect; Element.prototype.getBoundingClientRect = function () { const s = performance.now(); try { return o.call(this); } finally { P.lay.n++; P.lay.ms += performance.now() - s; } }; }
  const px = (a) => { for (const x of a) if (x && typeof x === 'object') { if (ArrayBuffer.isView(x)) return x.byteLength; if ('width' in x && 'height' in x) return (x.width * x.height * 4) | 0; } return 0; };
  for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
    if (!C) continue;
    const p = C.prototype;
    for (const k of ['texImage2D', 'texSubImage2D', 'texImage3D', 'texSubImage3D', 'compressedTexImage2D']) {
      const o = p[k]; if (!o) continue;
      p[k] = function (...a) { u.tex++; let b = px(a); if (!b && typeof a[3] === 'number' && typeof a[4] === 'number' && k === 'texImage2D') b = a[3] * a[4] * 4; u.texBytes += b; return o.apply(this, a); };
    }
    const gm = p.generateMipmap; p.generateMipmap = function (...a) { u.mip++; return gm.apply(this, a); };
    for (const k of ['bufferData', 'bufferSubData']) {
      const o = p[k];
      p[k] = function (...a) {
        u.buf++;
        const d = k === 'bufferData' ? a[1] : a[2];
        if (d && typeof d === 'object' && d.byteLength != null) {
          const bpe = d.BYTES_PER_ELEMENT || 1;
          const so = a[3] || 0, len = a[4];
          u.bufBytes += len ? len * bpe : d.byteLength - so * bpe;
        }
        return o.apply(this, a);
      };
    }
  }
})();`;

// Installed after boot: wraps render() and shadowMap.render() for CPU time, info and GPU timer segments.
const PROBE = `(() => {
  if (window.__probe) return { ext: window.__probe.ext };
  const R = __game.renderer, r = R.renderer, gl = r.getContext(), info = r.info;
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const PR = window.__probe = { ext: !!ext, frames: [], on: false };
  let cur = null, q = null;
  const pend = [];
  const qBegin = (kind) => { if (!ext || !PR.on) return; q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); cur.q.push([kind, q]); };
  const qEnd = () => { if (q) { gl.endQuery(ext.TIME_ELAPSED_EXT); q = null; } };
  const sm = r.shadowMap, sr = sm.render;
  sm.render = function (...a) {
    if (!cur) return sr.apply(this, a);
    qEnd(); qBegin('s');
    const c0 = info.render.calls, t0 = info.render.triangles, s = performance.now();
    sr.apply(this, a);
    cur.sCpu += performance.now() - s; cur.sCalls += info.render.calls - c0; cur.sTris += info.render.triangles - t0;
    qEnd(); qBegin('m');
    return undefined;
  };
  const rr = r.render;
  r.render = function (scene, camera) {
    PR.scene = scene;
    cur = { q: [], sCpu: 0, sCalls: 0, sTris: 0 };
    qBegin('m');
    const s = performance.now();
    rr.call(this, scene, camera);
    const cpu = performance.now() - s;
    qEnd();
    if (PR.on) {
      const f = { cpu, sCpu: cur.sCpu, calls: info.render.calls, tris: info.render.triangles, pts: info.render.points, lines: info.render.lines,
        sCalls: cur.sCalls, sTris: cur.sTris, gpuM: null, gpuS: null };
      if (cur.q.length) pend.push([f, cur.q]);
      PR.frames.push(f);
    }
    cur = null;
    if (ext) {
      const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
      for (let i = pend.length - 1; i >= 0; i--) {
        const [f, qs] = pend[i];
        if (!qs.every(([, x]) => gl.getQueryParameter(x, gl.QUERY_RESULT_AVAILABLE))) continue;
        if (!disjoint) { f.gpuM = 0; f.gpuS = 0; for (const [k, x] of qs) { const ns = gl.getQueryParameter(x, gl.QUERY_RESULT); if (k === 'm') f.gpuM += ns / 1e6; else f.gpuS += ns / 1e6; } }
        for (const [, x] of qs) gl.deleteQuery(x);
        pend.splice(i, 1);
      }
    }
  };
  // Tier lock: the governor's own R.setQuality calls are recorded, not applied.
  const set = R.setQuality;
  PR.blocked = [];
  R.setQuality = (t) => { if (PR.allow) set(t); else PR.blocked.push(t); };
  PR.setTier = (t) => { PR.allow = true; try { set(t); } finally { PR.allow = false; } };
  return { ext: PR.ext };
})()`;

// ---------------- helpers ----------------
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; };
const med = (a) => pct(a, 0.5);
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100);

async function setDevice(orient, { mobile = true, dpr = 3 } = {}) {
  const [w, h] = ORIENT[orient] || orient;
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile, screenOrientation: { type: w > h ? 'landscapePrimary' : 'portraitPrimary', angle: w > h ? 90 : 0 } });
  await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 5 });
  await send('Emulation.setUserAgentOverride', { userAgent: mobile ? UA : '' });
}

const net = { on: false, req: new Map(), bytes: 0, list: [] };
listeners.push((d) => {
  if (!net.on) return;
  if (d.method === 'Network.responseReceived') net.req.set(d.params.requestId, { url: d.params.response.url, type: d.params.type, mime: d.params.response.mimeType });
  if (d.method === 'Network.loadingFinished') {
    const r = net.req.get(d.params.requestId) || { url: '?', type: '?' };
    net.bytes += d.params.encodedDataLength;
    net.list.push({ ...r, bytes: d.params.encodedDataLength });
  }
});

async function load(query, { waitReady = true, timeout = 60000 } = {}) {
  errors.length = 0;
  await send('Page.navigate', { url: BASE + query });
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    await sleep(250);
    try { if (await ev('!!(window.__krayzeeReady && window.__game && (!' + waitReady + ' || window.__game.state().mode === "play"))')) return Date.now() - t0; } catch (e) { /* navigating */ }
  }
  throw new Error('boot timed out: ' + query + ' ' + errors.slice(0, 3).join(' | '));
}

async function metrics() {
  const m = (await send('Performance.getMetrics')).metrics;
  return Object.fromEntries(m.map((x) => [x.name, x.value]));
}

// One measured window: frames of the probe + rAF callback times + uploads + layout counters.
async function measure(ms = 1500) {
  await ev(`(() => { const P = window.__perf; P.cb.length = 0; P.rec = true; P.au.n = P.au.ms = P.lay.n = P.lay.ms = 0; Object.assign(P.up, { tex: 0, texBytes: 0, mip: 0, buf: 0, bufBytes: 0 }); __probe.frames.length = 0; __probe.on = true; })()`);
  const m0 = await metrics();
  await sleep(ms);
  const m1 = await metrics();
  const d = await ev(`(() => { const P = window.__perf; P.rec = false; __probe.on = false;
    return { cb: P.cb.slice(), up: { ...P.up }, au: { ...P.au }, lay: { ...P.lay }, frames: __probe.frames.slice(),
      mem: { ...__game.renderer.renderer.info.memory, programs: (__game.renderer.renderer.info.programs || []).length },
      dpr: __game.renderer.renderer.getPixelRatio(), size: [__game.renderer.renderer.domElement.width, __game.renderer.renderer.domElement.height],
      quality: __game.quality, state: (() => { const s = __game.state(); return { view: s.view, p: s.player && { x: s.player.x, z: s.player.z, alt: s.player.alt, agl: s.player.agl, phase: s.player.phase } }; })() }; })()`);
  // rAF callbacks: several per frame (game loop, UI, our watcher) → group by timestamp
  const byT = new Map();
  for (let i = 0; i < d.cb.length; i += 2) byT.set(d.cb[i], (byT.get(d.cb[i]) || 0) + d.cb[i + 1]);
  const ts = [...byT.keys()].sort((a, b) => a - b), cbms = ts.map((t) => byT.get(t));
  const dts = ts.slice(1).map((t, i) => t - ts[i]);
  const F = d.frames, n = Math.max(1, F.length);
  const gm = F.map((f) => f.gpuM).filter((x) => x != null), gs = F.map((f) => f.gpuS).filter((x) => x != null);
  const dm = (k) => m1[k] - m0[k];
  return {
    frames: F.length,
    fps: r1(dts.length ? 1000 / (dts.reduce((a, b) => a + b, 0) / dts.length) : 0),
    dtP95: r1(pct(dts, 0.95)), dtMax: r1(Math.max(0, ...dts)),
    frameCpu: r2(med(cbms)), frameCpuP95: r2(pct(cbms, 0.95)), frameCpuMax: r2(Math.max(0, ...cbms)),
    renderCpu: r2(med(F.map((f) => f.cpu))), shadowCpu: r2(med(F.map((f) => f.sCpu))),
    calls: med(F.map((f) => f.calls)), callsMax: Math.max(0, ...F.map((f) => f.calls)), tris: med(F.map((f) => f.tris)),
    shadowCalls: med(F.map((f) => f.sCalls)), shadowTris: med(F.map((f) => f.sTris)), points: med(F.map((f) => f.pts)),
    gpuMain: r2(med(gm)), gpuShadow: r2(med(gs)), gpuP95: r2(pct(gm.map((x, i) => x + (gs[i] || 0)), 0.95)),
    upTexPerFrame: r2(d.up.tex / n), upTexKBPerFrame: r1(d.up.texBytes / n / 1024), mipPerFrame: r2(d.up.mip / n),
    upBufPerFrame: r2(d.up.buf / n), upBufKBPerFrame: r1(d.up.bufBytes / n / 1024),
    audioOpsPerFrame: r1(d.au.n / n), audioMsPerFrame: r2(d.au.ms / n), layoutReadsPerFrame: r1(d.lay.n / n), layoutReadMsPerFrame: r2(d.lay.ms / n),
    layoutsPerFrame: r2(dm('LayoutCount') / n), styleRecalcsPerFrame: r2(dm('RecalcStyleCount') / n),
    layoutMsPerFrame: r2(dm('LayoutDuration') * 1000 / n), styleMsPerFrame: r2(dm('RecalcStyleDuration') * 1000 / n),
    scriptMsPerFrame: r2(dm('ScriptDuration') * 1000 / n), taskMsPerFrame: r2(dm('TaskDuration') * 1000 / n),
    heapMB: r1(m1.JSHeapUsedSize / 1048576), heapDeltaKB: Math.round(dm('JSHeapUsedSize') / 1024),
    textures: d.mem.textures, geometries: d.mem.geometries, programs: d.mem.programs, drawBuffer: d.size, dpr: d.dpr,
    tier: d.quality?.tier, at: d.state.p,
  };
}

// A real tap = user activation, so the AudioContext runs as on a phone after the first touch. Without it the context stays
// suspended, currentTime freezes and every per-frame setTargetAtTime piles onto one instant (audio cost grows without bound).
async function unlockAudio() {
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: 195, y: 300, button: 'left', clickCount: 1 });
  await sleep(300);
  return ev(`import('${BASE}js/audio/index.js').then((m) => m.isUnlocked())`);
}
async function setup(orient, query, { audio = true } = {}) {
  await setDevice(orient);
  const bootMs = await load(query);
  const p = await ev(PROBE);
  const audioOn = audio ? await unlockAudio() : false;
  await sleep(1500);
  return { bootMs, gpuTimer: p.ext, audioOn };
}
const setTier = (t) => ev(`__probe.setTier(${JSON.stringify(t)})`);
const setView = (v) => ev(`__game.setView(${JSON.stringify(v)})`);
const teleport = (m) => ev(`__game.teleport(${JSON.stringify(MOMENTS[m])})`);
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 70 });
  writeFileSync(join(OUT, name + '.jpg'), Buffer.from(r.data, 'base64'));
}

// ---------------- sections ----------------
const result = { when: new Date().toISOString(), base: BASE, ua: UA, notes: [] };

async function boot() {
  const out = {};
  for (const throttle of QUICK ? [1] : [1, 4]) {
    await setDevice('portrait');
    await send('Emulation.setCPUThrottlingRate', { rate: throttle });
    net.on = true; net.req.clear(); net.bytes = 0; net.list = [];
    const t0 = Date.now();
    await load('?noaccount=1', { waitReady: false, timeout: 120000 });
    // wait for the first rendered frame after ready
    for (let i = 0; i < 40 && !(await ev('window.__perf.firstFrame != null')); i++) await sleep(250);
    await sleep(1500);
    net.on = false;
    const p = await ev(`(() => { const P = window.__perf, n = performance.getEntriesByType('navigation')[0];
      return { fcp: P.fcp, readyAt: P.readyAt, firstFrame: P.firstFrame, dcl: n && n.domContentLoadedEventEnd, lt: P.lt.slice(), heapMB: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null }; })()`);
    const lt = p.lt.sort((a, b) => b[1] - a[1]);
    const byType = {};
    for (const r of net.list) { const k = r.type || '?'; byType[k] = (byType[k] || 0) + r.bytes; }
    out['x' + throttle] = {
      wallMs: Date.now() - t0, fcpMs: r1(p.fcp), dclMs: r1(p.dcl), readyMs: r1(p.readyAt), firstMenuFrameMs: r1(p.firstFrame),
      longTasks: lt.slice(0, 8), longTaskTotalMs: lt.reduce((a, b) => a + b[1], 0), heapMB: r1(p.heapMB),
      requests: net.list.length, bytes: net.bytes, bytesByType: byType,
    };
    if (throttle === 1) {
      // what GitHub Pages would send (gzip) — fetch every resource ourselves
      let raw = 0, gz = 0;
      const files = [];
      for (const r of net.list) {
        if (!r.url.startsWith('http')) continue;
        try {
          const b = Buffer.from(await (await fetch(r.url)).arrayBuffer());
          const z = /\.(js|css|html|json|svg|txt|mjs)(\?|$)/.test(r.url) || /javascript|json|css|html|svg/.test(r.mime || '') ? gzipSync(b).length : b.length;
          raw += b.length; gz += z; files.push({ url: r.url.replace(BASE, '').replace(/^http:\/\/localhost:8888\//, '/'), raw: b.length, gz: z });
        } catch (e) { /* */ }
      }
      files.sort((a, b) => b.raw - a.raw);
      out.download = { raw, gzip: gz, files: files.length, top: files.slice(0, 15) };
    }
    // world build breakdown (builds a throwaway copy into a detached scene, same renderer)
    out['x' + throttle].worldBuild = {};
    for (const q of QUICK ? ['low'] : ['low', 'high']) {
      await send('Profiler.enable');
      await send('Profiler.setSamplingInterval', { interval: 250 });
      await send('Profiler.start');
      const t = await ev(`(async () => { const THREE = await import('three'); const { buildWorld } = await import('${BASE}js/world/airport.js');
        const s = new THREE.Scene(); const t0 = performance.now(); const w = await buildWorld(s, __game.renderer.renderer, { quality: '${q}' });
        const total = performance.now() - t0;
        const tp0 = performance.now(); const { createPlane } = await import('${BASE}js/plane/index.js'); const rig = await createPlane({ type: 'c172', quality: '${q === 'low' ? 'low' : 'high'}', cockpit: true });
        const plane = performance.now() - tp0; rig.dispose?.();
        s.traverse((o) => { o.geometry?.dispose?.(); });
        return { total: Math.round(total), plane: Math.round(plane), ...w.debug.timings, treeCount: w.treeStats().total }; })()`);
      const prof = (await send('Profiler.stop')).profile;
      t.byFile = byFile(prof, 8);
      out['x' + throttle].worldBuild[q] = t;
    }
    await send('Emulation.setCPUThrottlingRate', { rate: 1 });
  }
  return out;
}

function byFile(profile, top = 12) {
  const self = new Map(), fn = new Map();
  const id2 = new Map(profile.nodes.map((n) => [n.id, n]));
  const dt = new Map();
  for (let i = 0; i < profile.samples.length; i++) dt.set(profile.samples[i], (dt.get(profile.samples[i]) || 0) + (profile.timeDeltas[i] || 0));
  let total = 0;
  for (const [id, us] of dt) {
    const n = id2.get(id); if (!n) continue;
    const cf = n.callFrame;
    let f = cf.url ? cf.url.replace(/^.*\/gms\/3d\/krayzee\//, '').replace(/^.*\/gms\/lib\/three\/[^/]+\//, 'three/').replace(/\?.*$/, '') : cf.functionName || '(native)';
    if (f === '(idle)' || f === '(program)') { /* keep */ }
    self.set(f, (self.get(f) || 0) + us);
    const fk = `${cf.functionName || '(anon)'} ${f}:${cf.lineNumber + 1}`;
    fn.set(fk, (fn.get(fk) || 0) + us);
    total += us;
  }
  const busy = total - (self.get('(idle)') || 0);
  const rows = [...self].filter(([k]) => k !== '(idle)').sort((a, b) => b[1] - a[1]).slice(0, top).map(([k, us]) => [k, r1(us / 1000), r1(100 * us / Math.max(1, busy))]);
  const fns = [...fn].filter(([k]) => !k.startsWith('(idle)')).sort((a, b) => b[1] - a[1]).slice(0, top).map(([k, us]) => [k, r1(us / 1000)]);
  // inclusive time per game/three function (self + callees), so "who owns the frame" is visible, not just leaf natives
  const kids = new Map(profile.nodes.map((n) => [n.id, n.children || []]));
  const incl = new Map(), memo = new Map();
  const tot = (id) => { if (memo.has(id)) return memo.get(id); let t = dt.get(id) || 0; for (const c of kids.get(id)) t += tot(c); memo.set(id, t); return t; };
  const seen = (id, k, stack) => stack.includes(k);
  const walk = (id, stack) => {
    const n = id2.get(id), cf = n.callFrame;
    const f = (cf.url || '').replace(/^.*\/gms\/3d\/krayzee\//, '').replace(/^.*\/gms\/lib\/three\/[^/]+\//, 'three/').replace(/\?.*$/, '');
    const k = f ? `${cf.functionName || '(anon)'} ${f}:${cf.lineNumber + 1}` : null;
    if (k && f.startsWith('js/') && !seen(id, k, stack)) incl.set(k, (incl.get(k) || 0) + tot(id));
    for (const c of kids.get(id)) walk(c, k ? [...stack, k] : stack);
  };
  walk(profile.nodes[0].id, []);
  const inclusive = [...incl].sort((a, b) => b[1] - a[1]).slice(0, top + 8).map(([k, us]) => [k, r1(us / 1000)]);
  return { totalMs: r1(total / 1000), busyMs: r1(busy / 1000), files: rows, functions: fns, inclusive };
}

async function matrix({ orients = ['portrait', 'landscape'], tiers = TIERS, views = VIEWS, moments = Object.keys(MOMENTS), query = '?start=free&auto=1&noaccount=1', label = 'auto-content', tierLock = true, shots = true } = {}) {
  const rows = [];
  for (const o of orients) {
    const s = await setup(o, query);
    result.gpuTimer = s.gpuTimer; result.audioOn = s.audioOn;
    for (const t of tiers) {
      if (tierLock) { await setTier(t); await sleep(800); }
      for (const v of views) {
        await setView(v);
        for (const m of moments) {
          await teleport(m);
          await sleep(1100);
          const r = await measure(QUICK ? 900 : 1500);
          rows.push({ set: label, orient: o, tier: t, view: v, moment: m, ...r });
          process.stdout.write(`${label} ${o} ${t} ${v} ${m}: ${r.calls} calls (${r.shadowCalls} sh) ${Math.round(r.tris / 1000)}k tris, cpu ${r.frameCpu}ms render ${r.renderCpu} gpu ${r.gpuMain}+${r.gpuShadow}\n`);
          if (shots && t === tiers[0]) await shot(`${label}_${o}_${t}_${v}_${m}`);
        }
      }
    }
  }
  return rows;
}

async function profile({ throttle = 1 } = {}) {
  const out = { throttle };
  await setup('portrait', '?start=free&auto=1&noaccount=1');
  await send('Emulation.setCPUThrottlingRate', { rate: throttle });
  await send('Profiler.enable');
  await send('Profiler.setSamplingInterval', { interval: 200 });
  for (const t of TIERS) {
    await setTier(t);
    await setView('chase');
    await teleport('climb');
    await sleep(1500);
    await send('Profiler.start');
    // fly a real segment: climb-out then downwind so tree LOD refreshes and town LOD run as in play
    await sleep(2500);
    await teleport('downwind');
    await sleep(2500);
    const prof = (await send('Profiler.stop')).profile;
    out[t] = byFile(prof, 14);
  }
  await send('Emulation.setCPUThrottlingRate', { rate: 1 });
  return out;
}

async function governor({ throttle = 1, secs = 60, orient = 'portrait' } = {}) {
  await setDevice(orient);
  await send('Emulation.setCPUThrottlingRate', { rate: throttle });
  await load('?start=free&auto=1&noaccount=1', { timeout: 120000 });
  await unlockAudio();
  const samples = [];
  const t0 = Date.now();
  let lastHeap = null, gcDrops = 0, alloc = 0;
  while (Date.now() - t0 < secs * 1000) {
    const s = await ev(`({ q: __game.quality, heap: performance.memory.usedJSHeapSize, info: { calls: __game.renderer.renderer.info.render.calls, tris: __game.renderer.renderer.info.render.triangles }, p: __game.state().player })`);
    if (lastHeap != null) { const d = s.heap - lastHeap; if (d < 0) gcDrops++; else alloc += d; }
    lastHeap = s.heap;
    samples.push({ t: Math.round((Date.now() - t0) / 100) / 10, tier: s.q.tier, fps: s.q.fps, heapMB: r1(s.heap / 1048576), calls: s.info.calls, tris: s.info.tris, phase: s.p?.phase, alt: s.p?.alt });
    await sleep(1000);
  }
  const q = await ev('__game.quality');
  await send('Emulation.setCPUThrottlingRate', { rate: 1 });
  return { throttle, secs, final: q.tier, history: q.history, samples, heapStartMB: samples[0]?.heapMB, heapEndMB: samples.at(-1)?.heapMB, gcDrops, allocKBps: Math.round(alloc / 1024 / secs) };
}

// Who re-uploads geometry every frame: uploads happen inside render(), so instead of stacks we watch every
// BufferAttribute's version across 120 frames and name the owning mesh (path of names up the scene graph).
async function uploads() {
  const out = {};
  for (const [label, q, tier] of [['auto', '', 'low'], ['forced-high', '&quality=high', 'high']]) {
  await setup('portrait', '?start=free&auto=1&noaccount=1' + q);
  for (const view of ['chase', 'cockpit']) {
    await setTier(tier); await setView(view); await teleport('downwind'); await sleep(1500);
    out[label + ' ' + view] = await ev(`new Promise((done) => {
      const scene = __probe.scene;
      const name = (o) => { const p = []; for (let x = o; x && p.length < 4; x = x.parent) if (x.name) p.push(x.name); return (p.reverse().join('/') || o.type) + (o.isInstancedMesh ? '[inst]' : ''); };
      const attrs = () => { const m = new Map(); scene.traverse((o) => { if (!o.geometry) return;
        for (const k in o.geometry.attributes) { const at = o.geometry.attributes[k]; if (!m.has(at)) m.set(at, [name(o) + ' .' + k, at.version]); }
        if (o.instanceMatrix && !m.has(o.instanceMatrix)) m.set(o.instanceMatrix, [name(o) + ' .instanceMatrix', o.instanceMatrix.version]);
        if (o.instanceColor && !m.has(o.instanceColor)) m.set(o.instanceColor, [name(o) + ' .instanceColor', o.instanceColor.version]); }); return m; };
      const texs = new Map(); scene.traverse((o) => { for (const mt of [].concat(o.material || [])) for (const k in mt) { const t = mt[k]; if (t && t.isTexture && !texs.has(t)) texs.set(t, [name(o) + ' .' + k, t.version]); } });
      const a0 = attrs();
      let n = 0; const tick = () => { if (++n < 120) return requestAnimationFrame(tick);
        const rows = [];
        for (const [at, [k, v]] of attrs()) { const v0 = a0.get(at)?.[1] ?? v; const d = at.version - v0; if (d > 0) {
          const r = at.updateRanges && at.updateRanges.length ? at.updateRanges.reduce((s, x) => s + x.count, 0) : at.array.length;
          rows.push({ what: k, updatesPerFrame: Math.round(d / n * 100) / 100, kbPerUpdate: Math.round(r * at.array.BYTES_PER_ELEMENT / 102.4) / 10, verts: at.count }); } }
        for (const [t, [k, v]] of texs) { const d = t.version - v; if (d > 0) rows.push({ what: 'TEXTURE ' + k, updatesPerFrame: Math.round(d / n * 100) / 100, kbPerUpdate: t.image && t.image.width ? Math.round(t.image.width * t.image.height * 4 / 1024) : null, verts: t.image && t.image.width + 'x' + t.image.height }); }
        done(rows.sort((x, y) => y.updatesPerFrame * (y.kbPerUpdate || 0) - x.updatesPerFrame * (x.kbPerUpdate || 0)).slice(0, 15)); };
      requestAnimationFrame(tick);
    })`);
  }
  }
  return out;
}

// Allocation churn (sampling heap profiler, attributed to file + function) and retained-heap growth after forced GCs.
async function heap({ secs = 20 } = {}) {
  await setup('portrait', '?start=free&auto=1&noaccount=1');
  await setTier('low'); await setView('chase'); await teleport('climb');
  await send('HeapProfiler.enable');
  const used = async () => { await send('HeapProfiler.collectGarbage'); return r1((await metrics()).JSHeapUsedSize / 1048576); };
  const retained = [[0, await used()]];
  await send('HeapProfiler.startSampling', { samplingInterval: 4096, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  const m0 = await metrics(), t0 = Date.now();
  await sleep(secs * 1000);
  const m1 = await metrics();
  const prof = (await send('HeapProfiler.stopSampling')).profile;
  retained.push([secs, await used()]);
  // a minute of downwind/final to see if retained heap keeps climbing
  await teleport('downwind'); await sleep(30000); retained.push([secs + 30, await used()]);
  await teleport('final'); await sleep(30000); retained.push([secs + 60, await used()]);
  const bySite = new Map(), byFileM = new Map();
  let total = 0;
  const walk = (n) => {
    const cf = n.callFrame, f = (cf.url || '').replace(/^.*\/gms\/3d\/krayzee\//, '').replace(/^.*\/gms\/lib\/three\/[^/]+\//, 'three/') || '(native)';
    const self = n.selfSize || 0; total += self;
    const k = `${cf.functionName || '(anon)'} ${f}:${cf.lineNumber + 1}`;
    bySite.set(k, (bySite.get(k) || 0) + self); byFileM.set(f, (byFileM.get(f) || 0) + self);
    for (const c of n.children || []) walk(c);
  };
  walk(prof.head);
  // sampled profile = live-at-stop objects; the JSHeap delta over the window and GC count give the churn rate
  const secsReal = (Date.now() - t0) / 1000;
  return {
    secs: r1(secsReal), retainedMB: retained, heapDeltaMB: r1((m1.JSHeapUsedSize - m0.JSHeapUsedSize) / 1048576),
    sampledLiveKB: Math.round(total / 1024),
    topSites: [...bySite].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, b]) => [k, Math.round(b / 1024)]),
    topFiles: [...byFileM].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, b]) => [k, Math.round(b / 1024)]),
  };
}

// Draw calls of one frame grouped by owner (top-level scene child, plane rigs split by part), main pass vs shadow pass.
async function calls() {
  const out = {};
  await setup('portrait', '?start=free&auto=1&noaccount=1');
  for (const [tier, view, m] of [['low', 'chase', 'runway'], ['low', 'chase', 'downwind'], ['low', 'cockpit', 'final'], ['medium', 'chase', 'apron'], ['high', 'center', 'runway']]) {
    await setTier(tier); await setView(view); await teleport(m); await sleep(1500);
    out[`${tier} ${view} ${m}`] = await ev(`new Promise((done) => {
      const r = __game.renderer.renderer, o = r.renderBufferDirect, sm = r.shadowMap, sr = sm.render;
      const agg = {}; let shadow = false;
      const owner = (x) => { const p = []; for (let y = x; y && y.parent; y = y.parent) p.push(y.name || y.type); p.reverse();
        if (p[0] && p[0].startsWith('plane')) return (x.name === 'pilot' ? 'plane/pilot' : 'plane/' + (p[2] || p[1] || '?')); return p.slice(0, 2).join('/'); };
      requestAnimationFrame(() => {
        sm.render = function (...a) { shadow = true; try { return sr.apply(this, a); } finally { shadow = false; } };
        r.renderBufferDirect = function (cam, sc, geo, mat, obj, grp) { const k = owner(obj); const a = agg[k] || (agg[k] = [0, 0, 0]); a[shadow ? 1 : 0]++; a[2] += (geo.index ? geo.index.count : geo.attributes.position?.count || 0) / 3 * (obj.isInstancedMesh ? obj.count : geo.isInstancedBufferGeometry ? geo.instanceCount : 1); return o.apply(this, arguments); };
        requestAnimationFrame(() => { r.renderBufferDirect = o; sm.render = sr;
          done(Object.entries(agg).sort((a, b) => b[1][0] + b[1][1] - a[1][0] - a[1][1]).map(([k, [m, s, t]]) => ({ owner: k, main: m, shadow: s, ktris: Math.round(t / 1000) }))); });
      });
    })`);
  }
  return out;
}

// ---------------- tables ----------------
function table(rows, cols) {
  const head = '| ' + cols.map((c) => c[0]).join(' | ') + ' |\n|' + cols.map(() => '---').join('|') + '|\n';
  return head + rows.map((r) => '| ' + cols.map((c) => { const v = typeof c[1] === 'function' ? c[1](r) : r[c[1]]; return v == null ? '—' : v; }).join(' | ') + ' |').join('\n') + '\n';
}
const COLS = [['orient', 'orient'], ['tier', 'tier'], ['view', 'view'], ['moment', 'moment'], ['calls', 'calls'], ['sh.calls', 'shadowCalls'],
  ['tris', (r) => Math.round(r.tris / 1000) + 'k'], ['sh.tris', (r) => Math.round(r.shadowTris / 1000) + 'k'], ['frame CPU ms', 'frameCpu'], ['p95', 'frameCpuP95'],
  ['render CPU', 'renderCpu'], ['shadow CPU', 'shadowCpu'], ['GPU main', 'gpuMain'], ['GPU shadow', 'gpuShadow'], ['buf KB/f', 'upBufKBPerFrame'],
  ['tex up/f', 'upTexPerFrame'], ['audio ops/f', 'audioOpsPerFrame'], ['audio ms/f', 'audioMsPerFrame'], ['layout/f', 'layoutsPerFrame'], ['forced-read ms/f', 'layoutReadMsPerFrame'], ['style ms/f', 'styleMsPerFrame'], ['tex', 'textures'], ['prog', 'programs']];

// ---------------- main ----------------
await connect();
await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Performance.enable', { timeDomain: 'timeTicks' });
await send('Page.addScriptToEvaluateOnNewDocument', { source: INIT });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const save = () => { const s = JSON.stringify(result, null, 1); writeFileSync(join(OUT, `perf-${stamp}.json`), s); writeFileSync(join(OUT, 'latest.json'), s); };
try {
  if (ONLY.includes('boot')) { result.boot = await boot(); save(); console.log(JSON.stringify(result.boot, null, 1)); }
  if (ONLY.includes('matrix')) {
    result.matrix = await matrix(QUICK ? { orients: ['portrait'], views: ['chase', 'cockpit'] } : {});
    save();
    console.log('\n## Phone content (auto → low content), locked tiers\n' + table(result.matrix, COLS));
  }
  if (ONLY.includes('forced')) {
    result.forced = [];
    for (const t of TIERS) result.forced.push(...await matrix({ orients: ['portrait'], tiers: [t], views: ['chase'], query: `?start=free&auto=1&noaccount=1&quality=${t}`, label: 'forced', tierLock: false, shots: false }));
    save();
    console.log('\n## Settings-forced tier (content built at that tier), portrait chase\n' + table(result.forced, COLS));
  }
  if (ONLY.includes('throttled')) {
    await send('Emulation.setCPUThrottlingRate', { rate: 4 });
    result.throttled = await matrix({ orients: ['portrait'], tiers: ['low', 'medium'], views: ['chase', 'cockpit'], label: 'cpu4x', shots: false });
    await send('Emulation.setCPUThrottlingRate', { rate: 1 });
    save();
    console.log('\n## CPU throttled 4× (≈ S22 big-core vs M5), portrait\n' + table(result.throttled, COLS));
  }
  if (ONLY.includes('profile')) {
    result.profile = await profile();
    result.profile4x = await profile({ throttle: 4 });
    save();
    for (const P of [result.profile, result.profile4x]) for (const t of TIERS) {
      console.log(`\n### CPU profile ${t} cpu×${P.throttle} (5 s, climb → downwind)`);
      console.log(table(P[t].files.map(([f, ms, p]) => ({ f, ms, p })), [['file', 'f'], ['self ms', 'ms'], ['% busy', 'p']]));
      console.log(table(P[t].inclusive.map(([f, ms]) => ({ f, ms })), [['game function (inclusive)', 'f'], ['ms / 5 s', 'ms']]));
    }
  }
  if (ONLY.includes('governor')) {
    result.governor = [await governor({ throttle: 1, secs: QUICK ? 20 : 60 })];
    if (!QUICK) result.governor.push(await governor({ throttle: 4, secs: 60 }));
    save();
    for (const g of result.governor) console.log(`governor cpu×${g.throttle}: final ${g.final}, history ${JSON.stringify(g.history)}, heap ${g.heapStartMB}→${g.heapEndMB} MB, ${g.gcDrops} GC drops, ~${g.allocKBps} KB/s`);
  }
  if (ONLY.includes('uploads')) { result.uploads = await uploads(); save(); for (const v in result.uploads) { console.log(`\n### Buffers/textures re-uploaded (${v}, downwind)`); console.log(table(result.uploads[v], [['buffer', 'what'], ['updates/f', 'updatesPerFrame'], ['KB/update', 'kbPerUpdate'], ['count', 'verts']])); } }
  if (ONLY.includes('calls')) { result.calls = await calls(); save(); for (const k in result.calls) { console.log(`\n### Draw calls by owner (${k})`); console.log(table(result.calls[k], [['owner', 'owner'], ['main', 'main'], ['shadow', 'shadow'], ['k tris (both)', 'ktris']])); } }
  if (ONLY.includes('heap')) { result.heap = await heap(); save(); console.log('\n### Heap', JSON.stringify(result.heap, null, 1)); }
  result.errors = [...new Set(errors)].slice(0, 20);
} finally {
  save();
  console.log(`\nwrote ${join(OUT, 'perf-' + stamp + '.json')}${result.errors?.length ? `\nconsole errors: ${result.errors.length}` : ''}`);
  ws.close();
}
