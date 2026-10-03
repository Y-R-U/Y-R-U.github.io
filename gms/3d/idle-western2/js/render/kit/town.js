// Dribble Creek, the static town around the business plots (DESIGN W1/W3, docs/ART.md "Town"):
// packed-dirt main street with wheel ruts, Pomfrey's purple-and-gold south side, the Town Hall, the church closing the
// far end, Boot Hill on its rise, backyards, water tower, windmill, telegraph line, cacti and the faceted mesa ring.
// Output: merged chunks split by x (and a north/street/south band) so frustum + shadow passes cull them, one painted
// sign batch, the windmill rotor (spins), the Boot Hill graves (instanced, grows at prestige) and a lamp list.
import * as THREE from 'three';
import { contactMesh } from './build.js?v=20261004c';
import * as W from './western.js?v=20261004c';

const HAT_TOP = (b) => {
  b.cyl('dark', 0, 0, 0, 0.62, 0.08, 0, { sides: 14, taper: 1 });
  b.cyl('dark', 0, 0.06, 0, 0.36, 0.9, 0, { sides: 14, taper: 1.04 });
  b.cyl('pomTrim', 0, 0.12, 0, 0.375, 0.14, 0, { sides: 14, taper: 1 });
};

export function buildTown(kit, data, field, pal) {
  const ST = data.STREET, FR = data.FRONTS || [], END = ST.end ?? ST.x1 - 18;
  const CELL = 56, X0 = ST.x0 - 160;
  const cells = new Map(), gcells = new Map();
  // three bands: north lots (n), the street and its edges (m), Pomfrey's side (s) — cards hide s when it would occlude.
  const band = (z) => (z < ST.north ? 'n' : z < ST.south + 0.2 ? 'm' : 's');
  const cellKey = (x, z) => Math.floor((x - X0) / CELL) + ':' + band(z);
  const B = (x, z = 0) => { const k = cellKey(x, z); if (!cells.has(k)) cells.set(k, kit.builder(pal, { seed: 100 + cells.size * 31 })); return cells.get(k); };
  const G = (x = 0, z = 0) => { const k = cellKey(x, z); if (!gcells.has(k)) gcells.set(k, kit.builder(pal, { seed: 500 + gcells.size * 7 })); return gcells.get(k); };
  const far = kit.builder(pal, { seed: 999 });
  const signs = kit.signs.batch();
  const lamps = [];
  const life = { pigeonSpots: [], joggerPaths: [], gullSpots: [], benches: [], walks: [] };
  const rz = ST.z, hw = ST.width / 2, roadN = rz - hw, roadS = rz + hw;
  const XA = ST.x0 - 40, XB = END + 70;
  const rnd = rngOf(77);
  const uS = kit.materials.shared.uStreet;
  if (uS) uS.value.set(rz, hw, 1.55, 1);

  // ---- ground: one dirt apron for the whole town (ruts only inside the street band, see surface.js uStreet)
  // (the ground itself is the terrain, drawn with the DIRT surface; the street ruts come from uStreet)

  // ---- the south side: Pomfrey's frontages, the Town Hall (all face −z, the street)
  const SZ = ST.south + 2.5;
  southFront.signs = signs;
  for (const f of FR) {
    if (f.side !== 's') continue;
    southFront(B(f.x, SZ + 2), f, f.x, SZ);
  }
  // open ground at the south end of Bank Block: a stage-depot corral (railroad v1.1 starts here)
  const lastS = Math.max(...FR.filter((f) => f.side === 's').map((f) => f.x + f.w / 2));
  if (lastS < END) {
    const b = B(lastS + 6, SZ + 4);
    for (let x = lastS + 1.5; x < END - 1; x += 3) W.rail(b, x, SZ + 0.5, Math.min(END - 1, x + 3), SZ + 0.5);
    W.rail(b, END - 1, SZ + 0.5, END - 1, SZ + 9);
    W.hay(b, lastS + 4, SZ + 4, { ry: 0.3 }); W.hay(b, lastS + 5.2, SZ + 4.4, { ry: -0.2 }); W.hay(b, lastS + 4.6, SZ + 4.2, { y: 0.6, ry: 0.1 });
    W.trough(b, END - 4, SZ + 2.5, { ry: 0.1 });
    W.wheel(b, lastS + 8, SZ + 1.2, { ry: 0.4 });
    W.stake(b, (lastS + END) / 2, SZ - 0.4, { ry: Math.PI, kind: 'reserved', signs, text: 'FUTURE SITE OF\nPOMFREY RAILROAD' , w: 2.6, h: 1.0 });
  }

  // ---- the church closes the street; Boot Hill rises behind it
  const ch = FR.find((f) => f.side === 'end');
  if (ch) church(B(ch.x, rz), ch.x, rz, signs);
  const BH = data.BOOT_HILL;
  if (BH) bootHill(B(BH.x, BH.z), BH, signs);
  const busy = (x, z) => (z > -26 && z < SZ + 16 && x > XA - 6 && x < END + 4) || (BH && Math.hypot(x - BH.x, z - BH.z) < BH.r + 3) || (ch && Math.abs(x - ch.x) < 12 && Math.abs(z - rz) < 12);

  // ---- street dressing: boardwalk lamps, hitching rails, troughs, posters, bulb strings, bunting
  const NZ = roadN - 0.4;
  for (let x = 2; x < END; x += 11) {
    const inAlley = !data.PLOTS?.some((p) => p.kind === 'line' && Math.abs(p.x - x) < p.w / 2 - 0.5);
    if (inAlley) continue;
    W.lanternPost(B(x, NZ), x, NZ, { ry: Math.PI });
  }
  for (let x = 8; x < END; x += 13) W.lanternPost(B(x, roadS), x, roadS + 0.4, { ry: 0 });
  for (const p of data.PLOTS || []) {
    if (p.kind !== 'line') continue;
    const b = B(p.x, NZ);
    if (p.id === 'livery' || p.id === 'saloon' || p.id === 'bank') W.hitch(b, p.x + (p.id === 'saloon' ? 4.5 : 2.5), NZ - 0.1, {});
    if (p.id === 'saloon' || p.id === 'tubs') W.trough(b, p.x + (p.id === 'saloon' ? -5.2 : 4), NZ - 0.2, { w: 2 });
  }
  { // Saloon Row: bulb strings across the street (night), Pomfrey bunting over the hotel
    const pl = (id) => data.PLOTS?.find((p) => p.id === id);
    const sal = pl('saloon'), gar = pl('garter');
    for (const p of [sal, gar].filter(Boolean)) {
      const b = B(p.x, rz);
      W.bulbString(b, [p.x - 4, 4.9, 2.4], [p.x - 1, 5.2, SZ - 0.2], { n: 16, sag: 0.9 });
      W.bulbString(b, [p.x + 4, 4.9, 2.4], [p.x + 6, 5.2, SZ - 0.2], { n: 16, sag: 0.9 });
    }
    const hot = FR.find((f) => f.id === 'p_hotel'), op = FR.find((f) => f.id === 'p_opera');
    if (hot && op) W.bunting(B(hot.x + 8, SZ), [hot.x - 4, 6.4, SZ - 2.3], [op.x + 4, 6.4, SZ - 2.3], { sag: 0.6 });
  }
  // parked wagons along the south street edge (the duel lane down the middle stays clear)
  for (const [x, kind, ry, extra] of [[15, 'covered', Math.PI / 2 - 0.06, {}], [46.5, 'hay', -Math.PI / 2 + 0.1, {}], [99, 'flat', Math.PI / 2 + 0.04, { load: true }], [lastS + 9, 'flat', 0.5, { broken: true }]]) {
    W.wagon(B(x, roadS), x, x > lastS ? SZ + 4 : roadS - 1.4, { kind, ry, ...extra });
  }
  // pebbles, horse apples and tufts scattered over the dirt (ground mesh, no extra draws)
  for (let i = 0; i < 520; i++) {
    const r = rngOf(i * 7 + 11), x = XA + r() * (XB - XA), z = -26 + r() * 62;
    const onStreet = z > roadN && z < roadS;
    const k = r();
    if (onStreet && k < 0.08) G(x, z).ball('woodDark', x, 0.02, z, 0.09 + r() * 0.05, { sy: 0.55, detail: 0 });
    else if (k < 0.7) G(x, z).ball(r() < 0.5 ? 'rock3' : 'stone2', x, 0.01, z, 0.05 + r() * 0.09, { sy: 0.5, detail: 0, ry: r() * 6 });
    else if (!onStreet) W.tuft(G(x, z), x, z, { s: 0.6 + r() * 0.6 });
  }
  // the town's welcome arch over the trail (west), the wanted board by the jail, a church-side noticeboard
  arch(B(XA + 26, rz), XA + 26, rz, signs);
  const jail = data.PLOTS?.find((p) => p.id === 'jail');
  if (jail) W.wantedBoard(B(jail.x - jail.w / 2 - 1.5, NZ), jail.x - jail.w / 2 - 1.2, NZ - 0.6, { ry: Math.PI * 0.95, signs, n: 3, bounties: ['$500', 'BLACK BART\n$5,000', '$1,000'] });

  // ---- backyards behind the business lots (north) and behind Pomfrey (south)
  for (const p of data.PLOTS || []) {
    if (p.kind !== 'line') continue;
    const r = rngOf(p.x * 3 + 1), bz = -(data.PLOT_D ?? 9) / 2 - 2.5;
    const b = B(p.x, bz - 4);
    if (r() < 0.6) outhouse(b, p.x + (r() - 0.5) * p.w * 0.6, bz - 2 - r() * 3, (r() - 0.5) * 0.6);
    if (r() < 0.5) W.barrel(b, p.x + (r() - 0.5) * p.w * 0.8, bz - 0.5 - r() * 2);
    if (r() < 0.4) W.crate(b, p.x + (r() - 0.5) * p.w * 0.8, bz - 1 - r() * 2, { ry: r() });
    W.rail(b, p.x - p.w / 2 - 0.5, bz - 7, p.x + p.w / 2 + 0.5, bz - 7 + (r() - 0.5) * 0.6, { span: 2.6 });
  }
  for (const f of FR) {
    if (f.side !== 's') continue;
    const r = rngOf(f.x * 5 + 2), b = B(f.x, SZ + 14);
    if (r() < 0.55) outhouse(b, f.x + (r() - 0.5) * f.w * 0.6, SZ + 13 + r() * 3, Math.PI + (r() - 0.5) * 0.5);
    if (r() < 0.5) W.barrel(b, f.x + (r() - 0.5) * f.w, SZ + 11 + r() * 2);
  }
  // yard life: the Mulligans' lumber, a wash line with long johns behind the Garter, woodpiles, a doghouse, skulls
  {
    const pl = (id) => data.PLOTS?.find((p) => p.id === id);
    const gar = pl('garter'), shine = pl('shine'), und = pl('undertaker'), jail = pl('jail'), tubs = pl('tubs');
    if (gar) W.washLine(B(gar.x, -12), gar.x - 1, -11.5, { ry: 0.05 });
    if (tubs) W.washLine(B(tubs.x, -12), tubs.x + 1, -11, { ry: -0.1, items: [['cloth', 0.7, 0.5, 0], ['cream', 0.6, 0.6, 0], ['cloth', 0.5, 0.4, 0]] });
    if (shine) { W.lumber(B(shine.x, -12), shine.x - 2, -13, { ry: 0.2 }); W.doghouse(B(shine.x, -12), shine.x + 4, -10.5, { ry: 0.3 }); }
    if (und) { W.lumber(B(und.x, -12), und.x + 2, -12.5, { ry: -0.15, n: 6 }); W.woodPile(B(und.x, -12), und.x - 3, -10.5, { ry: 0.1 }); }
    if (jail) W.woodPile(B(jail.x, -12), jail.x + 3, -11, { ry: -0.2 });
    for (const f of FR) if (f.side === 's' && rngOf(f.x)() < 0.5) W.woodPile(B(f.x, SZ + 12), f.x + 2, SZ + 11, { ry: Math.PI + 0.2 });
    for (let i = 0; i < 6; i++) { const r = rngOf(i * 41 + 9); W.skull(B(0, 50), XA + r() * (XB - XA), r() < 0.5 ? -40 - r() * 30 : 46 + r() * 30); }
    for (let i = 0; i < 90; i++) {
      const r = rngOf(i * 23 + 5), x = XA - 20 + r() * (XB - XA + 40), z = r() < 0.5 ? -24 - r() * 50 : 34 + r() * 50;
      if (busy(x, z)) continue;
      W.sage(Math.abs(z - rz) < 70 ? B(x, z) : far, x, z, { s: 0.7 + r() * 0.8, y: Math.min(0, field.height(x, z)) - 0.05 });
    }
  }
  // corral behind the livery
  const liv = data.PLOTS?.find((p) => p.id === 'livery');
  if (liv) {
    const b = B(liv.x, -14), z0 = -12, z1 = -22, x0 = liv.x - 7, x1 = liv.x + 7;
    W.rail(b, x0, z0, x1, z0); W.rail(b, x1, z0, x1, z1); W.rail(b, x1, z1, x0, z1); W.rail(b, x0, z1, x0, z0);
    W.trough(b, liv.x + 3, z0 - 2, { ry: 0.2 }); W.hay(b, liv.x - 4, z1 + 2, { ry: 0.4 });
    life.pigeonSpots.push([liv.x - 2, -16]);
  }
  // skyline heroes
  const LM = data.LANDMARKS || {};
  if (LM.waterTower) W.waterTower(B(LM.waterTower[0], LM.waterTower[1]), LM.waterTower[0], LM.waterTower[1], {});
  let rotorAt = null;
  if (LM.windmill) {
    const wm = W.windmill(B(LM.windmill[0], LM.windmill[1]), LM.windmill[0], LM.windmill[1], { ry: -0.5 });
    rotorAt = { pos: wm.hub, ry: -0.5 };
    W.trough(B(LM.windmill[0], LM.windmill[1]), LM.windmill[0] + 2.4, LM.windmill[1] + 1.2, { ry: -0.5 });
  }
  // skyline silhouettes past the far end of the street (the hero looks down +x at them): a ranch windmill + tank
  {
    const fx = END + 78, b = B(fx, -26);
    W.waterTower(b, fx, -30, { h: 9 });
    W.windmill(b, fx + 16, -12, { ry: 0.4, h: 11 });
    W.rail(b, fx - 6, -22, fx + 22, -22, { span: 3.2 });
    for (let i = 0; i < 5; i++) W.cactus(b, fx - 14 + i * 9, -40 + (i % 2) * 22, { s: 1.1 + (i % 3) * 0.3, arms: 1 + (i % 3) });
  }
  // telegraph line along the north backs
  for (let x = XA + 10; x < XB - 10; x += 26) {
    const b = B(x, -30), z = -30 + Math.sin(x * 0.05) * 1.5;
    b.slab('woodDark', x, 0, z, 0.2, 6.5, 0.2, { round: 0.03, taper: 0.1, rz: (rnd() - 0.5) * 0.06 });
    b.slab('wood2', x, 6.1, z, 0.12, 0.12, 1.6, { round: 0.02, taper: 0 });
    if (x + 26 < XB - 10) for (const s of [-0.6, 0.6]) {
      const z2 = -30 + Math.sin((x + 26) * 0.05) * 1.5;
      W.bunting(b, [x, 6.2, z + s], [x + 26, 6.2, z2 + s], { n: 1, sag: 0.7, colors: ['dark'] });
    }
  }

  // ---- desert near town: saguaros, prickly pears, rocks, scrub tufts (kept off the street and lots)
  for (let i = 0; i < 420; i++) {
    const r = rngOf(i * 31 + 7);
    const x = XA - 70 + r() * (XB - XA + 160), z = -120 + r() * 250;
    if (busy(x, z)) continue;
    const near = Math.abs(z - rz) < 70 && x > XA - 40 && x < XB + 40;
    const b = near ? B(x, z) : far, y = Math.min(0, field.height(x, z)) - 0.05;
    const k = r();
    if (k < 0.3) W.cactus(b, x, z, { y, s: 0.8 + r() * 0.7, arms: Math.floor(r() * 4), flower: r() < 0.15 });
    else if (k < 0.45) W.prickly(b, x, z, { y, s: 0.8 + r() * 0.5 });
    else if (k < 0.7) W.rock(b, x, z, { y, s: 0.6 + r() * 2.2 });
    else if (near) W.tuft(b, x, z, { y, s: 0.8 + r() * 0.6 });
  }
  // tufts and pebbles along the street edges / lot fronts
  for (let x = XA; x < XB; x += 2.6) {
    const r = rngOf(x * 17 + 3);
    for (const z of [roadN + 0.3 + r() * 0.5, roadS - 0.4 - r() * 0.5]) if (r() < 0.45) W.tuft(G(x, z), x + r() * 2, z, { s: 0.6 + r() * 0.5 });
  }

  // ---- the mesa ring (3 haze layers) and distant hills
  const mesas = [
    [-60, -230, 90, 40, 46, 0], [60, -260, 120, 50, 58, 1], [190, -240, 80, 38, 40, 0], [300, -200, 110, 46, 52, 1],
    [380, -40, 90, 50, 44, 0], [370, 120, 80, 36, 38, 1], [250, 230, 120, 50, 50, 0], [90, 260, 100, 44, 46, 1],
    [-60, 220, 90, 40, 42, 0], [-210, 120, 70, 36, 36, 1], [-240, -40, 90, 44, 48, 0], [-180, -170, 80, 40, 40, 1],
    [140, -330, 140, 60, 70, 0], [420, 60, 120, 56, 62, 1], [-320, 60, 130, 60, 64, 0], [30, -150, 40, 22, 22, 1], [250, -130, 46, 24, 26, 0],
  ];
  mesas.forEach(([x, z, w, d, h, sp], i) => {
    const r = rngOf(i * 19 + 3);
    const slot = Math.hypot(x - 100, z) > 300 ? 'rock3' : Math.hypot(x - 100, z) > 220 ? 'rock2' : 'rock';
    W.mesa(far, x, z, w, d, h * (Math.hypot(x - 60, z) > 200 ? 1.35 : 0.9), { y: field.height(x, z) - 3, ry: r() * 3, slot, band: slot === 'rock' ? 'rockDark' : 'rock', rnd: r, spire: sp || r() < 0.3 });
  });

  life.pigeonSpots.push([12, 6], [ST.x1 * 0.5, roadN + 1], [END - 10, roadS - 1.5]);
  life.walks.push({ z: roadN - 0.3, y: 0.02, x0: XA, x1: END + 6 }, { z: SZ - 1.2, y: 0.36, x0: 0, x1: lastS }, { z: roadS - 0.7, y: 0.02, x0: XA, x1: END + 6 });
  life.joggerPaths.push([[ST.x0 - 30, roadS - 0.5], [ST.x1 + 30, roadS - 0.5]]);

  // userData.cell = { x0, x1, band } lets world.prepare cull by x-range/band for cards and drop far shadow casters.
  const tag = (m, k) => { const [ix, bd] = k.split(':'); m.userData.cell = { x0: X0 + +ix * CELL, x1: X0 + (+ix + 1) * CELL, band: bd }; return m; };
  const chunks = [...cells.entries()].map(([k, b]) => { const m = b.finish(); m.name = 'town:' + k; return tag(m, k); });
  const ground = [...gcells.entries()].map(([k, b]) => { const m = b.finish({ cast: false }); m.name = 'ground:' + k; return tag(m, k); });
  const farMesh = far.finish({ cast: false });
  farMesh.name = 'town:far';
  const rows = [...cells.values(), ...gcells.values()].flatMap((b) => b.contacts);
  for (const b of cells.values()) lamps.push(...b.lamps);
  const out = [...chunks, ...ground, farMesh];
  if (rows.length) out.push(contactMesh(kit.materials, rows));
  const sm = signs.finish({ name: 'town:signs' });
  if (sm) out.push(sm);

  // windmill rotor (one dynamic draw)
  let rotor = null;
  if (rotorAt) {
    const rb = kit.builder(pal, { seed: 4242 });
    W.windmillRotor(rb, {});
    rotor = rb.finish({ cast: true });
    rotor.name = 'town:rotor';
    rotor.matrixAutoUpdate = true;
    rotor.position.set(...rotorAt.pos);
    rotor.rotation.set(0, rotorAt.ry, 0, 'YXZ');
    out.push(rotor);
  }
  const graves = BH ? graveField(kit, pal, BH) : null;
  if (graves) out.push(graves.mesh);
  let spin = 0;
  return {
    chunks: out, lamps, life, signs: sm, graves,
    tick(dt, t) {
      if (rotor) { spin += dt * (1.6 + Math.sin(t * 0.13) * 0.9); rotor.rotation.z = spin; }
    },
  };
}

