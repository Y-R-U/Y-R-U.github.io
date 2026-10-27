// MAP gate (D26/D29): the Kingdom Map played in the REAL game with real Input.dispatchTouchEvent taps on live rects.
// window.__game / window.__kingdom are only READ (state, memory, logs); the flow is driven by taps, except the
// falsify modes, which break something on purpose and must turn the run red.
//   ~/.claude/bin/cdp start --port 9681 --idle 1800 -- --use-angle=metal
//   node tools/test-map.mjs [--orient=portrait|landscape|both] [--cases=farm,jumbo,swaps] [--timescale=4] [--port=9681]
//   node tools/test-map.mjs --falsify=noswap|nofuel|refuse|leak|cover
// Screenshots: docs/shots/map/<orient>-<case>-<n>-<stage>.png (gitignored). Results: docs/shots/map/results-<stamp>.json
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, sleep, SNAP, LOAD_ROUTES, rwyGeom } from './loop/driver.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'docs', 'shots', 'map');
mkdirSync(OUT, { recursive: true });
const argv = process.argv.slice(2);
const arg = (k, d) => { const a = argv.find((x) => x === `--${k}` || x.startsWith(`--${k}=`)); if (!a) return d; const v = a.split('=')[1]; return v === undefined ? true : v; };
const PORT = +arg('port', 9681), BASE = arg('url', 'http://127.0.0.1:8888/gms/3d/krayzee/'), TS = +arg('timescale', 4);
const ORIENTS = { portrait: [390, 844], landscape: [844, 390] };
const orients = arg('orient', 'both') === 'both' ? ['portrait', 'landscape'] : [arg('orient')];
const FALSIFY = arg('falsify', '');
const CASES = String(arg('cases', FALSIFY === 'leak' ? 'swaps' : FALSIFY === 'refuse' ? 'jumbo' : FALSIFY ? 'farm' : 'farm,jumbo,swaps')).split(',');
const PROFILE = { name: 'Mapper', gender: 'f', company: 'Map Air', primary: '#2f6b3a', secondary: '#f6f1e6', accent: '#c8102e', voice: 'duchess', registration: 'K-MAPS' };
const COACH_SEEN = { 'krayzee.coach': { goal: 1, stick: 1, release: 1, radio: 1, bank: 1 }, 'krayzee.coachTakeoff': 1 };
const log = (...a) => console.log(...a);
const r1 = (v) => Math.round(v * 10) / 10;

