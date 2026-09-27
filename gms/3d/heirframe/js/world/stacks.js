import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, cyl } from './geo.js';
import { createIndustrialGround, zoneMask } from './ind_ground.js';
import { lightPools, cable, leaks, steamVents, floodMast } from './p4_props.js';
import { kiosk, warehousePad, railing } from './plaza.js';
import { locker, relay, dumpster } from './sites.js';
import { HOLO_ART, createHoloMaterial, registerBillboard, faceCamera, twoSided } from './holo.js';
import { createBreakables } from './breakables.js';
import { createWaterMaterial } from './water.js';
import { rng } from './textures.js';
import { REFLECT_LAYER } from '../fx/reflection.js';

// The Stacks: the undercity under Halcyon's surface. A pipe canyon running north–south between two walls of pod hostels
// stacked 20 high (one shader: coffin hatches, lit / dark / flickering, rust runs), catwalks and pipes on the walls, cables
// strung across, Harmony-blue ads and neon blade signs, steam from the grates and water raining from leaking pipes onto a
// wet, rusty floor. West alley = Stack 9's pod rows; east alley = Rook's corner; the far (north) end floods into the sub-stack
// (Rustmother's arena). The city's underside closes the sky 60 m up, with a few shafts of daylight falling through.
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const POD_W = 2.4, POD_H = 2.2;

export const ST_LAYOUT = {
  bounds: { x0: -42, x1: 42, z0: -99, z1: 95 },
  wallX: 14, top: 44, ceil: 60,
  alleyW: { z0: -34, z1: -16, x0: -42 }, alleyE: { z0: 68, z1: 84, x1: 42 },
  catwalk: { x0: 11, x1: 14, z0: -60, z1: 56, y: 4.4, stairZ: 66 },
  flood: { z0: -99, z1: -72 },
  home: { x: -12.6, z: 40 },
  spawn: { x: 0, z: 86 },
  relay: { x: -8, z: 90 },
  kiosk: { x: 8, z: 78, rot: -0.6 },
  pad: { x: -7, z: 70 },
};

