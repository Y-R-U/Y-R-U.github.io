// Boot + state machine + the loop. States: menu (title over a slowly orbiting
// backdrop world) → level select → intro (first play) → game. URL modes:
// ?level=N ?custom=id ?test=1 ?auto ?shot ?lite ?nosave ?speed=N   (CLAUDE.md)

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CELL, CFG, TOWERS, ENEMIES } from './config.js';
import { initAssets } from './assets.js';
import * as LV from './levels.js';
import { buildWorld, isBuildable } from './world.js';
import { createEnemies } from './enemies.js';
import { createTowers } from './towers.js';
import { createWaves } from './waves.js';
import { createInput } from './input.js';
import { createUI } from './ui.js';
import { createMenus } from './menus.js';
import { playIntro } from './intro.js';
import { initFx, tickFx } from './fx.js';
import { initProjectiles, tickProjectiles, clearProjectiles } from './projectiles.js';
import * as AU from './audio.js';
import { qs, clamp, mesh, M } from './utils.js';

const errors = [];
window.addEventListener('error', (e) => errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => errors.push(String(e.reason)));

const $ = (id) => document.getElementById(id);
const setBoot = (msg, frac) => {
  $('boot-status').textContent = msg;
  if (frac != null) $('boot-bar').querySelector('i').style.width = `${Math.round(frac * 100)}%`;
};

CFG.lite = qs.has('lite');
const game = {
  state: 'boot', level: null, world: null, enemies: null, towers: null, waves: null,
  gold: 0, lives: 0, kills: 0, goldEarned: 0, speed: clamp(parseInt(qs.get('speed')) || 1, 1, 3),
  paused: false, phase: 'idle', simT: 0, introTick: null,
  shotMode: qs.has('shot'), autoMode: qs.has('auto'), testMode: qs.has('test'),
  isCustom: false, levelNum: 0,
};
window.__game = game;

// ── renderer / scene / camera ────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = !CFG.lite;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('game-container').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.5, 700);
game.scene = scene; game.camera = camera;

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

initFx(scene);
initProjectiles(scene);

// ── 3D selection markers ─────────────────────────────────────────────────────
const rangeRing = new THREE.Mesh(
  new THREE.RingGeometry(0.94, 1, 48).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xe3b653, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
const rangeFill = new THREE.Mesh(
  new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xe3b653, transparent: true, opacity: 0.08, depthWrite: false }));
rangeRing.add(rangeFill);
rangeRing.visible = false; rangeRing.renderOrder = 3;
scene.add(rangeRing);

const cellMark = mesh(new THREE.PlaneGeometry(CELL * 0.94, CELL * 0.94).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, depthWrite: false }), 0, 0.04, 0, false);
cellMark.visible = false; cellMark.renderOrder = 3;
scene.add(cellMark);

const hoverMark = mesh(new THREE.PlaneGeometry(CELL * 0.94, CELL * 0.94).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, depthWrite: false }), 0, 0.03, 0, false);
hoverMark.visible = false;
scene.add(hoverMark);

game.showRange = (pos, range, color = 0xe3b653) => {
  rangeRing.material.color.setHex(color);
  rangeFill.material.color.setHex(color);
  rangeRing.position.set(pos.x, 0.06, pos.z);
  rangeRing.scale.setScalar(range);
  rangeRing.visible = true;
};
game.clearSelection = () => { rangeRing.visible = false; cellMark.visible = false; };

// ── placing a tower: a draggable ghost + its range, committed on release ─────
const OK = 0x86e06a, NO = 0xff6a56;
const placeMark = mesh(new THREE.PlaneGeometry(CELL * 0.94, CELL * 0.94).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: OK, transparent: true, opacity: 0.4, depthWrite: false }), 0, 0.05, 0, false);
placeMark.visible = false; placeMark.renderOrder = 4;
scene.add(placeMark);

let place = null;   // { type, def, cx, cz, at: Vector3, ghost, valid }

// Where to start the ghost when there's no plot in mind: the buildable cell
// nearest the middle of the screen.
function cellNearScreenCentre() {
  const p = input.groundPoint(innerWidth / 2, innerHeight * 0.52);
  const c = p ? LV.worldToCell(game.level, p.x, p.z) : { cx: 0, cz: 0 };
  for (let r = 0; r <= 10; r++) {
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const cx = c.cx + dx, cz = c.cz + dz;
      if (isBuildable(game.world, cx, cz) && !game.towers.at(cx, cz)) return { cx, cz };
    }
  }
  return c;
}

