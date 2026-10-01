// R3 reviewer C: per-system frame cost, CPU profile, allocation rate and DOM churn per scenario.
//   node tools/review_c_perf.mjs [scenario,...] [--throttle 4] [--secs 60] [--desktop]
// scenarios: night (survival t=0.85, auto-walker), build (8x8x8 scale-8 stamps + copy/paste), mg:<id> (mini-game),
//            title (title screen idle)
// Needs the local server on :8861. Headless Chrome (metal) on :9335.
import fs from 'node:fs';
import { launch, open, stopBrowser, sleep } from './qa_cdp.mjs';

const PORT = 9335;
const BASE = 'http://localhost:8861/gms/3d/synthwild/';
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const THROTTLE = +opt('throttle', 4);
const SECS = +opt('secs', 60);
const DESKTOP = argv.includes('--desktop');
const NOPROF = argv.includes('--noprof');
const scen = (argv.find((a) => !a.startsWith('--') && !/^\d+$/.test(a)) || 'night').split(',');
const OUT = new URL('./qa_out/review_c/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

// In-page instrumentation: wraps every per-frame system, counts DOM mutations, DOM queries and layout reads.
const INSTR = `(() => {
  const G = window.__game, C = G.ctx;
  if (window.__rc) return 'already';
  const T = {}, N = {}, MX = {};
  const wrap = (obj, name, label) => {
    if (!obj || typeof obj[name] !== 'function' || obj[name].__rc) return;
    const f = obj[name];
    const w = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { const d = performance.now() - t; T[label] = (T[label] || 0) + d; N[label] = (N[label] || 0) + 1; if (d > (MX[label] || 0)) MX[label] = d; } };
    w.__rc = true; obj[name] = w;
  };
  const rewrap = () => {
    wrap(C.input, 'update', 'input');
    wrap(C.player, 'update', 'player');
    wrap(C.brush, 'update', 'brush');
    wrap(C.game, 'update', 'game');
    const g = C.game || {};
    wrap(g.drops, 'update', 'game.drops'); wrap(g.mobs, 'update', 'game.mobs'); wrap(g.projectiles, 'update', 'game.proj');
    wrap(g.stations, 'update', 'game.stations'); wrap(g.farm, 'update', 'game.farm'); wrap(g.journal, 'update', 'game.journal');
    wrap(g.mobs, 'spawnTick', 'game.mobs.spawnTick');
    wrap(C.world, 'update', 'world');
    wrap(C.sky, 'update', 'sky');
    wrap(C.render, 'update', 'render');
    wrap(C.fx, 'update', 'fx');
    wrap(C.ui, 'update', 'ui');
    wrap(C.audio, 'update', 'audio');
    wrap(C.renderer, 'render', 'gl.render');
    const mg = C.minigames || C.game?.minigames; wrap(mg, 'update', 'minigame');
  };
  rewrap();
  let mut = 0, mutAttr = 0, mutText = 0, mutList = 0; const mutBy = {};
  const tag = (n) => { const e = n.nodeType === 1 ? n : n.parentElement; if (!e) return '?'; return e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.split(' ')[0] : ''); };
  new MutationObserver((l) => { for (const r of l) { mut++; if (r.type === 'attributes') mutAttr++; else if (r.type === 'characterData') mutText++; else mutList++; const k = r.type[0] + ':' + tag(r.target) + (r.attributeName ? '@' + r.attributeName : ''); mutBy[k] = (mutBy[k] || 0) + 1; } })
    .observe(document.documentElement, { subtree: true, attributes: true, characterData: true, childList: true });
  const cnt = {};
  const hook = (proto, name) => { const f = proto[name]; proto[name] = function (...a) { cnt[name] = (cnt[name] || 0) + 1; return f.apply(this, a); }; };
  hook(Document.prototype, 'querySelector'); hook(Element.prototype, 'querySelector'); hook(Document.prototype, 'querySelectorAll'); hook(Element.prototype, 'querySelectorAll');
  hook(Element.prototype, 'getBoundingClientRect'); hook(window, 'getComputedStyle');
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC) for (const k of Object.getOwnPropertyNames(BaseAudioContext.prototype)) if (/^create/.test(k)) hook(BaseAudioContext.prototype, k);
  hook(AudioNode.prototype, 'disconnect');
  const fr = []; let lastT = performance.now(), run = true;
  const tick = (t) => { if (!run) return; fr.push(t - lastT); lastT = t; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  window.__rc = {
    rewrap,
    reset() { for (const k in MX) delete MX[k]; for (const k in T) delete T[k]; for (const k in N) delete N[k]; for (const k in cnt) delete cnt[k]; for (const k in mutBy) delete mutBy[k]; mut = mutAttr = mutText = mutList = 0; fr.length = 0; lastT = performance.now(); this.t0 = performance.now(); this.h0 = performance.memory?.usedJSHeapSize; this.calls = []; },
    sample() { const i = C.renderer.info.render; this.calls.push([i.calls, i.triangles]); },
    read() {
      const dur = (performance.now() - this.t0) / 1000, n = fr.length;
      const sorted = fr.slice().sort((a, b) => a - b);
      const pct = (p) => sorted[Math.min(n - 1, Math.floor(n * p))];
      const per = {}; for (const k in T) per[k] = { msPerFrame: +(T[k] / Math.max(1, n)).toFixed(3), calls: N[k], maxMs: +(MX[k] || 0).toFixed(1) };
      const cs = this.calls; const avg = (j) => cs.length ? Math.round(cs.reduce((s, c) => s + c[j], 0) / cs.length) : null;
      const topMut = Object.entries(mutBy).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => [k, +(v / dur).toFixed(1)]);
      return { dur: +dur.toFixed(1), frames: n, fps: +(n / dur).toFixed(1), p50: +pct(0.5)?.toFixed(1), p95: +pct(0.95)?.toFixed(1), p99: +pct(0.99)?.toFixed(1), max: +sorted[n - 1]?.toFixed(1),
        over50: fr.filter((x) => x > 50).length, over100: fr.filter((x) => x > 100).length,
        per, mutPerSec: +(mut / dur).toFixed(1), mutAttr, mutText, mutList, topMut,
        domCallsPerSec: Object.fromEntries(Object.entries(cnt).map(([k, v]) => [k, +(v / dur).toFixed(1)])),
        heapMB: performance.memory ? +((performance.memory.usedJSHeapSize) / 1048576).toFixed(1) : null,
        calls: avg(0), tris: avg(1), stats: { ...C.stats }, rstats: { ...C.render.stats }, fxCount: C.fx.count,
        mobs: C.game?.mobs?.list?.length, drops: C.game?.drops?.list?.length, sceneObjs: (() => { let k = 0; C.scene.traverse(() => k++); return k; })(),
        geo: C.renderer.info.memory.geometries, tex: C.renderer.info.memory.textures, progs: C.renderer.info.programs?.length };
    },
  };
  return 'ok';
})()`;

function aggProfile(profile, top = 30) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const dt = profile.timeDeltas;
  for (let i = 0; i < profile.samples.length; i++) self.set(profile.samples[i], (self.get(profile.samples[i]) || 0) + (dt[i] || 0));
  const total = dt.reduce((a, b) => a + b, 0);
  const fn = new Map();
  const fileT = new Map();
  for (const [id, us] of self) {
    const cf = byId.get(id).callFrame;
    const file = (cf.url || '').replace(/^.*synthwild\//, '').replace(/^.*\/lib\/three\/0\.180\.0\//, 'three/');
    const k = `${cf.functionName || '(anon)'} ${file}:${cf.lineNumber + 1}`;
    fn.set(k, (fn.get(k) || 0) + us);
    const fk = file || cf.functionName;
    fileT.set(fk, (fileT.get(fk) || 0) + us);
  }
  const pct = (us) => +((us / total) * 100).toFixed(2);
  return {
    totalMs: Math.round(total / 1000),
    topSelf: [...fn].sort((a, b) => b[1] - a[1]).slice(0, top).map(([k, us]) => [k, Math.round(us / 1000), pct(us)]),
    byFile: [...fileT].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, us]) => [k, Math.round(us / 1000), pct(us)]),
  };
}

