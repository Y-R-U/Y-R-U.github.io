// Boot + the loop + the conductor. States: menu (title over the live island)
// → game. URL modes: ?nosave ?lite ?auto ?shot ?speed=N ?age=N ?day=T (CLAUDE.md).

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CELL, GRID, HALF, CFG, AGES, BUILDINGS, MIRACLES } from './config.js';
import { initAssets, model } from './assets.js';
import { createTerrain, worldToCell, cellToWorld } from './terrain.js';
import { createWorld } from './world.js';
import { createPathfinder } from './pathfind.js';
import { createVillagers } from './villagers.js';
import { createBuildings } from './buildings.js';
import { createPowers } from './powers.js';
import { createRaiders } from './raiders.js';
import { createInput } from './input.js';
import { createUI } from './ui.js';
import { createMenus } from './menus.js';
import * as FX from './fx.js';
import * as AU from './audio.js';
import { qs, clamp, rand, pick, lerp, dist2 } from './utils.js';

const errors = [];
window.addEventListener('error', (e) => errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => errors.push(String(e.reason)));

CFG.lite = qs.has('lite');
const NOSAVE = qs.has('nosave');
const AUTO = qs.has('auto');
const SHOT = qs.has('shot');
const SAVE_KEY = 'firstfolk-save';

const game = {
  mode: 'boot', paused: false,
  speed: clamp(parseInt(qs.get('speed')) || 1, 1, 3),
  stocks: { food: 0, wood: 0, stone: 0 },
  state: { age: 1, faith: 0, nextRaidDay: 0 },
  celebration: false, over: false,
  AU,
};
window.__game = game;

// ── renderer / scene / camera ────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = !CFG.lite;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game-container').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.5, 900);
game.scene = scene; game.camera = camera; game.renderer = renderer;

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ── game-facing helpers (used across modules) ───────────────────────────────
game.workMul = () => (game.P?.sunburstT > 0 ? 1.55 : 1);
game.rainBoostAt = (x, z) => game.P?.rainBoostAt(x, z);
game.safeSpot = () => game.B?.fire ? { x: game.B.fire.x, z: game.B.fire.z } : { x: 0, z: 26 };
game.nearestStock = (x, z) => game.B.nearestStock(x, z);
game.woodDemand = () => {
  let d = 16;
  for (const s of game.B.sitesNeedingMaterial()) d += s.remaining('wood');
  return d;
};
game.addStock = (type, n, x, y, z) => {
  game.stocks[type] += n;
  if (x !== undefined) FX.floater(x, y, z, `+${n} ${type === 'wood' ? '🪵' : type === 'stone' ? '🪨' : '🍎'}`);
  game.ui?.flashChip(type === 'food' ? 'food' : type);
};
game.addFaith = (n, x, y, z) => {
  const cap = CFG.faithCap[game.state.age - 1];
  game.state.faith = Math.min(cap, game.state.faith + n);
  if (x !== undefined) FX.floater(x, y, z, `+${Math.round(n)} ✨`);
};
game.spendFaith = (n) => {
  if (game.state.faith < n) return false;
  game.state.faith -= n;
  return true;
};
game.prayerSpot = (v) => {
  const sites = game.B.prayerSites();
  let best = game.B.fire, bd = 1e9;
  for (const s of sites) {
    const d = dist2(v.x, v.z, s.x, s.z);
    if (d < bd) { bd = d; best = s; }
  }
  const a = v.id * 2.399963;               // golden angle ring
  const r = 2.6 + (v.id % 3) * 0.9;
  return { x: best.x + Math.cos(a) * r, z: best.z + Math.sin(a) * r, temple: best.type === 'temple' };
};
game.nearestThreat = (x, z, maxD) => game.R?.nearestThreat(x, z, maxD);
game.shootArrow = (v, th) => {
  const y0 = game.T.heightAt(v.x, v.z) + 1.5;
  const y1 = game.T.heightAt(th.x, th.z) + 1;
  FX.tracer(v.x, y0, v.z, th.x, y1, th.z);
  AU.sfx.arrow();
  game.R.damage(th, CFG.villager.guardDmg, v);
};
game.onDeath = (v) => {
  game.ui?.toast(`🪦 ${v.name} has died`, true);
  game.ui?.dmgFlash();
  AU.sfx.death();
  if (game.V.pop() === 0 && !game.over) {
    game.over = true;
    game.menus.lose();
  }
};
game.win = () => {
  if (game.celebration) return;
  game.celebration = true;
  const mon = game.B.list.find(b => b.type === 'monument');
  if (mon) {
    for (let i = 0; i < 40; i++)
      setTimeout(() => FX.moteAt(mon.x + rand(-4, 4), mon.y + rand(0, 8), mon.z + rand(-4, 4)), i * 120);
    FX.ringPulse(mon.x, mon.z, 0x8effd8, 30);
  }
  setTimeout(() => game.menus.win({
    days: game.W.day, pop: game.V.pop(),
    buildings: game.B.list.filter(b => b.type !== 'fire').length,
    raidsBroken: game.R.raidsBroken,
  }), 2500);
};

