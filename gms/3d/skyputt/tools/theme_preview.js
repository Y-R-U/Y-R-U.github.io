// SKYPUTT theme preview: a fake S-shaped hole built with the theme's materials, every skin, orbit camera.
// URL params: ?theme=sky  ?q=low  ?view=hole|row|top|wide  ?hud=0  ?t=<fixed seconds>
import * as THREE from 'three';

const qs = new URLSearchParams(location.search);
const themeId = qs.get('theme') || 'sky';
const quality = qs.get('q') === 'low' ? 'low' : 'high';
const view = qs.get('view') || 'hole';
const fixedT = qs.has('t') ? +qs.get('t') : null;
const hud = document.getElementById('hud');
if (qs.get('hud') === '0') hud.classList.add('hide');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = qs.get('shadow') !== '0';
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.05, 1200);

const { default: createTheme } = await import(`../js/themes/${themeId}/index.js`);
const theme = createTheme({ THREE, renderer, quality });
const Mt = theme.materials;

// ---------------- fake hole ----------------
const BALL_R = 0.05, WALL_H = 0.12, WALL_T = 0.12;
const path = [], widths = [];
const L = view === 'row' ? 10 : 19;
for (let s = 0; s <= L + 1e-6; s += 0.25) {
  if (view === 'row') { path.push(new THREE.Vector3(-5 + s, 0, 0)); widths.push(2.4); continue; }
  const x = 1.9 * Math.sin(Math.PI * s / 9.5) * Math.min(1, s / 2.5);
  const y = 0.35 * THREE.MathUtils.smoothstep(s, 12.5, 16.5);
  path.push(new THREE.Vector3(x, y, -s));
  widths.push(s > L - 1.6 ? 1.6 + (s - (L - 1.6)) * 0.5 : s < 1.2 ? 1.9 - s * 0.25 : 1.6);
}
const tangents = path.map((p, i) => {
  const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
  return new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
});
const rightOf = (i) => new THREE.Vector3(-tangents[i].z, 0, tangents[i].x);
const tee = path[2].clone(), cup = path[path.length - 4].clone();
// ?gap=1 cuts a jump gap (engine extension info.floor[])
const floor = path.map((p, i) => !(qs.get('gap') === '1' && view !== 'row' && i >= 25 && i <= 29));
const runs = [];
for (let i = 0, a = -1; i <= path.length; i++) {
  if (i < path.length && floor[i]) { if (a < 0) a = i; }
  else if (a >= 0) { runs.push([a, i - 1]); a = -1; }
}
const course = new THREE.Group();
scene.add(course);

