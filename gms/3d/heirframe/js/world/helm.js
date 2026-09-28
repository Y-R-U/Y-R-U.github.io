import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, cyl, lathe } from './geo.js';
import { lightPools } from './p4_props.js';
import { holoLabel, GRAPHITE } from './p5_props.js';
import { addSpaceSky, spaceEnv } from './space.js';
import { farHull } from './hullside.js';
import { kiosk, warehousePad } from './plaza.js';
import { relay } from './sites.js';
import { createBreakables } from './breakables.js';
import { addPlanarReflection } from '../fx/reflection.js';

// The Helm: the ark's bridge at the bow, the Concord's hidden sanctum. A cathedral nave of black glass floor (a mirror
// full of stars), glass fin pillars lit with thin starlight lines, pointed rib vaults open to space, tall windows down
// both sides over the hull, and a great rose window at the north end framing Verdance. South = the pod-dock (where
// *Walk as Yourself* starts); north = the dais and the Helm chair under the ship intelligence's rings of light; along the
// side aisles (the outer ring) the seven empty thrones of the Voices.
// Boss hooks: world.ctx.helm.setMode('calm' | 'harmony' | 'dray' | 'iris' | 'open'), .chair, .voices, .rings.
const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const HELM_SPACE = { sun: new THREE.Vector3(0.35, 0.42, 0.84).normalize(), planet: new THREE.Vector3(0.0, 0.2, -1).normalize(), pr: 0.34 };

export const HL_LAYOUT = {
  bounds: { x0: -30, x1: 30, z0: -92, z1: 84 },
  pillarsX: 14, pillarZ: [60, 48, 36, 24, 12, 0, -12, -24, -36, -48],
  dais: { x0: -9, x1: 9, z0: -84, z1: -64, y: 1.2, stair: 4 },
  chair: { x: 0, z: -76 },
  dock: { x: 0, z: 76 },
  spawn: { x: 0, z: 68 },
  relay: { x: -20, z: 74 },
  kiosk: { x: 20, z: 70, rot: -0.7 },
  pad: { x: 22, z: 56 },
};

const MODES = {
  calm: { line: [0.55, 0.8, 1.6], ring: [0.8, 0.9, 1.6], pool: [0.3, 0.5, 1.0] },
  harmony: { line: [0.25, 0.75, 2.0], ring: [0.3, 0.9, 2.2], pool: [0.15, 0.5, 1.2] },
  dray: { line: [2.0, 1.35, 0.5], ring: [2.2, 1.5, 0.5], pool: [1.2, 0.8, 0.3] },
  iris: { line: [1.8, 1.7, 1.5], ring: [2.2, 2.0, 1.7], pool: [1.0, 0.9, 0.8] },
  open: { line: [0.6, 1.4, 0.9], ring: [0.7, 1.6, 1.0], pool: [0.3, 0.9, 0.5] },
};

