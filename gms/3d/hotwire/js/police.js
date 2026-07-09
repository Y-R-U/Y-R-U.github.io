// Wanted heat 0–5★ and the police response: cruisers that chase & ram,
// roadblocks at 3★, SWAT trucks with mounted shooters at 4★, and the
// helicopter at 5★. Heat decays once you stay out of trouble (never in
// endless mode). Killing cops feeds the fire.

import * as THREE from 'three';
import { CFG } from './config.js';
import { clamp, rand, angDiff } from './utils.js';
import { model } from './assets.js';
import * as fx from './fx.js';
import * as audio from './audio.js';

export class Police {
  constructor(scene, world, vehicles, weapons, actors, getPlayer) {
    this.scene = scene; this.world = world; this.vehicles = vehicles;
    this.weapons = weapons; this.actors = actors; this.getPlayer = getPlayer;
    this.heat = 0;                 // 0..500 points; stars = ceil(heat/100)
    this.calmT = 0;
    this.cars = [];
    this.footCops = [];
    this.heli = null;
    this.endless = false;
    this.disabled = false;         // story scenes can pause the law
    this.roadblockCd = 0;
    this.spawnCd = 0;
    this.onStarsChange = null;
    this._stars = 0;
  }

  get stars() { return clamp(Math.ceil(this.heat / 100), 0, CFG.heat.starCap); }

  crime(points) {
    if (this.disabled) return;
    this.heat = clamp(this.heat + points, 0, CFG.heat.starCap * 100 + 60);
    this.calmT = 0;
  }

  clearHeat() {
    this.heat = 0;
    for (const c of [...this.cars]) this._despawnCar(c);
    this.actors.clearKind(['cop', 'swat']);
    this._syncHeli(0);
  }

  _despawnCar(v) {
    this.vehicles.remove(v);
    const i = this.cars.indexOf(v);
    if (i >= 0) this.cars.splice(i, 1);
  }

  // spawn a cruiser/SWAT off-screen on a road near the player
  async _spawnCar(kind) {
    const pl = this.getPlayer();
    for (let tries = 0; tries < 14; tries++) {
      const ang = rand(0, Math.PI * 2), d = rand(55, 85);
      const x = pl.x + Math.sin(ang) * d, z = pl.z + Math.cos(ang) * d;
      const lv = this.world.level;
      if (x < 4 || z < 4 || x > lv.w * lv.tile - 4 || z > lv.h * lv.tile - 4) continue;
      if (!this.world.isRoad(x, z)) continue;
      const v = await this.vehicles.spawn(kind === 'swat' ? 'military' : 'police', x, z,
        Math.atan2(pl.x - x, pl.z - z), { locked: true, hpMul: kind === 'swat' ? 1 : 0.85 });
      v.roleTag = 'police';
      v.driver = 'ai';
      v.copKind = kind;
      v.fireCd = rand(0.5, 1.5);
      this.cars.push(v);
      return;
    }
  }

  async _syncHeli(want) {
    if (want && !this.heli) {
      const g = await model('heli', { ownMaterial: true });
      g.scale.setScalar(1.1);
      this.scene.add(g);
      // spotlight cone
      const spot = new THREE.SpotLight(0xfff2c8, 900, 60, 0.32, 0.5);
      g.add(spot);
      spot.position.set(0, -0.5, 0);
      const tgt = new THREE.Object3D();
      g.add(tgt); tgt.position.set(0, -20, 0);
      spot.target = tgt;
      this.heli = { g, x: 0, z: 0, y: 26, ang: 0, fireCd: 1, hp: 300 };
    } else if (!want && this.heli) {
      this.scene.remove(this.heli.g);
      this.heli = null;
      audio.rotor(false);
    }
  }

