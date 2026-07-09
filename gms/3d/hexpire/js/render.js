// Three.js presentation layer. Owns the scene; observes game state and
// diffs meshes against it. No game rules in here.
import * as THREE from 'three';
import { CFG } from './config.js';
import { key, unkey, hexToWorld, worldToHex, corner, EDGE_CORNERS, DIRS } from './hex.js';
import { armyAt } from './state.js';
import * as M from './meshes.js';

export const R = {
  scene: null, camera: null, renderer: null, lite: false,
  cam: { tx: 0, tz: 0, half: 10, min: 3.5, max: 26 },
  bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
  topY: CFG.tileH,
};

let boardMesh = null, boardColors = null, tileRanges = new Map();
let borderMesh = null;
let water = null, waterBase = null;
let treeTrunks = null, treeLeaves = null;
let buildingMeshes = new Map();   // building.id -> {mesh, type, level, owner}
let armyMeshes = new Map();       // army.id -> {mesh, level, owner, hp, bar, animating}
let hlGroup = null, selRing = null;
let raycaster = new THREE.Raycaster();
let groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -CFG.tileH);
let dirLight = null;

const CAM_DIR = new THREE.Vector3(0.85, 1.5, 0.85).normalize();

export function initRender(container, { lite = false } = {}) {
  R.lite = lite;
  R.renderer = new THREE.WebGLRenderer({ antialias: !lite, powerPreference: 'high-performance' });
  R.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  R.renderer.setSize(innerWidth, innerHeight);
  R.renderer.outputColorSpace = THREE.SRGBColorSpace;
  if (!lite) { R.renderer.shadowMap.enabled = true; R.renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
  container.appendChild(R.renderer.domElement);

  R.scene = new THREE.Scene();
  R.scene.background = new THREE.Color(0x87b8d4);
  R.scene.fog = new THREE.Fog(0x87b8d4, 60, 140);

  R.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 300);
  updateCamera();

  R.scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x5a6a4a, 0.95));
  dirLight = new THREE.DirectionalLight(0xfff2dd, 1.35);
  dirLight.position.set(18, 30, 10);
  if (!lite) {
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(2048, 2048);
    dirLight.shadow.bias = -0.0004;
  }
  R.scene.add(dirLight);
  R.scene.add(dirLight.target);

  hlGroup = new THREE.Group();
  R.scene.add(hlGroup);

  addEventListener('resize', onResize);
  onResize();
  return R;
}

function onResize() {
  R.renderer.setSize(innerWidth, innerHeight);
  updateCamera();
}

export function updateCamera() {
  const aspect = innerWidth / innerHeight;
  const h = R.cam.half, w = h * aspect;
  R.camera.left = -w; R.camera.right = w; R.camera.top = h; R.camera.bottom = -h;
  const target = new THREE.Vector3(R.cam.tx, 0, R.cam.tz);
  R.camera.position.copy(target).addScaledVector(CAM_DIR, 60);
  R.camera.lookAt(target);
  R.camera.updateProjectionMatrix();
  if (dirLight) {
    dirLight.position.set(R.cam.tx + 18, 30, R.cam.tz + 10);
    dirLight.target.position.set(R.cam.tx, 0, R.cam.tz);
    const s = Math.max(14, R.cam.half * 2.2);
    const sc = dirLight.shadow.camera;
    sc.left = -s; sc.right = s; sc.top = s; sc.bottom = -s; sc.near = 1; sc.far = 90;
    sc.updateProjectionMatrix();
  }
}

export function worldOf(k, y = CFG.tileH) {
  const [q, r] = unkey(k);
  const { x, z } = hexToWorld(q, r);
  return new THREE.Vector3(x, y, z);
}

// ---------- board ----------