/** Strip between two edges (lat, dy) swept along the path. uvMode 'floor' (u lateral m, v along m) or 'wall' (u along, v height). */
function strip(e1, e2, material, uvMode = 'wall', i0 = 0, i1 = path.length - 1) {
  const pos = [], uv = [], idx = [];
  let dist = 0;
  for (let i = i0; i <= i1; i++) {
    if (i > i0) dist += path[i].distanceTo(path[i - 1]);
    const r = rightOf(i), p = path[i], w = widths[i] / 2;
    for (const [lat, dy, k] of [[e1[0], e1[1], 0], [e2[0], e2[1], 1]]) {
      const l = typeof lat === 'function' ? lat(w) : lat;
      pos.push(p.x + r.x * l, p.y + dy, p.z + r.z * l);
      if (uvMode === 'floor') uv.push(l + w, dist); else uv.push(dist, k ? Math.abs(e2[1] - e1[1]) + Math.abs((typeof e2[0] === 'function' ? e2[0](w) : e2[0]) - (typeof e1[0] === 'function' ? e1[0](w) : e1[0])) : 0);
    }
    if (i < i1) { const a = (i - i0) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, material);
  m.receiveShadow = true;
  course.add(m);
  return m;
}
function fixNormalsUp(mesh) { // flip if the strip faces down
  const n = mesh.geometry.attributes.normal;
  if (n.getY(0) < 0) { mesh.geometry.index.array.reverse(); mesh.geometry.computeVertexNormals(); }
}
for (const [i0, i1] of runs) {
// floor + fringe
fixNormalsUp(strip([w => -w + 0.14, 0], [w => w - 0.14, 0], Mt.grass, 'floor', i0, i1));
fixNormalsUp(strip([w => -w, 0.001], [w => -w + 0.14, 0.001], Mt.fringe, 'floor', i0, i1));
fixNormalsUp(strip([w => w - 0.14, 0.001], [w => w, 0.001], Mt.fringe, 'floor', i0, i1));
// walls: inner face, outer face, cap, gold trim
for (const s of [-1, 1]) {
  const inner = (w) => s * w, outer = (w) => s * (w + WALL_T);
  const a = strip([inner, 0], [inner, WALL_H], Mt.wall, 'wall', i0, i1);
  const b = strip([outer, -0.05], [outer, WALL_H], Mt.wall, 'wall', i0, i1);
  const cap = strip([(w) => s * (w - 0.012), WALL_H + 0.014], [(w) => s * (w + WALL_T + 0.012), WALL_H + 0.014], Mt.wallTop, 'wall', i0, i1);
  fixNormalsUp(cap);
  const capEdge1 = strip([(w) => s * (w - 0.012), WALL_H], [(w) => s * (w - 0.012), WALL_H + 0.014], Mt.trim, 'wall', i0, i1);
  const capEdge2 = strip([(w) => s * (w + WALL_T + 0.012), WALL_H], [(w) => s * (w + WALL_T + 0.012), WALL_H + 0.014], Mt.trim, 'wall', i0, i1);
  const trimIn = strip([(w) => s * (w - 0.004), 0.082], [(w) => s * (w - 0.004), 0.1], Mt.trim, 'wall', i0, i1);
  const trimOut = strip([(w) => s * (w + WALL_T + 0.004), 0.082], [(w) => s * (w + WALL_T + 0.004), 0.1], Mt.trim, 'wall', i0, i1);
  // make vertical faces point the right way (inner faces toward the fairway)
  for (const [m, wantSign] of [[a, -s], [trimIn, -s], [capEdge1, -s], [b, s], [trimOut, s], [capEdge2, s]]) {
    const n = m.geometry.attributes.normal, r = rightOf(i0);
    if ((n.getX(0) * r.x + n.getZ(0) * r.z) * wantSign < 0) { m.geometry.index.array.reverse(); m.geometry.computeVertexNormals(); }
    m.castShadow = true;
  }
}
}
// end walls
for (const [i, dir] of [[0, -1], [path.length - 1, 1]]) {
  const w = widths[i] / 2 + WALL_T, p = path[i], t = tangents[i];
  const box = new THREE.Mesh(new THREE.BoxGeometry(w * 2, WALL_H, WALL_T), Mt.wall);
  box.position.copy(p).addScaledVector(t, dir * WALL_T / 2).add(new THREE.Vector3(0, WALL_H / 2, 0));
  box.rotation.y = Math.atan2(t.x, t.z);
  box.castShadow = box.receiveShadow = true;
  const capb = new THREE.Mesh(new THREE.BoxGeometry(w * 2 + 0.024, 0.014, WALL_T + 0.024), Mt.wallTop);
  capb.position.copy(box.position).add(new THREE.Vector3(0, WALL_H / 2 + 0.007, 0)); capb.rotation.copy(box.rotation);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(w * 2 + 0.03, 0.018, WALL_T + 0.008), Mt.trim);
  trim.position.copy(box.position).add(new THREE.Vector3(0, 0.03, 0)); trim.rotation.copy(box.rotation);
  course.add(box, capb, trim);
}
// cup
const cupHole = new THREE.Mesh(new THREE.CircleGeometry(0.11, 32), new THREE.MeshBasicMaterial({ color: 0x050805 }));
cupHole.rotation.x = -Math.PI / 2; cupHole.position.copy(cup).add(new THREE.Vector3(0, 0.002, 0));
const cupRim = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.008, 6, 32), Mt.cupRim);
cupRim.rotation.x = Math.PI / 2; cupRim.position.copy(cupHole.position);
course.add(cupHole, cupRim);
// boost pad
function pad(i0, i1, half, material, vScale = 1) {
  const m = strip([-half, 0.003], [half, 0.003], material, 'floor', i0, i1);
  const uv = m.geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) - widths[0] / 2 + half) / (2 * half), uv.getY(i) * vScale);
  fixNormalsUp(m);
  return m;
}
if (view !== 'row') {
  pad(5, 14, 0.24, Mt.boost, 1.3);
  const sandM = strip([w => w * 0.15, 0.002], [w => w * 0.8, 0.002], Mt.sand, 'floor', 56, 62); fixNormalsUp(sandM);
}

// ball
const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 32, 16), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 }));
ball.position.copy(tee).add(new THREE.Vector3(0, BALL_R, 0));
ball.castShadow = true;
scene.add(ball);

