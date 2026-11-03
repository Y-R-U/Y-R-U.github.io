// Sugar Summit 2 — "Sugar Rush": a steep ramp up the first shoulder of the mountain. Ride the sugar
// rush lane up the middle and it carries you over the top; miss it and you need a firm putt, or the
// ball rolls back down to your feet. Par 3.
export default {
  id: 'sugar2', name: 'Sugar Rush', par: 3,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.3, walls: 'LR' },
      { x: 0, z: -1.2 },
      { x: 0, z: -2.2, y: 0 },
      { x: 0, z: -4.6, y: 0.5 },
      { x: 0, z: -5.4, y: 0.54 },
      { x: 0.6, z: -7.0, y: 0.56, w: 1.2 },
      { x: 1.2, z: -8.6, y: 0.56, w: 1.4 },
      { x: 1.2, z: -10.0, y: 0.56 },
      { x: 1.2, z: -11.0, y: 0.56 },
    ] },
  ],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'boost', at0: [0, -2.3], at1: [0, -4.3], u0: -0.18, u1: 0.18 },
    { type: 'bumper', at: [0.6, -7.0], u: -0.4, r: 0.09 },
    { type: 'bumper', at: [1.2, -9.4], u: 0.42, r: 0.08 },
    { type: 'pickup', at: [0, -3.4], u: 0.42 },
    { type: 'pickup', at: [0, -5.6], u: 0 },
    { type: 'pickup', at: [1.2, -9.0], u: -0.45 },
  ],
};
