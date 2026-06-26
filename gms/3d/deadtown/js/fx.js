// Combat feedback: RuneScape-style hit splats, feather bursts, health bars,
// and ranged projectiles (arrows, fireballs).

import * as THREE from 'three';
import { rand, M, mesh } from './utils.js';

let scene = null;
const actives = []; // { obj, tick(dt) -> alive }

export function initFx(s) { scene = s; }

export function tickFx(dt) {
  for (let i = actives.length - 1; i >= 0; i--) {
    if (!actives[i].tick(dt)) {
      scene.remove(actives[i].obj);
      actives[i].dispose?.();
      actives.splice(i, 1);
    }
  }
}

// ── hit splat: red blob + white damage number, always on top ──

export function splat(pos, dmg) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#b3221a';
  for (const [x, y, r] of [[64, 64, 40], [38, 58, 26], [90, 58, 26], [64, 88, 26], [64, 38, 24]]) {
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#fff';
  g.font = '800 58px -apple-system, "Segoe UI", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(dmg, 64, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthTest: false, depthWrite: false,
  }));
  sp.scale.set(0.5, 0.5, 1);
  sp.position.copy(pos);
  sp.renderOrder = 999;
  scene.add(sp);
  let age = 0;
  actives.push({
    obj: sp,
    tick(dt) {
      age += dt;
      sp.position.y += dt * 0.55;
      sp.material.opacity = age < 0.55 ? 1 : 1 - (age - 0.55) / 0.4;
      return age < 0.95;
    },
    dispose() { tex.dispose(); sp.material.dispose(); },
  });
}

// ── feather burst ──

const featherGeo = new THREE.PlaneGeometry(0.085, 0.05);

export function feathers(pos, tint) {
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(featherGeo, new THREE.MeshBasicMaterial({
      color: i % 2 ? tint : 0xfff6e8, side: THREE.DoubleSide, transparent: true,
    }));
    m.position.copy(pos).add(new THREE.Vector3(rand(-0.1, 0.1), rand(0, 0.15), rand(-0.1, 0.1)));
    m.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    const vel = new THREE.Vector3(rand(-1, 1), rand(1.2, 2.4), rand(-1, 1));
    const spin = rand(4, 9);
    scene.add(m);
    let age = 0;
    actives.push({
      obj: m,
      tick(dt) {
        age += dt;
        vel.y -= 5.5 * dt;
        vel.multiplyScalar(1 - 1.6 * dt);
        m.position.addScaledVector(vel, dt);
        m.rotation.x += spin * dt; m.rotation.z += spin * 0.6 * dt;
        m.material.opacity = 1 - age / 0.85;
        return age < 0.85 && m.position.y > -1;
      },
      dispose() { m.material.dispose(); },
    });
  }
}

// ── projectiles ──

let glowTex = null;
function getGlowTex() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,220,150,1)');
  grad.addColorStop(0.4, 'rgba(255,160,60,0.55)');
  grad.addColorStop(1, 'rgba(255,120,30,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

function glowSprite(scl, opacity = 1) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: getGlowTex(), transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  sp.scale.set(scl, scl, 1);
  return sp;
}

// Dart projectile (arrow / crossbow bolt): flies from→to along a slight
// arc, then calls onArrive.
function launchDart(from, to, onArrive, { len, speed, arcK }) {
  const g = new THREE.Group();
  const shaft = mesh(new THREE.CylinderGeometry(0.011, 0.011, len, 4).rotateX(Math.PI / 2), M(0x8a6340), 0, 0, 0, false);
  g.add(shaft);
  g.add(mesh(new THREE.ConeGeometry(0.024, 0.08, 4).rotateX(Math.PI / 2), M(0x9aa6b8, { metalness: 0.5, roughness: 0.4 }), 0, 0, len * 0.56, false));
  for (const rot of [0, Math.PI / 2]) {
    const f = mesh(new THREE.PlaneGeometry(0.05, 0.08), M(0xe8e2d0, { side: THREE.DoubleSide }), 0, 0, -len * 0.44, false);
    f.rotation.z = rot;
    g.add(f);
  }
  g.position.copy(from);
  scene.add(g);
  const dist = from.distanceTo(to);
  const arcH = Math.min(0.45, dist * arcK);
  let s = 0;
  const cur = new THREE.Vector3(), next = new THREE.Vector3();
  const at = (u, out) => {
    out.lerpVectors(from, to, u);
    out.y += 4 * arcH * u * (1 - u);
    return out;
  };
  actives.push({
    obj: g,
    tick(dt) {
      s += (speed * dt) / Math.max(dist, 0.001);
      if (s >= 1) { onArrive?.(); return false; }
      at(s, cur);
      at(Math.min(s + 0.04, 1), next);
      g.position.copy(cur);
      g.lookAt(next);
      return true;
    },
  });
}

export const arrow = (from, to, onArrive) => launchDart(from, to, onArrive, { len: 0.5, speed: 15, arcK: 0.05 });
// crossbow bolt: stubbier, faster, near-flat trajectory
export const bolt = (from, to, onArrive) => launchDart(from, to, onArrive, { len: 0.32, speed: 19, arcK: 0.012 });

