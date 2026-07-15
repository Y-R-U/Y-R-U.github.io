// GRUDGE BUGS — particles and payoff. Explosions, jam splashes, confetti,
// shockwaves, DOM damage floaters. One pooled system, updated per frame.

import * as THREE from 'three';
import { mat } from './bugs.js';
import { $ } from './utils.js';

const T = THREE;

export class FX {
  constructor(scene, camera, dom) {
    this.scene = scene; this.camera = camera; this.dom = dom;
    this.parts = [];         // {mesh, vel, life, life0, grav, spin, shrink, fade}
    this.rings = [];         // {mesh, life, life0, grow}
    this.group = new T.Group();
    scene.add(this.group);
    this._sphereGeo = new T.SphereGeometry(1, 7, 6);
    this._quadGeo = new T.PlaneGeometry(1, 1);
  }

  _spawn(meshMat, scale, pos, vel, { life = 1, grav = -9, spin = 3, shrink = true, fade = true } = {}) {
    const m = new T.Mesh(this._sphereGeo, meshMat);
    m.scale.setScalar(scale);
    m.position.copy(pos);
    this.group.add(m);
    this.parts.push({ mesh: m, vel, life, life0: life, grav, spin, shrink, fade });
  }

  explosion(p, radius = 1.6, terra = null) {
    const pos = new T.Vector3(p.x, p.y, p.z);
    // flash
    const flash = new T.Mesh(this._sphereGeo,
      new T.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.95 }));
    flash.position.copy(pos); flash.scale.setScalar(radius * 0.4);
    this.group.add(flash);
    this.rings.push({ mesh: flash, life: 0.22, life0: 0.22, grow: radius * 5 });
    // shockwave ring
    const ring = new T.Mesh(new T.TorusGeometry(1, 0.08, 8, 32),
      new T.MeshBasicMaterial({ color: 0xffd070, transparent: true, opacity: 0.8 }));
    ring.position.copy(pos); ring.rotation.x = Math.PI / 2; ring.scale.setScalar(radius * 0.3);
    this.group.add(ring);
    this.rings.push({ mesh: ring, life: 0.5, life0: 0.5, grow: radius * 3.4 });
    // fire + smoke
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, up = Math.random();
      const sp = 2.5 + Math.random() * 4.5;
      const vel = new T.Vector3(Math.cos(a) * sp * (1 - up * 0.6), 2 + up * 5.5, Math.sin(a) * sp * (1 - up * 0.6));
      const fire = i < 7;
      this._spawn(
        mat(fire ? [0xff9a30, 0xff5a2a, 0xffd94a][i % 3] : 0x4a4642,
          fire ? { emissive: 0xff7020, emissiveIntensity: 1, flat: true } : { flat: true, opacity: 0.85 }),
        radius * (0.1 + Math.random() * 0.14), pos, vel,
        { life: fire ? 0.5 : 1.1, grav: fire ? -4 : 1.5, shrink: true });
    }
    // flying ground: dirt clods and torn grass tufts
    const clods = terra ? [terra.dirt, terra.dirt2, terra.deep, terra.grass, terra.grass2]
      : [0x8a6a3a, 0x6e4a2b, 0x54371f];
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * Math.PI * 2;
      this._spawn(mat(clods[i % clods.length], { flat: true }), 0.06 + Math.random() * 0.08, pos,
        new T.Vector3(Math.cos(a) * (3 + Math.random() * 2.5), 3 + Math.random() * 4.5, Math.sin(a) * (3 + Math.random() * 2.5)),
        { life: 1.3, grav: -13 });
    }
  }

  splash(p, color = 0x6fb3c9) {
    const pos = new T.Vector3(p.x, p.y, p.z);
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 1.2;
      this._spawn(mat(color, { opacity: 0.85, rough: 0.2 }), 0.08 + Math.random() * 0.1,
        new T.Vector3(pos.x + Math.cos(a) * r * 0.3, pos.y, pos.z + Math.sin(a) * r * 0.3),
        new T.Vector3(Math.cos(a) * r * 2.4, 4 + Math.random() * 4.5, Math.sin(a) * r * 2.4),
        { life: 1.0, grav: -12 });
    }
    const ring = new T.Mesh(new T.TorusGeometry(1, 0.1, 8, 28),
      new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 }));
    ring.position.copy(pos); ring.rotation.x = Math.PI / 2; ring.scale.setScalar(0.3);
    this.group.add(ring);
    this.rings.push({ mesh: ring, life: 0.7, life0: 0.7, grow: 3.2 });
  }

  poof(p, color = 0xd8d2c4, n = 6) {
    const pos = new T.Vector3(p.x, p.y, p.z);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this._spawn(mat(color, { opacity: 0.7 }), 0.09, pos,
        new T.Vector3(Math.cos(a) * 1.2, 1 + Math.random(), Math.sin(a) * 1.2),
        { life: 0.5, grav: 1 });
    }
  }

  confetti(center, n = 60) {
    const pos = new T.Vector3(center.x, center.y, center.z);
    const cols = [0xff5a5a, 0xffd94a, 0x8be24a, 0x5ab8ff, 0xd97fff];
    for (let i = 0; i < n; i++) {
      const m = new T.Mesh(this._quadGeo,
        new T.MeshBasicMaterial({ color: cols[i % cols.length], side: T.DoubleSide }));
      m.scale.setScalar(0.08 + Math.random() * 0.06);
      m.position.copy(pos).add(new T.Vector3((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2));
      m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      this.group.add(m);
      this.parts.push({
        mesh: m, vel: new T.Vector3((Math.random() - 0.5) * 3, 2 + Math.random() * 4, (Math.random() - 0.5) * 3),
        life: 2.6 + Math.random(), life0: 3, grav: -2.2, spin: 6, shrink: false, fade: true,
      });
    }
  }

  // DOM damage number over a world point
  floater(worldPos, text, cls = '') {
    const v = new T.Vector3(worldPos.x, worldPos.y + 0.5, worldPos.z).project(this.camera);
    if (v.z > 1) return;
    const el = document.createElement('div');
    el.className = 'dmg-float ' + cls;
    el.textContent = text;
    el.style.left = `${(v.x * 0.5 + 0.5) * this.dom.clientWidth}px`;
    el.style.top = `${(-v.y * 0.5 + 0.5) * this.dom.clientHeight}px`;
    $('bubbles').appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }

  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.group.remove(p.mesh); this.parts.splice(i, 1); continue; }
      p.vel.y += p.grav * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.spin) { p.mesh.rotation.x += p.spin * dt; p.mesh.rotation.y += p.spin * 0.7 * dt; }
      const f = p.life / p.life0;
      if (p.shrink) p.mesh.scale.setScalar(Math.max(0.001, p.mesh.scale.x * (1 - dt * 1.2)));
      if (p.fade && p.mesh.material.transparent) p.mesh.material.opacity = f;
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) { this.group.remove(r.mesh); this.rings.splice(i, 1); continue; }
      const f = 1 - r.life / r.life0;
      r.mesh.scale.setScalar(r.mesh.scale.x + r.grow * dt);
      r.mesh.material.opacity = (1 - f) * 0.85;
    }
  }

  clear() {
    for (const p of this.parts) this.group.remove(p.mesh);
    for (const r of this.rings) this.group.remove(r.mesh);
    this.parts.length = 0; this.rings.length = 0;
  }
}