function floorMaterial(ctx) {
  const m = new THREE.MeshStandardMaterial({ color: 0x10141c, roughness: 0.1, metalness: 0.35, envMapIntensity: 1.2 });
  m.name = 'helmFloor';
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vHW;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvHW = ( modelMatrix * vec4( transformed, 1.0 ) ).xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec2 vHW; vec3 hfInlay = vec3(0.0);
float hLine(float d, float w){ float aa = fwidth(d) * 1.2 + 1e-4; return 1.0 - smoothstep(w, w + aa, abs(d)); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  // gold inlay: the nave borders, cross bands every 12 m, a compass ring before the dais; faint panel seams elsewhere
  float g = max(hLine(abs(vHW.x) - 8.0, 0.05), hLine(abs(vHW.x) - 8.4, 0.02));
  g = max(g, hLine(mod(vHW.y + 6.0, 12.0) - 6.0, 0.03) * step(abs(vHW.x), 8.0));
  float rr = length(vHW - vec2(0.0, -56.0));
  g = max(g, max(hLine(rr - 6.0, 0.06), hLine(rr - 6.5, 0.02)));
  g = max(g, hLine(abs(vHW.x) - abs(vHW.y + 56.0), 0.03) * step(rr, 6.0));
  float seam = max(hLine(mod(vHW.x, 3.0) - 1.5, 0.008), hLine(mod(vHW.y, 3.0) - 1.5, 0.008)) * step(8.4, abs(vHW.x));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.02), seam * 0.6);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.62, 0.22), g);
  hfInlay = vec3(1.0, 0.72, 0.3) * g * 0.9;
  // starlight caught in the black glass: sparse twinkling specks (fade out where they'd alias)
  vec2 sc = floor(vHW * 3.0); vec2 sf = fract(vHW * 3.0) - 0.5;
  float sh = fract(sin(dot(sc, vec2(127.1, 311.7))) * 43758.5453);
  float spk = step(0.965, sh) * (1.0 - smoothstep(0.05, 0.14, length(sf))) * (1.0 - smoothstep(0.03, 0.09, fwidth(vHW.x)));
  hfInlay += vec3(0.55, 0.7, 1.0) * spk * (0.4 + 0.6 * fract(sh * 91.7)) * (1.0 - g);
}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.25, step(0.01, hfInlay.r));')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += hfInlay;');
  };
  m.customProgramCacheKey = () => 'helmFloor';
  if (ctx.reflection?.enabled) addPlanarReflection(m, ctx.reflection, { strength: 1.0, base: 0.35, blur: 1.4, distort: 0.02, sky: 1, skySat: 0.7 });
  return m;
}

