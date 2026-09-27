import * as THREE from 'three';
import { box, cyl, lathe } from './geo.js';
import { makeCanvas } from './textures.js';
import { createGardenGround } from './vt_ground.js';
import { cliffFace, cliffGardens, plaqueMaterial, stele, monument, conservatory, pavilion, footbridge } from './vt_scenery.js';
import { planter, lamp, holoPillar, kiosk, warehousePad, railing } from './plaza.js';
import { bench, bollard, totems } from './furnish.js';
import { locker, stall, relay, dumpster } from './sites.js';
import { addTree, addShrubs, addVines } from './foliage.js';
import { HOLO_ART, createHoloMaterial, registerBillboard } from './holo.js';
import { createBreakables } from './breakables.js';
import { createWaterfall, createLakeMaterial, createMist } from './water.js';
import { addTowerField, archetypes } from './skyline.js';
import { addFlyingCars } from './traffic.js';
import { tiered } from './backdrop.js';
import { rng } from './textures.js';
import { REFLECT_LAYER } from '../fx/reflection.js';

// Verdant Terraces: three garden levels stepping UP to the north (the default camera looks north), joined by grand stairs
// and long ramps; one water system runs through all of them (headwater → canal → great falls → memorial pool → canal →
// twin falls → lower pool → cascade into the valley). West: a cliff of hanging gardens. East: a drop to the valley lake.
// L0 y 0 (arrival + lower gardens) z 20..86 · L1 y 6 (memorial terrace) z -36..20 · L2 y 13 (sky lawn) z -92..-36.
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const Y1 = 6, Y2 = 13, WY = -22, EDGE = 40, CLIFF = -47;

export const VT_LAYOUT = {
  bounds: { x0: -48, x1: 40.5, z0: -92, z1: 86 },
  y: [0, Y1, Y2],
  wallA: 20, wallB: -36,
  stairA: [-14, -4, 32], stairB: [-6, 6, -24],
  rampW: [-46.5, -41, 50], rampE: [34.5, 39.5, 0],
  poolL0: [6, 21, EDGE, 40], poolL1: [14, -35, 32, -24], canalL1: [20, -24, 26, 12.4], spill: [8, 12.4, 32, 19.4],
  headwater: [8, -90, 34, -78], canalL2: [19, -78, 27, -36.4],
  bridgesL1: [-12.5, 1.5], bridgeL2: -58.5,
  garden: { x0: -31, x1: -5, z0: -20, z1: 4, cx: -18, cz: -8 },
  shed: { x: -39, z: -8 },
  spawn: { x: 0, z: 68 },
  relay: { x: 0, z: 80 },
  kiosk: { x: -11, z: 72, rot: 0.6 },
  pad: { x: 11, z: 71 },
};
const L = VT_LAYOUT;

// ---- zone mask: R lawn, G gravel, B granite (black = limestone) ----
function paintMask() {
  const B = L.bounds, px = 4, W = Math.ceil((B.x1 - B.x0) * px), H = Math.ceil((B.z1 - B.z0) * px);
  const c = makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  const rr = (x0, z0, x1, z1, r, col) => {
    const X = (x0 - B.x0) * px, Y = (z0 - B.z0) * px, w = (x1 - x0) * px, h = (z1 - z0) * px;
    g.fillStyle = col; g.beginPath(); g.roundRect(X, Y, w, h, r * px); g.fill();
  };
  const circ = (x, z, r, col) => { g.fillStyle = col; g.beginPath(); g.arc((x - B.x0) * px, (z - B.z0) * px, r * px, 0, 7); g.fill(); };
  const lawn = '#f00', grav = '#0f0', gran = '#00f';
  // L0
  rr(-46, 22, -18, 34, 4, lawn); rr(-40, 44, -22, 58, 5, lawn); rr(-2, 46, 6, 58, 3, lawn); rr(18, 46, 38, 60, 5, lawn);
  rr(-40, 62, -22, 82, 4, lawn); rr(20, 64, 38, 84, 5, lawn); rr(-2, 22, 4, 38, 2, lawn);
  rr(-34, 36, -24, 44, 1, grav);
  circ(0, 70, 7.5, gran); circ(0, 70, 6.2, '#000'); circ(0, 70, 3.2, gran);
  rr(-12, 40, -6, 46, 0.5, gran);
  // L1
  rr(-47, -34, -33, 18, 5, lawn); rr(-3, -22, 12, -2, 4, lawn); rr(-3, 2, 18, 11, 4, lawn); rr(27, -22, 34, 18, 2, lawn);
  rr(L.garden.x0, L.garden.z0, L.garden.x1, L.garden.z1, 1, grav);
  rr(-19.6, L.garden.z0, -16.4, L.garden.z1, 0, gran); rr(L.garden.x0, -9.6, L.garden.x1, -6.4, 0, gran); circ(-18, -8, 5.2, gran);
  // L2
  rr(-46, -88, -6, -40, 6, lawn); rr(-2, -72, 16, -40, 4, lawn); rr(28, -88, 34, -40, 2, lawn);
  circ(-22, -66, 11, grav); circ(-2, -78, 7, gran); rr(-4, -74, 0, -38, 0, grav);
  return c;
}

