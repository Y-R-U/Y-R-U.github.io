// LONGSHOT — the follow-bullet cinematic. Slow-mo chase cam that rides just
// behind the round, orbiting gently, slowing further on final approach, with
// a held beat on impact. World sim runs on the same dilated clock, so traffic
// and people crawl while the bullet flies.

import * as THREE from 'three';
import * as audio from './audio.js';
import { $ } from './utils.js';

const T = THREE;

export class BulletCam {
  constructor(scene, camera, fx) {
    this.scene = scene;
    this.camera = camera;
    this.fx = fx;
    this.active = false;
    this.bullet = this._buildBullet();
    $('bcam-skip').addEventListener('click', () => this.skip());
  }

  _buildBullet() {
    const g = new T.Group();
    const brass = new T.MeshStandardMaterial({ color: 0xc8963c, roughness: 0.3, metalness: 0.9 });
    const tip = new T.Mesh(new T.ConeGeometry(0.012, 0.04, 8), brass);
    tip.rotation.x = Math.PI / 2; tip.position.z = -0.032;
    const body = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, 0.045, 8), brass);
    body.rotation.x = Math.PI / 2;
    g.add(tip, body);
    // streak trail
    const trailGeo = new T.BufferGeometry();
    trailGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(30 * 3), 3));
    this.trail = new T.Line(trailGeo, new T.LineBasicMaterial({ color: 0xffe0b0, transparent: true, opacity: 0.5 }));
    this.trailPts = [];
    g.visible = false;
    return g;
  }

  // shot = result of ballistics.simulate ({path, hit}); onDone(shot)
  start(shot, onDone) {
    if (this.active) { onDone && onDone(shot); return; }   // never re-enter mid-flight
    this.shot = shot;
    this.onDone = onDone;
    this.active = true;
    this.watchdog = 0;
    this.ft = 0;                       // bullet flight time
    this.phase = 'fly';
    this.holdT = 0;
    this.orbit = Math.random() < 0.5 ? 1 : -1;
    this.trailPts.length = 0;
    this.scene.add(this.bullet, this.trail);
    this.bullet.visible = true;
    this.camera.fov = 58;
    this.camera.updateProjectionMatrix();
    $('bcam-skip').classList.remove('hidden');
    $('bcam-bars').classList.remove('hidden');
    audio.whooshStart();
  }

  skip() {
    if (!this.active) return;
    if (this.phase === 'fly') { this.ft = this.shot.tof; }
    else this._finish();
  }

  // returns the world time-scale while active
  timeScale() {
    if (!this.active) return 1;
    return this.phase === 'impact' ? 0.02 : 0.1;
  }

  _sample(t) {
    const path = this.shot.path;
    if (t <= 0) return path[0];
    for (let i = 1; i < path.length; i++) {
      if (path[i].t >= t) {
        const a = path[i - 1], b = path[i];
        const f = (t - a.t) / Math.max(1e-9, b.t - a.t);
        return {
          x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f,
          v: a.v + ((b.v || a.v) - (a.v || 0)) * f,
        };
      }
    }
    return path[path.length - 1];
  }

  update(dt) {
    if (!this.active) return;
    const tof = Math.max(0.05, this.shot.tof);
    this.watchdog += dt;
    if (this.watchdog > 9) return this._finish();     // never strand the player in slow-mo
    if (this.phase === 'fly') {
      // whole flight ≈3.2 s of screen time, crawling on final approach
      const baseRate = tof / 3.2;
      const remain = tof - this.ft;
      const mul = remain < 0.06 ? 0.12 : remain < 0.2 ? 0.35 : 1;
      this.ft = Math.min(tof, this.ft + dt * baseRate * mul);
      const p = this._sample(this.ft);
      const p2 = this._sample(Math.min(tof, this.ft + 0.02));
      const pos = new T.Vector3(p.x, p.y, p.z);
      const dir = new T.Vector3(p2.x - p.x, p2.y - p.y, p2.z - p.z);
      if (dir.lengthSq() < 1e-12) dir.set(0, 0, 1); else dir.normalize();
      this.bullet.position.copy(pos);
      this.bullet.lookAt(pos.clone().add(dir));
      this.bullet.rotateZ(this.ft * 40);
      // trail
      this.trailPts.unshift(pos.clone());
      if (this.trailPts.length > 30) this.trailPts.pop();
      const tp = this.trail.geometry.attributes.position;
      for (let i = 0; i < 30; i++) {
        const q = this.trailPts[Math.min(i, this.trailPts.length - 1)] || pos;
        tp.setXYZ(i, q.x, q.y, q.z);
      }
      tp.needsUpdate = true;
      this.trail.geometry.setDrawRange(0, Math.max(2, this.trailPts.length));
      // chase cam: behind-left, slow orbital drift
      const prog = this.ft / tof;
      const ang = this.orbit * (0.9 + prog * 2.2);
      const side = new T.Vector3().crossVectors(dir, new T.Vector3(0, 1, 0)).normalize();
      const camPos = pos.clone()
        .addScaledVector(dir, -1.9 - Math.sin(prog * Math.PI) * 0.7)
        .addScaledVector(side, Math.cos(ang) * 0.85)
        .add(new T.Vector3(0, 0.32 + Math.sin(ang) * 0.35, 0));
      this.camera.position.copy(camPos);
      this.camera.lookAt(pos.clone().addScaledVector(dir, 6));
      audio.whooshSet(1 - prog * 0.6);
      if (this.ft >= tof) {
        this.phase = 'impact';
        audio.whooshStop();
        const hit = this.shot.hit;
        if (hit.type === 'head' || hit.type === 'torso') audio.impactBody();
        this.bullet.visible = false;
        // pull the camera out beside the impact
        const hp = new T.Vector3(hit.point.x, hit.point.y, hit.point.z);
        const back = new T.Vector3(hit.dir.x, hit.dir.y, hit.dir.z);
        const side2 = new T.Vector3().crossVectors(back, new T.Vector3(0, 1, 0)).normalize();
        this.camera.position.copy(hp).addScaledVector(back, -3.2).addScaledVector(side2, this.orbit * 2.1).add(new T.Vector3(0, 0.8, 0));
        this.camera.lookAt(hp);
      }
    } else {
      this.holdT += dt;
      if (this.holdT > 1.15) this._finish();
    }
  }

  _finish() {
    this.active = false;
    this.scene.remove(this.bullet, this.trail);
    $('bcam-skip').classList.add('hidden');
    $('bcam-bars').classList.add('hidden');
    audio.whooshStop();
    const cb = this.onDone;
    this.onDone = null;
    cb && cb(this.shot);
  }
}
