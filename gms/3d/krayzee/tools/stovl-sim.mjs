// F-35B STOVL harness (no browser, D35): node tools/stovl-sim.mjs [--trace] [--only=hold,vto,land,hard,button,pad,regress]
// --falsify=nohold|weak|slam|flat|button breaks one thing on purpose: the matching checks must go red.
// Flies the real flight core + autopilot + traffic mixer. docs/STOVL.md.
import { Aircraft, TYPES } from '../js/flight/aircraft.js';
import { Autopilot } from '../js/flight/autopilot.js';
import { Traffic } from '../js/flight/traffic.js';
import { circuitRoute, runwayEnd, fromRunway, onRunway } from '../js/flight/routes.js';
import { contextButton, findPad, padCheck, leverToVs, vsToLever, LEVELS, CONVERT } from '../js/flight/stovl.js';
import { KT, FT } from '../js/flight/vmath.js';

const args = process.argv.slice(2);
const TRACE = args.includes('--trace');
const only = (args.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const want = (k) => !only.length || only.includes(k);
const FALSIFY = (args.find((a) => a.startsWith('--falsify=')) || '').slice(10);
const BREAK = {
  nohold: () => { LEVELS.easy.hold = LEVELS.medium.hold = 0; LEVELS.easy.comp = 0; LEVELS.easy.gust = 2; },   // no position hold
  weak: () => { TYPES.f35.stovl.tw = 0.95; },                                                                 // can't lift its own weight
  slam: () => { for (const k in LEVELS) LEVELS[k].sink = 5; },                                                // LAND HERE comes down hard
  flat: () => { LEVELS.hard = { ...LEVELS.easy }; },                                                          // Hard = Easy
  button: () => { CONVERT.landFirstKt = 1e9; CONVERT.vtoKt = -1; },                                           // wrong choices
};
if (FALSIFY) { BREAK[FALSIFY](); console.log(`!! falsify '${FALSIFY}'`); }
const env = { groundHeightAt: () => 0, surfaceAt: (x, z) => (onRunway(x, z, 0) ? 'runway' : 'grass'), colliders: [] };

const results = [];
function check(name, ok, detail) { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); }

// a player F-35 (the mixer's player rules apply) placed in the air or on the ground
function mk(place, { level = 'easy', type = 'f35' } = {}) {
  const tr = new Traffic(env);
  const ac = new Aircraft({ type, id: 'player' });
  ac.stovlLevel = level;
  ac.place(place, env);
  const ap = new Autopilot(ac);
  const e = tr.add({ aircraft: ac, ap, player: true, name: 'P' });
  ap.setRoute(circuitRoute('27', { type }));
  if (!ac.onGround) ap.replan();
  return { tr, ac, ap, e };
}
function run(W, secs, onTick) {
  const dt = 1 / 60, ev = [];
  for (let t = 0; t < secs; t += dt) {
    W.tr.update(dt);
    for (const x of W.ac.events.splice(0)) ev.push({ t: +t.toFixed(2), ...x });
    for (const x of W.ap.events.splice(0)) if (x.type === 'stovl' || x.type === 'landed') ev.push({ t: +t.toFixed(2), ...x });
    if (TRACE && Math.round(t * 60) % 60 === 0) {
      const a = W.ac;
      console.log(`  ${t.toFixed(0).padStart(4)} ${W.ap.stovl?.mode ?? W.ap.phase} pos ${a.pos.x.toFixed(0)},${a.agl.toFixed(1)},${a.pos.z.toFixed(0)} spd ${(a.speed / KT).toFixed(0)}kt gs ${a.gs.toFixed(1)} vs ${a.vs.toFixed(1)} pit ${(a.pitch * 57.3).toFixed(1)} bnk ${(a.bank * 57.3).toFixed(1)} hdg ${a.heading.toFixed(0)} u ${a.vtol.toFixed(2)} noz ${a.nozzle.toFixed(2)} eng ${a.eng.toFixed(2)} thr ${a.ctl.throttle.toFixed(2)} heat ${a.hoverHeat.toFixed(2)} gnd ${a.onGround}`);
    }
    if (onTick && onTick(t, ev) === false) return { t, ev };
  }
  return { t: secs, ev };
}
const PLACE_AIR = { x: -3000, z: -1500, alt: 150, heading: 90, speed: 170 * KT, throttle: 0.55, flaps: 0 };
const PLACE_GND = { x: -1500, z: -1200, heading: 90 };

