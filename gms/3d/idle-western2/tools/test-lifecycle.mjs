// ARCH §9.2 lifecycle suite: context loss (restore + recreate), recreate cap, freeze, hidden/offline once, bfcache,
// 2D canvas loss, watchdog, overlay presenter, and the falsification arm (?break=norecover must FAIL check b).
import { launch, stop, openPage, GAME, ORIGIN, VIEWPORTS, sleep } from './cdp.mjs';

const fails = [];
const check = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (!ok) fails.push(msg); return ok; };
const SNAP = `(() => {
  const h = __iw2.host, d = h.debug;
  const vis = d.listViews().filter(v => v.visible);
  return { presented: d.presented, frames: d.frames, restores: d.restores, recreations: d.recreations, lost: d.lost,
    paused: d.paused, stalls: d.stalls, ctx2dLost: d.ctx2dLost,
    views: vis.map(v => ({ id: v.id, presented: v.presented, ...d.sample(v.id) })) };
})()`;
const black = (s) => s.views.filter((v) => !(v.lum > 0.05 && v.alpha === 255)).map((v) => `${v.id}:${v.lum.toFixed(2)}/${v.alpha}`);
// Disposes every geometry, material and texture made before the loss (three re-uploads them on the next draw). A pre-loss
// dispose listener left talking to a live context warns "object does not belong to this context".
const CHURN = `(async () => {
  const seen = new Set(), sc = __iw2.world.scene;
  const d = (x) => { if (x && !seen.has(x)) { seen.add(x); x.dispose(); } };
  sc.traverse((o) => {
    d(o.geometry);
    for (const m of [].concat(o.material || [])) { d(m); for (const k in m) if (m[k]?.isTexture) d(m[k]); for (const u of Object.values(m.uniforms || {})) if (u.value?.isTexture) d(u.value); }
    if (o.shadow?.map) d(o.shadow.map);
  });
  d(sc.environment); d(sc.background?.isTexture ? sc.background : null);
  await new Promise((r) => setTimeout(r, 400));
  return seen.size;
})()`;
const ignorable = (c) => /CONTEXT_LOST|WebGL context was lost|loseContext|GL_CONTEXT_LOST|GPU stall|\[iw2\] save/i.test(c.text);

async function open(port, query, vp = VIEWPORTS.portrait) {
  const page = await openPage(port);
  await page.goto(GAME + query, vp);
  await page.wait('window.__iw2 && window.__iw2.ready', 12000);
  await sleep(700);
  return page;
}

function errorsOf(page) {
  const bad = page.consoleLog.filter((c) => (c.type === 'error' || c.type === 'warning') && (!c.url || c.url.startsWith(ORIGIN)) && !ignorable(c));
  return [...bad.map((c) => c.type + ': ' + c.text), ...page.exceptions];
}

async function noRestoreArm(port, query) {
  const page = await open(port, query);
  await sleep(1000);
  await page.eval('window.__t0 = performance.now(); __iw2.host.debug.loseContext()');
  const t0 = Date.now();
  let s;
  while (Date.now() - t0 < 6000) {
    s = await page.eval(SNAP);
    if (s.recreations >= 1) break;
    await sleep(100);
  }
  const p1 = s.presented;
  await sleep(500);
  const s2 = await page.eval(SNAP);
  if (s2.recreations) await page.eval(CHURN);
  const ms = s2.recreations ? await page.eval('Math.round(__iw2.host.debug.recreatedAt - window.__t0)') : Infinity;
  if (s2.recreations) console.log('    ' + await page.eval('`detected +${Math.round(__iw2.host.debug.lossAt - window.__t0)} ms, recreate took ${Math.round(__iw2.host.debug.recreateMs)} ms`'));
  const r = { recreated: s2.recreations === 1 && ms <= 3500, ms, advanced: s2.presented > p1, black: black(s2), errs: errorsOf(page) };
  await page.close();
  return r;
}

