// Tank entity: shared physics/turret/damage logic for player and AI alike.
// A tank doesn't know what drives it — its controller (player input or AI)
// just writes moveInput / aimPoint / wantFire each frame.

import * as THREE from 'three';
import { TANK, FIELD_R, PICKUP_KINDS } from './config.js';
import { clamp, lerp, damp, angLerp, hexToCss } from './utils.js';
import { scene, obstacles, playerGlow } from './world.js';
import { buildTankMesh } from './tankFactory.js';
import { spawnExplosion, spawnDebris } from './particles.js';
import { AudioFX } from './audio.js';
import { state, addShake } from './state.js';
import { addFeed, updateLeaderboard, flashHit, hitConfirm, killPop } from './ui.js';

const _tmpV = new THREE.Vector3();

export class Tank {
  constructor({ name, accent, isPlayer = false, personality = null }) {
    this.name = name;
    this.accent = accent;
    this.accentCss = hexToCss(accent);
    this.isPlayer = isPlayer;
    this.personality = personality;

    const m = buildTankMesh(accent);
    this.grp = m.grp;
    this.leanG = m.leanG;
    this.turretG = m.turretG;
    this.barrelG = m.barrelG;
    this.muzzles = m.muzzles;
    this.muzzleFlash = m.muzzleFlash;
    this.bubble = m.bubble;
    this.buffs = { rapid: 0, shield: 0, ward: 0 };
    this.nemesis = false;
    this.peckT = 0;
    scene.add(this.grp);

    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.turretYaw = 0;
    this.barrelPitch = 0.05;
    this.hp = TANK.hp;
    this.alive = true;
    this.kills = 0;
    this.place = 0;
    this.fireTimer = 0;
    this.barrelSide = 0;

    // controller interface
    this.controller = null;
    this.moveInput = { x: 0, z: 0 };
    this.aimPoint = new THREE.Vector3(0, 1, -10);
    this.wantFire = false;

    this.lastAttacker = null;
    this.killedBy = null;      // who landed the killing blow (null = the murder)
    this.lastHitT = -99;
  }

  get pos() { return this.grp.position; }

