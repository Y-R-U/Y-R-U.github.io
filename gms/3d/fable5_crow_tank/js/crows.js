// The murder: low-poly crows that wheel overhead, flare their red eyes,
// then dive at the tank. Variants: crow (fodder), brute (tanky), boss
// ("Corvus Rex", every 5th wave).
//
// State machine per crow: orbit -> aim (eye flare warning) -> dive ->
// climb -> orbit. Killed crows tumble out of the sky and burst into
// feathers on the ground.

import * as THREE from 'three';
import { CROW, VARIANTS } from './config.js';
import { rand, clamp, damp, angLerp, pickRandom } from './utils.js';
import { scene } from './world.js';
import { AudioFX } from './audio.js';
import { featherBurst, sparkBurst, dustPuff } from './particles.js';
import { state } from './state.js';
import { scorePop } from './ui.js';

export const crows = [];
export let bossCrow = null;

let hooks = { getPlayerPos: () => new THREE.Vector3(), getPlayerVel: () => new THREE.Vector3(), damagePlayer: () => {} };

export function initCrows(h) {
  hooks = h;
}

// ---------------------------------------------------------------------------
// Mesh — shared geometry, per-crow eye material so eyes can flare
// ---------------------------------------------------------------------------

const bodyGeo = new THREE.ConeGeometry(0.34, 1.7, 6);
const headGeo = new THREE.IcosahedronGeometry(0.26, 0);
const beakGeo = new THREE.ConeGeometry(0.1, 0.5, 4);
const eyeGeo = new THREE.SphereGeometry(0.11, 6, 5);
const wingInGeo = new THREE.BoxGeometry(1.1, 0.05, 0.78);
const wingOutGeo = new THREE.BoxGeometry(1.15, 0.04, 0.5);
const tailGeo = new THREE.BoxGeometry(0.5, 0.04, 0.8);

const featherMat = new THREE.MeshStandardMaterial({
  color: 0x14161e, emissive: 0x0a0c14, emissiveIntensity: 0.6,
  flatShading: true, roughness: 0.55, metalness: 0.25 });
const beakMat = new THREE.MeshStandardMaterial({
  color: 0x2e2d33, flatShading: true, roughness: 0.7 });

function buildCrowMesh(scale) {
  const grp = new THREE.Group();
  const leanG = new THREE.Group();    // banking
  grp.add(leanG);

  const body = new THREE.Mesh(bodyGeo, featherMat);
  body.rotation.x = Math.PI / 2;      // taper to the tail (+z)
  body.castShadow = true;
  leanG.add(body);

  const head = new THREE.Mesh(headGeo, featherMat);
  head.position.set(0, 0.16, -0.78);
  leanG.add(head);

  const beak = new THREE.Mesh(beakGeo, beakMat);
  beak.rotation.x = -Math.PI / 2;
  beak.position.set(0, 0.1, -1.18);
  leanG.add(beak);

  const eyeMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0xff1818).multiplyScalar(1.4) });
  const eyes = [];
  [-0.13, 0.13].forEach((x) => {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(x, 0.2, -0.86);
    leanG.add(eye);
    eyes.push(eye);
  });

  // two-segment wings, pivoted at the shoulder so they flap and fold;
  // segments overlap at the elbow so the silhouette stays connected
  const wings = [];
  [-1, 1].forEach((side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.18, 0.1, -0.05);
    leanG.add(shoulder);
    const inner = new THREE.Mesh(wingInGeo, featherMat);
    inner.position.x = side * 0.52;
    inner.castShadow = true;
    shoulder.add(inner);
    const elbow = new THREE.Group();
    elbow.position.x = side * 0.98;
    shoulder.add(elbow);
    const outer = new THREE.Mesh(wingOutGeo, featherMat);
    outer.position.set(side * 0.5, 0, 0.06);
    outer.rotation.y = -side * 0.28;
    outer.castShadow = true;
    elbow.add(outer);
    wings.push({ shoulder, elbow, side });
  });

  const tail = new THREE.Mesh(tailGeo, featherMat);
  tail.position.set(0, 0, 1.0);
  leanG.add(tail);

  grp.scale.setScalar(scale);
  return { grp, leanG, eyes, eyeMat, wings };
}

