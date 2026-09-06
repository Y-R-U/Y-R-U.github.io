import { test, eq, ok, near } from '../../tools/harness.mjs';
import { HALL, bayLines, bayMids, hallBand, hallStoreys, hallWindows } from './hallplan.js';

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

// No hall in the game has an inner doorway any more, but `doorBays` is still the mechanism for
// one, and a mechanism nothing exercises is a mechanism that has already broken.
test('nothing is cut where a doorway the caller declared already is', () => {
  const doorBays = [1, 2];
  const mids = bayMids(bayLines(inner(H.d), HALL.bay));
  const doors = doorBays.map(i => mids[i]);
  const dh = Math.min(3.8, band.wallH * 0.60);
  const cut = hallWindows({ span: inner(H.d), band, role: 'side', doorBays });
  for (const o of cut) {
    for (const u of doors) {
      const overlapX = Math.abs(o.x - u) < o.w / 2 + 1.3;
      const overlapY = o.y < band.fy + dh && o.y + o.h > band.fy;
      ok(!(overlapX && overlapY), `a light at ${o.x} crosses the doorway at ${u}`);
    }
  }
  ok(cut.length < at('side', H.d).length, 'declaring doorways took nothing out of the wall');
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



// The Adventure Society is this hall stacked five times, and both surfaces of it have to agree on
// where the storeys are or the fenestration drifts a floor apart — the same fault, one axis over,
// that this module was written to stop.
test('a stacked hall splits into storeys both surfaces can read', () => {
  const S = hallStoreys(H.plinth, 40, H.ceilK, 5);
  eq(S.n, 5);
  eq(S.bands.length, 5);
  for (let i = 1; i < S.ys.length; i++) near(S.ys[i] - S.ys[i - 1], S.storeyH, 1e-9, `storey ${i}`);
  for (let i = 0; i < S.n - 1; i++) {
    near(S.bands[i].wallH, S.storeyH - S.slabTh, 1e-9, `band ${i} is floor to floor less the slab`);
  }
  ok(S.plateTop < 40, 'the top wall plate is inside the building');
  // Every storey's windows have to sit inside that storey's own band, or a light is cut through
  // the floor slab above it.
  for (const band of S.bands) {
    for (const o of hallWindows({ span: 38, band, role: 'side' })) {
      ok(o.y >= band.fy, 'a window starts below its own floor');
      ok(o.y + o.h <= band.plateY + 1e-9, 'a window runs past its own wall plate');
    }
  }
});

test('one storey is the hall it has always been', () => {
  const one = hallStoreys(H.plinth, H.wallTop, H.ceilK, 1);
  eq(one.bands[0], hallBand(H.plinth, H.wallTop, H.ceilK));
  eq(one.n, 1);
});

// The academy's three inner doorways are gone with the academy, and the two middle bays of each
// side wall get their low light back rather than staying blank for a door nothing draws.
test('a side wall with no doorways keeps every bay of its low row', () => {
  const full = at('side', H.d);
  const low = full.filter(o => o.row === 0);
  const mids = bayMids(bayLines(inner(H.d), HALL.bay));
  eq(low.length, mids.length, 'a bay is missing its low light');
  for (const u of mids) ok(low.some(o => Math.abs(o.x - u) < 1e-9), `no low light at bay ${u}`);
});
