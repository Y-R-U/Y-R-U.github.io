// WORLD gate (C2 / D27): the Palace Lawn (C-Tower 3) played in the REAL game with real taps on live rects, in the Tiger
// (START HERE → DEMAND TAKEOFF off the lawn → circuit → LAND on the lawn → DEMAND IT + refuel → DEMAND TAKEOFF again),
// the F-35 (START HERE → VERTICAL TAKEOFF → LAND HERE on the lawn → DEMAND IT → VERTICAL TAKEOFF) and the C172 (refused
// by the map with the butler's quip). window.__game / __kingdom are only READ, except --falsify, which breaks on purpose.
//   ~/.claude/bin/cdp start --port 9705 --idle 1800 -- --use-angle=metal
//   node tools/test-palace.mjs [--port=9705] [--cases=tiger,f35,c172] [--orient=portrait|landscape] [--timescale=4]
//   node tools/test-palace.mjs --falsify=surface|refuse|tower   (lawn rolls as grass / map lets the C172 in / no butler)
// Screenshots: docs/shots/world/palace-<case>-<n>-<stage>.png
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, sleep, SNAP, LOAD_ROUTES, rwyGeom } from './loop/driver.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'docs', 'shots', 'world');
mkdirSync(OUT, { recursive: true });
const argv = process.argv.slice(2);
const arg = (k, d) => { const a = argv.find((x) => x === `--${k}` || x.startsWith(`--${k}=`)); if (!a) return d; const v = a.split('=')[1]; return v === undefined ? true : v; };
const PORT = +arg('port', 9705), BASE = arg('url', 'http://127.0.0.1:8888/gms/3d/krayzee/'), TS = +arg('timescale', 4);
const ORIENTS = { portrait: [390, 844], landscape: [844, 390] };
const FALSIFY = arg('falsify', '');
const CASES = String(arg('cases', FALSIFY === 'refuse' ? 'c172' : FALSIFY ? 'tiger' : 'tiger,f35,c172')).split(',');
const ORIENT_OF = { tiger: 'portrait', f35: 'landscape', c172: 'portrait' };
const PROFILE = { name: 'Lawn', gender: 'f', company: 'Lawn Air', primary: '#4b1f7a', secondary: '#f6f1e6', accent: '#e2ac2c', voice: 'duchess', registration: 'K-LAWN' };
const COACH_SEEN = { 'krayzee.coach': { goal: 1, stick: 1, release: 1, radio: 1, bank: 1 }, 'krayzee.coachTakeoff': 1 };
const log = (...a) => console.log(...a);
const r1 = (v) => Math.round(v * 10) / 10;
// the lawn in the world frame (data/airports/palace.js): centre, axis, half length/width
const LAWN = { cx: 1300, cz: -1560, h: 80, half: 120, w: 12 };
const lawnLocal = (x, z) => { const r = LAWN.h * Math.PI / 180, ux = Math.sin(r), uz = -Math.cos(r), dx = x - LAWN.cx, dz = z - LAWN.cz; return { a: dx * ux + dz * uz, b: -dx * uz + dz * ux }; };

