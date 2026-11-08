// Star Station 4 — "Airlock": down the ramp into the airlock tube, which swings right and drops
// across open space to the next module. The inner airlock door slides across the exit; time the
// run or wait for it on the landing. Par 3.
export default {
  id: 'star4', name: 'Airlock', par: 3,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0.3, w: 1.2, walls: 'LR' },
      { x: 0, z: -1.4 },
      { x: 0, z: -2.4, w: 0.3 },
      { x: 0, z: -3.0 },
    ] },
    { type: 'tube', radius: 0.15, points: [
      { x: 0, z: -3.0, y: 0.3 },
      { x: 0.5, z: -4.4, y: 0.22 },
      { x: 0.75, z: -5.8, y: 0.12 },
      { x: 0.35, z: -7.0, y: 0.04 },
      { x: 0, z: -7.6, y: 0 },
    ] },
    { type: 'path', points: [
      { x: 0, z: -7.6, y: 0, w: 0.3, walls: 'LR' },
      { x: 0, z: -8.2 },
      { x: 0, z: -9.2, w: 1.4 },
      { x: -0.6, z: -10.6 },
      { x: -0.7, z: -11.9 },
    ] },
  ],
  voids: [[[-0.9, -3.3], [1.8, -3.3], [1.8, -7.3], [-0.9, -7.3]]],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'bumper', at: [0, -1.0], u: -0.3, r: 0.09 },
    { type: 'mover', at: [0, -9.2], amp: 0.4, period: 2.8, size: [0.4, 0.16, 0.2] },
    { type: 'sticky', at0: [-0.3, -9.8], at1: [-0.6, -10.8], u1: -0.2 },
    { type: 'bumper', at: [-0.6, -10.8], u: 0.35, r: 0.08 },
    { type: 'pickup', at: [0, -1.6], u: 0.35 },
    { type: 'pickup', at: [0, -8.6], u: 0 },
    { type: 'pickup', at: [-0.6, -10.4], u: -0.4 },
  ],
};
