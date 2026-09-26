import * as THREE from 'three';
import { box, cyl, lathe, roundedBar, arcWall, arcTube, D2R } from './geo.js';
import { addTree, addShrubs } from './foliage.js';
import { createWaterMaterial } from './water.js';
import { HOLO_ART, createHoloMaterial } from './holo.js';
import { REFLECT_LAYER } from '../fx/reflection.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Glass railing along a polyline of [x,z] points at height y.
export function railing(ctx, pts, y = 0, h = 1.1) {
  const { batch, M } = ctx;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(x1 - x0, z1 - z0);
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    batch.put(box(0.04, h, len), M.glassRail, V(mx, y + h / 2, mz), ang, null, { cast: false, reflect: false });
    batch.put(box(0.1, 0.06, len), M.gold, V(mx, y + h, mz), ang);
    batch.put(box(0.12, 0.08, len), M.darkMetal, V(mx, y + 0.04, mz), ang);
    const posts = Math.max(1, Math.round(len / 3));
    for (let k = 0; k <= posts; k++) {
      const t = k / posts;
      batch.put(box(0.07, h, 0.07), M.chrome, V(x0 + (x1 - x0) * t, y + h / 2, z0 + (z1 - z0) * t), ang);
    }
  }
}

export function arcRailing(ctx, cx, cz, r, th0, th1, y = 0, h = 1.1) {
  const { batch, M } = ctx;
  const segs = Math.max(8, Math.round(Math.abs(th1 - th0) * r / 2));
  batch.add(arcWall(r, th0, th1, y, y + h, segs), M.glassRail, { matrix: new THREE.Matrix4().makeTranslation(cx, 0, cz), cast: false, reflect: false });
  batch.add(arcTube(r, th0, th1, y + h, 0.05, segs), M.gold, { matrix: new THREE.Matrix4().makeTranslation(cx, 0, cz) });
  const posts = Math.round(Math.abs(th1 - th0) * r / 3);
  for (let k = 0; k <= posts; k++) {
    const t = th0 + (th1 - th0) * k / posts;
    batch.put(box(0.07, h, 0.07), M.chrome, V(cx + r * Math.sin(t), y + h / 2, cz + r * Math.cos(t)), t);
  }
}

function planter(ctx, x, z, len, wid, rot, seed, trees = 1, y = 0) {
  const { batch, M, col } = ctx;
  const h = 0.75;
  batch.put(roundedBar(len, wid, h, 0.2), y ? M.stoneUpper : M.stone, V(x, y, z), rot);
  batch.put(box(len + 0.04, 0.05, wid + 0.04), M.gold, V(x, y + h - 0.02, z), rot);
  batch.put(box(len - 0.3, 0.1, wid - 0.3), M.soil, V(x, y + h - 0.03, z), rot, null, { cast: false });
  addShrubs(batch, M, x, y + h, z, len, wid, rot, seed, Math.round(len * 1.6));
  const c = Math.cos(rot), s = Math.sin(rot);
  for (let i = 0; i < trees; i++) {
    const lx = trees === 1 ? 0 : (i / (trees - 1) - 0.5) * (len - 2.5);
    addTree(batch, M, x + lx * c, y + h, z - lx * s, seed * 10 + i, 1.0);
  }
  col.box(x, z, len / 2, wid / 2, rot, 'planter');
}

function lamp(ctx, x, z, y = 0) {
  const { batch, M, col } = ctx;
  batch.add(cyl(0.07, 0.1, 5.2, x, y, z, 10), M.chrome);
  batch.add(cyl(0.22, 0.26, 0.3, x, y, z, 12), M.darkMetal);
  batch.put(new THREE.TorusGeometry(0.45, 0.06, 8, 24).rotateX(Math.PI / 2), M.gold, V(x, y + 5.25, z));
  batch.put(new THREE.TorusGeometry(0.34, 0.03, 6, 24).rotateX(Math.PI / 2), M.blueGlow, V(x, y + 5.18, z), 0, null, { cast: false });
  batch.put(new THREE.CylinderGeometry(0.44, 0.44, 0.04, 24), M.darkMetal, V(x, y + 5.21, z), 0, null, { cast: false });
  batch.put(new THREE.SphereGeometry(0.1, 10, 6), M.warmGlow, V(x, y + 5.42, z), 0, null, { cast: false });
  col.circle(x, z, 0.25, 'lamp');
}

function bench(ctx, x, z, rot, y = 0) {
  const { batch, M, col } = ctx;
  batch.put(box(2.4, 0.12, 0.7), M.stoneUpper, V(x, y + 0.46, z), rot);
  batch.put(box(2.2, 0.06, 0.08), M.gold, V(x, y + 0.5, z), rot);
  const c = Math.cos(rot), s = Math.sin(rot);
  for (const k of [-0.9, 0.9]) batch.put(box(0.12, 0.42, 0.55), M.darkMetal, V(x + k * c, y + 0.21, z - k * s), rot);
  col.box(x, z, 1.2, 0.35, rot, 'bench');
}