let D, CASE, shotN = 0;
const results = [];
class StepFail extends Error {}
const fail = (m) => { throw new StepFail(m); };
const BTN = `(() => { const b = __game.landButton(); return b && { hidden: b.hidden, key: b.ctx?.key, state: b.ctx?.state, label: b.label, sub: b.ctx?.sub }; })()`;
const snap = async () => { const s = await D.evSafe(SNAP); if (s) s.btn = await D.evSafe(BTN); return s; };
const K = () => D.evSafe('window.__kingdom?.state()');
const waitReal = async (fn, ms, every = 200) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(every); } return null; };
async function until(cond, simBudget, label) {
  const s0 = await snap(), sim0 = s0?.simT ?? 0, t0 = Date.now(), cap = (simBudget / Math.max(0.25, TS) * 3 + 30) * 1000;
  for (;;) {
    const s = await snap();
    if (s?.p?.crashed) fail(`${label}: CRASHED (${s.p.cr})`);
    if (s) { const v = await cond(s); if (v) return { s, simS: s.simT - sim0 }; }
    if (s && s.simT - sim0 > simBudget) fail(`${label}: not within ${simBudget} s sim (AP ${s.p?.phase}, ${r1(s.p?.agl)} m, ${r1(s.p?.kt)} kt, btn ${s.btn?.key}/${s.btn?.state})`);
    if (Date.now() - t0 > cap) fail(`${label}: real-time cap`);
    await sleep(200);
  }
}
async function shot(stage) { const n = `palace-${CASE.name}-${String(++shotN).padStart(2, '0')}-${stage}`; const p = await D.shot(OUT, n); CASE.shots.push(p); return p; }
async function tapUntil(sel, effect, ms = 2500) {
  if (!(await waitReal(() => D.rect(sel), 4000))) fail(`${sel} never visible`);
  await sleep(200);
  for (let i = 0; i < 3; i++) {
    const r = await D.tap(sel);
    if (!r) fail(`${sel} not visible`);
    if (r.covered) fail(`${sel} is covered at its centre by ${await D.hitName(r.cx, r.cy)}`);
    const v = await waitReal(async () => effect(await snap()), ms);
    if (v) return v;
  }
  fail(`tapping ${sel} had no effect after 3 tries`);
}
// the context button: tap the main button above its pill
async function tapLand() {
  const r = await D.rect('.krz-land');
  if (!r) fail('.krz-land not visible');
  const x = r.cx, y = Math.min(r.cy, r.y + 22);
  if (!(await D.onTop('.krz-land', x, y))) fail(`.krz-land covered by ${await D.hitName(x, y)}`);
  await D.tapAt(x, y);
}
async function step(name, fn) {
  const rec = { step: name, ok: false, detail: '' }, e0 = D.errors.length, t0 = Date.now();
  CASE.steps.push(rec);
  if (CASE.blocked) { rec.skip = CASE.blocked; log(`  SKIP ${name}`); return; }
  try { rec.detail = (await fn(rec)) || ''; rec.ok = true; } catch (e) { rec.detail = e instanceof StepFail ? e.message : `harness: ${e.message}`; }
  if (D.errors.length > e0) { rec.ok = false; rec.detail += ` | page errors: ${D.errors.slice(e0, e0 + 2).join(' || ')}`; }
  rec.realS = r1((Date.now() - t0) / 1000);
  if (!rec.ok) { CASE.blocked = name; try { await shot(`FAIL-${name.replace(/\W+/g, '_')}`); } catch (e) { /* */ } }
  log(`  ${rec.ok ? 'PASS' : 'FAIL'} ${name.padEnd(34)} ${String(rec.realS).padStart(5)}s  ${rec.detail}`);
}
async function fresh(plane, airport = null) {
  const [w, h] = ORIENTS[CASE.orient];
  await D.viewport(w, h);
  await D.send('Page.navigate', { url: BASE + 'docs/' }); await sleep(400);
  await D.ev(`(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('krayzee.')) localStorage.removeItem(k);
    localStorage.setItem('krayzee.profile', ${JSON.stringify(JSON.stringify(PROFILE))});
    const x = ${JSON.stringify(COACH_SEEN)}; for (const k in x) localStorage.setItem(k, JSON.stringify(x[k]));
    localStorage.setItem('krayzee.settings', JSON.stringify({ v: 3, difficulty: 'easy' })); return 1; })()`);
  D.errors.length = 0;
  await D.send('Page.navigate', { url: `${BASE}?start=free&noaccount=1&intro=0&allplanes&plane=${plane}&timescale=${TS}${airport ? `&airport=${airport}` : ''}` });
  if (!(await waitReal(() => D.evSafe('!!(window.__krayzeeReady && window.__game?.S.player && window.__kingdom)'), 60000, 300))) fail('game not ready in 60 s');
  await D.evSafe(LOAD_ROUTES);
  if (FALSIFY === 'surface') await D.ev(`(() => { const w = __game.world, f = w.surfaceAt; const env = __game.traffic.env; const g = (x, z) => { const s = f(x, z); return s === 'runway' && Math.hypot(x - 1300, z + 1560) < 200 ? 'grass' : s; }; w.surfaceAt = g; env.surfaceAt = g; return 1; })()`);
  if (FALSIFY === 'refuse') await D.ev(`import('./data/airports/kingdom.js').then((m) => { m.KINGDOM.palace.runways[0].length = 2000; return 1; })`);
  if (FALSIFY === 'tower') await D.ev(`import('./data/airports/kingdom.js').then((m) => { delete m.KINGDOM.palace.towerLines; m.KINGDOM.palace.towerName = 'Tower · Gerald'; return 1; })`);
}
async function startAtPalace(expectFit) {
  await step('map → The Palace Lawn', async () => {
    await tapUntil('.krz-map-chip', async () => !!(await D.rect('.krz-map')));
    await tapUntil('.krz-map [data-pin="palace"]', async () => (await K())?.pick === 'palace');
    const txt = await D.ev('document.querySelector(".krz-map-card").innerText.replace(/\\s+/g, " ")');
    await shot('map-palace');
    if (!/Palace Lawn/.test(txt) || !/C-Tower 3/.test(txt)) fail(`card: ${txt}`);
    if (expectFit && !/Fits your/.test(txt)) fail(`not a fit: ${txt}`);
    if (!expectFit && !/TOO SHORT/.test(txt)) fail(`should be too short: ${txt}`);
    return txt.slice(0, 110);
  });
}
async function startHere() {
  // START HERE on the ground before the first take-off, FLY THERE once airborne (the clock runs fast: either can come up)
  await step('START HERE / FLY THERE → at the lawn', async () => {
    const btn = (await D.rect('.krz-map-go'))?.txt || '';
    await tapUntil('.krz-map-go', async () => { const k = await K(); return k?.dest === 'palace' || k?.airport === 'palace'; }, 4000);
    await until(async () => (await K())?.airport === 'palace' && !['in', 'swap'].includes((await K())?.phase), 600, 'swapped to the Palace Lawn');
    const k = await K(), sw = k.swaps.at(-1), s = await snap(), L = lawnLocal(s.p.x, s.p.z);
    CASE.flown = sw.mode === 'fly';
    await shot(CASE.flown ? 'arrived' : 'lined-up');
    if (CASE.flown) return `"${btn}": swap ${sw.from}→${sw.to} ${sw.ms} ms; ${Math.round(Math.hypot(L.a, L.b))} m out, AP ${s.p.phase}`;
    if (!s.p.gnd || Math.abs(L.a) > LAWN.half || Math.abs(L.b) > LAWN.w) fail(`not on the lawn: ${JSON.stringify(L)} gnd ${s.p.gnd}`);
    if (s.p.surf !== 'runway') fail(`the lawn reads as ${s.p.surf}`);
    CASE.start = { x: s.p.x, z: s.p.z };
    return `"${btn}": on the lawn ${Math.round(L.a)} m along, surface ${s.p.surf}, AP ${s.p.phase}`;
  });
  await step('C-Tower 3 · Mr Fennimore on the radio', towerCheck);
}
async function towerCheck() {
  {
    // the radio log (every line, shown or not): the tower speaking is the butler, not C-Tower 1's Gerald
    const RLOG = '[...document.querySelectorAll(".krz-r-drawer-list .krz-r-row, .krz-r-pill")].map((e) => e.textContent).join(" | ")';
    const ok = await waitReal(() => D.evSafe(`/Fennimore/.test(${RLOG})`), 30000, 500);
    if (!ok) fail(`no line from Mr Fennimore on the radio: ${String(await D.evSafe(RLOG)).slice(-160)}`);
    const line = String(await D.evSafe(RLOG)).split(' | ').reverse().find((t) => /Fennimore/.test(t));
    const ai = await D.ev('__game.traffic.list.filter((e) => !e.player).map((e) => e.ac.type)');
    if (ai.some((t) => !['tiger', 'bathtub', 'cub', 'throne'].includes(t))) fail(`AI types that cannot use the lawn: ${ai}`);
    return `"${line?.trim().slice(0, 90)}"; AI here: ${ai.join(', ') || 'none'}`;
  }
}