  tick(dt) {
    const pl = this.getPlayer();
    if (this.disabled) { audio.siren(false); return; }

    // endless mode pressure-cooker
    if (this.endless) this.heat += CFG.heat.endlessRamp * dt;

    // decay
    this.calmT += dt;
    if (!this.endless && this.calmT > CFG.heat.decayDelay && this.heat > 0) {
      let near = false;
      for (const c of this.cars) {
        if ((c.x - pl.x) ** 2 + (c.z - pl.z) ** 2 < 45 * 45 && !c.dead) { near = true; break; }
      }
      if (!near) this.heat = Math.max(0, this.heat - CFG.heat.decayRate * dt);
    }

    const stars = this.stars;
    if (stars !== this._stars) { this._stars = stars; this.onStarsChange?.(stars); }
    audio.siren(stars > 0 && this.cars.length > 0, stars);

    // population control
    this.spawnCd -= dt;
    const wantCars = CFG.heat.cops[stars] || 0;
    const liveCars = this.cars.filter(c => !c.dead).length;
    if (liveCars < wantCars && this.spawnCd <= 0) {
      this.spawnCd = 1.6;
      const swat = stars >= CFG.heat.swatAt && Math.random() < 0.4;
      this._spawnCar(swat ? 'swat' : 'cruiser');
    }
    // cull far/dead
    for (const c of [...this.cars]) {
      const d2 = (c.x - pl.x) ** 2 + (c.z - pl.z) ** 2;
      if (c.dead && d2 > 70 * 70) this._despawnCar(c);
      else if (!c.dead && d2 > 140 * 140) this._despawnCar(c);
    }

    // helicopter
    this._syncHeli(stars >= CFG.heat.heliAt ? 1 : 0);
    if (this.heli) {
      const h = this.heli;
      h.ang += dt * 0.5;
      const tx = pl.x + Math.sin(h.ang) * 14, tz = pl.z + Math.cos(h.ang) * 14;
      h.x += (tx - h.x) * (1 - Math.exp(-1.4 * dt));
      h.z += (tz - h.z) * (1 - Math.exp(-1.4 * dt));
      h.g.position.set(h.x, h.y + Math.sin(h.ang * 3) * 1.2, h.z);
      h.g.rotation.y = Math.atan2(pl.x - h.x, pl.z - h.z);
      h.g.rotation.z = Math.sin(h.ang * 2) * 0.06;
      audio.rotor(true, clamp(1 - Math.hypot(h.x - pl.x, h.z - pl.z) / 60, 0.2, 1));
      h.fireCd -= dt;
      if (h.fireCd <= 0 && pl.alive) {
        h.fireCd = 0.13;
        const yaw = Math.atan2(pl.x - h.x, pl.z - h.z) + rand(-0.1, 0.1);
        const dist = Math.hypot(pl.x - h.x, pl.z - h.z);
        // strafing fire: tracer down at the player, damage on proximity
        const hitX = h.x + Math.sin(yaw) * dist * rand(0.85, 1.1);
        const hitZ = h.z + Math.cos(yaw) * dist * rand(0.85, 1.1);
        fx.tracer(new THREE.Vector3(h.x, h.y, h.z), new THREE.Vector3(hitX, 0.2, hitZ), 0xffd76a);
        fx.sparks(new THREE.Vector3(hitX, 0.3, hitZ), 2, 0xffd76a);
        if (Math.random() < 0.4) audio.gunshot('smg');
        const offP = Math.hypot(hitX - pl.x, hitZ - pl.z);
        if (offP < 1.6) {
          if (pl.mode === 'car') this.vehicles.damage(pl.car, 4, 'cop');
          else pl.damage(5);
        }
      }
    }

    // roadblocks
    this.roadblockCd -= dt;
    if (stars >= CFG.heat.roadblockAt && this.roadblockCd <= 0 && pl.mode === 'car' && Math.abs(pl.car.speed) > 8) {
      this.roadblockCd = 11;
      this._roadblock(pl);
    }

    // drive the cruisers
    for (const c of this.cars) {
      if (c.dead) continue;
      const chase = this.vehicles.aiInput(c, pl.x, pl.z, 1);
      const top = CFG.heat.copTop[stars] || 15;
      c.upg = { topMul: top / c.def.top, accMul: 1, gripMul: 1, armorMul: 1 };  // heat-scaled pursuit speed
      if (pl.mode === 'foot' && chase.dist < 10) {
        // box the player in, lean out and shoot
        this.vehicles.step(c, dt, { x: 0, z: 0, mag: 0 });
        c.fireCd -= dt;
        if (stars >= 2 && c.fireCd <= 0 && !this.world.blocked(c.x, c.z, pl.x, pl.z)) {
          c.fireCd = c.copKind === 'swat' ? 0.35 : 1.1;
          const yaw = Math.atan2(pl.x - c.x, pl.z - c.z) + rand(-0.05, 0.05);
          this.weapons.fire(c.x + Math.sin(yaw) * 1.4, 1.2, c.z + Math.cos(yaw) * 1.4, yaw,
            c.copKind === 'swat' ? 'smg' : 'pistol', 'cop');
        }
      } else {
        this.vehicles.step(c, dt, chase);
        // SWAT gunner fires on the move
        if (c.copKind === 'swat' && stars >= CFG.heat.swatAt) {
          c.fireCd -= dt;
          if (c.fireCd <= 0 && chase.dist < 34 && !this.world.blocked(c.x, c.z, pl.x, pl.z)) {
            c.fireCd = 0.5;
            const yaw = Math.atan2(pl.x - c.x, pl.z - c.z) + rand(-0.07, 0.07);
            this.weapons.fire(c.x + Math.sin(yaw) * 2, 1.8, c.z + Math.cos(yaw) * 2, yaw, 'mg', 'cop');
          }
        }
      }
    }
  }

  async _roadblock(pl) {
    // place two cruisers + cones across the road ~55m ahead of travel
    const v = pl.car;
    const ax = pl.x + Math.sin(v.yaw) * 55, az = pl.z + Math.cos(v.yaw) * 55;
    if (!this.world.isRoad(ax, az)) return;
    const perp = v.yaw + Math.PI / 2;
    for (const off of [-3.2, 3.2]) {
      const x = ax + Math.sin(perp) * off, z = az + Math.cos(perp) * off;
      const c = await this.vehicles.spawn('police', x, z, perp, { locked: true, hpMul: 0.8 });
      c.roleTag = 'police'; c.driver = 'ai'; c.copKind = 'block'; c.fireCd = 1;
      this.cars.push(c);
    }
  }

  damageHeli(dmg) {
    if (!this.heli) return;
    this.heli.hp -= dmg;
    if (this.heli.hp <= 0) {
      fx.explosion(this.heli.x, this.heli.y, this.heli.z, 8);
      audio.explosion(true);
      this._syncHeli(0);
      this.crime(80);
    }
  }
}
