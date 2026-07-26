// The battle runner: builds a battlefield from a mission record, spawns both
// sides, drives the objective, and turns the result into stars, scrap, XP and
// battle points.

import * as THREE from 'three';
import { FIELD_R, AUTO_MODE } from './config.js';
import { rand, clamp01, shuffled, mulberry32, dirToYaw } from './utils.js';
import { ENEMY_NAMES } from './config.js';
import { CHASSIS, CAMOS, weaponStats, derivedStats, payout } from './arsenal.js';
import {
  profile, applyBP, addScrap, addXp, recordBattle, setMissionResult, acquire, owns,
  fireControlFitted, markDirty,
} from './save.js';
import { actorRoot } from './render.js';
import { applyEnvironment, rollWind, BIOMES } from './env.js';
import { terrainHeight, flushTerrain, resettleDetail } from './terrain.js';
import {
  buildProps, addProp, clearProps, updateProps, props, objectiveProps, paletteFor, rebuildObstacles,
} from './props.js';
import { initParticles, updateParticles, clearParticles } from './particles.js';
import { initProjectiles, updateProjectiles, updateFiring, clearProjectiles } from './projectiles.js';
import { Tank, updateAllTanks } from './tank.js';
import { AIController, BossController, ROLES } from './ai.js';
import { PlayerController, showAimFx } from './player.js';
import { Drone } from './drone.js';
import { updateUtilities, clearUtilities } from './utility.js';
import { resetCamera, endKillCam } from './camera.js';
import { AudioFX } from './audio.js';
import { state, resetBattleTallies, enemyTanks } from './state.js';
import { emit, on } from './bus.js';

const _v = new THREE.Vector3();

let objectiveMesh = null;
let convoy = null;
let killsThisBattle = 0;
let reconMarks = new Set();
let reinforceT = 0;
let endedFlag = false;

// ---------------------------------------------------------------------------
// Enemy stat derivation
// ---------------------------------------------------------------------------

const ENEMY_HULL_TINT = {
  brawler: 0x7a3a30, line: 0x66584a, sniper: 0x525a66,
  artillery: 0x615c40, flanker: 0x7a5034, guard: 0x565049, boss: 0x453634,
};
const ENEMY_ACCENT = [0xff4a3a, 0xff7a2a, 0xff2d6a, 0xffa32a, 0xd44aff, 0xff5a8a];

