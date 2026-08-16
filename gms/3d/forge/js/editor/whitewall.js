// Whitewall, the Light town, authored rather than jittered. Every named area in data/areas.json
// that a quest, a prop, an NPC or a gather node reaches is a plot here at the same coordinates;
// whitewall.test.js reads those files and goes red the moment the two disagree.
//
// No `three` import, on purpose: the whole town is a list of plain objects a node test can walk.
//
// The named rooms — Sanctum, granary, kitchen, Almonry, cells, works yard — are walled at ground
// level and open to the sky. That is not a shortcut, it is what keeps the last three waves alive:
// data/props.json, data/cast_at.json and data/gather.json stand ten props, five named bodies and
// the kitchen hearth at world coordinates *inside* those rects, and doors.js hides
// people.object3D while you are in a generated interior. See docs/NOTES_A8_WHITEWALL.md.

import { HOUSE_MIN_W } from './scene.js';

export const TOWN = { x: -520, z: -60 };

// The four gates, from data/areas.json. `axis` is the wall face they sit in.
export const GATES = {
  north: { x: -520, z: -142, axis: 'x' },
  south: { x: -520, z: 32, axis: 'x' },
  west: { x: -632, z: -60, axis: 'z' },
  east: { x: -408, z: -66, axis: 'z' },
};

// The precinct wall's circuit is the rectangle the four gates define, not WORLD.md §3.1's
// 130/100 sketch — that sketch cannot close a 224 × 174 m box and areas.json is the file the
// game reads.
export const CIRCUIT = { x0: -632, z0: -142, x1: -408, z1: 32, height: 12, thickness: 3.6 };

// Rects copied from data/areas.json. The test asserts every one of them still matches.
export const PLOTS = {
  'wwa.market': { x0: -550, z0: -86, x1: -490, z1: -36 },
  'wwa.temple': { x0: -537, z0: -32, x1: -503, z1: -6 },
  'wwa.kitchen': { x0: -500, z0: -32, x1: -482, z1: -14 },
  'wwa.cloister': { x0: -602, z0: -126, x1: -564, z1: -96 },
  'wwa.almonry': { x0: -476, z0: -126, x1: -438, z1: -96 },
  'wwa.granary': { x0: -556, z0: -34, x1: -538, z1: -14 },
  'wwa.works': { x0: -606, z0: -58, x1: -574, z1: -28 },
  'wwa.cells': { x0: -548, z0: -140, x1: -530, z1: -122 },
};

export const SPOTS = {
  'wwa.spire': { x: -520, z: -60, r: 10 },
  'wwa.board': { x: -536, z: -46, r: 5 },
  'wwa.fishsteps': { x: -512, z: 124, r: 14 },
  'stand.chalk': { x: -600, z: 159, r: 10 },
  'stand.low': { x: -440, z: 106, r: 10 },
  'stand.east': { x: -318, z: 50, r: 14 },
};

// A gate leaves GAP metres of wall out either side of its centre line and stands a tower TOW out
// on each side, so the clear opening between the two towers is 18.8 m — the 18 m principal street
// of WORLD.md §3.
const GAP = 18.5, TOW = 14, CORNER_R = 5;

// A curtain run over 24 m grows its own gatehouse (buildings.js `gate = length > 24`), and every
// object is a solid box to colliders.js — so each of those arches would be a gate you can see
// through and cannot walk through. Staying under it also costs the buttresses, which need four
// modules, and the ruined stretch and the hoarding, which need six and seven.
const RUN_MAX = 24;

// `retaining` is the enclosure wall: a battered face, a coping course and buttresses every 8 m.
// Measured at 57 triangles a run against a curtain wall's 62 a metre, and none of the
// crenellation a granary has no business having.
const WALL_MIN = 6;

const P2 = Math.PI / 2;

