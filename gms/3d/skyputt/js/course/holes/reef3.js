// Sunken Reef 3 — "Shipwreck Deck": the fairway runs out onto the deck of a wreck. A narrow,
// wall-less plank deck kinks across open water to a green with two barrels by the cup. Par 3.
export default {
  id: 'reef3', name: 'Shipwreck Deck', par: 3,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.4, walls: 'LR' },
      { x: 0, z: -1.4 },
      { x: 0, z: -2.2, w: 0.68 },
      { x: 0, z: -2.7, walls: '', surf: 'bridge' },
      { x: 0.25, z: -4.1 },
      { x: 0.25, z: -5.3 },
      { x: 0, z: -6.4, w: 0.68, walls: 'LR', surf: 'grass' },
      { x: 0, z: -7.2, w: 1.5 },
      { x: 0, z: -8.4 },
      { x: 0, z: -9.4 },
    ] },
  ],
  voids: [[[-1.6, -2.95], [2.0, -2.95], [2.0, -6.1], [-1.6, -6.1]]],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'bumper', at: [0, -8.0], u: 0.4, r: 0.09 },
    { type: 'bumper', at: [0, -8.0], u: -0.4, r: 0.09 },
    { type: 'pickup', at: [0, -1.4], u: 0.4 },
    { type: 'pickup', at: [0.25, -4.6], u: 0 },
    { type: 'pickup', at: [0, -7.4], u: -0.45 },
  ],
};