function fountain(ctx) {
  const { batch, M, col, scene, updaters, layout } = ctx;
  const { x, z } = layout.fountain;
  const rim = lathe([[0, 0], [6.4, 0], [6.6, 0.1], [6.6, 0.55], [6.45, 0.65], [6.0, 0.65], [5.9, 0.4], [0, 0.4]], 64);
  batch.put(rim, M.stoneUpper, V(x, 0, z));
  batch.put(new THREE.TorusGeometry(6.52, 0.05, 6, 96).rotateX(Math.PI / 2), M.gold, V(x, 0.62, z));
  const water = new THREE.Mesh(new THREE.CircleGeometry(5.95, 64).rotateX(-Math.PI / 2), createWaterMaterial(ctx, { color: 0x1d4f60, reflect: true }));
  water.position.set(x, 0.5, z); water.receiveShadow = true; water.layers.enable(REFLECT_LAYER);
  scene.add(water);
  const ped = lathe([[0, 0], [1.6, 0], [1.4, 0.5], [0.7, 0.9], [0.55, 2.4], [0.9, 2.7], [0.9, 2.9], [0, 2.9]], 32);
  batch.put(ped, M.stoneUpper, V(x, 0.4, z));
  batch.put(new THREE.TorusGeometry(0.9, 0.06, 8, 32).rotateX(Math.PI / 2), M.gold, V(x, 3.3, z));
  // armillary: three gold rings slowly turning
  const arm = new THREE.Group();
  const ringGeo = new THREE.TorusGeometry(1.7, 0.07, 10, 64);
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(ringGeo, M.goldSolid);
    r.rotation.set(i * 1.05, i * 0.7, 0);
    r.castShadow = true; r.layers.enable(REFLECT_LAYER);
    arm.add(r);
  }
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 3), M.coreGlow);
  core.layers.enable(REFLECT_LAYER);
  arm.add(core);
  arm.position.set(x, 5.2, z);
  scene.add(arm);
  updaters.push((dt, t) => { arm.rotation.y = t * 0.18; arm.children[0].rotation.x = t * 0.3; arm.children[1].rotation.z = t * 0.22; core.position.y = Math.sin(t * 1.4) * 0.12; });
  // jets
  // arcing jets from the rim toward the pedestal (local +Z = inward)
  const arc = [];
  for (let k = 0; k <= 12; k++) { const t = k / 12; arc.push(V(0, t * (1 - t) * 4 * 1.8, t * 3.2)); }
  const jetGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arc), 24, 0.035, 5, false);
  const jets = new THREE.InstancedMesh(jetGeo, ctx.jetMaterial, 16);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2;
    m4.compose(V(x + Math.sin(a) * 5.6, 0.5, z + Math.cos(a) * 5.6), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), a + Math.PI), V(1, 0.8 + (i % 2) * 0.35, 1));
    jets.setMatrixAt(i, m4);
  }
  jets.layers.enable(REFLECT_LAYER);
  scene.add(jets);
  col.circle(x, z, 6.7, 'fountain');
}

function kiosk(ctx) {
  const { batch, M, scene, col, layout, interactables } = ctx;
  const { x, z, rot } = layout.kiosk;
  const base = lathe([[0, 0], [1.1, 0], [1.1, 0.12], [0.7, 0.3], [0.45, 1.0], [0.6, 1.15], [0, 1.15]], 32);
  batch.put(base, M.stoneUpper, V(x, 0, z));
  batch.put(new THREE.TorusGeometry(1.08, 0.05, 6, 48).rotateX(Math.PI / 2), M.gold, V(x, 0.12, z));
  const c = Math.cos(rot), s = Math.sin(rot);
  batch.put(box(1.5, 1.0, 0.1), M.darkMetal, V(x, 1.65, z), rot);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 0.86), createHoloMaterial(HOLO_ART.ad('CONTRACTS', 'OPEN WORK • VERIFIED PAY', 11, '#123b6e'), { bright: 2.2, alpha: 0.98, time: ctx.time }));
  screen.position.set(x + s * 0.06, 1.65, z + c * 0.06); screen.rotation.y = rot;
  screen.layers.enable(REFLECT_LAYER);
  scene.add(screen);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.5), createHoloMaterial(HOLO_ART.sign('CONTRACT TERMINAL'), { bright: 2.8, alpha: 0.85, time: ctx.time }));
  sign.position.set(x, 3.0, z); sign.rotation.y = rot; sign.layers.enable(REFLECT_LAYER);
  scene.add(sign);
  ctx.updaters.push((dt, t) => { sign.position.y = 3.0 + Math.sin(t * 1.6) * 0.06; });
  const ring = ctx.makePadRing(1.8, [0.4, 0.8, 1.0]);
  ring.position.set(x, 0.02, z); scene.add(ring);
  col.circle(x, z, 1.15, 'kiosk');
  interactables.push({ id: 'contracts', label: 'Contract Terminal', x, z, r: 3.0 });
}

