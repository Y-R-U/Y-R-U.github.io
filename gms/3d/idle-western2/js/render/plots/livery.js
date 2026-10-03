// 🐴 Hoof & Mouth Livery: a weathered gambrel barn with a hayloft, a corral of horses, a blacksmith sparking at the anvil
// and a mule that kicks the barn wall every few seconds (dust, a plank pops loose). Stock: the manure heap, with flies.
// L1 barn + corral → L25 lean-to stalls + more horses → L100 a big horseshoe on the roof and a horse weather vane.
import * as THREE from 'three';
import { COLORS, EXTRA_HATS, cardCam, porch, win, lantern, blade, signBoard, hats, hatted, particles, tufts, rock, horse, bale, tone, battens, wheel, vignette } from './western.js?v=20261004d';
import { createConstruction, finishPlot } from './construction.js?v=20261004d';

const BX = -3.4, FZ = 0.6, W = 7.4, D = 6.4, H = 3.6, FH = 6.6;
const ANVIL = [1.6, 2.2];
const MULE = [0.5, -0.3];

export default function buildPlot(kit, { line, palette, rng }) {
  const P = kit.plot({ id: 'livery', line, palette, rng, seed: 23, colors: { ...COLORS, barnW: '#a8573f', manure: '#5a3a24', manure2: '#6e4a2c', ember: { c: '#ff7a2a', r: 0.4, g: 2.0 }, mule: '#8a6a55' } });
  const { b, t1, t2, lot } = P;
  vignette(b, -6.8, 3.6);

  barn(b);
  // the forge: anvil on a stump, a brick hearth with embers, horseshoes on a nail board
  b.cyl('raw2', ANVIL[0], 0, ANVIL[1], 0.36, 0.6, 0, { sides: 9, taper: 0.9 });
  b.slab('iron', ANVIL[0], 0.6, ANVIL[1], 0.8, 0.22, 0.32, { round: 0.04, taper: 0.2 });
  b.cone('iron', ANVIL[0] + 0.5, 0.68, ANVIL[1], 0.12, 0.38, 0, { sides: 5, rz: -Math.PI / 2 });
  b.slab('brick', ANVIL[0] + 1.6, 0, ANVIL[1] - 0.5, 1.2, 0.9, 0.9, { round: 0.06 });
  b.slab('ember', ANVIL[0] + 1.6, 0.9, ANVIL[1] - 0.5, 0.8, 0.08, 0.6, { round: 0.03, taper: 0 });
  b.cyl('iron', ANVIL[0] + 1.6, 0.9, ANVIL[1] - 0.8, 0.12, 1.8, 0, { sides: 7, taper: 0.9 });
  for (let i = 0; i < 4; i++) b.cyl('iron', BX + W / 2 - 0.1 + 0.02, 1.4 + (i % 2) * 0.35, FZ - 1.2 - i * 0.5, 0.16, 0.05, 0, { sides: 9, taper: 1, rz: Math.PI / 2 });
  // corral on the right with two horses
  corral(b, 2.2, 7.6, -3.6, 0.4);
  horse(b, 5.0, -1.2, { ry: 2.6, c: '#9a5a35', saddle: false });
  horse(b, 6.4, -2.6, { ry: -0.4, c: '#3e2f28', dark: '#1e1612', muzzle: '#8a6a5a', saddle: false, sock: '#f1ece2' });
  for (let i = 0; i < 3; i++) bale(b, -7.4 + (i % 2) * 0.2, (i > 1 ? 0.55 : 0), 2.6 - (i % 2) * 0.65, 0.2);
  b.cyl('plank2', 3.4, 0, 1.0, 0.55, 0.45, 0, { sides: 11, taper: 1.05 });
  b.cyl('water', 3.4, 0.4, 1.0, 0.5, 0.04, 0, { sides: 11, taper: 1 });
  wheel(b, BX + W / 2 + 0.2, 0.6, FZ + 0.5, 0.55, { ry: 0, lean: 0.25 });
  tufts(b, [[7.4, 3.8], [-7.6, -3.0], [4.5, -3.4]]);

  lot.slab('dirtM', 0, -0.02, 0, 15.6, 0.05, 8, { round: 0.04, taper: 0, noAo: true });
  corral(lot, 2.2, 7.6, -3.6, 0.4);
  tufts(lot, [[7.4, 3.8], [-7.6, -3.0], [0, 0]]);
  rock(lot, -2, 2, 1.1);

  // L25: lean-to stalls on the left with horse heads over the half doors
  {
    const lx = BX - W / 2 - 1.3;
    t1.slab('barnW', lx, 0.2, FZ - 2.6, 2.6, 2.4, 5.0, { round: 0.06, taper: 0 });
    t1.slab('tin', lx, 2.55, FZ - 2.6, 3.0, 0.12, 5.4, { round: 0.03, taper: 0, rz: 0.22 });
    for (let i = 0; i < 2; i++) { t1.slab('soot', lx + 1.32, 1.0, FZ - 1.4 - i * 2.2, 0.06, 1.2, 1.4, { round: 0.02, taper: 0, noAo: true }); t1.slab('teal', lx + 1.36, 0.25, FZ - 1.4 - i * 2.2, 0.08, 0.8, 1.4, { round: 0.02, taper: 0 }); horseHead(t1, lx + 1.6, 1.5, FZ - 1.4 - i * 2.2, i ? '#c9a27a' : '#5a3a2a'); }
    horse(t1, 4.4, -3.0, { ry: 0.3, c: '#c9a27a', saddle: false });
  }
  // L100: a giant horseshoe on the gable and a horse weather vane
  {
    const y = FH + 0.5;
    for (let i = 0; i < 9; i++) { const a = -0.3 + (i / 8) * (Math.PI + 0.6); t2.slab('gold', BX + Math.cos(a) * 0.9, y + 0.9 - Math.sin(a) * 0.9 + 0.9, FZ + 0.15, 0.36, 0.3, 0.14, { round: 0.06, taper: 0, rz: -a }); }
    t2.cyl('iron', BX + 1.5, FH + 0.9, FZ - 3.0, 0.05, 2.0, 0, { sides: 5, taper: 1 });
    t2.slab('iron', BX + 1.5, FH + 2.8, FZ - 3.0, 0.9, 0.45, 0.04, { round: 0.06, taper: 0 });
    t2.slab('iron', BX + 1.85, FH + 3.1, FZ - 3.0, 0.25, 0.35, 0.04, { round: 0.06, taper: 0, rz: -0.4 });
  }

  // the mule (dynamic): bucks forward and lands a double-barrel kick on the barn wall
  const mule = P.dynamic((d) => {
    const c = 'mule', dark = '#5e4536';
    d.ball(c, 0, 0.95, 0, 0.55, { sx: 1.45, sy: 0.85, sz: 0.85, detail: 1, smooth: true });
    for (const [dx, dz] of [[0.45, -0.25], [0.45, 0.25]]) d.cyl(c, dx, 0, dz, 0.09, 0.85, 0, { sides: 6, taper: 0.85 });
    d.slab(c, 0.75, 1.0, 0, 0.35, 0.55, 0.32, { round: 0.12, rz: -0.6 });
    d.ball(c, 1.05, 1.42, 0, 0.3, { sx: 1.3, sy: 0.85, sz: 0.8, detail: 1, smooth: true, rz: -0.3 });
    d.ball('#d8c3a8', 1.38, 1.3, 0, 0.18, { sx: 0.9, sy: 0.8, sz: 1.05, detail: 1, smooth: true });
    for (const k of [-1, 1]) d.cone(c, 0.95, 1.6, k * 0.13, 0.08, 0.6, 0, { sides: 5, curve: 0.8, rz: 0.25, rx: k * 0.35 });
    for (const k of [-1, 1]) d.ball('#241a2c', 1.2, 1.5, k * 0.17, 0.045, { detail: 0 });
    d.cyl(dark, -0.78, 0.6, 0, 0.04, 0.55, 0, { sides: 4, taper: 0.6, rz: -0.35 });
  }, { tier: 0 });
  const legs = P.dynamic((d) => { for (const dz of [-0.25, 0.25]) { d.cyl('mule', 0, -0.85, dz, 0.09, 0.85, 0, { sides: 6, taper: 1.15 }); d.cyl('#5e4536', 0, -0.85, dz, 0.1, 0.12, 0, { sides: 6, taper: 1 }); } }, { tier: 0, cast: false });
  const plank = P.dynamic((d) => d.slab('barnW', 0, 0, 0, 0.12, 0.3, 1.2, { round: 0.03, taper: 0 }), { tier: 0, cast: false });

  const heap = kit.builder(P.pal);
  heap.ball('manure', 0, 0, 0, 0.6, { sy: 0.7, detail: 1 });
  heap.ball('manure2', 0.2, 0.2, 0.1, 0.35, { detail: 0 });
  const PILE = [6.2, 0.02, 2.0];
  P.pile({ at: PILE, geo: heap.geometry({ ao: 0.2, aoH: 0.4 }), size: 0.75, max: 14, layout: 'heap' });
  b.slab('raw2', PILE[0] + 1.0, 0, PILE[2] + 0.2, 0.08, 1.3, 0.08, { round: 0.01, taper: 0, rz: 0.4 });
  b.slab('iron', PILE[0] + 1.25, 1.15, PILE[2] + 0.2, 0.35, 0.4, 0.05, { round: 0.02, taper: 0, rz: 0.4 });

  const sparks = particles(kit, P, (n) => n.ball('spark', 0, 0, 0, 1, { detail: 0 }), 18);
  const dust = particles(kit, P, (n) => n.ball('dust', 0, 0, 0, 1, { detail: 1, smooth: true }), 10);
  const flies = particles(kit, P, (n) => n.ball('#1e1a1a', 0, 0, 0, 1, { detail: 0 }), 5);
  flies.manual = true;
  const SC = 1.08;
  const folk = hatted(P.crowd({ count: 5, seed: 29, scale: SC }), EXTRA_HATS, ['#3a2c2c', '#e6d6b8', '#8a5a3a', '#c9b08a', '#6a5a3a'], [0.9, 1.6, 1.0, 1.1, 1.0]);
  folk.look(0, { top: '#6a5a4a', bot: '#3a2c2c', skin: 3, hair: 0, style: 0, acc: 0 }).body(0, 1.15, 1.0, 1.12);
  folk.look(1, { top: '#C98B7E', bot: '#5a4632', skin: 1, hair: 2, style: 3 }).body(1, 1.25, 0.9, 1.0);
  folk.look(2, { top: '#5E8F8C', bot: '#4a5878', skin: 2, hair: 4, style: 1 });
  folk.look(3, { top: '#D9A441', bot: '#5a4632', skin: 0, hair: 1, style: 2 });
  P.queue(folk, { ids: [2, 3], spawn: [[8, 4.2], [-8, 4.2]], counter: [BX + 0.4, FZ + 1.6], dir: [1, 0.2], y: 0.02, exit: [[BX + 0.4, FZ - 0.4], [BX + 0.4, FZ - 1.6]], carry: false, faceCounter: Math.PI });
  P.walkers(folk, { ids: [4], paths: [[[-8, 4.4], [8, 4.4]]], loop: 'wrap', speed: 0.9, ownedOnly: false });
  const r = (() => { let a = 11; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();
  let kicked = -1;
  const _hip = new THREE.Vector3(), _fm = new THREE.Matrix4();

  const C = createConstruction(kit, P, { x: BX, fz: FZ, w: W, d: D, h: H, fh: FH, parapet: 'gabled', ext: { x: BX - W / 2 - 1.3, z: FZ - 2.6, w: 2.8, h: 3.4 }, yard: [1.5, 2.4], stake: [1.0, 2.8] });

  return finishPlot(P, C, {
    w: 16, cardW: 13, d: 9, h: FH + 2,
    camera: cardCam([-1.3, 2, 2.5], 26, 20, 27, 38, 7, [[-2.0, 2.6, 2.5], 24, 10, 22, 38, 12]),
    pileAnchor: [PILE[0], 0.6, PILE[2]], pileR: 1.4,
    exit: [[BX + 0.4, 3.4], [6, 4.0], [8.5, 4.3]],
    focus: [0, 0.5],
    anchors: { mule: [MULE[0], 0.9, MULE[1]], kickWall: [BX + W / 2, 1.0, MULE[1]], anvil: [ANVIL[0], 0.85, ANVIL[1]], hayloft: [BX, H + 1.6, FZ + 0.2], manure: PILE },
    update(dt, stats, time, tier, ctx) {
      const owned = ctx.owned;
      sparks.visible = dust.visible = flies.visible = owned;
      if (!owned) { folk.hide(0); folk.hide(1); return; }
      // the smith
      const cyc = Math.max(1.6, stats?.cycleSec ?? 2.5) / 2, ph = (time % cyc) / cyc;
      folk.set(0, ANVIL[0] - 0.75, 0.02, ANVIL[1] + 0.1, Math.PI / 2, 3, 0, Math.PI * 2 / cyc / 2);
      if (ph < 0.08 && r() < 0.8) for (let i = 0; i < 4; i++) sparks.emit(ANVIL[0], 0.9, ANVIL[1], (r() - 0.5) * 3, 1.5 + r() * 2, (r() - 0.5) * 3, 0.45, 0.06, 9);
      sparks.step(dt, (u) => 1 - u);
      // Hortense leans on the corral fence
      folk.set(1, 2.6, 0.02, -0.2, -0.9, (time % 8) < 5 ? 0 : 4, 0, 1);
      // the mule: idle sway, then buck + kick every 6 s
      const kc = 6, ku = (time % kc) / kc, k = Math.floor(time / kc);
      const buck = ku > 0.55 && ku < 0.75 ? Math.sin(((ku - 0.55) / 0.2) * Math.PI) : 0;
      mule.position.set(MULE[0] + 0.85, 0, MULE[1]);
      mule.rotation.set(0, 0, -buck * 0.5 + Math.sin(time * 1.3) * 0.02);
      const hip = _hip.set(-0.45, 0.85, 0).applyEuler(mule.rotation).add(mule.position);
      legs.position.copy(hip);
      legs.rotation.set(0, 0, -buck * 0.5 - buck * 1.3);
      if (buck > 0.9 && kicked !== k) {
        kicked = k;
        for (let i = 0; i < 6; i++) dust.emit(BX + W / 2 + 0.3, 0.6 + r() * 0.8, MULE[1] + (r() - 0.5), 0.6 + r(), 0.3 + r() * 0.6, (r() - 0.5), 0.9, 0.3 + r() * 0.2, 0.3);
      }
      const pt = ((time - 0.55 * kc) % kc + kc) % kc;
      if (pt < 1.6) { const s = pt / 1.6; plank.visible = true; plank.position.set(BX + W / 2 + 0.2 + s * 1.4, 1.4 + s * 2.2 - s * s * 3.6, MULE[1] + s * 0.5); plank.rotation.set(s * 5, 0, s * 7); }
      else plank.visible = false;
      dust.step(dt);
      for (let i = 0; i < 5; i++) { const a = time * (2.5 + i * 0.4) + i * 1.3; flies.setMatrixAt(i, _fm.makeScale(0.05, 0.05, 0.05).setPosition(PILE[0] + Math.cos(a) * 0.6, 0.9 + Math.sin(a * 1.7) * 0.25, PILE[2] + Math.sin(a) * 0.6)); }
      flies.instanceMatrix.needsUpdate = true;
    },
  });

  function barn(B) {
    const bz = FZ - D / 2;
    B.slab('plank3', BX, 0, bz, W + 0.3, 0.25, D + 0.2, { round: 0.06, taper: 0 });
    B.slab('barnW', BX, 0.2, bz, W, H, D, { round: 0.08, taper: 0.01 });
    battens(B, 'barnW', BX, 0.25, FZ + 0.04, W - 0.1, H - 0.1, { t: 0.08 });
    // gambrel roof: steep lower slopes, shallow upper
    const lw = W / 2 + 0.3;
    for (const s of [-1, 1]) {
      B.slab('rust', BX + s * (lw - 0.75), H + 0.05, bz, 1.7, 0.14, D + 0.6, { round: 0.03, taper: 0, rz: s * -1.0 });
      B.slab('tin', BX + s * 1.2, H + 1.55, bz, 2.7, 0.14, D + 0.6, { round: 0.03, taper: 0, rz: s * -0.32 });
    }
    // front gable wall up to the ridge
    const gm = new B.shape.Mesh(), gc = tone(COLORS.plank, 0.9), Z = FZ + 0.02;
    const pts = [[-W / 2, H], [-W / 2 + 0.9, H + 1.35], [0, FH - 0.5], [W / 2 - 0.9, H + 1.35], [W / 2, H]];
    for (let i = 0; i < 4; i++) gm.tri([BX, H, Z], [BX + pts[i][0], pts[i][1], Z], [BX + pts[i + 1][0], pts[i + 1][1], Z], gc);
    for (let i = 0; i < 4; i++) gm.tri([BX, H, Z - 0.1], [BX + pts[i + 1][0], pts[i + 1][1], Z - 0.1], [BX + pts[i][0], pts[i][1], Z - 0.1], gc);
    B.add(gm.geo(), null, {});
    for (let i = 0; i < 4; i++) { const [ax, ay] = pts[i], [cx, cy] = pts[i + 1]; B.slab('cream', BX + (ax + cx) / 2, (ay + cy) / 2 - 0.08, FZ + 0.1, Math.hypot(cx - ax, cy - ay) + 0.15, 0.16, 0.16, { round: 0.03, taper: 0, rz: Math.atan2(cy - ay, cx - ax) }); }
    // big doors (open, dark inside) with white X bracing, the hayloft door with hay and a pulley beam
    B.slab('soot', BX, 0.25, FZ + 0.05, 3.0, 2.9, 0.05, { round: 0.01, taper: 0, noAo: true });
    for (const s of [-1, 1]) {
      const dx = BX + s * 2.35;
      B.slab('teal', dx, 0.25, FZ + 0.35, 0.08, 2.8, 1.5, { round: 0.02, taper: 0, ry: s * 0.25 });
      B.slab('cream', dx + s * 0.05, 0.4, FZ + 0.35, 0.06, 0.12, 1.5, { round: 0.01, taper: 0, ry: s * 0.25, rx: 0.95 });
    }
    B.slab('cream', BX, 3.15, FZ + 0.1, 3.4, 0.16, 0.16, { round: 0.03, taper: 0 });
    B.slab('soot', BX, H + 0.4, FZ + 0.06, 1.4, 1.2, 0.05, { round: 0.01, taper: 0, noAo: true });
    B.slab('cream', BX, H + 0.3, FZ + 0.1, 1.6, 0.12, 0.14, { round: 0.03, taper: 0 });
    for (let i = 0; i < 7; i++) B.cone(i % 2 ? 'hay' : 'hay2', BX - 0.55 + i * 0.18, H + 0.45, FZ + 0.12, 0.12, 0.5, 0, { sides: 4, rx: Math.PI / 2 - 0.4, rz: (i - 3) * 0.12, sway: 0.03 });
    B.slab('raw2', BX, FH - 0.9, FZ + 0.4, 0.16, 0.16, 1.2, { round: 0.03, taper: 0 });
    B.cyl('rope', BX, FH - 2.2, FZ + 0.9, 0.025, 1.3, 0, { sides: 4, taper: 1 });
    bale(B, BX + 0.1, FH - 2.75, FZ + 0.9, 0.3, 0.75);
    porch(B, BX - W / 2, BX + W / 2, FZ, 2.4, { h: 0.18, awn: false, step: false });
    signBoard(B, BX + 2.5, 2.4, FZ + 0.2, 1.4, 0.6, { board: 'cream', trim: 'brass' });
    for (let i = 0; i < 1; i++) B.cyl('iron', BX + 2.5, 3.25, FZ + 0.34, 0.2, 0.05, 0, { sides: 9, taper: 1, rx: Math.PI / 2 });
    blade(B, BX - W / 2 + 0.3, 1.8, FZ + 1.4, { board: 'ownTeal' });
    lantern(B, BX - 1.8, 2.8, FZ + 0.45);
    win(B, BX + W / 2 + 0.02, 1.2, FZ - 3.8, { w: 1.1, h: 1.0 });
    B.contact(BX, FZ - D / 2, W + 0.6, D + 0.6);
  }
  function corral(B, x0, x1, z0, z1) {
    const posts = [];
    for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / 4) posts.push([x, z1], [x, z0]);
    for (let z = z0; z <= z1 + 0.01; z += (z1 - z0) / 3) posts.push([x1, z]);
    for (const [x, z] of posts) B.cyl('raw2', x, 0, z, 0.08, 1.3, 0, { sides: 5, taper: 0.9 });
    for (const y of [0.55, 1.1]) {
      B.slab('raw', (x0 + x1) / 2, y, z0, x1 - x0 + 0.2, 0.1, 0.08, { round: 0.02, taper: 0 });
      B.slab('raw', x1, y, (z0 + z1) / 2, 0.08, 0.1, z1 - z0 + 0.2, { round: 0.02, taper: 0 });
      B.slab('raw', (x0 + 1.5 + x1) / 2, y, z1, x1 - x0 - 1.5, 0.1, 0.08, { round: 0.02, taper: 0 });
    }
  }
  function horseHead(B, x, y, z, c) {
    B.ball(c, x, y, z, 0.28, { sx: 1.4, sy: 0.9, sz: 0.8, detail: 1, smooth: true });
    B.ball('#d9b08a', x + 0.32, y - 0.08, z, 0.17, { detail: 1, smooth: true });
    for (const k of [-1, 1]) { B.cone(c, x - 0.12, y + 0.2, z + k * 0.12, 0.07, 0.26, 0, { sides: 5 }); B.ball('#241a2c', x + 0.1, y + 0.08, z + k * 0.18, 0.04, { detail: 0 }); }
  }
}
