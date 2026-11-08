// Star Station 1 — "Docking Bay": a gentle start on the station's docking deck. Two beacon pylons
// mark the bay mouth, a gravity accelerator lane on the right gives a push, then the deck bends left
// round a drift of regolith dust to a green watched over by a lone beacon. Par 3.
export default {
  id: 'star1', name: 'Docking Bay', par: 3,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.4, walls: 'LR' },
      { x: 0, z: -1.6 },
      { x: 0, z: -3.2 },
      { x: -0.6, z: -4.8 },
      { x: -1.5, z: -6.2, w: 1.4 },
      { x: -1.8, z: -7.8, w: 1.3 },
      { x: -1.8, z: -9.2 },
    ] },
  ],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'bumper', at: [0, -2.0], u: 0.4, r: 0.09 },
    { type: 'bumper', at: [0, -2.0], u: -0.4, r: 0.09 },
    { type: 'boost', at0: [0, -2.4], at1: [0, -3.4], u0: -0.62, u1: -0.18 },
    { type: 'sand', at0: [-0.5, -4.6], at1: [-1.4, -6.1], u0: 0.18, u1: 0.75 },
    { type: 'bumper', at: [-1.8, -8.0], u: 0.2, r: 0.1 },
    { type: 'sand', at0: [-1.8, -8.6], at1: [-1.8, -9.2], u0: -0.65, u1: -0.2 },
    { type: 'pickup', at: [0, -1.4], u: -0.35 },
    { type: 'pickup', at: [-0.6, -4.8], u: -0.3 },
    { type: 'pickup', at: [-1.8, -7.8], u: 0.45 },
  ],
};
