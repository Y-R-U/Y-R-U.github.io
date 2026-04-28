import * as THREE from 'three';
import { updateAiTank } from './ai.js';
import { createExplosion, createShell } from './combat.js';
import { ARENA_RADIUS, COLORS, GAME_MODES, PERSONALITIES, TUNING } from './config.js';
import { createInput } from './input.js';
import { createBattleNames, getStoredPlayerName } from './names.js';
import { createTankEntity, markTankDestroyed } from './tankFactory.js';
import { createUi, rankTanks } from './ui.js';
import { angleTo, clamp, distanceXZ, keepInsideArena, lerpAngle, resolveCircleCollision } from './utils.js';
import { createWorld } from './world.js';

const canvas = document.getElementById('game-canvas');
const world = createWorld(canvas);
const ui = createUi();
const input = createInput(canvas, {
  fireButton: ui.el.fireButton,
  stickZone: ui.el.stickZone,
  stickKnob: document.getElementById('stick-knob')
});

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.8);
const aimPoint = new THREE.Vector3();
const tmpVec = new THREE.Vector3();
const tmpVec2 = new THREE.Vector3();

const state = {
  phase: 'menu',
  mode: GAME_MODES.skirmish,
  playerName: getStoredPlayerName(),
  player: null,
  tanks: [],
  shells: [],
  explosions: [],
  eliminationOrder: 0,
  endTimer: 0
};

ui.setPlayerName(state.playerName);
ui.showMenu();
ui.el.startButton.addEventListener('click', startBattle);
ui.el.restartButton.addEventListener('click', startBattle);
ui.onRename((name) => {
  state.playerName = name;
  if (state.player) state.player.name = name;
});

if (new URLSearchParams(window.location.search).get('demo') === '1') {
  startBattle();
}

requestAnimationFrame(loop);

function startBattle() {
  cleanupBattle();
  state.phase = 'running';
  state.endTimer = 0;
  state.eliminationOrder = 0;
  state.tanks = createRoster();
  state.player = state.tanks[0];
  state.tanks.forEach((tank) => world.scene.add(tank.root));
  ui.registerLabels(state.tanks);
  placeCamera();
  ui.showRunning();
}

function createRoster() {
  const aiNames = createBattleNames(state.playerName, state.mode.aiCount);
  const tanks = [];
  tanks.push(createTankEntity({
    id: 'player',
    name: state.playerName,
    isPlayer: true,
    personality: null,
    color: COLORS.player,
    accent: 0x4ff8ff,
    position: new THREE.Vector3(0, 0, 12)
  }));

  for (let i = 0; i < state.mode.aiCount; i += 1) {
    const angle = (i / state.mode.aiCount) * Math.PI * 2 + Math.random() * 0.28;
    const position = new THREE.Vector3(Math.cos(angle) * 25, 0, Math.sin(angle) * 25);
    const personality = PERSONALITIES[i % PERSONALITIES.length];
    tanks.push(createTankEntity({
      id: `ai-${i}`,
      name: aiNames[i],
      isPlayer: false,
      personality,
      color: COLORS.ai[i % COLORS.ai.length],
      accent: COLORS.ai[(i + 2) % COLORS.ai.length],
      position
    }));
  }
  return tanks;
}

function cleanupBattle() {
  state.tanks.forEach((tank) => world.scene.remove(tank.root));
  state.shells.forEach((shell) => world.scene.remove(shell.mesh));
  state.explosions.forEach((blast) => world.scene.remove(blast.group));
  state.tanks = [];
  state.shells = [];
  state.explosions = [];
}

function loop() {
  const dt = Math.min(clock.getDelta(), 0.033);
  if (state.phase === 'running') update(dt);
  world.renderer.render(world.scene, world.camera);
  if (state.phase === 'running') ui.updateLabels(state.tanks, world.camera);
  requestAnimationFrame(loop);
}

