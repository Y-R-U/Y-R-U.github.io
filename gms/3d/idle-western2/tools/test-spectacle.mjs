// W10 perf gate (lane S): S22 Ultra portrait, CPU 4×, a Bar Brawl + a construction + a fling (+ every ambient gag and a
// piano frenzy asking for the stage at once) in the hero. Arm A (budget on) must PASS; arm B (?nobudget=1, the director's
// actor/particle budget and single slot disabled) must FAIL — otherwise the gate proves nothing (falsify the instrument).
// Budgets: frame dt p95 ≤ 20 ms, rAF work p95 ≤ max(8, no-storm baseline + 1.0) ms (the engine baseline is not
// this lane's to fix; a run reports it), draw calls ≤ 250, and the W10 caps: ≤ 6 animated actors,
// ≤ 24 crowd extras, ≤ 256 particles, spectacle ≤ 14 draws.
// Occlusion (Aaron: "my view was blocked by a wagon"): duels (real, ambient, vignette) from hero positions with known
// street clutter (the saloon's paddy wagon, the town's covered wagon, porch crowds, shipments); during the standoff no
// single non-cast mesh may cover > 15% of either duellist (ray samples over the body, tools/occl.mjs). Arm O1 (fix on)
// must pass, O2 (`?nooccl=1`: the occluder cut and duel-lane zones off) must fail. `CDP_PORT=9351 node tools/test-spectacle.mjs`
import { launch, stop, openPage, GAME, sleep } from './cdp.mjs';
import { OCCL_PROBE, occlSample } from './occl.mjs';

const S22_UA = 'Mozilla/5.0 (Linux; Android 14; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const VP = { width: 412, height: 915, deviceScaleFactor: 2.625, mobile: true };
const BASE = '?nosave=1&demo=1&debug=1&tod=17';
let WORK = 8;
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

