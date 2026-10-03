// 👗 Boutique: a lilac shopfront with mannequins spinning on pedestals (outfits swap each turn) and shoppers leaving
// with gold bags. L1 shopfront → L25 second storey + spotlights → L100 flagship catwalk. Neon after dark.
import * as THREE from 'three';
import { extras, lights } from './fishchips.js?v=20261004a';

// Projecting blade sign with a neon border and icon (lit at night). icon: 'dress' | 'glass' | 'app'.
export function blade(kit, B, x, y, z, ry, { board = '#2a2440', a = '#ff7ac0', b = '#ffd36a', icon = 'dress' } = {}) {
  const M = kit.shape.matrix({ pos: [x, y, z], ry });
  const n = (c) => ({ c, r: 0.4, g: -2.6 });
  B.slab('#3a3350', 0, 0.85, -0.55, 0.08, 0.08, 1.1, { parent: M, round: 0.02 });
  B.slab('#3a3350', 0, -0.05, -0.55, 0.08, 0.08, 1.1, { parent: M, round: 0.02 });
  B.slab(board, 0, -0.1, 0, 0.12, 1.5, 0.95, { parent: M, round: 0.08 });
  for (const s of [-1, 1]) {
    B.slab(n(a), s * 0.07, -0.02, 0, 0.03, 0.05, 0.8, { parent: M, round: 0.01, noAo: true });
    B.slab(n(a), s * 0.07, 1.3, 0, 0.03, 0.05, 0.8, { parent: M, round: 0.01, noAo: true });
    B.slab(n(a), s * 0.07, 0.0, -0.4, 0.03, 1.32, 0.05, { parent: M, round: 0.01, noAo: true });
    B.slab(n(a), s * 0.07, 0.0, 0.4, 0.03, 1.32, 0.05, { parent: M, round: 0.01, noAo: true });
    const X = s * 0.075;
    if (icon === 'dress') {
      B.slab(n(b), X, 0.75, 0, 0.03, 0.3, 0.2, { parent: M, round: 0.02, noAo: true });
      B.slab(n(b), X, 0.3, -0.13, 0.03, 0.5, 0.05, { parent: M, round: 0.01, rx: -0.45, noAo: true });
      B.slab(n(b), X, 0.3, 0.13, 0.03, 0.5, 0.05, { parent: M, round: 0.01, rx: 0.45, noAo: true });
      B.slab(n(b), X, 0.22, 0, 0.03, 0.05, 0.5, { parent: M, round: 0.01, noAo: true });
    } else if (icon === 'glass') {
      B.slab(n(b), X, 0.75, 0, 0.03, 0.05, 0.42, { parent: M, round: 0.01, noAo: true });
      B.slab(n(b), X, 0.75, -0.2, 0.03, 0.3, 0.05, { parent: M, round: 0.01, rx: 0.4, noAo: true });
      B.slab(n(b), X, 0.75, 0.2, 0.03, 0.3, 0.05, { parent: M, round: 0.01, rx: -0.4, noAo: true });
      B.slab(n(b), X, 0.3, 0, 0.03, 0.45, 0.05, { parent: M, round: 0.01, noAo: true });
      B.slab(n(b), X, 0.25, 0, 0.03, 0.05, 0.36, { parent: M, round: 0.01, noAo: true });
      B.slab(n(a), X, 0.82, 0, 0.03, 0.12, 0.3, { parent: M, round: 0.02, noAo: true });
    } else {
      for (const [y2, zz, h, w] of [[0.3, 0, 0.05, 0.5], [0.95, 0, 0.05, 0.5], [0.3, -0.25, 0.7, 0.05], [0.3, 0.25, 0.7, 0.05]]) B.slab(n(b), X, y2, zz, 0.03, h, w, { parent: M, round: 0.02, noAo: true });
      B.ball(n(a), X, 0.62, 0, 0.1, { parent: M, sx: 0.3, detail: 0 });
    }
  }
}

