// The one place the outside of a great hall and the inside of it agree.
//
// A hall is two surfaces: `buildings.js house()` draws the shell you see from the road, and
// `interior.js` draws the room you stand in. Nothing used to tie them together, so the exterior
// put ~110 windows on a 2 m slot grid at two heights of its own choosing and the interior put a
// clerestory of twelve at bay midpoints at a third — which is why Aaron, playing it, said:
// *"on the outside of building i see lots of windows, go on the inside and that same wall has
// none!"* Both files now read their openings out of here, so a window seen from the road is the
// same window seen from the bench.
//
// Everything is a fraction of the interior's own wall band, because that band is what the
// openings have to fit between: the base course, the three horizontal courses, the door heads
// and the wall plate are all placed off it too.

import { HALL } from './hallconf.js';

export { HALL };

// Pier lines across a wall. Always an even number of bays, so a wall has a centre pier and the
// two end bays match — an odd count puts a pier where the eye wants the middle of the wall.
export function bayLines(wide, target) {
  const n = Math.max(2, 2 * Math.round(wide / (2 * Math.max(1, target))));
  const out = [];
  for (let i = 0; i <= n; i++) out.push(-wide / 2 + wide * i / n);
  return out;
}

export const bayMids = lines => lines.slice(0, -1).map((v, i) => (v + lines[i + 1]) / 2);

// The masonry band: floor to wall plate. `interior.js` derives `fy`/`wallH` this way and the
// exterior has no way to know them, so the derivation lives here and both call it.
export function hallBand(plinth, wallTop, ceilK = 1) {
  const fy = plinth + 0.05;
  const wallH = Math.max(6, (wallTop - plinth) * ceilK * HALL.plate);
  return { fy, wallH, plateY: fy + wallH };
}

// Two rows, as fractions of `wallH` above `fy`.
//   `low`  sits between the base course (to 0.125) and the head of a side doorway (0.36).
//          Unglazed and barred — these are the ones you can see through.
//   `high` is the clerestory, above the string course (0.55) and below the wall plate (0.96).
// Measured against this hall's real band — floor 0.71, plate 7.20, so `wallH` is 6.49 m:
//   base course  0.71 – 1.96      low row   2.20 – 4.00
//   string course 4.14 – 4.42     high row  4.60 – 6.55
//   wall plate   6.82 – 7.20
// A side doorway is 3.8 m tall and stands in the low row's band, which is why the two middle
// bays lose their low light rather than the row being raised over the doors.
const ROWS = [
  { y: 0.230, h: 0.277, open: true },
  { y: 0.600, h: 0.300, open: false },
];

// A side wall's doorways stand at the two middle bays. The windows in those bays' low row would
// be in the doorway, so both side walls skip both of them — symmetrically, because a wall with a
// window in one middle bay and a door in the other reads as a mistake.
export const DOOR_BAYS = [1, 2];

export function hallDoorU(sideSpan) {
  const mids = bayMids(bayLines(sideSpan, HALL.bay));
  return DOOR_BAYS.map(i => mids[i]);
}

// `band` is what hallBand() returned. `role` is 'door' (the wall with the great doorway),
// 'boards' (the wall opposite it, where the contract boards hang) or 'side'.
//
// The board wall gets no wall lights at all, inside or out. Four boards stand 2.6–6.2 m off the
// floor across the whole of it and the wall plate is at 7.2, so there is no band left: the
// clerestory came out four fifths hidden behind a board, which is a window nobody can see and a
// board nobody can read. Its gable light, which is above the plate, is the one thing in that
// wall — and it is the thing the room is meant to look at.
export function hallWindows({ span, band, kind = 'arch', role = 'side', greatDoorW = 0 }) {
  const { fy, wallH } = band;
  const mids = bayMids(bayLines(span, HALL.bay));
  const w = Math.min(2.4, HALL.bay * 0.42);
  const blockedByDoor = new Set(role === 'side' ? DOOR_BAYS : []);
  const out = [];
  if (role === 'boards') return out;
  for (const [ri, r] of ROWS.entries()) {
    for (const [i, u] of mids.entries()) {
      if (ri === 0 && blockedByDoor.has(i)) continue;
      // The great doorway is 5.8 m wide and reaches 6.5 m up a 6.5 m wall, so it takes out both
      // rows in the bays it crosses — not just the low one a side door would.
      if (role === 'door' && Math.abs(u) < greatDoorW / 2 + w / 2 + 0.4) continue;
      out.push({ x: u, y: fy + wallH * r.y, w, h: wallH * r.h, kind, row: ri, open: r.open });
    }
  }
  return out;
}
