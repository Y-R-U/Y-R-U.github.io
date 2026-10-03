// Perf audit (read-only on game code): where frame time and GPU cost go on the S22 Ultra portrait profile.
//   CDP_PORT=9381 node tools/perf-audit.mjs [--reps=3] [--win=6] [--only=frame,profile,static] [--json=path]
// frame   : CPU 4×, three scenarios (top = hero + first card idle; storm = W10 brawl+build+fling; scroll = 5 s down/up),
//           one uninstrumented window then --reps instrumented windows each; per-frame buckets via monkeypatching
//           (game.tick, shipments, host.render → hooks/world/plots/spectacle/prepare/scene/post/shadow/present, ui.update),
//           draw calls/vertices via a WebGL2 prototype wrap, mid-play shader links, JS heap churn. Medians across windows.
// profile : CPU 4× storm, V8 sampling profile (self ms by file + function, GC) and allocation sampling (top allocators).
// static  : CPU 1×, game loop paused; each view rendered in isolation into its real-size RT: calls, triangles, vertex
//           invocations, GPU ms (EXT_disjoint_timer_query, M5 Metal — use as RATIOS), post/MSAA/shadow deltas,
//           and hero group toggles (Δcalls/Δverts/ΔGPU per scene child and per plot piece).
// Waits for Flux/LTX/TTS/ACE-Step to be idle (GPU_WAIT s, default 600) and records load avg + GPU status per phase.
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { launch, stop, openPage, GAME, sleep } from './cdp.mjs';

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const REPS = +arg('reps', 3), WIN = +arg('win', 6) * 1000;
const ONLY = new Set(arg('only', 'frame,profile,static').split(','));
const JSON_OUT = arg('json', '');
const S22_UA = 'Mozilla/5.0 (Linux; Android 14; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const VP = { width: 412, height: 915, deviceScaleFactor: 2.625, mobile: true };
const BASE = '?nosave=1&demo=1&debug=1&tod=17' + (process.env.PA_QS || '');
const med = (a) => { const s = a.filter((x) => x != null && !Number.isNaN(x)).sort((x, y) => x - y); return s.length ? s[(s.length - 1) >> 1] : NaN; };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))] || 0; };
const f = (x, n = 2) => (x == null || Number.isNaN(x) ? '—' : (+x).toFixed(n));
const out = { at: new Date().toISOString(), env: [], frame: {}, profile: {}, static: null };

async function gpuStatus() {
  const s = {};
  const get = async (k, u, busy) => { try { const r = await (await fetch(u, { signal: AbortSignal.timeout(1500) })).json(); s[k] = busy(r) ? 'BUSY' : 'idle'; } catch { s[k] = 'down'; } };
  await Promise.all([
    get('flux', 'http://localhost:7867/api/status', (r) => !!r.running_job_id || r.queue_depth > 0),
    get('ltx', 'http://localhost:7866/api/status', (r) => !!r.running_job_id),
    get('tts', 'http://localhost:7876/api/status', (r) => !!r.active_job),
    get('ace', 'http://localhost:8001/admin/status', (r) => r.active_requests > 0),
  ]);
  s.load = execSync('sysctl -n vm.loadavg').toString().trim().replace(/[{}]/g, '').trim();
  s.busy = Object.entries(s).filter(([, v]) => v === 'BUSY').map(([k]) => k);
  return s;
}
async function envNote(label) {
  const limit = +(process.env.GPU_WAIT ?? 600) * 1000, t0 = Date.now();
  let s = await gpuStatus();
  if (s.busy.length) console.log(`  [${label}] waiting for GPU (${s.busy.join('+')})…`);
  while (s.busy.length && Date.now() - t0 < limit) { await sleep(5000); s = await gpuStatus(); }
  out.env.push({ label, ...s });
  console.log(`  [${label}] load ${s.load}; gpu ${s.busy.length ? 'CONTENDED by ' + s.busy.join('+') : 'idle'}`);
  return s;
}

// Before any game code: WebGL2 draw/vertex counter + shader link timing, rAF work probe.
const PRELOAD = `(() => {
  const A = window.__pa = { draws: 0, verts: 0, links: 0, linkMs: 0, compileMs: 0, paramMs: 0, linkAt: [] };
  for (const P of [WebGL2RenderingContext.prototype]) {
    const dA = P.drawArrays, dE = P.drawElements, dAI = P.drawArraysInstanced, dEI = P.drawElementsInstanced;
    P.drawArrays = function (m, a, c) { A.draws++; A.verts += c; return dA.call(this, m, a, c); };
    P.drawElements = function (m, c, t, o) { A.draws++; A.verts += c; return dE.call(this, m, c, t, o); };
    P.drawArraysInstanced = function (m, a, c, n) { A.draws++; A.verts += c * n; return dAI.call(this, m, a, c, n); };
    P.drawElementsInstanced = function (m, c, t, o, n) { A.draws++; A.verts += c * n; return dEI.call(this, m, c, t, o, n); };
    const lp = P.linkProgram, cs = P.compileShader, gp = P.getProgramParameter;
    P.linkProgram = function (p) { const t = performance.now(); try { return lp.call(this, p); } finally { A.links++; A.linkMs += performance.now() - t; A.linkAt.push(Math.round(performance.now())); } };
    P.compileShader = function (s) { const t = performance.now(); try { return cs.call(this, s); } finally { A.compileMs += performance.now() - t; } };
    P.getProgramParameter = function (p, k) { const t = performance.now(); try { return gp.call(this, p, k); } finally { A.paramMs += performance.now() - t; } };
  }
  // rAF probe: per frame [ts, all rAF work, main loop, other callbacks]. The audit's own scroll driver is excluded from
  // "other" (cb.__audit) but its forced layout is timed separately in window.__scrollSet.
  const raf = window.requestAnimationFrame.bind(window);
  let cur = -1, acc = 0, accLoop = 0, accOther = 0, accAudit = 0;
  window.__frames = [];
  window.requestAnimationFrame = (cb) => raf((ts) => {
    const t0 = performance.now();
    try { cb(ts); } finally {
      const w = performance.now() - t0;
      if (ts !== cur) { if (cur >= 0) window.__frames.push([cur, acc, accLoop, accOther, accAudit]); cur = ts; acc = accLoop = accOther = accAudit = 0; }
      acc += w;
      if (cb.name === 'loop') accLoop += w; else if (cb.__audit) accAudit += w; else accOther += w;
    }
  });
})();`;