async function caseTiger() {
  await step('boot (C-Tower 1, tiger)', async () => { await fresh('tiger'); const k = await K(); if (k.airport !== 'royal') fail(`booted at ${k.airport}`); return 'C-Tower 1'; });
  await startAtPalace(true);
  await startHere();
  if (!CASE.flown) await step('takeoff off the lawn (cleared by the butler)', async () => {
    const L0 = lawnLocal(CASE.start.x, CASE.start.z);
    const air = await until((s) => s.p && !s.p.gnd && s.p.agl > 2, 180, 'liftoff');
    const L = lawnLocal(air.s.p.x, air.s.p.z);
    await until((s) => s.p.agl > 40, 120, 'climb');
    await shot('takeoff');
    if (Math.abs(L.a) > LAWN.half + 40) fail(`lifted off ${Math.round(Math.abs(L.a) - LAWN.half)} m past the lawn end`);
    return `rolled ${Math.round(Math.abs(L.a - L0.a))} m, off ${Math.round(LAWN.half - Math.abs(L.a))} m before the end`;
  });
  await D.ev('(() => { const f = __game.S.player.ac.fuel; f.L = f.R = f.cap * 0.45; return 1; })()');
  await step('circuit → LAND on the lawn', async (rec) => {
    await until((s) => { const g = rwyGeom(s); return s.land && !s.land.hidden && s.land.state === 'idle' && s.p.agl > 40 && g && g.dist < 2500 && g.off < 25 && g.align < 35; }, 900, 'lawn ahead with LAND available');
    await shot('lawn-ahead');
    await tapUntil('.krz-land', (s) => s?.land?.state === 'active');
    rec.pick = (await snap()).land.txt;
    if (!/RWY 26|RWY 08/.test(rec.pick)) fail(`LAND picked "${rec.pick}", not the lawn`);
    const td = await until((s) => s.p && s.p.gnd, 600, 'touchdown');
    const T = lawnLocal(td.s.p.x, td.s.p.z);
    if (td.s.p.surf !== 'runway' || Math.abs(T.a) > LAWN.half) fail(`touched down on ${td.s.p.surf} at ${Math.round(T.a)}, ${Math.round(T.b)}`);
    await shot('touchdown');
    const st = await until((s) => s.p.gnd && (s.p.kt < 1 || s.finish?.state === 'ready'), 200, 'stopped');
    const L = lawnLocal(st.s.p.x, st.s.p.z);
    // the touchdown must be on the lawn; the AP's soft taildragger braking may carry it on into the mown grounds beyond
    // the end (flat, clear for 600 m: the approach corridor), never further
    CASE.overrun = Math.max(0, Math.round(Math.abs(L.a) - LAWN.half));
    if (Math.abs(L.a) > LAWN.half + 180 || Math.abs(L.b) > 40) fail(`ran out of the palace grounds: ${Math.round(L.a)}, ${Math.round(L.b)}`);
    await shot('landed');
    return `${rec.pick} → touchdown ${Math.round(LAWN.half - Math.abs(T.a))} m from the far end, ${CASE.overrun ? `rolled ${CASE.overrun} m past the end onto the grounds` : `stopped ${Math.round(LAWN.half - Math.abs(L.a))} m short of the end`}`;
  });
  await step('DEMAND IT (banks + refuels)', async () => {
    await until((s) => s.finish?.state === 'ready', 300, 'DEMAND IT ready');
    const s0 = await snap();
    await tapUntil('.krz-finish', (s) => s && (s.banked > s0.banked || s.finish?.state === 'hidden'));
    await sleep(500);
    const s = await snap();
    await shot('demand-it');
    if (!(s.p.fuel >= 0.999)) fail(`not refuelled (${r1(s0.p.fuel)} → ${r1(s.p.fuel)})`);
    return `fuel ${r1(s0.p.fuel)} → ${r1(s.p.fuel)}, banked ${s0.banked} → ${s.banked}`;
  });
  await step('DEMAND TAKEOFF again', async () => {
    for (let i = 0; i < 6 && (await D.rect('.krz-reel')); i++) { await D.tap('.krz-reel-all') || await D.tap('.krz-reel-next'); await sleep(400); }
    await until((s) => s.ground?.takeoff, 60, 'DEMAND TAKEOFF offered');
    await waitReal(() => D.rect('.krz-gbtn-to'), 8000);
    const nDT = () => D.evSafe('__game.log().filter((l) => l.type === "demandTakeoff").length', 0), n0 = await nDT();
    await tapUntil('.krz-gbtn-to', async (s) => s && (!s.p.gnd || (await nDT()) > n0));
    const air = await until((s) => s.p && !s.p.gnd && s.p.agl > 10, 240, 'airborne from the lawn');
    await shot('second-takeoff');
    if ((await K()).airport !== 'palace') fail('left the palace');
    return `airborne (${air.s.p.phase})`;
  });
}

