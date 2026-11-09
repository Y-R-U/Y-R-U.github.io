// Jungle Temple 9 — "Idol Court": the finale. Through the gate of the stone wheel totem, down the
// hollow log across the gorge, then a court of idol heads with a rolling stone in front of the cup.
// Par 5.
export default {
  id: 'jungle9', name: 'Idol Court', par: 5,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0.4, w: 1.2, walls: 'LR' },
      { x: 0, z: -1.6 },
      { x: 0, z: -3.4 },
      { x: 0, z: -4.4, w: 1.0 },
      { x: 0.6, z: -5.4 },
      { x: 0.7, z: -6.0, w: 0.3 },
      { x: 0.7, z: -6.6 },
    ] },
    { type: 'tube', radius: 0.15, points: [
      { x: 0.7, z: -6.6, y: 0.4 },
      { x: 1.2, z: -7.8, y: 0.3 },
      { x: 0.9, z: -9.2, y: 0.16 },
      { x: 0.1, z: -10.2, y: 0.04 },
      { x: -0.2, z: -10.8, y: 0 },
    ] },
    { type: 'path', points: [
      { x: -0.2, z: -10.8, y: 0, w: 0.3, walls: 'LR' },
      { x: -0.2, z: -11.4 },
      { x: -0.2, z: -12.2, w: 1.5 },
      { x: -0.2, z: -13.4 },
      { x: -0.2, z: -14.6, w: 1.5 },
      { x: -0.2, z: -15.8 },
      { x: -0.2, z: -16.8 },
    ] },
  ],
  voids: [[[-1.2, -6.9], [2.6, -6.9], [2.6, -10.5], [-1.2, -10.5]]],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'windmill', at: [0, -2.6], omega: 1.0, hub: 0.64, blades: 4, bladeW: 0.18, gap: 0.38 },
    { type: 'bumper', at: [-0.2, -12.7], u: 0.35, r: 0.08 },
    { type: 'bumper', at: [-0.2, -12.7], u: -0.35, r: 0.08 },
    { type: 'bumper', at: [-0.2, -13.5], u: 0, r: 0.08 },
    { type: 'bumper', at: [-0.2, -14.3], u: 0.5, r: 0.08 },
    { type: 'bumper', at: [-0.2, -14.3], u: -0.5, r: 0.08 },
    { type: 'mover', at: [-0.2, -15.2], amp: 0.4, period: 3.0, size: [0.42, 0.16, 0.2] },
    { type: 'bumper', at: [-0.2, -16.3], u: 0.42, r: 0.08 },
    { type: 'pickup', at: [0, -1.4], u: 0.35 },
    { type: 'pickup', at: [0.6, -5.3], u: 0 },
    { type: 'pickup', at: [-0.2, -13.1], u: 0.45 },
  ],
};
