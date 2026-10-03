// 🥾 Spit & Shine: Lil' Nubbin's shoeshine throne in front of a mustard shack with a giant wooden boot on the roof.
// Gag (W4): Nubbin spits on the boot, buffs, and the boot flashes a star glint. Stock: a tip jar with a coin heap.
// L1 throne + shack → L25 second throne, striped awning, blade sign → L100 "Boot Emporium" with a golden boot.
import { COLORS, EXTRA_HATS, cardCam, falseFront, porch, crate, blade, signBoard, hats, hatted, particles, tufts, rock, cactus, barrel, lantern, tone } from './western.js?v=20261004c';
import { createConstruction, finishPlot } from './construction.js?v=20261004c';

const BX = -2.9, FZ = 0.3, W = 5.6, D = 4.6, H = 3.0, FH = 4.6;
const THRONE = [1.9, 1.8];

export default function buildPlot(kit, { line, palette, rng }) {
  const P = kit.plot({ id: 'shine', line, palette, rng, seed: 13, colors: { ...COLORS, boot: '#6b3a24', bootL: '#8a4e30', leather: '#4a2a1a', polish: '#2a1e1e' } });
  const { b, t1, t2, lot } = P;

  // the shack
  falseFront(b, { x: BX, fz: FZ, w: W, d: D, h: H, fh: FH, front: 'mustard', wall: tone(COLORS.mustard, 0.8), parapet: 'arched', door: -1.2, windows: [1.3], winW: 1.5, trim: 'cream' });
  porch(b, BX - W / 2 - 0.1, BX + W / 2 + 0.1, FZ, 2.5, { awnY: 2.6, awn: 'tin', posts: 3, stepX: BX - 1.2 });
  signBoard(b, BX, H + 0.25, FZ + 0.18, 3.6, 0.85, { board: 'cream', trim: 'brass' });
  bootShape(b, BX, H + 0.35, FZ + 0.32, 0.55, 'boot');
  bigBoot(b, BX + 1.6, FH + 0.85, FZ - 1.4, 1.0, 'bootL');
  throne(b, THRONE[0], THRONE[1]);
  // tip jar on a stool + polish kit
  b.cyl('plank3', THRONE[0] - 1.5, 0, THRONE[1] + 0.8, 0.28, 0.55, 0, { sides: 8, taper: 1 });
  b.cyl({ c: '#d8ecea', r: 0.08 }, THRONE[0] - 1.5, 0.55, THRONE[1] + 0.8, 0.22, 0.5, 0, { sides: 11, taper: 0.9 });
  crate(b, THRONE[0] + 1.4, 0, THRONE[1] + 0.6, 0.7, 0.5);
  for (let i = 0; i < 3; i++) b.cyl(['polish', '#c9473a', 'gold'][i], THRONE[0] + 1.25 + i * 0.18, 0.45, THRONE[1] + 0.55, 0.07, 0.1, 0, { sides: 7, taper: 1 });
  // a bench of muddy-booted waiting customers
  b.slab('plank2', BX - 0.6, 0.35, FZ + 1.2, 2.4, 0.42, 0.5, { round: 0.04 });
  for (const k of [-1, 1]) b.slab('plank3', BX - 0.6 + k * 1.0, 0, FZ + 1.2, 0.12, 0.4, 0.45, { round: 0.02, taper: 0 });
  lantern(b, BX + W / 2 - 0.3, 2.0, FZ + 2.0);
  blade(b, BX - W / 2 + 0.3, 1.6, FZ + 1.6, { board: 'ownTeal' });
  tufts(b, [[-5.5, 3.4], [5.4, 3.6], [5.2, -2.0]]);
  rock(b, 5.3, 2.9, 1.0);
  cactus(b, 4.6, -2.6, 0.85, 2);
  barrel(b, BX + W / 2 + 0.55, 0, FZ + 0.1, 0.85);

  // lot: dirt, a few rocks and tufts (stakes come from the construction kit)
  lot.slab('dirtM', 0, -0.02, 0, 11.6, 0.05, 8, { round: 0.04, taper: 0, noAo: true });
  tufts(lot, [[-5.5, 3.4], [5.4, 3.6], [0, -1.0]]);
  rock(lot, 5.3, 2.9, 1.0);
  cactus(lot, 4.6, -2.6, 0.85, 2);

  // L25: a second throne, a striped awning over both, a boot blade sign
  throne(t1, THRONE[0] + 2.3, THRONE[1] - 0.2);
  t1.awning('teal', THRONE[0] + 1.15, 2.7, THRONE[1] - 0.2, 4.6, 1.8, 0, { alt: 'cream', drop: 0.4 });
  for (const k of [-1, 1]) t1.cyl('raw2', THRONE[0] + 1.15 + k * 2.2, 0, THRONE[1] + 0.6, 0.07, 2.4, 0, { sides: 6, taper: 1 });
  // L100: the Boot Emporium annex with a display window and a gilded boot
  {
    // an upper display storey with boots in the windows, and the roof boot gilded
    const y = FH;
    t2.slab('teal', BX, y - 0.1, FZ - 1.6, W - 0.6, 2.4, 3.0, { round: 0.08, taper: 0.02 });
    t2.roof('tin', BX, y + 2.25, FZ - 1.6, W - 0.4, 0.8, 3.0, 0, { over: 0.2 });
    for (const dx of [-1.4, 1.4]) { t2.slab('glass', BX + dx, y + 0.5, FZ - 0.08, 1.5, 1.3, 0.05, { round: 0.01, taper: 0, noAo: true }); t2.slab('cream', BX + dx, y + 0.38, FZ - 0.05, 1.7, 0.14, 0.2, { round: 0.03, taper: 0 }); bootShape(t2, BX + dx, y + 0.7, FZ + 0.0, 0.4, 'gold'); }
    bigBoot(t2, BX + 1.6, y + 3.0, FZ - 1.6, 1.0, 'gold');
  }

  const coin = kit.builder(P.pal);
  coin.cyl('gold', 0, 0, 0, 0.5, 0.18, 0, { sides: 11, taper: 1 });
  P.pile({ at: [THRONE[0] - 1.5, 0.62, THRONE[1] + 0.8], geo: coin.geometry({ ao: 0 }), size: 0.32, max: 14, layout: 'heap', range: [0, 0.6] });
  P.pile({ at: [THRONE[0] - 1.9, 0.02, THRONE[1] + 1.4], geo: coin.geometry({ ao: 0 }), size: 0.38, max: 16, layout: 'heap', range: [0.5, 1] });

  // People: Nubbin (0), the customer on the throne (1), second shiner + customer at L25 (2, 3), bench waiters (4, 5), passers-by (6, 7)
  const SC = 1.08;
  const folk = hatted(P.crowd({ count: 8, seed: 31, scale: SC }), EXTRA_HATS, ['#c9b08a', '#2e2630', '#8a5a3a', '#e6d6b8', '#6a5a3a', '#3a2c2c', '#b5483a', '#7a5236'], [0.8, 1.45, 0.85, 1.2, 0.75, 0.8, 0.9, 0.9]);
  folk.dress(0, 'nubbin');
  folk.look(1, { top: '#5E8F8C', bot: '#3a2c2c', skin: 1, hair: 4, style: 1 }).body(1, 1.2, 0.95, 1.05);
  folk.look(2, { top: '#D9A441', bot: '#5a4632', skin: 4, hair: 0, style: 2 }).body(2, 1.3, 0.62, 0.8);
  folk.look(3, { top: '#e9e4da', bot: '#6b5a7d', skin: 0, hair: 1, style: 3 }).body(3, 1.2, 1.0, 1.0);
  for (const i of [4, 5]) folk.look(i, { top: i === 4 ? '#8FA27A' : '#C98B7E', bot: '#4a5878', skin: i, hair: i + 1, style: i % 5 });
  P.walkers(folk, { ids: [6, 7], paths: [[[-6, 4.0], [6, 3.9]], [[6, 4.4], [-6, 4.5]]], loop: 'wrap', speed: 1.0, ownedOnly: false });

  const fx = particles(kit, P, (n) => { n.ball({ c: '#e8f4ff', r: 0.1, g: 0.6 }, 0, 0, 0, 0.5, { detail: 1 }); }, 8);
  const glint = particles(kit, P, (n) => { n.ball('star', 0, 0, 0, 0.3, { detail: 0 }); for (let i = 0; i < 4; i++) n.cone('star', Math.cos(i * 1.5708) * 0.25, Math.sin(i * 1.5708) * 0.25, 0, 0.12, 0.7, 0, { sides: 4, rz: i * 1.5708 - Math.PI / 2 }); }, 3);
  let lastSpit = -1;

  const C = createConstruction(kit, P, { x: BX, fz: FZ, w: W, d: D, h: H, fh: FH, parapet: 'arched', ext: { x: THRONE[0] + 1.2, z: THRONE[1] - 1.2, w: 4.2, h: 3.4 }, yard: [1.0, 2.2], stake: [1.4, 2.6] });

  return finishPlot(P, C, {
    w: 12, cardW: 11, d: 9, h: FH + 2,
    camera: cardCam([-1.4, 1.9, 1.4], 12, 26, 12.5, 42),
    pileAnchor: [THRONE[0] - 1.5, 0.62, THRONE[1] + 0.8], pileR: 1.2,
    exit: [[THRONE[0], 3.6], [5, 4.0], [6.5, 4.2]],
    focus: [THRONE[0] - 2, 1.2],
    anchors: { throne: [THRONE[0], 1.1, THRONE[1]], boot: [THRONE[0] + 0.55, 0.95, THRONE[1] + 0.75], tipJar: [THRONE[0] - 1.5, 1.05, THRONE[1] + 0.8], roofBoot: [BX + 1.6, FH + 1.5, FZ - 1.4] },
    update(dt, stats, time, tier, ctx) {
      if (!ctx.owned) { for (let i = 0; i < 6; i++) folk.hide(i); fx.visible = glint.visible = false; return; }
      fx.visible = glint.visible = true;
      const cyc = Math.max(1.6, stats?.cycleSec ?? 2), ph = (time % cyc) / cyc;
      // Nubbin crouches at the customer's boots; spit at ph≈0.15, buff, glint at ph≈0.8
      folk.set(0, THRONE[0] + 0.55, 0.02, THRONE[1] + 1.35, Math.PI + 0.25, ph < 0.15 ? 0 : 3, 0, ph < 0.15 ? 1 : 7);
      folk.set(1, THRONE[0], 0.95, THRONE[1] - 0.05, 0, 5, 0, 1.2);
      const spit = Math.floor(time / cyc);
      if (spit !== lastSpit) {
        lastSpit = spit;
        fx.emit(THRONE[0] + 0.5, 1.2, THRONE[1] + 1.1, 0, 1.0, -0.7, 0.55, 0.12, 4.5);
        glint.emit(THRONE[0] + 0.5, 0.95, THRONE[1] + 0.7, 0, 0.15, 0, 0.6, 0.55, 0, 1);
      }
      if (ph > 0.75 && ph < 0.78) glint.emit(THRONE[0] + 0.45, 1.0, THRONE[1] + 0.75, 0, 0.1, 0, 0.7, 0.7, 0, 1);
      fx.step(dt);
      glint.step(dt, (u) => Math.sin(u * Math.PI));
      if (ctx.vt >= 1) {
        folk.set(2, THRONE[0] + 2.85, 0.02, THRONE[1] + 1.2, Math.PI + 0.25, 3, 1.3, 7);
        folk.set(3, THRONE[0] + 2.3, 0.95, THRONE[1] - 0.25, 0, 5, 0, 1.2);
      } else { folk.hide(2); folk.hide(3); }
      folk.set(4, BX - 1.2, 0.52, FZ + 1.15, 0, 5, 0, 1);
      folk.set(5, BX + 0.0, 0.52, FZ + 1.15, 0, (time % 9) < 4 ? 6 : 5, 0.7, 1);
    },
  });

  function throne(B, x, z) {
    B.slab('plank3', x, 0, z, 1.6, 0.85, 1.3, { round: 0.06 });
    B.slab('plank2', x, 0.0, z + 0.85, 1.4, 0.32, 0.45, { round: 0.04 });
    B.slab('#7a2e2e', x, 0.85, z, 1.2, 0.22, 0.95, { round: 0.1 });
    B.slab('#7a2e2e', x, 0.95, z - 0.45, 1.2, 1.15, 0.22, { round: 0.1 });
    for (const k of [-1, 1]) B.slab('plank', x + k * 0.62, 0.95, z, 0.16, 0.5, 0.95, { round: 0.05 });
    B.slab('brass', x, 2.05, z - 0.45, 1.35, 0.14, 0.26, { round: 0.05 });
    B.ball('brass', x, 2.25, z - 0.45, 0.14, { detail: 0 });
    for (const k of [-1, 1]) { B.cyl('brass', x + k * 0.25, 0.45, z + 0.75, 0.05, 0.42, 0, { sides: 5, taper: 1 }); B.slab('brass', x + k * 0.25, 0.85, z + 0.78, 0.22, 0.05, 0.3, { round: 0.02, taper: 0 }); }
    B.contact(x, z + 0.2, 1.8, 1.8);
  }
  function bootShape(B, x, y, z, s, c) {
    B.slab(c, x - 0.05 * s, y, z, 0.55 * s, 1.1 * s, 0.1, { round: 0.12 * s, taper: 0, noAo: true });
    B.slab(c, x + 0.25 * s, y, z, 1.0 * s, 0.4 * s, 0.1, { round: 0.18 * s, taper: 0, noAo: true });
    B.slab('leather', x + 0.1 * s, y - 0.03, z, 1.1 * s, 0.1 * s, 0.11, { round: 0.03, taper: 0, noAo: true });
    B.slab('brass', x - 0.05 * s, y + 0.9 * s, z + 0.02, 0.6 * s, 0.1 * s, 0.1, { round: 0.03, taper: 0, noAo: true });
  }
  function bigBoot(B, x, y, z, s, c) {
    B.slab(c, x, y, z, 0.9 * s, 1.9 * s, 0.75 * s, { round: 0.22 * s, taper: -0.05 });
    B.slab(c, x + 0.55 * s, y, z, 1.9 * s, 0.75 * s, 0.75 * s, { round: 0.3 * s, taper: 0.05 });
    B.slab('leather', x + 0.4 * s, y - 0.12 * s, z, 2.1 * s, 0.16 * s, 0.82 * s, { round: 0.05, taper: 0 });
    B.slab('leather', x - 0.1 * s, y - 0.12 * s, z, 0.45 * s, 0.32 * s, 0.82 * s, { round: 0.05, taper: 0 });
    B.slab(tone(COLORS.mustard, 1), x, y + 1.6 * s, z, 0.98 * s, 0.22 * s, 0.82 * s, { round: 0.06, taper: 0 });
    B.cyl('brass', x - 0.55 * s, y + 0.25 * s, z, 0.14 * s, 0.1 * s, 0, { sides: 9, taper: 1, rz: Math.PI / 2 });
    for (const k of [-1, 1]) B.cyl('raw2', x + k * 0.3 * s, y - 0.9 * s, z, 0.06, 0.95 * s, 0, { sides: 5, taper: 1 });
  }
}
