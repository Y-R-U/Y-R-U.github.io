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
  crowRing = new THREE.InstancedMesh(buildCrowGeo(), crowMat, CROW_COUNT);
  crowRing.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(crowRing);

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

  // distant caws, more agitated while the ring is closing
  cawTimer -= dt;
  if (cawTimer <= 0) {
    cawTimer = shrinking ? rand(0.8, 2.2) : rand(3, 7);
    AudioFX.caw(rand(0.8, 1.25), shrinking ? 0.3 : 0.16);
  }
}
