import * as THREE from 'three';
import { box, cyl, lathe, roundedBar, D2R } from './geo.js';
import { HOLO_ART, createHoloMaterial, registerBillboard, twoSided } from './holo.js';
import { addShrubs } from './foliage.js';
import { REFLECT_LAYER } from '../fx/reflection.js';

// Street furniture at the gameplay camera's eye level: ad totems, benches with backs, cafés, bollards.
// Every seat and loiter spot is published on ctx.gather for the crowd.
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const polar = (r, deg) => [Math.sin(deg * D2R) * r, Math.cos(deg * D2R) * r];
export const SEAT_TOP = 0.5;

// Stone bench with a chrome back rail. Seats face local +Z; returns the seat list for the crowd.
export function bench(ctx, x, z, rot, y = 0, back = true) {
  const { batch, M, col } = ctx;
  const c = Math.cos(rot), s = Math.sin(rot);
  const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const seat = roundedBar(2.3, 0.62, 0.1, 0.04);
  batch.put(seat, M.stoneUpper, V(x, y + SEAT_TOP - 0.1, z), rot);
  batch.put(box(2.2, 0.035, 0.05), M.gold, V(...xyz(at(0, 0.3), y + SEAT_TOP - 0.03)), rot, null, { cast: false });
  for (const k of [-0.85, 0.85]) {
    const [px, pz] = at(k, -0.02);
    batch.put(box(0.1, SEAT_TOP - 0.1, 0.5), M.darkMetal, V(px, y + (SEAT_TOP - 0.1) / 2, pz), rot);
  }
  if (back) {
    for (const k of [-0.95, 0.95]) {
      const [px, pz] = at(k, -0.3);
      batch.put(box(0.05, 0.5, 0.05), M.chrome, V(px, y + SEAT_TOP + 0.22, pz), rot, null, { cast: false });
    }
    for (const h of [0.3, 0.46]) batch.put(box(2.2, 0.05, 0.06), h > 0.4 ? M.gold : M.chrome, V(...xyz(at(0, -0.3), y + SEAT_TOP + h)), rot, null, { cast: false });
  }
  col.box(x, z, 1.15, 0.33, rot, 'bench');
  return [-0.5, 0.5].map((k) => { const [sx, sz] = at(k, -0.1); return [sx, sz, rot]; });
}
const xyz = ([x, z], y) => [x, y, z];