export function enemyStats(chassisId, weaponId, skill, hpMul = 1) {
  const ch = CHASSIS[chassisId] || CHASSIS.mainline;
  const level = Math.round(clamp01(skill) * 4);
  const w = weaponStats(weaponId, level);
  // low-skill crews also hit softer, which keeps act one survivable
  const dmgMul = 0.5 + skill * 0.62;
  return {
    chassis: ch,
    hpMax: Math.round(ch.hp * hpMul * (0.78 + skill * 0.55)),
    speed: ch.speed * (0.8 + skill * 0.3),
    accel: ch.accel * (0.82 + skill * 0.24),
    traverse: ch.traverse * (0.72 + skill * 0.45),
    dmgTakenMul: 1 / ch.armour,
    regen: skill > 0.6 ? 0.8 : 0,
    assistRange: 0, leadQuality: skill, zoomMax: 1, droneMul: 1,
    // Enemy crews always load slower than you do — a pack of four elites would
    // otherwise out-DPS anything the garage can build.
    weapon: { ...w, dmg: w.dmg * dmgMul, splashDmg: w.splashDmg * dmgMul,
      reload: w.reload * (1.7 - skill * 0.55) },
    utility: null,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export function initBattleSystems() {
  initParticles();
  initProjectiles();
  wireEvents();
}

let wired = false;
function wireEvents() {
  if (wired) return;
  wired = true;

  on('tank-killed', ({ victim, attacker }) => {
    if (attacker && attacker.isPlayer) {
      killsThisBattle++;
      state.kills++;
      state.streak++;
      state.streakTimer = 6;
      state.bestStreak = Math.max(state.bestStreak, state.streak);
      state.score += 120;
    }
    if (victim === convoy) failBattle('CONVOY DESTROYED');
  });

  on('prop-killed', ({ byPlayer }) => {
    if (byPlayer) {
      state.propsKilled++;
      state.score += 10;
    }
  });

  on('drone-marked', (tank) => {
    if (state.objective && state.objective.kind === 'recon' && tank) {
      if (!reconMarks.has(tank.id)) {
        reconMarks.add(tank.id);
        state.objective.progress = reconMarks.size;
        emit('objective-tick', state.objective);
        AudioFX.blip(1200, 0.12, 0.08);
      }
    }
  });

  on('drone-down', () => { profile.stats.dronesLost++; });
}

export function startBattle(mission) {
  endedFlag = false;
  clearBattle();
  resetBattleTallies();
  killsThisBattle = 0;
  reconMarks = new Set();
  reinforceT = 0;

  state.mission = mission;
  state.seed = mission.seed || Math.floor(Math.random() * 1e6);
  const biome = BIOMES[mission.biome] || BIOMES.farmland;

  state.env = applyEnvironment({
    time: mission.time, biome: mission.biome, weather: mission.weather, seed: state.seed,
  });
  const windMul = mission.time === 'storm' ? 1.6 : 1;
  state.wind = rollWind(state.seed, windMul);
  AudioFX.setWeatherBed(state.env.weather);

  // spawn ring: player at one edge, enemies spread on the far arc
  const rng = mulberry32(state.seed ^ 0xabc123);
  const playerAngle = rng() * Math.PI * 2;
  const px = Math.cos(playerAngle) * (FIELD_R * 0.72);
  const pz = Math.sin(playerAngle) * (FIELD_R * 0.72);

  buildProps(state.seed, biome, {
    avoid: [{ x: px, z: pz, r: 16 }, { x: 0, z: 0, r: 10 }],
    density: mission.density || 1,
    extra: mission.extraProps || null,
  });
  placeObjectiveProps(mission, biome, rng, { x: px, z: pz });
  resettleDetail();

  // Fire control is either bolted on for good, or on loan while you learn the
  // arc in act one.
  const fc = fireControlFitted(mission);
  state.fcFitted = fc.fitted;
  state.fcTrial = fc.trial;
  state.autoAiming = false;

  // ---- player ----
  const stats = derivedStats(profile);
  const camo = CAMOS[profile.camo] || CAMOS.olive;
  const player = new Tank({
    name: profile.name, chassis: profile.chassis, weaponId: profile.weapon,
    stats, hull: camo.hull, accent: camo.accent, isPlayer: true, faction: 'blue',
  });
  player.place(px, pz, dirToYaw(-px, -pz));
  state.tanks.push(player);
  state.player = player;
  state.playerName = profile.name;

  if (AUTO_MODE) {
    player.controller = new AIController(player, { role: 'line', skill: 0.6 });
  } else {
    player.controller = new PlayerController(player, { utility: stats.utility });
  }
  showAimFx(!AUTO_MODE);

  // ---- drone ----
  state.drone = new Drone(player, stats.droneMul, camo.accent);

  // ---- enemies ----
  const flat = [];
  for (const spec of mission.enemies || []) {
    for (let i = 0; i < (spec.count || 1); i++) flat.push(spec);
  }
  const waveCount = mission.objective.waves || 1;
  state.spawnQueue = [];
  if (waveCount > 1) {
    const per = Math.ceil(flat.length / waveCount);
    for (let w = 0; w < waveCount; w++) {
      state.spawnQueue.push(flat.slice(w * per, (w + 1) * per));
    }
  } else {
    state.spawnQueue.push(flat);
  }
  state.names = shuffled(ENEMY_NAMES).filter((n) => n !== profile.name);
  state.nameIdx = 0;
  state.waveIndex = 0;
  spawnNextWave(playerAngle);

  if (mission.boss) spawnBoss(mission.boss, playerAngle);
  if (mission.objective.kind === 'escort') spawnConvoy(playerAngle);

  // ---- objective ----
  state.objective = makeObjective(mission);
  buildObjectiveVisual(state.objective);

  state.camMode = 'chase';
  state.zoom = 1.15;
  state.phase = 'countdown';
  state.countdown = 3.2;
  state.screen = 'battle';
  state.inBattle = true;
  resetCamera(player);
  AudioFX.startEngine();
  AudioFX.droneHum(true);
  flushTerrain();
  emit('battle-start', mission);
}

function nextName() {
  const n = state.names[state.nameIdx % state.names.length] || 'HOSTILE';
  state.nameIdx++;
  return n;
}

function spawnNextWave(playerAngle) {
  const batch = state.spawnQueue[state.waveIndex];
  if (!batch) return false;
  state.waveIndex++;
  const n = batch.length;
  for (let i = 0; i < n; i++) {
    const spec = batch[i];
    const spread = (i / Math.max(1, n - 0.999) - 0.5) * 1.5;
    const a = playerAngle + Math.PI + spread;
    const r = FIELD_R * (0.5 + Math.random() * 0.34);
    spawnEnemy(spec, Math.cos(a) * r, Math.sin(a) * r);
  }
  if (state.waveIndex > 1) {
    emit('toast', 'REINFORCEMENTS INBOUND');
    AudioFX.horn();
  }
  return true;
}

function spawnEnemy(spec, x, z) {
  const stats = enemyStats(spec.chassis, spec.weapon, spec.skill, spec.hpMul || 1);
  const role = spec.role || 'line';
  const t = new Tank({
    name: nextName(), chassis: spec.chassis, weaponId: spec.weapon, stats,
    hull: ENEMY_HULL_TINT[role] || 0x4a3e34,
    accent: ENEMY_ACCENT[Math.floor(Math.random() * ENEMY_ACCENT.length)],
    faction: 'red', role, personality: ROLES[role],
  });
  t.place(x, z, dirToYaw(-x, -z));
  t.controller = new AIController(t, { role, skill: spec.skill });
  state.tanks.push(t);
  return t;
}

function spawnBoss(boss, playerAngle) {
  const stats = enemyStats(boss.chassis, boss.weapon, boss.skill, boss.hpMul);
  const a = playerAngle + Math.PI;
  const r = FIELD_R * 0.55;
  const t = new Tank({
    name: boss.name, chassis: boss.chassis, weaponId: boss.weapon, stats,
    hull: 0x2e2422, accent: 0xff2d2d, faction: 'red', role: 'boss',
    boss: true, personality: ROLES.boss,
  });
  t.place(Math.cos(a) * r, Math.sin(a) * r, dirToYaw(-Math.cos(a), -Math.sin(a)));
  t.controller = new BossController(t, { skill: boss.skill });
  state.tanks.push(t);
  state.boss = t;
  return t;
}

function spawnConvoy(playerAngle) {
  const a = playerAngle + 0.4;
  const startX = Math.cos(a) * (FIELD_R * 0.82);
  const startZ = Math.sin(a) * (FIELD_R * 0.82);
  const endX = -startX * 0.92;
  const endZ = -startZ * 0.92;
  const stats = enemyStats('siege', 'ap76', 0.1, 1.1);
  stats.hpMax = state.mission.objective.hp || 320;
  stats.speed = 9.5;
  stats.accel = 22;
  stats.weapon = { ...stats.weapon, reload: 999, dmg: 0, splashDmg: 0 };
  convoy = new Tank({
    name: 'HAULER', chassis: 'truck', weaponId: 'ap76', stats,
    hull: 0x6a5a3a, accent: 0xffd750, faction: 'blue',
  });
  convoy.place(startX, startZ, dirToYaw(endX - startX, endZ - startZ));
  convoy.isConvoy = true;
  convoy.controller = {
    update() {
      const dx = endX - convoy.pos.x, dz = endZ - convoy.pos.z;
      const d = Math.hypot(dx, dz);
      convoy.moveDir.set(dx / (d || 1), dz / (d || 1));
      convoy.wantFire = false;
      convoy.aimPoint.set(endX, 1, endZ);
      if (d < 9) {
        convoy.arrived = true;
        convoy.moveDir.set(0, 0);
      }
    },
  };
  state.tanks.push(convoy);
  state.convoy = convoy;
  state.convoyGoal = { x: endX, z: endZ };
}

function placeObjectiveProps(mission, biome, rng, avoid) {
  const o = mission.objective;
  if (o.kind !== 'demolish') return;
  const pal = paletteFor(biome);
  let placed = 0;
  let guard = 0;
  while (placed < o.goal && guard++ < 200) {
    const a = rng() * Math.PI * 2;
    const r = 22 + rng() * (FIELD_R - 40);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.hypot(x - avoid.x, z - avoid.z) < 26) continue;
    let clash = false;
    for (const p of props) {
      if (p.objective && Math.hypot(p.grp.position.x - x, p.grp.position.z - z) < 34) { clash = true; break; }
    }
    if (clash) continue;
    const p = addProp(o.propKind || 'silo', x, z, rng, pal, {
      objective: true, hpMul: 1.5, label: (o.label || 'TARGET') + ' ' + (placed + 1),
    });
    if (p) placed++;
  }
  rebuildObstacles();
}

// ---------------------------------------------------------------------------
// Objectives
// ---------------------------------------------------------------------------

function makeObjective(mission) {
  const o = mission.objective;
  const base = {
    kind: o.kind, progress: 0, goal: o.goal || 0, done: false, failed: false,
    timeLeft: 0, label: '', hint: mission.intel || null,
  };
  switch (o.kind) {
    case 'destroy_all':
      base.goal = countEnemySpecs(mission);
      base.label = 'DESTROY ALL HOSTILES';
      break;
    case 'destroy_count':
      base.label = 'DESTROY ' + o.goal + ' HOSTILES';
      break;
    case 'survive':
      base.timeLeft = o.goal;
      base.label = 'SURVIVE';
      break;
    case 'demolish':
      base.label = 'DESTROY ' + o.goal + ' ' + (o.label || 'TARGETS');
      break;
    case 'hold':
      base.timeLeft = o.goal;
      base.zoneR = o.zoneR || 24;
      base.label = 'HOLD THE ZONE';
      break;
    case 'escort':
      base.label = 'ESCORT THE HAULER';
      break;
    case 'recon':
      base.label = 'MARK ' + o.goal + ' CONTACTS';
      break;
    case 'boss':
      base.label = 'DESTROY ' + (mission.boss ? mission.boss.name : 'THE COMMAND HULL');
      break;
    default:
      base.label = 'ENGAGE';
  }
  return base;
}

function countEnemySpecs(mission) {
  let n = 0;
  for (const s of mission.enemies || []) n += s.count || 1;
  if (mission.boss) n++;
  return n;
}

function buildObjectiveVisual(obj) {
  clearObjectiveVisual();
  if (obj.kind !== 'hold') return;
  const g = new THREE.Group();
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x6affc8, transparent: true, opacity: 0.5, side: THREE.DoubleSide,
    depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(obj.zoneR - 0.7, obj.zoneR, 72), ringMat);
  ring.rotation.x = -Math.PI / 2;
  g.add(ring);
  const wallMat = new THREE.MeshBasicMaterial({
    color: 0x6affc8, transparent: true, opacity: 0.07, side: THREE.DoubleSide,
    depthWrite: false, fog: false,
  });
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(obj.zoneR, obj.zoneR, 7, 48, 1, true), wallMat);
  wall.position.y = 3.5;
  g.add(wall);
  // sit the ring on the terrain by sampling a ring of heights
  g.position.y = terrainHeight(0, 0) + 0.3;
  actorRoot.add(g);
  objectiveMesh = g;
}

