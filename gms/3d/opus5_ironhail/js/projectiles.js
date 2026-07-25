// Ballistics. Every shot is a real body under gravity and crosswind, so range
// means holding the right elevation and long shots mean leading the target.
//
// solveElevation() is the whole game in eight lines: given a muzzle velocity
// and a target offset it returns the launch angle. Guns pick the low root,
// mortars the high one, which is why a mortar can drop behind a wall.

import * as THREE from 'three';
import { GRAVITY, PHYS } from './config.js';
import { rand, clamp, clamp01 } from './utils.js';
import { actorRoot } from './render.js';
import { terrainHeight } from './terrain.js';
import { propAt, damagePropsInRadius } from './props.js';
import { spawnExplosion, spawnFlash, spawnSmoke, spawnSparks, spawnDebris, volAt } from './particles.js';
import { AudioFX } from './audio.js';
import { state } from './state.js';
import { emit, on } from './bus.js';

const POOL = 120;
const bolts = [];
const matCache = new Map();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _dir = new THREE.Vector3();

const WIND_ACCEL = 0.42;      // world units/s² per unit of wind speed

// ---------------------------------------------------------------------------
// The solver
// ---------------------------------------------------------------------------

// dist: horizontal distance, dy: target height minus muzzle height.
export function solveElevation(dist, dy, speed, high = false, g = GRAVITY) {
  if (dist < 0.5) return { valid: true, pitch: high ? 1.2 : 0, tof: 0.05 };
  const v2 = speed * speed;
  const disc = v2 * v2 - g * (g * dist * dist + 2 * dy * v2);
  if (disc < 0) {
    // out of reach — 45° gets the most distance
    const pitch = Math.PI / 4;
    return { valid: false, pitch, tof: dist / (speed * Math.cos(pitch)) };
  }
  const root = Math.sqrt(disc);
  const tan = (v2 + (high ? root : -root)) / (g * dist);
  const pitch = Math.atan(tan);
  const tof = dist / Math.max(1e-3, speed * Math.cos(pitch));
  return { valid: true, pitch, tof };
}

// Full firing solution from a muzzle to a world target, including as much
// wind compensation as the gunner's optics allow.
export function aimSolution(from, target, gun, windComp = 1) {
  const high = gun.arc === 'high';
  let tx = target.x, tz = target.z;
  let sol = null;
  for (let iter = 0; iter < 2; iter++) {
    const dx = tx - from.x, dz = tz - from.z;
    const dist = Math.hypot(dx, dz);
    sol = solveElevation(dist, target.y - from.y, gun.speed, high);
    if (windComp <= 0 || !state.wind.speed) break;
    // drift the shell will take, subtracted from the aim point
    const a = gun.wind * WIND_ACCEL;
    const driftX = 0.5 * state.wind.x * a * sol.tof * sol.tof;
    const driftZ = 0.5 * state.wind.z * a * sol.tof * sol.tof;
    tx = target.x - driftX * windComp;
    tz = target.z - driftZ * windComp;
  }
  const dx = tx - from.x, dz = tz - from.z;
  return {
    valid: sol.valid,
    pitch: sol.pitch,
    tof: sol.tof,
    yaw: Math.atan2(-dx, -dz),
    aimX: tx, aimZ: tz,
    dist: Math.hypot(target.x - from.x, target.z - from.z),
  };
}

// Where will a shot fired at this solution actually land? Used for the HUD's
// predicted-impact marker (which is honest about uncompensated wind).
export function predictImpact(from, sol, gun, out = new THREE.Vector3()) {
  const a = gun.wind * WIND_ACCEL;
  const t = sol.tof;
  const horiz = Math.cos(sol.pitch) * gun.speed;
  const dirX = -Math.sin(sol.yaw), dirZ = -Math.cos(sol.yaw);
  out.set(
    from.x + dirX * horiz * t + 0.5 * state.wind.x * a * t * t,
    0,
    from.z + dirZ * horiz * t + 0.5 * state.wind.z * a * t * t);
  out.y = terrainHeight(out.x, out.z);
  return out;
}

