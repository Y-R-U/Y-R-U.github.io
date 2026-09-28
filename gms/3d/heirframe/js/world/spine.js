import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, cyl } from './geo.js';
import { createIndustrialGround, zoneMask } from './ind_ground.js';
import { lightPools, steamVents, leaks } from './p4_props.js';
import { rail, flowMaterial, blastDoor, consoleDesk, pipe, holoLabel, crateStack, YELLOW, STEEL, GRAPHITE } from './p5_props.js';
import { kiosk, warehousePad } from './plaza.js';
import { locker, relay } from './sites.js';
import { createBreakables } from './breakables.js';
import { createWaterfall, createMist } from './water.js';
import { HOLO_ART, createHoloMaterial, registerBillboard } from './holo.js';
import { rng } from './textures.js';
import { REFLECT_LAYER } from '../fx/reflection.js';

// The Spine: the ark's inner machinery. A long chasm runs north–south through the middle, 28 m down to a glowing coolant
// river; a grid of grated catwalks crosses it. West deck = the turbine hall (three drum turbines spinning), east deck =
// maintenance bays and the pump control room. South = arrival from the Stacks' runoff pipes; north = the FIRMAMENT ACCESS
// blast door (AUTH: VAEL) that leads out to the hull. The waterfalls' runoff pours back into the river here (clue C15).
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const SP_LAYOUT = {
  bounds: { x0: -46, x1: 46, z0: -100, z1: 96 },
  chasm: { x0: -14, x1: 14, z0: -74, z1: 58, floor: -28 },
  walk: 2, bridges: [40, 0, -40], ceil: 34,
  turbines: [[-31, 22], [-31, -18], [-31, -56]],
  control: { x0: 28, x1: 42, z0: -10, z1: 10 },
  door: { x: 0, z: -98.6 },
  spawn: { x: 0, z: 84 },
  relay: { x: -12, z: 88 },
  kiosk: { x: 12, z: 78, rot: -0.6 },
  pad: { x: -14, z: 70 },
};

function spineEnv(renderer, tier) {
  const s = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(90, 40, 200), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.018, 0.022, 0.028), side: THREE.BackSide }));
  room.position.y = 10; s.add(room);
  const add = (w, h, c, x, y, z, rx = 0, ry = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(...c), side: THREE.DoubleSide })); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); s.add(m); };
  for (const x of [-20, 0, 20]) add(1.2, 180, [2.2, 2.0, 1.7], x, 29, 0, Math.PI / 2);          // ceiling work-light strips
  add(24, 180, [0.08, 0.7, 0.9], 0, -14, 0, Math.PI / 2);                                      // the coolant glow below
  const R = rng(12);
  for (let i = 0; i < 40; i++) add(1 + R() * 3, 0.4 + R() * 1.5, R() < 0.7 ? [1.6, 0.9, 0.4] : [0.3, 1.0, 1.6], (R() < 0.5 ? -1 : 1) * 44, 1 + R() * 26, (R() - 0.5) * 190, 0, Math.PI / 2);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0, 0.1, 300, { size: tier.envSize || 256 });
  pm.dispose();
  s.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  rt.texture.userData.rt = rt;
  return rt.texture;
}