let D, CASE, shotN = 0;
const results = [];
class StepFail extends Error {}
const fail = (m) => { throw new StepFail(m); };
const snap = () => D.evSafe(SNAP);
const K = () => D.evSafe('window.__kingdom?.state()');
const waitReal = async (fn, ms, every = 200) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(every); } return null; };
async function until(cond, simBudget, label) {
  const s0 = await snap(), sim0 = s0?.simT ?? 0, t0 = Date.now(), cap = (simBudget / Math.max(0.25, TS) * 3 + 30) * 1000;
  for (;;) {
    const s = await snap();
    if (s) { const v = await cond(s); if (v) return { s, simS: s.simT - sim0 }; }
    if (s && s.simT - sim0 > simBudget) fail(`${label}: not within ${simBudget} s sim`);
    if (Date.now() - t0 > cap) fail(`${label}: real-time cap ${r1(cap / 1000)} s`);
    await sleep(250);
  }
}
async function shot(stage) { const n = `${CASE.orient}-${CASE.name}-${String(++shotN).padStart(2, '0')}-${stage}`; const p = await D.shot(OUT, n); CASE.shots.push(p); return p; }
// a real tap that must take effect (headless Chrome eats the odd touchStart: up to 3 tries); a covered target fails
async function tapUntil(sel, effect, ms = 2500) {
  if (!(await waitReal(() => D.rect(sel), 4000))) fail(`${sel} never visible`);
  await sleep(200);
  for (let i = 0; i < 3; i++) {
    const vp = await D.ev('[innerWidth, innerHeight]'), q = await D.rect(sel);
    if (q && (q.cx < 0 || q.cy < 0 || q.cx > vp[0] || q.cy > vp[1])) fail(`${sel} is off the screen at (${Math.round(q.cx)}, ${Math.round(q.cy)}) of ${vp}`);
    const r = await D.tap(sel);
    if (!r) fail(`${sel} not visible`);
    if (r.covered) fail(`${sel} is covered at its centre by ${await D.hitName(r.cx, r.cy)}: a thumb would hit that instead`);
    const v = await waitReal(async () => effect(await snap()), ms);
    if (v) return v;
  }
  fail(`tapping ${sel} had no effect after 3 tries`);
}
async function step(name, fn) {
  const rec = { step: name, ok: false, detail: '' }, e0 = D.errors.length, t0 = Date.now();
  CASE.steps.push(rec);
  if (CASE.blocked) { rec.skip = CASE.blocked; log(`  SKIP ${name}`); return; }
  try { rec.detail = (await fn(rec)) || ''; rec.ok = true; } catch (e) { rec.detail = e instanceof StepFail ? e.message : `harness: ${e.message}`; }
  if (D.errors.length > e0) { rec.ok = false; rec.detail += ` | page errors: ${D.errors.slice(e0, e0 + 2).join(' || ')}`; }
  rec.realS = r1((Date.now() - t0) / 1000);
  if (!rec.ok) { CASE.blocked = name; try { await shot(`FAIL-${name.replace(/\W+/g, '_')}`); } catch (e) { /* */ } }
  log(`  ${rec.ok ? 'PASS' : 'FAIL'} ${name.padEnd(28)} ${String(rec.realS).padStart(5)}s  ${rec.detail}`);
}
async function fresh(plane, ts = TS) {
  const [w, h] = ORIENTS[CASE.orient];
  await D.viewport(w, h);
  await D.send('Page.navigate', { url: BASE + 'docs/' }); await sleep(400);
  await D.ev(`(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('krayzee.')) localStorage.removeItem(k);
    localStorage.setItem('krayzee.profile', ${JSON.stringify(JSON.stringify(PROFILE))});
    const x = ${JSON.stringify(COACH_SEEN)}; for (const k in x) localStorage.setItem(k, JSON.stringify(x[k]));
    localStorage.setItem('krayzee.settings', JSON.stringify({ v: 3, difficulty: 'easy' })); return 1; })()`);
  D.errors.length = 0;
  await D.send('Page.navigate', { url: `${BASE}?start=free&noaccount=1&intro=0&allplanes${plane ? `&plane=${plane}` : ''}&timescale=${ts}` });
  if (!(await waitReal(() => D.evSafe('!!(window.__krayzeeReady && window.__game?.S.player && window.__kingdom)'), 60000, 300))) fail('game not ready in 60 s');
  await D.evSafe(LOAD_ROUTES);
}
// AI planes come and go in random types and liveries, so both readings are taken with the AI sent home (__kingdom.quietTraffic):
// what is left is the world, the effects and the player's plane, and that must come back to the boot numbers
const MEM = `(async () => { const R = __game.renderer.renderer, m = R.info.memory; let objs = 0; __game.S.player.rig.root.parent.traverse(() => objs++);
  return { geometries: m.geometries, textures: m.textures, programs: R.info.programs?.length ?? 0, objects: objs, traffic: __game.traffic.list.length,
    airport: __kingdom.state().airport, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null }; })()`;
