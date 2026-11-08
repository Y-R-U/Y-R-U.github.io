// Star Station 6 — "Asteroid Hop": three floating platforms. A ramp throws the ball over the first
// drop, the middle platform bends round a regolith drift, then a gravity accelerator launches it
// over the long second gap to the green. Par 3.
export default {
  id: 'star6', name: 'Asteroid Hop', par: 3,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.3, walls: 'LR' },
      { x: 0, z: -1.6 },
      { x: 0, z: -3.0 },
      { x: 0, z: -4.0, y: 0.14, gap: true, walls: '' },
      { x: 0, z: -4.7, y: -0.18, w: 1.6, walls: 'LR' },
      { x: 0, z: -6.0, y: -0.18 },
      { x: 1.0, z: -7.4, y: -0.18, w: 1.3 },
      { x: 2.2, z: -8.2, y: -0.18 },
      { x: 2.8, z: -9.6, y: -0.18, w: 1.1 },
      { x: 2.8, z: -11.0, y: -0.18 },
      { x: 2.8, z: -12.0, y: 0.08, gap: true, walls: '' },
      { x: 2.8, z: -13.2, y: -0.32, w: 1.7, walls: 'LR' },
      { x: 2.8, z: -14.4, y: -0.32 },
      { x: 2.3, z: -15.8, y: -0.32, w: 1.5 },
      { x: 2.3, z: -17.0, y: -0.32 },
    ] },
  ],
  voids: [
    [[-2.6, -3.7], [2.6, -3.7], [2.6, -5.0], [-2.6, -5.0]],
    [[0.2, -11.7], [5.4, -11.7], [5.4, -13.3], [0.2, -13.3]],
  ],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'sand', at0: [0.9, -7.2], at1: [2.1, -8.1], u0: 0.2 },
    { type: 'boost', at0: [2.8, -9.9], at1: [2.8, -10.8] },
    { type: 'bumper', at: [2.3, -16.4], u: 0.35, r: 0.08 },
    { type: 'pickup', at: [0, -2.4], u: 0 },
    { type: 'pickup', at: [1.6, -7.9], u: -0.4 },
    { type: 'pickup', at: [2.8, -13.8], u: -0.5 },
  ],
};
