// hole.js — a micro-singularity: its look, its pull, and the swallow physics.
// The player and every rival streamer use this same class.

import * as THREE from 'three';
import { HOLE, TIER_R, VIEW, WORLD } from './config.js';
import { domeY } from './world.js';
import { TAU, clamp, damp, lerp } from './utils.js';

const DOME_K = 1 / (2 * WORLD.DOME);

/** radius for a given effective mass */
export function radiusForMass(m) {
  return HOLE.R0 * Math.pow(1 + Math.max(0, m) / HOLE.M0, HOLE.P);
}
export function massForRadius(r) {
  return (Math.pow(r / HOLE.R0, 1 / HOLE.P) - 1) * HOLE.M0;
}
export function tierForRadius(r) {
  let t = 0;
  for (let i = 1; i < TIER_R.length; i++) if (r >= TIER_R[i]) t = i;
  return t;
}

/**
 * Bend a unit-radius disc/ring onto the planet dome. `s` is the mesh's xz
 * scale, so local coords times s are the true world offsets from (cx,cz);
 * mesh.scale.y stays 1 so the y we write here is already in metres.
 */
function curveTo(geo, base, cx, cz, s) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = base[i * 2] * s, v = base[i * 2 + 1] * s;
    p.setY(i, -(2 * cx * u + u * u + 2 * cz * v + v * v) * DOME_K);
  }
  p.needsUpdate = true;
}

function baseXZ(geo) {
  const p = geo.attributes.position;
  const a = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { a[i * 2] = p.getX(i); a[i * 2 + 1] = p.getZ(i); }
  return a;
}

export class Hole {
  constructor(scene, opts) {
    this.scene = scene;
    this.isPlayer = !!opts.isPlayer;
    this.name = opts.name || 'YOU';
    this.x = opts.x || 0;
    this.z = opts.z || 0;
    this.mass = opts.mass || 0;
    this.bonusMass = 0;              // from hype — never lets you shrink below `mass`
    this.radius = radiusForMass(this.mass);
    this.tier = tierForRadius(this.radius);
    this.alive = true;
    this.speedMul = 1;
    this.radiusMul = 1;
    this.pullMul = 1;
    this.stun = 0;
    this.vx = 0; this.vz = 0;
    this.colA = new THREE.Color(opts.colA != null ? opts.colA : 0xff7a2a);
    this.colB = new THREE.Color(opts.colB != null ? opts.colB : 0xffe08a);
    this.t = 0;
    this._buildMesh(opts.simple);
  }

  _buildMesh(simple) {
    const g = new THREE.Group();
    // the void itself
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(1, 48),
      new THREE.MeshBasicMaterial({ color: 0x000000, fog: false })
    );
    disc.geometry.rotateX(-Math.PI / 2);
    disc.renderOrder = 2;
    this.discBase = baseXZ(disc.geometry);
    g.add(disc);
    this.disc = disc;

    // accretion ring
    const ringGeo = new THREE.RingGeometry(0.98, 1.35, 56, 1);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: this.colA, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.renderOrder = 3;
    this.ringBase = baseXZ(ringGeo);
    g.add(ring);
    this.ring = ring;

    // outer haze
    const hazeGeo = new THREE.RingGeometry(1.3, 2.4, 48, 1);
    hazeGeo.rotateX(-Math.PI / 2);
    const haze = new THREE.Mesh(hazeGeo, new THREE.MeshBasicMaterial({
      color: this.colB, transparent: true, opacity: 0.14,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
    }));
    haze.renderOrder = 1;
    this.hazeBase = baseXZ(hazeGeo);
    g.add(haze);
    this.haze = haze;