// Runtime instrumentation (after ready). Buckets are ms sums; per-frame rows snapshot them at each game.tick (loop start).
const INSTR = `(() => {
  if (window.__pi) return 'already';
  const x = __iw2, A = window.__pa;
  const I = window.__pi = { b: Object.create(null), c: Object.create(null), rows: [], view: null, views: Object.create(null), r: null, on: true, heapPos: 0, lastHeap: 0 };
  const add = (k, ms) => { I.b[k] = (I.b[k] || 0) + ms; };
  const cnt = (k, n) => { I.c[k] = (I.c[k] || 0) + n; };
  const wrap = (o, key, label) => {
    const fn = o && o[key];
    if (!fn || fn.__pa) return;
    const g = function (...a) { const t = performance.now(); try { return fn.apply(this, a); } finally { add(label, performance.now() - t); } };
    g.__pa = 1; o[key] = g;
  };
  const KEYS = ['loop', 'game.tick', 'shipments', 'host.render', 'ui.update', 'world.update', 'plots.update', 'ambient', 'town.tick', 'spectacle.update', 'prepare', 'hero.scene', 'hero.post', 'card.scene', 'card.post', 'shadow', 'present'];
  let snap = null, frameStart = 0;
  const tick = x.game.tick;
  x.game.tick = function (...a) {
    const now = performance.now();
    if (snap) {
      const row = { work: now - frameStart, draws: A.draws - snap.draws, verts: A.verts - snap.verts, links: A.links - snap.links, cards: (I.c.cardRenders || 0) - snap.cards, hero: (I.c.heroRenders || 0) - snap.hero };
      for (const k of KEYS) row[k] = (I.b[k] || 0) - (snap.b[k] || 0);
      if (I.on) I.rows.push(row);
    }
    const m = performance.memory?.usedJSHeapSize || 0;
    if (I.lastHeap && m > I.lastHeap) I.heapPos += m - I.lastHeap;
    I.lastHeap = m;
    frameStart = now;
    snap = { b: { ...I.b }, draws: A.draws, verts: A.verts, links: A.links, cards: I.c.cardRenders || 0, hero: I.c.heroRenders || 0 };
    const t = performance.now(); try { return tick.apply(this, a); } finally { add('game.tick', performance.now() - t); }
  };
  wrap(x.shipments, 'update', 'shipments');
  wrap(x.ui, 'update', 'ui.update');
  wrap(x.world, 'update', 'world.update');
  if (x.world.spectacle) wrap(x.world.spectacle, 'update', 'spectacle.update');
  wrap(x.world.ambient, 'update', 'ambient');
  wrap(x.world.town, 'tick', 'town.tick');
  for (const [id, p] of x.world.plots) {
    const fn = p.update;
    p.update = function (...a) { const t = performance.now(); try { return fn.apply(this, a); } finally { const ms = performance.now() - t; add('plots.update', ms); add('plot:' + id, ms); } };
  }
  const prep = x.world.prepare;
  x.world.prepare = function (v) {
    const t = performance.now();
    I.view = v;
    const vs = I.views[v.id] ||= { kind: v.kind, renders: 0, ms: 0, calls: 0, verts: 0, px: 0, scene: 0, post: 0, shadow: 0 };
    vs.renders++;
    cnt(v.kind === 'hero' ? 'heroRenders' : 'cardRenders', 1);
    try { return prep.call(this, v); } finally { add('prepare', performance.now() - t); }
  };
  const patchRenderer = (r) => {
    if (!r || r.__pa) return;
    r.__pa = true;
    const rend = r.render;
    r.render = function (scene, cam) {
      const v = I.view, hero = v?.kind === 'hero', isWorld = scene === x.world.scene;
      const label = (hero ? 'hero' : 'card') + (isWorld ? '.scene' : '.post');
      const t = performance.now(), d0 = A.draws, v0 = A.verts;
      try { return rend.call(this, scene, cam); } finally {
        const ms = performance.now() - t;
        add(label, ms);
        if (v) {
          const vs = I.views[v.id];
          vs.ms += ms; vs[isWorld ? 'scene' : 'post'] += ms; vs.calls += A.draws - d0; vs.verts += A.verts - v0;
          const rt = this.getRenderTarget();
          if (isWorld) vs.px += (rt ? rt.width * rt.height * Math.max(1, rt.samples) : (v.pw || 0) * (v.ph || 0));
        }
      }
    };
    const sm = r.shadowMap, srend = sm.render;
    sm.render = function (...a) {
      if (!sm.needsUpdate) return srend.apply(this, a);
      const t = performance.now(), d0 = A.draws;
      try { return srend.apply(this, a); } finally { const ms = performance.now() - t; add('shadow', ms); cnt('shadowMaps', 1); cnt('shadowDraws', A.draws - d0); if (I.view) I.views[I.view.id].shadow += ms; }
    };
  };
  const hr = x.host.render;
  x.host.render = function (now) {
    patchRenderer(x.host.renderer);
    const p = x.host.debug.perf, ps = p.presentSum;
    const t = performance.now();
    try { return hr.call(this, now); } finally { add('host.render', performance.now() - t); add('present', p.presentSum - ps); }
  };
  I.reset = () => { I.b = Object.create(null); I.c = Object.create(null); I.rows = []; I.views = Object.create(null); I.heapPos = 0; I.lastHeap = 0; snap = null; A.links0 = A.links; };
  return 'ok';
})()`;

