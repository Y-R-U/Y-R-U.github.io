// Renderer, camera, lights and the sky. One place decides how expensive the
// frame is allowed to be, so a phone and a desktop run the same code path with
// different numbers.

import * as THREE from 'three';
import { LITE_MODE, IS_TOUCH, CAM } from './config.js';
import { profile } from './save.js';
import { clamp, lerp } from './utils.js';

export let renderer = null;
export let scene = null;
export let camera = null;
export let sunLight = null;
export let hemiLight = null;
export let ambient = null;

export const quality = { shadows: true, pixelRatio: 1.5, scenery: 1, particles: 1 };

let skyMesh = null;
let sunSprite = null;
let starField = null;
let container = null;

// ---------------------------------------------------------------------------
// Environments — each track picks one. `grade` values are also read by the HUD
// so the broadcast overlay matches the light.
// ---------------------------------------------------------------------------
export const ENVIRONMENTS = {
  noon: {
    name: 'HIGH NOON', top: 0x3f8fd6, bottom: 0xbfe0f2, fog: 0xb9d8ea, fogNear: 220, fogFar: 900,
    sun: 0xfff4dc, sunPos: [0.35, 0.86, 0.36], sunI: 2.5, hemi: [0xcfe6ff, 0x6b6353, 0.85], amb: 0.34,
    ground: 0x6d7f4e, stars: 0, grade: '#0d1116',
  },
  dusk: {
    name: 'GOLDEN HOUR', top: 0x27306b, bottom: 0xff9d55, fog: 0xd88a56, fogNear: 160, fogFar: 760,
    sun: 0xffb15c, sunPos: [-0.72, 0.26, -0.5], sunI: 2.3, hemi: [0xffb787, 0x3a2a1e, 0.75], amb: 0.32,
    ground: 0x6a5a3b, stars: 0.2, grade: '#1a0f14',
  },
  night: {
    name: 'FLOODLIT NIGHT', top: 0x05060f, bottom: 0x141c33, fog: 0x0b1020, fogNear: 100, fogFar: 560,
    sun: 0x8fa8ff, sunPos: [0.2, 0.8, -0.5], sunI: 1.15, hemi: [0x3d4f80, 0x14161f, 0.95], amb: 0.66,
    ground: 0x22262e, stars: 1, grade: '#04060c', neon: true,
  },
  storm: {
    name: 'THUNDERHEAD', top: 0x2b3038, bottom: 0x5c6570, fog: 0x545e69, fogNear: 90, fogFar: 480,
    sun: 0xc8d4e2, sunPos: [-0.3, 0.62, 0.4], sunI: 1.35, hemi: [0x8d98a6, 0x3a3e46, 0.95], amb: 0.5,
    ground: 0x4a5344, stars: 0, grade: '#0a0d12', rain: true,
  },
  dawn: {
    name: 'COLD DAWN', top: 0x2c4a7a, bottom: 0xf0c9b0, fog: 0xcbb6ae, fogNear: 150, fogFar: 700,
    sun: 0xffd9c0, sunPos: [0.6, 0.46, 0.5], sunI: 2.0, hemi: [0xd8e4ff, 0x5b5348, 0.85], amb: 0.44,
    ground: 0x7d8a63, stars: 0.12, grade: '#0e1219',
  },
  neon: {
    name: 'NEON STRIP', top: 0x120726, bottom: 0x3a1152, fog: 0x2a0e40, fogNear: 90, fogFar: 520,
    sun: 0xff77dd, sunPos: [-0.4, 0.7, 0.3], sunI: 1.3, hemi: [0x8c56dc, 0x201038, 0.95], amb: 0.7,
    ground: 0x1e1430, stars: 0.7, grade: '#0a0418', neon: true,
  },
  dust: {
    name: 'DUST BOWL', top: 0x8a6a3e, bottom: 0xe0b877, fog: 0xd2ab74, fogNear: 70, fogFar: 380,
    sun: 0xffdda0, sunPos: [0.5, 0.55, -0.3], sunI: 2.0, hemi: [0xe8cb9a, 0x6b5533, 0.9], amb: 0.42,
    ground: 0x9a7c4c, stars: 0, grade: '#150f08', haze: true,
  },
};

