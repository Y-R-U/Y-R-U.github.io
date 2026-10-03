// node tools/prof-scroll.mjs [query] — CPU profile of the S22 phone scroll at CPU 4× (self + total ms per function). CDP_PORT default 9581.
import { launch, stop, openPage, GAME, sleep } from './cdp.mjs';
const QUERY = process.argv[2] || '?nosave=1&demo=1';
const S22_UA = 'Mozilla/5.0 (Linux; Android 14; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const port = launch({ port: +(process.env.CDP_PORT || 9581) });
try {
  const page = await openPage(port);
  await page.send('Page.enable');
  await page.send('Emulation.setUserAgentOverride', { userAgent: S22_UA, platform: 'Linux armv8l' });
  await page.goto(GAME + QUERY, { width: 412, height: 915, deviceScaleFactor: 2.625, mobile: true });
  await page.wait('window.__il2 && window.__il2.ready', 15000);
  await sleep(2500);
  await page.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await sleep(6000);
  await page.send('Profiler.enable');
  await page.send('Profiler.setSamplingInterval', { interval: 200 });
  await page.eval('__il2.host.debug.resetPerf()');
  await page.send('Profiler.start');
  await page.eval(`new Promise((done)=>{const el=document.scrollingElement;const best=el.scrollHeight-el.clientHeight;const t0=performance.now();const step=()=>{const t=performance.now()-t0;el.scrollTop=best*(0.5-0.5*Math.cos(Math.min(1,t/5000)*Math.PI*2));if(t<5000)requestAnimationFrame(step);else done();};requestAnimationFrame(step);})`, 30000);
  const { profile } = await page.send('Profiler.stop');
  const perf = await page.eval('JSON.stringify(__il2.host.debug.perf)');
  console.log(perf);
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const self = new Map(), total = new Map();
  const dts = profile.timeDeltas; let tot = 0;
  for (let i = 0; i < profile.samples.length; i++) {
    const dt = dts[i + 1] ?? 0; tot += dt;
    let id = profile.samples[i];
    const n = byId.get(id); const cf = n.callFrame;
    const key = (f) => `${f.functionName || '(anon)'} ${f.url.split('/').slice(-2).join('/').replace(/\?.*/, '')}:${f.lineNumber + 1}`;
    self.set(key(cf), (self.get(key(cf)) || 0) + dt);
    const seen = new Set();
    while (id) { const k = key(byId.get(id).callFrame); if (!seen.has(k)) { seen.add(k); total.set(k, (total.get(k) || 0) + dt); } id = parent.get(id); }
  }
  const show = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).forEach(([k, v]) => console.log((v / 1000).toFixed(0).padStart(6) + 'ms ' + (100 * v / tot).toFixed(1).padStart(5) + '% ' + k));
  console.log('--- self (total ' + (tot / 1000).toFixed(0) + 'ms)'); show(self, +(process.env.N || 45));
  console.log('--- total'); show(total, +(process.env.N || 60));
  await page.close();
} finally { stop(port); }
