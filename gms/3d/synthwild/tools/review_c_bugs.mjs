// R3 reviewer C: bug repros.  node tools/review_c_bugs.mjs [T1,T2,...]  (local server :8861, headless Chrome :9335)
//   T1 survival place overwrites a solid / Coreplate cell when the hit face is not on the cell grid (no drop, no tool)
//   T2 placing into a water cell, and the aim ray passing through water
//   T3 Floor Fall re-breaks every fallen tile every frame (setBox calls, sparks, ms per frame)
//   T4 portrait rotation mid-game: the "turn your device" overlay does not pause the game
//   T5 settings changed mid-game (quality, render distance, fov, narrator mid-line)
//   T6 tree felling cost
//   T7 lifecycle counters across world and mini-game cycles (intervals, window/document listeners, bus handlers, audio)
//   T8 long session: 30 in-game minutes of survival simulated in-page
//   T9 Siege HP ring: geometries created per second
import { launch, open, stopBrowser, sleep } from './qa_cdp.mjs';

const PORT = 9335;
const BASE = 'http://localhost:8861/gms/3d/synthwild/';
const want = (process.argv[2] || 'T1,T2,T3,T4,T5,T6,T7,T8,T9').split(',');
const results = {};

// counters injected before any page script runs
const PRELUDE = `(() => {
  const C = window.__rc0 = { intervals: new Set(), timeouts: 0, win: {}, doc: {}, audioEls: 0, mes: 0 };
  const si = setInterval, ci = clearInterval;
  window.setInterval = function (...a) { const id = si.apply(this, a); C.intervals.add(id); return id; };
  window.clearInterval = function (id) { C.intervals.delete(id); return ci.call(this, id); };
  const wrapT = (T, bag) => { const a = T.addEventListener, r = T.removeEventListener;
    T.addEventListener = function (t, f, o) { bag[t] = (bag[t] || 0) + 1; return a.call(this, t, f, o); };
    T.removeEventListener = function (t, f, o) { bag[t] = (bag[t] || 0) - 1; return r.call(this, t, f, o); }; };
  wrapT(window, C.win); wrapT(document, C.doc);
  const A = window.Audio; window.Audio = function (...a) { C.audioEls++; return new A(...a); }; window.Audio.prototype = A.prototype;
  const AC = window.AudioContext; if (AC) { const m = AC.prototype.createMediaElementSource; AC.prototype.createMediaElementSource = function (...a) { C.mes++; return m.apply(this, a); }; }
})();`;

async function page(port, { mobile = false, url, prelude = false } = {}) {
  const pg = await open(port);
  if (mobile) await pg.viewport({ width: 915, height: 412, mobile: true, dpr: 2 });
  else await pg.viewport({ width: 1280, height: 720 });
  if (prelude) await pg.send('Page.addScriptToEvaluateOnNewDocument', { source: PRELUDE });
  await pg.clearOrigin(BASE);
  await pg.goto(BASE + url);
  return pg;
}
const playing = (pg) => pg.waitFor(`window.__game?.ctx?.ui?.shell?.state === 'playing' && window.__game.ctx.player?.ready`, { timeout: 90000 });

