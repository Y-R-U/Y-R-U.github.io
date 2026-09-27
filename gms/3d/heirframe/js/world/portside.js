import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, cyl, lathe } from './geo.js';
import { createIndustrialGround, zoneMask } from './ind_ground.js';
import { addContainers, containerBlock, dockCrane, shuttle, shuttleMaterials, floodMast, lightPools, bitt, cable, CL, CW, CH } from './p4_props.js';
import { planter, lamp, kiosk, warehousePad, railing } from './plaza.js';
import { bench, bollard } from './furnish.js';
import { locker, relay, crate } from './sites.js';
import { addTree } from './foliage.js';
import { HOLO_ART, createHoloMaterial, registerBillboard, faceCamera } from './holo.js';
import { createBreakables } from './breakables.js';
import { createLakeMaterial } from './water.js';
import { tiered } from './backdrop.js';
import { addTowerField, archetypes } from './skyline.js';
import { addFlyingCars } from './traffic.js';
import { buildEnvironment } from '../engine/atmosphere.js';
import { rng } from './textures.js';
import { REFLECT_LAYER } from '../fx/reflection.js';

// Portside: the spaceport and docks at sunset. North (-Z, the default view) is the harbour: a quay with two ship-to-shore
// cranes working a moored freighter, the sea and a breakwater with the sun going down over it. The middle is the
// container yard (aisles = alleys), the east has the shuttle pads (one parked shuttle + gantry, one pad with a shuttle
// landing and leaving on a loop), the west a Freehaul cargo shed with the customs lock-up, the south the terminal.
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const WY = -3.5;
const SUN = [-0.5, 0.2, -0.84];

export const PS_LAYOUT = {
  bounds: { x0: -68, x1: 51.5, z0: -61.4, z1: 92 },
  quayZ: -62, eastX: 52,
  cranes: [-28, 6], craneZ: -46,
  padA: { x: 34, z: 30, r: 11 }, padB: { x: 32, z: 68, r: 10 },
  shed: { x0: -68, x1: -44, z0: 16, z1: 56, h: 9 },
  deck: { x0: -32, x1: -10, z0: 62, z1: 80, y: 3, stairs: [-24, -18] },
  spawn: { x: 0, z: 82 },
  relay: { x: 12, z: 88 },
  kiosk: { x: -8, z: 84, rot: 0.6 },
  pad: { x: 8, z: 74 },
};

function ground(ctx, L) {
  const B = L.bounds;
  const blocks = yardBlocks();
  const mask = zoneMask({ x0: -72, x1: 56, z0: -64, z1: 96 }, (P) => {
    const Y = 'rgb(0,255,0)', HZ = 'rgb(0,255,255)', ST = '#f00', GR = '#00f';
    P.rect(-72, -62.4, 56, -60.6, HZ);                                  // quay edge hazard band
    P.rect(50.4, -62, 52.2, 30, HZ);
    for (const z of [-60, -46]) P.rect(-72, z - 0.45, 56, z + 0.45, ST);  // crane rails
    P.rect(-72, -53.3, 56, -52.7, Y);                                     // AGV lane edges
    P.rect(-72, -39.3, 56, -38.7, Y);
    P.rect(-72, -37.6, 56, -37.0, GR);                                    // drainage trench
    for (const [x, z, rot, c, r] of blocks) P.frame(x - c * (CL + 0.3) / 2 - 0.6, z - r * (CW + 0.15) / 2 - 0.6, x + c * (CL + 0.3) / 2 + 0.6, z + r * (CW + 0.15) / 2 + 0.6, 0.18, Y);
    for (const p of [L.padA, L.padB]) {
      P.disc(p.x, p.z, p.r, ST);
      P.ring(p.x, p.z, p.r - 0.6, p.r, HZ);
      P.ring(p.x, p.z, p.r * 0.55, p.r * 0.55 + 0.35, Y);
      P.line(p.x - p.r * 0.35, p.z, p.x + p.r * 0.35, p.z, 0.5, Y);
      P.ring(p.x, p.z, p.r, p.r + 0.8, GR);
    }
    // pedestrian walk from the terminal up the middle to the quay
    for (const x of [-3.2, 3.2]) P.rect(x - 0.12, -40, x + 0.12, 80, Y);
    for (let z = -36; z < 80; z += 12) for (let k = 0; k < 4; k++) P.rect(-3, z + k * 1.1, 3, z + k * 1.1 + 0.55, Y);
    P.rect(L.shed.x0, L.shed.z0, L.shed.x1, L.shed.z1, 'rgb(40,0,0)');
  });
  createIndustrialGround(ctx, [{ rects: [[-72, 52, -62, 96]], y: 0, reflect: true, ao: true }], mask,
    { slab: 6, tint: [0.66, 0.62, 0.58], wet: 0.1, rust: 0.25, key: 'ps' });
  // quay wall faces down to the water
  const { batch, M } = ctx;
  batch.put(box(400, 5, 1.2), M.stone, V(-60, WY - 1.2 + 2.5 - 0.6, L.quayZ - 0.6), 0, null, { color: new THREE.Color(0.55, 0.52, 0.5), cast: false });
  batch.put(box(1.2, 5, 92), M.stone, V(L.eastX + 0.6, WY - 1.2 + 2.5 - 0.6, -16), 0, null, { color: new THREE.Color(0.55, 0.52, 0.5), cast: false });
  batch.put(box(400, 0.25, 0.3), M.darkMetal, V(-60, -0.1, L.quayZ - 0.1), 0, null, { cast: false });
  batch.put(box(0.3, 0.25, 92), M.darkMetal, V(L.eastX + 0.1, -0.1, -16), 0, null, { cast: false });
  // fenders along the quay face
  for (let x = -66; x < 50; x += 9) batch.put(box(1.6, 2.2, 0.6), M.darkMetal, V(x, -1.4, L.quayZ - 1.4), 0, null, { cast: false });
  return blocks;
}

