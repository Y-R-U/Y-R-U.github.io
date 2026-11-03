// Sugar Summit 4 — "Gumdrop Garden": a wide meadow climbing between staggered gumdrops. A soft putt
// picks its way up through them; a hard one pinballs. A funnel at the top turns onto the green. Par 3.
export default {
  id: 'sugar4', name: 'Gumdrop Garden', par: 3,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.3, walls: 'LR' },
      { x: 0, z: -1.2 },
      { x: 0, z: -2.4, y: 0.02, w: 2.4 },
      { x: 0, z: -6.4, y: 0.22 },
      { x: 0, z: -7.6, y: 0.26, w: 1.1 },
      { x: 0.5, z: -9.2, y: 0.3, w: 1.5 },
      { x: 0.5, z: -10.8, y: 0.3 },
      { x: 0.5, z: -11.8, y: 0.3 },
    ] },
  ],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'bumper', at: [0, -3.3], u: 0, r: 0.11 },
    { type: 'bumper', at: [0, -4.3], u: 0.62, r: 0.1 },
    { type: 'bumper', at: [0, -4.3], u: -0.62, r: 0.1 },
    { type: 'bumper', at: [0, -5.3], u: 0, r: 0.11 },
    { type: 'bumper', at: [0, -5.5], u: 0.98, r: 0.08 },
    { type: 'bumper', at: [0, -5.5], u: -0.98, r: 0.08 },
    { type: 'sticky', at0: [0.4, -9.0], at1: [0.5, -9.6], u0: 0.2 },
    { type: 'pickup', at: [0, -4.3], u: 0 },
    { type: 'pickup', at: [0, -3.2], u: -0.9 },
    { type: 'pickup', at: [0, -6.0], u: 0.75 },
  ],
};