const port = await launch(PORT, ['--use-angle=metal', '--js-flags=--expose-gc', '--enable-precise-memory-info', '--autoplay-policy=no-user-gesture-required']);
try {
  if (want.includes('T1')) {
    const pg = await page(port, { url: '?play=1&nointro&seed=bugplace' });
    await playing(pg); await pg.eval('window.__game.ctx.ui.shell.noAutoPause = true'); await sleep(2500);
    results.T1 = await pg.game(`
      const W = C.world, P = C.player, B = C.brush, inv = C.game.inv, items = C.game.items;
      const { placeBox } = await import('./js/player/brushmath.js');
      const { BLOCK } = await import('./js/data/blocks.js');
      const out = {};
      const run = (above, label) => {
        const x = Math.floor(P.pos.x) + 4, z = Math.floor(P.pos.z), y0 = Math.floor(W.surfaceY(x + 0.5, z + 0.5)) + 1;
        W.setBox([x * 4, y0 * 4, z * 4], [x * 4 + 4, y0 * 4 + 12, z * 4 + 4], 0, 'fill', { flow: false });
        W.setBox([x * 4, y0 * 4, z * 4], [x * 4 + 4, y0 * 4 + 2, z * 4 + 4], BLOCK.LOAM_MESH, 'fill', { flow: false });   // half slab
        W.setBox([x * 4, (y0 + 1) * 4, z * 4], [x * 4 + 4, (y0 + 2) * 4, z * 4 + 4], above, 'fill', { flow: false });   // full block above it
        const hit = { sub: [x * 4 + 1, y0 * 4 + 1, z * 4 + 1], normal: [0, 1, 0], mat: BLOCK.LOAM_MESH };   // top face of the slab
        B.setScale(1);
        inv.setSlot(inv.sel, items.id('polymer_brick'), 5);
        const before = { cellAbove: W.getCell(x, y0 + 1, z), subAbove: W.getSub(x * 4, (y0 + 1) * 4, z * 4), bricks: inv.count(items.id('polymer_brick')), drops: C.game.drops.list.length };
        const box = placeBox(hit.sub, hit.normal, 1, [1, 1, 1]);
        let removed = null; const off = C.bus.on('block:place', (e) => { removed = e.changed; });
        const ok = B._doPlace(box, 'fill'); off();
        const after = { cellAbove: W.getCell(x, y0 + 1, z), subAbove: W.getSub(x * 4, (y0 + 1) * 4, z * 4), bricks: inv.count(items.id('polymer_brick')), drops: C.game.drops.list.length };
        out[label] = { box, placed: ok, changedSubs: removed, before, after, overwrote: before.subAbove !== after.subAbove };
      };
      run(BLOCK.BASALT_MATRIX, 'basaltAbove');
      run(BLOCK.COREPLATE, 'coreplateAbove');
      return out;`);
    await pg.close();
  }

  if (want.includes('T2')) {
    const pg = await page(port, { url: '?play=1&nointro&seed=bugwater' });
    await playing(pg); await pg.eval('window.__game.ctx.ui.shell.noAutoPause = true'); await sleep(2500);
    results.T2 = await pg.game(`
      const W = C.world, P = C.player, B = C.brush, inv = C.game.inv, items = C.game.items;
      const { placeBox, breakBox } = await import('./js/player/brushmath.js');
      const { BLOCK } = await import('./js/data/blocks.js');
      const x = Math.floor(P.pos.x) + 5, z = Math.floor(P.pos.z), s = Math.floor(W.surfaceY(x + 0.5, z + 0.5));
      // a 3x3 pit 2 deep, filled with water, rim of basalt
      W.setBox([(x - 2) * 4, (s - 2) * 4, (z - 2) * 4], [(x + 3) * 4, (s + 1) * 4, (z + 3) * 4], BLOCK.BASALT_MATRIX, 'fill', { flow: false });
      W.setBox([(x - 1) * 4, (s - 1) * 4, (z - 1) * 4], [(x + 2) * 4, (s + 1) * 4, (z + 2) * 4], BLOCK.WATER, 'fill', { flow: false });
      W.setBox([(x - 2) * 4, (s + 1) * 4, (z - 2) * 4], [(x + 3) * 4, (s + 5) * 4, (z + 3) * 4], 0, 'fill', { flow: false });
      const ray = W.raycast([x + 0.5, s + 3.5, z + 0.5], [0, -1, 0], 8);
      inv.setSlot(inv.sel, items.id('polymer_brick'), 5); B.setScale(1);
      const box = placeBox(ray.sub, ray.normal, 1, [1, 1, 1]);
      const before = W.getCell(x, s - 1 + 1, z);
      const placed = B._doPlace(box, 'fill');
      const cellAfter = W.getCell(ray.sub[0] >> 2, (ray.sub[1] >> 2) + 1, ray.sub[2] >> 2);
      // shoreline break: break the rim cell next to the water; does water flow in?
      const rim = [x + 2, s, z];
      const r2 = B.tools.edit([rim[0] * 4, rim[1] * 4, rim[2] * 4], [rim[0] * 4 + 4, rim[1] * 4 + 4, rim[2] * 4 + 4], 0, 'fill');
      return { ray: ray && { mat: ray.mat, sub: ray.sub, waterId: BLOCK.WATER, hitIsFloor: ray.mat === BLOCK.BASALT_MATRIX }, box, cellBefore: before, placed, cellAfter, brickId: BLOCK.POLYMER_BRICK,
        rimAfterBreak: W.getCell(...rim), rimFlooded: W.getCell(...rim) === BLOCK.WATER, rimRemoved: r2.removed };`);
    await pg.close();
  }

  if (want.includes('T3')) {
    const pg = await page(port, { url: '?mgtest=floorfall&nointro' });
    await playing(pg); await sleep(6000);
    results.T3 = await pg.game(`
      const run = (await import('./js/minigames/index.js')).minigames.running, ff = run.def;
      let sb = 0; const W = C.world, os = W.setBox; W.setBox = function (...a) { sb++; return os.apply(this, a); };
      const sample = async (label) => {
        sb = 0; let t = 0, n = 0; const f0 = C.fx.count;
        const t0 = performance.now(); const ou = C.ui.update; let ui = 0;
        C.ui.update = function (dt) { const a = performance.now(); const r = ou.call(this, dt); ui += performance.now() - a; return r; };
        for (let i = 0; i < 60; i++) await new Promise((r) => requestAnimationFrame(r));
        C.ui.update = ou;
        let fallen = 0; for (const v of ff.cracks.values()) if (v === -999) fallen++;
        return { label, t: Math.round(ff.t), cracks: ff.cracks.size, fallen, setBoxPerFrame: +(sb / 60).toFixed(1), uiMsPerFrame: +(ui / 60).toFixed(2), fx: C.fx.count, over: ff.over };
      };
      const FIX = ${JSON.stringify(!!process.env.FIXSIM)};
      if (FIX) { const prune = () => { if (ff.cracks) for (const [k, v] of ff.cracks) if (v === -999) ff.cracks.delete(k); if (!ff.over) requestAnimationFrame(prune); }; requestAnimationFrame(prune); }
      const out = [await sample(FIX ? 'early (fallen tiles pruned = simulated fix)' : 'early')];
      ff.t = 99;   // jump to sudden death
      for (let k = 0; k < 4; k++) { await new Promise((r) => setTimeout(r, 4000)); if (ff.over) break; out.push(await sample('crumble+' + (k + 1) * 4 + 's')); }
      W.setBox = os;
      return out;`);
    await pg.close();
  }

  if (want.includes('T4')) {
    const pg = await page(port, { mobile: true, url: '?play=1&nointro&t=0.85&seed=bugportrait' });
    await playing(pg); await sleep(2500);
    await pg.game(`const p = C.player.pos; for (let i = 0; i < 3; i++) C.game.mobs.spawn('reboot', p.x + 1.5, p.y, p.z + 0.5 * i); return 1;`);
    const before = await pg.game(`return { paused: C.session.paused, state: C.ui.shell.state, integ: C.game.survival.integrity };`);
    await pg.send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: 'portraitPrimary', angle: 0 } });
    await sleep(6000);
    const after = await pg.game(`return { paused: C.session.paused, state: C.ui.shell.state, integ: C.game.survival.integrity, dead: C.game.survival.dead,
      rotate: getComputedStyle(document.getElementById('rotate')).display, aspect: +C.camera.aspect.toFixed(2) };`);
    results.T4 = { before, after };
    await pg.close();
  }

  if (want.includes('T5')) {
    const pg = await page(port, { url: '?play=1&nointro&seed=bugsettings' });
    await playing(pg); await pg.eval('window.__game.ctx.ui.shell.noAutoPause = true'); await sleep(2500);
    results.T5 = await pg.game(`
      const S = C.settings, R = C.renderer, out = [];
      const snap = (l) => ({ l, geo: R.info.memory.geometries, tex: R.info.memory.textures, progs: R.info.programs.length, post: !!G.post?.enabled, pr: R.getPixelRatio(), rd: C.render.renderDistance, fog: C.scene.fog && [Math.round(C.scene.fog.near), Math.round(C.scene.fog.far)] });
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      out.push(snap('start'));
      for (const q of ['low', 'med', 'high', 'low', 'high']) { S.set('quality', q); await wait(800); out.push(snap('quality=' + q)); }
      for (const rd of [2, 12, 6]) { S.set('renderDistance', rd); await wait(2500); out.push(snap('rd=' + rd)); }
      S.set('fov', 100); await wait(200); out.push({ l: 'fov', camFov: C.camera.fov });
      // narrator change while a VO line plays
      const p = C.audio.vo('n01'); await wait(300); S.set('narrator', S.get('narrator') === 'female' ? 'male' : 'female'); await wait(200);
      out.push({ l: 'narrator mid-line', voStillPlaying: !!C.audio._vo, src: C.audio._vo?.el?.src?.split('/vo/')[1] });
      C.audio.stopVo();
      return { out, exceptions: window.__bootErrors || null };`);
    results.T5.pageExceptions = pg.log.exceptions.slice(0, 5);
    await pg.close();
  }

  if (want.includes('T6')) {
    const pg = await page(port, { url: '?play=1&nointro&seed=bugfell' });
    await playing(pg); await pg.eval('window.__game.ctx.ui.shell.noAutoPause = true'); await sleep(2500);
    await pg.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    results.T6 = await pg.game(`
      const W = C.world, P = C.player, B = C.brush, inv = C.game.inv, items = C.game.items;
      const out = [];
      for (let k = 0; k < 3; k++) {
        const x = Math.floor(P.pos.x) + 6 + k * 7, z = Math.floor(P.pos.z) + 6, y = Math.floor(W.surfaceY(x + 0.5, z + 0.5));
        W.setBox([(x - 3) * 4, y * 4, (z - 3) * 4], [(x + 4) * 4, (y + 16) * 4, (z + 4) * 4], 0, 'fill', { flow: false });
        const n = W.growTree(x, y, z, 'fell' + k);
        inv.setSlot(inv.sel, 0, 0); inv.clear?.();
        let breaks = 0; const off = C.bus.on('block:break', () => breaks++);
        const t0 = performance.now();
        B._doBreak({ min: [x * 4, y * 4, z * 4], max: [x * 4 + 4, y * 4 + 4, z * 4 + 4] });
        const ms = performance.now() - t0; off();
        out.push({ treeCells: n, breakEvents: breaks, ms: +ms.toFixed(1), drops: C.game.drops.list.length, lightPending: W.lightPending() });
      }
      return out;`);
    await pg.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await pg.close();
  }

  if (want.includes('T7')) {
    const pg = await page(port, { url: '?nointro', prelude: true });
    await pg.waitFor(`window.__game?.ctx?.ui?.shell?.state === 'title'`, { timeout: 60000 });
    const S = 'window.__game.ctx.ui.shell';
    const count = (l) => pg.eval(`(() => { const r = window.__rc0, C = window.__game.ctx; let objs = 0; C.scene.traverse(() => objs++);
      return { l: ${JSON.stringify(l)}, intervals: r.intervals.size, win: { ...r.win }, doc: { ...r.doc }, audioEls: r.audioEls, mediaSources: r.mes, uiNodes: document.getElementById('ui-root').getElementsByTagName('*').length,
        bodyKids: document.body.children.length, styles: document.head.querySelectorAll('style').length, objs, geo: C.renderer.info.memory.geometries, tex: C.renderer.info.memory.textures, heap: Math.round(performance.memory.usedJSHeapSize / 1048576) }; })()`);
    const rows = [await count('title')];
    for (let i = 0; i < 3; i++) {
      await pg.eval(`${S}.play({ id: null, temp: true, name: 'L${i}', seed: 'life${i}', mode: '${i % 2 ? 'build' : 'survival'}', difficulty: 'normal', source: 'local', mine: true }, { fresh: true })`, { timeout: 90000 });
      await pg.waitFor(`${S}.state === 'playing'`, { timeout: 60000 }); await sleep(2000);
      await pg.eval(`(async()=>{ ${S}.pause(); await ${S}.quit(); })()`, { timeout: 60000 });
      await pg.waitFor(`${S}.state === 'title'`, { timeout: 30000 });
      rows.push(await count('after world ' + i));
    }
    for (const id of ['parkour', 'ctf', 'siege']) {
      await pg.eval(`${S}.playMinigame('${id}')`, { timeout: 90000 });
      await pg.waitFor(`${S}.state === 'playing'`, { timeout: 60000 }); await sleep(2500);
      await pg.eval(`(async()=>{ await ${S}.quit(); })()`, { timeout: 60000 });
      await pg.waitFor(`${S}.state === 'title'`, { timeout: 30000 });
      rows.push(await count('after mg ' + id));
    }
    results.T7 = rows;
    await pg.close();
  }

  if (want.includes('T8')) {
    const pg = await page(port, { url: '?play=1&nointro&t=0.5&seed=buglong' });
    await playing(pg); await pg.eval('window.__game.ctx.ui.shell.noAutoPause = true'); await sleep(2500);
    results.T8 = await pg.game(`
      const rows = [], g = C.game, dt = 0.1;
      const row = (min) => ({ min, t01: +C.sky.time01.toFixed(2), night: C.sky.isNight, mobs: g.mobs.list.length, pool: Object.values(g.mobs.pool).reduce((a, b) => a + b.length, 0), drops: g.drops.list.length, proj: g.projectiles.list?.length,
        fx: C.fx.count, integ: g.survival.integrity, dead: g.survival.dead, charge: Math.round(g.survival.charge), nights: g.nights, mobsGroupKids: g.mobs.group.children.length, sceneObjs: (() => { let k = 0; C.scene.traverse(() => k++); return k; })() });
      C.settings.set('noFallDamage', true); C.settings.set('peaceful', false);
      for (let m = 1; m <= 30; m++) {
        for (let i = 0; i < 600; i++) { C.sky.update(dt); g.update(dt); C.fx.update(dt); if (g.survival.dead) g.respawn(); }
        C.world.update(C.player.pos.x, C.player.pos.z, C.render.renderDistance + 1);
        if (m % 5 === 0) rows.push(row(m));
        await new Promise((r) => setTimeout(r, 0));
      }
      if (window.gc) gc();
      return { rows, heapMB: Math.round(performance.memory.usedJSHeapSize / 1048576) };`, { timeout: 600000 });
    await pg.close();
  }

  if (want.includes('T9')) {
    const pg = await page(port, { url: '?mgtest=siege&nointro' });
    await playing(pg); await sleep(3000);
    results.T9 = await pg.game(`
      const T = G.THREE; let made = 0; const P = T.BufferGeometry.prototype, od = P.dispose; let disposed = 0;
      const ring = (await import('./js/minigames/index.js')).minigames.running.def.hpRing;
      const g0 = ring.geometry;
      P.dispose = function () { disposed++; return od.call(this); };
      for (let i = 0; i < 120; i++) await new Promise((r) => requestAnimationFrame(r));
      P.dispose = od;
      return { framesSampled: 120, geometryDisposesPer120Frames: disposed, ringGeometryReplaced: ring.geometry !== g0, ringVerts: ring.geometry.attributes.position.count };`);
    await pg.close();
  }
  if (want.includes('T10')) {
    // save cost on a heavily built local world, at 4x CPU throttle: engine.save, JSON, gzip+IDB, thumbnail, longest frame
    const pg = await page(port, { url: '?nointro' });
    await pg.waitFor(`window.__game?.ctx?.ui?.shell?.state === 'title'`, { timeout: 60000 });
    await pg.eval(`(async () => { const api = (await import('./js/net/api.js')).api; const m = await api.local.put({ name: 'Save cost', seed: 'savecost', mode: 'build', data: null });
      window.__game.ctx.ui.shell.play({ ...m, source: 'local', mine: true }, { fresh: true }); return m.id; })()`);
    await playing(pg); await pg.eval('window.__game.ctx.ui.shell.noAutoPause = true'); await sleep(3000);
    results.T10 = await pg.game(`
      const W = C.world, p = C.player.pos, S = 4;
      const { BLOCK } = await import('./js/data/blocks.js');
      // a big build: 400 varied 2x3x2 blocks spread over ~100 m, touching ~ many sections
      for (let i = 0; i < 400; i++) { const x = Math.floor(p.x) - 48 + (i * 37) % 96, z = Math.floor(p.z) - 48 + (i * 53) % 96, y = Math.floor(W.surfaceY(x + .5, z + .5));
        W.setBox([x * S, y * S, z * S], [(x + 2) * S, (y + 3) * S, (z + 2) * S], [3, 7, 8, 27][i % 4], 'fill', { flow: false }); }
      for (let i = 0; i < 60; i++) { const x = Math.floor(p.x) - 30 + i, z = Math.floor(p.z) + 10; W.setBox([x * S + 1, 40 * S, z * S], [x * S + 3, 44 * S, z * S + 2], 9, 'fill', { flow: false }); }
      W.finishLight();
      let modified = 0; for (const s of W.sections.values()) if (s && s.modified) modified++;
      return { modifiedSections: modified };`);
    await pg.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const t = await pg.game(`
      const T = {}, add = (k, d) => (T[k] = +((T[k] || 0) + d).toFixed(1));
      const E = C.engine, os = E.save; E.save = function () { const a = performance.now(); const r = os.call(this); add('engine.save', performance.now() - a); return r; };
      const js = JSON.stringify; JSON.stringify = function (...a) { const t = performance.now(); const r = js.apply(this, a); const d = performance.now() - t; if (d > 1) { add('JSON.stringify', d); T.jsonBytes = (T.jsonBytes || 0) + r.length; } return r; };
      const tdu = HTMLCanvasElement.prototype.toDataURL; HTMLCanvasElement.prototype.toDataURL = function (...a) { const t = performance.now(); const r = tdu.apply(this, a); add('toDataURL', performance.now() - t); return r; };
      const R = C.renderer, orr = R.render; let thumbRender = 0;
      const gaps = []; let last = performance.now(), on = true; const tick = (t) => { if (!on) return; gaps.push(t - last); last = t; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
      await new Promise((r) => setTimeout(r, 300));
      const t0 = performance.now(); const ok = await C.ui.shell.save('pause', true); const total = performance.now() - t0;
      await new Promise((r) => setTimeout(r, 300)); on = false;
      E.save = os; JSON.stringify = js; HTMLCanvasElement.prototype.toDataURL = tdu;
      return { ok, totalMs: +total.toFixed(1), parts: T, longestFrameMs: +Math.max(...gaps).toFixed(1), framesOver50: gaps.filter((g) => g > 50).length };`);
    await pg.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    Object.assign(results.T10, t);
    await pg.close();
  }
  if (want.includes('T11')) {
    // big build stamps at 4x CPU: cost of one 64x16x64 m fill, frames until its deferred relight ends, and a second
    // stamp issued while the first relight is still pending (setBox -> finishLight runs the rest synchronously)
    const pg = await page(port, { url: '?play=1&nointro&mode=build&seed=bugstamp' });
    await playing(pg); await pg.eval('window.__game.ctx.ui.shell.noAutoPause = true'); await sleep(4000);
    await pg.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    results.T11 = await pg.game(`
      const T = C.brush.tools, W = C.world, p = C.player.pos, S = 4, out = {};
      const box = (dx, m) => [[(Math.floor(p.x) + dx) * S, (Math.floor(p.y) + 3) * S, (Math.floor(p.z) - 32) * S], [(Math.floor(p.x) + dx + 64) * S, (Math.floor(p.y) + 19) * S, (Math.floor(p.z) + 32) * S], m];
      const stamp = (dx, m) => { const [a, b] = box(dx, m); const t = performance.now(); const r = T.edit(a, b, m, 'fill', {}); return { ms: +(performance.now() - t).toFixed(1), changed: r.changed, lightPending: W.lightPending() }; };
      out.first = stamp(10, 3);
      let frames = 0, gaps = [], last = performance.now();
      while (W.lightPending() && frames < 600) { await new Promise((r) => requestAnimationFrame(r)); const n = performance.now(); gaps.push(n - last); last = n; frames++; }
      out.relightFrames = frames; out.relightMaxFrameMs = +Math.max(...gaps).toFixed(1);
      out.back2back_a = stamp(80, 7);
      out.back2back_b = stamp(150, 8);
      return out;`);
    await pg.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await pg.close();
  }
} catch (e) { console.error(e); } finally { stopBrowser(PORT); }
console.log(JSON.stringify(results, null, 1));
