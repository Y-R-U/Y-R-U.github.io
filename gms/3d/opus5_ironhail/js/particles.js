// Pooled effects: debris, flashes, shockwave rings, smoke, dust and sparks.
// Everything lives in fixed-size pools so a mortar duel never allocates.

import * as THREE from 'three';
import { actorRoot, glowBasic, lowQuality } from './render.js';
import { terrainHeight, scorchGround, deformCrater } from './terrain.js';
import { rand, lerp, clamp01 } from './utils.js';
import { addShake } from './state.js';
import { AudioFX } from './audio.js';
import { camera } from './render.js';

const debris = [];
const chunks = [];
const flashes = [];
const rings = [];
const smokes = [];
const sparks = [];

const _v = new THREE.Vector3();

export function initParticles() {
  if (debris.length) return;

  const debrisMats = [
    new THREE.MeshStandardMaterial({ color: 0x2e2a24, flatShading: true, roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: 0x4a423a, flatShading: true, roughness: 0.9 }),
    glowBasic(0xffb347, 1.5),
    glowBasic(0xff5030, 1.6),
  ];
  const boxGeo = new THREE.BoxGeometry(0.34, 0.34, 0.34);
  const n = lowQuality ? 90 : 170;
  for (let i = 0; i < n; i++) {
    const mesh = new THREE.Mesh(boxGeo, debrisMats[i % debrisMats.length]);
    mesh.visible = false;
    mesh.castShadow = false;
    actorRoot.add(mesh);
    debris.push({
      mesh, vel: new THREE.Vector3(), spin: new THREE.Vector3(),
      life: 0, maxLife: 1, active: false, bounced: 0,
    });
  }

  // Chunks are the big recognisable pieces — a slab of silo wall, a length of
  // gantry. Each keeps its own material so it can be tinted to whatever it
  // just broke off, which is the difference between "debris" and "that used to
  // be the water tower".
  const chunkGeos = [
    new THREE.BoxGeometry(1, 0.5, 1.4),
    new THREE.BoxGeometry(0.5, 1.6, 0.5),
    new THREE.TetrahedronGeometry(0.9),
    new THREE.CylinderGeometry(0.42, 0.5, 1.5, 6),
  ];
  const chunkN = lowQuality ? 16 : 34;
  for (let i = 0; i < chunkN; i++) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x8a8078, flatShading: true, roughness: 0.88, metalness: 0.05,
    });
    const mesh = new THREE.Mesh(chunkGeos[i % chunkGeos.length], mat);
    mesh.visible = false;
    mesh.castShadow = false;
    actorRoot.add(mesh);
    chunks.push({
      mesh, mat, vel: new THREE.Vector3(), spin: new THREE.Vector3(),
      life: 0, maxLife: 1, active: false, bounced: 0, s0: 1,
    });
  }

  const sphereGeo = new THREE.SphereGeometry(1, 10, 7);
  for (let i = 0; i < 14; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd9a0, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    const mesh = new THREE.Mesh(sphereGeo, mat);
    mesh.visible = false;
    actorRoot.add(mesh);
    flashes.push({ mesh, mat, life: 0, maxLife: 1, scale: 1, active: false });
  }

  const ringGeo = new THREE.RingGeometry(0.72, 1, 40);
  for (let i = 0; i < 12; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffb347, transparent: true, opacity: 0, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    const mesh = new THREE.Mesh(ringGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    actorRoot.add(mesh);
    rings.push({ mesh, mat, life: 0, maxLife: 1, scale: 1, active: false });
  }

  // a coarse sphere reads as a puff; an icosahedron reads as a grey hexagon
  const puffGeo = new THREE.SphereGeometry(1, 8, 6);
  const smokeN = lowQuality ? 44 : 92;
  for (let i = 0; i < smokeN; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x777270, transparent: true, opacity: 0, depthWrite: false,
    });
    const mesh = new THREE.Mesh(puffGeo, mat);
    mesh.visible = false;
    actorRoot.add(mesh);
    smokes.push({
      mesh, mat, life: 0, maxLife: 1, active: false,
      vel: new THREE.Vector3(), grow: 1, peak: 0.6,
    });
  }

  const sparkGeo = new THREE.BoxGeometry(0.1, 0.1, 0.7);
  const sparkMat = glowBasic(0xffdc8a, 2.2);
  const sparkN = lowQuality ? 40 : 90;
  for (let i = 0; i < sparkN; i++) {
    const mesh = new THREE.Mesh(sparkGeo, sparkMat);
    mesh.visible = false;
    actorRoot.add(mesh);
    sparks.push({ mesh, vel: new THREE.Vector3(), life: 0, maxLife: 1, active: false });
  }
}

function freeOf(pool) {
  for (let i = 0; i < pool.length; i++) if (!pool[i].active) return pool[i];
  return null;
}

// ---------------------------------------------------------------------------
// Spawners
// ---------------------------------------------------------------------------

