// Headless flight-core harness (no browser): node tools/flight-sim.mjs [scenario] [--trace]
// Scenarios: landmany | feel | circuit | override | cutin | stall | taxi | traffic | types | typeoverride | typeground | all
import { Aircraft, TYPES, GL } from '../js/flight/aircraft.js';
import { AIRCRAFT } from '../data/aircraft.js';
import { Autopilot } from '../js/flight/autopilot.js';
import { Traffic } from '../js/flight/traffic.js';
import { circuitRoute, circuitLegs, arrivalRoute, departureRoute, runwayEnd, onRunway, fromRunway, standInfo, holdPoint } from '../js/flight/routes.js';
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
  const ac = new Aircraft(opts.type ? { type: opts.type } : { dims: { gearHeight: 1.2 } });
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

// ---------- docs/PLANES.md: Tiger Moth (taildragger) and the Royal Flying Bathtub ----------
const wrapD = (d) => ((d + 540) % 360) - 180;
function scTypeCircuit(type, END) {
  const tr = new Traffic(env);
  const p = mk(tr, lined(END), circuitRoute(END, { type }), { name: type, type });
  const e = runwayEnd(END), ac = p.ac, P = ac.P, book = AIRCRAFT[type].performance.takeoffRollM;
  let lift = null, x0 = ac.pos.x, z0 = ac.pos.z, maxDevTO = 0, maxDevRoll = 0, tdPitch = null, tdTail = null, maxXtk = 0, tdSeen = false;
  const log = run(tr, 1100, (t) => {
    if (!lift && !ac.onGround) lift = { d: Math.hypot(ac.pos.x - x0, ac.pos.z - z0), kt: ac.speed / KT };
    const dev = Math.abs(wrapD(ac.heading - e.hdg));
    if (ac.onGround && !lift) maxDevTO = Math.max(maxDevTO, dev);
    if (ac.onGround && p.ap.sub === 'rollout') maxDevRoll = Math.max(maxDevRoll, dev);
    if (!tdSeen && ac.lastTouchdown) { tdSeen = true; tdPitch = ac.pitch; tdTail = { at: t, down: null }; }
    if (tdTail && tdTail.down == null && ac.tailDown) tdTail.down = t - tdTail.at;
    const dx = ac.pos.x - e.thr[0], dz = ac.pos.z - e.thr[1], sAl = dx * e.u[0] + dz * e.u[1], l = dx * -e.u[1] + dz * e.u[0];
    if (p.ap.phase === 'FINAL' && sAl > -1200 && sAl < 0) maxXtk = Math.max(maxXtk, Math.abs(l));
    return !(lift && p.ap.leg.kind === 'hold');
  });
  const td = log.find((l) => l.type === 'touchdown'), tag = `${type} circuit ${END}`;
  const bad = log.filter((l) => ['crash', 'impact', 'tailstrike', 'hardlanding'].includes(l.type));
  check(`${tag}: takeoff ground run within ±25% of the book ${book} m`, lift && Math.abs(lift.d - book) <= book * 0.25, lift && `${lift.d.toFixed(0)} m, airborne at ${lift.kt.toFixed(0)} kt`);
  check(`${tag}: no ground loop on the AP takeoff roll / rollout (heading within 5°)`, maxDevTO < 5 && maxDevRoll < 5, `takeoff ${maxDevTO.toFixed(1)}°, rollout ${maxDevRoll.toFixed(1)}°`);
  check(`${tag}: no crash / impact / tail strike / hard landing`, !bad.length, bad.map((b) => b.type + (b.reason ? ' ' + b.reason : '')).join() || 'clean');
  check(`${tag}: final within 12 m of centreline inside 1.2 km`, maxXtk < 12, `max ${maxXtk.toFixed(1)} m`);
  check(`${tag}: good landing on the runway (one touchdown, < 400 fpm)`, td && td.surface === 'runway' && !td.bounce && td.fpm < 400 && log.filter((l) => l.type === 'touchdown').length === 1, td && `${td.fpm} fpm ${td.grade} at ${(ac.lastTouchdown.speed / KT).toFixed(0)} kt`);
  if (P.groundPitch) check(`${tag}: three-point touchdown (attitude >= 80% of ${(P.groundPitch / DEG_).toFixed(1)}°, tail down within 1 s)`, tdPitch >= P.groundPitch * 0.8 && tdTail?.down != null && tdTail.down < 1, `pitch ${(tdPitch / DEG_).toFixed(1)}°, tail down after ${tdTail?.down?.toFixed(2)} s`);
  check(`${tag}: rolled out, taxied back to the hold`, !!log.find((l) => l.type === 'landed') && p.ap.leg.kind === 'hold', p.ap.phase);
}
const DEG_ = Math.PI / 180;
function scTypes() { for (const type of ['tiger', 'bathtub']) for (const END of ['09', '27']) scTypeCircuit(type, END); }

function scTypeOverride() {
  for (const type of ['tiger', 'bathtub']) {
    const tr = new Traffic(env);
    const p = mk(tr, lined('09'), circuitRoute('09', { type }), { name: type, type, player: true });
    let t0 = null, released = false, devHdg = null;
    const log = run(tr, 1100, (t) => {
      const ac = p.ac;
      if (t0 == null && p.ap.phase === 'DOWNWIND') t0 = t;
      if (t0 != null && t - t0 < 14) { const k = t - t0; p.manual.aileron = k < 2.5 ? -0.45 : Math.abs(ac.bank) > 0.6 ? 0.2 : 0; p.manual.elevator = k < 2.5 ? 0.1 : 0.3; }
      else if (t0 != null && !released) { p.manual.aileron = null; p.manual.elevator = null; released = true; devHdg = ac.heading; }
      return !(released && p.ap.leg.kind === 'hold');
    });
    const repl = log.find((l) => l.type === 'replan'), td = log.filter((l) => l.type === 'touchdown').pop();
    const bad = log.filter((l) => ['crash', 'impact', 'tailstrike'].includes(l.type));
    check(`${type} override: hand-flown off the downwind, released, replans and lands`, devHdg != null && Math.abs(wrapD(devHdg - 270)) > 60 && repl && !bad.length && td?.surface === 'runway' && p.ap.leg.kind === 'hold', `hdg at release ${devHdg?.toFixed(0)}, ${repl ? 'replan ' + repl.to : 'no replan'}, td ${td?.fpm} fpm ${bad.map((b) => b.type).join()}`);
    // dive released low: immediate recovery
    const tr2 = new Traffic(env);
    const q = mk(tr2, { x: 0, z: 1500, alt: 60, heading: 90, speed: TYPES[type].vcruise * 0.95, throttle: 0.6 }, circuitRoute('09', { type }), { name: type, type, player: true });
    q.ap.replan();
    for (let t = 0; t < 1.2; t += 1 / 60) { q.manual.elevator = -0.6; tr2.update(1 / 60); }
    q.manual.elevator = null;
    let minAgl = q.ac.agl;
    for (let t = 0; t < 15; t += 1 / 60) { tr2.update(1 / 60); minAgl = Math.min(minAgl, q.ac.agl); }
    check(`${type} handback: dive released at 60 m recovers (no ground contact, climbing)`, !q.ac.crashed && minAgl > 8 && q.ac.vs > 0, `min agl ${minAgl.toFixed(0)} m, vs ${q.ac.vs.toFixed(1)}`);
  }
}

