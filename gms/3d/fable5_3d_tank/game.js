// Fable 5 — Drone Storm
// Low-poly synthwave hover-tank vs. laser-eyed drone swarm.
// Three.js r160 (ES modules via importmap), no build step.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const ARENA_R = 50;            // playable radius for the tank
const TANK_MAX_SPEED = 14;
const TANK_ACCEL = 52;
const TANK_DAMP = 4.2;
const BOLT_SPEED = 95;
const FIRE_COOLDOWN = 0.16;
const SHIELD_MAX = 100;
const SHIELD_REGEN_DELAY = 5;
const SHIELD_REGEN_RATE = 9;
const HI_KEY = 'f5dt_hi';
const MUTE_KEY = 'f5dt_mute';

const SHOT_MODE = new URLSearchParams(location.search).has('shot');
const IS_TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
// frame-rate independent smoothing factor
const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

function angLerp(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * t;
}

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// Audio — procedural Web Audio, no asset files
// ---------------------------------------------------------------------------

const AudioFX = {
  ctx: null,
  master: null,
  noiseBuf: null,
  muted: localStorage.getItem(MUTE_KEY) === '1',

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);

    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    this.startAmbient();
  },

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },

  setMuted(m) {
    this.muted = m;
    localStorage.setItem(MUTE_KEY, m ? '1' : '0');
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  },

  env(gainNode, peak, dur, t0) {
    gainNode.gain.setValueAtTime(0.0001, t0);
    gainNode.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  },

  startAmbient() {
    const t0 = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.gain.value = 0.045;
    g.connect(this.master);
    [55, 82.5].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.07 + i * 0.05;
      const lfoG = this.ctx.createGain();
      lfoG.gain.value = 2.2;
      lfo.connect(lfoG).connect(o.detune);
      o.connect(g);
      o.start(t0);
      lfo.start(t0);
    });
  },

  pew() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    [0, 7].forEach((det) => {
      const o = this.ctx.createOscillator();
      o.type = 'square';
      o.detune.value = det;
      o.frequency.setValueAtTime(920, t0);
      o.frequency.exponentialRampToValueAtTime(170, t0 + 0.13);
      const g = this.ctx.createGain();
      this.env(g, 0.09, 0.14, t0);
      o.connect(g).connect(this.master);
      o.start(t0);
      o.stop(t0 + 0.16);
    });
  },

  enemyPew() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(310, t0);
    o.frequency.exponentialRampToValueAtTime(85, t0 + 0.22);
    const g = this.ctx.createGain();
    this.env(g, 0.12, 0.24, t0);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + 0.26);
  },

  boom(big) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const dur = big ? 0.9 : 0.5;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(big ? 1400 : 900, t0);
    f.frequency.exponentialRampToValueAtTime(60, t0 + dur);
    const g = this.ctx.createGain();
    this.env(g, big ? 0.55 : 0.32, dur, t0);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);

    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(big ? 130 : 110, t0);
    o.frequency.exponentialRampToValueAtTime(35, t0 + dur * 0.8);
    const og = this.ctx.createGain();
    this.env(og, big ? 0.5 : 0.3, dur * 0.8, t0);
    o.connect(og).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur);
  },

  hit() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 900;
    const g = this.ctx.createGain();
    this.env(g, 0.22, 0.09, t0);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + 0.1);

    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 64;
    const og = this.ctx.createGain();
    this.env(og, 0.3, 0.13, t0);
    o.connect(og).connect(this.master);
    o.start(t0);
    o.stop(t0 + 0.15);
  },

  horn() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    [0, 9].forEach((det) => {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.detune.value = det;
      o.frequency.setValueAtTime(150, t0);
      o.frequency.linearRampToValueAtTime(300, t0 + 0.45);
      const g = this.ctx.createGain();
      this.env(g, 0.1, 0.6, t0);
      o.connect(g).connect(this.master);
      o.start(t0);
      o.stop(t0 + 0.65);
    });
  },
};

// ---------------------------------------------------------------------------
// Renderer / scene / camera / post-processing
// ---------------------------------------------------------------------------

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('game-container').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0618);
scene.fog = new THREE.Fog(0x1b0f3a, 55, 270);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
camera.position.set(0, 10, 16);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight), 0.85, 0.5, 0.62);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// Lights
scene.add(new THREE.HemisphereLight(0x6a4cff, 0x140a2a, 0.9));

const moonLight = new THREE.DirectionalLight(0xff7ad9, 1.05);
moonLight.position.set(45, 75, 35);
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(1024, 1024);
moonLight.shadow.camera.left = -70;
moonLight.shadow.camera.right = 70;
moonLight.shadow.camera.top = 70;
moonLight.shadow.camera.bottom = -70;
moonLight.shadow.camera.near = 10;
moonLight.shadow.camera.far = 220;
moonLight.shadow.bias = -0.0006;
scene.add(moonLight);
scene.add(moonLight.target);

// ---------------------------------------------------------------------------
// Environment — synthwave night arena
// ---------------------------------------------------------------------------

const envAnims = { beacons: [], crystals: [] };
let sunMat = null;
let arenaRing = null;

function neonBasic(hex, boost = 1.6) {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(boost) });
}

function buildEnvironment() {
  // Ground disc
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(280, 48),
    new THREE.MeshStandardMaterial({ color: 0x0e0a22, roughness: 1, metalness: 0 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Neon grid
  const grid = new THREE.GridHelper(240, 60, 0x9a4dff, 0x35206b);
  grid.material.transparent = true;
  grid.material.opacity = 0.55;
  grid.position.y = 0.02;
  scene.add(grid);

  // Arena boundary ring
  arenaRing = new THREE.Mesh(
    new THREE.TorusGeometry(ARENA_R, 0.13, 6, 80),
    neonBasic(0x4df3ff, 1.4));
  arenaRing.rotation.x = Math.PI / 2;
  arenaRing.position.y = 0.06;
  scene.add(arenaRing);

  // Mountain silhouette ring
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
    const y = rand(30, 380);
    starPos[i * 3] = Math.cos(a) * r;
    starPos[i * 3 + 1] = y;
    starPos[i * 3 + 2] = Math.sin(a) * r;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xcfe0ff, size: 2.0, sizeAttenuation: false,
    transparent: true, opacity: 0.85, fog: false, depthWrite: false })));

  // Glowing crystal clusters
  const crystalGeos = [
    new THREE.ConeGeometry(0.5, 1.6, 5),
    new THREE.IcosahedronGeometry(0.55, 0),
  ];
  for (let i = 0; i < 16; i++) {
    const a = rand(0, Math.PI * 2);
    const r = rand(16, ARENA_R - 4);
    const hex = Math.random() < 0.6 ? 0x19f0ff : 0xff2d8f;
    const mat = new THREE.MeshStandardMaterial({
      color: 0x0b2030, emissive: hex, emissiveIntensity: 1.1,
      flatShading: true, roughness: 0.4 });
    const cluster = new THREE.Group();
    const n = randInt(2, 4);
    for (let j = 0; j < n; j++) {
      const c = new THREE.Mesh(crystalGeos[randInt(0, 1)], mat);
      const s = rand(0.5, 1.5);
      c.scale.setScalar(s);
      c.position.set(rand(-1, 1), s * 0.7, rand(-1, 1));
      c.rotation.set(rand(-0.3, 0.3), rand(0, Math.PI), rand(-0.3, 0.3));
      c.castShadow = true;
      cluster.add(c);
    }
    cluster.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    scene.add(cluster);
    envAnims.crystals.push({ mat, phase: rand(0, Math.PI * 2) });
  }

  // Antenna towers with blinking beacons
  const towerMat = new THREE.MeshStandardMaterial({
    color: 0x171430, flatShading: true, roughness: 0.8 });
  for (let i = 0; i < 5; i++) {
    const a = rand(0, Math.PI * 2);
    const r = rand(32, ARENA_R - 3);
    const h = rand(10, 17);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(0.7, h, 0.7), towerMat);
    tower.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
    tower.castShadow = true;
    scene.add(tower);
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 8, 6), neonBasic(0xff2244, 1.8));
    beacon.position.set(tower.position.x, h + 0.3, tower.position.z);
    scene.add(beacon);
    envAnims.beacons.push({ mesh: beacon, phase: rand(0, Math.PI * 2) });
  }
}