const put = (out, type, x, z, ry, p, extra) => {
  out.push({ type, x: r3(x), z: r3(z), ry: r3(ry), p, ...extra });
  return out;
};
const r3 = v => Math.round(v * 1000) / 1000;

// What is left of `a0..a1` once the gaps are cut out of it.
export function segments(a0, a1, gaps) {
  let cuts = [[a0, a1]];
  for (const [g0, g1] of gaps) {
    const next = [];
    for (const [s0, s1] of cuts) {
      if (g1 <= s0 || g0 >= s1) { next.push([s0, s1]); continue; }
      if (g0 > s0) next.push([s0, g0]);
      if (g1 < s1) next.push([g1, s1]);
    }
    cuts = next;
  }
  return cuts;
}

// One straight wall, split into runs no longer than `max`. `axis` is the axis the wall runs
// along; `fixed` is its other coordinate.
function wallLine(out, { axis, fixed, from, to, gaps = [], max, min, make }) {
  for (const [s0, s1] of segments(from, to, gaps)) {
    const total = s1 - s0;
    if (total < min) continue;
    const n = Math.ceil(total / max);
    const len = total / n;
    for (let i = 0; i < n; i++) {
      const c = s0 + len * (i + 0.5);
      const x = axis === 'x' ? c : fixed;
      const z = axis === 'x' ? fixed : c;
      make(out, x, z, axis === 'x' ? 0 : P2, len);
    }
  }
}

// A room at ground level: four `retaining` runs round the plot with a gap where each door goes.
// `doors` are keyed by side and given in world coordinates along that side.
function room(out, r, { h, batter = 0.05, max = 20, doors = {} }) {
  const g = side => (doors[side] || []).map(([at, w]) => [at - w / 2, at + w / 2]);
  const make = (o, x, z, ry, length) => put(o, 'retaining', x, z, ry, { length, height: h, batter });
  const side = (axis, fixed, from, to, gaps) =>
    wallLine(out, { axis, fixed, from, to, gaps, max, min: WALL_MIN, make });
  side('x', r.z0, r.x0, r.x1, g('n'));
  side('x', r.z1, r.x0, r.x1, g('s'));
  side('z', r.x0, r.z0, r.z1, g('w'));
  side('z', r.x1, r.z0, r.z1, g('e'));
}

const retWall = (h, batter = 0.05) => (o, x, z, ry, length) =>
  put(o, 'retaining', x, z, ry, { length, height: h, batter });

const tower = (out, x, z, radius, height, sides) => put(out, 'tower', x, z, 0, { radius, height, sides });
const house = (out, x, z, ry, w, d, h, extra) => put(out, 'house', x, z, ry, { w: Math.max(w, HOUSE_MIN_W), d, h }, extra);
const mass = (out, x, z, ry, w, d, h) => put(out, 'mass', x, z, ry, { w, d, h });
const arcade = (out, x, z, ry, length, height, depth, bays) => put(out, 'arcade', x, z, ry, { length, height, depth, bays });

// The precinct wall and its twelve towers. Four corner towers, and a pair flanking every gate.
function circuit(out) {
  const c = CIRCUIT;
  const make = (o, x, z, ry, length) => put(o, 'wallRun', x, z, ry, { length, height: c.height, thickness: c.thickness });
  const gap = along => [[along - GAP, along + GAP]];

  wallLine(out, { axis: 'x', fixed: c.z0, from: c.x0 + CORNER_R, to: c.x1 - CORNER_R, gaps: gap(GATES.north.x), max: RUN_MAX, min: 12, make });
  wallLine(out, { axis: 'x', fixed: c.z1, from: c.x0 + CORNER_R, to: c.x1 - CORNER_R, gaps: gap(GATES.south.x), max: RUN_MAX, min: 12, make });
  wallLine(out, { axis: 'z', fixed: c.x0, from: c.z0 + CORNER_R, to: c.z1 - CORNER_R, gaps: gap(GATES.west.z), max: RUN_MAX, min: 12, make });
  wallLine(out, { axis: 'z', fixed: c.x1, from: c.z0 + CORNER_R, to: c.z1 - CORNER_R, gaps: gap(GATES.east.z), max: RUN_MAX, min: 12, make });

  for (const x of [c.x0, c.x1]) for (const z of [c.z0, c.z1]) tower(out, x, z, CORNER_R, 15, 8);
  for (const g of Object.values(GATES)) {
    for (const s of [-1, 1]) {
      tower(out, g.x + (g.axis === 'x' ? s * TOW : 0), g.z + (g.axis === 'z' ? s * TOW : 0), 4.4, 19, 12);
    }
  }
}

