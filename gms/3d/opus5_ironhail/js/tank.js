// The Tank entity: terrain-following physics, a turret that traverses at a
// real rate, facing-sensitive armour, track and turret crits, reloads and
// death. A tank does not know what drives it — its controller writes
// moveDir / aimPoint / wantFire each frame.

import * as THREE from 'three';
import { PHYS, COMBAT, FIELD_R } from './config.js';
import { clamp, clamp01, lerp, damp, angDiff, angStep, dirToYaw, hexToCss, rand } from './utils.js';
import { actorRoot } from './render.js';
import { buildTank } from './tankFactory.js';
import { terrainHeight, terrainNormal } from './terrain.js';
import { obstacles, crushCheck, damagePropsInRadius } from './props.js';
import { spawnExplosion, spawnDebris, spawnSmoke, spawnSparks } from './particles.js';
import { AudioFX } from './audio.js';
import { state, addShake } from './state.js';
import { emit } from './bus.js';

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();

const burntMat = new THREE.MeshStandardMaterial({
  vertexColors: true, flatShading: true, color: 0x4a4644, roughness: 0.95, metalness: 0.2,
});

let nextId = 1;

export class Tank {
  constructor({
    name = 'ENEMY', chassis = 'mainline', weaponId = 'ap76', stats,
    hull = 0x4a5138, accent = 0xff5a4a, isPlayer = false, boss = false,
    faction = 'red', role = null, personality = null,
  }) {
    this.id = nextId++;
    this.name = name;
    this.isPlayer = isPlayer;
    this.faction = faction;
    this.role = role;
    this.personality = personality;
    this.boss = boss;
    this.accent = accent;
    this.accentCss = hexToCss(accent);
    this.chassisId = chassis;
    this.weaponId = weaponId;
    this.stats = stats;                    // derived stats object (see arsenal)
    this.gun = stats.weapon;

    const built = buildTank({
      chassis, weaponKind: this.gun.kind, hull, accent, isPlayer, boss,
    });
    Object.assign(this, built);
    if (boss) this.grp.scale.setScalar(1.22);
    actorRoot.add(this.grp);

    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.turretYaw = 0;
    this.barrelPitch = 0.04;

    this.hpMax = stats.hpMax;
    this.hp = this.hpMax;
    this.alive = true;
    this.kills = 0;

    // controller interface
    this.controller = null;
    this.moveDir = new THREE.Vector2(0, 0);   // world-space desired heading
    this.aimPoint = new THREE.Vector3(0, 1, -20);
    this.wantFire = false;
    this.aimSolution = null;                  // { pitch, tof, valid } from ballistics

    this.fireTimer = 0;
    this.burstLeft = 0;
    this.burstTimer = 0;
    this.barrelSide = 0;
    this.shotsFired = 0;
    this.recoil = 0;
    this.barrelBaseZ = this.barrelG.position.z;
    this.speed = 0;
    this.extraSpread = 1;      // AI crews widen this; the player's stays at 1

    // status effects
    this.trackTimer = 0;
    this.turretTimer = 0;
    this.empTimer = 0;
    this.boostTimer = 0;
    this.smokeTimer = 0;
    this.lastHitT = -99;
    this.lastAttacker = null;
    this.spottedUntil = -99;
    this.markedUntil = -99;                   // drone strike mark
    this.reloadWasReady = true;
    this.deadT = 0;
    this.smokePlume = 0;
    this.hitFlashT = 0;
  }

  get pos() { return this.grp.position; }

  get reloadFrac() {
    return this.gun.reload > 0 ? clamp01(1 - this.fireTimer / this.gun.reload) : 1;
  }

  get hpFrac() { return clamp01(this.hp / this.hpMax); }

  get crippled() { return this.trackTimer > 0; }

  get forwardX() { return -Math.sin(this.yaw); }
  get forwardZ() { return -Math.cos(this.yaw); }

  // ---- placement ---------------------------------------------------------

