// D35 STOVL in the REAL game: the F-35B's context button (the LAND slot) tapped through its whole cycle with real
// touch events on live element rects, the way a phone player does it. window.__game is only READ.
//   ~/.claude/bin/cdp start --port 9661 -- --use-angle=metal
//   node tools/test-stovl.mjs [--port=9661] [--cases=easy:portrait,medium:landscape] [--timescale=3] [--falsify=deadvto|cover|noland]
// Cycle: VERTICAL TAKEOFF → (hover) stick nudge → FLY ON → wing-borne (LAND/HOVER) → HOVER → LAND HERE → parked → VTO again.
// Screenshots of every button state: docs/shots/stovl/<case>-<n>-<state>.png (gitignored). docs/STOVL.md.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, sleep } from './loop/driver.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'docs', 'shots', 'stovl');
const argv = process.argv.slice(2);
const arg = (k, d) => { const a = argv.find((x) => x === `--${k}` || x.startsWith(`--${k}=`)); if (!a) return d; const v = a.split('=')[1]; return v === undefined ? true : v; };
const PORT = +arg('port', 9661);
const BASE = arg('url', 'http://127.0.0.1:8888/gms/3d/krayzee/');
const TS = +arg('timescale', 3);
const FALSIFY = arg('falsify', '');
const CASES = String(arg('cases', 'easy:portrait,medium:landscape')).split(',').map((s) => s.split(':'));
const ORIENT = { portrait: [390, 844], landscape: [844, 390] };
const PROFILE = { name: 'Hover', gender: 'f', company: 'Hover Air', primary: '#1d4fa8', secondary: '#f4efe6', accent: '#d4a017', voice: 'toff', registration: 'K-VTOL' };
const COACH_SEEN = { 'krayzee.coach': { goal: 1, stick: 1, release: 1, radio: 1, bank: 1 }, 'krayzee.coachTakeoff': 1 };

const FALSIFY_JS = {
  // the button takes the tap and nothing happens
  deadvto: `(() => { __game.S.player.ap.verticalTakeoff = () => false; return 1; })()`,
  // an invisible sheet over the bottom of the screen: a hook-driven test would pass, a thumb cannot
  cover: `(() => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:55%;z-index:99999'; document.body.append(d); return 1; })()`,
  // LAND HERE descends far too fast: the touchdown gate must catch it
  noland: `(() => { const ap = __game.S.player.ap, f = ap._stovlStep; ap._stovlStep = function (dt) { const o = f.call(this, dt); if (this.stovl?.mode === 'land') o.throttle = 0; return o; }; return 1; })()`,
};

const SNAP = `(() => { const g = window.__game; if (!g || !g.S.player) return null; const st = g.state(), p = st.player, b = g.landButton();
  const el = document.querySelector('.krz-land'), r = el && !el.hidden ? el.getBoundingClientRect() : null;
  const gh = g.ghud;
  return { simT: +g.traffic.time.toFixed(2), mode: st.mode, fuel: g.S.player.ac.fuelFraction, finish: gh?.finish ? { state: gh.finish.state, reason: gh.finish.reason } : null, p: { x: p.x, z: p.z, agl: p.agl, kt: p.speedKt, gnd: p.onGround, crashed: p.crashed, surf: p.surface, td: p.lastTouchdown, phase: p.phase, stovl: p.stovl, done: !!g.S.player.ap.done, apMode: p.apMode },
    btn: b, rect: r && { x: r.x, y: r.y, w: r.width, h: r.height } }; })()`;

let D, M;
const log = (...a) => console.log(...a);
const r1 = (v) => Math.round(v * 10) / 10;
class Fail extends Error {}
const fail = (m) => { throw new Fail(m); };
const snap = () => D.evSafe(SNAP);
async function until(cond, simBudget, label) {
  const s0 = await snap(), t0 = Date.now(), cap = (simBudget / TS * 2.5 + 20) * 1000;
  for (;;) {
    const s = await snap();
    if (s) {
      if (s.p.crashed) fail(`${label}: CRASHED`);
      const v = await cond(s); if (v) return s;
      if (s.simT - s0.simT > simBudget) fail(`${label}: not within ${simBudget} s sim (button "${s.btn?.label}" ${s.btn?.state}, ap ${s.p.stovl?.mode}, agl ${r1(s.p.agl)}, ${r1(s.p.kt)} kt)`);
    }
    if (Date.now() - t0 > cap) fail(`${label}: real-time cap hit`);
    await sleep(150);
  }
}
const ctxIs = (key, state) => (s) => s.btn && !s.btn.hidden && s.btn.ctx?.key === key && (!state || s.btn.ctx.state === state);