// ---------------- skins ----------------
const updaters = [];
const placeAt = (obj, i, lat = 0, yaw = 0) => {
  const p = path[i], r = rightOf(i), t = tangents[i];
  obj.position.copy(p).addScaledVector(r, lat);
  obj.rotation.y = Math.atan2(t.x, t.z) + yaw;
  scene.add(obj);
  return obj;
};
const sk = theme.skins;
const skinObjs = {};
if (view === 'row') {
  const xs = [-4.2, -2.8, -1.3, 0, 1.0, 2.0, 3.4];
  let k = 0;
  const put = (o) => { o.position.set(xs[k++], 0, 0); scene.add(o); return o; };
  const wm = sk.windmill({ towerRadius: 0.45, towerHeight: 1.2, hubHeight: 0.95, bladeCount: 4, bladeLength: 0.8, bladeWidth: 0.2, gapWidth: 0.3 });
  put(wm.object); skinObjs.windmill = wm;
  const lp = sk.loop({ radius: 0.5, width: 0.45, sideShift: 0.5 }); put(lp); lp.position.x -= 0.25;
  const tc = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.4, 0.1, 0.4), new THREE.Vector3(0, 0.25, -0.2), new THREE.Vector3(0.4, 0.1, 0.4)]);
  put(sk.tube({ curve: tc, radius: 0.1 }));
  const fl = sk.flag({ poleHeight: 1.0 }); put(fl.object); updaters.push(fl);
  const pk = sk.pickup({}); put(pk.object); updaters.push(pk);
  put(sk.bumper({ radius: 0.1, height: 0.15 }));
  put(sk.teePad({ radius: 0.32 }));
} else {
  placeAt(sk.teePad({ radius: 0.32 }), 2, 0, Math.PI);
  const wm = sk.windmill({ towerRadius: 0.5, towerHeight: 1.3, hubHeight: 1.0, bladeCount: 4, bladeLength: 0.9, bladeWidth: 0.22, gapWidth: 0.32, gapHeight: 0.24 });
  placeAt(wm.object, 44, 0, Math.PI); skinObjs.windmill = wm;
  // loop on the fairway, with a stand-in track surface (the engine provides the real one)
  const loopOpts = { radius: 0.55, width: 0.5, sideShift: 0.55 };
  const lp = sk.loop(loopOpts);
  placeAt(lp, 66, 0.3, 0);
  const trackPos = [], trackIdx = [];
  for (let i = 0; i <= 64; i++) {
    const t = i / 64, a = t * Math.PI * 2;
    for (const e of [-0.5, 0.5]) trackPos.push(loopOpts.sideShift * (t - Math.sin(2 * Math.PI * t) / (2 * Math.PI)) + e * loopOpts.width, loopOpts.radius - loopOpts.radius * Math.cos(a), loopOpts.radius * Math.sin(a));
    if (i < 64) { const k = i * 2; trackIdx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(trackPos, 3)); tg.setIndex(trackIdx); tg.computeVertexNormals();
  const track = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ color: 0x5aa83a, roughness: 0.9, side: THREE.DoubleSide }));
  lp.add(track);
  // glass tube swinging out over the right edge
  const r30 = rightOf(30), r40 = rightOf(40);
  const tc = new THREE.CatmullRomCurve3([
    path[28].clone().addScaledVector(rightOf(28), 0.5).add(new THREE.Vector3(0, 0.1, 0)),
    path[31].clone().addScaledVector(r30, 1.5).add(new THREE.Vector3(0, 0.3, 0)),
    path[36].clone().addScaledVector(r40, 2.2).add(new THREE.Vector3(0, 0.45, 0)),
    path[41].clone().addScaledVector(r40, 1.4).add(new THREE.Vector3(0, 0.3, 0)),
    path[43].clone().addScaledVector(rightOf(43), 0.5).add(new THREE.Vector3(0, 0.1, 0)),
  ]);
  scene.add(sk.tube({ curve: tc, radius: 0.11 }));
  const fl = sk.flag({ poleHeight: 1.0 }); fl.object.position.copy(cup); scene.add(fl.object); updaters.push(fl);
  for (const [i, lat] of [[20, 0.3], [34, -0.35], [52, 0.25]]) {
    const pk = sk.pickup({}); placeAt(pk.object, i, lat, Math.PI); updaters.push(pk);
  }
  for (const [i, lat] of [[58, -0.42], [61, 0.4]]) placeAt(sk.bumper({ radius: 0.1, height: 0.15 }), i, lat, Math.PI);
}

