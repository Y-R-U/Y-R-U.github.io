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
    const e = enemies.spawn({ defId: npc.defId || 'escortee', rank: npc.rank || 'veteran', level: R.mission.level, name: npc.name }, s.x + 1.2, s.z + 1.2, { yaw: 0 });
    e.mission = R.mission.id; e.escort = true; e.npc = npc;
    // a cuffed hostage isn't a target until you free them (the escort step adds the decoy)
    if (npc.id === 'hostage') { e.cuffed = true; e.bot.play('sit', { loop: true }); }
    else addNpcDecoy(e);
    R.npcs[npc.id] = e;
    return e;
  }

  function addNpcDecoy(e) {
    if (e.decoy) return;
    e.decoy = enemies.addDecoy({ x: e.pos.x, z: e.pos.z, kind: 'npc', ref: e, radius: 7 });
    e.decoy.pos = e.pos;
  }
  function enterEscort(R, s) {
    const npc = (R.mission.npcs || []).concat(R.mission.twist?.npc || []).find((n) => n.id === s.npc) || R.mission.npcs?.[0];
    const e = npc && spawnNpc(R, npc);
    if (e?.cuffed) { e.cuffed = false; e.bot.play('idle'); fx.ring(e.pos, 1.6, 0x7dffb0, 0.4); }
    if (e) addNpcDecoy(e);
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
    const hp = Math.round(60 * Math.pow(1.09, R.mission.level - 1) * (s.objHpMult || 10) / 2);   // P3g: /4 → /2, two Wardens broke it in ~10 s
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
      // waves walk in from the edges: static emplacements (sentry turrets) in a rolled pack become Wardens
      if (w) { if (src) w.site = src.id; w.units = w.units.map((u) => (u.defId === 'sentry_turret' ? { ...u, defId: 'warden' } : u)); run.spawnPack(w, true, { near: D.at, dist: 22 }); }
      else if (D.synth) run.spawnPack(run.synthPack(R, D.spawned, src), true, { near: D.at, dist: 22 });
      D.spawned++;
      D.next = t + D.dur / D.n;
      audio.sfx('alarm', { vol: 0.35 });
      ui.toast(`Wave ${D.spawned} / ${D.n}`, 'warn', { ms: 1400 });
      if (D.spawned === 1) run.storyEvent('wave1');
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

  // walk an actor toward (x,z) along the nav grid; returns true while it is still moving
  function walkNpc(e, to, speed, dt, key = 'route') {
    if ((e[key + 'T'] = (e[key + 'T'] || 0) - dt) <= 0 || !e[key] || e[key + 'To'] !== to) { e[key + 'T'] = 0.8; e[key + 'To'] = to; e[key] = ctx.nav.route(e.pos, to, 20000) || [to]; }
    const r = e[key];
    if (r.length > 1 && Math.hypot(r[0].x - e.pos.x, r[0].z - e.pos.z) < 0.8) r.shift();
    const t = r[0] || to;
    const dx = t.x - e.pos.x, dz = t.z - e.pos.z, l = Math.hypot(dx, dz);
    if (Math.hypot(to.x - e.pos.x, to.z - e.pos.z) < 0.9) { e.bot.setMove(0, 0); return false; }
    if (l > 0.05) {
      const bx = e.pos.x, bz = e.pos.z;
      ctx.world.collision.move(e.pos, dx / l * speed * dt, dz / l * speed * dt, e.radius);
      // wedged on geometry for 3 s: hop to the next route point (a stuck escortee/racer/target must never soft-lock a job)
      e.wedgeT = Math.hypot(e.pos.x - bx, e.pos.z - bz) < speed * dt * 0.2 ? (e.wedgeT || 0) + dt : 0;
      if (e.wedgeT > 3) { e.wedgeT = 0; const q = r.length > 1 ? r[1] : to; const n = ctx.nav.nearest(q.x, q.z) || q; e.pos.set(n.x, ctx.world.groundAt(n.x, n.z), n.z); r.shift(); }
      e.yaw = Math.atan2(dx, dz);
      e.bot.setMove(Math.min(1, speed / (e.bot.runSpeed || 4)), speed);
    }
    return true;
  }
  const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

  // --- tail: follow the target through the district without being made or losing it -----------------------------
  function enterTail(R, s) {
    const e = R.target;
    if (!e) { run.complete(); return; }
    e.escort = true; e.tailing = true; e.state = 'idle'; e.fleeT = 0;
    // a story checkpoint restarts the tail: the target walks back into view first
    if (R.tailReset) { e.pos.set(R.tailReset.x, ctx.world.groundAt(R.tailReset.x, R.tailReset.z), R.tailReset.z); R.tailReset = null; }
    const end = run.site(s.endSite) || e.home;
    // a stroll: two stops on the way, then the meeting spot
    const all = ctx.world.sites.filter((q) => q.tag !== 'spawn_edge' && Math.hypot(q.x - e.pos.x, q.z - e.pos.z) > 15);
    const mid = all.sort(() => Math.random() - 0.5).slice(0, 2).map((q) => run.site(q.id)).filter(Boolean);
    const path = [...mid, end];
    let len = 0, prev = e.pos;
    for (const p of path) { len += Math.hypot(p.x - prev.x, p.z - prev.z); prev = p; }
    const stops = path.length - 1;
    const walkT = Math.max(30, (s.duration || 120) - stops * 6);
    R.ss.tail = { path, wp: 0, speed: Math.min(3.2, Math.max(1.8, len * 1.25 / walkT)), pause: 0, look: 0, sus: 0, far: 0, near: 0, grace: 4 };
    ui.toast(`Tail ${e.c.name}`, 'info', { sub: `Stay ${s.minD || 5}–${s.maxD || 22} m back. Don't let them see you.` });
  }
  function updateTail(R, s, dt) {
    const e = R.target, T = R.ss.tail;
    if (!e || e.state === 'dead') { ui.band.hide(); run.fail('tail', 'The target is down: job blown'); return; }
    const d = e.pos.distanceTo(player.pos), minD = s.minD || 5, maxD = s.maxD || 22;
    const pc = sim.playerCombatant();
    // stops: the target browses, then glances back over its shoulder
    if (T.pause > 0) {
      T.pause -= dt; e.bot.setMove(0, 0);
      if (T.look > 0) { T.look -= dt; e.yaw += angDiff(Math.atan2(player.pos.x - e.pos.x, player.pos.z - e.pos.z), e.yaw) * Math.min(1, dt * 3); }
    } else if (!walkNpc(e, T.path[T.wp], T.speed, dt, 'tailRoute')) {
      T.wp++;
      if (T.wp >= T.path.length) { ui.band.hide(); ui.detect.clear(e.id); run.complete(); return; }
      T.pause = 3 + Math.random() * 3; T.look = Math.random() < 0.7 ? 2 : 0;
    } else if (Math.random() < dt * 0.04) { T.pause = 1.6; T.look = 1.6; }
    // suspicion: close behind, or anywhere in view while it looks back
    const inView = Math.abs(angDiff(Math.atan2(player.pos.x - e.pos.x, player.pos.z - e.pos.z), e.yaw)) < 0.9 && d < 11 && !pc.hidden && ctx.losClear(e.pos, player.pos);
    const rate = (T.grace -= dt) > 0 ? 0 : (d < minD ? 0.6 : 0) + (inView && T.look > 0 ? 0.7 * (1 - d / 11) + 0.1 : 0);
    T.sus = rate > 0 ? Math.min(1, T.sus + rate * dt) : Math.max(0, T.sus - dt * 0.15);
    e.bot.setAlert(T.sus > 0.1 ? 1 : 0);
    tmp.set(e.pos.x, e.pos.y + 2.3, e.pos.z);
    const sp = ctx.project(tmp);
    if (T.sus > 0.02) ui.detect.set(e.id, sp.x, sp.y, T.sus, { onScreen: sp.on }); else ui.detect.clear(e.id);
    T.far = d > maxD && T.grace <= 0 ? T.far + dt : 0;
    const lose = s.loseTime || 8;
    ui.band.set({ value: d, min: 0, max: maxD + 10, lo: minD, hi: maxD, label: `Tailing ${e.c.name}`, warn: T.far > 0 ? `Losing them: ${Math.ceil(lose - T.far)}s` : T.sus > 0.5 ? 'They sense something' : '' });
    if (T.sus >= 1) { if (R.mission.story) R.tailReset = T.path[Math.min(T.wp, T.path.length - 1)]; ui.band.hide(); ui.detect.clear(e.id); audio.sfx('alarm', { vol: 0.5 }); e.state = 'flee'; e.fleeT = 5; e.escort = false; run.fail('spotted', 'You were made'); return; }
    if (T.far >= lose) { ui.band.hide(); ui.detect.clear(e.id); run.fail('lost', 'You lost the target'); }
  }

  // --- race: checkpoints against two rival riders ------------------------------------------------------------------
  function enterRace(R, s) {
    const cps = (s.checkpoints || []).map((id) => run.site(id)).filter(Boolean);
    const start = cps[0] || player.pos;
    let len = 0;
    for (let i = 1; i < cps.length; i++) len += Math.hypot(cps[i].x - cps[i - 1].x, cps[i].z - cps[i - 1].z);
    const rivals = [];
    for (let k = 0; k < (s.rivals || 0); k++) {
      const a = k * 2.2 + 1;
      const e = enemies.spawn({ defId: 'rival_rider', level: R.mission.level, name: ['Vex', 'Nines', 'Glint', 'Two-Step'][k % 4] }, start.x + Math.sin(a) * 2.5, start.z + Math.cos(a) * 2.5, { yaw: 0 });
      e.mission = R.mission.id; e.nonCombat = true; e.escort = true; e.racer = true;
      // rivals run the course in ~par × 0.8–1.05 (routes are ~25% longer than the straight legs)
      e.raceSpeed = len * 1.25 / ((s.par || 60) * (0.8 + 0.12 * k + Math.random() * 0.1));
      e.cp = 1; e.done = false;
      rivals.push(e);
    }
    R.ss.race = { cps, i: 1, rivals, go: 3, finished: [], t: 0 };
    ui.sting(rivals.length ? 'Street Run' : s.label || 'Run', `${cps.length} checkpoints${rivals.length ? ` · ${rivals.length} rivals` : ''}`, 'alert', 2000);
    raceBeacons(R);
  }
  function raceBeacons(R) {
    const Q = R.ss.race;
    for (const b of R.beacons) b.remove();
    R.beacons = [];
    const c = Q.cps[Q.i];
    if (c) R.beacons.push(props.beacon(c.x, c.z, [0.5, 0.9, 1.0]));
    const n = Q.cps[Q.i + 1];
    if (n) R.beacons.push(props.beacon(n.x, n.z, [0.35, 0.5, 0.7]));
  }
  function updateRace(R, s, dt) {
    const Q = R.ss.race;
    if (Q.go > 0) {
      const before = Math.ceil(Q.go);
      Q.go -= dt;
      if (Math.ceil(Q.go) !== before && Q.go > 0) { ui.toast(String(Math.ceil(Q.go)), 'warn', { ms: 700 }); audio.sfx('ui_click'); }
      if (Q.go <= 0) { ui.toast('GO!', 'good', { ms: 900 }); audio.sfx('contract_accept'); }
      for (const e of Q.rivals) e.bot.setMove(0, 0);
      return;
    }
    Q.t += dt;
    for (const e of Q.rivals) {
      if (e.done || e.state === 'dead') continue;
      const c = Q.cps[e.cp];
      if (!walkNpc(e, c, e.raceSpeed, dt, 'raceRoute')) { e.cp++; if (e.cp >= Q.cps.length) { e.done = true; Q.finished.push(e); e.bot.setMove(0, 0); } }
    }
    const c = Q.cps[Q.i];
    if (c && d2(c) < 4.5) {
      Q.i++;
      audio.sfx('ui_confirm', { vol: 0.7 });
      fx.ring(tmp.set(c.x, ctx.world.groundAt(c.x, c.z), c.z), 3, 0x9fe8ff, 0.4);
      if (Q.i >= Q.cps.length) {
        const place = Q.finished.length + 1;
        R.raceFirst = place === 1;
        ui.meter.hide();
        if (!Q.rivals.length) ui.sting('Course clear', `${Math.round(Q.t)}s`, 'unlock', 2000);
        else ui.sting(place === 1 ? '1st place!' : `${place}${place === 2 ? 'nd' : 'rd'} place`, place === 1 ? '+50% prize money' : 'Finished', place === 1 ? 'unlock' : 'info', 2200);
        for (const e of Q.rivals) e.nonCombat = true;
        run.complete();
        return;
      }
      raceBeacons(R);
    }
    const ahead = Q.rivals.filter((e) => e.done || e.cp > Q.i || (e.cp === Q.i && c && Math.hypot(c.x - e.pos.x, c.z - e.pos.z) < d2(c))).length;
    ui.meter.set({ label: `Checkpoint ${Q.i} / ${Q.cps.length - 1}`, value: (Q.i - 1) / (Q.cps.length - 1), kind: ahead ? 'danger' : 'escort', text: Q.rivals.length ? `${ahead + 1}${['st', 'nd', 'rd'][ahead] || 'th'}` : `${Math.round(Q.t)}s`, sub: `${Math.round(Q.t)}s · par ${s.par || '?'}s` });
  }

  // --- repo: the deadbeat frame runs and blinks; knock it under 20% and haul it in ------------------------------------
  function enterCapture(R, s) { if (R.target) onTarget(R, R.target); }
  // repo targets can't be wrecked (you're bringing the frame back) from the moment they spawn
  function onTarget(R, e) {
    const s = R.mission.steps.find((x) => x.type === 'capture');
    if (!s || e !== R.target) return;
    e.noKill = true;
    e.brain = (x, dt) => deadbeatBrain(R, s, x, dt);
  }
  function deadbeatBrain(R, s, e, dt) {
    const c = e.c;
    if (c.hp < c.stats.hp * (s.below || 0.2)) { e.bot.setMove(0, 0); if (!e.slumped) { e.slumped = true; e.bot.play('sit', { loop: true }); e.bot.setAlert(0); ui.toast(`${c.name} gives up`, 'good', { sub: 'Capture it' }); } return true; }
    const d = e.pos.distanceTo(player.pos);
    if (d > 9 && c.sinceHit > 3) return false;
    // blink away when cornered (DESIGN: repo targets flee and blink)
    if ((e.blinkT = (e.blinkT ?? 2) - dt) <= 0 && d < 4) {
      e.blinkT = 5 + Math.random() * 2;
      const a = Math.atan2(e.pos.x - player.pos.x, e.pos.z - player.pos.z) + (Math.random() - 0.5);
      const q = ctx.nav.nearest(e.pos.x + Math.sin(a) * 8, e.pos.z + Math.cos(a) * 8);
      if (q) { fx.beam(e.pos, 0xffa040, 0.4, 4, 1); e.pos.set(q.x, ctx.world.groundAt(q.x, q.z), q.z); fx.beam(e.pos, 0xffa040, 0.4, 4, 1); audio.sfx('dodge', { x: q.x, z: q.z }); }
      return true;
    }
    if (d < 9) {
      const ax = e.pos.x - player.pos.x, az = e.pos.z - player.pos.z, l = Math.hypot(ax, az) || 1;
      const to = ctx.nav.nearest(e.pos.x + ax / l * 5, e.pos.z + az / l * 5) || { x: e.pos.x + ax / l * 5, z: e.pos.z + az / l * 5 };
      walkNpc(e, to, (c.stats.moveSpeed || 4.6) * 0.92, dt, 'fleeRoute');
      return true;
    }
    return false;
  }
  function capturableRepo(R, s) {
    const t = R.target;
    return !!(t && t.slumped && t.pos.distanceTo(player.pos) < 3.2);
  }

  // --- assassinate: the target bolts for its car at fleeAt HP -----------------------------------------------------------
  function updateKillFlee(R, s, dt) {
    const e = R.target;
    if (!e || e.state === 'dead' || !s.fleeSite) return;
    const car = run.site(s.fleeSite);
    if (!car) return;
    if (!R.ss.fleeing && e.c.hp < e.c.stats.hp * s.fleeAt) {
      R.ss.fleeing = true; e.escort = true;
      R.beacons.push(props.beacon(car.x, car.z, [1.0, 0.35, 0.25]));
      ui.sting(`${e.c.name} is running`, 'Stop them before they reach the car', 'alert', 2200);
      audio.bark('b_mara_twist_', { cooldown: 5 });
    }
    if (R.ss.fleeing) {
      e.brain = () => true;
      if (!walkNpc(e, car, (e.c.stats.moveSpeed || 4) * 0.85, dt, 'carRoute')) { enemies.clear((x) => x === e); fx.beam(car, 0xff6040, 0.6, 6, 1.4); run.fail('escaped', 'The target got away'); }
    }
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

  // --- snap: photograph holo boards at several sites in order (A4-M3's Landfall countdown) -----------------------
  function boardMesh(text) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 160;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 160); gr.addColorStop(0, 'rgba(20,60,110,0.85)'); gr.addColorStop(1, 'rgba(6,18,40,0.85)');
    g.fillStyle = gr; g.fillRect(0, 0, 512, 160);
    g.strokeStyle = '#9fe8ff'; g.lineWidth = 6; g.strokeRect(6, 6, 500, 148);
    g.fillStyle = '#e8fbff'; g.font = '700 58px Rajdhani, system-ui, sans-serif'; g.textAlign = 'center';
    const [a, ...rest] = text.split(' TO ');
    g.fillText(a, 256, 78); g.font = '600 34px Rajdhani, system-ui, sans-serif'; g.fillStyle = '#ffd986'; g.fillText(rest.length ? 'TO ' + rest.join(' TO ') : '', 256, 124);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.3), new THREE.MeshBasicMaterial({ map: tex, transparent: true, color: new THREE.Color(1.6, 1.6, 1.6), side: THREE.DoubleSide, depthWrite: false, fog: false }));
    return m;
  }
  function enterSnap(R, s) {
    R.ss.snapI = 0; R.ss.hold = 0;
    R.snapBoards = (s.sites || []).map((id) => {
      const st = run.site(id);
      if (!st) return null;
      const m = boardMesh(s.text || 'HARMONY');
      m.position.set(st.x, ctx.world.groundAt(st.x, st.z) + 2.6, st.z);
      ctx.world.scene.add(m);
      return { m, st, done: false };
    }).filter(Boolean);
    snapBeacon(R);
  }
  function snapBeacon(R) {
    for (const b of R.beacons) b.remove();
    R.beacons = [];
    const b = R.snapBoards[R.ss.snapI];
    if (b) R.beacons.push(props.beacon(b.st.x, b.st.z, [0.5, 0.9, 1.0]));
  }
  function clearSnap(R) { for (const b of R.snapBoards || []) { ctx.world.scene.remove(b.m); b.m.geometry.dispose(); b.m.material.map.dispose(); b.m.material.dispose(); } R.snapBoards = null; }
  function updateSnap(R, s, dt) {
    const B = R.snapBoards || [];
    for (const b of B) b.m.rotation.y = Math.atan2(ctx.world.camera.position.x - b.m.position.x, ctx.world.camera.position.z - b.m.position.z);
    const b = B[R.ss.snapI];
    if (!b) { ui.lens.hide(); clearSnap(R); run.complete(); return; }
    const d = Math.hypot(b.st.x - player.pos.x, b.st.z - player.pos.z);
    if (d > 22) { if (ui.lens.open) ui.lens.hide(); return; }
    if (!ui.lens.open) ui.lens.show({ label: 'Photograph the countdown', count: `${R.ss.snapI} / ${B.length}` });
    // photo framing: the camera turns to the board and tilts up so it sits in frame (a drag still overrides)
    const rig = ctx.rig;
    if (rig && !rig.dragging && d < 16) {
      const want = Math.atan2(-(b.st.x - player.pos.x), -(b.st.z - player.pos.z));
      rig.yawTarget = rig.yaw + Math.atan2(Math.sin(want - rig.yaw), Math.cos(want - rig.yaw));
      rig.pitchTarget = Math.max(rig.pitchMin - rig.basePitch(), 22 - rig.basePitch());
      R.ss.framed = true;
    }
    const sp = ctx.project(b.m.position);
    // the board may sit above the frame at the default pitch: range and a clear line are what count
    const ok = d > 3 && d < 14 && ctx.losClear(player.pos, b.st);
    ui.lens.target(sp.on ? sp.x : null, sp.y, 140, { label: d >= 14 ? 'Get closer' : d <= 3 ? 'Too close!' : 'Countdown board', dist: Math.round(d), locked: ok });
    if (ok) R.ss.hold += dt; else R.ss.hold = Math.max(0, R.ss.hold - dt * 0.5);
    if (R.ss.capture) { R.ss.capture = false; if (ok) R.ss.hold += 1; }
    ui.lens.progress(Math.min(1, R.ss.hold / 1.8));
    if (R.ss.hold >= 1.8) {
      R.ss.hold = 0; R.ss.snapI++;
      ui.lens.flash('Captured'); ui.lens.count(`${R.ss.snapI} / ${B.length}`);
      audio.sfx('scan'); fx.flash(b.m.position, 0.6, 0xffffff, 0.15);
      b.m.material.color.setRGB(0.7, 1.4, 0.8);
      run.storyEvent(`shot:${R.ss.snapI}`);
      if (R.ss.snapI >= B.length) { setTimeout(() => ui.lens.hide(), 700); clearSnap(R); ctx.rig?.reset(0.6); run.complete(); }
      else snapBeacon(R);
    }
  }

  return {
    enter(R, s) {
      if (s.type === 'escort') enterEscort(R, s);
      else if (s.type === 'defend') enterDefend(R, s);
      else if (s.type === 'hack') enterHack(R, s);
      else if (s.type === 'tail') enterTail(R, s);
      else if (s.type === 'race') enterRace(R, s);
      else if (s.type === 'capture') enterCapture(R, s);
      else if (s.type === 'snap') enterSnap(R, s);
    },
    update(R, s, dt) {
      if (s.type === 'escort') { updateEscort(R, s, dt); return true; }
      if (s.type === 'defend') { updateDefend(R, s, dt); return true; }
      if (s.type === 'hack') { updateHack(R, s, dt); return true; }
      if (s.type === 'tail') { updateTail(R, s, dt); return true; }
      if (s.type === 'race') { updateRace(R, s, dt); return true; }
      if (s.type === 'snap') { updateSnap(R, s, dt); return true; }
      if (s.type === 'capture') { if (R.target?.state === 'dead') { R.target.state = 'idle'; } return true; }
      if (s.type === 'kill' && s.fleeAt) updateKillFlee(R, s, dt);
      return false;
    },
    label(R, s) {
      if (s.type === 'hack') { const st = run.site((s.sites || [s.site])[R.ss.hackI || 0]); return st && d2(st) < 3.8 && !R.ss.hacking ? (s.verb || (s.plant ? 'Plant the bug' : 'Hack')) : null; }
      if (s.type === 'kill' && capturable(R, s)) return 'Capture (+30%)';
      if (s.type === 'capture' && capturableRepo(R, s)) return 'Capture the frame';
      return null;
    },
    interact(R, s) {
      if (s.type === 'hack') { R.ss.hacking = true; audio.sfx('scan', { vol: 0.5 }); return true; }
      if (s.type === 'kill' && capturable(R, s)) { capture(R); return true; }
      if (s.type === 'capture' && capturableRepo(R, s)) { const t = R.target; t.brain = null; t.nonCombat = true; fx.ring(t.pos, 2, 0x7dffb0, 0.5); ui.toast(`${t.c.name} repossessed`, 'good'); audio.sfx('ui_confirm'); run.complete({ captured: true }); return true; }
      return false;
    },
    spawnNpc, onTarget, cleanup: clearSnap,
    snapTarget(R) { const b = R.snapBoards?.[R.ss.snapI]; return b ? { x: b.st.x, z: b.st.z, label: 'Countdown board' } : null; },
  };
}
