// Festival Isles 8 — "Toboggan Run": an icy, banked run snakes down the hill past two bumpers; a sticky
// mat at the bottom slows you for the green. Pace, not power. Par 3.
export default {
  id: 'fest8', name: 'Toboggan Run', par: 3,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0.5, w: 1.4, walls: 'LR' },
      { x: 0, z: -1.4 },
      { x: -0.4, z: -3.0, y: 0.42, bank: 0 },
      { x: -1.6, z: -4.4, y: 0.32, bank: -10 },
      { x: -2.0, z: -6.0, y: 0.22, bank: 0 },
      { x: -1.4, z: -7.6, y: 0.13, bank: 10 },
      { x: 0, z: -8.6, y: 0.06, bank: 0 },
      { x: 0.6, z: -10.0, y: 0.02, w: 1.5 },
      { x: 0.6, z: -11.4, y: 0 },
      { x: 0.6, z: -12.6, y: 0 },
    ] },
  ],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'ice', at0: [-0.1, -2.2], at1: [0.2, -9.0] },
    { type: 'bumper', at: [-2.0, -6.0], u: -0.3 },
    { type: 'bumper', at: [-0.7, -8.2], u: 0.3 },
    { type: 'sticky', at0: [0.5, -9.8], at1: [0.6, -10.6] },
    { type: 'pickup', at: [-1.6, -4.4], u: 0.4 },
    { type: 'pickup', at: [-2.0, -6.0], u: 0.35 },
    { type: 'pickup', at: [0.6, -10.8], u: -0.45 },
  ],
};
