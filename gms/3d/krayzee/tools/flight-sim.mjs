// Headless flight-core harness (no browser): node tools/flight-sim.mjs [scenario] [--trace]
// Scenarios: circuit | override | cutin | stall | taxi | traffic | all
import { Aircraft } from '../js/flight/aircraft.js';
import { Autopilot } from '../js/flight/autopilot.js';
import { Traffic } from '../js/flight/traffic.js';
import { circuitRoute, arrivalRoute, departureRoute, runwayEnd, onRunway, fromRunway, standInfo, holdPoint } from '../js/flight/routes.js';
import { KT, FT } from '../js/flight/vmath.js';

const env = {
  groundHeightAt: () => 0,
  surfaceAt: (x, z) => (onRunway(x, z, 0) ? 'runway' : 'grass'),
  colliders: [],
};
const args = process.argv.slice(2);
const TRACE = args.includes('--trace');
const scen = args.find((a) => !a.startsWith('--')) || 'all';

function mk(traffic, place, route, opts = {}) {
  const ac = new Aircraft({ dims: { gearHeight: 1.2 } });
  ac.place(place, env);
  const ap = new Autopilot(ac);
  const ent = traffic.add({ aircraft: ac, ap, player: !!opts.player, name: opts.name || ac.id });
  ap.setRoute(route);
  return ent;
}

function run(traffic, seconds, onTick) {
  const log = [];
  const seen = new Map();
  let t = 0;
  const dt = 1 / 60;
  while (t < seconds) {
    traffic.update(dt); t += dt;
    for (const e of traffic.list) {
      const ac = e.ac;
      for (const ev of ac.events.splice(0)) log.push({ t: +t.toFixed(1), who: e.name, ...ev });
      if (e.ap) for (const ev of e.ap.events.splice(0)) {
        if (ev.type === 'phase' || ev.type === 'goaround' || ev.type === 'replan' || ev.type === 'recovery' || ev.type === 'landed') {
          log.push({ t: +t.toFixed(1), who: e.name, type: ev.type, ...ev, at: `${ac.pos.x.toFixed(0)},${ac.alt.toFixed(0)},${ac.pos.z.toFixed(0)} ${(ac.speed / KT).toFixed(0)}kt` });
        }
      }
      if (TRACE && Math.floor(t * 2) !== seen.get(e)) {
        seen.set(e, Math.floor(t * 2));
        if (Math.floor(t * 2) % (process.env.EVERY ? +process.env.EVERY : 4) === 0) console.log(`${t.toFixed(1)} ${e.name} ${e.ap?.phase} pos ${ac.pos.x.toFixed(0)},${ac.alt.toFixed(1)},${ac.pos.z.toFixed(0)} spd ${(ac.speed / KT).toFixed(0)}kt hdg ${ac.heading.toFixed(0)} pit ${(ac.pitch * 57.3).toFixed(1)} bnk ${(ac.bank * 57.3).toFixed(0)} vs ${(ac.vs / FT * 60).toFixed(0)} a ${(ac.alpha * 57.3).toFixed(1)} thr ${ac.ctl.throttle.toFixed(2)} el ${ac.ctl.elevator.toFixed(2)} fl ${ac.flapsPos.toFixed(2)} gnd ${ac.onGround}`);
      }
    }
    if (onTick && onTick(t) === false) break;
  }
  return log;
}

const results = [];
function check(name, ok, detail) { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); }
const lined = (end) => { const e = runwayEnd(end); const [x, z] = fromRunway(e, 10, 0); return { x, z, heading: e.hdg }; };