// ── boot ────────────────────────────────────────────────────────────────────
let T, W, PF, V, B, P, R, ui, menus, input;

async function boot() {
  ui = game.ui = createUI(game);
  menus = game.menus = createMenus(game);
  menus.showBoot('waking the island…', 0.1);
  await initAssets((m) => menus.showBoot(m, 0.25));

  menus.showBoot('raising the land…', 0.45);
  T = game.T = createTerrain(scene, 3);
  PF = game.PF = createPathfinder(T);

  menus.showBoot('growing the forests…', 0.65);
  W = game.W = await createWorld(scene, T, { lite: CFG.lite });
  T.onEdit = (rect) => W.onTerrainEdit(rect);
  FX.initFx(scene, T, W, CFG.lite);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  B = game.B = createBuildings(game);
  V = game.V = createVillagers(game);
  P = game.P = createPowers(game);
  R = game.R = createRaiders(game);
  W.onNewDay = () => { V.onNewDay(); };

  menus.showBoot('kindling the fire…', 0.85);
  setupInput();
  setupGhost();

  menus.showBoot('ready', 1);
  setTimeout(() => menus.hideBoot(), 250);

  let autostart = false;
  try { autostart = sessionStorage.getItem('firstfolk-autostart') === '1'; sessionStorage.removeItem('firstfolk-autostart'); } catch { /* ok */ }
  if (SHOT || AUTO || autostart) {
    await newGameCore();
    if (SHOT) stageShot();
    if (AUTO) { game.speed = clamp(parseInt(qs.get('speed')) || 3, 1, 3); }
    startPlay();
  } else {
    game.mode = 'menu';
    menus.showTitle(game.saveExists());
    AU.startMusic('menu');
    // slow menu orbit
    menuOrbit = true;
  }
  requestAnimationFrame(loop);
}

let menuOrbit = false;

game.saveExists = () => {
  try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
};

async function newGameCore() {
  game.mode = 'game';
  game.over = false; game.celebration = false;
  game.stocks = { ...CFG.econ.start };
  delete game.stocks.faith;
  game.state = { age: 1, faith: CFG.econ.start.faith, nextRaidDay: 0 };
  await B.initCamp();
  const c = T.camp;
  for (let i = 0; i < 5; i++)
    await V.spawn('villager', c.x + rand(-4, 4), c.z + rand(-4, 4), true);
  // URL cheats for testing
  const jumpAge = clamp(parseInt(qs.get('age')) || 1, 1, 5);
  if (jumpAge > 1) {
    game.state.age = jumpAge;
    game.stocks.wood += 40; game.stocks.stone += 25; game.stocks.food += 40;
    if (jumpAge >= 5) { game.stocks.stone += 100; game.stocks.wood += 60; }
    game.state.faith = CFG.faithCap[jumpAge - 1] * 0.7;
    const targetPop = (AGES[jumpAge - 1].need?.pop || 5) + 1;
    while (V.pop() < targetPop) await V.spawn('villager', c.x + rand(-6, 6), c.z + rand(-6, 6), true);
  }
  if (qs.has('day')) W.dayT = clamp(parseFloat(qs.get('day')) || 0.16, 0, 0.99);
  ui.refreshUnlocks();
}