// a real thumb on the main button (or its second-choice pill); refuses a covered button like a thumb would
async function tapButton(alt = false) {
  const sel = alt ? '.krz-land-now' : '.krz-land';
  const r = await D.rect(sel);
  if (!r) fail(`${sel} not visible`);
  // the pill sits inside the button: tap the main button above the pill's top edge
  const x = r.cx, y = alt ? r.cy : Math.min(r.cy, r.y + 22);
  if (!(await D.onTop(sel, x, y))) fail(`${sel} covered at (${Math.round(x)},${Math.round(y)}) by ${await D.hitName(x, y)}`);
  if (!alt) { const pill = await D.rect('.krz-land-now'); if (pill && y >= pill.y) fail('main button tap would land on the pill'); }
  await D.tapAt(x, y);
}
let shotN = 0;
async function shot(CASE, name) { const p = await D.shot(OUT, `${CASE.id}-${String(++shotN).padStart(2, '0')}-${name}`); CASE.shots.push(p); return p; }

// the button must sit clear of the stick and on screen
async function layoutCheck(CASE, s, where) {
  const st = await D.rect('.krz-stick-zone'), [w, h] = ORIENT[CASE.orient];
  const b = s.rect;
  if (!b) fail(`${where}: button hidden`);
  if (b.x < 0 || b.y < 0 || b.x + b.w > w + 0.5 || b.y + b.h > h + 0.5) fail(`${where}: button off screen ${JSON.stringify(b)}`);
  const pill = await D.rect('.krz-land-now');
  for (const r of [b, pill && { x: pill.x, y: pill.y, w: pill.w, h: pill.h }].filter(Boolean)) {
    if (st && r.x < st.x + st.w && r.x + r.w > st.x && r.y < st.y + st.h && r.y + r.h > st.y) fail(`${where}: button overlaps the stick zone (${JSON.stringify(r)} vs ${JSON.stringify(st)})`);
    if (r.x + r.w > w + 0.5 || r.y + r.h > h + 0.5 || r.x < 0 || r.y < 0) fail(`${where}: pill off screen`);
  }
  CASE.layout.push({ where, btn: b, pill: pill && { x: pill.x, y: pill.y, w: pill.w, h: pill.h } });
}

