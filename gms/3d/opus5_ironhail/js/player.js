// Player controller. Turns the reticle into a real firing solution, drives the
// aim-assist lock, spends utility charges, flies the drone and owns the 3D aim
// furniture (ground reticle, predicted impact marker, ballistic arc).

import * as THREE from 'three';

import { clamp, damp } from './utils.js';
import { FIRECON, GRAVITY } from './config.js';
import { camera, actorRoot } from './render.js';
import { input, consume, keyboardMove } from './input.js';
import { terrainHeight, raycastTerrain } from './terrain.js';
import { aimSolution, predictImpact, fireWeapon, newestPlayerShell } from './projectiles.js';
import { setCamMode, cycleCamMode, adjustZoom, startKillCam } from './camera.js';
import { useUtility } from './utility.js';
import { AudioFX } from './audio.js';
import { profile } from './save.js';
import { state } from './state.js';
import { emit } from './bus.js';
import { thump } from './haptics.js';

const raycaster = new THREE.Raycaster();
const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
const _ndc = new THREE.Vector3();
const groundPoint = new THREE.Vector3();
const impactPoint = new THREE.Vector3();

// ---------------------------------------------------------------------------
// Aim furniture
// ---------------------------------------------------------------------------

let reticleRing = null;
let impactRing = null;
let arcLine = null;
const ARC_POINTS = 30;

function buildAimFx(accent) {
  if (reticleRing) return;
  reticleRing = new THREE.Mesh(
    new THREE.RingGeometry(1.5, 1.9, 28),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(accent).multiplyScalar(1.5), transparent: true,
      opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, fog: false,
    }));
  reticleRing.rotation.x = -Math.PI / 2;
  actorRoot.add(reticleRing);

  impactRing = new THREE.Mesh(
    new THREE.RingGeometry(0.7, 1.0, 24),
    new THREE.MeshBasicMaterial({
      color: 0xff5a4a, transparent: true, opacity: 0.9, side: THREE.DoubleSide,
      depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    }));
  impactRing.rotation.x = -Math.PI / 2;
  actorRoot.add(impactRing);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ARC_POINTS * 3), 3));
  arcLine = new THREE.Line(geo, new THREE.LineBasicMaterial({
    color: new THREE.Color(accent).multiplyScalar(1.2), transparent: true,
    opacity: 0.3, depthWrite: false, fog: false,
  }));
  arcLine.frustumCulled = false;
  actorRoot.add(arcLine);
}

// Flat-ground ballistic reach: v²/g at 45°. Good enough to stop the computer
// laying on something it could never hit.
function maxRange(gun) { return (gun.speed * gun.speed) / GRAVITY; }

export function showAimFx(on) {
  if (!reticleRing) return;
  reticleRing.visible = on;
  impactRing.visible = on;
  arcLine.visible = on;
}

export function disposeAimFx() {
  for (const m of [reticleRing, impactRing, arcLine]) {
    if (!m) continue;
    actorRoot.remove(m);
    m.geometry.dispose();
    m.material.dispose();
  }
  reticleRing = impactRing = arcLine = null;
}

// ---------------------------------------------------------------------------

export class PlayerController {
  constructor(tank, { utility }) {
    this.tank = tank;
    tank.aiDriven = false;
    this.utility = utility;
    tank.utilCharges = utility.charges;
    tank.utilCd = 0;
    this.lock = null;
    this.lockT = 0;
    this.sol = null;
    this.range = 0;
    this.moveVec = new THREE.Vector2();
    this.manualT = 0;                 // seconds since the commander last hand-aimed
    this.lastAim = new THREE.Vector2(input.aim.x, input.aim.y);
    this.autoActive = false;
    buildAimFx(tank.accent);
    showAimFx(true);
  }

  update(dt) {
    const me = this.tank;
    me.utilCd = Math.max(0, me.utilCd - dt);

    // a zoomed sight should crawl, not skate
    input.aimSpeedMul = state.camMode === 'scope'
      ? 0.45 / clamp(state.zoom, 0.7, 1.6)
      : 1;

    this.handleActions();
    this.handleZoom();
    this.drive(dt);
    this.aim(dt);
    this.shoot(dt);
    this.updateAimFx();
  }

  // The computer is fitted (bought, or on loan in act one) and switched on,
  // and the commander is not currently hand-aiming over the top of it.
  fireControlOn() {
    return !!state.fcFitted && profile.settings.autoAim !== false;
  }

  // ---- actions ----------------------------------------------------------

