import * as THREE from 'three';
import { box, cyl, lathe, arcWall, arcTube } from './geo.js';
import { addTree } from './foliage.js';
import { HOLO_ART, createHoloMaterial, registerBillboard } from './holo.js';
import { railing } from './plaza.js';
import { addTowerField, archetypes } from './skyline.js';
import { addFlyingCars, addMonorail } from './traffic.js';
import { rng } from './textures.js';
import { REFLECT_LAYER } from '../fx/reflection.js';

// Brightline's canyon: the west street wall (shop arcade under a canopy, glass podium, megatowers), the east drop
// (glass rail, retaining wall, a lower avenue and towers rising from it), billboards, a monorail and car lanes.
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const NEAR = 130;                                  // |z| beyond this: coarse far cells, no shadows
const cellOf = (x, z) => (Math.abs(z) > NEAR ? `far${x < 0 ? 'W' : 'E'}${Math.sign(z)}${Math.floor(Math.abs(z) / 150)}` : null);

// Brightline's stone is a cool pale grey, not Aurum's cream: tinted through the batch's vertex colour
export const COOL = new THREE.Color(0.62, 0.68, 0.78), COOL_DARK = new THREE.Color(0.4, 0.45, 0.54);
const tintOf = (ctx, mat) => (mat === ctx.M.stoneUpper ? COOL : mat === ctx.M.stone ? COOL_DARK : null);
// put() with far-cell merging and no shadow casting out there
export function P(ctx, geom, mat, pos, rot = 0, opts = {}) {
  const ck = cellOf(pos.x, pos.z);
  const color = opts.color || tintOf(ctx, mat);
  if (color) opts = { ...opts, color };
  return ctx.batch.put(geom, mat, pos, rot, null, ck ? { ...opts, cellKey: ck, cast: false, reflect: false } : opts);
}

// Glass tower on a footprint, with corner fins, ledge rings every ~34 m and a stepped crown.
function glassTower(ctx, x0, x1, z0, z1, y0, h, { warm = false, seed = 1 } = {}) {
  const { M } = ctx;
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const R = rng(seed);
  const body = h * 0.82;
  P(ctx, box(w, body, d), warm ? M.facadeWarm : M.facade, V(cx, y0 + body / 2, cz), 0, { cast: false });
  for (const [fx, fz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) P(ctx, box(1.6, body + 2, 1.6), M.stoneUpper, V(fx, y0 + body / 2 + 1, fz), 0, { cast: false });
  for (let y = y0 + 30 + R() * 8; y < y0 + body - 10; y += 30 + R() * 12) {
    P(ctx, box(w + 1.2, 1.1, d + 1.2), M.stoneUpper, V(cx, y, cz), 0, { cast: false });
    P(ctx, box(w + 1.3, 0.12, d + 1.3), R() < 0.5 ? M.blueGlow : M.gold, V(cx, y - 0.62, cz), 0, { cast: false });
  }
  const t1 = h * 0.12, i1 = Math.min(w, d) * 0.16;
  P(ctx, box(w - i1 * 2, t1, d - i1 * 2), M.facade, V(cx, y0 + body + t1 / 2, cz), 0, { cast: false });
  P(ctx, box(w - i1 * 2 + 0.8, 0.8, d - i1 * 2 + 0.8), M.stoneUpper, V(cx, y0 + body + t1, cz), 0, { cast: false });
  const t2 = h - body - t1;
  P(ctx, box(w * 0.4, t2, d * 0.4), M.stoneUpper, V(cx, y0 + body + t1 + t2 / 2, cz), 0, { cast: false });
  P(ctx, cyl(0.2, 0.8, h * 0.18, 0, 0, 0, 6), M.gold, V(cx, y0 + h, cz), 0, { cast: false });
}

// Round tower with stacked drums and saucer rings (the ref's middle-distance towers).
function roundTower(ctx, cx, cz, r, y0, h, { seed = 1, rings = 2 } = {}) {
  const { M } = ctx;
  const R = rng(seed);
  let y = y0, rr = r;
  const drums = 3;
  for (let i = 0; i < drums; i++) {
    const dh = h * (i === 0 ? 0.5 : i === 1 ? 0.3 : 0.2);
    P(ctx, new THREE.CylinderGeometry(rr * 0.94, rr, dh, 28, 1), M.facade, V(cx, y + dh / 2, cz), 0, { cast: false });
    P(ctx, new THREE.CylinderGeometry(rr + 0.6, rr + 0.6, 1.0, 28, 1), M.stoneUpper, V(cx, y + dh, cz), 0, { cast: false });
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + i; P(ctx, box(1.0, dh, 1.0), M.stoneUpper, V(cx + Math.sin(a) * rr, y + dh / 2, cz + Math.cos(a) * rr), a, { cast: false }); }
    y += dh; rr *= 0.72;
  }
  for (let k = 0; k < rings; k++) {
    const ry = y0 + h * (0.35 + 0.28 * k + R() * 0.05), rR = r * (1.9 - k * 0.35);
    P(ctx, lathe([[0, 0], [rR, 0.6], [rR + 0.6, 1.2], [rR, 1.8], [0, 2.2]], 32), M.stoneUpper, V(cx, ry, cz), 0, { cast: false });
    P(ctx, new THREE.TorusGeometry(rR + 0.3, 0.12, 4, 40).rotateX(Math.PI / 2), M.blueGlow, V(cx, ry + 1.2, cz), 0, { cast: false });
  }
  P(ctx, cyl(0.15, 1.0, h * 0.25, 0, 0, 0, 6), M.gold, V(cx, y, cz), 0, { cast: false });
}

