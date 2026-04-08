'use strict';
/* ── collectible.js ── Collectibles + particle burst system ── */

class Collectible {
  constructor(scene, x, z, special = false) {
    this.scene     = scene;
    this.special   = special;
    this.collected = false;
    this._t        = Math.random() * Math.PI * 2; // phase offset for bob

    const color = special ? COLORS.special : COLORS.collectible;
    const r     = special ? B_RAD.collectible * 1.4 : B_RAD.collectible;

    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(r, 9, 7),
      new THREE.MeshPhongMaterial({
        color,
        shininess: 90,
        emissive:  color,
        emissiveIntensity: 0.3,
      })
    );
    this.mesh.position.set(x, B_RAD.collectible, z);
    this.mesh.castShadow = true;
    scene.add(this.mesh);
  }

  update(dt) {
    this._t += dt;
    // Bob up and down, spin
    this.mesh.position.y = B_RAD.collectible + 0.5 + Math.sin(this._t * 2.5) * 0.35;
    this.mesh.rotation.y += dt * 2.0;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

// ── Particle system ──────────────────────────────────────────────────────────
// Shared small geometry (never disposed, reused)
const _pGeo = new THREE.SphereGeometry(0.18, 5, 4);

// Active particle pool
const _particles = [];

function spawnParticles(scene, x, y, z, color, count = 8) {
  for (let i = 0; i < count; i++) {
    const mat  = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
    const mesh = new THREE.Mesh(_pGeo, mat);
    mesh.position.set(x, y, z);

    const angle = Math.random() * Math.PI * 2;
    const elev  = (Math.random() - 0.25) * Math.PI;
    const spd   = 3 + Math.random() * 5;
    const vel   = {
      x: Math.cos(angle) * Math.cos(elev) * spd,
      y: Math.sin(elev) * spd + 1,
      z: Math.sin(angle) * Math.cos(elev) * spd,
    };
    const maxLife = 0.45 + Math.random() * 0.25;
    _particles.push({ mesh, vel, life: maxLife, maxLife });
    scene.add(mesh);
  }
}

function updateParticles(scene, dt) {
  for (let i = _particles.length - 1; i >= 0; i--) {
    const p = _particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      scene.remove(p.mesh);
      p.mesh.material.dispose();
      _particles.splice(i, 1);
      continue;
    }
    p.mesh.position.x += p.vel.x * dt;
    p.mesh.position.y += p.vel.y * dt;
    p.mesh.position.z += p.vel.z * dt;
    p.vel.y -= 9 * dt; // gravity
    p.mesh.material.opacity = p.life / p.maxLife;
  }
}

function clearParticles(scene) {
  for (const p of _particles) {
    scene.remove(p.mesh);
    p.mesh.material.dispose();
  }
  _particles.length = 0;
}
