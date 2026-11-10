// CONTROLS lane (D37 AUTO countdown / AUTO OFF, desktop mouse aim) — the flight core in node, no browser.
//   node tools/controls-sim.mjs                     all checks
//   node tools/controls-sim.mjs --root=<dir>        run against another tree's js/ + data/ (e.g. an export of HEAD)
//   node tools/controls-sim.mjs --falsify=<fault>   break one thing on purpose; the matching checks must go red:
//      wait (the player's countdown back to 1.5 s) · attHold (the countdown levels the wings, the old 1.5 s hold) · urgent (old
//      150 m rule skips the countdown) · nosafety (no upset skip at all) · bank60 (the old 60° bank rescue) · off (AUTO OFF never holds) · cmd (LAND does not end AUTO OFF) · roll (instructor
//      rolls the wrong way) · level (instructor never levels the wings on the aim)
import { pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const arg = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const ROOT = resolve(arg('root', resolve(dirname(fileURLToPath(import.meta.url)), '..')));
const FALSIFY = arg('falsify', '');
const imp = (p) => import(pathToFileURL(resolve(ROOT, p)).href);
const { Aircraft } = await imp('js/flight/aircraft.js');
const { Autopilot } = await imp('js/flight/autopilot.js');
const { Traffic, OVERRIDE } = await imp('js/flight/traffic.js');
const { circuitRoute, runwayEnd, fromRunway, onRunway } = await imp('js/flight/routes.js');
const { KT } = await imp('js/flight/vmath.js');
let MA = null;
try { MA = await imp('js/flight/mouseaim.js'); } catch (e) { /* not in this tree */ }
// the player's countdown, read from main.js (it imports three, so node only parses the constant)
const MAIN = (await import('node:fs')).readFileSync(resolve(ROOT, 'js/main.js'), 'utf8');
const WAIT = FALSIFY === 'wait' ? 1.5 : +(/const AUTO_COUNTDOWN = ([\d.]+)/.exec(MAIN)?.[1] ?? 1.5);

const env = { groundHeightAt: () => 0, surfaceAt: (x, z) => (onRunway(x, z, 0) ? 'runway' : 'grass'), colliders: [] };
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };
const H = 1 / 60;
function player(place, end = '09', type = 'c172') {
  const tr = new Traffic(env);
  const ac = new Aircraft({ type });
  ac.place(place, env);
  const ap = new Autopilot(ac);
  const p = tr.add({ aircraft: ac, ap, player: true, name: 'P' });
  p.wait = WAIT;   // what main.js does for the player (D37)
  ap.setRoute(circuitRoute(end, { type }));
  ap.replan();
  if (FALSIFY === 'urgent' || FALSIFY === 'bank60') patchMix(tr);
  if (FALSIFY === 'attHold') { const u = ap.update.bind(ap); ap.update = (dt) => { ap.holdBank = false; ap._holdB = ap.attHold ? 0 : null; return u(dt); }; }
  if (FALSIFY === 'nosafety') {   // the mixer never sees an upset (fields restored before the physics step)
    const o = tr._mix.bind(tr);
    tr._mix = (e, h) => { const a = e.ac, s = [a.bank, a.vs, a.stalled]; a.bank = 0; a.vs = 0; a.stalled = false; o(e, h); [a.bank, a.vs, a.stalled] = s; };
  }
  if (FALSIFY === 'off' && tr.setAutoOff) tr.setAutoOff = () => {};
  if (FALSIFY === 'cmd') ap.landAt = ((f) => function (plan) { const r = f.call(this, plan); this.wantAuto = false; return r; })(ap.landAt);
  return { tr, p, ac, ap };
}
// falsify helpers: re-introduce the old behaviour inside the mixer
function patchMix(tr) {
  const orig = tr._mix.bind(tr);
  tr._mix = (e, h) => {
    if (FALSIFY === 'urgent') { const w = e.wait; if (!e.ac.onGround && e.ac.agl < 150) e.wait = OVERRIDE.wait; orig(e, h); e.wait = w; return; }
    if (FALSIFY === 'bank60') { const w = e.wait; if (!e.ac.onGround && Math.abs(e.ac.bank) > 1.05) e.wait = OVERRIDE.wait; orig(e, h); e.wait = w; return; }
    orig(e, h);
  };
}
const step = (S, secs, fn) => { for (let t = 0; t < secs; t += H) { fn?.(t); S.tr.update(H); } };
const mode = (S) => S.tr.modeOf(S.p);
const auto = (S) => (S.tr.autoState ? S.tr.autoState(S.p) : null);
const cruise = () => ({ x: 0, z: 3500, alt: 600, heading: 90, speed: 95 * KT, throttle: 0.7 });