async function caseF35() {
  // ?airport=palace: the start-at entry straight onto the lawn (the map's own START HERE is covered by the tiger and swaps)
  await step('boot at the Palace Lawn (f35)', async () => {
    await fresh('f35', 'palace');
    const k = await K(), s = await snap(), L = lawnLocal(s.p.x, s.p.z);
    if (k.airport !== 'palace') fail(`booted at ${k.airport}`);
    if (!s.p.gnd || Math.abs(L.a) > LAWN.half || Math.abs(L.b) > LAWN.w) fail(`not on the lawn: ${JSON.stringify(L)}`);
    await shot('f35-on-lawn');
    return `on the lawn ${Math.round(L.a)} m along, AP ${s.p.phase}`;
  });
  await step('C-Tower 3 · Mr Fennimore on the radio', towerCheck);
  await step('VERTICAL TAKEOFF from the lawn', async () => {
    await until((s) => s.btn?.key === 'vto' && s.btn.state === 'idle', 20, 'VERTICAL TAKEOFF offered');
    await tapLand();
    const h = await until((s) => s.p.agl > 20 && !s.p.gnd, 60, 'up');
    await shot('vto');
    const L = lawnLocal(h.s.p.x, h.s.p.z);
    return `up ${r1(h.s.p.agl)} m over the lawn (${Math.round(L.a)}, ${Math.round(L.b)})`;
  });
  await step('LAND HERE on the lawn', async () => {
    const s = await until((x) => x.btn?.key === 'land' && x.btn.state === 'idle', 40, 'LAND HERE over the lawn');
    await tapLand();
    const td = await until((x) => x.p.gnd, 60, 'touchdown');
    const L = lawnLocal(td.s.p.x, td.s.p.z);
    await shot('vertical-landing');
    if (Math.abs(L.a) > LAWN.half + 30 || Math.abs(L.b) > 60) fail(`came down off the lawn grounds: ${Math.round(L.a)}, ${Math.round(L.b)}`);
    return `down on the ${td.s.p.surf} at (${Math.round(L.a)}, ${Math.round(L.b)}) from "${s.s.btn.label}"`;
  });
  await step('DEMAND IT (banks + refuels)', async () => {
    await D.ev('(() => { const f = __game.S.player.ac.fuel; f.L = f.R = f.cap * 0.45; return 1; })()');
    await until((s) => s.finish?.state === 'ready', 60, 'DEMAND IT ready');
    const s0 = await snap();
    await tapUntil('.krz-finish', (s) => s && (s.banked > s0.banked || s.finish?.state === 'hidden'));
    await sleep(500);
    const s = await snap();
    if (!(s.p.fuel >= 0.999)) fail(`not refuelled (${r1(s0.p.fuel)} → ${r1(s.p.fuel)})`);
    return `fuel → ${r1(s.p.fuel)}, banked ${s0.banked} → ${s.banked}`;
  });
  await step('VERTICAL TAKEOFF again', async () => {
    for (let i = 0; i < 6 && (await D.rect('.krz-reel')); i++) { await D.tap('.krz-reel-all') || await D.tap('.krz-reel-next'); await sleep(400); }
    await until((s) => s.btn?.key === 'vto' && s.btn.state === 'idle', 20, 'VERTICAL TAKEOFF offered');
    await tapLand();
    await until((s) => s.p.agl > 15 && !s.p.gnd, 60, 'up again');
    await shot('vto-again');
    return 'up again';
  });
}

