// HOTWIRE — boot + game loop + mode management (menu / story-free-roam /
// endless) + the story conductor (offers at giver hotspots, trust/exposure,
// conflicts, endings, map swaps). Test hooks: window.__game / window.__state.

import * as THREE from 'three';
import { CFG, FLAG } from './config.js';
import { P, loadProfile, saveProfile, resetProfile, carUpgrades } from './save.js';
import { initAssets } from './assets.js';
import { initRig } from './hero.js';
import { getLevel } from './levels.js';
import { World } from './world.js';
import { Vehicles, VEHICLES } from './vehicles.js';
import { Weapons, Pickups, WEAPONS } from './weapons.js';
import { Actors } from './actors.js';
import { Player } from './player.js';
import { Police } from './police.js';
import { Traffic } from './traffic.js';
import { Missions } from './missions.js';
import { STORY, SIDES, ENDINGS, nextNodeId, nodeById, SPEAKERS } from './story.js';
import { Minimap } from './minimap.js';
import { UI } from './ui.js';
import { Shop } from './shop.js';
import { createControls } from './controls.js';
import { clamp, rand, fmtCash } from './utils.js';
import * as fx from './fx.js';
import * as audio from './audio.js';

const $ = (id) => document.getElementById(id);
const setLoad = (f, msg) => { $('load-fill').style.width = `${f * 100}%`; if (msg) $('load-msg').textContent = msg; };

