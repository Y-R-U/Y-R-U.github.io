import { test, eq, ok, near } from '../../tools/harness.mjs';
import {
  stair, wellR, gateArc, landingAt, landings, flightY, floorIndex, atFloor, blockAt,
  pathBetween, pushOffFlight, slabBoxes, A0, TAU,
} from './stairplan.js';

// The Society, as data/levels/society.json builds it: five floors 7.9 m apart, a 1.9 m newel and
// a 5.2 m outer rim, so the tread is 3.3 m wide.
const S = stair({ x: 0, z: 6.5, r0: 1.9, r1: 5.2, ys: [0.71, 8.61, 16.51, 24.41, 32.31] });

test('a floor is where the helix says it is', () => {
  eq(S.turns, 4);
  near(S.rise, 7.9, 1e-9);
  for (let i = 0; i < S.ys.length; i++) eq(floorIndex(S, S.ys[i]), i, `floor ${i}`);
  for (const y of S.ys) ok(atFloor(S, y), `${y} should read as a floor`);
  ok(!atFloor(S, S.ys[0] + S.rise / 2), 'mid-flight is not a floor');
});

// The whole point of the module: the same angle is on every storey, and only `ref` separates them.
test('one angle is five heights, resolved by where you were', () => {
  const a = A0 + TAU * 0.5;
  const x = S.x + Math.cos(a) * S.rw, z = S.z + Math.sin(a) * S.rw;
  for (let k = 0; k < S.turns; k++) {
    near(flightY(S, x, z, S.ys[k]), S.ys[k] + S.rise / 2, 1e-9, `turn ${k}`);
  }
});

test('the flight is continuous where two turns meet', () => {
  const x = S.x + Math.cos(A0) * S.rw, z = S.z + Math.sin(A0) * S.rw;
  const eps = 1e-4;
  for (let k = 1; k < S.turns; k++) {
    const below = flightY(S, S.x + Math.cos(A0 - eps) * S.rw, S.z + Math.sin(A0 - eps) * S.rw, S.ys[k] - 0.1);
    const above = flightY(S, S.x + Math.cos(A0 + eps) * S.rw, S.z + Math.sin(A0 + eps) * S.rw, S.ys[k] + 0.1);
    near(below, S.ys[k], 1e-3, `arriving at floor ${k}`);
    near(above, S.ys[k], 1e-3, `leaving floor ${k}`);
  }
  near(flightY(S, x, z, S.ys[2]), S.ys[2], 1e-9, 'the landing angle is exactly a floor');
});

test('the well and the newel are both off the flight', () => {
  eq(flightY(S, S.x, S.z, 0), null, 'the newel is not walkable');
  eq(flightY(S, S.x + S.r1 + 0.5, S.z, 0), null, 'past the rim is not the flight');
  eq(wellR(S), S.r1, 'the slab hole meets the tread edge');
});

test('every landing is on its own floor and clear of the well', () => {
  for (const g of landings(S)) {
    near(g.y, S.ys[g.i], 1e-9, `landing ${g.i} height`);
    ok(Math.hypot(g.x - S.x, g.z - S.z) > S.r1, `landing ${g.i} is outside the rim`);
  }
});

// The ground floor has no flight arriving from below and the top has none leaving upward, so
// there is no landing there to walk onto and no walk that can be started from one.
test('a floor has a landing for each way the flight actually goes', () => {
  const all = landings(S);
  eq(all.length, 2 * S.ys.length - 2, 'two per floor bar the two ends');
  ok(!all.some(g => g.i === 0 && !g.up), 'nothing arrives at the ground floor from below');
  ok(!all.some(g => g.i === S.ys.length - 1 && g.up), 'nothing leaves the top floor upward');
  const up = landingAt(S, 2, true), down = landingAt(S, 2, false);
  ok(Math.hypot(up.x - down.x, up.z - down.z) > 1.5, 'the two sides are far enough apart to aim at');
  near(up.y, down.y, 1e-9, 'and are on the same floor');
});

// A rail you can see and a rule you can feel have to be the same arc, or there is a gap in the
// balustrade you cannot use or a stretch of floor you fall off.
test('the gate arc is exactly the reachable arc', () => {
  const half = gateArc(S);
  const inside = A0 + half * 0.85, outside = A0 + half * 1.6;
  const at = a => flightY(S, S.x + Math.cos(a) * S.rw, S.z + Math.sin(a) * S.rw, S.ys[1]);
  ok(Math.abs(at(inside) - S.ys[1]) < 1.05, 'inside the gate is within a stride');
  ok(Math.abs(at(outside) - S.ys[1]) > 1.05, 'outside the gate is not');
});

