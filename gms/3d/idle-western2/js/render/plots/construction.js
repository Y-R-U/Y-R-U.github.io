// The Mulligan Brothers' building site (DESIGN W13, proposal §3): one generic, lot-sized stage kit per plot, built at boot.
// Stages (state.build[lineId].stage): 0 survey · 1 frame · 2 walls · 3 false front · 4 sign. Driven by stats.building
// ({ stage, t, T, p01, acq }). A stage change is a visibility swap + a 0.4 s squash pop; inside a stage the frame and
// walls rise with t. No geometry is made after boot: timbers and planks are one InstancedMesh, the swinging front and
// the sign are two prebuilt meshes, the crew is one crowd. Also plays the Lv25/Lv100 "extension" crew bustle.
import * as THREE from 'three';
import { softPuffs } from '../fx.js?v=20261004f';
import { tone, wheel, crate, particles, placed, headY, tilt, rand, smooth01, fgProp, COLORS, CROWD_K } from './western.js?v=20261004f';

const easeBack = (x) => { const t = Math.max(0, Math.min(1, x)); const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const NSTAGE = 5, UP = new THREE.Vector3(0, 1, 0);
const FACE = -0.45; // heading that faces the card cameras (they stand south-west of the lot)
const CREW_SCALE = 0.96, CREW_K = 1.0;

// site: { x, fz, w, d, h, fh, parapet, ext: {x, z, w, h} (Lv25/100 bustle spot), yard: [x, z] (lumber pile + mule cart) }
export function createConstruction(kit, P, site) {
  const S = { x: 0, fz: 0.9, w: 8, d: 5.5, h: 3.4, ...site };
  S.fh ??= S.h + 2;
  const x0 = S.x - S.w / 2, x1 = S.x + S.w / 2, zf = S.fz, zb = S.fz - S.d;
  const yard = S.yard || [x1 + 1.2, zf + 2.0];
  const root = new THREE.Group();
  root.name = 'construction';
  // Visible until the first update so the boot warm-up (host.warm, before any world.update) links its programs incl. the
  // instanced shadow-depth flavour (PERF P#7); the first update hides it again.
  root.visible = true;
  P.group.add(root);
  const rnd = rand(17 + Math.round(S.w * 13));

  // ---- the yard (always on while building), staged like refs/a_clay_build.jpg: lumber stack front-left, theodolite
  // beside it, toolbox and nail kegs at the deck edge, a sawhorse front-right, the mule cart parked right of the frame
  const g = kit.builder(P.pal, { seed: 71 });
  g.slab('dirtM', S.x, -0.02, zf - S.d / 2 + 0.6, S.w + 2.6, 0.05, S.d + 3.0, { round: 0.04, taper: 0, noAo: true });
  for (let i = 0; i < 9; i++) g.slab(i % 2 ? 'rut' : 'dirtL', S.x + (rnd() - 0.5) * S.w, 0.0, zf + 1.8 - rnd() * (S.d + 1.5), 0.6 + rnd() * 1.2, 0.04, 0.4 + rnd() * 0.6, { round: 0.02, taper: 0, ry: rnd() * 3, noAo: true });
  const tx = x0 + 1.0, tz = zf + 1.95;
  for (let i = 0; i < 3; i++) { const a = i * 2.09 + 0.3; g.cyl('raw2', tx + Math.cos(a) * 0.3, 0, tz + Math.sin(a) * 0.3, 0.06, 1.3, 0, { sides: 5, taper: 0.8, rz: Math.cos(a) * 0.22, rx: -Math.sin(a) * 0.22 }); }
  g.slab('brass', tx, 1.22, tz, 0.5, 0.26, 0.26, { round: 0.06, ry: 2.4 });
  g.cyl('brass', tx - 0.2, 1.35, tz - 0.18, 0.08, 0.42, 0, { sides: 7, taper: 1, rx: Math.PI / 2, ry: 2.4 });
  const LUM = [x0 - 0.1, zf + 2.35];
  for (let r = 0; r < 4; r++) for (let k = 0; k < 4 - (r >> 1); k++) g.slab(tone(COLORS.raw, 0.9 + ((r * 3 + k) % 4) * 0.05), LUM[0] + (k - 1.5 + (r >> 1) * 0.5) * 0.44 + (r % 2) * 0.06, 0.02 + r * 0.24, LUM[1], 0.42, 0.22, 2.6, { round: 0.04, taper: 0, ry: Math.PI / 2 + 0.25 + (r % 2 ? 0.04 : -0.03) });
  for (const k of [-1, 1]) g.slab('raw2', LUM[0], 0, LUM[1] + k * 0.9, 1.9, 0.08, 0.2, { round: 0.02, taper: 0, ry: 0.25 });
  g.contact(LUM[0], LUM[1], 2.4, 3.0, { ry: 0.25 });
  // toolbox with a hammer and a saw, two nail kegs, offcuts
  const TB = [x1 - 0.35, zf + 1.95];
  g.slab('raw', TB[0], 0, TB[1], 0.9, 0.4, 0.45, { round: 0.05, ry: 0.3 });
  g.slab('raw2', TB[0], 0.4, TB[1], 0.08, 0.32, 0.08, { round: 0.02, taper: 0, ry: 0.3, rz: 0 });
  g.slab('raw2', TB[0], 0.68, TB[1], 0.8, 0.07, 0.07, { round: 0.02, taper: 0, ry: 0.3 });
  g.slab('iron', TB[0] + 0.15, 0.4, TB[1] + 0.05, 0.5, 0.06, 0.2, { round: 0.02, taper: 0, ry: 1.2 });
  g.cyl('raw', TB[0] - 0.25, 0.42, TB[1] + 0.1, 0.04, 0.45, 0, { sides: 5, taper: 1, rz: 1.2, ry: 0.3 });
  for (let i = 0; i < 6; i++) g.slab(tone(COLORS.raw, 0.9 + (i % 3) * 0.06), x0 + 1.4 + i * 0.75, 0.02, zf + 2.4 + (i % 3) * 0.5, 0.55 + (i % 3) * 0.2, 0.1, 0.2, { round: 0.02, taper: 0, ry: i * 1.3 });
  // kegs right of the deck (by the mule), a crate of shingles and a bucket of nails front-left, stones in the foreground
  for (const [dx, dz] of [[0.45, 1.75], [1.05, 2.05], [0.6, 2.45]]) { g.cyl('plank', x1 + dx, 0, zf + dz, 0.3, 0.62, 0, { sides: 10, taper: 0.9 }); for (const h of [0.08, 0.5]) g.cyl('iron', x1 + dx, h, zf + dz, 0.31, 0.05, 0, { sides: 10, taper: 1, noAo: true }); }
  crate(g, x0 + 0.35, 0, zf + 1.7, 0.85, 0.4);
  g.cyl('iron', x0 + 1.5, 0, zf + 2.6, 0.2, 0.3, 0, { sides: 9, taper: 1.1 });
  // R6 (critic r5 #7): the yard foreground is sawdust, offcuts and dropped planks (no red rocks)
  for (let i = 0; i < 4; i++) g.ball(tone('#ecd3a0', 0.94 + (i % 2) * 0.08), S.x + (rnd() - 0.45) * S.w * 1.1, 0, zf + 3.4 + rnd() * 1.4, 0.32 + rnd() * 0.22, { sy: 0.16, detail: 1, smooth: true, noAo: true });
  for (let i = 0; i < 7; i++) g.slab(tone(COLORS.raw, 0.92 + (i % 3) * 0.07), S.x + (rnd() - 0.45) * S.w * 1.2, 0, zf + 3.2 + rnd() * 1.9, 0.18 + rnd() * 0.2, 0.1, 0.14 + rnd() * 0.08, { round: 0.02, taper: 0, ry: rnd() * 3 });
  for (let i = 0; i < 2; i++) g.slab(tone(COLORS.raw, 1.0 + i * 0.05), S.x - 1.2 + i * 2.6, 0.03, zf + 3.9 + i * 0.5, 2.2, 0.08, 0.26, { round: 0.02, taper: 0, ry: 0.4 - i * 0.9, rz: 0.02 });
  g.ball(tone("#ecd3a0", 1.0), S.x + 0.95, 0, zf + 2.35, 0.55, { sy: 0.14, detail: 1, smooth: true, noAo: true });
  // sawhorse with a plank half sawn (B works here: the bonk victim)
  const SAW = [S.x + 0.95, zf + 2.25];
  for (const k of [-1, 1]) for (const j of [-1, 1]) g.slab('raw2', SAW[0] + k * 0.6, 0, SAW[1] + j * 0.2, 0.13, 0.8, 0.13, { round: 0.03, taper: 0, rz: k * 0.14, rx: j * 0.2 });
  g.slab('raw', SAW[0], 0.74, SAW[1], 1.5, 0.16, 0.24, { round: 0.03, taper: 0 });
  g.slab(tone(COLORS.raw, 1.06), SAW[0] + 0.3, 0.9, SAW[1], 2.0, 0.12, 0.38, { round: 0.03, taper: 0, rz: -0.04 });
  g.contact(SAW[0], SAW[1], 1.8, 0.9);
  const yardMesh = g.finish();
  root.add(yardMesh);
  // the mule cart (own mesh) parked right of the frame, its mule facing the street
  const cb = kit.builder(P.pal, { seed: 76 });
  cartAndMule(cb, -1.3, 0);
  const cartM = cb.finish();
  cartM.matrixAutoUpdate = true;
  const CART = S.cart || [x1 + 1.05, zf - 1.7];
  cartM.position.set(CART[0], 0, CART[1]);
  cartM.rotation.y = -Math.PI / 2;
  root.add(cartM);

  // ---- timbers + planks: one InstancedMesh with per-instance stage, reveal time and colour. Chunky (R4 critic: "a
  // lattice of thin sticks"): posts 0.3, plates 0.28, braces 0.2. Stages read as deck → braced frame + ladder → walls.
  const items = [];
  const T = (stage, r, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0, col = COLORS.raw, grow = 'pop', until = 9) => items.push({ stage, r, x, y, z, sx, sy, sz, rx, ry, rz, col, grow, until });
  const tb = 0.3, pl = 0.28, DECK = 0.43, zd = zf + 1.5;
  const wood = (k) => tone(COLORS.raw, 0.9 + (k % 4) * 0.05);
  // stage 0 survey + deck: stakes and string first, then piers, sills, joists and deck boards laid front to back
  const corners = [[x0, zf], [x1, zf], [x1, zb], [x0, zb]];
  for (const [cx, cz] of corners) { T(0, 0, cx, 0, cz, 0.1, 0.8, 0.1, 0, 0, 0, COLORS.raw2, 'pop', 0); T(0, 0, cx, 0.66, cz + 0.06, 0.2, 0.12, 0.04, 0, 0, 0, '#f2d16a', 'pop', 0); }
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 4], L = Math.hypot(bx - ax, bz - az);
    T(0, 0, (ax + bx) / 2, 0.58, (az + bz) / 2, L, 0.04, 0.04, 0, -Math.atan2(bz - az, bx - ax), 0, COLORS.rope, 'pop', 0);
  }
  const nx = Math.max(2, Math.round(S.w / 2.2));
  for (let i = 0; i <= nx; i++) for (const pz of [zd - 0.2, zf, zb + 0.2]) T(0, 0.3 + i * 0.015, x0 + (i / nx) * S.w, 0, pz, 0.36, 0.12, 0.36, 0, 0, 0, '#9a8a78', 'up');
  for (const pz of [zd - 0.2, zf, zb + 0.2]) T(0, 0.4, S.x, 0.12, pz, S.w + 0.3, 0.24, pl, 0, 0, 0, wood(1));
  for (const sx of [x0, x1]) T(0, 0.42, sx, 0.12, (zd + zb) / 2, pl, 0.24, zd - zb + 0.1, 0, 0, 0, wood(2));
  const nb = Math.round((zd - zb) / 0.46);
  for (let i = 0; i < nb; i++) T(0, 0.5 + (i / nb) * 0.45, S.x, DECK - 0.08, zd - (i + 0.5) * ((zd - zb) / nb), S.w + 0.4, 0.08, (zd - zb) / nb - 0.04, 0, 0, 0, tone(COLORS.plank, 0.92 + ((i * 7) % 4) * 0.05));
  // stage 1 frame: chunky posts, top plates, joists, X-braced sides and end bays, an upper-storey front, a leaning ladder
  for (const [i, [cx, cz]] of corners.entries()) T(1, i * 0.04, cx, DECK, cz, tb, S.h - DECK, tb, 0, 0, 0, wood(i), 'up');
  const dX = 0.9, fposts = [S.x - dX, S.x + dX];
  if (S.w >= 8.5) fposts.push(x0 + S.w * 0.18, x1 - S.w * 0.18);
  fposts.forEach((px, i) => T(1, 0.12 + i * 0.03, px, DECK, zf, tb * 0.9, S.h - DECK, tb * 0.9, 0, 0, 0, wood(i + 1), 'up'));
  for (const sx of [x0, x1]) T(1, 0.2, sx, DECK, (zf + zb) / 2, tb * 0.9, S.h - DECK, tb * 0.9, 0, 0, 0, wood(3), 'up');
  T(1, 0.36, S.x, S.h, zf, S.w + 0.3, pl, pl, 0, 0, 0, wood(0));
  T(1, 0.38, S.x, S.h, zb, S.w + 0.3, pl, pl, 0, 0, 0, wood(2));
  for (const sx of [x0, x1]) T(1, 0.4, sx, S.h, (zf + zb) / 2, pl, pl, S.d + 0.3, 0, 0, 0, wood(1));
  T(1, 0.42, S.x, DECK + 2.45, zf, dX * 2, 0.22, 0.24, 0, 0, 0, wood(3));
  const braceX = (r, ax, bx, z, k) => { const w = bx - ax, h = S.h - DECK - 0.3, L = Math.hypot(w, h) - 0.15, a = Math.atan2(h, w); for (const s of [-1, 1]) T(1, r, (ax + bx) / 2, DECK + 0.15 + h / 2, z, L, 0.2, 0.18, 0, 0, s * a, wood(k + (s > 0 ? 1 : 0)), 'pop'); };
  braceX(0.5, x0 + 0.15, S.x - dX - 0.15, zf - 0.05, 0);
  braceX(0.54, S.x + dX + 0.15, x1 - 0.15, zf - 0.05, 2);
  for (const sx of [x0, x1]) { const h = S.h - DECK - 0.3, L = Math.hypot(S.d, h) - 0.2, a = Math.atan2(h, S.d); for (const s of [-1, 1]) T(1, 0.58, sx, DECK + 0.15 + h / 2, (zf + zb) / 2, 0.18, 0.2, L, s * a, 0, 0, wood(s > 0 ? 1 : 3)); }
  const nj = Math.max(3, Math.round(S.w / 1.3));
  for (let i = 0; i <= nj; i++) T(1, 0.64 + i * 0.015, x0 + (i / nj) * S.w, S.h + pl, (zf + zb) / 2, 0.2, 0.22, S.d + 0.3, 0, 0, 0, wood(i));
  // upper storey of the front (it carries the false front later): posts and a head plate against the sky
  const up = [x0, ...fposts.slice(0, 2), x1];
  up.forEach((px, i) => T(1, 0.74 + i * 0.03, px, S.h + pl, zf, tb * 0.85, S.fh - S.h - pl - 0.3, tb * 0.85, 0, 0, 0, wood(i + 2), 'up'));
  T(1, 0.86, S.x, S.fh - 0.32, zf, S.w + 0.3, pl, pl, 0, 0, 0, wood(1));
  // the ladder: leans from the deck onto the top plate, left of the door
  const lx = x0 + Math.min(1.3, S.w * 0.2), lz = zf + 1.15, LV = S.h + 0.5 - DECK, lean = Math.atan2(1.0, LV), LH = Math.hypot(1.0, LV);
  for (const s of [-1, 1]) T(1, 0.3, lx + s * 0.3, DECK, lz, 0.13, LH, 0.13, -lean, 0, 0, wood(2), 'up', 2);
  for (let k = 1; k < 9; k++) T(1, 0.32 + k * 0.01, lx, DECK + (k / 9) * LV, lz - (k / 9) * 1.0, 0.66, 0.08, 0.1, 0, 0, 0, wood(3), 'pop', 2);
  // stage 2 walls: thick planks clad bottom-up (door + window gaps), then the roof deck
  const PH = 0.34, rows = Math.max(4, Math.floor((S.h - DECK) / PH));
  const doorW = 1.5, winW = 1.4;
  const gaps = (y) => {
    const g2 = [[S.x - doorW / 2, S.x + doorW / 2, DECK + 2.3]];
    for (const dx of [-S.w * 0.3, S.w * 0.3]) g2.push([S.x + dx - winW / 2, S.x + dx + winW / 2, DECK + 2.1, DECK + 0.9]);
    return g2.filter(([, , top, bot = 0]) => y < top && y >= bot);
  };
  for (let r = 0; r < rows; r++) {
    const y = DECK + r * PH, rr = r / rows;
    const segs = [];
    let cur = x0 - 0.2;
    for (const [a, b] of gaps(y).sort((u, v) => u[0] - v[0])) { if (a > cur) segs.push([cur, a]); cur = b; }
    if (cur < x1 + 0.2) segs.push([cur, x1 + 0.2]);
    const col = tone(COLORS.plank, 0.92 + ((r * 7) % 4) * 0.05);
    for (const [a, b] of segs) T(2, rr * 0.8, (a + b) / 2, y, zf + 0.2, b - a, PH * 0.92, 0.1, 0, 0, 0, col);
    for (const sx of [x0 - 0.2, x1 + 0.2]) T(2, rr * 0.8 + 0.02, sx, y, (zf + zb) / 2, 0.1, PH * 0.92, S.d + 0.3, 0, 0, 0, col);
  }
  const rb = Math.round(S.d / 0.5);
  for (let i = 0; i < rb; i++) T(2, 0.82 + (i / rb) * 0.16, S.x, S.h + pl + 0.2, zb + (i + 0.5) * (S.d / rb), S.w + 0.5, 0.08, S.d / rb - 0.03, 0, 0, 0, tone(COLORS.plank2, 0.95 + (i % 3) * 0.05));
  // two extra instances: a carried plank (bonk gag) and the hoist rope; driven by hand each frame
  const CARRY = items.length; T(-1, 0, 0, 0, 0, 2.6, 0.18, 0.36, 0, 0, 0, tone(COLORS.raw, 1.05));
  const ROPES = items.length; for (let i = 0; i < 3; i++) T(-1, 0, 0, 0, 0, 0.03, 1, 0.03, 0, 0, 0, COLORS.rope);
  const PLAN = items.length; T(-1, 0, 0, 0, 0, 0.78, 0.56, 0.02, 0, 0, 0, '#f1ead2');
  const SAWB = items.length; T(-1, 0, 0, 0, 0, 0.03, 0.2, 0.62, 0, 0, 0, '#b9bec2'); T(-1, 0, 0, 0, 0, 0.09, 0.17, 0.16, 0, 0, 0, COLORS.raw2);
  const ub = kit.builder(P.pal);
  ub.slab('#ffffff', 0, 0, 0, 1, 1, 1, { round: 0.02, taper: 0 });
  const timbers = new THREE.InstancedMesh(ub.geometry({ ao: 0.12, aoH: 0.4 }), kit.materials.uber, items.length);
  timbers.castShadow = timbers.receiveShadow = true;
  timbers.boundingSphere = new THREE.Sphere(new THREE.Vector3(S.x, S.fh / 2, (zf + zb) / 2), Math.max(S.w, S.fh) + 4);
  items.forEach((it, i) => { timbers.setColorAt(i, _c.setRGB(...(Array.isArray(it.col) ? it.col : _c.set(it.col).toArray()))); it.k = -1; timbers.setMatrixAt(i, _m.makeScale(0, 0, 0)); });
  root.add(timbers);
  const placeItem = (i, k) => {
    const it = items[i];
    if (k <= 0.001) { timbers.setMatrixAt(i, _m.makeScale(0, 0, 0)); return; }
    _e.set(it.rx, it.ry, it.rz, 'YXZ');
    if (it.grow === 'up') _s.set(it.sx, it.sy * Math.min(1, k), it.sz);
    else _s.set(it.sx * Math.min(1.15, k), it.sy * Math.min(1.15, k), it.sz * Math.min(1.15, k));
    timbers.setMatrixAt(i, _m.compose(_p.set(it.x, it.y, it.z), _q.setFromEuler(_e), _s));
  };
  const placeRaw = (i, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => {
    _e.set(rx, ry, rz, 'YXZ');
    timbers.setMatrixAt(i, _m.compose(_p.set(x, y, z), _q.setFromEuler(_e), _s.set(sx, sy, sz)));
  };
  const rope = (i, ax, ay, az, bx, by, bz) => {
    if (ax == null) { timbers.setMatrixAt(ROPES + i, _m.makeScale(0, 0, 0)); return; }
    const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dy, dz) || 1e-3;
    _q.setFromUnitVectors(UP, _p.set(dx / L, dy / L, dz / L));
    timbers.setMatrixAt(ROPES + i, _m.compose(_p.set(ax, ay, az), _q, _s.set(0.035, L, 0.035)));
  };

  // ---- the false front (raw, unpainted), hinged at its foot: lies flat toward the street, swings up on ropes
  const fb = kit.builder(P.pal, { seed: 72 });
  const FH = S.fh - DECK;
  for (let r = 0, n = Math.round(FH / 0.32); r < n; r++) fb.slab(tone(COLORS.raw, 0.93 + ((r * 5) % 3) * 0.05), 0, r * (FH / n), 0, S.w + 0.1, FH / n * 0.92, 0.1, { round: 0.03, taper: 0 });
  for (const s of [-1, 0, 1]) fb.slab('raw2', s * (S.w / 2 - 0.2), 0, -0.1, 0.16, FH, 0.1, { round: 0.02, taper: 0 });
  if ((S.parapet ?? 'stepped') === 'stepped') { fb.slab(tone(COLORS.raw, 1.02), 0, FH, 0, S.w * 0.62, 0.7, 0.1, { round: 0.03, taper: 0 }); fb.slab(tone(COLORS.raw, 0.96), 0, FH + 0.7, 0, S.w * 0.3, 0.55, 0.1, { round: 0.03, taper: 0 }); }
  else if (S.parapet === 'arched' || S.parapet === 'gabled' || S.parapet === 'peak') for (let k = 0; k < 3; k++) fb.slab(tone(COLORS.raw, 0.94 + k * 0.04), 0, FH + k * 0.36, 0, S.w * (S.parapet === 'arched' ? [0.7, 0.55, 0.32] : [0.66, 0.42, 0.18])[k], 0.34, 0.1, { round: 0.04, taper: 0 });
  fb.slab('interior', 0, 0, 0.05, doorW, 2.3, 0.05, { round: 0.01, taper: 0, noAo: true });
  for (const dx of [-S.w * 0.3, S.w * 0.3]) fb.slab('interior', dx, 1.0, 0.05, winW, 1.35, 0.05, { round: 0.01, taper: 0, noAo: true });
  const front = fb.finish();
  front.matrixAutoUpdate = true;
  front.position.set(S.x, DECK, zf + 0.32);
  root.add(front);

  // ---- the sign (blank cream board, brass edge): hoisted, hit level with a hat
  const sb = kit.builder(P.pal, { seed: 73 });
  const SW = Math.min(S.w * 0.62, 6), SH = 0.95;
  sb.slab('brass', 0, -SH / 2 - 0.08, 0, SW + 0.24, SH + 0.16, 0.1, { round: 0.04, taper: 0 });
  sb.slab('cream', 0, -SH / 2, 0.06, SW, SH, 0.08, { round: 0.03, taper: 0, noAo: true });
  sb.slab('ownTeal', 0, -SH / 2 + SH * 0.35, 0.11, SW * 0.8, 0.16, 0.02, { round: 0.01, taper: 0, noAo: true });
  const sign = sb.finish({ cast: false });
  sign.matrixAutoUpdate = true;
  root.add(sign);
  const signY = S.h + (S.fh - S.h) * 0.62;

  // ---- Lv25/Lv100 bustle scaffold at site.ext
  const E = S.ext || { x: x1 - 1.2, z: zf - 1, w: 3, h: S.fh + 1.5 };
  const eb = kit.builder(P.pal, { seed: 74 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) eb.cyl('raw2', E.x + sx * E.w / 2, 0, E.z + sz * 0.9, 0.06, E.h, 0, { sides: 5, taper: 1 });
  for (let k = 1; k <= 3; k++) eb.slab(tone(COLORS.plank, 1 + (k % 2) * 0.06), E.x, (k / 3) * E.h - 0.2, E.z, E.w + 0.3, 0.08, 1.9, { round: 0.02, taper: 0 });
  for (const sx of [-1, 1]) eb.slab('raw', E.x + sx * E.w / 2, 0.3, E.z + 0.95, 0.06, 0.06, Math.hypot(E.h, 0.1) * 0.9, { round: 0.01, taper: 0, rx: -Math.PI / 2 + 0.05, rz: sx * 0.5 });
  const scaff = eb.finish();
  P.group.add(scaff);

  // ---- crew: 3 identical Mulligans + the manager who runs out at the sign; hammers; bonk stars; dust
  const crew = P.crowd({ count: 4, seed: 5, scale: CREW_SCALE });
  // the tall grump (mulligan3) hammers up top, the shocked one (2) saws and gets bonked, the stocky one (1) carries
  for (let i = 0; i < 3; i++) crew.dress(i, 'mulligan' + [3, 2, 1][i]);
  crew.look(3, { top: '#3f8f8a', bot: '#5a4632', skin: 2, hair: 0, style: 1, acc: ['vest'], stache: 'handlebar', hat: 'bowler', hatScale: 0.85, hatColor: 'dark' }).body(3, 1.2, 0.95, 1.0);
  const hb = kit.builder(P.pal);
  hb.cyl('raw', 0, -0.05, 0, 0.025, 0.4, 0, { sides: 5, taper: 1, rx: Math.PI / 2 });
  hb.slab('iron', 0, -0.06, 0.36, 0.08, 0.12, 0.22, { round: 0.02, taper: 0, rx: Math.PI / 2 });
  const hammers = new THREE.InstancedMesh(hb.geometry({ ao: 0 }), kit.materials.uber, 3);
  hammers.castShadow = false; hammers.boundingSphere = timbers.boundingSphere;
  root.add(hammers);
  const stars = particles(kit, P, (b) => { b.ball('star', 0, 0, 0, 0.35, { detail: 0 }); for (let i = 0; i < 5; i++) b.cone('star', Math.cos(i * 1.2566) * 0.3, Math.sin(i * 1.2566) * 0.3, 0, 0.22, 0.55, 0, { sides: 4, rz: i * 1.2566 - Math.PI / 2 }); }, 6);
  stars.manual = true;
  stars.visible = false;
  root.add(stars);
  const dust = softPuffs(kit, P, 'dust', 24);
  root.add(dust);

  // crew state
  const ag = [0, 1, 2, 3].map((i) => ({ i, x: S.x + (i - 1.5) * 1.5, y: 0, z: zf + 1.5, h: 0, clip: 0, sp: 3.6, tilt: null, hide: false }));
  const go = (a, tx, tz, dt, sp = 2.2) => {
    const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
    if (d < 0.05) return true;
    const st = Math.min(d, sp * dt);
    a.x += (dx / d) * st; a.z += (dz / d) * st; a.h = Math.atan2(dx, dz);
    return false;
  };
  const handAt = (a, time, out) => {
    const t = time * a.sp + a.ph, ang = -1.0 + 0.55 * Math.sin(t * 2), c = Math.cos(ang), s = Math.sin(ang);
    const vy = -0.275, vz = 0.005;
    const ly = 0.68 + c * vy - s * vz - 0.04, lz = s * vy + c * vz, lx = 0.215;
    const ch = Math.cos(a.h), sh = Math.sin(a.h);
    out[0] = a.x + (lx * ch + lz * sh) * a.k; out[1] = a.y + ly * a.k; out[2] = a.z + (-lx * sh + lz * ch) * a.k; out[3] = ang;
    return out;
  };
  ag.forEach((a, k) => { a.ph = k * 1.7; a.k = CREW_SCALE * CROWD_K * [1.25, 1.0, 1.1, 1.0][k]; });

  let shownStage = -1, popT = 1, lastT = null, lastP = 0, bustle = 0, bonk = 0, bonkCd = 4, hurryKick = 0, thumped = false, dove = false, levelled = false, cheer = 0, prevVt = null;
  const hand = [0, 0, 0, 0];

  function setStage(st, rebrand) {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.stage < 0) continue;
      const k = st > it.until ? 0 : rebrand || st > it.stage ? 1 : st < it.stage ? 0 : -1;
      if (k >= 0 && it.k !== k) { it.k = k; placeItem(i, k); }
    }
    timbers.instanceMatrix.needsUpdate = true;
  }
  function burst(x, y, z, n = 8, s = 0.45) {
    for (let i = 0; i < n; i++) { const a = rnd() * 6.28; dust.emit(x + Math.cos(a) * 0.4, y + 0.2, z + Math.sin(a) * 0.4, Math.cos(a) * (0.6 + rnd()), 0.5 + rnd() * 0.8, Math.sin(a) * (0.6 + rnd()), 0.9 + rnd() * 0.5, s * (0.7 + rnd() * 0.6), 0.6); }
  }

  // ---- empty-lot stakes (W3): FOR SALE (cream + brass coin) once the block is open, else RESERVED · POMFREY (purple + gold crest)
  const stakes = { sale: null, reserved: null };
  if (S.stakes !== false) {
    const [sx, sz] = S.stake || [S.x + S.w / 2 - 0.6, zf + 1.9];
    const mkStake = (board, icon) => {
      const k = kit.builder(P.pal, { seed: 75 });
      k.cyl('raw2', sx, 0, sz, 0.07, 1.9, 0, { sides: 5, taper: 0.9, rz: 0.06 });
      k.slab(board, sx + 0.05, 1.05, sz + 0.06, 1.5, 0.95, 0.08, { round: 0.04, taper: 0, rz: 0.06 });
      k.slab(icon, sx + 0.05, 1.0, sz + 0.03, 1.62, 1.07, 0.04, { round: 0.04, taper: 0, rz: 0.06 });
      if (board === 'cream') { k.cyl('gold', sx + 0.07, 1.52, sz + 0.12, 0.26, 0.06, 0, { sides: 13, taper: 1, rx: Math.PI / 2 }); k.slab('#6b4a2a', sx + 0.07, 1.4, sz + 0.17, 0.06, 0.26, 0.02, { round: 0.01, taper: 0 }); }
      else { k.ball('gold', sx + 0.07, 1.52, sz + 0.12, 0.24, { sz: 0.3, detail: 1 }); for (let i = -1; i <= 1; i++) k.cone('gold', sx + 0.07 + i * 0.13, 1.7, sz + 0.12, 0.07, 0.22 - Math.abs(i) * 0.06, 0, { sides: 4 }); }
      k.contact(sx, sz, 0.4, 0.4);
      const m = k.finish(); m.visible = false; P.group.add(m); return m;
    };
    stakes.sale = mkStake('cream', 'brass');
    stakes.reserved = mkStake('#6b3f8f', 'gold');
  }

  const api = {
    root, site: S, crew, scaff, stakes, kit,
    anchors: { site: [S.x, S.h / 2, zf], yard: [CART[0], 0, CART[1]], sign: [S.x, signY, zf + 0.4] },
    // stats.building drives it; returns true while the site (or a bustle) owns the plot visuals.
    update(dt, stats, ctx) {
      const bld = stats?.building || null;
      if (stakes.sale) {
        const empty = !ctx.owned && !bld;
        stakes.sale.visible = empty && stats?.districtOpen !== false;
        stakes.reserved.visible = empty && stats?.districtOpen === false;
      }
      const vt = ctx.owned ? (stats?.visualTier ?? 0) : -1;
      if (prevVt != null && vt > prevVt && vt > 0) { bustle = 4.5; burst(E.x, 0.2, E.z + 1, 10, 0.6); }
      prevVt = vt;
      if (!bld && bustle <= 0) {
        if (root.visible || crew.mesh.visible) { root.visible = false; scaff.visible = false; crew.mesh.visible = false; stars.visible = false; }
        shownStage = -1; lastT = null;
        return false;
      }
      const time = ctx.time;
      crew.mesh.visible = true;
      if (!bld) return bustleTick(dt, time);
      root.visible = true; scaff.visible = false;
      const rebrand = bld.acq === 'rebrand';
      const acquired = bld.acq && bld.acq !== 'built' && !rebrand;
      if (acquired) { root.visible = false; crew.mesh.visible = false; return false; }
      const st = rebrand ? 4 : Math.max(0, Math.min(NSTAGE - 1, bld.stage | 0));
      const p01 = Math.max(0, Math.min(1, bld.p01 ?? (bld.t / Math.max(1e-3, bld.T))));
      const sp = rebrand ? p01 : Math.max(0, Math.min(1, p01 * NSTAGE - st));
      if (lastT != null && bld.t - lastT > dt * 1.5 + 0.2) { hurryKick = 0.6; const hx = S.x + (rnd() - 0.5) * S.w, hy = 0.5 + rnd() * S.h; burst(hx, hy, zf + 0.3, 5, 0.3); }
      lastT = bld.t;
      if (st !== shownStage) {
        if (shownStage >= 0) { popT = 0; burst(S.x, 0, zf + 0.4, 12, 0.6); }
        shownStage = st; thumped = levelled = dove = false; cheer = 0;
        setStage(st, rebrand);
      }
      // per-frame growth inside the current stage
      if (st <= 2) {
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          if (it.stage !== st) continue;
          const k = it.grow === 'up' ? Math.max(0, Math.min(1, (sp - it.r) / 0.18)) : easeBack((sp - it.r) / 0.12) * (sp > it.r ? 1 : 0);
          if (Math.abs(k - it.k) > 1e-3) { it.k = k; placeItem(i, k); }
        }
      }
      if (popT < 1) {
        popT = Math.min(1, popT + dt / 0.4);
        const w = Math.sin(popT * Math.PI) * (1 - popT * 0.4);
        root.scale.set(1 + w * 0.06, 1 - w * 0.1, 1 + w * 0.06);
      } else root.scale.set(1, 1, 1);
      // the false front: flat on the street during stage 3, swings up with an overshoot, THUMP, dust
      front.visible = st >= 3;
      if (st === 3) {
        const u = smooth01(sp / 0.86);
        const swing = u < 1 ? (1 - u) * (Math.PI / 2) : 0;
        const settle = sp > 0.86 ? Math.sin(Math.min(1, (sp - 0.86) / 0.14) * Math.PI * 2) * 0.05 * (1 - (sp - 0.86) / 0.14) : 0;
        front.rotation.x = swing - settle;
        if (sp > 0.86 && !thumped) { thumped = true; burst(S.x, 0.1, zf + 0.6, 14, 0.7); }
      } else front.rotation.x = 0;
      // the sign: hoisted on a rope, crooked, then levelled by a hat
      sign.visible = st >= 4;
      let sRot = 0;
      if (st === 4) {
        const u = smooth01(sp / 0.6);
        sign.position.set(S.x, 0.6 + (signY - 0.6) * u, zf + 0.42);
        sRot = sp < 0.72 ? 0.22 * Math.sin(time * 2.2) * (1 - u * 0.4) + 0.14 : 0;
        if (sp >= 0.72 && !levelled) { levelled = true; burst(S.x + SW / 2, signY - 0.4, zf + 0.5, 4, 0.25); }
        sign.rotation.z = sRot;
      }
      // ropes
      rope(0); rope(1); rope(2);
      if (st === 3 && sp < 0.95) {
        const ang = front.rotation.x, topY = DECK + Math.cos(ang) * FH, topZ = zf + 0.32 + Math.sin(ang) * FH;
        for (const [i, sx] of [[0, -1], [1, 1]]) rope(i, S.x + sx * (S.w / 2 - 0.3), topY, topZ, S.x + sx * (S.w / 2 - 0.3), S.h + 1.1, zb + 0.6);
      }
      if (st === 4 && sp < 0.75) rope(2, S.x, sign.position.y, zf + 0.42, S.x, S.fh + 0.6, zf + 0.3);
      crewTick(dt, time, st, sp);
      timbers.instanceMatrix.needsUpdate = true;
      dust.step(dt);
      return true;
    },
  };

  function crewTick(dt, time, st, sp) {
    const [A, B, C, M] = ag;
    const fast = hurryKick > 0 ? 2.2 : 1;
    hurryKick = Math.max(0, hurryKick - dt);
    for (const a of [A, B, C]) { a.y = 0; a.clip = 3; a.sp = 3.6 * fast; a.tilt = null; a.hide = false; a.saw = false; }
    M.hide = true;
    let carry = false;
    // R4 staging: every Mulligan has a job and a prop, spread across the frame. A hammers up high, B works the sawhorse
    // (and catches the plank), C carries planks from the lumber stack, the foreman (M) reads the blueprint front-right.
    const cyc = (per) => { const u = (time % per) / per; return u; };
    // B saws a plank on the sawhorse from behind it, facing the camera (the saw is a timbers instance)
    function sawyer() { B.x = SAW[0] + 0.05; B.z = SAW[1] - 0.62; B.y = DECK; B.h = -0.15; B.clip = 3; B.saw = true; }
    if (st === 0) {
      if (sp < 0.4) { const ci = Math.floor(sp * 10) % 4, [cx, cz] = corners[ci]; if (go(A, cx + 0.5, cz + 0.6, dt, 3)) { A.h = Math.atan2(-0.5, -0.6); A.clip = 3; } else A.clip = 1; }
      else { A.x = x0 + S.w * 0.3; A.z = zf + 0.5; A.y = DECK; A.h = FACE; A.clip = 3; }
      if (sp < 0.55) { B.x = tx + 0.2; B.z = tz + 0.6; B.h = 2.4 + Math.PI; B.clip = 0; }
      else sawyer();
    } else if (st === 1 || st === 2 || st === 4) {
      // A: on the deck, then up the ladder and on the top plate hammering against the sky
      if (st === 4) { A.x = S.x - SW / 2 + 0.2; A.z = zf - 0.35; A.y = S.h + pl + 0.2; A.h = 0.3; A.clip = sp > 0.6 && sp < 0.78 ? 4 : 0; }
      else if (st === 1 && sp < 0.3) { A.x = x0 + S.w * 0.55; A.z = zf + 0.5; A.y = DECK; A.h = FACE; }
      else if (st === 1 && sp < 0.4) { const k = (sp - 0.3) / 0.1; A.x = lx; A.z = lz - 0.3 - k * 0.9; A.y = DECK + k * (S.h + pl - DECK); A.h = Math.PI; A.clip = 1; }
      else { A.x = x0 + S.w * 0.42; A.z = zf - 1.1; A.y = S.h + pl + (st === 2 ? 0.2 : 0); A.h = FACE; }
      // B at the sawhorse
      sawyer();
      if (st === 4) { B.x = S.x + 0.3; B.z = zf + 1.9; B.h = Math.PI; B.clip = sp < 0.6 ? 2 : 0; }
      if (st !== 4) carrier();
      else { C.x = S.x - 1.6; C.z = zf + 2.8; C.h = Math.PI * 0.95; C.clip = sp > 0.75 ? 4 : 0; }
    }
    if (st === 0) carrier();
    function carrier() {
      bonkCd -= dt;
      const u = cyc(7), ya = [LUM[0] + 1.0, LUM[1] - 0.3], tb2 = [SAW[0] - 1.25, SAW[1] - 0.1];
      const f = u < 0.45 ? u / 0.45 : u < 0.55 ? 1 : 1 - (u - 0.55) / 0.45;
      C.x = ya[0] + (tb2[0] - ya[0]) * smooth01(f); C.z = ya[1] + (tb2[1] - ya[1]) * smooth01(f);
      C.h = Math.atan2(tb2[0] - ya[0], tb2[1] - ya[1]) + (u > 0.5 ? Math.PI : 0);
      carry = u < 0.5; C.clip = carry ? 2 : 1;
      if (u > 0.43 && u < 0.5) C.h += Math.sin((u - 0.43) / 0.07 * Math.PI) * 1.4;
      if (u > 0.46 && bonk <= 0 && bonkCd <= 0) { bonk = 2.6; bonkCd = 4 + rnd() * 3; }
    }
    if (st === 3) {
      A.x = S.x - S.w / 2 + 0.4; A.z = zb + 0.6; A.y = S.h + pl + 0.2; A.h = Math.PI; A.clip = 2;
      B.x = S.x + S.w / 2 - 0.4; B.z = zb + 0.6; B.y = S.h + pl + 0.2; B.h = Math.PI; B.clip = 2;
      // C reads the plan right where the front will land, and dives clear at the last second
      const dive = smooth01((sp - 0.7) / 0.12);
      C.x = S.x + 0.3 + dive * (S.w / 2 + 1.0); C.z = zf + 1.6 + dive * 0.8; C.h = Math.PI * 0.9 + dive * 1.2; C.clip = sp > 0.7 && sp < 0.85 ? 1 : 0;
      if (sp > 0.84) { C.clip = 5; if (!dove) { dove = true; bonk = 2.4; } }
    }
    if (st < 4) { M.hide = false; M.x = x1 - 0.1; M.z = zf + 2.6; M.y = 0; M.h = FACE + 0.25; M.clip = 2; M.sp = 1; }
    if (st === 4 && sp > 0.8) { M.hide = false; const u = smooth01((sp - 0.8) / 0.12); M.x = S.x; M.z = zf + 0.4 + u * 2.0; M.h = 0; M.y = 0.3 * (1 - u); M.clip = u < 1 ? 1 : 4; M.sp = 4; }
    // bonked brother sits seeing stars (B normally; C after the near-flattening)
    const victim = st === 3 ? C : B;
    if (bonk > 0) { bonk -= dt; if (st !== 3) { victim.clip = 5; victim.y = 0; if (victim.saw) { victim.saw = false; victim.y = 0; victim.z = SAW[1] + 0.75; victim.x = SAW[0] - 0.5; victim.h = -0.3; } } }
    stars.visible = bonk > 0;
    if (bonk > 0) {
      const hy = victim.y + headY(CREW_SCALE, CREW_K, 0.9, 1.22) + 0.25;
      for (let i = 0; i < 5; i++) { const a = time * 4 + i * 1.2566; stars.setMatrixAt(i, _m.compose(_p.set(victim.x + Math.cos(a) * 0.45, hy + Math.sin(a * 2) * 0.05, victim.z + Math.sin(a) * 0.45), _q.setFromEuler(_e.set(0, a, 0)), _s.setScalar(0.22))); }
      stars.setMatrixAt(5, _m.makeScale(0, 0, 0));
      stars.instanceMatrix.needsUpdate = true;
    }
    // the foreman's plan, held open in front of his chest
    if (!M.hide && st < 4) { const ch = Math.cos(M.h), sh = Math.sin(M.h); placeRaw(PLAN, M.x + sh * 0.5 * M.k, M.y + 0.98 * M.k, M.z + ch * 0.5 * M.k, 0.78, 0.56, 0.02, -0.5, M.h, 0); }
    else timbers.setMatrixAt(PLAN, _m.makeScale(0, 0, 0));
    // B's saw rides the plank on the sawhorse: stroking while he works, left lying there when he is bonked
    { const k = B.saw ? Math.sin(time * 7.5) * 0.17 : 0.1, sx = SAW[0] + 0.1, sz = SAW[1] - 0.02 + k;
      placeRaw(SAWB, sx, 0.97, sz, 0.03, 0.2, 0.62, B.saw ? 0.12 : 0, 0, B.saw ? 0 : Math.PI / 2);
      placeRaw(SAWB + 1, sx, B.saw ? 1.0 : 0.9, sz - (B.saw ? 0.36 : 0), 0.09, 0.17, 0.16); }
    // carried plank
    if (carry && st !== 4) {
      const ch = Math.cos(C.h), sh = Math.sin(C.h);
      placeRaw(CARRY, C.x + (sh * 0.12 + ch * 0.2) * C.k, C.y + 0.66 * C.k, C.z + (ch * 0.12 - sh * 0.2) * C.k, 2.6, 0.18, 0.36, 0, C.h + Math.PI / 2 + 0.15, 0.06);
    } else timbers.setMatrixAt(CARRY, _m.makeScale(0, 0, 0));
    pose(time, [A, B, C, M]);
  }

  function bustleTick(dt, time) {
    bustle -= dt;
    root.visible = true;
    for (const o of root.children) o.visible = o === hammers || o === dust || o === stars;
    scaff.visible = bustle > 0;
    const [A, B, C, M] = ag;
    A.x = E.x - E.w / 2 - 0.4; A.z = E.z + 1.4; A.y = 0; A.h = Math.PI * 0.8; A.clip = 3; A.sp = 5;
    B.x = E.x + 0.2; B.z = E.z + 0.3; B.y = E.h / 3 - 0.12; B.h = 0; B.clip = 3; B.sp = 5;
    C.x = E.x + E.w / 2 + 0.4; C.z = E.z + 1.3; C.y = 0; C.h = -Math.PI * 0.8; C.clip = (time % 1.6) < 0.8 ? 3 : 2; C.sp = 5;
    M.hide = true;
    for (const a of [A, B, C]) { a.hide = false; a.tilt = null; }
    if (rnd() < dt * 6) burst(E.x + (rnd() - 0.5) * E.w, rnd() * E.h * 0.6, E.z + 1, 1, 0.3);
    dust.step(dt);
    pose(time, ag);
    if (bustle <= 0) {
      for (const o of root.children) o.visible = true;
      root.visible = false; scaff.visible = false; crew.mesh.visible = false;
      return false;
    }
    return true;
  }

  function pose(time, list) {
    for (const a of list) {
      if (a.hide) { crew.hide(a.i); if (a.i < 3) hammers.setMatrixAt(a.i, _m.makeScale(0, 0, 0)); continue; }
      crew.set(a.i, a.x, a.y + 0.02, a.z, a.h, a.clip, a.ph, a.sp);
      if (a.i < 3) {
        if (a.clip === 3 && !a.saw) {
          handAt(a, time, hand);
          _e.set(hand[3], a.h, 0, 'YXZ');
          hammers.setMatrixAt(a.i, _m.compose(_p.set(hand[0], hand[1], hand[2]), _q.setFromEuler(_e), _s.setScalar(1.3)));
        } else hammers.setMatrixAt(a.i, _m.makeScale(0, 0, 0));
      }
    }
    hammers.instanceMatrix.needsUpdate = true;
  }
  void tilt; void wheel;
  return api;
}

