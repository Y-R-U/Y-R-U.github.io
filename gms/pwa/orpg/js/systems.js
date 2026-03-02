// ============================================================
// systems.js - Combat, Skills, Fishing, Cooking, Wave spawning
// ============================================================

import {
  SKILL, MONSTERS, FISH, ITEMS, ITEM_TYPE, WAVE_CONFIG,
  TILE_SIZE, TILE, EQUIP_SLOT, getAvailableFish,
} from './config.js';
import { Monster } from './entities.js';

// ---- COMBAT SYSTEM ----
export class CombatSystem {
  constructor(game) {
    this.game = game;
  }

  // Calculate if attack hits
  rollAccuracy(attackerAtk, defenderDef) {
    const effectiveAttack = attackerAtk + 8;
    const effectiveDef = defenderDef + 8;
    const hitChance = effectiveAttack / (effectiveAttack + effectiveDef);
    return Math.random() < hitChance;
  }

  // Calculate damage
  rollDamage(strength, strengthBonus) {
    const maxHit = Math.floor(0.5 + strength * (strengthBonus + 64) / 640);
    return Math.max(1, Math.floor(Math.random() * (maxHit + 1)));
  }

  // Player attacks monster
  playerAttack(player, monster, now) {
    if (now - player.lastAttackTime < player.attackSpeed) return null;
    player.lastAttackTime = now;
    player.inCombat = true;
    player.combatTimer = 5000;

    const attackLevel = player.getLevel(SKILL.ATTACK);
    const attackBonus = player.getAttackBonus();
    const effectiveAttack = attackLevel + attackBonus;

    if (this.rollAccuracy(effectiveAttack, monster.defense)) {
      const strengthLevel = player.getLevel(SKILL.STRENGTH);
      const strengthBonus = player.getStrengthBonus();
      const damage = this.rollDamage(strengthLevel, strengthBonus);
      monster.takeDamage(damage);

      // XP rewards
      const xpGain = Math.floor(damage * 4 * monster.xpMultiplier);
      const results = {
        hit: true,
        damage,
        levelUps: [],
      };

      // Combat XP split: attack, strength, hitpoints
      const atkLvl = player.addXp(SKILL.ATTACK, Math.floor(xpGain * 0.33));
      const strLvl = player.addXp(SKILL.STRENGTH, Math.floor(xpGain * 0.33));
      const defLvl = player.addXp(SKILL.DEFENSE, Math.floor(xpGain * 0.16));
      const hpLvl = player.addXp(SKILL.HITPOINTS, Math.floor(xpGain * 0.133));

      if (atkLvl) results.levelUps.push({ skill: SKILL.ATTACK, level: atkLvl });
      if (strLvl) results.levelUps.push({ skill: SKILL.STRENGTH, level: strLvl });
      if (defLvl) results.levelUps.push({ skill: SKILL.DEFENSE, level: defLvl });
      if (hpLvl) results.levelUps.push({ skill: SKILL.HITPOINTS, level: hpLvl });

      return results;
    }

    return { hit: false, damage: 0, levelUps: [] };
  }

  // Monster attacks player
  monsterAttack(monster, player, now) {
    if (now - monster.lastAttackTime < monster.attackSpeed) return null;
    if (monster.state !== 'attack') return null;
    monster.lastAttackTime = now;
    player.inCombat = true;
    player.combatTimer = 5000;

    const defenseLevel = player.getLevel(SKILL.DEFENSE);
    const defenseBonus = player.getDefenseBonus();
    const effectiveDef = defenseLevel + defenseBonus;

    if (this.rollAccuracy(monster.attack, effectiveDef)) {
      const damage = this.rollDamage(monster.strength, 0);
      player.takeDamage(damage);
      return { hit: true, damage };
    }
    return { hit: false, damage: 0 };
  }
}

// ---- FISHING SYSTEM ----
export class FishingSystem {
  constructor(game) {
    this.game = game;
    this.fishingTime = 3000; // ms to catch a fish
    this.lastFishTime = 0;
  }

  canFish(player) {
    // Need a fishing rod equipped or in inventory
    return player.hasItem('fishing_rod') ||
           player.equipment[EQUIP_SLOT.WEAPON] === 'fishing_rod';
  }

  isNearFishingSpot(player, room) {
    const px = Math.floor(player.centerX / TILE_SIZE);
    const py = Math.floor(player.centerY / TILE_SIZE);
    // Check adjacent tiles for fishing spot or water
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tx = px + dx;
        const ty = py + dy;
        if (tx >= 0 && tx < room.width && ty >= 0 && ty < room.height) {
          const tile = room.tiles[ty][tx];
          if (tile === TILE.FISHING_SPOT || tile === TILE.WATER) {
            return true;
          }
        }
      }
    }
    return false;
  }

  update(player, dt) {
    if (player.activity !== 'fishing') return null;

    player.activityProgress += dt;
    if (player.activityProgress >= this.fishingTime) {
      player.activityProgress = 0;

      if (player.inventoryFull()) {
        player.stopActivity();
        return { success: false, message: 'Inventory is full!' };
      }

      const fishingLevel = player.getLevel(SKILL.FISHING);
      const available = getAvailableFish(fishingLevel);

      if (available.length === 0) {
        return { success: false, message: 'No fish available at your level.' };
      }

      // Pick random fish weighted toward higher level ones you can catch
      const fish = available[Math.floor(Math.random() * available.length)];
      const fishDef = FISH[fish];

      // Add raw fish to inventory
      const slot = player.addToInventory(`raw_${fish}`);
      if (slot === -1) {
        player.stopActivity();
        return { success: false, message: 'Inventory is full!' };
      }

      // Grant fishing XP
      const levelUp = player.addXp(SKILL.FISHING, fishDef.xp);

      return {
        success: true,
        fish: fishDef.name,
        xp: fishDef.xp,
        levelUp: levelUp || 0,
      };
    }
    return null;
  }
}

