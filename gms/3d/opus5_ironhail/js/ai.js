// Enemy crews. They use exactly the same ballistic solver the player's gunner
// does — they just do it with worse optics, slower reactions and imperfect wind
// correction, all scaled by the mission's skill rating. They also break line of
// sight while reloading, which is what makes the duels feel like duels.

import * as THREE from 'three';
import { FIELD_R } from './config.js';
import { rand, clamp01, lerp, angDiff, dirToYaw } from './utils.js';
import { obstacles, propsBlockLine } from './props.js';
import { terrainBlocks, terrainHeight } from './terrain.js';
import { aimSolution } from './projectiles.js';
import { state } from './state.js';

const _v = new THREE.Vector3();
const _t = new THREE.Vector3();

export const ROLES = {
  brawler:   { label: 'BRAWLER',   range: 20, aggression: 0.95, courage: 0.12, strafe: 0.9, coverLove: 0.2 },
  line:      { label: 'LINE',      range: 38, aggression: 0.75, courage: 0.25, strafe: 0.6, coverLove: 0.5 },
  sniper:    { label: 'SNIPER',    range: 68, aggression: 0.5,  courage: 0.4,  strafe: 0.3, coverLove: 0.8 },
  artillery: { label: 'ARTILLERY', range: 80, aggression: 0.45, courage: 0.5,  strafe: 0.2, coverLove: 0.9 },
  flanker:   { label: 'FLANKER',   range: 28, aggression: 0.85, courage: 0.3,  strafe: 1.0, coverLove: 0.3 },
  guard:     { label: 'GUARD',     range: 34, aggression: 0.6,  courage: 0.05, strafe: 0.4, coverLove: 0.6 },
  boss:      { label: 'COMMAND',   range: 44, aggression: 0.9,  courage: 0.0,  strafe: 0.5, coverLove: 0.3 },
};

export class AIController {
  constructor(tank, { role = 'line', skill = 0.5, guardPoint = null } = {}) {
    this.tank = tank;
    tank.aiDriven = true;
    this.role = ROLES[role] || ROLES.line;
    this.roleId = role;
    this.skill = clamp01(skill);
    this.guardPoint = guardPoint;

    this.mode = 'hunt';
    this.target = null;
    this.waypoint = new THREE.Vector3(rand(-30, 30), 0, rand(-30, 30));
    this.decisionT = rand(0, 0.4);
    this.reaction = lerp(0.85, 0.16, this.skill);
    this.errBase = lerp(0.085, 0.010, this.skill);
    this.leadQ = lerp(0.35, 1.0, this.skill);
    this.windComp = lerp(0.15, 1.0, this.skill);
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.strafeT = rand(1, 3);
    this.errSeed = rand(0, Math.PI * 2);
    this.jitter = 0;
    this.acquireT = 0;
    this.lastLos = false;
    this.coverPoint = null;
  }

  update(dt) {
    const me = this.tank;
    this.decisionT -= dt;
    if (this.decisionT <= 0) {
      this.decisionT = rand(0.28, 0.55);
      this.decide();
    }
    this.strafeT -= dt;
    if (this.strafeT <= 0) {
      this.strafeT = rand(1.4, 3.2);
      this.strafeDir *= -1;
    }
    this.steer(dt);
    this.aim(dt);
  }

  // ---- decisions --------------------------------------------------------

  decide() {
    const me = this.tank;
    const enemies = state.tanks.filter((t) => t.alive && t.faction !== me.faction);
    if (!enemies.length) {
      this.mode = 'hold';
      this.target = null;
      return;
    }

    // prefer whoever is shooting at us, then the closest threat
    let target = null;
    if (me.lastAttacker && me.lastAttacker.alive && state.time - me.lastHitT < 6) {
      target = me.lastAttacker;
    }
    if (!target) {
      let bd = 1e9;
      for (const t of enemies) {
        let d = t.pos.distanceTo(me.pos);
        if (t.isPlayer) d *= 0.72;               // the player is the interesting one
        if (d < bd) { bd = d; target = t; }
      }
    }
    this.target = target;

    const hpFrac = me.hpFrac;
    if (hpFrac < this.role.courage && !me.boss) {
      this.mode = 'withdraw';
      return;
    }
    if (this.guardPoint && this.roleId === 'guard') {
      const d = Math.hypot(me.pos.x - this.guardPoint.x, me.pos.z - this.guardPoint.z);
      this.mode = d > 26 ? 'return' : 'engage';
      return;
    }
    // reloading with no shot? go break line of sight
    const reloading = me.fireTimer > me.gun.reload * 0.45;
    if (reloading && Math.random() < this.role.coverLove * 0.8) {
      this.mode = 'cover';
      this.coverPoint = this.findCover(target);
      if (!this.coverPoint) this.mode = 'engage';
      return;
    }
    this.mode = 'engage';
  }