// ---------------------------------------------------------------------------
// Player tank
// ---------------------------------------------------------------------------

const tank = {
  grp: null, leanG: null, turretG: null, barrelG: null,
  muzzles: [], muzzleFlash: [], padMats: [],
  vel: new THREE.Vector3(),
  yaw: 0, turretYaw: 0, barrelPitch: 0.2,
  shield: SHIELD_MAX, lastHitT: -99,
  fireTimer: 0, barrelSide: 0,
};

function buildTank() {
  const grp = new THREE.Group();
  const leanG = new THREE.Group();
  grp.add(leanG);

  const hullMat = new THREE.MeshStandardMaterial({
    color: 0x39406b, emissive: 0x0c0a22, emissiveIntensity: 1,
    flatShading: true, roughness: 0.45, metalness: 0.55 });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x161a2e, flatShading: true, roughness: 0.7, metalness: 0.3 });
  const trimMat = neonBasic(0x4df3ff, 1.5);

  // Hull (tank faces -z: barrel points -z at rest)
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.62, 3.5), hullMat);
  hull.position.y = 0.62;
  hull.castShadow = true;
  leanG.add(hull);

  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.34, 2.5), hullMat);
  deck.position.y = 1.1;
  deck.castShadow = true;
  leanG.add(deck);

  // Angled front glacis
  const glacis = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 1.0), hullMat);
  glacis.position.set(0, 0.78, -1.95);
  glacis.rotation.x = 0.5;
  glacis.castShadow = true;
  leanG.add(glacis);

  // Side skirts + neon trim
  [-1, 1].forEach((side) => {
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 3.3), darkMat);
    skirt.position.set(side * 1.42, 0.5, 0);
    skirt.castShadow = true;
    leanG.add(skirt);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 3.0), trimMat);
    trim.position.set(side * 1.62, 0.52, 0);
    leanG.add(trim);
  });

  // Hover pads (glowing discs under the corners)
  const padGeo = new THREE.CylinderGeometry(0.42, 0.52, 0.14, 8);
  for (const [px, pz] of [[-0.95, -1.25], [0.95, -1.25], [-0.95, 1.25], [0.95, 1.25]]) {
    const padMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0x4df3ff).multiplyScalar(1.5),
      transparent: true, opacity: 0.9 });
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.set(px, 0.18, pz);
    leanG.add(pad);
    tank.padMats.push(padMat);
  }

  // Cyan underglow
  const glow = new THREE.PointLight(0x2ad8ff, 4, 7);
  glow.position.y = 0.25;
  leanG.add(glow);

  // Turret
  const turretG = new THREE.Group();
  turretG.position.y = 1.42;
  leanG.add(turretG);

  const turretBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.82, 0.95, 0.34, 8), hullMat);
  turretBase.castShadow = true;
  turretG.add(turretBase);

  const turretHead = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.52, 1.5), hullMat);
  turretHead.position.y = 0.4;
  turretHead.castShadow = true;
  turretG.add(turretHead);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.14, 0.06), trimMat);
  visor.position.set(0, 0.46, -0.76);
  turretG.add(visor);

  // Barrel pivot — twin laser rails
  const barrelG = new THREE.Group();
  barrelG.position.set(0, 0.42, -0.55);
  turretG.add(barrelG);

  const railGeo = new THREE.CylinderGeometry(0.075, 0.075, 2.3, 6);
  const tipGeo = new THREE.SphereGeometry(0.13, 8, 6);
  [-0.2, 0.2].forEach((x) => {
    const rail = new THREE.Mesh(railGeo, darkMat);
    rail.rotation.x = Math.PI / 2;
    rail.position.set(x, 0, -1.15);
    rail.castShadow = true;
    barrelG.add(rail);
    const tip = new THREE.Mesh(tipGeo, neonBasic(0x9df8ff, 2.2));
    tip.position.set(x, 0, -2.3);
    tip.scale.setScalar(0.001);
    barrelG.add(tip);
    tank.muzzleFlash.push(tip);
    const muzzle = new THREE.Object3D();
    muzzle.position.set(x, 0, -2.35);
    barrelG.add(muzzle);
    tank.muzzles.push(muzzle);
  });

  // Antenna
  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 1.1, 4), darkMat);
  antenna.position.set(0.5, 0.95, 0.55);
  turretG.add(antenna);
  const antennaTip = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 6, 4), neonBasic(0xff2d8f, 1.8));
  antennaTip.position.set(0.5, 1.5, 0.55);
  turretG.add(antennaTip);

  tank.grp = grp;
  tank.leanG = leanG;
  tank.turretG = turretG;
  tank.barrelG = barrelG;
  scene.add(grp);
}

// ---------------------------------------------------------------------------
// Drones
// ---------------------------------------------------------------------------

const DRONE_TYPES = {
  scout:   { size: 1.0,  hp: 1, speed: 9,  hitR: 1.3, score: 10, dmg: 16,
             fireBase: 4.6, eye: 0xff2030, orbitH: [13, 22] },
  striker: { size: 1.35, hp: 2, speed: 11, hitR: 1.7, score: 25, dmg: 20,
             fireBase: 3.8, eye: 0xff2d9f, orbitH: [10, 17] },
  goliath: { size: 2.3,  hp: 5, speed: 4.5, hitR: 2.9, score: 60, dmg: 26,
             fireBase: 5.2, eye: 0xff7a18, orbitH: [20, 28] },
};

const droneShared = {
  hull: new THREE.IcosahedronGeometry(1, 0),
  hullMat: new THREE.MeshStandardMaterial({
    color: 0x2a3050, emissive: 0x180c30, emissiveIntensity: 1,
    flatShading: true, roughness: 0.5, metalness: 0.6 }),
  navGeo: new THREE.SphereGeometry(0.09, 6, 4),
  navRed: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2030).multiplyScalar(1.8) }),
  navGreen: new THREE.MeshBasicMaterial({ color: new THREE.Color(0x2dff7a).multiplyScalar(1.8) }),
  fin: new THREE.BoxGeometry(0.1, 0.55, 0.75),
  arm: new THREE.BoxGeometry(1.5, 0.1, 0.17),
  armMat: new THREE.MeshStandardMaterial({
    color: 0x12141f, flatShading: true, roughness: 0.7, metalness: 0.4 }),
  rotor: new THREE.CylinderGeometry(0.52, 0.52, 0.05, 7),
  rotorMat: new THREE.MeshBasicMaterial({ color: 0x10131c, transparent: true, opacity: 0.72 }),
  eye: new THREE.SphereGeometry(1, 10, 8),
};