function refreshPlace() {
  if (!place) return;
  const { cx, cz } = LV.worldToCell(game.level, place.at.x, place.at.z);
  place.cx = cx; place.cz = cz;
  const buildable = isBuildable(game.world, cx, cz) && !game.towers.at(cx, cz);
  place.valid = buildable && game.gold >= place.def.cost[0];
  const { x, z } = LV.cellToWorld(game.level, cx, cz);
  place.ghost?.position.set(x, 0, z);
  placeMark.position.set(x, 0.05, z);
  placeMark.material.color.setHex(place.valid ? OK : NO);
  placeMark.visible = true;
  game.showRange({ x, z }, place.def.range[0], place.valid ? OK : NO);
  game.ui.updatePlaceBar(place);
}

game.beginPlace = async (type, cx = null, cz = null) => {
  if (game.state !== 'game' || game.phase !== 'playing') return;
  const def = TOWERS[type];
  if (game.gold < def.cost[0]) { AU.sfx.nogold(); game.ui.toast('Not enough gold'); return; }
  game.endPlace();
  game.ui.closeSheet();
  const startOk = cx != null && isBuildable(game.world, cx, cz) && !game.towers.at(cx, cz);
  const start = startOk ? { cx, cz } : cellNearScreenCentre();
  const w = LV.cellToWorld(game.level, start.cx, start.cz);
  place = { type, def, cx: start.cx, cz: start.cz, at: new THREE.Vector3(w.x, 0, w.z), ghost: null, valid: true };
  input.placing = true;
  hoverMark.visible = false;
  game.ui.showPlaceBar(def);
  refreshPlace();
  const ghost = await game.towers.ghost(type);
  if (!place) { game.towers.removeGhost(ghost); return; }   // cancelled while loading
  place.ghost = ghost;
  refreshPlace();
  game.ui.tip('place', 'Drag anywhere to slide the plot around — the ring shows what it will cover. Lift your finger to raise it.');
};

game.dragPlace = (dx, dy) => {
  if (!place) return;
  const d = input.dragToWorld(dx, dy);
  const hw = game.level.grid.w / 2 * CELL, hh = game.level.grid.h / 2 * CELL;
  place.at.x = clamp(place.at.x + d.x, -hw, hw);
  place.at.z = clamp(place.at.z + d.z, -hh, hh);
  refreshPlace();
};

game.movePlaceTo = (cx, cz) => {
  if (!place) return;
  const { x, z } = LV.cellToWorld(game.level, cx, cz);
  place.at.set(x, 0, z);
  refreshPlace();
  AU.sfx.click();
};

game.confirmPlace = () => {
  if (!place) return;
  if (!place.valid) {
    AU.sfx.nogold();
    game.ui.toast(game.gold < place.def.cost[0] ? 'Not enough gold' : 'No room to build there');
    return;
  }
  const { type, cx, cz } = place;
  game.endPlace();
  game.buildAt(type, cx, cz);
};

game.endPlace = () => {
  if (!place) return;
  if (place.ghost) game.towers.removeGhost(place.ghost);
  place = null;
  input.placing = false;
  placeMark.visible = false;
  rangeRing.visible = false;
  game.ui.hidePlaceBar();
};
game.isPlacing = () => !!place;
game.placeInfo = () => place ? { type: place.type, cx: place.cx, cz: place.cz, valid: place.valid } : null;
game.canBuild = (cx, cz) => isBuildable(game.world, cx, cz) && !game.towers.at(cx, cz);

// ── UI + menus + input ───────────────────────────────────────────────────────
game.ui = createUI(game);
const menus = createMenus(game);

