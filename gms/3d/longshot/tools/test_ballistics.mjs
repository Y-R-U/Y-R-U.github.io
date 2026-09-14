// node tools/test_ballistics.mjs — sanity-check drop, drift, solver, hits.
import { simulate, solve, raycast } from '../js/ballistics.js';

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

// 11. carved rooms: a round reaches the man at the lit window, but a building
//     is NOT a tunnel — leave the room and you are in concrete. (Without the
//     back-wall test, a segment that starts inside an AABB reports no hit and
//     the round flies through the whole tower — and the sightline test then
//     calls a man on the NEXT street visible through two walls.)
{
  const o3 = { x: 0, y: 40, z: 0 };
  // a 30 m deep tower at z 200..230, with a 4 m room carved behind its facade
  const tower = { minX: -20, maxX: 20, minZ: 200, maxZ: 230, h: 60 };
  const room = { minX: -4, maxX: 4, minY: 33, maxY: 37, minZ: 199, maxZ: 204 };
  const at = (y, z) => ({ x: 0, y, z });
  const dirTo = (p) => {
    const d = { x: p.x - o3.x, y: p.y - o3.y, z: p.z - o3.z };
    const L = Math.hypot(d.x, d.y, d.z);
    return { x: d.x / L, y: d.y / L, z: d.z / L };
  };
  const manInRoom = [{
    person: { id: 1 },
    head: { c: at(36.4, 202), r: 0.15 },
    torso: { a: at(35.6, 202), b: at(36.2, 202), r: 0.24 },
  }];
  // the man at the window: reachable through the opening
  const hitRoom = raycast(o3, dirTo(at(35.9, 202)), { buildings: [tower], holes: [room] });
  ok('sightline reaches a man in a carved room',
    raycast(o3, dirTo(at(35.9, 202)), { buildings: [tower], holes: [room], people: manInRoom }).type !== 'building',
    `los=${raycast(o3, dirTo(at(35.9, 202)), { buildings: [tower], holes: [room], people: manInRoom }).type}`);
  ok('a round through the window kills him',
    ['head', 'torso'].includes(simulate(o3, dirTo(at(35.9, 202)), {
      v0: 700, buildings: [tower], holes: [room], people: manInRoom, groundY: 0,
    }).hit.type));
  // a man on the NEXT street, behind the tower, in line with that same window
  const behind = { x: 0, y: 1.6, z: 300 };
  ok('the tower still blocks the sightline behind it',
    raycast(o3, dirTo(behind), { buildings: [tower], holes: [room] }).type === 'building',
    `los=${raycast(o3, dirTo(behind), { buildings: [tower], holes: [room] }).type}`);
  const thru = simulate(o3, dirTo(behind), { v0: 700, buildings: [tower], holes: [room], groundY: 0 });
  ok('a round does not tunnel through the tower',
    thru.hit.type === 'building' && thru.hit.point.z < 231,
    `hit=${thru.hit.type} @z=${thru.hit.point.z.toFixed(1)}`);
  ok('room raycast reports the opening, not the facade', hitRoom.dist > 195, `dist=${hitRoom.dist.toFixed(1)}`);
}

// 12. raycast never reports a hit past the caller's `max`. losFrom() asks for
//     `dist - 1.5` and treats anything but 'none' as a blocker, so a room's own
//     back wall returned beyond `max` called every man-at-a-window blind.
{
  const tower = { minX: -15, maxX: 15, minZ: 190, maxZ: 220, h: 60 };
  const room = { minX: -6, maxX: 6, minY: 14, maxY: 20, minZ: 188, maxZ: 197 };
  const eye = { x: 0, y: 17, z: 0 };
  const fwd = { x: 0, y: 0, z: 1 };
  const near = raycast(eye, fwd, { buildings: [tower], holes: [room], groundY: -5, max: 191.5 });
  ok('raycast respects max at a carved room',
    near.type === 'none' && near.dist <= 191.5 + 1e-6,
    `type=${near.type} dist=${near.dist.toFixed(2)} max=191.5`);
  // and the back wall is still found when the caller asks far enough
  const far = raycast(eye, fwd, { buildings: [tower], holes: [room], groundY: -5, max: 400 });
  ok('the room back wall still blocks a longer look',
    far.type === 'building' && far.dist > 195 && far.dist < 200,
    `type=${far.type} dist=${far.dist.toFixed(2)}`);
  // never past max, for any max, in either direction
  let over = 0;
  for (let m = 150; m <= 400; m += 0.5) {
    const rc = raycast(eye, fwd, { buildings: [tower], holes: [room], groundY: -5, max: m });
    if (rc.dist > m + 1e-6) over++;
  }
  ok('raycast never overruns max', over === 0, `overruns=${over}/501`);
}

// 13. the capsule test does not depend on step length. 9 fixed samples per step
//     space out by v/1920 m, so above ~920 m/s they straddle a 0.48 m torso and
//     the Meridian (v0 980) dropped dead-centre body shots.
{
  const V0 = [700, 730, 760, 800, 850, 900, 980];
  let miss = 0, tot = 0, worst = null;
  for (const v0 of V0) {
    let s = 12345;
    const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    let m0 = 0;
    for (let i = 0; i < 900; i++) {
      // the gap only opens while the round is still above ~920 m/s — the first
      // ~120 m of a Meridian's flight — so sample that band hard
      const R = i < 600 ? 40 + rnd() * 100 : 140 + rnd() * 460;
      const org = { x: 0, y: 1.12, z: 0 };
      const aim = { x: 0, y: 1.12, z: R };
      const man = [{
        person: { id: 2 },
        head: { c: { x: 0, y: 1.62, z: R }, r: 0.15 },
        torso: { a: { x: 0, y: 0.82, z: R }, b: { x: 0, y: 1.42, z: R }, r: 0.24 },
      }];
      const sol = solve(org, aim, { v0 });
      const res = simulate(org, sol.dir, { v0, people: man, groundY: -1000 });
      tot++;
      if (res.hit.type !== 'torso' && res.hit.type !== 'head') { miss++; m0++; }
    }
    if (m0 && !worst) worst = v0;
  }
  ok('no centre-mass hits lost at any muzzle velocity', miss === 0,
    `missed=${miss}/${tot}${worst ? ' first at v0=' + worst : ''}`);
}

console.log(fails ? `\n${fails} FAILURES` : '\nall ballistics tests pass');
process.exit(fails ? 1 : 0);
