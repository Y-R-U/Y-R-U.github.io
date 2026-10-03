// 🧽 Car Wash: a cream arched tunnel full of spinning blue brushes and pink/white foam. Dirty cars queue on the
// forecourt (the queue IS the stock), roll through and come out gleaming. L25 vacuum bays + flags · L100 twin tunnels + rainbow.
export default function buildPlot(kit, { line, palette, rng }) {
  const P = kit.plot({ id: 'carwash', line, palette, rng, seed: 61, colors: { accent: '#78a6d8', tunnel: '#f1e6d4', brush: '#4a8cf0', brush2: '#7ab4ff', foam: '#fdfbfa', foamP: '#f6a9c4', concrete: '#e3ddd6', glass: '#5f7d96' } });
  const { b, t1, t2, lot, props: K } = P;
  const S = kit.shape;
  const TZ = -1.6, TL = 5.4, TX = 0.2, TR = -0.8;
  const ca = Math.cos(TR), sa = Math.sin(TR);
  const L2W = (lx, lz) => [TX + lx * ca + lz * sa, TZ - lx * sa + lz * ca];
  const TM = S.matrix({ pos: [TX, 0, TZ], ry: TR });

  { const [ax, az] = L2W(-2.2, 0); b.slab('concrete', ax, -0.02, az, 20, 0.12, 5.4, { round: 0.06, taper: 0, ry: TR }); }
  for (let lx = -11; lx < 8; lx += 2.6) for (const lz of [-1.9, 1.9]) { const [mx, mz] = L2W(lx, lz); b.slab('white', mx, 0.07, mz, 1.4, 0.02, 0.1, { round: 0.01, taper: 0, noAo: true, ry: TR }); }
  tunnel(b, TL, false, TM);
  booth(b, 6.8, -4.6);
  K.bin(b, -3.6, -3.8, { c: 'accent' });
  K.roundTree(b, -9.0, -3.8, { s: 1.15 });
  K.roundTree(b, 9.4, 0.8, { s: 0.9 });
  K.bush(b, -9.6, 1.0, { s: 0.9 });
  b.cyl('iron', -3.4, 0, 0.6, 0.06, 2.4, 0, { sides: 5 });
  b.slab('accent', -3.4, 2.05, 0.6, 0.9, 0.5, 0.08, { round: 0.06 });

  for (const x of [5.3, 7.9]) { t1.cyl('iron', x, 0, -1.6, 0.12, 1.3, 0, { sides: 7 }); t1.slab('yellow', x, 1.3, -1.6, 0.4, 0.5, 0.3, { round: 0.08 }); t1.cyl('dark', x + 0.2, 0.9, -1.4, 0.04, 0.9, 0, { sides: 5, rz: 1.2 }); }
  for (let i = 0; i < 6; i++) t1.ball(['red', 'yellow', 'accent', 'green'][i % 4], -9.5 + i * 3.6, 3.2, -4.3, 0.12, { detail: 0 });
  K.bunting(t1, [-9.5, 3.0, -4.3], [9.5, 3.0, -4.3], { sag: 0.5 });
  for (const x of [-9.5, 9.5]) t1.cyl('white', x, 0, -4.3, 0.05, 3.1, 0, { sides: 5 });

  { const [ux, uz] = L2W(-1.0, -5.6); tunnel(t2, TL, true, S.matrix({ pos: [ux, 0, uz], ry: TR })); }
  const rb = ['#e8776a', '#f2b84b', '#f6d35c', '#9bc66b', '#78a6d8', '#b59ad8'];
  { const [rx, rz] = L2W(TL / 2 + 1.4, 0); rb.forEach((c, i) => t2.add(arc(3.3 - i * 0.17, 0.17, 0.25), c, { x: rx, y: 0.05, z: rz, ry: TR + Math.PI / 2, r: 0.5, g: 0.15 })); }

  K.signPost(lot, 0, 0.8, { c: 'white' });
  K.crate(lot, 1.2, 0.2, {});

  const carGeo = (d) => kit.vehicles.car(d, 0, 0, 0, 'white', {});
  const cars = P.instances(carGeo, 5, { tier: -1, radius: 16 });
  const mud = P.instances((d) => { for (let i = 0; i < 9; i++) d.ball('#7a5d48', (i * 0.27) % 2 - 1, 0.3 + (i % 3) * 0.17, (i % 2 ? -1 : 1) * 0.66, 0.1 + (i % 3) * 0.04, { sz: 0.25, detail: 0, r: 0.9 }); d.ball('#7a5d48', 0.4, 1.2, 0, 0.18, { sy: 0.2, detail: 0 }); }, 5, { tier: -1, radius: 16, cast: false });
  const tints = ['#ff8636', '#a08672', '#8e8a9a', '#9c8a70', '#f6d35c'];
  tints.forEach((c, i) => cars.tint(i, c));
  const brushes = P.instances((d) => brushGeo(d), 5, { tier: 0, cast: false });
  const NF = 24;
  const foam = P.instances((d) => d.ball('white', 0, 0, 0, 0.5, { detail: 2, smooth: true, r: 0.5, g: 0.12 }), NF, { tier: 0, cast: false });
  for (let i = 0; i < NF; i++) foam.tint(i, i % 3 ? '#fffafc' : '#ffb3cf');
  const carShadows = P.blobs(5);

  const staff = P.crowd({ count: 2, seed: 12 });
  staff.look(0, { top: '#f2b84b', acc: 0, style: 4, hair: 1, skin: 3, bot: '#3f6b74' });
  staff.look(1, { top: '#f2b84b', acc: 0, style: 0, hair: 0, skin: 1, bot: '#3f6b74' });
  const slots = [[-6.0, 0.4, 0.3], [-8.4, -1.7, 0.45], [-6.6, -3.9, 0.2]];
  const lane = { u: 0 };

  return P.done({
    w: 15, cardW: 12.5, d: 7, h: 4.5,
    camera: { pos: [7.0, 7.0, 10.2], look: [1.3, 1.9, -0.8], fov: 30 },
    pileAnchor: [-7.0, 0.6, -1.7], pileR: 2.6,
    exit: [[6, TZ], [8, 2.5], [12, 6.5]],
    update(dt, stats, time, tier, ctx) {
      const owned = ctx.owned;
      const cyc = Math.max(3, Math.min(9, (stats?.cycleSec ?? 4) * 2));
      lane.u = owned ? (lane.u + dt / cyc) % 1 : 0;
      const u = lane.u;
      const lx = u < 0.7 ? -3.6 + (u / 0.7) * 8.2 : 4.6, dirty = lx < 0.4;
      if (!owned) { cars.hide(0); mud.hide(0); }
      else {
        const [wx, wz] = L2W(lx, 0);
        cars.place(0, wx, 0, wz, TR);
        if (dirty) mud.place(0, wx, 0, wz, TR); else mud.hide(0);
      }
      const n = owned ? Math.round((stats?.stockRatio ?? 0.4) * 3) : 0;
      for (let i = 0; i < 3; i++) {
        const [sx, sz, h] = slots[i];
        if (i < n) { cars.place(1 + i, sx, 0, sz, h); mud.place(1 + i, sx, 0, sz, h); }
        else { cars.hide(1 + i); mud.hide(1 + i); }
      }
      if (owned && ctx.vt >= 1) { cars.place(4, 6.6, 0, -1.6, Math.PI / 2 + 0.1); carShadows.place(4, 6.6, -1.6, 2.5, 1.25, Math.PI / 2 + 0.1); } else { cars.hide(4); carShadows.hide(4); }
      mud.hide(4);
      if (owned) { const [wx, wz] = L2W(lx, 0); carShadows.place(0, wx, wz, 2.5, 1.25, TR); } else carShadows.hide(0);
      for (let i = 0; i < 3; i++) { if (i < n) carShadows.place(1 + i, slots[i][0], slots[i][1], 2.5, 1.25, slots[i][2]); else carShadows.hide(1 + i); }
      carShadows.commit();
      cars.commit(); mud.commit();
      const spin = owned ? time * 6 : 0;
      {
        const bp = [[-1.6, -1.3], [0.2, -1.35], [-0.7, 1.3], [1.1, 1.3]];
        bp.forEach(([bx, bz], i) => { const [px, pz] = L2W(bx, bz); brushes.place(i, px, 0.05, pz, (i % 2 ? -1 : 1) * spin + i); });
        const [f, g] = L2W(-0.2, 0); brushes.place(4, f, 2.95, g, TR, [1, 1, 0.85], spin, Math.PI / 2);
      }
      brushes.commit();
      for (let i = 0; i < NF; i++) {
        if (!owned) { foam.hide(i); continue; }
        const a = i * 2.4, w = 0.85 + 0.18 * Math.sin(time * 2.1 + i);
        if (i < 14) {
          const fx = -TL / 2 + 0.6 + (i % 7) * 0.7, side = i % 2 ? 1 : -1;
          const [px, pz] = L2W(fx + Math.sin(time + a) * 0.1, side * (0.95 - (i % 3) * 0.25));
          foam.place(i, px, 0.45 + (i % 4) * 0.5 + Math.sin(time * 1.3 + a) * 0.06, pz, 0, w * (0.9 + (i % 3) * 0.25));
        } else {
          const k = i - 14, end = k % 2 ? 1 : -1, lz = ((k >> 1) - 2) * 0.75;
          const [px, pz] = L2W(end * (TL / 2 + 0.15) + Math.sin(time * 0.9 + a) * 0.08, lz);
          foam.place(i, px, 0.25 + (k % 3) * 0.3 + Math.abs(lz) * 0.35, pz, 0, w * (1.1 + (k % 3) * 0.2));
        }
      }
      foam.commit();

      staff.set(0, -4.4, 0.02, 1.4, -1.2, owned ? 7 : 0, 0, 3);
      if (owned && (stats?.sigmaUpgrades ?? 0) >= 1) staff.set(1, 4.5, 0.02, 0.65, -0.8, 3, 1, 4); else staff.hide(1);
      if (!owned) staff.hide(0);
    },
  });

  function arc(r, t, depth) {
    const m = new S.Mesh(), col = [1, 1, 1], N = 13;
    const p = (a, rr, z) => [Math.cos(a) * rr, Math.sin(a) * rr, z];
    for (let i = 0; i < N; i++) {
      const a0 = Math.PI * i / N, a1 = Math.PI * (i + 1) / N;
      m.quad(p(a0, r, depth / 2), p(a0, r - t, depth / 2), p(a1, r - t, depth / 2), p(a1, r, depth / 2), col);
      m.quad(p(a1, r, depth / 2), p(a1, r, -depth / 2), p(a0, r, -depth / 2), p(a0, r, depth / 2), col);
    }
    return m.geo();
  }
  // A thick cream portal shell (rounded-square arch) extruded along the lane, bevelled rims at both mouths.
  function tunnel(B, L, plain, parent) {
    const col = S.rgb(P.pal.tunnel), inner = S.shade(col, -0.12), rimC = S.shade(col, 0.05);
    const N = 14, HW = 1.95, HH = 3.15, T = 0.42;
    const prof = (t, k) => {
      const a = Math.PI * t, c = Math.cos(a), s2 = Math.sin(a);
      const e = 0.32, px = Math.sign(c) * Math.pow(Math.abs(c), e), py = Math.pow(s2, e);
      return [px * (HW + k), py * (HH + k) - (1 - py) * 0.0];
    };
    const m0 = new S.Mesh();
    const m = { quad: (a, b2, c, d, cc) => { m0.quad(a, b2, c, d, cc); m0.quad(d, c, b2, a, cc); return m; } };
    const P3 = (x, p) => [x, Math.max(0, p[1]), p[0]];
    for (let i = 0; i < N; i++) {
      const t0 = i / N, t1 = (i + 1) / N;
      const o0 = prof(t0, T), o1 = prof(t1, T), n0 = prof(t0, 0), n1 = prof(t1, 0);
      const r0 = prof(t0, T + 0.1), r1 = prof(t1, T + 0.1), q0 = prof(t0, -0.1), q1 = prof(t1, -0.1);
      const X = L / 2, R = 0.32;
      m.quad(P3(-X + R, o0), P3(-X + R, o1), P3(X - R, o1), P3(X - R, o0), col);
      m.quad(P3(X - R, n0), P3(X - R, n1), P3(-X + R, n1), P3(-X + R, n0), inner);
      for (const sx of [-1, 1]) {
        const xa = sx * X, xb = sx * (X - R);
        const f = sx > 0 ? (a, b2, c, d) => m.quad(a, b2, c, d, rimC) : (a, b2, c, d) => m.quad(d, c, b2, a, rimC);
        f(P3(xa, r0), P3(xa, r1), P3(xa, q1), P3(xa, q0));
        f(P3(xb, o1), P3(xb, o0), P3(xa, r0), P3(xa, r1));
        f(P3(xa, q1), P3(xa, q0), P3(xb, n0), P3(xb, n1));
        m.quad(...(sx > 0 ? [P3(xb, o0), P3(xb, o1), P3(xa, r1), P3(xa, r0)] : [P3(xa, r0), P3(xa, r1), P3(xb, o1), P3(xb, o0)]), col);
        m.quad(...(sx > 0 ? [P3(xa, q0), P3(xa, q1), P3(xb, n1), P3(xb, n0)] : [P3(xb, n0), P3(xb, n1), P3(xa, q1), P3(xa, q0)]), inner);
      }
    }
    B.add(m0.geo(), null, { r: 0.5, parent });
    B.contact(0, 0, L + 0.4, 2 * HW + 2 * T + 0.3, { parent, k: 0.9 });
    for (const sd of [-1, 1]) B.slab('accent', 0, 0, sd * (HW + T + 0.02), L - 0.3, 0.32, 0.12, { round: 0.05, taper: 0, parent });
    B.slab('accent', 0, HH + T - 0.05, 0, L - 0.4, 0.14, 1.3, { round: 0.05, taper: 0, parent });
    if (!plain) {
      B.slab('cream', 0.9, HH + T + 0.05, 0.9, 2.8, 0.75, 0.3, { round: 0.16, parent });
      B.slab('accent', 0.9, HH + T + 0.05, 0.84, 3.0, 0.85, 0.16, { round: 0.18, parent });
      B.ball('brush', 0.1, HH + T + 0.44, 1.08, 0.22, { detail: 1, parent });
      B.ball('foamP', 0.65, HH + T + 0.5, 1.08, 0.2, { detail: 1, parent });
      B.ball('white', 1.2, HH + T + 0.46, 1.08, 0.22, { detail: 1, parent });
      B.ball('white', 1.65, HH + T + 0.4, 1.08, 0.16, { detail: 1, parent });
      foamCloud(B, 0, HH - 0.45, 0, L - 0.8, parent);
      for (const sd of [-1, 1]) for (const xx of [-L / 2 - 0.6]) {
        B.cyl('chrome', xx, 0, sd * 1.5, 0.07, 2.6, 0, { sides: 7, parent });
        B.cyl('accent', xx, 2.55, sd * 1.5, 0.14, 0.2, 0, { sides: 9, parent });
      }
      B.slab('chrome', -L / 2 - 0.6, 2.5, 0, 0.12, 0.12, 3.0, { round: 0.04, parent });
    }
  }
  function foamCloud(B, x, y, z, len, parent) {
    const n = Math.round(len / 0.6);
    for (let i = 0; i < n; i++) {
      const fx = x - len / 2 + (i + 0.5) * len / n;
      for (const sd of [-1, 0, 1]) {
        const r = 0.55 + B.rnd() * 0.25 + (sd === 0 ? 0.1 : 0);
        B.ball(B.rnd() < 0.3 ? 'foamP' : 'foam', fx + (B.rnd() - 0.5) * 0.25, y + (sd === 0 ? 0.2 : -0.1 - B.rnd() * 0.3), z + sd * 1.2, r, { detail: 1, smooth: true, r: 0.55, g: 0.06, parent });
      }
    }
  }
  function brushGeo(d, h = 2.4, col = 'brush') {
    d.cyl('chrome', 0, 0, 0, 0.07, h + 0.25, 0, { sides: 7 });
    const discs = Math.round(h / 0.26);
    for (let k = 0; k < discs; k++) {
      const m = new S.Mesh(), c = S.rgb(P.pal[k % 2 ? 'brush' : 'brush2']), cs = S.shade(c, -0.2), y0 = 0.12 + k * (h / discs), y1 = y0 + h / discs - 0.05;
      const Np = 13, r1 = 0.58, r2 = 0.36;
      const pt = (j, y) => { const a = (j / (Np * 2)) * Math.PI * 2 + k * 0.4, r = j % 2 ? r2 : r1; return [Math.cos(a) * r, y, Math.sin(a) * r]; };
      for (let j = 0; j < Np * 2; j++) {
        const a0 = pt(j, y0), a1 = pt(j + 1, y0), b0 = pt(j, y1), b1 = pt(j + 1, y1);
        m.quad(a0, b0, b1, a1, j % 2 ? cs : c);
        m.tri([0, y1, 0], b1, b0, S.shade(c, 0.1));
      }
      d.add(m.geo(), null, { r: 0.85 });
    }
  }
  function booth(B, x, z) {
    B.slab('cream', x, 0, z, 2.2, 2.3, 1.9, { round: 0.1 });
    B.add(K.roofGeo(2.2, 1.9, 0.75, { col: S.rgb('#e08f7a'), over: 0.25 }), null, { x, y: 2.3, z, ry: Math.PI / 2 });
    K.windowUnit(B, x - 0.45, 0.9, z + 0.97, { w: 0.8, h: 0.9 });
    K.door(B, x + 0.55, 0.0, z + 0.97, {});
  }
}
