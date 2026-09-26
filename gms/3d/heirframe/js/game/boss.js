import * as THREE from 'three';
import { SKILLS } from '../data/frames.js';
import { addStatus } from '../sim/stats.js';

// Boss runtime (DESIGN §10.2). Big Kettle: an enforcer body in copper and brass until art ships `boss_kettle`.
// Phase 1 brawls with stomps and steam vents; below 50% he boils over (faster, a shoulder charge, a Knuckle crew)
// and at 0 HP he yields instead of dying. The ornate top bar, boss music and his lines are driven from here.
const KETTLE_PAINT = {
  body: { color: 0x8a4a22, metal: 0.95, rough: 0.32, coat: 0.4 }, trim: { color: 0xd8a040, metal: 1, rough: 0.25 },
  mech: { color: 0x2a2320, metal: 0.8, rough: 0.4 }, glow: 0xff7a20, eye: 0xffb040,
};
const SCRIPT = {
  big_kettle: { paint: KETTLE_PAINT, scale: 1.18, title: 'Silverhand Captain', lines: { spawn: 'a1_s10_kettle_02', phase: 'a1_s11_kettle_01', down: 'a1_s11_kettle_02' } },
};

export function createBoss(ctx) {
  const { enemies, ui, audio, fx } = ctx;
  const v = new THREE.Vector3();
  let B = null;
  const line = (key) => (ctx.bossLine ? ctx.bossLine(key, 'kettle') : audio.vo(key));

  function spawn(def, x, z, R) {
    const sc = SCRIPT[def.defId] || {};
    const e = enemies.spawn({ defId: def.defId, rank: undefined, level: def.level || R.mission.level, name: def.name }, x, z, { hostile: true, paint: sc.paint, scale: sc.scale || 1.25 });
    e.mission = R.mission.id; e.hunter = true; e.isBoss = true;
    const c = e.c;
    B = { e, c, def, sc, phase: 0, phases: c.phases || [0.5], ventT: 5, addsDone: false, steamT: 0, downT: 0, t: 0 };
    e.brain = brain;
    fx.beam(e.pos, 0xff7a20, 0.8, 6, 2);
    fx.ring(e.pos, 4, 0xff7a20, 0.6);
    audio.sfx('explosion', { x, z, vol: 0.8 });
    ctx.rig.shake = Math.max(ctx.rig.shake, 0.2);
    ui.boss.set({ name: c.name, title: sc.title || c.title || '', hp: c.hp, max: c.stats.hp, shield: c.shield, shieldMax: c.stats.shield || 0, phases: B.phases, phase: 0 });
    ui.sting(c.name, sc.title || 'Champion', 'alert', 2400);
    if (sc.lines?.spawn) setTimeout(() => line(sc.lines.spawn), 600);
    ctx.onBoss?.(true, e);
    return e;
  }

  // runs before the generic AI each frame; returns true only when it took over movement this frame
  function brain(e, dt) {
    if (!B || B.e !== e) return false;
    const c = e.c;
    B.t += dt;
    // steam: constant venting from the boiler, heavier in phase 2
    if ((B.steamT -= dt) <= 0) { B.steamT = B.phase ? 0.08 : 0.2; fx.sparks(v.set(e.pos.x - Math.sin(e.yaw) * 0.6, e.pos.y + 2.4 * e.bot.root.scale.y, e.pos.z - Math.cos(e.yaw) * 0.6), 0xf0e6dc, 1, 2.5); }
    if (B.phase === 0 && c.hp < c.stats.hp * B.phases[0]) phase2(e);
    return false;
  }

  function phase2(e) {
    B.phase = 1;
    const c = e.c;
    ui.sting(`${c.name} is boiling over`, 'Faster, angrier, and he brought friends', 'alert', 2600);
    if (B.sc.lines?.phase) line(B.sc.lines.phase);
    audio.sfx('alarm', { vol: 0.5 });
    fx.ring(e.pos, 6, 0xff5020, 0.7);
    fx.flash(v.set(e.pos.x, e.pos.y + 2, e.pos.z), 2, 0xff7a20, 0.25);
    ctx.rig.shake = Math.max(ctx.rig.shake, 0.3);
    addStatus(c, { id: 'boil', t: 999, moveMult: 1.2, dmgMult: 1.15, atkSpeedMult: 1.2 });
    c.stats.moveSpeed *= 1.2;
    c.skills.e_dash = SKILLS.e_dash;
    const adds = B.def.adds || { defId: 'knuckle', count: 3 };
    const R = ctx.runner.active;
    if (R && !B.addsDone) {
      B.addsDone = true;
      const p = { i: R.packs.length, site: R.step?.site, units: Array.from({ length: adds.count || 3 }, () => ({ defId: adds.defId, rank: 'grunt', level: R.mission.level })), atStep: R.idx, spawned: false };
      R.packs.push(p);
      ctx.runner.spawnPack(p, true, { near: e.pos, dist: 14 });
    }
    ui.boss.set({ phase: 1, enraged: true });
  }

  function update(dt) {
    if (!B) return;
    const e = B.e, c = e.c;
    if (e.state === 'dead') {
      if (!B.downT) {
        B.downT = 0.001;
        ui.boss.set({ hp: 0 });
        if (B.sc.lines?.down) line(B.sc.lines.down);
        ctx.hitstop(0.25);
        ctx.rig.shake = Math.max(ctx.rig.shake, 0.35);
        fx.flash(v.set(e.pos.x, e.pos.y + 1.5, e.pos.z), 2.4, 0xfff0c0, 0.3);
        fx.ring(e.pos, 7, 0xffc860, 0.8);
        setTimeout(() => { if (e.bot) { e.bot.play('sit', { loop: true }); } }, 900);
        // the yielded captain sits there for the rest of the scene instead of sinking away
        e.deadT = -40;
      }
      if ((B.downT += dt) > 2.2) { ui.boss.hide(); ctx.onBoss?.(false, e); B.over = true; }
      if (B.over) B = null;
      return;
    }
    ui.boss.set({ hp: Math.max(0, c.hp), max: c.stats.hp, shield: Math.max(0, c.shield), shieldMax: c.stats.shield || 0 });
  }

  function end() {
    if (!B) return;
    ui.boss.hide();
    ctx.onBoss?.(false, B.e);
    B = null;
  }

  return { spawn, update, end, get active() { return !!B && B.e.state !== 'dead'; }, get entity() { return B?.e || null; } };
}