  findCover(target) {
    if (!target) return null;
    const me = this.tank;
    let best = null, bs = 1e9;
    for (const o of obstacles) {
      if (!o.tall) continue;
      const op = o.grp.position;
      const dToMe = Math.hypot(op.x - me.pos.x, op.z - me.pos.z);
      if (dToMe > 42) continue;
      // stand on the far side of the prop from the target
      const dx = op.x - target.pos.x, dz = op.z - target.pos.z;
      const len = Math.hypot(dx, dz) || 1;
      const px = op.x + (dx / len) * (o.r + 3.2);
      const pz = op.z + (dz / len) * (o.r + 3.2);
      const score = Math.hypot(px - me.pos.x, pz - me.pos.z);
      if (score < bs) { bs = score; best = new THREE.Vector3(px, 0, pz); }
    }
    return best;
  }

  // ---- steering ---------------------------------------------------------

  steer(dt) {
    const me = this.tank;
    const t = this.target;

    if (this.mode === 'engage' && t) {
      const want = this.role.range;
      _v.set(me.pos.x - t.pos.x, 0, me.pos.z - t.pos.z);
      const d = Math.max(_v.length(), 0.01);
      _v.divideScalar(d);
      const tanX = -_v.z * this.strafeDir;
      const tanZ = _v.x * this.strafeDir;
      const strafe = this.role.strafe * 12;
      this.waypoint.set(
        t.pos.x + _v.x * want + tanX * strafe, 0,
        t.pos.z + _v.z * want + tanZ * strafe);
    } else if (this.mode === 'withdraw' && t) {
      _v.set(me.pos.x - t.pos.x, 0, me.pos.z - t.pos.z).normalize();
      this.waypoint.set(me.pos.x + _v.x * 26, 0, me.pos.z + _v.z * 26);
    } else if (this.mode === 'cover' && this.coverPoint) {
      this.waypoint.copy(this.coverPoint);
    } else if (this.mode === 'return' && this.guardPoint) {
      this.waypoint.set(this.guardPoint.x, 0, this.guardPoint.z);
    } else if (this.waypoint.distanceTo(me.pos) < 6) {
      const a = rand(0, Math.PI * 2);
      const r = rand(10, FIELD_R * 0.7);
      this.waypoint.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    }

    // stay inside the field
    const wr = Math.hypot(this.waypoint.x, this.waypoint.z);
    if (wr > FIELD_R - 6) {
      this.waypoint.multiplyScalar((FIELD_R - 8) / wr);
    }

    let dx = this.waypoint.x - me.pos.x;
    let dz = this.waypoint.z - me.pos.z;
    const dist = Math.hypot(dx, dz);
    const stopBand = this.mode === 'engage' ? 4.5 : 2.5;
    if (dist > stopBand) {
      dx /= dist; dz /= dist;
      // steer around scenery
      for (const o of obstacles) {
        const op = o.grp.position;
        const ox = op.x - me.pos.x, oz = op.z - me.pos.z;
        const od = Math.hypot(ox, oz);
        const reach = o.r + 6;
        if (od < reach && od > 0.01 && (ox * dx + oz * dz) > 0) {
          const k = (1 - od / reach) * 2.4;
          dx += (-oz / od) * k;
          dz += (ox / od) * k;
        }
      }
      // and around ground too steep to climb
      const probeX = me.pos.x + dx * 6, probeZ = me.pos.z + dz * 6;
      if (terrainHeight(probeX, probeZ) - me.pos.y > 5.5) {
        const sx = dx, sz = dz;
        dx = sx - sz * 0.9;
        dz = sz + sx * 0.9;
      }
      const len = Math.hypot(dx, dz) || 1;
      me.moveDir.set(dx / len, dz / len);
    } else {
      me.moveDir.set(0, 0);
    }
  }

  // ---- gunnery ----------------------------------------------------------

