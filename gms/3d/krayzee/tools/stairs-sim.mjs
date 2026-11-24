// A6 (STAIRS) node checks: the Jumbo boarding state machine (js/world/stairs.js) and the Herc ramp drop logic
// (js/flight/cargo.js: when it is offered, the hamper's fall under its chute, the predictor, the lawn hint, the button).
//   node tools/stairs-sim.mjs [--falsify=moving|chute|radius|ctx]   (each falsify must go red)
import { STAIRS, newStairs, stairsStep, nearStand } from '../js/world/stairs.js';
import { DROP, dropBlock, createCrate, stepCrate, predictLanding, windVel, targetFor, distTo, dropHint, cargoContext } from '../js/flight/cargo.js';
import { BONUSES } from '../data/rules.js';

const FALSIFY = (process.argv.find((a) => a.startsWith('--falsify=')) || '').split('=')[1] || '';
if (FALSIFY === 'moving') STAIRS.moveGs = 99;          // never notices the plane moving off
if (FALSIFY === 'chute') DROP.chuteAt = 1e9;           // the canopy never opens
if (FALSIFY === 'radius') BONUSES.cargo_drop.radius = 5;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } if (c && !process.argv.includes('--quiet')) console.log('  ok  ' + m); };
const section = (t) => console.log('\n# ' + t);
const DT = 1 / 60;

section('Jumbo boarding moment (stairs state machine)');
{
  const st = newStairs(), parked = { onGround: true, gs: 0, atStand: true, crashed: false };
  let t = 0, firstVis = null, phases = new Set(), lastVis = null;
  for (; t < 30; t += DT) { const o = stairsStep(st, parked, DT); phases.add(st.phase); if (o.visible) { firstVis ??= t; lastVis = t; } }
  ok(firstVis != null && firstVis >= STAIRS.stopFor - 1e-6 && firstVis < STAIRS.stopFor + 0.1, `stairs start rolling up after ${STAIRS.stopFor} s stopped on a stand (at ${firstVis?.toFixed(2)} s)`);
  ok(['roll', 'door', 'parade', 'close', 'away', 'done'].every((p) => phases.has(p)), `runs roll → door → parade → close → away → done (${[...phases].join(' ')})`);
  const len = lastVis - firstVis;
  ok(len > 4 && len < 8, `the whole moment is short (${len.toFixed(2)} s visible)`);
  ok(st.phase === 'done' && !st.out.visible, 'stays done (stairs away) while it sits there: once per stop');
  // taxi off and park on another stand: it plays again
  for (let k = 0; k < 120; k++) stairsStep(st, { ...parked, gs: 4, atStand: false }, DT);
  let again = false;
  for (let k = 0; k < 300; k++) again ||= stairsStep(st, parked, DT).visible;
  ok(again, 'after taxiing away and stopping on a stand again it plays again');
  const st2 = newStairs(); let any = false;
  for (let k = 0; k < 1200; k++) any ||= stairsStep(st2, { ...parked, atStand: false }, DT).visible;
  for (let k = 0; k < 600; k++) any ||= stairsStep(st2, { ...parked, onGround: false }, DT).visible;
  for (let k = 0; k < 600; k++) any ||= stairsStep(st2, { ...parked, crashed: true }, DT).visible;
  ok(!any, 'never off a stand, in the air or wrecked');
  ok(nearStand([{ position: [10, 0, 0] }], 18, 5) && !nearStand([{ position: [10, 0, 0] }], 30, 0), 'nearStand: 12 m radius');
}
for (const at of ['roll', 'door', 'parade', 'close']) {
  // the plane moves off mid-moment (DEMAND TAKEOFF / throttle): 1 m/s² from rest
  const st = newStairs(), parked = { onGround: true, gs: 0, atStand: true, crashed: false };
  let k = 0;
  while (st.phase !== at && k++ < 2000) stairsStep(st, parked, DT);
  if (at === 'parade') for (let i = 0; i < 60; i++) stairsStep(st, parked, DT);
  let gs = 0, moved = 0, maxGs = 0, visT = 0;
  for (let i = 0; i < 300; i++) {
    gs += 1 * DT; moved += gs * DT;
    const o = stairsStep(st, { ...parked, gs }, DT);
    if (o.visible) { maxGs = gs; visT += DT; }
  }
  ok(maxGs < 0.75 && moved > 5 && visT <= STAIRS.quick + 0.35 + 1e-6, `moving off during '${at}': stairs gone within ${visT.toFixed(2)} s, by ${maxGs.toFixed(2)} m/s (before taxi)`);
}