function scCircuit(END = '09') {
  const tr = new Traffic(env);
  const p = mk(tr, lined(END), circuitRoute(END), { name: 'P' });
  let maxXtk = 0;
  const e = runwayEnd(END);
  const log = run(tr, 600, (t) => {
    const a = p.ac, dx = a.pos.x - e.thr[0], dz = a.pos.z - e.thr[1];
    const s = dx * e.u[0] + dz * e.u[1], l = dx * -e.u[1] + dz * e.u[0];
    if (p.ap.phase === 'FINAL' && s > -1200 && s < 0) maxXtk = Math.max(maxXtk, Math.abs(l));
    return !(p.ap.leg.kind === 'hold');
  });
  if (!TRACE) for (const l of log) console.log(JSON.stringify(l));
  check(`circuit ${END}: final within 12 m of centreline inside 1.2 km`, maxXtk < 12, `max ${maxXtk.toFixed(1)} m`);
  const td = log.find((l) => l.type === 'touchdown');
  const landed = log.find((l) => l.type === 'landed');
  const crash = log.find((l) => l.type === 'crash');
  const maxAlt = Math.max(0, ...log.filter((l) => l.at).map((l) => +l.at.split(',')[1]));
  check('circuit: no crash', !crash, crash?.reason);
  check(`circuit: touched down on ${END}`, !!td && td.surface === 'runway' && !td.bounce, td && `${td.fpm} fpm ${td.grade} on ${td.surface}`);
  check('circuit: soft landing (<700 fpm)', !!td && td.fpm < 700);
  check('circuit: rolled out + landed', !!landed);
  check('circuit: reached hold short again', p.ap.leg.kind === 'hold', p.ap.phase);
  return log;
}

function scOverride() {
  const tr = new Traffic(env);
  const p = mk(tr, lined('09'), circuitRoute('09'), { name: 'P' });
  let t0 = null, pathPos = null, released = false, devPos = null;
  const log = run(tr, 520, (t) => {
    const ac = p.ac;
    if (t0 == null && p.ap.phase === 'DOWNWIND') t0 = t;
    if (t0 != null && t - t0 < 14) { const k = t - t0; p.manual.aileron = k < 2.5 ? -0.45 : Math.abs(ac.bank) > 0.6 ? 0.2 : 0; p.manual.elevator = k < 2.5 ? 0.1 : 0.3; }
    else if (t0 != null && !released) { p.manual.aileron = null; p.manual.elevator = null; released = true; devPos = { x: ac.pos.x, z: ac.pos.z, hdg: ac.heading }; }
    return !(released && p.ap.leg.kind === 'hold');
  });
  if (!TRACE) for (const l of log) console.log(JSON.stringify(l));
  const crash = log.find((l) => l.type === 'crash');
  const td = log.filter((l) => l.type === 'touchdown').pop();
  const repl = log.find((l) => l.type === 'replan');
  check('override: path changed (heading moved >60° off downwind)', devPos && Math.abs(((devPos.hdg - 270 + 540) % 360) - 180) > 60, devPos && `hdg ${devPos.hdg.toFixed(0)}`);
  check('override: replanned after release', !!repl, repl && JSON.stringify(repl));
  check('override: no crash', !crash, crash?.reason);
  check('override: still landed', !!td && td.surface === 'runway' && p.ap.leg.kind === 'hold', td && `${td.fpm} fpm`);
}

function scCutIn() {
  // Player is flown by hand onto a short final for 27 (opposite way) and let go: AP should land there.
  const tr = new Traffic(env);
  const e = runwayEnd('27');
  const [x, z] = fromRunway(e, -1500, 40);
  const p = mk(tr, { x, z, alt: 110, heading: e.hdg - 8, speed: 70 * KT }, circuitRoute('09'), { name: 'P' });
  p.ap.replan();
  const log = run(tr, 200, () => !(p.ap.leg.kind === 'taxi'));
  if (!TRACE) for (const l of log) console.log(JSON.stringify(l));
  const td = log.find((l) => l.type === 'touchdown');
  check('cut-in: landed on 27 from a hand-flown final', !!td && td.surface === 'runway' && !log.find((l) => l.type === 'crash'), td && `${td.fpm} fpm`);
}