function water(ctx, L) {
  const shore = { water: [[-900, -1200, 900, L.quayZ], [L.eastX, L.quayZ - 1, 900, 30]], walls: [[-420, -212, -60, -200]], churn: [] };
  const mat = createLakeMaterial(ctx, { shore });
  const g = new THREE.PlaneGeometry(1800, 1260).rotateX(-Math.PI / 2);
  g.translate(0, WY, -600 + 30);
  const w = new THREE.Mesh(g, mat);
  w.receiveShadow = true; w.name = 'water';
  ctx.scene.add(w);
  // breakwater + lighthouse, marker buoys, anchored freighters
  const { batch, M } = ctx;
  batch.put(box(360, 4, 12), M.stone, V(-240, WY + 1, -206), 0, null, { color: new THREE.Color(0.5, 0.48, 0.47), cast: false });
  batch.put(lathe([[0, 0], [3, 0], [2.2, 16], [2.6, 16.4], [2.6, 17], [0, 17]], 16), M.stoneUpper, V(-58, WY + 3, -206), 0, null, { cast: false });
  batch.put(new THREE.SphereGeometry(1.4, 10, 8), M.warmGlow, V(-58, WY + 21, -206), 0, null, { cast: false });
  for (let i = 0; i < 6; i++) {
    const x = -40 + i * 28, z = -130 - (i % 2) * 14;
    batch.put(cyl(0.6, 0.9, 2.4, x, WY - 0.6, z, 8), M.stoneUpper, V(0, 0, 0), 0, null, { cast: false, color: i % 2 ? new THREE.Color(0.8, 0.15, 0.1) : new THREE.Color(0.1, 0.6, 0.25) });
    batch.put(new THREE.SphereGeometry(0.3, 6, 4), M.warmGlow, V(x, WY + 2.2, z), 0, null, { cast: false, color: i % 2 ? new THREE.Color(1.5, 0.1, 0.05) : new THREE.Color(0.1, 1.5, 0.3) });
  }
  const R = rng(5);
  for (const [x, z, l, r] of [[-180, -330, 140, 0.15], [120, -420, 180, -0.1], [320, -300, 110, 0.4], [-420, -520, 200, 0.05]]) {
    batch.put(box(l, 12, l * 0.16), M.darkMetal, V(x, WY + 3, z), r, null, { cast: false });
    batch.put(box(l * 0.12, 14, l * 0.15), M.stoneUpper, V(x - Math.cos(r) * l * 0.4, WY + 15, z + Math.sin(r) * l * 0.4), r, null, { cast: false });
    for (let k = 0; k < 6; k++) batch.put(box(l * 0.1, 6 + R() * 5, l * 0.14), M.crate, V(x + Math.cos(r) * (k - 2) * l * 0.12, WY + 11, z - Math.sin(r) * (k - 2) * l * 0.12), r, null, { cast: false, color: new THREE.Color().setHSL(R(), 0.5, 0.5) });
  }
}

// The moored freighter the cranes work: hull, waterline band, deck containers (instanced with the yard), bridge house.
function ship(ctx, list) {
  const { batch, M, col } = ctx;
  const x0 = -52, x1 = 26, zc = -76, beam = 17, top = 6.5;
  const hull = new THREE.Shape();
  hull.moveTo(x0, -beam / 2); hull.lineTo(x1 - 8, -beam / 2); hull.quadraticCurveTo(x1 + 4, -beam / 2 + 1, x1 + 7, 0); hull.quadraticCurveTo(x1 + 4, beam / 2 - 1, x1 - 8, beam / 2);
  hull.lineTo(x0, beam / 2); hull.quadraticCurveTo(x0 - 3, 0, x0, -beam / 2);
  const hg = new THREE.ExtrudeGeometry(hull, { depth: top - WY + 2, bevelEnabled: false, curveSegments: 6 });
  hg.rotateX(-Math.PI / 2); hg.translate(0, WY - 2, zc);
  batch.add(hg, M.stoneUpper, { color: new THREE.Color(0.1, 0.16, 0.26), cast: true });
  const band = new THREE.ExtrudeGeometry(hull, { depth: 1.2, bevelEnabled: false, curveSegments: 6 });
  band.rotateX(-Math.PI / 2); band.scale(1.003, 1, 1.01); band.translate(0, WY - 0.6, zc);
  batch.add(band, M.stoneUpper, { color: new THREE.Color(0.55, 0.12, 0.08), cast: false });
  batch.put(box(x1 - x0, 0.2, beam - 0.4), M.darkMetal, V((x0 + x1) / 2, top + 0.1, zc), 0, null, { cast: false });
  batch.put(box(x1 - x0 + 4, 0.15, 0.2), M.gold, V((x0 + x1) / 2 + 2, top - 0.3, zc + beam / 2 + 0.05), 0, null, { cast: false });
  // bridge house at the stern (west end), stacked decks, a funnel
  const bx = x0 + 5;
  for (let i = 0; i < 4; i++) {
    batch.put(box(8 - i * 0.6, 3, beam - 2 - i), M.stoneUpper, V(bx, top + 1.5 + i * 3, zc), 0, null, { color: new THREE.Color(0.95, 0.94, 0.9) });
    batch.put(box(8.05 - i * 0.6, 0.9, beam - 1.9 - i), M.glassDark, V(bx, top + 2.1 + i * 3, zc), 0, null, { cast: false });
  }
  batch.put(box(3, 1.6, beam + 2), M.stoneUpper, V(bx + 1, top + 12.8, zc), 0, null, { color: new THREE.Color(0.95, 0.94, 0.9) });
  batch.add(cyl(1.6, 1.9, 7, bx - 2, top + 12, zc, 14), M.stoneUpper, { color: new THREE.Color(0.75, 0.18, 0.1) });
  batch.put(box(0.6, 6, 0.6), M.darkMetal, V(bx + 2, top + 17, zc), 0, null, { cast: false });
  // deck cargo: bays across the beam
  const R = rng(17);
  for (let x = x0 + 12; x < x1 - 6; x += CL + 0.6) for (let j = -2.5; j <= 2.5; j++) {
    const h = 1 + ((R() * 3.2) | 0);
    for (let k = 0; k < h; k++) list.push([x, top + 0.2 + k * CH, zc + j * (CW + 0.2), 0, (R() * 10) | 0]);
  }
  // mooring lines from the ship to the quay bitts
  for (const x of [x0 + 6, x0 + 30, x1 - 20, x1 - 2]) cable(ctx, [x, top + 0.8, zc + beam / 2], [x + (x < 0 ? -4 : 4), 0.7, -61.4], 1.2, 0.07, M.darkMetal);
}

