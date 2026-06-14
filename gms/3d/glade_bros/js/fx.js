// 3D effects: fart gas puffs, search dust, "found" burst, and billboard emotes.
import * as THREE from 'three';
import { rand } from './utils.js';

let scene = null, puffTex = null;
const puffs = [];   // { sp, vx, vy, vz, t, life, grow, fromScale }
const pops = [];    // { sp, vy, t, life, fromY }

export function initFx(s) {
  scene = s;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  puffTex = new THREE.CanvasTexture(c);
}

function puff(x, y, z, color, scale, vx, vy, vz, life, grow) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color, transparent: true, depthWrite: false, opacity: 0.85 }));
  sp.position.set(x, y, z); sp.scale.setScalar(scale);
  scene.add(sp);
  puffs.push({ sp, vx, vy, vz, t: 0, life, grow, fromScale: scale });
}

export function fart(x, y, z) {
  for (let i = 0; i < 20; i++) {
    const a = rand(0, Math.PI * 2), s = rand(0.3, 1.4);
    puff(x, y, z, 0x9bd06a, rand(0.25, 0.5),
      Math.cos(a) * s, rand(0.5, 1.3), Math.sin(a) * s,
      rand(1.0, 1.7), rand(1.4, 2.4));
  }
}
export function lookPuff(x, y, z) {
  for (let i = 0; i < 7; i++) {
    const a = rand(0, Math.PI * 2), s = rand(0.4, 1.0);
    puff(x, y, z, 0xe8e2d6, 0.22, Math.cos(a) * s, rand(0.3, 0.8), Math.sin(a) * s, 0.5, 1.6);
  }
}
export function burst(x, y, z, color = 0xffd95e) {
  for (let i = 0; i < 14; i++) {
    const a = rand(0, Math.PI * 2), s = rand(0.6, 2.0);
    puff(x, y, z, color, 0.3, Math.cos(a) * s, rand(0.6, 1.8), Math.sin(a) * s, 0.8, 2.0);
  }
}

export function makeEmojiSprite(char, scale = 1.1) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.font = '96px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(char, 64, 70);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.setScalar(scale);
  return sp;
}

export function pop(x, y, z, char) {
  const sp = makeEmojiSprite(char, 0.7);
  sp.position.set(x, y, z);
  scene.add(sp);
  pops.push({ sp, t: 0, life: 1.3, fromY: y });
}

export function updateFx(dt) {
  for (let i = puffs.length - 1; i >= 0; i--) {
    const p = puffs[i]; p.t += dt;
    const k = p.t / p.life;
    p.sp.position.x += p.vx * dt; p.sp.position.y += p.vy * dt; p.sp.position.z += p.vz * dt;
    p.vy *= 0.94; p.vx *= 0.93; p.vz *= 0.93;
    p.sp.scale.setScalar(p.fromScale * (1 + k * p.grow));
    p.sp.material.opacity = 0.85 * (1 - k);
    if (k >= 1) { scene.remove(p.sp); p.sp.material.dispose(); puffs.splice(i, 1); }
  }
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i]; p.t += dt;
    const k = p.t / p.life;
    p.sp.position.y = p.fromY + k * 0.9;
    p.sp.material.opacity = 1 - k * k;
    p.sp.scale.setScalar(0.7 + k * 0.3);
    if (k >= 1) { scene.remove(p.sp); p.sp.material.dispose(); pops.splice(i, 1); }
  }
}
