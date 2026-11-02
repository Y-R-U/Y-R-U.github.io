// Hollow Woods 9 — "Headless Hollow": the finale. From the crag, past a sliding coffin, off a ledge onto
// the frozen pond, into the hollow log that corkscrews down round the hanging tree, and out onto a
// green ringed with graves. Par 5.
export default {
  id: 'wood9', name: 'Headless Hollow', par: 5,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 1.3, w: 1.2, walls: 'LR' },
      { x: 0, z: -1.4 },
      { x: 0, z: -2.4, w: 1.1 },
      { x: 0, z: -3.8 },
      { x: 0, z: -3.9 },
      { x: 0, z: -3.91, gap: true, walls: '' },       // the ledge
      { x: 0, z: -4.3, y: 0.95, w: 2.0, walls: 'LR' },
      { x: 0, z: -4.4 },
      { x: -0.4, z: -6.4, w: 2.8 },
      { x: -0.2, z: -8.2, w: 2.0 },
      { x: 0.4, z: -9.4, w: 0.3 },
      { x: 0.4, z: -10.0 },
    ] },
    { type: 'tube', radius: 0.15, points: [
      { x: 0.4, z: -10.0, y: 0.95 },
      { x: 0.4, z: -10.8, y: 0.9 },
      { x: -0.4, z: -11.8, y: 0.78 },
      { x: -1.3, z: -11.3, y: 0.66 },
      { x: -1.4, z: -10.3, y: 0.54 },
      { x: -0.6, z: -9.7, y: 0.42 },
      { x: 0.3, z: -10.2, y: 0.3 },
      { x: 0.6, z: -11.4, y: 0.18 },
      { x: 0.6, z: -12.6, y: 0.08 },
      { x: 0.6, z: -13.4, y: 0.04 },
    ] },
    { type: 'path', points: [
      { x: 0.6, z: -13.4, y: 0.04, w: 0.3, walls: 'LR' },
      { x: 0.6, z: -14.0 },
      { x: 0.6, z: -15.0, w: 1.8 },
      { x: 0.2, z: -16.6, y: 0.0 },
      { x: 0.2, z: -18.0, y: 0.0 },
      { x: 0.2, z: -19.2, y: 0.0 },
    ] },
  ],
  branches: [
    { points: [{ x: 0, z: -3.45, y: 1.26, w: 1.1, walls: 'LR' }, { x: 0, z: -3.9, y: 0.97 }, { x: 0, z: -4.3, y: 0.95, w: 2.0, walls: '' }, { x: 0, z: -4.8 }] },
  ],
  voids: [[[-1.9, -9.2], [-0.2, -9.2], [-0.2, -12.2], [-1.9, -12.2]]],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'mover', at: [0, -3.0], amp: 0.26, period: 2.6, size: [0.34, 0.16, 0.12] },   // stops 12 cm short of the walls: no pinch
    { type: 'ice', at0: [0, -4.6], at1: [0.2, -9.0] },
    { type: 'bumper', at: [-0.4, -6.4], u: 0.7, r: 0.11 },
    { type: 'bumper', at: [-0.4, -6.4], u: -0.5, r: 0.11 },
    { type: 'bumper', at: [-0.2, -7.9], u: 0.1, r: 0.11 },
    { type: 'block', at: [0.2, -17.6], u: 0.42, size: [0.22, 0.2, 0.07] },
    { type: 'block', at: [0.2, -17.6], u: -0.42, size: [0.22, 0.2, 0.07] },
    { type: 'block', at: [0.2, -18.8], u: 0.3, size: [0.22, 0.2, 0.07] },
    { type: 'block', at: [0.2, -18.8], u: -0.3, size: [0.22, 0.2, 0.07] },
    { type: 'mover', at: [0.4, -16.4], amp: 0.4, period: 3.2, size: [0.34, 0.16, 0.18] },
    { type: 'pickup', at: [0, -1.6], u: 0 },
    { type: 'pickup', at: [-0.4, -6.4], u: 0.1 },
    { type: 'pickup', at: [0.6, -15.2], u: 0.55 },
    { type: 'pickup', at: [0.2, -17.0], u: -0.5 },
  ],
};
