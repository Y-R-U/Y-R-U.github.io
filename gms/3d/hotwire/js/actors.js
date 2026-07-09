// Humanoid NPCs — one manager for pedestrians, foot cops, gang goons and
// posed story characters. All share the rigged-skeleton driver (hero.js).
// Behaviours: wander | flee | hunt (chase + shoot) | guard | static.

import * as THREE from 'three';
import { buildRig } from './hero.js';
import { CFG } from './config.js';
import { clamp, lerpAngle, rand, pick, textSprite } from './utils.js';
import * as fx from './fx.js';
import * as audio from './audio.js';

const PED_RIGS = ['ped_m', 'ped_w', 'ped_m2', 'ped_w2'];

export class Actors {
  constructor(scene, world, weapons, getPlayer) {
    this.scene = scene; this.world = world; this.weapons = weapons;
    this.getPlayer = getPlayer;
    this.list = [];
    this.onKilled = null;      // (actor, byWhom)
    this.panicT = 0;           // recent gunfire → peds flee
  }

  spawn(kind, x, z, opts = {}) {
    const rigName = opts.rig || (kind === 'ped' ? pick(PED_RIGS)
      : kind === 'cop' ? 'cop' : kind === 'swat' ? 'swat'
      : kind === 'gang' ? pick(['gang_m', 'gang_w']) : 'ped_m');
    const rig = buildRig(rigName, { scale: opts.scale || 0.92 });
    rig.group.position.set(x, 0, z);
    this.scene.add(rig.group);
    const a = {
      kind, rig, x, z, yaw: rand(0, Math.PI * 2),
      hp: opts.hp ?? (kind === 'swat' ? 70 : kind === 'cop' ? 45 : kind === 'gang' ? 45 : 20),
      alive: true, r: 0.85,
      behavior: opts.behavior || (kind === 'ped' ? 'wander' : kind === 'gang' || kind === 'cop' || kind === 'swat' ? 'hunt' : 'static'),
      weapon: opts.weapon || (kind === 'swat' ? 'smg' : kind === 'cop' || kind === 'gang' ? 'pistol' : null),
      fireCd: rand(0.3, 1.2), t: rand(0, 9), walk: 0,
      wanderT: 0, tx: x, tz: z, flingV: null, flingT: 0,
      label: opts.label || null, engageR: opts.engageR ?? 26,
      owner: kind === 'cop' || kind === 'swat' ? 'cop' : kind === 'gang' ? 'gang' : 'civ',
    };
    if (a.label) {
      const sp = textSprite(a.label, { size: 40, scale: 2.4 });
      sp.position.y = 2.35;
      rig.group.add(sp);
    }
    this.list.push(a);
    return a;
  }

  remove(a) {
    this.scene.remove(a.rig.group);
    const i = this.list.indexOf(a);
    if (i >= 0) this.list.splice(i, 1);
  }

  hit(a, dmg, owner, yawFrom = 0) {
    if (!a.alive) return;
    a.hp -= dmg;
    if (a.hp <= 0) this.kill(a, owner, Math.sin(yawFrom) * 4, Math.cos(yawFrom) * 4);
    else if (a.behavior === 'wander') { a.behavior = 'flee'; }
  }

  kill(a, byWhom, vx = 0, vz = 0) {
    if (!a.alive) return;
    a.alive = false;
    a.flingV = new THREE.Vector3(vx + rand(-1, 1), rand(4, 7), vz + rand(-1, 1));
    a.flingT = 0;
    this.onKilled?.(a, byWhom);
  }

  // vehicles running people over
  checkVehicles(vehList) {
    for (const v of vehList) {
      if (v.dead || Math.abs(v.speed) < 3) continue;
      for (const a of this.list) {
        if (!a.alive) continue;
        const rr = v.radius + v.halfLen * 0.6 + a.r;
        const dx = a.x - v.x, dz = a.z - v.z;
        if (dx * dx + dz * dz < rr * rr) {
          const k = Math.abs(v.speed) * 0.55;
          this.kill(a, v.driver === 'player' ? 'player' : v.roleTag,
            Math.sin(v.yaw) * k * Math.sign(v.speed), Math.cos(v.yaw) * k * Math.sign(v.speed));
          audio.crash(0.4);
        }
      }
    }
  }

  panic() { this.panicT = 6; }

