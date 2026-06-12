// Boot + main loop: renderer, world/props/entities, tap markers, circle
// collision, pickup collection, ?shot / ?auto modes, error capture.

import * as THREE from 'three';
import { CFG, SHOT, LITE, AUTO, HERO } from './config.js';
import { clamp, rand, pick, unlockAudio } from './utils.js';
import { registry, liveColliders, livePickups } from './registry.js';
import { buildWorld } from './world.js';
import { buildProps } from './props.js';
import { buildEntities } from './entities.js';
import { createControls } from './controls.js';
import { initUi, addPickup, inventoryCounts, setStyleActive } from './ui.js';
import { initDebug, debugFlags } from './debug.js';
import { initFx, tickFx } from './fx.js';

window.__errors = [];
window.addEventListener('error', e => window.__errors.push(String(e.message)));
window.addEventListener('unhandledrejection', e => window.__errors.push(String(e.reason)));

// ── renderer / scene / camera ──

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, LITE ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
if (!LITE) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
document.getElementById('game-container').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdff0f7);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 500);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── build the glade ──

const world = buildWorld(scene);
initFx(scene);
const props = buildProps(scene);
const ents = buildEntities(scene);
const player = ents.player;
const HERO_ALIAS = { maeve: 'maeve', 2: 'maeve', garrick: 'garrick', 3: 'garrick', wren: 'wren', 4: 'wren' };
if (HERO && HERO_ALIAS[HERO]) player.setHero(HERO_ALIAS[HERO]);

initUi({ onStyle: (s) => player.setStyle(s) });

// ── tap markers ──

const markers = [];
function spawnMarker(p) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.22, 0.32, 24).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: 0x9aff6a, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  ring.material.userData.noWire = true;
  ring.position.set(p.x, world.groundHeight(p.x, p.z) + 0.05, p.z);
  scene.add(ring);
  markers.push({ ring, age: 0 });
}

const controls = createControls({
  camera, dom: renderer.domElement, player, ground: world.ground,
  attackables: () => ents.chickens
    .filter(c => c.state !== 'dead' && c.state !== 'dying')
    .map(c => c.group),
  onTap(p, chicken) {
    unlockAudio();
    if (chicken) player.attackChicken(chicken);
    else if (p) { player.setTarget(p); spawnMarker(p); }
  },
});

initDebug({
  scene, renderer, controls, getFps: () => fps,
  playerGroups: Object.values(player.rigs).map(r => r.group),
});

// ── shot mode: stage the thumbnail ──

if (SHOT) {
  document.body.classList.add('shot-mode');
  player.pos.set(3.4, 0, -0.6);
  player.yaw = -0.5;
  controls.state.yaw = -0.75;
  controls.state.pitch = 0.42;
  controls.state.dist = 8.5;
}

// ── collision (circles) ──

function resolveCollisions() {
  const px = player.pos;
  const checkCircle = (cx, cz, r) => {
    const minD = r + CFG.playerRadius;
    const dx = px.x - cx, dz = px.z - cz;
    const d = Math.hypot(dx, dz);
    if (d < minD && d > 1e-5) {
      px.x = cx + (dx / d) * minD;
      px.z = cz + (dz / d) * minD;
    }
  };
  for (const e of liveColliders()) {
    if (e.object === player.group) continue;
    if (e.collider.r) checkCircle(e.object.position.x, e.object.position.z, e.collider.r);
    else for (const p of e.collider.points) checkCircle(p.x, p.z, p.r);
  }
}

// ── pickups ──

const popping = [];
function collectPickups() {
  for (const e of livePickups()) {
    const o = e.object;
    const d = Math.hypot(player.pos.x - o.position.x, player.pos.z - o.position.z);
    if (d < CFG.pickupRange) {
      e.dead = true;
      addPickup(e.pickup.kind, e.name.replace(/ \d+$/, ''));
      popping.push({ object: o, age: 0 });
    }
  }
}

// ── auto mode (soak test) ──

let autoTimer = 0;
function autoTick(dt) {
  autoTimer -= dt;
  if (autoTimer > 0 || player.attackTarget) return;
  autoTimer = rand(2.5, 4.5);
  const roll = Math.random();
  const remaining = livePickups();
  const alive = ents.chickens.filter(c => c.hp > 0 && c.state !== 'dying' && c.state !== 'dead');
  if (roll < 0.4 && remaining.length) {
    const target = remaining[Math.floor(Math.random() * remaining.length)].object.position;
    player.setTarget(target);
    spawnMarker(target);
  } else if (roll < 0.75 && alive.length) {
    const style = pick(['sword', 'crossbow', 'staff']);
    player.setStyle(style);
    setStyleActive(style);
    player.attackChicken(pick(alive));
  } else {
    const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * (CFG.playRadius - 3);
    const p = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
    player.setTarget(p);
    spawnMarker(p);
  }
}

// ── loop ──

const clock = new THREE.Clock();
let t = 0, fps = 60, frames = 0, fpsT = 0, frameCount = 0;

function loop() {
  requestAnimationFrame(loop);
  let dt = clamp(clock.getDelta(), 0, 0.05);
  frames++; fpsT += dt;
  if (fpsT >= 0.5) { fps = frames / fpsT; frames = 0; fpsT = 0; }
  if (debugFlags.paused) dt = 0;
  t += dt;

  if (AUTO) autoTick(dt);

  ents.tick(dt, t, controls.keyDir());
  resolveCollisions();
  collectPickups();
  props.tick(t, dt);
  world.tick(dt);
  tickFx(dt);

  for (let i = markers.length - 1; i >= 0; i--) {
    const m = markers[i];
    m.age += dt;
    const k = m.age / 0.7;
    m.ring.scale.setScalar(1 - k * 0.5);
    m.ring.material.opacity = 0.9 * (1 - k);
    if (k >= 1) { scene.remove(m.ring); markers.splice(i, 1); }
  }
  for (let i = popping.length - 1; i >= 0; i--) {
    const p = popping[i];
    p.age += dt;
    const k = p.age / 0.25;
    p.object.scale.setScalar(Math.max(1 - k, 0.001) * (1 + k * 0.4));
    p.object.position.y += dt * 1.5;
    if (k >= 1) { p.object.removeFromParent(); popping.splice(i, 1); }
  }

  controls.tick(dt);
  renderer.render(scene, camera);

  frameCount++;
  if (SHOT && frameCount === 8) window.__shotReady = true;
}
loop();

// soak-test hooks
window.__state = {
  get fps() { return fps; },
  get pos() { return { x: +player.pos.x.toFixed(2), z: +player.pos.z.toFixed(2) }; },
  get picked() { return { ...inventoryCounts }; },
  get pickupsLeft() { return livePickups().length; },
  get hero() { return player.rigName; },
  get style() { return player.style; },
  get chickens() { return ents.chickens.map(c => `${c.hp}hp/${c.state}`); },
  get errors() { return window.__errors; },
};
window.__game = {
  player, chickens: ents.chickens, controls,
  setHero: (n) => player.setHero(n),
  setStyle: (s) => { player.setStyle(s); setStyleActive(s); },
};
window.__camera = camera;