function warehousePad(ctx) {
  const { batch, M, scene, col, layout, interactables } = ctx;
  const { x, z } = layout.pad;
  batch.put(lathe([[0, 0], [2.6, 0], [2.6, 0.08], [2.4, 0.14], [0, 0.14]], 48), M.darkMetal, V(x, 0, z));
  batch.put(new THREE.TorusGeometry(2.5, 0.05, 6, 64).rotateX(Math.PI / 2), M.gold, V(x, 0.12, z));
  for (const a of [0.8, 0.8 + Math.PI]) {
    const px = x + Math.sin(a) * 2.9, pz = z + Math.cos(a) * 2.9;
    batch.add(cyl(0.1, 0.16, 3.2, px, 0, pz, 10), M.chrome);
    batch.put(new THREE.SphereGeometry(0.2, 12, 8), M.blueGlow, V(px, 3.35, pz), 0, null, { cast: false });
    col.circle(px, pz, 0.25, 'pylon');
  }
  const ring = ctx.makePadRing(2.35, [0.45, 0.85, 1.0], true);
  ring.position.set(x, 0.16, z); scene.add(ring);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.5), createHoloMaterial(HOLO_ART.sign('WAREHOUSE LINK'), { bright: 2.8, alpha: 0.85, time: ctx.time }));
  sign.position.set(x, 3.7, z); sign.layers.enable(REFLECT_LAYER);
  scene.add(sign);
  interactables.push({ id: 'warehouse', label: 'Warehouse Link', x, z, r: 2.6 });
}

function holoPillar(ctx, x, z, art, rot = 0, h = 2.6) {
  const { batch, M, scene, col } = ctx;
  batch.add(cyl(0.18, 0.28, 0.5, x, 0, z, 12), M.darkMetal);
  batch.add(cyl(0.06, 0.06, h + 0.6, x, 0, z, 8), M.chrome);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), createHoloMaterial(art, { bright: 2.2, alpha: 0.85, time: ctx.time }));
  m.position.set(x, h + 0.9, z); m.rotation.y = rot; m.layers.enable(REFLECT_LAYER);
  scene.add(m);
  col.circle(x, z, 0.35, 'holo');
}

export function buildPlaza(ctx) {
  const { batch, M, col, layout } = ctx;
  fountain(ctx);
  kiosk(ctx);
  warehousePad(ctx);

  // Planters ring the plaza in four arcs, leaving the cardinal avenues open.
  const PR = 21.5;
  for (let q = 0; q < 4; q++) {
    for (const off of [-24, 24]) {
      const a = (q * 90 + 45 + off) * D2R;
      planter(ctx, Math.sin(a) * PR, Math.cos(a) * PR, 6.5, 1.6, a + Math.PI / 2, q * 2 + (off > 0 ? 1 : 0) + 1, 1);
    }
  }
  // Boulevard: median planters and lamps
  for (let zz = -38; zz >= -74; zz -= 18) planter(ctx, 0, zz, 1.6, 7.5, 0, 50 + zz, 2);
  for (let zz = -32; zz >= -78; zz -= 11.5) { lamp(ctx, -10.4, zz); lamp(ctx, 10.4, zz); }
  for (let a = 0; a < 360; a += 45) { const r = 30.5; lamp(ctx, Math.sin((a + 22.5) * D2R) * r, Math.cos((a + 22.5) * D2R) * r); }
  for (let a = 0; a < 360; a += 90) { const r = 12.5, t = (a + 45) * D2R; bench(ctx, Math.sin(t) * r, Math.cos(t) * r, t + Math.PI / 2); }
  bench(ctx, -6, -44, Math.PI / 2); bench(ctx, 6, -56, Math.PI / 2);

  holoPillar(ctx, -13.2, -44, HOLO_ART.ad('NEXUS', 'ONE CITY • ONE MIND', 4), 0.35);
  holoPillar(ctx, 13.2, -62, HOLO_ART.ad('HIREFRAME', 'RENT A BODY TODAY', 9, '#3a2a10'), -0.35);
  holoPillar(ctx, 30, 22, HOLO_ART.ad('CONCORD', 'YOUR PLACE IS PREPARED', 6), -0.6);

  // East edge: glass rail with two half-round overlooks.
  const pts = [[40, -80]];
  for (const [cz, r] of layout.balconies) {
    pts.push([40, cz - r]);
    for (let i = 0; i <= 16; i++) { const a = Math.PI - i / 16 * Math.PI; pts.push([40 + Math.sin(a) * r, cz + Math.cos(a) * r]); }
    pts.push([40, cz + r]);
  }
  pts.push([40, 38]);
  railing(ctx, pts.map(([x, z]) => [x - 0.1, z]));
  col.custom((x, z, r) => {
    if (x + r < 39.7) return false;
    for (const [cz, br] of layout.balconies) if (Math.hypot(x - 40, z - cz) < br - 0.3 - r) return false;
    return true;
  });
  // retaining wall below the east edge, down to the basin
  batch.put(box(1.2, 8, 120), M.stone, V(40.4, -4, -21), 0, null, { receive: true });
  for (const [cz, r] of layout.balconies) {
    batch.put(lathe([[r, 0], [r, -1.2], [r - 1.5, -2.6], [0.5, -2.8], [0, -2.8]], 32), M.stoneUpper, V(40, 0, cz));
    batch.add(arcTube(r + 0.02, 0, Math.PI, -0.12, 0.06, 32), M.warmGlow, { matrix: new THREE.Matrix4().makeTranslation(40, 0, cz), cast: false });
  }

  buildTerrace(ctx);
}