test('stepping on needs a tread at your feet; staying on only needs continuity', () => {
  const a = A0 + TAU * 0.5;
  const on = { x: S.x + Math.cos(a) * S.rw, z: S.z + Math.sin(a) * S.rw };
  const mid = S.ys[0] + S.rise / 2;
  ok(blockAt(S, { ...on }, mid, null), 'a tread at your feet gets you on');
  ok(!blockAt(S, { ...on }, S.ys[0], null), 'a tread four metres up does not');
  // A sprint runs ahead of the eased feet; the continuity test is what stops that dropping you off.
  ok(blockAt(S, { ...on }, mid - 0.8, mid), 'a lagging position stays on');
});

test('the outer rim is a handrail mid-flight and an opening at a floor', () => {
  const a = A0 + TAU * 0.5;
  const out = () => ({ x: S.x + Math.cos(a) * (S.r1 + 0.6), z: S.z + Math.sin(a) * (S.r1 + 0.6) });
  const mid = S.ys[0] + S.rise / 2;
  const p = out();
  ok(blockAt(S, p, mid, mid), 'mid-flight you are pushed back in');
  near(Math.hypot(p.x - S.x, p.z - S.z), S.r1 - 0.02, 1e-9, 'pushed to the rim');
  const q = out();
  ok(!blockAt(S, q, S.ys[1], S.ys[1]), 'at a floor you may walk away');
  eq(q.x, out().x, 'and are not moved');
});

test('the newel pushes out rather than swallowing you', () => {
  const p = { x: S.x + 0.4, z: S.z };
  ok(!blockAt(S, p, S.ys[0], null), 'inside the newel is not the flight');
  near(Math.hypot(p.x - S.x, p.z - S.z), S.r0, 1e-9, 'pushed out to the column');
});

test('a walk between two landings starts and ends on them and only climbs', () => {
  const pts = pathBetween(S, 1, 2);
  const a = landingAt(S, 1, true), b = landingAt(S, 2, false);
  near(pts[0].x, a.x, 1e-9); near(pts[0].y, a.y, 1e-9);
  near(pts[pts.length - 1].x, b.x, 1e-9);
  near(pts[pts.length - 1].y, b.y, 1e-9);
  for (let i = 1; i < pts.length; i++) ok(pts[i].y >= pts[i - 1].y - 1e-9, `step ${i} goes down`);
  // Two storeys is one curve, not two walks stitched together.
  ok(pathBetween(S, 0, 2).length > pts.length, 'a longer climb has more waypoints');
});

test('a walk down leaves by the other side of the same seam', () => {
  const up = pathBetween(S, 2, 3), down = pathBetween(S, 3, 2);
  near(down[0].y, up[up.length - 1].y, 1e-9, 'it starts where the climb ended');
  near(down[0].x, up[up.length - 1].x, 1e-9);
  for (let i = 1; i < down.length; i++) ok(down[i].y <= down[i - 1].y + 1e-9, `step ${i} goes up`);
  // Walking back out of the landing you arrived at would send you straight back down.
  const arrive = landingAt(S, 3, false), leave = landingAt(S, 3, true);
  ok(Math.abs(arrive.x - leave.x) > 1e-6 || Math.abs(arrive.z - leave.z) > 1e-6, 'the two are not one place');
});

test('the slab collider ring leaves the well open and covers the rest', () => {
  const rx = 17.4, rz = 14.4;
  const boxes = slabBoxes(S, rx, rz, S.ys[1]);
  eq(boxes.length, 4, 'four boxes round a round hole');
  const covers = (x, z) => boxes.some(b => Math.abs(x - b.cx) <= b.hw && Math.abs(z - b.cz) <= b.hd);
  ok(!covers(S.x, S.z), 'the well is open');
  ok(covers(0, -rz + 1), 'the far wall is covered');
  ok(covers(rx - 1, S.z), 'beside the well is covered');
  ok(covers(S.x, S.z + wellR(S) + 1), 'past the well is covered');
  for (const b of boxes) near(b.y1 - b.y0, 0.34, 1e-9, 'slab thickness');
});

test('a point on the flight can be put back off it', () => {
  const a = A0 + TAU * 0.5;
  const p = { x: S.x + Math.cos(a) * S.rw, z: S.z + Math.sin(a) * S.rw };
  pushOffFlight(S, p);
  ok(Math.hypot(p.x - S.x, p.z - S.z) > S.r1, 'still on the treads');
  eq(flightY(S, p.x, p.z, S.ys[1]), null, 'and no longer reads as the flight');
});