// West street wall for z in [za, zb]: shops + piers at ground level, a deep canopy on columns, glass podium above.
function westWall(ctx, za, zb, L, { columns = true } = {}) {
  const { M, col } = ctx;
  const X = L.shopX, E = -L.arcadeEdge, len = zb - za, zc = (za + zb) / 2;
  P(ctx, box(20, 6.2, len), M.stone, V(X - 10.4, 3.1, zc));
  // lit shop interiors between stone piers
  for (let z = za; z < zb - 0.5; z += 12) {
    const z1 = Math.min(zb, z + 12), mz = (z + z1) / 2, bw = z1 - z;
    P(ctx, box(0.12, 5.3, bw - 1.4), M.shopGlow, V(X - 0.34, 2.9, mz), 0, { cast: false });
    P(ctx, box(0.16, 0.08, bw - 1.4), M.gold, V(X - 0.24, 5.58, mz), 0, { cast: false });
    for (let k = 1; k < 3; k++) P(ctx, box(0.1, 5.3, 0.08), M.chrome, V(X - 0.22, 2.9, z + 0.7 + (bw - 1.4) * k / 3), 0, { cast: false });
    P(ctx, box(0.9, 6.2, 1.3), M.stoneUpper, V(X + 0.05, 3.1, z1 - 0.1));
  }
  // canopy
  const cw = E - X;
  P(ctx, box(cw + 0.4, 0.5, len), M.stoneUpper, V((X + E) / 2, 6.45, zc));
  P(ctx, box(0.35, 0.95, len), M.darkMetal, V(E, 6.3, zc));
  P(ctx, box(0.4, 0.07, len), M.gold, V(E, 6.8, zc), 0, { cast: false });
  P(ctx, box(0.08, 0.07, len), M.blueGlow, V(E + 0.19, 5.86, zc), 0, { cast: false });
  P(ctx, box(0.5, 0.05, len), M.warmGlow, V(X + 3.2, 6.18, zc), 0, { cast: false });
  P(ctx, box(0.5, 0.05, len), M.warmGlow, V(E - 2.2, 6.18, zc), 0, { cast: false });
  if (columns) for (let z = za + 4; z < zb - 1; z += 8) {
    P(ctx, cyl(0.2, 0.2, 5.6, 0, 0, 0, 12), M.chrome, V(E - 0.6, 0.25, z));
    P(ctx, cyl(0.34, 0.38, 0.28, 0, 0, 0, 12), M.stoneUpper, V(E - 0.6, 0, z));
    P(ctx, cyl(0.3, 0.22, 0.4, 0, 0, 0, 12), M.gold, V(E - 0.6, 5.8, z), 0, { cast: false });
    if (Math.abs(z) < 110) col.circle(E - 0.6, z, 0.3, 'column');
  }
  // glass podium storeys + parapet + roof garden edge
  P(ctx, box(20, 7.4, len), M.facade, V(X - 10.3, 10.4, zc), 0, { cast: Math.abs(zc) < NEAR });
  P(ctx, box(20.6, 0.6, len), M.stoneUpper, V(X - 10.2, 14.3, zc));
  P(ctx, box(0.1, 0.1, len), M.gold, V(X + 0.14, 14.62, zc), 0, { cast: false });
  if (Math.abs(zc) < 110) {
    col.box(X - 10, zc, 10, len / 2, 0, 'podium');
    for (let z = za + 6; z < zb - 4; z += 11) addTree(ctx.batch, M, X - 2.4, 14.6, z, (z * 13) | 0, 1.25);
  }
}

