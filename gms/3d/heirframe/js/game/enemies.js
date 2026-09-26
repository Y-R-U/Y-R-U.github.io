import * as THREE from 'three';
import { ENEMIES, BOSSES } from '../data/enemies.js';
import { isStunned, tickCombatant, resolveHit } from '../sim/stats.js';
import { chooseEnemySkill } from '../sim/enemies.js';
import { enableReflect } from '../engine/player.js';

const TAU = Math.PI * 2;
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const BOLT = { e_pistol: 0xff8a3a, e_zap: 0x7fd8ff, e_burst: 0xff6060 };
const DETECT_RANGE = 12, DETECT_CONE = 50 * Math.PI / 180;
const RNG = { next: Math.random };

// Hostile (and mission non-combat) robots: sim combatant + robot body + a small per-archetype AI.
// Targets: the player, decoys (Blink hologram, Drone Turret, escorted NPCs), hacked allies. Special skills
// (stomp, crush, dash, lunge) are telegraphed with a ground ring before they land.
export function createEnemies(ctx) {
  const { world, robots, sim, fx, audio, tier } = ctx;
  const list = [];
  const decoys = [];
  let seed = 500;
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const PLAYER = { kind: 'player' };

  function spawn(unit, x, z, opts = {}) {
    const c = sim.spawnEnemy(unit);
    const def = ENEMIES[c.defId] || BOSSES[c.defId] || {};
    let bot;
    try { bot = robots.createRobot({ kind: c.robotKind, tier: opts.robotTier ?? c.robotTier ?? 0, seed: seed++, quality: tier.name === 'low' ? 'med' : tier.name, paint: opts.paint || c.paint || null }); }
    catch (e) { console.warn('enemy robot failed', c.robotKind, e); bot = robots.createRobot({ kind: 'brawler', seed: seed++, paint: 'syndicate' }); }
    enableReflect(bot.root);
    const sc = opts.scale || (c.rank === 'grunt' ? 1 : Math.min(1.35, 1 + (c.rank === 'veteran' ? 0.08 : c.rank === 'elite' ? 0.15 : 0.3)));
    bot.root.scale.setScalar(sc);
    world.scene.add(bot.root);
    const p = new THREE.Vector3(x, world.groundAt(x, z), z);
    const e = {
      c, bot, def, pos: p, home: p.clone(), yaw: opts.yaw ?? Math.random() * TAU, radius: (bot.radius || 0.45) * sc,
      ai: (c.ai || ['rusher'])[0], guard: !!opts.guard, stealthy: !!opts.stealthy, pack: opts.pack ?? null, tag: opts.tag || null,
      state: opts.hostile ? 'chase' : 'idle', detect: 0, wanderT: Math.random() * 3, wander: null, strafe: Math.random() < 0.5 ? 1 : -1,
      fleeT: 0, deadT: 0, kbx: 0, kbz: 0, pending: null, pendingT: 0, lastSeen: null, searchT: 0, barkT: 0, id: c.id, nonCombat: c.nonCombat, keepRange: def.keepRange || 0,
      ally: 0, aggro: null, tauntT: 0, tele: null, dash: null, specialT: 1 + Math.random() * 2, brain: null,
    };
    if (e.state === 'chase') { c.alerted = true; bot.setAlert(2); }
    bot.onEvent = (ev) => { if ((ev === 'impact' || ev === 'fire') && e.pending) release(e); };
    bot.root.position.copy(p); bot.root.rotation.y = e.yaw;
    list.push(e);
    return e;
  }

  function alert(e, why) {
    if (e.state === 'dead' || e.nonCombat || e.ally) return;
    if (e.state === 'idle' || e.state === 'search') {
      e.state = 'chase'; e.c.alerted = true; e.bot.setAlert(2); e.detect = 1;
      if (e.c.faction === 'syndicate' && Math.random() < 0.5) audio.bark('b_thug_aggro_', { x: e.pos.x, z: e.pos.z, cooldown: 5 });
      if (e.c.faction === 'concord') audio.bark(Math.random() < 0.7 ? 'b_warden_spot_' : 'b_warden_backup_', { x: e.pos.x, z: e.pos.z, cooldown: 6 });
      if (e.c.faction === 'scrap') audio.sfx('stealth_alert', { x: e.pos.x, z: e.pos.z, vol: 0.35, minGap: 500 });
      ctx.onAlert && ctx.onAlert(e, why);
      // call the group within 15 m
      for (const o of list) if (o !== e && (o.state === 'idle' || o.state === 'search') && !o.nonCombat && !o.ally && o.pos.distanceTo(e.pos) < 15) { o.state = 'chase'; o.c.alerted = true; o.bot.setAlert(2); o.detect = 1; }
    }
  }

  // --- targets -----------------------------------------------------------------------------------------
  function addDecoy({ x, z, t = 2, hp = 100, radius = 10, kind = 'decoy', ref = null, grunts = false }) {
    const d = { pos: new THREE.Vector3(x, world.groundAt(x, z), z), t, hp, max: hp, radius, kind, ref, grunts, dead: false, isDecoy: true };
    decoys.push(d);
    return d;
  }
  function removeDecoy(d) { const i = decoys.indexOf(d); if (i >= 0) decoys.splice(i, 1); }

  function targetOf(e, pl) {
    if (e.ally) {
      let best = null, bd = 16;
      for (const o of list) { if (o === e || o.ally || o.state === 'dead' || o.nonCombat) continue; const d = o.pos.distanceTo(e.pos); if (d < bd) { bd = d; best = o; } }
      return best;
    }
    if (e.aggro && (e.aggro.t -= 0) > 0 && e.aggro.ref.state !== 'dead' && e.aggro.ref.ally) return e.aggro.ref;
    if (e.tauntT > 0) return PLAYER;
    const dp = Math.hypot(pl.x - e.pos.x, pl.z - e.pos.z);
    let best = null, bd = Infinity;
    for (const d of decoys) {
      if (d.dead) continue;
      if (d.grunts && !['grunt', 'veteran'].includes(e.c.rank)) continue;
      const dd = d.pos.distanceTo(e.pos);
      if (dd > d.radius) continue;
      if (d.kind === 'npc' && dd > dp - 1) continue;
      if (dd < bd) { bd = dd; best = d; }
    }
    return best || PLAYER;
  }
  const tpos = (T, pl) => (T === PLAYER ? pl : T.pos);

  // queue a hit that lands on the anim's impact/fire event (fallback timer if the event never fires)
  function beginAttack(e, skill, T, pl) {
    if (!sim.useSkill(e.c, skill)) return false;
    e.pending = { skill, target: tpos(T, pl).clone(), T };
    e.pendingT = skill.kind === 'ranged' ? 0.45 : 0.4;
    e.bot.play(skill.anim || (skill.kind === 'ranged' ? 'shoot' : 'attack_melee'), { loop: false });
    if (skill.kind !== 'ranged') audio.sfx('swing', { x: e.pos.x, z: e.pos.z, vol: 0.5, minGap: 80 });
    return true;
  }

  // a hit from enemy e (skill) lands on target T
  function land(e, skill, T) {
    if (!T || T === PLAYER) { ctx.hitPlayer(e, skill); return; }
    if (T.isDecoy) {
      if (T.kind === 'npc' && T.ref?.c) {
        const res = resolveHit(e.c, T.ref.c, skill, RNG, {});
        if (res.amount) { T.ref.bot.hitFlash(); ctx.onNpcHit?.(T.ref, res); }
        if (!T.ref.c.alive) { T.dead = true; ctx.onNpcDown?.(T.ref); }
      } else {
        T.hp -= e.c.stats.dmgScale * (skill.base || 1);
        if (T.hp <= 0) T.dead = true;
      }
      fx.sparks(tmp.set(T.pos.x, T.pos.y + 0.9, T.pos.z), 0xffa060, 5, 3);
      return;
    }
    if (T.c && T.state !== 'dead') {
      const res = sim.hit(e.c, T.c, skill, {});
      if (res.hit) {
        fx.sparks(tmp.set(T.pos.x, T.pos.y + 1, T.pos.z), e.ally ? 0x7ff6ff : 0xffa060, 6, 4);
        if (!T.ally) T.aggro = { ref: e, t: 4 };
        damage(T, res);
      }
    }
  }

  function release(e) {
    const p = e.pending; e.pending = null;
    if (!p || e.state === 'dead' || !e.c.alive) return;
    const pl = ctx.player.pos;
    const T = p.T;
    const tp = T === PLAYER ? pl : T?.pos || p.target;
    if (p.skill.kind === 'ranged') {
      const from = muzzle(e);
      const shots = p.skill.shots || 1;
      for (let s = 0; s < shots; s++) {
        const to = new THREE.Vector3(tp.x + (Math.random() - 0.5) * 0.4, (tp.y || 0) + 1.0, tp.z + (Math.random() - 0.5) * 0.4);
        const go = () => {
          audio.sfx('shoot', { x: e.pos.x, z: e.pos.z, vol: 0.55, minGap: 50 });
          fx.bolt(from, to, { color: BOLT[p.skill.id] || 0xff8a3a, speed: 20, size: 0.9, onArrive: (pt) => {
            fx.sparks(pt, BOLT[p.skill.id] || 0xffa060, 5, 3);
            const cur = T === PLAYER ? ctx.player.pos : T?.pos;
            if (cur && Math.hypot(pt.x - cur.x, pt.z - cur.z) < 1.1) land(e, p.skill, T);
          } });
        };
        if (s === 0) go(); else setTimeout(go, s * 110);
      }
    } else {
      const d = Math.hypot(tp.x - e.pos.x, tp.z - e.pos.z);
      if (d < (p.skill.range || 2) + e.radius + 0.6) land(e, p.skill, T);
    }
  }

  // --- telegraphed specials ---------------------------------------------------------------------------------
  function beginSpecial(e, skill, T, pl) {
    if (!sim.useSkill(e.c, skill)) return false;
    const tp = tpos(T, pl);
    const tele = skill.telegraph || 0.6;
    e.tele = { skill, T, t: tele, max: tele, at: tp.clone(), ringT: 0 };
    e.bot.play(skill.kind === 'dash' ? 'run' : skill.anim || 'attack_heavy', { loop: false, speed: 0.8 });
    e.bot.setAlert(2);
    if (skill.kind === 'aoe' || skill.kind === 'melee') fx.ring(e.pos, skill.radius || skill.range || 3, 0xff4020, tele);
    audio.sfx('stealth_alert', { x: e.pos.x, z: e.pos.z, vol: 0.3, minGap: 300 });
    return true;
  }

  function resolveSpecial(e) {
    const { skill, T } = e.tele;
    e.tele = null;
    const pl = ctx.player.pos;
    if (skill.kind === 'dash') {
      const tp = T === PLAYER ? pl : T?.pos || pl;
      const dx = tp.x - e.pos.x, dz = tp.z - e.pos.z, l = Math.hypot(dx, dz) || 1;
      const dist = Math.min(skill.range || 8, l + 1.5);
      e.dash = { dx: dx / l, dz: dz / l, v: dist / 0.3, t: 0.3, skill, T, hit: false };
      e.yaw = Math.atan2(dx, dz);
      audio.sfx('dodge', { x: e.pos.x, z: e.pos.z, vol: 0.7 });
      return;
    }
    const r = skill.radius || (skill.range || 2.6) + e.radius;
    e.bot.play('attack_heavy', { loop: false, speed: 1.4 });
    fx.ring(e.pos, r, 0xff6030, 0.4);
    fx.sparks(tmp.set(e.pos.x, e.pos.y + 0.4, e.pos.z), 0xffa060, 14, 7);
    audio.sfx('explosion', { x: e.pos.x, z: e.pos.z, vol: 0.8 });
    if (Math.hypot(pl.x - e.pos.x, pl.z - e.pos.z) < r + 0.4) { ctx.hitPlayer(e, skill); ctx.rig.shake = Math.max(ctx.rig.shake, 0.18); }
    for (const d of decoys) if (!d.dead && d.pos.distanceTo(e.pos) < r) land(e, skill, d);
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
    const bx = e.pos.x, bz = e.pos.z;
    world.collision.move(e.pos, dx * speed * dt, dz * speed * dt, e.radius);
    const moved = Math.hypot(e.pos.x - bx, e.pos.z - bz);
    e.bot.setMove(Math.min(1, speed / (e.bot.runSpeed || 4)), moved / Math.max(dt, 1e-4));
  }

  // straight at the target when the walk grid has a clear line, else along an A* route (refreshed ~2x/s)
  function chase(e, tx, tz, speed, dt) {
    const nav = ctx.nav;
    if (nav && (e.navT = (e.navT || 0) - dt) <= 0) {
      e.navT = 0.5 + Math.random() * 0.2;
      e.route = nav.los(e.pos.x, e.pos.z, tx, tz) ? null : nav.route(e.pos, { x: tx, z: tz }, 8000);
    }
    const r = e.route;
    if (r?.length) {
      if (r.length > 1 && Math.hypot(r[0].x - e.pos.x, r[0].z - e.pos.z) < 0.7) r.shift();
      moveTo(e, r[0].x - e.pos.x, r[0].z - e.pos.z, speed, dt);
    } else moveTo(e, tx - e.pos.x, tz - e.pos.z, speed, dt);
  }

  function face(e, x, z, dt, k = 12) {
    const want = Math.atan2(x - e.pos.x, z - e.pos.z);
    e.yaw += angDiff(want, e.yaw) * (1 - Math.exp(-dt * k));
  }

  function canSee(e, pl, pc) {
    const dx = pl.x - e.pos.x, dz = pl.z - e.pos.z, d = Math.hypot(dx, dz);
    const range = pc.hidden ? 1.5 : DETECT_RANGE * (pc.stats.detectMult || 1) * (ctx.detectMult ? ctx.detectMult() : 1);
    if (d > range) return 0;
    if (d > 2.5 && Math.abs(angDiff(Math.atan2(dx, dz), e.yaw)) > DETECT_CONE) return 0;
    return 1 - d / range;
  }

  function update(dt, { playerDead = false, sneaking = false } = {}) {
    const pl = ctx.player.pos;
    const pc = sim.playerCombatant();
    for (let i = decoys.length - 1; i >= 0; i--) { const d = decoys[i]; if (d.kind !== 'npc' && (d.t -= dt) <= 0) d.dead = true; }
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      const c = e.c;
      if (e.kbx || e.kbz) {
        world.collision.move(e.pos, e.kbx * dt, e.kbz * dt, e.radius);
        const k = Math.exp(-dt * 8);
        e.kbx *= k; e.kbz *= k;
        if (Math.abs(e.kbx) + Math.abs(e.kbz) < 0.05) e.kbx = e.kbz = 0;
      }
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
      if (e.state === 'dead') continue;
      if (e.pending && (e.pendingT -= dt) <= 0) release(e);
      if (e.ally && (e.ally = Math.max(0, e.ally - dt)) === 0) { e.state = 'chase'; e.bot.setAlert(2); fx.ring(e.pos, 1.4, 0xff4020, 0.3); }
      if (e.tauntT > 0) e.tauntT -= dt;
      if (e.aggro && (e.aggro.t -= dt) <= 0) e.aggro = null;
      e.barkT -= dt;
      const stunned = isStunned(c);
      const T = e.state === 'chase' || e.ally ? targetOf(e, pl) : PLAYER;
      const tp = T ? tpos(T, pl) : pl;
      const dx = tp.x - e.pos.x, dz = tp.z - e.pos.z, d = Math.hypot(dx, dz);
      const skill = basicSkill(e);
      const reach = (skill?.range || 2) + e.radius * 0.5 + 0.3 + (T && T !== PLAYER && T.radius && T.c ? T.radius * 0.5 : 0);
      const speed = (c.stats.moveSpeed || e.def.move || 4) * (ctx.enemySpeedMult || 1);

      if (e.brain && !stunned && e.brain(e, dt, { d, T, pl, playerDead })) { /* boss script handled it */ }
      else if (e.dash) {
        const D = e.dash;
        world.collision.move(e.pos, D.dx * D.v * dt, D.dz * D.v * dt, e.radius);
        e.bot.setMove(1, D.v);
        if (!D.hit && T === PLAYER && Math.hypot(pl.x - e.pos.x, pl.z - e.pos.z) < (D.skill.radius || 1.4) + 0.4) { D.hit = true; ctx.hitPlayer(e, D.skill); }
        if ((D.t -= dt) <= 0) e.dash = null;
      } else if (e.tele) {
        e.bot.setMove(0, 0);
        if (e.tele.skill.kind === 'dash') face(e, tp.x, tp.z, dt, 6);
        if ((e.tele.t -= dt) <= 0) resolveSpecial(e);
      } else if (e.nonCombat) {
        if (!e.escort) wanderAbout(e, dt, 0.9, 5);
      } else if (stunned) {
        e.bot.setMove(0, 0);
      } else if (e.state === 'idle' || e.state === 'search') {
        if (e.state === 'search') {
          if ((e.searchT -= dt) <= 0) e.state = 'idle';
          else if (e.lastSeen && e.lastSeen.distanceTo(e.pos) > 1) chase(e, e.lastSeen.x, e.lastSeen.z, speed * 0.6, dt);
          else wanderAbout(e, dt, 1.0, 3);
        }
        if (e.guard || e.stealthy || e.state === 'search' || pc.hidden) {
          const s = playerDead ? 0 : canSee(e, pl, pc);
          if (s > 0) e.detect = Math.min(1, e.detect + s * 1.2 * dt * (sneaking ? 0.5 : 1) * (e.stealthy ? 1 : 2.5));
          else e.detect = Math.max(0, e.detect - dt * 0.25);
          e.bot.setAlert(e.detect > 0.05 ? 1 : 0);
          if (e.detect > 0.05 && s > 0) face(e, pl.x, pl.z, dt, 2);
          if (e.detect >= 1) { alert(e, 'seen'); ctx.onSpotted?.(e); }
          if (e.state === 'idle') { if (e.detect < 0.05) wanderAbout(e, dt, 1.0, 3); else e.bot.setMove(0, 0); }
        } else {
          wanderAbout(e, dt, 1.1, 4);
          if (!playerDead && d < 9) alert(e, 'near');
        }
        if (c.sinceHit < 0.2) alert(e, 'hit');
      } else if (playerDead && T === PLAYER) {
        e.bot.setMove(0, 0);
      } else if (e.state === 'flee') {
        e.fleeT -= dt;
        moveTo(e, -dx, -dz, speed * 1.1, dt);
        if (e.fleeT <= 0) e.state = 'chase';
      } else if (!T) {
        wanderAbout(e, dt, 1.1, 3);
      } else {
        // chase / attack
        if (e.def.fleeBelow && c.hp < c.stats.hp * e.def.fleeBelow && !e.fled && !e.ally) { e.fled = true; e.state = 'flee'; e.fleeT = 2.5; continue; }
        // telegraphed specials (stomp, crush, dash, lunge) off cooldown and in reach
        if ((e.specialT -= dt) <= 0 && !e.pending) {
          e.specialT = 0.6;
          const sp = chooseEnemySkill(c, d);
          if (sp && !sp.basic && sp.kind !== 'self' && (sp.kind !== 'dash' || d > 3)) { beginSpecial(e, sp, T, pl); e.bot.root.position.copy(e.pos); e.bot.update(dt); continue; }
        }
        const wantRange = e.ai === 'striker' ? e.keepRange || 9 : e.ai === 'spotter' ? 7 : 0;
        if (wantRange) {
          if (d > reach) chase(e, tp.x, tp.z, speed, dt);
          else if (d < wantRange - 2.5) moveTo(e, -dx, -dz, speed * 0.8, dt);
          else {
            const sx = -dz * e.strafe, sz = dx * e.strafe;
            const bx = e.pos.x, bz = e.pos.z;
            moveTo(e, sx, sz, speed * 0.45, dt);
            if (Math.hypot(e.pos.x - bx, e.pos.z - bz) < 0.2 * speed * dt) e.strafe *= -1;
            face(e, tp.x, tp.z, dt);
          }
          if (d <= reach && skill && !e.pending && ctx.losClear(e.pos, tp)) beginAttack(e, skill, T, pl);
        } else {
          if (d > reach * 0.85) chase(e, tp.x, tp.z, speed, dt);
          else { e.bot.setMove(0, 0); face(e, tp.x, tp.z, dt, e.c.tags.includes('heavy') ? 5 : 9); if (skill && !e.pending) beginAttack(e, skill, T, pl); }
        }
        // leash: give up if the player got very far away
        if (T === PLAYER && d > 45 && !e.hunter) { e.state = 'idle'; c.alerted = false; e.bot.setAlert(0); e.detect = 0; }
      }
      separate(e, dt);
      e.pos.y = world.groundAt(e.pos.x, e.pos.z);
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
    e.state = 'dead'; e.pending = null; e.tele = null; e.dash = null; e.ally = 0;
    e.bot.play('die', { loop: false });
    e.bot.setAlert(0);
    audio.sfx(e.c.defId === 'scrap_rat' ? 'explosion_small' : 'power_down', { x: e.pos.x, z: e.pos.z, vol: 0.7 });
    if (e.c.faction === 'syndicate') audio.bark('b_thug_death_', { x: e.pos.x, z: e.pos.z, cooldown: 6 });
    if (e.c.faction === 'concord' && e.c.tags.includes('frame')) audio.bark('b_warden_death_', { x: e.pos.x, z: e.pos.z, cooldown: 8 });
    fx.sparks(tmp.set(e.pos.x, e.pos.y + 0.6, e.pos.z), 0xffc070, 16, 6);
    fx.ring(e.pos, 1.8, 0xffc070, 0.35);
    ctx.onDeath && ctx.onDeath(e);
  }

  function damage(e, res, { byPlayer = true } = {}) {
    if (e.state === 'dead') return;
    e.bot.hitFlash();
    if (res.amount > 0 && !res.killed && Math.random() < 0.35 && !['elite', 'champion', 'boss'].includes(e.c.rank) && !e.tele) e.bot.play('hit', { loop: false, fade: 0.05 });
    if (e.ally) return void ((res.killed || !e.c.alive) && die(e));
    if (byPlayer && e.aggro && Math.random() < 0.5) e.aggro = null;
    alert(e, 'hit');
    if (res.killed || !e.c.alive) die(e);
  }

  // shove away from (x,z); heavier ranks resist. Negative power pulls in.
  function knock(e, x, z, power) {
    const dx = e.pos.x - x, dz = e.pos.z - z, d = Math.hypot(dx, dz) || 1;
    const k = power / (e.c.rank === 'grunt' ? 1 : e.c.rank === 'veteran' ? 1.6 : e.c.rank === 'boss' ? 6 : 3) / (e.c.tags.includes('heavy') ? 2 : 1);
    e.kbx += dx / d * k; e.kbz += dz / d * k;
  }

  return {
    list, decoys, spawn, update, alert, damage, die, knock, addDecoy, removeDecoy, PLAYER,
    alive: () => list.filter((e) => e.state !== 'dead' && !e.nonCombat),
    hostileNear(x, z, r) { return list.some((e) => e.state !== 'dead' && !e.nonCombat && !e.ally && e.state !== 'idle' && e.state !== 'search' && Math.hypot(e.pos.x - x, e.pos.z - z) < r); },
    // Hack Pulse: fight for the player for t seconds
    convert(e, t) { e.ally = t; e.state = 'chase'; e.pending = null; e.tele = null; e.aggro = null; e.bot.setAlert(0); fx.ring(e.pos, 1.6, 0x7ff6ff, 0.5); fx.sparks(tmp.set(e.pos.x, e.pos.y + 1.2, e.pos.z), 0x7ff6ff, 12, 5); },
    // Veil: engaged enemies lose the player and search the last known spot
    loseTrack(p, r) {
      for (const e of list) {
        if (e.state === 'dead' || e.nonCombat || e.ally || e.brain || e.state === 'idle') continue;
        if (e.pos.distanceTo(p) > r) continue;
        e.state = 'search'; e.searchT = 5; e.lastSeen = p.clone(); e.c.alerted = false; e.detect = 0.4; e.pending = null; e.bot.setAlert(1);
      }
    },
    taunt(x, z, r, t) { for (const e of list) if (e.state !== 'dead' && !e.nonCombat && !e.ally && Math.hypot(e.pos.x - x, e.pos.z - z) < r) { alert(e, 'taunt'); e.tauntT = t; e.aggro = null; } },
    clear(filter = () => true) {
      for (let i = list.length - 1; i >= 0; i--) {
        const e = list[i];
        if (!filter(e)) continue;
        world.scene.remove(e.bot.root); e.bot.dispose(); list.splice(i, 1);
      }
    },
  };
}
