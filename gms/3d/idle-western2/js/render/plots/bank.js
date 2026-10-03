// 🏦 First & Last Bank of Dribble Creek: a brick bank with cream columns, a barred teller window, a huge round vault door
// swung half open in the side annex, and a NO GUNS sign shot full of holes. Ebenezer Thrupp faints flat on his back
// every so often (he has never recovered from Black Bart). Stock: money bags. Bought after the robbery (W13).
// L1 bank → L25 the vault annex gains a second door + gold-bar stack → L100 a clock pediment with a gilded dome.
import * as THREE from 'three';
import { COLORS, cardCam, falseFront, porch, win, lantern, blade, signBoard, hats, hatted, particles, tufts, rock, tone, tilt, smooth01 } from './western.js?v=20261004b';
import { createConstruction, finishPlot } from './construction.js?v=20261004b';

const BX = -2.4, FZ = 0.6, W = 7.4, D = 6.0, H = 4.2, FH = 6.4;
const VAULT = [3.4, 1.2, -0.6];

export default function buildPlot(kit, { line, palette, rng }) {
  const P = kit.plot({ id: 'bank', line, palette, rng, seed: 47, colors: { ...COLORS, brickB: '#a8573f', brickB2: '#8e4632', col: '#efe4cc', steel: { c: '#9aa3ab', r: 0.3, m: 0.85 }, steel2: { c: '#6f7880', r: 0.35, m: 0.8 }, bag: '#c9a46a', hole: '#2a1e1e', bar: { c: '#f2c84a', r: 0.25, m: 0.9 } } });
  const { b, t1, t2, lot } = P;

  bank(b, true);
  bank(lot, false);
  vaultRoom(b);
  vaultRoom(lot);
  tufts(b, [[-6.6, 3.6], [6.6, 3.8], [-6.4, -2.6]]);
  rock(b, 6.2, -2.8, 1.0);
  tufts(lot, [[-6.6, 3.6], [6.6, 3.8]]);

  // L25: gold bars stacked inside the vault, a second (smaller) safe on the porch
  for (let r = 0; r < 3; r++) for (let i = 0; i < 4 - r; i++) t1.slab('bar', VAULT[0] + 0.4 - 0.8 + i * 0.42 + r * 0.21, 0.3 + r * 0.17, VAULT[2] - 0.9, 0.38, 0.16, 0.6, { round: 0.04, taper: 0.2 });
  t1.slab('steel2', BX + 2.6, 0.35, FZ + 1.4, 0.9, 1.0, 0.8, { round: 0.08 });
  t1.cyl('steel', BX + 2.6, 0.85, FZ + 1.82, 0.22, 0.06, 0, { sides: 11, taper: 1, rx: Math.PI / 2 });
  // L100: a clock pediment and a gilded dome
  {
    const y = FH + 0.2;
    t2.add(t2.shape.gable(W * 0.8, 0.4, 1.6, { over: 0, sag: 0 }), 'col', { x: BX, y, z: FZ - 0.05 });
    t2.cyl('cream', BX, y + 0.75, FZ + 0.18, 0.5, 0.1, 0, { sides: 15, taper: 1, rx: Math.PI / 2 });
    t2.slab('ink', BX + 0.15, y + 0.72, FZ + 0.28, 0.32, 0.05, 0.02, { round: 0, taper: 0, rz: 0.3 });
    t2.slab('ink', BX, y + 0.75, FZ + 0.28, 0.04, 0.38, 0.02, { round: 0, taper: 0 });
    t2.cyl('col', BX, FH - 0.3, FZ - 3.0, 1.2, 1.0, 0, { sides: 13, taper: 1 });
    t2.ball('gold', BX, FH + 0.7, FZ - 3.0, 1.15, { sy: 0.9, detail: 2, smooth: true, aoBase: FH });
    t2.cyl('gold', BX, FH + 1.7, FZ - 3.0, 0.05, 0.7, 0, { sides: 5, taper: 1 });
  }

  // the vault door (dynamic): swings slowly between ajar and wide; Thrupp guards it
  const door = P.dynamic((d) => {
    d.cyl('steel', 1.05, 0, 0.6, 1.05, 0.3, 0, { sides: 21, taper: 1, rx: Math.PI / 2 });
    d.cyl('steel2', 1.05, 0, 0.62, 0.85, 0.34, 0, { sides: 21, taper: 1, rx: Math.PI / 2 });
    for (let i = 0; i < 4; i++) d.slab('steel', 1.05, 0, 1.02, 0.08, 1.2, 0.06, { round: 0.02, taper: 0, rz: (i * Math.PI) / 4 });
    d.cyl('brass', 1.05, 0, 1.0, 0.16, 0.12, 0, { sides: 11, taper: 1, rx: Math.PI / 2 });
    for (let i = 0; i < 8; i++) d.ball('steel2', 1.05 + Math.cos(i * 0.785) * 0.95, Math.sin(i * 0.785) * 0.95, 0.92, 0.07, { detail: 0 });
    d.slab('steel2', 0.05, -0.2, 0.0, 0.2, 0.4, 0.5, { round: 0.03, taper: 0 });
  }, { tier: 0 });
  // hinge on the left edge of the round opening, in the vault annex front wall
  door.position.set(VAULT[0] - 1.05, VAULT[1], VAULT[2] + 0.45);

  const bag = kit.builder(P.pal);
  bag.ball('bag', 0, 0.4, 0, 0.45, { sx: 1.0, sy: 0.95, sz: 0.85, detail: 1, smooth: true });
  bag.cyl('bag', 0, 0.78, 0, 0.12, 0.22, 0, { sides: 7, taper: 1.7 });
  bag.cyl('rope', 0, 0.8, 0, 0.13, 0.06, 0, { sides: 7, taper: 1 });
  bag.slab('bar', 0, 0.42, 0.37, 0.12, 0.3, 0.03, { round: 0.02, taper: 0 });
  bag.slab('bar', 0, 0.45, 0.38, 0.24, 0.06, 0.03, { round: 0.01, taper: 0 });
  bag.slab('bar', 0, 0.35, 0.38, 0.24, 0.06, 0.03, { round: 0.01, taper: 0 });
  const PILE = [VAULT[0] + 0.2, 0.32, VAULT[2] + 1.6];
  P.pile({ at: PILE, geo: bag.geometry({ ao: 0.12 }), size: 0.7, max: 12, cols: 4, spacing: 1.0 });

  const SC = 1.08;
  // 0 Thrupp (tiny bowler), 1 a customer in line, 2 a second customer, 3 a passer-by
  const folk = hatted(P.crowd({ count: 4, seed: 59, scale: SC }), 'bowler', ['#2e2630', '#6a5a3a', '#5a4632', '#3a2c2c'], [0.7, 1.3, 1.3, 1.3]);
  folk.dress(0, 'thrupp');
  folk.look(1, { top: '#8FA27A', bot: '#5a4632', skin: 2, hair: 2, style: 1 });
  folk.look(2, { top: '#C98B7E', bot: '#4a5878', skin: 1, hair: 4, style: 3 });
  folk.look(3, { top: '#D9A441', bot: '#4a5878', skin: 0, hair: 1, style: 2 });
  P.queue(folk, { ids: [1, 2], spawn: [[7, 3.6], [-7, 3.6]], counter: [BX + 0.8, FZ + 1.2], dir: [-1, 0.1], gap: 0.95, y: 0.37, exit: [[BX + 0.8, FZ - 0.4], [BX + 0.8, FZ - 1.6]], carry: false, faceCounter: Math.PI });
  P.walkers(folk, { ids: [3], paths: [[[-7, 4.3], [7, 4.3]]], loop: 'wrap', speed: 0.9, ownedOnly: false });
  const stars = particles(kit, P, (n) => { n.ball('star', 0, 0, 0, 0.35, { detail: 0 }); for (let i = 0; i < 5; i++) n.cone('star', Math.cos(i * 1.2566) * 0.3, Math.sin(i * 1.2566) * 0.3, 0, 0.22, 0.55, 0, { sides: 4, rz: i * 1.2566 - Math.PI / 2 }); }, 5);
  stars.manual = true;
  const _m = new THREE.Matrix4(), _e = new THREE.Euler(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

  const C = createConstruction(kit, P, { x: BX, fz: FZ, w: W, d: D, h: H, fh: FH, parapet: 'flat', stakes: false, ext: { x: VAULT[0], z: VAULT[2], w: 3.0, h: 3.0 } });

  return finishPlot(P, C, {
    w: 14, cardW: 12.5, d: 9, h: FH + 2,
    acquired: true,
    camera: cardCam([0.0, 2.2, 0.8], 12, 27, 12.5, 42),
    pileAnchor: [PILE[0], 0.8, PILE[2]], pileR: 1.4,
    exit: [[BX + 1.5, 3.4], [5, 4.0], [7.2, 4.2]],
    focus: [0, 1],
    anchors: { vault: [VAULT[0], VAULT[1], VAULT[2] + 0.5], door: [BX + 0.8, 0.35, FZ + 0.3], doors: [BX + 0.8, 0.35, FZ + 0.3], center: [BX + 0.8, 0.0, FZ + 2.4], noGuns: [BX - 2.4, 1.6, FZ + 0.25], teller: [BX + 2.2, 1.3, FZ + 0.2], thrupp: [VAULT[0] - 1.6, 0.32, VAULT[2] + 1.0], robberyExit: [BX + 0.8, 0, 4.0] },
    update(dt, stats, time, tier, ctx) {
      const owned = ctx.owned;
      const sw = 0.9 + Math.sin(time * 0.35) * 0.5;
      door.rotation.set(0, -sw, 0);
      stars.visible = owned;
      if (!owned) { folk.hide(0); return; }
      // Thrupp: polishes the vault door… sees his reflection… faints backwards, lies there seeing stars, gets up
      const T = 16, u = time % T;
      const fall = smooth01((u - 9) / 0.5) - smooth01((u - 13) / 0.6);
      const x = VAULT[0] - 1.5, z = VAULT[2] + 1.1, k = SC * 1.22 * 0.95;
      folk.set(0, x, 0.32, z, Math.PI * 0.75, fall > 0.1 ? 0 : 7, 0, 3);
      if (fall > 0.01) {
        tilt(folk, 0, x, 0.32 + fall * 0.15, z + fall * 0.2, Math.PI * 0.75, fall * 1.5, 0, k);
        folk.hats.put(0, x - Math.sin(Math.PI * 0.75) * fall * 1.9, 0.4, z - Math.cos(Math.PI * 0.75) * fall * 1.9 + fall * 0.3, 0, 0.75, 1.2);
      }
      const on = u > 9.5 && u < 13;
      stars.visible = on;
      for (let i = 0; i < 5; i++) {
        if (!on) { stars.setMatrixAt(i, _m.makeScale(0, 0, 0)); continue; }
        const a = time * 4 + i * 1.2566, hx = x - Math.sin(Math.PI * 0.75) * 1.6, hz = z - Math.cos(Math.PI * 0.75) * 1.6;
        stars.setMatrixAt(i, _m.compose(_p.set(hx + Math.cos(a) * 0.45, 0.85, hz + Math.sin(a) * 0.45), _q.setFromEuler(_e.set(0, a, 0)), _s.setScalar(0.2)));
      }
      stars.instanceMatrix.needsUpdate = true;
    },
  });

  function bank(B, own) {
    falseFront(B, { x: BX, fz: FZ, w: W, d: D, h: H, fh: FH, front: 'brickB', wall: 'brickB2', parapet: 'none', door: 0.8, windows: [], doorW: 1.4, doorH: 2.6, trim: 'col', doorC: 'steel2' });
    for (let r = 0; r < 14; r++) for (let i = 0; i < 6; i++) if ((r + i) % 3 === 0) B.slab(tone(COLORS.cream, 0.9), BX - W / 2 + 0.6 + i * 1.25 + (r % 2) * 0.6, 0.4 + r * 0.42, FZ + 0.1, 0.5, 0.06, 0.02, { round: 0, taper: 0, noAo: true });
    B.slab('col', BX, FH - 0.25, FZ + 0.05, W + 0.5, 0.45, 0.6, { round: 0.06, taper: 0 });
    B.slab('col', BX, FH + 0.2, FZ - 0.05, W * 0.5, 0.5, 0.35, { round: 0.06, taper: 0.1 });
    // columns, steps, teller window with bars
    for (const dx of [-0.6, 2.2]) for (const s of [0, 1]) { const cx = BX + dx + s * 0.0; B.cyl('col', cx, 0.35, FZ + 0.65, 0.22, H - 0.5, 0, { sides: 11, taper: 0.9 }); B.slab('col', cx, 0.3, FZ + 0.65, 0.6, 0.12, 0.6, { round: 0.03 }); B.slab('col', cx, H - 0.2, FZ + 0.65, 0.6, 0.18, 0.6, { round: 0.03 }); }
    win(B, BX + 2.4, 1.0, FZ + 0.16, { w: 1.5, h: 1.6, trim: 'col' });
    for (let i = 0; i < 6; i++) B.cyl('brass', BX + 2.4 - 0.65 + i * 0.26, 1.0, FZ + 0.24, 0.025, 1.6, 0, { sides: 4, taper: 1 });
    porch(B, BX - W / 2 - 0.1, BX + W / 2 + 0.1, FZ, 2.2, { awn: false, stepX: BX + 0.8, stepW: 2.6 });
    signBoard(B, BX, H + 0.3, FZ + 0.18, 5.0, 1.0, { board: own ? 'cream' : '#6b3f8f', trim: own ? 'brass' : 'gold' });
    for (const k of [-1, 1]) B.cyl('gold', BX + k * 0.5, H + 0.8, FZ + 0.32, 0.26, 0.06, 0, { sides: 13, taper: 1, rx: Math.PI / 2 });
    // NO GUNS: a pistol silhouette in a red ring with a slash, riddled with bullet holes
    const nx = BX - 2.4, ny = 1.65, nz = FZ + 0.2;
    B.slab('raw2', nx, ny - 0.75, nz, 1.3, 1.3, 0.06, { round: 0.04, taper: 0 });
    B.slab('cream', nx, ny - 0.68, nz + 0.04, 1.18, 1.16, 0.04, { round: 0.04, taper: 0, noAo: true });
    B.slab('ink', nx - 0.05, ny - 0.05, nz + 0.07, 0.6, 0.14, 0.02, { round: 0.02, taper: 0, noAo: true });
    B.slab('ink', nx - 0.25, ny - 0.38, nz + 0.07, 0.16, 0.36, 0.02, { round: 0.03, taper: 0, rz: 0.3, noAo: true });
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; B.slab('#c9302a', nx + Math.cos(a) * 0.45, ny - 0.1 + Math.sin(a) * 0.45 - 0.0, nz + 0.08, 0.2, 0.1, 0.02, { round: 0.01, taper: 0, rz: a + Math.PI / 2, noAo: true }); }
    B.slab('#c9302a', nx, ny - 0.55, nz + 0.09, 0.1, 0.92, 0.02, { round: 0.01, taper: 0, rz: -0.785, noAo: true });
    for (const [hx, hy] of [[0.3, 0.25], [-0.35, -0.3], [0.1, -0.15], [-0.15, 0.35], [0.4, -0.4], [-0.05, 0.05], [0.25, -0.05]]) B.cyl('hole', nx + hx, ny - 0.1 + hy, nz + 0.1, 0.045, 0.02, 0, { sides: 7, taper: 1, rx: Math.PI / 2, noAo: true });
    lantern(B, BX - 0.6, 2.6, FZ + 0.4);
    if (own) blade(B, BX - W / 2 + 0.3, 1.9, FZ + 1.4, { board: 'ownTeal' });
  }
  function vaultRoom(B) {
    const x = VAULT[0], z = VAULT[2];
    B.slab('brickB2', x, 0, z - 1.0, 3.4, 3.0, 2.6, { round: 0.08, taper: 0 });
    B.slab('col', x, 3.0, z - 1.0, 3.6, 0.25, 2.8, { round: 0.04, taper: 0 });
    B.cyl('ink', x, VAULT[1], z + 0.29, 1.0, 0.05, 0, { sides: 21, taper: 1, rx: Math.PI / 2 });
    B.cyl('steel2', x, VAULT[1], z + 0.3, 1.12, 0.12, 0, { sides: 21, taper: 1, rx: Math.PI / 2 });
    B.slab('interior', x, 0.3, z - 0.3, 2.0, 1.8, 0.04, { round: 0, taper: 0, noAo: true });
    B.slab('plank3', x, 0, z + 0.9, 3.4, 0.3, 1.4, { round: 0.04 });
  }
}
