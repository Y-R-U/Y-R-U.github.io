// 💈 Pull & Pray (barber · dentist · surgeon): a narrow teal two-storey with a spinning barber pole, a giant tooth on the
// false front and a red barber chair out on the porch that reclines far too far. Pliers Pete yanks; a tooth flies; stars.
// Stock: a big glass jar of pulled teeth (a few gold). A patient waits on the bench holding his jaw.
// L1 one chair → L25 a shaving chair with a lathered customer → L100 a gilded tooth on the roof and a second storey sign.
import * as THREE from 'three';
import { COLORS, EXTRA_HATS, cardCam, falseFront, porch, win, lantern, blade, signBoard, hatted, particles, tufts, rock, tone, tilt } from './western.js?v=20261004a';
import { createConstruction, finishPlot } from './construction.js?v=20261004a';

const BX = -1.9, FZ = 0.5, W = 6.2, D = 5.2, H = 6.0, FH = 7.2;
const CHAIR = [2.5, 1.85];

export default function buildPlot(kit, { line, palette, rng }) {
  const P = kit.plot({ id: 'dentist', line, palette, rng, seed: 29, colors: { ...COLORS, tooth: '#fbf6ea', leatherR: '#a8302a', jar: { c: '#cfe6e2', r: 0.06 }, foam: '#ffffff', poleR: '#c9302a' } });
  const { b, t1, t2, lot } = P;

  falseFront(b, { x: BX, fz: FZ, w: W, d: D, h: H, fh: FH, front: 'teal', wall: tone(COLORS.teal, 0.8), parapet: 'peak', door: -1.6, windows: [], trim: 'cream' });
  // a big shop window with a curtain, upstairs windows
  win(b, BX + 1.0, 0.85, FZ + 0.16, { w: 2.6, h: 1.7, trim: 'cream' });
  b.slab('rose', BX + 1.0, 2.25, FZ + 0.12, 2.5, 0.35, 0.05, { round: 0.05, taper: 0 });
  for (let i = 0; i < 2; i++) win(b, BX - 1.4 + i * 2.8, 3.7, FZ + 0.16, { w: 1.1, h: 1.3, trim: 'cream', shutters: 'mustard' });
  porch(b, BX - W / 2 - 0.1, BX + W / 2 + 0.1, FZ, 2.6, { awnY: 2.8, awn: ['cream', 'poleR'], posts: 3, stepX: BX - 1.6 });
  porch(b, BX + W / 2 + 0.1, BX + W / 2 + 3.8, FZ, 2.6, { awn: false, step: false });
  signBoard(b, BX, H + 0.0, FZ + 0.18, 4.4, 0.9, { board: 'cream', trim: 'brass' });
  toothShape(b, BX, H - 0.2 + 0.5, FZ + 0.3, 0.55, 'tooth');
  bigTooth(b, BX + W / 2 - 0.6, H + 1.25, FZ + 0.25, 0.6, 'tooth');
  pole(b, BX + W / 2 + 0.3, FZ + 0.55, true);
  blade(b, BX - W / 2 + 0.3, 1.7, FZ + 1.6, { board: 'ownTeal' });
  lantern(b, BX - 0.2, 2.4, FZ + 0.45);
  chairBase(b, CHAIR[0], CHAIR[1]);
  // instruments tray, a spittoon, the waiting bench
  b.cyl('iron', CHAIR[0] - 1.05, 0.26, CHAIR[1] - 0.3, 0.05, 1.0, 0, { sides: 5, taper: 1 });
  b.slab('metal', CHAIR[0] - 1.05, 1.26, CHAIR[1] - 0.3, 0.6, 0.04, 0.4, { round: 0.02, taper: 0 });
  for (let i = 0; i < 3; i++) b.slab('iron', CHAIR[0] - 1.2 + i * 0.13, 1.3, CHAIR[1] - 0.3, 0.04, 0.03, 0.32, { round: 0.005, taper: 0, ry: i * 0.3 });
  b.cyl('brass', CHAIR[0] - 0.9, 0.26, CHAIR[1] + 0.75, 0.2, 0.35, 0, { sides: 9, taper: 0.7 });
  b.slab('plank2', 4.3, 0.26, FZ + 0.55, 1.6, 0.42, 0.5, { round: 0.04 });
  tufts(b, [[-5.6, 3.6], [5.6, 3.6], [-5.4, -2.6]]);
  rock(b, 5.5, -1.6, 0.9);

  lot.slab('dirtM', 0, -0.02, 0, 11.6, 0.05, 8, { round: 0.04, taper: 0, noAo: true });
  tufts(lot, [[-5.6, 3.6], [5.6, 3.6], [0, -1.0]]);
  rock(lot, 5.5, -1.6, 0.9);

  // L25: a shaving chair inside the big window + a little lean-to apothecary on the right
  chairBase(t1, BX + 1.0, FZ - 0.9, true);
  t1.slab('sage', 4.0, 0.25, FZ - 2.2, 3.2, 2.5, 3.2, { round: 0.06 });
  t1.slab('tin', 4.0, 2.75, FZ - 2.2, 3.5, 0.12, 3.6, { round: 0.03, taper: 0, rx: -0.12 });
  for (let i = 0; i < 4; i++) t1.cyl(['#7DFF6A', '#c9473a', '#5f86b0', 'gold'][i], 3.0 + i * 0.6, 1.3, FZ - 0.55, 0.13, 0.4, 0, { sides: 7, taper: 0.7 });
  t1.slab('glass', 4.0, 1.1, FZ - 0.6, 2.6, 1.1, 0.05, { round: 0.01, taper: 0, noAo: true });
  // L100: a gilded tooth on a plinth above the parapet, the pole doubled
  bigTooth(t2, BX - 1.3, FH + 0.5, FZ - 0.4, 1.0, 'gold');
  pole(t2, BX - W / 2 - 0.3, FZ + 0.55, false);

  // the reclining chair back + patient; Pete's giant pliers; the tooth that flies
  const back = P.dynamic((d) => {
    d.slab('leatherR', 0, 0, -0.1, 0.9, 1.25, 0.2, { round: 0.1, taper: 0.05 });
    d.slab('leatherR', 0, 1.15, -0.05, 0.6, 0.3, 0.3, { round: 0.12 });
    d.slab('brass', 0, 0.05, -0.2, 0.95, 0.08, 0.08, { round: 0.02, taper: 0 });
  }, { tier: 0 });
  const pliers = P.dynamic((d) => {
    for (const k of [-1, 1]) d.slab('metal', k * 0.06, 0, 0, 0.07, 0.9, 0.07, { round: 0.02, taper: 0, rz: k * 0.08 });
    for (const k of [-1, 1]) d.slab('metal', k * 0.07, 0.85, 0, 0.09, 0.28, 0.09, { round: 0.03, taper: 0, rz: -k * 0.25 });
    d.ball('iron', 0, 0.75, 0, 0.07, { detail: 0 });
  }, { tier: 0, cast: false });
  const teeth = particles(kit, P, (n) => { n.slab('tooth', 0, -0.5, 0, 0.8, 0.7, 0.6, { round: 0.25 }); for (const k of [-1, 1]) n.cone('tooth', k * 0.2, -0.45, 0, 0.16, 0.55, 0, { sides: 5, rx: Math.PI }); }, 3);
  const stars = particles(kit, P, (n) => { n.ball('star', 0, 0, 0, 0.35, { detail: 0 }); for (let i = 0; i < 5; i++) n.cone('star', Math.cos(i * 1.2566) * 0.3, Math.sin(i * 1.2566) * 0.3, 0, 0.22, 0.55, 0, { sides: 4, rz: i * 1.2566 - Math.PI / 2 }); }, 5);

  const jar = kit.builder(P.pal);
  jar.slab('tooth', 0, 0, 0, 0.8, 0.7, 0.6, { round: 0.25 });
  for (const k of [-1, 1]) jar.cone('tooth', k * 0.2, 0.05, 0, 0.16, 0.5, 0, { sides: 5, rx: Math.PI });
  const JAR = [4.3, 0.68, FZ + 0.55];
  b.cyl('jar', JAR[0], JAR[1], JAR[2], 0.5, 1.15, 0, { sides: 13, taper: 0.92 });
  b.cyl('brass', JAR[0], JAR[1] + 1.12, JAR[2], 0.42, 0.12, 0, { sides: 13, taper: 1 });
  P.pile({ at: [JAR[0], JAR[1] + 0.06, JAR[2]], geo: jar.geometry({ ao: 0 }), size: 0.18, max: 22, layout: 'heap', range: [0, 0.7] });
  const gold = kit.builder(P.pal);
  gold.slab('gold', 0, 0, 0, 0.8, 0.7, 0.6, { round: 0.25 });
  P.pile({ at: [JAR[0], JAR[1] + 0.5, JAR[2]], geo: gold.geometry({ ao: 0 }), size: 0.2, max: 5, layout: 'heap', range: [0.4, 1] });

  const SC = 1.08;
  const folk = hatted(P.crowd({ count: 6, seed: 37, scale: SC }), EXTRA_HATS, ['#3a2c2c', '#c9b08a', '#e6d6b8', '#8a5a3a', '#6a5a3a', '#b5483a'], [0.0, 1.2, 1.1, 0.9, 1.0, 1.0]);
  folk.dress(0, 'pete');
  folk.look(1, { expr: 'shock' }).look(2, { expr: 'grump' });
  folk.look(1, { top: '#8FA27A', bot: '#5a4632', skin: 2, hair: 2, style: 1 }).body(1, 1.25, 0.9, 1.0);
  folk.look(2, { top: '#D9A441', bot: '#4a5878', skin: 1, hair: 4, style: 2 });
  folk.look(3, { top: '#e9e4da', bot: '#6b5a7d', skin: 3, hair: 0, style: 3 });
  P.walkers(folk, { ids: [4, 5], paths: [[[-6, 4.0], [6, 3.9]], [[6, 4.4], [-6, 4.5]]], loop: 'wrap', speed: 0.9, ownedOnly: false });
  let lastPull = -1;

  const C = createConstruction(kit, P, { x: BX, fz: FZ, w: W, d: D, h: 3.4, fh: FH, parapet: 'peak', ext: { x: 4.0, z: FZ - 2.2, w: 3.2, h: 3.2 }, yard: [2.4, 2.2], stake: [1.4, 2.7] });

  return finishPlot(P, C, {
    w: 12, cardW: 11, d: 9, h: FH + 2,
    camera: cardCam([-0.4, 2.2, 1.2], 12, 26, 13, 42),
    pileAnchor: JAR, pileR: 1.0,
    exit: [[BX - 1.6, 3.4], [4, 4.0], [6.3, 4.2]],
    focus: [0.5, 1.2],
    anchors: { chair: [CHAIR[0], 0.9, CHAIR[1]], doors: [BX - 1.6, 0.26, FZ + 0.3], center: [BX + 1.5, 0.0, FZ + 2.4], chairLanding: [CHAIR[0], 1.0, CHAIR[1] + 0.2], pole: [BX + W / 2 + 0.3, 1.5, FZ + 0.55], jar: JAR, bench: [4.3, 0.7, FZ + 0.55] },
    update(dt, stats, time, tier, ctx) {
      const owned = ctx.owned;
      teeth.visible = stars.visible = owned;
      if (!owned) { for (let i = 0; i < 4; i++) folk.hide(i); return; }
      const cyc = Math.max(4, (stats?.cycleSec ?? 6)), u = (time % cyc) / cyc, k = Math.floor(time / cyc);
      // recline: slowly back… then WAY too far (patient nearly horizontal, legs up)
      const rec = u < 0.35 ? (u / 0.35) * 0.5 : u < 0.55 ? 0.5 + ((u - 0.35) / 0.2) * 0.95 : u < 0.85 ? 1.45 : 1.45 - ((u - 0.85) / 0.15) * 1.45;
      back.position.set(CHAIR[0], 0.95, CHAIR[1] - 0.25);
      back.rotation.set(-rec, 0, 0);
      const kSC = SC * 1.22 * 1.0;
      folk.set(1, CHAIR[0], 0.86, CHAIR[1] + 0.05, 0, 5, 0, 1);
      tilt(folk, 1, CHAIR[0], 0.8 + rec * 0.05, CHAIR[1] - rec * 0.25, 0, -rec * 0.85, 0, kSC);
      folk.hats.put(1, CHAIR[0], 0.86 + Math.cos(rec * 0.85) * 1.7, CHAIR[1] - Math.sin(rec * 0.85) * 1.7, 0, 0.85, -rec, 0);
      // Pete: works at the jaw, yanks at u≈0.7
      const yank = u > 0.62 && u < 0.78 ? Math.sin(((u - 0.62) / 0.16) * Math.PI) : 0;
      folk.set(0, CHAIR[0] + 0.85 + yank * 0.35, 0.28, CHAIR[1] - 0.6 - yank * 0.2, -Math.PI / 2 - 0.6, 3, 0, 4 + yank * 8);
      pliers.position.set(CHAIR[0] + 0.45 + yank * 0.45, 1.55 + yank * 0.3, CHAIR[1] - 0.6 - yank * 0.1);
      pliers.rotation.set(0, 0, 1.1 + yank * 0.6 + Math.sin(time * 8) * 0.05);
      if (u > 0.72 && lastPull !== k) {
        lastPull = k;
        teeth.emit(CHAIR[0] + 0.5, 1.9, CHAIR[1] - 0.5, 1.4, 3.2, 0.9, 1.3, 0.22, 7, 1);
        for (let i = 0; i < 5; i++) stars.emit(CHAIR[0] + Math.cos(i * 1.26) * 0.4, 2.0, CHAIR[1] - 0.4 + Math.sin(i * 1.26) * 0.4, Math.cos(i * 1.26) * 0.5, 0.5, Math.sin(i * 1.26) * 0.5, 1.4, 0.16, 0, 1);
      }
      teeth.step(dt, () => 1);
      stars.step(dt, (t) => Math.sin(t * Math.PI));
      // the next patient waits holding his jaw; the shaving customer at L25
      folk.set(2, 4.0, 0.62, FZ + 0.55, 0.15, 5, 0, 1);
      if (ctx.vt >= 1) folk.set(3, BX + 1.0, 0.86, FZ - 0.85, 0, 5, 1, 1); else folk.hide(3);
    },
  });

  function chairBase(B, x, z, still = false) {
    B.cyl('iron', x, 0.26, z, 0.35, 0.1, 0, { sides: 11, taper: 1 });
    B.cyl('brass', x, 0.36, z, 0.1, 0.4, 0, { sides: 7, taper: 1 });
    B.slab('leatherR', x, 0.75, z, 1.0, 0.25, 0.9, { round: 0.1 });
    for (const k of [-1, 1]) B.slab('leatherR', x + k * 0.5, 0.95, z, 0.14, 0.2, 0.8, { round: 0.06 });
    B.slab('leatherR', x, 0.45, z + 0.65, 0.7, 0.18, 0.55, { round: 0.06, rx: 0.5 });
    if (still) { B.slab('leatherR', x, 0.95, z - 0.4, 0.9, 1.2, 0.2, { round: 0.1 }); B.ball('foam', x, 1.85, z - 0.1, 0.32, { detail: 1, sy: 0.8 }); }
    B.contact(x, z, 1.2, 1.4);
  }
  function pole(B, x, z, own) {
    B.cyl('brass', x, 0.26, z, 0.16, 0.2, 0, { sides: 9, taper: 0.8 });
    B.cyl('jar', x, 0.45, z, 0.16, 1.5, 0, { sides: 11, taper: 1 });
    for (let i = 0; i < 6; i++) B.slab(i % 2 ? 'foam' : (own ? 'poleR' : '#5f86b0'), x, 0.5 + i * 0.24, z, 0.34, 0.12, 0.34, { round: 0.06, taper: 0, rz: 0.35, ry: i * 0.6 });
    B.ball('brass', x, 2.0, z, 0.2, { detail: 1 });
  }
  function toothShape(B, x, y, z, s, c) {
    B.slab(c, x, y, z, 1.0 * s, 0.85 * s, 0.1, { round: 0.3 * s, taper: 0, noAo: true });
    for (const k of [-1, 1]) B.slab(c, x + k * 0.25 * s, y - 0.55 * s, z, 0.32 * s, 0.7 * s, 0.1, { round: 0.14 * s, taper: 0.3, noAo: true, rz: k * 0.15 });
  }
  function bigTooth(B, x, y, z, s, c) {
    B.slab(c, x, y + 0.6 * s, z, 1.1 * s, 0.95 * s, 0.7 * s, { round: 0.32 * s, taper: 0 });
    for (const k of [-1, 1]) B.cone(c, x + k * 0.27 * s, y + 0.7 * s, z, 0.24 * s, 0.75 * s, 0, { sides: 7, rx: Math.PI, curve: 0.8 });
    B.slab('raw2', x, y - 0.35, z, 0.12, 0.5, 0.12, { round: 0.02, taper: 0 });
  }
}
