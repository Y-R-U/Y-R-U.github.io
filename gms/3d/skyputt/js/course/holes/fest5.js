// Festival Isles 5 — "Bumper Cars": a wide arena with two blocks sliding across it out of step and
// three bumpers in between. Pick your moment, or bank it through. Par 3.
export default {
  id: 'fest5', name: 'Bumper Cars', par: 3,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.3, walls: 'LR' },
      { x: 0, z: -1.4 },
      { x: 0, z: -2.6, w: 2.4 },
      { x: 0, z: -6.4 },
      { x: 0, z: -7.4, w: 1.3 },
      { x: 0.6, z: -9.0, y: -0.06 },
      { x: 0.6, z: -10.6, y: -0.06, w: 1.4 },
      { x: 0.6, z: -11.8, y: -0.06 },
    ] },
  ],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'mover', at: [0, -3.5], u: 0, amp: 0.7, period: 3.0, size: [0.4, 0.16, 0.2] },
    { type: 'mover', at: [0, -5.5], u: 0, amp: 0.7, period: 2.6, phase: 1.6, size: [0.4, 0.16, 0.2] },
    { type: 'bumper', at: [0, -4.5], u: 0 },
    { type: 'bumper', at: [0, -4.5], u: 0.85, r: 0.08 },
    { type: 'bumper', at: [0, -4.5], u: -0.85, r: 0.08 },
    { type: 'pickup', at: [0, -4.5], u: 0.45 },
    { type: 'pickup', at: [0, -4.5], u: -0.45 },
    { type: 'pickup', at: [0.6, -9.6], u: 0 },
  ],
};