// ---------------------------------------------------------------------------
// Pool
// ---------------------------------------------------------------------------

export function initProjectiles() {
  if (bolts.length) return;
  const geo = new THREE.BoxGeometry(0.22, 0.22, 1.5);
  for (let i = 0; i < POOL; i++) {
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    mesh.visible = false;
    mesh.frustumCulled = false;
    actorRoot.add(mesh);
    bolts.push({
      mesh, vel: new THREE.Vector3(), prev: new THREE.Vector3(),
      life: 0, active: false, owner: null, gun: null,
      trailT: 0, whistleAt: -1, split: false, byPlayer: false, bounces: 0,
      travelled: 0, origin: new THREE.Vector3(),
    });
  }
}

function matFor(hex) {
  if (!matCache.has(hex)) {
    matCache.set(hex, new THREE.MeshBasicMaterial({
      color: new THREE.Color(hex).multiplyScalar(2.4), fog: false,
    }));
  }
  return matCache.get(hex);
}

function freeBolt() {
  for (const b of bolts) if (!b.active) return b;
  return null;
}

export function clearProjectiles() {
  for (const b of bolts) { b.active = false; b.mesh.visible = false; b.owner = null; }
}

// ---------------------------------------------------------------------------
// Firing
// ---------------------------------------------------------------------------

export function launch({
  from, pitch, yaw, gun, owner = null, byPlayer = false, speedMul = 1,
  spreadMul = 1, dmgMul = 1, split = false, life = 9,
}) {
  const b = freeBolt();
  if (!b) return null;
  const spread = (gun.spread || 0) * spreadMul;
  const y = yaw + rand(-spread, spread);
  const p = pitch + rand(-spread, spread) * 0.7;
  const speed = gun.speed * speedMul;
  const ch = Math.cos(p) * speed;

  b.active = true;
  b.owner = owner;
  b.gun = gun;
  b.byPlayer = byPlayer;
  b.dmgMul = dmgMul;
  b.split = split;
  b.bounces = 0;
  b.travelled = 0;
  b.trailT = 0;
  b.life = life;
  b.mesh.visible = true;
  b.mesh.material = matFor(gun.tracer);
  b.mesh.position.copy(from);
  b.origin.copy(from);
  b.prev.copy(from);
  b.vel.set(-Math.sin(y) * ch, Math.sin(p) * speed, -Math.cos(y) * ch);
  b.mesh.scale.z = clamp(speed / 90, 0.6, 3.2);
  return b;
}

// Fire whatever the tank is holding. Returns true if a shot went out.
export function fireWeapon(tank) {
  if (!tank.alive || tank.fireTimer > 0 || tank.empTimer > 0) return false;
  const gun = tank.gun;
  tank.fireTimer = gun.reload * rand(0.97, 1.03);
  tank.burstLeft = (gun.kind === 'burst' || gun.kind === 'salvo') ? gun.shells - 1 : 0;
  tank.burstTimer = gun.burstGap || 0.12;
  fireOneShell(tank);
  return true;
}

// Pulls triggers. AI controllers only raise `wantFire`; the player's controller
// calls fireWeapon() itself so it can react to the shot it just took. Burst and
// salvo weapons keep feeding shells out between reloads.
export function updateFiring(dt) {
  for (const t of state.tanks) {
    if (!t.alive) continue;
    if (t.burstLeft > 0) {
      t.burstTimer -= dt;
      if (t.burstTimer <= 0) {
        t.burstTimer = t.gun.burstGap || 0.12;
        t.burstLeft--;
        fireOneShell(t);
      }
      continue;
    }
    // AI-driven hulls (including the player's in ?auto= soak runs) pull their
    // own trigger; the human's controller calls fireWeapon() itself.
    if (t.wantFire && t.aiDriven && t.fireTimer <= 0) fireWeapon(t);
  }
}

