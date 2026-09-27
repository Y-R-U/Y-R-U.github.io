import * as THREE from 'three';
import { box, cyl, lathe } from './geo.js';
import { makeCanvas } from './textures.js';
import { createGardenGround } from './vt_ground.js';
import { planter, lamp, kiosk, warehousePad, railing } from './plaza.js';
import { bench } from './furnish.js';
import { locker, relay } from './sites.js';
import { addTree, addShrubs, addVines } from './foliage.js';
import { HOLO_ART, createHoloMaterial, registerBillboard, faceCamera } from './holo.js';
import { createBreakables } from './breakables.js';
import { createWaterMaterial } from './water.js';
import { createSheetMaterial } from '../fx/effects.js';
import { rng } from './textures.js';
import { REFLECT_LAYER } from '../fx/reflection.js';

// Nexus Arcology: interiors, one floor per district id (the lift swaps floors like the relay swaps districts).
//   arcology          floor 0: the great lobby atrium (40 m tall, balconied), office wing W, lab wing E, evidence vault NE
//   arcology_servers  B4: the server hall (instanced rack rows), archive core, evidence locker
// Every wall is a one-sided plane facing into the room, so from the Diablo camera outside/above, near walls and all
// ceilings vanish on their own (back-face culled). Interiors get their own PMREM (ceiling light strips, gold panels)
// instead of the sky, so chrome and gold still have something to mirror.
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// one-sided wall from (x0,z0) to (x1,z1), y0..y1, facing the left of the travel direction
function wall(ctx, mat, x0, z0, x1, z1, y0, y1, opts = {}) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const g = new THREE.PlaneGeometry(len, y1 - y0);
  const rot = Math.atan2(x1 - x0, z1 - z0) - Math.PI / 2;
  g.rotateY(rot); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / 4, uv.getY(i) * (y1 - y0) / 4);
  ctx.batch.add(g, mat, { cast: false, ...opts });
  g.dispose();
}

// Interior environment: a room with rows of bright ceiling strips, warm gold wall panels, blue holo cards, a dark floor.
function interiorEnv(renderer, tier, { strip = [3.2, 3.0, 2.7], wallC = 0.07, floorC = 0.05, gold = [1.6, 1.15, 0.6], holo = [0.3, 0.9, 2.2], dark = false } = {}) {
  const s = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(60, 24, 60), new THREE.MeshBasicMaterial({ color: new THREE.Color(wallC, wallC, wallC * 1.1), side: THREE.BackSide }));
  room.position.y = 8; s.add(room);
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(floorC, floorC, floorC) }));
  fl.position.y = -3.9; s.add(fl);
  const add = (w, h, c, x, y, z, rx = 0, ry = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(...c), side: THREE.DoubleSide })); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); s.add(m); };
  for (let i = -3; i <= 3; i++) add(2, 50, strip, i * 8, 19.8, 0, Math.PI / 2);
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; add(10, 5, dark ? holo : gold, Math.sin(a) * 29.5, 4, Math.cos(a) * 29.5, 0, a); }
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 1.2; add(6, 3, holo, Math.sin(a) * 29.5, 9, Math.cos(a) * 29.5, 0, a); }
  // bright horizon band (balcony lights / lit shopfronts) gives chrome its hot edge
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; add(14, 0.8, dark ? [0.2, 0.6, 1.6] : [2.2, 1.8, 1.3], Math.sin(a) * 29.5, 1.5, Math.cos(a) * 29.5, 0, a); }
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0, 0.1, 200, { size: tier.envSize || 256 });
  pm.dispose();
  s.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  rt.texture.userData.rt = rt;
  return rt.texture;
}

function mask(bounds, paint) {
  const px = 4, W = Math.ceil((bounds.x1 - bounds.x0) * px), H = Math.ceil((bounds.z1 - bounds.z0) * px);
  const c = makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  const P = {
    rect(x0, z0, x1, z1, col) { g.fillStyle = col; g.fillRect((x0 - bounds.x0) * px, (z0 - bounds.z0) * px, (x1 - x0) * px, (z1 - z0) * px); },
    ring(x, z, r0, r1, col) { g.fillStyle = col; g.beginPath(); g.arc((x - bounds.x0) * px, (z - bounds.z0) * px, r1 * px, 0, 7); g.arc((x - bounds.x0) * px, (z - bounds.z0) * px, r0 * px, 0, 7, true); g.fill(); },
    // diagonal checkerboard of s-metre slabs over a rect
    checker(x0, z0, x1, z1, sz, col) {
      g.save(); g.beginPath(); g.rect((x0 - bounds.x0) * px, (z0 - bounds.z0) * px, (x1 - x0) * px, (z1 - z0) * px); g.clip();
      g.translate(((x0 + x1) / 2 - bounds.x0) * px, ((z0 + z1) / 2 - bounds.z0) * px); g.rotate(Math.PI / 4); g.fillStyle = col;
      const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / sz / 2) + 1;
      for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) if ((i + j) & 1) g.fillRect(i * sz * px, j * sz * px, sz * px, sz * px);
      g.restore();
    },
    disc(x, z, r, col) { g.fillStyle = col; g.beginPath(); g.arc((x - bounds.x0) * px, (z - bounds.z0) * px, r * px, 0, 7); g.fill(); },
  };
  paint(P);
  return { canvas: c, x0: bounds.x0, z0: bounds.z0, w: bounds.x1 - bounds.x0, d: bounds.z1 - bounds.z0 };
}