function ground(ctx, L) {
  const C = L.chasm, W = L.walk;
  const mask = zoneMask({ x0: -48, x1: 48, z0: -102, z1: 98 }, (P) => {
    P.rect(-46, C.z0, C.x0, C.z1, '#f00'); P.rect(C.x1, C.z0, 46, C.z1, '#f00');                     // steel decks
    P.rect(C.x0 - 0.9, C.z0, C.x0, C.z1, 'rgb(0,255,255)'); P.rect(C.x1, C.z0, C.x1 + 0.9, C.z1, 'rgb(0,255,255)');
    P.rect(C.x0, C.z1, C.x1, C.z1 + 0.9, 'rgb(0,255,255)'); P.rect(C.x0, C.z0 - 0.9, C.x1, C.z0, 'rgb(0,255,255)');
    P.rect(-W, C.z0, W, C.z1, '#00f');                                                             // grated catwalks
    for (const z of L.bridges) P.rect(C.x0, z - W, C.x1, z + W, '#00f');
    for (const x of [-30, 30]) P.rect(x - 0.12, 58, x + 0.12, 96, 'rgb(0,150,0)');                   // walk lines on the platforms
    P.rect(-40, 62, 40, 62.25, 'rgb(0,150,0)'); P.rect(-40, -78.25, 40, -78, 'rgb(0,150,0)');
    P.rect(-8, -99, 8, -92, 'rgb(0,255,255)');                                                   // hazard apron at the door
    P.rect(-46, -8, -40, 8, 'rgb(0,0,255)');
  });
  const rects = [[-46, 46, C.z1, 96], [-46, 46, -100, C.z0], [-46, C.x0, C.z0, C.z1], [C.x1, 46, C.z0, C.z1], [-W, W, C.z0, C.z1]];
  for (const z of L.bridges) rects.push([C.x0, -W, z - W, z + W], [W, C.x1, z - W, z + W]);
  createIndustrialGround(ctx, [{ rects, y: 0, reflect: false, ao: true }], mask, { slab: 4, tint: [0.42, 0.43, 0.46], wet: 0.12, rust: 0.4, interior: true, key: 'sp' });
  // walkable = decks + catwalks; everything else over the chasm is a drop
  ctx.col.custom((x, z, r) => {
    if (!(x > C.x0 - r && x < C.x1 + r && z > C.z0 - r && z < C.z1 + r)) return false;
    if (Math.abs(x) < W - r) return false;
    for (const b of L.bridges) if (Math.abs(z - b) < W - r) return false;
    return true;
  });
}

