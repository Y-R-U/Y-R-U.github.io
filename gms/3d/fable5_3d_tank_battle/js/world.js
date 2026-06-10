// Rendering setup + the synthwave night arena (visuals carried over from
// Drone Storm) + collidable obstacles + the shrinking storm wall.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ARENA_R, LITE_MODE } from './config.js';
import { rand, randInt } from './utils.js';

export let renderer, scene, camera, composer;
export const obstacles = [];   // { x, z, r } collision circles

let sunMat = null;
let zoneWall = null, zoneRing = null;
const beacons = [];
const crystals = [];

export function neonBasic(hex, boost = 1.6) {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(boost) });
}

export function initWorld(container) {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = !LITE_MODE;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0618);
  scene.fog = new THREE.Fog(0x1b0f3a, 55, 270);

  camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
  camera.position.set(0, 10, 16);

  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  if (!LITE_MODE) {
    composer.addPass(new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight), 0.85, 0.5, 0.62));
  }
  composer.addPass(new OutputPass());

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
  });

  scene.add(new THREE.HemisphereLight(0x6a4cff, 0x140a2a, 0.9));

  const moon = new THREE.DirectionalLight(0xff7ad9, 1.05);
  moon.position.set(45, 75, 35);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  moon.shadow.camera.left = -70;
  moon.shadow.camera.right = 70;
  moon.shadow.camera.top = 70;
  moon.shadow.camera.bottom = -70;
  moon.shadow.camera.near = 10;
  moon.shadow.camera.far = 220;
  moon.shadow.bias = -0.0006;
  scene.add(moon);
  scene.add(moon.target);

  buildEnvironment();
  buildObstacles();
  buildZone();
}

