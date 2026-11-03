// Sugar Summit 5 — "Glazed Ridge": a sugar-glazed S-curve climbs a narrow ridge to the green. The
// glaze is slick both ways: too soft and the ball slides all the way back down; the bends are banked,
// so ride them. Par 3.
export default {
  id: 'sugar5', name: 'Glazed Ridge', par: 3,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.2, walls: 'LR' },
      { x: 0, z: -1.2, y: 0 },
      { x: 0, z: -2.0, y: 0, w: 0.9 },
      { x: -0.6, z: -3.8, y: 0.14, bank: -8 },
      { x: 0, z: -5.6, y: 0.26, bank: 8 },
      { x: 0.6, z: -7.2, y: 0.34, bank: 0 },
      { x: 0.6, z: -8.4, y: 0.36, w: 1.4 },
      { x: 0.6, z: -10.0, y: 0.36 },
      { x: 0.6, z: -11.0, y: 0.36 },
    ] },
  ],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'ice', at0: [0, -2.1], at1: [0.6, -7.6] },
    { type: 'bumper', at: [0.6, -9.2], u: 0.45, r: 0.09 },
    { type: 'pickup', at: [-0.6, -3.8], u: 0.2 },
    { type: 'pickup', at: [0, -5.6], u: -0.2 },
    { type: 'pickup', at: [0.6, -9.0], u: -0.45 },
  ],
};
