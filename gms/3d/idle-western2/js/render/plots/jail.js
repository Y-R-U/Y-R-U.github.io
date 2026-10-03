// ⭐ Sheriff's Office & Jail: a stone-and-adobe office with an open barred cell block facing the street. The drunks inside
// sway arm-in-arm and sing (notes rise through the bars); Sheriff Wendell rocks nervously on the porch; a badge-shaped
// weather vane spins on the roof; wanted posters by the door. Stock: sacks of bail money. Bought from a coward (W13):
// while unowned the lot shows the office with Pomfrey's board.
// L1 one cell → L25 a second cell + a jail wagon → L100 a lookout tower with a bell.
import * as THREE from 'three';
import { COLORS, EXTRA_HATS, cardCam, falseFront, porch, win, lantern, blade, signBoard, hats, hatted, particles, tufts, rock, wheel, cart, tone } from './western.js?v=20261004c';
import { createConstruction, finishPlot } from './construction.js?v=20261004c';

const BX = -2.8, FZ = 0.5, W = 5.6, D = 5.4, H = 3.4, FH = 5.4;
const CELL = { x: 2.0, z: -0.4, w: 4.2, d: 3.0, h: 3.0 };

export default function buildPlot(kit, { line, palette, rng }) {
  const P = kit.plot({ id: 'jail', line, palette, rng, seed: 43, colors: { ...COLORS, adobe: '#d9b48a', adobe2: '#c49a6e', stoneJ: '#b8a690', sack: '#c9b089', badge: { c: '#f2c84a', r: 0.25, m: 0.9 }, poster: '#efe2c4' } });
  const { b, t1, t2, lot } = P;

  office(b, true);
  office(lot, false);
  cellBlock(b, CELL.x, CELL.z, CELL.w);
  tufts(b, [[-6.2, 3.6], [6.2, 3.8], [-6.0, -2.6]]);
  rock(b, 6.0, -2.6, 1.0);
  cellBlock(lot, CELL.x, CELL.z, CELL.w);
  tufts(lot, [[-6.2, 3.6], [6.2, 3.8]]);

  // L25: the jail wagon parked in front of the cells
  {
    cart(t1, 4.2, 3.3, { ry: 0, c: 'soot', side: 'iron' });
    for (let i = 0; i < 5; i++) t1.cyl('iron', 3.3 + i * 0.45, 0.85, 3.3, 0.03, 1.2, 0, { sides: 4, taper: 1 });
    t1.slab('soot', 4.2, 2.05, 3.3, 2.5, 0.12, 1.4, { round: 0.04 });
  }
  // L100: a lookout tower with a bell behind the office
  {
    const tx = BX - 1.4, tz = -3.2;
    for (const [dx, dz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) t2.cyl('raw2', tx + dx, 0, tz + dz, 0.09, 6.4, 0, { sides: 5, taper: 0.85 });
    t2.slab('plank', tx, 5.4, tz, 2.0, 0.15, 2.0, { round: 0.03 });
    for (const s of [-1, 1]) { t2.slab('raw', tx, 5.55, tz + s * 0.95, 2.0, 0.6, 0.08, { round: 0.02, taper: 0 }); t2.slab('raw', tx + s * 0.95, 5.55, tz, 0.08, 0.6, 2.0, { round: 0.02, taper: 0 }); }
    t2.cone('tin', tx, 7.0, tz, 1.6, 1.0, 0, { sides: 4, curve: 1, ry: Math.PI / 4 });
    t2.cone('brass', tx, 6.4, tz, 0.3, 0.5, 0, { sides: 9, curve: 0.6 });
    for (const [dx, dz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) t2.cyl('raw2', tx + dx, 5.5, tz + dz, 0.06, 1.6, 0, { sides: 5, taper: 1 });
  }

  // the badge weather vane (dynamic spin)
  const vane = P.dynamic((d) => { badge(d, 0, 0, 0, 0.5, 'badge'); d.slab('iron', 0, -0.6, 0, 0.06, 0.6, 0.06, { round: 0, taper: 0 }); }, { tier: 0, cast: false });
  vane.position.set(BX + 1.2, FH + 1.6, FZ - 1.2);
  // the sheriff's rocking chair (dynamic rock)
  const chair = P.dynamic((d) => {
    d.slab('plank2', 0, 0.45, 0, 0.62, 0.08, 0.6, { round: 0.03 });
    d.slab('plank2', 0, 0.5, -0.28, 0.62, 0.8, 0.07, { round: 0.03, rx: -0.15 });
    for (const k of [-1, 1]) { d.slab('plank3', k * 0.3, 0, 0, 0.06, 0.06, 1.0, { round: 0.03, taper: 0, rx: 0 }); for (const z of [-0.22, 0.22]) d.cyl('plank3', k * 0.3, 0.03, z, 0.035, 0.45, 0, { sides: 5, taper: 1 }); }
  }, { tier: 0, cast: false });
  const CH = [BX - 1.7, FZ + 1.3];
  const notes = particles(kit, P, (n) => { n.ball('#2a1e2a', 0, 0, 0, 0.35, { sx: 1.25, sz: 0.6, detail: 1 }); n.slab('#2a1e2a', 0.33, 0, 0, 0.1, 1.1, 0.1, { round: 0, taper: 0 }); n.slab('#2a1e2a', 0.5, 0.95, 0, 0.36, 0.12, 0.1, { round: 0, taper: 0, rz: -0.5 }); }, 10);

  const sk = kit.builder(P.pal);
  sk.ball('sack', 0, 0.38, 0, 0.42, { sx: 1.0, sy: 0.95, sz: 0.85, detail: 1, smooth: true });
  sk.cyl('sack', 0, 0.72, 0, 0.12, 0.22, 0, { sides: 7, taper: 1.6 });
  sk.cyl('rope', 0, 0.74, 0, 0.13, 0.06, 0, { sides: 7, taper: 1 });
  sk.slab('badge', 0, 0.38, 0.35, 0.22, 0.22, 0.04, { round: 0.1, taper: 0 });
  const PILE = [BX - 1.1, 0.37, FZ + 0.6];
  P.pile({ at: [BX + 1.5, 0.37, FZ + 0.6], geo: sk.geometry({ ao: 0.12 }), size: 0.75, max: 10, cols: 3, spacing: 1.0 });

  const SC = 1.08;
  // 0–2 the singing drunks, 3 Sheriff Wendell, 4 a deputy-ish passer-by
  const folk = hatted(P.crowd({ count: 5, seed: 53, scale: SC }), EXTRA_HATS, ['#6a5a3a', '#3a2c2c', '#b5483a', '#e6d6b8', '#8a5a3a'], [0.95, 1.1, 0.85, 1.4, 0.9]);
  folk.look(0, { top: '#C98B7E', bot: '#5a4632', skin: 1, hair: 2, style: 4 }).body(0, 1.25, 0.95, 1.0);
  folk.look(1, { top: '#8FA27A', bot: '#4a5878', skin: 3, hair: 0, style: 1 }).body(1, 1.2, 0.95, 1.05);
  folk.look(2, { top: '#D9A441', bot: '#6b5a7d', skin: 0, hair: 5, style: 3 }).body(2, 1.3, 0.9, 0.95);
  folk.dress(3, 'wendell').look(3, { expr: 'shock' });
  for (let i = 0; i < 3; i++) folk.look(i, { expr: 'sozzled' });
  P.walkers(folk, { ids: [4], paths: [[[-6.5, 4.2], [6.5, 4.2]]], loop: 'wrap', speed: 0.9, ownedOnly: false });
  let nextNote = 0;

  const C = createConstruction(kit, P, { x: BX, fz: FZ, w: W, d: D, h: H, fh: FH, parapet: 'flat', stakes: false, ext: { x: 4.2, z: 2.2, w: 3, h: 2.6 } });

  return finishPlot(P, C, {
    w: 13, cardW: 12, d: 9, h: FH + 2,
    acquired: true,
    camera: cardCam([-0.2, 2.0, 0.8], 12, 28, 12.5, 42),
    pileAnchor: [BX + 1.5, 0.8, FZ + 0.6], pileR: 1.2,
    exit: [[0, 3.4], [5, 4.0], [6.6, 4.2]],
    focus: [0, 1],
    anchors: { cell: [CELL.x, 1.2, CELL.z + 1.4], cellDoor: [CELL.x - 1.2, 0.3, CELL.z + 1.6], jailWagon: [4.2, 1.0, 3.3], wagon: [4.2, 1.0, 3.3], doors: [BX + 0.6, 0.35, FZ + 0.3], center: [BX + 1.5, 0.0, FZ + 2.4], sheriff: [CH[0], 0.37, CH[1]], door: [BX + 0.6, 0.35, FZ + 0.3], vane: [BX + 1.2, FH + 1.6, FZ - 1.2] },
    update(dt, stats, time, tier, ctx) {
      vane.rotation.y = time * 1.4 + Math.sin(time * 0.7) * 2;
      const owned = ctx.owned;
      notes.visible = owned;
      if (!owned) { for (let i = 0; i < 4; i++) folk.hide(i); return; }
      // drunks sway arm in arm (cheer clip, out of sync — badly)
      for (let i = 0; i < 3; i++) folk.set(i, CELL.x - 1.1 + i * 1.1, 0.27, CELL.z + 0.2 + (i % 2) * 0.2, Math.sin(time * 1.6 + i) * 0.3, i === 1 && (time % 7) < 2 ? 5 : 4, i * 0.9, 1.6 + i * 0.3);
      nextNote -= dt;
      if (nextNote <= 0) { nextNote = 0.55; const i = Math.floor(time * 3) % 3; notes.emit(CELL.x - 1.1 + i * 1.1, 2.3, CELL.z + 1.6, 0.1 * Math.sin(time), 0.8, 0.25, 2.4, 0.3, 0, 0.4); }
      notes.step(dt);
      // Wendell rocks, fast when nervous
      const rock2 = Math.sin(time * (3 + Math.max(0, Math.sin(time * 0.3)) * 5)) * 0.18;
      chair.position.set(CH[0], 0.37, CH[1]);
      chair.rotation.set(rock2, 0.3, 0);
      folk.set(3, CH[0], 0.37 + 0.12, CH[1] + 0.05, 0.3, 5, 0, 1);
    },
  });

  function office(B, own) {
    falseFront(B, { x: BX, fz: FZ, w: W, d: D, h: H, fh: FH, front: 'adobe', wall: 'adobe2', parapet: 'flat', door: 0.6, windows: [-1.6], winW: 1.1, trim: 'raw2', doorC: 'plank3' });
    for (let i = 0; i < 4; i++) B.cyl('raw2', BX - W / 2 + 0.6 + i * 1.4, FH - 0.6, FZ + 0.2, 0.1, 0.6, 0, { sides: 6, taper: 1, rx: Math.PI / 2 });
    for (let i = 0; i < 5; i++) B.cyl('iron', BX - 1.6 - 0.45 + i * 0.22, 1.05, FZ + 0.22, 0.025, 1.35, 0, { sides: 4, taper: 1 });
    porch(B, BX - W / 2 - 0.1, BX + W / 2 + 0.1, FZ, 2.4, { awnY: 2.7, awn: 'plank2', posts: 3, stepX: BX + 0.6 });
    signBoard(B, BX, H + 0.4, FZ + 0.18, 3.8, 0.9, { board: own ? 'cream' : '#6b3f8f', trim: own ? 'brass' : 'gold' });
    badge(B, BX, H + 0.85, FZ + 0.3, 0.38, own ? 'badge' : 'gold');
    for (let i = 0; i < 3; i++) { B.slab('poster', BX + 1.8 + (i % 2) * 0.5, 1.0 + i * 0.55, FZ + 0.18, 0.42, 0.5, 0.02, { round: 0.01, taper: 0, rz: (i - 1) * 0.08, noAo: true }); B.ball('#6a4a36', BX + 1.8 + (i % 2) * 0.5, 1.32 + i * 0.55, FZ + 0.2, 0.09, { sz: 0.2, detail: 0 }); }
    lantern(B, BX - 0.4, 2.2, FZ + 0.45);
    if (own) blade(B, BX - W / 2 + 0.3, 1.7, FZ + 1.6, { board: 'ownTeal' });
    for (let i = 0; i < 1; i++) { B.cyl('plank', BX - W / 2 - 0.6, 0, FZ + 1.2, 0.4, 1.0, 0, { sides: 11, taper: 0.9 }); B.cyl('iron', BX - W / 2 - 0.6, 0.8, FZ + 1.2, 0.42, 0.06, 0, { sides: 11, taper: 1 }); }
  }
  // the open-fronted cell block: stone walls, a barred front the street can see through, a cot and a bucket
  function cellBlock(B, x, z, w) {
    const d = CELL.d, h = CELL.h, bz = z - d / 2 + 0.6;
    B.slab('stoneJ', x, 0, bz, w + 0.4, 0.27, d + 0.2, { round: 0.04 });
    B.slab('stoneJ', x, 0.25, bz - d / 2 + 0.15, w, h, 0.3, { round: 0.08, taper: 0 });
    for (const s of [-1, 1]) B.slab('stoneJ', x + s * (w / 2 - 0.15), 0.25, bz, 0.3, h, d, { round: 0.08, taper: 0 });
    for (let i = 0; i < 10; i++) B.slab(tone(COLORS.cream, 0.82 + (i % 3) * 0.05), x - w / 2 + 0.3 + (i % 5) * 0.85, 0.5 + Math.floor(i / 5) * 1.3 + (i % 2) * 0.3, bz - d / 2 + 0.31, 0.6, 0.32, 0.02, { round: 0.04, taper: 0, noAo: true });
    B.slab('tin', x, h + 0.25, bz, w + 0.6, 0.14, d + 0.5, { round: 0.03, taper: 0, rx: -0.08 });
    const n = Math.round(w / 0.24);
    for (let i = 1; i < n; i++) B.cyl('iron', x - w / 2 + i * (w / n), 0.27, bz + d / 2, 0.035, h - 0.05, 0, { sides: 5, taper: 1 });
    for (const y of [0.4, 1.6, h + 0.1]) B.slab('iron', x, y, bz + d / 2, w, 0.08, 0.08, { round: 0.01, taper: 0 });
    B.slab('canvas', x + w / 2 - 0.8, 0.27, bz - 0.5, 1.0, 0.45, 1.6, { round: 0.06 });
    B.cyl('iron', x - w / 2 + 0.6, 0.27, bz - 0.6, 0.2, 0.3, 0, { sides: 9, taper: 1.15 });
    B.contact(x, bz, w + 0.6, d + 0.4);
  }
  function badge(B, x, y, z, s, c) {
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; B.cone(c, x + Math.cos(a) * 0.35 * s, y + Math.sin(a) * 0.35 * s, z, 0.25 * s, 0.75 * s, 0, { sides: 4, rz: a - Math.PI / 2, noAo: true }); B.ball(c, x + Math.cos(a) * 0.8 * s, y + Math.sin(a) * 0.8 * s, z, 0.09 * s, { detail: 0, noAo: true }); }
    B.cyl(c, x, y, z - 0.03, 0.45 * s, 0.1, 0, { sides: 11, taper: 1, rx: Math.PI / 2, noAo: true });
  }
}
void THREE; void win; void wheel;
