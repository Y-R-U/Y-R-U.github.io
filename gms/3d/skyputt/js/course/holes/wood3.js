// Hollow Woods 3 — "Frozen Pond": a wide, black-ice pond with three old stumps standing in it. The
// way out is a narrow creek off the far left corner that climbs to the green. Pace, not power. Par 3.
export default {
  id: 'wood3', name: 'Frozen Pond', par: 3,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.2, walls: 'LR' },
      { x: 0, z: -1.2 },
      { x: 0, z: -2.2, w: 2.6 },
      { x: -0.4, z: -4.6, y: -0.04, w: 3.0 },
      { x: -1.2, z: -6.8, y: -0.04, w: 2.4 },
      { x: -2.4, z: -8.0, w: 1.0 },
      { x: -3.6, z: -8.6, y: -0.02, w: 1.1 },
      { x: -4.8, z: -9.2, y: 0.03 },
      { x: -5.4, z: -10.4, y: 0.08, w: 1.2 },
      { x: -5.4, z: -11.6, y: 0.08 },
      { x: -5.4, z: -12.6, y: 0.08 },
    ] },
  ],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'ice', at0: [0, -1.9], at1: [-3.0, -8.3] },
    { type: 'bumper', at: [-0.4, -4.4], u: 0.6, r: 0.11 },
    { type: 'bumper', at: [-0.4, -4.4], u: -0.7, r: 0.11 },
    { type: 'bumper', at: [-1.2, -6.6], u: 0.1, r: 0.11 },
    { type: 'pickup', at: [-0.4, -4.4], u: 0 },
    { type: 'pickup', at: [-1.2, -6.6], u: 0.8 },
    { type: 'pickup', at: [-4.8, -9.2], u: -0.3 },
  ],
};
