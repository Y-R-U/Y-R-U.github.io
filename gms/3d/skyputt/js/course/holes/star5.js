// Star Station 5 — "Orbit Loop": a gravity accelerator fires the ball round the station's orbit
// ring, then out onto a downhill S of polished glass deck where nothing slows it, past a beacon
// pylon in the middle of the S to a green ringed by pylons. Par 2.
export default {
  id: 'star5', name: 'Orbit Loop', par: 2,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0.5, w: 1.3, walls: 'LR' },
      { x: 0, z: -1.4 },
      { x: 0, z: -2.8, w: 0.56 },
      { x: 0, z: -3.8 },
    ] },
    { type: 'loop', radius: 0.45, shift: 0.82, width: 0.56 },
    { type: 'path', points: [
      { x: -0.82, z: -3.8, y: 0.5, w: 0.56, walls: 'LR' },
      { x: -0.82, z: -4.6, y: 0.5 },
      { x: -0.82, z: -5.4, y: 0.46, w: 0.9 },
      { x: -0.2, z: -6.8, y: 0.32, bank: 5 },
      { x: -1.2, z: -8.4, y: 0.16, bank: -5 },
      { x: -0.8, z: -9.8, y: 0.08, bank: 0, w: 1.3 },
      { x: -0.8, z: -11.0, y: 0.08, w: 1.4 },
      { x: -0.8, z: -12.2, y: 0.08 },
    ] },
  ],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'boost', at0: [0, -1.8], at1: [0, -2.9], u0: -0.3, u1: 0.3 },
    { type: 'ice', at0: [-0.82, -5.2], at1: [-0.8, -9.8] },
    { type: 'bumper', at: [-0.7, -7.6], u: 0, r: 0.08 },
    { type: 'sticky', at0: [-0.8, -10.0], at1: [-0.8, -10.5], u0: -0.1 },
    { type: 'bumper', at: [-0.8, -11.6], u: 0.4, r: 0.08 },
    { type: 'bumper', at: [-0.8, -11.6], u: -0.4, r: 0.08 },
    { type: 'pickup', at: [0, -1.2], u: 0.4 },
    { type: 'pickup', at: [-0.2, -6.8], u: -0.25 },
    { type: 'pickup', at: [-0.8, -10.8], u: 0.45 },
  ],
};
