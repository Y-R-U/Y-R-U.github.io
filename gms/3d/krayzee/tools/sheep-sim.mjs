#!/usr/bin/env node
// C5 sheep scatter gate (node, js/world/flock.js on Muckle Bottom's real flock data).
//   node tools/sheep-sim.mjs [--quiet]
//   node tools/sheep-sim.mjs --falsify=deaf|ceiling|fence   breaks the flock on purpose: the run must go red
//     deaf    = planes never scare sheep        ceiling = the altitude limit is gone (sheep bolt from a 300 m pass)
//     fence   = the field clamp is gone (sheep can run onto the strip)
import FARM from '../data/airports/farm.js';
import { createFlocks, SHEEP } from '../js/world/flock.js';
import { headingToVec } from '../js/world/layout.js';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { ok ? pass++ : fail++; if (!ok || !args.quiet) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  · ' + detail : ''}`); };

const axes = (h = 0) => [headingToVec(90 + h), headingToVec(180 + h)];   // same as js/world/site.js
const fields = FARM.props.filter((p) => p.kind === 'flock' && p.type === 'sheep').map((r) => {
  const [u, v] = axes(r.heading);
  return { cx: r.center[0], cz: r.center[2], u, v, a: r.size[0] / 2, b: r.size[1] / 2, count: r.count };
});
const cfg = {};
if (args.falsify === 'deaf') { cfg.airR = [0, 0]; cfg.groundR = [0, 0]; }
if (args.falsify === 'ceiling') cfg.ceiling = 1e6;
if (args.falsify === 'fence') cfg.fence = false;
const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function make(seed = 7) {
  const F = createFlocks(fields, { rnd: rng(seed), cfg });
  const bleats = [];
  F.onBleat = (b) => bleats.push(b);
  return { F, bleats };
}
// a plane flying a straight line over (x, z) at a fixed AGL, heading h, speed kt; returns sheep displacement data
function pass_(F, { x, z, agl, h = 250, kt = 80, onGround = false, len = 1600, player = true }) {
  const [dx, dz] = headingToVec(h), sp = kt * 0.5144, dt = 1 / 30;
  const before = F.sheep.map((s) => [s.x, s.z]);
  let minD = F.sheep.map(() => Infinity), closest = F.sheep.map(() => null);
  for (let d = -len / 2; d <= len / 2; d += sp * dt) {
    const p = { x: x + dx * d, z: z + dz * d, agl, gs: sp, onGround, id: 'p', player };
    F.update(dt, [p], { x: p.x, z: p.z });
    F.sheep.forEach((s, i) => { const dd = Math.hypot(s.x - p.x, s.z - p.z); if (dd < minD[i]) { minD[i] = dd; closest[i] = [p.x, p.z]; } });
  }
  for (let i = 0; i < 30 * 3; i++) F.update(1 / 30, [], null);
  return F.sheep.map((s, i) => {
    const [bx, bz] = before[i], moved = Math.hypot(s.x - bx, s.z - bz);
    // away = the sheep ended further from the plane's closest point than it started
    const [cx, cz] = closest[i];
    return { moved, away: Math.hypot(s.x - cx, s.z - cz) - Math.hypot(bx - cx, bz - cz) };
  });
}
const south = fields[0], east = fields[1];
const R = Math.round;

// 1. low pass over the south pasture, along its long axis
{
  const { F, bleats } = make();
  const r = pass_(F, { x: south.cx, z: south.cz, agl: 15, h: (FARM.runways[0].heading + 180) % 360, len: 700 });
  const mine = r.filter((_, i) => F.sheep[i].f.k === 0), ran = mine.filter((m) => m.moved > 6);
  check('low pass (15 m AGL) over the south pasture: most of its flock bolts', ran.length >= mine.length * 0.7, `${ran.length}/${mine.length} moved > 6 m`);
  check('  … and they run AWAY from the plane', ran.length && ran.filter((m) => m.away > 3).length >= ran.length * 0.8, `${ran.filter((m) => m.away > 3).length}/${ran.length} ended further away`);
  check('  … and a bleat plays', bleats.some((b) => b.scatter), `${bleats.filter((b) => b.scatter).length} scatter bleats`);
  check('  … sheep in the far fields stay calm', F.sheep.filter((s) => s.f.k !== 0).every((s) => !s.scares), `${F.sheep.filter((s) => s.f.k !== 0 && s.scares).length} scared`);
}
// 2. the same pass at 300 m and at 70 m: nothing
for (const agl of [300, 70]) {
  const { F, bleats } = make();
  const r = pass_(F, { x: south.cx, z: south.cz, agl, h: (FARM.runways[0].heading + 180) % 360 });
  const max = Math.max(...r.map((m) => m.moved));
  check(`pass at ${agl} m AGL: no sheep bolts, no scatter bleat`, !bleats.some((b) => b.scatter) && F.state.scared === 0, `scared ${F.state.scared}, max grazing drift ${max.toFixed(1)} m`);
}
// 3. a landing on 25: the final over the east field, then the roll down the strip
{
  const { F, bleats } = make();
  const rw = FARM.runways[0], [hx, hz] = headingToVec(rw.heading);
  // 3° glide to the 25 threshold (east end), starting 1.2 km out
  const thr = [rw.center[0] - hx * rw.length / 2 * -1, rw.center[2] - hz * rw.length / 2 * -1];
  const dt = 1 / 30;
  for (let d = 1200; d > 0; d -= 30 * dt) {
    const p = { x: thr[0] + -hx * -d, z: thr[1] + -hz * -d, agl: d * Math.tan(3 * Math.PI / 180), gs: 30, onGround: false, id: 'p', player: true };
    F.update(dt, [p], p);
  }
  const eastScared = F.sheep.filter((s) => s.f.k === 1 && (s.mode === 1 || Math.hypot(s.x - s.hx, s.z - s.hz) > 3)).length;
  check('landing on 25: the final scatters the east field', eastScared >= 5, `${eastScared}/${east.count}`);
  check('  … with a bleat', bleats.some((b) => b.scatter && b.flock === 1));
}
// 4. taxiing slowly / parked does nothing; a parked plane right beside a flock does nothing
{
  const { F } = make();
  pass_(F, { x: south.cx, z: south.cz, agl: 0, onGround: true, kt: 3 });
  check('a plane crawling < 4 m/s next to a flock scares nobody', F.state.scared === 0, `scared ${F.state.scared}`);
}
// 5. a soak: random low passes everywhere; no sheep ever leaves its field or reaches the strip / taxiways
{
  const { F } = make(11);
  const rnd = rng(99), rw = FARM.runways[0], [hx, hz] = headingToVec(rw.heading);
  let worst = 0, outField = 0, onStrip = 0;
  const strip = (x, z) => { const dx = x - rw.center[0], dz = z - rw.center[2]; return Math.abs(dx * hx + dz * hz) < rw.length / 2 + 30 && Math.abs(-dx * hz + dz * hx) < rw.width / 2 + 25; };
  const taxi = FARM.taxiways.flatMap((t) => t.points.slice(1).map((b, i) => [t.points[i], b]));
  const segD = (x, z, [a, b]) => { const vx = b[0] - a[0], vz = b[1] - a[1], L2 = vx * vx + vz * vz; const t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (z - a[1]) * vz) / L2)); return Math.hypot(x - a[0] - vx * t, z - a[1] - vz * t); };
  let minTaxi = Infinity;
  for (let k = 0; k < 60; k++) {
    const f = fields[Math.floor(rnd() * fields.length)];
    pass_(F, { x: f.cx + (rnd() - 0.5) * 2 * f.a, z: f.cz + (rnd() - 0.5) * 2 * f.b, agl: rnd() * 40, h: rnd() * 360, kt: 50 + rnd() * 60, len: 900 });
    for (const s of F.sheep) {
      if (!F.inField(s)) outField++;
      if (strip(s.x, s.z)) onStrip++;
      minTaxi = Math.min(minTaxi, ...taxi.map((sg) => segD(s.x, s.z, sg)));
      worst = Math.max(worst, Math.hypot(s.x - s.hx, s.z - s.hz));
    }
  }
  check('soak (60 random low passes): every sheep stays in its field', !outField, `${outField} out-of-field samples, furthest from home ${R(worst)} m`);
  check('  … never on the strip (runway + 25 m)', !onStrip, `${onStrip} samples`);
  check('  … never within 30 m of a taxiway', minTaxi > 30, `closest ${R(minTaxi)} m`);
  // and they come home: a long quiet graze afterwards pulls the flock back together
  const far0 = F.sheep.filter((s) => Math.hypot(s.x - s.hx, s.z - s.hz) > 15).length;
  for (let i = 0; i < 30 * 240; i++) F.update(1 / 30, [], null);
  const far1 = F.sheep.filter((s) => Math.hypot(s.x - s.hx, s.z - s.hz) > 15).length;
  check('  … then settle and graze back home (4 min quiet)', F.state.fleeing === 0 && far1 <= Math.max(2, far0 * 0.3), `${far0} → ${far1} sheep > 15 m from home`);
}
// 6. cost: one update of all sheep with 6 planes around
{
  const { F } = make();
  const planes = Array.from({ length: 6 }, (_, i) => ({ x: south.cx + i * 40, z: south.cz, agl: 20, gs: 40, onGround: false, id: i, player: !i }));
  const t0 = performance.now(), N = 3000;
  for (let i = 0; i < N; i++) { planes.forEach((p) => { p.x += 1; }); F.update(1 / 60, planes, null); }
  const us = (performance.now() - t0) / N * 1000;
  check(`update cost (${F.sheep.length} sheep, 6 planes) < 60 µs/frame on this Mac`, us < 60, `${us.toFixed(1)} µs`);
}
console.log(`\n${pass}/${pass + fail} passed${args.falsify ? `  (falsify=${args.falsify}: must be red)` : ''}`);
process.exit(fail ? 1 : 0);