    if (!simple) {
      // swirling debris motes caught at the event horizon
      const N = 46;
      const pos = new Float32Array(N * 3);
      const col = new Float32Array(N * 3);
      this.motes = [];
      for (let i = 0; i < N; i++) {
        this.motes.push({ a: Math.random() * TAU, r: 1.0 + Math.random() * 0.9, s: 0.7 + Math.random() * 1.8, y: Math.random() * 0.5 });
        const c = Math.random() < 0.5 ? this.colA : this.colB;
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      const pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      pg.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const pm = new THREE.PointsMaterial({ size: 0.42, vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      const pts = new THREE.Points(pg, pm);
      pts.renderOrder = 4;
      pts.frustumCulled = false;
      g.add(pts);
      this.points = pts;

      // vertical light shaft — reads as "the beam is on"
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.55, 1.0, 26, 12, 1, true),
        new THREE.MeshBasicMaterial({ color: this.colB, transparent: true, opacity: 0.055, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })
      );
      shaft.position.y = 13;
      shaft.renderOrder = 1;
      g.add(shaft);
      this.shaft = shaft;
    }

    this.group = g;
    this.scene.add(g);
    this.syncMesh();
  }

  setSkin(a, b) {
    this.colA.setHex(a); this.colB.setHex(b);
    this.ring.material.color.copy(this.colA);
    this.haze.material.color.copy(this.colB);
    if (this.shaft) this.shaft.material.color.copy(this.colB);
    if (this.points) {
      const col = this.points.geometry.attributes.color;
      for (let i = 0; i < col.count; i++) {
        const c = i % 2 ? this.colA : this.colB;
        col.setXYZ(i, c.r, c.g, c.b);
      }
      col.needsUpdate = true;
    }
  }

  /** effective mass includes the hype bonus; radius never drops below mass-only */
  setHypeBonus(bonus) { this.bonusMass = Math.max(0, bonus); }

  recalc() {
    const r = radiusForMass(this.mass + this.bonusMass) * this.radiusMul;
    this.radius = r;
    this.tier = tierForRadius(r);
  }

  addMass(v) { this.mass += v; this.recalc(); }

  get speed() { return HOLE.BASE_SPEED * Math.pow(this.radius, HOLE.SPEED_EXP) * this.speedMul; }

  syncMesh() {
    const r = this.radius;
    const rr = this._ringR || r;
    const y = domeY(this.x, this.z);
    this.group.position.set(this.x, y + 0.04, this.z);
    this.disc.scale.set(r, 1, r);
    this.ring.scale.set(rr, 1, rr);
    this.haze.scale.set(r, 1, r);
    if (this.shaft) this.shaft.scale.set(r, Math.max(0.5, r * 0.25), r);
    curveTo(this.disc.geometry, this.discBase, this.x, this.z, r);
    curveTo(this.ring.geometry, this.ringBase, this.x, this.z, rr);
    curveTo(this.haze.geometry, this.hazeBase, this.x, this.z, r);
  }

