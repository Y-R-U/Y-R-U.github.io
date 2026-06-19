// The player: stats/skills/XP, HP + survival (food/water), inventory + gold,
// movement (tap-to-move + WASD), and the combat loop (chase → draw → strike,
// melee/archery/magic with projectiles). Drives the shared humanoid rig.

import * as THREE from 'three';
import { CFG } from './config.js';
import { clamp, lerpAngle } from './utils.js';
import { ITEMS } from './items.js';
import { SKILLS, levelForXp, maxHpFor, maxHit, hitChance, combatXp } from './skills.js';
import * as fx from './fx.js';

const STYLE_RANGE = { sword: 1.7, crossbow: 9, staff: 8 };

export function createPlayer(rig, world, scene, bus) {
  const pos = new THREE.Vector3(0, 0, 6);
  const p = {
    rig, pos, yaw: 0, vel: new THREE.Vector3(),
    skills: {}, hp: 12, maxHp: 12, food: 100, water: 100, gold: 25,
    items: [],                       // [{id, n}]
    equipped: { sword: null, crossbow: null, staff: null },
    style: 'sword',
    target: null, attackTarget: null,
    atkCd: 0, combatT: 0, moving: false, run: false,
    alive: true,
    _warn: {}, _splash: 0,
  };
  for (const s of SKILLS) p.skills[s] = { xp: 0 };
  p.maxHp = maxHpFor(1); p.hp = p.maxHp;

  // current "area" — overworld by default; the dungeon swaps these in.
  p.heightAt = (x, z) => world.groundHeight(x, z);
  p.clampPos = (v) => { const r = Math.hypot(v.x, v.z), maxR = CFG.worldRadius - 0.5; if (r > maxR) { v.x *= maxR / r; v.z *= maxR / r; } };
  p.setArea = (a) => { p.heightAt = a.heightAt; p.clampPos = a.clampPos; };

  const lvl = () => { const o = {}; for (const s of SKILLS) o[s] = levelForXp(p.skills[s].xp); return o; };
  p.levels = lvl;

  // ── inventory ──
  p.countItem = (id) => { const s = p.items.find(i => i.id === id); return s ? s.n : 0; };
  p.hasItem = (id) => p.countItem(id) > 0;
  p.addItem = (id, n = 1) => {
    const def = ITEMS[id]; if (!def) return;
    if (def.stack) { const s = p.items.find(i => i.id === id); if (s) s.n += n; else p.items.push({ id, n }); }
    else for (let k = 0; k < n; k++) p.items.push({ id, n: 1 });
    bus.invChanged?.();
  };
  p.removeItem = (id, n = 1) => {
    let left = n;
    for (let i = p.items.length - 1; i >= 0 && left > 0; i--) {
      if (p.items[i].id !== id) continue;
      const take = Math.min(p.items[i].n, left); p.items[i].n -= take; left -= take;
      if (p.items[i].n <= 0) p.items.splice(i, 1);
    }
    bus.invChanged?.();
    return n - left;
  };
  p.gainGold = (n) => { p.gold += n; bus.invChanged?.(); };
  p.spendGold = (n) => { if (p.gold < n) return false; p.gold -= n; bus.invChanged?.(); return true; };

  // ── xp / levels ──
  p.addXp = (skill, amount) => {
    if (!p.skills[skill] || amount <= 0) return;
    const before = levelForXp(p.skills[skill].xp);
    p.skills[skill].xp += amount;
    const after = levelForXp(p.skills[skill].xp);
    if (after > before) {
      if (skill === 'health') { const nm = maxHpFor(after); p.hp += nm - p.maxHp; p.maxHp = nm; }
      bus.levelUp?.(skill, after);
    }
    bus.skillsChanged?.();
  };

  // ── consume / use ──
  p.eat = (id) => {
    const def = ITEMS[id]; if (!def || !p.hasItem(id)) return;
    if (def.food) p.food = clamp(p.food + def.food, 0, 100);
    if (def.heal) { p.hp = clamp(p.hp + def.heal, 0, p.maxHp); }
    if (def.mana) { p.hp = clamp(p.hp + 10, 0, p.maxHp); }
    p.removeItem(id, 1);
    bus.toast?.(`${def.icon} ${def.food ? 'Ate' : 'Used'} ${def.name}`);
    bus.hpChanged?.();
    if (def.food) bus.ate?.();
  };
  p.equip = (id) => {
    const def = ITEMS[id]; if (!def || def.cat !== 'weapon') return;
    p.equipped[def.style] = id;
    p.setStyle(def.style);
    bus.toast?.(`${def.icon} Wielding ${def.name}`);
    bus.invChanged?.();
  };
  p.setStyle = (s) => { if (!STYLE_RANGE[s]) return; p.style = s; rig.setStyle?.(s); bus.styleChanged?.(s); };
  p.weaponAtk = () => { const id = p.equipped[p.style]; return id ? (ITEMS[id].atk || 0) : 0; };

  // ── movement intents ──
  p.setTarget = (v) => { p.target = v.clone ? v.clone() : new THREE.Vector3(v.x, 0, v.z); p.attackTarget = null; };
  p.attackCreature = (c) => { if (c && c.alive) { p.attackTarget = c; p.target = null; } };
  p.stop = () => { p.target = null; p.attackTarget = null; };

  // ── taking damage ──
  p.takeDamage = (dmg, fromPos, attacker) => {
    if (!p.alive) return;
    const def = levelForXp(p.skills.defence.xp);
    const reduced = Math.max(1, Math.round(dmg * (1 - Math.min(0.5, def * 0.012))));
    p.hp = clamp(p.hp - reduced, 0, p.maxHp);
    p.addXp('defence', reduced * 2);
    fx.splat(new THREE.Vector3(pos.x, pos.y + 1.5, pos.z), reduced);
    bus.hurt?.(reduced);
    bus.hpChanged?.();
    p.combatT = 4;
    // auto-retaliate: if idle (not already fighting / walking somewhere), fight back
    if (attacker && attacker.alive && !p.attackTarget && !p.target) p.attackTarget = attacker;
    if (p.hp <= 0) die();
  };
  function die() {
    p.alive = false;
    rig.forceSheathe?.();
    bus.died?.();
  }
  p.respawn = () => {
    p.alive = true; p.hp = p.maxHp; p.food = Math.max(p.food, 40); p.water = Math.max(p.water, 40);
    pos.set(0, 0, 6); p.stop();
    bus.hpChanged?.();
  };

  // ── survival warnings (fire once per threshold crossing) ──
  function warn(key, cond, msg) {
    if (cond && !p._warn[key]) { p._warn[key] = true; bus.toast?.(msg); }
    else if (!cond) p._warn[key] = false;
  }

  // ── per-frame update ──
  const _dir = new THREE.Vector3(), _to = new THREE.Vector3();
  p.update = (dt, t, keyDir) => {
    if (!p.alive) { rig.group.position.set(pos.x, p.heightAt(pos.x, pos.z), pos.z); return; }

    // survival decay
    p.food = clamp(p.food - CFG.foodDecay * dt, 0, 100);
    p.water = clamp(p.water - CFG.waterDecay * dt, 0, 100);
    let starving = false;
    if (p.food <= 0) { p.hp = clamp(p.hp - CFG.starveDps * dt, 0, p.maxHp); starving = true; }
    if (p.water <= 0) { p.hp = clamp(p.hp - CFG.dehydrateDps * dt, 0, p.maxHp); starving = true; }
    if (!starving && p.combatT <= 0 && p.food > 18 && p.water > 18 && p.hp < p.maxHp)
      p.hp = clamp(p.hp + CFG.regenDps * dt, 0, p.maxHp);
    if (starving && p.hp <= 0) return die();
    warn('food50', p.food < 50, '🍽️ You\'re getting peckish.');
    warn('food20', p.food < 20, '🍽️ You\'re hungry — eat something.');
    warn('water50', p.water < 50, '💧 You\'re getting thirsty.');
    warn('water20', p.water < 20, '💧 Thirsty — find water to refill.');
    if (p.combatT > 0) p.combatT -= dt;

    // decide movement: WASD overrides tap; combat chase otherwise
    let mvx = 0, mvz = 0, wantMove = false;
    p.run = keyDir?.run || false;
    if (keyDir && (keyDir.x || keyDir.y)) {
      mvx = keyDir.x; mvz = keyDir.y; wantMove = true; p.target = null; p.attackTarget = null;
    } else if (p.attackTarget) {
      if (!p.attackTarget.alive) { p.attackTarget = null; }
      else {
        const c = p.attackTarget;
        _to.set(c.group.position.x - pos.x, 0, c.group.position.z - pos.z);
        const dist = _to.length();
        const range = STYLE_RANGE[p.style];
        if (dist > range * 0.92) { _to.normalize(); mvx = _to.x; mvz = _to.z; wantMove = true; }
        else { p.yaw = Math.atan2(_to.x, _to.z); tryAttack(c); }
      }
    } else if (p.target) {
      _to.set(p.target.x - pos.x, 0, p.target.z - pos.z);
      const dist = _to.length();
      if (dist > 0.25) { _to.normalize(); mvx = _to.x; mvz = _to.z; wantMove = true; }
      else p.target = null;
    }

    const speed = (p.run ? CFG.runSpeed : CFG.playerSpeed);
    if (wantMove) {
      pos.x += mvx * speed * dt; pos.z += mvz * speed * dt;
      p.clampPos(pos);
      p.yaw = lerpAngle(p.yaw, Math.atan2(mvx, mvz), 1 - Math.exp(-12 * dt));
    }
    p.moving = wantMove;
    const walk = wantMove ? 1 : 0;

    // place + animate rig
    pos.y = p.heightAt(pos.x, pos.z);
    rig.group.position.set(pos.x, pos.y, pos.z);
    rig.group.rotation.y = p.yaw;
    const bob = rig.animate(t, walk);
    rig.group.position.y += bob;
    if (rig.tickCombat) {
      // auto-sheathe a few seconds after combat
      if (rig.combat.armed && !p.attackTarget && p.combatT <= 0 && rig.combat.state === 'none') rig.sheathe();
      rig.tickCombat(dt, t, walk);
    }
    if (p.atkCd > 0) p.atkCd -= dt;
  };

  function tryAttack(c) {
    if (p.atkCd > 0 || !rig.combat) return;
    if (!rig.combat.armed) { rig.draw(); return; }
    if (rig.combat.state !== 'none') return;
    p.atkCd = 0.95; p.combatT = 4;
    const style = p.style;
    const lv = lvl(), wAtk = p.weaponAtk();
    rig.attack(() => {
      if (!c.alive) return;
      const max = maxHit(style, lv, wAtk);
      const land = Math.random() < hitChance(style, lv, c.level || 1);
      const dmg = land ? 1 + Math.floor(Math.random() * max) : 0;
      const apply = () => {
        if (!c.alive) return;
        const res = c.hurt(dmg, pos);
        if (dmg > 0) { const xp = combatXp(style, dmg); for (const k in xp) p.addXp(k, xp[k]); }
        if (res?.dead) { onKill(c); }
      };
      if (style === 'sword') apply();
      else {
        const from = rig.muzzle();
        const to = c.aimPoint();
        if (style === 'crossbow') fx.bolt(from, to, apply);
        else fx.fireball(from, to, apply);
      }
    });
  }

  function onKill(c) {
    p.attackTarget = null;
    bus.kill?.(c);
  }

  // ── save / load ──
  p.serialize = () => ({
    pos: [pos.x, pos.z], yaw: p.yaw, hp: p.hp, food: p.food, water: p.water, gold: p.gold,
    style: p.style, equipped: p.equipped, items: p.items,
    skills: Object.fromEntries(SKILLS.map(s => [s, p.skills[s].xp])),
  });
  p.load = (d) => {
    if (!d) return;
    pos.set(d.pos[0], 0, d.pos[1]); p.yaw = d.yaw || 0;
    for (const s of SKILLS) p.skills[s].xp = d.skills?.[s] || 0;
    p.maxHp = maxHpFor(levelForXp(p.skills.health.xp));
    p.hp = Math.min(d.hp ?? p.maxHp, p.maxHp); p.food = d.food ?? 100; p.water = d.water ?? 100;
    p.gold = d.gold ?? 25; p.items = d.items || []; p.equipped = d.equipped || p.equipped;
    p.setStyle(d.style || 'sword');
  };

  return p;
}