async function memory() {
  await D.ev('__kingdom.quietTraffic()');
  await sleep(600);
  try { await D.send('HeapProfiler.enable'); await D.send('HeapProfiler.collectGarbage'); } catch (e) { /* */ }
  await sleep(300);
  return D.ev(MEM);
}
// frame rate where the plane is (vsync-capped at 60 in headless Metal), CPU ms per frame, draw calls, and the rate with the
// CPU throttled 4× (PERF.md's mid-phone stand-in: phones are CPU-bound)
const FPS = `(() => { const R = __game.renderer.renderer; return { fps: __game.state().fps, cpuMs: +(__game.S.cpuMs || 0).toFixed(2), calls: R.info.render.calls, tris: Math.round(R.info.render.triangles / 1000), q: __game.state().quality }; })()`;
async function fpsHere(label) {
  await sleep(4000);
  const f = await D.ev(FPS);
  try {
    await D.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await sleep(5000);
    const t = await D.ev(FPS);
    f.fps4x = t.fps; f.cpuMs4x = t.cpuMs;
  } finally { await D.send('Emulation.setCPUThrottlingRate', { rate: 1 }); }
  CASE.fps[label] = f;
  return f;
}
async function openMapAndPick(id) {
  await tapUntil('.krz-map-chip', async () => !!(await D.rect('.krz-map')));
  await shot('map-open');
  await tapUntil(`.krz-map [data-pin="${id}"]`, async () => (await K())?.pick === id);
  return { txt: await D.ev('document.querySelector(".krz-map-card").innerText.replace(/\\s+/g, " ")') };
}
async function flyThrough(id, label) {
  await step(`clouds roll in → ${id}`, async () => {
    const t0 = Date.now();
    await until(async () => (await K())?.phase === 'in' || (await K())?.airport === id, 400, 'magic clouds');
    await sleep(1200); await shot(`clouds-${id}`);
    const k = await waitReal(async () => { const s = await K(); return s?.airport === id && !s.phase ? s : null; }, 40000, 250);
    if (!k) fail(`still ${(await K())?.airport} / ${(await K())?.phase} 40 s after the clouds`);
    const sw = k.swaps.at(-1);
    CASE.swaps.push(sw);
    return `swap ${sw.from}→${sw.to} ${sw.ms} ms (clouds→clear ${r1((Date.now() - t0) / 1000)} s real)`;
  });
  await step(`emerged near ${id}`, async () => {
    await sleep(800);
    const s = await snap(), c = await D.ev(`import('./js/world/layout.js').then((L) => ({ atcEnd: __game.wiring.activeEnd(), ends: L.AIRPORT.runways.flatMap((r) => r.ends), aiIds: __game.traffic.list.filter((e) => !e.player).map((e) => e.ac.id), ai: __game.traffic.list.filter((e) => !e.player).map((e) => Math.round(Math.hypot(e.ac.pos.x, e.ac.pos.z))) }))`);
    await shot(`emerged-${id}`);
    const d = Math.hypot(s.p.x, s.p.z);
    if (s.p.gnd || s.p.crashed) fail(`player on the ground/crashed after the swap (${s.p.phase})`);
    if (d < 4500 || d > 6500) fail(`emerged ${Math.round(d)} m from ${id} (wanted ~5.5 km)`);
    if (c.ai.some((x) => x > 9000)) fail(`AI left over far away: ${c.ai.join(',')} m`);
    if (!c.ends.includes(c.atcEnd)) fail(`ATC still on another airport: active end ${c.atcEnd}, ${id} has ${c.ends}`);
    if (CASE.preAi?.some((x) => c.aiIds.includes(x))) fail(`AI from the old airport still flying: ${CASE.preAi.filter((x) => c.aiIds.includes(x))}`);
    return `ATC RWY ${c.atcEnd}; ${Math.round(d)} m out, ${Math.round(s.p.agl)} m AGL, ${Math.round(s.p.kt)} kt, AP ${s.p.phase}; ${c.ai.length} AI (${c.ai.join(',')} m from the field)`;
  });
}
async function landHere(id, rwyPrefix) {
  await step(`LAND at ${id}`, async (rec) => {
    await until((s) => { const g = rwyGeom(s); return s.land && !s.land.hidden && s.land.state === 'idle' && g && g.dist < 3500 && g.off < 25 && g.align < 30; }, 900, 'runway ahead within 3.5 km with LAND available');
    await tapUntil('.krz-land', (s) => s?.land?.state === 'active');
    rec.pick = (await snap()).land.txt;
    if (await waitReal(() => D.evSafe('document.querySelector(".krz-land")?.dataset.now === "1"'), 1500)) await tapUntil('.krz-land-now', (s) => s?.land?.now === false || /straight/i.test(s?.p?.landing || ''));
    const td = await until((s) => s.p && s.p.gnd, 600, 'touchdown');
    if (td.s.p.crashed) fail('crashed on landing');
    if (td.s.p.surf !== 'runway') fail(`touched down on ${td.s.p.surf}`);
    if (rwyPrefix && !td.s.rwy?.id?.startsWith(rwyPrefix)) (rec.warn = `landed with active end ${td.s.rwy?.id}`);
    await until((s) => s.p.gnd && (s.p.kt < 1 || s.finish?.state === 'ready'), 200, 'stopped');
    await shot(`landed-${id}`);
    return `${rec.pick} → touchdown on the runway, stopped`;
  });
}