function fireOneShell(tank) {
  const gun = tank.gun;
  const muzzle = tank.muzzles[tank.barrelSide % tank.muzzles.length];
  tank.barrelSide++;
  muzzle.getWorldPosition(_v);

  // The barrel is already pointing at the solution; fire along it so what you
  // see is what you get.
  const yaw = tank.turretYaw;
  const pitch = tank.barrelPitch;

  // firing on the move throws the shot off — stop to shoot straight.
  // extraSpread is how the AI's crew quality becomes dispersion.
  const spreadMul = (1 + clamp01((tank.speed || 0) / 18) * 1.6) *
    (tank.extraSpread || 1);
  const b = launch({
    from: _v, pitch, yaw, gun, owner: tank, byPlayer: tank.isPlayer,
    spreadMul: spreadMul * (gun.kind === 'salvo' ? 1.5 : 1),
    split: gun.kind === 'cluster',
  });

  const flash = tank.muzzleFlash[(tank.barrelSide - 1) % tank.muzzleFlash.length];
  if (flash) flash.scale.setScalar(1);
  tank.recoil = 1;
  spawnSmoke(_v, {
    scale: 1.1, life: 0.6, colour: 0x8a8378, rise: 1.6, drift: 0.8,
    opacity: 0.4, grow: 2.6,
  });
  spawnSparks(_v, 3, _dir.set(-Math.sin(yaw), 0, -Math.cos(yaw)), 0.7);
  AudioFX.gun(gun.kind, volAt(_v) * (tank.isPlayer ? 1.35 : 1));

  tank.shotsFired++;
  if (tank.isPlayer) state.shots++;

  // incoming-round warning for the player
  if (b && !tank.isPlayer && state.player && state.player.alive) {
    const sol = { pitch, yaw, tof: estimateTof(pitch, gun.speed) };
    predictImpact(_v, sol, gun, _v2);
    if (_v2.distanceTo(state.player.pos) < 26) {
      b.whistleAt = sol.tof * 0.55;
      b.whistleVol = clamp01(1 - _v2.distanceTo(state.player.pos) / 26);
    }
  }
  return b;
}

function estimateTof(pitch, speed) {
  const vy = Math.sin(pitch) * speed;
  return Math.max(0.2, (vy + Math.sqrt(Math.max(0, vy * vy + 2 * GRAVITY * 1.5))) / GRAVITY);
}

// ---------------------------------------------------------------------------
// Flight + impacts
// ---------------------------------------------------------------------------

const MAX_STEP = 1.6;   // sub-step length so nothing tunnels through a tank

export function updateProjectiles(dt) {
  for (const b of bolts) {
    if (!b.active) continue;
    b.life -= dt;
    if (b.life <= 0) { retire(b); continue; }

    if (b.whistleAt > 0) {
      b.whistleAt -= dt;
      if (b.whistleAt <= 0) {
        b.whistleAt = -1;
        AudioFX.whistle(b.whistleVol, 0.9);
      }
    }

    const gun = b.gun;
    const a = gun.wind * WIND_ACCEL;
    b.vel.y -= GRAVITY * dt;
    b.vel.x += state.wind.x * a * dt;
    b.vel.z += state.wind.z * a * dt;

    const stepLen = b.vel.length() * dt;
    const steps = Math.max(1, Math.ceil(stepLen / MAX_STEP));
    const sdt = dt / steps;
    let done = false;
    for (let s = 0; s < steps && !done; s++) {
      b.prev.copy(b.mesh.position);
      b.mesh.position.addScaledVector(b.vel, sdt);
      b.travelled += b.vel.length() * sdt;
      done = collide(b);
    }
    if (done) continue;

    // orient the tracer along flight
    _dir.copy(b.vel).normalize();
    b.mesh.lookAt(_v.copy(b.mesh.position).add(_dir));

    // smoke trail for the slow, high-arc shells — reads as artillery
    if (gun.wind > 0.4 || gun.arc === 'high') {
      b.trailT -= dt;
      if (b.trailT <= 0) {
        b.trailT = 0.055;
        spawnSmoke(b.mesh.position, {
          scale: 0.42, life: 1.1, colour: 0x9a9490, rise: 0.5, drift: 0.2,
          opacity: 0.3, grow: 2.6,
        });
      }
    }

    // cluster shells split just after apex
    if (b.split && b.vel.y < -2) {
      b.split = false;
      splitCluster(b);
    }
  }
}

