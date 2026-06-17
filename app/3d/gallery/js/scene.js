// All-models fly-through of the PolyPerfect demo scenes.
//
// Loads a placements JSON (built offline by parse_scene.py from the .unity file),
// fetches each unique stripped GLB once, and drops a clone at every placement.
// Every model shares ONE material (the gradient atlas + specular metalness), so
// the whole world is a single material with static, frustum-culled meshes.
//
// Unity is left-handed; our GLB geometry was exported to glTF (right-handed) space,
// so each Unity placement matrix M is rebased to glTF as C·M·C with C = diag(1,1,-1).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { initAssets, loadGLB, atlasTex, specTex } from './assets.js';
import { initChars, loadCharacter } from './charrig.js';

const SCENES = [
  ['cast', 'Characters'],
  ['demo01', 'All Models'], ['demo02', 'Worlds'], ['demo07', 'Wild West'],
  ['demo04', 'City'], ['demo05', 'Suburban'], ['demo08', 'Japan'],
  ['demo06', 'Castle'], ['demo09', 'Dungeon'], ['demo10', 'Sci-Fi'],
  ['demo11', 'Farm'], ['demo12', 'Home'], ['demo13', 'Empire'],
  ['demo14', 'Landmarks'], ['demo03', 'Islands'],
];

const $ = s => document.querySelector(s);
const canvas = $('#c');

// ── renderer / scene ───────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc3e8);
scene.fog = new THREE.Fog(0x9fc3e8, 400, 2000);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

scene.add(new THREE.HemisphereLight(0xdfeeff, 0x55514a, 1.0));
const sun = new THREE.DirectionalLight(0xfff2d8, 2.0);
sun.position.set(120, 200, 80);
scene.add(sun);