// 1. A hands-off hover holds position and height (Easy and Medium); Hard drifts.
function hoverHold(level, secs = 30) {
  const W = mk({ ...PLACE_GND }, { level });
  W.ap.verticalTakeoff();
  run(W, 60, () => W.ap.stovl?.mode !== 'hover' || W.ap.stovl.hold == null || W.ac.gs > 0.3 || Math.abs(W.ac.vs) > 0.15);
  const x0 = W.ac.pos.x, z0 = W.ac.pos.z, h0 = W.ac.agl;
  let maxD = 0, maxDh = 0, maxBank = 0;
  const r = run(W, secs, () => {
    maxD = Math.max(maxD, Math.hypot(W.ac.pos.x - x0, W.ac.pos.z - z0));
    maxDh = Math.max(maxDh, Math.abs(W.ac.agl - h0));
    maxBank = Math.max(maxBank, Math.abs(W.ac.bank));
  });
  return { W, maxD, maxDh, maxBank, h0, ev: r.ev };
}
if (want('hold')) {
  console.log('\n== hold: hands-off hover');
  for (const lvl of ['easy', 'medium']) {
    const h = hoverHold(lvl);
    check(`${lvl}: VTO reaches a hover at ~${h.h0.toFixed(0)} m and holds it 30 s hands-off: within 3 m of the spot and 1.5 m of height`, h.maxD < 3 && h.maxDh < 1.5 && !h.W.ac.crashed && !h.W.ac.onGround, `drift ${h.maxD.toFixed(2)} m, height ±${h.maxDh.toFixed(2)} m, bank max ${(h.maxBank * 57.3).toFixed(1)}°`);
  }
  const W = mk({ ...PLACE_GND }, { level: 'easy' });
  W.ap.verticalTakeoff();
  run(W, 40, () => W.ap.stovl?.mode !== 'hover');
  // stick forward 3 s then let go: it moves forward and stops again (position re-captured, no fly-back)
  const x0 = W.ac.pos.x;
  W.e.manual.elevator = -0.6;
  run(W, 3);
  W.e.manual.elevator = null;
  const vMax = W.ac.gs;
  run(W, 15);
  const moved = W.ac.pos.x - x0;
  check('easy: stick forward in a hover moves it forward (~8 m/s) and it stops when let go, without flying back', vMax > 5 && moved > 15 && W.ac.gs < 0.6 && !W.ac.crashed, `speed after 3 s ${vMax.toFixed(1)} m/s, moved ${moved.toFixed(1)} m east, gs now ${W.ac.gs.toFixed(2)}`);
  // stick sideways turns on the spot
  const h0 = W.ac.heading;
  W.e.manual.aileron = 0.8; run(W, 3); W.e.manual.aileron = null; run(W, 4);
  check('easy: stick right in a hover turns right on the spot', ((W.ac.heading - h0 + 360) % 360) > 30 && ((W.ac.heading - h0 + 360) % 360) < 120 && W.ac.gs < 1, `heading ${h0.toFixed(0)} → ${W.ac.heading.toFixed(0)}, gs ${W.ac.gs.toFixed(2)}`);
  // throttle lever up climbs, AUTO (easy: let go) holds the new height
  const a0 = W.ac.agl;
  W.e.manual.throttle = 0.85; run(W, 4); W.e.manual.throttle = null; run(W, 8);
  const a1 = W.ac.agl; run(W, 5);
  check('easy: lever up climbs; let go, the height holds where it got to', a1 - a0 > 8 && Math.abs(W.ac.agl - a1) < 1, `${a0.toFixed(1)} → ${a1.toFixed(1)} → ${W.ac.agl.toFixed(1)} m`);
  // lever slammed to idle and held: Easy's computer still sets it down gently (Hard would not: it sinks at 4.5 m/s)
  let td = null;
  W.e.manual.throttle = 0; run(W, 40, (t, ev) => { td ||= ev.find((e) => e.type === 'touchdown'); return !td; });
  W.e.manual.throttle = null; run(W, 6);
  check('easy: lever held at idle in a hover → a cushioned touchdown (< 450 fpm), then it settles and parks', !!td && td.fpm < 450 && !W.ac.crashed && W.ap.done && W.ac.vtol < 0.05, `${td?.fpm} fpm ${td?.grade}, parked ${W.ap.done}`);
}