function clearObjectiveVisual() {
  if (!objectiveMesh) return;
  objectiveMesh.traverse((n) => {
    if (n.geometry) n.geometry.dispose();
    if (n.material) n.material.dispose();
  });
  actorRoot.remove(objectiveMesh);
  objectiveMesh = null;
}

function updateObjective(dt) {
  const obj = state.objective;
  if (!obj || obj.done || obj.failed) return;
  const mission = state.mission;
  const o = mission.objective;
  const enemies = enemyTanks();

  switch (obj.kind) {
    case 'destroy_all': {
      obj.progress = obj.goal - enemies.length - remainingQueued();
      if (enemies.length === 0) {
        if (state.waveIndex < state.spawnQueue.length) spawnNextWave(playerSpawnAngle());
        else completeObjective();
      }
      break;
    }
    case 'destroy_count': {
      obj.progress = killsThisBattle;
      if (killsThisBattle >= obj.goal) completeObjective();
      else if (enemies.length === 0 && state.waveIndex < state.spawnQueue.length) {
        spawnNextWave(playerSpawnAngle());
      } else if (enemies.length === 0) {
        reinforce(dt, 3);
      }
      break;
    }
    case 'survive': {
      obj.timeLeft -= dt;
      obj.progress = clamp01(1 - obj.timeLeft / o.goal);
      reinforce(dt, Math.min(6, 3 + Math.floor(state.battleTime / 30)));
      if (obj.timeLeft <= 0) completeObjective();
      break;
    }
    case 'demolish': {
      const targets = objectiveProps();
      const dead = targets.filter((p) => !p.alive).length;
      obj.progress = dead;
      if (dead >= obj.goal) completeObjective();
      break;
    }
    case 'hold': {
      const p = state.player;
      const inside = p && p.alive &&
        Math.hypot(p.pos.x, p.pos.z) < obj.zoneR;
      obj.inside = inside;
      if (inside) obj.timeLeft -= dt;
      obj.progress = clamp01(1 - obj.timeLeft / o.goal);
      reinforce(dt, Math.min(7, 4 + Math.floor(state.battleTime / 35)));
      if (objectiveMesh) {
        objectiveMesh.children[0].material.opacity = inside ? 0.55 : 0.25;
        objectiveMesh.children[1].material.opacity = inside ? 0.1 : 0.045;
      }
      if (obj.timeLeft <= 0) completeObjective();
      break;
    }
    case 'escort': {
      if (!convoy) break;
      obj.progress = convoyProgress();
      if (convoy.arrived) completeObjective();
      break;
    }
    case 'recon': {
      obj.progress = reconMarks.size;
      if (reconMarks.size >= obj.goal) completeObjective();
      break;
    }
    case 'boss': {
      const b = state.boss;
      obj.progress = b ? 1 - b.hpFrac : 1;
      if (b && !b.alive) completeObjective();
      break;
    }
    default: break;
  }
}