function chasm(ctx, L) {
  const { batch, M, scene } = ctx, C = L.chasm, W = L.walk, D = C.floor;
  const wallC = new THREE.Color(0.3, 0.32, 0.36);
  // chasm walls (seen from above): slabs, ribs, pipe runs and light strips going down into the glow
  for (const sd of [-1, 1]) {
    const x = sd * C.x1;
    batch.put(box(1.2, -D + 2, C.z1 - C.z0), M.stoneUpper, V(x + sd * 0.6, D / 2 - 1, (C.z0 + C.z1) / 2), 0, null, { color: wallC, cellKey: 'cw' + sd });
    for (let z = C.z0 + 4; z < C.z1; z += 8) batch.put(box(0.8, -D, 1.0), M.stoneUpper, V(x - sd * 0.2, D / 2, z), 0, null, { color: GRAPHITE, cast: false, cellKey: 'cw' + sd });
    for (const [y, r] of [[-5, 0.5], [-9, 0.9], [-17, 0.7]]) {
      const pg = new THREE.CylinderGeometry(r, r, C.z1 - C.z0, 12, 1, true); pg.rotateX(Math.PI / 2);
      batch.put(pg, M.stoneUpper, V(x - sd * (r + 0.7), y, (C.z0 + C.z1) / 2), 0, null, { color: STEEL, cast: false, cellKey: 'cw' + sd });
    }
    for (const y of [-2.5, -12, -21]) batch.put(box(0.1, 0.18, C.z1 - C.z0), M.warmGlow, V(x - sd * 0.25, y, (C.z0 + C.z1) / 2), 0, null, { cast: false, color: y < -10 ? new THREE.Color(0.25, 0.9, 1.3) : new THREE.Color(1.3, 0.8, 0.4), cellKey: 'cw' + sd });
  }
  for (const z of [C.z0, C.z1]) batch.put(box(C.x1 - C.x0 + 2.4, -D + 2, 1.2), M.stoneUpper, V(0, D / 2 - 1, z + (z < 0 ? -0.6 : 0.6)), 0, null, { color: wallC });
  // the coolant river
  const river = new THREE.Mesh(new THREE.PlaneGeometry(C.x1 - C.x0, C.z1 - C.z0).rotateX(-Math.PI / 2), flowMaterial(ctx, { color: [0.03, 0.32, 0.42], core: [0.4, 1.5, 1.8], speed: -2.2, scale: 0.8 }));
  river.position.set(0, D + 2, (C.z0 + C.z1) / 2); river.name = 'coolant'; scene.add(river);
  // catwalk undersides, trusses and support columns down to the river
  batch.put(box(2 * W, 0.7, C.z1 - C.z0), M.stoneUpper, V(0, -0.4, (C.z0 + C.z1) / 2), 0, null, { color: GRAPHITE });
  for (const z of L.bridges) batch.put(box(C.x1 - C.x0, 0.7, 2 * W), M.stoneUpper, V(0, -0.4, z), 0, null, { color: GRAPHITE });
  for (let z = C.z0 + 12; z < C.z1; z += 22) {
    batch.add(cyl(0.45, 0.6, -D - 1.5, 0, D + 2, z, 12), M.stoneUpper, { color: STEEL });
    for (const sd of [-1, 1]) { const g = box(0.25, 0.25, 7.5); g.rotateX(sd * 0.75); batch.put(g, M.darkMetal, V(0, -3.2, z + sd * 2.7), 0, null, { cast: false }); }
  }
  // rails: deck edges (gaps at the catwalks), catwalk and bridge sides
  const gaps = [C.z0, ...L.bridges.slice().reverse().flatMap((b) => [b - W, b + W]), C.z1].sort((a, b) => a - b);
  for (const sd of [-1, 1]) for (let i = 0; i < gaps.length; i += 2) rail(ctx, [[sd * (C.x1 + 0.15), gaps[i]], [sd * (C.x1 + 0.15), gaps[i + 1]]]);
  for (const z of [C.z0 - 0.15, C.z1 + 0.15]) { rail(ctx, [[C.x0, z], [-W, z]]); rail(ctx, [[W, z], [C.x1, z]]); }
  const cz = [C.z0, ...L.bridges.slice().sort((a, b) => a - b).flatMap((b) => [b - W, b + W]), C.z1];
  for (const sd of [-1, 1]) for (let i = 0; i < cz.length; i += 2) rail(ctx, [[sd * W, cz[i]], [sd * W, cz[i + 1]]]);
  for (const b of L.bridges) for (const sd of [-1, 1]) { rail(ctx, [[C.x0, b + sd * W], [-W, b + sd * W]]); rail(ctx, [[W, b + sd * W], [C.x1, b + sd * W]]); }
  // runoff falls: outlet pipes in the chasm walls pour into the river
  for (const [sd, z, w] of [[-1, 50, 5], [1, 20, 4], [-1, -30, 4], [1, -66, 6]]) {
    const x = sd * C.x1;
    const out = new THREE.CylinderGeometry(w * 0.45, w * 0.45, 2.4, 16, 1, true); out.rotateZ(Math.PI / 2);
    batch.put(out, M.stoneUpper, V(x - sd * 0.8, -2.2, z), 0, null, { color: STEEL, cast: false });
    const f = createWaterfall(ctx, { width: w * 0.8, height: -D - 4, lip: 1.2, bright: 0.85, segsY: 16 });
    f.position.set(x - sd * 1.6, -2.4, z); f.rotation.y = -sd * Math.PI / 2; scene.add(f);
    if (ctx.tier.mist) { const m = createMist(ctx, { x: x - sd * 3.5, y: D + 2.2, z, w: w * 1.2, d: 3, count: 60, size: 4 }); m.rotation.y = -sd * Math.PI / 2; scene.add(m); }
  }
}

