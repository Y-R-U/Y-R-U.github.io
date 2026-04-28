import * as THREE from 'three';
import { SHELL_RADIUS, TUNING } from './config.js';

const shellGeometry = new THREE.SphereGeometry(SHELL_RADIUS, 10, 8);
const blastGeometry = new THREE.TetrahedronGeometry(0.34, 0);

export function createShell(owner, origin, direction) {
  const material = new THREE.MeshStandardMaterial({
    color: owner.accent,
    emissive: owner.accent,
    emissiveIntensity: 1.8,
    roughness: 0.35
  });
  const mesh = new THREE.Mesh(shellGeometry, material);
  mesh.position.copy(origin);
  mesh.castShadow = true;
  return {
    ownerId: owner.id,
    mesh,
    velocity: direction.clone().multiplyScalar(TUNING.shellSpeed),
    life: TUNING.shellLife,
    age: 0,
    radius: SHELL_RADIUS
  };
}

export function createExplosion(position, color) {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92 });
  for (let i = 0; i < 10; i += 1) {
    const shard = new THREE.Mesh(blastGeometry, material.clone());
    const angle = (i / 10) * Math.PI * 2;
    shard.position.set(Math.cos(angle) * 0.3, Math.random() * 0.45, Math.sin(angle) * 0.3);
    shard.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    shard.userData.velocity = new THREE.Vector3(Math.cos(angle), Math.random() * 0.8 + 0.2, Math.sin(angle)).multiplyScalar(4 + Math.random() * 4);
    group.add(shard);
  }
  group.position.copy(position);
  return { group, age: 0, life: 0.55 };
}