// ---- COOKING SYSTEM ----
export class CookingSystem {
  constructor(game) {
    this.game = game;
    this.cookTime = 2000; // ms to cook
  }

  canCook(player) {
    return player.hasItemOfType(ITEM_TYPE.FISH_RAW);
  }

  isNearCampfire(player, room) {
    const px = Math.floor(player.centerX / TILE_SIZE);
    const py = Math.floor(player.centerY / TILE_SIZE);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tx = px + dx;
        const ty = py + dy;
        if (tx >= 0 && tx < room.width && ty >= 0 && ty < room.height) {
          if (room.tiles[ty][tx] === TILE.CAMPFIRE) return true;
        }
      }
    }
    return false;
  }

  update(player, dt) {
    if (player.activity !== 'cooking') return null;

    player.activityProgress += dt;
    if (player.activityProgress >= this.cookTime) {
      player.activityProgress = 0;

      // Find first raw fish in inventory
      const rawSlot = player.findItemSlotOfType(ITEM_TYPE.FISH_RAW);
      if (rawSlot === -1) {
        player.stopActivity();
        return { success: false, message: 'No raw fish to cook.' };
      }

      const rawItemId = player.getSlotItemId(rawSlot);
      const rawItem = ITEMS[rawItemId];
      if (!rawItem || !rawItem.fishType) {
        player.stopActivity();
        return { success: false, message: 'No raw fish to cook.' };
      }
      const fishType = rawItem.fishType;
      const fishDef = FISH[fishType];

      // Check cooking level for burn chance
      const cookingLevel = player.getLevel(SKILL.COOKING);
      let burned = false;

      if (cookingLevel < fishDef.burnStop) {
        // Burn chance decreases with level
        const burnChance = Math.max(0.05, (fishDef.burnStop - cookingLevel) / (fishDef.burnStop - fishDef.cookLevel + 1));
        burned = Math.random() < burnChance;
      }

      // Remove one raw fish, add cooked/burnt
      player.removeFromInventory(rawSlot, 1);
      const resultItemId = burned ? `burnt_${fishType}` : `cooked_${fishType}`;
      const addResult = player.addToInventory(resultItemId);
      if (addResult === -1) {
        // Inventory full - put the raw fish back
        player.addToInventory(rawItemId);
        player.stopActivity();
        return { success: false, message: 'Inventory is full!' };
      }

      if (burned) {
        return {
          success: true,
          burned: true,
          fish: fishDef.name,
          xp: 0,
          levelUp: 0,
        };
      } else {
        const levelUp = player.addXp(SKILL.COOKING, fishDef.cookXp);
        return {
          success: true,
          burned: false,
          fish: fishDef.name,
          xp: fishDef.cookXp,
          levelUp: levelUp || 0,
        };
      }
    }
    return null;
  }
}

// ---- WAVE SPAWNER ----
export class WaveSpawner {
  constructor(game) {
    this.game = game;
    this.currentWave = 0;
    this.waveDelay = 3000; // ms between waves
    this.waveTimer = 0;
    this.waitingForWave = false;
    this.totalKills = 0;
  }

  checkWaveClear(monsters) {
    return monsters.every(m => !m.alive);
  }

  startNextWave(room) {
    this.currentWave++;
    const monsters = [];

    // Find applicable wave configs
    const configs = WAVE_CONFIG.filter(
      c => this.currentWave >= c.minWave && this.currentWave <= c.maxWave
    );

    if (configs.length === 0) {
      // Default to hardest
      const config = WAVE_CONFIG[WAVE_CONFIG.length - 1];
      configs.push(config);
    }

    // Pick a config
    const config = configs[Math.floor(Math.random() * configs.length)];
    const count = config.count[0] + Math.floor(Math.random() * (config.count[1] - config.count[0] + 1));

    // Wave bonus scales with wave number
    const waveBonus = Math.floor(this.currentWave / 3);

    for (let i = 0; i < count; i++) {
      const type = config.monsters[Math.floor(Math.random() * config.monsters.length)];
      const spawnPoint = room.spawnPoints[Math.floor(Math.random() * room.spawnPoints.length)];
      if (spawnPoint) {
        const m = new Monster(
          type,
          spawnPoint.x * TILE_SIZE + Math.random() * 8,
          spawnPoint.y * TILE_SIZE + Math.random() * 8,
          waveBonus
        );
        monsters.push(m);
      }
    }

    return monsters;
  }

  update(dt, monsters) {
    if (this.waitingForWave) {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) {
        this.waitingForWave = false;
        return true; // spawn next wave
      }
    } else if (this.checkWaveClear(monsters)) {
      this.waitingForWave = true;
      this.waveTimer = this.currentWave === 0 ? 500 : this.waveDelay;
    }
    return false;
  }
}