function nave(ctx, L, lineMat) {
  const { batch, M, col, scene } = ctx, B = L.bounds, PX = L.pillarsX;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(B.x1 - B.x0, B.z1 - B.z0).rotateX(-Math.PI / 2), floorMaterial(ctx));
  floor.position.set(0, 0, (B.z0 + B.z1) / 2); floor.receiveShadow = true; floor.name = 'ground'; scene.add(floor);
  const glassC = new THREE.Color(0.35, 0.4, 0.5);
  const lineGeo = [];
  for (const z of L.pillarZ) for (const sd of [-1, 1]) {
    const x = sd * PX;
    // glass fin pillar: a tall tapered blade with a gold foot and a starlight line up each edge
    const fin = lathe([[0, 0], [1.3, 0], [1.2, 0.8], [0.9, 1.0], [0.75, 22], [0.4, 26], [0, 27]], 6); fin.scale(1, 1, 1.9);
    batch.put(fin, M.glassDark, V(x, 0, z), 0, null, { color: glassC });
    batch.add(cyl(1.5, 1.6, 0.5, x, 0, z, 16), M.gold);
    for (const dz of [-1.4, 1.4]) { const l = new THREE.BoxGeometry(0.06, 21, 0.06); l.translate(x, 11.5, z + dz); lineGeo.push(l); }
    col.circle(x, z, 1.6, 'pillar');
    // side-aisle half-vault to the outer wall
    batch.put(new THREE.TorusGeometry(8, 0.28, 6, 20, Math.PI / 2), M.darkMetal, V(sd * 22, 18, z), sd > 0 ? 0 : Math.PI, null, { cast: false, color: GRAPHITE, cellKey: 'vault' });
  }
  // pointed nave vault: two arcs per bay springing from the pillars and meeting at a peak (gold ribs), spine rib on top
  const AR = 16, AA = Math.acos((AR - PX) / AR), peak = 22 + AR * Math.sin(AA);
  for (const z of L.pillarZ) for (const sd of [-1, 1]) {
    const a = new THREE.TorusGeometry(AR, 0.32, 8, 28, AA); if (sd < 0) a.rotateZ(Math.PI - AA);
    batch.put(a, M.gold, V(sd * (PX - AR), 22, z), 0, null, { cast: false, cellKey: 'vault' });
  }
  batch.put(box(0.5, 0.5, 112), M.gold, V(0, peak - 0.2, 6), 0, null, { cast: false, cellKey: 'vault' });
  for (const sd of [-1, 1]) batch.put(box(0.6, 0.6, 112), M.gold, V(sd * PX, 22.6, 6), 0, null, { cast: false, cellKey: 'vault' });
  // tall side windows: transparent glass with mullions and transoms, the hull and stars beyond
  for (const sd of [-1, 1]) {
    const x = sd * (B.x1 + 0.3);
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(B.z1 - B.z0, 30), M.glassRail);
    gl.position.set(x, 15, (B.z0 + B.z1) / 2); gl.rotation.y = -sd * Math.PI / 2; gl.renderOrder = 4; scene.add(gl);
    for (let z = B.z0; z <= B.z1; z += 6) batch.put(box(0.4, 30, 0.4), M.darkMetal, V(x, 15, z), 0, null, { cast: false, cellKey: 'win' + sd });
    for (const y of [0.4, 8, 16, 24, 30]) batch.put(box(0.4, 0.3, B.z1 - B.z0), M.darkMetal, V(x, y, (B.z0 + B.z1) / 2), 0, null, { cast: false, cellKey: 'win' + sd });
  }
  // end walls: the rose window (north) framing Verdance, the dock bulkhead (south)
  const RZ = B.z0 - 0.4;
  batch.put(new THREE.TorusGeometry(16, 0.9, 10, 64), M.gold, V(0, 18, RZ), 0, null, { cast: false });
  batch.put(new THREE.TorusGeometry(6, 0.4, 8, 40), M.gold, V(0, 18, RZ), 0, null, { cast: false });
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, g = box(0.3, 10, 0.3); g.translate(0, 11, 0); g.rotateZ(a); batch.put(g, M.darkMetal, V(0, 18, RZ), 0, null, { cast: false }); }
  const fr = new THREE.Shape(); fr.moveTo(-31, 0); fr.lineTo(31, 0); fr.lineTo(31, 62); fr.lineTo(-31, 62); fr.lineTo(-31, 0);
  const hole = new THREE.Path(); hole.absarc(0, 18, 16, 0, Math.PI * 2, true); fr.holes.push(hole);
  batch.put(new THREE.ShapeGeometry(fr, 32), M.darkMetal, V(0, 0, RZ - 0.3), 0, null, { cast: false, color: new THREE.Color(0.25, 0.27, 0.32) });
  const rose = new THREE.Mesh(new THREE.CircleGeometry(16, 48), M.glassRail); rose.position.set(0, 18, RZ - 0.1); scene.add(rose);
  batch.put(box(62, 62, 1), M.darkMetal, V(0, 31, B.z1 + 0.8), 0, null, { cast: false, color: new THREE.Color(0.25, 0.27, 0.32) });
  const lines = new THREE.Mesh(mergeLines(lineGeo), lineMat); lines.name = 'starlines'; scene.add(lines);
  return lines;
}
function mergeLines(list) { const g = mergeGeometries(list, false); list.forEach((q) => q.dispose()); return g; }

