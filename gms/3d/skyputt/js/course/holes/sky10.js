// Sky Isles 10 — "Ice Rink": a frozen run that bends twice; the ice keeps the ball sliding, so pace
// matters more than power. The green climbs a little at the end to catch you. Par 3.
export default {
  id: 'sky10', name: 'Ice Rink', par: 3,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.4, walls: 'LR' },
      { x: 0, z: -1.6 },
      { x: 0.7, z: -3.8, y: -0.06, w: 1.5 },
      { x: 0.9, z: -6.0, y: -0.12 },
      { x: -0.2, z: -8.2, y: -0.16 },
      { x: -0.9, z: -10.0, y: -0.06, w: 1.6 },
      { x: -0.9, z: -11.6, y: -0.02 },
      { x: -0.9, z: -12.8, y: 0.0 },
    ] },
  ],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'ice', at0: [0.2, -2.4], at1: [-0.6, -9.2] },
    { type: 'bumper', at: [0.85, -6.0], u: 0.0 },
    { type: 'pickup', at: [0.5, -3.4], u: -0.45 },
    { type: 'pickup', at: [0.9, -6.0], u: 0.45 },
    { type: 'pickup', at: [-0.3, -8.0], u: -0.4 },
  ],
};
