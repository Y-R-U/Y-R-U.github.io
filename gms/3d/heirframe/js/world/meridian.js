import * as THREE from 'three';
import { box, cyl, lathe } from './geo.js';
import { createIndustrialGround, zoneMask } from './ind_ground.js';
import { lightPools } from './p4_props.js';
import { rail, pipe, holoLabel, crateStack, consoleDesk, driftDebris, iceMaterial, blastDoor, STEEL, GRAPHITE, YELLOW } from './p5_props.js';
import { addSpaceSky, spaceEnv } from './space.js';
import { SPACE, farHull, meridianSilhouette } from './hullside.js';
import { kiosk, warehousePad } from './plaza.js';
import { relay } from './sites.js';
import { createBreakables } from './breakables.js';
import { rng } from './textures.js';
import { createRobot } from '../actors/robots.js';

// Meridian Wreck: the Landfall-prep station on the hull, blown open in the Sundering 22 years ago. The roof is gone over
// most of the deck (black sky, Verdance, debris tumbling in zero-g); walls stand in broken stumps rimed with frost; red
// emergency lamps still burn. South = the docking collar (from Hullside's spur). West = the memorial hall (frosted steles,
// frozen frames at attention). Centre = the concourse and the breach, a hole torn through the deck with a broken catwalk
// across it. North-west = Lyra's lab (the Heir Core), north-centre = the door Tomas's frame still holds, north-east =
// the comms mast (A5-M3), with Captain Elena's log terminal in the command room.
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const FROST = new THREE.Color(0.62, 0.7, 0.78);

export const MR_LAYOUT = {
  bounds: { x0: -50, x1: 50, z0: -95, z1: 90 },
  breach: { x: 22, z: 4, r: 13 },
  bridge: { z: 4, w: 1.6 },
  lab: { x0: -46, x1: -18, z0: -92, z1: -60 },
  memorial: { x0: -48, x1: -20, z0: -30, z1: 30 },
  command: { x0: 18, x1: 46, z0: -92, z1: -66 },
  mast: { x: 34, z: -40 },
  tomasDoor: { x: -2, z: -58 },
  spawn: { x: 0, z: 74 },
  relay: { x: -12, z: 80 },
  kiosk: { x: 12, z: 76, rot: -0.5 },
  pad: { x: -16, z: 64 },
  core: { x: -32, z: -80 },
};

