// Blank-card gate. S22 profile (Android UA, 412×915, CPU 4×): every business BUILDING at once, then every business OPEN;
// scroll through every card (instant jumps with a dwell, then a continuous sweep down and up). An in-page sampler (60 ms)
// checks every card whose .line-view is ≥ 40% on screen by the DOM (not the host's IntersectionObserver): its 2D canvas
// is "blank" when it has no pixels or a 12×12 sample is uniform. Fails if any on-screen card stays blank > 1 s.
// Capture phase (what camshot and the blind critics see): while the builds finish one by one (each opening scrolls the
// page to that card), every card is screenshotted through cdp.mjs cardShot and the JPEG must not be a flat poster.
// `CDP_PORT=9301 node tools/test-cards.mjs [query]`
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { launch, stop, openPage, GAME, sleep, cardShot } from './cdp.mjs';

const QUERY = process.argv[2] || '?nosave=1&debug=1&tod=10';
const LIMIT = 1000;
const S22_UA = 'Mozilla/5.0 (Linux; Android 14; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const VP = { width: 412, height: 915, deviceScaleFactor: 2.625, mobile: true };
const fails = [];
const check = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (!ok) fails.push(msg); };

const SAMPLER = `(() => {
  if (window.__cardWatch) return;
  const s = document.createElement('canvas'); s.width = s.height = 12;
  const x = s.getContext('2d', { willReadFrequently: true });
  const W = window.__cardWatch = { streak: {}, worst: {}, samples: 0, seen: {} };
  const blank = (c) => {
    if (!c || !c.width || !c.height) return 'empty';
    x.clearRect(0, 0, 12, 12);
    x.drawImage(c, 0, 0, 12, 12);
    const p = x.getImageData(0, 0, 12, 12).data;
    let m = 0, m2 = 0, a = 0;
    for (let i = 0; i < p.length; i += 4) { const l = p[i] * 0.3 + p[i + 1] * 0.59 + p[i + 2] * 0.11; m += l; m2 += l * l; a += p[i + 3]; }
    const n = p.length / 4, sd = Math.sqrt(Math.max(0, m2 / n - (m / n) ** 2));
    if (a / n < 128) return 'transparent';
    return sd < 2 ? 'uniform' : '';
  };
  const tick = () => {
    const now = performance.now();
    W.samples++;
    for (const card of document.querySelectorAll('.line-card[data-line]')) {
      const id = card.dataset.line, view = card.querySelector('.line-view');
      if (card.hidden || !view) { delete W.streak[id]; continue; }
      const r = view.getBoundingClientRect();
      const vis = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)) / Math.max(1, r.height);
      if (vis < 0.4 || r.width < 20) { delete W.streak[id]; continue; }
      W.seen[id] = (W.seen[id] || 0) + 1;
      const why = blank(view.querySelector('canvas.view-canvas'));
      if (!why) { delete W.streak[id]; continue; }
      const st = W.streak[id] ||= { t0: now, why };
      const ms = now - st.t0;
      if (!W.worst[id] || ms > W.worst[id].ms) W.worst[id] = { ms: Math.round(ms), why, phase: W.phase };
    }
  };
  setInterval(tick, 60);
})()`;

const IDS = `[...document.querySelectorAll('.line-card[data-line]')].filter((c) => !c.hidden).map((c) => c.dataset.line)`;

async function sweep(page, label) {
  await page.eval(`window.__cardWatch.phase = ${JSON.stringify(label)}`);
  const ids = await page.eval(IDS);
  for (const id of ids) {
    await page.eval(`document.querySelector('.line-card[data-line="${id}"]').scrollIntoView({ block: 'center' })`);
    await sleep(1400);
  }
  await page.eval(`new Promise((done) => {
    const el = document.scrollingElement, room = el.scrollHeight - el.clientHeight, t0 = performance.now(), T = 6000;
    const step = () => { const t = performance.now() - t0; el.scrollTop = room * (0.5 - 0.5 * Math.cos(Math.min(1, t / T) * Math.PI * 2)); t < T ? requestAnimationFrame(step) : done(); };
    requestAnimationFrame(step);
  })`, 30000);
  await sleep(1200);
  return ids;
}