function scTypeGround() {
  const flat = { groundHeightAt: () => 0, surfaceAt: () => 'runway', colliders: [] };
  for (const type of ['tiger', 'bathtub']) {
    const ac = new Aircraft({ type }), P = ac.P, R = AIRCRAFT[type].engine;
    ac.place({ x: 0, z: 0, heading: 90 }, flat);
    const y0 = ac.pos.y, p0 = ac.pitch;
    for (let i = 0; i < 600; i++) ac.step(1 / 120, flat);
    const evs = ac.events.splice(0).map((e) => e.type);
    if (P.groundPitch) check(`${type} at rest: placed and settled in the 3-point attitude, tail wheel down, no tail strike`, Math.abs(p0 - P.groundPitch) < 0.01 && Math.abs(ac.pitch - P.groundPitch) < 0.015 && Math.abs(ac.pos.y - y0) < 0.05 && ac.tailDown && !ac.noseDown && !evs.length, `placed ${(p0 / DEG_).toFixed(1)}° → ${(ac.pitch / DEG_).toFixed(1)}°, y ${y0.toFixed(2)} → ${ac.pos.y.toFixed(2)}, agl ${ac.agl.toFixed(2)}, events ${evs.join() || '-'}`);
    else check(`${type} at rest: four feet loaded, level, no events`, ac.wheels.length === 4 && ac.wheels.every((w) => w.load > 300) && Math.abs(ac.pitch) < 0.02 && !evs.length, `loads ${ac.wheels.map((w) => w.load.toFixed(0)).join('/')}`);
    const rpm = ac.instruments().rpm;
    check(`${type}: idle rpm from the roster (${R.idleRpm}), full-power static < max ${R.maxRpm}`, Math.abs(rpm - R.idleRpm) < 60 && (ac.eng = 1, ac.instruments().rpm < R.maxRpm), `${rpm.toFixed(0)} / ${ac.instruments().rpm.toFixed(0)}`);
    check(`${type}: fuel tanks hold ${P.fuelCap} L each`, ac.fuel.cap === P.fuelCap && ac.fuel.L > P.fuelCap - 0.5, `${ac.fuel.cap}`);
  }
  // tail wheel steering: right rudder yaws right on the ground at taxi speed
  const tw = new Aircraft({ type: 'tiger' });
  tw.place({ x: 0, z: 0, heading: 90 }, flat);
  for (let t = 0; t < 6; t += 1 / 120) { tw.ctl.throttle = 0.35; tw.ctl.rudder = t > 2 ? 1 : 0; tw.ctl.elevator = 0.3; tw.step(1 / 120, flat); }
  check('tiger: right rudder steers right on the ground (tail wheel turns the other way)', wrapD(tw.heading - 90) > 15, `heading ${tw.heading.toFixed(0)}`);
  // ground loop: lively (hands off after a yaw kick it swings far) but survivable (rudder catches it)
  const loop = (ctrl) => {
    const ac = new Aircraft({ type: 'tiger' });
    ac.place({ x: 0, z: 0, heading: 90, speed: 30 * KT }, flat);
    for (let i = 0; i < 60; i++) { ac.ctl.throttle = 0.5; ac.ctl.elevator = 0.3; ac.step(1 / 120, flat); }
    ac.w.y -= 0.15;
    let dev = 0;
    for (let t = 0; t < 12; t += 1 / 120) {
      ac.ctl.throttle = 0.5; ac.ctl.elevator = 0.3;
      ac.ctl.rudder = ctrl ? Math.max(-1, Math.min(1, wrapD(90 - ac.heading) * 0.05 + ac.w.y * 1.5)) : 0;
      ac.step(1 / 120, flat); dev = Math.max(dev, Math.abs(wrapD(ac.heading - 90)));
    }
    return dev;
  };
  const free = loop(false), held = loop(true);
  check('tiger ground loop: lively hands-off (a yaw kick at 30 kt swings > 10°), survivable with rudder (< 5°)', free > 10 && held < 5, `hands off ${free.toFixed(0)}°, with rudder ${held.toFixed(1)}°`);
  // bathtub wobble: hands-off level flight rocks in roll
  const b = new Aircraft({ type: 'bathtub' });
  b.place({ x: 0, z: 0, alt: 300, heading: 90, speed: 55 * KT, throttle: 0.7 }, flat);
  let flips = 0, sg = 0, peak = 0;
  for (let t = 0; t < 10; t += 1 / 120) {
    b.step(1 / 120, flat);
    if (t > 2 && Math.abs(b.w.z) > 0.01) { const s = Math.sign(b.w.z); if (sg && s !== sg) flips++; sg = s; peak = Math.max(peak, Math.abs(b.w.z)); }
  }
  check('bathtub: wobbles in roll hands-off (~0.45 Hz roll-rate reversals, not a spin)', flips >= 5 && flips <= 12 && peak < 0.5 && !b.crashed, `${flips} reversals in 8 s, peak ${(peak / DEG_).toFixed(1)}°/s`);
}

// PLAYTEST_2 B2: LAND from ten representative positions (incl. Mission 1's line-up / PRESS LAND points), every type:
// a touchdown and a stop, no crash, no endless go-around. Fake world (rolling ground, castle hill, trees, town).
async function scLandMany() {
  const { planLandAhead } = await import('../js/assist/landahead.js');
  const { fakeWorld, layout } = await import('../js/assist/test/fakeworld.mjs');
  const w = fakeWorld(), wenv = { groundHeightAt: w.groundHeightAt, surfaceAt: w.surfaceAt, colliders: w.colliders };
  const e27 = runwayEnd('27'), e09 = runwayEnd('09');
  const at = (e, sAl, l, alt, hdg = e.hdg, kt = 88) => { const [x, z] = fromRunway(e, sAl, l); return { x, z, alt, heading: hdg, kt }; };
  const CASES = [
    ['M1 line-up 2.6 km', at(e27, -2600, 0, 210)], ['M1 PRESS LAND 1.5 km', at(e27, -1500, 0, 170, 270, 80)],
    ['200 m north, parallel', at(e27, -2200, -200, 175, 270, 85)], ['200 m north, close in', at(e27, -900, -200, 150, 270, 85)],
    ['300 m south, 3 km', at(e27, -3000, 300, 230)], ['09 straight in, high', at(e09, -3000, 0, 320, 90, 95)],
    ['base for 27', at(e27, -2000, 1200, 200, 0, 85)], ['crosswise over the field', { x: 100, z: -1700, alt: 220, heading: 180, kt: 90 }],
    ['40° intercept, 3 km', at(e27, -3000, 1100, 260, 230)], ['open country (field)', { x: 2600, z: 1500, alt: 260, heading: 90, kt: 90 }],
  ];
  for (const type of ['c172', 'tiger', 'bathtub']) {
    const res = [];
    for (const [name, c] of CASES) {
      const tr = new Traffic(wenv);
      const ac = new Aircraft({ type });
      ac.place({ x: c.x, z: c.z, alt: c.alt, heading: c.heading, speed: Math.min(c.kt * KT, ac.P.vcruise * 0.95), throttle: 0.6 }, wenv);
      const ap = new Autopilot(ac);
      tr.add({ aircraft: ac, ap, player: true, name: 'P' });
      ap.setRoute(circuitRoute('27', { type })); ap.replan();
      for (let t = 0; t < 2; t += 1 / 60) tr.update(1 / 60);
      const plan = planLandAhead({ pos: [ac.pos.x, ac.pos.y, ac.pos.z], vel: [ac.vel.x, ac.vel.y, ac.vel.z], heading: ac.heading, altitude: ac.alt, world: w, layout });
      if (plan.fail) { res.push({ name, ok: false, why: plan.fail }); continue; }
      ap.landAt(plan);
      let t = 0, crash = null, td = null, ga = 0, far = 0;
      for (; t < 300; t += 1 / 60) {
        tr.update(1 / 60);
        for (const ev of ac.events.splice(0)) { if (ev.type === 'crash') crash = ev; if (ev.type === 'touchdown' && !td) td = ev; }
        for (const ev of ap.events.splice(0)) if (ev.type === 'goaround') ga++;
        far = Math.max(far, Math.hypot(ac.pos.x - plan.touchdown[0], ac.pos.z - plan.touchdown[1]));
        if (crash || (ac.onGround && ac.speed < 0.5 && ap.done)) break;
      }
      res.push({ name, ok: !crash && ac.onGround && ap.done && ac.speed < 0.5, t, plan: plan.label, ga, far, td, why: crash ? 'crash ' + crash.reason : ap.phase + ' ' + ac.speed.toFixed(1) });
    }
    const lim = type === 'c172' ? 150 : 200, bad = res.filter((r) => !r.ok), slow = res.filter((r) => !r.ok || r.t > lim);
    check(`LAND ×10 ${type}: touchdown + stop from every position (no crash, no endless go-around)`, !bad.length, bad.map((r) => `${r.name}: ${r.why || 'not stopped'}`).join('; ') || res.map((r) => `${r.plan} ${r.t.toFixed(0)}s${r.ga ? ' GA' + r.ga : ''}`).join(', '));
    check(`LAND ×10 ${type}: each within ${lim} s (max ${Math.max(...res.map((r) => r.t || 0)).toFixed(0)} s), never > 5 km from the touchdown`, !slow.length && res.every((r) => (r.far ?? 0) < 5000), slow.map((r) => `${r.name} ${(r.t ?? 0).toFixed(0)}s`).join('; '));
  }
  // a go-around on a LAND plan comes back round to the same spot (it used to climb away for ever)
  const tr = new Traffic(wenv), ac = new Aircraft({ dims: { gearHeight: 1.2 } });
  ac.place({ x: 2600, z: 1500, alt: 260, heading: 90, speed: 90 * KT, throttle: 0.6 }, wenv);
  const ap = new Autopilot(ac);
  tr.add({ aircraft: ac, ap, player: true, name: 'P' });
  ap.setRoute(circuitRoute('27'));
  const plan = planLandAhead({ pos: [ac.pos.x, ac.pos.y, ac.pos.z], vel: [ac.vel.x, ac.vel.y, ac.vel.z], heading: 90, altitude: ac.alt, world: w, layout });
  ap.landAt(plan);
  let forced = false, t = 0, far = 0;
  for (; t < 420 && !(ac.onGround && ap.done && ac.speed < 0.5); t += 1 / 60) {
    tr.update(1 / 60);
    if (!forced && ap.leg?.kind === 'approach' && ac.agl < 60 && !ac.onGround) { ap._goAround('not lined up'); forced = t; }
    if (forced) far = Math.max(far, Math.hypot(ac.pos.x - plan.touchdown[0], ac.pos.z - plan.touchdown[1]));
  }
  check(`LAND go-around (${plan.label}): circuits back and lands on the planned strip`, forced && ac.onGround && ap.done && far < 3500 && Math.hypot(ac.pos.x - plan.touchdown[0], ac.pos.z - plan.touchdown[1]) < 900, `forced at ${(+forced).toFixed(0)} s, stopped ${(t - forced).toFixed(0)} s later, max ${far.toFixed(0)} m out`);
}

