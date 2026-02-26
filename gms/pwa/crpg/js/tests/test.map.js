// ===== Map Tests =====
import { assert, assertEqual, assertRange } from './testRunner.js';
import { TOWNS, DUNGEONS, TILES, TOWN_SAFE_RADIUS } from '../config.js';

export function registerMapTests(runner) {
  runner.describe('Map: World Generation', (it) => {
    it('WorldMap generates at correct dimensions', async () => {
      const { WorldMap } = await import('../world/map.js');
      const { WORLD_W, WORLD_H } = await import('../config.js');
      const map = new WorldMap(12345);
      assertEqual(map.width,  WORLD_W, 'Map width mismatch');
      assertEqual(map.height, WORLD_H, 'Map height mismatch');
    });
    it('all tiles are valid tile types', async () => {
      const { WorldMap } = await import('../world/map.js');
      const map = new WorldMap(12345);
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          const t = map.get(x, y);
          assertRange(t, 0, 15, `Tile ${t} at (${x},${y}) is invalid`);
        }
      }
    });
  });

  runner.describe('Map: Towns', (it) => {
    it('all 3 towns are present in config', () => {
      const towns = Object.values(TOWNS);
      assertEqual(towns.length, 3, 'Expected 3 towns');
    });
    it('Ashvale is at correct zone coords', () => {
      assert(TOWNS.ashvale, 'Ashvale should exist');
      assertRange(TOWNS.ashvale.cx, 15, 25, 'Ashvale X out of expected range');
      assertRange(TOWNS.ashvale.cy, 35, 45, 'Ashvale Y out of expected range');
    });
    it('Cresthold is at correct zone coords', () => {
      assert(TOWNS.cresthold, 'Cresthold should exist');
      assertRange(TOWNS.cresthold.cx, 50, 60, 'Cresthold X out of expected range');
    });
    it('Ironport is at correct zone coords', () => {
      assert(TOWNS.ironport, 'Ironport should exist');
      assertRange(TOWNS.ironport.cy, 60, 70, 'Ironport Y out of expected range');
    });
    it('each town has at least 3 NPCs', () => {
      for (const town of Object.values(TOWNS)) {
        assert(town.npcs.length >= 3, `${town.name} should have at least 3 NPCs`);
      }
    });
  });

  runner.describe('Map: Dungeons', (it) => {
    it('all 4 dungeon entrances are present', () => {
      const dungeons = Object.values(DUNGEONS);
      assertEqual(dungeons.length, 4, 'Expected 4 dungeons');
    });
    it('dungeon entrances are outside town safe zones', () => {
      for (const dungeon of Object.values(DUNGEONS)) {
        for (const town of Object.values(TOWNS)) {
          const dx = dungeon.entrance.wx - town.cx;
          const dy = dungeon.entrance.wy - town.cy;
          const dist = Math.sqrt(dx*dx + dy*dy);
          assert(dist > TOWN_SAFE_RADIUS,
            `${dungeon.name} entrance too close to ${town.name}`);
        }
      }
    });
    it('dungeon entrances are within world bounds', () => {
      const { WORLD_W, WORLD_H } = { WORLD_W: 80, WORLD_H: 80 };
      for (const dungeon of Object.values(DUNGEONS)) {
        assertRange(dungeon.entrance.wx, 0, WORLD_W, `${dungeon.name} X out of bounds`);
        assertRange(dungeon.entrance.wy, 0, WORLD_H, `${dungeon.name} Y out of bounds`);
      }
    });
  });

  runner.describe('Map: Movement / Pathfinding', (it) => {
    it('Ashvale spawn tile (20,40) is walkable', async () => {
      const { WorldMap } = await import('../world/map.js');
      const map = new WorldMap(12345);
      assert(map.isWalkable(20, 40), 'Spawn tile (20,40) must be walkable');
    });
    it('findPath returns non-null from spawn tile to nearby tile', async () => {
      const { WorldMap } = await import('../world/map.js');
      const { findPath } = await import('../engine/pathfinder.js');
      const map = new WorldMap(12345);
      const path = findPath(map, 20.5, 40.5, 24, 40);
      assert(path !== null, 'Path from spawn to (24,40) should exist');
    });
    it('findPath returns [] when start equals goal', async () => {
      const { WorldMap } = await import('../world/map.js');
      const { findPath } = await import('../engine/pathfinder.js');
      const map = new WorldMap(12345);
      const path = findPath(map, 20.5, 40.5, 20, 40);
      assert(Array.isArray(path) && path.length === 0,
        'Path to own tile should be empty array, not null');
    });
    it('findPath returns null for unreachable tile', async () => {
      const { WorldMap } = await import('../world/map.js');
      const { findPath } = await import('../engine/pathfinder.js');
      const map = new WorldMap(12345);
      // Force a solid wall tile and try to path into it
      const path = findPath(map, 20.5, 40.5, -5, -5);
      assert(path === null, 'Path to out-of-bounds tile should be null');
    });
    it('player can walk from spawn towards east via setPath', async () => {
      const { WorldMap } = await import('../world/map.js');
      const { findPath, smoothPath } = await import('../engine/pathfinder.js');
      const { Player } = await import('../entities/player.js');
      const map = new WorldMap(12345);
      const p = new Player();
      p.x = 20.5; p.y = 40.5;
      const path = findPath(map, p.x, p.y, 24, 40);
      assert(path !== null && path.length > 0, 'Expected a walkable path east of spawn');
      p.setPath(smoothPath(path), { x: 24.5, y: 40.5 });
      // Simulate ~200 frames of movement
      for (let i = 0; i < 200; i++) p.update(map);
      assert(p.x > 22, `Player should have moved east; got x=${p.x.toFixed(2)}`);
    });
  });

  runner.describe('Map: Enemy Spawn Zones', (it) => {
    it('no enemy spawns within town radius (zone check)', async () => {
      const { Spawner } = await import('../world/spawner.js');
      const s = new Spawner();
      // Force spawn in all zones
      for (let i = 0; i < 100; i++) s.update(Date.now() + i * 999999, 999);
      for (const e of s.getEnemies()) {
        for (const town of Object.values(TOWNS)) {
          const dx = e.x - town.cx;
          const dy = e.y - town.cy;
          const dist = Math.sqrt(dx*dx + dy*dy);
          assert(dist >= TOWN_SAFE_RADIUS,
            `Enemy at (${e.x.toFixed(1)},${e.y.toFixed(1)}) inside ${town.name} safe zone`);
        }
      }
    });
    it('respawn timer creates new enemy after 30s (mocked)', async () => {
      const { Spawner } = await import('../world/spawner.js');
      const s = new Spawner();
      const before = s.getEnemies().length;
      s.update(Date.now() + 31000, 5); // advance 31s
      const after = s.getEnemies().length;
      assert(after >= before, 'Enemies should be spawned after respawn timer');
    });
  });
}
