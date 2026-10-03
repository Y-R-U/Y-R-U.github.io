// Generic placeholder business plot: a false-front shop on a dirt lot with a boardwalk, a queue of customers,
// a stock pile and a shop sign. Real plots replace this per business (see docs/ENGINE.md "Add a business").
// o: { wall, roof, sign, w (facade width), h (facade height), floors, extra(b, P) }
export function shopPlot(kit, { line, palette, rng }, o = {}) {
  const P = kit.plot({ id: line?.id || 'shop', line, palette, rng, seed: 11 + (line?.order || 0) * 7 });
  const { b, t1, t2, lot } = P;
  const W = o.w ?? 9, H = o.h ?? 4.2, D = 6, cx = o.x ?? -2;
  const wall = o.wall || 'wall', roof = o.roof || 'roof', sign = o.sign || 'sign';

  lot.slab('dirt', 0, -0.02, 0, 22, 0.06, 8.5, { round: 0.04, taper: 0 });
  for (const x of [-9, -3, 3, 9]) lot.cyl('woodDark', x, 0, 3.6, 0.08, 1.0, 0, { sides: 5 });
  lot.slab('wood2', 0, 0.9, 3.6, 19, 0.1, 0.1, { round: 0.02, taper: 0 });
  lot.slab('sign', 0, 0.4, 3.62, 2.2, 0.9, 0.06, { round: 0.02, taper: 0 });

  b.slab('pad', 0, -0.02, 0, 22, 0.06, 8.5, { round: 0.04, taper: 0 });
  b.slab('wood', cx, 0.0, 1.4, W + 1.2, 0.22, 2.0, { round: 0.03, taper: 0 });
  b.slab(wall, cx, 0.2, -1.6, W, H, D, { round: 0.06, taper: 0 });
  b.slab(wall, cx, H + 0.1, 0.0, W + 0.2, 1.8, 0.3, { round: 0.04, taper: 0 });
  b.slab('trim', cx, H + 1.85, 0.05, W + 0.5, 0.2, 0.45, { round: 0.03, taper: 0 });
  b.slab(sign, cx, H + 0.4, 0.2, W * 0.7, 1.0, 0.08, { round: 0.02, taper: 0, noAo: true });
  b.slab(roof, cx, H + 0.1, -2.2, W, 0.25, D - 1.0, { round: 0.04, taper: 0 });
  b.slab('door', cx, 0.2, 1.36, 1.3, 2.3, 0.1, { round: 0.02, taper: 0 });
  for (const k of [-1, 1]) b.slab('window', cx + k * W * 0.3, 1.2, 1.37, 1.3, 1.3, 0.06, { round: 0.02, taper: 0, noAo: true });
  b.slab('roof2', cx, 2.9, 2.0, W + 1.2, 0.12, 1.6, { round: 0.03, taper: 0, rx: 0.12 });
  for (const k of [-1, 1]) b.cyl('woodDark', cx + k * (W / 2 + 0.4), 0.2, 2.6, 0.09, 2.7, 0, { sides: 6 });
  const lamp = kit.props.lamp(b, cx + W / 2 + 1.4, 2.6, { h: 2.6 });
  o.extra?.(b, P);

  t1.slab(wall, cx + W / 2 + 2.2, 0.2, -1.8, 3.2, H * 0.7, 4.6, { round: 0.06, taper: 0 });
  t1.slab(roof, cx + W / 2 + 2.2, H * 0.7 + 0.2, -1.8, 3.4, 0.2, 4.8, { round: 0.04, taper: 0 });
  t2.slab(wall, cx, H + 1.9, -2.4, W * 0.8, 2.4, 3.6, { round: 0.06, taper: 0 });
  t2.slab(roof, cx, H + 4.3, -2.4, W * 0.84, 0.25, 3.8, { round: 0.04, taper: 0 });
  t2.slab('gold', cx, H + 2.6, -0.58, 1.4, 0.8, 0.08, { round: 0.02, taper: 0, noAo: true });

  const crowd = P.crowd({ count: 6 });
  P.queue(crowd, { ids: [0, 1, 2, 3], spawn: [[10, 3.4], [-10, 3.4]], counter: [cx, 2.8], dir: [1, 0.25], exit: [[cx + 3, 3.6], [11, 3.8]] });
  P.walkers(crowd, { ids: [4, 5], paths: [[[-10, 2.6], [10, 2.6]], [[cx - 3, 1.6], [cx + 3, 1.6]]], ownedOnly: true, speed: 0.8 });
  P.pile({ at: [6.5, 0.05, 1.4], kind: 'box', size: 0.38, max: 24 });

  return P.done({
    w: 22, d: 8.5, h: H + 2,
    lamps: [lamp],
    focus: [0, 0],
    exit: [[6.5, 1.4], [8.5, 3.5], [11.5, 4.5]],
  });
}

export default function buildPlot(kit, opts) {
  return shopPlot(kit, opts);
}
