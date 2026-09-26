import * as THREE from 'three';

// Mission step runner: maps sim contract steps onto world.sites, spawns packs/props, drives objectives,
// twists, stealth (surveil) and the story beats that hang off step events.
export function createRunner(ctx) {
  const { sim, world, enemies, props, ui, audio, fx, player } = ctx;
  const siteById = new Map();
  let R = null;   // runtime mission
  const tmp = new THREE.Vector3();

  // Story missions set in districts that aren't built yet use virtual ids like `plaza_1`: map them onto
  // real Aurum Plaza sites with the same tag so the contract stays playable.
  const byTag = {};
  for (const s of world.sites) (byTag[s.tag] ||= []).push(s);
  // Sites whose centre sits inside geometry (e.g. a waterfall basin) are snapped to the nearest walkable cell so
  // goto/deliver steps and markers stay reachable.
  const walkable = (s) => {
    if (!s || !ctx.nav?.blocked(s.x, s.z)) return s;
    const p = ctx.nav.nearest(s.x, s.z);
    return p ? { ...s, x: p.x, z: p.z } : s;
  };
  const site = (id) => {
    if (!id) return null;
    let s = siteById.get(id);
    if (s) return s;
    const m = /^(.*)_(\d+)$/.exec(id);
    const pool = (m && byTag[m[1]]) || byTag.plaza;
    s = walkable(world.sites.find((x) => x.id === id) || pool[((m ? +m[2] : 1) - 1) % pool.length]);
    siteById.set(id, s);
    return s;
  };
  const d2 = (s) => Math.hypot(s.x - player.pos.x, s.z - player.pos.z);
  const storyId = () => R?.mission.story?.id || null;

  function storyEvent(trigger, blocking = false) {
    const id = storyId();
    if (!id || !ctx.story.has(id, trigger)) return Promise.resolve(false);
    const p = ctx.story.run(id, trigger);
    return blocking ? p : (p.catch(() => {}), Promise.resolve(true));
  }

  function accept(contractId) {
    if (R) return { ok: false, reason: 'active' };
    const r = sim.acceptContract(contractId);
    if (!r.ok) { ui.toast(r.reason === 'active' ? 'Finish your current contract first' : 'Contract unavailable', 'warn'); return r; }
    const m = r.mission;
    R = { mission: m, idx: -1, step: null, ss: {}, packs: m.enemies.map((p, i) => ({ ...p, i, spawned: false, units: p.units })), beacons: [], carries: new Map(), carrying: null,
      target: null, scriptedCleared: false, elapsed: 0, done: false, stealth: !!m.stealthy, twistSpawned: false, extra: [] };
    for (const [i, s] of m.steps.entries()) if (s.type === 'pickup' && site(s.site)) { const st = site(s.site); R.carries.set(i, props.carry(st.x + 0.8, st.z + 0.8, s.item?.kind || 'parcel')); }
    ui.sting(m.title, m.story ? 'Story contract' : `${m.client?.name || ''} · ${m.districtName || ''}`, m.story ? 'story' : 'alert', 2400);
    audio.sfx('contract_accept');
    if (m.story) storyEvent('accept');
    else audio.bark('b_mara_accept_', { cooldown: 20 });
    enter(0);
    return { ok: true, mission: m };
  }

  function spawnPack(p, hostile) {
    if (p.spawned) return;
    p.spawned = true;
    let s = site(p.site) || site(R.step?.site) || { x: player.pos.x + 12, z: player.pos.z - 12, r: 3 };
    let cx = s.x, cz = s.z;
    if (hostile) {
      // ambushers come from their spawn site but no further than ~20 m away, so they actually arrive
      const dx = cx - player.pos.x, dz = cz - player.pos.z, d = Math.hypot(dx, dz);
      if (d > 20) { cx = player.pos.x + dx / d * 18; cz = player.pos.z + dz / d * 18; }
    }
    const n = p.units.length;
    p.ents = p.units.map((u, k) => {
      const a = (k / Math.max(1, n)) * Math.PI * 2 + Math.random() * 0.4, r = Math.min(3.5, (s.r || 3) * 0.6) + Math.random() * 1.2;
      let x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r;
      for (let t = 0; t < 6 && world.blocked(x, z, 0.5); t++) { x = cx + (Math.random() - 0.5) * 4; z = cz + (Math.random() - 0.5) * 4; }
      const e = enemies.spawn(u, x, z, { guard: !hostile, stealthy: R.stealth && !hostile, hostile, pack: p.i, yaw: Math.atan2(player.pos.x - x, player.pos.z - z) });
      e.mission = R.mission.id;
      return e;
    });
    if (p.scripted && p.trigger?.event) { R.scriptedPack = p; storyEvent(p.trigger.event); if (!storyId()) audio.bark('b_mara_ambush_', { cooldown: 10 }); }
  }

  function spawnTarget() {
    const t = R.mission.target;
    if (!t || R.target) return;
    const s = site(t.site) || site(R.step?.site);
    if (!s) return;
    const e = enemies.spawn({ defId: t.defId, rank: t.rank || 'grunt', level: R.mission.level, name: t.name }, s.x + 1.5, s.z + 1.5, { guard: true, stealthy: R.stealth });
    e.mission = R.mission.id; e.isTarget = true; e.home.set(s.x, 0, s.z);
    R.target = e;
  }

  function enter(i) {
    const m = R.mission;
    R.idx = i;
    const c = sim.state.contract;
    R.step = c ? c.steps[i] : null;
    R.ss = { t: 0, hold: 0, shots: 0, prog: 0 };
    for (const b of R.beacons) b.remove();
    R.beacons = [];
    ui.lens.hide(); ui.band.hide();
    if (!R.step) return finish();
    const s = R.step;
    // twist
    const tw = m.twist;
    if (tw && !c.twistFired && tw.atStep === i) fireTwist(tw);
    // spawn packs: guards one step early (so they stand at the objective), ambushes on their step
    for (const p of R.packs) {
      if (p.spawned || p.scripted) continue;
      const guardHere = p.site && (p.site === s.site || p.site === c.steps[i + 1]?.site);
      if (p.atStep <= i || (guardHere && p.atStep <= i + 1)) spawnPack(p, !guardHere);
    }
    if (m.target && (['photo', 'kill', 'capture', 'tail'].includes(c.steps[i + 1]?.type) || ['photo', 'kill', 'capture', 'tail'].includes(s.type)) && s.target !== 'all') spawnTarget();
    if (s.type === 'deliver' || s.type === 'exfil' || s.type === 'goto' && !c.steps[i + 1]?.type?.match(/pickup/)) {
      const st = site(s.site); if (st) R.beacons.push(props.beacon(st.x, st.z, s.type === 'exfil' ? [0.5, 0.9, 1.0] : [1.0, 0.8, 0.4]));
    }
    if (s.type === 'destroy') for (const o of s.objs || []) { const st = site(o.site); if (st) { const a = Math.random() * 6; o._prop = props.nest(st.x + Math.sin(a) * 1.5, st.z + Math.cos(a) * 1.5, Math.round(40 * Math.pow(1.09, m.level - 1))); } }
    if (s.type === 'choose') runChoice(s);
    if (s.type === 'photo') R.ss.need = s.shots || 1;
    ctx.onStep && ctx.onStep(R, s);
  }

  function fireTwist(tw) {
    const t = sim.fireTwist();
    if (!t) return;
    ui.sting(`Twist: ${t.name}`, t.sting || '', 'twist', 3200);
    audio.sfx('alarm', { vol: 0.5 });
    audio.bark('b_mara_twist_', { cooldown: 5, force: true });
    for (const g of t.enemies || []) {
      const p = { i: R.packs.length, site: g.site, units: g.units, atStep: R.idx, spawned: false };
      R.packs.push(p);
      spawnPack(p, true);
    }
    if (t.id === 'T10') ctx.onFx && ctx.onFx('billboards_face');
  }

  async function runChoice(s) {
    R.busy = true;
    const opts = s.options || [];
    const choice = await ui.dialogue.show({ speaker: 'Mara Quill', role: 'Quill Contracts', portrait: { kind: 'human', seed: 11, hue: 30 }, text: s.label || 'Your call.', choices: opts.map((o) => o.label) });
    R && (R.busy = false);
    complete({ choice: Math.max(0, choice) });
  }

  function complete(info = {}) {
    if (!R || R.done) return;
    const r = sim.completeStep(info);
    if (r.failed || !sim.state.contract) { endFailed(r.reason || 'fail'); return; }
    audio.sfx('ui_confirm', { vol: 0.6 });
    if (r.done) return finish();
    enter(r.index);
  }

  async function finish() {
    if (R.done) return;
    R.done = true;
    const m = R.mission;
    if (m.twist && !sim.state.contract.twistFired && m.twist.atStep >= sim.state.contract.steps.length) fireTwist(m.twist);
    props.collectAll(ctx.onLootCollect);
    ui.lens.hide(); ui.detect.clear();
    if (m.story) await storyEvent('deliver', true);
    const out = sim.finishContract({ time: sim.state.contract?.elapsed });
    cleanup();
    await ctx.onComplete(out);
  }

  function endFailed(reason) {
    const m = R?.mission;
    cleanup();
    ctx.onFail && ctx.onFail(m, reason);
  }

  function cleanup() {
    if (!R) return;
    for (const b of R.beacons) b.remove();
    for (const c of R.carries.values()) props.removeCarry(c);
    props.clearMission();
    ctx.setCarrying(null);
    ui.lens.hide(); ui.detect.clear(); ui.band.hide();
    const id = R.mission.id;
    // survivors walk off; dead bodies are cleared by enemies.update
    enemies.clear((e) => e.mission === id && e.state !== 'dead' && (e.nonCombat || e.state === 'idle'));
    for (const e of enemies.list) if (e.mission === id && e.state !== 'dead') { e.mission = null; }
    R = null;
  }

  function abandon() { if (!R) return; sim.abandonContract(); endFailed('abandon'); }
  // the sim already failed the contract (e.g. the frame was wrecked): tear down + tell the player
  function failed(reason) { if (R && !sim.state.contract) endFailed(reason); }

  function missionHostiles() { return enemies.list.filter((e) => R && e.mission === R.mission.id && e.state !== 'dead' && !e.nonCombat); }

  function objective() {
    if (!R || !R.step) return null;
    const s = R.step;
    const amb = R.scriptedPack && !R.scriptedCleared ? R.scriptedPack.ents?.filter((e) => e.state !== 'dead') : null;
    if (amb?.length) { const e = amb.reduce((a, b) => (a.pos.distanceTo(player.pos) < b.pos.distanceTo(player.pos) ? a : b)); return { x: e.pos.x, z: e.pos.z, label: `${amb.length} rats`, enemy: true }; }
    if (['kill'].includes(s.type)) {
      if (s.target === 'target' && R.target && R.target.state !== 'dead') return { x: R.target.pos.x, z: R.target.pos.z, label: R.target.c.name, enemy: true };
      const h = missionHostiles();
      if (h.length) { let b = h[0], bd = 1e9; for (const e of h) { const d = e.pos.distanceTo(player.pos); if (d < bd) { bd = d; b = e; } } return { x: b.pos.x, z: b.pos.z, label: `${h.length} left`, enemy: true }; }
    }
    if (s.type === 'destroy') { const o = (s.objs || []).find((o) => o._prop && !o._prop.destroyed); if (o) return { x: o._prop.pos.x, z: o._prop.pos.z, label: 'Destroy' }; }
    if (s.type === 'photo' && R.target && R.target.state !== 'dead') return { x: R.target.pos.x, z: R.target.pos.z, label: R.target.c.name };
    const st = site(s.site || s.sites?.[0] || s.path?.[s.path.length - 1] || s.orExfil);
    if (!st) return null;
    return { x: st.x, z: st.z, label: s.type === 'pickup' ? 'Pick up' : s.type === 'deliver' ? 'Deliver' : s.type === 'exfil' ? 'Exfil' : null };
  }

  function interactLabel() {
    if (!R || !R.step || R.busy) return null;
    const s = R.step;
    const next = sim.state.contract?.steps[R.idx + 1];
    const near = (id, r = 2.8) => { const st = site(id); return st && d2(st) < r + (st.r || 0) * 0.3; };
    if (s.type === 'pickup' && near(s.site)) return `Pick up ${s.item?.name ? 'the ' + s.item.kind : ''}`.trim();
    if (s.type === 'deliver' && near(s.site, 3.2) && !(R.scriptedPack && !R.scriptedCleared)) return s.dispose ? 'Dump it' : 'Deliver';
    if (s.type === 'kill' && s.optional && next?.type === 'pickup' && near(next.site)) return `Grab the ${next.item?.kind || 'item'}`;
    if (['hack', 'escort', 'tail', 'race', 'defend', 'capture', 'confront', 'walk'].includes(s.type) && near(s.site || s.sites?.[R.ss.hackI || 0] || s.path?.[s.path.length - 1], 3.5)) return s.type === 'hack' ? (s.plant ? 'Plant the bug' : 'Hack') : 'Continue';
    return null;
  }

  function interact() {
    if (!R || !R.step || R.busy) return false;
    const s = R.step;
    const lbl = interactLabel();
    if (!lbl) return false;
    if (s.type === 'pickup') { pickUp(R.idx); complete(); storyEvent('pickup'); return true; }
    if (s.type === 'kill' && s.optional) { complete(); pickUp(R.idx); complete(); return true; }
    if (s.type === 'deliver') {
      ctx.setCarrying(null);
      if (s.dispose) { fx.ring(player.pos, 3, 0x8fe8ff, 0.6); audio.sfx('explosion_small'); }
      complete();
      return true;
    }
    if (s.type === 'hack') { R.ss.hacking = true; return true; }
    complete();
    return true;
  }

  function pickUp(idx) {
    const c = R.carries.get(idx);
    const s = sim.state.contract?.steps[idx];
    props.removeCarry(c); R.carries.delete(idx);
    ctx.setCarrying(s?.item?.kind || 'parcel');
    audio.sfx('pickup');
    ui.toast(`Picked up ${s?.item?.name || 'the item'}`, 'good', { ms: 2000 });
  }

  function update(dt) {
    if (!R || R.done) return;
    const c = sim.state.contract;
    if (!c) { cleanup(); return; }
    const s = R.step;
    R.ss.t += dt;
    const m = R.mission;
    if (m.timeLimit && c.elapsed > m.timeLimit) { ui.toast('Out of time', 'bad'); sim.failContract('timeout'); endFailed('timeout'); return; }
    if (s.timer && R.ss.t > s.timer) {
      fx.flash(tmp.set(player.pos.x, player.pos.y + 1, player.pos.z), 2, 0xff5020, 0.4); audio.sfx('explosion');
      ctx.damagePlayerPct(0.35, 'The parcel exploded');
      complete(); return;
    }
    // scripted packs (A1-M1 ambush) trigger on route progress
    for (const p of R.packs) {
      if (!p.scripted || p.spawned || p.atStep !== R.idx) continue;
      const st = site(s.site), from = site(c.steps[R.idx - 1]?.site) || st;
      if (!st) continue;
      const total = Math.max(1, Math.hypot(st.x - from.x, st.z - from.z));
      const prog = 1 - d2(st) / total;
      if (prog >= (p.trigger?.progress ?? 0.4)) spawnPack(p, true);
    }
    if (R.scriptedPack && !R.scriptedCleared && R.scriptedPack.ents?.every((e) => e.state === 'dead')) { R.scriptedCleared = true; storyEvent(R.scriptedPack.trigger.event + 'Cleared'); }

    const st = site(s.site);
    switch (s.type) {
      case 'goto': case 'exfil':
        if (st && d2(st) < Math.max(3, Math.min(s.radius || 4, 10))) complete();
        break;
      case 'kill': {
        if (s.target === 'target') { if (R.target ? R.target.state === 'dead' : !missionHostiles().length) complete(); break; }
        const pending = R.packs.some((p) => !p.spawned && !p.scripted && p.atStep <= R.idx);
        if (!pending && !missionHostiles().length && R.ss.t > 0.5) complete();
        else for (const e of missionHostiles()) if (e.state === 'idle' && e.pos.distanceTo(player.pos) < 14 && !R.stealth) enemies.alert(e, 'fight');
        break;
      }
      case 'destroy':
        if ((s.objs || []).every((o) => !o._prop || o._prop.destroyed) && R.ss.t > 0.3) complete();
        break;
      case 'photo': photo(dt, s); break;
      case 'hack': case 'confront': case 'walk': case 'escort': case 'tail': case 'race': case 'defend': case 'capture':
        if (R.ss.hacking) {
          R.ss.hold += dt;
          if (R.ss.hold >= (s.time || 2)) complete();
          else if (!interactLabel()) R.ss.hacking = false;
        }
        if (s.type !== 'hack' && st && d2(st) < 3) complete();
        break;
      case 'survive':
        if (R.ss.t >= (s.seconds || 30) || (s.orExfil && site(s.orExfil) && d2(site(s.orExfil)) < 4)) complete();
        break;
      default: break;
    }
    if (R?.stealth) stealth(dt);
  }

  function photo(dt, s) {
    const t = R.target;
    if (!t || t.state === 'dead') { if (R.ss.t > 2) complete(); return; }
    const d = t.pos.distanceTo(player.pos);
    const maxD = s.maxDist || 14;
    if (d < maxD * 1.5) {
      if (!ui.lens.open) ui.lens.show({ label: `Photograph ${t.c.name}`, count: `${R.ss.shots} / ${R.ss.need}` });
      tmp.set(t.pos.x, t.pos.y + 1.2, t.pos.z);
      const sp = ctx.project(tmp);
      const tooClose = d < 3.2;
      const ok = sp.on && d <= maxD && !tooClose && ctx.losClear(player.pos, t.pos);
      ui.lens.target(sp.on ? sp.x : null, sp.y, Math.max(40, 900 / Math.max(d, 2)), { label: tooClose ? 'Too close!' : d > maxD ? 'Get closer' : t.c.name, dist: Math.round(d), locked: ok });
      if (ok) R.ss.hold += dt; else R.ss.hold = Math.max(0, R.ss.hold - dt * 0.5);
      if (R.ss.capture) { R.ss.capture = false; if (ok) R.ss.hold += 1.0; }
      ui.lens.progress(Math.min(1, R.ss.hold / (s.holdTime || 2.5)));
      if (R.ss.hold >= (s.holdTime || 2.5)) {
        R.ss.hold = 0; R.ss.shots++;
        ui.lens.flash('Captured'); ui.lens.count(`${R.ss.shots} / ${R.ss.need}`);
        audio.sfx('scan');
        fx.flash(tmp, 0.6, 0xffffff, 0.15);
        if (R.ss.shots >= R.ss.need) { setTimeout(() => ui.lens.hide(), 700); complete(); }
      }
    } else if (ui.lens.open) ui.lens.hide();
  }

  function stealth(dt) {
    let alarm = false;
    for (const e of enemies.list) {
      if (e.mission !== R.mission.id || e.nonCombat || e.state === 'dead') continue;
      if (e.state !== 'idle') { alarm = true; ui.detect.clear(e.id); continue; }
      if (e.detect > 0.02) {
        tmp.set(e.pos.x, e.pos.y + 2.3, e.pos.z);
        const sp = ctx.project(tmp);
        ui.detect.set(e.id, sp.x, sp.y, e.detect, { onScreen: sp.on });
      } else ui.detect.clear(e.id);
    }
    if (alarm && !R.alarm) {
      R.alarm = true;
      ui.detect.clear();
      ui.sting('Alarm!', 'You were spotted', 'alert', 2000);
      audio.sfx('alarm', { vol: 0.6 });
      const r = sim.reportAlarm();
      if (r?.failed) { ui.toast('Ghost job blown: contract failed', 'bad'); endFailed('alarm'); }
    }
  }

  return {
    accept, update, objective, interact, interactLabel, abandon, failed,
    capture() { if (R) R.ss.capture = true; },
    get active() { return R; },
    get mission() { return R?.mission || null; },
  };
}
