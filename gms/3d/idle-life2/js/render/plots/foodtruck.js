// 🌮 Food Truck: a teal taco van with its hatch up on the Old Town square, picnic tables, sizzling grill.
// L1 van → L25 awning, fairy lights, more tables → L100 twin trucks and a parasol picnic garden.
export default function buildPlot(kit, { line, palette, rng }) {
  const P = kit.plot({ id: 'foodtruck', line, palette, rng, seed: 23, colors: { accent: '#6fbfb2', stock: '#d8dde4', truck: '#6fbfb2', truck2: '#f2a6bd' } });
  const { b, t1, t2, lot, props: K, shape: S } = { ...P, shape: kit.shape };
  const TX = -1.2, TZ = -0.4;

  truck(b, TX, TZ, 'truck', true);
  K.signPost(b, TX + 3.4, 2.1, { c: '#4b4453', w: 0.8, h: 1.3, ry: -0.3 });
  b.ball('orange', TX + 3.4, 1.2, 2.18, 0.11, { sx: 1.6, sy: 0.7, detail: 1 });
  picnic(b, -6.4, 1.4, 0.15);
  K.bin(b, TX + 3.6, -0.8, { c: 'green' });
  K.planter(b, -8.3, -1.8, { s: 1.1, flowers: true });
  K.roundTree(b, 6.6, -3.0, { s: 1.15 });
  K.lamp(b, -3.9, -2.9);

  for (let i = 0; i < 9; i++) {
    const t = i / 8, x = TX - 1.7 + t * 2.6, y = 2.42 - Math.sin(t * Math.PI) * 0.12;
    t1.ball('bulb', x, y + 0.2, TZ + 1.85, 0.055, { detail: 0, g: 1.2 });
  }
  picnic(t1, -6.0, -2.4, -0.25);
  picnic(t1, 4.0, 1.0, -0.1);
  K.planter(t1, TX + 2.6, TZ + 1.4, { s: 0.8 });

  truck(t2, 6.2, -1.6, 'truck2', false, 0.35);
  K.umbrella(t2, -6.2, -2.4, { c: 'accent', r: 1.4 });
  K.umbrella(t2, 4.0, 1.0, { c: 'pink', r: 1.3 });
  K.flowerBed(t2, -8.8, 1.8, 1.6, 1.0, {});

  K.crate(lot, TX, TZ + 0.5, { ry: 0.2 });
  K.signPost(lot, TX + 1.4, 1.6, { c: 'white' });

  const steam = P.instances((d) => d.ball('#ffffff', 0, 0, 0, 0.18, { detail: 1, smooth: true, r: 1 }), 6, { tier: 0, cast: false });
  const sauce = P.dynamic((d) => { for (let i = 0; i < 3; i++) { d.cyl('red', i * 0.13, 0, 0, 0.05, 0.22, 0, { sides: 7 }); d.cyl('green', i * 0.13, 0.22, 0, 0.025, 0.05, 0, { sides: 5 }); } }, { tier: 0 });
  sauce.position.set(TX + 0.2, 1.1, TZ + 1.17);
  P.pile({ at: [TX - 1.1, 1.1, TZ + 1.17], kind: 'parcel', size: 0.24, max: 8, cols: 4, layout: 'grid', spacing: 1.05, range: [0, 0.55], palette: { stock: { c: '#d8dde4', r: 0.25, m: 0.8 } } });
  P.pile({ at: [TX + 2.5, 0, TZ + 0.2], kind: 'bag', size: 0.5, max: 5, layout: [[0, 0, 0, 0.2], [0.45, 0, 0.15, -0.4], [0.2, 0, 0.5, 0.6], [0.65, 0, 0.55, 0], [0.3, 0.42, 0.3, 0.3]], range: [0.55, 1], palette: { stock: '#f2d3a3', white: '#e8776a' } });

  const staff = P.crowd({ count: 2, seed: 4 });
  staff.look(0, { top: '#fbf6ee', acc: 0, style: 4, hair: 0, skin: 2, bot: '#4a5878' }).body(0, 1.18, 0.95, 1);
  staff.look(1, { top: '#fbf6ee', acc: 0, style: 1, hair: 3, skin: 0 }).body(1, 1.18, 0.95, 0.96);
  const folk = P.crowd({ count: 10, seed: 21 });
  const q = P.queue(folk, {
    ids: [0, 1, 2, 3, 4], spawn: [[-12, 0.0], [12, 2.0]], counter: [TX - 1.0, TZ + 1.75], dir: [-0.99, 0.04], gap: 0.82,
    exit: [[TX + 2.2, 2.1], [4.4, 2.3], [7, 0.2], [12.5, -0.6]], faceCounter: Math.PI,
  });
  const diners = [[-6.5, -2.0, 0.1], [-5.5, -1.9, 0.1], [-6.1, -2.85, Math.PI], [4.0, 0.55, 0], [4.4, 1.45, Math.PI]];
  diners.forEach((_, i) => folk.look(5 + i, { style: i % 5, hair: (i * 3) % 7 }));

  return P.done({
    w: 12.5, cardW: 11, d: 6, h: 4,
    camera: { pos: [-4.1, 7.45, 10.6], look: [-0.4, 1.9, -0.4], fov: 30 },
    exit: [[TX + 2.5, TZ + 0.4], [5, 3.6], [12, 6.5]],
    update(dt, stats, time, tier, ctx) {
      const owned = ctx.owned, serving = q.serving();
      staff.set(0, TX - 0.7, 0.42, TZ + 0.35, 0, owned ? 3 : 0, 0, serving ? 6 : 3);
      if (owned && (stats?.sigmaUpgrades ?? 0) >= 1) staff.set(1, TX + 0.1, 0.42, TZ + 0.3, -0.3, 3, 1.1, 4.4); else staff.hide(1);
      if (!owned) staff.hide(0);
      sauce.visible = owned && (stats?.boosts ?? 0) >= 1;
      for (let i = 0; i < 6; i++) {
        const k = ((time * 0.45 + i / 6) % 1);
        if (!owned) { steam.hide(i); continue; }
        steam.place(i, TX - 1.6 + Math.sin(time * 1.3 + i) * 0.1 + k * 0.3, 3.0 + k * 1.1, TZ - 0.4 + Math.cos(time + i) * 0.08, 0, Math.sin(k * Math.PI) * 0.9 + 0.05);
      }
      steam.commit();
      const n = owned ? (ctx.vt >= 1 ? 5 : 2) : 0;
      diners.forEach(([x, z, h], i) => {
        if (i < n) folk.set(5 + i, x, 0.12, z, h, 5, i, 2); else folk.hide(5 + i);
      });
    },
  });

  // A chunky taco truck: long box body, low cab with a big tinted windscreen at +x, serving hatch + awning on the +z side.
  function truck(B, x, z, slot, hatch, ry = 0) {
    const M = S.matrix({ pos: [x, 0, z], ry });
    const L = 4.4, Wd = 2.0;
    B.contact(0, 0, L + 0.4, Wd, { parent: M, k: 0.9, m: 0.4 });
    B.slab('#4b4453', 0, 0.22, 0, L - 0.3, 0.22, Wd - 0.3, { parent: M, round: 0.06 });
    B.slab(slot, -0.45, 0.42, 0, 3.3, 2.15, Wd, { parent: M, round: 0.26, taper: 0.02 });
    B.slab('cream', -0.45, 0.42, 0, 3.34, 0.32, Wd + 0.04, { parent: M, round: 0.14, taper: 0 });
    B.slab(slot, 1.62, 0.42, 0, 1.05, 1.25, Wd - 0.1, { parent: M, round: 0.28, taper: 0.06 });
    B.slab(slot, 1.38, 1.62, 0, 0.6, 0.55, Wd - 0.18, { parent: M, round: 0.16, taper: 0.1 });
    B.slab({ c: '#5d7d97', r: 0.1 }, 1.72, 1.15, 0, 0.32, 0.72, Wd - 0.34, { parent: M, round: 0.08, rz: -0.42, noAo: true });
    for (const s of [-1, 1]) {
      B.slab({ c: '#5d7d97', r: 0.1 }, 1.45, 1.2, s * (Wd / 2 - 0.02), 0.62, 0.5, 0.05, { parent: M, round: 0.05, noAo: true });
      B.ball('bulb', 2.12, 0.78, s * 0.62, 0.1, { parent: M, detail: 0 });
    }
    B.slab('chrome', 2.18, 0.4, 0, 0.16, 0.22, Wd - 0.04, { parent: M, round: 0.07 });
    B.slab('chrome', -2.12, 0.4, 0, 0.14, 0.22, Wd - 0.04, { parent: M, round: 0.07 });
    for (const wx of [-1.35, 1.55]) for (const s of [-1, 1]) {
      B.add(S.drum(11, 0.34, 0.26), '#3d3846', { parent: M, x: wx, y: 0.34, z: s * (Wd / 2 - 0.12), r: 0.6 });
      B.add(S.drum(9, 0.18, 0.28), 'chrome', { parent: M, x: wx, y: 0.34, z: s * (Wd / 2 - 0.12) });
    }
    B.slab('white', -0.45, 2.55, 0, 3.0, 0.12, Wd - 0.25, { parent: M, round: 0.05 });
    if (!hatch) return;
    const hz = Wd / 2;
    B.slab('#7a4e3c', -0.6, 1.08, hz - 0.02, 2.1, 0.95, 0.06, { parent: M, round: 0.03, noAo: true });
    B.slab('#f2d3a3', -0.6, 1.45, hz - 0.01, 1.9, 0.5, 0.05, { parent: M, round: 0.02, noAo: true, g: -0.6 });
    for (let i = 0; i < 3; i++) B.cyl('metal', -1.3 + i * 0.5, 1.12, hz - 0.15, 0.12, 0.28, 0, { parent: M, sides: 9, taper: 1 });
    B.slab('white', -0.6, 1.02, hz + 0.16, 2.3, 0.08, 0.38, { parent: M, round: 0.03 });
    for (const s of [-1, 1]) B.slab('trim', -0.6 + s * 1.12, 1.06, hz + 0.02, 0.12, 1.0, 0.1, { parent: M, round: 0.03 });
    B.awning('orange', -0.6, 2.42, hz + 0.45, 2.6, 0.9, 0, { parent: M, alt: 'cream', drop: 0.25 });
    B.slab('cream', -0.5, 2.67, 0, 1.6, 0.55, 0.12, { parent: M, round: 0.1, rx: 0 });
    B.ball('orange', -0.85, 2.95, 0.08, 0.2, { parent: M, sx: 1.7, sy: 0.7, sz: 0.6, detail: 1, rz: 0.15 });
    B.ball('green', -0.3, 2.95, 0.08, 0.14, { parent: M, sz: 0.6, detail: 1 });
    B.slab('#4b4453', -1.9, 0.75, hz + 0.02, 0.6, 0.8, 0.05, { parent: M, round: 0.03 });
    for (let i = 0; i < 3; i++) B.slab(['#f6d35c', '#f2a6bd', '#9bc66b'][i], -1.9, 0.9 + i * 0.2, hz + 0.05, 0.42, 0.06, 0.02, { parent: M, round: 0.01, noAo: true });
    B.cyl('metal', -1.6, 2.6, -0.4, 0.08, 0.5, 0, { parent: M, sides: 7, taper: 0.8 });
  }
  function picnic(B, x, z, ry) {
    const M = S.matrix({ pos: [x, 0, z], ry });
    B.slab('wood', 0, 0.68, 0, 1.9, 0.07, 0.8, { parent: M, round: 0.02 });
    for (const s of [-1, 1]) {
      B.slab('wood2', 0, 0.4, s * 0.62, 1.9, 0.06, 0.3, { parent: M, round: 0.02 });
      for (const lx of [-0.75, 0.75]) B.slab('wood2', lx, 0, s * 0.3, 0.08, 0.7, 0.08, { parent: M, round: 0.02, rx: s * 0.45 });
    }
    B.ball('#d8dde4', 0.3, 0.76, 0.1, 0.12, { parent: M, sx: 1.4, sy: 0.6, detail: 1, m: 0.8, r: 0.25 });
    B.cyl('white', -0.4, 0.71, -0.1, 0.06, 0.15, 0, { parent: M, sides: 7, taper: 1.2 });
  }
}