function scStall() {
  const tr = new Traffic(env);
  const p = mk(tr, { x: 0, z: 2000, alt: 600, heading: 0, speed: 50 * KT, throttle: 0 }, circuitRoute('09'), { name: 'P' });
  let stalled = false, t1 = 0;
  const log = run(tr, 120, (t) => {
    if (t < 15) { p.manual.elevator = 1; p.manual.throttle = 0; p.manual.aileron = 0.3; }
    else { p.manual.elevator = null; p.manual.throttle = null; p.manual.aileron = null; }
    if (p.ac.stalled) stalled = true;
    if (t > 15 && !t1 && p.ap.phase !== 'RECOVERY' && !p.ac.stalled && t > 25) t1 = t;
    return !(t1 && t > t1 + 20);
  });
  if (!TRACE) for (const l of log) console.log(JSON.stringify(l));
  check('stall: full back stick stalls', stalled);
  check('stall: AP recovers without crashing', !log.find((l) => l.type === 'crash') && p.ac.alt > 150, `alt ${p.ac.alt.toFixed(0)} phase ${p.ap.phase}`);
}

function scTraffic() {
  const tr = new Traffic(env);
  const s = standInfo('S2');
  const a = mk(tr, { x: s.pos[0], z: s.pos[1], heading: 180 }, departureRoute('09'), { name: 'DEP' });
  tr.standOwner.set('S2', a.ac);
  const e = runwayEnd('09');
  const [bx, bz] = fromRunway(e, -3000, -1500);
  const b = mk(tr, { x: bx, z: bz, alt: 350, heading: 60, speed: 90 * KT }, arrivalRoute('09', { stand: 'auto' }), { name: 'ARR' });
  const p = mk(tr, lined('09'), circuitRoute('09'), { name: 'P' });
  const log = run(tr, 700, () => !(b.ap.leg?.kind === 'park' && (a.ap.done)));
  if (!TRACE) for (const l of log) console.log(JSON.stringify(l));
  check('traffic: no crashes', !log.find((l) => l.type === 'crash'), JSON.stringify(log.find((l) => l.type === 'crash')));
  check('traffic: departure gone', a.ap.done, a.ap.phase);
  check('traffic: arrival parked', b.ap.leg?.kind === 'park', `${b.ap.phase} at ${b.ac.pos.x.toFixed(0)},${b.ac.pos.z.toFixed(0)} hdg ${b.ac.heading.toFixed(0)}`);
}