// Glowing orb with a fading trail; small flash burst on arrival.
export function fireball(from, to, onArrive) {
  const g = new THREE.Group();
  const core = mesh(new THREE.SphereGeometry(0.085, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe08a }), 0, 0, 0, false);
  core.material.userData.noWire = true;
  g.add(core);
  g.add(glowSprite(0.55, 0.9));
  g.position.copy(from);
  scene.add(g);
  const dist = from.distanceTo(to);
  const speed = 9;
  let s = 0, trailT = 0;
  actives.push({
    obj: g,
    tick(dt) {
      s += (speed * dt) / Math.max(dist, 0.001);
      if (s >= 1) {
        burst(to);
        onArrive?.();
        return false;
      }
      g.position.lerpVectors(from, to, s);
      g.position.y += Math.sin(s * 18) * 0.03; // flicker wobble
      core.scale.setScalar(1 + Math.sin(s * 40) * 0.15);
      trailT += dt;
      if (trailT > 0.05) { trailT = 0; puff(g.position); }
      return true;
    },
  });
}

function puff(pos) {
  const sp = glowSprite(0.3, 0.5);
  sp.position.copy(pos);
  scene.add(sp);
  let age = 0;
  actives.push({
    obj: sp,
    tick(dt) {
      age += dt;
      const k = age / 0.3;
      sp.scale.setScalar(0.3 * (1 - k * 0.6));
      sp.material.opacity = 0.5 * (1 - k);
      return k < 1;
    },
    dispose() { sp.material.dispose(); },
  });
}

function burst(pos) {
  const sp = glowSprite(0.3, 1);
  sp.position.copy(pos);
  scene.add(sp);
  let age = 0;
  actives.push({
    obj: sp,
    tick(dt) {
      age += dt;
      const k = age / 0.28;
      sp.scale.setScalar(0.3 + k * 1.3);
      sp.material.opacity = 1 - k;
      return k < 1;
    },
    dispose() { sp.material.dispose(); },
  });
}

// ── gun feedback: bullet tracer + muzzle flash ──

const tracerMat = new THREE.LineBasicMaterial({ color: 0xfff0b0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });

// a fast fading streak from->to (instant-hit weapons)
export function tracer(from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
  const line = new THREE.Line(geo, tracerMat.clone());
  line.material.userData.noWire = true;
  line.renderOrder = 5;
  scene.add(line);
  let age = 0;
  actives.push({
    obj: line,
    tick(dt) { age += dt; line.material.opacity = 1 - age / 0.09; return age < 0.09; },
    dispose() { geo.dispose(); line.material.dispose(); },
  });
}

export function muzzleFlash(pos) {
  const sp = glowSprite(0.7, 1);
  sp.position.copy(pos);
  scene.add(sp);
  let age = 0;
  actives.push({
    obj: sp,
    tick(dt) { age += dt; const k = age / 0.07; sp.scale.setScalar(0.7 * (1 - k * 0.4)); sp.material.opacity = 1 - k; return k < 1; },
    dispose() { sp.material.dispose(); },
  });
}

// blood spray when a zombie is hit (a few dark-red specks)
const bloodGeo = new THREE.SphereGeometry(0.045, 5, 4);
export function blood(pos, dir) {
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(bloodGeo, new THREE.MeshBasicMaterial({ color: 0x7a1410 }));
    m.position.copy(pos);
    const v = new THREE.Vector3(rand(-1, 1), rand(0.5, 2), rand(-1, 1));
    if (dir) v.addScaledVector(dir, 2.2);
    scene.add(m);
    let age = 0;
    actives.push({
      obj: m,
      tick(dt) { age += dt; v.y -= 8 * dt; m.position.addScaledVector(v, dt); return age < 0.5 && m.position.y > 0; },
      dispose() { m.material.dispose(); },
    });
  }
}

// ── floating health bar (attached to a parent, redrawn on hit) ──

export function makeHealthBar(parent, yOff = 0.78) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 10;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthTest: false, depthWrite: false,
  }));
  sp.scale.set(0.62, 0.1, 1);
  sp.position.y = yOff;
  sp.renderOrder = 998;
  sp.visible = false;
  parent.add(sp);
  let hideT = 0;
  return {
    set(frac) {
      g.clearRect(0, 0, 64, 10);
      g.fillStyle = '#1c0d08'; g.fillRect(0, 0, 64, 10);
      g.fillStyle = '#a01818'; g.fillRect(1, 1, 62, 8);
      g.fillStyle = '#3fae3f'; g.fillRect(1, 1, Math.round(62 * Math.max(frac, 0)), 8);
      tex.needsUpdate = true;
      sp.visible = frac > 0 && frac < 1;
      hideT = 4;
    },
    hide() { sp.visible = false; },
    tick(dt) {
      if (sp.visible && (hideT -= dt) <= 0) sp.visible = false;
    },
    dispose() { sp.parent?.remove(sp); tex.dispose(); sp.material.dispose(); },
  };
}
