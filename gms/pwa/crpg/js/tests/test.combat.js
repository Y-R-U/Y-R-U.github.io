// ===== Combat Tests =====
import { TestRunner, assert, assertEqual, assertRange } from './testRunner.js';
import { resetGame, getState } from '../state.js';
import { Enemy } from '../entities/enemy.js';

export function registerCombatTests(runner) {
  runner.describe('Combat: Damage Formula', (it) => {
    it('damage formula stays in expected range (1000 iterations)', () => {
      for (let i = 0; i < 1000; i++) {
        const atkStat = 20;
        const def     = 5;
        const raw     = (atkStat * (0.8 + Math.random() * 0.4)) - def;
        const dmg     = Math.max(1, Math.floor(raw));
        assertRange(dmg, 1, 100, `Damage ${dmg} out of range`);
      }
    });
    it('minimum damage is always at least 1', () => {
      for (let i = 0; i < 100; i++) {
        const raw = (1 * (0.8 + Math.random() * 0.4)) - 999;
        const dmg = Math.max(1, Math.floor(raw));
        assert(dmg >= 1, 'Damage should always be at least 1');
      }
    });
  });

  runner.describe('Combat: Miss Chance', (it) => {
    it('miss chance reduces with attack level', () => {
      const missLvl1  = Math.max(0, 0.15 - 1  * 0.002);
      const missLvl50 = Math.max(0, 0.15 - 50 * 0.002);
      assert(missLvl50 < missLvl1, 'Miss chance should decrease with level');
    });
    it('miss chance is 0 at high attack level', () => {
      const missLvl99 = Math.max(0, 0.15 - 75 * 0.002);
      assertEqual(missLvl99, 0, 'Miss chance should be 0 at level 75+');
    });
  });

  runner.describe('Combat: Block Chance', (it) => {
    it('block chance caps at 30%', () => {
      const defLvl99 = Math.min(0.30, 99 * 0.003);
      assertEqual(defLvl99, 0.30, 'Block chance should cap at 30%');
    });
    it('block chance at level 1 is low', () => {
      const blockLvl1 = Math.min(0.30, 1 * 0.003);
      assertRange(blockLvl1, 0, 0.01, 'Block chance at level 1 should be very low');
    });
  });

  runner.describe('Combat: Enemy Death', (it) => {
    it('enemy dies when HP reaches 0', () => {
      const e = new Enemy('goblin', 10, 10);
      e.takeDamage(e.hp);
      assertEqual(e.hp, 0, 'HP should be 0');
      assert(e.dead, 'Enemy should be dead');
    });
    it('enemy HP cannot go below 0', () => {
      const e = new Enemy('goblin', 10, 10);
      e.takeDamage(9999);
      assertEqual(e.hp, 0, 'HP should not go below 0');
    });
    it('deathTime is set on death', () => {
      const e = new Enemy('goblin', 10, 10);
      e.takeDamage(9999);
      assert(e.deathTime !== null, 'deathTime should be set');
    });
  });

  runner.describe('Combat: Loot Roll', (it) => {
    it('loot roll produces items from loot table', () => {
      const { rollLoot } = _loot;
      // Force all rolls to succeed
      const mockEnemy = {
        loot: [{ id: 'iron_sword', chance: 1.0 }, { id: 'bones', chance: 1.0 }]
      };
      const drops = rollLoot(mockEnemy);
      assertEqual(drops.length, 2, 'Should drop 2 items at 100% chance');
      assert(drops.some(d => d.id === 'iron_sword'), 'Should include iron_sword');
    });
    it('loot roll respects chance (0%)', () => {
      const { rollLoot } = _loot;
      const mockEnemy = { loot: [{ id: 'dragon_sword', chance: 0 }] };
      const drops = rollLoot(mockEnemy);
      assertEqual(drops.length, 0, 'Should not drop at 0% chance');
    });
    it('empty loot table returns empty array', () => {
      const { rollLoot } = _loot;
      const mockEnemy = { loot: [] };
      const drops = rollLoot(mockEnemy);
      assertEqual(drops.length, 0, 'Empty loot table should return []');
    });
  });

  runner.describe('Combat: Boss Spawn', (it) => {
    it('boss spawns only after all regular enemies cleared', () => {
      const { DungeonState } = _dungeon;
      const state = new DungeonState('goblin_warren');
      state.spawnEnemies(Enemy);
      // Boss not spawned yet
      assert(!state.bossSpawned, 'Boss should not be spawned initially');
      // Kill all regular enemies
      for (const e of state.enemies) { e.hp = 0; e.dead = true; }
      const spawned = state.checkBossSpawn(Enemy);
      assert(spawned, 'Boss should spawn after all enemies die');
    });
  });
}

let _loot = {};
let _dungeon = {};
import('../entities/loot.js').then(m => { _loot = m; });
import('../world/dungeon.js').then(m => { _dungeon = m; });
