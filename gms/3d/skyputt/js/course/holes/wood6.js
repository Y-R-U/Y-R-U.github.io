// Hollow Woods 6 — "Hollow Log": out along a raised boardwalk, round the bend, and into a hollow log
// that dives under the boardwalk you just walked and spits you out beside it. Par 3.
export default {
  id: 'wood6', name: 'Hollow Log', par: 3,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0.6, w: 1.2, walls: 'LR' },
      { x: 0, z: -1.6 },
      { x: 0, z: -3.6 },
      { x: 0.4, z: -5.0 },
      { x: 1.4, z: -5.8 },
      { x: 2.5, z: -5.3 },
      { x: 2.9, z: -4.2, w: 0.3 },
      { x: 2.9, z: -3.7 },
    ] },
    { type: 'tube', radius: 0.15, points: [
      { x: 2.9, z: -3.7, y: 0.6 },
      { x: 2.8, z: -3.0, y: 0.5 },
      { x: 2.1, z: -2.4, y: 0.32 },
      { x: 1.0, z: -2.2, y: 0.14 },
      { x: -0.6, z: -2.2, y: 0.08 },
      { x: -1.9, z: -2.5, y: 0.05 },
      { x: -2.5, z: -3.3, y: 0.03 },
      { x: -2.6, z: -4.2, y: 0.02 },
    ] },
    { type: 'path', points: [
      { x: -2.6, z: -4.2, y: 0.02, w: 0.3, walls: 'LR' },
      { x: -2.6, z: -4.8 },
      { x: -2.6, z: -5.8, w: 1.3 },
      { x: -2.9, z: -7.2, y: 0.0 },
      { x: -2.9, z: -8.4, y: 0.0 },
      { x: -2.9, z: -9.4, y: 0.0 },
    ] },
  ],
  // the tunnel passes under the boardwalk: keep rock out so the log reads as a crossing
  voids: [[[-2.0, -1.6], [2.4, -1.6], [2.4, -2.9], [-2.0, -2.9]]],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'bumper', at: [-2.8, -6.6], u: -0.3 },
    { type: 'pickup', at: [0, -3.2], u: 0 },
    { type: 'pickup', at: [1.4, -5.8], u: -0.3 },
    { type: 'pickup', at: [-2.7, -6.4], u: 0.35 },
  ],
};
