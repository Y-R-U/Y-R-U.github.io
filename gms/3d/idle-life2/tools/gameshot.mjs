// node tools/gameshot.mjs out.png "tod=9" — the real game at S22 portrait (412×915 @3x), Metal; prints host perf + rAF frame times.
import { launch, stop, openPage, GAME, VIEWPORTS, sleep } from './cdp.mjs';
const [out, q = 'tod=9'] = process.argv.slice(2);
const port = launch({ port: +(process.env.CDP_PORT || 9451) });
try {
  const page = await openPage(port);
  await page.goto(GAME + '?nosave=1&demo=1&' + q, VIEWPORTS.s22);
  await page.wait('window.__il2 && window.__il2.ready', 20000);
  await sleep(3000);
  await page.eval(`(() => { window.__il2.host.debug.resetPerf(); window.__ft = []; let l = performance.now(); const f = (t) => { window.__ft.push(t - l); l = t; if (window.__ft.length < 400) requestAnimationFrame(f); }; requestAnimationFrame(f); })()`);
  await sleep(6000);
  const r = await page.eval(`(() => { const p = window.__il2.host.debug.perf, ft = window.__ft.slice(5).sort((a, b) => a - b); return { frames: p.frames, workAvg: +(p.workSum / Math.max(1, p.frames)).toFixed(2), workMax: +p.workMax.toFixed(1), heroCallsMax: p.heroCallsMax, cardCallsMax: p.cardCallsMax, rafP50: +ft[ft.length >> 1].toFixed(1), rafP95: +ft[Math.floor(ft.length * 0.95)].toFixed(1) }; })()`);
  await page.shot(out);
  console.log(JSON.stringify(r), page.exceptions.slice(0, 3));
  await page.close();
} finally { stop(port); }
