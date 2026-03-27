// ─── Scene: Three.js setup, camera, lighting, materials ───

import * as THREE from 'three';
import { ARENA } from './config.js';

export let scene, camera, renderer, clock;
export let particleSystem;

let shakeAmount = 0;
let shakeDecay = 0.9;
let cameraBasePos = new THREE.Vector3();
const particles = [];

export function initScene() {
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0a2e, 0.015);

  // Camera — isometric-ish perspective
  const aspect = window.innerWidth / window.innerHeight;
  camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
  camera.position.set(0, 4, 16);
  camera.lookAt(0, 0, 0);
  cameraBasePos.copy(camera.position);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.setClearColor(0x0a0a2e);

  const container = document.getElementById('game-container');
  container.appendChild(renderer.domElement);

  // Lighting
  const ambient = new THREE.AmbientLight(0x404070, 0.6);
  scene.add(ambient);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
  dirLight.position.set(5, 10, 7);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(1024, 1024);
  dirLight.shadow.camera.near = 1;
  dirLight.shadow.camera.far = 30;
  dirLight.shadow.camera.left = -8;
  dirLight.shadow.camera.right = 8;
  dirLight.shadow.camera.top = 10;
  dirLight.shadow.camera.bottom = -10;
  scene.add(dirLight);

  const rimLight = new THREE.DirectionalLight(0x6644ff, 0.3);
  rimLight.position.set(-5, 3, -5);
  scene.add(rimLight);

  // Floor
  createFloor();

  // Background gradient mesh
  createBackground();

  // Danger line
  createDangerLine();

  clock = new THREE.Clock();

  window.addEventListener('resize', onResize);
}

function createFloor() {
  const geo = new THREE.PlaneGeometry(ARENA.width + 2, ARENA.depth + 2, 20, 20);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x1a1a3a,
    metalness: 0.7,
    roughness: 0.4,
    wireframe: false,
  });
  const floor = new THREE.Mesh(geo, mat);
  // Rotate flat, then tilt slightly
  floor.rotation.x = -Math.PI / 2 + ARENA.floorAngle;
  floor.position.y = -ARENA.height / 2 + 0.5;
  floor.receiveShadow = true;
  scene.add(floor);

  // Grid overlay
  const gridGeo = new THREE.PlaneGeometry(ARENA.width + 2, ARENA.depth + 2, 10, 10);
  const gridMat = new THREE.MeshBasicMaterial({
    color: 0x2a2a5a,
    wireframe: true,
    transparent: true,
    opacity: 0.15,
  });
  const grid = new THREE.Mesh(gridGeo, gridMat);
  grid.rotation.x = -Math.PI / 2 + ARENA.floorAngle;
  grid.position.y = -ARENA.height / 2 + 0.51;
  scene.add(grid);

  // Back wall (subtle)
  const wallGeo = new THREE.PlaneGeometry(ARENA.width + 2, ARENA.height);
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x0d0d2a,
    transparent: true,
    opacity: 0.3,
  });
  const wall = new THREE.Mesh(wallGeo, wallMat);
  wall.position.set(0, 0, -ARENA.depth / 2);
  scene.add(wall);
}

function createBackground() {
  // Simple large background plane
  const geo = new THREE.PlaneGeometry(60, 60);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x050520,
    side: THREE.DoubleSide,
  });
  const bg = new THREE.Mesh(geo, mat);
  bg.position.z = -15;
  scene.add(bg);
}

function createDangerLine() {
  const points = [
    new THREE.Vector3(-ARENA.width / 2 - 0.5, ARENA.dangerY, 0),
    new THREE.Vector3(ARENA.width / 2 + 0.5, ARENA.dangerY, 0),
  ];
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({
    color: 0xff2222,
    transparent: true,
    opacity: 0.5,
  });
  const line = new THREE.Line(geo, mat);
  scene.add(line);
}

function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

// ─── Screen Shake ───
export function screenShake(intensity = 0.15) {
  shakeAmount = Math.max(shakeAmount, intensity);
}

export function updateShake() {
  if (shakeAmount > 0.001) {
    camera.position.x = cameraBasePos.x + (Math.random() - 0.5) * shakeAmount;
    camera.position.y = cameraBasePos.y + (Math.random() - 0.5) * shakeAmount;
    shakeAmount *= shakeDecay;
  } else {
    camera.position.copy(cameraBasePos);
    shakeAmount = 0;
  }
}

// ─── Particles ───
const MAX_PARTICLES = 300;
const particleGeo = new THREE.BufferGeometry();
const positions = new Float32Array(MAX_PARTICLES * 3);
const colors = new Float32Array(MAX_PARTICLES * 3);
const sizes = new Float32Array(MAX_PARTICLES);

export function initParticles() {
  particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particleGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  particleGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const mat = new THREE.PointsMaterial({
    size: 0.15,
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    sizeAttenuation: true,
    depthWrite: false,
  });
  particleSystem = new THREE.Points(particleGeo, mat);
  scene.add(particleSystem);
}

export function spawnParticles(pos, color, count = 12) {
  const c = new THREE.Color(color);
  for (let i = 0; i < count; i++) {
    particles.push({
      x: pos.x, y: pos.y, z: pos.z,
      vx: (Math.random() - 0.5) * 4,
      vy: Math.random() * 3 + 1,
      vz: (Math.random() - 0.5) * 4,
      r: c.r, g: c.g, b: c.b,
      life: 0.6 + Math.random() * 0.4,
      age: 0,
    });
    if (particles.length > MAX_PARTICLES) particles.shift();
  }
}

export function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.age += dt;
    if (p.age >= p.life) {
      particles.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    p.vy -= 6 * dt; // gravity
  }

  for (let i = 0; i < MAX_PARTICLES; i++) {
    if (i < particles.length) {
      const p = particles[i];
      const fade = 1 - p.age / p.life;
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
      colors[i * 3] = p.r * fade;
      colors[i * 3 + 1] = p.g * fade;
      colors[i * 3 + 2] = p.b * fade;
      sizes[i] = 0.15 * fade;
    } else {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = -100;
      positions[i * 3 + 2] = 0;
      sizes[i] = 0;
    }
  }
  particleGeo.attributes.position.needsUpdate = true;
  particleGeo.attributes.color.needsUpdate = true;
  particleGeo.attributes.size.needsUpdate = true;
}

// ─── Project 3D → Screen ───
export function toScreen(pos3d) {
  const v = new THREE.Vector3(pos3d.x, pos3d.y, pos3d.z);
  v.project(camera);
  return {
    x: (v.x * 0.5 + 0.5) * window.innerWidth,
    y: (-v.y * 0.5 + 0.5) * window.innerHeight,
  };
}

export function renderScene() {
  renderer.render(scene, camera);
}
