// AI brains. One generic update function reads personality traits to vary
// behavior. Each tank has a `brainState` for persistent values.

import * as THREE from 'three';
import { CFG } from './config.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

function pickTarget(tank, tanks) {
  // Personality-driven target choice.
  const me = tank.root.position;
  const candidates = tanks.filter(t => t.alive && t !== tank);
  if (!candidates.length) return null;
  const p = tank.personality;
  switch (p.key) {
    case 'aggressive':
    case 'berserker':
    case 'bully': {
      // Prefer the player if close-ish, else nearest.
      const player = candidates.find(t => t.isPlayer);
      if (player) {
        const d = player.root.position.distanceTo(me);
        if (p.key === 'bully' && d < 70) return player;
        if (d < 50) return player;
      }
      return nearestTo(candidates, me);
    }
    case 'hunter': {
      // Prefer the weakest.
      let best = null, bestScore = Infinity;
      for (const t of candidates) {
        const d = t.root.position.distanceTo(me);
        const score = t.health * 6 + d * 0.5;
        if (score < bestScore) { bestScore = score; best = t; }
      }
      return best;
    }
    case 'sniper': {
      // Prefer mid-range targets, avoid those too close.
      let best = null, bestScore = Infinity;
      for (const t of candidates) {
        const d = t.root.position.distanceTo(me);
        const ideal = p.idealRange;
        const score = Math.abs(d - ideal) - t.kills * 4;
        if (score < bestScore) { bestScore = score; best = t; }
      }
      return best;
    }
    case 'coward': {
      // Pick nearest only if forced; usually nobody.
      return nearestTo(candidates, me);
    }
    case 'chaos': {
      return candidates[Math.floor(Math.random() * candidates.length)];
    }
    case 'defender':
    case 'cautious':
    case 'balanced':
    default:
      return nearestTo(candidates, me);
  }
}

function nearestTo(arr, me) {
  let best = null, bestD = Infinity;
  for (const t of arr) {
    const d = t.root.position.distanceTo(me);
    if (d < bestD) { bestD = d; best = t; }
  }
  return best;
}

// Compute steering away from nearby allies (so tanks don't stack).
function computeSeparation(tank, tanks) {
  const me = tank.root.position;
  const out = new THREE.Vector3();
  for (const o of tanks) {
    if (!o.alive || o === tank) continue;
    const d = me.distanceTo(o.root.position);
    if (d < CFG.ai.avoidRadius && d > 0.001) {
      const away = me.clone().sub(o.root.position).setY(0).normalize();
      out.addScaledVector(away, (CFG.ai.avoidRadius - d) / CFG.ai.avoidRadius);
    }
  }
  return out;
}

// Bring a yaw toward a desired vector (XZ). Returns yaw in tank-body space.
function yawTo(target) {
  return Math.atan2(target.x, target.z);
}

