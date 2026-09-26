import * as THREE from 'three';
import { createSteps } from './steps.js';

// Mission step runner: maps sim contract steps onto world.sites, spawns packs/props, drives objectives,
// twists, modifiers, stealth (surveil) and the story beats that hang off step events.
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
      target: null, realTarget: null, boss: null, scriptedCleared: false, elapsed: 0, done: false, stealth: !!m.stealthy, extra: [], npcs: {}, hitsCarrying: 0, watchers: [] };
    for (const [i, s] of m.steps.entries()) if (s.type === 'pickup' && site(s.site)) { const st = site(s.site); R.carries.set(i, props.carry(st.x + 0.8, st.z + 0.8, s.item?.kind || 'parcel')); }
    // escortees wait at their meeting point from the start
    for (const n of m.npcs || []) steps.spawnNpc(R, n);
    placeCollateral(m);
    if (m.modifiers.includes('watched')) placeWatchers(m);
    ui.sting(m.title, m.story ? 'Story contract' : `${m.client?.name || ''} · ${m.districtName || ''}`, m.story ? 'story' : 'alert', 2400);
    audio.sfx('contract_accept');
    if (m.story) storyEvent('accept');
    else audio.bark('b_mara_accept_', { cooldown: 20 });
    ctx.onAccept?.(m);
    enter(0);
    return { ok: true, mission: m };
  }

  // Glass House / Crowded: breakable stalls around the objectives; area hits there cost collateral
  function placeCollateral(m) {
    const ids = [...new Set(m.steps.map((s) => s.site || s.sites?.[0]).filter(Boolean))].slice(0, 3);
    const per = m.modifiers.includes('vip') ? 4 : m.modifiers.includes('collateral') ? 3 : 1;
    for (const id of ids) {
      const s = site(id);
      if (!s) continue;
      for (let k = 0; k < per; k++) {
        const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 3;
        const x = s.x + Math.sin(a) * r, z = s.z + Math.cos(a) * r;
        if (!world.blocked(x, z, 0.8)) props.breakable(x, z, Math.round(40 * Math.pow(1.09, m.level - 1)));
      }
    }
  }

  // Watched: extra Warden Eyes over the objectives; being spotted = +1 Heat
  function placeWatchers(m) {
    const ids = [...new Set(m.steps.map((s) => s.site).filter(Boolean))].slice(0, 2);
    for (const id of ids) {
      const s = site(id);
      if (!s) continue;
      const e = enemies.spawn({ defId: 'warden_eye', level: m.level }, s.x + 4, s.z - 3, { guard: true, stealthy: true });
      e.mission = m.id; e.watcher = true;
      R.watchers.push(e);
    }
  }

  // hostile: ambush (spawn out of sight, come in). opts.near/dist: spawn around a point instead of the pack's site
  function spawnPack(p, hostile, opts = {}) {
    if (p.spawned) return;
    p.spawned = true;
    let s = site(p.site) || site(R.step?.site) || { x: player.pos.x + 12, z: player.pos.z - 12, r: 3 };
    let cx = s.x, cz = s.z;
    const ref = opts.near || player.pos, lim = opts.dist || 20;
    if (hostile) {
      // ambushers come from their spawn site but no further than ~20 m away, so they actually arrive
      const dx = cx - ref.x, dz = cz - ref.z, d = Math.hypot(dx, dz);
      if (d > lim) { cx = ref.x + dx / d * (lim - 2); cz = ref.z + dz / d * (lim - 2); }
    }
    const n = p.units.length;
    p.ents = p.units.map((u, k) => {
      const a = (k / Math.max(1, n)) * Math.PI * 2 + Math.random() * 0.4, r = Math.min(3.5, (s.r || 3) * 0.6) + Math.random() * 1.2;
      let x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r;
      for (let t = 0; t < 8 && world.blocked(x, z, 0.5); t++) { x = cx + (Math.random() - 0.5) * 5; z = cz + (Math.random() - 0.5) * 5; }
      if (world.blocked(x, z, 0.5) && ctx.nav) { const q = ctx.nav.nearest(x, z); if (q) { x = q.x; z = q.z; } }
      const e = enemies.spawn(u, x, z, { guard: !hostile, stealthy: R.stealth && !hostile, hostile, pack: p.i, yaw: Math.atan2(player.pos.x - x, player.pos.z - z) });
      e.mission = R.mission.id;
      return e;
    });
    if (p.scripted && p.trigger?.event) { R.scriptedPack = p; storyEvent(p.trigger.event); if (!storyId()) audio.bark('b_mara_ambush_', { cooldown: 10 }); }
  }

  // generated defends: a small pack of the mission faction per wave
  function synthPack(Rm, k, src) {
    const fac = Rm.mission.faction || 'syndicate';
    const pool = { syndicate: ['knuckle', 'knuckle', 'popper'], scrap: ['scrap_rat', 'scrap_rat', 'scrap_rat', 'scrap_rat'], concord: ['warden', 'warden_eye'] }[fac] || ['knuckle', 'popper'];
    const n = pool.length + Math.min(2, k);
    const p = { i: Rm.packs.length, site: src?.id || Rm.step?.site, units: Array.from({ length: n }, (_, j) => ({ defId: pool[j % pool.length], rank: j === 0 && k > 1 ? 'veteran' : 'grunt', level: Rm.mission.level })), atStep: Rm.idx, spawned: false };
    Rm.packs.push(p);
    return p;
  }

  function spawnTarget(which = 'target') {
    const t = which === 'realTarget' ? R.mission.twist?.realTarget : R.mission.target;
    if (!t || (which === 'target' ? R.target : R.realTarget)) return;
    const siteId = which === 'realTarget' ? R.step?.site : t.site;
    const s = site(siteId) || site(R.step?.site);
    if (!s) return;
    const e = enemies.spawn({ defId: t.defId, rank: t.rank || 'grunt', level: R.mission.level, name: t.name }, s.x + 1.5, s.z + 1.5, { guard: true, stealthy: R.stealth });
    e.mission = R.mission.id; e.isTarget = true; e.home.set(s.x, 0, s.z);
    if (which === 'realTarget') R.realTarget = e; else R.target = e;
  }

  function spawnBoss() {
    const b = R.mission.boss;
    if (!b || R.boss) return;
    // breather before the boss: story bosses start with the frame patched up and a spare kit
    if (R.mission.story) {
      const pc = sim.playerCombatant();
      pc.hp = pc.stats.hp; pc.shield = pc.stats.shield;
      if ((sim.state.consumables.repairKit || 0) < 1) sim.state.consumables.repairKit = 1;
      fx.ring(player.pos, 2.2, 0x7dffb0, 0.5);
      ui.toast('Mara patched you up', 'good', { sub: 'Full repair + a spare kit' });
    }
    const s = site(b.site) || site(R.step?.site) || { x: player.pos.x + 10, z: player.pos.z };
    const a = Math.atan2(player.pos.x - s.x, player.pos.z - s.z);
    let x = s.x - Math.sin(a) * 6, z = s.z - Math.cos(a) * 6;
    if (world.blocked(x, z, 1) && ctx.nav) { const q = ctx.nav.nearest(x, z); if (q) { x = q.x; z = q.z; } }
    R.boss = ctx.boss.spawn(b, x, z, R);
  }

  function enter(i) {
    const m = R.mission;
    R.idx = i;
    const c = sim.state.contract;
    R.step = c ? c.steps[i] : null;
    R.ss = { t: 0, hold: 0, shots: 0, prog: 0 };
    for (const b of R.beacons) b.remove();
    R.beacons = [];
    ui.lens.hide(); ui.band.hide(); ui.meter.hide();
    if (!R.step) return finish();
    const s = R.step;
    // twist (T2 fires when its step is done, T9 at payout, the rest on entering their step)
    const tw = m.twist;
    if (tw && !c.twistFired && tw.atStep === i && tw.id !== 'T2') fireTwist(tw);
    steps.enter(R, s);
    // spawn packs: guards one step early (so they stand at the objective), ambushes on their step
    for (const p of R.packs) {
      if (p.spawned || p.scripted || p.deferred || p.nearNpc) continue;
      const guardHere = p.guard || (p.site && (p.site === s.site || p.site === c.steps[i + 1]?.site || s.sites?.includes(p.site)));
      if (p.atStep <= i || (guardHere && p.atStep <= i + 1)) spawnPack(p, !guardHere && p.atStep <= i);
    }
    const next = c.steps[i + 1];
    const TT = ['photo', 'kill', 'capture', 'tail'];
    if (m.target && ((TT.includes(next?.type) && next.target === 'target') || (TT.includes(s.type) && s.target === 'target'))) spawnTarget('target');
    if ((s.type === 'kill' || s.type === 'photo') && s.target === 'realTarget') spawnTarget('realTarget');
    if (s.type === 'kill' && s.target === 'boss') spawnBoss();
    if (s.type === 'deliver' || s.type === 'exfil' || s.type === 'goto' && !next?.type?.match(/pickup/)) {
      const st = site(s.site); if (st) R.beacons.push(props.beacon(st.x, st.z, s.type === 'exfil' ? [0.5, 0.9, 1.0] : [1.0, 0.8, 0.4]));
    }
    if (s.type === 'destroy') for (const o of s.objs || []) {
      const st = site(o.site); if (!st) continue;
      const a = Math.random() * 6;
      const hp = Math.round(40 * Math.pow(1.09, m.level - 1) * (o.hpMult || 1));
      o._prop = o.kind === 'nest' || !o.kind ? props.nest(st.x + Math.sin(a) * 1.5, st.z + Math.cos(a) * 1.5, hp) : props.machine(st.x + Math.sin(a) * 1.5, st.z + Math.cos(a) * 1.5, hp, o.kind);
    }
    if (s.type === 'choose') runChoice(s);
    if (s.type === 'photo') R.ss.need = s.shots || 1;
    log(`step ${i} ${s.type}${s.target ? ':' + s.target : ''} ${s.site || s.sites?.join(',') || ''}`);
    storyEvent(`enter:${i}`);
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
      if (g.rivals) for (const e of p.ents) { e.hunter = true; e.bot.setAlert(2); }
    }
    if (t.id === 'T10') ctx.onFx && ctx.onFx('billboards_face');
    if (t.id === 'T2' && R.target && R.target.state !== 'dead') {
      // the decoy bolts; the real one is somewhere else
      const e = R.target; e.state = 'flee'; e.fleeT = 6; e.nonCombat = true; setTimeout(() => enemies.clear((x) => x === e), 6000);
    }
    log('twist ' + t.id);
  }
  const log = (m) => ctx.log?.(m);

  async function runChoice(s) {
    R.busy = true;
    const opts = s.options || [];
    const choice = await ui.dialogue.show({ speaker: 'Mara Quill', role: 'Quill Contracts', portrait: { kind: 'human', seed: 11, hue: 30 }, text: s.label || 'Your call.', choices: opts.map((o) => o.label) });
    R && (R.busy = false);
    complete({ choice: Math.max(0, choice) });
  }

  function complete(info = {}) {
    if (!R || R.done) return;
    const c = sim.state.contract;
    const tw = R.mission.twist;
    if (tw?.id === 'T2' && c && !c.twistFired && tw.atStep === R.idx) fireTwist(tw);
    const idx = R.idx;
    const r = sim.completeStep(info);
    if (r.failed || !sim.state.contract) { endFailed(r.reason || 'fail'); return; }
    audio.sfx('ui_confirm', { vol: 0.6 });
    storyEvent(`done:${idx}`);
    if (r.done) return finish();
    enter(r.index);
  }

  function fail(reason, text) {
    if (!R) return;
    if (R.mission.story) {
      // story contracts restart the step instead of failing (checkpoints)
      ui.toast(text || 'Checkpoint', 'bad', { sub: 'Back to the last checkpoint' });
      for (const e of enemies.list) if (e.mission === R.mission.id && !e.escort && e.state !== 'dead') e.state === 'idle' || (e.hunter = false);
      for (const n of Object.values(R.npcs)) if (n.state === 'dead' || !n.c.alive) { enemies.clear((x) => x === n); enemies.removeDecoy(n.decoy); }
      R.npcs = {};
      for (const n of R.mission.npcs || []) steps.spawnNpc(R, n);
      enter(R.idx);
      return;
    }
    ui.toast(text || 'Contract failed', 'bad');
    sim.failContract(reason);
    endFailed(reason);
  }

  async function finish() {
    if (R.done) return;
    R.done = true;
    const m = R.mission;
    if (m.twist && !sim.state.contract.twistFired && m.twist.atStep >= sim.state.contract.steps.length) fireTwist(m.twist);
    props.collectAll(ctx.onLootCollect);
    ui.lens.hide(); ui.detect.clear(); ui.meter.hide();
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
    ui.lens.hide(); ui.detect.clear(); ui.band.hide(); ui.meter.hide();
    ctx.boss?.end();
    const id = R.mission.id;
    for (const n of Object.values(R.npcs)) enemies.removeDecoy(n.decoy);
    for (const d of [...enemies.decoys]) if (d.kind === 'npc') enemies.removeDecoy(d);
    // survivors walk off; dead bodies are cleared by enemies.update
    enemies.clear((e) => e.mission === id && e.state !== 'dead' && (e.nonCombat || e.state === 'idle' || e.watcher));
    for (const e of enemies.list) if (e.mission === id && e.state !== 'dead') { e.mission = null; }
    R = null;
  }

  function abandon() { if (!R) return; sim.abandonContract(); endFailed('abandon'); }
  // the sim already failed the contract (e.g. the frame was wrecked): tear down + tell the player
  function failed(reason) { if (R && !sim.state.contract) endFailed(reason); }

  function missionHostiles() { return enemies.list.filter((e) => R && e.mission === R.mission.id && e.state !== 'dead' && !e.nonCombat && !e.watcher); }

  function nearestOf(list) { let b = list[0], bd = 1e9; for (const e of list) { const d = e.pos.distanceTo(player.pos); if (d < bd) { bd = d; b = e; } } return b; }

  function objective() {
    if (!R || !R.step) return null;
    const s = R.step;
    const amb = R.scriptedPack && !R.scriptedCleared ? R.scriptedPack.ents?.filter((e) => e.state !== 'dead') : null;
    if (amb?.length) { const e = nearestOf(amb); return { x: e.pos.x, z: e.pos.z, label: `${amb.length} left`, enemy: true }; }
    if (s.type === 'kill') {
      if (s.target === 'boss' && R.boss && R.boss.state !== 'dead') return { x: R.boss.pos.x, z: R.boss.pos.z, label: R.boss.c.name, enemy: true };
      const tgt = s.target === 'realTarget' ? R.realTarget : s.target === 'target' ? R.target : null;
      if (tgt && tgt.state !== 'dead') return { x: tgt.pos.x, z: tgt.pos.z, label: tgt.c.name, enemy: true };
      const h = missionHostiles();
      if (h.length) { const b = nearestOf(h); return { x: b.pos.x, z: b.pos.z, label: `${h.length} left`, enemy: true }; }
    }
    if (s.type === 'destroy') { const o = (s.objs || []).find((o) => o._prop && !o._prop.destroyed); if (o) return { x: o._prop.pos.x, z: o._prop.pos.z, label: 'Destroy' }; }
    if (s.type === 'photo') { const t = s.target === 'realTarget' ? R.realTarget : R.target; if (t && t.state !== 'dead') return { x: t.pos.x, z: t.pos.z, label: t.c.name }; }
    if (s.type === 'escort' && R.ss.npc) { const e = R.ss.npc; const wp = R.ss.path?.[R.ss.wp]; return d2(e.pos) > 10 ? { x: e.pos.x, z: e.pos.z, label: e.c.name } : wp ? { x: wp.x, z: wp.z, label: 'Escort' } : null; }
    if (s.type === 'hack') { const st = site((s.sites || [s.site])[R.ss.hackI || 0]); if (st) return { x: st.x, z: st.z, label: s.verb ? 'Terminal' : 'Hack' }; }
    const st = site(s.site || s.sites?.[0] || s.path?.[s.path.length - 1] || s.orExfil);
    if (!st) return null;
    return { x: st.x, z: st.z, label: s.type === 'pickup' ? 'Pick up' : s.type === 'deliver' ? 'Deliver' : s.type === 'exfil' || s.type === 'survive' ? 'Exfil' : s.ping ? `Search ${s.radius} m` : null };
  }

  function interactLabel() {
    if (!R || !R.step || R.busy) return null;
    const s = R.step;
    const x = steps.label(R, s);
    if (x) return x;
    const next = sim.state.contract?.steps[R.idx + 1];
    const near = (id, r = 2.8) => { const st = site(id); return st && d2(st) < r + (st.r || 0) * 0.3; };
    if (s.type === 'pickup' && near(s.site)) return `Pick up ${s.item?.name ? 'the ' + s.item.kind : ''}`.trim();
    if (s.type === 'deliver' && near(s.site, 3.2) && !(R.scriptedPack && !R.scriptedCleared)) return s.dispose ? 'Dump it' : 'Deliver';
    if (s.type === 'kill' && s.optional && next?.type === 'pickup' && near(next.site)) return `Grab the ${next.item?.kind || 'item'}`;
    if (['tail', 'race', 'capture', 'confront', 'walk'].includes(s.type) && near(s.site || s.path?.[s.path.length - 1], 3.5)) return 'Continue';
    return null;
  }

  function interact() {
    if (!R || !R.step || R.busy) return false;
    const s = R.step;
    const lbl = interactLabel();
    if (!lbl) return false;
    if (steps.interact(R, s)) return true;
    if (s.type === 'pickup') { pickUp(R.idx); complete(); storyEvent('pickup'); return true; }
    if (s.type === 'kill' && s.optional) { complete(); pickUp(R.idx); complete(); return true; }
    if (s.type === 'deliver') {
      ctx.setCarrying(null);
      if (s.dispose) { fx.ring(player.pos, 3, 0x8fe8ff, 0.6); audio.sfx('explosion_small'); }
      complete();
      return true;
    }
    complete();
    return true;
  }

  function pickUp(idx) {
    const c = R.carries.get(idx);
    const s = sim.state.contract?.steps[idx];
    props.removeCarry(c); R.carries.delete(idx);
    ctx.setCarrying(s?.item?.kind || 'parcel');
    R.hitsCarrying = 0;
    audio.sfx('pickup');
    ui.toast(`Picked up ${s?.item?.name || 'the item'}`, 'good', { ms: 2000, sub: R.mission.modifiers.includes('fragile') ? 'Fragile: 3 hits and it breaks' : undefined });
  }

  // Fragile: the carried cargo breaks after 3 hits taken
  function playerHit(res) {
    if (!R || !ctx.carrying?.() || !R.mission.modifiers.includes('fragile') || !(res?.amount > 0)) return;
    R.hitsCarrying++;
    if (R.hitsCarrying >= 3) { fx.sparks(tmp.set(player.pos.x, player.pos.y + 1.2, player.pos.z), 0xd8c0a0, 16, 5); audio.sfx('explosion_small'); fail('fragile', 'The cargo broke'); }
    else ui.toast(`Fragile cargo: ${3 - R.hitsCarrying} hit${3 - R.hitsCarrying > 1 ? 's' : ''} left`, 'warn', { ms: 1400 });
  }

  function update(dt) {
    if (!R || R.done) return;
    const c = sim.state.contract;
    if (!c) { cleanup(); return; }
    const s = R.step;
    R.ss.t += dt;
    const m = R.mission;
    if (m.timeLimit && c.elapsed > m.timeLimit) { fail('timeout', 'Out of time'); return; }
    if (s.timer && R.ss.t > s.timer) {
      fx.flash(tmp.set(player.pos.x, player.pos.y + 1, player.pos.z), 2, 0xff5020, 0.4); audio.sfx('explosion');
      ctx.damagePlayerPct(0.35, 'The parcel exploded');
      complete(); return;
    }
    // scripted packs (story ambushes) trigger on route progress
    for (const p of R.packs) {
      if (!p.scripted || p.spawned || p.atStep !== R.idx) continue;
      const st = site(s.site), from = site(c.steps[R.idx - 1]?.site) || st;
      if (!st) continue;
      const total = Math.max(1, Math.hypot(st.x - from.x, st.z - from.z));
      const prog = 1 - d2(st) / total;
      if (prog >= (p.trigger?.progress ?? 0.4)) spawnPack(p, true);
    }
    if (R.scriptedPack && !R.scriptedCleared && R.scriptedPack.ents?.every((e) => e.state === 'dead')) { R.scriptedCleared = true; storyEvent(R.scriptedPack.trigger.event + 'Cleared'); }

    if (!steps.update(R, s, dt)) {
      const st = site(s.site);
      switch (s.type) {
        case 'goto': case 'exfil': {
          const rad = s.ping ? Math.max(4, s.radius * 0.45) : Math.max(3, Math.min(s.radius || 4, 10));
          if (st && d2(st) < rad && !(R.scriptedPack && !R.scriptedCleared && s.type === 'goto' && R.scriptedPack.atStep === R.idx && R.scriptedPack.ents?.some((e) => e.state !== 'dead') && false)) complete();
          break;
        }
        case 'kill': {
          if (s.target === 'boss') { if (R.boss && R.boss.state === 'dead') complete(); break; }
          if (s.target === 'target' || s.target === 'realTarget') {
            const t = s.target === 'target' ? R.target : R.realTarget;
            if (t ? t.state === 'dead' : !missionHostiles().length) complete();
            break;
          }
          const pending = R.packs.some((p) => !p.spawned && !p.scripted && p.atStep <= R.idx);
          if (!pending && !missionHostiles().length && R.ss.t > 0.5) complete();
          else for (const e of missionHostiles()) if (e.state === 'idle' && e.pos.distanceTo(player.pos) < 14 && !R.stealth) enemies.alert(e, 'fight');
          break;
        }
        case 'destroy':
          if ((s.objs || []).every((o) => !o._prop || o._prop.destroyed) && R.ss.t > 0.3) complete();
          break;
        case 'photo': photo(dt, s); break;
        case 'confront': case 'walk': case 'tail': case 'race': case 'capture':
          if (st && d2(st) < 3) complete();
          break;
        case 'survive': {
          const ex = s.orExfil && site(s.orExfil);
          ui.meter.set({ label: s.label || 'Survive', value: Math.min(1, R.ss.t / (s.seconds || 30)), kind: 'danger', text: `${Math.max(0, Math.ceil((s.seconds || 30) - R.ss.t))}s`, sub: ex ? 'or reach the exit' : '' });
          if (R.ss.t >= (s.seconds || 30) || (ex && d2(ex) < 4)) { ui.meter.hide(); complete(); }
          break;
        }
        default: break;
      }
    }
    if (R?.stealth) stealth(dt);
  }

  function photo(dt, s) {
    const t = s.target === 'realTarget' ? R.realTarget : R.target;
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
        storyEvent(`shot:${R.ss.shots}`);
        if (R.ss.shots >= R.ss.need) { setTimeout(() => ui.lens.hide(), 700); complete(); }
      }
    } else if (ui.lens.open) ui.lens.hide();
  }

  function stealth(dt) {
    let alarm = false;
    for (const e of enemies.list) {
      if (e.mission !== R.mission.id || e.nonCombat || e.state === 'dead') continue;
      if (e.state !== 'idle' && e.state !== 'search') { alarm = true; ui.detect.clear(e.id); continue; }
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

  const api = {
    accept, update, objective, interact, interactLabel, abandon, failed, playerHit, site, spawnPack, synthPack, complete, fail, missionHostiles, storyEvent,
    capture() { if (R) R.ss.capture = true; },
    get active() { return R; },
    get mission() { return R?.mission || null; },
  };
  const steps = createSteps(ctx, api);
  return api;
}
