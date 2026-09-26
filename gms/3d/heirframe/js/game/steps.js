import * as THREE from 'three';

// Step handlers added in P2a: hack (terminals in order with interrupt waves), escort (walking NPC), defend
// (object + timed waves), bounty pings / capture, sabotage machines. The runner owns R (mission runtime) and
// calls enter/update/label/interact here for these types.
export function createSteps(ctx, run) {
  const { sim, enemies, props, ui, audio, fx, player } = ctx;
  const tmp = new THREE.Vector3();
  const d2 = (s) => Math.hypot(s.x - player.pos.x, s.z - player.pos.z);

  // --- escort NPC ------------------------------------------------------------------------------------------
  function spawnNpc(R, npc) {
    if (R.npcs[npc.id]) return R.npcs[npc.id];
    const s = run.site(npc.site) || { x: player.pos.x + 3, z: player.pos.z };
    const e = enemies.spawn({ defId: npc.defId || 'escortee', level: R.mission.level, name: npc.name }, s.x + 1.2, s.z + 1.2, { yaw: 0 });
    e.mission = R.mission.id; e.escort = true; e.npc = npc;
    e.decoy = enemies.addDecoy({ x: e.pos.x, z: e.pos.z, kind: 'npc', ref: e, radius: 7 });
    e.decoy.pos = e.pos;
    R.npcs[npc.id] = e;
    return e;
  }

  function enterEscort(R, s) {
    const npc = (R.mission.npcs || []).concat(R.mission.twist?.npc || []).find((n) => n.id === s.npc) || R.mission.npcs?.[0];
    const e = npc && spawnNpc(R, npc);
    R.ss.npc = e; R.ss.wp = 0; R.ss.path = (s.path || []).map((id) => run.site(id)).filter(Boolean);
    let total = 0, prev = e?.pos;
    for (const p of R.ss.path) { if (prev) total += Math.hypot(p.x - prev.x, p.z - prev.z); prev = p; }
    R.ss.total = Math.max(1, total);
    // ambushes along the route wait for the NPC to come near their site
    for (const p of R.packs) if (!p.spawned && p.atStep === R.idx && s.path?.includes(p.site)) p.nearNpc = true;
    audio.bark('b_mara_accept_', { cooldown: 20 });
  }

  function updateEscort(R, s, dt) {
    const e = R.ss.npc;
    if (!e) { run.complete(); return; }
    if (e.state === 'dead' || !e.c.alive) { run.fail('escort', `${e.c.name} went down`); return; }
    const wp = R.ss.path[R.ss.wp];
    const hostile = enemies.alive().some((o) => !o.ally && o.state !== 'idle' && o.pos.distanceTo(e.pos) < (e.npc?.stopRadius || 8));
    const lag = Math.hypot(player.pos.x - e.pos.x, player.pos.z - e.pos.z) > 13;
    let moving = false;
    if (wp && !hostile && !lag) {
      if ((R.ss.navT = (R.ss.navT || 0) - dt) <= 0 || !R.ss.route) { R.ss.navT = 0.8; R.ss.route = ctx.nav.route(e.pos, wp, 20000) || [wp]; }
      const r = R.ss.route;
      if (r.length > 1 && Math.hypot(r[0].x - e.pos.x, r[0].z - e.pos.z) < 0.8) r.shift();
      const t = r[0] || wp;
      const dx = t.x - e.pos.x, dz = t.z - e.pos.z, l = Math.hypot(dx, dz);
      if (l > 0.1) {
        const sp = e.npc?.speed || 3;
        ctx.world.collision.move(e.pos, dx / l * sp * dt, dz / l * sp * dt, e.radius);
        e.yaw = Math.atan2(dx, dz);
        e.bot.setMove(sp / (e.bot.runSpeed || 4), sp);
        moving = true;
      }
      if (Math.hypot(wp.x - e.pos.x, wp.z - e.pos.z) < 3) { R.ss.wp++; R.ss.route = null; }
    }
    if (!moving) { e.bot.setMove(0, 0); if (lag) e.yaw = Math.atan2(player.pos.x - e.pos.x, player.pos.z - e.pos.z); }
    for (const p of R.packs) if (p.nearNpc && !p.spawned) { const ps = run.site(p.site); if (ps && Math.hypot(ps.x - e.pos.x, ps.z - e.pos.z) < 26) run.spawnPack(p, true); }
    let left = 0, prev = e.pos;
    for (let k = R.ss.wp; k < R.ss.path.length; k++) { const p = R.ss.path[k]; left += Math.hypot(p.x - prev.x, p.z - prev.z); prev = p; }
    const hp = e.c.hp / e.c.stats.hp;
    ui.meter.set({ label: `Escort · ${e.c.name}`, value: 1 - left / R.ss.total, kind: hp < 0.35 ? 'danger' : 'escort', sub: hostile ? `Under attack · ${Math.round(hp * 100)}% HP` : lag ? 'Waiting for you' : `${Math.round(hp * 100)}% HP` });
    if (R.ss.wp >= R.ss.path.length) { ui.meter.hide(); run.complete(); }
  }

  // --- defend -----------------------------------------------------------------------------------------------
  function enterDefend(R, s) {
    const st = run.site(s.site) || { x: player.pos.x, z: player.pos.z };
    const hp = Math.round(60 * Math.pow(1.09, R.mission.level - 1) * (s.objHpMult || 10) / 4);
    const obj = s.object === 'kiosk' ? null : props.machine(st.x + 1.5, st.z + 1.5, hp, s.object || 'pylon', { hostile: false });
    const at = obj ? obj.pos : new THREE.Vector3(st.x, 0, st.z);
    const decoy = s.objHpMult === 0 ? null : enemies.addDecoy({ x: at.x, z: at.z, kind: 'npc', radius: 16, hp });
    if (decoy) decoy.pos = at;
    const ring = props.beacon(at.x, at.z, [0.4, 1.0, 0.7]);
    R.beacons.push(ring);
    const waves = R.packs.filter((p) => !p.spawned && p.atStep === R.idx);
    waves.forEach((p, k) => { p.wave = k; p.deferred = true; });
    R.ss.def = { obj, decoy, hp, at, waves, n: Math.max(1, s.waves || waves.length || 1), dur: s.duration || 90, next: 3, spawned: 0, protect: s.protect ? R.npcs[s.protect] : null };
    // generated defends have no packs for the waves themselves: roll a few from the mission faction
    if (!waves.length) R.ss.def.synth = true;
    ui.sting(s.label || `Hold the ${s.object || 'position'}`, `${R.ss.def.n} waves incoming`, 'alert', 2200);
  }

  function updateDefend(R, s, dt) {
    const D = R.ss.def;
    const t = R.ss.t;
    if (t >= D.next && D.spawned < D.n) {
      const sp = (s.spawns || []).map((id) => run.site(id)).filter(Boolean);
      const src = sp.length ? sp[D.spawned % sp.length] : null;
      const w = D.waves[D.spawned];
      if (w) { if (src) w.site = src.id; run.spawnPack(w, true, { near: D.at, dist: 22 }); }
      else if (D.synth) run.spawnPack(run.synthPack(R, D.spawned, src), true, { near: D.at, dist: 22 });
      D.spawned++;
      D.next = t + D.dur / D.n;
      audio.sfx('alarm', { vol: 0.35 });
      ui.toast(`Wave ${D.spawned} / ${D.n}`, 'warn', { ms: 1400 });
      if (s.object === 'kiosk' && D.spawned === 1) run.storyEvent('wave1');
    }
    const objHp = D.decoy ? Math.max(0, D.decoy.hp) / D.hp : 1;
    if (D.decoy?.dead || objHp <= 0) {
      if (D.obj) { fx.flash(tmp.set(D.at.x, D.at.y + 1, D.at.z), 1.6, 0xffa040, 0.3); audio.sfx('explosion'); ctx.world.scene.remove(D.obj.mesh); D.obj = null; }
      enemies.removeDecoy(D.decoy); D.decoy = null;
      if (!R.mission.story) { run.fail('defend', `The ${s.object || 'objective'} was destroyed`); return; }
    }
    if (D.protect && D.protect.state === 'dead') { run.fail('escort', `${D.protect.c.name} went down`); return; }
    const alive = run.missionHostiles().length;
    const timeUp = t >= D.dur;
    ui.meter.set({ label: s.label || `Hold the ${s.object || 'line'}`, value: Math.min(1, t / D.dur), kind: objHp < 0.35 ? 'danger' : 'defend',
      text: timeUp ? `${alive} left` : `${Math.max(0, Math.ceil(D.dur - t))}s`, sub: D.decoy ? `${s.object === 'kiosk' ? 'Kiosk' : 'Objective'} ${Math.round(objHp * 100)}%` : '' });
    if (timeUp && D.spawned >= D.n && !alive) {
      if (D.decoy) enemies.removeDecoy(D.decoy);
      if (D.obj) { ctx.world.scene.remove(D.obj.mesh); }
      ui.meter.hide();
      run.complete();
    }
  }

  // --- hack -----------------------------------------------------------------------------------------------
  function enterHack(R, s) {
    R.ss.hackI = 0; R.ss.prog = 0;
    const list = s.sites || [s.site];
    for (const p of R.packs) {
      if (p.spawned || p.atStep !== R.idx) continue;
      const k = list.indexOf(p.site);
      if (k > 0 || (k === 0 && list.length > 1)) { p.terminal = k; p.deferred = true; }
    }
    hackBeacon(R, s);
  }
  function hackBeacon(R, s) {
    for (const b of R.beacons) b.remove();
    R.beacons = [];
    const st = run.site((s.sites || [s.site])[R.ss.hackI]);
    if (st) R.beacons.push(props.beacon(st.x, st.z, [0.5, 0.9, 1.0]));
  }
  function hackTime(s) {
    const pc = sim.playerCombatant();
    const ghost = sim.activeFrame().archetype === 'ghost';
    return (ghost && s.ghostTime ? s.ghostTime : s.time || 4) / (pc.stats.hackSpeed || 1) * (ghost && !s.ghostTime ? 0.5 : 1);
  }
  function updateHack(R, s, dt) {
    const list = s.sites || [s.site];
    const st = run.site(list[R.ss.hackI]);
    if (!st) { run.complete(); return; }
    if (R.ss.hacking) {
      if (!R.ss.waveI || R.ss.waveI <= R.ss.hackI) {
        R.ss.waveI = R.ss.hackI + 1;
        for (const p of R.packs) if (p.deferred && !p.spawned && p.terminal === R.ss.hackI) { run.spawnPack(p, true, { near: st, dist: 16 }); ui.toast('Interrupt wave!', 'warn', { ms: 1400 }); }
      }
      const hurt = sim.playerCombatant().sinceHit < 0.6;
      if (!hurt) R.ss.prog += dt / hackTime(s);
      if (d2(st) > 4.2) R.ss.hacking = false;
      ui.meter.set({ label: s.verb || (s.plant ? 'Planting the bug' : 'Hacking'), value: R.ss.prog, sub: hurt ? 'Interrupted: taking damage' : list.length > 1 ? `Terminal ${R.ss.hackI + 1} / ${list.length}` : '' });
      if (Math.random() < dt * 8) fx.sparks(tmp.set(st.x, ctx.world.groundAt(st.x, st.z) + 1.1, st.z), 0x9fe8ff, 1, 2);
      if (R.ss.prog >= 1) {
        audio.sfx('scan', { vol: 0.8 });
        fx.ring(tmp.set(st.x, 0, st.z), 2.5, 0x9fe8ff, 0.5);
        R.ss.hackI++; R.ss.prog = 0; R.ss.hacking = false;
        if (R.ss.hackI >= list.length) { ui.meter.hide(); run.complete(); }
        else { hackBeacon(R, s); ui.toast(`Terminal ${R.ss.hackI} / ${list.length} done`, 'good', { ms: 1400 }); }
      }
    } else if (R.ss.prog > 0) ui.meter.set({ label: s.verb || 'Hacking', value: R.ss.prog, sub: 'Paused: stay at the terminal' });
    else ui.meter.hide();
  }

  // --- bounty target capture ------------------------------------------------------------------------------------
  function capturable(R, s) {
    const t = R.target;
    return !!(s.captureAllowed && t && t.state !== 'dead' && t.c.hp < t.c.stats.hp * 0.2 && t.pos.distanceTo(player.pos) < 3.2);
  }
  function capture(R) {
    const t = R.target;
    t.state = 'dead';
    t.bot.play('sit', { loop: true });
    t.bot.setAlert(0);
    fx.ring(t.pos, 2, 0x7dffb0, 0.5);
    ui.toast(`${t.c.name} captured`, 'good', { sub: '+30% bounty' });
    audio.sfx('ui_confirm');
    run.complete({ captured: true });
  }

  return {
    enter(R, s) {
      if (s.type === 'escort') enterEscort(R, s);
      else if (s.type === 'defend') enterDefend(R, s);
      else if (s.type === 'hack') enterHack(R, s);
    },
    update(R, s, dt) {
      if (s.type === 'escort') { updateEscort(R, s, dt); return true; }
      if (s.type === 'defend') { updateDefend(R, s, dt); return true; }
      if (s.type === 'hack') { updateHack(R, s, dt); return true; }
      return false;
    },
    label(R, s) {
      if (s.type === 'hack') { const st = run.site((s.sites || [s.site])[R.ss.hackI || 0]); return st && d2(st) < 3.8 && !R.ss.hacking ? (s.verb || (s.plant ? 'Plant the bug' : 'Hack')) : null; }
      if (s.type === 'kill' && capturable(R, s)) return 'Capture (+30%)';
      return null;
    },
    interact(R, s) {
      if (s.type === 'hack') { R.ss.hacking = true; audio.sfx('scan', { vol: 0.5 }); return true; }
      if (s.type === 'kill' && capturable(R, s)) { capture(R); return true; }
      return false;
    },
    spawnNpc,
  };
}