function water(ctx) {
  const { scene } = ctx;
  const P = [
    [L.poolL0, -0.35], [L.poolL1, Y1 - 0.4], [L.canalL1, Y1 - 0.4], [L.spill, Y1 - 0.4], [L.headwater, Y2 - 0.4], [L.canalL2, Y2 - 0.4],
  ];
  const valley = [EDGE + 0.5, -420, 620, 420];
  const rects = P.map(([r]) => r);
  const mat = createLakeMaterial(ctx, { shore: {
    water: [...rects, valley], discs: [[120, -40, 9], [150, 50, 6]],
    churn: [[10, 21, 16, 25, 1], [22, 21, 30, 25, 1], [17, -35, 29, -31, 1], [EDGE + 0.5, 21, EDGE + 7, 40, 0.9], [8, -90, 34, -87, 0.6]],
  } });
  const geos = [];
  for (const [[x0, z0, x1, z1], y] of P) { const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, y, (z0 + z1) / 2); geos.push(g); }
  const vg = new THREE.PlaneGeometry(valley[2] - valley[0], valley[3] - valley[1]).rotateX(-Math.PI / 2); vg.translate((valley[0] + valley[2]) / 2, WY, (valley[1] + valley[3]) / 2); geos.push(vg);
  const merged = mergeGeos(geos);
  const mesh = new THREE.Mesh(merged, mat);
  mesh.receiveShadow = true; mesh.name = 'water';
  scene.add(mesh);
  // basins: stone rims and floors
  const { batch, M } = ctx;
  for (const [[x0, z0, x1, z1], y] of P) {
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, top = y + 0.4;
    batch.put(box(w, 0.2, d), M.darkMetal, V(cx, y - 1.1, cz), 0, null, { cast: false, reflect: false });
    for (const [bx, bz, bw, bd] of [[cx, z0 - 0.2, w + 0.8, 0.4], [cx, z1 + 0.2, w + 0.8, 0.4], [x0 - 0.2, cz, 0.4, d], [x1 + 0.2, cz, 0.4, d]]) {
      batch.put(box(bw, 1.4, bd), M.stoneUpper, V(bx, top - 0.62, bz), 0, null, { cast: false });
      batch.put(box(bw + 0.02, 0.05, bd + 0.02), M.gold, V(bx, top + 0.1, bz), 0, null, { cast: false });
    }
  }
  // falls: L0 twin falls, great falls, the valley cascade, three thin falls off the north cliff into the headwater
  const falls = [
    [13, L.wallA + 0.25, Y1 + 0.05, 6, Y1 + 0.4, 0, 0.9], [26, L.wallA + 0.25, Y1 + 0.05, 8, Y1 + 0.4, 0, 1],
    [23, L.wallB + 0.2, Y2 + 0.05, 12, Y2 - Y1 + 0.4, 0, 1.05],
    [EDGE + 0.6, 30.5, 0.0, 18, 22.4, Math.PI / 2, 1.1],
    [14, -91.5, 40, 3.5, 27.6, 0, 0.95], [21, -91.5, 44, 5, 31.6, 0, 1], [29, -91.5, 38, 3, 25.6, 0, 0.9],
  ];
  for (const [x, z, y, w, h, rot, b] of falls) {
    const f = createWaterfall(ctx, { width: w, height: h, lip: h > 20 ? 2.2 : 0.9, bright: b, segsY: h > 12 ? 24 : 10 });
    f.position.set(x, y, z); f.rotation.y = rot; scene.add(f);
  }
  if (ctx.tier.mist) {
    scene.add(createMist(ctx, { x: 20, y: 0, z: 23, w: 22, d: 5, count: 120, size: 5 }));
    scene.add(createMist(ctx, { x: 23, y: Y1, z: L.wallB + 2, w: 12, d: 4, count: 90, size: 5 }));
    const m = createMist(ctx, { x: EDGE + 3, y: WY + 0.2, z: 30.5, w: 18, d: 8, count: 120, size: 8 }); m.rotation.y = Math.PI / 2; scene.add(m);
  }
}

function mergeGeos(list) {
  const pos = [], nor = [], uv = [], idx = [];
  for (const g of list) {
    const n = pos.length / 3, p = g.attributes.position, q = g.attributes.normal, u = g.attributes.uv;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(q.getX(i), q.getY(i), q.getZ(i)); uv.push(u.getX(i), u.getY(i)); }
    for (const i of g.index.array) idx.push(i + n);
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx); out.computeBoundingSphere();
  return out;
}

// A retaining wall between two levels along Z = z (x0..x1), with buttresses, a gold coping, warm niche lights, and a
// planter parapet on top that spills vines down the face. `gaps` = [[a, b]] x ranges left open (stairs, falls).
function levelWall(ctx, z, x0, x1, yLo, yHi, gaps, seed) {
  const { batch, M, col } = ctx;
  const h = yHi - yLo;
  const segs = [];
  let a = x0;
  for (const [g0, g1] of gaps) { if (g0 > a) segs.push([a, g0]); a = g1; }
  if (x1 > a) segs.push([a, x1]);
  for (const [s0, s1] of segs) {
    const w = s1 - s0, cx = (s0 + s1) / 2;
    batch.put(box(w, h, 1.2), M.stoneUpper, V(cx, yLo + h / 2, z + 0.2));
    batch.put(box(w + 0.1, 0.12, 1.34), M.gold, V(cx, yHi + 0.02, z + 0.2), 0, null, { cast: false });
    batch.put(box(w, 0.35, 0.3), M.stone, V(cx, yLo + 0.17, z + 0.92), 0, null, { cast: false });
    for (let x = s0 + 3; x < s1 - 2; x += 7) {
      batch.put(box(1.1, h - 0.4, 0.7), M.stone, V(x, yLo + (h - 0.4) / 2, z + 0.95));
      batch.put(box(0.9, 0.07, 0.05), M.warmGlow, V(x, yLo + h * 0.55, z + 1.31), 0, null, { cast: false });
    }
    // parapet planter along the top edge (upper level side) with vines over the face
    batch.put(box(w, 0.7, 1.1), M.stoneUpper, V(cx, yHi + 0.35, z - 0.35));
    batch.put(box(w - 0.2, 0.08, 0.9), M.soil, V(cx, yHi + 0.66, z - 0.35), 0, null, { cast: false });
    addShrubs(ctx.batch, M, cx, yHi + 0.7, z - 0.35, w - 0.4, 0.9, 0, seed + (cx | 0), Math.round(w * 1.2));
    addVines(ctx.batch, M, s0 + 0.3, z + 0.85, s1 - 0.3, z + 0.85, yHi + 0.6, h * 0.55, { seed: seed * 3 + (s0 | 0), side: -1, density: 0.9, bloom: 0.3 });
    col.box(cx, z - 0.1, w / 2, 1.05, 0, 'levelWall');
  }
}