function ground(ctx, L) {
  const B = L.bounds, K = L.breach;
  const mask = zoneMask({ x0: -52, x1: 52, z0: -97, z1: 92 }, (P) => {
    P.rect(-50, 56, 50, 90, '#f00');                                              // docking collar deck: steel
    P.ring(0, 78, 9, 9.6, 'rgb(0,255,255)');
    P.rect(L.lab.x0, L.lab.z0, L.lab.x1, L.lab.z1, 'rgb(0,0,255)');
    P.rect(-4, -56, 4, 56, '#f00');                                                // concourse deck plates
    P.rect(L.command.x0, L.command.z0, L.command.x1, L.command.z1, '#f00');
    P.ring(K.x, K.z, K.r, K.r + 1, 'rgb(0,255,255)');
    P.disc(L.mast.x, L.mast.z, 8, '#f00');
    const R = rng(15);
    for (let i = 0; i < 26; i++) { const x = -48 + R() * 96, z = -90 + R() * 176; P.disc(x, z, 1 + R() * 3, 'rgb(70,0,0)'); }   // scorch
  });
  createIndustrialGround(ctx, [{ rects: [[B.x0, B.x1, B.z0, B.z1]], y: 0, reflect: false, ao: true }], mask, { slab: 3, tint: [0.26, 0.27, 0.3], wet: 0, rust: 0.3, interior: false, key: 'mr', holes: [[K.x, K.z, K.r]] });
  // the breach: a torn hole with a broken catwalk across it
  const bw = L.bridge.w;
  ctx.col.custom((x, z, r) => {
    const d = Math.hypot(x - K.x, z - K.z);
    if (d > K.r + r) return false;
    return !(Math.abs(z - L.bridge.z) < bw - r && x > K.x - K.r - 2 && x < K.x + K.r + 2);
  });
  const { batch, M, scene } = ctx;
  // a dark pit in the hole, jagged plate teeth round the rim, dangling beams
  const pit = new THREE.Mesh(new THREE.CylinderGeometry(K.r, K.r * 0.6, 18, 28, 1, true), new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.7, metalness: 0.6, side: THREE.BackSide }));
  pit.position.set(K.x, -9, K.z); scene.add(pit);
  const floorD = new THREE.Mesh(new THREE.CircleGeometry(K.r * 0.62, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.08, 0.01, 0.005) }));
  floorD.position.set(K.x, -17.9, K.z); scene.add(floorD);
  const R = rng(3);
  for (let i = 0; i < 28; i++) {
    const a = i / 28 * Math.PI * 2 + R() * 0.1, len = 1.5 + R() * 3.5;
    const g = box(1.8 + R() * 2, 0.18, len); g.translate(0, 0, -len / 2); g.rotateX(-0.3 - R() * 0.9);
    batch.put(g, M.stoneUpper, V(K.x + Math.sin(a) * (K.r + 0.8), 0, K.z + Math.cos(a) * (K.r + 0.8)), a, null, { color: new THREE.Color(0.3, 0.3, 0.33), cast: false });
  }
  for (let i = 0; i < 6; i++) { const a = R() * 6.28, g = box(0.4, 9 + R() * 6, 0.4); g.rotateZ((R() - 0.5) * 0.8); batch.put(g, M.stoneUpper, V(K.x + Math.sin(a) * K.r * 0.8, -6, K.z + Math.cos(a) * K.r * 0.8), 0, null, { color: GRAPHITE, cast: false }); }
  // broken catwalk across: a straight grated deck with a kinked, sagging rail
  batch.put(box(2 * K.r + 4, 0.3, 2 * bw), M.stoneUpper, V(K.x, -0.15, L.bridge.z), 0, null, { color: new THREE.Color(0.28, 0.29, 0.32) });
  for (const sd of [-1, 1]) rail(ctx, [[K.x - K.r - 1, L.bridge.z + sd * bw], [K.x - 3, L.bridge.z + sd * bw], [K.x + 2, L.bridge.z + sd * (bw + 0.3)], [K.x + K.r + 1, L.bridge.z + sd * bw]], 0, { color: new THREE.Color(0.5, 0.2, 0.1) });
  for (const x of [K.x - 6, K.x + 6]) batch.put(box(0.35, 16, 0.35), M.stoneUpper, V(x, -8, L.bridge.z), 0, null, { color: GRAPHITE, cast: false });
  farHull(ctx, { y: -40 });
}

// broken wall run between two points: height varies, the top is ragged, frost at the foot
function brokenWall(ctx, x0, z0, x1, z1, h = 6, seed = 1, { door = null } = {}) {
  const { batch, M, col } = ctx, R = rng(seed);
  const len = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 3));
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n, tm = (t0 + t1) / 2;
    if (door && Math.abs(tm * len - door) < 2.2) continue;
    const hh = Math.max(0.6, h * (0.25 + 0.75 * Math.pow(R(), 0.6)));
    const x = x0 + (x1 - x0) * tm, z = z0 + (z1 - z0) * tm;
    batch.put(box(0.5, hh, len / n + 0.02), M.stoneUpper, V(x, hh / 2, z), a, null, { color: new THREE.Color(0.5, 0.52, 0.57) });
    batch.put(box(0.56, 0.35, len / n + 0.04), M.stoneUpper, V(x, 0.17, z), a, null, { color: FROST, cast: false });
    if (R() < 0.4) batch.put(box(0.1, 0.08, len / n * 0.8), M.warmGlow, V(x + Math.cos(a) * 0.3, Math.min(hh - 0.3, 2.6), z - Math.sin(a) * 0.3), a, null, { cast: false, color: new THREE.Color(1.6, 0.15, 0.06) });
    col.box(x, z, 0.3, len / n / 2, a, 'wall');
  }
  // rib columns at the ends
  for (const [x, z] of [[x0, z0], [x1, z1]]) batch.put(box(0.9, h + 1.5, 0.9), M.stoneUpper, V(x, (h + 1.5) / 2, z), 0, null, { color: GRAPHITE });
}