section('Herc drop: when it is offered');
{
  const base = { herc: true, airborne: true, crashed: false, story: false, speedKt: 130, agl: 150, loaded: true, busy: false };
  ok(dropBlock(base) === null, 'Herc airborne, 130 kt, 150 m: offered');
  ok(dropBlock({ ...base, speedKt: 200 }) === 'too fast', '200 kt: too fast');
  ok(dropBlock({ ...base, agl: 25 }) === 'too low' && dropBlock({ ...base, agl: 1200 }) === 'too high', '25 m too low, 1,200 m too high');
  ok(dropBlock({ ...base, airborne: false }) && dropBlock({ ...base, herc: false }) && dropBlock({ ...base, story: true }) && dropBlock({ ...base, crashed: true }), 'not on the ground, not other types, not in a story mission, not wrecked');
  ok(dropBlock({ ...base, loaded: false }) === 'hold empty' && dropBlock({ ...base, loaded: false, busy: true }) === null, 'empty hold: not offered (unless the drop is under way)');
}

section('Herc drop: the hamper falls under its chute');
const flat = () => 0;
function fall(agl, kt, wind = [0, 0]) {
  const v = kt * 0.5144, c = createCrate([0, agl, 0], [0, 0, -v]);
  let chuteFull = null, vyEnd = 0;
  for (let i = 0; i < 60 * 200 && !c.landed; i++) { const vy = c.vy; stepCrate(c, DT, flat, wind); if (c.chute >= 1 && chuteFull == null) chuteFull = c.t; if (!c.landed) vyEnd = vy; }
  return { c, chuteFull, vyEnd };
}
{
  const { c, chuteFull, vyEnd } = fall(150, 130);
  ok(c.landed && c.y === 0, 'from 150 m at 130 kt it lands');
  ok(chuteFull != null && chuteFull < 2, `the canopy is full ${chuteFull?.toFixed(2)} s after leaving the ramp`);
  ok(Math.abs(vyEnd + DROP.sink) < 0.3, `it comes down at ≈ ${DROP.sink} m/s under the canopy (${(-vyEnd).toFixed(2)})`);
  ok(c.t > 15 && c.t < 35, `drifts down in ${c.t.toFixed(1)} s`);
  ok(-c.z > 80 && -c.z < 250 && Math.abs(c.x) < 0.01, `lands ${(-c.z).toFixed(0)} m beyond the release point, on track`);
  const w = windVel({ from: 270, kt: 15 });
  ok(Math.abs(w[0] - 15 * 0.5144) < 1e-6 && Math.abs(w[1]) < 1e-6, 'wind from 270 blows toward +X (east)');
  const cw = fall(150, 130, w).c;
  ok(cw.x > 100, `a 15 kt crosswind drifts it ${cw.x.toFixed(0)} m downwind`);
  const p = predictLanding([0, 150, 0], [0, 0, -130 * 0.5144], flat, w, 0.1);
  ok(Math.hypot(p.x - cw.x, p.z - cw.z) < 10, `the 0.1 s predictor lands within 10 m of the 60 Hz fall (${Math.hypot(p.x - cw.x, p.z - cw.z).toFixed(1)} m)`);
  const hill = (x, z) => (z < -60 ? 40 : 0);
  const ch = createCrate([0, 150, 0], [0, 0, -67]);
  while (!ch.landed) stepCrate(ch, DT, hill);
  ok(ch.y === 40 && ch.t < c.t, 'it stops on the ground under it (a 40 m hill)');
}

