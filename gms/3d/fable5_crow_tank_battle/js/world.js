// Rendering setup + the harvest-dusk farm arena (visuals carried over from
// Murder at Dusk): gradient sky, setting sun, faceted hills, fence ring,
// barn, windmill, fireflies — plus collidable cover for the firefights.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FIELD_R, LITE_MODE } from './config.js';
import { rand, randInt, clamp } from './utils.js';

export let renderer, scene, camera, composer;
export const obstacles = [];   // { x, z, r } collision circles on the ground

export function glowBasic(hex, boost = 1.6) {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(boost) });
}

let rotor = null;
let windowMat = null;
let fireflies = null;
const fireflySeeds = [];
const clouds = [];

export function initWorld(container) {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.shadowMap.enabled = !LITE_MODE;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x2a1430, 70, 420);

  camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1300);
  camera.position.set(0, 10, 16);

  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  if (!LITE_MODE) {
    composer.addPass(new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight), 0.7, 0.55, 0.72));
  }
  composer.addPass(new OutputPass());

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
  });

  // dusk light: lavender sky bounce + long warm shadows from the low sun
  scene.add(new THREE.HemisphereLight(0x9a6ab0, 0x4a3018, 1.15));

  const sun = new THREE.DirectionalLight(0xff8a4d, 1.6);
  sun.position.set(35, 38, -110);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -65;
  sun.shadow.camera.right = 65;
  sun.shadow.camera.top = 65;
  sun.shadow.camera.bottom = -65;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 320;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);

  buildSky();
  buildTerrain();
  buildField();
  buildCover();
  buildFarm();
  buildFireflies();
}

// ---------------------------------------------------------------------------
// Sky: gradient dome, setting sun, rising moon, stars, drifting clouds
// ---------------------------------------------------------------------------

function buildSky() {
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 vPos;
      void main() {
        float h = clamp(normalize(vPos).y, -0.08, 1.0);
        vec3 zenith  = vec3(0.07, 0.05, 0.16);   // deep indigo
        vec3 mid     = vec3(0.32, 0.12, 0.30);   // dusk violet
        vec3 horizon = vec3(0.98, 0.42, 0.16);   // burnt orange
        vec3 col = mix(horizon, mid, smoothstep(-0.02, 0.24, h));
        col = mix(col, zenith, smoothstep(0.22, 0.75, h));
        float sunK = pow(max(dot(normalize(vPos.xz), normalize(vec2(0.25, -1.0))) * 0.5 + 0.5, 0.0), 3.0);
        col += vec3(0.30, 0.10, 0.02) * sunK * (1.0 - smoothstep(0.0, 0.5, h));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(620, 24, 16), skyMat));

  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(30, 40),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xff9a2e).multiplyScalar(1.7), fog: false }));
  sunDisc.position.set(110, 26, -480);
  sunDisc.lookAt(0, 10, 0);
  scene.add(sunDisc);

  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(64, 40),
    new THREE.MeshBasicMaterial({
      color: 0xff5a18, transparent: true, opacity: 0.35, fog: false,
      blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.position.set(110, 30, -481);
  halo.lookAt(0, 10, 0);
  scene.add(halo);

  const moon = new THREE.Mesh(
    new THREE.CircleGeometry(22, 32),
    new THREE.MeshBasicMaterial({
      color: 0xf3ead0, transparent: true, opacity: 0.85, fog: false }));
  moon.position.set(-220, 190, 420);
  moon.lookAt(0, 10, 0);
  scene.add(moon);

  const starCount = 380;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const a = rand(0, Math.PI * 2);
    const r = rand(300, 560);
    starPos[i * 3] = Math.cos(a) * r;
    starPos[i * 3 + 1] = rand(80, 460);
    starPos[i * 3 + 2] = Math.sin(a) * r;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xe8e4ff, size: 1.8, sizeAttenuation: false,
    transparent: true, opacity: 0.7, fog: false, depthWrite: false })));

  // long thin stratus bands catching the last light
  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0x352040, emissive: 0x451a2e, emissiveIntensity: 0.5,
    flatShading: true, roughness: 1, fog: false });
  for (let i = 0; i < 7; i++) {
    const g = new THREE.Group();
    for (let j = 0; j < randInt(2, 3); j++) {
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(6, 10), 0), cloudMat);
      c.scale.set(rand(3.6, 5.5), rand(0.14, 0.2), rand(0.8, 1.2));
      c.position.set(rand(-18, 18), rand(-2, 2), rand(-5, 5));
      g.add(c);
    }
    const a = rand(0, Math.PI * 2);
    const r = rand(260, 430);
    g.position.set(Math.cos(a) * r, rand(95, 180), Math.sin(a) * r);
    scene.add(g);
    clouds.push({ g, speed: rand(0.7, 1.8), baseX: g.position.x });
  }
}