// Straight stair (along Z) from level yLo at zLo up to yHi at zHi; side walls with gold caps. Height region added.
function stair(ctx, x0, x1, zLo, zHi, yLo, yHi) {
  const { batch, M, col } = ctx;
  const n = Math.round(Math.abs(yHi - yLo) / 0.3), run = (zHi - zLo) / n, rise = (yHi - yLo) / n, w = x1 - x0, cx = (x0 + x1) / 2;
  for (let i = 0; i < n; i++) {
    const top = yLo + rise * (i + 1), zc = zLo + run * (i + 0.5);
    batch.put(box(w, top - yLo + 0.2, Math.abs(run)), M.stoneUpper, V(cx, (top + yLo - 0.2) / 2, zc));
    batch.put(box(w, 0.02, 0.06), M.gold, V(cx, top + 0.005, zLo + run * i + Math.sign(run) * 0.03), 0, null, { cast: false });
  }
  const zc = (zLo + zHi) / 2, len = Math.abs(zHi - zLo);
  for (const sx of [x0 - 0.3, x1 + 0.3]) {
    const g = new THREE.BufferGeometry();
    batch.put(box(0.6, yHi - yLo + 0.9, len), M.stone, V(sx, (yHi + yLo + 0.9) / 2, zc));
    batch.put(box(0.66, 0.08, len), M.gold, V(sx, yHi + 0.9, zc), 0, null, { cast: false });
    col.box(sx, zc, 0.33, len / 2, 0, 'stairWall');
    g.dispose();
  }
  lamp(ctx, x0 - 0.3, zLo, yLo); lamp(ctx, x1 + 0.3, zLo, yLo);
  col.height({ kind: 'rampZ', x0, x1, z0: Math.min(zLo, zHi), z1: Math.max(zLo, zHi), y0: zLo < zHi ? yLo : yHi, y1: zLo < zHi ? yHi : yLo });
}

// Long ramp along Z against a side wall (x side 'e' or 'w' gets the wall), yLo at zLo → yHi at zHi.
function ramp(ctx, x0, x1, zLo, zHi, yLo, yHi, wallX) {
  const { batch, M, col } = ctx;
  const len = Math.abs(zHi - zLo), n = Math.ceil(len / 3), dz = (zHi - zLo) / n;
  for (let i = 0; i < n; i++) {
    const za = zLo + dz * i, zb = za + dz, ya = yLo + (yHi - yLo) * i / n, yb = yLo + (yHi - yLo) * (i + 1) / n;
    const g = box(x1 - x0, 1, Math.abs(dz));
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const top = p.getY(k) > 0, zz = p.getZ(k) * Math.sign(dz);
      const yy = zz > 0 ? yb : ya;
      p.setY(k, top ? yy : Math.min(ya, yb) - 0.3);
    }
    g.computeVertexNormals();
    batch.put(g, M.stoneUpper, V((x0 + x1) / 2, 0, (za + zb) / 2));
  }
  const zc = (zLo + zHi) / 2;
  batch.put(box(0.5, yHi + 1.0 - yLo, len), M.stone, V(wallX, yLo + (yHi + 1 - yLo) / 2 - 0.1, zc));
  batch.put(box(0.56, 0.08, len), M.gold, V(wallX, yHi + 0.9, zc), 0, null, { cast: false });
  col.box(wallX, zc, 0.3, len / 2, 0, 'rampWall');
  col.height({ kind: 'rampZ', x0, x1, z0: Math.min(zLo, zHi), z1: Math.max(zLo, zHi), y0: zLo < zHi ? yLo : yHi, y1: zLo < zHi ? yHi : yLo });
}

function terraces(ctx) {
  const { batch, M, col } = ctx;
  // level blocks (visible faces only matter on the south / east sides)
  batch.put(box(EDGE - CLIFF + 2, Y1 + 30, L.wallA - L.wallB), M.stone, V((EDGE + CLIFF) / 2, Y1 - (Y1 + 30) / 2 - 0.02, (L.wallA + L.wallB) / 2), 0, null, { cast: false, reflect: false, color: new THREE.Color(0.75, 0.7, 0.62) });
  batch.put(box(EDGE - CLIFF + 2, Y2 + 30, L.wallB + 94), M.stone, V((EDGE + CLIFF) / 2, Y2 - (Y2 + 30) / 2 - 0.02, (L.wallB - 94) / 2), 0, null, { cast: false, reflect: false, color: new THREE.Color(0.75, 0.7, 0.62) });
  levelWall(ctx, L.wallA, -40.5, EDGE, 0, Y1, [[L.stairA[0], L.stairA[1]], [9.5, 16.5], [21.5, 30.5]], 11);
  levelWall(ctx, L.wallB, CLIFF, EDGE, Y1, Y2, [[L.stairB[0], L.stairB[1]], [16.5, 29.5], [L.rampE[0] - 0.4, EDGE]], 23);
  // lips where falls pour (the wall top between the parapets)
  for (const [x0, x1, z, y] of [[9.5, 16.5, L.wallA, Y1], [21.5, 30.5, L.wallA, Y1], [16.5, 29.5, L.wallB, Y2]]) {
    batch.put(box(x1 - x0, y + 0.02 - (y === Y1 ? 0 : Y1), 1.2), M.stoneUpper, V((x0 + x1) / 2, (y + (y === Y1 ? 0 : Y1)) / 2 - 0.3, z + 0.2), 0, null, { cast: false });
    col.box((x0 + x1) / 2, z, (x1 - x0) / 2, 0.8, 0, 'fallLip');
  }
  // L0 → L1 grand stair, L1 → L2 grand stair, west ramp L0 → L1, east ramp L1 → L2
  stair(ctx, L.stairA[0], L.stairA[1], L.stairA[2], L.wallA, 0, Y1);
  stair(ctx, L.stairB[0], L.stairB[1], L.stairB[2], L.wallB, Y1, Y2);
  ramp(ctx, L.rampW[0], L.rampW[1], L.rampW[2], L.wallA + 0.4, 0, Y1, L.rampW[1] + 0.25);
  ramp(ctx, L.rampE[0], L.rampE[1], L.rampE[2], L.wallB + 0.4, Y1, Y2, L.rampE[0] - 0.25);
  railing(ctx, [[EDGE - 0.15, L.rampE[2]], [EDGE - 0.15, L.wallB]], 0, 1.1);
  // heights: flats first, then ramps/stairs override (stair/ramp calls above push theirs; re-add flats before them)
  col.heights.unshift({ kind: 'flat', x0: CLIFF - 2, x1: EDGE + 1, z0: L.wallB, z1: L.wallA, y: Y1 }, { kind: 'flat', x0: CLIFF - 2, x1: EDGE + 1, z0: L.bounds.z0 - 2, z1: L.wallB, y: Y2 });
  // east rail on every level, west cliff wall, north edge
  railing(ctx, [[EDGE - 0.15, 86], [EDGE - 0.15, L.poolL0[3] + 0.6]], 0);
  railing(ctx, [[EDGE - 0.15, L.wallA], [EDGE - 0.15, L.rampE[2]]], Y1);
  railing(ctx, [[EDGE - 0.15, L.wallB], [EDGE - 0.15, -92]], Y2);
  col.custom((x, z, r) => x - r < CLIFF + 0.4 || x + r > EDGE - 0.3);
  // south balustrade over the lower concourse
  railing(ctx, [[CLIFF, 85.9], [EDGE, 85.9]], 0);
}