export function buildBoard(st) {
  disposeBoard();
  const tiles = [...st.tiles.values()];
  const H = CFG.tileH, BOT = -0.55;
  const verts = [], cols = [], norms = [];
  tileRanges = new Map();
  const c2 = []; // corner cache
  for (let i = 0; i < 6; i++) c2.push(corner(i, 0.985));

  for (const t of tiles) {
    const { x, z } = hexToWorld(t.q, t.r);
    const start = verts.length / 3;
    // top fan (6 tris) — wind so normals face +y (cross of ccw in xz)
    for (let i = 0; i < 6; i++) {
      const a = c2[i], b = c2[(i + 1) % 6];
      verts.push(x, H, z, x + b.x, H, z + b.z, x + a.x, H, z + a.z);
      for (let j = 0; j < 3; j++) norms.push(0, 1, 0);
    }
    // sides (6 quads = 12 tris)
    for (let i = 0; i < 6; i++) {
      const a = c2[i], b = c2[(i + 1) % 6];
      const ax = x + a.x, az = z + a.z, bx = x + b.x, bz = z + b.z;
      const nx = (a.x + b.x), nz = (a.z + b.z);
      const nl = Math.hypot(nx, nz) || 1;
      verts.push(ax, H, az, ax, BOT, az, bx, H, bz);
      verts.push(bx, H, bz, ax, BOT, az, bx, BOT, bz);
      for (let j = 0; j < 6; j++) norms.push(nx / nl, 0, nz / nl);
    }
    const count = verts.length / 3 - start;
    tileRanges.set(t.k, { start, count });
    for (let i = 0; i < count; i++) cols.push(1, 1, 1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
  boardColors = new THREE.Float32BufferAttribute(cols, 3);
  geo.setAttribute('color', boardColors);
  boardMesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  boardMesh.receiveShadow = true;
  boardMesh.castShadow = false;
  R.scene.add(boardMesh);

  // bounds for camera clamping
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const t of tiles) {
    const { x, z } = hexToWorld(t.q, t.r);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  R.bounds = { minX: minX - 2, maxX: maxX + 2, minZ: minZ - 2, maxZ: maxZ + 2 };

  buildWater();
  buildTrees(st);
  refreshTiles(st);
}

function disposeBoard() {
  for (const g of [boardMesh, borderMesh, water, treeTrunks, treeLeaves]) {
    if (g) { R.scene.remove(g); g.geometry?.dispose(); }
  }
  boardMesh = borderMesh = water = treeTrunks = treeLeaves = null;
  for (const { mesh } of buildingMeshes.values()) R.scene.remove(mesh);
  for (const { mesh } of armyMeshes.values()) R.scene.remove(mesh);
  buildingMeshes = new Map(); armyMeshes = new Map();
}

function buildWater() {
  const w = (R.bounds.maxX - R.bounds.minX) + 90;
  const d = (R.bounds.maxZ - R.bounds.minZ) + 90;
  const geo = new THREE.PlaneGeometry(w, d, 48, 48);
  geo.rotateX(-Math.PI / 2);
  waterBase = geo.attributes.position.array.slice();
  const m = new THREE.MeshPhongMaterial({
    color: CFG.waterColor, emissive: CFG.waterDeep, emissiveIntensity: 0.35,
    shininess: 90, specular: 0x88bbdd, transparent: true, opacity: 0.94,
  });
  water = new THREE.Mesh(geo, m);
  water.position.set((R.bounds.minX + R.bounds.maxX) / 2, 0.13, (R.bounds.minZ + R.bounds.maxZ) / 2);
  water.receiveShadow = true;
  R.scene.add(water);
}

function buildTrees(st) {
  const spots = [];
  for (const t of st.tiles.values()) if (t.tree && !t.building && !t.armyId) spots.push(t);
  const { trunk, leaf, trunkMat, leafMat } = M.treeGeo();
  treeTrunks = new THREE.InstancedMesh(trunk, trunkMat, Math.max(spots.length, 1));
  treeLeaves = new THREE.InstancedMesh(leaf, leafMat, Math.max(spots.length, 1));
  treeTrunks.castShadow = treeLeaves.castShadow = true;
  const m4 = new THREE.Matrix4(), pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
  const rng = (n) => (Math.sin(n * 127.1) * 43758.5453) % 1;
  spots.forEach((t, i) => {
    const { x, z } = hexToWorld(t.q, t.r);
    const ox = rng(i + 1) * 0.5, oz = rng(i + 7) * 0.5;
    const s = 0.8 + Math.abs(rng(i + 3)) * 0.55;
    pos.set(x + ox, CFG.tileH + 0.11 * s, z + oz);
    quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng(i + 5) * 3);
    scl.setScalar(s);
    m4.compose(pos, quat, scl); treeTrunks.setMatrixAt(i, m4);
    pos.y = CFG.tileH + (0.22 + 0.25) * s;
    m4.compose(pos, quat, scl); treeLeaves.setMatrixAt(i, m4);
  });
  treeTrunks.count = treeLeaves.count = spots.length;
  R.scene.add(treeTrunks, treeLeaves);
  treeTrunks.userData.keys = spots.map(t => t.k);
}

export function refreshTrees(st) {
  if (treeTrunks) { R.scene.remove(treeTrunks, treeLeaves); treeTrunks.geometry.dispose(); }
  buildTrees(st);
}

// tile tops + borders after any ownership change
const _c = new THREE.Color();
export function refreshTiles(st) {
  const neutral = new THREE.Color(CFG.neutralTop);
  const contested = new THREE.Color(CFG.contestedTop);
  const side = new THREE.Color(CFG.sideColor);
  for (const t of st.tiles.values()) {
    const range = tileRanges.get(t.k);
    if (!range) continue;
    let top;
    if (t.owner === -2) top = contested.clone();
    else if (t.owner >= 0) {
      // owner colour softened toward parchment — keeps hues true (red stays
      // red rather than muddying with the green base)
      top = _c.setHex(CFG.colors[st.empires[t.owner].colorIdx].hex).clone().lerp(new THREE.Color(0xd8d4c0), 1 - CFG.ownTint);
    } else top = neutral.clone();
    top.offsetHSL(0, 0, t.hVar);
    const sd = side.clone().offsetHSL(0, 0, t.hVar * 0.6);
    if (t.owner >= 0) sd.lerp(_c.setHex(CFG.colors[st.empires[t.owner].colorIdx].hex), 0.12);
    const arr = boardColors.array;
    // first 18 verts are the top fan, rest are sides
    for (let i = 0; i < range.count; i++) {
      const c = i < 18 ? top : sd;
      const o = (range.start + i) * 3;
      arr[o] = c.r; arr[o + 1] = c.g; arr[o + 2] = c.b;
    }
  }
  boardColors.needsUpdate = true;
  rebuildBorders(st);
}

// coloured ribbon quads along ownership borders (incl. contested claims)
function rebuildBorders(st) {
  if (borderMesh) { R.scene.remove(borderMesh); borderMesh.geometry.dispose(); }
  const verts = [], cols = [];
  const W = 0.1, Y = CFG.tileH + 0.015;
  const pushEdge = (t, dirIdx, colorHex) => {
    _c.setHex(colorHex);
    const { x, z } = hexToWorld(t.q, t.r);
    const [ci, cj] = EDGE_CORNERS[dirIdx];
    const a = corner(ci, 0.985), b = corner(cj, 0.985);
    const ax = x + a.x, az = z + a.z, bx = x + b.x, bz = z + b.z;
    // inward offset toward tile centre
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    let ix = x - mx, iz = z - mz;
    const il = Math.hypot(ix, iz) || 1; ix = ix / il * W; iz = iz / il * W;
    verts.push(ax, Y, az, bx, Y, bz, ax + ix, Y, az + iz);
    verts.push(bx, Y, bz, bx + ix, Y, bz + iz, ax + ix, Y, az + iz);
    for (let j = 0; j < 6; j++) cols.push(_c.r, _c.g, _c.b);
  };
  for (const t of st.tiles.values()) {
    if (t.owner === -1) continue;
    for (let d = 0; d < 6; d++) {
      const nk = key(t.q + DIRS[d][0], t.r + DIRS[d][1]);
      const nt = st.tiles.get(nk);
      if (t.owner >= 0) {
        // solid land: border where neighbour isn't ours
        if (!nt || nt.owner !== t.owner) pushEdge(t, d, CFG.colors[st.empires[t.owner].colorIdx].hex);
      } else if (t.owner === -2) {
        // contested: each claimant paints the edges facing their solid land
        if (nt && nt.owner >= 0 && t.claims.includes(nt.owner)) {
          pushEdge(t, d, CFG.colors[st.empires[nt.owner].colorIdx].hex);
        }
      }
    }
  }
  if (!verts.length) { borderMesh = null; return; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  borderMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true }));
  borderMesh.renderOrder = 5;
  R.scene.add(borderMesh);
}

