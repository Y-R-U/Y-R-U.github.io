// ============================================================
// entities.js - Player and Monster entities
// ============================================================

import {
  TILE_SIZE, SKILL, SKILL_LIST, XP_TABLE, ITEMS, MONSTERS,
  INVENTORY_SIZE, EQUIP_SLOT, ITEM_TYPE, levelForXp, METAL_TIERS,
  isStackable,
} from './config.js';

// ---- BASE ENTITY ----
export class Entity {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.w = TILE_SIZE - 4;
    this.h = TILE_SIZE - 4;
    this.speed = 2;
    this.targetX = null;
    this.targetY = null;
    this.facing = 1; // 1=right, -1=left
    this.animTime = 0;
    this.alive = true;
    this.hitFlash = 0;
  }

  get centerX() { return this.x + this.w / 2; }
  get centerY() { return this.y + this.h / 2; }

  distanceTo(other) {
    const dx = this.centerX - other.centerX;
    const dy = this.centerY - other.centerY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  moveToward(tx, ty, room) {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 2) return;

    const nx = dx / dist * this.speed;
    const ny = dy / dist * this.speed;

    // Try X movement
    const newX = this.x + nx;
    const tileX1 = Math.floor(newX / TILE_SIZE);
    const tileX2 = Math.floor((newX + this.w) / TILE_SIZE);
    const tileY1 = Math.floor(this.y / TILE_SIZE);
    const tileY2 = Math.floor((this.y + this.h) / TILE_SIZE);
    let canMoveX = true;
    for (let ty2 = tileY1; ty2 <= tileY2; ty2++) {
      for (let tx2 = tileX1; tx2 <= tileX2; tx2++) {
        if (!room.isWalkable(tx2, ty2)) canMoveX = false;
      }
    }
    if (canMoveX) this.x = newX;

    // Try Y movement
    const newY = this.y + ny;
    const tileX3 = Math.floor(this.x / TILE_SIZE);
    const tileX4 = Math.floor((this.x + this.w) / TILE_SIZE);
    const tileY3 = Math.floor(newY / TILE_SIZE);
    const tileY4 = Math.floor((newY + this.h) / TILE_SIZE);
    let canMoveY = true;
    for (let ty2 = tileY3; ty2 <= tileY4; ty2++) {
      for (let tx2 = tileX3; tx2 <= tileX4; tx2++) {
        if (!room.isWalkable(tx2, ty2)) canMoveY = false;
      }
    }
    if (canMoveY) this.y = newY;

    if (nx > 0.1) this.facing = 1;
    if (nx < -0.1) this.facing = -1;
  }

  update(dt) {
    this.animTime += dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
  }
}

// ---- PLAYER ----
export class Player extends Entity {
  constructor(x, y) {
    super(x, y);
    this.speed = 2.5;

    // Skills - store XP, derive levels
    this.xp = {};
    for (const skill of SKILL_LIST) {
      this.xp[skill] = 0;
    }
    this.xp[SKILL.HITPOINTS] = XP_TABLE[10]; // Start at HP 10

    // Combat
    this.hp = 10;
    this.maxHp = 10;
    this.attackTarget = null;
    this.lastAttackTime = 0;
    this.attackSpeed = 2400; // ms between attacks
    this.inCombat = false;
    this.combatTimer = 0;

    // Equipment
    this.equipment = {
      [EQUIP_SLOT.WEAPON]: null,
      [EQUIP_SLOT.SHIELD]: null,
      [EQUIP_SLOT.HELMET]: null,
      [EQUIP_SLOT.BODY]: null,
      [EQUIP_SLOT.LEGS]: null,
    };

    // Inventory (28 slots)
    this.inventory = new Array(INVENTORY_SIZE).fill(null);

    // Activity state
    this.activity = null; // 'fishing', 'cooking', null
    this.activityProgress = 0;
    this.activityTarget = null;

    // Give starter items
    this.addToInventory('bronze_sword');
    this.equipItem(0);
  }

  getLevel(skill) {
    return levelForXp(this.xp[skill]);
  }

  getCombatLevel() {
    const base = (this.getLevel(SKILL.DEFENSE) + this.getLevel(SKILL.HITPOINTS)) * 0.25;
    const melee = (this.getLevel(SKILL.ATTACK) + this.getLevel(SKILL.STRENGTH)) * 0.325;
    return Math.floor(base + melee);
  }

  getAttackBonus() {
    let bonus = 0;
    const weapon = this.equipment[EQUIP_SLOT.WEAPON];
    if (weapon) bonus += ITEMS[weapon]?.attackBonus || 0;
    return bonus;
  }

  getStrengthBonus() {
    let bonus = 0;
    const weapon = this.equipment[EQUIP_SLOT.WEAPON];
    if (weapon) bonus += ITEMS[weapon]?.strengthBonus || 0;
    return bonus;
  }