function lowerGardens(ctx, plaqueM) {
  const { batch, M, col } = ctx;
  kiosk(ctx); warehousePad(ctx); relay(ctx, L.relay.x, L.relay.z);
  const seat = (x, z, rot, y = 0) => { const seats = bench(ctx, x, z, rot, y); ctx.gather.push({ x, z, kind: 'sit', seats, y }); };
  // arrival medallion: flower beds and bollards round it
  for (let a = 0; a < 360; a += 45) if (a % 180) bollard(ctx, Math.sin(a * Math.PI / 180) * 8.6, 70 + Math.cos(a * Math.PI / 180) * 8.6);
  planter(ctx, -18, 66, 5, 1.6, 0.3, 501, 1); planter(ctx, 18, 66, 5, 1.6, -0.3, 502, 1);
  // promenade facing the falls pool
  for (const x of [10, 18, 26, 34]) seat(x, 42.6, Math.PI);
  for (const x of [8, 20, 32]) lamp(ctx, x, 41.4);
  lamp(ctx, -3, 41); lamp(ctx, 5, 58); lamp(ctx, -16, 58); lamp(ctx, 16, 58); lamp(ctx, -24, 76); lamp(ctx, 24, 76);
  holoPillar(ctx, -5.5, 50, HOLO_ART.ad('VERDANT', 'BREATHE • BELONG • BLOOM', 5, '#1e4a2a'), 0.3);
  holoPillar(ctx, 22, 62, HOLO_ART.ad('CONCORD', 'YOUR PLACE IS PREPARED', 6), -0.4);
  totems(ctx, [[-8, 58, Math.PI, 0, 1], [8, 60, Math.PI, 2, 3]]);
  // lawns: trees
  const T = [[-42, 25], [-34, 30], [-24, 26], [-36, 52], [-27, 47], [-34, 76], [-26, 68], [0, 30], [24, 50], [33, 56], [26, 78], [34, 70], [2, 52]];
  T.forEach(([x, z], i) => addTree(batch, M, x, 0, z, 300 + i, 1.05 + (i % 3) * 0.12));
  // flower market (west) and the gardeners' yard (south-west, service path)
  for (const [x, z, r, h] of [[-33, 38, Math.PI / 2, 1], [-33, 42.5, Math.PI / 2, 0], [-25, 36, 0, 1]]) stall(ctx, x, z, r, h);
  ctx.gather.push({ x: -29, z: 40, kind: 'talk' });
  locker(ctx, -20, 60, Math.PI);
  batch.put(box(8, 3, 0.4), M.stone, V(-41, 1.5, 58.5));
  dumpster(ctx, -44.8, 62, Math.PI / 2); dumpster(ctx, -44.8, 72, Math.PI / 2);
  for (let z = 62; z < 80; z += 4) batch.put(box(0.2, 0.2, 4), M.darkMetal, V(-46.3, 3.8, z), 0, null, { cast: false });
  seat(-12, 44, 0); seat(-28, 22.8, 0, 0); seat(-6, 76, Math.PI / 2);
  seat(8.5, 76, -Math.PI / 2);
}