// ---------- buildings & armies ----------

const cssOf = (st, idx) => idx >= 0 ? CFG.colors[st.empires[idx].colorIdx].css : '#8b9779';
const hexOf = (st, idx) => idx >= 0 ? CFG.colors[st.empires[idx].colorIdx].hex : 0x8b9779;

export function syncBuildings(st) {
  const seen = new Set();
  for (const t of st.tiles.values()) {
    const b = t.building;
    if (!b) continue;
    seen.add(b.id);
    const cur = buildingMeshes.get(b.id);
    const sig = b.type + '|' + b.level + '|' + b.owner;
    if (cur && cur.sig === sig) { updateHpBar(cur, b.hp, b.maxHp); continue; }
    if (cur) R.scene.remove(cur.mesh);
    const css = cssOf(st, b.owner);
    const mesh =
      b.type === 'base' ? M.baseMesh(b.level, css) :
      b.type === 'village' ? M.villageMesh(css, b.owner < 0) :
      M.towerMesh(b.type, css);
    mesh.position.copy(worldOf(t.k));
    R.scene.add(mesh);
    buildingMeshes.set(b.id, { mesh, sig, bar: null });
    updateHpBar(buildingMeshes.get(b.id), b.hp, b.maxHp);
  }
  for (const [id, entry] of buildingMeshes) {
    if (!seen.has(id)) { R.scene.remove(entry.mesh); buildingMeshes.delete(id); }
  }
}

