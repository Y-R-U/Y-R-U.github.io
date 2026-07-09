// Ambient life: civilian cars cruising the road grid + pedestrians on the
// pavements. Cars follow road tiles (prefer straight, turn at junctions),
// brake for obstacles, and panic-flee when rammed. Peds wander/flee via
// actors.js. Also hosts the gang hostility layer (drive-bys when the
// Serpents hate you).

import { CFG } from './config.js';
import { rand, pick, clamp } from './utils.js';

const CIV_TYPES = ['sedan', 'sedan', 'taxi', 'pickup', 'hippie', 'van'];

export class Traffic {
  constructor(world, vehicles, actors, getPlayer) {
    this.world = world; this.vehicles = vehicles; this.actors = actors;
    this.getPlayer = getPlayer;
    this.cars = [];
    this.peds = [];
    this.gangCars = [];
    this.gangHostile = false;
    this.spawnCd = 0;
    this.pedCd = 0;
    this.gangCd = 4;
    this.enabled = true;
  }

  _roadTileNear(px, pz, rMin, rMax) {
    const lv = this.world.level;
    for (let tries = 0; tries < 16; tries++) {
      const ang = rand(0, Math.PI * 2), d = rand(rMin, rMax);
      const x = px + Math.sin(ang) * d, z = pz + Math.cos(ang) * d;
      if (x < 6 || z < 6 || x > lv.w * lv.tile - 6 || z > lv.h * lv.tile - 6) continue;
      if (this.world.terrainAt(x, z) === 'r') return { x, z };
      if (tries > 11 && this.world.terrainAt(x, z) === 'p') return { x, z };
    }
    return null;
  }

  async tick(dt) {
    if (!this.enabled) return;
    const pl = this.getPlayer();
    const lv = this.world.level;

    // ── civilian cars ──
    this.spawnCd -= dt;
    const liveCars = this.cars.filter(c => !c.dead).length;
    if (liveCars < CFG.traffic.count && this.spawnCd <= 0) {
      this.spawnCd = 0.8;
      const spot = this._roadTileNear(pl.x, pl.z, CFG.traffic.spawnR[0], CFG.traffic.spawnR[1]);
      if (spot) {
        const dirs = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
        const v = await this.vehicles.spawn(pick(CIV_TYPES), spot.x, spot.z, pick(dirs), { locked: false, hpMul: 0.9 });
        v.roleTag = 'traffic';
        v.driver = 'ai';
        v.panic = 0;
        this.cars.push(v);
      }
    }
    for (const c of [...this.cars]) {
      const d2 = (c.x - pl.x) ** 2 + (c.z - pl.z) ** 2;
      if (d2 > CFG.traffic.despawnR ** 2 || c.dead && d2 > 60 * 60) {
        this.vehicles.remove(c);
        this.cars.splice(this.cars.indexOf(c), 1);
        continue;
      }
      if (c.dead) continue;
      if (c.driver !== 'ai') { this.cars.splice(this.cars.indexOf(c), 1); continue; }  // player stole it
      this._driveCiv(c, dt, pl);
    }

    // ── peds ──
    this.pedCd -= dt;
    const livePeds = this.actors.list.filter(a => a.kind === 'ped' && a.alive).length;
    if (livePeds < CFG.ped.count && this.pedCd <= 0) {
      this.pedCd = 0.7;
      const lvW = lv.w * lv.tile;
      for (let tries = 0; tries < 12; tries++) {
        const ang = rand(0, Math.PI * 2), d = rand(30, 70);
        const x = pl.x + Math.sin(ang) * d, z = pl.z + Math.cos(ang) * d;
        if (x < 4 || z < 4 || x > lvW - 4 || z > lv.h * lv.tile - 4) continue;
        const t = this.world.terrainAt(x, z);
        if (t === 'p' || t === 'g') {
          const res = this.world.collide(x, z, 0.5);
          if (!res.hit) { this.actors.spawn('ped', x, z); break; }
        }
      }
    }
    // cull far peds
    for (const a of [...this.actors.list]) {
      if (a.kind !== 'ped') continue;
      if ((a.x - pl.x) ** 2 + (a.z - pl.z) ** 2 > 95 * 95) this.actors.remove(a);
    }

    // ── gang drive-bys when hostile ──
    if (this.gangHostile) {
      this.gangCd -= dt;
      const liveGang = this.gangCars.filter(c => !c.dead).length;
      if (liveGang < 2 && this.gangCd <= 0) {
        this.gangCd = 6;
        const spot = this._roadTileNear(pl.x, pl.z, 50, 80);
        if (spot) {
          const v = await this.vehicles.spawn(pick(['van', 'pickup']), spot.x, spot.z, 0, { locked: true });
          v.roleTag = 'gang';
          v.driver = 'ai';
          v.fireCd = 1;
          this.gangCars.push(v);
        }
      }
      for (const g of [...this.gangCars]) {
        if (g.dead) {
          if ((g.x - pl.x) ** 2 + (g.z - pl.z) ** 2 > 70 * 70) {
            this.vehicles.remove(g);
            this.gangCars.splice(this.gangCars.indexOf(g), 1);
          }
          continue;
        }
        // orbit the player and spray
        const ang = Math.atan2(g.x - pl.x, g.z - pl.z) + 0.55;
        const tx = pl.x + Math.sin(ang) * 13, tz = pl.z + Math.cos(ang) * 13;
        this.vehicles.step(g, dt, this.vehicles.aiInput(g, tx, tz, 0.9));
        g.fireCd -= dt;
        const dist = Math.hypot(g.x - pl.x, g.z - pl.z);
        if (g.fireCd <= 0 && dist < 26 && !this.world.blocked(g.x, g.z, pl.x, pl.z)) {
          g.fireCd = 0.4;
          const yaw = Math.atan2(pl.x - g.x, pl.z - g.z) + rand(-0.08, 0.08);
          this.vehicles.onGangFire?.(g, yaw);
        }
      }
    }
  }

