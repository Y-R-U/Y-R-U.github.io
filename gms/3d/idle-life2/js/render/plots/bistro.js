// 🍝 Bistro: a brick bistro with an open pass-through kitchen. The chef tosses a flaming pan, plates land on the pass,
// a waiter carries them to candlelit tables under string lights. L1 bistro → L25 terrace → L100 rooftop dining.
import * as THREE from 'three';
import { extras, lights } from './fishchips.js?v=20261004b';
import { nightSign, blade } from './boutique.js?v=20261004b';

export default function buildPlot(kit, { line, palette, rng }) {
  const P = kit.plot({
    id: 'bistro', line, palette, rng, seed: 61,
    colors: {
      accent: '#f2c14e', stock: '#f6f1e7', brick: '#e6a491', brick2: '#d8907c', cream: '#fbf1e0', wine: '#d9707a', ink: '#4a3f50', sage: '#9cc2a4',
      steel: { c: '#c8ccd2', r: 0.3, m: 0.7 }, copper: { c: '#d08a5a', r: 0.3, m: 0.85 }, tile: '#eae6dc', heat: { c: '#ff9a4a', r: 0.4, g: 1.4 },
      candle: { c: '#ffd27a', r: 0.4, g: 2.2 }, pasta: '#f4cf6a', sauce: '#d9483c', basil: '#5aa35a', cloth: '#fbf6ee', check: '#e58a86',
      lantern: { c: '#ffc46b', r: 0.4, g: -2.2 }, flame: { c: '#ffb347', r: 0.5, g: 2.6 }, flame2: { c: '#ffe08a', r: 0.5, g: 3 },
    },
  });
  const { b, t1, t2, lot, props: K } = P;
  const S = kit.shape;
  const BX = -0.4, BZ = -6.6, W = 9.2, D = 5.0, H = 3.7, FZ = BZ + D / 2;
  const KX0 = BX - 4.25, KX1 = BX + 0.9;
  const TABLES = [[-6.7, -5.0], [1.3, -2.1]];
  const TABLES2 = [[3.6, -2.4], [6.4, -3.2]];

  building(b);
  blade(kit, b, BX - W / 2 - 0.55, 2.4, FZ - 0.35, 0, { board: '#3a3040', a: '#ff5a6a', b: '#ffd36a', icon: 'glass' });
  for (const [x, z] of TABLES) candleTable(b, x, z);
  for (const [x, z] of [[-5.4, -2.2], [5.0, -4.4]]) K.planter(b, x, z, { s: 1.0, flowers: true, pot: 'wine' });
  lights(b, [KX0, H - 0.2, FZ + 0.1], [-6.0, 2.6, -0.9], 9, 0.35);
  lights(b, [KX1, H - 0.2, FZ + 0.1], [2.2, 2.6, -0.8], 7, 0.3);
  b.cyl('ink', -6.0, 0, -0.9, 0.05, 2.7, 0, { sides: 5 });
  b.cyl('ink', 2.2, 0, -0.8, 0.05, 2.7, 0, { sides: 5 });

  // L25: terrace: planter boxes, heater, a big parasol, more string lights
  {
    for (const [x, z] of [[-3.6, -1.0], [-0.6, -1.0]]) planterBox(t1, x, z);
    heater(t1, -7.8, -3.4);
    K.umbrella(t1, 6.4, -3.2, { c: 'wine', r: 1.3 });
    lights(t1, [2.2, 2.6, -0.8], [6.4, 2.25, -3.2], 7, 0.3);
  }

  // L100: rooftop dining: pergola with lights, tables and a little rooftop garden
  {
    const y = H + 3.2;
    for (const x of [BX - 3.6, BX - 0.6, BX + 2.4]) for (const z of [BZ - 1.4, BZ + 1.6]) t2.cyl('cream', x, y, z, 0.07, 2.3, 0, { sides: 7, taper: 1 });
    for (const z of [BZ - 1.4, BZ + 1.6]) t2.slab('cream', BX - 0.6, y + 2.3, z, 6.4, 0.14, 0.16, { round: 0.04 });
    for (let i = 0; i < 9; i++) t2.slab('wood', BX - 3.6 + i * 0.75, y + 2.44, BZ + 0.1, 0.1, 0.1, 3.4, { round: 0.03 });
    lights(t2, [BX - 3.6, y + 2.25, BZ + 1.6], [BX + 2.4, y + 2.25, BZ + 1.6], 11, 0.3);
    for (const [x, z] of [[BX - 2.2, BZ + 0.4], [BX + 1.0, BZ + 0.2]]) { K.table(t2, x, z, { c: 'cloth', chair: 'wine', parent: S.matrix({ pos: [0, y, 0] }) }); t2.cyl('candle', x, y + 0.78, z, 0.03, 0.08, 0, { sides: 5 }); }
    for (let i = 0; i < 4; i++) K.bush(t2, BX - 4.0 + i * 0.6, BZ - 1.9, { s: 0.6, flowers: i % 2 === 0, y });
  }

  // For sale
  lot.slab('stone', BX, 0, BZ, W, 0.3, D, { round: 0.06 });
  lot.slab('#d9b3a6', BX, 0.3, BZ, W - 0.3, 3.2, D - 0.3, { round: 0.12 });
  lot.slab('#f1e6d2', BX - 1.6, 0.8, FZ - 0.1, 3.4, 2.0, 0.06, { round: 0.03 });
  K.signPost(lot, BX + 2.6, FZ + 1.2, { c: 'white', w: 1.0 });
  lot.ball('accent', BX + 2.6, 1.45, FZ + 1.32, 0.12, { detail: 0 });

  // Chef's pan (toss) and its flame burst
  const PX = BX - 1.9, PZ = FZ - 0.95;
  const pan = P.dynamic((d) => {
    d.cyl('ink', 0, 0, 0, 0.26, 0.07, 0, { sides: 11, taper: 1.15 });
    d.slab('ink', 0.42, 0.05, 0, 0.42, 0.04, 0.06, { round: 0.02 });
    for (let i = 0; i < 4; i++) d.ball('pasta', Math.cos(i * 1.6) * 0.1, 0.08, Math.sin(i * 1.6) * 0.1, 0.08, { detail: 0 });
  }, { tier: 0 });
  const flame = P.dynamic((d) => {
    d.ball('flame', 0, 0.25, 0, 0.32, { sy: 1.4, detail: 1 });
    d.ball('flame2', 0.05, 0.2, 0.05, 0.18, { sy: 1.5, detail: 0 });
    d.cone('flame', -0.12, 0.45, 0, 0.12, 0.45, 0, { sides: 5 });
  }, { tier: 0, cast: false });
  flame.position.set(PX, 1.25, PZ);

  const thr = extras(kit, P, P.pal, [
    () => {},
    (e) => { for (const [x, z] of TABLES2) candleTable(e, x, z); },
    (e) => { e.slab('ink', BX + 3.0, 0, FZ + 0.9, 0.55, 1.05, 0.4, { round: 0.06, taper: 0.1 }); e.slab('copper', BX + 3.0, 1.05, FZ + 0.92, 0.6, 0.05, 0.45, { round: 0.02, rx: -0.3 }); e.slab('cloth', BX + 3.0, 1.1, FZ + 0.92, 0.35, 0.02, 0.25, { rx: -0.3 }); },
    (e) => { e.add(S.drum(11, 0.24, 0.12), 'dark', { x: 7.6, y: 0.24, z: -3.8, rx: Math.PI / 2, ry: Math.PI / 2 }); e.add(S.drum(11, 0.24, 0.12), 'dark', { x: 8.6, y: 0.24, z: -3.8, rx: Math.PI / 2, ry: Math.PI / 2 }); e.slab('wine', 8.1, 0.25, -3.8, 1.0, 0.3, 0.35, { round: 0.12 }); e.slab('wine', 8.6, 0.3, -3.8, 0.18, 0.75, 0.3, { round: 0.07, rz: -0.25 }); e.slab('#f2c14e', 7.7, 0.58, -3.8, 0.5, 0.45, 0.45, { round: 0.08 }); },
    (e) => { for (let i = 0; i < 4; i++) { const x = BX - 3.8 + i * 2.6; e.cyl('ink', x, H - 0.35, FZ + 0.25, 0.015, 0.3, 0, { sides: 3 }); e.ball('lantern', x, H - 0.55, FZ + 0.25, 0.16, { sy: 1.3, detail: 1 }); } },
  ]);
  const bst = extras(kit, P, P.pal, [
    (e) => { e.cyl('wood2', 5.6, 0, -4.4, 0.36, 0.78, 0, { sides: 11, taper: 1 }); for (const h of [0.12, 0.62]) e.cyl('ink', 5.6, h, -4.4, 0.37, 0.05, 0, { sides: 11, taper: 1, noAo: true }); for (let i = 0; i < 5; i++) { e.cyl('#3b5a3a', 5.38 + i * 0.11, 0.8, -4.4, 0.04, 0.24, 0, { sides: 5 }); e.cyl('#3b5a3a', 5.38 + i * 0.11, 1.04, -4.4, 0.015, 0.08, 0, { sides: 5 }); } },
    (e) => { e.slab('wood2', 1.8, 0.5, -3.1, 0.9, 0.06, 0.5, { round: 0.02 }); for (const s of [-1, 1]) e.add(S.drum(9, 0.1, 0.05), 'dark', { x: 1.8 + s * 0.38, y: 0.1, z: -2.85, rx: Math.PI / 2 }); e.slab('ink', 1.8, 0.1, -3.1, 0.8, 0.4, 0.04, { round: 0.01 }); for (let i = 0; i < 3; i++) e.cyl('#f4d06f', 1.55 + i * 0.25, 0.56, -3.1, 0.11, 0.12, 0, { sides: 9 }); },
    (e) => { e.cyl('cream', BX + 3.4, 1.3, FZ - 0.25, 0.04, 0.3, 0, { sides: 5 }); e.cyl('#f2a6bd', BX + 3.4, 1.6, FZ - 0.25, 0.22, 0.2, 0, { sides: 11, taper: 1 }); e.cyl('cream', BX + 3.4, 1.8, FZ - 0.25, 0.16, 0.14, 0, { sides: 11, taper: 1 }); e.ball('sauce', BX + 3.4, 1.98, FZ - 0.25, 0.05, { detail: 0 }); },
    (e) => { const y = H + 0.4, x = BX + 4.0; for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + Math.PI / 2; e.cone('gold', x + Math.cos(a) * 0.18, y + Math.sin(a) * 0.18, FZ + 0.25, 0.14, 0.42, 0, { sides: 5, rz: a - Math.PI / 2 }); } e.ball('gold', x, y, FZ + 0.25, 0.2, { sz: 0.6, detail: 0 }); },
  ]);
  const night = nightSign(kit, P, BX + 4.0, 2.4, FZ + 0.14, 0, '#ffb35c');

  const plate = kit.builder(P.pal);
  plate.cyl('cloth', 0, 0, 0, 0.5, 0.08, 0, { sides: 13, taper: 1.15 });
  plate.ball('pasta', 0, 0.12, 0, 0.32, { sy: 0.45, detail: 1 });
  plate.ball('sauce', 0.02, 0.22, 0.02, 0.17, { sy: 0.5, detail: 0 });
  plate.ball('basil', -0.1, 0.27, 0.06, 0.07, { sy: 0.4, detail: 0 });
  P.pile({ at: [BX - 0.8, 1.08, FZ - 0.05], geo: plate.geometry({ ao: 0.1, aoH: 0.3 }), size: 0.42, max: 8, layout: 'grid', cols: 8, spacing: 1.15, range: [0, 0.6] });
  P.pile({ at: [BX - 3.6, 1.08, FZ - 0.05], geo: plate.geometry({ ao: 0.1, aoH: 0.3 }), size: 0.42, max: 4, layout: 'grid', cols: 4, spacing: 1.15, range: [0.6, 1] });

  const staff = P.crowd({ count: 6, seed: 9, scale: 1.36 });
  staff.look(0, { top: '#fbf6ee', style: 1, hair: 0, skin: 1, acc: 0 }).body(0, 1.2, 0.85, 0.95);
  staff.look(1, { top: '#fbf6ee', style: 2, hair: 3, skin: 3, acc: 0 }).body(1, 1.2, 0.85, 0.92);
  staff.look(2, { top: '#3a3040', bot: '#3a3040', style: 0, hair: 4, skin: 2 }).body(2, 1.2, 0.9, 0.95);
  staff.look(3, { top: '#3a3040', bot: '#3a3040', style: 3, hair: 1, skin: 0 }).body(3, 1.2, 0.9, 0.93);
  staff.look(4, { top: '#7fb5a8', style: 0, hair: 1, skin: 0 }).body(4, 1.15, 0.85, 0.8);
  staff.look(5, { top: '#8e2b3a', style: 1, hair: 5, skin: 4 }).body(5, 1.2, 0.9, 0.92);
  const diners = P.crowd({ count: 8, seed: 27, scale: 1.36 });
  const seats = [];
  for (const [x, z] of [...TABLES, ...TABLES2]) for (const a of [0.3, 3.44]) seats.push([x + Math.cos(a) * 0.62, z + Math.sin(a) * 0.62, -a - Math.PI / 2]);
  const folk = P.crowd({ count: 3, seed: 41, scale: 1.36 });
  P.walkers(folk, { ids: [0, 1, 2], paths: [[[-12.5, 0.2], [12.5, 0.0]], [[12.5, -0.4], [-12.5, -0.2]]], speed: 1.0, loop: 'wrap', ownedOnly: false });
  let lastServe = 0;

  return Object.assign(P.done({
    w: 13.5, cardW: 13.5, d: 9, h: 6,
    camera: { pos: [-8.4, 11.4, 10.4], look: [-0.8, 2.9, -4.6], fov: 32 },
    pileAnchor: [BX - 0.8, 1.08, FZ - 0.05],
    exit: [[BX + 2.2, FZ + 0.9], [8, 0.6], [12, 3.6]],
    update(dt, stats, time, tier, ctx) {
      const owned = ctx.owned, t = time;
      const cyc = Math.max(2.4, stats?.cycleSec ?? 3);
      const ph = (t % cyc) / cyc;
      const toss = ph > 0.55 && ph < 0.85 ? Math.sin(((ph - 0.55) / 0.3) * Math.PI) : 0;
      pan.position.set(PX + 0.1, 1.2 + toss * 0.12, PZ + 0.25);
      pan.rotation.set(0, 0.3, -toss * 0.5);
      const f = ph > 0.6 && ph < 0.9 ? Math.sin(((ph - 0.6) / 0.3) * Math.PI) : 0;
      flame.visible = owned && f > 0.05;
      flame.scale.set(0.6 + f * 0.6, 0.4 + f * 1.1 + Math.sin(t * 30) * 0.08, 0.6 + f * 0.6);
      thr.show(owned ? stats?.sigmaUpgrades ?? 0 : 0);
      bst.show(owned ? stats?.boosts ?? 0 : 0);
      night.show(owned && stats?.nightActive ? 1 : 0);
      if (!owned) { for (let i = 0; i < 6; i++) staff.hide(i); for (let i = 0; i < 8; i++) diners.hide(i); return; }
      staff.set(0, PX - 0.15, 0.32, PZ - 0.15, 0, 3, 0, ph > 0.5 ? 8 : 4);
      staff.set(1, BX - 3.4, 0.32, FZ - 1.2, 0.2, 3, 1.3, 4.2);
      const nWait = (stats?.sigmaUpgrades ?? 0) >= 1 ? 2 : 1;
      for (let k = 0; k < 2; k++) {
        if (k >= nWait) { staff.hide(3); break; }
        const tab = k ? TABLES[1] : TABLES[0];
        const per = 6 + k * 1.3, u = ((t + k * 2.7) % per) / per;
        const a = [BX - 1.0 + k * 0.8, FZ + 0.55], c = [tab[0] + 0.9, tab[1] - 0.2];
        const go = u < 0.4, back = u > 0.55 && u < 0.95, s = go ? u / 0.4 : back ? 1 - (u - 0.55) / 0.4 : u <= 0.55 ? 1 : 0;
        const x = a[0] + (c[0] - a[0]) * s, z = a[1] + (c[1] - a[1]) * s;
        const h = Math.atan2(c[0] - a[0], c[1] - a[1]) + (back ? Math.PI : 0);
        staff.set(2 + k, x, 0.02, z, go || back ? h : s > 0.5 ? 0.4 : Math.PI, go ? 2 : back ? 1 : 0, k, 5);
      }
      if (stats?.kid) staff.set(4, BX + 0.4, 0.32, FZ - 1.0, 0.4, 3, 2, 4); else staff.hide(4);
      if ((stats?.sigmaUpgrades ?? 0) >= 3) staff.set(5, BX + 3.0, 0.02, FZ + 0.4, 0.2, 0, 0, 1); else staff.hide(5);
      const busy = (stats?.sigmaUpgrades ?? 0) >= 2 ? 8 : 4;
      seats.forEach(([x, z, h], i) => {
        if (i < busy) diners.set(i, x, 0.02, z, h, (Math.sin(t * 0.4 + i * 1.7) > 0.2) ? 6 : 5, i * 0.9, 2.2); else diners.hide(i);
      });
      void lastServe;
    },
  }), { focus: [-0.4, -5.0] });

  function building(B) {
    B.slab('stone', BX, 0, BZ, W + 0.3, 0.32, D + 0.3, { round: 0.06 });
    B.slab('tile', BX, 0.3, BZ, W - 0.4, 0.04, D - 0.4, { round: 0.02, taper: 0 });
    B.slab('brick', BX, 0.3, BZ - D / 2 + 0.15, W, H, 0.3, { round: 0.08, taper: 0 });
    for (const s of [-1, 1]) B.slab('brick', BX + s * (W / 2 - 0.15), 0.3, BZ, 0.3, H, D, { round: 0.1, taper: 0.01 });
    B.slab('brick', BX, 2.95, FZ - 0.15, W, H - 2.65, 0.3, { round: 0.08, taper: 0 });
    for (let r = 0; r < 7; r++) for (const s of [-1, 1]) B.slab('brick2', BX + s * (W / 2 + 0.01), 0.6 + r * 0.45, BZ - 1.2 + (r % 2) * 0.6, 0.04, 0.12, 0.7, { round: 0.02, noAo: true });
    // the kitchen: tiled back wall, copper pans, range, extractor hood, the pass
    B.slab('tile', (KX0 + KX1) / 2, 0.34, FZ - 1.95, KX1 - KX0, 2.6, 0.1, { round: 0.02, taper: 0 });
    for (let i = 0; i < 12; i++) B.slab(i % 2 ? '#d7e6e2' : 'tile', KX0 + 0.25 + i * 0.42, 1.2, FZ - 1.88, 0.38, 0.38, 0.03, { round: 0.01, noAo: true });
    B.slab('steel', (KX0 + KX1) / 2, 0.34, FZ - 1.55, KX1 - KX0 - 0.3, 0.86, 0.65, { round: 0.05 });
    for (let i = 0; i < 4; i++) B.cyl('ink', KX0 + 0.8 + i * 1.2, 1.2, FZ - 1.5, 0.2, 0.03, 0, { sides: 9 });
    B.slab('steel', (KX0 + KX1) / 2, 2.35, FZ - 1.4, KX1 - KX0 - 0.6, 0.45, 0.9, { round: 0.06, taper: -0.25 });
    for (let i = 0; i < 5; i++) B.cyl('copper', KX0 + 0.6 + i * 0.4, 1.75, FZ - 1.82, 0.13, 0.05, 0, { sides: 9, rx: Math.PI / 2 });
    B.slab('steel', (KX0 + KX1) / 2, 0.34, FZ - 0.05, KX1 - KX0, 1.0 - 0.34, 0.5, { round: 0.04 });
    B.slab('steel', (KX0 + KX1) / 2, 1.0, FZ - 0.05, KX1 - KX0 + 0.1, 0.06, 0.6, { round: 0.02, taper: 0 });
    for (let i = 0; i < 4; i++) {
      const x = KX0 + 0.7 + i * 1.25;
      B.cyl('ink', x, 2.1, FZ - 0.05, 0.015, 0.85, 0, { sides: 3 });
      B.cone('ink', x, 1.95, FZ - 0.05, 0.2, 0.18, 0, { sides: 7, rx: Math.PI });
      B.disc('heat', x, 1.8, FZ - 0.05, 0.15, 0.03);
    }
    // dining room window + door, wine awning, plate sign
    B.slab('brick', KX1 + 0.2, 0.3, FZ - 0.15, 0.4, 2.65, 0.3, { round: 0.06, taper: 0 });
    B.slab('cream', BX + 2.7, 0.3, FZ - 0.18, 3.0, 2.5, 0.12, { round: 0.04 });
    B.slab('window', BX + 2.1, 0.75, FZ - 0.1, 1.4, 1.6, 0.04, { noAo: true, g: -1 });
    for (let i = 0; i < 2; i++) B.slab('cream', BX + 2.1, 0.75 + i * 0.8, FZ - 0.07, 1.45, 0.06, 0.05, { round: 0.01 });
    K.door(B, BX + 3.6, 0.32, FZ - 0.08, { color: 'wine' });
    B.awning('wine', BX + 2.6, H - 0.1, FZ + 0.45, 3.4, 1.0, 0, { alt: 'cream', drop: 0.3 });
    B.slab('wine', (KX0 + KX1) / 2, 3.0, FZ + 0.03, KX1 - KX0 - 0.2, 0.55, 0.12, { round: 0.05 });
    B.cyl('cloth', (KX0 + KX1) / 2, 3.27, FZ + 0.12, 0.34, 0.04, 0, { sides: 11, rx: Math.PI / 2 });
    B.ball('pasta', (KX0 + KX1) / 2, 3.27, FZ + 0.16, 0.2, { sz: 0.3, detail: 0 });
    B.ball('sauce', (KX0 + KX1) / 2, 3.3, FZ + 0.2, 0.1, { sz: 0.3, detail: 0 });
    // upper storey: cream render, shuttered windows with flower boxes, a parapet; flue and plant on the roof
    B.slab('cream', BX, H + 0.0, BZ, W + 0.2, 0.3, D + 0.2, { round: 0.06 });
    B.slab('cream', BX, H + 0.3, BZ - 0.1, W - 0.2, 2.6, D - 0.4, { round: 0.1, taper: 0.015 });
    for (let i = 0; i < 4; i++) K.windowUnit(B, BX - 3.3 + i * 2.2, H + 0.95, FZ - 0.28, { w: 0.9, h: 1.25, shutter: 'wine', box: 'wine' });
    const R = H + 2.9;
    B.slab('brick', BX, R, BZ - 0.1, W, 0.25, D - 0.2, { round: 0.06 });
    for (let i = 0; i < 10; i++) B.cyl('cream', BX - W / 2 + 0.4 + i * ((W - 0.8) / 9), R + 0.25, FZ - 0.35, 0.08, 0.45, 0, { sides: 7, taper: 0.8 });
    B.slab('cream', BX, R + 0.7, FZ - 0.35, W, 0.14, 0.24, { round: 0.04 });
    B.slab('#d9cbbb', BX, R + 0.25, BZ - 0.1, W - 0.5, 0.06, D - 0.7, { round: 0.02, taper: 0 });
    B.cyl('steel', BX - 3.2, R + 0.25, BZ - 1.5, 0.22, 1.8, 0, { sides: 9, taper: 1 });
    B.cone('steel', BX - 3.2, R + 2.05, BZ - 1.5, 0.36, 0.3, 0, { sides: 9 });
    B.slab('steel', BX + 2.6, R + 0.25, BZ - 1.4, 1.2, 0.8, 0.9, { round: 0.08 });
  }

  function candleTable(B, x, z) {
    B.cyl('ink', x, 0, z, 0.25, 0.05, 0, { sides: 7 });
    B.cyl('ink', x, 0, z, 0.04, 0.72, 0, { sides: 5 });
    B.cyl('cloth', x, 0.68, z, 0.52, 0.1, 0, { sides: 13, taper: 1.05 });
    for (let i = 0; i < 6; i++) B.slab('check', x - 0.38 + i * 0.15, 0.79, z, 0.06, 0.012, 0.95, { round: 0.005, noAo: true });
    B.cyl('cream', x, 0.79, z, 0.035, 0.12, 0, { sides: 5 });
    B.ball('candle', x, 0.95, z, 0.04, { sy: 1.6, detail: 0 });
    for (const a of [0.3, 3.44]) {
      const cm = S.matrix({ pos: [x + Math.cos(a) * 0.72, 0, z + Math.sin(a) * 0.72], ry: -a - Math.PI / 2 });
      B.slab('wine', 0, 0.42, 0, 0.38, 0.05, 0.38, { parent: cm, round: 0.02 });
      B.slab('wine', 0, 0.42, -0.18, 0.38, 0.42, 0.04, { parent: cm, round: 0.02 });
      for (const lx of [-0.15, 0.15]) for (const lz of [-0.15, 0.15]) B.slab('ink', lx, 0, lz, 0.035, 0.42, 0.035, { parent: cm, round: 0.01 });
    }
    for (const a of [0.3, 3.44]) B.cyl('cloth', x + Math.cos(a) * 0.3, 0.79, z + Math.sin(a) * 0.3, 0.13, 0.02, 0, { sides: 9 });
  }

  function planterBox(B, x, z) {
    B.slab('wood2', x, 0, z, 1.6, 0.55, 0.5, { round: 0.05 });
    for (let i = 0; i < 4; i++) B.ball(i % 2 ? 'leaf' : 'leafDark', x - 0.6 + i * 0.4, 0.62, z, 0.28, { sy: 0.8, detail: 0, sway: 0.05 });
    for (let i = 0; i < 3; i++) B.ball('#f28fa0', x - 0.4 + i * 0.4, 0.82, z + 0.1, 0.07, { detail: 0 });
  }

  function heater(B, x, z) {
    B.cyl('steel', x, 0, z, 0.25, 0.1, 0, { sides: 9 });
    B.cyl('steel', x, 0.1, z, 0.05, 2.0, 0, { sides: 5 });
    B.cone('steel', x, 2.05, z, 0.5, 0.25, 0, { sides: 9 });
    B.cyl('heat', x, 1.92, z, 0.12, 0.14, 0, { sides: 7 });
  }
}