function memorial(ctx, L, ice) {
  const { batch, M, col, scene } = ctx, Mh = L.memorial;
  brokenWall(ctx, Mh.x0, Mh.z0, Mh.x0, Mh.z1, 7, 21);
  brokenWall(ctx, Mh.x0, Mh.z0, Mh.x1, Mh.z0, 5, 22, { door: 16 });
  brokenWall(ctx, Mh.x1, Mh.z1, Mh.x0, Mh.z1, 5, 23, { door: 12 });
  // steles in rows, rimed with frost, each with a dead candle cup
  const steles = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) {
    const x = -43 + r * 5.5, z = -22 + c * 8.5;
    steles.push(new THREE.Matrix4().compose(V(x, 1.1, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI / 2 + (r * c % 3 - 1) * 0.04), V(1, 1, 1)));
    batch.put(box(1.4, 0.3, 0.9), M.stoneUpper, V(x, 0.15, z), 0, null, { color: GRAPHITE });
    col.box(x, z, 0.5, 0.75, 0, 'stele');
  }
  const g = new THREE.BoxGeometry(0.35, 2.2, 1.2);
  const im = new THREE.InstancedMesh(g, ice, steles.length);
  steles.forEach((m, i) => im.setMatrixAt(i, m));
  im.castShadow = true; im.receiveShadow = true; im.name = 'steles'; im.computeBoundingSphere(); scene.add(im);
  // central memorial: the station crest ring frozen over, a gold plaque with the names ground away
  batch.add(cyl(2.4, 2.8, 0.6, -34, 0, 0, 24), M.stoneUpper, { color: GRAPHITE });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.28, 10, 40), ice); ring.position.set(-34, 3.4, 0); ring.rotation.y = Math.PI / 2; ring.castShadow = true; scene.add(ring);
  batch.put(box(0.3, 1.2, 2.2), M.gold, V(-33.8, 1.2, 0), Math.PI / 2);
  col.circle(-34, 0, 2.6, 'memorial');
  holoLabel(ctx, 'MERIDIAN — IN MEMORY', -34, 6.8, 0, 4, [0.8, 0.9, 1.1]);
}

function lab(ctx, L, ice) {
  const { batch, M, col, scene } = ctx, Lb = L.lab;
  brokenWall(ctx, Lb.x0, Lb.z0, Lb.x1, Lb.z0, 8, 31);
  brokenWall(ctx, Lb.x0, Lb.z0, Lb.x0, Lb.z1, 8, 32);
  brokenWall(ctx, Lb.x1, Lb.z0, Lb.x1, Lb.z1, 6, 33, { door: 22 });
  brokenWall(ctx, Lb.x0, Lb.z1, Lb.x1, Lb.z1, 5, 34, { door: 18 });
  for (const [x, z, r] of [[-42, -66, Math.PI / 2], [-42, -72, Math.PI / 2], [-24, -86, 0], [-38, -88, 0]]) consoleDesk(ctx, x, z, r, [0.9, 0.2, 0.15]);
  // cracked specimen tubes (frozen)
  for (let i = 0; i < 5; i++) {
    const x = -44 + i * 4, z = -63;
    batch.add(cyl(0.9, 1.0, 0.4, x, 0, z, 16), M.stoneUpper, { color: GRAPHITE });
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 2.6 - (i % 2) * 1.1, 16, 1, true), ice); t.position.set(x, 0.4 + (2.6 - (i % 2) * 1.1) / 2, z); scene.add(t);
    col.circle(x, z, 1.0, 'tube');
  }
  // the Heir Core on its pedestal, still glowing
  const C = L.core;
  batch.put(lathe([[0, 0], [1.3, 0], [1.3, 0.3], [0.6, 0.5], [0.45, 1.2], [0.8, 1.35], [0, 1.35]], 24), M.stoneUpper, V(C.x, 0, C.z), 0, null, { color: new THREE.Color(0.8, 0.82, 0.86) });
  batch.put(new THREE.TorusGeometry(0.85, 0.06, 8, 32).rotateX(Math.PI / 2), M.gold, V(C.x, 1.36, C.z));
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(1.4, 1.0, 0.45), emissiveIntensity: 3, roughness: 0.2, metalness: 0.3 }));
  core.position.set(C.x, 2.1, C.z); core.name = 'heirCore'; scene.add(core);
  ctx.updaters.push((dt, t) => { core.rotation.y += dt * 0.8; core.position.y = 2.1 + Math.sin(t * 1.4) * 0.08; });
  col.circle(C.x, C.z, 1.3, 'pedestal');
  ctx.interactables.push({ id: 'heir_core', label: 'The Heir Core', x: C.x, z: C.z + 2.2, r: 2.4 });
  holoLabel(ctx, 'LAB 4  •  DR. L. VAEL', (Lb.x0 + Lb.x1) / 2, 7.5, Lb.z1 + 0.4, 4.2, [1.2, 0.9, 0.6]);
  ctx.meridian.core = core;
}