const WINDOW_RESULT = `(() => {
  const I = window.__pi, A = window.__pa, d = __iw2.host.debug, r = __iw2.host.renderer, s = __iw2.world.spectacle;
  return JSON.stringify({ scrollSet: window.__scrollSet || 0, rows: I ? I.rows : [], views: I ? I.views : {}, c: I ? I.c : {}, heapPos: I ? I.heapPos : 0, frames: window.__frames.slice(),
    links: A.links - (A.links0 || 0), programs: r.info.programs.length, textures: r.info.memory.textures, geometries: r.info.memory.geometries,
    tier: d.tier, level: d.level, dpr: d.dpr, cardDpr: d.cardDpr, gov: d.governor, perf: d.perf, sp: s ? { ...s.debug, scenes: s.scenes } : null });
})()`;

const STORM = `(() => {
  const w = __iw2.world, s = w.spectacle, g = __iw2.game;
  if (!window.__built) {
    window.__built = true;
    const L = g.state.lines.garter; L.lv = 0; g.state.built = g.state.built.filter((x) => x !== 'garter');
    g.act('cheat', { cash: 1e30 });
    window.__buy = g.act('buy', { lineId: 'garter' });
  }
  w.heroRig.pin('saloon');
  s.play('brawl');
  for (const id of ['barrel', 'pickles', 'chickens', 'pomfrey', 'vultures', 'mortimer', 'horse', 'tumbleweed']) s.gag(id);
  s.play('duel', { ambient: true });
  clearInterval(window.__storm);
  window.__storm = setInterval(() => {
    s.play('eject', { id: 'gate' + Math.random(), kind: 'drunk', level: 100, autoAfter: 0.8 });
    if (!s.scenes.includes('brawl')) s.play('brawl');
    for (const id of ['barrel', 'chickens', 'pomfrey', 'mortimer']) s.gag(id);
  }, 1500);
  return { build: !!g.state.build.garter };
})()`;

const SCROLL = (ms) => `new Promise((done) => {
  const el = document.scrollingElement, best = el.scrollHeight - el.clientHeight, t0 = performance.now();
  window.__scrollSet = 0;
  const step = () => { const t = performance.now() - t0; const a = performance.now(); el.scrollTop = best * (0.5 - 0.5 * Math.cos(Math.min(1, t / ${ms}) * Math.PI * 2)); window.__scrollSet += performance.now() - a; if (t < ${ms}) requestAnimationFrame(step); else done(best); };
  step.__audit = true;
  requestAnimationFrame(step);
})`;

async function boot(port, query = BASE) {
  const page = await openPage(port);
  await page.send('Page.enable');
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: PRELOAD });
  await page.send('Emulation.setUserAgentOverride', { userAgent: S22_UA, platform: 'Linux armv8l' });
  await page.goto(GAME + query, VP);
  await page.wait('!!(window.__iw2 && window.__iw2.ready && window.__iw2.world.spectacle)', 45000);
  await sleep(2500);
  return page;
}

function summarise(w) {
  const rows = w.rows, n = Math.max(1, rows.length);
  const fr = w.frames, dts = fr.slice(1).map((x, i) => x[0] - fr[i][0]), work = fr.map((x) => x[1]);
  const avg = (k) => rows.reduce((s, r) => s + (r[k] || 0), 0) / n;
  for (const r of rows) { r.body = r['game.tick'] + r.shipments + r['host.render'] + r['ui.update']; r.both = r.hero > 0 && r.cards > 0 ? 1 : 0; }
  const keys = Object.keys(rows[0] || {});
  const mean = Object.fromEntries(keys.map((k) => [k, avg(k)]));
  // What the slow frames are made of: mean of each bucket over the slowest 10% of loop bodies.
  const cut = pct(rows.map((r) => r.body), 0.9);
  const slow = rows.filter((r) => r.body >= cut), sn = Math.max(1, slow.length);
  const slowMean = Object.fromEntries(keys.map((k) => [k, slow.reduce((s, r) => s + (r[k] || 0), 0) / sn]));
  const loopW = fr.map((x) => x[2] || 0), otherW = fr.map((x) => x[3] || 0), auditW = fr.map((x) => x[4] || 0);
  const cutW = pct(work, 0.9), slowF = fr.filter((x) => x[1] >= cutW), sfn = Math.max(1, slowF.length);
  return {
    loopP95: pct(loopW, 0.95), otherP95: pct(otherW, 0.95), auditP95: pct(auditW, 0.95), scrollSetPerFrame: (w.scrollSet || 0) / Math.max(1, fr.length),
    slowSplit: { all: slowF.reduce((s, x) => s + x[1], 0) / sfn, loop: slowF.reduce((s, x) => s + (x[2] || 0), 0) / sfn, other: slowF.reduce((s, x) => s + (x[3] || 0), 0) / sfn, audit: slowF.reduce((s, x) => s + (x[4] || 0), 0) / sfn },
    fps: fr.length / (WIN / 1000), dtP95: pct(dts, 0.95), workP50: pct(work, 0.5), workP95: pct(work, 0.95), workMax: Math.max(0, ...work),
    mean, slowMean, frames: rows.length, links: w.links, programs: w.programs, textures: w.textures, geometries: w.geometries,
    heapMBs: w.heapPos / 1e6 / (WIN / 1000), tier: w.tier + '/' + w.level, dpr: w.dpr, cardDpr: w.cardDpr, downs: w.gov?.downs, views: w.views, c: w.c,
    callsMax: w.perf?.callsMax, heroCallsMax: w.perf?.heroCallsMax, cardCallsMax: w.perf?.cardCallsMax, sp: w.sp,
  };
}

