// LASTWALL — Courier Seven: movement, auto-aim combat (melee close / gun far /
// temp override / manual super), boosts, damage intake incl. player-ragdoll.
import * as THREE from 'three';
import { CFG } from './config.js';
import { clamp, clampRects, angLerp, rand } from './utils.js';
import { makeHumanoid, makeWeaponMesh } from './models.js';
import { WEAPONS, MELEE_TIERS, GUN_TIERS } from './weapons.js';
import { spawnRagdoll, reattach } from './ragdoll.js';
import { nearestEnemy, enemies, damageEnemy } from './enemies.js';
import * as fx from './fx.js';
import { sfx } from './audio.js';

export function makePlayer(scene, meta, runMods) {
  const h = makeHumanoid('hero');
  scene.add(h.group);
  const wm = { current: null, muzzle: null };

  const P = {
    h, x: 0, z: 0, vx: 0, vz: 0, yaw: 0, alive: true, ragging: false, rag: null,
    iframes: 0, swingT: -1, slamT: -1, hurtFlash: 0,
    mods: runMods, // { dmg, atk, kb, spd, hp, lifesteal, crit, boostDur, superRate, serum }
    maxHp: 0, hp: 0,
    melee: WEAPONS[MELEE_TIERS[meta.up('meleeTier')]],
    gun: WEAPONS[GUN_TIERS[meta.up('gunTier')]],
    temp: null,   // { id, def, ammo, time }
    super: null,  // { id, def, charge 0..1 }
    boosts: { dmg: { mult: 1, t: 0 }, spd: { mult: 1, t: 0 }, shield: { t: 0 } },
    cd: 0, target: null, level: null,

    place(x, z) { this.x = x; this.z = z; h.group.position.set(x, CFG.wallH, z); },

    dmgMult() { return this.mods.dmg * this.boosts.dmg.mult; },
    kbMult() { return this.mods.kb * this.boosts.dmg.mult; }, // boosts launch — core pillar
    speed() { return CFG.player.speed * this.mods.spd * this.boosts.spd.mult; },

    setWeaponMesh(id) {
      if (wm.id === id) return;
      if (wm.current) h.handR.remove(wm.current);
      const w = makeWeaponMesh(id);
      w.group.rotation.x = Math.PI / 2; // barrel forward when arm points ahead
      h.handR.add(w.group);
      wm.current = w.group; wm.muzzle = w.muzzle; wm.id = id;
    },

    activeGun() { return this.temp && (this.temp.ammo > 0 || this.temp.time > 0) ? this.temp.def : this.gun; },

    tick(dt, t, input) {
      if (!this.alive || this.ragging) return;
      this.iframes -= dt; this.cd -= dt; this.hurtFlash = Math.max(0, this.hurtFlash - dt * 3);
      // boosts decay
      for (const k of ['dmg', 'spd']) { const b = this.boosts[k]; if (b.t > 0) { b.t -= dt; if (b.t <= 0) b.mult = 1; } }
      if (this.boosts.shield.t > 0) this.boosts.shield.t -= dt;
      // super charge
      if (this.super && this.super.charge < 1) {
        this.super.charge = Math.min(1, this.super.charge + dt / this.super.def.recharge * this.mods.superRate);
        if (this.super.charge >= 1) { sfx.superReady(); this.superAnnounced || (this.superAnnounced = true, fx.addShake(.1)); }
      }

      // movement
      const sp = this.speed() * (input.sprint ? CFG.player.sprint / CFG.player.speed : 1);
      const ax = input.x * input.mag * sp, az = input.z * input.mag * sp;
      this.vx += (ax - this.vx) * Math.min(1, CFG.player.accel * dt / sp * 2);
      this.vz += (az - this.vz) * Math.min(1, CFG.player.accel * dt / sp * 2);
      this.x += this.vx * dt; this.z += this.vz * dt;
      const c = clampRects(this.level.rects, this.x, this.z, CFG.player.radius);
      this.x = c.x; this.z = c.z;
      h.group.position.set(this.x, CFG.wallH, this.z);

      // aim: nearest enemy
      this.target = nearestEnemy(this.x, this.z, CFG.player.aimRange);
      const moving = Math.hypot(this.vx, this.vz);
      if (this.target) {
        this.yaw = angLerp(this.yaw, Math.atan2(this.target.x - this.x, this.target.z - this.z), 1 - Math.exp(-14 * dt));
      } else if (moving > 1) {
        this.yaw = angLerp(this.yaw, Math.atan2(this.vx, this.vz), 1 - Math.exp(-10 * dt));
      }
      h.group.rotation.y = this.yaw;
      h.animate(t, clamp(moving / CFG.player.sprint, 0, 1), dt);

      // combat
      const gun = this.activeGun();
      let pose = 'idle';
      if (this.target) {
        const dist = Math.hypot(this.target.x - this.x, this.target.z - this.z);
        const useMelee = !this.temp && dist < CFG.player.meleeEngage;
        const def = useMelee ? this.melee : gun;
        pose = useMelee ? 'melee' : 'aim';
        if (this.cd <= 0 && dist < (useMelee ? this.melee.range + 1.2 : def.range)) {
          this.cd = def.cd / this.mods.atk;
          if (useMelee) this.swing(def);
          else this.fire(def, dist);
        }
      }
      this.setWeaponMesh(this.temp ? this.temp.id : (pose === 'melee' || (!this.target && moving < 1)) ? meleeId(this) : gunId(this));
      this.posture(pose, dt, t);

      // slam anim (super maul)
      if (this.slamT >= 0) {
        this.slamT += dt;
        const k = this.slamT / .5;
        h.body.position.y = h.s * (1 + Math.sin(Math.min(1, k) * Math.PI) * .8);
        if (k >= 1) this.slamT = -1;
      }
      // boost glow
      const glow = this.boosts.dmg.mult > 1;
      h.parts.chest.mesh.material.emissive = h.parts.chest.mesh.material.emissive || new THREE.Color(0);
      h.parts.chest.mesh.material.emissive.setHex(glow ? 0x7a1802 : 0x000000);
      h.parts.chest.mesh.material.emissiveIntensity = glow ? (1 + Math.sin(t * 10) * .4) : 0;
    },

    posture(pose, dt, t) {
      const p = h.parts;
      if (pose === 'aim') {
        // pitch toward target height (flat: aim level)
        p.uarmR.pivot.rotation.set(-1.35, 0, .06);
        p.farmR.pivot.rotation.x = -.15;
        p.uarmL.pivot.rotation.set(-.9, 0, -.4);
        p.farmL.pivot.rotation.x = -.7;
      } else if (pose === 'melee') {
        if (this.swingT >= 0) {
          this.swingT += dt;
          const k = Math.min(1, this.swingT / .22);
          p.uarmR.pivot.rotation.set(-2.6 + k * 2.4, 0, .3 - k * .5);
          p.farmR.pivot.rotation.x = -.4;
          if (this.swingT > .32) this.swingT = -1;
        } else {
          p.uarmR.pivot.rotation.set(-2.2, 0, .35); p.farmR.pivot.rotation.x = -.5;
        }
      }
    },

    swing(def) {
      this.swingT = 0;
      sfx.swing();
      // damage lands slightly into the swing
      setTimeout(() => {
        if (!this.alive) return;
        const dm = this.dmgMult(), crit = Math.random() < this.mods.crit;
        const dmg = def.dmg * dm * (crit ? 2 : 1);
        const kbI = def.kb * this.kbMult() * (crit ? 1.6 : 1);
        let hit = 0;
        for (const e of [...enemies]) {
          if (e.dead || e.state === 'rag') continue;
          const dx = e.x - this.x, dz = e.z - this.z, d = Math.hypot(dx, dz);
          if (d > def.range + .4) continue;
          let ang = Math.atan2(dx, dz) - this.yaw;
          while (ang > Math.PI) ang -= 2 * Math.PI; while (ang < -Math.PI) ang += 2 * Math.PI;
          if (Math.abs(ang) > def.arc) continue;
          damageEnemy(e, dmg, dx / (d || 1), dz / (d || 1), kbI);
          hit++;
        }
        if (hit) { sfx.thud(); fx.hitstop(.045 * Math.min(3, hit)); fx.addShake(.12 * hit); this.heal(dmg * this.mods.lifesteal * hit); }
        // crates
        this.level.crates?.forEach(cr => {
          if (cr.dead) return;
          const d = Math.hypot(cr.x - this.x, cr.z - this.z);
          if (d < def.range + .6) breakCrate(cr, this);
        });
      }, 120);
    },

    fire(def, dist) {
      const from = new THREE.Vector3();
      (wm.muzzle || h.handR).getWorldPosition(from);
      const dm = this.dmgMult();
      const pellets = def.pellets || 1;
      if (def.type === 'flame') sfx.flame(); else if (pellets > 1) sfx.scatter(); else if (def.cd < .15) sfx.smg(); else if (def.dmg > 30) sfx.heavyShot(); else sfx.shot();
      // multi-pellet weapons spray the cone and can hit several enemies
      const coneTargets = pellets > 1 ? enemies.filter(o => {
        if (o.dead || o.state === 'rag') return false;
        const d = Math.hypot(o.x - this.x, o.z - this.z);
        if (d > def.range + 1) return false;
        let ang = Math.atan2(o.x - this.x, o.z - this.z) - this.yaw;
        while (ang > Math.PI) ang -= 2 * Math.PI; while (ang < -Math.PI) ang += 2 * Math.PI;
        return Math.abs(ang) < .5;
      }) : null;
      for (let i = 0; i < pellets; i++) {
        const crit = Math.random() < this.mods.crit;
        const dmg = def.dmg * dm * (crit ? 2 : 1);
        const kbI = def.kb * this.kbMult() * (crit ? 1.6 : 1);
        // hitscan at target with spread: chance to miss → tracer into distance
        const spread = (def.spread || 0) * (1 + i * .4);
        const missAng = rand(-spread, spread) * Math.PI * 2;
        const hitit = pellets > 1 ? (coneTargets.length > 0 && Math.random() < .8) : Math.abs(missAng) < 0.06 + 1.2 / (dist + 1);
        const e = pellets > 1 && coneTargets?.length ? coneTargets[Math.floor(Math.random() * coneTargets.length)] : this.target;
        let to;
        if (e && hitit) {
          to = new THREE.Vector3(e.x, CFG.wallH + 1.1, e.z);
          damageEnemy(e, dmg, Math.sin(this.yaw), Math.cos(this.yaw), kbI);
          this.heal(dmg * this.mods.lifesteal);
          if (def.burn) e.burnT = def.burn;
          if (def.pierce) { // hit one behind too
            let behind = null, bd = 1e9;
            for (const o of enemies) {
              if (o === e || o.dead || o.state === 'rag') continue;
              const d2 = Math.hypot(o.x - this.x, o.z - this.z);
              if (d2 > dist && d2 < def.range && d2 < bd) { bd = d2; behind = o; }
            }
            if (behind) damageEnemy(behind, dmg * .7, Math.sin(this.yaw), Math.cos(this.yaw), kbI * .7);
          }
        } else {
          const a = this.yaw + missAng;
          to = new THREE.Vector3(this.x + Math.sin(a) * def.range, CFG.wallH + 1 + rand(-.4, .8), this.z + Math.cos(a) * def.range);
        }
        if (def.type === 'flame') fx.flash(from.clone().lerp(to, .4), 0xff7a2a, .8, .14);
        else fx.tracer(from, to, def.dmg > 30 ? 0xffe0a0 : 0xffd28a);
      }
      // ammo/time spend
      if (this.temp) {
        if (this.temp.ammo !== undefined) { this.temp.ammo--; if (this.temp.ammo <= 0) this.dropTemp('SPENT'); }
        else if (this.temp.time !== undefined) { this.temp.time -= def.cd; if (this.temp.time <= 0) this.dropTemp('SPENT'); }
      }
      // crates in the line of fire (close range only, cheap)
      this.level.crates?.forEach(cr => {
        if (cr.dead) return;
        const d = Math.hypot(cr.x - this.x, cr.z - this.z);
        if (d < 3) breakCrate(cr, this);
      });
    },

    superFire() {
      if (!this.alive || this.ragging || !this.super || this.super.charge < 1) return false;
      const def = this.super.def;
      this.super.charge = 0; this.superAnnounced = false;
      sfx.superFire();
      const dm = this.dmgMult();
      if (def.radius) { // GRAVITY MAUL — radial launch party
        this.slamT = 0;
        fx.ring(new THREE.Vector3(this.x, CFG.wallH, this.z), 0xa97fff, def.radius * 1.7, .55);
        fx.flash(new THREE.Vector3(this.x, CFG.wallH + 1, this.z), 0xc2a0ff, 3, .3);
        fx.addShake(1.1); fx.hitstop(.1); fx.slowmo(.8);
        for (const e of [...enemies]) {
          if (e.dead) continue;
          const dx = e.x - this.x, dz = e.z - this.z, d = Math.hypot(dx, dz);
          if (d < def.radius) {
            const fall = 1 - d / def.radius * .5;
            damageEnemy(e, def.dmg * dm * fall, dx / (d || 1), dz / (d || 1), def.kb * this.kbMult() * fall);
          }
        }
        this.level.crates?.forEach(cr => { if (!cr.dead && Math.hypot(cr.x - this.x, cr.z - this.z) < def.radius) breakCrate(cr, this); });
      } else { // HOWLER CANNON — forward cone sweep
        fx.addShake(.8); fx.slowmo(.6);
        fx.ring(new THREE.Vector3(this.x + Math.sin(this.yaw) * 4, CFG.wallH, this.z + Math.cos(this.yaw) * 4), 0xa97fff, def.range, .6);
        for (const e of [...enemies]) {
          if (e.dead) continue;
          const dx = e.x - this.x, dz = e.z - this.z, d = Math.hypot(dx, dz);
          if (d > def.range) continue;
          let ang = Math.atan2(dx, dz) - this.yaw;
          while (ang > Math.PI) ang -= 2 * Math.PI; while (ang < -Math.PI) ang += 2 * Math.PI;
          if (Math.abs(ang) > def.cone) continue;
          damageEnemy(e, def.dmg * dm, dx / (d || 1), dz / (d || 1), def.kb * this.kbMult() + def.lift);
        }
      }
      return true;
    },

    dropTemp(label) { this.temp = null; if (label) this.onTempGone?.(label); },

    heal(a) { if (a > 0) this.hp = Math.min(this.maxHp, this.hp + a); },

    hurt(dmg, dirX, dirZ, kbImpulse = 8) {
      if (!this.alive || this.iframes > 0) return;
      if (this.boosts.shield.t > 0) { sfx.crack(); fx.ring(new THREE.Vector3(this.x, CFG.wallH + 1, this.z), 0x7fd0ff, 2.4, .3); return; }
      this.hp -= dmg;
      this.iframes = CFG.player.iframes;
      this.hurtFlash = 1;
      sfx.hurt(); fx.addShake(.3 + kbImpulse * .004); fx.blood(new THREE.Vector3(this.x, CFG.wallH + 1.2, this.z), 6, 3);
      if (this.hp <= 0) { this.die(dirX, dirZ, kbImpulse); return; }
      if (kbImpulse >= CFG.player.ragdollThresh) {
        // player ragdolls but CANNOT leave the wall while alive
        this.ragging = true;
        const v = new THREE.Vector3(dirX * kbImpulse * .35, 2 + kbImpulse * .16, dirZ * kbImpulse * .35);
        this.rag = spawnRagdoll(h, v, {
          onRagdollGone: () => {},
        }, { dead: false, keepOn: true });
        this.rag.entIsPlayer = true;
      } else {
        this.vx += dirX * kbImpulse * .8; this.vz += dirZ * kbImpulse * .8;
      }
    },

    // called by main via ragdoll getup callback
    standUp(rag) {
      const pos = reattach(rag);
      this.rag = null; this.ragging = false;
      const c = clampRects(this.level.rects, pos.x, pos.z, CFG.player.radius);
      this.x = c.x; this.z = c.z; this.vx = this.vz = 0;
      h.group.position.set(this.x, CFG.wallH, this.z);
      this.iframes = 1.2;
    },

    die(dirX, dirZ, kbImpulse) {
      this.alive = false; this.ragging = true;
      sfx.die();
      // death launch — the only time the hero can leave the wall
      const v = new THREE.Vector3(dirX * Math.max(20, kbImpulse) * .5, 6 + kbImpulse * .18, dirZ * Math.max(20, kbImpulse) * .5);
      this.rag = spawnRagdoll(h, v, { onRagdollGone: () => {} }, { dead: true, keepOn: false });
      fx.slowmo(1.4);
      this.onDeath?.();
    },
  };
  return P;
}

