// Jungle Temple 4 — "Serpent Ring": glyph runes fire the ball round the coils of the carved feathered
// serpent, then out along a terrace that bends right through temple dust to a green flanked by idols.
// Par 3.
export default {
  id: 'jungle4', name: 'Serpent Ring', par: 3,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0.4, w: 1.2, walls: 'LR' },
      { x: 0, z: -1.4 },
      { x: 0, z: -2.8, w: 0.56 },
      { x: 0, z: -3.8 },
    ] },
    { type: 'loop', radius: 0.45, shift: 0.82, width: 0.56 },
    { type: 'path', points: [
      { x: -0.82, z: -3.8, y: 0.4, w: 0.56, walls: 'LR' },
      { x: -0.82, z: -4.6 },
      { x: -0.82, z: -5.4, w: 1.0 },
      { x: -0.3, z: -6.8, y: 0.34 },
      { x: 0.8, z: -7.8, y: 0.3, w: 1.2 },
      { x: 1.8, z: -8.8, y: 0.3, w: 1.4 },
      { x: 2.0, z: -10.0 },
      { x: 2.0, z: -11.0 },
    ] },
  ],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'boost', at0: [0, -1.8], at1: [0, -2.9], u0: -0.3, u1: 0.3 },
    { type: 'sand', at0: [-0.4, -6.6], at1: [0.9, -7.9], u1: 0.1 },
    { type: 'bumper', at: [2.0, -10.4], u: 0.45, r: 0.08 },
    { type: 'bumper', at: [2.0, -10.4], u: -0.45, r: 0.08 },
    { type: 'pickup', at: [0, -1.2], u: -0.4 },
    { type: 'pickup', at: [-0.82, -5.2], u: 0 },
    { type: 'pickup', at: [1.8, -8.8], u: -0.5 },
  ],
};