async function scLandAt() {
  const { planLandAhead } = await import('../js/assist/landahead.js');
  const { fakeWorld, layout } = await import('../js/assist/test/fakeworld.mjs');
  const w = fakeWorld();
  const wenv = { groundHeightAt: w.groundHeightAt, surfaceAt: w.surfaceAt, colliders: w.colliders };
  const cases = [
    { name: 'runway plan (lined up with 27, 2.6 km)', place: () => { const e = runwayEnd('27'); const [x, z] = fromRunway(e, -2600, 30); return { x, z, alt: 230, heading: e.hdg, speed: 80 * KT }; }, kind: 'runway' },
    { name: 'field plan (over open country)', place: () => ({ x: 2600, z: 1500, alt: 260, heading: 90, speed: 80 * KT }), kind: null },
  ];
  for (const c of cases) {
    const tr = new Traffic(wenv);
    const ac = new Aircraft({ dims: { gearHeight: 1.2 } });
    const pl = c.place();
    ac.place(pl, wenv);
    const ap = new Autopilot(ac);
    const p = tr.add({ aircraft: ac, ap, player: true, name: 'P' });
    ap.setRoute(circuitRoute('27'));
    const v = ac.vel;
    const plan = planLandAhead({ pos: [ac.pos.x, ac.pos.y, ac.pos.z], vel: [v.x, v.y, v.z], heading: ac.heading, altitude: ac.pos.y, world: w, layout });
    if (plan.fail) { check(`landAt ${c.name}: planner found a spot`, false, plan.fail); continue; }
    ap.landAt(plan);
    let td = null, crash = null;
    for (let t = 0; t < 400 && !(ap.done && ac.speed < 0.5); t += 1 / 60) {
      tr.update(1 / 60);
      for (const ev of ac.events.splice(0)) { if (ev.type === 'touchdown' && !td) td = { ...ev, x: ac.pos.x, z: ac.pos.z }; if (ev.type === 'crash') crash = ev; }
    }
    const miss = td ? Math.hypot(td.x - plan.touchdown[0], td.z - plan.touchdown[1]) : 1e9;
    check(`landAt ${c.name}: flew the ${plan.kind} plan to a stop`, !crash && ap.done && ac.onGround && ac.speed < 0.5 && (!c.kind || plan.kind === c.kind), `${plan.kind} ${plan.label} td miss ${miss.toFixed(0)} m, ${td?.fpm} fpm on ${td?.surface}, stopped at ${ac.pos.x.toFixed(0)},${ac.pos.z.toFixed(0)} ${crash?.reason || ''}`);
    check(`landAt ${c.name}: touched down near the planned spot on its surface`, td && miss < 220 && td.fpm < 700 && (plan.kind !== 'runway' || td.surface === 'runway'), `miss ${miss.toFixed(0)} m, ${td?.fpm} fpm`);
  }
  // any real input cancels: the previous route comes back
  const tr = new Traffic(wenv);
  const ac = new Aircraft({ dims: { gearHeight: 1.2 } });
  const e = runwayEnd('27'); const [x, z] = fromRunway(e, -2600, 30);
  ac.place({ x, z, alt: 230, heading: e.hdg, speed: 80 * KT }, wenv);
  const ap = new Autopilot(ac);
  const p = tr.add({ aircraft: ac, ap, player: true, name: 'P' });
  ap.setRoute(circuitRoute('27'));
  const v = ac.vel;
  ap.landAt(planLandAhead({ pos: [ac.pos.x, ac.pos.y, ac.pos.z], vel: [v.x, v.y, v.z], heading: ac.heading, altitude: ac.pos.y, world: w, layout }));
  for (let t = 0; t < 3; t += 1 / 60) { if (t > 1) p.manual.aileron = 0.3; tr.update(1 / 60); }
  p.manual.aileron = null;
  check('landAt: stick input > 0.5 s cancels back to the previous route', !ap.landing && ap.route.name.startsWith('circuits'), ap.route.name);
}

// The player drives on the ground: throttle set once (then lifted: it must latch), stick X steers to `hdg`.
function drive(tr, p, hdg, thr, secs, { elev = null } = {}) {
  const ac = p.ac, x0 = ac.pos.x, z0 = ac.pos.z;
  let along = 0, t = 0, lx = x0, lz = z0;
  const [ux, uz] = [Math.sin(hdg * Math.PI / 180), -Math.cos(hdg * Math.PI / 180)];
  for (; t < secs; t += 1 / 60) {
    p.manual.throttle = t < 0.5 ? thr : null;
    const err = ((hdg - ac.heading + 540) % 360) - 180;
    p.manual.aileron = Math.max(-1, Math.min(1, err / 25));
    if (elev != null) p.manual.elevator = elev;
    tr.update(1 / 60);
    along += (ac.pos.x - lx) * ux + (ac.pos.z - lz) * uz; lx = ac.pos.x; lz = ac.pos.z;
  }
  p.manual.aileron = null; p.manual.elevator = null;
  return { along, latched: p.axis.throttle.mode, hdgErr: Math.abs(((hdg - ac.heading + 540) % 360) - 180), crashed: ac.crashed };
}