async function frameScenario(port, name) {
  await envNote('frame:' + name);
  const page = await boot(port);
  await page.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await sleep(6000);
  if (name === 'storm') { await page.eval(STORM); await sleep(1500); }
  const runWin = async () => {
    await page.eval('window.__frames.length = 0; window.__pi && window.__pi.reset(); __iw2.host.debug.resetPerf()');
    if (name === 'scroll') await page.eval(SCROLL(WIN), WIN + 20000); else await sleep(WIN);
    return JSON.parse(await page.eval(WINDOW_RESULT));
  };
  const raw = summarise(await runWin());
  await page.eval(INSTR);
  const wins = [];
  for (let k = 0; k < REPS; k++) wins.push(summarise(await runWin()));
  await page.eval('clearInterval(window.__storm)');
  await page.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const errs = [...page.exceptions, ...page.consoleLog.filter((c) => c.type === 'error').map((c) => c.text)];
  await page.close();
  const m = (fn) => med(wins.map(fn));
  const keys = Object.keys(wins[0].mean);
  const res = {
    raw: { fps: raw.fps, workP50: raw.workP50, workP95: raw.workP95, dtP95: raw.dtP95, loopP95: raw.loopP95, otherP95: raw.otherP95, auditP95: raw.auditP95, slowSplit: raw.slowSplit },
    loopP95: m((w) => w.loopP95), otherP95: m((w) => w.otherP95), auditP95: m((w) => w.auditP95), scrollSetPerFrame: m((w) => w.scrollSetPerFrame),
    slowSplit: Object.fromEntries(['all', 'loop', 'other', 'audit'].map((k) => [k, m((w) => w.slowSplit[k])])),
    fps: m((w) => w.fps), dtP95: m((w) => w.dtP95), workP50: m((w) => w.workP50), workP95: m((w) => w.workP95), workMax: m((w) => w.workMax),
    mean: Object.fromEntries(keys.map((k) => [k, m((w) => w.mean[k])])),
    slowMean: Object.fromEntries(keys.map((k) => [k, m((w) => w.slowMean[k])])),
    links: wins.map((w) => w.links), programs: wins.map((w) => w.programs), textures: wins[wins.length - 1].textures, geometries: wins[wins.length - 1].geometries,
    heapMBs: m((w) => w.heapMBs), tier: wins.map((w) => w.tier), dpr: wins[0].dpr, cardDpr: wins[0].cardDpr, downs: wins.map((w) => w.downs),
    callsMax: m((w) => w.callsMax), heroCallsMax: m((w) => w.heroCallsMax), cardCallsMax: m((w) => w.cardCallsMax),
    windows: wins.map((w) => ({ fps: w.fps, workP95: w.workP95, dtP95: w.dtP95 })), sp: wins[wins.length - 1].sp, errors: errs.slice(0, 3),
    views: Object.fromEntries(Object.entries(wins[wins.length - 1].views).map(([id, v]) => [id, { ...v, perRender: v.renders ? { ms: v.ms / v.renders, scene: v.scene / v.renders, post: v.post / v.renders, calls: v.calls / v.renders, verts: v.verts / v.renders, px: v.px / v.renders } : null }])),
    c: wins[wins.length - 1].c,
  };
  out.frame[name] = res;
  const M = res.mean, S = res.slowMean;
  console.log(`\n== frame:${name}  tier ${res.tier.join(',')} dpr ${res.dpr} card ${res.cardDpr}; ${f(res.fps, 0)} fps; rAF work p50 ${f(res.workP50)} p95 ${f(res.workP95)} max ${f(res.workMax, 1)} ms (uninstrumented p95 ${f(raw.workP95)}); dt p95 ${f(res.dtP95, 1)}; windows ${res.windows.map((w) => f(w.workP95)).join('/')}`);
  console.log(`   rAF split p95: main loop ${f(res.loopP95)} other rAF ${f(res.otherP95)} audit driver ${f(res.auditP95)} (forced layout from scrollTop ${f(res.scrollSetPerFrame)} ms/frame); slowest 10% frames: all ${f(res.slowSplit.all)} = loop ${f(res.slowSplit.loop)} + other ${f(res.slowSplit.other)} + driver ${f(res.slowSplit.audit)}; uninstrumented cold window: p95 ${f(raw.workP95)} loop ${f(raw.loopP95)} driver ${f(raw.auditP95)}`);
  console.log('   bucket (body = loop body)  mean ms   slowest-10%-body frames ms');
  for (const k of ['body', 'game.tick', 'shipments', 'ui.update', 'host.render', 'world.update', 'plots.update', 'ambient', 'town.tick', 'spectacle.update', 'prepare', 'hero.scene', 'hero.post', 'card.scene', 'card.post', 'shadow', 'present'])
    console.log(`   ${k.padEnd(18)} ${f(M[k]).padStart(8)} ${f(S[k]).padStart(10)}`);
  console.log(`   hero renders/frame ${f(M.hero)} cards/frame ${f(M.cards)} hero+card frames ${f(100 * (M.both || 0), 1)}% (p90+: ${f(S.hero)} / ${f(S.cards)}); draws/frame ${f(M.draws, 0)} verts/frame ${f(M.verts / 1e6)} M; calls max ${res.callsMax} (hero ${res.heroCallsMax}, card ${res.cardCallsMax})`);
  console.log(`   shader links during play ${res.links.join('/')} (programs ${res.programs.join('/')}); JS heap churn ${f(res.heapMBs)} MB/s; textures ${res.textures} geometries ${res.geometries}; errors ${res.errors.length}`);
  for (const [id, v] of Object.entries(res.views)) if (v.perRender) console.log(`   view ${id.padEnd(16)} ${String(v.renders).padStart(4)} renders  ${f(v.perRender.ms)} ms/render (scene ${f(v.perRender.scene)} post ${f(v.perRender.post)}) ${f(v.perRender.calls, 0)} draws ${f(v.perRender.verts / 1e3, 0)}k verts ${f(v.perRender.px / 1e6)} Mpx`);
  return res;
}

