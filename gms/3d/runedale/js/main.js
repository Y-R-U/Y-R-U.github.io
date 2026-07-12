// Boot + orchestration for "Runedale". Loads the protected asset pack, builds
// the world / towns / creatures, wires the event bus that connects player ↔
// interaction ↔ tutorial ↔ UI, runs the game loop, and handles the shared
// bank, player-lit fires, the tutorial beacon, collision and save/load.

import * as THREE from 'three';
import { CFG, SHOT, LITE, AUTO, NOSAVE, SKIPTUT, SITES, TOWNS } from './config.js';
import { clamp, rand, pick, unlockAudio, chime, makeNameSprite } from './utils.js';
import { liveColliders } from './registry.js';
import { initAssets, model as loadModel } from './assets.js';
import { initHero, makeHumanoid } from './hero.js';
import { buildWorld } from './world.js';
import { buildWorldObjects } from './worldobj.js';
import { createPlayer } from './player.js';
import { makeCreature } from './creatures.js';
import { createInteraction } from './interact.js';
import { createTutorial } from './tutorial.js';
import { createControls } from './controls.js';
import { initFx, tickFx } from './fx.js';
import { ITEMS } from './items.js';
import { XP } from './skills.js';
import * as ui from './ui.js';

window.__errors = [];
addEventListener('error', e => window.__errors.push(String(e.message)));
addEventListener('unhandledrejection', e => window.__errors.push(String(e.reason)));

// ── renderer / scene / camera ──
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, LITE ? 1.4 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
if (!LITE) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
document.getElementById('game-container').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 700);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

const SAVE_KEY = 'runedale_save_v1';

boot();

async function boot() {
  try {
    ui.setBoot('decoding asset pack…', 0.1);
    await initAssets(renderer, s => ui.setBoot(s));
    ui.setBoot('waking the hero…', 0.35);
    await initHero();
    ui.setBoot('raising Runedale…', 0.55);
    start();
  } catch (e) {
    window.__errors.push('boot: ' + e);
    ui.setBoot('failed to load: ' + e.message, 0);
    console.error(e);
  }
}