function memorialTerrace(ctx, plaqueM) {
  const { batch, M, col } = ctx;
  const G = L.garden, y = Y1;
  // hedge enclosure with gaps on each axis
  const hedge = (x0, z0, x1, z1) => { const len = Math.hypot(x1 - x0, z1 - z0), rot = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2; addShrubs(ctx.batch, M, (x0 + x1) / 2, y, (z0 + z1) / 2, len, 0.9, rot, (x0 * 13 + z0) | 0, Math.round(len * 1.4)); batch.put(box(len, 0.35, 1), M.soil, V((x0 + x1) / 2, y + 0.1, (z0 + z1) / 2), rot, null, { cast: false }); col.box((x0 + x1) / 2, (z0 + z1) / 2, len / 2, 0.5, rot, 'hedge'); };
  hedge(G.x0, G.z0, G.cx - 2.2, G.z0); hedge(G.cx + 2.2, G.z0, G.x1, G.z0);
  hedge(G.x0, G.z1, G.cx - 2.2, G.z1); hedge(G.cx + 2.2, G.z1, G.x1, G.z1);
  hedge(G.x0, G.z0 + 0.5, G.x0, G.cz - 2.2); hedge(G.x0, G.cz + 2.2, G.x0, G.z1 - 0.5);
  hedge(G.x1, G.z0 + 0.5, G.x1, G.cz - 2.2); hedge(G.x1, G.cz + 2.2, G.x1, G.z1 - 0.5);
  monument(ctx, plaqueM, G.cx, y, G.cz);
  // rows of blank plaques facing the central walk; some with candles and flowers left at their feet
  const R = rng(99);
  const warm = [];
  for (const zr of [-17.5, -13.5, -2.5, 1.5]) for (const side of [-1, 1]) for (let k = 0; k < 5; k++) {
    const x = G.cx + side * (3.2 + k * 1.95), z = zr;
    stele(ctx, plaqueM, x, y, z, Math.PI, 1);
    if (R() < 0.35) warm.push([x + (R() - 0.5) * 0.6, z - 0.45]);
  }
  for (const [x, z] of warm) {
    batch.put(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 8), M.stoneUpper, V(x, y + 0.08, z), 0, null, { cast: false, reflect: false });
    batch.put(new THREE.SphereGeometry(0.035, 6, 4), M.warmGlow, V(x, y + 0.2, z), 0, null, { cast: false, reflect: false });
  }
  for (const [x, z] of [[G.x0 + 1.5, G.z0 + 1.5], [G.x1 - 1.5, G.z0 + 1.5], [G.x0 + 1.5, G.z1 - 1.5], [G.x1 - 1.5, G.z1 - 1.5]]) {
    addTree(batch, M, x, y, z, (x * 7 + z) | 0, 1.25);
  }
  for (const a of [Math.PI / 4, 3 * Math.PI / 4, -Math.PI / 4, -3 * Math.PI / 4]) {
    const x = G.cx + Math.sin(a) * 6.2, z = G.cz + Math.cos(a) * 6.2;
    const seats = bench(ctx, x, z, a + Math.PI, y); ctx.gather.push({ x, z, kind: 'sit', seats, y });
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.55), createHoloMaterial(HOLO_ART.sign('GARDEN OF REMEMBRANCE'), { bright: 2.2, alpha: 0.85, time: ctx.time }));
  sign.position.set(G.cx, y + 3.2, G.z1 + 0.6); sign.rotation.y = 0; sign.layers.enable(REFLECT_LAYER); ctx.scene.add(sign);
  // Fenn's potting shed / glasshouse on the cliff lawn
  const S = L.shed;
  batch.put(box(7, 0.3, 9), M.stoneUpper, V(S.x, y + 0.15, S.z));
  batch.put(box(6.6, 3, 8.6), M.glassRail, V(S.x, y + 1.8, S.z), 0, null, { cast: false, reflect: false });
  const roof = new THREE.CylinderGeometry(3.4, 3.4, 8.8, 3, 1).rotateX(Math.PI / 2); roof.scale(1, 0.45, 1);
  batch.put(roof, M.glassRail, V(S.x, y + 3.6, S.z), 0, null, { cast: false, reflect: false });
  for (const dz of [-4.3, -2.15, 0, 2.15, 4.3]) {
    batch.put(box(6.7, 0.08, 0.08), M.gold, V(S.x, y + 3.3, S.z + dz), 0, null, { cast: false });
    for (const dx of [-3.3, 3.3]) batch.put(box(0.08, 3, 0.08), M.gold, V(S.x + dx, y + 1.8, S.z + dz), 0, null, { cast: false });
  }
  addShrubs(ctx.batch, M, S.x, y + 0.9, S.z, 5, 7, 0, 412, 22);
  batch.put(box(5, 0.9, 1.2), M.darkMetal, V(S.x, y + 0.45, S.z - 3.2), 0, null, { cast: false });
  col.box(S.x, S.z, 3.5, 4.5, 0, 'shed');
  // cliff lawn, the east walk between canal and ramp, lamps and benches
  const T = [[-44, 12], [-43, -2], [-45, -18], [-36, -28], [-42, -30], [-25, 12], [-10, 14], [4, -18], [10, -4], [31, 14], [30, -18], [9, 8]];
  T.forEach(([x, z], i) => addTree(batch, M, x, y, z, 600 + i, 1.0 + (i % 3) * 0.15));
  for (const [x, z] of [[-2, 16], [-28, 8], [-2, -24], [12, -22], [30, 4], [30, -26], [-36, -20]]) lamp(ctx, x, z, y);
  for (const [x, z, r] of [[-1, 6, Math.PI / 2], [30.5, -8, -Math.PI / 2], [12, 17.4, Math.PI]]) { const seats = bench(ctx, x, z, r, y); ctx.gather.push({ x, z, kind: 'sit', seats, y }); }
  locker(ctx, -36, 14.5, Math.PI);
  holoPillar(ctx, 2, -2, HOLO_ART.ad('HARMONY', 'THROUGH UNITY', 7), 0.2);
  // L1 canal bridges
  for (const z of L.bridgesL1) footbridge(ctx, L.canalL1[0] - 0.6, L.canalL1[2] + 0.6, z, y + 0.02);
}

function skyLawn(ctx) {
  const { batch, M } = ctx;
  const y = Y2;
  conservatory(ctx, -22, y, -66, 8);
  const ps = pavilion(ctx, -2, y, -78, bench);
  ctx.gather.push(...ps);
  footbridge(ctx, L.canalL2[0] - 0.6, L.canalL2[2] + 0.6, L.bridgeL2, y + 0.02);
  const T = [[-40, -44], [-44, -58], [-40, -86], [-32, -46], [-10, -46], [-12, -88], [10, -44], [12, -66], [31, -44], [31, -70], [-44, -74], [2, -60]];
  T.forEach(([x, z], i) => addTree(batch, M, x, y, z, 900 + i, 1.0 + (i % 3) * 0.15));
  for (const [x, z] of [[-8, -40], [8, -40], [-30, -56], [-8, -64], [30, -52], [30, -82], [-38, -80]]) lamp(ctx, x, z, y);
  for (const [x, z, r] of [[-12, -56, Math.PI / 2], [36.6, -64, -Math.PI / 2], [36.6, -56, -Math.PI / 2], [-30, -86, 0]]) { const seats = bench(ctx, x, z, r, y); ctx.gather.push({ x, z, kind: 'sit', seats, y }); }
  for (const [x, z] of [[-40, -66], [8, -86]]) planter(ctx, x, z, 5, 1.6, 0, (x * 3) | 0, 1, y);
  locker(ctx, -38, -40.6, Math.PI);
  holoPillar(ctx, 14, -50, HOLO_ART.ad('NEXUS', 'ONE CITY • ONE MIND', 4), -0.3);
}

