// Hollow Woods 2 — "Gravestone Field": a wide churchyard of upright slabs in staggered rows and two
// lantern bumpers at the gate. Thread a lane, or ricochet through. A funnel leads to the green. Par 3.
export default {
  id: 'wood2', name: 'Gravestone Field', par: 3,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.3, walls: 'LR' },
      { x: 0, z: -1.2 },
      { x: 0, z: -2.4, w: 2.6 },
      { x: 0, z: -7.4 },
      { x: 0, z: -8.4, w: 1.0 },
      { x: 0.5, z: -9.8, y: -0.04, w: 1.3 },
      { x: 0.5, z: -11.2, y: -0.06 },
      { x: 0.5, z: -12.4, y: -0.06 },
    ] },
  ],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'block', at: [0, -3.5], u: -0.5, size: [0.26, 0.2, 0.07] },
    { type: 'block', at: [0, -3.5], u: 0.5, size: [0.26, 0.2, 0.07] },
    { type: 'block', at: [0, -4.7], u: -0.95, size: [0.26, 0.2, 0.07] },
    { type: 'block', at: [0, -4.7], u: 0.0, size: [0.26, 0.2, 0.07] },
    { type: 'block', at: [0, -4.7], u: 0.95, size: [0.26, 0.2, 0.07] },
    { type: 'block', at: [0, -5.9], u: -0.5, size: [0.26, 0.2, 0.07] },
    { type: 'block', at: [0, -5.9], u: 0.5, size: [0.26, 0.2, 0.07] },
    { type: 'bumper', at: [0, -7.0], u: 0.42 },
    { type: 'bumper', at: [0, -7.0], u: -0.42 },
    { type: 'sand', at0: [0.5, -10.0], at1: [0.5, -10.5], u1: -0.15 },
    { type: 'pickup', at: [0, -4.1], u: 0.7 },
    { type: 'pickup', at: [0, -5.3], u: -0.7 },
    { type: 'pickup', at: [0, -6.5], u: 0 },
  ],
};
