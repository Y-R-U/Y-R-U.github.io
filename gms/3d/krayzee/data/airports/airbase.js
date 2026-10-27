// C-Tower 4: RAF Much Snoring, the long-runway air base for heavies (D29, D33). Schema: docs/AIRPORTS.md §3.1 + docs/MAP.md.
// C-Tower 1's layout, stretched: 09/27 2800 × 45 m, parallel taxiway A with four stubs, a big apron with 8 stands
// (heavies take two), ops block, tower, shelters and a radar. World frame: +X east, -Z north, heading 0 = north.
const rect = (x, z, w, d, heading = 0) => ({ center: [x, 0, z], size: [w, d], heading });

export default {
  id: 'airbase', n: 4, name: 'RAF Much Snoring', short: 'Much Snoring',
  map: [24, -16],
  elev: 20,
  center: [0, 0],
  controllers: ['imogen'],
  tower: { kind: 'military', position: [260, 0, -330], height: 30 },
  towerName: 'C-Tower 4 · Much Snoring',
  towerVoice: 'tower_f',
  wind: { from: 270, kt: 9 },
  patternAlt: 300,
  runways: [
    { id: '09/27', ends: ['09', '27'], center: [0, 0, 0], heading: 90, length: 2800, width: 45, surface: 'asphalt', departures: true, closed: false, markings: 'icao' },
  ],
  taxiwayWidth: 20,
  parallel: 'A',
  taxiways: [
    { id: 'A', points: [[-1400, -150], [1400, -150]] },
    { id: 'A1', points: [[-1400, -150], [-1400, 0]] },
    { id: 'A2', points: [[-500, -150], [-500, 0]] },
    { id: 'A3', points: [[400, -150], [400, 0]] },
    { id: 'A4', points: [[1400, -150], [1400, 0]] },
  ],
  holdOffset: 60,
  aprons: [rect(-250, -290, 640, 260)],
  terminal: { kind: 'ops', ...rect(-250, -470, 200, 30), height: 12, label: 'RAF MUCH SNORING' },
  stands: Array.from({ length: 8 }, (_, i) => ({ id: `S${i + 1}`, position: [-520 + i * 64, 0, -330], heading: 180 })),
  circuits: { '09': 'R', '27': 'L' },
  circuit: { upwindExt: 750, downwindOff: 1150, finalLen: 1800, baseAlt: 150, secondaryAltStep: 150 },
  finish: { designated: null, radiusEasy: 300 },
  flat: [{ rect: [[-2100, -760], [2100, 640]] }],
  scenery: {
    biome: 'airbase',
    mown: [rect(0, -130, 3200, 560)],
    pond: null,
  },
  windsocks: [[-1050, 75], [1050, 75]],
  props: [
    { kind: 'hangar', ...rect(-720, -330, 90, 60), h: 22 },
    { kind: 'shelter', ...rect(440, -310, 30, 40), h: 10 },
    { kind: 'shelter', ...rect(520, -310, 30, 40), h: 10 },
    { kind: 'shelter', ...rect(600, -310, 30, 40), h: 10 },
    { kind: 'fueltank', ...rect(760, -330, 18, 18), h: 9 },
    { kind: 'fueltank', ...rect(790, -330, 18, 18), h: 9 },
    { kind: 'radar', ...rect(900, -270, 14, 14), h: 18 },
    { kind: 'shed', ...rect(140, -470, 40, 20), h: 7 },
    { kind: 'shed', ...rect(-560, -470, 50, 20), h: 7 },
  ],
  hazards: [],
  infractions: [],
  satellites: [],
};
