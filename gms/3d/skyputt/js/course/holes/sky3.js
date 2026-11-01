// Sky Isles 3 — "Loop and Leap": funnel into a loop, then a ramp over a gap to the green. Par 3.
export default {
  id: 'sky3', name: 'Loop and Leap', par: 3,
  pieces: [
    { type: 'path', points: [
      { x: 0, z: 0.4, y: 0, w: 1.3, walls: 'LR' },
      { x: 0, z: -1.6 },
      { x: 0, z: -3.0, w: 0.5 },
      { x: 0, z: -4.2 },
    ] },
    { type: 'loop', radius: 0.45, shift: 0.8, width: 0.5 },
    { type: 'path', points: [
      { x: -0.8, z: -4.2, w: 0.5, walls: 'LR' },
      { x: -0.8, z: -5.3 },
      { x: -0.8, z: -6.6, w: 1.1 },
      { x: -0.8, z: -7.6, y: 0.0 },
      { x: -0.8, z: -8.7, y: 0.2, gap: true, walls: '' },
      { x: -0.8, z: -9.4, y: -0.3, w: 1.4, walls: 'LR' },
      { x: -0.8, z: -10.2, y: -0.3 },
      { x: -0.8, z: -12.0, y: -0.3 },
    ] },
  ],
  tee: { s: 0.5 },
  cup: { s: -0.9 },
  features: [
    { type: 'pickup', s: 2.0, u: 0 },
    { type: 'pickup', s: 9.0, u: 0 },
    { type: 'pickup', s: 12.8, u: 0.4 },
  ],
};
