// Sunken Reef 1 — "Coral Gate": a gentle start on the sandy shelf. Two brain corals stand guard
// either side of the line, then the fairway curves right round a sand pocket to a green watched
// over by a lone coral head. Par 3.
export default {
  id: 'reef1', name: 'Coral Gate', par: 3,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.3, walls: 'LR' },
      { x: 0, z: -1.6 },
      { x: 0, z: -3.0 },
      { x: 0.5, z: -4.6 },
      { x: 1.4, z: -6.0, w: 1.4 },
      { x: 1.7, z: -7.6, w: 1.5 },
      { x: 1.7, z: -9.0 },
    ] },
  ],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'bumper', at: [0, -2.6], u: 0.34, r: 0.09 },
    { type: 'bumper', at: [0, -2.6], u: -0.34, r: 0.09 },
    { type: 'sand', at0: [0.4, -4.4], at1: [1.3, -5.9], u0: -0.75, u1: -0.18 },
    { type: 'bumper', at: [1.7, -7.4], u: 0.1, r: 0.1 },
    { type: 'pickup', at: [0, -1.4], u: 0.35 },
    { type: 'pickup', at: [0.5, -4.6], u: 0.3 },
    { type: 'pickup', at: [1.7, -7.6], u: -0.45 },
  ],
};