export function aiBrain(tank, ctx, dt) {
  if (!tank.alive) return;

  const state = tank.brainState ||= {
    target: null,
    targetTimer: 0,
    wanderAngle: Math.random() * Math.PI * 2,
    wanderTimer: 0,
    aimErr: new THREE.Vector3(),
    aimErrTimer: 0,
    fireWindup: 0,
  };
  const p = tank.personality;
  const me = tank.root.position;

  // Re-evaluate target periodically or if current is dead.
  state.targetTimer -= dt;
  if (!state.target || !state.target.alive ||
      state.targetTimer <= 0 ||
      state.target.root.position.distanceTo(me) > CFG.ai.losePursuitDist) {
    state.target = pickTarget(tank, ctx.tanks);
    state.targetTimer = CFG.ai.targetReevalSec * (0.8 + Math.random() * 0.6);
  }
  const tgt = state.target;

  // Refresh aim noise periodically — simulates imperfect tracking.
  state.aimErrTimer -= dt;
  if (state.aimErrTimer <= 0) {
    state.aimErrTimer = 0.4 + Math.random() * 0.5;
    const noise = CFG.ai.aimNoise * p.aimNoiseMul;
    state.aimErr.set(
      (Math.random() - 0.5) * noise * 4,
      (Math.random() - 0.5) * noise * 2,
      (Math.random() - 0.5) * noise * 4
    );
  }

  if (!tgt) {
    // No target: idle wander.
    wanderStep(tank, state, dt);
    tank.wantsFire = false;
    return;
  }

  const toTgt = _v1.subVectors(tgt.root.position, me).setY(0);
  const dist = toTgt.length();
  toTgt.normalize();

  const sep = computeSeparation(tank, ctx.tanks);
  const lowHp = tank.health / tank.maxHealth <= p.retreatHp;

  // Decide drive: approach to ideal range, retreat if low hp.
  let driveForward = 0;
  let bodyDir = toTgt.clone();
  const ideal = p.idealRange;

  if (lowHp) {
    // Retreat: face away from target.
    bodyDir = toTgt.clone().multiplyScalar(-1);
    driveForward = 1;
  } else if (dist > ideal + 6) {
    driveForward = 1;
  } else if (dist < ideal - 6) {
    // Too close — back off but keep facing target.
    bodyDir = toTgt.clone();
    driveForward = -0.6;
  } else {
    // In range — strafe by oscillating yaw a bit.
    state.wanderTimer -= dt;
    if (state.wanderTimer <= 0) {
      state.wanderTimer = 0.6 + Math.random() * 1.2;
      state.wanderAngle = (Math.random() - 0.5) * 0.9;
    }
    bodyDir = toTgt.clone();
    // Apply slight perpendicular wobble to drive direction:
    const perp = new THREE.Vector3(-bodyDir.z, 0, bodyDir.x);
    bodyDir.addScaledVector(perp, state.wanderAngle * 0.6).normalize();
    driveForward = 0.6;
  }

  // Mix in separation steering.
  if (sep.lengthSq() > 0.001) {
    bodyDir.add(sep).normalize();
  }

  // Berserker-style sometimes "dashes" — random forward sprint regardless.
  if (Math.random() < p.dashChance * dt) {
    driveForward = 1;
  }

  tank.driveForward = driveForward;
  tank.targetBodyYaw = yawTo(bodyDir);

  // Aim at target with noise.
  tank.aimPoint.copy(tgt.root.position);
  tank.aimPoint.y += 1.0;
  tank.aimPoint.add(state.aimErr);

  // Fire if in range and roughly facing target with turret.
  // (We measure dir from muzzle to target vs. barrel forward.)
  const muzzle = _v1.copy(tank.root.userData.muzzleLocal);
  tank.barrel.localToWorld(muzzle);
  const want = _v2.subVectors(tank.aimPoint, muzzle).normalize();
  const have = tank.getBarrelDir();
  const align = have.dot(want); // 1 = perfectly aligned
  const inRange = dist < CFG.ai.fireRange;

  // Sniper waits a beat to "line up shot".
  if (inRange && align > 0.985 && !lowHp) {
    state.fireWindup += dt;
  } else {
    state.fireWindup = Math.max(0, state.fireWindup - dt * 0.5);
  }
  const windupNeeded = (p.key === 'sniper') ? 0.3 : 0.05;
  tank.wantsFire = inRange && align > 0.97 && state.fireWindup >= windupNeeded;
}

function wanderStep(tank, state, dt) {
  state.wanderTimer -= dt;
  if (state.wanderTimer <= 0) {
    state.wanderTimer = 1.2 + Math.random() * 1.8;
    state.wanderAngle += (Math.random() - 0.5) * 1.5;
  }
  const dir = new THREE.Vector3(Math.sin(state.wanderAngle), 0, Math.cos(state.wanderAngle));
  tank.targetBodyYaw = Math.atan2(dir.x, dir.z);
  tank.driveForward = 0.5;
  tank.aimPoint.copy(tank.root.position).addScaledVector(dir, 30).setY(2);
  tank.wantsFire = false;
}
