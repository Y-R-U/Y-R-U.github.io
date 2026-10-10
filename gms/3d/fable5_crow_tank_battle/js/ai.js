// AI tank controller. Personalities (config.PERSONALITIES) shape target
// choice, preferred range, courage, accuracy and movement style. The
// controller only writes tank.moveInput / aimPoint / wantFire — the Tank
// itself handles physics, so AI and player obey identical rules.

import * as THREE from 'three';
import { TANK, OPENING, MURDER } from './config.js';
import { rand, clamp, leadAim } from './utils.js';
import { losClear } from './combat.js';
import { obstacles } from './world.js';
import { state, aliveTanks } from './state.js';

const _v = new THREE.Vector3();

export class AIController {
  constructor(tank, personality) {
    this.tank = tank;
    this.p = personality;
    this.mode = 'roam';
    this.target = null;
    this.waypoint = new THREE.Vector3(rand(-20, 20), 0, rand(-20, 20));
    this.decisionTimer = rand(0, 0.4);
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.strafeTimer = rand(1, 2.5);
    this.aimJitter = 0;
    this.errSeed = rand(0, Math.PI * 2);
  }

  update(dt) {
    this.decisionTimer -= dt;
    if (this.decisionTimer <= 0) {
      this.decisionTimer = rand(0.25, 0.5);
      this.decide();
    }
    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafeTimer = rand(1.2, 2.6);
      this.strafeDir *= -1;
    }
    this.steer(dt);
    this.aim(dt);
  }

  // ---- high-level decisions, a few times per second ----

  decide() {
    const me = this.tank;
    const others = aliveTanks().filter((t) => t !== me);
    if (others.length === 0) {
      this.mode = 'roam';
      this.target = null;
      return;
    }

    const hpFrac = me.hp / TANK.hp;
    // How far the murder has closed, 0..1. Awareness grows with it, so early
    // fights stay local and the crows herd everyone together for the finish.
    const closed = clamp((MURDER.startR - state.zoneR) / (MURDER.startR - MURDER.minR), 0, 1);
    const endgame = state.zoneR < 26;

    // hurt + scared -> flee (but in the endgame everyone has to fight)
    if (hpFrac < this.p.courage && !endgame) {
      this.mode = 'flee';
      this.target = this.nearestOf(others);
      this.pickWounded(others);   // may still shoot back while running
      return;
    }

    // tempted by a harvest pumpkin?
    if (hpFrac < 0.65 && Math.random() < this.p.pickupLove) {
      const pk = this.nearestPickup(40, 'heal');
      if (pk) {
        this.mode = 'collect';
        this.pickup = pk;
        this.target = this.nearestOf(others);
        return;
      }
    }

    // a buff lying close by is worth a detour (crow-ward matters once the ring moves)
    if (this.mode === 'collect' && this.pickup && this.pickup.alive && Math.random() < 0.85) return;
    if (Math.random() < this.p.pickupLove * 0.5) {
      const pk = this.nearestPickup(18);
      if (pk && (pk.kind !== 'ward' || state.zoneShrinking)) {
        this.mode = 'collect';
        this.pickup = pk;
        this.target = this.nearestOf(others);
        return;
      }
    }

    // choose a target per personality
    let target = null;
    switch (this.p.target) {
      case 'nearest': target = this.nearestOf(others); break;
      case 'weakest': target = this.weakestOf(others); break;
      case 'attacker':
        target = (me.lastAttacker && me.lastAttacker.alive) ? me.lastAttacker
          : (endgame ? this.nearestOf(others) : null);
        break;
      case 'nearby': {
        const n = this.nearestOf(others);
        target = (n && n.pos.distanceTo(me.pos) < 12 + 16 * closed) || endgame ? n : null;
        break;
      }
    }

    // awareness gate: don't cross the map to start fights — roam until
    // someone is close (or hit us), and let the murder force the endgame
    if (target && !endgame && target !== me.lastAttacker) {
      const k = state.matchTime < OPENING.time ? OPENING.awareness : 0.45 + 0.55 * closed;
      const awareness = (this.p.range * 1.5 + 5) * k;
      if (target.pos.distanceTo(me.pos) > awareness) target = null;
    }

    if (target && (endgame || Math.random() < this.p.aggression + 0.25)) {
      if (target.isPlayer && (this.mode !== 'engage' || this.target !== target) &&
          state.hooks.onStalk) state.hooks.onStalk(me);
      this.mode = 'engage';
      this.target = target;
    } else {
      this.mode = 'roam';
      this.target = target; // may still take pot shots while roaming
      if (this.waypoint.distanceTo(me.pos) < 5) this.newRoamPoint();
    }
  }

  pickWounded(others) {
    // fleeing tanks still return fire at whoever hurt them
    if (this.tank.lastAttacker && this.tank.lastAttacker.alive) {
      this.target = this.tank.lastAttacker;
    }
  }

  nearestOf(list) {
    let best = null, bd = Infinity;
    for (const t of list) {
      const d = t.pos.distanceToSquared(this.tank.pos);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  weakestOf(list) {
    // distance-weighted so the whole lobby doesn't pile onto one victim
    let best = null, bs = Infinity;
    for (const t of list) {
      const d = t.pos.distanceTo(this.tank.pos);
      if (d > 50) continue;
      const s = t.hp + d * 1.5;
      if (s < bs) { bs = s; best = t; }
    }
    return best || this.nearestOf(list);
  }

  nearestPickup(maxD, kind) {
    let best = null, bd = maxD * maxD;
    for (const pk of state.pickups) {
      if (kind && pk.kind !== kind) continue;
      if (!kind && pk.kind === 'heal') continue;
      const d = pk.pos.distanceToSquared(this.tank.pos);
      if (d < bd) { bd = d; best = pk; }
    }
    return best;
  }

  // Roam to a nearby spot inside the ring. Until the murder has closed most
  // of the way, prefer spots away from other tanks so the field stays spread
  // out instead of everyone meeting in the middle.
  newRoamPoint() {
    const me = this.tank;
    const maxR = Math.max(6, state.zoneR * 0.78);
    const closed = (MURDER.startR - state.zoneR) / (MURDER.startR - MURDER.minR);
    const tries = closed < 0.6 ? 5 : 1;
    let bx = 0, bz = 0, best = -1;
    for (let i = 0; i < tries; i++) {
      const a = rand(0, Math.PI * 2);
      const d = rand(8, 22);
      let x = me.pos.x + Math.cos(a) * d, z = me.pos.z + Math.sin(a) * d;
      const r = Math.hypot(x, z);
      if (r > maxR) { x *= maxR / r; z *= maxR / r; }
      let near = Infinity;
      for (const t of aliveTanks()) {
        if (t === me) continue;
        near = Math.min(near, (t.pos.x - x) ** 2 + (t.pos.z - z) ** 2);
      }
      if (near > best) { best = near; bx = x; bz = z; }
    }
    this.waypoint.set(bx, 0, bz);
  }

  // ---- steering, every frame ----

  steer(dt) {
    const me = this.tank;
    const myR = Math.hypot(me.pos.x, me.pos.z);

    if (this.mode === 'engage' && this.target && this.target.alive) {
      // hold preferred range, orbit-strafe around the target
      const t = this.target;
      _v.copy(me.pos).sub(t.pos);
      _v.y = 0;
      const d = Math.max(_v.length(), 0.01);
      _v.divideScalar(d);
      const tangentX = -_v.z * this.strafeDir;
      const tangentZ = _v.x * this.strafeDir;
      this.waypoint.set(
        t.pos.x + _v.x * this.p.range + tangentX * this.p.strafe * 9,
        0,
        t.pos.z + _v.z * this.p.range + tangentZ * this.p.strafe * 9);
    } else if (this.mode === 'flee' && this.target && this.target.alive) {
      _v.copy(me.pos).sub(this.target.pos);
      _v.y = 0;
      _v.normalize();
      // run away, but bend toward the ring center so the murder doesn't get us
      const centerPull = clamp(myR / Math.max(state.zoneR, 1), 0, 1);
      this.waypoint.set(
        me.pos.x + _v.x * 18 * (1 - centerPull) - me.pos.x * centerPull * 0.6,
        0,
        me.pos.z + _v.z * 18 * (1 - centerPull) - me.pos.z * centerPull * 0.6);
    } else if (this.mode === 'collect' && this.pickup && this.pickup.alive) {
      this.waypoint.copy(this.pickup.pos);
    } else if (this.waypoint.distanceTo(me.pos) < 4) {
      this.newRoamPoint();
    }

    // murder override: get inside, fast
    if (myR > state.zoneR - 3) {
      this.waypoint.set(rand(-4, 4), 0, rand(-4, 4));
    }

    // desired direction + obstacle avoidance
    let dx = this.waypoint.x - me.pos.x;
    let dz = this.waypoint.z - me.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.5) {
      dx /= dist; dz /= dist;
      for (const o of obstacles) {
        const ox = o.x - me.pos.x;
        const oz = o.z - me.pos.z;
        const od = Math.hypot(ox, oz);
        const reach = o.r + 4.5;
        if (od < reach && (ox * dx + oz * dz) > 0) {
          // steer sideways around it, stronger when closer
          const k = (1 - od / reach) * 2.2;
          dx += (-oz / od) * k;
          dz += (ox / od) * k;
        }
      }
      const len = Math.hypot(dx, dz) || 1;
      me.moveInput.x = dx / len;
      me.moveInput.z = dz / len;
    } else {
      me.moveInput.x = 0;
      me.moveInput.z = 0;
    }
  }

  // ---- aiming + trigger, every frame ----

  aim(dt) {
    const me = this.tank;
    const t = this.target;
    if (!t || !t.alive) {
      me.wantFire = false;
      // rest the turret toward travel direction
      _v.set(me.pos.x + me.moveInput.x * 10, 1, me.pos.z + me.moveInput.z * 10);
      me.aimPoint.lerp(_v, 0.05);
      return;
    }

    const d = t.pos.distanceTo(me.pos);
    leadAim(_v, me.pos, t);

    // personality wobble: slow sine drift + per-decision jitter
    const err = Math.sin(state.time * 1.3 + this.errSeed) * this.p.accuracy * 2.2
      + this.aimJitter;
    if (Math.random() < dt * 2) this.aimJitter = rand(-1.4, 1.4) * this.p.accuracy;
    const ex = _v.x - me.pos.x;
    const ez = _v.z - me.pos.z;
    const cos = Math.cos(err), sin = Math.sin(err);
    me.aimPoint.set(
      me.pos.x + ex * cos - ez * sin,
      1.0,
      me.pos.z + ex * sin + ez * cos);

    // fire if in range, aligned, and line of sight is clear
    const inRange = d < this.p.range * 1.35 + 4;
    let aligned = false;
    if (inRange) {
      const wantYaw = Math.atan2(-(me.aimPoint.x - me.pos.x), -(me.aimPoint.z - me.pos.z));
      let diff = wantYaw - me.turretYaw;
      diff = ((diff + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      aligned = Math.abs(diff) < 0.14;
    }
    me.wantFire = inRange && aligned && losClear(me.pos, t.pos) && this.mode !== 'collect';
  }
}
