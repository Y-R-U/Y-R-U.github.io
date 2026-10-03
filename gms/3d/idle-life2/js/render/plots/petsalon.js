// 🐩 Pet Salon: an open-fronted pink garage salon — a pup on the grooming table puffing up under the dryer, a bubbling tub,
// pets waiting in cute crates (the stock), cats watching from a cat tree. L25 boutique awning + bows · L100 paw-print pool.
export default function buildPlot(kit, { line, palette, rng }) {
  const P = kit.plot({ id: 'petsalon', line, palette, rng, seed: 71, colors: { accent: '#ef8fae', salon: '#f6c3d2', salonRoof: '#8682d4', tub: { c: '#f4f8fa', r: 0.25 }, bubble: { c: '#ffffff', r: 0.15, g: 0.2 } } });
  const { b, t1, t2, lot, props: K } = P;
  const S = kit.shape;
  const X0 = -6.0, X1 = 0.6, Z0 = -3.9, Z1 = -0.1, H = 3.3;
  const W = X1 - X0, D = Z1 - Z0, CX = (X0 + X1) / 2, CZ = (Z0 + Z1) / 2;

  K.paving(b, -1.0, 0.0, 15, 3.4, { colors: ['#f6e3e6', '#efd6dc', '#f8ecec', '#f3dfe8', '#f6e8dc'], tile: 0.9, y: 0 });
  const SH = K.shop(b, CX, CZ, { w: W, d: D, fh: H + 0.35, floors: 1, wall: 'salon', inner: '#fdf0f3', trim: 'white', roof: 'salonRoof', sign: 'white', floor: '#f7e6d6', open: W - 1.1, oh: H - 0.1, roof: false });
  const FY = SH.y;
  b.cyl({ c: '#b6e0d2', r: 0.9 }, -2.6, FY, -1.0, 1.25, 0.03, 0, { sides: 11, taper: 1 });
  for (let i = 0; i < 9; i++) b.slab({ c: i % 2 ? '#fdeef2' : '#f7cfdc', r: 0.8, g: 0.22 }, X0 + 0.6 + i * (W - 1.2) / 8, FY + 1.1, Z0 + 0.4, (W - 1.2) / 8 + 0.02, H - 0.95, 0.03, { round: 0, taper: 0, noAo: true });
  b.slab('#f2b6c8', CX, FY, Z0 + 0.4, W - 0.8, 1.1, 0.04, { round: 0.01, taper: 0, noAo: true });
  for (const y of [1.75, 2.35]) { b.slab('white', CX + 1.5, FY + y - 0.15, Z0 + 0.55, 1.6, 0.06, 0.3, { round: 0.02 }); for (let i = 0; i < 4; i++) b.cyl(['pink', 'teal', 'yellow', 'lilac'][(i + y * 3) % 4 | 0], CX + 0.95 + i * 0.36, FY + y - 0.09, Z0 + 0.55, 0.07, 0.22, 0, { sides: 7, taper: 0.8 }); }
  K.planter(b, X1 + 0.7, 0.6, { s: 1.0, flowers: true, pot: 'accent' });
  K.planter(b, X0 - 0.6, 0.5, { s: 0.9, flowers: true, pot: 'accent' });
  b.slab('accent', X0 + 0.95, FY, -1.1, 0.8, 0.45, 0.6, { round: 0.14 });
  b.slab('white', X0 + 0.95, FY + 0.42, -1.1, 0.7, 0.12, 0.5, { round: 0.06 });
  paw(b, CX, SH.oh + 0.42, Z1 + 0.2, 0.36);
  for (let i = 0; i < 7; i++) b.ball(i % 2 ? 'white' : 'accent', CX - 2.1 + i * 0.7, SH.oh + 0.75, Z1 + 0.16, 0.09, { detail: 0 });
  const RY = H + 0.45;
  b.slab('salon', CX, RY - 0.1, CZ, W - 0.2, 0.62, D - 0.2, { round: 0.1, taper: 0 });
  b.slab('white', CX, RY + 0.48, CZ, W + 0.26, 0.2, D + 0.26, { round: 0.08, taper: 0 });
  b.slab('salonRoof', CX, RY + 0.66, CZ - 0.2, W - 0.7, 0.22, D - 0.9, { round: 0.08 });
  b.slab('white', CX - 0.4, RY + 0.66, Z1 - 0.15, 2.0, 0.78, 0.16, { round: 0.2 });
  b.slab('salonRoof', CX - 0.4, RY + 0.6, Z1 - 0.24, 2.2, 0.92, 0.12, { round: 0.22 });
  paw(b, CX - 0.4, RY + 0.86, Z1 - 0.04, 0.42);
  for (const s of [-1, 1]) b.ball('accent', CX - 0.4 + s * 1.25, RY + 1.0, Z1 - 0.15, 0.16, { detail: 1, sz: 0.5 });
  b.slab('chrome', -3.6, FY, -1.2, 1.6, 0.06, 0.9, { round: 0.02 });
  b.cyl('chrome', -3.6, FY, -1.2, 0.08, 0.5, 0, { sides: 7 });
  b.slab({ c: '#9fd6c8', r: 0.4 }, -3.6, FY + 0.5, -1.2, 1.7, 0.12, 1.0, { round: 0.06 });
  b.cyl('chrome', -4.5, FY + 0.58, -0.8, 0.03, 1.1, 0, { sides: 5 });
  b.slab('chrome', -4.15, FY + 1.63, -0.8, 0.7, 0.04, 0.04, { round: 0.01 });
  b.cyl('#c9b6e8', -4.0, FY + 1.48, -0.7, 0.2, 0.3, 0, { sides: 9, taper: 1.3 });
  tub(b, -1.2, -1.75);
  for (let i = 0; i < 5; i++) b.ball('bulb', X0 + 1.2 + i * (W - 2.4) / 4, SH.oh - 0.25, -1.0, 0.11, { detail: 1, g: 1.3 });
  b.slab('wood', CX - 1.6, FY, Z0 + 0.66, 1.6, 0.9, 0.42, { round: 0.05 });
  for (let i = 0; i < 4; i++) b.cyl(['pink', 'blue', 'teal', 'yellow'][i], CX - 2.1 + i * 0.33, FY + 0.95, Z0 + 0.66, 0.07, 0.24, 0, { sides: 7, taper: 0.7 });
  for (let i = 0; i < 3; i++) b.ball(['#f6d35c', '#78a6d8', '#f2a6bd'][i], -5.0 + i * 0.35, FY + 0.12, -1.9 + (i % 2) * 0.3, 0.12, { detail: 1 });
  catTree(b, 4.6, -3.2);
  K.bench(b, 6.6, 0.8, { ry: -0.2 });
  K.roundTree(b, 8.6, -3.4, { s: 1.0 });
  K.picket(b, 2.4, -5.4, 9.4, -5.4);

  t1.awning('accent', 3.3, 2.5, -1.2, 3.6, 2.2, 0, { alt: 'white', drop: 0.35 });
  for (const [x, z] of [[1.6, -0.2], [5.0, -0.2], [1.6, -2.2], [5.0, -2.2]]) t1.cyl('white', x, 0, z, 0.06, 2.5, 0, { sides: 5 });
  for (let i = 0; i < 4; i++) t1.ball(['pink', 'blue', 'yellow', 'lilac'][i], X1 + 1.4 + (i % 2) * 0.2, 0.9 + i * 0.22, -0.4, 0.09, { sx: 1.9, sy: 0.7, detail: 0 });
  t1.cyl('white', X1 + 1.5, 0, -0.4, 0.05, 1.8, 0, { sides: 5 });
  K.planter(t1, 3.0, 1.6, { s: 1.1, flowers: true, pot: 'lilac' });

  {
    const px = 4.2, pz = 0.9;
    t2.cyl('stone', px, 0, pz, 1.3, 0.3, 0, { sides: 11, taper: 1 });
    t2.cyl({ c: '#7cc6d6', r: 0.08 }, px, 0.27, pz, 1.15, 0.05, 0, { sides: 11, taper: 1 });
    for (const [dx, dz] of [[-0.55, -0.8], [0, -1.0], [0.55, -0.8], [0.9, -0.25]]) {
      t2.cyl('stone', px + dx * 1.35, 0, pz + dz * 1.35, 0.42, 0.3, 0, { sides: 9, taper: 1 });
      t2.cyl({ c: '#7cc6d6', r: 0.08 }, px + dx * 1.35, 0.27, pz + dz * 1.35, 0.33, 0.05, 0, { sides: 9, taper: 1 });
    }
    t2.cyl('white', px, 0.3, pz, 0.12, 0.8, 0, { sides: 7, taper: 0.6 });
    t2.ball({ c: '#bfe8f0', r: 0.1, g: 0.2 }, px, 1.15, pz, 0.22, { sy: 1.6, detail: 1 });
  }

  K.signPost(lot, CX, 1.0, { c: 'white' });
  K.crate(lot, CX + 1.2, 0.4, {});

  const crateUnit = kit.builder(P.pal);
  crateUnit.slab('#c9e3f0', 0, 0, 0, 1.0, 0.75, 0.75, { round: 0.18, taper: 0.06 });
  crateUnit.slab('white', 0, 0.74, 0, 1.04, 0.12, 0.78, { round: 0.06 });
  for (let i = 0; i < 4; i++) crateUnit.slab('iron', -0.24 + i * 0.16, 0.12, 0.38, 0.04, 0.5, 0.03, { round: 0.01 });
  K.dog(crateUnit, 0, 0.05, { s: 0.6, c: '#e9d3b4' });
  crateUnit.slab('#f2a6bd', 0, 0.86, 0, 0.3, 0.06, 0.12, { round: 0.03 });
  P.pile({ at: [2.4, 0, -1.4], geo: crateUnit.geometry(), size: 0.85, max: 5, layout: [[0, 0, 0, 0.2], [1.1, 0, 0.2, -0.15], [0.5, 0.72, 0.1, 0.05], [2.2, 0, 0.1, 0.3], [-0.2, 0, 1.2, -0.4]] });

  const dogs = P.instances((d) => K.dog(d, 0, 0, { c: '#ffffff', c2: '#f0d2c4' }), 3, { tier: -1, radius: 14 });
  dogs.tint(0, '#fdf6ee'); dogs.tint(1, '#e8b47e'); dogs.tint(2, '#f6e2c8');
  const bubbles = P.instances((d) => d.ball('bubble', 0, 0, 0, 0.1, { detail: 1, smooth: true }), 10, { cast: false });
  const cats = P.instances((d) => {
    d.ball('#f2b06a', 0, 0.18, 0, 0.2, { sx: 0.8, sz: 1.3, detail: 1, smooth: true });
    d.ball('#f2b06a', 0, 0.38, 0.2, 0.15, { detail: 1, smooth: true });
    for (const s of [-1, 1]) d.cone('#f2b06a', s * 0.08, 0.48, 0.2, 0.05, 0.1, 0, { sides: 5 });
    d.cyl('#f2b06a', 0, 0.12, -0.25, 0.03, 0.35, 0, { sides: 5, rx: -0.7 });
  }, 2, { tier: 0 });
  cats.tint(0, '#ffffff'); cats.tint(1, '#b8b3c8');

  const staff = P.crowd({ count: 2, seed: 19 });
  staff.look(0, { top: '#f2a6bd', acc: 0, style: 1, hair: 3, skin: 1 });
  staff.look(1, { top: '#b59ad8', acc: 0, style: 2, hair: 0, skin: 4 });
  const folk = P.crowd({ count: 3, seed: 27 });
  P.walkers(folk, { ids: [1, 2], paths: [[[-12, 3.5], [12, 3.5]], [[12, 3.0], [-12, 3.0]]], loop: 'wrap', ownedOnly: false });
  let groom = 0;

  return P.done({
    w: 13, cardW: 10.5, d: 6, h: 4,
    camera: { pos: [-6.0, 5.6, 10.6], look: [-1.8, 2.75, -1.2], fov: 30 },
    pileAnchor: [3.0, 0.6, -1.2], pileR: 1.8,
    exit: [[X1 + 1, 0.5], [6, 3.6], [12, 6.5]],
    update(dt, stats, time, tier, ctx) {
      const owned = ctx.owned;
      const cyc = Math.max(3, Math.min(8, (stats?.cycleSec ?? 3) * 2));
      groom = owned ? (groom + dt / cyc) % 1 : 0;
      const fluff = groom < 0.4 ? 0.85 : groom < 0.75 ? 0.85 + (groom - 0.4) / 0.35 * 0.55 : 1.4;
      if (owned) dogs.place(0, -3.6, 0.95, -1.2, Math.PI / 2 + Math.sin(time * 0.8) * 0.2, [fluff * 1.35, fluff * 1.3, fluff * 1.35]); else dogs.hide(0);
      if (owned) dogs.place(1, -1.2, 0.5, -1.75, -Math.PI / 2, 1.2); else dogs.hide(1);
      const leave = owned && groom > 0.75;
      const wx = leave ? X1 + 0.6 + (groom - 0.75) / 0.25 * 9 : 0;
      if (leave) { dogs.place(2, wx, 0, 2.5, Math.PI / 2, [1.2, 1.15, 1.2]); folk.set(0, wx + 0.8, 0.02, 2.9, Math.PI / 2, 1); }
      else { dogs.hide(2); folk.hide(0); }
      dogs.commit();
      for (let i = 0; i < 10; i++) {
        if (!owned) { bubbles.hide(i); continue; }
        const k = (time * 0.5 + i / 10) % 1;
        bubbles.place(i, -1.2 + Math.sin(i * 2.3 + time) * 0.4, 1.0 + k * 1.1, -1.75 + Math.cos(i * 1.7) * 0.3, 0, 0.6 + Math.sin(k * Math.PI) * 0.9);
      }
      bubbles.commit();
      cats.place(0, 4.6, 1.95, -3.2, 0.4 + Math.sin(time * 0.3) * 0.3, 1.1);
      cats.place(1, 4.95, 1.05, -2.95, 1.2, 1.0);
      cats.commit();
      staff.set(0, -3.75, 0.33, -2.15, 0.35, owned ? 3 : 0, 0, groom > 0.4 && groom < 0.75 ? 7 : 4);
      if (owned && (stats?.sigmaUpgrades ?? 0) >= 1) staff.set(1, -1.2, 0.33, -2.75, -0.2, 7, 1, 5); else staff.hide(1);
      if (!owned) staff.hide(0);
    },
  });

  function tub(B, x, z) {
    B.cyl('tub', x, 0.4, z, 0.8, 0.66, 0, { sides: 13, taper: 1.12 });
    B.cyl({ c: '#bfe8f0', r: 0.1 }, x, 1.02, z, 0.84, 0.05, 0, { sides: 13 });
    for (const s of [-1, 1]) for (const t of [-1, 1]) B.cyl('gold', x + s * 0.4, 0.33, z + t * 0.4, 0.06, 0.12, 0, { sides: 5 });
    B.cyl('chrome', x - 0.5, 1.0, z - 0.4, 0.03, 0.5, 0, { sides: 5 });
  }
  function catTree(B, x, z) {
    B.cyl('#e8d5bd', x, 0, z, 0.12, 2.0, 0, { sides: 7, taper: 0.9 });
    B.cyl('#e8d5bd', x + 0.4, 0, z + 0.3, 0.1, 1.0, 0, { sides: 7, taper: 0.9 });
    B.cyl('lilac', x, 1.9, z, 0.45, 0.08, 0, { sides: 9 });
    B.cyl('lilac', x + 0.4, 0.98, z + 0.3, 0.4, 0.08, 0, { sides: 9 });
    B.cyl('lilac', x + 0.2, 0, z + 0.1, 0.65, 0.1, 0, { sides: 9 });
  }
  function paw(B, x, y, z, s) {
    B.ball('accent', x, y, z, s * 0.45, { sz: 0.25, detail: 1 });
    for (let i = 0; i < 4; i++) B.ball('accent', x + (i - 1.5) * s * 0.36, y + s * 0.45 + (i % 3 ? 0.08 : 0) * s * 2, z, s * 0.17, { sz: 0.3, detail: 0 });
  }
}
