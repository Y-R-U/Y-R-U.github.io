// Hollow Woods 7 — "Crow's Fork": the path forks at the old signpost. Left is the long way, bending
// round a ravine past a grave-slab chicane. Right is a narrow log over the ravine with a jump in the
// middle: hit it straight and firm and you are by the green in one. Par 4.
export default {
  id: 'wood7', name: "Crow's Fork", par: 4,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.2, walls: 'LR' },
      { x: 0, z: -1.4 },
      { x: 0, z: -2.1, walls: 'L' },      // the right wall opens for the log
      { x: 0, z: -2.8, walls: 'LR' },
      { x: -0.6, z: -4.0 },
      { x: -1.6, z: -5.4 },
      { x: -1.7, z: -7.0 },
      { x: -1.0, z: -8.4 },
      { x: 0, z: -9.0, walls: 'L' },     // and again where it lands
      { x: 0.6, z: -9.6, walls: 'LR' },
      { x: 0.8, z: -10.8 },
      { x: 0.8, z: -12.0 },
      { x: 0.8, z: -13.0 },
    ] },
  ],
  branches: [
    { points: [
      { x: 0.35, z: -2.4, y: 0, w: 0.42, walls: '', surf: 'bridge' },
      { x: 0.7, z: -3.2 },
      { x: 0.75, z: -4.4, y: 0.08 },
      { x: 0.75, z: -5.0, y: 0.12, gap: true },
      { x: 0.75, z: -5.6, y: -0.02 },
      { x: 0.7, z: -7.6, y: 0 },
      { x: 0.4, z: -9.3, y: 0 },
    ] },
  ],
  voids: [[[-0.6, -3.4], [1.3, -3.4], [1.3, -8.4], [0.4, -8.9], [-0.4, -8.2], [-0.95, -7.0], [-0.9, -5.4]]],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'block', at: [-1.65, -5.8], u: 0.3, size: [0.3, 0.2, 0.07] },
    { type: 'block', at: [-1.65, -6.7], u: -0.3, size: [0.3, 0.2, 0.07] },
    { type: 'sand', at0: [0.6, -10.2], at1: [0.8, -10.6], u0: 0.1 },
    { type: 'pickup', at: [-1.6, -5.4], u: -0.35 },
    { type: 'pickup', at: [-1.0, -8.4], u: 0.3 },
    { type: 'pickup', at: [0.8, -11.0], u: -0.35 },
  ],
};
