// C-Tower 1: Krayzee Royal Aerodrome. Schema: docs/AIRPORTS.md §3.1. World frame: +X east, -Z north, heading 0 = north.
export default {
  id: 'royal', n: 1, name: 'Krayzee Royal Aerodrome', short: 'Krayzee Royal',
  map: [0, 0],
  elev: 0,
  center: [0, 0],                      // field reference point: arrival spawn ring, ATC region radius
  controllers: ['gerald', 'imogen', 'toby'],
  wind: { from: 270, kt: 8 },
  patternAlt: 300,
  runways: [
    // Main runway 09/27: threshold of 09 at the west end.
    { id: '09/27', ends: ['09', '27'], center: [0, 0, 0], heading: 90, length: 1400, width: 30, surface: 'asphalt', departures: true, closed: false, markings: 'icao' },
    // Crosswind runway 04/22 crossing the main one east of centre: crossings are where the fun is. Closed unless a mission
    // or decree opens it, and arrivals-only when open.
    { id: '04/22', ends: ['04', '22'], center: [260, 0, -40], heading: 40, length: 950, width: 23, surface: 'asphalt', departures: false, closed: true, markings: 'icao' },
  ],
  taxiwayWidth: 15,
  // Parallel taxiway north of 09/27, joined to it by stub connectors.
  taxiways: [
    { id: 'A', points: [[-700, -110], [700, -110]] },
    { id: 'A1', points: [[-700, -110], [-700, 0]] },
    { id: 'A2', points: [[-250, -110], [-250, 0]] },
    { id: 'A3', points: [[150, -110], [150, 0]] },
    { id: 'A4', points: [[700, -110], [700, 0]] },
  ],
  holdOffset: 50,                      // hold-short lines this far from the runway centreline on every entry stub
  // Apron + terminal north of taxiway A. heading rotates a rect (0 = size[0] along +X).
  aprons: [{ center: [-80, 0, -207.5], size: [420, 180], heading: 0 }],
  terminal: { kind: 'royal', center: [-80, 0, -320], size: [260, 45], height: 16, heading: 0 }, // eaves; centre hall vault ~23.5 m, crown ~30 m (colliders are exact)
  tower: { kind: 'royal', position: [190, 0, -260], height: 38 },
  // Stands face south toward the taxiway.
  stands: Array.from({ length: 8 }, (_, i) => ({ id: `S${i + 1}`, position: [-250 + i * 48, 0, -230], heading: 180 })),
  // Circuit side per landing end, 'L' | 'R': every circuit flies south/east of the field, away from the terminal.
  circuits: { '09': 'R', '27': 'L', '04': 'R', '22': 'L' },
  circuit: { upwindExt: 750, downwindOff: 1150, finalLen: 1800, baseAlt: 150, secondaryAltStep: 150 },
  finish: { designated: null, radiusEasy: 300 },
  // Scenery that A2 moves out of js/world/terrain.js (values mirror its constants today).
  flat: [{ rect: [[-1050, -640], [1050, 620]] }],
  scenery: {
    biome: 'royal',
    village: { x0: -660, x1: 400, z0: -1900, z1: -1170 },
    castle: { x: 780, z: -2300, top: 70, r0: 125, r1: 640 },
    lake: { x: -1700, z: -700, rx: 380, rz: 230 },
    longRoadZ: -1240,
  },
  hazards: [],
  infractions: [],
  satellites: [],
};
