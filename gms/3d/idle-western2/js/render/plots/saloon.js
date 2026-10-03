// 🥃 The Thirsty Gizzard: a barn-red two-storey saloon with a spindle balcony, bat-wing doors, Fingers' upright piano on
// the porch (tap target 'piano'), rotgut crates as stock and a trough out front for ejected drunks.
// Won at poker (W13): while unowned the lot shows Pomfrey's version (purple + gold boards); buying re-skins it.
// L1 saloon → L25 card-room annex + more lanterns → L100 hotel storey, gold sign and a rooftop water tank.
import * as THREE from 'three';
import { COLORS, cardCam, falseFront, porch, win, barrel, crate, lantern, blade, signBoard, horse, hats, hatted, particles, tufts, tone } from './western.js?v=20261004a';
import { createConstruction, finishPlot } from './construction.js?v=20261004a';

const BX = -1.2, FZ = 0.7, W = 11, D = 6.4, H1 = 3.4, H2 = 6.5, FH = 7.6;
const DOOR = [BX + 0.6, FZ];
const PIANO = [BX - 3.9, 0.35, FZ + 0.62];

export default function buildPlot(kit, { line, palette, rng }) {
  const P = kit.plot({ id: 'saloon', line, palette, rng, seed: 41, colors: { ...COLORS, bottle: { c: '#7a3a1e', r: 0.2 }, felt: '#3f7a52', pom: '#6b3f8f', pomGold: COLORS.gold } });
  const { b, t1, t2, lot } = P;

  saloon(b, true);
  saloon(lot, false);
  // street dressing (owned): hitching rail with a horse, trough, cacti
  // the town lane puts a trough at (−5.2, 4.4) and a hitching rail at (4.5, 4.5) in front of the saloon: horses use them
  horse(b, -3.5, 5.1, { ry: Math.PI * 0.97, c: '#f1ece2', dark: '#6a6a72', blanket: '#5E8F8C' });
  horse(b, 4.6, 5.25, { ry: Math.PI * 0.94, c: '#9a5a35', blanket: '#D9A441' });
  tufts(b, [[-7.4, 3.2], [7.4, 3.0], [-7.6, -3.5]]);
  tufts(lot, [[-7.4, 3.2], [7.4, 3.0]]);

  // L25: card-room annex on the right with its own little false front and lanterns
  {
    const ax = BX + W / 2 + 1.8;
    falseFront(t1, { x: ax, fz: FZ - 0.4, w: 3.2, d: 5.2, h: 3.0, fh: 4.6, front: 'teal', wall: 'raw', parapet: 'peak', door: 0, windows: [], doorW: 1.0 });
    porch(t1, ax - 1.7, ax + 1.7, FZ - 0.3, 2.7, { awnY: 2.6, awn: ['teal', 'cream'], step: false });
    for (const k of [-1, 1]) t1.ball(k < 0 ? '#e9e4da' : '#c4473a', ax + k * 0.9, 3.5, FZ - 0.18, 0.28, { sz: 0.3, detail: 1 });
    t1.slab('felt', ax, 3.2, FZ - 0.17, 1.2, 0.55, 0.06, { round: 0.03, taper: 0 });
    lantern(t1, ax - 1.4, 2.1, 2.5);
    for (let i = 0; i < 2; i++) barrel(t1, BX + 5.0 + i * 0.85, 0.35, 2.3, 0.85);
  }
  // L100: hotel storey above, a gold-trimmed sign, rooftop water tank
  {
    const y = FH + 0.05;
    t2.slab('cream', BX - 0.5, y, FZ - D / 2 - 0.4, W - 2.5, 2.6, D - 1.4, { round: 0.1, taper: 0.02 });
    for (let i = 0; i < 4; i++) win(t2, BX - 3.6 + i * 2.05, y + 0.8, FZ - 1.08, { w: 0.9, h: 1.1, trim: 'barn', shutters: 'teal' });
    t2.roof('tin', BX - 0.5, y + 2.6, FZ - D / 2 - 0.4, W - 2.2, 1.3, D - 1.1, Math.PI / 2, { over: 0.3 });
    const tx = BX + 3.4, tz = FZ - 4.6;
    for (const [dx, dz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) t2.cyl('raw2', tx + dx, H2, tz + dz, 0.08, 2.2, 0, { sides: 5, taper: 0.9 });
    t2.cyl('plank', tx, H2 + 2.1, tz, 1.15, 1.6, 0, { sides: 13, taper: 0.97 });
    t2.cone('tin', tx, H2 + 3.65, tz, 1.3, 0.7, 0, { sides: 13, curve: 1 });
    for (const h of [0.3, 1.2]) t2.cyl('iron', tx, H2 + 2.1 + h, tz, 1.17, 0.08, 0, { sides: 13, taper: 1, noAo: true });
    t2.slab('gold', BX + 0.6, H1 + 2.2, FZ + 0.2, 6.3, 0.16, 0.16, { round: 0.04, taper: 0 });
    t2.slab('gold', BX + 0.6, H1 + 3.82, FZ + 0.2, 6.3, 0.16, 0.16, { round: 0.04, taper: 0 });
    for (const k of [-1, 1]) t2.ball('gold', BX + 0.6 + k * 3.2, H1 + 3.05, FZ + 0.25, 0.26, { detail: 1 });
  }

  // Bat-wing doors: two leaves in one instanced draw, springing open when someone passes or Mabel throws a drunk.
  const doorGeo = kit.builder(P.pal);
  doorGeo.slab('plank2', 0.32, 0, 0, 0.62, 0.95, 0.06, { round: 0.03, taper: 0 });
  for (let i = 0; i < 4; i++) doorGeo.slab('plank3', 0.1 + i * 0.14, 0.92, 0.01, 0.08, 0.14 + (i % 2) * 0.08, 0.05, { round: 0.02, taper: 0 });
  doorGeo.slab('raw', 0.32, 0.4, 0.04, 0.5, 0.08, 0.03, { round: 0.01, taper: 0 });
  const doors = P.instances((d) => d.add(doorGeo.geometry(), null, {}), 2, { tier: 0, cast: false, radius: 2 });
  let doorSwing = 0, doorKick = 0;

  // Fingers' upright piano: its own static block, the lid flaps with each phrase.
  const lid = P.dynamic((d) => { d.slab('#6a3220', 0, 0, -0.25, 1.6, 0.05, 0.5, { round: 0.02, taper: 0 }); }, { tier: 0, cast: false });
  lid.position.set(PIANO[0], PIANO[1] + 1.45, PIANO[2] - 0.05);
  const notes = particles(kit, P, (n) => { n.ball('#2a1e2a', 0, 0, 0, 0.35, { sx: 1.25, sz: 0.6, detail: 1 }); n.slab('#2a1e2a', 0.33, 0, 0, 0.1, 1.1, 0.1, { round: 0, taper: 0 }); n.slab('#2a1e2a', 0.5, 0.95, 0, 0.36, 0.12, 0.1, { round: 0, taper: 0, rz: -0.5 }); }, 10);

  // Stock: crates of rotgut on the porch's right end (the brightest warm thing in frame).
  const rot = kit.builder(P.pal);
  rot.slab('raw', 0, 0, 0, 1, 0.55, 0.75, { round: 0.06 });
  rot.slab('raw2', 0, 0.22, 0, 1.04, 0.08, 0.79, { round: 0.02, taper: 0 });
  for (let i = 0; i < 3; i++) { rot.cyl('bottle', -0.3 + i * 0.3, 0.5, 0, 0.11, 0.32, 0, { sides: 7, taper: 0.8 }); rot.cyl('bottle', -0.3 + i * 0.3, 0.8, 0, 0.045, 0.16, 0, { sides: 5, taper: 1 }); rot.ball('#e9dcc0', -0.3 + i * 0.3, 0.97, 0, 0.05, { detail: 0 }); }
  const PILE = [BX + 4.3, 0.35, 2.15];
  P.pile({ at: PILE, geo: rot.geometry({ ao: 0.15, aoH: 0.4 }), size: 0.62, max: 12, cols: 3, ry: -0.15 });

  // People: queue (0–4), Fingers at the piano (5), a slumped drunk on the porch (6), a loafer on a post (7), barkeep in the window (8)
  const SC = 1.08;
  const folk = hatted(P.crowd({ count: 9, seed: 23, scale: SC }), hats(kit, P, 'ten', 9, ['#7a5236', '#3a2c2c', '#c9b08a', '#8a3a2a', '#e6d6b8', '#2e2630', '#6a5a3a', '#d9c6a0', '#3a2c2c']), SC, [1, 1.1, 0.9, 1.25, 1, 0.9, 1.3, 1.15, 0.38]);
  P.queue(folk, { ids: [0, 1, 2, 3, 4], spawn: [[8.2, 3.6], [8.2, 3.2]], counter: [DOOR[0] + 0.15, FZ + 0.75], dir: [1, 0.05], gap: 0.85, y: 0.37, exit: [[DOOR[0], FZ - 0.6], [DOOR[0], FZ - 1.6]], carry: false, faceCounter: Math.PI });
  folk.look(5, { top: '#e9e4da', bot: '#3a2c2c', skin: 0, hair: 4, style: 3 }).body(5, 1.2, 0.9, 1.0);
  folk.look(6, { top: '#c98b7e', bot: '#6b5a7d', skin: 1, hair: 2, style: 4 }).body(6, 1.25, 0.95, 1.02);
  folk.look(7, { top: '#5E8F8C', bot: '#4a3a32', skin: 3, hair: 0, style: 1 }).body(7, 1.18, 1.0, 1.0);
  folk.look(8, { top: '#f4efe4', bot: '#3a2c2c', skin: 0, hair: 1, style: 0, acc: 0 }).body(8, 1.3, 0.85, 0.95);

  let playK = 0, frenzy = 0, nextNote = 0;
  const api = { play: (k = 1) => { playK = Math.min(3, playK + k); lidKick = 1; } };
  let lidKick = 0;

  const C = createConstruction(kit, P, { x: BX, fz: FZ, w: W, d: D, h: H1, fh: FH, parapet: 'stepped', stakes: false, ext: { x: BX + W / 2 + 2, z: FZ - 1.5, w: 3.4, h: 5 } });

  const out = finishPlot(P, C, {
    w: 16, cardW: 13, d: 9, h: FH + 2,
    acquired: true,
    camera: cardCam([-0.9, 3.4, 0.6], 22, 45, 20),
    pileAnchor: PILE, pileR: 1.4,
    lamps: [[BX - 1.0, 2.6, FZ + 0.45], [BX + 2.2, 2.6, FZ + 0.45]],
    exit: [[DOOR[0] + 1, 3.6], [6, 4.0], [8.5, 4.4]],
    focus: [BX, 1],
    tapTargets: [{ id: 'piano', pos: [PIANO[0], PIANO[1] + 0.8, PIANO[2]], r: 1.05, box: { min: [PIANO[0] - 0.85, PIANO[1], PIANO[2] - 0.35], max: [PIANO[0] + 0.85, PIANO[1] + 1.5, PIANO[2] + 0.6] } }],
    anchors: {
      doors: [DOOR[0], 0.35, FZ + 0.25], doorsOut: [DOOR[0], 0.0, FZ + 2.9], porch: [DOOR[0], 0.35, FZ + 1.4],
      piano: [PIANO[0], PIANO[1], PIANO[2]], pianist: [PIANO[0], PIANO[1], PIANO[2] + 0.95],
      trough: [-5.2, 0.85, 4.4], balcony: [BX - 1.5, H1 + 0.45, FZ + 1.6], upstairs: [BX + 2.5, H1 + 1.6, FZ + 0.1],
      street: [DOOR[0], 0, 8.5],
    },
    update(dt, stats, time, tier, ctx) {
      const owned = ctx.owned;
      doors.visible = owned;
      // doors swing when the queue head goes in
      doorSwing = Math.max(0, doorSwing - dt * 1.6);
      if (Math.sin(time * 0.9) > 0.97 || doorKick > 0) doorSwing = 1;
      doorKick = Math.max(0, doorKick - dt);
      const a = doorSwing * Math.sin(time * 9) * 1.1 * doorSwing;
      doors.place(0, DOOR[0] - 0.62, 0.35 + 0.45, FZ + 0.12, -a, 1).place(1, DOOR[0] + 0.62, 0.35 + 0.45, FZ + 0.12, Math.PI + a, 1).commit();
      if (!owned) { for (const i of [5, 6, 7, 8]) folk.hide(i); notes.visible = false; return; }
      // Fingers plays; a tap (api.play) speeds him up, the lid flaps and notes rise
      playK = Math.max(0, playK - dt * 0.5);
      lidKick = Math.max(0, lidKick - dt * 2);
      folk.set(5, PIANO[0], PIANO[1] + 0.12, PIANO[2] + 0.95, Math.PI, 5, 0, 1);
      lid.rotation.x = -(0.1 + Math.abs(Math.sin(time * (3 + playK * 4))) * (0.1 + lidKick * 0.55));
      nextNote -= dt * (1 + playK * 3);
      if (nextNote <= 0) { nextNote = 0.9; notes.emit(PIANO[0] + Math.sin(time * 7) * 0.5, PIANO[1] + 1.7, PIANO[2] + 0.1, 0.15, 0.7, 0.3, 2.2, 0.32, 0, 0.3); }
      notes.visible = true;
      notes.step(dt);
      void frenzy;
      // the drunk slumped against the barrels, the loafer on the post, the tiny-bowlered barkeep in the window
      folk.set(6, BX + 3.0, 0.37, FZ + 1.25, -0.4, 5, 0, 0.6);
      folk.set(7, BX + 5.6, 0.37, FZ + 2.35, -0.6, 0, 1.2, 1.0);
      folk.set(8, BX + 3.4, 0.38, FZ - 0.55, 0, 6, 2.0, 1.4);
    },
  });
  out.piano = api.play;
  out.kickDoors = () => { doorKick = 0.8; doorSwing = 1; };
  return out;

  function saloon(B, own) {
    const boardC = own ? 'cream' : 'pom', trimC = own ? 'brass' : 'pomGold';
    falseFront(B, { x: BX, fz: FZ, w: W, d: D, h: H2, fh: FH, front: 'barn', wall: tone(COLORS.barn, 0.85), parapet: 'stepped', door: false, windows: [], trim: 'cream' });
    // ground-floor: big windows, the door opening, lanterns
    B.slab('interior', DOOR[0], 0.35, FZ + 0.12, 1.5, 2.5, 0.05, { round: 0.01, taper: 0, noAo: true });
    B.slab('cream', DOOR[0], 2.85, FZ + 0.18, 1.9, 0.16, 0.16, { round: 0.03, taper: 0 });
    for (const s of [-1, 1]) B.slab('cream', DOOR[0] + s * 0.86, 0.35, FZ + 0.18, 0.14, 2.5, 0.14, { round: 0.03, taper: 0 });
    for (const dx of [-3.2, 3.2]) win(B, DOOR[0] + dx - (dx < 0 ? 0.3 : 0), 1.0, FZ + 0.16, { w: 2.0, h: 1.5, trim: 'cream' });
    // upstairs: three windows with shutters, one with a lady's curtain
    for (let i = 0; i < 3; i++) win(B, BX - 3.4 + i * 3.4, H1 + 0.95, FZ + 0.16, { w: 1.1, h: 1.35, trim: 'cream', shutters: i === 1 ? 'teal' : 'mustard' });
    // the big sign + blade sign
    signBoard(B, BX + 0.6, H1 + 1.45 + 1.0, FZ + 0.18, 5.6, 1.25, { board: boardC, trim: trimC });
    bottle(B, BX + 0.6, H1 + 3.2, FZ + 0.3, own);
    if (own) blade(B, BX + W / 2 - 0.5, 2.0, FZ + 1.9, { board: 'ownTeal' });
    else B.slab('pomGold', BX - 3.2, H1 + 2.3, FZ + 0.32, 0.6, 0.6, 0.06, { round: 0.25, taper: 0 });
    // porch + balcony (spindle rail) on the porch roof
    porch(B, BX - W / 2 - 0.2, BX + W / 2 + 0.2, FZ, 3.0, { h: 0.35, awnY: H1, awn: 'plank2', posts: 5, stepX: DOOR[0], stepW: 2.4 });
    const by = H1 + 0.22;
    B.slab('plank', BX, by, (FZ + 3.0) / 2 + 0.05, W + 0.5, 0.12, 3.0 - FZ + 0.4, { round: 0.03, taper: 0 });
    const n = 30;
    for (let i = 0; i <= n; i++) B.cyl('cream', BX - W / 2 + i * (W / n), by + 0.1, 3.15, 0.045, 0.62, 0, { sides: 5, taper: 0.8 });
    B.slab('raw', BX, by + 0.7, 3.15, W + 0.3, 0.1, 0.16, { round: 0.03, taper: 0 });
    for (const k of [-1, 1]) for (let i = 0; i <= 5; i++) B.cyl('cream', BX + k * (W / 2 + 0.1), by + 0.1, FZ + 0.2 + i * 0.42, 0.045, 0.62, 0, { sides: 5, taper: 0.8 });
    for (const k of [-1, 1]) B.slab('raw', BX + k * (W / 2 + 0.1), by + 0.7, (FZ + 3.15) / 2, 0.14, 0.1, 3.15 - FZ, { round: 0.03, taper: 0 });
    lantern(B, DOOR[0] - 1.25, 2.4, FZ + 0.42, { glow: own ? 'lantern' : 'lanternN' });
    lantern(B, DOOR[0] + 1.25, 2.4, FZ + 0.42, { glow: own ? 'lantern' : 'lanternN' });
    // the piano, barrels, a bench
    piano(B, PIANO[0], PIANO[1], PIANO[2]);
    for (const [dx, dz, s] of [[0, 0, 1], [0.85, 0.1, 1], [0.42, 0.05, 0.9]]) barrel(B, BX + 3.0 + dx * 1.0 - 0.4, 0.35 + (s < 1 ? 0.95 : 0), FZ + 0.45 + dz, s);
    B.slab('plank3', BX - 2.0, 0.35, FZ + 0.4, 1.8, 0.45, 0.45, { round: 0.05 });
    crate(B, BX + 5.2, 0.0, 3.3, 0.9, 0.4);
    if (!own) for (const dx of [-1, 1]) B.slab('plank3', DOOR[0] + dx * 0.36, 0.4, FZ + 0.2, 0.7, 2.3, 0.06, { round: 0.02, taper: 0, rz: dx * 0.04 });
    if (!own) for (const s of [-1, 1]) B.slab('plank2', DOOR[0], 1.3 + s * 0.45, FZ + 0.3, 1.9, 0.18, 0.06, { round: 0.02, taper: 0, rz: s * 0.35 });
  }

  // upright piano, keys facing the street (+z)
  function piano(B, x, y, z) {
    const wood = '#8a4426', dark = '#5a2a1a';
    B.slab(wood, x, y, z, 1.55, 1.38, 0.6, { round: 0.06, taper: 0 });
    B.slab(dark, x, y + 1.36, z, 1.64, 0.1, 0.68, { round: 0.03, taper: 0 });
    B.slab('#a45a34', x, y + 0.85, z + 0.31, 1.3, 0.4, 0.04, { round: 0.02, taper: 0 });
    B.slab(wood, x, y + 0.66, z + 0.4, 1.48, 0.12, 0.42, { round: 0.03, taper: 0 });
    for (let i = 0; i < 13; i++) B.slab(i % 2 ? '#fbf6ea' : '#f1eadb', x - 0.66 + i * 0.11, y + 0.77, z + 0.46, 0.095, 0.05, 0.3, { round: 0.005, taper: 0, noAo: true });
    for (let i = 0; i < 9; i++) if (i % 3 !== 2) B.slab('#221a1e', x - 0.6 + i * 0.15, y + 0.81, z + 0.38, 0.06, 0.05, 0.15, { round: 0.005, taper: 0, noAo: true });
    for (const k of [-1, 1]) B.cyl(dark, x + k * 0.66, y, z + 0.5, 0.06, 0.68, 0, { sides: 6, taper: 1 });
    B.slab('#f4ecd8', x + 0.1, y + 0.9, z + 0.33, 0.5, 0.36, 0.03, { round: 0.01, taper: 0, rx: -0.25 });
    B.cyl('lantern', x - 0.55, y + 1.45, z + 0.1, 0.06, 0.18, 0, { sides: 6, taper: 1 });
    B.cyl('bottle', x + 0.5, y + 1.42, z + 0.1, 0.08, 0.28, 0, { sides: 6, taper: 0.8 });
    B.cyl('#e9dcc0', x + 0.2, y + 1.42, z + 0.05, 0.12, 0.12, 0, { sides: 7, taper: 0.8 });
    B.cyl('#7a4a2e', x, y, z + 0.95, 0.24, 0.48, 0, { sides: 9, taper: 1 });
    B.contact(x, z + 0.2, 1.8, 1.0);
  }


  function bottle(B, x, y, z, own) {
    const c = own ? '#7a3a1e' : 'pomGold';
    B.slab(c, x, y - 0.55, z, 0.5, 0.62, 0.06, { round: 0.2, taper: 0, noAo: true });
    B.slab(c, x, y + 0.02, z, 0.18, 0.36, 0.06, { round: 0.05, taper: 0, noAo: true });
    B.slab('cream', x, y - 0.42, z + 0.04, 0.34, 0.22, 0.03, { round: 0.03, taper: 0, noAo: true });
    B.slab('barn', x, y - 0.36, z + 0.06, 0.2, 0.08, 0.02, { round: 0.01, taper: 0, noAo: true });
    B.slab('raw', x, y + 0.36, z, 0.14, 0.1, 0.07, { round: 0.03, taper: 0, noAo: true });
    for (const k of [-1, 1]) B.slab(c, x + k * 0.7, y - 0.6, z, 0.4, 0.4, 0.06, { round: 0.12, taper: 0.25, noAo: true });
  }

}

void THREE;
