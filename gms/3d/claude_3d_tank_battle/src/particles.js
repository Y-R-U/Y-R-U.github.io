// Particle effects: debris, smoke, sparks.

import * as THREE from 'three';

export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
  }

  spawnSparks(pos, count = 10, color = 0xffd366) {
    for (let i = 0; i < count; i++) {
      const size = 0.06 + Math.random() * 0.1;
      const geom = new THREE.BoxGeometry(size, size, size * 1.6);
      const mat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 1, fog: false,
      });
      const p = new THREE.Mesh(geom, mat);
      p.position.copy(pos);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = 4 + Math.random() * 6;
      const v = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.cos(phi) * speed * 0.6 + 2,
        Math.sin(phi) * Math.sin(theta) * speed
      );
      this.particles.push({
        mesh: p, vel: v,
        rotV: new THREE.Vector3(
          (Math.random() - 0.5) * 8,
          (Math.random() - 0.5) * 8,
          (Math.random() - 0.5) * 8
        ),
        age: 0, life: 0.6 + Math.random() * 0.4,
        gravity: 18,
        drag: 1.6,
      });
      this.scene.add(p);
    }
  }

  spawnDebris(pos, count = 18, color = 0x444a52) {
    for (let i = 0; i < count; i++) {
      const size = 0.12 + Math.random() * 0.2;
      const geom = new THREE.BoxGeometry(size * 1.2, size * 0.5, size * 1.5);
      const mat = new THREE.MeshLambertMaterial({
        color: (Math.random() < 0.5) ? color : 0x222633,
        transparent: true, opacity: 1,
      });
      const p = new THREE.Mesh(geom, mat);
      p.position.copy(pos);
      p.position.y += 1;
      const theta = Math.random() * Math.PI * 2;
      const speed = 6 + Math.random() * 8;
      const v = new THREE.Vector3(
        Math.cos(theta) * speed,
        4 + Math.random() * 8,
        Math.sin(theta) * speed
      );
      this.particles.push({
        mesh: p, vel: v,
        rotV: new THREE.Vector3(
          (Math.random() - 0.5) * 12,
          (Math.random() - 0.5) * 12,
          (Math.random() - 0.5) * 12
        ),
        age: 0, life: 1.6 + Math.random() * 0.6,
        gravity: 22,
        drag: 0.6,
      });
      this.scene.add(p);
    }
  }

  spawnSmoke(pos, count = 8) {
    for (let i = 0; i < count; i++) {
      const r = 0.6 + Math.random() * 0.7;
      const geom = new THREE.SphereGeometry(r, 6, 5);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x666677,
        transparent: true, opacity: 0.55, fog: true,
      });
      const p = new THREE.Mesh(geom, mat);
      p.position.copy(pos);
      p.position.x += (Math.random() - 0.5) * 1;
      p.position.z += (Math.random() - 0.5) * 1;
      const v = new THREE.Vector3(
        (Math.random() - 0.5) * 1.5,
        1.5 + Math.random() * 2.5,
        (Math.random() - 0.5) * 1.5
      );
      this.particles.push({
        mesh: p, vel: v,
        rotV: new THREE.Vector3(0, (Math.random() - 0.5) * 1.5, 0),
        age: 0, life: 1.6 + Math.random() * 0.8,
        gravity: -2,   // float up
        drag: 1.2,
        scaleUp: 0.8,
      });
      this.scene.add(p);
    }
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      p.vel.y -= p.gravity * dt;
      p.vel.multiplyScalar(1 - p.drag * dt);
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += p.rotV.x * dt;
      p.mesh.rotation.y += p.rotV.y * dt;
      p.mesh.rotation.z += p.rotV.z * dt;
      if (p.scaleUp) p.mesh.scale.addScalar(p.scaleUp * dt);
      if (p.mesh.position.y < 0.1 && p.gravity > 0) {
        p.mesh.position.y = 0.1;
        p.vel.y = 0;
        p.vel.multiplyScalar(0.4);
      }
      const t = p.age / p.life;
      p.mesh.material.opacity = Math.max(0, (1 - t) * (p.mesh.material.opacity > 0.6 ? 1 : 0.55));
      if (p.age >= p.life) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        this.particles.splice(i, 1);
      }
    }
  }

  clear() {
    for (const p of this.particles) {
      this.scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
    }
    this.particles.length = 0;
  }
}
