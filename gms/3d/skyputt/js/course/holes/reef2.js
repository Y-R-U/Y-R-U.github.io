// Sunken Reef 2 — "Riptide Run": a steep sandbank rises to a raised green. A narrow current runs up
// the left of the slope and carries a ball over the top; anywhere else needs a firm stroke or the
// ball drifts back down. A coral head guards the crest off the current. Par 3.
export default {
  id: 'reef2', name: 'Riptide Run', par: 3,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.4, walls: 'LR' },
      { x: 0, z: -1.6 },
      { x: 0, z: -3.0, y: 0 },
      { x: 0, z: -5.0, y: 0.42 },
      { x: 0, z: -6.2, y: 0.44 },
      { x: -0.5, z: -7.6, y: 0.44, w: 1.5 },
      { x: -0.5, z: -9.0, y: 0.44 },
    ] },
  ],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'boost', at0: [0, -2.4], at1: [0, -4.8], u0: 0.12, u1: 0.62 },
    { type: 'bumper', at: [0, -5.7], u: -0.3, r: 0.09 },
    { type: 'bumper', at: [-0.5, -8.4], u: 0.5, r: 0.08 },
    { type: 'bumper', at: [-0.5, -8.4], u: -0.5, r: 0.08 },
    { type: 'pickup', at: [0, -1.8], u: -0.4 },
    { type: 'pickup', at: [0, -3.8], u: 0.37 },
    { type: 'pickup', at: [-0.5, -7.6], u: 0 },
  ],
};
