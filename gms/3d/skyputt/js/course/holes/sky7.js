// Sky Isles 7 — "The Shortcut": a long U-bend, or a narrow wall-less plank straight across the void. Par 4.
export default {
  id: 'sky7', name: 'The Shortcut', par: 4,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.2, walls: 'LR' },
      { x: 0, z: -1.6 },
      { x: 0, z: -2.75, walls: 'L' },       // the right wall opens for the plank
      { x: 0, z: -3.25, walls: 'LR' },
      { x: 0, z: -6.0 },
      { x: 0, z: -8.6 },
      { x: 0.6, z: -10.2 },
      { x: 1.6, z: -10.8 },
      { x: 2.6, z: -10.2 },
      { x: 3.2, z: -8.6 },
      { x: 3.2, z: -6.0 },
      { x: 3.2, z: -3.25, walls: 'L' },      // inner (right) side open where the plank lands
      { x: 3.2, z: -2.75, walls: 'LR' },
      { x: 3.2, z: -1.0 },
      { x: 3.2, z: 0.4 },
    ] },
  ],
  branches: [
    { points: [{ x: 0.56, z: -3.0, y: 0, w: 0.36, walls: '', surf: 'bridge' }, { x: 2.64, z: -3.0 }] },
  ],
  // the drop inside the U: themes must keep ground, rock and props out of it (info.voids)
  voids: [[[0.75, -1.2], [2.45, -1.2], [2.45, -9.0], [1.6, -9.6], [0.75, -9.0]]],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'pickup', at: [1.6, -3.0], u: 0 },
    { type: 'pickup', at: [1.6, -10.8], u: 0 },
    { type: 'pickup', at: [0, -5.0], u: 0.3 },
  ],
};
