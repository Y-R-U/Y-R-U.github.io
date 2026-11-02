// Festival Isles 9 — "Grand Parade": the finale. A three-sail windmill, a bend, a boost pad up a ramp
// and over a drop to a bumper plaza, then a sliding block guarding the last straight. Par 4.
export default {
  id: 'fest9', name: 'Grand Parade', par: 4,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.4, walls: 'LR' },
      { x: 0, z: -1.6 },
      { x: 0, z: -2.6, w: 1.1 },
      { x: 0, z: -4.6 },
      { x: 0, z: -5.6, w: 1.3 },
      { x: 0.8, z: -7.0 },
      { x: 1.6, z: -8.0 },
      { x: 1.8, z: -9.0 },
      { x: 1.8, z: -10.4, y: 0.14, gap: true, walls: '' },
      { x: 1.8, z: -11.1, y: -0.2, w: 1.9, walls: 'LR' },
      { x: 1.8, z: -12.6, y: -0.2 },
      { x: 1.2, z: -14.0, y: -0.2, w: 1.3 },
      { x: 0.6, z: -15.2, y: -0.2 },
      { x: 0.6, z: -16.6, y: -0.2, w: 1.4 },
      { x: 0.6, z: -17.8, y: -0.2 },
    ] },
  ],
  voids: [[[-0.8, -10.3], [4.4, -10.3], [4.4, -11.2], [-0.8, -11.2]]],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'windmill', at: [0, -3.6], omega: 1.0, hub: 0.64, blades: 3 },
    { type: 'boost', at0: [1.8, -8.9], at1: [1.8, -9.7], u0: -0.3, u1: 0.3 },
    { type: 'bumper', at: [1.8, -12.0], u: 0.5 },
    { type: 'bumper', at: [1.8, -12.0], u: -0.5 },
    { type: 'mover', at: [0.6, -15.4], amp: 0.36, period: 2.8, size: [0.36, 0.16, 0.2] },
    { type: 'pickup', at: [0, -1.8], u: 0 },
    { type: 'pickup', at: [1.2, -7.6], u: 0.35 },
    { type: 'pickup', at: [1.8, -12.0], u: 0 },
  ],
};