// ---------------------------------------------------------------------------
// Spawning
// ---------------------------------------------------------------------------

export function spawnCrow(variantKey, speedScale = 1) {
  const v = VARIANTS[variantKey];
  const mesh = buildCrowMesh(v.scale);
  const a = rand(0, Math.PI * 2);
  const r = rand(70, 95);
  mesh.grp.position.set(Math.cos(a) * r, rand(20, 32), Math.sin(a) * r);
  scene.add(mesh.grp);

  const crow = {
    ...mesh,
    variant: variantKey,
    hp: v.hp,
    hitR: v.hitR,
    dmg: v.dmg,
    score: v.score,
    pitch: v.pitch,
    speedScale,
    pos: mesh.grp.position,
    vel: new THREE.Vector3(rand(-4, 4), 0, rand(-4, 4)),
    alive: true,
    dead: false,
    deadGroundT: 0,
    st: 'orbit',
    orbitA: rand(0, Math.PI * 2),
    orbitDir: Math.random() < 0.5 ? 1 : -1,
    orbitR: rand(CROW.orbitRMin, CROW.orbitRMax) * (variantKey === 'boss' ? 1.15 : 1),
    alt: rand(CROW.altMin, CROW.altMax) + (variantKey === 'brute' ? -2 : 0),
    bobP: rand(0, Math.PI * 2),
    diveT: rand(CROW.diveCdMin, CROW.diveCdMax),
    aimT: 0,
    flare: 0,
    flapP: rand(0, Math.PI * 2),
    prevYaw: 0,
    trailT: 0,
    diveTarget: new THREE.Vector3(),
  };
  crows.push(crow);
  if (variantKey === 'boss') {
    bossCrow = crow;
    state.bossAlive = true;
  }
  return crow;
}

export function aliveCount() {
  let n = 0;
  for (const c of crows) if (c.alive) n++;
  return n;
}

export function threatCrows() {
  return crows.filter((c) => c.alive && (c.st === 'aim' || c.st === 'dive'));
}

export function clearCrows() {
  for (const c of crows) scene.remove(c.grp);
  crows.length = 0;
  bossCrow = null;
  state.bossAlive = false;
}

// ---------------------------------------------------------------------------
// Damage (called by combat.js per shell hit). Returns true on kill.
// ---------------------------------------------------------------------------

