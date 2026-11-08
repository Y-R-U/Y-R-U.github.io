// Sunken Reef 6 — "Sunken Loop": a current fires you round a coral-crusted loop; out the other side
// a short, steep climb past a sand pocket to a green with anemone posts round the cup. Par 3.
export default {
  id: 'reef6', name: 'Sunken Loop', par: 3,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.3, walls: 'LR' },
      { x: 0, z: -1.4 },
      { x: 0, z: -2.8, w: 0.56 },
      { x: 0, z: -3.8 },
    ] },
    { type: 'loop', radius: 0.45, shift: 0.82, width: 0.56 },
    { type: 'path', points: [
      { x: -0.82, z: -3.8, w: 0.56, walls: 'LR' },
      { x: -0.82, z: -4.8 },
      { x: -0.82, z: -6.2, y: 0.3, w: 1.4 },
      { x: -0.3, z: -7.6, y: 0.32 },
      { x: -0.3, z: -9.0, y: 0.32 },
    ] },
  ],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'boost', at0: [0, -1.8], at1: [0, -2.9], u0: -0.3, u1: 0.3 },
    { type: 'sand', at0: [-0.82, -6.3], at1: [-0.4, -7.1], u0: -0.7, u1: 0.2 },
    { type: 'bumper', at: [-0.3, -8.5], u: 0.3, r: 0.08 },
    { type: 'bumper', at: [-0.3, -8.5], u: -0.3, r: 0.08 },
    { type: 'bumper', at: [-0.3, -7.5], u: 0.1, r: 0.08 },
    { type: 'pickup', at: [0, -1.2], u: 0.4 },
    { type: 'pickup', at: [-0.82, -4.6], u: 0 },
    { type: 'pickup', at: [-0.3, -8.2], u: -0.4 },
  ],
};