async function profileRun(port, name) {
  await envNote('profile:' + name);
  const page = await boot(port);
  await page.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await sleep(6000);
  if (name === 'storm') { await page.eval(STORM); await sleep(1500); }
  const act = async () => { if (name === 'scroll') await page.eval(SCROLL(WIN), WIN + 20000); else await sleep(WIN); };
  if (name === 'scroll') await act();
  await page.send('Profiler.enable');
  await page.send('Profiler.setSamplingInterval', { interval: 200 });
  await page.send('Profiler.start');
  await act();
  const { profile } = await page.send('Profiler.stop');
  await page.send('HeapProfiler.enable');
  await page.send('HeapProfiler.startSampling', { samplingInterval: 4096, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  await act();
  const { profile: heap } = await page.send('HeapProfiler.stopSampling', {}, 60000);
  await page.eval('clearInterval(window.__storm)');
  await page.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await page.close();

  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const selfFn = new Map(), selfFile = new Map(), totFn = new Map();
  let tot = 0;
  const fileOf = (cf) => cf.url ? cf.url.split('/').slice(-2).join('/').replace(/\?.*/, '') : cf.functionName || '(native)';
  const key = (cf) => `${cf.functionName || '(anon)'} ${fileOf(cf)}:${cf.lineNumber + 1}`;
  for (let i = 0; i < profile.samples.length; i++) {
    const dt = profile.timeDeltas[i + 1] ?? 0;
    tot += dt;
    let id = profile.samples[i];
    const cf = byId.get(id).callFrame;
    selfFn.set(key(cf), (selfFn.get(key(cf)) || 0) + dt);
    selfFile.set(fileOf(cf), (selfFile.get(fileOf(cf)) || 0) + dt);
    const seen = new Set();
    while (id) { const k = key(byId.get(id).callFrame); if (!seen.has(k)) { seen.add(k); totFn.set(k, (totFn.get(k) || 0) + dt); } id = parent.get(id); }
  }
  const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ k, ms: v / 1000, pct: (100 * v) / tot }));
  // Allocation sampling: bytes per function (self) over the window.
  const alloc = new Map();
  let allocTot = 0;
  const walk = (n) => {
    const s = n.selfSize || 0;
    if (s) { const k = key(n.callFrame); alloc.set(k, (alloc.get(k) || 0) + s); allocTot += s; }
    for (const c of n.children || []) walk(c);
  };
  walk(heap.head);
  const res = {
    totalMs: tot / 1000, gcMs: (selfFile.get('(garbage collector)') || 0) / 1000, busyMs: (tot - (selfFile.get('(idle)') || 0)) / 1000, files: top(selfFile, 22), self: top(selfFn, 30), total: top(totFn, 40),
    allocMBs: allocTot / 1e6 / (WIN / 1000), alloc: [...alloc].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k, v]) => ({ k, kb: v / 1024, pct: (100 * v) / allocTot })),
  };
  (out.profile ||= {})[name] = res;
  console.log(`\n== profile (${name}, CPU 4×, ${f(res.totalMs, 0)} ms sampled)`);
  console.log(`   busy ${f(res.busyMs, 0)} ms of ${f(res.totalMs, 0)}; GC ${f(res.gcMs, 1)} ms (${f(100 * res.gcMs / Math.max(1, res.busyMs), 1)}% of busy)`);
  console.log('   self by file:'); for (const r of res.files) console.log(`   ${f(r.pct, 1).padStart(5)}% ${f(r.ms, 0).padStart(6)} ms  ${r.k}`);
  console.log('   self by function:'); for (const r of res.self.slice(0, 22)) console.log(`   ${f(r.pct, 1).padStart(5)}% ${f(r.ms, 0).padStart(6)} ms  ${r.k}`);
  console.log(`   allocation ${f(res.allocMBs)} MB/s (sampled, incl. collected); top:`); for (const r of res.alloc.slice(0, 14)) console.log(`   ${f(r.pct, 1).padStart(5)}% ${f(r.kb, 0).padStart(7)} KB  ${r.k}`);
  return res;
}

