// Festival Isles 4 — "Stepping Stones": four platforms, each a step lower, with open gaps between.
// Firm putts carry the drops; a lazy one falls through. Par 4.
export default {
  id: 'fest4', name: 'Stepping Stones', par: 4,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.3, walls: 'LR' },
      { x: 0, z: -1.6 },
      { x: 0, z: -3.0, gap: true, walls: '' },
      { x: 0, z: -3.38, y: -0.18, walls: 'LR' },
      { x: 0, z: -4.0, y: -0.18 },
      { x: 0.35, z: -5.4, y: -0.18, w: 1.2 },
      { x: 0.35, z: -6.6, y: -0.18, gap: true, walls: '' },
      { x: 0.35, z: -6.98, y: -0.36, walls: 'LR' },
      { x: 0.35, z: -7.6, y: -0.36 },
      { x: -0.1, z: -9.0, y: -0.36, w: 1.2 },
      { x: -0.2, z: -10.2, y: -0.36, gap: true, walls: '' },
      { x: -0.2, z: -10.58, y: -0.54, w: 1.5, walls: 'LR' },
      { x: -0.2, z: -11.2, y: -0.54 },
      { x: -0.2, z: -12.6, y: -0.54 },
      { x: -0.2, z: -13.8, y: -0.54 },
    ] },
  ],
  voids: [
    [[-2.6, -2.9], [2.6, -2.9], [2.6, -3.55], [-2.6, -3.55]],
    [[-2.25, -6.5], [2.95, -6.5], [2.95, -7.15], [-2.25, -7.15]],
    [[-2.8, -10.1], [2.4, -10.1], [2.4, -10.75], [-2.8, -10.75]],
  ],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'pickup', at: [0, -1.4], u: -0.35 },
    { type: 'pickup', at: [0.2, -5.0], u: 0.35 },
    { type: 'pickup', at: [0.1, -8.4], u: -0.3 },
  ],
};