function dais(ctx, L, ringMat) {
  const { batch, M, col, scene } = ctx, D = L.dais, cx = (D.x0 + D.x1) / 2, cz = (D.z0 + D.z1) / 2;
  batch.put(box(D.x1 - D.x0, D.y, D.z1 - D.z0), M.glassDark, V(cx, D.y / 2, cz), 0, null, { color: new THREE.Color(0.3, 0.33, 0.4) });
  batch.put(box(D.x1 - D.x0 + 0.2, 0.08, 0.2), M.gold, V(cx, D.y, D.z1), 0);
  for (const sd of [-1, 1]) batch.put(box(0.2, 0.08, D.z1 - D.z0), M.gold, V(sd * D.x1, D.y, cz), 0);
  const n = 5, s = D.stair;
  for (let i = 0; i < n; i++) batch.put(box(2 * s, D.y * (i + 1) / n, 0.8), M.glassDark, V(0, D.y * (i + 1) / n / 2, D.z1 + 4 - (i + 0.5) * 0.8), 0, null, { color: new THREE.Color(0.3, 0.33, 0.4) });
  col.height({ kind: 'flat', x0: D.x0, x1: D.x1, z0: D.z0, z1: D.z1, y: D.y });
  col.height({ kind: 'rampZ', x0: -s, x1: s, z0: D.z1, z1: D.z1 + 4, y0: D.y, y1: 0 });
  col.box(D.x0 - 0.1, cz, 0.15, (D.z1 - D.z0) / 2, 0, 'dais'); col.box(D.x1 + 0.1, cz, 0.15, (D.z1 - D.z0) / 2, 0, 'dais');
  col.box((D.x0 - s) / 2, D.z1 + 0.1, (s - D.x0) / 2, 0.15, 0, 'dais'); col.box((D.x1 + s) / 2, D.z1 + 0.1, (D.x1 - s) / 2, 0.15, 0, 'dais');
  for (const sd of [-1, 1]) col.box(sd * (s + 0.15), D.z1 + 2, 0.12, 2, 0, 'stairRail');
  // the Helm chair: a high-backed seat with a gold halo behind it
  const C = L.chair, y = D.y;
  batch.put(box(1.4, 0.6, 1.3), M.darkMetal, V(C.x, y + 0.3, C.z), 0, null, { color: GRAPHITE });
  batch.put(box(1.2, 0.18, 1.1), M.stoneUpper, V(C.x, y + 0.7, C.z), 0, null, { color: new THREE.Color(0.85, 0.85, 0.88) });
  batch.put(box(1.3, 2.8, 0.3), M.darkMetal, V(C.x, y + 1.9, C.z - 0.6), 0, null, { color: GRAPHITE });
  for (const sd of [-1, 1]) batch.put(box(0.2, 0.3, 1.1), M.gold, V(C.x + sd * 0.72, y + 1.0, C.z), 0);
  batch.put(new THREE.TorusGeometry(1.4, 0.07, 8, 40), M.gold, V(C.x, y + 3.2, C.z - 0.8), 0);
  col.circle(C.x, C.z, 0.9, 'chair');
  // the ship intelligence: rings of light turning slowly above the chair
  const rings = new THREE.Group();
  for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(2.4 + i * 1.3, 0.05, 6, 64), ringMat); r.rotation.set(Math.PI / 2 + i * 0.4, i * 0.7, 0); rings.add(r); }
  rings.position.set(C.x, y + 7.5, C.z); scene.add(rings);
  ctx.updaters.push((dt, t) => { rings.children.forEach((r, i) => { r.rotation.x += dt * (0.1 + i * 0.06); r.rotation.y += dt * (0.13 - i * 0.03); }); rings.position.y = y + 7.5 + Math.sin(t * 0.6) * 0.25; });
  ctx.interactables.push({ id: 'helm_chair', label: 'The Helm', x: C.x, z: C.z + 2.2, r: 2.4 });
  return rings;
}

function thrones(ctx, L) {
  const { batch, M, col } = ctx, out = [];
  // seven Voices' thrones in the side aisles (4 west, 3 east), each under a niche of light
  const spots = [[-22, 42], [-22, 18], [-22, -6], [-22, -30], [22, 30], [22, 6], [22, -18]];
  spots.forEach(([x, z], i) => {
    const r = x < 0 ? Math.PI / 2 : -Math.PI / 2;
    batch.put(box(2.4, 0.4, 2.4), M.stoneUpper, V(x, 0.2, z), r, null, { color: GRAPHITE });
    batch.put(box(1.2, 0.5, 1.1), M.gold, V(x, 0.65, z), r);
    batch.put(box(1.3, 3.2, 0.25), M.gold, V(x - Math.sign(x) * 0.55, 2.2, z), r);
    batch.put(new THREE.TorusGeometry(0.6, 0.05, 6, 24), M.warmGlow, V(x - Math.sign(x) * 0.7, 3.4, z), r, null, { cast: false, color: new THREE.Color(1.6, 1.2, 0.6) });
    col.box(x, z, 1.2, 1.2, 0, 'throne');
    out.push(V(x + Math.sign(-x) * 2.2, 0, z));
  });
  holoLabel(ctx, 'THE CONCORD SITS IN HARMONY', -22, 6, 6, 5, [1.3, 1.0, 0.6]);
  return out;
}