function update(dt) {
  const controls = input.frame();
  updateAimPoint(controls.pointer);

  for (const tank of state.tanks) {
    if (!tank.alive) continue;
    tank.cooldown = Math.max(0, tank.cooldown - dt);
    if (tank.isPlayer) {
      updateTank(tank, controls.move, aimPoint, controls.firePressed || controls.fireHeld, dt);
    } else {
      const ai = updateAiTank(tank, state.tanks, world.obstacles, dt);
      updateTank(tank, ai.move, ai.aim, ai.wantsFire, dt);
    }
  }

  resolveTankSeparation();
  updateShells(dt);
  updateExplosions(dt);
  updateCamera(dt);
  ui.updateHud(state.player, state.tanks);
  ui.updateLeaderboard(state.tanks, state.player.id);
  checkEnd(dt);
}

function updateAimPoint(pointer) {
  raycaster.setFromCamera(pointer, world.camera);
  if (!raycaster.ray.intersectPlane(aimPlane, aimPoint)) {
    aimPoint.copy(state.player?.root.position || tmpVec.set(0, 0, 0));
    aimPoint.z -= 10;
  }
}

function updateTank(tank, move, aim, wantsFire, dt) {
  const speed = tank.isPlayer ? TUNING.playerSpeed : TUNING.aiSpeed;
  tmpVec.copy(move);
  if (tmpVec.lengthSq() > 1) tmpVec.normalize();

  const targetVelocity = tmpVec.multiplyScalar(speed);
  tank.velocity.lerp(targetVelocity, clamp(TUNING.acceleration * dt, 0, 1));
  tank.root.position.addScaledVector(tank.velocity, dt);
  keepInsideArena(tank.root.position, ARENA_RADIUS, tank.radius);
  resolveObstacleCollision(tank);

  if (tank.velocity.lengthSq() > 0.08) {
    tank.yaw = lerpAngle(tank.yaw, Math.atan2(tank.velocity.x, tank.velocity.z), TUNING.turnRate * dt);
    tank.root.rotation.y = tank.yaw;
  }

  const desiredTurret = angleTo(tank.root.position, aim);
  tank.turretYaw = lerpAngle(tank.turretYaw, desiredTurret, TUNING.turretTurnRate * dt);
  tank.turretPivot.rotation.y = tank.turretYaw - tank.yaw;

  if (wantsFire) tryFire(tank);
}

function resolveObstacleCollision(tank) {
  for (const obstacle of world.obstacles) {
    resolveCircleCollision(tank.root.position, obstacle.position, tank.radius + obstacle.radius);
  }
}

function resolveTankSeparation() {
  const living = state.tanks.filter((tank) => tank.alive);
  for (let i = 0; i < living.length; i += 1) {
    for (let j = i + 1; j < living.length; j += 1) {
      const a = living[i];
      const b = living[j];
      if (distanceXZ(a.root.position, b.root.position) < a.radius + b.radius) {
        tmpVec.subVectors(a.root.position, b.root.position).setY(0);
        if (tmpVec.lengthSq() === 0) tmpVec.set(Math.random() - 0.5, 0, Math.random() - 0.5);
        tmpVec.normalize().multiplyScalar(0.12);
        a.root.position.add(tmpVec);
        b.root.position.sub(tmpVec);
      }
    }
  }
}

function tryFire(tank) {
  if (tank.cooldown > 0) return;
  const origin = new THREE.Vector3();
  tank.muzzle.getWorldPosition(origin);
  const direction = new THREE.Vector3(Math.sin(tank.turretYaw), 0, Math.cos(tank.turretYaw)).normalize();
  const shell = createShell(tank, origin, direction);
  state.shells.push(shell);
  world.scene.add(shell.mesh);
  tank.cooldown = TUNING.fireCooldown + (tank.isPlayer ? 0 : TUNING.aiFireCooldownBonus * Math.random());
}