// drum turbine: open rib cage around a spinning bladed rotor, glowing core band, intake pipe into the chasm
function turbine(ctx, x, z, seed) {
  const { batch, M, scene, col, updaters } = ctx;
  const R = 6, H = 13;
  batch.add(cyl(R + 1, R + 1.3, 0.8, x, 0, z, 32), M.stoneUpper, { color: GRAPHITE });
  for (const y of [0.8, H - 0.6]) batch.put(new THREE.TorusGeometry(R, 0.45, 8, 40).rotateX(Math.PI / 2), M.stoneUpper, V(x, y, z), 0, null, { color: STEEL });
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; batch.put(box(0.6, H, 0.9), M.stoneUpper, V(x + Math.sin(a) * R, H / 2 + 0.4, z + Math.cos(a) * R), a, null, { color: i % 2 ? STEEL : GRAPHITE }); }
  batch.add(cyl(R + 0.4, R + 0.4, 1.2, x, H, z, 32), M.stoneUpper, { color: GRAPHITE });
  batch.put(new THREE.TorusGeometry(R + 0.45, 0.14, 6, 48).rotateX(Math.PI / 2), M.blueGlow, V(x, H + 0.6, z), 0, null, { cast: false, color: new THREE.Color(0.3, 1.1, 1.5) });
  batch.add(cyl(1.6, 2.2, 4, x, H + 1.2, z, 20), M.stoneUpper, { color: STEEL });
  batch.put(new THREE.TorusGeometry(R - 0.2, 0.18, 6, 48).rotateX(Math.PI / 2), M.warmGlow, V(x, 6.5, z), 0, null, { cast: false, color: new THREE.Color(0.2, 1.0, 1.4) });
  // rotor
  const parts = [new THREE.CylinderGeometry(1.1, 1.1, H - 1.4, 16).translate(0, H / 2, 0)];
  for (let i = 0; i < 6; i++) {
    const b = new THREE.BoxGeometry(R - 1.6, H - 3, 0.18); b.translate((R - 1.6) / 2 + 1, H / 2, 0);
    b.rotateY((i / 6) * Math.PI * 2); parts.push(b);
  }
  const mesh = new THREE.Mesh(mergeAll(parts), ctx.cache.rotorMat ||= new THREE.MeshStandardMaterial({ color: 0xb7bcc4, roughness: 0.3, metalness: 0.9, envMapIntensity: 1.2 }));
  mesh.position.set(x, 0.2, z); mesh.castShadow = true; mesh.name = 'rotor'; scene.add(mesh);
  const spd = 1.4 + seed * 0.3;
  updaters.push((dt) => { mesh.rotation.y += dt * spd; });
  col.circle(x, z, R + 1.3, 'turbine');
  // intake pipe over the deck into the chasm, and a pump housing at the edge
  pipe(ctx, [x + R + 0.5, 7, z], [-13, 7, z], 1.1, { color: STEEL, step: 4 });
  pipe(ctx, [-13.6, 7, z], [-13.6, -20, z], 1.1, { color: STEEL, step: 5 });
  batch.put(box(3.4, 3.4, 3.4), M.stoneUpper, V(-17, 1.7, z), 0, null, { color: GRAPHITE });
  batch.put(box(0.1, 0.8, 2.6), M.warmGlow, V(-15.25, 2.4, z), 0, null, { cast: false, color: new THREE.Color(1.2, 0.7, 0.3) });
  col.box(-17, z, 1.75, 1.75, 0, 'pump');
}

function mergeAll(list) { const g = mergeGeometries(list, false); list.forEach((q) => q.dispose()); return g; }