// Restart = reload with an autostart flag; guarantees a clean world.
game.newGame = () => {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ok */ }
  try { sessionStorage.setItem('firstfolk-autostart', '1'); } catch { /* ok */ }
  location.reload();
};

game.continueGame = async () => {
  menus.hideTitle();
  if (await loadSave()) startPlay();
  else { await newGameCore(); startPlay(); }
};

function startPlay() {
  game.mode = 'game';
  menuOrbit = false;
  menus.hideTitle();
  AU.startMusic(game.state.age);
  AU.startAmbience();
  input.target.set(T.camp.x, 0, T.camp.z);
  input.snap();
  if (SHOT) document.getElementById('hud').classList.add('hidden');
  else {
    ui.tip('welcome', 'Welcome, young god. Your five folk will fend for themselves — watch them chop and forage. Build a 🛖 Hut so the tribe can grow, and sculpt the land flat where you need room.');
  }
}

function stageShot() {
  if (!qs.has('day')) W.dayT = 0.5;
  input.r = 46; input.phi = 0.98; input.theta = Math.PI * 0.82;
  input.target.set(T.camp.x - 2, 0, T.camp.z - 4);
  input.snap();
}

// ── input + ghost placement ─────────────────────────────────────────────────
let brushDown = false, brushPt = new THREE.Vector3();
let brushRing = null;
let placing = null;