export function spawnDebris(pos, n, spread, colourHint) {
  for (let i = 0; i < n; i++) {
    const p = freeOf(debris);
    if (!p) return;
    p.active = true;
    p.bounced = 0;
    p.mesh.visible = true;
    p.mesh.position.copy(pos);
    p.vel.set(rand(-1, 1), rand(0.35, 1.5), rand(-1, 1)).normalize()
      .multiplyScalar(rand(6, 19) * spread);
    p.spin.set(rand(-11, 11), rand(-11, 11), rand(-11, 11));
    p.maxLife = p.life = rand(1.0, 2.2);
    p.s0 = rand(0.5, 1.5) * spread;
    p.mesh.scale.setScalar(p.s0);
  }
}

// Big tumbling pieces of whatever just came apart. `colour` should be the
// prop's own so the wreckage reads as belonging to the thing that was there.
export function spawnChunks(pos, n, { colour = 0x8a8078, scale = 1, spread = 1, up = 1 } = {}) {
  for (let i = 0; i < n; i++) {
    const c = freeOf(chunks);
    if (!c) return;
    c.active = true;
    c.bounced = 0;
    c.mesh.visible = true;
    c.mesh.position.set(pos.x + rand(-1, 1) * scale, pos.y + rand(-0.4, 1.2) * scale, pos.z + rand(-1, 1) * scale);
    c.mesh.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
    c.mat.color.setHex(colour);
    c.vel.set(rand(-1, 1), rand(0.5, 1.5) * up, rand(-1, 1)).normalize()
      .multiplyScalar(rand(5, 15) * spread);
    c.spin.set(rand(-7, 7), rand(-7, 7), rand(-7, 7));
    c.maxLife = c.life = rand(3.4, 6.0);
    c.s0 = rand(0.7, 1.9) * scale;
    c.mesh.scale.setScalar(c.s0);
  }
}

export function spawnSparks(pos, n, dir, spread = 1) {
  for (let i = 0; i < n; i++) {
    const s = freeOf(sparks);
    if (!s) return;
    s.active = true;
    s.mesh.visible = true;
    s.mesh.position.copy(pos);
    s.vel.set(rand(-1, 1), rand(0, 1.2), rand(-1, 1)).normalize().multiplyScalar(rand(9, 26) * spread);
    if (dir) s.vel.addScaledVector(dir, rand(4, 14));
    s.maxLife = s.life = rand(0.16, 0.42);
  }
}

export function spawnFlash(pos, scale, hex) {
  const f = freeOf(flashes);
  if (!f) return;
  f.active = true;
  f.mesh.visible = true;
  f.mesh.position.copy(pos);
  f.scale = scale;
  f.maxLife = f.life = 0.3;
  f.mat.color.set(hex || 0xffd9a0).multiplyScalar(2.1);
}

export function spawnRing(pos, scale, hex) {
  const r = freeOf(rings);
  if (!r) return;
  r.active = true;
  r.mesh.visible = true;
  r.mesh.position.set(pos.x, Math.max(terrainHeight(pos.x, pos.z) + 0.35, pos.y - 1), pos.z);
  r.scale = scale;
  r.maxLife = r.life = 0.62;
  r.mat.color.set(hex || 0xffb347).multiplyScalar(1.7);
}

export function spawnSmoke(pos, opts = {}) {
  const s = freeOf(smokes);
  if (!s) return;
  const {
    scale = 2, life = 1.8, colour = 0x8a8580, rise = 3.2, drift = 1.2,
    opacity = 0.34, grow = 2.6,
  } = opts;
  s.active = true;
  s.mesh.visible = true;
  s.mesh.position.copy(pos);
  s.mesh.scale.setScalar(scale * 0.4);
  s.mesh.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
  s.squash = rand(0.72, 1.15);
  s.vel.set(rand(-drift, drift), rise * rand(0.7, 1.3), rand(-drift, drift));
  s.maxLife = s.life = life * rand(0.85, 1.2);
  s.grow = scale * grow;
  s.startScale = scale * 0.4;
  s.peak = opacity;
  s.mat.color.set(colour);
}

export function spawnDust(pos, strength = 1) {
  spawnSmoke(pos, {
    scale: 0.8 * strength, life: 0.9, colour: 0xb2a288, rise: 1.4,
    drift: 0.7, opacity: 0.28, grow: 3.2,
  });
}

// The big one: shell impact. Also digs the ground and scorches it.
export function spawnExplosion(pos, opts = {}) {
  const {
    scale = 1, colour = 0xffb347, craterR = 0, craterD = 0,
    smoke = true, shake = true, sound = true, debrisN = null,
  } = opts;
  const vol = volAt(pos);
  spawnFlash(pos, 2.6 * scale, colour);
  spawnRing(pos, 5.5 * scale, colour);
  spawnDebris(pos, debrisN != null ? debrisN : Math.round(6 + 7 * scale), scale * 0.9);
  spawnSparks(pos, Math.round(4 + 6 * scale), null, scale);
  if (smoke) {
    const puffs = Math.min(7, Math.round(3 + scale * 2.4));
    for (let i = 0; i < puffs; i++) {
      spawnSmoke(_v.copy(pos).add(new THREE.Vector3(rand(-1, 1), rand(0, 1.5), rand(-1, 1)).multiplyScalar(scale * 1.3)), {
        scale: 0.95 * scale, life: 1.7 + scale * 0.6, colour: 0x6e6862,
        rise: 3.4, opacity: 0.3, grow: 2.6,
      });
    }
  }
  if (craterR > 0) {
    deformCrater(pos.x, pos.z, craterR, craterD, 0.8);
  } else {
    scorchGround(pos.x, pos.z, 2 + scale, 0.35);
  }
  if (shake) addShake(0.26 * scale * vol);
  if (sound) AudioFX.boom(scale > 1.4, vol * 1.5);
}

