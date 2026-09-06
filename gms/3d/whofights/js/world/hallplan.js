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
  return hallStoreys(plinth, wallTop, ceilK, 1).bands[0];
}

// How a hall is cut into storeys, and the one place the answer lives. `buildings.js` draws the
// outside of the Adventure Society and `interior.js` draws the five rooms inside it; if they
// worked this out separately the fenestration would drift a storey apart the first time either
// changed, which is the fault this whole module was written to stop.
//
// Every storey but the last runs floor to floor less the slab overhead. The last stops at a wall
// plate and hands the rest to the open timber roof, exactly as a one-storey hall always has —
// which is why `floors: 1` comes back out of here as the numbers it has always been.
export const SLAB_T = 0.34;

export function hallStoreys(plinth, wallTop, ceilK = 1, floors = 1) {
  const fy = plinth + 0.05;
  const n = Math.max(1, Math.round(floors));
  // `ceilK` is a zone flavour worth 10% either way, and harmless while only half the wall was
  // ever used: a one-storey hall's plate sits at 0.52 of it and the roof has the rest to live in.
  // Stacked, it is not harmless — five storeys of a 1.1 multiplier put the top wall plate above
  // the wall top outside and the interior's roof crown came out through the slate.
  const usable = (wallTop - plinth) * (n === 1 ? ceilK : 1);
  const storeyH = usable / n;
  // The 6 m floor is what stops a small single-storey hall being squashed into a shed. Stacked,
  // it is the wrong number by an order: it would make the top storey's masonry taller than the
  // storeys under it and push the interior ridge up through the roof slab outside.
  const plate = n === 1 ? Math.max(6, usable * HALL.plate) : Math.max(3.5, storeyH * HALL.plate);
  const ys = Array.from({ length: n }, (_, i) => fy + i * storeyH);
  const bands = ys.map((y, i) => {
    const wallH = i === n - 1 ? plate : storeyH - SLAB_T;
    return { fy: y, wallH, plateY: y + wallH };
  });
  return { fy, n, usable, storeyH, slabTh: SLAB_T, ys, plate, bands, plateTop: ys[n - 1] + plate };
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

// A side wall used to lose the low row of two middle bays to the academy's inner doorways. The
// Adventure Society has none — a door onto a room that does not exist is a promise the building
// cannot keep — so those bays get their light back. `doorBays` is kept as a parameter rather than
// deleted because a level that does put a doorway in a hall wall will need it again, and it must
// be the caller's list, not a constant here that every hall obeys whether it has doors or not.

// `band` is what hallBand() returned. `role` is 'door' (the wall with the great doorway),
// 'boards' (the wall opposite it, where the contract boards hang) or 'side'.
//
// The board wall gets no wall lights at all, inside or out. Four boards stand 2.6–6.2 m off the
// floor across the whole of it and the wall plate is at 7.2, so there is no band left: the
// clerestory came out four fifths hidden behind a board, which is a window nobody can see and a
// board nobody can read. Its gable light, which is above the plate, is the one thing in that
// wall — and it is the thing the room is meant to look at.
export function hallWindows({ span, band, kind = 'arch', role = 'side', greatDoorW = 0, doorBays = [] }) {
  const { fy, wallH } = band;
  const mids = bayMids(bayLines(span, HALL.bay));
  const w = Math.min(2.4, HALL.bay * 0.42);
  const blockedByDoor = new Set(role === 'side' ? doorBays : []);
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
