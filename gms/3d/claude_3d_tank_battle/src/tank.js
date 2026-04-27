// Tank entity. Used for both the player and AI. Provides:
//   - movement (drive forward, body yaw)
//   - aiming (turret yaw, barrel pitch lerped to a world-space aim point)
//   - firing (cooldown, spawnBullet via injected BulletSystem)
//   - taking damage and death

import * as THREE from 'three';
import { CFG } from './config.js';
import { buildTank } from './builders.js';
import { terrainHeight } from './world.js';

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();

function lerp(a, b, t) { return a + (b - a) * t; }
function lerpAngle(a, b, t) {
  const d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  return a + d * t;
}

export class Tank {
  constructor({ name, color, isPlayer = false, brain = null, personality = null }) {
    this.name = name;
    this.color = color;            // { hull, tag, glow }
    this.isPlayer = isPlayer;
    this.brain = brain;            // function(tank, ctx, dt) — null for player
    this.personality = personality;

    this.root = buildTank(color.hull);
    this.turret = this.root.userData.turret;
    this.barrel = this.root.userData.barrelPivot;

    this.health = CFG.tank.maxHealth;
    this.maxHealth = CFG.tank.maxHealth;
    this.alive = true;
    this.kills = 0;
    this.placement = 0;            // set on death (1 = winner)
    this.fireCooldown = 0;

    // Steering inputs that the brain or player input writes each frame:
    this.driveForward = 0;         // -1..1
    this.targetBodyYaw = 0;        // desired body yaw (rad)
    this.aimPoint = new THREE.Vector3();  // world-space aim target
    this.wantsFire = false;
    this.lastHitFrom = null;       // last attacker (for damage indicator)
    this.lastKilledBy = null;

    // Cached fire rate (modified by personality)
    const rateMul = personality ? personality.fireRateMul : 1;
    this.fireCooldownDur = CFG.tank.fireCooldown / rateMul;
  }

  setPosition(x, z) {
    this.root.position.set(x, terrainHeight(x, z), z);
  }

  // Returns world-space muzzle position
  getMuzzleWorld(out) {
    out = out || new THREE.Vector3();
    out.copy(this.root.userData.muzzleLocal);
    this.barrel.localToWorld(out);
    return out;
  }

  // Returns world-space barrel forward direction
  getBarrelDir(out) {
    out = out || new THREE.Vector3();
    out.set(0, 0, 1);
    out.applyQuaternion(this.barrel.getWorldQuaternion(_q));
    out.normalize();
    return out;
  }

  // World-space tag anchor (above turret)
  getTagWorld(out) {
    out = out || new THREE.Vector3();
    out.copy(this.root.userData.tagAnchorLocal);
    this.root.localToWorld(out);
    return out;
  }

  takeDamage(amount, attacker, particles) {
    if (!this.alive) return;
    this.health -= amount;
    this.lastHitFrom = attacker;
    if (particles) {
      _v.copy(this.root.position); _v.y += 1.4;
      particles.spawnSparks(_v, 6, 0xff8a4a);
    }
    if (this.health <= 0) {
      this.health = 0;
      this.die(attacker, particles);
    }
  }

  die(killer, particles) {
    if (!this.alive) return;
    this.alive = false;
    if (killer && killer !== this) killer.kills += 1;
    this.lastKilledBy = killer;
    if (particles) {
      particles.spawnDebris(this.root.position, 24);
      _v.copy(this.root.position); _v.y += 1;
      particles.spawnSmoke(_v, 10);
    }
    if (this.barrel) this.barrel.rotation.x = 0.4;
    // tilt the body for a knocked-out look
    this.root.rotation.z += (Math.random() - 0.5) * 0.4;
  }

  // dt-based per-frame update.
  // ctx: { tanks, bulletSystem, camera, particles }
  update(dt, ctx) {
    if (!this.alive) return;

    // 1) brain or player input has already written to driveForward/aimPoint/wantsFire/etc.
    // 2) move + body rotate
    this._move(dt);
    // 3) aim turret + barrel toward aimPoint
    this._aim(dt);
    // 4) fire if requested + cooldown ready
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    if (this.wantsFire && this.fireCooldown <= 0) {
      this._fire(ctx);
      this.fireCooldown = this.fireCooldownDur;
    }
  }

  _move(dt) {
    const speed = (this.driveForward >= 0 ? CFG.tank.moveSpeed : CFG.tank.reverseSpeed);
    // body yaw: lerp toward targetBodyYaw at rotSpeed
    this.root.rotation.y = lerpAngle(
      this.root.rotation.y, this.targetBodyYaw,
      Math.min(1, CFG.tank.rotSpeed * dt)
    );

    if (Math.abs(this.driveForward) > 0.01) {
      // forward in current body frame
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion);
      this.root.position.addScaledVector(fwd, this.driveForward * speed * dt);
    }

    // arena clamp (push back if past arena)
    const r = Math.sqrt(
      this.root.position.x * this.root.position.x +
      this.root.position.z * this.root.position.z
    );
    if (r > CFG.world.arenaRadius - 1.5) {
      const k = (CFG.world.arenaRadius - 1.5) / r;
      this.root.position.x *= k;
      this.root.position.z *= k;
    }

    // ride terrain
    const targetY = terrainHeight(this.root.position.x, this.root.position.z);
    this.root.position.y = lerp(this.root.position.y, targetY, Math.min(1, 6 * dt));

    // subtle pitch/roll
    const sa = terrainHeight(this.root.position.x + 2, this.root.position.z);
    const sb = terrainHeight(this.root.position.x - 2, this.root.position.z);
    const sr = terrainHeight(this.root.position.x, this.root.position.z + 2);
    const sl = terrainHeight(this.root.position.x, this.root.position.z - 2);
    const slopeX = (sa - sb) * 0.1;
    const slopeZ = (sr - sl) * 0.1;
    this.root.rotation.x = lerp(this.root.rotation.x, -slopeX, Math.min(1, 4 * dt));
    this.root.rotation.z = lerp(this.root.rotation.z, slopeZ, Math.min(1, 4 * dt));
  }

  _aim(dt) {
    const muzzle = this.getMuzzleWorld(_v);
    const dir = this.aimPoint.clone().sub(muzzle);
    if (dir.lengthSq() < 1e-4) return;
    dir.normalize();
    // convert to tank-local frame
    const localDir = dir.clone().applyQuaternion(this.root.quaternion.clone().invert());
    const yaw = Math.atan2(localDir.x, localDir.z);
    const pitch = Math.atan2(
      localDir.y,
      Math.sqrt(localDir.x * localDir.x + localDir.z * localDir.z)
    );
    this.turret.rotation.y = lerpAngle(
      this.turret.rotation.y, yaw, Math.min(1, CFG.tank.turretSpeed * dt)
    );
    const targetPitch = Math.max(CFG.tank.aimMinPitch, Math.min(CFG.tank.aimMaxPitch, pitch));
    this.barrel.rotation.x = lerp(
      this.barrel.rotation.x, -targetPitch, Math.min(1, CFG.tank.barrelSpeed * dt)
    );
  }

  _fire(ctx) {
    const muzzle = this.getMuzzleWorld();
    const dir = this.getBarrelDir();
    ctx.bulletSystem.spawn(muzzle, dir, this, ctx.camera);
    if (ctx.onFire) ctx.onFire(this);
  }
}