// ---- 1. release → 10 s countdown → AP; the plane really is hands-off meanwhile
{
  const S = player(cruise());
  step(S, 3);
  step(S, 2, () => { S.p.manual.aileron = 0.5; });
  S.p.manual.aileron = null;
  const bank0 = S.ac.bank;
  let firstAuto = null, maxLeft = 0, bankAt5 = null, first = null;
  for (let t = 0; t < 16; t += H) {
    S.tr.update(H);
    first ??= auto(S);
    const a = auto(S);
    if (a?.countdown != null) maxLeft = Math.max(maxLeft, a.countdown);
    if (t > 5 && bankAt5 == null) bankAt5 = S.ac.bank;
    if (firstAuto == null && S.ap.attHold === false && ['aileron', 'elevator', 'rudder'].every((k) => S.p.axis[k].mode !== 'wait' && S.p.axis[k].mode !== 'manual')) firstAuto = t;
  }
  check('D37 countdown: after letting go the stick axes wait ~10 s before the AP blends back', firstAuto != null && firstAuto > 9.5 && firstAuto < 10.6, `blend began ${firstAuto?.toFixed(2)} s after release`);
  check('D37 countdown: autoState counts down from 10', first && first.countdown != null && maxLeft > 9.8 && maxLeft <= 10.01, `first ${JSON.stringify(first)} max ${maxLeft.toFixed(2)}`);
  check('D37 countdown: AP fully back (AUTOPILOT) by 12.5 s', mode(S) === 'AUTOPILOT', mode(S));
  check('D37 countdown: during the countdown the turn the player left carries on — no wings-levelling, no route (bank still > 60 % of the release bank at +5 s)', bankAt5 != null && bankAt5 * Math.sign(bank0) > Math.abs(bank0) * 0.6 && Math.abs(bank0) > 0.15, `release bank ${(bank0 * 57.3).toFixed(0)}°, +5 s ${(bankAt5 * 57.3).toFixed(0)}°`);
}
// ---- 2. touching the stick again restarts the countdown
{
  const S = player(cruise());
  step(S, 2, () => { S.p.manual.elevator = 0.1; });
  S.p.manual.elevator = null;
  step(S, 6);
  const mid = auto(S)?.countdown;
  step(S, 0.3, () => { S.p.manual.elevator = 0.05; });
  const held = auto(S);
  S.p.manual.elevator = null;
  step(S, 0.1);
  const again = auto(S)?.countdown;
  step(S, 8);
  const at8 = mode(S);
  check('D37 countdown: a touch mid-countdown restarts it (holding → 10 again)', mid != null && mid < 5 && held?.holding && again > 9.7, `mid ${mid?.toFixed(1)} held ${JSON.stringify(held)} again ${again?.toFixed(1)}`);
  check('D37 countdown: still not AUTOPILOT 8 s after the second release', at8 !== 'AUTOPILOT', at8);
}
// ---- 3. a real upset still skips the countdown (safety), low level flight does not
{
  const S = player({ x: 0, z: 3500, alt: 100, heading: 90, speed: 95 * KT, throttle: 0.7 });
  step(S, 1, () => { S.p.manual.aileron = 0.05; });
  S.p.manual.aileron = null;
  step(S, 3);
  check('D37 countdown: level flight at 100 m AGL keeps the full countdown (old rule skipped it under 150 m)', auto(S)?.countdown > 5, JSON.stringify(auto(S)));
  const U = player(cruise());
  step(U, 2.2, () => { U.p.manual.aileron = 1; });
  U.p.manual.aileron = null;
  step(U, 1);
  const W = player(cruise());
  for (let t = 0; t < 8 && W.ac.bank < 62 / 57.3; t += H) { W.p.manual.aileron = 0.35; W.tr.update(H); }
  W.p.manual.aileron = null;
  const wb = W.ac.bank;
  step(W, 1);
  check('D37 countdown: let go at the Easy/Medium 60° bank detent (≈ 62°) → the countdown still runs', wb > 1.07 && wb < 1.2 && auto(W)?.countdown > 8, `released at ${(wb * 57.3).toFixed(0)}° → ${JSON.stringify(auto(W))}`);
  const V = player({ x: 0, z: 3500, alt: 120, heading: 90, speed: 95 * KT, throttle: 0.7 });
  step(V, 4, () => { V.p.manual.elevator = V.ac.vs > -10 ? -0.6 : 0; });
  V.p.manual.elevator = null;
  const vs0 = V.ac.vs, agl0 = V.ac.agl;
  step(V, 0.3);
  check('D37 countdown: let go diving at the ground (≥ 8 m/s sink low) → the AP recovers at once', auto(V)?.countdown == null && mode(V) !== 'MANUAL', `released ${agl0.toFixed(0)} m AGL sinking ${(-vs0).toFixed(1)} m/s → ${mode(V)} ${V.ap.phase}`);
  check('D37 countdown: let go banked past 70° → the AP recovers at once', auto(U)?.countdown == null && U.ap.phase === 'RECOVERY' || mode(U) !== 'MANUAL' && auto(U)?.countdown == null, `bank ${(U.ac.bank * 57.3).toFixed(0)}° phase ${U.ap.phase} ${JSON.stringify(auto(U))}`);
}
// ---- 4. AUTO OFF: the plane stays the player's, no countdown, for a minute; AUTO on again → AP
{
  const S = player(cruise());
  step(S, 2);
  S.tr.setAutoOff?.(S.p, true);
  step(S, 1, () => { S.p.manual.aileron = 0.3; });
  S.p.manual.aileron = null;
  let sawAuto = false, sawCount = false;
  step(S, 60, () => { if (mode(S) !== 'MANUAL') sawAuto = true; if (auto(S)?.countdown != null) sawCount = true; });
  const ctl = S.ac.ctl;
  check('D37 AUTO OFF: 60 s after letting go it is still MANUAL, never counting down', !sawAuto && !sawCount && auto(S)?.off, `sawAuto ${sawAuto} sawCount ${sawCount} ${JSON.stringify(auto(S))}`);
  check('D37 AUTO OFF: the plane holds what it was left doing (still airborne, a steady bank, the lever latched)', !S.ac.crashed && S.ac.agl > 200 && Math.abs(S.ac.bank) < 0.9 && S.p.axis.throttle.mode === 'latched', `agl ${S.ac.agl.toFixed(0)} bank ${(S.ac.bank * 57.3).toFixed(0)}° thr ${S.p.axis.throttle.mode}`);
  S.tr.resume(S.p);
  step(S, 1.5);
  check('D37 AUTO OFF → tap AUTO: AUTOPILOT within 1.5 s', mode(S) === 'AUTOPILOT' && !auto(S)?.off, mode(S));
}
// ---- 5. tap AUTO mid-countdown = AP now
{
  const S = player(cruise());
  step(S, 1, () => { S.p.manual.aileron = 0.2; });
  S.p.manual.aileron = null;
  step(S, 2);
  (S.tr.autoNow ? S.tr.autoNow(S.p) : S.tr.resume(S.p));
  step(S, 1.2);
  check('D37 tap during the countdown: AUTOPILOT within 1.2 s', mode(S) === 'AUTOPILOT', mode(S));
}
// ---- 6. LAND under AUTO OFF turns AUTO back on (and with the countdown running, LAND takes the stick at once)
{
  const e = runwayEnd('27'), [x, z] = fromRunway(e, -3000, 0);
  const S = player({ x, z, alt: 200, heading: e.hdg, speed: 85 * KT, throttle: 0.5 }, '27');
  S.tr.setAutoOff?.(S.p, true);
  step(S, 2);
  const plan = { label: 'RWY 27', kind: 'runway', route: { name: 'land', legs: [{ kind: 'approach', end: '27', label: 'LAND', land: true }], loop: null } };
  S.ap.landAt(plan);
  step(S, 2);
  check('D37 LAND under AUTO OFF: AUTO back on, the AP flies the LAND', !auto(S)?.off && mode(S) === 'AUTOPILOT' && !!S.ap.landing, `${mode(S)} ${JSON.stringify(auto(S))} landing ${!!S.ap.landing}`);
  const C = player({ x, z, alt: 200, heading: e.hdg, speed: 85 * KT, throttle: 0.5 }, '27');
  step(C, 1, () => { C.p.manual.aileron = 0.1; });
  C.p.manual.aileron = null;
  step(C, 1);
  C.ap.landAt(plan);
  step(C, 1.5);
  check('D37 LAND mid-countdown: the AP has the stick within 1.5 s (no 10 s wait)', mode(C) === 'AUTOPILOT', `${mode(C)} ${JSON.stringify(auto(C))}`);
}
// ---- 7. AI planes keep the 1.5 s release
{
  const tr = new Traffic(env), ac = new Aircraft({ type: 'c172' });
  ac.place(cruise(), env);
  const ap = new Autopilot(ac), q = tr.add({ aircraft: ac, ap, name: 'AI' });
  ap.setRoute(circuitRoute('09')); ap.replan();
  for (let t = 0; t < 1; t += H) { q.manual.aileron = 0.1; tr.update(H); }
  q.manual.aileron = null;
  for (let t = 0; t < 4; t += H) tr.update(H);
  check('D37: an entity without `wait` (AI, sims) still hands back after 1.5 s', tr.modeOf(q) === 'AUTOPILOT', tr.modeOf(q));
}