// Café: round counter under a white canopy, plus two tables with two stools each.
export function cafe(ctx, x, z, rot) {
  const { batch, M, col, scene } = ctx;
  const c = Math.cos(rot), s = Math.sin(rot);
  const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  batch.put(lathe([[0, 0], [1.05, 0], [1.1, 0.08], [1.0, 0.95], [1.12, 1.0], [1.12, 1.08], [0, 1.08]], 32), M.stoneUpper, V(x, 0, z));
  batch.put(new THREE.TorusGeometry(1.1, 0.035, 6, 40).rotateX(Math.PI / 2), M.gold, V(x, 1.08, z));
  batch.put(new THREE.CylinderGeometry(1.03, 1.03, 0.12, 32, 1, true), M.warmGlow, V(x, 0.62, z), 0, null, { cast: false });
  batch.add(cyl(0.06, 0.06, 2.0, x, 1.08, z, 10), M.chrome);
  batch.put(lathe([[0, 0.3], [1.4, 0.1], [2.25, -0.08], [2.32, -0.16], [2.2, -0.19], [1.4, -0.05], [0, 0.06]].reverse(), 40), M.stoneUpper, V(x, 3.1, z));
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2, rib = box(0.06, 0.05, 2.2);
    rib.rotateX(Math.atan2(0.38, 2.2)); rib.translate(0, 0.14, 1.12);
    batch.put(rib, M.chrome, V(x, 3.1, z), a, null, { cast: false });
  }
  batch.put(new THREE.SphereGeometry(0.13, 12, 8), M.gold, V(x, 3.45, z), 0, null, { cast: false });
  batch.put(new THREE.CircleGeometry(0.5, 24).rotateX(Math.PI / 2), M.warmGlow, V(x, 3.1, z), 0, null, { cast: false });
  batch.put(new THREE.TorusGeometry(2.28, 0.045, 6, 48).rotateX(Math.PI / 2), M.gold, V(x, 2.98, z), 0, null, { cast: false });
  batch.put(new THREE.TorusGeometry(2.15, 0.025, 6, 48).rotateX(Math.PI / 2), M.warmGlow, V(x, 2.95, z), 0, null, { cast: false });
  // menu board, facing the camera side of the counter
  const menu = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.42), createHoloMaterial(HOLO_ART.sign('CAFÉ  •  OIL  •  TEA', 1024, 330), { bright: 2.4, alpha: 0.9, time: ctx.time }));
  const [mx, mz] = at(0, 1.18);
  menu.position.set(mx, 1.5, mz); menu.rotation.y = rot; scene.add(menu); twoSided(menu);
  col.circle(x, z, 1.15, 'cafe');
  const seats = [];
  for (const side of [-1, 1]) {
    const [tx, tz] = at(side * 2.9, 0.9);
    batch.put(lathe([[0, 0], [0.28, 0], [0.28, 0.03], [0.05, 0.08], [0.04, 0.7], [0.46, 0.72], [0.46, 0.76], [0, 0.76]], 24), M.chrome, V(tx, 0, tz));
    batch.put(new THREE.CylinderGeometry(0.45, 0.45, 0.02, 24), M.stoneUpper, V(tx, 0.77, tz), 0, null, { cast: false });
    col.circle(tx, tz, 0.5, 'table');
    for (const a of [0, Math.PI]) {
      const ya = rot + side * Math.PI / 2 + a;
      const sx = tx - Math.sin(ya) * 0.78, sz = tz - Math.cos(ya) * 0.78;
      batch.put(lathe([[0, 0], [0.2, 0], [0.2, 0.02], [0.03, 0.06], [0.03, SEAT_TOP - 0.06], [0.22, SEAT_TOP - 0.05], [0.22, SEAT_TOP], [0, SEAT_TOP]], 16), M.darkMetal, V(sx, 0, sz));
      seats.push([sx, sz, ya]);
    }
  }
  ctx.gather.push({ x: seats[0][0], z: seats[0][1], kind: 'sit', seats: seats.slice(0, 2) });
  ctx.gather.push({ x: seats[2][0], z: seats[2][1], kind: 'sit', seats: seats.slice(2, 4) });
  const [fx, fz] = at(0, 2.2);
  ctx.gather.push({ x: fx, z: fz, kind: 'talk' });
}

export function bollard(ctx, x, z) {
  const { batch, M, col } = ctx;
  batch.add(lathe([[0, 0], [0.16, 0], [0.16, 0.05], [0.11, 0.1], [0.1, 0.78], [0.12, 0.82], [0, 0.84]], 12), M.chrome, { matrix: new THREE.Matrix4().makeTranslation(x, 0, z), cast: false });
  batch.put(new THREE.CylinderGeometry(0.105, 0.105, 0.05, 12, 1, true), M.blueGlow, V(x, 0.7, z), 0, null, { cast: false });
  col.circle(x, z, 0.18, 'bollard');
}