function setupInput() {
  input = game.input = createInput(renderer.domElement, camera, T, {
    toolArmed: () => game.mode === 'game' && !game.paused &&
      (ui.mode === 'sculpt' || ui.mode === 'leyline' || (ui.mode === 'build' && placing) || (ui.mode === 'miracle' && P.armedMiracle)),
    onToolDown(p) {
      AU.unlock();
      if (ui.mode === 'sculpt') { P.beginStroke(p.x, p.z); brushDown = true; brushPt.copy(p); }
      else if (ui.mode === 'leyline') { P.applyLey(p.x, p.z); brushDown = true; brushPt.copy(p); }
      else if (ui.mode === 'build' && placing) moveGhost(p);
    },
    onToolDrag(p) {
      brushPt.copy(p);
      if (ui.mode === 'leyline' && brushDown) P.applyLey(p.x, p.z);
      else if (ui.mode === 'build' && placing) moveGhost(p);
    },
    onToolUp() { brushDown = false; },
    onToolTap(p) {
      if (ui.mode === 'miracle' && P.armedMiracle) {
        const name = P.armedMiracle;
        P.armedMiracle = null;
        P.cast(name, p.x, p.z);
        ui.rerenderMiracles();
      } else if (ui.mode === 'build' && placing) moveGhost(p);
    },
    onTap(p) {
      if (game.mode !== 'game') return;
      AU.unlock();
      // nearest villager?
      let bestV = null, bd = 2.6 * 2.6;
      for (const v of V.list) {
        if (v.dead) continue;
        const d = dist2(p.x, p.z, v.x, v.z);
        if (d < bd) { bd = d; bestV = v; }
      }
      if (bestV) { ui.showVillager(bestV); AU.sfx.click(); return; }
      const b = B.at(p.x, p.z);
      if (b) { ui.showBuilding(b); AU.sfx.click(); return; }
      if (ui.mode === 'hand') ui.closeSheet();
    },
    onHover(p) {
      if (ui.mode === 'sculpt' || ui.mode === 'leyline') brushPt.copy(p);
      else if (ui.mode === 'build' && placing) moveGhost(p);
    },
  });

  brushRing = new THREE.Mesh(
    new THREE.RingGeometry(0.93, 1, 40).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
  brushRing.visible = false;
  brushRing.renderOrder = 5;
  scene.add(brushRing);
}

function setupGhost() {
  game.startPlacing = async (type) => {
    game.cancelPlacing();
    const def = BUILDINGS[type];
    let ghost;
    if (def.model) {
      ghost = await model(def.model, { ownMaterial: true });
      const s = def.scale * ((def.size * CELL) / Math.max(ghost.userData.size.x, ghost.userData.size.z, 1));
      ghost.scale.setScalar(s);
      ghost.traverse(o => { if (o.isMesh) { o.material.transparent = true; o.material.opacity = 0.55; o.castShadow = false; } });
    } else {
      ghost = new THREE.Mesh(new THREE.CylinderGeometry(def.size * CELL * 0.5, def.size * CELL * 0.55, 1.2, 20),
        new THREE.MeshBasicMaterial({ color: 0x9a948a, transparent: true, opacity: 0.5 }));
    }
    const pad = new THREE.Mesh(
      new THREE.PlaneGeometry(def.size * CELL, def.size * CELL).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x7fae6a, transparent: true, opacity: 0.35, depthWrite: false }));
    pad.position.y = 0.08;
    const grp = new THREE.Group();
    grp.add(pad); grp.add(ghost);
    scene.add(grp);
    placing = { type, def, grp, pad, cx: 0, cz: 0, ok: false };
    // open on the nearest valid spot to where the player is looking
    const t = input.target;
    const spot = T.findSpot(t.x, t.z, def.size, !!def.needsRock, 14);
    if (spot) {
      const sw = def.size * CELL;
      moveGhost({ x: spot.cx * CELL - HALF + sw / 2, z: spot.cz * CELL - HALF + sw / 2 });
    } else moveGhost({ x: t.x, z: t.z });
    ui.renderPlaceSheet(type, placing.ok);
  };
  game.cancelPlacing = () => {
    if (placing) { scene.remove(placing.grp); placing = null; }
  };
  game.confirmPlacing = async () => {
    if (!placing || !placing.ok) { AU.sfx.denied(); return; }
    const { type, cx, cz } = placing;
    game.cancelPlacing();
    const b = await B.place(type, cx, cz);
    ui.setMode('hand');
    ui.toast(`${b.def.name} staked out — folk will haul ${['wood', 'stone'].filter(t => b.needs[t]).map(t => t === 'wood' ? '🪵' : '🪨').join('+')} to it`);
    ui.tip('site', 'Sites cost nothing to stake — your free folk haul the materials, then build. Tap the site to check progress.');
  };
}

function moveGhost(p) {
  if (!placing) return;
  const size = placing.def.size;
  const cx = clamp(Math.round((p.x + HALF) / CELL - size / 2), 1, GRID - size - 1);
  const cz = clamp(Math.round((p.z + HALF) / CELL - size / 2), 1, GRID - size - 1);
  const wasOk = placing.ok;
  placing.cx = cx; placing.cz = cz;
  placing.ok = B.canPlace(placing.type, cx, cz);
  const x = cx * CELL - HALF + size * CELL / 2, z = cz * CELL - HALF + size * CELL / 2;
  placing.grp.position.set(x, Math.max(T.heightAt(x, z), 0.2), z);
  placing.pad.material.color.set(placing.ok ? 0x7fae6a : 0xc23b2a);
  if (wasOk !== placing.ok) ui.renderPlaceSheet(placing.type, placing.ok);
}

// ── ages / births / phases ──────────────────────────────────────────────────
let ageAcc = 0, birthAcc = 0, prevPhase = 'work';