function aggHeap(prof, secs, top = 25) {
  const sites = new Map();
  let total = 0;
  const walk = (n, stack) => {
    const cf = n.callFrame;
    const file = (cf.url || '').replace(/^.*synthwild\//, '').replace(/^.*\/lib\/three\/0\.180\.0\//, 'three/');
    const here = `${cf.functionName || '(anon)'} ${file}:${cf.lineNumber + 1}`;
    if (n.selfSize) {
      total += n.selfSize;
      // attribute to the nearest game frame (skip three internals for a useful call site)
      const s = [...stack, here];
      let site = here;
      for (let i = s.length - 1; i >= 0; i--) if (/ js\//.test(s[i])) { site = s[i] + (i < s.length - 1 ? ' -> ' + here : ''); break; }
      sites.set(site, (sites.get(site) || 0) + n.selfSize);
    }
    for (const c of n.children || []) walk(c, [...stack, here]);
  };
  walk(prof.head, []);
  return { totalMB: +(total / 1048576).toFixed(1), MBperSec: +(total / 1048576 / secs).toFixed(2),
    top: [...sites].sort((a, b) => b[1] - a[1]).slice(0, top).map(([k, b]) => [k, +(b / 1048576).toFixed(2)]) };
}

async function startScenario(pg, name) {
  const q = DESKTOP ? '' : '';
  if (name === 'night') {
    await pg.goto(BASE + '?play=1&nointro&t=0.85&seed=perfnight' + q);
    await pg.waitFor(`window.__game?.ctx?.ui?.shell?.state === 'playing' && window.__game.ctx.player?.ready`, { timeout: 90000 });
    await pg.eval(`import('./js/player/auto.js').then(m => { const C = window.__game.ctx; C.input.auto = m.createAuto(C); C.ui.shell.noAutoPause = true; return 1; })`);
  } else if (name === 'build') {
    await pg.goto(BASE + '?play=1&nointro&mode=build&seed=perfbuild' + q);
    await pg.waitFor(`window.__game?.ctx?.ui?.shell?.state === 'playing' && window.__game.ctx.player?.ready`, { timeout: 90000 });
    await pg.eval(`window.__game.ctx.ui.shell.noAutoPause = true`);
  } else if (name.startsWith('mg:')) {
    await pg.goto(BASE + '?mgtest=' + name.slice(3) + '&nointro' + q);
    await pg.waitFor(`window.__game?.ctx?.ui?.shell?.state === 'playing' && window.__game.ctx.player?.ready`, { timeout: 90000 });
  } else if (name === 'travel') {
    await pg.goto(BASE + '?play=1&nointro&mode=build&seed=perftravel');
    await pg.waitFor(`window.__game?.ctx?.ui?.shell?.state === 'playing' && window.__game.ctx.player?.ready`, { timeout: 90000 });
    await pg.eval(`(() => { const C = window.__game.ctx; C.ui.shell.noAutoPause = true; const P = C.player; P.flying = true;
      let last = performance.now(); const go = (t) => { const dt = Math.min(0.1, (t - last) / 1000); last = t;
        if (window.__travel) { const x = P.pos.x + 19 * dt; P.teleport(x, Math.max(P.pos.y, 70), P.pos.z); P.flying = true; P.yaw = -Math.PI / 2; }
        requestAnimationFrame(go); }; requestAnimationFrame(go); return 1; })()`);
  } else if (name === 'title') {
    await pg.goto(BASE + '?nointro');
    await pg.waitFor(`window.__game?.ctx?.ui?.shell?.state === 'title'`, { timeout: 60000 });
  }
  await sleep(4000);
}

// Build driver, through brush.tools so undo snapshots are included. Alternates: one scale-8 block (8 m cube),
// an 8x8x8 volume at scale 8 (64 m cube, over MAX_BOX_SUBS so not undoable), a hollow 8 m cube, and copy -> paste.
const BUILD_STEP = `(() => {
  const C = window.__game.ctx, T = C.brush.tools, p = C.player.pos, S = 4;
  const k = (window.__bk = (window.__bk || 0) + 1);
  const bx = Math.floor(p.x) + 10 + (k % 3) * 10, bz = Math.floor(p.z) - 12 + ((k >> 2) % 3) * 10, by = Math.floor(p.y) + 2;
  const kind = ['cube8', 'big64', 'hollow8', 'paste'][k % 4];
  const t = performance.now(); let r;
  if (kind === 'cube8') r = T.edit([bx * S, by * S, bz * S], [(bx + 8) * S, (by + 8) * S, (bz + 8) * S], 7, 'fill', {});
  else if (kind === 'big64') r = T.edit([(bx + 20) * S, by * S, bz * S], [(bx + 84) * S, (by + 16) * S, (bz + 64) * S], k % 8 === 1 ? 7 : 0, 'fill', {});
  else if (kind === 'hollow8') r = T.edit([bx * S, by * S, bz * S], [(bx + 8) * S, (by + 8) * S, (bz + 8) * S], 9, 'hollow', {});
  else {
    const a = [bx * S, (by - 4) * S, bz * S], b = [(bx + 16) * S, (by + 8) * S, (bz + 16) * S];
    T.copy({ min: a, max: b });
    const t1 = performance.now();
    T.paste.box = { min: [a[0] + 80, a[1], a[2]], max: [b[0] + 80, b[1], b[2]] };
    T.commitPaste(); T.endPaste();
    return { kind, copyMs: +(t1 - t).toFixed(1), pasteMs: +(performance.now() - t1).toFixed(1), undo: T.history.steps, undoMB: +(T.history.bytes / 1048576).toFixed(1) };
  }
  return { kind, ms: +(performance.now() - t).toFixed(1), changed: r?.changed, undo: T.history.steps, undoMB: +(T.history.bytes / 1048576).toFixed(1) };
})()`;

async function runScenario(pg, name) {
  pg.resetLog();
  await startScenario(pg, name);
  console.log(await pg.eval(INSTR));
  if (THROTTLE > 1) await pg.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  await pg.send('Profiler.enable');
  await pg.send('Profiler.setSamplingInterval', { interval: 500 });
  await pg.send('HeapProfiler.enable');
  await pg.eval('window.gc && gc()');
  await pg.eval('window.__rc.rewrap(); window.__rc.reset()');
  if (!NOPROF) await pg.send('Profiler.start');
  if (name === 'travel') await pg.eval('window.__travel = true');
  await pg.send('HeapProfiler.startSampling', { samplingInterval: 32768, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  const t0 = Date.now();
  const stamps = [];
  while (Date.now() - t0 < SECS * 1000) {
    await pg.evalSafe('window.__rc.sample()');
    if (name === 'build') stamps.push(await pg.evalSafe(BUILD_STEP));
    if (name.startsWith('mg:')) await pg.evalSafe(`(() => { const C = window.__game.ctx; if (!C.input.auto) import('./js/player/auto.js').then(m => C.input.auto = m.createAuto(C)); })()`);
    await sleep(name === 'build' ? 1500 : 1000);
  }
  const heap = await pg.send('HeapProfiler.stopSampling', {}, undefined, 120000);
  const prof = NOPROF ? null : await pg.send('Profiler.stop', {}, undefined, 120000);
  if (THROTTLE > 1) await pg.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const r = await pg.eval('window.__rc.read()');
  r.scenario = name; r.throttle = THROTTLE; r.desktop = DESKTOP;
  if (prof) { r.profile = aggProfile(prof.profile); fs.writeFileSync(`${OUT}${name.replace(':', '_')}${DESKTOP ? '_desk' : ''}.cpuprofile`, JSON.stringify(prof.profile)); }
  r.alloc = aggHeap(heap.profile, r.dur);
  if (stamps.length) r.stamps = stamps.slice(0, 40);
  r.exceptions = pg.log.exceptions.slice(0, 8);
  r.workers = (await pg.send('Target.getTargets')).targetInfos.filter((t) => t.type === 'worker').length;
  return r;
}

const port = await launch(PORT, ['--use-angle=metal', '--js-flags=--expose-gc', '--enable-precise-memory-info', '--autoplay-policy=no-user-gesture-required']);
const results = [];
try {
  for (const s of scen) {
    const pg = await open(port);
    if (DESKTOP) await pg.viewport({ width: 1280, height: 720 });
    else await pg.viewport({ width: 915, height: 412, mobile: true, dpr: 2 });
    await pg.clearOrigin(BASE);
    try {
      const r = await runScenario(pg, s);
      results.push(r);
      fs.writeFileSync(`${OUT}${s.replace(':', '_')}${DESKTOP ? '_desk' : ''}_t${THROTTLE}.json`, JSON.stringify(r, null, 1));
      const { profile, alloc, ...brief } = r;
      console.log(JSON.stringify(brief, null, 1));
      if (profile) console.log('TOP SELF', JSON.stringify(profile.topSelf.slice(0, 20), null, 0), '\nBY FILE', JSON.stringify(profile.byFile.slice(0, 15)));
      console.log('ALLOC', alloc.MBperSec, 'MB/s', JSON.stringify(alloc.top.slice(0, 15)));
    } catch (e) { console.error(s, e); results.push({ scenario: s, error: String(e) }); }
    await pg.close();
  }
} finally { stopBrowser(PORT); }
