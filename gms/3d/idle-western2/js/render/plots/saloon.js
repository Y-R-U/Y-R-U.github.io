// 🥃 The Thirsty Gizzard: a barn-red two-storey saloon with a spindle balcony, bat-wing doors, Fingers' upright piano on
// the porch (tap target 'piano'), rotgut crates as stock and a trough out front for ejected drunks.
// Won at poker (W13): while unowned the lot shows Pomfrey's version (purple + gold boards); buying re-skins it.
// L1 saloon → L25 card-room annex + more lanterns → L100 hotel storey, gold sign and a rooftop water tank.
import * as THREE from 'three';
import { softPuffs } from '../fx.js?v=20261004g';
import { COLORS, EXTRA_HATS, cardCam, falseFront, porch, win, barrel, crate, lantern, blade, signBoard, horse, hatted, particles, tufts, tone, cart, bale, tilt, vignette } from './western.js?v=20261004g';
import { createConstruction, finishPlot } from './construction.js?v=20261004g';

const BX = -1.2, FZ = 0.7, W = 11, D = 6.4, H1 = 3.9, H2 = 6.8, FH = 7.9;
const DOOR = [BX + 0.6, FZ];
const PIANO = [BX - 1.85, 0.35, FZ + 1.2], PRY = -Math.PI / 2 + 0.3;
const PF = [Math.sin(PRY), Math.cos(PRY)];
const HAYCART = [6.4, 3.7], WAGON = [9.8, 8.8], BALC_Y = H1 + 0.36;
// R4: a deep porch (to PZ1) under a shallow balcony (to BALZ), a wide glowing doorway (OPEN_W) showing the bar inside
const PZ1 = 3.9, BALZ = FZ + 1.75, OPEN_W = 3.3, OPEN_H = 2.75;