function checkAge(dt) {
  ageAcc += dt;
  if (ageAcc < 1) return;
  ageAcc = 0;
  const next = AGES[game.state.age];
  if (!next) return;
  const n = next.need;
  const ok = (!n.pop || V.pop() >= n.pop) &&
    (!n.stone || game.stocks.stone >= n.stone) &&
    (!n.temple || B.count('temple') >= n.temple);
  if (!ok) return;
  game.state.age++;
  AU.sfx.ageUp();
  AU.startMusic(game.state.age);
  ui.banner(`${next.icon} ${next.name}\n${next.story}`);
  const unlocks = [
    ...next.build.map(b2 => `${BUILDINGS[b2].icon} ${BUILDINGS[b2].name}`),
    ...next.miracles.map(m => `${MIRACLES[m].icon} ${MIRACLES[m].name}`),
    ...(next.modes.includes('leyline') ? ['🌟 Leylines'] : []),
  ];
  if (unlocks.length) ui.toast(`Unlocked: ${unlocks.join(' · ')}`);
  ui.refreshUnlocks();
  FX.ringPulse(game.safeSpot().x, game.safeSpot().z, 0xf0e2b6, 16);
  if (game.state.age === 3) ui.tip('age3', 'Wolves prowl at night now — folk near the fire are safe. Stone comes from a ⛏ Quarry placed against bare rock (sculpt a cliff if you must!).');
  if (game.state.age === 4) {
    ui.tip('age4', 'Long ships raid in the morning light. A 🏹 Watchtower guard and the ⚡Smite miracle are your shield.');
    game.state.nextRaidDay = W.day + 1;
  }
  if (game.state.age === 5) ui.tip('age5', 'Raise the 🗿 Monument: haul its stone, hammer it high, then consecrate each stage with faith.');
}

function checkBirths(dt) {
  birthAcc += dt;
  if (birthAcc < CFG.villager.birthEvery) return;
  birthAcc = 0;
  const pop = V.pop();
  if (pop === 0 || game.over) return;
  if (game.stocks.food >= pop + CFG.villager.birthFoodSpare && pop < B.housing() && Math.random() < 0.75) {
    const s = game.safeSpot();
    V.spawn('child', s.x + rand(-3, 3), s.z + rand(-3, 3), false).then(v => {
      FX.burst(v.x, T.heightAt(v.x, v.z) + 1, v.z, { color: 0xffe8b0, n: 12, spread: 0.8, up: 2, size: 0.4, life: 0.8 });
      AU.sfx.birth();
      ui.toast(`👶 ${v.name} is born!`);
    });
  }
}

function checkPhase() {
  const ph = W.phase();
  if (ph === prevPhase) return;
  const was = prevPhase;
  prevPhase = ph;
  if (ph === 'pray') {
    R.onDusk();
    if (!SHOT) ui.toast('🌙 Dusk — the folk gather to pray');
  } else if (ph === 'work' && was === 'dawn') {
    R.maybeRaid();
  }
}

// ── saves ───────────────────────────────────────────────────────────────────
let saveAcc = 0;
function save() {
  if (NOSAVE || game.mode !== 'game' || game.over) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      v: 1, state: game.state, stocks: game.stocks,
      terrain: T.serialize(), world: W.serialize(),
      buildings: B.serialize(), villagers: V.serialize(), powers: P.serialize(),
    }));
  } catch (e) { console.warn('save failed', e); }
}
async function loadSave() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch { /* ok */ }
  if (!data || data.v !== 1) return false;
  try {
    game.mode = 'game';
    game.state = data.state;
    game.stocks = data.stocks;
    T.load(data.terrain);
    await B.initCamp();
    await W.loadState(data.world);
    await B.loadState(data.buildings);
    await V.loadState(data.villagers, B.byId);
    for (const v of V.list) if (v.employedAt) v.employedAt.jobWorkers.push(v);
    P.loadState(data.powers);
    ui.refreshUnlocks();
    return true;
  } catch (e) {
    console.error('load failed', e);
    errors.push('load: ' + e.message);
    return false;
  }
}
addEventListener('visibilitychange', () => { if (document.hidden) save(); });