function yardBlocks() {
  const B = [];
  for (const [z, xs] of [[-30, [-58, -36, -14]], [-18, [-58, -36, -14, 14]], [-6, [-58, -36, 14]], [6, [-36, -14, 14]]]) for (const x of xs) B.push([x, z, 0, 3, 2]);
  return B;
}

function yard(ctx, blocks, list) {
  const R = rng(31);
  for (const [x, z, rot, c, r] of blocks) {
    const near = Math.abs(x) < 16 && z > 0;
    containerBlock(ctx, list, x, z, rot, c, r, (i, j, RR) => (near ? 1 : 1 + ((RR() * 3) | 0)), (x * 13 + z * 7) | 0);
  }
  // loose containers on the apron (waiting for the cranes) and by the shed
  for (const [x, z, rot] of [[-44, -44, 0], [-16, -43.5, 0.05], [20, -44, 0], [36, -8, Math.PI / 2], [40, -8, Math.PI / 2], [-40, 12, 0.2]]) {
    list.push([x, 0, z, rot, (R() * 10) | 0]);
    ctx.col.box(x, z, CL / 2 + 0.1, CW / 2 + 0.1, rot, 'container');
  }
}

function pads(ctx, L) {
  const { batch, M, col, scene, updaters } = ctx;
  const mats = shuttleMaterials();
  // pad A: a parked shuttle + a boarding gantry tower with an arm to the hatch
  const A = L.padA;
  for (let a = 0; a < 16; a++) { const t = a / 16 * Math.PI * 2; batch.put(cyl(0.2, 0.2, 0.18, A.x + Math.sin(t) * (A.r - 0.3), 0, A.z + Math.cos(t) * (A.r - 0.3), 8), M.blueGlow, V(0, 0, 0), 0, null, { cast: false }); }
  const sA = shuttle(1, mats); sA.position.set(A.x, 2.1, A.z - 1); sA.rotation.y = -0.35; scene.add(sA);
  col.circle(A.x, A.z - 1, 3.2, 'shuttle'); col.box(A.x, A.z - 4, 8.5, 2.4, -0.35, 'wings');
  const gx = A.x + 12, gz = A.z + 2;
  for (const [dx, dz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) batch.put(box(0.3, 14, 0.3), M.stoneUpper, V(gx + dx, 7, gz + dz), 0, null, { color: new THREE.Color(0.85, 0.84, 0.82) });
  for (let y = 1.5; y < 14; y += 2.5) {
    batch.put(box(2.7, 0.18, 2.7), M.darkMetal, V(gx, y, gz), 0, null, { cast: false });
    for (const s of [-1, 1]) { const g = box(0.12, 3.5, 0.12); g.rotateZ(0.8 * s); batch.put(g, M.stoneUpper, V(gx, y + 1.25, gz - 1.25), 0, null, { cast: false }); }
  }
  batch.put(box(7.5, 1.2, 1.4), M.stoneUpper, V(gx - 4.5, 4.2, gz - 0.5), 0, null, { color: new THREE.Color(0.9, 0.88, 0.85) });
  batch.put(box(7.6, 0.1, 1.45), M.gold, V(gx - 4.5, 4.85, gz - 0.5), 0, null, { cast: false });
  batch.put(new THREE.SphereGeometry(0.3, 8, 6), M.warmGlow, V(gx, 14.3, gz), 0, null, { cast: false, color: new THREE.Color(1.6, 0.15, 0.05) });
  col.box(gx, gz, 1.6, 1.6, 0, 'gantry');
  // fuel tanks + hoses behind pad A
  for (const [x, z] of [[46, 44], [46, 49.5]]) { batch.put(new THREE.CapsuleGeometry(1.6, 5, 6, 14).rotateZ(Math.PI / 2), M.stoneUpper, V(x, 1.8, z), 0, null, { color: new THREE.Color(0.9, 0.9, 0.88) }); batch.put(box(0.3, 0.9, 3), M.darkMetal, V(x - 2, 0.45, z), 0, null, {}); col.box(x, z, 4.2, 1.7, 0, 'tank'); }
  cable(ctx, [44, 1.2, 44], [A.x + 3, 1.6, A.z + 5], 0.8, 0.08, M.darkMetal);

  // pad B: a shuttle lands, sits, lifts off and climbs out over the sea, then comes back (cycle 60 s)
  const B = L.padB;
  for (let a = 0; a < 16; a++) { const t = a / 16 * Math.PI * 2; batch.put(cyl(0.2, 0.2, 0.18, B.x + Math.sin(t) * (B.r - 0.3), 0, B.z + Math.cos(t) * (B.r - 0.3), 8), M.warmGlow, V(0, 0, 0), 0, null, { cast: false }); }
  const sB = shuttle(0.9, mats); scene.add(sB);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.9, 5, 12, 1, true).translate(0, -2.5, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 0.85, 1.0).multiplyScalar(3), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  flame.rotation.x = -Math.PI / 2; flame.position.z = -8.2; sB.add(flame);
  const down = new THREE.Mesh(new THREE.ConeGeometry(1.8, 3.5, 12, 1, true).translate(0, -1.75, 0), flame.material);
  down.position.y = -1.2; sB.add(down);
  const ring = ctx.makePadRing(B.r - 0.6, [1.0, 0.7, 0.35], true); ring.position.set(B.x, 0.05, B.z); scene.add(ring);
  const far = V(-300, 160, -700), sm = (a) => a * a * (3 - 2 * a);
  let t = 20;
  const blocker = col.circle(B.x, B.z, 0, 'shuttleB');
  updaters.push((dt) => {
    t = (t + dt) % 60;
    let p, yaw = 0.3, pitch = 0, thr = 0, hov = 0;
    if (t < 16) { const u = sm(t / 16); p = V(far.x + (B.x - far.x) * u, B.z + 0 * u, 0); p.set(far.x + (B.x - far.x) * u, far.y + (18 - far.y) * u, far.z + (B.z - far.z) * u); pitch = -0.1 * (1 - u); thr = 1; }
    else if (t < 22) { const u = sm((t - 16) / 6); p = V(B.x, 18 - 15.9 * u, B.z); hov = 1 - u * 0.6; }
    else if (t < 40) { p = V(B.x, 2.1, B.z); }
    else if (t < 45) { const u = sm((t - 40) / 5); p = V(B.x, 2.1 + 16 * u, B.z); hov = 1; }
    else { const u = sm((t - 45) / 15); p = V(B.x + (far.x - B.x) * u, 18 + (far.y - 18) * u, B.z + (far.z - B.z) * u); pitch = 0.18 * u; thr = 1; yaw = 0.3 + 0.2 * u; }
    sB.position.copy(p); sB.rotation.set(pitch, Math.PI + yaw, 0);
    flame.visible = thr > 0; down.visible = hov > 0.05; down.scale.setScalar(0.6 + hov * 0.5 + Math.sin(t * 40) * 0.05);
    blocker.r = p.y < 4 ? 3.2 : 0;
    ring.material.uniforms.uAlpha.value = t > 14 && t < 47 ? 1 : 0.35;
  });
  // pad control booths
  for (const p of [A, B]) {
    const bx = p.x - p.r - 3, bz = p.z;
    batch.put(box(2.6, 2.6, 2.6), M.stoneUpper, V(bx, 1.3, bz), 0, null, { color: new THREE.Color(0.92, 0.9, 0.86) });
    batch.put(box(2.62, 1.0, 2.62), M.glassDark, V(bx, 1.8, bz), 0, null, { cast: false });
    batch.put(box(2.8, 0.12, 2.8), M.gold, V(bx, 2.66, bz), 0, null, { cast: false });
    col.box(bx, bz, 1.4, 1.4, 0, 'booth');
  }
}