// Static, isolated per-view costs. The game loop is paused (host.render → noop) so nothing else touches the renderer.
const STATIC = `(async () => {
  __iw2.host.debug.setLevel?.(0);
  const x = __iw2, host = x.host, world = x.world, r = host.renderer, gl = r.getContext(), A = window.__pa, q = host.quality, THREE_ = await import('three');
  const post = (await import('${GAME}js/render/post.js?v=' + x.BUILD)).createPost();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const hr = host.render; host.render = () => {};
  await new Promise((res) => setTimeout(res, 100));
  const nextFrame = () => new Promise((res) => requestAnimationFrame(res));
  async function gpu(fn, n = 20) {
    fn(); gl.finish();
    const t0 = performance.now();
    let qy = null;
    if (ext) { qy = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, qy); }
    for (let i = 0; i < n; i++) fn();
    if (ext) gl.endQuery(ext.TIME_ELAPSED_EXT);
    const cpu = (performance.now() - t0) / n;
    gl.finish();
    const wall = (performance.now() - t0) / n;
    let g = null;
    if (ext) {
      for (let k = 0; k < 60 && !gl.getQueryParameter(qy, gl.QUERY_RESULT_AVAILABLE); k++) await nextFrame();
      if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) g = gl.getQueryParameter(qy, gl.QUERY_RESULT) / 1e6 / n;
      gl.deleteQuery(qy);
    }
    return { gpu: g, cpu, wall };
  }
  // GPU Δ of hiding obj: alternate on/off rounds so clock ramps and noise hit both arms; median of the differences.
  async function delta(pass, obj, rounds = 3) {
    const dg = [], dw = [];
    for (let k = 0; k < rounds; k++) {
      const a = await gpu(pass); obj.visible = false; const b = await gpu(pass); obj.visible = true;
      if (a.gpu != null && b.gpu != null) dg.push(a.gpu - b.gpu);
      dw.push(a.wall - b.wall);
    }
    const md = (x) => { const s = x.sort((p, q) => p - q); return s.length ? s[(s.length - 1) >> 1] : null; };
    return { gpu: md(dg), wall: md(dw) };
  }
  const count = (fn) => { r.info.reset(); const d0 = A.draws, v0 = A.verts; fn(); return { calls: A.draws - d0, tris: r.info.render.triangles, verts: A.verts - v0 }; };
  const views = host.debug.listViews();
  const hv = views.find((v) => v.kind === 'hero');
  const card = views.find((v) => v.kind === 'line');
  const d = Math.min(devicePixelRatio, q.dprCap);
  const cardD = (w, h) => Math.max(d, Math.min(q.cardDprCap, Math.floor(Math.sqrt(q.cardPx / (w * h)) * 20) / 20));
  const sun = world.rig.sun;
  const rtCache = new Map();
  const rtFor = (w, h, s) => { const k = w + 'x' + h + 's' + s; if (!rtCache.has(k)) rtCache.set(k, new THREE_.WebGLRenderTarget(w, h, { type: THREE_.HalfFloatType, samples: s, depthBuffer: true })); return rtCache.get(k); };
  const setup = (fake) => {
    const cam = world.prepare(fake);
    r.setScissorTest(true);
    world.configureRenderer(r, q.name);
    return cam;
  };
  const scenePass = (cam, rt) => () => { r.shadowMap.needsUpdate = false; r.setRenderTarget(rt); r.setViewport(0, 0, rt.width, rt.height); r.setScissor(0, 0, rt.width, rt.height); r.render(world.scene, cam); };
  const shadowPass = (cam, rt) => () => { r.shadowMap.needsUpdate = true; r.setRenderTarget(rt); r.setViewport(0, 0, rt.width, rt.height); r.setScissor(0, 0, rt.width, rt.height); r.render(world.scene, cam); r.shadowMap.needsUpdate = false; };
  const result = { device: host.debug.device.gpu, timer: !!ext, tier: q.name, dpr: d, q: { rtSamples: q.rtSamples, cardSamples: q.cardSamples, post: q.post, heroFps: q.heroFps, cardFps: q.cardFps, cardFpsOther: q.cardFpsOther, cardPx: q.cardPx, heroSharpen: q.heroSharpen, cardSharpen: q.cardSharpen, shadowHz: q.shadowHz, mapSize: sun.shadow.mapSize.x }, views: [], hero: null, groups: [], pieces: [] };
  const rc = world.renderConfig;
  { const cam = setup({ id: 'hero', kind: 'hero', lineId: null, w: hv.w, h: hv.h }); const rt = rtFor(Math.round(hv.w * d), Math.round(hv.h * d), q.rtSamples); for (let i = 0; i < 3; i++) await gpu(scenePass(cam, rt), 20); }
  // per view
  for (const v of views) {
    const hero = v.kind === 'hero';
    const dd = hero ? d : cardD(v.w, v.h);
    const pw = Math.round(v.w * dd), ph = Math.round(v.h * dd);
    const fake = { id: v.id, kind: v.kind, lineId: v.lineId, w: v.w, h: v.h, pw, ph, vx: 0, vy: 0, d: dd };
    const cam = setup(fake);
    const S = hero ? q.rtSamples : q.cardSamples;
    const rtS = rtFor(pw, ph, S), rt0 = rtFor(pw, ph, 0);
    const c = count(scenePass(cam, rtS));
    const sc = await gpu(scenePass(cam, rtS));
    const sc0 = await gpu(scenePass(cam, rt0));
    const sh = await gpu(shadowPass(cam, rtS), 4);
    const opts = hero ? { bloom: rc.bloom, tilt: rc.tilt, samples: q.rtSamples, div: q.post, sharpen: q.heroSharpen } : { samples: q.cardSamples, sharpen: q.cardSharpen };
    const full = await gpu(() => { r.shadowMap.needsUpdate = false; r.setRenderTarget(null); post.render(r, world.scene, cam, fake, opts); });
    result.views.push({ id: v.id, kind: v.kind, cssW: v.w, cssH: v.h, d: dd, pw, ph, mpx: pw * ph / 1e6, samples: S, ...c, scene: sc, sceneNoMsaa: sc0, sceneWithShadow: sh, withPost: full });
  }
  // hero group toggles
  {
    const v = hv, pw = Math.round(v.w * d), ph = Math.round(v.h * d);
    const fake = { id: v.id, kind: 'hero', lineId: null, w: v.w, h: v.h, pw, ph, vx: 0, vy: 0, d };
    const cam = setup(fake);
    const rt = rtFor(pw, ph, q.rtSamples), pass = scenePass(cam, rt);
    const base = count(pass), bg = await gpu(pass, 16);
    result.hero = { base, gpu: bg, current: world.heroRig.current, cam: cam.position.toArray().map((n) => +n.toFixed(1)) };
    const measure = async (label, obj, kind) => {
      if (!obj.visible) return null;
      obj.visible = false;
      const c = count(pass);
      obj.visible = true;
      if (base.calls - c.calls <= 0) return null;
      const dg = await delta(pass, obj);
      return { label, kind, dCalls: base.calls - c.calls, dVerts: base.verts - c.verts, dTris: base.tris - c.tris, dGpu: dg.gpu, dWall: dg.wall };
    };
    for (const o of world.scene.children) {
      if (!o.visible || o.isLight) continue;
      const label = o.name || o.type + ':' + (o.children[0]?.name || o.geometry?.type || '');
      const row = await measure(label, o, 'child');
      if (row) result.groups.push(row);
    }
    // pieces inside the visible plots and ambient
    const parents = world.scene.children.filter((o) => o.visible && (o.name.startsWith('plot:') || o.name === 'ambient'));
    for (const g of parents) {
      for (const o of g.children) {
        const label = g.name + ' › ' + (o.name || o.type) + (o.isInstancedMesh ? ' [inst ' + o.count + ' × ' + (o.geometry.attributes.position?.count || 0) + 'v]' : o.isMesh ? ' [' + (o.geometry.attributes.position?.count || 0) + 'v]' : '');
        const row = await measure(label, o, 'piece');
        if (row) result.pieces.push(row);
      }
    }
  }
  // hero: all townsfolk at once (instanced rigs ≥ 10k verts/instance), resolution and MSAA sensitivity, shadow pass
  {
    const v = hv, pw = Math.round(v.w * d), ph = Math.round(v.h * d);
    const cam = setup({ id: v.id, kind: 'hero', lineId: null, w: v.w, h: v.h, pw, ph, vx: 0, vy: 0, d });
    const pass = scenePass(cam, rtFor(pw, ph, q.rtSamples));
    const people = [];
    world.scene.traverse((o) => { if (o.isInstancedMesh && (o.geometry.attributes.position?.count || 0) >= 10000) people.push(o); });
    const vis0 = people.map((o) => o.visible);
    const proxy = { set visible(b) { people.forEach((o, i) => { o.visible = b ? vis0[i] : false; }); }, get visible() { return true; } };
    const c0 = count(pass); proxy.visible = false; const c1 = count(pass); proxy.visible = true;
    const dg = await delta(pass, proxy, 3);
    let visibleCount = 0; for (const o of people) if (o.visible) { let p = o, on = true; while (p) { if (!p.visible) on = false; p = p.parent; } if (on) visibleCount += o.count; }
    result.people = { meshes: people.length, vertsPerPerson: people[0]?.geometry.attributes.position.count, visiblePeople: visibleCount, dCalls: c0.calls - c1.calls, dVerts: c0.verts - c1.verts, dGpu: dg.gpu, baseVerts: c0.verts };
    const res = [];
    for (const dd of [1, 1.25, 1.5, 2]) {
      const w = Math.round(v.w * dd), h = Math.round(v.h * dd);
      res.push({ dpr: dd, mpx: w * h / 1e6, msaa4: (await gpu(scenePass(cam, rtFor(w, h, 4)))).gpu, msaa0: (await gpu(scenePass(cam, rtFor(w, h, 0)))).gpu });
    }
    result.heroRes = res;
    // shadow map render alone: full scene with the casters into the 2048 map (needsUpdate) minus the plain pass
    const a = [], b = [];
    for (let k = 0; k < 3; k++) { a.push((await gpu(shadowPass(cam, rtFor(pw, ph, q.rtSamples)), 8)).gpu); b.push((await gpu(pass, 8)).gpu); }
    const md = (x) => x.sort((p, q) => p - q)[1];
    r.info.reset(); const d0 = A.draws, v0 = A.verts; shadowPass(cam, rtFor(pw, ph, q.rtSamples))(); const sd = A.draws - d0, sv = A.verts - v0;
    result.heroShadow = { gpu: md(a) - md(b), draws: sd - c0.calls, verts: sv - c0.verts };
    let objs = 0, auto = 0, meshes = 0; world.scene.traverse((o) => { objs++; if (o.matrixAutoUpdate) auto++; if (o.isMesh) meshes++; });
    result.sceneGraph = { objects: objs, matrixAutoUpdate: auto, meshes };
  }
  // card pieces for the heaviest card
  {
    const heavy = result.views.filter((v) => v.kind === 'line').sort((a, b) => b.calls - a.calls)[0];
    if (heavy) {
      const v = views.find((x) => x.id === heavy.id);
      const fake = { id: v.id, kind: 'line', lineId: v.lineId, w: v.w, h: v.h, pw: heavy.pw, ph: heavy.ph, vx: 0, vy: 0, d: heavy.d };
      const cam = setup(fake);
      const pass = scenePass(cam, rtFor(heavy.pw, heavy.ph, q.cardSamples));
      const base = count(pass), bg = await gpu(pass, 16);
      result.cardPieces = { id: v.id, base, gpu: bg, rows: [] };
      const plot = world.plots.get(v.lineId);
      const kids = [...world.scene.children.filter((o) => o.visible && !o.isLight && o !== plot.group), ...plot.group.children];
      for (const o of kids) {
        if (!o.visible) continue;
        o.visible = false;
        const c = count(pass);
        o.visible = true;
        if (base.calls - c.calls <= 0) continue;
        const dg = await delta(pass, o, 2);
        result.cardPieces.rows.push({ label: (o.parent === plot.group ? plot.group.name + ' › ' : '') + (o.name || o.type) + (o.isInstancedMesh ? ' [inst ' + o.count + ']' : ''), dCalls: base.calls - c.calls, dVerts: base.verts - c.verts, dGpu: dg.gpu });
      }
    }
  }
  // crowd rig size + material/program inventory
  const mats = new Set(), progKeys = new Map(), inst = [];
  world.scene.traverse((o) => {
    if (o.material) for (const m of [].concat(o.material)) mats.add(m);
    if (o.isInstancedMesh) inst.push({ name: o.name || o.parent?.name || '', vpi: o.geometry.attributes.position?.count || 0, count: o.count, max: o.instanceMatrix.count, skinned: !!o.isSkinnedMesh });
  });
  result.materials = mats.size;
  result.materialTypes = [...mats].reduce((m, x) => { const k = x.type + (x.userData?.uber ? ':uber' : ''); m[k] = (m[k] || 0) + 1; return m; }, {});
  result.programs = r.info.programs.length;
  result.programNames = r.info.programs.map((p) => p.name + ' ' + (p.cacheKey || '').slice(0, 0)).reduce((m, k) => { m[k] = (m[k] || 0) + 1; return m; }, {});
  result.instanced = inst.sort((a, b) => b.vpi * b.count - a.vpi * a.count).slice(0, 25);
  for (const t of rtCache.values()) t.dispose();
  host.render = hr;
  host.markDirty('*');
  return JSON.stringify(result);
})()`;

