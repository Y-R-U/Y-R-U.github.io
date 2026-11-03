// Sugar Summit 3 — "Caramel Switchbacks": three legs zig-zag up the mountainside with banked hairpins.
// Caramel pools on the inside of each hairpin: cut the corner and you stick; ride the bank round. Par 4.
export default {
  id: 'sugar3', name: 'Caramel Switchbacks', par: 4,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.0, walls: 'LR' },
      { x: 0, z: -1.4, y: 0 },
      { x: 0, z: -4.0, y: 0.16, bank: 0 },
      { x: -0.264, z: -4.636, y: 0.19, bank: -10 },   // hairpin 1 (r 0.9), banked
      { x: -0.9, z: -4.9, y: 0.22, bank: -12 },
      { x: -1.536, z: -4.636, y: 0.25, bank: -10 },
      { x: -1.8, z: -4.0, y: 0.28, bank: 0 },
      { x: -1.8, z: -1.2, y: 0.44 },
      { x: -2.064, z: -0.564, y: 0.47, bank: 5 },    // hairpin 2
      { x: -2.7, z: -0.3, y: 0.5, bank: 6 },
      { x: -3.336, z: -0.564, y: 0.53, bank: 5 },
      { x: -3.6, z: -1.2, y: 0.56, bank: 0 },
      { x: -3.6, z: -3.6, y: 0.62 },
      { x: -3.6, z: -5.4, y: 0.64, w: 1.3 },
      { x: -3.6, z: -6.6, y: 0.64 },
    ] },
  ],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'sticky', at0: [-0.264, -4.636], at1: [-1.536, -4.636], u0: 0.12 },
    { type: 'sticky', at0: [-2.064, -0.564], at1: [-3.336, -0.564], u1: -0.12 },
    { type: 'pickup', at: [-0.9, -4.9], u: -0.3 },
    { type: 'pickup', at: [-1.8, -2.6], u: 0 },
    { type: 'pickup', at: [-2.7, -0.3], u: 0.3 },
  ],
};