async function runCase([diff, orient]) {
  const [w, h] = ORIENT[orient];
  const CASE = { id: `f35-${diff}-${orient}`, diff, orient, steps: [], shots: [], layout: [] };
  shotN = 0;
  log(`\n== ${CASE.id} (${w}×${h}, timescale ${TS}${FALSIFY ? `, FALSIFY ${FALSIFY}` : ''})`);
  await D.viewport(w, h);
  await D.send('Page.navigate', { url: BASE + 'docs/' }); await sleep(400);
  await D.ev(`(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('krayzee.')) localStorage.removeItem(k);
    localStorage.setItem('krayzee.profile', ${JSON.stringify(JSON.stringify(PROFILE))});
    const x = ${JSON.stringify(COACH_SEEN)}; for (const k in x) localStorage.setItem(k, JSON.stringify(x[k]));
    localStorage.setItem('krayzee.settings', JSON.stringify({ v: 3, difficulty: ${JSON.stringify(diff)} })); return 1; })()`);
  D.errors.length = 0;
  await D.send('Page.navigate', { url: `${BASE}?allplanes&noaccount=1&intro=0&plane=f35&timescale=${TS}` });
  const step = async (name, fn) => {
    const t0 = Date.now();
    try { const d = await fn(); CASE.steps.push({ name, ok: true, d }); log(`  PASS ${name}${d ? ' — ' + d : ''}`); }
    catch (e) { CASE.steps.push({ name, ok: false, d: e.message }); log(`  FAIL ${name} — ${e.message}`); try { await shot(CASE, 'FAIL-' + name.replace(/\W+/g, '_')); } catch (er) { /* */ } throw e; }
    finally { CASE.steps.at(-1).real = r1((Date.now() - t0) / 1000); }
  };
  try {
    await step('boot → Free Flight by a tap', async () => {
      const t0 = Date.now();
      while (!(await D.evSafe('!!window.__krayzeeReady'))) { if (Date.now() - t0 > 45000) fail('not ready'); await sleep(300); }
      let r; while (!(r = await D.rect('.kz-btn[data-a="free"]'))) { if (Date.now() - t0 > 55000) fail('no Free Flight button'); await sleep(200); }
      await D.tapAt(r.cx, r.cy);
      const s = await until((x) => x.mode === 'play', 30, 'play');
      if (FALSIFY) { await D.ev(FALSIFY_JS[FALSIFY]); log(`  !! falsify '${FALSIFY}' injected`); }
      return `flying ${await D.ev('__game.S.type')} on ${s.p.surf}`;
    });
    // the autopilot starts its takeoff roll at once: a player taps VERTICAL TAKEOFF while it still shows (≤ 100 kt)
    let s0;
    await step('VERTICAL TAKEOFF shows on the ground (spawn / slow roll) and takes the tap', async () => {
      const s = await until(ctxIs('vto', 'idle'), 10, 'VERTICAL TAKEOFF button');
      s0 = s;
      await tapButton();
      await until((x) => x.p.stovl?.mode === 'vto', 3, 'VTO started');
      await layoutCheck(CASE, await snap(), 'ground');
      return `"${s.btn.label}" (${s.btn.ctx.sub}) at ${Math.round(s.rect.x)},${Math.round(s.rect.y)} ${Math.round(s.rect.w)}×${Math.round(s.rect.h)}, tapped at ${r1(s.p.kt)} kt`;
    });
    await step('VERTICAL TAKEOFF → stops, straight up to a hover', async () => {
      await shot(CASE, 'vto-stopping-lifting');
      const lift = await until((s) => !s.p.gnd && s.p.agl > 3, 20, 'lift-off');
      const s = await until((x) => x.p.stovl?.mode === 'hover' && Math.abs(x.p.agl - 30) < 4, 40, 'hover at ~30 m');
      const moved = Math.hypot(s.p.x - lift.p.x, s.p.z - lift.p.z);
      if (moved > 12) fail(`wandered ${r1(moved)} m on the way up`);
      return `lift-off ${r1(lift.simT - s0.simT)} s sim after the tap (stopped ${r1(Math.hypot(lift.p.x - s0.p.x, lift.p.z - s0.p.z))} m on), hover at ${r1(s.p.agl)} m, ${r1(moved)} m drift on the way up, nozzle ${s.p.stovl.nozzle} fan ${s.p.stovl.fan}`;
    });
    await step('hover: LAND HERE (+ FLY ON) offered', async () => {
      const s = await until((x) => x.btn?.ctx?.key === 'land' && x.btn.ctx.alt === 'flyon', 6, 'LAND HERE + FLY ON');
      await layoutCheck(CASE, s, 'hover');
      await shot(CASE, 'hover-landhere-flyon');
      const js = await D.ev('__game.S.player.rig.jetState?.() || null');
      if (!js || js.nozzle < 0.8 || js.liftFan < 0.8) fail(`the model's nozzle/lift fan are not down/open in the hover: ${JSON.stringify(js)}`);
      return `"${s.btn.label}" [${s.btn.ctx.state}] (${s.btn.ctx.sub}) + pill "${s.btn.alt}"; model nozzle ${Math.round(js.nozzleDeg)}°, fan ${js.liftFan.toFixed(2)}`;
    });
    await step('stick nudge in the hover moves it, and it stops again', async () => {
      const s0 = await snap(), b = await D.rect('.krz-stick-base');
      if (!b) fail('no stick');
      await D.hold(b.cx, b.cy, 0, -40, 2500 / TS * 2);   // stick forward
      const s1 = await snap();
      const s2 = await until((x) => x.p.kt < 2 && x.p.apMode !== 'MANUAL', 25, 'stops after the nudge');
      const d = Math.hypot(s2.p.x - s0.p.x, s2.p.z - s0.p.z);
      if (d < 8) fail(`only moved ${r1(d)} m`);
      if (Math.abs(s2.p.agl - s0.p.agl) > 4) fail(`height changed ${r1(s0.p.agl)} → ${r1(s2.p.agl)} m`);
      return `moved ${r1(d)} m (${r1(s1.p.kt)} kt at release), height ${r1(s0.p.agl)} → ${r1(s2.p.agl)} m`;
    });
    // a vertical landing at the airport ends like any landing: DEMAND IT banks and refuels, then up again
    await step('LAND HERE on the airfield → DEMAND IT banks + refuels', async () => {
      const s = await until((x) => x.btn?.ctx?.key === 'land' && x.btn.ctx.state === 'idle', 6, 'LAND HERE over the runway');
      await tapButton();
      await until((x) => x.p.gnd, 40, 'touchdown on the airfield');
      const st = await until((x) => x.finish?.state === 'ready', 40, 'DEMAND IT ready');
      const fuel0 = st.fuel;
      // the card fades in: a thumb waits a moment for it, as test-loop's tapUntil does
      let r = null;
      for (const t0 = Date.now(); Date.now() - t0 < 4000; await sleep(200)) { r = await D.rect('.krz-finish'); if (r && (await D.onTop('.krz-finish', r.cx, r.cy))) break; r = null; }
      if (!r) fail(`DEMAND IT not tappable (covered by ${await D.hitName(...(await D.rect('.krz-finish').then((q) => q ? [q.cx, q.cy] : [0, 0])))})`);
      await D.tapAt(r.cx, r.cy);
      const after = await until((x) => x.fuel >= 0.999 && x.finish?.state === 'hidden', 8, 'banked + refuelled');
      for (let i = 0; i < 8 && (await D.rect('.krz-reel')); i++) { if (!(await D.tap('.krz-reel-all'))) await D.tap('.krz-reel-next'); await sleep(450); }
      return `down on the ${after.p.surf} (${Math.round(after.p.td?.fpm)} fpm); DEMAND IT "${st.finish.reason}"; fuel ${fuel0.toFixed(3)} → ${after.fuel.toFixed(3)}`;
    });
    await step('VERTICAL TAKEOFF from the airfield → hover again', async () => {
      const s = await until(ctxIs('vto', 'idle'), 15, 'VERTICAL TAKEOFF');
      await tapButton();
      const h = await until((x) => x.p.stovl?.mode === 'hover' && x.btn?.ctx?.alt === 'flyon', 40, 'hover');
      return `"${s.btn.label}" → hover at ${r1(h.p.agl)} m`;
    });
    await step('tap FLY ON → wing-borne, nozzle back', async () => {
      await tapButton(true);
      const a = await until(ctxIs('hover', 'active'), 3, 'FLYING ON… shown');
      await shot(CASE, 'flying-on');
      const s = await until((x) => !x.p.stovl?.mode && x.p.stovl?.vtol < 0.05 && x.p.kt > 150, 60, 'wing-borne');
      const s2 = await until((x) => x.btn && !x.btn.hidden && x.btn.ctx && x.btn.ctx.key !== 'none', 6, 'a wing-borne choice');
      await layoutCheck(CASE, s2, 'wingborne');
      await shot(CASE, `wingborne-${s2.btn.ctx.key}`);
      return `"${a.btn.label}" then wing-borne at ${r1(s.p.kt)} kt ${r1(s.p.agl)} m; button "${s2.btn.label}" [${s2.btn.ctx.state}]${s2.btn.alt ? ` + "${s2.btn.alt}"` : ''}`;
    });
    await step('HOVER from wing-borne flight → slows to a hover', async () => {
      const s0 = await snap();
      if (s0.btn?.ctx?.key === 'hover' && s0.btn.ctx.state === 'idle') await tapButton(false);
      else if (s0.btn?.ctx?.alt === 'hover') await tapButton(true);
      else fail(`no HOVER on offer: "${s0.btn?.label}" ${JSON.stringify(s0.btn?.ctx)}`);
      const a = await until(ctxIs('flyon', 'active'), 3, 'SLOWING… shown');
      await shot(CASE, 'slowing-to-hover');
      const s = await until((x) => x.p.stovl?.mode === 'hover', 90, 'hover');
      return `"${a.btn.label}" from ${r1(s0.p.kt)} kt, hover after ${r1(s.simT - s0.simT)} s sim at ${r1(s.p.agl)} m`;
    });
    await step('LAND HERE → gentle vertical touchdown, parked', async () => {
      let s = await until((x) => x.btn?.ctx?.key === 'land', 6, 'LAND HERE');
      // over something unflyable: a player nudges forward until it lights up
      for (let k = 0; k < 6 && s.btn.ctx.state !== 'idle'; k++) {
        const b = await D.rect('.krz-stick-base');
        await D.hold(b.cx, b.cy, 0, -40, 1500 / TS * 2);
        s = await until((x) => x.p.kt < 3 && x.btn?.ctx?.key === 'land', 25, 'stopped again');
      }
      if (s.btn.ctx.state !== 'idle') fail(`LAND HERE never available: ${s.btn.ctx.sub}`);
      const s0 = s;
      await tapButton();
      const a = await until(ctxIs('cancel', 'active'), 3, 'LANDING HERE… shown');
      await layoutCheck(CASE, a, 'landing');
      await shot(CASE, 'landing-here');
      const td = await until((x) => x.p.gnd, 60, 'touchdown');
      const done = await until((x) => x.p.done && x.p.stovl?.vtol < 0.05, 20, 'parked');
      const t = done.p.td;
      if (!t || t.fpm > 450 || t.grade === 'hard' || t.grade === 'crash') fail(`touchdown ${t?.fpm} fpm ${t?.grade}`);
      return `touchdown ${Math.round(t.fpm)} fpm (${t.grade}) on ${t.surface} after ${r1(td.simT - s0.simT)} s sim; parked`;
    });
    await step('parked after a vertical landing: VERTICAL TAKEOFF again', async () => {
      const s = await until(ctxIs('vto', 'idle'), 8, 'VERTICAL TAKEOFF again');
      await layoutCheck(CASE, s, 'landed');
      await shot(CASE, 'landed-vto-again');
      await tapButton();
      await until((x) => !x.p.gnd && x.p.agl > 8, 25, 'airborne again');
      return `"${s.btn.label}" on the ${s.p.surf}; up again`;
    });
    if (D.errors.length) fail(`page errors: ${D.errors.slice(0, 3).join(' / ')}`);
    // screenshot gallery only (not a gate; the one place the harness moves the jet): HOVER first away from runways,
    // and LAND HERE greyed over the lake
    if (!FALSIFY) try {
      await D.ev('__game.teleport({ x: 180, z: -700, alt: 70, heading: 270, speedKt: 170 })');
      const h = await until((x) => x.btn?.ctx?.key === 'hover' && x.btn.ctx.state === 'idle', 8, 'HOVER first, no runway');
      await shot(CASE, 'gallery-hover-first'); log(`  shot HOVER first: "${h.btn.label}" (${h.btn.ctx.sub})${h.btn.alt ? ' + ' + h.btn.alt : ''}`);
      const h2 = await snap();
      await tapButton(h2.btn?.ctx?.key !== 'hover');
      const g = await until((x) => x.p.stovl?.mode === 'hover' && x.btn?.ctx?.key === 'land', 90, 'hover over the lake');
      await shot(CASE, `gallery-landhere-${g.btn.ctx.state}`); log(`  shot hover at (${Math.round(g.p.x)},${Math.round(g.p.z)}): "${g.btn.label}" [${g.btn.ctx.state}] ${g.btn.ctx.sub}`);
    } catch (e) { log(`  (gallery skipped: ${e.message})`); }
  } catch (e) { if (!(e instanceof Fail)) { CASE.steps.push({ name: 'harness', ok: false, d: String(e) }); log(`  FAIL harness — ${e.stack || e}`); } }
  if (D.errors.length) { CASE.steps.push({ name: 'page errors', ok: false, d: D.errors.slice(0, 3).join(' / ') }); log(`  FAIL page errors: ${D.errors.slice(0, 3).join(' / ')}`); }
  CASE.ok = CASE.steps.length > 0 && CASE.steps.every((x) => x.ok);
  return CASE;
}

D = await connect(PORT);
const all = [];
for (const c of CASES) all.push(await runCase(c));
D.close();
let n = 0, ok = 0;
for (const c of all) for (const s of c.steps) { n++; if (s.ok) ok++; }
log(`\nscreenshots: ${OUT}`);
for (const c of all) log(`  ${c.id}: ${c.ok ? 'PASS' : 'FAIL'} — ${c.shots.map((p) => p.split('/').pop()).join(', ')}`);
log(`\n${ok}/${n} steps passed${FALSIFY ? ` (falsify ${FALSIFY}: the suite ${all.every((c) => c.ok) ? 'did NOT notice' : 'went red as it must'})` : ''}`);
process.exit(all.every((c) => c.ok) ? 0 : 1);
