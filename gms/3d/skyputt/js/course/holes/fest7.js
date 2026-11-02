// Festival Isles 7 — "Hilltop Mill": a boost pad sends you up the hill to a six-sail windmill on the
// crest; through the tunnel the green falls away to the right, sand on the outside. Par 3.
export default {
  id: 'fest7', name: 'Hilltop Mill', par: 3,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.4, walls: 'LR' },
      { x: 0, z: -1.6 },
      { x: 0, z: -3.0, w: 1.2 },
      { x: 0, z: -5.0, y: 0.32 },
      { x: 0, z: -6.0, y: 0.36 },
      { x: 0, z: -7.4, y: 0.36 },
      { x: 0.6, z: -9.0, y: 0.2, w: 1.4 },
      { x: 1.3, z: -10.6, y: 0.12 },
      { x: 1.3, z: -12.0, y: 0.12 },
      { x: 1.3, z: -13.0, y: 0.12 },
    ] },
  ],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'boost', at0: [0, -1.9], at1: [0, -2.8], u0: -0.3, u1: 0.3 },
    { type: 'windmill', at: [0, -6.7], omega: 1.0, hub: 0.64, blades: 6, bladeW: 0.14, gap: 0.38 },
    { type: 'sand', at0: [0.4, -8.6], at1: [1.1, -10.0], u0: 0.3 },
    { type: 'pickup', at: [0, -4.0], u: 0.3 },
    { type: 'pickup', at: [0, -5.6], u: -0.35 },
    { type: 'pickup', at: [1.3, -11.4], u: -0.4 },
  ],
};