  updateVisual(dt, tScale) {
    this.t += dt;
    const r = this.radius;
    const puls = 1 + Math.sin(this.t * 3.1) * 0.03;
    this._ringR = r * puls;
    // (no Y rotation: the rings are radially symmetric, and spinning them would
    //  spin the dome curvature baked into their vertices)
    this.ring.material.opacity = (0.75 + Math.sin(this.t * 5) * 0.12) * (this.stun > 0 ? 0.35 : 1);
    this.haze.material.opacity = 0.10 + Math.sin(this.t * 2.2) * 0.03;
    if (this.points) {
      const p = this.points.geometry.attributes.position;
      for (let i = 0; i < this.motes.length; i++) {
        const m = this.motes[i];
        m.a += dt * m.s * 2.4;
        m.r -= dt * 0.28 * m.s;
        if (m.r < 0.25) { m.r = 1.05 + Math.random() * 0.9; m.a = Math.random() * TAU; }
        p.setXYZ(i, Math.cos(m.a) * m.r * r, 0.25 + m.y * r * 0.1, Math.sin(m.a) * m.r * r);
      }
      p.needsUpdate = true;
      this.points.material.size = clamp(0.28 + r * 0.05, 0.28, 1.4);
    }
    this.syncMesh();
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
}

// ── swallow physics ─────────────────────────────────────────────────────────

const _up = new THREE.Vector3(0, 1, 0);

/**
 * Pull, capture and sink everything this hole can reach.
 * cb = { onCapture(prop), onSwallow(prop), onNearMiss(prop) }
 */
export function runCapture(hole, sector, dt, cb) {
  if (!hole.alive) return;
  const R = hole.radius;
  const reach = R * HOLE.PULL_RANGE * hole.pullMul;
  const grid = sector.grid;
  grid.query(hole.x, hole.z, reach + 6, (p) => {
    if (p.dead || p.state >= 2) return;
    const dx = hole.x - p.x, dz = hole.z - p.z;
    const dist = Math.hypot(dx, dz) || 0.0001;
    const canEat = TIER_R[p.tier] <= R && !p.shielded;
    if (canEat) {
      const grab = R * HOLE.CAPTURE + p.r * 0.25;
      if (dist < grab) {
        p.state = 2;
        p.sinkT = 0;
        p.sinkHole = hole;
        p.sinkA = Math.atan2(p.z - hole.z, p.x - hole.x);
        p.sinkR = dist;
        p.sinkY = p.y;
        p.tiltDir = Math.atan2(dz, dx);
        if (cb && cb.onCapture) cb.onCapture(p, hole);
        return;
      }
      if (dist < reach) {
        const w = (1 - dist / reach);
        const f = HOLE.PULL_FORCE * w * w * dt * (1 + R * 0.05);
        p.x += (dx / dist) * f;
        p.z += (dz / dist) * f;
        p.tiltAmt = w * 0.18;
        p.tiltDir = Math.atan2(dz, dx);
        grid.remove(p); grid.insert(p);
        sector.field.write(p);
      } else if (p.tiltAmt > 0 && !p.mover) {
        p.tiltAmt = Math.max(0, p.tiltAmt - dt * 0.6);
        sector.field.write(p);
      }
    } else {
      // too big to take — rattle it and let the player feel the near miss
      const touch = R + p.r;
      if (dist < touch) {
        p.shake = 0.32;
        if (!p.nearMissed && p.tier <= hole.tier + 2) {
          p.nearMissed = true;
          if (cb && cb.onNearMiss) cb.onNearMiss(p, hole);
        }
      } else if (dist > touch * 1.7) {
        p.nearMissed = false;
      }
    }
  });
}

/** Advance every prop currently spiralling into a hole. */
export function updateSinking(sector, dt, cb) {
  const props = sector.props;
  for (let i = 0; i < props.length; i++) {
    const p = props[i];
    if (p.dead) continue;
    if (p.shake > 0) {
      p.shake = Math.max(0, p.shake - dt * 1.6);
      p.tiltAmt = Math.sin(performance.now() * 0.045) * p.shake * 0.05;
      sector.field.write(p);
    }
    if (p.state !== 2) continue;
    const h = p.sinkHole;
    p.sinkT += dt / HOLE.SINK_TIME;
    const t = Math.min(1, p.sinkT);
    const e = t * t;
    p.sinkA += dt * (7 + 10 / Math.max(1, h.radius));
    const rr = p.sinkR * (1 - e);
    p.x = h.x + Math.cos(p.sinkA) * rr;
    p.z = h.z + Math.sin(p.sinkA) * rr;
    p.y = p.sinkY - e * (p.h * 0.9 + h.radius * 0.6);
    p.tiltAmt = e * 1.35;
    p.tiltDir = p.sinkA + Math.PI / 2;
    p.scale = p.baseScale * (1 - e * 0.35);
    p.rot += dt * 2.4;
    sector.field.write(p);
    if (t >= 1) {
      sector.kill(p);
      if (cb && cb.onSwallow) cb.onSwallow(p, h);
    }
  }
}