  handleActions() {
    const me = this.tank;
    const drone = state.drone;

    if (consume('drone')) {
      if (drone && drone.alive) {
        if (state.camMode === 'drone') {
          setCamMode('chase');
          drone.setMode('follow');
        } else {
          setCamMode('drone');
          drone.setMode('scout');
        }
        AudioFX.click();
      } else {
        emit('toast', 'DRONE OFFLINE');
      }
    }
    if (consume('recall') && drone && drone.alive) {
      drone.setMode('follow');
      if (state.camMode === 'drone') setCamMode('chase');
      emit('toast', 'DRONE RECALLED');
    }
    if (consume('scope')) {
      setCamMode(state.camMode === 'scope' ? 'chase' : 'scope');
      AudioFX.click();
    }
    if (consume('camera')) cycleCamMode();
    if (consume('cam1')) setCamMode('chase');
    if (consume('cam2')) setCamMode('scope');
    if (consume('cam3') && drone && drone.alive) { setCamMode('drone'); drone.setMode('scout'); }
    if (consume('mark') && drone && drone.alive) {
      if (!drone.mark()) emit('toast', 'NO CONTACT IN UPLINK RANGE');
    }
    if (consume('util')) this.useUtil();
  }

  useUtil() {
    const me = this.tank;
    if (me.utilCharges <= 0) { emit('toast', 'NO CHARGES LEFT'); AudioFX.blip(160, 0.1, 0.06); return; }
    if (me.utilCd > 0) { emit('toast', 'RECHARGING'); return; }
    const ok = useUtility(me, this.utility, { target: state.drone && state.drone.marked });
    if (!ok) return;
    me.utilCharges--;
    me.utilCd = this.utility.cooldown;
    state.hudDirty = true;
  }

  handleZoom() {
    if (input.zoomDelta) {
      adjustZoom(input.zoomDelta, this.tank.stats.zoomMax);
      input.zoomDelta = 0;
    }
    if (input.pinchZoom) {
      adjustZoom(input.pinchZoom * 0.6, this.tank.stats.zoomMax);
      input.pinchZoom = 0;
    }
  }

  // ---- driving ----------------------------------------------------------

  drive(dt) {
    const me = this.tank;
    const drone = state.drone;
    const flying = drone && drone.alive && drone.mode === 'scout' && state.camMode === 'drone';

    let mx = 0, my = 0;
    if (input.joyActive) {
      mx = input.move.x; my = input.move.y;
    } else {
      keyboardMove(this.moveVec);
      mx = this.moveVec.x; my = this.moveVec.y;
    }

    if (flying) {
      // the stick flies the drone; the hull holds station
      drone.flyInput.set(mx, my);
      me.moveDir.set(0, 0);
      return;
    }
    if (drone) drone.flyInput.set(0, 0);

    // camera-relative: push the stick where you want to go on screen
    camera.getWorldDirection(_v);
    _v.y = 0;
    if (_v.lengthSq() < 1e-5) _v.set(0, 0, -1);
    _v.normalize();
    const rx = -_v.z, rz = _v.x;
    me.moveDir.set(_v.x * -my + rx * mx, _v.z * -my + rz * mx);
  }

  // ---- aiming -----------------------------------------------------------