// everything past the play bounds: the west cliff of hanging gardens, the north falls cliff, the valley, the far city
function scenery(ctx) {
  const { batch, M, scene } = ctx;
  cliffFace(ctx, CLIFF - 0.4, 90, CLIFF - 0.4, -95, -2, 34, { seed: 3, side: 1, rough: 1.6 });
  cliffFace(ctx, CLIFF - 8, 120, CLIFF - 8, -130, 30, 52, { seed: 5, side: 1, rough: 2.2 });
  cliffGardens(ctx, CLIFF - 0.4, 88, CLIFF - 0.4, -92, [9, 17, 25], { seed: 7, side: 1, trees: 0.3 });
  cliffFace(ctx, -60, -92.4, 60, -92.4, Y2 - 1, 46, { seed: 9, side: 1, rough: 1.8 });
  cliffGardens(ctx, -60, -92.2, 4, -92.2, [24, 34], { seed: 13, side: 1, trees: 0.3 });
  cliffGardens(ctx, 36, -92.2, 60, -92.2, [24, 34], { seed: 17, side: 1, trees: 0.3 });
  // east face below the terraces, down to the valley
  cliffFace(ctx, EDGE + 0.6, -100, EDGE + 0.6, 21, WY - 1, Y2, { seed: 21, side: -1, rough: 1.0, cast: false });
  cliffFace(ctx, EDGE + 0.6, 40, EDGE + 0.6, 100, WY - 1, 0, { seed: 22, side: -1, rough: 1.0, cast: false });
  cliffGardens(ctx, EDGE + 0.6, -95, EDGE + 0.6, 95, [-6, -13], { seed: 29, side: -1, trees: 0.2 });
  // west cliff top: terraced residences; north cliff top: more of them, and a Harmony screen on the west face
  const R = rng(41);
  for (let z = 80; z > -120; z -= 34) tiered(ctx, CLIFF - 26, 52, z, 22, 26, Math.PI / 2, [{ h: 8 }, { h: 10, glass: true, warm: R() < 0.5, setback: 2, garden: true }, { h: 7 + R() * 8, glass: true, setback: 2 }], 60 + (z | 0));
  for (let x = -50; x < 70; x += 30) tiered(ctx, x, 46, -118, 24, 20, 0, [{ h: 9, garden: true }, { h: 12, glass: true, setback: 2, garden: true }, { h: 8 + R() * 12, glass: true, warm: true, setback: 2.5 }], 90 + x);
  const hp = new THREE.Mesh(new THREE.PlaneGeometry(10, 20), createHoloMaterial(HOLO_ART.harmony(), { bright: 2.0, alpha: 0.96, time: ctx.time }));
  hp.position.set(CLIFF - 1.2, 22, -8); hp.rotation.y = Math.PI / 2; hp.layers.enable(REFLECT_LAYER); scene.add(hp);
  registerBillboard(ctx, hp.material, 512, 1024);
  batch.put(box(0.6, 21, 11), M.darkMetal, V(CLIFF - 1.6, 22, -8), 0, null, { cast: false });
  let R0;
  const bb = new THREE.Mesh(new THREE.PlaneGeometry(26, 13), createHoloMaterial((R0 = HOLO_ART.reel('brighter')).canvas, { bright: 2.0, alpha: 0.95, time: ctx.time, reel: { ...R0, hold: 8 } }));
  bb.position.set(-18, 36, -91.2); bb.layers.enable(REFLECT_LAYER); scene.add(bb);
  registerBillboard(ctx, bb.material, 1024, 512);
  batch.put(box(27, 14, 0.6), M.darkMetal, V(-18, 36, -91.8), 0, null, { cast: false });
  // valley: far-bank cascade terraces and buildings, islands
  for (let i = 0; i < 4; i++) {
    const y = WY + 3 + i * 4, x = 210 + i * 12;
    batch.put(box(12, y - WY + 1, 260), M.stoneUpper, V(x, (y + WY) / 2 - 0.5, 0), 0, null, { cast: false });
    const f = createWaterfall(ctx, { width: 60, height: 4, lip: 0.6, segsY: 4, bright: 1.4 });
    f.rotation.y = -Math.PI / 2; f.position.set(x - 6, y + 0.4, -40 + i * 30); scene.add(f);
    for (let z = -120; z < 120; z += 14) if ((z + i * 7) % 3) addTree(batch, M, x + 3, y + 0.5, z + i * 3, (z * 13 + i) | 0, 1.3);
  }
  for (const [x, z, r] of [[120, -40, 9], [150, 50, 6]]) {
    batch.put(lathe([[0, 0], [r, 0], [r + 0.6, 0.8], [r, 1.6], [0, 1.6]], 28), M.stoneUpper, V(x, WY - 0.3, z), 0, null, { cast: false });
    for (let i = 0; i < 3; i++) addTree(batch, M, x + Math.sin(i * 2.1) * r * 0.45, WY + 1.3, z + Math.cos(i * 2.1) * r * 0.45, (x + i) | 0, 1.4);
  }
  for (let k = 0; k < 6; k++) tiered(ctx, 270, WY + 16, -120 + k * 48, 26, 22, -Math.PI / 2, [{ h: 8, garden: true }, { h: 14 + k % 3 * 5, glass: true, warm: k % 2 === 0, setback: 2, garden: true }, { h: 10, glass: true, setback: 2.5 }], 140 + k);
  // south: the lower concourse beyond the balustrade
  batch.put(box(120, 1, 60), M.stoneUpper, V(-4, -6.5, 118), 0, null, { cast: false });
  cliffFace(ctx, -64, 86.6, 44, 86.6, -7, 0, { seed: 31, side: -1, rough: 0.5, cast: false });
  for (let x = -40; x < 40; x += 9) addTree(batch, M, x, -6, 96 + (x % 2) * 4, 1000 + x, 1.3);
  for (let x = -50; x < 60; x += 36) tiered(ctx, x, -6, 150, 28, 24, Math.PI, [{ h: 10 }, { h: 16, glass: true, setback: 2, garden: true }, { h: 12, glass: true, warm: true, setback: 2 }], 200 + x);
  // far city: tower field all round, flying traffic on wide loops
  const spots = [], S = rng(57);
  spots.push([-40, -330, 0, 1.2], [90, -300, 1, 1.1], [330, -120, 2, 1.1], [360, 90, 1, 1.0], [-260, -180, 3, 1.0], [-240, 160, 0, 1.1], [120, 330, 2, 1.0]);
  for (let i = 0; i < 90; i++) {
    const a = S() * Math.PI * 2, d = 250 + S() * 450, x = Math.sin(a) * d, z = Math.cos(a) * d - 30;
    if (spots.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 55)) continue;
    spots.push([x, z, (S() * 4) | 0, 0.55 + S() * 0.6]);
  }
  for (const s of spots) s.push(S() * Math.PI, 0.85 + S() * 0.4);
  const { far } = addTowerField(ctx, spots, { arch: archetypes(), y: -10 });
  ctx.farSky.push(...far);
  const lanes = [];
  for (const [r, y, sp] of [[170, 45, 18], [230, 70, -22], [300, 100, 26], [380, 60, -24]]) lanes.push({ type: 'loop', cx: 80, cz: -20, r, y, sp });
  for (const [x0, z0, x1, z1, y, sp] of [[-600, -200, 600, -240, 55, 28], [300, 600, 330, -600, 40, 26], [-500, 300, 600, 260, 70, 30]]) lanes.push({ type: 'line', x0, z0, x1, z1, y, sp });
  const { paint, glow } = addFlyingCars(ctx, lanes, ctx.tier.traffic, rng(61));
  const swarm = [];
  for (const [r, y, sp] of [[450, 110, 32], [560, 150, -36], [650, 90, 34]]) swarm.push({ type: 'loop', cx: 0, cz: 0, r, y, sp });
  addFlyingCars(ctx, swarm, Math.round(ctx.tier.traffic * 1.2), rng(63), { spread: 30, scale: 1.7, low: true, paint, glow });
}

