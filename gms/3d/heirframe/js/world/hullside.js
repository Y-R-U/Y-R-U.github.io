import * as THREE from 'three';
import { box, cyl, lathe } from './geo.js';
import { createIndustrialGround, zoneMask } from './ind_ground.js';
import { lightPools, floodMast, shuttle, addContainers, containerBlock } from './p4_props.js';
import { rail, pipe, holoLabel, crateStack, YELLOW, STEEL, GRAPHITE } from './p5_props.js';
import { addSpaceSky, spaceEnv } from './space.js';
import { kiosk, warehousePad } from './plaza.js';
import { relay } from './sites.js';
import { createBreakables } from './breakables.js';
import { HOLO_ART, createHoloMaterial, twoSided } from './holo.js';
import { makeCanvas, canvasTexture, rng } from './textures.js';
import { REFLECT_LAYER } from '../fx/reflection.js';

// Hullside: outside the ark. A maintenance deck of hull plating under black sky and hard sunlight; the hull curves away
// east and west (a 2 km-radius cylinder) and Verdance hangs enormous over the eastern horizon. South = the Firmament airlock
// (arrival from the Spine), a trench of conduits crossed by two bridges, a landing pad with a parked EVA shuttle, the comms
// masts and radiator fins, the Seraph arena, and the docking spur north to the Meridian Wreck (visible far off).
// Low gravity + mag boots: world.district.gravity / magBoots / vacuum.
const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const HULL_R = 2000;
export const SPACE = { sun: new THREE.Vector3(-0.62, 0.42, -0.32).normalize(), planet: new THREE.Vector3(0.8, 0.02, -0.4).normalize(), pr: 0.56 };

export const HS_LAYOUT = {
  bounds: { x0: -46, x1: 46, z0: -100, z1: 92 },
  trench: { x0: -46, x1: 46, z0: 30, z1: 38, depth: 5, bridges: [-20, 22], w: 2 },
  airlock: { x: 0, z: 85 },
  pad: { x: 28, z: 6, r: 11 },
  arena: { x: -2, z: -40, r: 14 },
  spur: { x: 0, z0: -84 },
  spawn: { x: 0, z: 74 },
  relay: { x: -14, z: 78 },
  kiosk: { x: 14, z: 72, rot: -0.5 },
  pad2: { x: -24, z: 62 },
};