function hall(ctx, L) {
  const { batch, M, scene } = ctx;
  const T = L.ceil, b = L.bounds;
  // outer walls, ribs every 16 m (the spine's frames), the ceiling with work-light strips
  const wallC = new THREE.Color(0.24, 0.26, 0.3);
  for (const sd of [-1, 1]) {
    batch.put(box(1, T, b.z1 - b.z0), M.stoneUpper, V(sd * (b.x1 + 0.5), T / 2, (b.z0 + b.z1) / 2), 0, null, { color: wallC, cast: false, cellKey: 'wall' + sd });
    for (const y of [3.5, 8, 16]) {
      const pg = new THREE.CylinderGeometry(0.6, 0.6, b.z1 - b.z0, 12, 1, true); pg.rotateX(Math.PI / 2);
      batch.put(pg, M.stoneUpper, V(sd * (b.x1 - 0.7), y, (b.z0 + b.z1) / 2), 0, null, { color: y > 10 ? new THREE.Color(0.45, 0.3, 0.22) : STEEL, cast: false, cellKey: 'wall' + sd });
    }
  }
  for (let z = b.z0 + 6; z < b.z1; z += 16) {
    for (const sd of [-1, 1]) batch.put(box(2.2, T, 2.2), M.stoneUpper, V(sd * (b.x1 - 1.1), T / 2, z), 0, null, { color: GRAPHITE, cellKey: 'rib' });
    batch.put(box(2 * b.x1, 2.4, 2.2), M.stoneUpper, V(0, T - 1.2, z), 0, null, { color: GRAPHITE, cast: false, reflect: false, cellKey: 'rib' });
    for (const sd of [-1, 1]) { const g = box(10, 1.4, 1.6); g.rotateZ(sd * 0.7); batch.put(g, M.stoneUpper, V(sd * (b.x1 - 4.5), T - 4.5, z), 0, null, { color: GRAPHITE, cast: false, reflect: false, cellKey: 'rib' }); }
    for (const sd of [-1, 1]) batch.put(box(0.3, 0.3, 0.3), M.warmGlow, V(sd * (b.x1 - 2.3), 5, z), 0, null, { cast: false, color: new THREE.Color(1.5, 0.4, 0.1) });
  }
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(2 * b.x1 + 2, b.z1 - b.z0 + 40).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.8, metalness: 0.6 }));
  ceil.position.set(0, T, (b.z0 + b.z1) / 2); scene.add(ceil);
  for (const x of [-26, 0, 26]) batch.put(box(0.8, 0.2, b.z1 - b.z0), M.warmGlow, V(x, T - 2.6, (b.z0 + b.z1) / 2), 0, null, { cast: false, reflect: false, color: new THREE.Color(1.3, 1.25, 1.1), cellKey: 'lights' });
  // end walls: south = the runoff intake tunnel mouth, north = the bulkhead with the Firmament door and lattice
  batch.put(box(2 * b.x1 + 2, T, 1), M.stoneUpper, V(0, T / 2, b.z1 + 0.5), 0, null, { color: wallC, cast: false });
  batch.put(new THREE.TorusGeometry(7, 1, 10, 40), M.stoneUpper, V(0, 8, b.z1 - 0.2), 0, null, { color: STEEL });
  batch.put(new THREE.CircleGeometry(7, 32).rotateY(Math.PI), M.stoneUpper, V(0, 8, b.z1 - 0.05), 0, null, { color: new THREE.Color(0.03, 0.035, 0.04), cast: false });
  for (const x of [-5, 5]) { pipe(ctx, [x, 7, b.z1], [x, 7, 57.5], 1.0, { color: STEEL }); pipe(ctx, [x, 7.9, 57.5], [x, -20, 57.5], 1.0, { color: STEEL }); }
  batch.put(box(2 * b.x1 + 2, T, 1), M.stoneUpper, V(0, T / 2, b.z0 - 0.5), 0, null, { color: wallC, cast: false });
  for (let x = -40; x <= 40; x += 5) if (Math.abs(x) > 8) batch.put(box(0.3, T - 12, 0.3), M.stoneUpper, V(x, 12 + (T - 12) / 2, b.z0 + 0.4), 0, null, { cast: false, color: STEEL, cellKey: 'lattice' });
  for (let y = 12; y < T; y += 4) batch.put(box(80, 0.25, 0.3), M.stoneUpper, V(0, y, b.z0 + 0.5), 0, null, { cast: false, color: STEEL, cellKey: 'lattice' });
  for (const x of [-12, 12]) batch.put(box(1.2, T - 12, 0.5), M.stoneUpper, V(x, 12 + (T - 12) / 2, b.z0 + 0.6), 0, null, { color: YELLOW, cast: false, cellKey: 'lattice' });
}