  _driveCiv(c, dt, pl) {
    if (c.panic > 0) {
      c.panic -= dt;
      const away = Math.atan2(c.x - pl.x, c.z - pl.z);
      this.vehicles.step(c, dt, { x: Math.sin(away), z: Math.cos(away), mag: 1 });
      return;
    }
    // cruise: keep heading along the road; steer to stay on road tiles
    const speed = CFG.traffic.speed / c.def.top;
    const ahead = 7;
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
    const axc = c.x + fx * ahead, azc = c.z + fz * ahead;
    let dir = { x: fx, z: fz };
    if (!this.world.isRoad(axc, azc)) {
      // try gentle left/right, then hard turn
      const opts = [0.6, -0.6, 1.4, -1.4, Math.PI];
      let found = false;
      for (const o of opts) {
        const yy = c.yaw + o;
        if (this.world.isRoad(c.x + Math.sin(yy) * ahead, c.z + Math.cos(yy) * ahead)) {
          dir = { x: Math.sin(yy), z: Math.cos(yy) };
          found = true; break;
        }
      }
      if (!found) dir = { x: -fx, z: -fz };
    }
    // brake for the car/player ahead
    let mag = speed;
    const bx = c.x + fx * 6.5, bz = c.z + fz * 6.5;
    for (const o of this.vehicles.list) {
      if (o === c || o.dead) continue;
      if ((o.x - bx) ** 2 + (o.z - bz) ** 2 < 14) { mag = 0; break; }
    }
    // was I just rammed? panic!
    if (c.hp < c.maxHp * 0.92 && !c._rammedOnce) { c._rammedOnce = true; c.panic = 5; }
    this.vehicles.step(c, dt, { x: dir.x, z: dir.z, mag });
  }

  clear() {
    for (const c of [...this.cars, ...this.gangCars]) this.vehicles.remove(c);
    this.cars = []; this.gangCars = [];
    this.actors.clearKind(['ped']);
  }
}
