// Festival Isles 6 — "Tightrope": the fairway swings wide around a drop; a long, thin wall-less plank
// cuts straight across it to the green side. Safe and steady round the arc, or walk the wire. Par 4.
export default {
  id: 'fest6', name: 'Tightrope', par: 4,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.3, walls: 'LR' },
      { x: 0, z: -1.4 },
      { x: 0, z: -2.0, walls: 'L' },        // the right wall opens where the plank leaves
      { x: 0, z: -2.7, walls: 'LR' },
      { x: -1.0, z: -3.6 },
      { x: -2.3, z: -4.6 },
      { x: -2.6, z: -6.2 },
      { x: -1.9, z: -7.6 },
      { x: -0.6, z: -8.4, walls: 'L' },     // and again where it lands
      { x: 0.4, z: -8.9, walls: 'LR' },
      { x: 0.8, z: -9.8 },
      { x: 0.8, z: -11.0 },
      { x: 0.8, z: -12.2 },
    ] },
  ],
  branches: [
    { points: [{ x: 0.6, z: -2.3, y: 0, w: 0.4, walls: '', surf: 'bridge' }, { x: 0.3, z: -8.3 }] },
  ],
  voids: [[[-0.8, -3.2], [0.95, -3.2], [0.95, -7.8], [-0.6, -7.8], [-1.6, -7.0], [-1.85, -5.6], [-1.6, -4.4]]],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'pickup', at: [-0.6, -8.4], u: -0.35 },
    { type: 'pickup', at: [-2.6, -6.0], u: 0.3 },
    { type: 'pickup', at: [0.8, -10.0], u: -0.4 },
  ],
};