function dock(ctx, L) {
  const { batch, M, col } = ctx, D = L.dock;
  // the pod-dock: a sealed body pod in docking clamps, where the living heir arrives
  batch.put(box(8, 0.4, 6), M.stoneUpper, V(D.x, 0.2, D.z), 0, null, { color: GRAPHITE });
  const pod = new THREE.CapsuleGeometry(0.9, 2.4, 6, 16); pod.rotateX(Math.PI / 2);
  batch.put(pod, M.stoneUpper, V(D.x, 1.3, D.z + 0.5), 0, null, { color: new THREE.Color(0.85, 0.86, 0.9) });
  const lid = new THREE.CapsuleGeometry(0.72, 2.0, 6, 16); lid.rotateX(Math.PI / 2); lid.scale(1, 0.5, 1);
  batch.put(lid, M.glassDark, V(D.x, 2.0, D.z + 0.5), 0, null, { color: new THREE.Color(0.4, 0.55, 0.7) });
  for (const sd of [-1, 1]) { batch.put(box(0.5, 2.6, 0.6), M.gold, V(D.x + sd * 1.6, 1.3, D.z + 0.5), 0); batch.put(box(1.4, 0.3, 0.5), M.darkMetal, V(D.x + sd * 1.1, 2.3, D.z + 0.5), 0); }
  col.box(D.x, D.z + 0.5, 2.0, 2.2, 0, 'pod');
  holoLabel(ctx, 'POD-DOCK  •  LIVING HEIR ONLY', D.x, 4.6, D.z - 1, 4.8, [1.1, 1.0, 0.8]);
}

function buildHelm(ctx, onProgress = () => {}) {
  const L = HL_LAYOUT, { batch, M, col } = ctx;
  ctx.gather ||= [];
  addSpaceSky(ctx, HELM_SPACE);
  farHull(ctx, { y: -24 });
  const lineMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(...MODES.calm.line) });
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(...MODES.calm.ring), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const lines = nave(ctx, L, lineMat);
  onProgress(0.45, 'Waking the Helm…');
  const rings = dais(ctx, L, ringMat);
  const voices = thrones(ctx, L);
  dock(ctx, L);
  kiosk(ctx); warehousePad(ctx); relay(ctx, L.relay.x, L.relay.z);
  const pools = [];
  for (const z of L.pillarZ) for (const sd of [-1, 1]) pools.push([sd * L.pillarsX, z, 4, MODES.calm.pool]);
  pools.push([0, -76, 7, [0.55, 0.45, 0.28]], [0, 76, 6, [0.6, 0.6, 0.8]]);
  for (let z = 66; z > -60; z -= 12) pools.push([0, z, 7, [0.32, 0.4, 0.62]]);
  const poolMesh = lightPools(ctx, pools);
  const setMode = (k) => {
    const m = MODES[k] || MODES.calm;
    lineMat.color.setRGB(...m.line); ringMat.color.setRGB(...m.ring);
    const c = poolMesh.geometry.attributes.color;
    for (let i = 0; i < L.pillarZ.length * 2 * 4; i++) c.setXYZ(i, ...m.pool);
    c.needsUpdate = true;
    ctx.helm.mode = k;
  };
  ctx.helm = { mode: 'calm', setMode, chair: V(L.chair.x, L.dais.y, L.chair.z), voices, rings, lines, dock: V(L.dock.x, 0, L.dock.z - 3) };
  ctx.gather.push({ x: -8, z: 20, kind: 'talk' }, { x: 8, z: -20, kind: 'talk' });
  ctx.breakables = createBreakables(ctx, [
    { kind: 'holo', x: -24, z: 60, rot: 0.3 }, { kind: 'holo', x: 24, z: 44, rot: -0.3 }, { kind: 'holo', x: -24, z: -50, rot: 0.3 }, { kind: 'holo', x: 24, z: -44, rot: -0.3 },
  ]);
  const S = [
    ['hl_nave', 'lobby', 0, 20, 6], ['hl_nave_n', 'lobby', 0, -40, 6], ['hl_outer_ring_w', 'interior', -22, 6, 4], ['hl_outer_ring_e', 'interior', 22, -6, 4],
    ['hl_helm_chair', 'vault', L.chair.x, L.chair.z + 3, 3], ['hl_dais', 'arena', 0, -52, 10], ['hl_pod_dock', 'interior', L.dock.x, L.dock.z - 4, 3],
    ...voices.map((v, i) => ['hl_throne_' + (i + 1), 'throne', v.x, v.z, 2]),
    ['hl_relay', 'relay', L.relay.x, L.relay.z - 2.8, 2.5],
    ['hl_spawn_sw', 'spawn_edge', -27, 80, 3], ['hl_spawn_se', 'spawn_edge', 27, 80, 3], ['hl_spawn_nw', 'spawn_edge', -27, -88, 3], ['hl_spawn_ne', 'spawn_edge', 27, -88, 3],
    ['hl_vantage_dais', 'vantage', 6, -68, 2], ['hl_vantage_window', 'vantage', -27, 0, 2],
    ['hl_hide_pillar_w', 'hide', -17, -14, 1.5], ['hl_hide_pillar_e', 'hide', 17, 22, 1.5], ['hl_hide_throne', 'hide', -25, -30, 1.5], ['hl_hide_dock', 'hide', 5, 80, 1.5],
    ['hl_npc_lyra', 'npc', -4, 60, 1.5], ['hl_npc_mara', 'npc', 4, 60, 1.5],
    ['hl_contract_terminal', 'terminal', L.kiosk.x, L.kiosk.z, 3], ['hl_warehouse_link', 'link_pad', L.pad.x, L.pad.z, 2.6],
  ];
  ctx.sites = S.map(([id, tag, x, z, r]) => ({ id, tag, x, z, r, y: col.groundAt(x, z), district: 'helm', indoor: true }));
}

