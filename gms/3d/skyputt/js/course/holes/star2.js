// Star Station 2 — "Slingshot": out along the boom to a banked hairpin lined with gravity
// accelerators that whip a ball round and fire it back down the return leg. Too soft and it stalls
// on the bank; too hard and the slingshot overcooks it past the green. Par 3.
export default {
  id: 'star2', name: 'Slingshot', par: 3,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.1, walls: 'LR' },
      { x: 0, z: -1.4, y: 0 },
      { x: 0, z: -4.2, y: 0.08, bank: 0 },
      { x: -0.264, z: -4.836, y: 0.08, bank: -10 },   // hairpin (r 0.9), banked
      { x: -0.9, z: -5.1, y: 0.08, bank: -12 },
      { x: -1.536, z: -4.836, y: 0.08, bank: -10 },
      { x: -1.8, z: -4.2, y: 0.08, bank: 0 },
      { x: -1.8, z: -2.6, y: 0.04 },
      { x: -1.8, z: -1.4, y: 0, w: 1.2 },
      { x: -1.8, z: 0.2 },
      { x: -1.8, z: 1.2 },
    ] },
  ],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'boost', at0: [-0.2, -4.7], at1: [-1.6, -4.7], u1: -0.02 },   // the outer half of the bend only
    { type: 'sand', at0: [-1.8, -3.0], at1: [-1.8, -1.9], u0: -0.35, u1: 0.7 },
    { type: 'bumper', at: [0, -2.6], u: 0.2, r: 0.08 },
    { type: 'bumper', at: [-1.8, 0.4], u: 0.42, r: 0.08 },
    { type: 'bumper', at: [-1.8, 0.4], u: -0.42, r: 0.08 },
    { type: 'pickup', at: [0, -1.8], u: -0.3 },
    { type: 'pickup', at: [-0.9, -5.1], u: 0.25 },
    { type: 'pickup', at: [-1.8, -1.0], u: 0 },
  ],
};