function bays(ctx, L) {
  const { batch, M, col } = ctx;
  // maintenance bays: racks of spare turbine blades and parts crates
  for (const zc of [40, -40]) {
    for (let i = 0; i < 3; i++) {
      const z = zc - 8 + i * 8;
      batch.put(box(12, 0.15, 1.6), M.stoneUpper, V(38, 2.2, z), 0, null, { color: STEEL });
      batch.put(box(12, 0.15, 1.6), M.stoneUpper, V(38, 4.4, z), 0, null, { color: STEEL });
      for (const x of [32.2, 38, 43.8]) batch.put(box(0.2, 5, 0.2), M.stoneUpper, V(x, 2.5, z), 0, null, { color: YELLOW });
      for (let k = 0; k < 5; k++) { const g = box(0.12, 1.8, 1.3); g.rotateZ(0.15); batch.put(g, M.chrome, V(33.5 + k * 2.2, 3.35, z), 0, null, { color: new THREE.Color(0.75, 0.78, 0.82), cast: false }); }
      for (let k = 0; k < 4; k++) batch.put(box(1.2, 0.9, 1.2), M.crate, V(33.6 + k * 2.8, 0.45, z), k * 0.2, null, { color: new THREE.Color(0.5, 0.55, 0.6) });
      col.box(38, z, 6.1, 0.85, 0, 'rack');
    }
    crateStack(ctx, 22, zc + 6, 0.3, 2); crateStack(ctx, 24, zc - 5, -0.2, 1);
  }
  // pump control room: low wall + glass, consoles, the ark schematic holo (a cylinder — a clue)
  const C = L.control, cx = (C.x0 + C.x1) / 2, cz = (C.z0 + C.z1) / 2;
  const seg = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(x1 - x0, z1 - z0), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    batch.put(box(0.3, 1.1, len), M.stoneUpper, V(mx, 0.55, mz), a, null, { color: STEEL });
    batch.put(box(0.06, 1.8, len), M.glassDark, V(mx, 2.0, mz), a, null, { cast: false });
    batch.put(box(0.25, 0.15, len), M.stoneUpper, V(mx, 2.95, mz), a, null, { color: GRAPHITE, cast: false });
    col.box(mx, mz, 0.2, len / 2, a, 'ctrl');
  };
  seg(C.x0, C.z0, C.x0, cz - 2); seg(C.x0, cz + 2, C.x0, C.z1); seg(C.x1, C.z0, C.x1, C.z1); seg(C.x0, C.z0, C.x1, C.z0); seg(C.x0, C.z1, C.x1, C.z1);
  batch.put(box(C.x1 - C.x0, 0.2, C.z1 - C.z0), M.stoneUpper, V(cx, 3.1, cz), 0, null, { color: GRAPHITE, cast: false, reflect: false });
  for (const [x, z, r] of [[31, -7.5, Math.PI], [36, -7.5, Math.PI], [40, -3, -Math.PI / 2], [40, 3, -Math.PI / 2], [34, 7.5, 0]]) consoleDesk(ctx, x, z, r, r === 0 ? [1.4, 0.7, 0.3] : [0.35, 0.8, 1.4]);
  const holo = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 3.2, 20, 6, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.9, 1.4), wireframe: true, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  holo.rotation.z = Math.PI / 2; holo.position.set(34, 1.7, 0.5); ctx.scene.add(holo);
  ctx.updaters.push((dt) => { holo.rotation.x += dt * 0.4; });
  batch.add(cyl(0.9, 1.0, 0.8, 34, 0, 0.5, 20), M.stoneUpper, { color: GRAPHITE });
  col.circle(34, 0.5, 1.0, 'holo');
  holoLabel(ctx, 'PUMP CONTROL  •  LOOP 7', cx, 4.2, C.z1 + 0.5, 4.2, [0.7, 1.0, 1.2]);
}