function shed(ctx, L) {
  const { batch, M, col } = ctx;
  const S = L.shed, cx = (S.x0 + S.x1) / 2, cz = (S.z0 + S.z1) / 2, w = S.x1 - S.x0, d = S.z1 - S.z0;
  const wallC = new THREE.Color(0.78, 0.74, 0.68);
  batch.put(box(0.5, S.h, d), M.stoneUpper, V(S.x0 + 0.25, S.h / 2, cz), 0, null, { color: wallC });
  for (const z of [S.z0, S.z1]) { batch.put(box(w, S.h, 0.5), M.stoneUpper, V(cx, S.h / 2, z), 0, null, { color: wallC }); col.box(cx, z, w / 2, 0.3, 0, 'shedWall'); }
  col.box(S.x0 + 0.25, cz, 0.3, d / 2, 0, 'shedWall');
  // roof: ribbed sheet on trusses (fades when it hides the player), skylight strips
  batch.put(box(w + 1, 0.4, d + 1), M.darkMetal, V(cx, S.h + 0.2, cz), 0, null, {});
  for (let z = S.z0 + 4; z < S.z1; z += 8) batch.put(box(w - 1, 0.18, 1.2), M.blueGlow, V(cx, S.h - 0.05, z), 0, null, { cast: false, color: new THREE.Color(0.5, 0.45, 0.35) });
  for (let z = S.z0 + 8; z < S.z1 - 2; z += 8) { batch.add(cyl(0.25, 0.25, S.h, S.x1 - 0.4, 0, z, 10), M.darkMetal); col.circle(S.x1 - 0.4, z, 0.35, 'column'); }
  batch.put(box(0.3, 1.4, d), M.stoneUpper, V(S.x1 - 0.2, S.h - 0.7, cz), 0, null, { color: new THREE.Color(0.85, 0.65, 0.2) });
  // FREEHAUL lettering board over the bay
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(12, 1.6), createHoloMaterial(HOLO_ART.sign('FREEHAUL UNION  •  BAY 7'), { bright: 2.2, alpha: 0.95, time: ctx.time }));
  sign.position.set(S.x1 + 0.05, S.h + 1.3, cz); sign.rotation.y = Math.PI / 2; sign.layers.enable(REFLECT_LAYER); ctx.scene.add(sign);
  // racking along the back wall, pallets, a forklift
  for (let z = S.z0 + 3; z < S.z1 - 2; z += 6.5) {
    batch.put(box(1.4, 5, 5.5), M.darkMetal, V(S.x0 + 1.4, 2.5, z), 0, null, {});
    for (let y = 0.9; y < 5; y += 1.6) batch.put(box(1.1, 1.0, 5.0), M.crate, V(S.x0 + 1.4, y, z), 0, null, { color: new THREE.Color(0.9, 0.85, 0.75) });
    col.box(S.x0 + 1.4, z, 0.8, 2.8, 0, 'rack');
  }
  for (const [x, z] of [[-60, 24], [-58.5, 27], [-54, 44], [-52, 47.5]]) crate(ctx, x, z, 1, 0, (x * 0.3) % 1);
  forklift(ctx, -55, 34, 0.6);
  vaultCage(ctx, S.x0 + 0.6, S.x0 + 12, S.z1 - 11, S.z1 - 0.6);
}

