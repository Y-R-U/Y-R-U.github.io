// The drone. It is why you usually see them first: it orbits above your hull,
// paints every contact inside its uplink radius, and doubles as an outside
// camera. Fly it forward to scout ahead and you leave your tank sitting still —
// and the drone itself can be shot down.

import * as THREE from 'three';
import { DRONE } from './config.js';
import { clamp, clamp01, lerp, damp, rand } from './utils.js';
import { actorRoot } from './render.js';
import { buildDrone } from './tankFactory.js';
import { terrainHeight } from './terrain.js';
import { spawnSparks, spawnSmoke, spawnExplosion, spawnDebris, volAt } from './particles.js';
import { AudioFX } from './audio.js';
import { state } from './state.js';
import { emit } from './bus.js';

const _v = new THREE.Vector3();

export class Drone {
  constructor(owner, mul = 1, accent = 0x6ae4ff) {
    this.owner = owner;
    this.mul = mul;
    const built = buildDrone(accent);
    this.grp = built.grp;
    this.rotors = built.rotors;
    this.mesh = built.mesh;
    actorRoot.add(this.grp);

    this.alt = DRONE.baseAlt * (0.85 + 0.15 * mul);
    this.spotR = DRONE.baseSpotR * mul;
    this.hpMax = DRONE.baseHp * mul;
    this.hp = this.hpMax;
    this.pingEvery = DRONE.pingInterval / Math.max(0.6, mul);
    this.maxLeash = 78 * mul;

    this.mode = 'follow';         // follow | scout | down
    this.alive = true;
    this.orbit = 0;
    this.downTimer = 0;
    this.pingTimer = 1.2;
    this.vel = new THREE.Vector3();
    this.flyInput = new THREE.Vector2();
    this.marked = null;           // tank painted for a drone strike
    this.aaTimer = rand(2, 5);

    // Ground scan ring. Only drawn on the drone feed: a 62-unit ring passing
    // the chase camera is a glowing bar straight across the screen.
    const ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(accent).multiplyScalar(0.9), transparent: true,
      opacity: 0.3, side: THREE.DoubleSide, depthWrite: false, fog: false,
    });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.995, 1, 96), ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    actorRoot.add(this.ring);

    const pulseMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(accent).multiplyScalar(1.1), transparent: true,
      opacity: 0, side: THREE.DoubleSide, depthWrite: false, fog: false,
    });
    this.pulse = new THREE.Mesh(new THREE.RingGeometry(0.985, 1, 72), pulseMat);
    this.pulse.rotation.x = -Math.PI / 2;
    this.pulse.visible = false;
    actorRoot.add(this.pulse);
    this.pulseT = 0;

    this.reset();
  }

  reset() {
    const o = this.owner;
    this.grp.position.set(o.pos.x, terrainHeight(o.pos.x, o.pos.z) + this.alt, o.pos.z + 6);
    this.vel.set(0, 0, 0);
    this.hp = this.hpMax;
    this.alive = true;
    this.mode = 'follow';
    this.downTimer = 0;
    this.grp.visible = true;
    this.ring.visible = true;
    this.marked = null;
  }

  get pos() { return this.grp.position; }
  get hpFrac() { return clamp01(this.hp / this.hpMax); }
  get scouting() { return this.alive && this.mode === 'scout'; }

  distFromOwner() {
    return Math.hypot(this.pos.x - this.owner.pos.x, this.pos.z - this.owner.pos.z);
  }

  setMode(m) {
    if (!this.alive) return;
    if (m === this.mode) return;
    this.mode = m;
    emit('drone-mode', m);
  }

  update(dt) {
    if (!this.alive) {
      this.downTimer -= dt;
      if (this.downTimer <= 0) {
        this.reset();
        emit('drone-online');
        AudioFX.blip(1200, 0.12, 0.07);
      }
      return;
    }

    const o = this.owner;
    const targetAlt = terrainHeight(this.pos.x, this.pos.z) + this.alt;

    if (this.mode === 'scout') {
      // player-flown: leash to the tank so it cannot solo the map
      const sp = DRONE.flySpeed * (0.85 + this.mul * 0.2);
      this.vel.x = lerp(this.vel.x, this.flyInput.x * sp, damp(4, dt));
      this.vel.z = lerp(this.vel.z, this.flyInput.y * sp, damp(4, dt));
      const d = this.distFromOwner();
      if (d > this.maxLeash) {
        const kx = (o.pos.x - this.pos.x) / d, kz = (o.pos.z - this.pos.z) / d;
        this.vel.x += kx * 40 * dt;
        this.vel.z += kz * 40 * dt;
      }
    } else {
      // orbit above the hull
      this.orbit += DRONE.orbitSpeed * dt;
      const tx = o.pos.x + Math.cos(this.orbit) * DRONE.orbitR;
      const tz = o.pos.z + Math.sin(this.orbit) * DRONE.orbitR;
      this.vel.x = lerp(this.vel.x, (tx - this.pos.x) * 2.2, damp(5, dt));
      this.vel.z = lerp(this.vel.z, (tz - this.pos.z) * 2.2, damp(5, dt));
    }

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y = lerp(this.pos.y, targetAlt, damp(2.6, dt));

    // bank into the direction of travel, bob a little
    this.grp.rotation.z = lerp(this.grp.rotation.z, clamp(-this.vel.x * 0.02, -0.35, 0.35), damp(5, dt));
    this.grp.rotation.x = lerp(this.grp.rotation.x, clamp(this.vel.z * 0.02, -0.35, 0.35), damp(5, dt));
    this.grp.rotation.y = Math.atan2(-this.vel.x, -this.vel.z) || this.grp.rotation.y;
    for (let i = 0; i < this.rotors.length; i++) {
      this.rotors[i].rotation.z += (i % 2 ? 34 : -34) * dt;
    }

    // scan ring on the ground — drone feed only
    const onFeed = state.camMode === 'drone';
    this.ring.visible = onFeed;
    if (onFeed) {
      this.ring.position.set(this.pos.x, terrainHeight(this.pos.x, this.pos.z) + 0.25, this.pos.z);
      this.ring.scale.setScalar(this.spotR);
    }

    this.spot(dt);
    this.antiAir(dt);
    this.updatePulse(dt);
  }

  spot(dt) {
    this.pingTimer -= dt;
    const ping = this.pingTimer <= 0;
    if (ping) {
      this.pingTimer = this.pingEvery;
      this.firePulse();
    }
    let newContacts = 0;
    for (const t of state.tanks) {
      if (!t.alive || t.isPlayer) continue;
      const d = Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
      if (d > this.spotR) continue;
      if (t.smokeTimer > 0) continue;            // smoke defeats the optics
      const wasSpotted = t.spottedUntil > state.time;
      t.spottedUntil = state.time + DRONE.spotHold;
      t.spottedBy = 'drone';
      if (!wasSpotted && ping) newContacts++;
    }
    if (newContacts > 0) {
      emit('drone-contacts', newContacts);
      AudioFX.spotPing();
    }
  }

  firePulse() {
    this.pulseT = 0.85;
    this.pulse.position.set(this.pos.x, terrainHeight(this.pos.x, this.pos.z) + 0.3, this.pos.z);
  }

  updatePulse(dt) {
    this.pulse.visible = this.pulseT > 0 && state.camMode === 'drone';
    if (this.pulseT <= 0) return;
    this.pulseT -= dt;
    const k = 1 - clamp01(this.pulseT / 0.85);
    this.pulse.scale.setScalar(lerp(2, this.spotR, k));
    this.pulse.material.opacity = 0.34 * (1 - k);
    if (this.pulseT <= 0) this.pulse.visible = false;
  }

  // Enemies plink at the drone when it loiters within range of them.
  antiAir(dt) {
    this.aaTimer -= dt;
    if (this.aaTimer > 0) return;
    this.aaTimer = rand(1.6, 3.4);
    let shooter = null;
    let best = 1e9;
    for (const t of state.tanks) {
      if (!t.alive || t.isPlayer || t.empTimer > 0) continue;
      const d = t.pos.distanceTo(this.pos);
      if (d < 52 && d < best) { best = d; shooter = t; }
    }
    if (!shooter) return;
    // scouting overhead is riskier than orbiting your own hull
    const chance = this.mode === 'scout' ? 0.62 : 0.2;
    if (Math.random() > chance) return;
    spawnSparks(this.pos, 5, null, 0.8);
    AudioFX.gun('burst', volAt(shooter.pos) * 0.7);
    this.damage(rand(7, 14));
  }

  damage(n) {
    if (!this.alive) return;
    this.hp -= n;
    emit('drone-hit', { hp: this.hp, max: this.hpMax });
    if (this.hp <= 0) this.destroy();
  }

  destroy() {
    this.alive = false;
    this.mode = 'down';
    this.downTimer = DRONE.downTime;
    spawnExplosion(this.pos, { scale: 0.9, colour: 0x8ad4ff, craterR: 0, shake: false });
    spawnDebris(this.pos, 8, 0.8);
    for (let i = 0; i < 3; i++) {
      spawnSmoke(_v.copy(this.pos).add(new THREE.Vector3(rand(-1, 1), -i, rand(-1, 1))), {
        scale: 1.1, life: 1.8, colour: 0x4a4a4a, rise: -2, opacity: 0.5,
      });
    }
    this.grp.visible = false;
    this.ring.visible = false;
    this.pulse.visible = false;
    this.marked = null;
    if (state.camMode === 'drone') state.camMode = 'chase';
    emit('drone-down');
    AudioFX.dirge();
  }

  // Paint the nearest spotted enemy for a strike.
  mark() {
    let best = null, bd = 1e9;
    for (const t of state.tanks) {
      if (!t.alive || t.isPlayer) continue;
      const d = t.pos.distanceTo(this.pos);
      if (d < this.spotR && d < bd) { bd = d; best = t; }
    }
    this.marked = best;
    if (best) {
      best.markedUntil = state.time + 12;
      AudioFX.lock();
      emit('drone-marked', best);
    }
    return best;
  }

  dispose() {
    actorRoot.remove(this.grp);
    actorRoot.remove(this.ring);
    actorRoot.remove(this.pulse);
    this.ring.geometry.dispose();
    this.ring.material.dispose();
    this.pulse.geometry.dispose();
    this.pulse.material.dispose();
    this.mesh.geometry.dispose();
  }
}

export function isSpotted(tank) {
  return tank.spottedUntil > state.time;
}