function buildSpine(ctx, onProgress = () => {}) {
  const L = SP_LAYOUT, { batch, M, col } = ctx;
  ctx.gather ||= [];
  ground(ctx, L);
  chasm(ctx, L);
  onProgress(0.45, 'Spinning up the turbines…');
  L.turbines.forEach(([x, z], i) => turbine(ctx, x, z, i));
  hall(ctx, L);
  bays(ctx, L);
  blastDoor(ctx, L.door.x, L.door.z, 0, { w: 11, h: 9 });
  ctx.interactables.push({ id: 'passage', to: 'hullside', story: 'a4_m4', label: 'Firmament Access — AUTH: VAEL', x: L.door.x, z: L.door.z + 3.5, r: 3.2 });
  // Harmony's reach down here: one propaganda screen on the west wall, ops boards on the east
  const W = L.bounds.x1;
  for (const [art, sd, y, z, w] of [[HOLO_ART.ad('HARMONY', 'EVERY DROP RETURNS', 11), -1, 12, 30, 14], [HOLO_ART.ad('LOOP 7', 'COOLANT NOMINAL  •  212 YRS', 5, '#10303a'), 1, 10, -24, 10]]) {
    const h = w * art.height / art.width;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), createHoloMaterial(art, { bright: 2.1, alpha: 0.95, tint: [0.7, 0.95, 1.2], time: ctx.time }));
    m.position.set(sd * (W - 1.6), y, z); m.rotation.y = -sd * Math.PI / 2; m.layers.enable(REFLECT_LAYER); ctx.scene.add(m);
    registerBillboard(ctx, m.material, art.width, art.height);
  }
  // south arrival: relay, contracts, warehouse link, a locker
  kiosk(ctx); warehousePad(ctx); relay(ctx, L.relay.x, L.relay.z);
  locker(ctx, 30, 94.4, Math.PI);
  for (const [x, z] of [[-30, 66], [26, 70], [-24, 86]]) crateStack(ctx, x, z, x * 0.1, 2);
  crateStack(ctx, -34, -84, 0.2, 2); crateStack(ctx, 32, -90, -0.3, 3); crateStack(ctx, 36, -80, 0.1, 1);
  // lamps: amber pools on the decks, cyan up-glow at the chasm edges
  const pools = [];
  for (let z = -66; z < 56; z += 16) for (const sd of [-1, 1]) {
    const x = sd * 16.5;
    batch.add(cyl(0.08, 0.12, 4.2, x, 0, z, 8), M.darkMetal);
    batch.put(box(0.8, 0.12, 0.3), M.warmGlow, V(x, 4.2, z), 0, null, { cast: false, color: new THREE.Color(1.3, 0.8, 0.4) });
    col.circle(x, z, 0.2, 'lamp');
    pools.push([x, z, 4.5, [1.1, 0.65, 0.3]], [sd * 13.2, z + 8, 3, [0.2, 0.8, 1.0]]);
  }
  for (const [x, z] of [[-20, 75], [20, 75], [0, -86], [-24, -86], [24, -86], [0, 66]]) pools.push([x, z, 7, [1.0, 0.72, 0.4]]);
  pools.push([L.door.x, L.door.z + 4, 6, [1.2, 0.8, 0.35]], [34, 0, 6, [0.3, 0.7, 1.1]]);
  L.turbines.forEach(([x, z]) => pools.push([x, z, 9, [0.2, 0.75, 1.0]]));
  lightPools(ctx, pools);
  const vents = L.turbines.map(([x, z]) => [x, 14, z, 1.4]);
  vents.push([-17, 3.4, 22, 0.8], [-17, 3.4, -56, 0.8], [0, -26, -10, 3], [0, -26, 30, 3], [30, 0.1, -60, 0.8]);
  steamVents(ctx, vents);
  const R = rng(5), lk = [];
  for (let i = 0; i < 14; i++) lk.push([(R() < 0.5 ? -1 : 1) * (44 - R() * 2), 8 + R() * 8, -90 + R() * 180, 0.5]);
  leaks(ctx, lk, { per: 12 });
  // crew gathering spots
  ctx.gather.push({ x: -20, z: 64, kind: 'talk' }, { x: 36, z: 4, kind: 'talk' }, { x: 26, z: -36, kind: 'talk' }, { x: -22, z: 2, kind: 'talk' });

  ctx.breakables = createBreakables(ctx, [
    { kind: 'crate', x: 20.5, z: 28, rot: 0.2 }, { kind: 'crate', x: 21, z: -50, stack: 1 }, { kind: 'crate', x: -22, z: 36 },
    { kind: 'crate', x: -40, z: -34, rot: 0.4 }, { kind: 'crate', x: 16, z: 90, stack: 1 }, { kind: 'crate', x: -40, z: -92 },
    { kind: 'vending', x: -45.2, z: 70, rot: Math.PI / 2 }, { kind: 'vending', x: 45.2, z: 60, rot: -Math.PI / 2 },
    { kind: 'holo', x: -20, z: -30, rot: 0.3 }, { kind: 'holo', x: 22, z: 12, rot: -0.3 },
  ]);
  const S = [
    ['sp_catwalk_spine', 'catwalk', 0, -20, 3], ['sp_bridge_s', 'catwalk', -8, 40, 2.5], ['sp_bridge_mid', 'catwalk', 8, 0, 2.5], ['sp_bridge_n', 'catwalk', -8, -40, 2.5],
    ['sp_turbine_hall', 'interior', -31, 2, 6], ['sp_control_room', 'interior', 37, -3, 3],
    ['sp_bay_n', 'warehouse', 30, -40, 5], ['sp_bay_s', 'warehouse', 30, 40, 5],
    ['sp_arrival', 'plaza', 0, 72, 6], ['sp_locker', 'locker', 30, 93, 2.5],
    ['sp_firmament_door', 'vault', L.door.x, L.door.z + 3.5, 3], ['sp_keeper_arena', 'arena', 0, -86, 10],
    ['sp_relay', 'relay', L.relay.x, L.relay.z - 2.8, 2.5],
    ['sp_spawn_tunnel', 'spawn_edge', 0, 93, 3], ['sp_spawn_nw', 'spawn_edge', -42, -96, 3], ['sp_spawn_west', 'spawn_edge', -43, -38, 3], ['sp_spawn_east', 'spawn_edge', 43, 20, 3],
    ['sp_vantage_sw', 'vantage', -16, 60, 2.5], ['sp_vantage_ne', 'vantage', 16, -76, 2.5],
    ['sp_hide_turbine', 'hide', -42, -18, 1.5], ['sp_hide_rack', 'hide', 26, 44, 1.5], ['sp_hide_ctrl', 'hide', 26, -12, 1.5], ['sp_hide_crates', 'hide', 30, -88, 1.5],
    ['sp_npc_foreman', 'npc', -20, 64, 1.5], ['sp_npc_control', 'npc', 36, 3, 1.5], ['sp_npc_bay', 'npc', 26, -34, 1.5],
    ['sp_contract_terminal', 'terminal', L.kiosk.x, L.kiosk.z, 3], ['sp_warehouse_link', 'link_pad', L.pad.x, L.pad.z, 2.6],
  ];
  ctx.sites = S.map(([id, tag, x, z, r]) => ({ id, tag, x, z, r, y: col.groundAt(x, z), district: 'spine', indoor: true }));
}

