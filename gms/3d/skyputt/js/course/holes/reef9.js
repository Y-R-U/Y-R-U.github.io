// Sunken Reef 9 — "Poseidon's Gate": the finale. Through the old temple's water-mill gate, down a
// pearl chute into a current that fires you round a sunken loop, then a sliding temple block guards a
// green ringed by four coral heads. Par 4.
export default {
  id: 'reef9', name: "Poseidon's Gate", par: 4,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0.3, w: 1.2, walls: 'LR' },
      { x: 0, z: -1.6 },
      { x: 0, z: -3.4 },
      { x: 0, z: -4.4, w: 1.0 },
      { x: 0.8, z: -6.0, y: 0.15 },
      { x: 0.8, z: -7.4, y: 0.05, w: 0.56 },
      { x: 0.8, z: -8.4, y: 0.05 },
    ] },
    { type: 'loop', radius: 0.45, shift: 0.82, width: 0.56 },
    { type: 'path', points: [
      { x: -0.02, z: -8.4, y: 0.05, w: 0.56, walls: 'LR' },
      { x: -0.02, z: -9.2 },
      { x: -0.02, z: -10.6, w: 1.5 },
      { x: -0.02, z: -12.4 },
      { x: -0.02, z: -13.6 },
    ] },
  ],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'windmill', at: [0, -2.6], omega: 1.0, hub: 0.64, blades: 4, bladeW: 0.18, gap: 0.38 },
    { type: 'ice', at0: [0.3, -5.0], at1: [0.8, -7.0] },
    { type: 'boost', at0: [0.8, -7.4], at1: [0.8, -8.3] },
    { type: 'sand', at0: [-0.02, -9.4], at1: [-0.02, -10.2], u0: -0.75, u1: -0.1 },
    { type: 'mover', at: [-0.02, -10.9], amp: 0.42, period: 3.0, size: [0.44, 0.16, 0.2] },
    { type: 'mover', at: [-0.02, -11.5], amp: 0.42, period: 2.4, phase: 2.2, size: [0.36, 0.16, 0.2] },
    { type: 'bumper', at: [-0.02, -12.1], u: 0.52, r: 0.08 },
    { type: 'bumper', at: [-0.02, -12.1], u: -0.52, r: 0.08 },
    { type: 'bumper', at: [-0.02, -13.3], u: 0.42, r: 0.08 },
    { type: 'bumper', at: [-0.02, -13.3], u: -0.42, r: 0.08 },
    { type: 'pickup', at: [0, -1.4], u: 0.35 },
    { type: 'pickup', at: [0.8, -6.4], u: 0 },
    { type: 'pickup', at: [-0.02, -10.0], u: 0.35 },
  ],
};
