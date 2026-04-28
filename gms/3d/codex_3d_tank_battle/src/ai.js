import * as THREE from 'three';
import { ARENA_RADIUS, TUNING } from './config.js';
import { angleTo, choose, distanceXZ, randomPointInArena } from './utils.js';

const tmp = new THREE.Vector3();

export function updateAiTank(tank, tanks, obstacles, dt) {
  const livingEnemies = tanks.filter((other) => other.alive && other.id !== tank.id);
  if (!livingEnemies.length) {
    return { move: new THREE.Vector3(), aim: tank.root.position.clone(), wantsFire: false };
  }

  tank.brain.retargetTimer -= dt;
  const current = livingEnemies.find((other) => other.id === tank.brain.targetId);
  if (!current || tank.brain.retargetTimer <= 0) {
    const target = chooseTarget(tank, livingEnemies);
    tank.brain.targetId = target.id;
    tank.brain.retargetTimer = 0.7 + Math.random() * 1.2;
    if (Math.random() > 0.64) tank.brain.strafeSide *= -1;
  }

  tank.brain.wanderTimer -= dt;
  if (tank.brain.wanderTimer <= 0) {
    tank.brain.wanderPoint = randomPointInArena(ARENA_RADIUS - 9, 8);
    tank.brain.wanderTimer = 2.2 + Math.random() * 2.6;
  }

  const target = livingEnemies.find((other) => other.id === tank.brain.targetId) || livingEnemies[0];
  const personality = tank.personality;
  const distance = distanceXZ(tank.root.position, target.root.position);
  const toTarget = tmp.subVectors(target.root.position, tank.root.position);
  toTarget.y = 0;
  toTarget.normalize();

  const strafe = new THREE.Vector3(toTarget.z * tank.brain.strafeSide, 0, -toTarget.x * tank.brain.strafeSide);
  const move = new THREE.Vector3();
  const lowArmor = tank.hp <= personality.retreatHealth;

  if (lowArmor || distance < personality.preferredRange * 0.62) {
    move.addScaledVector(toTarget, -1.1);
    move.addScaledVector(strafe, personality.strafe);
  } else if (distance > personality.preferredRange * 1.18) {
    move.addScaledVector(toTarget, personality.courage + 0.25);
    move.addScaledVector(strafe, personality.strafe * 0.35);
  } else {
    move.addScaledVector(strafe, personality.strafe);
  }

  avoidWalls(tank, move);
  avoidObstacles(tank, obstacles, move);
  if (move.lengthSq() < 0.05 && tank.brain.wanderPoint) {
    move.subVectors(tank.brain.wanderPoint, tank.root.position);
    move.y = 0;
  }
  if (move.lengthSq() > 1) move.normalize();

  const aim = target.root.position.clone();
  const noise = personality.aimNoise * Math.max(0.15, distance / 42);
  aim.x += (Math.random() - 0.5) * noise;
  aim.z += (Math.random() - 0.5) * noise;

  const desiredYaw = angleTo(tank.root.position, aim);
  const aimError = Math.abs(shortAngle(tank.turretYaw, desiredYaw));
  const inRange = distance <= personality.engageRange;
  const wantsFire = inRange && aimError < 0.23 && Math.random() < personality.fireDiscipline;

  return { move, aim, wantsFire };
}

function chooseTarget(tank, enemies) {
  switch (tank.personality.id) {
    case 'cautious':
      return choose([...enemies].sort((a, b) => distanceXZ(tank.root.position, b.root.position) - distanceXZ(tank.root.position, a.root.position)).slice(0, 3));
    case 'sniper':
      return [...enemies].sort((a, b) => distanceXZ(tank.root.position, b.root.position) - distanceXZ(tank.root.position, a.root.position))[0];
    case 'opportunist':
      return [...enemies].sort((a, b) => a.hp - b.hp || distanceXZ(tank.root.position, a.root.position) - distanceXZ(tank.root.position, b.root.position))[0];
    case 'hunter':
      return [...enemies].sort((a, b) => b.kills - a.kills || distanceXZ(tank.root.position, a.root.position) - distanceXZ(tank.root.position, b.root.position))[0];
    default:
      return [...enemies].sort((a, b) => distanceXZ(tank.root.position, a.root.position) - distanceXZ(tank.root.position, b.root.position))[0];
  }
}

function avoidWalls(tank, move) {
  const distance = Math.hypot(tank.root.position.x, tank.root.position.z);
  if (distance > ARENA_RADIUS - 8) {
    move.x -= tank.root.position.x / distance;
    move.z -= tank.root.position.z / distance;
  }
}

function avoidObstacles(tank, obstacles, move) {
  for (const obstacle of obstacles) {
    const distance = distanceXZ(tank.root.position, obstacle.position);
    const danger = obstacle.radius + tank.radius + 3.2;
    if (distance < danger) {
      move.x += (tank.root.position.x - obstacle.position.x) / Math.max(distance, 0.001);
      move.z += (tank.root.position.z - obstacle.position.z) / Math.max(distance, 0.001);
    }
  }
}

function shortAngle(a, b) {
  let value = b - a;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}