// Sanctum Yard: 60 × 50 m of nothing, the Lantern Spire in the middle of it, the Yard post, and
// a market frontage down each long side. The stalls are props, not geometry — market days only.
function yard(out) {
  const s = SPOTS['wwa.spire'];
  // The one object in the world pinned to full detail. It is 58 m tall and the town's only
  // wayfinding landmark, and the proxy cylinder reads as a grain silo from 80 m away.
  put(out, 'tower', s.x, s.z, 0, { radius: 9, height: 58, sides: 12 }, { lod: 'full' });
  const b = SPOTS['wwa.board'];
  put(out, 'cross', b.x, b.z, 0, { steps: 3, height: 4.5, radius: 2 });
  arcade(out, -553, -61, P2, 40, 5.4, 3.6, 8);
  arcade(out, -487, -61, -P2, 40, 5.4, 3.6, 8);
}

// The Sanctum, the granary and the temple kitchen are one 74 m range along the Yard's south side,
// which is why the avenue cannot pass between them and turns east at the Yard instead.
function sanctumRange(out) {
  room(out, PLOTS['wwa.temple'], { h: 14, doors: { n: [[-520, 7]] }, max: 18 });
  arcade(out, -531.5, -21, P2, 20, 5.4, 3.4, 4);
  house(out, -520, 2, 0, 18, 12, 13);           // the chapter house, behind the font

  room(out, PLOTS['wwa.granary'], { h: 9, doors: { s: [[-547, 5.5]] }, max: 18 });
  arcade(out, -547, -31, 0, 14, 4.2, 3, 3);
  mass(out, -566, -24, 0, 14, 18, 9);           // the tithe store, west of the granary door

  room(out, PLOTS['wwa.kitchen'], { h: 8, doors: { n: [[-491, 5]] }, max: 18 });
  mass(out, -491, -5, 0, 14, 12, 7);            // the bakehouse, south of the kitchen
}

// The Cloister opens at its north-east corner, which is where wall_day's camera stands. That is
// deliberate: `nearCamera` deletes any object centred inside a scenario keep-out, so a wall run
// there would have been a hole nobody authored. The hole is the gateway instead.
function cloister(out) {
  const r = PLOTS['wwa.cloister'];
  wallLine(out, { axis: 'x', fixed: r.z0, from: r.x0, to: -578, gaps: [], max: 14, min: WALL_MIN, make: retWall(10) });
  wallLine(out, { axis: 'x', fixed: r.z1, from: r.x0, to: r.x1, gaps: [[-585, -579]], max: 18, min: WALL_MIN, make: retWall(10) });
  wallLine(out, { axis: 'z', fixed: r.x0, from: r.z0, to: r.z1, gaps: [], max: 18, min: WALL_MIN, make: retWall(10) });
  wallLine(out, { axis: 'z', fixed: r.x1, from: -108, to: r.z1, gaps: [], max: 18, min: WALL_MIN, make: retWall(10) });
  arcade(out, -583, -122, 0, 30, 5.1, 3.4, 6);
  arcade(out, -583, -100, Math.PI, 30, 5.1, 3.4, 6);
  house(out, -618, -111, P2, 22, 14, 15);       // the apprentice hall, the staff rack, Sister Bel
  mass(out, -592, -88, 0, 12, 10, 7);
}

