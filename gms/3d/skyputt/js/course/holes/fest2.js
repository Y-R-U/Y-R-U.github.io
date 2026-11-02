// Festival Isles 2 — "Three Lanes": two stone dividers split a wide plaza into three lanes. The middle
// lane is straight at the cup but a sliding block guards it; the left lane has a boost pad; the right
// lane is safe and slow (sand). The lanes rejoin before a bend to the green. Par 3.
export default {
  id: 'fest2', name: 'Three Lanes', par: 3,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.4, walls: 'LR' },
      { x: 0, z: -1.2 },
      { x: 0, z: -2.4, w: 2.5 },
      { x: 0, z: -6.8 },
      { x: 0, z: -7.8, w: 1.4 },
      { x: -0.5, z: -9.4, y: -0.06 },
      { x: -1.3, z: -10.6, y: -0.1, w: 1.4 },
      { x: -1.6, z: -12.0, y: -0.1 },
      { x: -1.6, z: -13.2, y: -0.1 },
    ] },
  ],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'block', at: [0, -4.6], u: 0.42, size: [0.1, 0.14, 3.0] },
    { type: 'block', at: [0, -4.6], u: -0.42, size: [0.1, 0.14, 3.0] },
    { type: 'mover', at: [0, -4.4], u: 0, amp: 0.2, period: 2.4, size: [0.3, 0.16, 0.18] },
    { type: 'boost', at0: [0, -3.5], at1: [0, -4.4], u0: 0.5 },
    { type: 'sand', at0: [0, -3.6], at1: [0, -5.6], u1: -0.5 },
    { type: 'pickup', at: [0, -3.4], u: 0 },
    { type: 'pickup', at: [0, -5.6], u: 0.85 },
    { type: 'pickup', at: [-1.3, -10.6], u: 0.35 },
  ],
};
