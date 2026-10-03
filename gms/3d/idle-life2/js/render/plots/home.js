// 🏠 Home: the bench you wake on, cans to pick up, the recycling bin, and the six homes of a life
// (bench → bedsit over a laundrette → apartment → starter house → family home → mansion). Moves arrive by removal van.
export default function buildPlot(kit, { palette, rng }) {
  const P = kit.plot({ id: 'home', palette, rng, seed: 5, colors: { accent: '#7fbf7a', bin: '#5aa36a', can: { c: '#c9d3dc', r: 0.3, m: 0.8 }, lawn: '#9cc874', van: '#f3e6d0' } });
  const { b, lot, props: K } = P;
  const S = kit.shape;
  const BX = -3.2, BZ = 1.5;

  b.add(lawn(9.5, 4.8), 'lawn', { x: -5.6, y: 0.03, z: 0.9, r: 0.95 });
  for (let i = 0; i < 26; i++) b.cone(i % 2 ? 'leaf' : 'leafDark', -9.8 + (i * 1.37) % 8.6, 0.05, -1.0 + (i * 2.31) % 4, 0.06, 0.25, i, { sides: 5, sway: 0.2 });
  K.bench(b, BX, BZ, { ry: 0 });
  K.lamp(b, BX - 2.2, BZ + 1.2);
  K.roundTree(b, -7.6, -0.4, { s: 1.25 });
  K.bush(b, -9.4, 2.4, { flowers: true });
  K.bush(b, -1.2, -0.6, { s: 0.8 });
  K.flowerBed(b, -6.2, 2.9, 2.0, 0.8, {});
  b.slab('stone', -5.5, 0, -1.6, 9.4, 0.25, 0.3, { round: 0.06, taper: 0 });
  recycleBin(b, 2.6, 1.2);

  const homes = [null, bedsit, apartment, starter, family, mansion].map((fn, i) => {
    if (!fn) return null;
    const m = P.dynamic((d) => fn(d), { tier: -1 });
    m.visible = false;
    return m;
  });
  const van = P.dynamic((d) => {
    kit.vehicles.van(d, 0, 0, 0, 'van', {});
    for (let i = 0; i < 4; i++) K.crate(d, -2.2 - (i % 2) * 0.75, 0.2 + Math.floor(i / 2) * 0.0, { s: 0.75, ry: i * 0.4, y: Math.floor(i / 2) * 0.35, c: '#d9b48a', c2: '#c49a6c' });
  }, { tier: -1 });
  van.visible = false;
  const cans = P.instances((d) => { d.cyl('can', 0, 0, 0, 0.07, 0.2, 0, { sides: 9, taper: 1 }); d.cyl('red', 0, 0.06, 0, 0.072, 0.07, 0, { sides: 9, taper: 1 }); }, 10, { tier: -1, cast: false });
  const spots = [[-0.4, 3.0], [0.9, 2.2], [1.6, 3.5], [-1.6, 2.6], [0.2, 0.9], [-2.4, 3.6], [2.1, 2.6], [-0.9, 3.8], [1.2, 0.4], [-1.9, 0.6]];
  const gone = new Float32Array(10);
  P.pile({ at: [-1.6, 0.15, 1.8], geo: canGeo(), size: 1.8, max: 30, layout: 'heap', spacing: 1 });

  let lastCans = 0, lastTier = -1, vanT = 0, pop = 1, popId = 0;

  return P.done({
    w: 15, d: 7, h: 5,
    camera: { pos: [-3.4, 5.4, 10.4], look: [-0.6, 0.8, 0.4], fov: 30 },
    pileAnchor: [-1.6, 0.4, 1.8], pileR: 1.2,
    tapTargets: [{ id: 'bin', pos: [2.6, 0.6, 1.2], r: 1.3 }],
    exit: [[2, 2], [8, 3.6], [12, 6.5]],
    update(dt, stats, time, tier, ctx) {
      const st = stats?.state;
      const tierNow = st?.life?.homeTier ?? 0;
      const boot = st?.bootstrap || { cans: 0, done: true };
      if (tierNow !== lastTier) {
        if (lastTier >= 0 && tierNow > lastTier) { vanT = 9; pop = 0; }
        lastTier = tierNow;
        homes.forEach((m, i) => { if (m) m.visible = i === tierNow; });
        popId = tierNow;
      }
      const hm = homes[popId];
      if (hm && pop < 1) {
        pop = Math.min(1, pop + dt * 1.8);
        const e = 1 - Math.pow(1 - pop, 3), k = 0.5 + e * 0.5 + Math.sin(pop * Math.PI) * 0.1;
        hm.scale.set(1 + (1 - k) * 0.2, k, 1 + (1 - k) * 0.2);
      }
      vanT = Math.max(0, vanT - dt);
      van.visible = vanT > 0;
      if (van.visible) {
        const inT = Math.min(1, (9 - vanT) / 1.5), outT = Math.max(0, 1 - vanT / 1.5);
        van.position.set(16 - inT * 9 + outT * 12, 0, 3.0);
      }
      if (boot.cans > lastCans) for (let k = 0; k < boot.cans - lastCans; k++) {
        let best = -1;
        for (let i = 0; i < 10; i++) if (gone[i] <= 0 && (best < 0 || Math.random() < 0.3)) best = i;
        if (best >= 0) gone[best] = 2.5 + Math.random() * 2;
      }
      lastCans = boot.cans;
      for (let i = 0; i < 10; i++) {
        gone[i] -= dt;
        if (boot.done || gone[i] > 0) cans.hide(i);
        else cans.place(i, spots[i][0], i % 3 ? 0.14 : 0.03, spots[i][1], i * 1.3, 1.8, i % 3 ? Math.PI / 2 : 0, 0);
      }
      cans.commit();
    },
  });

  function lawn(w, d) {
    const m = new S.Mesh(), n = 11, c = [1, 1, 1];
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push([Math.cos(a) * w / 2 * (0.92 + 0.08 * Math.sin(i * 2.1)), 0, Math.sin(a) * d / 2 * (0.9 + 0.1 * Math.cos(i * 1.7))]);
    }
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      m.tri([0, 0.06, 0], q, p, c);
      m.quad(p, q, [q[0] * 1.03, -0.05, q[2] * 1.03], [p[0] * 1.03, -0.05, p[2] * 1.03], S.shade(c, -0.2));
    }
    return m.geo();
  }
  function canGeo() {
    const g = kit.builder(P.pal);
    g.cyl('can', 0, 0, 0, 0.07, 0.2, 0, { sides: 9, taper: 1, rz: Math.PI / 2 });
    g.cyl(['red', 'blue', 'green', 'yellow'][Math.floor(Math.random() * 4)], 0.06, 0, 0, 0.072, 0.07, 0, { sides: 9, taper: 1, rz: Math.PI / 2 });
    return g.geometry();
  }
  function recycleBin(B, x, z) {
    B.slab('bin', x, 0, z, 1.0, 1.0, 0.75, { round: 0.14, taper: 0.06 });
    B.slab('iron', x, 0.98, z, 1.06, 0.1, 0.8, { round: 0.04 });
    B.slab('white', x, 0.3, z + 0.385, 0.42, 0.42, 0.03, { round: 0.1 });
    for (let i = 0; i < 3; i++) { const a = i / 3 * 6.28; B.slab('bin', x + Math.cos(a) * 0.11, 0.45 + Math.sin(a) * 0.11, z + 0.41, 0.12, 0.05, 0.02, { round: 0.01, rz: a + 1.6 }); }
  }
  // Homes sit back-right of the park, fronting the cobbles.
  function bedsit(d) {
    K.house(d, 6.2, -3.6, { w: 5.2, d: 4.6, floors: 2, wall: '#d6e6f2', roof: '#6f9fc9', shop: { awning: 'blue', sign: 'white' }, chimneys: 1, sides: 'left' });
    for (let i = 0; i < 3; i++) d.disc({ c: '#cfe3ee', r: 0.1, m: 0.3 }, 5.0 + i * 0.75, 0.95, -1.18, 0.25, 0.04, { rx: Math.PI / 2 });
    d.slab({ c: '#ffe2a0', r: 0.3, g: 0.9 }, 6.2 - 1.2, 3.25, -1.23, 0.5, 0.5, 0.03, { round: 0.02 });
  }
  function apartment(d) {
    K.house(d, 6.4, -3.6, { w: 6.4, d: 5, floors: 3, fh: 2.5, wall: '#f6d6c4', roof: '#d9786a', ridgeX: true, chimneys: 2, boxes: true, sides: 'left' });
    for (let f = 1; f < 3; f++) {
      d.slab('white', 6.4, 0.3 + f * 2.5, -0.85, 3.0, 0.12, 0.8, { round: 0.04 });
      for (let i = 0; i < 7; i++) d.cyl('iron', 4.95 + i * 0.48, 0.42 + f * 2.5, -0.5, 0.025, 0.7, 0, { sides: 5 });
      d.slab('iron', 6.4, 1.1 + f * 2.5, -0.5, 3.0, 0.05, 0.05, { round: 0.01 });
    }
    K.planter(d, 7.5, -0.7, { y: 2.92, s: 0.8, flowers: true });
  }
  function starter(d) {
    K.house(d, 6.4, -3.8, { w: 5.0, d: 4.6, floors: 1, fh: 2.6, wall: '#f8e8d2', roof: '#7fb5a8', chimneys: 1, shutters: '#7fb5a8', sides: 'left', pitch: 0.75 });
    K.picket(d, 3.2, -0.9, 9.6, -0.9, {});
    K.flowerBed(d, 4.4, -1.4, 1.8, 0.5, {});
    K.flowerBed(d, 8.4, -1.4, 1.8, 0.5, {});
    K.roundTree(d, 10.2, -4.4, { s: 0.9 });
  }
  function family(d) {
    K.house(d, 6.0, -4.0, { w: 6.8, d: 5.2, floors: 2, wall: '#f3e0b5', roof: '#c56f8e', chimneys: 2, shutters: '#c56f8e', boxes: true, sides: 'left', dormer: true });
    K.picket(d, 2.2, -0.9, 10.4, -0.9, {});
    K.roundTree(d, 10.6, -3.4, { s: 1.4 });
    d.slab('wood', 10.6, 3.0, -3.4, 1.4, 1.0, 1.2, { round: 0.06 });
    d.add(K.roofGeo(1.4, 1.2, 0.6, { col: S.rgb('#e3a066'), over: 0.12 }), null, { x: 10.6, y: 4.0, z: -3.4 });
    for (const sx of [-1, 1]) d.cyl('wood2', 1.6 + sx * 0.8, 0, -2.6, 0.06, 2.2, 0, { sides: 5, rz: sx * 0.15 });
    d.slab('wood2', 1.6, 2.1, -2.6, 1.9, 0.1, 0.1, { round: 0.03 });
    d.slab('red', 1.6, 0.5, -2.6, 0.6, 0.06, 0.25, { round: 0.02 });
  }
  function mansion(d) {
    K.house(d, 5.6, -4.6, { w: 9.0, d: 6.0, floors: 3, fh: 2.6, wall: '#fbf1dc', roof: '#6f9fc9', ridgeX: true, chimneys: 2, shutters: '#6f9fc9', boxes: true, sides: 'left' });
    for (const sx of [-1, 1]) {
      d.cyl('white', 5.6 + sx * 1.6, 0.3, -1.3, 0.22, 4.9, 0, { sides: 9, taper: 0.85 });
      d.cyl('stone', 2.2 + sx * 0 + (sx > 0 ? 7.6 : 0), 0, -0.6, 0.35, 1.6, 0, { sides: 7, taper: 0.9 });
      d.ball('gold', 2.2 + (sx > 0 ? 7.6 : 0), 1.75, -0.6, 0.2, { detail: 1 });
      d.ball('leafDark', 3.0 + (sx > 0 ? 5.2 : 0), 0.9, -0.9, 0.5, { sy: 1.5, detail: 1 });
    }
    d.slab('white', 5.6, 5.2, -1.3, 3.6, 0.3, 0.8, { round: 0.06 });
    for (let i = 0; i < 9; i++) d.cyl('iron', 2.2 + i * 0.95, 0, -0.6, 0.03, 1.2, 0, { sides: 5 });
    d.cyl('stone', 5.6, 0, 1.0, 1.1, 0.35, 0, { sides: 11, taper: 1 });
    d.cyl({ c: '#7cc6d6', r: 0.08 }, 5.6, 0.3, 1.0, 0.95, 0.05, 0, { sides: 11 });
    d.cyl('white', 5.6, 0.3, 1.0, 0.12, 0.9, 0, { sides: 7, taper: 0.6 });
    d.ball({ c: '#bfe8f0', r: 0.1, g: 0.2 }, 5.6, 1.3, 1.0, 0.25, { sy: 1.4, detail: 1 });
  }
}
