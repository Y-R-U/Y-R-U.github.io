// Sky Isles 8 — "Pusher Pass": two stone blocks slide across the fairway. Time it. Par 3.
export default {
  id: 'sky8', name: 'Pusher Pass', par: 3,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.4, walls: 'LR' },
      { x: 0, z: -2.0 },
      { x: 0, z: -6.4 },
      { x: 0.8, z: -8.4, y: -0.1 },
      { x: 1.0, z: -10.4, y: -0.14, w: 1.5 },
      { x: 1.0, z: -11.8 },
    ] },
  ],
  tee: { s: 0.5 }, cup: { s: -0.85 },
  features: [
    { type: 'mover', at: [0, -3.0], amp: 0.42, period: 3.2, size: [0.42, 0.16, 0.2] },
    { type: 'mover', at: [0, -5.0], amp: 0.42, period: 2.5, phase: 2.0, size: [0.42, 0.16, 0.2] },
    { type: 'pickup', at: [0, -4.0], u: 0 },
    { type: 'pickup', at: [0.6, -7.8], u: -0.4 },
    { type: 'pickup', at: [1.0, -10.0], u: 0.45 },
  ],
};