function cartAndMule(b, x, z) {
  b.slab('plank', x, 0.62, z, 2.2, 0.14, 1.2, { round: 0.04 });
  for (const k of [-1, 1]) b.slab('plank2', x, 0.72, z + k * 0.56, 2.2, 0.36, 0.08, { round: 0.03, taper: 0 });
  for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) b.slab(tone(COLORS.raw, 0.94 + ((r + i) % 3) * 0.05), x - 0.2, 0.76 + r * 0.15, z - 0.42 + i * 0.28, 2.8, 0.14, 0.24, { round: 0.03, taper: 0 });
  for (const k of [-1, 1]) wheel(b, x - 0.3, 0.55, z + k * 0.72, 0.52, { ry: Math.PI / 2 });
  for (const k of [-1, 1]) b.slab('raw2', x + 1.75, 0.6, z + k * 0.38, 1.4, 0.07, 0.07, { round: 0.02, rz: 0.12 });
  // the mule: chunky body, long ears and a tail that sway, a judgemental face
  const mx = x + 2.55, mule = '#8a6a55', dark = '#5e4536';
  b.ball(mule, mx, 0.95, z, 0.55, { sx: 1.45, sy: 0.85, sz: 0.85, detail: 1, smooth: true, aoBase: 0.4 });
  for (const [dx, dz] of [[-0.45, -0.25], [-0.45, 0.25], [0.45, -0.25], [0.45, 0.25]]) b.cyl(mule, mx + dx, 0, z + dz, 0.09, 0.85, 0, { sides: 6, taper: 0.85 });
  for (const [dx, dz] of [[-0.45, -0.25], [-0.45, 0.25], [0.45, -0.25], [0.45, 0.25]]) b.cyl(dark, mx + dx, 0, z + dz, 0.1, 0.12, 0, { sides: 6, taper: 1 });
  b.slab(mule, mx + 0.75, 1.0, z, 0.35, 0.55, 0.32, { round: 0.12, rz: -0.6 });
  b.ball(mule, mx + 1.05, 1.42, z, 0.3, { sx: 1.3, sy: 0.85, sz: 0.8, detail: 1, smooth: true, rz: -0.3, aoBase: 1 });
  b.ball('#d8c3a8', mx + 1.38, 1.3, z, 0.18, { sx: 0.9, sy: 0.8, sz: 1.05, detail: 1, smooth: true, aoBase: 1 });
  for (const k of [-1, 1]) b.cone(mule, mx + 0.95, 1.6, z + k * 0.13, 0.08, 0.6, 0, { sides: 5, curve: 0.8, rz: 0.25, rx: k * 0.35, sway: 0.03 });
  for (const k of [-1, 1]) b.ball('#241a2c', mx + 1.2, 1.5, z + k * 0.17, 0.045, { detail: 0, aoBase: 1 });
  b.cyl(dark, mx - 0.78, 0.6, z, 0.04, 0.55, 0, { sides: 4, taper: 0.6, rz: -0.35, sway: 0.06 });
  b.ball(dark, mx - 0.92, 0.55, z, 0.08, { sy: 1.5, detail: 0, sway: 0.08 });
  b.slab(dark, mx + 0.6, 1.2, z, 0.5, 0.4, 0.05, { round: 0.02, rz: -0.6 });
  b.contact(mx, z, 1.8, 0.8);
  b.contact(x, z, 2.4, 1.5);
}

