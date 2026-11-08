// Star Station 7 — "Docking Arms": a long service corridor where three docking arms sweep across
// out of step. Magnetic deck plates grab a ball that strays to the side; past the arms the corridor
// climbs right through a regolith drift to the green. Par 4.
export default {
  id: 'star7', name: 'Docking Arms', par: 4,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.1, walls: 'LR' },
      { x: 0, z: -1.4 },
      { x: 0, z: -3.0 },
      { x: 0, z: -5.0 },
      { x: 0, z: -7.0 },
      { x: 0.4, z: -8.4, y: 0.06 },
      { x: 1.4, z: -9.6, y: 0.24, w: 1.2 },
      { x: 2.6, z: -10.2, y: 0.34 },
      { x: 3.8, z: -10.6, y: 0.36, w: 1.4 },
      { x: 5.0, z: -10.8, y: 0.36 },
      { x: 6.0, z: -10.9, y: 0.36 },
    ] },
  ],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'mover', at: [0, -2.6], amp: 0.36, period: 2.6, size: [0.46, 0.16, 0.18] },
    { type: 'mover', at: [0, -4.2], amp: 0.36, period: 2.0, phase: 1.4, size: [0.46, 0.16, 0.18] },
    { type: 'mover', at: [0, -5.8], amp: 0.36, period: 2.8, phase: 2.6, size: [0.46, 0.16, 0.18] },
    { type: 'sticky', at0: [0, -3.0], at1: [0, -3.8], u0: 0.3 },
    { type: 'sticky', at0: [0, -4.6], at1: [0, -5.4], u1: -0.3 },
    { type: 'sand', at0: [1.2, -9.4], at1: [2.6, -10.2], u1: -0.05 },
    { type: 'bumper', at: [5.0, -10.8], u: -0.4, r: 0.08 },
    { type: 'bumper', at: [5.4, -10.85], u: 0.15, r: 0.08 },
    { type: 'pickup', at: [0, -1.6], u: 0.35 },
    { type: 'pickup', at: [0, -5.0], u: 0 },
    { type: 'pickup', at: [3.8, -10.6], u: 0.45 },
  ],
};