function updateShells(dt) {
  for (let i = state.shells.length - 1; i >= 0; i -= 1) {
    const shell = state.shells[i];
    shell.age += dt;
    shell.life -= dt;
    shell.mesh.position.addScaledVector(shell.velocity, dt);

    let detonated = shell.life <= 0 || Math.hypot(shell.mesh.position.x, shell.mesh.position.z) > ARENA_RADIUS + 2;
    for (const obstacle of world.obstacles) {
      if (obstacle.blocksShells && distanceXZ(shell.mesh.position, obstacle.position) < obstacle.radius + shell.radius) {
        detonated = true;
        break;
      }
    }

    if (!detonated) {
      for (const tank of state.tanks) {
        if (!tank.alive || tank.id === shell.ownerId && shell.age < 0.16) continue;
        if (distanceXZ(shell.mesh.position, tank.root.position) < tank.radius + shell.radius) {
          detonated = true;
          break;
        }
      }
    }

    if (detonated) {
      detonateShell(shell);
      world.scene.remove(shell.mesh);
      state.shells.splice(i, 1);
    }
  }
}

function detonateShell(shell) {
  spawnExplosion(shell.mesh.position, shell.mesh.material.color.getHex());
  for (const tank of state.tanks) {
    if (!tank.alive) continue;
    if (tank.id === shell.ownerId && shell.age < 0.18) continue;
    const distance = distanceXZ(shell.mesh.position, tank.root.position);
    if (distance > TUNING.blastRadius + tank.radius) continue;
    const falloff = clamp(1 - Math.max(0, distance - tank.radius) / TUNING.blastRadius, 0.25, 1);
    damageTank(tank, shell.ownerId, TUNING.shellDamage * falloff);
  }
}

function damageTank(tank, ownerId, amount) {
  const attacker = state.tanks.find((candidate) => candidate.id === ownerId);
  tank.hp = Math.max(0, tank.hp - amount);
  if (attacker && attacker.id !== tank.id) attacker.damage += amount;

  if (tank.hp <= 0 && tank.alive) {
    markTankDestroyed(tank);
    tank.eliminatedAt = ++state.eliminationOrder;
    spawnExplosion(tank.root.position, tank.accent);
    if (attacker && attacker.id !== tank.id) attacker.kills += 1;
  }
}

function spawnExplosion(position, color) {
  const blast = createExplosion(position, color);
  state.explosions.push(blast);
  world.scene.add(blast.group);
}

function updateExplosions(dt) {
  for (let i = state.explosions.length - 1; i >= 0; i -= 1) {
    const blast = state.explosions[i];
    blast.age += dt;
    const fade = 1 - blast.age / blast.life;
    blast.group.children.forEach((child) => {
      child.position.addScaledVector(child.userData.velocity, dt);
      child.scale.setScalar(1 + blast.age * 2.4);
      child.material.opacity = Math.max(0, fade);
    });
    if (blast.age >= blast.life) {
      world.scene.remove(blast.group);
      state.explosions.splice(i, 1);
    }
  }
}

function updateCamera(dt) {
  const focusTank = state.player?.alive ? state.player : state.tanks.find((tank) => tank.alive) || state.player;
  const focus = focusTank?.root.position || tmpVec.set(0, 0, 0);
  const desired = tmpVec2.set(focus.x, TUNING.cameraHeight, focus.z + TUNING.cameraDistance);
  world.camera.position.lerp(desired, clamp(dt * 3.2, 0, 1));
  world.camera.lookAt(focus.x, 0, focus.z);
}

function placeCamera() {
  const focus = state.player?.root.position || tmpVec.set(0, 0, 0);
  world.camera.position.set(focus.x, TUNING.cameraHeight, focus.z + TUNING.cameraDistance);
  world.camera.lookAt(focus.x, 0, focus.z);
}

function checkEnd(dt) {
  const alive = state.tanks.filter((tank) => tank.alive);
  if (!state.player.alive && alive.length > 1) {
    ui.setBattleStatus(`Eliminated - spectating ${alive[0].name}`);
  } else {
    ui.setBattleStatus('');
  }
  if (alive.length > 1) {
    state.endTimer = 0;
    return;
  }
  state.endTimer += dt;
  if (state.endTimer < 1.2) return;

  const ranked = rankTanks(state.tanks);
  const standing = ranked.findIndex((tank) => tank.id === state.player.id) + 1;
  const winner = alive[0] || ranked[0];
  ui.showResult({ winner, player: state.player, standing });
  state.phase = 'ended';
}