// Wraps P.done: runs the construction kit first, keeps the lot hidden while the Mulligans build on it, adds a 'site' tap
// target (hurry) only while building, and exposes anchors. spec.acquired = true keeps the lot (Pomfrey's version of the
// building) on screen through an acquisition cutscene.
// R5 (critic r4 fix 6, refs/a_clay_build.jpg): a low, wide camera (height hk × D) with a shallow pitch so the horizon sits
// about a third down the card, the site centred and filling its width, yard and crew spread across the lower half. D is
// capped so the camera stays in the street, in front of Pomfrey's side (SOUTH_Z ≈ 13 plot-local).
export const BC = { dx: -0.2, dz: 1.6, yaw: 14, pitch: 8, k: 1.2, pad: 3.0, min: 9.2, max: 10.8, hk: 0.34, fov: 46 };
export function buildCam(S) {
  const R = Math.PI / 180, a = BC.yaw * R, p = BC.pitch * R, D = Math.min(BC.max, Math.max(BC.min, (S.w + BC.pad) * BC.k)), h = D * BC.hk;
  const lx = S.x + BC.dx, lz = S.fz + BC.dz;
  const pos = [lx - Math.sin(a) * D, h, lz + Math.cos(a) * D];
  const at = [pos[0] + Math.sin(a) * Math.cos(p) * D, h - Math.sin(p) * D, pos[2] - Math.cos(a) * Math.cos(p) * D];
  // the card rig stands the camera 1.15 × this distance from `look` (see cardCam)
  return { pos: pos.map((v, i) => at[i] + (v - at[i]) / 1.15), look: at, fov: BC.fov, facade: true };
}
export function finishPlot(P, C, spec) {
  const before = new Set(P.group.children);
  const user = spec.update;
  const tapSite = { id: 'site', pos: C.anchors.site, r: Math.max(C.site.w, C.site.fh) * 0.55 };
  let out = null, lotMeshes = [], folkMeshes = [], cleared = false;
  // R4: one build framing for every buildable plot, authored from the site: the braced frame fills the upper middle,
  // the yard (lumber left, sawhorse + foreman right, mule cart behind right) and the spaced crew sit under it.
  if (spec.camera?.build) {
    const cam = spec.camera, open = cam.fov;
    cam.build = buildCam(C.site);
    // the card rig reads the lens from plot.camera.fov even when it frames camera.build, so hand it the build lens while building
    Object.defineProperty(cam, 'fov', { get: () => (C.root.visible ? cam.build.fov : open), configurable: true, enumerable: true });
  }
  out = P.done({
    ...spec,
    cardW: spec.camera?.facade ? 0.5 : spec.cardW,
    update(dt, stats, time, tier, ctx) {
      C.update(dt, stats, ctx);
      const building = !!stats?.building;
      ctx.building = building;
      if (!ctx.owned) for (const m of lotMeshes) m.visible = !building || !!spec.acquired;
      // passers-by and plot regulars stay off the building site so the crew reads (R4: "a huddle of identical characters")
      const clear = building && !ctx.owned;
      if (clear || cleared) { cleared = clear; for (const m of folkMeshes) m.visible = !clear; }
      const tt = out.tapTargets, has = tt.includes(tapSite);
      if (building && !has) tt.push(tapSite); else if (!building && has) tt.splice(tt.indexOf(tapSite), 1);
      user?.(dt, stats, time, tier, ctx);
    },
  });
  // the unowned lot = its static mesh (first unnamed new mesh) + its painted sign text ('signs:<id>:lot')
  const fresh = P.group.children.filter((o) => !before.has(o) && o.isMesh);
  lotMeshes = [fresh.find((o) => !o.name), ...fresh.filter((o) => o.name.endsWith(':lot'))].filter(Boolean);
  folkMeshes = P.group.children.filter((o) => o.isInstancedMesh && o !== C.crew.mesh && o.material === C.crew.mesh.material);
  out.anchors = { ...C.anchors, ...(spec.anchors || {}) };
  out.construction = C;
  throttle(out, P);
  framers(P, C, spec);
  return out;
}