// ---------------------------------------------------------------- Pomfrey frontages + Town Hall

const SHORT = { p_feed: 'FEED', p_emporium: 'GOODS', p_hats: 'HATS', p_hotel: 'HOTEL', p_opera: 'OPERA', p_gazette: 'NEWS', p_assay: 'ASSAY', c_hall: 'TOWN HALL' };

function southFront(b, f, x, z) {
  const civic = f.kind === 'civic';
  const skin = civic ? 'civic' : 'pomfrey';
  const sb = southFront.signs;
  const o = { w: f.w - 0.4, d: 8, ry: Math.PI, skin, signs: sb, text: f.name.replace('The ', '').replace('Pomfrey', 'POMFREY').toUpperCase() };
  let r;
  switch (f.style) {
    case 'barn':
      r = W.falseFront(b, x, z, { ...o, h: 4.2, top: 6.4, parapet: 'gabled', paint: 'red', door: 'double', windows: 0, porch: { d: 2.4, h: 3.2 } });
      W.hay(b, x - 3.2, z - 3.1, { ry: 0.2, y: 0.36 }); W.hay(b, x - 3.0, z - 3.0, { ry: 0.1, y: 0.98 });
      for (let i = 0; i < 3; i++) W.crate(b, x + 3 + (i % 2) * 0.75, z - 1.6, { y: 0.36 + Math.floor(i / 2) * 0.7, slot: 'cloth', s: 0.62, ry: i * 0.2 });
      break;
    case 'emporium':
      r = W.falseFront(b, x, z, { ...o, h: 6.2, top: 8.6, floors: 2, parapet: 'scroll', paint: 'mustard', door: 'double', windows: 2, awning: true, porch: { d: 2.6, h: 3.1 }, balcony: false, shutters: 'pom2' });
      W.barrel(b, x - 5, z - 2.8, { y: 0.36 }); W.barrel(b, x - 4.2, z - 2.9, { y: 0.36, slot: 'wood2' }); W.crate(b, x + 5, z - 2.6, { y: 0.36 });
      break;
    case 'hatter':
      r = W.falseFront(b, x, z, { ...o, h: 4.4, top: 7.0, parapet: 'arched', paint: 'rose', door: 'single', windows: 2, awning: true, porch: { d: 2.4, h: 2.9 } });
      { const M = new THREE.Matrix4().makeRotationY(Math.PI).setPosition(x, 4.4 + 0.2, z + 3); giantHat(b, M); }
      break;
    case 'hotel':
      r = W.falseFront(b, x, z, { ...o, h: 9.2, top: 11.4, floors: 3, parapet: 'stepped', paint: 'cream', door: 'double', windows: 2, porch: { d: 2.8, h: 3.2 }, balcony: true, shutters: 'pom2', curtain: 'red' });
      for (let i = 0; i < Math.round(f.w / 2.6); i++) W.windowW(b, -f.w / 2 + 0.2 + (f.w - 0.4) / Math.round(f.w / 2.6) * (i + 0.5), 6.4, 0.05, { parent: r.M, w: 0.9, h: 1.3, trim: 'pomTrim', shutters: 'pom2', curtain: 'red' });
      break;
    case 'opera':
      r = W.falseFront(b, x, z, { ...o, h: 7.2, top: 10.2, floors: 2, parapet: 'arched', paint: 'plum', door: 'double', windows: 2, porch: { d: 2.6, h: 3.4 }, balcony: false, curtain: 'red' });
      for (const s of [-1, 1]) for (const k of [0.25, 0.42]) b.cyl('cream', s * f.w * k, 0.36, 2.0, 0.22, 3.0, 0, { parent: r.M, sides: 10, taper: 0.92 });
      sb && sb.board('TONIGHT:\nMR POMFREY SINGS', -f.w * 0.33, 1.6, 0.4, 1.6, 1.1, { parent: r.M, style: 'poster' });
      break;
    case 'gazette':
      r = W.falseFront(b, x, z, { ...o, w: f.w - 0.4, h: 4.0, top: 6.0, parapet: 'flat', paint: 'slate', door: 'single', doorX: -2, windows: 1, porch: { d: 2.4, h: 2.9 } });
      for (let i = 0; i < 4; i++) b.slab('cream', 1.8 + (i % 2) * 0.1, 0.36 + i * 0.12, 1.2, 0.7, 0.12, 0.5, { parent: r.M, round: 0.02, taper: 0, ry: i * 0.3 });
      break;
    case 'assay':
      r = W.falseFront(b, x, z, { ...o, h: 4.2, top: 5.9, parapet: 'stepped', paint: 'stone', door: 'single', windows: 2, porch: { d: 2.4, h: 2.9 } });
      break;
    case 'hall':
      r = W.falseFront(b, x, z, { ...o, h: 6.6, top: 8.6, floors: 2, parapet: 'gabled', paint: 'cream', door: 'double', windows: 2, porch: { d: 2.8, h: 3.2 }, balcony: true, shutters: 'red', text: 'TOWN HALL', signStyle: 'civic' });
      { // clock cupola + flag
        const M = r.M;
        b.slab('cream', 0, 8.0, -2.5, 2.6, 2.6, 2.6, { parent: M, round: 0.08, taper: 0.03, surf: kit_clap() });
        b.cyl('cream', 0, 9.3, -1.2, 0.85, 0.14, 0, { parent: M, rx: Math.PI / 2, sides: 14, taper: 1 });
        b.slab('dark', 0.0, 9.3, -1.04, 0.07, 0.6, 0.03, { parent: M, round: 0.01, taper: 0, noAo: true });
        b.slab('dark', 0.18, 9.3, -1.04, 0.42, 0.06, 0.03, { parent: M, round: 0.01, taper: 0, noAo: true, rz: 0.5 });
        b.hip('red', 0, 10.6, -2.5, 3.0, 1.6, 3.0, 0, { parent: M });
        b.cyl('iron', 0, 12.1, -2.5, 0.04, 2.4, 0, { parent: M, sides: 4 });
        b.slab('red', 0.55, 13.6, -2.5, 1.1, 0.6, 0.02, { parent: M, round: 0.01, taper: 0, sway: 0.15 });
      }
      break;
    default:
      r = W.falseFront(b, x, z, { ...o, h: 4.2, top: 6.2 });
  }
  if (SHORT[f.id] && r) W.hangingSign(b, r.hang.x - 0.6, r.hang.y, r.hang.z, { parent: r.M, w: 1.5, h: 0.72, skin, signs: sb, text: SHORT[f.id], style: civic ? 'civic' : 'pomfrey' });
  if (!civic && r && r.porch && f.style !== 'emporium' && f.style !== 'hatter') {
    const y = r.porch.h + 0.2, zz = z - r.porch.d + 0.25;
    W.bunting(b, [x - f.w / 2 + 0.4, y, zz], [x + f.w / 2 - 0.4, y, zz], { sag: 0.35, colors: ['pom', 'pomTrim', 'pomCream'] });
  }
  return r;
}
const kit_clap = () => 0.1;

