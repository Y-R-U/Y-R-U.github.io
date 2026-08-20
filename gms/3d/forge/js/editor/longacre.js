// Longacre, the Neutral town. Same kit as Whitewall (townkit.js), same rule that every named area
// in data/areas.json a quest, prop, NPC or gather node reaches is a place at those coordinates —
// and deliberately not the same town. Whitewall is a walled ecclesiastical precinct; Longacre is a
// working farm village strung along the King's Road, so:
//
//   no curtain wall, no gatehouse, one tower, no arcades. Its walls are 2–2.6 m yard walls, so
//   you look over them into a barn plat instead of down a corridor of blank stone.
//
// No `three` import, so longacre.test.js can walk the whole town as data.
//
// The King's Road is the High Street. It comes over Millbridge from the south-west, climbs Mill
// Lane, crosses the market square at the cross and leaves east through the Ash Gate — so most of
// this file is laid out against `field.js` ROADS[0], not against a street of its own. The town
// registers no road: see demoScene.js.

import { P2, put, tower, house, mass, pen, retWall, row, wallLine, WALL_MIN } from './townkit.js';

// Rects copied from data/areas.json. The test asserts every one of them still matches.
export const PLOTS = {
  'lac.square': { x0: -30, z0: -4, x1: 30, z1: 41 },
  'lac.barn': { x0: -20, z0: -58, x1: 20, z1: -40 },
  'lac.cotts': { x0: -78, z0: -58, x1: -48, z1: -40 },
  'lac.stables': { x0: 46, z0: -58, x1: 72, z1: -40 },
  'lac.moot': { x0: -14, z0: 46, x1: 12, z1: 64 },
  'lac.forge': { x0: -72, z0: 46, x1: -48, z1: 64 },
  'lac.westfield': { x0: -126, z0: 4, x1: -92, z1: 38 },
  'lac.mill': { x0: -26, z0: 100, x1: -6, z1: 116 },
};

export const SPOTS = {
  'lac.cross': { x: 0, z: 20, r: 6 },
  'lac.granary': { x: 52, z: 55, r: 7 },
  'lac.henhouse': { x: -86, z: 22, r: 7 },
  'lac.ashgate': { x: 126, z: 20, r: 12 },
  'lac.leat': { x: -48, z: 104, r: 14 },
  'lac.millbridge': { x: -34, z: 119, r: 12 },
  'stand.quiet': { x: 150, z: 100, r: 12 },
};

// A farm yard wall you can see over from the third-person camera's 3.7 m and not from the eye's
// 1.8. Whitewall's named rooms go to 14 m because they are buildings with the roof left off; this
// is a wall round a yard and is meant to read as one.
const YARD_H = 2.6;

// Beaten earth, surfaced through terrain.addPatch in the zone's own `road` material. The list is
// the yards, not the plot table: Longacre is a farming village and grass is the *right* answer
// almost everywhere in it. The one plot the test forbids surfacing is the West Field, because
// being unimproved ground is the whole point of the West Field.
const YARD_IDS = ['lac.square', 'lac.barn', 'lac.stables', 'lac.moot', 'lac.forge', 'lac.mill'];
export const GREEN_IDS = ['lac.westfield'];
export const PAVED = YARD_IDS.map(id => PLOTS[id]);

// The Vail's north bank falls away south-east through the mill reach, so anything sitting on it —
// the wharf, the sluice revetment, the fishing stand — is turned to lie along the water rather
// than along the map axes. field.js `creekZ` is the authority; these are its local slopes.
const BANK_MILL = -0.88, BANK_QUIET = 0.54;

// The Tithe Barn stands south of `lac.barn`, not on it. data/props.json, cast_at.json and
// gather.json put Dob, the Household's table, the tithe crate, the bank hearth and the cooking
// fire at world coordinates inside that rect, and a 40 × 18 solid would bury all five — the same
// trap docs/NOTES_A8_WHITEWALL.md §2 hit with the Sanctum. So the rect is the barn *plat*, walled
// and open, and the barn closes its south side and the market place's north side at once. An
// open fire and a table in the lee of the barn is also the only version of this that is not
// absurd inside a building full of dry grain.
function barnyard(out) {
  const r = PLOTS['lac.barn'];
  put(out, 'barn', 0, -31, 0, { w: 40, d: 18, h: 9 });

  const make = retWall(YARD_H, 0.06);
  // The north wall stands 1.5 m outside the plot because the cooking fire is 0.9 m inside that
  // edge and a `retaining`'s plan reaches 1.06 m either side of its line. The side walls are on
  // the plot line, where they overlap the rect and the coverage test can see them.
  wallLine(out, { axis: 'x', fixed: r.z0 - 1.5, from: r.x0, to: r.x1, gaps: [[-8, 2]], max: 18, min: WALL_MIN, make });
  wallLine(out, { axis: 'z', fixed: r.x0, from: r.z0 - 1.5, to: r.z1, gaps: [], max: 18, min: WALL_MIN, make });
  wallLine(out, { axis: 'z', fixed: r.x1, from: r.z0 - 1.5, to: r.z1, gaps: [[-46, -40]], max: 18, min: WALL_MIN, make });

  mass(out, -30, -50, 0, 10, 12, 6);            // the cart lodge, west of the plat gate
  mass(out, 30, -49, 0, 9, 11, 5.5);            // the ox byre, east of it
}

