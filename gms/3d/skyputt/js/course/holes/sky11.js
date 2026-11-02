// Sky Isles 11 — "Double Loop": a boost pad into a loop, another pad, another loop. Commit to the
// power or roll back down and try again. Par 3.
export default {
  id: 'sky11', name: 'Double Loop', par: 3,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.3, walls: 'LR' },
      { x: 0, z: -1.4 },
      { x: 0, z: -2.8, w: 0.56 },
      { x: 0, z: -4.4 },
    ] },
    { type: 'loop', radius: 0.42, shift: 0.8, width: 0.56 },
    { type: 'path', points: [
      { x: -0.8, z: -4.4, w: 0.56, walls: 'LR' },
      { x: -0.8, z: -5.4 },
      { x: -0.8, z: -7.2 },
    ] },
    { type: 'loop', radius: 0.42, shift: 0.8, width: 0.56 },
    { type: 'path', points: [
      { x: -1.6, z: -7.2, w: 0.56, walls: 'LR' },
      { x: -1.6, z: -8.2 },
      { x: -1.6, z: -9.4, w: 1.4 },
      { x: -1.0, z: -11.0, y: -0.06, w: 1.5 },
      { x: -0.6, z: -12.6, y: -0.06 },
      { x: -0.6, z: -13.8, y: -0.06 },
    ] },
  ],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'boost', at0: [0, -3.0], at1: [0, -3.9] },
    { type: 'boost', at0: [-0.8, -5.6], at1: [-0.8, -6.6] },
    { type: 'bumper', at: [-1.0, -11.0], u: -0.3 },
    { type: 'pickup', at: [0, -2.0], u: 0 },
    { type: 'pickup', at: [-1.4, -9.8], u: 0.45 },
    { type: 'pickup', at: [-0.8, -12.0], u: 0.5 },
  ],
};