  getDefenseBonus() {
    let bonus = 0;
    for (const slot of [EQUIP_SLOT.SHIELD, EQUIP_SLOT.HELMET, EQUIP_SLOT.BODY, EQUIP_SLOT.LEGS]) {
      const item = this.equipment[slot];
      if (item) bonus += ITEMS[item]?.defenseBonus || 0;
    }
    return bonus;
  }

  addXp(skill, amount) {
    const oldLevel = this.getLevel(skill);
    this.xp[skill] += amount;
    const newLevel = this.getLevel(skill);
    if (skill === SKILL.HITPOINTS) {
      this.maxHp = newLevel;
    }
    return newLevel > oldLevel ? newLevel : 0; // return new level if leveled up, else 0
  }

  heal(amount) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  takeDamage(amount) {
    this.hp -= amount;
    this.hitFlash = 200;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    }
  }

  // Inventory stores: {id: string, count: number} | null
  // Stackable items merge into one slot; equipment uses count=1

  addToInventory(itemId, amount = 1) {
    // Try to stack with existing
    if (isStackable(itemId)) {
      for (let i = 0; i < INVENTORY_SIZE; i++) {
        const slot = this.inventory[i];
        if (slot && slot.id === itemId) {
          slot.count += amount;
          return i;
        }
      }
    }
    // Find empty slot
    for (let i = 0; i < INVENTORY_SIZE; i++) {
      if (this.inventory[i] === null) {
        this.inventory[i] = { id: itemId, count: amount };
        return i;
      }
    }
    return -1; // Full
  }

  // Remove one item from a slot. Returns the item id or null.
  removeFromInventory(slot, amount = 1) {
    const entry = this.inventory[slot];
    if (!entry) return null;
    const itemId = entry.id;
    entry.count -= amount;
    if (entry.count <= 0) {
      this.inventory[slot] = null;
    }
    return itemId;
  }

  // Remove all items from a slot. Returns {id, count}.
  removeAllFromSlot(slot) {
    const entry = this.inventory[slot];
    if (!entry) return null;
    this.inventory[slot] = null;
    return entry;
  }

  hasItem(itemId) {
    return this.inventory.some(s => s && s.id === itemId);
  }

  hasItemOfType(type) {
    return this.inventory.some(s => s && ITEMS[s.id]?.type === type);
  }

  findItemSlot(itemId) {
    return this.inventory.findIndex(s => s && s.id === itemId);
  }

  findItemSlotOfType(type) {
    return this.inventory.findIndex(s => s && ITEMS[s.id]?.type === type);
  }

  countItem(itemId) {
    let total = 0;
    for (const s of this.inventory) {
      if (s && s.id === itemId) total += s.count;
    }
    return total;
  }

  getSlotItemId(slot) {
    return this.inventory[slot]?.id || null;
  }

  getSlotCount(slot) {
    return this.inventory[slot]?.count || 0;
  }

  inventoryFull() {
    return this.inventory.every(slot => slot !== null);
  }

  equipItem(slot) {
    const entry = this.inventory[slot];
    if (!entry) return false;
    const itemId = entry.id;
    const item = ITEMS[itemId];
    if (!item) return false;

    let eqSlot;
    if (item.type === ITEM_TYPE.WEAPON) eqSlot = EQUIP_SLOT.WEAPON;
    else if (item.type === ITEM_TYPE.SHIELD) eqSlot = EQUIP_SLOT.SHIELD;
    else if (item.type === ITEM_TYPE.HELMET) eqSlot = EQUIP_SLOT.HELMET;
    else if (item.type === ITEM_TYPE.BODY) eqSlot = EQUIP_SLOT.BODY;
    else if (item.type === ITEM_TYPE.LEGS) eqSlot = EQUIP_SLOT.LEGS;
    else return false;

    // Check requirements
    if (item.requiredAttack && this.getLevel(SKILL.ATTACK) < item.requiredAttack) return false;
    if (item.requiredDefense && this.getLevel(SKILL.DEFENSE) < item.requiredDefense) return false;

    // Remove one from the inventory slot
    this.removeFromInventory(slot, 1);

    // If there's currently equipped item, put it back
    const current = this.equipment[eqSlot];
    if (current) {
      this.addToInventory(current);
    }
    this.equipment[eqSlot] = itemId;

    return true;
  }

  unequipItem(eqSlot) {
    const itemId = this.equipment[eqSlot];
    if (!itemId) return false;
    if (this.inventoryFull()) return false;
    this.equipment[eqSlot] = null;
    this.addToInventory(itemId);
    return true;
  }

  startFishing() {
    this.activity = 'fishing';
    this.activityProgress = 0;
  }

  startCooking() {
    this.activity = 'cooking';
    this.activityProgress = 0;
  }

  stopActivity() {
    this.activity = null;
    this.activityProgress = 0;
    this.activityTarget = null;
  }

  update(dt, room) {
    super.update(dt);

    // Update max HP from hitpoints level
    this.maxHp = this.getLevel(SKILL.HITPOINTS);

    // Combat timer
    if (this.inCombat) {
      this.combatTimer -= dt;
      if (this.combatTimer <= 0) {
        this.inCombat = false;
      }
    }

    // Auto-regen when out of combat
    if (!this.inCombat && this.hp < this.maxHp) {
      if (Math.random() < 0.001 * dt) { // Slow regen
        this.hp = Math.min(this.maxHp, this.hp + 1);
      }
    }

    // Move toward target
    if (this.targetX !== null && this.activity === null) {
      this.moveToward(this.targetX, this.targetY, room);
      const dx = this.targetX - this.x;
      const dy = this.targetY - this.y;
      if (Math.sqrt(dx * dx + dy * dy) < 4) {
        this.targetX = null;
        this.targetY = null;
      }
    }
  }

  // Get equipment tier for rendering
  getEquipmentTier() {
    const weapon = this.equipment[EQUIP_SLOT.WEAPON];
    if (!weapon) return null;
    const item = ITEMS[weapon];
    return item?.metalTier || null;
  }

  // Serialize for save
  serialize() {
    return {
      xp: { ...this.xp },
      hp: this.hp,
      equipment: { ...this.equipment },
      inventory: this.inventory.map(s => s ? { id: s.id, count: s.count } : null),
    };
  }

  // Load from save
  deserialize(data) {
    if (data.xp) this.xp = data.xp;
    if (data.hp) this.hp = data.hp;
    if (data.equipment) this.equipment = data.equipment;
    if (data.inventory) {
      // Handle both old format (string[]) and new format ({id,count}[])
      this.inventory = data.inventory.map(s => {
        if (s === null) return null;
        if (typeof s === 'string') return { id: s, count: 1 }; // migrate old saves
        return { id: s.id, count: s.count };
      });
      // Pad to INVENTORY_SIZE
      while (this.inventory.length < INVENTORY_SIZE) this.inventory.push(null);
    }
    this.maxHp = this.getLevel(SKILL.HITPOINTS);
    if (this.hp > this.maxHp) this.hp = this.maxHp;
  }
}