  tick(dt) {
    if (this.panicT > 0) this.panicT -= dt;
    const pl = this.getPlayer();
    for (let i = this.list.length - 1; i >= 0; i--) {
      const a = this.list[i];
      a.t += dt;
      if (!a.alive) {
        // ragdoll-ish launch, then fade out
        a.flingT += dt;
        if (a.flingV) {
          a.flingV.y -= 16 * dt;
          a.rig.group.position.x += a.flingV.x * dt;
          a.rig.group.position.y = Math.max(0, a.rig.group.position.y + a.flingV.y * dt);
          a.rig.group.position.z += a.flingV.z * dt;
          a.rig.group.rotation.x += 6 * dt;
          a.rig.flail(a.t);
        }
        if (a.flingT > 2.2) this.remove(a);
        continue;
      }

      const dxp = pl.x - a.x, dzp = pl.z - a.z;
      const distP = Math.hypot(dxp, dzp);
      let speed = 0;

      switch (a.behavior) {
        case 'static':
          a.rig.animate(a.t, 0);
          if (distP < 6) a.yaw = lerpAngle(a.yaw, Math.atan2(dxp, dzp), 1 - Math.exp(-4 * dt));
          break;
        case 'wander': {
          if (this.panicT > 0 && distP < 30) { a.behavior = 'flee'; break; }
          a.wanderT -= dt;
          if (a.wanderT <= 0) {
            a.wanderT = rand(2, 6);
            const ang = rand(0, Math.PI * 2);
            a.tx = a.x + Math.sin(ang) * rand(4, 14);
            a.tz = a.z + Math.cos(ang) * rand(4, 14);
          }
          const d = Math.hypot(a.tx - a.x, a.tz - a.z);
          if (d > 1) { a.yaw = lerpAngle(a.yaw, Math.atan2(a.tx - a.x, a.tz - a.z), 1 - Math.exp(-5 * dt)); speed = CFG.ped.speed; }
          break;
        }
        case 'flee': {
          a.yaw = lerpAngle(a.yaw, Math.atan2(-dxp, -dzp), 1 - Math.exp(-7 * dt));
          speed = CFG.ped.fleeSpeed;
          if (distP > 46 && this.panicT <= 0) a.behavior = 'wander';
          break;
        }
        case 'guard': {
          a.rig.animate(a.t, 0, distP < a.engageR ? 1 : 0);
          if (distP < a.engageR && pl.alive) {
            a.yaw = lerpAngle(a.yaw, Math.atan2(dxp, dzp), 1 - Math.exp(-8 * dt));
            this._shoot(a, pl, distP, dt);
          }
          break;
        }
        case 'hunt': {
          if (!pl.alive) break;
          const want = clamp(distP - 9, 0, 1e9);
          a.yaw = lerpAngle(a.yaw, Math.atan2(dxp, dzp), 1 - Math.exp(-7 * dt));
          if (want > 0.5 && distP < 70) speed = a.kind === 'swat' ? 4.2 : 3.6;
          if (distP < 30) this._shoot(a, pl, distP, dt);
          break;
        }
      }

      if (speed > 0) {
        let nx = a.x + Math.sin(a.yaw) * speed * dt;
        let nz = a.z + Math.cos(a.yaw) * speed * dt;
        const res = this.world.collide(nx, nz, 0.45);
        a.x = res.x; a.z = res.z;
        if (res.hit && a.behavior === 'wander') a.wanderT = 0;
        a.walk = clamp(speed / CFG.foot.speed, 0, 1);
      } else a.walk = 0;

      if (a.behavior !== 'static' && a.behavior !== 'guard') {
        const aim = a.behavior === 'hunt' && distP < 30 ? 1 : 0;
        a.rig.group.position.y = a.rig.animate(a.t, a.walk, aim);
      }
      a.rig.group.position.x = a.x;
      a.rig.group.position.z = a.z;
      a.rig.group.rotation.y = a.yaw;
    }
  }

  _shoot(a, pl, distP, dt) {
    a.fireCd -= dt;
    if (a.fireCd > 0 || !a.weapon) return;
    if (this.world.blocked(a.x, a.z, pl.x, pl.z)) return;
    a.fireCd = a.kind === 'swat' ? 0.5 : rand(0.9, 1.6);
    const yaw = Math.atan2(pl.x - a.x, pl.z - a.z) + rand(-0.06, 0.06);
    this.weapons.fire(a.x + Math.sin(yaw), 1.25, a.z + Math.cos(yaw), yaw, a.weapon, a.owner);
  }

  clearKind(kinds) {
    for (const a of [...this.list]) if (kinds.includes(a.kind)) this.remove(a);
  }
  clear() { for (const a of [...this.list]) this.remove(a); }
}