// ---------------------------------------------------------------- cases
async function caseFarm() {
  await step('boot (C-Tower 1, c172)', async () => { await fresh('c172'); const k = await K(); if (k.airport !== 'royal') fail(`booted at ${k.airport}`); return 'C-Tower 1'; });
  await step('airborne', async () => { await until((s) => s.p && !s.p.gnd && s.p.agl > 90, 200, 'climb to 90 m'); CASE.preAi = await D.ev('__game.traffic.list.filter((e) => !e.player).map((e) => e.ac.id)'); await fpsHere('royal'); return `fps ${JSON.stringify(CASE.fps.royal)}`; });
  if (FALSIFY === 'cover') await D.ev(`(() => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;inset:0;z-index:99999'; document.body.append(d); return 1; })()`);
  await step('map → Muckle Bottom', async () => {
    const card = await openMapAndPick('farm');
    if (!/Muckle Bottom/.test(card.txt) || !/Fits your/.test(card.txt)) fail(`card: ${card.txt}`);
    await shot('map-farm');
    return card.txt.slice(0, 70);
  });
  if (FALSIFY === 'noswap') await D.ev(`import('./js/map/index.js').then((m) => { m.TRAVEL.swapM = 1e9; return 1; })`);
  await step('FLY THERE', async () => {
    await tapUntil('.krz-map-go', async () => (await K())?.dest === 'farm');
    await until(async () => (await K())?.ferry, 60, 'AP turns for Muckle Bottom');
    if (await D.rect('.krz-map')) fail('the map stayed open');
    await sleep(600);
    const chip = (await D.rect('.krz-map-chip'))?.txt;
    await shot('course-set');
    return `chip "${chip}", AP ${(await snap()).p.phase}`;
  });
  await flyThrough('farm');
  await step('farm tower on the radio', async () => {
    const t = await waitReal(() => D.evSafe('[...document.querySelectorAll(".krz-r-pill, .krz-r-log, .krz-r-tower")].map((e) => e.innerText).join(" ")'), 6000);
    const ok = await waitReal(() => D.evSafe('/Mudge|C-Tower 2/i.test(document.body.innerText)'), 20000, 500);
    if (!ok) fail(`no C-Tower 2 / Farmer Mudge on the radio: ${String(t).slice(0, 80)}`);
    return 'C-Tower 2 · Farmer Mudge speaking';
  });
  await step('fps at Muckle Bottom', async () => JSON.stringify(await fpsHere('farm')));
  await D.ev('(() => { const f = __game.S.player.ac.fuel; f.L = f.R = f.cap * 0.45; return 1; })()');   // so DEMAND IT has something to refuel
  if (FALSIFY === 'nofuel') await D.ev('(() => { __game.S.player.ac.refuel = () => {}; return 1; })()');
  await landHere('farm', '');
  await step('DEMAND IT (banks + refuels)', async () => {
    await until((s) => s.finish?.state === 'ready', 300, 'DEMAND IT ready');
    const b0 = (await snap()).banked, fuel0 = (await snap()).p.fuel;
    await tapUntil('.krz-finish', (s) => s && (s.banked > b0 || s.finish?.state === 'hidden'));
    await sleep(400);
    const s = await snap();
    await shot('demand-it');
    if (!(s.p.fuel >= 0.999)) fail(`not refuelled (fuel ${r1(fuel0)} → ${r1(s.p.fuel)})`);
    return `fuel ${r1(fuel0)} → ${r1(s.p.fuel)}, banked ${b0} → ${s.banked}`;
  });
  await step('DEMAND TAKEOFF at the farm', async () => {
    for (let i = 0; i < 6 && (await D.rect('.krz-reel')); i++) { await D.tap('.krz-reel-all') || await D.tap('.krz-reel-next'); await sleep(400); }
    await until((s) => s.ground?.takeoff, 60, 'DEMAND TAKEOFF offered');
    await waitReal(() => D.rect('.krz-gbtn-to'), 8000);
    const nDT = () => D.evSafe('__game.log().filter((l) => l.type === "demandTakeoff").length', 0), n0 = await nDT();
    await tapUntil('.krz-gbtn-to', async (s) => s && (!s.p.gnd || (await nDT()) > n0));
    await until((s) => s.p && !s.p.gnd && s.p.agl > 10, 240, 'airborne from Muckle Bottom');
    await shot('farm-takeoff');
    const k = await K();
    if (k.airport !== 'farm') fail(`airport ${k.airport}`);
    return 'airborne off the grass';
  });
}