function command(ctx, L) {
  const { batch, M, col } = ctx, C = L.command;
  brokenWall(ctx, C.x0, C.z0, C.x1, C.z0, 7, 41);
  brokenWall(ctx, C.x1, C.z0, C.x1, C.z1, 7, 42);
  brokenWall(ctx, C.x0, C.z0, C.x0, C.z1, 5, 43, { door: 14 });
  brokenWall(ctx, C.x0, C.z1, C.x1, C.z1, 4, 44, { door: 8 });
  for (const [x, z, r] of [[26, -88, 0], [32, -88, 0], [38, -88, 0], [42, -80, -Math.PI / 2]]) consoleDesk(ctx, x, z, r, [1.4, 0.6, 0.25]);
  consoleDesk(ctx, 32, -76, Math.PI, [0.35, 0.8, 1.4]);
  ctx.interactables.push({ id: 'log', label: "Captain's Log — Day 164", x: 32, z: -73.5, r: 2.4 });
  // comms mast (A5-M3): lattice tower with the broadcast array Aurel meant to use
  const Mt = L.mast, h = 30;
  batch.add(cyl(6, 6.5, 0.6, Mt.x, 0, Mt.z, 28), M.stoneUpper, { color: GRAPHITE });
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) batch.put(box(0.35, h, 0.35), M.stoneUpper, V(Mt.x + dx * 1.3, h / 2, Mt.z + dz * 1.3), 0, null, { color: STEEL });
  for (let y = 3; y < h; y += 3) for (const [w, d, dz] of [[2.6, 0.18, -1.3], [2.6, 0.18, 1.3]]) batch.put(box(w, 0.18, d), M.stoneUpper, V(Mt.x, y, Mt.z + dz), 0, null, { color: STEEL, cast: false });
  const dish = new THREE.SphereGeometry(5, 24, 8, 0, Math.PI * 2, 0, 0.8); dish.rotateX(-1.0);
  batch.put(dish, M.stoneUpper, V(Mt.x, h - 4, Mt.z - 2), -0.5, null, { color: new THREE.Color(0.75, 0.77, 0.8) });
  batch.put(new THREE.SphereGeometry(0.45, 8, 6), M.warmGlow, V(Mt.x, h + 0.5, Mt.z), 0, null, { cast: false, color: new THREE.Color(2, 0.2, 0.08) });
  for (let i = 0; i < 3; i++) consoleDesk(ctx, Mt.x - 4 + i * 4, Mt.z + 5, Math.PI, [0.35, 0.9, 1.3]);
  col.box(Mt.x, Mt.z, 1.6, 1.6, 0, 'mast');
  ctx.meridian.mast = V(Mt.x, h, Mt.z);
}

// Tomas's frame, frozen in the doorway, holding the half-shut blast door open with its shoulders
function tomas(ctx, L, ice) {
  const { batch, M, col } = ctx, T = L.tomasDoor;
  brokenWall(ctx, -18, T.z, T.x - 3.2, T.z, 7, 51);
  brokenWall(ctx, T.x + 3.2, T.z, 16, T.z, 7, 52);
  batch.put(box(6.6, 1.2, 1.2), M.stoneUpper, V(T.x, 7, T.z), 0, null, { color: GRAPHITE });
  batch.put(box(2.6, 6.2, 0.6), M.stoneUpper, V(T.x - 1.9, 3.1, T.z), 0, null, { color: STEEL });
  batch.put(box(2.6, 6.2, 0.6), M.stoneUpper, V(T.x + 2.2, 3.1, T.z), 0, null, { color: STEEL });
  col.box(T.x - 1.9, T.z, 1.3, 0.3, 0, 'doorL'); col.box(T.x + 2.2, T.z, 1.3, 0.3, 0, 'doorR');
  let bot = null;
  try { bot = createRobot({ kind: 'rental', seed: 7, quality: ctx.tier.name === 'low' ? 'low' : 'high' }); } catch (e) { console.warn('frozen frame failed', e); }
  if (bot) {
    const B = Object.fromEntries(bot.mesh.skeleton.bones.map((b) => [b.name, b]));
    bot.update(0);
    const set = (n, x, y, z) => B[n] && B[n].rotation.set(x, y, z);
    set('spine', 0.12, 0, 0); set('chest', 0.1, 0.1, 0); set('neck', 0.3, 0, 0); set('head', 0.2, -0.2, 0.15);
    set('upArmL', -0.2, 0, 1.45); set('foreArmL', -0.9, 0, 0); set('upArmR', -0.2, 0, -1.45); set('foreArmR', -0.9, 0, 0);
    set('thighL', -0.35, 0, 0.05); set('shinL', 0.5, 0, 0); set('thighR', 0.3, 0, -0.05); set('shinR', 0.2, 0, 0);
    bot.mesh.material = ice;
    bot.root.position.set(T.x + 0.15, 0, T.z); bot.root.rotation.y = 0;
    ctx.root.add(bot.root);
    ctx.disposers.push(() => bot.dispose());
    col.circle(T.x + 0.15, T.z, 0.5, 'tomas');
  }
  ctx.interactables.push({ id: 'tomas', label: 'The frame in the doorway', x: T.x, z: T.z + 2.2, r: 2.2 });
}