function scGround() {
  const mkP = (place, route) => { const tr = new Traffic(env); const p = mk(tr, place, route, { name: 'P', player: true }); return { tr, p }; };
  // from the hold short of 27, turn off onto the grass by hand
  let { tr, p } = mkP((() => { const h = holdPoint('27'); return { x: h[0], z: h[1], heading: 180 }; })(), { name: 'circuits 27', legs: [{ kind: 'hold', end: '27', seconds: 600, untilClear: true }, ...circuitRoute('27').legs], loop: 1 });
  run(tr, 3);
  let r = drive(tr, p, 135, 0.45, 22);
  check('ground override: from the hold, latched throttle + stick steer moves >= 50 m on the chosen heading', r.along >= 50 && r.hdgErr < 20 && !r.crashed, `along ${r.along.toFixed(0)} m, hdg err ${r.hdgErr.toFixed(0)}°, throttle ${r.latched}`);
  check('ground override: throttle stays latched after the finger lifts', r.latched === 'latched' && p.ac.ctl.throttle > 0.4, `${r.latched} ${p.ac.ctl.throttle.toFixed(2)}`);
  // from a stand (boarding), pull out across the apron
  const s = standInfo('S3');
  ({ tr, p } = mkP({ x: s.pos[0], z: s.pos[1], heading: 180 }, departureRoute('27')));
  p.ap.setRoute({ ...p.ap.route, legs: [{ kind: 'park', seconds: 600 }, ...p.ap.route.legs] });
  run(tr, 2);
  r = drive(tr, p, 200, 0.4, 25);
  check('ground override: from a stand, latched throttle + steer moves >= 50 m on the chosen heading', r.along >= 50 && r.hdgErr < 20 && !r.crashed, `along ${r.along.toFixed(0)} m, hdg err ${r.hdgErr.toFixed(0)}°`);
  // after an autopilot landing: on the rollout, throttle up and turn off onto the grass
  const e = runwayEnd('27'); const [fx, fz] = fromRunway(e, -1500, 0);
  ({ tr, p } = mkP({ x: fx, z: fz, alt: 105, heading: e.hdg, speed: 68 * KT, throttle: 0.4, flaps: 1 }, { name: 'arrival 27', legs: [{ kind: 'approach', end: '27' }, { kind: 'taxi', dest: { stand: 'S2' } }, { kind: 'park', seconds: 99 }], loop: null }));
  p.ap.replan();
  run(tr, 120, () => !(p.ap.sub === 'rollout' && p.ac.onGround && p.ac.speed < 20));
  const v0 = p.ac.speed;
  r = drive(tr, p, (e.hdg + 320) % 360, 0.5, 20);
  const offMain = onRunway(p.ac.pos.x, p.ac.pos.z, 0)?.id !== '09/27';
  check('ground override: on the rollout after an AP landing, throttle + steer turns off and keeps going', r.along >= 50 && r.hdgErr < 20 && !r.crashed && offMain, `rollout at ${(v0 / KT).toFixed(0)} kt; along ${r.along.toFixed(0)} m, hdg err ${r.hdgErr.toFixed(0)}°, off 09/27 ${offMain}`);
  // rollout touch-and-go by hand: full throttle + back stick flies again; letting go, the AP carries on in the air
  ({ tr, p } = mkP({ x: fx, z: fz, alt: 105, heading: e.hdg, speed: 68 * KT, throttle: 0.4, flaps: 1 }, circuitRoute('27')));
  p.ap.replan();
  run(tr, 120, () => !(p.ap.sub === 'rollout' && p.ac.onGround && p.ac.speed < 22));
  p.manual.flaps = 0;
  r = drive(tr, p, e.hdg, 1, 14, { elev: 0.35 });
  p.manual.flaps = null;
  const air = !p.ac.onGround && p.ac.agl > 5;
  run(tr, 40);
  check('ground override: rollout touch-and-go by hand (throttle up + back stick) gets airborne, AP carries on', air && !p.ac.onGround && p.ac.agl > 40 && !p.ac.crashed, `air ${air} agl ${p.ac.agl.toFixed(0)} phase ${p.ap.phase}`);
}