function giantHat(b, M) {
  const s = 1.6;
  const H = M.clone().multiply(new THREE.Matrix4().makeScale(s, s, s));
  b.cyl('pom2', 0, 0, 0, 1.05, 0.12, 0, { parent: H, sides: 16, taper: 1 });
  b.cyl('pom2', 0, 0.1, 0, 0.6, 1.25, 0, { parent: H, sides: 16, taper: 1.06 });
  b.cyl('pomTrim', 0, 0.16, 0, 0.62, 0.2, 0, { parent: H, sides: 16, taper: 1 });
  b.cyl('pom2', 0, 1.33, 0, 0.64, 0.06, 0, { parent: H, sides: 16, taper: 0.94 });
}

function church(b, x, z, signs) {
  const M = new THREE.Matrix4().makeRotationY(-Math.PI / 2).setPosition(x, 0, z);
  const r = W.falseFront(b, 0, 0, { parent: M, w: 9, d: 13, h: 5.4, top: 8.6, parapet: 'gabled', paint: 'white', skin: 'civic', door: 'double', windows: 2, porch: { d: 2.4, h: 3.0 }, sign: false, lamps: true, roofSlot: 'roof2' });
  b.slab('white', 0, 7.2, -1.6, 3.0, 4.2, 3.0, { parent: M, round: 0.08, taper: 0.02, surf: 0.1 });
  b.slab('trim', 0, 11.3, -1.6, 3.3, 0.25, 3.3, { parent: M, round: 0.05, taper: 0 });
  b.slab('dark', 0, 9.0, -0.08, 1.1, 1.6, 0.06, { parent: M, round: 0.3, taper: 0, noAo: true });
  b.ball('brass', 0, 9.5, 0.1, 0.38, { parent: M, sy: 1.1, sz: 0.8, detail: 1 });
  b.cone('roof2', 0, 11.5, -1.6, 2.2, 5.2, Math.PI / 4, { parent: M, sides: 4, curve: 1.0 });
  b.slab('brass', 0, 16.6, -1.6, 0.1, 1.2, 0.1, { parent: M, round: 0.02, taper: 0 });
  b.slab('brass', 0, 17.3, -1.6, 0.6, 0.1, 0.1, { parent: M, round: 0.02, taper: 0 });
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) W.windowW(b, s * 4.56, 1.4, -2.5 - i * 3.4, { parent: M.clone().multiply(new THREE.Matrix4().makeRotationY(s * Math.PI / 2)), w: 0.8, h: 2.0, trim: 'trim' });
  signs.board('DRIBBLE CREEK\nCHAPEL', 0, 6.25, 0.24, 4.2, 1.1, { parent: M, style: 'civic' });
  return r;
}

