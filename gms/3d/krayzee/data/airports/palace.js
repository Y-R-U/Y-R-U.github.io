// C-Tower 3: The Palace Lawn (D27), a satellite inside C-Tower 1's world: no load of its own, it shares the royal world
// (scenery.biome 'royal', world 'royal'), and its lawn, folly, orangery and gardens are built by js/world/palace.js.
// Authored along +X, turned 10° anticlockwise (lawn 08/26) and moved to the foot of the castle hill, south-east of the
// castle. Coordinates are in C-Tower 1's frame. The lawn is rolled like a billiard table: it rolls as a runway.
import { PALACE_LINES } from './palace-lines.js';
import royal from './royal.js';

const ROT = -10, OX = 1300, OZ = -1560;
const r = ROT * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
const P = ([x, z]) => [Math.round((x * c - z * s + OX) * 10) / 10, Math.round((x * s + z * c + OZ) * 10) / 10];
const P3 = ([x, z]) => { const [a, b] = P([x, z]); return [a, 0, b]; };
const H = (h) => (((h + ROT) % 360) + 360) % 360;
const rect = (x, z, w, d, h = 0) => ({ center: P3([x, z]), size: [w, d], heading: H(h) });

export const LAWN = { ROT, OX, OZ, P, H, length: 240, width: 24 };

export default {
  id: 'palace', n: 3, name: 'The Palace Lawn', short: 'Palace Lawn',
  world: 'royal',                      // shares C-Tower 1's world (D27): a swap between them rebuilds nothing
  map: [OX / 1000, OZ / 1000],
  pin: [4.5, -6.5],                    // drawn here on the Kingdom Map (its true spot is under C-Tower 1's pin)
  elev: 0,
  center: P([0, -30]),
  controllers: ['fennimore'],
  tower: { kind: 'folly', position: P3([118, -147]), height: 16 },
  towerName: 'C-Tower 3 · Mr Fennimore',
  towerLines: PALACE_LINES,
  vertical: true,
  // AI the lawn sees: with FLIGHTFIX4's short-field landing (aim 30 m in, no float, hard braking) the Cub joins the
  // Bathtub (airport-check soak: 4 arrivals, 0 infractions). The Moth lands on it in flight-sim but not yet cleanly in
  // the ATC soak (lifts off ~180 m, touches down ~140 m in the soak's wind: "uninvited landing"), so it stays out for now.
  aiTypes: ['bathtub', 'cub'],                      // a STOVL jet may use it by a vertical landing (kingdom.js canUse)
  wind: royal.wind,
  patternAlt: 200,
  runways: [
    { id: '08/26', ends: ['08', '26'], center: P3([0, 0]), heading: H(90), length: 240, width: 24, surface: 'lawn', departures: true, closed: false, markings: 'lawn' },
  ],
  taxiwayWidth: 8,
  parallel: 'G',
  taxiways: [
    { id: 'G', points: [P([-120, -96]), P([120, -96])] },
    { id: 'G1', points: [P([-120, -96]), P([-120, 0])] },
    { id: 'G2', points: [P([120, -96]), P([120, 0])] },
  ],
  holdOffset: 48,                      // ATC holds a plane off the runway at half its width + 30 m (42 m here)
  exitMin: 120,
  aprons: [rect(0, -133, 200, 64)],
  terminal: { kind: 'orangery', ...rect(0, -201, 70, 18), height: 9 },
  stands: [-60, 0, 60].map((x, i) => ({ id: `P${i + 1}`, position: P3([x, -141]), heading: H(180) })),
  circuits: { '08': 'R', '26': 'L' },
  circuit: { upwindExt: 300, downwindOff: 650, finalLen: 1100, baseAlt: 80, secondaryAltStep: 100 },
  finish: { designated: null, radiusEasy: 200 },
  flat: [{ rect: [[OX - 520, OZ - 260], [OX + 520, OZ + 200]] }],
  scenery: { ...royal.scenery },
  windsocks: [P([-100, 42]), P([100, 42])],
  // the garden's obstacles, built by js/world/palace.js and checked by tools/airport-check.mjs (footprints as aprons)
  props: [
    { kind: 'fountain', ...rect(0, -179, 14, 14), h: 4.6 },
    ...[[-112, -171], [112, -171], [-40, -187], [40, -187]].map(([x, z], i) => ({ kind: 'flagpole', ...rect(x, z, 1, 1), h: 9, flag: i < 2 ? 'flag2' : 'flag' })),
    ...[-1, 1].flatMap((s) => [0, 1, 2, 3, 4].flatMap((k) => [
      { kind: 'topiary', shape: 'cone', ...rect(s * 109, -117 - k * 12, 2.4, 2.4), h: 3.4 },
      { kind: 'topiary', shape: 'ball', ...rect(s * 109, -123 - k * 12, 2.2, 2.2), h: 2.2 }])),
    ...[-1, 1].flatMap((s) => [{ kind: 'topiary', shape: 'cone', ...rect(s * 104, -201, 2.8, 2.8), h: 4.2 }, { kind: 'topiary', shape: 'ball', ...rect(s * 80, -223, 3.2, 3.2), h: 3.2 }]),
    { kind: 'topiary', shape: 'peacock', ...rect(-40, -179, 6, 3), h: 3.9 },
    ...[-1, 1].flatMap((s) => [{ kind: 'hedge', pts: [P([s * 230, -301]), P([s * 230, -90])], h: 2.6 }, { kind: 'hedge', pts: [P([s * 230, -301]), P([s * 40, -301])], h: 2.6 }]),
    { kind: 'hedge', wall: true, pts: [P([-210, 78.6]), P([210, 78.6])], h: 0.9 },   // the ha-ha
    { kind: 'butler', ...rect(150, -70, 1.2, 1.2), h: 2.4 },
    ...[0, 1, 2, 3, 4, 5, 6].flatMap((k) => [-1, 1].map((s) => ({ kind: 'tree', ...rect(s * 12, -251 - k * 26, 8, 8), h: 14 + (k % 3), sp: 0 }))),
    ...[[-205, -150, 1], [205, -160, 2], [-200, -215, 0], [200, -220, 1], [-120, -245, 2], [140, -250, 0], [-260, -95, 1], [-270, -170, 2], [265, -100, 0], [275, -180, 1],
      [-250, 110, 2], [-180, 130, 1], [200, 120, 0], [260, 105, 2], [-60, 140, 1], [70, 135, 0]].map(([x, z, sp]) => ({ kind: 'tree', ...rect(x, z, 8, 8), h: 15 + sp * 3, sp })),
  ],
  hazards: [],
  infractions: [],
  satellites: [],
};
