// Hollow Woods 5 — "Lych Gates": a narrow lane through two churchyard gates whose two leaves slide
// shut and open again, each on its own beat, with a dogleg between them. Par 3.
// Each gate is a pair of movers in counter-phase: wide open when they part, a ball-wide slit (0.14 m) when they
// meet. The leaves never leave their wall slots and never close fully, so a ball can't be pinched.
const gate = (at, period, phase = 0) => [
  { type: 'mover', at, u: 0.35, amp: 0.09, period, phase, size: [0.38, 0.16, 0.1] },
  { type: 'mover', at, u: -0.35, amp: 0.09, period, phase: phase + Math.PI, size: [0.38, 0.16, 0.1] },
];
export default {
  id: 'wood5', name: 'Lych Gates', par: 3,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.2, walls: 'LR' },
      { x: 0, z: -1.2 },
      { x: 0, z: -2.2, w: 0.9 },
      { x: 0, z: -4.8 },
      { x: 0.6, z: -6.0, y: -0.04 },
      { x: 1.4, z: -6.6, y: -0.06 },
      { x: 2.2, z: -7.3, y: -0.08 },
      { x: 2.4, z: -8.4, y: -0.1 },
      { x: 2.4, z: -9.4, y: -0.1, w: 1.3 },
      { x: 2.4, z: -10.6, y: -0.1 },
      { x: 2.4, z: -11.8, y: -0.1 },
    ] },
  ],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    ...gate([0, -2.9], 4.2),
    ...gate([2.35, -8.1], 3.6, 2.4),
    { type: 'pickup', at: [0, -3.6], u: 0 },
    { type: 'pickup', at: [1.4, -6.6], u: 0.2 },
    { type: 'pickup', at: [2.4, -9.6], u: -0.4 },
  ],
};