function buildTerraces(ctx, onProgress = () => {}) {
  const { col } = ctx;
  ctx.gather ||= [];
  const plaqueM = plaqueMaterial(ctx);
  const B = L.bounds;
  createGardenGround(ctx, [
    { rects: [[CLIFF - 1, EDGE + 0.5, L.wallA, 86.5]], y: 0, reflect: true, ao: true },
    { rects: [[CLIFF - 1, EDGE + 0.5, L.wallB, L.wallA]], y: Y1 },
    { rects: [[CLIFF - 1, EDGE + 0.5, -92.5, L.wallB]], y: Y2 },
  ], { canvas: paintMask(), x0: B.x0, z0: B.z0, w: B.x1 - B.x0, d: B.z1 - B.z0 });
  onProgress(0.45, 'Watering the terraces…');
  terraces(ctx);
  water(ctx);
  // pools and canals are not walkable (bridges are carved out of the canals)
  const wet = [L.poolL0, L.poolL1, L.spill, L.headwater];
  col.custom((x, z, r) => {
    for (const [x0, z0, x1, z1] of wet) if (x + r > x0 - 0.4 && x - r < x1 + 0.4 && z + r > z0 - 0.4 && z - r < z1 + 0.4) return true;
    for (const [c, bz] of [[L.canalL1, L.bridgesL1], [L.canalL2, [L.bridgeL2]]]) {
      if (x + r > c[0] - 0.4 && x - r < c[2] + 0.4 && z + r > c[1] - 0.4 && z - r < c[3] + 0.4 && !bz.some((b) => z - r > b - 1.4 && z + r < b + 1.4)) return true;
    }
    return false;
  });
  lowerGardens(ctx, plaqueM);
  onProgress(0.55, 'Tending the memorial garden…');
  memorialTerrace(ctx, plaqueM);
  skyLawn(ctx);
  onProgress(0.62, 'Hanging the gardens…');
  scenery(ctx);

  const y1 = { y: Y1 }, y2 = { y: Y2 };
  ctx.breakables = createBreakables(ctx, [
    { kind: 'crate', x: -42.5, z: 65, stack: 1 }, { kind: 'crate', x: -40.4, z: 67.4, rot: 0.4 }, { kind: 'crate', x: -42.6, z: 69.4, rot: 0.2 }, { kind: 'crate', x: -40, z: 74, stack: 1 },
    { kind: 'crate', x: -35, z: 44.6, rot: 0.3 },
    { kind: 'vending', x: -15, z: 83, rot: 0 }, { kind: 'vending', x: 15, z: 83, rot: 0 }, { kind: 'vending', x: -40, z: 19, rot: Math.PI, ...y1 },
    { kind: 'vending', x: -44, z: -40.6, rot: Math.PI, ...y2 },
    { kind: 'holo', x: -6, z: 36, rot: 0.3 }, { kind: 'holo', x: 20, z: 56, rot: -0.3 }, { kind: 'holo', x: 8, z: -12, rot: 0.2, ...y1 },
    { kind: 'holo', x: -12, z: -72, rot: 0.3, ...y2 }, { kind: 'holo', x: 22, z: -46, rot: -0.3, ...y2 },
  ]);

  const G = L.garden;
  const S = [
    ['vt_plaza_arrival', 'plaza', 0, 66, 7], ['vt_plaza_promenade', 'plaza', -2, 46, 6], ['vt_plaza_summit', 'plaza', -4, -56, 6],
    ['vt_fountain_falls', 'fountain', 20, 44, 6], ['vt_fountain_great', 'fountain', 10, -26, 4], ['vt_fountain_headwater', 'fountain', 4, -84, 4],
    ['vt_park_lower', 'park', -32, 28, 7], ['vt_park_cliff', 'park', -40, -20, 6], ['vt_park_skylawn', 'park', 6, -60, 7], ['vt_park_east', 'park', 28, 54, 6],
    ['vt_memorial_garden', 'garden', G.cx, G.cz, 10], ['vt_memorial_plaques', 'garden', G.cx - 8, G.cz - 7.5, 3],
    ['vt_market_flowers', 'market', -29, 40, 5],
    ['vt_locker_arrival', 'locker', -20, 58.6, 2.5], ['vt_locker_terrace', 'locker', -36, 13, 2.5], ['vt_locker_summit', 'locker', -38, -42, 2.5],
    ['vt_alley_yard', 'alley', -43, 70, 3], ['vt_alley_cliffpath', 'alley', -45, -2, 2.5],
    ['vt_rooftop_memorial', 'rooftop', -2, 10, 5], ['vt_rooftop_pavilion', 'rooftop', -2, -78, 5], ['vt_rooftop_conservatory', 'rooftop', -8, -66, 5], ['vt_rooftop_east', 'rooftop', 30, -60, 4],
    ['vt_warehouse_yard', 'warehouse', -40, 68, 4],
    ['vt_relay', 'relay', L.relay.x, L.relay.z - 2.8, 2.5],
    ['vt_spawn_north_w', 'spawn_edge', -30, -89, 3], ['vt_spawn_north_e', 'spawn_edge', 3, -89, 3], ['vt_spawn_south_w', 'spawn_edge', -40, 84, 3], ['vt_spawn_south_e', 'spawn_edge', 30, 84, 3],
    ['vt_vantage_lower', 'vantage', 37, 62, 2.5], ['vt_vantage_terrace', 'vantage', 37, 8, 2.5], ['vt_vantage_summit', 'vantage', 37, -62, 2.5], ['vt_vantage_stair', 'vantage', 0, -38.5, 2.5],
    ['vt_hide_yard', 'hide', -45, 60, 2], ['vt_hide_shed', 'hide', -35, -14, 2], ['vt_hide_hedge', 'hide', -6, -16, 1.5], ['vt_hide_conservatory', 'hide', -32, -74, 2],
    ['vt_npc_fenn', 'npc', L.shed.x + 4.2, L.shed.z + 2, 1.5], ['vt_npc_arrival', 'npc', 8, 64, 1.5], ['vt_npc_promenade', 'npc', -14, 46, 1.5], ['vt_npc_summit', 'npc', -4, -70, 1.5], ['vt_npc_market', 'npc', -26, 39, 1.5],
    ['vt_contract_terminal', 'terminal', L.kiosk.x, L.kiosk.z, 3], ['vt_warehouse_link', 'link_pad', L.pad.x, L.pad.z, 2.6],
  ];
  ctx.sites = S.map(([id, tag, x, z, r]) => ({ id, tag, x, z, r, y: col.groundAt(x, z), district: 'terraces', indoor: false }));
}