// ---------------------------------------------------------------------------
// Terrain: flat field inside the fence, faceted hills beyond
// ---------------------------------------------------------------------------

function buildTerrain() {
  const size = 900, segs = 96;
  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cField = new THREE.Color(0x8a6228);   // harvested wheat gold
  const cEdge = new THREE.Color(0x4a3d1e);    // dry scrub
  const cFar = new THREE.Color(0x1f1226);     // dusk-purple hills
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const r = Math.hypot(x, z);
    const ramp = clamp((r - (FIELD_R + 12)) / 70, 0, 1);
    let h = Math.sin(x * 0.021 + 1.7) * Math.cos(z * 0.019 + 0.4) * 5
          + Math.sin(x * 0.047 + 0.6) * Math.cos(z * 0.041) * 2.4
          + Math.sin(x * 0.009) * Math.cos(z * 0.011 + 2.0) * 9;
    h = Math.max(0, h + 3.5) * ramp;
    pos.setY(i, h);

    const k1 = clamp((r - FIELD_R) / 26, 0, 1);
    const k2 = clamp((r - 110) / 160, 0, 1);
    tmp.copy(cField).lerp(cEdge, k1).lerp(cFar, k2);
    const v = 1 + rand(-0.06, 0.06);
    colors[i * 3] = tmp.r * v;
    colors[i * 3 + 1] = tmp.g * v;
    colors[i * 3 + 2] = tmp.b * v;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    vertexColors: true, flatShading: true, roughness: 1, metalness: 0 }));
  ground.receiveShadow = true;
  scene.add(ground);
}

// ---------------------------------------------------------------------------
// The field: stubble, fence ring, pumpkin decoration
// ---------------------------------------------------------------------------

function buildField() {
  const stubbleGeo = new THREE.ConeGeometry(0.09, 0.55, 4);
  const stubbleMat = new THREE.MeshStandardMaterial({
    color: 0xb08838, flatShading: true, roughness: 1 });
  const stubble = new THREE.InstancedMesh(stubbleGeo, stubbleMat, 240);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (let i = 0; i < 240; i++) {
    const a = rand(0, Math.PI * 2);
    const r = Math.sqrt(Math.random()) * (FIELD_R - 2);
    const s = rand(0.7, 1.5);
    e.set(rand(-0.18, 0.18), rand(0, Math.PI), rand(-0.18, 0.18));
    q.setFromEuler(e);
    m.compose(
      new THREE.Vector3(Math.cos(a) * r, 0.22 * s, Math.sin(a) * r),
      q, new THREE.Vector3(s, s, s));
    stubble.setMatrixAt(i, m);
  }
  scene.add(stubble);

  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x2e2018, flatShading: true, roughness: 1 });
  const postGeo = new THREE.BoxGeometry(0.22, 1.7, 0.22);
  const posts = new THREE.InstancedMesh(postGeo, woodMat, 48);
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    e.set(rand(-0.05, 0.05), a, rand(-0.05, 0.05));
    q.setFromEuler(e);
    m.compose(
      new THREE.Vector3(Math.cos(a) * FIELD_R, 0.85, Math.sin(a) * FIELD_R),
      q, new THREE.Vector3(1, 1, 1));
    posts.setMatrixAt(i, m);
  }
  posts.castShadow = true;
  scene.add(posts);

  for (const y of [0.6, 1.25]) {
    const rail = new THREE.Mesh(new THREE.TorusGeometry(FIELD_R, 0.07, 4, 72), woodMat);
    rail.rotation.x = Math.PI / 2;
    rail.position.y = y;
    scene.add(rail);
  }

  const pumpkinMat = new THREE.MeshStandardMaterial({
    color: 0xc85a18, flatShading: true, roughness: 0.8 });
  const pumpkinGeo = new THREE.SphereGeometry(0.45, 7, 5);
  for (let i = 0; i < 9; i++) {
    const a = rand(0, Math.PI * 2);
    const r = rand(8, FIELD_R - 4);
    const p = new THREE.Mesh(pumpkinGeo, pumpkinMat);
    const s = rand(0.7, 1.4);
    p.scale.set(s, s * 0.72, s);
    p.position.set(Math.cos(a) * r, 0.3 * s, Math.sin(a) * r);
    p.castShadow = true;
    scene.add(p);
  }
}