// LANDFIX2: Aaron's three LAND taps from his phone log (aaron1.jsonl), LAND NOW off a circuit, PLAYTEST_3 #2/#8/#9.
// State at the tap: log x/z, AGL, kt, heading, fpm, pitch, flaps; C2/C3 were mid upset-recovery.
export const AARON = [
  { name: 'C1 8 m after takeoff, off 27', x: 174, z: 32, agl: 5, kt: 73, hdg: 255, fpm: 327, pitch: 9, bank: -1, flaps: 0 },
  { name: 'C2 15 m, -2864 fpm dive', x: -28, z: 597, agl: 15, kt: 90, hdg: 191, fpm: -2864, pitch: -23, bank: 5, flaps: 0, rec: true },
  { name: 'C3 15 m, -2972 fpm dive', x: -260, z: 940, agl: 15, kt: 80, hdg: 260, fpm: -2972, pitch: -13, bank: 0, flaps: 1 / 3, rec: true },
];
// Flies one LAND tap to a stop; the metrics behind the LANDFIX2 targets.
export function flyLandTap(W, layout, planLandAhead, type, c, { now = false, armLandNow = null, setup = null, secs = 180 } = {}) {
  const wenv = { groundHeightAt: W.groundHeightAt, surfaceAt: W.surfaceAt, colliders: W.colliders };
  const tr = new Traffic(wenv), ac = new Aircraft({ type });
  const kt = Math.min(c.kt, ac.P.vcruise / KT * 0.97);
  ac.place({ x: c.x, z: c.z, alt: c.agl, heading: c.hdg, speed: kt * KT, throttle: 1, flaps: c.flaps || 0, pitch: (c.pitch || 0) * DEG_, roll: (c.bank || 0) * DEG_ }, wenv);
  if (c.fpm != null) { const vs = c.fpm * FT / 60, gs = Math.sqrt(Math.max(0, (kt * KT) ** 2 - vs * vs)), h = c.hdg * DEG_; ac.vel.set(Math.sin(h) * gs, vs, -Math.cos(h) * gs); }
  ac.impactHandler = () => ({ result: 'bounce', restitution: 0.35 });   // Free Flight is Rubber
  const ap = new Autopilot(ac);
  tr.add({ aircraft: ac, ap, player: true, name: 'P' });
  ap.setRoute(circuitRoute('27', { type })); ap.replan();
  if (c.rec) { ap.recovering = true; ap.wantThrottleAuto = true; }
  const plan = () => planLandAhead({ pos: ac.pos, vel: ac.vel, heading: ac.heading, altitude: ac.alt, onGround: ac.onGround, world: W, layout });
  let p = plan(), first = null;
  if (p.fail) return { fail: p.fail };
  ap.landAt(p);
  if (setup) { for (let t = 0; t < setup; t += 1 / 60) tr.update(1 / 60); first = p; armLandNow(); p = plan(); if (p.fail) return { fail: p.fail }; ap.landAt(p); }
  const alt0 = ac.alt; let t = 0, climb = 0, airRoll = 0, run = 0, flT = null, td = null, tdT = null, rise = 0, crash = null, ga = 0, last = '';
  for (; t < secs; t += 1 / 60) {
    tr.update(1 / 60);
    for (const ev of ac.events.splice(0)) { if (ev.type === 'crash') crash = ev; if (ev.type === 'touchdown' && !td) { td = ev; tdT = t; } }
    for (const ev of ap.events.splice(0)) if (ev.type === 'goaround') ga++;
    if (!td) climb = Math.max(climb, ac.alt - alt0);
    if (ap.sub === 'rollout' && ap.leg?.kind === 'approach' && !ac.mainsDown && ac.agl > 0.5) { run += 1 / 60; airRoll = Math.max(airRoll, run); } else run = 0;
    if (ap.sub === 'flare' && last !== 'flare' && !td) flT = t;
    if (td && !ac.onGround) rise = Math.max(rise, ac.agl);
    last = ap.sub;
    if (crash || (ap.done && ac.onGround && ac.speed < 0.5)) break;
  }
  return { plan: p, first, stopped: !crash && ap.done && ac.onGround && ac.speed < 0.5, t, climb, airRoll, f2td: flT != null && tdT != null ? tdT - flT : null, rise, td, ga, crash };
}
async function scAaron() {
  const { planLandAhead, armLandNow } = await import('../js/assist/landahead.js');
  const { fakeWorld, layout } = await import('../js/assist/test/fakeworld.mjs');
  const W = fakeWorld();
  for (const type of ['c172', 'tiger', 'bathtub']) for (const c of AARON) {
    const r = flyLandTap(W, layout, planLandAhead, type, c);
    const d = r.fail ? r.fail : `${r.plan.label}/${r.plan.pattern} stop ${r.t.toFixed(0)} s, climb ${r.climb.toFixed(1)} m, flare→td ${r.f2td?.toFixed(1)} s, bounce rise ${r.rise.toFixed(1)} m, airborne ROLLOUT ${r.airRoll.toFixed(2)} s, td ${r.td?.fpm} fpm, GA ${r.ga}`;
    check(`LANDFIX2 ${type} ${c.name}: straight ahead and down, stopped ≤ 60 s`, !r.fail && r.stopped && r.plan.pattern === 'straight' && r.t <= 60 && r.ga === 0, d);
    check(`LANDFIX2 ${type} ${c.name}: no climb > 10 m, no airborne ROLLOUT, no balloon, flare→td ≤ 4 s`, !r.fail && r.climb <= 10 && r.airRoll < 0.03 && r.rise < 3 && (r.f2td == null || r.f2td <= 4), d);
  }
  // LAND NOW: LAND chose a circuit/join; the second button flies straight ahead instead
  const e27 = runwayEnd('27'), [nx, nz] = fromRunway(e27, -900, -200);
  for (const type of ['c172', 'tiger', 'bathtub']) {
    const r = flyLandTap(W, layout, planLandAhead, type, { x: nx, z: nz, agl: 150, kt: 85, hdg: 270 }, { setup: 6, armLandNow });
    check(`LAND NOW ${type} (from a RWY 27 circuit, 150 m): straight ahead, stopped`, !r.fail && r.first?.pattern !== 'straight' && r.plan.pattern === 'straight' && r.stopped && r.climb < 5, r.fail || `LAND ${r.first?.label}/${r.first?.pattern} → NOW ${r.plan.label}/${r.plan.pattern}, stopped ${r.t.toFixed(0)} s`);
  }
}
// PLAYTEST_3 #2: ATC extends the downwind while the AP is on a looping route's last leg → it must wrap, not throw.
function scLoopExtend() {
  const tr = new Traffic(env), ac = new Aircraft({ type: 'c172' });
  ac.place({ x: 4000, z: 1000, alt: 240, heading: 270, speed: 85 * KT }, env);
  const ap = new Autopilot(ac); tr.add({ aircraft: ac, ap, player: true, name: 'P' });
  const legs = [[3000, -1000], [5000, -1000], [5000, 1000], [3000, 1000]].map(([x, z], i) => ({ kind: 'fly', to: [x, 240, z], speed: 85, label: 'RACE', ...(i === 3 ? { ext: true, end: '27' } : {}) }));
  ap.setRoute({ name: 'race', legs, loop: 0 }, { start: 3 });
  ap.extendDownwind(1175, '27');
  let err = null, maxI = 0;
  try { for (let t = 0; t < 200; t += 1 / 60) { tr.update(1 / 60); maxI = Math.max(maxI, ap.i); } } catch (e) { err = e; }
  check('PLAYTEST_3 #2: extendDownwind on a looping route\'s last leg wraps to route.loop (no TypeError, no freeze)', !err && maxI < legs.length && ac.speed > 30, err ? err.message : `max i ${maxI}/${legs.length}`);
}
// PLAYTEST_3 #8/#9: stick grab never hands over idle; a latched lever survives a low stick release; low+slow takeback.
function scThrottleTakeback() {
  const tr = new Traffic(env);
  const p = mk(tr, { x: 0, z: 2500, alt: 300, heading: 90, speed: 80 * KT, throttle: 0 }, circuitRoute('09'), { name: 'P', player: true });
  p.ap.replan();
  p.ac.ctl.throttle = 0; p.ap.out.throttle = 0;
  for (let t = 0; t < 3; t += 1 / 60) { p.manual.elevator = 0.05; tr.update(1 / 60); }
  check('PLAYTEST_3 #8: grabbing the stick with the AP at idle gives cruise-ish power, not 0', p.ac.ctl.throttle >= 0.5, `thr ${p.ac.ctl.throttle.toFixed(2)}`);
  p.manual.elevator = null;
  const q = mk(tr, { x: 0, z: -2500, alt: 100, heading: 270, speed: 85 * KT, throttle: 0.6 }, circuitRoute('09'), { name: 'Q', player: true });
  q.ap.replan();
  for (let t = 0; t < 1; t += 1 / 60) { q.manual.throttle = 0.46; q.manual.elevator = -0.15; tr.update(1 / 60); }
  q.manual.throttle = null;
  for (let t = 0; t < 1; t += 1 / 60) { q.manual.elevator = -0.15; tr.update(1 / 60); }
  q.manual.elevator = null;
  for (let t = 0; t < 4; t += 1 / 60) tr.update(1 / 60);
  check('PLAYTEST_3 #8: a latched lever stays latched when the stick is let go low (only AUTO / an upset hands it back)', q.axis.throttle.mode === 'latched' && Math.abs(q.axis.throttle.val - 0.46) < 0.01, `${q.axis.throttle.mode} ${q.axis.throttle.val?.toFixed(2)}`);
  const r = mk(tr, { x: 2000, z: 2000, alt: 41, heading: 0, speed: 50 * KT, throttle: 1, pitch: 0.12 }, circuitRoute('09'), { name: 'R', player: true });
  r.ap.replan();
  let minAgl = 99, maxBank = 0;
  for (let t = 0; t < 12; t += 1 / 60) { tr.update(1 / 60); minAgl = Math.min(minAgl, r.ac.agl); if (r.ac.agl < 55) maxBank = Math.max(maxBank, Math.abs(r.ac.bank) / DEG_); }
  check('PLAYTEST_3 #9: AP takeback at 41 m / 50 kt: wings nearly level below 55 m, no sink below 30 m', minAgl > 30 && maxBank < 12, `min agl ${minAgl.toFixed(0)} m, max bank ${maxBank.toFixed(0)}°`);
}

