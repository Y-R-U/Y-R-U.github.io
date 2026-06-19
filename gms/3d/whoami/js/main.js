// Boot + orchestration for "Who Am I". Loads the protected asset pack, builds
// the world / village / creatures / dungeon, wires the event bus that connects
// player ↔ interaction ↔ quests ↔ UI, runs the game loop, handles area
// switching (overworld ⇄ dungeon), collision, save/load and the HUD actions.

import * as THREE from 'three';
import { CFG, SHOT, LITE, AUTO, NOSAVE, SITES } from './config.js';
import { clamp, rand, pick, unlockAudio, chime, makeNameSprite } from './utils.js';
import { registry, register, liveColliders } from './registry.js';
import { initAssets, model as loadModel } from './assets.js';
import { initHero, makeHumanoid } from './hero.js';
import { buildWorld } from './world.js';
import { buildWorldObjects } from './worldobj.js';
import { createPlayer } from './player.js';
import { makeCreature } from './creatures.js';
import { buildDungeon } from './dungeon.js';
import { createInteraction } from './interact.js';
import { createQuests } from './quests.js';
import { createControls } from './controls.js';
import { initFx, tickFx } from './fx.js';
import { ITEMS } from './items.js';
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
const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 600);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

const SAVE_KEY = 'whoami_save_v1';

boot();