const CROWD = {
  loops: [[[-20, 70], [-20, 10], [-22, -40], [-20, 10]], [[24, 70], [24, 0], [24, -60], [24, 0]], [[0, 70], [0, -60], [0, 70]]],
  talk: [[-20, 64], [36, 4], [26, -36], [-22, 2]],
  count: 6,
};

export const SPINE = {
  id: 'spine', name: 'The Spine', layout: SP_LAYOUT, bounds: SP_LAYOUT.bounds, build: buildSpine, crowd: CROWD, batchCell: 64,
  farCrowd: 0, adCount: 0, adOrigins: [], mirror: false,
  env: (r, tier) => spineEnv(r, tier),
  ambience: {
    interior: true, background: 0x030406, sunDir: [0.25, 1.0, 0.15],
    sun: [0.85, 0.9, 1.0], sunI: 1.5, hemiSky: 0x5a6a80, hemiGround: 0x0e4a58, hemiI: 0.6,
    fog: [0.04, 0.075, 0.085], fogDensity: 0.006, env: 1.2,
    gain: [1.0, 1.0, 1.02], lift: [0.004, 0.008, 0.01], sat: 1.12, contrast: 1.16,
  },
  spawnPoints: (L) => ({ player: [L.spawn.x, L.spawn.z], kiosk: [L.kiosk.x, L.kiosk.z + 2.5], pad: [L.pad.x, L.pad.z], relay: [L.relay.x, L.relay.z - 2.8], firmament: [L.door.x, L.door.z + 4] }),
};