function buildEnvironment() {
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(280, 48),
    new THREE.MeshStandardMaterial({ color: 0x0e0a22, roughness: 1, metalness: 0 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(240, 60, 0x9a4dff, 0x35206b);
  grid.material.transparent = true;
  grid.material.opacity = 0.55;
  grid.position.y = 0.02;
  scene.add(grid);

  // Static outer boundary
  const arenaRing = new THREE.Mesh(
    new THREE.TorusGeometry(ARENA_R, 0.13, 6, 80), neonBasic(0x4df3ff, 1.2));
  arenaRing.rotation.x = Math.PI / 2;
  arenaRing.position.y = 0.06;
  scene.add(arenaRing);

  // Mountain silhouettes
  const mountainMat = new THREE.MeshStandardMaterial({
    color: 0x191035, flatShading: true, roughness: 1 });
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2 + rand(-0.07, 0.07);
    const r = rand(170, 235);
    const h = rand(24, 60);
    const m = new THREE.Mesh(
      new THREE.ConeGeometry(rand(16, 36), h, randInt(4, 6)), mountainMat);
    m.position.set(Math.cos(a) * r, h / 2 - 1, Math.sin(a) * r);
    m.rotation.y = rand(0, Math.PI);
    scene.add(m);
  }

  // Striped synthwave sun
  sunMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uTime;
      void main() {
        vec2 c = vUv - 0.5;
        if (length(c) > 0.5) discard;
        float y = vUv.y;
        vec3 col = mix(vec3(1.0, 0.16, 0.5), vec3(1.0, 0.66, 0.16), smoothstep(0.15, 0.9, y));
        float stripe = fract(y * 16.0 + uTime * 0.12);
        float gap = (0.62 - y) * 0.9;
        if (y < 0.62 && stripe < gap) discard;
        gl_FragColor = vec4(col * 0.6, 1.0);
      }`,
  });
  const sun = new THREE.Mesh(new THREE.CircleGeometry(62, 48), sunMat);
  sun.position.set(0, 26, -350);
  scene.add(sun);

  // Stars
  const starCount = 420;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const a = rand(0, Math.PI * 2);
    const r = rand(280, 520);
    starPos[i * 3] = Math.cos(a) * r;
    starPos[i * 3 + 1] = rand(30, 380);
    starPos[i * 3 + 2] = Math.sin(a) * r;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xcfe0ff, size: 2.0, sizeAttenuation: false,
    transparent: true, opacity: 0.85, fog: false, depthWrite: false })));

  // Decorative beacon towers near the rim (not collidable, outside play zone)
  const towerMat = new THREE.MeshStandardMaterial({
    color: 0x171430, flatShading: true, roughness: 0.8 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rand(-0.3, 0.3);
    const r = rand(ARENA_R + 8, ARENA_R + 22);
    const h = rand(10, 17);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(0.7, h, 0.7), towerMat);
    tower.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
    scene.add(tower);
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 8, 6), neonBasic(0xff2244, 1.8));
    beacon.position.set(tower.position.x, h + 0.3, tower.position.z);
    scene.add(beacon);
    beacons.push({ mesh: beacon, phase: rand(0, Math.PI * 2) });
  }
}

// Collidable cover: monoliths, big crystals and wall chunks. Tanks and bolts
// treat each as a circle on the ground plane.
function buildObstacles() {
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x1d1838, flatShading: true, roughness: 0.85, metalness: 0.2 });

  const placed = [];
  const tryPlace = (minR, maxR) => {
    for (let attempt = 0; attempt < 40; attempt++) {
      const a = rand(0, Math.PI * 2);
      const r = rand(minR, maxR);
      // keep the spawn ring (radius ~40) clear
      if (Math.abs(r - 40) < 5) continue;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (placed.every((p) => Math.hypot(p.x - x, p.z - z) > 14)) {
        placed.push({ x, z });
        return { x, z };
      }
    }
    return null;
  };

  // Monoliths
  for (let i = 0; i < 4; i++) {
    const p = tryPlace(10, ARENA_R - 8);
    if (!p) continue;
    const h = rand(4.5, 7);
    const m = new THREE.Mesh(new THREE.BoxGeometry(rand(2.6, 3.6), h, rand(2.6, 3.6)), darkMat);
    m.position.set(p.x, h / 2, p.z);
    m.rotation.y = rand(0, Math.PI);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(3.0, 0.08, 0.08), neonBasic(0x9a4dff, 1.5));
    trim.position.set(p.x, h - 0.4, p.z);
    trim.rotation.y = m.rotation.y;
    scene.add(trim);
    obstacles.push({ x: p.x, z: p.z, r: 2.7 });
  }

  // Big crystals
  for (let i = 0; i < 4; i++) {
    const p = tryPlace(12, ARENA_R - 8);
    if (!p) continue;
    const hex = Math.random() < 0.6 ? 0x19f0ff : 0xff2d8f;
    const mat = new THREE.MeshStandardMaterial({
      color: 0x0b2030, emissive: hex, emissiveIntensity: 0.9,
      flatShading: true, roughness: 0.4 });
    const c = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), mat);
    const s = rand(2.2, 3.2);
    c.scale.set(s, s * rand(1.3, 1.9), s);
    c.position.set(p.x, s * 1.1, p.z);
    c.rotation.y = rand(0, Math.PI);
    c.castShadow = true;
    scene.add(c);
    crystals.push({ mat, phase: rand(0, Math.PI * 2) });
    obstacles.push({ x: p.x, z: p.z, r: s * 0.95 });
  }

  // Ruined wall chunks
  for (let i = 0; i < 3; i++) {
    const p = tryPlace(14, ARENA_R - 10);
    if (!p) continue;
    const m = new THREE.Mesh(new THREE.BoxGeometry(7, rand(2.6, 3.4), 1.3), darkMat);
    m.position.set(p.x, 1.5, p.z);
    m.rotation.y = rand(0, Math.PI);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    obstacles.push({ x: p.x, z: p.z, r: 3.6 });
  }

  // Small decorative crystal clusters (non-collidable)
  const smallGeos = [new THREE.ConeGeometry(0.5, 1.6, 5), new THREE.IcosahedronGeometry(0.55, 0)];
  for (let i = 0; i < 10; i++) {
    const a = rand(0, Math.PI * 2);
    const r = rand(16, ARENA_R - 4);
    const hex = Math.random() < 0.6 ? 0x19f0ff : 0xff2d8f;
    const mat = new THREE.MeshStandardMaterial({
      color: 0x0b2030, emissive: hex, emissiveIntensity: 1.1,
      flatShading: true, roughness: 0.4 });
    const g = new THREE.Group();
    for (let j = 0; j < randInt(2, 3); j++) {
      const c = new THREE.Mesh(smallGeos[randInt(0, 1)], mat);
      const s = rand(0.4, 1.0);
      c.scale.setScalar(s);
      c.position.set(rand(-1, 1), s * 0.7, rand(-1, 1));
      c.rotation.set(rand(-0.3, 0.3), rand(0, Math.PI), rand(-0.3, 0.3));
      g.add(c);
    }
    g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    scene.add(g);
    crystals.push({ mat, phase: rand(0, Math.PI * 2) });
  }
}

// The storm: translucent magenta wall + floor ring, scaled to the zone radius.
function buildZone() {
  zoneWall = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 26, 72, 1, true),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xff2d8f).multiplyScalar(0.9),
      transparent: true, opacity: 0.13, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  zoneWall.position.y = 13;
  scene.add(zoneWall);

  zoneRing = new THREE.Mesh(
    new THREE.RingGeometry(0.975, 1, 96),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xff2d8f).multiplyScalar(1.6),
      transparent: true, opacity: 0.6, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false }));
  zoneRing.rotation.x = -Math.PI / 2;
  zoneRing.position.y = 0.08;
  scene.add(zoneRing);
}

export function setZoneVisual(r, shrinking, time) {
  zoneWall.scale.set(r, 1, r);
  zoneRing.scale.set(r, r, 1);
  const pulse = shrinking ? 0.5 + Math.sin(time * 6) * 0.25 : 0.13;
  zoneWall.material.opacity = shrinking ? 0.10 + Math.sin(time * 6) * 0.05 : 0.13;
  zoneRing.material.opacity = shrinking ? pulse + 0.3 : 0.55;
}

export function updateEnvironment(time) {
  sunMat.uniforms.uTime.value = time;
  for (const b of beacons) {
    const k = (Math.sin(time * 2.6 + b.phase) + 1) / 2;
    b.mesh.scale.setScalar(0.55 + k * 0.7);
  }
  for (const c of crystals) {
    c.mat.emissiveIntensity = 0.85 + Math.sin(time * 1.7 + c.phase) * 0.4;
  }
}
