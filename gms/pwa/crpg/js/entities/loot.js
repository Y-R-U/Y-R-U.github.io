// ===== Loot Roll System =====
import { ITEMS } from '../config.js';

/**
 * Roll loot from an enemy's loot table.
 * Returns array of {id, qty} drops.
 */
export function rollLoot(enemy) {
  const drops = [];
  if (!enemy.loot || !enemy.loot.length) return drops;

  for (const entry of enemy.loot) {
    if (Math.random() < (entry.chance || 0)) {
      const qty = entry.qty || 1;
      drops.push({ id: entry.id, qty });
    }
  }
  return drops;
}

/**
 * Generate a random item from a loot tier.
 * tier: 'common' | 'uncommon' | 'rare' | 'legendary'
 */
export function randomItemByTier(tier) {
  const pools = {
    common:    ['bronze_sword','leather_armour','shrimp','arrows','bones'],
    uncommon:  ['iron_sword','iron_platebody','trout','health_potion','iron_shield'],
    rare:      ['steel_sword','plate_chest','lobster','strength_potion'],
    legendary: ['mithril_sword','dragon_sword','lich_staff','dragon_scale_set'],
  };
  const pool = pools[tier] || pools.common;
  const id   = pool[Math.floor(Math.random() * pool.length)];
  return { id, qty: 1 };
}

export function getItemDef(id) {
  return ITEMS[id] || null;
}
