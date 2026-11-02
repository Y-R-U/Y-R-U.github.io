// Sky Isles 17 — "Twin Mills": two windmills turning at different speeds, with a kink between them.
// Thread the first, line up on the narrow straight, then time the second. Par 3.
export default {
  id: 'sky17', name: 'Twin Mills', par: 3,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.3, walls: 'LR' },
      { x: 0, z: -1.6, w: 1.0 },
      { x: 0, z: -4.4 },
      { x: 0.5, z: -5.8, w: 1.3 },
      { x: 1.3, z: -6.8 },
      { x: 1.5, z: -8.0, w: 0.8 },
      { x: 1.5, z: -11.4 },
      { x: 1.3, z: -12.8, y: -0.08, w: 1.5 },
      { x: 0.9, z: -14.4, y: -0.1 },
      { x: 0.9, z: -15.6, y: -0.1 },
    ] },
  ],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'windmill', at: [0, -3.1], omega: 0.9, hub: 0.64, blades: 3 },
    { type: 'windmill', at: [1.5, -10.4], omega: 1.2, hub: 0.64, phase: 0.6, gap: 0.42, blades: 3 },
    { type: 'pickup', at: [0, -1.8], u: 0 },
    { type: 'pickup', at: [0.9, -6.3], u: 0.4 },
    { type: 'pickup', at: [1.1, -13.6], u: -0.5 },
  ],
};