// Three crofts on the north side of the North Lane with gardens behind. `stagger` is what keeps
// them from reading as one terrace, and the strip in front is left clear because the escorted hen
// scratches in it and `lac.cotts`'s own centre is in it.
function cottrow(out) {
  row(out, { axis: 'x', front: -49.5, facing: -1, from: -78, to: -48, n: 3, w: 8.5, d: 9, h: 7, back: false, real: 1, stagger: 1.6 });
  for (const x of [-68, -56]) pen(out, x, -64.5, 0, 10, 5, 1.2);   // the gardens, behind
  mass(out, -84, -52, 0.2, 8, 8, 5.5);          // the row's shared bakehouse, at the lane's corner
}

// A range on the north, a cart shed on the east and a paddock on the south, leaving the middle of
// the plot clear: `lac.stables.plot` is a raise-a-stone prop standing on it.
function stables(out) {
  mass(out, 52, -55.5, 0, 14, 6.5, 6);
  mass(out, 68, -54, 0, 10, 8, 5.5);
  pen(out, 59, -42, 0, 26, 5, 1.5);
  pen(out, 78, -50, 0, 6, 14, 1.5);
}

// The Moot Hall stands west of the King's Road, gable-end to it, because the road runs up the
// middle of `lac.moot` — and its lectern, `lac.moot.ledger`, stands outside the door on the
// street. A ledger nobody has to go inside to read is the joke STORY.md §2 is making.
function moot(out) {
  house(out, -17, 56, P2, 18, 13, 11);
  pen(out, 12, 58, 0, 10, 10, 1.5);             // the pound
  mass(out, 14, 47, 0, 9, 7, 5.5);
}

function forge(out) {
  house(out, -60, 57, Math.PI, 14, 11, 9);
  mass(out, -70, 61, 0, 8, 7, 5);               // the charcoal store
  pen(out, -46, 50, 0, 10, 6, 1.4);             // the shoeing yard, clear of the smithy door
}

// The seed store: `tower` r 5 h 20, WORLD.md §3.2's numbers and deliberately the shortest of the
// three towns' landmarks. It stands 8 m east of its area centre because Granny Sedge stands 4.2 m
// north of that centre and a r-5 tower's battered foot is 6.5 m of collider.
function seedStore(out) {
  tower(out, 60, 55, 5, 20, 12);
  mass(out, 52, 63, 0, 12, 7, 6);               // the seed loft
  pen(out, 44, 62, 0, 8, 9, 1.4);
}

function henhouse(out) {
  const s = SPOTS['lac.henhouse'];
  mass(out, s.x, s.z + 4, 0, 7, 5, 3.5);
  pen(out, s.x + 2, s.z - 5, 0, 12, 8, 1.2);   // the run, kept off the West Field's fence line
}

// A fence, and nothing else. WORLD.md §3.2: "the least impressive location in the game." Nine
// props and gather nodes stand in this rect and every one of them is a thing you do to bare
// ground, so the only geometry is the boundary — the one STORY.md §8.3 says moves two paces at a
// time.
function westfield(out) {
  const r = PLOTS['lac.westfield'];
  pen(out, -109, r.z0 - 2, 0, 36, 4, 1.2);
  pen(out, -109, r.z1 + 3, 0, 36, 4, 1.2);
  pen(out, -128, 21, 0, 5, 38, 1.2);
}

// The market square: beaten earth, the cross where the road bends, hurdle pens for the stock
// market, and frontages down the west and east sides. The King's Road crosses it, so the east
// frontage is in two pieces with the High Street between them.
function square(out) {
  put(out, 'cross', 0, 25.5, 0, { steps: 4, height: 6, radius: 2.4 });

  row(out, { axis: 'z', front: -32, facing: -1, from: -2, to: 38, n: 4, w: 11, d: 10, h: 7.5, back: true, real: 1, stagger: 1.2 });
  row(out, { axis: 'z', front: 32, facing: 1, from: -4, to: 8, n: 1, w: 11, d: 10, h: 8 });
  row(out, { axis: 'z', front: 32, facing: 1, from: 24, to: 41, n: 2, w: 11, d: 10, h: 7.5, back: true, real: 1, stagger: 1.2 });

  for (const [x, z] of [[-20, 3], [-20, 13], [-11, 3]]) pen(out, x, z, 0, 12, 8, 1.4);
  // either end of the barn's forecourt, which is the square's open north side
  mass(out, -24, -12, 0, 12, 9, 6.5);
  mass(out, 22, -12, 0.15, 11, 9, 6);
}

