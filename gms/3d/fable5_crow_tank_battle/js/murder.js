// The murder: this game's shrinking battle-royale wall is a wheeling ring
// of crows. Visuals only — the damage/shrink logic lives in main.js and
// reads/writes state.zoneR like any royale zone.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { scene } from './world.js';
import { rand } from './utils.js';
import { AudioFX } from './audio.js';

const CROW_COUNT = 64;

let wall = null;
let groundRing = null;
let crowRing = null;
const seeds = [];
let cawTimer = 3;

// Swooping crows: a few loose birds that dive on a tank being pecked.
const SWOOP_POOL = 12;
const swoops = [];
const _look = new THREE.Vector3();

export function spawnSwoop(target, n = 2) {
  for (let k = 0; k < n; k++) {
    const s = swoops.find((x) => !x.active);
    if (!s) return;
    const a = rand(0, Math.PI * 2);
    s.from.set(target.x + Math.cos(a) * 9, rand(7, 11), target.z + Math.sin(a) * 9);
    s.mid.set(target.x + rand(-0.6, 0.6), 1.9, target.z + rand(-0.6, 0.6));
    s.to.set(target.x - Math.cos(a) * 10, rand(8, 13), target.z - Math.sin(a) * 10);
    s.t = -k * 0.12;
    s.dur = rand(0.7, 0.95);
    s.active = true;
    s.mesh.scale.setScalar(rand(0.9, 1.3));
  }
}

function updateSwoops(dt, time) {
  for (const s of swoops) {
    if (!s.active) continue;
    s.t += dt;
    if (s.t < 0) continue;
    const k = s.t / s.dur;
    if (k >= 1) { s.active = false; s.mesh.visible = false; continue; }
    // quadratic bezier dive through the target and back up
    const u = 1 - k;
    _p.set(0, 0, 0)
      .addScaledVector(s.from, u * u).addScaledVector(s.mid, 2 * u * k).addScaledVector(s.to, k * k);
    _look.set(0, 0, 0)
      .addScaledVector(s.from, -2 * u).addScaledVector(s.mid, 2 * u - 2 * k).addScaledVector(s.to, 2 * k)
      .add(_p);
    s.mesh.position.copy(_p);
    s.mesh.lookAt(_look);
    s.mesh.rotateY(Math.PI);           // the crow model faces -z
    s.mesh.rotateZ(Math.sin(time * 22 + s.dur * 9) * 0.5);
    s.mesh.visible = true;
  }
}

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();

// One merged low-poly crow: body + two swept wings. Faces -z.
function buildCrowGeo() {
  const body = new THREE.ConeGeometry(0.22, 1.1, 5);
  body.rotateX(Math.PI / 2);                     // taper to the tail
  const wingL = new THREE.BoxGeometry(1.5, 0.04, 0.5);
  wingL.translate(-0.8, 0.08, 0.1);
  const wingR = new THREE.BoxGeometry(1.5, 0.04, 0.5);
  wingR.translate(0.8, 0.08, 0.1);
  const geo = mergeGeometries([body, wingL, wingR]);
  body.dispose(); wingL.dispose(); wingR.dispose();
  return geo;
}

export function initMurder() {
  // smoky black wall — the flock too dense to see through
  wall = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 24, 72, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x16060c, transparent: true, opacity: 0.42,
      side: THREE.DoubleSide, depthWrite: false, fog: false }));
  wall.position.y = 12;
  scene.add(wall);

  groundRing = new THREE.Mesh(
    new THREE.RingGeometry(0.975, 1, 96),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xff3b30).multiplyScalar(1.6),
      transparent: true, opacity: 0.55, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false }));
  groundRing.rotation.x = -Math.PI / 2;
  groundRing.position.y = 0.08;
  scene.add(groundRing);

  const crowMat = new THREE.MeshStandardMaterial({
    color: 0x14161e, emissive: 0x0a0c14, emissiveIntensity: 0.6,
    flatShading: true, roughness: 0.6 });
  const crowGeo = buildCrowGeo();
  crowRing = new THREE.InstancedMesh(crowGeo, crowMat, CROW_COUNT);
  crowRing.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(crowRing);

  for (let i = 0; i < SWOOP_POOL; i++) {
    const mesh = new THREE.Mesh(crowGeo, crowMat);
    mesh.visible = false;
    scene.add(mesh);
    swoops.push({ mesh, from: new THREE.Vector3(), to: new THREE.Vector3(),
      mid: new THREE.Vector3(), t: 0, dur: 1, active: false });
  }

  for (let i = 0; i < CROW_COUNT; i++) {
    seeds.push({
      a0: rand(0, Math.PI * 2),
      h: rand(1.5, 19),
      jitter: rand(-2.2, 2.2),
      speed: rand(0.16, 0.34),       // radians/sec around the ring
      phase: rand(0, Math.PI * 2),
      scale: rand(0.8, 1.7),
    });
  }
}

// Called every frame from the zone logic in main.js.
export function setMurderVisual(r, shrinking, time, dt) {
  wall.scale.set(r, 1, r);
  wall.material.opacity = shrinking ? 0.40 + Math.sin(time * 5) * 0.08 : 0.32;
  groundRing.scale.set(r, r, 1);
  groundRing.material.opacity = shrinking ? 0.55 + Math.sin(time * 6) * 0.25 : 0.45;

  const speedK = shrinking ? 1.7 : 1;
  for (let i = 0; i < CROW_COUNT; i++) {
    const s = seeds[i];
    const a = s.a0 + time * s.speed * speedK;
    const cr = Math.max(2, r + s.jitter);
    _p.set(
      Math.cos(a) * cr,
      s.h + Math.sin(time * 2.4 + s.phase) * 1.3,
      Math.sin(a) * cr);
    // face the tangent (flight direction), bank into the turn, fake a flap
    // by rolling around the flight axis
    const flap = Math.sin(time * 9 + s.phase) * 0.35;
    _e.set(0, -a, 0.45 + flap, 'YXZ');
    _q.setFromEuler(_e);
    _s.setScalar(s.scale);
    _m.compose(_p, _q, _s);
    crowRing.setMatrixAt(i, _m);
  }
  crowRing.instanceMatrix.needsUpdate = true;
  updateSwoops(dt, time);

  // distant caws, more agitated while the ring is closing
  cawTimer -= dt;
  if (cawTimer <= 0) {
    cawTimer = shrinking ? rand(0.8, 2.2) : rand(3, 7);
    AudioFX.caw(rand(0.8, 1.25), shrinking ? 0.3 : 0.16);
  }
}
