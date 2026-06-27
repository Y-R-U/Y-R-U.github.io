// The player: HP, ammo (per kind), owned weapons, movement from the on-screen
// joystick, and the auto-aim combat loop. Each frame main moves the player,
// asks aim.js for a locked target, then calls combat(): the body turns onto the
// target and the weapon auto-fires (guns) or auto-swings (melee). Drives the
// shared rig + the weapon arsenal (weapons.js).

import * as THREE from 'three';
import { CFG, SITES } from './config.js';
import { clamp, lerpAngle, rand } from './utils.js';
import { WEAPONS, AMMO_KINDS } from './weapons.js';
import * as fx from './fx.js';

export function createPlayer(rig, world, scene, bus) {
  const pos = new THREE.Vector3(SITES.home.x, 0, SITES.home.z);
  const p = {
    rig, pos, yaw: Math.PI,
    hp: CFG.maxHp, maxHp: CFG.maxHp,
    ammo: { '9mm': 24, shells: 0, rifle: 0 },
    medkits: 1,
    weapons: ['axe', 'pistol'],
    curWeapon: 'axe',
    score: 0, kills: 0, combo: 0, comboTimer: 0,
    atkCd: 0, combatT: 0, moving: false, walk: 0, alive: true,
    aiming: false, target: null, _dry: false, _moveYaw: Math.PI, _dt: 0.016,
  };

  // current area (town by default; interiors swap these in)
  p.heightAt = (x, z) => world.groundHeight(x, z);
  p.clampPos = (v) => { const H = CFG.townHalf - 1; v.x = clamp(v.x, -H, H); v.z = clamp(v.z, -H, H); };
  p.setArea = (a) => { p.heightAt = a.heightAt; p.clampPos = a.clampPos; };

  rig.setWeapon(p.curWeapon);

  // ── inventory / weapons ──
  p.weaponDef = () => WEAPONS[p.curWeapon];
  p.hasWeapon = (id) => p.weapons.includes(id);
  p.giveWeapon = (id) => { if (!WEAPONS[id]) return false; const fresh = !p.hasWeapon(id); if (fresh) p.weapons.push(id); selectWeapon(id); return fresh; };
  function selectWeapon(id) {
    if (!p.hasWeapon(id)) return;
    p.curWeapon = id; rig.setWeapon(id); p._dry = false;
    bus.weaponChanged?.(id);
  }
  p.selectWeapon = selectWeapon;
  p.cycleWeapon = () => { const i = p.weapons.indexOf(p.curWeapon); selectWeapon(p.weapons[(i + 1) % p.weapons.length]); };
  p.addAmmo = (kind, n) => { if (!AMMO_KINDS.includes(kind)) return; p.ammo[kind] = (p.ammo[kind] || 0) + n; p._dry = false; bus.ammoChanged?.(); };
  p.curAmmo = () => { const d = p.weaponDef(); return d.ammo ? (p.ammo[d.ammo] || 0) : Infinity; };

  // ── medkit ──
  p.useMedkit = () => {
    if (p.medkits <= 0) { bus.toast?.('🩹 No medkits.'); return; }
    if (p.hp >= p.maxHp) { bus.toast?.('❤️ Already at full health.'); return; }
    p.medkits--; p.hp = clamp(p.hp + 55, 0, p.maxHp);
    bus.toast?.('🩹 Patched up (+55 HP)'); bus.hpChanged?.(); bus.invChanged?.();
  };
  p.addMedkit = (n = 1) => { p.medkits += n; bus.invChanged?.(); };

  // ── damage / death ──
  p.takeDamage = (dmg, fromPos, attacker) => {
    if (!p.alive) return;
    p.hp = clamp(p.hp - dmg, 0, p.maxHp);
    p.combatT = CFG.regenDelay;
    fx.splat(new THREE.Vector3(pos.x, pos.y + 1.6, pos.z), dmg);
    bus.hurt?.(dmg);
    bus.hpChanged?.();
    if (p.hp <= 0) die();
  };
  function die() { p.alive = false; rig.forceIdle?.(); bus.died?.(); }
  p.respawn = () => {
    p.alive = true; p.hp = p.maxHp; pos.set(SITES.home.x, 0, SITES.home.z);
    p.target = null; p.combatT = 0; bus.hpChanged?.();
  };

  // ── movement (camera-relative joystick vector {x,z,mag,run}) ──
  p.faceDir = () => new THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw));
  p.muzzle = () => rig.muzzle();

  p.move = (dt, t, mv) => {
    p._dt = dt;
    if (!p.alive) { pos.y = p.heightAt(pos.x, pos.z); rig.group.position.set(pos.x, pos.y, pos.z); return; }
    const mag = mv ? Math.min(1, Math.hypot(mv.x, mv.z)) : 0;
    p.moving = mag > 0.06;
    if (p.moving) {
      const speed = (mv.run ? CFG.runSpeed : CFG.playerSpeed) * mag;
      pos.x += (mv.x / mag) * speed * dt;
      pos.z += (mv.z / mag) * speed * dt;
      p.clampPos(pos);
      p._moveYaw = Math.atan2(mv.x, mv.z);
      if (!p.target) p.yaw = lerpAngle(p.yaw, p._moveYaw, 1 - Math.exp(-12 * dt));
    }
    p.walk = p.moving ? 1 : 0;
    pos.y = p.heightAt(pos.x, pos.z);
    rig.group.position.set(pos.x, pos.y, pos.z);
    rig.group.rotation.y = p.yaw;   // provisional facing (muzzle/laser valid)
  };

  // ── combat: turn onto the locked target + auto-fire / swing ──
  p.combat = (dt, t, target) => {
    if (p.atkCd > 0) p.atkCd -= dt;
    if (p.combatT > 0) p.combatT -= dt;
    if (p.comboTimer > 0) { p.comboTimer -= dt; if (p.comboTimer <= 0 && p.combo > 0) { p.combo = 0; bus.combo?.(0, 1); } }
    const def = p.weaponDef();
    p.target = (target && target.alive) ? target : null;
    if (p.alive && p.target) {
      const dx = p.target.group.position.x - pos.x, dz = p.target.group.position.z - pos.z;
      p.yaw = lerpAngle(p.yaw, Math.atan2(dx, dz), 1 - Math.exp(-CFG.aimTurn * dt));
      const dist = Math.hypot(dx, dz);
      p.aiming = def.kind === 'gun';
      if (p.atkCd <= 0 && dist <= def.range * (def.kind === 'melee' ? 1.08 : 1.05)) {
        if (def.kind === 'gun') fireGun(def, p.target); else meleeSwing(def, p.target);
      }
    } else {
      p.aiming = false;
      if (p.alive && p.moving) p.yaw = lerpAngle(p.yaw, p._moveYaw, 1 - Math.exp(-12 * dt));
    }
    rig.group.rotation.y = p.yaw;
    rig.setAiming?.(p.aiming);
    const bob = rig.animate(t, p.walk);
    // full sync: collision (resolvePlayer) ran after move() and may have pushed
    // pos.x/z, so write the whole transform here, not just y — keeps the body,
    // muzzle and laser consistent with the resolved position.
    rig.group.position.set(pos.x, pos.y + bob, pos.z);
    rig.tickCombat?.(p._dt, t, p.walk);

    if (p.alive && p.combatT <= 0 && p.hp < p.maxHp) { p.hp = clamp(p.hp + CFG.regenDps * dt, 0, p.maxHp); bus.hpChanged?.(); }
  };

  const _dir = new THREE.Vector3();
  function fireGun(def, target) {
    if (def.ammo && (p.ammo[def.ammo] || 0) <= 0) {
      if (!p._dry) { p._dry = true; bus.toast?.(`🔫 Out of ${def.ammo} — switch weapon or find ammo.`); bus.dryFire?.(); }
      return;
    }
    if (def.ammo) { p.ammo[def.ammo]--; bus.ammoChanged?.(); }
    p.atkCd = def.cd; p.combatT = 4;
    const muzzle = rig.muzzle(); rig.fire();
    fx.muzzleFlash(muzzle);
    const aimAt = target.aimPoint();
    const pellets = def.pellets || 1;
    let total = 0;
    for (let i = 0; i < pellets; i++) {
      const end = aimAt.clone();
      if (def.spread) { end.x += rand(-1, 1) * def.spread * 6; end.y += rand(-1, 1) * def.spread * 3; end.z += rand(-1, 1) * def.spread * 6; }
      fx.tracer(muzzle, end);
      total += Math.round(rand(def.dmg[0], def.dmg[1]));
    }
    _dir.set(aimAt.x - muzzle.x, 0, aimAt.z - muzzle.z).normalize();
    const res = target.hurt(total, _dir);
    if (res?.dead) onKill(target);
    bus.shot?.(def);
  }
  function meleeSwing(def, target) {
    const started = rig.swing(() => {
      if (!target.alive) return;
      const dx = target.group.position.x - pos.x, dz = target.group.position.z - pos.z;
      if (Math.hypot(dx, dz) > def.range * 1.3) return;   // they moved out of reach
      _dir.set(dx, 0, dz).normalize();
      const res = target.hurt(Math.round(rand(def.dmg[0], def.dmg[1])), _dir);
      if (res?.dead) onKill(target);
    });
    if (!started) return;                 // already mid-swing — don't burn cd/event
    p.atkCd = def.cd; p.combatT = CFG.regenDelay;
    bus.swung?.(def);
  }
  // the zombie's own hurt()->kill() emits bus.zombieKilled (loot); here we just
  // tally the player's kill/score and drop the lock.
  // kill streak: chain kills within COMBO_WINDOW for a rising score multiplier
  const COMBO_WINDOW = 3.5;
  function onKill(z) {
    p.comboTimer = COMBO_WINDOW;
    p.combo += 1;
    const mult = 1 + Math.floor((p.combo - 1) / 2);   // x1, x2 at 3, x3 at 5, …
    p.kills++; p.score += 10 * mult;
    p.target = null;
    bus.combo?.(p.combo, mult);
  }

  // ── save / load (lean) ──
  p.serialize = () => ({
    pos: [pos.x, pos.z], yaw: p.yaw, hp: p.hp, ammo: p.ammo, medkits: p.medkits,
    weapons: p.weapons, cur: p.curWeapon, score: p.score, kills: p.kills,
  });
  p.load = (d) => {
    if (!d) return;
    pos.set(d.pos?.[0] || 0, 0, d.pos?.[1] ?? SITES.home.z); p.yaw = d.yaw || 0;
    p.hp = d.hp ?? p.maxHp; p.ammo = Object.assign({ '9mm': 0, shells: 0, rifle: 0 }, d.ammo || {});
    p.medkits = d.medkits ?? 0;
    // drop any weapon ids the current build no longer knows about, never empty
    p.weapons = (d.weapons || []).filter(id => WEAPONS[id]);
    if (!p.weapons.length) p.weapons = ['axe', 'pistol'];
    p.score = d.score || 0; p.kills = d.kills || 0;
    selectWeapon(d.cur && p.weapons.includes(d.cur) ? d.cur : p.weapons[0]);
  };

  return p;
}
