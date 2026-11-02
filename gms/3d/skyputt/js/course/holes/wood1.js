// Hollow Woods 1 — "Crooked Path": a narrow track that winds left, right and left again between the
// trees, with a grave slab on the inside of each bend. No room for lazy lines. Par 3.
export default {
  id: 'wood1', name: 'Crooked Path', par: 3,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.2, walls: 'LR' },
      { x: 0, z: -1.2 },
      { x: 0.2, z: -2.2, w: 0.95 },
      { x: 1.1, z: -3.2 },
      { x: 1.2, z: -4.4, y: -0.04 },
      { x: 0.3, z: -5.4, y: -0.08 },
      { x: -0.9, z: -6.0, y: -0.1 },
      { x: -1.3, z: -7.2, y: -0.12 },
      { x: -0.8, z: -8.4, y: -0.14 },
      { x: 0.2, z: -9.2, y: -0.16, w: 1.1 },
      { x: 0.5, z: -10.4, y: -0.16 },
      { x: 0.5, z: -11.6, y: -0.16 },
      { x: 0.5, z: -12.6, y: -0.16 },
    ] },
  ],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'block', at: [1.15, -3.9], u: -0.3, size: [0.2, 0.2, 0.07] },
    { type: 'block', at: [-1.25, -7.0], u: 0.3, size: [0.2, 0.2, 0.07] },
    { type: 'bumper', at: [0.5, -10.6], u: 0.3, r: 0.08 },
    { type: 'pickup', at: [1.1, -3.2], u: 0.25 },
    { type: 'pickup', at: [-0.9, -6.0], u: 0.0 },
    { type: 'pickup', at: [0.2, -9.2], u: -0.3 },
  ],
};
