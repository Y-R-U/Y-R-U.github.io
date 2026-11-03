// Sugar Summit 1 — "Base Camp": a friendly opener at the foot of the candy mountain. A gentle climb
// round a soft bend, a gumdrop on the outside to bank off and one in the middle of the climb. Par 2.
export default {
  id: 'sugar1', name: 'Base Camp', par: 2,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.3, walls: 'LR' },
      { x: 0, z: -1.6 },
      { x: 0, z: -4.0, y: 0.14 },
      { x: -0.6, z: -6.0, y: 0.2, w: 1.2 },
      { x: -1.2, z: -7.6, y: 0.22, w: 1.4 },
      { x: -1.2, z: -9.0, y: 0.22 },
      { x: -1.2, z: -10.0, y: 0.22 },
    ] },
  ],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'bumper', at: [0, -3.0], u: 0.0, r: 0.1 },
    { type: 'bumper', at: [-0.6, -6.0], u: -0.42, r: 0.09 },
    { type: 'pickup', at: [0, -2.0], u: 0.4 },
    { type: 'pickup', at: [-0.6, -6.0], u: 0.3 },
    { type: 'pickup', at: [-1.2, -8.0], u: -0.45 },
  ],
};
