// Jungle Temple 1 — "Temple Steps": up the first terrace stairs of the ruined temple. Two idol heads
// guard the bottom step, a glyph-rune lane on the second ramp lifts a ball that keeps to the right,
// and the top terrace bends left past a drift of temple dust. Par 3.
export default {
  id: 'jungle1', name: 'Temple Steps', par: 3,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.15, walls: 'LR' },
      { x: 0, z: -1.6 },
      { x: 0, z: -2.6, y: 0.14 },
      { x: 0, z: -3.4, y: 0.14, w: 1.2 },
      { x: 0.3, z: -4.6, y: 0.3 },
      { x: 0.2, z: -5.8, y: 0.34, w: 1.3 },
      { x: -0.6, z: -7.0, y: 0.34 },
      { x: -1.0, z: -8.2, y: 0.34, w: 1.2 },
      { x: -1.0, z: -9.4, y: 0.34 },
    ] },
  ],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'bumper', at: [0, -1.9], u: 0.3, r: 0.09 },
    { type: 'bumper', at: [0, -1.9], u: -0.3, r: 0.09 },
    { type: 'boost', at0: [0.05, -3.7], at1: [0.28, -4.6], u0: 0.05 },
    { type: 'sand', at0: [0.2, -5.6], at1: [-0.8, -7.4], u0: 0.05 },
    { type: 'bumper', at: [-1.0, -8.15], u: 0.0, r: 0.1 },
    { type: 'sticky', at0: [-0.9, -7.6], at1: [-1.0, -8.0], u0: 0.2 },
    { type: 'bumper', at: [-1.0, -8.9], u: -0.45, r: 0.08 },
    { type: 'pickup', at: [0, -1.2], u: 0 },
    { type: 'pickup', at: [0.3, -4.6], u: -0.35 },
    { type: 'pickup', at: [-1.0, -8.3], u: 0.45 },
  ],
};