// PLAYTEST B4/B5/B7-flight: handback near the ground, stick-only override.
function scHandback() {
  const tr = new Traffic(env);
  const e = runwayEnd('09');
  const p = mk(tr, { x: 0, z: 1500, alt: 60, heading: 90, speed: 85 * KT, throttle: 0.6 }, circuitRoute('09'), { name: 'P', player: true });
  p.ap.replan();
  // nose down hard at 60 m, then let go: must recover at once (no 1.5 s neutral wait)
  for (let t = 0; t < 1.2; t += 1 / 60) { p.manual.elevator = -0.6; tr.update(1 / 60); }
  p.manual.elevator = null;
  const rel = { agl: p.ac.agl, vs: p.ac.vs };
  let minAgl = p.ac.agl, t2 = 0, recAt = null;
  for (; t2 < 12; t2 += 1 / 60) { tr.update(1 / 60); minAgl = Math.min(minAgl, p.ac.agl); if (recAt == null && p.ap.phase === 'RECOVERY') recAt = t2; }
  check('handback: releasing a dive low recovers immediately (no ground contact, climbing)', !p.ac.crashed && minAgl > 8 && p.ac.vs > 0 && recAt != null && recAt < 0.1, `released at ${rel.agl.toFixed(0)} m / ${rel.vs.toFixed(1)} m/s; recovery after ${recAt?.toFixed(2)} s, min agl ${minAgl.toFixed(0)} m, vs ${p.ac.vs.toFixed(1)}`);
  // full roll at 150 m then release: no hit
  const q = mk(tr, { x: 0, z: -2500, alt: 150, heading: 270, speed: 90 * KT, throttle: 0.6 }, circuitRoute('09'), { name: 'Q', player: false });
  q.ap.replan();
  for (let t = 0; t < 2; t += 1 / 60) { q.manual.aileron = 1; tr.update(1 / 60); }
  q.manual.aileron = null;
  let qMin = q.ac.agl;
  for (let t = 0; t < 20; t += 1 / 60) { tr.update(1 / 60); qMin = Math.min(qMin, q.ac.agl); }
  check('handback: full roll for 2 s at 150 m, release: recovers without touching the ground', !q.ac.crashed && qMin > 20, `min agl ${qMin.toFixed(0)} m`);
  // stick-only low pass: flaps stay as they were, throttle holds speed, phase reads MANUAL
  const tr2 = new Traffic(env);
  const [lx, lz] = fromRunway(runwayEnd('27'), -400, 0);
  const r = mk(tr2, { x: lx, z: lz, alt: 15, heading: 270, speed: 95 * KT, throttle: 0.7 }, circuitRoute('27'), { name: 'R', player: true });
  r.ap.replan();
  let maxAlt = 0, minKt = 999, phase = '';
  for (let t = 0; t < 12; t += 1 / 60) {
    r.manual.elevator = Math.max(-0.5, Math.min(0.5, (12 - r.ac.agl) * 0.05 - r.ac.vs * 0.08));
    tr2.update(1 / 60);
    if (t > 2) { maxAlt = Math.max(maxAlt, r.ac.agl); minKt = Math.min(minKt, r.ac.speed / KT); phase = r.ap.phase; }
  }
  r.manual.elevator = null;
  check('stick-only override: low pass holds height and speed (AP no longer flaps/idles underneath)', maxAlt < 25 && minKt > 80 && r.ac.flapsPos < 0.2, `max agl ${maxAlt.toFixed(0)} m, min ${minKt.toFixed(0)} kt, flaps ${r.ac.flapsPos.toFixed(2)}`);
  check('stick-only override: phase label reads MANUAL', phase === 'MANUAL', phase);
}

