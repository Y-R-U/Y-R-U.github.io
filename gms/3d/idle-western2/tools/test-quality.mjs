// Adaptive quality (ENGINE.md "Adaptive quality"). Headless Metal, desktop 1440×900, demo town.
//  normal      — no load: auto must stay on High (no steps) and ignore a 3 s freeze (hidden-tab) gap.
//  slow laptop — CPU 6× + ?gpuload=900 (a fill-bound GPU stand-in: per-pixel shader cost after every view render):
//                governor alone from High (?bench=0), then boot bench + governor. Frame dt p95 over 10–25 s ≤ 34 ms
//                (two vsyncs) and in every 5 s window from 10 s, level dropped, no up/down reversals, no up-step late.
//  falsify     — same load with ?gov=0: the p95 gate must FAIL, or the gate proves nothing.
//  api         — host.quality.set/current/on; classifyGpu table (node side).
// `CDP_PORT=9301 node tools/test-quality.mjs [--only=normal,gov,bench,falsify]`
import { launch, stop, openPage, GAME, VIEWPORTS, sleep } from './cdp.mjs';
import { classifyGpu } from '../js/render/quality.js';

const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const LOAD = process.env.GPULOAD || '900', RUN = 25000;
const fails = [];
const check = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (!ok) fails.push(msg); return ok; };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))] || 0; };
const PROBE = `window.__dts = []; (function f(t) { if (window.__lt) __dts.push([performance.now(), t - __lt]); __lt = t; requestAnimationFrame(f); })(0);`;

console.log('classifyGpu');
for (const [g, mobile, want] of [
  ['ANGLE (Apple, ANGLE Metal Renderer: Apple M5, Unspecified Version)', false, 'high'],
  ['ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)', false, 'mid'],
  ['ANGLE (Intel, Intel(R) HD Graphics 4000 Direct3D11 vs_5_0 ps_5_0, D3D11)', false, 'low'],
  ['ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', false, 'high'],
  ['ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', false, 'mid'],
  ['ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Laptop GPU Direct3D11 vs_5_0 ps_5_0, D3D11)', false, 'high'],
  ['ANGLE (NVIDIA, NVIDIA GeForce MX150 Direct3D11 vs_5_0 ps_5_0, D3D11)', false, 'mid'],
  ['ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)', false, 'low'],
  ['ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)', false, 'low'],
  ['Adreno (TM) 730', true, 'high'], ['Adreno (TM) 619', true, 'mid'], ['Adreno (TM) 506', true, 'low'],
  ['Mali-G710 MC10', true, 'high'], ['Mali-G52 MC2', true, 'low'], ['Mali-G76 MC4', true, 'mid'], ['PowerVR Rogue GE8320', true, 'low'],
]) { const [t, cls] = classifyGpu(g, mobile); check(t === want, `${g.slice(0, 60)} → ${t} (${cls}), want ${want}`); }

async function run(port, { name, query, cpu = 1, freeze = false, api = false }) {
  console.log(`${name}${cpu > 1 ? ` (CPU ${cpu}×)` : ''}  ${query}`);
  const page = await openPage(port);
  await page.send('Page.enable');
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: PROBE });
  await page.goto(GAME + query, VIEWPORTS.desktop);
  await page.wait('window.__iw2 && __iw2.ready', 60000);
  const t0 = await page.eval('performance.now()');
  if (cpu > 1) await page.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  await sleep(RUN);
  if (cpu > 1) await page.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const r = await page.eval(`(() => { const d = __iw2.host.debug; return { dts: __dts, level: d.level, tier: d.tier, dpr: d.dpr, qlog: d.qlog, bench: d.bench, gov: { ...d.governor }, gpuMs: d.gpuMs, q: __iw2.host.quality.current() }; })()`);
  const rel = (t) => t - t0;
  const span = (a, b) => r.dts.filter(([t]) => rel(t) >= a && rel(t) < b).map(([, dt]) => dt);
  const p95 = pct(span(10000, RUN), 0.95);
  const wins = [0, 5000, 10000, 15000, 20000].map((a) => pct(span(a, a + 5000), 0.95).toFixed(0));
  const log = r.qlog.map(([t, a, b, why]) => `${(rel(t) / 1000).toFixed(1)}s ${a}→${b} ${why}`);
  console.log(`    level ${r.level} (${r.q.label}, world ${r.tier}) dpr ${r.dpr}; dt p95 per 5 s: ${wins.join('/')}; p95 10–25 s ${p95.toFixed(1)} ms; gpu ${r.gpuMs.toFixed(1)} ms; bench ${r.bench ? r.bench.ms + ' ms → ' + r.bench.to : '-'}`);
  for (const l of log) console.log('      ' + l);
  const moves = r.qlog.filter(([, , , why]) => !/^bench/.test(why)).map(([t, a, b]) => ({ t: rel(t), d: Math.sign(b - a) }));
  let rev = 0;
  for (let i = 1; i < moves.length; i++) if (moves[i].d !== moves[i - 1].d) rev++;
  const winP95 = [10000, 15000, 20000].map((a) => pct(span(a, a + 5000), 0.95));
  const out = { ...r, p95, winP95, moves, rev, page };
  if (freeze) {
    await page.send('Page.setWebLifecycleState', { state: 'frozen' });
    await sleep(3000);
    await page.send('Page.setWebLifecycleState', { state: 'active' });
    await sleep(5000);
    const f = await page.eval('({ level: __iw2.host.debug.level, n: __iw2.host.debug.qlog.length, downs: __iw2.host.debug.governor.downs })');
    out.frozen = f;
  }
  if (api) {
    out.api = await page.eval(`(() => {
      const Q = __iw2.host.quality, seen = [];
      const off = Q.on((s) => seen.push(s.mode + ':' + s.level));
      const r = {};
      r.low = (Q.set('low'), Q.current());
      r.medium = (Q.set('medium'), Q.current());
      r.high = (Q.set('high'), Q.current());
      r.bad = Q.set('ultra');
      r.auto = (Q.set('auto'), Q.current());
      off();
      Q.set('low');
      r.after = seen.length;
      Q.set('auto');
      r.seen = seen;
      return JSON.parse(JSON.stringify(r));
    })()`);
  }
  out.errors = page.exceptions.slice();
  await page.close();
  return out;
}

