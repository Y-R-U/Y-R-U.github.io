// Jungle Temple 5 — "Jade Slide": down a banked S of wet, polished jade from the high shrine. Nothing
// slows the ball on the jade; an idol sits in the middle of the S and a mud wallow waits at the
// bottom before the green. Par 2.
export default {
  id: 'jungle5', name: 'Jade Slide', par: 2,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0.62, w: 1.2, walls: 'LR' },
      { x: 0, z: -1.2, y: 0.62 },
      { x: 0, z: -2.2, y: 0.56, w: 0.9 },
      { x: 0.7, z: -3.6, y: 0.42, bank: 5 },
      { x: -0.4, z: -5.2, y: 0.26, bank: -6 },
      { x: 0.5, z: -6.8, y: 0.12, bank: 5 },
      { x: 0.2, z: -8.2, y: 0.04, bank: 0, w: 1.2 },
      { x: 0.2, z: -9.4, y: 0.04, w: 1.4 },
      { x: 0.2, z: -10.6, y: 0.04 },
    ] },
  ],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'ice', at0: [0, -2.0], at1: [0.3, -7.9] },
    { type: 'bumper', at: [0.15, -4.4], u: 0, r: 0.08 },
    { type: 'sticky', at0: [0.2, -8.3], at1: [0.2, -8.8], u0: -0.2 },
    { type: 'bumper', at: [0.2, -10.0], u: 0.4, r: 0.08 },
    { type: 'bumper', at: [0.2, -10.0], u: -0.4, r: 0.08 },
    { type: 'pickup', at: [0, -1.0], u: 0.4 },
    { type: 'pickup', at: [-0.4, -5.2], u: 0.25 },
    { type: 'pickup', at: [0.2, -9.3], u: -0.5 },
  ],
};