// Lift bank: gold-framed doors in a wall facing +z (or -z), glowing call panel, an interactable that names its target.
function liftBank(ctx, x, z, face, to, label) {
  const { batch, M, scene, col } = ctx;
  const s = face;  // +1 doors face +z
  for (let i = -1.5; i <= 1.5; i++) {
    const dx = x + i * 3.6;
    batch.put(box(3.0, 4.2, 0.3), M.gold, V(dx, 2.1, z), 0, null, { cast: false });
    batch.put(box(2.5, 3.8, 0.34), M.chrome, V(dx, 1.9, z), 0, null, { cast: false });
    batch.put(box(0.04, 3.7, 0.36), M.darkMetal, V(dx, 1.9, z), 0, null, { cast: false });
    batch.put(box(1.6, 0.25, 0.36), M.blueGlow, V(dx, 4.45, z), 0, null, { cast: false });
  }
  const pad = ctx.makePadRing(2.4, [0.9, 0.8, 0.45], true);
  pad.position.set(x, 0.03, z + s * 3.2); scene.add(pad);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.55), createHoloMaterial(HOLO_ART.sign(label.toUpperCase()), { bright: 2.6, alpha: 0.9, time: ctx.time }));
  sign.position.set(x, 5.6, z + s * 0.8); sign.layers.enable(REFLECT_LAYER); scene.add(sign); faceCamera(ctx, sign);
  col.box(x, z, 7.5, 0.5, 0, 'lifts');
  ctx.interactables.push({ id: 'lift', to, label, x, z: z + s * 3.2, r: 3 });
}

// Stacked balcony floors on an atrium wall (visual): slab edge, lit glass shopfront band, glass rail, gold trim.
function balconies(ctx, x0, z0, x1, z1, yStart, yEnd, step = 5) {
  const { M } = ctx;
  const R = rng((x0 * 31 + z0 * 7) | 0), len = Math.hypot(x1 - x0, z1 - z0), dx = (x1 - x0) / len, dz = (z1 - z0) / len;
  const nx = -dz, nz = dx;   // the side the wall faces
  for (let y = yStart; y < yEnd; y += step) {
    // hanging gardens spilling over some balcony runs, darker "closed" bays elsewhere
    for (let s = R() * 8; s < len - 4; s += 7 + R() * 9) {
      const e = Math.min(len - 1, s + 4 + R() * 7), ax = x0 + dx * s + nx * 0.5, az = z0 + dz * s + nz * 0.5, bx = x0 + dx * e + nx * 0.5, bz = z0 + dz * e + nz * 0.5;
      if (R() < 0.55) addVines(ctx.batch, M, ax, az, bx, bz, y + step - 0.9, 2.2 + R() * 2.5, { seed: (s * 13 + y * 7) | 0, side: 1, density: 1.1, bloom: 0.35 });
      else if (R() < 0.5) ctx.batch.put(box(e - s, 1.8, 0.05), M.glassDark, V((ax + bx) / 2 + nx * 0.01, y + 2.1, (az + bz) / 2 + nz * 0.01), Math.atan2(dx, dz) + Math.PI / 2, null, { cast: false });
    }
    wall(ctx, M.shopGlow, x0, z0, x1, z1, y + 0.6, y + step - 1.2);
    wall(ctx, M.stoneUpper, x0, z0, x1, z1, y - 0.8, y + 0.6);
    wall(ctx, M.gold, x0, z0, x1, z1, y + 0.58, y + 0.66);
    wall(ctx, M.glassDark, x0, z0, x1, z1, y + step - 1.2, y + step - 0.8);
  }
}