// ---------------------------------------------------------------------------
// Collidable cover: hay bales, scarecrows, a hay wagon, stone troughs.
// Tanks and bolts treat each as a circle on the ground plane. The spawn
// ring (radius ~38) is kept clear.
// ---------------------------------------------------------------------------

const placed = [];

function tryPlace(minR, maxR, gap = 12) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const a = rand(0, Math.PI * 2);
    const r = rand(minR, maxR);
    if (Math.abs(r - 38) < 5) continue;   // keep the spawn ring clear
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (placed.every((p) => Math.hypot(p.x - x, p.z - z) > gap)) {
      placed.push({ x, z });
      return { x, z };
    }
  }
  return null;
}

function buildCover() {
  const hayMat = new THREE.MeshStandardMaterial({
    color: 0xa87f33, flatShading: true, roughness: 1 });
  const hayGeo = new THREE.CylinderGeometry(1.35, 1.35, 2.5, 9);

  // hay bales — some single, some stacked pairs
  for (let i = 0; i < 7; i++) {
    const p = tryPlace(9, FIELD_R - 7);
    if (!p) continue;
    const yaw = rand(0, Math.PI);
    const bale = new THREE.Mesh(hayGeo, hayMat);
    bale.rotation.z = Math.PI / 2;
    bale.rotation.y = yaw;
    bale.position.set(p.x, 1.35, p.z);
    bale.castShadow = true;
    bale.receiveShadow = true;
    scene.add(bale);
    if (i % 3 === 0) {
      const top = new THREE.Mesh(hayGeo, hayMat);
      top.rotation.z = Math.PI / 2;
      top.rotation.y = yaw + rand(-0.3, 0.3);
      top.position.set(p.x, 3.6, p.z);
      top.scale.setScalar(0.85);
      top.castShadow = true;
      scene.add(top);
    }
    obstacles.push({ x: p.x, z: p.z, r: 2.1 });
  }

  // scarecrows
  for (let i = 0; i < 3; i++) {
    const p = tryPlace(12, FIELD_R - 10);
    if (!p) continue;
    const sc = buildScarecrow();
    sc.position.set(p.x, 0, p.z);
    sc.rotation.y = rand(0, Math.PI * 2);
    scene.add(sc);
    obstacles.push({ x: p.x, z: p.z, r: 1.0 });
  }

  // hay wagon — long cover
  const p = tryPlace(14, FIELD_R - 12, 16);
  if (p) {
    const wagon = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x4a3020, flatShading: true, roughness: 1 });
    const bed = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.4, 2.8), woodMat);
    bed.position.y = 1.3;
    bed.castShadow = true;
    wagon.add(bed);
    [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.25, 9), woodMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(sx * 2.3, 0.85, sz * 1.55);
      wheel.castShadow = true;
      wagon.add(wheel);
    }));
    const load = new THREE.Mesh(hayGeo, hayMat);
    load.rotation.z = Math.PI / 2;
    load.position.y = 2.6;
    load.scale.set(0.9, 1.7, 0.9);
    load.castShadow = true;
    wagon.add(load);
    wagon.position.set(p.x, 0, p.z);
    wagon.rotation.y = rand(0, Math.PI);
    scene.add(wagon);
    obstacles.push({ x: p.x, z: p.z, r: 3.3 });
  }

  // stone water troughs
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x4a4248, flatShading: true, roughness: 1 });
  for (let i = 0; i < 2; i++) {
    const p2 = tryPlace(10, FIELD_R - 8);
    if (!p2) continue;
    const trough = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.2, 1.6), stoneMat);
    trough.position.set(p2.x, 0.6, p2.z);
    trough.rotation.y = rand(0, Math.PI);
    trough.castShadow = true;
    trough.receiveShadow = true;
    scene.add(trough);
    obstacles.push({ x: p2.x, z: p2.z, r: 1.9 });
  }
}