// The Almonry's two south doors are props — `wwa.almonry.door` and `wwa.almonry.lock` — so the
// wall has to leave both of them standing in an opening.
function almonry(out) {
  room(out, PLOTS['wwa.almonry'], { h: 11, doors: { s: [[-460.8, 6], [-447.5, 6]] }, max: 19 });
  arcade(out, -441, -111, -P2, 24, 4.8, 3.2, 5);
  house(out, -424, -108, P2, 18, 14, 14);       // Ivo's room, off the Store's east end
  mass(out, -457, -134, 0, 20, 10, 8);
}

// Pell's works yard: low walls, a mason's lodge and a pen of dressed stone, open to the street
// on the east. The hurdle the player mends is `wwa.fence.panel`, a prop, in the south-east.
function works(out) {
  const r = PLOTS['wwa.works'];
  wallLine(out, { axis: 'x', fixed: r.z0, from: r.x0, to: r.x1, gaps: [], max: 16, min: WALL_MIN, make: retWall(2.5) });
  wallLine(out, { axis: 'x', fixed: r.z1, from: r.x0, to: -588, gaps: [], max: 16, min: WALL_MIN, make: retWall(2.5) });
  wallLine(out, { axis: 'z', fixed: r.x0, from: r.z0, to: r.z1, gaps: [], max: 16, min: WALL_MIN, make: retWall(2.5) });
  mass(out, -601, -34, 0, 8, 8, 6);
  put(out, 'pen', -586, -52, 0, { w: 14, d: 8, h: 1.5 });
  house(out, -614, -43, -P2, 14, 12, 10);       // Pell's own house, off the west wall
}

// The gate cells sit inside the north gate, west of the road. The precinct wall is their north
// side, so they have none of their own, and the side walls stop clear of the gate tower. The
// hinge the player mends is a prop three metres inside the doorway.
function cells(out) {
  const r = PLOTS['wwa.cells'];
  wallLine(out, { axis: 'x', fixed: r.z1, from: r.x0, to: r.x1, gaps: [[-541.25, -536.75]], max: 18, min: WALL_MIN, make: retWall(7) });
  wallLine(out, { axis: 'z', fixed: r.x0, from: -138, to: r.z1, gaps: [], max: 18, min: WALL_MIN, make: retWall(7) });
  wallLine(out, { axis: 'z', fixed: r.x1, from: -136, to: r.z1, gaps: [], max: 18, min: WALL_MIN, make: retWall(7) });
  mass(out, -511, -127, 0, 12, 12, 8);          // the watch house, east of the road
}

// Terraced frontages. A row is a line of dwellings fronting a street at a fixed set-back, with a
// cheaper block behind every second one — the same trade the seeded districts make, authored.
//
// `real` is how many of the `n` get the full `house` builder, with its openings, quoins, dormer
// and door. The rest are `mass` — the same silhouette, the same lit windows, 190 triangles
// against a house's 6.5k. That ratio is the town's whole perf story; see
// docs/NOTES_A8_WHITEWALL.md.
function row(out, { axis, front, facing, from, to, n, w, d, h, back, real = 1 }) {
  const step = (to - from) / n;
  for (let i = 0; i < n; i++) {
    const along = from + step * (i + 0.5);
    const off = front + facing * d / 2;
    const ry = axis === 'z'
      ? (facing < 0 ? P2 : -P2)
      : (facing < 0 ? 0 : Math.PI);
    const x = axis === 'z' ? off : along;
    const z = axis === 'z' ? along : off;
    const ww = Math.min(w, step - 1.5);
    const hh = h + (i % 3) * 1.5;
    // offset so the detailed one lands mid-row, where the street is looked along rather than at
    if ((i * real + (n >> 1)) % n < real) house(out, x, z, ry, ww, d, hh);
    else mass(out, x, z, ry, ww, d, hh);
    if (!back || i % 2) continue;
    const bx = axis === 'z' ? off + facing * (d / 2 + 5) : along;
    const bz = axis === 'z' ? along : off + facing * (d / 2 + 5);
    mass(out, bx, bz, ry, Math.min(w - 2, step - 3), 8, h - 1.5);
  }
}

