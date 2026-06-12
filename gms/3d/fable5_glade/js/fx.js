// Combat feedback: RuneScape-style hit splats, feather bursts, health bars.

import * as THREE from 'three';
import { rand } from './utils.js';

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
  };
}
