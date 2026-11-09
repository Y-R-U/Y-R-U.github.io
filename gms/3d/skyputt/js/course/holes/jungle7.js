// Jungle Temple 7 — "Temple Stair": the grand stair zig-zags up the pyramid's face. Three climbing legs
// round two banked switchbacks; glyph runes on the steep middle leg carry a ball up, mud fills each
// switchback's inside and idols stand on the outside to bank off. Par 4.
export default {
  id: 'jungle7', name: 'Temple Stair', par: 4,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.0, walls: 'LR' },
      { x: 0, z: -1.4, y: 0 },
      { x: 0, z: -4.0, y: 0.2, bank: 0 },
      { x: 0.264, z: -4.636, y: 0.23, bank: 10 },    // switchback 1 (r 0.9), banked
      { x: 0.9, z: -4.9, y: 0.26, bank: 12 },
      { x: 1.536, z: -4.636, y: 0.29, bank: 10 },
      { x: 1.8, z: -4.0, y: 0.32, bank: 0 },
      { x: 1.8, z: -1.2, y: 0.6 },
      { x: 2.064, z: -0.564, y: 0.63, bank: -5 },    // switchback 2
      { x: 2.7, z: -0.3, y: 0.66, bank: -6 },
      { x: 3.336, z: -0.564, y: 0.69, bank: -5 },
      { x: 3.6, z: -1.2, y: 0.72, bank: 0 },
      { x: 3.6, z: -3.6, y: 0.8 },
      { x: 3.6, z: -5.4, y: 0.82, w: 1.3 },
      { x: 3.6, z: -6.6, y: 0.82 },
    ] },
  ],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'bumper', at: [0, -2.4], u: 0.25, r: 0.08 },
    { type: 'sticky', at0: [0.264, -4.636], at1: [1.536, -4.636], u1: -0.15 },
    { type: 'boost', at0: [1.8, -3.6], at1: [1.8, -1.6], u0: -0.25, u1: 0.25 },
    { type: 'sticky', at0: [2.064, -0.564], at1: [3.336, -0.564], u0: 0.15 },
    { type: 'bumper', at: [3.6, -2.6], u: 0.2, r: 0.08 },
    { type: 'bumper', at: [3.6, -4.6], u: -0.35, r: 0.08 },
    { type: 'pickup', at: [0.9, -4.9], u: 0.3 },
    { type: 'pickup', at: [1.8, -2.6], u: -0.3 },
    { type: 'pickup', at: [2.7, -0.3], u: -0.3 },
  ],
};