// ---- 8. mouse-aim instructor (js/flight/mouseaim.js instruct): aim right → banks right, turns to it, then holds it
if (!MA?.instruct) check('mouse aim: js/flight/mouseaim.js instruct() exists', false, 'module missing');
else {
  let instruct = MA.instruct;
  if (FALSIFY === 'roll') instruct = (ac, aim, o) => { const r = MA.instruct(ac, aim, o); return { ...r, aileron: -r.aileron }; };
  if (FALSIFY === 'level') instruct = (ac, aim, o) => { const r = MA.instruct(ac, aim, o); return { ...r, aileron: r.off < 0.2 ? 0.25 : r.aileron }; };
  for (const [type, kt, alt] of [['c172', 95, 600], ['tiger', 75, 500], ['f35', 300, 900]]) {
    const S = player({ x: type === 'f35' ? -4000 : 0, z: type === 'f35' ? -4000 : 3500, alt, heading: 90, speed: kt * KT, throttle: 0.75 }, '09', type);
    step(S, 1);
    const aim = MA.aimVector(150, 0);   // 60° right of the nose, level
    let maxBank = 0, bankAt2 = null, t0 = 0, onAim = null;
    const hdgErr = () => Math.abs(((S.ac.track ?? S.ac.heading) - 150 + 540) % 360 - 180);
    for (let t = 0; t < (type === 'f35' ? 22 : 40); t += H) {   // (the F-35 would reach the Kingdom's edge: the escort takes over)
      const c = instruct(S.ac, aim, {});
      Object.assign(S.p.manual, { aileron: c.aileron, elevator: c.elevator, rudder: c.rudder });
      S.tr.update(H); t0 = t;
      maxBank = Math.max(maxBank, S.ac.bank);
      if (t > 2 && bankAt2 == null) bankAt2 = S.ac.bank;
      if (onAim == null && hdgErr() < 5) onAim = t;
    }
    const hold = { bank: Math.abs(S.ac.bank * 57.3), err: hdgErr(), vs: S.ac.vs };
    check(`mouse aim ${type}: aim 60° right → banks right within 2 s, never past ~75° (Easy limit 70°)`, bankAt2 > 0.25 && maxBank < 76 / 57.3, `bank at 2 s ${(bankAt2 * 57.3).toFixed(0)}°, max ${(maxBank * 57.3).toFixed(0)}°`);
    check(`mouse aim ${type}: turns onto the aim (≤ 5° off) within ${type === 'f35' ? 30 : 25} s`, onAim != null && onAim < (type === 'f35' ? 30 : 25), `on aim at ${onAim?.toFixed(1)} s`);
    check(`mouse aim ${type}: then holds it straight — wings level (< 8°), on heading (< 4°), no dive (> −3 m/s)`, hold.bank < 8 && hold.err < 4 && hold.vs > -3 && !S.ac.crashed, `bank ${hold.bank.toFixed(1)}° err ${hold.err.toFixed(1)}° vs ${hold.vs.toFixed(1)} m/s`);
  }
  // aim up 10°: climbs, aim down 8°: descends
  const S = player(cruise());
  step(S, 1);
  for (let t = 0; t < 12; t += H) { const c = instruct(S.ac, MA.aimVector(90, 6 * Math.PI / 180), {}); Object.assign(S.p.manual, { aileron: c.aileron, elevator: c.elevator, rudder: c.rudder }); S.tr.update(H); }
  const up = S.ac.vs;
  for (let t = 0; t < 12; t += H) { const c = instruct(S.ac, MA.aimVector(90, -8 * Math.PI / 180), {}); Object.assign(S.p.manual, { aileron: c.aileron, elevator: c.elevator, rudder: c.rudder }); S.tr.update(H); }
  check('mouse aim: aim above → climbs, aim below → descends', up > 1 && S.ac.vs < -1.5, `vs up ${up.toFixed(1)} m/s, down ${S.ac.vs.toFixed(1)} m/s`);
}

const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} passed${FALSIFY ? ` (falsify=${FALSIFY})` : ''}`);
process.exit(bad.length ? 1 : 0);