  aim(dt) {
    const me = this.tank;
    const t = this.target;
    if (!t || !t.alive) {
      me.wantFire = false;
      me.aimSolution = null;
      _v.set(me.pos.x + me.moveDir.x * 20, me.pos.y + 1, me.pos.z + me.moveDir.y * 20);
      me.aimPoint.lerp(_v, 0.06);
      return;
    }

    // acquisition delay so they do not snap onto you instantly
    if (this.lastTarget !== t) {
      this.lastTarget = t;
      this.acquireT = this.reaction;
    }
    this.acquireT = Math.max(0, this.acquireT - dt);

    me.turretG.getWorldPosition(_v);
    // lead the target using the flight time of our own shell
    _t.copy(t.pos);
    _t.y += 1.1;
    for (let i = 0; i < 2; i++) {
      const s = aimSolution(_v, _t, me.gun, this.windComp);
      _t.set(
        t.pos.x + t.vel.x * s.tof * this.leadQ,
        t.pos.y + 1.1,
        t.pos.z + t.vel.z * s.tof * this.leadQ);
    }
    const sol = aimSolution(_v, _t, me.gun, this.windComp);

    // The crew aims true and settles; their misses come from dispersion at the
    // moment of firing, not from a wobble that never lets the turret line up.
    me.aimPoint.set(sol.aimX, _t.y, sol.aimZ);
    me.aimSolution = { valid: sol.valid, pitch: sol.pitch, tof: sol.tof };

    let err = this.errBase;
    if (t.smokeTimer > 0) err *= 3.4;
    if (me.empTimer > 0) err *= 2.5;
    if (t.speed > 8) err *= 1.4;
    if (me.speed > 6) err *= 1.5;
    // a slow drift so consecutive shots are not identical
    me.extraSpread = (err + Math.abs(Math.sin(state.time * 0.7 + this.errSeed)) * err * 0.6)
      / Math.max(0.002, me.gun.spread || 0.006);

    const inRange = sol.valid && sol.dist < this.role.range * 1.9 + 14;
    const aligned = Math.abs(angDiff(me.turretYaw,
      dirToYaw(me.aimPoint.x - _v.x, me.aimPoint.z - _v.z))) < 0.09;
    const pitchOk = Math.abs(me.barrelPitch - sol.pitch) < 0.1;
    const clear = this.hasLineOfFire(_v, t, sol);
    this.lastLos = clear;

    me.wantFire = inRange && aligned && pitchOk && clear && this.acquireT <= 0 &&
      this.mode !== 'cover' && (this.mode !== 'withdraw' || Math.random() < 0.4);
  }

  // High-arc weapons only need the sky; direct fire needs a clean lane.
  hasLineOfFire(from, target, sol) {
    if (this.tank.gun.arc === 'high') {
      // check the shell is not going to hit the hill directly in front
      const midX = (from.x + target.pos.x) / 2;
      const midZ = (from.z + target.pos.z) / 2;
      const apex = from.y + Math.pow(Math.sin(sol.pitch) * this.tank.gun.speed, 2) / (2 * 26);
      return apex > terrainHeight(midX, midZ) + 2;
    }
    const ty = target.pos.y + 1.2;
    if (terrainBlocks(from.x, from.y, from.z, target.pos.x, ty, target.pos.z, 10)) return false;
    if (propsBlockLine(from.x, from.y, from.z, target.pos.x, ty, target.pos.z)) return false;
    return true;
  }
}

// Bosses cycle through phases: aimed fire, then a saturation barrage.
export class BossController extends AIController {
  constructor(tank, opts) {
    super(tank, { ...opts, role: 'boss' });
    this.phase = 'advance';
    this.phaseT = 8;
    this.baseReload = tank.gun.reload;
  }

  update(dt) {
    this.phaseT -= dt;
    if (this.phaseT <= 0) {
      if (this.phase === 'advance') {
        this.phase = 'barrage';
        this.phaseT = 5.5;
        this.role = { ...ROLES.boss, range: 26, strafe: 0.2 };
        this.tank.fireTimer = Math.min(this.tank.fireTimer, 0.3);
        this.tank.gun = { ...this.tank.gun, reload: this.baseReload * 0.42 };
      } else {
        this.phase = 'advance';
        this.phaseT = 9;
        this.role = ROLES.boss;
        this.tank.gun = { ...this.tank.gun, reload: this.baseReload };
      }
    }
    super.update(dt);
  }
}