const input = createInput(renderer.domElement, camera, {
  onPlaceDrag(dx, dy) { game.dragPlace(dx, dy); },
  onPlaceRelease() { game.confirmPlace(); },
  onTapCell(cx, cz) {
    if (game.state !== 'game' || game.phase === 'won' || game.phase === 'lost') return;
    AU.unlock();
    if (place) { game.movePlaceTo(cx, cz); return; }   // tap moves the ghost, drag-release builds
    const t = game.towers.at(cx, cz);
    if (t) {
      game.selected = t;
      game.showRange(t.pos, t.def.range[t.lvl]);
      game.ui.openTower(t);
      AU.sfx.click();
      return;
    }
    if (isBuildable(game.world, cx, cz)) {
      const { x, z } = LV.cellToWorld(game.level, cx, cz);
      cellMark.position.set(x, 0.04, z);
      cellMark.visible = true;
      rangeRing.visible = false;
      game.ui.openBuild(cx, cz);
      AU.sfx.click();
      game.ui.tip('build2', 'Pick a tower — Ballistas are a cheap start. Towers can be upgraded twice, and sold if you change your mind.');
    } else {
      game.ui.closeSheet();
    }
  },
  onTapMiss() { if (!place) game.ui.closeSheet(); },
  onDrag() { /* camera moved */ },
  onHover(cx, cz) {
    if (game.state !== 'game' || !game.world || place) { hoverMark.visible = false; return; }
    if (isBuildable(game.world, cx, cz) && !game.towers.at(cx, cz)) {
      const { x, z } = LV.cellToWorld(game.level, cx, cz);
      hoverMark.position.set(x, 0.03, z);
      hoverMark.visible = true;
    } else hoverMark.visible = false;
  },
});
game.input = input;

document.addEventListener('pointerdown', AU.unlock, { once: true });

// ── game actions (called by ui) ──────────────────────────────────────────────
game.buildAt = async (type, cx, cz) => {
  const def = TOWERS[type];
  if (game.gold < def.cost[0]) { AU.sfx.nogold(); game.ui.toast('Not enough gold'); return; }
  if (!isBuildable(game.world, cx, cz) || game.towers.at(cx, cz)) return;
  game.gold -= def.cost[0];
  game.ui.closeSheet();
  game.clearSelection();
  AU.sfx.click();
  await game.towers.build(type, cx, cz, { instant: game.shotMode });
  if (type === 'catapult') game.ui.tip('catapult', 'Catapults can’t hit enemies up close — keep them a couple of plots back from the road.');
  if (type === 'frost') game.ui.tip('frost', 'Frost Spires chill everything near them. Pair one with heavy hitters just down the road.');
};
// a tower finished being raised (bus.onBuilt) — it starts working now
game.onTowerBuilt = () => AU.sfx.build();
game.cancelBuild = (t) => {
  const refund = game.towers.cancelBuild(t);
  if (!refund) return;
  game.gold += refund;
  AU.sfx.sell();
  game.ui.toast(`Build cancelled +${refund} 🪙`, true);
  game.ui.closeSheet();
};
game.upgradeTower = (t) => {
  if (t.lvl >= 2 || t.building > 0) return;
  const cost = t.def.cost[t.lvl + 1];
  if (game.gold < cost) { AU.sfx.nogold(); game.ui.toast('Not enough gold'); return; }
  game.gold -= cost;
  game.towers.upgrade(t).then(() => {
    AU.sfx.upgrade();
    game.ui.openTower(t);
    game.showRange(t.pos, t.def.range[t.lvl]);
  });
};
game.sellTower = (t) => {
  if (t.building > 0) { game.cancelBuild(t); return; }
  const refund = game.towers.sell(t);
  game.gold += refund;
  AU.sfx.sell();
  game.ui.toast(`Sold for ${refund} 🪙`, true);
  game.ui.closeSheet();
};
game.callWave = () => {
  AU.unlock();
  const bonus = game.waves.call();
  if (bonus > 0) { game.gold += bonus; game.goldEarned += bonus; game.ui.toast(`Early call +${bonus} 🪙`, true); }
};
game.cycleSpeed = () => {
  game.speed = game.speed >= 3 ? 1 : game.speed + 1;
  game.ui.setSpeedLabel(game.speed);
};
game.openPause = () => { game.paused = true; game.ui.showPause(); };
game.resume = () => { game.paused = false; };
game.toggleMute = () => AU.setMuted(!AU.isMuted());
game.mutedLabel = () => `${AU.isMuted() ? '🔇 Sound off' : '🔊 Sound on'}`;