// D20 fuel: burn rate, low-fuel warning, engine stops when empty (glide), refuel() restores it.
function scFuel() {
  const tr = new Traffic(env);
  const p = mk(tr, { x: 0, z: 3000, alt: 600, heading: 90, speed: 90 * KT, throttle: 0.7 }, circuitRoute('09'), { name: 'P' });
  p.ap.replan();
  const f0 = p.ac.fuel.L + p.ac.fuel.R;
  run(tr, 600);
  const used = f0 - (p.ac.fuel.L + p.ac.fuel.R), lph = used * 6;
  check('fuel: burns a C172-ish 15–45 L/h flying the circuit', lph > 15 && lph < 45, `${lph.toFixed(1)} L/h`);
  p.ac.fuel.L = p.ac.fuel.R = 14;
  const ev = run(tr, 30).filter((l) => l.who === 'P').map((l) => l.type);
  const s0 = p.ac.instruments();
  check('fuel: low-fuel warning fires once below 15 %', ev.filter((t) => t === 'lowfuel').length === 1 && s0.lowFuel && s0.fuelL < 0.15 && s0.fuelR < 0.15, `events ${ev.join()}`);
  p.ac.fuel.L = p.ac.fuel.R = 0.02;
  let out = false, thrustGone = false;
  run(tr, 20, () => { if (p.ac.engineOut) out = true; if (out && p.ac.eng < 0.01) thrustGone = true; });
  check('fuel: engine stops at empty (eng → 0, glides on)', out && thrustGone && !p.ac.crashed, `engineOut ${out} eng ${p.ac.eng.toFixed(2)}`);
  p.ac.refuel();
  run(tr, 5);
  check('fuel: refuel() fills both tanks and restarts the engine', !p.ac.engineOut && p.ac.fuelFraction > 0.99 && p.ac.eng > 0.05, `frac ${p.ac.fuelFraction.toFixed(3)} eng ${p.ac.eng.toFixed(2)}`);
}

// Impact events carry the contact normal for FX: the slope's normal on a hillside, the wall's on a collider.
function scImpact() {
  const slope = { ...env, groundHeightAt: (x) => x * 0.25, colliders: [{ min: [-20, 0, 980], max: [20, 60, 1020], kind: 'castle' }] };
  const bounce = () => ({ result: 'bounce', restitution: 0.4 });
  const hit = (place, elev, secs = 8) => {
    const tr = new Traffic(slope);
    const ac = new Aircraft({ dims: { gearHeight: 1.2 } });
    ac.place(place, slope);
    ac.impactHandler = bounce;
    const E = tr.add({ aircraft: ac, name: 'X' });
    ac.ctl.throttle = 0.7;
    let ev = null;
    for (let t = 0; t < secs && !ev; t += 1 / 60) { E.manual.elevator = elev; tr.update(1 / 60); ev = ac.events.find((e) => e.type === 'impact'); }
    return ev;
  };
  const g = hit({ x: 0, z: 0, alt: 40, heading: 0, speed: 90 * KT }, -1);
  const okN = (n) => Array.isArray(n) && n.length === 3 && Math.abs(Math.hypot(...n) - 1) < 1e-6;
  check('impact: ground hit carries the terrain normal n:[x,y,z]', g && okN(g.n) && g.n[0] < -0.2 && g.n[1] > 0.9, g ? JSON.stringify(g.n.map((v) => +v.toFixed(3))) + ' ' + g.reason : 'no impact');
  const w = hit({ x: 0, z: 1200, alt: 30, heading: 0, speed: 90 * KT }, 0, 6);
  check('impact: collider hit carries the wall normal', w && okN(w.n) && w.n[2] === 1, w ? JSON.stringify(w.n) + ' ' + w.reason : 'no impact');
}

const S = { impact: scImpact, fuel: scFuel, landat: scLandAt, ground: scGround, handback: scHandback, circuit: scCircuit, circuit27: () => scCircuit('27'), override: scOverride, cutin: scCutIn, stall: scStall, traffic: scTraffic };
for (const [k, f] of Object.entries(S)) if (scen === 'all' || scen === k) { console.log(`\n== ${k}`); await f(); }
const fails = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);