let drones = [];

function makeDrone(type, docile = false) {
  const def = DRONE_TYPES[type];
  const s = def.size;
  const grp = new THREE.Group();
  grp.rotation.order = 'YXZ';

  const body = new THREE.Mesh(droneShared.hull, droneShared.hullMat);
  body.scale.set(s, s * 0.55, s * 1.05);
  body.castShadow = true;
  grp.add(body);

  const fin = new THREE.Mesh(droneShared.fin, droneShared.armMat);
  fin.scale.setScalar(s);
  fin.position.set(0, s * 0.42, s * 0.45);
  grp.add(fin);

  const rotors = [];
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const arm = new THREE.Mesh(droneShared.arm, droneShared.armMat);
    arm.scale.setScalar(s);
    arm.position.set(dx * s * 0.78, 0, dz * s * 0.78);
    arm.rotation.y = Math.atan2(-dz, dx);
    grp.add(arm);
    const rotor = new THREE.Mesh(droneShared.rotor, droneShared.rotorMat);
    rotor.scale.setScalar(s);
    rotor.position.set(dx * s * 1.45, s * 0.12, dz * s * 1.45);
    grp.add(rotor);
    rotors.push(rotor);
    // aircraft-style running lights on the front arm tips
    if (dz < 0) {
      const nav = new THREE.Mesh(droneShared.navGeo,
        dx < 0 ? droneShared.navRed : droneShared.navGreen);
      nav.scale.setScalar(s);
      nav.position.set(dx * s * 1.45, s * 0.28, dz * s * 1.45);
      grp.add(nav);
    }
  }

  // The EYE — front-mounted, neon, the drone's signature
  const eyeBase = new THREE.Color(def.eye).multiplyScalar(1.9);
  const eyeMat = new THREE.MeshBasicMaterial({ color: eyeBase.clone() });
  const eye = new THREE.Mesh(droneShared.eye, eyeMat);
  eye.scale.setScalar(s * 0.4);
  eye.position.set(0, -s * 0.1, -s * 0.78);
  grp.add(eye);

  const haloMat = new THREE.MeshBasicMaterial({
    color: eyeBase.clone(), transparent: true, opacity: 0.22,
    blending: THREE.AdditiveBlending, depthWrite: false });
  const halo = new THREE.Mesh(droneShared.eye, haloMat);
  halo.scale.setScalar(s * 0.62);
  halo.position.copy(eye.position);
  grp.add(halo);

  const d = {
    grp, type, def, docile,
    hp: def.hp,
    hitR: def.hitR,
    vel: new THREE.Vector3(),
    state: 'orbit',          // orbit | charge | dive | climb
    heat: 0,                 // 0..1 eye charge glow
    eyeMat, haloMat, eye, halo, eyeBase,
    rotors,
    orbitR: rand(14, 34),
    orbitH: rand(def.orbitH[0], def.orbitH[1]),
    orbitA: rand(0, Math.PI * 2),
    orbitDir: Math.random() < 0.5 ? 1 : -1,
    phase: rand(0, Math.PI * 2),
    fireTimer: rand(1.5, def.fireBase),
    chargeT: 0,
    diveTimer: rand(4, 9),
    diveTarget: new THREE.Vector3(),
    burstLeft: 0, burstTimer: 0,
  };
  scene.add(grp);
  drones.push(d);
  return d;
}

function removeDrone(d) {
  scene.remove(d.grp);
  d.eyeMat.dispose();
  d.haloMat.dispose();
  const i = drones.indexOf(d);
  if (i >= 0) drones.splice(i, 1);
}

// ---------------------------------------------------------------------------
// Bolts (pooled)
// ---------------------------------------------------------------------------

function makeBoltPool(count, w, len, hex, boost) {
  const geo = new THREE.BoxGeometry(w, w, len);
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(boost) });
  const pool = [];
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    scene.add(mesh);
    pool.push({ mesh, vel: new THREE.Vector3(), life: 0, active: false, dmg: 0 });
  }
  return pool;
}

const playerBolts = makeBoltPool(36, 0.13, 1.7, 0x4df3ff, 2.2);
const enemyBolts = makeBoltPool(36, 0.18, 1.5, 0xff2050, 2.2);

const _tmpV = new THREE.Vector3();
const _tmpV2 = new THREE.Vector3();
const _tmpV3 = new THREE.Vector3();

function fireBolt(pool, origin, dir, speed, dmg) {
  const b = pool.find((x) => !x.active);
  if (!b) return null;
  b.active = true;
  b.mesh.visible = true;
  b.mesh.position.copy(origin);
  b.vel.copy(dir).multiplyScalar(speed);
  b.mesh.lookAt(_tmpV.copy(origin).add(dir));
  b.life = 2.2;
  b.dmg = dmg;
  return b;
}

function killBolt(b) {
  b.active = false;
  b.mesh.visible = false;
}

// ---------------------------------------------------------------------------
// Particles — debris, flashes, shock rings (pooled)
// ---------------------------------------------------------------------------

const debrisPool = [];
const debrisMats = [
  new THREE.MeshStandardMaterial({ color: 0x1c2034, flatShading: true, roughness: 0.7 }),
  neonBasic(0x4df3ff, 1.4),
  neonBasic(0xff5030, 1.6),
  neonBasic(0xffb347, 1.5),
];
{
  const geo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
  for (let i = 0; i < 70; i++) {
    const mesh = new THREE.Mesh(geo, debrisMats[i % debrisMats.length]);
    mesh.visible = false;
    scene.add(mesh);
    debrisPool.push({ mesh, vel: new THREE.Vector3(), rot: new THREE.Vector3(),
      life: 0, maxLife: 1, active: false });
  }
}

const flashPool = [];
{
  const geo = new THREE.SphereGeometry(1, 8, 6);
  for (let i = 0; i < 8; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xffd9a0).multiplyScalar(2.0),
      transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    scene.add(mesh);
    flashPool.push({ mesh, mat, life: 0, maxLife: 1, scale: 1, active: false });
  }
}

const ringPool = [];
{
  const geo = new THREE.RingGeometry(0.75, 1, 40);
  for (let i = 0; i < 8; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0x4df3ff).multiplyScalar(1.6),
      transparent: true, opacity: 0, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    scene.add(mesh);
    ringPool.push({ mesh, mat, life: 0, maxLife: 1, scale: 1, active: false });
  }
}

function spawnDebris(pos, n, spread) {
  for (let i = 0; i < n; i++) {
    const p = debrisPool.find((x) => !x.active);
    if (!p) return;
    p.active = true;
    p.mesh.visible = true;
    p.mesh.position.copy(pos);
    p.vel.set(rand(-1, 1), rand(0.2, 1.4), rand(-1, 1)).normalize()
      .multiplyScalar(rand(5, 14) * spread);
    p.rot.set(rand(-9, 9), rand(-9, 9), rand(-9, 9));
    p.maxLife = p.life = rand(0.7, 1.4);
    p.mesh.scale.setScalar(rand(0.5, 1.3) * spread);
  }
}