function buildMeridian(ctx, onProgress = () => {}) {
  const L = MR_LAYOUT, { batch, M, col } = ctx;
  ctx.gather ||= [];
  ctx.meridian = {};
  const ice = ctx.cache.iceMat = iceMaterial();
  addSpaceSky(ctx, SPACE);
  ground(ctx, L);
  onProgress(0.45, 'Walking the wreck…');
  memorial(ctx, L, ice);
  lab(ctx, L, ice);
  command(ctx, L);
  tomas(ctx, L, ice);
  // concourse walls east/west of the spine, the docking collar ring in the south
  brokenWall(ctx, -18, -56, -18, -34, 6, 61); brokenWall(ctx, 6, -56, 6, -30, 5, 62);
  brokenWall(ctx, 40, 30, 40, 56, 5, 63); brokenWall(ctx, -30, 44, -8, 44, 4, 64, { door: 11 });
  const collar = new THREE.TorusGeometry(10, 1.2, 10, 48, Math.PI * 1.35); collar.rotateX(Math.PI / 2); collar.rotateY(-0.35);
  batch.put(collar, M.stoneUpper, V(0, 0.6, 78), 0, null, { color: new THREE.Color(0.52, 0.54, 0.58) });
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; batch.put(box(0.3, 0.12, 0.3), M.warmGlow, V(Math.sin(a) * 9.2, 0.1, 78 + Math.cos(a) * 9.2), a, null, { cast: false, color: new THREE.Color(1.6, 0.2, 0.08) }); }
  ctx.interactables.push({ id: 'passage', to: 'hullside', label: 'Docking collar — back along the spur', x: 0, z: 88, r: 2.6 });
  // exposed roof frames over what's left of the station
  for (let z = -86; z < 50; z += 14) {
    const R = rng(z + 99), span = 30 + R() * 40, x = -50 + R() * 40;
    const g = box(span, 0.9, 0.9); g.rotateZ((R() - 0.5) * 0.25);
    batch.put(g, M.stoneUpper, V(x + span / 2, 11 + R() * 4, z), 0, null, { color: GRAPHITE, cast: true, cellKey: 'roof' + Math.floor(z / 40) });
  }
  // debris in zero-g: plates, beams, chunks over the deck and out past the edges
  const R = rng(77), deb = [];
  for (let i = 0; i < 150; i++) { const inside = i < 80; deb.push([(R() - 0.5) * (inside ? 90 : 260), (inside ? 7 : -10) + R() * (inside ? 22 : 60), (R() - 0.5) * (inside ? 180 : 320), 0.6 + R() * (inside ? 2.2 : 5), (R() * 3) | 0]); }
  driftDebris(ctx, deb, { amp: 0.8 });
  meridianSilhouette(ctx, -160, 20, -300, 1.1);
  kiosk(ctx); warehousePad(ctx); relay(ctx, L.relay.x, L.relay.z);
  for (const [x, z] of [[20, 60], [-36, 58], [30, 36], [-10, -40], [12, -20]]) crateStack(ctx, x, z, x * 0.1, 1 + ((z & 2) >> 1));
  // red emergency pools, cold frost glow, the core's warm light
  const pools = [[L.core.x, L.core.z, 6, [1.2, 0.8, 0.35]], [L.mast.x, L.mast.z, 8, [0.3, 0.7, 1.0]], [0, 78, 9, [1.1, 0.15, 0.08]], [32, -80, 7, [1.0, 0.5, 0.2]]];
  for (let i = 0; i < 12; i++) pools.push([-40 + R() * 80, -80 + R() * 150, 4 + R() * 3, [0.9, 0.1, 0.05]]);
  for (let i = 0; i < 8; i++) pools.push([-44 + R() * 24, -26 + R() * 52, 4, [0.35, 0.5, 0.65]]);
  lightPools(ctx, pools);

  ctx.breakables = createBreakables(ctx, [
    { kind: 'crate', x: 22, z: 62 }, { kind: 'crate', x: -34, z: 56, stack: 1 }, { kind: 'crate', x: 10, z: -24 },
    { kind: 'crate', x: -12, z: -44, rot: 0.4 }, { kind: 'crate', x: 44, z: -60 },
    { kind: 'holo', x: -26, z: -64, rot: 0.2 }, { kind: 'holo', x: 24, z: -70, rot: -0.2 },
  ]);
  const K = L.breach;
  const S = [
    ['mr_dock_collar', 'hull', 0, 70, 6], ['mr_breach_rim', 'hull', K.x - K.r - 4, K.z + 10, 4], ['mr_comms_platform', 'hull', L.mast.x - 4, L.mast.z + 7, 5],
    ['mr_concourse', 'interior', 0, -10, 5], ['mr_memorial_hall', 'interior', -34, -12, 6], ['mr_command', 'interior', 32, -80, 5],
    ['mr_lyra_lab', 'vault', -32, -76, 5], ['mr_tomas_door', 'interior', L.tomasDoor.x, L.tomasDoor.z + 3, 2.5],
    ['mr_breach_catwalk', 'catwalk', K.x, L.bridge.z, 1.5], ['mr_mast_catwalk', 'catwalk', L.mast.x - 7, L.mast.z + 9, 2],
    ['mr_memorial', 'memorial', -34, 4, 3],
    ['mr_relay', 'relay', L.relay.x, L.relay.z - 2.8, 2.5],
    ['mr_spawn_s', 'spawn_edge', 46, 86, 3], ['mr_spawn_w', 'spawn_edge', -47, 40, 3], ['mr_spawn_n', 'spawn_edge', 0, -92, 3], ['mr_spawn_e', 'spawn_edge', 47, -20, 3],
    ['mr_vantage_mast', 'vantage', L.mast.x + 5, L.mast.z, 2.5], ['mr_vantage_breach', 'vantage', K.x + K.r + 3, K.z, 2.5],
    ['mr_hide_steles', 'hide', -40.2, 7.8, 1.2], ['mr_hide_lab', 'hide', -22, -70, 1.5], ['mr_hide_crates', 'hide', 30, 38, 1.5], ['mr_hide_wall', 'hide', 8, -40, 1.5],
    ['mr_npc_jun', 'npc', L.mast.x, L.mast.z + 9, 1.5], ['mr_npc_dock', 'npc', 6, 64, 1.5],
    ['mr_contract_terminal', 'terminal', L.kiosk.x, L.kiosk.z, 3], ['mr_warehouse_link', 'link_pad', L.pad.x, L.pad.z, 2.6],
  ];
  ctx.sites = S.map(([id, tag, x, z, r]) => ({ id, tag, x, z, r, y: col.groundAt(x, z), district: 'meridian', indoor: false }));
}

