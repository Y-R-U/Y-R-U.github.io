// Pooled debris / flash / shockwave-ring effects.

import * as THREE from 'three';
import { scene, camera, glowBasic } from './world.js';
import { AudioFX } from './audio.js';
import { rand, lerp } from './utils.js';
import { addShake } from './state.js';

const debrisPool = [];
const flashPool = [];
const ringPool = [];

export function initParticles() {
  const debrisMats = [
    new THREE.MeshStandardMaterial({ color: 0x2a2418, flatShading: true, roughness: 0.8 }),
    glowBasic(0xffb347, 1.5),
    glowBasic(0xff5030, 1.6),
    glowBasic(0xffe14d, 1.4),
  ];
  const boxGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
  for (let i = 0; i < 80; i++) {
    const mesh = new THREE.Mesh(boxGeo, debrisMats[i % debrisMats.length]);
    mesh.visible = false;
    scene.add(mesh);
    debrisPool.push({ mesh, vel: new THREE.Vector3(), rot: new THREE.Vector3(),
      life: 0, maxLife: 1, active: false });
  }

  const sphereGeo = new THREE.SphereGeometry(1, 8, 6);
  for (let i = 0; i < 10; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xffd9a0).multiplyScalar(2.0),
      transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.Mesh(sphereGeo, mat);
    mesh.visible = false;
    scene.add(mesh);
    flashPool.push({ mesh, mat, life: 0, maxLife: 1, scale: 1, active: false });
  }

  const ringGeo = new THREE.RingGeometry(0.75, 1, 40);
  for (let i = 0; i < 10; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xffb347).multiplyScalar(1.6),
      transparent: true, opacity: 0, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.Mesh(ringGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    scene.add(mesh);
    ringPool.push({ mesh, mat, life: 0, maxLife: 1, scale: 1, active: false });
  }
}

export function spawnDebris(pos, n, spread) {
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

export function spawnFlash(pos, scale, hex) {
  const f = flashPool.find((x) => !x.active);
  if (!f) return;
  f.active = true;
  f.mesh.visible = true;
  f.mesh.position.copy(pos);
  f.scale = scale;
  f.maxLife = f.life = 0.28;
  f.mat.color.set(hex || 0xffd9a0).multiplyScalar(2.0);
}

export function spawnRing(pos, scale, hex) {
  const r = ringPool.find((x) => !x.active);
  if (!r) return;
  r.active = true;
  r.mesh.visible = true;
  r.mesh.position.copy(pos);
  r.mesh.position.y = Math.max(0.1, pos.y);
  r.scale = scale;
  r.maxLife = r.life = 0.55;
  r.mat.color.set(hex || 0xffb347).multiplyScalar(1.6);
}

// Volume falls off with distance from the camera so far fights sound far.
function volAt(pos) {
  return 1 / (1 + pos.distanceTo(camera.position) / 35);
}

export function spawnExplosion(pos, scale, hex) {
  spawnFlash(pos, 2.2 * scale, hex);
  spawnDebris(pos, Math.round(8 + 5 * scale), scale);
  spawnRing(pos, 5 * scale, hex);
  addShake(0.22 * scale * volAt(pos));
  AudioFX.boom(scale > 1.6, volAt(pos) * 1.6);
}

export function updateParticles(dt) {
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
    p.mesh.scale.setScalar(Math.max(0.02, p.life / p.maxLife));
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

export function clearParticles() {
  for (const p of debrisPool) { p.active = false; p.mesh.visible = false; }
  for (const f of flashPool) { f.active = false; f.mesh.visible = false; }
  for (const r of ringPool) { r.active = false; r.mesh.visible = false; }
}
