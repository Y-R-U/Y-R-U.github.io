// ============================================================
// world.js - Dungeon room generation, tile rendering
// ============================================================

import { TILE, TILE_SIZE, ROOM_W, ROOM_H } from './config.js';

export class DungeonRoom {
  constructor() {
    this.tiles = [];
    this.width = ROOM_W;
    this.height = ROOM_H;
    this.spawnPoints = [];
    this.fishingSpots = [];
    this.campfirePos = null;
    this.groundItems = []; // items on the ground
    this.generate();
  }

  generate() {
    // Initialize all floor
    this.tiles = [];
    for (let y = 0; y < this.height; y++) {
      this.tiles[y] = [];
      for (let x = 0; x < this.width; x++) {
        this.tiles[y][x] = TILE.FLOOR;
      }
    }

    // Walls around edges
    for (let x = 0; x < this.width; x++) {
      this.tiles[0][x] = TILE.WALL;
      this.tiles[this.height - 1][x] = TILE.WALL;
    }
    for (let y = 0; y < this.height; y++) {
      this.tiles[y][0] = TILE.WALL;
      this.tiles[y][this.width - 1] = TILE.WALL;
    }

    // Random internal pillars/walls
    const numPillars = 3 + Math.floor(Math.random() * 5);
    for (let i = 0; i < numPillars; i++) {
      const px = 3 + Math.floor(Math.random() * (this.width - 6));
      const py = 3 + Math.floor(Math.random() * (this.height - 6));
      this.tiles[py][px] = TILE.PILLAR;
    }

    // Random rubble
    const numRubble = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < numRubble; i++) {
      const rx = 2 + Math.floor(Math.random() * (this.width - 4));
      const ry = 2 + Math.floor(Math.random() * (this.height - 4));
      if (this.tiles[ry][rx] === TILE.FLOOR) {
        this.tiles[ry][rx] = TILE.RUBBLE;
      }
    }

    // Water area (for fishing) - place a 2x2 or 3x2 water pool
    const waterX = 2 + Math.floor(Math.random() * (this.width - 7));
    const waterY = 2 + Math.floor(Math.random() * (this.height - 6));
    const waterW = 2 + Math.floor(Math.random() * 2);
    const waterH = 2;
    for (let y = waterY; y < waterY + waterH; y++) {
      for (let x = waterX; x < waterX + waterW; x++) {
        this.tiles[y][x] = TILE.WATER;
      }
    }

    // Fishing spots (tiles adjacent to water that are floor)
    this.fishingSpots = [];
    for (let y = waterY - 1; y <= waterY + waterH; y++) {
      for (let x = waterX - 1; x <= waterX + waterW; x++) {
        if (y >= 0 && y < this.height && x >= 0 && x < this.width) {
          if (this.tiles[y][x] === TILE.FLOOR) {
            // Check if adjacent to water
            const adj = this._adjacentTo(x, y, TILE.WATER);
            if (adj) {
              this.fishingSpots.push({ x, y });
            }
          }
        }
      }
    }
    // Mark one fishing spot tile
    if (this.fishingSpots.length > 0) {
      const spot = this.fishingSpots[0];
      this.tiles[spot.y][spot.x] = TILE.FISHING_SPOT;
    }

    // Campfire - place in a clear area away from water
    let campPlaced = false;
    for (let attempts = 0; attempts < 50 && !campPlaced; attempts++) {
      const cx = 2 + Math.floor(Math.random() * (this.width - 4));
      const cy = 2 + Math.floor(Math.random() * (this.height - 4));
      if (this.tiles[cy][cx] === TILE.FLOOR) {
        const dist = Math.abs(cx - waterX) + Math.abs(cy - waterY);
        if (dist > 5) {
          this.tiles[cy][cx] = TILE.CAMPFIRE;
          this.campfirePos = { x: cx, y: cy };
          campPlaced = true;
        }
      }
    }
    if (!campPlaced) {
      // Force place
      for (let y = 2; y < this.height - 2; y++) {
        for (let x = 2; x < this.width - 2; x++) {
          if (this.tiles[y][x] === TILE.FLOOR && !campPlaced) {
            this.tiles[y][x] = TILE.CAMPFIRE;
            this.campfirePos = { x, y };
            campPlaced = true;
          }
        }
      }
    }

    // Generate monster spawn points (open floor tiles away from player start)
    this.spawnPoints = [];
    for (let y = 2; y < this.height - 2; y++) {
      for (let x = Math.floor(this.width / 2); x < this.width - 2; x++) {
        if (this.tiles[y][x] === TILE.FLOOR) {
          this.spawnPoints.push({ x, y });
        }
      }
    }

    // Ground items list
    this.groundItems = [];
  }

  _adjacentTo(x, y, tileType) {
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
        if (this.tiles[ny][nx] === tileType) return true;
      }
    }
    return false;
  }

  isWalkable(tileX, tileY) {
    if (tileX < 0 || tileX >= this.width || tileY < 0 || tileY >= this.height) return false;
    const t = this.tiles[tileY][tileX];
    return t !== TILE.WALL && t !== TILE.WATER && t !== TILE.PILLAR;
  }

  getTileAt(worldX, worldY) {
    const tx = Math.floor(worldX / TILE_SIZE);
    const ty = Math.floor(worldY / TILE_SIZE);
    if (tx < 0 || tx >= this.width || ty < 0 || ty >= this.height) return TILE.WALL;
    return this.tiles[ty][tx];
  }

  // Get the player start position (bottom-left area)
  getPlayerStart() {
    for (let y = this.height - 3; y >= 2; y--) {
      for (let x = 2; x < 6; x++) {
        if (this.tiles[y][x] === TILE.FLOOR) {
          return { x: x * TILE_SIZE, y: y * TILE_SIZE };
        }
      }
    }
    return { x: 3 * TILE_SIZE, y: (this.height - 3) * TILE_SIZE };
  }

  addGroundItem(itemId, worldX, worldY) {
    this.groundItems.push({
      id: itemId,
      x: worldX,
      y: worldY,
      spawnTime: Date.now(),
    });
  }

  pickupGroundItem(worldX, worldY, range = TILE_SIZE * 1.5) {
    for (let i = 0; i < this.groundItems.length; i++) {
      const item = this.groundItems[i];
      const dx = item.x - worldX;
      const dy = item.y - worldY;
      if (Math.sqrt(dx * dx + dy * dy) < range) {
        this.groundItems.splice(i, 1);
        return item.id;
      }
    }
    return null;
  }

  getGroundItemAt(worldX, worldY, range = TILE_SIZE * 1.5) {
    for (const item of this.groundItems) {
      const dx = item.x - worldX;
      const dy = item.y - worldY;
      if (Math.sqrt(dx * dx + dy * dy) < range) {
        return item;
      }
    }
    return null;
  }
}