function buildTerrace(ctx) {
  const { batch, M, col, layout } = ctx;
  const T = layout.terrace;
  const depth = 50;
  const tw = T.x1 - T.x0, tcx = (T.x0 + T.x1) / 2;
  // raised deck
  const deck = new THREE.Mesh(box(tw, 0.2, depth, tcx, T.y - 0.1, T.z + depth / 2), M.terrace);
  const uv = deck.geometry.attributes.uv, p = deck.geometry.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 6, p.getZ(i) / 6);
  deck.receiveShadow = true; deck.layers.enable(REFLECT_LAYER);
  ctx.scene.add(deck);
  // retaining wall with gold band and glowing reveal, split by the staircase
  const [s0, s1] = T.stairs;
  for (const [a, b] of [[T.x0, s0], [s1, T.x1]]) {
    const w = b - a, cx = (a + b) / 2;
    batch.put(box(w, T.y, 0.6), M.stone, V(cx, T.y / 2, T.z + 0.3));
    batch.put(box(w, 0.08, 0.64), M.gold, V(cx, T.y - 0.05, T.z + 0.3));
    batch.put(box(w, 0.06, 0.05), M.warmGlow, V(cx, 0.35, T.z + 0.0), 0, null, { cast: false });
    col.box(cx, T.z + 0.3, w / 2, 0.35, 0, 'terraceWall');
    railing(ctx, [[a, T.z + 0.45], [b, T.z + 0.45]], T.y);
  }
  // steps
  const n = 12, run = (T.z - T.stairZ0) / n, rise = T.y / n;
  for (let i = 0; i < n; i++) {
    const g = box(s1 - s0, rise * (i + 1), run, (s0 + s1) / 2, rise * (i + 1) / 2, T.stairZ0 + run * (i + 0.5));
    batch.add(g, M.stoneUpper);
    batch.put(box(s1 - s0, 0.02, 0.05), M.gold, V((s0 + s1) / 2, rise * (i + 1) + 0.005, T.stairZ0 + run * i + 0.03), 0, null, { cast: false });
  }
  for (const sx of [s0 - 0.3, s1 + 0.3]) batch.put(box(0.6, T.y + 0.9, T.z - T.stairZ0), M.stone, V(sx, (T.y + 0.9) / 2, (T.z + T.stairZ0) / 2));
  for (const sx of [s0 - 0.3, s1 + 0.3]) col.box(sx, (T.z + T.stairZ0) / 2, 0.35, (T.z - T.stairZ0) / 2, 0, 'stairWall');
  col.height({ kind: 'rampZ', x0: s0, x1: s1, z0: T.stairZ0, z1: T.z, y0: 0, y1: T.y });
  col.height({ kind: 'flat', x0: T.x0, x1: T.x1, z0: T.z, z1: T.z + depth, y: T.y });
  // south + side enclosures
  batch.put(box(tw, 5, 1), M.stone, V(tcx, T.y + 2.5, 80.5));
  batch.put(box(tw, 0.3, 0.2), M.warmGlow, V(tcx, T.y + 4.2, 79.95), 0, null, { cast: false });
  railing(ctx, [[T.x1 - 0.2, T.z + 0.5], [T.x1 - 0.2, 79.8]], T.y);
  col.custom((x, z, r) => z > T.z - 0.2 && x + r > T.x1 - 0.3);
  // terrace dressing
  for (let i = 0; i < 5; i++) planter(ctx, -40 + i * 17, 62, 7, 1.8, 0, 90 + i, 2, T.y);
  for (let i = 0; i < 4; i++) bench(ctx, -32 + i * 17, 55, 0, T.y);
  for (const x of [-44, -20, 20, 32]) lamp(ctx, x, 45, T.y);
}