function spawnFlash(pos, scale, hex) {
  const f = flashPool.find((x) => !x.active);
  if (!f) return;
  f.active = true;
  f.mesh.visible = true;
  f.mesh.position.copy(pos);
  f.scale = scale;
  f.maxLife = f.life = 0.28;
  if (hex) f.mat.color.set(hex).multiplyScalar(2.0);
  else f.mat.color.set(0xffd9a0).multiplyScalar(2.0);
}

function spawnRing(pos, scale, hex) {
  const r = ringPool.find((x) => !x.active);
  if (!r) return;
  r.active = true;
  r.mesh.visible = true;
  r.mesh.position.copy(pos);
  r.mesh.position.y = Math.max(0.1, pos.y);
  r.scale = scale;
  r.maxLife = r.life = 0.55;
  r.mat.color.set(hex || 0x4df3ff).multiplyScalar(1.6);
}

function spawnExplosion(pos, scale, hex) {
  spawnFlash(pos, 2.2 * scale, hex);
  spawnDebris(pos, Math.round(8 + 5 * scale), scale);
  spawnRing(pos, 5 * scale, hex);
  addShake(0.25 * scale);
  AudioFX.boom(scale > 1.6);
}

function updateParticles(dt) {
  for (const p of debrisPool) {
    if (!p.active) continue;
    p.life -= dt;
    if (p.life <= 0) { p.active = false; p.mesh.visible = false; continue; }
    p.vel.y -= 22 * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.mesh.rotation.x += p.rot.x * dt;
    p.mesh.rotation.y += p.rot.y * dt;
    p.mesh.rotation.z += p.rot.z * dt;
    if (p.mesh.position.y < 0.1) {
      p.mesh.position.y = 0.1;
      p.vel.y *= -0.4;
      p.vel.x *= 0.7;
      p.vel.z *= 0.7;
    }
    const k = p.life / p.maxLife;
    p.mesh.scale.setScalar(Math.max(0.02, k));
  }
  for (const f of flashPool) {
    if (!f.active) continue;
    f.life -= dt;
    if (f.life <= 0) { f.active = false; f.mesh.visible = false; continue; }
    const k = 1 - f.life / f.maxLife;
    f.mesh.scale.setScalar(lerp(0.4, f.scale, Math.pow(k, 0.4)));
    f.mat.opacity = 0.95 * (1 - k);
  }
  for (const r of ringPool) {
    if (!r.active) continue;
    r.life -= dt;
    if (r.life <= 0) { r.active = false; r.mesh.visible = false; continue; }
    const k = 1 - r.life / r.maxLife;
    r.mesh.scale.setScalar(lerp(0.5, r.scale, Math.pow(k, 0.5)));
    r.mat.opacity = 0.85 * (1 - k);
  }
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

const input = {
  keys: {},
  mouse: new THREE.Vector2(0, 0.3),     // NDC
  mousePx: { x: innerWidth / 2, y: innerHeight / 2 },
  firing: false,
  joy: new THREE.Vector2(),             // touch joystick, -1..1
  joyActive: false,
  touchFiring: false,
};

window.addEventListener('keydown', (e) => {
  input.keys[e.code] = true;
  if (e.code === 'Space') { input.firing = true; e.preventDefault(); }
  if (e.code === 'KeyM') toggleMute();
});
window.addEventListener('keyup', (e) => {
  input.keys[e.code] = false;
  if (e.code === 'Space') input.firing = false;
});

window.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch') return;
  input.mousePx.x = e.clientX;
  input.mousePx.y = e.clientY;
  input.mouse.x = (e.clientX / innerWidth) * 2 - 1;
  input.mouse.y = -(e.clientY / innerHeight) * 2 + 1;
  const ch = $('crosshair');
  ch.style.left = e.clientX + 'px';
  ch.style.top = e.clientY + 'px';
});

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch') return;
  input.firing = true;
});
window.addEventListener('pointerup', (e) => {
  if (e.pointerType === 'touch') return;
  input.firing = false;
});

// Touch joystick
{
  const zone = $('touch-left');
  const knob = $('joystick-knob');
  const base = $('joystick-base');
  let touchId = null;
  let cx = 0, cy = 0;

  zone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    touchId = t.identifier;
    const r = base.getBoundingClientRect();
    cx = r.left + r.width / 2;
    cy = r.top + r.height / 2;
    input.joyActive = true;
  }, { passive: false });

  zone.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier !== touchId) continue;
      const dx = t.clientX - cx;
      const dy = t.clientY - cy;
      const max = 50;
      const len = Math.hypot(dx, dy);
      const k = len > max ? max / len : 1;
      knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      input.joy.set((dx * k) / max, (dy * k) / max);
    }
  }, { passive: false });

  const end = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== touchId) continue;
      touchId = null;
      input.joyActive = false;
      input.joy.set(0, 0);
      knob.style.transform = 'translate(0,0)';
    }
  };
  zone.addEventListener('touchend', end);
  zone.addEventListener('touchcancel', end);

  const fireBtn = $('touch-fire');
  fireBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    input.touchFiring = true;
  }, { passive: false });
  fireBtn.addEventListener('touchend', () => { input.touchFiring = false; });
  fireBtn.addEventListener('touchcancel', () => { input.touchFiring = false; });
}

// Audio unlock on first gesture
function unlockAudio() {
  AudioFX.init();
  AudioFX.resume();
}
window.addEventListener('pointerdown', unlockAudio, { once: false });
window.addEventListener('keydown', unlockAudio, { once: false });

function toggleMute() {
  AudioFX.init();
  AudioFX.setMuted(!AudioFX.muted);
  updateMuteBtn();
}
function updateMuteBtn() {
  const b = $('btn-mute');
  b.textContent = AudioFX.muted ? '\u{1F507}' : '\u{1F50A}';
  b.classList.toggle('muted', AudioFX.muted);
}
$('btn-mute').addEventListener('click', toggleMute);

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------

const game = {
  state: 'title',          // title | playing | over
  score: 0,
  hi: parseInt(localStorage.getItem(HI_KEY) || '0', 10),
  wave: 0,
  kills: 0,
  spawnQueue: [],
  spawnTimer: 0,
  waveBreak: 0,            // countdown to next wave once cleared
  time: 0,
};

let shake = 0;
function addShake(s) { shake = Math.min(0.9, shake + s); }

const raycaster = new THREE.Raycaster();
const aimPoint = new THREE.Vector3(0, 12, -40);

// ---------------------------------------------------------------------------
// HUD / UI
// ---------------------------------------------------------------------------

const ui = {
  score: $('score'), wave: $('wave'), dronesLeft: $('drones-left'), hi: $('hi-score'),
  shieldFill: $('shield-fill'),
  hud: $('hud'), banner: $('banner'), bannerText: $('banner-text'),
  hitFlash: $('hit-flash'), crosshair: $('crosshair'),
  title: $('title-screen'), gameover: $('gameover-popup'),
};

function setScore(s) {
  game.score = s;
  ui.score.textContent = s;
  if (s > game.hi) {
    game.hi = s;
    ui.hi.textContent = s;
  }
}

function showBanner(text) {
  ui.bannerText.textContent = text;
  ui.banner.classList.remove('hidden');
  ui.bannerText.style.animation = 'none';
  void ui.bannerText.offsetWidth;
  ui.bannerText.style.animation = '';
}