// The Vail is 90 m south of the south gate and 23 m below it. The steps themselves are the gather
// node's own rail and rod; what makes it a place is the quay under them and the lofts above.
function reach(out) {
  const f = SPOTS['wwa.fishsteps'];
  put(out, 'retaining', f.x, 114, 0, { length: 30, height: 4, batter: 0.18 });
  mass(out, f.x - 15, 106, 0, 8, 7, 5);
  mass(out, f.x + 11, 105, 0.3, 9, 7, 6);
  house(out, -540, 96, 0, 12, 10, 8);

  for (const id of ['stand.chalk', 'stand.low', 'stand.east']) {
    const s = SPOTS[id];
    put(out, 'retaining', s.x, s.z - 6, 0, { length: 12, height: 2.5, batter: 0.2 });
    put(out, 'pen', s.x - 8, s.z - 11, 0, { w: 8, d: 5, h: 1.2 });
  }
}

// The paved through-route: in at the north gate off the Drove spur, round the Spire, out of the
// east gate onto the King's Road. One polyline, because a district owns one road; the south
// gate's lane and the ring street are read off the frontages instead.
export const ROAD = [
  [-520, -143], [-520, -124], [-520, -104], [-520, -92], [-521, -83], [-517, -75],
  [-510, -69], [-500, -67], [-484, -66.4], [-455, -66.2], [-428, -66], [-410, -66],
];

// Matches the King's Road's own half-width so the two read as one road through the gate.
export const ROAD_WIDTH = 9;

// Ground the town keeps swept: the square and the floor of every walled room. These go into the
// terrain's scatter mask, which is the only thing that decides where grass grows — a 60 × 50 m
// lawn in the middle of a limestone town was the single loudest wrong note in the first render.
export const SWEPT = [
  PLOTS['wwa.market'], PLOTS['wwa.temple'], PLOTS['wwa.kitchen'], PLOTS['wwa.granary'],
  PLOTS['wwa.almonry'], PLOTS['wwa.cloister'], PLOTS['wwa.cells'], PLOTS['wwa.works'],
];

export function whitewall() {
  const out = [];
  circuit(out);
  yard(out);
  sanctumRange(out);
  cloister(out);
  almonry(out);
  works(out);
  cells(out);

  // North avenue, gate to Yard. The west frontage starts below the gate cells, which already
  // hold that side of the street from z −140 to −122.
  row(out, { axis: 'z', front: -527, facing: -1, from: -122, to: -92, n: 2, w: 11, d: 10, h: 8, back: false });
  row(out, { axis: 'z', front: -511, facing: 1, from: -120, to: -92, n: 2, w: 13, d: 12, h: 9.5, back: true });

  // East avenue, Yard to east gate.
  row(out, { axis: 'x', front: -76, facing: -1, from: -478, to: -424, n: 4, w: 13, d: 12, h: 9, back: false });
  row(out, { axis: 'x', front: -56, facing: 1, from: -478, to: -424, n: 4, w: 13, d: 12, h: 8.5, back: true });

  // South quarter, between the Sanctum range and the south gate.
  row(out, { axis: 'z', front: -538, facing: -1, from: 2, to: 26, n: 2, w: 12, d: 11, h: 8, back: false });
  row(out, { axis: 'z', front: -502, facing: 1, from: 2, to: 26, n: 2, w: 12, d: 11, h: 8.5, back: false });
  mass(out, -570, 6, 0, 12, 10, 7);
  mass(out, -470, 8, 0.2, 12, 10, 7.5);
  mass(out, -448, -18, 0, 14, 12, 8);

  reach(out);
  return out;
}
