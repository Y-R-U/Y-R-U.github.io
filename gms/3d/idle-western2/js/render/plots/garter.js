// 🎀 The Velvet Garter ("A Gentlemen's Social Parlour"): a dusty-rose two-storey with frilly pink lanterns, feather boas
// over the balcony rail and a can-can leg kicking behind the lit window (PG-13, W17). Stock: a heap of hats left behind
// by gentlemen in a hurry. The W4 window-exit gag runs here (see docs/PLOTS.md): a man in long johns climbs out of the
// upstairs window and drops into the hay cart while his wife, rolling pin raised, storms in at the front door.
// L1 parlour → L25 a gazebo of pink lanterns + a second boa'd balcony → L100 an onion-dome cupola with a heart weather vane.
import * as THREE from 'three';
import { COLORS, EXTRA_HATS, cardCam, falseFront, porch, win, lantern, blade, signBoard, hats, hatted, particles, tufts, cart, tone, tilt, hatGeo, smooth01, vignette, CROWD_K } from './western.js?v=20261004d';
import { createConstruction, finishPlot } from './construction.js?v=20261004d';

const BX = -1.6, FZ = 0.6, W = 8.6, D = 6.0, H1 = 3.3, H2 = 6.4, FH = 7.6;
const DOOR = [BX - 1.4, FZ];
const WIN = [BX + 2.6, H1 + 0.95, FZ + 0.2];
const CART = [BX + 2.6, 4.0];