function flashHit() {
  ui.hitFlash.classList.remove('hidden');
  ui.hitFlash.style.animation = 'none';
  void ui.hitFlash.offsetWidth;
  ui.hitFlash.style.animation = '';
}

// Floating score popups, projected from world space
const popups = [];
function addPopup(text, worldPos, hex) {
  if (popups.length > 9) return;
  const el = document.createElement('div');
  el.className = 'score-pop';
  el.textContent = text;
  if (hex) el.style.color = hex;
  $('popups').appendChild(el);
  popups.push({ el, pos: worldPos.clone(), life: 0.9 });
}

function updatePopups(dt) {
  for (let i = popups.length - 1; i >= 0; i--) {
    const p = popups[i];
    p.life -= dt;
    if (p.life <= 0) {
      p.el.remove();
      popups.splice(i, 1);
      continue;
    }
    p.pos.y += 2.4 * dt;
    _tmpV.copy(p.pos).project(camera);
    p.el.style.left = ((_tmpV.x * 0.5 + 0.5) * innerWidth) + 'px';
    p.el.style.top = ((-_tmpV.y * 0.5 + 0.5) * innerHeight) + 'px';
    p.el.style.opacity = Math.min(1, p.life * 3);
  }
}

// Off-screen threat arrows for charging/diving drones
const arrowEls = [];
{
  const cont = $('arrows');
  for (let i = 0; i < 6; i++) {
    const el = document.createElement('div');
    el.className = 'threat-arrow';
    el.style.display = 'none';
    cont.appendChild(el);
    arrowEls.push(el);
  }
}

function updateThreatArrows() {
  let used = 0;
  if (game.state === 'playing') {
    for (const d of drones) {
      if (used >= arrowEls.length) break;
      if (d.state !== 'charge' && d.state !== 'dive') continue;
      _tmpV.setFromMatrixPosition(d.grp.matrixWorld).project(camera);
      const onScreen = _tmpV.z < 1 &&
        Math.abs(_tmpV.x) < 0.95 && Math.abs(_tmpV.y) < 0.92;
      if (onScreen) continue;
      if (_tmpV.z > 1) { _tmpV.x *= -1; _tmpV.y *= -1; }
      const s = Math.max(Math.abs(_tmpV.x) / 0.9, Math.abs(_tmpV.y) / 0.85, 0.0001);
      const nx = _tmpV.x / s;
      const ny = _tmpV.y / s;
      const el = arrowEls[used++];
      el.style.display = 'block';
      el.style.left = ((nx * 0.5 + 0.5) * innerWidth - 8) + 'px';
      el.style.top = ((-ny * 0.5 + 0.5) * innerHeight - 9) + 'px';
      el.style.transform = `rotate(${Math.atan2(-ny, nx) * 180 / Math.PI}deg)`;
    }
  }
  for (let i = used; i < arrowEls.length; i++) arrowEls[i].style.display = 'none';
}

// ---------------------------------------------------------------------------
// Waves
// ---------------------------------------------------------------------------

function waveComposition(n) {
  const q = [];
  const scouts = 3 + Math.min(9, n);
  const strikers = n >= 2 ? Math.min(8, Math.floor(n * 0.9)) : 0;
  const goliaths = n >= 3 ? Math.min(4, Math.floor((n - 1) / 2)) : 0;
  for (let i = 0; i < scouts; i++) q.push('scout');
  for (let i = 0; i < strikers; i++) q.push('striker');
  for (let i = 0; i < goliaths; i++) q.push('goliath');
  // shuffle
  for (let i = q.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [q[i], q[j]] = [q[j], q[i]];
  }
  return q;
}

function startWave(n) {
  game.wave = n;
  ui.wave.textContent = n;
  game.spawnQueue = waveComposition(n);
  game.spawnTimer = 0.8;
  if (!SHOT_MODE) {
    showBanner('WAVE ' + n);
    AudioFX.horn();
  }
}

function spawnFromQueue(dt) {
  if (game.spawnQueue.length === 0) return;
  game.spawnTimer -= dt;
  if (game.spawnTimer > 0) return;
  game.spawnTimer = Math.max(0.35, 1.1 - game.wave * 0.05);
  const type = game.spawnQueue.shift();
  const d = makeDrone(type);
  const a = rand(0, Math.PI * 2);
  d.grp.position.set(Math.cos(a) * rand(75, 95), rand(18, 32), Math.sin(a) * rand(75, 95));
}

// ---------------------------------------------------------------------------
// Tank update
// ---------------------------------------------------------------------------

function updateTank(dt) {
  // --- movement input ---
  let mx = 0, mz = 0;
  if (input.keys['KeyW'] || input.keys['ArrowUp']) mz -= 1;
  if (input.keys['KeyS'] || input.keys['ArrowDown']) mz += 1;
  if (input.keys['KeyA'] || input.keys['ArrowLeft']) mx -= 1;
  if (input.keys['KeyD'] || input.keys['ArrowRight']) mx += 1;
  if (input.joyActive) { mx = input.joy.x; mz = input.joy.y; }

  const mLen = Math.hypot(mx, mz);
  if (mLen > 1) { mx /= mLen; mz /= mLen; }

  tank.vel.x += mx * TANK_ACCEL * dt;
  tank.vel.z += mz * TANK_ACCEL * dt;
  const dampK = Math.min(1, TANK_DAMP * dt);
  tank.vel.x -= tank.vel.x * dampK;
  tank.vel.z -= tank.vel.z * dampK;
  const sp = Math.hypot(tank.vel.x, tank.vel.z);
  if (sp > TANK_MAX_SPEED) {
    tank.vel.x *= TANK_MAX_SPEED / sp;
    tank.vel.z *= TANK_MAX_SPEED / sp;
  }

  tank.grp.position.x += tank.vel.x * dt;
  tank.grp.position.z += tank.vel.z * dt;
  const r = Math.hypot(tank.grp.position.x, tank.grp.position.z);
  if (r > ARENA_R - 1.5) {
    const k = (ARENA_R - 1.5) / r;
    tank.grp.position.x *= k;
    tank.grp.position.z *= k;
  }

  // --- hull yaw faces velocity (hull forward = -z) ---
  if (sp > 1.2) {
    const targetYaw = Math.atan2(-tank.vel.x, -tank.vel.z);
    tank.yaw = angLerp(tank.yaw, targetYaw, damp(7, dt));
  }
  tank.grp.rotation.y = tank.yaw;

  // --- hover bob + lean into motion ---
  tank.leanG.position.y = 0.32 + Math.sin(game.time * 3.1) * 0.06;
  const cos = Math.cos(tank.yaw), sin = Math.sin(tank.yaw);
  const localVx = tank.vel.x * cos - tank.vel.z * sin;
  const localVz = tank.vel.x * sin + tank.vel.z * cos;
  tank.leanG.rotation.x = lerp(tank.leanG.rotation.x, clamp(-localVz * 0.016, -0.18, 0.18), damp(8, dt));
  tank.leanG.rotation.z = lerp(tank.leanG.rotation.z, clamp(localVx * 0.02, -0.2, 0.2), damp(8, dt));

  // --- hover pad pulse ---
  for (let i = 0; i < tank.padMats.length; i++) {
    tank.padMats[i].opacity = 0.65 + Math.sin(game.time * 9 + i * 1.7) * 0.3;
  }

  // --- aiming ---
  computeAim(dt);

  // --- firing ---
  tank.fireTimer -= dt;
  const wantFire = input.firing || input.touchFiring;
  if (wantFire && tank.fireTimer <= 0 && game.state === 'playing') {
    tank.fireTimer = FIRE_COOLDOWN;
    tank.barrelSide = 1 - tank.barrelSide;
    const muzzle = tank.muzzles[tank.barrelSide];
    muzzle.getWorldPosition(_tmpV);
    _tmpV2.copy(aimPoint).sub(_tmpV).normalize();
    fireBolt(playerBolts, _tmpV, _tmpV2, BOLT_SPEED, 1);
    const tip = tank.muzzleFlash[tank.barrelSide];
    tip.scale.setScalar(1);
    AudioFX.pew();
    addShake(0.03);
  }
  for (const tip of tank.muzzleFlash) {
    tip.scale.multiplyScalar(Math.pow(0.0001, dt));
    if (tip.scale.x < 0.002) tip.scale.setScalar(0.001);
  }

  // --- shield regen ---
  if (game.time - tank.lastHitT > SHIELD_REGEN_DELAY && tank.shield < SHIELD_MAX) {
    tank.shield = Math.min(SHIELD_MAX, tank.shield + SHIELD_REGEN_RATE * dt);
    updateShieldUI();
  }
}

