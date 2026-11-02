// Festival Isles 3 — "Ferris Slide": a boost pad into the big wheel (a loop), then a glass slide that
// snakes down to a lower green. Par 3.
export default {
  id: 'fest3', name: 'Ferris Slide', par: 3,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.3, walls: 'LR' },
      { x: 0, z: -1.4 },
      { x: 0, z: -3.0, w: 0.56 },
      { x: 0, z: -4.0 },
    ] },
    { type: 'loop', radius: 0.42, shift: 0.82, width: 0.56 },
    { type: 'path', points: [
      { x: -0.82, z: -4.0, w: 0.56, walls: 'LR' },
      { x: -0.82, z: -5.0 },
      { x: -0.82, z: -5.6, w: 0.3 },
      { x: -0.82, z: -6.0 },
    ] },
    { type: 'tube', radius: 0.15, points: [
      { x: -0.82, z: -6.0, y: 0 },
      { x: -0.82, z: -6.8, y: -0.06 },
      { x: -0.3, z: -7.8, y: -0.16 },
      { x: 0.7, z: -8.2, y: -0.26 },
      { x: 1.4, z: -9.0, y: -0.36 },
      { x: 1.4, z: -10.0, y: -0.42 },
      { x: 1.4, z: -10.8, y: -0.46 },
    ] },
    { type: 'path', points: [
      { x: 1.4, z: -10.8, y: -0.46, w: 0.3, walls: 'LR' },
      { x: 1.4, z: -11.4 },
      { x: 1.4, z: -12.4, w: 1.5 },
      { x: 0.9, z: -13.8 },
      { x: 0.9, z: -15.0 },
    ] },
  ],
  voids: [[[-0.5, -6.6], [2.6, -6.6], [2.6, -10.4], [-0.5, -10.4]]],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'boost', at0: [0, -1.8], at1: [0, -2.6], u0: -0.3, u1: 0.3 },
    { type: 'bumper', at: [1.2, -13.0], u: -0.4 },
    { type: 'pickup', at: [0, -1.2], u: 0.4 },
    { type: 'pickup', at: [-0.82, -5.0], u: 0 },
    { type: 'pickup', at: [1.2, -12.9], u: 0.35 },
  ],
};
