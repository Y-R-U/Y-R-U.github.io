// Jungle Temple 3 — "Hollow Log": a fallen giant's hollow trunk bridges the gorge. Into the log, which
// swings left and drops to the lower terrace, then out past a mud wallow to a green behind an idol.
// Par 3.
export default {
  id: 'jungle3', name: 'Hollow Log', par: 3,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0.32, w: 1.2, walls: 'LR' },
      { x: 0, z: -1.4 },
      { x: 0, z: -2.4, w: 0.3 },
      { x: 0, z: -3.0 },
    ] },
    { type: 'tube', radius: 0.15, points: [
      { x: 0, z: -3.0, y: 0.32 },
      { x: -0.45, z: -4.3, y: 0.24 },
      { x: -0.8, z: -5.6, y: 0.13 },
      { x: -0.45, z: -6.8, y: 0.04 },
      { x: 0, z: -7.4, y: 0 },
    ] },
    { type: 'path', points: [
      { x: 0, z: -7.4, y: 0, w: 0.3, walls: 'LR' },
      { x: 0, z: -8.0 },
      { x: 0, z: -9.0, w: 1.3 },
      { x: 0.5, z: -10.3 },
      { x: 0.6, z: -11.6 },
    ] },
  ],
  voids: [[[-1.9, -3.3], [0.9, -3.3], [0.9, -7.1], [-1.9, -7.1]]],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'bumper', at: [0, -1.0], u: 0.3, r: 0.09 },
    { type: 'sticky', at0: [0, -8.8], at1: [0.3, -9.7], u0: 0.0 },
    { type: 'bumper', at: [0.55, -10.9], u: -0.1, r: 0.09 },
    { type: 'pickup', at: [0, -1.6], u: -0.35 },
    { type: 'pickup', at: [0, -8.5], u: 0 },
    { type: 'pickup', at: [0.5, -10.2], u: 0.45 },
  ],
};
