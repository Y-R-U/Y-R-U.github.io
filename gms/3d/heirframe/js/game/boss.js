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
  big_kettle: { paint: KETTLE_PAINT, scale: 1.08, title: 'Silverhand Captain', speaker: 'kettle', steam: true, lines: { spawn: 'a1_s10_kettle_02', phase: 'a1_s11_kettle_01', down: 'a1_s11_kettle_02' },
    phaseSting: ['is boiling over', 'Faster, angrier, and he brought friends'] },
  // A2-M4: shield + shock lance; at 60% she calls a Warden squad and starts lunging harder
  halloran: { scale: 1.05, title: 'Warden-Captain', speaker: 'halloran', lines: { spawn: 'a2_s04_halloran_01', phase: 'a2_s04_halloran_02' },
    phaseSting: ['calls it in', 'Warden squad inbound. She stops holding back'], adds: { defId: 'warden', count: 3 } },
  // A5-M5: three phases on the open hull; she spares you once per phase (STORY R6) and yields at 0 as Lyra
  // P6 Voice Hunts: one of the five escaped Voices, gilded livery from js/data/voices.js; calls its guard at half HP
  voice: { scale: 1.12, title: 'Escaped Voice', adds: { defId: 'gilded_guard', count: 2 }, phaseSting: ['calls its Gilded Guard', 'Silence the Voice'] },
  seraph: { scale: 1, title: "The Concord's hunter", speaker: 'seraph', multi: true, spares: true, robotPhase: [1, 2, 3], lines: { spawn: 'a5_s05_seraph_01' },
    phases: [
      { sting: ['spreads her wings', 'A Choir angel answers her'], line: 'a2_s04_seraph_02', adds: { defId: 'choir_angel', count: 1 } },
      { sting: ['is cracking', 'The chip is failing. She hesitates between strikes'], line: 'a5_s05_seraph_02', slow: true },
    ] },
  // A6-M5: Harmony's defences (telegraphed strikes), then the seven halo voices shield him, then Iris cuts his link
  dray: { scale: 1, title: 'the Sovereign Frame', speaker: 'dray', multi: true, robotPhase: [1, 2, 3], strikes: true, lines: { spawn: 'a6_s05_dray_01', down: 'a6_s05_dray_03' },
    helm: ['harmony', 'dray', 'iris'],
    phases: [
      { sting: ['calls his Voices', 'Seven halo drones shield him. Shoot four down'], line: 'a6_s05_dray_04', drones: 7 },
      { sting: ['is cut off', 'Iris breaks free and cuts his city link. A fair fight'], line: 'a6_s05_iris_01', lineBy: 'iris', unlink: true },
    ] },
};