function forklift(ctx, x, z, rot) {
  const { batch, M, col } = ctx;
  const Y = new THREE.Color(0.95, 0.72, 0.12);
  batch.put(box(1.4, 1.1, 2.2), M.stoneUpper, V(x, 0.85, z), rot, null, { color: Y });
  batch.put(box(1.3, 0.1, 1.2), M.darkMetal, V(x, 2.3, z - Math.cos(rot) * 0.2), rot, null, {});
  for (const s of [-0.6, 0.6]) batch.put(box(0.08, 2.0, 0.08), M.darkMetal, V(x + Math.cos(rot) * s, 1.3, z + Math.sin(rot) * -s), rot, null, { cast: false });
  batch.put(box(1.2, 2.4, 0.2), M.darkMetal, V(x + Math.sin(rot) * 1.2, 1.2, z + Math.cos(rot) * 1.2), rot, null, {});
  for (const s of [-0.35, 0.35]) batch.put(box(0.12, 0.06, 1.1), M.darkMetal, V(x + Math.sin(rot) * 1.85 + Math.cos(rot) * s, 0.1, z + Math.cos(rot) * 1.85 - Math.sin(rot) * s), rot, null, { cast: false });
  col.box(x, z, 0.8, 1.8, rot, 'forklift');
}

function vaultCage(ctx, x0, x1, z0, z1) {
  const { batch, M, col } = ctx;
  for (let x = x0 + 0.4; x <= x1; x += 0.6) batch.put(box(0.05, 3.2, 0.05), M.chrome, V(x, 1.6, z0), 0, null, { cast: false, reflect: false });
  for (let z = z0; z <= z1; z += 0.6) batch.put(box(0.05, 3.2, 0.05), M.chrome, V(x1, 1.6, z), 0, null, { cast: false, reflect: false });
  batch.put(box(x1 - x0, 0.1, 0.1), M.gold, V((x0 + x1) / 2, 3.2, z0), 0, null, { cast: false });
  batch.put(box(0.1, 0.1, z1 - z0), M.gold, V(x1, 3.2, (z0 + z1) / 2), 0, null, { cast: false });
  col.box((x0 + x1) / 2 - 1.5, z0, (x1 - x0) / 2 - 1.5, 0.15, 0, 'cage');
  col.box(x1, (z0 + z1) / 2 + 1.5, 0.15, (z1 - z0) / 2 - 1.5, 0, 'cage');
  batch.put(box(2.4, 2.2, 1.8), M.gold, V(x0 + 3, 1.1, z1 - 2), 0, null, {});
  batch.put(box(1.2, 1.2, 1.2), M.darkMetal, V(x0 + 6.5, 0.6, z1 - 3), 0.3, null, {});
  col.box(x0 + 3, z1 - 2, 1.3, 1.0, 0, 'safe');
  const s = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.5), createHoloMaterial(HOLO_ART.sign('CUSTOMS HOLD'), { bright: 2.6, alpha: 0.9, time: ctx.time }));
  s.position.set((x0 + x1) / 2, 3.8, z0); ctx.scene.add(s); faceCamera(ctx, s);
}

// harbour office deck (rooftop/vantage): a raised platform over the south-west with stairs, benches and planters
function deck(ctx, L) {
  const { batch, M, col, scene } = ctx;
  const D = L.deck, w = D.x1 - D.x0, d = D.z1 - D.z0, cx = (D.x0 + D.x1) / 2, cz = (D.z0 + D.z1) / 2;
  const top = new THREE.Mesh(box(w, 0.3, d, cx, D.y - 0.15, cz), M.terrace);
  const uv = top.geometry.attributes.uv, p = top.geometry.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 5, p.getZ(i) / 5);
  top.receiveShadow = true; top.layers.enable(REFLECT_LAYER); scene.add(top);
  for (let x = D.x0 + 2; x < D.x1; x += 5) { batch.put(box(0.6, D.y, 0.6), M.stoneUpper, V(x, D.y / 2, D.z0 + 0.4)); batch.put(box(0.6, D.y, 0.6), M.stoneUpper, V(x, D.y / 2, D.z1 - 0.4)); }
  batch.put(box(w, 0.1, 0.2), M.gold, V(cx, D.y - 0.05, D.z0), 0, null, { cast: false });
  const [s0, s1] = D.stairs, z0 = D.z0 - 8, n = 10;
  for (let i = 0; i < n; i++) batch.add(box(s1 - s0, D.y / n * (i + 1), 0.8, (s0 + s1) / 2, D.y / n * (i + 1) / 2, z0 + 0.8 * (i + 0.5)), M.stoneUpper);
  for (const sx of [s0 - 0.2, s1 + 0.2]) { batch.put(box(0.4, D.y + 0.6, 8), M.stone, V(sx, (D.y + 0.6) / 2, z0 + 4)); col.box(sx, z0 + 4, 0.25, 4, 0, 'stairWall'); }
  col.height({ kind: 'rampZ', x0: s0, x1: s1, z0, z1: D.z0, y0: 0, y1: D.y });
  col.height({ kind: 'flat', x0: D.x0, x1: D.x1, z0: D.z0, z1: D.z1, y: D.y });
  // the deck is reached only by the stairs; underneath is solid
  col.custom((x, z, r) => {
    const inX = x + r > D.x0 && x - r < D.x1, inZ = z + r > D.z0 && z - r < D.z1;
    if (!inX || !inZ) return false;
    const onDeck = x - r > D.x0 + 0.4 && x + r < D.x1 - 0.4 && z - r > D.z0 + 0.3 && z + r < D.z1 - 0.3;
    const onStair = x - r > s0 && x + r < s1 && z < D.z0 + 1;
    if (onStair) return false;
    return !onDeck || false;
  });
  railing(ctx, [[D.x0 + 0.2, D.z0 + 0.2], [s0, D.z0 + 0.2]], D.y);
  railing(ctx, [[s1, D.z0 + 0.2], [D.x1 - 0.2, D.z0 + 0.2], [D.x1 - 0.2, D.z1 - 0.2], [D.x0 + 0.2, D.z1 - 0.2], [D.x0 + 0.2, D.z0 + 0.2]], D.y);
  for (const x of [-28, -14]) { const seats = bench(ctx, x, D.z0 + 2.2, Math.PI, D.y); ctx.gather.push({ x, z: D.z0 + 2.2, kind: 'sit', seats, y: D.y }); }
  planter(ctx, cx, D.z1 - 2.2, 8, 1.4, 0, 88, 1, D.y);
  ctx.gather.push({ x: cx, z: cz, kind: 'talk', y: D.y });
  // office block behind the deck
  batch.put(box(w, 10, 8), M.stoneUpper, V(cx, 5, D.z1 + 4), 0, null, { color: new THREE.Color(0.9, 0.88, 0.84) });
  batch.put(box(w + 0.1, 3, 8.1), M.facade, V(cx, D.y + 2.5, D.z1 + 4), 0, null, {});
  col.box(cx, D.z1 + 4, w / 2, 4, 0, 'office');
}