  updatePhysics(dt) {
    let { x: mx, z: mz } = this.moveInput;
    const mLen = Math.hypot(mx, mz);
    if (mLen > 1) { mx /= mLen; mz /= mLen; }

    this.vel.x += mx * TANK.accel * dt;
    this.vel.z += mz * TANK.accel * dt;
    const dampK = Math.min(1, TANK.damp * dt);
    this.vel.x -= this.vel.x * dampK;
    this.vel.z -= this.vel.z * dampK;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > TANK.maxSpeed) {
      this.vel.x *= TANK.maxSpeed / sp;
      this.vel.z *= TANK.maxSpeed / sp;
    }

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    // fence bounds
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > FIELD_R - 1.8) {
      const k = (FIELD_R - 1.8) / r;
      this.pos.x *= k;
      this.pos.z *= k;
    }

    // obstacle circles push the tank out
    for (const o of obstacles) {
      const dx = this.pos.x - o.x;
      const dz = this.pos.z - o.z;
      const minD = o.r + TANK.radius;
      const d = Math.hypot(dx, dz);
      if (d < minD && d > 1e-5) {
        const push = (minD - d) / d;
        this.pos.x += dx * push;
        this.pos.z += dz * push;
      }
    }

    // hull yaw faces velocity (hull forward = -z)
    if (sp > 1.2) {
      const targetYaw = Math.atan2(-this.vel.x, -this.vel.z);
      this.yaw = angLerp(this.yaw, targetYaw, damp(7, dt));
    }
    this.grp.rotation.y = this.yaw;

    // suspension lean under acceleration / cornering
    const cos = Math.cos(this.yaw), sin = Math.sin(this.yaw);
    const localVx = this.vel.x * cos - this.vel.z * sin;
    const localVz = this.vel.x * sin + this.vel.z * cos;
    this.leanG.rotation.x = lerp(this.leanG.rotation.x, clamp(-localVz * 0.012, -0.1, 0.1), damp(8, dt));
    this.leanG.rotation.z = lerp(this.leanG.rotation.z, clamp(localVx * 0.014, -0.12, 0.12), damp(8, dt));

    // turret tracks aimPoint
    this.turretG.getWorldPosition(_tmpV);
    const dx = this.aimPoint.x - _tmpV.x;
    const dy = this.aimPoint.y - _tmpV.y;
    const dz = this.aimPoint.z - _tmpV.z;
    const targetYawWorld = Math.atan2(-dx, -dz);
    const targetPitch = clamp(Math.atan2(dy, Math.hypot(dx, dz)), -0.08, 0.5);
    this.turretYaw = angLerp(this.turretYaw, targetYawWorld, damp(12, dt));
    this.barrelPitch = lerp(this.barrelPitch, targetPitch, damp(12, dt));
    this.turretG.rotation.y = this.turretYaw - this.yaw;
    this.barrelG.rotation.x = this.barrelPitch;

    // muzzle flash decay
    for (const tip of this.muzzleFlash) {
      tip.scale.multiplyScalar(Math.pow(0.0001, dt));
      if (tip.scale.x < 0.002) tip.scale.setScalar(0.001);
    }

    this.fireTimer -= dt;
    const b = this.buffs;
    if (b.rapid > 0) b.rapid -= dt;
    if (b.ward > 0) b.ward -= dt;
    if (b.shield > 0) b.shield -= dt;
    this.bubble.visible = b.shield > 0;
    if (b.shield > 0) this.bubble.rotation.y += dt * 1.5;
  }

  get warded() { return this.buffs.ward > 0; }

  // kind: 'bolt' (tank fire) or 'peck' (the murder)
  damage(amount, attacker, kind = 'bolt') {
    if (!this.alive) return;
    if (kind === 'peck' && this.warded) return;
    if (kind === 'bolt' && this.buffs.shield > 0) amount *= 1 - PICKUP_KINDS.shield.absorb;
    this.hp -= amount;
    this.lastHitT = state.time;
    if (attacker) this.lastAttacker = attacker;
    if (this.isPlayer) {
      if (kind === 'peck') {
        flashHit(true);
        addShake(0.12);
        AudioFX.peck();
      } else {
        flashHit();
        addShake(0.3);
        AudioFX.hit();
      }
    } else if (attacker && attacker.isPlayer && kind === 'bolt') {
      hitConfirm(this);
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.die(attacker);
    }
  }

  die(attacker) {
    this.alive = false;
    const i = state.alive.indexOf(this);
    if (i >= 0) state.alive.splice(i, 1);
    this.killedBy = attacker && attacker !== this ? attacker : null;
    this.place = state.placeCounter--;
    spawnExplosion(_tmpV.copy(this.pos).setY(1.2), 2.0, this.accent);
    spawnDebris(_tmpV, 6, 1.4);
    this.grp.visible = false;
    if (attacker && attacker !== this) {
      attacker.kills++;
      if (state.hooks.onKill) state.hooks.onKill(attacker, this);
      if (attacker.isPlayer) killPop(this);
    }
    addFeed(attacker, this);
    updateLeaderboard();
  }

  heal(amount) {
    this.hp = Math.min(TANK.hp, this.hp + amount);
  }

  applyBuff(kind) {
    this.buffs[kind] = PICKUP_KINDS[kind].dur;
  }

  reset(x, z) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.yaw = Math.atan2(-(-x), -(-z)); // face arena center
    this.turretYaw = this.yaw;
    this.hp = TANK.hp;
    this.alive = true;
    if (!state.alive.includes(this)) state.alive.push(this);
    this.kills = 0;
    this.place = 0;
    this.buffs.rapid = this.buffs.shield = this.buffs.ward = 0;
    this.bubble.visible = false;
    this.peckT = 0;
    this.lastAttacker = null;
    this.killedBy = null;
    this.grp.visible = true;
    this.grp.rotation.y = this.yaw;
  }

  // Geometry and materials are shared (see tankFactory.js): nothing to free.
  dispose() {
    scene.remove(this.grp);
    this.alive = false;
  }
}

// Pairwise tank separation — simple circle push, split evenly.
export function separateTanks() {
  const ts = state.tanks;
  for (let i = 0; i < ts.length; i++) {
    const a = ts[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < ts.length; j++) {
      const b = ts[j];
      if (!b.alive) continue;
      const dx = b.pos.x - a.pos.x;
      const dz = b.pos.z - a.pos.z;
      const minD = TANK.radius * 2;
      const d = Math.hypot(dx, dz);
      if (d < minD && d > 1e-5) {
        const push = (minD - d) / d / 2;
        a.pos.x -= dx * push;
        a.pos.z -= dz * push;
        b.pos.x += dx * push;
        b.pos.z += dz * push;
      }
    }
  }
}

export function updateAllTanks(dt, controllersActive) {
  // One permanent light follows the player, so the scene's light count never
  // changes between attract mode and a match (that forces shader recompiles).
  const p = state.player;
  if (p && p.alive) {
    playerGlow.position.set(p.pos.x, 1.6, p.pos.z);
    playerGlow.intensity = 3.0;
  } else {
    playerGlow.intensity = 0;
  }
  for (const t of state.tanks) {
    if (!t.alive) continue;
    if (controllersActive && t.controller) t.controller.update(dt);
    if (!controllersActive) { t.moveInput.x = 0; t.moveInput.z = 0; t.wantFire = false; }
    t.updatePhysics(dt);
  }
  separateTanks();
}