// ── auto driver (soak test / demo god) ──────────────────────────────────────
let autoAcc = 0, autoLeyDone = false, autoRainDay = 0, autoSculpted = false, autoBusy = false;
async function autoTick() {
  if (autoBusy) return;
  autoBusy = true;
  try { await autoTickInner(); } finally { autoBusy = false; }
}
async function autoTickInner() {
  const s = game.stocks, st = game.state, c = T.camp;
  const sites = B.list.filter(b => b.state === 'site' || b.state === 'building').length;
  const cnt = (t) => B.list.filter(b => b.type === t).length;
  const placeNear = async (type, px, pz, needsRock = false) => {
    const def = BUILDINGS[type];
    const spot = T.findSpot(px, pz, def.size, needsRock, needsRock ? 34 : 22);
    if (spot && B.canPlace(type, spot.cx, spot.cz)) { await B.place(type, spot.cx, spot.cz); return true; }
    return false;
  };
  if (!autoSculpted && st.faith > 12) {
    autoSculpted = true;
    P.sculptTool = 'smooth';
    P.beginStroke(c.x + 8, c.z - 6);
    for (let i = 0; i < 8; i++) P.applySculpt(c.x + 8 + rand(-3, 3), c.z - 6 + rand(-3, 3), 0.3);
    P.sculptTool = 'raise';
  }
  if (sites < 2) {
    // priority list; if a spot search fails, fall through to the next want
    const wants = [];
    if (st.age >= 5 && cnt('monument') < 1) wants.push(['monument', c.x, c.z - 16, false]);
    if (V.pop() > 0 && V.pop() >= B.housing() - 1 && cnt('hut') < 7) wants.push(['hut', c.x + rand(-14, 14), c.z + rand(-14, 14), false]);
    if (st.age >= 2 && cnt('farm') < 1 + Math.floor(V.pop() / 14)) wants.push(['farm', c.x - 12, c.z + 6, false]);
    if (st.age >= 2 && cnt('lodge') < 1) wants.push(['lodge', c.x + 12, c.z + 10, false]);
    if (st.age >= 3 && cnt('quarry') < 1) wants.push(['quarry', T.crag.x - 8, T.crag.z + 8, true]);
    if (st.age >= 3 && cnt('storehouse') < 1) wants.push(['storehouse', (c.x + T.crag.x) / 2, (c.z + T.crag.z) / 2, false]);
    if (st.age >= 4 && cnt('temple') < 1) wants.push(['temple', c.x - 8, c.z - 10, false]);
    if (st.age >= 4 && cnt('watchtower') < 2) wants.push(['watchtower', c.x + rand(-18, 18), c.z + rand(-18, 18), false]);
    for (const [ty, px, pz, rock] of wants) if (await placeNear(ty, px, pz, rock)) break;
  }
  // leyline from fire toward the farm
  if (!autoLeyDone && st.age >= 2 && st.faith > 16) {
    const farm = B.list.find(b => b.type === 'farm');
    if (farm) {
      autoLeyDone = true;
      const n = 8;
      for (let i = 1; i <= n; i++) P.applyLey(lerp(c.x, farm.x, i / n), lerp(c.z, farm.z, i / n));
    }
  }
  // rain the farm once a day
  if (st.age >= 2 && W.day > autoRainDay && st.faith > 34) {
    const farm = B.list.find(b => b.type === 'farm' && b.state === 'done');
    if (farm) { autoRainDay = W.day; P.cast('rain', farm.x, farm.z); }
  }
  // defend
  if (R.raidActive && st.faith >= 20) {
    const t = R.threats.find(t2 => t2.kind === 'raider' && t2.hp > 0);
    if (t && P.miracleReady('smite')) P.cast('smite', t.x, t.z);
  }
  // consecrate
  const mon = B.list.find(b => b.type === 'monument' && b.state === 'blessing');
  if (mon && st.faith >= mon.def.consecrate) B.consecrate(mon);
  if (st.age >= 5 && P.miracleReady('sunburst') && st.faith > 200) P.cast('sunburst');
}

