// ===== Loot Roll System =====
import { ITEMS } from '../config.js';

/**
 * Roll loot from an enemy's loot table, plus a tier-based bonus random item.
 * Returns array of {id, qty} drops.
 */
export function rollLoot(enemy) {
  const drops = [];

  // 1. Fixed loot table rolls (e.g. always-drops, rare-specific items)
  for (const entry of (enemy.loot || [])) {
    if (Math.random() < (entry.chance || 0)) {
      drops.push({ id: entry.id, qty: entry.qty || 1 });
    }
  }

  // 2. Tier-based bonus random item drop
  const bonus = _tierDrop(enemy.xp || 0, !!enemy.boss);
  if (bonus) drops.push(bonus);

  return drops;
}

/**
 * Roll a bonus item based on enemy power tier.
 * Separate from the fixed loot table so every enemy has a drop chance.
 */
function _tierDrop(xp, isBoss) {
  if (isBoss) {
    // Bosses get one guaranteed rare AND a 50% chance at legendary
    const drops = [randomItemByTier('rare')];
    if (Math.random() < 0.5) drops.push(randomItemByTier('legendary'));
    // Return just the first here; _onEnemyKill will show each separately
    return drops[0];
  }

  const r = Math.random();
  if (xp <= 15) {
    // Trivial (rat, cave_bat)
    if (r < 0.12) return randomItemByTier('common');
  } else if (xp <= 35) {
    // Easy (goblin, wolf, skeleton, zombie)
    if (r < 0.22) return randomItemByTier('common');
    if (r < 0.27) return randomItemByTier('uncommon');
  } else if (xp <= 80) {
    // Medium (ghost, bandit, troll, goblin_shaman, ice_wraith, wraith_lord)
    if (r < 0.32) return randomItemByTier('common');
    if (r < 0.42) return randomItemByTier('uncommon');
    if (r < 0.44) return randomItemByTier('rare');
  } else {
    // Hard (dark_knight, dragonling, frost_elemental)
    if (r < 0.42) return randomItemByTier('common');
    if (r < 0.62) return randomItemByTier('uncommon');
    if (r < 0.67) return randomItemByTier('rare');
  }
  return null;
}

/**
 * Generate a random item from a loot tier.
 * tier: 'common' | 'uncommon' | 'rare' | 'legendary'
 */
export function randomItemByTier(tier) {
  const pools = {
    common:    ['bronze_sword','leather_armour','shrimp','arrows','bones','leather_cap'],
    uncommon:  ['iron_sword','iron_platebody','trout','health_potion','iron_shield','iron_helm'],
    rare:      ['steel_sword','plate_chest','lobster','strength_potion','defence_potion','steel_shield'],
    legendary: ['mithril_sword','dragon_sword','lich_staff','dragon_scale_set','frost_crown','plate_helm'],
  };
  const pool = pools[tier] || pools.common;
  const id   = pool[Math.floor(Math.random() * pool.length)];
  return { id, qty: 1 };
}

export function getItemDef(id) {
  return ITEMS[id] || null;
}