// ---------------- environment ----------------
const bounds = new THREE.Box3();
for (let i = 0; i < path.length; i++) {
  const r = rightOf(i), w = widths[i] / 2 + WALL_T;
  bounds.expandByPoint(path[i].clone().addScaledVector(r, w));
  bounds.expandByPoint(path[i].clone().addScaledVector(r, -w));
}
bounds.max.y += 1.4;
const env = theme.buildEnvironment(scene, { bounds, path, widths, floor, tee, cup, camera, renderer, quality });
// Phone debugging: ?env=0 drops the PMREM reflections, ?shadow=0 turns shadows off.
if (qs.get('env') === '0') scene.environment = null;
if (qs.get('shadow') === '0') { renderer.shadowMap.enabled = false; scene.traverse((o) => { if (o.isLight) o.castShadow = false; }); }
const gl = renderer.getContext();
const dbg = gl.getExtension('WEBGL_debug_renderer_info');
const gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);

// ---------------- camera + orbit ----------------
const target = new THREE.Vector3();
const sph = new THREE.Spherical();
function setView(v) {
  if (v === 'row') { camera.position.set(0, 1.6, 5.2); target.set(0, 0.45, 0); }
  else if (v === 'top') { camera.position.set(0.5, 22, 2); target.set(0, 0, -9.5); }
  else if (v === 'wide') { camera.position.set(-9, 9, 10); target.set(0, 0, -9); }
  else { const portrait = innerWidth < innerHeight;
    if (portrait) { camera.position.copy(tee).add(new THREE.Vector3(0.0, 1.3, 1.3)); target.copy(tee).add(new THREE.Vector3(0.15, 0, -2.2)); }
    else { camera.position.copy(tee).add(new THREE.Vector3(0.0, 1.9, 2.3)); target.copy(tee).add(new THREE.Vector3(0.15, 0, -4.5)); }
    camera.fov = portrait ? 64 : 50; camera.updateProjectionMatrix(); }
  camera.lookAt(target);
  sph.setFromVector3(camera.position.clone().sub(target));
}
setView(view);
const ptrs = new Map();
let pinch0 = 0;
renderer.domElement.addEventListener('pointerdown', e => { ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); renderer.domElement.setPointerCapture(e.pointerId); });
renderer.domElement.addEventListener('pointerup', e => { ptrs.delete(e.pointerId); pinch0 = 0; });
renderer.domElement.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); pinch0 = 0; });
renderer.domElement.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId); if (!p) return;
  if (ptrs.size === 1) {
    sph.theta -= (e.clientX - p.x) * 0.006;
    sph.phi = THREE.MathUtils.clamp(sph.phi - (e.clientY - p.y) * 0.006, 0.08, Math.PI * 0.49);
  } else if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch0) sph.radius = THREE.MathUtils.clamp(sph.radius * pinch0 / d, 0.6, 120);
    pinch0 = d;
  }
  p.x = e.clientX; p.y = e.clientY;
});
renderer.domElement.addEventListener('wheel', e => { sph.radius = THREE.MathUtils.clamp(sph.radius * Math.exp(e.deltaY * 0.001), 0.6, 120); e.preventDefault(); }, { passive: false });
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

// ---------------- loop ----------------
const clock = new THREE.Clock();
let frames = 0, fpsT = 0, fps = 0;
window.__preview = { renderer, scene, camera, env, theme, setView, sph, target };
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = fixedT ?? clock.elapsedTime;
  camera.position.copy(target).add(new THREE.Vector3().setFromSpherical(sph));
  camera.lookAt(target);
  env.update(dt, t);
  for (const u of updaters) u.update(dt, t);
  if (skinObjs.windmill) skinObjs.windmill.rotor.rotation.z = t * 1.2;  // engine: omega * t + phase
  renderer.render(scene, camera);
  frames++; fpsT += dt;
  if (fpsT > 0.5) { fps = frames / fpsT; frames = 0; fpsT = 0; }
  const ri = renderer.info;
  window.__stats = { calls: ri.render.calls, triangles: ri.render.triangles, geometries: ri.memory.geometries, textures: ri.memory.textures, programs: ri.programs.length, fps: Math.round(fps) };
  if (!hud.classList.contains('hide')) hud.textContent = `${theme.name} (${quality})  ${Math.round(fps)} fps\ncalls ${ri.render.calls}  tris ${ri.render.triangles}\n${gpu}`;
  requestAnimationFrame(frame);
}
frame();
window.__ready = true;
