import * as THREE from 'three';
import { audio } from '../audio/audio.js';
import { createGame as createSim, loadGame } from '../sim/game_state.js';
import { createSaveStore } from '../sim/save.js';
import { statusMult } from '../sim/stats.js';
import { SHIFT_SECONDS, framePrice } from '../sim/economy.js';
import { toUiBoard, toUiWarehouse, toUiComplete, toUiItem, toUiCodex, uiConfig } from '../sim/ui_adapt.js';
import { createFx, RARITY_COLOR } from './fx.js';
import { createOverlay } from './overlay.js';
import { createStoryPlayer } from './story.js';
import { createEnemies } from './enemies.js';
import { createCombat } from './combat.js';
import { createProps } from './props.js';
import { createRunner } from './runner.js';
import { createHudSync } from './hud.js';
import { createAutopilot } from './auto.js';
import { createNav } from './nav.js';
import { createCoach } from './coach.js';

const UI_SFX = { click: 'ui_click', open: 'ui_open', close: 'ui_close', deny: 'ui_deny', confirm: 'ui_confirm', levelup: null, loot: null, loot_rare: null, toast: 'ui_hover', type: null };
const EMITTERS = [['fountain', 0, 0, 1], ['waterfall', -47, -62, 1], ['waterfall', 66, -96, 1.2], ['fountain', -47, -57, 0.6]];

// ?noui: the runtime modules still call ui.* freely; hand them an inert stand-in (falsy state, no-op calls)
const FALSY = new Set(['open', 'current', 'attackHeld', 'sneak', 'minimap', 'root', 'then']);
function inertUi() {
  const move = { x: 0, y: 0 };
  const p = new Proxy(function () {}, {
    get: (_, k) => (k === 'move' ? move : FALSY.has(k) || typeof k === 'symbol' ? undefined : p),
    apply: () => undefined,
  });
  return p;
}

