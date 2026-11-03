// Sugar Summit 8 — "Peppermint Mill": two steep sugar-cube steps up to the summit ridge, then a turn
// along the ridge to a peppermint windmill. Each step needs a firm putt or the ball rolls back to the
// terrace below; the bend at the top keeps a ball bounced off the mill on the ridge. Par 4.
export default {
  id: 'sugar8', name: 'Peppermint Mill', par: 4,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.3, walls: 'LR' },
      { x: 0, z: -1.4, y: 0 },
      { x: 0, z: -2.0, y: 0 },
      { x: 0, z: -3.0, y: 0.2 },
      { x: 0, z: -3.6, y: 0.22 },
      { x: 0, z: -4.6, y: 0.22, w: 1.2 },
      { x: 0, z: -5.6, y: 0.42 },
      { x: 0, z: -6.2, y: 0.44 },
      { x: -0.5, z: -7.4, y: 0.44, w: 1.1 },
      { x: -1.7, z: -7.9, y: 0.44 },
      { x: -2.9, z: -7.9, y: 0.44 },
      { x: -3.9, z: -8.6, y: 0.44, w: 1.4 },
      { x: -4.2, z: -10.0, y: 0.44 },
      { x: -4.2, z: -11.4, y: 0.44 },
      { x: -4.2, z: -12.4, y: 0.44 },
    ] },
  ],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'windmill', at: [-2.4, -7.9], omega: 1.0, hub: 0.64, blades: 4, bladeW: 0.18, gap: 0.38 },
    { type: 'bumper', at: [-4.2, -10.8], u: -0.42, r: 0.09 },
    { type: 'pickup', at: [0, -3.9], u: 0.4 },
    { type: 'pickup', at: [-0.5, -7.4], u: 0.3 },
    { type: 'pickup', at: [-4.0, -9.4], u: 0.4 },
  ],
};
