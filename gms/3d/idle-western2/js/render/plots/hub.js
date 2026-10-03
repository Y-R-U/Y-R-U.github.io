// The hub: the open stretch of main street the hero starts on (tap anywhere to hustle for the first business).
// PLACEHOLDER: a water trough, a well, a parked wagon, a welcome sign and a few loafers.
export default function buildPlot(kit, { palette, rng }) {
  const P = kit.plot({ id: 'hub', palette, rng, seed: 5 });
  const { b } = P;
  b.slab('pad', 0, -0.02, 0, 22, 0.06, 8.5, { round: 0.04, taper: 0 });
  const WX = -7.6, WZ = -0.2;
  b.cyl('stone', WX, 0, WZ, 1.3, 0.9, 0, { sides: 10, taper: 1 });
  b.cyl('water', WX, 0.6, WZ, 1.1, 0.25, 0, { sides: 10 });
  for (const k of [-1, 1]) b.cyl('woodDark', WX + k * 1.1, 0.9, WZ, 0.08, 1.6, 0, { sides: 5 });
  b.slab('roof2', WX, 2.5, WZ, 2.8, 0.12, 1.6, { round: 0.03, taper: 0 });
  // the mud wallow in front of the saloon steps where the Stranger lands face-first (spectacle anchor 'mud')
  const MUD = [0.3, -2.0];
  b.ball({ c: '#6e4a32', r: 0.25 }, MUD[0], -0.02, MUD[1], 1.0, { sx: 1.75, sy: 0.06, sz: 1.05, detail: 1, smooth: true, noAo: true });
  b.ball({ c: '#5a3a26', r: 0.12 }, MUD[0] + 0.2, -0.01, MUD[1] + 0.1, 0.75, { sx: 1.6, sy: 0.05, sz: 0.9, detail: 1, smooth: true, noAo: true });
  for (const [dx, dz, r] of [[-1.6, 0.7, 0.3], [1.8, -0.5, 0.25], [1.2, 0.9, 0.2]]) b.ball({ c: '#6e4a32', r: 0.3 }, MUD[0] + dx, -0.02, MUD[1] + dz, r, { sy: 0.1, detail: 0, noAo: true });
  b.slab('wood', 3, 0.1, 2.4, 3.2, 0.7, 0.8, { round: 0.04 });
  b.slab('water', 3, 0.75, 2.4, 2.9, 0.06, 0.6, { round: 0.02, noAo: true });
  b.slab('wood2', 6.5, 0.6, -1.4, 3.6, 0.5, 1.8, { round: 0.06 });
  for (const [x, z] of [[5.3, -0.4], [7.7, -0.4], [5.3, -2.4], [7.7, -2.4]]) b.cyl('woodDark', x, 0.55, z, 0.55, 0.12, 0, { sides: 10, rx: Math.PI / 2 });
  b.slab('cream', 6.5, 1.1, -1.4, 3.4, 1.2, 1.7, { round: 0.6, taper: 0.1 });
  b.cyl('woodDark', -9, 0, 2.8, 0.1, 2.6, 0, { sides: 5 });
  b.slab('sign', -9, 1.8, 2.85, 2.4, 0.9, 0.08, { round: 0.02, noAo: true });
  const lamp = kit.props.lamp(b, 0.5, 3.4, { h: 3 });
  // R4: town-sized loafers (plots use 1.08) kept off the saloon's ejection lane in front of its doors
  const crowd = P.crowd({ count: 4, scale: 1.08 });
  P.walkers(crowd, { ids: [0, 1, 2, 3], paths: [[[-9, 3.6], [-3.6, 3.6]], [[3.4, 0.6], [8, 1.0]], [[3, 3.6], [8, 3.0]]], speed: 0.7 });
  const out = P.done({
    w: 18, d: 7, h: 5,
    lamps: [lamp],
    camera: { pos: [-3.4, 6.4, 13.4], look: [-0.4, 0.9, 0.4], fov: 32 },
    pileAnchor: [0, 0.2, 2.4], pileR: 0.01,
  });
  out.anchors = { mud: [MUD[0] - 0.4, 0, MUD[1] - 0.3], center: [0, 0, 0] };
  return out;
}