export default function buildPlot(kit, { line, palette, rng }) {
  const P = kit.plot({ id: 'saloon', line, palette, rng, seed: 41, colors: { ...COLORS, bottle: { c: '#7a3a1e', r: 0.2 }, felt: '#3f7a52', pom: '#6b3f8f', pomGold: COLORS.gold, inGlow: { c: '#ff9a3c', r: 0.5, g: 0.8 }, inDeep: { c: '#d8692a', r: 0.6, g: 0.55 }, glassS: { c: '#ff8f30', r: 0.25, g: 0.6 }, spill: { c: '#f2b06a', r: 0.7, g: 0.28 }, inBar: { c: '#7a3a22', r: 0.7 }, inLamp: { c: '#ffe3a6', r: 0.2, g: 1.2 }, mirror: { c: '#ffd890', r: 0.1, g: 1.0 }, inSil: { c: '#4a2620', r: 0.9 } } });
  const { b, t1, t2, lot } = P;

  saloon(b, true);
  saloon(lot, false);
  // street dressing (owned): hitching rail with a horse, trough, cacti
  // the town lane puts a trough at (−5.2, 4.4) and a hitching rail at (4.5, 4.5) in front of the saloon: horses use them
  // Street-front props stand in the street, so each group is its own mesh tagged `occluder` (S: a spectacle shot drops
  // the one between the lens and the cast, cameras.heroTidy) — the hitched horses + barrels, and the paddy wagon.
  const street = P.dynamic((d) => {
    vignette(d, -7.0, 5.7);
    horse(d, 2.9, 6.4, { ry: Math.PI * 0.9, c: '#f1ece2', dark: '#6a6a72', blanket: '#5E8F8C' });
    horse(d, 4.6, 5.25, { ry: Math.PI * 0.94, c: '#9a5a35', blanket: '#D9A441' });
    b.contacts.push(...d.contacts); b.lamps.push(...d.lamps);
  });
  tufts(b, [[-7.4, 3.2], [7.4, 3.0], [-7.6, -3.5], [-5.6, 5.6], [1.2, 5.4], [5.2, 6.4]]);
  // the sheriff's paddy wagon parked out front (fling 'down' lands in it)
  const wagon = P.dynamic((d) => {
    cart(d, WAGON[0], WAGON[1], { ry: 0.2, c: 'soot', side: 'iron' });
    for (let i = 0; i < 5; i++) d.cyl('iron', WAGON[0] - 0.9 + i * 0.45, 0.85, WAGON[1], 0.03, 1.2, 0, { sides: 4, taper: 1 });
    d.slab('soot', WAGON[0], 2.05, WAGON[1], 2.5, 0.12, 1.4, { round: 0.04 });
    d.slab('#c9a43a', WAGON[0], 1.4, WAGON[1] + 0.68, 0.5, 0.3, 0.02, { round: 0.1, taper: 0, noAo: true });
  });
  for (const [m, n] of [[street, 'saloon:street'], [wagon, 'saloon:wagon']]) { m.name = n; m.userData.occluder = true; }
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
  const lid = P.dynamic((d) => { d.slab('#6a3220', 0, 0, -0.27, 1.75, 0.05, 0.55, { round: 0.02, taper: 0 }); }, { tier: 0, cast: false });
  lid.position.set(PIANO[0] - PF[0] * 0.05, PIANO[1] + 1.56, PIANO[2] - PF[1] * 0.05);
  lid.rotation.order = 'YXZ'; lid.rotation.y = PRY;
  const notes = particles(kit, P, (n) => { n.ball('#2a1e2a', 0, 0, 0, 0.35, { sx: 1.25, sz: 0.6, detail: 1 }); n.slab('#2a1e2a', 0.33, 0, 0, 0.1, 1.1, 0.1, { round: 0, taper: 0 }); n.slab('#2a1e2a', 0.5, 0.95, 0, 0.36, 0.12, 0.1, { round: 0, taper: 0, rz: -0.5 }); }, 10);

  // Card gag (R3): Mabel throws a cowboy through the bat-wings every EJ s; he tumbles into the street in a dust puff,
  // lies flat, sits up dizzy and staggers off. Card-only (out.inCard), so it never doubles lane S's hero ejection.
  const puff = softPuffs(kit, P, 'dirtM', 20);
  const EJ = 8.5, LAND = [DOOR[0] - 1.7, 0, PZ1 + 3.3];
  let ej = 0, landed = false, launched = false;
  const _mm = new THREE.Matrix4(), _sq = new THREE.Matrix4();

  // Stock: crates of rotgut on the porch's right end (the brightest warm thing in frame).
  const rot = kit.builder(P.pal);
  rot.slab('raw', 0, 0, 0, 1, 0.55, 0.75, { round: 0.06 });
  rot.slab('raw2', 0, 0.22, 0, 1.04, 0.08, 0.79, { round: 0.02, taper: 0 });
  for (let i = 0; i < 3; i++) { rot.cyl('bottle', -0.3 + i * 0.3, 0.5, 0, 0.11, 0.32, 0, { sides: 7, taper: 0.8 }); rot.cyl('bottle', -0.3 + i * 0.3, 0.8, 0, 0.045, 0.16, 0, { sides: 5, taper: 1 }); rot.ball('#e9dcc0', -0.3 + i * 0.3, 0.97, 0, 0.05, { detail: 0 }); }
  const PILE = [BX - 4.5, 0.35, FZ + 0.85];
  P.pile({ at: PILE, geo: rot.geometry({ ao: 0.15, aoH: 0.4 }), size: 0.62, max: 12, cols: 3, ry: -0.15 });

  // People: queue (0–4), Fingers at the piano (5), Pickles slumped on the barrels (6), a loafer on a post (7), Mabel the
  // bouncer by the doors (8), Lulu and a cowboy on the balcony (9, 10)
  const SC = 1.08;
  const folk = hatted(P.crowd({ count: 12, seed: 23, scale: SC }), EXTRA_HATS, ['#7a5236', '#3a2c2c', '#c9b08a', '#8a3a2a', '#e6d6b8', '#2e2630', '#6a5a3a', '#d9c6a0', '#3a2c2c', '#c4473a', '#3a2c2c', '#c9a06a'], [1, 1.1, 0.9, 1.0, 1, 0.9, 1.3, 1.15, 0.38, 1, 1, 1.25]);
  P.queue(folk, { ids: [0, 1, 2], spawn: [[8.4, 4.6], [8.4, 4.2]], counter: [DOOR[0] + 1.95, FZ + 1.3], dir: [1, 0.02], gap: 1.15, y: 0.37, exit: [[DOOR[0], FZ - 0.6], [DOOR[0], FZ - 1.6]], carry: false, faceCounter: Math.PI });
  folk.dress(5, 'fingers');
  folk.dress(6, 'pickles');
  folk.look(7, { top: '#5E8F8C', bot: '#4a3a32', skin: 3, hair: 0, style: 1 }).body(7, 1.18, 1.0, 1.0);
  folk.dress(8, 'mabel');
  folk.dress(9, 'lulu').body(9, 1.24, 0.95, 0.92).look(9, { hatScale: 0.8 });
  folk.look(11, { top: '#c4473a', bot: '#4a5878', skin: 1, hair: 2, style: 3, stache: 'walrus', hat: 'stetson', hatScale: 0.8, hatColor: 'brown', acc: ['vest'] }).body(11, 1.2, 0.95, 1.0);
  folk.look(10, { top: '#D9A441', bot: '#4a5878', skin: 3, hair: 1, style: 2, stache: 'walrus', hat: 'stetson', hatScale: 0.9, hatColor: 'brown' }).body(10, 1.2, 0.95, 1.05);

  let playK = 0, frenzy = 0, nextNote = 0;
  const api = { play: (k = 1) => { playK = Math.min(3, playK + k); lidKick = 1; } };
  let lidKick = 0;

  const C = createConstruction(kit, P, { x: BX, fz: FZ, w: W, d: D, h: H1, fh: FH, parapet: 'stepped', stakes: false, ext: { x: BX + W / 2 + 2, z: FZ - 1.5, w: 3.4, h: 5 } });

  const out = finishPlot(P, C, {
    w: 16, cardW: 13, d: 9, h: FH + 2,
    acquired: true,
    camera: cardCam([-0.3, 3.3, 2.8], 22, 11, 24.5, 40),
    fg: [{ kind: 'saguaro', sx: -1.08, dist: 8.5, up: 1.3 }, { kind: 'post', sx: 1.04, dist: 7, up: 1.6 }],
    pileAnchor: PILE, pileR: 1.4,
    lamps: [[DOOR[0] - 2.0, 2.6, FZ + 0.45], [DOOR[0] + 2.0, 2.6, FZ + 0.45], [DOOR[0], 1.8, FZ - 0.2]],
    exit: [[DOOR[0] + 1, 3.6], [6, 4.0], [8.5, 4.4]],
    focus: [BX, 1],
    tapTargets: [{ id: 'piano', pos: [PIANO[0] + PF[0] * 0.3, PIANO[1] + 0.85, PIANO[2] + PF[1] * 0.3], r: 1.2, box: { min: [PIANO[0] - 1.0, PIANO[1], PIANO[2] - 0.9], max: [PIANO[0] + 1.3, PIANO[1] + 1.75, PIANO[2] + 1.0] } }],
    anchors: {
      doors: [DOOR[0], 0.35, FZ + 0.25], doorsOut: [DOOR[0], 0.0, PZ1 + 0.6], porch: [DOOR[0], 0.35, FZ + 1.4],
      piano: [PIANO[0], PIANO[1], PIANO[2]], pianist: [PIANO[0] + PF[0], PIANO[1], PIANO[2] + PF[1]],
      wagon: [WAGON[0], 1.0, WAGON[1]], haycart: [HAYCART[0], 1.15, HAYCART[1]], hayCart: [HAYCART[0], 1.15, HAYCART[1]], center: [BX, 0.35, FZ + 1.4],
      trough: [-5.2, 0.85, 4.4], balcony: [BX - 1.5, H1 + 0.45, FZ + 1.2], upstairs: [BX + 2.5, H1 + 1.6, FZ + 0.1],
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
      if (!owned) { for (const i of [5, 6, 7, 8, 9, 10, 11]) folk.hide(i); notes.visible = false; puff.visible = false; return; }
      // Fingers plays; a tap (api.play) speeds him up, the lid flaps and notes rise
      playK = Math.max(0, playK - dt * 0.5);
      lidKick = Math.max(0, lidKick - dt * 2);
      folk.set(5, PIANO[0] + PF[0] * 1.0, PIANO[1] + 0.12, PIANO[2] + PF[1] * 1.0, PRY + Math.PI, P.CLIP.piano, 0, 1 + playK);
      lid.rotation.x = -(0.1 + Math.abs(Math.sin(time * (3 + playK * 4))) * (0.1 + lidKick * 0.55));
      nextNote -= dt * (1 + playK * 3);
      if (nextNote <= 0) { nextNote = 0.9; notes.emit(PIANO[0] + Math.sin(time * 7) * 0.5, PIANO[1] + 1.8, PIANO[2] + 0.1, 0.15, 0.7, 0.3, 2.2, 0.32, 0, 0.3); }
      notes.visible = true;
      notes.step(dt);
      void frenzy;
      // the drunk slumped against the barrels, the loafer on the post, the tiny-bowlered barkeep in the window
      folk.set(6, DOOR[0] + 1.35, 0.37, PZ1 - 0.3, -0.3, 5, 0, 0.6);
      folk.hide(3); folk.hide(4); folk.hide(7);
      const card = out.inCard();
      ej = card ? ej + dt : 0;
      const u = ej % EJ;
      folk.set(8, DOOR[0] - 1.25, 0.37, FZ + 0.6, card && u < 0.6 ? 1.2 : 0.25, card && u < 0.6 ? P.CLIP.punch : card && u > 1.3 && u < 2.6 ? P.CLIP.tiphat : (time % 11) < 2 ? P.CLIP.point : 0, 2.0, 1.0);
      if (!card || ej < 0.2) { folk.hide(11); landed = false; }
      else eject(u);
      puff.visible = true;
      puff.step(dt, (k) => Math.min(1, k * 5) * (1 - k * 0.7));
      // upstairs on the balcony: Lulu waves at the street, a cowboy leans on the rail sipping
      folk.set(9, BX - 2.6, BALC_Y, FZ + 1.0, 0.15, (time % 7) < 3 ? 4 : 0, 0, 1.2);
      folk.set(10, BX + 3.8, BALC_Y, FZ + 1.05, -0.25, 6, 1.1, 1.0);
    },
  });
  // R5 (critic fix 4): the thrown cowboy is 1.45× and lands on the card's centre line, hangs at the top of a high arc,
  // stretches in flight, pancakes on landing (squash/stretch on the instance matrix) in a big dust burst.
  function eject(u) {
    const C = P.CLIP, ES = 1.1;
    if (u < 0.3) { folk.hide(11); landed = false; return; }
    if (u < 0.4) { doorKick = 0.6; doorSwing = 1; if (!launched) { launched = true; for (let i = 0; i < 4; i++) puff.emit(DOOR[0] + (i - 1.5) * 0.35, 0.6 + (i % 2) * 0.3, FZ + 0.6, (i - 1.5) * 0.4, 0.3, 1.0, 0.6, 0.12, 0); } }
    if (u < 1.75) {
      const t = (u - 0.3) / 1.45, f = t + 0.1 * Math.sin(t * Math.PI * 2);
      const x = DOOR[0] + (LAND[0] - DOOR[0]) * f, z = FZ + 0.2 + (LAND[2] - FZ - 0.2) * f;
      folk.place(11, { x, y: 0.6 * (1 - f) + 1.25 * Math.sin(Math.PI * f * f), z, heading: 0.35, pitch: -f * 5.9, roll: Math.sin(f * 9) * 0.25, clip: C.flail, speed: 2.6, s: ES });
      const k = Math.abs(Math.cos(Math.PI * f)) * 0.2;
      squash(11, 1 - k * 0.45, 1 + k, 1 - k * 0.45);
      return;
    }
    if (!landed) {
      landed = true; launched = false;
      for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2 + Math.sin(i * 7) * 0.2, v = 1.2 + (i % 4) * 0.4; puff.emit(LAND[0] + Math.cos(a) * 0.7, 0.1, LAND[2] + Math.sin(a) * 0.5, Math.cos(a) * v, 0.3 + (i % 5) * 0.15, Math.sin(a) * v * 0.6, 0.7 + (i % 3) * 0.2, 0.1 + (i % 4) * 0.035, 0.5); }
      doorSwing = 1;
    }
    if (u < 3.8) {
      const w = u - 1.75, slide = 0.7 * Math.min(1, w / 0.4), bump = 0.12 * Math.abs(Math.sin(Math.min(1, w / 0.3) * Math.PI));
      folk.place(11, { x: LAND[0], y: bump, z: LAND[2] + slide, heading: 0.35, pitch: -Math.PI / 2, clip: C.sprawl, s: ES });
      const q = Math.exp(-w * 7) * Math.cos(w * 26);
      squash(11, 1 + q * 0.3, 1 + q * 0.2, 1 - q * 0.5);
      return;
    }
    if (u < 4.8) { folk.place(11, { x: LAND[0], y: 0, z: LAND[2] + 0.7, heading: 0.4, clip: C.dizzy, speed: 1.4, s: ES }); return; }
    const w = Math.min(1, (u - 4.8) / 3.2);
    if (w >= 1) { folk.hide(11); return; }
    folk.place(11, { x: LAND[0] + w * 7.5, y: 0, z: LAND[2] + 0.7 + Math.sin(w * 14) * 0.25, heading: Math.PI / 2 + Math.sin(w * 14) * 0.35, clip: C.stagger, speed: 1.2, s: ES });
  }
  function squash(i, sx, sy, sz) {
    folk.mesh.getMatrixAt(i, _mm);
    folk.mesh.setMatrixAt(i, _mm.multiply(_sq.makeScale(sx, sy, sz)));
  }
  out.piano = api.play;
  out.kickDoors = () => { doorKick = 0.8; doorSwing = 1; };
  return out;

  function saloon(B, own) {
    const boardC = own ? 'cream' : 'pom', trimC = own ? 'brass' : 'pomGold';
    falseFront(B, { x: BX, fz: FZ, w: W, d: D, h: H2, fh: FH, front: 'barn', wall: tone(COLORS.barn, 0.85), parapet: 'stepped', door: false, windows: [], trim: 'cream' });
    // ground floor: a wide open doorway glowing with the bar inside (bat-wings in the middle), big windows each side
    if (own) { interior(B, DOOR[0], 0.35, FZ + 0.12); spill(B, DOOR[0], FZ + 0.25); }
    else B.slab('interior', DOOR[0], 0.35, FZ + 0.12, OPEN_W, OPEN_H, 0.05, { round: 0.01, taper: 0, noAo: true });
    B.slab('cream', DOOR[0], 0.35 + OPEN_H, FZ + 0.2, OPEN_W + 0.5, 0.2, 0.2, { round: 0.03, taper: 0 });
    for (const sd of [-1, 1]) B.slab('cream', DOOR[0] + sd * (OPEN_W / 2 + 0.1), 0.35, FZ + 0.2, 0.2, OPEN_H, 0.2, { round: 0.03, taper: 0 });
    win(B, DOOR[0] - 3.35, 1.0, FZ + 0.16, { w: 2.0, h: 1.5, trim: 'cream', sil: 2, glass: own ? 'glassS' : 'glass' });
    win(B, DOOR[0] + 3.15, 1.0, FZ + 0.16, { w: 1.6, h: 1.5, trim: 'cream', sil: 1, glass: own ? 'glassS' : 'glass' });
    // upstairs: three windows with shutters, one with a lady's curtain
    for (let i = 0; i < 3; i++) win(B, BX - 3.4 + i * 3.4, H1 + 0.95, FZ + 0.16, { w: 1.1, h: 1.35, trim: 'cream', shutters: i === 1 ? 'teal' : 'mustard', glass: own ? 'glassS' : 'glass' });
    // the big sign + blade sign
    signBoard(B, BX + 0.6, H1 + 1.45 + 1.0, FZ + 0.18, 5.6, 1.25, { board: boardC, trim: trimC });
    bottle(B, BX + 0.6, H1 + 4.25, FZ + 0.3, own);
    if (own) blade(B, BX + W / 2 - 0.5, 2.0, PZ1 - 0.1, { board: 'ownTeal' });
    else B.slab('pomGold', BX - 3.2, H1 + 2.3, FZ + 0.32, 0.6, 0.6, 0.06, { round: 0.25, taper: 0 });
    // deep porch on stout posts, a shallow spindle balcony over its back half
    porch(B, BX - W / 2 - 0.2, BX + W / 2 + 0.2, FZ, PZ1, { h: 0.35, awnY: H1, awn: 'plank2', posts: 5, stepX: DOOR[0], stepW: 3.0 });
    for (let i = 0; i < 5; i++) { const px = BX - W / 2 + i * ((W - 0.0) / 4); B.cyl('raw2', px, 0.3, PZ1 - 0.2, 0.15, 0.25, 0, { sides: 6, taper: 1.15 }); }
    const by = H1 + 0.22;
    B.slab('plank', BX, by, (FZ + BALZ) / 2, W + 0.5, 0.12, BALZ - FZ + 0.3, { round: 0.03, taper: 0 });
    B.slab('raw2', BX, by - 0.18, BALZ + 0.1, W + 0.5, 0.2, 0.2, { round: 0.03, taper: 0 });
    const n = 30;
    for (let i = 0; i <= n; i++) B.cyl('cream', BX - W / 2 + i * (W / n), by + 0.1, BALZ + 0.1, 0.045, 0.62, 0, { sides: 5, taper: 0.8 });
    B.slab('raw', BX, by + 0.7, BALZ + 0.1, W + 0.3, 0.1, 0.16, { round: 0.03, taper: 0 });
    for (const k of [-1, 1]) for (let i = 0; i <= 3; i++) B.cyl('cream', BX + k * (W / 2 + 0.1), by + 0.1, FZ + 0.2 + i * ((BALZ - FZ - 0.1) / 3), 0.045, 0.62, 0, { sides: 5, taper: 0.8 });
    for (const k of [-1, 1]) B.slab('raw', BX + k * (W / 2 + 0.1), by + 0.7, (FZ + BALZ) / 2 + 0.05, 0.14, 0.1, BALZ - FZ, { round: 0.03, taper: 0 });
    const glow = own ? 'lantern' : 'lanternN';
    lantern(B, DOOR[0] - 2.0, 2.35, FZ + 0.42, { glow });
    lantern(B, DOOR[0] + 2.0, 2.35, FZ + 0.42, { glow });
    // lanterns hung on the porch posts, facing the street
    for (const i of [0, 2, 4]) lantern(B, BX - W / 2 + i * (W / 4) + (i === 0 ? 0.2 : i === 4 ? -0.2 : 0.6), 2.3, PZ1 + 0.12, { glow });
    // the barrel + crate pyramid right of the doors (ref: the porch's big warm prop mass)
    const PX = DOOR[0] + 2.45, PZ = PZ1 - 0.62;
    for (let i = 0; i < 3; i++) barrel(B, PX + i * 0.8, 0.35, PZ, 0.95, i === 1 ? 'plank2' : 'plank');
    for (let i = 0; i < 2; i++) barrel(B, PX + 0.4 + i * 0.8, 0.35 + 0.93, PZ + 0.02, 0.92, i ? 'plank' : 'plank2');
    barrel(B, PX + 0.8, 0.35 + 1.83, PZ + 0.04, 0.88);
    crate(B, PX + 2.35, 0.35, PZ + 0.5, 1.0, 0.2);
    crate(B, PX + 2.3, 0.35 + 0.62, PZ + 0.45, 0.85, -0.15, 'raw2');
    crate(B, PX - 0.75, 0.35, PZ + 0.05, 0.75, 0.5);
    for (const [dx, dz, c] of [[2.15, 0.35, '#7a3a1e'], [2.45, 0.55, '#4f6b3a'], [0.8, 0.0, '#7a3a1e']]) { const y = dx > 2 ? 0.35 + 1.15 : 0.35 + 2.68; B.cyl(c, PX + dx, y, PZ + dz, 0.08, 0.36, 0, { sides: 6, taper: 0.75 }); B.cyl('#e9dcc0', PX + dx, y + 0.36, PZ + dz, 0.035, 0.1, 0, { sides: 4, taper: 1 }); }
    B.contact(PX + 1.0, PZ + 0.3, 3.8, 1.6);
    // the piano, barrels, a bench
    piano(B, PIANO[0], PIANO[1], PIANO[2]);
    lantern(B, PIANO[0] - 0.3, 2.45, FZ + 1.75, { glow: own ? 'lantern' : 'lanternN' });
    // porch clutter: spittoon, posters, bottles on the barrels, a broom, a sleeping hound under the piano bench
    B.cyl('brass', DOOR[0] - 2.1, 0.35, FZ + 0.7, 0.2, 0.28, 0, { sides: 9, taper: 0.7 });
    B.cyl('brass', DOOR[0] - 2.1, 0.6, FZ + 0.7, 0.16, 0.06, 0, { sides: 9, taper: 1.4 });
    for (const [px, py, rz] of [[DOOR[0] - 4.85, 1.5, 0.06]]) { B.slab('#f1e4c4', px, py, FZ + 0.2, 0.55, 0.72, 0.02, { round: 0.01, taper: 0, rz, noAo: true }); B.slab('ink', px, py + 0.45, FZ + 0.22, 0.4, 0.1, 0.01, { round: 0, taper: 0, rz, noAo: true }); B.ball('#b98a6a', px, py + 0.25, FZ + 0.22, 0.13, { sz: 0.1, detail: 0, noAo: true }); }
    B.cyl('raw', BX - 5.2, 0.35, FZ + 0.35, 0.03, 1.4, 0, { sides: 4, taper: 1, rz: 0.18 });
    B.cone('hay2', BX - 5.32, 0.35, FZ + 0.35, 0.2, 0.42, 0, { sides: 6, rz: 0.18 });
    hound(B, PIANO[0] + 0.5, 0.37, FZ + 2.15);
    // the hay cart (fling landing target): a stack of loose hay and two bales
    cart(B, HAYCART[0], HAYCART[1], { ry: 0.12 });
    B.ball('hay', HAYCART[0], 1.0, HAYCART[1], 0.95, { sx: 1.25, sy: 0.55, sz: 0.65, detail: 1, smooth: true });
    bale(B, HAYCART[0] - 0.5, 0.78, HAYCART[1] + 0.1, 0.1, 0.8);
    bale(B, HAYCART[0] + 1.6, 0, HAYCART[1] + 0.9, 0.5, 0.9);
    if (!own) for (const dx of [-1, 1]) B.slab('plank3', DOOR[0] + dx * 0.8, 0.4, FZ + 0.2, 1.6, 2.6, 0.06, { round: 0.02, taper: 0, rz: dx * 0.04 });
    if (!own) for (const s of [-1, 1]) B.slab('plank2', DOOR[0], 1.3 + s * 0.45, FZ + 0.3, OPEN_W + 0.2, 0.18, 0.06, { round: 0.02, taper: 0, rz: s * 0.35 });
  }

  // upright piano, keys facing local +z turned by PRY (toward the door, so Fingers plays in profile to the card camera)
  function piano(B, x, y, z) {
    const wood = '#a8562e', dark = '#6a3220', c = Math.cos(PRY), sn = Math.sin(PRY);
    const S = (slot, lx, ly, lz, w, h, d, o = {}) => B.slab(slot, x + lx * c + lz * sn, y + ly, z - lx * sn + lz * c, w, h, d, { ...o, ry: PRY });
    const C = (slot, lx, ly, lz, r, h, o = {}) => B.cyl(slot, x + lx * c + lz * sn, y + ly, z - lx * sn + lz * c, r, h, 0, o);
    S(wood, 0, 0, 0, 1.7, 1.5, 0.66, { round: 0.06, taper: 0 });
    S(dark, 0, 1.48, 0, 1.8, 0.1, 0.74, { round: 0.03, taper: 0 });
    S('#a45a34', 0, 0.92, 0.34, 1.42, 0.44, 0.04, { round: 0.02, taper: 0 });
    S(wood, 0, 0.7, 0.44, 1.62, 0.13, 0.46, { round: 0.03, taper: 0 });
    for (let i = 0; i < 14; i++) S(i % 2 ? '#fbf6ea' : '#f1eadb', -0.72 + i * 0.111, 0.82, 0.5, 0.098, 0.06, 0.32, { round: 0.005, taper: 0, noAo: true });
    for (let i = 0; i < 10; i++) if (i % 3 !== 2) S('#221a1e', -0.66 + i * 0.15, 0.87, 0.42, 0.06, 0.05, 0.16, { round: 0.005, taper: 0, noAo: true });
    for (const k of [-1, 1]) C(dark, k * 0.72, 0, 0.55, 0.06, 0.74, { sides: 6, taper: 1 });
    S('#f4ecd8', 0.1, 0.98, 0.36, 0.55, 0.4, 0.03, { round: 0.01, taper: 0, rx: -0.25, noAo: true });
    C('lantern', -0.6, 1.55, 0.1, 0.07, 0.22, { sides: 6, taper: 1, noAo: true });
    C('bottle', 0.55, 1.53, 0.1, 0.08, 0.3, { sides: 6, taper: 0.8 });
    C('#e9dcc0', 0.25, 1.53, 0.05, 0.12, 0.12, { sides: 7, taper: 0.8 });
    C('#7a4a2e', 0, 0, 1.0, 0.25, 0.5, { sides: 9, taper: 1 });
    B.contact(x + sn * 0.3, z + c * 0.3, 2.0, 1.6, { ry: PRY });
  }

  // The bar seen through the open doorway, painted in shallow layers (zero draws: part of the static mesh): a warm back
  // wall, a mirror and shelves of bottles, two hanging lamps, the bar counter and drinkers silhouetted against it.
  function interior(B, x, y, z) {
    const w = OPEN_W, h = OPEN_H;
    B.slab('inDeep', x, y, z - 0.04, w, h, 0.04, { round: 0, taper: 0, noAo: true });
    B.slab('inGlow', x, y + 1.0, z - 0.02, w - 0.3, 1.45, 0.03, { round: 0.02, taper: 0, noAo: true });
    B.slab('mirror', x + 0.35, y + 1.5, z - 0.005, 1.3, 0.7, 0.02, { round: 0.05, taper: 0, noAo: true });
    B.slab('inBar', x + 0.35, y + 1.47, z, 1.45, 0.06, 0.03, { round: 0.01, taper: 0, noAo: true });
    for (const sy of [1.25, 2.25]) {
      B.slab('inBar', x, y + sy, z, w - 0.4, 0.06, 0.06, { round: 0.01, taper: 0, noAo: true });
      for (let i = 0; i < 11; i++) { const bx = x - w / 2 + 0.35 + i * ((w - 0.7) / 10); if (sy < 2 && Math.abs(bx - x - 0.35) < 0.7) continue; B.cyl(['#6b2a18', '#3f5a2a', '#8a4a1e', '#2e2a3a'][(i * 3 + (sy > 2 ? 1 : 0)) % 4], bx, y + sy + 0.06, z + 0.01, 0.06, 0.2 + (i % 3) * 0.05, 0, { sides: 5, taper: 0.7, noAo: true }); }
    }
    for (const lx of [-0.9, 1.0]) { B.cyl('inBar', x + lx, y + h - 0.35, z + 0.02, 0.012, 0.35, 0, { sides: 3, taper: 1, noAo: true }); B.ball('inLamp', x + lx, y + h - 0.42, z + 0.03, 0.13, { sz: 0.6, detail: 1, noAo: true }); }
    B.slab('inBar', x, y, z + 0.01, w - 0.1, 0.95, 0.04, { round: 0.02, taper: 0, noAo: true });
    B.slab('#b5683a', x, y + 0.92, z + 0.03, w - 0.05, 0.08, 0.05, { round: 0.02, taper: 0, noAo: true });
    // drinkers at the bar, hats on, one with a raised glass
    for (const [dx, s, hat] of [[-1.15, 1.0, 1], [-0.45, 0.9, 0], [0.95, 1.05, 1]]) {
      const px = x + dx, base = y + 0.25;
      B.slab('inSil', px, base, z + 0.05, 0.5 * s, 0.8 * s, 0.01, { round: 0.14 * s, taper: 0.2, noAo: true });
      B.ball('inSil', px, base + 0.98 * s, z + 0.05, 0.2 * s, { sz: 0.08, detail: 1, noAo: true });
      if (hat) { B.slab('inSil', px, base + 1.12 * s, z + 0.05, 0.62 * s, 0.05, 0.01, { round: 0.01, taper: 0, noAo: true }); B.slab('inSil', px, base + 1.15 * s, z + 0.05, 0.3 * s, 0.2 * s, 0.01, { round: 0.05, taper: 0.1, noAo: true }); }
    }
    B.slab('inSil', x - 0.2, y + 0.95, z + 0.05, 0.08, 0.4, 0.01, { round: 0.03, taper: 0, rz: 0.5, noAo: true });
    B.slab('inSil', x - 0.08, y + 1.3, z + 0.05, 0.1, 0.15, 0.01, { round: 0.02, taper: 0, noAo: true });
  }

  // R6: warm lamplight spilling out of the doorway onto the porch boards and the step (static, glow slot)
  function spill(B, x, z) {
    for (let i = 0; i < 4; i++) B.slab('spill', x, 0.355 + i * 0.002, z + 0.4 + i * 0.55, OPEN_W - 0.2 + i * 0.5, 0.01, 0.55, { round: 0, taper: 0, noAo: true });
  }

  function hound(B, x, y, z) {
    B.ball('#9a6a45', x, y, z, 0.32, { sx: 1.5, sy: 0.6, sz: 0.8, detail: 1, smooth: true, aoBase: y });
    B.ball('#9a6a45', x + 0.45, y + 0.05, z + 0.08, 0.17, { sx: 1.3, sy: 0.8, detail: 1, smooth: true, aoBase: y });
    for (const k of [-1, 1]) B.slab('#6a4428', x + 0.4, y + 0.1, z + 0.08 + k * 0.13, 0.12, 0.05, 0.22, { round: 0.03, taper: 0, rx: k * 0.5 });
    B.ball('#2a1e1e', x + 0.66, y + 0.05, z + 0.08, 0.04, { detail: 0 });
    B.contact(x, z, 1.1, 0.6);
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