function remainingQueued() {
  let n = 0;
  for (let i = state.waveIndex; i < state.spawnQueue.length; i++) {
    n += state.spawnQueue[i].length;
  }
  return n;
}

function playerSpawnAngle() {
  const p = state.player;
  return p ? Math.atan2(p.pos.z, p.pos.x) : 0;
}

// Trickle in fresh hostiles for the open-ended objectives.
function reinforce(dt, maxAlive) {
  reinforceT -= dt;
  if (reinforceT > 0) return;
  const enemies = enemyTanks();
  if (enemies.length >= maxAlive) { reinforceT = 1.5; return; }
  reinforceT = rand(3.5, 6.5);
  const pool = state.mission.enemies;
  const spec = pool[Math.floor(Math.random() * pool.length)];
  const a = playerSpawnAngle() + Math.PI + rand(-1.1, 1.1);
  const r = FIELD_R * 0.88;
  spawnEnemy({ ...spec, count: 1 }, Math.cos(a) * r, Math.sin(a) * r);
}

function convoyProgress() {
  if (!convoy || !state.convoyGoal) return 0;
  const total = Math.hypot(state.convoyGoal.x * 2, state.convoyGoal.z * 2) || 1;
  const left = Math.hypot(state.convoyGoal.x - convoy.pos.x, state.convoyGoal.z - convoy.pos.z);
  return clamp01(1 - left / total);
}