async function staticPhase(port) {
  await envNote('static');
  const page = await boot(port);
  await sleep(3000);
  // scroll a little so every card has been near once (prepare builds card rigs lazily)
  await page.eval(SCROLL(4000), 30000);
  await page.eval('document.scrollingElement.scrollTop = 0');
  await sleep(1500);
  const runs = [];
  for (let k = 0; k < REPS; k++) runs.push(JSON.parse(await page.eval(STATIC, 240000)));
  await page.close();
  const R = runs[0];
  const mg = (pick) => med(runs.map(pick));
  for (const [i, v] of R.views.entries()) {
    for (const k of ['scene', 'sceneNoMsaa', 'sceneWithShadow', 'withPost']) v[k] = { gpu: mg((r) => r.views[i][k].gpu), cpu: mg((r) => r.views[i][k].cpu), wall: mg((r) => r.views[i][k].wall) };
  }
  R.hero.gpu = { gpu: mg((r) => r.hero.gpu.gpu), cpu: mg((r) => r.hero.gpu.cpu), wall: mg((r) => r.hero.gpu.wall) };
  for (const [i, g] of R.groups.entries()) { g.dGpu = mg((r) => r.groups[i]?.dGpu); g.dWall = mg((r) => r.groups[i]?.dWall); }
  for (const [i, g] of R.pieces.entries()) g.dGpu = mg((r) => r.pieces[i]?.dGpu);
  if (R.cardPieces) for (const [i, g] of R.cardPieces.rows.entries()) g.dGpu = mg((r) => r.cardPieces.rows[i]?.dGpu);
  R.people.dGpu = mg((r) => r.people.dGpu);
  R.heroShadow.gpu = mg((r) => r.heroShadow.gpu);
  for (const [i, x] of R.heroRes.entries()) { x.msaa4 = mg((r) => r.heroRes[i].msaa4); x.msaa0 = mg((r) => r.heroRes[i].msaa0); }
  out.static = R;
  console.log(`\n== static (CPU 1×, ${R.device}; timer query ${R.timer}; tier ${R.tier} dpr ${R.dpr}; q ${JSON.stringify(R.q)})`);
  console.log('   view             px          Mpx  MSAA calls   tris     verts   GPU scene  noMSAA  +shadow  +post/resolve  CPU submit');
  for (const v of R.views) console.log(`   ${v.id.padEnd(16)} ${(v.pw + '×' + v.ph).padEnd(10)} ${f(v.mpx).padStart(5)} ${String(v.samples).padStart(4)} ${String(v.calls).padStart(5)} ${f(v.tris / 1e3, 0).padStart(5)}k ${f(v.verts / 1e3, 0).padStart(6)}k ${f(v.scene.gpu).padStart(8)} ${f(v.sceneNoMsaa.gpu).padStart(7)} ${f(v.sceneWithShadow.gpu).padStart(8)} ${f(v.withPost.gpu).padStart(10)} ${f(v.scene.cpu).padStart(10)}`);
  console.log(`   hero base: ${R.hero.base.calls} calls, ${f(R.hero.base.verts / 1e3, 0)}k verts, GPU ${f(R.hero.gpu.gpu)} ms (focus ${R.hero.current})`);
  console.log('   hero groups (Δ when hidden):');
  for (const g of [...R.groups].sort((a, b) => b.dVerts - a.dVerts)) console.log(`     ${g.label.padEnd(28)} ${String(g.dCalls).padStart(4)} calls ${f(g.dVerts / 1e3, 0).padStart(6)}k verts  GPU ${f(g.dGpu)} ms`);
  console.log('   hero pieces (top 20 by verts):');
  for (const g of [...R.pieces].sort((a, b) => b.dVerts - a.dVerts).slice(0, 20)) console.log(`     ${g.label.padEnd(60)} ${String(g.dCalls).padStart(3)} calls ${f(g.dVerts / 1e3, 0).padStart(6)}k verts  GPU ${f(g.dGpu)} ms`);
  if (R.cardPieces) {
    console.log(`   card ${R.cardPieces.id}: ${R.cardPieces.base.calls} calls ${f(R.cardPieces.base.verts / 1e3, 0)}k verts GPU ${f(R.cardPieces.gpu.gpu)} ms; pieces:`);
    for (const g of [...R.cardPieces.rows].sort((a, b) => b.dVerts - a.dVerts).slice(0, 15)) console.log(`     ${g.label.padEnd(50)} ${String(g.dCalls).padStart(3)} calls ${f(g.dVerts / 1e3, 0).padStart(6)}k verts  GPU ${f(g.dGpu)} ms`);
  }
  console.log(`   townsfolk: ${R.people.meshes} instanced rigs × ${R.people.vertsPerPerson} verts; ${R.people.visiblePeople} people in hero = ${R.people.dCalls} calls ${f(R.people.dVerts / 1e3, 0)}k of ${f(R.people.baseVerts / 1e3, 0)}k verts, GPU ${f(R.people.dGpu)} ms of ${f(R.hero.gpu.gpu)}`);
  console.log('   hero GPU vs resolution: ' + R.heroRes.map((x) => `dpr ${x.dpr} ${f(x.mpx)}Mpx ${f(x.msaa4)}ms(4×) ${f(x.msaa0)}ms(1×)`).join(' | '));
  console.log(`   hero shadow-map pass: +${R.heroShadow.draws} draws +${f(R.heroShadow.verts / 1e3, 0)}k verts GPU ${f(R.heroShadow.gpu)} ms; scene graph ${JSON.stringify(R.sceneGraph)}`);
  console.log(`   materials ${R.materials} ${JSON.stringify(R.materialTypes)}; programs ${R.programs}`);
  console.log('   instanced (verts/instance × live count):');
  for (const i of R.instanced.slice(0, 14)) console.log(`     ${i.name.padEnd(24)} ${String(i.vpi).padStart(6)} v × ${i.count}/${i.max} = ${f(i.vpi * i.count / 1e3, 0)}k`);
  return R;
}

const port = launch({ port: +(process.env.CDP_PORT || 9381) });
try {
  if (ONLY.has('frame')) for (const s of ['top', 'storm', 'scroll']) await frameScenario(port, s);
  if (ONLY.has('profile')) for (const s of ['storm', 'scroll']) await profileRun(port, s);
  if (ONLY.has('static')) await staticPhase(port);
} finally {
  stop(port);
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(out, null, 1));
}