// The High Street: the King's Road east of the square, frontages either side of it, ending short
// of the Ash Gate where the road climbs away in z.
function highStreet(out) {
  row(out, { axis: 'x', front: 5, facing: -1, from: 36, to: 104, n: 6, w: 12, d: 10, h: 7.5, back: true, real: 2, stagger: 1.8 });
  row(out, { axis: 'x', front: 24, facing: 1, from: 36, to: 100, n: 5, w: 12, d: 10, h: 8, back: false, real: 1, stagger: 1.5 });
}

// Two piers, a weigh house and two fence runs. Longacre has no wall, so its "gate" is only the
// place where the King's Road narrows enough that a cart has to stop and be counted — which is
// STORY.md §1's whole account of how this town knows everything.
function ashgate(out) {
  mass(out, 123.5, 28.5, 0, 4, 4, 6);
  mass(out, 128.5, 11.5, 0, 4, 4, 6);
  house(out, 120, 33, Math.PI, 12, 10, 9);
  pen(out, 130, 5, 0, 5, 12, 1.5);
  pen(out, 121, 42, 0, 5, 14, 1.5);
}

// Mill Lane, the King's Road between the square and the mill. `street_dusk` stands on it at
// (0, 84) looking north, so the east side is kept back off the sight line and the lane's own
// frontage is what frames the shot.
function millLane(out) {
  mass(out, 14, 70, 0.1, 10, 8, 6);
  mass(out, 15, 84, -0.2, 9, 8, 5.5);
  mass(out, -16, 74, 0.15, 9, 8, 6);
  house(out, -24, 90, P2, 12, 9, 8);            // the miller's cott, gable to the lane
}

// The Mill straddles the weir — field.js drops `waterY` 1.2 m between x −32 and −12 and the
// comment there says why — with its wheel on the south face over the race. It stands on the
// south-east corner of `lac.mill` rather than in it, because Hana, the meal crate, the hatch and
// the hurdle are all inside that rect at world coordinates.
function millyard(out) {
  put(out, 'mill', -2, 116, -P2, { w: 16, d: 13, h: 11.5, wheel: 3.5 });
  pen(out, 6, 100, 0, 10, 6, 1.2);              // the drying ground, clear of the lane
  put(out, 'retaining', -15, 116, 0, { length: 16, height: 2.5, batter: 0.2 });
}

// The north landing. The bridge deck itself is the district's `bridge`, from CROSSINGS — see
// demoScene.js — so what the town owns here is the landing stage below the bridge head and the
// hut above it. Fen and his crate stand between the two, on the bank.
function millbridge(out) {
  put(out, 'retaining', -37, 103, BANK_MILL, { length: 10, height: 2.2, batter: 0.2 });
  mass(out, -35, 95, BANK_MILL, 6, 5, 4);       // Fen's hut, above the landing
}

// The sluice at the head of the leat. `lac.leat`'s circle is centred on the water, so everything
// here is on the strip along its north side that is above the bank.
function leat(out) {
  put(out, 'retaining', -50, 92, BANK_MILL, { length: 12, height: 2, batter: 0.15 });
  put(out, 'retaining', -38, 100, BANK_MILL, { length: 12, height: 2, batter: 0.15 });
  pen(out, -42, 94, BANK_MILL, 8, 5, 1.2);
}

function quietStretch(out) {
  put(out, 'retaining', 155, 90, BANK_QUIET, { length: 12, height: 2.2, batter: 0.2 });
  pen(out, 146, 90, BANK_QUIET, 8, 5, 1.2);
}

export function longacre() {
  const out = [];
  barnyard(out);
  cottrow(out);
  stables(out);
  square(out);
  highStreet(out);
  ashgate(out);
  moot(out);
  forge(out);
  seedStore(out);
  henhouse(out);
  westfield(out);
  millLane(out);
  millyard(out);
  millbridge(out);
  leat(out);
  quietStretch(out);

  // The North Lane's south side, and the West Lane down to the hen house and the field: the two
  // lanes that make the plots read as blocks rather than as objects on a plain.
  mass(out, -60, -30, 0, 10, 8, 5.5);
  mass(out, 44, -28, -0.1, 11, 9, 6);
  mass(out, -80, -18, 0, 9, 8, 5.5);
  mass(out, -80, 0, 0.1, 8, 7, 5);
  mass(out, -78, 36, -0.1, 9, 8, 5.5);
  return out;
}