async function boot() {
  try {
    ui.setBoot('decoding asset pack…', 0.1);
    await initAssets(renderer, s => ui.setBoot(s));
    ui.setBoot('loading the hero…', 0.35);
    await initHero();
    ui.setBoot('growing the world…', 0.55);
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
  // overworld clamp = walkable disc + keep out of the deep river channel
  const discClamp = player.clampPos;
  player.clampPos = (v) => { discClamp(v); world.riverBlock(v); };
  const overArea = { heightAt: player.heightAt, clampPos: player.clampPos };

  ui.setBoot('raising the village…', 0.7);
  const worldObjs = buildWorldObjects(scene, world);
  const dungeon = buildDungeon(scene);
  const dungArea = { heightAt: dungeon.heightAt, clampPos: dungeon.clampPos };

  // NPCs: guide + shopkeeper (same rig, tinted, idle)
  const npcs = [];
  function addNpc(x, z, tint, name, faceY = 0) {
    const n = makeHumanoid({ tint, withCombat: false });
    n.group.position.set(x, world.groundHeight(x, z), z); n.group.rotation.y = faceY;
    n.group.add(makeNameSprite(name, 2.1));
    scene.add(n.group); npcs.push(n);
    return n;
  }
  addNpc(SITES.guide.x, SITES.guide.z, 0x9fb6ff, 'Sage', 2.4);
  const shopkeeper = addNpc(SITES.store.x + 1.4, SITES.store.z + 0.4, 0xffd0a0, 'Shopkeeper', -1.2);
  const storeIt = worldObjs.interactables.find(i => i.kind === 'store');
  if (storeIt) { shopkeeper.group.userData.interact = storeIt; worldObjs.targets.push(shopkeeper.group); }

  // creatures (overworld)
  const overCreatures = [];
  const spawnList = [];
  for (let i = 0; i < 6; i++) spawnList.push(['hen', SITES.meadow.x + rand(-8, 8), SITES.meadow.z + rand(-8, 8)]);
  for (let i = 0; i < 6; i++) spawnList.push(['rat', SITES.meadow.x + rand(-10, 10), SITES.meadow.z + rand(-10, 10)]);
  for (let i = 0; i < 3; i++) spawnList.push(['hen', SITES.spawn.x + rand(-6, 6), SITES.spawn.z + rand(-6, 6)]);
  for (let i = 0; i < 3; i++) spawnList.push(['rat', SITES.orchard.x + rand(-6, 6), SITES.orchard.z + rand(-6, 6)]);
  for (const [t, x, z] of spawnList) { const c = makeCreature(t, x, z, scene, world, bus); c.group.userData.creature = c; overCreatures.push(c); }

  // dungeon creatures (spawned lazily on first entry)
  const dungCreatures = [];
  function spawnDungeon() {
    if (dungCreatures.length) return;
    // dungeon monsters sit on the flat crypt floor, not the overworld hills at x≈400
    const floorY = () => dungeon.floorY;
    for (const s of dungeon.spawns) { const c = makeCreature(s.type, s.x, s.z, scene, world, bus, floorY); c.group.userData.creature = c; dungCreatures.push(c); }
  }

  // static collision shapes for overworld props (props are placed synchronously)
  const worldCircles = liveColliders().filter(e => e.collider.r).map(e => ({ x: e.object.position.x, z: e.object.position.z, r: e.collider.r }));
  const worldBoxes = liveColliders().filter(e => e.collider.box).map(e => ({ x: e.object.position.x, z: e.object.position.z, ...e.collider.box }));

  // ── area state ──
  let area = 'over';
  const chestInteract = { kind: 'chest', verb: '🪙 Open the treasure chest', pos: dungeon.chest.pos.clone(), range: 2.8 };
  const dungeonInteractables = [
    { kind: 'leave_dungeon', verb: '🚪 Leave the dungeon', pos: dungeon.portalPos.clone(), range: 2.8 },
    chestInteract,
  ];
  const getInteractables = () => area === 'dungeon' ? dungeonInteractables : worldObjs.interactables;
  const activeCreatures = () => area === 'dungeon' ? dungCreatures : overCreatures;
  // tappable interactable holders per area
  dungeon.portal.userData.interact = dungeonInteractables[0];   // "leave"
  const getInteractTargets = () => {
    if (area !== 'dungeon') return worldObjs.targets;
    if (dungeon.chest.group) dungeon.chest.group.userData.interact = chestInteract;  // tag once loaded
    return [dungeon.portal, dungeon.chest.opened ? null : dungeon.chest.group].filter(Boolean);
  };

  const overFog = scene.fog, overBg = scene.background;
  function toggleDungeon() {
    interaction.cancel(); ui.channel(null); ui.prompt(null);
    if (area === 'over') {
      area = 'dungeon'; spawnDungeon();
      player.setArea(dungArea); player.pos.copy(dungeon.entryPos); player.stop();
      dungeon.root.visible = true;
      scene.fog = new THREE.Fog(0x05060a, 6, 42); scene.background = new THREE.Color(0x05060a);
      world.sun.visible = false; world.sky.visible = false; if (world.water) world.water.visible = false;
      quests.event('enter_dungeon');
      ui.toast('🕳️ You descend into the crypt…');
    } else {
      area = 'over';
      player.setArea(overArea); player.pos.set(SITES.dungeon.x, 0, SITES.dungeon.z + 4); player.stop();
      dungeon.root.visible = false;
      scene.fog = overFog; scene.background = overBg; world.sun.visible = true; world.sky.visible = true; if (world.water) world.water.visible = true;
      ui.toast('☀️ You climb back into daylight.');
    }
  }

  // ── interaction + quests ──
  const interaction = createInteraction(player, world, getInteractables, bus);
  const quests = createQuests(player, bus);
  ui.bindData(player, quests);

  // ── event bus wiring ──
  Object.assign(bus, {
    toast: ui.toast,
    prompt: ui.prompt,
    channel: ui.channel,
    styleChanged: ui.setStyleActive,
    levelUp: (s, l) => { ui.levelUp(s, l); chime(880); },
    hurt: () => { ui.hurtFlash(); chime(160); },
    tracker: ui.setTracker,
    sfx: (n) => chime(n === 'chop' ? 300 : n === 'pick' ? 760 : 600),
    celebrate: () => chime(990),
    invChanged: () => ui.refreshOpenPanels(),
    skillsChanged: () => ui.refreshOpenPanels(),
    hpChanged: () => { },
    questsChanged: () => ui.refreshOpenPanels(),
    openShop: () => ui.openShop(),
    toggleDungeon,
    openChest,
    ate: () => quests.event('eat'),
    fished: () => quests.event('fish'),
    cooked: () => quests.event('cook'),
    chopped: () => quests.event('chop'),
    kill: (c) => quests.event('kill', { tag: c.type }),
    loot: (c, drops) => {
      for (const d of drops) {
        if (d.gold) { player.gainGold(d.gold); ui.toast(`🪙 +${d.gold} gold`); }
        if (d.id) { player.addItem(d.id, 1); ui.toast(`${ITEMS[d.id].icon} +1 ${ITEMS[d.id].name}`); }
      }
    },
    died: () => ui.showDeath(`You fell with ${player.gold} gold and ${player.items.reduce((a, s) => a + s.n, 0)} items.`),
  });

  function openChest(it) {
    if (dungeon.chest.opened) return ui.toast('The chest is empty.');
    dungeon.chest.opened = true;
    const gold = Math.round(rand(40, 90));
    player.gainGold(gold); ui.toast(`🪙 +${gold} gold from the chest!`);
    for (const [id, ch] of [['gem', 0.8], ['gems', 0.4], ['hpotion', 0.6], ['gold_bar', 0.3]]) if (Math.random() < ch) { player.addItem(id, 1); ui.toast(`${ITEMS[id].icon} +1 ${ITEMS[id].name}`); }
    quests.event('loot_chest');
    const i = dungeonInteractables.indexOf(chestInteract); if (i >= 0) dungeonInteractables.splice(i, 1);
    if (dungeon.chest.group) dungeon.chest.group.rotation.x = -0.5;
    chime(990);
  }

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
    getGround: () => area === 'dungeon' ? dungeon.floor : world.ground,
    clampPoint: (p) => player.clampPos(p),   // area's own clamp (disc+river / dungeon box)
    attackables: () => activeCreatures().filter(c => c.alive).map(c => c.group),
    interactTargets: getInteractTargets,
    onTapGround: (p) => { unlockAudio(); autoTarget = null; player.setTarget(p); spawnMarker(p); },
    onTapCreature: (c) => { unlockAudio(); autoTarget = null; player.attackCreature(c); },
    onTapInteract: (it) => { unlockAudio(); autoTarget = it; autoTargetT = 9; player.setTarget(it.pos); spawnMarker(it.pos); },
  });

  // ── HUD actions ──
  ui.initUi(player, {
    setStyle: (s) => player.setStyle(s),
    interact: () => { unlockAudio(); interaction.trigger(); },
    eatBest: () => { const f = bestFood(); if (f) player.eat(f); else ui.toast('🍽️ No food to eat.'); },
    useItem: (id) => {
      const d = ITEMS[id];
      if (d.cat === 'food' || d.cat === 'potion') player.eat(id);
      else if (d.cat === 'weapon') player.equip(id);
      else if (id === 'tinderbox') lightFire();
      else if (id === 'waterskin') ui.toast(player.water > 95 ? '🍶 Your waterskin is full.' : '🍶 Find a river or well to refill.');
      else ui.toast(`${d.icon} ${d.name} — worth ${d.value}🪙`);
    },
    buyItem: (id) => { const d = ITEMS[id]; if (player.spendGold(d.value)) { player.addItem(id, 1); ui.toast(`🛒 Bought ${d.name}`); ui.renderShop(); document.querySelector('#panel-shop').classList.remove('hidden'); } else ui.toast('🪙 Not enough gold.'); },
    sellItem: (id, price) => { if (player.removeItem(id, 1)) { player.gainGold(price); ui.toast(`💰 Sold ${ITEMS[id].name} (+${price}🪙)`); ui.renderShop(); document.querySelector('#panel-shop').classList.remove('hidden'); } },
    restart: () => { if (area === 'dungeon') toggleDungeon(); player.respawn(); },
  });
  function bestFood() { let best = null, bv = 0; for (const s of player.items) { const d = ITEMS[s.id]; if (d?.food && d.food > bv) { bv = d.food; best = s.id; } } return best; }

  // firemaking: a tinderbox + a log lights a campfire you can cook on (no skill)
  function lightFire() {
    if (!player.hasItem('tinderbox')) return ui.toast('🔦 You need a tinderbox.');
    if (!player.removeItem('logs', 1)) return ui.toast('🪵 You need logs to burn.');
    const x = player.pos.x, z = player.pos.z, y = player.heightAt(x, z);
    const holder = new THREE.Group(); holder.position.set(x, y, z); scene.add(holder);
    loadModel('fire').then(m => { m.scale.setScalar(1.3); holder.add(m); });
    const light = new THREE.PointLight(0xff8a3a, 2.2, 9, 2); light.position.y = 0.8; holder.add(light);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.7, 8), new THREE.MeshBasicMaterial({ color: 0xffb24a, transparent: true, opacity: 0.9 }));
    flame.material.userData.noWire = true; flame.position.y = 0.7; holder.add(flame);
    const it = { kind: 'cook', verb: '🍳 Cook on your fire', pos: new THREE.Vector3(x, y, z), range: 2.8 };
    (area === 'dungeon' ? dungeonInteractables : worldObjs.interactables).push(it);
    fires.push({ holder, light, flame });
    ui.toast('🔥 You light a crackling fire.');
    chime(300);
  }
  const fires = [];

  // keyboard shortcuts
  addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (k === 'e' || k === ' ') { unlockAudio(); interaction.trigger(); }
    else if (k === 'i') document.querySelector('#panel-inv').classList.toggle('hidden') || ui.renderInventory();
    else if (k === '1') player.setStyle('sword');
    else if (k === '2') player.setStyle('crossbow');
    else if (k === '3') player.setStyle('staff');
    else if (k === 'f') { const f = bestFood(); if (f) player.eat(f); }
  });

  // ── load / fresh ──
  const saved = !NOSAVE && load();
  if (!saved) {
    quests.load(null, ['intro']);
    player.addItem('waterskin', 1); player.addItem('apple', 2); player.addItem('sword', 1);
    player.equip('sword');
    setTimeout(() => ui.toast('💭 "Who am I? …no memory. Best find food, water, and a way to survive."'), 600);
  }
  setInterval(save, 8000);
  addEventListener('visibilitychange', () => { if (document.hidden) save(); });

  function save() {
    if (!player.alive) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ p: player.serialize(), q: quests.serialize(), chest: dungeon.chest.opened })); } catch { }
  }
  function load() {
    let d; try { d = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return false; }
    if (!d) return false;
    player.load(d.p);
    quests.load(d.q, (d.q && d.q.length) ? d.q.map(x => x.id) : ['intro']);
    if (d.chest) dungeon.chest.opened = true;
    ui.toast('💾 Welcome back.');
    return true;
  }

  // shot mode
  if (SHOT) { document.body.classList.add('shot-mode'); player.pos.set(2, 0, 9); controls.state.yaw = -0.6; controls.state.pitch = 0.55; controls.state.dist = 12; }

  ui.setBoot('ready', 1);
  setTimeout(ui.hideBoot, 250);

  // ── loop ──
  const clock = new THREE.Clock();
  let t = 0, fps = 60, frames = 0, fpsT = 0, frameCount = 0;
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
    for (const c of activeCreatures()) c.update(dt, t, player);
    for (const n of npcs) n.animate(t, 0);
    worldObjs.tick(dt, t);
    for (const f of fires) { const fl = 0.8 + Math.sin(t * 14 + f.holder.position.x) * 0.2; f.light.intensity = 2 * fl; f.flame.scale.set(1, fl, 1); }
    if (area === 'dungeon') dungeon.tick(t);
    world.tick(dt, t);
    tickFx(dt);

    // sun follows player for crisp shadows
    if (!LITE && area === 'over') { world.sun.position.set(player.pos.x + CFG.sunDir[0], CFG.sunDir[1], player.pos.z + CFG.sunDir[2]); world.sunTarget.position.copy(player.pos); }

    // markers
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
    const circles = area === 'dungeon' ? dungeon.colliders : worldCircles;
    const px = player.pos;
    for (const cc of circles) {
      const minD = cc.r + CFG.playerRadius;
      const dx = px.x - cc.x, dz = px.z - cc.z, d = Math.hypot(dx, dz);
      if (d < minD && d > 1e-5) { px.x = cc.x + (dx / d) * minD; px.z = cc.z + (dz / d) * minD; }
    }
    if (area !== 'dungeon') for (const b of worldBoxes) {        // axis-aligned box pushout
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
    const alive = activeCreatures().filter(c => c.alive);
    const roll = Math.random();
    if (roll < 0.5 && alive.length) { player.setStyle(pick(['sword', 'crossbow', 'staff'])); player.attackCreature(pick(alive)); }
    else { const a = rand(0, 6.28), r = rand(5, CFG.worldRadius - 6); player.setTarget(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)); }
  }

  // ── test hooks ──
  game = { player, world, controls, quests, interaction, overCreatures, dungCreatures, get area() { return area; }, toggleDungeon, scene, camera };
  window.__game = game;
  window.__state = {
    get fps() { return Math.round(fps); }, get pos() { return { x: +player.pos.x.toFixed(1), z: +player.pos.z.toFixed(1) }; },
    get hp() { return Math.ceil(player.hp); }, get food() { return Math.round(player.food); }, get water() { return Math.round(player.water); },
    get gold() { return player.gold; }, get area() { return area; },
    get levels() { return player.levels(); }, get items() { return player.items.map(s => `${s.id}×${s.n}`); },
    get creatures() { return activeCreatures().map(c => `${c.type}:${c.alive ? Math.ceil(c.hp) : 'dead'}`); },
    get errors() { return window.__errors; },
  };
  window.__camera = camera;
}
