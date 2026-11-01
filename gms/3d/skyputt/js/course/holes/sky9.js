// Sky Isles 9 — "Grand Isle": the full tour, like the ref: S-bend, windmill, loop, raised green. Par 4.
export default {
  id: 'sky9', name: 'Grand Isle', par: 4,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.4, walls: 'LR' },
      { x: 0, z: -1.8 },
      { x: -0.9, z: -3.8 },
      { x: -1.2, z: -5.4, w: 1.0 },
      { x: -1.2, z: -8.4 },
      { x: -1.2, z: -9.4, w: 0.5 },
      { x: -1.2, z: -10.4 },
    ] },
    { type: 'loop', radius: 0.45, shift: 0.8, width: 0.5 },
    { type: 'path', points: [
      { x: -2.0, z: -10.4, w: 0.5, walls: 'LR' },
      { x: -2.0, z: -11.4 },
      { x: -2.0, z: -12.8, y: 0.12, w: 1.3 },
      { x: -1.3, z: -14.6, y: 0.22, w: 1.6 },
      { x: -1.1, z: -16.2, y: 0.22 },
    ] },
  ],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'windmill', at: [-1.2, -6.9], omega: 1.25, hub: 0.64 },
    { type: 'pickup', at: [-0.4, -2.8], u: 0.3 },
    { type: 'pickup', at: [-1.2, -8.2], u: 0 },
    { type: 'pickup', at: [-1.6, -13.6], u: -0.4 },
  ],
};
