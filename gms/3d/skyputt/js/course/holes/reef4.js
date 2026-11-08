// Sunken Reef 4 — "Temple Tunnel": down the temple steps into a glass passage that swings left
// under the ruined arch and out over open water, then a short green that bends back right. Par 3.
export default {
  id: 'reef4', name: 'Temple Tunnel', par: 3,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0.3, w: 1.2, walls: 'LR' },
      { x: 0, z: -1.4 },
      { x: 0, z: -2.4, w: 0.3 },
      { x: 0, z: -3.0 },
    ] },
    { type: 'tube', radius: 0.15, points: [
      { x: 0, z: -3.0, y: 0.3 },
      { x: -0.5, z: -4.4, y: 0.22 },
      { x: -0.7, z: -5.8, y: 0.12 },
      { x: -0.3, z: -7.0, y: 0.04 },
      { x: 0, z: -7.6, y: 0 },
    ] },
    { type: 'path', points: [
      { x: 0, z: -7.6, y: 0, w: 0.3, walls: 'LR' },
      { x: 0, z: -8.2 },
      { x: 0, z: -9.2, w: 1.4 },
      { x: 0.6, z: -10.6 },
      { x: 0.7, z: -11.8 },
    ] },
  ],
  voids: [[[-1.7, -3.3], [0.9, -3.3], [0.9, -7.3], [-1.7, -7.3]]],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'bumper', at: [0, -1.0], u: 0.3, r: 0.09 },
    { type: 'sand', at0: [0.3, -9.8], at1: [0.6, -10.8], u0: 0.2 },
    { type: 'bumper', at: [0.6, -10.6], u: -0.35, r: 0.08 },
    { type: 'pickup', at: [0, -1.6], u: -0.35 },
    { type: 'pickup', at: [0, -8.8], u: 0 },
    { type: 'pickup', at: [0.6, -10.4], u: 0.4 },
  ],
};