const want = (k) => !ONLY.length || ONLY.includes(k);
const port = launch({ port: +(process.env.CDP_PORT || 9301) });
try {
  if (want('normal')) {
    const r = await run(port, { name: 'normal (Metal, no load)', query: '?nosave=1&demo=1', freeze: true, api: true });
    check(r.level === 0 && r.moves.length === 0, `stays on High: level ${r.level}, ${r.moves.length} governor steps`);
    check(!r.bench || r.bench.to === 0, `bench keeps High (${r.bench?.ms} ms, sync ${r.bench?.sync} ms)`);
    check(r.p95 <= 20, `dt p95 ${r.p95.toFixed(1)} ms ≤ 20`);
    check(r.frozen.level === 0 && r.frozen.downs === 0, `3 s freeze (hidden tab) then 5 s: level ${r.frozen.level}, downs ${r.frozen.downs}`);
    const a = r.api;
    check(a.low.level === 8 && a.low.mode === 'low' && a.low.label === 'low', `set('low') → level ${a.low.level} ${a.low.label}`);
    check(a.medium.level === 4 && a.medium.mode === 'medium', `set('medium') → level ${a.medium.level}`);
    check(a.high.level === 0 && a.high.mode === 'high', `set('high') → level ${a.high.level}`);
    check(a.bad === false && a.auto.mode === 'auto' && a.auto.auto, `set('ultra') rejected; set('auto') → ${a.auto.mode}`);
    check(a.seen.length >= 4 && a.after === a.seen.length, `on(fn) fired ${a.seen.length}× [${a.seen.join(' ')}], silent after off()`);
    check(!r.errors.length, `no exceptions ${r.errors.slice(0, 2).join(' | ')}`);
  }
  const slow = (r, label) => {
    check(r.level > 0, `${label}: stepped down to level ${r.level}`);
    check(r.p95 <= 34, `${label}: dt p95 10–25 s ${r.p95.toFixed(1)} ms ≤ 34`);
    check(r.rev === 0, `${label}: no oscillation (${r.rev} up/down reversals)`);
    // A heavier-than-usual machine can still be trimming the last rung or two after 15 s; that is convergence, not
    // instability. Unstable = any step back up, or a 5 s window over the gate.
    const late = r.moves.filter((m) => m.t > 15000);
    check(late.every((m) => m.d > 0) && r.winP95.every((x) => x <= 34), `${label}: stable after 10 s (5 s window p95 ${r.winP95.map((x) => x.toFixed(0)).join('/')} ms; ${late.length} late steps, all down)`);
    check(!r.errors.length, `${label}: no exceptions ${r.errors.slice(0, 2).join(' | ')}`);
  };
  if (want('gov')) slow(await run(port, { name: 'slow laptop, governor only', query: `?nosave=1&demo=1&gpuload=${LOAD}&bench=0`, cpu: 6 }), 'governor');
  if (want('bench')) {
    const r = await run(port, { name: 'slow laptop, boot bench + governor', query: `?nosave=1&demo=1&gpuload=${LOAD}`, cpu: 6 });
    check(r.bench && r.bench.to > 0, `bench picked level ${r.bench?.to} from ${r.bench?.ms} ms`);
    slow(r, 'bench');
  }
  if (want('falsify')) {
    const r = await run(port, { name: 'falsify: same load, governor off', query: `?nosave=1&demo=1&gpuload=${LOAD}&gov=0`, cpu: 6 });
    check(r.level === 0 && r.p95 > 34, `with ?gov=0 the p95 gate fails as it must (${r.p95.toFixed(1)} ms > 34, level ${r.level})`);
  }
} finally {
  stop(port);
}
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed');
process.exit(fails.length ? 1 : 0);
