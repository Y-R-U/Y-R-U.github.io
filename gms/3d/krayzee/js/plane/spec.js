// C172 geometry in the "build frame": y = height above ground, z = station aft of the spinner tip, x = right.
// The airframe group is then offset so the root origin sits on the CG.
export const CG = { s: 2.45, y: 1.2 };
export const THRUST_Y = 1.17;

// [station, halfWidth, top, bottom, waist, nTop, nBottom]
export const FUSELAGE = [
  [0.255, 0.17, 1.34, 1.0, 1.17, 2, 2],
  [0.285, 0.27, 1.42, 0.93, 1.17, 2.2, 2.2],
  [0.4, 0.4, 1.455, 0.83, 1.15, 2.4, 2.4],
  [0.65, 0.48, 1.475, 0.74, 1.13, 2.7, 2.5],
  [1.0, 0.515, 1.49, 0.7, 1.12, 3.0, 2.7],
  [1.45, 0.54, 1.505, 0.665, 1.12, 3.2, 2.9],
  [1.6, 0.55, 1.565, 0.645, 1.15, 3.4, 3.0],
  [1.95, 0.56, 1.84, 0.625, 1.2, 4.0, 3.2],
  [2.18, 0.56, 2.0, 0.612, 1.25, 4.6, 3.3],
  [2.6, 0.56, 2.03, 0.6, 1.3, 5.0, 3.3],
  [3.3, 0.55, 2.03, 0.63, 1.3, 5.0, 3.3],
  [3.85, 0.52, 2.01, 0.72, 1.33, 4.4, 3.1],
  [4.4, 0.45, 1.9, 0.86, 1.36, 3.4, 2.9],
  [5.1, 0.36, 1.765, 1.02, 1.39, 2.8, 2.6],
  [6.0, 0.26, 1.645, 1.18, 1.41, 2.5, 2.4],
  [7.0, 0.155, 1.565, 1.32, 1.44, 2.3, 2.3],
  [7.6, 0.085, 1.522, 1.39, 1.455, 2.2, 2.2],
  [7.95, 0.02, 1.492, 1.44, 1.465, 2, 2],
];

export const WING = {
  le: 2.18, rootChord: 1.63, tipChord: 1.12, te: 3.81,
  y: 2.03, // chord-line height at the root (bottom ~1.98, top ~2.17)
  taperStart: 2.55, tipX: 5.36, halfSpan: 5.5,
  dihedral: Math.tan((1.73 * Math.PI) / 180),
  flap: [0.6, 2.95], aileron: [3.0, 5.12], hingeChord: 0.74,
};

export const STAB = { y: 1.5, halfSpan: 1.72, rootLe: 6.98, tipLe: 7.32, hinge: 7.68, te: 8.2, tipTe: 8.13 };
export const FIN = { base: 1.46, top: 2.71, leBase: 6.62, leTop: 7.72, hingeBase: 7.84, hingeTop: 7.99, teBase: 8.17, teTop: 8.27 };

export const GEAR = {
  wheelR: 0.2, noseR: 0.17, mainS: 2.88, noseS: 1.12, track: 2.54,
};

// Window outlines in side projection [station, height]. Shared by the livery (holes) and the cabin walls.
export const WINDOWS = {
  windscreen: [[1.5, 1.56], [1.56, 1.505], [1.68, 1.47], [2.16, 1.955], [2.2, 2.1], [1.47, 2.1]],
  door: [[1.728, 1.475], [2.88, 1.475], [2.92, 1.51], [2.92, 1.87], [2.89, 1.9], [2.19, 1.9], [2.163, 1.89]],
  rear: [[3.0, 1.5], [3.0, 1.87], [3.03, 1.9], [3.7, 1.9], [3.95, 1.74], [3.96, 1.66], [3.62, 1.5]],
  back: [[3.93, 2.2], [3.94, 1.86], [4.05, 1.835], [4.62, 1.79], [4.66, 1.82], [4.6, 2.2]],
};

export const DOOR = [[1.76, 0.72], [2.97, 0.72], [2.97, 1.95], [2.2, 1.95], [1.74, 1.44]];

export const EYE = { x: -0.27, y: 1.645, s: 2.52, pitch: -0.09 };
export const PANEL = { s: 1.76, y0: 0.955, y1: 1.455, x0: -0.53, x1: 0.53 };

export const toLocal = (x, y, s) => [x, y - CG.y, s - CG.s];
