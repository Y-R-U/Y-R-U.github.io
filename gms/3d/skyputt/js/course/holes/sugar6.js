// Sugar Summit 6 — "Lollipop Loops": two loops back to back. A sugar rush lane sends you round the
// first, a second lane between them recharges you for the second, and a short climb takes you up to
// the green. Par 3.
export default {
  id: 'sugar6', name: 'Lollipop Loops', par: 3,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.3, walls: 'LR' },
      { x: 0, z: -1.4 },
      { x: 0, z: -3.0, w: 0.56 },
      { x: 0, z: -4.0 },
    ] },
    { type: 'loop', radius: 0.42, shift: -0.82, width: 0.56 },
    { type: 'path', points: [
      { x: 0.82, z: -4.0, w: 0.56, walls: 'LR' },
      { x: 0.82, z: -5.0 },
      { x: 0.82, z: -6.4 },
      { x: 0.82, z: -7.2 },
    ] },
    { type: 'loop', radius: 0.42, shift: 0.82, width: 0.56 },
    { type: 'path', points: [
      { x: 0, z: -7.2, w: 0.56, walls: 'LR' },
      { x: 0, z: -8.2 },
      { x: 0, z: -9.6, y: 0.24, w: 1.3 },
      { x: 0, z: -10.4, y: 0.28 },
      { x: 0, z: -11.8, y: 0.28, w: 1.4 },
      { x: 0, z: -12.8, y: 0.28 },
    ] },
  ],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'boost', at0: [0, -1.8], at1: [0, -2.7], u0: -0.3, u1: 0.3 },
    { type: 'boost', at0: [0.82, -5.0], at1: [0.82, -6.0] },
    { type: 'bumper', at: [0, -11.6], u: 0.42, r: 0.09 },
    { type: 'pickup', at: [0, -1.2], u: -0.4 },
    { type: 'pickup', at: [0.82, -4.6], u: 0 },
    { type: 'pickup', at: [0, -10.6], u: -0.4 },
  ],
};
