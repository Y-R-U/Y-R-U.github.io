// Parts that have left a car, plus the scrap they shed on the way. A detached
// panel keeps its own mesh — it is literally the same object that was bolted
// to the car a frame ago, which is why the damage reads so clearly.
//
// A panel that has come off is not scenery. It bounces down the road with the
// pack still coming, and anybody who drives through it pays for it: that is the
// second half of "the car falls to bits", and it is why every live panel is
// tested against every car every frame (O(debris x cars), all early-outs, no
// allocation).

import * as THREE from 'three';
import { scene, quality } from './render.js';
import { CRASH, DMG } from './config.js';
import { rand, clamp } from './utils.js';
import * as fx from './particles.js';
import { emit } from './bus.js';

const items = [];

// Who loose panels can hit. Cars add themselves as they are built, so the race
// loop does not have to know this exists; `setDebrisTargets` and the optional
// second argument to `updateDebris` both override it if it ever wants to.
const targets = [];
let pruneIn = 0;

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

export function setDebrisTargets(cars) {
  targets.length = 0;
  if (cars) for (let i = 0; i < cars.length; i++) targets.push(cars[i]);
}
export function addDebrisTarget(car) {
  if (car && targets.indexOf(car) < 0) targets.push(car);
}
export function removeDebrisTarget(car) {
  const i = targets.indexOf(car);
  if (i >= 0) targets.splice(i, 1);
}
export const debrisTargets = () => targets;

function pruneTargets() {
  for (let i = targets.length - 1; i >= 0; i--) {
    const c = targets[i];
    if (!c || c.retired || !c.mesh || !c.mesh.parent) targets.splice(i, 1);
  }
  // Belt and braces: a grid is eight cars, so anything past this is a leak from
  // somewhere that never disposed its field, and it must not become O(n) growth.
  while (targets.length > 32) targets.shift();
}

// A car's panels SHARE one `bodyMat` — ten meshes point at the same material.
// Fading a detached panel therefore used to fade every body-coloured panel on
// the car that was still driving, which read in play as the whole car flicking
// between solid and see-through. Give anything that leaves the car its own
// materials so the fade is private to the debris.
function privatiseMaterials(root) {
  root.traverse((o) => {
    if (!o.material) return;
    if (Array.isArray(o.material)) {
      o.material = o.material.map((m) => { const c = m.clone(); c.__owned = true; return c; });
    } else {
      o.material = o.material.clone();
      o.material.__owned = true;
    }
  });
}