export function syncArmies(st) {
  const seen = new Set();
  for (const a of st.armies.values()) {
    seen.add(a.id);
    const cur = armyMeshes.get(a.id);
    const sig = a.level + '|' + a.owner;
    if (cur && cur.sig === sig) {
      if (!cur.animating) cur.mesh.position.copy(worldOf(key(a.q, a.r)));
      updateHpBar(cur, a.hp, a.maxHp, 0.75);
      continue;
    }
    if (cur) R.scene.remove(cur.mesh);
    const mesh = M.armyMesh(a.level, hexOf(st, a.owner), cssOf(st, a.owner));
    mesh.position.copy(worldOf(key(a.q, a.r)));
    R.scene.add(mesh);
    armyMeshes.set(a.id, { mesh, sig, bar: null, animating: false });
    updateHpBar(armyMeshes.get(a.id), a.hp, a.maxHp, 0.75);
  }
  for (const [id, entry] of armyMeshes) {
    if (!seen.has(id)) { R.scene.remove(entry.mesh); armyMeshes.delete(id); }
  }
}

function updateHpBar(entry, hp, maxHp, y = 1.1) {
  const frac = hp / maxHp;
  const want = frac < 0.999;
  if (entry.bar) { entry.mesh.remove(entry.bar); entry.bar = null; }
  if (want) {
    entry.bar = M.hpBar(frac);
    entry.bar.position.y = y;
    entry.mesh.add(entry.bar);
  }
}

export const armyMeshOf = (id) => armyMeshes.get(id) || null;
export const buildingMeshOf = (id) => buildingMeshes.get(id) || null;

// ---------- highlights ----------

let plateGeo = null;
function getPlateGeo() {
  if (!plateGeo) {
    const shape = new THREE.Shape();
    for (let i = 0; i < 6; i++) {
      const c = corner(i, 0.9);
      if (i === 0) shape.moveTo(c.x, c.z); else shape.lineTo(c.x, c.z);
    }
    shape.closePath();
    plateGeo = new THREE.ShapeGeometry(shape);
    plateGeo.rotateX(Math.PI / 2); // shape built in xz already… ShapeGeometry is xy; rotate to xz
  }
  return plateGeo;
}
const plateMats = {
  move: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.34, depthWrite: false, side: THREE.DoubleSide }),
  attack: new THREE.MeshBasicMaterial({ color: 0xff4433, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }),
  merge: new THREE.MeshBasicMaterial({ color: 0x44aaff, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }),
  sel: new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }),
  build: new THREE.MeshBasicMaterial({ color: 0x7fff8a, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide }),
};