const port = launch({ port: +(process.env.CDP_PORT || 9301) });
try {
  const page = await openPage(port);
  await page.send('Page.enable');
  await page.send('Emulation.setUserAgentOverride', { userAgent: S22_UA, platform: 'Linux armv8l' });
  await page.goto(GAME + QUERY, VP);
  await page.wait('window.__iw2 && window.__iw2.ready', 30000);
  await sleep(2000);
  const bought = await page.eval(`(async () => { const g = window.__iw2.game, st = g.state; g.act('cheat', { cash: 1e18 }); st.bootstrap.done = true;
    const { DISTRICTS } = await import('./js/data/districts.js'); for (const d of DISTRICTS) if (!st.districts.includes(d.id)) st.districts.push(d.id);
    const { LINES } = await import('./js/data/lines.js');
    return LINES.map((l) => g.act('buy', { lineId: l.id }).ok ? l.id : null).filter(Boolean); })()`);
  // Builds must last the whole sweep: stretch every timer.
  await page.eval(`(() => { const b = window.__iw2.game.state.build; for (const k in b) b[k].T = Math.max(b[k].T, 600); })()`);
  await page.eval(SAMPLER);
  await page.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const nb = await page.eval(`Object.keys(window.__iw2.game.state.build).length`);
  console.log(`S22 CPU 4×: bought ${bought.length} (${nb} building)`);
  const ids1 = await sweep(page, 'building');
  await page.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  // Capture phase: dwell on card i like camshot (3 s), and meanwhile open the build four cards away, which yanks the page.
  await page.eval(`window.__cardWatch.phase = 'capture'`);
  const dir = tmpdir() + '/iw2-test-cards-' + process.pid, shots = [];
  for (let i = 0; i < ids1.length; i++) {
    const id = ids1[i], far = ids1[(i + 4) % ids1.length];
    await page.eval(`document.querySelector('.line-card[data-line="${id}"]').scrollIntoView({ block: 'center' })`);
    await sleep(800);
    await page.eval(`(() => { const b = window.__iw2.game.state.build['${far}']; if (b) b.t = b.T - 0.05; })()`);
    await sleep(2200);
    const p = await cardShot(page, id, `${dir}/${id}.jpg`).catch((e) => (console.log('    ' + e.message), null));
    shots.push([id, p]);
  }
  let sd = {};
  try {
    sd = JSON.parse(execFileSync('python3', ['-c', `import sys,json
from PIL import Image, ImageStat
print(json.dumps({a: round(ImageStat.Stat(Image.open(a).convert('L')).stddev[0], 1) for a in sys.argv[1:]}))`, ...shots.filter(([, p]) => p).map(([, p]) => p)]).toString());
  } catch (e) { console.log('    (pixel check needs python3 + PIL: ' + e.message.split('\n')[0] + ')'); }
  const flat = shots.filter(([, p]) => !p || (p in sd && sd[p] < 4)).map(([id, p]) => `${id}${p ? ' sd ' + sd[p] : ' no shot'}`);
  console.log(`    capture stddev: ${shots.map(([id, p]) => id + ' ' + (sd[p] ?? '?')).join(', ')}`);
  check(!flat.length, `every captured card shows the 3D view, not the flat poster (${flat.join(', ') || 'none'})`);
  await page.eval(`(() => { const b = window.__iw2.game.state.build; for (const k in b) b[k].t = b[k].T - 0.05; })()`);
  await page.wait(`Object.keys(window.__iw2.game.state.build).length === 0`, 20000).catch(() => {});
  await sleep(1500);
  await page.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const left = await page.eval(`Object.keys(window.__iw2.game.state.build).length`);
  const ids2 = await sweep(page, 'open');
  await page.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const w = await page.eval(`(() => ({ worst: window.__cardWatch.worst, seen: window.__cardWatch.seen, samples: window.__cardWatch.samples, perf: __iw2.host.debug.perf, tier: __iw2.host.debug.tier, mobile: __iw2.host.debug.device.mobile }))()`);
  console.log(`  tier ${w.tier} mobile ${w.mobile}; ${w.samples} samples; cards building ${ids1.length}, open ${ids2.length} (${left} still building)`);
  const all = [...new Set([...ids1, ...ids2])];
  check(nb >= 9, `all businesses building at once (${nb})`);
  check(left === 0, `all businesses open for the second sweep (${left} left)`);
  check(all.every((id) => w.seen[id]), `every card was on screen (${all.filter((id) => !w.seen[id]).join(',') || 'all'})`);
  const bad = Object.entries(w.worst).filter(([, v]) => v.ms > LIMIT);
  for (const [id, v] of Object.entries(w.worst)) console.log(`    ${id}: worst blank ${v.ms} ms (${v.why}, ${v.phase})`);
  check(!bad.length, `no on-screen card blank > ${LIMIT} ms (${bad.map(([id, v]) => `${id} ${v.ms}ms ${v.phase}`).join(', ') || 'none'})`);
  check(!page.exceptions.length, `no exceptions (${page.exceptions.slice(0, 2).join(' | ')})`);
  await page.close();
} finally {
  stop(port);
}
console.log(fails.length ? `\nFAILED ${fails.length}` : '\nPASS');
process.exit(fails.length ? 1 : 0);
