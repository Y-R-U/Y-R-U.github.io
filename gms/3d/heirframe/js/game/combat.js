import * as THREE from 'three';
import { skillReady, addStatus } from '../sim/stats.js';

const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const ELEM_COLOR = { shock: 0x8fe8ff, kinetic: 0xffe0a0, thermal: 0xff8040, ion: 0xb080ff };

// Player-side combat: basic attack with auto-target + auto-approach, rental skills, dodge.
export function createCombat(ctx) {
  const { sim, fx, audio, ui, player, actor } = ctx;
  const tmp = new THREE.Vector3();
  const st = { combo: 0, comboT: 0, pending: null, pendingT: 0, approach: null, approachT: 0, dodgeCd: 0, dodgeMax: 4, dodgeT: 0, lastAttack: 0, lock: null, lockT: 0 };

  actor.onEvent = (ev) => { if ((ev === 'impact' || ev === 'fire') && st.pending) release(); };

  const pcNow = () => sim.playerCombatant();
  const targets = () => ctx.enemies.alive().filter((e) => e.state !== 'dead').concat(ctx.props.targets());
  const dist = (e) => Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);

  function pickTarget(range, { cone = Math.PI, prefer = null } = {}) {
    let best = null, bestScore = Infinity;
    for (const e of targets()) {
      const d = dist(e) - (e.radius || 0.4);
      if (d > range) continue;
      const a = Math.abs(angDiff(Math.atan2(e.pos.x - player.pos.x, e.pos.z - player.pos.z), player.yaw));
      if (a > cone) continue;
      let score = d + a * 2.2;
      if (e.prop) score += 1.5;
      if (e === prefer) score -= 4;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  function faceTo(e) { player.faceYaw(Math.atan2(e.pos.x - player.pos.x, e.pos.z - player.pos.z), 0.35); }

  function attack() {
    if (ctx.blocked()) return false;
    const pc = pcNow();
    const skill = pc.skills.attack;
    if (!skill || st.pending || !skillReady(pc, skill)) return false;
    const reach = (skill.range || 2) + 0.3;
    let t = pickTarget(reach + 0.5, { cone: 1.9, prefer: st.lock });
    if (!t) {
      const far = pickTarget(7.5, { cone: Math.PI, prefer: st.lock });
      if (far) { st.approach = far; st.approachT = 1.2; return false; }
    }
    if (!sim.useSkill(pc, skill)) return false;
    if (t) { faceTo(t); st.lock = t; st.lockT = 3; }
    st.pending = { skill, target: t, combo: st.combo };
    st.pendingT = 0.24;
    st.combo = (st.combo + 1) % 3; st.comboT = 1.2;
    actor.play(skill.anim || 'attack_melee', { loop: false, speed: 1.25 });
    audio.sfx('swing', { x: player.pos.x, z: player.pos.z, vol: 0.7, minGap: 0.05 });
    st.lastAttack = performance.now();
    return true;
  }

  function release() {
    const p = st.pending; st.pending = null;
    if (!p) return;
    const pc = pcNow();
    const skill = p.skill;
    const reach = (skill.range || 2) + 0.35;
    const arc = (skill.arc || 70) * Math.PI / 180;
    let hitAny = false;
    for (const e of targets()) {
      const d = dist(e) - (e.radius || 0.4) * 0.6;
      if (d > reach) continue;
      const a = Math.abs(angDiff(Math.atan2(e.pos.x - player.pos.x, e.pos.z - player.pos.z), player.yaw));
      if (a > arc && d > 0.9) continue;
      strike(pc, e, skill, { comboIndex: p.combo, backstab: e.c && !e.c.alerted });
      hitAny = true;
    }
    if (hitAny) { ctx.rig.shake = Math.max(ctx.rig.shake, 0.06); ctx.hitstop(0.045); }
  }

  // apply one hit from the player to an enemy or prop, with all the feedback
  function strike(pc, e, skill, opts = {}) {
    if (e.prop) { ctx.props.damage(e, Math.round((skill.base || 10) * pc.stats.dmgScale), skill); return null; }
    if (e.nonCombat || e.state === 'dead') return null;
    const res = sim.hit(pc, e.c, skill, opts);
    if (res.immune) return res;
    const at = tmp.set(e.pos.x, e.pos.y + (e.bot.height || 1.6) * 0.6 * e.bot.root.scale.y, e.pos.z);
    const s = ctx.project(at);
    if (res.miss) { if (s.on) ui.damage(s.x, s.y, 0, 'miss'); return res; }
    if (s.on) ui.damage(s.x, s.y, res.amount, res.crit ? 'crit' : res.shieldDmg > res.hullDmg ? 'shield' : 'normal');
    const el = res.element || 'kinetic';
    fx.sparks(at, ELEM_COLOR[el] || 0xffe0a0, res.crit ? 14 : 8, res.crit ? 7 : 5);
    audio.sfx(res.shieldDmg > res.hullDmg ? 'shield_hit' : skill.kind === 'melee' ? 'melee_hit' : 'hit', { x: e.pos.x, z: e.pos.z, vol: res.crit ? 1 : 0.8, minGap: 0.03 });
    if (res.shieldBroke) audio.sfx('shield_break', { x: e.pos.x, z: e.pos.z });
    ctx.enemies.damage(e, res);
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
    const m = actor.sockets?.muzzle || actor.sockets?.handR;
    if (m) { m.getWorldPosition(tmp); return tmp.clone(); }
    return new THREE.Vector3(player.pos.x, player.pos.y + 1.3, player.pos.z);
  }

  function skill(id) {
    if (ctx.blocked()) return false;
    const pc = pcNow();
    const sk = pc.skills[id];
    if (!sk) return false;
    if (!skillReady(pc, sk)) { audio.sfx('ui_deny', { vol: 0.5 }); return false; }
    if (sk.kind === 'ranged') {
      const t = pickTarget(sk.range || 14, { cone: Math.PI, prefer: st.lock });
      if (!t) { ui.toast('No target in range', 'warn', { ms: 1200 }); audio.sfx('ui_deny', { vol: 0.5 }); return false; }
      if (!sim.useSkill(pc, sk)) return false;
      faceTo(t); st.lock = t; st.lockT = 3;
      actor.play(sk.anim || 'shoot', { loop: false });
      setTimeout(() => {
        if (t.state === 'dead' && !t.prop) return;
        const from = muzzle();
        const to = new THREE.Vector3(t.pos.x, t.pos.y + (t.prop ? 0.5 : 1.0 * (t.bot?.root.scale.y || 1) * Math.min(1, (t.bot?.height || 1.6) / 1.6)), t.pos.z);
        fx.tracer(from, to, 0x9fe8ff, 0.16, 1.4);
        fx.flash(from, 0.25, 0x9fe8ff);
        audio.sfx('laser', { x: player.pos.x, z: player.pos.z, vol: 0.8 });
        strike(pc, t, sk, {});
      }, 180);
      return true;
    }
    if (!sim.useSkill(pc, sk)) return false;
    actor.play(sk.anim || 'cast', { loop: false });
    if (sk.kind === 'self') {
      fx.ring(player.pos, 2.5, 0xffb060, 0.5);
      audio.sfx('scan', { vol: 0.8 });
      ui.toast(sk.name, 'good', { ms: 1400, icon: sk.icon });
    } else if (sk.kind === 'distract') {
      fx.advert(player.pos, 2.6);
      fx.ring(player.pos, sk.radius || 6, 0x8fe8ff, 0.6);
      audio.sfx('holo', { vol: 0.8 }) || audio.sfx('scan', { vol: 0.8 });
      let n = 0;
      for (const e of ctx.enemies.alive()) {
        if (e.pos.distanceTo(player.pos) > (sk.radius || 6)) continue;
        for (const a of sk.applies || []) addStatus(e.c, { ...a, src: 'player' });
        e.pending = null; n++;
      }
      if (n) ui.toast(`${n} distracted`, 'info', { ms: 1200 });
    }
    return true;
  }

  function dodge(dir) {
    if (ctx.blocked() || st.dodgeCd > 0 || player.dodging) return false;
    const pc = pcNow();
    st.dodgeMax = pc.stats.dodgeCd || 4;
    st.dodgeCd = st.dodgeMax;
    let dx = dir?.x || 0, dz = dir?.z || 0;
    if (Math.hypot(dx, dz) < 0.1) { dx = Math.sin(player.yaw); dz = Math.cos(player.yaw); }
    player.dodge(dx, dz, 3.4, 0.45);
    actor.play('dodge', { loop: false, speed: 1.3 });
    pc.invulnerable = true;
    st.dodgeT = 0.42;
    audio.sfx('dodge', { vol: 0.9 });
    return true;
  }

  function update(dt, { attackHeld = false } = {}) {
    const pc = pcNow();
    if (st.pending && (st.pendingT -= dt) <= 0) release();
    if ((st.comboT -= dt) <= 0) st.combo = 0;
    if (st.dodgeCd > 0) st.dodgeCd = Math.max(0, st.dodgeCd - dt);
    if (st.dodgeT > 0 && (st.dodgeT -= dt) <= 0) pc.invulnerable = false;
    if (st.lock && ((st.lockT -= dt) <= 0 || st.lock.state === 'dead' || st.lock.destroyed)) st.lock = null;
    if (st.approach) {
      const t = st.approach;
      st.approachT -= dt;
      if (t.state === 'dead' || t.destroyed || st.approachT <= 0 || player.stickActive) st.approach = null;
      else {
        const reach = (pc.skills.attack?.range || 2) + (t.radius || 0.4) * 0.5;
        if (dist(t) <= reach) { st.approach = null; player.setTarget(null); attack(); }
        else player.setTarget({ x: t.pos.x, z: t.pos.z }, { stopAt: reach * 0.8 });
      }
    }
    if (attackHeld && !st.pending) attack();
    ui.skills.dodge(st.dodgeCd, st.dodgeMax);
  }

  return {
    attack, skill, dodge, update, strike, pickTarget,
    get lock() { return st.lock; }, set lock(v) { st.lock = v; st.lockT = 4; },
    engage(t) { st.lock = t; st.lockT = 4; st.approach = t; st.approachT = 3; },
    get busy() { return !!st.pending; },
  };
}