// PLAYTEST_2 B3/B4/B5 and the player's short final (B7).
function scPlayerFeel() {
  const types = ['c172', 'tiger', 'bathtub'];
  // B3: a hand-flown 25 % bank turn for 10 s: the engine keeps its power (no speed-hold idling it)
  for (const type of types) {
    const tr = new Traffic(env), ac = new Aircraft({ type });
    ac.place({ x: 0, z: -3000, alt: 400, heading: 90, speed: ac.P.vcruise * 0.9, throttle: 0.75 }, env);
    const ap = new Autopilot(ac), p = tr.add({ aircraft: ac, ap, player: true, name: 'P' });
    ap.setRoute({ name: 'cruise', legs: [{ kind: 'fly', to: [9000, 400, -3000], speed: 90 }], loop: null });
    for (let t = 0; t < 8; t += 1 / 60) tr.update(1 / 60);
    const thr0 = ac.ctl.throttle; let minThr = 1;
    for (let t = 0; t < 10; t += 1 / 60) { p.manual.aileron = 0.25; p.manual.elevator = t < 3 ? -0.15 : 0.05; tr.update(1 / 60); minThr = Math.min(minThr, ac.ctl.throttle); }
    p.manual.aileron = p.manual.elevator = null;
    check(`B3 ${type}: stick-only bank/push keeps the throttle (min ${minThr.toFixed(2)} vs ${thr0.toFixed(2)} at the grab)`, minThr >= thr0 - 0.05, `phase ${ap.phase}`);
  }
  // B4: the lever latches in the air until the AUTO detent (releaseThrottle) or a resume()
  {
    const tr = new Traffic(env), ac = new Aircraft({ dims: { gearHeight: 1.2 } });
    ac.place({ x: 0, z: -3000, alt: 400, heading: 90, speed: 90 * KT, throttle: 0.8 }, env);
    const ap = new Autopilot(ac), p = tr.add({ aircraft: ac, ap, player: true, name: 'P' });
    ap.setRoute(circuitRoute('27')); ap.replan();
    for (let t = 0; t < 0.5; t += 1 / 60) { p.manual.throttle = 0.5; tr.update(1 / 60); }
    p.manual.throttle = null;
    let off = 0;
    for (let t = 0; t < 30; t += 1 / 60) { tr.update(1 / 60); off = Math.max(off, Math.abs(ac.ctl.throttle - 0.5)); }
    const st = tr.throttleState(p);
    check('B4: a throttle set to 50 % in flight stays at 50 % for 30 s (latched, lever shows the player value)', off < 0.01 && st.mode === 'latched' && st.player === 0.5 && !st.auto, `max drift ${off.toFixed(3)}, ${JSON.stringify(st)}`);
    tr.autoThrottle(p);
    for (let t = 0; t < 1.5; t += 1 / 60) tr.update(1 / 60);
    check('B4: the AUTO detent (traffic.autoThrottle) hands it back to the autopilot', tr.throttleState(p).auto && p.axis.throttle.mode === 'auto', JSON.stringify(tr.throttleState(p)));
  }
  // B5: rolled inverted by hand low down, then released: upright and climbing before the ground
  for (const type of types) {
    const tr = new Traffic(env), ac = new Aircraft({ type });
    ac.place({ x: 0, z: -3000, alt: 175, heading: 90, speed: ac.P.vcruise * 0.9, throttle: 0.7 }, env);
    const ap = new Autopilot(ac), p = tr.add({ aircraft: ac, ap, player: true, name: 'P' });
    ap.setRoute(circuitRoute('27', { type })); ap.replan();
    for (let t = 0; t < 8 && Math.abs(ac.bank) < 2.45; t += 1 / 60) { p.manual.aileron = 1; p.manual.elevator = -0.2; tr.update(1 / 60); }
    p.manual.aileron = p.manual.elevator = null;
    const rel = { agl: ac.agl, bank: ac.bank / DEG_, pitch: ac.pitch / DEG_ };
    let minAgl = ac.agl, hit = false;
    for (let t = 0; t < 20; t += 1 / 60) { tr.update(1 / 60); minAgl = Math.min(minAgl, ac.agl); for (const ev of ac.events.splice(0)) if (/impact|crash|touchdown/.test(ev.type)) hit = true; }
    check(`B5 ${type}: released inverted at ${rel.agl.toFixed(0)} m AGL (bank ${rel.bank.toFixed(0)}°, nose ${rel.pitch.toFixed(0)}°) recovers clear of the ground`, !hit && minAgl > 15 && rel.agl - minAgl < 105 && !ac.crashed, `min agl ${minAgl.toFixed(0)} m, lost ${(rel.agl - minAgl).toFixed(0)} m`);
  }
  // B7: the player's AP turns final at ~1.3 km (AI keep the published 1.8 km), with a stableFinal window for warp
  for (const player of [true, false]) {
    const tr = new Traffic(env), ac = new Aircraft({ dims: { gearHeight: 1.2 } }), e = runwayEnd('27');
    ac.place(lined('27'), env);
    const ap = new Autopilot(ac);
    tr.add({ aircraft: ac, ap, player, name: 'P' });
    ap.setRoute(circuitRoute('27'));
    let fin = null, stable = 0, td = null;
    for (let t = 0; t < 700 && !(td && ap.leg.kind !== 'approach'); t += 1 / 60) {
      tr.update(1 / 60);
      if (ap.phase === 'FINAL' && fin == null) fin = -toRunwayS(e, ac);
      if (ap.stableFinal) stable += 1 / 60;
      for (const ev of ac.events.splice(0)) if (ev.type === 'touchdown') td = ev;
    }
    if (player) check(`B7: player's AP final starts ${fin?.toFixed(0)} m out (≈1.3 km), ${stable.toFixed(0)} s flagged stableFinal, good landing`, fin < 1500 && fin > 1100 && stable > 15 && td?.surface === 'runway' && td.fpm < 400, `${td?.fpm} fpm`);
    else check(`B7: AI keep the published final (${fin?.toFixed(0)} m)`, fin > 1700, '');
  }
  // demandTakeoff default ends come from the active layout (open runways only); a 1-point taxi path does not throw
  const tr = new Traffic(env), ac = new Aircraft({ dims: { gearHeight: 1.2 } }), s = standInfo('S6');
  ac.place({ x: s.pos[0], z: s.pos[1], heading: 180 }, env);
  const ap = new Autopilot(ac);
  tr.add({ aircraft: ac, ap, player: true, name: 'P' });
  ap.setRoute({ name: 't', legs: [{ kind: 'taxi', dest: { xz: s.pos } }, { kind: 'park', seconds: 99 }], loop: null });
  ap.cur.path = ap.cur.path.slice(0, 1);
  let threw = null;
  try { for (let t = 0; t < 2; t += 1 / 60) tr.update(1 / 60); } catch (err) { threw = err.message; }
  check('taxi: a one-point taxi path is handled (no throw)', !threw, threw || ap.phase);
  const end = ap.demandTakeoff();
  check('demandTakeoff: default ends = the layout\'s open runways (27 from S6, never closed 04/22)', end === '27' || end === '09', String(end));
}
const toRunwayS = (e, ac) => (ac.pos.x - e.thr[0]) * e.u[0] + (ac.pos.z - e.thr[1]) * e.u[1];

