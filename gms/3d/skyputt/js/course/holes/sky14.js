// Sky Isles 14 — "Island Hop": three islands. A ramp over the first drop, a bend across the middle
// isle, then a boost pad and a longer leap to the green. Par 3.
export default {
  id: 'sky14', name: 'Island Hop', par: 3,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.4, walls: 'LR' },
      { x: 0, z: -1.6 },
      { x: 0, z: -3.0 },
      { x: 0, z: -4.0, y: 0.14, gap: true, walls: '' },
      { x: 0, z: -4.7, y: -0.18, w: 1.7, walls: 'LR' },
      { x: 0, z: -6.0, y: -0.18 },
      { x: -1.0, z: -7.4, y: -0.18, w: 1.4 },
      { x: -2.2, z: -8.2, y: -0.18 },
      { x: -2.8, z: -9.6, y: -0.18, w: 1.2 },
      { x: -2.8, z: -11.2, y: -0.18 },
      { x: -2.8, z: -12.2, y: 0.08, gap: true, walls: '' },
      { x: -2.8, z: -13.3, y: -0.3, w: 1.8, walls: 'LR' },
      { x: -2.8, z: -14.6, y: -0.3 },
      { x: -2.2, z: -16.0, y: -0.3, w: 1.6 },
      { x: -2.2, z: -17.2, y: -0.3 },
    ] },
  ],
  // the two drops: themes keep island ground, rock and props out of them (info.voids), so they read as gaps
  voids: [
    [[-2.6, -3.7], [2.6, -3.7], [2.6, -5.0], [-2.6, -5.0]],
    [[-5.4, -11.9], [-0.2, -11.9], [-0.2, -13.4], [-5.4, -13.4]],
  ],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'boost', at0: [-2.8, -10.0], at1: [-2.8, -10.9] },
    { type: 'pickup', at: [0, -2.4], u: 0 },
    { type: 'pickup', at: [-1.6, -7.9], u: -0.4 },
    { type: 'pickup', at: [-2.8, -13.8], u: 0.6 },
  ],
};