game.restart = () => { game.ui.closeModal(); startLevel(game.level, { isCustom: game.isCustom, levelNum: game.levelNum }); };
game.quit = () => {
  game.ui.closeModal();
  if (game.testMode) { location.href = 'editor.html'; return; }
  teardownLevel();
  game.state = 'menu';
  game.ui.hide();
  loadMenuBackdrop().then(() => menus.showLevelSelect());
};
game.nextLevel = () => { game.ui.closeModal(); game.startBuiltin(game.levelNum + 1); };
game.startBuiltin = async (n) => {
  const level = await LV.loadBuiltinByNumber(n);
  startLevel(level, { levelNum: n });
};
game.startCustom = (level) => startLevel(level, { isCustom: true });

// ── level lifecycle ──────────────────────────────────────────────────────────
function teardownLevel() {
  game.endPlace?.();
  game.enemies?.clear();
  game.towers?.clear();
  clearProjectiles();
  game.world?.dispose();
  game.world = null;
  game.clearSelection();
  AU.stopMusic();
}

async function startLevel(level, { isCustom = false, levelNum = 0 } = {}) {
  teardownLevel();
  menus.hideAll();
  const errsBefore = LV.validateLevel(level);
  if (errsBefore.length) {
    game.ui.toast(`Level invalid: ${errsBefore[0]}`);
    game.state = 'menu'; menus.showTitle();
    return;
  }
  game.state = 'loading';
  $('boot').style.display = 'flex';
  setBoot('mustering the horde…', 0.3);

  game.level = level;
  game.isCustom = isCustom;
  game.levelNum = levelNum;
  game.gold = level.gold;
  game.lives = level.lives;
  game.kills = 0; game.goldEarned = 0;
  game.simT = 0; game.paused = false; game.phase = 'playing';

  game.world = await buildWorld(scene, level, { lite: CFG.lite });
  setBoot('raising the banners…', 0.7);

  const bus = {
    onKill(e) {
      game.kills++;
      game.gold += e.def.bounty;
      game.goldEarned += e.def.bounty;
      (e.def.boss ? AU.sfx.bossDeath : AU.sfx.death)();
      if (e.def.boss) AU.setBossMusic(false);
      game.waves.notifyGone(e);
    },
    onLeak(e) {
      game.lives -= e.def.lives;
      game.ui.hurtFlash();
      AU.sfx.leak();
      game.waves.notifyGone(e);
      if (game.lives <= 0 && game.phase === 'playing') lose();
      else game.ui.tip('leak', 'An enemy reached the castle! Each leak costs hearts — plug the gaps in your defence.');
    },
    onWaveStart(i, hasBoss) {
      (hasBoss ? AU.sfx.bossHorn : AU.sfx.horn)();
      if (hasBoss) {
        const bossGroup = level.waves[i].groups.find(g => ENEMIES[g.type].boss);
        if (bossGroup) game.ui.bossBanner(ENEMIES[bossGroup.type].name);
        AU.setBossMusic(true);
      }
    },
    onWaveCleared(i, bonus) {
      if (game.phase !== 'playing') return;
      game.gold += bonus;
      game.goldEarned += bonus;
      game.ui.toast(`Wave ${i + 1} cleared +${bonus} 🪙`, true);
    },
    onAllCleared() { if (game.phase === 'playing') win(); },
    onShoot(tw) {
      const s = { bolt: AU.sfx.ballista, cannonball: AU.sfx.cannon, boulder: AU.sfx.catapult, pulse: AU.sfx.frost, zap: AU.sfx.zap };
      s[tw.def.proj]?.();
    },
    onExplode() { AU.sfx.boom(); },
    onBuilt() { game.onTowerBuilt(); },
  };

  game.enemies = createEnemies(scene, game.world, bus);
  game.towers = createTowers(scene, game.world, game.enemies, bus);
  game.waves = createWaves(level, game.enemies, bus);

  const types = new Set();
  for (const w of level.waves) for (const g of w.groups) types.add(g.type);
  await Promise.all([game.enemies.preload([...types]), game.towers.preload()]);
  setBoot('ready', 1);

  input.setLevel(level);
  input.snap();
  input.enabled = true;
  $('boot').style.display = 'none';

  game.state = 'game';
  game.ui.setSpeedLabel(game.speed);
  if (!game.shotMode) game.ui.show();
  $('btn-backeditor').classList.toggle('hidden', !game.testMode);

  // first-run cinematic on level 1
  const p = LV.progress();
  if (levelNum === 1 && !p.seenIntro && !game.shotMode && !game.autoMode && !game.testMode) {
    input.enabled = false;
    game.ui.hide();
    await playIntro(game);
    p.seenIntro = 1; LV.saveProgress();
    game.introTick = null;
    input.snap();
    input.enabled = true;
    game.ui.show();
  }
  AU.startMusic(level.theme);
  if (level.tip) game.ui.toast(`📜 ${level.tip}`);
  game.ui.tip('build1', 'Hit 🔨 Build (or tap an empty plot) to raise a tower. The first wave is coming!');

  if (game.shotMode) setupShot();
  if (game.autoMode) setupAuto();
}