// The demand: everything that wants the stage, fired together and re-fired through the window.
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
  window.__storm = setInterval(() => {
    s.play('eject', { id: 'gate' + Math.random(), kind: 'drunk', level: 100, autoAfter: 0.8 });
    if (!s.scenes.includes('brawl')) s.play('brawl');
    for (const id of ['barrel', 'chickens', 'pomfrey', 'mortimer']) s.gag(id);
  }, 1500);
  return { build: !!g.state.build.garter, buy: window.__buy && window.__buy.ok };
})()`;

async function arm(port, query, label, storm = true) {
  const page = await openPage(port);
  await page.send('Page.enable');
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: RAF_PROBE });
  await page.send('Emulation.setUserAgentOverride', { userAgent: S22_UA, platform: 'Linux armv8l' });
  await page.goto(GAME + query, VP);
  await page.wait('!!(window.__iw2 && window.__iw2.ready && window.__iw2.world.spectacle)', 45000);
  await sleep(2500);
  await page.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await sleep(6000);
  const st = storm ? await page.eval(STORM) : 'none';
  await sleep(1500);
  // Three 6 s windows; timing uses the best window (other lanes share this machine, contention only adds),
  // caps use the worst. Every window is under the full storm.
  const wins = [];
  let r = null;
  for (let k = 0; k < 3; k++) {
    await page.eval('__iw2.host.debug.resetPerf(); window.__frames.length = 0; window.__calls = window.__calls || 0;');
    await page.eval(`(() => { const t0 = performance.now(); const tick = () => { const d = __iw2.world.spectacle.debug; window.__calls = Math.max(window.__calls, d.calls); if (performance.now() - t0 < 6000) requestAnimationFrame(tick); }; requestAnimationFrame(tick); })()`);
    await sleep(6000);
    r = await page.eval(`(() => { const d = __iw2.host.debug, s = __iw2.world.spectacle;
      return { frames: window.__frames.slice(), perf: d.perf, tier: d.tier, dpr: d.dpr, sp: { ...s.debug }, calls: window.__calls, scenes: s.scenes, budget: s.budget(), building: !!__iw2.game.state.build.garter }; })()`);
    const fr = r.frames;
    wins.push({ dt: pct(fr.slice(1).map((f, i) => f[0] - fr[i][0]), 0.95), work: pct(fr.map((f) => f[1]), 0.95), calls: r.perf.callsMax, n: fr.length });
  }
  await page.eval('clearInterval(window.__storm)');
  await page.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const errs = [...page.exceptions, ...page.consoleLog.filter((c) => c.type === 'error').map((c) => c.text)];
  await page.close();
  const sp = r.sp;
  const dt = Math.min(...wins.map((w) => w.dt)), wk = Math.min(...wins.map((w) => w.work)), callsMax = Math.max(...wins.map((w) => w.calls));
  const checks = [
    [dt <= 20, `frame dt p95 ≤ 20 ms (best ${dt.toFixed(1)}; windows ${wins.map((w) => w.dt.toFixed(1)).join('/')})`],
    [wk <= WORK, `rAF work p95 ≤ ${WORK.toFixed(2)} ms (best ${wk.toFixed(2)}; windows ${wins.map((w) => w.work.toFixed(2)).join('/')})`],
    [callsMax <= 250, `draw calls ≤ 250 (${callsMax})`],
    [sp.maxActors <= 6, `animated actors ≤ 6 (max ${sp.maxActors})`],
    [sp.maxExtras <= 24, `crowd extras ≤ 24 (max ${sp.maxExtras})`],
    [sp.maxParticles <= 256, `particles ≤ 256 (max ${sp.maxParticles})`],
    [r.calls <= 14, `spectacle draws ≤ 14 (max ${r.calls})`],
    [!errs.length, `no errors (${errs.length}${errs.length ? ': ' + errs[0].slice(0, 120) : ''})`],
  ];
  console.log(`${label}: tier ${r.tier} dpr ${r.dpr}, ${wins.map((w) => (w.n / 6).toFixed(0)).join('/')} fps, storm ${JSON.stringify(st)}, still building ${r.building}, budget ${r.budget}, denied ${sp.denied}, scenes [${r.scenes}]`);
  for (const [ok, m] of checks) console.log((ok ? '  ok   ' : '  FAIL ') + m);
  return { work: wk, pass: checks.every((c) => c[0]), checks, timingFail: !checks[0][0] || !checks[1][0] };
}

const OCC_CASES = [['saloon', 'duel'], ['tubs', 'amb'], ['shine', 'amb'], ['dentist', 'vig'], ['garter', 'duel'], ['jail', 'duel']];
const OCC_START = { duel: "s.playScene('duel', {})", amb: "s.playScene('duel', { ambient: true, staged: true })", vig: "s.gag('duel')" };
const OCC_AT = { duel: [3.4, 4.0, 5.1], amb: [3.2, 3.8, 4.5], vig: [2.0, 2.8, 3.6] };
async function occlArm(port, query, label) {
  const page = await openPage(port);
  await page.send('Emulation.setUserAgentOverride', { userAgent: S22_UA, platform: 'Linux armv8l' });
  await page.goto(GAME + query, VP);
  await page.wait('!!(window.__iw2 && window.__iw2.ready && window.__iw2.world.spectacle)', 45000);
  await sleep(2500);
  await page.eval(OCCL_PROBE);
  let worst = { f: 0 }, n = 0;
  const lines = [];
  for (const [v, m] of OCC_CASES) {
    await page.eval(`__iw2.world.heroRig.pin('${v}'), 1`);
    await sleep(3000);
    if (!(await page.eval(`(() => { const s = __iw2.world.spectacle; s.stop(); window.__sc = ${OCC_START[m]}; return !!window.__sc; })()`))) { lines.push(`${v}/${m}: no scene`); continue; }
    let caseWorst = { f: 0 };
    for (const at of OCC_AT[m]) {
      for (let i = 0; i < 400; i++) { if ((await page.eval('window.__sc.t')) >= at) break; await sleep(25); }
      const r = await occlSample(page);
      for (const a of r?.actors || []) {
        if (!a.n) continue;
        n++;
        for (const [mesh, o] of Object.entries(a.by)) if (o.n / a.n > caseWorst.f) caseWorst = { f: o.n / a.n, mesh, who: a.char, at };
      }
    }
    lines.push(`${v}/${m}: worst ${(caseWorst.f * 100).toFixed(0)}%${caseWorst.mesh ? ` (${caseWorst.mesh} over ${caseWorst.who} at ${caseWorst.at}s)` : ''}`);
    if (caseWorst.f > worst.f) worst = { ...caseWorst, v, m };
    await page.eval('__iw2.world.spectacle.stop(), 1');
  }
  const errs = [...page.exceptions, ...page.consoleLog.filter((c) => c.type === 'error').map((c) => c.text)];
  await page.close();
  const checks = [
    [n >= 20, `duellists sampled in frame (${n} actor samples)`],
    [worst.f <= 0.15, `no non-cast mesh covers > 15% of a duellist in the standoff (worst ${(worst.f * 100).toFixed(0)}%${worst.mesh ? ': ' + worst.mesh + ' over ' + worst.who + ' in ' + worst.v + '/' + worst.m : ''})`],
    [!errs.length, `no errors (${errs.length}${errs.length ? ': ' + errs[0].slice(0, 120) : ''})`],
  ];
  console.log(`${label}: ${lines.join(' · ')}`);
  for (const [ok, msg] of checks) console.log((ok ? '  ok   ' : '  FAIL ') + msg);
  return { pass: checks.every((c) => c[0]), occluded: !checks[1][0] };
}

const port = launch({ port: +(process.env.CDP_PORT || 9351) });
let code = 0;
try {
  if (process.env.ONLY !== 'occl') {
  const z = await arm(port, BASE, '0 baseline, no storm (sets the work allowance)', false);
  WORK = Math.max(8, z.work + 1.0);
  console.log(`  → rAF work allowance for the storm arms: ${WORK.toFixed(2)} ms (max(8, baseline + 1.0))\n`);
  const a = await arm(port, BASE, 'A budget ON (must pass)');
  const b = await arm(port, BASE + '&nobudget=1', 'B budget OFF (must fail)');
  if (!a.pass) { console.log('\nGATE FAILED: the budgeted storm misses the W10 contract'); code = 1; }
  if (b.pass) { console.log('\nFALSIFICATION FAILED: the gate passed with the budget disabled, so it proves nothing'); code = 1; }
  else console.log(`\nfalsification ok: arm B fails (${b.checks.filter((c) => !c[0]).length} checks${b.timingFail ? ', including frame time' : ', caps only — frame time held'})`);
  console.log('');
  }
  const o1 = await occlArm(port, '?nosave=1&demo=1&debug=1&tod=15', 'O1 occluder cut ON (must pass)');
  const o2 = await occlArm(port, '?nosave=1&demo=1&debug=1&tod=15&nooccl=1', 'O2 occluder cut OFF (must fail)');
  if (!o1.pass) { console.log('\nGATE FAILED: a non-cast mesh blocks a duellist'); code = 1; }
  if (!o2.occluded) { console.log('\nFALSIFICATION FAILED: the occlusion check passed with the occluder cut disabled'); code = 1; }
  else console.log('\nfalsification ok: arm O2 sees a duellist blocked');
} finally { stop(port); }
console.log(code ? 'FAIL' : 'PASS');
process.exit(code);