export function spawnDetached(mesh, worldPos, worldQuat, vel, groundY, opts = {}) {
  if (!mesh) return null;
  mesh.parent && mesh.parent.remove(mesh);
  privatiseMaterials(mesh);
  scene.add(mesh);
  mesh.position.copy(worldPos);
  mesh.quaternion.copy(worldQuat);
  mesh.castShadow = false;

  const mass = opts.mass || 1;
  const item = {
    mesh,
    vel: vel.clone(),
    spin: new THREE.Vector3(rand(-6, 6), rand(-5, 5), rand(-7, 7)).multiplyScalar(opts.spin || 1),
    life: opts.life || 9,
    age: 0,
    groundY,
    mass,
    bounced: 0,
    fade: opts.fade !== false,
    // hazard bookkeeping — scrap is not dangerous, bodywork is
    hazard: !!opts.hazard,
    radius: opts.radius || (0.5 + mass * 0.45),
    owner: opts.owner || 0,
    grace: opts.grace != null ? opts.grace : 0.45,
    cool: 0,
    hits: 0,
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

// How many loose pieces this device carries at once. The RULES of when a panel
// comes off never change — a weak phone sheds bodywork exactly as readily, it
// just keeps fewer pieces lying about at the same time.
const maxItems = () => Math.round(CRASH.maxDebris * (0.6 + 0.4 * (quality.particles || 1)));

function trim() {
  // Never throw away a big panel to make room for a fragment: the panels are
  // the hazard and the thing the player is meant to be looking at.
  while (items.length > maxItems()) {
    let idx = 0;
    for (let i = 0; i < items.length; i++) {
      if (!items[i].hazard) { idx = i; break; }
    }
    kill(items[idx]);
    items.splice(idx, 1);
  }
}

function kill(it) {
  if (it.mesh.parent) it.mesh.parent.remove(it.mesh);
  it.mesh.traverse((o) => {
    if (o.material && o.material.__owned) o.material.dispose();
  });
  it.dead = true;
}

// A loose panel against the field. Called only for hazardous items that are off
// cooldown, so the common case is one squared-distance test per car.
function strikeCars(it, list) {
  const p = it.mesh.position;
  const reach = it.radius + CRASH.carLen * 0.46;
  const reach2 = reach * reach;
  for (let i = 0; i < list.length; i++) {
    const car = list[i];
    if (!car || car.retired) continue;
    const mode = car.mode;
    if (mode === 'out' || mode === 'wreck' || mode === 'grid') continue;
    if (car.invuln > 0) continue;
    if (it.owner === car.id && it.age < it.grace) continue;
    const cp = car.worldPos;
    const dy = p.y - cp.y;
    if (dy < -1.5 || dy > 2.4) continue;
    const dx = p.x - cp.x, dz = p.z - cp.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > reach2) continue;

    // How fast are the two actually converging? A panel lying still that a car
    // drives over is a clatter; one still travelling is a proper hit.
    _v.copy(it.vel).sub(car.worldVel);
    const rel = _v.length();
    const dist = Math.sqrt(d2) || 0.001;
    const nx = dx / dist, nz = dz / dist;

    _w.copy(p).addScaledVector(_v.set(nx, 0, nz), -it.radius * 0.5);
    _w.y = cp.y + 0.35;

    if (rel < CRASH.debrisMinSpeed) {
      // Clatter: noise, a few sparks, and the panel gets kicked out of the way.
      fx.sparkBurst(_w, _v.set(nx, 0.7, nz), 5, 0xffc470, 7);
      it.vel.x += nx * 5 + car.worldVel.x * 0.4;
      it.vel.z += nz * 5 + car.worldVel.z * 0.4;
      it.vel.y += 3.2;
      it.cool = CRASH.debrisCool;
      return;
    }

    // Which end of the car took it, without needing a car-space transform.
    let region = 'front';
    const fr = car.frame;
    if (fr && fr.tan && fr.right) {
      const along = dx * fr.tan.x + dy * fr.tan.y + dz * fr.tan.z;
      const side = dx * fr.right.x + dy * fr.right.y + dz * fr.right.z;
      region = Math.abs(along) >= Math.abs(side)
        ? (along > 0 ? 'front' : 'rear')
        : (side > 0 ? 'right' : 'left');
    }

    const dmg = Math.min(CRASH.debrisDamageMax, CRASH.debrisDamage * rel * (0.5 + it.mass));
    const push = Math.min(CRASH.debrisPushMax, rel * it.mass * CRASH.debrisPush);
    if (fr && fr.right && fr.tan) {
      const lat = -(nx * fr.right.x + nz * fr.right.z) * push;
      const lon = -(nx * fr.tan.x + nz * fr.tan.z) * push * 0.5;
      car.shove(lat, lon, { spin: 0.05 * push, source: 'debris' });
    }
    // A flying panel dents and tears, but it does not rip a door clean off the
    // way another car does — so it is capped short of a full-severity slam.
    car.damage(dmg, region, { source: 'debris', severity: clamp(rel / 34, 0, 0.6) });

    fx.sparkBurst(_w, _v.set(nx, 0.8, nz), Math.min(24, 8 + Math.round(rel)), 0xffb43a, 8 + rel * 0.6);
    fx.smokePuff(_w, 2, 0xcfc7ba, 1.1, 1.0);
    emit('debris:hit', { car, impact: rel, mass: it.mass });
    if (DMG) { DMG.debrisHits++; DMG.debrisDealt += dmg; }

    // The panel goes with it — cartwheeling off the bonnet, still live.
    it.vel.x = nx * (6 + rel * 0.35) + car.worldVel.x * 0.5;
    it.vel.z = nz * (6 + rel * 0.35) + car.worldVel.z * 0.5;
    it.vel.y = 4 + rel * 0.22;
    it.spin.multiplyScalar(1.5);
    it.cool = CRASH.debrisCool;
    it.hits++;
    // A hit buys it another moment on stage — but only twice, or a panel stuck
    // in the middle of the pack would never expire.
    if (it.hits <= 2) it.age = Math.max(0, it.age - 1.2);
    return;
  }
}

export function updateDebris(dt, cars) {
  const list = cars || targets;
  if (!cars) {
    pruneIn -= dt;
    if (pruneIn <= 0) { pruneIn = 2; pruneTargets(); }
  }
  const live = list.length > 0;

  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    it.age += dt;
    if (it.cool > 0) it.cool -= dt;

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
        if (it.hazard && it.bounced < 4 && Math.abs(it.vel.y) > 3) {
          fx.sparkBurst(it.mesh.position, _v.set(0, 1, 0), 5, 0xffb43a, 7);
        }
      } else {
        it.vel.y = 0;
        it.vel.x *= 0.9;
        it.vel.z *= 0.9;
        it.spin.multiplyScalar(0.86);
      }
    }

    if (it.hazard && it.cool <= 0 && live) strikeCars(it, list);

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
  pruneTargets();
}

export const debrisCount = () => items.length;
export const hazardCount = () => {
  let n = 0;
  for (let i = 0; i < items.length; i++) if (items[i].hazard) n++;
  return n;
};