function bootHill(b, BH, signs) {
  const { x, z, r, h } = BH;
  b.add(mound(r, h), 'grass', { x, y: -0.15, z, surf: 0.25, noAo: true });
  const n = 18;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    if (Math.abs(Math.sin(a)) > 0.92 && Math.cos(a) < 0) continue;
    const a2 = ((i + 1) / n) * Math.PI * 2;
    W.rail(b, x + Math.cos(a) * r * 0.96, z + Math.sin(a) * r * 0.96, x + Math.cos(a2) * r * 0.96, z + Math.sin(a2) * r * 0.96, { y: 0.05, span: 4, rails: [0.6], h: 0.8 });
  }
  const gx = x - r * 0.98, gz = z;
  for (const s of [-1, 1]) b.slab('woodDark', gx, 0, gz + s * 1.3, 0.2, 3.0, 0.2, { round: 0.03, taper: 0.06 });
  b.slab('wood2', gx, 2.7, gz, 0.16, 0.18, 3.2, { round: 0.03, taper: 0 });
  signs.board('BOOT HILL', gx - 0.1, 2.35, gz, 2.2, 0.6, { ry: -Math.PI / 2, style: 'none', back: true });
  b.slab('wood2', gx - 0.02, 2.06, gz, 0.1, 0.62, 2.24, { round: 0.02, taper: 0 });
  // a dead tree and a lone buzzard perch
  const T = new THREE.Matrix4().setPosition(x + r * 0.35, h * 0.85, z - r * 0.4);
  b.cyl('woodDark', 0, 0, 0, 0.28, 3.4, 0, { parent: T, sides: 6, taper: 0.5, rz: 0.1 });
  b.slab('woodDark', 0.6, 2.6, 0, 1.6, 0.14, 0.14, { parent: T, round: 0.04, taper: 0.4, rz: 0.5 });
  b.slab('woodDark', -0.5, 2.0, 0.1, 1.2, 0.12, 0.12, { parent: T, round: 0.04, taper: 0.4, rz: -0.6 });
  const pre = [[-0.4, 0.3, 'cross'], [-0.1, -0.45, 'stone'], [0.25, 0.4, 'board'], [-0.55, -0.1, 'cross'], [0.15, -0.1, 'cross']];
  for (const [u, v, kind] of pre) {
    const gxp = x + u * r, gzp = z + v * r, y = moundY(Math.hypot(u, v), h);
    W.grave(b, gxp, gzp, { y, kind, ry: -Math.PI / 2 + (u * 7 % 0.4) });
  }
}