// hull plating texture for the far (curved) hull: panel seams, tonal plates, rivet rows, scorch
function hullTexture() {
  const c = makeCanvas(512, 512), g = c.getContext('2d'), R = rng(21);
  g.fillStyle = '#6b6f76'; g.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 64) for (let x = 0; x < 512; x += 128) {
    const o = (y / 64) % 2 ? 64 : 0, v = 90 + R() * 40;
    g.fillStyle = `rgb(${v},${v + 3},${v + 8})`; g.fillRect(x + o, y, 126, 62); g.fillRect(x + o - 512, y, 126, 62);
  }
  g.fillStyle = 'rgba(0,0,0,0.55)';
  for (let y = 0; y < 512; y += 64) g.fillRect(0, y, 512, 2);
  for (let y = 0; y < 512; y += 64) for (let x = 0; x < 512; x += 128) g.fillRect(x + ((y / 64) % 2 ? 64 : 0), y, 2, 64);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  for (let y = 6; y < 512; y += 64) for (let x = 4; x < 512; x += 8) g.fillRect(x, y, 2, 2);
  for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(20,16,14,${0.1 + R() * 0.2})`; g.beginPath(); g.arc(R() * 512, R() * 512, 8 + R() * 40, 0, 7); g.fill(); }
  const t = canvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// the hull beyond the deck: a cylinder of radius HULL_R whose top sits at y≈0, curving away east and west
export function farHull(ctx, { zLen = 3200, arc = 0.22, y = -0.06 } = {}) {
  const tex = ctx.cache.hullTex ||= hullTexture();
  const g = new THREE.CylinderGeometry(HULL_R, HULL_R, zLen, 220, 1, true, Math.PI - arc, 2 * arc);
  g.rotateX(Math.PI / 2); g.translate(0, HULL_R + y, 0);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (2 * arc * HULL_R) / 32, uv.getY(i) * zLen / 32);
  const m = new THREE.MeshStandardMaterial({ map: tex, color: 0xa4a8b0, roughness: 0.55, metalness: 0.55, envMapIntensity: 1.0 });
  m.name = 'farHull';
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true; mesh.name = 'farHull';
  ctx.scene.add(mesh);
  return mesh;
}
export const hullY = (x) => HULL_R - Math.sqrt(HULL_R * HULL_R - x * x);

// The Meridian Wreck as a far silhouette: a broken station ring on a hub, spokes snapped, a few red lights.
export function meridianSilhouette(ctx, x, y, z, s = 1) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x7a7e86, roughness: 0.5, metalness: 0.6, envMapIntensity: 1.0 });
  const lit = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.25, 0.1) });
  for (const [a0, a1] of [[0.2, 1.9], [2.3, 3.4], [3.9, 5.7]]) { const t = new THREE.Mesh(new THREE.TorusGeometry(60 * s, 6 * s, 8, 40, a1 - a0), mat); t.rotation.z = a0; g.add(t); }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(12 * s, 16 * s, 50 * s, 16), mat); hub.rotation.x = Math.PI / 2; g.add(hub);
  for (let i = 0; i < 6; i++) { if (i === 2) continue; const sp = new THREE.Mesh(new THREE.BoxGeometry(4 * s, (i === 4 ? 30 : 48) * s, 3 * s), mat); const a = i / 6 * Math.PI * 2; sp.rotation.z = a; sp.position.set(-Math.sin(a) * 30 * s, Math.cos(a) * 30 * s, 0); g.add(sp); }
  for (let i = 0; i < 7; i++) { const l = new THREE.Mesh(new THREE.SphereGeometry(1.2 * s, 6, 4), lit); const a = i * 0.9; l.position.set(Math.cos(a) * 60 * s, Math.sin(a) * 60 * s, 7 * s); g.add(l); }
  g.position.set(x, y, z); g.rotation.set(0.35, 0.5, 0.1);
  g.traverse((o) => { if (o.isMesh) { ctx.farSky.push(o); o.frustumCulled = true; } });
  ctx.scene.add(g);
  return g;
}

function ground(ctx, L) {
  const T = L.trench, B = L.bounds;
  const mask = zoneMask({ x0: -48, x1: 48, z0: -102, z1: 94 }, (P) => {
    for (const x of [-2.3, 2.1]) P.rect(x, -100, x + 0.2, 70, 'rgb(0,150,0)');                  // mag-rail walkway lanes
    P.rect(-8, 76, 8, 79, 'rgb(0,255,255)');                                                   // hazard apron at the airlock
    for (const sd of [T.z0 - 0.9, T.z1]) P.rect(-46, sd, 46, sd + 0.9, 'rgb(0,255,255)');
    for (const x of T.bridges) P.rect(x - T.w, T.z0, x + T.w, T.z1, '#00f');
    P.ring(L.pad.x, L.pad.z, L.pad.r - 0.8, L.pad.r, 'rgb(0,255,255)'); P.disc(L.pad.x, L.pad.z, L.pad.r - 0.8, '#f00');
    P.ring(L.pad.x, L.pad.z, 4, 4.4, 'rgb(0,150,0)');
    P.ring(L.arena.x, L.arena.z, L.arena.r - 0.3, L.arena.r, 'rgb(0,150,0)');
    P.rect(-3, -100, 3, -84, '#00f');
    for (let z = 60; z > -80; z -= 18) if (z < 26 || z > 42) for (const sd of [-1, 1]) P.line(0, z, sd * 1.6, z + 1.8, 0.45, 'rgb(0,150,0)');   // chevrons up the walkway
    for (const [x, z] of [[-24, 50], [26, -48], [-20, -24], [34, 44]]) { P.frame(x - 4, z - 3, x + 4, z + 3, 0.35, 'rgb(0,150,0)'); P.line(x - 3, z - 2, x + 3, z + 2, 0.35, 'rgb(0,150,0)'); }   // tie-down boxes
    const R = rng(8);
    for (let i = 0; i < 18; i++) { const x = -44 + R() * 88, z = -96 + R() * 186; P.rect(x, z, x + 3 + R() * 6, z + 2 + R() * 4, 'rgb(90,0,0)'); }   // patched plates
  });
  const rects = [[B.x0, B.x1, T.z1, B.z1], [B.x0, B.x1, B.z0, T.z0]];
  for (const x of T.bridges) rects.push([x - T.w, x + T.w, T.z0, T.z1]);
  createIndustrialGround(ctx, [{ rects, y: 0, reflect: false, ao: true }], mask, { slab: 6, tint: [0.36, 0.38, 0.42], wet: 0, rust: 0.12, interior: false, key: 'hs' });
  ctx.col.custom((x, z, r) => {
    if (!(z > T.z0 - r && z < T.z1 + r)) return false;
    for (const b of T.bridges) if (Math.abs(x - b) < T.w - r) return false;
    return true;
  });
  // trench: walls, floor, conduits with glowing couplings, bridge undersides and rails
  const { batch, M, scene } = ctx, D = T.depth, zc = (T.z0 + T.z1) / 2;
  for (const z of [T.z0, T.z1]) batch.put(box(92, D, 0.6), M.stoneUpper, V(0, -D / 2, z + (z === T.z0 ? -0.3 : 0.3)), 0, null, { color: STEEL });
  batch.put(box(92, 0.4, T.z1 - T.z0), M.stoneUpper, V(0, -D, zc), 0, null, { color: GRAPHITE });
  for (const [z, r, c] of [[T.z0 + 1.4, 0.7, STEEL], [T.z0 + 3.2, 0.9, new THREE.Color(0.55, 0.42, 0.25)], [T.z1 - 1.8, 0.6, STEEL]]) {
    const g = new THREE.CylinderGeometry(r, r, 92, 12, 1, true); g.rotateZ(Math.PI / 2);
    batch.put(g, M.stoneUpper, V(0, -D + r + 0.3, z), 0, null, { color: c, cast: false });
    for (let x = -42; x <= 42; x += 12) batch.put(new THREE.CylinderGeometry(r * 1.2, r * 1.2, 0.4, 12).rotateZ(Math.PI / 2), M.blueGlow, V(x + (z % 3), -D + r + 0.3, z), 0, null, { cast: false, color: new THREE.Color(0.3, 0.9, 1.4) });
  }
  for (const x of T.bridges) {
    batch.put(box(2 * T.w, 0.5, T.z1 - T.z0), M.stoneUpper, V(x, -0.3, zc), 0, null, { color: GRAPHITE });
    for (const sd of [-1, 1]) rail(ctx, [[x + sd * T.w, T.z0], [x + sd * T.w, T.z1]]);
  }
  const ed = [B.x0, ...T.bridges.flatMap((b) => [b - T.w, b + T.w]), B.x1];
  for (const z of [T.z0 - 0.2, T.z1 + 0.2]) for (let i = 0; i < ed.length; i += 2) rail(ctx, [[ed[i], z], [ed[i + 1], z]], 0, { posts: 3 });
  // deck edge stiffeners (hide the step down to the curving hull)
  for (const sd of [-1, 1]) batch.put(box(1.2, 1.2, B.z1 - B.z0), M.stoneUpper, V(sd * (B.x1 + 0.6), -0.1, (B.z0 + B.z1) / 2), 0, null, { color: GRAPHITE });
  farHull(ctx);
}

function airlock(ctx, L) {
  const { batch, M, col } = ctx, A = L.airlock;
  batch.put(box(16, 6, 10), M.stoneUpper, V(A.x, 3, A.z + 2), 0, null, { color: new THREE.Color(0.5, 0.52, 0.56) });
  batch.put(box(17, 0.8, 11), M.stoneUpper, V(A.x, 6.2, A.z + 2), 0, null, { color: GRAPHITE });
  batch.put(new THREE.TorusGeometry(2.6, 0.45, 10, 32), M.stoneUpper, V(A.x, 2.9, A.z - 3.05), 0, null, { color: YELLOW });
  batch.put(new THREE.CircleGeometry(2.3, 32).rotateY(Math.PI), M.darkMetal, V(A.x, 2.9, A.z - 3.02), 0, null, { cast: false });
  batch.put(box(0.3, 3.6, 0.1), M.warmGlow, V(A.x, 2.9, A.z - 3.1), 0, null, { cast: false, color: new THREE.Color(1.4, 0.9, 0.4) });
  for (const sd of [-1, 1]) { batch.put(box(0.6, 0.6, 0.6), M.warmGlow, V(A.x + sd * 7.5, 6.9, A.z - 2.8), 0, null, { cast: false, color: new THREE.Color(1.8, 0.3, 0.1) }); pipe(ctx, [A.x + sd * 8.5, 1, A.z - 2], [A.x + sd * 8.5, 1, A.z + 6], 0.6, { color: STEEL }); }
  col.box(A.x, A.z + 2, 8.8, 5.2, 0, 'airlock');
  holoLabel(ctx, 'FIRMAMENT AIRLOCK 3', A.x, 8.2, A.z - 3, 4.4, [1.2, 0.95, 0.7]);
  ctx.interactables.push({ id: 'passage', to: 'spine', label: 'Airlock — back to the Spine', x: A.x, z: A.z - 5, r: 2.8 });
}

function landingPad(ctx, L) {
  const { batch, M, scene, col } = ctx, P = L.pad;
  batch.put(lathe([[0, 0], [P.r + 0.5, 0], [P.r + 0.5, 0.2], [P.r, 0.3], [0, 0.3]], 48), M.stoneUpper, V(P.x, 0, P.z), 0, null, { color: new THREE.Color(0.32, 0.34, 0.38) });
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; batch.put(box(0.4, 0.12, 0.4), M.blueGlow, V(P.x + Math.sin(a) * (P.r - 0.4), 0.36, P.z + Math.cos(a) * (P.r - 0.4)), a, null, { cast: false }); }
  const s = shuttle(0.85); s.position.set(P.x + 1, 1.9, P.z); s.rotation.y = -2.3; scene.add(s);
  col.box(P.x + 1, P.z, 3.5, 8, -2.3, 'shuttle');
  for (const [x, z] of [[P.x - 13, P.z - 10], [P.x + 13, P.z + 11]]) floodMast(ctx, x, z, 11, 0.7);
}

function comms(ctx) {
  const { batch, M, col } = ctx;
  for (const [x, z, h] of [[-32, 6, 26], [-38, -14, 18], [-26, -8, 14]]) {
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) batch.put(box(0.25, h, 0.25), M.stoneUpper, V(x + dx * 0.9, h / 2, z + dz * 0.9), 0, null, { color: STEEL, cast: true });
    for (let y = 3; y < h; y += 3) { batch.put(box(2, 0.14, 0.14), M.stoneUpper, V(x, y, z - 0.9), 0, null, { color: STEEL, cast: false }); batch.put(box(2, 0.14, 0.14), M.stoneUpper, V(x, y, z + 0.9), 0, null, { color: STEEL, cast: false }); }
    batch.put(new THREE.SphereGeometry(0.35, 8, 6), M.warmGlow, V(x, h + 0.4, z), 0, null, { cast: false, color: new THREE.Color(2, 0.2, 0.08) });
    const dish = new THREE.SphereGeometry(3, 20, 8, 0, Math.PI * 2, 0, 0.9); dish.rotateX(-1.1);
    batch.put(dish, M.stoneUpper, V(x, h * 0.7, z - 1.5), 0.6, null, { color: new THREE.Color(0.8, 0.82, 0.86) });
    col.box(x, z, 1.2, 1.2, 0, 'mast');
  }
  // radiator fins: tall panels with warm edges, in rows
  for (let i = 0; i < 6; i++) {
    const x = -42 + i * 4.2, z = -62;
    batch.put(box(0.35, 9, 14), M.stoneUpper, V(x, 4.5, z), 0, null, { color: new THREE.Color(0.32, 0.3, 0.3) });
    batch.put(box(0.4, 0.2, 14), M.warmGlow, V(x, 9, z), 0, null, { cast: false, color: new THREE.Color(1.6, 0.55, 0.2) });
    col.box(x, z, 0.3, 7, 0, 'fin');
  }
  batch.put(box(26, 1.2, 16), M.stoneUpper, V(-31.5, 0.3, -62), 0, null, { color: GRAPHITE });
}

function spur(ctx, L) {
  const { batch, M, col, scene } = ctx, x = L.spur.x, z0 = L.spur.z0;
  // docking spur: a truss gangway running north off the deck toward the wreck
  for (let z = z0; z > -420; z -= 8) {
    const far = z < -100;
    for (const sd of [-1, 1]) batch.put(box(0.3, 3.2, 8), M.stoneUpper, V(x + sd * 2.6, 1.6, z - 4), 0, null, { color: STEEL, cast: !far, cellKey: far ? 'spur' + Math.floor(z / 96) : null });
    batch.put(box(5.6, 0.3, 0.3), M.stoneUpper, V(x, 3.2, z), 0, null, { color: STEEL, cast: false, cellKey: far ? 'spur' + Math.floor(z / 96) : null });
    batch.put(box(0.2, 0.2, 0.2), M.blueGlow, V(x + 2.4, 0.3, z), 0, null, { cast: false, cellKey: far ? 'spur' + Math.floor(z / 96) : null });
    if (far) batch.put(box(5, 0.3, 8), M.stoneUpper, V(x, 0, z - 4), 0, null, { color: GRAPHITE, cast: false, cellKey: 'spur' + Math.floor(z / 96) });
  }
  col.box(x - 2.8, -92, 0.2, 8, 0, 'spurRail'); col.box(x + 2.8, -92, 0.2, 8, 0, 'spurRail');
  const gate = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.1), createHoloMaterial(HOLO_ART.sign('MERIDIAN SPUR  •  DOCK 2'), { bright: 2.6, alpha: 0.9, tint: [0.8, 0.95, 1.2], time: ctx.time }));
  gate.position.set(x, 4.6, -86); gate.layers.enable(REFLECT_LAYER); scene.add(gate); twoSided(gate);
  ctx.interactables.push({ id: 'passage', to: 'meridian', story: 'a5_m1', label: 'Meridian Spur', x, z: -95, r: 3 });
  meridianSilhouette(ctx, 40, 60, -520, 1.3);
}

function farStructures(ctx) {
  // antenna forests and radiator rows along the hull to the horizon (one merged cell per side)
  const { batch, M } = ctx, R = rng(33);
  for (let i = 0; i < 70; i++) {
    const sd = R() < 0.5 ? -1 : 1, x = sd * (70 + R() * 330), z = -700 + R() * 1300, y = -hullY(x);
    const h = 4 + R() * 26, k = R();
    const c = k < 0.5 ? STEEL : GRAPHITE, key = 'far' + sd + Math.floor(z / 400);
    const tilt = Math.asin(x / HULL_R);
    if (k < 0.4) batch.put(box(0.6, h, 0.6), M.stoneUpper, V(x, y + h / 2, z), 0, null, { color: c, cast: false, cellKey: key });
    else if (k < 0.75) { const g = box(0.5, h * 0.4, 10 + R() * 14); g.rotateZ(-tilt); batch.put(g, M.stoneUpper, V(x, y + h * 0.2, z), 0, null, { color: c, cast: false, cellKey: key }); }
    else { const g = box(8 + R() * 10, 3 + R() * 5, 8 + R() * 10); g.rotateZ(-tilt); batch.put(g, M.stoneUpper, V(x, y + 1.5, z), 0, null, { color: c, cast: false, cellKey: key }); }
    if (R() < 0.12) batch.put(new THREE.SphereGeometry(0.5, 6, 4), M.warmGlow, V(x, y + h + 0.5, z), 0, null, { cast: false, color: new THREE.Color(2, 0.2, 0.08), cellKey: key });
  }
}

function buildHullside(ctx, onProgress = () => {}) {
  const L = HS_LAYOUT, { batch, M, col } = ctx;
  ctx.gather ||= [];
  addSpaceSky(ctx, SPACE);
  ground(ctx, L);
  onProgress(0.45, 'Pressurising suits…');
  airlock(ctx, L);
  landingPad(ctx, L);
  comms(ctx);
  spur(ctx, L);
  farStructures(ctx);
  // walkway light studs along the mag-rail lanes
  for (let z = 68; z > -84; z -= 4) for (const x of [-2.6, 2.6]) if (z < L.trench.z0 - 1 || z > L.trench.z1 + 1) batch.put(box(0.25, 0.08, 0.25), M.blueGlow, V(x, 0.04, z), 0, null, { cast: false });
  // the arena: a ring of anchor bollards on the open plating
  const A = L.arena;
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; batch.add(cyl(0.35, 0.45, 0.9, A.x + Math.sin(a) * A.r, 0, A.z + Math.cos(a) * A.r, 10), M.stoneUpper, { color: YELLOW }); }
  // cargo mag-locked to the hull by the pad
  const cont = [];
  containerBlock(ctx, cont, 30, -20, 0.1, 2, 2, (i, j, R) => 1 + (R() < 0.4 ? 1 : 0), 7);
  containerBlock(ctx, cont, 36, 50, -0.2, 1, 3, (i, j, R) => 1 + (R() < 0.5 ? 1 : 0), 9);
  addContainers(ctx, cont);
  for (const [x, z] of [[-30, 48], [20, 60], [-10, -70], [12, -20], [-38, 22]]) crateStack(ctx, x, z, x * 0.07, 1 + ((x * 3) & 1));
  // hull vents and hatches
  const R = rng(4);
  for (let i = 0; i < 14; i++) {
    const x = -40 + R() * 80, z = -80 + R() * 160;
    if (Math.abs(x) < 5 || (z > 26 && z < 42) || Math.hypot(x - L.pad.x, z - L.pad.z) < 14 || Math.hypot(x - A.x, z - A.z) < A.r + 2 || z > 70) continue;
    batch.put(box(2.2, 0.35, 1.4), M.stoneUpper, V(x, 0.17, z), R() * 3, null, { color: GRAPHITE });
    batch.put(box(1.8, 0.05, 1.0), M.warmGlow, V(x, 0.36, z), 0, null, { cast: false, color: new THREE.Color(0.9, 0.35, 0.1) });
  }
  kiosk(ctx); warehousePad(ctx); relay(ctx, L.relay.x, L.relay.z);
  const pools = [[L.pad.x, L.pad.z, 13, [0.9, 0.9, 1.0]], [0, 80, 8, [1.2, 0.8, 0.4]], [-30, 4, 5, [1.4, 0.2, 0.1]]];
  lightPools(ctx, pools);
  ctx.gather.push({ x: 8, z: 60, kind: 'talk' }, { x: 20, z: -4, kind: 'talk' });

  ctx.breakables = createBreakables(ctx, [
    { kind: 'crate', x: 16, z: 54, rot: 0.3 }, { kind: 'crate', x: -26, z: 44 }, { kind: 'crate', x: 22, z: -30, stack: 1 },
    { kind: 'crate', x: -14, z: -72, rot: 0.6 }, { kind: 'crate', x: 40, z: 20 }, { kind: 'crate', x: -40, z: -30, stack: 1 },
    { kind: 'holo', x: -6, z: 10, rot: 0.2 }, { kind: 'holo', x: 8, z: -60, rot: -0.2 },
  ]);
  const T = L.trench;
  const S = [
    ['hs_hull_south', 'hull', 0, 52, 8], ['hs_hull_west', 'hull', -30, 20, 8], ['hs_hull_east', 'hull', 20, -40, 8], ['hs_hull_north', 'hull', 0, -74, 8], ['hs_hull_radiators', 'hull', -30, -50, 6],
    ['hs_landing_pad', 'pad', L.pad.x, L.pad.z, 10],
    ['hs_bridge_w', 'catwalk', T.bridges[0], 34, 2], ['hs_bridge_e', 'catwalk', T.bridges[1], 34, 2],
    ['hs_cargo', 'warehouse', 24, -20, 5], ['hs_comms', 'hull', -32, -2, 5],
    ['hs_arena', 'arena', A.x, A.z, A.r], ['hs_spur', 'dock', 0, -92, 3], ['hs_airlock', 'lobby', 0, 78, 3],
    ['hs_relay', 'relay', L.relay.x, L.relay.z - 2.8, 2.5],
    ['hs_spawn_sw', 'spawn_edge', -43, 60, 3], ['hs_spawn_se', 'spawn_edge', 43, 70, 3], ['hs_spawn_nw', 'spawn_edge', -43, -90, 3], ['hs_spawn_ne', 'spawn_edge', 43, -80, 3],
    ['hs_vantage_fins', 'vantage', -30, -52, 2.5], ['hs_vantage_pad', 'vantage', 40, 6, 2.5],
    ['hs_hide_cargo', 'hide', 36, -24, 1.5], ['hs_hide_fins', 'hide', -34, -54, 1.5], ['hs_hide_mast', 'hide', -40, -10, 1.5], ['hs_hide_airlock', 'hide', 10, 88, 1.5],
    ['hs_npc_jun', 'npc', 8, 58, 1.5], ['hs_npc_team', 'npc', 12, 62, 1.5], ['hs_npc_pad', 'npc', 20, 0, 1.5],
    ['hs_contract_terminal', 'terminal', L.kiosk.x, L.kiosk.z, 3], ['hs_warehouse_link', 'link_pad', L.pad2.x, L.pad2.z, 2.6],
  ];
  ctx.sites = S.map(([id, tag, x, z, r]) => ({ id, tag, x, z, r, y: col.groundAt(x, z), district: 'hullside', indoor: false }));
}

export const HULLSIDE = {
  id: 'hullside', name: 'Hullside', layout: { ...HS_LAYOUT, pad: HS_LAYOUT.pad2, landing: HS_LAYOUT.pad }, bounds: HS_LAYOUT.bounds, build: buildHullside,
  crowd: { loops: [[[0, 70], [0, 60]]], talk: [], count: 0 }, farCrowd: 0, adCount: 0, adOrigins: [], batchCell: 96, mirror: false,
  gravity: 0.35, magBoots: true, vacuum: true,
  env: (r, tier) => spaceEnv(r, tier, SPACE, [[[1.6, 1.6, 1.7], -30, 4, 20, 10, 6, 1.0], [[0.4, 0.9, 1.4], 26, 1, -8, 6, 2, -1.0]]),
  ambience: {
    interior: true, background: 0x000000, sunDir: SPACE.sun.toArray(),
    sun: [1.0, 0.97, 0.92], sunI: 3.3, hemiSky: 0x3a6a70, hemiGround: 0x0a0c10, hemiI: 0.35,
    fog: [0.0, 0.0, 0.0], fogDensity: 0.00005, env: 0.9,
    gain: [1.0, 1.0, 1.02], lift: [0.0, 0.002, 0.006], sat: 1.1, contrast: 1.2,
  },
  spawnPoints: (L) => ({ player: [L.spawn.x, L.spawn.z], kiosk: [L.kiosk.x, L.kiosk.z + 2.5], pad: [L.pad.x, L.pad.z], relay: [L.relay.x, L.relay.z - 2.8], airlock: [L.airlock.x, L.airlock.z - 6], spur: [0, -90], arena: [L.arena.x, L.arena.z + 8] }),
};
