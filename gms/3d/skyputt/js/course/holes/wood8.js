// Hollow Woods 8 — "Bone Chute": a steep, wide chute studded with lantern bumpers and grave slabs —
// pinball downhill. At the bottom the chute ends at a ledge; drop to the green and mind the gate. Par 4.
export default {
  id: 'wood8', name: 'Bone Chute', par: 4,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0.75, w: 1.2, walls: 'LR' },
      { x: 0, z: -1.0 },
      { x: 0, z: -2.0, w: 2.2 },
      { x: 0, z: -3.6, y: 0.62 },
      { x: 0, z: -5.4, y: 0.44 },
      { x: 0, z: -7.0, y: 0.3 },
      { x: 0, z: -7.9, y: 0.3, w: 1.0 },
      { x: 0, z: -8.5 },
      { x: 0, z: -8.6 },
      { x: 0, z: -8.61, gap: true, walls: '' },       // the ledge
      { x: 0, z: -9.0, y: 0.0, walls: 'LR' },
      { x: 0, z: -9.1 },
      { x: 0, z: -10.3 },
      { x: -0.6, z: -11.3, w: 1.2 },
      { x: -1.6, z: -12.0 },
      { x: -2.5, z: -13.0 },
      { x: -2.6, z: -14.2 },
      { x: -2.6, z: -15.4 },
      { x: -2.6, z: -16.4 },
    ] },
  ],
  branches: [
    { points: [{ x: 0, z: -8.15, y: 0.26, w: 1.0, walls: 'LR' }, { x: 0, z: -8.6, y: 0.02 }, { x: 0, z: -9.0, y: 0.0, walls: '' }, { x: 0, z: -9.5 }] },
  ],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'bumper', at: [0, -2.9], u: 0 },
    { type: 'bumper', at: [0, -3.9], u: 0.55 },
    { type: 'bumper', at: [0, -3.9], u: -0.55 },
    { type: 'block', at: [0, -4.9], u: 0, size: [0.3, 0.2, 0.07] },
    { type: 'bumper', at: [0, -5.7], u: 0.75, r: 0.08 },
    { type: 'bumper', at: [0, -5.7], u: -0.75, r: 0.08 },
    { type: 'block', at: [0, -6.5], u: 0.35, size: [0.24, 0.2, 0.07] },
    { type: 'block', at: [0, -6.5], u: -0.35, size: [0.24, 0.2, 0.07] },
    { type: 'mover', at: [-2.6, -14.0], u: 0.43, amp: 0.1, period: 4.0, size: [0.54, 0.16, 0.1] },
    { type: 'mover', at: [-2.6, -14.0], u: -0.43, amp: 0.1, period: 4.0, phase: Math.PI, size: [0.54, 0.16, 0.1] },
    { type: 'pickup', at: [0, -3.4], u: 0.5 },
    { type: 'pickup', at: [0, -5.2], u: -0.6 },
    { type: 'pickup', at: [-1.6, -12.0], u: 0 },
  ],
};
