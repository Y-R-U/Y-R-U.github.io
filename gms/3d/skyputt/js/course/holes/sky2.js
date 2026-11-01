// Sky Isles 2 — "The Windmill": straight run into a windmill tunnel, then a bend down to the green. Par 3.
export default {
  id: 'sky2', name: 'The Windmill', par: 3,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.3, walls: 'LR' },
      { x: 0, z: -1.8, w: 1.0 },
      { x: 0, z: -4.0 },
      { x: 0, z: -5.4 },
      { x: 0.6, z: -6.9, y: -0.05, w: 1.3 },
      { x: 2.0, z: -8.0, y: -0.15 },
      { x: 2.9, z: -9.4, y: -0.3 },
      { x: 3.0, z: -10.8, y: -0.36, w: 1.6 },
      { x: 3.0, z: -12.2, y: -0.36 },
    ] },
  ],
  tee: { s: 0.5 },
  cup: { s: -0.9 },
  features: [
    { type: 'windmill', s: 3.5, omega: 1.15, hub: 0.64 },
    { type: 'bumper', s: 9.9, u: -0.25 },
    { type: 'pickup', s: 2.2, u: 0 },
    { type: 'pickup', s: 7.4, u: 0.3 },
    { type: 'pickup', s: 11.0, u: -0.4 },
  ],
};