async function caseJumbo() {
  await step('boot (C-Tower 1, jumbo)', async () => { await fresh('jumbo'); return (await K()).airport; });
  if (FALSIFY === 'refuse') await D.ev(`import('./data/airports/kingdom.js').then((m) => { m.KINGDOM.farm.runways[0].length = 3000; return 1; })`);
  await step('farm refused in the jumbo', async () => {
    const card = await openMapAndPick('farm');
    if (!/TOO SHORT/.test(card.txt)) fail(`the map does not say it's too short: ${card.txt}`);
    await shot('farm-too-short');
    const s = await snap();
    await tapUntil('.krz-map-go', () => D.evSafe('/TIN BARN/.test(document.querySelector("#krz-hud .krz-banner")?.innerText || "")'));
    const quip = await D.evSafe('document.querySelector("#krz-hud .krz-banner")?.innerText.replace(/\\s+/g, " ")');
    await shot('farm-refused');
    const k = await K();
    if (k.dest || k.airport !== 'royal' || k.phase) fail(`not refused: ${JSON.stringify(k)}`);
    if (!quip) fail('no refusal quip shown');
    await tapUntil('.krz-map-x', async () => !(await D.rect('.krz-map')));
    return `${s.p.gnd ? 'on the ground' : 'airborne'}: "${quip}"`;
  });
  await step('airborne in the jumbo', async () => { await until((s) => s.p && !s.p.gnd && s.p.agl > 120, 400, 'jumbo climb'); CASE.preAi = await D.ev('__game.traffic.list.filter((e) => !e.player).map((e) => e.ac.id)'); return 'climbing'; });
  await step('map → RAF Much Snoring', async () => {
    const card = await openMapAndPick('airbase');
    if (!/Fits your Royal Jumbo/.test(card.txt)) fail(`card: ${card.txt}`);
    await shot('map-airbase');
    await tapUntil('.krz-map-go', async () => (await K())?.dest === 'airbase');
    return card.txt.slice(0, 80);
  });
  await flyThrough('airbase');
  await step('fps at Much Snoring', async () => JSON.stringify(await fpsHere('airbase')));
  await landHere('airbase', '');
}