// automated guided vehicles shuttling containers along the apron lane; they stop for anyone in the way
function agvs(ctx) {
  const { scene, updaters, col } = ctx;
  const bodyM = new THREE.MeshStandardMaterial({ color: 0xe8a82c, roughness: 0.4, metalness: 0.3 });
  const contM = new THREE.MeshStandardMaterial({ map: ctx.cache.containerTex, color: 0xffffff, roughness: 0.55, metalness: 0.45 });
  const bodyG = mergeGeometries([box(7, 0.9, 3, 0, 0.65, 0), box(0.8, 0.5, 2.6, 3.5, 1.3, 0), box(0.8, 0.5, 2.6, -3.5, 1.3, 0)]);
  const beacon = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 1.2, 0.2) });
  const list = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Group();
    const b = new THREE.Mesh(bodyG, bodyM); b.castShadow = true;
    const c = new THREE.Mesh(new THREE.BoxGeometry(CL, CH, CW).translate(0, 1.1 + CH / 2, 0), contM.clone()); c.castShadow = true;
    c.material.color.set([0x8e2f1f, 0x2c6b6a, 0xd8d6cf][i]);
    const bl = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 4), beacon); bl.position.set(3.4, 1.7, 1.1);
    g.add(b, c, bl);
    for (const o of [b, c]) o.layers.enable(REFLECT_LAYER);
    scene.add(g);
    list.push({ g, c, bl, x: -60 + i * 40, dir: i % 2 ? -1 : 1, v: 0, load: i !== 1, hold: 0, blk: col.box(0, 0, 3.6, 1.6, 0, 'agv') });
  }
  updaters.push((dt, time) => {
    const f = ctx.focus;
    for (const a of list) {
      const ahead = a.x + a.dir * 5;
      const clear = !(Math.abs(f.z - -49.5) < 3 && (f.x - a.x) * a.dir > -1 && (f.x - a.x) * a.dir < 8);
      if (a.hold > 0) a.hold -= dt;
      const want = clear && a.hold <= 0 ? 3.2 : 0;
      a.v += (want - a.v) * Math.min(1, dt * (want ? 0.8 : 3));
      a.x += a.v * a.dir * dt;
      if (a.x > 44 || a.x < -64) { a.dir *= -1; a.hold = 5; a.load = !a.load; }
      a.g.position.set(a.x, 0, -49.5); a.g.rotation.y = a.dir > 0 ? 0 : Math.PI;
      a.c.visible = a.load;
      a.bl.visible = Math.sin(time * 8) > 0;
      a.blk.x = a.x; a.blk.z = -49.5;
      void ahead;
    }
  });
}

function city(ctx) {
  // Halcyon behind the port (south and west), towers lit against the dusk; shuttle lanes climbing out over the sea
  const FR = rng(71), spots = [];
  for (let i = 0; i < 70; i++) {
    const a = FR() * Math.PI * 2, d = 200 + FR() * 520;
    const x = Math.sin(a) * d, z = Math.cos(a) * d;
    if (z < -60 && x > -250) continue;
    if (spots.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 55)) continue;
    spots.push([x, z, (FR() * 4) | 0, 0.6 + FR() * 0.8, FR() * Math.PI, 0.8 + FR() * 0.6]);
  }
  const { far } = addTowerField(ctx, spots, { arch: archetypes(), y: -4 });
  ctx.farSky.push(...far);
  const lanes = [];
  for (const [x0, z0, x1, z1, y, sp] of [[-600, 150, 600, 120, 60, 28], [500, -200, -700, -250, 45, 30], [0, 300, -250, -900, 90, 34], [200, 400, 100, -900, 130, 36]]) lanes.push({ type: 'line', x0, z0, x1, z1, y, sp });
  addFlyingCars(ctx, lanes, Math.round(ctx.tier.traffic * 0.6), rng(33), { spread: 12, scale: 1.4 });
}

