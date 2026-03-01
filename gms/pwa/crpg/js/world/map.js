// ===== World Map Generator =====
import { WORLD_W, WORLD_H, TILES, TOWNS, DUNGEONS, TILE_WALKABLE } from '../config.js';

export class WorldMap {
  constructor(seed) {
    this.width  = WORLD_W;
    this.height = WORLD_H;
    this.seed   = seed;
    this.data   = new Uint8Array(WORLD_W * WORLD_H);
    this._generate();
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

  _generate() {
    let rng = this._seedRng(this.seed);

    // 1. Base: grass
    this.data.fill(TILES.GRASS);

    // 2. Noise-based forest patches in dark forest (top-left quadrant)
    for (let y = 2; y < 35; y++) {
      for (let x = 2; x < 30; x++) {
        if (this._noise(x, y, rng) > 0.45) this.set(x, y, TILES.TREE);
      }
    }

    // 3. Haunted moor (sparse grass, some stone)
    for (let y = 5; y < 38; y++) {
      for (let x = 32; x < 58; x++) {
        const n = this._noise(x + 100, y + 100, rng);
        if (n > 0.65) this.set(x, y, TILES.STONE);
      }
    }

    // 4. Mountain pass (top-right)
    for (let y = 2; y < 30; y++) {
      for (let x = 56; x < 78; x++) {
        const n = this._noise(x + 200, y + 200, rng);
        if (n > 0.4) this.set(x, y, TILES.MOUNTAIN);
        else if (n > 0.3) this.set(x, y, TILES.STONE);
      }
    }

    // 5. Ice wastes (right side)
    for (let y = 28; y < 58; y++) {
      for (let x = 58; x < 78; x++) {
        const n = this._noise(x + 300, y + 300, rng);
        if (n > 0.3) this.set(x, y, TILES.STONE);
      }
    }

    // 6. Coastal water (bottom-left)
    for (let y = 58; y < 78; y++) {
      for (let x = 2; x < 18; x++) {
        const n = this._noise(x + 400, y + 400, rng);
        if (n > 0.35 || x < 5 + Math.sin(y * 0.5) * 3) this.set(x, y, TILES.WATER);
      }
    }

    // 7. Rivers — stop river 6 tiles north of Ashvale (20,40) to avoid blocking spawn
    this._drawRiver(20, 0, 20, 34, rng);
    this._drawRiver(40, 78, 55, 40, rng);

    // 8. Roads between towns
    this._drawRoad(20, 40, 55, 25);
    this._drawRoad(20, 40, 20, 65);
    this._drawRoad(55, 25, 65, 28);

    // 9. Towns — clear patches and add buildings
    this._buildTown(20, 40, 'Ashvale');
    this._buildTown(55, 25, 'Cresthold');
    this._buildTown(20, 65, 'Ironport');

    // 10. Dungeon entrances
    for (const d of Object.values(DUNGEONS)) {
      this.set(d.entrance.wx, d.entrance.wy, TILES.DUNGEON);
    }

    // 10b. Carve a road corridor to Dragon Lair — sits inside impassable ice-wastes stone
    // Connect (72,55) south to open grass at y=59 so pathfinder can route in from below
    for (let cy = 56; cy <= 59; cy++) {
      if (this.get(72, cy) !== TILES.WATER) this.set(72, cy, TILES.ROAD);
    }

    // 11. Goblin plains (middle-bottom)
    for (let y = 45; y < 72; y++) {
      for (let x = 28; x < 60; x++) {
        const t = this.get(x, y);
        if (t === TILES.GRASS && this._noise(x + 500, y + 500, rng) > 0.8) {
          this.set(x, y, TILES.STONE);
        }
      }
    }
  }

  _drawRiver(x0, y0, x1, y1, rng) {
    let x = x0, y = y0;
    const dx = Math.sign(x1 - x0);
    const dy = Math.sign(y1 - y0);
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i < steps; i++) {
      this.set(x, y, TILES.WATER);
      if (Math.abs(x - x1) > Math.abs(y - y1)) x += dx;
      else y += dy;
      if (this._rand(rng) > 0.7) {
        // slight meander
        if (Math.abs(x - x1) > 0) x += dx;
        else y += dy;
      }
    }
  }

  _drawRoad(x0, y0, x1, y1) {
    let x = x0, y = y0;
    while (x !== x1 || y !== y1) {
      const t = this.get(x, y);
      if (t !== TILES.WATER) this.set(x, y, TILES.ROAD);
      if (Math.abs(x - x1) > Math.abs(y - y1)) x += Math.sign(x1 - x);
      else y += Math.sign(y1 - y);
    }
  }

  _buildTown(cx, cy, name) {
    const r = 6;
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (this.get(x, y) !== TILES.WATER) this.set(x, y, TILES.ROAD);
      }
    }
    // Simple building glyphs (3×2 blocks)
    const buildings = [
      [cx - 4, cy - 3], [cx + 2, cy - 3],
      [cx - 4, cy + 1], [cx + 2, cy + 1],
    ];
    for (const [bx, by] of buildings) {
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 3; dx++) {
          this.set(bx + dx, by + dy, TILES.BUILDING);
        }
      }
      // Door
      this.set(bx + 1, by + 2, TILES.DOOR);
    }
    // Force-clear the walkable core around the town centre (overrides any water)
    for (let y = cy - 2; y <= cy + 2; y++) {
      for (let x = cx - 2; x <= cx + 2; x++) {
        const t = this.get(x, y);
        if (t !== TILES.BUILDING && t !== TILES.DOOR) this.set(x, y, TILES.ROAD);
      }
    }
  }

  // ===== Simple deterministic pseudo-random =====
  _seedRng(seed) {
    return { s: seed | 0 };
  }
  _rand(rng) {
    rng.s = (rng.s * 1664525 + 1013904223) & 0xFFFFFFFF;
    return ((rng.s >>> 0) / 0xFFFFFFFF);
  }
  _noise(x, y, rng) {
    // Simple value noise — deterministic based on seed
    const ix = Math.floor(x), iy = Math.floor(y);
    const h = (ix * 73856093 ^ iy * 19349663 ^ this.seed * 83492791) & 0xFFFFFF;
    return (h / 0xFFFFFF);
  }
}