// PLAYTEST_2 B6: Free Flight starts lined up on the active runway (main.placePlayer) amid live AI traffic through the
// real ATC: the player must roll promptly and score nothing for the spawn. Old clearing (ground within 160 m only):
// `node tools/flight-sim.mjs spawn --old` — 8/12 starts parked 30–184 s.
async function scSpawn() {
  const { createATC } = await import('../js/atc/index.js');
  const { linkTraffic } = await import('../js/atc/bridge.js');
  const R = await import('../js/flight/routes.js');
  const OLD = args.includes('--old'), N = 12, real = Math.random;
  const seeded = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const out = [];
  for (let run = 0; run < N; run++) {
    const rnd = seeded(1000 + run * 77); Math.random = rnd;
    const tr = new Traffic(env), atc = createATC({ wind: { from: 270, kt: 8 }, detectCollisions: false }), link = linkTraffic(atc, tr, { mischief: 'low', rnd });
    let T = 0, respawn = 0;
    const evs = []; atc.on('event', (e) => evs.push({ ...e, at: T }));
    const ai = [], types = ['c172', 'c172', 'tiger', 'bathtub'];
    const spawn = (kind, o = {}) => {
      const type = types[Math.floor(rnd() * types.length)], ac = new Aircraft({ type });
      const plan = R.aiSpawn(kind, atc.activeRunway().end, { ...o, rnd, type, claimStand: () => tr.claimStand(ac) });
      if (!plan) return;
      ac.place(plan.place, env); if (plan.stand) tr.standOwner.set(plan.stand, ac);
      const ap = new Autopilot(ac), e = tr.add({ aircraft: ac, ap, name: kind + ai.length }); ap.setRoute(plan.route); ai.push(e);
    };
    const despawn = (e) => { atc.remove(link.idOf(e)); tr.remove(e); ai.splice(ai.indexOf(e), 1); };
    const step = (secs, f) => { for (let k = 0; k < secs * 60; k++) { T += 1 / 60; tr.update(1 / 60); link.update(1 / 60);
      for (const e of [...ai]) if (e.ap.done && e.ap.phase === 'GONE') despawn(e);
      if (ai.length < 4 && (respawn -= 1 / 60) <= 0) { respawn = 12 + rnd() * 15; spawn(rnd() < 0.55 ? 'arrive' : 'depart', { wait: 2 }); }
      if (f && f() === false) return; } };
    ['downwind', 'final', 'parked', 'parked'].forEach((k, i) => spawn(k, { wait: i === 2 ? 3 : 35 }));
    step(5 + rnd() * 120);
    const e = runwayEnd(atc.activeRunway().end), [x, z] = fromRunway(e, 12, 0);
    const gone = OLD ? ai.filter((a) => a.ac.onGround && Math.hypot(a.ac.pos.x - x, a.ac.pos.z - z) < 160) : tr.spawnConflicts(x, z, 160);
    for (const a of [...gone]) if (ai.includes(a)) despawn(a);
    for (const a of [...ai]) if (a.ap.leg?.kind === 'takeoff' && a.ap.sub !== 'climb' && a.ap.sub !== 'taxi') despawn(a);
    const ac = new Aircraft({ id: 'player' }), ap = new Autopilot(ac), P = tr.add({ aircraft: ac, ap, player: true, name: 'K-PLAY' });
    ac.place({ x, z, heading: e.hdg }, env); ap.setRoute(circuitRoute(e.id)); link.placed(P, 8);
    if (!ai.some((a) => a.ap.leg?.kind === 'approach' && !a.ac.onGround)) spawn('final', { dist: 3600 });
    if (!ai.some((a) => a.ac.onGround && /HOLD|LINE/.test(a.ap.phase))) spawn('holding');
    const t0 = T; let roll = null;
    step(200, () => { if (roll == null && ac.speed > 5) roll = T - t0; return roll == null; });
    out.push({ roll, crimes: evs.filter((v) => v.actor === 'player' && v.at >= t0).map((v) => v.type) });
  }
  Math.random = real;
  const slow = out.filter((o) => o.roll == null || o.roll > 20), crimes = out.filter((o) => o.crimes.length);
  check(`spawn (B6): lined-up starts roll within 20 s amid live traffic (${N - slow.length}/${N})`, slow.length === 0, out.map((o) => o.roll == null ? '>200' : o.roll.toFixed(0)).join(' ') + ' s');
  check(`spawn (B6): no infractions scored for the start (${N - crimes.length}/${N} clean)`, !crimes.length, crimes.map((o) => o.crimes.join('+')).join(', '));
}