  place(x, z, faceYaw = null) {
    this.pos.set(x, terrainHeight(x, z), z);
    this.vel.set(0, 0, 0);
    this.yaw = faceYaw != null ? faceYaw : dirToYaw(-x, -z);
    this.turretYaw = this.yaw;
    this.grp.rotation.y = this.yaw;
    this.hp = this.hpMax;
    this.alive = true;
    this.fireTimer = this.gun.reload * 0.35;
    this.trackTimer = this.turretTimer = this.empTimer = this.boostTimer = 0;
    this.grp.visible = true;
    this.deadT = 0;
    this.restoreMaterials();
  }

  restoreMaterials() {
    if (!this.savedMats) return;
    this.hullMesh.material = this.savedMats[0];
    if (this.turretMesh) this.turretMesh.material = this.savedMats[1];
    if (this.barrelMesh) this.barrelMesh.material = this.savedMats[2];
    for (const m of this.accentMeshes) m.visible = true;
    this.savedMats = null;
  }

  // ---- physics -----------------------------------------------------------

  update(dt) {
    if (!this.alive) { this.updateWreck(dt); return; }

    if (this.controller && !state.paused) this.controller.update(dt);

    this.tickTimers(dt);
    this.drive(dt);
    this.aimTurret(dt);
    this.updateFx(dt);
  }

  tickTimers(dt) {
    this.fireTimer -= dt;
    this.trackTimer = Math.max(0, this.trackTimer - dt);
    this.turretTimer = Math.max(0, this.turretTimer - dt);
    this.empTimer = Math.max(0, this.empTimer - dt);
    this.boostTimer = Math.max(0, this.boostTimer - dt);
    this.smokeTimer = Math.max(0, this.smokeTimer - dt);
    this.hitFlashT = Math.max(0, this.hitFlashT - dt);

    // repair out of contact
    if (this.stats.regen > 0 && this.hp < this.hpMax &&
        state.time - this.lastHitT > COMBAT.regenDelay) {
      this.hp = Math.min(this.hpMax, this.hp + this.stats.regen * dt);
    }
    if (this.healTimer > 0) {
      this.healTimer -= dt;
      this.hp = Math.min(this.hpMax, this.hp + this.healRate * dt);
    }

    if (this.isPlayer) {
      const wasReady = this.reloadWasReady;
      const ready = this.fireTimer <= 0;
      if (ready && !wasReady) AudioFX.reloadReady();
      this.reloadWasReady = ready;
    }
  }

