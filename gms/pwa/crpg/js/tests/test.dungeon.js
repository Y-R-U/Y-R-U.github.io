// ===== Dungeon Tests =====
import { assert, assertEqual, assertRange } from './testRunner.js';
import { DUNGEONS } from '../config.js';

export function registerDungeonTests(runner) {
  runner.describe('Dungeon: Room Generation', (it) => {
    it('room generates within bounds for each dungeon', async () => {
      const { DungeonMap } = await import('../world/dungeon.js');
      for (const [id, cfg] of Object.entries(DUNGEONS)) {
        const map = new DungeonMap(id);
        assertEqual(map.width,  cfg.w, `${id} width mismatch`);
        assertEqual(map.height, cfg.h, `${id} height mismatch`);
      }
    });
    it('all floor tiles are within map bounds', async () => {
      const { DungeonMap } = await import('../world/dungeon.js');
      const { TILES } = await import('../config.js');
      const map = new DungeonMap('goblin_warren');
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          const t = map.get(x, y);
          assertRange(t, 0, 15, `Tile ${t} at (${x},${y}) out of range`);
        }
      }
    });
    it('exit tile is locked on entry', async () => {
      const { DungeonMap } = await import('../world/dungeon.js');
      const map = new DungeonMap('goblin_warren');
      assert(map.exitLocked, 'Exit should be locked initially');
    });
    it('exit tile unlocks after boss death', async () => {
      const { DungeonMap } = await import('../world/dungeon.js');
      const { TILES } = await import('../config.js');
      const map = new DungeonMap('goblin_warren');
      map.unlockExit();
      assert(!map.exitLocked, 'Exit should be unlocked');
      assertEqual(map.get(map.exitTile.x, map.exitTile.y), TILES.EXIT, 'Exit tile should be EXIT type');
    });
  });

  runner.describe('Dungeon: Enemy Count', (it) => {
    it('enemy count is within tier min/max for goblin_warren', async () => {
      const { DungeonMap } = await import('../world/dungeon.js');
      const cfg = DUNGEONS.goblin_warren;
      const [min, max] = cfg.enemyCount;
      // Run 10 times for statistical confidence
      for (let i = 0; i < 10; i++) {
        const map = new DungeonMap('goblin_warren');
        assertRange(map.enemySpawns.length, min, max + 1,
          `Enemy count ${map.enemySpawns.length} not in [${min},${max}]`);
      }
    });
    it('enemy types are valid for each dungeon', async () => {
      const { DungeonMap } = await import('../world/dungeon.js');
      for (const [id, cfg] of Object.entries(DUNGEONS)) {
        const map = new DungeonMap(id);
        for (const sp of map.enemySpawns) {
          assert(cfg.enemies.includes(sp.type), `Invalid enemy type: ${sp.type} for ${id}`);
        }
      }
    });
  });

  runner.describe('Dungeon: Boss', (it) => {
    it('each dungeon has a boss defined', () => {
      for (const [id, cfg] of Object.entries(DUNGEONS)) {
        assert(cfg.boss, `Dungeon ${id} has no boss`);
      }
    });
    it('difficulty warning stars match config', () => {
      for (const [id, cfg] of Object.entries(DUNGEONS)) {
        assertRange(cfg.stars, 1, 5, `${id} stars out of range`);
      }
    });
  });
}