// R4: card-only foreground framing props (spec.fg for the open framing, a default saguaro + pole pair for the build
// framing). Each is one mesh drawn only by this plot's own card camera in its own state: onBeforeRender runs before
// three builds the model-view matrix, so other cameras (hero, neighbours' cards) get a zero-scale matrix. +1 draw, card only.
const _z = new THREE.Matrix4().makeScale(0, 0, 0);
const FG_BUILD = [{ kind: 'saguaro', sx: -1.1, dist: 5.2, up: 0.75, s: 0.7 }, { kind: 'post', sx: 1.04, dist: 4.6, up: 0.7 }];

// The build card's background (ref: a water tower and a shed on the far side of the lot), drawn in the card-only fg mesh.
function backdrop(b, S) {
  const zb = S.fz - S.d, tx = S.x - S.w * 0.3 - 1.6, tz = zb - 9;
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.cyl('raw2', tx + dx * 1.05, 0, tz + dz * 1.05, 0.13, 5.4, 0, { sides: 6, taper: 0.85 });
  for (const y of [1.6, 3.4]) for (const k of [-1, 1]) { b.slab('raw', tx, y, tz + k * 1.0, 2.2, 0.1, 0.1, { round: 0.02, taper: 0, rz: k * 0.65 }); b.slab('raw', tx + k * 1.0, y, tz, 0.1, 0.1, 2.2, { round: 0.02, taper: 0, rx: k * 0.65 }); }
  b.slab('plank3', tx, 5.3, tz, 3.0, 0.16, 3.0, { round: 0.03, taper: 0 });
  b.cyl('plank', tx, 5.4, tz, 1.45, 2.2, 0, { sides: 14, taper: 0.97 });
  for (const h of [0.35, 1.1, 1.85]) b.cyl('iron', tx, 5.4 + h, tz, 1.47, 0.09, 0, { sides: 14, taper: 1, noAo: true });
  b.cone('plank2', tx, 7.55, tz, 1.65, 0.95, 0, { sides: 14, curve: 1 });
  b.cyl('raw2', tx + 0.9, 3.5, tz + 0.9, 0.08, 1.9, 0, { sides: 5, taper: 1, rz: 0.15 });
  // a tin-roofed shed and a windmill-less pump beside it
  const hx = S.x + S.w / 2 + 1.2, hz = zb - 7.5;
  b.slab('raw', hx, 0, hz, 3.4, 2.4, 2.6, { round: 0.05 });
  b.roof('tin', hx, 2.4, hz, 3.8, 1.0, 3.0, 0, { over: 0.2 });
  b.slab('plank3', hx - 0.4, 0, hz + 1.31, 0.9, 1.8, 0.05, { round: 0.02, taper: 0 });
  b.contact(hx, hz, 3.8, 3.0);
  b.contact(tx, tz, 3.0, 3.0);
  for (let i = 0; i < 5; i++) b.cone(i % 2 ? 'hay2' : 'hay', tx + 2 + i * 0.7, 0, tz + 1.5 + (i % 2), 0.2, 0.6, 0, { sides: 4 });
}
function framers(P, C, spec) {
  const cam = spec.camera;
  if (!cam?.facade) return;
  const mk = (c, list, build) => {
    if (!c || !list?.length) return;
    const b = C.kit.builder(P.pal, { seed: 77 });
    for (const f of list) fgProp(b, c, f);
    if (build) backdrop(b, C.site);
    const m = b.finish({ cast: false });
    m.name = 'fg';
    m.frustumCulled = false;
    P.group.add(m);
    m.updateMatrixWorld(true);
    m.onBeforeRender = (r, s, camera) => {
      if (camera.userData?.iw2Line === P.id && C.root.visible === build) m.matrixWorld.multiplyMatrices(P.group.matrixWorld, m.matrix);
      else m.matrixWorld.copy(_z);
    };
  };
  const flip = [...P.id].reduce((h, c) => h + c.charCodeAt(0), 0) % 2 ? 1 : -1;
  mk(cam, spec.fg ?? [{ kind: 'saguaro', sx: -1.08 * flip, dist: 9, up: 1.3 }, { kind: 'post', sx: 1.04 * flip, dist: 8, up: 1.4 }], false);
  mk(cam.build, spec.fgBuild ?? FG_BUILD, true);
}

