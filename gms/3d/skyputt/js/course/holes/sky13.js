// Sky Isles 13 — "The Fork": a stone divider splits the fairway. The left lane has a boost pad that
// fires you down the hill (the bend after it has an open edge); the right lane is slow and guarded
// by a sliding block. Par 4.
export default {
  id: 'sky13', name: 'The Fork', par: 4,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.4, walls: 'LR' },
      { x: 0, z: -1.4 },
      { x: 0, z: -2.6, w: 2.0 },
      { x: 0, z: -6.8 },
      { x: 0, z: -7.8, w: 1.5 },
      { x: 0.6, z: -9.4, y: -0.1, walls: 'R' },    // outside of the bend (left) is open
      { x: 1.9, z: -10.6, y: -0.2, walls: 'LR' },
      { x: 3.2, z: -11.2, y: -0.26 },
      { x: 4.4, z: -12.0, y: -0.26, w: 1.6 },
      { x: 4.8, z: -13.6, y: -0.26 },
      { x: 4.8, z: -14.8, y: -0.26 },
    ] },
  ],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'block', at: [0, -4.7], u: 0, size: [0.12, 0.14, 3.6] },
    { type: 'boost', at0: [0, -3.4], at1: [0, -4.4], u0: 0.3, u1: 0.8 },
    { type: 'mover', at: [0, -5.2], u: -0.52, amp: 0.25, period: 2.6, size: [0.26, 0.16, 0.2] },
    { type: 'sand', at0: [0, -4.8], at1: [0, -5.8], u0: 0.15, u1: 0.95 },
    { type: 'sand', at0: [0.3, -8.8], at1: [1.4, -10.2], u0: 0.25 },   // run-off on the open side
    { type: 'pickup', at: [0, -3.9], u: -0.5 },
    { type: 'pickup', at: [0, -6.0], u: 0.55 },
    { type: 'pickup', at: [3.2, -11.2], u: 0.4 },
  ],
};