// A small always-lit sign shown only while the line works the night shift.
export function nightSign(kit, P, x, y, z, ry = 0, col = '#ff8fd0') {
  return extras(kit, P, P.pal, [(e) => {
    const M = kit.shape.matrix({ pos: [x, y, z], ry });
    e.slab('#2a2440', 0, 0, 0, 1.1, 0.62, 0.08, { parent: M, round: 0.05 });
    e.ball({ c: '#ffe08a', g: 2.2 }, -0.22, 0.31, 0.06, 0.2, { parent: M, sz: 0.25, detail: 1 });
    e.ball('#2a2440', -0.12, 0.36, 0.08, 0.17, { parent: M, sz: 0.25, detail: 1 });
    for (let i = 0; i < 3; i++) e.slab({ c: col, g: 2.2 }, 0.22, 0.15 + i * 0.13, 0.06, 0.4 - i * 0.08, 0.04, 0.02, { parent: M, round: 0.01, noAo: true });
    for (let i = 0; i < 3; i++) e.ball({ c: '#ffe08a', g: 2 }, -0.42 + i * 0.07, 0.52 - i * 0.02, 0.06, 0.025, { parent: M, detail: 0 });
  }]);
}

export default function buildPlot(kit, { line, palette, rng }) {
  const P = kit.plot({
    id: 'boutique', line, palette, rng, seed: 51,
    colors: {
      accent: '#f2c14e', stock: '#f2c14e', shop: '#c6ecdc', shop2: '#b6e3d0', stone: '#e3d3c1', blush: '#f2b6c6', gold: { c: '#e8b84a', r: 0.3, m: 0.85 },
      cream: '#fbf3e6', ink: '#3a3350', floor: '#efe3d8', pinkBag: '#f2a6bd', velvet: '#b8325a', glassS: { c: '#bcd2e6', r: 0.08, m: 0.2 },
      neonP: { c: '#ff7ac0', r: 0.4, g: -2.4 }, neonG: { c: '#ffd36a', r: 0.4, g: -2.4 }, spot: { c: '#fff4cc', r: 0.3, g: -2 },
    },
  });
  const { b, t1, t2, lot, props: K } = P;
  const S = kit.shape;
  const BX = -0.8, BZ = -6.2, W = 8.6, D = 5.0, H = 3.9, FZ = BZ + D / 2;
  const MAN = [[-3.9, FZ - 0.7], [-2.6, FZ - 0.95], [-1.3, FZ - 0.7]];

  shop(b);
  blade(kit, b, BX - W / 2 - 0.55, 2.0, FZ - 0.35, 0);
  for (const [x, z] of MAN) {
    b.cyl('gold', x, 0.32, z, 0.3, 0.1, 0, { sides: 11, taper: 0.96 });
    b.cyl('gold', x, 0.42, z, 0.025, 1.4, 0, { sides: 5, taper: 1 });
    b.ball('cream', x, 1.98, z, 0.15, { detail: 1, smooth: true, sy: 1.15 });
    b.cyl('cream', x, 1.74, z, 0.05, 0.16, 0, { sides: 7, taper: 0.9 });
  }
  topiary(b, BX - 0.35, FZ + 0.75);
  topiary(b, BX + 4.55, FZ + 0.75);
  K.bench(b, -6.9, -5.3, { ry: 0.2 });
  K.planter(b, -8.3, -5.6, { s: 1.0, flowers: true, pot: 'gold' });
  table(b, 5.6, -3.0);

  // L25: balcony across the upper floor, window awnings, flag poles
  {
    const y = H + 0.3;
    t1.slab('stone', BX, y + 0.05, FZ + 0.32, 5.2, 0.14, 0.8, { round: 0.04 });
    for (let i = 0; i < 13; i++) t1.cyl('gold', BX - 2.5 + i * 0.415, y + 0.19, FZ + 0.66, 0.025, 0.72, 0, { sides: 5, taper: 1 });
    t1.slab('gold', BX, y + 0.9, FZ + 0.66, 5.1, 0.06, 0.06, { round: 0.02 });
    for (let i = 0; i < 4; i++) t1.awning('blush', BX - 3.0 + i * 2.0, y + 1.95, FZ + 0.12, 1.25, 0.5, 0, { alt: 'cream', drop: 0.18, stripes: 5 });
    for (const s of [-1, 1]) { t1.ball('leaf', BX + s * 1.6, y + 0.35, FZ + 0.55, 0.28, { sy: 0.7, detail: 0 }); t1.ball('#f2a6bd', BX + s * 1.6 + 0.12, y + 0.48, FZ + 0.62, 0.08, { detail: 0 }); }
  }

  // L100: flagship catwalk with velvet ropes and a ring of stage lights
  {
    const x = -5.6, z = -1.9;
    t2.slab('ink', x, 0, z, 5.2, 0.35, 1.2, { round: 0.08 });
    t2.slab('#f6f1f8', x, 0.35, z, 5.0, 0.04, 1.0, { round: 0.02, noAo: true });
    for (let i = 0; i < 8; i++) t2.ball({ c: '#fff4cc', g: 1.4 }, x - 2.3 + i * 0.66, 0.4, z + 0.52, 0.05, { detail: 0 });
    for (let i = 0; i < 4; i++) { t2.cyl('gold', x - 2.4 + i * 1.6, 0, z + 1.2, 0.04, 0.85, 0, { sides: 5 }); t2.ball('gold', x - 2.4 + i * 1.6, 0.88, z + 1.2, 0.07, { detail: 0 }); }
    for (let i = 0; i < 3; i++) t2.cyl('velvet', x - 1.6 + i * 1.6, 0.62, z + 1.2, 0.03, 1.62, 0, { sides: 5, rz: -Math.PI / 2, taper: 1 });
    for (const s of [-1, 1]) { t2.cyl('ink', x + s * 2.7, 0, z - 0.4, 0.05, 2.6, 0, { sides: 5 }); t2.cyl('ink', x + s * 2.7, 2.5, z - 0.2, 0.16, 0.4, 0, { sides: 7, rx: 0.7 }); t2.disc('spot', x + s * 2.7, 2.62, z, 0.13, 0.03, { rx: 0.7 }); }
    lights(t2, [x - 2.7, 2.6, z - 0.4], [x + 2.7, 2.6, z - 0.4], 11, 0.35, { c: { c: '#fff4cc', g: 1.4 } });
  }

  // For sale: papered windows
  lot.slab('stone', BX, 0, BZ, W, 0.3, D, { round: 0.06 });
  lot.slab('#d8ccd8', BX, 0.3, BZ, W - 0.3, 3.4, D - 0.3, { round: 0.12 });
  lot.slab('#f1e6d2', BX - 1.6, 0.8, FZ - 0.1, 3.4, 2.0, 0.06, { round: 0.03 });
  K.signPost(lot, BX + 2.6, FZ + 1.2, { c: 'white', w: 1.0 });
  lot.ball('accent', BX + 2.6, 1.45, FZ + 1.32, 0.12, { detail: 0 });

  // Mannequin dresses: one instanced draw, colour swaps every turn
  const dress = kit.builder(P.pal);
  dress.cyl('#ffffff', 0, 0.55, 0, 0.36, 0.62, 0, { sides: 11, taper: 0.42 });
  dress.slab('#ffffff', 0, 1.12, 0, 0.36, 0.5, 0.24, { round: 0.1, taper: -0.15 });
  dress.ball('#ffffff', 0, 1.18, -0.14, 0.11, { sx: 1.8, sy: 0.8, detail: 0 });
  dress.slab('#ffffff', 0, 1.0, 0.0, 0.42, 0.09, 0.3, { round: 0.04 });
  dress.cyl('#ffffff', 0.18, 1.4, 0, 0.05, 0.25, 0, { sides: 5, rz: -0.5 });
  dress.cyl('#ffffff', -0.18, 1.4, 0, 0.05, 0.25, 0, { sides: 5, rz: 0.5 });
  const dm = new THREE.InstancedMesh(dress.geometry({ ao: 0.12, aoH: 1.2 }), kit.materials.uber, 3);
  dm.castShadow = true;
  P.group.add(dm);
  const OUT = ['#e44b6a', '#f2c14e', '#7fb2b0', '#bba8cf', '#f6f1f8', '#3a3350', '#f29a5c', '#8fc7e8'];
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _c = new THREE.Color(), _y = new THREE.Vector3(0, 1, 0);
  const spin = MAN.map((_, i) => ({ a: i * 2.1, k: i * 3, turns: 0 }));
  spin.forEach((s, i) => dm.setColorAt(i, _c.set(OUT[s.k % OUT.length])));

  const thr = extras(kit, P, P.pal, [
    () => {},
    (e) => { e.slab('cream', 6.2, 0, -6.4, 1.6, 2.5, 1.4, { round: 0.1 }); e.slab('blush', 6.2, 0.15, -5.68, 1.3, 2.1, 0.06, { round: 0.03 }); for (let i = 0; i < 5; i++) e.slab('#e89aae', 5.65 + i * 0.27, 0.15, -5.62, 0.12, 2.1, 0.05, { round: 0.03 }); e.slab('gold', 6.2, 2.5, -6.4, 1.7, 0.1, 1.5, { round: 0.03 }); },
    (e) => { e.cyl('ink', BX + 2.0, 0, FZ + 0.6, 0.04, 1.0, 0, { sides: 5 }); e.slab('ink', BX + 2.0, 1.0, FZ + 0.6, 0.22, 0.32, 0.08, { round: 0.03, rx: -0.4 }); e.slab({ c: '#7fe0c0', g: 1.2 }, BX + 2.0, 1.12, FZ + 0.65, 0.16, 0.12, 0.02, { rx: -0.4, noAo: true }); },
    (e) => { kit.vehicles.van(e, 8.6, -1.8, Math.PI, 'blush'); e.slab('gold', 8.6, 1.95, -1.8, 1.3, 0.06, 1.2, { round: 0.02 }); },
    (e) => { e.slab('#3a3350', 6.6, 0, -4.4, 0.12, 2.6, 0.12, { round: 0.03 }); e.slab('#3a3350', 6.6, 2.2, -4.35, 1.6, 1.0, 0.12, { round: 0.06 }); e.slab({ c: '#8fd4ff', g: 1.4 }, 6.6, 2.3, -4.27, 1.45, 0.85, 0.02, { noAo: true }); },
  ]);
  const bst = extras(kit, P, P.pal, [
    (e) => { e.cyl('ink', -2.6, H - 0.3, FZ - 0.9, 0.01, 0.4, 0, { sides: 3 }); e.ball({ c: '#e8eef6', r: 0.1, m: 0.9 }, -2.6, H - 0.55, FZ - 0.9, 0.22, { detail: 1 }); },
    (e) => { e.slab('gold', 3.4, 0, -2.6, 1.2, 0.08, 0.6, { round: 0.02 }); for (let i = 0; i < 5; i++) e.cyl(OUT[i], 2.95 + i * 0.22, 0.1, -2.6, 0.11, 0.9, 0, { sides: 9, taper: 1 }); },
    (e) => { for (const s of [-0.25, 0.25]) e.slab('ink', 7.4 + s, 0, -3.8, 0.04, 1.3, 0.04, { round: 0.01, rz: s * 0.6 }); e.slab('ink', 7.4, 1.25, -3.8, 0.35, 0.25, 0.25, { round: 0.05 }); e.cyl('ink', 7.6, 1.35, -3.6, 0.08, 0.15, 0, { sides: 7, rx: Math.PI / 2 }); e.ball('white', 7.9, 1.9, -3.9, 0.45, { sy: 0.5, sz: 0.2, ry: 0.6, detail: 1 }); },
    (e) => { e.cyl('gold', BX + 0.9, H + 0.1, FZ + 0.1, 0.05, 0.6, 0, { sides: 5 }); for (let i = 0; i < 5; i++) e.cone('gold', BX + 0.45 + i * 0.22, H + 0.65, FZ + 0.1, 0.09, 0.38 - Math.abs(i - 2) * 0.08, 0, { sides: 5 }); e.slab('gold', BX + 0.9, H + 0.55, FZ + 0.1, 1.2, 0.18, 0.18, { round: 0.05 }); },
  ]);
  const night = nightSign(kit, P, BX + 3.3, 2.75, FZ + 0.12);

  const bag = kit.builder(P.pal);
  bag.slab('#ffffff', 0, 0, 0, 0.7, 0.8, 0.36, { round: 0.06, taper: 0.06 });
  bag.slab('#ffffff', 0, 0.78, 0, 0.72, 0.06, 0.38, { round: 0.02 });
  for (const s of [-1, 1]) bag.cyl('ink', s * 0.14, 0.8, 0, 0.025, 0.26, 0, { sides: 5, taper: 1, rz: s * 0.5 });
  const bagGeo = bag.geometry({ ao: 0.15, aoH: 0.5 });
  const tint = (g, c) => { const k = S.rgb(c), a = g.clone(), col = a.attributes.color; for (let i = 0; i < col.count; i++) { const r = col.getX(i), gg = col.getY(i), bb = col.getZ(i); if (r > 0.5 && gg > 0.5 && bb > 0.5) col.setXYZ(i, k[0] * r, k[1] * gg, k[2] * bb); } return a; };
  P.pile({ at: [5.6, 0.82, -3.0], geo: tint(bagGeo, '#f2c14e'), size: 0.42, max: 6, cols: 3, layout: 'pyramid', range: [0, 0.5] });
  P.pile({ at: [BX + 3.4, 0.0, FZ - 0.6], geo: tint(bagGeo, '#f2a6bd'), size: 0.5, max: 6, cols: 3, layout: 'pyramid', range: [0.5, 1] });

  const staff = P.crowd({ count: 5, seed: 5, scale: 1.36 });
  staff.look(0, { top: '#3a3350', style: 1, hair: 4, skin: 1 }).body(0, 1.2, 0.9, 0.95);
  staff.look(1, { top: '#f2b6c6', style: 3, hair: 2, skin: 3 }).body(1, 1.2, 0.9, 0.92);
  staff.look(2, { top: '#f6f1f8', bot: '#3a3350', style: 0, hair: 3, skin: 2 }).body(2, 1.12, 1.05, 1.0);
  staff.look(3, { top: '#7fb5a8', style: 0, hair: 1, skin: 0 }).body(3, 1.15, 0.85, 0.8);
  staff.look(4, { top: '#3a3350', style: 2, hair: 0, skin: 4 }).body(4, 1.2, 0.9, 0.92);
  const folk = P.crowd({ count: 7, seed: 19, scale: 1.36 });
  const q = P.queue(folk, {
    ids: [0, 1, 2, 3, 4, 5], spawn: [[12.5, -1.4], [-12.5, -1.6]], counter: [BX + 1.0, FZ + 0.65], dir: [1, -0.04], gap: 0.85, faceCounter: Math.PI,
    exit: [[BX - 0.6, FZ + 1.1], [-6, -2.6], [-12.5, -2.2]],
    serve: (s) => Math.max(1.6, Math.min(3.6, s?.cycleSec ?? 2.5)),
  });
  void q;

  return Object.assign(P.done({
    w: 13.5, cardW: 13.5, d: 9, h: 6,
    camera: { pos: [-8.8, 12.2, 10.8], look: [-0.8, 3.7, -4.6], fov: 32 },
    exit: [[BX + 0.2, FZ + 1.3], [-6, -2.2], [-12.5, -1.4]],
    update(dt, stats, time, tier, ctx) {
      const owned = ctx.owned, vt = ctx.vt, t = time;
      dm.visible = owned;
      for (let i = 0; i < MAN.length; i++) {
        const s = spin[i];
        s.a += dt * 0.9;
        if (s.a > Math.PI * 2) { s.a -= Math.PI * 2; s.k++; dm.setColorAt(i, _c.set(OUT[s.k % OUT.length])); dm.instanceColor.needsUpdate = true; }
        _m.compose(_p.set(MAN[i][0], 0.42, MAN[i][1]), _q.setFromAxisAngle(_y, s.a), _s);
        dm.setMatrixAt(i, _m);
      }
      dm.instanceMatrix.needsUpdate = true;
      thr.show(owned ? stats?.sigmaUpgrades ?? 0 : 0);
      bst.show(owned ? stats?.boosts ?? 0 : 0);
      night.show(owned && stats?.nightActive ? 1 : 0);
      if (owned) {
        staff.set(0, BX + 1.1, 0.02, FZ + 0.15, 0, q.serving() ? 3 : 0, 0, 4);
        if ((stats?.sigmaUpgrades ?? 0) >= 1) staff.set(1, BX - 2.6, 0.02, FZ + 0.9, 0.3, 7, 0.4, 2.5); else staff.hide(1);
        if (vt >= 2) {
          const u = (t * 0.18) % 2, k = u < 1 ? u : 2 - u;
          staff.set(2, -5.6 - 2.1 + k * 4.2, 0.38, -1.9, u < 1 ? Math.PI / 2 : -Math.PI / 2, k > 0.97 || k < 0.03 ? 0 : 1, 0, 4.4);
        } else staff.hide(2);
        if (stats?.kid) staff.set(3, 4.9, 0.02, -2.4, -0.4, 3, 1.1, 3); else staff.hide(3);
        if ((stats?.boosts ?? 0) >= 3) staff.set(4, 7.1, 0.02, -3.2, -1.2, 4, 0.8, 1.5); else staff.hide(4);
        folk.set(6, -6.75, 0.02, -5.25, 0.2, 5, 0, 1);
      } else { for (let i = 0; i < 5; i++) staff.hide(i); folk.hide(6); }
    },
  }), { focus: [-0.5, -5.0] });

  function shop(B) {
    B.slab('stone', BX, 0, BZ, W + 0.3, 0.32, D + 0.3, { round: 0.06 });
    B.slab('floor', BX, 0.3, BZ, W - 0.4, 0.05, D - 0.4, { round: 0.02, taper: 0 });
    B.slab('shop', BX, 0.3, BZ - D / 2 + 0.15, W, H, 0.3, { round: 0.08, taper: 0 });
    for (const s of [-1, 1]) B.slab('shop', BX + s * (W / 2 - 0.15), 0.3, BZ, 0.3, H, D, { round: 0.1, taper: 0.01 });
    B.slab('shop', BX, 2.75, FZ - 0.15, W, H - 2.45, 0.3, { round: 0.08, taper: 0 });
    for (const x of [BX - 0.2, BX + 2.2]) B.slab('shop', x, 0.3, FZ - 0.15, 0.5, 2.5, 0.3, { round: 0.06, taper: 0 });
    B.slab('stone', BX, 0.3, FZ - 0.05, W + 0.2, 0.45, 0.32, { round: 0.06, taper: 0 });
    // display bay (open, mannequins inside) with a thin glazing bar
    B.slab('#efe3ec', BX - 2.3, 0.3, FZ - 1.75, 4.1, H - 0.1, 0.12, { round: 0.04, taper: 0 });
    for (let i = 0; i < 5; i++) B.slab(i % 2 ? '#f6dfe8' : '#efe3ec', BX - 4.0 + i * 0.85, 0.35, FZ - 1.66, 0.42, 2.2, 0.04, { round: 0.02, taper: 0, noAo: true });
    B.slab('#c9a96e', BX - 2.3, 0.35, FZ - 0.9, 4.0, 0.05, 1.6, { round: 0.02, taper: 0 });
    for (let i = 0; i < 3; i++) B.cone({ c: '#fff4cc', g: -1.6 }, -3.9 + i * 1.3, 2.65, FZ - 0.8, 0.14, 0.12, 0, { sides: 7, rx: Math.PI });
    B.slab('gold', BX - 2.6, 2.5, FZ - 0.02, 4.4, 0.06, 0.08, { round: 0.02 });
    B.slab('glassS', BX - 2.6, 2.1, FZ - 0.06, 4.3, 0.38, 0.03, { round: 0.01, noAo: true });
    // door + till inside
    B.slab('gold', BX + 1.0, 0.3, FZ - 0.08, 1.95, 2.5, 0.08, { round: 0.03 });
    B.slab('#4a3f5c', BX + 1.0, 0.32, FZ - 0.04, 1.75, 2.36, 0.05, { round: 0.02 });
    for (const s of [-1, 1]) B.slab('glassS', BX + 1.0 + s * 0.42, 0.45, FZ, 0.68, 2.0, 0.03, { round: 0.02, noAo: true });
    B.slab('#f7e6cf', BX + 1.0, 0.8, FZ - 0.02, 1.5, 1.4, 0.02, { noAo: true, g: -1.0 });
    // right window: bags display + small shelves
    B.slab('#efe3ec', BX + 3.2, 0.75, FZ - 0.25, 1.4, 2.0, 0.05, { round: 0.02 });
    B.slab('glassS', BX + 3.2, 0.75, FZ - 0.05, 1.4, 1.95, 0.03, { round: 0.01, noAo: true });
    B.slab('#f7e6cf', BX + 3.2, 1.3, FZ - 0.03, 1.2, 1.2, 0.02, { noAo: true, g: -1.0 });
    for (let i = 0; i < 2; i++) { B.slab('gold', BX + 3.2, 1.05 + i * 0.5, FZ - 0.12, 1.1, 0.04, 0.2, { round: 0.01 }); for (let k = 0; k < 3; k++) B.slab(['#f2a6bd', '#f2c14e', '#bba8cf'][(k + i) % 3], BX + 2.85 + k * 0.35, 1.09 + i * 0.5, FZ - 0.12, 0.24, 0.3, 0.14, { round: 0.03 }); }
    // fascia: blush sign board in a gold frame with a big hanger + dress mark
    B.slab('ink', BX, 2.8, FZ + 0.02, W - 0.3, 0.8, 0.12, { round: 0.05 });
    B.slab('gold', BX - 1.6, 2.86, FZ + 0.1, 3.3, 0.68, 0.06, { round: 0.04 });
    B.slab('cream', BX - 1.6, 2.9, FZ + 0.14, 3.1, 0.6, 0.04, { round: 0.04 });
    hanger(B, BX - 2.6, 3.36, FZ + 0.18);
    B.cyl('#e46a8a', BX - 2.6, 2.96, FZ + 0.18, 0.2, 0.32, 0, { sides: 9, taper: 0.45 });
    for (let i = 0; i < 5; i++) B.slab(i % 2 ? '#c9a96e' : '#e46a8a', BX - 1.9 + i * 0.38, 3.04 + (i % 2) * 0.05, FZ + 0.17, 0.26, 0.2, 0.02, { round: 0.06, noAo: true });
    B.slab('neonP', BX - 1.3, 2.95, FZ + 0.17, 1.6, 0.04, 0.02, { round: 0.01, noAo: true });
    B.awning('blush', BX + 2.1, H - 0.05, FZ + 0.5, 4.2, 1.0, 0, { alt: 'cream', drop: 0.3 });
    // upper floor: pilasters, string course, four tall windows with reveals and pediments, cornice
    const U = H + 0.3, UH = 2.7;
    B.slab('stone', BX, H + 0.15, BZ, W + 0.35, 0.3, D + 0.35, { round: 0.06 });
    B.slab('shop2', BX, U, BZ - 0.1, W - 0.1, UH, D - 0.2, { round: 0.1, taper: 0.01 });
    for (let i = 0; i < 5; i++) B.slab('cream', BX - W / 2 + 0.25 + i * ((W - 0.5) / 4), U, FZ - 0.12, 0.34, UH, 0.18, { round: 0.06, taper: 0 });
    for (let i = 0; i < 4; i++) {
      const x = BX - W / 2 + 0.25 + (i + 0.5) * ((W - 0.5) / 4), z = FZ - 0.18;
      B.slab('#4f8a80', x, U + 0.45, z, 1.05, 1.65, 0.06, { round: 0.03 });
      B.slab('glassS', x, U + 0.5, z + 0.03, 0.9, 1.55, 0.03, { round: 0.02, noAo: true });
      B.slab('window', x, U + 0.52, z + 0.05, 0.84, 0.62, 0.02, { noAo: true, g: -1 });
      B.slab('cream', x, U + 1.18, z + 0.05, 0.05, 1.3, 0.03, { noAo: true });
      B.slab('cream', x, U + 1.15, z + 0.05, 0.9, 0.05, 0.03, { noAo: true });
      B.slab('cream', x, U + 0.36, z + 0.06, 1.3, 0.12, 0.22, { round: 0.04 });
      B.slab('cream', x, U + 2.14, z + 0.06, 1.25, 0.1, 0.16, { round: 0.03 });
      B.ball('cream', x, U + 2.24, z + 0.05, 0.55, { sy: 0.32, sz: 0.18, detail: 1 });
    }
    B.slab('cream', BX, U + UH - 0.1, BZ - 0.1, W + 0.15, 0.22, D + 0.05, { round: 0.05 });
    B.slab('stone', BX, U + UH + 0.1, BZ - 0.1, W + 0.45, 0.2, D + 0.35, { round: 0.06 });
    const R = U + UH + 0.3;
    B.add(S.hip(W + 0.2, D + 0.1, 1.9, { over: 0.05, ridge: 0.55 }), '#7a6aa6', { x: BX, y: R, z: BZ - 0.1, r: 0.6 });
    for (let i = 0; i < 3; i++) {
      const x = BX - 2.8 + i * 2.8, z = FZ - 0.45, y = R + 0.15;
      B.slab('cream', x, y, z, 1.0, 1.05, 0.9, { round: 0.06 });
      B.slab('glassS', x, y + 0.22, z + 0.46, 0.62, 0.62, 0.04, { round: 0.02, noAo: true });
      B.slab('window', x, y + 0.24, z + 0.485, 0.56, 0.26, 0.02, { noAo: true, g: -1 });
      B.add(K.roofGeo(1.0, 0.95, 0.42, { col: S.rgb('#7a6aa6'), over: 0.1, overZ: 0.1, t: 0.08 }), null, { x, y: y + 1.05, z });
    }
    for (const s of [-1, 1]) { B.cyl('gold', BX + s * (W / 2 - 1.2), R + 1.85, BZ - 0.1, 0.03, 0.5, 0, { sides: 5 }); B.ball('gold', BX + s * (W / 2 - 1.2), R + 2.4, BZ - 0.1, 0.1, { detail: 0 }); }
    K.lamp(B, BX - W / 2 - 0.4, FZ + 0.5, { h: 3.0 });
  }

  function hanger(B, x, y, z) {
    B.cyl('gold', x, y + 0.08, z, 0.03, 0.14, 0, { sides: 5 });
    B.slab('gold', x - 0.22, y - 0.05, z, 0.5, 0.05, 0.04, { round: 0.01, rz: 0.45 });
    B.slab('gold', x + 0.22, y - 0.05, z, 0.5, 0.05, 0.04, { round: 0.01, rz: -0.45 });
    B.slab('gold', x, y - 0.17, z, 0.86, 0.05, 0.04, { round: 0.01 });
  }

  function topiary(B, x, z) {
    B.cyl('ink', x, 0, z, 0.36, 0.7, 0, { sides: 9, taper: 0.82 });
    B.cyl('gold', x, 0.62, z, 0.33, 0.08, 0, { sides: 9, taper: 1 });
    B.cyl('trunk', x, 0.66, z, 0.05, 1.0, 0, { sides: 5 });
    B.ball('leafDark', x, 1.25, z, 0.42, { detail: 1, smooth: true, sway: 0.03 });
    B.ball('leaf', x, 1.98, z, 0.5, { detail: 1, smooth: true, sway: 0.04 });
  }

  function table(B, x, z) {
    B.cyl('gold', x, 0, z, 0.3, 0.05, 0, { sides: 9 });
    B.cyl('gold', x, 0.05, z, 0.05, 0.7, 0, { sides: 5 });
    B.cyl('cream', x, 0.74, z, 0.75, 0.08, 0, { sides: 13, taper: 1 });
  }
}