function meleeId(P) { return Object.entries(WEAPONS).find(([, d]) => d === P.melee)[0]; }
function gunId(P) { return Object.entries(WEAPONS).find(([, d]) => d === P.gun)[0]; }

export function breakCrate(cr, P) {
  cr.dead = true;
  cr.mesh.removeFromParent();
  sfx.crack();
  for (let i = 0; i < 6; i++) fx.chunk(new THREE.Vector3(cr.x, CFG.wallH + .8, cr.z), new THREE.Vector3(rand(-4, 4), rand(3, 7), rand(-4, 4)), .34, 0x6e4a2a);
  if (cr.boom) {
    fx.explosion(new THREE.Vector3(cr.x, CFG.wallH + .6, cr.z), 4.5);
    sfx.boom();
    for (const e of [...enemies]) {
      if (e.dead) continue;
      const dx = e.x - cr.x, dz = e.z - cr.z, d = Math.hypot(dx, dz);
      if (d < 5) damageEnemy(e, 60, dx / (d || 1), dz / (d || 1), 50);
    }
    const pd = Math.hypot(P.x - cr.x, P.z - cr.z);
    if (pd < 4) P.hurt(16, (P.x - cr.x) / (pd || 1), (P.z - cr.z) / (pd || 1), 30);
  } else if (Math.random() < .5) {
    cr.drop?.();
  }
}
