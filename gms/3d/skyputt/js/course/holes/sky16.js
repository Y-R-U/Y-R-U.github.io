// Sky Isles 16 — "Pinball": a wide plaza of bumpers in a diamond, then a funnel to a green guarded by
// sand. The bumpers are lively: a soft putt picks its way through, a hard one ricochets. Par 3.
export default {
  id: 'sky16', name: 'Pinball', par: 3,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.3, walls: 'LR' },
      { x: 0, z: -1.2 },
      { x: 0, z: -2.6, w: 2.4 },
      { x: 0, z: -6.2 },
      { x: 0, z: -7.4, w: 1.0 },
      { x: -0.4, z: -9.0, y: -0.06, w: 1.4 },
      { x: -0.4, z: -10.8, y: -0.06, w: 1.6 },
      { x: -0.4, z: -12.0, y: -0.06 },
    ] },
  ],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'bumper', at: [0, -3.4], u: 0 },
    { type: 'bumper', at: [0, -4.4], u: 0.6 },
    { type: 'bumper', at: [0, -4.4], u: -0.6 },
    { type: 'bumper', at: [0, -5.5], u: 0 },
    { type: 'bumper', at: [0, -5.6], u: 0.95, r: 0.08 },
    { type: 'bumper', at: [0, -5.6], u: -0.95, r: 0.08 },
    { type: 'sand', at0: [-0.4, -10.0], at1: [-0.4, -10.5], u0: -0.1 },
    { type: 'pickup', at: [0, -4.4], u: 0 },
    { type: 'pickup', at: [0, -3.2], u: 0.9 },
    { type: 'pickup', at: [0, -6.0], u: -0.9 },
  ],
};
