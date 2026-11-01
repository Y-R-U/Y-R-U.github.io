// Sky Isles 4 — "Sand Steps": down two gentle terraces, a sand trap across the right and centre;
// the left lane is clean. Par 3.
export default {
  id: 'sky4', name: 'Sand Steps', par: 3,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.5, walls: 'LR' },
      { x: 0, z: -1.8 },
      { x: 0.5, z: -3.8, y: -0.22 },
      { x: 0.7, z: -6.2, y: -0.28 },
      { x: 0.1, z: -8.4, y: -0.5 },
      { x: -0.4, z: -10.2, y: -0.56, w: 1.6 },
      { x: -0.4, z: -11.8, y: -0.56 },
    ] },
  ],
  tee: { s: 0.5 }, cup: { s: -0.85 },
  features: [
    { type: 'sand', at0: [0.6, -4.6], at1: [0.6, -6.4], u1: 0.1 },
    { type: 'sand', at0: [-0.3, -9.0], at1: [-0.35, -9.6], u0: 0.1 },
    { type: 'bumper', at: [-0.4, -10.0], u: 0.3 },
    { type: 'pickup', at: [0.3, -3.0], u: -0.3 },
    { type: 'pickup', at: [0.7, -5.4], u: 0.45 },
    { type: 'pickup', at: [-0.2, -9.3], u: -0.4 },
  ],
};
