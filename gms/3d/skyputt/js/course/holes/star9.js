// Star Station 9 — "Star Gate": the finale. Through the solar array gate, a gravity accelerator
// into the orbit ring, a leap across the void to the command deck, then a docking arm guards a
// green ringed by four beacon pylons. Par 5.
export default {
  id: 'star9', name: 'Star Gate', par: 5,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0.3, w: 1.2, walls: 'LR' },
      { x: 0, z: -1.6 },
      { x: 0, z: -3.4 },
      { x: 0, z: -4.4, w: 1.0 },
      { x: -0.8, z: -6.0, y: 0.3 },
      { x: -0.8, z: -7.2, y: 0.3, w: 0.56 },
      { x: -0.8, z: -8.2, y: 0.3 },
    ] },
    { type: 'loop', radius: 0.45, shift: 0.82, width: 0.56 },
    { type: 'path', points: [
      { x: -1.62, z: -8.2, y: 0.3, w: 0.56, walls: 'LR' },
      { x: -1.62, z: -9.0 },
      { x: -1.62, z: -9.9, y: 0.36, w: 0.9 },
      { x: -1.62, z: -10.5, y: 0.44, gap: true, walls: '' },
      { x: -1.62, z: -11.3, y: 0.06, w: 1.6, walls: 'LR' },
      { x: -1.62, z: -12.4 },
      { x: -1.62, z: -13.8, w: 1.5 },
      { x: -1.62, z: -15.0 },
    ] },
  ],
  voids: [[[-4.2, -10.3], [1.0, -10.3], [1.0, -11.45], [-4.2, -11.45]]],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'windmill', at: [0, -2.6], omega: 1.0, hub: 0.64, blades: 4, bladeW: 0.18, gap: 0.38 },
    { type: 'boost', at0: [-0.8, -7.2], at1: [-0.8, -8.1] },
    { type: 'mover', at: [-1.62, -12.4], amp: 0.42, period: 3.0, size: [0.44, 0.16, 0.2] },
    { type: 'bumper', at: [-1.62, -13.4], u: 0.52, r: 0.08 },
    { type: 'bumper', at: [-1.62, -13.4], u: -0.52, r: 0.08 },
    { type: 'bumper', at: [-1.62, -14.6], u: 0.42, r: 0.08 },
    { type: 'bumper', at: [-1.62, -14.6], u: -0.42, r: 0.08 },
    { type: 'pickup', at: [0, -1.4], u: -0.35 },
    { type: 'pickup', at: [-0.8, -6.4], u: 0 },
    { type: 'pickup', at: [-1.62, -11.9], u: 0.4 },
  ],
};
