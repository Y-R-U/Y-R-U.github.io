// fx.js — particles, shockwaves, floating numbers and screen shake.

import * as THREE from 'three';
import { TAU, clamp } from './utils.js';

const MAX_P = 520;

export class FX {
  constructor(scene, camera, domLayer, opts) {
    this.scene = scene;
    this.camera = camera;
    this.dom = domLayer;
    this.lite = !!(opts && opts.lite);
    this.shakeAmt = 0;
    this.shakeT = 0;

    // ── particles ──
    const pos = new Float32Array(MAX_P * 3);
    const col = new Float32Array(MAX_P * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setDrawRange(0, 0);
    this.pMat = new THREE.PointsMaterial({ size: 0.7, vertexColors: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.points = new THREE.Points(g, this.pMat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
    scene.add(this.points);
    this.parts = [];
    for (let i = 0; i < MAX_P; i++) this.parts.push({ live: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, r: 1, g: 1, b: 1 });

    // ── shockwave rings ──
    this.rings = [];
    const rg = new THREE.RingGeometry(0.9, 1.0, 44);
    rg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide, fog: false,
      }));
      m.visible = false;
      m.renderOrder = 7;
      scene.add(m);
      this.rings.push({ mesh: m, t: 0, dur: 1, r0: 1, r1: 4, live: false });
    }

    // ── floating text ──
    this.pops = [];
    for (let i = 0; i < 18; i++) {
      const el = document.createElement('div');
      el.className = 'fx-pop';
      el.style.display = 'none';
      domLayer.appendChild(el);
      this.pops.push({ el, live: false, t: 0, dur: 1, v: new THREE.Vector3(), rise: 1 });
    }
    this._v = new THREE.Vector3();
  }

  burst(x, y, z, color, count, speed, spread) {
    if (this.lite) count = Math.ceil(count * 0.4);
    const c = new THREE.Color(color);
    let made = 0;
    for (let i = 0; i < this.parts.length && made < count; i++) {
      const p = this.parts[i];
      if (p.live) continue;
      const a = Math.random() * TAU;
      const el = Math.random() * (spread == null ? 0.9 : spread);
      const s = speed * (0.4 + Math.random() * 0.9);
      p.live = true;
      p.x = x; p.y = y; p.z = z;
      p.vx = Math.cos(a) * Math.cos(el) * s;
      p.vy = Math.sin(el) * s + 1.5;
      p.vz = Math.sin(a) * Math.cos(el) * s;
      p.life = 0; p.max = 0.5 + Math.random() * 0.7;
      p.r = c.r; p.g = c.g; p.b = c.b;
      made++;
    }
  }

  ring(x, y, z, color, r0, r1, dur) {
    for (const r of this.rings) {
      if (r.live) continue;
      r.live = true; r.t = 0; r.dur = dur || 0.55; r.r0 = r0; r.r1 = r1;
      r.mesh.position.set(x, y + 0.12, z);
      r.mesh.material.color.set(color);
      r.mesh.visible = true;
      return;
    }
  }

  pop(text, x, y, z, cls) {
    for (const p of this.pops) {
      if (p.live) continue;
      p.live = true; p.t = 0; p.dur = 1.1;
      p.v.set(x, y, z);
      p.el.textContent = text;
      p.el.className = 'fx-pop ' + (cls || '');
      p.el.style.display = 'block';
      return;
    }
  }

  shake(amt) { this.shakeAmt = Math.min(1.6, this.shakeAmt + amt); }

  update(dt, w, h) {
    // particles
    const pos = this.points.geometry.attributes.position;
    const col = this.points.geometry.attributes.color;
    let n = 0;
    for (const p of this.parts) {
      if (!p.live) continue;
      p.life += dt;
      if (p.life >= p.max) { p.live = false; continue; }
      p.vy -= 16 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vx *= 1 - 1.6 * dt; p.vz *= 1 - 1.6 * dt;
      const f = 1 - p.life / p.max;
      pos.setXYZ(n, p.x, p.y, p.z);
      col.setXYZ(n, p.r * f, p.g * f, p.b * f);
      n++;
    }
    pos.needsUpdate = true; col.needsUpdate = true;
    this.points.geometry.setDrawRange(0, n);

    // rings
    for (const r of this.rings) {
      if (!r.live) continue;
      r.t += dt;
      const t = r.t / r.dur;
      if (t >= 1) { r.live = false; r.mesh.visible = false; continue; }
      const s = r.r0 + (r.r1 - r.r0) * (1 - (1 - t) * (1 - t));
      r.mesh.scale.set(s, 1, s);
      r.mesh.material.opacity = (1 - t) * 0.85;
    }

    // floating text
    for (const p of this.pops) {
      if (!p.live) continue;
      p.t += dt;
      const t = p.t / p.dur;
      if (t >= 1) { p.live = false; p.el.style.display = 'none'; continue; }
      this._v.copy(p.v);
      this._v.y += t * 4.5;
      this._v.project(this.camera);
      if (this._v.z > 1) { p.el.style.display = 'none'; continue; }
      p.el.style.display = 'block';
      p.el.style.left = ((this._v.x * 0.5 + 0.5) * w) + 'px';
      p.el.style.top = ((-this._v.y * 0.5 + 0.5) * h) + 'px';
      p.el.style.opacity = String(clamp(1 - (t - 0.55) / 0.45, 0, 1));
      p.el.style.transform = `translate(-50%,-50%) scale(${1 + Math.min(0.35, t * 1.6)})`;
    }

    // shake decay
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.6);
    this.shakeT += dt * 42;
  }

  applyShake(camera) {
    if (this.shakeAmt <= 0.001) return;
    const a = this.shakeAmt;
    camera.position.x += Math.sin(this.shakeT * 1.7) * a * 0.6;
    camera.position.y += Math.cos(this.shakeT * 2.3) * a * 0.5;
    camera.position.z += Math.sin(this.shakeT * 1.1 + 2) * a * 0.6;
  }

  reset() {
    for (const p of this.parts) p.live = false;
    for (const r of this.rings) { r.live = false; r.mesh.visible = false; }
    for (const p of this.pops) { p.live = false; p.el.style.display = 'none'; }
    this.shakeAmt = 0;
    this.points.geometry.setDrawRange(0, 0);
  }

  dispose() {
    this.scene.remove(this.points);
    this.points.geometry.dispose(); this.pMat.dispose();
    for (const r of this.rings) { this.scene.remove(r.mesh); r.mesh.material.dispose(); }
    for (const p of this.pops) p.el.remove();
  }
}
