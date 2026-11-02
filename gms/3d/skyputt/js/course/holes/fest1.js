// Festival Isles 1 — "Lantern Lane": a gentle opener. A soft S under the bunting, a bumper on the
// outside of the second bend to bank off, and a little sand in the inside corner. Par 2.
export default {
  id: 'fest1', name: 'Lantern Lane', par: 2,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.4, walls: 'LR' },
      { x: 0, z: -1.6 },
      { x: -0.5, z: -3.4, w: 1.5 },
      { x: -0.3, z: -5.0, y: -0.04 },
      { x: 0.6, z: -6.4, y: -0.08, w: 1.4 },
      { x: 0.9, z: -7.8, y: -0.08 },
      { x: 0.9, z: -9.0, y: -0.08 },
    ] },
  ],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'bumper', at: [0.5, -6.3], u: 0.5 },
    { type: 'sand', at0: [-0.3, -5.4], at1: [0.3, -6.1], u1: -0.35 },
    { type: 'pickup', at: [0, -1.8], u: 0.35 },
    { type: 'pickup', at: [-0.45, -4.2], u: -0.4 },
    { type: 'pickup', at: [0.9, -7.6], u: 0.4 },
  ],
};