  aim(dt) {
    const me = this.tank;

    // 0. hand-aiming always outranks the computer, and for a whole second
    //    afterwards, so nudging the reticle onto a wall does not get undone.
    const moved = Math.hypot(input.aim.x - this.lastAim.x, input.aim.y - this.lastAim.y);
    if (moved > FIRECON.manualDelta) this.manualT = FIRECON.manualHold;
    else this.manualT = Math.max(0, this.manualT - dt);
    this.lastAim.set(input.aim.x, input.aim.y);

    // 1. reticle to ground
    raycaster.setFromCamera(input.aim, camera);
    const hit = raycastTerrain(raycaster.ray.origin, raycaster.ray.direction, 700, 2.0);
    if (hit) {
      groundPoint.lerp(hit.point, damp(26, dt));
    } else {
      // pointing at the sky: aim at max range along the ray
      _v.copy(raycaster.ray.origin).addScaledVector(raycaster.ray.direction, 260);
      _v.y = terrainHeight(_v.x, _v.z);
      groundPoint.lerp(_v, damp(14, dt));
    }

    // 2. aim assist — snap to a visible contact near the reticle. Hands off,
    //    the computer sweeps most of the screen and will go hunting if it
    //    finds nothing; hands on, the cone tightens so you can still put a
    //    round into the fuel drum standing next to the tank.
    const fc = this.fireControlOn();
    const cone = fc
      ? (this.manualT > 0 ? FIRECON.acquireNdc * 0.28 : FIRECON.acquireNdc)
      : 0;
    this.lock = this.findLock(cone);
    if (fc && !this.lock && this.manualT <= 0) this.lock = this.pickAutoTarget();
    this.autoActive = fc && !!this.lock;

    let targetPoint = _p.copy(groundPoint);
    targetPoint.y += 0.6;

    me.turretG.getWorldPosition(_v);
    if (this.lock) {
      // lead the target by however good our optics are — the computer's are
      // perfect, which is the whole point of paying for it
      const q = this.autoActive ? 1 : me.stats.leadQuality;
      const sol = aimSolution(_v, this.lock.pos, me.gun, q);
      targetPoint.set(
        this.lock.pos.x + this.lock.vel.x * sol.tof * q,
        this.lock.pos.y + 1.1,
        this.lock.pos.z + this.lock.vel.z * sol.tof * q);
    }

    // 3. firing solution
    const windQ = this.autoActive ? 1 : me.stats.leadQuality;
    const sol = aimSolution(_v, targetPoint, me.gun, windQ);
    this.sol = sol;
    this.range = sol.dist;
    me.aimSolution = sol;
    me.aimPoint.set(sol.aimX, targetPoint.y, sol.aimZ);
    state.aimRange = sol.dist;
    state.aimValid = sol.valid;
    state.lockTarget = this.lock;
    state.autoAiming = this.autoActive;
    // The computer holds the gun steady on the move; without it, driving and
    // shooting at the same time is the mistake it has always been.
    me.extraSpread = this.autoActive ? FIRECON.spreadMul : 1;
    me.stabilised = this.autoActive ? FIRECON.moveStabilise : 0;
    // the gunner's sight tracks the aim point independently of gun elevation
    state.aimGround.x = targetPoint.x;
    state.aimGround.y = targetPoint.y;
    state.aimGround.z = targetPoint.z;

    predictImpact(_v, { ...sol, yaw: me.turretYaw, pitch: me.barrelPitch }, me.gun, impactPoint);
  }

  // `minThresh` widens the cone — the fire-control computer will pull a
  // contact in from most of the screen, bare optics only from under the sight.
  findLock(minThresh = 0) {
    const me = this.tank;
    const thresh = Math.max(0.055 + me.stats.assistRange * 0.011, minThresh);
    let best = null, bd = 1e9;
    for (const t of state.tanks) {
      if (!t.alive || t.faction === me.faction) continue;
      if (t.smokeTimer > 0) continue;
      const d = t.pos.distanceTo(me.pos);
      const visible = t.spottedUntil > state.time || d < 78;
      if (!visible) continue;
      _ndc.copy(t.pos);
      _ndc.y += 1.4;
      _ndc.project(camera);
      if (_ndc.z > 1) continue;
      const sd = Math.hypot(_ndc.x - input.aim.x, (_ndc.y - input.aim.y) * 0.8);
      // sticky: keep an existing lock a little longer than acquiring a new one
      const limit = t === this.lock ? thresh * 1.8 : thresh;
      if (sd < limit && sd < bd) { bd = sd; best = t; }
    }
    if (best && best !== this.lastLock) {
      AudioFX.lock();
      thump('lock');
      this.lastLock = best;
    } else if (!best) {
      this.lastLock = null;
    }
    return best;
  }

  // Hands-off acquisition: the closest contact the crew actually knows about
  // and the gun can actually reach. Prefers what is already on screen so the
  // turret does not go hunting behind you while you are looking forwards.
  pickAutoTarget() {
    const me = this.tank;
    const reach = maxRange(me.gun) * FIRECON.maxRangeMul;
    let best = null, bs = 1e9;
    for (const t of state.tanks) {
      if (!t.alive || t.faction === me.faction) continue;
      if (t.smokeTimer > 0) continue;
      const d = t.pos.distanceTo(me.pos);
      if (d > reach) continue;
      if (t.spottedUntil <= state.time && d > 78) continue;   // not seen, not close
      _ndc.copy(t.pos);
      _ndc.y += 1.4;
      _ndc.project(camera);
      const onScreen = _ndc.z < 1 && Math.abs(_ndc.x) < 1 && Math.abs(_ndc.y) < 1;
      const score = d + (onScreen ? 0 : 70);
      if (score < bs) { bs = score; best = t; }
    }
    if (best && best !== this.lastLock) {
      AudioFX.lock();
      thump('lock');
      this.lastLock = best;
    }
    return best;
  }