// alley cut into the west wall: side returns, a back wall with a service door, dumpster and pipes
function alley(ctx, za, zb, L) {
  const { M, col } = ctx;
  const X = L.shopX, back = L.bounds.x0 + 2, zc = (za + zb) / 2;
  P(ctx, box(1.0, 14.6, zb - za), M.stone, V(back - 0.5, 7.3, zc));
  P(ctx, box(0.1, 3.0, 1.8), M.shopGlow, V(back + 0.02, 1.6, zc), 0, { cast: false });
  P(ctx, box(0.2, 0.12, 2.2), M.warmGlow, V(back + 0.12, 3.3, zc), 0, { cast: false });
  for (const z of [za + 0.3, zb - 0.3]) {
    P(ctx, box(Math.abs(back - X), 14.6, 0.6), M.stone, V((X + back) / 2, 7.3, z));
    for (let y = 4; y < 13; y += 3.2) P(ctx, box(Math.abs(back - X), 0.18, 0.18), M.darkMetal, V((X + back) / 2, y, z + (z < zc ? 0.4 : -0.4)), 0, { cast: false });
  }
  P(ctx, cyl(0.16, 0.16, 12, 0, 0, 0, 8), M.darkMetal, V(back + 0.5, 0, za + 1.2));
  col.box(back - 0.5, zc, 0.5, (zb - za) / 2, 0, 'alley');
  // a tiny sign across the top of the alley
  P(ctx, box(0.2, 0.9, zb - za - 1.2), M.darkMetal, V(X - 0.6, 5.2, zc), 0, { cast: false });
  P(ctx, box(0.06, 0.1, zb - za - 1.6), M.blueGlow, V(X - 0.48, 5.4, zc), 0, { cast: false });
}

