// ===== Enemy Spawner =====
import { SPAWN_ZONES, ENEMIES, TOWNS, TOWN_SAFE_RADIUS, ENEMY_RESPAWN_S } from '../config.js';
import { Enemy } from '../entities/enemy.js';

export class Spawner {
  constructor() {
    this.enemies = [];
    this.timers = {};
    // Init timers for each zone
    for (const zone of SPAWN_ZONES) {
      this.timers[zone.id] = { last: 0, target: 3 + Math.floor(Math.random() * 3) };
    }
  }

  update(nowMs, maxPerZone = 4) {
    for (const zone of SPAWN_ZONES) {
      const t = this.timers[zone.id];
      const countInZone = this.enemies.filter(e => !e.dead && e.zone === zone.id).length;
      if (countInZone < maxPerZone && nowMs - t.last > ENEMY_RESPAWN_S * 1000) {
        this._spawnInZone(zone);
        t.last = nowMs;
      }
    }
    // Remove dead enemies after a delay
    this.enemies = this.enemies.filter(e => !e.dead || !e.deathTime || nowMs - e.deathTime < 3000);
  }

  _spawnInZone(zone) {
    const [x0,y0,x1,y1] = zone.rect;
    let tries = 0;
    while (tries < 20) {
      const tx = x0 + Math.random() * (x1 - x0);
      const ty = y0 + Math.random() * (y1 - y0);
      if (!this._inTown(tx, ty)) {
        const typeId = zone.enemies[Math.floor(Math.random() * zone.enemies.length)];
        const e = new Enemy(typeId, tx, ty);
        e.zone = zone.id;
        e.spawnX = tx;
        e.spawnY = ty;
        this.enemies.push(e);
        return;
      }
      tries++;
    }
  }

  _inTown(tx, ty) {
    for (const town of Object.values(TOWNS)) {
      const dx = tx - town.cx;
      const dy = ty - town.cy;
      if (Math.sqrt(dx*dx + dy*dy) < TOWN_SAFE_RADIUS) return true;
    }
    return false;
  }

  getEnemies() { return this.enemies; }
}
