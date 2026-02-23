// ===== Dungeon Room Generator =====
import { TILES, TILE_WALKABLE, DUNGEONS, ENEMIES } from '../config.js';

export class DungeonMap {
  constructor(dungeonId) {
    this.dungeonId = dungeonId;
    const cfg = DUNGEONS[dungeonId];
    this.width  = cfg.w;
    this.height = cfg.h;
    this.data = new Uint8Array(cfg.w * cfg.h);
    this.enemySpawns = [];
    this.playerStart = { x: cfg.w / 2, y: cfg.h - 2 };
    this.exitTile = { x: Math.floor(cfg.w / 2), y: 1 };
    this.exitLocked = true;
    this._generate(cfg);
  }

  get(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return TILES.WALL;
    return this.data[y * this.width + x];
  }

  set(x, y, t) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.data[y * this.width + x] = t;
  }

  isWalkable(x, y) {
    return TILE_WALKABLE[this.get(Math.floor(x), Math.floor(y))] === true;
  }

  unlockExit() {
    this.exitLocked = false;
    this.set(this.exitTile.x, this.exitTile.y, TILES.EXIT);
  }

  _generate(cfg) {
    // Fill with walls
    this.data.fill(TILES.WALL);

    // Carve out room interior (1-tile border of walls)
    for (let y = 2; y < this.height - 2; y++) {
      for (let x = 1; x < this.width - 1; x++) {
        this.set(x, y, TILES.FLOOR);
      }
    }

    // Pillar obstacles for variety
    const pillars = [
      [4,4],[7,4],[11,4],[15,4],
      [4,8],[7,8],[11,8],[15,8],
      [4,11],[7,11],[11,11],[15,11],
    ];
    for (const [px,py] of pillars) {
      if (px < this.width - 2 && py < this.height - 2) {
        this.set(px, py, TILES.WALL);
      }
    }

    // Exit tile (locked, shown as wall until boss dead)
    this.set(this.exitTile.x, this.exitTile.y, TILES.WALL);

    // Player entry marker (bottom center)
    this.set(this.playerStart.x, this.playerStart.y, TILES.FLOOR);

    // Enemy spawn positions — random floor tiles (avoiding edges and player start)
    const [minE, maxE] = cfg.enemyCount;
    const count = minE + Math.floor(Math.random() * (maxE - minE + 1));
    const used = new Set();
    const key = (x, y) => `${x},${y}`;

    for (let i = 0; i < count && i < 50; i++) {
      let tries = 0;
      while (tries < 20) {
        const ex = 2 + Math.floor(Math.random() * (this.width  - 4));
        const ey = 3 + Math.floor(Math.random() * (this.height - 6));
        const k = key(ex, ey);
        if (this.get(ex, ey) === TILES.FLOOR && !used.has(k) &&
            !(Math.abs(ex - this.playerStart.x) < 3 && Math.abs(ey - this.playerStart.y) < 3)) {
          used.add(k);
          const enemyType = cfg.enemies[Math.floor(Math.random() * cfg.enemies.length)];
          this.enemySpawns.push({ x: ex, y: ey, type: enemyType });
          break;
        }
        tries++;
      }
    }
  }
}

// ===== Dungeon State =====
export class DungeonState {
  constructor(dungeonId) {
    this.dungeonId = dungeonId;
    const cfg = DUNGEONS[dungeonId];
    this.cfg = cfg;
    this.map = new DungeonMap(dungeonId);
    this.enemies = [];
    this.boss = null;
    this.bossSpawned = false;
    this.cleared = false;
    this.playerX = this.map.playerStart.x + 0.5;
    this.playerY = this.map.playerStart.y + 0.5;
    this.cooldownUntil = 0;
  }

  spawnEnemies(EnemyClass) {
    this.enemies = [];
    for (const sp of this.map.enemySpawns) {
      const enemyDef = ENEMIES[sp.type];
      if (!enemyDef) continue;
      const e = new EnemyClass(sp.type, sp.x + 0.5, sp.y + 0.5);
      this.enemies.push(e);
    }
  }

  checkBossSpawn(EnemyClass) {
    if (this.bossSpawned) return false;
    const allDead = this.enemies.length > 0 &&
      this.enemies.every(e => e.dead || e.hp <= 0);
    if (allDead) {
      this.bossSpawned = true;
      const mid = Math.floor(this.map.width / 2);
      const bossType = this.cfg.boss;
      this.boss = new EnemyClass(bossType, mid + 0.5, 4.5);
      this.boss.boss = true;
      this.enemies.push(this.boss);
      return true;
    }
    return false;
  }

  checkCleared() {
    if (this.cleared) return false;
    if (this.bossSpawned && this.boss && (this.boss.dead || this.boss.hp <= 0)) {
      this.cleared = true;
      this.map.unlockExit();
      return true;
    }
    return false;
  }
}
