// Hollow Woods 4 — "Witch's Stair": the track tumbles down two crumbling ledges. Roll off the edge and
// the ball drops to the step below; the bends between the drops decide where it lands. Par 3.
// The ledges are real drops: each ends in a short floorless gap with a catch pad (branch) under it
// that tucks up under the overhang, so a ball can't roll back beneath the ledge and off the pad.
// Each landing runs straight for 1.4 m so a full-power leap still lands between the walls.
export default {
  id: 'wood4', name: "Witch's Stair", par: 3,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0.7, w: 1.2, walls: 'LR' },
      { x: 0, z: -1.4 },
      { x: 0, z: -2.5 },
      { x: 0, z: -2.6 },
      { x: 0, z: -2.61, gap: true, walls: '' },       // ledge 1
      { x: 0, z: -3.0, y: 0.38, walls: 'LR' },
      { x: 0, z: -3.1 },
      { x: 0, z: -4.5 },
      { x: 0.6, z: -5.2 },
      { x: 1.1, z: -5.9 },
      { x: 1.1, z: -6.6 },
      { x: 1.1, z: -6.7 },
      { x: 1.1, z: -6.71, gap: true, walls: '' },     // ledge 2
      { x: 1.1, z: -7.1, y: 0.13, walls: 'LR' },
      { x: 1.1, z: -7.2 },
      { x: 1.1, z: -8.6 },
      { x: 0.4, z: -9.8, w: 1.25 },
      { x: -0.2, z: -10.8 },
      { x: -0.2, z: -12.0 },
      { x: -0.2, z: -13.2 },
    ] },
  ],
  // catch pads: walled only across the gap (the main walls take over below), tucked up under the overhang
  branches: [
    { points: [{ x: 0, z: -2.15, y: 0.66, w: 1.2, walls: 'LR' }, { x: 0, z: -2.6, y: 0.4 }, { x: 0, z: -3.0, y: 0.38, walls: '' }, { x: 0, z: -3.5 }] },
    { points: [{ x: 1.1, z: -6.25, y: 0.34, w: 1.2, walls: 'LR' }, { x: 1.1, z: -6.7, y: 0.15 }, { x: 1.1, z: -7.1, y: 0.13, walls: '' }, { x: 1.1, z: -7.6 }] },
  ],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'sand', at0: [0.4, -4.9], at1: [1.1, -6.0], u1: -0.2 },
    { type: 'block', at: [-0.2, -11.3], u: 0.35, size: [0.22, 0.2, 0.07] },
    { type: 'block', at: [-0.2, -11.3], u: -0.35, size: [0.22, 0.2, 0.07] },
    { type: 'pickup', at: [0, -1.8], u: 0.3 },
    { type: 'pickup', at: [0.6, -5.2], u: 0.35 },
    { type: 'pickup', at: [0.4, -9.8], u: -0.35 },
  ],
};