// three START HERE swaps on the ground (the start-at entry), then back home: world memory must come back down
async function caseSwaps() {
  // no ?plane=: the aircraft chips are offered on the ground (the C172 by default)
  await step('boot (C-Tower 1, c172, slow clock)', async () => { await fresh(null, 0.25); await sleep(1500); CASE.mem0 = await memory(); return JSON.stringify(CASE.mem0); });
  for (const [i, id] of ['farm', 'airbase', 'royal', 'farm', 'airbase', 'royal'].entries()) {
    if (i === 3) await step('memory after 3 swaps', async () => {
      await sleep(1500);
      const m = CASE.mem3 = await memory(), m0 = CASE.mem0;
      // one round trip may warm a few things up (the plane's other LODs, an envMap variant): a handful, never a world
      if (m.geometries > m0.geometries + 6 || m.textures > m0.textures + 4) fail(`boot ${m0.geometries} geometries / ${m0.textures} textures → ${m.geometries} / ${m.textures}`);
      return JSON.stringify(m);
    });
    await step(`START HERE → ${id} (${i + 1})`, async () => {
      if (FALSIFY === 'leak') await D.ev('(() => { __game.world.dispose = () => {}; return 1; })()');
      await tapUntil('.krz-map-chip', async () => !!(await D.rect('.krz-map')));
      await tapUntil(`.krz-map [data-pin="${id}"]`, async () => (await K())?.pick === id);
      const btn = (await D.rect('.krz-map-go'))?.txt;
      if (!/start here/i.test(btn)) fail(`button says "${btn}" (wanted START HERE on the ground before the first flight)`);
      await tapUntil('.krz-map-go', async () => { const k = await K(); return k?.airport === id && !k.phase; }, 30000);
      await sleep(1200);
      const s = await snap(), g = rwyGeom(s);
      await shot(`start-${id}`);
      if (!s.p.gnd || !g || g.dist > 200) fail(`not lined up at ${id}: ${JSON.stringify(g)} gnd ${s.p.gnd}`);
      return `on RWY ${g.id}, ${Math.round(g.dist)} m from the threshold`;
    });
    if (i === 0) await step('jumbo chip refused at the farm', async () => {
      const sel = '.krz-plane:not([hidden]) [data-a="jumbo"]';
      if (!(await waitReal(() => D.rect(sel), 3000))) fail('aircraft chips not offered on the ground at Muckle Bottom');
      await D.ev(`document.querySelector('${sel}').scrollIntoView({ inline: 'center', block: 'nearest' })`);   // the row scrolls sideways, as a thumb would swipe it
      await sleep(300);
      await tapUntil(sel, () => D.evSafe('/TIN BARN/.test(document.querySelector("#krz-hud .krz-banner")?.innerText || "")'));
      await shot('jumbo-chip-refused');
      const t = (await snap()).type;
      if (t !== 'c172') fail(`swapped to ${t} at the farm`);
      return `still the ${t}: "${await D.evSafe('document.querySelector("#krz-hud .krz-banner").innerText')}"`;
    });
  }
  // the first round trip warms caches (the plane's other LODs, shader variants): the second must not add anything
  await step('memory flat over 3 more swaps', async () => {
    await sleep(1500);
    const m1 = await memory(), m0 = CASE.mem3;
    CASE.mem6 = m1;
    const bad = [];
    if (m1.traffic !== 1 || m0.traffic !== 1) bad.push(`traffic not quiet (${m0.traffic}/${m1.traffic})`);
    if (m1.geometries > m0.geometries) bad.push(`geometries ${m0.geometries}→${m1.geometries}`);
    if (m1.textures > m0.textures) bad.push(`textures ${m0.textures}→${m1.textures}`);
    if (m1.objects > m0.objects * 1.15 + 20) bad.push(`scene objects ${m0.objects}→${m1.objects}`);
    if (m0.heapMB && m1.heapMB > m0.heapMB * 1.25 + 8) bad.push(`heap ${m0.heapMB}→${m1.heapMB} MB`);
    const per = CASE.swapsK = (await K()).swaps.map((w) => `${w.from}→${w.to} geo ${w.before.geometries}→${w.after.geometries} tex ${w.before.textures}→${w.after.textures} ${w.ms}ms`);
    if (bad.length) fail(`${bad.join('; ')} | ${per.join(' | ')}`);
    return `boot ${JSON.stringify(CASE.mem0)} · after 3 ${JSON.stringify(m0)} · after 6 ${JSON.stringify(m1)}`;
  });
}

// ---------------------------------------------------------------- run
D = await connect(PORT);
const RUN = { farm: caseFarm, jumbo: caseJumbo, swaps: caseSwaps };
for (const orient of orients) for (const name of CASES) {
  if (name === 'swaps' && orient === 'landscape' && !arg('cases')) continue;   // memory once is enough
  CASE = { name, orient, steps: [], shots: [], swaps: [], fps: {}, blocked: null };
  shotN = 0;
  log(`\n== ${orient} · ${name}${FALSIFY ? ` (falsify ${FALSIFY})` : ''}`);
  try { await RUN[name](); } catch (e) { CASE.steps.push({ step: 'harness', ok: false, detail: e.message }); log('  HARNESS', e.message); }
  CASE.ok = CASE.steps.every((s) => s.ok);
  results.push(CASE);
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
writeFileSync(join(OUT, `results-${stamp}${FALSIFY ? '-falsify-' + FALSIFY : ''}.json`), JSON.stringify(results, null, 1));
const n = results.flatMap((c) => c.steps), ok = n.filter((s) => s.ok).length;
log(`\n${results.map((c) => `${c.orient}/${c.name}: ${c.ok ? 'PASS' : 'FAIL'} ${Object.entries(c.fps).map(([k, v]) => `${k} ${v.fps} fps (4× CPU ${v.fps4x}) ${v.cpuMs}/${v.cpuMs4x} ms cpu ${v.calls} calls ${v.tris}k tris`).join(' · ')}`).join('\n')}`);
log(`${ok}/${n.length} steps passed${FALSIFY ? ` (falsify ${FALSIFY}: expected to FAIL)` : ''}`);
D.close();
process.exit(results.every((c) => c.ok) ? 0 : 1);