// Gameplay runtime (D13). main.js calls createGame(api) once and then update(dt, stick) every frame.
export async function createGame(api) {
  const { world, rig, input, player, crowd, ui, flags } = api;
  const actor = player.actor;
  const Q = new URLSearchParams(location.search);
  const store = createSaveStore();
  const overlay = createOverlay();
  const fx = createFx(world.scene);
  const t0 = performance.now();
  const nav = createNav(world);
  console.info(`nav grid ${nav.W}x${nav.H} in ${(performance.now() - t0).toFixed(0)} ms`);
  const sites = { aurum_plaza: world.sites };
  const tmp = new THREE.Vector3();
  const speedK = Math.min(4, Math.max(0.25, +(Q.get('speed') || 1)));
  const shiftLen = +(Q.get('shift') || 0);

  const G = {
    state: 'boot', sim: null, player, actor, enemies: null, runner: null, combat: null, props: null, fx, overlay, audio, errors: [],
    music: null, hitstopT: 0, autosaveT: 30, paT: 70, lowHpBark: false, carrying: null, carryMesh: null, near: null, lastInteract: null, contractsDone: 0,
    log: [],
  };
  const log = (msg) => { G.log.push(`${(performance.now() / 1000).toFixed(1)} ${msg}`); if (G.log.length > 200) G.log.shift(); };

  ui?.config(uiConfig());
  if (ui) {
    audio.setVolumes(ui.settings.volumes());
    ui.on('volumes', (v) => audio.setVolumes(v));
    // dialogue VO goes through the audio engine (ducking + volume buses); typing syncs to the returned duration
    ui.dialogue.setVoice((k) => { audio.vo(k); return audio.voInfo(k)?.duration; });
    ui.on('dialogue:end', () => audio.stopVo());
  }
  ui?.on('sfx', (n) => { const k = UI_SFX[n]; if (k) audio.sfx(k, { vol: n === 'toast' ? 0.3 : 0.7 }); });
  audio.ambient('plaza');
  for (const [k, x, z, level] of EMITTERS) audio.emitter(k, { x, z, level });
  input.onTap = null;

  // --- title backdrop: slow drift over the plaza -------------------------------------------------
  let titleT = 0;
  function titleCam(dt) {
    titleT += dt;
    const a = -0.35 + Math.sin(titleT * 0.05) * 0.25;
    const f = rig.fixed || (rig.fixed = { pos: new THREE.Vector3(), look: new THREE.Vector3(-4, 6, -30), fov: 52 });
    f.pos.set(Math.sin(a) * 34, 11 + Math.sin(titleT * 0.08) * 1.5, 30 + Math.cos(a) * 12);
  }

  function setMusic(state) { if (G.music !== state) { G.music = state; audio.music(state); } }
  const panelOpen = () => !!ui?.panel.current;
  const blocked = () => G.state !== 'free' || panelOpen() || ui?.dialogue.open || overlay.cardOpen;

  function project(p) { return G.hud.project(p); }
  function losClear(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), n = Math.floor(d / 1.2);
    for (let i = 1; i < n; i++) { const u = i / n; if (world.blocked(a.x + dx * u, a.z + dz * u, 0.05)) return false; }
    return true;
  }

  function setCarrying(kind) {
    G.carrying = kind;
    if (G.carryMesh) { G.carryMesh.parent?.remove(G.carryMesh); G.carryMesh = null; }
    if (!kind) return;
    const m = new THREE.Mesh(kind === 'case' ? new THREE.BoxGeometry(0.55, 0.22, 0.36) : new THREE.BoxGeometry(0.4, 0.34, 0.4),
      new THREE.MeshStandardMaterial({ color: kind === 'case' ? 0x2a2d33 : kind === 'bomb' ? 0x5a4a3a : 0xd9c9a8, metalness: kind === 'case' ? 0.9 : 0.1, roughness: 0.5, emissive: kind === 'bomb' ? 0x401008 : 0 }));
    m.castShadow = true;
    actor.root.add(m); m.position.set(0, 1.18, -0.36); m.scale.setScalar(0.75);
    G.carryMesh = m;
  }

  // --- player damage / death ----------------------------------------------------------------------
  function hitPlayer(e, skill) {
    if (G.state !== 'free') return;
    const pc = G.sim.playerCombatant();
    const head = tmp.set(player.pos.x, player.pos.y + 2.0, player.pos.z);
    const s = project(head);
    if (pc.invulnerable) { if (s.on) ui?.damage(s.x, s.y, 0, 'miss'); return; }
    const res = G.sim.hit(e.c, pc, skill, {});
    if (!res.hit) { if (s.on) ui?.damage(s.x, s.y, 0, 'miss'); return; }
    if (s.on) ui?.damage(s.x + (Math.random() - 0.5) * 20, s.y, res.amount, 'player');
    ui?.hud.flash(res.shieldDmg > res.hullDmg ? 'shield' : 'hit');
    actor.hitFlash?.();
    fx.impact(tmp.set(player.pos.x, player.pos.y + 1.1, player.pos.z), res.shieldDmg > res.hullDmg ? 0x8fe8ff : 0xff6040, 0.9);
    audio.sfx(res.shieldDmg > res.hullDmg ? 'shield_hit' : 'hurt', { vol: 0.8, minGap: 50 });
    rig.shake = Math.max(rig.shake, 0.12);
    if (pc.hp < pc.stats.hp * 0.3 && !G.lowHpBark) { G.lowHpBark = true; audio.bark('b_hira_lowhp_', { cooldown: 30 }); }
    if (pc.hp > pc.stats.hp * 0.5) G.lowHpBark = false;
    G.coach?.playerHit();
    if (res.wrecked || !pc.alive) playerDown(e.c.name);
  }
  function damagePlayerPct(pct, cause) {
    const pc = G.sim.playerCombatant();
    pc.hp -= pc.stats.hp * pct;
    ui?.hud.flash('hit');
    if (pc.hp <= 0) { pc.hp = 0; pc.alive = false; playerDown(cause); }
  }

  async function playerDown(cause = 'Wrecked') {
    if (G.state === 'down') return;
    G.state = 'down';
    log('player down: ' + cause);
    actor.play('die', { loop: false });
    audio.sfx('power_down');
    audio.bark('b_hira_wreck_', { force: true });
    const r = G.sim.playerWrecked();
    ui?.lens.hide(); ui?.detect.clear();
    await wait(1600);
    const rental = G.sim.activeFrame().rental;
    const tip = `${rental ? 'Rental warranty: redeploy is free. ' : ''}Dodge through attacks: the roll has invulnerability frames.`;
    const act = ui ? await ui.screen('death', { cause: `Wrecked by ${cause}`, cost: r.cost || 0, tip }) : 'redeploy';
    if (G.runner.active && !G.sim.state.contract) G.runner.failed('wrecked');
    else if (G.runner.active) setTimeout(() => ui?.toast('Back on the job', 'info', { sub: `${G.runner.mission?.title || 'The contract'} is still open` }), 400);
    const sp = world.spawnPoints.kiosk, rx = sp.x + 2, rz = sp.z + 3;
    // no redeploy into the same fight: strays near the kiosk leave, everyone else calms down and walks home
    G.enemies.clear((e) => !e.mission && e.state !== 'dead' && Math.hypot(e.pos.x - rx, e.pos.z - rz) < 30);
    for (const e of G.enemies.list) {
      if (e.state === 'dead' || e.nonCombat) continue;
      e.state = 'idle'; e.c.alerted = false; e.bot.setAlert(0); e.detect = 0; e.route = null;
      if (Math.hypot(e.home.x - rx, e.home.z - rz) < 20) e.home.set(e.pos.x, 0, e.pos.z);
    }
    G.spawnShield = 3;
    player.teleport(rx, rz, Math.PI);
    rig.target.copy(player.pos); rig.snap();
    actor.play('idle');
    G.sim.playerCombatant();
    G.state = 'free';
    if (act === 'warehouse') openWarehouse();
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms / speedK));

  // --- loot ------------------------------------------------------------------------------------------
  function onKill(e) {
    if (!e.c.rewarded) {
      const out = G.sim.kill(e.c);
      if (!out) return;
      if (out.credits) G.props.dropLoot({ credits: out.credits }, e.pos.x, e.pos.z);
      for (const it of out.items) G.props.dropLoot({ item: it }, e.pos.x, e.pos.z);
      G.kills = (G.kills || 0) + 1;
    }
  }
  function onLootCollect(o) {
    tmp.set(player.pos.x, player.pos.y + 0.1, player.pos.z);
    fx.pop(tmp, o.credits ? 0xffc850 : RARITY_COLOR[o.item?.rarity] || 0xffffff);
    if (o.credits) { ui?.loot([{ credits: o.credits }]); audio.sfx('credits', { vol: 0.6 }); return; }
    const it = o.item;
    if (!it) return;
    const u = toUiItem(it);
    u.better = !!it.upgrade && !it.equippedOn;
    ui?.loot([u]);
    G.coach?.lootItem();
    audio.sfx('loot', { rarity: it.rarity, x: player.pos.x, z: player.pos.z });
    if (u.better) audio.bark('b_hira_loot_up_', { cooldown: 20 });
    else if (['prototype', 'relic', 'heirloom'].includes(it.rarity)) audio.bark('b_hira_loot_rare_', { cooldown: 20 });
  }

  // --- panels ----------------------------------------------------------------------------------------
  function openContracts() {
    if (!ui) return;
    ui.panel.open('contracts', toUiBoard(G.sim));
    setMusic('explore');
  }
  function inCombat() { return G.enemies.hostileNear(player.pos.x, player.pos.z, 22); }
  function openWarehouse(tab) {
    if (!ui) return false;
    if (inCombat()) { ui.toast('Remote link jammed', 'bad', { sub: 'Break combat to reach the Warehouse' }); audio.sfx('ui_deny'); return false; }
    ui.panel.open('warehouse', { ...toUiWarehouse(G.sim), tab });
    audio.bark('b_hira_warehouse_', { cooldown: 60 });
    return true;
  }
  function refreshWarehouse() { if (ui?.panel.current === 'warehouse') ui.panel.update(toUiWarehouse(G.sim)); }

  function wireUi() {
    if (!ui) return;
    ui.on('attack', () => { if (!blocked()) G.combat.attack(); });
    ui.on('skill', (id) => { if (!blocked()) { G.combat.skill(id); G.coach?.finish('skill'); } });
    ui.on('dodge', () => {
      if (blocked()) return;
      G.coach?.finish('dodge');
      const m = ui.controls.move;
      G.combat.dodge(Math.hypot(m.x, m.y) > 0.2 ? rig.screenToWorld(m.x, -m.y) : null);
    });
    ui.on('interact', () => { if (!blocked() && G.lastInteract) G.coach?.finish('interact'); interact(); });
    ui.on('contracts', () => { if (G.state === 'free') { G.coach?.finish('board'); openContracts(); } });
    ui.on('warehouse', () => { if (G.state === 'free') openWarehouse(); });
    ui.on('codex', () => { if (G.state === 'free') ui.panel.open('codex', toUiCodex(G.sim)); });
    ui.on('pause', () => { if (G.state === 'free') ui.panel.open('pause', { mission: G.runner.mission ? { title: G.runner.mission.title } : null }); });
    ui.on('pause:quit', () => { G.sim.save(); window.__reload?.(); });
    ui.on('tap', (s) => tapAt(s.x, s.y));
    ui.on('contract:accept', (c) => {
      if (G.runner.active) { ui.toast('Finish your current contract first', 'warn'); return; }
      const r = G.runner.accept(c.id);
      if (r.ok) { log('accepted ' + r.mission.id + ' ' + r.mission.archetype); G.sim.save(); }
    });
    ui.on('contract:reroll', () => { const r = G.sim.rerollBoard(); if (r.ok) ui.panel.update(toUiBoard(G.sim)); });
    ui.on('contract:threat', (id) => { if (G.sim.setThreat(id).ok) ui.panel.update(toUiBoard(G.sim)); });
    ui.on('loot:equip', (it) => {
      const r = G.sim.equip(it.id);
      if (r.ok) { ui.toast(`Equipped ${it.name}`, 'good'); audio.sfx('ui_confirm'); log('equipped ' + it.id); G.sim.save(); }
      else ui.toast(r.reason === 'slot' ? 'The rental can\'t fit that part' : r.reason === 'level' ? `Needs level ${r.need}` : 'Can\'t equip that', 'warn');
    });
    ui.on('loot:inspect', (it) => { const f = G.sim.activeFrame(); const cur = it.slot && f.equipped[it.slot] ? toUiItem(G.sim.itemByUid(f.equipped[it.slot])) : null; ui.itemCard(it, cur); });
    const wh = (fn) => (p) => { const r = fn(p) || {}; if (r.ok === false && r.reason) ui.toast(whyText(r), 'warn'); refreshWarehouse(); G.sim.save(); return r; };
    ui.on('warehouse:equip', wh((p) => G.sim.equip(p.itemId, p.frameId)));
    ui.on('warehouse:unequip', wh((p) => G.sim.unequip(p.frameId, p.slot)));
    ui.on('warehouse:autoEquip', wh((p) => { const ch = G.sim.equipBest(p.frameId); ui.toast(ch.length ? `Equipped ${ch.length} part${ch.length > 1 ? 's' : ''}` : 'Already optimal', ch.length ? 'good' : 'info'); return { ok: true }; }));
    ui.on('warehouse:tune', wh((p) => { const r = G.sim.tune(p.itemId); if (r.ok !== false && r.success !== undefined) { ui.toast(r.success ? 'Tune succeeded' : 'Tune failed: materials lost', r.success ? 'good' : 'bad'); audio.bark(r.success ? 'b_ottoline_tune_ok_' : 'b_ottoline_tune_fail_', { cooldown: 8 }); } return r; }));
    ui.on('warehouse:salvage', wh((p) => { const r = G.sim.salvage(p.itemId); if (r.ok) { ui.toast('Salvaged', 'info', { sub: matsText(r.mats) }); audio.sfx('explosion_small', { vol: 0.4 }); } return r; }));
    ui.on('warehouse:salvageAll', wh((p) => { const R = ['scrap', 'standard', 'tuned', 'custom', 'prototype', 'relic', 'heirloom']; const r = G.sim.salvageAll(R[p.tier] || 'standard'); ui.toast(`Salvaged ${r.count} items`, 'info', { sub: matsText(r.mats) }); return { ok: true }; }));
    ui.on('warehouse:activate', wh((p) => G.sim.swapFrame(p.frameId, { inCombat: inCombat() })));
    ui.on('warehouse:mk', wh((p) => G.sim.upgradeMk(p.frameId)));
    ui.on('warehouse:buy', wh((p) => G.sim.buyFrame(p.kind)));
    ui.on('panel:open', (n) => { if (n === 'warehouse') { setMusic('warehouse'); G.coach?.finish('warehouse'); } });
    ui.on('panel:close', () => setMusic(G.state === 'title' ? 'menu' : 'explore'));
    ui.on('lens:capture', () => G.runner.capture());
  }
  const matsText = (m) => Object.entries(m || {}).filter(([, v]) => v).map(([k, v]) => `+${v} ${k}`).join(' · ');
  const whyText = (r) => ({ credits: `Not enough credits${r.need ? ` (${r.need})` : ''}`, materials: 'Not enough materials', level: `Needs level ${r.need || r.needLevel || ''}`, combat: 'Not during combat', max: 'Already maxed', owned: 'Already owned', slot: 'Wrong slot for this frame', gate: `Needs level ${r.needLevel} and sync ${r.needSync}`, locked: 'Locked' }[r.reason] || 'Not possible right now');

  function tapAt(x, y) {
    if (blocked()) return;
    const g = input.groundFromScreen(x, y);
    if (!g) return;
    // tap an enemy to engage it
    let best = null, bd = 1.8;
    for (const e of G.enemies.alive()) { const d = Math.hypot(e.pos.x - g.x, e.pos.z - g.z); if (d < bd) { bd = d; best = e; } }
    if (best) { G.combat.engage(best); return; }
    // a tap near the horizon (camera tilted up) hits the ground far away: walk toward it, at most 30 m
    const dx = g.x - player.pos.x, dz = g.z - player.pos.z, d = Math.hypot(dx, dz);
    if (d > 30) { g.x = player.pos.x + dx / d * 30; g.z = player.pos.z + dz / d * 30; g.y = world.groundAt(g.x, g.z); }
    walkTo(g.x, g.z);
    api.marker.position.set(g.x, g.y + 0.03, g.z); api.marker.visible = true;
  }

  function walkTo(x, z, stopAt = 0.25) {
    const pts = nav.route(player.pos, { x, z });
    if (pts) player.setPath(pts, { stopAt }); else player.setTarget({ x, z }, { stopAt });
  }

  function interact() {
    if (blocked()) return;
    if (G.runner.interact()) return;
    const n = G.near;
    if (!n) return;
    if (n.id === 'contracts') {
      if (!G.sim.state.flags.kioskDone) { kioskIntro(); return; }
      openContracts();
    } else if (n.id === 'warehouse') openWarehouse();
    else if (n.id === 'relay') ui?.toast('Transit Relay', 'info', { sub: 'Other districts open as the story unfolds' });
  }

  // every holo billboard wipes to Harmony's face (art's world.billboards); the sting is the fallback
  function harmonyFace(line, duration) {
    if (world.billboards?.show) world.billboards.show('harmony_face', { line, duration, fade: 1.2 });
    else ui?.sting('Harmony is watching', 'The billboards turn to face you', 'story', 2400);
  }

  // --- story: intro + kiosk -----------------------------------------------------------------------
  const story = createStoryPlayer({
    ui: ui || inertUi(), audio, overlay,
    onFx: (f) => { if (f === 'billboards_face') harmonyFace('GOOD MORNING, HALCYON', 9); },
    onAction: async (a) => {
      if (a.tutorial === 'accept') ui?.toast('Pick a contract', 'info', { sub: 'the gold card is your story', ms: 3500 });
      if (a.marker) G.introMarker = true;
      if (a.openBoard) openContracts();
      if (a.toast) ui?.toast(a.toast, 'story');
    },
  });
  G.story = story;

  async function kioskIntro() {
    G.sim.state.flags.kioskDone = true;
    G.introMarker = false;
    await story.run('intro', 'reachKiosk');
    G.sim.save();
  }

  async function runIntro() {
    G.state = 'intro';
    ui?.hideHud(true);
    player.frozen = true;
    setMusic('story');
    await story.run('intro', 'newGame');
    ui?.hideHud(false);
    G.state = 'free';
    player.frozen = false;
    setMusic('explore');
    log('intro cards done');
    await story.run('intro', 'spawn');
    G.sim.state.flags.introDone = true;
    G.introMarker = true;
    G.sim.save();
    log('intro done');
  }

  // --- mission results --------------------------------------------------------------------------------
  async function onComplete(out) {
    G.contractsDone++;
    log(`complete ${out.mission.id} +${out.credits}cr +${out.xp}xp lvl ${out.levelTo}`);
    audio.sting('win');
    audio.bark('b_mara_success_', { cooldown: 5 });
    G.state = 'results';
    const data = toUiComplete(out, G.sim);
    for (const [i, it] of data.items.entries()) it.better = !!out.items[i]?.upgrade;
    if (ui) await ui.screen('complete', data);
    G.state = 'free';
    const better = out.items.filter((i) => i.upgrade);
    G.coach?.contractDone();
    if (out.items.length) { G.coach?.lootItem(); ui?.loot(out.items.map((i) => ({ ...toUiItem(i), better: !!i.upgrade }))); for (const it of out.items) audio.sfx('loot', { rarity: it.rarity }); }
    // the results card already showed the surcharge; the coach's Warehouse hint covers a first upgrade
    if (better.length && G.coach?.current !== 'warehouse' && G.sim.state.flags.coach?.warehouse) ui?.toast('Upgrade available', 'gold', { sub: 'Tap ▲ EQUIP or open the Warehouse' });
    if (out.clue) ui?.toast('Codex updated', 'story', { sub: out.clue === 'C01' ? 'The Heir-Key' : out.clue });
    if (out.mission.story?.id === 'a1_m1') ui?.sting('The board is yours', 'Random contracts unlocked', 'unlock', 3000);
    G.sim.save();
  }
  function onFail(m, reason) {
    log(`failed ${m?.id} ${reason}`);
    ui?.toast(`Contract failed: ${m?.title || ''}`, 'bad', { sub: reason === 'timeout' ? 'Out of time' : reason === 'alarm' ? 'Alarm raised' : reason === 'wrecked' ? 'Frame wrecked' : '' });
    audio.sting('lose');
    audio.bark('b_mara_fail_', { cooldown: 5 });
  }

  // Goal chip: the next story step first; the sim's "big want" (ECONOMY §7) once the story waits on a level.
  // Hidden during a contract, where the tracker already says what to do.
  function nextGoal(sim) {
    const S = sim.state;
    if (S.contract) return null;
    if (!S.flags.kioskDone) return 'Meet Mara at her kiosk';
    const sc = sim.board()?.story;
    if (sc) return `Story: ${sc.title} · at the board`;
    if (!S.frames.some((f) => !f.rental)) {
      const cost = framePrice(0, { discount: S.flags.firstFrameDiscount }) || 1500;
      return { label: S.player.level < 5 ? 'Own a frame (Lv 5)' : 'Frame licence', cost, progress: Math.min(1, S.credits / cost) };
    }
    return sim.nextGoal();
  }

  // --- session start (after the title) -----------------------------------------------------------
  function startSession(sim) {
    G.sim = sim;
    sim.noAutosave = false;
    const ctx = {
      world, robots: api.robots, sim, fx, audio, ui: ui || inertUi(), tier: api.tier, player, actor, rig, crowd, overlay, story,
      project, losClear, hitPlayer, damagePlayerPct, setCarrying, onLootCollect, onComplete, onFail, nav, walkTo,
      blocked: () => blocked(),
      hitstop: (s) => { G.hitstopT = Math.max(G.hitstopT, s); },
      onDeath: onKill,
      onAlert: () => {},
      onFx: (f) => f === 'billboards_face' && harmonyFace('HARMONY IS WATCHING', 12),
    };
    G.props = ctx.props = createProps(ctx);
    G.enemies = ctx.enemies = createEnemies(ctx);
    G.combat = ctx.combat = createCombat(ctx);
    G.runner = ctx.runner = createRunner(ctx);
    G.hud = createHudSync(ctx);
    ctx.hud = G.hud;
    ctx.goalOverride = () => nextGoal(sim);
    G.coach = ui ? createCoach(G, { ui, rig, player }) : null;
    sim.on('levelUp', (p) => { ui?.sting(`Level ${p.level}`, (p.features || []).map((f) => f.name || f.id).join(' · ') || 'Frame systems upgraded', 'level', 3000); audio.sfx('levelup'); audio.bark('b_hira_levelup_', { cooldown: 10 }); log('level ' + p.level); });
    sim.on('toast', (p) => ui?.toast(p.text, p.kind || 'info'));
    sim.on('rental:fee', (p) => { ui?.toast(`HireFrame shift fee −${p.fee} cr`, 'warn', { sub: p.debt ? `Balance owed: ${p.debt} cr` : 'Rent by the hour!' }); audio.bark('b_hira_fee_', { cooldown: 30 }); log('shift fee ' + p.fee); });
    sim.on('playerDown', () => playerDown('damage over time'));
    sim.on('clue', (p) => log('clue ' + p.id));
    // restore a mid-contract save by restarting that contract from its first step
    const c = sim.state.contract;
    if (c) {
      const m = c.mission;
      sim.state.contract = null;
      const b = sim.board();
      if (m.grade === 'story') b.story = m; else if (!b.cards.some((x) => x.id === m.id)) b.cards.unshift(m);
      setTimeout(() => { if (G.runner.accept(m.id).ok) ui?.toast('Contract resumed', 'info', { sub: m.title }); }, 600);
    }
    wireUi();
    const sp = world.spawnPoints.player;
    player.teleport(sp.x, sp.z, Math.PI);
    rig.fixed = null;
    rig.target.copy(player.pos); rig.snap();
    G.hud.update(0, { objective: null, interactLabel: null });
    if (window.__game) window.__game.sim = sim;
  }

  async function titleFlow() {
    G.state = 'title';
    setMusic('menu');
    if (!ui) { startSession(createSim({ seed: Q.get('seed') || 1, store, sites })); G.state = 'free'; return; }
    const hasSave = store.has() && !Q.has('fresh');
    const act = await ui.screen('title', { hasSave, version: 'P1 · One Good Shift' });
    audio.unlock();
    log('title: ' + act);
    let sim = null;
    if (act === 'continue') { try { sim = loadGame({ store, sites }); } catch (e) { console.warn('load failed', e); } }
    const fresh = !sim;
    if (fresh) { store.clear(); sim = createSim({ seed: Q.get('seed') || String(Date.now() % 100000), store, sites }); }
    startSession(sim);
    if (fresh || !sim.state.flags.introDone) await runIntro();
    else { G.state = 'free'; setMusic('explore'); ui.toast(`Welcome back, ${sim.state.player.name}`, 'info', { sub: `Level ${sim.state.player.level} · ${sim.state.credits} cr` }); }
    if (!sim.state.flags.kioskDone) G.introMarker = true;
  }

  // --- per-frame ----------------------------------------------------------------------------------------
  let stepGap = 0;
  player.onStep = (v) => { if (stepGap <= 0) { audio.sfx('step', { kind: 'rental', x: player.pos.x, z: player.pos.z, vol: v > 3 ? 0.55 : 0.4 }); stepGap = 0.18; } };

  function objective() {
    const o = G.runner?.objective();
    if (o) return o;
    const k = world.spawnPoints.kiosk;
    if (G.introMarker && !G.runner?.active) return { x: k.x, z: k.z, label: 'Mara\'s kiosk' };
    // between contracts the board is always the next place to go
    if (G.sim?.state.flags.kioskDone && !G.sim.state.contract && Math.hypot(k.x - player.pos.x, k.z - player.pos.z) > 6) return { x: k.x, z: k.z, label: 'Contract board' };
    return null;
  }

  function update(rawDt, stick) {
    const dt = rawDt * speedK;
    stepGap -= dt;
    fx.update(dt, world.camera);
    if (G.state === 'title' || G.state === 'boot') {
      titleCam(dt);
      player.update(dt, null);
      audio.setListenerCamera(world.camera, rig.fixed?.look.x || 0, rig.fixed?.look.z || 0);
      audio.update();
      G.auto?.update(dt);
      return;
    }
    const sim = G.sim;
    const paused = panelOpen() || G.state === 'results';
    const pc = sim.playerCombatant();
    if (!paused) {
      if (shiftLen) sim.state.shiftClock += dt * (SHIFT_SECONDS / shiftLen - 1);
      sim.tick(dt, { moving: player.moving });
    }
    if (G.spawnShield > 0 && G.state === 'free') { pc.invulnerable = true; if ((G.spawnShield -= dt) <= 0) pc.invulnerable = false; }
    player.speedMult = (pc.stats.moveSpeed / 4.2) * statusMult(pc, 'moveMult') * (G.carrying === 'case' ? 0.9 : 1);
    const canMove = G.state === 'free' && !panelOpen() && !ui?.dialogue.open && !overlay.cardOpen;
    let hs = 1;
    if (G.hitstopT > 0) { G.hitstopT -= rawDt; hs = 0.15; }
    player.update(dt * (hs < 1 ? 0.5 : 1), canMove ? stick : null);
    if (canMove) G.combat.update(dt, { attackHeld: !!ui?.controls.attackHeld || G.auto?.attackHeld });
    G.enemies.update(dt * hs, { playerDead: G.state === 'down', sneaking: !!ui?.controls.sneak });
    if (!paused && G.state === 'free') G.runner.update(dt);
    G.props.update(dt, player.pos, onLootCollect);

    // interactables near the player
    G.near = null;
    for (const it of world.interactables) if (Math.hypot(it.x - player.pos.x, it.z - player.pos.z) < it.r) G.near = it;
    const lbl = canMove ? (G.runner.interactLabel() || (G.near ? (G.near.id === 'contracts' ? 'Contracts' : G.near.label) : null)) : null;
    if (lbl !== G.lastInteract) { G.lastInteract = lbl; lbl ? ui?.interact.show(lbl) : ui?.interact.hide(); }
    // walk up to the kiosk the first time: Mara opens the board
    if (G.state === 'free' && G.near?.id === 'contracts' && sim.state.flags.introDone && !sim.state.flags.kioskDone && !story.busy) kioskIntro();

    G.hud.update(dt, { objective: G.state === 'free' ? objective() : null, show: G.state !== 'intro' });

    // music + civilians react to fights
    const fighting = G.fighting = G.enemies.hostileNear(player.pos.x, player.pos.z, 26);
    if (G.kills) G.coach?.finish('attack');
    G.coach?.update(dt);
    if (!panelOpen() && G.state === 'free') setMusic(fighting ? 'combat' : 'explore');
    if (fighting && crowd?.scare) crowd.scare(player.pos.x, player.pos.z, 16);
    // Harmony PA every ~90 s of free roaming
    if (G.state === 'free' && !fighting && !story.busy && (G.paT -= dt) <= 0) { G.paT = 80 + Math.random() * 30; audio.bark('pa_', { cooldown: 60 }); }
    if ((G.autosaveT -= dt) <= 0 && G.state === 'free') { G.autosaveT = 30; sim.save(); }

    overlay.suppress(!!(ui?.root?.classList.contains('hf-in-dialogue') || panelOpen() || ui?.root?.classList.contains('hf-in-screen')));
    audio.setListenerCamera(world.camera, player.pos.x, player.pos.z);
    audio.update();
    G.auto?.update(dt);
  }

  G.update = update;
  G.tapWorld = (x, y) => tapAt(x, y);
  G.walkTo = walkTo;
  G.nav = nav;
  G.snapshot = () => {
    const S = G.sim?.state;
    return {
      state: G.state, panel: ui?.panel.current || null, dialogue: !!ui?.dialogue.open, level: S?.player.level, xp: S?.player.xp, credits: S?.credits,
      contract: S?.contract ? { id: S.contract.mission.id, arch: S.contract.mission.archetype, step: S.contract.stepIndex, type: G.runner.active?.step?.type } : null,
      done: S?.stats.contractsDone, kills: S?.stats.kills, hp: G.sim ? Math.round(G.sim.playerCombatant().hp) : null,
      enemies: G.enemies ? G.enemies.alive().length : 0, stash: S?.stash.length, weapon: S ? G.sim.activeFrame().equipped.weapon : null,
      fr: G.sim ? G.sim.frameFR() : null, flags: S?.flags, pos: [+player.pos.x.toFixed(1), +player.pos.z.toFixed(1)], auto: G.auto?.phase,
    };
  };
  Object.defineProperty(G, 'loadout', { get: () => G.sim?.activeFrame().equipped });
  Object.defineProperty(player, 'loadout', { get: () => G.sim?.activeFrame().equipped || null, configurable: true });

  if (flags.auto) G.auto = createAutopilot(G, { ui, world, player, input });
  titleFlow().catch((e) => { console.error('title flow failed', e); });
  return G;
}
