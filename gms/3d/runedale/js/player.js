// The player: RS-style stats/XP, HP pool (= Hitpoints level), 28-slot
// inventory + coins, a single weapon slot, run energy, movement (tap-to-move +
// WASD), melee combat (chase → draw → strike) and slow out-of-combat regen.
// Food exists to heal — there is no hunger. Drives the shared humanoid rig.

import * as THREE from 'three';
import { CFG, SITES } from './config.js';
import { clamp, lerpAngle } from './utils.js';
import { ITEMS } from './items.js';
import { SKILLS, levelForXp, maxHpFor, maxHit, hitChance, combatXp, HITPOINTS_START_XP } from './skills.js';
import * as fx from './fx.js';

export const INV_SLOTS = 28;
const MELEE_RANGE = 1.7;

export function createPlayer(rig, world, scene, bus) {
  const pos = new THREE.Vector3(SITES.spawn.x, 0, SITES.spawn.z);
  const p = {
    rig, pos, yaw: 0,
    skills: {}, hp: 10, maxHp: 10, gold: 0,
    items: [],                       // [{id, n}] — one entry = one pack slot
    weapon: null,                    // equipped weapon item id
    target: null, attackTarget: null,
    atkCd: 0, combatT: 0, moving: false,
    runMode: true, energy: 100,
    alive: true,
    _regenT: 0,
  };
  for (const s of SKILLS) p.skills[s] = { xp: 0 };
  p.skills.hitpoints.xp = HITPOINTS_START_XP;      // HP starts at level 10, like RS
  p.maxHp = maxHpFor(10); p.hp = p.maxHp;

  p.heightAt = (x, z) => world.groundHeight(x, z);
  p.clampPos = (v) => {
    const r = Math.hypot(v.x, v.z), maxR = CFG.worldRadius - 0.5;
    if (r > maxR) { v.x *= maxR / r; v.z *= maxR / r; }
    world.riverBlock(v);
  };

  const lvl = () => { const o = {}; for (const s of SKILLS) o[s] = levelForXp(p.skills[s].xp); return o; };
  p.levels = lvl;
  p.level = (s) => levelForXp(p.skills[s].xp);
  p.totalLevel = () => SKILLS.reduce((a, s) => a + levelForXp(p.skills[s].xp), 0);

  // ── inventory (28 slots; a stack = one slot) ──
  p.slotsUsed = () => p.items.length;
  p.countItem = (id) => p.items.reduce((a, s) => a + (s.id === id ? s.n : 0), 0);
  p.hasItem = (id) => p.countItem(id) > 0;
  p.addItem = (id, n = 1) => {
    const def = ITEMS[id]; if (!def) return 0;
    let added = 0;
    if (def.stack) {
      const s = p.items.find(i => i.id === id);
      if (s) { s.n += n; added = n; }
      else if (p.items.length < INV_SLOTS) { p.items.push({ id, n }); added = n; }
    } else {
      for (let k = 0; k < n && p.items.length < INV_SLOTS; k++) { p.items.push({ id, n: 1 }); added++; }
    }
    if (added < n) bus.toast?.('🎒 Your pack is full.');
    if (added) bus.invChanged?.();
    return added;
  };
  p.removeItem = (id, n = 1) => {
    let left = n;
    for (let i = p.items.length - 1; i >= 0 && left > 0; i--) {
      if (p.items[i].id !== id) continue;
      const take = Math.min(p.items[i].n, left); p.items[i].n -= take; left -= take;
      if (p.items[i].n <= 0) p.items.splice(i, 1);
    }
    if (left < n) bus.invChanged?.();
    return n - left;
  };
  p.gainGold = (n) => { p.gold += n; bus.invChanged?.(); };
  p.spendGold = (n) => { if (p.gold < n) return false; p.gold -= n; bus.invChanged?.(); return true; };

  // best owned tool of a type ('axe' | 'pickaxe' | 'net' | 'rod' | ...)
  p.bestTool = (tool) => {
    let best = null;
    for (const s of p.items) { const d = ITEMS[s.id]; if (d?.tool === tool && (!best || d.tier > best.tier)) best = d; }
    return best;
  };

  // ── xp / levels ──
  p.addXp = (skill, amount) => {
    if (!p.skills[skill] || amount <= 0) return;
    const before = levelForXp(p.skills[skill].xp);
    p.skills[skill].xp += amount;
    const after = levelForXp(p.skills[skill].xp);
    bus.xpDrop?.(skill, amount);
    if (after > before) {
      if (skill === 'hitpoints') { const nm = maxHpFor(after); p.hp += nm - p.maxHp; p.maxHp = nm; }
      bus.levelUp?.(skill, after);
    }
    bus.skillsChanged?.();
  };

  // ── eat / equip ──
  p.eat = (id) => {
    const def = ITEMS[id]; if (!def || !p.hasItem(id)) return;
    if (!def.heal) return bus.toast?.(`${def.icon} You can't eat that.`);
    const gain = Math.min(def.heal, p.maxHp - p.hp);
    p.removeItem(id, 1);
    p.hp = clamp(p.hp + def.heal, 0, p.maxHp);
    p.atkCd = Math.max(p.atkCd, 0.8);           // eating briefly delays your swing
    bus.toast?.(gain > 0 ? `${def.icon} You eat the ${def.name.toLowerCase()}. (+${gain} HP)` : `${def.icon} Tasty, but you were already full.`);
    bus.hpChanged?.(); bus.ate?.(id);
  };
  p.equip = (id) => {
    const def = ITEMS[id]; if (!def || def.cat !== 'weapon' || !p.hasItem(id)) return;
    if ((def.req || 1) > p.level('attack')) return bus.toast?.(`⚔️ You need Attack level ${def.req} to wield that.`);
    p.weapon = id;
    rig.setStyle?.('sword');
    bus.toast?.(`${def.icon} You wield the ${def.name}.`);
    bus.invChanged?.(); bus.equipped?.(id);
  };
  p.unequip = () => { p.weapon = null; bus.invChanged?.(); };
  const weaponDef = () => (p.weapon && p.hasItem(p.weapon)) ? ITEMS[p.weapon] : null;
  p.weaponDef = weaponDef;

  // ── movement intents ──
  p.setTarget = (v) => { p.target = v.clone ? v.clone() : new THREE.Vector3(v.x, 0, v.z); p.attackTarget = null; };
  p.attackCreature = (c) => { if (c && c.alive) { p.attackTarget = c; p.target = null; } };
  p.stop = () => { p.target = null; p.attackTarget = null; };
  p.toggleRun = () => { p.runMode = !p.runMode; bus.runChanged?.(p.runMode); };

  // ── taking damage ──
  p.takeDamage = (dmg, fromPos, attacker) => {
    if (!p.alive) return;
    const def = p.level('defence');
    // defence shrugs off a share of incoming hits entirely
    const dodge = Math.min(0.5, def * 0.01);
    const landed = Math.random() > dodge ? dmg : 0;
    p.hp = clamp(p.hp - landed, 0, p.maxHp);
    fx.splat(new THREE.Vector3(pos.x, pos.y + 1.5, pos.z), landed);
    if (landed > 0) bus.hurt?.(landed);
    bus.hpChanged?.();
    p.combatT = 5; p._regenT = 0;
    // auto-retaliate when idle
    if (attacker && attacker.alive && !p.attackTarget && !p.target) p.attackTarget = attacker;
    if (p.hp <= 0) die();
  };
  function die() {
    p.alive = false;
    rig.forceSheathe?.();
    bus.died?.();
  }
  p.respawn = () => {
    p.alive = true; p.hp = p.maxHp; p.energy = 100;
    pos.set(SITES.spawn.x, 0, SITES.spawn.z); p.stop();
    bus.hpChanged?.();
  };

  // ── per-frame update ──
  const _to = new THREE.Vector3();
  p.update = (dt, t, keyDir) => {
    if (!p.alive) { rig.group.position.set(pos.x, p.heightAt(pos.x, pos.z), pos.z); return; }

    if (p.combatT > 0) p.combatT -= dt;
    // slow RS-ish HP regen once safely out of combat
    if (p.combatT <= 0 && p.hp < p.maxHp) {
      p._regenT += dt;
      if (p._regenT > CFG.regenDelay) p.hp = clamp(p.hp + CFG.regenDps * dt, 0, p.maxHp);
    } else p._regenT = 0;

    // decide movement: WASD overrides tap; combat chase otherwise
    let mvx = 0, mvz = 0, wantMove = false;
    if (keyDir && (keyDir.x || keyDir.y)) {
      mvx = keyDir.x; mvz = keyDir.y; wantMove = true; p.target = null; p.attackTarget = null;
    } else if (p.attackTarget) {
      if (!p.attackTarget.alive) { p.attackTarget = null; }
      else {
        const c = p.attackTarget;
        _to.set(c.group.position.x - pos.x, 0, c.group.position.z - pos.z);
        const dist = _to.length();
        if (dist > MELEE_RANGE * 0.92) { _to.normalize(); mvx = _to.x; mvz = _to.z; wantMove = true; }
        else { p.yaw = Math.atan2(_to.x, _to.z); tryAttack(c); }
      }
    } else if (p.target) {
      _to.set(p.target.x - pos.x, 0, p.target.z - pos.z);
      const dist = _to.length();
      if (dist > 0.25) { _to.normalize(); mvx = _to.x; mvz = _to.z; wantMove = true; }
      else p.target = null;
    }

    // run energy: drains while running, trickles back otherwise
    const running = (p.runMode || keyDir?.run) && p.energy > 0.5;
    if (wantMove && running) p.energy = clamp(p.energy - CFG.runDrain * dt, 0, 100);
    else p.energy = clamp(p.energy + CFG.runRegen * dt, 0, 100);

    const speed = running ? CFG.runSpeed : CFG.playerSpeed;
    if (wantMove) {
      pos.x += mvx * speed * dt; pos.z += mvz * speed * dt;
      p.clampPos(pos);
      p.yaw = lerpAngle(p.yaw, Math.atan2(mvx, mvz), 1 - Math.exp(-12 * dt));
    }
    p.moving = wantMove;
    const walk = wantMove ? (running ? 1 : 0.75) : 0;

    // place + animate rig
    pos.y = p.heightAt(pos.x, pos.z);
    rig.group.position.set(pos.x, pos.y, pos.z);
    rig.group.rotation.y = p.yaw;
    const bob = rig.animate(t, walk ? 1 : 0);
    rig.group.position.y += bob;
    if (rig.tickCombat) {
      if (rig.combat.armed && !p.attackTarget && p.combatT <= 0 && rig.combat.state === 'none') rig.sheathe();
      rig.tickCombat(dt, t, walk ? 1 : 0);
    }
    if (p.atkCd > 0) p.atkCd -= dt;
  };

  function tryAttack(c) {
    if (p.atkCd > 0 || !rig.combat) return;
    if (!rig.combat.armed) { rig.draw(); return; }
    if (rig.combat.state !== 'none') return;
    p.atkCd = 1.2; p.combatT = 5;
    const lv = lvl();
    const w = weaponDef();
    rig.attack(() => {
      if (!c.alive) return;
      const max = maxHit(lv, w?.str || 0);
      const land = Math.random() < hitChance(lv, w?.atk || 0, c.level || 1);
      const dmg = land ? 1 + Math.floor(Math.random() * max) : 0;
      const res = c.hurt(dmg, pos);
      if (dmg > 0) { const xp = combatXp(dmg); for (const k in xp) p.addXp(k, xp[k]); }
      if (res?.dead) { p.attackTarget = null; bus.kill?.(c); }
    });
  }

  // ── save / load ──
  p.serialize = () => ({
    pos: [pos.x, pos.z], yaw: p.yaw, hp: p.hp, gold: p.gold,
    weapon: p.weapon, items: p.items, runMode: p.runMode, energy: p.energy,
    skills: Object.fromEntries(SKILLS.map(s => [s, p.skills[s].xp])),
  });
  p.load = (d) => {
    if (!d) return;
    pos.set(d.pos[0], 0, d.pos[1]); p.yaw = d.yaw || 0;
    for (const s of SKILLS) p.skills[s].xp = d.skills?.[s] || 0;
    if (p.skills.hitpoints.xp < HITPOINTS_START_XP) p.skills.hitpoints.xp = HITPOINTS_START_XP;
    p.maxHp = maxHpFor(levelForXp(p.skills.hitpoints.xp));
    p.hp = Math.min(d.hp ?? p.maxHp, p.maxHp);
    p.gold = d.gold ?? 0; p.items = d.items || [];
    p.runMode = d.runMode ?? true; p.energy = d.energy ?? 100;
    if (d.weapon && p.hasItem(d.weapon)) { p.weapon = d.weapon; rig.setStyle?.('sword'); }
  };

  rig.setStyle?.('sword');
  return p;
}