function starCount() {
  const frac = game.lives / game.level.lives;
  return frac >= 0.9 ? 3 : frac >= 0.5 ? 2 : 1;
}
function win() {
  game.phase = 'won';
  game.endPlace();
  AU.sfx.win();
  const stars = starCount();
  if (!game.isCustom && !game.testMode && game.levelNum) LV.recordWin(game.level.id, stars);
  else if (game.isCustom) LV.recordWin(game.level.id, stars);
  game.ui.showWin({
    stars, kills: game.kills, goldEarned: game.goldEarned,
    hasNext: !game.isCustom && !game.testMode && game.levelNum > 0 && game.levelNum < 20,
    isCustom: game.isCustom || game.testMode,
  });
}
function lose() {
  game.phase = 'lost';
  game.endPlace();
  AU.sfx.lose();
  game.ui.showLose({ wave: game.waves.idx + 1, kills: game.kills });
}

$('btn-backeditor').onclick = () => { location.href = 'editor.html'; };

// ── menu backdrop world ──────────────────────────────────────────────────────
let menuOrbit = 0;
async function loadMenuBackdrop() {
  if (game.world) return;
  const level = await LV.loadBuiltinByNumber(1);
  game.level = level;
  game.world = await buildWorld(scene, level, { lite: CFG.lite });
  input.setLevel(level);
  input.enabled = false;
}

// ── screenshot staging (?shot) ───────────────────────────────────────────────
async function setupShot() {
  game.ui.hide();
  const plan = [['ballista', 5, 5], ['cannon', 7, 4], ['frost', 6, 8], ['arcane', 12, 4], ['ballista', 13, 9], ['catapult', 9, 9]];
  for (const [type, cx, cz] of plan)
    if (isBuildable(game.world, cx, cz)) await game.towers.build(type, cx, cz, { instant: true });
  const kinds = ['shambler', 'rotter', 'bones', 'raider', 'shambler', 'rotter', 'shambler', 'knight'];
  for (let i = 0; i < kinds.length; i++) {
    const e = await game.enemies.spawn(kinds[i], 0);
    e.s = game.world.curves[0].total * (0.15 + i * 0.09);
    e.waveIdx = -1;
  }
  input.theta = Math.PI * 0.88; input.phi = 0.95; input.r *= 0.8;
  input.snap();
}

// ── soak driver (?auto) ──────────────────────────────────────────────────────
function setupAuto() {
  const level = game.level;
  const spots = [];
  for (let cx = 0; cx < level.grid.w; cx++) {
    for (let cz = 0; cz < level.grid.h; cz++) {
      if (!isBuildable(game.world, cx, cz)) continue;
      const { x, z } = LV.cellToWorld(level, cx, cz);
      let cover = 0;
      for (const curve of game.world.curves)
        for (let i = 0; i < curve.pts.length; i += 4)
          if (Math.hypot(curve.pts[i].x - x, curve.pts[i].z - z) < 6) cover++;
      if (cover > 0) spots.push({ cx, cz, cover });
    }
  }
  spots.sort((a, b) => b.cover - a.cover);
  const order = ['ballista', 'frost', 'cannon', 'arcane', 'ballista', 'catapult'];
  let bi = 0, si = 0, timer = 0;
  game.autoTick = (dt) => {
    timer -= dt;
    if (timer > 0) return;
    timer = 1.1;
    if (game.phase !== 'playing') return;
    if (game.waves.phase === 'countdown' && game.waves.countdown < 14) game.callWave();
    const type = order[bi % order.length];
    if (game.gold >= TOWERS[type].cost[0] && si < spots.length && game.towers.list.length < 26) {
      const s = spots[si++];
      if (!game.towers.at(s.cx, s.cz)) { game.buildAt(type, s.cx, s.cz); bi++; }
    } else if (game.gold > 260 && game.towers.list.length) {
      const t = game.towers.list[Math.floor(Math.random() * game.towers.list.length)];
      if (t.lvl < 2 && game.gold >= t.def.cost[t.lvl + 1]) game.upgradeTower(t);
    }
  };
}