// ── debug surface ────────────────────────────────────────────────────────────
const stateObj = { errors };
window.__state = stateObj;
let fpsAcc = 0, fpsN = 0, fps = 0;

function refreshState() {
  stateObj.fps = fps;
  stateObj.mode = game.mode;
  stateObj.pop = V?.pop() || 0;
  stateObj.jobs = V?.jobCounts() || {};
  stateObj.stocks = { ...game.stocks };
  stateObj.faith = +game.state.faith.toFixed(1);
  stateObj.age = game.state.age;
  stateObj.day = W?.day;
  stateObj.dayT = +(W?.dayT || 0).toFixed(3);
  stateObj.phase = W?.phase();
  stateObj.buildings = B?.list.map(b => `${b.type}:${b.state}`) || [];
  stateObj.threats = R?.threats.length || 0;
  stateObj.raid = R?.raidActive || false;
  stateObj.pfQueue = PF?.queueLen() || 0;
  stateObj.trees = W?.trees.length;
  stateObj.drops = W?.drops.length;
  stateObj.celebration = game.celebration;
}

// ── the loop ────────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
let simT = 0;

game.step = (dt) => stepSim(dt);   // headless hand-stepping

function stepSim(dt) {
  simT += dt;
  W.tick(dt, simT);
  T.mesh.updateMatrixWorld();
  PF.tick();
  V.tick(dt, simT);
  B.tick(dt, simT);
  P.tick(dt);
  R.tick(dt, simT);
  FX.tickFx(dt, simT);
  AU.setNight(W.nightness());
  checkAge(dt);
  checkBirths(dt);
  checkPhase();
  if (AUTO) {
    autoAcc += dt;
    if (autoAcc > 2) { autoAcc = 0; autoTick().catch(e => errors.push('auto: ' + e.message)); }
  }
  saveAcc += dt;
  if (saveAcc > 8) { saveAcc = 0; save(); }
}

function loop() {
  requestAnimationFrame(loop);
  const raw = Math.min(clock.getDelta(), 0.05);
  fpsAcc += raw; fpsN++;
  if (fpsAcc > 0.75) { fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }

  if (game.mode === 'menu') {
    if (menuOrbit) { input.theta += raw * 0.05; W.tick(raw, simT += raw); }
    input.update(raw);
    renderer.render(scene, camera);
    refreshState();
    return;
  }
  if (game.mode !== 'game') { renderer.render(scene, camera); return; }

  if (!game.paused && !game.over) {
    const dt = raw * game.speed;
    stepSim(dt);
    // continuous sculpting while the finger is down
    if (brushDown && ui.mode === 'sculpt') P.applySculpt(brushPt.x, brushPt.z, raw * game.speed);
  }
  // brush ring follows
  const brushMode = ui.mode === 'sculpt' || ui.mode === 'leyline';
  brushRing.visible = brushMode && game.mode === 'game';
  if (brushMode) {
    const r = ui.mode === 'sculpt' ? game.P.brush : 1.8;
    brushRing.scale.setScalar(r);
    brushRing.position.set(brushPt.x, T.heightAt(brushPt.x, brushPt.z) + 0.15, brushPt.z);
    brushRing.material.color.set(ui.mode === 'leyline' ? 0x8effd8 : 0xffffff);
  }
  input.update(raw);
  ui.update(raw);
  renderer.render(scene, camera);
  refreshState();
}

document.addEventListener('pointerdown', AU.unlock, { once: true });
boot().catch(e => { console.error(e); errors.push('boot: ' + e.message); menus?.showBoot('boot failed — ' + e.message, 0); });
