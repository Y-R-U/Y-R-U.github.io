// hazards.js — planetary defences. They cannot kill you, but they can knock
// your audience loose, which in this job is the same thing.

import * as THREE from 'three';
import { HAZARD, TIER_R } from './config.js';
import { domeY } from './world.js';
import { TAU, makeRng, clamp } from './utils.js';

const lam = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
const bas = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: o != null, opacity: o == null ? 1 : o, fog: false });

function buildTurret(accent) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.6, 1.2, 8), lam(0x3a3f4a));
  base.position.y = 0.6; g.add(base);
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 1.6, 8), lam(0x2a2e36));
  ped.position.y = 2.0; g.add(ped);
  const head = new THREE.Group();
  head.position.y = 3.0;
  const box = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.5, 2.8), lam(0x4a505e));
  head.add(box);
  const bar1 = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 3.4, 6), lam(0x22252c));
  bar1.rotation.x = Math.PI / 2; bar1.position.set(-0.55, 0.1, 1.9); head.add(bar1);
  const bar2 = bar1.clone(); bar2.position.x = 0.55; head.add(bar2);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), bas(accent));
  eye.position.set(0, 0.75, 0.9); head.add(eye);
  g.add(head);
  g.userData.head = head;
  g.userData.eye = eye;
  return g;
}

function buildPylon(accent) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.0, 1.0, 6), lam(0x33384a));
  base.position.y = 0.5; g.add(base);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.0, 8.0, 6), lam(0x454b62));
  shaft.position.y = 5.0; g.add(shaft);
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * TAU;
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5.0, 1.4), lam(0x2a2e3c));
    fin.position.set(Math.cos(a) * 1.1, 3.6, Math.sin(a) * 1.1);
    fin.rotation.y = -a; g.add(fin);
  }
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 0), bas(accent));
  orb.position.y = 9.8; g.add(orb);
  g.userData.orb = orb;
  return g;
}

function buildDrone(accent) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0, 0), lam(0x3c4250));
  g.add(body);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), bas(0xff4a3a));
  eye.position.z = 0.85; g.add(eye);
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * TAU;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.14, 0.3), lam(0x22252c));
    arm.position.set(Math.cos(a) * 1.1, 0, Math.sin(a) * 1.1);
    arm.rotation.y = -a; g.add(arm);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.09, 4, 10), bas(accent, 0.9));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(Math.cos(a) * 1.8, 0, Math.sin(a) * 1.8);
    g.add(ring);
  }
  g.userData.eye = eye;
  return g;
}

