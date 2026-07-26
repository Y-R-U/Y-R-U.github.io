// A car. Its authoritative position is (s, t, h) in track space; the mesh is
// derived from that every frame. Three modes:
//
//   track  — on the road. Steering sets a heading, grip converts heading into
//            velocity, and the frame rotating under you is what makes a corner
//            a corner. Barriers are a clamp on |t|.
//   air    — the same coordinates, but the road has fallen away underneath.
//            Entered automatically whenever the normal force goes negative,
//            which covers crests, jumps AND the top of a loop with one formula.
//   wreck  — you actually left the circuit. Full world-space rigid body,
//            tumbling and shedding panels until the recovery truck arrives.

import * as THREE from 'three';
import { DRIVE, CRASH, CHASSIS_HP, GRAVITY, RAIL_HEIGHT, LOOP } from './config.js';
import { scene, quality } from './render.js';
import { buildCar, animateCarMesh, partSpec } from './carfactory.js';
import { spawnDetached, spawnScrap } from './debris.js';
import * as fx from './particles.js';
import { showBubble, bubbleForDamage } from './bubbles.js';
import { emit } from './bus.js';
import { clamp, clamp01, damp, lerp, rand, randInt, wrap, angDiff, sign } from './utils.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _e1 = new THREE.Euler();

// Lateral grip ceiling in m/s². Above this the tyres let go and you run wide —
// this is what stops the auto-straightening assist from driving the car for
// you through a corner.
const MAX_LAT = 26;

let nextId = 1;

export class Car {
  constructor(opts) {
    this.id = nextId++;
    this.track = opts.track;
    this.index = opts.index || 0;
    this.isPlayer = !!opts.isPlayer;
    this.name = opts.name || 'DRIVER';
    this.team = opts.team || '';
    this.style = opts.style || 'stock';
    this.livery = opts.livery || { body: 0xe23c3c, trim: 0xffd166, name: 'Scarlet' };
    this.stats = Object.assign({
      top: 0, accel: 1, grip: 1, boostPow: 1, boostTime: 0, boostMax: 0,
      armour: 1, ram: 1, mass: 1, partHp: 1, stealth: 1, offroad: 1, hypeGain: 1,
    }, opts.stats || {});
    this.skills = opts.skills || [];
    this.skill = opts.skill != null ? opts.skill : 0.8;   // AI competence 0..1

    // --- track-space state ---
    this.s = 0; this.t = 0; this.h = 0;
    this.psi = 0;
    this.va = 0; this.vl = 0; this.vh = 0;
    this.mode = 'grid';

    // --- race state ---
    this.lap = 0;
    this.lapStart = 0;
    this.bestLap = Infinity;
    this.lastLap = 0;
    this.position = this.index + 1;
    this.finished = false;
    this.finishTime = 0;
    this.retired = false;
    this.prevS = 0;

    // --- car condition ---
    this.hp = CHASSIS_HP * (this.stats.partHp || 1);
    this.maxHp = this.hp;
    this.partsLost = [];
    this.wheelsLost = 0;

    // --- kit ---
    this.boosts = Math.min(DRIVE.boostMax + (this.stats.boostMax || 0), 1);
    this.maxBoosts = DRIVE.boostMax + (this.stats.boostMax || 0);
    this.boostTime = 0;
    this.cooldowns = {};

    // --- effects ---
    this.stun = 0;
    this.slowT = 0; this.slowMul = 1;
    this.oil = 0;
    this.shred = 0;
    this.recover = 0;
    this.invuln = 0;
    this.hitFlash = 0;
    this.driftTime = 0;
    this.airTime = 0;
    this.airPeak = 0;
    this.spinCount = 0;
    this.wreckTime = 0;
    this.respawnTimer = 0;
    this.lastContact = null;
    this.lastContactAt = -99;

    this.controls = { steer: 0, throttle: 1, brake: 0 };

    // --- presentation ---
    this.worldPos = new THREE.Vector3();
    this.worldQuat = new THREE.Quaternion();
    this.worldVel = new THREE.Vector3();
    this.frame = {};
    this.roll = 0; this.pitchV = 0;
    this.mesh = buildCar({
      style: this.style,
      body: this.livery.body,
      trim: this.livery.trim,
      partHp: this.stats.partHp,
    });
    this.parts = this.mesh.userData.parts;
    scene.add(this.mesh);

    // Wreck-mode bodies
    this.wreckPos = new THREE.Vector3();
    this.wreckVel = new THREE.Vector3();
    this.wreckSpin = new THREE.Vector3();
    this.groundY = 0;
  }

