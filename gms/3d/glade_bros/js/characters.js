// Brother entities: a low-poly kid built from primitives, pathed movement with
// A*, WASD nudging, a walk cycle, and a hidden state.
import * as THREE from 'three';
import { CFG } from './config.js';
import { lerpAngle, M, mesh } from './utils.js';
import { tileToWorld, worldToTile, isFloor, nearestFloor } from './grid.js';
import { findPath } from './pathfind.js';

function canStand(x, z) {
  const r = CFG.bodyR;
  for (const [ox, oz] of [[-r, -r], [r, -r], [-r, r], [r, r], [0, 0]]) {
    const t = worldToTile(x + ox, z + oz);
    if (!isFloor(t.c, t.r)) return false;
  }
  return true;
}

export class Brother {
  constructor(bro, role, isHuman) {
    this.bro = bro;
    this.role = role;
    this.isHuman = isHuman;
    this.pos = { x: 0, z: 0 };
    this.path = [];
    this.angle = 0;
    this.speed = CFG.walkSpeed;
    this.hidden = false; this.spot = null; this.frozen = false;
    this.moving = false; this.anim = 0; this.bob = 0;
    this.nudgeDir = null;
    const built = buildModel(bro);
    this.group = built.group;
    this.parts = built.parts;
    this._head = new THREE.Vector3();
  }

  setTile(c, r) {
    const w = tileToWorld(c, r);
    this.pos.x = w.x; this.pos.z = w.z; this.path = [];
    this.group.rotation.y = this.angle;
    this.sync();
  }
  get tile() { return worldToTile(this.pos.x, this.pos.z); }

  goTo(c, r) {
    const t = this.tile, dest = nearestFloor(c, r);
    const tiles = findPath(t.c, t.r, dest.c, dest.r);
    this.path = tiles.slice(1).map(n => tileToWorld(n.c, n.r));
    return this.path.length > 0 || (dest.c === t.c && dest.r === t.r);
  }
  goToSpot(s) { return this.goTo(s.c, s.r); }
  stop() { this.path = []; }
  get arrived() { return this.path.length === 0; }
  atTile(c, r) { const t = this.tile; return t.c === c && t.r === r; }

  update(dt) {
    let moved = false;
    if (!this.frozen && !this.hidden) {
      const nd = this.nudgeDir;
      if (nd && (nd.x || nd.z)) {
        this.path = [];
        const sp = this.speed * dt;
        if (canStand(this.pos.x + nd.x * sp, this.pos.z)) this.pos.x += nd.x * sp;
        if (canStand(this.pos.x, this.pos.z + nd.z * sp)) this.pos.z += nd.z * sp;
        this.angle = Math.atan2(nd.x, nd.z);
        moved = true;
      } else if (this.path.length) {
        const wp = this.path[0];
        const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z, d = Math.hypot(dx, dz);
        if (d < CFG.reachEps) { this.path.shift(); }
        else {
          const sp = Math.min(this.speed * dt, d);
          this.pos.x += dx / d * sp; this.pos.z += dz / d * sp;
          this.angle = Math.atan2(dx, dz);
          moved = true;
        }
      }
    }
    this.moving = moved;
    this.nudgeDir = null;
    this.animate(dt);
    this.sync();
  }

  animate(dt) {
    const m = this.moving;
    this.anim += dt * (m ? 10 : 3);
    const sw = m ? Math.sin(this.anim) * 0.6 : Math.sin(this.anim) * 0.04;
    const p = this.parts;
    p.legL.rotation.x = sw; p.legR.rotation.x = -sw;
    p.armL.rotation.x = -sw * 0.8; p.armR.rotation.x = sw * 0.8;
    this.bob = m ? Math.abs(Math.sin(this.anim)) * 0.05 : Math.sin(this.anim * 0.6) * 0.01;
  }

  sync() {
    this.group.position.set(this.pos.x, this.bob, this.pos.z);
    this.group.rotation.y = lerpAngle(this.group.rotation.y, this.angle, 0.35);
  }

  headWorld() {
    this.group.getWorldPosition(this._head);
    this._head.y += 2.0 * this.bro.scale;
    return this._head;
  }
}

function buildModel(bro) {
  const g = new THREE.Group();
  const hipY = 0.42, shY = 0.92, headY = 1.28;

  const pivot = (x, y, z, build) => { const pv = new THREE.Group(); pv.position.set(x, y, z); build(pv); g.add(pv); return pv; };
  const limb = (pv, w, h, d, col, shoeCol) => {
    pv.add(mesh(new THREE.BoxGeometry(w, h, d), M(col), 0, -h / 2, 0));
    if (shoeCol) pv.add(mesh(new THREE.BoxGeometry(w * 1.1, 0.12, d * 1.5), M(shoeCol), 0, -h - 0.02, 0.03));
  };

  const legL = pivot(-0.13, hipY, 0, pv => limb(pv, 0.17, hipY - 0.02, 0.18, bro.pants, bro.shoe));
  const legR = pivot(0.13, hipY, 0, pv => limb(pv, 0.17, hipY - 0.02, 0.18, bro.pants, bro.shoe));
  const armL = pivot(-0.30, shY - 0.04, 0, pv => { limb(pv, 0.12, 0.40, 0.13, bro.shirt); pv.add(mesh(new THREE.SphereGeometry(0.07, 8, 8), M(bro.skin), 0, -0.42, 0)); });
  const armR = pivot(0.30, shY - 0.04, 0, pv => { limb(pv, 0.12, 0.40, 0.13, bro.shirt); pv.add(mesh(new THREE.SphereGeometry(0.07, 8, 8), M(bro.skin), 0, -0.42, 0)); });

  g.add(mesh(new THREE.BoxGeometry(0.5, shY - hipY + 0.04, 0.32), M(bro.shirt), 0, (hipY + shY) / 2, 0));
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.1, 0.32), M(bro.shirtDark), 0, hipY + 0.05, 0));

  g.add(mesh(new THREE.SphereGeometry(0.21, 16, 14), M(bro.skin), 0, headY, 0));
  const hair = mesh(new THREE.SphereGeometry(0.225, 16, 14), M(bro.hair), 0, headY + 0.05, -0.02);
  hair.scale.set(1, 0.92, 1); g.add(hair);
  g.add(mesh(new THREE.SphereGeometry(0.07, 8, 8), M(bro.hairLit), 0, headY + 0.2, -0.02));
  for (const sx of [-0.08, 0.08]) g.add(mesh(new THREE.SphereGeometry(0.032, 8, 8), M(0x222028), sx, headY + 0.02, 0.19));
  g.add(mesh(new THREE.SphereGeometry(0.03, 8, 8), M(bro.skin), 0, headY - 0.04, 0.21));

  g.scale.setScalar(bro.scale);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { group: g, parts: { legL, legR, armL, armR } };
}
