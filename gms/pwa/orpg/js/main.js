// ============================================================
// main.js - Game class, game loop, initialization
// ============================================================

import { TILE_SIZE, TILE, ITEMS, ITEM_TYPE, FISH, SKILL, ROOM_W, ROOM_H } from './config.js';
import { Input, Camera, ParticleSystem, Audio } from './engine.js';
import { DungeonRoom } from './world.js';
import { Player, Monster } from './entities.js';
import { CombatSystem, FishingSystem, CookingSystem, WaveSpawner } from './systems.js';
import { Renderer } from './renderer.js';
import { GameUI } from './ui.js';

export class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.setupCanvas();

    this.renderer = new Renderer(this.canvas);
    this.input = new Input(this.canvas);
    this.camera = new Camera(this.canvas.width, this.canvas.height);
    this.particles = new ParticleSystem();
    this.audio = new Audio();

    this.room = new DungeonRoom();
    this.player = new Player(0, 0);
    this.monsters = [];

    this.combat = new CombatSystem(this);
    this.fishing = new FishingSystem(this);
    this.cooking = new CookingSystem(this);
    this.waveSpawner = new WaveSpawner(this);

    this.ui = new GameUI(this);

    this.lastTime = 0;
    this.running = true;
    this.paused = false;

    // Touch controls
    this.longPressTimer = null;
    this.isTouchDevice = ('ontouchstart' in window);
    this.lastTapTime = 0;
    this.setupTouchControls();

    this.init();
  }

  setupCanvas() {
    const resize = () => {
      const container = document.getElementById('game-container');
      const maxW = container.clientWidth;
      const maxH = window.innerHeight * 0.55; // Leave room for UI on mobile
      const gameW = ROOM_W * TILE_SIZE;
      const gameH = ROOM_H * TILE_SIZE;
      const scale = Math.min(maxW / gameW, maxH / gameH, 2);

      this.canvas.width = gameW;
      this.canvas.height = gameH;
      this.canvas.style.width = `${Math.floor(gameW * scale)}px`;
      this.canvas.style.height = `${Math.floor(gameH * scale)}px`;

      // Disable image smoothing for pixel art look
      const ctx = this.canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
    };
    resize();
    window.addEventListener('resize', resize);
  }

  setupTouchControls() {
    let touchStartX, touchStartY, touchStartTime;

    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      touchStartX = (touch.clientX - rect.left) * scaleX;
      touchStartY = (touch.clientY - rect.top) * scaleY;
      touchStartTime = Date.now();

      // Long press detection
      this.longPressTimer = setTimeout(() => {
        // Long press = try to interact (fish, cook, pickup)
        this.handleLongPress(touchStartX, touchStartY);
      }, 500);
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      clearTimeout(this.longPressTimer);
      // If dragging, update move target
      const touch = e.touches[0];
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      const tx = (touch.clientX - rect.left) * scaleX;
      const ty = (touch.clientY - rect.top) * scaleY;
      this.handleTap(tx, ty);
    }, { passive: false });

    this.canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      clearTimeout(this.longPressTimer);
      const elapsed = Date.now() - touchStartTime;

      if (elapsed < 300) {
        // Quick tap
        this.handleTap(touchStartX, touchStartY);
      }
    }, { passive: false });
  }

  handleTap(screenX, screenY) {
    if (!this.player.alive) return;

    // Convert screen to world coordinates
    const worldX = screenX + this.camera.x;
    const worldY = screenY + this.camera.y;

    // Check if tapping a monster
    const monster = this.getMonsterAt(worldX, worldY);
    if (monster) {
      this.player.attackTarget = monster;
      this.player.targetX = monster.x;
      this.player.targetY = monster.y;
      this.player.stopActivity();
      return;
    }

    // Check if tapping a ground item
    const groundItem = this.room.getGroundItemAt(worldX, worldY, TILE_SIZE);
    if (groundItem) {
      this.player.targetX = groundItem.x;
      this.player.targetY = groundItem.y;
      this.player.stopActivity();
      this.player._pickupTarget = groundItem;
      return;
    }

    // Move to tapped location
    const tileX = Math.floor(worldX / TILE_SIZE);
    const tileY = Math.floor(worldY / TILE_SIZE);

    if (this.room.isWalkable(tileX, tileY)) {
      this.player.targetX = tileX * TILE_SIZE;
      this.player.targetY = tileY * TILE_SIZE;
      this.player.attackTarget = null;
      this.player.stopActivity();
    }
  }

  handleLongPress(screenX, screenY) {
    if (!this.player.alive) return;
    const worldX = screenX + this.camera.x;
    const worldY = screenY + this.camera.y;
    const tileX = Math.floor(worldX / TILE_SIZE);
    const tileY = Math.floor(worldY / TILE_SIZE);

    // Check nearby tiles for interactions
    const tile = this.room.tiles[tileY]?.[tileX];

    if (tile === TILE.FISHING_SPOT || tile === TILE.WATER) {
      this.tryFish();
    } else if (tile === TILE.CAMPFIRE) {
      this.tryCook();
    } else {
      // Try pickup
      this.tryPickup();
    }
  }

  init() {
    // Place player
    const start = this.room.getPlayerStart();
    this.player.x = start.x;
    this.player.y = start.y;

    // Start first wave immediately
    this.monsters = [];

    // Init audio on first interaction
    const initAudio = () => {
      this.audio.init();
      document.removeEventListener('click', initAudio);
      document.removeEventListener('touchstart', initAudio);
    };
    document.addEventListener('click', initAudio);
    document.addEventListener('touchstart', initAudio);

    this.ui.addMessage('Welcome to the dungeon! Kill monsters to progress.', '#ff0');
    this.ui.addMessage('Tap to move. Tap monsters to attack.', '#aaa');
    this.ui.addMessage('Find a fishing rod, then tap the water to fish.', '#aaa');
    this.ui.addMessage('Cook fish at the campfire. Eat food to heal.', '#aaa');

    // Load save
    this.loadGame();

    // Start game loop
    requestAnimationFrame((t) => this.gameLoop(t));
  }

  gameLoop(timestamp) {
    if (!this.running) return;
    const dt = Math.min(timestamp - this.lastTime, 50); // Cap at 50ms
    this.lastTime = timestamp;

    if (!this.paused) {
      this.update(dt);
    }
    this.render();

    requestAnimationFrame((t) => this.gameLoop(t));
  }

  update(dt) {
    const now = performance.now();

    // Player input (keyboard)
    this.handleKeyboardInput(dt);

    // Player update
    this.player.update(dt, this.room);

    // Auto-pickup when near items
    if (this.player._pickupTarget) {
      const dx = this.player.x - this.player._pickupTarget.x;
      const dy = this.player.y - this.player._pickupTarget.y;
      if (Math.sqrt(dx * dx + dy * dy) < TILE_SIZE * 1.5) {
        this.tryPickup();
        this.player._pickupTarget = null;
      }
    }

    // Attack target following
    if (this.player.attackTarget && this.player.attackTarget.alive) {
      const target = this.player.attackTarget;
      const dist = this.player.distanceTo(target);

      if (dist <= TILE_SIZE * 1.5) {
        // In range, attack
        this.player.targetX = null;
        this.player.targetY = null;

        // Face target
        if (target.centerX > this.player.centerX) this.player.facing = 1;
        else this.player.facing = -1;

        const result = this.combat.playerAttack(this.player, target, now);
        if (result) {
          if (result.hit) {
            this.particles.emitText(
              target.centerX, target.centerY - 20,
              `${result.damage}`, '#ff4', 14
            );
            this.particles.emit(target.centerX, target.centerY, {
              count: 3, color: '#f44', spread: 2, decay: 0.03,
            });
            this.audio.playHit();
            this.camera.shake(3, 100);

            if (!target.alive) {
              this.onMonsterKill(target);
            }
          } else {
            this.particles.emitText(
              target.centerX, target.centerY - 20,
              'Miss', '#999', 12
            );
          }

          for (const lu of result.levelUps) {
            this.onLevelUp(lu.skill, lu.level);
          }
        }
      } else {
        // Move toward target
        this.player.targetX = target.x;
        this.player.targetY = target.y;
      }
    } else {
      this.player.attackTarget = null;
    }

    // Monster updates
    for (const monster of this.monsters) {
      if (!monster.alive) continue;
      monster.update(dt, this.room, this.player);

      // Monster attacks
      const result = this.combat.monsterAttack(monster, this.player, now);
      if (result) {
        if (result.hit) {
          this.particles.emitText(
            this.player.centerX, this.player.centerY - 20,
            `${result.damage}`, '#f44', 14
          );
          this.particles.emit(this.player.centerX, this.player.centerY, {
            count: 2, color: '#f00', spread: 2, decay: 0.03,
          });
          this.camera.shake(2, 80);
        }
        if (!this.player.alive) {
          this.onPlayerDeath();
        }
      }
    }

    // Fishing
    const fishResult = this.fishing.update(this.player, dt);
    if (fishResult) {
      if (fishResult.success) {
        this.ui.addMessage(`You caught a ${fishResult.fish}! (+${fishResult.xp} Fishing XP)`, '#30a0c0');
        this.particles.emitText(this.player.centerX, this.player.centerY - 30, `+${fishResult.xp} Fish XP`, '#30a0c0', 11);
        this.audio.playFish();
        if (fishResult.levelUp) {
          this.onLevelUp(SKILL.FISHING, fishResult.levelUp);
        }
      } else {
        this.ui.addMessage(fishResult.message, '#f44');
      }
    }

    // Cooking
    const cookResult = this.cooking.update(this.player, dt);
    if (cookResult) {
      if (cookResult.success) {
        if (cookResult.burned) {
          this.ui.addMessage(`You burnt the ${cookResult.fish}!`, '#f44');
        } else {
          this.ui.addMessage(`You cooked the ${cookResult.fish}! (+${cookResult.xp} Cooking XP)`, '#c07030');
          this.particles.emitText(this.player.centerX, this.player.centerY - 30, `+${cookResult.xp} Cook XP`, '#c07030', 11);
          this.audio.playCook();
          if (cookResult.levelUp) {
            this.onLevelUp(SKILL.COOKING, cookResult.levelUp);
          }
        }
      } else {
        this.ui.addMessage(cookResult.message, '#f44');
        this.player.stopActivity();
      }
    }

    // Wave spawner
    const shouldSpawn = this.waveSpawner.update(dt, this.monsters);
    if (shouldSpawn) {
      this.monsters = this.waveSpawner.startNextWave(this.room);
      this.ui.addMessage(`Wave ${this.waveSpawner.currentWave} begins!`, '#ff0');
      this.ui.showNotification(`Wave ${this.waveSpawner.currentWave}`);
      this.audio.playWaveStart();
    }

    // Camera
    this.camera.follow(this.player, ROOM_W * TILE_SIZE, ROOM_H * TILE_SIZE);
    this.camera.update(dt);

    // Particles
    this.particles.update(dt);

    // Renderer time
    this.renderer.update(dt);

    // UI
    this.ui.update(dt);

    // Auto-save periodically
    if (Math.floor(now / 30000) !== Math.floor((now - dt) / 30000)) {
      this.saveGame();
    }
  }

  handleKeyboardInput(dt) {
    const inp = this.input;
    let dx = 0, dy = 0;
    if (inp.isDown('w') || inp.isDown('arrowup')) dy -= 1;
    if (inp.isDown('s') || inp.isDown('arrowdown')) dy += 1;
    if (inp.isDown('a') || inp.isDown('arrowleft')) dx -= 1;
    if (inp.isDown('d') || inp.isDown('arrowright')) dx += 1;

    if (dx !== 0 || dy !== 0) {
      this.player.targetX = this.player.x + dx * TILE_SIZE * 2;
      this.player.targetY = this.player.y + dy * TILE_SIZE * 2;
      this.player.stopActivity();
      this.player.attackTarget = null;
    }

    // Click handling (mouse)
    const click = inp.consumeClick();
    if (click) {
      this.handleTap(click.x, click.y);
    }

    // Tab to toggle inventory
    if (inp.isDown('tab') || inp.isDown('i')) {
      // Already handled via HTML
    }

    // Number keys 1-9 for quick eat
    for (let i = 1; i <= 9; i++) {
      if (inp.isDown(`${i}`)) {
        const slot = i - 1;
        const entry = this.player.inventory[slot];
        if (entry) {
          const item = ITEMS[entry.id];
          if (item?.type === ITEM_TYPE.FISH_COOKED && this.player.hp < this.player.maxHp) {
            this.player.removeFromInventory(slot, 1);
            this.player.heal(item.healAmount);
            this.ui.addMessage(`Ate ${item.name}. Healed ${item.healAmount} HP.`, '#4f4');
            this.audio.playEat();
            this.ui.updatePanel();
          }
        }
        inp.keys[`${i}`] = false;
      }
    }

    // Escape to stop activity
    if (inp.isDown('escape')) {
      this.player.stopActivity();
      this.player.attackTarget = null;
      inp.keys['escape'] = false;
    }
  }

  render() {
    this.renderer.clear();
    this.renderer.drawRoom(this.room, this.camera);
    this.renderer.drawGroundItems(this.room, this.camera);

    // Draw monsters
    for (const monster of this.monsters) {
      if (monster.alive) {
        this.renderer.drawMonster(monster, this.camera);
      }
    }

    // Draw player
    if (this.player.alive) {
      this.renderer.drawPlayer(this.player, this.camera);
    }

    // Lighting
    this.renderer.drawLighting(this.player, this.camera, this.room);

    // Particles (on top of lighting)
    this.particles.draw(this.renderer.ctx, this.camera);

    // Minimap
    this.drawMinimap();
  }

  drawMinimap() {
    const ctx = this.renderer.ctx;
    const scale = 3;
    const ox = 8;
    const oy = this.canvas.height - ROOM_H * scale - 8;

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(ox - 1, oy - 1, ROOM_W * scale + 2, ROOM_H * scale + 2);

    for (let y = 0; y < ROOM_H; y++) {
      for (let x = 0; x < ROOM_W; x++) {
        const tile = this.room.tiles[y][x];
        if (tile === TILE.WALL || tile === TILE.PILLAR) ctx.fillStyle = '#555';
        else if (tile === TILE.WATER) ctx.fillStyle = '#135';
        else if (tile === TILE.CAMPFIRE) ctx.fillStyle = '#f80';
        else if (tile === TILE.FISHING_SPOT) ctx.fillStyle = '#38a';
        else ctx.fillStyle = '#2a2a3a';
        ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
      }
    }

    // Player
    const px = Math.floor(this.player.centerX / TILE_SIZE);
    const py = Math.floor(this.player.centerY / TILE_SIZE);
    ctx.fillStyle = '#0f0';
    ctx.fillRect(ox + px * scale, oy + py * scale, scale, scale);

    // Monsters
    ctx.fillStyle = '#f00';
    for (const m of this.monsters) {
      if (m.alive) {
        const mx = Math.floor(m.centerX / TILE_SIZE);
        const my = Math.floor(m.centerY / TILE_SIZE);
        ctx.fillRect(ox + mx * scale, oy + my * scale, scale, scale);
      }
    }
  }

  // ---- GAME ACTIONS ----

  getMonsterAt(worldX, worldY) {
    for (const m of this.monsters) {
      if (!m.alive) continue;
      if (worldX >= m.x - 8 && worldX <= m.x + m.w + 8 &&
          worldY >= m.y - 8 && worldY <= m.y + m.h + 8) {
        return m;
      }
    }
    return null;
  }

  tryFish() {
    if (!this.player.alive) return;
    if (!this.fishing.canFish(this.player)) {
      this.ui.addMessage('You need a fishing rod to fish!', '#f44');
      return;
    }
    if (!this.fishing.isNearFishingSpot(this.player, this.room)) {
      this.ui.addMessage('Move closer to a fishing spot.', '#f44');
      return;
    }
    if (this.player.inventoryFull()) {
      this.ui.addMessage('Inventory is full!', '#f44');
      return;
    }
    this.player.startFishing();
    this.player.attackTarget = null;
    this.ui.addMessage('You start fishing...', '#30a0c0');
  }

  tryCook() {
    if (!this.player.alive) return;
    if (!this.cooking.canCook(this.player)) {
      this.ui.addMessage('You have no raw fish to cook!', '#f44');
      return;
    }
    if (!this.cooking.isNearCampfire(this.player, this.room)) {
      this.ui.addMessage('Move closer to a campfire.', '#f44');
      return;
    }
    this.player.startCooking();
    this.player.attackTarget = null;
    this.ui.addMessage('You start cooking...', '#c07030');
  }

  tryEat() {
    if (!this.player.alive) return;
    // Find first cooked fish
    for (let i = 0; i < this.player.inventory.length; i++) {
      const entry = this.player.inventory[i];
      if (entry) {
        const item = ITEMS[entry.id];
        if (item?.type === ITEM_TYPE.FISH_COOKED) {
          if (this.player.hp >= this.player.maxHp) {
            this.ui.addMessage('You are already at full health.');
            return;
          }
          this.player.removeFromInventory(i, 1);
          this.player.heal(item.healAmount);
          this.ui.addMessage(`Ate ${item.name}. Healed ${item.healAmount} HP.`, '#4f4');
          this.audio.playEat();
          this.ui.updatePanel();
          return;
        }
      }
    }
    this.ui.addMessage('No cooked food to eat.', '#f44');
  }

  tryPickup() {
    if (!this.player.alive) return;
    const itemId = this.room.pickupGroundItem(this.player.centerX, this.player.centerY, TILE_SIZE * 2);
    if (itemId) {
      const slot = this.player.addToInventory(itemId);
      if (slot >= 0) {
        const item = ITEMS[itemId];
        this.ui.addMessage(`Picked up ${item?.name || itemId}.`, '#ff0');
        this.audio.playPickup();
        this.ui.updatePanel();
      } else {
        // Put it back
        this.room.addGroundItem(itemId, this.player.centerX, this.player.centerY);
        this.ui.addMessage('Inventory is full!', '#f44');
      }
    }
  }

  onMonsterKill(monster) {
    this.waveSpawner.totalKills++;
    this.audio.playKill();

    // Drop loot
    const lootId = monster.rollLoot();
    if (lootId) {
      this.room.addGroundItem(lootId, monster.centerX, monster.centerY);
      const item = ITEMS[lootId];
      this.ui.addMessage(`${monster.name} dropped ${item?.name || lootId}!`, '#ff0');
    }

    // Death particles
    this.particles.emit(monster.centerX, monster.centerY, {
      count: 10, color: '#c33', spread: 4, decay: 0.02, gravity: 0.08,
    });
  }

  onLevelUp(skill, level) {
    this.ui.addMessage(`Congratulations! Your ${skill} level is now ${level}!`, '#ff0');
    this.ui.showNotification(`${skill.charAt(0).toUpperCase() + skill.slice(1)} Level ${level}!`);
    this.audio.playLevelUp();
    this.particles.emit(this.player.centerX, this.player.centerY, {
      count: 15, color: 'gold', spread: 4, vy: -3, decay: 0.015, gravity: 0.02,
    });
  }

  onPlayerDeath() {
    this.ui.addMessage('Oh dear, you are dead!', '#f44');
    this.ui.showDeathScreen();
  }

  respawn() {
    // Reset player
    const start = this.room.getPlayerStart();
    this.player.x = start.x;
    this.player.y = start.y;
    this.player.hp = this.player.maxHp;
    this.player.alive = true;
    this.player.attackTarget = null;
    this.player.targetX = null;
    this.player.targetY = null;
    this.player.stopActivity();

    // Clear inventory (death penalty)
    this.player.inventory.fill(null);

    // Give back starter equipment
    this.player.addToInventory('bronze_sword');
    this.player.equipItem(0);

    // Reset wave
    this.waveSpawner.currentWave = 0;
    this.waveSpawner.waitingForWave = false;
    this.monsters = [];

    // New room
    this.room = new DungeonRoom();

    this.ui.hideDeathScreen();
    this.ui.addMessage('You respawn at the dungeon entrance.', '#ff0');
  }

  // ---- SAVE/LOAD ----
  saveGame() {
    try {
      const save = {
        player: this.player.serialize(),
        wave: this.waveSpawner.currentWave,
        kills: this.waveSpawner.totalKills,
        timestamp: Date.now(),
      };
      localStorage.setItem('orpg_save', JSON.stringify(save));
    } catch (e) {
      console.warn('Failed to save:', e);
    }
  }

  loadGame() {
    try {
      const data = localStorage.getItem('orpg_save');
      if (!data) return;
      const save = JSON.parse(data);
      this.player.deserialize(save.player);
      this.waveSpawner.currentWave = save.wave || 0;
      this.waveSpawner.totalKills = save.kills || 0;
      this.ui.addMessage('Game loaded.', '#aaa');
    } catch (e) {
      console.warn('Failed to load save:', e);
    }
  }
}

// Boot
window.addEventListener('DOMContentLoaded', () => {
  window.game = new Game();
});