function computeAim(dt) {
  if (IS_TOUCH && !SHOT_MODE) {
    // Auto-aim: most threatening drone (charging first, then nearest)
    let best = null, bestScore = -Infinity;
    for (const d of drones) {
      const dist = d.grp.position.distanceTo(tank.grp.position);
      const s = (d.state === 'charge' ? 60 : 0) + (d.state === 'dive' ? 40 : 0) - dist;
      if (s > bestScore) { bestScore = s; best = d; }
    }
    if (best) {
      // small lead toward where the drone is going
      _tmpV3.copy(best.vel).multiplyScalar(
        best.grp.position.distanceTo(tank.grp.position) / BOLT_SPEED);
      aimPoint.copy(best.grp.position).add(_tmpV3);
    } else {
      _tmpV3.set(Math.sin(tank.yaw + Math.PI), 0.35, Math.cos(tank.yaw + Math.PI));
      aimPoint.copy(tank.grp.position).addScaledVector(_tmpV3, -40);
      aimPoint.y = 14;
    }
  } else {
    raycaster.setFromCamera(input.mouse, camera);
    // Aim assist: snap to a drone close to the crosshair ray
    let best = null, bestDist = Infinity;
    for (const d of drones) {
      const rayDist = raycaster.ray.distanceToPoint(d.grp.position);
      if (rayDist < d.hitR * 2.4) {
        const camDist = d.grp.position.distanceTo(camera.position);
        if (camDist < bestDist) { bestDist = camDist; best = d; }
      }
    }
    if (best) {
      _tmpV3.copy(best.vel).multiplyScalar(
        best.grp.position.distanceTo(tank.grp.position) / BOLT_SPEED * 0.8);
      aimPoint.copy(best.grp.position).add(_tmpV3);
    } else {
      aimPoint.copy(raycaster.ray.origin).addScaledVector(raycaster.ray.direction, 85);
    }
  }

  // Turret yaw / barrel pitch track the aim point
  tank.turretG.getWorldPosition(_tmpV);
  _tmpV2.copy(aimPoint).sub(_tmpV);
  const targetYawWorld = Math.atan2(-_tmpV2.x, -_tmpV2.z);
  const horiz = Math.hypot(_tmpV2.x, _tmpV2.z);
  const targetPitch = clamp(Math.atan2(_tmpV2.y, horiz), -0.06, 1.25);
  tank.turretYaw = angLerp(tank.turretYaw, targetYawWorld, damp(14, dt));
  tank.barrelPitch = lerp(tank.barrelPitch, targetPitch, damp(14, dt));
  tank.turretG.rotation.y = tank.turretYaw - tank.yaw
    - tank.leanG.rotation.y;
  tank.barrelG.rotation.x = tank.barrelPitch;
}

function updateShieldUI() {
  const k = clamp(tank.shield / SHIELD_MAX, 0, 1);
  ui.shieldFill.style.width = (k * 100) + '%';
  ui.shieldFill.classList.toggle('low', k < 0.35);
}

function damageTank(dmg, fromPos) {
  if (game.state !== 'playing') return;
  tank.shield -= dmg;
  tank.lastHitT = game.time;
  updateShieldUI();
  flashHit();
  addShake(0.35);
  AudioFX.hit();
  spawnFlash(_tmpV.copy(tank.grp.position).setY(1.2), 1.6, 0xff4040);
  if (tank.shield <= 0) {
    tank.shield = 0;
    gameOver();
  }
}

// ---------------------------------------------------------------------------
// Drone update
// ---------------------------------------------------------------------------

const orbitCenter = new THREE.Vector3();

