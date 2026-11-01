// Sky Isles 1 — "First Bend": a gentle S-bend, par 2. Theme-independent data (D6).
// Points: x/z in metres (tee at the origin, heading -Z), y height, w width, walls 'L'/'R'/'LR'/'' for
// the segment to the next point; values carry forward to later points.
export default {
  id: 'sky1', name: 'First Bend', par: 2,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.5, walls: 'LR' },
      { x: 0, z: -1.6 },
      { x: -0.5, z: -3.4, y: -0.04 },
      { x: -1.5, z: -5.0, y: -0.12 },
      { x: -1.4, z: -6.6, y: -0.16 },
      { x: -0.4, z: -8.2, y: -0.18 },
      { x: 0, z: -9.6, y: -0.18, w: 1.6 },
      { x: 0, z: -11.0 },
    ] },
  ],
  tee: { s: 0.5 },
  cup: { s: -0.85 },
  features: [
    { type: 'pickup', s: 3.6, u: 0.25 },
    { type: 'pickup', s: 6.2, u: -0.3 },
    { type: 'pickup', s: 8.6, u: 0.2 },
  ],
};
