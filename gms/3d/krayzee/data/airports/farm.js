// C-Tower 2: Muckle Bottom Farm Strip (D26). Schema: docs/AIRPORTS.md §3.1, extras (props, mown, pond, windsocks) in docs/MAP.md.
// Laid out along +X like C-Tower 1, then turned 20° anticlockwise: grass runway 07/25 (620 m), a hedge track 'H' north of it,
// the farmyard (apron, 4 stands) behind that. World frame: +X east, -Z north, heading 0 = north.
import { FARM_LINES } from './farm-lines.js';

const ROT = -20;
const r = ROT * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
const P = ([x, z]) => [Math.round((x * c - z * s) * 10) / 10, Math.round((x * s + z * c) * 10) / 10];
const P3 = ([x, z]) => { const [a, b] = P([x, z]); return [a, 0, b]; };
const H = (h) => (((h + ROT) % 360) + 360) % 360;
const rect = (x, z, w, d, h = 0) => ({ center: P3([x, z]), size: [w, d], heading: H(h) });

export default {
  id: 'farm', n: 2, name: 'Muckle Bottom Farm Strip', short: 'Muckle Bottom',
  map: [-18, 6],
  elev: 40,
  center: [0, 0],
  controllers: ['mudge'],
  tower: { kind: 'watertank', position: P3([150, -265]), height: 16 },
  towerName: 'C-Tower 2 · Farmer Mudge',
  towerLines: FARM_LINES,
  wind: { from: H(270), kt: 7 },
  patternAlt: 250,
  runways: [
    { id: '07/25', ends: ['07', '25'], center: [0, 0, 0], heading: H(90), length: 620, width: 18, surface: 'grass', departures: true, closed: false, markings: 'grass' },
  ],
  taxiwayWidth: 10,
  parallel: 'H',
  taxiways: [
    { id: 'H', points: [P([-310, -90]), P([310, -90])] },
    { id: 'H1', points: [P([-310, -90]), P([-310, 0])] },
    { id: 'H2', points: [P([310, -90]), P([310, 0])] },
  ],
  holdOffset: 45,
  exitMin: 250,
  aprons: [rect(0, -175, 300, 160)],
  terminal: { kind: 'barn', ...rect(-40, -300, 44, 20), height: 11, label: 'ARRIVALS & SILAGE' },
  stands: [-90, -30, 30, 90].map((x, i) => ({ id: `S${i + 1}`, position: P3([x, -195]), heading: H(180) })),
  circuits: { '07': 'R', '25': 'L' },
  circuit: { upwindExt: 500, downwindOff: 900, finalLen: 1300, baseAlt: 120, secondaryAltStep: 150 },
  finish: { designated: null, radiusEasy: 300 },
  flat: [{ rect: [[-760, -560], [760, 420]] }],
  scenery: {
    biome: 'farm',
    mown: [rect(0, 0, 700, 70), rect(0, -150, 680, 250)],
    pond: { ...(([x, z]) => ({ x, z }))(P([-330, 250])), rx: 70, rz: 45 },
  },
  windsocks: [P([-150, 40]), P([200, 40])],
  props: [
    { kind: 'house', ...rect(85, -330, 16, 12), h: 8 },
    { kind: 'silo', ...rect(25, -300, 9, 9), h: 17 },
    { kind: 'silo', ...rect(10, -312, 7, 7), h: 13 },
    { kind: 'shed', ...rect(-120, -295, 22, 12), h: 6 },
    { kind: 'bales', ...rect(210, -200, 50, 40), h: 2.4 },
    { kind: 'tractor', ...rect(-185, -190, 5, 3, 30), h: 3 },
    { kind: 'hedge', pts: [P([-430, 70]), P([430, 70])], h: 2.2 },
    { kind: 'hedge', pts: [P([-430, -370]), P([-60, -370])], h: 2.4 },
    { kind: 'hedge', pts: [P([60, -370]), P([430, -370])], h: 2.4 },
    { kind: 'hedge', pts: [P([-430, -370]), P([-430, -140])], h: 2.4 },
    { kind: 'hedge', pts: [P([430, -370]), P([430, -140])], h: 2.4 },
    { kind: 'flock', type: 'sheep', ...rect(30, 160, 500, 110), count: 34 },
    { kind: 'flock', type: 'cow', ...rect(-380, -240, 80, 100), count: 9 },
    { kind: 'flock', type: 'cow', ...rect(360, -250, 70, 80), count: 6 },
  ],
  hazards: [],
  infractions: [],
  satellites: [],
};
