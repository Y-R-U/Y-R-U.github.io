// Sky Isles 6 — "Boost Leap": a boost pad down the middle fires you up a ramp and over a gap.
// Miss the pad and you need a big putt. Par 3.
export default {
  id: 'sky6', name: 'Boost Leap', par: 3,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.3, walls: 'LR' },
      { x: 0, z: -1.6 },
      { x: 0, z: -3.6 },
      { x: 0, z: -5.0, y: 0.26, gap: true, walls: '' },
      { x: 0, z: -6.3, y: -0.12, w: 1.7, walls: 'LR' },
      { x: 0, z: -7.4, y: -0.12 },
      { x: -1.0, z: -9.0, y: -0.12, w: 1.5 },
      { x: -1.3, z: -10.6 },
      { x: -1.3, z: -12.0 },
    ] },
  ],
  tee: { s: 0.5 }, cup: { s: -0.85 },
  features: [
    { type: 'boost', at0: [0, -1.9], at1: [0, -2.9], u0: -0.25, u1: 0.25 },
    { type: 'pickup', at: [0, -6.6], u: 0.5 },
    { type: 'pickup', at: [0, -6.6], u: -0.5 },
    { type: 'pickup', at: [-1.1, -9.5], u: 0 },
  ],
};
