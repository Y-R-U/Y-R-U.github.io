// Jungle Temple 2 — "Rope Bridge": a rope-and-plank bridge slung over the gorge between two terraces.
// No walls, it sags a little and drifts left: a soft, straight putt or the mist takes it. Par 3.
export default {
  id: 'jungle2', name: 'Rope Bridge', par: 3,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.4, walls: 'LR' },
      { x: 0, z: -1.4 },
      { x: 0, z: -2.2, w: 0.86 },
      { x: 0, z: -2.7, walls: '', surf: 'bridge' },
      { x: 0, z: -3.7, y: -0.01 },
      { x: -0.1, z: -4.7, y: -0.015 },
      { x: -0.18, z: -5.7, y: -0.005 },
      { x: -0.25, z: -6.5, y: 0, w: 0.86, walls: 'LR', surf: 'grass' },
      { x: -0.25, z: -7.3, w: 1.5 },
      { x: -0.25, z: -8.5 },
      { x: -0.25, z: -9.5 },
    ] },
  ],
  voids: [[[-2.0, -2.95], [1.7, -2.95], [1.7, -6.25], [-2.0, -6.25]]],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'sticky', at0: [-0.25, -7.2], at1: [-0.25, -7.8], u0: 0.3 },
    { type: 'bumper', at: [-0.3, -8.4], u: 0.0, r: 0.09 },
    { type: 'pickup', at: [0, -1.4], u: 0.4 },
    { type: 'pickup', at: [-0.1, -4.7], u: 0 },
    { type: 'pickup', at: [-0.3, -7.6], u: 0.45 },
  ],
};