// big ground plane
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(4000, 4000),
  new THREE.MeshStandardMaterial({ color: 0x6f7d52, roughness: 1, metalness: 0 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.02;
scene.add(ground);

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 2500);

// ── shared atlas material (same recipe as the gallery) ─────────────────────
// The gradient + specular atlases come from the protected pack (assets.js);
// sharedMat is built in boot() once initAssets() has decoded them.
let sharedMat = null;

// ── GLB loading ────────────────────────────────────────────────────────────
// Models come from the pack: assets.js range-fetches + decodes each GLB once
// and returns its master scene; here we swap every mesh onto sharedMat and
// cache it, then buildWorld clones it per placement.
const templates = new Map();          // file -> Object3D (materials swapped to sharedMat)
function loadUnique(file) {
  if (templates.has(file)) return Promise.resolve(templates.get(file));
  return loadGLB(file).then(scn => {
    scn.traverse(n => { if (n.isMesh) n.material = sharedMat; });
    scn.updateMatrixWorld(true);
    templates.set(file, scn);
    return scn;
  });
}
async function loadAll(files, onProgress) {
  let done = 0;
  const queue = files.slice();
  const worker = async () => {
    while (queue.length) {
      const f = queue.pop();
      try { await loadUnique(f); } catch (e) { /* skip a bad glb */ }
      onProgress(++done, files.length);
    }
  };
  await Promise.all(Array.from({ length: 16 }, worker));
}

// ── placement ──────────────────────────────────────────────────────────────
const C = new THREE.Matrix4().makeScale(1, 1, -1);
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
function placementMatrix(p, q, s) {
  _p.set(p[0], p[1], p[2]); _q.set(q[0], q[1], q[2], q[3]); _s.set(s[0], s[1], s[2]);
  _m.compose(_p, _q, _s);
  return _m.clone().premultiply(C).multiply(C);   // C·M·C
}

let world = null;
function buildWorld(data) {
  if (world) { scene.remove(world); disposeTree(world); }
  world = new THREE.Group();
  for (const it of data.items) {
    const tmpl = templates.get(data.files[it.f]);
    if (!tmpl) continue;
    const obj = tmpl.clone(true);
    obj.applyMatrix4(placementMatrix(it.p, it.q, it.s));
    obj.matrixAutoUpdate = false;
    world.add(obj);
  }
  scene.add(world);
  world.updateMatrixWorld(true);
  world.matrixWorldAutoUpdate = false;        // freeze — fully static scene
  window.__dbg = { scene, camera, world, render1,
    setView: (px, py, pz, y, p) => { camera.position.set(px, py, pz); yaw = y; pitch = p; } };
}
// geometries + material are shared across placements and cached across scene
// switches, so a removed world's wrappers are just dropped for GC — nothing to free.
function disposeTree() {}

// ── animated character cast (the rigged PolyPerfect Animated People) ─────────
// All 118 share one 80-bone rig, so one procedural animation set (charrig.js)
// drives them all. We lay them out in a grid and let each slowly cycle through
// the animation set with its own phase, so the crowd reads as alive.
let castGroup = null;
let castChars = [];
const CAST_FACE = 0;                // characters face +Z, toward the opening camera
async function loadCast() {
  if (world) { scene.remove(world); world = null; }
  if (castGroup) { scene.remove(castGroup); castGroup = null; }
  castChars = [];

  const man = await fetch('data/chars.json').then(r => r.json());
  $('#osub').textContent = `${man.count} animated characters · one shared 80-bone rig`;
  await initChars();

  castGroup = new THREE.Group();
  scene.add(castGroup);

  const list = man.chars;
  const COLS = 15, GAP = 2.4;
  const rows = Math.ceil(list.length / COLS);
  const x0 = -(COLS - 1) * GAP / 2;
  const z0 = -(rows - 1) * GAP / 2;
  const box = new THREE.Box3();

  let done = 0;
  const queue = list.map((c, i) => ({ c, i }));
  const worker = async () => {
    while (queue.length) {
      const { c, i } = queue.shift();
      try {
        const ch = await loadCharacter(c.file);
        const col = i % COLS, row = Math.floor(i / COLS);
        ch.group.position.set(x0 + col * GAP, 0, z0 + row * GAP);
        ch.group.rotation.y = CAST_FACE;
        ch.update(0.001);                       // pose once so the preview isn't a T-pose
        box.setFromObject(ch.group);
        ch.group.position.y -= box.min.y;        // drop feet onto the ground
        ch._baseY = ch.group.position.y;
        castGroup.add(ch.group);
        castChars.push(ch);
      } catch (e) { /* skip a character that fails to decode */ }
      $('#bar > i').style.width = `${(++done / list.length * 100).toFixed(1)}%`;
      $('#status').textContent = `loading characters ${done} / ${list.length}`;
    }
  };
  await Promise.all(Array.from({ length: 12 }, worker));
  castGroup.updateMatrixWorld(true);
  frameToCast(COLS, rows, GAP);
  window.__dbg = { scene, camera, castChars, render1,
    step: (dt) => { updateChars(dt); render1(); },     // deterministic tick for headless tests
    setView: (px, py, pz, y, p) => { camera.position.set(px, py, pz); yaw = y; pitch = p; } };
}
function frameToCast(cols, rows, gap) {
  const span = Math.max(cols * gap, rows * gap);
  // open low and near the front row so you walk into the crowd, aimed at chest height
  camera.position.set(0, 6, rows * gap / 2 + span * 0.34);
  const dx = -camera.position.x, dy = 1.2 - camera.position.y, dz = -camera.position.z;
  const L = Math.hypot(dx, dy, dz);
  yaw = Math.atan2(-dx / L, -dz / L);
  pitch = Math.asin(dy / L);
}
function updateChars(dt) { for (const ch of castChars) ch.update(dt); }

// ── fly controls (pointer lock) ────────────────────────────────────────────
const keys = new Set();
let yaw = 0, pitch = -0.12, locked = false;
addEventListener('keydown', e => { keys.add(e.code); if (e.code === 'Space') e.preventDefault(); });
addEventListener('keyup', e => keys.delete(e.code));
canvas.addEventListener('click', () => canvas.requestPointerLock());
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; });
addEventListener('mousemove', e => {
  if (!locked) return;
  yaw -= e.movementX * 0.0023;
  pitch -= e.movementY * 0.0023;
  pitch = Math.max(-1.5, Math.min(1.5, pitch));
});
const _fwd = new THREE.Vector3(), _right = new THREE.Vector3();
function updateCamera(dt) {
  camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
  // Horizontal forward/right straight from yaw — stable (never degenerate, even
  // looking straight down) and intuitive: W/S/A/D glide level, Space/C change height.
  const sy = Math.sin(yaw), cy = Math.cos(yaw);
  const fwd = _fwd.set(-sy, 0, -cy);        // camera faces -z at yaw 0
  const right = _right.set(cy, 0, -sy);     // fwd rotated 90° clockwise about Y
  const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 140 : 48) * dt;
  if (keys.has('KeyW') || keys.has('ArrowUp')) camera.position.addScaledVector(fwd, speed);
  if (keys.has('KeyS') || keys.has('ArrowDown')) camera.position.addScaledVector(fwd, -speed);
  if (keys.has('KeyD') || keys.has('ArrowRight')) camera.position.addScaledVector(right, speed);
  if (keys.has('KeyA') || keys.has('ArrowLeft')) camera.position.addScaledVector(right, -speed);
  if (keys.has('Space')) camera.position.y += speed;
  if (keys.has('KeyC') || keys.has('ControlLeft')) camera.position.y -= speed;
  if (camera.position.y < 1) camera.position.y = 1;
}

