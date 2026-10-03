// ☕ Corner Café: a powder-blue shopfront with an espresso hatch, pastry case and a terrace on the Suburbs lawn.
// L1 hatch café → L25 parasol terrace + planters → L100 roastery (copper drum, sacks, chimney).
export default function buildPlot(kit, { line, palette, rng }) {
  const P = kit.plot({ id: 'cafe', line, palette, rng, seed: 51, colors: { accent: '#6fbfb2', stock: '#c98d5c', shopWall: '#acd0ec', shopRoof: '#e08f7a', copper: { c: '#d98c5a', r: 0.3, m: 0.85 } } });
  const { b, t1, t2, lot, props: K } = P;
  const S = kit.shape;

  K.paving(b, 0, -0.1, 15, 3.6, { colors: ['#f1e2cf', '#e8d4c0', '#f5e9d8', '#eedad6', '#e4dcc4'], tile: 0.9, y: 0 });
  K.house(b, -1.8, -3.9, { w: 6.4, d: 4.4, floors: 2, wall: 'shopWall', roof: 'shopRoof', ridgeX: true, chimneys: 1, shutters: '#6fbfb2', boxes: true, shop: { awning: 'accent', sign: 'cream' }, sides: 'right' });
  b.ball('#8a5a3c', -1.9, 2.75, -1.55, 0.22, { sx: 1.3, sy: 0.8, sz: 0.5, detail: 1 });
  b.ball('#fbf6ee', -1.9, 2.82, -1.47, 0.1, { sx: 1.6, sy: 0.4, sz: 0.3, detail: 0 });
  hatch(b, 2.4, -1.4);
  K.table(b, -6.0, -0.4, { c: 'white', chair: 'accent' });
  K.planter(b, 4.7, 0.9, { s: 1.0, flowers: true });
  K.bush(b, -8.6, -2.2, { flowers: true });
  K.roundTree(b, 7.4, -3.2, { s: 1.2 });
  K.picket(b, -9.6, -5.8, -9.6, 1.2);
  K.flowerBed(b, 6.6, 0.4, 1.4, 1.0, {});
  sideTable(b, 4.3, -0.7);

  K.umbrella(t1, -6.0, -0.4, { c: 'accent', r: 1.05 });
  K.umbrella(t1, -7.6, -1.8, { c: 'shopRoof', r: 1.0 });
  K.table(t1, -7.6, -1.8, { c: 'white', chair: 'shopRoof' });
  for (const x of [-8.6, -3.6]) K.planter(t1, x, 0.9, { s: 0.8, flowers: true });

  t2.cyl('copper', 6.4, 0.25, -3.0, 0.7, 1.1, 0, { sides: 11, rz: Math.PI / 2, taper: 1 });
  t2.slab('iron', 6.4, 0, -3.0, 1.5, 0.3, 1.0, { round: 0.05 });
  t2.cyl('copper', 6.0, 1.1, -3.0, 0.12, 2.6, 0, { sides: 7, taper: 0.9 });
  for (let i = 0; i < 5; i++) t2.slab('#c9a37a', 4.8 + (i % 3) * 0.7, Math.floor(i / 3) * 0.42, -4.6 + (i % 2) * 0.2, 0.65, 0.45, 0.45, { round: 0.18, taper: 0.1, ry: i * 0.3 });
  t2.slab('cream', -1.8, 4.9, -1.45, 3.2, 0.7, 0.14, { round: 0.08 });
  t2.ball('#8a5a3c', -1.8, 5.25, -1.36, 0.25, { sx: 1.3, sy: 0.8, sz: 0.4, detail: 1 });

  K.signPost(lot, 0, 1.2, { c: 'white' });
  K.crate(lot, 1.2, 0.4, {});

  const steam = P.instances((d) => d.ball('#ffffff', 0, 0, 0, 0.12, { detail: 1, smooth: true }), 5, { cast: false });
  const pastry = P.dynamic((d) => {
    d.slab({ c: '#e8f3f5', r: 0.06, m: 0.2 }, 0, 0, 0, 1.0, 0.5, 0.5, { round: 0.04, taper: 0 });
    for (let i = 0; i < 6; i++) d.ball(['#f2a6bd', '#e8b06a', '#a8694a', '#f6d35c'][i % 4], -0.32 + (i % 3) * 0.32, 0.18 + Math.floor(i / 3) * 0.17, -0.05, 0.09, { sx: 1.3, sy: 0.7, detail: 1 });
  }, { tier: 0 });
  pastry.position.set(3.2, 1.0, -1.1);
  const scooter = P.dynamic((d) => {
    d.add(S.drum(9, 0.22, 0.12), 'dark', { x: -0.55, y: 0.22 });
    d.add(S.drum(9, 0.22, 0.12), 'dark', { x: 0.55, y: 0.22 });
    d.slab('accent', 0, 0.22, 0, 1.2, 0.3, 0.4, { round: 0.14 });
    d.slab('accent', -0.25, 0.48, 0, 0.6, 0.18, 0.36, { round: 0.08 });
    d.slab('accent', 0.48, 0.3, 0, 0.16, 0.75, 0.32, { round: 0.06, rz: -0.3 });
    d.slab('chrome', 0.66, 1.0, 0, 0.05, 0.05, 0.55, { round: 0.02 });
    d.slab('#c98d5c', -0.5, 0.55, 0, 0.45, 0.42, 0.45, { round: 0.08 });
  }, { tier: 0 });

  P.pile({ at: [4.3, 0.84, -0.7], kind: 'cup', size: 0.15, max: 12, cols: 4, layout: 'grid', spacing: 1.25, palette: { stock: '#c98d5c', white: '#fbf6ee', red: '#6fbfb2' } });

  const staff = P.crowd({ count: 2, seed: 8 });
  staff.look(0, { top: '#6fbfb2', acc: 0, style: 2, hair: 3, skin: 0 });
  staff.look(1, { top: '#6fbfb2', acc: 0, style: 0, hair: 4, skin: 4 });
  const folk = P.crowd({ count: 9, seed: 44 });
  const q = P.queue(folk, {
    ids: [0, 1, 2, 3, 4], spawn: [[12, 1.3], [-12, 1.5]], counter: [2.4, 0.2], dir: [-0.95, 0.3], gap: 0.8,
    exit: [[0.6, 1.5], [-6, 1.6], [-12.5, 1.6]], faceCounter: Math.PI,
  });
  const seats = [[-6.0, -1.0, 0.2], [-6.8, -0.3, Math.PI / 2 + 0.3], [-7.6, -2.4, 0.1], [-8.4, -1.7, Math.PI / 2 + 0.2]];
  let sc = 0;

  return P.done({
    w: 13, cardW: 12, d: 6, h: 5,
    camera: { pos: [-2.6, 6.6, 11.2], look: [-1.4, 2.0, -1.2], fov: 30 },
    exit: [[4.3, -0.7], [6, 3.6], [12, 6.5]],
    update(dt, stats, time, tier, ctx) {
      const owned = ctx.owned, serving = q.serving();
      staff.set(0, 2.4, 0.1, -2.0, 0, owned ? 3 : 0, 0, serving ? 6 : 2.5);
      if (owned && (stats?.sigmaUpgrades ?? 0) >= 1) staff.set(1, 1.4, 0.1, -2.1, 0.4, 3, 0.8, 3.5); else staff.hide(1);
      if (!owned) staff.hide(0);
      pastry.visible = owned && (stats?.boosts ?? 0) >= 2;
      for (let i = 0; i < 5; i++) {
        const k = (time * 0.6 + i / 5) % 1;
        if (!owned || !serving) { steam.hide(i); continue; }
        steam.place(i, 2.2 + Math.sin(time * 2 + i) * 0.05, 1.75 + k * 0.7, -1.55, 0, Math.sin(k * Math.PI) * 1.1 + 0.05);
      }
      steam.commit();
      const delivering = owned && (stats?.sigmaUpgrades ?? 0) >= 2;
      sc = delivering ? (sc + dt / 14) % 1 : 0;
      scooter.visible = owned && (stats?.sigmaUpgrades ?? 0) >= 2;
      if (sc < 0.15 || !delivering) { scooter.position.set(5.6, 0, 1.0); scooter.rotation.y = -0.4; }
      else if (sc < 0.55) { const u = (sc - 0.15) / 0.4; scooter.position.set(5.6 + u * 14, 0, 1.0 + Math.min(1, u * 4) * 5.4); scooter.rotation.y = 0; }
      else { const u = (sc - 0.55) / 0.45; scooter.position.set(19.6 - u * 14, 0, 6.4 - Math.max(0, u - 0.75) * 4 * 5.4); scooter.rotation.y = Math.PI; }
      const n = owned ? (ctx.vt >= 1 ? 4 : 2) : 0;
      seats.forEach(([x, z, h], i) => { if (i < n) folk.set(5 + i, x, 0.12, z, h, i % 2 ? 6 : 5, i, 1.6); else folk.hide(5 + i); });
    },
  });

  function hatch(B, x, z) {
    B.slab('cream', x, 0, z, 2.2, 1.0, 1.2, { round: 0.06 });
    B.slab('wood', x, 1.0, z + 0.05, 2.4, 0.08, 1.35, { round: 0.03 });
    B.slab('chrome', x - 0.2, 1.08, z - 0.25, 0.8, 0.55, 0.5, { round: 0.08 });
    B.slab('#4b4453', x - 0.2, 1.62, z - 0.25, 0.85, 0.08, 0.52, { round: 0.03 });
    B.disc('copper', x - 0.4, 1.3, z + 0.02, 0.09, 0.03, { rx: Math.PI / 2 });
    B.cyl('white', x + 0.5, 1.08, z + 0.2, 0.07, 0.14, 0, { sides: 7, taper: 1.2 });
    B.cyl('white', x + 0.7, 1.08, z + 0.3, 0.07, 0.14, 0, { sides: 7, taper: 1.2 });
    B.slab('accent', x, 2.55, z + 0.2, 2.6, 0.06, 1.6, { round: 0.03, rx: 0.12 });
    for (const sx of [-1, 1]) B.cyl('wood2', x + sx * 1.15, 0, z + 0.85, 0.05, 2.5, 0, { sides: 5 });
  }
  function sideTable(B, x, z) {
    B.slab('wood', x, 0.78, z, 1.1, 0.06, 0.8, { round: 0.02 });
    for (const lx of [-0.45, 0.45]) for (const lz of [-0.3, 0.3]) B.slab('wood2', x + lx, 0, z + lz, 0.06, 0.78, 0.06, { round: 0.02 });
  }
}