export const MERIDIAN = {
  id: 'meridian', name: 'Meridian Wreck', layout: MR_LAYOUT, bounds: MR_LAYOUT.bounds, build: buildMeridian,
  crowd: { loops: [[[0, 70], [0, 60]]], talk: [], count: 0 }, farCrowd: 0, adCount: 0, adOrigins: [], batchCell: 64, mirror: false,
  gravity: 0, zeroG: true, magBoots: true, vacuum: true,
  env: (r, tier) => spaceEnv(r, tier, SPACE, [[[1.4, 0.15, 0.08], -20, 2, 10, 8, 3, 0.8], [[0.5, 0.7, 0.9], 20, 4, -20, 10, 4, -0.8]]),
  ambience: {
    interior: true, background: 0x000000, sunDir: SPACE.sun.toArray(),
    sun: [0.95, 0.95, 1.0], sunI: 2.2, hemiSky: 0x5a7a90, hemiGround: 0x2a2020, hemiI: 1.0,
    fog: [0.0, 0.0, 0.0], fogDensity: 0.00005, env: 0.9,
    gain: [1.0, 0.98, 1.02], lift: [0.004, 0.0, 0.006], sat: 1.05, contrast: 1.22,
  },
  spawnPoints: (L) => ({ player: [L.spawn.x, L.spawn.z], kiosk: [L.kiosk.x, L.kiosk.z + 2.5], pad: [L.pad.x, L.pad.z], relay: [L.relay.x, L.relay.z - 2.8], dock: [0, 84], core: [L.core.x, L.core.z + 3], mast: [L.mast.x, L.mast.z + 8] }),
};
