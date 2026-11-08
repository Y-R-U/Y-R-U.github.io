// Star Station 3 — "Gantry Walk": the deck runs out onto a wall-less maintenance gantry slung over
// the void. It jinks right, then left, before landing on a green between two beacon pylons. Par 3.
export default {
  id: 'star3', name: 'Gantry Walk', par: 3,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.4, walls: 'LR' },
      { x: 0, z: -1.4 },
      { x: 0, z: -2.2, w: 0.8 },
      { x: 0, z: -2.7, walls: '', surf: 'bridge' },
      { x: 0.18, z: -3.9 },
      { x: 0.18, z: -4.7 },
      { x: -0.05, z: -5.9 },
      { x: -0.1, z: -6.6, w: 0.8, walls: 'LR', surf: 'grass' },
      { x: -0.1, z: -7.4, w: 1.5 },
      { x: -0.1, z: -8.6 },
      { x: -0.1, z: -9.6 },
    ] },
  ],
  voids: [[[-1.7, -2.95], [2.0, -2.95], [2.0, -6.35], [-1.7, -6.35]]],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'bumper', at: [-0.1, -8.2], u: 0.42, r: 0.09 },
    { type: 'bumper', at: [-0.1, -8.2], u: -0.42, r: 0.09 },
    { type: 'pickup', at: [0, -1.4], u: -0.4 },
    { type: 'pickup', at: [0.18, -4.3], u: 0 },
    { type: 'pickup', at: [-0.1, -7.6], u: 0.45 },
  ],
};