export function setHighlights(groups) {
  clearHighlights();
  if (!groups) return;
  for (const [kind, keys] of Object.entries(groups)) {
    const m = plateMats[kind];
    if (!m || !keys) continue;
    for (const k of keys) {
      const p = new THREE.Mesh(getPlateGeo(), m);
      p.position.copy(worldOf(k, CFG.tileH + 0.03));
      p.renderOrder = 10;
      hlGroup.add(p);
    }
  }
}
export function clearHighlights() {
  while (hlGroup.children.length) hlGroup.remove(hlGroup.children[0]);
}

// ---------- picking ----------

const _v2 = new THREE.Vector2(), _v3 = new THREE.Vector3();
export function pickHex(st, clientX, clientY) {
  _v2.set((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(_v2, R.camera);
  if (!raycaster.ray.intersectPlane(groundPlane, _v3)) return null;
  const [q, r] = worldToHex(_v3.x, _v3.z);
  const k = key(q, r);
  return st.tiles.has(k) ? k : null;
}

// like pickHex but returns the [q, r] even where there's no tile (editor)
export function pickHexAny(clientX, clientY) {
  _v2.set((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(_v2, R.camera);
  if (!raycaster.ray.intersectPlane(groundPlane, _v3)) return null;
  return worldToHex(_v3.x, _v3.z);
}

// ---------- camera helpers ----------

export function clampCam() {
  const c = R.cam, b = R.bounds;
  c.half = Math.min(Math.max(c.half, c.min), c.max);
  c.tx = Math.min(Math.max(c.tx, b.minX), b.maxX);
  c.tz = Math.min(Math.max(c.tz, b.minZ), b.maxZ);
}

export function fitCamera(pad = 1.15) {
  const b = R.bounds;
  const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
  R.cam.tx = cx; R.cam.tz = cz;
  const aspect = innerWidth / innerHeight;
  const needH = ((b.maxZ - b.minZ) / 2 + 2) * pad;         // iso foreshortening approx
  const needW = ((b.maxX - b.minX) / 2 + 2) * pad / aspect;
  R.cam.half = Math.max(needH * 0.82, needW * 0.9, R.cam.min);
  R.cam.max = Math.max(R.cam.half * 1.25, 20);
  clampCam();
  updateCamera();
}

export function focusOn(k, half = null) {
  const p = worldOf(k);
  R.cam.tx = p.x; R.cam.tz = p.z;
  if (half) R.cam.half = half;
  clampCam();
  updateCamera();
}

// ---------- per-frame ----------

let waterT = 0;
export function renderUpdate(dt, t) {
  if (water) {
    waterT += dt;
    const pos = water.geometry.attributes.position;
    const arr = pos.array;
    for (let i = 0; i < arr.length; i += 3) {
      const x = waterBase[i], z = waterBase[i + 2];
      arr[i + 1] = Math.sin(x * 0.55 + waterT * 1.2) * 0.035 + Math.cos(z * 0.5 + waterT * 0.9) * 0.035;
    }
    pos.needsUpdate = true;
  }
  // banners sway
  const sway = Math.sin(t * 2.4) * 0.14;
  for (const { mesh } of buildingMeshes.values()) {
    if (mesh.userData.flag) mesh.userData.flag.rotation.y = sway;
  }
  for (const { mesh } of armyMeshes.values()) {
    if (mesh.userData.flag) mesh.userData.flag.rotation.y = sway * 1.3;
  }
  // attack plates pulse
  plateMats.attack.opacity = 0.38 + Math.sin(t * 5) * 0.14;
  plateMats.sel.opacity = 0.4 + Math.sin(t * 4) * 0.15;
  R.renderer.render(R.scene, R.camera);
}
