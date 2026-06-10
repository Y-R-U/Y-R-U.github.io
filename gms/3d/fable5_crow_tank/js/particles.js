// Pooled particles: tumbling feathers, additive sparks, ground dust puffs.

import * as THREE from 'three';
import { scene } from './world.js';
import { rand } from './utils.js';

const free = { feather: [], spark: [], dust: [] };
const active = [];

const featherGeo = new THREE.TetrahedronGeometry(0.16);
const sparkGeo = new THREE.BoxGeometry(0.14, 0.14, 0.4);
const dustGeo = new THREE.SphereGeometry(1, 7, 5);

function makeMesh(type) {
  if (type === 'feather') {
    return new THREE.Mesh(featherGeo, new THREE.MeshStandardMaterial({
      color: 0x1a1c24, flatShading: true, roughness: 1,
      transparent: true, opacity: 1 }));
  }
  if (type === 'spark') {
    return new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({
      color: 0xff5030, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false }));
  }
  return new THREE.Mesh(dustGeo, new THREE.MeshStandardMaterial({
    color: 0x6a5430, flatShading: true, roughness: 1,
    transparent: true, opacity: 0.5 }));
}

function spawn(type, pos, vel, life, scale) {
  const mesh = free[type].pop() || makeMesh(type);
  mesh.position.copy(pos);
  mesh.scale.setScalar(scale);
  mesh.rotation.set(rand(0, Math.PI), rand(0, Math.PI), rand(0, Math.PI));
  mesh.visible = true;
  if (!mesh.parent) scene.add(mesh);
  active.push({
    type, mesh, vel, life, maxLife: life, baseScale: scale,
    spin: new THREE.Vector3(rand(-7, 7), rand(-7, 7), rand(-7, 7)),
  });
}

export function featherBurst(pos, count = 10, scale = 1) {
  for (let i = 0; i < count; i++) {
    spawn('feather', pos, new THREE.Vector3(
      rand(-6, 6), rand(0, 7), rand(-6, 6)), rand(0.7, 1.4), scale * rand(0.7, 1.3));
  }
}

export function sparkBurst(pos, count = 12, color = 0xff5030) {
  for (let i = 0; i < count; i++) {
    spawn('spark', pos, new THREE.Vector3(
      rand(-11, 11), rand(-7, 11), rand(-11, 11)), rand(0.25, 0.55), rand(0.7, 1.5));
    const p = active[active.length - 1];
    p.mesh.material.color.setHex(color).multiplyScalar(1.7);
  }
}

export function dustPuff(pos, scale = 1) {
  for (let i = 0; i < 3; i++) {
    spawn('dust', pos, new THREE.Vector3(rand(-1.5, 1.5), rand(0.5, 1.5), rand(-1.5, 1.5)),
      rand(0.5, 0.8), scale * rand(0.5, 0.9));
  }
}

export function updateParticles(dt) {
  for (let i = active.length - 1; i >= 0; i--) {
    const p = active[i];
    p.life -= dt;
    if (p.life <= 0) {
      p.mesh.visible = false;
      free[p.type].push(p.mesh);
      active.splice(i, 1);
      continue;
    }
    const k = p.life / p.maxLife;
    p.mesh.position.addScaledVector(p.vel, dt);
    if (p.type === 'feather') {
      p.vel.y -= 14 * dt;            // feathers flutter down
      p.vel.multiplyScalar(1 - 1.6 * dt);
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.z += p.spin.z * dt;
      p.mesh.material.opacity = Math.min(1, k * 2.5);
      if (p.mesh.position.y < 0.08) p.mesh.position.y = 0.08;
    } else if (p.type === 'spark') {
      p.vel.y -= 22 * dt;
      p.mesh.material.opacity = k;
      p.mesh.scale.setScalar(p.baseScale * (0.4 + k * 0.6));
    } else {
      p.mesh.material.opacity = 0.45 * k;
      p.mesh.scale.setScalar(p.baseScale * (1 + (1 - k) * 2.4));
    }
  }
}

export function clearParticles() {
  for (let i = active.length - 1; i >= 0; i--) {
    const p = active[i];
    p.mesh.visible = false;
    free[p.type].push(p.mesh);
  }
  active.length = 0;
}