function lobby(ctx) {
  const { batch, M, col, scene } = ctx;
  const L = ctx.layout, H = 40;
  createGardenGround(ctx, [{ rects: [[-62, 62, -46, 46]], y: 0, reflect: true, ao: true }], mask(L.bounds, (P) => {
    P.rect(-30, -46, 30, 46, '#000');
    P.checker(-17, -44, 17, 13, 2.4, '#00f');
    for (const x of [-26, -17.6, 17.6, 26]) P.rect(x - 0.6, -44, x + 0.6, 16, '#00f');
    P.rect(-30, 14.5, 30, 16.5, '#00f');
    P.disc(0, -14, 11, '#00f'); P.disc(0, -14, 9.6, '#000'); P.ring(0, -14, 7.8, 8.4, '#00f');
    P.rect(-62, -46, -31, 18, '#f00'); P.rect(-60, -44, -33, -38, '#000');
    P.rect(31, -46, 62, 18, '#0f0'); P.rect(44, -46, 62, -32, '#00f');
    P.disc(0, 26, 1.4, '#00f');
  }), { interior: true, stone: [0.8, 0.77, 0.72] });
  // shell: north wall, east/west walls, the south glass front
  const back = M.stoneUpper;
  wall(ctx, back, -62, -46, 62, -46, 0, H);
  wall(ctx, back, -62, 46, -62, -46, 0, H);
  wall(ctx, back, 62, -46, 62, 46, 0, H);
  wall(ctx, M.glassDark, 62, 46, -62, 46, 0, H);
  for (let x = -60; x <= 60; x += 4) batch.put(box(0.18, H, 0.3), M.darkMetal, V(x, H / 2, 45.8), 0, null, { cast: false });
  for (let y = 5; y < H; y += 5) batch.put(box(124, 0.25, 0.3), M.darkMetal, V(0, y, 45.8), 0, null, { cast: false });
  // daylight beyond the glass front
  batch.put(box(124, H, 0.1), M.warmGlow, V(0, H / 2, 47), 0, null, { cast: false, reflect: false, color: new THREE.Color(0.55, 0.52, 0.48) });
  // atrium side walls above the wings: stacked balconies, lit
  balconies(ctx, -30, 18, -30, -46, 5, H);
  balconies(ctx, 30, -46, 30, 18, 5, H);
  balconies(ctx, -62, -45.9, 62, -45.9, 10, H);
  // wing partitions (glass, low) with doorways, and the wing ceilings (face down: invisible from the camera)
  for (const sx of [-30, 30]) {
    const segs = [[-46, -32], [-26, -8], [-2, 18]];
    for (const [a, b] of segs) {
      batch.put(box(0.12, 3.4, b - a), M.glassRail, V(sx, 1.7, (a + b) / 2), 0, null, { cast: false, reflect: false });
      batch.put(box(0.2, 0.12, b - a), M.gold, V(sx, 3.45, (a + b) / 2), 0, null, { cast: false });
      batch.put(box(0.24, 0.3, b - a), M.darkMetal, V(sx, 0.15, (a + b) / 2), 0, null, { cast: false });
      col.box(sx, (a + b) / 2, 0.2, (b - a) / 2, 0, 'partition');
    }
    batch.put(box(0.4, 1.2, 64), M.stoneUpper, V(sx, 4.6, -14), 0, null, { cast: false });
    batch.put(box(0.42, 0.08, 64), M.gold, V(sx, 4.0, -14), 0, null, { cast: false });
  }
  // wing south walls
  for (const [x0, x1] of [[-62, -30], [30, 62]]) {
    batch.put(box(x1 - x0, 5.2, 0.4), M.stoneUpper, V((x0 + x1) / 2, 2.6, 18.2));
    batch.put(box(x1 - x0, 0.08, 0.44), M.gold, V((x0 + x1) / 2, 5.2, 18.2), 0, null, { cast: false });
    col.box((x0 + x1) / 2, 18.2, (x1 - x0) / 2, 0.3, 0, 'wingWall');
  }
  wall(ctx, M.shopGlow, -62, 18.4, -30, 18.4, 0.3, 4.6); wall(ctx, M.shopGlow, 30, 18.4, 62, 18.4, 0.3, 4.6);
  // central fountain: basin, a hovering gold armillary around the Nexus core, water sheet spilling from a floating ring
  const water = new THREE.Mesh(new THREE.CircleGeometry(7.4, 48).rotateX(-Math.PI / 2), createWaterMaterial(ctx, { color: 0x10303c, reflect: true }));
  water.position.set(0, 0.4, -14); water.layers.enable(REFLECT_LAYER); scene.add(water);
  batch.put(lathe([[7.3, 0], [7.9, 0], [8.0, 0.55], [7.7, 0.6], [7.3, 0.45]], 64), M.stoneUpper, V(0, 0, -14));
  batch.put(new THREE.TorusGeometry(7.95, 0.05, 6, 96).rotateX(Math.PI / 2), M.gold, V(0, 0.6, -14), 0, null, { cast: false });
  batch.add(cyl(1.2, 1.6, 0.8, 0, 0.1, -14, 24), M.darkMetal);
  const arm = new THREE.Group();
  for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(3.2 + i * 0.9, 0.1, 10, 96), M.goldSolid); r.rotation.set(0.4 + i * 0.8, i * 0.9, 0); r.castShadow = true; r.layers.enable(REFLECT_LAYER); arm.add(r); }
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 3), M.coreGlow); core.layers.enable(REFLECT_LAYER); arm.add(core);
  arm.position.set(0, 9, -14); scene.add(arm);
  const ring = lathe([[3.0, 0], [3.4, 0], [3.4, 0.3], [3.0, 0.3]], 64);
  batch.put(ring, M.gold, V(0, 5.2, -14), 0, null, { cast: false });
  const bell = [];
  for (let k = 0; k <= 12; k++) { const t = k / 12; bell.push([3.2 + 1.8 * Math.sqrt(t), 5.2 - 4.8 * t]); }
  const bellMesh = new THREE.Mesh(lathe(bell, 64), createSheetMaterial(ctx.time, 1.1));
  bellMesh.renderOrder = 1;
  bellMesh.position.set(0, 0, -14); bellMesh.layers.enable(REFLECT_LAYER); scene.add(bellMesh);
  ctx.updaters.push((dt, t) => { arm.rotation.y = t * 0.1; arm.children[0].rotation.x = t * 0.25; arm.children[1].rotation.z = t * 0.18; core.position.y = Math.sin(t * 1.2) * 0.2; });
  col.circle(0, -14, 8.1, 'fountain');
  // Nexus emblem hanging over the lift bank, holo banners on the balconies
  const em = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), createHoloMaterial(HOLO_ART.wide('NEXUS', 'ONE CITY • ONE MIND', 4, '#0c3a70', false), { bright: 2.2, alpha: 0.95, time: ctx.time }));
  em.position.set(0, 14, -45.5); em.layers.enable(REFLECT_LAYER); scene.add(em);
  registerBillboard(ctx, em.material, 1024, 512);
  let R0;
  for (const sx of [-1, 1]) {
    const bb = new THREE.Mesh(new THREE.PlaneGeometry(16, 8), createHoloMaterial((R0 = HOLO_ART.reel(sx < 0 ? 'brighter' : 'aurelia', 0.5)).canvas, { bright: 2.0, alpha: 0.95, time: ctx.time, reel: { ...R0, hold: 8, phase: sx > 0 ? 2 : 0 } }));
    bb.position.set(sx * 29.6, 20, -14); bb.rotation.y = -sx * Math.PI / 2; bb.layers.enable(REFLECT_LAYER); scene.add(bb);
    registerBillboard(ctx, bb.material, 1024, 512);
  }
  // light shafts from the (unseen) skylight
  ctx.shafts = shafts(ctx, [[-10, -24], [8, -4], [-4, 22]], H);
  // security gate line with turnstiles, reception desk
  for (let x = -28; x <= 28; x += 4) {
    if (Math.abs(x) < 8) continue;
    batch.put(box(0.3, 1.1, 1.6), M.chrome, V(x, 0.55, 15.5), 0, null, { cast: false });
    batch.put(box(0.32, 0.06, 1.62), M.blueGlow, V(x, 1.12, 15.5), 0, null, { cast: false });
    col.box(x, 15.5, 0.2, 0.8, 0, 'gate');
  }
  for (let x = -26; x <= 26; x += 4) if (Math.abs(x) > 8) batch.put(box(3.6, 0.9, 0.06), M.glassRail, V(x + 2 * Math.sign(x) * 0, 0.9, 15.5), 0, null, { cast: false, reflect: false });
  col.box(-18, 15.5, 10, 0.25, 0, 'gateGlass'); col.box(18, 15.5, 10, 0.25, 0, 'gateGlass');
  batch.put(new THREE.CylinderGeometry(6.6, 6.6, 1.1, 40, 1, true, -0.9, 1.8), M.stoneUpper, V(0, 0.55, 30.5), Math.PI, null, { cast: false });
  batch.put(new THREE.CylinderGeometry(6.65, 6.65, 0.08, 40, 1, true, -0.9, 1.8), M.gold, V(0, 1.12, 30.5), Math.PI, null, { cast: false });
  col.arc(0, 30.5, 6.2, 7.0, Math.PI - 0.9, Math.PI + 0.9, 'desk');
  // indoor garden: planters with trees along the atrium sides, benches
  const seat = (x, z, rot) => { const seats = bench(ctx, x, z, rot); ctx.gather.push({ x, z, kind: 'sit', seats }); };
  for (const z of [-36, -24, 4]) for (const sx of [-1, 1]) { planter(ctx, sx * 21, z, 1.8, 6, 0, 700 + z * sx, 1); seat(sx * 18.6, z, sx * Math.PI / 2); }
  for (const [x, z] of [[-20, 30], [20, 30], [-44, 32], [44, 32], [-9, 21], [9, 21], [-26, 22], [26, 22]]) planter(ctx, x, z, 5, 1.8, 0, 750 + x + z, 1);
  for (const [x, z, r] of [[-14, 25, Math.PI / 2], [14, 25, -Math.PI / 2], [-32, 26, Math.PI / 2], [32, 26, -Math.PI / 2]]) seat(x, z, r);
  for (const x of [-38, -30, 30, 38]) lamp(ctx, x, 36);
  kiosk(ctx); warehousePad(ctx); relay(ctx, L.relay.x, L.relay.z);
  liftBank(ctx, 0, -45.2, 1, 'arcology_servers', 'Lift — B4 Server Hall');
  locker(ctx, -40, 42.5, Math.PI); locker(ctx, 38, 42.5, Math.PI);
  offices(ctx); lab(ctx);
}

