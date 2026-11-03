// Sugar Summit 7 — "Frosting Fork": the trail forks. Left is the long climb round the frosting
// shelf past a gumdrop chicane and a caramel bend. Right is a narrow, wall-less candy-cane bridge
// that rears up over the drop straight to the green: firm and true, or it rolls back. Par 4.
export default {
  id: 'sugar7', name: 'Frosting Fork', par: 4,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.2, walls: 'LR' },
      { x: 0, z: -1.4 },
      { x: 0, z: -2.1, walls: 'L' },      // the right wall opens for the bridge
      { x: 0, z: -2.8, walls: 'LR' },
      { x: -0.6, z: -4.0, y: 0.06 },
      { x: -1.6, z: -5.4, y: 0.16 },
      { x: -1.7, z: -7.0, y: 0.28 },
      { x: -1.0, z: -8.4, y: 0.38 },
      { x: 0, z: -9.0, y: 0.42, walls: 'L' },     // and again where it lands
      { x: 0.6, z: -9.6, y: 0.42, walls: 'LR' },
      { x: 0.8, z: -10.8, y: 0.42 },
      { x: 0.8, z: -12.0, y: 0.42 },
      { x: 0.8, z: -13.0, y: 0.42 },
    ] },
  ],
  branches: [
    { points: [
      { x: 0.35, z: -2.4, y: 0, w: 0.42, walls: '', surf: 'bridge' },
      { x: 0.7, z: -3.2, y: 0 },
      { x: 0.75, z: -5.4, y: 0.02 },
      { x: 0.72, z: -7.4, y: 0.3 },
      { x: 0.6, z: -8.6, y: 0.42 },
      { x: 0.4, z: -9.3, y: 0.42 },
    ] },
  ],
  voids: [[[-0.6, -3.4], [1.3, -3.4], [1.3, -8.4], [0.4, -8.9], [-0.4, -8.2], [-0.95, -7.0], [-0.9, -5.4]]],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'bumper', at: [-1.65, -5.8], u: 0.3, r: 0.09 },
    { type: 'bumper', at: [-1.65, -6.8], u: -0.3, r: 0.09 },
    { type: 'sticky', at0: [-1.5, -7.6], at1: [-0.6, -8.7], u1: -0.1 },
    { type: 'pickup', at: [-1.6, -5.4], u: -0.35 },
    { type: 'pickup', at: [-1.0, -8.4], u: 0.3 },
    { type: 'pickup', at: [0.8, -11.0], u: -0.35 },
  ],
};