function buildScarecrow() {
  const g = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x3a2a1c, flatShading: true, roughness: 1 });
  const sackMat = new THREE.MeshStandardMaterial({
    color: 0x8a7444, flatShading: true, roughness: 1 });
  const coatMat = new THREE.MeshStandardMaterial({
    color: 0x4a2e2e, flatShading: true, roughness: 1 });

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 3.2, 5), woodMat);
  pole.position.y = 1.6;
  pole.castShadow = true;
  g.add(pole);
  const arms = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 5), woodMat);
  arms.rotation.z = Math.PI / 2;
  arms.position.y = 2.35;
  arms.castShadow = true;
  g.add(arms);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.45), coatMat);
  body.position.y = 1.95;
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 6, 5), sackMat);
  head.position.y = 2.95;
  head.castShadow = true;
  g.add(head);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.55, 6), woodMat);
  hat.position.y = 3.3;
  g.add(hat);
  return g;
}

// ---------------------------------------------------------------------------
// Farm buildings + dead trees (outside the fence, decoration only)
// ---------------------------------------------------------------------------

function buildFarm() {
  const barn = new THREE.Group();
  const barnRed = new THREE.MeshStandardMaterial({
    color: 0x69241c, flatShading: true, roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0x241a1e, flatShading: true, roughness: 1 });

  const base = new THREE.Mesh(new THREE.BoxGeometry(11, 6, 8.5), barnRed);
  base.position.y = 3;
  base.castShadow = true;
  base.receiveShadow = true;
  barn.add(base);
  [-1, 1].forEach((s) => {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.35, 5.6), roofMat);
    panel.position.set(0, 7.05, s * 2.32);
    panel.rotation.x = s * 0.58;
    panel.castShadow = true;
    barn.add(panel);
  });
  const gable = new THREE.Mesh(new THREE.CylinderGeometry(4.55, 4.55, 11, 3, 1), barnRed);
  gable.rotation.z = Math.PI / 2;
  gable.rotation.x = Math.PI / 2;
  gable.scale.y = 0.62;
  gable.position.y = 6;
  barn.add(gable);
  const door = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.4, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x2a1410, flatShading: true, roughness: 1 }));
  door.position.set(0, 1.7, 4.32);
  barn.add(door);
  windowMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0xffb347).multiplyScalar(1.6) });
  const win = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), windowMat);
  win.position.set(3.4, 4.1, 4.31);
  barn.add(win);
  barn.position.set(56, 0, -56);
  barn.rotation.y = Math.PI / 4 + Math.PI;
  scene.add(barn);

  const mill = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({
    color: 0x2c2630, flatShading: true, roughness: 0.7, metalness: 0.4 });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 13, 0.18), steel);
    leg.position.set(sx * 1.1, 6.5, sz * 1.1);
    leg.rotation.z = -sx * 0.085;
    leg.rotation.x = sz * 0.085;
    leg.castShadow = true;
    mill.add(leg);
  }
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 1.6), steel);
  head.position.y = 13.2;
  mill.add(head);
  rotor = new THREE.Group();
  rotor.position.set(0, 13.2, -1.0);
  const bladeGeo = new THREE.BoxGeometry(0.5, 2.8, 0.06);
  const bladeMat = new THREE.MeshStandardMaterial({
    color: 0x6a5a4a, flatShading: true, roughness: 1 });
  for (let i = 0; i < 8; i++) {
    const b = new THREE.Mesh(bladeGeo, bladeMat);
    const a = (i / 8) * Math.PI * 2;
    b.position.set(Math.cos(a) * 1.7, Math.sin(a) * 1.7, 0);
    b.rotation.z = a + Math.PI / 2;
    b.rotation.y = 0.35;
    rotor.add(b);
  }
  mill.add(rotor);
  const vane = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.0, 1.6), bladeMat);
  vane.position.set(0, 13.2, 1.6);
  mill.add(vane);
  mill.position.set(-66, 0, -22);
  mill.rotation.y = -0.8;
  scene.add(mill);

  const barkMat = new THREE.MeshStandardMaterial({
    color: 0x171019, flatShading: true, roughness: 1 });
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + rand(-0.25, 0.25);
    const r = rand(FIELD_R + 8, FIELD_R + 52);
    if (Math.hypot(Math.cos(a) * r - 56, Math.sin(a) * r + 56) < 16) continue;
    if (Math.hypot(Math.cos(a) * r + 66, Math.sin(a) * r + 22) < 14) continue;
    const tree = buildDeadTree(barkMat);
    tree.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    tree.rotation.y = rand(0, Math.PI * 2);
    scene.add(tree);
  }
}