// 2. VTO → hover → forward flight (back on the circuit)
if (want('vto')) {
  console.log('\n== vto: vertical takeoff → hover → fly on');
  for (const lvl of ['easy', 'hard']) {
    const W = mk({ ...PLACE_GND }, { level: lvl });
    const x0 = W.ac.pos.x, z0 = W.ac.pos.z;
    const ok = W.ap.verticalTakeoff();
    let liftT = null, maxRoll = 0;
    const r1 = run(W, 40, (t) => { if (!W.ac.onGround && liftT == null) liftT = t; if (!W.ac.onGround) maxRoll = Math.max(maxRoll, Math.hypot(W.ac.pos.x - x0, W.ac.pos.z - z0)); return W.ap.stovl?.mode !== 'hover'; });
    check(`${lvl}: VERTICAL TAKEOFF lifts straight up from a standstill to a hover`, ok && liftT != null && liftT < 4 && W.ap.stovl?.mode === 'hover' && maxRoll < (lvl === 'hard' ? 10 : 3) && W.ac.agl > 25, `lift-off ${liftT?.toFixed(1)} s, hover at ${W.ac.agl.toFixed(1)} m after ${r1.t.toFixed(1)} s, wandered ${maxRoll.toFixed(1)} m`);
    W.ap.flyOn();
    let minAgl = 1e9, wing = null;
    const r2 = run(W, 60, (t, ev) => { minAgl = Math.min(minAgl, W.ac.agl); if (!W.ap.stovl && wing == null) wing = t; return !(wing != null && t > wing + 20); });
    check(`${lvl}: FLY ON accelerates to wing-borne flight smoothly and the autopilot flies the circuit`, wing != null && wing < 30 && !W.ac.crashed && minAgl > 15 && W.ac.vtol < 0.01 && W.ac.speed > W.ac.P.vapp && W.ap.route?.name?.startsWith('circuits'), `wing-borne after ${wing?.toFixed(1)} s, lowest ${minAgl.toFixed(1)} m, now ${(W.ac.speed / KT).toFixed(0)} kt ${W.ac.agl.toFixed(0)} m, route ${W.ap.route?.name}, nozzle ${W.ac.nozzle.toFixed(2)}`);
  }
  // pressed during the autopilot's takeoff roll (the start of every flight): brakes to a stop, then goes straight up
  {
    const e = runwayEnd('27'), [x, z] = fromRunway(e, 12, 0);
    const W = mk({ x, z, heading: e.hdg }, { level: 'easy' });
    run(W, 20, () => W.ac.gs < 90 * KT);
    const v0 = W.ac.gs, x0 = W.ac.pos.x, z0 = W.ac.pos.z;
    const ok = W.ap.verticalTakeoff();
    let stopAt = null, liftGs = null;
    run(W, 40, () => { if (W.ac.gs < 0.8 && stopAt == null) stopAt = Math.hypot(W.ac.pos.x - x0, W.ac.pos.z - z0); if (!W.ac.onGround && liftGs == null) liftGs = W.ac.gs; return W.ap.stovl?.mode !== 'hover'; });
    check('VERTICAL TAKEOFF tapped on the takeoff roll (~90 kt): brakes to a stop, then straight up', ok && stopAt != null && stopAt < 400 && liftGs != null && liftGs < 1.5 && W.ap.stovl?.mode === 'hover', `from ${(v0 / KT).toFixed(0)} kt: stopped in ${stopAt?.toFixed(0)} m, lift-off at ${liftGs?.toFixed(2)} m/s ground speed`);
  }
  // DEMAND TAKEOFF from a field (main's fieldHop → ap.fieldTakeoff) is a vertical takeoff that flies on by itself
  const W = mk({ ...PLACE_GND }, { level: 'medium' });
  const run0 = W.ap.fieldTakeoff({ world: {}, end: '27' });
  let wing = null;
  run(W, 70, (t) => { if (!W.ap.stovl && W.ac.speed > W.ac.P.vapp && wing == null) wing = t; return wing == null; });
  check('field DEMAND TAKEOFF (ap.fieldTakeoff) for the F-35 is a vertical takeoff that flies on to the circuit', !!run0?.vto && wing != null && !W.ac.crashed, `vto ${!!run0?.vto}, wing-borne after ${wing?.toFixed(1)} s`);
}