// Double-sided street totems; all panels share one poster atlas → one draw call.
export function totems(ctx, list) {
  const { batch, M, col, scene } = ctx;
  const P = HOLO_ART.posters();
  const W = 1.15, H = 2.3, Y0 = 0.42;
  const pos = [], uv = [], idx = [];
  const quad = (cx, cz, rot, face, poster) => {
    const c = Math.cos(rot), s = Math.sin(rot), n = pos.length / 3;
    const u0 = poster / P.count, u1 = (poster + 1) / P.count;
    const off = 0.035 * face;
    for (const [lx, ly, tu, tv] of [[-W / 2, 0, 0, 0], [W / 2, 0, 1, 0], [W / 2, H, 1, 1], [-W / 2, H, 0, 1]]) {
      const qx = lx * face;
      pos.push(cx + qx * c + off * s, Y0 + ly, cz - qx * s + off * c);
      uv.push(u0 + (u1 - u0) * tu, tv);
    }
    idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
  };
  list.forEach(([x, z, rot, a, b], i) => {
    const c = Math.cos(rot), s = Math.sin(rot);
    batch.put(lathe([[0, 0], [0.75, 0], [0.75, 0.06], [0.62, 0.14], [0.55, 0.3], [0, 0.3]], 4).rotateY(Math.PI / 4).scale(1, 1, 0.32), M.darkMetal, V(x, 0, z), rot);
    for (const k of [-1, 1]) batch.put(box(0.07, H + 0.3, 0.12), M.chrome, V(x + k * (W / 2 + 0.05) * c, Y0 + H / 2 - 0.1, z - k * (W / 2 + 0.05) * s), rot);
    batch.put(box(W + 0.26, 0.07, 0.16), M.gold, V(x, Y0 + H + 0.08, z), rot);
    batch.put(box(W + 0.1, 0.05, 0.1), M.blueGlow, V(x, Y0 - 0.06, z), rot, null, { cast: false });
    quad(x, z, rot, 1, a); quad(x, z, rot, -1, b);
    col.box(x, z, W / 2 + 0.15, 0.25, rot, 'totem');
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const mat = createHoloMaterial(P.canvas, { bright: 2.0, alpha: 0.9, time: ctx.time, cols: P.count, side: THREE.FrontSide });
  const mesh = new THREE.Mesh(g, mat);
  mesh.layers.enable(REFLECT_LAYER);
  scene.add(mesh);
  registerBillboard(ctx, mat, 512, 1024);
}

export function buildFurnish(ctx) {
  ctx.gather ||= [];
  // ad totems flank each avenue where it meets the promenade ring
  const T = [];
  [0, 90, 180, 270].forEach((th, i) => {
    for (const side of [-1, 1]) {
      const [x, z] = polar(23.6, th + side * 11);
      T.push([x, z, th * D2R + side * 0.62, (i + (side > 0 ? 0 : 2)) % 4, (i + (side > 0 ? 1 : 3)) % 4]);
    }
  });
  totems(ctx, T);
  // benches facing the fountain, between the planter arcs
  for (const th of [60, 120, 240, 300]) {
    const [x, z] = polar(18.6, th);
    const seats = bench(ctx, x, z, th * D2R + Math.PI);
    ctx.gather.push({ x, z, kind: 'sit', seats });
    const [tx, tz] = polar(16.8, th + 7);
    ctx.gather.push({ x: tx, z: tz, kind: 'talk' });
  }
  cafe(ctx, ...polar(18.2, 150), 150 * D2R + Math.PI);
  cafe(ctx, ...polar(18.2, 210), 210 * D2R + Math.PI);
  cafe(ctx, ...polar(18.5, 30), 30 * D2R + Math.PI);
  // bollards ring the fountain; gaps on the avenues
  for (let a = 0; a < 360; a += 20) if (a % 90 !== 0) bollard(ctx, ...polar(7.55, a));
  // extra flower beds along the south approach (where a new player first looks)
  for (const sx of [-1, 1]) {
    const x = sx * 6.4, z = 27.2;
    ctx.batch.put(roundedBar(3.4, 1.1, 0.45, 0.15), ctx.M.stoneUpper, V(x, 0, z), 0);
    ctx.batch.put(box(3.3, 0.04, 1.02), ctx.M.gold, V(x, 0.44, z), 0, null, { cast: false });
    addShrubs(ctx.batch, ctx.M, x, 0.45, z, 3.2, 0.95, 0, 70 + sx, 7);
    ctx.col.box(x, z, 1.7, 0.55, 0, 'bed');
  }
}