  drive(dt) {
    let mx = this.moveDir.x, mz = this.moveDir.y;
    const mLen = Math.hypot(mx, mz);
    if (mLen > 1) { mx /= mLen; mz /= mLen; }

    let maxSpeed = this.stats.speed;
    let accel = this.stats.accel;
    if (this.trackTimer > 0) { maxSpeed *= COMBAT.trackSlowMul; accel *= COMBAT.trackSlowMul; }
    if (this.boostTimer > 0) { maxSpeed *= this.boostMul || 1.9; accel *= 1.5; }
    if (this.empTimer > 0) { maxSpeed *= 0.45; accel *= 0.45; }

    // slope resistance: climbing costs speed, descending gives a little back
    terrainNormal(this.pos.x, this.pos.z, _n);
    if (mLen > 0.01) {
      const grad = -(_n.x * mx + _n.z * mz) / Math.max(0.2, _n.y);
      const k = grad > 0
        ? 1 / (1 + grad * PHYS.slopeDrag)
        : 1 + Math.min(0.35, -grad * 0.4);
      maxSpeed *= clamp(k, 0.18, 1.4);
      accel *= clamp(k, 0.25, 1.3);
    }
    this.currentMaxSpeed = maxSpeed;

    this.vel.x += mx * accel * dt;
    this.vel.z += mz * accel * dt;
    const dampK = Math.min(1, PHYS.damp * dt);
    this.vel.x -= this.vel.x * dampK;
    this.vel.z -= this.vel.z * dampK;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > maxSpeed) {
      this.vel.x *= maxSpeed / sp;
      this.vel.z *= maxSpeed / sp;
    }
    this.speed = Math.min(sp, maxSpeed);

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    // arena bounds — a soft wall that pushes back rather than a hard clamp
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > FIELD_R) {
      const k = FIELD_R / r;
      this.pos.x *= k;
      this.pos.z *= k;
      this.vel.multiplyScalar(0.6);
    }

    // scenery collisions
    const rad = PHYS.tankRadius * (this.boss ? 1.35 : 1);
    for (const o of obstacles) {
      const dx = this.pos.x - o.grp.position.x;
      const dz = this.pos.z - o.grp.position.z;
      const minD = o.r + rad;
      const d = Math.hypot(dx, dz);
      if (d < minD && d > 1e-5) {
        const push = (minD - d) / d;
        this.pos.x += dx * push;
        this.pos.z += dz * push;
        this.vel.multiplyScalar(0.86);
      }
    }
    crushCheck(this.pos.x, this.pos.z, rad, this.speed, this.isPlayer);

    // ram damage while boosting
    if (this.boostTimer > 0 && this.ramDmg) {
      for (const t of state.tanks) {
        if (t === this || !t.alive) continue;
        if (t.pos.distanceTo(this.pos) < rad + PHYS.tankRadius + 0.4) {
          t.damage(this.ramDmg * dt * 3, this, this.pos, { kind: 'ram' });
          this.vel.multiplyScalar(0.5);
        }
      }
    }

    // sit on the ground and lean into the slope
    const gh = terrainHeight(this.pos.x, this.pos.z);
    this.pos.y = lerp(this.pos.y, gh, damp(18, dt));

    if (this.speed > 1.4) {
      const targetYaw = dirToYaw(this.vel.x, this.vel.z);
      const turnRate = (this.trackTimer > 0 ? 1.4 : 3.0) * (this.boss ? 0.7 : 1);
      this.yaw = angStep(this.yaw, targetYaw, turnRate * dt);
    }
    this.grp.rotation.y = this.yaw;

    const fwdGrad = -(_n.x * this.forwardX + _n.z * this.forwardZ) / Math.max(0.2, _n.y);
    const rightX = Math.cos(this.yaw), rightZ = -Math.sin(this.yaw);
    const rightGrad = -(_n.x * rightX + _n.z * rightZ) / Math.max(0.2, _n.y);
    this.tiltG.rotation.x = lerp(this.tiltG.rotation.x, Math.atan(fwdGrad), damp(9, dt));
    this.tiltG.rotation.z = lerp(this.tiltG.rotation.z, Math.atan(rightGrad), damp(9, dt));

    // suspension squat/lean from acceleration
    const cos = Math.cos(this.yaw), sin = Math.sin(this.yaw);
    const localVx = this.vel.x * cos - this.vel.z * sin;
    const localVz = this.vel.x * sin + this.vel.z * cos;
    this.leanG.rotation.x = lerp(this.leanG.rotation.x,
      clamp(-localVz * 0.008, -0.08, 0.08), damp(PHYS.suspension, dt));
    this.leanG.rotation.z = lerp(this.leanG.rotation.z,
      clamp(localVx * 0.01, -0.1, 0.1), damp(PHYS.suspension, dt));

    // track dust
    if (this.speed > 4) {
      this.dustT = (this.dustT || 0) - dt;
      if (this.dustT <= 0) {
        this.dustT = 0.09;
        _v.set(this.pos.x - this.forwardX * 2.2, this.pos.y + 0.3, this.pos.z - this.forwardZ * 2.2);
        spawnSmoke(_v, {
          scale: 0.7, life: 0.85, colour: 0xb5a68c, rise: 0.9, drift: 0.5,
          opacity: 0.22, grow: 3.4,
        });
      }
    }
  }

  aimTurret(dt) {
    let traverse = this.stats.traverse;
    if (this.turretTimer > 0) traverse *= 0.35;
    if (this.empTimer > 0) traverse *= 0.15;

    this.turretG.getWorldPosition(_v);
    const dx = this.aimPoint.x - _v.x;
    const dz = this.aimPoint.z - _v.z;
    const wantYaw = dirToYaw(dx, dz);
    this.turretYaw = angStep(this.turretYaw, wantYaw, traverse * dt);
    this.turretG.rotation.y = this.turretYaw - this.yaw;

    // elevation comes from the ballistic solution when there is one
    let wantPitch;
    if (this.aimSolution && this.aimSolution.valid) {
      wantPitch = this.aimSolution.pitch;
    } else {
      const dy = this.aimPoint.y - _v.y;
      wantPitch = Math.atan2(dy, Math.hypot(dx, dz));
    }
    const maxEl = this.gun.arc === 'high' ? 1.35 : 0.62;
    wantPitch = clamp(wantPitch, -0.14, maxEl);
    this.barrelPitch = lerp(this.barrelPitch, wantPitch, damp(7, dt));
    this.barrelG.rotation.x = this.barrelPitch;

    this.aimError = Math.abs(angDiff(this.turretYaw, wantYaw));
  }

  updateFx(dt) {
    if (this.recoil > 0) {
      this.recoil = Math.max(0, this.recoil - dt * 4.5);
      this.barrelG.position.z = this.barrelBaseZ + this.recoil * 0.5;
      this.leanG.rotation.x += this.recoil * 0.012;
    }
    for (const f of this.muzzleFlash) {
      if (f.scale.x > 0.002) {
        f.scale.multiplyScalar(Math.pow(0.00005, dt));
        if (f.scale.x < 0.002) f.scale.setScalar(0.001);
      }
    }
    if (this.hpFrac < 0.35) {
      this.dmgSmokeT = (this.dmgSmokeT || 0) - dt;
      if (this.dmgSmokeT <= 0) {
        this.dmgSmokeT = this.hpFrac < 0.18 ? 0.22 : 0.45;
        _v.copy(this.pos);
        _v.y += 2.1;
        spawnSmoke(_v, {
          scale: 0.9, life: 1.5, colour: this.hpFrac < 0.18 ? 0x3a3632 : 0x6a6560,
          rise: 3.2, opacity: 0.45, grow: 2.6,
        });
      }
    }
  }

  updateWreck(dt) {
    this.deadT += dt;
    if (this.smokePlume > 0) {
      this.smokePlume -= dt;
      this.plumeT = (this.plumeT || 0) - dt;
      if (this.plumeT <= 0) {
        this.plumeT = 0.28;
        _v.copy(this.pos);
        _v.y += 1.6;
        spawnSmoke(_v, {
          scale: 1.5, life: 2.6, colour: 0x2e2b28, rise: 3.6, opacity: 0.5, grow: 3.0,
        });
      }
    }
    const gh = terrainHeight(this.pos.x, this.pos.z);
    this.pos.y = lerp(this.pos.y, gh, damp(6, dt));
  }

  // ---- combat ------------------------------------------------------------

  // Facing multiplier for a hit arriving from `fromPos`.
  facingMul(fromPos) {
    const dx = fromPos.x - this.pos.x;
    const dz = fromPos.z - this.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    const dot = (dx / len) * this.forwardX + (dz / len) * this.forwardZ;
    if (dot > 0.55) return { mul: COMBAT.frontMul, face: 'FRONT', dot };
    if (dot < -0.55) return { mul: COMBAT.rearMul, face: 'REAR', dot };
    return { mul: COMBAT.sideMul, face: 'SIDE', dot };
  }

  damage(amount, attacker, fromPos = null, opts = {}) {
    if (!this.alive || amount <= 0) return 0;
    let dmg = amount * this.stats.dmgTakenMul;
    let face = null;
    if (fromPos && opts.kind !== 'splash') {
      const f = this.facingMul(fromPos);
      dmg *= f.mul;
      face = f.face;
    }
    // stats record damage actually removed, so an overkill hit cannot inflate
    // the score with hit points the target never had
    dmg = Math.min(Math.max(1, dmg), this.hp);
    this.hp -= dmg;
    this.lastHitT = state.time;
    this.hitFlashT = 0.12;
    if (attacker && attacker !== this) this.lastAttacker = attacker;

    // crits
    if (opts.kind === 'shell') {
      if (Math.random() < COMBAT.trackHitChance) {
        this.trackTimer = COMBAT.trackSlowTime;
        emit('crit', { tank: this, kind: 'TRACKS', attacker });
      } else if (Math.random() < COMBAT.turretHitChance) {
        this.turretTimer = COMBAT.turretSlowTime;
        emit('crit', { tank: this, kind: 'TURRET', attacker });
      }
    }

    emit('damage', {
      tank: this, amount: dmg, attacker, face,
      kind: opts.kind || 'shell', pos: opts.at || this.pos,
    });

    if (this.isPlayer) {
      addShake(0.16 + Math.min(0.3, dmg / 120));
      AudioFX.clang(0.9);
      state.damageTaken += dmg;
    } else if (attacker && attacker.isPlayer) {
      state.damageDealt += dmg;
    }

    if (this.hp <= 0) {
      this.hp = 0;
      this.die(attacker, fromPos);
    }
    return dmg;
  }

  die(attacker, fromPos) {
    if (!this.alive) return;
    this.alive = false;
    this.wantFire = false;
    this.moveDir.set(0, 0);
    this.vel.set(0, 0, 0);
    this.smokePlume = 14;

    _v.copy(this.pos);
    _v.y += 1.2;
    spawnExplosion(_v, {
      scale: this.boss ? 2.6 : 1.7, colour: 0xffa843,
      craterR: this.boss ? 7 : 4.2, craterD: this.boss ? 1.4 : 0.7,
    });
    spawnDebris(_v, this.boss ? 22 : 13, 1.5);
    spawnSparks(_v, 12, null, 1.4);
    damagePropsInRadius(this.pos, this.boss ? 12 : 7, 45, 1.2,
      !!(attacker && attacker.isPlayer));

    // burnt-out hull left on the field
    this.savedMats = [
      this.hullMesh.material,
      this.turretMesh ? this.turretMesh.material : null,
      this.barrelMesh ? this.barrelMesh.material : null,
    ];
    this.hullMesh.material = burntMat;
    if (this.turretMesh) this.turretMesh.material = burntMat;
    if (this.barrelMesh) this.barrelMesh.material = burntMat;
    for (const m of this.accentMeshes) m.visible = false;
    this.tiltG.rotation.z += rand(-0.14, 0.14);
    this.turretG.rotation.y += rand(-0.5, 0.5);

    if (attacker && attacker !== this) attacker.kills++;
    emit('tank-killed', { victim: this, attacker, fromPos });
  }

  heal(amount) {
    this.hp = Math.min(this.hpMax, this.hp + amount);
  }

  healOverTime(total, dur) {
    this.healTimer = dur;
    this.healRate = total / dur;
  }

  dispose() {
    actorRoot.remove(this.grp);
    for (const m of [this.hullMesh, this.turretMesh, this.barrelMesh]) {
      if (m && m.geometry) m.geometry.dispose();
    }
    for (const m of this.accentMeshes) if (m.geometry) m.geometry.dispose();
    for (const f of this.muzzleFlash) f.geometry.dispose();
    if (this.flashMat) this.flashMat.dispose();
  }
}

// Pairwise separation so tanks jostle instead of overlapping.
export function separateTanks() {
  const ts = state.tanks;
  for (let i = 0; i < ts.length; i++) {
    const a = ts[i];
    if (!a.alive) continue;
    const ar = PHYS.tankRadius * (a.boss ? 1.35 : 1);
    for (let j = i + 1; j < ts.length; j++) {
      const b = ts[j];
      if (!b.alive) continue;
      const br = PHYS.tankRadius * (b.boss ? 1.35 : 1);
      const dx = b.pos.x - a.pos.x;
      const dz = b.pos.z - a.pos.z;
      const minD = ar + br;
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

export function updateAllTanks(dt) {
  for (const t of state.tanks) t.update(dt);
  separateTanks();
}
