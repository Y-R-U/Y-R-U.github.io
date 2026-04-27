// Bullet system + collision against tanks.

import * as THREE from 'three';
import { CFG } from './config.js';

const _segD = new THREE.Vector3();
const _segAB = new THREE.Vector3();
const _prevPos = new THREE.Vector3();
const _hitCenter = new THREE.Vector3();
function distPointToSegment(p0, p1, c) {
  _segAB.subVectors(p1, p0);
  const lenSq = _segAB.lengthSq();
  if (lenSq < 1e-6) return c.distanceTo(p0);
  const t = Math.max(0, Math.min(1, _segD.subVectors(c, p0).dot(_segAB) / lenSq));
  _segD.copy(p0).addScaledVector(_segAB, t);
  return _segD.distanceTo(c);
}

// Shared bullet geometry/material so each spawn doesn't allocate.
const BULLET_GEOM = new THREE.CylinderGeometry(
  CFG.bullet.radius, CFG.bullet.radius, 0.9, 6
);
BULLET_GEOM.rotateX(Math.PI / 2);
const BULLET_MAT = new THREE.MeshBasicMaterial({
  color: CFG.bullet.color, fog: false,
});
// Tracer line (a tail behind the bullet head)
const TRACER_MAT = new THREE.LineBasicMaterial({
  color: 0xffe890, transparent: true, opacity: 0.85, fog: false,
});

const _qSpawn = new THREE.Quaternion();
const _vFwd = new THREE.Vector3(0, 0, 1);

export class BulletSystem {
  constructor(scene, particles) {
    this.scene = scene;
    this.particles = particles;
    this.bullets = [];
    this.muzzleFlash = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 1.6),
      new THREE.MeshBasicMaterial({
        color: 0xffdc88, transparent: true, opacity: 0,
        depthWrite: false, fog: false,
      })
    );
    this.muzzleFlash.renderOrder = 10;
    scene.add(this.muzzleFlash);
    this.muzzleLight = new THREE.PointLight(0xffcc66, 0, 8, 2);
    scene.add(this.muzzleLight);
    this.flashTime = 0;
  }

  // Spawns a bullet from world position with a unit dir. Owner is the firing tank.
  spawn(worldPos, dir, owner, camera) {
    const mesh = new THREE.Mesh(BULLET_GEOM, BULLET_MAT);
    mesh.position.copy(worldPos);
    _qSpawn.setFromUnitVectors(_vFwd, dir);
    mesh.quaternion.copy(_qSpawn);
    this.scene.add(mesh);

    // Tracer line behind the bullet (re-built each frame in update).
    const tracerGeom = new THREE.BufferGeometry();
    tracerGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const tracer = new THREE.Line(tracerGeom, TRACER_MAT);
    tracer.frustumCulled = false;
    this.scene.add(tracer);

    this.bullets.push({
      mesh, tracer, tracerGeom,
      dir: dir.clone(), age: 0, owner,
      damage: CFG.bullet.damage,
      trailHead: worldPos.clone(),
    });

    // Muzzle flash from this shot
    if (camera) {
      this.muzzleFlash.position.copy(worldPos).addScaledVector(dir, 0.6);
      this.muzzleFlash.lookAt(camera.position);
    } else {
      this.muzzleFlash.position.copy(worldPos);
    }
    this.muzzleFlash.material.opacity = 1;
    this.flashTime = 0.08;
    this.muzzleLight.position.copy(worldPos);
    this.muzzleLight.intensity = 5;
  }

  // tanks: array of Tank with .alive, .root (group), .takeDamage(d, attacker)
  update(dt, tanks) {
    const step = CFG.bullet.speed * dt;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      const prev = _prevPos.copy(b.mesh.position);
      b.mesh.position.addScaledVector(b.dir, step);
      b.age += dt;

      // Update tracer line: from a fixed-length tail behind the bullet to the bullet.
      const tailLen = Math.min(2.6, b.age * CFG.bullet.speed); // grow until it's full length
      const arr = b.tracerGeom.attributes.position.array;
      arr[0] = b.mesh.position.x - b.dir.x * tailLen;
      arr[1] = b.mesh.position.y - b.dir.y * tailLen;
      arr[2] = b.mesh.position.z - b.dir.z * tailLen;
      arr[3] = b.mesh.position.x;
      arr[4] = b.mesh.position.y;
      arr[5] = b.mesh.position.z;
      b.tracerGeom.attributes.position.needsUpdate = true;

      if (b.age > CFG.bullet.lifetime) {
        this._dispose(i);
        continue;
      }

      // ground hit — only check after a tiny grace period so spawning at slope
      // doesn't insta-kill when the muzzle is briefly low.
      if (b.age > 0.04 && b.mesh.position.y < 0.2) {
        this.particles.spawnSparks(b.mesh.position.clone(), 4, 0xffd366);
        this._dispose(i);
        continue;
      }

      // tank collision
      let hit = null;
      for (const t of tanks) {
        if (!t.alive) continue;
        if (t === b.owner) continue;
        _hitCenter.copy(t.root.position);
        _hitCenter.y += 1.0;
        const d = distPointToSegment(prev, b.mesh.position, _hitCenter);
        if (d < CFG.bullet.hitRadius) { hit = t; break; }
      }
      if (hit) {
        hit.takeDamage(b.damage, b.owner, this.particles);
        this.particles.spawnSparks(b.mesh.position.clone(), 8, 0xffd366);
        this._dispose(i);
      }
    }

    // muzzle flash decay
    if (this.flashTime > 0) {
      this.flashTime -= dt;
      const t = Math.max(0, this.flashTime / 0.08);
      this.muzzleFlash.material.opacity = t;
      this.muzzleFlash.scale.setScalar(1 + (1 - t) * 1.2);
      this.muzzleLight.intensity = 5 * t;
    } else {
      this.muzzleFlash.material.opacity = 0;
      this.muzzleLight.intensity = 0;
    }
  }

  _dispose(i) {
    const b = this.bullets[i];
    this.scene.remove(b.mesh);
    if (b.tracer) {
      this.scene.remove(b.tracer);
      b.tracerGeom.dispose();
    }
    // mesh uses shared BULLET_GEOM/BULLET_MAT — do NOT dispose.
    this.bullets.splice(i, 1);
  }

  clear() {
    while (this.bullets.length) this._dispose(this.bullets.length - 1);
  }
}