export function damageCrow(crow, dmg, impactPos) {
  if (!crow.alive) return false;
  crow.hp -= dmg;
  sparkBurst(impactPos, 6, 0xff8030);
  crow.vel.x += rand(-3, 3);
  crow.vel.y += rand(1, 3);

  if (crow.hp > 0) {
    featherBurst(impactPos, 3, crow.variant === 'boss' ? 1.8 : 1);
    AudioFX.caw(crow.pitch * 1.2, 0.5);
    return false;
  }

  crow.alive = false;
  crow.dead = true;
  crow.flare = 0;
  crow.eyeMat.color.setHex(0x220a0a);   // the evil light goes out
  crow.vel.multiplyScalar(0.35);
  crow.vel.y = Math.min(crow.vel.y, 2);
  featherBurst(impactPos, crow.variant === 'boss' ? 26 : 10,
    crow.variant === 'boss' ? 2.2 : 1);
  AudioFX.squawk(crow.pitch, 1);
  AudioFX.boom(crow.variant === 'boss', 0.7);

  state.score += crow.score;
  state.kills++;
  scorePop(impactPos, '+' + crow.score);
  if (crow === bossCrow) {
    bossCrow = null;
    state.bossAlive = false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Per-frame behavior
// ---------------------------------------------------------------------------

const tmpTarget = new THREE.Vector3();
const tmpDesired = new THREE.Vector3();

export function updateCrows(dt, diveBudget, allowDamage) {
  const pPos = hooks.getPlayerPos();
  const pVel = hooks.getPlayerVel();
  let divers = 0;
  for (const c of crows) {
    if (c.alive && (c.st === 'aim' || c.st === 'dive')) divers++;
  }

  for (let i = crows.length - 1; i >= 0; i--) {
    const c = crows[i];

    if (c.dead) {
      updateDead(c, dt);
      if (c.deadGroundT > 1.1) {
        scene.remove(c.grp);
        crows.splice(i, 1);
      }
      continue;
    }

    const sp = CROW.speed * c.speedScale * (c.variant === 'boss' ? 0.85 : 1);

    if (c.st === 'orbit') {
      c.orbitA += c.orbitDir * dt * (sp / c.orbitR);
      tmpTarget.set(
        pPos.x * 0.55 + Math.cos(c.orbitA) * c.orbitR,
        c.alt + Math.sin(state.time * 1.3 + c.bobP) * 1.8,
        pPos.z * 0.55 + Math.sin(c.orbitA) * c.orbitR);
      seek(c, tmpTarget, sp, CROW.steer, dt);

      c.diveT -= dt;
      if (c.diveT <= 0 && divers < diveBudget) {
        c.st = 'aim';
        c.aimT = CROW.aimTime;
        divers++;
        const dist = c.pos.distanceTo(pPos);
        AudioFX.caw(c.pitch, clamp(28 / (dist + 8), 0.2, 1));
      }
    } else if (c.st === 'aim') {
      // hang in the air, eyes burning, head toward the tank
      tmpTarget.set(c.pos.x, c.alt + 1.5, c.pos.z);
      seek(c, tmpTarget, sp * 0.3, CROW.steer * 1.4, dt);
      faceToward(c, pPos, dt);
      c.aimT -= dt;
      if (c.aimT <= 0) {
        c.st = 'dive';
        const lead = clamp(c.pos.distanceTo(pPos) / (CROW.diveSpeed * c.speedScale), 0, 1.1);
        c.diveTarget.set(pPos.x + pVel.x * lead * 0.8, 1.4, pPos.z + pVel.z * lead * 0.8);
        c.skimT = 0;
        c.recedeT = 0;
        c.prevGap = Infinity;
      }
    } else if (c.st === 'dive') {
      // homing strong enough to track a moving tank; dodging needs a real cut
      c.diveTarget.x += (pPos.x - c.diveTarget.x) * damp(2.8, dt);
      c.diveTarget.z += (pPos.z - c.diveTarget.z) * damp(2.8, dt);
      seek(c, c.diveTarget, CROW.diveSpeed * c.speedScale, CROW.diveSteer, dt);

      // bottomed out: skim the stubble after the tank for a short while
      if (c.pos.y < 1.0) {
        if (c.skimT === 0) dustPuff(new THREE.Vector3(c.pos.x, 0.2, c.pos.z), 0.8);
        c.pos.y = 1.0;
        c.vel.y = Math.max(c.vel.y, 0);
        c.skimT += dt;
      }

      // red streak off the eyes while diving
      c.trailT -= dt;
      if (c.trailT <= 0) {
        c.trailT = 0.07;
        sparkBurst(c.pos, 1, 0xff1818);
      }

      const dx = c.pos.x - pPos.x, dz = c.pos.z - pPos.z;
      const dy = c.pos.y - 1.6;
      const gap = dx * dx + dz * dz + dy * dy;
      c.recedeT = gap > c.prevGap ? c.recedeT + dt : 0;
      c.prevGap = gap;
      if (gap < (c.hitR + 2.2) ** 2) {
        if (allowDamage) hooks.damagePlayer(c.dmg, c.pos);
        startClimb(c, pPos);
      } else if (c.skimT > 0.9 || c.recedeT > 0.45) {
        startClimb(c, pPos);
      }
    } else if (c.st === 'climb') {
      seek(c, c.diveTarget, CROW.climbSpeed * c.speedScale, CROW.steer, dt);
      if (c.pos.y > c.alt * 0.8) {
        c.st = 'orbit';
        c.diveT = rand(CROW.diveCdMin, CROW.diveCdMax) / c.speedScale;
      }
    }

    updatePose(c, dt);
  }
}

function seek(c, target, speed, steer, dt) {
  tmpDesired.copy(target).sub(c.pos);
  const d = tmpDesired.length();
  if (d > 0.001) tmpDesired.multiplyScalar(speed / d);
  c.vel.lerp(tmpDesired, damp(steer, dt));
  c.pos.addScaledVector(c.vel, dt);
}

function startClimb(c, pPos) {
  c.st = 'climb';
  // climb out away from the tank
  const away = Math.atan2(c.pos.x - pPos.x, c.pos.z - pPos.z);
  c.diveTarget.set(
    c.pos.x + Math.sin(away) * 26, c.alt + 6, c.pos.z + Math.cos(away) * 26);
  c.vel.y = Math.abs(c.vel.y) * 0.5 + 6;
}

function faceToward(c, point, dt) {
  const yaw = Math.atan2(-(point.x - c.pos.x), -(point.z - c.pos.z));
  c.grp.rotation.y = angLerp(c.grp.rotation.y, yaw, damp(6, dt));
}

// wings, banking, eye flare
function updatePose(c, dt) {
  const diving = c.st === 'dive';
  const flapFreq = diving ? 2.5 : c.st === 'climb' ? 13 : 8.5;
  const flapAmp = diving ? 0.12 : c.st === 'climb' ? 0.8 : 0.55;
  const fold = diving ? 0.95 : 0;
  c.flapP += dt * flapFreq;
  const flap = Math.sin(c.flapP) * flapAmp;
  for (const w of c.wings) {
    w.shoulder.rotation.z = w.side * (-flap - fold * 0.6);
    w.elbow.rotation.z = w.side * (-flap * 0.9 - fold * 0.9);
  }

  // face velocity unless hovering in aim
  if (c.st !== 'aim' && c.vel.lengthSq() > 1) {
    const yaw = Math.atan2(-c.vel.x, -c.vel.z);
    const turn = ((yaw - c.prevYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    c.grp.rotation.y = angLerp(c.grp.rotation.y, yaw, damp(7, dt));
    c.leanG.rotation.z = clamp(angLerp(c.leanG.rotation.z, -turn * 5, damp(5, dt)), -0.8, 0.8);
    c.prevYaw = yaw;
    const horiz = Math.hypot(c.vel.x, c.vel.z);
    c.leanG.rotation.x = clamp(Math.atan2(-c.vel.y, horiz + 0.001) * 0.7, -1.1, 1.1);
  }

  // eyes: smoulder in orbit, blaze when aiming/diving
  const wantFlare = c.st === 'aim' ? 1 : diving ? 0.85 : 0;
  c.flare += (wantFlare - c.flare) * damp(8, dt);
  const glow = 1.2 + c.flare * 3.2 + Math.sin(state.time * 14) * 0.2 * c.flare;
  c.eyeMat.color.setHex(0xff1818).multiplyScalar(glow);
  const es = 1 + c.flare * 0.9;
  for (const eye of c.eyes) eye.scale.setScalar(es);
}

function updateDead(c, dt) {
  if (c.pos.y > 0.4) {
    c.vel.y -= 26 * dt;
    c.pos.addScaledVector(c.vel, dt);
    c.grp.rotation.x += 7 * dt;
    c.grp.rotation.z += 5 * dt;
    if (c.pos.y <= 0.4) {
      c.pos.y = 0.4;
      featherBurst(c.pos, 6, c.variant === 'boss' ? 2 : 1);
      dustPuff(new THREE.Vector3(c.pos.x, 0.2, c.pos.z), c.variant === 'boss' ? 2 : 1);
    }
  } else {
    c.deadGroundT += dt;
    const k = Math.max(0, 1 - c.deadGroundT);
    c.grp.scale.setScalar(Math.max(0.001, VARIANTS[c.variant].scale * k));
  }
}