  // ---- firing -----------------------------------------------------------

  shoot(dt) {
    const me = this.tank;
    // A tap while reloading is remembered briefly, so the shot goes the instant
    // the breech closes instead of being swallowed. With the computer on the
    // gun the tap is remembered for longer, because it is also waiting for the
    // turret to finish coming round.
    const laying = this.autoActive && !!this.lock;
    if (input.fire) this.fireBuffer = laying ? 1.6 : 0.4;
    else this.fireBuffer = Math.max(0, (this.fireBuffer || 0) - dt);
    if (this.fireBuffer <= 0 || me.fireTimer > 0) return;
    // A computer that fires mid-traverse is worse than no computer, so it
    // holds — but only until the buffer runs down, so a held trigger always
    // eventually produces a shell.
    if (laying && me.aimError > 0.03 && this.fireBuffer > 0.12) return;
    this.fireBuffer = 0;

    // The shell leaves along the barrel, wherever the barrel happens to be
    // pointing — firing mid-traverse is a miss, not a blocked trigger.
    if (this.sol && !this.sol.valid && me.gun.arc !== 'high' && !this.warnedRange) {
      this.warnedRange = true;
      emit('toast', 'BEYOND MAXIMUM RANGE');
      setTimeout(() => { this.warnedRange = false; }, 2500);
    }

    if (fireWeapon(me)) {
      emit('player-fired', { range: this.range, lock: this.lock });
      thump(me.gun.speed < 90 ? 'bigfire' : 'fire');
      // ride the shell on the long ones — the artillery money shot
      if (profile.settings.camAuto !== false &&
          this.range > 62 && state.camMode !== 'scope' && !state.killcam &&
          Math.random() < 0.4) {
        const shell = newestPlayerShell();
        if (shell) {
          startKillCam(shell);
          state.timeScale = 0.55;
        }
      }
    }
  }

  // ---- 3D aim furniture -------------------------------------------------

  updateAimFx() {
    const me = this.tank;
    if (!reticleRing) return;
    const ready = me.fireTimer <= 0;

    reticleRing.position.set(groundPoint.x, terrainHeight(groundPoint.x, groundPoint.z) + 0.3, groundPoint.z);
    reticleRing.scale.setScalar(1 + this.range * 0.006);
    reticleRing.material.opacity = ready ? 0.6 : 0.25;
    reticleRing.rotation.z += this.autoActive ? 0.03 : 0.01;

    impactRing.position.set(impactPoint.x, terrainHeight(impactPoint.x, impactPoint.z) + 0.35, impactPoint.z);
    const drift = Math.hypot(impactPoint.x - groundPoint.x, impactPoint.z - groundPoint.z);
    // The rangefinder keeps the impact mark lit even when the shell is going
    // exactly where you pointed — that confirmation is what you paid for.
    const rf = me.stats.modules && me.stats.modules.rangefinder;
    impactRing.material.opacity = drift > 1.6 ? 0.85 : (rf ? 0.4 : 0.0);
    impactRing.scale.setScalar(1.2 + drift * 0.05);

    // ballistic arc preview
    const pos = arcLine.geometry.attributes.position;
    const sol = this.sol;
    if (sol) {
      me.turretG.getWorldPosition(_v);
      const speed = me.gun.speed;
      const ch = Math.cos(me.barrelPitch) * speed;
      const vy = Math.sin(me.barrelPitch) * speed;
      const dx = -Math.sin(me.turretYaw) * ch;
      const dz = -Math.cos(me.turretYaw) * ch;
      const tof = Math.max(sol.tof, 0.4);
      for (let i = 0; i < ARC_POINTS; i++) {
        const t = (i / (ARC_POINTS - 1)) * tof * 1.02;
        const x = _v.x + dx * t;
        const z = _v.z + dz * t;
        let y = _v.y + vy * t - 0.5 * 26 * t * t;
        const gh = terrainHeight(x, z);
        if (y < gh) y = gh + 0.15;
        pos.setXYZ(i, x, y + 0.1, z);
      }
      pos.needsUpdate = true;
      arcLine.material.opacity = ready ? 0.34 : 0.14;
    }
  }
}

export function aimGroundPoint() { return groundPoint; }
export function aimImpactPoint() { return impactPoint; }
