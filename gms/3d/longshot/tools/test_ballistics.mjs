// node tools/test_ballistics.mjs — sanity-check drop, drift, solver, hits.
import { simulate, solve } from '../js/ballistics.js';

let fails = 0;
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name} ${extra}`);
  if (!cond) fails++;
};

const origin = { x: 0, y: 60, z: 0 };

// 1. flat-ish shot at 400m drops a sensible amount (0.5–6 m for 700 m/s)
{
  const res = simulate(origin, { x: 0, y: 0, z: 1 }, { v0: 700, groundY: -1e9, maxFlight: 3 });
  let at400 = res.path.find(p => p.z >= 400);
  const drop = 60 - at400.y;
  ok('drop@400m(700m/s)', drop > 0.5 && drop < 6, `drop=${drop.toFixed(2)}m tof≈${at400.t.toFixed(2)}s`);
}

// 2. crosswind pushes downwind, more at longer range
{
  const res = simulate(origin, { x: 0, y: 0, z: 1 }, { v0: 700, wind: { x: 6, z: 0 }, groundY: -1e9, maxFlight: 3 });
  const at300 = res.path.find(p => p.z >= 300), at600 = res.path.find(p => p.z >= 600);
  ok('drift direction', at300.x > 0.02, `drift300=${at300.x.toFixed(2)}m`);
  ok('drift grows', at600.x > at300.x * 2.2, `drift600=${at600.x.toFixed(2)}m`);
}

// 3. solver: aim correction lands within 15cm at 700m with wind
{
  const target = { x: 120, y: 1.6, z: 690 };
  const opts = { v0: 640, wind: { x: -4.5, z: 1.2 } };
  const sol = solve(origin, target, opts);
  const res = simulate(origin, sol.dir, { ...opts, groundY: -1e9, maxFlight: 6 });
  // interpolate the trajectory at the target's LOS range (samples are ~10m apart)
  const los = { x: target.x - origin.x, y: target.y - origin.y, z: target.z - origin.z };
  const rng2 = Math.hypot(los.x, los.y, los.z);
  const ln = { x: los.x / rng2, y: los.y / rng2, z: los.z / rng2 };
  let bd = 1e9;
  for (let j = 1; j < res.path.length; j++) {
    const a = res.path[j - 1], b = res.path[j];
    const aa = (a.x - origin.x) * ln.x + (a.y - origin.y) * ln.y + (a.z - origin.z) * ln.z;
    const bb = (b.x - origin.x) * ln.x + (b.y - origin.y) * ln.y + (b.z - origin.z) * ln.z;
    if (bb >= rng2) {
      const f = (rng2 - aa) / (bb - aa);
      const p = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f };
      bd = Math.hypot(p.x - target.x, p.y - target.y, p.z - target.z);
      break;
    }
  }
  ok('solver accuracy@700m', bd < 0.15, `miss=${bd.toFixed(3)}m drop=${sol.drop.toFixed(2)} drift=${sol.drift.toFixed(2)}`);
}

// 4. head + torso hits
{
  const people = [{
    person: { id: 1 },
    head: { c: { x: 0, y: 1.62, z: 300 }, r: 0.15 },
    torso: { a: { x: 0, y: 0.82, z: 300 }, b: { x: 0, y: 1.42, z: 300 }, r: 0.24 },
  }];
  const o2 = { x: 0, y: 1.62, z: 0 };
  const sol = solve(o2, { x: 0, y: 1.62, z: 300 }, { v0: 700 });
  const res = simulate(o2, sol.dir, { v0: 700, people, groundY: -10 });
  ok('headshot lands', res.hit.type === 'head', `hit=${res.hit.type}`);
  const sol2 = solve(o2, { x: 0, y: 1.1, z: 300 }, { v0: 700 });
  const res2 = simulate(o2, sol2.dir, { v0: 700, people, groundY: -10 });
  ok('torso lands', res2.hit.type === 'torso', `hit=${res2.hit.type}`);
}

// 5. building blocks the round
{
  const res = simulate(origin, { x: 0, y: -0.05, z: 1 }, {
    v0: 700, buildings: [{ minX: -20, maxX: 20, minZ: 200, maxZ: 240, h: 80 }], groundY: 0,
  });
  ok('building stops round', res.hit.type === 'building', `hit=${res.hit.type}`);
}

// 6. glass: FMJ deflects but continues; pane records broken
{
  const glass = [{ centre: { x: 0, y: 55, z: 200 }, nrm: { x: 0, y: 0, z: -1 }, w: 8, h: 4, broken: false }];
  const res = simulate(origin, { x: 0, y: -0.02, z: 1 }, { v0: 700, glass, groundY: 0, rng: () => 0.5 });
  ok('glass shatters', glass[0].broken && res.events.some(e => e.type === 'glass'));
  ok('round continues past glass', res.hit.type === 'ground', `hit=${res.hit.type}`);
}

// 7. subsonic drops far more than match ammo
{
  const a = simulate(origin, { x: 0, y: 0, z: 1 }, { v0: 700, groundY: -1e9, maxFlight: 4 });
  const b = simulate(origin, { x: 0, y: 0, z: 1 }, { v0: 700 * 0.62, groundY: -1e9, maxFlight: 4 });
  const dropA = 60 - a.path.find(p => p.z >= 350).y;
  const dropB = 60 - b.path.find(p => p.z >= 350).y;
  ok('subsonic drops more', dropB > dropA * 2, `fmj=${dropA.toFixed(2)} sub=${dropB.toFixed(2)}`);
}

// 8. MOVING targets: the world moves while the round is in the air, so aiming
//    AT a walker must miss and LEADING him must hit. (This is the whole game.)
{
  const o2 = { x: 0, y: 40, z: 0 };
  const tgt = { x: 0, y: 1.15, z: 400 };
  const vel = { x: 5, y: 0, z: 0 };                 // sprinting across the view
  const mkPeople = () => [{
    person: { id: 7 }, vel,
    head: { c: { x: tgt.x, y: 1.62, z: tgt.z }, r: 0.15 },
    torso: { a: { x: tgt.x, y: 0.82, z: tgt.z }, b: { x: tgt.x, y: 1.42, z: tgt.z }, r: 0.24 },
  }];
  // aim straight at him → he has run out of the way by the time it arrives
  const solDirect = solve(o2, tgt, { v0: 700 });
  const resDirect = simulate(o2, solDirect.dir, { v0: 700, people: mkPeople(), groundY: 0 });
  ok('shooting AT a runner misses', resDirect.hit.type !== 'head' && resDirect.hit.type !== 'torso',
    `hit=${resDirect.hit.type}`);
  // lead him by velocity × time of flight → hit
  let aim = { ...tgt };
  for (let i = 0; i < 3; i++) {
    const s = solve(o2, aim, { v0: 700 });
    aim = { x: tgt.x + vel.x * s.tof, y: tgt.y + vel.y * s.tof, z: tgt.z + vel.z * s.tof };
  }
  const solLead = solve(o2, aim, { v0: 700 });
  const resLead = simulate(o2, solLead.dir, { v0: 700, people: mkPeople(), groundY: 0 });
  ok('LEADING a runner hits', resLead.hit.type === 'head' || resLead.hit.type === 'torso',
    `hit=${resLead.hit.type} lead=${(vel.x * solLead.tof).toFixed(2)}m`);
}

console.log(fails ? `\n${fails} FAILURES` : '\nall ballistics tests pass');
process.exit(fails ? 1 : 0);
