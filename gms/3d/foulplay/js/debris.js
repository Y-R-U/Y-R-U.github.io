// Parts that have left a car, plus the scrap they shed on the way. A detached
// panel keeps its own mesh — it is literally the same object that was bolted
// to the car a frame ago, which is why the damage reads so clearly.

import * as THREE from 'three';
import { scene, quality } from './render.js';
import { CRASH } from './config.js';
import { rand, clamp } from './utils.js';

const MAX_DEBRIS = 70;
const items = [];

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

export function spawnDetached(mesh, worldPos, worldQuat, vel, groundY, opts = {}) {
  if (!mesh) return null;
  mesh.parent && mesh.parent.remove(mesh);
  scene.add(mesh);
  mesh.position.copy(worldPos);
  mesh.quaternion.copy(worldQuat);
  mesh.castShadow = false;

  const item = {
    mesh,
    vel: vel.clone(),
    spin: new THREE.Vector3(rand(-6, 6), rand(-5, 5), rand(-7, 7)).multiplyScalar(opts.spin || 1),
    life: opts.life || 9,
    age: 0,
    groundY,
    mass: opts.mass || 1,
    bounced: 0,
    fade: opts.fade !== false,
  };
  items.push(item);
  trim();
  return item;
}

// Anonymous scrap — used for glass, panels shattering, chunks off a wreck.
const scrapGeo = [];
function getScrapGeo(i) {
  if (!scrapGeo.length) {
    scrapGeo.push(new THREE.BoxGeometry(0.34, 0.1, 0.28));
    scrapGeo.push(new THREE.BoxGeometry(0.2, 0.2, 0.5));
    scrapGeo.push(new THREE.TetrahedronGeometry(0.24));
  }
  return scrapGeo[i % scrapGeo.length];
}

export function spawnScrap(pos, count, color, groundY, speed = 9) {
  const n = Math.round(count * (quality.particles || 1));
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(getScrapGeo(i), new THREE.MeshLambertMaterial({ color }));
    m.material.__owned = true;
    m.position.copy(pos);
    const v = new THREE.Vector3(rand(-1, 1), rand(0.3, 1.2), rand(-1, 1)).normalize().multiplyScalar(rand(speed * 0.4, speed));
    spawnDetached(m, pos, new THREE.Quaternion(), v, groundY, { life: rand(2.4, 4.6), spin: 1.6 });
  }
}

function trim() {
  while (items.length > MAX_DEBRIS) {
    const it = items.shift();
    kill(it);
  }
}

function kill(it) {
  if (it.mesh.parent) it.mesh.parent.remove(it.mesh);
  it.mesh.traverse((o) => {
    if (o.material && o.material.__owned) o.material.dispose();
  });
  it.dead = true;
}

export function updateDebris(dt) {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    it.age += dt;

    it.vel.y -= CRASH.wreckGravity * dt;
    it.mesh.position.addScaledVector(it.vel, dt);

    _e.set(it.spin.x * dt, it.spin.y * dt, it.spin.z * dt);
    _q.setFromEuler(_e);
    it.mesh.quaternion.multiply(_q);

    if (it.mesh.position.y < it.groundY + 0.18) {
      it.mesh.position.y = it.groundY + 0.18;
      if (it.vel.y < -1.5) {
        it.vel.y = -it.vel.y * CRASH.wreckBounce;
        it.vel.x *= 0.72;
        it.vel.z *= 0.72;
        it.spin.multiplyScalar(0.6);
        it.bounced++;
      } else {
        it.vel.y = 0;
        it.vel.x *= 0.9;
        it.vel.z *= 0.9;
        it.spin.multiplyScalar(0.86);
      }
    }

    const left = it.life - it.age;
    if (it.fade && left < 1.2) {
      const k = clamp(left / 1.2, 0, 1);
      it.mesh.traverse((o) => {
        if (o.material) {
          o.material.transparent = true;
          o.material.opacity = k;
        }
      });
    }
    if (it.age >= it.life) {
      kill(it);
      items.splice(i, 1);
    }
  }
}

export function clearDebris() {
  for (const it of items) kill(it);
  items.length = 0;
}

export const debrisCount = () => items.length;