export function buildCanyon(ctx, L) {
  const { M, scene, col, time } = ctx;
  const R = rng(404);
  // ---- west street wall, alleys and towers ----
  const segs = [];
  let z = -420;
  for (const [a, b] of L.alleys) { segs.push([z, a]); alley(ctx, a, b, L); z = b; }
  segs.push([z, 420]);
  for (const [a, b] of segs) {
    // split long runs so batch cells and frustum culling stay useful
    for (let s = a; s < b - 0.01; s = Math.min(b, s + 48)) westWall(ctx, s, Math.min(b, s + 48), L);
  }
  // lobby portal of Lumen Tower (lobby site)
  const lz = L.lobby.z;
  P(ctx, box(0.5, 7.2, 9.2), M.gold, V(L.shopX + 0.3, 3.6, lz));
  P(ctx, box(0.14, 6.6, 8.0), M.shopGlow, V(L.shopX + 0.62, 3.3, lz), 0, { cast: false });
  P(ctx, box(0.2, 0.2, 9.4), M.warmGlow, V(L.shopX + 0.6, 7.25, lz), 0, { cast: false });

  const W = [[-104, -62, 170, 'g'], [-38, 0, 135, 'r'], [8, 36, 215, 'g'], [52, 94, 150, 'g']];
  for (const [a, b, h, t] of W) {
    if (t === 'g') glassTower(ctx, -62, -31, a, b, 14.6, h, { seed: a + 500, warm: h < 160 });
    else roundTower(ctx, -46, (a + b) / 2, 14, 14.6, h, { seed: 7 });
  }
  // east towers rise from the lower avenue
  const Y0 = L.lowY;
  glassTower(ctx, 40, 72, -114, -72, Y0, 250, { seed: 91 });
  roundTower(ctx, 60, -28, 17, Y0, 190, { seed: 3, rings: 3 });
  glassTower(ctx, 44, 78, 8, 44, Y0, 275, { seed: 17 });
  glassTower(ctx, 42, 70, 64, 104, Y0, 160, { seed: 29, warm: true });
  // canyon continues both ways (coarse)
  for (const side of [-1, 1]) {
    for (let zz = side < 0 ? -140 : 128; Math.abs(zz) < 430; zz += side * (48 + R() * 14)) {
      const h = 110 + R() * 170, round = R() < 0.3;
      if (round) roundTower(ctx, -48, zz + side * 20, 13 + R() * 4, 14.6, h, { seed: zz, rings: 1 + (R() * 2 | 0) });
      else glassTower(ctx, -64, -31, Math.min(zz, zz + side * 40), Math.max(zz, zz + side * 40), 14.6, h, { seed: zz + 1, warm: R() < 0.25 });
      const h2 = 130 + R() * 180;
      if (R() < 0.35) roundTower(ctx, 62, zz + side * 24, 15 + R() * 5, Y0, h2, { seed: zz + 3, rings: 2 });
      else glassTower(ctx, 42 + R() * 6, 76, Math.min(zz, zz + side * 42), Math.max(zz, zz + side * 42), Y0, h2, { seed: zz + 5 });
    }
  }

  // ---- east edge: glass rail, retaining wall, lower avenue ----
  const E = L.edgeE + 0.4, m = L.market, t = L.terrace;
  railing(ctx, [[E, -150], [E, m.z0]]);
  railing(ctx, [[E, m.z0], [m.x1, m.z0], [m.x1, m.z1], [E, m.z1]]);
  railing(ctx, [[E, m.z1], [E, t.padZ0]]);
  railing(ctx, [[E, t.padZ0], [t.x1, t.padZ0], [t.x1, t.z0]]);
  railing(ctx, [[t.x1, t.z0], [t.x1, t.z1], [E, t.z1], [E, t.z0 + 0.6]], t.y);
  railing(ctx, [[E, t.z1], [E, 150]]);
  for (const [a, b] of [[-420, -150], [150, 420]]) P(ctx, box(0.12, 1.1, b - a), M.glassDark, V(E, 0.55, (a + b) / 2), 0, { cast: false });
  // retaining wall face + lit slots, following the edge
  const wall = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(x1 - x0, z1 - z0), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    P(ctx, box(1.2, -Y0 + 0.2, len), M.stone, V(mx, Y0 / 2 - 0.1, mz), ang, { cast: false });
    for (let y = -3; y > Y0 + 2; y -= 5.5) P(ctx, box(1.26, 0.18, len - 0.8), M.blueGlow, V(mx, y, mz), ang, { cast: false });
    P(ctx, box(1.3, 0.12, len), M.gold, V(mx, -0.35, mz), ang, { cast: false });
  };
  wall(E + 0.6, -420, E + 0.6, m.z0); wall(m.x1 + 0.6, m.z0, m.x1 + 0.6, m.z1);
  wall(E + 0.6, m.z0 - 0.6, m.x1 + 0.6, m.z0 - 0.6); wall(E + 0.6, m.z1 + 0.6, m.x1 + 0.6, m.z1 + 0.6);
  wall(E + 0.6, m.z1, E + 0.6, t.padZ0); wall(t.x1 + 0.6, t.padZ0, t.x1 + 0.6, t.z1);
  wall(E + 0.6, t.padZ0 - 0.6, t.x1 + 0.6, t.padZ0 - 0.6); wall(E + 0.6, t.z1 + 0.6, t.x1 + 0.6, t.z1 + 0.6);
  wall(E + 0.6, t.z1, E + 0.6, 420);
  // lower avenue: dark paving, tree rows, warm lamps
  const low = new THREE.Mesh(new THREE.PlaneGeometry(110, 840).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2c3440, roughness: 0.35, metalness: 0.1, envMapIntensity: 0.8 }));
  low.position.set(E + 55, Y0, 0); low.receiveShadow = true; scene.add(low);
  for (let zz = -120; zz < 120; zz += 20) {
    addTree(ctx.batch, M, 24, Y0, zz, zz | 0, 1.3);
    P(ctx, cyl(0.1, 0.12, 5, 0, 0, 0, 6), M.darkMetal, V(31, Y0, zz + 8), 0, { cast: false });
    P(ctx, new THREE.SphereGeometry(0.22, 8, 6), M.warmGlow, V(31, Y0 + 5.1, zz + 8), 0, { cast: false });
  }

  // ---- billboards ----
  // west: the huge curved "A BRIGHTER FUTURE TOGETHER" over the canopy (bulges into the street, faces north-east)
  const bb = L.billboard;
  const bbGeo = new THREE.CylinderGeometry(bb.r, bb.r, bb.h, 40, 1, true, bb.th0, bb.th1 - bb.th0);
  const bbMesh = new THREE.Mesh(bbGeo, createHoloMaterial(HOLO_ART.brighter(), { bright: 2.2, alpha: 0.96, time }));
  bbMesh.position.set(bb.cx, bb.y + bb.h / 2, bb.cz); bbMesh.layers.enable(REFLECT_LAYER); bbMesh.renderOrder = 2;
  scene.add(bbMesh); registerBillboard(ctx, bbMesh.material, 1024, 512);
  const fm = new THREE.Matrix4().makeTranslation(bb.cx, 0, bb.cz);
  ctx.batch.add(arcTube(bb.r + 0.1, bb.th0, bb.th1, bb.y + bb.h + 0.2, 0.25, 40), M.gold, { matrix: fm });
  ctx.batch.add(arcTube(bb.r + 0.1, bb.th0, bb.th1, bb.y - 0.2, 0.25, 40), M.gold, { matrix: fm });
  ctx.batch.add(arcTube(bb.r + 0.2, bb.th0, bb.th1, bb.y - 0.9, 0.1, 40), M.blueGlow, { matrix: fm, cast: false });
  ctx.batch.add(arcWall(bb.r - 0.8, bb.th0, bb.th1, bb.y - 0.6, bb.y + bb.h + 0.6, 40, false), M.darkMetal, { matrix: fm, cast: false });
  for (let k = 0; k <= 4; k++) {
    const a = bb.th0 + (bb.th1 - bb.th0) * k / 4;
    P(ctx, box(0.6, bb.y - 14.6 + 0.4, 0.6), M.darkMetal, V(bb.cx + Math.sin(a) * (bb.r - 1.2), 14.6 + (bb.y - 14.6) / 2, bb.cz + Math.cos(a) * (bb.r - 1.2)));
  }
  // east: HARMONY THROUGH UNITY, tall panel on the first east tower's street face
  const hp = new THREE.Mesh(new THREE.PlaneGeometry(22, 44), createHoloMaterial(HOLO_ART.harmony(), { bright: 2.0, alpha: 0.97, time }));
  hp.position.set(38.7, 22, -93); hp.rotation.y = -Math.PI / 2 + 0.05; hp.layers.enable(REFLECT_LAYER);
  scene.add(hp); registerBillboard(ctx, hp.material, 512, 1024);
  P(ctx, box(1.0, 46, 23.4), M.darkMetal, V(39.9, 22, -93), 0.05, { cast: false });
  P(ctx, box(1.2, 0.4, 23.8), M.gold, V(39.8, 45.2, -93), 0.05, { cast: false });
  P(ctx, box(1.2, 0.4, 23.8), M.gold, V(39.8, -1.2, -93), 0.05, { cast: false });
  // south-facing boards for the reverse view
  const wide = (art, x, y, zz, w, h, ry) => {
    const m2 = new THREE.Mesh(new THREE.PlaneGeometry(w, h), createHoloMaterial(art, { bright: 2.0, alpha: 0.96, time }));
    m2.position.set(x, y, zz); m2.rotation.y = ry; m2.layers.enable(REFLECT_LAYER); scene.add(m2);
    registerBillboard(ctx, m2.material, 1024, 512);
    P(ctx, box(w + 1, h + 1, 0.8), M.darkMetal, V(x - Math.sin(ry) * 0.5, y, zz - Math.cos(ry) * 0.5), ry, { cast: false });
    return m2;
  };
  wide(HOLO_ART.wide('HIREFRAME', 'RENT A BODY TODAY • FROM 4 ₵/HR', 5, '#3a2408'), -30.6, 30, 70, 32, 16, Math.PI / 2);
  wide(HOLO_ART.wide('NEXUS', 'ONE CITY • ONE MIND', 8, '#0b2a52'), 43.4, 38, 24, 30, 15, -Math.PI / 2);
  wide(HOLO_ART.wide('HARMONY', 'YOUR PLACE IS PREPARED', 12, '#0c3a70', true), -30.6, 40, -150, 34, 17, Math.PI / 2);

  // shop fascia names (one atlas, one mesh)
  const names = [['NEXUS', '#7fd4ff'], ['HIREFRAME', '#ffae40'], ['CAFÉ LUMEN', '#ffd27a'], ['CONCORD BANK', '#9fe4ff'], ['ORBITAL NOODLE', '#ff8fb0'],
    ['CHROME & CO', '#dfe8f0'], ['VAEL OPTICS', '#9fe4ff'], ['SKYLINE FLOWERS', '#9ff0b0']];
  const A = HOLO_ART.signAtlas(names);
  const pos = [], uv = [], idx = [];
  let n = 0;
  for (let zz = -100; zz < 100; zz += 12) {
    if (L.alleys.some(([a, b]) => zz + 6 > a - 1 && zz + 6 < b + 1) || Math.abs(zz + 6 - lz) < 5) continue;
    const row = n % names.length, v0 = 1 - (row + 1) / names.length, v1 = 1 - row / names.length;
    const k = pos.length / 3, x = -L.arcadeEdge + 0.2, zc = zz + 6;
    for (const [dz, y, u, v] of [[4.2, 5.9, 0, v0], [-4.2, 5.9, 1, v0], [-4.2, 6.75, 1, v1], [4.2, 6.75, 0, v1]]) { pos.push(x, y, zc + dz); uv.push(u, v); }
    idx.push(k, k + 1, k + 2, k, k + 2, k + 3); n++;
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); sg.setIndex(idx);
  sg.computeBoundingSphere();
  const signs = new THREE.Mesh(sg, createHoloMaterial(A.canvas, { bright: 2.6, alpha: 0.95, time, side: THREE.FrontSide }));
  signs.layers.enable(REFLECT_LAYER); scene.add(signs);

  // ---- sky: far towers, the Chorus Spire closing the north vista, monorail, car lanes ----
  const spots = [];
  const FR = rng(77);
  for (let i = 0; i < 90; i++) {
    const a = FR() * Math.PI * 2, d = 170 + FR() * 560;
    const x = Math.sin(a) * d, zz = Math.cos(a) * d;
    if (x > -90 && x < 110) continue;                                  // keep the canyon slot open
    if (spots.some(([sx, sz]) => Math.hypot(sx - x, sz - zz) < 55)) continue;
    spots.push([x, zz, (FR() * 4) | 0, 0.6 + FR() * 0.7, FR() * Math.PI, 0.85 + FR() * 0.5]);
  }
  for (const zz of [-560, -640, -720]) spots.push([-40 + FR() * 90, zz, (FR() * 4) | 0, 0.8 + FR() * 0.5, FR() * 3, 1 + FR() * 0.3]);
  for (const zz of [520, 620]) spots.push([-30 + FR() * 70, zz, (FR() * 4) | 0, 0.8 + FR() * 0.4, FR() * 3, 1]);
  const arch = archetypes();
  const { far } = addTowerField(ctx, spots, { arch, y: Y0 });
  ctx.farSky.push(...far);
  const spire = arch[3];
  for (const part of ['glass', 'stone', 'gold']) {
    const mm = new THREE.Mesh(spire[part], { glass: M.facadeSky, stone: M.skyStone, gold: M.goldSolid }[part]);
    mm.position.set(12, Y0, -470); mm.scale.set(2.2, 2.0, 2.2); mm.layers.enable(REFLECT_LAYER);
    scene.add(mm); ctx.farSky.push(mm);
  }

  const lanes = [];
  for (const [x, y, sp] of [[-4, 34, 26], [7, 42, -30], [-12, 58, 24], [12, 66, -28], [0, 92, 32], [22, 48, 22], [-20, 76, -26]]) {
    lanes.push(sp > 0 ? { type: 'line', x0: x, z0: 600, x1: x, z1: -900, y, sp } : { type: 'line', x0: x, z0: -900, x1: x, z1: 600, y, sp: -sp });
  }
  for (const [zz, y, sp] of [[-210, 70, 30], [-330, 52, 28], [200, 60, 26]]) lanes.push({ type: 'line', x0: -700, z0: zz, x1: 700, z1: zz + 20, y, sp });
  const cars = addFlyingCars(ctx, lanes, Math.round(ctx.tier.traffic * 0.8), rng(31), { spread: 5, scale: 1.3 });
  const mono = new THREE.CatmullRomCurve3([[34, 19, 520], [30, 19, 260], [27, 19, 90], [26, 20, -20], [22, 21, -85], [2, 22, -140], [-40, 24, -200], [-110, 26, -300], [-190, 28, -420]]
    .map((p) => new THREE.Vector3(...p)), false);
  addMonorail(ctx, mono, { paint: cars.paint, glow: cars.glow, pylons: 20, pylonY0: Y0, cars: 4, trains: 2, speed: 24, far: true, steps: 260 });
}