  dispose() {
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
    this.mesh.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material.__owned) o.material.dispose();
    });
  }

  // -------------------------------------------------------------------------
  get speed() { return Math.hypot(this.va, this.vl); }
  get kmh() { return this.speed * 3.6; }
  get progress() { return this.lap * this.track.length + this.s; }
  get boosting() { return this.boostTime > 0; }
  get alive() { return !this.retired && this.mode !== 'out'; }

  // Forward speed along the car's own heading — what the speedo shows.
  get forwardSpeed() {
    return this.va * Math.cos(this.psi) + this.vl * Math.sin(this.psi);
  }

  get sideSlip() {
    return -this.va * Math.sin(this.psi) + this.vl * Math.cos(this.psi);
  }

  // -------------------------------------------------------------------------
  placeOnGrid(s, t) {
    this.s = wrap(s, this.track.length);
    this.prevS = this.s;
    this.t = t;
    this.h = 0; this.vh = 0;
    this.psi = 0;
    this.va = 0; this.vl = 0;
    this.mode = 'grid';
    // The grid sits behind the line, so the first crossing is the *start* of
    // lap one, not the end of it. Counting completed laps from -1 makes
    // `lap >= laps` the finish with no special case anywhere else.
    this.lap = -1;
    this.lapStart = 0;
    this.syncMesh(0);
  }

  launch() {
    if (this.mode === 'grid') this.mode = 'track';
  }

  // -------------------------------------------------------------------------
  update(dt, now) {
    if (this.mode === 'out') return;

    if (this.respawnTimer > 0) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.rejoin();
      return;
    }
    if (this.mode === 'wreck') { this.updateWreck(dt); return; }

    this.tickEffects(dt);
    this.drive(dt);
    this.sanity();
    this.syncMesh(dt);
  }

  // A physics sim that can produce a NaN or an Infinity will eventually produce
  // one, and downstream code (lookahead loops, spline lookups) has no defence
  // against it. Catch it here, once, and put the car back on the road.
  sanity() {
    const bad = !Number.isFinite(this.s) || !Number.isFinite(this.t)
      || !Number.isFinite(this.h) || !Number.isFinite(this.psi)
      || !Number.isFinite(this.va) || !Number.isFinite(this.vl)
      || !Number.isFinite(this.vh);
    const wild = Math.abs(this.va) > 400 || Math.abs(this.vl) > 400 || Math.abs(this.h) > 400;
    if (!bad && !wild) return;

    if (typeof console !== 'undefined') {
      console.warn('[car] non-finite state recovered', this.name, {
        s: this.s, t: this.t, h: this.h, psi: this.psi, va: this.va, vl: this.vl, vh: this.vh,
      });
    }
    const w = this.track.widthAt(Number.isFinite(this.s) ? this.s : 0);
    if (!Number.isFinite(this.s)) this.s = 0;
    this.t = Number.isFinite(this.t) ? clamp(this.t, -w, w) : 0;
    this.h = 0; this.vh = 0;
    this.psi = 0;
    this.va = Number.isFinite(this.va) ? clamp(this.va, -20, 90) : 20;
    this.vl = 0;
    this.recover = 1;
  }

  tickEffects(dt) {
    if (this.stun > 0) this.stun -= dt;
    if (this.slowT > 0) { this.slowT -= dt; if (this.slowT <= 0) this.slowMul = 1; }
    if (this.oil > 0) this.oil -= dt;
    if (this.shred > 0) this.shred -= dt;
    if (this.recover > 0) this.recover -= dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.slammed > 0) this.slammed -= dt;
    if (this.boostTime > 0) {
      this.boostTime -= dt;
      if (this.boostTime <= 0) this.boostTime = 0;
    }
    for (const k in this.cooldowns) {
      if (this.cooldowns[k] > 0) this.cooldowns[k] -= dt;
    }
  }

  // -------------------------------------------------------------------------
  // The driving model
  // -------------------------------------------------------------------------
  drive(dt) {
    const tr = this.track;
    const f = tr.frameAt(this.s, this.frame);
    const c = this.controls;
    const onGrid = this.mode === 'grid';

    // --- how good is this car right now -----------------------------------
    const wheelPenalty = 1 - this.wheelsLost * 0.11;
    const offTrack = Math.abs(this.t) > f.width;
    let gripRate = DRIVE.grip * this.stats.grip * wheelPenalty;
    let maxLat = MAX_LAT * this.stats.grip * wheelPenalty;
    if (c.brake > 0.45) { gripRate = DRIVE.driftGrip * this.stats.grip; maxLat *= 0.72; }
    if (this.oil > 0) { gripRate *= 0.3; maxLat *= 0.34; }
    if (this.shred > 0) { gripRate *= 0.62; maxLat *= 0.7; }
    if (offTrack) {
      gripRate *= DRIVE.offTrackGrip * this.stats.offroad;
      maxLat *= DRIVE.offTrackGrip * this.stats.offroad;
    }
    if (this.h > 0.35) { gripRate *= 0.05; maxLat *= 0.05; }

    // Banking earns you grip: on a banked corner the road itself is pushing
    // you into the turn.
    const bankHelp = -f.right.y;
    maxLat += Math.abs(bankHelp) * 9;

    // --- decompose velocity into the car's own heading frame ---------------
    const cs = Math.cos(this.psi), sn = Math.sin(this.psi);
    let vf = this.va * cs + this.vl * sn;
    let vs = -this.va * sn + this.vl * cs;

    // --- longitudinal ------------------------------------------------------
    const topSpeed = (DRIVE.topSpeed + this.stats.top) * (this.boosting ? DRIVE.boostMul : 1) * this.slowMul;
    let accel = 0;
    if (!onGrid && this.stun <= 0) {
      const throttle = c.throttle;
      if (throttle > 0 && vf < topSpeed) {
        const head = clamp01(1 - Math.max(0, vf) / topSpeed);
        accel += DRIVE.accel * this.stats.accel * Math.pow(head, DRIVE.accelFalloff) * throttle;
      }
      if (this.boosting) accel += DRIVE.boostAccel * (this.stats.boostPow || 1);
      if (c.brake > 0) accel -= DRIVE.brake * c.brake * (vf > 0 ? 1 : 0);
    }
    // Hills: gravity along the road. Inside a loop it is turned down, or the
    // entry speed a real loop demands would be undriveable.
    const inLoop = f.kind === 'loop';
    const gLong = GRAVITY * (inLoop ? LOOP.gravity : 1);
    accel -= gLong * f.tan.y * cs;
    accel -= gLong * f.right.y * sn;
    // drag and rolling resistance
    accel -= DRIVE.drag * vf * Math.abs(vf);
    accel -= DRIVE.rollResist * sign(vf);
    if (offTrack) accel -= DRIVE.offTrackDrag * (2 - this.stats.offroad) * sign(vf);
    if (this.h > 0.35) accel *= 0.12;
    vf += accel * dt;
    if (vf < -DRIVE.reverse) vf = -DRIVE.reverse;

    // --- steering ----------------------------------------------------------
    if (!onGrid) {
      const speedFrac = clamp01(Math.abs(vf) / (DRIVE.topSpeed + this.stats.top));
      const authority = lerp(1, DRIVE.steerHighSpeed, speedFrac) * (this.h > 0.35 ? 0.28 : 1) * wheelPenalty;
      this.psi += c.steer * DRIVE.steerRate * authority * dt;

      // The promise: you can always take over again. Heading error decays
      // toward the road, hard right after a knock, gently the rest of the time.
      let straighten = Math.abs(c.steer) < 0.12 ? DRIVE.autoSteerIdle : DRIVE.autoSteer * 0.45;
      if (this.recover > 0) straighten = DRIVE.recoverPull;
      if (this.h > 0.35) straighten *= 0.35;
      if (this.assist === false) straighten *= 0.55;   // settings: assist off
      this.psi = lerp(this.psi, 0, damp(straighten, dt));
      // Keep the heading in a sane range: a full spin is dramatic, two is silly.
      this.psi = clamp(this.psi, -Math.PI * 0.95, Math.PI * 0.95);
    }

    // --- lateral grip, capped by the friction circle ------------------------
    const want = gripRate * Math.abs(vs);
    const latA = Math.min(want, maxLat);
    vs -= latA * dt * sign(vs);
    if (Math.abs(vs) < 0.05) vs = 0;
    // Sliding sideways scrubs speed off.
    vf -= Math.abs(vs) * DRIVE.slipScrub * dt;

    // A wrecked corner pulls the car toward the missing wheel.
    if (this.wheelsLost > 0 && this.h <= 0.35) {
      this.psi += this.wheelPull * dt * 0.8;
    }

    // --- recompose and advance ---------------------------------------------
    this.va = vf * cs - vs * sn;
    this.vl = vf * sn + vs * cs;

    const denom = Math.max(0.3, 1 - this.t * f.curv);
    const ds = (this.va * dt) / denom;
    this.t += this.vl * dt;
    this.prevS = this.s;
    this.s = wrap(this.s + ds, tr.length);

    // The frame rotates under the car as it advances — this single step is
    // what produces understeer, drift and the pull to the outside of a corner.
    const phi = f.curv * ds;
    if (phi) {
      const c2 = Math.cos(phi), s2 = Math.sin(phi);
      const na = this.va * c2 + this.vl * s2;
      const nl = -this.va * s2 + this.vl * c2;
      this.va = na; this.vl = nl;
      this.psi -= phi;
    }

    // --- normal force: grounded, airborne, or falling out of a loop ---------
    // N = v²κ + g·(road up)·world down. One line covers crests (you take off),
    // dips (you get pressed in) and the top of a loop (you need the speed).
    const v2 = this.va * this.va + this.vl * this.vl;
    const stick = this.h <= 0 ? (inLoop ? LOOP.downforce : 7.5) : 0;
    const N = v2 * f.pitch + GRAVITY * f.up.y + stick;
    if (this.h > 0 || N < 0) {
      this.vh += -(v2 * f.pitch + GRAVITY * f.up.y) * dt;
      this.h += this.vh * dt;
      if (this.h <= 0) {
        const impact = -this.vh;
        this.h = 0;
        this.vh = 0;
        if (impact > CRASH.landHard) this.land(impact);
      } else {
        this.airTime += dt;
        this.airPeak = Math.max(this.airPeak, this.h);
        if (this.h > 0.6 && this.isPlayer) emit('car:air', { car: this, h: this.h });
      }
    } else {
      this.h = 0;
      this.vh = 0;
      if (this.airTime > 0.35) {
        emit('car:landed', { car: this, air: this.airTime, peak: this.airPeak });
      }
      if (this.airTime > 0) { this.airTime = 0; this.airPeak = 0; }
    }

    // Upside down in a loop and too slow: the road lets go of you.
    if (f.inverted && this.h > 1.6) {
      this.wreck('fell out of the loop');
      return;
    }

    // --- barriers ----------------------------------------------------------
    this.checkEdges(f, dt);

    // --- drift bookkeeping / effects ---------------------------------------
    const slip = Math.abs(this.sideSlip);
    if (slip > DRIVE.slipDrift && this.h <= 0.2 && Math.abs(vf) > 12) {
      this.driftTime += dt;
      if (this.isPlayer) emit('car:drift', { car: this, dt, slip });
      const p = this.worldPos;
      fx.tyreSmoke(p, 0.55);
    } else if (this.driftTime > 0) {
      if (this.driftTime > 0.7) emit('car:driftEnd', { car: this, time: this.driftTime });
      this.driftTime = 0;
    }
    if (offTrack && Math.abs(vf) > 6 && this.h <= 0.2) fx.dust(this.worldPos, 0.5);

    // --- lap counting ------------------------------------------------------
    const half = tr.length * 0.5;
    if (this.prevS > tr.length - half * 0.5 && this.s < half * 0.5) this.onLapLine(1);
    else if (this.s > tr.length - half * 0.5 && this.prevS < half * 0.5) this.onLapLine(-1);
  }

  get wheelPull() {
    let pull = 0;
    if (!this.parts.wheelFL) pull -= 0.5;
    if (!this.parts.wheelFR) pull += 0.5;
    if (!this.parts.wheelRL) pull -= 0.22;
    if (!this.parts.wheelRR) pull += 0.22;
    return pull;
  }

  onLapLine(dir) {
    this.lap += dir;
    if (dir > 0) emit('car:lap', { car: this });
  }

  // -------------------------------------------------------------------------
  // Barriers, verges and leaving the circuit
  // -------------------------------------------------------------------------
  checkEdges(f, dt) {
    const w = f.width;
    const over = Math.abs(this.t) - w;
    if (over <= 0) return;

    const side = sign(this.t);
    const type = side > 0 ? f.railR : f.railL;

    if (type === 'open') {
      // No barrier: you are on the dirt. Drivable, slow, and there is a limit.
      if (over > 30) this.wreck('ran out of road');
      return;
    }

    // Airborne above the barrier: you are leaving.
    if (this.h > RAIL_HEIGHT * 0.85) {
      this.wreck('cleared the barrier');
      return;
    }

    // Whether you go over the top depends far more on *how* you arrive than on
    // how fast. Square on, even a huge sideways slide is a scrape and a bounce.
    // Spun sideways, or freshly shunted by somebody, and you ride up over it —
    // which is exactly what a well-timed slam next to a barrier is for.
    const impact = Math.abs(this.vl);
    let vaultAt = CRASH.railVault;
    vaultAt *= 1 - 0.46 * clamp01(Math.abs(this.psi) / 1.1);
    if (this.slammed > 0) vaultAt *= 0.66;
    if (impact > vaultAt && type !== 'wall') {
      this.wreck('through the barrier');
      return;
    }

    // Bounce. This is the promise in the brief: hit the rail, come back in,
    // maybe spinning, but back on the road.
    this.t = side * w;
    this.vl = -this.vl * CRASH.railRestitution;
    const spin = clamp(impact * CRASH.railSpin * 0.02, 0, 0.9);
    this.psi -= side * spin * rand(0.6, 1.4);
    const scrub = clamp(impact * CRASH.railScrub * 0.05, 0, 0.55);
    this.va *= 1 - scrub;
    this.recover = Math.max(this.recover, DRIVE.recoverTime * clamp01(impact / 18));

    if (impact > 3) {
      const dmg = impact * CRASH.railDamage;
      this.damage(dmg, side > 0 ? 'right' : 'left', { source: 'barrier' });
      fx.sparkBurst(this.worldPos, _v1.copy(f.right).multiplyScalar(-side), Math.min(20, impact), 0xffd27a, impact * 0.9);
      emit('car:railHit', { car: this, impact });
    }
  }

  land(impact) {
    const dmg = (impact - CRASH.landHard) * CRASH.landDamage;
    if (dmg > 0) this.damage(dmg, 'bottom', { source: 'landing' });
    this.recover = Math.max(this.recover, 0.5);
    fx.smokePuff(this.worldPos, 5, 0xbdb6a6, 1.8, 1.4);
    emit('car:land', { car: this, impact });
    // A bad landing while sideways flips you clean off the circuit.
    if (Math.abs(this.psi) > 1.0 && impact > CRASH.landHard * 1.6) {
      this.wreck('landed sideways');
    }
  }

  // -------------------------------------------------------------------------
  // Being hit
  // -------------------------------------------------------------------------
  // `lateral` is a change in sideways velocity; positive pushes toward +t.
  shove(lateral, forward, opts = {}) {
    if (this.mode === 'out' || this.mode === 'wreck') return;
    const massMul = 1 / (this.stats.mass || 1);
    this.vl += lateral * massMul;
    this.va += (forward || 0) * massMul;
    // A fresh shunt makes the next barrier much more dangerous.
    if (Math.abs(lateral) > 12) this.slammed = 0.9;
    if (opts.spin) this.psi += opts.spin * massMul * (opts.spinSign || sign(lateral) || 1);
    if (opts.air) this.vh = Math.max(this.vh, opts.air);
    this.recover = Math.max(this.recover, DRIVE.recoverTime);
    if (opts.stun) this.stun = Math.max(this.stun, opts.stun);
    this.hitFlash = 0.22;
    if (opts.by) { this.lastContact = opts.by; this.lastContactAt = performance.now() / 1000; }
  }

  damage(amount, region, opts = {}) {
    if (this.mode === 'out') return 0;
    if (this.invuln > 0 && !opts.force) return 0;
    const armour = this.stats.armour || 1;
    let dealt = amount * armour;
    if (dealt <= 0) return 0;

    this.hp -= dealt * 0.55;
    this.hitFlash = 0.25;
    emit('car:damaged', { car: this, amount: dealt, region, by: opts.by, source: opts.source });

    // Spread the rest over the panels facing the hit.
    let pool = dealt * (opts.shear ? 1.6 : 1.0);
    const candidates = this.partsInRegion(region);
    let guard = 0;
    while (pool > 0.5 && candidates.length && guard++ < 8) {
      const idx = randInt(0, candidates.length - 1);
      const id = candidates[idx];
      const obj = this.parts[id];
      if (!obj) { candidates.splice(idx, 1); continue; }
      const p = obj.userData.part;
      const share = Math.min(pool, p.hp);
      p.hp -= share;
      pool -= share;
      p.dent = clamp01(1 - p.hp / p.maxHp);
      this.dentPart(obj, p);
      if (p.hp <= 0) {
        this.detachPart(id, opts);
        candidates.splice(idx, 1);
      }
    }

    if (this.hp <= 0) {
      this.hp = 0;
      this.wreck('written off');
    }
    return dealt;
  }

  partsInRegion(region) {
    const all = Object.keys(this.parts).filter((k) => this.parts[k]);
    if (!region || region === 'all') return all;
    const near = all.filter((k) => {
      const spec = partSpec(k);
      return spec && spec.region === region;
    });
    // Always leave something to hit — a rear-ended car with no rear panels
    // left should still shed doors and glass.
    return near.length >= 2 ? near : all;
  }

  dentPart(obj, p) {
    if (!p.home) return;
    const d = p.dent;
    obj.position.copy(p.home);
    obj.position.x += Math.sin(p.hp * 7.7) * d * 0.09;
    obj.position.y -= d * 0.05;
    obj.position.z += Math.cos(p.hp * 5.3) * d * 0.07;
    if (!p.wheel) {
      obj.rotation.z = Math.sin(p.hp * 3.1) * d * 0.22;
      obj.rotation.x = (obj.rotation.x || 0) * 1 + 0;
    }
  }

  detachPart(id, opts = {}) {
    const obj = this.parts[id];
    if (!obj) return;
    const p = obj.userData.part;
    this.parts[id] = null;
    this.partsLost.push(id);

    obj.getWorldPosition(_v1);
    obj.getWorldQuaternion(_q1);

    if (p.glass) {
      // Glass does not fly off in one piece.
      fx.glassBurst(_v1);
      obj.parent && obj.parent.remove(obj);
    } else {
      const vel = this.worldVel.clone();
      vel.x += rand(-5, 5);
      vel.z += rand(-5, 5);
      vel.y += rand(3, 9);
      if (opts.dir) vel.addScaledVector(opts.dir, rand(3, 9));
      spawnDetached(obj, _v1, _q1, vel, this.groundLevel(), {
        mass: p.mass, spin: 1 + (p.mass || 1) * 0.4, life: 8,
      });
      fx.sparkBurst(_v1, _v2.set(0, 1, 0), 8, 0xffc470, 8);
    }

    if (p.wheel) {
      this.wheelsLost++;
      this.shred = Math.max(this.shred, 3);
    }
    if (id === 'roof') {
      const d = this.mesh.userData.driver;
      if (d) d.visible = true;
    }

    emit('car:partOff', { car: this, part: id, by: opts.by });
    const [face, line] = bubbleForDamage(id);
    if (Math.random() < (this.isPlayer ? 0.45 : 0.85)) showBubble(this, face, line);
  }

  // -------------------------------------------------------------------------
  // Wrecks
  // -------------------------------------------------------------------------
  wreck(reason, extraImpulse) {
    if (this.mode === 'wreck' || this.mode === 'out') return;
    this.mode = 'wreck';
    this.wreckTime = 0;
    this.wreckReason = reason;

    this.wreckPos.copy(this.worldPos);
    this.wreckVel.copy(this.worldVel);
    if (extraImpulse) this.wreckVel.add(extraImpulse);
    this.wreckVel.y = Math.max(this.wreckVel.y, 4) + rand(2, 8);
    this.wreckSpin.set(rand(-3, 3), rand(-4, 4), rand(-5, 5)).multiplyScalar(CRASH.wreckSpin * 0.4);
    this.groundY = this.groundLevel();

    // A wreck rips a lot off immediately.
    const shed = randInt(1, 3);
    const alive = Object.keys(this.parts).filter((k) => this.parts[k]);
    for (let i = 0; i < shed && alive.length; i++) {
      const id = alive.splice(randInt(0, alive.length - 1), 1)[0];
      this.detachPart(id, { dir: _v1.set(rand(-1, 1), 1, rand(-1, 1)).normalize() });
    }
    fx.explode(this.worldPos, 14, 0xffa040);
    showBubble(this, this.isPlayer ? 'shock' : 'scared');
    emit('car:wreck', { car: this, reason, by: this.recentContact() });
  }

  recentContact() {
    const t = performance.now() / 1000;
    return t - this.lastContactAt < 2.4 ? this.lastContact : null;
  }

  updateWreck(dt) {
    this.wreckTime += dt;
    this.wreckVel.y -= CRASH.wreckGravity * dt;
    this.wreckPos.addScaledVector(this.wreckVel, dt);

    _e1.set(this.wreckSpin.x * dt, this.wreckSpin.y * dt, this.wreckSpin.z * dt);
    _q1.setFromEuler(_e1);
    this.worldQuat.multiply(_q1);

    const floor = this.groundY + 0.7;
    if (this.wreckPos.y < floor) {
      this.wreckPos.y = floor;
      const hit = -this.wreckVel.y;
      if (hit > 2.5) {
        this.wreckVel.y = hit * CRASH.wreckBounce;
        this.wreckVel.x *= CRASH.wreckFriction;
        this.wreckVel.z *= CRASH.wreckFriction;
        this.wreckSpin.multiplyScalar(0.72);
        fx.smokePuff(this.wreckPos, 4, 0xa89c86, 2.2, 2);
        fx.sparkBurst(this.wreckPos, _v1.set(0, 1, 0), 10, 0xffb060, hit);
        emit('car:tumble', { car: this, impact: hit });
        if (Math.random() < CRASH.wreckShedChance) {
          const alive = Object.keys(this.parts).filter((k) => this.parts[k]);
          if (alive.length) this.detachPart(alive[randInt(0, alive.length - 1)], {});
        }
      } else {
        this.wreckVel.y = 0;
        this.wreckVel.x *= 0.9;
        this.wreckVel.z *= 0.9;
        this.wreckSpin.multiplyScalar(0.9);
      }
    }

    this.mesh.position.copy(this.wreckPos);
    this.mesh.quaternion.copy(this.worldQuat);
    this.worldPos.copy(this.wreckPos);
    this.worldVel.copy(this.wreckVel);

    const settled = this.wreckVel.lengthSq() < 9 && Math.abs(this.wreckPos.y - floor) < 0.4;
    if (this.wreckTime > CRASH.wreckMinTime && (settled || this.wreckTime > CRASH.wreckMaxTime)) {
      this.respawnTimer = CRASH.respawnTime;
      this.mesh.visible = false;
      fx.smokePuff(this.wreckPos, 8, 0x8a8f96, 3, 2.4);
      emit('car:recovering', { car: this });
    }
  }

  rejoin() {
    const tr = this.track;
    const near = tr.nearestS(this.wreckPos, this.s, 400);
    const w = tr.widthAt(near.s);
    this.s = wrap(near.s - CRASH.respawnBack, tr.length);
    this.t = clamp(near.t, -w * 0.55, w * 0.55);
    this.h = 0; this.vh = 0;
    this.psi = 0;
    const keep = Math.max(9, Math.min(30, this.speed * 0.3));
    this.va = keep; this.vl = 0;
    this.mode = 'track';
    this.recover = 1.4;
    this.invuln = 1.6;
    this.mesh.visible = true;
    if (this.hp <= 0) this.hp = this.maxHp * 0.35;
    this.wheelsLost = 0;   // the truck bolts something on
    emit('car:rejoin', { car: this });
  }

  retire() {
    this.retired = true;
    this.mode = 'out';
    this.mesh.visible = false;
  }

  groundLevel() {
    const tr = this.track;
    const i = Math.floor(tr.idx(this.s));
    const roadY = tr.pos[i].y;
    const far = Math.abs(this.t) > tr.width[i] + 34;
    const floor = tr.bounds.min.y - 3.0;
    return far ? floor : Math.max(floor, roadY - 2.2);
  }

  // -------------------------------------------------------------------------
  giveBoost(n = 1) {
    this.boosts = Math.min(this.maxBoosts, this.boosts + n);
  }

  useBoost() {
    if (this.boosts <= 0 || this.boostTime > 0.6) return false;
    this.boosts--;
    this.boostTime = DRIVE.boostTime + (this.stats.boostTime || 0);
    emit('car:boost', { car: this });
    return true;
  }

  padBoost() {
    this.boostTime = Math.max(this.boostTime, DRIVE.padBoostTime);
    emit('car:padBoost', { car: this });
  }

  // -------------------------------------------------------------------------
  syncMesh(dt) {
    const tr = this.track;
    const f = this.frame.p ? this.frame : tr.frameAt(this.s, this.frame);

    tr.worldAt(this.s, this.t, this.h + 0.02, this.worldPos);

    // Suspension: lean into the corner, squat under power, dive under braking.
    const lat = clamp(this.sideSlip / 16, -1, 1);
    const targetRoll = -lat * 0.2 + (this.hitFlash > 0 ? rand(-0.05, 0.05) : 0);
    const targetPitch = clamp((this.controls.brake * 0.5 - (this.boosting ? 0.5 : 0.2)) * 0.09, -0.09, 0.09);
    this.roll = lerp(this.roll, targetRoll, damp(9, dt || 0.016));
    this.pitchV = lerp(this.pitchV, targetPitch, damp(7, dt || 0.016));

    tr.quatAt(this.s, this.psi, this.worldQuat, this.roll, this.pitchV);
    this.mesh.position.copy(this.worldPos);
    this.mesh.quaternion.copy(this.worldQuat);

    // World velocity, for debris and cameras.
    this.worldVel.copy(f.tan).multiplyScalar(this.va)
      .addScaledVector(f.right, this.vl)
      .addScaledVector(f.up, this.vh);

    animateCarMesh(this.mesh, dt || 0.016, this.forwardSpeed, this.controls.steer, this.controls.brake > 0.2);

    if (this.boosting && this.mode !== 'grid') {
      _v1.copy(this.worldPos).addScaledVector(f.tan, -2.6).addScaledVector(f.up, 0.2);
      _v2.copy(f.tan).multiplyScalar(-1);
      fx.boostFlame(_v1, _v2, 1);
    }
    if (this.shred > 0 && this.h <= 0.2 && Math.random() < 0.4) {
      fx.sparkBurst(this.worldPos, _v1.set(0, 0.4, 0), 3, 0xffa040, 5);
    }
  }
}
