// 🛁 Tuppenny Tubs ("Water Changed Tuesdays"): a sage bathhouse with a deck of steaming wooden tubs, men in red long johns
// up to their chins, a rubber duck, a laundry line of long johns and a wood-fired boiler. Stock: barrels of used
// bathwater (murky, sold to the saloon as "house beer"). Gag: every few seconds a bather leaps up and the duck flies.
// L1 two tubs → L25 a third tub behind a rose privacy screen → L100 a water tower piping hot water to the deck.
import * as THREE from 'three';
import { COLORS, EXTRA_HATS, cardCam, falseFront, porch, win, barrel, lantern, blade, signBoard, hats, hatted, particles, tufts, rock, tone } from './western.js?v=20261004a';
import { createConstruction, finishPlot } from './construction.js?v=20261004a';

const BX = -3.0, FZ = 0.4, W = 6.0, D = 5.0, H = 3.2, FH = 5.0;
const TUBS = [[1.4, 1.2], [3.6, 0.6], [5.0, 2.4]];

export default function buildPlot(kit, { line, palette, rng }) {
  const P = kit.plot({ id: 'tubs', line, palette, rng, seed: 19, colors: { ...COLORS, murk: { c: '#8a9a5a', r: 0.15 }, bath: { c: '#9cc7c2', r: 0.1 }, john: '#c4473a', duck: '#ffd23a', fire: { c: '#ff8a3a', r: 0.4, g: 2.2 } } });
  const { b, t1, t2, lot } = P;

  falseFront(b, { x: BX, fz: FZ, w: W, d: D, h: H, fh: FH, front: 'sage', wall: tone(COLORS.sage, 0.82), parapet: 'gabled', door: 1.4, windows: [-1.3], winW: 1.6, trim: 'cream' });
  porch(b, BX - W / 2 - 0.1, BX + W / 2 + 0.1, FZ, 2.5, { awnY: 2.7, awn: ['teal', 'cream'], posts: 3, stepX: BX + 1.4 });
  signBoard(b, BX, H + 0.3, FZ + 0.18, 4.2, 1.0, { board: 'cream', trim: 'brass' });
  tubIcon(b, BX, H + 0.55, FZ + 0.3);
  blade(b, BX - W / 2 + 0.3, 1.6, FZ + 1.6, { board: 'ownTeal' });
  lantern(b, BX + W / 2 - 0.3, 2.0, FZ + 2.0);
  // the deck, tubs, boiler and the laundry line
  b.slab('plank3', 3.2, 0, 1.3, 6.2, 0.22, 4.0, { round: 0.04 });
  for (let i = 0; i < 14; i++) b.slab(tone(COLORS.plank, 0.95 + (i % 3) * 0.05), 0.4 + i * 0.43, 0.2, 1.3, 0.4, 0.05, 3.9, { round: 0.01, taper: 0, noAo: true });
  for (const [x, z] of TUBS.slice(0, 2)) tub(b, x, z);
  boiler(b, 5.4, -0.4);
  b.cyl('raw2', 0.4, 0, -0.9, 0.07, 2.4, 0, { sides: 5, taper: 1 });
  b.cyl('raw2', 5.9, 0, -1.4, 0.07, 2.4, 0, { sides: 5, taper: 1 });
  b.slab('rope', 3.15, 2.25, -1.15, 5.6, 0.02, 0.02, { round: 0, taper: 0, ry: 0.09, noAo: true });
  for (let i = 0; i < 3; i++) longjohns(b, 1.4 + i * 1.6, 2.25, -1.0 - i * 0.14, i === 1 ? 'cream' : 'john');
  for (let i = 0; i < 2; i++) b.slab('canvas', 4.0 + i * 0.3, 0.22, 2.9, 0.5, 0.05, 0.35, { round: 0.02, ry: i * 0.4, noAo: true });
  tufts(b, [[-6.0, 3.4], [6.2, 3.6], [-6.2, -2.4]]);
  rock(b, -5.9, 2.4, 0.9);

  lot.slab('dirtM', 0, -0.02, 0, 12.6, 0.05, 8, { round: 0.04, taper: 0, noAo: true });
  tufts(lot, [[-6.0, 3.4], [6.2, 3.6], [0, -1.0]]);
  rock(lot, -5.9, 2.4, 0.9);

  // L25: third tub behind a rose privacy screen
  tub(t1, TUBS[2][0], TUBS[2][1]);
  for (let i = 0; i < 3; i++) { t1.slab('rose', 5.75 - i * 0.02, 0.2, 1.5 + i * 0.75, 0.06, 1.7, 0.72, { round: 0.03, taper: 0, ry: (i - 1) * 0.25 }); t1.cyl('raw2', 5.78, 0.2, 1.12 + i * 0.75, 0.04, 1.8, 0, { sides: 4, taper: 1 }); }
  // L100: a water tower on stilts piping hot water over the deck
  {
    const tx = -0.6, tz = -3.0;
    for (const [dx, dz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) t2.cyl('raw2', tx + dx, 0, tz + dz, 0.1, 5.0, 0, { sides: 6, taper: 0.9 });
    t2.slab('raw', tx, 2.4, tz, 2.0, 0.1, 0.1, { round: 0.02, taper: 0, rz: 0.9 });
    t2.cyl('plank', tx, 4.9, tz, 1.3, 1.9, 0, { sides: 13, taper: 0.96 });
    t2.cone('tin', tx, 6.75, tz, 1.45, 0.8, 0, { sides: 13, curve: 1 });
    for (const h of [0.3, 1.4]) t2.cyl('iron', tx, 4.9 + h, tz, 1.33, 0.08, 0, { sides: 13, taper: 1, noAo: true });
    t2.cyl('brass', tx + 1.2, 5.0, tz + 0.6, 0.09, 2.8, 0, { sides: 6, taper: 1, rx: 1.1, rz: -0.6 });
    t2.cyl('brass', 2.6, 2.2, 0.0, 0.09, 2.4, 0, { sides: 6, taper: 1, rz: Math.PI / 2 });
  }

  const brl = kit.builder(P.pal);
  brl.cyl('plank', 0, 0, 0, 0.42, 0.95, 0, { sides: 11, taper: 0.9 });
  for (const h of [0.12, 0.78]) brl.cyl('iron', 0, h, 0, 0.44, 0.07, 0, { sides: 11, taper: 0.98, noAo: true });
  brl.cyl('murk', 0, 0.95, 0, 0.36, 0.03, 0, { sides: 11, taper: 1 });
  brl.ball('#6a7a3a', 0.1, 0.98, 0.05, 0.08, { detail: 0 });
  const PILE = [-5.4, 0.02, 1.9];
  P.pile({ at: PILE, geo: brl.geometry({ ao: 0.15, aoH: 0.4 }), size: 0.75, max: 9, cols: 3, spacing: 1.2 });

  // ducks + bathers. Bathers sit in the tubs, chins at the waterline; a passer-by and Pickles the manager on the porch
  const ducks = P.instances((d) => {
    d.ball('duck', 0, 0, 0, 0.24, { sx: 1.3, sy: 0.8, detail: 1, smooth: true });
    d.ball('duck', 0.18, 0.2, 0, 0.15, { detail: 1, smooth: true });
    d.slab('#ff8a2a', 0.36, 0.17, 0, 0.14, 0.06, 0.1, { round: 0.02, taper: 0 });
    d.ball('#241a2c', 0.26, 0.25, 0.08, 0.025, { detail: 0 });
    d.ball('#241a2c', 0.26, 0.25, -0.08, 0.025, { detail: 0 });
  }, 3, { cast: false, radius: 8 });
  const steam = particles(kit, P, (n) => { n.ball('steam', 0, 0, 0, 1, { detail: 1, smooth: true }); }, 24);
  const fire = particles(kit, P, (n) => { n.ball('fire', 0, 0, 0, 1, { detail: 0 }); }, 6);
  const SC = 1.08;
  const folk = hatted(P.crowd({ count: 6, seed: 17, scale: SC }), EXTRA_HATS, ['#c9b08a', '#3a2c2c', '#e6d6b8', '#8a5a3a', '#6a5a3a', '#b5483a'], [1.1, 1.3, 0.9, 0.8, 1.0, 0.8]);
  for (let i = 0; i < 3; i++) folk.look(i, { top: '#c4473a', bot: '#c4473a', skin: i, hair: i * 2, style: i + 1 }).body(i, 1.25, 0.9, 1.0);
  for (let i = 0; i < 3; i++) folk.look(i, { expr: 'grin' });
  folk.look(3, { top: '#e9e4da', bot: '#6b5a7d', skin: 1, hair: 3, style: 0 }).body(3, 1.15, 0.95, 1.0);
  folk.look(4, { top: '#8FA27A', bot: '#4a3a32', skin: 3, hair: 0, style: 1 });
  folk.look(5, { top: '#D9A441', bot: '#4a5878', skin: 0, hair: 5, style: 2 });
  P.walkers(folk, { ids: [4, 5], paths: [[[-6.4, 4.0], [6.4, 3.9]], [[6.4, 4.4], [-6.4, 4.5]]], loop: 'wrap', speed: 0.9, ownedOnly: false });
  const r = (() => { let a = 9; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();

  const C = createConstruction(kit, P, { x: BX, fz: FZ, w: W, d: D, h: H, fh: FH, parapet: 'gabled', ext: { x: 4.6, z: 0.4, w: 3.6, h: 3.4 }, yard: [1.2, 2.2], stake: [1.6, 2.6] });

  return finishPlot(P, C, {
    w: 13, cardW: 12, d: 9, h: FH + 2,
    camera: cardCam([-0.8, 1.9, 1.2], 12, 26, 14, 42),
    pileAnchor: [PILE[0], 0.8, PILE[2]], pileR: 1.4,
    exit: [[BX + 1.4, 3.4], [5, 4.0], [6.6, 4.2]],
    focus: [1.5, 1.2],
    anchors: { tub1: [TUBS[0][0], 0.9, TUBS[0][1]], tub2: [TUBS[1][0], 0.9, TUBS[1][1]], duck: [TUBS[0][0], 0.9, TUBS[0][1]], laundry: [3.15, 2.25, -1.15], barrels: PILE },
    update(dt, stats, time, tier, ctx) {
      const owned = ctx.owned;
      steam.visible = fire.visible = owned;
      if (!owned) { for (let i = 0; i < 4; i++) folk.hide(i); for (let i = 0; i < 3; i++) ducks.hide(i); ducks.commit(); return; }
      const n = ctx.vt >= 1 ? 3 : 2;
      const cyc = 7.5, k = Math.floor(time / cyc), u = (time % cyc) / cyc, who = k % n;
      for (let i = 0; i < 3; i++) {
        if (i >= n) { folk.hide(i); ducks.hide(i); continue; }
        const [x, z] = TUBS[i];
        const leap = i === who && u > 0.6 && u < 0.8 ? Math.sin(((u - 0.6) / 0.2) * Math.PI) : 0;
        folk.set(i, x, 0.12 + leap * 0.9, z - 0.05, 0.3 + i * 0.6, leap > 0.2 ? 4 : 5, i, 1.2);
        const bob = Math.sin(time * 2.4 + i * 2) * 0.03;
        const dj = i === who && u > 0.62 && u < 0.86 ? Math.sin(((u - 0.62) / 0.24) * Math.PI) : 0;
        ducks.place(i, x + 0.45, 0.88 + bob + dj * 1.3, z + 0.35, time * 0.4 + i + dj * 6, 1, 0, dj * 0.8);
        if (r() < dt * 3) steam.emit(x + (r() - 0.5) * 0.8, 1.0, z + (r() - 0.5) * 0.6, 0.05, 0.5 + r() * 0.3, 0.02, 2.2, 0.32 + r() * 0.2);
      }
      ducks.commit();
      if (r() < dt * 4) fire.emit(5.4 + (r() - 0.5) * 0.2, 0.55, -0.4 + 0.5, (r() - 0.5) * 0.2, 0.6, 0.1, 0.5, 0.12);
      if (r() < dt * 1.5) steam.emit(5.4, 2.6, -0.4, 0.1, 0.8, 0, 2.5, 0.35);
      steam.step(dt, (t) => Math.min(1, t * 3) * (1 - t * 0.5) * (1 + t));
      fire.step(dt);
      folk.set(3, BX - 1.6, 0.37, FZ + 1.3, 0.3, (time % 10) < 6 ? 6 : 0, 0.4, 1.0);
    },
  });

  function tub(B, x, z) {
    B.cyl('plank', x, 0.22, z, 0.95, 0.7, 0, { sides: 13, taper: 1.06 });
    for (const h of [0.12, 0.55]) B.cyl('iron', x, 0.22 + h, z, 0.98 + h * 0.05, 0.06, 0, { sides: 13, taper: 1, noAo: true });
    B.cyl('bath', x, 0.82, z, 0.88, 0.04, 0, { sides: 13, taper: 1 });
    B.cyl('plank3', x, 0.92, z, 1.0, 0.04, 0, { sides: 13, taper: 1, noAo: true });
    B.slab('plank2', x + 0.9, 0.22, z - 0.4, 0.5, 0.3, 0.4, { round: 0.04, ry: 0.4 });
    B.contact(x, z, 2.0, 2.0);
  }
  function longjohns(B, x, y, z, c) {
    B.slab(c, x, y - 0.75, z, 0.5, 0.65, 0.08, { round: 0.06, taper: 0, sway: 0.05 });
    for (const k of [-1, 1]) B.slab(c, x + k * 0.13, y - 1.45, z, 0.2, 0.72, 0.07, { round: 0.05, taper: 0, sway: 0.08, rz: k * 0.08 });
    for (const k of [-1, 1]) B.slab(c, x + k * 0.35, y - 0.7, z, 0.18, 0.55, 0.07, { round: 0.05, taper: 0, sway: 0.06, rz: k * 0.35 });
    B.slab(tone(COLORS.cream, 0.9), x, y - 0.42, z + 0.04, 0.22, 0.14, 0.04, { round: 0.02, taper: 0, sway: 0.05 });
    for (const k of [-1, 1]) B.slab('raw', x + k * 0.2, y - 0.06, z, 0.04, 0.14, 0.05, { round: 0, taper: 0 });
  }
  function boiler(B, x, z) {
    B.cyl('iron', x, 0, z, 0.55, 1.2, 0, { sides: 11, taper: 0.92 });
    B.slab('fire', x, 0.25, z + 0.48, 0.42, 0.3, 0.06, { round: 0.02, taper: 0 });
    B.cyl('iron', x, 1.2, z, 0.14, 1.4, 0, { sides: 7, taper: 1 });
    B.cone('iron', x, 2.55, z, 0.26, 0.2, 0, { sides: 7, curve: 1 });
    B.cyl('brass', x - 0.6, 0.8, z + 0.4, 0.06, 1.6, 0, { sides: 5, taper: 1, rz: 1.2 });
    for (let i = 0; i < 4; i++) B.cyl('raw', x + 0.9 + (i % 2) * 0.12, 0.1 + Math.floor(i / 2) * 0.2, z + 0.3, 0.09, 0.9, 0, { sides: 6, taper: 1, rx: Math.PI / 2 });
    B.contact(x, z, 1.4, 1.4);
  }
  function tubIcon(B, x, y, z) {
    B.slab('#5E8F8C', x, y, z, 1.4, 0.35, 0.06, { round: 0.12, taper: 0, noAo: true });
    for (const k of [-1, 1]) B.slab('#5E8F8C', x + k * 0.5, y - 0.18, z, 0.1, 0.22, 0.06, { round: 0.03, taper: 0, noAo: true });
    for (let i = 0; i < 3; i++) B.slab('#c9d6d4', x - 0.35 + i * 0.35, y + 0.45, z, 0.1, 0.3, 0.05, { round: 0.04, taper: 0, rz: 0.3, noAo: true });
    B.ball('duck', x + 0.45, y + 0.38, z, 0.12, { detail: 0, sz: 0.4, noAo: true });
  }
}
void THREE; void win; void barrel;
