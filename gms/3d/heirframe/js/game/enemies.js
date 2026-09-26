import * as THREE from 'three';
import { ENEMIES, BOSSES } from '../data/enemies.js';
import { isStunned, tickCombatant } from '../sim/stats.js';
import { enableReflect } from '../engine/player.js';

const TAU = Math.PI * 2;
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const BOLT = { e_pistol: 0xff8a3a, e_zap: 0x7fd8ff, e_burst: 0xff6060 };
const DETECT_RANGE = 12, DETECT_CONE = 50 * Math.PI / 180;

// Hostile (and mission non-combat) robots: sim combatant + robot body + a small per-archetype AI.
export function createEnemies(ctx) {
  const { world, robots, sim, fx, audio, tier } = ctx;
  const list = [];
  let seed = 500;
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

  function spawn(unit, x, z, opts = {}) {
    const c = sim.spawnEnemy(unit);
    const def = ENEMIES[c.defId] || BOSSES[c.defId] || {};
    let bot;
    try { bot = robots.createRobot({ kind: c.robotKind, tier: c.robotTier || 0, seed: seed++, quality: tier.name === 'low' ? 'med' : tier.name, paint: c.paint || null }); }
    catch (e) { console.warn('enemy robot failed', c.robotKind, e); bot = robots.createRobot({ kind: 'brawler', seed: seed++, paint: 'syndicate' }); }
    enableReflect(bot.root);
    const sc = c.rank === 'grunt' ? 1 : Math.min(1.35, 1 + (c.rank === 'veteran' ? 0.08 : c.rank === 'elite' ? 0.15 : 0.3));
    bot.root.scale.setScalar(sc);
    world.scene.add(bot.root);
    const p = new THREE.Vector3(x, world.groundAt(x, z), z);
    const e = {
      c, bot, def, pos: p, home: p.clone(), yaw: opts.yaw ?? Math.random() * TAU, radius: (bot.radius || 0.45) * sc,
      ai: (c.ai || ['rusher'])[0], guard: !!opts.guard, stealthy: !!opts.stealthy, pack: opts.pack ?? null, tag: opts.tag || null,
      state: opts.hostile ? 'chase' : 'idle', detect: 0, wanderT: Math.random() * 3, wander: null, strafe: Math.random() < 0.5 ? 1 : -1,
      fleeT: 0, deadT: 0, pending: null, pendingT: 0, lastSeen: null, searchT: 0, barkT: 0, id: c.id, nonCombat: c.nonCombat, keepRange: def.keepRange || 0,
    };
    if (e.state === 'chase') { c.alerted = true; bot.setAlert(2); }
    bot.onEvent = (ev) => { if ((ev === 'impact' || ev === 'fire') && e.pending) release(e); };
    bot.root.position.copy(p); bot.root.rotation.y = e.yaw;
    list.push(e);
    return e;
  }

  function alert(e, why) {
    if (e.state === 'dead' || e.nonCombat) return;
    if (e.state === 'idle' || e.state === 'search') {
      e.state = 'chase'; e.c.alerted = true; e.bot.setAlert(2); e.detect = 1;
      if (e.c.faction === 'syndicate' && Math.random() < 0.5) audio.bark('b_thug_aggro_', { x: e.pos.x, z: e.pos.z, cooldown: 5 });
      if (e.c.faction === 'concord') audio.bark('b_warden_spot_', { x: e.pos.x, z: e.pos.z, cooldown: 5 });
      if (e.c.faction === 'scrap') audio.sfx('stealth_alert', { x: e.pos.x, z: e.pos.z, vol: 0.35, minGap: 0.5 });
      ctx.onAlert && ctx.onAlert(e, why);
      // call the group within 15 m
      for (const o of list) if (o !== e && o.state === 'idle' && !o.nonCombat && o.pos.distanceTo(e.pos) < 15) { o.state = 'chase'; o.c.alerted = true; o.bot.setAlert(2); o.detect = 1; }
    }
  }

  // queue a hit that lands on the anim's impact/fire event (fallback timer if the event never fires)
  function beginAttack(e, skill, targetPos) {
    if (!sim.useSkill(e.c, skill)) return false;
    e.pending = { skill, target: targetPos.clone() };
    e.pendingT = skill.kind === 'ranged' ? 0.45 : 0.4;
    e.bot.play(skill.anim || (skill.kind === 'ranged' ? 'shoot' : 'attack_melee'), { loop: false });
    if (skill.kind !== 'ranged') audio.sfx('swing', { x: e.pos.x, z: e.pos.z, vol: 0.5, minGap: 0.08 });
    return true;
  }

  function release(e) {
    const p = e.pending; e.pending = null;
    if (!p || e.state === 'dead' || !e.c.alive) return;
    const pl = ctx.player.pos;
    if (p.skill.kind === 'ranged') {
      const from = muzzle(e);
      const to = tmp2.set(p.target.x + (Math.random() - 0.5) * 0.4, p.target.y + 1.0, p.target.z + (Math.random() - 0.5) * 0.4).clone();
      audio.sfx('shoot', { x: e.pos.x, z: e.pos.z, vol: 0.55, minGap: 0.05 });
      fx.bolt(from, to, { color: BOLT[p.skill.id] || 0xff8a3a, speed: 20, size: 0.9, onArrive: (pt) => {
        fx.sparks(pt, BOLT[p.skill.id] || 0xffa060, 5, 3);
        if (Math.hypot(pt.x - ctx.player.pos.x, pt.z - ctx.player.pos.z) < 1.1) ctx.hitPlayer(e, p.skill);
      } });
    } else {
      const d = Math.hypot(pl.x - e.pos.x, pl.z - e.pos.z);
      if (d < (p.skill.range || 2) + e.radius + 0.6) ctx.hitPlayer(e, p.skill);
    }
  }

  function muzzle(e) {
    const m = e.bot.sockets?.muzzle || e.bot.sockets?.handR;
    if (m) { m.getWorldPosition(tmp); return tmp.clone(); }
    return new THREE.Vector3(e.pos.x, e.pos.y + 1.3, e.pos.z);
  }

  function basicSkill(e) { return Object.values(e.c.skills).find((s) => s.basic) || Object.values(e.c.skills)[0]; }

  function moveTo(e, dx, dz, speed, dt) {
    const l = Math.hypot(dx, dz);
    if (l < 1e-4) { e.bot.setMove(0, 0); return; }
    dx /= l; dz /= l;
    const want = Math.atan2(dx, dz);
    e.yaw += angDiff(want, e.yaw) * (1 - Math.exp(-dt * 10));
    const before = tmp.copy(e.pos);
    const bx = before.x, bz = before.z;
    world.collision.move(e.pos, dx * speed * dt, dz * speed * dt, e.radius);
    const moved = Math.hypot(e.pos.x - bx, e.pos.z - bz);
    e.bot.setMove(Math.min(1, speed / (e.bot.runSpeed || 4)), moved / Math.max(dt, 1e-4));
  }

  function face(e, x, z, dt, k = 12) {
    const want = Math.atan2(x - e.pos.x, z - e.pos.z);
    e.yaw += angDiff(want, e.yaw) * (1 - Math.exp(-dt * k));
  }

  function canSee(e, pl, pc) {
    const dx = pl.x - e.pos.x, dz = pl.z - e.pos.z, d = Math.hypot(dx, dz);
    const range = DETECT_RANGE * (pc.stats.detectMult || 1);
    if (d > range) return 0;
    if (d > 2.5 && Math.abs(angDiff(Math.atan2(dx, dz), e.yaw)) > DETECT_CONE) return 0;
    return 1 - d / range;
  }

  function update(dt, { playerDead = false, sneaking = false } = {}) {
    const pl = ctx.player.pos;
    const pc = sim.playerCombatant();
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      const c = e.c;
      if (e.state === 'dead') {
        e.deadT += dt;
        e.bot.setMove(0, 0);
        if (e.deadT > 4) e.pos.y -= dt * 0.6;
        if (e.deadT > 6.5) { world.scene.remove(e.bot.root); e.bot.dispose(); list.splice(i, 1); continue; }
        e.bot.root.position.copy(e.pos); e.bot.update(dt);
        continue;
      }
      if (!c.alive) { die(e); continue; }
      for (const ev of tickCombatant(c, dt)) if (ev.type === 'death') die(e);
      if (e.pending && (e.pendingT -= dt) <= 0) release(e);
      e.barkT -= dt;
      const dx = pl.x - e.pos.x, dz = pl.z - e.pos.z, d = Math.hypot(dx, dz);
      const skill = basicSkill(e);
      const reach = (skill?.range || 2) + e.radius * 0.5 + 0.3;
      const speed = (c.stats.moveSpeed || e.def.move || 4);
      const stunned = isStunned(c);

      if (e.nonCombat) {
        wanderAbout(e, dt, 0.9, 5);
      } else if (stunned) {
        e.bot.setMove(0, 0);
      } else if (e.state === 'idle') {
        if (e.guard || e.stealthy) {
          const s = playerDead ? 0 : canSee(e, pl, pc);
          if (s > 0) e.detect = Math.min(1, e.detect + s * 1.2 * dt * (sneaking ? 0.5 : 1) * (e.stealthy ? 1 : 2.5));
          else e.detect = Math.max(0, e.detect - dt * 0.25);
          e.bot.setAlert(e.detect > 0.05 ? 1 : 0);
          if (e.detect > 0.05 && s > 0) face(e, pl.x, pl.z, dt, 2);
          if (e.detect >= 1) alert(e, 'seen');
          if (e.detect < 0.05) wanderAbout(e, dt, 1.0, 3); else e.bot.setMove(0, 0);
        } else {
          wanderAbout(e, dt, 1.1, 4);
          if (!playerDead && d < 9) alert(e, 'near');
        }
        if (c.sinceHit < 0.2) alert(e, 'hit');
      } else if (playerDead) {
        e.bot.setMove(0, 0);
      } else if (e.state === 'flee') {
        e.fleeT -= dt;
        moveTo(e, -dx, -dz, speed * 1.1, dt);
        if (e.fleeT <= 0) e.state = 'chase';
      } else {
        // chase / attack
        if (e.def.fleeBelow && c.hp < c.stats.hp * e.def.fleeBelow && !e.fled) { e.fled = true; e.state = 'flee'; e.fleeT = 2.5; continue; }
        const wantRange = e.ai === 'striker' ? e.keepRange || 9 : e.ai === 'spotter' ? 7 : 0;
        if (wantRange) {
          if (d > reach) moveTo(e, dx, dz, speed, dt);
          else if (d < wantRange - 2.5) moveTo(e, -dx, -dz, speed * 0.8, dt);
          else {
            // strafe while in band
            const sx = -dz * e.strafe, sz = dx * e.strafe;
            const before = e.pos.clone();
            moveTo(e, sx, sz, speed * 0.45, dt);
            if (before.distanceTo(e.pos) < 0.2 * speed * dt) e.strafe *= -1;
            face(e, pl.x, pl.z, dt);
          }
          if (d <= reach && skill && !e.pending && ctx.losClear(e.pos, pl)) beginAttack(e, skill, pl);
        } else {
          if (d > reach * 0.85) moveTo(e, dx, dz, speed, dt);
          else { e.bot.setMove(0, 0); face(e, pl.x, pl.z, dt); if (skill && !e.pending) beginAttack(e, skill, pl); }
        }
        // leash: give up if the player got very far away
        if (d > 45) { e.state = 'idle'; c.alerted = false; e.bot.setAlert(0); e.detect = 0; }
      }
      separate(e, dt);
      e.pos.y = e.def.flying ? world.groundAt(e.pos.x, e.pos.z) : world.groundAt(e.pos.x, e.pos.z);
      e.bot.root.position.copy(e.pos);
      e.bot.root.rotation.y = e.yaw;
      e.bot.update(dt);
    }
  }

  function wanderAbout(e, dt, speed, r) {
    e.wanderT -= dt;
    if (!e.wander || e.wanderT <= 0) {
      const a = Math.random() * TAU, rr = Math.random() * r;
      e.wander = { x: e.home.x + Math.sin(a) * rr, z: e.home.z + Math.cos(a) * rr };
      e.wanderT = 2.5 + Math.random() * 4;
    }
    const dx = e.wander.x - e.pos.x, dz = e.wander.z - e.pos.z;
    if (Math.hypot(dx, dz) < 0.6) e.bot.setMove(0, 0);
    else moveTo(e, dx, dz, speed, dt);
  }

  function separate(e, dt) {
    for (const o of list) {
      if (o === e || o.state === 'dead') continue;
      const dx = e.pos.x - o.pos.x, dz = e.pos.z - o.pos.z, d = Math.hypot(dx, dz), min = e.radius + o.radius;
      if (d > 1e-3 && d < min) world.collision.move(e.pos, dx / d * (min - d) * 0.5, dz / d * (min - d) * 0.5, e.radius);
    }
    const pl = ctx.player.pos;
    const dx = e.pos.x - pl.x, dz = e.pos.z - pl.z, d = Math.hypot(dx, dz), min = e.radius + 0.45;
    if (d > 1e-3 && d < min) world.collision.move(e.pos, dx / d * (min - d), dz / d * (min - d), e.radius);
  }

  function die(e) {
    if (e.state === 'dead') return;
    e.state = 'dead'; e.pending = null;
    e.bot.play('die', { loop: false });
    e.bot.setAlert(0);
    audio.sfx(e.c.defId === 'scrap_rat' ? 'explosion_small' : 'power_down', { x: e.pos.x, z: e.pos.z, vol: 0.7 });
    if (e.c.faction === 'syndicate') audio.bark('b_thug_death_', { x: e.pos.x, z: e.pos.z, cooldown: 6 });
    fx.sparks(tmp.set(e.pos.x, e.pos.y + 0.6, e.pos.z), 0xffc070, 16, 6);
    ctx.onDeath && ctx.onDeath(e);
  }

  function damage(e, res) {
    if (e.state === 'dead') return;
    e.bot.hitFlash();
    if (res.amount > 0 && !res.killed && Math.random() < 0.35 && e.c.rank !== 'elite') e.bot.play('hit', { loop: false, fade: 0.05 });
    alert(e, 'hit');
    if (res.killed || !e.c.alive) die(e);
  }

  return {
    list, spawn, update, alert, damage, die,
    alive: () => list.filter((e) => e.state !== 'dead' && !e.nonCombat),
    hostileNear(x, z, r) { return list.some((e) => e.state !== 'dead' && !e.nonCombat && e.state !== 'idle' && Math.hypot(e.pos.x - x, e.pos.z - z) < r); },
    clear(filter = () => true) {
      for (let i = list.length - 1; i >= 0; i--) {
        const e = list[i];
        if (!filter(e)) continue;
        world.scene.remove(e.bot.root); e.bot.dispose(); list.splice(i, 1);
      }
    },
  };
}