// Pod-front material: uv units = one pod (2.4 x 2.2 m). Lit by the scene; hatches glow. uCull darkens pods (power cull).
function podMaterial(ctx) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.5, envMapIntensity: 0.8 });
  m.defines = { USE_UV: '' };
  const u = { uTime: ctx.time, uCull: { value: 0 }, uCullZ: { value: new THREE.Vector2(-1e4, 1e4) } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vSeed; varying vec3 vWP;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
vSeed = instanceMatrix[3].x * 1.37 + instanceMatrix[3].y * 3.1 + instanceMatrix[3].z * 0.71;
#else
vSeed = 0.0;
#endif`)
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvWP = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform float uTime, uCull; uniform vec2 uCullZ; varying float vSeed; varying vec3 vWP;
float pH(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float pN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(pH(i), pH(i + vec2(1, 0)), f.x), mix(pH(i + vec2(0, 1)), pH(i + vec2(1, 1)), f.x), f.y); }
float rbox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
vec3 podGlow = vec3(0.0);`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  vec2 cell = floor(vUv), f = fract(vUv);
  float id = pH(cell + vSeed * 0.113);
  float far = smoothstep(0.08, 0.3, fwidth(vUv.x));
  float frame = 1.0 - smoothstep(0.035, 0.05, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y) * 1.1));
  float hd = rbox((f - vec2(0.5, 0.58)) * vec2(1.0, 1.1), vec2(0.23, 0.17), 0.12);
  float hatch = 1.0 - smoothstep(-0.005, 0.01, hd);
  float rim = (1.0 - smoothstep(0.0, 0.03, abs(hd - 0.02))) * (1.0 - far);
  float grille = step(0.14, f.y) * step(f.y, 0.28) * step(0.62, f.x) * step(f.x, 0.86) * step(0.5, fract(f.y * 40.0)) * (1.0 - far);
  float plate = step(0.12, f.x) * step(f.x, 0.34) * step(0.16, f.y) * step(f.y, 0.24);
  // rust runs from the hatch sill and the joints, stronger low on the wall
  float run = smoothstep(0.55, 0.9, pN(vec2(vUv.x * 9.0, vUv.y * 0.6 + cell.x)) * pN(vec2(vUv.x * 23.0, vUv.y * 1.3))) * step(f.y, 0.46) * (1.0 - far * 0.5);
  float grime = pN(vUv * vec2(0.7, 0.35) + vSeed) * 0.6 + pN(vUv * 3.1) * 0.4;
  vec3 panel = mix(vec3(0.34, 0.34, 0.36), vec3(0.42, 0.36, 0.3), step(0.6, pH(cell + 2.0 + vSeed))) * (0.7 + 0.35 * grime);
  panel = mix(panel, vec3(0.28, 0.12, 0.05), run * 0.8);
  panel *= 1.0 - 0.6 * frame;
  panel = mix(panel, vec3(0.12), grille * 0.8);
  panel = mix(panel, vec3(0.75, 0.72, 0.62), plate * 0.6 * (1.0 - far));
  panel = mix(panel, vec3(0.1), rim);
  // hatch: dark glass, or lit (amber lamp, Harmony-blue screen, rare magenta), some flicker; culled pods go dark
  float kind = pH(cell * 1.7 + 5.0 + vSeed);
  vec3 lc = kind < 0.42 ? vec3(0.0) : kind < 0.74 ? vec3(1.0, 0.62, 0.3) : kind < 0.95 ? vec3(0.3, 0.7, 1.4) : vec3(1.1, 0.3, 0.8);
  float fl = pH(cell + 9.0 + vSeed) > 0.9 ? step(0.25, pN(vec2(uTime * 7.0, cell.x + cell.y * 3.0))) : 1.0;
  float cull = uCull * step(uCullZ.x, vWP.z) * step(vWP.z, uCullZ.y);
  lc *= fl * (0.55 + 0.9 * pH(cell + 13.0)) * (1.0 - cull);
  float glass = hatch * (0.6 + 0.4 * smoothstep(0.1, -0.15, hd));
  diffuseColor.rgb = mix(panel, vec3(0.02, 0.025, 0.03), glass);
  podGlow = lc * glass * (1.0 - far * 0.35) * 2.2;
  // status LED under the hatch
  float led = 1.0 - smoothstep(0.012, 0.02, length(f - vec2(0.5, 0.34)));
  podGlow += (cull > 0.5 ? vec3(1.6, 0.1, 0.05) : vec3(0.1, 1.2, 0.4)) * led * (1.0 - far);
}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.6, 0.08, step(0.5, 1.0 - smoothstep(-0.005, 0.01, rbox((fract(vUv) - vec2(0.5, 0.58)) * vec2(1.0, 1.1), vec2(0.23, 0.17), 0.12))));')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += podGlow;');
  };
  m.customProgramCacheKey = () => 'stackPods';
  m.name = 'pods';
  m.userData.u = u;
  return m;
}

// wall of pods facing +n (normal in XZ): from (x0,z0) to (x1,z1), y0..y1; uv = pod units. Returns geometry.
function podWall(x0, z0, x1, z1, y0, y1) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const g = new THREE.PlaneGeometry(len, y1 - y0);
  g.rotateY(Math.atan2(x1 - x0, z1 - z0) - Math.PI / 2);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / POD_W, uv.getY(i) * (y1 - y0) / POD_H);
  return g;
}

function stacksEnv(renderer, tier) {
  const s = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(60, 50, 120), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.02, 0.025, 0.035), side: THREE.BackSide }));
  room.position.y = 18; s.add(room);
  const add = (w, h, c, x, y, z, ry = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(...c), side: THREE.DoubleSide })); m.position.set(x, y, z); m.rotation.y = ry; s.add(m); };
  const R = rng(4);
  for (let i = 0; i < 70; i++) {
    const side = R() < 0.5 ? -1 : 1, k = R();
    const c = k < 0.5 ? [1.6, 0.9, 0.45] : k < 0.85 ? [0.35, 0.9, 2.2] : [1.8, 0.4, 1.2];
    add(1.2 + R() * 4, 0.6 + R() * 2, c.map((v) => v * (0.5 + R())), side * 29.5, 1 + R() * 40, (R() - 0.5) * 110, Math.PI / 2);
  }
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0, 0.1, 200, { size: tier.envSize || 256 });
  pm.dispose();
  s.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  rt.texture.userData.rt = rt;
  return rt.texture;
}

function ground(ctx, L) {
  const mask = zoneMask({ x0: -44, x1: 44, z0: -101, z1: 97 }, (P) => {
    P.rect(-0.6, -72, 0.6, 97, '#00f');                                     // centre drain grate
    for (let z = -60; z < 90; z += 20) P.rect(-14, z - 0.3, 14, z + 0.3, '#00f');
    P.rect(-14, -72.5, 14, -70.8, 'rgb(0,255,255)');                          // hazard at the flood edge
    P.rect(-11, 60, -3, 80, '#f00'); P.rect(3, 72, 13, 84, '#f00');           // steel plates by the relay / kiosk
    P.rect(-42, L.alleyW.z0, -14, L.alleyW.z1, 'rgb(90,0,0)');
    for (const x of [-9.5, 9.5]) P.rect(x - 0.1, -70, x + 0.1, 92, 'rgb(0,150,0)');
  });
  createIndustrialGround(ctx, [{ rects: [[-14, 14, -99, 95], [-42, -14, L.alleyW.z0, L.alleyW.z1], [14, 42, L.alleyE.z0, L.alleyE.z1]], y: 0, reflect: true, ao: true }], mask,
    { slab: 3, tint: [0.4, 0.4, 0.42], wet: 0.75, rust: 0.6, rain: true, interior: true, key: 'st' });
}

function walls(ctx, L, pm) {
  const { scene, col } = ctx;
  const W = L.wallX, T = L.top, geos = [];
  const aW = L.alleyW, aE = L.alleyE;
  // west wall (faces +x) with the alley gap, east wall (faces -x) with its gap; the canyon runs on past the play area
  geos.push(podWall(-W, 200, -W, aW.z1, 0, T), podWall(-W, aW.z0, -W, -99, 0, T), podWall(-W, aW.z1, -W, aW.z0, 6.6, T));
  geos.push(podWall(W, -99, W, aE.z0, 0, T), podWall(W, aE.z1, W, 200, 0, T), podWall(W, aE.z0, W, aE.z1, 6.6, T));
  // alley walls: pods face into the alley
  geos.push(podWall(-W, aW.z1, -42, aW.z1, 0, T), podWall(-42, aW.z0, -W, aW.z0, 0, T), podWall(-42, aW.z1, -42, aW.z0, 0, T));
  geos.push(podWall(W, aE.z0, 42, aE.z0, 0, T), podWall(42, aE.z1, W, aE.z1, 0, T), podWall(42, aE.z0, 42, aE.z1, 0, T));
  // far ends: the sub-stack pump wall (north) and the canyon receding south behind the spawn
  geos.push(podWall(-W, -99, W, -99, 0, T));
  const g = mergeGeometries(geos, false);
  const wall = new THREE.Mesh(g, pm);
  wall.receiveShadow = true; wall.name = 'podWalls';
  wall.layers.enable(REFLECT_LAYER);
  scene.add(wall);
  col.custom((x, z, r) => {
    if (z > aW.z0 + r && z < aW.z1 - r && x < 0) return x - r < -42;
    if (z > aE.z0 + r && z < aE.z1 - r && x > 0) return x + r > 42;
    return Math.abs(x) + r > W;
  });
  // lintels over the alley mouths, pipes along the walls, the city's underside above
  const { batch, M } = ctx;
  const rustC = new THREE.Color(0.45, 0.28, 0.2), pipeC = new THREE.Color(0.5, 0.48, 0.45);
  for (const [x, z0, z1] of [[-W, aW.z0, aW.z1], [W, aE.z0, aE.z1]]) batch.put(box(1.2, 1.2, z1 - z0 + 1), M.darkMetal, V(x, 6.6, (z0 + z1) / 2), 0, null, {});
  for (const s of [-1, 1]) for (const [y, r] of [[12.5, 0.55], [13.8, 0.35], [21, 0.8], [31, 0.5]]) {
    const pg = new THREE.CylinderGeometry(r, r, 300, 12); pg.rotateX(Math.PI / 2);
    batch.put(pg, M.stone, V(s * (W - 0.9 - r), y, 50), 0, null, { color: y > 20 ? rustC : pipeC, cast: false, cellKey: 'pipe' + s + y });
    for (let z = -95; z < 195; z += 12) batch.put(box(0.3, 1.2 + r, 1.2), M.darkMetal, V(s * (W - 0.4), y + 0.2, z), 0, null, { cast: false, cellKey: 'pipe' + s + y });
  }
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(2 * W, 320).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.8, metalness: 0.6 }));
  ceil.position.set(0, L.ceil, 48); scene.add(ceil);
  for (let z = -95; z < 200; z += 9) batch.put(box(2 * W, 2.2, 1.2), M.darkMetal, V(0, L.ceil - 1.1, z), 0, null, { cast: false, reflect: false, cellKey: 'ceil' });
  batch.put(box(2 * W, 16, 1), M.darkMetal, V(0, T + 8, -99), 0, null, { cast: false });
  for (const s of [-1, 1]) batch.put(box(1, L.ceil - T, 320), M.darkMetal, V(s * W, (L.ceil + T) / 2, 48), 0, null, { cast: false, reflect: false, cellKey: 'ceil' });
}

function catwalk(ctx, L) {
  const { batch, M, col } = ctx;
  const C = L.catwalk, W = L.wallX;
  // walkable east catwalk (level 2 of the pods): deck, stairs down at the north end, railing, ladders
  batch.put(box(C.x1 - C.x0, 0.25, C.z1 - C.z0), M.darkMetal, V((C.x0 + C.x1) / 2, C.y - 0.12, (C.z0 + C.z1) / 2), 0, null, {});
  for (let z = C.z0 + 2; z < C.z1; z += 6) { batch.put(box(0.2, C.y, 0.2), M.darkMetal, V(C.x0 + 0.2, C.y / 2, z)); col.circle(C.x0 + 0.2, z, 0.2, 'strut'); }
  const n = 12, run = (C.stairZ - C.z1) / n;
  for (let i = 0; i < n; i++) batch.put(box(C.x1 - C.x0, 0.12, run * 0.9), M.darkMetal, V((C.x0 + C.x1) / 2, C.y * (1 - (i + 0.5) / n), C.z1 + run * (i + 0.5)), 0, null, {});
  col.height({ kind: 'flat', x0: C.x0, x1: W, z0: C.z0, z1: C.z1, y: C.y });
  col.height({ kind: 'rampZ', x0: C.x0, x1: W, z0: C.z1, z1: C.stairZ, y0: C.y, y1: 0 });
  col.box(C.x0 - 0.1, (C.z0 + C.stairZ - 1.2) / 2, 0.15, (C.stairZ - 1.2 - C.z0) / 2, 0, 'catRail');
  col.box((C.x0 + W) / 2, C.z0 - 0.1, (W - C.x0) / 2, 0.15, 0, 'catEnd');
  railing(ctx, [[C.x0 + 0.1, C.z0], [C.x0 + 0.1, C.z1]], C.y);
  railing(ctx, [[C.x0 + 0.1, C.z1], [C.x0 + 0.1, C.stairZ - 1.2]], C.y * 0.5);
  // upper catwalks (not walkable) on both walls, every 3 pods, with ladders
  for (const s of [-1, 1]) for (const y of [11, 17.6, 24.2, 30.8, 37.4]) {
    batch.put(box(1.4, 0.15, 200), M.darkMetal, V(s * (W - 0.7), y, 40), 0, null, { cast: false, cellKey: 'cw' + s });
    batch.put(box(0.05, 0.05, 200), M.darkMetal, V(s * (W - 1.35), y + 1.0, 40), 0, null, { cast: false, cellKey: 'cw' + s });
  }
  for (const s of [-1, 1]) for (let z = -90; z < 190; z += 17) batch.put(box(0.5, L.top - 4, 0.06), M.darkMetal, V(s * (W - 0.12), (L.top + 4) / 2, z), 0, null, { cast: false, cellKey: 'ld' + s });
}

// grimy market stall (awning, counter, lit wares)
function grimStall(ctx, x, z, rot, hue = 0) {
  const { batch, M, col } = ctx;
  const aw = [new THREE.Color(0.55, 0.12, 0.1), new THREE.Color(0.12, 0.3, 0.45), new THREE.Color(0.5, 0.4, 0.12)][hue % 3];
  batch.put(box(2.8, 1.0, 1.1), M.darkMetal, V(x, 0.5, z), rot);
  batch.put(box(2.9, 0.06, 1.2), M.stone, V(x, 1.02, z), rot, null, { color: new THREE.Color(0.35, 0.3, 0.25) });
  const c = Math.cos(rot), s = Math.sin(rot);
  for (const k of [-1.35, 1.35]) batch.put(box(0.08, 2.6, 0.08), M.darkMetal, V(x + k * c - 0.7 * s, 1.3, z - k * s - 0.7 * c), rot);
  const a = new THREE.BoxGeometry(3.2, 0.06, 2.0); a.rotateX(-0.25);
  batch.put(a, M.stone, V(x - 0.05 * s, 2.55, z - 0.05 * c), rot, null, { color: aw });
  batch.put(box(2.4, 0.3, 0.05), M.warmGlow, V(x + 0.56 * s, 0.75, z + 0.56 * c), rot, null, { cast: false, color: hue % 2 ? new THREE.Color(0.3, 0.8, 1.6) : new THREE.Color(1, 0.7, 0.4) });
  for (let i = 0; i < 5; i++) batch.put(box(0.3, 0.25 + (i % 3) * 0.1, 0.3), M.crate, V(x + (i - 2) * 0.5 * c, 1.18, z - (i - 2) * 0.5 * s), rot + i, null, { cast: false });
  col.box(x, z, 1.45, 0.6, rot, 'stall');
}

// neon blade sign sticking out of a wall (x = wall face, side = -1 west wall / 1 east wall)
function blade(ctx, text, wallX, side, y, z, h = 6, tint = [0.8, 0.95, 1.1]) {
  const { batch, M, scene } = ctx;
  const x = wallX - side * 1.6;
  batch.put(box(3.0, 0.12, 0.12), M.darkMetal, V(wallX - side * 1.5, y + h / 2, z), 0, null, { cast: false });
  batch.put(box(3.0, 0.12, 0.12), M.darkMetal, V(wallX - side * 1.5, y - h / 2, z), 0, null, { cast: false });
  const art = HOLO_ART.sign(text, 1024, 200);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(h, h * 200 / 1024 * 1.4), createHoloMaterial(art, { bright: 2.8, alpha: 0.95, tint, time: ctx.time }));
  m.rotation.set(0, 0, Math.PI / 2); m.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
  m.position.set(x, y, z); m.layers.enable(REFLECT_LAYER); scene.add(m); twoSided(m);
  return m;
}

function wallAds(ctx, L) {
  const { scene, batch, M } = ctx;
  const W = L.wallX;
  const ads = [
    [HOLO_ART.ad('HARMONY', 'THROUGH UNITY', 3), -1, 18, 20, 14],
    [HOLO_ART.watching(1024, 512, 'HARMONY IS WATCHING'), 1, 24, -30, 16],
    [HOLO_ART.ad('CONCORD', 'YOUR PLACE IS PREPARED', 6), -1, 26, -60, 12],
    [HOLO_ART.ad('HIREFRAME', 'RENT A BODY TODAY', 9, '#3a2a10'), 1, 14, 40, 10],
    [HOLO_ART.ad('HARMONY', 'REST IS A PRIVILEGE', 11), -1, 30, 70, 18],
  ];
  for (const [art, s, y, z, w] of ads) {
    const h = w * (art.height / art.width);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), createHoloMaterial(art, { bright: 2.2, alpha: 0.95, tint: [0.7, 0.95, 1.2], time: ctx.time }));
    m.position.set(s * (W - 0.35), y, z); m.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2; m.layers.enable(REFLECT_LAYER); scene.add(m);
    registerBillboard(ctx, m.material, art.width, art.height);
    batch.put(box(0.4, h + 0.6, w + 0.6), M.darkMetal, V(s * (W - 0.1), y, z), 0, null, { cast: false });
  }
  blade(ctx, 'LULLABY REST', -W, -1, 9, L.home.z, 8, [1.2, 0.8, 0.6]);
  blade(ctx, 'PODS  9 CR / NIGHT', W, 1, 8, 10, 7, [0.7, 1.0, 1.2]);
  blade(ctx, 'NOODLES', -W, -1, 7.5, 6, 5, [1.3, 0.6, 0.9]);
  blade(ctx, 'HIREFRAME REPAIR', W, 1, 9, -44, 8, [1.2, 0.9, 0.5]);
  blade(ctx, 'STACK 9', -W, -1, 10, -25, 6, [0.7, 1.0, 1.3]);
  blade(ctx, 'ROOK  PARTS & RUMOURS', W, 1, 8.5, 76, 8, [1.1, 0.95, 0.6]);
}

// Stack 9's pod rows down the west alley: freestanding pod blocks, 3 high, facing the lane (instanced, same pod shader)
function podRows(ctx, L, pm) {
  const { col } = ctx;
  const A = L.alleyW, list = [];
  for (const [z, face] of [[A.z1 - 3.2, Math.PI], [A.z0 + 3.2, 0]]) for (let x = -38; x <= -18; x += POD_W * 3 + 1.4) {
    list.push([x, z, face]);
    col.box(x, z, POD_W * 1.5, 1.2, 0, 'pods');
  }
  const g = new THREE.BoxGeometry(POD_W * 3, POD_H * 3, 2.2);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * 3);
  g.translate(0, POD_H * 1.5, 0);
  const im = new THREE.InstancedMesh(g, pm, list.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  list.forEach(([x, z, r], i) => im.setMatrixAt(i, m4.compose(V(x, 0, z), q.setFromAxisAngle(V(0, 1, 0), r), V(1, 1, 1))));
  im.castShadow = true; im.receiveShadow = true; im.name = 'podRows'; im.layers.enable(REFLECT_LAYER);
  im.computeBoundingSphere();
  ctx.scene.add(im);
  return list;
}

// flooded sub-stack: black water over the south end, a pump house, fallen pods, rust
function flood(ctx, L) {
  const { batch, M, col, scene } = ctx;
  const F = L.flood;
  const water = new THREE.Mesh(new THREE.PlaneGeometry(28, F.z1 - F.z0).rotateX(-Math.PI / 2), createWaterMaterial(ctx, { color: 0x1a2a22, reflect: true }));
  water.position.set(0, 0.14, (F.z0 + F.z1) / 2); water.layers.enable(REFLECT_LAYER); scene.add(water);
  batch.put(box(14, 12, 6), M.darkMetal, V(0, 6, -96), 0, null, {});
  for (const x of [-4, 0, 4]) batch.add(cyl(1.1, 1.1, 14, x, 0, -92.4, 16), M.stone, { color: new THREE.Color(0.42, 0.25, 0.16) });
  col.box(0, -95, 7.5, 4.4, 0, 'pump');
  // fallen pods, tipped at angles, half under water
  for (const [x, z, r, t] of [[-9, -84, 0.5, 0.35], [8.5, -80, -0.3, -0.25], [-4, -76, 1.2, 0.15]]) {
    const g = box(POD_W, POD_H, 2.2); g.rotateZ(t);
    batch.put(g, M.stone, V(x, 0.7, z), r, null, { color: new THREE.Color(0.38, 0.3, 0.26) });
    col.box(x, z, POD_W / 2 + 0.2, 1.3, r, 'fallenPod');
  }
  const R = rng(9);
  for (let i = 0; i < 16; i++) batch.put(box(0.2 + R() * 0.8, 0.1, 0.2 + R() * 1.5), M.darkMetal, V(-12 + R() * 24, 0.16, F.z0 + 4 + R() * 20), R() * 3, null, { cast: false });
}

function buildStacks(ctx, onProgress = () => {}) {
  const L = ST_LAYOUT, { batch, M, col } = ctx;
  ctx.gather ||= [];
  const pm = podMaterial(ctx);
  ctx.fadeMat?.(pm);
  ground(ctx, L);
  walls(ctx, L, pm);
  onProgress(0.45, 'Stacking the pods…');
  catwalk(ctx, L);
  podRows(ctx, L, pm);
  wallAds(ctx, L);
  flood(ctx, L);
  // power cull (A4-M2 "Culling Hour"): world.ctx.stacks.setCull(k 0..1, z0, z1) darkens the pods between z0 and z1
  ctx.stacks = { setCull(k, z0 = -1e4, z1 = 1e4) { pm.userData.u.uCull.value = k; pm.userData.u.uCullZ.value.set(z0, z1); } };
  // cables strung across the canyon at every height
  const R = rng(41);
  for (let i = 0; i < 46; i++) {
    const z = -95 + R() * 250, y = 6 + R() * 36, dz = (R() - 0.5) * 16;
    cable(ctx, [-L.wallX + 0.2, y, z], [L.wallX - 0.2, y + (R() - 0.5) * 6, z + dz], 1 + R() * 3, 0.03 + R() * 0.05);
  }
  // hostel entrance (Lullaby Rest → Pod 4471)
  const H = L.home;
  batch.put(box(0.4, 3.4, 3.2), M.darkMetal, V(-L.wallX + 0.3, 1.7, H.z), 0, null, {});
  batch.put(box(0.1, 2.6, 2.2), M.warmGlow, V(-L.wallX + 0.52, 1.3, H.z), 0, null, { cast: false, color: new THREE.Color(0.9, 0.55, 0.3) });
  const ring = ctx.makePadRing(1.6, [1.0, 0.7, 0.4], true); ring.position.set(H.x, 0.03, H.z); ctx.scene.add(ring);
  ctx.interactables.push({ id: 'home', to: 'home', label: 'Pod 4471 — Lullaby Rest', x: H.x, z: H.z, r: 2.6 });
  // market along the west base, Rook's corner in the east alley
  for (const [z, h] of [[16, 0], [11, 1], [2, 2], [-3, 0], [-8, 1]]) grimStall(ctx, -11.8, z, -Math.PI / 2, h);
  for (const [x, z, r, h] of [[36, 81.2, Math.PI, 2], [30, 81.2, Math.PI, 1], [40.8, 76, Math.PI / 2, 0]]) grimStall(ctx, x, z, r, h);
  // lamps + light pools on the wet floor, flood masts in the alleys
  const pools = [];
  for (let z = -64; z < 92; z += 13) {
    for (const s of [-1, 1]) {
      const x = s * 9.5, zz = z + (s > 0 ? 6 : 0);
      batch.add(cyl(0.08, 0.12, 5, x, 0, zz, 8), M.darkMetal);
      batch.put(box(0.9, 0.12, 0.35), M.warmGlow, V(x, 5, zz), 0, null, { cast: false, color: s > 0 ? new THREE.Color(0.35, 0.85, 1.4) : new THREE.Color(1.2, 0.72, 0.4) });
      col.circle(x, zz, 0.2, 'lamp');
      pools.push([x, zz, 4.2, s > 0 ? [0.3, 0.75, 1.2] : [1.1, 0.62, 0.3]]);
    }
  }
  for (const [x, z] of [[-30, -25], [30, 76]]) { floodMast(ctx, x, z, 8, 0); pools.push([x, z, 7, [1.0, 0.7, 0.4]]); }
  pools.push([-12, 6, 3.5, [1.2, 0.35, 0.9]], [H.x, H.z, 3.5, [1.1, 0.7, 0.4]], [0, -80, 10, [0.3, 0.8, 0.5]]);
  lightPools(ctx, pools);
  // leaks from the pipes, steam from the grates and vents
  const lk = [];
  for (let i = 0; i < 22; i++) { const s = R() < 0.5 ? -1 : 1; lk.push([s * (L.wallX - 1.2 - R() * 1.5), 12 + R() * 9, -80 + R() * 170, 0.6]); }
  lk.push([0, 20, -90, 3], [-6, 14, -84, 1.5], [7, 14, -78, 1.5]);
  leaks(ctx, lk, { per: 16 });
  const vents = [];
  for (let z = -60; z < 80; z += 20) vents.push([(z % 40 ? 5 : -5), 0.05, z, 0.7]);
  vents.push([-12.8, 12.5, 30, 1.2], [12.8, 21, -20, 1.4], [-12.6, 21, -50, 1.3], [0, 0.2, -93, 2]);
  steamVents(ctx, vents);
  // shafts of daylight falling through gaps in the city above
  shafts(ctx, [[-6, -45], [6, 5], [-5, 44]], L.ceil);
  // clutter: dumpsters, crates, barrels
  dumpster(ctx, -40, -18.5, 0); dumpster(ctx, 40.2, 70.8, 0);
  for (const [x, z] of [[-11.9, 30], [-12, 33], [11.8, -64], [-11.8, -40], [-11.8, 50]]) { batch.add(cyl(0.4, 0.4, 1.0, x, 0, z, 12), M.stone, { color: new THREE.Color(0.45, 0.22, 0.12) }); col.circle(x, z, 0.45, 'barrel'); }
  locker(ctx, 12.9, -66, -Math.PI / 2); locker(ctx, -12.9, -56, Math.PI / 2); locker(ctx, -40.9, -25, Math.PI / 2);
  kiosk(ctx);
  warehousePad(ctx);
  relay(ctx, L.relay.x, L.relay.z);
  for (const x of [-6, 6]) ctx.gather.push({ x, z: 40, kind: 'talk' }, { x, z: -20, kind: 'talk' });
  ctx.gather.push({ x: -26, z: -25, kind: 'talk' }, { x: 30, z: 74, kind: 'talk' }, { x: -8, z: 8, kind: 'talk' }, { x: 6, z: 60, kind: 'talk' });

  ctx.breakables = createBreakables(ctx, [
    { kind: 'crate', x: -38, z: -19, rot: 0.2 }, { kind: 'crate', x: -20, z: -31, stack: 1 }, { kind: 'crate', x: 34, z: 70.5, rot: 0.3 },
    { kind: 'crate', x: 10.5, z: -30, rot: 0.1 }, { kind: 'crate', x: -10.5, z: 64 }, { kind: 'crate', x: 10.8, z: -68, stack: 1 },
    { kind: 'vending', x: -12.9, z: 22, rot: Math.PI / 2 }, { kind: 'vending', x: 10.2, z: 20, rot: -Math.PI / 2 }, { kind: 'vending', x: -12.9, z: -14, rot: Math.PI / 2 },
    { kind: 'holo', x: 5, z: 30, rot: -0.3 }, { kind: 'holo', x: -5, z: -48, rot: 0.3 }, { kind: 'holo', x: 25, z: 82.5, rot: 0 },
  ]);
  const S = [
    ['st_pods_stack9', 'pods', -28, -25, 5], ['st_pods_canyon_w', 'pods', -10, -30, 4], ['st_pods_canyon_e', 'pods', 10, 10, 4], ['st_pods_lullaby', 'pods', H.x + 2, H.z, 3],
    ['st_market', 'market', -9, 4, 6], ['st_market_rook', 'market', 32, 76, 5],
    ['st_alley_stack9', 'alley', -34, -25, 3], ['st_alley_rook', 'alley', 22, 76, 3],
    ['st_locker_east', 'locker', 11.6, -66, 2.5], ['st_locker_west', 'locker', -11.6, -56, 2.5], ['st_locker_stack9', 'locker', -39.6, -25, 2.5],
    ['st_rooftop_catwalk', 'rooftop', 12.5, -10, 4], ['st_flooded_substack', 'arena', 0, -84, 10],
    ['st_plaza_south', 'plaza', 0, 76, 6], ['st_plaza_mid', 'plaza', 0, 0, 6], ['st_relay', 'relay', L.relay.x, L.relay.z - 2.8, 2.5],
    ['st_spawn_north', 'spawn_edge', 0, 92, 3], ['st_spawn_stack9', 'spawn_edge', -40, -25, 3], ['st_spawn_rook', 'spawn_edge', 40, 76, 3], ['st_spawn_flood', 'spawn_edge', 0, -88, 3],
    ['st_vantage_catwalk', 'vantage', 12.5, 30, 2.5], ['st_vantage_catwalk_s', 'vantage', 12.5, -50, 2.5],
    ['st_hide_stall', 'hide', -10, 13.5, 1.5], ['st_hide_pods', 'hide', -24, -21, 1.5], ['st_hide_barrels', 'hide', -10.5, 31.5, 1.5], ['st_hide_pump', 'hide', 8, -90, 1.5],
    ['st_npc_rook', 'npc', 33, 79, 1.5], ['st_npc_market', 'npc', -9, -3, 1.5], ['st_npc_lullaby', 'npc', H.x + 2.5, H.z + 2, 1.5], ['st_npc_stack9', 'npc', -30, -22, 1.5],
    ['st_home_door', 'home', H.x, H.z, 2.6],
    ['st_contract_terminal', 'terminal', L.kiosk.x, L.kiosk.z, 3], ['st_warehouse_link', 'link_pad', L.pad.x, L.pad.z, 2.6],
  ];
  ctx.sites = S.map(([id, tag, x, z, r]) => ({ id, tag, x, z, r, y: col.groundAt(x, z), district: 'stacks', indoor: true }));
}

function shafts(ctx, spots, H) {
  const g = new THREE.CylinderGeometry(1.6, 3.6, H, 16, 1, true);
  g.translate(0, H / 2, 0);
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: ctx.time },
    vertexShader: `varying float vY; varying vec3 vN, vV; void main(){ vY = position.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalMatrix * normal; vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uTime; varying float vY; varying vec3 vN, vV;
      void main(){ float f = abs(dot(normalize(vN), normalize(vV))); float a = pow(f, 2.0) * smoothstep(0.0, 14.0, vY) * smoothstep(${H.toFixed(1)}, ${(H * 0.6).toFixed(1)}, vY) * 0.07;
        a *= 0.75 + 0.25 * sin(uTime * 0.4 + vY * 0.13); gl_FragColor = vec4(vec3(0.95, 0.97, 1.0) * a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  for (const [x, z] of spots) { const s = new THREE.Mesh(g, m); s.position.set(x, 0, z); s.rotation.z = 0.08; s.renderOrder = 3; ctx.scene.add(s); }
}

const CROWD = {
  loops: [
    [[0, 86], [-6, 50], [6, 10], [-6, -30], [0, -64], [6, -30], [-6, 10], [6, 50]],
    [[-8, 60], [-8, -60], [8, -60], [8, 60]],
    [[-8, -25], [-38, -25], [-38, -22], [-8, -22]],
    [[8, 76], [38, 76], [38, 72], [8, 72]],
    [[12.5, 50], [12.5, -55], [12.5, 50], [12.5, 62]],
  ],
  talk: [[-6, 40], [6, -20], [-26, -25], [30, 74], [-8, 8], [6, 60], [-4, -60], [4, 80]],
  count: 20,
};

export const STACKS = {
  id: 'stacks', name: 'The Stacks', layout: ST_LAYOUT, bounds: ST_LAYOUT.bounds, build: buildStacks, crowd: CROWD, batchCell: 64,
  farCrowd: 0.4, adCount: 0, adOrigins: [],
  env: (r, tier) => stacksEnv(r, tier),
  ambience: {
    interior: true, background: 0x040507, sunDir: [0.15, 1.0, 0.2],
    sun: [0.72, 0.8, 0.95], sunI: 1.1, hemiSky: 0x5a7cb0, hemiGround: 0x2a1c16, hemiI: 0.5,
    fog: [0.06, 0.085, 0.12], fogDensity: 0.011, env: 1.2,
    gain: [1.0, 0.98, 1.04], lift: [0.004, 0.006, 0.014], sat: 1.15, contrast: 1.18,
  },
  spawnPoints: (L) => ({ player: [L.spawn.x, L.spawn.z], kiosk: [L.kiosk.x, L.kiosk.z + 2.5], pad: [L.pad.x, L.pad.z], relay: [L.relay.x, L.relay.z - 2.8], home: [L.home.x + 2.5, L.home.z] }),
};