function completeObjective() {
  if (state.objective.done || endedFlag) return;
  state.objective.done = true;
  endBattle(true);
}

export function failBattle(reason) {
  if (endedFlag) return;
  state.objective.failed = true;
  state.objective.failReason = reason;
  endBattle(false);
}

// ---------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------

// Said once, on the first battle of a save, and never again. A commander who
// does not know the gun is laying itself will fight it.
function firstBattleHint() {
  if (profile.seen.intro || AUTO_MODE) return;
  profile.seen.intro = true;
  markDirty();
  const msg = state.fcFitted
    ? (profile.settings.autoAim !== false
      ? 'FIRE CONTROL ON LOAN — HOLD FIRE AND IT LAYS THE GUN'
      : 'FIRE CONTROL IS SWITCHED OFF — EVERY SHOT IS YOURS')
    : 'NO FIRE CONTROL — READ THE WIND AND LEAD THEM';
  setTimeout(() => emit('toast', msg), 1400);
}

export function updateBattle(dt, rawDt) {
  if (state.phase === 'countdown') {
    state.countdown -= rawDt;
    const n = Math.ceil(state.countdown);
    if (n !== state.lastCount && n > 0) {
      state.lastCount = n;
      emit('banner', { text: String(n), small: false });
      AudioFX.tick();
    }
    if (state.countdown <= 0) {
      state.phase = 'playing';
      emit('banner', { text: 'ENGAGE', small: false });
      AudioFX.horn();
      firstBattleHint();
    }
    updateAllTanks(dt);
    if (state.drone) state.drone.update(dt);
    updateProps(dt);
    updateParticles(dt);
    flushTerrain();
    return;
  }

  if (state.phase !== 'playing') {
    // post-battle: let the world keep burning behind the results panel
    updateAllTanks(dt);
    if (state.drone) state.drone.update(dt);
    updateProjectiles(dt);
    updateProps(dt);
    updateParticles(dt);
    updateUtilities(dt);
    flushTerrain();
    return;
  }

  state.battleTime += dt;
  if (state.streakTimer > 0) {
    state.streakTimer -= dt;
    if (state.streakTimer <= 0) state.streak = 0;
  }

  updateAllTanks(dt);
  if (state.drone) state.drone.update(dt);
  updateFiring(dt);
  updateProjectiles(dt);
  updateProps(dt);
  updateUtilities(dt);
  updateParticles(dt);
  updateObjective(dt);
  flushTerrain();

  // engine note follows the player's throttle
  const p = state.player;
  if (p && p.alive) {
    AudioFX.setEngine(Math.hypot(p.moveDir.x, p.moveDir.y),
      clamp01(p.speed / Math.max(1, p.stats.speed)));
  } else {
    AudioFX.setEngine(0, 0);
  }

  if (p && !p.alive && !endedFlag) failBattle('HULL DESTROYED');
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export function endBattle(win) {
  if (endedFlag) return;
  endedFlag = true;
  state.phase = win ? 'won' : 'lost';
  endKillCam();
  state.timeScale = 1;
  AudioFX.setEngine(0, 0);
  AudioFX.droneHum(false);

  const mission = state.mission;
  const par = mission.par || 180;
  const t = state.battleTime;
  const p = state.player;
  const hpFrac = p ? p.hpFrac : 0;

  let stars = 0;
  if (win) {
    stars = 1;
    if (t <= par) stars = 2;
    if (t <= par && hpFrac >= 0.5) stars = 3;
  }

  const accuracy = state.shots > 0 ? clamp01(state.hits / state.shots) : 0;
  const timeBonus = win ? Math.max(0, Math.round((par - t) * 5)) : 0;
  const score = Math.round(
    state.kills * 120 + state.damageDealt * 0.55 + state.propsKilled * 10 +
    (win ? 400 : 0) + timeBonus + state.bestStreak * 40);
  state.score = score;

  const difficulty = mission.skirmish
    ? 0.4 + mission.tier * 0.32
    : 0.5 + (mission.act || 1) * 0.3;
  const pay = payout({ score, difficulty, win, stars });
  if (mission.scrapBase) pay.scrap += Math.round(mission.scrapBase * (win ? 1 : 0.35));

  const bpBase = mission.bpBase || 240;
  const bpDelta = win
    ? Math.round(bpBase * (0.72 + 0.28 * (stars / 3)) * (1 + accuracy * 0.3))
    : -Math.round(bpBase * 0.26);
  const rank = applyBP(bpDelta);

  addScrap(pay.scrap);
  const lvl = addXp(pay.xp);
  recordBattle({
    win, kills: state.kills, shots: state.shots, hits: state.hits,
    props: state.propsKilled, died: !win, longestKill: state.longestKill,
  });

  const unlocked = [];
  if (win && mission.unlock && !owns(mission.unlock.kind, mission.unlock.id)) {
    acquire(mission.unlock.kind, mission.unlock.id);
    unlocked.push(mission.unlock);
  }
  if (win && !mission.skirmish) {
    setMissionResult(mission.id, stars, score);
    if (mission.act && profile.act < mission.act + 1) {
      const acts = MISSION_ACT_LAST[mission.act];
      if (acts && mission.id === acts) profile.act = mission.act + 1;
    }
  }

  const results = {
    win, stars, score, accuracy, time: t, par, kills: state.kills,
    shots: state.shots, hits: state.hits, props: state.propsKilled,
    damage: Math.round(state.damageDealt), taken: Math.round(state.damageTaken),
    longestKill: Math.round(state.longestKill), streak: state.bestStreak,
    scrap: pay.scrap, xp: pay.xp, bp: bpDelta, rank, level: lvl,
    unlocked, mission, hpLeft: Math.round(hpFrac * 100),
    reason: state.objective ? state.objective.failReason : null,
  };
  state.results = results;
  if (win) AudioFX.fanfare(); else AudioFX.dirge();
  emit('battle-over', results);
  return results;
}

const MISSION_ACT_LAST = { 1: 'a1m5', 2: 'a2m5', 3: 'a3m5', 4: 'a4m5' };

// ---------------------------------------------------------------------------
// Attract mode — a live firefight behind the menus
// ---------------------------------------------------------------------------

const ATTRACT_BIOMES = ['desert', 'farmland', 'tundra', 'forest', 'industrial', 'volcanic'];
const ATTRACT_TIMES = ['dawn', 'golden', 'dusk', 'night', 'noon', 'storm'];
const ATTRACT_GUNS = ['ap76', 'he120', 'twin30', 'mortar', 'rockets'];

export function startAttract() {
  clearBattle();
  resetBattleTallies();
  const seed = Math.floor(Math.random() * 1e6);
  state.seed = seed;
  const biomeId = ATTRACT_BIOMES[Math.floor(Math.random() * ATTRACT_BIOMES.length)];
  const timeId = ATTRACT_TIMES[Math.floor(Math.random() * ATTRACT_TIMES.length)];
  state.env = applyEnvironment({ time: timeId, biome: biomeId, seed });
  state.wind = rollWind(seed);
  buildProps(seed, BIOMES[biomeId], { avoid: [], density: 1 });
  resettleDetail();

  state.mission = null;
  state.objective = null;
  state.phase = 'attract';
  state.inBattle = false;
  state.names = shuffled(ENEMY_NAMES);
  state.nameIdx = 0;

  for (let i = 0; i < 6; i++) {
    const faction = i % 2 === 0 ? 'red' : 'blue';
    const a = (i / 6) * Math.PI * 2 + rand(-0.3, 0.3);
    const r = FIELD_R * rand(0.4, 0.72);
    const gun = ATTRACT_GUNS[Math.floor(Math.random() * ATTRACT_GUNS.length)];
    const hull = ['scout', 'mainline', 'siege', 'hunter'][Math.floor(Math.random() * 4)];
    const stats = enemyStats(hull, gun, 0.55, 1);
    const t = new Tank({
      name: nextName(), chassis: hull, weaponId: gun, stats,
      hull: faction === 'red' ? 0x4a3028 : 0x3c4436,
      accent: faction === 'red' ? 0xff5a3a : 0x6affc8,
      faction, role: 'line', personality: ROLES.line,
    });
    t.place(Math.cos(a) * r, Math.sin(a) * r);
    t.controller = new AIController(t, { role: 'line', skill: 0.5 });
    state.tanks.push(t);
  }
  AudioFX.setWeatherBed(state.env.weather);
  flushTerrain();
}

let attractResetT = 0;

export function updateAttract(dt) {
  updateAllTanks(dt);
  updateFiring(dt);
  updateProjectiles(dt);
  updateProps(dt);
  updateUtilities(dt);
  updateParticles(dt);
  flushTerrain();

  const red = state.tanks.filter((t) => t.alive && t.faction === 'red').length;
  const blue = state.tanks.filter((t) => t.alive && t.faction === 'blue').length;
  if (red === 0 || blue === 0) {
    attractResetT -= dt;
    if (attractResetT <= 0) {
      attractResetT = 0;
      startAttract();
    }
  } else {
    attractResetT = 4;
  }
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

export function clearBattle() {
  for (const t of state.tanks) t.dispose();
  state.tanks = [];
  state.player = null;
  state.boss = null;
  state.convoy = null;
  convoy = null;
  if (state.drone) { state.drone.dispose(); state.drone = null; }
  clearProjectiles();
  clearParticles();
  clearUtilities();
  clearProps();
  clearObjectiveVisual();
  state.objective = null;
  state.spawnQueue = [];
  state.waveIndex = 0;
  state.lastCount = -1;
  state.results = null;
  AudioFX.stopEngine();
  AudioFX.droneHum(false);
  AudioFX.setWeatherBed(null);
}