const CROWD = {
  loops: [[[-22, 60], [-22, -50], [-22, 60]], [[22, 60], [22, -50], [22, 60]], [[-5, 50], [5, -40], [-5, -40], [5, 50]]],
  talk: [[-8, 20], [8, -20], [-20, 50], [20, -40]],
  count: 8,
};

export const HELM = {
  id: 'helm', name: 'The Helm', layout: HL_LAYOUT, bounds: HL_LAYOUT.bounds, build: buildHelm, crowd: CROWD, batchCell: 64,
  farCrowd: 0, adCount: 0, adOrigins: [],
  env: (r, tier) => spaceEnv(r, tier, HELM_SPACE, [[[1.8, 1.3, 0.6], 0, 20, -40, 30, 4, 0], [[0.5, 0.8, 1.6], -30, 10, 0, 6, 20, Math.PI / 2], [[0.5, 0.8, 1.6], 30, 10, 0, 6, 20, -Math.PI / 2]]),
  ambience: {
    interior: true, background: 0x000000, sunDir: HELM_SPACE.sun.toArray(),
    sun: [0.8, 0.88, 1.0], sunI: 1.6, hemiSky: 0x50607e, hemiGround: 0x14141c, hemiI: 1.0,
    fog: [0.0, 0.0, 0.0], fogDensity: 0.00005, env: 1.1,
    gain: [1.0, 1.0, 1.03], lift: [0.002, 0.002, 0.008], sat: 1.12, contrast: 1.2,
  },
  spawnPoints: (L) => ({ player: [L.spawn.x, L.spawn.z], kiosk: [L.kiosk.x, L.kiosk.z + 2.5], pad: [L.pad.x, L.pad.z], relay: [L.relay.x, L.relay.z - 2.8], dock: [L.dock.x, L.dock.z - 4], chair: [L.chair.x, L.chair.z + 3], dais: [0, -54] }),
};
