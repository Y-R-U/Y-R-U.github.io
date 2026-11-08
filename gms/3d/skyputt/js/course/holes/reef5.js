// Sunken Reef 5 — "Pearl Slide": a banked S of polished mother-of-pearl runs gently downhill.
// Too firm and the ball skates past the seaweed tuft at the bottom into the back wall; too soft
// and it slides to a stop on the pearl; a coral head sits in the middle of the S. Par 2.
export default {
  id: 'reef5', name: 'Pearl Slide', par: 2,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0.62, w: 1.2, walls: 'LR' },
      { x: 0, z: -1.2, y: 0.62 },
      { x: 0, z: -2.0, y: 0.56 },
      { x: 0.6, z: -3.4, y: 0.42, w: 0.9, bank: 5 },
      { x: -0.4, z: -5.0, y: 0.24, bank: -5 },
      { x: 0, z: -6.6, y: 0.1, bank: 0, w: 1.2 },
      { x: 0, z: -7.6, y: 0.1, w: 1.4 },
      { x: 0, z: -8.8, y: 0.1 },
      { x: 0, z: -9.8, y: 0.1 },
    ] },
  ],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'ice', at0: [0, -1.7], at1: [0, -6.6] },
    { type: 'sticky', at0: [0, -6.8], at1: [0, -7.3], u0: 0.15 },
    { type: 'bumper', at: [0.1, -4.2], u: 0, r: 0.08 },
    { type: 'bumper', at: [0, -9.4], u: 0.35, r: 0.08 },
    { type: 'pickup', at: [0.6, -3.4], u: 0.25 },
    { type: 'pickup', at: [-0.4, -5.0], u: -0.25 },
    { type: 'pickup', at: [0, -8.0], u: -0.4 },
  ],
};