const moundY = (t, h) => Math.max(0, h * Math.pow(Math.max(0, 1 - t * t), 1.4)) - 0.15;
function mound(r, h) {
  const g = new THREE.CircleGeometry(r * 1.05, 24, 0, Math.PI * 2);
  g.rotateX(-Math.PI / 2);
  let geo = new THREE.SphereGeometry(1, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2); if (geo.index) geo = geo.toNonIndexed();
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), t = Math.hypot(x, z);
    p.setXYZ(i, x * r * 1.05, moundY(t, h) + 0.15, z * r * 1.05);
  }
  geo.deleteAttribute('uv');
  geo.computeVertexNormals();
  void g;
  return geo;
}

// Boot Hill graves: instanced crosses on fixed slots up the hill. setCount(n) shows the first n (state.graves.length).
function graveField(kit, pal, BH) {
  const b = kit.builder(pal, { seed: 3131 });
  W.grave(b, 0, 0, { kind: 'cross', tilt: 0.04 });
  const max = 40;
  const mesh = new THREE.InstancedMesh(b.geometry(), kit.materials.uber, max);
  mesh.name = 'town:graves';
  mesh.castShadow = true; mesh.receiveShadow = true;
  const slots = [];
  for (let ring = 0; slots.length < max; ring++) {
    const rr = 0.18 + ring * 0.13, n = Math.round(6 + ring * 5);
    for (let i = 0; i < n && slots.length < max; i++) {
      const a = (i / n) * Math.PI * 2 + ring * 0.7;
      const u = Math.cos(a) * rr, v = Math.sin(a) * rr;
      if (Math.hypot(u + 0.4, v - 0.3) < 0.12 || Math.hypot(u + 0.1, v + 0.45) < 0.12) continue;
      slots.push([BH.x + u * BH.r, moundY(Math.hypot(u, v), BH.h), BH.z + v * BH.r, -Math.PI / 2 + ((i * 13) % 7 - 3) * 0.05]);
    }
  }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _y = new THREE.Vector3(0, 1, 0);
  let shown = -1;
  const api = {
    mesh, slots,
    setCount(n) {
      n = Math.max(0, Math.min(max, n | 0));
      if (n === shown) return;
      shown = n;
      for (let i = 0; i < max; i++) {
        const s = slots[i];
        if (i < n) mesh.setMatrixAt(i, _m.compose(_p.set(s[0], s[1], s[2]), _q.setFromAxisAngle(_y, s[3]), _s.setScalar(1)));
        else mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.visible = n > 0;
    },
  };
  api.setCount(0);
  return api;
}

function arch(b, x, z, signs) {
  for (const s of [-1, 1]) {
    b.slab('woodDark', x, 0, z + s * 5.4, 0.36, 5.6, 0.36, { round: 0.06, taper: 0.06 });
    W.barrel(b, x + 0.7, z + s * 5.6, { s: 0.9 });
    W.cactus(b, x - 1.5, z + s * 7.5, { s: 0.7, arms: 1 });
  }
  b.slab('wood2', x, 5.2, z, 0.28, 0.3, 11.8, { round: 0.05, taper: 0 });
  b.slab('wood', x, 4.05, z, 0.16, 1.0, 6.4, { round: 0.04, taper: 0, noAo: true });
  signs.board('DRIBBLE CREEK', x - 0.09, 4.55, z, 6.2, 0.95, { ry: -Math.PI / 2, style: 'civic', back: true });
  b.ball('bone', x - 0.1, 5.6, z, 0.38, { sx: 0.5, sy: 0.7, sz: 1.2, detail: 1 });
  for (const s of [-1, 1]) b.cone('bone', x - 0.1, 5.75, z + s * 0.5, 0.08, 0.7, 0, { rz: 0, rx: s * 1.1, sides: 5 });
}

function outhouse(b, x, z, ry) {
  const M = new THREE.Matrix4().makeRotationY(ry).setPosition(x, 0, z);
  b.contact(0, 0, 1.3, 1.3, { parent: M, k: 0.7 });
  b.slab('wood2', 0, 0, 0, 1.1, 2.1, 1.1, { parent: M, round: 0.04, taper: 0.04, surf: 0.18, rz: 0.03 });
  b.slab('roof2', 0, 2.08, -0.05, 1.35, 0.1, 1.4, { parent: M, round: 0.03, taper: 0, rx: -0.15 });
  b.slab('woodDark', 0, 1.6, 0.56, 0.18, 0.28, 0.02, { parent: M, round: 0.05, taper: 0, noAo: true });
}

export function rngOf(seed) {
  let a = (Math.floor(seed * 1000) ^ 0x9e3779b9) >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
