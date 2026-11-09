// Jungle Temple 8 — "Hidden Path": the terrace runs the long way round a hairpin past a rolling stone and
// a glyph lane. Behind the idol by the tee, a gap in the left wall opens onto an old rope bridge,
// narrow and wall-less, straight across the gorge to the far terrace: a pure line or the mist. Par 4.
export default {
  id: 'jungle8', name: 'Hidden Path', par: 4,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.2, walls: 'LR' },
      { x: 0, z: -1.4 },
      { x: 0, z: -2.1, walls: 'R' },      // the left wall opens for the bridge
      { x: 0, z: -2.8, walls: 'LR' },
      { x: 0.7, z: -4.0 },
      { x: 1.8, z: -5.4 },
      { x: 2.0, z: -7.0 },
      { x: 1.2, z: -8.4 },
      { x: 0, z: -9.0, walls: 'R' },     // and again where it lands
      { x: -0.6, z: -9.6, walls: 'LR' },
      { x: -0.8, z: -10.8, w: 1.3 },
      { x: -0.8, z: -12.0 },
      { x: -0.8, z: -13.0 },
    ] },
  ],
  branches: [
    { points: [
      { x: -0.35, z: -2.4, y: 0, w: 0.4, walls: '', surf: 'bridge' },
      { x: -0.65, z: -3.2, y: 0 },
      { x: -0.75, z: -5.4, y: -0.03 },
      { x: -0.65, z: -7.4, y: -0.01 },
      { x: -0.55, z: -8.6, y: 0 },
      { x: -0.4, z: -9.3, y: 0 },
    ] },
  ],
  voids: [[[0.6, -3.4], [-1.5, -3.4], [-1.5, -8.4], [-0.4, -8.9], [0.5, -8.2], [1.1, -7.0], [1.0, -5.4]]],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'bumper', at: [0, -1.6], u: -0.28, r: 0.09 },
    { type: 'boost', at0: [0.6, -3.9], at1: [1.6, -5.2], u0: -0.2, u1: 0.2 },
    { type: 'mover', at: [1.95, -6.2], amp: 0.34, period: 2.8, size: [0.36, 0.16, 0.2] },
    { type: 'sticky', at0: [1.7, -7.6], at1: [0.8, -8.6], u1: -0.1 },
    { type: 'bumper', at: [-0.8, -11.6], u: -0.4, r: 0.08 },
    { type: 'pickup', at: [1.0, -4.6], u: 0.3 },
    { type: 'pickup', at: [-0.7, -6.2], u: 0 },
    { type: 'pickup', at: [-0.8, -11.0], u: 0.35 },
  ],
};