// PERF P#6: a plot runs every frame only while it is in focus: drawn by its own card camera, or drawn by a camera whose
// look point (ground hit) lies on or near this lot (the hero framed on it). Otherwise its animation ticks at OFF_HZ with
// the accumulated dt. Focus is sniffed with onBeforeRender on the plot's persistent meshes, so world.update needs no
// hook. ?plotHz=60 disables it.
const OFF_HZ = 16;
const OFF_ON = typeof location === 'undefined' || !/[?&]plotHz=60\b/.test(location.search);
const _wp = new THREE.Vector3(), _dir = new THREE.Vector3(), look = { cam: null, f: -1, x: 0, z: 0 };
function throttle(out, P) {
  // out.inCard(): this plot's own card camera drew it within the last ~0.7 s (card-only gags, e.g. the saloon ejection).
  let cardAt = -1e9;
  out.inCard = () => !OFF_ON || performance.now() - cardAt < 700;
  if (!OFF_ON) return;
  const update = out.update, halfW = out.bounds.heroW / 2 + 8;
  let frame = 0, seen = -99, acc = 0;
  const spy = (r, s, cam) => {
    if (cam.userData?.iw2Line === P.id) cardAt = performance.now();
    if (seen === frame) return;
    if (cam.userData?.iw2Line === P.id) { seen = frame; return; }
    const f = r.info.render.frame;
    if (look.cam !== cam || look.f !== f) {
      look.cam = cam; look.f = f;
      cam.getWorldDirection(_dir);
      const t = _dir.y < -0.05 ? Math.min(400, -cam.position.y / _dir.y) : 40;
      look.x = cam.position.x + _dir.x * t; look.z = cam.position.z + _dir.z * t;
    }
    P.group.getWorldPosition(_wp);
    if (Math.abs(_wp.x - look.x) < halfW && Math.abs(_wp.z - look.z) < 24) seen = frame;
  };
  P.group.traverse((o) => { if (o.isMesh) o.onBeforeRender = spy; });
  out.update = (dt, stats, time, tier) => {
    frame++;
    acc += dt;
    if (frame - seen > 3 && acc < 1 / OFF_HZ && dt > 0) return;
    const d = acc;
    acc = 0;
    update(d, stats, time, tier);
  };
}