function shafts(ctx, spots, H) {
  const g = new THREE.CylinderGeometry(2.2, 4.5, H, 20, 1, true);
  g.translate(0, H / 2, 0);
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: ctx.time },
    vertexShader: `varying float vY; varying vec3 vN, vV; void main(){ vY = position.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalMatrix * normal; vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uTime; varying float vY; varying vec3 vN, vV;
      void main(){ float f = abs(dot(normalize(vN), normalize(vV))); float a = pow(f, 2.0) * smoothstep(0.0, 8.0, vY) * smoothstep(${H.toFixed(1)}, ${(H * 0.4).toFixed(1)}, vY) * 0.12;
        a *= 0.8 + 0.2 * sin(uTime * 0.3 + vY * 0.1); gl_FragColor = vec4(vec3(1.0, 0.93, 0.8) * a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const list = [];
  for (const [x, z] of spots) { const s = new THREE.Mesh(g, m); s.position.set(x, 0, z); s.rotation.z = 0.12; s.renderOrder = 3; ctx.scene.add(s); list.push(s); }
  return list;
}

// Office wing (west): carpet, instanced desk rows with lit monitors and chairs, glass meeting room.
function offices(ctx) {
  const { batch, M, col, scene } = ctx;
  const deskG = [box(1.8, 0.06, 0.9, 0, 0.75, 0), box(0.06, 0.72, 0.8, -0.85, 0.36, 0), box(0.06, 0.72, 0.8, 0.85, 0.36, 0), box(1.7, 0.4, 0.04, 0, 0.95, -0.44)];
  const mon = box(0.7, 0.42, 0.04, 0, 1.15, -0.2);
  const chair = [cyl(0.25, 0.25, 0.08, 0, 0.45, 0.6, 12), box(0.46, 0.5, 0.06, 0, 0.75, 0.85), cyl(0.03, 0.03, 0.4, 0, 0.05, 0.6, 6)];
  const spots = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) spots.push([-56 + c * 3.6, -40 + r * 6.5]);
  for (const [x, z] of spots) {
    for (const g of deskG) batch.put(g, M.stoneUpper, V(x, 0, z), 0, null, { cast: false });
    batch.put(mon, M.blueGlow, V(x, 0, z), 0, null, { cast: false });
    for (const g of chair) batch.put(g, M.darkMetal, V(x, 0, z), 0, null, { cast: false });
  }
  for (let r = 0; r < 4; r++) col.box(-47, -40 + r * 6.5 + 0.1, 11, 0.9, 0, 'desks');
  // glass meeting room
  batch.put(box(12, 3, 0.08), M.glassRail, V(-44, 1.5, 0), 0, null, { cast: false, reflect: false });
  batch.put(box(0.08, 3, 10), M.glassRail, V(-38, 1.5, 5), 0, null, { cast: false, reflect: false });
  batch.put(box(5, 0.08, 2), M.darkMetal, V(-46, 0.75, 7), 0, null, { cast: false });
  col.box(-46, 7, 2.6, 1.1, 0, 'table');
  col.box(-44, 0, 6, 0.1, 0, 'glass'); col.box(-38, 6.5, 0.1, 3.5, 0, 'glass');
  for (const [x, z] of [[-58, 14], [-34, 14]]) addTree(batch, M, x, 0, z, (x * 3) | 0, 0.8);
  ctx.gather.push({ x: -50, z: -20, kind: 'talk' }, { x: -40, z: 10, kind: 'talk' });
}

// Lab wing (east): steel grate floor, specimen tubes, holo table; evidence vault in the NE corner.
function lab(ctx) {
  const { batch, M, col, scene } = ctx;
  for (let i = 0; i < 6; i++) {
    const x = 36 + (i % 3) * 7, z = -22 + Math.floor(i / 3) * 12;
    batch.put(box(4.8, 0.95, 1.4), M.stoneUpper, V(x, 0.47, z), 0, null, { cast: false });
    batch.put(box(4.9, 0.05, 1.5), M.gold, V(x, 0.97, z), 0, null, { cast: false });
    batch.put(box(4.6, 0.04, 0.3), M.blueGlow, V(x, 1.0, z + 0.5), 0, null, { cast: false });
    col.box(x, z, 2.5, 0.8, 0, 'bench');
  }
  for (let i = 0; i < 5; i++) {
    const x = 34 + i * 5.5, z = 12;
    batch.add(cyl(0.7, 0.7, 0.3, x, 0, z, 20), M.darkMetal);
    batch.add(cyl(0.6, 0.6, 2.6, x, 0.3, z, 20), M.glassRail, { cast: false, reflect: false });
    batch.add(cyl(0.2, 0.2, 2.4, x, 0.4, z, 12), M.blueGlow, { cast: false });
    batch.add(cyl(0.7, 0.7, 0.3, x, 2.9, z, 20), M.darkMetal);
    col.circle(x, z, 0.75, 'tube');
  }
  const table = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), createHoloMaterial(HOLO_ART.ad('ASCENSION', 'PROJECT ARCHIVE • SEALED', 8), { bright: 2.2, alpha: 0.8, time: ctx.time }));
  table.position.set(46, 2.2, -6); table.layers.enable(REFLECT_LAYER); scene.add(table); faceCamera(ctx, table);
  batch.add(cyl(1.6, 1.8, 0.9, 46, 0, -6, 24), M.darkMetal);
  batch.put(new THREE.TorusGeometry(1.6, 0.05, 6, 40).rotateX(Math.PI / 2), M.blueGlow, V(46, 0.92, -6), 0, null, { cast: false });
  col.circle(46, -6, 1.9, 'holoTable');
  vault(ctx, 44, 62, -46, -32);
}

// Evidence vault: steel walls, a round gold door rolled aside, lit shelves of sealed cases.
function vault(ctx, x0, x1, z0, z1) {
  const { batch, M, col } = ctx;
  const cz = (z0 + z1) / 2;
  batch.put(box(x1 - x0, 5, 0.6), M.stoneUpper, V((x0 + x1) / 2, 2.5, z1));
  batch.put(box(0.6, 5, cz - 2.6 - z0), M.stoneUpper, V(x0, 2.5, (z0 + cz - 2.6) / 2));
  batch.put(box(0.6, 5, z1 - cz - 2.6), M.stoneUpper, V(x0, 2.5, (cz + 2.6 + z1) / 2));
  for (const y of [0.9, 2.5, 4.1]) batch.put(box(x1 - x0, 0.06, 0.64), M.blueGlow, V((x0 + x1) / 2, y, z1), 0, null, { cast: false });
  batch.put(box(0.64, 0.12, z1 - z0), M.gold, V(x0, 5, cz), 0, null, { cast: false });
  batch.put(box(x1 - x0, 0.12, 0.64), M.gold, V((x0 + x1) / 2, 5, z1), 0, null, { cast: false });
  col.box((x0 + x1) / 2, z1, (x1 - x0) / 2, 0.35, 0, 'vault');
  col.box(x0, (z0 + cz - 2.6) / 2, 0.35, (cz - 2.6 - z0) / 2, 0, 'vault');
  col.box(x0, (cz + 2.6 + z1) / 2, 0.35, (z1 - cz - 2.6) / 2, 0, 'vault');
  // round door, rolled open against the outside wall
  const door = new THREE.CylinderGeometry(2.4, 2.4, 0.7, 40); door.rotateZ(Math.PI / 2);
  batch.put(door, M.chrome, V(x0 - 0.7, 2.5, cz + 4.4));
  batch.put(new THREE.TorusGeometry(2.4, 0.16, 8, 48).rotateY(Math.PI / 2), M.gold, V(x0 - 1.08, 2.5, cz + 4.4));
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; batch.put(box(0.2, 1.4, 0.2), M.gold, V(x0 - 1.1, 2.5 + Math.sin(a) * 0.9, cz + 4.4 + Math.cos(a) * 0.9), 0, null, { cast: false }); }
  batch.put(new THREE.TorusGeometry(2.55, 0.25, 8, 48).rotateY(Math.PI / 2), M.gold, V(x0 - 0.3, 2.5, cz));
  col.circle(x0 - 0.7, cz + 4.4, 1.0, 'vaultDoor');
  for (let z = z0 + 1.5; z < z1 - 1; z += 3.2) {
    batch.put(box(1.2, 3.6, 2.6), M.darkMetal, V(x1 - 1, 1.8, z), 0, null, { cast: false });
    for (let y = 0.6; y < 3.4; y += 0.9) batch.put(box(1.0, 0.05, 2.4), M.blueGlow, V(x1 - 1.62, y, z), 0, null, { cast: false });
    col.box(x1 - 1, z, 0.7, 1.4, 0, 'shelf');
  }
  const pl = new THREE.Mesh(new THREE.BoxGeometry(1, 1.1, 0.8), M.goldSolid); pl.position.set((x0 + x1) / 2, 0.55, cz); pl.castShadow = true; ctx.scene.add(pl);
  col.box((x0 + x1) / 2, cz, 0.6, 0.5, 0, 'plinth');
}

function buildLobby(ctx) {
  ctx.gather ||= [];
  lobby(ctx);
  const L = ctx.layout;
  ctx.breakables = createBreakables(ctx, [
    { kind: 'vending', x: -60.8, z: 24, rot: Math.PI / 2 }, { kind: 'vending', x: -60.8, z: 28, rot: Math.PI / 2 }, { kind: 'vending', x: 60.8, z: 26, rot: -Math.PI / 2 },
    { kind: 'holo', x: -10, z: 36, rot: 0.2 }, { kind: 'holo', x: 10, z: 36, rot: -0.2 }, { kind: 'holo', x: -24, z: -10, rot: 0.3 }, { kind: 'holo', x: 24, z: -30, rot: -0.3 },
    { kind: 'crate', x: 58, z: 8, rot: 0.2 }, { kind: 'crate', x: 58.4, z: 10.5, stack: 1 }, { kind: 'crate', x: 34, z: -42, rot: 0.3 },
  ]);
  const S = [
    ['ax_lobby_entrance', 'lobby', 0, 38, 6], ['ax_lobby_atrium', 'lobby', 0, 2, 8], ['ax_lobby_fountain', 'fountain', 0, -14, 9],
    ['ax_lobby_east', 'plaza', 22, 28, 5], ['ax_lobby_west', 'plaza', -22, 28, 5],
    ['ax_interior_offices', 'interior', -47, -20, 8], ['ax_interior_meeting', 'interior', -46, 6, 3], ['ax_interior_lab', 'interior', 43, -16, 7], ['ax_interior_tubes', 'interior', 45, 9, 4],
    ['ax_vault_evidence', 'vault', 53, -39, 4],
    ['ax_locker_w', 'locker', -40, 41, 2.5], ['ax_locker_e', 'locker', 38, 41, 2.5],
    ['ax_relay', 'relay', L.relay.x, L.relay.z - 2.8, 2.5], ['ax_lift', 'lift', 0, -42, 3],
    ['ax_spawn_lift', 'spawn_edge', 6, -41, 3], ['ax_spawn_west', 'spawn_edge', -58, -2, 3], ['ax_spawn_east', 'spawn_edge', 58, -24, 3], ['ax_spawn_south', 'spawn_edge', -30, 42, 3],
    ['ax_vantage_desk', 'vantage', 0, 26, 3], ['ax_hide_meeting', 'hide', -40, 2, 2], ['ax_hide_tubes', 'hide', 58, 14, 2], ['ax_hide_planter', 'hide', -21, -30, 1.5], ['ax_hide_vault', 'hide', 42.5, -28, 2],
    ['ax_npc_reception', 'npc', 0, 34, 1.5], ['ax_npc_offices', 'npc', -34, -30, 1.5], ['ax_npc_lab', 'npc', 38, -6, 1.5], ['ax_npc_fountain', 'npc', 9.5, -8, 1.5],
    ['ax_terminal_offices', 'terminal', -56, -40, 2], ['ax_terminal_lab', 'terminal', 46, -6, 2.5],
    ['ax_contract_terminal', 'terminal', L.kiosk.x, L.kiosk.z, 3], ['ax_warehouse_link', 'link_pad', L.pad.x, L.pad.z, 2.6],
  ];
  ctx.sites = S.map(([id, tag, x, z, r]) => ({ id, tag, x, z, r, y: 0, district: 'arcology', indoor: true }));
}

// ---------------- B4 server hall ----------------
function serverHall(ctx) {
  const { batch, M, col, scene } = ctx;
  const L = ctx.layout, H = 9;
  createGardenGround(ctx, [{ rects: [[-40, 40, -46, 40]], y: 0, reflect: true, ao: true }], mask(L.bounds, (P) => {
    P.rect(-40, -46, 40, 40, '#00f');
    for (let x = -34; x <= 34; x += 8) P.rect(x - 2, -32, x + 2, 22, '#0f0');
    P.disc(0, -38, 6, '#000'); P.ring(0, -38, 6, 6.6, '#00f');
    P.rect(-6, 26, 6, 40, '#000');
  }), { interior: true, stone: [0.62, 0.66, 0.72] });
  wall(ctx, M.darkMetal, -40, -46, 40, -46, 0, H);
  wall(ctx, M.darkMetal, -40, 40, -40, -46, 0, H);
  wall(ctx, M.darkMetal, 40, -46, 40, 40, 0, H);
  wall(ctx, M.darkMetal, 40, 40, -40, 40, 0, H);
  for (const [x0, z0, x1, z1] of [[-40, -45.9, 40, -45.9], [-39.9, 40, -39.9, -46], [39.9, -46, 39.9, 40], [40, 39.9, -40, 39.9]]) {
    wall(ctx, M.blueGlow, x0, z0, x1, z1, 3.0, 3.08); wall(ctx, M.blueGlow, x0, z0, x1, z1, 6.0, 6.08);
  }
  // rack rows: one instanced mesh per part (body, LED face), rows along Z with a cross aisle
  const rack = new THREE.BoxGeometry(1.2, 2.6, 1.9).translate(0, 1.3, 0);
  const face = new THREE.PlaneGeometry(1.0, 2.2).translate(0, 1.3, 0);
  const pos = [];
  for (let x = -30; x <= 30; x += 8) {
    if (Math.abs(x) < 3) continue;
    for (const side of [-1.35, 1.35]) for (let z = -30; z <= 20; z += 2) {
      if (z > -8 && z < -3) continue;
      pos.push([x + side, z, side > 0 ? Math.PI / 2 : -Math.PI / 2]);
    }
    col.box(x, -19.5, 2.1, 11.5, 0, 'racks'); col.box(x, 9, 2.1, 12, 0, 'racks');
  }
  const body = new THREE.InstancedMesh(rack, new THREE.MeshStandardMaterial({ color: 0x4a525e, metalness: 0.9, roughness: 0.22, envMapIntensity: 1.4 }), pos.length);
  const leds = new THREE.InstancedMesh(face, ledMaterial(ctx), pos.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), yA = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  pos.forEach(([x, z, r], i) => {
    body.setMatrixAt(i, m4.compose(V(x, 0, z), q.setFromAxisAngle(yA, r), one));
    const off = V(Math.sin(r) * 0.96, 0, Math.cos(r) * 0.96);
    leds.setMatrixAt(i, m4.compose(V(x + off.x, 0, z + off.z), q.setFromAxisAngle(yA, r), one));
  });
  body.castShadow = true; body.receiveShadow = true; body.name = 'racks'; leds.name = 'rackLeds';
  body.layers.enable(REFLECT_LAYER); leds.layers.enable(REFLECT_LAYER);
  body.computeBoundingSphere(); leds.computeBoundingSphere();
  scene.add(body, leds);
  // overhead cable trays per row
  for (let x = -30; x <= 30; x += 8) if (Math.abs(x) > 3) {
    batch.put(box(3.4, 0.12, 52), M.darkMetal, V(x, 3.6, -5), 0, null, { cast: false });
    for (const sz of [-19, 9]) for (const sx of [-1.35, 1.35]) batch.put(box(0.08, 0.04, 22), M.blueGlow, V(x + sx, 2.62, sz), 0, null, { cast: false });
  }
  // archive core
  batch.put(lathe([[0, 0], [5.4, 0], [5.4, 0.3], [4.2, 0.5], [0, 0.5]], 48), M.darkMetal, V(0, 0, -38));
  const coreM = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(0.4, 0.8, 1.0), emissiveIntensity: 3 });
  const core = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 7, 24, 1, true), coreM); core.position.set(0, 4, -38); core.layers.enable(REFLECT_LAYER); scene.add(core);
  const rings = new THREE.Group();
  for (let i = 0; i < 4; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(2.2 + (i % 2) * 0.5, 0.09, 8, 48), M.goldSolid); r.rotation.x = Math.PI / 2; r.position.y = 1.5 + i * 1.6; rings.add(r); }
  rings.position.set(0, 0, -38); scene.add(rings);
  ctx.updaters.push((dt, t) => { rings.children.forEach((r, i) => { r.position.y = 1.5 + i * 1.6 + Math.sin(t * 0.8 + i) * 0.25; r.rotation.z = t * (i % 2 ? 0.4 : -0.3); }); coreM.emissiveIntensity = 2.6 + Math.sin(t * 2.1) * 0.5; });
  col.circle(0, -38, 4.6, 'core');
  for (const a of [0.6, 2.1, 4.2, 5.4]) { const x = Math.sin(a) * 6.2, z = -38 + Math.cos(a) * 6.2; batch.add(cyl(0.3, 0.4, 1.2, x, 0, z, 12), M.darkMetal); batch.add(cyl(0.18, 0.18, 0.1, x, 1.2, z, 12), M.blueGlow, { cast: false }); col.circle(x, z, 0.45, 'node'); }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 0.6), createHoloMaterial(HOLO_ART.sign('ARCHIVE CORE'), { bright: 2.6, alpha: 0.9, time: ctx.time }));
  sign.position.set(0, 8.3, -38); sign.layers.enable(REFLECT_LAYER); scene.add(sign); faceCamera(ctx, sign);
  // evidence locker (NW corner), lift bank (south), service relay
  vaultCage(ctx, -40, -26, -46, -34);
  liftBank(ctx, 0, 39.4, -1, 'arcology', 'Lift — Lobby');
  relay(ctx, L.relay.x, L.relay.z);
  for (const [x, z] of [[-36, 34], [36, 34]]) { batch.add(cyl(0.5, 0.5, 2.2, x, 0, z, 16), M.darkMetal); batch.add(cyl(0.52, 0.52, 0.1, x, 2.2, z, 16), M.blueGlow, { cast: false }); col.circle(x, z, 0.6, 'coolant'); }
}

function ledMaterial(ctx) {
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
    vertexShader: `varying vec2 vUv; varying float vSeed;
      #include <fog_pars_vertex>
      void main(){ vUv = uv; vSeed = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 3.1; vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uTime; varying vec2 vUv; varying float vSeed;
      #include <fog_pars_fragment>
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        vec2 g = vec2(floor(vUv.x * 8.0), floor(vUv.y * 22.0));
        vec2 f = fract(vec2(vUv.x * 8.0, vUv.y * 22.0));
        float unit = step(0.12, f.y) * step(f.y, 0.88);
        float led = step(0.15, f.x) * step(f.x, 0.45) * step(0.35, f.y) * step(f.y, 0.65);
        float blink = step(0.55, h(g + vec2(floor(uTime * (1.0 + h(g + vSeed) * 5.0)), vSeed)));
        vec3 c = vec3(0.03, 0.035, 0.045) * unit;
        vec3 lc = h(g * 1.3 + vSeed) > 0.9 ? vec3(1.6, 0.5, 0.2) : vec3(0.25, 0.9, 1.8);
        // rack states: most busy, some idle (sparse, dim), a few in amber maintenance mode
        float st = h(vec2(vSeed, 3.7));
        float busy = st < 0.12 ? 0.15 : st < 0.3 ? 0.55 : 1.0;
        if (st > 0.94) lc = vec3(1.8, 0.9, 0.2);
        c += lc * led * blink * 1.6 * busy;
        c += vec3(0.1, 0.3, 0.6) * (1.0 - unit) * 0.4;
        gl_FragColor = vec4(c, 1.0);
        #include <fog_fragment>
      }`,
    fog: true,
  });
  m.uniforms.uTime = ctx.time;
  return m;
}

function vaultCage(ctx, x0, x1, z0, z1) {
  const { batch, M, col } = ctx;
  for (let x = x0 + 0.5; x <= x1; x += 0.6) batch.put(box(0.05, 3.2, 0.05), M.chrome, V(x, 1.6, z1), 0, null, { cast: false, reflect: false });
  for (let z = z0; z <= z1; z += 0.6) batch.put(box(0.05, 3.2, 0.05), M.chrome, V(x1, 1.6, z), 0, null, { cast: false, reflect: false });
  batch.put(box(x1 - x0, 0.1, 0.1), M.gold, V((x0 + x1) / 2, 3.2, z1), 0, null, { cast: false });
  batch.put(box(0.1, 0.1, z1 - z0), M.gold, V(x1, 3.2, (z0 + z1) / 2), 0, null, { cast: false });
  col.box((x0 + x1) / 2 - 1.5, z1, (x1 - x0) / 2 - 1.5, 0.15, 0, 'cage');
  col.box(x1, (z0 + z1) / 2, 0.15, (z1 - z0) / 2, 0, 'cage');
  for (let z = z0 + 1.5; z < z1 - 1; z += 3) { batch.put(box(1.4, 2.8, 2.4), M.darkMetal, V(x0 + 1, 1.4, z)); for (let y = 0.5; y < 2.8; y += 0.8) batch.put(box(0.05, 0.05, 2.2), M.warmGlow, V(x0 + 1.72, y, z), 0, null, { cast: false }); col.box(x0 + 1, z, 0.8, 1.3, 0, 'shelf'); }
}

function buildServers(ctx) {
  ctx.gather ||= [];
  serverHall(ctx);
  const L = ctx.layout;
  ctx.breakables = createBreakables(ctx, [
    { kind: 'crate', x: 34, z: -40, rot: 0.2 }, { kind: 'crate', x: 36.5, z: -41, stack: 1 }, { kind: 'crate', x: -34, z: 28, rot: 0.3 },
    { kind: 'holo', x: -8, z: 30, rot: 0.2 }, { kind: 'holo', x: 8, z: -24, rot: -0.2 }, { kind: 'vending', x: 38.8, z: 20, rot: -Math.PI / 2 },
  ]);
  ctx.gather.push({ x: -8, z: 26, kind: 'talk' }, { x: 10, z: -2, kind: 'talk' }, { x: -18, z: -30, kind: 'talk' });
  const S = [
    ['as_archive_core', 'vault', 0, -38, 6], ['as_evidence_locker', 'vault', -33, -40, 4],
    ['as_interior_rows_w', 'interior', -18, -5.5, 4], ['as_interior_rows_e', 'interior', 18, -5.5, 4], ['as_interior_aisle', 'interior', 0, 6, 4], ['as_interior_north', 'interior', 22, -38, 5],
    ['as_lift', 'lift', 0, 36, 3], ['as_relay', 'relay', L.relay.x, L.relay.z - 2.8, 2.5], ['as_lobby_lifts', 'lobby', 0, 30, 5],
    ['as_spawn_nw', 'spawn_edge', -24, -44, 3], ['as_spawn_ne', 'spawn_edge', 36, -44, 3], ['as_spawn_se', 'spawn_edge', 36, 36, 3], ['as_spawn_sw', 'spawn_edge', -24, 36, 3],
    ['as_hide_racks_w', 'hide', -26, -5, 1.5], ['as_hide_racks_e', 'hide', 26, -5, 1.5], ['as_hide_cage', 'hide', -24, -30, 1.5],
    ['as_vantage_core', 'vantage', 8, -30, 2.5], ['as_terminal_core', 'terminal', 6, -42, 2], ['as_terminal_rows', 'terminal', -22, 24, 2],
    ['as_npc_tech', 'npc', 12, 28, 1.5],
  ];
  ctx.sites = S.map(([id, tag, x, z, r]) => ({ id, tag, x, z, r, y: 0, district: 'arcology_servers', indoor: true }));
}

const LOBBY_LAYOUT = { bounds: { x0: -62, x1: 62, z0: -46, z1: 46 }, spawn: { x: 0, z: 38 }, relay: { x: 24, z: 41 }, kiosk: { x: -12, z: 36, rot: 0.6 }, pad: { x: 12, z: 36 } };
const SERVER_LAYOUT = { bounds: { x0: -40, x1: 40, z0: -46, z1: 40 }, spawn: { x: 0, z: 32 }, relay: { x: -30, z: 30 }, kiosk: { x: -30, z: 20, rot: 0 }, pad: { x: 30, z: 26 } };

export const ARCOLOGY = {
  id: 'arcology', name: 'Nexus Arcology', layout: LOBBY_LAYOUT, bounds: LOBBY_LAYOUT.bounds, build: buildLobby, batchCell: 64, floor: 0,
  crowd: {
    loops: [[[-20, 36], [-24, 20], [-24, -2], [-12, -30], [12, -30], [24, -2], [24, 20], [20, 36], [0, 26]],
      [[-50, -8], [-36, -14], [-40, -30], [-56, -30]], [[40, -2], [52, -30], [36, -30], [34, 4]],
      [[-10, 4], [10, 4], [12, -30], [-12, -30]], [[-44, 28], [-20, 24], [20, 24], [44, 28], [0, 40]]],
    talk: [[-8, 24], [8, 20], [-16, -2], [16, -24], [-46, -24], [40, -28], [-44, 30], [44, 30], [0, 8]],
  },
  env: (r, tier) => interiorEnv(r, tier),
  ambience: {
    interior: true, background: 0x07090c, sunDir: [0.3, 1.0, 0.25],
    sun: [1.0, 0.88, 0.7], sunI: 3.0, hemiSky: 0xffe8c8, hemiGround: 0x2a2420, hemiI: 0.36,
    fog: [0.3, 0.3, 0.32], fogDensity: 0.0015, env: 1.0,
    gain: [1.02, 1.0, 0.96], lift: [0.004, 0.003, 0.0], sat: 1.1, contrast: 1.12,
  },
  spawnPoints: (L) => ({ player: [L.spawn.x, L.spawn.z], kiosk: [L.kiosk.x, L.kiosk.z + 2.5], pad: [L.pad.x, L.pad.z], relay: [L.relay.x, L.relay.z - 2.8], lift: [0, -40.5] }),
};

export const ARCOLOGY_SERVERS = {
  id: 'arcology_servers', name: 'Nexus Arcology — B4 Server Hall', layout: SERVER_LAYOUT, bounds: SERVER_LAYOUT.bounds, build: buildServers, batchCell: 64, floor: -4,
  crowd: {
    loops: [[[0, 30], [0, 6], [-6, -5], [-26, -5], [-34, -20], [-34, 24], [-6, 26]], [[6, 26], [34, 24], [34, -20], [26, -5], [6, -5], [0, -26], [10, -32]]],
    talk: [[-8, 26], [10, -2], [-18, -30], [20, -30]],
  },
  env: (r, tier) => interiorEnv(r, tier, { strip: [2.0, 2.4, 3.0], wallC: 0.06, floorC: 0.03, holo: [0.3, 0.9, 2.4], dark: true }),
  ambience: {
    interior: true, background: 0x020306, sunDir: [0.2, 1.0, 0.35],
    sun: [0.75, 0.88, 1.0], sunI: 1.8, hemiSky: 0x9cc8ff, hemiGround: 0x1a2838, hemiI: 0.55,
    fog: [0.06, 0.1, 0.16], fogDensity: 0.004, env: 1.5,
    gain: [0.96, 1.0, 1.06], lift: [0.0, 0.004, 0.012], sat: 1.12, contrast: 1.16,
  },
  spawnPoints: (L) => ({ player: [L.spawn.x, L.spawn.z], kiosk: [L.kiosk.x, L.kiosk.z + 2.5], pad: [L.pad.x, L.pad.z], relay: [L.relay.x, L.relay.z - 2.8], lift: [0, 34.5] }),
};