// 3. forward flight → HOVER → LAND HERE, touchdown under a safe sink rate
function convertAndLand(level, place = PLACE_AIR) {
  const W = mk({ ...place }, { level });
  run(W, 2);
  const ok = W.ap.hover();
  let hoverT = null, minAgl = 1e9, maxAgl = 0, maxPitch = 0, maxDecel = 0, vPrev = W.ac.speed;
  const agl0 = W.ac.agl;
  run(W, 120, (t) => { minAgl = Math.min(minAgl, W.ac.agl); maxAgl = Math.max(maxAgl, W.ac.agl); maxPitch = Math.max(maxPitch, Math.abs(W.ac.pitch)); maxDecel = Math.max(maxDecel, (vPrev - W.ac.speed) * 60); vPrev = W.ac.speed; if (W.ap.stovl?.mode === 'hover' && hoverT == null) hoverT = t; return hoverT == null; });
  const at = { x: W.ac.pos.x, z: W.ac.pos.z };
  const pad = findPad(env, at.x, at.z);
  W.ap.landHere(pad);
  let td = null;
  const r = run(W, 90, (t, ev) => { td ||= ev.find((e) => e.type === 'touchdown'); return !(W.ap.done && !W.ap.stovl); });
  return { W, ok, hoverT, minAgl, maxAgl, agl0, maxPitch, maxDecel, td, pad, ev: r.ev, landT: r.t };
}
if (want('land')) {
  console.log('\n== land: 170 kt → HOVER → LAND HERE');
  for (const lvl of ['easy', 'medium', 'hard']) {
    const L = convertAndLand(lvl);
    check(`${lvl}: HOVER from 170 kt / 150 m converts smoothly to a hover (no dive, no balloon, pitch < 20°)`, L.ok && L.hoverT != null && L.hoverT < 60 && L.minAgl > 20 && L.maxAgl < L.agl0 + 10 && L.maxPitch < 0.35 && !L.W.ac.crashed, `hover after ${L.hoverT?.toFixed(1)} s, ${L.minAgl.toFixed(1)}–${L.maxAgl.toFixed(1)} m, max pitch ${(L.maxPitch * 57.3).toFixed(1)}°, max decel ${L.maxDecel.toFixed(1)} m/s²`);
    if (lvl === 'easy') {
      const Lo = convertAndLand(lvl, { ...PLACE_AIR, alt: 55, speed: 165 * KT });
      check('easy: HOVER low down (165 kt / 55 m) holds its height through the conversion (±8 m) and lands', Lo.hoverT != null && Lo.minAgl > 45 && Lo.maxAgl < 63 && !!Lo.td && Lo.td.fpm < 450 && !Lo.W.ac.crashed, `${Lo.minAgl.toFixed(1)}–${Lo.maxAgl.toFixed(1)} m, hover after ${Lo.hoverT?.toFixed(1)} s, touchdown ${Lo.td?.fpm} fpm`);
    }
    const dPad = Math.hypot(L.W.ac.pos.x - L.pad.x, L.W.ac.pos.z - L.pad.z);
    check(`${lvl}: LAND HERE touches down gently (< 450 fpm, no bounce) near the pad and ends parked`, !!L.td && L.td.fpm < 450 && !L.td.bounce && !L.W.ac.crashed && L.W.ap.done && L.W.ac.gs < 0.5 && L.W.ac.vtol < 0.01 && dPad < (lvl === 'hard' ? 30 : 6), `${L.td?.fpm} fpm ${L.td?.grade} on ${L.td?.surface}, ${dPad.toFixed(1)} m from the pad, ${L.landT.toFixed(0)} s, landed event ${!!L.ev.find((e) => e.type === 'landed')}`);
  }
  // from LAND HERE the jet can VTO again (DEMAND TAKEOFF / the button) and fly on
  const L = convertAndLand('easy');
  const again = L.W.ap.verticalTakeoff({ flyOn: true });
  let wing = null;
  run(L.W, 80, (t) => { if (!L.W.ap.stovl && wing == null) wing = t; return wing == null; });
  check('after a vertical landing in a field: VERTICAL TAKEOFF again and away', again && wing != null && !L.W.ac.crashed, `wing-borne after ${wing?.toFixed(1)} s`);
  // the player cancels LAND HERE by tapping again → hovers where it is
  const W = mk({ ...PLACE_GND }, { level: 'easy' });
  W.ap.verticalTakeoff(); run(W, 40, () => W.ap.stovl?.mode !== 'hover');
  W.ap.landHere({ x: W.ac.pos.x, z: W.ac.pos.z }); run(W, 4); const a = W.ac.agl; W.ap.hover(); run(W, 10);
  check('LAND HERE stopped half way (HOVER again) holds the height it had', W.ap.stovl?.mode === 'hover' && Math.abs(W.ac.agl - a) < 3 && !W.ac.onGround, `${a.toFixed(1)} → ${W.ac.agl.toFixed(1)} m`);
}