export function createBoss(ctx) {
  const { enemies, ui, audio, fx } = ctx;
  const v = new THREE.Vector3();
  let B = null;
  const line = (key) => (ctx.bossLine ? ctx.bossLine(key, B?.sc.speaker || 'kettle') : audio.vo(key));

  function spawnStandIn(def, x, z, R, sc) {
    const e = enemies.spawn({ defId: def.defId, level: def.level || R.mission.level, name: def.name }, x, z, { hostile: true, paint: sc.paint, scale: sc.scale || 1.25 });
    return setup(e, def, sc, R, x, z);
  }

  // a Voice Hunt target: the boss machinery (bar, adds at 50%) on the mission's target, in its own livery
  function spawnVoice(t, x, z, R) {
    const sc = { ...SCRIPT.voice, paint: t.paint, title: t.epithet || SCRIPT.voice.title };
    return spawnStandIn({ defId: 'voice', level: R.mission.level, name: t.name }, x, z, R, sc);
  }

  function spawn(def, x, z, R) {
    const sc = SCRIPT[def.defId] || {};
    const e = enemies.spawn({ defId: def.defId, rank: undefined, level: def.level || R.mission.level, name: def.name }, x, z, { hostile: true, scale: sc.scale || 1.25 });
    // the stand-in enforcer gets the copper livery; the real boss_kettle brings its own boiler
    if (e.c.robotKind !== 'boss_kettle' && sc.paint) { enemies.clear((o) => o === e); return spawnStandIn(def, x, z, R, sc); }
    return setup(e, def, sc, R, x, z);
  }

  function setup(e, def, sc, R, x, z) {
    e.mission = R.mission.id; e.hunter = true; e.isBoss = true;
    const c = e.c;
    B = { e, c, def, sc, phase: 0, phases: c.phases || [0.5], ventT: 5, addsDone: false, steamT: 0, downT: 0, t: 0, spared: [], drones: [], strikeT: 6 };
    e.brain = brain;
    if (sc.robotPhase) e.bot.setPhase?.(sc.robotPhase[0]);
    if (sc.helm) ctx.world.ctx?.helm?.setMode(sc.helm[0]);
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
    if (B.sc.multi) return multiBrain(e, dt);
    if (!B.sc.steam) { if (B.phase === 0 && c.hp < c.stats.hp * B.phases[0]) phase2(e); return false; }
    // steam: boss_kettle vents from its own sockets (steam()); the stand-in fakes it with pale sparks
    const steam = e.bot.steam ? (k) => e.bot.steam(k) : (k) => fx.sparks(v.set(e.pos.x - Math.sin(e.yaw) * 0.6, e.pos.y + 2.4 * e.bot.root.scale.y, e.pos.z - Math.cos(e.yaw) * 0.6), 0xf0e6dc, Math.ceil(k * 6), 2.5);
    if (!e.bot.steam && (B.steamT -= dt) <= 0) { B.steamT = B.phase ? 0.08 : 0.2; steam(0.2); }
    if ((B.puffT = (B.puffT ?? 4) - dt) <= 0) { B.puffT = B.phase ? 2 + Math.random() * 2 : 5 + Math.random() * 3; steam(B.phase ? 0.8 : 0.45); }
    // the boiler hisses as he winds up a stomp or a charge: a readable tell on top of the ground ring
    if (e.tele && B.tele !== e.tele) { B.tele = e.tele; steam(e.tele.skill.kind === 'dash' ? 1.2 : 0.9); }
    // ...and after a stomp or blast the boiler has to blow off: a short opening where he is slow and takes +30%
    else if (!e.tele && B.tele) {
      if (B.tele.skill.kind === 'aoe') { addStatus(c, { id: 'venting', t: 1.8, tMax: 1.8, dmgTakenMult: 1.3, moveMult: 0.35 }); steam(1.4); fx.ring(e.pos, 1.6, 0xf0e6dc, 0.5); }
      B.tele = null;
    }
    if (!B.lowHp && c.hp < c.stats.hp * 0.2) { B.lowHp = true; steam(1.6); }
    if (B.phase === 0 && c.hp < c.stats.hp * B.phases[0]) phase2(e);
    if (c.statuses.some((x) => x.id === 'venting' && x.t > 0)) { e.bot.setMove(0, 0); return true; }
    return false;
  }

  function phase2(e) {
    B.phase = 1;
    const c = e.c;
    const ps = B.sc.phaseSting || ['enrages', 'Watch out'];
    ui.sting(`${c.name} ${ps[0]}`, ps[1], 'alert', 2600);
    if (B.sc.lines?.phase) line(B.sc.lines.phase);
    audio.sfx('alarm', { vol: 0.5 });
    fx.ring(e.pos, 6, 0xff5020, 0.7);
    e.bot.steam?.(2);
    fx.flash(v.set(e.pos.x, e.pos.y + 2, e.pos.z), 2, 0xff7a20, 0.25);
    ctx.rig.shake = Math.max(ctx.rig.shake, 0.3);
    addStatus(c, { id: 'boil', t: 999, moveMult: 1.2, dmgMult: 1.15, atkSpeedMult: 1.2 });
    c.stats.moveSpeed *= 1.2;
    c.skills.e_dash = SKILLS.e_dash;
    const adds = B.def.adds || B.sc.adds || { defId: 'knuckle', count: 3 };
    const R = ctx.runner.active;
    if (R && !B.addsDone) {
      B.addsDone = true;
      const p = { i: R.packs.length, site: R.step?.site, units: Array.from({ length: adds.count || 3 }, () => ({ defId: adds.defId, rank: 'grunt', level: R.mission.level })), atStep: R.idx, spawned: false };
      R.packs.push(p);
      ctx.runner.spawnPack(p, true, { near: e.pos, dist: 14 });
    }
    ui.boss.set({ phase: 1, enraged: true });
  }

  // ---- multi-phase bosses (Seraph, Dray) -------------------------------------------------------------------------
  function multiBrain(e, dt) {
    const c = e.c, sc = B.sc;
    if (B.phase < sc.phases.length && c.hp < c.stats.hp * B.phases[B.phase]) phaseUp(e, B.phase + 1);
    if (sc.strikes && B.phase === 0) harmonyStrike(dt);   // one threat at a time: the Helm's strikes stop when the drones come out
    if (B.drones.length) {
      B.drones = B.drones.filter((d) => d.state !== 'dead');
      const shielded = B.drones.length >= 4;
      const st = c.statuses.find((x) => x.id === 'voices');
      if (shielded && !st) addStatus(c, { id: 'voices', t: 999, dmgTakenMult: 0.3 });
      else if (!shielded && st) { st.t = 0; c.statuses = c.statuses.filter((x) => x !== st); ui.toast('His voices are down', 'good', { sub: 'Dray is exposed' }); fx.ring(e.pos, 5, 0xffd36b, 0.6); }
      if (shielded && (B.shT = (B.shT || 0) - dt) <= 0) { B.shT = 0.9; fx.ring(e.pos, 2.4, 0xffd36b, 0.35); }
    }
    if (B.hesitate > 0) { B.hesitate -= dt; e.bot.setMove(0, 0); return true; }
    return false;
  }

  function phaseUp(e, n) {
    const c = e.c, sc = B.sc, P = sc.phases[n - 1];
    B.phase = n;
    ctx.log?.(`boss phase ${n} at ${B.t.toFixed(0)} s`);
    ui.sting(`${c.name} ${P.sting[0]}`, P.sting[1], 'alert', 2800);
    if (P.line) ctx.bossLine ? ctx.bossLine(P.line, P.lineBy || sc.speaker) : audio.vo(P.line);
    if (sc.robotPhase) e.bot.setPhase?.(sc.robotPhase[n]);
    if (sc.helm) ctx.world.ctx?.helm?.setMode(sc.helm[n]);
    audio.sfx('alarm', { vol: 0.45 });
    fx.ring(e.pos, 6, 0xffd36b, 0.7);
    fx.flash(v.set(e.pos.x, e.pos.y + 2, e.pos.z), 2, 0xfff0c0, 0.25);
    ctx.rig.shake = Math.max(ctx.rig.shake, 0.3);
    const R = ctx.runner.active;
    if (P.adds && R) {
      const p = { i: R.packs.length, site: R.step?.site, units: Array.from({ length: P.adds.count }, () => ({ defId: P.adds.defId, rank: 'grunt', level: R.mission.level })), atStep: R.idx, spawned: false };
      R.packs.push(p);
      ctx.runner.spawnPack(p, true, { near: e.pos, dist: 12 });
    }
    if (P.slow) addStatus(c, { id: 'cracked', t: 999, atkSpeedMult: 0.8, moveMult: 0.85 });
    if (P.drones) spawnDrones(e, P.drones);
    if (P.unlink) {
      for (const d of B.drones) if (d.state !== 'dead') { d.c.hp = 0; d.c.alive = false; enemies.die(d); }
      B.drones = [];
      c.statuses = c.statuses.filter((x) => x.id !== 'voices');
      addStatus(c, { id: 'unlinked', t: 999, dmgTakenMult: 1.2, moveMult: 0.9 });
    }
    ui.boss.set({ phase: n, enraged: n >= 2 });
  }

  // Dray's seven voices undock from his halo sockets
  function spawnDrones(e, n) {
    const R = ctx.runner.active;
    for (let i = 0; i < n; i++) {
      const s = e.bot.sockets?.['halo' + i];
      const a = (i / n) * Math.PI * 2;
      if (s) s.getWorldPosition(v); else v.set(e.pos.x + Math.sin(a) * 3, 0, e.pos.z + Math.cos(a) * 3);
      let x = v.x + Math.sin(a) * 2, z = v.z + Math.cos(a) * 2;
      if (ctx.world.blocked(x, z, 0.5) && ctx.nav) { const q = ctx.nav.nearest(x, z); if (q) { x = q.x; z = q.z; } }
      const d = enemies.spawn({ defId: 'halo_drone', rank: 'grunt', level: R?.mission.level || e.c.level }, x, z, { hostile: true });
      d.c.stats.hp *= 0.12; d.c.hp = d.c.stats.hp; d.c.stats.shield *= 0.15; d.c.shield = d.c.stats.shield;
      d.mission = R?.mission.id; d.hunter = true;
      addStatus(d.c, { id: 'voice', t: 999, dmgMult: 0.5 });
      d.keepRange = 3.5;   // they guard him close instead of kiting: a Bulwark has to be able to reach them
      fx.beam(d.pos, 0xffd36b, 0.4, 5, 0.8);
      B.drones.push(d);
    }
  }

  // Harmony turns the Helm on you: a gold ring under your feet, then the strike 1.4 s later (step out of it)
  function harmonyStrike(dt) {
    if (B.pending) {
      B.pending.t -= dt;
      if (B.pending.t <= 0) {
        const p = B.pending.p;
        fx.beam(p, 0xffd36b, 1.2, 14, 0.6); fx.ring(p, 2.8, 0xfff0c0, 0.4); audio.sfx('explosion', { x: p.x, z: p.z, vol: 0.7 });
        if (Math.hypot(ctx.player.pos.x - p.x, ctx.player.pos.z - p.z) < 2.8 && !ctx.sim.playerCombatant().invulnerable) ctx.damagePlayerPct(0.12, 'the Helm');
        B.pending = null;
      } else if ((B.pending.ring -= dt) <= 0) { B.pending.ring = 0.35; fx.ring(B.pending.p, 2.8, 0xff5030, 0.34); }
      return;
    }
    if ((B.strikeT -= dt) > 0) return;
    B.strikeT = 7;
    const p = new THREE.Vector3(ctx.player.pos.x, ctx.world.groundAt(ctx.player.pos.x, ctx.player.pos.z) + 0.05, ctx.player.pos.z);
    B.pending = { p, t: 1.4, ring: 0 };
    audio.sfx('scan', { x: p.x, z: p.z, vol: 0.6 });
  }

  // Seraph (STORY R6) never finishes you: once per phase a killing blow becomes a hesitation
  function spares(e) {
    if (!B || B.e !== e || !B.sc.spares || B.spared[B.phase]) return false;
    B.spared[B.phase] = true;
    B.hesitate = 2.6;
    e.pending = null; e.tele = null;
    ui.sting('She hesitates', 'Seraph pulls the blow. She is humming', 'story', 2400);
    if (ctx.bossLine) ctx.bossLine('a2_s04_seraph_02', 'seraph');
    return true;
  }

  function update(dt) {
    if (!B) return;
    const e = B.e, c = e.c;
    if (e.state === 'dead') {
      if (!B.downT) {
        B.downT = 0.001;
        ctx.log?.(`boss ${c.name} down after ${B.t.toFixed(0)} s`);
        ui.boss.set({ hp: 0 });
        if (B.sc.lines?.down) line(B.sc.lines.down);
        ctx.hitstop(0.25);
        ctx.rig.shake = Math.max(ctx.rig.shake, 0.35);
        fx.flash(v.set(e.pos.x, e.pos.y + 1.5, e.pos.z), 2.4, 0xfff0c0, 0.3);
        fx.ring(e.pos, 7, 0xffc860, 0.8);
        setTimeout(() => { if (e.bot) { e.bot.play('sit', { loop: true }); } }, 900);
        if (B.sc.id === 'seraph' || B.def.defId === 'seraph') e.bot.setPhase?.(4);
        for (const d of B.drones) if (d.state !== 'dead') { d.c.hp = 0; d.c.alive = false; enemies.die(d); }
        B.pending = null;
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

  return { spawn, spawnVoice, update, end, spares, get active() { return !!B && B.e.state !== 'dead'; }, get entity() { return B?.e || null; } };
}
