// The player: a small on-foot character (rigged) who can hotwire any
// unlocked vehicle. Foot & car modes share one weapon-fire path with mobile
// aim assist. Cars remember their own mounted weapon; the person keeps hers.

import * as THREE from 'three';
import { buildRig } from './hero.js';
import { CFG } from './config.js';
import { clamp, lerpAngle, angDiff } from './utils.js';
import { WEAPONS } from './weapons.js';
import { carUpgrades } from './save.js';
import * as audio from './audio.js';
import * as fx from './fx.js';

export class Player {
  constructor(scene, world, vehicles, weapons) {
    this.scene = scene; this.world = world; this.vehicles = vehicles; this.weapons = weapons;
    this.rig = buildRig('hero');
    scene.add(this.rig.group);
    this.pos = this.rig.group.position;
    this.yaw = 0;
    this.hp = CFG.foot.hp;
    this.alive = true;
    this.mode = 'foot';           // 'foot' | 'car'
    this.car = null;
    this.weapon = null;           // on-foot weapon id
    this.aimT = 0;                // seconds left of aim pose
    this.fireCd = 0;
    this.t = 0;
    this.walk = 0;
    this.invuln = 0;
    this.onDeath = null;
    this.onDamage = null;
    this._muzzle = new THREE.Vector3();
  }

  applyUpgrades(veh, carId) {
    const u = carUpgrades(carId);
    veh.upg = {
      topMul: 1 + u.eng * 0.09, accMul: 1 + u.eng * 0.14,
      gripMul: 1 + u.tire * 0.12, armorMul: 1 + u.armor * 0.35,
      nitro: !!u.nitro,
    };
    if (u.armor) { veh.maxHp = veh.def.hp * (1 + u.armor * 0.3); veh.hp = Math.max(veh.hp, veh.maxHp * 0.8); }
    if (u.paint && CFG.colors.paint[u.paint]) this.vehicles.paint(veh.group, CFG.colors.paint[u.paint]);
  }

  enter(veh) {
    if (!veh || veh.dead || veh.locked) return false;
    this.mode = 'car';
    this.car = veh;
    veh.driver = 'player';
    if (veh.ownedId) this.applyUpgrades(veh, veh.ownedId);
    this.rig.group.visible = false;
    audio.engine(true, 0);
    return true;
  }

  exit() {
    if (this.mode !== 'car' || !this.car) return false;
    const v = this.car;
    // find a free side spot
    const side = [[2.4, 0], [-2.4, 0], [0, 3.4], [0, -3.4]];
    let placed = false;
    for (const [ox, oz] of side) {
      const wx = v.x + Math.cos(v.yaw) * ox - Math.sin(v.yaw) * oz;
      const wz = v.z - Math.sin(v.yaw) * ox - Math.cos(v.yaw) * oz;
      const res = this.world.collide(wx, wz, 0.5);
      if (!res.hit) { this.pos.set(wx, 0, wz); placed = true; break; }
    }
    if (!placed) this.pos.set(v.x + 2.5, 0, v.z);
    v.driver = null;
    this.car = null;
    this.mode = 'foot';
    this.rig.group.visible = true;
    this.yaw = v.yaw;
    audio.engine(false);
    return true;
  }

  get x() { return this.mode === 'car' ? this.car.x : this.pos.x; }
  get z() { return this.mode === 'car' ? this.car.z : this.pos.z; }
  get speedFrac() {
    return this.mode === 'car' ? clamp(Math.abs(this.car.speed) / this.car.def.top, 0, 1) : this.walk * 0.15;
  }
  get vel() {
    if (this.mode === 'car') return { x: Math.sin(this.car.yaw) * this.car.speed, z: Math.cos(this.car.yaw) * this.car.speed };
    return { x: 0, z: 0 };
  }

  currentWeapon() { return this.mode === 'car' ? this.car.weapon : this.weapon; }

  damage(amt, silent = false) {
    if (!this.alive || this.invuln > 0) return;
    this.hp -= amt;
    if (!silent) audio.hurt();
    this.onDamage?.(amt);
    if (this.hp <= 0) {
      this.hp = 0; this.alive = false;
      this.onDeath?.();
    }
  }
  heal(amt) { this.hp = Math.min(CFG.foot.hp, this.hp + amt); }

  respawn(x, z) {
    this.alive = true;
    this.hp = CFG.foot.hp;
    this.invuln = 2;
    if (this.mode === 'car') { this.car.driver = null; this.car = null; this.mode = 'foot'; audio.engine(false); }
    this.pos.set(x, 0, z);
    this.rig.group.visible = true;
  }

  tick(dt, input, firing, nitro) {
    this.t += dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.fireCd > 0) this.fireCd -= dt;
    if (!this.alive) return;

    if (this.mode === 'car') {
      const v = this.car;
      this.vehicles.step(v, dt, { ...input, nitro });
      audio.engine(true, clamp(Math.abs(v.speed) / v.def.top, 0, 1), v.hp < v.maxHp * 0.35);
      audio.skid(v.skidding, 1);
      if (v.dead) {
        // car destroyed under us: tumble out hurt
        const wasCar = v;
        this.exit();
        this.damage(35);
        this.invuln = 1.5;
      }
    } else {
      // on foot
      const sp = this.world.terrainAt(this.pos.x, this.pos.z) === 'w' ? CFG.foot.swim : CFG.foot.speed;
      let mx = input.x * input.mag * sp, mz = input.z * input.mag * sp;
      this.walk = clamp(input.mag * (sp / CFG.foot.speed), 0, 1);
      if (input.mag > 0.05) {
        const desired = Math.atan2(input.x, input.z);
        if (this.aimT <= 0) this.yaw = lerpAngle(this.yaw, desired, 1 - Math.exp(-11 * dt));
      } else this.walk = 0;
      let nx = this.pos.x + mx * dt, nz = this.pos.z + mz * dt;
      const res = this.world.collide(nx, nz, 0.5);
      this.pos.x = res.x; this.pos.z = res.z;
      const bob = this.rig.animate(this.t, this.walk, clamp(this.aimT * 4, 0, 1));
      this.pos.y = bob;
      this.rig.group.rotation.y = this.yaw;
      if (this.aimT > 0) this.aimT -= dt;
    }

    // ── firing (shared) ──
    const wid = this.currentWeapon();
    if (firing && wid && this.fireCd <= 0) {
      const w = WEAPONS[wid];
      this.fireCd = w.cd;
      let yaw = this.mode === 'car' ? this.car.yaw : this.yaw;
      yaw = this.weapons.assist(this.x, this.z, yaw, w.range, 'player');
      if (this.mode === 'foot') {
        this.yaw = yaw;
        this.aimT = 0.6;
        this.rig.group.rotation.y = this.yaw;
        this.rig.animate(this.t, this.walk, 1);   // pose arms before muzzle sample
        this.rig.group.updateMatrixWorld(true);
        this.rig.muzzleWorld(this._muzzle);
        this._muzzle.y = Math.max(this._muzzle.y, 1.0);
      } else {
        const v = this.car;
        this._muzzle.set(
          v.x + Math.sin(v.yaw) * (v.halfLen + 0.6),
          v.size.y * 0.7,
          v.z + Math.cos(v.yaw) * (v.halfLen + 0.6));
        yaw = this.weapons.assist(this.x, this.z, this.mode === 'car' ? yaw : this.yaw, w.range, 'player');
      }
      this.weapons.fire(this._muzzle.x, this._muzzle.y, this._muzzle.z, yaw, wid, 'player');
    }
  }
}
