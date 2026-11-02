// Sky Isles 15 — "Switchback": a zig-zag down the island side with banked corners. Ride the banks
// round, or bank it off the outside wall. Par 3.
export default {
  id: 'sky15', name: 'Switchback', par: 3,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0.5, w: 1.3, walls: 'LR' },
      { x: 0, z: -1.4 },
      { x: -0.4, z: -2.8, y: 0.44, bank: 0 },
      { x: -1.8, z: -3.8, y: 0.36, bank: -12 },
      { x: -3.0, z: -4.6, y: 0.28, bank: 0 },
      { x: -3.4, z: -5.8, y: 0.22, bank: 0 },
      { x: -2.8, z: -7.0, y: 0.14, bank: 12 },
      { x: -1.2, z: -7.8, y: 0.08, bank: 12 },
      { x: 0.0, z: -8.8, y: 0.04, bank: 0 },
      { x: 0.3, z: -10.2, y: 0.0, w: 1.5 },
      { x: 0.3, z: -11.8, y: 0.0 },
    ] },
  ],
  tee: { s: 0.5 }, cup: { s: -0.85 },
  features: [
    { type: 'sticky', at0: [-3.3, -5.4], at1: [-3.1, -6.4], u0: -0.1 },
    { type: 'pickup', at: [-1.8, -3.8], u: 0.4 },
    { type: 'pickup', at: [-3.4, -5.8], u: 0.45 },
    { type: 'pickup', at: [-1.2, -7.8], u: -0.4 },
  ],
};
