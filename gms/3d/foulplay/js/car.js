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
import { DRIVE, CRASH, CHASSIS_HP, GRAVITY, RAIL_HEIGHT, RAIL_FACE, LOOP, DMG } from './config.js';
import { scene, quality } from './render.js';
import { buildCar, animateCarMesh, partSpec } from './carfactory.js';
import { spawnDetached, spawnScrap, addDebrisTarget, removeDebrisTarget } from './debris.js';
import * as fx from './particles.js';
import { showBubble, bubbleForDamage } from './bubbles.js';
import { emit } from './bus.js';
import { clamp, clamp01, damp, lerp, rand, randInt, wrap, angDiff, sign, smoothstep } from './utils.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _e1 = new THREE.Euler();
const _up = new THREE.Vector3(0, 1, 0);

// How far a wrecked car's origin floats above the surface it has come to rest
// on. The mesh origin sits AT road level (see `pose`), so this is really "a car
// lying on its side is about this far off the deck" — not a ride height.
const WRECK_REST = 0.45;

// Impact scuffs — see `addScuff`. Capped because they are permanent: a car that
// spends a whole race in the pack would otherwise end up as a collage.
const MAX_SCUFFS = 10;
const SCUFF_COLOUR = 0x4a4038;   // scraped-back paint over primer

// --- hinged panels ---------------------------------------------------------
const _fq = new THREE.Quaternion();
const _fe = new THREE.Euler();
const _fp = new THREE.Vector3();
const _fd = new THREE.Vector3();
const _drag = new THREE.Vector3();     // car-space point that is on the tarmac

// Pose a panel that is hanging off its hinge. Rotating a mesh about its own
// centre makes it float away from the car; a torn panel has to stay ATTACHED at
// one point and swing about that, so the part is placed such that the hinge
// lands exactly where it was bolted on:  centre = home + P - R·P.
//
// Writes the panel's grinding corner into `_drag` (car space) and returns its
// height, which is what tells us whether the thing is actually on the road.
function poseFlap(obj, home, flap, ax, ay, az) {
  _fe.set(ax, ay, az, 'YXZ');
  _fq.setFromEuler(_fe);
  const P = flap.pivot;
  _fp.copy(P).applyQuaternion(_fq);
  obj.quaternion.copy(_fq);
  obj.position.set(home.x + P.x - _fp.x, home.y + P.y - _fp.y, home.z + P.z - _fp.z);
  if (!flap.drag) return Infinity;
  _fd.copy(flap.drag).sub(P).applyQuaternion(_fq);
  _drag.set(home.x + P.x + _fd.x, home.y + P.y + _fd.y, home.z + P.z + _fd.z);
  return _drag.y;
}

// Panels that are only *called* by their own name in one place. New part ids
// (arches, sills) borrow a driver reaction from the nearest thing that already
// has one rather than needing bubbles.js to know about them.
const BUBBLE_ALIAS = {
  wingFL: 'bumperF', wingFR: 'bumperF', wingRL: 'bumperR', wingRR: 'bumperR',
  sillL: 'doorL', sillR: 'doorR',
};

// Lateral grip ceiling in m/s². Above this the tyres let go and you run wide —
// this is what stops the auto-straightening assist from driving the car for
// you through a corner.
const MAX_LAT = 26;

let nextId = 1;

// One shared ceiling on grinding sparks for the whole field. A token bucket in
// REAL time, not sim time, because it exists to protect the GPU: refilling on
// elapsed milliseconds means whoever calls first in a frame gets the tokens and
// everybody after it in the same frame gets what is left, with no frame counter
// to plumb through from the render loop.
let grindPool = 0;
let grindLast = 0;
function grindAllow(want) {
  if (want <= 0) return 0;
  const t = performance.now();
  const cap = CRASH.grindBudget * (quality.particles || 1);
  if (!grindLast) { grindLast = t; grindPool = cap; }
  const el = Math.min(0.25, (t - grindLast) / 1000);
  grindLast = t;
  grindPool = Math.min(cap, grindPool + cap * el);
  const give = Math.min(want, Math.floor(grindPool));
  grindPool -= give;
  return give;
}

