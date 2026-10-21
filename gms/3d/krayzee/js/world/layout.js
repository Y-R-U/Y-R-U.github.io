// Manager-owned. World frame: 1 unit = 1 m, +Y up, +X east, -Z north.
// Heading degrees: 0 = north (-Z), 90 = east (+X). headingToVec(h) gives the unit ground vector.

export const ELEV = 0;

export const RUNWAYS = [
  // Main runway 09/27: threshold of 09 at the west end.
  { id: '09/27', ends: ['09', '27'], center: [0, 0, 0], heading: 90, length: 1400, width: 30 },
  // Crosswind runway 04/22 crossing the main one east of centre — crossings are where the fun is.
  { id: '04/22', ends: ['04', '22'], center: [260, 0, -40], heading: 40, length: 950, width: 23 },
];

export const TAXIWAY_WIDTH = 15;
// Parallel taxiway north of 09/27, joined to it by stub connectors.
export const TAXIWAYS = [
  { id: 'A', points: [[-700, -110], [700, -110]] },
  { id: 'A1', points: [[-700, -110], [-700, 0]] },
  { id: 'A2', points: [[-250, -110], [-250, 0]] },
  { id: 'A3', points: [[150, -110], [150, 0]] },
  { id: 'A4', points: [[700, -110], [700, 0]] },
];

// Apron + terminal north of taxiway A. Stands face south toward the taxiway.
export const APRON = { center: [-80, 0, -207.5], size: [420, 180] };
export const TERMINAL = { center: [-80, 0, -320], size: [260, 45], height: 16 }; // eaves; centre hall vault ~23.5 m, crown ~30 m (colliders are exact)
export const TOWER = { position: [190, 0, -260], height: 38 };
export const STANDS = Array.from({ length: 8 }, (_, i) => ({ id: `S${i + 1}`, position: [-250 + i * 48, 0, -230], heading: 180 }));

export const PATTERN_ALT = 300;

export function headingToVec(deg) {
  const r = (deg * Math.PI) / 180;
  return [Math.sin(r), -Math.cos(r)];
}

// World XZ of a runway threshold (the end you land on / start the takeoff roll from).
export function threshold(rw, end) {
  const [dx, dz] = headingToVec(rw.heading);
  const s = end === rw.ends[0] ? -1 : 1;
  return [rw.center[0] + dx * s * rw.length / 2, rw.center[2] + dz * s * rw.length / 2];
}

export function runwayHeadingFor(rw, end) {
  return end === rw.ends[0] ? rw.heading : (rw.heading + 180) % 360;
}

// Hold-short lines sit this far from the runway centreline on every entry stub.
export const HOLD_OFFSET = 50;
// Circuit direction per landing end: 'L' left-hand, 'R' right-hand (keeps traffic off the terminal side).
export const CIRCUIT = { '09': 'R', '27': 'L', '04': 'R', '22': 'L' }; // all circuits fly south/east of the field, away from the terminal