// 4. Hard is harder than Easy: drift, the hover heat budget, a firmer touchdown
if (want('hard')) {
  console.log('\n== hard vs easy');
  const E = hoverHold('easy'), H = hoverHold('hard');
  check('hands-off hover 30 s: Hard drifts with the wind (> 25 m), Easy stays put (< 3 m)', H.maxD > 25 && E.maxD < 3, `easy ${E.maxD.toFixed(1)} m, hard ${H.maxD.toFixed(1)} m`);
  const heat = (lvl) => {
    const W = mk({ ...PLACE_GND }, { level: lvl });
    W.ap.verticalTakeoff();
    let hot = null, warn = null;
    run(W, 150, (t, ev) => { warn ??= ev.find((e) => e.type === 'hoverhot')?.t; hot ??= ev.find((e) => e.type === 'overheat')?.t; return true; });
    return { hot, warn, agl: W.ac.agl, crashed: W.ac.crashed, W };
  };
  const he = heat('easy'), hh = heat('hard');
  const htd = hh.W.ac.lastTouchdown;
  check('hover heat: Hard warns, then overheats inside ~80 s of hover and is forced down to a safe landing; Easy never does', hh.warn != null && hh.hot != null && hh.hot < 85 && hh.W.ac.onGround && !hh.crashed && htd && htd.fpm < 450 && hh.W.ap.done && he.hot == null && he.warn == null && he.agl > 25, `hard warn ${hh.warn?.toFixed(0)} s, overheat ${hh.hot?.toFixed(0)} s, touchdown ${htd?.fpm} fpm, parked ${hh.W.ap.done} | easy height after 150 s ${he.agl.toFixed(1)} m`);
  const tdE = convertAndLand('easy').td, tdH = convertAndLand('hard').td;
  check('LAND HERE: the Hard touchdown is firmer than Easy (both safe)', tdE && tdH && tdH.fpm > tdE.fpm && tdH.fpm < 450, `easy ${tdE?.fpm} fpm, hard ${tdH?.fpm} fpm`);
  const slam = (lvl) => { const W = mk({ ...PLACE_GND }, { level: lvl }); W.ap.verticalTakeoff(); run(W, 40, () => W.ap.stovl?.mode !== 'hover'); let td = null; W.e.manual.throttle = 0; run(W, 40, (t, ev) => { td ||= ev.find((e) => e.type === 'touchdown'); return !td; }); return td; };
  const sE = slam('easy'), sH = slam('hard');
  check('lever slammed to idle in a hover: Easy cushions it (< 450 fpm), Hard does not (> 700 fpm)', sE && sH && sE.fpm < 450 && sH.fpm > 700, `easy ${sE?.fpm} fpm, hard ${sH?.fpm} fpm ${sH?.grade}`);
  check('the throttle lever: Hard has almost no dead band (Easy 0.12 each side)', LEVELS.hard.db < LEVELS.easy.db / 2 && leverToVs(0.56, { vsUp: 6, vsDown: 4.5 }, LEVELS.hard) > 0 && leverToVs(0.56, { vsUp: 6, vsDown: 4.5 }, LEVELS.easy) === 0);
}