function bubbleFor(id) {
  const r = bubbleForDamage(BUBBLE_ALIAS[id] || id);
  return Array.isArray(r) ? r : ['annoyed', ''];
}

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
    this.danglers = [];          // part ids hanging off but not yet gone
    this.trackTime = 0;          // this car's own clock, for wobble phases
    this.flailAt = -99;          // last time trailing wreckage hit somebody
    this.stripped = false;       // no structure left, but still very much racing
    // Where the wheels USED to be, in car space. Sparks have to come off the
    // corner that is actually grinding, not out of the middle of the car.
    this.stumps = [];
    this.grindAcc = 0;
    this.grindAt = -99;
    this.grindIx = 0;
    this.wearAcc = 0;            // grinding wear waiting to be spent on panels
    this._wheelPull = 0;

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
    addDebrisTarget(this);

    // Wreck-mode bodies
    this.wreckPos = new THREE.Vector3();
    this.wreckVel = new THREE.Vector3();
    this.wreckSpin = new THREE.Vector3();
    this.groundY = 0;
    this.shedQueue = [];      // panels waiting their turn to leave, during a wreck
    this.scuffs = [];         // impact marks stuck to the bodywork
    this.scuffSeq = 0;
  }

  dispose() {
    removeDebrisTarget(this);
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

    this.trackTime += dt;
    this.tickEffects(dt);
    this.drive(dt);
    this.sanity();
    this.updateDanglers(dt);
    this.syncMesh(dt);
    this.updateGrind(dt);
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
    // A stripped car is allowed to be a mess, but not an impossible one: the
    // wheel count feeds a speed multiplier and a lean, so it must stay countable.
    if (!this.stumps) this.stumps = [];
    if (!Number.isFinite(this.wheelsLost)) this.wheelsLost = this.stumps.length;
    this.wheelsLost = clamp(this.wheelsLost, 0, 8);
    if (!Number.isFinite(this._wheelPull)) this._wheelPull = 0;
    if (!Number.isFinite(this.roll)) this.roll = 0;
    if (!Number.isFinite(this.pitchV)) this.pitchV = 0;
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
    // Five per cent a wheel. A car down to one corner still does 85% of the
    // speed of a whole one, which is the joke: it should be embarrassing to
    // lose to, not impossible to drive.
    const wheelPenalty = Math.max(0.5, 1 - this.wheelsLost * CRASH.wheelSpeedLoss);
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
    // A corner on its rim drags. Small, so the 5%-a-wheel promise holds.
    if (this.wheelsLost > 0) accel -= CRASH.wheelDrag * this.wheelsLost * sign(vf);
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
    if (offTrack && Math.abs(vf) > 6 && this.h <= 0.2) {
      fx.dust(this.worldPos, 0.5);
      // Off the tarmac at speed the underside starts throwing bits off.
      this.wearPanels(CRASH.offTrackWear * clamp01(Math.abs(vf) / 30), dt, 'bottom', 0.06);
    }

    // --- lap counting ------------------------------------------------------
    const half = tr.length * 0.5;
    if (this.prevS > tr.length - half * 0.5 && this.s < half * 0.5) this.onLapLine(1);
    else if (this.s > tr.length - half * 0.5 && this.prevS < half * 0.5) this.onLapLine(-1);
  }

  // The car pulls toward the missing corner. Worked out from where the wheels
  // actually were rather than from a list of names, so a chassis with six of
  // them — or three — behaves without anyone editing this.
  get wheelPull() { return this._wheelPull; }

  recomputeWheelPull() {
    let pull = 0;
    if (!this.stumps) this.stumps = [];
    for (let i = 0; i < this.stumps.length; i++) {
      const st = this.stumps[i];
      // local space: +X is right, -Z is forward. A front corner steers you far
      // harder than a rear one.
      pull += sign(st.x) * (st.z < 0 ? 0.5 : 0.22);
    }
    this._wheelPull = clamp(pull, -1.4, 1.4);
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
    const side = sign(this.t);
    const type = side > 0 ? f.railR : f.railL;

    if (type === 'open') {
      // No barrier: you are on the dirt. Drivable, slow, and there is a limit.
      const over = Math.abs(this.t) - w;
      if (over > 0 && over > 30) this.wreck('ran out of road');
      return;
    }

    // `t` is the car's CENTRE, and the rail's inner face stands at `w + 0.35`.
    // Clamping the centre to `w` therefore parked two thirds of a metre of car
    // inside the steel — which is exactly the "cars go partially through the
    // barrier" you can see from the chase camera. The limit is where the car's
    // FLANK meets the rail, so the bodywork stops at the barrier instead of in
    // it, and the contact point below is a real point on the car.
    const railT = w + RAIL_FACE - CRASH.carWide * 0.5;
    const over = Math.abs(this.t) - railT;
    if (over <= 0) return;

    // Airborne over the barrier line. Do not delete a car for clipping the rail
    // in mid-air off a jump — let it sail, and let it land back on the road.
    // Only somebody genuinely heading for the scenery actually leaves.
    if (this.h > RAIL_HEIGHT * 0.9) {
      if (over > 9) { this.wreck('cleared the barrier'); return; }
      this.vl *= 0.9;
      return;
    }

    const impact = Math.abs(this.vl);

    // You only go THROUGH a barrier if somebody put you there. Driving into it
    // at any speed — however sideways — bounces you back onto the road. That is
    // the deal: the circuit is forgiving so that the danger is other drivers.
    if (this.slammed > 0 && type !== 'wall') {
      const vaultAt = CRASH.railVault * (1 - 0.5 * smoothstep(0.55, 1.4, Math.abs(this.psi)));
      if (impact > vaultAt) {
        this.wreck('put into the barrier');
        return;
      }
    }

    // Bounce. Hit the rail, come back in, maybe a bit crossed up, but racing.
    // A proper thump throws the car back off the steel rather than letting it
    // lean on it: the restitution rises with how hard it arrived, so a scrape
    // still scrapes but a genuine hit visibly rebounds.
    this.t = side * railT;
    const bounce = CRASH.railRestitution
      + (CRASH.railRestitutionHard - CRASH.railRestitution) * clamp01(impact / 16);
    this.vl = -this.vl * bounce;
    const spin = clamp(impact * CRASH.railSpin * 0.02, 0, 0.6);
    this.psi -= side * spin * rand(0.6, 1.3);
    const scrub = clamp(impact * CRASH.railScrub * 0.05, 0, 0.34);
    this.va *= 1 - scrub;
    // Straighten hard afterwards so the player is pointed down the road again
    // almost immediately rather than fighting the car.
    this.recover = Math.max(this.recover, DRIVE.recoverTime * clamp01(impact / 12));

    // Sparks. A thump throws a shower; grinding along the steel throws a
    // continuous rooster tail for as long as you keep leaning on it, which is
    // the shot the broadcast actually wants.
    _v1.copy(f.right).multiplyScalar(-side);
    // Where the car is ACTUALLY touching the steel — its outer flank, at about
    // sill height. Throwing the shower from the car's centre put the sparks
    // inside the bodywork, where most of them are never seen.
    _v3.copy(this.worldPos)
      .addScaledVector(f.right, side * CRASH.carWide * 0.5)
      .addScaledVector(f.up || _up, 0.3);
    if (impact > 2) {
      fx.sparkBurst(_v3, _v1, Math.min(64, 14 + impact * 3.4), 0xffd27a, 10 + impact * 1.9);
      fx.sparkBurst(_v3, (f.up || _up), Math.min(24, 5 + impact * 1.4), 0xffe9a8, 7 + impact);
      fx.smokePuff(_v3, 3, 0xd8d0c4, 1.3, 1.2);
      emit('car:railHit', { car: this, impact });
    }
    const along = Math.abs(this.forwardSpeed);
    if (along > 8) {
      const heat = clamp01(along / 55);
      fx.sparkBurst(_v3, _v1, 4 + Math.round(heat * 10), 0xffbe55, 6 + heat * 20);
      this.scrubbing = 0.25;
      // Leaning on the steel strips the trim off that side of the car.
      this.wearPanels(CRASH.railGrindWear * heat, dt, side > 0 ? 'right' : 'left', 0.1);
      if (this.isPlayer) emit('car:railScrape', { car: this, speed: along });
    }
    // Paint and noise below the scuff threshold; only a real thump costs hp.
    if (impact > CRASH.railScuff) {
      const dmg = (impact - CRASH.railScuff) * CRASH.railDamage;
      this.damage(dmg, side > 0 ? 'right' : 'left', { source: 'barrier' });
    }
  }

  land(impact) {
    const dmg = (impact - CRASH.landHard) * CRASH.landDamage;
    if (dmg > 0) this.damage(dmg, 'bottom', { source: 'landing' });
    this.recover = Math.max(this.recover, 0.5);
    fx.smokePuff(this.worldPos, 5, 0xbdb6a6, 1.8, 1.4);
    emit('car:land', { car: this, impact });
    // Only a genuinely sideways landing off a big jump throws you out.
    if (Math.abs(this.psi) > CRASH.landSpinOut && impact > CRASH.landHard * 1.7) {
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
    // A fresh shunt is the only thing that makes a barrier dangerous.
    if (Math.abs(lateral) > 12) this.slammed = CRASH.slamWindow;
    if (opts.spin) this.psi += opts.spin * massMul * (opts.spinSign || sign(lateral) || 1);
    if (opts.air) this.vh = Math.max(this.vh, opts.air);
    this.recover = Math.max(this.recover, DRIVE.recoverTime);
    if (opts.stun) this.stun = Math.max(this.stun, opts.stun);
    this.hitFlash = 0.22;
    if (opts.by) { this.lastContact = opts.by; this.lastContactAt = performance.now() / 1000; }
  }

  // How hard was that, on a scale of "paint" to "that will need a new car"?
  // One number, derived once, that then decides which panel is picked, how much
  // of the hit goes into bodywork, whether it flaps or leaves, and for how long.
  severityOf(dealt, opts) {
    if (opts && opts.severity != null) return clamp01(opts.severity);
    return clamp01((dealt - CRASH.sevMin) / (CRASH.sevFull - CRASH.sevMin));
  }

  damage(amount, region, opts = {}) {
    if (this.mode === 'out') return 0;
    if (this.invuln > 0 && !opts.force) return 0;
    const armour = this.stats.armour || 1;
    let dealt = amount * armour;
    if (dealt <= 0) return 0;

    const sev = this.severityOf(dealt, opts);
    if (DMG) { DMG.hits++; DMG.dealt += dealt; DMG.amt.push(Math.round(dealt)); DMG.sev.push(+sev.toFixed(2)); }
    // The field-wide counters looked healthy while the player saw nothing come
    // off their own car, so the PLAYER's carnage is counted separately.
    if (this.isPlayer && DMG && DMG.player) {
      const pl = DMG.player;
      pl.hits++; pl.dealt += dealt;
      const src = opts.source || 'contact';
      pl.src[src] = (pl.src[src] || 0) + 1;
    }
    this.hp -= dealt * 0.55;
    this.hitFlash = 0.25;
    emit('car:damaged', { car: this, amount: dealt, region, by: opts.by, source: opts.source });

    // Spread the rest over the panels facing the hit. A hard hit puts far more
    // of itself into bodywork than a scuff does — that is the whole difference
    // between a dent and a bonnet cartwheeling down the road behind you.
    let pool = dealt * CRASH.panelWear * (opts.shear ? CRASH.shearWear : 1) * (0.55 + sev * 1.05);
    const hitOpts = opts.severity != null ? opts : { ...opts, severity: sev };
    const candidates = this.partsInRegion(region);
    let guard = 0;
    while (pool > 0.5 && candidates.length && guard++ < 8) {
      const idx = this.pickPanel(candidates, sev);
      const id = candidates[idx];
      const obj = this.parts[id];
      if (!obj) { candidates.splice(idx, 1); continue; }
      const p = obj.userData.part;
      // Something already flapping does not soak up a hit — it gets more of its
      // hinge knocked out. It does NOT immediately let go, though: cutting the
      // remaining time to half a second every time anything at all touched that
      // end of the car is why, in practice, no panel ever hung on long enough
      // for anybody to notice it was hanging on.
      if (p.dangling > 0) {
        p.dangling = Math.max(0.6, p.dangling - (0.8 + sev * 2.2));
        candidates.splice(idx, 1);
        pool -= 2;
        continue;
      }
      const share = Math.max(1, Math.min(pool, p.hp));
      p.hp -= share;
      pool -= share;
      p.dent = clamp01(1 - p.hp / p.maxHp);
      this.dentPart(obj, p);
      if (p.hp <= 0) {
        this.breakPart(id, hitOpts);
        candidates.splice(idx, 1);
        // Tearing a panel off absorbs energy. Without this a single big slam
        // unzips one whole side of the car in one frame.
        pool *= CRASH.panelAbsorb;
      }
    }

    if (this.hp <= 0) {
      this.hp = 0;
      // Running out of structure no longer ends your afternoon. A car with
      // nothing left on it is the funniest thing on the circuit, so it keeps
      // shedding and keeps racing; only a genuine slam actually writes it off.
      if (dealt >= CRASH.writeOffHit) this.wreck('written off');
      else if (dealt >= CRASH.sevMin) this.stripDown(hitOpts);
    }
    return dealt;
  }

  // Weight the panel roll by mass against severity: a nudge takes a mirror, a
  // slam takes a door. Reads the live part list, so parts added to the factory
  // fall into the right band on their own.
  pickPanel(cands, sev) {
    const bias = sev * 3 - 1.1;      // -1.1 (favour trim) .. 1.9 (favour panels)
    let total = 0;
    for (let i = 0; i < cands.length; i++) {
      const o = this.parts[cands[i]];
      if (o) total += Math.pow(o.userData.part.mass || 0.5, bias);
    }
    if (!(total > 0)) return randInt(0, cands.length - 1);
    let r = Math.random() * total;
    for (let i = 0; i < cands.length; i++) {
      const o = this.parts[cands[i]];
      if (!o) continue;
      r -= Math.pow(o.userData.part.mass || 0.5, bias);
      if (r <= 0) return i;
    }
    return cands.length - 1;
  }

  // Out of hit points but not out of the race. Shed another piece and carry on:
  // the chassis tub and the seat are the only things bolted on for good.
  stripDown(opts = {}) {
    this.hp = 0;
    if (!this.stripped) {
      this.stripped = true;
      emit('car:stripped', { car: this });
      if (DMG) DMG.stripped++;
    }
    const alive = this.livingParts();
    if (!alive.length) { this.shred = Math.max(this.shred, 2); return; }
    this.breakPart(alive[randInt(0, alive.length - 1)], {
      by: opts.by, severity: Math.max(0.55, opts.severity || 0),
    });
  }

  livingParts() {
    const out = [];
    for (const k in this.parts) if (this.parts[k]) out.push(k);
    return out;
  }

  partsInRegion(region) {
    const all = Object.keys(this.parts).filter((k) => this.parts[k]);
    if (!region || region === 'all') return all;
    // Read the region off the LIVE part, not the static table, so pieces added
    // to a car at runtime (impact scuffs) take hits like anything else.
    const near = all.filter((k) => {
      const p = this.parts[k].userData.part;
      const spec = p || partSpec(k);
      return spec && spec.region === region;
    });
    // Always leave something to hit — a rear-ended car with no rear panels
    // left should still shed doors and glass.
    return near.length >= 2 ? near : all;
  }

  // Grinding wear. A barrier scrape and a run through the gravel do not land a
  // "hit" — they grind — but they are the most common thing that happens to a
  // player in a race, and until now they took nothing off the car at all, which
  // is exactly why an ordinary lap looked spotless. This spends a trickle of
  // wear on whatever is only bolted on: no chassis damage, no hit flash, no
  // event, so the car keeps driving exactly as well as it did, it just stops
  // being able to keep hold of its mirrors, arches and sills.
  wearPanels(rate, dt, region, sev) {
    if (this.mode === 'out' || this.mode === 'wreck') return;
    this.wearAcc += rate * dt;
    if (this.wearAcc < 4) return;
    let pool = this.wearAcc;
    this.wearAcc = 0;
    const cands = this.partsInRegion(region);
    let guard = 0;
    while (pool > 0.5 && cands.length && guard++ < 4) {
      const idx = this.pickPanel(cands, sev);
      const id = cands[idx];
      const obj = this.parts[id];
      if (!obj) { cands.splice(idx, 1); continue; }
      const p = obj.userData.part;
      if (p.dangling > 0) { cands.splice(idx, 1); continue; }
      const share = Math.max(1, Math.min(pool, p.hp));
      p.hp -= share;
      pool -= share;
      p.dent = clamp01(1 - p.hp / p.maxHp);
      this.dentPart(obj, p);
      if (p.hp <= 0) {
        this.breakPart(id, { severity: sev, source: 'scrape' });
        cands.splice(idx, 1);
        pool *= CRASH.panelAbsorb;
      }
    }
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

  // A panel that has run out of hit points does not usually leave cleanly. It
  // tears loose at one corner and hangs there — banging on the bodywork, dragging
  // on the tarmac, throwing sparks and occasionally clouting whoever is alongside
  // — and only then does it go. That few seconds is where all the drama is.
  breakPart(id, opts = {}) {
    const obj = this.parts[id];
    if (!obj) return;
    const p = obj.userData.part;
    if (DMG) DMG.breaks++;
    const sev = opts.severity != null ? clamp01(opts.severity) : 0.3;
    // Glass shatters, it does not flap. Everything else — panels, bumpers,
    // mirrors, wheels — gets its few seconds hanging off the side first, and
    // only a real slam rips a piece straight off the car.
    const tearOff = p.glass || p.dangling > 0
      || Math.random() < CRASH.tearOff + sev * CRASH.tearOffSev;
    if (tearOff) {
      if (DMG) DMG.instant++;
      this.detachPart(id, opts);
      return;
    }
    if (DMG) DMG.dangles++;
    this.startDangle(id, p, sev, opts.by);
    fx.sparkBurst(this.worldPos, _v2.set(0, 1, 0), 10 + Math.round((p.mass || 0.5) * 8), 0xffc470, 9);
    const [face, line] = bubbleFor(id);
    if (Math.random() < (this.isPlayer ? 0.5 : 0.9)) showBubble(this, face, line);

    // One panel letting go shakes the hinges out of whatever next to it was
    // already half hanging on. This is what produces the picture the whole
    // exercise is for: several things flapping off the same car at once, rather
    // than one tidy panel at a time.
    if (this.danglers.length < 6 && Math.random() < CRASH.sympathy) {
      const near = this.partsInRegion(p.region);
      const pool = [];
      for (const k of near) {
        const o = this.parts[k];
        if (!o || k === id) continue;
        const q = o.userData.part;
        if (q.glass || q.dangling > 0 || !q.flap) continue;
        if (q.dent > 0.35) pool.push(k);
      }
      if (pool.length) {
        const k = pool[randInt(0, pool.length - 1)];
        const q = this.parts[k].userData.part;
        q.hp = 0;
        if (DMG) DMG.dangles++;
        this.startDangle(k, q, sev * 0.6, opts.by);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Impact scuffs
  // -------------------------------------------------------------------------
  // Two cars hitting each other used to produce no visual event at all — no
  // sparks, no mark, nothing — so a 60 km/h shunt read as two rigid boxes
  // touching. Losing a whole panel is the honest answer, but most contact is
  // not hard enough to earn one, and a crowd that has come to see a demolition
  // derby should not be shown a clean car after a hit like that.
  //
  // So this cheats, deliberately and in the open: it scars the paint where the
  // hit landed, and lifts a torn flap of bodywork off that scar. The flap is a
  // real part — it flaps, it drags, it throws sparks, it clouts whoever is
  // alongside and it eventually leaves — and the dirty mark UNDER it is what
  // sells it as metal that has torn away rather than a shard stuck on. When it
  // finally goes, the scar stays behind, which is the whole trick: the car
  // keeps a record of every hit it has taken.
  //
  // A region that has already lost its panel gets the mark and no flap: there
  // is nothing left there to tear.
  addScuff(worldPoint, region, sev) {
    if (this.mode === 'out' || this.scuffs.length >= MAX_SCUFFS) return;
    const mats = this.mesh.userData.mats;
    if (!mats) return;

    // Pull the hit onto the car's shell, so a mark is always ON the bodywork
    // even when the two cars overlapped by half a metre.
    _v1.copy(worldPoint);
    this.mesh.worldToLocal(_v1);
    const hw = CRASH.carWide * 0.5, hl = CRASH.carLen * 0.5;
    const side = region === 'left' ? -1 : region === 'right' ? 1 : 0;
    const end = region === 'front' ? -1 : region === 'rear' ? 1 : 0;
    let nx = 0, nz = 0;
    if (side) { _v1.x = side * hw; nx = side; } else if (end) { _v1.z = end * hl; nz = end; }
    else return;                               // top/bottom hits get sparks only
    _v1.y = clamp(_v1.y, 0.35, CRASH.carHigh * 0.9);
    _v1.z = side ? clamp(_v1.z, -hl * 0.8, hl * 0.8) : _v1.z;
    _v1.x = end ? clamp(_v1.x, -hw * 0.7, hw * 0.7) : _v1.x;

    // The scar. Scraped-back paint over primer, not a black blob.
    const size = 0.5 + sev * 0.9;
    const mark = new THREE.Mesh(
      new THREE.PlaneGeometry(size * rand(0.8, 1.3), size * rand(0.5, 0.85)),
      new THREE.MeshLambertMaterial({ color: SCUFF_COLOUR, transparent: true, opacity: 0.72 + sev * 0.2 })
    );
    mark.position.copy(_v1).addScaledVector(_v2.set(nx, 0, nz), 0.015);
    mark.rotation.y = nx ? nx * Math.PI * 0.5 : (nz > 0 ? Math.PI : 0);
    mark.rotation.z = rand(-0.4, 0.4);
    mark.renderOrder = 1;
    mark.material.__owned = true;
    this.mesh.add(mark);
    this.scuffs.push(mark);

    // Nothing left on that side to tear, or not a hard enough hit for one.
    if (sev < CRASH.scuffFlapSev) return;
    const region2 = this.partsInRegion(region);
    if (!region2.length) return;

    const id = `scuff${this.scuffSeq++}`;
    const flapW = size * rand(0.55, 0.85);
    const shard = new THREE.Mesh(
      new THREE.BoxGeometry(nx ? 0.04 : flapW, size * rand(0.4, 0.7), nz ? 0.04 : flapW),
      mats.bodyMat
    );
    // The torn side keeps the paint; the exposed underside is bare metal. Two
    // materials on one box is free here and it is what stops the flap reading
    // as a painted tile glued to the door.
    shard.material = [mats.bodyMat, mats.rustMat, mats.bodyMat, mats.rustMat,
      mats.bodyMat, mats.rustMat];
    shard.position.copy(_v1).addScaledVector(_v2.set(nx, 0, nz), 0.03);
    shard.castShadow = quality.shadows;
    shard.name = id;
    shard.userData.part = {
      id,
      hp: 6, maxHp: 6,
      mass: 0.22,
      region,
      glass: false,
      wheel: false,
      home: shard.position.clone(),
      dent: 0,
      scuff: mark,
    };
    // Hinged along its top edge and peeled outward, like a panel torn at the
    // seam and folded back by the car that hit it.
    shard.userData.part.flap = {
      style: 'wing',
      pivot: new THREE.Vector3(0, size * 0.3, 0),
      drag: null,
      dir: nx || nz || 1,
      ang: 0.85 + sev * 0.7,
      ang0: 0.22,
      rate: 9.5,
      buzz: 26,
      twist: 0.5,
      sag: 0,
      slam: false,
    };
    this.mesh.add(shard);
    this.parts[id] = shard;
    // Short-lived on purpose. This is a garnish on a hit, not a panel loss, and
    // a car should not finish a race wearing eight of them.
    this.startDangle(id, shard.userData.part, sev, null, rand(2.2, 5.5));
  }

  // Put a panel into the flapping state and tell everyone about it.
  startDangle(id, p, sev, by, maxFor) {
    const mass = p.mass || 0.5;
    // Long enough to be enjoyed, and long enough that the next one to go is
    // still overlapping this one. A hard hit shortens the show a little.
    p.dangleFor = (CRASH.dangleBase + mass * CRASH.dangleMass) * rand(0.78, 1.4) * (1 - sev * 0.3);
    // A car mid-wreck has a few seconds of screen time, not fourteen: anything
    // that tears loose during the crash has to visibly go BEFORE the recovery
    // truck arrives, or the break-up ends with panels still politely attached.
    if (maxFor) p.dangleFor = Math.min(p.dangleFor, maxFor);
    p.dangling = p.dangleFor;
    p.dangleBy = by || null;
    p.dangleSeed = rand(0, 6.28);
    p.dangleHinge = p.flap ? p.flap.dir : (Math.random() < 0.5 ? -1 : 1);
    p.dangleAmp = 0.55 + mass * 0.85;
    p.sparkAcc = 0;
    if (!this.danglers.includes(id)) this.danglers.push(id);
    if (this.isPlayer && DMG && DMG.player) {
      DMG.player.dangles++;
      DMG.player.maxDang = Math.max(DMG.player.maxDang, this.danglers.length);
    }
    emit('car:dangling', { car: this, part: id, by });
  }

  // Swing whatever is still hanging on, scrape it along the road and count it
  // down to the moment it finally lets go.
  //
  // Every panel used to share one wobble, which is why nothing on this car ever
  // read as a specific thing going wrong. Each one now folds about its own
  // hinge in its own way: the bonnet stands up and slams on the scuttle, the
  // door swings out and drags its bottom corner, the bumper hangs by one end
  // and ploughs the tarmac, the arch just shivers itself to death. And anything
  // with a `drag` corner is HELD ON THE ROAD — the swing is clamped so the
  // corner rests on the surface, so the sparks come off the point that is
  // genuinely touching rather than out of the middle of the car.
  updateDanglers(dt) {
    if (!this.danglers.length) return;
    const speed = Math.abs(this.forwardSpeed);
    const flapK = clamp01(speed / 46);
    const t = this.trackTime;
    const grounded = this.h < 0.35 && this.mode !== 'wreck';
    if (this.isPlayer && DMG && DMG.player) {
      DMG.player.dangSecs += dt;
      if (this.danglers.length >= 2) DMG.player.multiSecs += dt;
      DMG.player.maxDang = Math.max(DMG.player.maxDang, this.danglers.length);
    }

    for (let i = this.danglers.length - 1; i >= 0; i--) {
      const id = this.danglers[i];
      const obj = this.parts[id];
      if (!obj) { this.danglers.splice(i, 1); continue; }
      const p = obj.userData.part;
      p.dangling -= dt;
      const f = p.flap;
      if (!f || !p.home) { if (p.dangling <= 0) this.detachPart(id, { by: p.dangleBy }); continue; }

      // A panel tears a little looser every second it hangs on: `loose` runs 0
      // (just went) to 1 (about to leave), and everything gets bigger with it.
      const loose = clamp01(1 - p.dangling / (p.dangleFor || 4));
      const seed = p.dangleSeed;
      const w = t * f.rate * (0.55 + 0.95 * flapK) + seed;
      // A hinged panel does not swing like a pendulum, it gets thrown open and
      // banged shut, so the drive is one-sided rather than a sine.
      const s = 0.5 - 0.5 * Math.cos(w);
      const swing = f.ang0 + (f.ang - f.ang0) * (0.44 + 0.56 * loose) * (0.45 + 0.55 * flapK);
      const buzz = f.buzz ? Math.sin(t * f.buzz + seed * 3) * 0.055 * (0.35 + flapK) * (0.4 + loose) : 0;
      let ax = 0, ay = 0, az = 0, clampGround = true;

      switch (f.style) {
        case 'bonnet':      // hinged at the scuttle: stands up, slams back down
        case 'boot':        // hinged at the cabin: flaps up and down at the tail
          ax = f.dir * swing * (0.34 + 0.66 * Math.pow(s, 0.65)) + buzz;
          ay = buzz * 0.6;
          az = Math.sin(w * 0.53 + seed) * 0.09 * loose;
          break;
        case 'roof':        // peels back off the pillars
          ax = f.dir * swing * (0.35 + 0.65 * s);
          az = f.twist * swing * Math.sin(w * 0.7 + seed) * 0.6;
          ay = buzz;
          break;
        case 'door':        // swings out on its hinge and scrapes its back corner
          ay = f.dir * swing * (0.3 + 0.7 * s);
          ax = f.sag * swing * (0.35 + 0.65 * s) + buzz;
          az = buzz * 0.5;
          break;
        case 'bumper':      // hanging by one corner, ploughing the road
          az = f.dir * swing * (0.28 + 0.72 * s);
          ay = f.twist * swing * (0.3 + 0.7 * s);
          ax = buzz * 1.4;
          break;
        case 'spoiler':     // waggles and twists, never touches anything
          az = f.dir * swing * Math.sin(w) + buzz * 2;
          ay = f.twist * swing * Math.sin(w * 0.71 + 1.1);
          ax = buzz;
          break;
        case 'wing':        // vibrates itself loose, then tears outward
          az = f.dir * swing * (0.12 + 0.88 * loose * s) + buzz * 2.2;
          ax = buzz * 2.6;
          ay = f.twist * swing * loose * Math.sin(w * 1.3);
          break;
        case 'sill':        // drops its trailing end and grinds the whole way
          ax = f.dir * swing * (0.35 + 0.65 * s) + buzz;
          az = f.twist * swing * Math.sin(w * 0.8 + seed);
          break;
        case 'mirror':      // flutters on its stalk
          az = f.dir * swing * (0.35 + 0.65 * s) + buzz * 3;
          ay = f.twist * swing * Math.sin(w * 1.7 + seed);
          break;
        case 'wheel':       // hanging off the stub axle, still turning
          az = f.dir * swing * (0.4 + 0.6 * s);
          ay = f.twist * swing * Math.sin(w * 0.6);
          ax = p.spin || 0;
          clampGround = false;      // it is already sitting on the road
          break;
        default:
          az = f.dir * swing * (0.3 + 0.7 * s) + buzz;
          ax = buzz;
      }

      let dragY = poseFlap(obj, p.home, f, ax, ay, az);
      let touching = false;
      if (f.drag && grounded) {
        if (clampGround && dragY < 0.06) {
          // Hold it ON the road: back the swing off until the corner rests on
          // the surface. Five halvings is smooth enough at 60Hz and stops a
          // door from swinging down through the tarmac.
          let lo = 0, hi = 1;
          for (let k = 0; k < 5; k++) {
            const mid = (lo + hi) * 0.5;
            if (poseFlap(obj, p.home, f, ax * mid, ay * mid, az * mid) < 0.06) hi = mid;
            else lo = mid;
          }
          poseFlap(obj, p.home, f, ax * lo, ay * lo, az * lo);
          touching = true;
        } else if (!clampGround) {
          touching = dragY < 0.14;
        }
      }

      // Sparks off the corner that is genuinely on the tarmac.
      if (touching && speed > 5) {
        p.sparkAcc = (p.sparkAcc || 0) + dt * CRASH.dragSparkRate * (0.35 + flapK);
        let n = Math.floor(p.sparkAcc);
        if (n > 0) {
          p.sparkAcc -= n;
          n = grindAllow(Math.min(n, 2));
          if (n > 0) {
            this.mesh.localToWorld(_v3.copy(_drag));
            const up = (this.frame && this.frame.up) || _up;
            _v2.copy(up).multiplyScalar(0.5);
            if (this.frame && this.frame.tan) _v2.addScaledVector(this.frame.tan, -0.8);
            fx.sparkBurst(_v3, _v2, 3 + Math.round(flapK * 5), 0xffb43a, 8 + flapK * 20);
            if (Math.random() < 0.22) fx.smokePuff(_v3, 1, 0xb9b2a6, 0.9, 0.8);
          }
        }
        if (this.trackTime - (p.scrapeAt || -9) > 0.6) {
          p.scrapeAt = this.trackTime;
          emit('car:scrape', { car: this, part: id, speed });
        }
      } else if (f.slam && grounded && speed > 12 && s < 0.08 && this.trackTime - (p.slamAt || -9) > 0.28) {
        // A bonnet or a boot lid banging shut on the bodywork.
        p.slamAt = this.trackTime;
        if (grindAllow(1)) {
          obj.getWorldPosition(_v3);
          fx.sparkBurst(_v3, _v2.set(0, 0.6, 0), 4, 0xffc470, 7);
        }
        if (this.isPlayer) emit('car:scrape', { car: this, part: id, speed });
      }

      if (p.dangling <= 0) {
        this.detachPart(id, {
          by: p.dangleBy,
          dir: _v1.set(f.dir * 0.6, 0.7, f.style === 'boot' || f.style === 'spoiler' ? 0.6 : -0.2).normalize(),
        });
      }
    }
  }

  // A panel swinging off the side of a car is a weapon nobody meant to fit.
  hasDangler() { return this.danglers.length > 0; }

  // Sparks come off the corner that is ACTUALLY on its rim, in world space —
  // one wheel gone is a steady stream from that hub, two is both of them, and
  // three or four is the whole underside on the tarmac.
  updateGrind(dt) {
    const n = this.stumps ? this.stumps.length : 0;
    if (!n || this.h > 0.3 || this.mode === 'wreck' || this.mode === 'out') { this.grindAcc = 0; return; }
    const speed = Math.abs(this.forwardSpeed);
    if (speed < 3.5) { this.grindAcc = 0; return; }

    const heat = clamp01(speed / 45);
    const f = this.frame;
    const up = (f && f.up) || _up;
    // The step from one corner to four has to read on a phone, where the
    // particle budget is already halved. So the RATE stacks, the fan gets
    // wider and the sparks get thrown further — three cues, not just "more
    // dots", and all three survive a 0.5x count multiplier.
    const rate = CRASH.grindRate * (0.45 + heat) * (1 + (n - 1) * CRASH.grindStack) * (quality.particles || 1);
    this.grindAcc += rate * dt;
    let bursts = Math.floor(this.grindAcc);
    if (bursts <= 0) return;
    this.grindAcc -= bursts;
    if (bursts > n + 1) bursts = n + 1;      // per-car, per-frame ceiling
    bursts = grindAllow(bursts);             // and the field shares one budget
    const spread = 1 + (n - 1) * 0.34;
    const throw_ = 7 + heat * 18 + (n - 1) * 4;

    for (let i = 0; i < bursts; i++) {
      this.grindIx = (this.grindIx + 1) % n;
      const st = this.stumps[this.grindIx];
      _v1.copy(st).applyQuaternion(this.worldQuat).add(this.worldPos)
        .addScaledVector(up, -st.y * 0.9);
      // A shorter direction vector against sparkBurst's fixed jitter is a
      // wider cone: the underside of a car on three rims sprays sideways.
      _v2.copy(up).multiplyScalar(0.55 / spread);
      if (f && f.tan) _v2.addScaledVector(f.tan, -0.75 / spread);
      fx.sparkBurst(_v1, _v2, 2 + Math.round(heat * 3), 0xffb43a, throw_);
    }

    // Down to the last corner or two: the floorpan itself is grinding.
    if (n >= 3 && Math.random() < dt * 9 && grindAllow(1)) {
      _v1.copy(this.worldPos).addScaledVector(up, -0.05);
      _v2.copy(up).multiplyScalar(0.32);
      if (f && f.tan) _v2.addScaledVector(f.tan, -0.45);
      fx.sparkBurst(_v1, _v2, 3 + Math.round(heat * 4), 0xffd27a, 11 + heat * 22);
      if (Math.random() < 0.35) fx.smokePuff(_v1, 1, 0xb9b2a6, 1.0, 0.9);
    }

    if (this.trackTime - this.grindAt > 0.45) {
      this.grindAt = this.trackTime;
      emit('car:grind', { car: this, wheels: n, speed });
    }
  }

  detachPart(id, opts = {}) {
    const obj = this.parts[id];
    if (!obj) return;
    const p = obj.userData.part;
    const di = this.danglers.indexOf(id);
    const wasDangling = di >= 0;
    if (wasDangling) this.danglers.splice(di, 1);
    this.parts[id] = null;
    this.partsLost.push(id);

    obj.getWorldPosition(_v1);
    obj.getWorldQuaternion(_q1);

    if (p.glass) {
      // Glass does not fly off in one piece.
      fx.glassBurst(_v1);
      obj.parent && obj.parent.remove(obj);
    } else {
      const mass = p.mass || 0.7;
      const vel = this.worldVel.clone();
      vel.x += rand(-5, 5);
      vel.z += rand(-5, 5);
      vel.y += rand(3, 9);
      if (opts.dir) vel.addScaledVector(opts.dir, rand(3, 9));
      spawnDetached(obj, _v1, _q1, vel, this.debrisFloor(), {
        mass, spin: 1 + mass * 0.4,
        // Big panels stay in play. A bonnet bouncing back through the field is
        // the thing the owner actually asked for, and it needs time to do it.
        life: CRASH.debrisLife + mass * CRASH.debrisLifeMass,
        hazard: true,
        radius: 0.55 + mass * 0.55,
        owner: this.id,
      });
      fx.sparkBurst(_v1, _v2.set(0, 1, 0), 8 + Math.round(mass * 6), 0xffc470, 8);
    }

    if (p.wheel) {
      this.wheelsLost++;
      this.shred = Math.max(this.shred, 3);
      if (!this.stumps) this.stumps = [];
      if (p.home) this.stumps.push(p.home.clone());
      this.recomputeWheelPull();
      if (DMG) { DMG.wheelsOff++; DMG.maxWheelsLost = Math.max(DMG.maxWheelsLost, this.wheelsLost); }
    }
    if (DMG) DMG.partsOff++;
    // Lose anything over the driver's head and you can see the driver. Keyed on
    // the region rather than the name, so a factory that adds a second roof
    // panel does not need this line changing.
    if (p.region === 'top') {
      const d = this.mesh.userData.driver;
      if (d) d.visible = true;
    }

    if (this.isPlayer && DMG && DMG.player) {
      DMG.player.parts++;
      DMG.player.lost.push(id);
      if (p.wheel) DMG.player.wheels++;
      if (!wasDangling) DMG.player.instant++;
    }
    emit('car:partOff', { car: this, part: id, by: opts.by });
    // The driver already pulled a face when it tore loose; do not do it twice.
    if (!wasDangling) {
      const [face, line] = bubbleFor(id);
      if (Math.random() < (this.isPlayer ? 0.45 : 0.85)) showBubble(this, face, line);
    }
  }

  // -------------------------------------------------------------------------
  // Wrecks
  // -------------------------------------------------------------------------
  wreck(reason, extraImpulse) {
    if (this.mode === 'wreck' || this.mode === 'out') return;
    this.mode = 'wreck';
    this.wreckTime = 0;
    this.wreckReason = reason;
    if (DMG) DMG.wrecks[reason] = (DMG.wrecks[reason] || 0) + 1;

    this.wreckPos.copy(this.worldPos);
    this.wreckVel.copy(this.worldVel);
    if (extraImpulse) this.wreckVel.add(extraImpulse);
    this.wreckVel.y = Math.max(this.wreckVel.y, 4) + rand(2, 8);
    this.wreckSpin.set(rand(-3, 3), rand(-4, 4), rand(-5, 5)).multiplyScalar(CRASH.wreckSpin * 0.4);
    this.groundY = this.groundLevel();

    this.startBreakUp(reason);
    fx.explode(this.worldPos, 14, 0xffa040);
    showBubble(this, this.isPlayer ? 'shock' : 'scared');
    emit('car:wreck', { car: this, reason, by: this.recentContact() });
  }

  recentContact() {
    const t = performance.now() / 1000;
    return t - this.lastContactAt < 2.4 ? this.lastContact : null;
  }

  // Leaving the circuit is an instant loss, so it is also the one moment the
  // car is allowed to come apart completely — and it has to do it OVER the
  // crash, not in the single frame the impact landed on.
  //
  // The old version detached two to five parts in one tick and then tumbled a
  // rigid shell for four seconds, which is why a wreck read as a car turning
  // into a rock. Now a couple go outright at the moment of impact, a handful
  // more tear half-loose and flap through the tumble, and the rest are queued
  // to let go at their own moment across the next couple of seconds, so there
  // is always something leaving the car while the replay camera is on it.
  startBreakUp(reason) {
    const total = this.wreckOffTrack(reason);
    const alive = this.livingParts();
    for (let i = alive.length - 1; i > 0; i--) {
      const j = randInt(0, i);
      const tmp = alive[i]; alive[i] = alive[j]; alive[j] = tmp;
    }
    // How much of what is left goes. Off the circuit the car is finished, so
    // almost all of it does; a car written off ON the track keeps racing after
    // the truck drops it back, so it only loses a third.
    const share = total ? rand(0.78, 1.0) : rand(0.28, 0.45);
    const take = Math.min(alive.length, Math.ceil(alive.length * share));
    const queue = this.shedQueue;
    queue.length = 0;

    for (let i = 0; i < take; i++) {
      const id = alive[i];
      if (i < 2) {
        // The impact itself. These leave now, hard, in the direction of travel.
        this.detachPart(id, { dir: _v1.set(rand(-1, 1), 1, rand(-1, 1)).normalize() });
      } else if (i < 6) {
        // Half off and flapping before the car has finished its first roll.
        const p = this.parts[id] && this.parts[id].userData.part;
        if (p && p.flap && !p.glass) this.startDangle(id, p, rand(0.55, 0.9), null, rand(0.7, 1.8));
        else queue.push({ at: rand(0.1, 0.5), id });
      } else {
        queue.push({ at: rand(0.25, CRASH.breakUpSpread), id });
      }
    }
    queue.sort((a, b) => a.at - b.at);
  }

  // Every wreck except a structural write-off happened because the car left the
  // circuit, and that is the one that is allowed to disintegrate.
  wreckOffTrack(reason) { return reason !== 'written off'; }

  // Let the queued panels go, one moment at a time, for as long as the wreck is
  // still on screen. Each one throws its own shower rather than sharing the
  // impact's, which is the difference between "a crash" and "one bang".
  shedTick(dt) {
    const q = this.shedQueue;
    if (!q.length) return;
    while (q.length && q[0].at <= this.wreckTime) {
      const id = q.shift().id;
      const obj = this.parts[id];
      if (!obj) continue;
      const p = obj.userData.part;
      // Two thirds tear at a corner and flap for a moment first; the rest are
      // ripped clean off. Mixing the two is what keeps the break-up from
      // looking metronomic.
      if (p.flap && !p.glass && Math.random() < 0.66) {
        this.startDangle(id, p, rand(0.4, 0.85), null, rand(0.6, 1.6));
      } else {
        obj.getWorldPosition(_v3);
        this.detachPart(id, { dir: _v1.set(rand(-1, 1), rand(0.4, 1), rand(-1, 1)).normalize() });
        fx.sparkBurst(_v3, _up, 10 + Math.round((p.mass || 0.5) * 10), 0xffc470, 11);
        fx.smokePuff(_v3, 2, 0xb8b0a2, 1.3, 1.2);
      }
    }
  }

  updateWreck(dt) {
    this.wreckTime += dt;
    // A wrecked car used to be a rigid brick: `update` returned here before
    // reaching `updateDanglers`, so every panel torn half-off in the impact
    // froze mid-pose and never let go. The replay camera was orbiting a solid
    // object. Bodywork keeps flapping and keeps leaving all the way through the
    // tumble now — `updateDanglers` already knows not to drag on the road in
    // wreck mode, so it needs nothing but the clock.
    this.trackTime += dt;
    this.updateDanglers(dt);
    this.wreckVel.y -= CRASH.wreckGravity * dt;
    this.wreckPos.addScaledVector(this.wreckVel, dt);

    _e1.set(this.wreckSpin.x * dt, this.wreckSpin.y * dt, this.wreckSpin.z * dt);
    _q1.setFromEuler(_e1);
    this.worldQuat.multiply(_q1);

    // Re-read the floor every frame. Sampling it once at the moment of impact
    // meant a car that crashed on a crest and then slid fifty metres down the
    // run-off kept the crest's height and buried itself in the hill.
    this.groundY = this.groundLevel(this.wreckPos);
    const floor = this.groundY + WRECK_REST;
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
          const alive = this.livingParts();
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

    this.shedTick(dt);

    // Do not send the truck while the car is still shedding — the break-up IS
    // the shot, and `wreckMaxTime` is still there as the hard cap.
    const settled = this.wreckVel.lengthSq() < 9 && Math.abs(this.wreckPos.y - floor) < 0.4
      && !this.shedQueue.length;
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
    this.shedQueue.length = 0;   // whatever the truck did not get round to
    this.mesh.visible = true;
    if (this.hp <= 0) this.hp = this.maxHp * 0.35;
    this.wheelsLost = 0;   // the truck bolts something on
    this.stumps.length = 0;
    this._wheelPull = 0;
    this.grindAcc = 0;
    this.stripped = false;
    emit('car:rejoin', { car: this });
  }

  retire() {
    this.retired = true;
    this.mode = 'out';
    this.mesh.visible = false;
  }

  // Where a panel that has just come off should settle. Sampled once, at the
  // moment it is shed, because re-probing every loose piece every frame is a
  // nearest-point search per panel per frame and there can be eighty of them.
  // A car up on a kerb or mid-air wants the surface under the CAR, so the
  // bonnet lands on the road beside it rather than at the bottom of the verge.
  debrisFloor() {
    const f = this.frame;
    const g = this.groundLevel();
    const upright = f && f.up && f.up.y > 0.5 && this.h < 1.5 && this.mode !== 'wreck';
    return upright ? Math.max(g, this.worldPos.y - 0.42) : g;
  }

  // World Y of the surface under this car. `trackmesh.js` builds the probe,
  // because it is the only file that knows the apron profile and the terrain
  // heightfield; the fallback is only ever hit by dev.html, which builds tracks
  // without a mesh.
  groundLevel(pos) {
    const tr = this.track;
    if (tr.groundProbe) return tr.groundProbe(pos || this.worldPos, this.s);
    const i = Math.floor(tr.idx(this.s));
    return tr.pos[i].y;
  }

  // -------------------------------------------------------------------------
  giveBoost(n = 1) {
    this.boosts = Math.min(this.maxBoosts, this.boosts + n);
  }

  // The leader's handicap. Nitro is cut off for whoever is in front, which is
  // the rule that makes this a fighting game instead of a running-away game:
  // build a lead and you lose your best tool for keeping it, so the reliable
  // way to win is to stay in the pack and take people apart.
  get boostLocked() { return this.position === 1 && !this.finished; }

  useBoost() {
    if (this.boosts <= 0 || this.boostTime > 0.6) return false;
    if (this.boostLocked) {
      if (this.isPlayer) emit('boost:denied', { car: this });
      return false;
    }
    this.boosts--;
    this.boostTime = DRIVE.boostTime + (this.stats.boostTime || 0);
    emit('car:boost', { car: this });
    return true;
  }

  padBoost() {
    if (this.boostLocked) {
      if (this.isPlayer) emit('boost:denied', { car: this, pad: true });
      return;
    }
    this.boostTime = Math.max(this.boostTime, DRIVE.padBoostTime);
    emit('car:padBoost', { car: this });
  }

  // -------------------------------------------------------------------------
  syncMesh(dt) {
    const tr = this.track;
    const f = this.frame.p ? this.frame : tr.frameAt(this.s, this.frame);

    // A car missing wheels sits down on its floorpan — and by the fourth corner
    // it really is ON the floorpan, or a car with nothing to stand on reads as
    // hovering rather than as a sledge. Capped by the chassis's own ride height,
    // because dropping it any further buries the sills in the tarmac.
    const ride = (this.mesh.userData.style && this.mesh.userData.style.ride) || 0.44;
    const sag = this.wheelsLost
      ? Math.min(ride * 0.72, this.wheelsLost * CRASH.wheelSag) : 0;
    tr.worldAt(this.s, this.t, this.h + 0.02 - sag, this.worldPos);

    // Suspension: lean into the corner, squat under power, dive under braking.
    // A missing corner drops that side of the car onto the road as well.
    const lat = clamp(this.sideSlip / 16, -1, 1);
    const targetRoll = -lat * 0.2 + this._wheelPull * 0.12
      + (this.hitFlash > 0 ? rand(-0.05, 0.05) : 0);
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
