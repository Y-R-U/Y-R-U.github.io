// LONGSHOT — visual effects: impact bursts, glass shards, tracers, muzzle
// flash, scope glint. Small self-managed particle systems.

import * as THREE from 'three';

const T = THREE;

function radialTex(inner, outer) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, inner); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new T.CanvasTexture(cv);
}

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.live = [];
    this.puffTex = radialTex('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)');
    this.glintTex = radialTex('rgba(255,255,255,1)', 'rgba(160,220,255,0)');
  }

  burst(point, { n = 14, color = 0xbbb5a8, speed = 6, up = 4, size = 0.5, life = 0.7, gravity = 9 } = {}) {
    const pos = new Float32Array(n * 3), vel = [];
    for (let i = 0; i < n; i++) {
      pos.set([point.x, point.y, point.z], i * 3);
      const a = Math.random() * Math.PI * 2, r = Math.random() * speed;
      vel.push(new T.Vector3(Math.cos(a) * r, Math.random() * up, Math.sin(a) * r));
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    const mat = new T.PointsMaterial({
      map: this.puffTex, color, size, transparent: true, opacity: 0.9,
      depthWrite: false, blending: T.NormalBlending,
    });
    const pts = new T.Points(geo, mat);
    this.scene.add(pts);
    this.live.push({ kind: 'burst', pts, vel, life, age: 0, gravity });
  }

  impactConcrete(point) { this.burst(point, { n: 16, color: 0xa9a294, speed: 5, up: 5, size: 0.6 }); }
  impactBody(point) { this.burst(point, { n: 12, color: 0x8c1410, speed: 3.2, up: 2.5, size: 0.42, life: 0.55 }); }
  impactGround(point) { this.burst(point, { n: 14, color: 0x6f6a5c, speed: 5, up: 6, size: 0.7 }); }

  glassShatter(rec) {
    rec.pane.visible = false;
    const n = 26, c = rec.centre;
    const pos = new Float32Array(n * 3), vel = [];
    for (let i = 0; i < n; i++) {
      pos.set([
        c.x + (Math.random() - 0.5) * rec.w * 0.8,
        c.y + (Math.random() - 0.5) * rec.h * 0.8,
        c.z,
      ], i * 3);
      vel.push(new T.Vector3(rec.nrm.x * (1 + Math.random() * 2) + (Math.random() - 0.5),
        -Math.random() * 2, rec.nrm.z * (1 + Math.random() * 2) + (Math.random() - 0.5)));
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    const mat = new T.PointsMaterial({
      color: 0xcfe8f4, size: 0.32, transparent: true, opacity: 0.95, depthWrite: false,
    });
    const pts = new T.Points(geo, mat);
    this.scene.add(pts);
    this.live.push({ kind: 'burst', pts, vel, life: 1.6, age: 0, gravity: 14 });
  }

  // fading trajectory line
  tracer(path, color = 0xffd9a0) {
    const step = Math.max(1, Math.floor(path.length / 60));
    const pts = [];
    for (let i = 0; i < path.length; i += step) pts.push(new T.Vector3(path[i].x, path[i].y, path[i].z));
    const geo = new T.BufferGeometry().setFromPoints(pts);
    const mat = new T.LineBasicMaterial({ color, transparent: true, opacity: 0.55 });
    const line = new T.Line(geo, mat);
    this.scene.add(line);
    this.live.push({ kind: 'fade', obj: line, life: 0.6, age: 0 });
  }

  muzzleFlash(camera) {
    const s = new T.Sprite(new T.SpriteMaterial({
      map: this.glintTex, color: 0xffd9a0, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    }));
    s.scale.setScalar(0.5);
    s.position.set(0.32, -0.22, -1.6);
    camera.add(s);
    this.live.push({ kind: 'fade', obj: s, life: 0.08, age: 0, parent: camera });
  }

  glint(pos) {
    const s = new T.Sprite(new T.SpriteMaterial({
      map: this.glintTex, color: 0xbfe8ff, transparent: true, depthWrite: false,
      blending: T.AdditiveBlending, sizeAttenuation: false,
    }));
    s.position.copy(pos);
    s.scale.setScalar(0.014);
    this.scene.add(s);
    const rec = { kind: 'glint', obj: s, age: 0, life: Infinity };
    this.live.push(rec);
    return {
      remove: () => { rec.life = -1; },
    };
  }

  bulletHole(point) {
    const s = new T.Sprite(new T.SpriteMaterial({ color: 0x14161a, transparent: true, opacity: 0.85, depthWrite: false }));
    s.position.set(point.x, point.y, point.z);
    s.scale.setScalar(0.25);
    this.scene.add(s);
    this.live.push({ kind: 'fade', obj: s, life: 30, age: 0 });
  }

  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const e = this.live[i];
      e.age += dt;
      if (e.kind === 'burst') {
        const p = e.pts.geometry.attributes.position;
        for (let j = 0; j < e.vel.length; j++) {
          const v = e.vel[j];
          v.y -= e.gravity * dt;
          p.setXYZ(j, p.getX(j) + v.x * dt, Math.max(0.03, p.getY(j) + v.y * dt), p.getZ(j) + v.z * dt);
        }
        p.needsUpdate = true;
        e.pts.material.opacity = Math.max(0, 0.9 * (1 - e.age / e.life));
        if (e.age >= e.life) {
          this.scene.remove(e.pts); e.pts.geometry.dispose(); e.pts.material.dispose();
          this.live.splice(i, 1);
        }
      } else if (e.kind === 'fade') {
        const m = e.obj.material;
        if (m) m.opacity = Math.max(0, (m.userData.o0 ?? (m.userData.o0 = m.opacity)) * (1 - e.age / e.life));
        if (e.age >= e.life) {
          (e.parent || this.scene).remove(e.obj);
          e.obj.geometry && e.obj.geometry.dispose();
          m && m.dispose();
          this.live.splice(i, 1);
        }
      } else if (e.kind === 'glint') {
        e.obj.material.opacity = 0.55 + Math.sin(e.age * 5.2) * 0.45;
        if (e.life < 0) {
          this.scene.remove(e.obj); e.obj.material.dispose();
          this.live.splice(i, 1);
        }
      }
    }
  }

  dispose() {
    for (const e of this.live) {
      const obj = e.pts || e.obj;
      (e.parent || this.scene).remove(obj);
      obj.geometry && obj.geometry.dispose();
      obj.material && obj.material.dispose();
    }
    this.live = [];
  }
}
