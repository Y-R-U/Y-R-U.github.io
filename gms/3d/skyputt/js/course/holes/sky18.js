// Sky Isles 18 — "Sky Crown": the finale. A windmill, a loop, a sliding-block gauntlet on the
// causeway and a bumper-guarded crown green high above the clouds. Par 5.
export default {
  id: 'sky18', name: 'Sky Crown', par: 5,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.4, walls: 'LR' },
      { x: 0, z: -1.8 },
      { x: 0.8, z: -3.6, w: 1.0 },
      { x: 1.0, z: -5.0 },
      { x: 1.0, z: -8.0 },
      { x: 1.0, z: -9.6, w: 0.5 },
      { x: 1.0, z: -10.6 },
    ] },
    { type: 'loop', radius: 0.44, shift: 0.8, width: 0.5 },
    { type: 'path', points: [
      { x: 0.2, z: -10.6, w: 0.5, walls: 'LR' },
      { x: 0.2, z: -11.6 },
      { x: 0.2, z: -12.6, w: 1.2 },
      { x: -0.6, z: -14.0, y: -0.1 },
      { x: -1.6, z: -15.0, y: -0.2 },
      { x: -2.0, z: -16.6, y: -0.2 },
      { x: -2.0, z: -19.0, y: -0.2 },
      { x: -1.4, z: -20.6, y: -0.06, w: 1.8 },
      { x: -1.4, z: -22.4, y: 0.0 },
      { x: -1.4, z: -23.6, y: 0.0 },
    ] },
  ],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'windmill', at: [1.0, -6.5], omega: 1.35, hub: 0.64, phase: 1.0 },
    { type: 'mover', at: [-2.0, -17.0], amp: 0.36, period: 2.8, size: [0.36, 0.16, 0.2] },
    { type: 'mover', at: [-2.0, -18.6], amp: 0.36, period: 2.2, phase: 1.6, size: [0.36, 0.16, 0.2] },
    { type: 'bumper', at: [-1.4, -21.8], u: 0.45 },
    { type: 'bumper', at: [-1.4, -21.8], u: -0.45 },
    { type: 'pickup', at: [0.6, -3.0], u: -0.3 },
    { type: 'pickup', at: [1.0, -8.8], u: 0 },
    { type: 'pickup', at: [-2.0, -17.8], u: 0 },
    { type: 'pickup', at: [-1.4, -20.6], u: -0.6 },
  ],
};
