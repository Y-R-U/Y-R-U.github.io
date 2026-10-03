// 💈 Barber: an open-fronted mint shop on the cobbles — chairs facing gilt mirrors, a spinning pole, a waiting bench
// that fills with stock. L1 one chair → L25 three chairs + neon pole → L100 chandelier, red carpet, velvet ropes.
export default function buildPlot(kit, { line, palette, rng }) {
  const P = kit.plot({ id: 'barber', line, palette, rng, seed: 37, colors: { flowerY: '#f6d35c', accent: '#e2655a', shop: '#a8d8b9', shopRoof: '#3f8f84', leather: { c: '#d9574f', r: 0.35 }, floorA: '#f6f1e8', floorB: '#7d7394' } });
  const { b, t1, t2, lot, props: K } = P;
  const S = kit.shape;
  const X0 = -4.6, X1 = 2.6, Z0 = -3.5, Z1 = 0.5, H = 3.6;
  const W = X1 - X0, D = Z1 - Z0, CX = (X0 + X1) / 2, CZ = (Z0 + Z1) / 2;

  const SH = K.shop(b, CX, CZ, { w: W, d: D, fh: H + 0.3, floors: 2, uh: 2.4, wall: 'shop', inner: '#f4efe0', trim: 'trim', roof: 'shopRoof', sign: '#3d3a4a', floor: 'floorA', open: W - 1.5, shutters: '#4f8f86', boxes: true, chimneys: 1, dormer: true });
  checker(b, CX, CZ + 0.15, W - 0.9, D - 0.9, 0.34);
  for (let i = 0; i < 7; i++) b.slab(i % 2 ? 'white' : 'accent', CX - 1.2 + i * 0.4, SH.oh + 0.32, Z1 + 0.14, 0.3, 0.3, 0.04, { round: 0.02, rz: 0.785, noAo: true });
  for (let i = 0; i < 5; i++) b.ball(i % 2 ? 'pink' : 'flowerY', X0 + 1.1 + i * 1.25, H + 0.75, Z1 + 0.2, 0.15, { detail: 0 });
  b.slab('pot', CX, H + 0.45, Z1 + 0.2, W - 1.0, 0.24, 0.32, { round: 0.06 });
  for (let i = 0; i < 9; i++) b.ball(i % 3 ? 'leaf' : 'leafDark', X0 + 0.8 + i * 0.7, H + 0.72, Z1 + 0.18, 0.13, { detail: 0, sy: 0.8 });
  for (let i = 0; i < 13; i++) b.slab({ c: i % 2 ? '#f4efe0' : '#cfe6d6', r: 0.8, g: 0.22 }, X0 + 0.55 + i * (W - 1.1) / 12, 1.3, Z0 + 0.4, (W - 1.1) / 12 + 0.02, H - 1.15, 0.03, { round: 0, taper: 0, noAo: true });
  b.slab('wood2', CX, 0.34, Z0 + 0.4, W - 0.8, 0.95, 0.04, { round: 0.01, taper: 0, noAo: true });
  b.slab('trim', CX, 1.27, Z0 + 0.42, W - 0.8, 0.07, 0.08, { round: 0.02, taper: 0 });
  const mirrors = [-0.7, -2.9, 1.5];
  chair(b, mirrors[0]);
  mirror(b, mirrors[0]);
  b.slab('wood', CX, 0.33, Z0 + 0.66, W - 1.0, 0.72, 0.42, { round: 0.05 });
  for (let i = 0; i < 6; i++) b.cyl(['blue', 'pink', 'teal', 'yellow'][i % 4], X0 + 1.2 + i * 0.95, 1.05, Z0 + 0.66, 0.07, 0.26, 0, { sides: 7, taper: 0.7 });
  K.planter(b, X0 + 0.75, -0.7, { s: 0.9, y: 0.33 });
  b.slab('#e8b06a', X1 - 1.0, 0.33, -0.9, 0.7, 0.55, 0.5, { round: 0.1 });
  for (let i = 0; i < 3; i++) b.slab(['pink', 'blue', 'yellow'][i], X1 - 1.0, 0.9 + i * 0.07, -0.9, 0.45, 0.06, 0.32, { round: 0.02, ry: i * 0.3 });
  b.cyl('bulb', mirrors[0], H - 0.6, -1.0, 0.16, 0.25, 0, { sides: 9, taper: 1.4, g: 1.1 });
  b.cyl('iron', mirrors[0], H - 0.35, -1.0, 0.02, 0.38, 0, { sides: 5 });
  K.bench(b, X1 + 2.7, 0.9, { wood: 'wood', ry: -0.55 });
  K.planter(b, X1 + 0.9, 1.6, { s: 1.0 });
  K.planter(b, X0 - 3.6, 0.4, { s: 0.9, flowers: true });
  K.flowerBed(b, X0 - 1.2, 1.9, 2.6, 0.9, { ry: 0.05 });
  K.planter(b, X0 + 0.4, 1.5, { s: 0.8, flowers: true });
  for (const sg of [-1, 1]) b.slab('wood2', CX + 0.9, 0, 2.3 + sg * 0.16, 0.7, 1.05, 0.05, { ry: -0.3, rx: sg * 0.16, round: 0.02 });
  b.slab('#3d3a4a', CX + 0.98, 0.3, 2.53, 0.56, 0.58, 0.02, { ry: -0.3, rx: 0.16, round: 0.02 });
  for (const sg of [-1, 1]) b.slab('white', CX + 0.98, 0.58, 2.6, 0.36, 0.05, 0.02, { ry: -0.3, rz: sg * 0.5, rx: 0.16, round: 0.01, noAo: true });
  b.contact(CX + 0.9, 2.3, 0.8, 0.5, { ry: -0.3, k: 0.7 });
  K.lamp(b, 6.6, -1.2);
  K.roundTree(b, 6.0, -3.6, { s: 1.0 });

  for (const x of mirrors.slice(1)) { chair(t1, x); mirror(t1, x); t1.cyl('bulb', x, H - 0.6, -1.0, 0.16, 0.25, 0, { sides: 9, taper: 1.4, g: 1.1 }); t1.cyl('iron', x, H - 0.35, -1.0, 0.02, 0.38, 0, { sides: 5 }); }
  t1.cyl({ c: '#ff7a8a', r: 0.3, g: 1.5 }, X1 + 0.75, 2.2, Z1 + 0.25, 0.09, 0.9, 0, { sides: 9, taper: 1 });
  t1.cyl({ c: '#8fd0ff', r: 0.3, g: 1.5 }, X1 + 0.75, 2.2, Z1 + 0.25, 0.13, 0.05, 0, { sides: 9 });

  t2.cyl('gold', CX, H - 0.15, -1.9, 0.03, 0.3, 0, { sides: 5 });
  t2.cyl('gold', CX, H - 0.62, -1.9, 0.5, 0.18, 0, { sides: 9, taper: 0.6, m: 0.9, r: 0.25 });
  for (let i = 0; i < 7; i++) { const a = i / 7 * 6.28; t2.ball('bulb', CX + Math.cos(a) * 0.5, H - 0.68, -1.9 + Math.sin(a) * 0.5, 0.07, { detail: 0, g: 1.4 }); }
  t2.slab({ c: '#c94848', r: 0.9 }, X1 - 1.8, 0.0, 2.2, 1.3, 0.05, 3.2, { round: 0.02, taper: 0 });
  for (const [x, z] of [[X1 - 2.6, 1.2], [X1 - 2.6, 3.4], [X1 - 1.0, 1.2], [X1 - 1.0, 3.4]]) { t2.cyl('gold', x, 0, z, 0.06, 0.9, 0, { sides: 7, m: 0.9, r: 0.25 }); t2.ball('gold', x, 0.95, z, 0.09, { detail: 0, m: 0.9, r: 0.25 }); }
  K.planter(t2, X1 - 0.4, Z1 + 0.2, { s: 1.4, pot: 'gold' });

  K.crate(lot, CX, 0.6, { ry: 0.3 });
  K.signPost(lot, CX + 1.5, 1.6, { c: 'white' });
  lot.slab('#d6cbbf', CX, 0, CZ - 0.8, W, 2.2, 0.2, { round: 0.05 });
  lot.contact(CX, CZ - 0.8, W, 0.5, { k: 0.7 });

  const pole = P.dynamic((d) => {
    d.cyl('white', 0, 0, 0, 0.13, 1.25, 0, { sides: 11, taper: 1 });
    for (let st = 0; st < 4; st++) {
      const m = new S.Mesh(), col = S.rgb(st % 2 ? P.pal.accent : P.pal.blue), N = 16, r = 0.138, dy = 0.13;
      for (let k = 0; k < N; k++) {
        const a0 = st * Math.PI / 2 + (k / N) * 7, a1 = st * Math.PI / 2 + ((k + 1) / N) * 7, y0 = 0.05 + (k / N) * 1.0, y1 = 0.05 + ((k + 1) / N) * 1.0;
        const p = (a, y) => [Math.cos(a) * r, y, Math.sin(a) * r];
        m.quad(p(a0, y0), p(a0, y0 + dy), p(a1, y1 + dy), p(a1, y1), col);
      }
      d.add(m.geo(), null, { r: 0.3, noAo: true });
    }
    d.ball('gold', 0, 1.3, 0, 0.14, { detail: 1, m: 0.8, r: 0.3 });
    d.ball('gold', 0, -0.04, 0, 0.12, { detail: 1, m: 0.8, r: 0.3 });
  }, { tier: 0 });
  pole.position.set(X1 + 0.4, 1.2, Z1 + 0.15);
  const towels = P.dynamic((d) => { for (let i = 0; i < 4; i++) d.cyl('white', 0, 0.12 * Math.floor(i / 2), (i % 2) * 0.2, 0.09, 0.32, 0, { sides: 7, rz: Math.PI / 2 }); }, { tier: 0 });
  towels.position.set(CX + 1.1, 1.01, Z0 + 0.48);
  const clip = P.instances((d) => d.slab('#4a3a3a', 0, 0, 0, 0.06, 0.012, 0.03, { round: 0.004 }), 10, { cast: false });
  for (let i = 0; i < 10; i++) clip.place(i, mirrors[0] + (Math.sin(i * 7.1) * 0.5), 0.34, -0.3 + Math.cos(i * 3.3) * 0.45, i);
  clip.commit();

  const staff = P.crowd({ count: 6, seed: 6 });
  staff.look(0, { top: '#fbf6ee', acc: 0, style: 0, hair: 4, skin: 2 });
  staff.look(1, { top: '#fbf6ee', acc: 0, style: 2, hair: 0, skin: 0 });
  staff.look(2, { top: '#fbf6ee', acc: 0, style: 3, hair: 5, skin: 3 });
  for (let i = 3; i < 6; i++) staff.look(i, { top: ['#7d9ad6', '#f2b84b', '#9bc66b'][i - 3], style: 1, hair: [2, 0, 6][i - 3] });
  const wait = P.crowd({ count: 4, seed: 15 });
  wait.look(0, { top: '#6f8fd8', hair: 4, style: 4, skin: 3 }).look(1, { top: '#f2b84b', hair: 3, style: 5, skin: 0 }).look(2, { top: '#7fbf5a', hair: 8, style: 0, skin: 4 });
  const walkers = P.crowd({ count: 3, seed: 31 });
  P.walkers(walkers, { ids: [0, 1, 2], paths: [[[-12, 3.7], [12, 3.7]], [[12, 3.2], [-12, 3.2]]], loop: 'wrap', ownedOnly: false });
  let cut = 0;

  return P.done({
    w: 12.5, cardW: 10, d: 6, h: 4.5,
    camera: { pos: [-5.7, 6.7, 10.25], look: [-1.6, 1.4, -0.9], fov: 30 },
    pileAnchor: [X1 + 2.7, 0.5, 0.9], pileR: 1.4,
    exit: [[X1, 1.0], [6, 3.6], [12, 6.5]],
    update(dt, stats, time, tier, ctx) {
      const owned = ctx.owned;
      pole.visible = owned;
      pole.rotation.y = time * 1.6;
      towels.visible = owned && (stats?.boosts ?? 0) >= 1;
      const chairs = owned ? (ctx.vt >= 1 ? 3 : 1) : 0;
      const active = Math.min(chairs, 1 + (stats?.sigmaUpgrades ?? 0));
      cut += dt / Math.max(1.5, Math.min(4, stats?.cycleSec ?? 3));
      if (cut > 1) cut -= 1;
      for (let i = 0; i < 3; i++) {
        if (i < active) {
          staff.set(i, mirrors[i] - 0.72, 0.33, -1.05, 1.15 + Math.sin(time * 0.7 + i) * 0.25, 3, i * 1.7, 6.5);
          staff.look(3 + i, { style: cut < 0.6 ? 1 : 0 });
          staff.set(3 + i, mirrors[i], 0.79, -0.85, 0, 5, i, 1.5);
        } else { staff.hide(i); staff.hide(3 + i); }
      }
      const n = owned ? Math.round((stats?.stockRatio ?? 0.4) * 3) : 0;
      for (let i = 0; i < 4; i++) {
        if (i < n) wait.set(i, X1 + 2.7 + (i - 1) * 0.62 * 0.853, 0.12, 0.9 - 0.15 * 0.524 - (i - 1) * 0.62 * -0.524, -0.55, 5, i, 1.2); else wait.hide(i);
      }
    },
  });

  function checker(B, cx, cz, w, d, y) {
    const m = new S.Mesh(), a = S.rgb(P.pal.floorA), c = S.rgb(P.pal.floorB), t = 0.55;
    for (let i = 0; i * t < w; i++) for (let j = 0; j * t < d; j++) {
      const x0 = cx - w / 2 + i * t, z0 = cz - d / 2 + j * t, x1 = Math.min(cx + w / 2, x0 + t), z1 = Math.min(cz + d / 2, z0 + t);
      m.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], (i + j) % 2 ? a : c);
    }
    B.add(m.geo(), null, { r: 0.55, noAo: true });
  }
  function shed(w, d, rise, col) {
    const m = new S.Mesh(), u = S.shade(col, -0.3), e = S.shade(col, 0.1), t = 0.16;
    const A = [-w / 2, 0, d / 2], B2 = [w / 2, 0, d / 2], C = [w / 2, rise, -d / 2], D2 = [-w / 2, rise, -d / 2];
    const dn = (p) => [p[0], p[1] - t, p[2]];
    m.quad(A, B2, C, D2, col).quad(dn(D2), dn(C), dn(B2), dn(A), u);
    m.quad(dn(A), dn(B2), B2, A, e).quad(dn(B2), dn(C), C, B2, e).quad(dn(D2), dn(A), A, D2, e).quad(dn(C), dn(D2), D2, C, e);
    return m.geo();
  }
  function chair(B, x) {
    const z = -0.85;
    B.cyl('chrome', x, 0.33, z, 0.32, 0.06, 0, { sides: 11 });
    B.cyl('chrome', x, 0.37, z, 0.08, 0.32, 0, { sides: 7 });
    B.slab('leather', x, 0.67, z, 0.62, 0.2, 0.6, { round: 0.08 });
    B.slab('leather', x, 0.79, z - 0.3, 0.62, 0.82, 0.14, { round: 0.07, rx: -0.12 });
    B.slab('leather', x, 1.57, z - 0.38, 0.32, 0.2, 0.12, { round: 0.05 });
    for (const s of [-1, 1]) B.slab('chrome', x + s * 0.34, 0.79, z, 0.06, 0.06, 0.5, { round: 0.02 });
    B.slab('chrome', x, 0.45, z + 0.38, 0.4, 0.05, 0.2, { round: 0.02 });
  }
  function mirror(B, x) {
    B.slab('gold', x, 1.25, Z0 + 0.27, 0.95, 1.25, 0.06, { round: 0.06, m: 0.9, r: 0.25 });
    B.slab({ c: '#d9eef4', r: 0.04, m: 0.7 }, x, 1.32, Z0 + 0.3, 0.8, 1.1, 0.04, { round: 0.04, noAo: true });
  }
  function bench(B, x, z) {
    K.bench(B, x, z, { wood: 'wood' });
  }
}
