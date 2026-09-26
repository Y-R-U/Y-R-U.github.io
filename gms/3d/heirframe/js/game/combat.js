import * as THREE from 'three';
import { skillReady } from '../sim/stats.js';
import { createKits } from './kits.js';

const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export const ELEM_COLOR = { shock: 0x8fe8ff, kinetic: 0xffe0a0, thermal: 0xff8040, ion: 0xb080ff };
const SWING = { r_baton: 0xffd890, b_fists: 0xffc860, h_blade: 0x7ff6ff };

// Player-side combat: basic attacks (melee combos or auto-fire) with auto-target + auto-approach, the frame kits
// (kits.js), dodge, and per-frame feel metrics (engagement distance, backstab share) for the bot tests.
export function createCombat(ctx) {
  const { sim, fx, audio, ui, player } = ctx;
  const tmp = new THREE.Vector3();
  const st = { slashAt: 0, combo: 0, comboT: 0, pending: null, pendingT: 0, approach: null, approachT: 0, dodgeCd: 0, dodgeMax: 4, dodgeT: 0, lastAttack: 0, lock: null, lockT: 0, fireT: 0 };
  const metrics = {};

  const actor = () => player.actor;
  const bindActor = () => { actor().onEvent = (ev) => { if ((ev === 'impact' || ev === 'fire') && st.pending) release(); }; };
  bindActor();

  const pcNow = () => sim.playerCombatant();
  const archetype = () => sim.activeFrame().archetype;
  const targets = () => ctx.enemies.alive().filter((e) => e.state !== 'dead' && !e.ally).concat(ctx.props.targets());
  const dist = (e) => Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
  const yawTo = (e) => Math.atan2(e.pos.x - player.pos.x, e.pos.z - player.pos.z);

  function pickTarget(range, { cone = Math.PI, prefer = null, los = false } = {}) {
    let best = null, bestScore = Infinity;
    for (const e of targets()) {
      const d = dist(e) - (e.radius || 0.4);
      if (d > range) continue;
      const a = Math.abs(angDiff(yawTo(e), player.yaw));
      if (a > cone) continue;
      if (los && !e.prop && !ctx.losClear(player.pos, e.pos)) continue;
      let score = d + a * 2.2;
      if (e.prop) score += 1.5;
      if (e === prefer) score -= 4;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  const meleeReach = (skill) => (skill?.range || 2) + 0.35;
  const isRanged = (skill) => skill?.kind === 'ranged';
  // same distance test release() uses, so a swing that starts in reach lands; ranged basics need range + line of sight
  function inReach(e, skill = pcNow().skills.attack) {
    if (isRanged(skill)) return dist(e) - (e.radius || 0.4) <= (skill.range || 14) - 0.5 && (e.prop || ctx.losClear(player.pos, e.pos));
    return dist(e) - (e.radius || 0.4) * 0.6 <= meleeReach(skill) - 0.1;
  }

  function approach(t) { if (st.approach !== t) st.approachNav = 0; st.approach = t; st.approachT = 1.5; }
  function faceTo(e, t = 0.35) { player.faceYaw(yawTo(e), t); }

  // enemy facing vs the attacker's position: behind = backstab, front = shields block
  function relAngle(e, from = player.pos) {
    if (e.prop || e.yaw == null) return 0;
    return Math.abs(angDiff(Math.atan2(from.x - e.pos.x, from.z - e.pos.z), e.yaw));
  }

  function attack() {
    if (ctx.blocked()) return false;
    const pc = pcNow();
    const skill = pc.skills.attack;
    if (!skill || st.pending || !skillReady(pc, skill)) return false;
    if (isRanged(skill)) return fire(pc, skill);
    let t = pickTarget(meleeReach(skill) + 0.5, { cone: 1.9, prefer: st.lock });
    // candidate just outside what release() can land: walk in instead of whiffing
    if (t && !inReach(t, skill)) { approach(t); return false; }
    if (!t) {
      const far = pickTarget(7.5, { cone: Math.PI, prefer: st.lock });
      if (far) { approach(far); return false; }
    }
    if (!sim.useSkill(pc, skill)) return false;
    if (t) { faceTo(t); st.lock = t; st.lockT = 3; }
    const n = skill.combo?.length || 3;
    st.pending = { skill, target: t, combo: st.combo, n };
    st.pendingT = skill.id === 'h_blade' ? 0.14 : skill.id === 'b_fists' ? 0.2 : 0.24;
    st.combo = (st.combo + 1) % n; st.comboT = skill.comboReset || 1.2;
    const heavy = skill.id === 'b_fists' && st.pending.combo === n - 1;
    actor().play(heavy ? 'attack_heavy' : skill.anim || 'attack_melee', { loop: false, speed: skill.id === 'h_blade' ? 1.7 : heavy ? 1.5 : 1.25 });
    audio.sfx('swing', { x: player.pos.x, z: player.pos.z, vol: skill.id === 'b_fists' ? 0.9 : 0.7, minGap: 50 });
    st.slashAt = skill.id === 'h_blade' ? 0.05 : 0.1;
    st.lastAttack = performance.now();
    return true;
  }

  // Gunner basic: auto-fire hitscan with slight spread; walks into range when nothing is
  function fire(pc, skill) {
    const range = skill.range || 16;
    const t = pickTarget(range, { cone: Math.PI, prefer: st.lock, los: true });
    if (!t) {
      const far = pickTarget(range + 10, { cone: Math.PI, prefer: st.lock });
      if (far) approach(far);
      return false;
    }
    if (!sim.useSkill(pc, skill)) return false;
    faceTo(t, 0.3); st.lock = t; st.lockT = 3;
    actor().play('shoot', { loop: false, speed: 1.6 });
    const from = muzzle();
    const side = (st.fireT = (st.fireT + 1) % 2) ? 1 : -1;
    const sp = (skill.spread || 4) * Math.PI / 180;
    const to = new THREE.Vector3(t.pos.x + (Math.random() - 0.5) * sp * 3, t.pos.y + (t.prop ? 0.5 : 1.0), t.pos.z + (Math.random() - 0.5) * sp * 3);
    from.x += Math.cos(player.yaw) * 0.12 * side; from.z -= Math.sin(player.yaw) * 0.12 * side;
    fx.tracer(from, to, 0xffe2a0, 0.07, 0.55);
    fx.flash(from, 0.18, 0xffd080, 0.05);
    audio.sfx('shoot', { x: player.pos.x, z: player.pos.z, vol: 0.45, minGap: 60 });
    const r = strike(pc, t, skill, { knock: 0.6, frontal: relAngle(t) < Math.PI / 3 });
    if (r && !r.miss && r.crit) ctx.rig.shake = Math.max(ctx.rig.shake, 0.04);
    return true;
  }

  function release() {
    const p = st.pending; st.pending = null;
    if (!p) return;
    const pc = pcNow();
    const skill = p.skill;
    const reach = meleeReach(skill);
    const arc = (skill.arc || 70) * Math.PI / 180;
    const fin = p.combo === p.n - 1;
    let hitAny = false, crit = false, kill = false, back = false;
    for (const e of targets()) {
      const d = dist(e) - (e.radius || 0.4) * 0.6;
      if (d > reach) continue;
      const a = Math.abs(angDiff(yawTo(e), player.yaw));
      if (a > arc && d > 0.9) continue;
      const ra = relAngle(e);
      const knock = skill.id === 'b_fists' ? (fin ? 9 : 2.5) : skill.id === 'h_blade' ? 1.2 : fin ? 7 : 3.2;
      const res = strike(pc, e, skill, { comboIndex: p.combo, backstab: e.c && (!e.c.alerted || ra > Math.PI * 2 / 3), frontal: ra < Math.PI / 3, knock });
      hitAny = true;
      if (res?.crit) crit = true;
      if (res?.killed) kill = true;
      if (res?.backstab) back = true;
    }
    if (hitAny) {
      const big = fin || crit || kill || back;
      const heavy = skill.id === 'b_fists' && fin;
      ctx.rig.shake = Math.max(ctx.rig.shake, heavy ? 0.2 : big ? 0.14 : 0.07);
      ctx.hitstop(kill ? 0.09 : heavy ? 0.1 : big ? 0.075 : 0.05);
      if (heavy) { fx.ring(player.pos, 2.4, 0xffc860, 0.3); audio.sfx('explosion_small', { x: player.pos.x, z: player.pos.z, vol: 0.5, minGap: 100 }); }
      if (back) fx.flash(tmp.set(player.pos.x + Math.sin(player.yaw), player.pos.y + 1.1, player.pos.z + Math.cos(player.yaw)), 0.5, 0x7ff6ff, 0.12);
    }
  }

  function record(e, res, skill) {
    const k = archetype();
    const m = metrics[k] ||= { hits: 0, dmg: 0, distSum: 0, distN: 0, backstabs: 0, backstabDmg: 0, meleeHits: 0, kills: 0 };
    m.hits++; m.dmg += res.amount || 0;
    if (!skill.fromSummon) { m.distSum += dist(e); m.distN++; }
    if (skill.kind === 'melee') m.meleeHits++;
    if (res.backstab) { m.backstabs++; m.backstabDmg += res.amount || 0; }
    if (res.killed) m.kills++;
  }

  // apply one hit from the player to an enemy or prop, with all the feedback
  function strike(pc, e, skill, opts = {}) {
    if (e.prop) { ctx.props.damage(e, Math.round((skill.base || skill.combo?.[0] || 10) * pc.stats.dmgScale * (opts.falloff || 1)), skill); return null; }
    if (e.nonCombat || e.state === 'dead' || e.ally) return null;
    const res = sim.hit(pc, e.c, skill, opts);
    if (res.immune) return res;
    const at = tmp.set(e.pos.x, e.pos.y + (e.bot.height || 1.6) * 0.6 * e.bot.root.scale.y, e.pos.z);
    const s = ctx.project(at);
    if (res.miss) { if (s.on) ui.damage(s.x, s.y, 0, 'miss'); return res; }
    record(e, res, skill);
    if (s.on) ui.damage(s.x, s.y, res.amount, res.crit || res.backstab ? 'crit' : res.shieldDmg > res.hullDmg ? 'shield' : 'normal');
    const el = res.element || 'kinetic';
    const col = res.backstab ? 0x7ff6ff : ELEM_COLOR[el] || 0xffe0a0;
    if (!opts.quiet) {
      fx.sparks(at, col, res.crit ? 14 : 8, res.crit ? 7 : 5);
      fx.impact(at, res.crit ? 0xfff2c0 : col, res.crit || res.backstab ? 1.5 : 1);
    }
    if (res.blocked && !opts.quiet) fx.ring(e.pos, 1.2, 0xbfe6ff, 0.2);
    if (opts.knock && !e.prop) ctx.enemies.knock(e, opts.from?.x ?? player.pos.x, opts.from?.z ?? player.pos.z, opts.knock * (res.crit ? 1.4 : 1) * (res.killed ? 1.6 : 1));
    if (res.killed) { fx.flash(at, 0.5, 0xfff0d0, 0.14); fx.ring(e.pos, 2.2, col, 0.4); }
    if (!opts.quiet) audio.sfx(res.shieldDmg > res.hullDmg ? 'shield_hit' : skill.kind === 'melee' ? 'melee_hit' : 'hit', { x: e.pos.x, z: e.pos.z, vol: res.crit ? 1 : 0.8, minGap: 30 });
    if (res.shieldBroke) audio.sfx('shield_break', { x: e.pos.x, z: e.pos.z });
    ctx.enemies.damage(e, res, { byPlayer: !skill.fromSummon });
    if (res.chain && !opts.chained) {
      const other = targets().filter((o) => o !== e && !o.prop && o.state !== 'dead' && o.pos.distanceTo(e.pos) < 4.5).sort((a, b) => a.pos.distanceTo(e.pos) - b.pos.distanceTo(e.pos))[0];
      if (other) {
        fx.tracer(at.clone(), new THREE.Vector3(other.pos.x, other.pos.y + 0.8, other.pos.z), 0x9fe8ff, 0.12, 0.8);
        strike(pc, other, skill, { chained: true, falloff: res.chain.pct, comboIndex: opts.comboIndex });
      }
    }
    return res;
  }

  function muzzle() {
    const a = actor();
    const m = a.sockets?.muzzle || a.sockets?.handR;
    if (m) { m.getWorldPosition(tmp); return tmp.clone(); }
    return new THREE.Vector3(player.pos.x, player.pos.y + 1.3, player.pos.z);
  }

  const api = {
    get lock() { return st.lock; }, set lock(v) { st.lock = v; st.lockT = 4; },
    get busy() { return !!st.pending || kits.busy; },
    metrics,
  };
  const K = { ctx, st, sim, fx, audio, ui, player, actor, pcNow, targets, dist, yawTo, relAngle, pickTarget, strike, faceTo, muzzle, api };
  const kits = createKits(K);

  function skill(id) {
    if (ctx.blocked()) return false;
    const pc = pcNow();
    const sk = pc.skills[id];
    if (!sk) return false;
    if (kits.busy) return false;
    if (!skillReady(pc, sk, { energyCostMult: sim.state.contract?.mission.modifiers.includes('jammed') ? 1.5 : 1 })) { audio.sfx('ui_deny', { vol: 0.5 }); return false; }
    return kits.cast(sk, pc);
  }

  function dodge(dir) {
    if (ctx.blocked() || st.dodgeCd > 0 || player.dodging || kits.busy) return false;
    const pc = pcNow();
    st.dodgeMax = pc.stats.dodgeCd || 4;
    st.dodgeCd = st.dodgeMax;
    let dx = dir?.x || 0, dz = dir?.z || 0;
    if (Math.hypot(dx, dz) < 0.1) { dx = Math.sin(player.yaw); dz = Math.cos(player.yaw); }
    const k = archetype();
    player.dodge(dx, dz, k === 'ghost' ? 4.2 : k === 'brawler' ? 3.2 : 3.6, k === 'ghost' ? 0.36 : 0.45);
    actor().play('dodge', { loop: false, speed: 1.3 });
    pc.invulnerable = true;
    st.dodgeT = 0.42;
    audio.sfx('dodge', { vol: 0.9 });
    if (k === 'ghost') fx.ring(player.pos, 1.4, 0x7ff6ff, 0.25);
    return true;
  }

  function update(dt, { attackHeld = false } = {}) {
    const pc = pcNow();
    if (st.slashAt > 0 && (st.slashAt -= dt) <= 0) {
      const sk = pc.skills.attack;
      tmp.set(player.pos.x + Math.sin(player.yaw) * 0.35, player.pos.y + 1.0, player.pos.z + Math.cos(player.yaw) * 0.35);
      const col = SWING[sk?.id] || 0xffd890;
      fx.slash(tmp, player.yaw + (st.combo % 2 ? 0.3 : -0.3), col, sk?.id === 'b_fists' ? 2.4 : st.combo === 0 ? 2.1 : 1.6, sk?.id === 'h_blade' ? 0.12 : 0.18);
    }
    if (st.pending && (st.pendingT -= dt) <= 0) release();
    if ((st.comboT -= dt) <= 0) st.combo = 0;
    if (st.dodgeCd > 0) st.dodgeCd = Math.max(0, st.dodgeCd - dt);
    if (st.dodgeT > 0 && (st.dodgeT -= dt) <= 0) pc.invulnerable = false;
    if (st.lock && ((st.lockT -= dt) <= 0 || st.lock.state === 'dead' || st.lock.destroyed || st.lock.ally)) st.lock = null;
    if (st.approach) {
      const t = st.approach;
      st.approachT -= dt;
      if (t.state === 'dead' || t.destroyed || st.approachT <= 0 || player.stickActive) st.approach = null;
      else if (inReach(t)) { st.approach = null; player.setTarget(null); attack(); }
      else if ((st.approachNav -= dt) <= 0) { st.approachNav = 0.35; ctx.walkTo(t.pos.x, t.pos.z, isRanged(pc.skills.attack) ? (pc.skills.attack.range || 14) * 0.7 : 1.0); }
    }
    kits.update(dt, pc);
    if (attackHeld && !st.pending) attack();
    ui.skills.dodge(st.dodgeCd, st.dodgeMax);
  }

  // new frame deployed: fresh combo/locks, rebind anim events
  function reset() {
    st.pending = null; st.combo = 0; st.approach = null; st.lock = null; st.dodgeCd = 0;
    kits.reset();
    bindActor();
  }

  return Object.assign(api, {
    attack, skill, dodge, update, strike, pickTarget, inReach, reset, relAngle, kits,
    engage(t) { st.lock = t; st.lockT = 4; approach(t); st.approachT = 3; },
  });
}