const CROWD = {
  loops: [
    [[0, 64], [-12, 52], [-16, 40], [-4, 38], [4, 48], [16, 46], [30, 46], [24, 58], [8, 62]],
    [[-28, 50], [-36, 40], [-28, 30], [-18, 40]],
    [[-9, 42], [-9, 26], [-9, 12], [2, 4], [10, -8], [4, -18], [-2, 12], [-9, 26]],
    [[-18, 7], [-4, -8], [-18, -22], [-32, -8]],
    [[12, 1.5], [30, 1.5], [30, -12.5], [12, -12.5]],
    [[-38, 14], [-44, -6], [-40, -30], [-30, -26], [-34, 4]],
    [[0, -22], [0, -40], [-10, -52], [-30, -52], [-34, -78], [-12, -86], [4, -70], [10, -48]],
    [[30, -44], [36, -70], [30, -86], [28, -58.5], [14, -58.5], [8, -70], [14, -46]],
    [[-4, 70], [-14, 78], [0, 84], [14, 78], [4, 70]],
  ],
  talk: [[-6, 54], [12, 52], [-20, 44], [26, 52], [-30, 60], [-8, 10], [6, -14], [-28, 2], [30, -4], [-10, -46], [8, -80], [-30, -60], [4, 76], [-38, -12]],
};

export const TERRACES = {
  id: 'terraces', name: 'Verdant Terraces', layout: VT_LAYOUT, bounds: VT_LAYOUT.bounds, build: buildTerraces, crowd: CROWD, batchCell: 64,
  adOrigins: [[0, 0], [-20, -60], [0, 60]], adCount: 6,
  farLanes: [[-40, 30, 100, 130, -6]],
  ambience: {
    sun: [1.0, 0.86, 0.66], sunI: 3.4, hemiSky: 0xbcd8ff, hemiGround: 0x5a6a3a, hemiI: 0.32,
    fog: [0.66, 0.74, 0.8], fogDensity: 0.0006, env: 0.8,
    gain: [1.03, 1.02, 0.94], lift: [0.004, 0.008, 0.0], sat: 1.14, contrast: 1.14,
  },
  spawnPoints: (L) => ({ player: [L.spawn.x, L.spawn.z], kiosk: [L.kiosk.x, L.kiosk.z + 2.5], pad: [L.pad.x, L.pad.z], relay: [L.relay.x, L.relay.z - 2.8], garden: [L.garden.cx, L.garden.z1 + 2] }),
};