function updateDrones(dt) {
  const waveSpeedK = 1 + Math.min(0.5, game.wave * 0.035);
  const waveFireK = Math.max(0.55, 1 - game.wave * 0.04);

  for (let i = drones.length - 1; i >= 0; i--) {
    const d = drones[i];
    const def = d.def;
    const pos = d.grp.position;

    // -- steering target by state --
    orbitCenter.copy(tank.grp.position).multiplyScalar(0.55);
    let speed = def.speed * waveSpeedK;
    let steerRate = 2.2;

    if (d.state === 'orbit' || d.state === 'charge') {
      d.orbitA += d.orbitDir * (speed / d.orbitR) * dt * 0.7;
      _tmpV.set(
        orbitCenter.x + Math.cos(d.orbitA) * d.orbitR,
        d.orbitH + Math.sin(game.time * 1.3 + d.phase) * 2.2,
        orbitCenter.z + Math.sin(d.orbitA) * d.orbitR);
      if (d.state === 'charge') speed *= 0.35;
    } else if (d.state === 'dive') {
      _tmpV.copy(d.diveTarget);
      speed = def.speed * 2.1 * waveSpeedK;
      steerRate = 3.2;
    } else { // climb
      _tmpV.set(pos.x, d.orbitH, pos.z);
      speed *= 1.2;
    }

    // seek
    _tmpV.sub(pos);
    const distToTarget = _tmpV.length();
    if (distToTarget > 0.001) {
      _tmpV.normalize().multiplyScalar(Math.min(speed, distToTarget * 2.5));
      d.vel.lerp(_tmpV, Math.min(1, steerRate * dt));
    }
    pos.addScaledVector(d.vel, dt);
    if (pos.y < 2.2) pos.y = 2.2;

    // -- orientation: face velocity, bank into turns --
    const hSpeed = Math.hypot(d.vel.x, d.vel.z);
    if (hSpeed > 0.5) {
      const targetYaw = Math.atan2(d.vel.x, d.vel.z) + Math.PI; // eye is at -z
      const prevYaw = d.grp.rotation.y;
      d.grp.rotation.y = angLerp(prevYaw, targetYaw, damp(5, dt));
      let yawDelta = d.grp.rotation.y - prevYaw;
      yawDelta = ((yawDelta + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      d.grp.rotation.z = lerp(d.grp.rotation.z, clamp(-yawDelta / Math.max(dt, 0.001) * 0.12, -0.55, 0.55), damp(4, dt));
    }
    d.grp.rotation.x = lerp(d.grp.rotation.x, clamp(-d.vel.y * 0.03, -0.4, 0.4), damp(4, dt));

    // rotors
    for (const rotor of d.rotors) rotor.rotation.y += 38 * dt;

    // -- eye heat / glow --
    let targetHeat = 0;
    if (d.state === 'charge') targetHeat = clamp(1 - d.chargeT / 0.85, 0, 1);
    if (d.state === 'dive') targetHeat = 1;
    d.heat = lerp(d.heat, targetHeat, damp(8, dt));
    const heat = d.heat;
    d.eyeMat.color.copy(d.eyeBase).lerp(_whiteHot, heat * 0.85);
    const pulse = 1 + Math.sin(game.time * 16) * 0.12 * heat;
    d.eye.scale.setScalar(def.size * 0.4 * (1 + heat * 0.45) * pulse);
    d.halo.scale.setScalar(def.size * 0.62 * (1 + heat * 0.9) * pulse);
    d.haloMat.opacity = 0.22 + heat * 0.5;

    if (d.docile || game.state !== 'playing') continue;

    // -- combat state machine --
    const distToTank = pos.distanceTo(tank.grp.position);

    if (d.state === 'orbit') {
      d.fireTimer -= dt;
      if (d.type === 'striker') {
        d.diveTimer -= dt;
        if (d.diveTimer <= 0 && distToTank < 55) {
          d.state = 'dive';
          _tmpV2.copy(tank.grp.position).sub(pos);
          _tmpV2.y = 0;
          _tmpV2.normalize();
          d.diveTarget.copy(tank.grp.position).addScaledVector(_tmpV2, 26);
          d.diveTarget.y = 3.5;
          d.burstLeft = 3;
          d.burstTimer = 0.5;
          d.stateT = 0;
          continue;
        }
      }
      if (d.fireTimer <= 0 && distToTank < 60) {
        d.state = 'charge';
        d.chargeT = 0.85;
      }
    } else if (d.state === 'charge') {
      d.chargeT -= dt;
      if (d.chargeT <= 0) {
        droneFire(d);
        d.state = 'orbit';
        d.fireTimer = def.fireBase * rand(0.8, 1.3) * waveFireK;
      }
    } else if (d.state === 'dive') {
      d.stateT = (d.stateT || 0) + dt;
      d.burstTimer -= dt;
      if (d.burstLeft > 0 && d.burstTimer <= 0) {
        d.burstLeft--;
        d.burstTimer = 0.45;
        droneFire(d, true);
      }
      _tmpV2.copy(d.diveTarget).sub(pos);
      _tmpV2.y = 0;
      if (_tmpV2.length() < 5 || d.stateT > 4.5) {
        d.state = 'climb';
      }
    } else if (d.state === 'climb') {
      if (pos.y > d.orbitH - 2) {
        d.state = 'orbit';
        d.diveTimer = rand(5, 10);
      }
    }
  }
}

const _whiteHot = new THREE.Color(3.2, 3.2, 3.0);

function droneFire(d, noLead) {
  const def = d.def;
  d.eye.getWorldPosition(_tmpV);
  // aim at tank with a bit of lead and spread
  const boltSpeed = Math.min(38, 24 + game.wave * 0.8);
  _tmpV2.copy(tank.grp.position).setY(1.0);
  if (!noLead) {
    const t = _tmpV.distanceTo(_tmpV2) / boltSpeed * 0.7;
    _tmpV2.x += tank.vel.x * t;
    _tmpV2.z += tank.vel.z * t;
  }
  _tmpV2.x += rand(-1.6, 1.6);
  _tmpV2.z += rand(-1.6, 1.6);

  const shots = d.type === 'goliath' ? 3 : 1;
  for (let i = 0; i < shots; i++) {
    _tmpV3.copy(_tmpV2).sub(_tmpV).normalize();
    if (shots > 1) {
      const spread = (i - 1) * 0.14;
      const cos = Math.cos(spread), sin = Math.sin(spread);
      const x = _tmpV3.x * cos - _tmpV3.z * sin;
      const z = _tmpV3.x * sin + _tmpV3.z * cos;
      _tmpV3.x = x; _tmpV3.z = z;
    }
    fireBolt(enemyBolts, _tmpV, _tmpV3, boltSpeed, def.dmg);
  }
  AudioFX.enemyPew();
}

function killDrone(d) {
  const pos = d.grp.position;
  const scale = d.def.size;
  spawnExplosion(pos, scale, d.type === 'goliath' ? 0xffb347 : 0xff5030);
  setScore(game.score + d.def.score);
  game.kills++;
  addPopup('+' + d.def.score, pos);
  removeDrone(d);
}

// ---------------------------------------------------------------------------
// Bolt updates & collisions
// ---------------------------------------------------------------------------

function updateBolts(dt) {
  // Player bolts vs drones
  for (const b of playerBolts) {
    if (!b.active) continue;
    b.life -= dt;
    b.mesh.position.addScaledVector(b.vel, dt);
    if (b.life <= 0 || b.mesh.position.y < 0 || b.mesh.position.y > 90) {
      killBolt(b);
      continue;
    }
    for (let i = drones.length - 1; i >= 0; i--) {
      const d = drones[i];
      if (d.docile) continue;
      const rr = d.hitR + 0.5;
      if (b.mesh.position.distanceToSquared(d.grp.position) < rr * rr) {
        killBolt(b);
        d.hp -= 1;
        d.heat = 1;
        if (d.hp <= 0) {
          killDrone(d);
        } else {
          spawnFlash(b.mesh.position, 0.9, 0xaef3ff);
          spawnDebris(b.mesh.position, 3, 0.6);
          AudioFX.hit();
        }
        break;
      }
    }
  }

  // Enemy bolts vs tank
  _tmpV.copy(tank.grp.position);
  _tmpV.y += 1.0;
  for (const b of enemyBolts) {
    if (!b.active) continue;
    b.life -= dt;
    b.mesh.position.addScaledVector(b.vel, dt);
    if (b.life <= 0) { killBolt(b); continue; }
    if (b.mesh.position.y < 0.1) {
      spawnRing(b.mesh.position, 1.6, 0xff2050);
      killBolt(b);
      continue;
    }
    if (game.state === 'playing' &&
        b.mesh.position.distanceToSquared(_tmpV) < 1.9 * 1.9) {
      killBolt(b);
      damageTank(b.dmg, b.mesh.position);
    }
  }
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

const camGoal = new THREE.Vector3();
const camLook = new THREE.Vector3();

function updateCamera(dt) {
  if (game.state === 'title') {
    const a = game.time * 0.07;
    camGoal.set(Math.sin(a) * 30, 11 + Math.sin(game.time * 0.21) * 2.5, Math.cos(a) * 30);
    camera.position.lerp(camGoal, damp(1.6, dt));
    camLook.set(0, 7, 0);
  } else {
    camGoal.set(
      tank.grp.position.x * 0.94 + input.mouse.x * 1.6,
      9 + input.mouse.y * 1.2,
      tank.grp.position.z * 0.94 + 13.5);
    camera.position.lerp(camGoal, damp(5, dt));
    camLook.set(tank.grp.position.x * 0.94, 3.6, tank.grp.position.z * 0.94 - 8);
  }

  if (shake > 0.001) {
    camera.position.x += rand(-1, 1) * shake;
    camera.position.y += rand(-1, 1) * shake * 0.6;
    camera.position.z += rand(-1, 1) * shake;
    shake *= Math.pow(0.001, dt);
  } else {
    shake = 0;
  }
  camera.lookAt(camLook);
}

// ---------------------------------------------------------------------------
// Environment animation
// ---------------------------------------------------------------------------

function updateEnvironment(dt) {
  sunMat.uniforms.uTime.value = game.time;
  for (const b of envAnims.beacons) {
    const k = (Math.sin(game.time * 2.6 + b.phase) + 1) / 2;
    b.mesh.scale.setScalar(0.55 + k * 0.7);
  }
  for (const c of envAnims.crystals) {
    c.mat.emissiveIntensity = 0.85 + Math.sin(game.time * 1.7 + c.phase) * 0.4;
  }
  const ringPulse = 1.2 + Math.sin(game.time * 1.4) * 0.35;
  arenaRing.material.color.set(0x4df3ff).multiplyScalar(ringPulse);
  // keep the shadow box centered on the action
  moonLight.target.position.copy(tank.grp.position);
}

// ---------------------------------------------------------------------------
// Flow: title / start / game over
// ---------------------------------------------------------------------------

function spawnAttractDrones() {
  const types = ['scout', 'scout', 'scout', 'striker', 'striker', 'goliath'];
  for (const t of types) {
    const d = makeDrone(t, true);
    const a = rand(0, Math.PI * 2);
    d.orbitR = rand(12, 26);
    d.orbitH = rand(8, 20);
    d.grp.position.set(Math.cos(a) * d.orbitR, d.orbitH, Math.sin(a) * d.orbitR);
  }
}

function clearField() {
  while (drones.length) removeDrone(drones[0]);
  for (const b of playerBolts) killBolt(b);
  for (const b of enemyBolts) killBolt(b);
  for (const p of debrisPool) { p.active = false; p.mesh.visible = false; }
  for (const f of flashPool) { f.active = false; f.mesh.visible = false; }
  for (const r of ringPool) { r.active = false; r.mesh.visible = false; }
  for (const p of popups) p.el.remove();
  popups.length = 0;
}

function startGame() {
  clearField();
  game.state = 'playing';
  game.kills = 0;
  game.waveBreak = 0;
  setScore(0);
  ui.hi.textContent = game.hi;
  tank.shield = SHIELD_MAX;
  tank.lastHitT = -99;
  tank.grp.position.set(0, 0, 0);
  tank.grp.visible = true;
  tank.vel.set(0, 0, 0);
  tank.yaw = 0;
  updateShieldUI();

  ui.title.classList.add('hidden');
  ui.gameover.classList.add('hidden');
  ui.hud.classList.remove('hidden');
  document.body.classList.add('playing');
  if (IS_TOUCH) {
    $('touch-left').classList.remove('hidden');
    $('touch-fire').classList.remove('hidden');
  } else {
    ui.crosshair.classList.remove('hidden');
  }

  startWave(1);
}

function gameOver() {
  game.state = 'over';
  spawnExplosion(_tmpV.copy(tank.grp.position).setY(1), 2.4, 0xffb347);
  spawnExplosion(_tmpV.copy(tank.grp.position).setY(1.6), 1.4, 0xff5030);
  tank.grp.visible = false;
  document.body.classList.remove('playing');
  ui.crosshair.classList.add('hidden');
  $('touch-left').classList.add('hidden');
  $('touch-fire').classList.add('hidden');

  localStorage.setItem(HI_KEY, String(game.hi));
  $('go-score').textContent = game.score;
  $('go-hi').textContent = game.hi;
  $('go-wave').textContent = game.wave;
  $('go-kills').textContent = game.kills;
  setTimeout(() => {
    if (game.state === 'over') ui.gameover.classList.remove('hidden');
  }, 1300);
}

function backToTitle() {
  clearField();
  game.state = 'title';
  tank.grp.visible = true;
  tank.grp.position.set(0, 0, 0);
  ui.gameover.classList.add('hidden');
  ui.hud.classList.add('hidden');
  ui.title.classList.remove('hidden');
  spawnAttractDrones();
}

$('btn-play').addEventListener('click', () => {
  unlockAudio();
  startGame();
});
$('btn-help').addEventListener('click', () => {
  $('help-box').classList.toggle('hidden');
});
$('btn-retry').addEventListener('click', () => startGame());
$('btn-menu').addEventListener('click', () => backToTitle());

// ---------------------------------------------------------------------------
// Screenshot mode (?shot=1) — deterministic, photogenic frame for thumbnails
// ---------------------------------------------------------------------------

let shotTimer = 0;

function setupShotMode() {
  startGame();
  game.spawnQueue = [];
  ui.banner.classList.add('hidden');
  tank.grp.position.set(0, 0, 4);
  const slots = [
    ['goliath', -5, 13, -18], ['striker', 5, 9, -11], ['striker', -10, 7, -7],
    ['scout', 9, 12, -18], ['scout', 1, 15, -24], ['scout', 14, 9, -12],
    ['scout', -3, 10, -9],
  ];
  for (const [t, x, y, z] of slots) {
    const d = makeDrone(t, true);
    d.grp.position.set(x, y, z);
    d.orbitR = Math.hypot(x, z);
    d.orbitH = y;
    d.orbitA = Math.atan2(z, x);
  }
  input.firing = true;
  input.mouse.set(0.05, 0.3);
}

function updateShotMode(dt) {
  shotTimer -= dt;
  if (shotTimer <= 0) {
    shotTimer = 3.0;
    const d = drones[randInt(0, drones.length - 1)];
    if (d) spawnExplosion(
      _tmpV.set(d.grp.position.x + rand(-4, 4), d.grp.position.y + rand(-2, 2),
        d.grp.position.z + rand(-3, 3)), 0.9, 0xff5030);
  }
  // keep two eyes burning hot for the shot
  if (drones[0]) drones[0].heat = 1;
  if (drones[1]) drones[1].heat = 1;
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

const clock = new THREE.Clock();

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  game.time += dt;

  updateEnvironment(dt);

  if (game.state === 'playing') {
    updateTank(dt);
    spawnFromQueue(dt);
    updateDrones(dt);
    updateBolts(dt);

    if (SHOT_MODE) {
      updateShotMode(dt);
    } else if (game.spawnQueue.length === 0 && drones.length === 0) {
      if (game.waveBreak <= 0) {
        game.waveBreak = 2.6;
        const bonus = 50 * game.wave;
        setScore(game.score + bonus);
        addPopup('WAVE CLEAR +' + bonus,
          _tmpV.copy(tank.grp.position).setY(6), '#ffb347');
      } else {
        game.waveBreak -= dt;
        if (game.waveBreak <= 0) startWave(game.wave + 1);
      }
    }
    ui.dronesLeft.textContent = drones.length + game.spawnQueue.length;
  } else {
    updateDrones(dt);
    updateBolts(dt);
  }

  updateParticles(dt);
  updateCamera(dt);
  updatePopups(dt);
  updateThreatArrows();

  composer.render();
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

buildEnvironment();
buildTank();
updateMuteBtn();
$('btn-mute').classList.remove('hidden');
ui.hi.textContent = game.hi;

if (SHOT_MODE) {
  setupShotMode();
} else {
  spawnAttractDrones();
}

tick();