// ---- MONSTER ----
export class Monster extends Entity {
  constructor(type, x, y, waveBonus = 0) {
    super(x, y);
    const def = MONSTERS[type];
    this.type = type;
    this.name = def.name;
    this.level = def.level + waveBonus;
    this.attack = def.attack + waveBonus;
    this.strength = def.strength + waveBonus;
    this.defense = def.defense + Math.floor(waveBonus * 0.7);
    this.maxHp = def.hitpoints + waveBonus * 3;
    this.hp = this.maxHp;
    this.aggroRange = def.aggroRange * TILE_SIZE;
    this.attackRange = def.attackRange * TILE_SIZE;
    this.attackSpeed = def.attackSpeed;
    this.lastAttackTime = 0;
    this.xpMultiplier = def.xpMultiplier;
    this.loot = def.loot;
    this.speed = 1 + Math.min(waveBonus * 0.05, 1);

    this.state = 'idle'; // idle, chase, attack
    this.target = null;
    this.idleTimer = 0;
    this.idleTargetX = x;
    this.idleTargetY = y;
  }

  takeDamage(amount) {
    this.hp -= amount;
    this.hitFlash = 200;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    }
  }

  update(dt, room, player) {
    super.update(dt);
    if (!this.alive) return;

    const distToPlayer = this.distanceTo(player);

    // State machine
    if (distToPlayer < this.aggroRange && player.alive) {
      this.state = 'chase';
      this.target = player;
    }

    switch (this.state) {
      case 'idle':
        this.idleTimer -= dt;
        if (this.idleTimer <= 0) {
          // Pick random nearby point
          this.idleTargetX = this.x + (Math.random() - 0.5) * TILE_SIZE * 3;
          this.idleTargetY = this.y + (Math.random() - 0.5) * TILE_SIZE * 3;
          this.idleTimer = 2000 + Math.random() * 3000;
        }
        this.moveToward(this.idleTargetX, this.idleTargetY, room);
        break;

      case 'chase':
        if (!player.alive || distToPlayer > this.aggroRange * 2) {
          this.state = 'idle';
          break;
        }
        if (distToPlayer <= this.attackRange + this.w) {
          this.state = 'attack';
        } else {
          this.moveToward(player.x, player.y, room);
        }
        break;

      case 'attack':
        if (!player.alive) {
          this.state = 'idle';
          break;
        }
        if (distToPlayer > this.attackRange + this.w + 8) {
          this.state = 'chase';
        }
        // Face player
        if (player.centerX > this.centerX) this.facing = 1;
        else this.facing = -1;
        break;
    }
  }

  // Roll loot drop
  rollLoot() {
    if (!this.loot || this.loot.length === 0) return null;
    // Weighted random
    const totalWeight = this.loot.reduce((sum, l) => sum + l.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const entry of this.loot) {
      roll -= entry.weight;
      if (roll <= 0) return entry.id;
    }
    return null;
  }
}
