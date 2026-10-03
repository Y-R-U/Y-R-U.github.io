// Perf budget (ARCH §9.2 + DESIGN §6). Metal GPU, headless. Two profiles:
//  phone  — S22 Ultra portrait 412×915 (DSF 2.625, Android UA → high tier @ DPR 1.5), CPU throttled 4×, 5 s scroll down+up
//  desktop — 1440×900, high tier, 5 s scroll
// The phone profile settles 8 s under the throttle first, so the auto governor has picked its tier before measuring.
// Budgets: frame dt p95 ≤ 20 ms, main-thread rAF work p95 ≤ 8 ms, no visible view blank > 250 ms, ≤ 250 draw calls/frame.
// `node tools/test-scroll.mjs [query]` (default '?nosave=1&demo=1').
import { launch, stop, openPage, GAME, VIEWPORTS, sleep } from './cdp.mjs';

const QUERY = process.argv[2] || '?nosave=1&demo=1';
const S22_UA = 'Mozilla/5.0 (Linux; Android 14; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const PROFILES = [
  { name: 'phone S22U 412x915', vp: { width: 412, height: 915, deviceScaleFactor: 2.625, mobile: true }, ua: S22_UA, cpu: 4, settle: 8000 },
  { name: 'desktop 1440x900', vp: VIEWPORTS.desktop, cpu: 1 },
];
const fails = [];
const check = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (!ok) fails.push(msg); };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))] || 0; };

const RAF_PROBE = `(() => {
  const raf = window.requestAnimationFrame.bind(window);
  let cur = -1, acc = 0;
  window.__frames = [];
  window.requestAnimationFrame = (cb) => raf((ts) => {
    const t0 = performance.now();
    try { cb(ts); } finally {
      const w = performance.now() - t0;
      if (ts !== cur) { if (cur >= 0) window.__frames.push([cur, acc]); cur = ts; acc = 0; }
      acc += w;
    }
  });
})();`;

const SCROLL = `new Promise((done) => {
  const cands = [document.scrollingElement, ...document.querySelectorAll('main, .lines, .side, .app, section, div')];
  let el = document.scrollingElement, best = 0;
  for (const c of cands) {
    if (!c) continue;
    const st = c === document.scrollingElement ? 'auto' : getComputedStyle(c).overflowY;
    const room = c.scrollHeight - c.clientHeight;
    if ((st === 'auto' || st === 'scroll') && room > best) { best = room; el = c; }
  }
  const d = __il2.host.debug;
  d.resetPerf();
  window.__frames.length = 0;
  const t0 = performance.now(), T = 5000;
  const step = () => {
    const t = performance.now() - t0;
    el.scrollTop = best * (0.5 - 0.5 * Math.cos(Math.min(1, t / T) * Math.PI * 2));
    if (t < T) requestAnimationFrame(step); else done({ room: best, tag: el.tagName + '.' + (el.className || '') });
  };
  requestAnimationFrame(step);
})`;

// Local Flux/LTX jobs share the GPU and turn every frame number into fiction; wait for them (GPU_WAIT seconds).
async function gpuBusy() {
  const busy = [];
  for (const u of ['http://localhost:7867/api/status', 'http://localhost:7866/api/status']) {
    try {
      const r = await (await fetch(u, { signal: AbortSignal.timeout(1500) })).json();
      if (r.running_job_id) busy.push(u.includes('7867') ? 'flux' : 'ltx');
    } catch {}
  }
  return busy;
}
async function waitGpu() {
  const limit = +(process.env.GPU_WAIT ?? 900) * 1000, t0 = Date.now();
  let b = await gpuBusy();
  if (b.length) console.log(`  waiting for GPU (${b.join('+')} generating)…`);
  while (b.length && Date.now() - t0 < limit) { await sleep(5000); b = await gpuBusy(); }
  return b;
}

