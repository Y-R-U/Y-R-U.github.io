// Sugar Summit 9 — "Spiral Descent": the finale, from the very top of the mountain. A glass tube
// corkscrews two full turns down round the peak and spits you onto a glazed run that ends in
// a caramel basin. From there a sugar rush lane fires you round the last loop to a green ringed with
// gumdrops. Par 4.
const C = [-1.0, -4.6], R = 1.0;   // spiral centre / radius
const ring = [];
{ // 8 points a turn, clockwise seen from above (east → south → west → north), 2 turns, from y 1.74 down
  for (let k = 0; k <= 16; k++) {
    const a = k * Math.PI / 4;
    ring.push({ x: +(C[0] + R * Math.cos(a)).toFixed(3), z: +(C[1] - R * Math.sin(a)).toFixed(3), y: +(1.74 - k * 0.08).toFixed(3) });
  }
}
export default {
  id: 'sugar9', name: 'Spiral Descent', par: 4,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 1.8, w: 1.2, walls: 'LR' },
      { x: 0, z: -1.2 },
      { x: 0, z: -2.4, w: 1.0 },
      { x: 0, z: -3.2, w: 0.3 },
      { x: 0, z: -3.8 },
    ] },
    { type: 'tube', radius: 0.15, points: [
      { x: 0, z: -3.8, y: 1.8 },
      ...ring,
      { x: 0, z: -5.6, y: 0.38 },
      { x: 0, z: -6.4, y: 0.32 },
    ] },
    { type: 'path', points: [
      { x: 0, z: -6.4, y: 0.32, w: 0.3, walls: 'LR' },
      { x: 0, z: -7.0, y: 0.3 },
      { x: 0, z: -8.0, y: 0.26, w: 1.1 },
      { x: -0.6, z: -9.6, y: 0.16, bank: -8 },
      { x: -0.6, z: -10.8, y: 0.12, w: 1.2, bank: 0 },
      { x: -0.6, z: -11.8, y: 0.12 },
      { x: -0.6, z: -12.8, y: 0.12, w: 0.56 },
      { x: -0.6, z: -13.6, y: 0.12 },
    ] },
    { type: 'loop', radius: 0.42, shift: 0.82, width: 0.56 },
    { type: 'path', points: [
      { x: -1.42, z: -13.6, y: 0.12, w: 0.56, walls: 'LR' },
      { x: -1.42, z: -14.4 },
      { x: -1.2, z: -15.8, w: 1.6 },
      { x: -1.2, z: -17.4 },
      { x: -1.2, z: -18.4 },
    ] },
  ],
  voids: [[[-2.3, -3.3], [0.3, -3.3], [0.3, -5.9], [-2.3, -5.9]]],
  tee: { s: 0.5 }, cup: { s: -0.9 },
  features: [
    { type: 'bumper', at: [0, -1.8], u: 0.3, r: 0.09 },
    { type: 'ice', at0: [0, -7.2], at1: [-0.6, -10.4] },
    { type: 'sticky', at0: [-0.6, -10.6], at1: [-0.6, -11.6] },
    { type: 'boost', at0: [-0.6, -12.0], at1: [-0.6, -13.2] },
    { type: 'bumper', at: [-1.2, -16.4], u: 0.55, r: 0.09 },
    { type: 'bumper', at: [-1.2, -16.4], u: -0.55, r: 0.09 },
    { type: 'bumper', at: [-1.2, -18.0], u: 0.45, r: 0.08 },
    { type: 'bumper', at: [-1.2, -18.0], u: -0.45, r: 0.08 },
    { type: 'pickup', at: [0, -1.4], u: -0.35 },
    { type: 'pickup', at: [-0.6, -9.6], u: 0.3 },
    { type: 'pickup', at: [-1.2, -15.6], u: 0 },
  ],
};
