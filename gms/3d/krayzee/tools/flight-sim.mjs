// Headless flight-core harness (no browser): node tools/flight-sim.mjs [scenario] [--trace]
// Scenarios: jets (jumbo/herc/f35, --only=jumbo) | roster (cub/pitts/throne, --only=, --falsify=roll|loop|vto|short|brake) | landmany | feel | circuit | override | cutin | stall | taxi | traffic | types | typeoverride | typeground | all
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

function scTypeOverride(types = ['tiger', 'bathtub']) {
  for (const type of types) {
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

function scTypeGround(types = ['tiger', 'bathtub'], { generic = true } = {}) {
  const flat = { groundHeightAt: () => 0, surfaceAt: () => 'runway', colliders: [] };
  for (const type of types) {
    const ac = new Aircraft({ type }), P = ac.P, R = AIRCRAFT[type].engine;
    ac.place({ x: 0, z: 0, heading: 90 }, flat);
    const y0 = ac.pos.y, p0 = ac.pitch;
    for (let i = 0; i < 600; i++) ac.step(1 / 120, flat);
    const evs = ac.events.splice(0).map((e) => e.type);
    if (P.groundPitch) check(`${type} at rest: placed and settled in the 3-point attitude, tail wheel down, no tail strike`, Math.abs(p0 - P.groundPitch) < 0.01 && Math.abs(ac.pitch - P.groundPitch) < 0.015 && Math.abs(ac.pos.y - y0) < 0.05 && ac.tailDown && !ac.noseDown && !evs.length, `placed ${(p0 / DEG_).toFixed(1)}° → ${(ac.pitch / DEG_).toFixed(1)}°, y ${y0.toFixed(2)} → ${ac.pos.y.toFixed(2)}, agl ${ac.agl.toFixed(2)}, events ${evs.join() || '-'}`);
    else check(`${type} at rest: four feet loaded, level, no events`, ac.wheels.length === 4 && ac.wheels.every((w) => w.load > 300) && Math.abs(ac.pitch) < 0.02 && !evs.length, `loads ${ac.wheels.map((w) => w.load.toFixed(0)).join('/')}`);
    const rpm = ac.instruments().rpm;
    check(`${type}: idle rpm from the roster (${R.idleRpm}), full-power static < max ${R.maxRpm}`, Math.abs(rpm - R.idleRpm) < 60 && (ac.eng = 1, ac.engineKind === 'piston' ? ac.instruments().rpm < R.maxRpm : ac.instruments().rpm <= R.maxRpm), `${rpm.toFixed(0)} / ${ac.instruments().rpm.toFixed(0)}`);
    check(`${type}: fuel tanks hold ${P.fuelCap} L each`, ac.fuel.cap === P.fuelCap && ac.fuel.L > P.fuelCap - 0.5, `${ac.fuel.cap}`);
  }
  if (!generic) return;
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
// retry: a 'nothing ahead' tap is tapped again for up to 1 s (the planner flickers mid-turn over the fake world's fields)
async function scLandMany(types = ['c172', 'tiger', 'bathtub'], { goAround = true, retry = false } = {}) {
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
  for (const type of types) {
    const res = [];
    for (const [name, c] of CASES) {
      const tr = new Traffic(wenv);
      const ac = new Aircraft({ type });
      ac.place({ x: c.x, z: c.z, alt: c.alt, heading: c.heading, speed: Math.min(c.kt * KT, ac.P.vcruise * 0.95), throttle: 0.6 }, wenv);
      const ap = new Autopilot(ac);
      tr.add({ aircraft: ac, ap, player: true, name: 'P' });
      ap.setRoute(circuitRoute('27', { type })); ap.replan();
      for (let t = 0; t < 2; t += 1 / 60) tr.update(1 / 60);
      const tap = () => planLandAhead({ pos: [ac.pos.x, ac.pos.y, ac.pos.z], vel: [ac.vel.x, ac.vel.y, ac.vel.z], heading: ac.heading, altitude: ac.alt, world: w, layout });
      let plan = tap();
      for (let k = 0; retry && plan.fail === 'nothingAhead' && k < 4; k++) { for (let t = 0; t < 0.25; t += 1 / 60) tr.update(1 / 60); plan = tap(); }
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
  if (!goAround) return;
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
async function scAaron(types = ['c172', 'tiger', 'bathtub']) {
  const { planLandAhead, armLandNow } = await import('../js/assist/landahead.js');
  const { fakeWorld, layout } = await import('../js/assist/test/fakeworld.mjs');
  const W = fakeWorld();
  for (const type of types) for (const c of AARON) {
    const r = flyLandTap(W, layout, planLandAhead, type, c);
    const d = r.fail ? r.fail : `${r.plan.label}/${r.plan.pattern} stop ${r.t.toFixed(0)} s, climb ${r.climb.toFixed(1)} m, flare→td ${r.f2td?.toFixed(1)} s, bounce rise ${r.rise.toFixed(1)} m, airborne ROLLOUT ${r.airRoll.toFixed(2)} s, td ${r.td?.fpm} fpm, GA ${r.ga}`;
    check(`LANDFIX2 ${type} ${c.name}: straight ahead and down, stopped ≤ 60 s`, !r.fail && r.stopped && r.plan.pattern === 'straight' && r.t <= 60 && r.ga === 0, d);
    check(`LANDFIX2 ${type} ${c.name}: no climb > 10 m, no airborne ROLLOUT, no balloon, flare→td ≤ 4 s`, !r.fail && r.climb <= 10 && r.airRoll < 0.03 && r.rise < 3 && (r.f2td == null || r.f2td <= 4), d);
  }
  // LAND NOW: LAND chose a circuit/join; the second button flies straight ahead instead
  const e27 = runwayEnd('27'), [nx, nz] = fromRunway(e27, -900, -200);
  for (const type of types) {
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
function scPlayerFeel(types = ['c172', 'tiger', 'bathtub'], { generic = true } = {}) {
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
  if (generic) {
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
  if (!generic) return;
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
// noRunOk: types whose long field rollouts may end where no clear run exists (main.js falls back to its field hop)
async function scFix3(types = ['c172', 'tiger', 'bathtub'], { noRunOk = [] } = {}) {
  const { planLandAhead, armLandNow } = await import('../js/assist/landahead.js');
  const { fakeWorld, layout } = await import('../js/assist/test/fakeworld.mjs');
  const { finishZone, DEFAULT_SPOT } = await import('../js/game/finish.js');
  const W = fakeWorld(), wenv = { groundHeightAt: W.groundHeightAt, surfaceAt: W.surfaceAt, colliders: W.colliders };
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
      if (!run && !threw && noRunOk.includes(type)) { ft.push({ ok: true, d: `@${tap} no clear run here (hop fallback)` }); continue; }
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
// JETCORE (D33): jumbo / herc / f35 through the whole loop. node tools/flight-sim.mjs jets [--only=jumbo]
const JETS = ['jumbo', 'herc', 'f35'];
export const JET_NUMBERS = {};
async function scJets() {
  const { planLandAhead, armLandNow } = await import('../js/assist/landahead.js');
  const { fakeWorld, layout } = await import('../js/assist/test/fakeworld.mjs');
  const { finishZone, DEFAULT_SPOT } = await import('../js/game/finish.js');
  const { BOUNDARY, homeCenter, heavySpot, isHeavy } = await import('../js/flight/routes.js');
  const { WAKE } = await import('../js/flight/traffic.js');
  const W = fakeWorld(), wenv = { groundHeightAt: W.groundHeightAt, surfaceAt: W.surfaceAt, colliders: W.colliders };
  const only = (args.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
  const types = only.length ? JETS.filter((t) => only.includes(t)) : JETS;
  const e27 = runwayEnd('27');
  const sOf = (ac) => toRunwayS(e27, ac);
  const setup = (type, place, route, { world = true, rubber = true } = {}) => {
    const E = world ? wenv : env, tr = new Traffic(E), ac = new Aircraft({ type }), ap = new Autopilot(ac);
    ac.place(place, E); if (rubber) ac.impactHandler = () => ({ result: 'bounce', restitution: 0.35 });
    const ent = tr.add({ aircraft: ac, ap, player: true, name: 'P' });
    ap.setRoute(route); if (place.alt) ap.replan();
    const ev = { imp: [], td: [], ap: [], ac: [] };
    const step = (secs, stop) => { for (let t = 0; t < secs; t += 1 / 60) { tr.update(1 / 60); for (const e of ac.events.splice(0)) { ev.ac.push(e); if (e.type === 'impact' || e.type === 'crash') ev.imp.push(e.reason); if (e.type === 'touchdown') ev.td.push({ ...e, s: sOf(ac) }); } for (const e of ap.events.splice(0)) ev.ap.push(e); if (stop && stop(t)) return t; if (ac.crashed) return null; } return null; };
    const plan = (now) => { if (now) armLandNow(); return planLandAhead({ pos: ac.pos, vel: ac.vel, heading: ac.heading, altitude: ac.alt, onGround: ac.onGround, world: W, layout }); };
    const stopped = () => ap.done && ac.onGround && ac.speed < 0.5;
    return { tr, ac, ap, ent, ev, step, plan, stopped, E };
  };
  for (const type of types) {
    const N = (JET_NUMBERS[type] = {}), book = AIRCRAFT[type].performance.takeoffRollM, P = TYPES[type];
    // A. circuit 27 on the real-ish world: takeoff inside the runway, circuit, landing, stop on the runway, back to the hold
    {
      const [x, z] = fromRunway(e27, 10, 0);
      const R = setup(type, { x, z, heading: e27.hdg }, circuitRoute('27', { type }), { rubber: false });
      let lift = null, maxXtk = 0, vApp = null, stopS = null, tdT = null, rollT0 = null, gearUp = false, gearTd = null;
      R.step(1200, (t) => {
        const ac = R.ac, s = sOf(ac), l = Math.abs((ac.pos.z - e27.thr[1]) * e27.u[0] - (ac.pos.x - e27.thr[0]) * e27.u[1]);
        if (rollT0 == null && ac.speed > 1) rollT0 = { s, t };
        if (!lift && !ac.onGround && ac.agl > 0.3) lift = { s, kt: ac.speed / KT, d: s - rollT0.s };
        if (R.ap.phase === 'FINAL' && s > -1200 && s < 0) maxXtk = Math.max(maxXtk, l);
        if (R.ap.phase === 'FINAL' && vApp == null && s > -300) vApp = ac.speed / KT;
        if (R.ev.td.length && tdT == null) { tdT = t; gearTd = ac.gear; }
        if (!ac.onGround && ac.gear < 0.01) gearUp = true;
        if (R.ev.ap.some((e) => e.type === 'landed') && stopS == null) stopS = s;
        return lift && R.ap.leg.kind === 'hold';
      });
      const td = R.ev.td[0], bad = R.ev.ac.filter((e) => ['crash', 'impact', 'tailstrike', 'hardlanding'].includes(e.type));
      Object.assign(N, { takeoffRollM: Math.round(lift?.d), liftKt: Math.round(lift?.kt), approachKt: Math.round(vApp), touchdownFpm: td?.fpm, touchdownS: Math.round(td?.s), landedAtS: Math.round(stopS) });
      check(`${type} circuit 27: airborne inside the runway (${Math.round(lift?.d)} m of ${1400 - 10}; book ${book} m ±25 %)`, lift && lift.s < e27.len - 60 && Math.abs(lift.d - book) <= book * 0.25, lift && `${lift.d.toFixed(0)} m, ${lift.kt.toFixed(0)} kt`);
      check(`${type} circuit 27: no crash / impact / tail strike / hard landing`, !bad.length && !R.ac.crashed, bad.map((b) => b.type + ' ' + (b.reason || '')).join() || 'clean');
      check(`${type} circuit 27: final within 15 m of the centreline inside 1.2 km`, maxXtk < 15, `${maxXtk.toFixed(1)} m`);
      check(`${type} circuit 27: one touchdown on the runway < 500 fpm, rolled out to 9 m/s before the far end`, td && td.surface === 'runway' && td.fpm < 500 && R.ev.td.length === 1 && stopS != null && stopS < e27.len - 20, td && `${td.fpm} fpm at s=${td.s.toFixed(0)}, slowed at s=${stopS?.toFixed(0)} (approach ${vApp?.toFixed(0)} kt)`);
      check(`${type} circuit 27: gear retracted in the circuit, down and locked at touchdown`, gearUp && gearTd > 0.99, `up ${gearUp}, at touchdown ${gearTd?.toFixed(2)}`);
      check(`${type} circuit 27: taxied back to the hold`, R.ap.leg.kind === 'hold', R.ap.phase);
    }
    // B. LAND from three places: always the runway (never a field), touchdown + stop
    {
      const c = circuitLegs('27', { type }), dw = c[2].to;
      const cases = [['straight in, 6 km', (() => { const [x, z] = fromRunway(e27, -6000, 0); return { x, z, alt: 430, heading: 270 }; })()],
        ['circuit downwind', { x: dw[0], z: dw[2], alt: dw[1], heading: 90 }],
        ['open country, 4 km south', { x: 600, z: 4200, alt: 500, heading: 0 }]];
      const res = [];
      for (const [name, pl] of cases) {
        const R = setup(type, { ...pl, speed: P.vcruise * 0.95, throttle: 0.6 }, circuitRoute('27', { type }));
        R.step(1);
        const p = R.plan(); if (!p.fail) R.ap.landAt(p);
        const t = R.step(600, R.stopped);
        const td = R.ev.td[0];
        res.push({ ok: !p.fail && p.kind === 'runway' && t != null && td?.surface === 'runway' && !R.ev.imp.length, t, d: `${name}: ${p.label || p.fail}/${p.pattern} ${t != null ? 'stopped ' + t.toFixed(0) + ' s' : 'NOT stopped ' + R.ap.phase} td ${td?.fpm} fpm ${td?.surface} ${R.ev.imp.join()}` });
      }
      // LAND gone round low (busy runway / not lined up): its own short circuit back to the same runway, then down
      {
        const R = setup(type, { ...cases[0][1], speed: P.vcruise * 0.95, throttle: 0.6 }, circuitRoute('27', { type }));
        R.step(1); const p = R.plan(); R.ap.landAt(p);
        let forced = null;
        const t = R.step(700, (tt) => { if (!forced && R.ap.leg?.kind === 'approach' && !R.ac.onGround && R.ac.agl < 60) { R.ap._goAround('not lined up'); forced = tt; } return R.stopped(); });
        const gas = R.ev.ap.filter((x) => x.type === 'goaround').length;
        res.push({ ok: forced != null && t != null && R.ev.td[0]?.surface === 'runway' && gas <= 2 && !R.ev.imp.length, t, d: `LAND go-around: forced at ${forced?.toFixed(0)} s, stopped ${t?.toFixed(0)} s, ${gas} go-arounds, td ${R.ev.td.map((x) => x.surface + '@' + Math.round(x.s) + '/' + x.fpm).join(' ')} ${R.ev.imp.join()}` });
      }
      // LAND on Realistic with a plane parked in the touchdown zone (loop suite jumbo-hard: the tower sends it round, it must
      // come back round and land long, past it, with no engine pod in the grass)
      {
        const R = setup(type, { ...cases[0][1], speed: P.vcruise * 0.95, throttle: 0.6 }, circuitRoute('27', { type }), { rubber: false });
        const [px, pz] = fromRunway(e27, 180, 0), blk = new Aircraft({ type: 'c172' });
        blk.place({ x: px, z: pz, heading: 270 }, R.E);
        const bap = new Autopilot(blk); R.tr.add({ aircraft: blk, ap: bap, name: 'PARKED' }); bap.setRoute({ name: 'parked', legs: [{ kind: 'park', seconds: 1e9 }], loop: null });
        R.step(1); const p = R.plan(); R.ap.landAt(p);
        const t = R.step(900, R.stopped);
        res.push({ ok: t != null && R.ev.td[0]?.surface === 'runway' && !R.ac.crashed && !blk.crashed, t, d: `occupied (td ${R.ev.td.map((x) => x.surface + '@' + Math.round(x.s)).join('/')}, blocker ${blk.crashed ? 'HIT' : 'ok'}, ${R.ev.imp.join() || 'no impacts'}): ${t != null ? 'stopped ' + t.toFixed(0) + ' s at s=' + Math.round(sOf(R.ac)) : 'NOT stopped ' + R.ap.phase} ${R.ac.crashed ? 'CRASH ' + R.ac.crashReason : ''}` });
      }
      N.landSecs = res.map((r) => Math.round(r.t ?? -1));
      check(`${type} LAND ×3 (straight-in / downwind / open country) + a LAND go-around + touchdown zone occupied (Realistic): runway, touchdown on the runway, stopped`, res.every((r) => r.ok), res.map((r) => (r.ok ? "" : "✗ ") + r.d).join('; '));
    }
    // C. LAND NOW off a downwind: the runway (straight if it can, else its circuit + a quip), never a field
    {
      const c = circuitLegs('27', { type }), dw = c[2].to;
      const R = setup(type, { x: dw[0], z: dw[2], alt: dw[1], heading: 90, speed: P.vcruise * 0.95, throttle: 0.6 }, circuitRoute('27', { type }));
      R.step(1);
      const p1 = R.plan(); if (!p1.fail) R.ap.landAt(p1);
      R.step(5);
      const p2 = R.plan(true); if (!p2.fail) R.ap.landAt(p2);
      const t = R.step(600, R.stopped);
      check(`${type} LAND NOW from the downwind: still the runway (no field), ${p2.pattern === 'straight' ? 'straight in' : 'with a quip'}, lands and stops`, !p2.fail && p2.kind === 'runway' && (p2.pattern === 'straight' || !!p2.quip) && t != null && R.ev.td[0]?.surface === 'runway', `${p1.label}/${p1.pattern} → NOW ${p2.label || p2.fail}/${p2.pattern} "${p2.quip || ''}" stopped ${t?.toFixed(0)} s`);
    }
    // C1. LAND is offered anywhere on the jet's own (stretched, possibly ATC-extended) circuit: a runway plan, never
    // "NO FIELD AHEAD" (integration verify: herc downwind 2.5 nm out and f35 upwind 1.2 nm out had LAND greyed)
    {
      const L = circuitLegs('27', { type }), up = fromRunway(e27, 1400 + 900, 0), ext = L[3].to, base = L[4].to;
      const spots = [['upwind 1.2 nm', { x: up[0], z: up[1], alt: 160, h: 270 }], ['crosswind', { x: L[1].to[0], z: L[1].to[2] * 0.6, alt: L[1].to[1], h: 180 }],
        ['downwind', { x: L[2].to[0], z: L[2].to[2], alt: L[2].to[1], h: 90 }], ['downwind extended +2.5 km', { x: ext[0] + 2500, z: ext[2], alt: ext[1], h: 90 }],
        ['base', { x: base[0], z: (base[2] + ext[2]) / 2, alt: base[1], h: 0 }]];
      const out = spots.map(([n, q]) => {
        const h = q.h * Math.PI / 180, V = P.vcruise;
        const p = planLandAhead({ pos: { x: q.x, y: q.alt, z: q.z }, vel: { x: Math.sin(h) * V, y: 0, z: -Math.cos(h) * V }, heading: q.h, altitude: q.alt, onGround: false, world: W, layout, type });
        return { ok: !p.fail && p.kind === 'runway' && !/FIELD/.test(p.hint || ''), d: `${n}: ${p.fail ? 'FAIL ' + p.hint : p.label + '/' + p.pattern}` };
      });
      check(`${type} LAND offered on its own circuit (upwind, crosswind, downwind, extended downwind, base): a runway plan`, out.every((o) => o.ok), out.map((o) => o.d).join('; '));
    }
    // C2. LAND pressed in the climb-out (the loop suite's field branch): an open runway, never closed 04/22 or a field
    {
      const [x, z] = fromRunway(e27, 10, 0);
      const R = setup(type, { x, z, heading: e27.hdg }, circuitRoute('27', { type }), { rubber: false });
      R.step(200, () => !R.ac.onGround && R.ac.agl > 80);
      let p = R.plan();
      for (let k = 0; k < 60 && p.fail; k++) { R.step(2); p = R.plan(); }   // as the button: tapped once LAND is offered (a jumbo climbing away has nothing ahead at first)
      if (!p.fail) R.ap.landAt(p);
      if (p.pattern !== 'straight') { const q = R.plan(true); if (!q.fail) R.ap.landAt(q); }
      const t = R.step(700, R.stopped), rw = p.runway && layout.RUNWAYS.find((r) => r.ends.includes(p.runway));
      check(`${type} LAND in the climb-out: an open runway (not closed 04/22, not a field), landed and stopped without hitting anyone`, !p.fail && p.kind === 'runway' && rw && !rw.closed && t != null && !R.ac.crashed, `${p.label || p.fail}/${p.pattern}, stopped ${t?.toFixed(0)} s ${R.ac.crashed ? 'CRASH ' + R.ac.crashReason : ''}`);
    }
    // D. go-around on final (tower or AP): climbs away (never below 15 m after), comes round and lands
    {
      const e = runwayEnd('27'), [x, z] = fromRunway(e, -2600, 0);
      const R = setup(type, { x, z, alt: 2730 * Math.tan(4 * Math.PI / 180) + 5, heading: 270, speed: P.vapp * 1.05, throttle: 0.4, flaps: 2 / 3 }, circuitRoute('27', { type }), { rubber: false });
      let ga = null, minAfter = 1e9;
      const t = R.step(900, (tt) => { if (!ga && R.ap.leg?.kind === 'approach' && !R.ac.onGround && R.ac.agl < 60) { R.ap.goAround('test'); ga = tt; } if (ga && tt - ga < 30) minAfter = Math.min(minAfter, R.ac.agl); return ga && R.ap.leg?.kind === 'hold'; });
      check(`${type} go-around at 60 m: climbs away (min ${minAfter.toFixed(0)} m), comes round, lands, back at the hold`, ga != null && minAfter > 15 && t != null && R.ev.td.length >= 1 && R.ev.td.every((d) => d.surface === 'runway') && !R.ac.crashed, `GA at ${ga?.toFixed(0)} s, at the hold after ${t?.toFixed(0)} s, td ${R.ev.td.map((d) => d.fpm).join('/')} ${R.ac.crashed ? 'CRASH ' + R.ac.crashReason : ''}`);
    }
    // E. land → Hard taxi to the terminal (heavies: their own pull-in spot) → DEMAND TAKEOFF: airborne inside the runway
    {
      const e = runwayEnd('27'), [x, z] = fromRunway(e, -3500, 0);
      const R = setup(type, { x, z, alt: 3630 * Math.tan(4 * Math.PI / 180), heading: 270, speed: P.vapp * 1.05, throttle: 0.4, flaps: 2 / 3 }, circuitRoute('27', { type }), { rubber: false });
      const p = R.plan(); R.ap.landAt(p);
      R.step(400, R.stopped);
      const sid = R.ap.taxiIn({ stand: DEFAULT_SPOT.id });
      const tt = R.step(600, () => R.ap.leg?.kind === 'park' && R.ac.speed < 0.3);
      const zone = finishZone('hard', { x: R.ac.pos.x, z: R.ac.pos.z, surface: R.ac.surface }, DEFAULT_SPOT), hv = isHeavy(type) ? heavySpot(sid) : null;
      check(`${type} taxi in (Hard): parks ${hv ? 'on the heavy spot in front of ' + hv.stands.join('+') : 'at ' + sid}, Hard finish zone OK, nothing hit`, tt != null && zone.ok && !R.ev.imp.length && !R.ac.crashed && (!hv || Math.hypot(R.ac.pos.x - hv.x, R.ac.pos.z - hv.z) < 12), `stand ${sid} after ${tt?.toFixed(0)} s at ${R.ac.pos.x.toFixed(0)},${R.ac.pos.z.toFixed(0)} zone ${zone.ok ? 'ok' : zone.reason} ${R.ev.imp.join()}`);
      const end = R.ap.demandTakeoff({ ends: ['27', '09'], prefer: '27' });
      let lift = null;
      const ta = R.step(400, () => { if (!lift && !R.ac.onGround && R.ac.agl > 0.3) lift = { s: toRunwayS(runwayEnd(end), R.ac) }; return lift && R.ac.agl > 30; });
      N.demandToAir = Math.round(ta ?? -1);
      check(`${type} DEMAND TAKEOFF from the terminal: airborne inside the runway (${runwayEnd(end).len} m), circuits`, !!end && ta != null && lift.s < runwayEnd(end).len - 40 && !R.ev.imp.length && R.ap.route.name.startsWith('circuits'), `RWY ${end}${R.ap.demandDirect ? ' (direct)' : ''}: > 30 m after ${ta?.toFixed(0)} s, lift at s=${lift?.s.toFixed(0)} ${R.ev.imp.join()}`);
      // DEMAND TAKEOFF with an AI waiting at the near end's hold (loop suite jumbo-easy: it parked 75 m behind it for 300 s):
      // a jet cannot squeeze past, so it goes to the other end; and it never rolls from mid-runway with too little left
      {
        const Q = setup(type, { x: 362, z: -110, heading: 90 }, circuitRoute('27', { type }), { rubber: false });
        Q.ap.done = true;
        const h = holdPoint('27'), ai = new Aircraft({ type: 'c172' }), aap = new Autopilot(ai);
        ai.place({ x: h[0], z: h[1], heading: 180 }, Q.E); Q.tr.add({ aircraft: ai, ap: aap, name: 'AI' });
        aap.setRoute({ name: 'circuits 27', legs: [{ kind: 'hold', end: '27', seconds: 999, untilClear: true }, ...circuitRoute('27').legs], loop: 1 });
        const end2 = Q.ap.demandTakeoff({ ends: ['27', '09'], prefer: '27' });
        let lift2 = null;
        const t2 = Q.step(500, () => { if (!lift2 && !Q.ac.onGround) lift2 = toRunwayS(runwayEnd(end2), Q.ac); return lift2 != null && Q.ac.agl > 30; });
        const M = setup(type, (() => { const [x, z] = fromRunway(runwayEnd('09'), 700, 0); return { x, z, heading: 90 }; })(), circuitRoute('09', { type }), { rubber: false });
        M.ap.done = true; M.ap.demandTakeoff({ ends: ['09', '27'], prefer: '09' });
        let liftM = null;
        M.step(400, () => { if (!liftM && !M.ac.onGround) liftM = toRunwayS(runwayEnd(M.ap.route.legs.find((l) => l.kind === 'takeoff')?.end ?? '09'), M.ac); return liftM != null && M.ac.agl > 30; });
        check(`${type} DEMAND TAKEOFF: not stuck behind an AI at the near hold (heavy: the other end), airborne; from mid-runway (700 m left) it lines up at a threshold first`, end2 === (isHeavy(type) || book * 1.1 > 850 ? '09' : end2) && t2 != null && lift2 < 1360 && liftM != null && liftM < 1360 && !Q.ev.imp.length && !M.ev.imp.length, `→ RWY ${end2}, airborne ${t2?.toFixed(0)} s, lift at s=${lift2?.toFixed(0)}; mid-runway start lifted at s=${liftM?.toFixed(0)}`);
      }
      // a jet never takes off from a field: fieldTakeoff refuses (main falls back)
      const F = setup(type, { x: 2600, z: 1500, heading: 90 }, circuitRoute('27', { type }));
      const ft = F.ap.fieldTakeoff({ world: W, end: '27' }), q = F.ap.events.find((x) => x.type === 'refused');
      // D35: the F-35B goes up vertically instead (tools/stovl-sim.mjs flies it)
      if (TYPES[type].stovl) check(`${type} fieldTakeoff is a vertical takeoff (D35 STOVL)`, !!ft?.vto && F.ap.stovlMode === 'vto', JSON.stringify(ft));
      else check(`${type} fieldTakeoff refuses (no turnip-field departures), with a quip`, ft === false && !!q?.quip, q?.quip);
    }
    // F. hand-flown upset at 400 m: rolled past 100° and pushed nose-down, released: the AP recovers
    {
      const R = setup(type, { x: 0, z: 2500, alt: 400, heading: 90, speed: P.vcruise, throttle: 0.6 }, circuitRoute('27', { type }), { rubber: false });
      for (let t = 0; t < 8 && Math.abs(R.ac.bank) < Math.min(1.8, (P.bankLimit ?? 9) - 0.05); t += 1 / 60) { R.ent.manual.aileron = 1; R.ent.manual.elevator = -0.4; R.step(1 / 60); }
      const bank0 = R.ac.bank;
      R.ent.manual.aileron = null; R.ent.manual.elevator = null;
      let minA = R.ac.agl, lv = null;
      let worse = 0;
      R.step(40, (t) => { minA = Math.min(minA, R.ac.agl); if (lv == null && R.ap.phase !== 'RECOVERY' && Math.abs(R.ac.bank) < 0.55 && R.ac.pitch > -0.1) lv = t; if (lv != null && (Math.abs(R.ac.bank) > 0.8 || R.ac.pitch < -0.3)) worse++; return lv != null && t > lv + 10; });
      check(`${type} hand-flown upset (${(bank0 * 57.3).toFixed(0)}° bank${P.bankLimit ? ', held at the FBW limit' : ''}, nose down) released: recovered < 25 s (back in an AP bank, nose up), stays recovered, never below 80 m`, Math.abs(bank0) > (P.bankLimit ? P.bankLimit - 0.15 : 1.5) && Math.abs(bank0) < (P.bankLimit ?? 9) + 0.25 && lv != null && lv < 25 && !worse && minA > 80 && !R.ac.crashed, `recovered after ${lv?.toFixed(1)} s, min ${minA.toFixed(0)} m AGL`);
    }
    // G. the world edge: flown by hand straight out at cruise; warned, then the AP takes it home
    {
      const [cx, cz] = homeCenter();
      const R = setup(type, { x: cx + 7000, z: cz, alt: 600, heading: 90, speed: P.vcruise * 1.3, throttle: 1 }, circuitRoute('27', { type }), { world: false, rubber: false });
      let maxR = 0, inbound = null, tLock = null;
      R.step(240, (t) => {
        R.ent.manual.elevator = 0.02; R.ent.manual.aileron = 0; R.ent.manual.throttle = 1;   // keeps flying out, full power
        const r = Math.hypot(R.ac.pos.x - cx, R.ac.pos.z - cz); maxR = Math.max(maxR, r);
        if (tLock == null && R.ent.bnd.lock) tLock = t;
        if (tLock != null && inbound == null && (R.ac.vel.x * (cx - R.ac.pos.x) + R.ac.vel.z * (cz - R.ac.pos.z)) / r > 0.5 * R.ac.gs) inbound = t;
        return inbound != null && t > inbound + 10;
      });
      const st = R.ev.ap.filter((e) => e.type === 'boundary').map((e) => e.stage);
      N.boundaryMaxKm = +(maxR / 1000).toFixed(1);
      check(`${type} world edge: warned, AP takes the stick and turns home (inbound ${inbound != null ? (inbound - tLock).toFixed(0) + ' s after' : 'never'}), max ${(maxR / 1000).toFixed(1)} km (< 13.5 km terrain)`, st[0] === 'warn' && st.includes('turnback') && inbound != null && maxR < 13500 && !R.ac.crashed, `${st.join(' → ')}; quip "${R.ev.ap.find((e) => e.stage === 'turnback')?.quip}"`);
    }
  }
  if (!only.length || only.includes('f35')) {
    // H. F-35 afterburner: lights above 95 % throttle, out below; more thrust; more fuel
    const ac = new Aircraft({ type: 'f35' }), flat = { groundHeightAt: () => 0, surfaceAt: () => 'runway', colliders: [] };
    ac.place({ x: 0, z: 0, alt: 1000, heading: 90, speed: 150, throttle: 0.9 }, flat);
    const run = (thr, secs) => { for (let t = 0; t < secs; t += 1 / 120) { ac.ctl.throttle = thr; ac.step(1 / 120, flat); } return { ...ac.engineState(), fuel: ac.fuel.L + ac.fuel.R }; };
    const dry = run(0.94, 6), f0 = dry.fuel, wet = run(1, 2), wetFuel = run(1, 6).fuel, off = run(0.9, 2);
    check('f35 afterburner: lights above 95 % throttle (ab > 0.9, afterburner flag), more thrust than dry, goes out below', dry.ab === 0 && !dry.afterburner && wet.ab > 0.9 && wet.afterburner && wet.thrust > dry.thrust * 1.3 && off.ab < 0.1, `dry ${(dry.thrust / 1000).toFixed(0)} kN n1 ${dry.n1.toFixed(2)} | AB ${(wet.thrust / 1000).toFixed(0)} kN ab ${wet.ab.toFixed(2)} | back to 90 %: ab ${off.ab.toFixed(2)}`);
    check('f35 afterburner: burns fuel ~3× faster', (f0 - wetFuel) / 8 > 0, `${(f0 - wetFuel).toFixed(1)} L in 8 s of AB`);
  }
  if (!only.length || only.includes('jumbo')) {
    // I. wake: a C172 on final 2.5 km behind a jumbo is rolled about (an upset) but survives and lands
    const tr = new Traffic(env), e = runwayEnd('27');
    const J = new Aircraft({ type: 'jumbo' }), [jx, jz] = fromRunway(e, -3000, 0); J.place({ x: jx, z: jz, alt: 3130 * Math.tan(4 * Math.PI / 180), heading: 270, speed: TYPES.jumbo.vapp, throttle: 0.4, flaps: 1 }, env);
    const ja = new Autopilot(J); tr.add({ aircraft: J, ap: ja, name: 'JUMBO' }); ja.setRoute(arrivalRoute('27', { type: 'jumbo', stand: 'auto' })); ja.replan();
    const C = new Aircraft({ type: 'c172' }), [cx, cz] = fromRunway(e, -3800, 0); C.place({ x: cx, z: cz, alt: 3930 * Math.tan(4 * Math.PI / 180) - 4, heading: 270, speed: 65 * KT, throttle: 0.4, flaps: 1 }, env);
    const ca = new Autopilot(C); tr.add({ aircraft: C, ap: ca, name: 'C172', player: true }); ca.setRoute(circuitRoute('27')); ca.replan(); ca.noAvoid = true;
    let wake = 0, maxBank = 0, td = null;
    let lastWake = -99, bank0 = 0;
    for (let t = 0; t < 600 && !(td && C.speed < 5); t += 1 / 60) {
      tr.update(1 / 60);
      for (const ev of C.events.splice(0)) { if (ev.type === 'wake') { wake++; if (t - lastWake > 4) bank0 = C.bank; lastWake = t; } if (ev.type === 'touchdown' && !td) td = ev; }
      if (!C.onGround && t - lastWake < 4) maxBank = Math.max(maxBank, Math.abs(C.bank - bank0));   // bank the wake put in (not the AP's own turns)
    }
    check(`wake: a C172 0.8 km behind a jumbo down the final meets its wake (${wake}×), gets rolled (${(maxBank * 57.3).toFixed(0)}° within 4 s of an encounter) and survives to land`, wake > 0 && maxBank > 0.35 && !C.crashed && !!td, `td ${td?.fpm} fpm ${td?.surface}, crash ${C.crashed ? C.crashReason : 'no'}`);
  }
  for (const t of types) console.log(`  ${t}: ${JSON.stringify(JET_NUMBERS[t])}`);
}

// MAP: the runway a light plane needs scales with its book takeoff roll (farm strip 620 m, Palace Lawn 240 m)
function scMinRun() {
  const mr = (type) => new Autopilot(new Aircraft({ type }))._minRun();
  const m = Object.fromEntries(['c172', 'tiger', 'bathtub', 'jumbo', 'herc', 'f35'].map((t) => [t, Math.round(mr(t))]));
  check('minimum takeoff run by type: light planes roll × 1.4 (C172 fits the 620 m farm strip, Moth and Bathtub a 240 m lawn from 12 m in), jets unchanged',
    m.c172 <= 608 && m.c172 >= 290 && m.tiger <= 228 && m.bathtub <= 228 && m.tiger >= 160 && m.bathtub >= 150 && m.jumbo >= 1375 && m.herc >= 616 && m.f35 >= 600, JSON.stringify(m));
  // a Moth lined up with 450 m of runway 27 left rolls at once (it used to taxi 1.5 km back to the threshold: 600 m rule)
  const e = runwayEnd('27'), [x, z] = fromRunway(e, e.len * 0.44, 0);
  const tr = new Traffic(env), ac = new Aircraft({ type: 'tiger' }), ap = new Autopilot(ac);
  ac.place({ x, z, heading: e.hdg }, env); tr.add({ aircraft: ac, ap, player: true, name: 'P' }); ap.setRoute(circuitRoute('27', { type: 'tiger' }));
  let up = null; for (let t = 0; t < 90 && up == null; t += 1 / 60) { tr.update(1 / 60); if (!ac.onGround && ac.agl > 10) up = t; }
  check('a Moth lined up with ~780 m of runway left takes off from there (no taxi back)', ap.leg.kind === 'takeoff' && up != null && up < 40 && !ac.crashed, `airborne > 10 m after ${up?.toFixed(1)} s`);
}

// ROSTER (V1 A1–A3): Butter Cub, Show-Off (Pitts S-2) and Divine Right (the throne) through the whole loop.
// node tools/flight-sim.mjs roster [--only=cub,pitts,throne]   --falsify=roll|loop|vto|short|brake breaks one thing on purpose.
const ROSTER = ['cub', 'pitts', 'throne'];
const RFALS = (args.find((a) => a.startsWith('--falsify=')) || '').slice(10);
async function scRoster() {
  const only = (args.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
  const types = only.length ? ROSTER.filter((t) => only.includes(t)) : ROSTER;
  if (RFALS === 'roll') TYPES.pitts.maxRollRate = 1.2;
  if (RFALS === 'loop') GL.easy = 1;
  if (RFALS === 'vto') TYPES.throne.stovl = { ...TYPES.throne.stovl, tw: 0.9 };
  if (RFALS === 'short') AIRCRAFT.cub.performance.takeoffRollM = 290;
  if (RFALS === 'brake') delete TYPES.cub.shortField;
  const flat = { groundHeightAt: () => 0, surfaceAt: () => 'runway', colliders: [] };
  for (const type of types) for (const END of ['09', '27']) scTypeCircuit(type, END);
  scTypeOverride(types);
  scTypeGround(types, { generic: false });
  // tailwheel ground roll on Easy: full power down the runway hands-on-neutral, a yaw kick at 25 kt. Easy keeps it
  // straight and in one piece; Hard (no extra tail-wheel damping) swings further but stays catchable with rudder
  const kick = (type, level, rudder) => {
    const tr = new Traffic(flat), ac = new Aircraft({ type, id: 'player' }), ap = new Autopilot(ac);
    ac.stovlLevel = level; ac.place({ x: 0, z: 0, heading: 90 }, flat);
    const p = tr.add({ aircraft: ac, ap, player: true, name: 'P' }); ap.setRoute(circuitRoute('09', { type }));
    let dev = 0, kicked = false;
    for (let t = 0; t < 14 && ac.onGround; t += 1 / 120) {
      p.manual.throttle = 1; p.manual.elevator = 0.2;
      p.manual.aileron = rudder ? Math.max(-1, Math.min(1, wrapD(90 - ac.heading) * 0.05 + ac.w.y * 1.5)) : 0;
      if (!kicked && ac.speed > 25 * KT) { ac.w.y -= 0.18; kicked = true; }
      tr.update(1 / 120); if (kicked) dev = Math.max(dev, Math.abs(wrapD(ac.heading - 90)));
    }
    return { dev, crashed: ac.crashed || ac.events.some((e) => e.type === 'impact'), kicked };
  };
  for (const type of types.filter((t) => TYPES[t].gear.tailwheel)) {
    const easy = kick(type, 'easy', false), hard = kick(type, 'hard', false), held = kick(type, 'hard', true);
    check(`${type} Easy tailwheel roll: a 10°/s yaw kick at 25 kt hands-off stays within 12° and upright; Hard swings more, rudder catches it (< 8°)`,
      easy.kicked && easy.dev < 12 && !easy.crashed && hard.dev > easy.dev && held.dev < 8 && !held.crashed, `easy ${easy.dev.toFixed(1)}°, hard hands-off ${hard.dev.toFixed(1)}°, hard + rudder ${held.dev.toFixed(1)}°`);
  }
  // Pitts: about 240°/s at full aileron at cruise; the Cub rolls gently
  for (const type of types.filter((t) => t !== 'throne')) {
    const ac = new Aircraft({ type }), cr = AIRCRAFT[type].speeds.cruise * KT;
    ac.place({ x: 0, z: 0, alt: 800, heading: 90, speed: cr, throttle: 0.8 }, flat);
    let peak = 0, roll360 = null, acc = 0;
    for (let t = 0; t < 4; t += 1 / 240) { ac.ctl.aileron = 1; ac.ctl.elevator = 0.05; ac.step(1 / 240, flat); peak = Math.max(peak, -ac.w.z); acc += -ac.w.z / 240; if (roll360 == null && acc >= 2 * Math.PI) roll360 = t; }
    const dps = peak / DEG_;
    if (type === 'pitts') check(`pitts: full aileron at ${(cr / KT).toFixed(0)} kt rolls ~240°/s (220–260), a full roll in ≤ 1.8 s`, dps > 220 && dps < 260 && roll360 != null && roll360 < 1.8, `${dps.toFixed(0)}°/s, 360° in ${roll360?.toFixed(2)} s`);
    else check(`${type}: full aileron at cruise rolls gently (40–80°/s)`, dps > 40 && dps < 80, `${dps.toFixed(0)}°/s`);
  }
  // short fields: the Cub uses the 240 m Palace Lawn from 12 m in and the 620 m farm strip with room to spare
  {
    const mr = Object.fromEntries(types.map((t) => [t, Math.round(new Autopilot(new Aircraft({ type: t }))._minRun())]));
    if (mr.cub != null) check('cub: minimum takeoff run fits the 240 m Palace Lawn from a line-up 12 m in (≤ 228 m)', mr.cub <= 228, JSON.stringify(mr));
    if (mr.pitts != null) check('pitts: minimum takeoff run fits the 620 m farm strip', mr.pitts <= 608, JSON.stringify(mr));
  }
  for (const type of types.filter((t) => t === 'cub')) {
    // a LAND onto RWY 27: touchdown to a stop in ≤ 120 m, and the takeoff ground roll on grass
    const e = runwayEnd('27'), [fx, fz] = fromRunway(e, -1500, 0);
    const tr = new Traffic(env), ac = new Aircraft({ type }), ap = new Autopilot(ac);
    ac.place({ x: fx, z: fz, alt: 100, heading: e.hdg, speed: ac.P.vapp * 1.2, throttle: 0.4 }, env);
    tr.add({ aircraft: ac, ap, player: true, name: 'P' }); ap.setRoute(circuitRoute('27', { type })); ap.replan();
    const { planLandAhead } = await import('../js/assist/landahead.js');
    const plan = planLandAhead({ pos: ac.pos, vel: ac.vel, heading: ac.heading, altitude: ac.alt, onGround: false, world: { groundHeightAt: () => 0, surfaceAt: env.surfaceAt, colliders: [] }, layout: (await import('../js/assist/test/fakeworld.mjs')).layout });
    if (!plan.fail) ap.landAt(plan);
    let td = null, stop = null;
    for (let t = 0; t < 200 && stop == null; t += 1 / 60) { tr.update(1 / 60); if (!td && ac.lastTouchdown) td = { x: ac.pos.x, z: ac.pos.z }; if (td && ac.onGround && ac.speed < 0.5) stop = Math.hypot(ac.pos.x - td.x, ac.pos.z - td.z); }
    check('cub: LAND on RWY 27 rolls ≤ 120 m from touchdown to a stop (lands short)', stop != null && stop <= 120 && !ac.crashed, `${plan.label || plan.fail}: ${stop?.toFixed(0)} m`);
    const g = new Aircraft({ type }); g.place({ x: 0, z: 0, heading: 90 }, { ...env, surfaceAt: () => 'grass' });
    const gtr = new Traffic({ ...env, surfaceAt: () => 'grass' }), gap = new Autopilot(g);
    gtr.add({ aircraft: g, ap: gap, player: true, name: 'G' });
    gap.setRoute({ name: 'grass', legs: [{ kind: 'takeoff', end: { id: 'FIELD', virtual: true, label: 'FIELD', hdg: 90, u: [1, 0], thr: [0, 0], far: [600, 0], len: 600, width: 24, elev: 0 }, alt: 60 }, { kind: 'fly', to: [5000, 200, 0], speed: 70 }], loop: null });
    let lift = null; for (let t = 0; t < 60 && lift == null; t += 1 / 60) { gtr.update(1 / 60); if (!g.onGround) lift = g.pos.x; }
    check('cub: off grass in ≤ 160 m (loves grass)', lift != null && lift <= 160 && !g.crashed, `${lift?.toFixed(0)} m`);
  }
  if (types.includes('throne')) await rosterThrone();
  await scLandMany(types, { goAround: false, retry: true });
  await scAaron(types);
  await scFix3(types, { noRunOk: ['pitts'] });
  // main.js fieldHop's last resort (no clear run): placed 25 m up at 78 kt, full power — it must fly away
  for (const type of types) {
    const tr = new Traffic(env), ac = new Aircraft({ type }), ap = new Autopilot(ac);
    ac.place({ x: -1400, z: 0, alt: 25, heading: 270, speed: 78 * KT, throttle: 1, flaps: 0 }, env);
    tr.add({ aircraft: ac, ap, player: true, name: 'P' }); ap.setRoute(circuitRoute('27', { type })); ap.resumeCircuit('27');
    let minA = 99; for (let t = 0; t < 30; t += 1 / 60) { tr.update(1 / 60); minA = Math.min(minA, ac.agl); }
    check(`${type}: main's field-hop fallback (25 m, 78 kt, full power) flies away onto the circuit`, !ac.crashed && minA > 8 && ac.agl > 40, `min ${minA.toFixed(0)} m, now ${ac.agl.toFixed(0)} m ${ap.phase}`);
  }
  scPlayerFeel(types, { generic: false });
  await rosterAI(types);
}

// The throne's jet pack: STOVL on the F-35's flight computer with a gentler profile (docs/STOVL.md)
async function rosterThrone() {
  const { contextButton, LEVELS } = await import('../js/flight/stovl.js');
  const mkT = (place, level = 'easy') => {
    const tr = new Traffic(env), ac = new Aircraft({ type: 'throne', id: 'player' }), ap = new Autopilot(ac);
    ac.stovlLevel = level; ac.place(place, env);
    const e = tr.add({ aircraft: ac, ap, player: true, name: 'P' }); ap.setRoute(circuitRoute('27', { type: 'throne' })); if (!ac.onGround) ap.replan();
    const ev = [];
    const step = (secs, stop) => { for (let t = 0; t < secs; t += 1 / 60) { tr.update(1 / 60); for (const x of ac.events.splice(0)) ev.push(x); ap.events.length = 0; if (stop && stop(t)) return t; } return null; };
    return { tr, ac, ap, e, ev, step };
  };
  const G = { x: -1500, z: -1200, heading: 90 };
  for (const level of ['easy', 'medium', 'hard']) {
    const W = mkT(G, level);
    const ok = W.ap.verticalTakeoff();
    let lift = null;
    W.step(40, (t) => { if (lift == null && !W.ac.onGround) lift = t; return W.ap.stovl?.mode === 'hover'; });
    W.step(6);
    const x0 = W.ac.pos.x, z0 = W.ac.pos.z, h0 = W.ac.agl; let drift = 0, dh = 0;
    W.step(20, () => { drift = Math.max(drift, Math.hypot(W.ac.pos.x - x0, W.ac.pos.z - z0)); dh = Math.max(dh, Math.abs(W.ac.agl - h0)); });
    const hold = level === 'hard' ? true : drift < 4 && dh < 1.5;
    check(`throne ${level}: VERTICAL TAKEOFF to a ~25 m hover${level === 'hard' ? '' : ', held hands-off (≤ 4 m, ±1.5 m)'}`, ok && lift != null && lift < 4 && W.ap.stovl?.mode === 'hover' && h0 > 20 && hold && !W.ac.crashed, `lift-off ${lift?.toFixed(1)} s, hover ${h0.toFixed(1)} m, drift ${drift.toFixed(1)} m ±${dh.toFixed(1)} m, nozzle ${W.ac.nozzle.toFixed(2)}`);
    W.ap.landHere({ x: W.ac.pos.x + 20, z: W.ac.pos.z });
    let td = null; W.step(60, () => { td ||= W.ev.find((x) => x.type === 'touchdown'); return W.ap.done && W.ac.vtol <= 0; });
    check(`throne ${level}: LAND HERE beside it: a gentle touchdown (< 500 fpm), parks (AP done), no impact`, !!td && td.fpm < 500 && W.ap.done && !W.ac.crashed && !W.ev.some((x) => x.type === 'impact'), `${td?.fpm} fpm ${td?.grade}, done ${W.ap.done}, vtol ${W.ac.vtol.toFixed(2)}`);
  }
  // wing-borne → HOVER → FLY ON → back on the circuit
  {
    const W = mkT({ x: -3000, z: -1500, alt: 120, heading: 90, speed: 80 * KT, throttle: 0.7 });
    W.step(3);
    const ok = W.ap.hover();
    W.step(40, () => W.ap.stovl?.mode === 'hover' && W.ac.gs < 1.5);
    const hov = W.ap.stovl?.mode === 'hover' && W.ac.gs < 1.5;
    W.ap.flyOn();
    let wing = null, minAgl = 1e9; W.step(60, (t) => { minAgl = Math.min(minAgl, W.ac.agl); if (!W.ap.stovl && wing == null) wing = t; return wing != null && t > wing + 15; });
    check('throne: HOVER from 80 kt stops in the air; FLY ON goes back to wings and the circuit', ok && hov && wing != null && minAgl > 15 && !W.ac.crashed && W.ap.route?.name?.startsWith('circuits'), `hover ${hov}, wing-borne after ${wing?.toFixed(1)} s, lowest ${minAgl.toFixed(0)} m, ${(W.ac.speed / KT).toFixed(0)} kt`);
  }
  // DEMAND TAKEOFF from a field is a vertical takeoff that flies on
  {
    const W = mkT(G, 'medium');
    const r = W.ap.fieldTakeoff({ world: {}, end: '27' });
    let wing = null; W.step(70, (t) => { if (!W.ap.stovl && W.ac.speed > W.ac.P.vapp && wing == null) wing = t; return wing != null; });
    check('throne: field DEMAND TAKEOFF = a vertical takeoff that flies on to the circuit', !!r?.vto && wing != null && !W.ac.crashed, `vto ${!!r?.vto}, wing-borne after ${wing?.toFixed(1)} s`);
  }
  // the context button offers the jet-pack choices for the throne; the Cub keeps the plain LAND button
  {
    const b1 = contextButton({ stovl: !!TYPES.throne.stovl, onGround: true, gsKt: 0, speedKt: 0, agl: 0, mode: null });
    const b2 = contextButton({ stovl: !!TYPES.cub.stovl, onGround: true, gsKt: 0, speedKt: 0, agl: 0, mode: null });
    check('throne: the LAND slot offers VERTICAL TAKEOFF on the ground (the Cub/Pitts keep the plain LAND button)', b1?.key === 'vto' && b2 == null && !TYPES.pitts.stovl, `${b1?.label} / ${b2}`);
    const air = (kt) => contextButton({ stovl: TYPES.throne.stovl, onGround: false, gsKt: kt, speedKt: kt, agl: 150, mode: null, landPlan: { label: 'RWY 27' } });
    const c80 = air(80), c45 = air(45);
    check('throne: in the circuit (80 kt) the slot reads LAND with HOVER as the pill; slowed right down (45 kt) HOVER comes first', c80?.key === 'landrw' && c80.alt?.key === 'hover' && c45?.key === 'hover' && c45.alt?.key === 'landrw', `${c80?.label}+${c80?.alt?.label} / ${c45?.label}+${c45?.alt?.label}`);
  }
  // shopping trolley: hands-off at cruise it wanders and pulls left; the autopilot still flies the circuit (above)
  {
    const ac = new Aircraft({ type: 'throne' });
    ac.place({ x: 0, z: 0, alt: 300, heading: 90, speed: 85 * KT, throttle: 0.75 }, env);
    for (let t = 0; t < 10; t += 1 / 120) ac.step(1 / 120, env);
    const turned = wrapD(ac.heading - 90);
    check('throne: hands-off it pulls left like a shopping trolley (heading drifts left within 10 s)', turned < -3 && !ac.crashed, `${turned.toFixed(1)}° in 10 s`);
  }
}

// AI traffic of the new types through the real ATC for 12 min (spawned like main's attract mix): no crash, they land
async function rosterAI(types) {
  const { createATC } = await import('../js/atc/index.js');
  const { linkTraffic } = await import('../js/atc/bridge.js');
  const R = await import('../js/flight/routes.js');
  const real = Math.random, seeded = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const rnd = seeded(4242); Math.random = rnd;
  const tr = new Traffic(env), atc = createATC({ wind: { from: 270, kt: 8 }, detectCollisions: false }), link = linkTraffic(atc, tr, { mischief: 'low', rnd });
  const ai = [], landed = new Map(), crashes = [];
  const pool = ['c172', ...types, ...types];
  const spawn = (kind, o = {}) => {
    const type = o.type || pool[Math.floor(rnd() * pool.length)], ac = new Aircraft({ type });
    const plan = R.aiSpawn(kind, atc.activeRunway().end, { ...o, rnd, type, claimStand: () => tr.claimStand(ac) });
    if (!plan) return;
    ac.place(plan.place, env); if (plan.stand) tr.standOwner.set(plan.stand, ac);
    const ap = new Autopilot(ac), e = tr.add({ aircraft: ac, ap, name: `${type}-${kind}${ai.length}` }); ap.setRoute(plan.route); ai.push(e);
  };
  types.forEach((t, i) => { spawn('final', { type: t, dist: 3000 + i * 1800 }); spawn('parked', { type: t, wait: 10 + i * 25 }); spawn('downwind', { type: t, wait: 20 }); });
  let respawn = 30;
  for (let k = 0; k < 12 * 60 * 60; k++) {
    tr.update(1 / 60); link.update(1 / 60);
    for (const e of [...ai]) {
      for (const ev of e.ac.events.splice(0)) { if (ev.type === 'crash') crashes.push(`${e.name}: ${ev.reason}`); if (ev.type === 'touchdown' && !ev.bounce) landed.set(e.ac.type, (landed.get(e.ac.type) || 0) + 1); }
      e.ap.events.length = 0;
      if (e.ap.done && e.ap.phase === 'GONE') { atc.remove(link.idOf(e)); tr.remove(e); ai.splice(ai.indexOf(e), 1); }
    }
    if (ai.length < 7 && (respawn -= 1 / 60) <= 0) { respawn = 20 + rnd() * 20; spawn(rnd() < 0.5 ? 'arrive' : 'depart', { wait: 2 }); }
  }
  Math.random = real;
  check(`AI traffic (${types.join('/')}) through the real ATC for 12 min: no crash, every type lands`, !crashes.length && types.every((t) => landed.get(t) > 0), `${crashes.join('; ') || 'no crashes'}; touchdowns ${JSON.stringify(Object.fromEntries(landed))}`);
}

// FLIGHTFIX4 (bug reports from the lanes): node tools/flight-sim.mjs fix4
async function scFix4() {
  // #1/#2 a recovery that ends in replan() moves to another leg; update() used to run the OLD leg's step on the new cur:
  // "_pursue … reading 'length'" from _takeoff, "toRunway … reading 'thr'" from _approach (fuzz: LAND/stick/ATC go-around)
  for (const [kind, label] of [['takeoff', '#1 _takeoff'], ['approach', '#2 _approach']]) {
    const out = [];
    for (const type of ['bathtub', 'c172', 'tiger']) {
      const tr = new Traffic(env), ac = new Aircraft({ type }), ap = new Autopilot(ac), r = circuitRoute('27', { type });
      const L = circuitLegs('27', { type }), d = L[2].to;   // downwind, level: replan() rejoins a fly leg
      ac.place({ x: d[0], z: d[2], alt: d[1], heading: 90, speed: TYPES[type].vcruise * 0.9, throttle: 0.7 }, env);
      tr.add({ aircraft: ac, ap, player: true, name: 'P' });
      ap.setRoute(r, { start: r.legs.findIndex((l) => l.kind === kind) });
      ap.recovering = true;
      let err = null;
      try { for (let k = 0; k < 600 && ap.leg.kind === kind; k++) tr.update(1 / 120); for (let k = 0; k < 60; k++) tr.update(1 / 120); } catch (x) { err = x.message; }
      out.push({ ok: !err && ap.leg.kind === 'fly', d: `${type} ${err || ap.leg.kind + '/' + ap.phase}` });
    }
    check(`FIX4 ${label}: a recovery that replans onto another leg runs that leg (no stale-leg step)`, out.every((o) => o.ok), out.map((o) => o.d).join('; '));
  }
  // #2 Kingdom Map swap (js/map/index.js doSwap → ap.airportChanged): nothing the AP holds may name the old airport's
  // runway ends or the old tower. A LAND's fallback route (_landPrev, circuits 27) restored at the farm threw
  // "no runway end 27" in _begin and left cur half built; the old link's gate asked a dead ATC for clearances.
  {
    const L = await import('../js/world/layout.js'), { KINGDOM } = await import('../data/airports/kingdom.js');
    for (const d of Object.values(KINGDOM)) L.registerAirport(d);
    const out = [];
    for (const to of ['farm', 'palace']) {
      L.setAirport('royal');
      const tr = new Traffic(env), ac = new Aircraft({ type: 'tiger' }), ap = new Autopilot(ac);
      ac.place({ ...lined('27') }, env); tr.add({ aircraft: ac, ap, player: true, name: 'P' });
      ap.setRoute(circuitRoute('27', { type: 'tiger' })); ap.gate = () => false; ap.__atcGate = true; ap.extendDownwind(400, '27');
      ap.landAt({ route: circuitRoute('09', { type: 'tiger' }), label: 'RWY 09' });
      L.setAirport(to);
      ap.airportChanged();
      const e = runwayEnd(L.RUNWAYS[0].ends[0]), [x, z] = fromRunway(e, -4000, 0);
      ac.place({ x, z, alt: 300, heading: e.hdg, speed: 45, throttle: 0.6 }, env);
      ap.setRoute(arrivalRoute(e.id, { type: 'tiger', from: [x, z] }));
      let err = null;
      try { ap.cancelLand(); for (let k = 0; k < 240; k++) tr.update(1 / 120); } catch (x) { err = x.message; }
      out.push({ ok: !err && ap.route.name.startsWith('arrival') && !ap.gate && !ap.__atcGate && !ap.extendDW, d: `${to}: ${err || ap.route.name + ' ' + ap.phase} gate ${ap.gate ? 'OLD' : 'none'} ext ${ap.extendDW ? 'OLD' : 'none'}` });
    }
    L.setAirport('royal');
    check('FIX4 #2 airport swap: LAND fallback, old tower gate and runway-end state do not survive ap.airportChanged()', out.every((o) => o.ok), out.map((o) => o.d).join('; '));
  }
  // #8 DEMAND TAKEOFF for a STOVL type where no runway fits (the Palace Lawn): a vertical takeoff that flies on, not
  // "NO RUNWAY OPEN"; a conventional type there still gets false (main falls back as before)
  {
    const L = await import('../js/world/layout.js'), { KINGDOM } = await import('../data/airports/kingdom.js');
    for (const d of Object.values(KINGDOM)) L.registerAirport(d);
    L.setAirport('palace');
    const out = [];
    try {
      for (const type of ['f35', 'throne', 'jumbo']) {
        const tr = new Traffic(env), ac = new Aircraft({ type }), ap = new Autopilot(ac), e = runwayEnd(L.RUNWAYS[0].ends[0]), [x, z] = fromRunway(e, 40, 0);
        ac.place({ x, z, heading: e.hdg }, env); tr.add({ aircraft: ac, ap, player: true, name: 'P' }); ap.setRoute(circuitRoute(e.id, { type }));
        for (let k = 0; k < 60; k++) tr.update(1 / 60);
        const r = ap.demandTakeoff({ ends: L.RUNWAYS[0].ends.slice(), prefer: e.id });
        let up = 0; if (r?.vto) for (let k = 0; k < 60 * 20; k++) { tr.update(1 / 60); up = Math.max(up, ac.agl); }
        out.push({ ok: type === 'f35' ? !!r?.vto && up > 15 : type === 'throne' ? !!r : r === false, d: `${type} ${JSON.stringify(r)} ${ap.stovlMode || ''} up ${up.toFixed(0)} m` });
      }
    } finally { L.setAirport('royal'); }
    check('FIX4 #8 DEMAND TAKEOFF at the Palace Lawn: the F-35 goes straight up (no runway fits), the throne (240 m fits it) rolls, a jumbo is still refused', out.every((o) => o.ok), out.map((o) => o.d).join('; '));
  }
  // #7 short-field landing (runways < 500 m, the 240 m Palace Lawn): the AP's own circuit and a LAND both put the light
  // types down near the threshold and stop on the lawn (the Moth used to flare at 48 m, float to 239 m and go round)
  {
    const L = await import('../js/world/layout.js'), { KINGDOM } = await import('../data/airports/kingdom.js');
    const { planLandAhead, setLandAircraft } = await import('../js/assist/landahead.js');
    for (const d of Object.values(KINGDOM)) L.registerAirport(d);
    L.setAirport('palace');
    const out = [];
    try {
      for (const type of ['tiger', 'cub', 'bathtub', 'throne']) for (const END of L.RUNWAYS[0].ends) for (const land of [false, true]) {
        setLandAircraft(type);
        const tr = new Traffic(env), ac = new Aircraft({ type }), ap = new Autopilot(ac), e = runwayEnd(END), [x, z] = fromRunway(e, 12, 0);
        ac.place({ x, z, heading: e.hdg }, env); tr.add({ aircraft: ac, ap, player: land, name: 'P' }); ap.setRoute(circuitRoute(END, { type }));
        let t = 0, td = null, ga = 0, bad = null, maxS = -1e9, ee = e;
        const step = (stop) => { for (; t < 420; t += 1 / 60) { tr.update(1 / 60); for (const ev of ac.events.splice(0)) { if (ev.type === 'touchdown' && td == null && t > 30) td = toRunwayS(ee, ac); if (ev.type === 'crash') bad = ev.reason; } for (const ev of ap.events.splice(0)) if (ev.type === 'goaround') ga++; if (td != null && maxS === -1e9 && ac.speed < 9) maxS = toRunwayS(ee, ac); if (bad || stop()) return; } };
        step(() => ap.phase === 'DOWNWIND');
        if (land) { for (let k = 0; k < 600; k++) tr.update(1 / 60); const p = planLandAhead({ pos: ac.pos, vel: ac.vel, heading: ac.heading, altitude: ac.alt, onGround: false, world: env, layout: L }); if (p.fail) { out.push({ ok: false, d: `${type} ${END} LAND ${p.fail}` }); continue; } ap.landAt(p); ee = runwayEnd(p.runway); }
        step(() => td != null && maxS > -1e9);
        out.push({ ok: !bad && !ga && td != null && td > 0 && td < 80 && maxS < ee.len, d: `${type} ${land ? 'LAND→' + ee.id : END} td ${td?.toFixed(0)} stop ${maxS.toFixed(0)} ga ${ga}${bad ? ' ' + bad : ''}` });
      }
    } finally { L.setAirport('royal'); setLandAircraft(null); }
    check('FIX4 #7 short-field landing on the 240 m lawn: circuit and LAND touch down 0–80 m in and are down to taxi speed (9 m/s, AP landed) on it, no go-around (Moth, Cub, Bathtub, Throne)', out.every((o) => o.ok), out.map((o) => o.d).join('; '));
  }
  // #5 js/map/index.js warmShaders (the swap's shader warm-up): a material disposed while it is still compiling must not
  // throw from the poll's timer ("reading 'isReady'" in three.module), and the poll must end. The fake renderer's
  // compileAsync is three r180's poll, verbatim in substance, for the falsify run (FIX4_WARM=three).
  {
    const { register } = await import('node:module'), { pathToFileURL } = await import('node:url'), path = await import('node:path');
    const three = pathToFileURL(path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../lib/three/0.180.0/three.module.js')).href;
    register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s, c, n) { if (s === 'three') return { url: ${JSON.stringify(three)}, shortCircuit: true }; return n(s, c); }`));
    const { warmShaders } = await import('../js/map/index.js');
    const props = new Map(), get = (m) => { if (!props.has(m)) props.set(m, {}); return props.get(m); };
    const mats = [1, 2, 3].map((i) => ({ id: i }));
    let readyAt = Infinity;
    for (const m of mats) props.set(m, { currentProgram: { isReady: () => Date.now() > readyAt } });
    const R = {
      properties: { get },
      compile: () => new Set(mats),
      compileAsync(sc, cam) {   // three r180 WebGLRenderer.compileAsync's poll
        const ms = this.compile(sc, cam);
        return new Promise((resolve) => { const chk = () => { ms.forEach((m) => { if (get(m).currentProgram.isReady()) ms.delete(m); }); if (ms.size === 0) return resolve(sc); setTimeout(chk, 10); }; chk(); });
      },
    };
    const warm = process.env.FIX4_WARM === 'three' ? (r, s, c, o) => Promise.race([r.compileAsync(s, c), new Promise((res) => setTimeout(res, o.capMs))]) : warmShaders;
    const errs = [], onErr = (e) => errs.push(e.message);
    process.on('uncaughtException', onErr);
    let gen = 0;
    const res = await warm(R, {}, {}, { capMs: 120, cancelled: () => gen !== 0 });   // still compiling at the cap
    props.delete(mats[1]);   // the next swap's world.dispose() frees one of them
    await new Promise((r) => setTimeout(r, 150));
    gen++; readyAt = 0;
    const res2 = await warm(R, {}, {}, { capMs: 500 }).catch((e) => { errs.push('rejected: ' + e.message); return false; });   // a later swap, everything compiles
    await new Promise((r) => setTimeout(r, 50));
    process.off('uncaughtException', onErr);
    // #9 a trip between airports sharing one world (royal → palace): a tower handover ~1.5 km out, no clouds, no teleport
    {
      const L = await import('../js/world/layout.js'), M = await import('../js/map/index.js'), { AI_JETS } = await import('../js/flight/attract.js');
      const stub = () => new Proxy(function () {}, { get: (t, k) => (k in t ? t[k] : (t[k] = k === 'hidden' ? true : k === 'style' || k === 'dataset' ? {} : k === 'textContent' || k === 'innerHTML' ? '' : stub())), set: (t, k, v) => { t[k] = v; return true; }, apply: () => stub() });
      const g = globalThis, saved = { document: g.document, window: g.window, innerWidth: g.innerWidth, innerHeight: g.innerHeight };
      Object.assign(g, { document: stub(), window: {}, innerWidth: 390, innerHeight: 844 });
      g.document.getElementById = () => null; g.document.querySelector = () => null;
      L.setAirport('royal');
      const tr = new Traffic(env), ac = new Aircraft({ type: 'tiger' }), ap = new Autopilot(ac), P = tr.add({ aircraft: ac, ap, player: true, name: 'P' });
      const pal = M.sameWorld && (await import('../data/airports/kingdom.js')).KINGDOM.palace;
      ac.place({ x: 0, z: 0, alt: 300, heading: 0, speed: 45, throttle: 0.6 }, env); ap.setRoute(circuitRoute('27', { type: 'tiger' }));
      const S = { player: P, playMode: 'free', type: 'tiger' }, logs = [];
      let placed = 0;
      const K = M.createKingdom({ S, overlay: stub(), scene: { fog: { density: 1 } }, renderer: { info: { memory: {} }, compile: () => new Set(), properties: { get: () => ({}) } },
        camera: {}, env, attract: { ai: [], despawn() {}, async start() {} }, traffic: tr, hud: { flash() {} }, log: (t, d) => logs.push(t),
        wiring: { setWorld() {}, setTower() {}, activeEnd: () => L.RUNWAYS[0].ends[0], link: { placed() {} } },
        getWorld: () => ({ dispose() {} }), buildWorld: async () => ({}), adoptWorld() {}, placePlayer: () => { placed++; }, anchor: () => null });
      K.trip('palace', {});
      K.frame(0.1); const far = K.state().phase;                     // 2 km out: nothing yet
      const [tx, tz] = pal.center; ac.place({ x: tx, z: tz + 1200, alt: 300, heading: 0, speed: 45, throttle: 0.6 }, env);
      const x0 = ac.pos.x;
      for (let k = 0; k < 4; k++) K.frame(0.1);
      for (let k = 0; k < 60 && K.state().airport !== 'palace'; k++) await new Promise((r) => setTimeout(r, 50));
      for (let k = 0; k < 40 && K.state().phase; k++) { await new Promise((r) => setTimeout(r, 50)); K.frame(0.1); }
      const st = K.state(), ok9 = far == null && st.airport === 'palace' && !logs.includes('mapClouds') && ac.pos.x === x0 && !placed && ap.route?.name?.startsWith('arrival') && AI_JETS.chance === 0;
      L.setAirport('royal'); Object.assign(g, saved);
      check('FIX4 #9 royal → Palace Lawn trip: tower handover within 1.5 km, no clouds, no teleport, arrival route, no AI jets', ok9,
        `at 2 km phase ${far}; then airport ${st.airport}, clouds ${logs.includes('mapClouds')}, moved ${ac.pos.x !== x0}, placePlayer ${placed}, route ${ap.route?.name}, jets ${AI_JETS.chance}`);
    }
    check('FIX4 #5 swap shader warm-up: a material disposed mid-compile does not throw from the poll, and the poll stops at its cap', !errs.length && res !== true && !!res2,
      `first ${res}, second ${res2}; uncaught: ${errs.join(' | ') || 'none'}`);
  }
}

// FLIGHTFIX5 (manager verify): node tools/flight-sim.mjs fix5
// #3 loop c172-easy "DEMAND IT greyed 'Land nearer a runway'": the player's LAND on final (which refuses the tower's
// go-around) flew into a slower plane ahead on the same final; on Easy the rubber bounce dropped it on the grass ~760 m
// short, where the LAND rollout stayed down and went DONE. The player's see-and-avoid on final was jets-only.
async function scFix5() {
  const { planLandAhead } = await import('../js/assist/landahead.js');
  const L = await import('../js/world/layout.js');
  const tg = Math.tan(4 * Math.PI / 180), bad = [];
  let n = 0;
  for (const ty of ['tiger', 'bathtub', 'cub']) for (const gap of [150, 300, 500]) {
    const tr = new Traffic(env), e = runwayEnd('27');
    const A = new Aircraft({ type: ty }), [ax, az] = fromRunway(e, -1661 + gap, 0);
    A.place({ x: ax, z: az, alt: Math.max(4, (1661 - gap + 130) * tg), heading: 270, speed: TYPES[ty]?.vapp ?? 30, throttle: 0.3, flaps: 1 }, env);
    const aa = new Autopilot(A); tr.add({ aircraft: A, ap: aa, name: 'AI' }); aa.setRoute(arrivalRoute('27', { type: ty, stand: 'auto' })); aa.replan();
    const C = new Aircraft({ type: 'c172' }), [cx, cz] = fromRunway(e, -1661, 0);
    C.place({ x: cx, z: cz, alt: 122, heading: 270, speed: 65 * KT, throttle: 0.4, flaps: 1 / 3 }, env);
    const ca = new Autopilot(C); tr.add({ aircraft: C, ap: ca, name: 'P', player: true }); ca.setRoute(circuitRoute('27')); ca.replan();
    ca.landAt(planLandAhead({ pos: C.pos, vel: C.vel, heading: C.heading, altitude: C.alt, world: env, layout: L, type: 'c172' }));
    let minD = 1e9;
    for (let t = 0; t < 150 && !C.crashed && !A.crashed; t += 1 / 60) {
      tr.update(1 / 60);
      if (!C.onGround || !A.onGround) minD = Math.min(minD, Math.hypot(A.pos.x - C.pos.x, A.pos.y - C.pos.y, A.pos.z - C.pos.z));
    }
    n++;
    if (C.crashed || A.crashed || minD < 30) bad.push(`${ty} ${gap} m ahead: closest ${minD.toFixed(0)} m${C.crashed ? ', ' + C.crashReason : ''}`);
  }
  check('FIX5 #3 the player on LAND (C172) never flies into a slower plane ahead on the same final (Tiger/Bathtub/Cub, 150–500 m ahead)', !bad.length, bad.join(' | ') || `${n} cases, all ≥ 30 m apart in the air`);
  // #1 loop jumbo-hard "DEMAND TAKEOFF: airborne again: not within 300 s": a jumbo DEMAND leaving its heavy spot (S4) for
  // 09 met a C172 from S1/S2 coming down taxiway A for 27; the jumbo's CG was 16 m off A (not "on" the C172's path), each
  // held for the other at 0 kt. Head-on stretches now go to whoever reaches them first; the other waits body-clear.
  {
    const { aiSpawn, heavySpot } = await import('../js/flight/routes.js');
    const stuck = [];
    let runs = 0;
    for (const st of ['S1', 'S2', 'S3']) for (const wait of [22, 26, 30, 34]) {
      const tr = new Traffic(env), hv = heavySpot('S4');
      const J = new Aircraft({ type: 'jumbo' }); J.place({ x: hv.x, z: hv.z, heading: hv.heading }, env);
      const ja = new Autopilot(J); tr.add({ aircraft: J, ap: ja, name: 'P', player: true }); ja.setRoute(circuitRoute('09')); tr.claimStand(J, 'S4');
      const sp = aiSpawn('parked', '27', { stand: st, wait, type: 'c172', rnd: () => 0.3 });
      const A = new Aircraft({ type: 'c172' }); A.place(sp.place, env); const aa = new Autopilot(A); tr.add({ aircraft: A, ap: aa, name: 'AI' }); aa.setRoute(sp.route);
      ja.demandTakeoff({ prefer: '09' });
      let air = false, t = 0;
      for (; t < 300 && !air && !J.crashed && !A.crashed; t += 1 / 60) { tr.update(1 / 60); air = !J.onGround; }
      runs++;
      if (!air || J.crashed || A.crashed) stuck.push(`C172 from ${st} after ${wait} s: ${J.crashed ? J.crashReason : `jumbo at ${J.pos.x.toFixed(0)},${J.pos.z.toFixed(0)} ${ja.phase} ${J.gs.toFixed(1)} m/s, C172 ${aa.phase}`}`);
    }
    check('FIX5 #1 a jumbo DEMAND TAKEOFF from its heavy spot and a C172 heading the other way down taxiway A: no standoff, no bump, airborne within 300 s', !stuck.length, stuck.slice(0, 3).join(' | ') || `${runs} runs`);
  }
}

// FLIGHTFIX6 (manager verify, loop suite): node tools/flight-sim.mjs fix6
// #C/#A2 the player's LAND ran into a plane that had just landed ahead (jumbo "bumped into K-HECT", F-35 "bumped into
// K-PLUM"): no look at the strip ahead after touchdown, a land-long aimed past where that plane was (not where it would
// stop), and a LAND go-around for traffic ahead rejoined the same final the next frame (thousands of go-arounds, flying
// on into the plane ahead). #B a wreck hung where it crashed (5 m up after a Rubber bounce series).
async function scFix6() {
  const { planLandAhead } = await import('../js/assist/landahead.js');
  const L = await import('../js/world/layout.js');
  const tg = Math.tan(3.2 * Math.PI / 180), bad = [], spam = [];
  let n = 0;
  for (const pt of ['c172', 'tiger', 'jumbo', 'f35']) for (const at of ['c172', 'tiger', 'bathtub', 'herc']) for (const gap of [250, 500, 900, 1400, 2000]) {
    const tr = new Traffic(env), e = runwayEnd('27'), pd = AIRCRAFT[pt]?.flight?.jet || TYPES[pt].jet ? 4500 : 2200;
    const A = new Aircraft({ type: at }), [ax, az] = fromRunway(e, -pd + gap, 0);
    A.place({ x: ax, z: az, alt: Math.max(4, (pd - gap + 130) * tg), heading: 270, speed: TYPES[at]?.vapp ?? 30, throttle: 0.3, flaps: 1 }, env);
    const aa = new Autopilot(A); tr.add({ aircraft: A, ap: aa, name: 'AI' }); aa.setRoute(arrivalRoute('27', { type: at, stand: 'auto' })); aa.replan();
    const C = new Aircraft({ type: pt }), [cx, cz] = fromRunway(e, -pd, 0);
    C.place({ x: cx, z: cz, alt: (pd + 130) * tg, heading: 270, speed: TYPES[pt].vapp * 1.05, throttle: 0.5, flaps: 2 / 3 }, env);
    const ca = new Autopilot(C); tr.add({ aircraft: C, ap: ca, name: 'P', player: true }); ca.setRoute(circuitRoute('27', { type: pt })); ca.replan();
    ca.landAt(planLandAhead({ pos: C.pos, vel: C.vel, heading: C.heading, altitude: C.alt, world: env, layout: L, type: pt }));
    let hit = null, ga = 0, stopped = false;
    for (let t = 0; t < 600 && !hit && !stopped; t += 1 / 60) {
      tr.update(1 / 60);
      for (const ev of C.events.splice(0)) if (ev.type === 'collision' || ev.type === 'crash') hit ||= `${ev.reason || ev.type} at ${t.toFixed(0)} s (${ca.phase})`;
      for (const ev of ca.events.splice(0)) if (ev.type === 'goaround') ga++;
      stopped = ca.done && C.gs < 0.5;
    }
    n++;
    if (hit || !stopped) bad.push(`${pt} behind ${at} ${gap} m: ${hit || `not stopped in 600 s (${ca.phase})`}`);
    if (ga > 4) spam.push(`${pt} behind ${at} ${gap} m: ${ga} go-arounds`);
  }
  check('FIX6 #C player LAND (C172/Tiger/Jumbo/F-35) behind a plane landing ahead (C172/Tiger/Bathtub/Herc, 250–2000 m): no contact, stopped within 600 s', !bad.length, bad.slice(0, 4).join(' | ') || `${n} runs`);
  check('FIX6 #C a LAND go-around never loops straight back onto the same final (≤ 4 go-arounds per approach)', !spam.length, spam.slice(0, 4).join(' | ') || `${n} runs`);
  // #D loop f35-medium "DEMAND IT: AP done and stopped on grass": LAND gone round for an occupied runway landed long
  // with 633 m left (any landing needs ≥ 450 m), the F-35's book landing roll is 700 m: off the end onto the grass
  {
    const off = [], notDown = [];
    for (const pt of ['c172', 'tiger', 'f35', 'herc']) for (const sPark of [250, 400, 550]) {
      const tr = new Traffic(env), e = runwayEnd('27'), jet = !!TYPES[pt].jet, pd = jet ? 4500 : 2200;
      const B = new Aircraft({ type: 'c172' }), [bx, bz] = fromRunway(e, sPark, 0);
      B.place({ x: bx, z: bz, heading: 270 }, env); tr.add({ aircraft: B, name: 'PARKED' });
      const C = new Aircraft({ type: pt }), [cx, cz] = fromRunway(e, -pd, 0);
      C.place({ x: cx, z: cz, alt: (pd + 130) * tg, heading: 270, speed: TYPES[pt].vapp * 1.05, throttle: 0.5, flaps: 2 / 3 }, env);
      const ca = new Autopilot(C); tr.add({ aircraft: C, ap: ca, name: 'P', player: true }); ca.setRoute(circuitRoute('27', { type: pt })); ca.replan();
      ca.landAt(planLandAhead({ pos: C.pos, vel: C.vel, heading: C.heading, altitude: C.alt, world: env, layout: L, type: pt }));
      let stopped = false, hit = null;
      for (let t = 0; t < 420 && !stopped && !hit; t += 1 / 60) {
        tr.update(1 / 60);
        for (const ev of C.events.splice(0)) if (ev.type === 'collision' || ev.type === 'crash') hit = ev.reason || ev.type;
        ca.events.length = 0;
        stopped = ca.done && C.gs < 0.5;
      }
      if (hit || (stopped && !onRunway(C.pos.x, C.pos.z, 0))) off.push(`${pt}, plane parked ${sPark} m in: ${hit || `stopped off the runway at ${C.pos.x.toFixed(0)},${C.pos.z.toFixed(0)}`}`);
      if (!jet && !stopped) notDown.push(`${pt} ${sPark}`);
    }
    check('FIX6 #D LAND past a plane parked on the runway never lands long into an overrun (F-35/Herc need their landing roll) and never hits it', !off.length, off.slice(0, 4).join(' | ') || '12 runs');
    check('FIX6 #D … and the light types still land long past it within 420 s (FLIGHTFIX3)', !notDown.length, notDown.join(', ') || 'C172, Tiger × 3');
  }
  // #E loop cub/bathtub-hard "field LAND: touchdown not within 240 s": LAND on 04's final went round for "traffic ahead"
  // twice; the see-and-avoid read any plane within 150 m of the final's line, ≤ 90 m up or down, as on our final.
  // Traffic crossing 55 m above (or below) is not a collision course; one crossing at our height still is.
  {
    const wrong = [];
    // the player on final for 04 (its own circuit approach); a plane flying straight across that final (kinematic, 50 m/s
    // westbound) timed to cross where the player is at 15 s, dy above it
    const final04 = (pt, crosser) => {
      const tr = new Traffic(env), e = runwayEnd('04');
      const C = new Aircraft({ type: pt }), [cx, cz] = fromRunway(e, -1500, 0);
      C.place({ x: cx, z: cz, alt: (1500 + 130) * Math.tan(3 * Math.PI / 180), heading: e.hdg, speed: TYPES[pt].vapp, throttle: 0.4, flaps: 2 / 3 }, env);
      const ca = new Autopilot(C); tr.add({ aircraft: C, ap: ca, name: 'P', player: true }); ca.setRoute(circuitRoute('04', { type: pt })); ca.replan();
      if (crosser) {
        const A = new Aircraft({ type: 'c172' });
        A.place({ x: crosser.x + 50 * 15, z: crosser.z, alt: crosser.alt, heading: 270, speed: 50, throttle: 0.75 }, env);
        A.vel.set(-50, 0, 0); A.step = function (dt) { this.prevPos.copy(this.pos); this.pos.addScaled(this.vel, dt); this.time += dt; this._derive(env); };
        tr.add({ aircraft: A, name: 'X' });
      }
      let ga = false, at15 = null;
      for (let t = 0; t < 25; t += 1 / 60) {
        tr.update(1 / 60); C.events.length = 0;
        for (const ev of ca.events.splice(0)) if (ev.type === 'goaround' && ev.reason === 'traffic ahead') ga = true;
        if (!at15 && t >= 15) at15 = { x: C.pos.x, z: C.pos.z, alt: C.alt };
      }
      return { ga, at15 };
    };
    for (const pt of ['cub', 'bathtub', 'c172']) for (const [dy, want] of [[55, false], [-50, false], [3, true]]) {
      const p15 = final04(pt).at15, { ga } = final04(pt, { ...p15, alt: p15.alt + dy });
      if (ga !== want) wrong.push(`${pt} vs crossing ${dy > 0 ? '+' : ''}${dy} m: ${ga ? 'went round' : 'carried on'}`);
    }
    check('FIX6 #E the player\'s see-and-avoid on final goes round for a collision course only (crossing 50 m above/below: carry on; at our height: go round)', !wrong.length, wrong.join(' | ') || '9 runs');
  }
  // #B (what crashed the Tiger in both tiger-medium field LANDs, at x ≈ −1930 by the River Krumble): LAND NOW from the
  // climb-out met its field fast (66 kt, Vapp 55) with ~430 m left; tail up = no brakes; it rolled on into the river
  // bank (tail/wingtip strikes, a Medium bounce chain to DESTROYED). Reproduced live (real world), then here.
  {
    const { fakeWorld, layout: LY } = await import('../js/assist/test/fakeworld.mjs');
    const { armLandNow } = await import('../js/assist/landahead.js');
    const RX = -1970, base = fakeWorld();
    const W = { ...base, groundHeightAt: () => 0, surfaceAt: (x, z) => (Math.abs(x - RX) < 20 ? 'water' : base.surfaceAt(x, z)), waterNear: (x, z, r) => Math.abs(x - RX) < 20 + r };
    const wenv = { groundHeightAt: W.groundHeightAt, surfaceAt: W.surfaceAt, colliders: base.colliders };
    const wet = [];
    for (const type of ['tiger', 'c172', 'cub', 'bathtub']) for (const [x0, alt, kt] of [[-1000, 60, 70], [-900, 90, 75], [-1100, 40, 65]]) {
      const tr = new Traffic(wenv), ac = new Aircraft({ type }), ap = new Autopilot(ac);
      ac.place({ x: x0, z: 0, alt, heading: 270, speed: kt * KT, throttle: 0.8, flaps: 0 }, wenv);
      ac.impactHandler = () => ({ result: 'bounce', restitution: 0.35 });
      tr.add({ aircraft: ac, ap, player: true, name: 'P' }); ap.setRoute(circuitRoute('27', { type })); ap.replan();
      armLandNow(); const p = planLandAhead({ pos: ac.pos, vel: ac.vel, heading: ac.heading, altitude: ac.alt, world: W, layout: LY, type });
      if (p.fail) { wet.push(`${type} from ${x0}: no plan (${p.fail})`); continue; }
      ap.landAt(p);
      const imp = [];
      for (let t = 0; t < 200 && !(ap.done && ac.gs < 0.5); t += 1 / 60) { tr.update(1 / 60); for (const ev of ac.events.splice(0)) if (ev.type === 'impact' || ev.type === 'crash') imp.push(ev.reason); ap.events.length = 0; }
      const past = (p.strip.end[0] - ac.pos.x) * Math.sign(p.strip.end[0] - p.touchdown[0]) < 0;
      if (imp.length || past || !ap.done) wet.push(`${type} from ${x0} m ${kt} kt: stopped at x ${ac.pos.x.toFixed(0)} (strip end ${p.strip.end[0].toFixed(0)}) ${imp.join()}`);
    }
    check('FIX6 #B a fast field arrival (LAND NOW from a climb-out) brakes to the strip it planned: stops inside it, never into the river beyond (Tiger/C172/Cub/Bathtub)', !wet.length, wet.join(' | ') || '12 runs');
  }
  // #B a wreck falls to the ground and rests there
  {
    const tr = new Traffic(env), ac = new Aircraft({ type: 'tiger' });
    ac.place({ x: 0, z: 2000, alt: 5, heading: 90, speed: 25, throttle: 0.3 }, env);
    tr.add({ aircraft: ac, name: 'W', player: true });
    ac._crash('test wreck');
    for (let t = 0; t < 3; t += 1 / 60) tr.update(1 / 60);
    const rest = ac.aglRef;
    check('FIX6 #B a wreck that crashed 5 m up falls to the ground within 3 s (it used to hang in the air)', Math.abs(ac.pos.y - rest) < 0.05, `CG ${ac.pos.y.toFixed(2)} m, rest ${rest.toFixed(2)} m`);
  }
}

function R1speed(type) { return Math.min(80 * KT, (TYPES[type]?.vcruise ?? 95 * KT) * 0.8); }

const S = { fix6: scFix6, fix5: scFix5, fix4: scFix4, minrun: scMinRun, fix3: scFix3, aaron: scAaron, loopext: scLoopExtend, throttle: scThrottleTakeback, landmany: scLandMany, feel: scPlayerFeel, spawn: scSpawn, impact: scImpact, fuel: scFuel, landat: scLandAt, ground: scGround, handback: scHandback, circuit: scCircuit, circuit27: () => scCircuit('27'), override: scOverride, cutin: scCutIn, stall: scStall, traffic: scTraffic, types: scTypes, typeoverride: scTypeOverride, typeground: scTypeGround, mixed: scMixed, jets: scJets, roster: scRoster };
for (const [k, f] of Object.entries(S)) if ((scen === 'all' && k !== 'mixed') || scen === k) { console.log(`\n== ${k}`); await f(); }
const fails = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);