function retire(b) {
  b.active = false;
  b.owner = null;
  b.mesh.visible = false;
}

function collide(b) {
  const p = b.mesh.position;
  const gun = b.gun;

  // terrain
  const gh = terrainHeight(p.x, p.z);
  if (p.y <= gh) {
    p.y = gh;
    detonate(b, p, null, null);
    return true;
  }

  // scenery
  const prop = propAt(p.x, p.y, p.z, 0.2);
  if (prop) {
    if (gun.pen >= 1.4 && prop.mass < 3.2) {
      // railgun punches straight through light cover
      damagePropsInRadius(p, 1.4, gun.dmg * 0.6 * b.dmgMul, 1.4, b.byPlayer);
      spawnSparks(p, 4, _dir.copy(b.vel).normalize(), 0.8);
    } else {
      detonate(b, p, null, prop);
      return true;
    }
  }

  // tanks
  for (const t of state.tanks) {
    if (!t.alive || t === b.owner) continue;
    if (b.owner && t.faction === b.owner.faction) continue;
    _v.copy(t.pos);
    _v.y += 1.25;
    const rr = (PHYS.tankRadius + 0.25) * (t.boss ? 1.35 : 1);
    if (p.distanceToSquared(_v) > rr * rr) continue;

    // oblique AP hits can bounce off
    _dir.copy(b.vel).normalize();
    const face = t.facingMul(b.origin);
    const obliquity = Math.abs(_dir.x * t.forwardX + _dir.z * t.forwardZ);
    if (gun.pen >= 0.85 && gun.pen < 1.4 && obliquity < COMBAT_RICOCHET &&
        b.bounces === 0 && Math.random() < 0.45) {
      b.bounces++;
      b.vel.reflect(_v2.set(_dir.z, 0, -_dir.x).normalize()).multiplyScalar(0.65);
      b.vel.y = Math.abs(b.vel.y) * 0.4 + 4;
      b.dmgMul *= 0.35;
      spawnSparks(p, 7, null, 1.1);
      AudioFX.ricochet(volAt(p));
      emit('ricochet', { tank: t, byPlayer: b.byPlayer });
      return false;
    }
    detonate(b, p, t, null);
    return true;
  }
  return false;
}

const COMBAT_RICOCHET = 0.3;

function detonate(b, point, hitTank, hitProp) {
  const gun = b.gun;
  const owner = b.owner;
  const byPlayer = b.byPlayer;
  const dmgMul = b.dmgMul || 1;
  const impact = _v2.copy(point);
  const dist = b.origin.distanceTo(point);

  // direct hit
  if (hitTank) {
    const dealt = hitTank.damage(gun.dmg * dmgMul, owner, b.origin, { kind: 'shell', at: point });
    spawnFlash(point, 1.6, gun.tracer);
    spawnSparks(point, 9, null, 1.2);
    AudioFX.clang(volAt(point) * 1.1);
    if (byPlayer) {
      state.hits++;
      emit('player-hit', { tank: hitTank, dmg: dealt, dist, face: hitTank.facingMul(b.origin).face });
      if (!hitTank.alive) state.longestKill = Math.max(state.longestKill, dist);
    }
  } else if (hitProp) {
    damagePropsInRadius(point, Math.max(1.6, gun.splashR * 0.5),
      gun.dmg * dmgMul * (gun.propMul || 1), 1.6, byPlayer);
  }

  // blast
  const splashR = gun.splashR * (hitTank ? 0.8 : 1);
  if (gun.splashDmg > 0.5) {
    applyBlast({
      pos: point, radius: splashR, dmg: gun.splashDmg * dmgMul,
      owner, byPlayer, exclude: hitTank, propMul: gun.propMul || 1,
    });
  }

  const big = gun.craterR >= 5;
  spawnExplosion(impact, {
    scale: 0.55 + gun.splashR * 0.11, colour: gun.tracer,
    craterR: hitTank ? 0 : gun.craterR * dmgMul,
    craterD: gun.craterD * dmgMul,
    smoke: true,
  });
  if (big) spawnDebris(impact, 8, 1.4);

  retire(b);
}