await waitGpu();
const port = launch({ port: +(process.env.CDP_PORT || 9244) });
try {
  for (const pr of PROFILES) {
    const busy = await gpuBusy();
    console.log(pr.name + (pr.cpu > 1 ? ` (CPU ${pr.cpu}×)` : '') + (busy.length ? `  [GPU CONTENDED by ${busy.join('+')}: numbers unreliable]` : ''));
    const page = await openPage(port);
    await page.send('Page.enable');
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: RAF_PROBE });
    if (pr.ua) await page.send('Emulation.setUserAgentOverride', { userAgent: pr.ua, platform: 'Linux armv8l' });
    await page.goto(GAME + QUERY, pr.vp);
    await page.wait('window.__il2 && window.__il2.ready', 15000);
    await sleep(2500);
    if (pr.cpu > 1) await page.send('Emulation.setCPUThrottlingRate', { rate: pr.cpu });
    await sleep(pr.settle || 0);
    const start = await page.eval('__il2.host.debug.tier + "/" + __il2.host.debug.level');
    const sc = await page.eval(SCROLL, 30000);
    const after = await gpuBusy();
    if (after.length && !busy.length) console.log(`    [GPU became busy (${after.join('+')}) during the run: numbers unreliable]`);
    const r = await page.eval(`(() => { const d = __il2.host.debug; return { perf: d.perf, tier: d.tier, level: d.level, dpr: d.dpr, gov: d.governor,
      mobile: d.device.mobile, cardDpr: d.cardDpr, frames: window.__frames, views: d.views, live: d.live2d, prepaints: d.prepaints, shadows: d.shadows, post: d.post }; })()`);
    if (pr.cpu > 1) await page.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const fr = r.frames;
    const dts = fr.slice(1).map((f, i) => f[0] - fr[i][0]);
    const work = fr.map((f) => f[1]);
    const p = r.perf;
    console.log(`    scrolled ${Math.round(sc.room)} px in ${sc.tag}; tier at scroll start ${start}, end ${r.tier} (level ${r.level}, mobile ${r.mobile}) dpr ${r.dpr} (cards ${r.cardDpr}), shadows ${r.shadows}, post ${r.post}`);
    console.log(`    ${fr.length} frames ≈ ${(fr.length / 5).toFixed(1)} fps; dt p50 ${pct(dts, 0.5).toFixed(1)} p95 ${pct(dts, 0.95).toFixed(1)} ms; rAF work p50 ${pct(work, 0.5).toFixed(2)} p95 ${pct(work, 0.95).toFixed(2)} ms; host work avg ${(p.workSum / Math.max(1, p.frames)).toFixed(2)} max ${p.workMax.toFixed(1)} ms`);
    console.log(`    draw calls max ${p.callsMax}/frame (hero ${p.heroCallsMax}, card ${p.cardCallsMax}), renders/frame max ${p.rendersMax}, live 2D canvases ${r.live}, prepaints ${r.prepaints}, governor downs ${r.gov.downs}`);
    check(pct(dts, 0.95) <= 20, `frame dt p95 ≤ 20 ms (${pct(dts, 0.95).toFixed(1)})`);
    check(pct(work, 0.95) <= 8, `main-thread rAF work p95 ≤ 8 ms (${pct(work, 0.95).toFixed(2)})`);
    check(p.blankMaxMs <= 250, `no visible view blank > 250 ms (${Math.round(p.blankMaxMs)} ms)`);
    check(p.callsMax <= 250, `draw calls ≤ 250 per frame (${p.callsMax})`);
    check(r.live <= Math.max(10, 2 + 6), `live 2D canvases capped (${r.live})`);
    if (pr.ua) check(r.mobile && r.dpr <= 1.5, `phone profile renders at DPR ≤ 1.5 (${r.dpr})`);
    await page.close();
  }
} finally {
  stop(port);
}
console.log(fails.length ? `\nFAILED ${fails.length}` : '\nPASS');
process.exit(fails.length ? 1 : 0);