function terminal(ctx, L) {
  const { batch, M, col, scene } = ctx;
  // Freehaul terminal along the south edge: tiered glass, a gold canopy, the big board
  tiered(ctx, -14, 0, 104, 64, 20, 0, [{ h: 7 }, { h: 14, glass: true, warm: true, setback: 1.5 }, { h: 10, glass: true, setback: 3, garden: true }], 91);
  tiered(ctx, 44, 0, 110, 30, 24, 0, [{ h: 6 }, { h: 26, glass: true, setback: 1 }, { h: 12, glass: true, setback: 3 }], 92);
  batch.put(box(40, 0.4, 7), M.gold, V(-14, 5.2, 91), 0, null, {});
  for (let x = -32; x <= 4; x += 6) batch.add(cyl(0.18, 0.18, 5.2, x, 0, 88, 10), M.chrome);
  col.box(-14, 100, 34, 6, 0, 'terminal'); col.box(44, 104, 16, 8, 0, 'terminal');
  const reel = HOLO_ART.reel('brighter', 0.5);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(22, 11), createHoloMaterial(HOLO_ART.wide('FREEHAUL', 'MOVING HALCYON SINCE LAUNCH', 12, '#3a2a10'), { bright: 2.0, alpha: 0.95, time: ctx.time }));
  board.position.set(-14, 19, 93.6); board.rotation.y = Math.PI; board.layers.enable(REFLECT_LAYER); scene.add(board);
  registerBillboard(ctx, board.material, 1024, 512);
  const b2 = new THREE.Mesh(new THREE.PlaneGeometry(16, 8 * 1.0), createHoloMaterial(reel.canvas, { bright: 2.0, alpha: 0.95, time: ctx.time, reel: { ...reel, hold: 7 } }));
  b2.position.set(-66.5, 16, -6); b2.rotation.y = Math.PI / 2; b2.layers.enable(REFLECT_LAYER); scene.add(b2);
  registerBillboard(ctx, b2.material, 1024, 512);
  batch.put(box(1.2, 26, 1.2), M.darkMetal, V(-67.4, 13, -6), 0, null, {});
  col.circle(-67.4, -6, 0.8, 'board');
}

function buildPortside(ctx, onProgress = () => {}) {
  const L = PS_LAYOUT, { batch, M, col } = ctx;
  ctx.gather ||= [];
  const conts = [];
  const blocks = ground(ctx, L);
  water(ctx, L);
  onProgress(0.45, 'Mooring the freighters…');
  ship(ctx, conts);
  yard(ctx, blocks, conts);
  addContainers(ctx, conts);
  ctx.fadeMat?.(ctx.scene.getObjectByName('containers').material);
  for (const x of L.cranes) dockCrane(ctx, x, L.craneZ, { h: 30, boom: 34, back: 12, seed: x });
  onProgress(0.6, 'Fuelling the shuttles…');
  pads(ctx, L);
  shed(ctx, L);
  deck(ctx, L);
  agvs(ctx);
  terminal(ctx, L);
  city(ctx);
  // quay furniture: mooring bitts, bollards, a railing only where people linger
  for (let x = -64; x < 50; x += 8) bitt(ctx, x, -61.2);
  // the quay edge and east edge are closed (the water is a long way down)
  col.custom((x, z, r) => z - r < L.quayZ + 0.7 || (x + r > L.eastX - 0.6 && z < 30));
  // flood masts + their light pools, lamps on the walk
  const pools = [];
  for (const [x, z, rot] of [[-46, -40, 0], [-8, -40, 0], [26, -40, 0], [-22, 0, 0], [22, 12, Math.PI / 2], [18, 48, 0.4], [-40, 64, 0]]) {
    floodMast(ctx, x, z, 16, rot);
    pools.push([x, z + 2, 9, [1.0, 0.62, 0.32]]);
  }
  for (let z = -30; z <= 70; z += 14) { lamp(ctx, -3.6, z); lamp(ctx, 3.6, z + 7); pools.push([-3.6, z, 3.2, [1.0, 0.75, 0.45]], [3.6, z + 7, 3.2, [1.0, 0.75, 0.45]]); }
  for (const p of [L.padA, L.padB]) pools.push([p.x, p.z, p.r * 1.2, [0.35, 0.6, 1.0]]);
  lightPools(ctx, pools);
  // jersey barriers + planters on the walk, benches by the quay
  for (const [x, z, r] of [[-12, 36, 0], [12, 30, 0], [24, -36, Math.PI / 2], [-40, -36, Math.PI / 2]]) { batch.put(box(3, 0.9, 0.6), M.stone, V(x, 0.45, z), r, null, { color: new THREE.Color(0.8, 0.78, 0.74) }); col.box(x, z, 1.6, 0.35, r, 'barrier'); }
  for (const [x, z] of [[-10, 52], [10, 52], [-10, 22], [10, 18]]) planter(ctx, x, z, 3.2, 1.4, 0, (x * 7 + z) | 0, 1);
  for (const x of [-46, -10, 24, 36]) { const seats = bench(ctx, x, -58.4, Math.PI); ctx.gather.push({ x, z: -58.4, kind: 'sit', seats }); }
  for (const [x, z] of [[-18, 60], [18, 60], [-40, -58], [40, 58]]) bollard(ctx, x, z);
  locker(ctx, -42.6, 60, Math.PI / 2); locker(ctx, 20.6, -26, -Math.PI / 2); locker(ctx, 48, 84, Math.PI);
  kiosk(ctx);
  warehousePad(ctx);
  relay(ctx, L.relay.x, L.relay.z);
  ctx.gather.push({ x: -8, z: -56, kind: 'talk' }, { x: 12, z: -56, kind: 'talk' }, { x: -22, z: -40, kind: 'talk' }, { x: 16, z: 40, kind: 'talk' },
    { x: -38, z: 40, kind: 'talk' }, { x: 6, z: 64, kind: 'talk' }, { x: -24, z: 12, kind: 'talk' }, { x: 40, z: -24, kind: 'talk' });

  ctx.breakables = createBreakables(ctx, [
    { kind: 'crate', x: -46, z: 22, rot: 0.2 }, { kind: 'crate', x: -47, z: 25, stack: 1 }, { kind: 'crate', x: -46.5, z: 50 },
    { kind: 'crate', x: 24, z: -40, rot: 0.3 }, { kind: 'crate', x: 27, z: -41, stack: 1 }, { kind: 'crate', x: -2, z: -44, rot: 0.1 },
    { kind: 'crate', x: 40, z: -30, rot: 0.4 }, { kind: 'crate', x: 22, z: 2 }, { kind: 'crate', x: -24, z: 18, stack: 1 },
    { kind: 'vending', x: 22, z: 87, rot: Math.PI }, { kind: 'vending', x: 26, z: 87, rot: Math.PI }, { kind: 'vending', x: -42.6, z: 52, rot: Math.PI / 2 },
    { kind: 'holo', x: -7, z: 44, rot: 0.3 }, { kind: 'holo', x: -6, z: 14, rot: -0.3 }, { kind: 'holo', x: 20, z: -56, rot: 0 },
  ]);

  const S = [
    ['ps_dock_west', 'dock', -44, -57, 5], ['ps_dock_mid', 'dock', -10, -57, 5], ['ps_dock_east', 'dock', 30, -57, 5],
    ['ps_pad_a', 'pad', L.padA.x, L.padA.z + 6, 5], ['ps_pad_b', 'pad', L.padB.x, L.padB.z, 6],
    ['ps_warehouse_bay', 'warehouse', -52, 36, 6], ['ps_warehouse_yard', 'warehouse', -23, -12, 4],
    ['ps_vault_customs', 'vault', -62, 50, 3],
    ['ps_locker_shed', 'locker', -41.2, 60, 2.5], ['ps_locker_yard', 'locker', 19.2, -26, 2.5], ['ps_locker_terminal', 'locker', 48, 82.6, 2.5],
    ['ps_alley_stacks_w', 'alley', -45, -24, 3], ['ps_alley_stacks_e', 'alley', 0, -12, 3],
    ['ps_rooftop_deck', 'rooftop', -21, 72, 5], ['ps_plaza_terminal', 'plaza', -10, 72, 6], ['ps_plaza_apron', 'plaza', 0, -46, 6],
    ['ps_relay', 'relay', L.relay.x, L.relay.z - 2.8, 2.5],
    ['ps_spawn_quay_w', 'spawn_edge', -64, -52, 3], ['ps_spawn_quay_e', 'spawn_edge', 48, -52, 3], ['ps_spawn_shed', 'spawn_edge', -64, 60, 3], ['ps_spawn_pads', 'spawn_edge', 48, 84, 3],
    ['ps_vantage_deck', 'vantage', -30, 78, 2.5], ['ps_vantage_gantry', 'vantage', L.padA.x + 7, L.padA.z + 2, 2.5], ['ps_vantage_quay', 'vantage', 44, -58, 2.5],
    ['ps_hide_stacks', 'hide', -23, -24, 1.5], ['ps_hide_shed', 'hide', -64, 30, 1.5], ['ps_hide_tanks', 'hide', 42, 40, 1.5], ['ps_hide_crane', 'hide', -36, -53, 1.5],
    ['ps_npc_foreman', 'npc', -40, 30, 1.5], ['ps_npc_quay', 'npc', 2, -57, 1.5], ['ps_npc_pads', 'npc', L.padA.x - 14, L.padA.z + 4, 1.5], ['ps_npc_deck', 'npc', -16, 70, 1.5],
    ['ps_contract_terminal', 'terminal', L.kiosk.x, L.kiosk.z, 3], ['ps_warehouse_link', 'link_pad', L.pad.x, L.pad.z, 2.6],
  ];
  ctx.sites = S.map(([id, tag, x, z, r]) => ({ id, tag, x, z, r, y: col.groundAt(x, z), district: 'portside', indoor: false }));
}