// Splash damage against tanks and scenery. Also the entry point for chained
// fuel-drum explosions and drone strikes.
export function applyBlast({
  pos, radius, dmg, owner = null, byPlayer = false, exclude = null,
  propMul = 1, friendly = false,
}) {
  for (const t of state.tanks) {
    if (!t.alive || t === exclude) continue;
    if (!friendly && owner && t === owner) continue;
    const d = t.pos.distanceTo(pos);
    if (d > radius + 2.4) continue;
    const k = clamp01(1 - (d - 1.4) / radius);
    if (k <= 0) continue;
    const dealt = t.damage(dmg * k, owner, pos, { kind: 'splash', at: pos });
    if (byPlayer) emit('player-hit', { tank: t, dmg: dealt, dist: d, face: 'BLAST', splash: true });
  }
  damagePropsInRadius(pos, radius, dmg * propMul, 1.5, byPlayer);
}

// A fuel drum you set off is your kill. It can also take your own tracks off.
on('chain-blast', ({ pos, radius, dmg, byPlayer }) => {
  applyBlast({
    pos, radius, dmg, byPlayer,
    owner: byPlayer ? state.player : null, friendly: true,
  });
});

function splitCluster(b) {
  const gun = b.gun;
  const n = gun.submunitions || 5;
  const sub = { ...gun, splashR: gun.splashR, dmg: gun.dmg, arc: 'low', submunitions: 0 };
  for (let i = 0; i < n; i++) {
    const nb = freeBolt();
    if (!nb) break;
    nb.active = true;
    nb.owner = b.owner;
    nb.gun = sub;
    nb.byPlayer = b.byPlayer;
    nb.dmgMul = b.dmgMul;
    nb.split = false;
    nb.bounces = 0;
    nb.travelled = 0;
    nb.life = 6;
    nb.trailT = 0;
    nb.whistleAt = -1;
    nb.mesh.visible = true;
    nb.mesh.material = matFor(gun.tracer);
    nb.mesh.position.copy(b.mesh.position);
    nb.origin.copy(b.origin);
    nb.prev.copy(b.mesh.position);
    nb.mesh.scale.z = 0.8;
    const a = (i / n) * Math.PI * 2 + rand(-0.2, 0.2);
    const spread = 7 + rand(0, 5);
    nb.vel.copy(b.vel).multiplyScalar(0.72);
    nb.vel.x += Math.cos(a) * spread;
    nb.vel.z += Math.sin(a) * spread;
  }
  spawnFlash(b.mesh.position, 2.2, gun.tracer);
  AudioFX.blip(220, 0.14, 0.09);
  retire(b);
}

export function activeShellCount() {
  let n = 0;
  for (const b of bolts) if (b.active) n++;
  return n;
}

// Used by the kill cam to ride a player shell.
export function newestPlayerShell() {
  let best = null;
  for (const b of bolts) {
    if (b.active && b.byPlayer && (!best || b.life > best.life)) best = b;
  }
  return best;
}