for (const u of ['http://localhost:7867/api/status', 'http://localhost:7866/api/status']) {
  try {
    const r = await (await fetch(u, { signal: AbortSignal.timeout(1500) })).json();
    if (r.running_job_id) console.log(`[GPU busy: ${u.includes('7867') ? 'Flux' : 'LTX'} is generating — frame timings (b) may run slow]`);
  } catch {}
}
const port = launch({ port: +(process.env.CDP_PORT || 9311) });
try {
  console.log('(a) loseContext → frozen frames survive → restoreContext');
  {
    const page = await open(port, '?nosave=1&debug=1&demo=1');
    const s0 = await page.eval(SNAP);
    const s1 = JSON.parse(await page.eval(`(async () => {
      __iw2.host.debug.loseContext();
      await new Promise(r => setTimeout(r, 300));
      const s = ${SNAP};
      __iw2.host.debug.restoreContext();
      return JSON.stringify(s);
    })()`));
    check(s1.lost && !black(s1).length, `while lost: views keep last frame (${s1.views.length} visible, black: ${black(s1).join(' ') || 'none'})`);
    await sleep(900);
    const s2 = await page.eval(SNAP);
    check(s2.restores === 1 && !s2.lost && s2.presented > s1.presented && s2.recreations === 0,
      `restored: restores=${s2.restores} recreations=${s2.recreations} presented ${s1.presented}→${s2.presented}`);
    check(!black(s2).length, 'after restore: no black view');
    check(s0.presented > 0, 'baseline presented');
    const n = await page.eval(CHURN);
    const s3 = await page.eval(SNAP);
    check(n > 20 && s3.presented > s2.presented && !black(s3).length, `pre-loss resources disposed after restore (${n}), still rendering`);
    const e = errorsOf(page);
    check(!e.length, 'no errors' + e.map((x) => '\n    ' + x).join(''));
    await page.close();
  }

  console.log('(b) loseContext, restore never fires → recreate within 3.5 s');
  const b = await noRestoreArm(port, '?nosave=1&debug=1&demo=1');
  check(b.recreated, `recreated ${b.ms} ms after the loss (page clock, ≤ 3500)`);
  check(b.advanced, 'frames advance after recreate');
  check(!b.black.length, 'no black view after recreate ' + b.black.join(' '));
  check(!b.errs.length, 'no errors' + b.errs.map((x) => '\n    ' + x).join(''));

  console.log('(f) falsification: same arm with ?break=norecover must fail');
  const f = await noRestoreArm(port, '?nosave=1&debug=1&demo=1&break=norecover');
  const armFails = !(f.recreated && f.advanced);
  check(armFails, `broken build fails check (b): recreated=${f.recreated} advanced=${f.advanced}`);

  console.log('(g) recreate cap: 4 losses in a minute → graphics:paused, restart() recovers');
  {
    const page = await open(port, '?nosave=1&debug=1');
    await page.eval(`window.__paused = 0; __iw2.bus.on('graphics:paused', () => window.__paused++)`);
    for (let i = 0; i < 4; i++) {
      await page.eval('__iw2.host.debug.loseContext()');
      await sleep(2900);
    }
    const s = await page.eval(SNAP);
    const pausedEv = await page.eval('window.__paused');
    check(s.recreations === 3 && s.paused && pausedEv === 1, `recreations=${s.recreations} paused=${s.paused} events=${pausedEv}`);
    check(!black(s).length, 'paused: views keep last frame');
    const ok = await page.eval('__iw2.host.restart()');
    await sleep(600);
    const s2 = await page.eval(SNAP);
    check(ok && !s2.paused && s2.presented > s.presented && !black(s2).length, `restart(): ok=${ok} presented ${s.presented}→${s2.presented}`);
    await page.close();
  }

  console.log('(c) freeze → active: save written on freeze, full repaint on resume');
  {
    const page = await open(port, '?reset=1&debug=1');
    await page.eval(`(() => { const g = __iw2.game; const L = g.data.lines[0]; for (let i = 0; i < Math.ceil(L.baseCost / g.data.econ.bootTap); i++) g.act('tap'); g.act('unlock', { lineId: L.id }); })()`);
    await sleep(300);
    const before = await page.eval(`({ saved: (JSON.parse(localStorage.getItem('iw2.save') || '{}').savedAt || 0), res: __iw2.lifecycle.stats.resumes, vis: __iw2.host.debug.listViews().filter(v => v.visible).map(v => [v.id, v.presented]) })`);
    let frozeOk = true;
    try {
      await page.send('Page.setWebLifecycleState', { state: 'frozen' });
      await sleep(400);
      await page.send('Page.setWebLifecycleState', { state: 'active' });
      await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    } catch (e) { frozeOk = false; console.log('    setWebLifecycleState unsupported: ' + e.message); }
    await page.eval('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
    const after = await page.eval(`({ saved: (JSON.parse(localStorage.getItem('iw2.save') || '{}').savedAt || 0), freezes: __iw2.lifecycle.stats.freezes, res: __iw2.lifecycle.stats.resumes, vis: __iw2.host.debug.listViews().filter(v => v.visible).map(v => [v.id, v.presented]) })`);
    const repainted = after.vis.every(([id, n]) => n > (before.vis.find((x) => x[0] === id)?.[1] ?? 0));
    check(frozeOk && after.freezes >= 1 && after.saved > before.saved, `freeze event seen (${after.freezes}), save written (${before.saved} → ${after.saved})`);
    check(after.res === before.res + 1, `exactly one resume (${before.res} → ${after.res})`);
    check(repainted, `every visible view repainted within 2 frames (${after.vis.map((v) => v.join(':')).join(' ')})`);
    await page.close();
  }

  console.log('(d) hidden 60 s → offline credited once, duplicate return signals ignored, resume repaints all');
  {
    const page = await open(port, '?nosave=1&debug=1&demo=1');
    const r = await page.eval(`(() => {
      const L = __iw2.lifecycle, g = __iw2.game, d = __iw2.host.debug;
      let offline = 0; g.on('offline', () => offline++);
      const res0 = L.stats.resumes, cash0 = g.state.cash, inc = g.totals().incomePerSec;
      const pv0 = Object.fromEntries(d.listViews().filter(v => v.visible).map(v => [v.id, v.presented]));
      const pay = L.simulate('hidden', 60000);
      dispatchEvent(new Event('focus'));
      dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }));
      document.dispatchEvent(new Event('resume'));
      const cash1 = g.state.cash;
      window.__pv0 = pv0;
      return { awaySec: pay && pay.awaySec, resumes: L.stats.resumes - res0, offline, gain: cash1 - cash0, expect: inc * 60 };
    })()`);
    check(Math.abs(r.awaySec - 60) < 1, `awaySec ${r.awaySec?.toFixed(1)}`);
    check(r.resumes === 1 && r.offline === 1, `one resume (${r.resumes}), one offline credit (${r.offline})`);
    const err = r.expect > 0 ? Math.abs(r.gain - r.expect) / r.expect : 1;
    check(r.expect > 0 && err <= 0.01, `cash +${r.gain.toFixed(1)} vs expected ${r.expect.toFixed(1)} (${(err * 100).toFixed(2)}%)`);
    await page.eval('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
    const rep = await page.eval(`__iw2.host.debug.listViews().filter(v => v.visible).map(v => [v.id, v.presented - (window.__pv0[v.id] ?? 0)])`);
    check(rep.length > 1 && rep.every(([, n]) => n >= 1), `resume repaints every visible view ignoring K (${rep.map((v) => v.join('+')).join(' ')})`);
    await page.close();
  }

  console.log('(e) navigate away + back (bfcache or cold boot)');
  {
    const page = await open(port, '?debug=1&demo=1');
    await page.eval(`window.__mark = 1; __iw2.game.act('tapPile', { lineId: __iw2.game.data.lines[0].id })`);
    await sleep(400);
    const hist0 = await page.send('Page.getNavigationHistory');
    await page.send('Page.navigate', { url: ORIGIN + '/gms/3d/idle-western2/favicon.svg' });
    await sleep(6000);
    const hist = await page.send('Page.getNavigationHistory');
    const back = hist.entries[hist.currentIndex - 1];
    await page.send('Page.navigateToHistoryEntry', { entryId: back.id });
    await page.wait('window.__iw2 && window.__iw2.ready', 12000);
    const kind = await page.eval('window.__mark === 1 ? "bfcache" : "cold"');
    if (kind === 'bfcache') {
      const p0 = await page.eval('__iw2.host.debug.presented');
      await page.eval('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
      const s = await page.eval(SNAP);
      const st = await page.eval('__iw2.lifecycle.stats');
      check(st.bfcache >= 1 && s.presented > p0 && !black(s).length, `bfcache restore: bfcache=${st.bfcache}, repainted within 2 frames, non-black`);
    } else {
      await sleep(500);
      const s = await page.eval(SNAP);
      const harvest = await page.eval('Object.keys(__iw2.game.state.returnHarvest || {}).length');
      check(s.presented > 0 && !black(s).length, `cold boot (bfcache not used: ${hist0.entries.length} entries) renders non-black`);
      check(harvest > 0, `cold boot credited offline time (returnHarvest on ${harvest} lines)`);
    }
    await page.close();
  }

  console.log('(h) 2D canvas contextlost → view repainted; (i) wedged rAF → watchdog → loop restarted');
  {
    const page = await open(port, '?nosave=1&debug=1');
    const p0 = await page.eval(`__iw2.host.debug.listViews().find(v => v.id === 'hero').presented`);
    await page.eval(`__iw2.host.debug.lose2d('hero')`);
    await page.eval('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
    const s = await page.eval(`({ n: __iw2.host.debug.listViews().find(v => v.id === 'hero').presented, lost: __iw2.host.debug.ctx2dLost, ...__iw2.host.debug.sample('hero') })`);
    check(s.lost === 1 && s.n > p0 && s.lum > 0.05 && s.alpha === 255, `2D loss handled: ctx2dLost=${s.lost} hero repainted (${p0}→${s.n})`);
    await page.eval(`window.__raf = window.requestAnimationFrame; window.requestAnimationFrame = () => 0`);
    await sleep(2600);
    const st0 = await page.eval(SNAP);
    await page.eval(`window.requestAnimationFrame = window.__raf`);
    await sleep(2200);
    const st1 = await page.eval(SNAP);
    check(st0.stalls >= 1 && st1.frames > st0.frames + 5, `watchdog: stalls=${st0.stalls}, frames ${st0.frames}→${st1.frames} after rAF returns`);
    await page.close();
  }

  console.log('(k) overlay presenter smoke');
  {
    const page = await open(port, '?nosave=1&debug=1&presenter=overlay');
    await sleep(800);
    const s = await page.eval(SNAP);
    const e = errorsOf(page);
    check(s.presented > 10 && s.views.some((v) => v.id === 'hero' && v.lum > 0.05), `overlay presents (${s.presented}), hero sampled lum ${s.views.find((v) => v.id === 'hero')?.lum.toFixed(2)}`);
    check(!e.length, 'overlay: no errors' + e.map((x) => '\n    ' + x).join(''));
    await page.close();
  }

  console.log('(l) shared actors: each card shows only its own line; economy tip couriers are pickable');
  {
    const page = await open(port, '?nosave=1&debug=1&demo=1&fast=4');
    await sleep(4000);
    const r = await page.eval(`(() => {
      const sc = __iw2.world.scene, ids = __iw2.game.state && Object.keys(__iw2.game.state.lines);
      const meshes = sc.children.filter(o => /^actors:(van|courier|boat|drone|walker)$/.test(o.name));
      const count = () => meshes.reduce((a, m) => a + (m.visible ? m.count : 0), 0);
      const fill = (line) => sc.onBeforeRender(__iw2.host.renderer, sc, { userData: line ? { iw2Line: line } : {} }, null);
      fill(null);
      const hero = count();
      let sum = 0, worst = 0;
      for (const id of ids) { fill(id); const n = count(); sum += n; worst = Math.max(worst, n); }
      return { hero, sum, worst, lines: ids.length };
    })()`);
    check(r.hero > 4 && r.sum === r.hero, `per-card actors sum to the hero set (hero ${r.hero}, Σ cards ${r.sum}, max per card ${r.worst})`);
    const tip = await page.wait(`(() => {
      const c = __iw2.game.state.couriers?.[0], sh = __iw2.shipments;
      const s = c && sh.list.find(x => x.tipId === c.id);
      if (!s) return null;
      const p = sh.place(s, __iw2.game.simTime);
      if (p.stage !== 'plot' || p.u < 0.1 || p.u > 0.3) return null;
      __iw2.game.tick = () => {};
      return c;
    })()`, 40000).catch(() => null);
    let hit = null;
    if (tip) {
      await page.eval(`document.querySelector('[data-line="${tip.lineId}"]')?.scrollIntoView({ block: 'center' }); __iw2.world.heroRig.pin('${tip.lineId}')`);
      await sleep(2500);
      for (let i = 0; i < 20 && !(hit && hit.kind === 'courier'); i++) {
        await sleep(200);
        hit = await page.eval(`(() => {
          const h = __iw2.host, sc = __iw2.world.scene, m = sc.getObjectByName('actors:mark'), M = new sc.matrixWorld.constructor();
          for (const id of ['line:${tip.lineId}', 'hero']) {
            sc.onBeforeRender(h.renderer, sc, { userData: id === 'hero' ? {} : { iw2Line: '${tip.lineId}' } }, null);
            const el = id === 'hero' ? document.querySelector('.hero-view') : document.querySelector('[data-line="${tip.lineId}"] .line-view');
            if (!m || !m.visible || !el) continue;
            const rect = el.getBoundingClientRect();
            for (let i = 0; i < m.count; i++) {
              m.getMatrixAt(i, M);
              const e = M.elements, pr = h.project(id, [e[12], e[13] - 1.4, e[14]]);
              if (pr.visible) { const r = h.pick(id, rect.left + pr.x, rect.top + pr.y); if (r) return { ...r, view: id }; }
            }
          }
          return null;
        })()`);
      }
    }
    const ok = hit && hit.kind === 'courier' && hit.id === tip.id && hit.shipmentId > 0;
    const act = ok ? await page.eval(`__iw2.game.act('courierTap', { lineId: '${tip.lineId}', shipmentId: ${hit.shipmentId} }).ok`) : false;
    const again = ok ? await page.eval(`(() => { const s = __iw2.shipments.list.find(x => x.id === ${hit.shipmentId}); return !!(s && s.pick); })()`) : true;
    check(ok && act && !again, `tip courier (${tip ? tip.id + ' on ' + tip.lineId : 'no tip in 40 s'}) picked as ${hit ? hit.kind + ' in ' + hit.view : 'none'}, courierTap ok=${act}, no longer pickable=${!again}`);
    await page.close();
  }
} finally {
  stop(port);
}
console.log(fails.length ? `\nFAILED ${fails.length}` : '\nPASS');
process.exit(fails.length ? 1 : 0);
