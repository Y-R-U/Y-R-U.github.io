// ===== Inventory Tests =====
import { assert, assertEqual } from './testRunner.js';
import { resetGame, getState, addToBackpack, removeFromBackpack, hasItem, equipItem, unequipItem, getEquipBonus } from '../state.js';
import { ITEMS } from '../config.js';

export function registerInventoryTests(runner) {
  runner.describe('Inventory: Backpack', (it) => {
    it('addToBackpack adds item to empty slot', () => {
      resetGame();
      addToBackpack('shrimp', 1);
      assert(hasItem('shrimp'), 'Should have shrimp');
    });
    it('stackable items stack in same slot', () => {
      resetGame();
      addToBackpack('shrimp', 3);
      addToBackpack('shrimp', 5);
      const st = getState();
      const slot = st.inventory.backpack.find(s => s && s.id === 'shrimp');
      assertEqual(slot?.qty, 8, 'Shrimp should stack to 8');
    });
    it('removeFromBackpack removes item', () => {
      resetGame();
      addToBackpack('shrimp', 2);
      removeFromBackpack('shrimp', 1);
      const st = getState();
      const slot = st.inventory.backpack.find(s => s && s.id === 'shrimp');
      assertEqual(slot?.qty, 1, 'Should have 1 shrimp left');
    });
    it('hasItem returns false when item absent', () => {
      resetGame();
      assert(!hasItem('dragon_sword'), 'Should not have dragon sword');
    });
  });

  runner.describe('Inventory: Equipment', (it) => {
    it('item equips to correct slot', () => {
      resetGame();
      addToBackpack('iron_sword', 1);
      const itemDef = ITEMS.iron_sword;
      equipItem(itemDef, 'weapon');
      const st = getState();
      assertEqual(st.inventory.equipped.weapon?.id, 'iron_sword', 'Iron sword should be equipped in weapon slot');
    });
    it('equipping removes item from backpack', () => {
      resetGame();
      addToBackpack('iron_sword', 1);
      equipItem(ITEMS.iron_sword, 'weapon');
      assert(!hasItem('iron_sword'), 'Iron sword should be removed from backpack');
    });
    it('two items cannot occupy same slot', () => {
      resetGame();
      addToBackpack('iron_sword', 1);
      addToBackpack('bronze_sword', 1);
      equipItem(ITEMS.iron_sword, 'weapon');
      equipItem(ITEMS.bronze_sword, 'weapon');
      const st = getState();
      assertEqual(st.inventory.equipped.weapon?.id, 'bronze_sword', 'Bronze sword should replace iron sword');
      assert(hasItem('iron_sword'), 'Iron sword should return to backpack');
    });
    it('unequip removes stat bonus', () => {
      resetGame();
      addToBackpack('iron_sword', 1);
      equipItem(ITEMS.iron_sword, 'weapon');
      const bonusOn = getEquipBonus('atk');
      assert(bonusOn > 0, 'ATK bonus should be positive while equipped');
      unequipItem('weapon');
      const bonusOff = getEquipBonus('atk');
      assertEqual(bonusOff, 0, 'ATK bonus should be 0 after unequip');
    });
    it('equip applies stat bonus', () => {
      resetGame();
      addToBackpack('plate_chest', 1);
      const before = getEquipBonus('def');
      equipItem(ITEMS.plate_chest, 'chest');
      const after = getEquipBonus('def');
      assert(after > before, 'DEF bonus should increase after equip');
    });
  });
}