const CROWD = {
  loops: [
    [[0, 76], [0, 40], [0, 0], [0, -40], [-20, -56], [20, -56], [0, -40], [0, 40]],
    [[-60, -24], [20, -24], [20, -12], [-60, -12]],
    [[18, 0], [24, 30], [20, 50], [8, 64], [8, 20]],
    [[-40, 40], [-24, 50], [-12, 60], [-30, 30]],
    [[-60, -56], [-10, -56], [40, -56], [40, -40], [-60, -40]],
    [[-44, 70], [-4, 70], [20, 84], [-40, 86]],
  ],
  talk: [[-8, -56], [12, -56], [-22, -40], [16, 40], [-38, 40], [6, 64], [-24, 12], [40, -24], [-50, 60], [24, 80]],
  count: 26,
};

export const PORTSIDE = {
  id: 'portside', name: 'Portside', layout: PS_LAYOUT, bounds: PS_LAYOUT.bounds, build: buildPortside, crowd: CROWD, batchCell: 64,
  adOrigins: [[0, 60], [0, 20], [-20, 80]], adCount: 4,
  env: (r, tier) => buildEnvironment(r, tier.envSize, { sun: new THREE.Vector3(...SUN).normalize(), dusk: 1 }),
  ambience: {
    sunDir: SUN, dusk: 1,
    sun: [1.0, 0.6, 0.36], sunI: 3.4, hemiSky: 0x8f88c0, hemiGround: 0x5a3e30, hemiI: 0.42,
    fog: [0.72, 0.52, 0.5], fogDensity: 0.0009, env: 0.85,
    gain: [1.06, 0.99, 0.92], lift: [0.012, 0.004, 0.012], sat: 1.14, contrast: 1.14,
  },
  spawnPoints: (L) => ({ player: [L.spawn.x, L.spawn.z], kiosk: [L.kiosk.x, L.kiosk.z + 2.5], pad: [L.pad.x, L.pad.z], relay: [L.relay.x, L.relay.z - 2.8] }),
};
