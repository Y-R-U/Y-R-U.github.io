// ===== State Tests =====
import { assert, assertEqual } from './testRunner.js';
import { resetGame, getState, saveGame, loadGame, addToBackpack } from '../state.js';

export function registerStateTests(runner) {
  runner.describe('State: Save / Load', (it) => {
    it('save game writes to localStorage', () => {
      resetGame();
      const result = saveGame();
      assert(result, 'saveGame should return true');
      assert(localStorage.getItem('crpg_save_v1') !== null, 'Save should be in localStorage');
    });
    it('save then load returns identical player gold', () => {
      resetGame();
      getState().player.gold = 999;
      saveGame();
      resetGame(); // Clear memory
      loadGame();
      assertEqual(getState().player.gold, 999, 'Gold should be restored after load');
    });
    it('save then load returns identical skill levels', () => {
      resetGame();
      getState().player.skills.fishing.level = 42;
      saveGame();
      resetGame();
      loadGame();
      assertEqual(getState().player.skills.fishing.level, 42, 'Fishing level should be restored');
    });
    it('save then load restores inventory', () => {
      resetGame();
      addToBackpack('iron_sword', 1);
      saveGame();
      resetGame();
      loadGame();
      const st = getState();
      const slot = st.inventory.backpack.find(s => s && s.id === 'iron_sword');
      assert(slot !== undefined && slot !== null, 'Iron sword should be in backpack after load');
    });
    it('corrupted save falls back to fresh state', () => {
      localStorage.setItem('crpg_save_v1', 'CORRUPTED{{{');
      const result = loadGame();
      assert(!result || getState().player.gold === 0, 'Corrupted save should fall back to fresh state');
      localStorage.removeItem('crpg_save_v1');
    });
  });

  runner.describe('State: Integrity', (it) => {
    it('fresh state has all skill keys', () => {
      resetGame();
      const st = getState();
      const { SKILLS } = _cfg;
      if (SKILLS) {
        for (const id of Object.keys(SKILLS)) {
          assert(st.player.skills[id], `Skill ${id} missing from state`);
        }
      }
    });
    it('backpack has correct slot count', () => {
      resetGame();
      const st = getState();
      assertEqual(st.inventory.backpack.length, 28, 'Backpack should have 28 slots');
    });
    it('equipped slots have correct keys', () => {
      resetGame();
      const st = getState();
      const expectedSlots = ['head','chest','legs','hands','feet','ring','amulet','weapon','offhand'];
      for (const slot of expectedSlots) {
        assert(slot in st.inventory.equipped, `Missing equip slot: ${slot}`);
      }
    });
  });
}

let _cfg = {};
import('../config.js').then(m => { _cfg = m; });
