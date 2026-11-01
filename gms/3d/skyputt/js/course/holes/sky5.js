// Sky Isles 5 — "Glass Run": from a high tee, funnel into a glass tube that winds down to the green. Par 3.
export default {
  id: 'sky5', name: 'Glass Run', par: 3,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0.6, w: 1.3, walls: 'LR' },
      { x: 0, z: -1.8 },
      { x: 0, z: -3.0, w: 0.3 },
      { x: 0, z: -3.6 },
    ] },
    { type: 'tube', radius: 0.15, points: [
      { x: 0, z: -3.6, y: 0.6 },
      { x: 0, z: -4.6, y: 0.5 },
      { x: 0.7, z: -5.8, y: 0.32 },
      { x: 1.8, z: -6.2, y: 0.16 },
      { x: 2.5, z: -7.2, y: 0.04 },
      { x: 2.5, z: -8.0, y: 0.0 },
    ] },
    { type: 'path', points: [
      { x: 2.5, z: -8.0, y: 0, w: 0.3, walls: 'LR' },
      { x: 2.5, z: -8.6 },
      { x: 2.5, z: -9.6, w: 1.5 },
      { x: 2.2, z: -11.4 },
      { x: 2.2, z: -12.8 },
    ] },
  ],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'pickup', at: [0, -1.8], u: 0 },
    { type: 'pickup', at: [2.5, -10.0], u: 0.45 },
    { type: 'pickup', at: [2.3, -11.0], u: -0.45 },
  ],
};