let game = null;
function start() {
  initFx(scene);
  const world = buildWorld(scene, renderer);

  // player rig + state
  const rig = makeHumanoid({ withCombat: true });
  scene.add(rig.group);
  const bus = {};
  const player = createPlayer(rig, world, scene, bus);

  ui.setBoot('building the towns…', 0.72);
  const worldObjs = buildWorldObjects(scene, world);

  // ── the shared bank (one vault behind every bank chest/building) ──
  const bank = { items: {} };   // id -> count
  function deposit(id, qty) {
    const have = player.countItem(id);
    const n = qty === 'all' ? have : Math.min(qty, have);
    if (n <= 0) return;
    player.removeItem(id, n);
    bank.items[id] = (bank.items[id] || 0) + n;
    ui.renderBank();
    document.querySelector('#panel-bank').classList.remove('hidden');
    tutorial.event('bank');
  }
  function withdraw(id, qty) {
    const have = bank.items[id] || 0;
    const n = qty === 'all' ? have : Math.min(qty, have);
    if (n <= 0) return;
    const got = player.addItem(id, n);
    if (got > 0) { bank.items[id] -= got; if (bank.items[id] <= 0) delete bank.items[id]; }
    ui.renderBank();
    document.querySelector('#panel-bank').classList.remove('hidden');
  }
  function depositAll() {
    let moved = false;
    for (const s of [...player.items]) { bank.items[s.id] = (bank.items[s.id] || 0) + s.n; moved = true; }
    if (!moved) return;
    player.items.length = 0;
    bus.invChanged?.();
    ui.renderBank();
    document.querySelector('#panel-bank').classList.remove('hidden');
    tutorial.event('bank');
  }

  // ── NPCs (same rig, tinted) ──
  const npcs = [];
  function addNpc(x, z, tint, name, faceY, interact) {
    const n = makeHumanoid({ tint, withCombat: false });
    n.group.position.set(x, world.groundHeight(x, z), z); n.group.rotation.y = faceY;
    n.group.add(makeNameSprite(name, 2.1));
    scene.add(n.group); npcs.push(n);
    if (interact) {
      interact.pos = new THREE.Vector3(x, world.groundHeight(x, z), z);
      interact.range = interact.range || 3.0;
      worldObjs.interactables.push(interact);
      n.group.userData.interact = interact; interact.object = n.group;
      worldObjs.targets.push(n.group);
    }
    return n;
  }
  const elder = addNpc(SITES.elder.x, SITES.elder.z, 0x9fb6ff, 'Elder Wick', 2.6,
    { kind: 'talk', npc: 'elder', verb: '💬 Talk to Elder Wick' });
  addNpc(SITES.store.x + 1.6, SITES.store.z + 0.6, 0xffd0a0, 'Shopkeeper', -1.4,
    { kind: 'shop', verb: '🛒 Trade with the Shopkeeper' });
  addNpc(SITES.bank.x + 6.5, SITES.bank.z + 2, 0xd9c8ff, 'Banker', -1.8,
    { kind: 'bank', verb: '🏦 Bank with the Banker' });
  addNpc(SITES.smithy.x - 2, SITES.smithy.z + 2.5, 0xffb0a0, 'Smith', 0.4,
    { kind: 'talk', npc: 'smith', verb: '💬 Talk to the Smith' });
  addNpc(SITES.dock.x - 3, SITES.dock.z + 3, 0xa0e8ff, 'Fisherman', 1.2,
    { kind: 'talk', npc: 'fisherman', verb: '💬 Talk to the Fisherman' });

  // ── creatures ──
  const creatures = [];
  const spawnList = [];
  const P = SITES.ratPen;
  for (let i = 0; i < 3; i++) spawnList.push(['rat', P.x + rand(-2, 2), P.z + rand(-2, 2)]);
  for (let i = 0; i < 3; i++) spawnList.push(['hen', SITES.spawn.x + rand(-8, 8), SITES.spawn.z + rand(-4, 6)]);
  const Pa = SITES.pasture;
  for (let i = 0; i < 4; i++) spawnList.push(['cow', Pa.x + rand(-5, 5), Pa.z + rand(-5, 5)]);
  for (let i = 0; i < 3; i++) spawnList.push(['sheep', -18 + rand(-5, 5), -8 + rand(-5, 5)]);
  for (let i = 0; i < 3; i++) spawnList.push(['hen', SITES.well.x + rand(-8, 8), SITES.well.z + rand(4, 10)]);
  const G = TOWNS.goblincamp;
  for (let i = 0; i < 5; i++) spawnList.push(['goblin', G.x + rand(-8, 8), G.z + rand(-7, 7)]);
  for (let i = 0; i < 2; i++) spawnList.push(['rat', SITES.forest.x + rand(-8, 8), SITES.forest.z + rand(-8, 8)]);
  for (const [t, x, z] of spawnList) { const c = makeCreature(t, x, z, scene, world, bus); creatures.push(c); }

  // static collision shapes (props are placed synchronously)
  const worldCircles = liveColliders().filter(e => e.collider.r).map(e => ({ x: e.object.position.x, z: e.object.position.z, r: e.collider.r }));
  const worldBoxes = liveColliders().filter(e => e.collider.box).map(e => ({ x: e.object.position.x, z: e.object.position.z, ...e.collider.box }));

  // ── interaction + tutorial ──
  const interaction = createInteraction(player, world, () => worldObjs.interactables, bus);
  const tutorial = createTutorial(player, bus, () => worldObjs.poi);
  ui.bindData(player, tutorial, bank);

  // ── tutorial beacon: a glowing pillar + bobbing arrow over the objective ──
  const beacon = new THREE.Group();
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.65, 5, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x69e0ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  pillar.position.y = 2.5; pillar.material.userData.noWire = true;
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 4),
    new THREE.MeshBasicMaterial({ color: 0x8fe8ff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
  arrow.rotation.x = Math.PI; arrow.material.userData.noWire = true;
  const bring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.95, 24).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x69e0ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
  bring.material.userData.noWire = true;
  beacon.add(pillar, arrow, bring);
  beacon.visible = false;
  scene.add(beacon);
  let beaconTarget = null;
  function resolveBeacon() {
    const t = tutorial.beaconTarget();
    if (!t) return null;
    if (t === 'elder') return elder.group.position;
    if (t === 'rat') { const r = creatures.find(c => c.type === 'rat' && c.alive); return r ? r.group.position : null; }
    return t.pos || null;
  }

  // ── player-lit fires (firemaking) ──
  const fires = [];
  function lightFire() {
    if (!player.hasItem('tinderbox')) return ui.toast('🔥 You need a tinderbox.');
    const oak = !player.hasItem('logs') && player.hasItem('oak_logs');
    const logId = oak ? 'oak_logs' : 'logs';
    if (!player.removeItem(logId, 1)) return ui.toast('🪵 You need logs to burn.');
    const x = player.pos.x, z = player.pos.z, y = player.heightAt(x, z);
    const holder = new THREE.Group(); holder.position.set(x, y, z); scene.add(holder);
    loadModel('fire').then(m => { m.scale.setScalar(1.3); holder.add(m); });
    const light = new THREE.PointLight(0xff8a3a, 2.2, 9, 2); light.position.y = 0.8; holder.add(light);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.7, 8), new THREE.MeshBasicMaterial({ color: 0xffb24a, transparent: true, opacity: 0.9 }));
    flame.material.userData.noWire = true; flame.position.y = 0.7; holder.add(flame);
    const it = { kind: 'cook', verb: '🍳 Cook on your fire', pos: new THREE.Vector3(x, y, z), range: 2.8 };
    worldObjs.interactables.push(it);
    fires.push({ holder, light, flame, it, ttl: 90 });
    player.addXp('firemaking', XP.burn[logId]);
    ui.toast('🔥 You light a crackling fire.');
    chime(300);
    tutorial.event('fire');
  }

  // ── NPC chatter ──
  const CHATTER = {
    smith: ['Smith', ['Bronze is copper and tin — smelt at the furnace, hammer at my anvil.',
      'Iron\'s trickier: Stonefell Mine up north has the ore, but half of it crumbles unless your Smithing is up to it.']],
    fisherman: ['Fisherman', ['Shrimp practically jump into a net. Trout want a rod — and Fishing level 20.',
      'Cook your catch on any fire. Mind you don\'t burn it, eh?']],
  };
  function talk(it) {
    if (it.npc === 'elder') {
      if (tutorial.active) {
        const wasTalkStep = tutorial.stepId === 'talk';
        tutorial.event('talk', { tag: 'elder' });
        if (!wasTalkStep) tutorial.startStep(true);   // repeat the current instructions
      }
      else ui.dialogue('Elder Wick', ['Fine adventuring, friend! Ashford lies north over the ford; Milbrook east along the river.', 'The goblins to the north-west could use thinning, if your blade is sharp…']);
      return;
    }
    const c = CHATTER[it.npc];
    if (c) ui.dialogue(c[0], c[1]);
  }

  // ── event bus wiring ──
  Object.assign(bus, {
    toast: ui.toast,
    prompt: ui.prompt,
    channel: ui.channel,
    dialogue: ui.dialogue,
    xpDrop: ui.xpDrop,
    tracker: ui.setTracker,
    beacon: () => { },                    // beacon repositions itself each frame
    levelUp: (s, l) => { ui.levelUp(s, l); chime(880); tutorial.event('levelup'); },
    hurt: () => { ui.hurtFlash(); chime(160); },
    sfx: (n) => chime(n === 'chop' ? 300 : n === 'pick' ? 760 : 600),
    celebrate: () => chime(990),
    invChanged: () => ui.refreshOpenPanels(),
    skillsChanged: () => ui.refreshOpenPanels(),
    questsChanged: () => ui.refreshOpenPanels(),
    hpChanged: () => { },
    runChanged: () => { },
    openShop: () => ui.openShop(),
    openBank: () => ui.openBank(),
    openSmelt: () => ui.openSmelt(),
    openSmith: () => ui.openSmith(),
    lightFire, talk,
    chopped: (it) => tutorial.event('chop', { tag: it.tree }),
    mined: (it) => tutorial.event('mine', { tag: it.ore }),
    fished: (id) => tutorial.event('fish', { tag: id }),
    cooked: (id) => tutorial.event('cook', { tag: id }),
    ate: (id) => tutorial.event('eat', { tag: id }),
    smelted: (id) => tutorial.event('smelt', { tag: id }),
    smithed: (id) => tutorial.event('smith', { tag: id }),
    equipped: (id) => tutorial.event('equip', { tag: id }),
    kill: (c) => tutorial.event('kill', { tag: c.type }),
    loot: (c, drops) => {
      for (const d of drops) {
        if (d.gold) { player.gainGold(d.gold); ui.toast(`🪙 +${d.gold} coins`); }
        if (d.id) { if (player.addItem(d.id, 1)) ui.toast(`${ITEMS[d.id].icon} +1 ${ITEMS[d.id].name}`); }
      }
    },
    died: () => ui.showDeath(`You had ${player.gold} coins and ${player.items.reduce((a, s) => a + s.n, 0)} items — all safe.`),
  });

  // ── controls ──
  const markers = [];
  function spawnMarker(p) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.36, 22).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x9aff6a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.material.userData.noWire = true;
    ring.position.set(p.x, player.heightAt(p.x, p.z) + 0.06, p.z);
    scene.add(ring); markers.push({ ring, age: 0 });
  }
  let autoTarget = null, autoTargetT = 0;   // tapped interactable: walk to it then auto-trigger
  const controls = createControls({
    camera, dom: renderer.domElement, player,
    getGround: () => world.ground,
    clampPoint: (p) => player.clampPos(p),
    attackables: () => creatures.filter(c => c.alive).map(c => c.group),
    interactTargets: () => worldObjs.targets,
    onTapGround: (p) => { unlockAudio(); autoTarget = null; player.setTarget(p); spawnMarker(p); },
    onTapCreature: (c) => { unlockAudio(); autoTarget = null; player.attackCreature(c); },
    onTapInteract: (it) => { unlockAudio(); autoTarget = it; autoTargetT = 12; player.setTarget(it.pos); spawnMarker(it.pos); },
  });

  // ── HUD actions ──
  ui.initUi(player, {
    interact: () => { unlockAudio(); interaction.trigger(); },
    eatBest: () => { const f = bestFood(); if (f) player.eat(f); else ui.toast('🍽️ No food in your pack.'); },
    toggleRun: () => player.toggleRun(),
    useItem: (id) => {
      const d = ITEMS[id];
      if (d.heal) player.eat(id);
      else if (d.cat === 'weapon') player.equip(id);
      else if (id === 'tinderbox') { ui.closeAllPanels(); lightFire(); }
      else if (d.cat === 'tool') ui.toast(`${d.icon} ${d.name} — used automatically when you gather.`);
      else ui.toast(`${d.icon} ${d.name} — worth ${d.value}🪙 at the store.`);
    },
    buyItem: (id) => { const d = ITEMS[id]; if (player.gold < d.value) return ui.toast('🪙 Not enough coins.'); if (player.addItem(id, 1)) { player.spendGold(d.value); ui.toast(`🛒 Bought ${d.name}`); ui.renderShop(); document.querySelector('#panel-shop').classList.remove('hidden'); } },
    sellItem: (id, price) => { if (player.removeItem(id, 1)) { player.gainGold(price); ui.toast(`💰 Sold ${ITEMS[id].name} (+${price}🪙)`); ui.renderShop(); document.querySelector('#panel-shop').classList.remove('hidden'); } },
    deposit, withdraw, depositAll,
    smelt: (r) => interaction.smelt(r),
    smith: (r) => interaction.smith(r),
    skipTutorial: () => tutorial.skip(),
    restart: () => player.respawn(),
  });
  function bestFood() { let best = null, bv = 0; for (const s of player.items) { const d = ITEMS[s.id]; if (d?.heal && d.heal > bv) { bv = d.heal; best = s.id; } } return best; }

  // keyboard shortcuts
  addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (k === 'e' || k === ' ') { unlockAudio(); interaction.trigger(); }
    else if (k === 'i') { const el = document.querySelector('#panel-inv'); if (el.classList.contains('hidden')) { ui.closeAllPanels(); ui.renderInventory(); el.classList.remove('hidden'); } else el.classList.add('hidden'); }
    else if (k === 'f') { const f = bestFood(); if (f) player.eat(f); }
    else if (k === 'r') player.toggleRun();
  });

  // ── load / fresh ──
  const saved = !NOSAVE && load();
  if (!saved) {
    tutorial.load(null);
    setTimeout(() => ui.toast('🌄 Welcome to Runedale. Follow the beacon!'), 700);
  }
  if (SKIPTUT && tutorial.active) tutorial.skip();
  setInterval(save, 8000);
  addEventListener('visibilitychange', () => { if (document.hidden) save(); });

  function save() {
    if (!player.alive) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ p: player.serialize(), bank: bank.items, tut: tutorial.serialize() })); } catch { }
  }
  function load() {
    let d; try { d = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return false; }
    if (!d) return false;
    player.load(d.p);
    bank.items = d.bank || {};
    tutorial.load(d.tut);
    ui.toast('💾 Welcome back.');
    return true;
  }

  // shot mode: frame Bramblewick green
  if (SHOT) { document.body.classList.add('shot-mode'); player.pos.set(4, 0, 64); controls.state.yaw = -0.85; controls.state.pitch = 0.52; controls.state.dist = 15; }

  ui.setBoot('ready', 1);
  setTimeout(ui.hideBoot, 250);

  // ── loop ──
  const clock = new THREE.Clock();
  let t = 0, fps = 60, frames = 0, fpsT = 0, frameCount = 0, visitT = 0;
  function loop() {
    requestAnimationFrame(loop);
    let dt = clamp(clock.getDelta(), 0, 0.05);
    frames++; fpsT += dt; if (fpsT >= 0.5) { fps = frames / fpsT; frames = 0; fpsT = 0; }
    t += dt;

    if (AUTO) autoTick(dt);
    player.update(dt, t, controls.keyDir());
    resolveCollisions();
    interaction.update(dt, t);
    // tap-to-interact: once we've walked into range of the tapped object, do it
    if (autoTarget) {
      autoTargetT -= dt;
      const d = Math.hypot(player.pos.x - autoTarget.pos.x, player.pos.z - autoTarget.pos.z);
      if (d <= (autoTarget.range || 2.6)) { player.stop(); interaction.trigger(); autoTarget = null; }
      else if (autoTargetT <= 0 || (!player.target && !player.attackTarget)) autoTarget = null;   // blocked / timed out
    }
    for (const c of creatures) c.update(dt, t, player);
    for (const n of npcs) n.animate(t, 0);
    worldObjs.tick(dt, t);
    world.tick(dt, t);
    tickFx(dt);

    // player fires: flicker + burn out
    for (let i = fires.length - 1; i >= 0; i--) {
      const f = fires[i];
      f.ttl -= dt;
      const fl = 0.8 + Math.sin(t * 14 + f.holder.position.x) * 0.2;
      f.light.intensity = 2 * fl; f.flame.scale.set(1, fl, 1);
      if (f.ttl <= 0) {
        scene.remove(f.holder);
        const ix = worldObjs.interactables.indexOf(f.it); if (ix >= 0) worldObjs.interactables.splice(ix, 1);
        fires.splice(i, 1);
      }
    }

    // tutorial beacon follows its (possibly moving) target
    const bt = resolveBeacon();
    beacon.visible = !!bt;
    if (bt) {
      beacon.position.set(bt.x, player.heightAt(bt.x, bt.z), bt.z);
      arrow.position.y = 3.3 + Math.sin(t * 3) * 0.25;
      arrow.rotation.y = t * 1.6;
      bring.scale.setScalar(1 + Math.sin(t * 3) * 0.12);
      pillar.material.opacity = 0.16 + Math.sin(t * 2.2) * 0.06;
    }

    // town visit detection (achievements)
    visitT -= dt;
    if (visitT <= 0) {
      visitT = 0.5;
      for (const key of ['ashford', 'milbrook']) {
        const tw = TOWNS[key];
        if (Math.hypot(player.pos.x - tw.x, player.pos.z - tw.z) < tw.r) tutorial.event('visit', { tag: key });
      }
    }

    // sun follows player for crisp shadows
    if (!LITE) { world.sun.position.set(player.pos.x + CFG.sunDir[0], CFG.sunDir[1], player.pos.z + CFG.sunDir[2]); world.sunTarget.position.copy(player.pos); }

    // tap markers
    for (let i = markers.length - 1; i >= 0; i--) { const m = markers[i]; m.age += dt; const k = m.age / 0.7; m.ring.scale.setScalar(1 - k * 0.5); m.ring.material.opacity = 0.9 * (1 - k); if (k >= 1) { scene.remove(m.ring); markers.splice(i, 1); } }

    ui.bars(player);
    controls.tick(dt);
    renderer.render(scene, camera);
    frameCount++;
    if (SHOT && frameCount === 10) window.__shotReady = true;
  }
  loop();

  // ── collision ──
  function resolveCollisions() {
    const px = player.pos;
    for (const cc of worldCircles) {
      const minD = cc.r + CFG.playerRadius;
      const dx = px.x - cc.x, dz = px.z - cc.z, d = Math.hypot(dx, dz);
      if (d < minD && d > 1e-5) { px.x = cc.x + (dx / d) * minD; px.z = cc.z + (dz / d) * minD; }
    }
    for (const b of worldBoxes) {        // axis-aligned box pushout
      const pr = CFG.playerRadius;
      const minX = b.x - b.hx - pr, maxX = b.x + b.hx + pr, minZ = b.z - b.hz - pr, maxZ = b.z + b.hz + pr;
      if (px.x <= minX || px.x >= maxX || px.z <= minZ || px.z >= maxZ) continue;
      const dl = px.x - minX, dr = maxX - px.x, dd = px.z - minZ, du = maxZ - px.z;
      const m = Math.min(dl, dr, dd, du);
      if (m === dl) px.x = minX; else if (m === dr) px.x = maxX; else if (m === dd) px.z = minZ; else px.z = maxZ;
    }
  }

  // ── auto soak ──
  let autoT = 0;
  function autoTick(dt) {
    autoT -= dt; if (autoT > 0 || player.attackTarget) return; autoT = rand(2, 4);
    const near = creatures.filter(c => c.alive && Math.hypot(c.group.position.x - player.pos.x, c.group.position.z - player.pos.z) < 40);
    const roll = Math.random();
    if (roll < 0.5 && near.length) player.attackCreature(pick(near));
    else { const a = rand(0, 6.28), r = rand(6, 30); const p = new THREE.Vector3(player.pos.x + Math.cos(a) * r, 0, player.pos.z + Math.sin(a) * r); player.clampPos(p); player.setTarget(p); }
  }

  // ── test hooks ──
  game = { player, world, controls, tutorial, interaction, creatures, worldObjs, bank, scene, camera, lightFire };
  window.__game = game;
  window.__state = {
    get fps() { return Math.round(fps); }, get pos() { return { x: +player.pos.x.toFixed(1), z: +player.pos.z.toFixed(1) }; },
    get hp() { return Math.ceil(player.hp); }, get maxHp() { return player.maxHp; },
    get gold() { return player.gold; }, get energy() { return Math.round(player.energy); },
    get levels() { return player.levels(); }, get totalLevel() { return player.totalLevel(); },
    get items() { return player.items.map(s => `${s.id}×${s.n}`); },
    get bank() { return { ...bank.items }; },
    get step() { return tutorial.stepId; },
    get creatures() { return creatures.map(c => `${c.type}:${c.alive ? Math.ceil(c.hp) : 'dead'}`); },
    get errors() { return window.__errors; },
  };
  window.__camera = camera;
}