export class Hazards {
  constructor(scene, sector, level, opts) {
    this.scene = scene;
    this.sector = sector;
    this.list = [];
    this.bolts = [];
    this.opts = opts || {};
    const n = level.hazards | 0;
    if (!n) return;
    const rng = makeRng(sector.spec.seed ^ 0xbeef);
    const accent = sector.th.accent;
    const R = sector.R;

    const nTurret = n + 1;
    const nPylon = Math.max(0, n - 1);
    const nDrone = Math.max(0, n - 1);

    for (let i = 0; i < nTurret; i++) {
      const a = rng() * TAU, d = R * rng.range(0.18, 0.9);
      this._add('turret', buildTurret(accent), Math.cos(a) * d, Math.sin(a) * d, {
        tier: 5, cd: rng() * HAZARD.TURRET_CD, hp: 1,
      });
    }
    for (let i = 0; i < nPylon; i++) {
      const a = rng() * TAU, d = R * rng.range(0.2, 0.72);
      const h = this._add('pylon', buildPylon(accent), Math.cos(a) * d, Math.sin(a) * d, { tier: 4 });
      // dome showing the protected volume
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(HAZARD.PYLON_RADIUS, 20, 10, 0, TAU, 0, Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.075, side: THREE.DoubleSide, depthWrite: false, fog: false })
      );
      dome.position.set(h.x, domeY(h.x, h.z), h.z);
      dome.scale.y = 0.42;
      scene.add(dome);
      h.dome = dome;
      this._shield(h, true);
    }
    for (let i = 0; i < nDrone; i++) {
      const a = rng() * TAU, d = R * rng.range(0.3, 0.85);
      this._add('drone', buildDrone(accent), Math.cos(a) * d, Math.sin(a) * d, { tier: 3, fly: 6 + rng() * 3 });
    }
  }

  _add(kind, mesh, x, z, extra) {
    const h = Object.assign({ kind, mesh, x, z, dead: false, r: kind === 'turret' ? 2.6 : kind === 'pylon' ? 3.0 : 2.0 }, extra);
    h.y = domeY(x, z);
    mesh.position.set(x, h.y, z);
    if (kind === 'drone') mesh.position.y += h.fly;
    if (this.opts.shadows) mesh.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.scene.add(mesh);
    this.list.push(h);
    return h;
  }

  _shield(pylon, on) {
    this.sector.grid.query(pylon.x, pylon.z, HAZARD.PYLON_RADIUS, (p) => {
      const d = Math.hypot(p.x - pylon.x, p.z - pylon.z);
      if (d <= HAZARD.PYLON_RADIUS) p.shielded = on;
    });
    // props are only re-gridded when they move, so sweep the full list once
    if (!on) {
      for (const p of this.sector.props) {
        if (!p.shielded) continue;
        let still = false;
        for (const h of this.list) {
          if (h.dead || h.kind !== 'pylon') continue;
          if (Math.hypot(p.x - h.x, p.z - h.z) <= HAZARD.PYLON_RADIUS) { still = true; break; }
        }
        p.shielded = still;
      }
    }
  }

  update(dt, player, cb) {
    const ph = player;
    for (const h of this.list) {
      if (h.dead) continue;
      // swallowed?
      if (ph && ph.alive) {
        const d = Math.hypot(ph.x - h.x, ph.z - h.z);
        if (d < ph.radius * 0.95 + h.r * 0.5 && ph.radius >= TIER_R[h.tier]) {
          this.destroy(h, cb);
          continue;
        }
      }
      if (h.kind === 'turret') {
        const d = ph ? Math.hypot(ph.x - h.x, ph.z - h.z) : 1e9;
        const head = h.mesh.userData.head;
        if (ph && d < HAZARD.TURRET_RANGE && ph.radius >= HAZARD.TURRET_MIN_R) {
          const want = Math.atan2(ph.x - h.x, ph.z - h.z);
          head.rotation.y += ((((want - head.rotation.y + Math.PI) % TAU) + TAU) % TAU - Math.PI) * Math.min(1, dt * 4);
          h.cd -= dt;
          if (h.cd <= 0) {
            h.cd = HAZARD.TURRET_CD;
            this._fire(h, ph, cb);
          }
        } else {
          head.rotation.y += dt * 0.4;
        }
        const eye = h.mesh.userData.eye;
        eye.material.opacity = 1;
        eye.scale.setScalar(1 + Math.sin(performance.now() * 0.006) * 0.2);
      } else if (h.kind === 'drone') {
        if (!ph || !ph.alive) continue;
        const dx = ph.x - h.x, dz = ph.z - h.z;
        const d = Math.hypot(dx, dz) || 1;
        if (d < 60) {
          h.x += (dx / d) * HAZARD.DRONE_SPEED * dt;
          h.z += (dz / d) * HAZARD.DRONE_SPEED * dt;
        }
        h.y = domeY(h.x, h.z);
        h.mesh.position.set(h.x, h.y + h.fly + Math.sin(performance.now() * 0.003) * 0.5, h.z);
        h.mesh.rotation.y = Math.atan2(dx, dz);
        if (d < ph.radius + 2.4) {
          this.destroy(h, cb, true);
          if (cb && cb.onHit) cb.onHit(h, 0.7);
        }
      } else if (h.kind === 'pylon') {
        const orb = h.mesh.userData.orb;
        orb.rotation.y += dt * 1.2; orb.rotation.x += dt * 0.6;
        if (h.dome) h.dome.material.opacity = 0.06 + Math.sin(performance.now() * 0.002) * 0.02;
      }
    }

    // bolts
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.t += dt;
      b.mesh.position.x += b.vx * dt;
      b.mesh.position.z += b.vz * dt;
      b.mesh.position.y = domeY(b.mesh.position.x, b.mesh.position.z) + 3;
      const target = b.target;
      if (target && target.alive) {
        const d = Math.hypot(target.x - b.mesh.position.x, target.z - b.mesh.position.z);
        if (d < Math.max(2.5, target.radius * 0.8)) {
          if (cb && cb.onHit) cb.onHit(b.src, 1);
          this._killBolt(i);
          continue;
        }
      }
      if (b.t > 3.2) this._killBolt(i);
    }
  }

  _fire(h, target, cb) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), bas(0xff6a3a));
    m.position.set(h.x, h.y + 3.2, h.z);
    this.scene.add(m);
    const dx = target.x - h.x, dz = target.z - h.z;
    const d = Math.hypot(dx, dz) || 1;
    this.bolts.push({ mesh: m, vx: (dx / d) * HAZARD.BOLT_SPEED, vz: (dz / d) * HAZARD.BOLT_SPEED, t: 0, target, src: h });
    if (cb && cb.onFire) cb.onFire(h);
  }

  _killBolt(i) {
    const b = this.bolts[i];
    this.scene.remove(b.mesh);
    b.mesh.geometry.dispose(); b.mesh.material.dispose();
    this.bolts.splice(i, 1);
  }

  destroy(h, cb, silent) {
    if (h.dead) return;
    h.dead = true;
    this.scene.remove(h.mesh);
    if (h.dome) { this.scene.remove(h.dome); h.dome.geometry.dispose(); h.dome.material.dispose(); }
    if (h.kind === 'pylon') this._shield(h, false);
    if (cb && cb.onHazardDown) cb.onHazardDown(h, silent);
  }

  aliveCount(kind) {
    return this.list.filter((h) => !h.dead && (!kind || h.kind === kind)).length;
  }

  dispose() {
    for (const h of this.list) {
      this.scene.remove(h.mesh);
      if (h.dome) { this.scene.remove(h.dome); h.dome.geometry.dispose(); h.dome.material.dispose(); }
      h.mesh.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    }
    while (this.bolts.length) this._killBolt(this.bolts.length - 1);
    this.list.length = 0;
  }
}
