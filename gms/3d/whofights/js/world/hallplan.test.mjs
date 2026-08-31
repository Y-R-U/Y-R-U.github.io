import { test, eq, ok, near } from '../../tools/harness.mjs';
import { HALL, bayLines, bayMids, hallBand, hallWindows, hallDoorU, DOOR_BAYS } from './hallplan.js';

// This module exists because the outside of the hall and the inside of it each invented their own
// fenestration, and Aaron found the seam by walking through the door. The tests are about the one
// property that matters: what the two surfaces are handed is the same list, and nothing in it
// lands on top of something else the room already puts on that wall.

// The academy hall, from data/levels/academy.json via buildings.js house(): 36 × 30 × 12,
// panel thickness 0.51, plinth 0.66, light zone ceiling 1.1.
const H = { w: 36, d: 30, wallTop: 12, plinth: 0.66, t: 0.51, ceilK: 1.1 };
const inner = span => span - 2 * H.t - 0.18;
const band = hallBand(H.plinth, H.wallTop, H.ceilK);
const at = (role, span, greatDoorW = 0) => hallWindows({ span: inner(span), band, role, greatDoorW });

test('the exterior and the interior are handed the same list', () => {
  // The interior wall is 2t + 0.18 shorter than the panel outside it. Both must take their bay
  // midpoints off the SHORT span or the two grids drift by half a metre and the windows miss.
  const int = hallWindows({ span: H.w - 2 * H.t - 0.18, band, role: 'side' });
  const ext = at('side', H.w);
  eq(ext.length, int.length, 'different counts');
  for (let i = 0; i < ext.length; i++) {
    near(ext[i].x, int[i].x, 1e-9, `opening ${i} x`);
    near(ext[i].y, int[i].y, 1e-9, `opening ${i} y`);
  }
});

test('every opening sits inside the wall band it is cut in', () => {
  for (const role of ['side', 'door', 'boards']) {
    for (const o of at(role, role === 'side' ? H.d : H.w, 5.8)) {
      ok(o.y >= band.fy + 1.25, `${role} light at ${o.y.toFixed(2)} is in the base course`);
      ok(o.y + o.h <= band.plateY - 0.38, `${role} light tops out at ${(o.y + o.h).toFixed(2)}, in the wall plate`);
    }
  }
});

test('nothing is cut where a doorway already is', () => {
  const doors = hallDoorU(inner(H.d));
  const dh = Math.min(3.8, band.wallH * 0.60);
  for (const o of at('side', H.d)) {
    for (const u of doors) {
      const overlapX = Math.abs(o.x - u) < o.w / 2 + 1.3;
      const overlapY = o.y < band.fy + dh && o.y + o.h > band.fy;
      ok(!(overlapX && overlapY), `a light at ${o.x} crosses the doorway at ${u}`);
    }
  }
});

test('nothing is cut where the great doorway already is', () => {
  // 5.8 m wide and 5.8 m tall in a 6.5 m wall: it takes out both rows of the bays it crosses,
  // which is why the skip is not conditioned on the row the way a side door's is.
  for (const o of at('door', H.w, 5.8)) ok(Math.abs(o.x) > 5.8 / 2, `a light at ${o.x} is in the great doorway`);
});

test('the board wall carries no wall light at all', () => {
  // The four contract boards stand 2.61–6.21 m off the floor across the whole of it and the wall
  // plate is at 7.20. Anything cut there is four fifths behind a board.
  eq(at('boards', H.w).length, 0);
});

test('the low row is the one you can see through, and it is not the only row', () => {
  const side = at('side', H.d);
  ok(side.some(o => o.open), 'no unglazed light anywhere — nothing to see through');
  ok(side.some(o => !o.open), 'every light unglazed — nothing left leaded');
  for (const o of side) eq(o.open, o.row === 0, `row ${o.row} open flag`);
});

test('a doorway is at a bay midpoint, and the piers are at the bay lines', () => {
  const lines = bayLines(inner(H.d), HALL.bay);
  const mids = bayMids(lines);
  for (const u of hallDoorU(inner(H.d))) {
    ok(mids.includes(u), 'a doorway left the bay grid');
    for (const l of lines) ok(Math.abs(l - u) > 1.3, `the doorway at ${u} runs into the pier at ${l}`);
  }
});

test('the three doorways are where data/levels/academy.json puts its hotspots', () => {
  // The level document is not read here — it must not be, it is data — so the numbers it authors
  // are written out. With the hall at world (0, −16) and the room's own half-depth 14.4:
  //   hs.door.yard      x −15.9  z −12.4   west wall
  //   hs.door.armoury   x  15.9  z −19.6   east wall
  //   hs.door.dorm      x  15.9  z −12.4   east wall
  // A doorway's u is measured along its own face; both side faces put +u at ∓z, so a doorway at
  // u = −3.6 on the west wall and one at u = −3.6 on the east wall are at opposite ends.
  const HALL_Z = -16, rz = H.d / 2 - H.t - 0.09;
  const [uA, uB] = hallDoorU(rz * 2);
  const west = z => HALL_Z - z, east = z => HALL_Z + z;
  near(west(uA), -12.4, 1e-9, 'yard');
  near(east(uA), -19.6, 1e-9, 'armoury');
  near(east(uB), -12.4, 1e-9, 'dormitory');
  eq(DOOR_BAYS.length, 3 - 1, 'three authored doorways come out of two bay indices, one shared');
});