export default function buildPlot(kit, { line, palette, rng }) {
  const P = kit.plot({ id: 'garter', line, palette, rng, seed: 31, colors: { ...COLORS, rose2: '#b8706a', boa: { c: '#ff9ec4', r: 0.95 }, boa2: { c: '#e86aa0', r: 0.95 }, plum: '#7a3a5a', velvet: '#9a2a4a', stocking: '#2a1e2a', frill: '#fbe6ef', john: '#c4473a' } });
  const { b, t1, t2, lot } = P;
  vignette(b, -5.8, 3.7);

  parlour(b, true);
  parlour(lot, false);
  cart(b, CART[0], CART[1], { ry: 0.05, c: 'plank', side: 'plank2' });
  for (let i = 0; i < 9; i++) b.ball(i % 2 ? 'hay' : 'hay2', CART[0] - 0.9 + (i % 5) * 0.45, 0.85 + Math.floor(i / 5) * 0.2, CART[1] + ((i * 7) % 3 - 1) * 0.3, 0.42, { sy: 0.6, detail: 1 });
  tufts(b, [[-6.6, 3.6], [6.6, 3.6], [-6.5, -2.4]]);
  tufts(lot, [[-6.6, 3.6], [6.6, 3.6]]);

  // L25: a lantern gazebo on the right
  {
    const gx = BX + W / 2 + 1.9, gz = 0.6;
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; t1.cyl('frill', gx + Math.cos(a) * 1.1, 0.2, gz + Math.sin(a) * 1.1, 0.05, 2.2, 0, { sides: 5, taper: 1 }); }
    t1.cyl('plank2', gx, 0, gz, 1.3, 0.22, 0, { sides: 6, taper: 1 });
    t1.cone('rose', gx, 2.35, gz, 1.5, 1.0, 0, { sides: 6, curve: 0.9 });
    t1.ball('gold', gx, 3.35, gz, 0.12, { detail: 0 });
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.5; t1.ball('pinkL', gx + Math.cos(a) * 1.2, 1.95, gz + Math.sin(a) * 1.2, 0.15, { sy: 1.3, detail: 1 }); }
    t1.slab('velvet', gx, 0.22, gz, 1.6, 0.42, 0.6, { round: 0.12 });
  }
  // L100: an onion-dome cupola with a heart weather vane
  {
    const cx = BX - 1.4, cz = FZ - 3.0, y = H2;
    t2.cyl('rose', cx, y, cz, 0.9, 1.4, 0, { sides: 9, taper: 1 });
    for (let i = 0; i < 4; i++) win(t2, cx + Math.cos(i * 1.57 + 0.78) * 0.85, y + 0.4, cz + Math.sin(i * 1.57 + 0.78) * 0.85, { w: 0.4, h: 0.6 });
    t2.ball('plum', cx, y + 1.9, cz, 1.0, { sy: 1.0, detail: 2, smooth: true });
    t2.cone('plum', cx, y + 2.6, cz, 0.5, 0.9, 0, { sides: 9, curve: 1.6 });
    t2.cyl('gold', cx, y + 3.4, cz, 0.04, 0.8, 0, { sides: 5, taper: 1 });
    heart(t2, cx, y + 4.0, cz, 0.35, 'gold');
  }

  // the can-can leg behind the window (dynamic), a pink glow
  const leg = P.dynamic((d) => {
    d.cyl('stocking', 0, -0.9, 0, 0.09, 0.9, 0, { sides: 7, taper: 1.4 });
    d.slab('stocking', 0.08, -0.95, 0, 0.26, 0.1, 0.12, { round: 0.04, taper: 0 });
    d.cyl('frill', 0, -0.1, 0, 0.24, 0.16, 0, { sides: 9, taper: 0.7 });
    d.cyl('velvet', 0, -0.32, 0, 0.11, 0.06, 0, { sides: 7, taper: 1 });
  }, { tier: 0, cast: false });
  // the rolling pin and the window shutter that bangs open
  const pin = P.dynamic((d) => { d.cyl('raw', 0, -0.35, 0, 0.07, 0.7, 0, { sides: 7, taper: 1 }); for (const k of [-1, 1]) d.cyl('raw2', 0, k * 0.42, 0, 0.03, 0.14, 0, { sides: 5, taper: 1, aoBase: -1 }); }, { tier: 0, cast: false });
  const shutter = P.dynamic((d) => d.slab('teal', 0.3, 0, 0, 0.6, 1.4, 0.06, { round: 0.02, taper: 0 }), { tier: 0, cast: false });
  shutter.position.set(WIN[0] + 0.62, WIN[1] - 0.05, WIN[2] + 0.06);

  // stock: the heap of abandoned hats (four colours baked into one unit)
  const hb = kit.builder(P.pal);
  const hg = hatGeo(kit, 'ten');
  hb.add(hg, '#3a2c2c', { x: 0, y: 0, z: 0, scale: 0.9 });
  hb.add(hatGeo(kit, 'bowler'), '#5a4632', { x: 0.6, y: 0.0, z: 0.2, scale: 0.9, ry: 0.5 });
  hb.add(hg, '#c9b08a', { x: 0.25, y: 0.18, z: -0.35, scale: 0.85, rz: 0.4 });
  hb.add(hatGeo(kit, 'pipe'), '#2e2630', { x: -0.45, y: 0.0, z: -0.2, scale: 0.8, rz: 1.3 });
  const PILE = [BX - W / 2 + 1.1, 0.37, FZ + 1.4];
  P.pile({ at: PILE, geo: hb.geometry({ ao: 0.1 }), size: 0.75, max: 10, layout: 'heap' });

  const SC = 1.08;
  // 0 the gentleman (long johns), 1 his wife (bonnet + rolling pin), 2 Madame Lulu on the balcony, 3–4 gentlemen queueing, 5 a passer-by
  const folk = hatted(P.crowd({ count: 6, seed: 43, scale: SC }), EXTRA_HATS, ['#3a2c2c', '#7a3a5a', '#9a2a4a', '#2e2630', '#6a5a3a', '#c9b08a'], [1.0, 0.0, 1.6, 1.1, 1.0, 1.0]);
  folk.dress(0, 'longjohns').body(0, 1.24, 0.95, 1.05);
  folk.dress(1, 'wife').body(1, 1.24, 0.95, 1.08);
  folk.dress(2, 'lulu').body(2, 1.24, 0.95, 1.05).look(2, { hatScale: 0.95 });
  folk.look(3, { top: '#3a3a4a', bot: '#3a3a4a', skin: 2, hair: 0, style: 0 });
  folk.look(4, { top: '#5E8F8C', bot: '#3a2c2c', skin: 3, hair: 1, style: 1 });
  P.queue(folk, { ids: [3, 4], spawn: [[7, 3.4], [7, 3.0]], counter: [DOOR[0], FZ + 0.9], dir: [1, 0.08], gap: 0.9, y: 0.37, exit: [[DOOR[0], FZ - 0.6], [DOOR[0], FZ - 1.6]], carry: false, faceCounter: Math.PI });
  P.walkers(folk, { ids: [5], paths: [[[-7, 4.4], [7, 4.4]]], loop: 'wrap', speed: 0.9, ownedOnly: false });
  const lostHat = hats(kit, P, 'ten', 1, ['#3a2c2c']);
  const dust = particles(kit, P, (n) => n.ball('hay', 0, 0, 0, 1, { detail: 0 }), 12);
  const r = (() => { let a = 13; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();
  let exitAuto = true, exitT = 8, landed = false;

  const C = createConstruction(kit, P, { x: BX, fz: FZ, w: W, d: D, h: H1, fh: FH, parapet: 'arched', ext: { x: BX + W / 2 + 1.9, z: 0.0, w: 2.6, h: 3.4 }, yard: [3.9, 2.2], stake: [1.8, 2.8] });

  const out = finishPlot(P, C, {
    w: 14, cardW: 12.5, d: 9, h: FH + 2,
    camera: cardCam([-1.0, 2, 2.5], 26, 20, 25, 38, 7, [[-0.8, 3.0, 2.5], 24, 10, 22, 38, 12]),
    pileAnchor: PILE, pileR: 1.2,
    exit: [[DOOR[0] + 1, 3.4], [5, 4.0], [7.2, 4.2]],
    focus: [0, 1],
    anchors: { window: WIN, windowSill: [WIN[0], WIN[1] - 0.05, WIN[2] + 0.4], hayCart: [CART[0], 1.1, CART[1]], haycart: [CART[0], 1.1, CART[1]], door: [DOOR[0], 0.37, FZ + 0.3], doors: [DOOR[0], 0.37, FZ + 0.3], center: [BX, 0.37, FZ + 1.4], balcony: [BX - 1.5, H1 + 0.45, FZ + 1.6], lanterns: [BX, 2.4, FZ + 0.5] },
    update(dt, stats, time, tier, ctx) {
      const owned = ctx.owned;
      dust.visible = owned;
      if (!owned) { for (const i of [0, 1, 2]) folk.hide(i); lostHat.hide(0); lostHat.commit(); pin.visible = false; return; }
      // can-can
      const kick = Math.max(0, Math.sin(time * 4.2));
      leg.position.set(BX + 2.0 + Math.sin(time * 2.1) * 0.35, 1.95, FZ - 0.25);
      leg.rotation.set(0, 0, -kick * 1.9);
      // Lulu on the balcony, fanning
      folk.set(2, BX - 1.5, H1 + 0.42, FZ + 1.3, 0.2, (time % 6) < 3 ? 6 : 0, 0, 1);
      // the window exit, every ~24 s unless the spectacle lane drives it (out.windowExit)
      exitT += dt;
      const T = 24, u = exitAuto ? exitT % T : exitT;
      runExit(Math.min(u, 9), dt, time);
      dust.step(dt);
    },
  });
  out.windowExit = () => { exitAuto = false; exitT = 0; landed = false; };
  out.windowExitAuto = (on = true) => { exitAuto = on; };
  return out;

  // 0–1.2 shutter bangs open · 1.2–2.6 he climbs onto the sill · 2.6–3.6 drop (hat lags) · 3.6–4.6 lands in the hay, legs up
  // · 4.6–6.5 scrambles off down the street holding his hat; the wife marches up to the door 2.4–5.5 and storms in.
  function runExit(u, dt, time) {
    const k = SC * CROWD_K * 1.05;
    shutter.rotation.y = u < 0.3 ? -smooth01(u / 0.3) * 2.2 : u < 7 ? -2.2 + Math.sin(u * 6) * 0.06 * Math.max(0, 1.5 - u) : -2.2 * (1 - smooth01(u - 7));
    if (u < 1.2 || u > 6.8) { folk.hide(0); lostHat.hide(0); }
    else if (u < 2.6) { const s = (u - 1.2) / 1.4; folk.set(0, WIN[0], WIN[1] - 0.95 + 0.0 * s, WIN[2] + 0.2 + s * 0.45, Math.PI * (1 - s * 0.0), s < 0.6 ? 1 : 0, 0, 3); lostHat.put(0, WIN[0], WIN[1] + 0.95, WIN[2] + 0.2 + s * 0.45, 0, 1.25); }
    else if (u < 3.6) {
      const s = (u - 2.6) / 1.0, y = WIN[1] - 0.95 + (1.1 - (WIN[1] - 0.95)) * s * s, z = WIN[2] + 0.65 + (CART[1] - WIN[2] - 0.65) * s;
      folk.set(0, CART[0], y, z, 0, 4, 0, 6);
      tilt(folk, 0, CART[0], y, z, 0, -0.5 - s * 1.8, Math.sin(s * 9) * 0.2, k);
      const hs = Math.max(0, s - 0.25) / 0.75;
      lostHat.put(0, CART[0] + 0.2, WIN[1] + 1.0 - (WIN[1] - 0.2) * hs * hs, WIN[2] + 0.8 + (CART[1] - WIN[2]) * hs, s * 4, 1.25, s * 2);
      landed = false;
    } else if (u < 4.6) {
      if (!landed) { landed = true; for (let i = 0; i < 12; i++) { const a = r() * 6.28; dust.emit(CART[0] + Math.cos(a) * 0.5, 1.3, CART[1] + Math.sin(a) * 0.4, Math.cos(a) * 1.4, 1.5 + r() * 1.5, Math.sin(a) * 1.2, 0.9, 0.1 + r() * 0.08, 4, 1); } }
      folk.set(0, CART[0], 0.95, CART[1], 0, 4, 0, 8);
      tilt(folk, 0, CART[0], 0.95, CART[1] - 0.4, 0, -2.4, 0, k);
      lostHat.put(0, CART[0] + 0.5, 1.15, CART[1] + 0.5, 0.3, 1.25, 0.2);
    } else {
      const s = (u - 4.6) / 2.2;
      folk.set(0, CART[0] + 0.8 + s * 6, 0.02, CART[1] + 0.6 + s * 0.4, Math.PI / 2, 1, 0, 9);
      lostHat.put(0, CART[0] + 0.8 + s * 6, headHat(), CART[1] + 0.6 + s * 0.4, Math.PI / 2, 1.25, 0.6);
    }
    lostHat.commit();
    // the wife
    if (u < 2.4 || u > 5.6) { folk.hide(1); pin.visible = false; }
    else {
      const s = smooth01((u - 2.4) / 2.6), x = -7 + (DOOR[0] - -7) * s, z = 3.6 - (3.6 - FZ - 0.6) * smooth01((u - 4.2) / 1.0);
      folk.set(1, x, z > 2.5 ? 0.02 : 0.37, z, u < 4.2 ? Math.PI / 2 : Math.PI, u < 5.2 ? 1 : 0, 0, 7);
      pin.visible = true;
      pin.position.set(x + (u < 4.2 ? 0.2 : -0.2), (z > 2.5 ? 0.02 : 0.37) + 2.15, z + 0.2);
      pin.rotation.set(0, 0, 0.6 + Math.sin(time * 14) * 0.5);
    }
    void dt;
  }
  function headHat() { return 1.95; }

  function parlour(B, own) {
    falseFront(B, { x: BX, fz: FZ, w: W, d: D, h: H2, fh: FH, front: 'rose', wall: 'rose2', parapet: 'arched', door: false, windows: [], trim: 'frill' });
    B.slab('interior', DOOR[0], 0.35, FZ + 0.12, 1.3, 2.4, 0.05, { round: 0.01, taper: 0, noAo: true });
    for (const s of [-1, 1]) B.slab('frill', DOOR[0] + s * 0.75, 0.35, FZ + 0.18, 0.14, 2.45, 0.14, { round: 0.03, taper: 0 });
    B.slab('frill', DOOR[0], 2.75, FZ + 0.18, 1.6, 0.16, 0.16, { round: 0.03, taper: 0 });
    // the can-can window: lit pink, curtains swagged
    win(B, BX + 2.0, 0.95, FZ + 0.16, { w: 2.6, h: 1.6, trim: 'frill' });
    for (const s of [-1, 1]) B.slab('velvet', BX + 2.0 + s * 1.05, 1.0, FZ + 0.12, 0.5, 1.5, 0.05, { round: 0.06, taper: 0.4 });
    B.slab('velvet', BX + 2.0, 2.4, FZ + 0.13, 2.6, 0.22, 0.06, { round: 0.06, taper: 0 });
    // upstairs: three windows (right one is the escape window, with no right shutter — it's the dynamic one)
    for (let i = 0; i < 3; i++) { const x = BX - 2.6 + i * 2.6; win(B, x, H1 + 0.95, FZ + 0.16, { w: 1.1, h: 1.35, trim: 'frill' }); B.slab('velvet', x, H1 + 0.95, FZ + 0.11, 1.05, 1.3, 0.03, { round: 0.02, taper: 0.5, noAo: true }); B.slab('teal', x - 0.92, H1 + 0.9, FZ + 0.2, 0.6, 1.4, 0.06, { round: 0.02, taper: 0 }); if (i < 2) B.slab('teal', x + 0.92, H1 + 0.9, FZ + 0.2, 0.6, 1.4, 0.06, { round: 0.02, taper: 0 }); }
    signBoard(B, BX, H2 - 0.35, FZ + 0.18, 4.6, 1.0, { board: own ? 'frill' : '#6b3f8f', trim: own ? 'brass' : 'gold' });
    heart(B, BX - 2.75, H2 + 0.15, FZ + 0.33, 0.28, 'velvet');
    heart(B, BX + 2.75, H2 + 0.15, FZ + 0.33, 0.28, 'velvet');
    B.slab('velvet', BX, H2 + 0.95, FZ + 0.32, 0.5, 0.5, 0.06, { round: 0.06, taper: 0.4, rz: Math.PI / 4 });
    // porch + balcony with boas draped over the rail
    porch(B, BX - W / 2 - 0.2, BX + W / 2 + 0.2, FZ, 3.0, { h: 0.35, awnY: H1, awn: 'plank2', posts: 4, stepX: DOOR[0], stepW: 2.0 });
    const by = H1 + 0.22;
    B.slab('plank', BX, by, (FZ + 3.0) / 2 + 0.05, W + 0.5, 0.12, 3.0 - FZ + 0.4, { round: 0.03, taper: 0 });
    for (let i = 0; i <= 22; i++) B.cyl('frill', BX - W / 2 + i * (W / 22), by + 0.1, 3.15, 0.045, 0.62, 0, { sides: 5, taper: 0.8 });
    B.slab('frill', BX, by + 0.7, 3.15, W + 0.3, 0.1, 0.16, { round: 0.03, taper: 0 });
    for (const k of [-1, 1]) { for (let i = 0; i <= 5; i++) B.cyl('frill', BX + k * (W / 2 + 0.1), by + 0.1, FZ + 0.2 + i * 0.42, 0.045, 0.62, 0, { sides: 5, taper: 0.8 }); B.slab('frill', BX + k * (W / 2 + 0.1), by + 0.7, (FZ + 3.15) / 2, 0.14, 0.1, 3.15 - FZ, { round: 0.03, taper: 0 }); }
    if (own) for (let j = 0; j < 3; j++) for (let i = 0; i < 9; i++) {
      const x = BX - W / 2 + 0.6 + j * 3.0 + i * 0.28, sag = Math.sin((i / 8) * Math.PI) * 0.45;
      B.ball(i % 2 ? 'boa' : 'boa2', x, by + 0.78 - sag, 3.24, 0.17, { detail: 1, sway: 0.03 });
    }
    // pink lanterns: porch posts + balcony corners
    for (const x of [BX - W / 2 + 0.2, BX + W / 2 - 0.2]) for (const y of [2.5, by + 1.2]) { B.cyl('iron', x, y + 0.45, 3.0, 0.015, 0.2, 0, { sides: 3, taper: 1 }); B.ball(own ? 'pinkL' : 'lanternN', x, y + 0.2, 3.0, 0.22, { sy: 1.35, detail: 1 }); B.cyl('frill', x, y - 0.05, 3.0, 0.2, 0.08, 0, { sides: 9, taper: 1.3 }); if (own) B.lamps.push([x, y + 0.2, 3.0]); }
    if (own) blade(B, BX + W / 2 - 0.4, 1.7, FZ + 1.6, { board: 'velvet' });
    B.slab('velvet', BX - 3.0, 0.35, FZ + 0.45, 1.6, 0.45, 0.5, { round: 0.12 });
    B.slab('velvet', BX - 3.0, 0.35, FZ + 0.2, 1.6, 0.9, 0.18, { round: 0.1 });
  }
  function heart(B, x, y, z, s, c) {
    for (const k of [-1, 1]) B.ball(c, x + k * 0.35 * s, y + 0.3 * s, z, 0.42 * s, { sz: 0.35, detail: 1, noAo: true });
    B.slab(c, x, y - 0.45 * s, z, 0.7 * s, 0.7 * s, 0.14 * s, { round: 0.05 * s, taper: 0, rz: Math.PI / 4, noAo: true });
  }
}
void THREE;