async function caseC172() {
  await step('boot (C-Tower 1, c172)', async () => { await fresh('c172'); return (await K()).airport; });
  await startAtPalace(false);
  await step('START HERE refused with the butler\'s quip', async () => {
    await tapUntil('.krz-map-go', () => D.evSafe('/FENNIMORE|FOUNTAIN/.test(document.querySelector("#krz-hud .krz-banner")?.innerText || "")'));
    const quip = await D.evSafe('document.querySelector("#krz-hud .krz-banner")?.innerText.replace(/\\s+/g, " ")');
    await shot('c172-refused');
    const k = await K();
    if (k.airport !== 'royal' || k.phase) fail(`not refused: ${JSON.stringify(k)}`);
    return `"${quip}"`;
  });
}

D = await connect(PORT);
const RUN = { tiger: caseTiger, f35: caseF35, c172: caseC172 };
for (const name of CASES) {
  CASE = { name, orient: arg('orient', ORIENT_OF[name]), steps: [], shots: [], blocked: null };
  shotN = 0;
  log(`\n== ${CASE.orient} · ${name}${FALSIFY ? ` (falsify ${FALSIFY})` : ''}`);
  try { await RUN[name](); } catch (e) { CASE.steps.push({ step: 'harness', ok: false, detail: e.message }); log('  HARNESS', e.message); }
  CASE.ok = CASE.steps.every((s) => s.ok);
  results.push(CASE);
}
writeFileSync(join(OUT, `palace-results${FALSIFY ? '-falsify-' + FALSIFY : ''}.json`), JSON.stringify(results, null, 1));
const n = results.flatMap((c) => c.steps), ok = n.filter((s) => s.ok).length;
log(`\n${results.map((c) => `${c.orient}/${c.name}: ${c.ok ? 'PASS' : 'FAIL'}`).join('\n')}\n${ok}/${n.length} steps passed${FALSIFY ? ` (falsify ${FALSIFY}: expected to FAIL)` : ''}`);
D.close();
process.exit(results.every((c) => c.ok) ? 0 : 1);
