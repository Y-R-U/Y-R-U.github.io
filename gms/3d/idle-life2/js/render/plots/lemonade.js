// 🍋 Lemonade: a plank stall on the Old Town cobbles. L1 stall → L25 kiosk with fairy lights → L100 juice bar + neon lemon.
export default function buildPlot(kit, { line, palette, rng }) {
  const P = kit.plot({ id: 'lemonade', line, palette, rng, seed: 11, colors: { accent: '#f6d35c', stock: '#f6d35c', awn: '#f6d35c', lemon: '#f7d84a', juice: { c: '#f9d548', r: 0.25 }, pink: '#f5a3b5' } });
  const { b, t1, t2, lot, props: K } = P;
  const SX = -0.6, SZ = 0.2;

  stall(b, SX, SZ);
  b.contact(SX, SZ + 0.05, 3.0, 1.15, { k: 0.95 });
  for (const lx of [SX - 1.62, SX + 1.62]) {
    b.cyl('iron', lx, 2.2, SZ + 0.62, 0.015, 0.3, 0, { sides: 5 });
    b.cyl('lamp', lx, 1.92, SZ + 0.62, 0.11, 0.26, 0, { sides: 7, taper: 0.8 });
    b.cyl('iron', lx, 2.17, SZ + 0.62, 0.13, 0.05, 0, { sides: 7 });
    b.lamps.push([lx, 2.0, SZ + 0.62]);
  }
  K.planter(b, SX - 2.3, SZ + 1.2, { s: 1.15 });
  K.planter(b, SX + 2.1, SZ + 1.5, { s: 0.85, flowers: true });
  K.planter(b, SX - 2.9, SZ - 0.2, { s: 0.75 });
  aboard(b, SX + 3.0, 2.6, -0.4);
  K.roundTree(b, -6.2, -2.6, { s: 1.2 });
  K.bench(b, -5.2, -0.5, { ry: 0.35 });
  K.lamp(b, 4.2, 3.7);
  {
    const ly = K.lawn(b, 7.4, 1.6, 4.6, 2.8, { ry: -0.05 });
    K.roundTree(b, 8.4, 1.3, { s: 1.15, y: ly });
    K.bush(b, 5.8, 2.4, { s: 0.7, flowers: true, y: ly });
    for (let i = 0; i < 8; i++) b.ball(palette.flowers[i % 5], 5.6 + i * 0.5, ly + 0.06, 2.75 + (i % 2) * 0.18, 0.1, { detail: 0 });
    const ly2 = K.lawn(b, -8.0, 1.9, 4.0, 2.0, { ry: 0.05 });
    K.bush(b, -9.3, 1.7, { s: 0.85, y: ly2 });
    K.bush(b, -6.9, 2.1, { s: 0.65, flowers: true, y: ly2 });
    for (let i = 0; i < 6; i++) b.ball(palette.flowers[(i + 2) % 5], -9.0 + i * 0.45, ly2 + 0.06, 2.6 - (i % 2) * 0.2, 0.1, { detail: 0 });
  }
  K.flowerBed(b, 7.6, -3.4, 2.6, 1.1, { ry: -0.1 });
  {
    const ly = K.lawn(b, -8.6, -5.6, 5.0, 2.6, { ry: 0.04 });
    K.bush(b, -10.2, -5.9, { s: 0.9, flowers: true, y: ly });
    K.bush(b, -7.4, -6.2, { s: 0.75, y: ly });
    for (let i = 0; i < 7; i++) b.ball(palette.flowers[i % 5], -9.4 + i * 0.45, ly + 0.08, -4.75 + (i % 2) * 0.2, 0.09, { detail: 0 });
  }
  K.planter(b, 1.6, -6.2, { s: 1.2, flowers: true });
  K.planter(b, 3.0, -6.4, { s: 0.9 });
  K.bench(b, 2.3, -5.4, { ry: 0 });
  b.add(kit.stockUnit('crate', palette, '#f7d84a'), null, { x: SX + 2.0, z: SZ - 0.6, ry: 0.4, scale: 0.9 });

  // L25 kiosk: side table, lemon crates, fairy lights, bunting, stools
  for (let i = 0; i < 9; i++) {
    const t = i / 8, x = SX - 1.6 + t * 3.2, y = 2.62 - Math.sin(t * Math.PI) * 0.22;
    t1.ball('bulb', x, y, SZ + 1.05, 0.06, { detail: 0, g: 1.2 });
  }
  t1.slab('wood', SX + 2.6, 0, SZ + 0.1, 1.3, 0.8, 0.7, { round: 0.06 });
  for (let i = 0; i < 3; i++) t1.ball('lemon', SX + 2.25 + i * 0.32, 0.88, SZ + 0.1 + (i % 2) * 0.12, 0.13, { sx: 1.15, detail: 1 });
  for (const [x, z] of [[SX + 1.4, SZ + 2.4], [SX - 1.2, SZ + 2.6]]) stool(t1, x, z);
  K.crate(t1, SX - 2.2, SZ - 1.1, { fill: 'lemon', ry: 0.3 });
  K.crate(t1, SX - 2.0, SZ - 1.2, { fill: 'lemon', ry: -0.2, y: 0.46, s: 0.85 });
  K.umbrella(t1, 2.4, -2.2, { c: 'accent', r: 1.15 });
  K.table(t1, 2.4, -2.2, { c: 'white', chair: 'accent' });

  // L100 juice bar: a little pastel kiosk with a neon lemon, second parasol
  {
    const x = 4.9, z = -2.6;
    t2.slab('#f8efd8', x, 0, z, 3.2, 2.6, 2.4, { round: 0.18, taper: 0.03 });
    t2.add(K.roofGeo(3.2, 2.4, 0.9, { col: kit.shape.rgb('#f6d35c'), over: 0.3 }), null, { x, y: 2.6, z, ry: Math.PI / 2 });
    t2.slab('glass', x, 0.9, z + 1.22, 2.2, 1.1, 0.05, { round: 0.02, noAo: true });
    t2.slab('window', x, 1.45, z + 1.25, 2.0, 0.5, 0.02, { noAo: true, g: -0.8 });
    t2.slab('wood', x, 0.82, z + 1.45, 2.6, 0.1, 0.5, { round: 0.03 });
    t2.awning('awn', x, 2.4, z + 1.7, 3.4, 1.0, 0, { alt: 'white' });
    t2.cyl('iron', x, 3.3, z, 0.05, 0.8, 0, { sides: 5 });
    t2.ball({ c: '#ffe36a', r: 0.4, g: 1.4 }, x, 4.45, z, 0.62, { sx: 1.25, detail: 1, smooth: true });
    t2.ball({ c: '#8fd66a', r: 0.4, g: 1.0 }, x + 0.5, 4.95, z, 0.22, { sx: 1.6, sy: 0.5, detail: 0, rz: 0.5 });
    K.umbrella(t2, 7.8, 0.6, { c: 'pink', r: 1.1 });
    K.table(t2, 7.8, 0.6, { c: 'white', chair: 'pink' });
  }

  // For sale: chalk-marked empty pitch
  K.crate(lot, SX - 0.5, SZ, { ry: 0.3 });
  K.crate(lot, SX + 0.4, SZ + 0.2, { ry: -0.4, y: 0, s: 0.8 });
  K.signPost(lot, SX + 1.6, SZ + 1.4, { c: 'white', w: 1.0 });
  lot.ball('lemon', SX + 1.6, 1.45, SZ + 1.52, 0.14, { detail: 1 });

  // Live parts
  const iceBox = P.dynamic((d) => {
    d.slab('#8fd0e6', 0, 0, 0, 0.9, 0.6, 0.6, { round: 0.12 });
    d.slab('white', 0, 0.58, 0, 0.94, 0.1, 0.64, { round: 0.05 });
  }, { tier: 0 });
  iceBox.position.set(SX - 1.9, 0, SZ + 0.6);
  iceBox.rotation.y = 0.3;
  const jug = P.dynamic((d) => {
    d.cyl('juice', 0, 0, 0, 0.17, 0.42, 0, { sides: 9, taper: 0.92 });
    d.cyl({ c: '#e6f3f2', r: 0.1 }, 0, 0.4, 0, 0.16, 0.08, 0, { sides: 9, taper: 1.15 });
    d.slab({ c: '#e6f3f2', r: 0.1 }, 0.2, 0.12, 0, 0.05, 0.26, 0.06, { round: 0.02 });
  }, { tier: 0 });
  jug.position.set(SX - 0.95, 1.12, SZ + 0.55);
  const pinkJug = P.dynamic((d) => d.cyl('pink', 0, 0, 0, 0.15, 0.38, 0, { sides: 9, taper: 0.92 }), { tier: 0 });
  pinkJug.position.set(SX - 0.5, 1.12, SZ + 0.45);

  P.pile({ at: [SX + 0.55, 1.1, SZ + 0.42], kind: 'cup', size: 0.19, max: 10, cols: 4, range: [0, 0.6] });
  P.pile({ at: [SX + 2.7, 0.0, SZ + 1.2], kind: 'crate', size: 0.62, max: 4, cols: 2, layout: [[0, 0, 0, 0.2], [0.75, 0, 0.1, -0.3], [0.35, 0.45, 0.05, 0.1], [0.1, 0, 0.75, 0.5]], range: [0.6, 1] });

  const staff = P.crowd({ count: 2, seed: 3 });
  staff.look(0, { top: '#e8776a', acc: 0, style: 1, hair: 1, skin: 1 }).body(0, 1.2, 0.95, 0.98);
  staff.look(1, { top: '#6fb7a8', acc: 0, style: 0, hair: 0, skin: 3 }).body(1, 1.2, 0.92, 0.95);
  const folk = P.crowd({ count: 8, seed: 9 });
  const q = P.queue(folk, {
    ids: [0, 1, 2, 3, 4, 5], spawn: [[-11, 0.2], [11, 1.5]], counter: [SX - 0.1, SZ + 1.2], dir: [0.97, -0.24], gap: 0.8,
    exit: [[SX - 1.6, 0.95], [-4.2, 0.6], [-6.5, 0.7], [-12.5, -0.4]],
    serve: (s) => Math.max(1.4, Math.min(3.2, s?.cycleSec ?? 2)),
  });
  folk.look(6, { top: '#7d9ad6', style: 2, hair: 3 });
  folk.look(7, { top: '#e58fb0', style: 0, hair: 1 }).body(7, 1.25, 0.7, 0.8);

  return P.done({
    w: 10.5, cardW: 8.4, d: 6, h: 3.5,
    camera: { pos: [-3.7, 6.5, 9.8], look: [-0.3, 1.7, 0.0], fov: 30 },
    exit: [[SX + 2.7, SZ + 1.2], [6, 3.6], [12, 6.5]],
    update(dt, stats, time, tier, ctx) {
      const owned = ctx.owned;
      const serving = q.serving();
      const t = time;
      staff.set(0, SX - 0.3, 0.12, SZ - 0.38, 0, owned ? (serving ? 3 : 0) : 0, 0, 5);
      if (owned && (stats?.sigmaUpgrades ?? 0) >= 1) staff.set(1, SX - 1.15, 0.12, SZ - 0.36, 0.25, 3, 1.3, 4.2);
      else staff.hide(1);
      if (!owned) staff.hide(0);
      iceBox.visible = owned && (stats?.boosts ?? 0) >= 1;
      pinkJug.visible = owned && (stats?.boosts ?? 0) >= 2;
      jug.visible = owned;
      jug.rotation.z = serving ? -Math.max(0, Math.sin(t * 3)) * 0.5 : 0;
      if (owned) {
        folk.set(6, -4.95, 0.02, -0.35, 0.35 + Math.PI, 5, 0, 1.5);
        folk.set(7, -3.2 + Math.sin(t * 0.4) * 0.2, 0.02, -1.6, 0.6 + Math.sin(t * 0.3), 6, 0.7, 2.2);
      } else { folk.hide(6); folk.hide(7); }
    },
  });

  function stall(B, x, z) {
    const W = 2.9, D = 1.05, H = 1.02;
    B.slab('wood2', x, 0, z, W, 0.12, D, { round: 0.03 });
    B.slab('wood', x, 0.1, z, W - 0.1, H - 0.1, D - 0.1, { round: 0.04, taper: 0 });
    for (let i = 0; i < 9; i++) B.slab(i % 2 ? 'wood' : 'wood2', x - W / 2 + 0.17 + i * ((W - 0.34) / 8), 0.14, z + D / 2 - 0.02, 0.27, H - 0.2, 0.06, { round: 0.03, taper: 0, rz: (B.rnd() - 0.5) * 0.02 });
    B.slab('wood2', x, H, z + 0.08, W + 0.25, 0.1, D + 0.32, { round: 0.04 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.cyl('wood2', x + sx * (W / 2 - 0.07), 0, z + sz * (D / 2 - 0.07), 0.065, 2.45 + (sz < 0 ? 0.25 : 0), 0, { sides: 7, taper: 0.88 });
    B.slab('wood', x, 1.1, z - D / 2 + 0.04, W - 0.1, 1.5, 0.08, { round: 0.03, taper: 0 });
    B.awning('awn', x, 2.72, z + 0.3, W + 0.5, 1.6, 0, { alt: 'white', drop: 0.55 });
    const ped = new kit.shape.Mesh(), pc = kit.shape.rgb('#b07548');
    ped.quad([-W / 2 - 0.1, 0, 0], [W / 2 + 0.1, 0, 0], [W / 2 + 0.1, 0.18, 0], [-W / 2 - 0.1, 0.18, 0], pc);
    ped.tri([-W / 2 - 0.1, 0.18, 0], [W / 2 + 0.1, 0.18, 0], [0, 0.85, 0], pc);
    ped.quad([W / 2 + 0.1, 0, -0.06], [-W / 2 - 0.1, 0, -0.06], [-W / 2 - 0.1, 0.18, -0.06], [W / 2 + 0.1, 0.18, -0.06], pc);
    ped.tri([W / 2 + 0.1, 0.18, -0.06], [-W / 2 - 0.1, 0.18, -0.06], [0, 0.85, -0.06], pc);
    B.add(ped.geo(), null, { x, y: 2.6, z: z - D / 2 + 0.02 });
    B.slab('white', x, 2.78, z - D / 2 + 0.06, 1.3, 0.4, 0.06, { round: 0.06 });
    B.ball('lemon', x - 0.28, 2.98, z - D / 2 + 0.12, 0.14, { sx: 1.25, detail: 1 });
    B.ball('lemon', x + 0.05, 2.98, z - D / 2 + 0.12, 0.12, { sx: 1.25, detail: 1 });
    B.ball('#8fd66a', x + 0.3, 3.0, z - D / 2 + 0.12, 0.08, { sx: 1.6, sy: 0.5, detail: 0 });
    B.cyl('white', x - 0.35, H + 0.05, z + 0.25, 0.26, 0.1, 0, { sides: 11, taper: 1.3 });
    for (let i = 0; i < 4; i++) B.ball('lemon', x - 0.43 + (i % 2) * 0.16, H + 0.2 + (i > 1 ? 0.08 : 0), z + 0.2 + (i % 3) * 0.08, 0.1, { sx: 1.2, detail: 1 });
    B.cyl('metal', x + 1.05, H + 0.04, z + 0.2, 0.09, 0.32, 0, { sides: 7, taper: 0.6 });
    B.ball('#f2a65a', x + 1.05, H + 0.4, z + 0.2, 0.08, { detail: 0 });
  }
  function aboard(B, x, z, ry) {
    for (const s of [-1, 1]) B.slab('wood2', x, 0, z + s * 0.16, 0.7, 1.05, 0.05, { ry, rx: s * 0.16, round: 0.02 });
    B.slab('#4b4453', x, 0.25, z + 0.24, 0.56, 0.6, 0.02, { ry, rx: 0.16, round: 0.02 });
    B.ball('lemon', x, 0.62, z + 0.28, 0.13, { sx: 1.3, detail: 1, ry });
  }
  function stool(B, x, z) {
    B.cyl('iron', x, 0, z, 0.05, 0.62, 0, { sides: 5 });
    B.cyl('iron', x, 0, z, 0.2, 0.04, 0, { sides: 7 });
    B.cyl('accent', x, 0.62, z, 0.22, 0.08, 0, { sides: 9, taper: 1.05 });
  }
}