// ── render loop + fps ──────────────────────────────────────────────────────
let last = performance.now(), acc = 0, frames = 0, running = false;
const fpsEl = $('#fps');
function render1() { renderer.render(scene, camera); }
function loop() {
  if (!running) return;
  requestAnimationFrame(loop);
  const now = performance.now(), dt = Math.min((now - last) / 1000, 0.05); last = now;
  updateCamera(dt);
  if (castChars.length) updateChars(dt);
  render1();
  acc += dt; if (++frames >= 20) { fpsEl.textContent = `${Math.round(frames / acc)} fps`; frames = 0; acc = 0; }
}
function resize() { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); }
addEventListener('resize', resize); resize();

// ── scene load orchestration ───────────────────────────────────────────────
function frameToScene(data) {
  // rendered z = -unity z (the C·M·C rebase). Use 2–98% percentile bounds so a
  // few outliers (floating clouds, a giant terrain tile) don't blow up the frame,
  // then open on an elevated vantage aimed at the scene centre.
  const xs = data.items.map(i => i.p[0]).sort((a, b) => a - b);
  const zs = data.items.map(i => -i.p[2]).sort((a, b) => a - b);
  const q = (a, t) => a[Math.floor((a.length - 1) * t)];
  const minx = q(xs, 0.02), maxx = q(xs, 0.98), minz = q(zs, 0.02), maxz = q(zs, 0.98);
  const cx = (minx + maxx) / 2, cz = (minz + maxz) / 2;
  const span = Math.max(maxx - minx, maxz - minz, 40);
  camera.position.set(cx, span * 0.5, maxz + span * 0.45);
  // aim at (cx, 0, cz): camera forward = (-sinYaw·cosP, sinP, -cosYaw·cosP)
  const dx = cx - camera.position.x, dy = -camera.position.y, dz = cz - camera.position.z;
  const L = Math.hypot(dx, dy, dz);
  yaw = Math.atan2(-dx / L, -dz / L);
  pitch = Math.asin(dy / L);
}
async function loadScene(id, label) {
  running = false;
  $('#overlay').classList.remove('hidden');
  $('#otitle').textContent = label;
  $('#play').disabled = true; $('#play').textContent = 'Loading…';
  if (id === 'cast') {
    $('#status').textContent = 'decoding character pack…';
    await loadCast();
  } else {
    if (castGroup) { scene.remove(castGroup); castGroup = null; castChars = []; }
    $('#status').textContent = 'fetching placements…';
    const data = await fetch(`scenes/${id}.json`).then(r => r.json());
    $('#osub').textContent = `${data.count.toLocaleString()} objects · ${data.uniques.toLocaleString()} unique models`;
    await loadAll(data.files, (d, n) => {
      $('#bar > i').style.width = `${(d / n * 100).toFixed(1)}%`;
      $('#status').textContent = `loading models ${d} / ${n}`;
    });
    $('#status').textContent = 'placing objects…';
    await new Promise(r => setTimeout(r, 0));
    buildWorld(data);
    frameToScene(data);
  }
  $('#status').textContent = 'ready';
  $('#play').disabled = false; $('#play').textContent = 'Enter scene ▸';
  render1();
}

// scene switcher
const sel = $('#scenesel');
for (const [id, label] of SCENES) {
  const o = document.createElement('option'); o.value = id; o.textContent = label; sel.appendChild(o);
}
let curScene = SCENES[0];
sel.addEventListener('change', () => {
  curScene = SCENES.find(s => s[0] === sel.value);
  loadScene(curScene[0], curScene[1]);
});

$('#play').addEventListener('click', () => {
  $('#overlay').classList.add('hidden');
  running = true; last = performance.now(); loop();
  canvas.requestPointerLock();
});

// decode the pack + build the shared material, then list/load scenes
(async () => {
  $('#status').textContent = 'decoding asset pack…';
  await initAssets(renderer);
  sharedMat = new THREE.MeshStandardMaterial({
    map: atlasTex, metalnessMap: specTex, metalness: 1.0, roughness: 0.62,
    envMapIntensity: 1.0, side: THREE.DoubleSide,
  });
  // only list demo scenes whose json exists ('cast' is procedural, not a json)
  for (const [id] of SCENES) {
    if (id === 'cast') continue;
    const ok = await fetch(`scenes/${id}.json`, { method: 'HEAD' }).then(r => r.ok).catch(() => false);
    if (!ok) { const opt = [...sel.options].find(o => o.value === id); if (opt) opt.remove(); }
  }
  loadScene(SCENES[0][0], SCENES[0][1]);
})();
