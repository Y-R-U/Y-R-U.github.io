// Sky Isles 12 — "Corkscrew": from a high tee, a glass tube spirals down one full turn around a rock
// pillar and spits you onto the green. Getting in is easy; a sliding block guards the green. Par 3.
export default {
  id: 'sky12', name: 'Corkscrew', par: 3,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 1.1, w: 1.3, walls: 'LR' },
      { x: 0, z: -1.6 },
      { x: 0, z: -2.8, w: 0.3 },
      { x: 0, z: -3.4 },
    ] },
    { type: 'tube', radius: 0.15, points: [
      { x: 0, z: -3.4, y: 1.1 },
      { x: 0, z: -4.2, y: 1.04 },
      { x: -0.8, z: -5.2, y: 0.92 },
      { x: -1.6, z: -4.6, y: 0.8 },
      { x: -1.7, z: -3.6, y: 0.66 },
      { x: -1.0, z: -2.9, y: 0.52 },
      { x: 0.0, z: -3.0, y: 0.4 },
      { x: 0.8, z: -3.8, y: 0.28 },
      { x: 1.0, z: -5.0, y: 0.16 },
      { x: 1.0, z: -6.2, y: 0.08 },
      { x: 1.0, z: -7.0, y: 0.04 },
    ] },
    { type: 'path', points: [
      { x: 1.0, z: -7.0, y: 0.04, w: 0.3, walls: 'LR' },
      { x: 1.0, z: -7.6 },
      { x: 1.0, z: -8.6, w: 1.6 },
      { x: 0.4, z: -10.4, y: 0.0 },
      { x: -0.4, z: -11.8, y: -0.04 },
      { x: -0.4, z: -13.0, y: -0.04 },
    ] },
  ],
  // keep island ground, trees and lamps out from under the spiral (info.voids)
  voids: [[[-2.2, -2.4], [-0.45, -2.4], [-0.45, -5.7], [-2.2, -5.7]]],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'bumper', at: [1.0, -9.3], u: -0.35 },
    { type: 'mover', at: [0.1, -11.0], amp: 0.42, period: 3.0, size: [0.36, 0.16, 0.2] },
    { type: 'pickup', at: [0, -1.6], u: 0 },
    { type: 'pickup', at: [1.0, -8.8], u: -0.5 },
    { type: 'pickup', at: [0.0, -11.2], u: 0.45 },
  ],
};