// ── renderer / scene ──
const renderer = new THREE.WebGLRenderer({ antialias: !FLAG.lite, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = !FLAG.lite;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
$('app').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CFG.cam.fov, innerWidth / innerHeight, 0.5, 600);
function resize() {
  renderer.setSize(innerWidth, innerHeight);
  const q = P().settings.quality;
  renderer.setPixelRatio(q === 'low' ? 1 : Math.min(devicePixelRatio, q === 'med' ? 1.5 : 2));
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

// ── game state ──
const G = {
  mode: 'boot',            // boot | menu | free | endless
  levelId: null,
  cineFocus: null,
  paused: false,
  endless: { t: 0, score: 0 },
  offerCooldown: 0,
  playerCar: null,         // the spawned personal car
  errors: [],
};
addEventListener('error', (e) => G.errors.push(String(e.message)));

const profile = loadProfile();
const ui = new UI();
const shop = new Shop(ui);
const world = new World(scene);
const vehicles = new Vehicles(scene, world);
const weapons = new Weapons(scene, world, vehicles);
const pickups = new Pickups(scene);
let player = null;
const actors = new Actors(scene, world, weapons, () => player);
const police = new Police(scene, world, vehicles, weapons, actors, () => player);
const traffic = new Traffic(world, vehicles, actors, () => player);
const minimap = new Minimap($('minimap'));
let missions = null;
let controls = null;

// ═══════════════ boot ═══════════════
async function boot() {
  setLoad(0.05, 'decoding asset pack…');
  await initAssets((m) => setLoad(0.15, m));
  setLoad(0.35, 'waking up the cast…');
  const rigNames = ['hero', 'ped_m', 'ped_w', 'ped_m2', 'ped_w2', 'cop', 'swat', 'gang_m', 'gang_w', 'rico', 'marlowe', 'vex', 'knuckles', 'dot', 'dane'];
  await Promise.all(rigNames.map(n => initRig(n)));
  setLoad(0.55, 'pouring the asphalt…');
  fx.initFx(scene);

  player = new Player(scene, world, vehicles, weapons);
  missions = new Missions({ scene, world, vehicles, weapons, pickups, actors, police, traffic, player, ui });
  controls = createControls({
    camera, dom: renderer.domElement,
    getFocus: () => G.cineFocus
      ? { x: G.cineFocus.x, z: G.cineFocus.z, speedFrac: 0 }
      : { x: player.x, z: player.z, vx: player.vel.x, vz: player.vel.z, speedFrac: player.speedFrac },
  });

  wire();
  await loadLevelById(FLAG.level && !FLAG.level.startsWith('custom') ? FLAG.level : (FLAG.level || 'palmbay'));
  setLoad(0.9, 'final polish…');
  resize();
  ui.applySettings();
  $('loading').classList.add('hidden');

  if (FLAG.jump) { profile.story.node = FLAG.jump; profile.story.trust.police = 65; profile.story.trust.gang = 65; }

  if (FLAG.shot) { startShot(); }
  else if (FLAG.mode === 'endless') startEndless();
  else if (FLAG.mode === 'free' || FLAG.auto || FLAG.jump) startFree();
  else showMenu();

  requestAnimationFrame(tick);
}

async function loadLevelById(id) {
  const lv = await getLevel(id);
  G.levelId = lv.id || id;
  // clear dynamic state
  vehicles.clearAll();
  actors.clear();
  pickups.clear();
  weapons.clear();
  fx.clearFx();
  police.cars = []; police.heat = 0;
  traffic.cars = []; traffic.gangCars = [];
  await world.load(lv);
  minimap.build(lv);
  // parked cars + guns from level data
  for (const c of lv.cars || []) {
    const v = await vehicles.spawn(c.t, c.x, c.z, c.rot || 0, { locked: !!c.locked });
  }
  for (const g of lv.guns || []) await pickups.add('gun', g.x, g.z, { w: g.w });
  // service pickups
  if (lv.id === 'palmbay') {
    await pickups.add('wrench', 78, 246, {});
    await pickups.add('wrench', 210, 246, {});
    await pickups.add('medkit', 166, 186, {});
    await pickups.add('medkit', 340, 286, {});
  }
  player.respawn(lv.spawn?.x || 20, lv.spawn?.z || 20);
  controls.snap();
  return lv;
}

// spawn/replace the player's personal car near a point
async function spawnPersonalCar(x, z) {
  if (G.playerCar && player.car !== G.playerCar) { vehicles.remove(G.playerCar); G.playerCar = null; }
  const id = profile.activeCar;
  if (!VEHICLES[id]) return;
  for (const [ox, oz] of [[4, 0], [-4, 0], [0, 4], [0, -4], [6, 6]]) {
    const res = world.collide(x + ox, z + oz, 2.2);
    if (!res.hit) {
      G.playerCar = await vehicles.spawn(id, x + ox, z + oz, 0, {});
      G.playerCar.ownedId = id;
      const u = carUpgrades(id);
      if (u.paint && CFG.colors.paint[u.paint]) vehicles.paint(G.playerCar.group, CFG.colors.paint[u.paint]);
      return;
    }
  }
}

// ═══════════════ wiring ═══════════════
function wire() {
  vehicles.onShake = (amt) => controls.shake(amt);
  vehicles.onSmash = (s, veh) => {
    const byPlayer = !veh || veh.driver === 'player';
    if (byPlayer) {
      profile.cash += s.cash; profile.stats.smashed++;
      ui.setCash(profile.cash);
      ui.toast(`+${fmtCash(s.cash)}`);
      police.crime(CFG.heat.smashProp);
      if (G.mode === 'endless') G.endless.score += s.cash * 4;
      audio.cashSound();
    }
    missions.notifySmash(s);
  };
  vehicles.onCarHit = (a, b, rel) => {
    const pv = a.driver === 'player' ? a : b.driver === 'player' ? b : null;
    if (!pv) return;
    const other = pv === a ? b : a;
    if (other.roleTag === 'traffic') police.crime(CFG.heat.ramCar);
    if (other.roleTag === 'police') police.crime(CFG.heat.ramCop);
    if (G.mode === 'endless') G.endless.score += rel * 6;
  };
  vehicles.onExplode = (veh, from) => {
    controls.shake(0.5);
    if (veh.roleTag === 'police' && from === 'player') {
      police.crime(CFG.heat.killCop);
      profile.cash += 150; ui.setCash(profile.cash);
      ui.toast('+$150 cruiser down');
      if (G.mode === 'endless') G.endless.score += 900;
    }
    if (veh.roleTag === 'gang' && from === 'player') {
      profile.cash += 120; ui.setCash(profile.cash);
      if (G.mode === 'endless') G.endless.score += 700;
    }
    if (veh === G.playerCar) G.playerCar = null;
  };
  weapons.onVehicleShot = (v, owner) => {
    if (owner !== 'player') return;
    if (v.roleTag === 'police') police.crime(CFG.heat.hitCop);
    else police.crime(CFG.heat.gunfire);
    actors.panic();
  };
  traffic.vehicles.onGangFire = (g, yaw) => {
    weapons.fire(g.x + Math.sin(yaw) * 1.6, 1.3, g.z + Math.cos(yaw) * 1.6, yaw, 'smg', 'gang');
  };
  actors.onKilled = (a, by) => {
    if (by === 'player') {
      if (a.kind === 'ped') { police.crime(CFG.heat.killPed); ui.toast('civilian down — heat rising', 'bad'); }
      if (a.kind === 'cop' || a.kind === 'swat') { police.crime(CFG.heat.killCop); profile.cash += 80; ui.setCash(profile.cash); }
      if (a.kind === 'gang') { profile.cash += 60; ui.setCash(profile.cash); }
      profile.stats.kills++;
      if (G.mode === 'endless') G.endless.score += a.kind === 'ped' ? 50 : 350;
    }
  };
  // actor target groups for enemy fire & player shots
  weapons.targetGroup('npcs', {
    list: () => actors.list,
    onHit: (a, dmg, owner, yaw) => { if (owner === 'player') actors.hit(a, dmg, owner, yaw); },
  });
  weapons.targetGroup('player', {
    list: () => player && player.alive && player.mode === 'foot'
      ? [{ x: player.x, z: player.z, r: 0.9, alive: true, isPlayer: true }] : [],
    onHit: (t, dmg, owner) => {
      if (owner === 'player') return;
      player.damage(dmg);
    },
  });
  police.onStarsChange = (s) => ui.setStars(s, true);

  player.onDeath = () => onWasted();
  player.onDamage = () => controls.shake(0.18);

  missions.onComplete = (def, t) => onMissionDone(def, t, true);
  missions.onFail = (def, reason) => onMissionDone(def, reason, false);

  ui.handlers.onEnterTap = () => tryEnterExit();
  ui.handlers.onCineFocus = (f) => { G.cineFocus = f ? { x: f[0], z: f[1] } : null; };
  ui.handlers.onSettingsChanged = () => { resize(); controls.setZoom(P().settings.zoom); };
  ui.handlers.onResetSave = () => { resetProfile(); location.reload(); };
  ui.handlers.onContinue = () => startFree();
  ui.handlers.onStory = () => startFree(true);
  ui.handlers.onMissions = () => missionBoardModal();
  ui.handlers.onEndless = () => startEndless();
  ui.handlers.onGarage = () => shop.garage();

  shop.onCarChanged = async () => {
    if (G.mode !== 'menu') await spawnPersonalCar(player.x, player.z);
  };

  controls.onEnter = () => tryEnterExit();
}

function tryEnterExit() {
  audio.unlock();
  if (!player.alive) return;
  if (player.mode === 'car') { player.exit(); }
  else {
    const v = vehicles.nearestEnterable(player.x, player.z);
    if (v) {
      if (v.ownedId == null && v === G.playerCar) v.ownedId = profile.activeCar;
      player.enter(v);
      if (v.roleTag === 'traffic') police.crime(10);   // carjacking is rude
      v.roleTag = null;
    }
  }
}

// ═══════════════ modes ═══════════════
function showMenu() {
  G.mode = 'menu';
  ui.showMenu(true, profile.story.done.length > 0 || profile.cash > 250);
  ui.showHud(false);
  audio.stopAll();
}

async function startFree(fromStoryButton = false) {
  ui.showMenu(false);
  ui.showHud(true);
  ui.hideEndless();
  audio.unlock();
  police.endless = false;
  G.mode = 'free';
  if (G.levelId !== 'palmbay') await loadLevelById('palmbay');
  ui.setCash(profile.cash); ui.setStars(0, false);
  await spawnPersonalCar(player.x, player.z);
  maybeAutoNode();
}

async function startEndless() {
  ui.showMenu(false);
  ui.showHud(true);
  audio.unlock();
  if (G.levelId !== 'palmbay') await loadLevelById('palmbay');
  G.mode = 'endless';
  G.endless = { t: 0, score: 0 };
  police.endless = true;
  police.heat = 100;
  ui.setCash(profile.cash);
  await spawnPersonalCar(player.x, player.z);
  ui.banner('MOST WANTED', 'Survive. The heat only rises.');
  setTimeout(() => { if (G.mode === 'endless') ui.banner(null); }, 4200);
}

async function onWasted() {
  audio.stopAll();
  if (G.mode === 'endless') {
    const s = Math.floor(G.endless.score + G.endless.t * 10);
    profile.endlessBest.push({ score: s, time: Math.floor(G.endless.t), date: Date.now() });
    profile.endlessBest.sort((a, b) => b.score - a.score);
    profile.endlessBest = profile.endlessBest.slice(0, 10);
    const cut = Math.floor(s * 0.02);
    profile.cash += cut;
    saveProfile();
    const best = profile.endlessBest[0]?.score === s;
    await ui.bigCard({
      title: 'BUSTED', bad: true,
      sub: `You lasted ${Math.floor(G.endless.t)}s against the whole of Palm Bay PD.\nScore ${s.toLocaleString()}${best ? ' — NEW RECORD!' : ''}\nPayout ${fmtCash(cut)}`,
      btns: ['AGAIN', 'MENU'],
    }).then(b => b === 'AGAIN' ? startEndless() : showMenu());
    return;
  }
  if (missions.running) missions.fail('You got wasted');
  const tax = Math.floor(profile.cash * 0.05);
  profile.cash -= tax; saveProfile();
  await ui.bigCard({
    title: 'WASTED', bad: true,
    sub: `The hospital patched you up.${tax > 0 ? ` Bills: ${fmtCash(tax)}.` : ''}`,
    btns: ['GET UP'],
  });
  police.clearHeat();
  traffic.gangHostile = profile.story.trust.gang < 15;
  player.respawn(166, 186);   // hospital bay
  ui.setCash(profile.cash);
  controls.snap();
}

// ═══════════════ story conductor ═══════════════
const nodeDone = (id) => profile.story.done.includes(id);
function currentNode() { return nodeById(profile.story.node); }

async function maybeAutoNode() {
  const n = currentNode();
  if (n && n.giver === 'auto' && !missions.running && !nodeDone(n.id)) {
    await startStoryMission(n);
  }
}

async function startStoryMission(node) {
  // smart play: S10 with high police trust swaps the brief + kills the conflict
  let def = { ...node };
  if (node.conflict?.smart && profile.story.trust.police >= node.conflict.smart.police) {
    def = { ...node, brief: [...node.brief, ...(node.smartBrief || [])], conflict: null, _smart: true };
  }
  if (def.map && G.levelId !== def.map) {
    ui.banner('TRAVELLING…', '');
    await loadLevelById(def.map);
    await spawnPersonalCar(player.x, player.z);
    ui.banner(null);
  }
  await missions.start(def);
}

async function onMissionDone(def, tOrReason, success) {
  const st = profile.story;
  if (!success) {
    await ui.bigCard({ title: 'JOB FAILED', bad: true, sub: String(tOrReason), btns: ['CONTINUE'] });
    if (def.map && def.map !== 'palmbay') { await loadLevelById('palmbay'); await spawnPersonalCar(player.x, player.z); }
    maybeAutoNode();
    return;
  }
  // rewards
  profile.cash += def.reward || 0;
  profile.stats.missionsDone++;
  ui.setCash(profile.cash);
  for (const [f, d] of Object.entries(def.trust || {})) {
    st.trust[f] = clamp(st.trust[f] + d, 0, 100);
    ui.toast(`${f === 'police' ? '👮' : '🐍'} trust ${d > 0 ? '+' : ''}${d}`, d > 0 ? 'info' : 'bad');
  }
  if (def.exposure) st.exposure = clamp(st.exposure + def.exposure, 0, 100);
  // conflict fallout
  if (def.conflict) {
    const c = def.conflict;
    const triggered = c.cond === 'always' || (c.cond === 'stars2' && police.stars >= 2);
    if (triggered) {
      st.trust[c.vs] = clamp(st.trust[c.vs] - c.penalty, 0, 100);
      st.exposure = clamp(st.exposure + 8, 0, 100);
      ui.toast(`${c.vs === 'police' ? '👮' : '🐍'} trust −${c.penalty} (word got out)`, 'bad');
    }
  }
  if (def._smart) ui.toast('🧠 Smart play — nobody lost faith in you', 'info');
  traffic.gangHostile = st.trust.gang < 15;

  // medal for replays
  const medal = typeof tOrReason === 'number' && def.time
    ? (tOrReason < def.time * 0.5 ? 3 : tOrReason < def.time * 0.75 ? 2 : 1) : 1;
  if (!profile.missions[def.id] || profile.missions[def.id].medal < medal)
    profile.missions[def.id] = { medal };

  // story advancement
  const isStory = !!nodeById(def.id);
  if (isStory && !nodeDone(def.id)) {
    st.done.push(def.id);
    if (def.ending) {
      await runEnding(def.ending);
    } else {
      st.node = nextNodeId(def.id, profile) || st.node;
      const nxt = nodeById(st.node);
      await ui.bigCard({
        title: 'JOB DONE', sub: `+${fmtCash(def.reward || 0)}${nxt ? `\nNext: “${nxt.title}” — ${giverLabel(nxt)}` : ''}`,
        btns: ['CONTINUE'],
      });
    }
  } else {
    await ui.bigCard({ title: 'JOB DONE', sub: `+${fmtCash(def.reward || 0)}`, btns: ['CONTINUE'] });
  }
  saveProfile();
  if (def.map && def.map !== 'palmbay' && G.levelId === def.map) {
    await loadLevelById('palmbay');
    await spawnPersonalCar(player.x, player.z);
  }
  maybeAutoNode();
}

function giverLabel(n) {
  return n.giver === 'police' ? 'Precinct 9' : n.giver === 'gang' ? "the Serpent's Nest"
    : n.giver === 'diner' ? 'the Blue Palm Diner' : n.giver === 'rico' ? "Rico's Rides"
    : n.giver === 'race' ? 'the airfield' : 'the streets';
}

async function runEnding(letter) {
  const e = ENDINGS[letter];
  profile.story.ending = letter;
  for (const car of e.unlock) if (!profile.ownedCars.includes(car)) profile.ownedCars.push(car);
  profile.cash += letter === 'C' ? 250000 * 0.1 : 0;   // C: launder 10% usable
  saveProfile();
  audio.stinger(true);
  await ui.bigCard({
    title: e.title,
    sub: e.sub + `\n\nUnlocked: ${e.unlock.map(c => VEHICLES[c].name).join(', ')}.\nPalm Bay stays open — boards, races and MOST WANTED await.`,
    btns: ['KEEP PLAYING', 'MENU'],
  }).then(b => { if (b === 'MENU') showMenu(); });
}

// hotspot interactions (giver boards, shops, portals, custom missions)
async function hotspotPulse() {
  if (missions.running || ui.inDialogue || ui.modalOpen || G.mode !== 'free') return;
  if (G.offerCooldown > 0) return;
  const h = world.hotspotAt(player.x, player.z);
  if (!h) { G.lastHotspot = null; return; }
  if (G.lastHotspot === h.id) return;
  G.lastHotspot = h.id;
  G.offerCooldown = 1.2;
  audio.unlock();

  if (h.kind === 'portal' && h.map) {
    await loadLevelById(h.map);
    await spawnPersonalCar(player.x, player.z);
    return;
  }
  if (h.kind === 'shop') { shop.dealer(); return; }
  if (h.kind === 'garage') { shop.garage(); return; }
  if (h.mission) {   // editor-authored custom mission
    const ok = await ui.choice({ tag: h.mission.offer?.tag, title: h.mission.title || h.label, text: h.mission.offer?.text || '', meta: h.mission.offer?.meta || [] });
    if (ok) await missions.start(h.mission);
    return;
  }

  // story node at this giver?
  const n = currentNode();
  const giverHere = (h.kind === 'giver' && ((h.faction === 'police' && n?.giver === 'police') ||
    (h.faction === 'gang' && n?.giver === 'gang') || (h.faction === 'civ' && n?.giver === 'diner')))
    || (h.kind === 'race' && n?.giver === 'race')
    || (h.id === 'ricos' && n?.giver === 'rico');
  if (n && giverHere && !nodeDone(n.id) && meetsGate(n)) {
    const ok = await ui.choice({
      tag: n.offer.tag, title: n.title, text: n.offer.text, meta: n.offer.meta || [],
      accept: 'TAKE THE JOB', decline: 'NOT NOW',
    });
    if (ok) await startStoryMission(n);
    return;
  }
  // otherwise: the board (side jobs) at giver hotspots
  if (h.kind === 'giver' || h.kind === 'race' || h.id === 'ricos') boardModal(h);
}

function meetsGate(n) {
  if (!n.gate) return true;
  return Object.entries(n.gate).every(([f, v]) => profile.story.trust[f] >= v);
}

function boardModal(h) {
  const faction = h.faction || (h.kind === 'race' ? 'race' : 'civ');
  const sides = SIDES.filter(s => s.giver === faction || (faction === 'civ' && s.giver === 'diner') || (h.kind === 'race' && s.giver === 'race'));
  if (!sides.length) return;
  ui.modal(h.label, (body) => {
    body.append(trustMeters());
    for (const s of sides) {
      body.append(boardRow(s, () => { ui.closeModal(); missions.start(s); }));
    }
  });
}

function trustMeters() {
  const d = document.createElement('div');
  d.className = 'trust-wrap';
  const t = profile.story.trust;
  d.innerHTML = `<div class="trust police"><div class="tl">👮 PRECINCT 9 — ${Math.round(t.police)}</div><div class="tb"><i style="width:${t.police}%"></i></div></div>` +
    `<div class="trust gang"><div class="tl">🐍 SERPENTS — ${Math.round(t.gang)}</div><div class="tb"><i style="width:${t.gang}%"></i></div></div>`;
  return d;
}

function boardRow(def, go) {
  const row = document.createElement('div');
  row.className = 'board-row';
  const medal = profile.missions[def.id]?.medal;
  row.innerHTML = `<div class="board-ico">${def.offer?.tag === 'police' ? '👮' : def.offer?.tag === 'gang' ? '🐍' : def.giver === 'race' ? '🏁' : '💼'}</div>` +
    `<div class="board-info"><h4>${def.title}</h4><p>${(def.offer?.meta || []).join(' · ')}</p></div>` +
    `<div class="board-medal">${medal ? ['', '🥉', '🥈', '🥇'][medal] : ''}</div>`;
  const b = document.createElement('button');
  b.className = 'board-go';
  b.textContent = 'GO';
  b.addEventListener('click', go);
  row.append(b);
  return row;
}

function missionBoardModal() {
  ui.modal('Missions', (body) => {
    body.append(trustMeters());
    const doneStory = STORY.filter(s => nodeDone(s.id) && s.steps.some(st => st.type !== 'msg'));
    if (doneStory.length) {
      const h = document.createElement('div');
      h.style.cssText = 'font-size:11px;letter-spacing:2px;color:rgba(255,255,255,.45);margin:10px 0 2px';
      h.textContent = 'STORY REPLAYS';
      body.append(h);
      for (const s of doneStory) body.append(boardRow(s, async () => {
        ui.closeModal(); ui.showMenu(false);
        if (G.mode === 'menu') await startFree();
        await startStoryMission(s);
      }));
    }
    const h2 = document.createElement('div');
    h2.style.cssText = 'font-size:11px;letter-spacing:2px;color:rgba(255,255,255,.45);margin:10px 0 2px';
    h2.textContent = 'SIDE JOBS';
    body.append(h2);
    for (const s of SIDES) body.append(boardRow(s, async () => {
      ui.closeModal(); ui.showMenu(false);
      if (G.mode === 'menu') await startFree();
      await missions.start(s);
    }));
    if (profile.endlessBest.length) {
      const h3 = document.createElement('div');
      h3.style.cssText = 'font-size:11px;letter-spacing:2px;color:rgba(255,255,255,.45);margin:14px 0 2px';
      h3.textContent = 'MOST WANTED — BEST RUNS';
      body.append(h3);
      profile.endlessBest.slice(0, 5).forEach((r, i) => {
        const d = document.createElement('div');
        d.className = 'set-row';
        d.innerHTML = `<label>#${i + 1} — ${r.score.toLocaleString()}</label><span style="color:rgba(255,255,255,.55);font-size:13px">${r.time}s</span>`;
        body.append(d);
      });
    }
  });
}

// ═══════════════ pickups & buttons ═══════════════
function pickupPulse() {
  const r = player.mode === 'car' ? 3.4 : CFG.foot.pickupRange;
  const p = pickups.collect(player.x, player.z, r);
  if (!p) return;
  audio.pickup();
  if (p.kind === 'gun') {
    if (player.mode === 'car') { player.car.weapon = p.data.w; ui.toast(`car armed: ${WEAPONS[p.data.w].name}`, 'info'); }
    else { player.weapon = p.data.w; ui.toast(`picked up ${WEAPONS[p.data.w].name}`, 'info'); }
  } else if (p.kind === 'cash') {
    const amt = p.data.amt || 50;
    profile.cash += amt; ui.setCash(profile.cash); ui.toast(`+${fmtCash(amt)}`);
    audio.cashSound();
  } else if (p.kind === 'wrench') {
    if (player.mode === 'car') { vehicles.repair(player.car, player.car.maxHp * 0.5); ui.toast('car repaired 🔧', 'info'); }
    else player.heal(25);
  } else if (p.kind === 'medkit') {
    player.heal(60); ui.toast('patched up ➕', 'info');
  }
}

function buttonPulse() {
  const nearCar = player.mode === 'foot' && !!vehicles.nearestEnterable(player.x, player.z);
  const wid = player.currentWeapon();
  ui.updateButtons({
    enter: nearCar, exit: player.mode === 'car',
    fire: !!wid,
    nitro: { show: player.mode === 'car' && !!player.car?.upg?.nitro, cd: player.car?.nitroCd || 0 },
  });
}

// ═══════════════ screenshot & soak modes ═══════════════
async function startShot() {
  ui.showMenu(false); ui.showHud(true);
  G.mode = 'free';
  ui.setCash(98420); ui.setStars(3, true);
  await spawnPersonalCar(player.x, player.z);
  const v = G.playerCar;
  if (v) { player.enter(v); v.speed = 12; }
  ui.banner('SMASH & DASH', 'Wreck stalls & ATMs 3/5');
  document.getElementById('btns').classList.remove('hidden');
}

let autoT = 0, autoDir = { x: 1, z: 0 };
function autoInput(dt) {
  autoT -= dt;
  if (autoT <= 0) {
    autoT = rand(1.5, 4);
    const a = rand(0, Math.PI * 2);
    autoDir = { x: Math.sin(a), z: Math.cos(a) };
    if (player.mode === 'foot' && Math.random() < 0.6) tryEnterExit();
  }
  return { x: autoDir.x, z: autoDir.z, mag: 1 };
}

// ═══════════════ the loop ═══════════════
let last = performance.now();
let mmT = 0;
function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  const simming = G.mode === 'free' || G.mode === 'endless';
  const cine = ui.inDialogue || ui.modalOpen;

  if (simming && !cine) {
    const input = FLAG.auto ? autoInput(dt) : controls.getMove();
    const firing = ui.fireHeld || controls.firing();
    const nitro = ui.nitroHeld || controls.nitroKey();
    player.tick(dt, input, firing, nitro);
    police.tick(dt);
    traffic.tick(dt);
    actors.tick(dt);
    actors.checkVehicles(vehicles.list);
    missions.tick(dt);
    weapons.tick(dt);
    pickups.tick(dt);
    vehicles.tickIndicator(dt, { x: player.x, z: player.z }, player.mode === 'foot');
    pickupPulse();
    buttonPulse();
    hotspotPulse();
    if (G.offerCooldown > 0) G.offerCooldown -= dt;
    if (G.mode === 'endless') {
      G.endless.t += dt;
      G.endless.score += dt * 10;
      ui.setEndless(G.endless.t, G.endless.score);
    }
    // HUD
    ui.setHp(player.hp / CFG.foot.hp);
    ui.setCar(player.mode === 'car' ? player.car.hp / player.car.maxHp : null,
      player.mode === 'car' ? player.car.def.name : '');
    ui.setWeapon(player.currentWeapon() ? WEAPONS[player.currentWeapon()].name : null);
    ui.setStars(police.stars, police.cars.length > 0);
    // minimap ~20fps
    mmT -= dt;
    if (mmT <= 0) {
      mmT = 0.05;
      minimap.draw(player.x, player.z, player.mode === 'car' ? player.car.yaw : player.yaw, {
        marker: missions.marker,
        police: police.cars, gang: traffic.gangCars,
        hotspots: world.hotspots, pickups: pickups.list,
      });
    }
  } else if (G.mode === 'menu') {
    // ambient menu: slow camera drift over town
    const t = now / 1000;
    G.cineFocus = { x: 192 + Math.sin(t * 0.08) * 80, z: 160 + Math.cos(t * 0.06) * 70 };
    actors.tick(dt);
    traffic.tick(dt);
  }

  world.tick(dt);
  world.trackSun(player ? player.x : 190, player ? player.z : 160);
  fx.tickFx(dt);
  ui.tick(dt);
  controls.tick(dt);
  renderer.render(scene, camera);
  if (!simming || cine) audio.engine(false);

  // test hooks
  window.__state = {
    fps: Math.round(1 / Math.max(dt, 1e-4)), mode: G.mode, level: G.levelId,
    pos: [Math.round(player?.x || 0), Math.round(player?.z || 0)],
    hp: player?.hp, inCar: player?.mode === 'car', carType: player?.car?.type || null,
    stars: police.stars, heat: Math.round(police.heat),
    mission: missions?.active?.def?.id || null, step: missions?.active?.i ?? null,
    node: profile.story.node, trust: profile.story.trust, exposure: profile.story.exposure,
    cash: Math.round(profile.cash), errors: G.errors,
  };
}
window.__game = {
  get G() { return G; }, get player() { return player; },
  vehicles, get world() { return world; }, police, actors, get missions() { return missions; },
  ui, profile, startFree, startEndless, showMenu, tryEnterExit,
  startNode: (id) => { profile.story.node = id; const n = nodeById(id); return n && startStoryMission(n); },
  loadLevelById,
};

boot().catch(e => {
  console.error(e);
  G.errors.push(String(e));
  $('load-msg').textContent = 'load failed: ' + e.message;
});