// Mixed-type traffic (C172 + Tiger + bathtub) through real ATC for 30 min: lives in atc-sim (needs the ATC); opt-in here.
async function scMixed() {
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, [new URL('./atc-sim.mjs', import.meta.url).pathname, '--only=flight', '--run=mixed', '--quiet'], { encoding: 'utf8' });
  for (const l of (r.stdout || '').split('\n').filter((x) => /^(PASS|FAIL)/.test(x))) check(l.replace(/^(PASS|FAIL)\s+/, ''), l.startsWith('PASS'));
}
// FLIGHTFIX3 (test-loop findings, 2026-10-23): the player's route after DEMAND TAKEOFF, LAND's runway choice on the
// home circuit, taildragger grass rollouts, ap.fieldTakeoff(), ap.taxiIn(). Fake world (rolling ground, trees, town).
async function scFix3() {
  const { planLandAhead, armLandNow } = await import('../js/assist/landahead.js');
  const { fakeWorld, layout } = await import('../js/assist/test/fakeworld.mjs');
  const { finishZone, DEFAULT_SPOT } = await import('../js/game/finish.js');
  const W = fakeWorld(), wenv = { groundHeightAt: W.groundHeightAt, surfaceAt: W.surfaceAt, colliders: W.colliders };
  const types = ['c172', 'tiger', 'bathtub'];
  const setup = (type, place, route) => {
    const tr = new Traffic(wenv), ac = new Aircraft({ type }), ap = new Autopilot(ac);
    ac.place(place, wenv); ac.impactHandler = () => ({ result: 'bounce', restitution: 0.35 });   // Free Flight is Rubber
    const ent = tr.add({ aircraft: ac, ap, player: true, name: 'P' });
    ap.setRoute(route); if (place.alt) ap.replan();
    const ev = { imp: [], td: [] };
    const step = (secs, stop) => { for (let t = 0; t < secs; t += 1 / 60) { tr.update(1 / 60); for (const e of ac.events.splice(0)) { if (e.type === 'impact' || e.type === 'crash') ev.imp.push(e.reason); if (e.type === 'touchdown') ev.td.push(e); } ap.events.length = 0; if (stop && stop(t)) return t; } return null; };
    const plan = (now) => { if (now) armLandNow(); return planLandAhead({ pos: ac.pos, vel: ac.vel, heading: ac.heading, altitude: ac.alt, onGround: ac.onGround, world: W, layout }); };
    const land = () => { let p = plan(); if (p.fail) return p; ap.landAt(p); if (p.pattern !== 'straight') { const q = plan(true); if (!q.fail) { ap.landAt(q); p = q; } } return p; };
    const stopped = () => ap.done && ac.onGround && ac.speed < 0.5;
    return { tr, ac, ap, ent, ev, step, plan, land, stopped };
  };
  const lined = (type, end = '27') => { const e = runwayEnd(end), [x, z] = fromRunway(e, 12, 0); return setup(type, { x, z, heading: e.hdg }, circuitRoute(end, { type })); };
  const noDespawn = (ap) => !!ap.route && !ap.route.legs.some((l) => l.kind === 'despawn') && ap.route.name.startsWith('circuits');
  // #1 DEMAND TAKEOFF after a LAND on the runway, and after a LAND cancelled in the climb-out: circuits, never GONE
  for (const type of types) {
    const e = runwayEnd('27'), [fx, fz] = fromRunway(e, -1500, 0);
    const R1 = setup(type, { x: fx, z: fz, alt: 100, heading: e.hdg, speed: R1speed(type), throttle: 0.5 }, circuitRoute('27', { type }));
    const p = R1.land();
    R1.step(240, R1.stopped);
    const ok1 = !p.fail && p.kind === 'runway' && R1.stopped();
    const end = R1.ap.demandTakeoff({ ends: ['27', '09'], prefer: '27' });
    const name0 = R1.ap.route?.name;
    let gone = false, up = 0; R1.step(300, () => { if (R1.ap.phase === 'GONE') gone = true; if (!R1.ac.onGround) up = Math.max(up, R1.ac.agl); return gone; });
    check(`FIX3 #1 ${type}: DEMAND TAKEOFF after LAND on RWY 27 flies circuits (not an AI departure), never GONE in 5 min`, ok1 && !!end && noDespawn(R1.ap) && !gone && up > 100, `land ${p.label} stopped ${ok1}; route ${name0} → ${R1.ap.route?.name}, phase ${R1.ap.phase}, max ${up.toFixed(0)} m AGL`);
    // LAND in the climb-out, then cancelled (stick): back to circuits, not a departure
    const R2 = setup(type, { x: R1.ac.pos.x, z: R1.ac.pos.z, heading: R1.ac.heading }, { name: 'land', legs: [{ kind: 'park', seconds: 1 }], loop: null });
    R2.ap.done = true; R2.ap.landing = { route: R2.ap.route }; R2.ap._landPrev = { route: R2.ap.route, i: 0 };
    R2.ap.demandTakeoff({ ends: ['27', '09'], prefer: '27' });
    R2.step(120, () => !R2.ac.onGround && R2.ac.agl > 80);
    const lp = R2.land(); R2.step(3);
    R2.ap.cancelLand();
    let gone2 = false; R2.step(240, () => { if (R2.ap.phase === 'GONE') gone2 = true; return gone2; });
    check(`FIX3 #1 ${type}: LAND in the climb-out then cancelled → circuits again, never GONE`, !lp.fail && noDespawn(R2.ap) && !gone2, `${lp.label || lp.fail}; route ${R2.ap.route?.name} phase ${R2.ap.phase}`);
  }
  // #2 LAND pressed on the home circuit picks the runway, and the AP lands there
  for (const type of types) {
    const L = circuitLegs('27', { type }), mid = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    const res = [];
    for (const [n, pt, hdg] of [['downwind', mid(L[2].to, L[3].to, 0.3), 90], ['late downwind', mid(L[2].to, L[3].to, 0.9), 90], ['base', mid(L[3].to, L[4].to, 0.5), 0]]) {
      const R = setup(type, { x: pt[0], z: pt[2], alt: pt[1], heading: hdg, speed: R1speed(type) * 1.15, throttle: 0.6 }, circuitRoute('27', { type }));
      R.step(1);
      const p = R.plan(); if (!p.fail) R.ap.landAt(p);
      R.step(300, R.stopped);
      const td = R.ev.td[0];
      res.push({ n, ok: !p.fail && p.label === 'RWY 27' && R.stopped() && td?.surface === 'runway' && !R.ev.imp.length, d: `${n} ${p.label || p.fail}/${p.pattern} td ${td?.surface} ${R.ev.imp.join()}` });
    }
    check(`FIX3 #2 ${type}: LAND on downwind / late downwind / base → RWY 27, landed on it and stopped`, res.every((r) => r.ok), res.map((r) => r.d).join('; '));
  }
  // #3 + #4: LAND from the climb-out → FIELD; the rollout stays down and straight (no wingtip, no 0.4 s hop = ATC
  // "unauthorised takeoff"); then DEMAND TAKEOFF from the field (ap.fieldTakeoff) is airborne ≤ 32 s and flies circuits
  for (const type of types) {
    const out = [], ft = [];
    for (const tap of [60, 80, 110]) {
      const R = lined(type);
      R.step(120, () => !R.ac.onGround && R.ac.agl > tap);
      const p = R.land();
      let air = 0, airMax = 0, dev = 0, t0 = null;
      R.step(240, () => {
        if (R.ev.td.length) { t0 ??= 0; if (!R.ac.onGround) { air += 1 / 60; airMax = Math.max(airMax, air); } else { air = 0; dev = Math.max(dev, Math.abs(wrapD(R.ac.heading - p.heading))); } }
        return R.stopped();
      });
      out.push({ ok: !p.fail && R.stopped() && !R.ev.imp.length && airMax < 0.4 && dev < 10, d: `@${tap} ${p.label || p.fail}/${p.pattern} td ${(R.ev.td[0]?.fpm)} fpm, airborne after td ${airMax.toFixed(2)} s, dev ${dev.toFixed(0)}° ${R.ev.imp.join()}` });
      if (!R.stopped() || R.ac.surface !== 'grass') continue;
      // an AI at the hold asks traffic.runwayFree every frame: it reads the player's takeoff leg (the virtual FIELD end
      // once threw "no runway end [object Object]" there and froze the sim — test-loop tiger-hard)
      const h = holdPoint('27'), ai = new Aircraft({ type: 'c172' }), aap = new Autopilot(ai);
      ai.place({ x: h[0], z: h[1], heading: 180 }, wenv); R.tr.add({ aircraft: ai, ap: aap, name: 'AI' });
      aap.setRoute({ name: 'circuits 27', legs: [{ kind: 'hold', end: '27', seconds: 999, untilClear: true }, ...circuitRoute('27').legs], loop: 1 });
      const run = R.ap.fieldTakeoff({ world: W, end: '27' });
      let tAir = null, threw = null; const imp0 = R.ev.imp.length;
      const step0 = R.step; R.step = (secs, stop) => { try { return step0(secs, (t) => { R.tr.runwayFree('09/27', ai); R.tr.runwayClear('27', ai); return stop ? stop(t) : false; }); } catch (err) { threw = err.message; return null; } };
      let lastSub = '';
      R.step(60, (t) => { if (TRACE && (R.ap.sub + R.ac.onGround !== lastSub || (R.ap.sub === 'lineup' && Math.round(t * 60) % 120 === 0))) { lastSub = R.ap.sub + R.ac.onGround; console.log(type, tap, t.toFixed(1), R.ap.phase, R.ap.sub, R.ac.onGround, (R.ac.speed / KT).toFixed(0), R.ac.heading.toFixed(0), R.ac.agl.toFixed(1), 'thr', R.ac.ctl.throttle.toFixed(2), 'rud', R.ac.ctl.rudder.toFixed(2), 'br', R.ac.ctl.brake.toFixed(2), 'el', R.ac.ctl.elevator.toFixed(2), 'tgt', R.ap.t.gSpeed?.toFixed?.(1)); } if (!R.ac.onGround && R.ac.agl > 10) { tAir = t; return true; } });
      R.step(60); R.step = step0;
      const leak = (R.ap.route?.legs || []).some((l) => l.end && typeof l.end === 'object' && l.kind === 'takeoff');
      ft.push({ ok: !threw && !leak && !!run && tAir != null && tAir <= (run.turn > 45 ? 50 : 34) && R.ev.imp.length === imp0 && noDespawn(R.ap) && !R.ac.onGround && R.ac.agl > 40, d: `${threw ? 'THREW ' + threw + ' ' : ''}${leak ? 'virtual end left in route ' : ''}@${tap} run ${run ? `${run.heading}° (turn ${Math.round(run.turn)}°) ${Math.round(run.length)} m` : `none at ${R.ac.pos.x.toFixed(0)},${R.ac.pos.z.toFixed(0)} hdg ${R.ac.heading.toFixed(0)}`}, >10 m AGL after ${tAir?.toFixed(1)} s, ${R.ap.route?.name} ${R.ap.phase}` });
    }
    check(`FIX3 #3 ${type}: LAND → field rollout: no wingtip/impact, never airborne ≥ 0.4 s after touchdown, heading within 10°`, out.every((o) => o.ok), out.map((o) => o.d).join('; '));
    check(`FIX3 #4 ${type}: fieldTakeoff from where LAND stopped: > 10 m AGL within 34 s (50 s when it must turn > 45°), then circuits`, ft.length > 0 && ft.every((o) => o.ok), ft.map((o) => o.d).join('; ') || 'no field stop');
  }
  // #5 Hard: after LAND on the runway, ap.taxiIn() taxis to the terminal spot (finish zone 'hard')
  for (const type of types) {
    const e = runwayEnd('27'), [fx, fz] = fromRunway(e, -1500, 0);
    const R = setup(type, { x: fx, z: fz, alt: 100, heading: e.hdg, speed: R1speed(type), throttle: 0.5 }, circuitRoute('27', { type }));
    R.land(); R.step(240, R.stopped);
    const sid = R.ap.taxiIn({ stand: DEFAULT_SPOT.id });
    const ing = R.ap.taxiingIn;
    const t = R.step(400, () => R.ap.leg?.kind === 'park' && R.ac.speed < 0.3);
    const z = finishZone('hard', { x: R.ac.pos.x, z: R.ac.pos.z, surface: R.ac.surface }, DEFAULT_SPOT);
    check(`FIX3 #5 ${type}: taxiIn() after a runway LAND reaches the Hard finish spot (${DEFAULT_SPOT.id}) and parks`, sid === DEFAULT_SPOT.id && ing && t != null && z.ok && !R.ev.imp.length, `taxi ${t?.toFixed(0)} s, at ${R.ac.pos.x.toFixed(0)},${R.ac.pos.z.toFixed(0)} zone ${z.ok ? 'ok' : z.reason}`);
    // then DEMAND TAKEOFF from the terminal (GAMEFIX: bathtub tipped onto a wingtip in the line-up; 68–104 s): Realistic
    // (no impact handler: any wingtip is a crash), airborne within 70 s, circuits
    R.ac.impactHandler = null;
    const end = R.ap.demandTakeoff({ ends: ['27', '09'], prefer: '27' });
    const ta = R.step(150, () => !R.ac.onGround && R.ac.agl > 10);
    check(`FIX3 #5b ${type}: DEMAND TAKEOFF from the terminal spot: no wingtip/crash, airborne ≤ 70 s, circuits`, !!end && ta != null && ta <= 70 && !R.ac.crashed && R.ev.imp.length === 0 && noDespawn(R.ap), `RWY ${end}${R.ap.demandDirect ? ' (direct)' : ''}, > 10 m after ${ta?.toFixed(0)} s ${R.ac.crashed ? 'CRASH ' + R.ac.crashReason : ''} ${R.ev.imp.join()}`);
  }
  // #2b: a plane parked in the touchdown zone used to keep a LAND going round for 5 min (tiger-medium-landscape):
  // after the 2nd go-around LAND lands long, past it, when enough runway is left
  for (const type of types) {
    const e = runwayEnd('27'), [fx, fz] = fromRunway(e, -1800, 0);
    const R = setup(type, { x: fx, z: fz, alt: 130, heading: e.hdg, speed: R1speed(type), throttle: 0.5 }, circuitRoute('27', { type }));
    const [px, pz] = fromRunway(e, 180, 0), blk = new Aircraft({ type: 'c172' });
    blk.place({ x: px, z: pz, heading: e.hdg }, wenv);
    const bap = new Autopilot(blk); R.tr.add({ aircraft: blk, ap: bap, name: 'PARKED' }); bap.setRoute({ name: 'parked', legs: [{ kind: 'park', seconds: 1e9 }], loop: null });
    const p = R.land();
    const t = R.step(300, R.stopped);
    const hitBlk = R.ev.imp.some((x) => /plane|aircraft|collision/i.test(x)) || blk.crashed;
    check(`FIX3 #2b ${type}: LAND with a plane parked in the touchdown zone lands long on RWY 27 within 300 s`, !p.fail && t != null && R.ev.td[0]?.surface === 'runway' && !hitBlk && !R.ac.crashed, `${p.label || p.fail}: stopped after ${t?.toFixed(0)} s at s=${Math.round(toRunwayS(e, R.ac))} m, ${R.ev.imp.join() || 'no impacts'}`);
  }
  // #6 (STORY2): a latched lever at full power holds the leg's altitude and lets the speed run (no zoom climb)
  const lat = [];
  for (const type of types) {
    const tr = new Traffic(env), ac = new Aircraft({ type }), ap = new Autopilot(ac);
    ac.place({ x: 3000, z: 2000, alt: 300, heading: 90, speed: ac.P.vcruise * 0.85, throttle: 0.6 }, env);
    const p = tr.add({ aircraft: ac, ap, player: true, name: 'P' });
    ap.setRoute({ name: 'c', legs: [{ kind: 'fly', to: [30000, 300, 2000], speed: 85 }], loop: null });
    for (let t = 0; t < 0.5; t += 1 / 60) { p.manual.throttle = 1; tr.update(1 / 60); }
    p.manual.throttle = null;
    let dev = 0;
    for (let t = 0; t < 60; t += 1 / 60) { tr.update(1 / 60); if (t > 10) dev = Math.max(dev, Math.abs(ac.alt - 300)); }
    lat.push({ ok: dev < 20 && p.axis.throttle.mode === 'latched', d: `${type} ±${dev.toFixed(0)} m at ${(ac.speed / KT).toFixed(0)} kt` });
  }
  check('FIX3 #6: throttle latched at 100 %: the AP holds the leg altitude (±20 m), the speed runs', lat.every((l) => l.ok), lat.map((l) => l.d).join('; '));
  // #7 (STORY2): a low, slow approach handed back (story re-sets its route / the stick is let go) with the lever latched
  // must not sit in RECOVERY (it did for 500 s at ~32 m); and LAND from the story's 170 m PRESS LAND point lands
  // the story's line-up route (data/story/common.js lineUpLegs, south side), inlined so this does not depend on STORY
  const lineUpLegs = (e) => {
    const at = (sAl, l) => fromRunway(e, sAl, l), [a, b, c, d, f] = [at(-3400, -900), at(-2600, 0), at(-1500, 0), at(-1100, -1000), at(-3300, -1000)];
    return { legs: [{ kind: 'fly', to: [a[0], 230, a[1]], speed: 95, flaps: 0, label: 'POSITIONING' }, { kind: 'fly', to: [b[0], 210, b[1]], speed: 88, flaps: 0, label: 'LINE UP' },
      { kind: 'fly', to: [c[0], 170, c[1]], speed: 80, flaps: 0, label: 'PRESS LAND' }, { kind: 'fly', to: [d[0], 220, d[1]], speed: 88, flaps: 0, label: 'GO ROUND' },
      { kind: 'fly', to: [f[0], 230, f[1]], speed: 92, flaps: 0, label: 'GO ROUND' }], lineUp: 1, landWindow: 2 };
  };
  const e27 = runwayEnd('27'), fin = fromRunway(e27, -900, 0), rr = [];
  for (const type of types) for (const lever of [0.2, 0.35, 0.5]) for (const how of ['setRoute', 'stick']) {
    const tr = new Traffic(env), ac = new Aircraft({ type }), ap = new Autopilot(ac);
    ac.place({ x: fin[0], z: fin[1], alt: 32, heading: 270, speed: ac.P.vapp * 0.97, throttle: 0.3, flaps: 1 }, env);
    const p = tr.add({ aircraft: ac, ap, player: true, name: 'P' });
    ap.setRoute({ name: 'story', legs: lineUpLegs(e27).legs, loop: 0 }, { start: 0 }); ap.out.flaps = 1;
    for (let t = 0; t < 0.3; t += 1 / 60) { p.manual.throttle = lever; tr.update(1 / 60); }
    p.manual.throttle = null;
    if (how === 'stick') { for (let t = 0; t < 1; t += 1 / 60) { p.manual.elevator = 0.2; tr.update(1 / 60); } p.manual.elevator = null; } else ap.replan();
    let rec = 0, recMax = 0, minA = 99, hit = false;
    for (let t = 0; t < 90; t += 1 / 60) { tr.update(1 / 60); minA = Math.min(minA, ac.agl); for (const ev of ac.events.splice(0)) if (/touchdown|impact|crash/.test(ev.type)) hit = true; if (ap.phase === 'RECOVERY') { rec += 1 / 60; recMax = Math.max(recMax, rec); } else rec = 0; }
    rr.push({ ok: recMax < 10 && !hit && ac.agl > 100, d: `${type} lever ${lever} ${how}: RECOVERY ${recMax.toFixed(0)} s, min ${minA.toFixed(0)} m, end ${ac.agl.toFixed(0)} m ${ap.phase}${hit ? ' HIT' : ''}` });
  }
  check('FIX3 #7: low slow hand-back at 32 m with a latched lever (0.2/0.35/0.5, story setRoute or stick): RECOVERY < 10 s, no ground contact, climbing away', rr.every((r) => r.ok), rr.filter((r) => !r.ok).map((r) => r.d).join('; ') || `${rr.length} cases`);
  for (const type of types) {
    const L = lineUpLegs(e27), [sx, sz] = fromRunway(e27, -3000, 0);
    const R = setup(type, { x: sx, z: sz, alt: 215, heading: 270, speed: R1speed(type) * 1.1, throttle: 0.6 }, { name: 'story', legs: L.legs, loop: 0 });
    R.ap.i = L.lineUp; R.ap._begin(true);
    R.step(120, () => R.ap.i === L.landWindow && Math.abs(R.ac.pos.z) < 30);
    const agl0 = R.ac.agl, p = R.plan(); if (!p.fail) R.ap.landAt(p);
    const t = R.step(200, R.stopped);
    check(`FIX3 #7 ${type}: LAND from the story's PRESS LAND line-up (${agl0.toFixed(0)} m) lands on RWY 27 and stops`, !p.fail && p.label === 'RWY 27' && t != null && R.ev.td[0]?.surface === 'runway' && !R.ev.imp.length, `${p.label || p.fail}/${p.pattern}, stopped after ${t?.toFixed(0)} s on ${R.ev.td[0]?.surface}`);
  }
}
function R1speed(type) { return Math.min(80 * KT, (TYPES[type]?.vcruise ?? 95 * KT) * 0.8); }

const S = { fix3: scFix3, aaron: scAaron, loopext: scLoopExtend, throttle: scThrottleTakeback, landmany: scLandMany, feel: scPlayerFeel, spawn: scSpawn, impact: scImpact, fuel: scFuel, landat: scLandAt, ground: scGround, handback: scHandback, circuit: scCircuit, circuit27: () => scCircuit('27'), override: scOverride, cutin: scCutIn, stall: scStall, traffic: scTraffic, types: scTypes, typeoverride: scTypeOverride, typeground: scTypeGround, mixed: scMixed };
for (const [k, f] of Object.entries(S)) if ((scen === 'all' && k !== 'mixed') || scen === k) { console.log(`\n== ${k}`); await f(); }
const fails = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);