// 5. The context button's choices
if (want('button')) {
  console.log('\n== button: context choices');
  const B = (o) => contextButton({ stovl: true, onGround: false, gsKt: 0, speedKt: 150, agl: 150, mode: null, pad: null, landPlan: null, ...o });
  const rw = { label: 'RWY 27', kind: 'runway' };
  const cases = [
    ['on the ground, stopped → VERTICAL TAKEOFF', B({ onGround: true, gsKt: 0 }), 'vto', 'idle'],
    ['on the ground, rolling slowly → VERTICAL TAKEOFF (stops first)', B({ onGround: true, gsKt: 30 }), 'vto', 'idle'],
    ['on the ground, rolling fast → greyed (too fast)', B({ onGround: true, gsKt: 120 }), 'none', 'unavailable'],
    ['airborne, 150 kt, low, no runway → HOVER', B({}), 'hover', 'idle'],
    ['airborne slowed right down, runway in reach → HOVER (LAND as the second choice)', B({ speedKt: 100, landPlan: rw }), 'hover', 'idle', 'landrw'],
    ['fast and high near a runway → LAND (HOVER second)', B({ speedKt: 260, agl: 500, landPlan: rw }), 'landrw', 'idle', 'hover'],
    ['on a circuit / final at 150 kt with a runway → LAND (HOVER second)', B({ speedKt: 150, agl: 200, landPlan: rw }), 'landrw', 'idle', 'hover'],
    ['too fast to hover, no runway → HOVER greyed "slow down"', B({ speedKt: 420, landPlan: { fail: 'x', hint: 'NO RUNWAY IN REACH' } }), 'hover', 'unavailable'],
    ['too fast with a runway → normal LAND button (null)', B({ speedKt: 420, landPlan: rw }), null],
    ['hovering over clear ground → LAND HERE (FLY ON second)', B({ mode: 'hover', speedKt: 0, pad: { x: 0, z: 0, d: 0 } }), 'land', 'idle', 'flyon'],
    ['hovering over a building → LAND HERE greyed (FLY ON second)', B({ mode: 'hover', speedKt: 0, pad: { fail: 'buildings below' } }), 'land', 'unavailable', 'flyon'],
    ['landing → LANDING HERE… (tap stops it)', B({ mode: 'land' }), 'cancel', 'active'],
    ['flying on → FLYING ON… (tap hovers again)', B({ mode: 'flyon' }), 'hover', 'active'],
    ['converting → SLOWING TO HOVER… (tap flies on)', B({ mode: 'convert' }), 'flyon', 'active'],
    ['not a STOVL jet → normal LAND button', contextButton({ stovl: false }), null],
    ['HOVER shown first, then a runway comes in reach → HOVER stays first (no swap under the thumb)', B({ speedKt: 160, landPlan: rw, prefer: 'hover' }), 'hover', 'idle', 'landrw'],
    ['LAND shown first, slowing below 110 kt → LAND stays first', B({ speedKt: 100, landPlan: rw, prefer: 'landrw' }), 'landrw', 'idle', 'hover'],
  ];
  for (const [name, b, key, state, alt] of cases) {
    const ok = key === null ? b === null : b && b.key === key && b.state === state && (alt === undefined || b.alt?.key === alt);
    check(`button: ${name}`, ok, b ? `${b.label} [${b.state}]${b.alt ? ' + ' + b.alt.label : ''}` : 'normal LAND');
  }
}

