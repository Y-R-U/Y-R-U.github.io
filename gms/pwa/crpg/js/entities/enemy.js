// ===== Enemy Entity & AI =====
import { ENEMIES } from '../config.js';

export class Enemy {
  constructor(typeId, x, y) {
    const def = ENEMIES[typeId] || ENEMIES.goblin;
    this.typeId   = typeId;
    this.id       = `${typeId}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
    this.name     = def.name;
    this.glyph    = def.glyph;
    this.emoji    = def.emoji || null;
    this.color    = def.color;
    this.bgColor  = '#1a0a0a';
    this.x        = x;
    this.y        = y;
    this.hp       = def.hp;
    this.maxHp    = def.hp;
    this.atk      = def.atk;
    this.def      = def.def;
    this.xp       = def.xp;
    this.gold     = def.gold;
    this.loot     = def.loot || [];
    this.speed    = def.speed || 1.0;
    this.aggroRng = def.aggroRng || 4;
    this.boss     = def.boss || false;
    this.ranged   = def.ranged || false;
    this.magic    = def.magic || false;
    this.drains   = def.drains || false;
    this.aoe      = def.aoe || false;
    this.fire     = def.fire || false;
    this.summons  = def.summons || [];
    this.enrageHp = def.enrageHp || 0;
    this.zone     = def.zone || 'overworld';
    this.visible  = true;
    this.type     = 'enemy';
    this.dead     = false;
    this.deathTime= null;
    this.targeted = false;
    this.spawnX   = x;
    this.spawnY   = y;
    this.state    = 'idle'; // idle | aggro | return
    this.attackCooldown = 0;
    this.enraged  = false;
  }

  update(player, dt, worldMap) {
    if (this.dead) return;

    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.sqrt(dx*dx + dy*dy);

    // State machine
    if (dist <= this.aggroRng && !this.dead) {
      this.state = 'aggro';
    } else if (this.state === 'aggro' && dist > this.aggroRng * 2) {
      this.state = 'return';
    }

    const moveSpd = 0.025 * this.speed * dt;

    if (this.state === 'aggro' && dist > 0.9) {
      // Move toward player
      const nx = this.x + (dx / dist) * moveSpd;
      const ny = this.y + (dy / dist) * moveSpd;
      if (worldMap) {
        if (worldMap.isWalkable(nx, this.y)) this.x = nx;
        if (worldMap.isWalkable(this.x, ny)) this.y = ny;
      } else {
        this.x = nx;
        this.y = ny;
      }
    } else if (this.state === 'return') {
      // Return to spawn
      const sdx = this.spawnX - this.x;
      const sdy = this.spawnY - this.y;
      const sd  = Math.sqrt(sdx*sdx + sdy*sdy);
      if (sd > 0.5) {
        this.x += (sdx / sd) * moveSpd;
        this.y += (sdy / sd) * moveSpd;
      } else {
        this.state = 'idle';
      }
    }

    // Enrage check
    if (this.enrageHp > 0 && !this.enraged && this.hp / this.maxHp <= this.enrageHp) {
      this.enraged = true;
      this.atk = Math.floor(this.atk * 1.5);
      this.speed *= 1.3;
      this.color = '#ff0000';
    }
  }

  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) {
      this.dead = true;
      this.deathTime = Date.now();
    }
    return amount;
  }

  inRange(player) {
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    return Math.sqrt(dx*dx + dy*dy) <= this.aggroRng;
  }

  distTo(player) {
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    return Math.sqrt(dx*dx + dy*dy);
  }
}
