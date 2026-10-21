// Headless flight-core harness (no browser): node tools/flight-sim.mjs [scenario] [--trace]
// Scenarios: circuit | override | cutin | stall | taxi | traffic | all
import { Aircraft } from '../js/flight/aircraft.js';
import { Autopilot } from '../js/flight/autopilot.js';
import { Traffic } from '../js/flight/traffic.js';
import { circuitRoute, arrivalRoute, departureRoute, runwayEnd, onRunway, fromRunway, standInfo } from '../js/flight/routes.js';
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

function scCircuit() {
  const tr = new Traffic(env);
  const p = mk(tr, lined('09'), circuitRoute('09'), { name: 'P' });
  const log = run(tr, 600, (t) => !(p.ap.leg.kind === 'hold'));
  if (!TRACE) for (const l of log) console.log(JSON.stringify(l));
  const td = log.find((l) => l.type === 'touchdown');
  const landed = log.find((l) => l.type === 'landed');
  const crash = log.find((l) => l.type === 'crash');
  const maxAlt = Math.max(0, ...log.filter((l) => l.at).map((l) => +l.at.split(',')[1]));
  check('circuit: no crash', !crash, crash?.reason);
  check('circuit: touched down on 09', !!td && td.surface === 'runway' && !td.bounce, td && `${td.fpm} fpm ${td.grade} on ${td.surface}`);
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

const S = { circuit: scCircuit, override: scOverride, cutin: scCutIn, stall: scStall, traffic: scTraffic };
for (const [k, f] of Object.entries(S)) if (scen === 'all' || scen === k) { console.log(`\n== ${k}`); f(); }
const fails = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);