// 6. Pads: flat and clear only
if (want('pad')) {
  console.log('\n== pad: where a vertical landing is allowed');
  const E2 = { groundHeightAt: (x) => (x > 100 ? (x - 100) * 0.4 : 0), surfaceAt: (x, z) => (z > 300 ? 'water' : 'grass'),
    colliders: [{ min: [-20, 0, -20], max: [20, 10, 20] }], treeTop: (x, z, pad) => (Math.hypot(x - 0, z - 200) < 10 + pad ? 12 : -Infinity) };
  check('pad: open grass is clear', padCheck(E2, -100, -100) === true);
  check('pad: on a building is refused', padCheck(E2, 0, 0) === 'buildings below');
  check('pad: a slope is refused', padCheck(E2, 150, -100) === 'too steep');
  check('pad: water is refused', padCheck(E2, -100, 400) === 'water below');
  check('pad: trees are refused', padCheck(E2, 0, 200) === 'trees below');
  check('pad: parked aircraft are refused', padCheck(E2, -100, -100, { avoid: [[-95, -100, 15]] }) === 'aircraft below');
  const p = findPad(E2, 0, 0);
  check('findPad: from over a building it finds clear grass next to it', !p.fail && padCheck(E2, p.x, p.z) === true && p.d <= 45, JSON.stringify(p));
  check('findPad: nothing clear in reach → fail with the reason', !!findPad(E2, -100, 600, { maxR: 60 }).fail);
  check('lever ↔ vs round trip', [-4, -1, 0, 1.5, 5].every((v) => Math.abs(leverToVs(vsToLever(v, { vsUp: 6, vsDown: 4.5 }, LEVELS.medium), { vsUp: 6, vsDown: 4.5 }, LEVELS.medium) - v) < 0.05));
}

// 7. The other planes are untouched; a conventional F-35 circuit still works
if (want('regress')) {
  console.log('\n== regress');
  for (const type of ['c172', 'jumbo']) {
    const W = mk({ ...PLACE_AIR, speed: 90 * KT }, { type });
    check(`${type}: has no STOVL (hover() refused, vtol stays 0)`, !W.ap.hover() && !W.ap.stovl && W.ac.vtol === 0);
  }
  const W = mk({ ...PLACE_AIR }, { level: 'easy' });
  let maxU = 0;
  run(W, 60, () => { maxU = Math.max(maxU, W.ac.vtol, W.ac.nozzle); });
  check('f35 wing-borne on the autopilot never moves the nozzle', maxU === 0 && !W.ac.crashed);
}

const fails = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);