export function volAt(pos) {
  return 1 / (1 + pos.distanceTo(camera.position) / 42);
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export function updateParticles(dt) {
  for (const p of debris) {
    if (!p.active) continue;
    p.life -= dt;
    if (p.life <= 0) { p.active = false; p.mesh.visible = false; continue; }
    p.vel.y -= 26 * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.mesh.rotation.x += p.spin.x * dt;
    p.mesh.rotation.y += p.spin.y * dt;
    p.mesh.rotation.z += p.spin.z * dt;
    const gh = terrainHeight(p.mesh.position.x, p.mesh.position.z) + 0.16;
    if (p.mesh.position.y < gh) {
      p.mesh.position.y = gh;
      if (p.bounced++ > 2) {
        p.vel.multiplyScalar(0);
        p.spin.multiplyScalar(0.2);
      } else {
        p.vel.y *= -0.36;
        p.vel.x *= 0.66;
        p.vel.z *= 0.66;
      }
    }
    // hold full size, then shrink out over the last third of the life
    const k = clamp01(p.life / p.maxLife);
    p.mesh.scale.setScalar(p.s0 * (k > 0.34 ? 1 : Math.max(0.05, k / 0.34)));
  }

  // Chunks are heavier than debris: they bounce less, roll further and hang
  // around long enough that a wrecked building leaves a mess on the ground.
  for (const c of chunks) {
    if (!c.active) continue;
    c.life -= dt;
    if (c.life <= 0) { c.active = false; c.mesh.visible = false; continue; }
    c.vel.y -= 24 * dt;
    c.mesh.position.addScaledVector(c.vel, dt);
    c.mesh.rotation.x += c.spin.x * dt;
    c.mesh.rotation.y += c.spin.y * dt;
    c.mesh.rotation.z += c.spin.z * dt;
    const gh = terrainHeight(c.mesh.position.x, c.mesh.position.z) + 0.24 * c.s0;
    if (c.mesh.position.y < gh) {
      c.mesh.position.y = gh;
      if (c.bounced++ > 1) {
        c.vel.set(0, 0, 0);
        c.spin.multiplyScalar(0.12);
      } else {
        c.vel.y *= -0.24;
        c.vel.x *= 0.5;
        c.vel.z *= 0.5;
        c.spin.multiplyScalar(0.45);
      }
    }
    const k = clamp01(c.life / c.maxLife);
    c.mesh.scale.setScalar(c.s0 * (k > 0.2 ? 1 : Math.max(0.04, k / 0.2)));
  }

  for (const f of flashes) {
    if (!f.active) continue;
    f.life -= dt;
    if (f.life <= 0) { f.active = false; f.mesh.visible = false; continue; }
    const k = 1 - f.life / f.maxLife;
    f.mesh.scale.setScalar(lerp(0.5, f.scale, Math.pow(k, 0.36)));
    f.mat.opacity = 0.95 * (1 - k);
  }

  for (const r of rings) {
    if (!r.active) continue;
    r.life -= dt;
    if (r.life <= 0) { r.active = false; r.mesh.visible = false; continue; }
    const k = 1 - r.life / r.maxLife;
    r.mesh.scale.setScalar(lerp(0.6, r.scale, Math.pow(k, 0.48)));
    r.mat.opacity = 0.8 * (1 - k);
  }

  for (const s of smokes) {
    if (!s.active) continue;
    s.life -= dt;
    if (s.life <= 0) { s.active = false; s.mesh.visible = false; continue; }
    const k = 1 - s.life / s.maxLife;
    s.vel.y *= 1 - dt * 0.6;
    s.mesh.position.addScaledVector(s.vel, dt);
    s.mesh.rotation.y += dt * 0.5;
    const sc = lerp(s.startScale, s.grow, Math.pow(k, 0.5));
    s.mesh.scale.set(sc, sc * s.squash, sc);
    s.mat.opacity = s.peak * Math.sin(Math.PI * clamp01(k * 0.92 + 0.04));
  }

  for (const s of sparks) {
    if (!s.active) continue;
    s.life -= dt;
    if (s.life <= 0) { s.active = false; s.mesh.visible = false; continue; }
    s.vel.y -= 34 * dt;
    s.mesh.position.addScaledVector(s.vel, dt);
    _v.copy(s.vel).normalize();
    s.mesh.lookAt(_v.add(s.mesh.position));
    s.mesh.scale.z = 0.5 + s.vel.length() * 0.05;
  }
}

export function clearParticles() {
  for (const pool of [debris, chunks, flashes, rings, smokes, sparks]) {
    for (const p of pool) { p.active = false; p.mesh.visible = false; }
  }
}