// ── the loop ─────────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
let fps = 0, fpsN = 0, fpsT = 0;

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  fpsN++; fpsT += dt;
  if (fpsT >= 1) { fps = fpsN; fpsN = 0; fpsT = 0; }

  if (game.state === 'menu') {
    menuOrbit += dt * 0.05;
    input.theta = Math.PI + menuOrbit;
    input.update(dt);
    game.world?.tick(dt, clock.elapsedTime);
  } else if (game.state === 'game') {
    if (game.introTick) {
      const alive = game.introTick(dt);
      game.simT += dt;
      game.enemies.update(dt, game.simT);
      game.world.tick(dt, game.simT);
      if (!alive) { /* intro resolves itself */ }
    } else {
      const sdt = game.paused || game.phase === 'won' || game.phase === 'lost' ? 0 : dt * game.speed;
      if (sdt > 0) {
        game.simT += sdt;
        game.waves.update(sdt);
        game.enemies.update(sdt, game.simT);
        game.towers.update(sdt, game.simT);
        game.world.tick(sdt, game.simT);
        tickFx(sdt);
        tickProjectiles(sdt);
        game.autoTick?.(sdt);
      }
      input.update(dt);
      game.ui.updateHud();
      game.ui.updateWaveButton();
      game.ui.updateBuildBar();
    }
  }
  renderer.render(scene, camera);

  window.__state = {
    fps, state: game.state, phase: game.phase, gold: game.gold, lives: game.lives,
    wave: game.waves ? game.waves.idx + 1 : 0, wavePhase: game.waves?.phase,
    enemies: game.enemies?.list.length || 0, towers: game.towers?.list.length || 0,
    kills: game.kills, simT: Math.round(game.simT * 10) / 10, errors,
  };
}

// hand-step for headless testing (rAF is throttled when hidden)
game.step = (dt = 0.05) => {
  const sdt = dt * game.speed;
  game.simT += sdt;
  game.waves?.update(sdt);
  game.enemies?.update(sdt, game.simT);
  game.towers?.update(sdt, game.simT);
  game.world?.tick(sdt, game.simT);
  tickFx(sdt); tickProjectiles(sdt);
  game.autoTick?.(sdt);
  game.ui.updateHud(); game.ui.updateWaveButton();
  renderer.render(scene, camera);
};

// ── boot ─────────────────────────────────────────────────────────────────────
(async () => {
  try {
    setBoot('unpacking the armoury…', 0.05);
    await initAssets((m) => setBoot(m, 0.15));
    setBoot('reading the war maps…', 0.5);
    await LV.loadBuiltinIndex();

    const testLevel = game.testMode ? LV.getTestLevel() : null;
    const levelParam = parseInt(qs.get('level'));
    const customParam = qs.get('custom');

    if (testLevel) {
      await startLevel(testLevel, { isCustom: true });
    } else if (levelParam) {
      await game.startBuiltin(clamp(levelParam, 1, 20));
    } else if (customParam && LV.customLevels()[customParam]) {
      await startLevel(LV.customLevels()[customParam], { isCustom: true });
    } else if (game.shotMode) {
      await game.startBuiltin(1);
    } else {
      await loadMenuBackdrop();
      game.state = 'menu';
      $('boot').style.display = 'none';
      menus.showTitle();
    }
  } catch (err) {
    errors.push(String(err?.stack || err));
    setBoot(`failed to load — ${err?.message || err}`, 0);
    console.error(err);
  }
  loop();
})();