function buildDeadTree(mat) {
  const g = new THREE.Group();
  const h = rand(5.5, 9);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.5, h, 5), mat);
  trunk.position.y = h / 2;
  trunk.rotation.y = rand(0, Math.PI);
  trunk.castShadow = true;
  g.add(trunk);
  const n = randInt(3, 5);
  for (let i = 0; i < n; i++) {
    const bl = rand(2, 3.8);
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.16, bl, 4), mat);
    const ba = rand(0, Math.PI * 2);
    const tilt = rand(0.5, 1.1);
    const by = rand(h * 0.45, h * 0.95);
    b.position.set(
      Math.cos(ba) * (0.2 + Math.sin(tilt) * bl * 0.5), by + Math.cos(tilt) * bl * 0.5,
      Math.sin(ba) * (0.2 + Math.sin(tilt) * bl * 0.5));
    b.rotation.set(Math.sin(ba) * tilt, 0, -Math.cos(ba) * tilt);
    b.castShadow = true;
    g.add(b);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Fireflies
// ---------------------------------------------------------------------------

function buildFireflies() {
  const n = 46;
  const posArr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2);
    const r = rand(6, FIELD_R + 18);
    fireflySeeds.push({
      x: Math.cos(a) * r, z: Math.sin(a) * r,
      y: rand(0.5, 2.6), p: rand(0, Math.PI * 2), s: rand(0.4, 1.1),
    });
    posArr[i * 3] = fireflySeeds[i].x;
    posArr[i * 3 + 1] = fireflySeeds[i].y;
    posArr[i * 3 + 2] = fireflySeeds[i].z;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  fireflies = new THREE.Points(geo, new THREE.PointsMaterial({
    color: new THREE.Color(0xc8ff6a).multiplyScalar(1.4), size: 0.22,
    transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending,
    depthWrite: false }));
  scene.add(fireflies);
}

// ---------------------------------------------------------------------------

export function updateEnvironment(time) {
  if (rotor) rotor.rotation.z = time * 0.55;
  if (windowMat) {
    windowMat.color.setHex(0xffb347).multiplyScalar(
      1.45 + Math.sin(time * 7.3) * 0.08 + Math.sin(time * 1.7) * 0.1);
  }
  for (const c of clouds) {
    c.g.position.x = c.baseX + Math.sin(time * 0.01 * c.speed) * 60;
  }
  if (fireflies) {
    const p = fireflies.geometry.attributes.position;
    for (let i = 0; i < fireflySeeds.length; i++) {
      const f = fireflySeeds[i];
      p.setXYZ(i,
        f.x + Math.sin(time * 0.5 * f.s + f.p) * 2.2,
        f.y + Math.sin(time * 0.9 * f.s + f.p * 2) * 0.7,
        f.z + Math.cos(time * 0.4 * f.s + f.p) * 2.2);
    }
    p.needsUpdate = true;
    fireflies.material.opacity = 0.55 + Math.sin(time * 2.2) * 0.3;
  }
}