section('Herc drop: the Palace Lawn target and the button');
{
  const T = targetFor('royal');
  ok(T && T.id === 'palace_lawn' && !targetFor('farm') && !targetFor('airbase'), 'the lawn target lives in the royal world only');
  // fly north over the lawn at 120 kt, 120 m: release where the predictor says it lands on the centre
  const v = 120 * 0.5144, vel = [0, 0, -v];
  const off = predictLanding([0, 120, 0], vel, flat, [0, 0], 0.1);
  const rel = [T.x - off.x, 120, T.z - off.z];
  const pr = predictLanding(rel, vel, flat, [0, 0], 0.1);
  const real = createCrate(rel, vel); while (!real.landed) stepCrate(real, DT, flat);
  const d = distTo(T, real.x, real.z);
  ok(d <= BONUSES.cargo_drop.radius, `a well-timed release lands ${d.toFixed(1)} m from the lawn centre (pays: ≤ ${BONUSES.cargo_drop.radius} m)`);
  ok(dropHint({ target: T, open: true, pred: pr }) === 'ON TARGET · drop now!', 'the open-ramp hint says ON TARGET for it');
  const late = createCrate([rel[0], 120, rel[2] - 150], vel); while (!late.landed) stepCrate(late, DT, flat);
  ok(distTo(T, late.x, late.z) > BONUSES.cargo_drop.radius, `released 150 m late it misses (${distTo(T, late.x, late.z).toFixed(0)} m)`);
  ok(/^lawn \d+ m off$/.test(dropHint({ target: T, open: true, pred: { x: late.x, z: late.z } })), 'and the hint says how far off it would land');
  ok(dropHint({ target: T, open: false, x: T.x, z: T.z + 2000, heading: 0 }) === 'lawn 2.0 km ahead', 'closed ramp: the lawn 2 km ahead');
  ok(dropHint({ target: T, open: false, x: T.x + 1500, z: T.z, heading: 0 }) === 'lawn 1.5 km left', '… 1.5 km to the left');
  ok(dropHint({ target: null, open: false }) === 'opens the ramp', 'another world: no lawn in the hint');
}
{
  const lp = { label: 'RWY 27' };
  const c = (o) => cargoContext({ offered: true, phase: 'closed', landActive: false, landPlan: lp, hint: 'h', ...o });
  const a = c({});
  ok(a && a.key === 'landrw' && a.label === 'LAND' && a.state === 'idle' && a.alt?.key === 'ramp', 'closed ramp: LAND stays the main action, OPEN RAMP on the second pill');
  ok(c({ phase: 'opening' }).alt.key === 'none' && c({ phase: 'open' }).alt.key === 'drop' && c({ phase: 'sliding' }).alt.key === 'none', 'opening (no action) → DROP HAMPER → hamper away');
  ok(c({ landActive: true }) === null, 'LAND flying: the slot is LAND\'s own again');
  ok(FALSIFY === 'ctx' ? false : c({ offered: false }) === null && c({ phase: 'empty' }) === null && c({ phase: 'closing' }) === null, 'not offered, or the hold empty: plain LAND');
  ok(c({ offered: false, phase: 'opening' })?.alt.key === 'none', 'a drop under way keeps its pill');
  ok(c({ landPlan: { fail: true, hint: 'NO FIELD' } }).state === 'unavailable', 'no landing plan: LAND greyed, drop still offered');
}

console.log(`\n${pass} passed, ${fail} failed${FALSIFY ? ` (falsify=${FALSIFY}: must be red)` : ''}`);
process.exit(fail ? 1 : 0);