export function decideQuality() {
  const setting = profile.settings.quality;
  const cores = navigator.hardwareConcurrency || 4;
  const auto = !IS_TOUCH && cores >= 8 ? 'high' : 'low';
  const q = setting === 'auto' ? auto : setting;
  const low = LITE_MODE || q === 'low';
  quality.shadows = !low;
  quality.pixelRatio = low ? Math.min(devicePixelRatio, 1.35) : Math.min(devicePixelRatio, 2);
  quality.scenery = low ? 0.55 : 1;
  quality.particles = low ? 0.5 : 1;
  return quality;
}

export function initRenderer(mount) {
  container = mount;
  decideQuality();

  renderer = new THREE.WebGLRenderer({
    antialias: !LITE_MODE,
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.setPixelRatio(quality.pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;
  if (quality.shadows) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  mount.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xb9d8ea, 200, 900);

  camera = new THREE.PerspectiveCamera(CAM.fov, window.innerWidth / window.innerHeight, 0.4, 4000);
  camera.position.set(0, 12, 30);

  ambient = new THREE.AmbientLight(0xffffff, 0.35);
  scene.add(ambient);

  hemiLight = new THREE.HemisphereLight(0xcfe6ff, 0x6b6353, 0.85);
  scene.add(hemiLight);

  sunLight = new THREE.DirectionalLight(0xfff4dc, 2.4);
  sunLight.position.set(120, 260, 120);
  if (quality.shadows) {
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(1024, 1024);
    const d = 120;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.camera.near = 20;
    sunLight.shadow.camera.far = 620;
    sunLight.shadow.bias = -0.0016;
    sunLight.shadow.normalBias = 0.9;
  }
  scene.add(sunLight);
  scene.add(sunLight.target);

  buildSky();
  window.addEventListener('resize', onResize, { passive: true });
  onResize();
  return renderer;
}

function onResize() {
  if (!renderer) return;
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  // Portrait phones need a wider vertical view or the road vanishes.
  camera.fov = h > w ? CAM.fov + 12 : CAM.fov;
  camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------------------
// Sky dome: a two-colour gradient shader on an inverted sphere. Cheap, and the
// colours are the whole mood of a track.
// ---------------------------------------------------------------------------
const SKY_VERT = `
varying vec3 vWorld;
void main() {
  vWorld = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAG = `
uniform vec3 topColor;
uniform vec3 bottomColor;
uniform float offset;
uniform float expo;
varying vec3 vWorld;
void main() {
  float h = normalize(vWorld + vec3(0.0, offset, 0.0)).y;
  float t = pow(max(h, 0.0), expo);
  gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
}`;

function buildSky() {
  const geo = new THREE.SphereGeometry(1800, 24, 14);
  const mat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    uniforms: {
      topColor: { value: new THREE.Color(0x3f8fd6) },
      bottomColor: { value: new THREE.Color(0xbfe0f2) },
      offset: { value: 120 },
      expo: { value: 0.62 },
    },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  skyMesh = new THREE.Mesh(geo, mat);
  skyMesh.renderOrder = -10;
  skyMesh.frustumCulled = false;
  scene.add(skyMesh);

  // Sun/moon disc, parked on the light direction.
  const sunMat = new THREE.SpriteMaterial({
    map: discTexture(),
    color: 0xfff2cf,
    transparent: true,
    depthWrite: false,
    fog: false,
    blending: THREE.AdditiveBlending,
  });
  sunSprite = new THREE.Sprite(sunMat);
  sunSprite.scale.set(190, 190, 1);
  sunSprite.renderOrder = -9;
  scene.add(sunSprite);

  // Stars — one buffer, faded in per environment.
  const N = 700;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const u = Math.random() * Math.PI * 2;
    const v = Math.random() * 0.85 + 0.06;
    const r = 1500;
    pos[i * 3] = Math.cos(u) * Math.sin(v * Math.PI) * r;
    pos[i * 3 + 1] = Math.abs(Math.cos(v * Math.PI)) * r * 0.9 + 60;
    pos[i * 3 + 2] = Math.sin(u) * Math.sin(v * Math.PI) * r;
  }
  const sgeo = new THREE.BufferGeometry();
  sgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  starField = new THREE.Points(sgeo, new THREE.PointsMaterial({
    color: 0xffffff, size: 6, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, fog: false,
  }));
  starField.renderOrder = -9;
  starField.frustumCulled = false;
  scene.add(starField);
}

function discTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,244,214,0.85)');
  grad.addColorStop(1, 'rgba(255,214,150,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export let activeEnv = ENVIRONMENTS.noon;

export function setEnvironment(id) {
  const env = ENVIRONMENTS[id] || ENVIRONMENTS.noon;
  activeEnv = env;

  skyMesh.material.uniforms.topColor.value.setHex(env.top);
  skyMesh.material.uniforms.bottomColor.value.setHex(env.bottom);

  scene.fog.color.setHex(env.fog);
  scene.fog.near = env.fogNear;
  scene.fog.far = env.fogFar;

  sunLight.color.setHex(env.sun);
  sunLight.intensity = env.sunI;
  const p = env.sunPos;
  sunLight.position.set(p[0] * 320, p[1] * 320, p[2] * 320);

  hemiLight.color.setHex(env.hemi[0]);
  hemiLight.groundColor.setHex(env.hemi[1]);
  hemiLight.intensity = env.hemi[2];
  ambient.intensity = env.amb;

  sunSprite.position.set(p[0] * 1500, p[1] * 1500, p[2] * 1500);
  sunSprite.material.color.setHex(env.sun);
  sunSprite.material.opacity = env.stars > 0.6 ? 0.35 : 0.9;
  starField.material.opacity = env.stars;

  document.documentElement.style.setProperty('--grade', env.grade);
  return env;
}

// The shadow camera follows the player so a 3km circuit still gets crisp
// shadows out of a 1k map.
export function trackShadow(target) {
  if (!quality.shadows || !sunLight.castShadow) return;
  const p = activeEnv.sunPos;
  sunLight.position.set(target.x + p[0] * 220, target.y + p[1] * 220, target.z + p[2] * 220);
  sunLight.target.position.copy(target);
  sunLight.target.updateMatrixWorld();
}

export function render() {
  if (!renderer) return;
  skyMesh.position.copy(camera.position);
  starField.position.copy(camera.position);
  sunSprite.position.copy(camera.position).add(
    new THREE.Vector3(activeEnv.sunPos[0], activeEnv.sunPos[1], activeEnv.sunPos[2]).multiplyScalar(1500)
  );
  renderer.render(scene, camera);
}

export function setFov(f) {
  const base = window.innerHeight > window.innerWidth ? CAM.fov + 12 : CAM.fov;
  const want = clamp(f, base - 6, base + 26);
  if (Math.abs(camera.fov - want) > 0.01) {
    camera.fov = want;
    camera.updateProjectionMatrix();
  }
}

export function baseFov() {
  return window.innerHeight > window.innerWidth ? CAM.fov + 12 : CAM.fov;
}

// Shared materials cache — hundreds of scenery pieces should not each compile
// their own program.
const matCache = new Map();
export function mat(hex, opts = {}) {
  const key = hex + '|' + JSON.stringify(opts);
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshLambertMaterial({ color: hex, ...opts });
  matCache.set(key, m);
  return m;
}

export function matPhong(hex, opts = {}) {
  const key = 'p' + hex + '|' + JSON.stringify(opts);
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshPhongMaterial({ color: hex, shininess: 40, ...opts });
  matCache.set(key, m);
  return m;
}

export function disposeGroup(g) {
  if (!g) return;
  g.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material && o.material.__owned) {
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
      else o.material.dispose();
    }
  });
  if (g.parent) g.parent.remove(g);
}

export const lerpColor = (c, hex, t) => c.lerp(new THREE.Color(hex), t);
export { lerp };
